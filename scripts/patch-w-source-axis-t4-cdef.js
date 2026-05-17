#!/usr/bin/env node
/**
 * patch-w-source-axis-t4-cdef.js
 *
 * W-SOURCE-AXIS T4 sub-phases C/D/E (T4-f Activity is no-op — already wired).
 *
 * AdminHomesLeadsClient.tsx (T4-c):
 *   1. Add source_url + appointment_date to Lead interface.
 *   2. Wrap source pill in conditional <a href={source_url}> when truthy.
 *
 * LeadWorkbenchClient.tsx (T4-d + T4-e):
 *   3. Extend TabKey union with 'estimator' + 'estimator_questionnaire'.
 *   4. Insert two TABS entries between plan and credits.
 *   5. Insert two render branches between plan and credits in the conditional.
 *
 * Atomic: if either file's anchors fail, NEITHER is written.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = {
  leadsList: path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx'),
  workbench: path.join(ROOT, 'app', 'admin-homes', 'leads', '[id]', 'LeadWorkbenchClient.tsx'),
};

for (const [name, t] of Object.entries(TARGETS)) {
  if (!fs.existsSync(t)) {
    console.error('TARGET MISSING (' + name + '): ' + t);
    process.exit(1);
  }
}

const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp =
  d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
  pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());

const leadsListText = fs.readFileSync(TARGETS.leadsList, 'utf8');
const workbenchText = fs.readFileSync(TARGETS.workbench, 'utf8');

let leadsListNew = leadsListText;
let workbenchNew = workbenchText;

// ----- T4-c α: Lead interface fields -----
const LL_INTF_OLD = '  source: string\n  intent: string | null';
const LL_INTF_NEW =
  '  source: string\n' +
  '  source_url: string | null\n' +
  '  appointment_date: string | null\n' +
  '  intent: string | null';

if (leadsListNew.indexOf('source_url: string | null') !== -1) {
  console.log('T4-c α: Lead interface already has source_url; skipping.');
} else {
  const c = leadsListNew.split(LL_INTF_OLD).length - 1;
  console.log('T4-c α (Lead interface) anchor count: ' + c);
  if (c !== 1) {
    console.error('Lead interface anchor not unique. Aborting.');
    process.exit(1);
  }
  leadsListNew = leadsListNew.replace(LL_INTF_OLD, LL_INTF_NEW);
}

// ----- T4-c β: wrap source pill in conditional anchor -----
const PILL_RE =
  /(\s*)<span className=\{`px-2 py-0\.5 rounded-full text-xs font-medium \$\{getSourceDisplay\(deriveLeadOriginRoute\(lead\.source\), lead\.plan_data, null\)\.color\}`\}>\s*\n\s*\{getSourceDisplay\(deriveLeadOriginRoute\(lead\.source\), lead\.plan_data, null\)\.label\}\s*\n\s*<\/span>/;

if (leadsListNew.indexOf('lead.source_url ? (') !== -1) {
  console.log('T4-c β: source pill wrap already present; skipping.');
} else {
  const pm = leadsListNew.match(PILL_RE);
  if (!pm) {
    console.error('T4-c β: source pill regex not matched. Aborting.');
    process.exit(1);
  }
  const indent = pm[1];
  const repl =
    indent + '{(() => {\n' +
    indent + '  const src = getSourceDisplay(deriveLeadOriginRoute(lead.source), lead.plan_data, null)\n' +
    indent + '  const pill = (\n' +
    indent + '    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${src.color}`}>\n' +
    indent + '      {src.label}\n' +
    indent + '    </span>\n' +
    indent + '  )\n' +
    indent + '  return lead.source_url ? (\n' +
    indent + '    <a href={lead.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={lead.source_url} className="inline-block hover:opacity-80">\n' +
    indent + '      {pill}\n' +
    indent + '    </a>\n' +
    indent + '  ) : pill\n' +
    indent + '})()}';
  leadsListNew = leadsListNew.replace(PILL_RE, repl);
  console.log('T4-c β (source pill wrap) applied.');
}

// ----- T4-d: extend TabKey union -----
const WB_TABKEY_OLD = "type TabKey = 'overview' | 'plan' | 'credits' | 'activity' | 'emails' | 'vip' | 'notes'";
const WB_TABKEY_NEW = "type TabKey = 'overview' | 'plan' | 'estimator' | 'estimator_questionnaire' | 'credits' | 'activity' | 'emails' | 'vip' | 'notes'";

if (workbenchNew.indexOf("'estimator' | 'estimator_questionnaire'") !== -1) {
  console.log('T4-d (TabKey): already applied; skipping.');
} else {
  const c = workbenchNew.split(WB_TABKEY_OLD).length - 1;
  console.log('T4-d (TabKey) anchor count: ' + c);
  if (c !== 1) {
    console.error('TabKey anchor not unique. Aborting.');
    process.exit(1);
  }
  workbenchNew = workbenchNew.replace(WB_TABKEY_OLD, WB_TABKEY_NEW);
}

// ----- T4-d: TABS array entries -----
const WB_TABS_OLD =
  "  { id: 'plan', label: 'Plan', phase: 'W4b' },\n" +
  "  { id: 'credits', label: 'Credits & Usage', phase: 'W4c' },";
const WB_TABS_NEW =
  "  { id: 'plan', label: 'Plan', phase: 'W4b' },\n" +
  "  { id: 'estimator', label: 'Estimator', phase: 'W4b-est' },\n" +
  "  { id: 'estimator_questionnaire', label: 'Estimator Q', phase: 'W4b-estq' },\n" +
  "  { id: 'credits', label: 'Credits & Usage', phase: 'W4c' },";

if (workbenchNew.indexOf("{ id: 'estimator',") !== -1) {
  console.log('T4-d (TABS array): already applied; skipping.');
} else {
  const c = workbenchNew.split(WB_TABS_OLD).length - 1;
  console.log('T4-d (TABS array) anchor count: ' + c);
  if (c !== 1) {
    console.error('TABS array anchor not unique. Aborting.');
    process.exit(1);
  }
  workbenchNew = workbenchNew.replace(WB_TABS_OLD, WB_TABS_NEW);
}

// ----- T4-e: render branches between plan and credits -----
const WB_RENDER_RE = /(\s*)\) : tab === 'credits' \? \(/;

if (workbenchNew.indexOf("tab === 'estimator' ?") !== -1) {
  console.log('T4-e (render branches): already applied; skipping.');
} else {
  const rm = workbenchNew.match(WB_RENDER_RE);
  if (!rm) {
    console.error('T4-e: render conditional credits anchor not matched. Aborting.');
    process.exit(1);
  }
  const renderIndent = rm[1];
  const contentIndent = renderIndent + '  ';

  const insert =
    renderIndent + ') : tab === \'estimator\' ? (\n' +
    contentIndent + '<div className="space-y-6">\n' +
    contentIndent + '  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Estimator Submission</h3>\n' +
    contentIndent + '  <div className="grid grid-cols-2 gap-x-12 gap-y-4">\n' +
    contentIndent + '    <Field label="Estimated Value Min" value={anchorLead.estimated_value_min ? `$${Number(anchorLead.estimated_value_min).toLocaleString()}` : null} />\n' +
    contentIndent + '    <Field label="Estimated Value Max" value={anchorLead.estimated_value_max ? `$${Number(anchorLead.estimated_value_max).toLocaleString()}` : null} />\n' +
    contentIndent + '    <Field label="Budget Max" value={anchorLead.budget_max ? `$${Number(anchorLead.budget_max).toLocaleString()}` : null} />\n' +
    contentIndent + '  </div>\n' +
    contentIndent + '  {anchorLead.property_details && (\n' +
    contentIndent + '    <div className="mt-6">\n' +
    contentIndent + '      <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Property Details</h4>\n' +
    contentIndent + '      <pre className="text-xs bg-gray-50 p-3 rounded border overflow-auto whitespace-pre-wrap">{JSON.stringify(anchorLead.property_details, null, 2)}</pre>\n' +
    contentIndent + '    </div>\n' +
    contentIndent + '  )}\n' +
    contentIndent + '  {!anchorLead.estimated_value_min && !anchorLead.estimated_value_max && !anchorLead.property_details && (\n' +
    contentIndent + '    <p className="text-sm text-gray-500 italic">No estimator data captured for this lead.</p>\n' +
    contentIndent + '  )}\n' +
    contentIndent + '</div>\n' +
    renderIndent + ') : tab === \'estimator_questionnaire\' ? (\n' +
    contentIndent + '<div className="space-y-6">\n' +
    contentIndent + '  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Estimator Questionnaire</h3>\n' +
    contentIndent + '  {anchorLead.message ? (\n' +
    contentIndent + '    <div className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 p-4 rounded border">{anchorLead.message}</div>\n' +
    contentIndent + '  ) : (\n' +
    contentIndent + '    <p className="text-sm text-gray-500 italic">No questionnaire data captured for this lead.</p>\n' +
    contentIndent + '  )}\n' +
    contentIndent + '</div>\n' +
    renderIndent + ') : tab === \'credits\' ? (';

  workbenchNew = workbenchNew.replace(WB_RENDER_RE, insert);
  console.log('T4-e (render branches) applied.');
}

// ----- Post-build assertions -----
const checks = [
  { name: 'leadsList: Lead.source_url added',                    test: leadsListNew.indexOf('source_url: string | null') !== -1 },
  { name: 'leadsList: Lead.appointment_date added',              test: leadsListNew.indexOf('appointment_date: string | null') !== -1 },
  { name: 'leadsList: source pill conditional wrap present',     test: leadsListNew.indexOf('lead.source_url ? (') !== -1 },
  { name: 'leadsList: anchor target="_blank" present',           test: leadsListNew.indexOf('target="_blank"') !== -1 },
  { name: 'leadsList: stopPropagation present',                  test: leadsListNew.indexOf('e.stopPropagation()') !== -1 },
  { name: 'workbench: TabKey has estimator',                     test: workbenchNew.indexOf("'estimator' | 'estimator_questionnaire'") !== -1 },
  { name: 'workbench: TABS estimator entry present',             test: workbenchNew.indexOf("{ id: 'estimator', label: 'Estimator',") !== -1 },
  { name: 'workbench: TABS estimator_questionnaire entry',       test: workbenchNew.indexOf("{ id: 'estimator_questionnaire', label: 'Estimator Q',") !== -1 },
  { name: 'workbench: render branch estimator present',          test: workbenchNew.indexOf("tab === 'estimator' ?") !== -1 },
  { name: 'workbench: render branch estimator_q present',        test: workbenchNew.indexOf("tab === 'estimator_questionnaire' ?") !== -1 },
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
  process.exit(1);
}

// ----- Backup both files -----
const bkLL = TARGETS.leadsList + '.backup_' + stamp;
const bkWB = TARGETS.workbench + '.backup_' + stamp;
fs.copyFileSync(TARGETS.leadsList, bkLL);
fs.copyFileSync(TARGETS.workbench, bkWB);
console.log('Backups:');
console.log('  ' + path.basename(bkLL) + ' (' + fs.statSync(bkLL).size + ' bytes)');
console.log('  ' + path.basename(bkWB) + ' (' + fs.statSync(bkWB).size + ' bytes)');

// ----- Write both -----
fs.writeFileSync(TARGETS.leadsList, leadsListNew, 'utf8');
fs.writeFileSync(TARGETS.workbench, workbenchNew, 'utf8');
console.log('');
console.log('Wrote: ' + path.relative(ROOT, TARGETS.leadsList) + ' (' + fs.statSync(TARGETS.leadsList).size + ' bytes)');
console.log('Wrote: ' + path.relative(ROOT, TARGETS.workbench) + ' (' + fs.statSync(TARGETS.workbench).size + ' bytes)');