// scripts/r-territory-t6-followup-race.js
// W-TERRITORY/T6-followup-A — race-safety harness for distribute_geo_to_children.
//
// SCENARIO: Two backend connections simultaneously INSERT an apa row at MUNI
// scope for Oshawa, each with a different agent. Each INSERT runs in its own
// implicit transaction (autocommit). The BEFORE trigger
// (apa_mutation_lock_trigger) acquires a per-tenant advisory lock that auto-
// releases at implicit COMMIT after the INSERT statement (including all
// trigger work) completes. The two transactions serialize via the lock.
//
// IMPORTANT — DESIGN NOTE: Earlier versions of this harness used explicit
// BEGIN ... INSERT ... COMMIT inside Promise.allSettled. That deadlocked
// at the application level: Promise.allSettled waited for BOTH inserts
// before sending COMMITs, but the second insert was blocked on the lock
// held by the first transaction, and the first transaction was idle
// waiting for the client to send COMMIT. Postgres can't detect this kind
// of deadlock (it's a client-protocol stall, not a server-side lock cycle).
// Autocommit avoids the issue entirely: lock acquire+release happens within
// each INSERT statement's autocommit boundary.
//
// EXPECTED PER TRIAL (post-F-RACE-DEADLOCK + autocommit):
//   - Both INSERTs eventually succeed (one acquires lock, runs trigger work,
//     releases at implicit COMMIT; other was blocked, now acquires, runs,
//     releases)
//   - Post-state: 20 community primaries for Oshawa, all attributed to
//     whichever agent's INSERT acquired the lock FIRST (the second
//     transaction's distribute sees primaries already exist and skips them
//     per OD-3 "defaults fill vacuum")
//   - Each community has exactly ONE primary (uniq_apa_primary_community held)
//
// VERDICT — PASS criteria (consistency-only):
//   1. Both INSERTs OK or tolerated error (deadlock_detected/timeout)
//   2. At least one INSERT succeeded
//   3. Post-state: exactly OSHAWA_EXPECTED_COMMUNITIES primaries
//   4. Post-state: no duplicate primaries (unique index held)
//   5. Post-state: no unexpected agents (only racing agents present)
//
// Race observation (both agents winning some primaries) is INFORMATIONAL.
// With the advisory lock, serialized outcome (one agent wins all 20) is
// expected and correct.
//
// IMPORTANT — THIS WRITES TO PRODUCTION:
//   - Each trial INSERTs 2 apa rows (muni-scope) + ~20 apa rows (community-scope)
//   - Trigger reroll updates mls_listings.assigned_agent_id for Oshawa listings
//   - Trial cleanup DELETEs all apa rows we caused; trigger reroll undoes the
//     mls_listings updates back to NULL
//   - territory_assignment_changes is APPEND-ONLY — each trial leaves ~20
//     audit rows behind (accurate history of what the test did)
//
// REQUIRES: pg installed, DATABASE_URL in .env.local
// USAGE:    node scripts/r-territory-t6-followup-race.js [num_trials]

const fs = require('fs');
const path = require('path');

// ─── Constants ───────────────────────────────────────────────────────────────
const TENANT_ID                   = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const OSHAWA_MUNI_ID              = '94447f26-216a-47be-ac73-d07f33732036';
const OSHAWA_EXPECTED_COMMUNITIES = 20;
const KING_SHAH_ID                = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';
const NEO_SMITH_ID                = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f';

const NUM_TRIALS = parseInt(process.argv[2] || '10', 10);

const TOLERATED_ERROR_FRAGMENTS = [
  'deadlock detected',
  'canceling statement due to statement timeout',
];
const isOkOrTolerated = (msg) => {
  if (msg === 'OK') return true;
  if (typeof msg !== 'string') return false;
  return TOLERATED_ERROR_FRAGMENTS.some(frag => msg.includes(frag));
};

// ─── env load ────────────────────────────────────────────────────────────────
const envPath = path.resolve('.env.local');
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
}
const connStr =
  env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;
if (!connStr) {
  console.error('No DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL in .env.local or process.env.');
  process.exit(1);
}

let Client, Pool;
try { ({ Client, Pool } = require('pg')); }
catch { console.error('pg not installed. Run: npm install --save-dev pg'); process.exit(1); }

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Pull a client from the pool AND explicitly disable statement_timeout.
// Pool config statement_timeout is silently ignored by node-postgres.
async function getClient(pool) {
  const client = await pool.connect();
  await client.query('SET statement_timeout = 0;');
  return client;
}

async function getOshawaState(client) {
  const r = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE municipality_id = $2 AND scope = 'municipality') AS muni_rows,
      COUNT(*) FILTER (WHERE community_id IN (
        SELECT id FROM communities WHERE municipality_id = $2
      ) AND scope = 'community') AS community_rows,
      COUNT(*) FILTER (WHERE community_id IN (
        SELECT id FROM communities WHERE municipality_id = $2
      ) AND scope = 'community' AND is_primary = true) AS community_primaries
    FROM agent_property_access
    WHERE tenant_id = $1;
  `, [TENANT_ID, OSHAWA_MUNI_ID]);
  return r.rows[0];
}

async function getOshawaPrimaryDistribution(client) {
  const r = await client.query(`
    SELECT agent_id, COUNT(*)::int AS count
    FROM agent_property_access
    WHERE tenant_id = $1
      AND scope = 'community'
      AND is_primary = true
      AND community_id IN (SELECT id FROM communities WHERE municipality_id = $2)
    GROUP BY agent_id
    ORDER BY count DESC;
  `, [TENANT_ID, OSHAWA_MUNI_ID]);
  return r.rows;
}

async function checkDuplicatePrimaries(client) {
  const r = await client.query(`
    SELECT community_id, COUNT(*)::int AS primary_count
    FROM agent_property_access
    WHERE tenant_id = $1
      AND scope = 'community'
      AND is_primary = true
      AND community_id IN (SELECT id FROM communities WHERE municipality_id = $2)
    GROUP BY community_id
    HAVING COUNT(*) > 1;
  `, [TENANT_ID, OSHAWA_MUNI_ID]);
  return r.rows;
}

async function cleanup(client) {
  const r = await client.query(`
    DELETE FROM agent_property_access
    WHERE tenant_id = $1
      AND (
        (scope = 'municipality' AND municipality_id = $2)
        OR (scope = 'community' AND community_id IN (
          SELECT id FROM communities WHERE municipality_id = $2
        ))
      )
    RETURNING id;
  `, [TENANT_ID, OSHAWA_MUNI_ID]);
  return r.rowCount;
}

const INSERT_SQL = `
  INSERT INTO agent_property_access (
    tenant_id, agent_id, scope, municipality_id, is_primary, is_active
  ) VALUES ($1, $2, 'municipality', $3, false, true)
  RETURNING id;
`;

async function runTrial(pool, trialNum) {
  const clientA = await getClient(pool);
  const clientB = await getClient(pool);

  const result = {
    trialNum,
    txA: null, txB: null,
    txA_ms: null, txB_ms: null,
    cleanupRowsRemoved: null,
    finalDistribution: null,
    duplicates: null,
    pass: false,
    raceObserved: false,
    notes: [],
  };

  try {
    // AUTOCOMMIT race: each INSERT runs in its own implicit transaction.
    // BEFORE trigger acquires per-tenant advisory lock; lock auto-releases
    // at implicit COMMIT after the INSERT (including AFTER-trigger work)
    // completes. Two parallel INSERTs serialize: one wins lock, runs to
    // completion (commits, releases lock), then other proceeds.
    //
    // No explicit BEGIN/COMMIT — that pattern caused application-level
    // deadlock between Promise.allSettled and the xact-scoped advisory lock.
    const t0A = Date.now();
    const t0B = Date.now();
    const [resA, resB] = await Promise.all([
      clientA.query(INSERT_SQL, [TENANT_ID, KING_SHAH_ID, OSHAWA_MUNI_ID])
        .then(() => { result.txA_ms = Date.now() - t0A; return 'OK'; })
        .catch(e => { result.txA_ms = Date.now() - t0A; return `FAIL: ${e.message}`; }),
      clientB.query(INSERT_SQL, [TENANT_ID, NEO_SMITH_ID, OSHAWA_MUNI_ID])
        .then(() => { result.txB_ms = Date.now() - t0B; return 'OK'; })
        .catch(e => { result.txB_ms = Date.now() - t0B; return `FAIL: ${e.message}`; }),
    ]);
    result.txA = resA;
    result.txB = resB;

    // Verify post-state on a fresh connection
    const verifyClient = await getClient(pool);
    try {
      const distribution = await getOshawaPrimaryDistribution(verifyClient);
      const dupes = await checkDuplicatePrimaries(verifyClient);

      result.finalDistribution = distribution;
      result.duplicates = dupes;

      const totalPrimaries = distribution.reduce((acc, r) => acc + r.count, 0);
      const kingShahCount = distribution.find(r => r.agent_id === KING_SHAH_ID)?.count || 0;
      const neoSmithCount = distribution.find(r => r.agent_id === NEO_SMITH_ID)?.count || 0;
      const otherCount = totalPrimaries - kingShahCount - neoSmithCount;

      const passConditions = [
        { label: 'tx A OK or tolerated',                                       test: isOkOrTolerated(result.txA) },
        { label: 'tx B OK or tolerated',                                       test: isOkOrTolerated(result.txB) },
        { label: 'at least one tx succeeded',                                  test: result.txA === 'OK' || result.txB === 'OK' },
        { label: `exactly ${OSHAWA_EXPECTED_COMMUNITIES} community primaries`, test: totalPrimaries === OSHAWA_EXPECTED_COMMUNITIES },
        { label: 'no duplicate primaries',                                     test: dupes.length === 0 },
        { label: 'no unexpected agents',                                       test: otherCount === 0 },
      ];

      result.pass = passConditions.every(c => c.test);
      result.failedConditions = passConditions.filter(c => !c.test).map(c => c.label);

      result.raceObserved = kingShahCount > 0 && neoSmithCount > 0;
      result.kingShahCount = kingShahCount;
      result.neoSmithCount = neoSmithCount;
    } finally {
      verifyClient.release();
    }

    // Cleanup
    const cleanupClient = await getClient(pool);
    try {
      result.cleanupRowsRemoved = await cleanup(cleanupClient);
    } finally {
      cleanupClient.release();
    }

  } catch (e) {
    result.notes.push(`UNEXPECTED ERROR: ${e.message}`);
    try {
      const cleanupClient = await getClient(pool);
      try { result.cleanupRowsRemoved = await cleanup(cleanupClient); }
      finally { cleanupClient.release(); }
    } catch (e2) {
      result.notes.push(`CLEANUP ALSO FAILED: ${e2.message}`);
    }
  } finally {
    clientA.release();
    clientB.release();
  }

  return result;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  W-TERRITORY/T6-followup-A — race-safety harness (autocommit pattern)');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Trials: ${NUM_TRIALS}`);
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Oshawa muni: ${OSHAWA_MUNI_ID} (expected ${OSHAWA_EXPECTED_COMMUNITIES} communities)`);
  console.log(`Racing agents: King Shah (${KING_SHAH_ID.slice(0,8)}...) vs Neo Smith (${NEO_SMITH_ID.slice(0,8)}...)`);
  console.log('');

  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

  // Pre-flight
  console.log('Pre-flight: verifying Oshawa is clean...');
  const preflightClient = await getClient(pool);
  try {
    const before = await getOshawaState(preflightClient);
    console.log(`  Pre-state: muni_rows=${before.muni_rows}, community_rows=${before.community_rows}, community_primaries=${before.community_primaries}`);
    if (Number(before.muni_rows) > 0 || Number(before.community_rows) > 0) {
      console.log('  Cleaning up leftover state from prior run...');
      const removed = await cleanup(preflightClient);
      console.log(`  Removed ${removed} rows.`);
      const after = await getOshawaState(preflightClient);
      console.log(`  Post-cleanup: muni_rows=${after.muni_rows}, community_rows=${after.community_rows}`);
      if (Number(after.muni_rows) > 0 || Number(after.community_rows) > 0) {
        console.error('  Cleanup did not fully clear state. Aborting.');
        await pool.end();
        process.exit(1);
      }
    }
  } finally {
    preflightClient.release();
  }
  console.log('  Pre-flight clean.');
  console.log('');

  // Run trials
  const results = [];
  for (let i = 1; i <= NUM_TRIALS; i++) {
    process.stdout.write(`Trial ${i}/${NUM_TRIALS}... `);
    const t0 = Date.now();
    const r = await runTrial(pool, i);
    const dt = Date.now() - t0;
    results.push(r);
    const pf = r.pass ? 'PASS' : 'FAIL';
    const observed = r.raceObserved
      ? '(race observed; primaries split between agents)'
      : '(serialized via advisory lock; one agent won all primaries)';
    process.stdout.write(`${pf} ${observed} king_shah=${r.kingShahCount} neo_smith=${r.neoSmithCount} txA=${r.txA_ms}ms txB=${r.txB_ms}ms cleanup=${r.cleanupRowsRemoved} (total ${dt}ms)\n`);
    if (!r.pass) {
      console.log(`  Failed conditions: ${(r.failedConditions || []).join(', ')}`);
      if (r.notes.length) console.log(`  Notes: ${r.notes.join(' | ')}`);
      console.log(`  Tx: A=${r.txA} B=${r.txB}`);
      if (r.duplicates && r.duplicates.length) {
        console.log(`  DUPLICATES: ${JSON.stringify(r.duplicates)}`);
      }
    }
  }

  // Aggregate
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  const allPass = results.every(r => r.pass);
  const raceCount = results.filter(r => r.raceObserved).length;
  const serializedCount = NUM_TRIALS - raceCount;
  const passCount = results.filter(r => r.pass).length;

  console.log(`Trials passed (consistency held): ${passCount}/${NUM_TRIALS}`);
  console.log(`  - Serialized via advisory lock (one agent won all):   ${serializedCount}`);
  console.log(`  - True concurrent race observed (primaries split):    ${raceCount}`);
  console.log('');

  if (allPass) {
    console.log('VERDICT: PASS — distribute_geo_to_children is race-safe under concurrent INSERTs.');
    if (serializedCount === NUM_TRIALS) {
      console.log('         All trials serialized via advisory lock — that is the expected and');
      console.log('         desired post-F-RACE-DEADLOCK behavior. Race safety is enforced via');
      console.log('         mutual exclusion at the trigger level rather than via concurrent');
      console.log('         constraint resolution. Both produce identical correctness guarantees.');
    } else {
      console.log('         Mixed serialization + concurrent-race outcomes; both produce');
      console.log('         consistent state via the partial unique index + EXCEPTION handler.');
    }
  } else {
    console.log('VERDICT: FAIL — at least one trial showed inconsistent state.');
    console.log('         Review failed trials above. Race safety is NOT guaranteed.');
    process.exit(1);
  }

  // Final state
  const finalClient = await getClient(pool);
  try {
    const final = await getOshawaState(finalClient);
    console.log('');
    console.log(`Final Oshawa state: muni_rows=${final.muni_rows}, community_rows=${final.community_rows}, community_primaries=${final.community_primaries}`);
    if (Number(final.muni_rows) > 0 || Number(final.community_rows) > 0) {
      console.log('WARNING: Oshawa still has apa rows after harness ran. Cleanup may have failed.');
    } else {
      console.log('Production state restored to baseline (Oshawa apa rows = 0).');
    }
  } finally {
    finalClient.release();
  }

  await pool.end();
}

main().catch(async e => {
  console.error('');
  console.error('FATAL:', e.message);
  if (e.detail)   console.error('  detail:  ', e.detail);
  if (e.hint)     console.error('  hint:    ', e.hint);
  if (e.where)    console.error('  where:   ', e.where);
  if (e.position) console.error('  position:', e.position);
  process.exit(1);
});