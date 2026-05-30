#!/usr/bin/env node
/**
 * F-apa-secdef-sweep DOWN-runner.
 *
 * Down-migration: supabase/migrations/20260530_f_apa_secdef_sweep_down.sql
 *
 * Reverts handle_apa_{insert,update,delete}() from SECURITY DEFINER (+
 * locked search_path) back to SECURITY INVOKER. The function bodies are
 * unchanged across up/down, so this is a one-step migration -- no
 * snapshot-restore phase needed (unlike Event 4 Step B's down which
 * needed body restoration).
 *
 * WARNING: reverting re-opens F-EXISTING-HANDLE-APA-TRIGGERS-SAME-LATENT-
 * RISK. Today no production write path mutates APA via service_role
 * (all 7 use pg-direct as postgres), so reverting is safe -- but only
 * until any admin route writes APA via supabase-js.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DOWN_PATH = path.resolve(__dirname, '..', 'supabase', 'migrations',
  '20260530_f_apa_secdef_sweep_down.sql');

function fail(msg) { console.error('FATAL: ' + msg); process.exit(1); }

let downSql;
try { downSql = fs.readFileSync(DOWN_PATH, 'utf8'); }
catch (e) { fail('Could not read down sql: ' + e.message); }
if (downSql.charCodeAt(0) === 0xFEFF) downSql = downSql.slice(1);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) fail('DATABASE_URL not set');

(async () => {
  const c = new Client({ connectionString: DATABASE_URL });
  c.on('error', (e) => console.error('CLIENT ERROR: ' + e.message));
  await c.connect();
  c.on('notice', (n) => console.log('  NOTICE: ' + n.message));
  console.log('connected.');

  console.log('=== BEGIN (down); ===');
  await c.query('BEGIN');
  await c.query('SET LOCAL statement_timeout = 0');
  try {
    await c.query(downSql);
    // Post-revert assert.
    const r = await c.query(`
      SELECT proname, prosecdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('handle_apa_insert','handle_apa_update','handle_apa_delete')
      ORDER BY proname
    `);
    for (const row of r.rows) {
      if (row.prosecdef !== false) {
        throw new Error('DOWN V2 FAIL: ' + row.proname + '.prosecdef still TRUE');
      }
    }
    console.log('DOWN V2 PASS: all 3 handlers reverted to INVOKER.');
    console.log('=== COMMIT (down); ===');
    await c.query('COMMIT');
  } catch (e) {
    console.error('DOWN ERROR: ' + e.message);
    await c.query('ROLLBACK');
    console.log('=== ROLLBACK; ===');
    fail('Down failed; no state changed.');
  }

  await c.end();
  console.log('');
  console.log('=================================================');
  console.log('F-apa-secdef-sweep REVERTED. INVOKER restored.');
  console.log('WARNING: F-EXISTING-HANDLE-APA-TRIGGERS-SAME-LATENT-RISK is REOPEN.');
  console.log('=================================================');
})().catch((e) => { console.error('UNHANDLED: ' + e.message); process.exit(1); });
