// scripts/apply-f-mls-listings-geo-indexes.js
// W-TERRITORY/F-MLS-LISTINGS-GEO-INDEXES — add btree indexes on the three geo
// columns used by reroll_listings_at_geo + distribute_listings_at_geo to
// filter mls_listings.
//
// PROBLEM (surfaced by T6-followup-A race harness post-advisory-lock):
//   The set-based reroll UPDATE filters mls_listings by area_id /
//   municipality_id / community_id depending on scope. With no index on
//   those columns, Postgres does a Seq Scan over all 1,254,063 mls_listings
//   rows for every reroll. Single-digit-seconds-per-call ops become
//   tens-of-seconds-per-call. The race harness's statement_timeout fires
//   while transactions wait in line for the advisory lock.
//
// SOLUTION:
//   Three btree indexes — one per geo column. Set-based UPDATE picks the
//   index for the active scope filter, scans only matching rows.
//
// SCALE:
//   mls_listings = 1.25M rows. CREATE INDEX (blocking) on each column
//   takes 30-90 seconds. Total wall-clock: 2-5 minutes.
//   Run during off-hours; pre-revenue so no live traffic impact.
//
// IDEMPOTENT: CREATE INDEX IF NOT EXISTS — safe to re-run.
// REVERSIBLE: rollback file written before apply.
//
// REQUIRES: pg installed, DATABASE_URL in .env.local.
// USAGE:    node scripts/apply-f-mls-listings-geo-indexes.js

const fs = require('fs');
const path = require('path');

const SQL = `-- scripts/r-territory-f-mls-listings-geo-indexes.sql
-- W-TERRITORY/F-MLS-LISTINGS-GEO-INDEXES
--
-- Three btree indexes on mls_listings.{area_id, municipality_id, community_id}
-- to make reroll_listings_at_geo + distribute_listings_at_geo perform Index
-- Scan instead of Seq Scan over 1.25M rows.
--
-- ANALYZE at end refreshes stats so planner picks the new indexes immediately.

CREATE INDEX IF NOT EXISTS idx_mls_listings_area_id
  ON public.mls_listings (area_id);

CREATE INDEX IF NOT EXISTS idx_mls_listings_municipality_id
  ON public.mls_listings (municipality_id);

CREATE INDEX IF NOT EXISTS idx_mls_listings_community_id
  ON public.mls_listings (community_id);

ANALYZE public.mls_listings;
`;

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

let Client;
try { ({ Client } = require('pg')); }
catch { console.error('pg not installed. Run: npm install --save-dev pg'); process.exit(1); }

const ts = (() => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
})();

async function dumpIndexes(client, label) {
  console.log('');
  console.log(`──── mls_listings indexes — ${label} ────`);
  const r = await client.query(`
    SELECT
      i.relname AS index_name,
      pg_get_indexdef(i.oid) AS index_def,
      pg_size_pretty(pg_relation_size(i.oid)) AS size
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'mls_listings'
    ORDER BY i.relname;
  `);
  for (const row of r.rows) {
    const isGeoIdx = ['idx_mls_listings_area_id', 'idx_mls_listings_municipality_id', 'idx_mls_listings_community_id'].includes(row.index_name);
    const marker = isGeoIdx ? ' ★' : '';
    console.log(`  ${row.index_name}${marker}  (${row.size})`);
  }
}

async function main() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('SET statement_timeout = 0;');
  console.log('Connected. statement_timeout disabled for index build.');

  // ─── Step 1: dump current indexes ─────────────────────────────────────────
  await dumpIndexes(client, 'BEFORE');

  // ─── Step 2: rollback snapshot ────────────────────────────────────────────
  console.log('');
  const rollbackPath = path.resolve(`scripts/r-territory-f-mls-listings-geo-indexes-rollback_${ts}.sql`);
  const rollbackSql = `-- Rollback for F-MLS-LISTINGS-GEO-INDEXES
-- Captured: ${new Date().toISOString()}
-- Drops the three geo-column indexes added by the forward migration.
-- Note: dropping these will cause reroll_listings_at_geo to Seq Scan
-- mls_listings again, killing performance. Only run if you have a reason.

DROP INDEX IF EXISTS public.idx_mls_listings_area_id;
DROP INDEX IF EXISTS public.idx_mls_listings_municipality_id;
DROP INDEX IF EXISTS public.idx_mls_listings_community_id;
`;
  fs.writeFileSync(rollbackPath, rollbackSql, 'utf8');
  console.log(`Step 2: rollback snapshot saved: ${path.basename(rollbackPath)}`);

  // ─── Step 3: archive forward SQL ──────────────────────────────────────────
  const sqlFile = path.resolve('scripts/r-territory-f-mls-listings-geo-indexes.sql');
  fs.writeFileSync(sqlFile, SQL, 'utf8');
  console.log(`Step 3: SQL archived: ${path.basename(sqlFile)} (${fs.statSync(sqlFile).size} bytes)`);

  // ─── Step 4: build indexes ────────────────────────────────────────────────
  console.log('');
  console.log('Step 4: building indexes (CREATE INDEX is blocking; expect 1-3 minutes total)...');
  const t0 = Date.now();
  await client.query(SQL);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  Done in ${dt}s.`);

  // ─── Step 5: verify all 3 indexes exist ───────────────────────────────────
  console.log('');
  console.log('Step 5: verifying installation...');
  const expected = ['idx_mls_listings_area_id', 'idx_mls_listings_municipality_id', 'idx_mls_listings_community_id'];
  const found = await client.query(`
    SELECT i.relname AS index_name
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'mls_listings'
      AND i.relname = ANY($1);
  `, [expected]);
  const foundNames = found.rows.map(r => r.index_name);

  let allPass = true;
  for (const name of expected) {
    const present = foundNames.includes(name);
    console.log(`  ${present ? 'PASS' : 'FAIL'}  ${name}`);
    if (!present) allPass = false;
  }

  // ─── Step 6: dump updated index list ──────────────────────────────────────
  await dumpIndexes(client, 'AFTER');

  // ─── Step 7: smoke-time the actual reroll query plan ──────────────────────
  console.log('');
  console.log('Step 7: smoke-timing reroll on Oshawa to confirm Index Scan plan...');
  const explain = await client.query(`
    EXPLAIN (FORMAT TEXT, ANALYZE, BUFFERS)
    SELECT id FROM public.mls_listings
    WHERE municipality_id = '94447f26-216a-47be-ac73-d07f33732036'::uuid;
  `);
  for (const row of explain.rows) {
    console.log(`  ${row['QUERY PLAN']}`);
  }

  await client.end();

  if (!allPass) {
    console.error('');
    console.error('VERIFICATION FAILED. Some indexes did not get created.');
    console.error('Rollback with:');
    console.error(`  Apply: ${rollbackPath}`);
    process.exit(1);
  }

  console.log('');
  console.log('───────────────────────────────────────────────────────────────────────');
  console.log('DONE. Geo indexes live on mls_listings.');
  console.log('');
  console.log('Files:');
  console.log(`  Forward:  ${path.basename(sqlFile)}`);
  console.log(`  Rollback: ${path.basename(rollbackPath)}`);
  console.log('');
  console.log('NEXT: re-run race harness. With indexes in place, each reroll should');
  console.log('drop from tens of seconds to single-digit seconds. Trials should');
  console.log('complete in ~10-30 seconds each instead of 177-358 seconds.');
  console.log('');
  console.log('  node scripts\\\\r-territory-t6-followup-race.js 5');
  console.log('');
  console.log('Expected per-trial output:');
  console.log('  PASS (no race - single agent won all) king_shah=20 neo_smith=0 cleanup=21 (~10000ms)');
  console.log('');
  console.log('Note: VERDICT will still be INCONCLUSIVE because raceObserved=false');
  console.log('with serialization. Next turn: patch harness acceptance criteria.');
  console.log('───────────────────────────────────────────────────────────────────────');
}

main().catch(e => {
  console.error('');
  console.error('ERROR:', e.message);
  if (e.detail)   console.error('  detail:  ', e.detail);
  if (e.hint)     console.error('  hint:    ', e.hint);
  if (e.where)    console.error('  where:   ', e.where);
  if (e.position) console.error('  position:', e.position);
  process.exit(1);
});