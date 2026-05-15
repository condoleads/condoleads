#!/usr/bin/env node
/**
 * verify-w5c-2-static.js
 *
 * Static post-patch verification for W-LEADS-WORKBENCH W5c-2.
 *
 * Read-only. Exits 0 if all PASS, 1 if any FAIL.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const FILES = {
  leads: path.join(ROOT, 'app', 'admin-homes', 'leads', 'page.tsx'),
  users: path.join(ROOT, 'app', 'admin-homes', 'users', 'page.tsx'),
  agents: path.join(ROOT, 'app', 'admin-homes', 'agents', 'page.tsx'),
  scope: path.join(ROOT, 'lib', 'admin-homes', 'scope.ts'),
}

for (const k of Object.keys(FILES)) {
  if (!fs.existsSync(FILES[k])) {
    console.error('FATAL: file missing: ' + FILES[k])
    process.exit(2)
  }
}

const leads = fs.readFileSync(FILES.leads, 'utf8')
const users = fs.readFileSync(FILES.users, 'utf8')
const agents = fs.readFileSync(FILES.agents, 'utf8')
const scope = fs.readFileSync(FILES.scope, 'utf8')

const checks = []
function check(name, condition, detail) {
  checks.push({ name, pass: !!condition, detail: detail || '' })
}

// ============================================================
// scope.ts unchanged (we only consume; helper file should be intact)
// ============================================================
check(
  'scope: scopeLeadsQuery export present',
  scope.indexOf('export function scopeLeadsQuery<T extends ScopableQuery<T>>') !== -1,
  'scope.ts helper definition'
)
check(
  'scope: scopeAgentsByRole export present',
  scope.indexOf('export function scopeAgentsByRole<T extends ScopableQuery<T>>') !== -1,
  'scope.ts helper definition'
)
check(
  'scope: isCrossTenantView export present',
  scope.indexOf('export function isCrossTenantView') !== -1,
  'scope.ts helper definition'
)
check(
  'scope: getScopedTenantId export present',
  scope.indexOf('export function getScopedTenantId') !== -1,
  'scope.ts helper definition'
)

// ============================================================
// leads/page.tsx -- FULL migration
// ============================================================
check(
  'leads: scope import added',
  leads.indexOf("import { scopeLeadsQuery, scopeAgentsByRole } from '@/lib/admin-homes/scope'") !== -1,
  'import line'
)
check(
  'leads: scopeLeadsQuery call on leads query',
  leads.indexOf('scopeLeadsQuery(query, adminUser, tenantId)') !== -1,
  'helper call for leads query'
)
check(
  'leads: scopeAgentsByRole call on agents-for-filter query',
  leads.indexOf('scopeAgentsByRole(agentsQuery, adminUser, tenantId)') !== -1,
  'helper call for agents-for-filter query'
)
check(
  'leads: empty-return guard flattened (no nested if (!seeAll) { if (!scopedTenantId))',
  leads.indexOf('if (!seeAll && !scopedTenantId) {') !== -1,
  'flattened guard'
)
check(
  'leads: null-adminUser tenant-only fallback preserved',
  leads.indexOf('} else if (!seeAll && scopedTenantId) {') !== -1,
  'fallback branch'
)
check(
  'leads: old inline leads role gate (.in agent_id) removed',
  leads.indexOf("query = query.in('agent_id'") === -1,
  'pre-migration role gate must be gone'
)
check(
  'leads: old inline leads role gate (.eq agent_id) removed',
  leads.indexOf("query = query.eq('agent_id', adminUser.agentId)") === -1,
  'pre-migration role gate must be gone'
)
check(
  'leads: old inline agents-for-filter role gate (.in id) removed',
  leads.indexOf("agentsQuery = agentsQuery.in('id', [adminUser.agentId, ...adminUser.managedAgentIds])") === -1,
  'pre-migration agentsQuery role gate must be gone'
)
check(
  'leads: old inline agents-for-filter role gate (.eq id) removed',
  leads.indexOf("agentsQuery = agentsQuery.eq('id', adminUser.agentId)") === -1,
  'pre-migration agentsQuery role gate must be gone'
)

// ============================================================
// leads/page.tsx -- NO REGRESSIONS
// ============================================================
check(
  'NO REGRESSION leads: seeAll computation still present (used by user_activities + empty-return guard)',
  leads.indexOf('const seeAll = adminUser?.isPlatformAdmin === true && !adminUser.tenantId && !tenantId') !== -1,
  'seeAll local preserved'
)
check(
  'NO REGRESSION leads: scopedTenantId computation still present',
  leads.indexOf('const scopedTenantId = adminUser?.tenantId ?? tenantId') !== -1,
  'scopedTenantId local preserved'
)
check(
  'NO REGRESSION leads: user_activities tenant scoping still inline',
  leads.indexOf("actQuery = actQuery.eq('tenant_id', scopedTenantId)") !== -1,
  'user_activities tenant gate preserved'
)
check(
  'NO REGRESSION leads: getCurrentTenantId still imported',
  leads.indexOf("import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'") !== -1,
  'tenantId source preserved'
)
check(
  'NO REGRESSION leads: searchParams + initialExpanded (W5b) preserved',
  leads.indexOf("searchParams?.expanded === '1'") !== -1,
  'W5b plumbing preserved'
)
check(
  'NO REGRESSION leads: leads query still selects with embeds',
  leads.indexOf("agents!leads_agent_id_fkey") !== -1,
  'leads query select unchanged'
)
check(
  'NO REGRESSION leads: leads query still .order(created_at desc)',
  leads.indexOf(".order('created_at', { ascending: false })") !== -1,
  'leads query order preserved'
)
check(
  'NO REGRESSION leads: client component still rendered with initialExpanded',
  leads.indexOf('initialExpanded={initialExpanded}') !== -1,
  'client prop wiring intact'
)

// ============================================================
// users/page.tsx -- PARTIAL migration
// ============================================================
check(
  'users: scope import added',
  users.indexOf("import { scopeAgentsByRole } from '@/lib/admin-homes/scope'") !== -1,
  'import line'
)
check(
  'users: scopeAgentsByRole call on agents-for-display-names',
  users.indexOf('scopeAgentsByRole(agentsQuery, adminUser, hostTenantId)') !== -1,
  'helper call'
)
check(
  'users: old inline agents-for-display-names tenant gate removed',
  users.indexOf("if (!seeAll && tenantId) agentsQuery = agentsQuery.eq('tenant_id', tenantId)") === -1,
  'inline tenant filter pre-migration line must be gone'
)
check(
  'users: old inline agents-for-display-names role gate (.in id) removed',
  users.indexOf("agentsQuery = agentsQuery.in('id', [adminUser.agentId, ...adminUser.managedAgentIds])") === -1,
  'inline role .in pre-migration must be gone'
)
check(
  'users: old inline agents-for-display-names role gate (.eq id) removed',
  users.indexOf("agentsQuery = agentsQuery.eq('id', adminUser.agentId)") === -1,
  'inline role .eq pre-migration must be gone'
)

// ============================================================
// users/page.tsx -- NO REGRESSIONS (partial migration preserves user_profiles + chat + overrides)
// ============================================================
check(
  'NO REGRESSION users: hostTenantId local preserved',
  users.indexOf('const hostTenantId = await getCurrentTenantId()') !== -1,
  'host tenant fetch'
)
check(
  'NO REGRESSION users: seeAll computation preserved',
  users.indexOf('const seeAll = adminUser.isPlatformAdmin === true && !adminUser.tenantId && !hostTenantId') !== -1,
  'seeAll local preserved (used by user_profiles + chat_sessions + overrides scoping)'
)
check(
  'NO REGRESSION users: user_profiles assigned_agent_id IN tenantAgentIds preserved',
  users.indexOf('usersQuery = usersQuery.in(\'assigned_agent_id\', tenantAgentIds)') !== -1,
  'user_profiles scoping must remain inline'
)
check(
  'NO REGRESSION users: chat_sessions tenant scoping preserved',
  users.indexOf("sQuery = sQuery.eq('tenant_id', tenantId)") !== -1,
  'chat_sessions inline tenant gate'
)
check(
  'NO REGRESSION users: user_credit_overrides tenant scoping preserved',
  users.indexOf("oQuery = oQuery.eq('tenant_id', tenantId)") !== -1,
  'overrides inline tenant gate'
)
check(
  'NO REGRESSION users: tenantAgentIds pre-fetch preserved',
  users.indexOf('let tenantAgentIds: string[] = []') !== -1,
  'tenant-agents pre-fetch path preserved'
)

// ============================================================
// agents/page.tsx -- TENANT-ONLY migration
// ============================================================
check(
  'agents: scope import added',
  agents.indexOf("import { isCrossTenantView, getScopedTenantId } from '@/lib/admin-homes/scope'") !== -1,
  'import line'
)
check(
  'agents: getCurrentTenantId import added',
  agents.indexOf("import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'") !== -1,
  'import line'
)
check(
  'agents: hostTenantId fetched',
  agents.indexOf('const hostTenantId = await getCurrentTenantId()') !== -1,
  'host tenant fetch'
)
check(
  'agents: seeAll via isCrossTenantView helper',
  agents.indexOf('const seeAll = isCrossTenantView(user, hostTenantId)') !== -1,
  'helper call'
)
check(
  'agents: scopedTenantId via getScopedTenantId helper',
  agents.indexOf('const scopedTenantId = getScopedTenantId(user, hostTenantId)') !== -1,
  'helper call'
)
check(
  'agents: old inline seeAll computation removed',
  agents.indexOf('const seeAll = user.isPlatformAdmin === true && !user.tenantId\n') === -1 &&
    agents.indexOf('const seeAll = user.isPlatformAdmin === true && !user.tenantId\r\n') === -1,
  'pre-migration inline seeAll must be gone'
)
check(
  'agents: NO scopeAgentsByRole call (tenant-only migration -- role gate preserved as absent)',
  agents.indexOf('scopeAgentsByRole(') === -1,
  'helper call must NOT be present per F-W5C-2-AGENTS-PAGE-NO-ROLE-GATE'
)

// ============================================================
// agents/page.tsx -- NO REGRESSIONS
// ============================================================
check(
  'NO REGRESSION agents: empty-return guard preserved (returns empty client when no tenant)',
  agents.indexOf('<AgentsManagementClient agents={[]} tenants={[]} tenantName={null} />') !== -1,
  'empty render path preserved'
)
check(
  'NO REGRESSION agents: agentsQuery still .eq tenant_id when scoped',
  agents.indexOf("agentsQuery = agentsQuery.eq('tenant_id', scopedTenantId)") !== -1,
  'tenant filter still applied inline'
)
check(
  'NO REGRESSION agents: tenants query still scoped by scopedTenantId',
  agents.indexOf("tenantsQuery = tenantsQuery.eq('id', scopedTenantId)") !== -1,
  'tenants query filter preserved'
)
check(
  'NO REGRESSION agents: per-agent stats Promise.all preserved',
  agents.indexOf('const agentsWithStats = await Promise.all(') !== -1,
  'agent stats computation preserved'
)
check(
  'NO REGRESSION agents: redirect on !user preserved',
  agents.indexOf("redirect('/login?redirect=/admin-homes/agents')") !== -1,
  'auth gate preserved'
)

// ============================================================
// LE preservation
// ============================================================
function countLE(buf) {
  let crlf = 0
  let lf = 0
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      if (i > 0 && buf[i - 1] === 0x0d) crlf++
      else lf++
    }
  }
  return { crlf, lf }
}
const leadsLE = countLE(fs.readFileSync(FILES.leads))
const usersLE = countLE(fs.readFileSync(FILES.users))
const agentsLE = countLE(fs.readFileSync(FILES.agents))
check('leads: LE pure (no mixed)', !(leadsLE.crlf > 0 && leadsLE.lf > 0),
  'crlf=' + leadsLE.crlf + ' lf=' + leadsLE.lf)
check('users: LE pure (no mixed)', !(usersLE.crlf > 0 && usersLE.lf > 0),
  'crlf=' + usersLE.crlf + ' lf=' + usersLE.lf)
check('agents: LE pure (no mixed)', !(agentsLE.crlf > 0 && agentsLE.lf > 0),
  'crlf=' + agentsLE.crlf + ' lf=' + agentsLE.lf)

// ============================================================
// Backups
// ============================================================
function hasBackup(filepath, prefix) {
  const dir = path.dirname(filepath)
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith(prefix + '.backup_'))
  return backups.length >= 1
}
check('backup: leads/page.tsx backup present', hasBackup(FILES.leads, 'page.tsx'), 'timestamped backup')
check('backup: users/page.tsx backup present', hasBackup(FILES.users, 'page.tsx'), 'timestamped backup')
check('backup: agents/page.tsx backup present', hasBackup(FILES.agents, 'page.tsx'), 'timestamped backup')

// ============================================================
// REPORT
// ============================================================
const passed = checks.filter((c) => c.pass).length
const failed = checks.filter((c) => !c.pass).length

console.log('')
console.log('W5c-2 static verification:')
console.log('-'.repeat(60))
for (const c of checks) {
  const mark = c.pass ? '  PASS' : '  FAIL'
  console.log(mark + '  ' + c.name)
  if (!c.pass) console.log('        -> ' + c.detail)
}
console.log('-'.repeat(60))
console.log('Summary: ' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)')

if (failed > 0) process.exit(1)
process.exit(0)