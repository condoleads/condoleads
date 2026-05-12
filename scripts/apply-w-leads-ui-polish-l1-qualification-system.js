#!/usr/bin/env node
// scripts/apply-w-leads-ui-polish-l1-qualification-system.js
//
// Applies the L1 qualification system migration (UNION CHECK). Idempotent.
// Mirrors apply-t6d-granted-by-tier-migration.js connection pattern.

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const LEGACY_VALUES = ['hot', 'warm', 'cold'];
const NEW_VALUES = ['unqualified', 'qualified_hot', 'qualified_cold', 'disqualified'];
const ALL_VALUES = LEGACY_VALUES.concat(NEW_VALUES);

(async () => {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DATABASE_URL;
  if (!url) { console.error('FAIL: no DB URL in env'); process.exit(1); }

  const pg = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  console.log('=== Pre-state: leads_quality_check ===');
  const pre = await pg.query(
    "SELECT pg_get_constraintdef(con.oid) AS def FROM pg_constraint con " +
    "JOIN pg_class cls ON cls.oid = con.conrelid " +
    "WHERE cls.relname = 'leads' AND con.conname = 'leads_quality_check'"
  );
  console.log(pre.rows.length === 0 ? '  (constraint missing)' : '  ' + pre.rows[0].def);

  console.log('\n=== Pre-state: leads.quality default ===');
  const preDef = await pg.query(
    "SELECT column_default FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'quality'"
  );
  console.log('  ' + (preDef.rows[0] ? preDef.rows[0].column_default : '(no row)'));

  console.log('\n=== Pre-state: leads.quality distribution ===');
  const preDist = await pg.query(
    "SELECT quality, COUNT(*)::bigint AS n FROM public.leads GROUP BY quality ORDER BY n DESC"
  );
  preDist.rows.forEach(r => {
    const q = r.quality === null ? '(NULL)' : JSON.stringify(r.quality);
    console.log('  ' + q + ': ' + r.n);
  });

  // Idempotency: skip if all 7 values already in constraint
  const alreadyMigrated = pre.rows.length > 0 &&
    ALL_VALUES.every(v => pre.rows[0].def.includes("'" + v + "'"));
  if (alreadyMigrated) {
    console.log('\n=== Already migrated -- skipping ===');
    await pg.end();
    return;
  }

  console.log('\n=== Apply migration ===');
  const migPath = path.resolve(__dirname, '..', 'supabase/migrations/20260512_l1_qualification_system_constraint.sql');
  const sql = fs.readFileSync(migPath, 'utf8');
  await pg.query(sql);
  console.log('  applied');

  console.log('\n=== Post-state: leads_quality_check ===');
  const post = await pg.query(
    "SELECT pg_get_constraintdef(con.oid) AS def FROM pg_constraint con " +
    "JOIN pg_class cls ON cls.oid = con.conrelid " +
    "WHERE cls.relname = 'leads' AND con.conname = 'leads_quality_check'"
  );
  if (post.rows.length === 0) { console.error('FAIL: constraint missing after migration'); process.exit(1); }
  console.log('  ' + post.rows[0].def);
  for (const v of ALL_VALUES) {
    if (!post.rows[0].def.includes("'" + v + "'")) {
      console.error('FAIL: post-migration constraint missing value: ' + v);
      process.exit(1);
    }
  }
  console.log('  OK all 7 values present (3 legacy + 4 new)');

  console.log('\n=== Post-state: leads.quality default ===');
  const postDef = await pg.query(
    "SELECT column_default FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'quality'"
  );
  const dflt = postDef.rows[0].column_default;
  console.log('  ' + dflt);
  if (!dflt || !dflt.includes("'unqualified'")) {
    console.error("FAIL: default not 'unqualified'");
    process.exit(1);
  }
  console.log("  OK default = 'unqualified'");

  console.log('\n=== Post-state: leads.quality distribution ===');
  const postDist = await pg.query(
    "SELECT quality, COUNT(*)::bigint AS n FROM public.leads GROUP BY quality ORDER BY n DESC"
  );
  postDist.rows.forEach(r => {
    const q = r.quality === null ? '(NULL)' : JSON.stringify(r.quality);
    console.log('  ' + q + ': ' + r.n);
  });
  for (const r of postDist.rows) {
    if (r.quality !== null && !ALL_VALUES.includes(r.quality)) {
      console.error('FAIL: unexpected post-migration value: ' + r.quality);
      process.exit(1);
    }
  }
  // Existing rows: all should be backfilled to qualified_hot or unqualified
  for (const r of postDist.rows) {
    if (LEGACY_VALUES.includes(r.quality) && Number(r.n) > 0) {
      console.error('FAIL: legacy value remains after backfill: ' + r.quality + ' (' + r.n + ' rows)');
      process.exit(1);
    }
  }
  console.log('  OK all existing rows in new value set (no legacy residue post-backfill)');

  await pg.end();
  console.log('\n=== Migration verified OK ===');
})().catch(err => {
  console.error('FAIL: ' + err.message);
  console.error(err.stack);
  process.exit(1);
});