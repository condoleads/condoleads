#!/usr/bin/env node
// scripts/probe-w-leads-ui-polish-l1-state.js
// Read-only probe of leads.quality constraint, default, and value distribution.
// Mirrors apply-t6d-granted-by-tier-migration.js connection pattern.

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

(async () => {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DATABASE_URL;
  if (!url) {
    console.error('FAIL: no DATABASE_URL / POSTGRES_URL / SUPABASE_DB_URL / SUPABASE_DATABASE_URL in env');
    process.exit(1);
  }

  const pg = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  console.log('=== Probe 1: All CHECK constraints on public.leads ===');
  const c = await pg.query(
    "SELECT con.conname, pg_get_constraintdef(con.oid) AS def " +
    "FROM pg_constraint con " +
    "JOIN pg_class cls ON cls.oid = con.conrelid " +
    "JOIN pg_namespace ns ON ns.oid = cls.relnamespace " +
    "WHERE cls.relname = 'leads' AND ns.nspname = 'public' AND con.contype = 'c' " +
    "ORDER BY con.conname"
  );
  if (c.rows.length === 0) {
    console.log('  (no CHECK constraints on leads)');
  } else {
    c.rows.forEach(r => console.log('  ' + r.conname + '\n    ' + r.def));
  }

  console.log('');
  console.log('=== Probe 2: leads.quality column definition ===');
  const col = await pg.query(
    "SELECT column_name, data_type, is_nullable, column_default " +
    "FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'quality'"
  );
  if (col.rows.length === 0) {
    console.log('  (column NOT found)');
  } else {
    const r = col.rows[0];
    console.log('  column_name:    ' + r.column_name);
    console.log('  data_type:      ' + r.data_type);
    console.log('  is_nullable:    ' + r.is_nullable);
    console.log('  column_default: ' + (r.column_default === null ? '(NULL)' : r.column_default));
  }

  console.log('');
  console.log('=== Probe 3: leads.quality value distribution ===');
  const d = await pg.query(
    "SELECT quality, COUNT(*)::bigint AS n FROM public.leads GROUP BY quality ORDER BY n DESC"
  );
  let total = 0;
  d.rows.forEach(r => {
    const q = r.quality === null ? '(NULL)' : JSON.stringify(r.quality);
    console.log('  ' + q + ': ' + r.n);
    total += Number(r.n);
  });
  console.log('  TOTAL ROWS: ' + total);

  console.log('');
  console.log('=== Probe 4: tenant_id presence (multi-tenant safety check) ===');
  const tcol = await pg.query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'tenant_id'"
  );
  if (tcol.rows.length === 0) {
    console.log('  WARN: leads.tenant_id NOT FOUND');
  } else {
    console.log('  ' + JSON.stringify(tcol.rows[0]));
  }

  console.log('');
  console.log('=== Probe 5: leads row count by tenant_id (sanity check) ===');
  const tn = await pg.query(
    "SELECT tenant_id, COUNT(*)::bigint AS n FROM public.leads GROUP BY tenant_id ORDER BY n DESC LIMIT 10"
  );
  tn.rows.forEach(r => {
    const t = r.tenant_id === null ? '(NULL)' : r.tenant_id;
    console.log('  ' + t + ': ' + r.n);
  });

  await pg.end();
  console.log('');
  console.log('=== DONE -- read-only probe complete ===');
})().catch(err => {
  console.error('FAIL: ' + err.message);
  console.error(err.stack);
  process.exit(1);
});