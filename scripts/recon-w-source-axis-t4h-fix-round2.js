#!/usr/bin/env node
/**
 * recon-w-source-axis-t4h-fix-round2.js
 *
 * Round 2 recon. READ-ONLY.
 * Goal: locate the workbench's actual SELECT (server component page.tsx),
 *       identify the email-log table (if any), sample plan/credit/chat data.
 * Output: console + recon\W-SOURCE-AXIS-T4H-FIX-R2.log
 */

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEST_LEAD_ID = '58c85af4-f6d8-4713-99db-2e8ecb029f3e';
const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';

const LOG_PATH = path.join(ROOT, 'recon', 'W-SOURCE-AXIS-T4H-FIX-R2.log');
const logBuf = [];
function log(s) { console.log(s); logBuf.push(s); }
function section(t) {
  log('');
  log('================================================================');
  log('=== ' + t);
  log('================================================================');
}

(async () => {
  // ============ FILES ============
  section('FILE: workbench server page (app/admin-homes/leads/[id]/page.tsx)');
  const pageP = path.join(ROOT, 'app/admin-homes/leads/[id]/page.tsx');
  if (fs.existsSync(pageP)) {
    const c = fs.readFileSync(pageP, 'utf8');
    log('SIZE: ' + c.length + ' bytes');
    log('--- BEGIN ---');
    log(c);
    log('--- END ---');
  } else {
    log('MISSING: ' + pageP);
  }

  section('FILE: PlanRenderer (to see what plan_data shape it expects)');
  const planP = path.join(ROOT, 'components/admin-homes/lead-workbench/PlanRenderer.tsx');
  if (fs.existsSync(planP)) {
    const c = fs.readFileSync(planP, 'utf8');
    log('SIZE: ' + c.length + ' bytes');
    log('--- BEGIN ---');
    log(c);
    log('--- END ---');
  } else {
    log('MISSING: ' + planP);
  }

  section('FILE: EmailsTab (to see what emailLog rows look like)');
  const emailP = path.join(ROOT, 'components/admin-homes/lead-workbench/EmailsTab.tsx');
  if (fs.existsSync(emailP)) {
    const c = fs.readFileSync(emailP, 'utf8');
    log('SIZE: ' + c.length + ' bytes');
    log('--- BEGIN ---');
    log(c);
    log('--- END ---');
  } else {
    log('MISSING: ' + emailP);
  }

  // ============ DB ============
  const connString = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
                     process.env.SUPABASE_DB_URL || process.env.POSTGRES_PRISMA_URL;
  const client = new Client({ connectionString: connString });
  await client.connect();
  try {
    section('DB: search for email/log/mail tables');
    const r1 = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name ILIKE '%email%' OR table_name ILIKE '%log%' OR table_name ILIKE '%mail%')
      ORDER BY table_name
    `);
    if (r1.rowCount === 0) log('  (none)');
    else for (const x of r1.rows) log('  ' + x.table_name);

    section('DB: all tables with lead_id column');
    const r2 = await client.query(`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'lead_id'
      ORDER BY table_name
    `);
    for (const x of r2.rows) log('  ' + x.table_name);

    section('DB: tables with contact_email column');
    const r3 = await client.query(`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'contact_email'
      ORDER BY table_name
    `);
    for (const x of r3.rows) log('  ' + x.table_name);

    section('DB: users table columns');
    const r4 = await client.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
      ORDER BY ordinal_position
    `);
    for (const x of r4.rows) {
      log('  ' + x.column_name.padEnd(30) + ' ' + x.data_type + ' nullable=' + x.is_nullable);
    }

    section('DB: 3 WALLiam users we can pick from for user_id linkage');
    const r5 = await client.query(`
      SELECT u.id, u.email,
        (SELECT COUNT(*)::int FROM chat_sessions WHERE user_id = u.id) AS sessions,
        (SELECT COUNT(*)::int FROM leads WHERE user_id = u.id) AS leads_owned
      FROM users u WHERE u.tenant_id = $1
      ORDER BY u.created_at DESC LIMIT 3
    `, [WALLIAM_TENANT_ID]);
    if (r5.rowCount === 0) log('  (no WALLiam users)');
    else for (const x of r5.rows) {
      log('  ' + x.id + '  email=' + (x.email||'(null)') + '  sessions=' + x.sessions + '  leads_owned=' + x.leads_owned);
    }

    section('DB: a WALLiam lead with plan_data NOT NULL (to learn shape)');
    const r6 = await client.query(`
      SELECT id, contact_name, plan_data
      FROM leads
      WHERE tenant_id = $1 AND plan_data IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `, [WALLIAM_TENANT_ID]);
    if (r6.rowCount === 0) log('  (no WALLiam lead has plan_data populated)');
    else {
      log('  ' + r6.rows[0].id + '  ' + r6.rows[0].contact_name);
      log('  plan_data:');
      log(JSON.stringify(r6.rows[0].plan_data, null, 2));
    }

    section('DB: a WALLiam lead with property_details NOT NULL (estimator shape)');
    const r7 = await client.query(`
      SELECT id, contact_name, estimated_value_min, estimated_value_max, budget_max, property_details
      FROM leads
      WHERE tenant_id = $1 AND property_details IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `, [WALLIAM_TENANT_ID]);
    if (r7.rowCount === 0) log('  (no WALLiam lead has property_details)');
    else {
      log('  ' + r7.rows[0].id + '  ' + r7.rows[0].contact_name);
      log('  estimated_value_min: ' + r7.rows[0].estimated_value_min);
      log('  estimated_value_max: ' + r7.rows[0].estimated_value_max);
      log('  budget_max: ' + r7.rows[0].budget_max);
      log('  property_details: ' + JSON.stringify(r7.rows[0].property_details, null, 2));
    }

    section('DB: a vip_request row from this tenant (to learn full shape)');
    const r8 = await client.query(`
      SELECT * FROM vip_requests WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [WALLIAM_TENANT_ID]);
    if (r8.rowCount === 0) log('  (no vip_requests in tenant)');
    else {
      const v = r8.rows[0];
      for (const k of Object.keys(v).sort()) log('  ' + k.padEnd(25) + ' ' + (v[k] === null ? 'null' : (typeof v[k] === 'object' ? JSON.stringify(v[k]) : String(v[k]))));
    }

    section('DB: a user_activities row from this tenant (to learn shape)');
    const r9 = await client.query(`
      SELECT * FROM user_activities WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [WALLIAM_TENANT_ID]);
    if (r9.rowCount === 0) log('  (no user_activities in tenant)');
    else {
      const v = r9.rows[0];
      for (const k of Object.keys(v).sort()) log('  ' + k.padEnd(25) + ' ' + (v[k] === null ? 'null' : (typeof v[k] === 'object' ? JSON.stringify(v[k]) : String(v[k]))));
    }

    section('DB: a lead_notes row (to learn shape)');
    const r10 = await client.query(`
      SELECT ln.* FROM lead_notes ln
      JOIN leads l ON l.id = ln.lead_id
      WHERE l.tenant_id = $1
      ORDER BY ln.created_at DESC LIMIT 1
    `, [WALLIAM_TENANT_ID]);
    if (r10.rowCount === 0) log('  (no lead_notes for WALLiam leads)');
    else {
      const v = r10.rows[0];
      for (const k of Object.keys(v).sort()) log('  ' + k.padEnd(25) + ' ' + (v[k] === null ? 'null' : String(v[k])));
    }

    section('DB: a chat_messages row + parent session for context');
    const r11 = await client.query(`
      SELECT cm.id AS msg_id, cm.role, cm.tokens_used, LEFT(cm.content, 80) AS preview,
             cs.id AS session_id, cs.tenant_id, cs.user_id, cs.lead_id
      FROM chat_messages cm
      JOIN chat_sessions cs ON cs.id = cm.session_id
      WHERE cs.tenant_id = $1
      ORDER BY cm.created_at DESC LIMIT 3
    `, [WALLIAM_TENANT_ID]);
    for (const x of r11.rows) {
      log('  msg ' + x.msg_id + ' role=' + x.role + ' tokens=' + x.tokens_used + '  session=' + x.session_id + '  lead=' + (x.lead_id || '(null)'));
      log('    preview: ' + (x.preview || '').replace(/\n/g, ' '));
    }
  } finally {
    await client.end();
  }

  fs.writeFileSync(LOG_PATH, logBuf.join('\n'), 'utf8');
  console.log('');
  console.log('Wrote: ' + path.relative(ROOT, LOG_PATH) + ' (' + fs.statSync(LOG_PATH).size + ' bytes)');
})();