#!/usr/bin/env node
// scripts/smoke-cv-email.js
// CV-EMAIL real-key smoke against LIVE WALLiam.
// SAFETY: all SQL inside BEGIN/ROLLBACK; all emails to delivered@resend.dev only.
//
// Asserts:
//   1. sendTenantEmail pre-flight passes cleanly with the real key (closes
//      F-EMAIL-PREFLIGHT-ACCEPTS-PLACEHOLDER-KEY observation: not only does it
//      now NOT incorrectly accept a placeholder, it also passes with the real key).
//   2. getLeadEmailRecipients (JS port) builds the correct TO/CC/BCC envelope
//      from a real WALLiam agent's hierarchy.
//   3. Resend POST /emails returns 200 + a real message ID.
//   4. logEmailRecipients-equivalent INSERTs the audit rows (inside BEGIN/ROLLBACK).

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const WALLIAM_TENANT  = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const NEO_SMITH       = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f';  // agent, has parent chain
const SAFE_RECIPIENT  = 'delivered@resend.dev';

function fp(s) {
  if (!s) return '(NULL)';
  if (s.length < 12) return '(short)';
  return s.slice(0, 6) + '...' + s.slice(-4) + '  (len ' + s.length + ')';
}
const results = [];
function record(group, name, passed, expected, got) {
  results.push({ group, name, passed, expected: String(expected), got: String(got) });
  console.log('  [' + (passed ? 'PASS' : 'FAIL') + '] ' + group + ' / ' + name);
  if (!passed) console.log('         expected: ' + expected + '\n         got:      ' + got);
}

// ── Ports (cite source) ────────────────────────────────────────────────────
// walkHierarchy <- lib/admin-homes/hierarchy.ts:36-89
async function walkHierarchy(client, agentId) {
  const chain = { manager_id: null, area_manager_id: null, tenant_admin_id: null, ancestors: [] };
  const selfR = await client.query(`SELECT id, role, parent_id FROM agents WHERE id = $1`, [agentId]);
  if (selfR.rows.length === 0) return chain;
  let cursor = selfR.rows[0].parent_id || null;
  const seen = new Set([agentId]);
  for (let hop = 0; hop < 6 && cursor; hop++) {
    if (seen.has(cursor)) break; seen.add(cursor);
    const r = await client.query(`SELECT id, role, parent_id FROM agents WHERE id = $1`, [cursor]);
    if (r.rows.length === 0) break;
    const row = r.rows[0]; const role = row.role || 'agent';
    chain.ancestors.push({ id: row.id, role });
    if (chain.manager_id === null && role === 'manager')           chain.manager_id = row.id;
    if (chain.area_manager_id === null && role === 'area_manager') chain.area_manager_id = row.id;
    if (role === 'tenant_admin') { chain.tenant_admin_id = row.id; break; }
    cursor = row.parent_id;
  }
  return chain;
}

// getLeadEmailRecipients <- lead-email-recipients.ts:80-291 with savepoint isolation
async function getLeadEmailRecipients(client, tenantId, agentId) {
  const resolved = { agent: null, manager: null, area_manager: null, tenant_admin: null,
    manager_platforms: [], admin_platforms: [],
    agent_delegates: [], manager_delegates: [], area_manager_delegates: [], tenant_admin_delegates: [] };
  let agentEmail = null, managerEmail = null, areaManagerEmail = null, tenantAdminEmail = null;

  async function sv(label, q, p) {
    await client.query('SAVEPOINT sp_' + label);
    try { const r = await client.query(q, p); await client.query('RELEASE SAVEPOINT sp_' + label); return { ok: true, rows: r.rows }; }
    catch (e) { await client.query('ROLLBACK TO SAVEPOINT sp_' + label); return { ok: false, error: e }; }
  }

  if (agentId) {
    const r = await client.query(`SELECT id, email, notification_email FROM agents WHERE id = $1`, [agentId]);
    if (r.rows.length > 0) { agentEmail = r.rows[0].notification_email || r.rows[0].email || null; resolved.agent = agentEmail; }
  }
  const chain = agentId ? await walkHierarchy(client, agentId) : null;
  if (chain) {
    const ids = [chain.manager_id, chain.area_manager_id, chain.tenant_admin_id].filter(x => !!x);
    if (ids.length > 0) {
      const r = await client.query(`SELECT id, email, notification_email FROM agents WHERE id = ANY($1)`, [ids]);
      const byId = new Map(r.rows.map(row => [row.id, row.notification_email || row.email || null]));
      if (chain.manager_id)      { managerEmail     = byId.get(chain.manager_id)      || null; resolved.manager      = managerEmail; }
      if (chain.area_manager_id) { areaManagerEmail = byId.get(chain.area_manager_id) || null; resolved.area_manager = areaManagerEmail; }
      if (chain.tenant_admin_id) { tenantAdminEmail = byId.get(chain.tenant_admin_id) || null; resolved.tenant_admin = tenantAdminEmail; }
    }
  }
  const mp = [];
  const a5 = await sv('l5a', `SELECT platform_admin_id FROM platform_manager_tenants WHERE tenant_id=$1`, [tenantId]);
  if (a5.ok) {
    const ids5 = a5.rows.map(r => r.platform_admin_id);
    if (ids5.length > 0) {
      const a5b = await sv('l5b', `SELECT email FROM platform_admins WHERE id = ANY($1) AND tier='manager' AND is_active=TRUE`, [ids5]);
      if (a5b.ok) for (const r of a5b.rows) if (r.email) { mp.push(r.email); resolved.manager_platforms.push(r.email); }
    }
  }
  const ap = [];
  const a6 = await sv('l6', `SELECT id, email FROM platform_admins WHERE tier='admin' AND is_active=TRUE`);
  if (a6.ok) for (const r of a6.rows) if (r.email) { ap.push(r.email); resolved.admin_platforms.push(r.email); }
  if (ap.length === 0) throw new Error('AdminPlatformUnreachable');

  const to = []; const cc = []; const bcc = [];
  if (agentEmail) to.push(agentEmail); else to.push(ap[0]);
  if (managerEmail) cc.push(managerEmail);
  if (areaManagerEmail) bcc.push(areaManagerEmail);
  if (tenantAdminEmail) bcc.push(tenantAdminEmail);
  for (const e of mp) bcc.push(e);
  for (const e of ap) bcc.push(e);
  const dedup = a => Array.from(new Set(a.filter(Boolean)));
  return { to: dedup(to), cc: dedup(cc), bcc: dedup(bcc), resolved };
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
(async () => {
  console.log('=== CV-EMAIL real-key smoke ===\n');

  // Pre-flight: load tenant config + assert all four required fields.
  const c0 = new Client({ connectionString: process.env.DATABASE_URL });
  await c0.connect(); await c0.query('BEGIN READ ONLY');
  let tenant;
  try {
    const r = await c0.query(
      `SELECT resend_api_key, email_from_domain, send_from, resend_verification_status, brand_name, name
         FROM tenants WHERE id = $1`, [WALLIAM_TENANT]);
    tenant = r.rows[0];
  } finally { await c0.query('ROLLBACK').catch(()=>{}); await c0.end().catch(()=>{}); }

  // Mirror sendTenantEmail.ts:71-79 pre-flight.
  const missing = [];
  if (!tenant.resend_api_key)    missing.push('resend_api_key');
  if (!tenant.email_from_domain) missing.push('email_from_domain');
  if (!tenant.send_from)         missing.push('send_from');
  if (tenant.resend_verification_status !== 'verified') missing.push('verif=' + (tenant.resend_verification_status||'null'));
  record('pre-flight', 'WALLiam tenant passes sendTenantEmail pre-flight (real key)', missing.length === 0,
    'missing=[]', 'missing=[' + missing.join(',') + ']');
  record('pre-flight', 'resend_api_key shape valid', tenant.resend_api_key && tenant.resend_api_key.startsWith('re_'),
    'starts with re_', 'fp=' + fp(tenant.resend_api_key));
  if (missing.length > 0) { console.error('Aborting — pre-flight failed.'); process.exit(2); }

  // Envelope build via JS port — wrapped in pg client BEGIN so we can use savepoints.
  const c1 = new Client({ connectionString: process.env.DATABASE_URL });
  await c1.connect(); await c1.query('BEGIN'); await c1.query('SET LOCAL statement_timeout = 0');
  let env, chain;
  try {
    chain = await walkHierarchy(c1, NEO_SMITH);
    env = await getLeadEmailRecipients(c1, WALLIAM_TENANT, NEO_SMITH);
  } finally { await c1.query('ROLLBACK').catch(()=>{}); await c1.end().catch(()=>{}); }

  record('envelope build', 'TO contains the agent email', env.to.length >= 1 && env.resolved.agent !== null,
    'TO=[agent_email]', 'TO=' + JSON.stringify(env.to));
  record('envelope build', 'BCC contains tenant_admin (King Shah) up the chain',
    env.resolved.tenant_admin !== null && env.bcc.includes(env.resolved.tenant_admin),
    'tenant_admin in BCC', 'tenant_admin=' + env.resolved.tenant_admin + ' bcc=' + JSON.stringify(env.bcc));
  record('envelope build', 'BCC contains platform_admin (unconditional Layer 6)',
    env.resolved.admin_platforms.length >= 1 && env.bcc.includes(env.resolved.admin_platforms[0]),
    'platform_admin in BCC', 'admin_platforms=' + JSON.stringify(env.resolved.admin_platforms));
  console.log('  envelope: TO=' + JSON.stringify(env.to) + ' CC=' + JSON.stringify(env.cc) + ' BCC=' + JSON.stringify(env.bcc));

  // Real Resend send to delivered@resend.dev (Resend's documented test address).
  console.log('\n=== Real Resend send to ' + SAFE_RECIPIENT + ' ===');
  const subject = '[CV-EMAIL smoke] WALLiam real-key send test ' + new Date().toISOString();
  const html = '<p>CV-EMAIL smoke test. Envelope chain would have been:</p>'
    + '<ul><li>TO: ' + env.to.join(', ') + '</li>'
    + '<li>CC: ' + (env.cc.join(', ') || '(none)') + '</li>'
    + '<li>BCC: ' + env.bcc.join(', ') + '</li></ul>'
    + '<p>Actual recipient redirected to ' + SAFE_RECIPIENT + ' for safety.</p>';

  let resendOK = false, messageId = null, resendStatus = '?';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + tenant.resend_api_key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    tenant.send_from,
        to:      [SAFE_RECIPIENT],
        subject,
        html,
      }),
    });
    resendStatus = r.status + ' ' + r.statusText;
    if (r.ok) {
      const j = await r.json();
      messageId = j.id || null;
      resendOK = messageId !== null;
    } else {
      const body = await r.text();
      console.log('  Resend response body: ' + body.slice(0, 300));
    }
  } catch (e) {
    console.log('  fetch error: ' + e.message);
  }
  record('real send', 'Resend POST /emails returns 200 + message id', resendOK,
    '200 OK + non-null id', 'status=' + resendStatus + ' message_id=' + messageId);
  console.log('  Resend message ID: ' + messageId);

  // logEmailRecipients-equivalent: insert audit rows in BEGIN/ROLLBACK (assert
  // it WOULD succeed; the rollback ensures no actual rows persist).
  console.log('\n=== logEmailRecipients (BEGIN/ROLLBACK, audit rows asserted) ===');
  const c2 = new Client({ connectionString: process.env.DATABASE_URL });
  await c2.connect(); await c2.query('BEGIN');
  let auditInsertOK = false, auditRowCount = 0;
  try {
    // Build audit rows mirroring log-email-recipients.ts:153-189.
    // For simplicity we'll skip lead_id (the audit table likely requires it -- adapt if FK forbids).
    // Use a synthetic lead row in same tx to satisfy FK.
    const leadIns = await c2.query(
      `INSERT INTO leads (tenant_id, agent_id, manager_id, area_manager_id, tenant_admin_id,
                          contact_name, contact_email, source, assignment_source, status)
       VALUES ($1, $2, NULL, NULL, $3, 'CV Smoke', 'cv-email-smoke@example.invalid', 'contact_form', 'geo', 'new')
       RETURNING id`,
      [WALLIAM_TENANT, NEO_SMITH, chain.tenant_admin_id]);
    const leadId = leadIns.rows[0].id;
    const rowsToInsert = [];
    function row(email, position) {
      const layer = email === env.resolved.agent ? 'agent'
                  : email === env.resolved.manager ? 'manager'
                  : email === env.resolved.area_manager ? 'area_manager'
                  : email === env.resolved.tenant_admin ? 'tenant_admin'
                  : env.resolved.manager_platforms.includes(email) ? 'platform_manager'
                  : env.resolved.admin_platforms.includes(email) ? 'platform_admin'
                  : position === 'cc' ? 'tenant_overlay_cc' : 'tenant_overlay_bcc';
      return [WALLIAM_TENANT, leadId, NEO_SMITH, email, layer, position, subject, 'cv-email-smoke', messageId, 'sent', new Date().toISOString()];
    }
    for (const e of env.to)  rowsToInsert.push(row(e, 'to'));
    for (const e of env.cc)  rowsToInsert.push(row(e, 'cc'));
    for (const e of env.bcc) rowsToInsert.push(row(e, 'bcc'));

    // INSERT batched via unnest.
    for (const r of rowsToInsert) {
      await c2.query(
        `INSERT INTO lead_email_recipients_log
          (tenant_id, lead_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key, resend_message_id, status, sent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, r);
      auditRowCount++;
    }
    auditInsertOK = true;
  } catch (e) {
    console.log('  audit insert error: ' + e.message);
  } finally {
    await c2.query('ROLLBACK').catch(()=>{});  // SAFETY: rolls back the lead + audit rows
    await c2.end().catch(()=>{});
  }
  record('audit', 'logEmailRecipients audit rows INSERTed (then rolled back)',
    auditInsertOK && auditRowCount === env.to.length + env.cc.length + env.bcc.length,
    'rows = TO+CC+BCC = ' + (env.to.length + env.cc.length + env.bcc.length),
    'inserted=' + auditRowCount);

  // ── Output table ───────────────────────────────────────────────────────
  const lines = [];
  lines.push('='.repeat(120));
  lines.push('CV-EMAIL smoke results -- ' + new Date().toISOString());
  lines.push('  WALLiam tenant = ' + WALLIAM_TENANT);
  lines.push('  Resend message ID = ' + messageId);
  lines.push('='.repeat(120));
  for (const r of results) {
    lines.push('  [' + (r.passed ? 'PASS' : 'FAIL') + '] ' + r.group + ' / ' + r.name);
    lines.push('     ' + r.expected + ' -> ' + r.got);
  }
  const passed = results.filter(r => r.passed).length;
  lines.push('');
  lines.push('TOTAL: ' + results.length + '  PASS: ' + passed + '  FAIL: ' + (results.length - passed));
  lines.push('='.repeat(120));
  const text = lines.join('\n') + '\n';
  console.log('\n' + text);
  fs.writeFileSync(path.join(__dirname, '..', 'cv-email-smoke-output.txt'), text);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
