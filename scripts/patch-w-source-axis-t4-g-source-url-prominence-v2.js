#!/usr/bin/env node
/**
 * patch-w-source-axis-t4-g-source-url-prominence-v2.js
 *
 * Re-issue of v1 with corrected Change 4 anchor.
 *
 * Verified state on disk before issuing v2:
 *   workbench  — no Change 1/2/3 markers; legacy anchors all intact
 *   leadsList  — no arrow; {src.label} present exactly once at L576;
 *                pill render is T4-c shaped (label + conditional <a> wrap)
 *
 * v1 used '      {src.label}\n    </span>' (pre-T4-c indent/no-blank-line)
 * v2 uses just '{src.label}' (unique-token anchor, count enforced ==1)
 *
 * Backup ordering tightened: backups created BEFORE any in-memory mutation,
 * so a mid-script abort leaves a clean rollback point on disk.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = {
  workbench: path.join(ROOT, 'app', 'admin-homes', 'leads', '[id]', 'LeadWorkbenchClient.tsx'),
  leadsList: path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx'),
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

// ----- Read originals -----
const wbOrig = fs.readFileSync(TARGETS.workbench, 'utf8');
const llOrig = fs.readFileSync(TARGETS.leadsList, 'utf8');

// ----- Backups FIRST (Rule Zero: backup before any modification) -----
const bkWB = TARGETS.workbench + '.backup_' + stamp;
const bkLL = TARGETS.leadsList + '.backup_' + stamp;
fs.copyFileSync(TARGETS.workbench, bkWB);
fs.copyFileSync(TARGETS.leadsList, bkLL);
console.log('Backups:');
console.log('  ' + path.basename(bkWB) + ' (' + fs.statSync(bkWB).size + ' bytes)');
console.log('  ' + path.basename(bkLL) + ' (' + fs.statSync(bkLL).size + ' bytes)');

let wbText = wbOrig;
let llText = llOrig;

// ----- Change 1: Overview tab Source URL block enhancement -----
const OV_OLD =
  '        {anchorLead.source_url && (\n' +
  '          <div className="mt-3 text-sm">\n' +
  '            <span className="text-xs text-gray-400">Source URL: </span>\n' +
  '            <a href={anchorLead.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">\n' +
  '              {anchorLead.source_url}\n' +
  '            </a>\n' +
  '          </div>\n' +
  '        )}';

const OV_NEW =
  '        <div className="mt-4">\n' +
  '          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Source URL</div>\n' +
  '          <div className="text-sm break-all">\n' +
  '            {anchorLead.source_url ? (\n' +
  '              <a href={anchorLead.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">\n' +
  '                {anchorLead.source_url} \u2197\n' +
  '              </a>\n' +
  '            ) : (\n' +
  '              <span className="text-gray-400">\u2014</span>\n' +
  '            )}\n' +
  '          </div>\n' +
  '        </div>';

if (wbText.indexOf('uppercase tracking-wider mb-1">Source URL') !== -1) {
  console.log('Change 1 (Overview Source URL): already enhanced; skipping.');
} else {
  const ovCount = wbText.split(OV_OLD).length - 1;
  console.log('Change 1 (Overview Source URL) anchor count: ' + ovCount);
  if (ovCount !== 1) {
    console.error('Overview Source URL anchor not unique. Aborting (backups preserved).');
    process.exit(1);
  }
  wbText = wbText.replace(OV_OLD, OV_NEW);
  console.log('Change 1 applied.');
}

// ----- Change 2: Estimator tab — insert Source URL before "Estimator Submission" -----
const EST_HEADING_RE = /(\s*)<h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Estimator Submission<\/h3>/;

if (wbText.indexOf('Submitted from ') !== -1) {
  console.log('Change 2 (Estimator tab Source URL): already inserted; skipping.');
} else {
  const m = wbText.match(EST_HEADING_RE);
  if (!m) {
    console.error('Estimator Submission heading anchor not matched. Aborting (backups preserved).');
    process.exit(1);
  }
  const indent = m[1];
  const insert =
    indent + '{anchorLead.source_url && (\n' +
    indent + '  <div className="text-sm">\n' +
    indent + '    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted from </span>\n' +
    indent + '    <a href={anchorLead.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">\n' +
    indent + '      {anchorLead.source_url} \u2197\n' +
    indent + '    </a>\n' +
    indent + '  </div>\n' +
    indent + ')}\n' +
    indent + '<h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Estimator Submission</h3>';
  wbText = wbText.replace(EST_HEADING_RE, insert);
  console.log('Change 2 applied.');
}

// ----- Change 3: Estimator Q tab — insert Source URL before "Estimator Questionnaire" -----
const ESTQ_HEADING_RE = /(\s*)<h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Estimator Questionnaire<\/h3>/;

if ((wbText.match(/Submitted from /g) || []).length >= 2) {
  console.log('Change 3 (Estimator Q tab Source URL): already inserted; skipping.');
} else {
  const m = wbText.match(ESTQ_HEADING_RE);
  if (!m) {
    console.error('Estimator Questionnaire heading anchor not matched. Aborting (backups preserved).');
    process.exit(1);
  }
  const indent = m[1];
  const insert =
    indent + '{anchorLead.source_url && (\n' +
    indent + '  <div className="text-sm">\n' +
    indent + '    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted from </span>\n' +
    indent + '    <a href={anchorLead.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">\n' +
    indent + '      {anchorLead.source_url} \u2197\n' +
    indent + '    </a>\n' +
    indent + '  </div>\n' +
    indent + ')}\n' +
    indent + '<h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Estimator Questionnaire</h3>';
  wbText = wbText.replace(ESTQ_HEADING_RE, insert);
  console.log('Change 3 applied.');
}

// ----- Change 4 (v2): leads-list pill arrow — anchor on unique {src.label} -----
const PILL_OLD = '{src.label}';
const PILL_NEW = "{src.label}{lead.source_url ? ' \u2197' : ''}";

if (llText.indexOf("lead.source_url ? ' \u2197'") !== -1) {
  console.log('Change 4 (leads-list pill arrow): already applied; skipping.');
} else {
  const pillCount = llText.split(PILL_OLD).length - 1;
  console.log('Change 4 (leads-list pill arrow) {src.label} anchor count: ' + pillCount);
  if (pillCount !== 1) {
    console.error('Leads-list {src.label} anchor not unique (expected 1, got ' + pillCount + '). Aborting (backups preserved).');
    process.exit(1);
  }
  llText = llText.replace(PILL_OLD, PILL_NEW);
  console.log('Change 4 applied.');
}

// ----- Post-build assertions -----
const checks = [
  { name: 'workbench: Overview Source URL block enhanced',           test: wbText.indexOf('uppercase tracking-wider mb-1">Source URL') !== -1 },
  { name: 'workbench: em-dash placeholder for null source_url',      test: wbText.indexOf('<span className="text-gray-400">\u2014</span>') !== -1 },
  { name: 'workbench: legacy short-form conditional removed',        test: wbText.indexOf('<span className="text-xs text-gray-400">Source URL: </span>') === -1 },
  { name: 'workbench: "Submitted from " row appears >= 2 times',     test: (wbText.match(/Submitted from /g) || []).length >= 2 },
  { name: 'workbench: arrow icon \u2197 present',                    test: wbText.indexOf('\u2197') !== -1 },
  { name: 'workbench: Estimator Submission heading still present',   test: wbText.indexOf('>Estimator Submission</h3>') !== -1 },
  { name: 'workbench: Estimator Questionnaire heading still present',test: wbText.indexOf('>Estimator Questionnaire</h3>') !== -1 },
  { name: 'leadsList: pill arrow conditional present',               test: llText.indexOf("lead.source_url ? ' \u2197'") !== -1 },
  { name: 'leadsList: still exactly one {src.label} render',         test: (llText.split('{src.label}').length - 1) === 1 },
  { name: 'leadsList: existing source_url <a> wrap preserved',       test: llText.indexOf('inline-block hover:opacity-80') !== -1 },
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
  console.error('FAILED ' + failed + ' assertion(s) -- refusing to write to disk (backups preserved)');
  process.exit(1);
}

// ----- Write -----
fs.writeFileSync(TARGETS.workbench, wbText, 'utf8');
fs.writeFileSync(TARGETS.leadsList, llText, 'utf8');
console.log('');
console.log('Wrote: ' + path.relative(ROOT, TARGETS.workbench) + ' (' + fs.statSync(TARGETS.workbench).size + ' bytes, was ' + Buffer.byteLength(wbOrig, 'utf8') + ')');
console.log('Wrote: ' + path.relative(ROOT, TARGETS.leadsList) + ' (' + fs.statSync(TARGETS.leadsList).size + ' bytes, was ' + Buffer.byteLength(llOrig, 'utf8') + ')');