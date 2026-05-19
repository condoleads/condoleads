// scripts/patch-w-leads-workbench-w6c-c-remove-qualified-status.js
// W6c-c: remove `qualified` from the System 2 status axis UI in
// components/admin-homes/AdminHomesLeadsClient.tsx. Three anchor removals:
//   1. statusColor map entry
//   2. Status filter dropdown option
//   3. Inline row status select option
//
// Schema is INTENTIONALLY NOT migrated. System 1 (/admin, /dashboard,
// lib/actions/lead-management.ts) still creates leads with status='qualified'
// and the DB CHECK must continue to accept it. Effect: prevent NEW qualified-
// status leads from being SET via System 2's UI; legacy + System 1 paths
// unaffected. Current data has 0 rows at status='qualified', so no visual
// regression on legacy rendering today.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}
function detectLE(content) { return content.includes('\r\n') ? '\r\n' : '\n'; }
function withLE(text, le) { return text.replace(/\r\n/g, '\n').replace(/\n/g, le); }
function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyAnchors(filePath, anchors) {
  const absPath = path.join(ROOT, filePath);
  if (!fs.existsSync(absPath)) throw new Error('FILE NOT FOUND: ' + filePath);
  let content = fs.readFileSync(absPath, 'utf8');
  const le = detectLE(content);

  for (let i = 0; i < anchors.length; i++) {
    const oldN = withLE(anchors[i].old, le);
    const n = countOccurrences(content, oldN);
    if (n !== 1) throw new Error('ANCHOR ' + (i + 1) + '/' + anchors.length + ' on ' + filePath + ' matched ' + n + ' (expected 1). First 80: ' + JSON.stringify(oldN.slice(0, 80)));
  }

  const stamp = nowStamp();
  const backupPath = absPath + '.backup_' + stamp;
  fs.copyFileSync(absPath, backupPath);

  for (let i = 0; i < anchors.length; i++) {
    content = content.replace(withLE(anchors[i].old, le), withLE(anchors[i].new, le));
  }
  fs.writeFileSync(absPath, content, 'utf8');
  console.log('  PATCHED ' + filePath + ' (' + anchors.length + ' anchors, backup: ' + path.basename(backupPath) + ')');
}

console.log('[1/1] Removing qualified from System 2 status axis ...');
applyAnchors('components/admin-homes/AdminHomesLeadsClient.tsx', [
  {
    // Anchor 1: statusColor map - drop the qualified entry
    old:
'  const statusColor = (s: string) => ({\n' +
'    new: \'bg-blue-100 text-blue-800\',\n' +
'    contacted: \'bg-yellow-100 text-yellow-800\',\n' +
'    qualified: \'bg-green-100 text-green-800\',\n' +
'    meeting_scheduled: \'bg-purple-100 text-purple-800\',\n',
    new:
'  const statusColor = (s: string) => ({\n' +
'    new: \'bg-blue-100 text-blue-800\',\n' +
'    contacted: \'bg-yellow-100 text-yellow-800\',\n' +
'    meeting_scheduled: \'bg-purple-100 text-purple-800\',\n',
  },
  {
    // Anchor 2: Status filter dropdown (14-space indent; "All" preceding makes it unique vs inline)
    old:
'              <option value="all">All</option>\n' +
'              <option value="new">New</option>\n' +
'              <option value="contacted">Contacted</option>\n' +
'              <option value="qualified">Qualified</option>\n' +
'              <option value="meeting_scheduled">Meeting Scheduled</option>\n',
    new:
'              <option value="all">All</option>\n' +
'              <option value="new">New</option>\n' +
'              <option value="contacted">Contacted</option>\n' +
'              <option value="meeting_scheduled">Meeting Scheduled</option>\n',
  },
  {
    // Anchor 3: Inline row status select (24-space indent; no "All" precedes)
    old:
'                        <option value="new">New</option>\n' +
'                        <option value="contacted">Contacted</option>\n' +
'                        <option value="qualified">Qualified</option>\n' +
'                        <option value="meeting_scheduled">Meeting Scheduled</option>\n',
    new:
'                        <option value="new">New</option>\n' +
'                        <option value="contacted">Contacted</option>\n' +
'                        <option value="meeting_scheduled">Meeting Scheduled</option>\n',
  },
]);

console.log('');
console.log('Done. Run npx tsc --noEmit, then refresh /admin-homes/leads to verify.');