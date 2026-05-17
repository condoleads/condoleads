#!/usr/bin/env node
/**
 * verify-w-source-axis-t5.js
 *
 * Code-side smoke for every W-SOURCE-AXIS deliverable. Read-only — performs
 * grep/regex checks against the current state of the two display surfaces.
 *
 * Coverage:
 *   T4-a  Actions column killed, dead expandedLead toggle removed
 *   T4-b  Source pill wired to neutral display (getSourceDisplay/deriveLeadOriginRoute)
 *   T4-c  Lead type has source_url + appointment_date; pill <a> wrap; stopPropagation
 *   T4-d  Estimator tab on workbench
 *   T4-e  Estimator Questionnaire tab on workbench
 *   T4-f  Activity tab present (no-op verify)
 *   T4-g  Source URL prominence — 4 changes (Overview / Est tab / EstQ tab / pill arrow)
 *   F2    Engagement labels renamed (High/Mid/Active/Low — no Hot/Cold collision)
 *   D4    Rule Zero — no tenant-personalized "Charlie" or "walliam_" literals
 *         in either display surface
 *   CF    Carry-forward — W-QUALITY-SPLIT Quality + Temperature + Intent preserved
 *
 * Exit 0 only if all checks pass.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PATHS = {
  ll: path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx'),
  wb: path.join(ROOT, 'app', 'admin-homes', 'leads', '[id]', 'LeadWorkbenchClient.tsx'),
};

for (const [k, p] of Object.entries(PATHS)) {
  if (!fs.existsSync(p)) { console.error('MISSING: ' + k + ' -> ' + p); process.exit(1); }
}

const ll = fs.readFileSync(PATHS.ll, 'utf8');
const wb = fs.readFileSync(PATHS.wb, 'utf8');

// Scoped extraction of calcEngagement body for F2 checks
const engMatch = ll.match(/function calcEngagement[\s\S]*?\n\}/);
const engBlock = engMatch ? engMatch[0] : '';

const TESTS = [
  // -------- T4-a -----------------------------------------------------------
  { sec: 'T4-a', name: 'No "Actions" <th> header in leads list',
    ok: !/<th[^>]*>\s*Actions\s*<\/th>/i.test(ll) },
  { sec: 'T4-a', name: 'No "expandedLead" dead toggle code',
    ok: !ll.includes('expandedLead') },

  // -------- T4-b -----------------------------------------------------------
  { sec: 'T4-b', name: 'getSourceDisplay function defined',
    ok: /function\s+getSourceDisplay\s*\(/.test(ll) },
  { sec: 'T4-b', name: 'deriveLeadOriginRoute referenced',
    ok: /deriveLeadOriginRoute/.test(ll) },
  { sec: 'T4-b', name: 'Pill renders {src.label} (neutral label token)',
    ok: ll.includes('{src.label}') },
  { sec: 'T4-b', name: 'getSourceDisplay called with deriveLeadOriginRoute(lead.source)',
    ok: /getSourceDisplay\s*\(\s*deriveLeadOriginRoute\s*\(\s*lead\.source/.test(ll) },

  // -------- T4-c -----------------------------------------------------------
  { sec: 'T4-c', name: 'Lead type has source_url: string | null',
    ok: /source_url\s*:\s*string\s*\|\s*null/.test(ll) },
  { sec: 'T4-c', name: 'Lead type references appointment_date',
    ok: /appointment_date/.test(ll) },
  { sec: 'T4-c', name: 'Pill <a> wrap when source_url present (target=_blank)',
    ok: /lead\.source_url\s*\?[\s\S]{0,300}<a\s+href=\{lead\.source_url\}[\s\S]{0,300}target="_blank"/.test(ll) },
  { sec: 'T4-c', name: '<a> onClick stops propagation (no row-click bleed)',
    ok: /onClick=\{\s*\(e\)\s*=>\s*e\.stopPropagation/.test(ll) },
  { sec: 'T4-c', name: 'Pill <a> uses inline-block hover:opacity-80',
    ok: ll.includes('inline-block hover:opacity-80') },

  // -------- T4-d -----------------------------------------------------------
  { sec: 'T4-d', name: 'Estimator Submission heading present in workbench',
    ok: />Estimator Submission<\/h3>/.test(wb) },

  // -------- T4-e -----------------------------------------------------------
  { sec: 'T4-e', name: 'Estimator Questionnaire heading present in workbench',
    ok: />Estimator Questionnaire<\/h3>/.test(wb) },

  // -------- T4-f -----------------------------------------------------------
  { sec: 'T4-f', name: 'Activity tab reference present (no-op verify)',
    ok: /['"]activity['"]/i.test(wb) || />Activity</.test(wb) },

  // -------- T4-g Change 1 (Overview prominent Source URL block) ------------
  { sec: 'T4-g.1', name: 'Overview SOURCE URL prominent label block present',
    ok: wb.includes('uppercase tracking-wider mb-1">Source URL') },
  { sec: 'T4-g.1', name: 'Em-dash fallback when source_url is null',
    ok: wb.includes('<span className="text-gray-400">\u2014</span>') },
  { sec: 'T4-g.1', name: 'Legacy short-form Source URL block fully removed',
    ok: !wb.includes('text-xs text-gray-400">Source URL: </span>') },
  { sec: 'T4-g.1', name: 'Overview block uses ternary on anchorLead.source_url',
    ok: /anchorLead\.source_url\s*\?\s*\([\s\S]{0,400}<a\s+href=\{anchorLead\.source_url\}/.test(wb) },

  // -------- T4-g Change 2 (Estimator tab Submitted from row) ---------------
  { sec: 'T4-g.2', name: '"Submitted from " row precedes Estimator Submission heading',
    ok: /Submitted from[\s\S]{0,1200}>Estimator Submission</.test(wb) },

  // -------- T4-g Change 3 (Estimator Q tab Submitted from row) -------------
  { sec: 'T4-g.3', name: '"Submitted from " row precedes Estimator Questionnaire heading',
    ok: /Submitted from[\s\S]{0,3000}>Estimator Questionnaire</.test(wb) },
  { sec: 'T4-g.3', name: '"Submitted from " appears >= 2 times in workbench (Est + EstQ)',
    ok: (wb.match(/Submitted from /g) || []).length >= 2 },

  // -------- T4-g Change 4 (Leads-list pill arrow) --------------------------
  { sec: 'T4-g.4', name: 'Pill arrow conditional present: lead.source_url ? \u2197',
    ok: ll.includes("lead.source_url ? ' \u2197'") },
  { sec: 'T4-g.4', name: 'Exactly one {src.label} render site (no duplicate)',
    ok: (ll.split('{src.label}').length - 1) === 1 },

  // -------- T4-g general arrow count ---------------------------------------
  { sec: 'T4-g', name: 'Workbench has >= 3 arrow icons (Overview + Est + EstQ)',
    ok: (wb.match(/\u2197/g) || []).length >= 3 },
  { sec: 'T4-g', name: 'Leads list has >= 1 arrow icon (conditional pill)',
    ok: (ll.match(/\u2197/g) || []).length >= 1 },

  // -------- F2 (Engagement rename) -----------------------------------------
  { sec: 'F2',    name: 'calcEngagement scoped: contains High/Mid/Active/Low labels',
    ok: /label:\s*'High'/.test(engBlock) && /label:\s*'Mid'/.test(engBlock) &&
        /label:\s*'Active'/.test(engBlock) && /label:\s*'Low'/.test(engBlock) },
  { sec: 'F2',    name: 'calcEngagement scoped: NO label: \'Hot\' or label: \'Cold\'',
    ok: !/label:\s*'Hot'/.test(engBlock) && !/label:\s*'Cold'/.test(engBlock) },
  { sec: 'F2',    name: 'calcEngagement scoped: function found in source',
    ok: engBlock.length > 0 },

  // -------- D4 / Rule Zero (multi-tenant correctness in display) -----------
  { sec: 'D4',    name: 'Leads list: no literal "Charlie" string',
    ok: !/['"`]Charlie['"`]/.test(ll) && !/>Charlie</.test(ll) },
  { sec: 'D4',    name: 'Leads list: no literal "walliam_" prefix',
    ok: !/['"`]walliam_/.test(ll) },
  { sec: 'D4',    name: 'Workbench: no literal "Charlie" string',
    ok: !/['"`]Charlie['"`]/.test(wb) && !/>Charlie</.test(wb) },
  { sec: 'D4',    name: 'Workbench: no literal "walliam_" prefix',
    ok: !/['"`]walliam_/.test(wb) },

  // -------- Carry-forward (W-QUALITY-SPLIT + intent) -----------------------
  { sec: 'CF',    name: 'Quality field referenced in leads list',
    ok: /lead\.quality\b/.test(ll) || /\bquality:/.test(ll) },
  { sec: 'CF',    name: 'Temperature field referenced in leads list',
    ok: /lead\.temperature\b/.test(ll) || /\btemperature\b/.test(ll) },
  { sec: 'CF',    name: 'Intent buyer/seller branch present',
    ok: /lead\.intent\s*===\s*['"]buyer['"]/.test(ll) },
];

const SECTION_LABELS = {
  'T4-a':   'T4-a — Actions column killed, dead toggle removed',
  'T4-b':   'T4-b — Source pill wired to neutral display function',
  'T4-c':   'T4-c — source_url clickability + Lead type fields',
  'T4-d':   'T4-d — Estimator tab on workbench',
  'T4-e':   'T4-e — Estimator Questionnaire tab on workbench',
  'T4-f':   'T4-f — Activity tab (no-op verify)',
  'T4-g.1': 'T4-g.1 — Overview prominent Source URL block',
  'T4-g.2': 'T4-g.2 — Estimator tab "Submitted from" row',
  'T4-g.3': 'T4-g.3 — Estimator Q tab "Submitted from" row',
  'T4-g.4': 'T4-g.4 — Leads-list pill arrow ↗',
  'T4-g':   'T4-g — Arrow icon counts',
  'F2':     'F2 — Engagement renamed (drop Hot/Cold collision)',
  'D4':     'D4 / Rule Zero — Multi-tenant correctness in display',
  'CF':     'Carry-forward — W-QUALITY-SPLIT + Intent preserved',
};

const sections = {};
for (const t of TESTS) {
  if (!sections[t.sec]) sections[t.sec] = [];
  sections[t.sec].push(t);
}

let pass = 0, fail = 0;
const fails = [];
for (const key of Object.keys(sections)) {
  console.log('');
  console.log('============================================================');
  console.log(SECTION_LABELS[key] || key);
  console.log('============================================================');
  for (const t of sections[key]) {
    const tag = t.ok ? '  PASS' : '  FAIL';
    console.log(tag + '  ' + t.name);
    if (t.ok) pass++; else { fail++; fails.push(key + ' — ' + t.name); }
  }
}

console.log('');
console.log('============================================================');
console.log('SUMMARY: ' + pass + ' passed, ' + fail + ' failed (' +
            TESTS.length + ' total)');
console.log('============================================================');
if (fail > 0) {
  console.log('');
  console.log('FAILED CHECKS:');
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('ALL W-SOURCE-AXIS T5 CODE CHECKS PASS');
process.exit(0);