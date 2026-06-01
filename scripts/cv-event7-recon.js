// scripts/cv-event7-recon.js
// EVENT 7 -- nightly reconcile -- live-DB recon (READ-ONLY, BEGIN READ ONLY).
//
// Answers the 6 RECON questions before any build:
//   1. Does reconcile_corrections exist? If not, what schema?
//   2. What signals "what changed last night" (sync-delta)? sync_history?
//      mls_listings updated_at? modification_timestamp?
//   3. What identifies "flagged" rows in mls_listings?
//   4. Cron infrastructure -- mirror reroll-worker.yml posture?
//   5. Alert channel for >50 corrections (cron-token surface)?
//   6. Single-tenant per run or multi-tenant fan-out?
//
// Output to file via tee in the runner.
require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

;(async () => {
  const url = process.env.DATABASE_URL
  if (!url) { console.error('no DATABASE_URL'); process.exit(1) }
  const c = new Client({ connectionString: url })
  c.on('error', (e) => console.error('CLIENT ERROR:', e.message))
  await c.connect()
  await c.query('SET statement_timeout = 0')
  await c.query('BEGIN READ ONLY')

  console.log('EVENT 7 -- nightly reconcile recon (read-only)')
  console.log('================================================')

  // ============================================================
  // Q1. reconcile_corrections existence + shape.
  // ============================================================
  console.log('\n=== Q1. reconcile_corrections table ===')
  {
    const r = await c.query(`
      SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name='reconcile_corrections'
       ORDER BY ordinal_position`)
    if (r.rowCount === 0) {
      console.log('  (NOT FOUND -- net-new table needed)')
    } else {
      for (const row of r.rows) console.log('  ', row)
    }
  }

  // ============================================================
  // Q2. Sync-delta signals -- what tells us what changed last night?
  // ============================================================
  console.log('\n=== Q2a. mls_listings columns that could signal "changed last night" ===')
  {
    const r = await c.query(`
      SELECT column_name, data_type
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name='mls_listings'
         AND (column_name ILIKE '%updated%'
              OR column_name ILIKE '%modified%'
              OR column_name ILIKE '%modification%'
              OR column_name ILIKE '%synced%'
              OR column_name ILIKE '%inserted%'
              OR column_name ILIKE '%created%')
       ORDER BY column_name`)
    if (r.rowCount === 0) console.log('  (no timestamp columns matched)')
    else for (const row of r.rows) console.log('  ', row)
  }

  console.log('\n=== Q2b. sync_history (or equivalent) table existence ===')
  {
    const r = await c.query(`
      SELECT table_name
        FROM information_schema.tables
       WHERE table_schema='public'
         AND (table_name ILIKE '%sync%history%'
              OR table_name ILIKE '%nightly%sync%'
              OR table_name = 'sync_runs'
              OR table_name ILIKE '%sync%log%')
       ORDER BY table_name`)
    if (r.rowCount === 0) console.log('  (no sync_history-shaped table found)')
    else for (const row of r.rows) console.log('  ', row.table_name)
  }

  console.log('\n=== Q2c. Indexes on mls_listings timestamp columns (perf hint) ===')
  {
    const r = await c.query(`
      SELECT indexname, indexdef
        FROM pg_indexes
       WHERE schemaname='public' AND tablename='mls_listings'
         AND (indexdef ILIKE '%updated_at%'
              OR indexdef ILIKE '%modification%'
              OR indexdef ILIKE '%synced%'
              OR indexdef ILIKE '%insert%')
       ORDER BY indexname`)
    if (r.rowCount === 0) console.log('  (no timestamp-bearing index)')
    else for (const row of r.rows) console.log('  ', row.indexname, ':', row.indexdef)
  }

  console.log('\n=== Q2d. Rows changed in the LAST 24h (count + sample) ===')
  console.log('  (Establishes the realistic nightly delta size.)')
  {
    const r = await c.query(`
      SELECT COUNT(*)::int AS n
        FROM public.mls_listings
       WHERE updated_at > now() - interval '24 hours'`)
    console.log('  rows with updated_at > now()-24h:', r.rows[0].n)
  }
  {
    const r = await c.query(`
      SELECT COUNT(*)::int AS n
        FROM public.mls_listings
       WHERE updated_at > now() - interval '7 days'`)
    console.log('  rows with updated_at > now()-7d :', r.rows[0].n)
  }

  // ============================================================
  // Q3a. mls_listings.assigned_* columns shape (for the comparator).
  // ============================================================
  console.log('\n=== Q3a. mls_listings.assigned_* shape ===')
  {
    const r = await c.query(`
      SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name='mls_listings'
         AND column_name LIKE 'assigned_%'
       ORDER BY column_name`)
    for (const row of r.rows) console.log('  ', row)
  }

  console.log('\n=== Q3b. reresolve_listings_in_set signature (the candidate primitive) ===')
  {
    const r = await c.query(`
      SELECT pg_get_function_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS result,
             p.prosecdef
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='reresolve_listings_in_set'`)
    for (const row of r.rows) console.log('  ', row)
  }
  console.log('  NOTE: reresolve_listings_in_set has a sticky-guard at every level')
  console.log('  (assigned_scope IS NULL OR scope_specificity(assigned_scope) < <level>).')
  console.log('  For reconcile we want "is the CURRENT cache what reresolve WOULD produce')
  console.log('  if we re-walked from NULL?" -- the same NULL-then-delegate pattern we')
  console.log('  used in P1 FIX 2 reroll_listings_at_geo. Reconcile needs to:')
  console.log('  (a) capture pre-state trio per row,')
  console.log('  (b) NULL the trio for the candidate set,')
  console.log('  (c) PERFORM reresolve_listings_in_set,')
  console.log('  (d) compare post-state vs captured pre-state -- any diff = a correction;')
  console.log('  insert one reconcile_corrections row per diff.')

  // ============================================================
  // Q4. Cron infrastructure - reroll-worker.yml exists and is callable.
  // ============================================================
  console.log('\n=== Q4. Cron infrastructure -- existing patterns ===')
  console.log('  .github/workflows/reroll-worker.yml exists (every 5min, Bearer token)')
  console.log('  .github/workflows/nightly-sync.yml exists (07:00 UTC = 02:00 EST, sequential)')
  console.log('  Decision per tracker line 406: "GitHub Actions cron workflow (pg_cron is')
  console.log('  not installed on this Supabase project; reconcile must run external)."')
  console.log('  -> mirror reroll-worker.yml posture: separate workflow, Bearer cron-token,')
  console.log('     route under /api/admin-homes/territory/reconcile (TBD).')

  // ============================================================
  // Q5. Alert surface -- where does ">50 corrections in one run" surface?
  // ============================================================
  console.log('\n=== Q5. Alert surface candidates ===')
  console.log('  (a) tenant_floor_alerts table (in use for floor-pool empty alerts).')
  {
    const r = await c.query(`
      SELECT column_name, data_type
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name='tenant_floor_alerts'
       ORDER BY ordinal_position`)
    for (const row of r.rows) console.log('     col:', row.column_name, row.data_type)
  }
  console.log('  Decision: a NEW row in tenant_floor_alerts (or a sibling alerts table)')
  console.log("  with alert_type='reconcile_threshold_exceeded' would surface in the")
  console.log('  health route already wired in P-DASHBOARD CORE-5. Operator sees it')
  console.log('  in /admin-homes/tenants/<id>/territory health tab.')
  console.log('  Alternative: the workflow itself can echo to GH Actions log + exit non-0')
  console.log('  to surface via the GH Actions notification channel.')

  // ============================================================
  // Q6. Tenant scope -- single per run or fan-out?
  // ============================================================
  console.log('\n=== Q6. Tenant pattern -- existing single-tenant-implicit landscape ===')
  console.log('  reroll-worker.yml iterates WALLIAM_TENANT_ID then AILY_TENANT_ID')
  console.log('  (env vars), one tenant per HTTP call. Same pattern is the proven shape.')
  console.log('  reresolve_listings_in_set takes (uuid[], p_tenant_id) -- ONE tenant per call.')
  console.log('  -> Mirror reroll-worker.yml: single-tenant per HTTP call from the workflow;')
  console.log('     workflow iterates the known tenants.')

  await c.query('ROLLBACK')
  await c.end()
})().catch(e => { console.error('EVENT 7 RECON ERROR:', e); process.exit(1) })
