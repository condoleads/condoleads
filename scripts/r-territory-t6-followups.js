// scripts/r-territory-t6-followups.js
//
// W-TERRITORY / T6-followup-B + T6-followup-C — combined smoke test runner.
//
// Test B (multi-level cascade resolver — v9 plan):
//   B1. resolve_geo_primary('area', test_area_id, tenant_id) returns king_shah
//   B2. resolve_geo_primary('community', test_community_id, tenant_id) returns king_shah
//   B3. resolve_geo_primary('neighbourhood', test_neighbourhood_id, tenant_id) returns king_shah
//
// Test C (is_active flip fires reroll — v9 plan):
//   - Pick muni with mls_listings, INSERT apa muni-scope
//     -> verify mls_listings rerolled to king_shah
//     -> verify territory_assignment_changes row count increased
//   - UPDATE that apa row SET is_active = false
//     -> verify mls_listings rerolled AWAY from king_shah
//     -> verify territory_assignment_changes row count increased again
//
// Isolation:
//   - Single outer transaction (BEGIN ... ROLLBACK)
//   - SAVEPOINT per test, ROLLBACK TO SAVEPOINT after each so distribute-cascade
//     side effects from one test don't pollute the next
//   - Outer ROLLBACK at end means production state is unchanged after script
//
// Pre-flight verifications (no guessing):
//   - agent_property_access has all columns we plan to write to
//   - resolve_geo_primary exists in public schema; signature reported but not
//     hard-required to match a specific shape (script will fail loud at call
//     time if signature doesn't accept (text, uuid, uuid))

const { Client } = require('pg');
const fs = require('fs');

function loadEnvFile(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function resolveConnString() {
  const fromFiles = Object.assign({}, loadEnvFile('.env'), loadEnvFile('.env.local'));
  const order = ['DATABASE_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING'];
  for (const key of order) {
    if (process.env[key]) return { value: process.env[key], source: 'process.env.' + key };
    if (fromFiles[key]) return { value: fromFiles[key], source: '.env*::' + key };
  }
  return null;
}

function fingerprintHost(connStr) {
  try {
    const u = new URL(connStr);
    return u.hostname + u.pathname;
  } catch (_) {
    return '(unparsable)';
  }
}

const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const TEST_AGENT_ID = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'; // King Shah

// Whitelist for SQL-injection safety on identifier interpolation in
// pickGeoForTest / runTestB. Identifiers cannot be parameterized in pg,
// so we hardcode-validate them.
const VALID_GEO_TABLES = new Set(['treb_areas', 'municipalities', 'communities', 'neighbourhoods']);
const VALID_GEO_COLUMNS = new Set(['area_id', 'municipality_id', 'community_id', 'neighbourhood_id']);

async function verifyApaSchema(c) {
  const r = await c.query(
    "SELECT column_name FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'agent_property_access'"
  );
  const have = new Set(r.rows.map(function (row) { return row.column_name; }));
  const need = ['scope', 'area_id', 'municipality_id', 'community_id', 'neighbourhood_id',
                'agent_id', 'tenant_id', 'is_primary', 'is_active'];
  const missing = need.filter(function (c) { return !have.has(c); });
  if (missing.length > 0) {
    throw new Error('agent_property_access missing required columns: ' + missing.join(', ') + '. ' +
                    'Has: ' + Array.from(have).sort().join(', '));
  }
  return have;
}

async function probeResolveGeoPrimary(c) {
  const r = await c.query(
    "SELECT pg_get_function_arguments(p.oid) AS args, " +
    "       pg_get_function_result(p.oid) AS result_type, " +
    "       p.pronargs AS num_args " +
    "FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
    "WHERE p.proname = 'resolve_geo_primary' AND n.nspname = 'public'"
  );
  if (r.rows.length === 0) {
    throw new Error('resolve_geo_primary function not found in public schema.');
  }
  return r.rows;
}

async function pickGeoForTest(c, geoTable, geoColumn) {
  if (!VALID_GEO_TABLES.has(geoTable)) throw new Error('Invalid geoTable: ' + geoTable);
  if (!VALID_GEO_COLUMNS.has(geoColumn)) throw new Error('Invalid geoColumn: ' + geoColumn);
  const sql =
    "SELECT g.id, g.name FROM " + geoTable + " g " +
    "WHERE NOT EXISTS (" +
    "  SELECT 1 FROM agent_property_access apa " +
    "  WHERE apa.tenant_id = $1 AND apa." + geoColumn + " = g.id" +
    ") ORDER BY g.id LIMIT 1";
  const r = await c.query(sql, [TENANT_ID]);
  if (r.rows.length === 0) {
    throw new Error('No clean ' + geoTable + ' found (every row has at least one apa entry for tenant ' + TENANT_ID + ').');
  }
  return r.rows[0];
}

async function pickMuniWithListings(c) {
  const r = await c.query(
    "SELECT m.id, m.name, COUNT(ml.id)::int AS listing_count " +
    "FROM municipalities m " +
    "JOIN mls_listings ml ON ml.municipality_id = m.id " +
    "WHERE NOT EXISTS (" +
    "  SELECT 1 FROM agent_property_access apa " +
    "  WHERE apa.tenant_id = $1 AND apa.municipality_id = m.id" +
    ") " +
    "GROUP BY m.id, m.name " +
    "ORDER BY listing_count DESC " +
    "LIMIT 1",
    [TENANT_ID]
  );
  if (r.rows.length === 0) {
    throw new Error('No clean municipality with mls_listings found.');
  }
  return r.rows[0];
}

async function runTestB(c, label, scope, geoColumn, geoId, geoName) {
  if (!VALID_GEO_COLUMNS.has(geoColumn)) throw new Error('Invalid geoColumn: ' + geoColumn);
  const sp = 'sp_' + label;
  await c.query('SAVEPOINT ' + sp);
  try {
    const insSql =
      "INSERT INTO agent_property_access (tenant_id, agent_id, scope, " + geoColumn + ", is_primary, is_active) " +
      "VALUES ($1, $2, $3, $4, true, true) RETURNING id";
    const ins = await c.query(insSql, [TENANT_ID, TEST_AGENT_ID, scope, geoId]);
    const apaId = ins.rows[0].id;

    const res = await c.query(
      'SELECT resolve_geo_primary($1::text, $2::uuid, $3::uuid) AS primary_agent',
      [scope, geoId, TENANT_ID]
    );
    const actual = res.rows[0].primary_agent;
    const pass = actual === TEST_AGENT_ID;
    return {
      kind: 'B', label: label, scope: scope, geo_name: geoName, geo_id: geoId,
      apa_id: apaId, expected: TEST_AGENT_ID, actual: actual, pass: pass
    };
  } catch (e) {
    return {
      kind: 'B', label: label, scope: scope, geo_name: geoName, geo_id: geoId,
      pass: false, error: e.message
    };
  } finally {
    try { await c.query('ROLLBACK TO SAVEPOINT ' + sp); } catch (_) {}
    try { await c.query('RELEASE SAVEPOINT ' + sp); } catch (_) {}
  }
}

async function runTestC(c, muni) {
  const sp = 'sp_c';
  await c.query('SAVEPOINT ' + sp);
  try {
    // Initial state
    const initAuditRes = await c.query('SELECT COUNT(*)::int AS cnt FROM territory_assignment_changes');
    const initAudit = initAuditRes.rows[0].cnt;

    const initListingsRes = await c.query(
      'SELECT COUNT(*)::int AS cnt FROM mls_listings WHERE municipality_id = $1',
      [muni.id]
    );
    const totalListings = initListingsRes.rows[0].cnt;

    const initKingRes = await c.query(
      'SELECT COUNT(*)::int AS cnt FROM mls_listings WHERE municipality_id = $1 AND assigned_agent_id = $2',
      [muni.id, TEST_AGENT_ID]
    );
    const initKingCount = initKingRes.rows[0].cnt;

    // INSERT muni-scope apa row
    const insRes = await c.query(
      "INSERT INTO agent_property_access (tenant_id, agent_id, scope, municipality_id, is_primary, is_active) " +
      "VALUES ($1, $2, 'municipality', $3, true, true) RETURNING id",
      [TENANT_ID, TEST_AGENT_ID, muni.id]
    );
    const apaId = insRes.rows[0].id;

    // After-insert state
    const afterInsKingRes = await c.query(
      'SELECT COUNT(*)::int AS cnt FROM mls_listings WHERE municipality_id = $1 AND assigned_agent_id = $2',
      [muni.id, TEST_AGENT_ID]
    );
    const afterInsKing = afterInsKingRes.rows[0].cnt;

    const afterInsAuditRes = await c.query('SELECT COUNT(*)::int AS cnt FROM territory_assignment_changes');
    const afterInsAudit = afterInsAuditRes.rows[0].cnt;

    // Flip is_active = false
    await c.query('UPDATE agent_property_access SET is_active = false WHERE id = $1', [apaId]);

    // After-update state
    const afterUpdKingRes = await c.query(
      'SELECT COUNT(*)::int AS cnt FROM mls_listings WHERE municipality_id = $1 AND assigned_agent_id = $2',
      [muni.id, TEST_AGENT_ID]
    );
    const afterUpdKing = afterUpdKingRes.rows[0].cnt;

    const afterUpdAuditRes = await c.query('SELECT COUNT(*)::int AS cnt FROM territory_assignment_changes');
    const afterUpdAudit = afterUpdAuditRes.rows[0].cnt;

    // Pass criteria
    const passInsertReroll = afterInsKing > initKingCount; // listings now assigned to king_shah
    const passInsertAudit = afterInsAudit > initAudit;     // audit row(s) written on INSERT
    const passUpdateReroll = afterUpdKing < afterInsKing;  // listings rerolled away from king_shah
    const passUpdateAudit = afterUpdAudit > afterInsAudit; // audit row(s) written on UPDATE
    const allPass = passInsertReroll && passInsertAudit && passUpdateReroll && passUpdateAudit;

    return {
      kind: 'C', label: 'c', muni_name: muni.name, muni_id: muni.id, apa_id: apaId,
      total_listings: totalListings,
      initial_king_listings: initKingCount,
      after_insert_king_listings: afterInsKing,
      after_update_king_listings: afterUpdKing,
      initial_audit: initAudit,
      after_insert_audit: afterInsAudit,
      after_update_audit: afterUpdAudit,
      pass_insert_reroll: passInsertReroll,
      pass_insert_audit: passInsertAudit,
      pass_update_reroll: passUpdateReroll,
      pass_update_audit: passUpdateAudit,
      pass: allPass
    };
  } catch (e) {
    return { kind: 'C', label: 'c', muni_name: muni.name, pass: false, error: e.message };
  } finally {
    try { await c.query('ROLLBACK TO SAVEPOINT ' + sp); } catch (_) {}
    try { await c.query('RELEASE SAVEPOINT ' + sp); } catch (_) {}
  }
}

function printResult(r) {
  if (r.kind === 'B') {
    if (r.error) {
      console.log('  Test B/' + r.label + ' (' + r.scope + ' / ' + r.geo_name + ') -> FAIL (' + r.error + ')');
    } else {
      console.log('  Test B/' + r.label + ' (' + r.scope + ' / ' + r.geo_name + ') -> ' + (r.pass ? 'PASS' : 'FAIL'));
      console.log('    expected: ' + r.expected);
      console.log('    actual:   ' + r.actual);
    }
  } else if (r.kind === 'C') {
    if (r.error) {
      console.log('  Test C (' + r.muni_name + ') -> FAIL (' + r.error + ')');
      return;
    }
    console.log('  Test C (' + r.muni_name + ', ' + r.total_listings + ' listings) -> ' + (r.pass ? 'PASS' : 'FAIL'));
    console.log('    initial king_shah listings:        ' + r.initial_king_listings);
    console.log('    after INSERT king_shah listings:   ' + r.after_insert_king_listings + '   ' + (r.pass_insert_reroll ? '(PASS reroll-to)' : '(FAIL reroll-to)'));
    console.log('    after UPDATE king_shah listings:   ' + r.after_update_king_listings + '   ' + (r.pass_update_reroll ? '(PASS reroll-from)' : '(FAIL reroll-from)'));
    console.log('    audit count delta on INSERT: +' + (r.after_insert_audit - r.initial_audit) + '   ' + (r.pass_insert_audit ? '(PASS)' : '(FAIL)'));
    console.log('    audit count delta on UPDATE: +' + (r.after_update_audit - r.after_insert_audit) + '   ' + (r.pass_update_audit ? '(PASS)' : '(FAIL)'));
  }
}

async function main() {
  const conn = resolveConnString();
  if (!conn) throw new Error('No DB connection string in env. Tried DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING.');
  console.log('Connecting to: ' + fingerprintHost(conn.value) + ' (source: ' + conn.source + ')');

  const c = new Client({ connectionString: conn.value, ssl: { rejectUnauthorized: false } });
  await c.connect();

  try {
    console.log('\n[Pre-flight 1/2] Verifying agent_property_access schema...');
    await verifyApaSchema(c);
    console.log('  All required columns present.');

    console.log('\n[Pre-flight 2/2] Probing resolve_geo_primary signature...');
    const sigs = await probeResolveGeoPrimary(c);
    for (const s of sigs) {
      console.log('  RETURNS ' + s.result_type + '  (' + s.args + ')  pronargs=' + s.num_args);
    }
    if (sigs.length > 1) {
      console.log('  NOTE: ' + sigs.length + ' overloads found. Tests will use the (text, uuid, uuid) form. If that overload is missing, the call below will fail loud.');
    }

    console.log('\n[Pick test data]');
    const testArea = await pickGeoForTest(c, 'treb_areas', 'area_id');
    const testCommunity = await pickGeoForTest(c, 'communities', 'community_id');
    const testNeighbourhood = await pickGeoForTest(c, 'neighbourhoods', 'neighbourhood_id');
    const testMuni = await pickMuniWithListings(c);
    console.log('  Test B1 area:           ' + testArea.name + '  (' + testArea.id + ')');
    console.log('  Test B2 community:      ' + testCommunity.name + '  (' + testCommunity.id + ')');
    console.log('  Test B3 neighbourhood:  ' + testNeighbourhood.name + '  (' + testNeighbourhood.id + ')');
    console.log('  Test C  municipality:   ' + testMuni.name + '  (' + testMuni.listing_count + ' listings)');

    console.log('\n[Run tests inside outer transaction with savepoints]');
    await c.query('BEGIN');

    const results = [];
    try {
      results.push(await runTestB(c, 'b1', 'area', 'area_id', testArea.id, testArea.name));
      results.push(await runTestB(c, 'b2', 'community', 'community_id', testCommunity.id, testCommunity.name));
      results.push(await runTestB(c, 'b3', 'neighbourhood', 'neighbourhood_id', testNeighbourhood.id, testNeighbourhood.name));
      results.push(await runTestC(c, testMuni));
    } finally {
      await c.query('ROLLBACK');
      console.log('  [Outer ROLLBACK complete -- production state unchanged]');
    }

    console.log('\n=== RESULTS ===');
    for (const r of results) printResult(r);

    const allPass = results.every(function (r) { return r.pass; });
    const passCount = results.filter(function (r) { return r.pass; }).length;
    console.log('\nTotal: ' + passCount + '/' + results.length + ' tests passed. Overall: ' + (allPass ? 'PASS' : 'FAIL'));

    process.exit(allPass ? 0 : 1);
  } finally {
    await c.end();
  }
}

main().catch(function (e) {
  console.error('FAIL: ' + (e && e.message ? e.message : String(e)));
  if (e && e.stack) console.error(e.stack);
  process.exit(1);
});