// app/api/admin-homes/territory/reconcile/route.ts
// P-LIFECYCLE Event 7 -- nightly reconcile route. Bearer-token only.
//
// POST /api/admin-homes/territory/reconcile?tenant_id=<uuid>
//   - Bearer token must match RECONCILE_CRON_TOKEN env (>= 32 chars).
//   - tenant_id query param must match UUID regex.
//   - Calls reconcile_tenant_cache(tenant_id) via pg-direct as postgres.
//   - Returns { ok, tenant_id, candidates, corrections, threshold_exceeded, threshold }.
//
// Mirrors app/api/admin-homes/territory/reroll-worker/route.ts (Bearer + pg-direct
// + tenant-id query param), but with its OWN token env var (RECONCILE_CRON_TOKEN,
// distinct from REROLL_WORKER_CRON_TOKEN) so revoking one doesn't break the other.
//
// No user-session auth path -- this route is cron-only. Manual operator
// invocations go through workflow_dispatch on .github/workflows/reconcile.yml.

import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_THRESHOLD = 50
const DEFAULT_LOOKBACK_HOURS = 24
const DEFAULT_SAMPLE_PCT = 0.08

export async function POST (req: NextRequest) {
  // ---- Auth: Bearer RECONCILE_CRON_TOKEN. Fail-closed if env unset. ----
  const cronToken = process.env.RECONCILE_CRON_TOKEN
  if (!cronToken || cronToken.length < 32) {
    return NextResponse.json(
      { error: 'reconcile route disabled: RECONCILE_CRON_TOKEN unset or too short' },
      { status: 503 }
    )
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${cronToken}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ---- Tenant id required + UUID-shape validated ----
  const tenantId = req.nextUrl.searchParams.get('tenant_id')
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: 'tenant_id query param required (uuid)' }, { status: 400 })
  }

  // ---- Optional tuning params (default to function defaults) ----
  const lookbackHours = parseInt(req.nextUrl.searchParams.get('lookback_hours') || String(DEFAULT_LOOKBACK_HOURS), 10)
  const samplePct = parseFloat(req.nextUrl.searchParams.get('sample_pct') || String(DEFAULT_SAMPLE_PCT))
  const threshold = parseInt(req.nextUrl.searchParams.get('threshold') || String(DEFAULT_THRESHOLD), 10)
  if (!Number.isFinite(lookbackHours) || lookbackHours < 0 || lookbackHours > 168) {
    return NextResponse.json({ error: 'lookback_hours must be 0..168' }, { status: 400 })
  }
  if (!Number.isFinite(samplePct) || samplePct < 0 || samplePct > 100) {
    return NextResponse.json({ error: 'sample_pct must be 0..100' }, { status: 400 })
  }
  if (!Number.isInteger(threshold) || threshold < 0) {
    return NextResponse.json({ error: 'threshold must be a non-negative integer' }, { status: 400 })
  }

  // ---- pg-direct as postgres (matches reroll-worker route posture) ----
  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) {
    return NextResponse.json({ error: 'no db env' }, { status: 500 })
  }

  const c = new Client({ connectionString: connStr })
  c.on('error', (e) => console.error('reconcile route client error:', e.message))
  try {
    await c.connect()
    // Reconcile call is wall-clock-heavy on the candidate set (~18k rows
    // typical); disable statement_timeout for this one call.
    await c.query('SET statement_timeout = 0')

    const r = await c.query(
      `SELECT corrections_count, candidates_count
         FROM public.reconcile_tenant_cache($1::uuid, $2::int, $3::numeric, $4::int)`,
      [tenantId, lookbackHours, samplePct, threshold]
    )
    const corrections = r.rows[0].corrections_count
    const candidates  = r.rows[0].candidates_count
    const thresholdExceeded = corrections > threshold

    await c.end()
    return NextResponse.json({
      ok: true,
      tenant_id: tenantId,
      candidates,
      corrections,
      threshold,
      threshold_exceeded: thresholdExceeded,
      lookback_hours: lookbackHours,
      sample_pct: samplePct,
    })
  } catch (e: any) {
    try { await c.end() } catch (_) {}
    console.error('reconcile route error:', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 })
  }
}
