#!/usr/bin/env node
/**
 * verify-w5c-1-static.js
 *
 * Static post-patch verification for W-LEADS-WORKBENCH W5c-1.
 *
 * Read-only. Exits 0 if all checks pass, 1 if any fail.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const FILE = path.join(ROOT, 'lib', 'admin-homes', 'auth.ts')

if (!fs.existsSync(FILE)) {
  console.error('FATAL: auth.ts missing: ' + FILE)
  process.exit(2)
}

const text = fs.readFileSync(FILE, 'utf8')

const checks = []
function check(name, condition, detail) {
  checks.push({ name, pass: !!condition, detail: detail || '' })
}

// ============================================================
// W5c-1 fix present
// ============================================================
check(
  'auth: W5c-1 marker comment present',
  text.indexOf('W5c-1: F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW') !== -1,
  'expected marker in fix comment'
)
check(
  'auth: rawAgent destructure present',
  text.indexOf('const { data: rawAgent } = await agentQuery.maybeSingle()') !== -1,
  'expected rawAgent name'
)
check(
  'auth: Universal-view guard present',
  text.indexOf('const agent = (!effectiveTenantId && isPlatformAdmin) ? null : rawAgent') !== -1,
  'expected guard expression'
)
check(
  'auth: old `data: agent` destructure removed',
  text.indexOf('const { data: agent } = await agentQuery.maybeSingle()') === -1,
  'expected old pattern to be gone'
)

// ============================================================
// No regressions -- structural shape preserved
// ============================================================
check(
  'NO REGRESSION: agent query still selects same columns',
  text.indexOf("    .select('id, full_name, parent_id, tenant_id, role')\n    .eq('user_id', user.id)") !== -1 ||
    text.indexOf(".select('id, full_name, parent_id, tenant_id, role')\r\n    .eq('user_id', user.id)") !== -1,
  'expected select shape unchanged'
)
check(
  'NO REGRESSION: tenant filter still gated on effectiveTenantId',
  text.indexOf("if (effectiveTenantId) {\n    agentQuery = agentQuery.eq('tenant_id', effectiveTenantId)") !== -1 ||
    text.indexOf("if (effectiveTenantId) {\r\n    agentQuery = agentQuery.eq('tenant_id', effectiveTenantId)") !== -1,
  'expected tenant scoping block unchanged'
)
check(
  'NO REGRESSION: synthetic admin path still exists',
  text.indexOf('Synthetic admin path:') !== -1,
  'expected synthetic admin path section header'
)
check(
  'NO REGRESSION: `if (!agent)` guard still in place',
  text.indexOf('if (!agent) {') !== -1,
  'expected agent-null guard'
)
check(
  'NO REGRESSION: synthetic path returns agentId: null',
  /if \(!agent\) \{[\s\S]{0,1500}?agentId: null/.test(text),
  'expected agentId: null in synthetic path body'
)
check(
  'NO REGRESSION: real-agent path still uses agent.id downstream',
  text.indexOf('agentId: agent.id,') !== -1,
  'expected agent.id usage in real-agent return'
)
check(
  'NO REGRESSION: position computation still uses agent.role',
  text.indexOf("normalizePosition(agent.role, agent.role === 'admin' || agent.role === 'tenant_admin')") !== -1,
  'expected position computation unchanged'
)
check(
  'NO REGRESSION: roleDb assignment still uses agent.role',
  text.indexOf('const roleDb: DbRole | null = isValidDbRole(agent.role) ? agent.role : null') !== -1,
  'expected roleDb computation unchanged'
)
check(
  'NO REGRESSION: computeManagedAgentIds still called with agent.id',
  text.indexOf('await computeManagedAgentIds(supabase, agent.id, roleDb, effectiveTenantId)') !== -1,
  'expected managedIds call unchanged'
)
check(
  'NO REGRESSION: fetchActiveDelegators still called with agent.id',
  text.indexOf('await fetchActiveDelegators(supabase, agent.id)') !== -1,
  'expected delegators call unchanged'
)
check(
  'NO REGRESSION: function still exports resolveAdminHomesUser',
  text.indexOf('export async function resolveAdminHomesUser()') !== -1,
  'expected fn export unchanged'
)
check(
  'NO REGRESSION: AdminHomesUser interface preserved',
  text.indexOf('export interface AdminHomesUser {') !== -1,
  'expected interface declaration'
)
check(
  'NO REGRESSION: permissions field still computed in synthetic path',
  /if \(!agent\) \{[\s\S]{0,1500}?permissions:/.test(text),
  'expected permissions: present in synthetic return'
)

// ============================================================
// LE preservation
// ============================================================
const buf = fs.readFileSync(FILE)
let crlf = 0
let lf = 0
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x0a) {
    if (i > 0 && buf[i - 1] === 0x0d) crlf++
    else lf++
  }
}
check(
  'auth: LE pure (no mixed line endings)',
  !(crlf > 0 && lf > 0),
  'got crlf=' + crlf + ' lf=' + lf
)

// ============================================================
// Backup present
// ============================================================
const dir = path.dirname(FILE)
const backups = fs.readdirSync(dir).filter((f) => f.startsWith('auth.ts.backup_'))
check(
  'auth: at least one backup file present',
  backups.length >= 1,
  'expected timestamped backup'
)

// ============================================================
// REPORT
// ============================================================
const passed = checks.filter((c) => c.pass).length
const failed = checks.filter((c) => !c.pass).length

console.log('')
console.log('W5c-1 static verification:')
console.log('-'.repeat(60))
for (const c of checks) {
  const mark = c.pass ? '  PASS' : '  FAIL'
  console.log(mark + '  ' + c.name)
  if (!c.pass) {
    console.log('        -> ' + c.detail)
  }
}
console.log('-'.repeat(60))
console.log('Summary: ' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)')

if (failed > 0) {
  process.exit(1)
}
process.exit(0)