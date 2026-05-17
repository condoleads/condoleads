#!/usr/bin/env node
/**
 * recon-w-source-axis-t4h-fix.js
 *
 * Comprehensive read-only recon to ground the W-SOURCE-AXIS T4-h fix batch.
 * No writes, no DB mutations. Output to console + recon/W-SOURCE-AXIS-T4H-FIX.log
 */

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEST_LEAD_ID = '58c85af4-f6d8-4713-99db-2e8ecb029f3e';
const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';

const LOG_PATH = path.join(ROOT, 'recon', 'W-SOURCE-AXIS-T4H-FIX.log');
const logBuf = [];
function log(s) { console.log(s); logBuf.push(s); }
function section(title) {
  log('');
  log('================================================================');
  log('=== ' + title);
  log('================================================================');
}

const connString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL || process.env.POSTGRES_PRISMA_URL;
if (!connString) { console.error('NO DB CONNECTION STRING'); process.exit(1); }

function dumpFile(label, relPath) {
  section('FILE: ' + label + '  (' + relPath + ')');
  const p = path.join(ROOT, relPath);
  if (!fs.existsSync(p)) { log('MISSING: ' + relPath); return; }
  const content = fs.readFileSync(p, 'utf8');
  log('SIZE: ' + content.length + ' bytes');
  log('--- BEGIN ---');
  log(content);
  log('--- END ---');
}

function dumpFileSlice(label, relPath, startMarker, endMarker, context) {
  section('FILE SLICE: ' + label + '  (' + relPath + ')');
  const p = path.join(ROOT, relPath);
  if (!fs.existsSync(p)) { log('MISSING: ' + relPath); return; }
  const content = fs.readFileSync(p, 'utf8');
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) { log('START MARKER NOT FOUND: ' + startMarker); return; }
  const endIdx = endMarker ? content.indexOf(endMarker, startIdx + 1) : -1;
  const sliceEnd = endIdx === -1 ? Math.min(content.length, startIdx + (context || 2500)) : endIdx + endMarker.length;
  log('SLICE BYTES ' + startIdx + ' .. ' + sliceEnd);
  log('--- BEGIN SLICE ---');
  log(content.slice(Math.max(0, startIdx - 200), sliceEnd));
  log('--- END SLICE ---');
}

(async () => {
  // ============ FILES ============
  dumpFile('Workbench API route', 'app/api/admin-homes/leads/[id]/route.ts');
  dumpFile('Workbench client', 'app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx');
  dumpFileSlice('Leads-list client — Lead interface',
    'components/admin-homes/AdminHomesLeadsClient.tsx',
    'interface Lead',
    '}', 1500);
  dumpFileSlice('Leads-list client — pillRendered/ctx row block',
    'components/admin-homes/AdminHomesLeadsClient.tsx',
    'const pillRendered',
    'return (',
    2500);
  dumpFileSlice('Leads-list page — SELECT',
    'app/admin-homes/leads/page.tsx',
    '.select',
    '`)',
    1500);

  // ============ DB ============
  const client = new Client({ connectionString: connString });
  await client.connect();
  try {
    section('DB: FK constraints on public.leads');
    const fks = await client.query(`
      SELECT
        c.conname        AS constraint_name,
        a.attname        AS column_name,
        cf.relname       AS foreign_table,
        af.attname       AS foreign_column
      FROM pg_constraint c
      JOIN pg_class t  ON t.oid  = c.conrelid
      JOIN pg_class cf ON cf.oid = c.confrelid
      JOIN unnest(c.conkey)  WITH ORDINALITY ck(attnum, ord) ON true
      JOIN unnest(c.confkey) WITH ORDINALITY fk(attnum, ord) ON fk.ord = ck.ord
      JOIN pg_attribute a  ON a.attrelid = t.oid  AND a.attnum  = ck.attnum
      JOIN pg_attribute af ON af.attrelid = cf.oid AND af.attnum = fk.attnum
      WHERE t.relname = 'leads' AND c.contype = 'f'
      ORDER BY c.conname
    `);
    log('Found ' + fks.rowCount + ' FK constraints on leads:');
    for (const r of fks.rows) {
      log('  ' + r.constraint_name.padEnd(45) + ' leads.' + r.column_name + ' -> ' + r.foreign_table + '.' + r.foreign_column);
    }

    section('DB: leads columns');
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'leads'
      ORDER BY ordinal_position
    `);
    log('Total columns: ' + cols.rowCount);
    for (const r of cols.rows) {
      log('  ' + r.column_name.padEnd(30) + ' ' + r.data_type.padEnd(28) +
          ' nullable=' + r.is_nullable +
          (r.column_default ? ' default=' + r.column_default : ''));
    }

    section('DB: test lead row (full)');
    const lead = await client.query('SELECT * FROM leads WHERE id = $1', [TEST_LEAD_ID]);
    if (lead.rowCount === 0) { log('TEST LEAD NOT FOUND'); }
    else {
      const row = lead.rows[0];
      for (const k of Object.keys(row).sort()) {
        const v = row[k];
        const shown = v === null ? 'null' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
        log('  ' + k.padEnd(30) + ' ' + shown);
      }
    }

    section('DB: SQL-level JOIN test (do FK names resolve at SQL layer?)');
    const joinTest = await client.query(`
      SELECT
        l.id,
        b.building_name,
        ml.unparsed_address,
        a.name AS area_name,
        m.name AS muni_name,
        c.name AS comm_name,
        n.name AS neigh_name
      FROM leads l
      LEFT JOIN buildings      b  ON b.id  = l.building_id
      LEFT JOIN mls_listings   ml ON ml.id = l.listing_id
      LEFT JOIN treb_areas     a  ON a.id  = l.area_id
      LEFT JOIN municipalities m  ON m.id  = l.municipality_id
      LEFT JOIN communities    c  ON c.id  = l.community_id
      LEFT JOIN neighbourhoods n  ON n.id  = l.neighbourhood_id
      WHERE l.id = $1
    `, [TEST_LEAD_ID]);
    if (joinTest.rowCount > 0) {
      log('JOIN result:');
      const r = joinTest.rows[0];
      for (const k of Object.keys(r)) log('  ' + k.padEnd(20) + ' ' + r[k]);
    }

    section('DB: tables that look relevant to workbench tabs');
    const featureTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'lead_plans', 'plans', 'lead_emails', 'emails',
          'vip_requests', 'lead_vip_requests',
          'user_activities', 'activities',
          'chat_sessions', 'chat_messages', 'walliam_chat_messages',
          'lead_notes', 'notes',
          'lead_estimator_submissions', 'estimator_submissions',
          'lead_estimator_questionnaires',
          'chat_users', 'user_accounts', 'users',
          'lead_ownership_changes'
        )
      ORDER BY table_name
    `);
    log('Candidate tables present (' + featureTables.rowCount + '):');
    for (const r of featureTables.rows) log('  ' + r.table_name);

    section('DB: columns of each candidate table (to learn shape)');
    for (const r of featureTables.rows) {
      const tcols = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [r.table_name]);
      log('--- ' + r.table_name + ' (' + tcols.rowCount + ' cols) ---');
      for (const c of tcols.rows) {
        log('  ' + c.column_name.padEnd(30) + ' ' + c.data_type + ' nullable=' + c.is_nullable);
      }
    }

    section('DB: sample WALLiam lead that has the richest tab data');
    // Find a lead with the most non-null feature-indicating fields
    const richLead = await client.query(`
      SELECT l.id, l.contact_name, l.status, l.user_id,
             l.lead_origin_route, l.source, l.intent
      FROM leads l
      WHERE l.tenant_id = $1
        AND l.user_id IS NOT NULL
      ORDER BY l.created_at DESC
      LIMIT 5
    `, [WALLIAM_TENANT_ID]);
    log('Top 5 WALLiam leads with user_id set:');
    for (const r of richLead.rows) {
      log('  ' + r.id + '  ' + (r.contact_name || '(no name)') + '  user=' + r.user_id);
    }

    // For any candidate-tab tables that have lead_id, count rows for each top-5 lead
    section('DB: per-tab row counts for top-5 leads (to find which lead has the most populated tabs)');
    const tabTables = featureTables.rows.map(r => r.table_name);
    for (const lid of richLead.rows.map(r => r.id)) {
      log('Lead ' + lid + ':');
      for (const t of tabTables) {
        // Check if table has lead_id column
        const hasLeadIdRes = await client.query(`
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 AND column_name='lead_id'
        `, [t]);
        if (hasLeadIdRes.rowCount === 0) continue;
        const cnt = await client.query('SELECT COUNT(*)::int AS c FROM ' + t + ' WHERE lead_id = $1', [lid]);
        if (cnt.rows[0].c > 0) log('  ' + t.padEnd(30) + ' ' + cnt.rows[0].c + ' rows');
      }
    }

  } catch (e) {
    log('');
    log('DB ERROR: ' + e.message);
    if (e.detail) log('Detail: ' + e.detail);
  } finally {
    await client.end();
  }

  // Write log file
  fs.writeFileSync(LOG_PATH, logBuf.join('\n'), 'utf8');
  console.log('');
  console.log('Wrote: ' + path.relative(ROOT, LOG_PATH) + ' (' + fs.statSync(LOG_PATH).size + ' bytes)');
})();