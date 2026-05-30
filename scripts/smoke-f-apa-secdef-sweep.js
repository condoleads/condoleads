#!/usr/bin/env node
/**
 * Smoke harness for F-apa-secdef-sweep.
 *
 * Tests (all SAVEPOINT-style via BEGIN/ROLLBACK per probe, .on('error')
 * handler attached, small fixture per F-SMOKE-CONNECTION-DROP-ON-LARGE-
 * REFLOW lesson -- aily-tenant agent + smallest community):
 *
 *   T1. service_role INSERT on agent_property_access -- the production
 *       path failure mode we fixed. With skip_apa_reroll='on', the
 *       trigger ENQUEUES. Assert queue grew by 1 (the INSERT into the
 *       postgres-only-granted territory_reroll_queue succeeded via the
 *       DEFINER chain). ROLLBACK.
 *
 *   T2. service_role UPDATE on agent_property_access -- same shape but
 *       for handle_apa_update. ROLLBACK.
 *
 *   T3. service_role DELETE on agent_property_access -- same shape for
 *       handle_apa_delete. ROLLBACK.
 *
 *   T4. SYNC path (no skip_apa_reroll GUC) -- the inner-function
 *       inheritance proof. INSERT under service_role exercises the full
 *       chain: handle_apa_insert -> audit INSERT -> reroll_listings_at_geo
 *       PERFORM. If any inner INVOKER function fails to inherit postgres
 *       privileges through the DEFINER chain, the INSERT raises.
 *       Asserts no error + audit row appears. Uses the smallest community
 *       to keep reroll wall-clock low. ROLLBACK.
 *
 *   T5. apa_mutation_lock_trigger metadata -- still INVOKER, no
 *       search_path. Read-only probe.
 *
 * Discipline:
 *   - One pg Client per probe; close after each test.
 *   - BEGIN/ROLLBACK on every DB-touching test.
 *   - SET LOCAL statement_timeout = 0 inside each BEGIN.
 *   - .on('error', ...) handler attached to every Client (F-SMOKE-
 *     CONNECTION-DROP-ON-LARGE-REFLOW lesson).
 *   - Runtime-SELECTed ids only; no UUID literals.
 *   - LESSON pattern: queue reads under postgres, role-switch confined
 *     to the trigger-firing mutation, RESET ROLE before post-state read.
 */

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

function pass(test, msg) { console.log('  PASS: ' + test + ': ' + msg); }
function fail(test, msg) { console.error('  FAIL: ' + test + ': ' + msg); process.exitCode = 1; }
function skip(test, msg) { console.log('  SKIP: ' + test + ': ' + msg); }
function short(id)       { return id ? String(id).substring(0, 8) + '...' : '<null>'; }

async function newClient() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on('error', (e) => console.error('  CLIENT ERROR (handled): ' + e.message));
  await c.connect();
  return c;
}

// Wrapper: BEGIN, SET LOCAL statement_timeout=0, run, ROLLBACK.
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

async function pickAilyAgentAndCommunity(c) {
  const a = await c.query(`
    SELECT a.id, a.tenant_id FROM public.agents a
    JOIN public.tenants t ON t.id = a.tenant_id
    WHERE a.is_active=TRUE AND a.is_selling=TRUE AND a.tenant_id IS NOT NULL
      AND t.source_key = 'aily'
    LIMIT 1
  `);
  if (a.rows.length === 0) return null;
  const cm = await c.query('SELECT id FROM public.communities LIMIT 1');
  if (cm.rows.length === 0) return null;
  return { agent_id: a.rows[0].id, tenant_id: a.rows[0].tenant_id, community_id: cm.rows[0].id };
}

async function queuePendingCount(c, tenantId, scope, scopeId) {
  const r = await c.query(
    "SELECT COUNT(*)::int AS n FROM public.territory_reroll_queue WHERE tenant_id=$1 AND scope=$2 AND scope_id=$3 AND status='pending'",
    [tenantId, scope, scopeId]
  );
  return r.rows[0].n;
}

async function T1() {
  console.log('T1. service_role INSERT -> handle_apa_insert enqueues');
  await withTx(async (c) => {
    const fixture = await pickAilyAgentAndCommunity(c);
    if (!fixture) return skip('T1', 'no aily agent or no community');
    const { agent_id, tenant_id, community_id } = fixture;
    console.log('  fixture: agent=' + short(agent_id) + ' tenant=' + short(tenant_id) + ' community=' + short(community_id));

    const preQ = await queuePendingCount(c, tenant_id, 'community', community_id);

    await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
    await c.query('SET LOCAL ROLE service_role');
    let err = null;
    try {
      await c.query(`
        INSERT INTO public.agent_property_access
          (agent_id, tenant_id, scope, community_id, is_active, is_primary,
           condo_access, homes_access, buildings_access, buildings_mode)
        VALUES
          ($1, $2, 'community', $3, TRUE, FALSE, TRUE, TRUE, FALSE, 'manual')
      `, [agent_id, tenant_id, community_id]);
    } catch (e) { err = e.message; }
    await c.query('RESET ROLE');

    if (err) return fail('T1', 'service_role INSERT raised: ' + err);

    const postQ = await queuePendingCount(c, tenant_id, 'community', community_id);
    if (postQ !== preQ + 1) return fail('T1', 'queue delta != 1: ' + preQ + ' -> ' + postQ);
    pass('T1', 'service_role INSERT enqueued via handle_apa_insert (' + preQ + ' -> ' + postQ + ')');
  });
}

async function T2() {
  console.log('T2. service_role UPDATE -> handle_apa_update enqueues');
  await withTx(async (c) => {
    const fixture = await pickAilyAgentAndCommunity(c);
    if (!fixture) return skip('T2', 'no aily agent or no community');
    const { agent_id, tenant_id, community_id } = fixture;

    // Setup: insert as postgres + GUC=on (so the setup INSERT enqueues
    // quickly), then drain the setup's queue row so the test measurement
    // is clean.
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
    const ins = await c.query(`
      INSERT INTO public.agent_property_access
        (agent_id, tenant_id, scope, community_id, is_active, is_primary,
         condo_access, homes_access, buildings_access, buildings_mode)
      VALUES
        ($1, $2, 'community', $3, TRUE, FALSE, TRUE, TRUE, FALSE, 'manual')
      RETURNING id
    `, [agent_id, tenant_id, community_id]);
    const apaId = ins.rows[0].id;
    await c.query("DELETE FROM public.territory_reroll_queue WHERE tenant_id=$1 AND scope='community' AND scope_id=$2 AND status='pending'", [tenant_id, community_id]);
    const preQ = await queuePendingCount(c, tenant_id, 'community', community_id);

    // Test: under service_role, UPDATE.
    await c.query('SET LOCAL ROLE service_role');
    let err = null;
    try {
      // is_active is in handle_apa_update's v_routing_changed predicate;
      // is_primary alone is NOT (writes audit row but does NOT enqueue).
      // Setup above inserts with is_active=TRUE, so this UPDATE is a
      // genuine TRUE->FALSE transition. GUC=on keeps this in the async
      // queue-INSERT branch.
      await c.query('UPDATE public.agent_property_access SET is_active = FALSE, updated_at = now() WHERE id = $1', [apaId]);
    } catch (e) { err = e.message; }
    await c.query('RESET ROLE');

    if (err) return fail('T2', 'service_role UPDATE raised: ' + err);

    const postQ = await queuePendingCount(c, tenant_id, 'community', community_id);
    if (postQ !== preQ + 1) return fail('T2', 'queue delta != 1: ' + preQ + ' -> ' + postQ);
    pass('T2', 'service_role UPDATE enqueued via handle_apa_update (' + preQ + ' -> ' + postQ + ')');
  });
}

async function T3() {
  console.log('T3. service_role DELETE -> handle_apa_delete enqueues');
  await withTx(async (c) => {
    const fixture = await pickAilyAgentAndCommunity(c);
    if (!fixture) return skip('T3', 'no aily agent or no community');
    const { agent_id, tenant_id, community_id } = fixture;

    await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
    const ins = await c.query(`
      INSERT INTO public.agent_property_access
        (agent_id, tenant_id, scope, community_id, is_active, is_primary,
         condo_access, homes_access, buildings_access, buildings_mode)
      VALUES
        ($1, $2, 'community', $3, TRUE, FALSE, TRUE, TRUE, FALSE, 'manual')
      RETURNING id
    `, [agent_id, tenant_id, community_id]);
    const apaId = ins.rows[0].id;
    await c.query("DELETE FROM public.territory_reroll_queue WHERE tenant_id=$1 AND scope='community' AND scope_id=$2 AND status='pending'", [tenant_id, community_id]);
    const preQ = await queuePendingCount(c, tenant_id, 'community', community_id);

    await c.query('SET LOCAL ROLE service_role');
    let err = null;
    try {
      await c.query('DELETE FROM public.agent_property_access WHERE id = $1', [apaId]);
    } catch (e) { err = e.message; }
    await c.query('RESET ROLE');

    if (err) return fail('T3', 'service_role DELETE raised: ' + err);

    const postQ = await queuePendingCount(c, tenant_id, 'community', community_id);
    if (postQ !== preQ + 1) return fail('T3', 'queue delta != 1: ' + preQ + ' -> ' + postQ);
    pass('T3', 'service_role DELETE enqueued via handle_apa_delete (' + preQ + ' -> ' + postQ + ')');
  });
}

async function T4() {
  console.log('T4. SYNC path: full chain (handle_apa_insert + reroll_listings_at_geo inner PERFORM) under service_role');
  await withTx(async (c) => {
    const a = await c.query(`
      SELECT a.id, a.tenant_id FROM public.agents a
      JOIN public.tenants t ON t.id = a.tenant_id
      WHERE a.is_active=TRUE AND a.is_selling=TRUE AND a.tenant_id IS NOT NULL
        AND t.source_key = 'aily'
      LIMIT 1
    `);
    if (a.rows.length === 0) return skip('T4', 'no aily agent');
    const { id: agent_id, tenant_id } = a.rows[0];

    // Smallest community by mls_listings count -- keeps reroll wall-clock low.
    const cm = await c.query(`
      SELECT c.id FROM public.communities c
      LEFT JOIN public.mls_listings ml ON ml.community_id = c.id
      GROUP BY c.id
      ORDER BY COUNT(ml.id) ASC
      LIMIT 1
    `);
    if (cm.rows.length === 0) return skip('T4', 'no communities');
    const community_id = cm.rows[0].id;
    console.log('  fixture: agent=' + short(agent_id) + ' community=' + short(community_id) + ' (smallest by listing count)');

    const preAudit = (await c.query(
      "SELECT COUNT(*)::int AS n FROM public.territory_assignment_changes WHERE tenant_id=$1 AND agent_id=$2 AND change_type='assignment_granted'",
      [tenant_id, agent_id]
    )).rows[0].n;

    // NO skip_apa_reroll GUC -- forces SYNC path (PERFORM reroll_listings_at_geo).
    await c.query('SET LOCAL ROLE service_role');
    let err = null;
    try {
      await c.query(`
        INSERT INTO public.agent_property_access
          (agent_id, tenant_id, scope, community_id, is_active, is_primary,
           condo_access, homes_access, buildings_access, buildings_mode)
        VALUES
          ($1, $2, 'community', $3, TRUE, FALSE, TRUE, TRUE, FALSE, 'manual')
      `, [agent_id, tenant_id, community_id]);
    } catch (e) { err = e.message; }
    await c.query('RESET ROLE');

    if (err) return fail('T4', 'SYNC-path INSERT under service_role raised: ' + err + ' -- inner PERFORM did NOT inherit postgres privileges');

    const postAudit = (await c.query(
      "SELECT COUNT(*)::int AS n FROM public.territory_assignment_changes WHERE tenant_id=$1 AND agent_id=$2 AND change_type='assignment_granted'",
      [tenant_id, agent_id]
    )).rows[0].n;
    if (postAudit !== preAudit + 1) return fail('T4', 'audit row not inserted: ' + preAudit + ' -> ' + postAudit);

    pass('T4', 'full chain under service_role (audit INSERT + reroll_listings_at_geo PERFORM) -- inner-function inheritance verified');
  });
}

async function T5() {
  console.log('T5. apa_mutation_lock_trigger metadata (still INVOKER, no search_path)');
  await withTx(async (c) => {
    const r = await c.query(
      "SELECT prosecdef, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='apa_mutation_lock_trigger'"
    );
    if (!r.rows[0]) return fail('T5', 'apa_mutation_lock_trigger missing');
    if (r.rows[0].prosecdef !== false) return fail('T5', 'apa_mutation_lock_trigger.prosecdef=' + r.rows[0].prosecdef + ' (expected false; this fn intentionally stays INVOKER)');
    if (r.rows[0].proconfig !== null) return fail('T5', 'apa_mutation_lock_trigger.proconfig=' + JSON.stringify(r.rows[0].proconfig) + ' (expected null)');
    pass('T5', 'apa_mutation_lock_trigger unchanged: INVOKER, no search_path lock (intentional -- body only takes advisory lock, no table writes)');
  });
}

(async () => {
  console.log('=================================================');
  console.log('Smoke: F-apa-secdef-sweep');
  console.log('=================================================');
  await T1();
  await T2();
  await T3();
  await T4();
  await T5();
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
