// scripts/run-r-territory-t6-smoke.js
// W-TERRITORY/T6 — direct-Postgres runner for the smoke matrix.
//
// Why this exists: Supabase Studio's SQL editor returns "Failed to fetch"
// on payloads above ~10 KB. The smoke script is ~13 KB. This runner sends
// the SQL over a direct pg connection, bypassing Studio entirely.
//
// Behavior is identical to running the SQL in Studio:
//   - Single transaction wrapping BEGIN ... ROLLBACK
//   - Production data is never persisted
//   - Final SELECT rows are printed as a table
//
// REQUIRES: pg installed at the repo root.
//   npm install --save-dev pg
//
// REQUIRES: a Postgres connection string in .env.local under one of:
//   DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING
//
// Get the connection string from Supabase Studio:
//   Settings → Database → Connection string → URI tab
//   Prefer "Direct connection" (port 5432). Pooler (6543) also works but
//   transaction-mode pooler can interact poorly with DO blocks.
//
// USAGE: node scripts/run-r-territory-t6-smoke.js

const fs = require('fs');
const path = require('path');

// ─── Load .env.local manually (no dotenv dep) ────────────────────────────────
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
  console.error('');
  console.error('Looked for: ' + connCandidates.join(', '));
  console.error('In: .env.local and process.env');
  console.error('');
  console.error('Add to .env.local — get URL from Supabase Studio:');
  console.error('  Settings -> Database -> Connection string -> URI tab');
  console.error('Format:');
  console.error('  DATABASE_URL=postgresql://postgres.YOURPROJECTREF:YOURPASSWORD@HOST:5432/postgres');
  process.exit(1);
}

const maskedConnStr = connStr.replace(/:([^:@]+)@/, ':****@');
console.log(`Connection: ${maskedConnStr}`);
console.log(`Source:     ${connStrSource}`);
console.log('');

// ─── Verify pg is installed ──────────────────────────────────────────────────
let Client;
try {
  ({ Client } = require('pg'));
} catch (e) {
  console.error('ERROR: pg package not installed at the repo root.');
  console.error('Install it:  npm install --save-dev pg');
  process.exit(1);
}

// ─── Read smoke SQL + split on comment markers ───────────────────────────────
const SMOKE_SQL = path.resolve('scripts/r-territory-t6-smoke.sql');
if (!fs.existsSync(SMOKE_SQL)) {
  console.error(`ERROR: ${SMOKE_SQL} not found.`);
  process.exit(1);
}
const fullSql = fs.readFileSync(SMOKE_SQL, 'utf8');
console.log(`Smoke SQL: ${SMOKE_SQL} (${fullSql.length} chars)`);

// We split the file at the markers preceding the final SELECT and the ROLLBACK
// so we can capture the SELECT's rows before issuing ROLLBACK.
const finalSelectMarker = '-- ─── Final result set';
const rollbackMarker    = '-- ─── Roll back EVERYTHING';
const finalSelectIdx = fullSql.indexOf(finalSelectMarker);
const rollbackIdx    = fullSql.indexOf(rollbackMarker);
if (finalSelectIdx < 0 || rollbackIdx < 0) {
  console.error('ERROR: smoke SQL is missing expected comment markers.');
  console.error(`  "${finalSelectMarker}" found: ${finalSelectIdx >= 0}`);
  console.error(`  "${rollbackMarker}" found:    ${rollbackIdx >= 0}`);
  process.exit(1);
}
const body        = fullSql.slice(0, finalSelectIdx);             // BEGIN through summary insert
const finalSelect = fullSql.slice(finalSelectIdx, rollbackIdx);   // The SELECT we want rows from
console.log(`Body:        ${body.length} chars`);
console.log(`FinalSelect: ${finalSelect.length} chars`);
console.log('');

// ─── Connect + execute + rollback ────────────────────────────────────────────
async function main() {
  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
  });

  let exitCode = 0;
  let result = null;

  try {
    await client.connect();
    console.log('Connected to Postgres.');

    // Disable statement_timeout for this session. Area-scope reroll in Test 4
    // touches every mls_listings row in the area, which exceeds Supabase's
    // default timeout. Session-scoped: cleared when client.end() runs.
    // (Production behavior unaffected — this only applies to this runner.)
    await client.query('SET statement_timeout = 0;');
    console.log('statement_timeout disabled for this session.');
    console.log('');

    // The body contains BEGIN; ... it does NOT commit. The transaction is open
    // after this call returns. All temp tables, INSERTs, DELETEs live inside it.
    await client.query(body);
    console.log('Body executed: setup + 6 tests + summary INSERT.');

    // Final SELECT against the in-transaction temp table.
    result = await client.query(finalSelect);

    // Discard everything. Production data untouched.
    await client.query('ROLLBACK;');
    console.log('ROLLBACK issued — production data untouched.');
    console.log('');
  } catch (e) {
    console.error('');
    console.error('ERROR during execution:');
    console.error('  message: ', e.message);
    if (e.detail)   console.error('  detail:  ', e.detail);
    if (e.hint)     console.error('  hint:    ', e.hint);
    if (e.where)    console.error('  where:   ', e.where);
    if (e.position) console.error('  position:', e.position);
    try { await client.query('ROLLBACK;'); console.error('Rollback issued after error.'); } catch (_) {}
    try { await client.end(); } catch (_) {}
    process.exit(1);
  }

  // ─── Display results ───────────────────────────────────────────────────────
  console.log('===== T6 SMOKE RESULTS =====');
  console.log('');
  if (!result.rows || result.rows.length === 0) {
    console.log('(no rows returned — script body may have skipped result inserts)');
  } else {
    console.table(result.rows.map(r => ({
      test_id:   r.test_id,
      test_name: r.test_name,
      result:    r.result,
      detail:    (r.detail || '').slice(0, 120),
    })));
    console.log('');
    console.log('Full detail (untruncated):');
    for (const r of result.rows) {
      console.log(`  [${r.test_id}] ${r.test_name} -> ${r.result}`);
      console.log(`      ${r.detail || ''}`);
    }
  }

  const summary = result.rows.find(r => r.test_id === 99);
  if (summary) {
    console.log('');
    console.log(`SUMMARY: ${summary.result} — ${summary.detail}`);
  }

  const failed = result.rows.filter(r => r.test_id >= 1 && r.test_id <= 6 && r.result === 'FAIL');
  if (failed.length > 0) {
    console.log('');
    console.log('FAILED TESTS:');
    for (const f of failed) {
      console.log(`  Test ${f.test_id} (${f.test_name}):`);
      console.log(`    ${f.detail}`);
    }
    exitCode = 1;
  }

  try { await client.end(); } catch (_) {}
  process.exit(exitCode);
}

main();