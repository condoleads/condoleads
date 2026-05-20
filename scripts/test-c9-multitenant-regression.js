// scripts/test-c9-multitenant-regression.js
// C9 regression gate -- D15 retired.
// Asserts no hardcoded 'WALLiam' agent fallback in the session route.
const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()
let failures = 0

function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8') }
function assertNoMatch(rel, pattern, label) {
  const m = readFile(rel).match(pattern)
  if (m) { console.error('FAIL [' + label + '] ' + rel + ' -- forbidden: ' + m[0]); failures++ }
  else console.log('PASS [' + label + '] ' + rel + ' -- pattern absent')
}
function assertMatch(rel, pattern, label) {
  if (pattern.test(readFile(rel))) console.log('PASS [' + label + '] ' + rel + ' -- present')
  else { console.error('FAIL [' + label + '] ' + rel + ' -- missing'); failures++ }
}

console.log('=== C9 regression gate ===\n')

// D15 negative: no `full_name: 'WALLiam'` hardcode anywhere in the session route
assertNoMatch(
  'app/api/walliam/charlie/session/route.ts',
  /full_name:\s*['"]WALLiam['"]/,
  'D15-negative-no-full-name-walliam'
)

// D15 positive: initial agentConfig has empty full_name default
assertMatch(
  'app/api/walliam/charlie/session/route.ts',
  /full_name:\s*['']{2}/,
  'D15-positive-empty-fallback'
)

// Confirm tenant.name override path still exists
assertMatch(
  'app/api/walliam/charlie/session/route.ts',
  /full_name:\s*tenant\.name/,
  'D15-tenant-override-intact'
)

// Confirm agent.full_name override path still exists
assertMatch(
  'app/api/walliam/charlie/session/route.ts',
  /full_name:\s*agent\.full_name/,
  'D15-agent-override-intact'
)

console.log('\n=== ' + (failures === 0 ? 'ALL PASS' : failures + ' FAIL(S)') + ' ===')
process.exit(failures === 0 ? 0 : 1)