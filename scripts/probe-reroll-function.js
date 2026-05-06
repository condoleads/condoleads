// scripts/probe-reroll-function.js
// W-TERRITORY/F-AREA-REROLL-TIMEOUT — dump the actual function bodies
// and mls_listings shape so the fix can be designed against verified state,
// not assumptions.
//
// REQUIRES: pg installed (already shipped in v8 commit), DATABASE_URL in .env.local
// USAGE:    node scripts/probe-reroll-function.js
//
// Read-only. No writes. No transactions. No side effects.

const fs = require('fs');
const path = require('path');

// ─── env load (same pattern as run-r-territory-t6-smoke.js) ──────────────────
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
  console.error('No DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL found in .env.local or process.env.');
  process.exit(1);
}

let Client;
try { ({ Client } = require('pg')); }
catch { console.error('pg not installed. Run: npm install --save-dev pg'); process.exit(1); }

const banner = label => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  ' + label);
  console.log('═══════════════════════════════════════════════════════════════════════════');
};

async function dumpByName(client, fnName) {
  banner(`Function: ${fnName}`);
  const r = await client.query(`
    SELECT
      pg_get_functiondef(p.oid) AS def,
      p.pronargs,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = $1
    ORDER BY p.pronargs;
  `, [fnName]);

  if (r.rows.length === 0) {
    console.log(`(no function named ${fnName} in public schema)`);
    return;
  }
  r.rows.forEach((row, i) => {
    if (r.rows.length > 1) console.log(`--- variant ${i + 1} of ${r.rows.length}: (${row.args}) ---`);
    console.log(row.def);
  });
}

async function main() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('SET statement_timeout = 0;');
  console.log('Connected. statement_timeout disabled for probe.');

  // The two functions whose code we need to read to design the fix
  await dumpByName(client, 'reroll_listings_at_geo');
  await dumpByName(client, 'distribute_listings_at_geo');
  await dumpByName(client, 'pick_routing_agent');

  // The trigger function calling the reroll
  await dumpByName(client, 'handle_apa_insert');

  banner('mls_listings — geo + agent columns');
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mls_listings'
      AND (column_name LIKE '%area%' OR column_name LIKE '%municipality%'
           OR column_name LIKE '%community%' OR column_name LIKE '%neighbourhood%'
           OR column_name = 'assigned_agent_id'
           OR column_name = 'standard_status')
    ORDER BY column_name;
  `);
  console.table(cols.rows);

  banner('mls_listings — overall counts');
  const counts = await client.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE assigned_agent_id IS NOT NULL) AS with_agent,
      COUNT(*) FILTER (WHERE assigned_agent_id IS NULL)     AS without_agent
    FROM mls_listings;
  `);
  console.table(counts.rows);

  banner('mls_listings — Whitby muni listing count');
  const whitbyMuni = await client.query(`
    SELECT COUNT(*) AS whitby_muni_listings
    FROM mls_listings
    WHERE municipality_id = '70103aef-1b32-4939-9ff8-264e859a5587';
  `).catch(e => ({ rows: [{ err: e.message }] }));
  console.table(whitbyMuni.rows);

  banner('mls_listings — Whitby AREA listing count (the one that timed out)');
  // Whitby's parent area = 03d4e133-d9f9-4a7e-ba9a-83e57269c1d4
  // Try via municipality.area_id since mls_listings may not have area_id directly
  const whitbyArea = await client.query(`
    SELECT COUNT(*) AS whitby_area_listings
    FROM mls_listings ml
    JOIN municipalities m ON m.id = ml.municipality_id
    WHERE m.area_id = '03d4e133-d9f9-4a7e-ba9a-83e57269c1d4';
  `).catch(e => ({ rows: [{ err: e.message }] }));
  console.table(whitbyArea.rows);

  await client.end();
  console.log('');
  console.log('Done.');
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