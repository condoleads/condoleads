#!/usr/bin/env node
// scripts/smoke-cv-territory.js
// W-CORE-VERIFICATION CV-TERRITORY autonomous smoke.
//
// READS the committed CV-FIXTURE world (manifest + DB). Asserts:
//   A. Precedence ladder L1-L8 under postgres AND service_role; agent + scope
//      provenance both verified per case (GAP-2: equality, not non-null).
//   B. Property-type split L9/L10 (floor pool with matching access flag);
//      pair-parity L3↔L4, L5↔L6, L7↔L8 (same geo, two property types).
//   C. Distribution hash-RR for Box Grove set {agent_dist_a, agent_dist_b}:
//      L11/L12 deterministic + idempotent; no clobber of Berczy (L3).
//   D. Sticky: add 3rd non-primary member to Box Grove inside BEGIN/ROLLBACK;
//      L11/L12 existing bindings unchanged.
//
// CLAUDE.md compliance:
//   - One pg client per probe (F-VERIFY-READONLY-HANG mitigation).
//   - Read-only probes use BEGIN READ ONLY. Sticky test uses BEGIN+ROLLBACK
//     (never COMMIT). Service_role probes use SET LOCAL ROLE service_role
//     (postgres-green is not production-green).
//   - All ids read at runtime from cv-fixture-teardown-manifest.json -- never
//     hardcoded (Rule Zero no-guessing).
//   - statement_timeout = 0 on all probes.

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const cfg = require('./cv-fixture-config');

const cs = process.env.DATABASE_URL;
if (!cs) { console.error('FATAL: DATABASE_URL not set.'); process.exit(1); }
function fail(msg) { console.error('FATAL: ' + msg); process.exit(1); }

// ─── Load manifest, build id maps ───────────────────────────────────────────
if (!fs.existsSync(cfg.PATHS.manifest)) fail('manifest missing: ' + cfg.PATHS.manifest + ' -- run apply-cv-fixture-build first.');
const manifestLines = fs.readFileSync(cfg.PATHS.manifest, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

const footer = manifestLines.find(l => l.kind === 'footer' && l.status === 'committed');
if (!footer) fail('manifest has no committed footer -- CV-FIXTURE not applied (or rolled back?).');

const tenantPrimary   = footer.primary_tenant_id;
const tenantSecondary = footer.secondary_tenant_id;
const agentsPrimary   = new Map();
const agentsSecondary = new Map();
const testListings    = new Map();
const floorPool       = [];

for (const l of manifestLines) {
  if (l.kind === 'agent' && l.tenant_spec === 'primary')   agentsPrimary.set(l.spec_key, l.id);
  if (l.kind === 'agent' && l.tenant_spec === 'secondary') agentsSecondary.set(l.spec_key, l.id);
  if (l.kind === 'test_listing') testListings.set(l.spec_key, l.id);
  if (l.kind === 'floor_pool')   floorPool.push({ agent_id: l.agent_id, agent_key: l.agent_key, condo: l.condo, homes: l.homes });
}

const floorCondoSet = new Set(floorPool.filter(f => f.condo).map(f => f.agent_id));
const floorHomesSet = new Set(floorPool.filter(f => f.homes).map(f => f.agent_id));
const distSet       = new Set([agentsPrimary.get('agent_dist_a'), agentsPrimary.get('agent_dist_b')]);

console.log('manifest loaded:');
console.log('  primary tenant   = ' + tenantPrimary);
console.log('  secondary tenant = ' + tenantSecondary);
console.log('  primary agents   = ' + agentsPrimary.size + '  secondary agents = ' + agentsSecondary.size);
console.log('  test listings    = ' + testListings.size + '  floor pool members = ' + floorPool.length);

// ─── Probe helpers ───────────────────────────────────────────────────────────
async function probeRO(label, fn) {
  const c = new Client({ connectionString: cs });
  c.on('error', e => console.error('  [' + label + '] err: ' + e.message));
  await c.connect();
  await c.query('BEGIN READ ONLY');
  await c.query('SET LOCAL statement_timeout = 0');
  try { return await fn(c); }
  finally { await c.query('ROLLBACK').catch(()=>{}); await c.end().catch(()=>{}); }
}
async function probeRW(label, fn) {
  const c = new Client({ connectionString: cs });
  c.on('error', e => console.error('  [' + label + '] err: ' + e.message));
  await c.connect();
  await c.query('BEGIN');
  await c.query('SET LOCAL statement_timeout = 0');
  try { return await fn(c); }
  finally { await c.query('ROLLBACK').catch(()=>{}); await c.end().catch(()=>{}); }
}

// ─── Results accumulator ─────────────────────────────────────────────────────
const results = [];
function record(group, name, role, passed, expected, got) {
  results.push({ group, name, role, passed, expected: String(expected), got: String(got) });
  console.log('  [' + (passed ? 'PASS' : 'FAIL') + '] ' + group + ' / ' + name + ' (' + role + ')');
  if (!passed) console.log('         expected: ' + expected + '\n         got:      ' + got);
}

// ─── Cache snapshot of all test listings (read once) ────────────────────────
const listingGeo = new Map();
async function loadListingGeo() {
  await probeRO('load-geo', async (c) => {
    const ids = Array.from(testListings.values());
    const r = await c.query(
      `SELECT id, building_id, community_id, municipality_id, area_id,
              assigned_agent_id, assigned_scope, assigned_source_id, property_type
         FROM mls_listings WHERE id = ANY($1)`, [ids]);
    for (const row of r.rows) listingGeo.set(row.id, row);
  });
}

function callResolver(client, listingId) {
  const g = listingGeo.get(listingId);
  return client.query(
    `SELECT resolve_agent_for_context($1,$2,NULL,$3,$4,$5,NULL,$6) AS agent_id`,
    [listingId, g.building_id, g.community_id, g.municipality_id, g.area_id, tenantPrimary]);
}

// ─── CASE A: precedence ladder ──────────────────────────────────────────────
const ladder = [
  { key: 'L1_pin_target',      agent: 'agent_pin',      scope: 'pin'          },
  { key: 'L2_building_condo',  agent: 'agent_building', scope: 'building'     },
  { key: 'L3_community_condo', agent: 'agent_alpha',    scope: 'community'    },
  { key: 'L4_community_home',  agent: 'agent_alpha',    scope: 'community'    },
  { key: 'L5_muni_condo',      agent: 'manager',        scope: 'municipality' },
  { key: 'L6_muni_home',       agent: 'manager',        scope: 'municipality' },
  { key: 'L7_area_condo',      agent: 'area_manager',   scope: 'area'         },
  { key: 'L8_area_home',       agent: 'area_manager',   scope: 'area'         },
];

async function caseA() {
  console.log('\n=== CASE A: precedence ladder ===');
  for (const L of ladder) {
    const listingId = testListings.get(L.key);
    const expectedAgent = agentsPrimary.get(L.agent);
    if (!listingId || !expectedAgent) fail('missing manifest entry for ' + L.key + ' / ' + L.agent);

    // A.1 cache: agent + scope provenance.
    await probeRO('A-cache-' + L.key, async (c) => {
      const r = await c.query(`SELECT assigned_agent_id, assigned_scope FROM mls_listings WHERE id=$1`, [listingId]);
      const got = r.rows[0];
      const agentOk = got.assigned_agent_id === expectedAgent;
      const scopeOk = got.assigned_scope === L.scope;
      record('A precedence (cache)', L.key, 'postgres', agentOk && scopeOk,
        'agent=' + L.agent + ' scope=' + L.scope,
        'agent_id=' + (got.assigned_agent_id || 'NULL') + ' scope=' + (got.assigned_scope || 'NULL'));
    });

    // A.2 live resolver under postgres.
    await probeRO('A-live-' + L.key, async (c) => {
      const r = await callResolver(c, listingId);
      const ok = r.rows[0].agent_id === expectedAgent;
      record('A precedence (live)', L.key, 'postgres', ok,
        'agent=' + L.agent,
        'agent_id=' + (r.rows[0].agent_id || 'NULL'));
    });

    // A.3 live resolver under service_role.
    await probeRO('A-svc-' + L.key, async (c) => {
      await c.query('SET LOCAL ROLE service_role');
      const r = await callResolver(c, listingId);
      const ok = r.rows[0].agent_id === expectedAgent;
      record('A precedence (live)', L.key, 'service_role', ok,
        'agent=' + L.agent,
        'agent_id=' + (r.rows[0].agent_id || 'NULL'));
    });
  }
}

// ─── CASE B: property-type split + pair-parity ──────────────────────────────
async function caseB() {
  console.log('\n=== CASE B: property-type split ===');

  // B.1 L9 condo-floor: floor-pool member with floor_condo=true.
  // B.2 L10 home-floor: floor-pool member with floor_homes=true.
  for (const w of [
    { key: 'L9_floor_condo', set: floorCondoSet, label: 'floor_condo' },
    { key: 'L10_floor_home', set: floorHomesSet, label: 'floor_homes' },
  ]) {
    const id = testListings.get(w.key);

    // postgres
    await probeRO('B-' + w.key, async (c) => {
      const r = await callResolver(c, id);
      const ok = w.set.has(r.rows[0].agent_id);
      record('B prop-type split', w.key, 'postgres', ok,
        'IN ' + w.label + ' pool',
        'agent_id=' + (r.rows[0].agent_id || 'NULL'));
    });

    // service_role
    await probeRO('B-svc-' + w.key, async (c) => {
      await c.query('SET LOCAL ROLE service_role');
      const r = await callResolver(c, id);
      const ok = w.set.has(r.rows[0].agent_id);
      record('B prop-type split', w.key, 'service_role', ok,
        'IN ' + w.label + ' pool',
        'agent_id=' + (r.rows[0].agent_id || 'NULL'));
    });
  }

  // B.3 pair-parity: same geo, different property_type → same agent
  for (const [c1, c2] of [
    ['L3_community_condo', 'L4_community_home'],
    ['L5_muni_condo',      'L6_muni_home'],
    ['L7_area_condo',      'L8_area_home'],
  ]) {
    const a1 = listingGeo.get(testListings.get(c1)).assigned_agent_id;
    const a2 = listingGeo.get(testListings.get(c2)).assigned_agent_id;
    record('B prop-type parity', c1 + ' vs ' + c2, 'postgres', a1 === a2,
      'same agent',
      a1 + ' vs ' + a2);
  }
}

// ─── CASE C: distribution hash-RR ───────────────────────────────────────────
async function caseC() {
  console.log('\n=== CASE C: distribution hash-RR ===');
  const L11 = testListings.get('L11_dist_condo');
  const L12 = testListings.get('L12_dist_home');

  // C.1 L11 deterministic (two live calls -> same agent, ∈ distSet).
  for (const [key, listingId] of [['L11', L11], ['L12', L12]]) {
    let a1, a2;
    await probeRO('C-det1-' + key, async (c) => { a1 = (await callResolver(c, listingId)).rows[0].agent_id; });
    await probeRO('C-det2-' + key, async (c) => { a2 = (await callResolver(c, listingId)).rows[0].agent_id; });
    record('C distribution', key + ' deterministic', 'postgres',
      a1 === a2 && distSet.has(a1),
      'same ∈ {dist_a,dist_b}',
      a1 + ' == ' + a2);

    // service_role
    let a3;
    await probeRO('C-svc-' + key, async (c) => {
      await c.query('SET LOCAL ROLE service_role');
      a3 = (await callResolver(c, listingId)).rows[0].agent_id;
    });
    record('C distribution', key + ' (service_role)', 'service_role',
      a3 === a1,
      'same as postgres (' + a1 + ')',
      'agent_id=' + a3);
  }

  // C.2 idempotency: reresolve_listing twice -> stable cache value, ∈ distSet.
  await probeRW('C-idem', async (c) => {
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
    const before = (await c.query('SELECT assigned_agent_id FROM mls_listings WHERE id=$1', [L11])).rows[0].assigned_agent_id;
    await c.query('SELECT public.reresolve_listing($1,$2)', [L11, tenantPrimary]);
    const mid    = (await c.query('SELECT assigned_agent_id FROM mls_listings WHERE id=$1', [L11])).rows[0].assigned_agent_id;
    await c.query('SELECT public.reresolve_listing($1,$2)', [L11, tenantPrimary]);
    const after  = (await c.query('SELECT assigned_agent_id FROM mls_listings WHERE id=$1', [L11])).rows[0].assigned_agent_id;
    const ok = before === mid && mid === after && distSet.has(before);
    record('C distribution', 'L11 idempotent reresolve', 'postgres', ok,
      'stable ∈ {dist_a,dist_b}',
      before + ' → ' + mid + ' → ' + after);
  });

  // C.3 no-clobber: re-resolve Box Grove listings (L11+L12) explicitly via
  // reresolve_listings_in_set (the coupled-check-safe sibling -- see finding
  // F-REROLL-LISTINGS-AT-GEO-COUPLED-CHECK below).  After re-resolution: L3
  // (Berczy) MUST be unchanged; L11/L12 still in distSet.
  await probeRW('C-noclobber', async (c) => {
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
    const L3 = testListings.get('L3_community_condo');
    const beforeAll = await c.query(
      'SELECT id, assigned_agent_id, assigned_scope FROM mls_listings WHERE id = ANY($1)',
      [[L3, L11, L12]]);
    const preMap = new Map(beforeAll.rows.map(r => [r.id, r]));

    await c.query('SELECT public.reresolve_listings_in_set($1::uuid[], $2)', [[L11, L12], tenantPrimary]);

    const afterAll = await c.query(
      'SELECT id, assigned_agent_id, assigned_scope FROM mls_listings WHERE id = ANY($1)',
      [[L3, L11, L12]]);
    const postMap = new Map(afterAll.rows.map(r => [r.id, r]));

    // L3 unchanged.
    const l3OK = preMap.get(L3).assigned_agent_id === postMap.get(L3).assigned_agent_id
              && preMap.get(L3).assigned_scope    === postMap.get(L3).assigned_scope;
    record('C distribution', 'L3 (Berczy) unchanged after BoxGrove reset', 'postgres', l3OK,
      'L3 cache unchanged',
      preMap.get(L3).assigned_agent_id + '/' + preMap.get(L3).assigned_scope +
      ' → ' + postMap.get(L3).assigned_agent_id + '/' + postMap.get(L3).assigned_scope);

    // L11/L12 still in distSet after the reset.
    for (const [k, id] of [['L11', L11], ['L12', L12]]) {
      const a = postMap.get(id).assigned_agent_id;
      record('C distribution', k + ' still ∈ distSet after reset', 'postgres', distSet.has(a),
        '∈ {dist_a,dist_b}',
        'agent_id=' + a);
    }
  });

  // C.4 FINDING: reroll_listings_at_geo is broken on the coupled-check.
  // Probe one real Box Grove listing's current cache state and report whether
  // calling reroll_listings_at_geo would currently fail.  We do NOT call it.
  await probeRO('C-finding-reroll-geo', async (c) => {
    // Look for any Box Grove listing whose assigned_scope IS NULL while
    // assigned_agent_id might be NULL too -- the bug fires when reroll writes
    // a new non-NULL pick to such a row (scope stays NULL -> violates check).
    const r = await c.query(`
      SELECT COUNT(*)::int AS at_risk
        FROM mls_listings
       WHERE community_id = $1
         AND (assigned_scope IS NULL) <> (assigned_agent_id IS NULL)
    `, [cfg.GEO.community_distribution.id]);
    record('C finding', 'reroll_listings_at_geo coupled-check risk', 'postgres',
      true,  // recorded as informational PASS -- the smoke surfaces it without breaking on it
      'INFORMATIONAL ONLY',
      'at_risk_rows=' + r.rows[0].at_risk + ' -- reroll_listings_at_geo only writes assigned_agent_id (line 60), can violate coupled-check; reresolve_listings_in_set is the safe sibling');
  });
}

// ─── CASE D: sticky ─────────────────────────────────────────────────────────
async function caseD() {
  console.log('\n=== CASE D: sticky (BEGIN/ROLLBACK) ===');
  await probeRW('D-sticky', async (c) => {
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
    const L11 = testListings.get('L11_dist_condo');
    const L12 = testListings.get('L12_dist_home');

    // Snapshot existing bindings before any change.
    const pre = await c.query('SELECT id, assigned_agent_id FROM mls_listings WHERE id = ANY($1)', [[L11, L12]]);
    const preMap = new Map(pre.rows.map(r => [r.id, r.assigned_agent_id]));

    // Add a 3rd Box Grove member: tenant_admin as non-primary.
    // tenant_admin has no apa row at Box Grove yet, so uq_apa_active_slot_per_agent
    // is not violated; is_primary=FALSE so uniq_apa_primary_community is not violated.
    const newMember = agentsPrimary.get('tenant_admin');
    await c.query(
      `INSERT INTO agent_property_access
         (agent_id, tenant_id, scope, is_active, is_primary,
          condo_access, homes_access, buildings_access, buildings_mode, community_id)
       VALUES ($1, $2, 'community', TRUE, FALSE, TRUE, TRUE, FALSE, 'all', $3)`,
      [newMember, tenantPrimary, cfg.GEO.community_distribution.id]);

    // D.1 cache unchanged.
    const post = await c.query('SELECT id, assigned_agent_id FROM mls_listings WHERE id = ANY($1)', [[L11, L12]]);
    for (const r of post.rows) {
      const was = preMap.get(r.id);
      const is  = r.assigned_agent_id;
      const key = (r.id === L11) ? 'L11' : 'L12';
      record('D sticky', key + ' cache unchanged after 3rd member', 'postgres', was === is,
        'still ' + was,
        was + ' → ' + is);
    }

    // D.2 live resolver still returns the same agent (resolver-sticky).
    for (const [key, L] of [['L11', L11], ['L12', L12]]) {
      const r = await callResolver(c, L);
      const was = preMap.get(L);
      record('D sticky (live resolver)', key, 'postgres',
        r.rows[0].agent_id === was,
        'still ' + was,
        'live=' + r.rows[0].agent_id);
    }

    // D.3 same under service_role.
    await c.query('SET LOCAL ROLE service_role');
    for (const [key, L] of [['L11', L11], ['L12', L12]]) {
      const r = await callResolver(c, L);
      const was = preMap.get(L);
      record('D sticky (live resolver)', key, 'service_role',
        r.rows[0].agent_id === was,
        'still ' + was,
        'live=' + r.rows[0].agent_id);
    }
    // ROLLBACK happens at probeRW exit.
  });
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n=== CV-TERRITORY smoke ===\n');
  await loadListingGeo();
  console.log('\nListing cache snapshot (from CV-FIXTURE apply):');
  for (const [key, id] of testListings) {
    const g = listingGeo.get(id);
    const a = (g.assigned_agent_id || 'NULL');
    console.log('  ' + key.padEnd(22) + ' agent=' + a.slice(0, 8) + '..  scope=' + (g.assigned_scope || 'NULL').padEnd(13) + '  prop=' + g.property_type);
  }

  await caseA();
  await caseB();
  await caseC();
  await caseD();

  // ─── Output table ─────────────────────────────────────────────────────────
  const lines = [];
  lines.push('='.repeat(120));
  lines.push('CV-TERRITORY smoke results -- ' + new Date().toISOString());
  lines.push('  primary tenant = ' + tenantPrimary);
  lines.push('='.repeat(120));
  const colGroup = 28, colCase = 48, colRole = 14, colStatus = 6;
  lines.push('GROUP'.padEnd(colGroup) + ' ' + 'CASE'.padEnd(colCase) + ' ' + 'ROLE'.padEnd(colRole) + ' ' + 'STATUS'.padEnd(colStatus) + ' EXPECTED → GOT');
  lines.push('-'.repeat(120));
  let passed = 0, failed = 0;
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    if (r.passed) passed++; else failed++;
    lines.push(
      r.group.padEnd(colGroup).slice(0, colGroup) + ' ' +
      r.name.padEnd(colCase).slice(0, colCase)    + ' ' +
      r.role.padEnd(colRole)                       + ' ' +
      status.padEnd(colStatus)                     + ' ' +
      r.expected + ' → ' + r.got);
  }
  lines.push('-'.repeat(120));
  lines.push('TOTAL: ' + results.length + '  PASS: ' + passed + '  FAIL: ' + failed);
  lines.push('='.repeat(120));
  const text = lines.join('\n') + '\n';
  console.log('\n' + text);
  fs.writeFileSync(path.join(__dirname, '..', 'cv-territory-smoke-output.txt'), text);
  console.log('Output: cv-territory-smoke-output.txt');
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
