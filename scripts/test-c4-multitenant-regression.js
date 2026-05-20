// scripts/test-c4-multitenant-regression.js
// C4 regression gate -- D2 retired
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

console.log('=== C4 regression gate ===\n')

// D2 negative: no .like('source', 'walliam_%') filter anywhere
assertNoMatch(
  'app/admin-homes/agents/page.tsx',
  /\.like\(['"]source['"],\s*['"]walliam_%['"]\)/,
  'D2-negative-like-walliam'
)

// D2 negative (broader): no .like with any tenant_*% source pattern (catch future regressions)
assertNoMatch(
  'app/admin-homes/agents/page.tsx',
  /\.like\(['"]source['"],\s*['"][a-z]+_%['"]\)/,
  'D2-negative-like-any-tenant-source'
)

// D2 positive: the leads query exists and filters by agent_id
assertMatch(
  'app/admin-homes/agents/page.tsx',
  /supabase\.from\(['"]leads['"]\)[\s\S]*?\.eq\(['"]agent_id['"],\s*agent\.id\)/,
  'D2-positive-agent-id-filter'
)

console.log('\n=== ' + (failures === 0 ? 'ALL PASS' : failures + ' FAIL(S)') + ' ===')
process.exit(failures === 0 ? 0 : 1)