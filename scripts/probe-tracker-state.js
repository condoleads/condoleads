// scripts/probe-tracker-state.js
// Read-only probe. Reports actual v10/v11 state in W-TERRITORY-TRACKER.md.
// No writes. No mutations.

const fs = require('fs');
const path = require('path');

const TRACKER = path.join('docs', 'W-TERRITORY-TRACKER.md');
const content = fs.readFileSync(TRACKER, 'utf8');

console.log('File size:', content.length, 'chars');
console.log('First 200 chars:', JSON.stringify(content.slice(0, 200)));
console.log('');

function countOccurrences(needle) {
  let count = 0;
  let idx = 0;
  while ((idx = content.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

function findAllPositions(needle) {
  const positions = [];
  let idx = 0;
  while ((idx = content.indexOf(needle, idx)) !== -1) {
    positions.push(idx);
    idx += needle.length;
  }
  return positions;
}

const probes = [
  '- **2026-05-07 v10**',
  '- **2026-05-07 v11**',
  '2026-05-07 v10',
  '2026-05-07 v11',
  'T6-followup-A',
  'T6-followup-B',
  'T6-followup-C',
  'F-APA-NEIGHBOURHOOD-CHECK',
  'F-APA-NEIGHBOURHOOD-CHECK migration',
  'F-APA-UPDATE-AUDIT-GAP',
  'F-RACE-DEADLOCK',
  '### 1. ',
  '### 2. ',
  '### 3. ',
  '**Status:**',
  'race-safety harness',
  'Race-safety harness',
];

console.log('Pattern occurrence counts:');
for (const p of probes) {
  console.log('  [' + countOccurrences(p) + '] ' + JSON.stringify(p));
}
console.log('');

// Look for duplicated section headers (the v10 bug signature)
console.log('### section header positions and content (first 80 chars):');
const headerRegex = /^### .+$/gm;
let m;
const headers = [];
while ((m = headerRegex.exec(content)) !== null) {
  headers.push({ pos: m.index, text: m[0] });
}
for (const h of headers) {
  console.log('  @' + h.pos + ': ' + h.text.slice(0, 100));
}
console.log('');

// Look for back-to-back duplicate ### headers (v10 bug signature)
console.log('Back-to-back duplicate ### headers (v10 bug signature):');
let foundDup = false;
for (let i = 1; i < headers.length; i++) {
  if (headers[i].text === headers[i-1].text) {
    console.log('  DUPLICATE: ' + headers[i].text + ' at @' + headers[i-1].pos + ' and @' + headers[i].pos);
    foundDup = true;
  }
}
if (!foundDup) console.log('  none found');
console.log('');

// Show status line
const statusIdx = content.indexOf('**Status:**');
if (statusIdx !== -1) {
  console.log('Status line (first 500 chars from **Status:**):');
  console.log('  ' + content.slice(statusIdx, statusIdx + 500).replace(/\n/g, '\n  '));
}
console.log('');

// Show top of status log (after first ## Status log heading or similar)
const statusLogIdx = content.toLowerCase().indexOf('status log');
if (statusLogIdx !== -1) {
  console.log('Status log section (1500 chars from heading):');
  console.log(content.slice(statusLogIdx, statusLogIdx + 1500));
}
console.log('');

// Char distribution check (BOM? CRLF? unusual encoding?)
const firstChar = content.charCodeAt(0);
console.log('First char code:', firstChar, firstChar === 0xFEFF ? '(BOM detected)' : '(no BOM)');
const crlfCount = (content.match(/\r\n/g) || []).length;
const lfOnlyCount = (content.match(/(?<!\r)\n/g) || []).length;
console.log('CRLF count:', crlfCount, '| LF-only count:', lfOnlyCount);