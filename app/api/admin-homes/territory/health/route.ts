// app/api/admin-homes/territory/health/route.ts
// W-TERRITORY-OPS T1-2 -- GET endpoint that returns resolver_health_check payload.
//
// Returns the 10-key jsonb shape locked in T0-1:
//   tenant_id, selling_agent_count, active_agent_count, tenant_default,
//   total_active_cards, phantom_cards, stale_agent_cards, orphan_buildings,
//   disaster_state, health_grade
//
// Multi-tenant safe: tenant_id derived from authed user OR ?tenant_id= override
// gated on isPlatformAdmin OR tenant_manager_assignments membership.
//
// Auth pattern copied verbatim from cards/cleanup/route.ts (shipped 2026-05-24).
// No new permission keys invented; same scope-via-tenant-membership model.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { Client } from 'pg'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function resolveTenantId(req: NextRequest): Promise<{ tenantId: string | null; error?: { status: number; msg: string } }> {
  const user = await resolveAdminHomesUser()
  if (!user) return { tenantId: null, error: { status: 401, msg: 'unauthorized' } }
  const override = req.nextUrl.searchParams.get('tenant_id')
  if (override) {
    if (!UUID_RE.test(override)) return { tenantId: null, error: { status: 400, msg: 'bad tenant_id' } }
    if (user.isPlatformAdmin) return { tenantId: override }
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return { tenantId: null, error: { status: 401, msg: 'unauthorized' } }
    const { data: a } = await supabase.from('tenant_manager_assignments')
      .select('tenant_id').eq('user_id', authUser.id).eq('tenant_id', override)
      .is('revoked_at', null).maybeSingle()
    if (!a) return { tenantId: null, error: { status: 403, msg: 'forbidden' } }
    return { tenantId: override }
  }
  return { tenantId: user.tenantId }
}

export async function GET(req: NextRequest) {
  const { tenantId, error } = await resolveTenantId(req)
  if (error) return NextResponse.json({ error: error.msg }, { status: error.status })
  if (!tenantId) return NextResponse.json({ error: 'no tenant scope' }, { status: 400 })

  const s = svc()
  const { data, error: rpcErr } = await s.rpc('resolver_health_check', { p_tenant_id: tenantId })
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message || 'rpc failed' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'rpc returned no data' }, { status: 500 })
  }

  // P-DASHBOARD GAP-B + GAP-D (revised after the post-build smoke surfaced
  // false-green): both reads now use pg-direct as postgres. Bypasses two
  // separate service_role failure modes confirmed by recon:
  //   - tenant_floor_alerts has postgres-only grants (third sibling table
  //     after tenant_floor_pool [Landing 1] and territory_reroll_queue
  //     [Event 4]). PostgREST under service_role returns 42501 permission
  //     denied.
  //   - mls_listings COUNT(*) WHERE assigned_agent_id IS NULL via PostgREST
  //     returns status 500 with empty error body (likely the 8s authenticator
  //     statement_timeout on a 1.3M-row scan). Direct SQL under service_role
  //     SUCCEEDS in <100ms; the issue is PostgREST-specific.
  // pg-direct as postgres has full grants on both tables, no 8s ceiling.
  //
  // FALSE-GREEN FIX: on query failure, return `null` (NOT [] / {0,0,0,0}).
  // The frontend distinguishes "could not read" (null) from "confirmed
  // empty" ([] or 0). Healthy zero must not be visually identical to a
  // failed query. See F-FALSE-GREEN-VIA-SILENT-SOFT-FAIL.
  const warnings: string[] = []
  let floor_alerts: Array<{ id: string; tenant_id: string; property_type: string | null; listing_id: string | null; alert_type: string; created_at: string }> | null = null
  let null_cache_count: { total: number; condo: number; home: number; other: number } | null = null

  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) {
    warnings.push('db env not configured (DATABASE_URL missing); floor_alerts + null_cache_count unavailable')
  } else {
    const c = new Client({ connectionString: connStr })
    c.on('error', (e) => console.error('health pg-direct client error:', e.message))
    try {
      await c.connect()

      // (1) tenant_floor_alerts: tenant-scoped, explicit column allow-list,
      //     ORDER BY created_at DESC LIMIT 50.
      try {
        const fa = await c.query(
          `SELECT id, tenant_id, property_type, listing_id, alert_type, created_at
             FROM public.tenant_floor_alerts
            WHERE tenant_id = $1
            ORDER BY created_at DESC
            LIMIT 50`,
          [tenantId]
        )
        floor_alerts = fa.rows.map(r => ({
          id: r.id,
          tenant_id: r.tenant_id,
          property_type: r.property_type,
          listing_id: r.listing_id,
          alert_type: r.alert_type,
          created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        }))
      } catch (e: any) {
        warnings.push('floor_alerts: ' + (e?.message || 'unknown'))
        // floor_alerts stays null -> frontend renders "could not read" state
      }

      // (2) NULL-cache count: single aggregate query with FILTER per
      //     property_type (one round-trip, not three). mls_listings is
      //     tenant-agnostic (no tenant_id column); the count is system-wide.
      try {
        const nc = await c.query(`
          SELECT
            COUNT(*) FILTER (WHERE property_type = 'Residential Condo & Other')::int AS condo,
            COUNT(*) FILTER (WHERE property_type = 'Residential Freehold')::int AS home,
            COUNT(*)::int AS total
          FROM public.mls_listings
          WHERE assigned_agent_id IS NULL
        `)
        const row = nc.rows[0]
        if (row) {
          const total = row.total ?? 0
          const condo = row.condo ?? 0
          const home  = row.home  ?? 0
          null_cache_count = { total, condo, home, other: Math.max(0, total - condo - home) }
        } else {
          warnings.push('null_cache_count: aggregate returned no rows (unexpected)')
        }
      } catch (e: any) {
        warnings.push('null_cache_count: ' + (e?.message || 'unknown'))
        // null_cache_count stays null -> frontend renders "could not read" state
      }
    } catch (e: any) {
      warnings.push('db connect: ' + (e?.message || 'unknown'))
    } finally {
      await c.end().catch(() => {})
    }
  }

  return NextResponse.json(
    { ...(data as Record<string, unknown>), floor_alerts, null_cache_count, warnings },
    { status: 200 }
  )
}
