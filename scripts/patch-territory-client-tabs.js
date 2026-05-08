// scripts/patch-territory-client-tabs.js
//
// T4c-2 close: add tabs (Coverage / Matrix / Audit) to TerritoryClient.tsx.
// 5 surgical patches. Atomic, idempotent, line-ending-adaptive, backup-on-write.

const fs = require('fs');
const path = require('path');

const FILE = path.join('components', 'admin-homes', 'TerritoryClient.tsx');

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail(FILE + ' not found at ' + path.resolve(FILE));

const original = fs.readFileSync(FILE, 'utf8');

if (original.includes("import TerritoryMatrix from './TerritoryMatrix'")) {
  console.log('SKIP: TerritoryMatrix already imported. Tabs already applied.');
  process.exit(0);
}

// Detect file's line ending mode and use it consistently for all inserted content.
const NL = original.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
console.log('Detected line endings: ' + (NL === '\r\n' ? 'CRLF' : 'LF'));

const now = new Date();
const pad = function (n) { return String(n).padStart(2, '0'); };
const stamp =
  now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' +
  pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
const backupPath = FILE + '.backup_' + stamp;
fs.writeFileSync(backupPath, original);
console.log('Backup: ' + backupPath + ' (' + original.length + ' chars)');

let content = original;

function applyExact(label, oldStr, newStr) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    fail(label + ': anchor not found.\n  First 200 chars expected:\n    ' +
         oldStr.slice(0, 200).replace(/\r?\n/g, ' [NL] '));
  }
  const next = content.indexOf(oldStr, idx + 1);
  if (next !== -1) {
    fail(label + ': anchor matches at offsets ' + idx + ' and ' + next + ' -- not unique.');
  }
  content = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
  console.log(label + ': OK (delta ' + (newStr.length - oldStr.length) + ' chars)');
}

applyExact(
  'P1 import',
  "import { MapPin, Activity, Users, Star } from 'lucide-react'",
  "import { MapPin, Activity, Users, Star } from 'lucide-react'" + NL +
  "import TerritoryMatrix from './TerritoryMatrix'"
);

applyExact(
  'P2 activeTab state',
  "  const [coverage, setCoverage] = useState<CoverageRow[]>([])",
  "  const [activeTab, setActiveTab] = useState<'coverage' | 'matrix' | 'audit'>('coverage')" + NL +
  "  const [coverage, setCoverage] = useState<CoverageRow[]>([])"
);

const TABS_UI =
  '      <div className="border-b mb-4">' + NL +
  '        <nav className="flex gap-1">' + NL +
  "          <button type=\"button\" onClick={() => setActiveTab('coverage')} className={'px-3 py-2 text-sm font-medium border-b-2 transition-colors ' + (activeTab === 'coverage' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900')}>Coverage</button>" + NL +
  "          <button type=\"button\" onClick={() => setActiveTab('matrix')} className={'px-3 py-2 text-sm font-medium border-b-2 transition-colors ' + (activeTab === 'matrix' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900')}>Matrix</button>" + NL +
  "          <button type=\"button\" onClick={() => setActiveTab('audit')} className={'px-3 py-2 text-sm font-medium border-b-2 transition-colors ' + (activeTab === 'audit' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900')}>Audit log</button>" + NL +
  '        </nav>' + NL +
  '      </div>';

const P3_OLD =
  '      </div>' + NL + NL +
  '      <section className="mb-8">' + NL +
  '        <div className="flex items-center justify-between mb-3">' + NL +
  '          <h2 className="text-lg font-semibold">Coverage</h2>';

const P3_NEW =
  '      </div>' + NL + NL +
  TABS_UI + NL + NL +
  "      {activeTab === 'coverage' && (" + NL +
  '      <section className="mb-8">' + NL +
  '        <div className="flex items-center justify-between mb-3">' + NL +
  '          <h2 className="text-lg font-semibold">Coverage</h2>';

applyExact('P3 tabs UI + coverage open', P3_OLD, P3_NEW);

const P4_OLD =
  '      </section>' + NL + NL +
  '      <section>' + NL +
  '        <div className="flex items-center justify-between mb-3">' + NL +
  '          <h2 className="text-lg font-semibold">Audit Log</h2>';

const P4_NEW =
  '      </section>' + NL +
  '      )}' + NL + NL +
  "      {activeTab === 'matrix' && tenantId && (" + NL +
  '        <TerritoryMatrix tenantId={tenantId} tenantName={tenantName} />' + NL +
  '      )}' + NL + NL +
  "      {activeTab === 'audit' && (" + NL +
  '      <section>' + NL +
  '        <div className="flex items-center justify-between mb-3">' + NL +
  '          <h2 className="text-lg font-semibold">Audit Log</h2>';

applyExact('P4 close coverage + matrix + open audit', P4_OLD, P4_NEW);

const P5_OLD =
  '      </section>' + NL +
  '    </div>' + NL +
  '  )' + NL +
  '}';

const P5_NEW =
  '      </section>' + NL +
  '      )}' + NL +
  '    </div>' + NL +
  '  )' + NL +
  '}';

applyExact('P5 close audit conditional', P5_OLD, P5_NEW);

fs.writeFileSync(FILE, content, 'utf8');
console.log('');
console.log('TerritoryClient.tsx updated:');
console.log('  was:   ' + original.length + ' chars');
console.log('  now:   ' + content.length + ' chars');
console.log('  delta: +' + (content.length - original.length));
console.log('Backup: ' + backupPath);