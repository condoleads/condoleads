#!/usr/bin/env node
// scripts/smoke-cv-charlie.js
// CV-CHARLIE real-key smoke against LIVE WALLiam.
// SAFETY: all lead writes inside BEGIN/ROLLBACK; the appointment email goes
// to delivered@resend.dev. Frugal: 1 real Anthropic call total.

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const WALLIAM_TENANT = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const NEO_SMITH      = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f';
const SAFE_RECIPIENT = 'delivered@resend.dev';

const results = [];
const errors = [];
function record(group, name, passed, expected, got) {
  results.push({ group, name, passed, expected: String(expected), got: String(got) });
  console.log('  [' + (passed ? 'PASS' : 'FAIL') + '] ' + group + ' / ' + name);
  if (!passed) console.log('         expected: ' + expected + '\n         got:      ' + got);
}
let anthropicCalls = 0, anthropicInputTokens = 0, anthropicOutputTokens = 0;
let outOfCredits = false;

// walkHierarchy port -- hierarchy.ts:36-89
async function walkHierarchy(client, agentId) {
  const chain = { manager_id: null, area_manager_id: null, tenant_admin_id: null, ancestors: [] };
  const selfR = await client.query(`SELECT id, role, parent_id FROM agents WHERE id=$1`, [agentId]);
  if (selfR.rows.length === 0) return chain;
  let cursor = selfR.rows[0].parent_id || null;
  const seen = new Set([agentId]);
  for (let hop = 0; hop < 6 && cursor; hop++) {
    if (seen.has(cursor)) break; seen.add(cursor);
    const r = await client.query(`SELECT id, role, parent_id FROM agents WHERE id=$1`, [cursor]);
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

(async () => {
  console.log('=== CV-CHARLIE real-key smoke ===\n');

  // Load tenant config -- need anthropic_api_key + resend_api_key.
  const c0 = new Client({ connectionString: process.env.DATABASE_URL });
  await c0.connect(); await c0.query('BEGIN READ ONLY');
  let tenant;
  try {
    const r = await c0.query(
      `SELECT resend_api_key, anthropic_api_key, send_from, email_from_domain, resend_verification_status, source_key, brand_name, name, domain
         FROM tenants WHERE id=$1`, [WALLIAM_TENANT]);
    tenant = r.rows[0];
  } finally { await c0.query('ROLLBACK').catch(()=>{}); await c0.end().catch(()=>{}); }

  if (!tenant.anthropic_api_key || !tenant.anthropic_api_key.startsWith('sk-ant-')) {
    console.error('FATAL: WALLiam tenant.anthropic_api_key invalid/missing.'); process.exit(2);
  }

  // ── Phase A: Charlie answers a real question (1 Anthropic call) ────────
  console.log('\n=== Phase A: Charlie answers a real question (1 real Anthropic call) ===');
  let aiResponseText = null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': tenant.anthropic_api_key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',   // FRUGAL: Haiku, not Sonnet
        max_tokens: 80,
        messages: [{ role: 'user', content: 'In one short sentence, what is the average size of a 1-bedroom condo in Toronto?' }],
      }),
    });
    anthropicCalls++;
    if (r.ok) {
      const j = await r.json();
      aiResponseText = j.content && j.content[0] && j.content[0].text;
      if (j.usage) {
        anthropicInputTokens += j.usage.input_tokens || 0;
        anthropicOutputTokens += j.usage.output_tokens || 0;
      }
    } else {
      const body = await r.text();
      if (r.status === 429 || /credit|balance|insufficient/i.test(body)) {
        outOfCredits = true;
        errors.push('Anthropic out-of-credits: ' + body.slice(0, 200));
      } else {
        errors.push('Anthropic ' + r.status + ': ' + body.slice(0, 200));
      }
    }
  } catch (e) { errors.push('Anthropic network: ' + e.message); }

  if (outOfCredits) {
    record('A Anthropic chat', 'real AI response received', false, 'non-empty text', 'OUT-OF-CREDITS (not a logic failure)');
  } else {
    record('A Anthropic chat', 'real AI response received',
      typeof aiResponseText === 'string' && aiResponseText.trim().length > 0,
      'non-empty AI response',
      'response=' + (aiResponseText ? '"' + aiResponseText.slice(0, 100).replace(/\n/g, ' ') + '..."' : 'NULL'));
  }

  // ── Phase B: Charlie books an appointment end-to-end (BEGIN/ROLLBACK) ──
  console.log('\n=== Phase B: Charlie appointment lead (BEGIN/ROLLBACK) ===');
  const c1 = new Client({ connectionString: process.env.DATABASE_URL });
  await c1.connect(); await c1.query('BEGIN'); await c1.query('SET LOCAL statement_timeout = 0');
  try {
    // Replicate charlie/appointment.ts:99-108 (RPC-only resolve).
    // Use a Whitby community where King Shah carves (Brooklin per prior recon).
    // communities table has no area_id column (area lives on municipalities) -- JOIN.
    const brooklinR = await c1.query(`
      SELECT com.id, com.municipality_id, m.area_id
        FROM communities com
        JOIN municipalities m ON m.id = com.municipality_id
       WHERE com.slug='brooklin' LIMIT 1`);
    if (brooklinR.rows.length === 0) throw new Error('Brooklin community not found');
    const brk = brooklinR.rows[0];

    const resolvR = await c1.query(
      `SELECT resolve_agent_for_context(NULL,NULL,NULL,$1,$2,$3,NULL,$4) AS agent_id`,
      [brk.id, brk.municipality_id, brk.area_id, WALLIAM_TENANT]);
    const resolvedAgent = resolvR.rows[0].agent_id;
    record('B appointment', 'resolver returns an agent for Brooklin / WALLiam', resolvedAgent !== null,
      'non-null agent', 'agent=' + (resolvedAgent || 'NULL'));

    // Walk chain for the resolved agent.
    const chain = resolvedAgent ? await walkHierarchy(c1, resolvedAgent) : { manager_id: null, area_manager_id: null, tenant_admin_id: null };

    // INSERT lead (appointment shape; matches charlie/appointment.ts:140-165).
    const leadR = await c1.query(
      `INSERT INTO leads (agent_id, manager_id, area_manager_id, tenant_admin_id,
                          contact_name, contact_email, contact_phone, source, lead_origin_route,
                          assignment_source, tenant_id, status,
                          appointment_date, appointment_time, appointment_status, intent, geo_name, community_id)
       VALUES ($1, $2, $3, $4,
               'CV Smoke Charlie Appointment',
               'cv-charlie-appt-smoke@example.invalid', '+10000000000',
               'walliam_charlie', 'charlie',
               $5, $6, 'new',
               '2026-06-15', '10:00 AM', 'pending', 'buyer', 'Brooklin', $7)
       RETURNING id, agent_id, manager_id, area_manager_id, tenant_admin_id, appointment_date, appointment_time, appointment_status`,
      [resolvedAgent, chain.manager_id, chain.area_manager_id, chain.tenant_admin_id,
       resolvedAgent ? 'geo' : 'admin', WALLIAM_TENANT, brk.id]);
    const lead = leadR.rows[0];

    record('B appointment', 'lead INSERT with appointment fields',
      lead.appointment_date !== null && lead.appointment_time !== null && lead.appointment_status === 'pending',
      'appointment_* fields stamped + status=pending',
      'date=' + lead.appointment_date + ' time=' + lead.appointment_time + ' status=' + lead.appointment_status);
    record('B appointment', 'agent_id stamped on lead', lead.agent_id === resolvedAgent,
      'agent_id=' + resolvedAgent, 'agent_id=' + lead.agent_id);
    // Chain assertion is tenant-admin-aware: when the resolved agent IS the
    // tenant_admin themselves, walkHierarchy correctly returns empty chain
    // (self never counted per hierarchy.ts:32). In that case lead.agent_id is
    // the tenant_admin and lead.tenant_admin_id legitimately NULL.
    const roleR = await c1.query(`SELECT role FROM agents WHERE id=$1`, [resolvedAgent]);
    const resolvedRole = roleR.rows[0]?.role || 'agent';
    const chainOK = (resolvedRole === 'tenant_admin' && lead.tenant_admin_id === null)
                 || (resolvedRole !== 'tenant_admin' && lead.tenant_admin_id !== null);
    record('B appointment', 'chain stamped (tenant-admin-aware)', chainOK,
      resolvedRole === 'tenant_admin'
        ? 'agent IS tenant_admin, so tenant_admin_id NULL is correct'
        : 'tenant_admin_id != NULL because agent is not itself tenant_admin',
      'resolvedRole=' + resolvedRole + ' tenant_admin_id=' + (lead.tenant_admin_id || 'NULL'));

    // (No real email send in Phase B -- envelope was already proven in CV-EMAIL.)
  } catch (e) {
    record('B appointment', 'lead INSERT path completes without error', false, 'no exception', e.message);
  } finally {
    await c1.query('ROLLBACK').catch(()=>{});
    await c1.end().catch(()=>{});
  }

  // ── Phase C: Charlie captures a lead (BEGIN/ROLLBACK) ──────────────────
  console.log('\n=== Phase C: Charlie general lead capture (BEGIN/ROLLBACK) ===');
  const c2 = new Client({ connectionString: process.env.DATABASE_URL });
  await c2.connect(); await c2.query('BEGIN'); await c2.query('SET LOCAL statement_timeout = 0');
  try {
    // Replicate charlie/lead.ts defensive INSERT path.
    const chain = await walkHierarchy(c2, NEO_SMITH);
    const leadR = await c2.query(
      `INSERT INTO leads (agent_id, manager_id, area_manager_id, tenant_admin_id,
                          contact_name, contact_email, contact_phone, source, lead_origin_route,
                          assignment_source, tenant_id, status, intent, plan_data)
       VALUES ($1, $2, $3, $4,
               'CV Smoke Charlie Lead',
               'cv-charlie-lead-smoke@example.invalid', '+10000000000',
               'walliam_charlie', 'charlie',
               'geo', $5, 'new', 'buyer',
               '{"geoName":"Brooklin","budgetMax":900000}')
       RETURNING id, agent_id, manager_id, area_manager_id, tenant_admin_id, plan_data`,
      [NEO_SMITH, chain.manager_id, chain.area_manager_id, chain.tenant_admin_id, WALLIAM_TENANT]);
    const lead = leadR.rows[0];
    record('C lead capture', 'lead INSERT with plan_data succeeds', !!lead.id,
      'lead row created with plan_data', 'id=' + (lead.id || 'NULL') + ' plan_data=' + JSON.stringify(lead.plan_data));
    record('C lead capture', 'agent_id = Neo Smith', lead.agent_id === NEO_SMITH,
      'agent=' + NEO_SMITH, 'agent=' + lead.agent_id);
    record('C lead capture', 'tenant_admin_id stamped (chain present)',
      lead.tenant_admin_id !== null,
      'tenant_admin != NULL', 'tenant_admin=' + (lead.tenant_admin_id || 'NULL'));
  } catch (e) {
    record('C lead capture', 'lead INSERT completes without error', false, 'no exception', e.message);
  } finally {
    await c2.query('ROLLBACK').catch(()=>{});
    await c2.end().catch(()=>{});
  }

  // ── Output table ───────────────────────────────────────────────────────
  const lines = [];
  lines.push('='.repeat(120));
  lines.push('CV-CHARLIE smoke results -- ' + new Date().toISOString());
  lines.push('  WALLiam tenant = ' + WALLIAM_TENANT);
  lines.push('  Anthropic calls: ' + anthropicCalls + '  input_tokens: ' + anthropicInputTokens + '  output_tokens: ' + anthropicOutputTokens);
  // Sonnet/Haiku 4 pricing -- Haiku-4-5 input $1/M, output $5/M (approximation)
  const cost = (anthropicInputTokens * 0.000001) + (anthropicOutputTokens * 0.000005);
  lines.push('  Anthropic est. cost (Haiku 4.5 pricing): $' + cost.toFixed(6));
  if (outOfCredits) lines.push('  !! OUT-OF-CREDITS encountered (not counted as logic failure)');
  if (errors.length > 0) for (const e of errors) lines.push('  ERROR: ' + e);
  lines.push('='.repeat(120));
  for (const r of results) {
    lines.push('  [' + (r.passed ? 'PASS' : 'FAIL') + '] ' + r.group + ' / ' + r.name);
    lines.push('     ' + r.expected + ' -> ' + r.got);
  }
  const passed = results.filter(r => r.passed).length;
  lines.push('');
  lines.push('TOTAL: ' + results.length + '  PASS: ' + passed + '  FAIL: ' + (results.length - passed));
  if (outOfCredits) lines.push('  (Phase A failure if any was due to out-of-credits, not a logic bug.)');
  lines.push('='.repeat(120));
  const text = lines.join('\n') + '\n';
  console.log('\n' + text);
  fs.writeFileSync(path.join(__dirname, '..', 'cv-charlie-smoke-output.txt'), text);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
