#!/usr/bin/env node
/**
 * Smoke harness for P-LIFECYCLE Landing 3 Event 4 ASYNC HANDOFF.
 * Rewritten 2026-05-30 after Q1 reversed from sync to async (the synchronous
 * version of this harness, plus the original smoke output that exposed the
 * 8s ceiling problem, is in the backup .backup_<ts> of this file).
 *
 * The trigger now ENQUEUES (not reflows inline). The worker (route + GH cron)
 * drains the queue. Tests below cover both halves.
 *
 * Tests:
 *   T1. Trigger enqueues, mls_listings UNCHANGED. Deactivate a real agent
 *       in BEGIN/ROLLBACK; assert exactly 1 new pending queue row appears
 *       with (scope='agent', scope_id=agent.id) AND the agent's
 *       mls_listings rows are STILL pointed at them (no inline reflow).
 *       ROLLBACK.
 *
 *   T2. GAP-5: leads.agent_id NOT touched. Same as T1, plus pre/post-read
 *       any lead stamped to this agent; assert leads.agent_id unchanged.
 *       (Was trivially true under sync because reflow only writes
 *       mls_listings; under async it's EVEN MORE trivially true because the
 *       trigger only INSERTs into the queue. Kept as a regression guard.)
 *       ROLLBACK.
 *
 *   T3. Idempotency / coalesce. Deactivate -> reactivate -> deactivate
 *       inside BEGIN/ROLLBACK. Assert exactly 1 pending queue row (not 2)
 *       for (scope='agent', scope_id=agent.id). The middle reactivation
 *       triggers no enqueue (WHEN clause filters out FALSE->TRUE); the
 *       second deactivation hits ON CONFLICT DO NOTHING. ROLLBACK.
 *
 *   T4. Reactivation no-op. UPDATE is_active TRUE->TRUE on an already-active
 *       agent; the WHEN clause matches nothing, no enqueue, no mls_listings
 *       change. ROLLBACK.
 *
 *   T5. Non-trigger column no-op. UPDATE updated_at on the agent; the
 *       trigger is scoped to UPDATE OF is_active, is_selling, so this
 *       fires NO trigger. No enqueue, no mls_listings change. ROLLBACK.
 *
 *   T6. Worker drain end-to-end. Inside BEGIN/ROLLBACK with
 *       SET LOCAL statement_timeout = 0 (mirrors the worker route's
 *       posture): deactivate the agent (enqueue), claim the queue row via
 *       FOR UPDATE SKIP LOCKED, call reflow_deactivated_agent with
 *       (agent_id, tenant_id), mark the queue row done, then assert the
 *       tightened re-fill semantics (every pre-set row now (a) NOT the
 *       dead agent AND (b) coupled trio satisfied; AND if any rows are
 *       NULL, a corresponding tenant_floor_alerts row exists in the tx).
 *       ROLLBACK.
 *
 * Discipline (unchanged from the sync smoke):
 *   - One pg Client per probe; close after each test (F-VERIFY-READONLY-HANG).
 *   - BEGIN/ROLLBACK on every DB-touching test.
 *   - SET LOCAL statement_timeout = 0 inside each BEGIN (the held smoke fix;
 *     now in scope because each test's tx mutates a real agent and the work
 *     to verify reflow correctness in T6 is large).
 *   - Runtime-SELECTed ids; no UUID literals except the verified
 *     WALLIAM_TENANT_ID from CLAUDE.md (probe input only).
 *   - Never SELECT * on agents/tenants.
 */

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
// Verified per CLAUDE.md "Verified key IDs". Probe input only.

function pass(test, msg) { console.log('  PASS: ' + test + ': ' + msg); }
function fail(test, msg) { console.error('  FAIL: ' + test + ': ' + msg); process.exitCode = 1; }
function skip(test, msg) { console.log('  SKIP: ' + test + ': ' + msg); }
function short(id)       { return id ? String(id).substring(0, 8) + '...' : '<null>'; }

async function newClient() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
}

// Each test BEGINs a tx, SETs LOCAL statement_timeout = 0, does work, ROLLBACKs.
async function withTx(fn) {
  const c = await newClient();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL statement_timeout = 0');
    await fn(c);
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    await c.end();
  }
}

async function pickTestAgent(c) {
  // Active+selling agent who currently owns mls_listings rows. Ordered by
  // size DESC so we exercise a realistic (non-trivial) reflow in T6.
  const r = await c.query(`
    SELECT a.id AS agent_id, a.tenant_id, COUNT(ml.id)::int AS listing_count
      FROM public.agents a
      JOIN public.mls_listings ml ON ml.assigned_agent_id = a.id
     WHERE a.is_active = TRUE
       AND a.is_selling = TRUE
       AND a.tenant_id IS NOT NULL
     GROUP BY a.id, a.tenant_id
     HAVING COUNT(ml.id) > 0
     ORDER BY COUNT(ml.id) DESC
     LIMIT 1
  `);
  return r.rows[0] || null;
}

async function pendingQueueCount(c, tenantId, agentId) {
  const r = await c.query(
    "SELECT COUNT(*)::int AS n FROM public.territory_reroll_queue WHERE tenant_id=$1 AND scope='agent' AND scope_id=$2 AND status='pending'",
    [tenantId, agentId]
  );
  return r.rows[0].n;
}

async function listingsOwned(c, agentId) {
  const r = await c.query(
    'SELECT COUNT(*)::int AS n FROM public.mls_listings WHERE assigned_agent_id = $1',
    [agentId]
  );
  return r.rows[0].n;
}

async function T1() {
  console.log('T1. Trigger enqueues (mls_listings unchanged)');
  await withTx(async (c) => {
    const test = await pickTestAgent(c);
    if (!test) return skip('T1', 'no active+selling agent with listings');
    const { agent_id, tenant_id, listing_count } = test;
    console.log('  setup: agent=' + short(agent_id) + ' tenant=' + short(tenant_id) + ' owns ' + listing_count);

    const preQ = await pendingQueueCount(c, tenant_id, agent_id);

    await c.query('UPDATE public.agents SET is_active = FALSE WHERE id = $1', [agent_id]);

    const postQ    = await pendingQueueCount(c, tenant_id, agent_id);
    const postOwn  = await listingsOwned(c, agent_id);

    if (postOwn !== listing_count) {
      fail('T1', 'mls_listings count changed: ' + listing_count + ' -> ' + postOwn + ' (expected unchanged; async = no inline reflow)');
      return;
    }
    if (postQ !== preQ + 1) {
      fail('T1', 'queue rows for (tenant, agent, agent) not +1: ' + preQ + ' -> ' + postQ);
      return;
    }
    // Spot-check the row shape
    const row = await c.query(
      "SELECT scope, scope_id, status FROM public.territory_reroll_queue WHERE tenant_id=$1 AND scope='agent' AND scope_id=$2 AND status='pending' LIMIT 1",
      [tenant_id, agent_id]
    );
    if (row.rows.length !== 1 || row.rows[0].scope !== 'agent' || row.rows[0].scope_id !== agent_id || row.rows[0].status !== 'pending') {
      fail('T1', 'enqueued row shape wrong: ' + JSON.stringify(row.rows[0]));
      return;
    }
    pass('T1', 'deactivation enqueued 1 pending row; mls_listings unchanged (' + postOwn + ')');
  });
}

async function T2() {
  console.log('T2. GAP-5: leads.agent_id NOT touched by enqueue');
  await withTx(async (c) => {
    const test = await pickTestAgent(c);
    if (!test) return skip('T2', 'no active+selling agent with listings');
    const { agent_id } = test;

    const leadRes = await c.query(
      'SELECT id, agent_id, tenant_id, updated_at FROM public.leads WHERE agent_id = $1 LIMIT 1',
      [agent_id]
    );
    if (leadRes.rows.length === 0) {
      return skip('T2', 'no leads stamped to test agent ' + short(agent_id) + ' (assertion vacuous)');
    }
    const preLead = leadRes.rows[0];

    await c.query('UPDATE public.agents SET is_active = FALSE WHERE id = $1', [agent_id]);

    const postLead = (await c.query(
      'SELECT id, agent_id, tenant_id, updated_at FROM public.leads WHERE id = $1',
      [preLead.id]
    )).rows[0];

    if (postLead.agent_id !== preLead.agent_id) {
      fail('T2', 'lead.agent_id changed: ' + short(preLead.agent_id) + ' -> ' + short(postLead.agent_id));
      return;
    }
    pass('T2', 'lead ' + short(preLead.id) + ' still stamped to ' + short(preLead.agent_id) + ' after agent deactivation');
  });
}

async function T3() {
  console.log('T3. Idempotency: deactivate -> reactivate -> deactivate coalesces to ONE pending row');
  await withTx(async (c) => {
    const test = await pickTestAgent(c);
    if (!test) return skip('T3', 'no active+selling agent with listings');
    const { agent_id, tenant_id } = test;

    const preQ = await pendingQueueCount(c, tenant_id, agent_id);

    await c.query('UPDATE public.agents SET is_active = FALSE WHERE id = $1', [agent_id]); // enqueue
    await c.query('UPDATE public.agents SET is_active = TRUE  WHERE id = $1', [agent_id]); // WHEN-clause no-op
    await c.query('UPDATE public.agents SET is_active = FALSE WHERE id = $1', [agent_id]); // ON CONFLICT DO NOTHING

    const postQ = await pendingQueueCount(c, tenant_id, agent_id);
    if (postQ !== preQ + 1) {
      fail('T3', 'coalesce broken: pending queue rows ' + preQ + ' -> ' + postQ + ' (expected +1)');
      return;
    }
    pass('T3', 'three updates coalesced to 1 pending row (preQ=' + preQ + ', postQ=' + postQ + ')');
  });
}

async function T4() {
  console.log('T4. Reactivation TRUE->TRUE: WHEN clause skips, no enqueue');
  await withTx(async (c) => {
    const test = await pickTestAgent(c);
    if (!test) return skip('T4', 'no active+selling agent');
    const { agent_id, tenant_id } = test;

    const preQ   = await pendingQueueCount(c, tenant_id, agent_id);
    const preOwn = await listingsOwned(c, agent_id);

    await c.query('UPDATE public.agents SET is_active = TRUE WHERE id = $1', [agent_id]);

    const postQ   = await pendingQueueCount(c, tenant_id, agent_id);
    const postOwn = await listingsOwned(c, agent_id);

    if (postQ !== preQ) {
      fail('T4', 'no-op UPDATE enqueued: ' + preQ + ' -> ' + postQ);
      return;
    }
    if (postOwn !== preOwn) {
      fail('T4', 'no-op UPDATE changed mls_listings: ' + preOwn + ' -> ' + postOwn);
      return;
    }
    pass('T4', 'TRUE->TRUE caused 0 enqueue, 0 mls_listings change');
  });
}

async function T5() {
  console.log('T5. Non-trigger column UPDATE: trigger does not fire');
  await withTx(async (c) => {
    const test = await pickTestAgent(c);
    if (!test) return skip('T5', 'no active+selling agent');
    const { agent_id, tenant_id } = test;

    const preQ   = await pendingQueueCount(c, tenant_id, agent_id);
    const preOwn = await listingsOwned(c, agent_id);

    await c.query('UPDATE public.agents SET updated_at = now() WHERE id = $1', [agent_id]);

    const postQ   = await pendingQueueCount(c, tenant_id, agent_id);
    const postOwn = await listingsOwned(c, agent_id);

    if (postQ !== preQ) {
      fail('T5', 'updated_at touch enqueued: ' + preQ + ' -> ' + postQ);
      return;
    }
    if (postOwn !== preOwn) {
      fail('T5', 'updated_at touch changed mls_listings: ' + preOwn + ' -> ' + postOwn);
      return;
    }
    pass('T5', 'updated_at-only UPDATE caused 0 enqueue, 0 mls_listings change');
  });
}

async function T6() {
  console.log('T6. Worker drain end-to-end: enqueue + claim + reflow + verify re-fill');
  await withTx(async (c) => {
    const test = await pickTestAgent(c);
    if (!test) return skip('T6', 'no active+selling agent with listings');
    const { agent_id, tenant_id, listing_count } = test;
    console.log('  setup: agent=' + short(agent_id) + ' tenant=' + short(tenant_id) + ' owns ' + listing_count);

    // Capture pre-state set + alert count
    const preIds = (await c.query(
      'SELECT id FROM public.mls_listings WHERE assigned_agent_id = $1',
      [agent_id]
    )).rows.map(r => r.id);
    const preAlerts = (await c.query(
      'SELECT COUNT(*)::int AS n FROM public.tenant_floor_alerts WHERE tenant_id = $1',
      [tenant_id]
    )).rows[0].n;

    // (a) Fire deactivation -> trigger enqueues
    await c.query('UPDATE public.agents SET is_active = FALSE WHERE id = $1', [agent_id]);

    // (b) Simulate the worker: claim one pending row via FOR UPDATE SKIP LOCKED
    const claim = await c.query(`
      UPDATE public.territory_reroll_queue
         SET status = 'processing', started_at = now()
       WHERE id = (
         SELECT id FROM public.territory_reroll_queue
          WHERE tenant_id = $1 AND status = 'pending' AND scope = 'agent' AND scope_id = $2
          ORDER BY requested_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
       RETURNING id, scope, scope_id
    `, [tenant_id, agent_id]);
    if (claim.rowCount !== 1) {
      fail('T6', 'no row claimed for (tenant, agent, agent_id) -- enqueue did not produce a drainable row');
      return;
    }

    // (c) Call reflow_deactivated_agent (the same function the worker route calls)
    const reflow = await c.query(
      'SELECT reflowed_count, null_count FROM public.reflow_deactivated_agent($1::uuid, $2::uuid)',
      [agent_id, tenant_id]
    );
    const r = reflow.rows[0];

    // (d) Mark the queue row done (mirrors the worker route)
    await c.query(
      "UPDATE public.territory_reroll_queue SET status='done', processed_at=now(), rows_updated=$1 WHERE id=$2",
      [r.reflowed_count + r.null_count, claim.rows[0].id]
    );

    // (e) Assert agent no longer owns listings
    const postOwn = await listingsOwned(c, agent_id);
    if (postOwn !== 0) {
      fail('T6', 'agent still owns ' + postOwn + ' rows after reflow drain');
      return;
    }

    // (f) Tightened re-fill assertion (from the prior smoke):
    //  - pre-set survives in size
    //  - no row points at the dead agent
    //  - every row's coupled trio is satisfied (all-NULL OR all-non-NULL)
    //  - if any row is NULL, tenant_floor_alerts grew by >= 1 in the tx
    //  - if zero rows are NULL, reassigned must equal preIds.length
    const postSet = await c.query(`
      SELECT id, assigned_agent_id, assigned_scope, assigned_source_id
        FROM public.mls_listings
       WHERE id = ANY($1::uuid[])
    `, [preIds]);
    if (postSet.rows.length !== preIds.length) {
      fail('T6', 'pre-set size shrank: ' + postSet.rows.length + ' vs ' + preIds.length);
      return;
    }
    let reassigned = 0;
    let nullified  = 0;
    let coupledBad = 0;
    for (const row of postSet.rows) {
      const a = row.assigned_agent_id, s = row.assigned_scope, src = row.assigned_source_id;
      if (a === agent_id) {
        fail('T6', 'row ' + short(row.id) + ' still points at the dead agent');
        return;
      }
      const allNull = (a === null && s === null && src === null);
      const allSet  = (a !== null && s !== null && src !== null);
      if (!allNull && !allSet) coupledBad++;
      if (allNull) nullified++;
      if (allSet)  reassigned++;
    }
    if (coupledBad > 0) {
      fail('T6', coupledBad + ' rows violate the coupled CHECK');
      return;
    }
    if (nullified === 0) {
      if (reassigned !== preIds.length) {
        fail('T6', 'reassigned (' + reassigned + ') != preset (' + preIds.length + ') with zero nullified -- silent loss');
        return;
      }
    } else {
      const postAlerts = (await c.query(
        'SELECT COUNT(*)::int AS n FROM public.tenant_floor_alerts WHERE tenant_id = $1',
        [tenant_id]
      )).rows[0].n;
      const alertDelta = postAlerts - preAlerts;
      if (alertDelta < 1) {
        fail('T6', nullified + ' rows nullified but alert delta=' + alertDelta + ' (unjustified NULL)');
        return;
      }
      console.log('  T6 empty-pool proof: ' + nullified + ' NULL + ' + alertDelta + ' new floor_alert row(s)');
    }
    pass('T6', 'enqueue+claim+reflow drained ' + listing_count + ' listings; ' + reassigned + ' reflowed, ' + nullified + ' NULL');
  });
}

async function T7() {
  // T7 (added 2026-05-30 after F-EVENT-4-ASYNC-PERMISSION-DENIED): the
  // production-path test under service_role. T1-T6 all connect as postgres
  // via DATABASE_URL and would PASS even with the SECURITY INVOKER bug that
  // breaks the admin route. This test is the one that would have caught it.
  //
  // Pattern (mirrors the apply runner's post-COMMIT V2 and the migration's
  // in-tx V2): pre-state read under postgres, SET LOCAL ROLE service_role,
  // UPDATE agents (fires trigger), RESET ROLE, post-state read under
  // postgres. Queue reads NEVER happen under service_role (the lesson from
  // F-APPLY-RUNNER-V3-SERVICE-ROLE-PROBE-PATTERN).
  console.log('T7. PRODUCTION-PATH: SET LOCAL ROLE service_role; UPDATE agents (enqueue must succeed)');
  await withTx(async (c) => {
    const test = await pickTestAgent(c);
    if (!test) return skip('T7', 'no active+selling agent with listings');
    const { agent_id, tenant_id } = test;

    const preQ = await pendingQueueCount(c, tenant_id, agent_id);
    console.log('  pre-queue (postgres SELECT): ' + preQ);

    await c.query('SET LOCAL ROLE service_role');
    let updateErr = null;
    try {
      await c.query('UPDATE public.agents SET is_active = FALSE WHERE id = $1', [agent_id]);
    } catch (e) {
      updateErr = e.message;
    }
    await c.query('RESET ROLE');

    if (updateErr) {
      fail('T7', 'service_role UPDATE raised: ' + updateErr + ' (production path still broken)');
      return;
    }

    const postQ = await pendingQueueCount(c, tenant_id, agent_id);
    console.log('  post-queue (postgres SELECT): ' + postQ);

    if (postQ !== preQ + 1) {
      fail('T7', 'service_role UPDATE succeeded but queue did not grow by 1: ' + preQ + ' -> ' + postQ);
      return;
    }
    pass('T7', 'service_role UPDATE on agent ' + short(agent_id) + ' fired trigger; queue grew by 1');
  });
}

(async () => {
  console.log('=================================================');
  console.log('Smoke: P-LIFECYCLE Landing 3 Event 4 ASYNC HANDOFF');
  console.log('  WALLIAM_TENANT_ID (probe input only): ' + WALLIAM_TENANT_ID);
  console.log('=================================================');
  await T1();
  await T2();
  await T3();
  await T4();
  await T5();
  await T6();
  await T7();
  if (process.exitCode === 1) {
    console.log('=== SMOKE FAILED ===');
    process.exit(1);
  } else {
    console.log('=== SMOKE PASSED ===');
  }
})().catch((e) => {
  console.error('UNHANDLED: ' + e.message);
  process.exit(1);
});
