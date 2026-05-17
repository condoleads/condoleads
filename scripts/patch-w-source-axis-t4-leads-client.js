#!/usr/bin/env node
/**
 * patch-w-source-axis-t4-leads-client.js  (rev 2 — corrected ACTIONS anchor)
 *
 * W-SOURCE-AXIS T4 read-path patch on components/admin-homes/AdminHomesLeadsClient.tsx.
 *
 * Six changes:
 *   1. Add getSourceDisplay() helper.
 *   2. Neutralize ROUTE_LABELS: 'Charlie' -> 'AI Chat'.
 *   3. Rename calcEngagement labels: Hot/Warm/Cold -> High/Mid/Low.
 *   4. Kill the ACTIONS column <td> cell (Plan-button hunk).
 *   5. Remove 'Actions' from the header-name array at L491.
 *   6. Adjust colSpan={12} -> colSpan={11} for the empty-state and activity-preview rows
 *      (column count drops from 11 named + 1 checkbox = 12 to 10 named + 1 = 11).
 *
 * Backup-before-write with fresh timestamp. Idempotent: re-running exits 0 if
 * getSourceDisplay already present.
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

// LE detect
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

// Idempotency check
const ALREADY_MARKER = "function getSourceDisplay(";
if (text.indexOf(ALREADY_MARKER) !== -1) {
  console.log('Already applied (getSourceDisplay function present). Exiting 0.');
  process.exit(0);
}

// ---------- Change 1: ROUTE_LABELS neutralize ----------
const RL_OLD = "  charlie: 'Charlie',\n  charlie_vip_request: 'Charlie VIP',";
const RL_NEW = "  charlie: 'AI Chat',\n  charlie_vip_request: 'AI Chat VIP',";

const rlCount = text.split(RL_OLD).length - 1;
console.log('Change 1 (ROUTE_LABELS) anchor count: ' + rlCount);
if (rlCount !== 1) {
  console.error('ROUTE_LABELS anchor not unique. Refusing to patch.');
  process.exit(1);
}

// ---------- Change 2: calcEngagement labels ----------
const CE_OLD =
  "  if (score >= 75) return { score, label: 'Hot', color: 'text-red-600' }\n" +
  "  if (score >= 50) return { score, label: 'Warm', color: 'text-orange-500' }\n" +
  "  if (score >= 25) return { score, label: 'Active', color: 'text-yellow-600' }\n" +
  "  return { score, label: 'Cold', color: 'text-gray-400' }";

const CE_NEW =
  "  if (score >= 75) return { score, label: 'High', color: 'text-red-600' }\n" +
  "  if (score >= 50) return { score, label: 'Mid', color: 'text-orange-500' }\n" +
  "  if (score >= 25) return { score, label: 'Active', color: 'text-yellow-600' }\n" +
  "  return { score, label: 'Low', color: 'text-gray-400' }";

const ceCount = text.split(CE_OLD).length - 1;
console.log('Change 2 (calcEngagement) anchor count: ' + ceCount);
if (ceCount !== 1) {
  console.error('calcEngagement anchor not unique. Refusing to patch.');
  process.exit(1);
}

// ---------- Change 3: Add getSourceDisplay helper after ROUTE_COLORS map ----------
const GSD_ANCHOR_OLD =
  "  unknown: 'bg-slate-100 text-slate-600',\n" +
  "}\n" +
  "\n" +
  "const ACTIVITY_SCORES";

const GSD_HELPER =
  "}\n" +
  "\n" +
  "// W-SOURCE-AXIS T4: derive source display from (lead_origin_route, plan_data, appointment_date).\n" +
  "// Surfaces 'Plan' for Charlie-routed leads with plan_data, 'Appointment' for those with\n" +
  "// appointment_date; otherwise falls through to ROUTE_LABELS. Lets Plan/Appointment become\n" +
  "// first-class source values without requiring a new lead_origin_route enum value.\n" +
  "function getSourceDisplay(\n" +
  "  route: LeadOriginRoute,\n" +
  "  planData: any,\n" +
  "  appointmentDate: any,\n" +
  "): { label: string; color: string } {\n" +
  "  if (route === 'charlie' && planData) {\n" +
  "    return { label: 'Plan', color: 'bg-blue-100 text-blue-700' }\n" +
  "  }\n" +
  "  if (route === 'charlie' && appointmentDate) {\n" +
  "    return { label: 'Appointment', color: 'bg-green-100 text-green-700' }\n" +
  "  }\n" +
  "  return { label: ROUTE_LABELS[route], color: ROUTE_COLORS[route] }\n" +
  "}\n";

const GSD_NEW =
  "  unknown: 'bg-slate-100 text-slate-600',\n" +
  GSD_HELPER +
  "\n" +
  "const ACTIVITY_SCORES";

const gsdCount = text.split(GSD_ANCHOR_OLD).length - 1;
console.log('Change 3 (getSourceDisplay insertion) anchor count: ' + gsdCount);
if (gsdCount !== 1) {
  console.error('getSourceDisplay insertion anchor not unique. Refusing to patch.');
  process.exit(1);
}

// ---------- Change 4: kill ACTIONS <td> cell (Plan-button hunk) ----------
const TD_OLD =
  "                    <td className=\"px-4 py-3 whitespace-nowrap\">\n" +
  "                      <div className=\"flex gap-2\">\n" +
  "                        {lead.plan_data && (\n" +
  "                          <button\n" +
  "                            onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}\n" +
  "                            className=\"text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100\"\n" +
  "                          >\n" +
  "                            {expandedLead === lead.id ? 'Hide Plan' : 'Plan'}\n" +
  "                          </button>\n" +
  "                        )}\n" +
  "                        {/* W6a followup-B: per-row Delete removed. Delete UI consolidated to bulk-only\n" +
  "                            via the red \"Delete (N)\" button above the table. Server policy (agent-block)\n" +
  "                            still enforced on every DELETE call regardless of UI surface. */}\n" +
  "                      </div>\n" +
  "                    </td>\n";

const TD_NEW = "";

const tdCount = text.split(TD_OLD).length - 1;
console.log('Change 4 (ACTIONS <td>) anchor count: ' + tdCount);
if (tdCount !== 1) {
  console.error('ACTIONS <td> anchor not unique. Refusing to patch.');
  process.exit(1);
}

// ---------- Change 5: remove 'Actions' from header-name array ----------
const TH_OLD = "{['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Quality', 'Temperature', 'Actions'].map(h => (";
const TH_NEW = "{['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Quality', 'Temperature'].map(h => (";

const thCount = text.split(TH_OLD).length - 1;
console.log('Change 5 (header array) anchor count: ' + thCount);
if (thCount !== 1) {
  console.error('Header array anchor not unique. Refusing to patch.');
  process.exit(1);
}

// ---------- Change 6: colSpan={12} -> colSpan={11} for all sites in this file ----------
const CS_OLD = "colSpan={12}";
const CS_NEW = "colSpan={11}";

const csCount = text.split(CS_OLD).length - 1;
console.log('Change 6 (colSpan={12}) count: ' + csCount);
if (csCount < 1) {
  console.error('No colSpan={12} found. Refusing to patch.');
  process.exit(1);
}
// Note: we replace ALL occurrences. Multiple is expected (empty-state row,
// activity-preview row, and possibly a drawer row).

// ---------- Backup BEFORE write ----------
const bk = target + '.backup_' + stamp;
fs.copyFileSync(target, bk);
console.log('Backup: ' + path.basename(bk) + ' (' + fs.statSync(bk).size + ' bytes)');

// ---------- Apply all changes ----------
text = text.replace(RL_OLD, RL_NEW);
text = text.replace(CE_OLD, CE_NEW);
text = text.replace(GSD_ANCHOR_OLD, GSD_NEW);
text = text.replace(TD_OLD, TD_NEW);
text = text.replace(TH_OLD, TH_NEW);
// Replace ALL colSpan={12} -> colSpan={11}
text = text.split(CS_OLD).join(CS_NEW);

// ---------- Post-build assertions ----------
const checks = [
  { name: "ROUTE_LABELS 'AI Chat' present",          test: text.indexOf("charlie: 'AI Chat',") !== -1 },
  { name: "ROUTE_LABELS 'Charlie' literal gone",     test: text.indexOf("charlie: 'Charlie',") === -1 },
  { name: "calcEngagement 'High' label present",     test: text.indexOf("label: 'High'") !== -1 },
  { name: "calcEngagement 'Hot' literal gone",       test: text.indexOf("label: 'Hot'") === -1 },
  { name: "calcEngagement 'Cold' literal gone",      test: text.indexOf("label: 'Cold'") === -1 },
  { name: "getSourceDisplay function present",       test: text.indexOf("function getSourceDisplay(") !== -1 },
  { name: "ACTIONS <td> Plan button removed",        test: text.indexOf("Hide Plan' : 'Plan'") === -1 },
  { name: "'Actions' removed from header array",     test: text.indexOf(", 'Actions']") === -1 },
  { name: "header array still has 'Temperature'",    test: text.indexOf("'Temperature'].map") !== -1 },
  { name: "colSpan={12} gone",                       test: text.indexOf("colSpan={12}") === -1 },
  { name: "colSpan={11} present at least once",      test: text.indexOf("colSpan={11}") !== -1 },
  { name: "no CRLF introduced",                      test: fileIsLfOnly ? text.indexOf('\r\n') === -1 : true },
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

// ---------- Write ----------
fs.writeFileSync(target, text, 'utf8');
const liveSize = fs.statSync(target).size;
const delta = liveSize - inputBytes.length;
console.log('');
console.log('Wrote: ' + path.relative(ROOT, target) + ' (' + liveSize + ' bytes, delta ' + (delta >= 0 ? '+' : '') + delta + ')');