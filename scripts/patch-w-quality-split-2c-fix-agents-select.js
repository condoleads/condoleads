#!/usr/bin/env node
/**
 * patch-w-quality-split-2c-fix-agents-select.js
 *
 * Forward-fix for W-QUALITY-SPLIT 2b: the prior patch changed the filter
 * expression on app/admin-homes/agents/page.tsx L75 from `l.quality === 'hot'`
 * to `l.temperature === 'hot'`, but did NOT extend the upstream supabase
 * .select() to fetch the new `temperature` column. Result:
 *   - TSC error TS2339 (temperature not on row type).
 *   - Runtime: every row's `temperature` is undefined, so `hot_leads` is
 *     always 0 — silent functional regression.
 *
 * This patch is the comprehensive fix at the source:
 *   .select('id, status, quality')
 *     -> .select('id, status, quality, temperature')
 *
 * Anchor uniqueness verified manually: only L67 matches the full
 * .select('id, status, quality').eq('agent_id', agent.id) signature.
 *
 * Backup-before-write with fresh timestamp.
 * Idempotency: anchor not found -> exit 0 with explicit "already applied" log.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const target = path.join(ROOT, 'app', 'admin-homes', 'agents', 'page.tsx');

if (!fs.existsSync(target)) {
  console.error('TARGET MISSING: ' + target);
  process.exit(1);
}

const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp =
  d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
  pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());

const inputBytes = fs.readFileSync(target);

// LE detect + assert pure (file was LF-only per prior session)
let crlf = 0, lfOnly = 0;
for (let i = 0; i < inputBytes.length; i++) {
  if (inputBytes[i] === 0x0A) {
    if (i > 0 && inputBytes[i - 1] === 0x0D) crlf++;
    else lfOnly++;
  }
}
console.log('LE detect: crlf=' + crlf + '  lfOnly=' + lfOnly);
if (crlf > 0 && lfOnly > 0) {
  console.error('mixed LE detected -- aborting (would corrupt file)');
  process.exit(1);
}
const fileIsLfOnly = (lfOnly > 0 && crlf === 0);

let text = inputBytes.toString('utf8');

const OLD = ".select('id, status, quality').eq('agent_id', agent.id)";
const NEW = ".select('id, status, quality, temperature').eq('agent_id', agent.id)";

// Idempotency check first
const alreadyAppliedCount = text.split(NEW).length - 1;
if (alreadyAppliedCount === 1 && text.indexOf(OLD) === -1) {
  console.log('Already applied (new select string already present, old absent). Exiting 0.');
  process.exit(0);
}

// Anchor uniqueness
const occCount = text.split(OLD).length - 1;
console.log('OLD anchor occurrences: ' + occCount);
if (occCount !== 1) {
  console.error('Anchor count ' + occCount + ' != 1 -- aborting (refuses to guess)');
  process.exit(1);
}

// Pre-state sanity: temperature filter from 2b patch must already be present
const preHasTempFilter = text.indexOf("l.temperature === 'hot'") !== -1;
console.log('pre: l.temperature filter present? ' + preHasTempFilter);
if (!preHasTempFilter) {
  console.error('pre-state assertion failed: 2b patch artifact missing. Aborting.');
  process.exit(1);
}

// Backup BEFORE write
const bk = target + '.backup_' + stamp;
fs.copyFileSync(target, bk);
const bkSize = fs.statSync(bk).size;
console.log('Backup: ' + path.basename(bk) + ' (' + bkSize + ' bytes)');

// Apply
const before = text.length;
text = text.replace(OLD, NEW);
const after = text.length;
console.log('Byte delta: ' + before + ' -> ' + after + '  (' + (after - before) + ')');

// Post-build assertions
const checks = [
  { name: 'new select string present (count=1)', test: (text.split(NEW).length - 1) === 1 },
  { name: 'old select string absent (count=0)',  test: text.indexOf(OLD) === -1 },
  { name: 'l.temperature filter preserved',       test: text.indexOf("l.temperature === 'hot'") !== -1 },
  { name: 'no CRLF introduced into LF-only file', test: fileIsLfOnly ? (text.indexOf('\r\n') === -1) : true },
  { name: 'byte delta is exactly +13',            test: (after - before) === 13 }, // ", temperature" = 13 chars
];

console.log('');
console.log('Post-build assertions:');
console.log('------------------------------------------------------------');
let failed = 0;
for (const c of checks) {
  console.log((c.test ? '  PASS' : '  FAIL') + '  ' + c.name);
  if (!c.test) failed++;
}
console.log('------------------------------------------------------------');
if (failed > 0) {
  console.error('FAILED ' + failed + ' assertion(s) -- refusing to write to disk');
  console.error('(Backup retained: ' + path.basename(bk) + ')');
  process.exit(1);
}

// Write
fs.writeFileSync(target, text, 'utf8');
const liveSize = fs.statSync(target).size;
console.log('');
console.log('Wrote: ' + path.relative(ROOT, target) + ' (' + liveSize + ' bytes)');