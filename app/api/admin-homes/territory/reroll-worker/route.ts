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
  // CRON BYPASS (Event 4 async handoff, 2026-05-30): a Bearer token matching
  // process.env.REROLL_WORKER_CRON_TOKEN unlocks tenant_id-scoped drain
  // without an admin session. Used by .github/workflows/reroll-worker.yml.
  // The token is supplied via GH Actions secret and matched against the
  // server-side env var. If REROLL_WORKER_CRON_TOKEN is unset (local dev /
  // any environment without the secret) the bypass is disabled and only
  // the user-session path applies.
  const cronToken = process.env.REROLL_WORKER_CRON_TOKEN
  if (cronToken && cronToken.length >= 32) {
    const auth = req.headers.get('authorization')
    if (auth === `Bearer ${cronToken}`) {
      const override = req.nextUrl.searchParams.get('tenant_id')
      if (override && UUID_RE.test(override)) return override
      return null
    }
  }

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
  c.on('error', (e) => console.error('reroll-worker GET client error:', e.message))
  await c.connect()
  const d = await depth(c, tenantId)
  // P-DASHBOARD GAP-C: cron observability fields (additive, backward-compatible).
  // pg-direct as postgres (this route already uses pg-direct, so the same
  // postgres-owner grants on territory_reroll_queue apply -- no service_role
  // grant wall). Single round-trip with 4 scalar subqueries.
  let last_done_at: string | null = null
  let last_error: { message: string | null; at: string | null } | null = null
  let recent_done_count = 0
  let recent_error_count = 0
  try {
    const h = await c.query(
      `SELECT
         (SELECT processed_at FROM territory_reroll_queue
            WHERE tenant_id = $1 AND status = 'done'
            ORDER BY processed_at DESC NULLS LAST LIMIT 1) AS last_done_at,
         (SELECT json_build_object('message', error_message, 'at', processed_at)
            FROM territory_reroll_queue
            WHERE tenant_id = $1 AND status = 'error'
            ORDER BY processed_at DESC NULLS LAST LIMIT 1) AS last_error,
         (SELECT COUNT(*)::int FROM territory_reroll_queue
            WHERE tenant_id = $1 AND status = 'done'
              AND processed_at > now() - interval '1 hour') AS recent_done_count,
         (SELECT COUNT(*)::int FROM territory_reroll_queue
            WHERE tenant_id = $1 AND status = 'error'
              AND processed_at > now() - interval '1 hour') AS recent_error_count`,
      [tenantId]
    )
    const r = h.rows[0] || {}
    last_done_at = r.last_done_at ? new Date(r.last_done_at).toISOString() : null
    last_error = r.last_error || null
    recent_done_count = r.recent_done_count || 0
    recent_error_count = r.recent_error_count || 0
  } catch (e: any) {
    console.error('reroll-worker GET observability query failed:', e?.message)
    // Soft-fail: depth + ok still returned even if observability query errored.
  }
  await c.end()
  return NextResponse.json({ ok: true, ...d, last_done_at, last_error, recent_done_count, recent_error_count })
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
    let rowsUpdated: number
    if (job.scope === 'agent') {
      // Event 4 async handoff (2026-05-30). scope='agent' rows are enqueued
      // by handle_agent_deactivate on agent is_active/is_selling -> false.
      // reflow_deactivated_agent is SECURITY DEFINER + locked search_path;
      // it collects the agent's listings, NULLs the coupled trio, and
      // re-walks the cascade via reresolve_listings_in_set. The pg-direct
      // statement_timeout=0 already SET above (line 68 of the original
      // route) bypasses the 8s authenticator cap that blocked the sync
      // path -- this is the entire reason the work is async.
      const r = await c.query(
        'SELECT (reflowed_count + null_count)::int AS n FROM reflow_deactivated_agent($1::uuid, $2::uuid)',
        [job.scope_id, tenantId]
      )
      rowsUpdated = r.rows[0].n
    } else {
      const r = await c.query(
        'SELECT reroll_listings_at_geo($1::text, $2::uuid, $3::uuid) AS n',
        [job.scope, job.scope_id, tenantId]
      )
      rowsUpdated = r.rows[0].n
    }
    await c.query(
      `UPDATE territory_reroll_queue SET status='done', processed_at=now(), rows_updated=$1 WHERE id=$2`,
      [rowsUpdated, job.id]
    )
    const d = await depth(c, tenantId)
    await c.end()
    return NextResponse.json({ ok: true, processed: { ...job, rows_updated: rowsUpdated }, ...d })
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