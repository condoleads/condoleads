// scripts/run-r-territory-t6-followup-b-test-1d.js
// W-TERRITORY / T6-followup-B / Test 1d — Neighbourhood-scope resolver test.
//
// VERIFIED 2026-05-18 session (no fake data, all values real & verified):
//   - P2-A: WALLiam tenant b16e1039-38ed-43d7-bbc5-dd02bb651bc9
//   - P2-B: King Shah agent fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe
//           (tenant=WALLiam, is_selling=true, is_active=true)
//   - P2-C: Downtown neighbourhood dd0c4b89-8b4b-4e23-a134-028c7084efe3
//           (area=Toronto, is_active=true)
//   - P2-D: no pre-existing APA row for this (tenant, scope, neighbourhood) — fixture-insert path
//   - P2-E: resolve_geo_primary fully supports scope='neighbourhood'
//   - P2-F: only UNIQUE constraint is (agent_id, community_id) — our INSERT has community_id=NULL so no collision
//   - P2-G: handle_apa_insert for scope='neighbourhood' writes 1 audit row,
//           no listing reroll, no cascade (terminal scope). ROLLBACK is clean.
//
// ARCHITECTURAL CONTEXT (verified C7):
//   Neighbourhood is a RESOLVER-ONLY scope. mls_listings has no neighbourhood_id.
//   This test exercises the resolver path only (resolve_geo_primary +
//   resolve_display_agent_for_context). It deliberately does NOT test
//   distribute_listings_at_geo at neighbourhood scope, which is correctly excluded by design.
//
// WHY a transaction with ROLLBACK:
//   APA triggers are all transaction-local (verified P2-G). ROLLBACK fully
//   reverts the inserted APA row + audit row. Zero production state mutation.
//
// USAGE: node scripts/run-r-territory-t6-followup-b-test-1d.js

const fs = require('fs');
const path = require('path');

// ── Load .env.local manually (matches t6-smoke runner pattern) ────────────
const envPath = path.resolve('.env.local');
const env = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[m[1]] = val;
    }
  }
}

const connCandidates = [
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
];
let connStr = null;
let connStrSource = null;
for (const name of connCandidates) {
  if (env[name])         { connStr = env[name];         connStrSource = `.env.local:${name}`; break; }
  if (process.env[name]) { connStr = process.env[name]; connStrSource = `process.env.${name}`; break; }
}

if (!connStr) {
  console.error('ERROR: No Postgres connection string found.');
  console.error('Looked for: ' + connCandidates.join(', '));
  console.error('In: .env.local and process.env');
  process.exit(1);
}

const maskedConnStr = connStr.replace(/:([^:@]+)@/, ':****@');
console.log(`Connection: ${maskedConnStr}`);
console.log(`Source:     ${connStrSource}`);
console.log('');

let Client;
try { Client = require('pg').Client; }
catch (e) {
  console.error('ERROR: pg is not installed. Run: npm install --save-dev pg');
  process.exit(1);
}

// ── Verified fixtures (Rule Zero: real values from this session only) ─────
const WALLIAM_TENANT_ID  = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const KING_SHAH_AGENT_ID = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';
const DOWNTOWN_NEIGH_ID  = 'dd0c4b89-8b4b-4e23-a134-028c7084efe3';

// ── Assertion helpers ─────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(label, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    if (detail) console.log(`      ${detail}`);
    failed++;
    failures.push({ label, detail });
  }
}

function eqOrNull(actual, expected) {
  if (expected === null) return actual === null || actual === undefined;
  return actual === expected;
}

// ── Main ──────────────────────────────────────────────────────────────────
(async () => {
  const client = new Client({ connectionString: connStr });
  await client.connect();
  console.log('Connected to Postgres.');

  if (process.env.DISABLE_STATEMENT_TIMEOUT === '1') {
    await client.query('SET statement_timeout = 0');
    console.log('statement_timeout disabled for this session.');
  }
  console.log('');
  console.log('=== W-TERRITORY / T6-followup-B / Test 1d ===');
  console.log('Neighbourhood-scope resolver (resolver-only, no listing distribution)');
  console.log('');
  console.log(`  Tenant:        ${WALLIAM_TENANT_ID} (WALLiam)`);
  console.log(`  Agent:         ${KING_SHAH_AGENT_ID} (King Shah, is_selling=true)`);
  console.log(`  Neighbourhood: ${DOWNTOWN_NEIGH_ID} (Downtown, Toronto)`);
  console.log('');

  try {
    await client.query('BEGIN');
    console.log('--- BEGIN transaction (ROLLBACK at end, no state persisted) ---');
    console.log('');

    // ── Pre-state ─────────────────────────────────────────────────────────
    console.log('Phase 1: pre-state assertions');

    const pre1 = await client.query(
      'SELECT resolve_geo_primary($1, $2, $3) AS agent_id',
      ['neighbourhood', DOWNTOWN_NEIGH_ID, WALLIAM_TENANT_ID]
    );
    assert(
      'Pre-state: resolve_geo_primary returns NULL (no APA row yet)',
      eqOrNull(pre1.rows[0].agent_id, null),
      `got ${pre1.rows[0].agent_id}`
    );

    const pre2 = await client.query(
      `SELECT resolve_display_agent_for_context(
         NULL, NULL, $1, NULL, NULL, NULL, NULL, $2
       ) AS agent_id`,
      [DOWNTOWN_NEIGH_ID, WALLIAM_TENANT_ID]
    );
    // Note: without a primary, resolver falls through to routing resolver
    // and ultimately tenant-default selling agent. We capture whatever it
    // returns as the "pre-state fallback" baseline.
    const preFallbackAgentId = pre2.rows[0].agent_id;
    console.log(`  i Pre-state fallback resolve_display_agent_for_context: ${preFallbackAgentId} (baseline, not asserted)`);

    const pre3 = await client.query(
      `SELECT COUNT(*)::int AS n FROM agent_property_access
       WHERE tenant_id = $1 AND scope = 'neighbourhood' AND neighbourhood_id = $2`,
      [WALLIAM_TENANT_ID, DOWNTOWN_NEIGH_ID]
    );
    assert(
      'Pre-state: no APA row for (WALLiam, neighbourhood, Downtown)',
      pre3.rows[0].n === 0,
      `count=${pre3.rows[0].n}`
    );

    console.log('');

    // ── Insert fixture ────────────────────────────────────────────────────
    console.log('Phase 2: insert APA neighbourhood primary fixture');

    const insertRes = await client.query(
      `INSERT INTO agent_property_access (
         tenant_id, agent_id, scope, neighbourhood_id, is_primary, is_active
       ) VALUES ($1, $2, 'neighbourhood', $3, true, true)
       RETURNING id, tenant_id, agent_id, scope, neighbourhood_id, is_primary, is_active`,
      [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID, DOWNTOWN_NEIGH_ID]
    );
    const insertedRow = insertRes.rows[0];
    assert(
      'INSERT succeeded',
      !!insertedRow && insertedRow.scope === 'neighbourhood',
      JSON.stringify(insertedRow)
    );
    assert(
      'INSERT row has is_primary=true, is_active=true',
      insertedRow.is_primary === true && insertedRow.is_active === true,
      `is_primary=${insertedRow.is_primary}, is_active=${insertedRow.is_active}`
    );

    console.log('');

    // ── Mid-state: resolver assertions ────────────────────────────────────
    console.log('Phase 3: mid-state resolver assertions');

    const mid1 = await client.query(
      'SELECT resolve_geo_primary($1, $2, $3) AS agent_id',
      ['neighbourhood', DOWNTOWN_NEIGH_ID, WALLIAM_TENANT_ID]
    );
    assert(
      'resolve_geo_primary returns King Shah',
      mid1.rows[0].agent_id === KING_SHAH_AGENT_ID,
      `got ${mid1.rows[0].agent_id}, expected ${KING_SHAH_AGENT_ID}`
    );

    const mid2 = await client.query(
      `SELECT resolve_display_agent_for_context(
         NULL, NULL, $1, NULL, NULL, NULL, NULL, $2
       ) AS agent_id`,
      [DOWNTOWN_NEIGH_ID, WALLIAM_TENANT_ID]
    );
    assert(
      'resolve_display_agent_for_context (neighbourhood scope) returns King Shah',
      mid2.rows[0].agent_id === KING_SHAH_AGENT_ID,
      `got ${mid2.rows[0].agent_id}, expected ${KING_SHAH_AGENT_ID}`
    );

    // Audit row check: handle_apa_insert wrote one 'assignment_granted' row
    const mid3 = await client.query(
      `SELECT COUNT(*)::int AS n FROM territory_assignment_changes
       WHERE tenant_id = $1
         AND agent_id = $2
         AND scope = 'neighbourhood'
         AND scope_id = $3
         AND change_type = 'assignment_granted'`,
      [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID, DOWNTOWN_NEIGH_ID]
    );
    assert(
      'AFTER INSERT trigger wrote one territory_assignment_changes row (assignment_granted)',
      mid3.rows[0].n === 1,
      `count=${mid3.rows[0].n}`
    );

    console.log('');

    // ── ROLLBACK ──────────────────────────────────────────────────────────
    console.log('Phase 4: ROLLBACK');
    await client.query('ROLLBACK');
    console.log('--- ROLLBACK complete ---');
    console.log('');

    // ── Post-state: verify clean revert ───────────────────────────────────
    console.log('Phase 5: post-state assertions (verify ROLLBACK undid everything)');

    const post1 = await client.query(
      'SELECT resolve_geo_primary($1, $2, $3) AS agent_id',
      ['neighbourhood', DOWNTOWN_NEIGH_ID, WALLIAM_TENANT_ID]
    );
    assert(
      'Post-rollback: resolve_geo_primary returns NULL again',
      eqOrNull(post1.rows[0].agent_id, null),
      `got ${post1.rows[0].agent_id}`
    );

    const post2 = await client.query(
      `SELECT COUNT(*)::int AS n FROM agent_property_access
       WHERE tenant_id = $1 AND scope = 'neighbourhood' AND neighbourhood_id = $2`,
      [WALLIAM_TENANT_ID, DOWNTOWN_NEIGH_ID]
    );
    assert(
      'Post-rollback: APA row no longer exists',
      post2.rows[0].n === 0,
      `count=${post2.rows[0].n}`
    );

    const post3 = await client.query(
      `SELECT COUNT(*)::int AS n FROM territory_assignment_changes
       WHERE tenant_id = $1
         AND agent_id = $2
         AND scope = 'neighbourhood'
         AND scope_id = $3
         AND change_type = 'assignment_granted'`,
      [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID, DOWNTOWN_NEIGH_ID]
    );
    assert(
      'Post-rollback: audit row no longer exists',
      post3.rows[0].n === 0,
      `count=${post3.rows[0].n}`
    );

    console.log('');

  } catch (e) {
    console.error('FATAL during test:', e.message);
    console.error(e.stack);
    try { await client.query('ROLLBACK'); } catch (_) { /* already aborted */ }
    failed++;
    failures.push({ label: 'unexpected exception', detail: e.message });
  } finally {
    await client.end();
  }

  console.log('=========================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('=========================================');
  if (failed > 0) {
    console.log('');
    console.log('FAILURES:');
    for (const f of failures) {
      console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ''}`);
    }
    process.exit(1);
  }
})();