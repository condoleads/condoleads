// app/api/admin-homes/territory/reroll-worker/route.ts
// W-COCKPIT P-B-2 Commit 2a -- drain the reroll queue.
//
// Picks up to 1 pending row per call, marks processing, runs reroll, marks done.
// Authenticated platform-admin or tenant-manager only. Tenant-scoped.
// Returns queue depth so caller can poll until 0.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { Client } from 'pg'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveTenantId(req: NextRequest): Promise<string | null> {
  const user = await resolveAdminHomesUser()
  if (!user) return null
  const override = req.nextUrl.searchParams.get('tenant_id')
  if (override && UUID_RE.test(override)) {
    if (user.isPlatformAdmin) return override
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return null
    const { data: a } = await supabase.from('tenant_manager_assignments')
      .select('tenant_id').eq('user_id', authUser.id).eq('tenant_id', override)
      .is('revoked_at', null).maybeSingle()
    return a ? override : null
  }
  return user.tenantId
}

// GET = queue depth probe (no work)
// POST = process up to 1 row, return new depth
async function depth(c: Client, tenantId: string): Promise<{ pending: number; processing: number }> {
  const r = await c.query(
    `SELECT
       COUNT(*) FILTER (WHERE status='pending') AS pending,
       COUNT(*) FILTER (WHERE status='processing') AS processing
     FROM territory_reroll_queue WHERE tenant_id=$1`,
    [tenantId]
  )
  return { pending: parseInt(r.rows[0].pending, 10), processing: parseInt(r.rows[0].processing, 10) }
}

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req)
  if (!tenantId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'no db env' }, { status: 500 })
  const c = new Client({ connectionString: connStr })
  await c.connect()
  const d = await depth(c, tenantId)
  await c.end()
  return NextResponse.json({ ok: true, ...d })
}

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req)
  if (!tenantId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'no db env' }, { status: 500 })

  const c = new Client({ connectionString: connStr })
  await c.connect()
  // Disable statement timeout for this one job (the reroll EXPLAIN was 19s).
  await c.query('SET statement_timeout = 0')

  // Atomically claim one pending row.
  const claim = await c.query(
    `UPDATE territory_reroll_queue
       SET status='processing', started_at=now()
     WHERE id = (
       SELECT id FROM territory_reroll_queue
       WHERE tenant_id=$1 AND status='pending'
       ORDER BY requested_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, scope, scope_id`,
    [tenantId]
  )

  if (claim.rowCount === 0) {
    const d = await depth(c, tenantId)
    await c.end()
    return NextResponse.json({ ok: true, processed: null, ...d })
  }

  const job = claim.rows[0]
  try {
    const r = await c.query(
      'SELECT reroll_listings_at_geo($1::text, $2::uuid, $3::uuid) AS n',
      [job.scope, job.scope_id, tenantId]
    )
    await c.query(
      `UPDATE territory_reroll_queue SET status='done', processed_at=now(), rows_updated=$1 WHERE id=$2`,
      [r.rows[0].n, job.id]
    )
    const d = await depth(c, tenantId)
    await c.end()
    return NextResponse.json({ ok: true, processed: { ...job, rows_updated: r.rows[0].n }, ...d })
  } catch (e: any) {
    await c.query(
      `UPDATE territory_reroll_queue SET status='error', processed_at=now(), error_message=$1 WHERE id=$2`,
      [e.message || 'unknown', job.id]
    ).catch(() => {})
    const d = await depth(c, tenantId)
    await c.end()
    return NextResponse.json({ ok: false, error: e.message, ...d }, { status: 500 })
  }
}