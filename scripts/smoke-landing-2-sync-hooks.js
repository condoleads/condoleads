#!/usr/bin/env node
/**
 * Smoke harness for Landing 2 sync-hook tail.
 *
 * Tests:
 *   T1. RPC integration: a runtime-SELECTed NULL-cache routable listing
 *       passed to reresolve_listings_in_set inside BEGIN/ROLLBACK resolves
 *       to a coupled trio (or returns NULL coherently). Rollback so the
 *       smoke leaves zero state.
 *
 *   T2. collectIdsForResolve algorithm (Event 5 + Event 6): a JS port of
 *       the geo-diff algorithm picks new rows + geo-changed rows, skips
 *       unchanged rows. Pure unit test, no DB.
 *
 *   T3. backfill .select('id') returns affected ids: pick a building with
 *       listings, run the geo UPDATE inside BEGIN/ROLLBACK with RETURNING id,
 *       assert returned ids match the count, rollback.
 *
 * Discipline:
 *   - One pg Client per probe; close it after each test (F-VERIFY-READONLY-HANG).
 *   - BEGIN/ROLLBACK on any DB-touching test.
 *   - Runtime-SELECTed ids only; no UUID literals except the verified
 *     WALLIAM_TENANT_ID from CLAUDE.md (used as a probe input, not a
 *     business-logic constant in the smoke).
 *   - Explicit column allow-list on every SELECT; never SELECT * on
 *     tenants/agents.
 */

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
// ^ Verified per CLAUDE.md "Verified key IDs". Probe input only.

function pass(test, msg) { console.log('  PASS: ' + test + ': ' + msg); }
function fail(test, msg) { console.error('  FAIL: ' + test + ': ' + msg); process.exitCode = 1; }
function short(id)        { return id ? String(id).substring(0, 8) + '...' : '<null>'; }
async function newClient() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
}

// T2 algorithm port (mirrors lib/utils/geo-diff.ts:collectIdsForResolve)
function geoChanged(a, b) {
  return a.area_id         !== b.area_id
      || a.municipality_id !== b.municipality_id
      || a.community_id    !== b.community_id
      || a.building_id     !== b.building_id;
}
function collectIdsForResolve(upsertedRows, previousByKey) {
  const out = [];
  for (const row of upsertedRows) {
    if (!row || !row.id) continue;
    const prev = previousByKey.get(row.listing_key);
    if (!prev) out.push(row.id);
    else if (geoChanged(prev, row)) out.push(row.id);
  }
  return out;
}

async function T1() {
  console.log('T1. RPC integration (NULL-cache routable -> coupled trio, rolled back)');
  const c = await newClient();
  try {
    await c.query('BEGIN');
    const pick = await c.query(`
      SELECT id FROM public.mls_listings
       WHERE assigned_agent_id IS NULL
         AND property_type IN ('Residential Condo & Other','Residential Freehold')
         AND municipality_id IS NOT NULL
       LIMIT 1
    `);
    if (pick.rows.length === 0) {
      pass('T1', 'no NULL-cache routable listing remaining (acceptable)');
      await c.query('ROLLBACK');
      return;
    }
    const id = pick.rows[0].id;
    const rpc = await c.query(
      'SELECT resolved_count, null_count FROM public.reresolve_listings_in_set($1::uuid[], $2::uuid)',
      [[id], WALLIAM_TENANT_ID]
    );
    const r = rpc.rows[0];
    if (r.resolved_count + r.null_count !== 1) {
      fail('T1', `counts sum to ${r.resolved_count + r.null_count}, expected 1`);
      await c.query('ROLLBACK');
      return;
    }
    const post = await c.query(
      'SELECT assigned_agent_id, assigned_scope, assigned_source_id FROM public.mls_listings WHERE id = $1',
      [id]
    );
    const p = post.rows[0];
    if (r.resolved_count === 1) {
      if (!p.assigned_agent_id || !p.assigned_scope || !p.assigned_source_id) {
        fail('T1', `coupled trio NOT set: agent=${p.assigned_agent_id}, scope=${p.assigned_scope}, source=${p.assigned_source_id}`);
      } else {
        pass('T1', `listing=${short(id)} resolved: agent=${short(p.assigned_agent_id)}, scope=${p.assigned_scope}`);
      }
    } else {
      pass('T1', `listing=${short(id)} stayed NULL-cache (no resolution for this geo)`);
    }
    await c.query('ROLLBACK');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) {}
    fail('T1', e.message);
  } finally {
    await c.end();
  }
}

function T2() {
  console.log('T2. collectIdsForResolve (Event 5 + Event 6 + skip-unchanged)');
  const previous = new Map([
    ['KEY-A', { id: 'id-A', listing_key: 'KEY-A', area_id: 'a1', municipality_id: 'm1', community_id: 'c1', building_id: null }],
    ['KEY-B', { id: 'id-B', listing_key: 'KEY-B', area_id: 'a1', municipality_id: 'm1', community_id: 'c1', building_id: null }],
  ]);
  const upserted = [
    { id: 'id-A', listing_key: 'KEY-A', area_id: 'a1', municipality_id: 'm1', community_id: 'c1', building_id: null },
    { id: 'id-B', listing_key: 'KEY-B', area_id: 'a1', municipality_id: 'm2', community_id: 'c1', building_id: null },
    { id: 'id-C', listing_key: 'KEY-C', area_id: 'a1', municipality_id: 'm1', community_id: 'c1', building_id: null },
  ];
  const result = collectIdsForResolve(upserted, previous);
  const set = new Set(result);
  if (set.size === 2 && set.has('id-B') && set.has('id-C') && !set.has('id-A')) {
    pass('T2', 'picked id-B (Event 6) + id-C (Event 5); skipped id-A (unchanged)');
  } else {
    fail('T2', `expected [id-B, id-C], got [${result.join(', ')}]`);
  }
  const r2 = collectIdsForResolve(
    [{ id: 'id-D', listing_key: 'KEY-D', area_id: null, municipality_id: null, community_id: null, building_id: 'b2' }],
    new Map([['KEY-D', { id: 'id-D', listing_key: 'KEY-D', area_id: null, municipality_id: null, community_id: null, building_id: 'b1' }]])
  );
  if (r2.length === 1 && r2[0] === 'id-D') pass('T2 (building_id change)', 'picked id-D');
  else fail('T2 (building_id change)', `got [${r2.join(', ')}]`);
  const r3 = collectIdsForResolve(
    [{ id: 'id-E', listing_key: 'KEY-E', area_id: null, municipality_id: null, community_id: null, building_id: null }],
    new Map([['KEY-E', { id: 'id-E', listing_key: 'KEY-E', area_id: null, municipality_id: null, community_id: null, building_id: null }]])
  );
  if (r3.length === 0) pass('T2 (NULL-vs-NULL)', 'skipped id-E');
  else fail('T2 (NULL-vs-NULL)', `got [${r3.join(', ')}]`);
}

async function T3() {
  console.log('T3. backfill .select(id) returns affected ids (BEGIN/UPDATE RETURNING id/ROLLBACK)');
  const c = await newClient();
  try {
    const pickBldg = await c.query(`
      SELECT building_id, COUNT(*)::int AS n
        FROM public.mls_listings
       WHERE building_id IS NOT NULL
       GROUP BY building_id
       ORDER BY COUNT(*) DESC
       LIMIT 1
    `);
    if (pickBldg.rows.length === 0) {
      pass('T3', 'no building with listings (acceptable)');
      return;
    }
    const buildingId = pickBldg.rows[0].building_id;
    const expectedCount = pickBldg.rows[0].n;
    await c.query('BEGIN');
    const upd = await c.query(`
      WITH g AS (
        SELECT area_id, municipality_id, community_id
          FROM public.mls_listings
         WHERE building_id = $1
         LIMIT 1
      )
      UPDATE public.mls_listings ml
         SET area_id = g.area_id, municipality_id = g.municipality_id, community_id = g.community_id
        FROM g
       WHERE ml.building_id = $1
      RETURNING ml.id
    `, [buildingId]);
    if (upd.rows.length === expectedCount) {
      pass('T3', `building=${short(buildingId)} UPDATE RETURNING id returned ${upd.rows.length} ids`);
    } else {
      fail('T3', `expected ${expectedCount}, got ${upd.rows.length}`);
    }
    await c.query('ROLLBACK');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) {}
    fail('T3', e.message);
  } finally {
    await c.end();
  }
}

(async () => {
  await T1();
  T2();
  await T3();
  console.log('');
  console.log(process.exitCode ? 'SMOKE: at least one test FAILED' : 'SMOKE: all tests PASSED');
})().catch((e) => { console.error('UNHANDLED: ' + e.message); process.exit(1); });
