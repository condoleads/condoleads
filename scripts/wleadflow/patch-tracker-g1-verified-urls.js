#!/usr/bin/env node
// scripts/wleadflow/patch-tracker-g1-verified-urls.js
//
// Replaces the fabricated URL patterns in the G1 acceptance criteria with
// the verified table from Action 12.1c read of app/[slug]/page.tsx +
// lib/utils/slugs.ts. Also updates the tracker footer.
//
// LE-aware. Idempotent (aborts if the new marker is already present).

const fs = require('fs');

const target = 'docs/W-LEAD-FLOW-VERIFICATION-TRACKER.md';
if (!fs.existsSync(target)) { console.error('ABORT: target not found: ' + target); process.exit(1); }

const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '_' +
              pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
const backupPath = target + '.backup_' + stamp;
fs.copyFileSync(target, backupPath);
console.log('BACKUP: ' + backupPath);

// LE detection
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

function norm(s) { return s.replace(/\n/g, dominantEol); }

// Idempotency
if (text.indexOf('verified against `app/[slug]/page.tsx`') !== -1) {
  console.error('ABORT: verified-URL marker already present');
  process.exit(1);
}

// ----- Edit 1: Replace G1 acceptance criteria URL bullets -----
const edit1Anchor = norm(
  '**Acceptance criteria**:\n' +
  '- Harness sends a realistic page URL per variant:\n' +
  '  - S1-Build: `/buildings/<slug>`\n' +
  '  - S1-List: `/listings/<listing_key>` (or `/properties/<id>` -- confirm path at fix time)\n' +
  '  - S1-Area: `/<area_slug>`\n' +
  '  - S1-Muni: `/<area_slug>/<muni_slug>` (or whatever the muni route is)\n' +
  '  - S1-Comm: `/<area_slug>/<muni_slug>/<community_slug>`\n' +
  '  - S1-Nbhd: `/<area_slug>/<nbhd_slug>` (neighbourhoods key by area)\n' +
  '- Harness asserts `lead.source_url` non-null and matches the expected pattern.'
);
const edit1Replacement = norm(
  '**Acceptance criteria**:\n' +
  '- Harness sends the canonical page URL per variant, verified against `app/[slug]/page.tsx` dispatch + `lib/utils/slugs.ts` builders (2026-05-18 verification):\n' +
  '  - S1-Build: `/<buildings.slug>` (root -- polymorphic `[slug]` route falls through to BuildingPage).\n' +
  '  - S1-List (condo, slug contains `-unit-`): `/<building-slug>-unit-<unit>-<mls>` (root, via `generatePropertySlug` in `lib/utils/slugs.ts`).\n' +
  '  - S1-List (home / freehold, last segment matches MLS pattern `/^[a-zA-Z]\\d{5,}$/`): `/<street-slug>-<city-slug>-<mls>` (root, via `generateHomePropertySlug`).\n' +
  '  - S1-List (legacy fallback): `/property/<id>` -- the `app/property/[id]/page.tsx` route still exists and the slug builders fall back to this when `listing_key` is missing.\n' +
  '  - S1-Area: `/<treb_areas.slug>` (root). NOTE: `app/comprehensive-site/[slug]/page.tsx` has a `findArea` helper that tolerates a `-area` DB-slug suffix; main dispatch in `app/[slug]/page.tsx` requires exact match. Resolve per-fixture before send.\n' +
  '  - S1-Muni: `/<municipalities.slug>` (root, flat -- NOT nested under area).\n' +
  '  - S1-Comm: `/<communities.slug>` (root, flat -- NOT nested under area/muni).\n' +
  '  - S1-Nbhd: **not a root URL.** Only public neighbourhood route found is `/comprehensive-site/toronto/<neighbourhoods.slug>` (Toronto-only). For non-Toronto neighbourhoods the public URL surface is unverified -- resolve before sending pageUrl for this variant, or defer S1-Nbhd.\n' +
  '- Open verifications (must resolve before S1 G1 fix harness runs):\n' +
  '  - **V1** `treb_areas.slug` URL: exact-vs-clean `-area` suffix behaviour. Two handlers disagree; pick the canonical one before harness commits a value.\n' +
  '  - **V2** Non-Toronto neighbourhood URL pattern (or confirm S1-Nbhd defers indefinitely).\n' +
  '- Harness asserts `lead.source_url` non-null and matches the verified pattern for the variant.'
);

// ----- Edit 2: Update footer -----
const edit2Anchor      = '_Last updated: 2026-05-18 (post S1 PASS / pre S2-S3-S4 retry)_';
const edit2Replacement = '_Last updated: 2026-05-18 (G1 URL patterns replaced with verified table from `app/[slug]/page.tsx` + `lib/utils/slugs.ts`; pre S2-S3-S4 retry)_';

const edits = [
  { name: 'edit1 (G1 verified URL table)', anchor: edit1Anchor, replacement: edit1Replacement },
  { name: 'edit2 (footer)',                anchor: edit2Anchor, replacement: edit2Replacement },
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
console.log('  input bytes:  ' + originalLen);
console.log('  output bytes: ' + newLen);
console.log('  delta:        +' + (newLen - originalLen) + ' bytes');

// LE post-check
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

// Sentinels
const verify = outBytes.toString('utf8');
const sentinels = [
  'verified against `app/[slug]/page.tsx`',
  '`generatePropertySlug`',
  '`generateHomePropertySlug`',
  'NOT nested under area',
  'Open verifications (must resolve',
  'V1',
  'V2',
  'G1 URL patterns replaced with verified table',
];
const missing = sentinels.filter(s => verify.indexOf(s) === -1);
if (missing.length > 0) {
  console.error('ABORT: post-verify failed -- missing sentinels:');
  for (const m of missing) console.error('  - ' + m);
  process.exit(1);
}
// Anti-sentinels -- old fabricated patterns must be GONE
const antiSentinels = [
  '/buildings/<slug>',
  '/listings/<listing_key>',
  '`/<area_slug>/<muni_slug>`',
  '`/<area_slug>/<muni_slug>/<community_slug>`',
  '`/<area_slug>/<nbhd_slug>`',
];
const stillPresent = antiSentinels.filter(s => verify.indexOf(s) !== -1);
if (stillPresent.length > 0) {
  console.error('ABORT: fabricated patterns still present in output:');
  for (const s of stillPresent) console.error('  - ' + s);
  process.exit(1);
}
console.log('VERIFIED: ' + sentinels.length + ' sentinels present, ' + antiSentinels.length + ' fabricated patterns removed');