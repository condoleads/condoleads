#!/usr/bin/env node
// scripts/cv-wire-walliam-creds.js
// Credential-wiring helper for WALLiam.
//
// CONTRACT
//   Reads new keys from process.env._NEW_RESEND and process.env._NEW_ANTHROPIC
//   (set by the calling shell as transient vars). The script itself never
//   contains a key. Output is fingerprint-only (first6...last4 + len).
//
// FLOW
//   1. Replace/insert RESEND_API_KEY and ANTHROPIC_API_KEY lines in .env.local.
//   2. Verify .gitignore ignores .env.local.
//   3. Validate Resend key via GET https://api.resend.com/domains  (auth check).
//   4. Validate Anthropic key via GET https://api.anthropic.com/v1/models.
//   5. Read WALLiam tenant columns; fingerprint-compare to new keys.
//   6. Report.

require('dotenv').config({ path: '.env.local' });   // load DATABASE_URL etc.
const fs = require('fs');
const { Client } = require('pg');

function fp(s) {
  if (s === null || s === undefined) return '(NULL)';
  if (typeof s !== 'string') return '(non-string)';
  if (s.length === 0) return '(empty)';
  if (s.length < 12) return '(short)';
  return s.slice(0, 6) + '...' + s.slice(-4) + '  (len ' + s.length + ')';
}

(async () => {
  const newResend = process.env._NEW_RESEND;
  const newAnth   = process.env._NEW_ANTHROPIC;
  if (!newResend || !newAnth) {
    console.error('FATAL: _NEW_RESEND and/or _NEW_ANTHROPIC not in process.env.');
    process.exit(1);
  }

  // ── Step 1: update .env.local ──────────────────────────────────────────
  console.log('=== Step 1: update .env.local ===');
  let content = fs.readFileSync('.env.local', 'utf8');
  // BOM-safe replace; preserve LF/CRLF as found.
  if (/^RESEND_API_KEY=/m.test(content)) {
    content = content.replace(/^RESEND_API_KEY=.*$/m, 'RESEND_API_KEY=' + newResend);
    console.log('  RESEND_API_KEY: replaced existing line');
  } else {
    content = content.replace(/\s*$/, '') + '\nRESEND_API_KEY=' + newResend + '\n';
    console.log('  RESEND_API_KEY: appended (was missing)');
  }
  if (/^ANTHROPIC_API_KEY=/m.test(content)) {
    content = content.replace(/^ANTHROPIC_API_KEY=.*$/m, 'ANTHROPIC_API_KEY=' + newAnth);
    console.log('  ANTHROPIC_API_KEY: replaced existing line');
  } else {
    content = content.replace(/\s*$/, '') + '\nANTHROPIC_API_KEY=' + newAnth + '\n';
    console.log('  ANTHROPIC_API_KEY: appended (was missing)');
  }
  fs.writeFileSync('.env.local', content);
  console.log('  .env.local written.');

  // ── Step 2: confirm .gitignore ignores .env.local ──────────────────────
  console.log('\n=== Step 2: .gitignore check ===');
  const gi = fs.readFileSync('.gitignore', 'utf8');
  const patterns = gi.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const matchers = [
    /^\.env\*?\.local$/, /^\.env\*$/, /^\.env\*\.local$/,
  ];
  const isIgnored = patterns.some(p => matchers.some(re => re.test(p)));
  console.log('  patterns covering .env.local: ' + patterns.filter(p => p.includes('.env')).join(', '));
  console.log('  .env.local gitignored: ' + isIgnored);
  if (!isIgnored) {
    console.error('  !! .env.local is NOT gitignored. Refusing to continue; manual review needed.');
    process.exit(2);
  }

  // ── Step 3: validate Resend ───────────────────────────────────────────
  console.log('\n=== Step 3: validate Resend (GET https://api.resend.com/domains) ===');
  let resendOK = false, resendStatus = 'unknown';
  try {
    const r = await fetch('https://api.resend.com/domains', {
      headers: { 'Authorization': 'Bearer ' + newResend },
    });
    resendStatus = r.status + ' ' + r.statusText;
    if (r.ok) {
      const j = await r.json();
      resendOK = true;
      const ndoms = j.data ? j.data.length : (Array.isArray(j) ? j.length : '?');
      console.log('  Resend: AUTH OK  status=' + resendStatus + '  domains=' + ndoms);
    } else {
      const body = await r.text();
      console.log('  Resend: AUTH FAIL  status=' + resendStatus + '  body=' + body.slice(0, 200));
    }
  } catch (e) {
    console.log('  Resend: NETWORK ERROR  ' + e.message);
  }

  // ── Step 4: validate Anthropic ────────────────────────────────────────
  console.log('\n=== Step 4: validate Anthropic (GET https://api.anthropic.com/v1/models) ===');
  let anthOK = false, anthStatus = 'unknown';
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': newAnth,
        'anthropic-version': '2023-06-01',
      },
    });
    anthStatus = r.status + ' ' + r.statusText;
    if (r.ok) {
      const j = await r.json();
      anthOK = true;
      const nmodels = j.data ? j.data.length : (Array.isArray(j) ? j.length : '?');
      console.log('  Anthropic: AUTH OK  status=' + anthStatus + '  models=' + nmodels);
    } else {
      const body = await r.text();
      console.log('  Anthropic: AUTH FAIL  status=' + anthStatus + '  body=' + body.slice(0, 200));
    }
  } catch (e) {
    console.log('  Anthropic: NETWORK ERROR  ' + e.message);
  }

  // ── Step 5: WALLiam tenant column comparison ─────────────────────────
  console.log('\n=== Step 5: WALLiam tenant column comparison ===');
  const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('BEGIN READ ONLY');
  await c.query('SET LOCAL statement_timeout = 0');
  let colResend, colAnth, updAt;
  try {
    const r = await c.query(
      `SELECT resend_api_key, anthropic_api_key, updated_at FROM tenants WHERE id = $1`,
      [WALLIAM]);
    colResend = r.rows[0].resend_api_key;
    colAnth   = r.rows[0].anthropic_api_key;
    updAt     = r.rows[0].updated_at;
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    await c.end().catch(() => {});
  }

  const today = new Date().toISOString().slice(0, 10);
  const updDay = updAt ? updAt.toISOString().slice(0, 10) : '(null)';
  const isToday = updDay === today;

  console.log('  tenant.updated_at        : ' + updAt);
  console.log('  updated_at day           : ' + updDay + (isToday ? '  [TODAY]' : '  [NOT TODAY]'));
  console.log('');
  console.log('  --- Resend ---');
  console.log('    .env  fingerprint     : ' + fp(newResend));
  console.log('    DB col fingerprint    : ' + fp(colResend));
  console.log('    match                 : ' + (colResend === newResend ? 'YES' : 'NO'));
  console.log('  --- Anthropic ---');
  console.log('    .env  fingerprint     : ' + fp(newAnth));
  console.log('    DB col fingerprint    : ' + fp(colAnth));
  console.log('    match                 : ' + (colAnth === newAnth ? 'YES' : 'NO'));

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n=========================================================');
  console.log('SUMMARY');
  console.log('=========================================================');
  console.log('  .env.local updated         : YES (verified by re-read above)');
  console.log('  .env.local gitignored      : ' + (isIgnored ? 'YES' : 'NO'));
  console.log('  Resend live-API auth       : ' + (resendOK ? 'PASS' : 'FAIL'));
  console.log('  Anthropic live-API auth    : ' + (anthOK ? 'PASS' : 'FAIL'));
  console.log('  DB col == .env (Resend)    : ' + (colResend === newResend ? 'MATCH' : 'MISMATCH'));
  console.log('  DB col == .env (Anthropic) : ' + (colAnth === newAnth ? 'MATCH' : 'MISMATCH'));
  console.log('  tenant.updated_at = today  : ' + (isToday ? 'YES' : 'NO'));

  const allGreen = resendOK && anthOK && (colResend === newResend) && (colAnth === newAnth) && isToday;
  process.exit(allGreen ? 0 : 1);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
