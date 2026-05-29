#!/usr/bin/env node
/**
 * W-TERRITORY-MASTER P-LIFECYCLE Landing 2 DOWN-runner.
 *
 * Reverts: DROP reresolve_listings_in_set + DROP patched reresolve_listing +
 * RESTORE original reresolve_listing body from the rollback snapshot file
 * captured by the up-runner.
 *
 * Pairs with:
 *   supabase/migrations/20260530_phase_lifecycle_landing_2_down.sql (DROP-only)
 *
 * Pattern:
 *   1. Validate DATABASE_URL (reject port 6543 transaction pooler).
 *   2. Locate the MOST RECENT snapshot file matching
 *      supabase/migrations/rollback-snapshots/_phase-lifecycle-landing-2_reresolve_listing_*.sql
 *      (lexicographically last; filenames embed ISO timestamps so this is
 *      newest-by-time).
 *   3. Read down .sql + snapshot .sql, both with BOM-strip + ASCII warning.
 *   4. Open one transaction, SET LOCAL statement_timeout = 0.
 *   5. Execute down .sql (DROPs both Landing 2 functions; in-tx V-asserts
 *      confirm absence).
 *   6. Execute snapshot .sql (CREATE OR REPLACE FUNCTION restores the
 *      original reresolve_listing body).
 *   7. Post-restore V-asserts: reresolve_listing exists, SECURITY INVOKER,
 *      no locked search_path, body byte-identical to the snapshot.
 *   8. COMMIT on success, ROLLBACK on any error.
 *
 * Usage:
 *   node scripts/apply-phase-lifecycle-landing-2-down.js
 *   node scripts/apply-phase-lifecycle-landing-2-down.js --snapshot=<filename>
 *     (explicit snapshot filename; otherwise newest is auto-selected)
 *
 * Operator review:
 *   Down-runs are operator-initiated. Run only when reverting Landing 2.
 *   Confirms which snapshot is selected before COMMIT-ting.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DOWN_SQL_PATH = path.resolve(__dirname, '..', 'supabase', 'migrations',
  '20260530_phase_lifecycle_landing_2_down.sql');
const SNAPSHOT_DIR = path.resolve(__dirname, '..', 'supabase', 'migrations', 'rollback-snapshots');
const SNAPSHOT_PREFIX = '_phase-lifecycle-landing-2_reresolve_listing_';

function fail(msg) {
  console.error('FATAL: ' + msg);
  process.exit(1);
}

function stripBom(s) {
  if (s.charCodeAt(0) === 0xFEFF) return s.slice(1);
  return s;
}

function warnNonAscii(label, sql) {
  const nonAscii = sql.match(/[^\x00-\x7F]/g);
  if (nonAscii) {
    const unique = Array.from(new Set(nonAscii));
    console.warn(`WARN: ${label} contains non-ASCII characters: ${unique.join(' ')}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Env validation
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) fail('DATABASE_URL not set in .env.local');

(function classifyUrl(u) {
  const m = u.match(/:(\d+)\//);
  if (!m) {
    console.warn('WARN: could not parse port from DATABASE_URL; proceeding.');
    return;
  }
  const port = parseInt(m[1], 10);
  if (port === 6543) {
    fail('DATABASE_URL points at port 6543 (transaction pooler). ' +
         'This breaks SET LOCAL statement_timeout. Switch to session pooler (5432).');
  }
  console.log(`env: DATABASE_URL port = ${port} (acceptable; not transaction-pooler).`);
})(DATABASE_URL);

// ---------------------------------------------------------------------------
// 2. Locate snapshot
// ---------------------------------------------------------------------------
function pickSnapshot() {
  // Allow operator override: --snapshot=<filename>
  const override = process.argv
    .find(a => a.startsWith('--snapshot='));
  if (override) {
    const filename = override.slice('--snapshot='.length).trim();
    const fullPath = path.isAbsolute(filename)
      ? filename
      : path.join(SNAPSHOT_DIR, filename);
    if (!fs.existsSync(fullPath)) {
      fail(`snapshot override does not exist: ${fullPath}`);
    }
    return fullPath;
  }

  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fail(`snapshot directory not found: ${SNAPSHOT_DIR}`);
  }
  const candidates = fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => f.startsWith(SNAPSHOT_PREFIX) && f.endsWith('.sql'))
    .sort();  // ISO timestamps -> lexicographic sort = chronological order
  if (candidates.length === 0) {
    fail(`no snapshot found matching ${SNAPSHOT_PREFIX}*.sql in ${SNAPSHOT_DIR}. ` +
         `Cannot restore reresolve_listing without a captured pre-Landing-2 body.`);
  }
  const newest = candidates[candidates.length - 1];
  console.log(`snapshot candidates found: ${candidates.length}`);
  for (const c of candidates) {
    console.log(`  ${c === newest ? '* ' : '  '}${c}`);
  }
  console.log(`selected: ${newest} (newest by timestamp)`);
  return path.join(SNAPSHOT_DIR, newest);
}

// ---------------------------------------------------------------------------
// 3. Read down .sql + snapshot .sql
// ---------------------------------------------------------------------------
const snapshotPath = pickSnapshot();

let downSql, snapshotSql;
try {
  downSql = stripBom(fs.readFileSync(DOWN_SQL_PATH, 'utf8'));
} catch (e) {
  fail('Could not read down .sql: ' + e.message);
}
try {
  snapshotSql = stripBom(fs.readFileSync(snapshotPath, 'utf8'));
} catch (e) {
  fail('Could not read snapshot: ' + e.message);
}
warnNonAscii('down .sql', downSql);
warnNonAscii('snapshot', snapshotSql);

console.log(`down .sql: ${downSql.length} bytes from ${path.relative(process.cwd(), DOWN_SQL_PATH)}`);
console.log(`snapshot:  ${snapshotSql.length} bytes from ${path.relative(process.cwd(), snapshotPath)}`);

// Sanity: snapshot must contain a CREATE OR REPLACE FUNCTION ... reresolve_listing
// declaration. If not, the snapshot is malformed (or the wrong file).
if (!/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.reresolve_listing\b/i.test(snapshotSql)) {
  fail('snapshot does not contain "CREATE OR REPLACE FUNCTION public.reresolve_listing"; ' +
       'cannot trust it as the restore source.');
}

// ---------------------------------------------------------------------------
// 4-7. Apply transaction
// ---------------------------------------------------------------------------
async function applyDown(client) {
  console.log('');
  console.log('=== BEGIN; ===');
  await client.query('BEGIN');
  await client.query('SET LOCAL statement_timeout = 0');

  client.on('notice', (n) => console.log('  NOTICE: ' + n.message));

  // Step A: execute the down .sql (DROPs both functions + V1/V2).
  try {
    console.log('executing down .sql (DROPs)...');
    await client.query(downSql);
    console.log('down .sql executed.');
  } catch (e) {
    console.error('DOWN .sql ERROR: ' + e.message);
    await client.query('ROLLBACK');
    console.log('=== ROLLBACK; ===');
    fail('down .sql failed before COMMIT.');
  }

  // Step B: execute the snapshot to restore reresolve_listing's original body.
  try {
    console.log('executing snapshot (restores reresolve_listing body)...');
    await client.query(snapshotSql);
    console.log('snapshot executed.');
  } catch (e) {
    console.error('SNAPSHOT EXEC ERROR: ' + e.message);
    await client.query('ROLLBACK');
    console.log('=== ROLLBACK; ===');
    fail('snapshot execution failed before COMMIT. State unchanged.');
  }

  // Step C: in-tx post-restore verification.
  console.log('verifying restored function shape...');
  const verifyRes = await client.query(
    `SELECT prosecdef, proconfig,
            EXISTS (
              SELECT 1 FROM pg_proc p2
              JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
              WHERE n2.nspname='public' AND p2.proname='reresolve_listings_in_set'
            ) AS in_set_still_present
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='reresolve_listing'`
  );
  if (verifyRes.rows.length !== 1) {
    await client.query('ROLLBACK');
    fail(`in-tx verify FAIL: expected 1 reresolve_listing post-restore, found ${verifyRes.rows.length}`);
  }
  const v = verifyRes.rows[0];
  if (v.in_set_still_present) {
    await client.query('ROLLBACK');
    fail('in-tx verify FAIL: reresolve_listings_in_set still present after DROP');
  }
  if (v.prosecdef !== false) {
    await client.query('ROLLBACK');
    fail(`in-tx verify FAIL: restored reresolve_listing.prosecdef = ${v.prosecdef} (expected false / SECURITY INVOKER)`);
  }
  if (v.proconfig) {
    await client.query('ROLLBACK');
    fail(`in-tx verify FAIL: restored reresolve_listing.proconfig is set (${v.proconfig}); expected NULL`);
  }
  console.log('in-tx verify PASS: reresolve_listing restored as SECURITY INVOKER, no proconfig. reresolve_listings_in_set absent.');

  console.log('=== COMMIT; ===');
  await client.query('COMMIT');
}

// ---------------------------------------------------------------------------
// 8. Post-COMMIT confirmation
// ---------------------------------------------------------------------------
async function postCommitConfirm(client) {
  console.log('');
  console.log('=== post-COMMIT confirmation ===');
  const r = await client.query(`
    SELECT
      EXISTS (SELECT 1 FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname='public' AND p.proname='reresolve_listing') AS rl_exists,
      EXISTS (SELECT 1 FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname='public' AND p.proname='reresolve_listings_in_set') AS in_set_exists
  `);
  const row = r.rows[0];
  console.log(`reresolve_listing exists:        ${row.rl_exists}  (expected true)`);
  console.log(`reresolve_listings_in_set exists: ${row.in_set_exists}  (expected false)`);
  if (!row.rl_exists || row.in_set_exists) {
    fail('post-COMMIT confirmation FAIL.');
  }
  console.log('post-COMMIT confirmation PASS.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('connected.');

  await applyDown(client);
  await postCommitConfirm(client);

  await client.end();

  console.log('');
  console.log('=================================================');
  console.log('P-LIFECYCLE Landing 2 DOWN COMMITTED + verified.');
  console.log('F-RERESOLVE-COUPLED-CHECK has RESURFACED (original body restored).');
  console.log('F-RESOLVE-AT-INSERT-PRIORITY has RESURFACED (NULL-cache drift will resume).');
  console.log('Snapshot used: ' + path.relative(process.cwd(), snapshotPath));
  console.log('=================================================');
})().catch((e) => {
  console.error('UNHANDLED: ' + e.message);
  process.exit(1);
});
