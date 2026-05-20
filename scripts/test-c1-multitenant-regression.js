// scripts/test-c1-multitenant-regression.js
// C1 regression gate — fails if D1 or D5 hardcodes reappear in production code.
// Runs against current file state, no DB calls, no test framework needed.

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
let failures = 0

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function assertNoMatch(rel, pattern, label) {
  const content = readFile(rel)
  const matches = content.match(pattern)
  if (matches) {
    console.error(`✗ FAIL [${label}] ${rel} — found forbidden pattern: ${matches[0]}`)
    failures++
  } else {
    console.log(`✓ PASS [${label}] ${rel} — pattern absent`)
  }
}

function assertMatch(rel, pattern, label) {
  const content = readFile(rel)
  if (pattern.test(content)) {
    console.log(`✓ PASS [${label}] ${rel} — required pattern present`)
  } else {
    console.error(`✗ FAIL [${label}] ${rel} — required pattern missing`)
    failures++
  }
}

console.log('=== C1 regression gate ===\n')

// D1 — walliam/estimator/increment must NOT hardcode 'walliam' source check
assertNoMatch(
  'app/api/walliam/estimator/increment/route.ts',
  /session\.source\s*!==?\s*'walliam'/,
  'D1-negative'
)
// D1 — must use tenant source_key from DB
assertMatch(
  'app/api/walliam/estimator/increment/route.ts',
  /tenantRow\.source_key/,
  'D1-positive'
)

// D5 — walliam/contact must NOT hardcode 'walliam_contact_form'
assertNoMatch(
  'app/api/walliam/contact/route.ts',
  /'walliam_contact_form'/,
  'D5-negative'
)
// D5 — must build source from sourceKey
assertMatch(
  'app/api/walliam/contact/route.ts',
  /\$\{sourceKey\}_contact_form/,
  'D5-positive'
)

console.log(`\n=== ${failures === 0 ? 'ALL PASS' : failures + ' FAIL(S)'} ===`)
process.exit(failures === 0 ? 0 : 1)