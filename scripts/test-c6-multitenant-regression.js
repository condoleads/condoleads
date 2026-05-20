// scripts/test-c6-multitenant-regression.js
// C6 regression gate -- D9 retired
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
function countMatches(rel, pattern) {
  const matches = readFile(rel).match(pattern)
  return matches ? matches.length : 0
}

console.log('=== C6 regression gate ===\n')

// D9 negative: zero walliam.ca literals
assertNoMatch(
  'app/api/charlie/route.ts',
  /walliam\.ca/,
  'D9-negative-no-walliam-ca'
)

// D9 positive: executeTool signature accepts tenantDomain
assertMatch(
  'app/api/charlie/route.ts',
  /async function executeTool\([^)]*tenantDomain:\s*string/,
  'D9-positive-executetool-signature'
)

// D9 positive: both executeTool callers pass tenantDomain
const callersWithTenant = countMatches('app/api/charlie/route.ts', /executeTool\([^)]*tenantDomain\)/g)
if (callersWithTenant >= 2) {
  console.log('PASS [D9-positive-callers-pass-tenant] ' + callersWithTenant + ' executeTool callers pass tenantDomain (expected >= 2)')
} else {
  console.error('FAIL [D9-positive-callers-pass-tenant] only ' + callersWithTenant + ' callers pass tenantDomain (expected >= 2)')
  failures++
}

// D9 positive: at least 5 baseUrl tenantDomain interpolations inside executeTool
const baseUrlInterps = countMatches('app/api/charlie/route.ts', /const baseUrl = `https:\/\/\$\{tenantDomain\}`/g)
if (baseUrlInterps >= 5) {
  console.log('PASS [D9-positive-baseurl-interps] ' + baseUrlInterps + ' baseUrl tenantDomain refs (expected >= 5)')
} else {
  console.error('FAIL [D9-positive-baseurl-interps] only ' + baseUrlInterps + ' baseUrl tenantDomain refs (expected >= 5)')
  failures++
}

// D9 positive: low-credits fetch fallback uses tenantDomain
const lowCredFallback = countMatches('app/api/charlie/route.ts', /NEXT_PUBLIC_APP_URL \|\| `https:\/\/\$\{tenantDomain\}`/g)
if (lowCredFallback >= 2) {
  console.log('PASS [D9-positive-low-credits-fallback] ' + lowCredFallback + ' low-credits fetch fallbacks use tenantDomain (expected >= 2)')
} else {
  console.error('FAIL [D9-positive-low-credits-fallback] only ' + lowCredFallback + ' (expected >= 2)')
  failures++
}

console.log('\n=== ' + (failures === 0 ? 'ALL PASS' : failures + ' FAIL(S)') + ' ===')
process.exit(failures === 0 ? 0 : 1)