#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL;
  const pg = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  console.log('=== Pre-migration: capture current constraint def ===');
  const pre = await pg.query(
    "SELECT con.conname, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con " +
    "JOIN pg_class cls ON cls.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = cls.relnamespace " +
    "WHERE cls.relname = 'user_credit_overrides' AND ns.nspname = 'public' " +
    "AND con.conname = 'user_credit_overrides_granted_by_tier_check'"
  );
  if (pre.rows.length === 0) {
    console.log('  WARN: pre-existing constraint not found (already migrated?)');
  } else {
    console.log('  ' + pre.rows[0].conname);
    console.log('    ' + pre.rows[0].def);
  }
  const preExpected = pre.rows.length > 0 ? pre.rows[0].def : null;
  console.log('');

  console.log('=== Apply migration ===');
  const migSql = fs.readFileSync(path.resolve('supabase/migrations/20260511_t6d_add_auto_to_granted_by_tier_check.sql'), 'utf8');
  await pg.query(migSql);
  console.log('  applied');
  console.log('');

  console.log('=== Post-migration: verify new constraint def ===');
  const post = await pg.query(
    "SELECT con.conname, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con " +
    "JOIN pg_class cls ON cls.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = cls.relnamespace " +
    "WHERE cls.relname = 'user_credit_overrides' AND ns.nspname = 'public' " +
    "AND con.conname = 'user_credit_overrides_granted_by_tier_check'"
  );
  if (post.rows.length === 0) {
    console.error('FAIL: constraint missing after migration');
    process.exit(1);
  }
  console.log('  ' + post.rows[0].conname);
  console.log('    ' + post.rows[0].def);
  const hasAuto = /'auto'::text/.test(post.rows[0].def);
  console.log('  Contains "auto": ' + hasAuto);
  if (!hasAuto) {
    console.error('FAIL: constraint does not include "auto" after migration');
    process.exit(1);
  }
  console.log('');

  console.log('=== Migration verified OK ===');
  await pg.end();
})().catch(err => { console.error('FAIL:', err.message); console.error(err.stack); process.exit(1); });