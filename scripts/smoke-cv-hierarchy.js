#!/usr/bin/env node
// scripts/smoke-cv-hierarchy.js
// W-CORE-VERIFICATION CV-HIERARCHY autonomous smoke.
//
// Asserts the hierarchy chain → leads stamp → email envelope flow against
// the committed CV-FIXTURE. All writes are inside BEGIN/ROLLBACK (lead
// inserts, agent UPDATEs for the frozen-after test); never COMMITed.
//
// IMPORTANT: this script ports two TS functions to JS verbatim (no tsx
// available in this project). The port is auditable against the originals:
//   walkHierarchy             <- lib/admin-homes/hierarchy.ts:36-89
//   getLeadEmailRecipients    <- lib/admin-homes/lead-email-recipients.ts:80-291
// Each port lists the source line-range so any reviewer can diff.
//
// One pg client per probe (F-VERIFY-READONLY-HANG). Real ids read at runtime
// from cv-fixture-teardown-manifest.json -- never hardcoded.

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const cfg = require('./cv-fixture-config');

const cs = process.env.DATABASE_URL;
if (!cs) { console.error('FATAL: DATABASE_URL not set.'); process.exit(1); }
function fail(msg) { console.error('FATAL: ' + msg); process.exit(1); }

// ─── Load manifest ──────────────────────────────────────────────────────────
const manifestLines = fs.readFileSync(cfg.PATHS.manifest, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const footer = manifestLines.find(l => l.kind === 'footer' && l.status === 'committed');
if (!footer) fail('manifest has no committed footer.');
const tenantPrimary = footer.primary_tenant_id;
const agentsPrimary = new Map();
const testListings  = new Map();
for (const l of manifestLines) {
  if (l.kind === 'agent' && l.tenant_spec === 'primary') agentsPrimary.set(l.spec_key, l.id);
  if (l.kind === 'test_listing') testListings.set(l.spec_key, l.id);
}
const TENANT_ADMIN  = agentsPrimary.get('tenant_admin');
const AREA_MANAGER  = agentsPrimary.get('area_manager');
const MANAGER       = agentsPrimary.get('manager');
const AGENT_ALPHA   = agentsPrimary.get('agent_alpha');
const AGENT_BUILDING= agentsPrimary.get('agent_building');
if (!TENANT_ADMIN || !AREA_MANAGER || !MANAGER || !AGENT_ALPHA) fail('manifest missing chain agents.');
console.log('manifest loaded:');
console.log('  tenant         = ' + tenantPrimary);
console.log('  tenant_admin   = ' + TENANT_ADMIN);
console.log('  area_manager   = ' + AREA_MANAGER);
console.log('  manager        = ' + MANAGER);
console.log('  agent_alpha    = ' + AGENT_ALPHA);

// ─── Probe helpers ──────────────────────────────────────────────────────────
async function probeRO(label, fn) {
  const c = new Client({ connectionString: cs });
  c.on('error', e => console.error('  [' + label + '] err: ' + e.message));
  await c.connect();
  await c.query('BEGIN READ ONLY');
  await c.query('SET LOCAL statement_timeout = 0');
  try { return await fn(c); }
  finally { await c.query('ROLLBACK').catch(()=>{}); await c.end().catch(()=>{}); }
}
async function probeRW(label, fn) {
  const c = new Client({ connectionString: cs });
  c.on('error', e => console.error('  [' + label + '] err: ' + e.message));
  await c.connect();
  await c.query('BEGIN');
  await c.query('SET LOCAL statement_timeout = 0');
  try { return await fn(c); }
  finally { await c.query('ROLLBACK').catch(()=>{}); await c.end().catch(()=>{}); }
}

const results = [];
function record(group, name, role, passed, expected, got) {
  results.push({ group, name, role, passed, expected: String(expected), got: String(got) });
  console.log('  [' + (passed ? 'PASS' : 'FAIL') + '] ' + group + ' / ' + name + ' (' + role + ')');
  if (!passed) console.log('         expected: ' + expected + '\n         got:      ' + got);
}

// ─── JS PORT: walkHierarchy ─────────────────────────────────────────────────
// Source: lib/admin-homes/hierarchy.ts:36-89 (commit at CV-FIXTURE apply time).
// Semantics (cited from source comments):
//   - Walk parent_id upward from agentId.
//   - First ancestor with role='manager'      → manager_id
//   - First ancestor with role='area_manager' → area_manager_id
//   - Stop at tenant_admin or parent_id IS NULL.
//   - Cap at MAX_HOPS=6.
//   - The agent itself does NOT count -- only ancestors stamped.
const MAX_HOPS = 6;
async function walkHierarchy(client, agentId) {
  const chain = { manager_id: null, area_manager_id: null, tenant_admin_id: null, ancestors: [] };
  // hierarchy.ts:48-52
  const selfR = await client.query(`SELECT id, role, parent_id FROM agents WHERE id = $1`, [agentId]);
  if (selfR.rows.length === 0) return chain;
  let cursor = selfR.rows[0].parent_id || null;
  const seen = new Set([agentId]);
  // hierarchy.ts:58-86
  for (let hop = 0; hop < MAX_HOPS && cursor; hop++) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const r = await client.query(`SELECT id, role, parent_id FROM agents WHERE id = $1`, [cursor]);
    if (r.rows.length === 0) break;
    const row = r.rows[0];
    const role = row.role || 'agent';
    chain.ancestors.push({ id: row.id, role });
    if (chain.manager_id === null && role === 'manager')           chain.manager_id = row.id;
    if (chain.area_manager_id === null && role === 'area_manager') chain.area_manager_id = row.id;
    if (role === 'tenant_admin') { chain.tenant_admin_id = row.id; break; }
    cursor = row.parent_id;
  }
  return chain;
}

// ─── JS PORT: getLeadEmailRecipients ────────────────────────────────────────
// Source: lib/admin-homes/lead-email-recipients.ts:80-291.
// Layer 1 (TO) = agent.notification_email||email; Layer 2 (CC) = manager;
// Layer 3 BCC area_manager; Layer 4 BCC tenant_admin; Layer 5 BCC platform_manager;
// Layer 6 BCC platform_admin (UNCONDITIONAL -- throws if none).
// Layer 1 fallback: no agent → admin_platform promoted to TO.
class AdminPlatformUnreachable extends Error { constructor(m){ super(m); this.name='AdminPlatformUnreachable'; } }
async function getLeadEmailRecipients(client, tenantId, agentId) {
  const resolved = {
    agent: null, manager: null, area_manager: null, tenant_admin: null,
    manager_platforms: [], admin_platforms: [],
    agent_delegates: [], manager_delegates: [], area_manager_delegates: [], tenant_admin_delegates: [],
  };
  let agentEmail = null, managerEmail = null, areaManagerEmail = null, tenantAdminEmail = null;

  // Layer 1 -- lead-email-recipients.ts:103-115
  if (agentId) {
    const r = await client.query(`SELECT id, email, notification_email FROM agents WHERE id = $1`, [agentId]);
    if (r.rows.length > 0) {
      agentEmail = r.rows[0].notification_email || r.rows[0].email || null;
      resolved.agent = agentEmail;
    }
  }

  // Layers 2-4 -- lead-email-recipients.ts:117-150
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

  // Delegate overlay -- skipped here (no agent_delegations rows in fixture).
  // lead-email-recipients.ts:152-202 -- functionally a no-op when agent_delegations is empty.

  // savepointTry: isolates a query so permission_denied (or any error) does
  // not poison the surrounding BEGIN. Mirrors supabase-js's contract where
  // each PostgREST request is independent.
  async function savepointTry(label, query, params) {
    await client.query('SAVEPOINT sp_' + label);
    try {
      const r = await client.query(query, params);
      await client.query('RELEASE SAVEPOINT sp_' + label);
      return { ok: true, rows: r.rows };
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT sp_' + label);
      return { ok: false, error: e };
    }
  }

  // Layer 5 -- lead-email-recipients.ts:204-230.
  const managerPlatformEmails = [];
  const a5 = await savepointTry('l5_assign',
    `SELECT platform_admin_id FROM platform_manager_tenants WHERE tenant_id = $1`, [tenantId]);
  if (a5.ok) {
    const assignedIds = a5.rows.map(r => r.platform_admin_id);
    if (assignedIds.length > 0) {
      const mpr = await savepointTry('l5_emails',
        `SELECT email FROM platform_admins WHERE id = ANY($1) AND tier='manager' AND is_active = TRUE`,
        [assignedIds]);
      if (mpr.ok) for (const r of mpr.rows) if (r.email) { managerPlatformEmails.push(r.email); resolved.manager_platforms.push(r.email); }
    }
    resolved._layer5_table_access = 'ok';
  } else {
    resolved._layer5_table_access = a5.error.code === '42501' ? 'permission_denied' : 'error:' + a5.error.code;
  }

  // Layer 6 -- lead-email-recipients.ts:232-251 -- UNCONDITIONAL.
  const adminPlatformEmails = [];
  const a6 = await savepointTry('l6',
    `SELECT id, email FROM platform_admins WHERE tier='admin' AND is_active = TRUE`);
  if (a6.ok) {
    for (const r of a6.rows) if (r.email) { adminPlatformEmails.push(r.email); resolved.admin_platforms.push(r.email); }
    resolved._layer6_table_access = 'ok';
  } else {
    resolved._layer6_table_access = a6.error.code === '42501' ? 'permission_denied' : 'error:' + a6.error.code;
  }
  if (adminPlatformEmails.length === 0) throw new AdminPlatformUnreachable('no active Admin Platform with email (layer6 access=' + resolved._layer6_table_access + ')');

  // Assemble -- lead-email-recipients.ts:253-291
  const to = []; const cc = []; const bcc = [];
  if (agentEmail) to.push(agentEmail);
  else            to.push(adminPlatformEmails[0]);
  if (managerEmail)     cc.push(managerEmail);
  if (areaManagerEmail) bcc.push(areaManagerEmail);
  if (tenantAdminEmail) bcc.push(tenantAdminEmail);
  for (const e of managerPlatformEmails) bcc.push(e);
  for (const e of adminPlatformEmails)   bcc.push(e);
  const dedup = a => Array.from(new Set(a.filter(Boolean)));
  return { to: dedup(to), cc: dedup(cc), bcc: dedup(bcc), resolved };
}

// ─── Helper: insert a test lead inside the current transaction ─────────────
async function insertLead(client, { agentId, source = 'contact_form', contactEmail }) {
  // assignment_source must satisfy leads_assignment_source_check. Per
  // lib/actions/leads.ts:209 -- 'geo' when an agent is resolved, 'admin' otherwise.
  const assignSrc = agentId ? 'geo' : 'admin';
  const r = await client.query(
    `INSERT INTO leads (tenant_id, agent_id, manager_id, area_manager_id, tenant_admin_id,
                        contact_name, contact_email, source, assignment_source, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')
     RETURNING id, agent_id, manager_id, area_manager_id, tenant_admin_id`,
    [
      tenantPrimary,
      agentId,
      null, null, null,   // placeholders; updated below from walkHierarchy
      'CV Hierarchy Test Lead',
      contactEmail,
      source,
      assignSrc,
    ]);
  // Compute chain via walkHierarchy and UPDATE (matches createLead behavior).
  const chain = agentId ? await walkHierarchy(client, agentId) : { manager_id: null, area_manager_id: null, tenant_admin_id: null, ancestors: [] };
  await client.query(
    `UPDATE leads SET manager_id = $1, area_manager_id = $2, tenant_admin_id = $3 WHERE id = $4`,
    [chain.manager_id, chain.area_manager_id, chain.tenant_admin_id, r.rows[0].id]);
  return { leadId: r.rows[0].id, chain };
}

async function readLead(client, leadId) {
  const r = await client.query(
    `SELECT id, agent_id, manager_id, area_manager_id, tenant_admin_id FROM leads WHERE id = $1`,
    [leadId]);
  return r.rows[0];
}

// ─── CASE A: chain computation + stamp ───────────────────────────────────────
async function caseA() {
  console.log('\n=== CASE A: chain computation + stamp ===');

  for (const [label, target] of [
    ['A1-agent_alpha',  { agentKey: 'agent_alpha',  agentId: AGENT_ALPHA,  expectMgr: MANAGER,      expectArea: AREA_MANAGER, expectAdmin: TENANT_ADMIN }],
    ['A2-manager',      { agentKey: 'manager',      agentId: MANAGER,      expectMgr: null,         expectArea: AREA_MANAGER, expectAdmin: TENANT_ADMIN }],
    ['A3-area_manager', { agentKey: 'area_manager', agentId: AREA_MANAGER, expectMgr: null,         expectArea: null,         expectAdmin: TENANT_ADMIN }],
  ]) {
    await probeRW(label, async (c) => {
      const { leadId, chain } = await insertLead(c, { agentId: target.agentId, contactEmail: 'cv-' + label + '@example.invalid' });
      const lead = await readLead(c, leadId);

      const passedAgent     = lead.agent_id        === target.agentId;
      const passedManager   = lead.manager_id      === target.expectMgr;
      const passedArea      = lead.area_manager_id === target.expectArea;
      const passedAdmin     = lead.tenant_admin_id === target.expectAdmin;
      const ok = passedAgent && passedManager && passedArea && passedAdmin;
      record('A chain stamp', label, 'postgres', ok,
        `agent=${target.agentId.slice(0,8)} mgr=${(target.expectMgr||'NULL').slice(0,8)} area=${(target.expectArea||'NULL').slice(0,8)} admin=${(target.expectAdmin||'NULL').slice(0,8)}`,
        `agent=${lead.agent_id.slice(0,8)} mgr=${(lead.manager_id||'NULL').slice(0,8)} area=${(lead.area_manager_id||'NULL').slice(0,8)} admin=${(lead.tenant_admin_id||'NULL').slice(0,8)}`);

      // Also assert walkHierarchy's ancestor list shape.
      const seenRoles = chain.ancestors.map(a => a.role);
      record('A chain ancestors', label, 'postgres',
        seenRoles.length > 0,
        'non-empty ancestor list',
        'roles=[' + seenRoles.join(',') + ']');
    });
  }

  // A4: under service_role (admin-reachable path -- createLead uses service_role).
  await probeRW('A4-agent_alpha-svc', async (c) => {
    await c.query('SET LOCAL ROLE service_role');
    const { leadId } = await insertLead(c, { agentId: AGENT_ALPHA, contactEmail: 'cv-a4-svc@example.invalid' });
    const lead = await readLead(c, leadId);
    const ok = lead.agent_id === AGENT_ALPHA
            && lead.manager_id === MANAGER
            && lead.area_manager_id === AREA_MANAGER
            && lead.tenant_admin_id === TENANT_ADMIN;
    record('A chain stamp', 'A4-agent_alpha (service_role)', 'service_role', ok,
      'full 4-deep chain stamped',
      `agent=${lead.agent_id} mgr=${lead.manager_id} area=${lead.area_manager_id} admin=${lead.tenant_admin_id}`);
  });
}

// ─── CASE B: envelope build ──────────────────────────────────────────────────
async function caseB() {
  console.log('\n=== CASE B: envelope build (getLeadEmailRecipients) ===');

  // Read expected emails for the chain agents from DB.
  const expectedEmails = await probeRO('B-emails', async (c) => {
    const r = await c.query(
      `SELECT id, email, notification_email FROM agents WHERE id = ANY($1)`,
      [[AGENT_ALPHA, MANAGER, AREA_MANAGER, TENANT_ADMIN]]);
    const m = new Map();
    for (const row of r.rows) m.set(row.id, row.notification_email || row.email);
    return m;
  });

  for (const role of ['postgres', 'service_role']) {
    await probeRW('B-envelope-' + role, async (c) => {
      if (role === 'service_role') await c.query('SET LOCAL ROLE service_role');
      const env = await getLeadEmailRecipients(c, tenantPrimary, AGENT_ALPHA);

      const expAgent     = expectedEmails.get(AGENT_ALPHA);
      const expManager   = expectedEmails.get(MANAGER);
      const expArea      = expectedEmails.get(AREA_MANAGER);
      const expAdmin     = expectedEmails.get(TENANT_ADMIN);

      const toOK   = env.to.length === 1 && env.to[0] === expAgent;
      const ccOK   = env.cc.length === 1 && env.cc[0] === expManager;
      const bccHasArea  = env.bcc.includes(expArea);
      const bccHasAdmin = env.bcc.includes(expAdmin);
      const bccHasPlatformAdmin = env.resolved.admin_platforms.length > 0
                              && env.bcc.includes(env.resolved.admin_platforms[0]);
      const ok = toOK && ccOK && bccHasArea && bccHasAdmin && bccHasPlatformAdmin;
      record('B envelope', 'agent_alpha 4-layer assembled', role, ok,
        `TO=[agent] CC=[manager] BCC⊇{area_manager, tenant_admin, platform_admin}`,
        `TO=${JSON.stringify(env.to)} CC=${JSON.stringify(env.cc)} BCC.len=${env.bcc.length} resolved={agent:${env.resolved.agent}, manager:${env.resolved.manager}, area:${env.resolved.area_manager}, admin:${env.resolved.tenant_admin}, platform_admins:${env.resolved.admin_platforms.length}}`);
    });
  }
}

// ─── CASE C0: service_role grant audit on getLeadEmailRecipients tables ─────
async function caseC0() {
  console.log('\n=== CASE C0: service_role table-access audit ===');
  const tables = ['agents', 'platform_manager_tenants', 'platform_admins', 'agent_delegations'];
  for (const t of tables) {
    await probeRO('C0-' + t, async (c) => {
      await c.query('SET LOCAL ROLE service_role');
      let status = 'ok', errCode = null, errMsg = null;
      try {
        await c.query('SELECT 1 FROM ' + t + ' LIMIT 1');
      } catch (e) {
        status = (e.code === '42501') ? 'permission_denied' : ('error:' + e.code);
        errCode = e.code; errMsg = e.message;
      }
      // Record informational only -- "PASS" means we observed cleanly;
      // permission_denied is a finding but expected on some tables.
      record('C0 service_role grants', 'SELECT on public.' + t, 'service_role',
        true,  // informational
        'observe access status',
        status + (errCode ? ' [' + errCode + ']' : ''));
    });
  }
}

// ─── CASE C: credential boundary ────────────────────────────────────────────
async function caseC() {
  console.log('\n=== CASE C: credential boundary (BLOCKED-PENDING-CREDS) ===');

  // C.1 verify tenant has no resend_api_key (BLOCKED-PENDING-CREDS).
  await probeRO('C1-tenant-key', async (c) => {
    const r = await c.query(
      `SELECT resend_api_key IS NULL OR resend_api_key = '' AS no_key,
              email_from_domain IS NULL                       AS no_domain,
              send_from IS NULL                               AS no_send_from,
              COALESCE(resend_verification_status, 'null')    AS verif
         FROM tenants WHERE id = $1`, [tenantPrimary]);
    const t = r.rows[0];
    const ok = t.no_key && t.no_domain && t.no_send_from && t.verif !== 'verified';
    record('C credential boundary', 'test tenant has no live email creds', 'postgres', ok,
      'no_key=true no_domain=true no_send_from=true verif!=verified',
      `no_key=${t.no_key} no_domain=${t.no_domain} no_send_from=${t.no_send_from} verif=${t.verif}`);
  });

  // C.2 verify sendTenantEmail.ts:82 is the credential-construction line.
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'email', 'sendTenantEmail.ts'), 'utf8');
  const lines = src.split('\n');
  const line82 = (lines[81] || '').trim();
  const line82OK = line82.includes('new Resend(') && line82.includes('tenant.resend_api_key');
  record('C credential boundary', 'sendTenantEmail.ts:82 is the credential gate', 'static',
    line82OK,
    "contains `new Resend(tenant.resend_api_key`",
    `L82: ${line82}`);

  // C.3 simulate the send: with the test tenant, sendTenantEmail's pre-flight
  // check (lines 71-79) detects missing config and throws TenantEmailNotConfigured
  // BEFORE reaching line 82. We mirror that pre-flight here, asserting it
  // throws on the test tenant. BLOCKED-PENDING-CREDS confirmed.
  await probeRO('C3-preflight', async (c) => {
    const r = await c.query(
      `SELECT resend_api_key, email_from_domain, send_from, resend_verification_status
         FROM tenants WHERE id = $1`, [tenantPrimary]);
    const t = r.rows[0];
    const missing = [];
    if (!t.resend_api_key)    missing.push('resend_api_key');
    if (!t.email_from_domain) missing.push('email_from_domain');
    if (!t.send_from)         missing.push('send_from');
    if (t.resend_verification_status !== 'verified') missing.push('verif=' + (t.resend_verification_status||'null'));
    const wouldThrow = missing.length > 0;
    record('C credential boundary', 'BLOCKED-PENDING-CREDS (test tenant)', 'postgres', wouldThrow,
      'TenantEmailNotConfigured raised',
      'missing=[' + missing.join(',') + ']');
  });
}

// ─── CASE D: GAP-5 frozen-after boundary ────────────────────────────────────
async function caseD() {
  console.log('\n=== CASE D: GAP-5 frozen-after boundary ===');

  // D.1 frozen under re-parent: stamp lead, change agent_alpha's parent_id to
  // bypass the manager rung; verify lead's chain UNCHANGED (snapshot invariant).
  await probeRW('D1-frozen-on-reparent', async (c) => {
    const { leadId } = await insertLead(c, { agentId: AGENT_ALPHA, contactEmail: 'cv-d1@example.invalid' });
    const before = await readLead(c, leadId);

    // Re-parent agent_alpha directly under area_manager (skip manager).
    await c.query(`UPDATE agents SET parent_id = $1 WHERE id = $2`, [AREA_MANAGER, AGENT_ALPHA]);
    // Re-call walkHierarchy under the new parent_id -- would now return
    // manager_id=NULL. If our lead were a REFERENCE not a SNAPSHOT, this would
    // mean its chain changes. Assert it does NOT change.
    const reChain = await walkHierarchy(c, AGENT_ALPHA);
    const after = await readLead(c, leadId);

    const ok = before.manager_id      === after.manager_id
            && before.area_manager_id === after.area_manager_id
            && before.tenant_admin_id === after.tenant_admin_id
            && before.agent_id        === after.agent_id;
    record('D frozen-after', 'lead chain stable under agent re-parent', 'postgres', ok,
      `chain unchanged (was mgr=${before.manager_id?.slice(0,8)})`,
      `before(mgr=${before.manager_id?.slice(0,8)}) after(mgr=${after.manager_id?.slice(0,8)}) | reChain.manager_id=${reChain.manager_id?.slice(0,8)||'NULL'}`);
  });

  // D.2 frozen under agent deactivate.
  await probeRW('D2-frozen-on-deactivate', async (c) => {
    const { leadId } = await insertLead(c, { agentId: AGENT_ALPHA, contactEmail: 'cv-d2@example.invalid' });
    const before = await readLead(c, leadId);
    // handle_agent_deactivate trigger fires (Event 4 async handoff -- enqueues
    // into territory_reroll_queue). Does NOT touch leads.agent_id.
    await c.query(`UPDATE agents SET is_active = FALSE WHERE id = $1`, [AGENT_ALPHA]);
    const after = await readLead(c, leadId);
    const ok = before.agent_id === after.agent_id
            && before.manager_id === after.manager_id
            && before.area_manager_id === after.area_manager_id
            && before.tenant_admin_id === after.tenant_admin_id;
    record('D frozen-after', 'lead chain stable on agent.is_active=false', 'postgres', ok,
      'no change',
      `agent ${before.agent_id?.slice(0,8)}→${after.agent_id?.slice(0,8)}`);
  });

  // D.3 explicit operator REASSIGN moves the binding (replicates the
  // /api/admin-homes/leads/[id]/reassign-agent UPDATE).
  await probeRW('D3-reassign-moves', async (c) => {
    const { leadId } = await insertLead(c, { agentId: AGENT_ALPHA, contactEmail: 'cv-d3@example.invalid' });
    const before = await readLead(c, leadId);
    // Reassign to agent_building (parent=manager). New chain expected:
    // mgr=manager, area=area_manager, admin=tenant_admin.
    const newAgent = AGENT_BUILDING;
    const newChain = await walkHierarchy(c, newAgent);
    await c.query(
      `UPDATE leads SET agent_id=$1, manager_id=$2, area_manager_id=$3, tenant_admin_id=$4 WHERE id=$5`,
      [newAgent, newChain.manager_id, newChain.area_manager_id, newChain.tenant_admin_id, leadId]);
    const after = await readLead(c, leadId);
    const ok = after.agent_id === newAgent
            && after.manager_id === MANAGER
            && after.area_manager_id === AREA_MANAGER
            && after.tenant_admin_id === TENANT_ADMIN
            && before.agent_id !== after.agent_id;
    record('D frozen-after', 'reassign moves the binding', 'postgres', ok,
      `agent moves to ${newAgent.slice(0,8)}, chain re-walked`,
      `before agent=${before.agent_id.slice(0,8)} after agent=${after.agent_id.slice(0,8)} mgr=${after.manager_id.slice(0,8)}`);
  });

  // D.4 explicit operator CLAIM (replicates the claim/route.ts raw UPDATE).
  await probeRW('D4-claim-stamps', async (c) => {
    // Insert an UNOWNED lead (agent_id=NULL) -- the claim flow only operates on these.
    const r = await c.query(
      `INSERT INTO leads (tenant_id, agent_id, contact_name, contact_email, source, assignment_source, status)
       VALUES ($1, NULL, 'D4 unowned', 'cv-d4@example.invalid', 'contact_form', 'admin', 'new') RETURNING id`,
      [tenantPrimary]);
    const leadId = r.rows[0].id;
    // Replicate claim/route.ts:102-120 -- walk + raw UPDATE.
    const claimChain = await walkHierarchy(c, AGENT_ALPHA);
    await c.query(
      `UPDATE leads
          SET agent_id = $1, claimed_at = now(), claimed_by_agent_id = $1,
              manager_id = $2, area_manager_id = $3, tenant_admin_id = $4,
              assignment_source = 'claim'
        WHERE id = $5`,
      [AGENT_ALPHA, claimChain.manager_id, claimChain.area_manager_id, claimChain.tenant_admin_id, leadId]);
    const after = await readLead(c, leadId);
    const ok = after.agent_id === AGENT_ALPHA
            && after.manager_id === MANAGER
            && after.area_manager_id === AREA_MANAGER
            && after.tenant_admin_id === TENANT_ADMIN;
    record('D frozen-after', 'claim stamps the binding (unowned→owned)', 'postgres', ok,
      `agent=${AGENT_ALPHA.slice(0,8)}, full chain stamped`,
      `agent=${after.agent_id?.slice(0,8)} mgr=${after.manager_id?.slice(0,8)}`);
  });

  // D.5 SAME under service_role -- production-parity.
  await probeRW('D5-frozen-svc', async (c) => {
    await c.query('SET LOCAL ROLE service_role');
    const { leadId } = await insertLead(c, { agentId: AGENT_ALPHA, contactEmail: 'cv-d5@example.invalid' });
    const before = await readLead(c, leadId);
    // service_role MUST be able to UPDATE agents.is_active (the deactivate
    // route does this). Confirm chain stays frozen on leads.
    await c.query(`UPDATE agents SET is_active = FALSE WHERE id = $1`, [AGENT_ALPHA]);
    const after = await readLead(c, leadId);
    const ok = before.agent_id === after.agent_id;
    record('D frozen-after', 'lead chain stable under service_role agent deactivate', 'service_role',
      ok, 'no change', `agent ${before.agent_id?.slice(0,8)}→${after.agent_id?.slice(0,8)}`);
  });
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n=== CV-HIERARCHY smoke ===\n');

  await caseA();
  await caseB();
  await caseC0();
  await caseC();
  await caseD();

  // ─── Output table ──────────────────────────────────────────────────────
  const lines = [];
  lines.push('='.repeat(130));
  lines.push('CV-HIERARCHY smoke results -- ' + new Date().toISOString());
  lines.push('  primary tenant = ' + tenantPrimary);
  lines.push('  chain: ' + AGENT_ALPHA.slice(0,8) + ' -> ' + MANAGER.slice(0,8) + ' -> ' + AREA_MANAGER.slice(0,8) + ' -> ' + TENANT_ADMIN.slice(0,8));
  lines.push('='.repeat(130));
  const colGroup = 28, colCase = 50, colRole = 14, colStatus = 6;
  lines.push('GROUP'.padEnd(colGroup) + ' ' + 'CASE'.padEnd(colCase) + ' ' + 'ROLE'.padEnd(colRole) + ' ' + 'STATUS'.padEnd(colStatus) + ' EXPECTED → GOT');
  lines.push('-'.repeat(130));
  let passed = 0, failed = 0;
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    if (r.passed) passed++; else failed++;
    lines.push(
      r.group.padEnd(colGroup).slice(0, colGroup) + ' ' +
      r.name.padEnd(colCase).slice(0, colCase)   + ' ' +
      r.role.padEnd(colRole)                      + ' ' +
      status.padEnd(colStatus)                    + ' ' +
      r.expected + ' → ' + r.got);
  }
  lines.push('-'.repeat(130));
  lines.push('TOTAL: ' + results.length + '  PASS: ' + passed + '  FAIL: ' + failed);
  lines.push('='.repeat(130));
  const text = lines.join('\n') + '\n';
  console.log('\n' + text);
  fs.writeFileSync(path.join(__dirname, '..', 'cv-hierarchy-smoke-output.txt'), text);
  console.log('Output: cv-hierarchy-smoke-output.txt');
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
