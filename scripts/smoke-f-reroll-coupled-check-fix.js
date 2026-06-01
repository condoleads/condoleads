// scripts/smoke-f-reroll-coupled-check-fix.js
// Smoke harness for F-REROLL-LISTINGS-AT-GEO-COUPLED-CHECK (P1 FIX 2 of 3).
//
// Runs AFTER the up-migration is COMMITted. All 5 T-asserts execute inside a
// single BEGIN/ROLLBACK so production state is never modified. Picks the
// smallest WALLiam community carve at runtime (no hardcoded UUIDs).
//
// T1: shape -- post-fix prosecdef + locked search_path + signature.
// T2: STICKY PRESERVATION -- pinned listing not clobbered by community reroll.
// T3: EMPTY-POOL HALF-NULL ABSENCE -- deactivate community apa, call reroll,
//     assert ZERO half-NULL rows in the community.
// T4: WALK-EQUIVALENCE -- the new reroll produces the same per-listing post-
//     state as a manual (NULL trio + reresolve_listings_in_set) sequence.
// T5: RETURN-VALUE CONTRACT -- the int returned equals the count of rows
//     whose final agent differs from pre-state (the worker's rowsUpdated).
//
// Per CLAUDE.md / v25 lesson: pg Client gets .on('error') handler attached.
// Smoke runs as postgres (DATABASE_URL), so no role-switch.

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
  console.log('[smoke] connected as postgres')

  const results = []
  const record = (name, status, detail) => {
    results.push({ name, status, detail })
    console.log(`[smoke] ${status === 'PASS' ? 'PASS' : 'FAIL'} ${name} -- ${detail}`)
  }

  await c.query('BEGIN')
  try {
    // ------------------------------------------------------------
    // T1: shape -- runs OUTSIDE any setup, queries pg_proc only.
    // ------------------------------------------------------------
    {
      const r = await c.query(`
        SELECT p.prosecdef, p.proconfig,
               pg_get_function_arguments(p.oid) AS args,
               pg_get_function_result(p.oid) AS result_type
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='reroll_listings_at_geo'`)
      const row = r.rows[0]
      assertEq(row.prosecdef, true, 'T1: prosecdef')
      const cfg = (row.proconfig || []).join(',')
      if (!/search_path=public,\s*pg_temp/i.test(cfg)) {
        throw new Error(`T1: proconfig "${cfg}" lacks locked search_path`)
      }
      assertEq(row.args, 'p_scope text, p_scope_id uuid, p_tenant_id uuid', 'T1: args')
      assertEq(row.result_type, 'integer', 'T1: result_type')
      record('T1 shape', 'PASS', `prosecdef=true, search_path locked, signature unchanged`)
    }

    // ------------------------------------------------------------
    // Fixture pick (shared by T2..T5).
    // Smallest WALLiam community carve with mls_listings at scope=community.
    // ------------------------------------------------------------
    const fix = await c.query(`
      WITH walliam AS (
        SELECT id AS tenant_id FROM public.tenants WHERE source_key='walliam'
      ),
      community_cnt AS (
        SELECT c.id AS community_id, c.name AS community_name,
               (SELECT COUNT(*) FROM public.mls_listings ml
                 WHERE ml.community_id = c.id AND ml.assigned_scope='community') AS cnt
          FROM public.communities c
          JOIN public.agent_property_access apa
            ON apa.community_id=c.id AND apa.scope='community' AND apa.is_active=TRUE
          JOIN walliam w ON w.tenant_id=apa.tenant_id
         GROUP BY c.id, c.name
      )
      SELECT (SELECT tenant_id FROM walliam) AS tenant_id,
             community_id, community_name, cnt
        FROM community_cnt
       WHERE cnt > 0
       ORDER BY cnt ASC
       LIMIT 1`)
    if (fix.rowCount === 0) {
      console.log('[smoke] FIXTURE SKIP: no WALLiam community with scope=community listings')
      await c.query('ROLLBACK')
      await c.end()
      process.exit(0)
    }
    const F = fix.rows[0]
    console.log('[smoke] fixture:', F)

    const agentR = await c.query(`
      SELECT id FROM public.agents
       WHERE tenant_id = $1 AND is_active=TRUE AND is_selling=TRUE
       LIMIT 1`, [F.tenant_id])
    if (agentR.rowCount === 0) throw new Error('FIXTURE: no active WALLiam agent')
    const walliamAgentId = agentR.rows[0].id

    // ------------------------------------------------------------
    // T2: STICKY PRESERVATION. Install a pin on one community-
    // scoped listing; call reroll on its community; assert the
    // pin survives.
    // ------------------------------------------------------------
    {
      await c.query('SAVEPOINT s_t2')
      try {
        await c.query(`SET LOCAL app.skip_apa_reroll = 'on'`)

        const pickR = await c.query(`
          SELECT id FROM public.mls_listings
           WHERE community_id = $1 AND assigned_scope = 'community'
           LIMIT 1`, [F.community_id])
        if (pickR.rowCount === 0) throw new Error('T2: no community-scoped listing in fixture community')
        const pinListingId = pickR.rows[0].id

        await c.query(`
          INSERT INTO public.agent_listing_assignments (listing_id, agent_id, is_active)
          VALUES ($1, $2, TRUE)`, [pinListingId, walliamAgentId])

        await c.query(`SELECT public.reresolve_listing($1::uuid, $2::uuid)`, [pinListingId, F.tenant_id])

        const preR = await c.query(`
          SELECT assigned_scope, assigned_agent_id, assigned_source_id
            FROM public.mls_listings WHERE id = $1`, [pinListingId])
        assertEq(preR.rows[0].assigned_scope, 'pin', 'T2 setup: pin install yielded scope=pin')
        assertEq(preR.rows[0].assigned_agent_id, walliamAgentId, 'T2 setup: pin agent matches')

        // Action: reroll the community.
        await c.query(`SELECT public.reroll_listings_at_geo('community', $1::uuid, $2::uuid)`,
                      [F.community_id, F.tenant_id])

        const postR = await c.query(`
          SELECT assigned_scope, assigned_agent_id
            FROM public.mls_listings WHERE id = $1`, [pinListingId])
        assertEq(postR.rows[0].assigned_scope, 'pin', 'T2: pin scope preserved post-reroll')
        assertEq(postR.rows[0].assigned_agent_id, walliamAgentId, 'T2: pin agent preserved post-reroll')

        record('T2 sticky-preservation', 'PASS', `pin on listing ${pinListingId} survived community reroll`)
      } finally {
        await c.query('ROLLBACK TO SAVEPOINT s_t2')
      }
    }

    // ------------------------------------------------------------
    // T3: EMPTY-POOL HALF-NULL ABSENCE. Deactivate all community
    // apa for the fixture community; reroll; assert ZERO half-NULL
    // rows in that community.
    // ------------------------------------------------------------
    {
      await c.query('SAVEPOINT s_t3')
      try {
        await c.query(`SET LOCAL app.skip_apa_reroll = 'on'`)

        const preCnt = await c.query(`
          SELECT COUNT(*)::int AS n FROM public.mls_listings
           WHERE community_id = $1
             AND ((assigned_agent_id IS NULL) <> (assigned_scope IS NULL))`,
          [F.community_id])
        assertEq(preCnt.rows[0].n, 0, 'T3 setup: pre-state has no half-NULL in this community')

        await c.query(`
          UPDATE public.agent_property_access
             SET is_active = FALSE
           WHERE tenant_id = $1 AND scope = 'community' AND community_id = $2`,
          [F.tenant_id, F.community_id])

        const callR = await c.query(`
          SELECT public.reroll_listings_at_geo('community', $1::uuid, $2::uuid) AS n`,
          [F.community_id, F.tenant_id])
        const nUpdated = callR.rows[0].n

        const postCnt = await c.query(`
          SELECT COUNT(*)::int AS n FROM public.mls_listings
           WHERE community_id = $1
             AND ((assigned_agent_id IS NULL) <> (assigned_scope IS NULL))`,
          [F.community_id])
        assertEq(postCnt.rows[0].n, 0, 'T3: zero half-NULL rows post-reroll')

        // Sanity: at least SOME listings had their assignment changed
        // (the community-scoped ones, since their apa is now inactive).
        if (nUpdated < 1) {
          throw new Error(`T3 sanity: reroll returned 0 -- expected > 0 community-scoped rows to be touched`)
        }
        record('T3 empty-pool half-NULL absence', 'PASS',
               `community ${F.community_name}: ${nUpdated} rows touched, 0 half-NULL after`)
      } finally {
        await c.query('ROLLBACK TO SAVEPOINT s_t3')
      }
    }

    // ------------------------------------------------------------
    // T4: WALK-EQUIVALENCE. Two paths, identical setup, compare
    // final per-listing (agent, scope, source).
    //   Path A: call reroll_listings_at_geo (the new body).
    //   Path B: NULL the trio manually + PERFORM reresolve_listings_in_set.
    // Both savepoints execute the SAME mutation (deactivate community apa)
    // before the call so the input state matches.
    // ------------------------------------------------------------
    {
      // Collect the listing IDs that the reroll would touch (Step 1 collector).
      const idsR = await c.query(`
        SELECT id FROM public.mls_listings ml
         WHERE ml.community_id = $1
           AND (ml.assigned_scope IS NULL
                OR public.scope_specificity(ml.assigned_scope)
                   <= public.scope_specificity('community'))`,
        [F.community_id])
      const ids = idsR.rows.map(r => r.id)
      if (ids.length === 0) throw new Error('T4 setup: no eligible listings')

      // Path A
      const pathA = new Map()
      await c.query('SAVEPOINT s_t4a')
      try {
        await c.query(`SET LOCAL app.skip_apa_reroll = 'on'`)
        await c.query(`
          UPDATE public.agent_property_access
             SET is_active = FALSE
           WHERE tenant_id = $1 AND scope = 'community' AND community_id = $2`,
          [F.tenant_id, F.community_id])
        await c.query(`SELECT public.reroll_listings_at_geo('community', $1::uuid, $2::uuid)`,
                      [F.community_id, F.tenant_id])
        const r = await c.query(`
          SELECT id, assigned_agent_id, assigned_scope, assigned_source_id
            FROM public.mls_listings WHERE id = ANY($1::uuid[])`, [ids])
        for (const row of r.rows) {
          pathA.set(row.id, `${row.assigned_agent_id || 'null'}|${row.assigned_scope || 'null'}|${row.assigned_source_id || 'null'}`)
        }
      } finally {
        await c.query('ROLLBACK TO SAVEPOINT s_t4a')
      }

      // Path B
      const pathB = new Map()
      await c.query('SAVEPOINT s_t4b')
      try {
        await c.query(`SET LOCAL app.skip_apa_reroll = 'on'`)
        await c.query(`
          UPDATE public.agent_property_access
             SET is_active = FALSE
           WHERE tenant_id = $1 AND scope = 'community' AND community_id = $2`,
          [F.tenant_id, F.community_id])
        await c.query(`
          UPDATE public.mls_listings
             SET assigned_agent_id  = NULL,
                 assigned_scope     = NULL,
                 assigned_source_id = NULL
           WHERE id = ANY($1::uuid[])`, [ids])
        await c.query(`SELECT public.reresolve_listings_in_set($1::uuid[], $2::uuid)`,
                      [ids, F.tenant_id])
        const r = await c.query(`
          SELECT id, assigned_agent_id, assigned_scope, assigned_source_id
            FROM public.mls_listings WHERE id = ANY($1::uuid[])`, [ids])
        for (const row of r.rows) {
          pathB.set(row.id, `${row.assigned_agent_id || 'null'}|${row.assigned_scope || 'null'}|${row.assigned_source_id || 'null'}`)
        }
      } finally {
        await c.query('ROLLBACK TO SAVEPOINT s_t4b')
      }

      let mismatches = 0
      for (const [id, a] of pathA.entries()) {
        const b = pathB.get(id)
        if (a !== b) {
          mismatches++
          if (mismatches <= 3) console.log(`[smoke] T4 mismatch id=${id} A=${a} B=${b}`)
        }
      }
      assertEq(mismatches, 0, 'T4: walk-equivalence mismatch count')
      record('T4 walk-equivalence', 'PASS',
             `${ids.length} listings -- identical (agent, scope, source) on both paths`)
    }

    // ------------------------------------------------------------
    // T5: RETURN-VALUE CONTRACT. Capture pre-state agents; call the
    // function; capture post-state; assert returned n == COUNT(pre
    // agent != post agent).
    // ------------------------------------------------------------
    {
      await c.query('SAVEPOINT s_t5')
      try {
        await c.query(`SET LOCAL app.skip_apa_reroll = 'on'`)

        const eligR = await c.query(`
          SELECT id, assigned_agent_id FROM public.mls_listings ml
           WHERE ml.community_id = $1
             AND (ml.assigned_scope IS NULL
                  OR public.scope_specificity(ml.assigned_scope)
                     <= public.scope_specificity('community'))`,
          [F.community_id])
        const pre = new Map(eligR.rows.map(r => [r.id, r.assigned_agent_id]))

        await c.query(`
          UPDATE public.agent_property_access
             SET is_active = FALSE
           WHERE tenant_id = $1 AND scope = 'community' AND community_id = $2`,
          [F.tenant_id, F.community_id])

        const callR = await c.query(`
          SELECT public.reroll_listings_at_geo('community', $1::uuid, $2::uuid) AS n`,
          [F.community_id, F.tenant_id])
        const returnedN = callR.rows[0].n

        const postR = await c.query(`
          SELECT id, assigned_agent_id FROM public.mls_listings
           WHERE id = ANY($1::uuid[])`, [Array.from(pre.keys())])
        let diff = 0
        for (const row of postR.rows) {
          if ((pre.get(row.id) || null) !== (row.assigned_agent_id || null)) diff++
        }
        assertEq(returnedN, diff, 'T5: return value equals observed agent-diff count')
        record('T5 return-value contract', 'PASS',
               `n=${returnedN} == observed diff=${diff} (worker rowsUpdated metric intact)`)
      } finally {
        await c.query('ROLLBACK TO SAVEPOINT s_t5')
      }
    }

    await c.query('ROLLBACK')
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
  const allPass = results.every(r => r.status === 'PASS')
  process.exit(allPass ? 0 : 1)
})().catch(e => { console.error('smoke uncaught:', e); process.exit(1) })
