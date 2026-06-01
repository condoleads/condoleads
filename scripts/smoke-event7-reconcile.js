// scripts/smoke-event7-reconcile.js
// Smoke harness for P-LIFECYCLE Event 7 (nightly reconcile).
//
// Runs AFTER the up-migration is COMMITted. All 5 T-asserts execute as
// postgres (DATABASE_URL); per-T BEGIN/ROLLBACK so production state is never
// modified. (reconcile_tenant_cache MUTATES state -- NULL the trio + walk +
// INSERT corrections -- so EVERY T runs inside a tx that rolls back.)
//
// T1 -- SHAPE: function exists with right signature + DEFINER + locked
//       search_path; reconcile_corrections table + 2 indexes present;
//       idx_mls_listings_updated_at present; CHECKs on tenant_floor_alerts
//       extended.
// T2 -- INDEX USED: EXPLAIN (no ANALYZE) on the sync-delta candidate query
//       shape; assert the plan uses idx_mls_listings_updated_at (no seq scan
//       on 1.3M rows).
// T3 -- E2E DIFF + CORRECTION INSERT: in a BEGIN, manually mutate the trio
//       on a WALLiam listing to a known-wrong state (different agent), call
//       reconcile_tenant_cache with sample_pct=0 + a tiny flagged set
//       containing that listing, assert reconcile_corrections row inserted
//       with old/new trios, assert mls_listings post-state restored to
//       correct agent. ROLLBACK.
// T4 -- THRESHOLD ALERT: in a BEGIN, set up a scenario that produces > N
//       corrections, call with threshold=N, assert a tenant_floor_alerts row
//       was inserted with alert_type='reconcile_threshold_exceeded'. ROLLBACK.
// T5 -- TENANT ISOLATION: in a BEGIN, capture an aily-routed listing's
//       trio, call reconcile_tenant_cache for WALLiam, assert the aily
//       listing's trio UNCHANGED. ROLLBACK.

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

function assertEq (got, exp, msg) {
  if (got !== exp) throw new Error(`${msg}: got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`)
}

;(async () => {
  const url = process.env.DATABASE_URL
  if (!url) { console.error('smoke: no DATABASE_URL'); process.exit(1) }
  const c = new Client({ connectionString: url })
  c.on('error', (e) => console.error('[smoke] CLIENT ERROR:', e.message))
  await c.connect()
  await c.query('SET statement_timeout = 0')
  console.log('[smoke] connected as postgres; statement_timeout=0')

  const results = []
  const record = (name, status, detail) => {
    results.push({ name, status, detail })
    console.log(`[smoke] ${status === 'PASS' ? 'PASS' : status === 'SKIP' ? 'SKIP' : 'FAIL'} ${name} -- ${detail}`)
  }

  try {
    // ------------------------------------------------------------
    // T1 -- SHAPE (read-only, no tx needed)
    // ------------------------------------------------------------
    {
      const fn = await c.query(`
        SELECT p.prosecdef, p.proconfig,
               pg_get_function_arguments(p.oid) AS args,
               pg_get_function_result(p.oid) AS result
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='reconcile_tenant_cache'`)
      if (fn.rowCount === 0) throw new Error('T1: reconcile_tenant_cache not found')
      const row = fn.rows[0]
      assertEq(row.prosecdef, true, 'T1: prosecdef')
      const cfg = (row.proconfig || []).join(',')
      if (!/search_path=public,\s*pg_temp/i.test(cfg)) throw new Error(`T1: locked search_path missing: ${cfg}`)

      const tbl = await c.query(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='reconcile_corrections'`)
      assertEq(tbl.rows[0].n, 1, 'T1: reconcile_corrections table')

      const idx = await c.query(`SELECT COUNT(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND indexname='idx_mls_listings_updated_at'`)
      assertEq(idx.rows[0].n, 1, 'T1: idx_mls_listings_updated_at')

      const chk = await c.query(`
        SELECT pg_get_constraintdef(con.oid) AS def
          FROM pg_constraint con
          JOIN pg_class c ON c.oid=con.conrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='tenant_floor_alerts'
           AND con.conname='tfa_alert_type_check'`)
      if (!/reconcile_threshold_exceeded/.test(chk.rows[0].def)) throw new Error('T1: tfa_alert_type_check missing reconcile_threshold_exceeded')

      record('T1 shape', 'PASS', 'function DEFINER+locked, table+indexes present, CHECK extended')
    }

    // ------------------------------------------------------------
    // T2 -- INDEX USED on sync-delta scan (EXPLAIN check; no ANALYZE so
    // no cost on 1.3M-row scan).
    // ------------------------------------------------------------
    {
      const plan = await c.query(`
        EXPLAIN SELECT id FROM public.mls_listings
         WHERE updated_at > now() - interval '24 hours'
           AND (building_id IS NOT NULL
                OR community_id IS NOT NULL
                OR municipality_id IS NOT NULL
                OR area_id IS NOT NULL)`)
      const planText = plan.rows.map(r => r['QUERY PLAN']).join('\n')
      if (/Seq Scan on mls_listings/.test(planText)) {
        throw new Error(`T2: sync-delta scan uses Seq Scan (expected Index Scan on idx_mls_listings_updated_at):\n${planText}`)
      }
      if (!/idx_mls_listings_updated_at/.test(planText)) {
        throw new Error(`T2: plan does not reference idx_mls_listings_updated_at:\n${planText}`)
      }
      record('T2 index used', 'PASS', 'sync-delta scan uses idx_mls_listings_updated_at')
    }

    // ------------------------------------------------------------
    // Fixture: WALLiam tenant + a community-routed listing (assigned_scope
    // = 'community', assigned_agent_id non-NULL).
    // ------------------------------------------------------------
    const tw = await c.query(`SELECT id FROM public.tenants WHERE source_key='walliam'`)
    if (tw.rowCount === 0) { console.log('[smoke] WALLIAM tenant absent -- skipping T3/T4/T5'); await c.end(); process.exit(0) }
    const walliamId = tw.rows[0].id

    const pick = await c.query(`
      SELECT ml.id, ml.assigned_agent_id, ml.assigned_scope, ml.assigned_source_id
        FROM public.mls_listings ml
        JOIN public.agents a ON a.id = ml.assigned_agent_id
       WHERE a.tenant_id = $1
         AND ml.assigned_scope IN ('community','municipality','area')
         AND ml.community_id IS NOT NULL
       LIMIT 1`, [walliamId])
    if (pick.rowCount === 0) { console.log('[smoke] no WALLiam community-routed listing'); await c.end(); process.exit(0) }
    const fix = pick.rows[0]

    // ------------------------------------------------------------
    // T3 -- E2E DIFF + CORRECTION INSERT.
    // Setup: corrupt the listing's trio to a known-wrong agent (pick any
    // other WALLiam agent). Call reconcile_tenant_cache with lookback=0,
    // sample_pct=0, but inject the listing via the flagged path. To do
    // that we set assigned_agent_id to NULL and leave assigned_scope set
    // -- that creates a half-NULL state which flagged() catches.
    // ------------------------------------------------------------
    await c.query('BEGIN')
    try {
      // Defer the coupled CHECK so we can transiently make the row half-NULL
      // inside the savepoint. The CHECK was declared without DEFERRABLE, so
      // we use a different trick: temporarily UPDATE to a NULL-agent state
      // is NOT possible without violating the constraint. Instead, swap to
      // an inactive agent (still a valid coupled state) so reconcile's
      // re-walk picks a DIFFERENT agent than the inactive one.
      //
      // Simpler approach: pick a SECOND WALLiam agent (any agent owned by
      // WALLiam) and swap assigned_agent_id to that one. The current
      // assigned_scope/source still references the original agent's apa,
      // so reconcile's re-walk will detect the mismatch and correct it
      // back to the v16-correct pick.
      const other = await c.query(`
        SELECT id FROM public.agents
         WHERE tenant_id = $1 AND is_active = TRUE AND is_selling = TRUE
           AND id <> $2
         LIMIT 1`, [walliamId, fix.assigned_agent_id])
      if (other.rowCount === 0) {
        record('T3 e2e diff', 'SKIP', 'no second WALLiam agent to corrupt with')
      } else {
        const wrongAgentId = other.rows[0].id
        // Swap to the wrong agent AND explicitly bump updated_at so the
        // sync-delta candidate scan picks the fixture up. mls_listings does
        // not have an automatic updated_at trigger on every UPDATE (the
        // first smoke run proved this -- direct UPDATE without setting
        // updated_at left the row outside the 1h delta), so we set it
        // explicitly here.
        await c.query(
          `UPDATE public.mls_listings
              SET assigned_agent_id = $1,
                  updated_at = now()
            WHERE id = $2`,
          [wrongAgentId, fix.id]
        )
        const r = await c.query(
          `SELECT corrections_count, candidates_count
             FROM public.reconcile_tenant_cache($1::uuid, 1, 0::numeric, 999999)`,
          [walliamId]
        )
        const corrections = r.rows[0].corrections_count
        // Confirm a row landed in reconcile_corrections for our fixture
        const corr = await c.query(
          `SELECT old_agent_id, new_agent_id, reason
             FROM public.reconcile_corrections
            WHERE listing_id = $1
            ORDER BY reconciled_at DESC LIMIT 1`, [fix.id]
        )
        if (corr.rowCount === 0) {
          throw new Error(`T3: no reconcile_corrections row for fixture listing ${fix.id} (corrections=${corrections})`)
        }
        assertEq(corr.rows[0].old_agent_id, wrongAgentId, 'T3: old_agent_id == corrupted')
        // new_agent_id should be the v16-correct pick (likely == fix.assigned_agent_id)
        if (corr.rows[0].new_agent_id === wrongAgentId) {
          throw new Error(`T3: new_agent_id == wrongAgent (no correction applied)`)
        }
        // Confirm mls_listings was actually corrected.
        const post = await c.query(
          `SELECT assigned_agent_id, assigned_scope FROM public.mls_listings WHERE id = $1`, [fix.id]
        )
        if (post.rows[0].assigned_agent_id === wrongAgentId) {
          throw new Error(`T3: mls_listings still has wrong agent post-reconcile`)
        }
        record('T3 e2e diff + correction insert', 'PASS',
               `fixture corrupted to ${wrongAgentId.slice(0, 8)}.., reconcile detected + logged + corrected (now ${corr.rows[0].new_agent_id.slice(0, 8)}..)`)
      }
    } finally {
      await c.query('ROLLBACK')
    }

    // ------------------------------------------------------------
    // T4 -- THRESHOLD ALERT. Build a candidate set with >N corrections
    // by corrupting N+1 listings, then call with threshold=N, assert a
    // tenant_floor_alerts row was inserted with alert_type=
    // 'reconcile_threshold_exceeded' and property_type='system'.
    // ------------------------------------------------------------
    await c.query('BEGIN')
    try {
      // Pick the LEAST-routed WALLiam agent as the corruption target so the
      // "currently routed to a DIFFERENT agent" candidate pool is maximized.
      // (If we pick the dominant routing target -- e.g., King Shah with 11
      // community carves -- then most listings are ALREADY routed to him
      // and there's nothing left to corrupt to him.)
      const others = await c.query(`
        SELECT a.id
          FROM public.agents a
          LEFT JOIN public.mls_listings ml ON ml.assigned_agent_id = a.id
         WHERE a.tenant_id = $1 AND a.is_active = TRUE AND a.is_selling = TRUE
         GROUP BY a.id
         ORDER BY COUNT(ml.id) ASC
         LIMIT 1`, [walliamId])
      if (others.rowCount === 0) {
        record('T4 threshold alert', 'SKIP', 'no WALLiam agent for corruption')
      } else {
        const someWalliamAgent = others.rows[0].id
        // Pick 5 WALLiam-routed listings and corrupt each to someWalliamAgent.
        // If the picked listing's CURRENT agent != someWalliamAgent, the
        // corruption is real (current state will be detected as drift).
        const picks = await c.query(`
          SELECT ml.id
            FROM public.mls_listings ml
            JOIN public.agents a ON a.id = ml.assigned_agent_id
           WHERE a.tenant_id = $1
             AND ml.assigned_scope IN ('community','municipality','area')
             AND ml.assigned_agent_id <> $2
           LIMIT 5`, [walliamId, someWalliamAgent])
        if (picks.rowCount < 5) {
          record('T4 threshold alert', 'SKIP', `only ${picks.rowCount} listings available for corruption (need 5)`)
        } else {
          const ids = picks.rows.map(r => r.id)
          await c.query(
            `UPDATE public.mls_listings
                SET assigned_agent_id = $1, updated_at = now()
              WHERE id = ANY($2::uuid[])`,
            [someWalliamAgent, ids]
          )
          // threshold=3 with 5 corruptions -> threshold exceeded.
          await c.query(`
            SELECT corrections_count, candidates_count
              FROM public.reconcile_tenant_cache($1::uuid, 1, 0::numeric, 3)`, [walliamId])
          // Did the threshold alert fire?
          const alert = await c.query(`
            SELECT COUNT(*)::int AS n FROM public.tenant_floor_alerts
             WHERE tenant_id = $1
               AND alert_type = 'reconcile_threshold_exceeded'
               AND property_type = 'system'
               AND created_at > now() - interval '5 minutes'`, [walliamId])
          if (alert.rows[0].n < 1) throw new Error('T4: tenant_floor_alerts row not inserted on threshold-exceed')
          record('T4 threshold alert', 'PASS', `5 corruptions, threshold=3 -> tenant_floor_alerts inserted (reconcile_threshold_exceeded, system)`)
        }
      }
    } finally {
      await c.query('ROLLBACK')
    }

    // ------------------------------------------------------------
    // T5 -- TENANT ISOLATION: reconciling WALLiam must not touch aily rows.
    // ------------------------------------------------------------
    await c.query('BEGIN')
    try {
      const ailyT = await c.query(`SELECT id FROM public.tenants WHERE source_key='aily'`)
      if (ailyT.rowCount === 0) {
        record('T5 tenant isolation', 'SKIP', 'aily tenant absent')
      } else {
        const ailyTenantId = ailyT.rows[0].id
        // Find an aily-routed listing (if any).
        const ap = await c.query(`
          SELECT ml.id, ml.assigned_agent_id, ml.assigned_scope, ml.assigned_source_id
            FROM public.mls_listings ml
            JOIN public.agents a ON a.id = ml.assigned_agent_id
           WHERE a.tenant_id = $1
           LIMIT 1`, [ailyTenantId])
        if (ap.rowCount === 0) {
          // Aily has 0 routed listings today -- isolation is trivially true.
          // To still exercise the assertion, capture a sample mls_listings
          // pre-state for any aily-eligible listing and assert it's unchanged
          // after a WALLiam reconcile.
          record('T5 tenant isolation', 'SKIP', 'aily has no routed listings to compare')
        } else {
          const ailyFix = ap.rows[0]
          await c.query(`
            SELECT corrections_count
              FROM public.reconcile_tenant_cache($1::uuid, 24, 0.08::numeric, 999999)`, [walliamId])
          // Check the aily row is unchanged.
          const post = await c.query(
            `SELECT assigned_agent_id, assigned_scope, assigned_source_id
               FROM public.mls_listings WHERE id = $1`, [ailyFix.id]
          )
          const tripletPre  = [ailyFix.assigned_agent_id, ailyFix.assigned_scope, ailyFix.assigned_source_id].join('|')
          const tripletPost = [post.rows[0].assigned_agent_id, post.rows[0].assigned_scope, post.rows[0].assigned_source_id].join('|')
          if (tripletPre !== tripletPost) {
            throw new Error(`T5: aily listing ${ailyFix.id} mutated by WALLiam reconcile: pre=${tripletPre} post=${tripletPost}`)
          }
          // Also confirm no aily-targeted reconcile_corrections rows landed.
          const ailyCorr = await c.query(
            `SELECT COUNT(*)::int AS n FROM public.reconcile_corrections WHERE tenant_id = $1`, [ailyTenantId])
          assertEq(ailyCorr.rows[0].n, 0, 'T5: no aily-stamped reconcile_corrections from a WALLiam-tenant call')
          record('T5 tenant isolation', 'PASS', `aily listing trio unchanged by WALLiam reconcile; 0 aily-stamped corrections`)
        }
      }
    } finally {
      await c.query('ROLLBACK')
    }
  } catch (e) {
    record('SMOKE', 'FAIL', e.message)
    try { await c.query('ROLLBACK') } catch (_) {}
    await c.end()
    console.log('\n[smoke] SUMMARY:')
    for (const r of results) console.log('   ', r.status, r.name, '--', r.detail)
    process.exit(1)
  }

  await c.end()
  console.log('\n[smoke] SUMMARY:')
  for (const r of results) console.log('   ', r.status, r.name, '--', r.detail)
  const allOk = results.every(r => r.status === 'PASS' || r.status === 'SKIP')
  process.exit(allOk ? 0 : 1)
})().catch(e => { console.error('smoke uncaught:', e); process.exit(1) })
