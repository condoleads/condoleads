// scripts/test-c2-multitenant-regression.js
// C2 regression gate -- D4 retired
// Fails if walliam/contact silently falls back to literal 'walliam' source_key.

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
let failures = 0

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function assertNoMatch(rel, pattern, label) {
  const content = readFile(rel)
  const m = content.match(pattern)
  if (m) {
    console.error('FAIL [' + label + '] ' + rel + ' -- forbidden pattern: ' + m[0])
    failures++
  } else {
    console.log('PASS [' + label + '] ' + rel + ' -- pattern absent')
  }
}

function assertMatch(rel, pattern, label) {
  const content = readFile(rel)
  if (pattern.test(content)) {
    console.log('PASS [' + label + '] ' + rel + ' -- required pattern present')
  } else {
    console.error('FAIL [' + label + '] ' + rel + ' -- required pattern missing')
    failures++
  }
}

console.log('=== C2 regression gate ===\n')

// D4 negative: no 'walliam' fallback literal in source_key initialization
assertNoMatch(
  'app/api/walliam/contact/route.ts',
  /let\s+sourceKey\s*=\s*['"]walliam['"]/,
  'D4-negative-fallback-literal'
)

// D4 negative: no console.warn for silent fallback
assertNoMatch(
  'app/api/walliam/contact/route.ts',
  /console\.warn\(['"][^'"]*getTenantContext returned null/,
  'D4-negative-silent-warn'
)

// D4 positive: strict-fail returns 500 on null tenant context
assertMatch(
  'app/api/walliam/contact/route.ts',
  /if \(!_t6fcCtx\) \{[\s\S]*?status: 500/,
  'D4-positive-strict-fail'
)

// D4 positive: brandName and sourceKey are const-declared from tenant context (no fallback default)
assertMatch(
  'app/api/walliam/contact/route.ts',
  /const brandName = _t6fcCtx\.brandName/,
  'D4-positive-const-brand'
)
assertMatch(
  'app/api/walliam/contact/route.ts',
  /const sourceKey = _t6fcCtx\.sourceKey/,
  'D4-positive-const-source'
)

console.log('\n=== ' + (failures === 0 ? 'ALL PASS' : failures + ' FAIL(S)') + ' ===')
process.exit(failures === 0 ? 0 : 1)