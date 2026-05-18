#!/usr/bin/env node
// scripts/wleadflow/patch-S2-S3-S4-building-url.js
//
// 3 surgical edits to remove the fabricated '/buildings/' path prefix:
//
//   edit1: first clone -- current_page_url -> current_page_slug (correct column),
//          value = slug only (no path, no leading slash)
//   edit2: S2 clone -- same fix on cloneS2
//   edit3: S3 body pageUrl -- '/buildings/' + slug -> '/' + slug
//
// Building pages are served at root via app/[slug]/page.tsx (verified in
// Action 10). The /buildings/ prefix was fabricated -- no such route exists.

const fs = require('fs');

const target = 'scripts/wleadflow/run-S2-S3-S4-session.js';
if (!fs.existsSync(target)) { console.error('ABORT: target not found: ' + target); process.exit(1); }

const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '_' +
              pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
const backupPath = target + '.backup_' + stamp;
fs.copyFileSync(target, backupPath);
console.log('BACKUP: ' + backupPath);

// LE detection (defensive even if pure post-Action-9)
const inputBytes = fs.readFileSync(target);
let crlfCount = 0, lfOnlyCount = 0;
for (let i = 0; i < inputBytes.length; i++) {
  if (inputBytes[i] === 0x0A) {
    if (i > 0 && inputBytes[i-1] === 0x0D) crlfCount++;
    else lfOnlyCount++;
  }
}
const dominantEol = crlfCount >= lfOnlyCount ? '\r\n' : '\n';
const wasMixed = crlfCount > 0 && lfOnlyCount > 0;
console.log('LE INPUT: crlf=' + crlfCount + ', lfOnly=' + lfOnlyCount +
            ', dominant=' + (dominantEol === '\r\n' ? 'CRLF' : 'LF') +
            (wasMixed ? ' (MIXED -- normalizing)' : ''));

let text = inputBytes.toString('utf8');
const originalLen = text.length;
text = text.replace(/\r\n/g, '\n');
if (dominantEol === '\r\n') text = text.replace(/\n/g, '\r\n');

// Idempotency: if any '/buildings/' is gone AND current_page_slug is present, skip
const buildingsCount = (text.match(/'\/buildings\/'/g) || []).length;
const slugColPresent = text.indexOf("current_page_slug") !== -1;
console.log('  Pre-patch /buildings/ literal count: ' + buildingsCount);
console.log('  Pre-patch current_page_slug present: ' + slugColPresent);
if (buildingsCount === 0 || slugColPresent) {
  console.error('ABORT: patch appears already applied (buildings count=' + buildingsCount + ', slugColPresent=' + slugColPresent + ')');
  process.exit(1);
}
if (buildingsCount !== 3) {
  console.error('ABORT: expected 3 occurrences of \'/buildings/\' literal, found ' + buildingsCount);
  process.exit(1);
}

// ----- Edit 1: first clone -- current_page_url -> current_page_slug -----
const edit1Anchor      = "    if ('current_page_url' in clone)  clone.current_page_url  = '/buildings/' + fx.building.slug;";
const edit1Replacement = "    if ('current_page_slug' in clone) clone.current_page_slug = fx.building.slug;";

// ----- Edit 2: S2 clone -- same fix on cloneS2 -----
const edit2Anchor      = "    if ('current_page_url' in cloneS2)  cloneS2.current_page_url  = '/buildings/' + fx.building.slug;";
const edit2Replacement = "    if ('current_page_slug' in cloneS2) cloneS2.current_page_slug = fx.building.slug;";

// ----- Edit 3: S3 body pageUrl -- root-served slug -----
const edit3Anchor      = "    pageUrl:       '/buildings/' + fx.building.slug,";
const edit3Replacement = "    pageUrl:       '/' + fx.building.slug,";

const edits = [
  { name: 'edit1 (first clone slug col)',  anchor: edit1Anchor, replacement: edit1Replacement },
  { name: 'edit2 (S2 clone slug col)',     anchor: edit2Anchor, replacement: edit2Replacement },
  { name: 'edit3 (S3 body pageUrl)',       anchor: edit3Anchor, replacement: edit3Replacement },
];

for (const e of edits) {
  const occ = text.split(e.anchor).length - 1;
  if (occ !== 1) {
    console.error('ABORT: anchor count ' + occ + ' != 1 for ' + e.name);
    console.error('  first 100 chars: ' + JSON.stringify(e.anchor.slice(0, 100)));
    process.exit(1);
  }
}

for (const e of edits) { text = text.replace(e.anchor, e.replacement); }
fs.writeFileSync(target, text, 'utf8');

const newLen = text.length;
console.log('PATCHED: ' + target);
console.log('  before: ' + originalLen + ' bytes');
console.log('  after:  ' + newLen + ' bytes');
console.log('  delta:  ' + (newLen - originalLen) + ' bytes');

// Post-verify: zero '/buildings/' literals remain; current_page_slug appears 2 times
const verify = fs.readFileSync(target, 'utf8');
const remainingBuildings = (verify.match(/'\/buildings\/'/g) || []).length;
const slugColCount = (verify.match(/current_page_slug/g) || []).length;
console.log('  Post-patch /buildings/ literal count: ' + remainingBuildings);
console.log('  Post-patch current_page_slug count: ' + slugColCount);
if (remainingBuildings !== 0) { console.error('ABORT: /buildings/ literals still present'); process.exit(1); }
if (slugColCount < 2) { console.error('ABORT: expected at least 2 current_page_slug occurrences, found ' + slugColCount); process.exit(1); }

// LE consistency
const outBytes = fs.readFileSync(target);
let outCrlf = 0, outLf = 0;
for (let i = 0; i < outBytes.length; i++) {
  if (outBytes[i] === 0x0A) {
    if (i > 0 && outBytes[i-1] === 0x0D) outCrlf++;
    else outLf++;
  }
}
if (dominantEol === '\r\n' && outLf > 0) { console.error('ABORT: stray LF in CRLF output'); process.exit(1); }
if (dominantEol === '\n' && outCrlf > 0) { console.error('ABORT: stray CRLF in LF output'); process.exit(1); }
console.log('LE PRESERVED: ' + (dominantEol === '\r\n' ? 'all CRLF' : 'all LF') +
            ' (crlf=' + outCrlf + ', lfOnly=' + outLf + ')');

console.log('VERIFIED: 3 /buildings/ literals removed, 2+ current_page_slug references present');