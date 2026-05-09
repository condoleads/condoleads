// scripts/r-territory-t4c-3-phase-1-mobile.js
//
// T4c-3 Phase 1: mobile responsive (component-only edit).
//
// Per design lock v18 Q1=1: horizontal scroll matrix with sticky first column.
// Existing component already ships:
//   - wrapper overflow-x-auto
//   - thead first column sticky-left + min-w-[180px]
//   - body first column sticky-left
//   - per-column min-w-[80px]
// Phase 1 adds what's missing for tall matrices + phone tap targets:
//   - sticky-top thead (header stays visible during vertical scroll)
//   - max-h-[80vh] on wrapper (anchor for sticky-top + bounded internal scroll)
//   - z-index hierarchy for two-axis sticky intersection
//   - cell tap target h-10 sm:h-7 (40px mobile / 28px desktop)

const fs = require('fs');
const path = require('path');

const FILE = path.join('components', 'admin-homes', 'TerritoryMatrix.tsx');

function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }

if (!fs.existsSync(FILE)) fail(FILE + ' not found at ' + path.resolve(FILE));

const original = fs.readFileSync(FILE, 'utf8');

const PHASE1_MARKERS = ['max-h-[80vh]', 'sticky top-0 z-20', 'h-10 sm:h-7'];
const present = PHASE1_MARKERS.filter(function (m) { return original.indexOf(m) !== -1; });
if (present.length > 0) {
  console.log('SKIP: Phase 1 markers already present: ' + present.join(', '));
  process.exit(0);
}

const now = new Date();
const pad = function (n) { return String(n).padStart(2, '0'); };
const stamp =
  now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' +
  pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
const backupPath = FILE + '.backup_' + stamp;
fs.writeFileSync(backupPath, original);
console.log('Backup: ' + backupPath + ' (' + original.length + ' chars)');

let content = original;

function tryEdit(label, oldStr, newStr) {
  const count = content.split(oldStr).length - 1;
  if (count !== 1) {
    fail(label + ': expected exactly 1 match, found ' + count + ' for anchor:\n' + oldStr);
  }
  content = content.replace(oldStr, newStr);
  console.log(label + ' OK');
}

tryEdit(
  'E1 wrapper',
  '<div className="border rounded bg-white overflow-x-auto">',
  '<div className="border rounded bg-white overflow-auto max-h-[80vh]">'
);

tryEdit(
  'E2 thead sticky-top',
  '<thead className="bg-gray-50 border-b">',
  '<thead className="bg-gray-50 border-b sticky top-0 z-20">'
);

tryEdit(
  'E3 thead first col z-30',
  '<th className="text-left p-2 sticky left-0 bg-gray-50 z-10 min-w-[180px]">Agent</th>',
  '<th className="text-left p-2 sticky left-0 bg-gray-50 z-30 min-w-[180px]">Agent</th>'
);

tryEdit(
  'E4 CellButton tap target',
  'className={`w-12 h-7 rounded ${bg} flex items-center justify-center transition-colors disabled:cursor-not-allowed`}',
  'className={`w-12 h-10 sm:h-7 rounded ${bg} flex items-center justify-center transition-colors disabled:cursor-not-allowed`}'
);

for (const m of PHASE1_MARKERS) {
  if (content.indexOf(m) === -1) fail('Marker missing after edits: ' + m);
}

if (content.indexOf('border rounded bg-white overflow-x-auto') !== -1) {
  fail('Old wrapper class still present.');
}

if (content.indexOf('sticky left-0 bg-gray-50 z-10 min-w-[180px]') !== -1) {
  fail('Old thead first col z-index still present.');
}

fs.writeFileSync(FILE, content, 'utf8');
console.log('WRITE OK: ' + FILE + ' (' + content.length + ' chars, delta: ' + (content.length - original.length) + ')');
console.log('DONE: T4c-3 Phase 1 (mobile responsive) applied.');
