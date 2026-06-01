#!/usr/bin/env node
// scripts/cv-wire-walliam-agent-ai-keys.js
// Persistent prod write -- closes F-ESTIMATOR-AI-READS-AGENT-KEY-NOT-TENANT-KEY
// for the three WALLiam agents (King Shah, Neo Smith, WALLiam seed).
//
// CREDENTIAL HANDLING
//   The Anthropic key is NEVER hard-coded in this file. It's read from
//   process.env.ANTHROPIC_API_KEY (loaded by dotenv from .env.local, which is
//   gitignored). The script cross-checks against tenants.anthropic_api_key for
//   WALLiam and REFUSES TO WRITE if the two disagree -- guarantees we can't
//   silently install a different key than the tenant configuration.
//
// FLOW
//   A. Pre-state probe (read-only) -- log each agent's flag + key fingerprint.
//   B. Source-of-truth cross-check: .env key MUST equal WALLiam tenant column.
//   C. Backup pre-state to timestamped JSON (fingerprints only -- never full keys).
//   D. Apply transaction (BEGIN/COMMIT):
//        UPDATE agents SET ai_estimator_enabled=TRUE, anthropic_api_key=$1,
//                          updated_at=now() WHERE id = ANY($2)
//        RETURNING + in-tx verify; ROLLBACK on any mismatch.
//   E. Anthropic live-API validation (GET /v1/models).
//   F. Post-COMMIT re-read (fresh client) -- fingerprint + flag + updated_at check.
//   G. Summary.

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const WALLIAM_TENANT = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const AGENTS = [
  { spec: 'King Shah',    id: 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe' },
  { spec: 'Neo Smith',    id: 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f' },
  { spec: 'WALLiam seed', id: 'cf002201-9b11-4c0f-a1b3-65ed702c9976' },
];
const AGENT_IDS = AGENTS.map(a => a.id);

function fp(s) {
  if (s === null || s === undefined) return '(NULL)';
  if (typeof s !== 'string') return '(non-string)';
  if (s.length === 0) return '(empty)';
  if (s.length < 12) return '(short)';
  return s.slice(0, 6) + '...' + s.slice(-4) + '  (len ' + s.length + ')';
}

function classify(s) {
  if (s === null || s === undefined || s === '') return 'NULL/empty';
  if (typeof s !== 'string') return 'non-string';
  if (s.startsWith('sk-ant-')) return 'real Anthropic key';
  if (/^(REPLACE|TODO|PLACEHOLDER|YOUR_|XXX|<.*>)/i.test(s)) return 'PLACEHOLDER';
  return 'unknown shape';
}

(async () => {
  const newKey = process.env.ANTHROPIC_API_KEY;
  if (!newKey) {
    console.error('FATAL: ANTHROPIC_API_KEY missing from .env.local. Cannot proceed.');
    process.exit(1);
  }
  if (!newKey.startsWith('sk-ant-')) {
    console.error('FATAL: ANTHROPIC_API_KEY does not have sk-ant- shape. Refusing to write.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL missing.'); process.exit(1);
  }

  console.log('=========================================================');
  console.log('WALLiam estimator AI key wiring -- persistent prod write');
  console.log('  target agents: ' + AGENTS.map(a => a.spec).join(', '));
  console.log('=========================================================');

  // ── Phase A: Pre-state probe ────────────────────────────────────────
  console.log('\n=== Phase A: pre-state probe (read-only) ===');
  const preClient = new Client({ connectionString: process.env.DATABASE_URL });
  await preClient.connect();
  await preClient.query('BEGIN READ ONLY');
  await preClient.query('SET LOCAL statement_timeout = 0');
  let preStates;
  try {
    const r = await preClient.query(
      `SELECT id, full_name, ai_estimator_enabled, anthropic_api_key, updated_at
         FROM agents WHERE id = ANY($1) ORDER BY full_name`,
      [AGENT_IDS]);
    preStates = r.rows;
    if (preStates.length !== 3) {
      console.error('FATAL: expected 3 agents, got ' + preStates.length);
      await preClient.end();
      process.exit(2);
    }
  } finally {
    await preClient.query('ROLLBACK').catch(()=>{});
    await preClient.end().catch(()=>{});
  }
  for (const p of preStates) {
    console.log('  ' + p.full_name);
    console.log('    ai_estimator_enabled : ' + p.ai_estimator_enabled);
    console.log('    anthropic_api_key    : ' + fp(p.anthropic_api_key) + '  (' + classify(p.anthropic_api_key) + ')');
    console.log('    updated_at (pre)     : ' + p.updated_at);
  }

  // ── Phase B: source-of-truth cross-check ────────────────────────────
  console.log('\n=== Phase B: source-of-truth cross-check ===');
  const tClient = new Client({ connectionString: process.env.DATABASE_URL });
  await tClient.connect();
  await tClient.query('BEGIN READ ONLY');
  let tenantKey;
  try {
    const r = await tClient.query(
      `SELECT anthropic_api_key FROM tenants WHERE id = $1`, [WALLIAM_TENANT]);
    tenantKey = r.rows[0].anthropic_api_key;
  } finally {
    await tClient.query('ROLLBACK').catch(()=>{});
    await tClient.end().catch(()=>{});
  }
  console.log('  .env fingerprint              : ' + fp(newKey));
  console.log('  WALLiam tenant col fingerprint: ' + fp(tenantKey));
  if (newKey !== tenantKey) {
    console.error('  FATAL: .env Anthropic key does NOT match WALLiam tenant column.');
    console.error('  Refusing to write a key that disagrees with tenant configuration.');
    process.exit(2);
  }
  console.log('  match                         : YES');

  // ── Phase C: Backup pre-state to file ───────────────────────────────
  console.log('\n=== Phase C: pre-state backup ===');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(__dirname, '..', `walliam-agents-ai-backup_${ts}.json`);
  const backup = {
    captured_at: new Date().toISOString(),
    rollback_note: 'To revert: set ai_estimator_enabled and anthropic_api_key per agent to the values implied by classification below. Full pre-state keys are not stored (CLAUDE.md secrets rule).',
    agents: preStates.map(p => ({
      id: p.id,
      full_name: p.full_name,
      ai_estimator_enabled_pre: p.ai_estimator_enabled,
      anthropic_api_key_pre_fingerprint: fp(p.anthropic_api_key),
      anthropic_api_key_pre_classification: classify(p.anthropic_api_key),
      updated_at_pre: p.updated_at,
    })),
  };
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log('  backup written: ' + path.relative(process.cwd(), backupPath));

  // ── Phase D: Apply transaction ───────────────────────────────────────
  console.log('\n=== Phase D: apply transaction (BEGIN ... COMMIT) ===');
  const wClient = new Client({ connectionString: process.env.DATABASE_URL });
  await wClient.connect();
  await wClient.query('BEGIN');
  await wClient.query('SET LOCAL statement_timeout = 0');
  let committed = false;
  try {
    const upd = await wClient.query(
      `UPDATE agents
          SET ai_estimator_enabled = TRUE,
              anthropic_api_key    = $1,
              updated_at           = now()
        WHERE id = ANY($2)
        RETURNING id, full_name, ai_estimator_enabled, anthropic_api_key, updated_at`,
      [newKey, AGENT_IDS]);

    if (upd.rowCount !== 3) {
      throw new Error('UPDATE affected ' + upd.rowCount + ' rows (expected 3)');
    }
    console.log('  UPDATE: ' + upd.rowCount + ' agents affected');
    for (const row of upd.rows) {
      console.log('    ' + row.full_name);
      console.log('      ai_estimator_enabled : ' + row.ai_estimator_enabled);
      console.log('      anthropic_api_key fp : ' + fp(row.anthropic_api_key));
      console.log('      updated_at (in-tx)   : ' + row.updated_at);
      if (row.ai_estimator_enabled !== true) {
        throw new Error('post-state flag != TRUE for ' + row.full_name);
      }
      if (row.anthropic_api_key !== newKey) {
        throw new Error('post-state key mismatch for ' + row.full_name);
      }
    }
    console.log('  in-tx verify: all 3 agents have flag=TRUE + matching key');
    await wClient.query('COMMIT');
    committed = true;
    console.log('  COMMIT');
  } catch (e) {
    console.error('  TX ERROR: ' + e.message);
    await wClient.query('ROLLBACK').catch(()=>{});
    console.log('  ROLLBACK -- no DB change');
    await wClient.end().catch(()=>{});
    process.exit(3);
  }
  await wClient.end();

  // ── Phase E: Anthropic live-API validation ──────────────────────────
  console.log('\n=== Phase E: Anthropic live-API validation ===');
  let anthOK = false;
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': newKey, 'anthropic-version': '2023-06-01' },
    });
    if (r.ok) {
      const j = await r.json();
      anthOK = true;
      const nmodels = j.data ? j.data.length : (Array.isArray(j) ? j.length : '?');
      console.log('  Anthropic: AUTH OK   status=' + r.status + '  models=' + nmodels);
    } else {
      const body = await r.text();
      console.log('  Anthropic: AUTH FAIL status=' + r.status + '  body=' + body.slice(0, 200));
    }
  } catch (e) {
    console.log('  Anthropic: NETWORK ERROR  ' + e.message);
  }

  // ── Phase F: Post-COMMIT re-read (fresh client) ─────────────────────
  console.log('\n=== Phase F: post-COMMIT verification (fresh read-only client) ===');
  const vClient = new Client({ connectionString: process.env.DATABASE_URL });
  await vClient.connect();
  await vClient.query('BEGIN READ ONLY');
  let postStates;
  try {
    const r = await vClient.query(
      `SELECT id, full_name, ai_estimator_enabled, anthropic_api_key, updated_at
         FROM agents WHERE id = ANY($1) ORDER BY full_name`,
      [AGENT_IDS]);
    postStates = r.rows;
  } finally {
    await vClient.query('ROLLBACK').catch(()=>{});
    await vClient.end().catch(()=>{});
  }
  const today = new Date().toISOString().slice(0, 10);
  let allMatch = true;
  for (const p of postStates) {
    const updDay = p.updated_at.toISOString().slice(0, 10);
    const isToday = updDay === today;
    const flagOK = p.ai_estimator_enabled === true;
    const keyOK = p.anthropic_api_key === newKey;
    console.log('  ' + p.full_name);
    console.log('    ai_estimator_enabled : ' + p.ai_estimator_enabled + '  (' + (flagOK ? 'OK' : 'WRONG') + ')');
    console.log('    anthropic_api_key fp : ' + fp(p.anthropic_api_key));
    console.log('    matches .env / tenant: ' + (keyOK ? 'YES' : 'NO'));
    console.log('    updated_at           : ' + p.updated_at + (isToday ? '  [TODAY]' : '  [NOT TODAY]'));
    if (!flagOK || !keyOK || !isToday) allMatch = false;
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('\n=========================================================');
  console.log('SUMMARY');
  console.log('=========================================================');
  console.log('  agents updated         : ' + (committed ? '3 (COMMITTED)' : 'ROLLED BACK'));
  console.log('  Anthropic live auth    : ' + (anthOK ? 'PASS' : 'FAIL'));
  console.log('  all 3 post-verify      : ' + (allMatch ? 'PASS (flag=TRUE, key match, today)' : 'FAIL'));
  console.log('  pre-state backup       : ' + path.relative(process.cwd(), backupPath));
  console.log('  F-ESTIMATOR-AI-READS-AGENT-KEY-NOT-TENANT-KEY (WALLiam): ' +
              ((committed && anthOK && allMatch) ? 'CLOSED for WALLiam' : 'STILL OPEN'));

  process.exit((committed && anthOK && allMatch) ? 0 : 1);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
