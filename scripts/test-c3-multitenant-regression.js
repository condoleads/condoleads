// scripts/test-c3-multitenant-regression.js
// C3 regression gate -- D3 retired
const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()
let failures = 0

function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8') }
function assertMatch(rel, pattern, label) {
  if (pattern.test(readFile(rel))) console.log('PASS [' + label + '] ' + rel + ' -- present')
  else { console.error('FAIL [' + label + '] ' + rel + ' -- missing'); failures++ }
}
function assertResolverCall(rel, fnName, label) {
  // Find every resolve_agent_for_context call in the file; assert each has p_tenant_id
  const content = readFile(rel)
  const calls = content.match(/resolve_agent_for_context['"`],?\s*\{[\s\S]*?\}/g) || []
  if (calls.length === 0) {
    console.error('FAIL [' + label + '] ' + rel + ' -- no resolver calls found at all')
    failures++
    return
  }
  let allHavePTenant = true
  for (const call of calls) {
    if (!/p_tenant_id\s*:/.test(call)) { allHavePTenant = false; break }
  }
  if (allHavePTenant) console.log('PASS [' + label + '] ' + rel + ' -- ' + calls.length + ' resolver call(s), all pass p_tenant_id')
  else { console.error('FAIL [' + label + '] ' + rel + ' -- a resolver call is missing p_tenant_id'); failures++ }
}

console.log('=== C3 regression gate ===\n')

assertResolverCall(
  'app/api/walliam/estimator/session/route.ts',
  'resolve_agent_for_context',
  'D3-resolver-tenant-scoped'
)

assertMatch(
  'app/api/walliam/estimator/session/route.ts',
  /p_tenant_id\s*:\s*tenantId/,
  'D3-positive-explicit'
)

console.log('\n=== ' + (failures === 0 ? 'ALL PASS' : failures + ' FAIL(S)') + ' ===')
process.exit(failures === 0 ? 0 : 1)