// scripts/test-c5-multitenant-regression.js
// C5 regression gate -- D8 retired
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

console.log('=== C5 regression gate ===\n')

// D8 negative: zero walliam.ca literals in charlie-prompts.ts
assertNoMatch(
  'app/charlie/lib/charlie-prompts.ts',
  /walliam\.ca/,
  'D8-negative-prompts-no-walliam-ca'
)

// D8 positive: function signature accepts tenantDomain
assertMatch(
  'app/charlie/lib/charlie-prompts.ts',
  /export function buildCharlieSystemPrompt\([^)]*tenantDomain:\s*string/,
  'D8-positive-signature-tenant-domain'
)

// D8 positive: tenantDomain interpolation present (template literal in prompt body)
const promptInterps = countMatches('app/charlie/lib/charlie-prompts.ts', /\$\{tenantDomain\}/g)
if (promptInterps >= 7) {
  console.log('PASS [D8-positive-interpolations] charlie-prompts.ts -- ' + promptInterps + ' ${tenantDomain} interpolations (expected >= 7)')
} else {
  console.error('FAIL [D8-positive-interpolations] charlie-prompts.ts -- only ' + promptInterps + ' ${tenantDomain} interpolations (expected >= 7)')
  failures++
}

// D8 positive: caller passes tenantDomain
assertMatch(
  'app/api/charlie/route.ts',
  /buildCharlieSystemPrompt\(agentName,\s*brokerageName,\s*assistantName,\s*tenantDomain\)/,
  'D8-positive-caller-passes-tenant-domain'
)

console.log('\n=== ' + (failures === 0 ? 'ALL PASS' : failures + ' FAIL(S)') + ' ===')
process.exit(failures === 0 ? 0 : 1)