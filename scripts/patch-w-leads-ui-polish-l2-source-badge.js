// scripts/patch-w-leads-ui-polish-l2-source-badge.js
//
// L2: swap source badge to use deriveLeadOriginRoute -> ROUTE_LABELS / ROUTE_COLORS.
// Anchors:
//   1. Add import line
//   2. SOURCE_LABELS const -> ROUTE_LABELS (line-pattern; typed Record<LeadOriginRoute, string>)
//   3. SOURCE_COLORS const -> ROUTE_COLORS (line-pattern)
//   4. Filter logic at L147 (substring)
//   5. Filter dropdown at L273 (substring)
//   6. Badge span className at L385 (substring)
//   7. Badge content at L386 (substring)
//   8. Append L2 status log line to W-LEADS-UI-POLISH-TRACKER.md

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
console.log('Patch stamp: ' + stamp);

function backup(rel) {
  const src = path.join(ROOT, rel);
  const dst = src + '.backup_' + stamp;
  fs.copyFileSync(src, dst);
  console.log('  backup: ' + path.basename(dst));
  return src;
}

function replaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count !== 1) throw new Error(label + ': expected 1 match, found ' + count);
  console.log('    OK ' + label);
  return content.replace(oldStr, newStr);
}

// ============================================================
// UI patch: AdminHomesLeadsClient.tsx
// ============================================================
console.log('--- UI patch: AdminHomesLeadsClient.tsx ---');
{
  const src = backup('components/admin-homes/AdminHomesLeadsClient.tsx');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  // ---- Patch 1: Add import line after existing react import ----
  text = replaceOnce(
    text,
    "import { useState, useMemo } from 'react'\n",
    "import { useState, useMemo } from 'react'\nimport { deriveLeadOriginRoute, type LeadOriginRoute } from '@/lib/utils/lead-origin-route'\n",
    '1 import deriveLeadOriginRoute + LeadOriginRoute'
  );

  // ---- Patch 2: SOURCE_LABELS const -> ROUTE_LABELS (LINE-PATTERN) ----
  console.log('  --- 2: SOURCE_LABELS -> ROUTE_LABELS (line-pattern) ----');
  {
    const lines = text.split('\n');
    const startIdx = lines.findIndex(l => /^const SOURCE_LABELS\b/.test(l));
    if (startIdx === -1) throw new Error('2: SOURCE_LABELS def line not found');
    let closeIdx = -1;
    for (let i = startIdx + 1; i < Math.min(startIdx + 30, lines.length); i++) {
      if (lines[i] === '}') { closeIdx = i; break; }
    }
    if (closeIdx === -1) throw new Error('2: SOURCE_LABELS close brace not found within 30 lines');
    console.log('    SOURCE_LABELS block at lines ' + (startIdx + 1) + '..' + (closeIdx + 1));

    const newBlock = [
      'const ROUTE_LABELS: Record<LeadOriginRoute, string> = {',
      "  charlie: 'Charlie',",
      "  charlie_vip_request: 'Charlie VIP',",
      "  estimator: 'Estimator',",
      "  estimator_questionnaire: 'Estimator Q',",
      "  estimator_vip_request: 'Estimator VIP',",
      "  contact_form: 'Contact',",
      "  registration: 'Registration',",
      "  property_inquiry: 'Property',",
      "  building_visit: 'Building Visit',",
      "  sale_evaluation: 'Sale Eval',",
      "  unknown: 'Unknown',",
      '}',
    ];
    lines.splice(startIdx, closeIdx - startIdx + 1, ...newBlock);
    text = lines.join('\n');
    console.log('    OK 2 SOURCE_LABELS -> ROUTE_LABELS (' + newBlock.length + ' lines)');
  }

  // ---- Patch 3: SOURCE_COLORS const -> ROUTE_COLORS (LINE-PATTERN) ----
  console.log('  --- 3: SOURCE_COLORS -> ROUTE_COLORS (line-pattern) ----');
  {
    const lines = text.split('\n');
    const startIdx = lines.findIndex(l => /^const SOURCE_COLORS\b/.test(l));
    if (startIdx === -1) throw new Error('3: SOURCE_COLORS def line not found');
    let closeIdx = -1;
    for (let i = startIdx + 1; i < Math.min(startIdx + 30, lines.length); i++) {
      if (lines[i] === '}') { closeIdx = i; break; }
    }
    if (closeIdx === -1) throw new Error('3: SOURCE_COLORS close brace not found within 30 lines');
    console.log('    SOURCE_COLORS block at lines ' + (startIdx + 1) + '..' + (closeIdx + 1));

    const newBlock = [
      'const ROUTE_COLORS: Record<LeadOriginRoute, string> = {',
      "  charlie: 'bg-purple-100 text-purple-700',",
      "  charlie_vip_request: 'bg-violet-100 text-violet-700',",
      "  estimator: 'bg-amber-50 text-amber-600',",
      "  estimator_questionnaire: 'bg-orange-100 text-orange-700',",
      "  estimator_vip_request: 'bg-amber-100 text-amber-700',",
      "  contact_form: 'bg-blue-100 text-blue-700',",
      "  registration: 'bg-emerald-100 text-emerald-700',",
      "  property_inquiry: 'bg-cyan-100 text-cyan-700',",
      "  building_visit: 'bg-teal-100 text-teal-700',",
      "  sale_evaluation: 'bg-pink-100 text-pink-700',",
      "  unknown: 'bg-slate-100 text-slate-600',",
      '}',
    ];
    lines.splice(startIdx, closeIdx - startIdx + 1, ...newBlock);
    text = lines.join('\n');
    console.log('    OK 3 SOURCE_COLORS -> ROUTE_COLORS (' + newBlock.length + ' lines)');
  }

  // ---- Patch 4: Filter logic ----
  text = replaceOnce(
    text,
    "if (filterSource !== 'all') f = f.filter(l => l.source === filterSource)",
    "if (filterSource !== 'all') f = f.filter(l => deriveLeadOriginRoute(l.source) === filterSource)",
    '4 filter logic'
  );

  // ---- Patch 5: Filter dropdown options (L273) ----
  text = replaceOnce(
    text,
    '{Object.entries(SOURCE_LABELS).map(([k, v]) => (',
    '{Object.entries(ROUTE_LABELS).map(([k, v]) => (',
    '5 filter dropdown SOURCE_LABELS -> ROUTE_LABELS'
  );

  // ---- Patch 6: Badge span className (L385) ----
  text = replaceOnce(
    text,
    "<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[lead.source] || 'bg-slate-100 text-slate-600'}`}>",
    "<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROUTE_COLORS[deriveLeadOriginRoute(lead.source)]}`}>",
    '6 badge span className'
  );

  // ---- Patch 7: Badge content (L386) ----
  // Old line includes a UTF-8 em-dash (U+2014) in the fallback. Use \u2014 to be explicit.
  text = replaceOnce(
    text,
    "{SOURCE_LABELS[lead.source] || lead.source?.replace('walliam_', '') || '\u2014'}",
    "{ROUTE_LABELS[deriveLeadOriginRoute(lead.source)]}",
    '7 badge content'
  );

  // ---- Residual checks ----
  if (text.match(/\bSOURCE_LABELS\b/)) throw new Error('UI: residual SOURCE_LABELS reference');
  if (text.match(/\bSOURCE_COLORS\b/)) throw new Error('UI: residual SOURCE_COLORS reference');
  // Positive checks
  if (!text.includes('ROUTE_LABELS')) throw new Error('UI: ROUTE_LABELS not present');
  if (!text.includes('ROUTE_COLORS')) throw new Error('UI: ROUTE_COLORS not present');
  if (!text.includes('deriveLeadOriginRoute')) throw new Error('UI: deriveLeadOriginRoute not imported/used');
  if (!text.includes('LeadOriginRoute')) throw new Error('UI: LeadOriginRoute type not imported');

  fs.writeFileSync(src, text, 'utf8');
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta ' + (text.length - before) + ')');
}

// ============================================================
// Patch 8: Tracker append
// ============================================================
console.log('');
console.log('--- Patch 8: W-LEADS-UI-POLISH-TRACKER.md status log append ---');
{
  const src = backup('docs/W-LEADS-UI-POLISH-TRACKER.md');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  const l1Anchor = '**2026-05-12 L1**';
  const l1Count = text.split(l1Anchor).length - 1;
  if (l1Count !== 1) throw new Error('tracker: L1 anchor count = ' + l1Count);

  if (!text.endsWith('\n')) text = text + '\n';

  const EM = '\u2014';
  const l2Entry =
    '- **2026-05-12 L2** ' + EM + ' **Source badge swap-in shipped.** ' +
    '`components/admin-homes/AdminHomesLeadsClient.tsx` now imports `deriveLeadOriginRoute` and `LeadOriginRoute` from `lib/utils/lead-origin-route.ts` (shipped W-LEADS-EMAIL T6b). ' +
    '`SOURCE_LABELS` (7 source-string keys: walliam_charlie, walliam_contact, walliam_agent_card, walliam_charlie_vip_request, walliam_estimator_vip_request, walliam_estimator_questionnaire, walliam_appointment) and ' +
    '`SOURCE_COLORS` (7 keys, parallel structure) were REPLACED with `ROUTE_LABELS` and `ROUTE_COLORS`, both typed `Record<LeadOriginRoute, string>` for compile-time exhaustiveness against the 11-value enum ' +
    '(charlie / charlie_vip_request / estimator / estimator_questionnaire / estimator_vip_request / contact_form / registration / property_inquiry / building_visit / sale_evaluation / unknown). ' +
    'Source column badge at L385-386 now uses `ROUTE_COLORS[deriveLeadOriginRoute(lead.source)]` and `ROUTE_LABELS[deriveLeadOriginRoute(lead.source)]` ' + EM + ' no fallback needed since the helper always returns a valid enum value (`unknown` covers all unmatched inputs). ' +
    'Filter dropdown at L273 rebuilt from `Object.entries(ROUTE_LABELS)` so users now filter by route (11 options) instead of raw source string (7 options); filter logic at L147 compares ' +
    '`deriveLeadOriginRoute(l.source) === filterSource` instead of `l.source === filterSource`. ' +
    '**Vocabulary alignment notes:** the old `walliam_appointment` and `walliam_agent_card` SOURCE_LABELS keys had no corresponding route enum values; the DB distribution shows 0 rows with either source ' +
    'string (the appointment route actually writes `source: walliam_charlie`, which maps to the `charlie` route), so removing them is not a regression. CSV export at L173 was deliberately NOT changed ' +
    '(continues to emit raw `lead.source`) ' + EM + ' data exports preserve original DB values; consumers can derive route downstream if needed. ' +
    '**No DB schema changes.** No new API endpoints. Pure client component swap. ' +
    'L2 row in the phase table stays OPEN until Lclose reconciles all phase commit hashes.\n';

  text = text + l2Entry;
  fs.writeFileSync(src, text, 'utf8');

  const l2MarkerCount = text.split('**2026-05-12 L2**').length - 1;
  if (l2MarkerCount !== 1) throw new Error('tracker: L2 marker count = ' + l2MarkerCount);
  console.log('  L2 marker count: ' + l2MarkerCount);
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta +' + (text.length - before) + ')');
}

console.log('\n=== ALL L2 PATCHES APPLIED OK ===');