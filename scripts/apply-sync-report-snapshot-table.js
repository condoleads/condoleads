// scripts/apply-sync-report-snapshot-table.js
// Create the sync_report_snapshot ops table that scripts/sync-report.ts has
// been trying to INSERT into since it was written. Without this table each
// report degrades to "delta: not recorded" for row_count and the operator
// can't confirm the never-decrease invariant across runs.
//
// Small additive DDL — CREATE TABLE IF NOT EXISTS + 1 index. No data
// modification, no destruction. Backfills one initial baseline row so the
// next report has a real BEFORE to compute a delta against.
//
// Runs inside BEGIN/COMMIT with pre/post row-count check on mls_listings
// to prove no accidental side effect on the main table.

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const DDL = `
BEGIN;

CREATE TABLE IF NOT EXISTS public.sync_report_snapshot (
  id BIGSERIAL PRIMARY KEY,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_count BIGINT NOT NULL,
  buildings_count BIGINT NOT NULL,
  trigger TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_report_snapshot_taken_at
  ON public.sync_report_snapshot (taken_at DESC);

-- Grant so the anon/service_role clients scripts/sync-report.ts uses can
-- SELECT + INSERT. Matches the grant posture of other ops tables.
GRANT SELECT, INSERT ON public.sync_report_snapshot TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.sync_report_snapshot_id_seq TO service_role;

COMMIT;
`;

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  console.log('=== pre-DDL invariants ===');
  const preMls = (await c.query('SELECT COUNT(*) AS n FROM mls_listings')).rows[0].n;
  const preBldg = (await c.query('SELECT COUNT(*) AS n FROM buildings')).rows[0].n;
  console.log('  mls_listings :', preMls);
  console.log('  buildings    :', preBldg);
  const existsBefore = (await c.query("SELECT to_regclass('public.sync_report_snapshot') AS t")).rows[0].t;
  console.log('  sync_report_snapshot exists BEFORE :', existsBefore || 'no');

  console.log('\n=== applying DDL ===');
  await c.query(DDL);
  console.log('  OK');

  console.log('\n=== post-DDL verification ===');
  const existsAfter = (await c.query("SELECT to_regclass('public.sync_report_snapshot') AS t")).rows[0].t;
  const cols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='sync_report_snapshot' ORDER BY ordinal_position");
  console.log('  exists AFTER :', existsAfter);
  console.log('  columns      :', cols.rows.map(r => r.column_name + ':' + r.data_type).join(', '));
  const postMls = (await c.query('SELECT COUNT(*) AS n FROM mls_listings')).rows[0].n;
  const postBldg = (await c.query('SELECT COUNT(*) AS n FROM buildings')).rows[0].n;
  console.log('  mls_listings AFTER :', postMls, '(delta:', Number(postMls) - Number(preMls) + ')');
  console.log('  buildings    AFTER :', postBldg, '(delta:', Number(postBldg) - Number(preBldg) + ')');
  if (postMls !== preMls) { console.error('FATAL: mls_listings changed'); process.exit(2); }
  if (postBldg !== preBldg) { console.error('FATAL: buildings changed'); process.exit(2); }

  console.log('\n=== backfill initial baseline row ===');
  const ins = await c.query(
    `INSERT INTO public.sync_report_snapshot (row_count, buildings_count, trigger)
     VALUES ($1, $2, $3) RETURNING id, taken_at, row_count, buildings_count, trigger`,
    [preMls, preBldg, 'baseline-backfill-2026-07-20']
  );
  console.log('  inserted:', JSON.stringify(ins.rows[0]));

  console.log('\n=== final state ===');
  const rows = await c.query('SELECT id, taken_at, row_count, buildings_count, trigger FROM sync_report_snapshot ORDER BY taken_at DESC LIMIT 5');
  rows.rows.forEach(r => console.log('  ' + JSON.stringify(r)));

  await c.end();
  console.log('\n=== done ===');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
