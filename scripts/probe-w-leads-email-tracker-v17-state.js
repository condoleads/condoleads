#!/usr/bin/env node
/**
 * probe-w-leads-email-tracker-v17-state.js
 *
 * READ-ONLY probe of docs/W-LEADS-EMAIL-TRACKER.md to capture exact byte-positions
 * and current text for designing the v17 -> v18 close patch (T6f-C-1 + T6f-C-2
 * paired entry, matching the v15->v16 and v16->v17 pairing pattern).
 *
 * No file modification. No backup needed.
 *
 * Captures:
 *   1. File metadata (path, byte length, line count, line endings)
 *   2. Idempotency check: "v18" must currently be absent
 *   3. Version header line (full content + line number)
 *   4. Status line (full content + line number)
 *   5. T6f-C marker scan (presence of "T6f-C-1" / "T6f-C-2" / "T6f-C CLOSED")
 *   6. Top 5 status log entry headers (insertion-point anchor design)
 *   7. Full v17 entry first line (for anchor design)
 *   8. "Next:" pointer lines (must rewrite from T6f-C -> T6d on v18)
 *   9. T6 phase section header(s)
 *  10. Candidate finding lines for T6f-C closure (WALLIAM-CONTACT,
 *      CHARLIE-VIP-APPROVE, MULTITENANT-DEBT, HARDCODED-WALLIAM patterns)
 */

const fs = require('fs');
const path = require('path');

const TRACKER = path.resolve('docs/W-LEADS-EMAIL-TRACKER.md');

if (!fs.existsSync(TRACKER)) {
  console.error('FAIL: tracker not found at ' + TRACKER);
  process.exit(1);
}

const raw = fs.readFileSync(TRACKER, 'utf8');
const usesCRLF = /\r\n/.test(raw);
const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw;
const lines = content.split('\n');

console.log('=== 1. File metadata ===');
console.log('Path:  ' + path.relative(process.cwd(), TRACKER));
console.log('Bytes: ' + Buffer.byteLength(raw, 'utf8'));
console.log('Lines: ' + lines.length + ' (LF-normalized)');
console.log('LE:    ' + (usesCRLF ? 'CRLF' : 'LF'));
console.log('');

console.log('=== 2. Idempotency check (v18 must be absent) ===');
const v18Count = (content.match(/v18/g) || []).length;
console.log('Occurrences of "v18": ' + v18Count + (v18Count === 0 ? ' (CLEAN - OK to proceed)' : ' (NONZERO - INVESTIGATE)'));
console.log('');

console.log('=== 3. Version header line ===');
const versionLineIdx = lines.findIndex(l => /^\*\*Version:\*\*/.test(l));
if (versionLineIdx >= 0) {
  console.log('L' + (versionLineIdx + 1) + ' length=' + lines[versionLineIdx].length);
  console.log('CONTENT: ' + lines[versionLineIdx]);
} else {
  console.log('NOT FOUND - version line pattern missing');
}
console.log('');

console.log('=== 4. Status line (full content) ===');
const statusLineIdx = lines.findIndex(l => /^\*\*Status:\*\*/.test(l));
if (statusLineIdx >= 0) {
  console.log('L' + (statusLineIdx + 1) + ' length=' + lines[statusLineIdx].length);
  console.log('CONTENT: ' + lines[statusLineIdx]);
} else {
  console.log('NOT FOUND - status line pattern missing');
}
console.log('');

console.log('=== 5. T6f-C marker scan ===');
const markers = ['T6f-C-1', 'T6f-C-2', 'T6f-C SHIPPED', 'T6f-C CLOSED', 'T6f-C FULLY CLOSED', 'T6f-B FULLY CLOSED', 'T6f-B-3', 'T6f-B-4'];
for (const m of markers) {
  const re = new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const occ = (content.match(re) || []).length;
  console.log('  "' + m + '": ' + occ);
}
console.log('');

console.log('=== 6. Top 5 status log entry headers (newest first) ===');
const entryStartRe = /^- \*\*2026-\d{2}-\d{2} v\d+ /;
const entryLineIdxs = [];
for (let i = 0; i < lines.length; i++) {
  if (entryStartRe.test(lines[i])) entryLineIdxs.push(i);
}
console.log('Total entries found: ' + entryLineIdxs.length);
for (let n = 0; n < Math.min(5, entryLineIdxs.length); n++) {
  const idx = entryLineIdxs[n];
  const line = lines[idx];
  const head = line.slice(0, 200);
  console.log('  [' + n + '] L' + (idx + 1) + ' len=' + line.length + ': ' + head + (line.length > 200 ? '...[+' + (line.length - 200) + ']' : ''));
}
console.log('');

console.log('=== 7. v17 entry full first-line ===');
const v17EntryIdx = lines.findIndex(l => /^- \*\*2026-\d{2}-\d{2} v17 /.test(l));
if (v17EntryIdx >= 0) {
  console.log('L' + (v17EntryIdx + 1) + ' length=' + lines[v17EntryIdx].length);
  console.log('FULL LINE:');
  console.log(lines[v17EntryIdx]);
} else {
  console.log('NOT FOUND - no v17 entry');
}
console.log('');

console.log('=== 8. "Next:" pointer lines ===');
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/^\s*\*\*Next:\*\*|^\s*Next:|^### Next|^\s*- \*\*Next:/.test(l)) {
    console.log('  L' + (i + 1) + ' len=' + l.length + ': ' + l.slice(0, 260) + (l.length > 260 ? '...[+' + (l.length - 260) + ']' : ''));
  }
}
console.log('');

console.log('=== 9. T6 phase section headers ===');
for (let i = 0; i < lines.length; i++) {
  if (/^#{2,4}\s+T6/.test(lines[i])) {
    console.log('  L' + (i + 1) + ': ' + lines[i]);
  }
}
console.log('');

console.log('=== 10. Candidate finding lines for T6f-C closure ===');
const findingPatterns = [
  { name: 'WALLIAM-CONTACT',      re: /F-WALLIAM-CONTACT/i },
  { name: 'CHARLIE-VIP-APPROVE',  re: /F-CHARLIE-VIP-APPROVE/i },
  { name: 'VIP-APPROVE-PATTERN',  re: /F-VIP-APPROVE-PATTERN/i },
  { name: 'ESTIMATOR-VIP-APPROVE',re: /F-ESTIMATOR-VIP-APPROVE/i },
  { name: 'ESTIMATOR-VIP-REQUEST',re: /F-ESTIMATOR-VIP-REQUEST/i },
  { name: 'MULTITENANT-DEBT',     re: /MULTITENANT-DEBT/i },
  { name: 'HARDCODED-WALLIAM',    re: /HARDCODED-WALLIAM/i },
  { name: 'WALLIAM-AGENT-NAME-FALLBACK', re: /WALLIAM-AGENT-NAME-FALLBACK/i },
];
const hits = new Map();
for (let i = 0; i < lines.length; i++) {
  for (const p of findingPatterns) {
    if (p.re.test(lines[i])) {
      if (!hits.has(i)) hits.set(i, []);
      hits.get(i).push(p.name);
    }
  }
}
console.log('Hit count: ' + hits.size);
for (const [i, tags] of [...hits.entries()].sort((a, b) => a[0] - b[0])) {
  console.log('  L' + (i + 1) + ' [' + tags.join(',') + ']: ' + lines[i].slice(0, 240) + (lines[i].length > 240 ? '...[+' + (lines[i].length - 240) + ']' : ''));
}
console.log('');

console.log('=== Probe complete ===');