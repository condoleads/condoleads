#!/usr/bin/env node
// scripts/cv-wire-aily-creds.js
// Apply-class credential wiring for the aily tenant.
//
// PRODUCTION-DB WRITE -- writes resend_api_key + anthropic_api_key to the
// aily tenant row. Per CLAUDE.md, credential writes normally go through the
// Supabase Studio GUI; this script is the documented transient-env fallback
// when GUI driving isn't available (operator-authorized this session).
//
// CONTRACT
//   - New keys read from process.env._NEW_RESEND and _NEW_ANTHROPIC (transient,
//     set by the calling shell and cleared after). Script body never holds
//     a credential.
//   - Output is fingerprint-only (first6...last4 + len). Full keys never logged.
//
// FLOW
//   A. Pre-state probe (read-only): fingerprint current aily credentials +
//      send_from + email_from_domain + resend_verification_status. Captured
//      as the rollback reference.
//   B. Apply transaction (single BEGIN/COMMIT):
//        UPDATE tenants SET resend_api_key=$1, anthropic_api_key=$2,
//               updated_at=now() WHERE id=$3
//        SELECT post-state inside same tx, verify both columns match the
//        intended new values; ROLLBACK on any mismatch.
//   C. Live-API validation (outside tx): Resend GET /domains + Anthropic
//      GET /v1/models with the new keys.
//   D. Post-COMMIT re-read (fresh read-only client) -- confirm persisted
//      state matches intent, updated_at = today.
//   E. Sending identity audit: flag WALLiam-flavored or missing
//      send_from / email_from_domain on the aily row.

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const AILY = 'e2619717-6401-4159-8d4c-d5f87651c8d6';

function fp(s) {
  if (s === null || s === undefined) return '(NULL)';
  if (typeof s !== 'string') return '(non-string)';
  if (s.length === 0) return '(empty)';
  if (s.length < 12) return '(short)';
  return s.slice(0, 6) + '...' + s.slice(-4) + '  (len ' + s.length + ')';
}

function classifyResend(s) {
  if (!s) return 'NULL/empty';
  if (s.startsWith('re_')) return 'looks like real Resend key';
  if (/^(REPLACE|TODO|PLACEHOLDER|YOUR_|XXX|<.*>)/i.test(s)) return 'PLACEHOLDER text';
  return 'unknown shape';
}
function classifyAnth(s) {
  if (!s) return 'NULL/empty';
  if (s.startsWith('sk-ant-')) return 'looks like real Anthropic key';
  if (/^(REPLACE|TODO|PLACEHOLDER|YOUR_|XXX|<.*>)/i.test(s)) return 'PLACEHOLDER text';
  return 'unknown shape';
}

function flagSendingIdentity(t) {
  const flags = [];
  if (!t.send_from || t.send_from.length === 0) {
    flags.push('send_from is NULL/empty -- sending identity not configured');
  } else if (/walliam/i.test(t.send_from) || /condoleads/i.test(t.send_from)) {
    flags.push('send_from contains WALLiam/condoleads text -- would impersonate that tenant');
  }
  if (!t.email_from_domain || t.email_from_domain.length === 0) {
    flags.push('email_from_domain is NULL/empty');
  } else if (/walliam/i.test(t.email_from_domain) || /condoleads/i.test(t.email_from_domain)) {
    flags.push('email_from_domain points at WALLiam/condoleads -- cross-tenant');
  }
  if (!t.resend_verification_status || t.resend_verification_status !== 'verified') {
    flags.push('resend_verification_status != verified (got: ' + t.resend_verification_status + ')');
  }
  return flags;
}

(async () => {
  const newResend = process.env._NEW_RESEND;
  const newAnth   = process.env._NEW_ANTHROPIC;
  if (!newResend || !newAnth) {
    console.error('FATAL: _NEW_RESEND and/or _NEW_ANTHROPIC missing from process.env.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL missing.'); process.exit(1);
  }

  console.log('=========================================================');
  console.log('AILY CREDENTIAL WIRING -- apply-class (prod DB write)');
  console.log('  aily tenant id = ' + AILY);
  console.log('=========================================================');

  // ── Phase A: Pre-state probe ─────────────────────────────────────────
  console.log('\n=== Phase A: pre-state probe (read-only) ===');
  const preClient = new Client({ connectionString: process.env.DATABASE_URL });
  await preClient.connect();
  await preClient.query('BEGIN READ ONLY');
  await preClient.query('SET LOCAL statement_timeout = 0');
  let pre;
  try {
    const r = await preClient.query(
      `SELECT id, name, domain, resend_api_key, anthropic_api_key,
              send_from, email_from_domain, resend_verification_status,
              resend_verified_at, updated_at
         FROM tenants WHERE id = $1`, [AILY]);
    if (r.rows.length === 0) {
      console.error('  FATAL: aily tenant not found.');
      await preClient.query('ROLLBACK').catch(()=>{});
      await preClient.end().catch(()=>{});
      process.exit(1);
    }
    pre = r.rows[0];
  } finally {
    await preClient.query('ROLLBACK').catch(()=>{});
    await preClient.end().catch(()=>{});
  }
  console.log('  tenant.name             : ' + pre.name);
  console.log('  tenant.domain           : ' + pre.domain);
  console.log('  tenant.updated_at (pre) : ' + pre.updated_at);
  console.log('  --- Resend (pre) ---');
  console.log('    resend_api_key        : ' + fp(pre.resend_api_key));
  console.log('    classification        : ' + classifyResend(pre.resend_api_key));
  console.log('  --- Anthropic (pre) ---');
  console.log('    anthropic_api_key     : ' + fp(pre.anthropic_api_key));
  console.log('    classification        : ' + classifyAnth(pre.anthropic_api_key));
  console.log('  --- Sending identity (pre) ---');
  console.log('    send_from             : ' + (pre.send_from || '(NULL)'));
  console.log('    email_from_domain     : ' + (pre.email_from_domain || '(NULL)'));
  console.log('    resend_verif_status   : ' + (pre.resend_verification_status || '(NULL)'));
  const preFlags = flagSendingIdentity(pre);
  if (preFlags.length > 0) {
    console.log('    !! FLAGS:');
    for (const f of preFlags) console.log('       - ' + f);
  } else {
    console.log('    sending identity OK (aily-branded + verified)');
  }

  // ── Phase B: Apply transaction ────────────────────────────────────────
  console.log('\n=== Phase B: apply transaction (BEGIN ... COMMIT) ===');
  const wClient = new Client({ connectionString: process.env.DATABASE_URL });
  await wClient.connect();
  await wClient.query('BEGIN');
  await wClient.query('SET LOCAL statement_timeout = 0');
  let committed = false;
  try {
    const upd = await wClient.query(
      `UPDATE tenants
          SET resend_api_key = $1, anthropic_api_key = $2, updated_at = now()
        WHERE id = $3
        RETURNING id, resend_api_key, anthropic_api_key, updated_at`,
      [newResend, newAnth, AILY]);
    if (upd.rowCount !== 1) {
      throw new Error('UPDATE affected ' + upd.rowCount + ' rows (expected 1)');
    }
    const post = upd.rows[0];
    console.log('  UPDATE: 1 row affected');
    console.log('    new resend_api_key (in tx) : ' + fp(post.resend_api_key));
    console.log('    new anthropic_api_key      : ' + fp(post.anthropic_api_key));
    console.log('    updated_at (in tx)         : ' + post.updated_at);
    if (post.resend_api_key !== newResend) {
      throw new Error('post-state resend_api_key mismatch (write did not persist?)');
    }
    if (post.anthropic_api_key !== newAnth) {
      throw new Error('post-state anthropic_api_key mismatch');
    }
    console.log('  in-tx verify: both columns match intended new values');
    await wClient.query('COMMIT');
    committed = true;
    console.log('  COMMIT');
  } catch (e) {
    console.error('  TX ERROR: ' + e.message);
    await wClient.query('ROLLBACK').catch(()=>{});
    console.log('  ROLLBACK -- no DB change');
    await wClient.end().catch(()=>{});
    process.exit(2);
  }
  await wClient.end();

  // ── Phase C: Live-API validation ─────────────────────────────────────
  console.log('\n=== Phase C: live-API validation ===');
  let resendOK = false, resendStatus = '?';
  try {
    const r = await fetch('https://api.resend.com/domains', {
      headers: { 'Authorization': 'Bearer ' + newResend },
    });
    resendStatus = r.status + ' ' + r.statusText;
    if (r.ok) {
      const j = await r.json();
      resendOK = true;
      const ndoms = j.data ? j.data.length : (Array.isArray(j) ? j.length : '?');
      console.log('  Resend    : AUTH OK   status=' + resendStatus + '  domains=' + ndoms);
    } else {
      const body = await r.text();
      console.log('  Resend    : AUTH FAIL status=' + resendStatus + '  body=' + body.slice(0, 200));
    }
  } catch (e) {
    console.log('  Resend    : NETWORK ERROR  ' + e.message);
  }
  let anthOK = false, anthStatus = '?';
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': newAnth, 'anthropic-version': '2023-06-01' },
    });
    anthStatus = r.status + ' ' + r.statusText;
    if (r.ok) {
      const j = await r.json();
      anthOK = true;
      const nmodels = j.data ? j.data.length : (Array.isArray(j) ? j.length : '?');
      console.log('  Anthropic : AUTH OK   status=' + anthStatus + '  models=' + nmodels);
    } else {
      const body = await r.text();
      console.log('  Anthropic : AUTH FAIL status=' + anthStatus + '  body=' + body.slice(0, 200));
    }
  } catch (e) {
    console.log('  Anthropic : NETWORK ERROR  ' + e.message);
  }

  // ── Phase D: Post-COMMIT re-read (fresh client) ──────────────────────
  console.log('\n=== Phase D: post-COMMIT verification (fresh read-only client) ===');
  const vClient = new Client({ connectionString: process.env.DATABASE_URL });
  await vClient.connect();
  await vClient.query('BEGIN READ ONLY');
  let post;
  try {
    const r = await vClient.query(
      `SELECT resend_api_key, anthropic_api_key, send_from, email_from_domain,
              resend_verification_status, updated_at
         FROM tenants WHERE id = $1`, [AILY]);
    post = r.rows[0];
  } finally {
    await vClient.query('ROLLBACK').catch(()=>{});
    await vClient.end().catch(()=>{});
  }
  const today = new Date().toISOString().slice(0, 10);
  const updDay = post.updated_at ? post.updated_at.toISOString().slice(0, 10) : '(null)';
  const isToday = updDay === today;
  console.log('  tenant.updated_at        : ' + post.updated_at);
  console.log('  updated_at day           : ' + updDay + (isToday ? '  [TODAY]' : '  [NOT TODAY]'));
  console.log('  --- Resend ---');
  console.log('    .env  fingerprint      : ' + fp(newResend));
  console.log('    DB col fingerprint     : ' + fp(post.resend_api_key));
  const resendMatch = post.resend_api_key === newResend;
  console.log('    match                  : ' + (resendMatch ? 'YES' : 'NO'));
  console.log('  --- Anthropic ---');
  console.log('    .env  fingerprint      : ' + fp(newAnth));
  console.log('    DB col fingerprint     : ' + fp(post.anthropic_api_key));
  const anthMatch = post.anthropic_api_key === newAnth;
  console.log('    match                  : ' + (anthMatch ? 'YES' : 'NO'));

  // ── Phase E: Sending identity audit ───────────────────────────────────
  console.log('\n=== Phase E: aily sending identity audit ===');
  console.log('  send_from              : ' + (post.send_from || '(NULL)'));
  console.log('  email_from_domain      : ' + (post.email_from_domain || '(NULL)'));
  console.log('  resend_verif_status    : ' + (post.resend_verification_status || '(NULL)'));
  const postFlags = flagSendingIdentity(post);
  if (postFlags.length > 0) {
    console.log('  !! IDENTITY FLAGS:');
    for (const f of postFlags) console.log('     - ' + f);
    console.log('  => aily can authenticate Resend/Anthropic with the new keys,');
    console.log('     but sendTenantEmail pre-flight will throw TenantEmailNotConfigured');
    console.log('     for aily until these fields are populated/corrected.');
  } else {
    console.log('  OK -- sending identity properly configured for aily.');
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n=========================================================');
  console.log('SUMMARY');
  console.log('=========================================================');
  console.log('  aily DB write              : ' + (committed ? 'COMMITTED' : 'ROLLED BACK'));
  console.log('  Resend live-API auth       : ' + (resendOK ? 'PASS' : 'FAIL'));
  console.log('  Anthropic live-API auth    : ' + (anthOK ? 'PASS' : 'FAIL'));
  console.log('  DB col == .env (Resend)    : ' + (resendMatch ? 'MATCH' : 'MISMATCH'));
  console.log('  DB col == .env (Anthropic) : ' + (anthMatch ? 'MATCH' : 'MISMATCH'));
  console.log('  tenant.updated_at = today  : ' + (isToday ? 'YES' : 'NO'));
  console.log('  Sending identity flags     : ' + (postFlags.length === 0 ? 'CLEAN' : postFlags.length + ' issue(s)'));

  const allGreen = committed && resendOK && anthOK && resendMatch && anthMatch && isToday;
  process.exit(allGreen ? 0 : 1);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
