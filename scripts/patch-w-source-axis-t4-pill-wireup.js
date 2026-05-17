#!/usr/bin/env node
/**
 * patch-w-source-axis-t4-pill-wireup.js
 *
 * Wire-up follow-on for the W-SOURCE-AXIS T4 main patch.
 *
 * The T4 main patch added getSourceDisplay() helper but did NOT connect it to
 * the source pill JSX render site at L566-567 of AdminHomesLeadsClient.tsx.
 * Without this wire-up, leads with plan_data still render as "AI Chat" via the
 * direct ROUTE_LABELS access pattern, not as "Plan" via the new helper.
 *
 * Two surgical substring replacements at the pill render site only.
 * Other usages of ROUTE_LABELS / ROUTE_COLORS in the file (L91 helper
 * fallback with `route` variable; L419 filter dropdown iterator) use
 * different substring patterns and are NOT touched by these anchors.
 *
 * appointment_date is not on the Lead TS interface (file lines 9-35).
 * Calling getSourceDisplay with `null` for appointmentDate is safe -- the
 * appointment branch in the helper never fires from this call site.
 * Tracked as a follow-up to add appointment_date to the Lead type.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const target = path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx');

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

let crlf = 0, lfOnly = 0;
for (let i = 0; i < inputBytes.length; i++) {
  if (inputBytes[i] === 0x0A) {
    if (i > 0 && inputBytes[i - 1] === 0x0D) crlf++;
    else lfOnly++;
  }
}
console.log('LE detect: crlf=' + crlf + '  lfOnly=' + lfOnly);
if (crlf > 0 && lfOnly > 0) {
  console.error('mixed LE -- aborting');
  process.exit(1);
}
const fileIsLfOnly = (lfOnly > 0 && crlf === 0);

let text = inputBytes.toString('utf8');

// Pre-flight: getSourceDisplay must exist (from prior patch).
if (text.indexOf('function getSourceDisplay(') === -1) {
  console.error('getSourceDisplay helper not present. Run the T4 main patch first.');
  process.exit(1);
}

// Idempotency
const ALREADY_MARKER = 'getSourceDisplay(deriveLeadOriginRoute(lead.source)';
if (text.indexOf(ALREADY_MARKER) !== -1) {
  console.log('Already applied (wire-up call site present). Exiting 0.');
  process.exit(0);
}

// Change A: color access
const COLOR_OLD = 'ROUTE_COLORS[deriveLeadOriginRoute(lead.source)]';
const COLOR_NEW = 'getSourceDisplay(deriveLeadOriginRoute(lead.source), lead.plan_data, null).color';

const colorCount = text.split(COLOR_OLD).length - 1;
console.log('Change A (color access) count: ' + colorCount);
if (colorCount !== 1) {
  console.error('Color anchor count != 1. Refusing to patch.');
  process.exit(1);
}

// Change B: label access
const LABEL_OLD = 'ROUTE_LABELS[deriveLeadOriginRoute(lead.source)]';
const LABEL_NEW = 'getSourceDisplay(deriveLeadOriginRoute(lead.source), lead.plan_data, null).label';

const labelCount = text.split(LABEL_OLD).length - 1;
console.log('Change B (label access) count: ' + labelCount);
if (labelCount !== 1) {
  console.error('Label anchor count != 1. Refusing to patch.');
  process.exit(1);
}

// Backup BEFORE write
const bk = target + '.backup_' + stamp;
fs.copyFileSync(target, bk);
console.log('Backup: ' + path.basename(bk) + ' (' + fs.statSync(bk).size + ' bytes)');

// Apply
text = text.replace(COLOR_OLD, COLOR_NEW);
text = text.replace(LABEL_OLD, LABEL_NEW);

// Post-build assertions
const checks = [
  { name: 'getSourceDisplay wired for color',              test: text.indexOf('getSourceDisplay(deriveLeadOriginRoute(lead.source), lead.plan_data, null).color') !== -1 },
  { name: 'getSourceDisplay wired for label',              test: text.indexOf('getSourceDisplay(deriveLeadOriginRoute(lead.source), lead.plan_data, null).label') !== -1 },
  { name: 'old ROUTE_COLORS pill access gone',             test: text.indexOf('ROUTE_COLORS[deriveLeadOriginRoute(lead.source)]') === -1 },
  { name: 'old ROUTE_LABELS pill access gone',             test: text.indexOf('ROUTE_LABELS[deriveLeadOriginRoute(lead.source)]') === -1 },
  { name: 'getSourceDisplay function definition retained', test: text.indexOf('function getSourceDisplay(') !== -1 },
  { name: 'helper fallback ROUTE_LABELS[route] retained',  test: text.indexOf('ROUTE_LABELS[route]') !== -1 },
  { name: 'helper fallback ROUTE_COLORS[route] retained',  test: text.indexOf('ROUTE_COLORS[route]') !== -1 },
  { name: 'filter dropdown Object.entries retained',       test: text.indexOf('Object.entries(ROUTE_LABELS)') !== -1 },
  { name: 'no CRLF introduced',                            test: fileIsLfOnly ? text.indexOf('\r\n') === -1 : true },
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

fs.writeFileSync(target, text, 'utf8');
const liveSize = fs.statSync(target).size;
const delta = liveSize - inputBytes.length;
console.log('');
console.log('Wrote: ' + path.relative(ROOT, target) + ' (' + liveSize + ' bytes, delta ' + (delta >= 0 ? '+' : '') + delta + ')');