// scripts/test-c11-multitenant-regression.js
//
// C11 regression gate: lib/utils/territory.ts is permanently retired.
//
// The file contained getEffectiveTerritories() which hardcoded the literal
// 'WALLiam' as a tenant inheritedFrom fallback. It was orphan code with zero
// callers (verified by 3 independent probes in AP.1 on 2026-05-20). Deleted
// in commit TBD.
//
// This gate asserts:
//   1. The file does not exist on disk
//   2. No source file imports 'lib/utils/territory'
//   3. No source file references the symbol 'getEffectiveTerritories'
//   4. No source file references the types 'EffectiveTerritories' or 'TerritorySource'
//
// Any reintroduction = FAIL. Re-add only via tracker decision + multi-tenant
// safe replacement (resolve tenant.name from DB, not literal).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['lib', 'app', 'components', 'scripts', 'supabase', 'hooks'];
const EXTS = new Set(['.ts', '.tsx']);

const DELETED_FILE = path.join(ROOT, 'lib', 'utils', 'territory.ts');

const FORBIDDEN_PATTERNS = [
  { name: 'import path lib/utils/territory', regex: /lib\/utils\/territory/g },
  { name: 'symbol getEffectiveTerritories', regex: /\bgetEffectiveTerritories\b/g },
  { name: 'type EffectiveTerritories', regex: /\bEffectiveTerritories\b/g },
  { name: 'type TerritorySource', regex: /\bTerritorySource\b/g },
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
      walk(full, files);
    } else if (EXTS.has(path.extname(entry.name))) {
      if (full.endsWith('.backup') || /\.backup_\d+/.test(full)) continue;
      files.push(full);
    }
  }
  return files;
}

let failures = 0;
let assertions = 0;

// Assertion 1: file does not exist
assertions++;
if (fs.existsSync(DELETED_FILE)) {
  console.error(`FAIL [1]: ${DELETED_FILE} exists; it was deleted in C11`);
  failures++;
} else {
  console.log(`PASS [1]: ${path.relative(ROOT, DELETED_FILE)} absent`);
}

// Assertions 2-5: forbidden patterns absent from source tree
const allFiles = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)));

for (const { name, regex } of FORBIDDEN_PATTERNS) {
  assertions++;
  const hits = [];
  for (const f of allFiles) {
    const text = fs.readFileSync(f, 'utf8');
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      hits.push({ file: path.relative(ROOT, f), count: matches.length });
    }
  }
  if (hits.length > 0) {
    console.error(`FAIL [${assertions}]: pattern "${name}" found in ${hits.length} file(s):`);
    for (const h of hits) console.error(`         ${h.file} (${h.count} match${h.count > 1 ? 'es' : ''})`);
    failures++;
  } else {
    console.log(`PASS [${assertions}]: pattern "${name}" absent`);
  }
}

console.log('');
if (failures === 0) {
  console.log(`C11 regression gate: ${assertions}/${assertions} PASS`);
  process.exit(0);
} else {
  console.error(`C11 regression gate: ${failures} of ${assertions} FAILED`);
  process.exit(1);
}