// scripts/test-c12-multitenant-regression.js
//
// W-MULTITENANT-BENCH P2.C12 — Aggregate regression gate (final P2 seal).
//
// Two-layer test:
//   Layer 1 — Per-phase replay. Spawns all 13 per-phase regression scripts
//             (C1–C11 including C8a, C8b-2, C8f). Aggregates pass/fail.
//   Layer 2 — Cross-cutting global assertions that span phase boundaries.
//             Catches new instances of retired defect classes that no single
//             per-phase gate would notice.
//
// Locked-lists (verified 2026-05-20 via AV.1.0 probes — every entry has a
// real file:line and a documented reason):
//
//   UUID_LOCKED_LIST (C8c-tracked smell, refactor planned post-C12):
//     components/navigation/SiteHeaderClient.tsx:13
//     components/HomePageComprehensiveClient.tsx:30
//     components/HomePageComprehensiveClientV2.tsx:32
//
//   BRAND_FALLBACK_LOCKED_LIST (intentional template defaults):
//     app/comprehensive-site/about/page.tsx:15
//     app/comprehensive-site/contact/page.tsx:12 + :23
//     app/comprehensive-site/privacy/page.tsx:14
//     app/comprehensive-site/terms/page.tsx:14
//     lib/tenant/default-content.ts:26 + :84 + :206 (uses f(tenant.name, 'WALLiam') helper instead of || syntax — semantically equivalent fallback)
//
// Failure exit: 1. Pass exit: 0.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

const PER_PHASE_SCRIPTS = [
  'test-c1-multitenant-regression.js',
  'test-c2-multitenant-regression.js',
  'test-c3-multitenant-regression.js',
  'test-c4-multitenant-regression.js',
  'test-c5-multitenant-regression.js',
  'test-c6-multitenant-regression.js',
  'test-c7-multitenant-regression.js',
  'test-c8a-multitenant-regression.js',
  'test-c8b-2-multitenant-regression.js',
  'test-c8f-multitenant-regression.js',
  'test-c9-multitenant-regression.js',
  'test-c10-multitenant-regression.js',
  'test-c11-multitenant-regression.js',
];

const UUID_LITERAL = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const UUID_LOCKED_LIST = new Set([
  'components/navigation/SiteHeaderClient.tsx',
  'components/HomePageComprehensiveClient.tsx',
  'components/HomePageComprehensiveClientV2.tsx',
]);

const BRAND_FALLBACK_LOCKED_LIST = new Set([
  'app/comprehensive-site/about/page.tsx',
  'app/comprehensive-site/contact/page.tsx',
  'app/comprehensive-site/privacy/page.tsx',
  'app/comprehensive-site/terms/page.tsx',
  'lib/tenant/default-content.ts',
]);

const SCAN_DIRS = ['lib', 'app', 'components', 'hooks'];
const EXTS = new Set(['.ts', '.tsx']);

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

function relPosix(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}

let totalPasses = 0;
let totalFailures = 0;
const failedScripts = [];
const failedAssertions = [];

console.log('');
console.log('==========================================================');
console.log('  W-MULTITENANT-BENCH P2.C12 — Aggregate Regression Gate');
console.log('==========================================================');
console.log('');

// ============================================================
// LAYER 1 — Per-phase replay
// ============================================================
console.log('--- LAYER 1: Per-phase regression replay ---');
console.log('');

for (const scriptName of PER_PHASE_SCRIPTS) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  if (!fs.existsSync(scriptPath)) {
    console.error(`  FAIL [${scriptName}]: script not found on disk`);
    totalFailures++;
    failedScripts.push(scriptName);
    continue;
  }
  const result = spawnSync('node', [scriptPath], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status === 0) {
    // Parse pass count from stdout if present
    const passMatch = result.stdout.match(/(\d+)\s*PASS/);
    const passCount = passMatch ? passMatch[1] : '?';
    console.log(`  PASS [${scriptName}] (${passCount} assertions)`);
    totalPasses++;
  } else {
    console.error(`  FAIL [${scriptName}] (exit ${result.status})`);
    if (result.stdout) {
      const lines = result.stdout.split(/\r?\n/).filter(l => l.includes('FAIL'));
      for (const l of lines) console.error(`    ${l.trim()}`);
    }
    totalFailures++;
    failedScripts.push(scriptName);
  }
}

console.log('');

// ============================================================
// LAYER 2 — Cross-cutting global assertions
// ============================================================
console.log('--- LAYER 2: Cross-cutting global assertions ---');
console.log('');

const allFiles = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)));

// L2.1: WALLiam UUID outside locked-list
{
  const label = 'L2.1: WALLiam UUID outside locked-list (C8c-tracked)';
  const offenders = [];
  for (const f of allFiles) {
    const rel = relPosix(f);
    if (UUID_LOCKED_LIST.has(rel)) continue;
    const text = fs.readFileSync(f, 'utf8');
    if (text.includes(UUID_LITERAL)) {
      const lineNo = text.slice(0, text.indexOf(UUID_LITERAL)).split('\n').length;
      offenders.push(`${rel}:${lineNo}`);
    }
  }
  if (offenders.length === 0) {
    console.log(`  PASS [${label}]`);
    totalPasses++;
  } else {
    console.error(`  FAIL [${label}] — ${offenders.length} unauthorized occurrence(s):`);
    for (const o of offenders) console.error(`    ${o}`);
    totalFailures++;
    failedAssertions.push(label);
  }
}

// L2.2: `|| 'WALLiam'` fallback outside locked-list
{
  const label = "L2.2: || 'WALLiam' fallback outside locked-list (intentional template defaults)";
  const pattern = /\|\|\s*['"]WALLiam['"]/g;
  const offenders = [];
  for (const f of allFiles) {
    const rel = relPosix(f);
    if (BRAND_FALLBACK_LOCKED_LIST.has(rel)) continue;
    const text = fs.readFileSync(f, 'utf8');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const lineNo = text.slice(0, match.index).split('\n').length;
      offenders.push(`${rel}:${lineNo}`);
    }
    pattern.lastIndex = 0;
  }
  if (offenders.length === 0) {
    console.log(`  PASS [${label}]`);
    totalPasses++;
  } else {
    console.error(`  FAIL [${label}] — ${offenders.length} unauthorized occurrence(s):`);
    for (const o of offenders) console.error(`    ${o}`);
    totalFailures++;
    failedAssertions.push(label);
  }
}

// L2.3: app/api/admin-homes clean of WALLiam literals
{
  const label = 'L2.3: app/api/admin-homes free of WALLiam/WALLIAM/walliam literals (non-comment)';
  const apiDir = path.join(ROOT, 'app', 'api', 'admin-homes');
  const apiFiles = fs.existsSync(apiDir) ? walk(apiDir) : [];
  const pattern = /(WALLiam|WALLIAM|walliam)/;
  const offenders = [];
  for (const f of apiFiles) {
    const rel = relPosix(f);
    const text = fs.readFileSync(f, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip pure comment lines
      if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
      if (pattern.test(line)) {
        offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
      }
    }
  }
  if (offenders.length === 0) {
    console.log(`  PASS [${label}]`);
    totalPasses++;
  } else {
    console.error(`  FAIL [${label}] — ${offenders.length} occurrence(s):`);
    for (const o of offenders) console.error(`    ${o}`);
    totalFailures++;
    failedAssertions.push(label);
  }
}

// L2.4: C11 anti-regression — lib/utils/territory.ts stays absent
{
  const label = 'L2.4: lib/utils/territory.ts stays absent (C11 anti-regression)';
  const deletedFile = path.join(ROOT, 'lib', 'utils', 'territory.ts');
  if (!fs.existsSync(deletedFile)) {
    console.log(`  PASS [${label}]`);
    totalPasses++;
  } else {
    console.error(`  FAIL [${label}] — file re-created`);
    totalFailures++;
    failedAssertions.push(label);
  }
}

// L2.5: getEffectiveTerritories symbol stays gone (C11 anti-regression)
{
  const label = 'L2.5: getEffectiveTerritories symbol stays gone (C11 anti-regression)';
  const pattern = /\bgetEffectiveTerritories\b/;
  const offenders = [];
  for (const f of allFiles) {
    const text = fs.readFileSync(f, 'utf8');
    if (pattern.test(text)) {
      const lineNo = text.slice(0, text.search(pattern)).split('\n').length;
      offenders.push(`${relPosix(f)}:${lineNo}`);
    }
  }
  if (offenders.length === 0) {
    console.log(`  PASS [${label}]`);
    totalPasses++;
  } else {
    console.error(`  FAIL [${label}] — ${offenders.length} occurrence(s):`);
    for (const o of offenders) console.error(`    ${o}`);
    totalFailures++;
    failedAssertions.push(label);
  }
}

// ============================================================
// Final summary
// ============================================================
console.log('');
console.log('==========================================================');
console.log(`  C12 RESULT: ${totalPasses} PASS / ${totalFailures} FAIL`);
console.log('==========================================================');
if (totalFailures > 0) {
  console.log('');
  if (failedScripts.length) {
    console.log('  Failed phase scripts:');
    for (const s of failedScripts) console.log(`    - ${s}`);
  }
  if (failedAssertions.length) {
    console.log('  Failed Layer-2 assertions:');
    for (const a of failedAssertions) console.log(`    - ${a}`);
  }
}
console.log('');
process.exit(totalFailures === 0 ? 0 : 1);