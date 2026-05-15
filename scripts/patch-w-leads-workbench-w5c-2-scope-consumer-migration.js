#!/usr/bin/env node
/**
 * patch-w-leads-workbench-w5c-2-scope-consumer-migration.js
 *
 * refactor(W-LEADS-WORKBENCH W5c-2): scope.ts consumer migration.
 *
 * Migrates inline seeAll/scopedTenantId scoping patterns in 3 admin-homes
 * pages to use lib/admin-homes/scope.ts helpers (scopeLeadsQuery /
 * scopeAgentsByRole / isCrossTenantView / getScopedTenantId).
 *
 * Files (3):
 *
 *   app/admin-homes/leads/page.tsx (3 anchors) -- FULL migration:
 *     A1: imports -- add scopeLeadsQuery + scopeAgentsByRole
 *     A2: leads query -- flatten empty-return guard + use scopeLeadsQuery
 *         (replaces inline tenant + role gates lines ~49-67)
 *     A3: agents-for-filter query -- use scopeAgentsByRole (replaces inline
 *         tenant + role gates lines ~104-118)
 *
 *   app/admin-homes/users/page.tsx (2 anchors) -- PARTIAL migration:
 *     B1: imports -- add scopeAgentsByRole
 *     B2: agents-for-display-names query -- use scopeAgentsByRole
 *         (user_profiles/chat_sessions/overrides keep inline -- see
 *         F-W5C-2-USERS-PAGE-PARTIAL-MIGRATION)
 *
 *   app/admin-homes/agents/page.tsx (2 anchors) -- TENANT-ONLY migration:
 *     C1: imports -- add getCurrentTenantId + isCrossTenantView + getScopedTenantId
 *     C2: seeAll/scopedTenantId -- use isCrossTenantView + getScopedTenantId
 *         (NOT scopeAgentsByRole -- preserves no-role-gate behavior;
 *         see F-W5C-2-AGENTS-PAGE-NO-ROLE-GATE)
 *
 * Multi-tenant safety: behavior-preserving. The role-gate semantics in
 * leads/page.tsx and users/page.tsx exactly match scope.ts helpers
 * (verified by diff). agents/page.tsx tenant-only migration intentionally
 * skips the role-gate helper to preserve current behavior. Pre vs post:
 *
 *   leads/page.tsx tenant gate:     before==after (inline matched helper)
 *   leads/page.tsx role gate:       before==after (inline matched helper)
 *   leads/page.tsx empty-return:    preserved (flattened guard structure)
 *   leads/page.tsx null adminUser:  preserved (tenant-only fallback retained)
 *   users/page.tsx tenant gate:     before==after for agents-only query
 *   users/page.tsx role gate:       before==after for agents-only query
 *   agents/page.tsx tenant gate:    before==after (user.tenantId already
 *                                   incorporates hostTenantId via auth.ts)
 *   agents/page.tsx role gate:      preserved as absent (no helper call)
 *
 * Idempotency: skips if 'scopeLeadsQuery' import already in leads/page.tsx.
 * LE detection per file (each file may be CRLF or LF independently).
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const d = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  d.getFullYear() +
  pad(d.getMonth() + 1) +
  pad(d.getDate()) +
  '_' +
  pad(d.getHours()) +
  pad(d.getMinutes()) +
  pad(d.getSeconds())

const FILES = {
  leads: path.join(ROOT, 'app', 'admin-homes', 'leads', 'page.tsx'),
  users: path.join(ROOT, 'app', 'admin-homes', 'users', 'page.tsx'),
  agents: path.join(ROOT, 'app', 'admin-homes', 'agents', 'page.tsx'),
}

for (const k of Object.keys(FILES)) {
  if (!fs.existsSync(FILES[k])) {
    throw new Error('file missing: ' + FILES[k])
  }
}

function detectLE(filepath) {
  const b = fs.readFileSync(filepath)
  let crlf = 0
  let lf = 0
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0x0a) {
      if (i > 0 && b[i - 1] === 0x0d) crlf++
      else lf++
    }
  }
  if (crlf > 0 && lf > 0) {
    throw new Error('mixed LE in ' + filepath + ': crlf=' + crlf + ', lf=' + lf)
  }
  return { LE: crlf > 0 ? 'crlf' : 'lf', text: b.toString('utf8') }
}

function withLE(s, LE) {
  if (LE === 'crlf') {
    return s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
  }
  return s
}

const leadsInfo = detectLE(FILES.leads)
const usersInfo = detectLE(FILES.users)
const agentsInfo = detectLE(FILES.agents)
console.log('LE: leads=' + leadsInfo.LE + ', users=' + usersInfo.LE + ', agents=' + agentsInfo.LE)

// Idempotency
const W5C2_MARKER = "import { scopeLeadsQuery, scopeAgentsByRole } from '@/lib/admin-homes/scope'"
if (leadsInfo.text.indexOf(W5C2_MARKER) !== -1) {
  console.log('SKIP: W5c-2 marker (scopeLeadsQuery import in leads/page.tsx) present. No-op.')
  process.exit(0)
}

// ============================================================
// LEADS/PAGE.TSX (3 anchors)
// ============================================================
let leadsText = leadsInfo.text

const A1_OLD =
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'\n" +
  "import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'\n" +
  "import AdminHomesLeadsClient from '@/components/admin-homes/AdminHomesLeadsClient'"

const A1_NEW =
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'\n" +
  "import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'\n" +
  "import { scopeLeadsQuery, scopeAgentsByRole } from '@/lib/admin-homes/scope'\n" +
  "import AdminHomesLeadsClient from '@/components/admin-homes/AdminHomesLeadsClient'"

const A2_OLD =
  '  if (!seeAll) {\n' +
  '    if (!scopedTenantId) {\n' +
  '      // Authenticated but no tenant context \u2014 return empty\n' +
  '      return (\n' +
  '        <AdminHomesLeadsClient\n' +
  '          initialLeads={[]}\n' +
  '          initialActivities={{}}\n' +
  '          agents={[]}\n' +
  "          currentRole={adminUser?.role || 'admin'}\n" +
  '          currentAgentId={adminUser?.agentId || null}\n' +
  '          initialExpanded={initialExpanded}\n' +
  '        />\n' +
  '      )\n' +
  '    }\n' +
  "    query = query.eq('tenant_id', scopedTenantId)\n" +
  '  }\n' +
  '\n' +
  "  if (adminUser?.role === 'manager' && adminUser.agentId) {\n" +
  "    // Manager sees own leads + all managed agents' leads\n" +
  '    const agentIds = [adminUser.agentId, ...adminUser.managedAgentIds]\n' +
  "    query = query.in('agent_id', agentIds)\n" +
  "  } else if (adminUser?.role === 'agent' && adminUser.agentId) {\n" +
  '    // Agent sees only their own leads\n' +
  "    query = query.eq('agent_id', adminUser.agentId)\n" +
  '  }\n' +
  '  // Admin sees all \u2014 no filter'

const A2_NEW =
  '  if (!seeAll && !scopedTenantId) {\n' +
  '    // Authenticated but no tenant context \u2014 return empty\n' +
  '    return (\n' +
  '      <AdminHomesLeadsClient\n' +
  '        initialLeads={[]}\n' +
  '        initialActivities={{}}\n' +
  '        agents={[]}\n' +
  "        currentRole={adminUser?.role || 'admin'}\n" +
  '        currentAgentId={adminUser?.agentId || null}\n' +
  '        initialExpanded={initialExpanded}\n' +
  '      />\n' +
  '    )\n' +
  '  }\n' +
  '\n' +
  '  // W5c-2: scope.ts consumer migration. Replaces inline tenant + role gates\n' +
  '  // with scopeLeadsQuery helper. Behavior-preserving when adminUser is non-null\n' +
  '  // (inline pattern matched helper semantics exactly). Preserves the existing\n' +
  '  // null-adminUser tenant-only fallback (no role gate when not authenticated).\n' +
  '  if (adminUser) {\n' +
  '    query = scopeLeadsQuery(query, adminUser, tenantId)\n' +
  '  } else if (!seeAll && scopedTenantId) {\n' +
  "    query = query.eq('tenant_id', scopedTenantId)\n" +
  '  }'

const A3_OLD =
  '  // Agents for filter dropdown \u2014 scoped by role\n' +
  '  let agentsQuery = supabase\n' +
  "    .from('agents')\n" +
  "    .select('id, full_name, email')\n" +
  "    .eq('site_type', 'comprehensive')\n" +
  "    .order('full_name')\n" +
  '\n' +
  '  if (!seeAll && scopedTenantId) {\n' +
  "    agentsQuery = agentsQuery.eq('tenant_id', scopedTenantId)\n" +
  '  }\n' +
  '\n' +
  "  if (adminUser?.role === 'manager' && adminUser.agentId) {\n" +
  '    // Manager only sees themselves + their managed agents in filter\n' +
  "    agentsQuery = agentsQuery.in('id', [adminUser.agentId, ...adminUser.managedAgentIds])\n" +
  "  } else if (adminUser?.role === 'agent' && adminUser.agentId) {\n" +
  "    agentsQuery = agentsQuery.eq('id', adminUser.agentId)\n" +
  '  }'

const A3_NEW =
  '  // W5c-2: scope.ts consumer migration. Agents-for-filter dropdown uses\n' +
  '  // scopeAgentsByRole (mirrors leads query scoping above with column=id).\n' +
  '  let agentsQuery = supabase\n' +
  "    .from('agents')\n" +
  "    .select('id, full_name, email')\n" +
  "    .eq('site_type', 'comprehensive')\n" +
  "    .order('full_name')\n" +
  '\n' +
  '  if (adminUser) {\n' +
  '    agentsQuery = scopeAgentsByRole(agentsQuery, adminUser, tenantId)\n' +
  '  } else if (!seeAll && scopedTenantId) {\n' +
  "    agentsQuery = agentsQuery.eq('tenant_id', scopedTenantId)\n" +
  '  }'

const leadsPatches = [
  { name: 'A1 leads imports', old: A1_OLD, new: A1_NEW },
  { name: 'A2 leads query scoping', old: A2_OLD, new: A2_NEW },
  { name: 'A3 agents-for-filter scoping', old: A3_OLD, new: A3_NEW },
].map((p) => ({ name: p.name, old: withLE(p.old, leadsInfo.LE), new: withLE(p.new, leadsInfo.LE) }))

// ============================================================
// USERS/PAGE.TSX (2 anchors)
// ============================================================
let usersText = usersInfo.text

const B1_OLD =
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'\n" +
  "import UsersClient from './UsersClient'\n" +
  "import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'"

const B1_NEW =
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'\n" +
  "import UsersClient from './UsersClient'\n" +
  "import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'\n" +
  "import { scopeAgentsByRole } from '@/lib/admin-homes/scope'"

const B2_OLD =
  '  // Fetch agents for display names\n' +
  '  let agentsQuery = supabase\n' +
  "    .from('agents')\n" +
  "    .select('id, full_name')\n" +
  "  if (!seeAll && tenantId) agentsQuery = agentsQuery.eq('tenant_id', tenantId)\n" +
  "  if (adminUser.role === 'manager' && adminUser.agentId) {\n" +
  "    agentsQuery = agentsQuery.in('id', [adminUser.agentId, ...adminUser.managedAgentIds])\n" +
  "  } else if (adminUser.role === 'agent' && adminUser.agentId) {\n" +
  "    agentsQuery = agentsQuery.eq('id', adminUser.agentId)\n" +
  '  }'

const B2_NEW =
  '  // W5c-2: scope.ts consumer migration. Agents-for-display-names uses\n' +
  '  // scopeAgentsByRole. Note: only THIS query migrates; user_profiles +\n' +
  '  // chat_sessions + overrides keep inline scoping because their patterns\n' +
  '  // (assigned_agent_id IN tenant agents; tenant-only) do not fit existing\n' +
  '  // helpers (see F-W5C-2-USERS-PAGE-PARTIAL-MIGRATION).\n' +
  '  let agentsQuery = supabase\n' +
  "    .from('agents')\n" +
  "    .select('id, full_name')\n" +
  '  agentsQuery = scopeAgentsByRole(agentsQuery, adminUser, hostTenantId)'

const usersPatches = [
  { name: 'B1 users imports', old: B1_OLD, new: B1_NEW },
  { name: 'B2 agents-for-display-names scoping', old: B2_OLD, new: B2_NEW },
].map((p) => ({ name: p.name, old: withLE(p.old, usersInfo.LE), new: withLE(p.new, usersInfo.LE) }))

// ============================================================
// AGENTS/PAGE.TSX (2 anchors)
// ============================================================
let agentsText = agentsInfo.text

const C1_OLD =
  "import { createClient } from '@/lib/supabase/server'\n" +
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'\n" +
  "import { redirect } from 'next/navigation'\n" +
  "import AgentsManagementClient from '@/components/admin-homes/AgentsManagementClient'"

const C1_NEW =
  "import { createClient } from '@/lib/supabase/server'\n" +
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'\n" +
  "import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'\n" +
  "import { isCrossTenantView, getScopedTenantId } from '@/lib/admin-homes/scope'\n" +
  "import { redirect } from 'next/navigation'\n" +
  "import AgentsManagementClient from '@/components/admin-homes/AgentsManagementClient'"

const C2_OLD =
  '  const supabase = createClient()\n' +
  '\n' +
  '  // Tenant scoping\n' +
  '  const seeAll = user.isPlatformAdmin === true && !user.tenantId\n' +
  '  const scopedTenantId = user.tenantId'

const C2_NEW =
  '  const supabase = createClient()\n' +
  '  const hostTenantId = await getCurrentTenantId()\n' +
  '\n' +
  '  // W5c-2: scope.ts consumer migration. Tenant scoping via helpers; no role\n' +
  '  // gate applied (preserved per current behavior -- agents management page\n' +
  '  // lists all tenant agents regardless of manager/agent role to avoid behavior\n' +
  '  // change in this refactor commit; see F-W5C-2-AGENTS-PAGE-NO-ROLE-GATE).\n' +
  '  // Pre-W5c-2 seeAll missed hostTenantId; helper-based check adds it as belt-\n' +
  '  // and-suspenders. In practice user.tenantId already incorporates hostTenantId\n' +
  '  // via auth.ts/getAdminTenantContext priority chain, so no observable delta.\n' +
  '  const seeAll = isCrossTenantView(user, hostTenantId)\n' +
  '  const scopedTenantId = getScopedTenantId(user, hostTenantId)'

const agentsPatches = [
  { name: 'C1 agents imports', old: C1_OLD, new: C1_NEW },
  { name: 'C2 agents seeAll/scopedTenantId', old: C2_OLD, new: C2_NEW },
].map((p) => ({ name: p.name, old: withLE(p.old, agentsInfo.LE), new: withLE(p.new, agentsInfo.LE) }))

// ============================================================
// ANCHOR UNIQUENESS
// ============================================================
function checkUnique(label, text, anchors) {
  for (const a of anchors) {
    const count = text.split(a.old).length - 1
    if (count !== 1) {
      throw new Error(label + ' :: ' + a.name + ' anchor count ' + count + ' != 1')
    }
  }
}

checkUnique('leads/page.tsx', leadsText, leadsPatches)
checkUnique('users/page.tsx', usersText, usersPatches)
checkUnique('agents/page.tsx', agentsText, agentsPatches)
console.log('all anchor uniqueness checks passed')

// ============================================================
// APPLY
// ============================================================
for (const p of leadsPatches) leadsText = leadsText.replace(p.old, p.new)
for (const p of usersPatches) usersText = usersText.replace(p.old, p.new)
for (const p of agentsPatches) agentsText = agentsText.replace(p.old, p.new)

// ============================================================
// POST-PATCH ASSERTIONS
// ============================================================
// leads/page.tsx
if (leadsText.indexOf("import { scopeLeadsQuery, scopeAgentsByRole } from '@/lib/admin-homes/scope'") === -1) {
  throw new Error('post-patch leads: scope import missing')
}
if (leadsText.indexOf('scopeLeadsQuery(query, adminUser, tenantId)') === -1) {
  throw new Error('post-patch leads: scopeLeadsQuery call missing')
}
if (leadsText.indexOf('scopeAgentsByRole(agentsQuery, adminUser, tenantId)') === -1) {
  throw new Error('post-patch leads: scopeAgentsByRole call missing')
}
// Inline leads query role gates must be gone (no `query = query.in('agent_id'`)
if (leadsText.indexOf("query = query.in('agent_id'") !== -1) {
  throw new Error('post-patch leads: old inline agent_id role gate still present')
}
if (leadsText.indexOf("query = query.eq('agent_id', adminUser.agentId)") !== -1) {
  throw new Error('post-patch leads: old inline agent_id eq gate still present')
}
// Inline agents-for-filter role gates must be gone
if (leadsText.indexOf("agentsQuery = agentsQuery.in('id', [adminUser.agentId, ...adminUser.managedAgentIds])") !== -1) {
  throw new Error('post-patch leads: old inline id-in role gate on agentsQuery still present')
}
if (leadsText.indexOf("agentsQuery = agentsQuery.eq('id', adminUser.agentId)") !== -1) {
  throw new Error('post-patch leads: old inline id-eq role gate on agentsQuery still present')
}

// users/page.tsx
if (usersText.indexOf("import { scopeAgentsByRole } from '@/lib/admin-homes/scope'") === -1) {
  throw new Error('post-patch users: scope import missing')
}
if (usersText.indexOf('scopeAgentsByRole(agentsQuery, adminUser, hostTenantId)') === -1) {
  throw new Error('post-patch users: scopeAgentsByRole call missing')
}

// agents/page.tsx
if (agentsText.indexOf("import { isCrossTenantView, getScopedTenantId } from '@/lib/admin-homes/scope'") === -1) {
  throw new Error('post-patch agents: scope import missing')
}
if (agentsText.indexOf("import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'") === -1) {
  throw new Error('post-patch agents: getCurrentTenantId import missing')
}
if (agentsText.indexOf('const hostTenantId = await getCurrentTenantId()') === -1) {
  throw new Error('post-patch agents: hostTenantId fetch missing')
}
if (agentsText.indexOf('const seeAll = isCrossTenantView(user, hostTenantId)') === -1) {
  throw new Error('post-patch agents: isCrossTenantView call missing')
}
if (agentsText.indexOf('const scopedTenantId = getScopedTenantId(user, hostTenantId)') === -1) {
  throw new Error('post-patch agents: getScopedTenantId call missing')
}
// Old inline must be gone
if (agentsText.indexOf('const seeAll = user.isPlatformAdmin === true && !user.tenantId\n') !== -1 ||
    agentsText.indexOf('const seeAll = user.isPlatformAdmin === true && !user.tenantId\r\n') !== -1) {
  throw new Error('post-patch agents: old inline seeAll computation still present')
}

// LE preservation
if (leadsInfo.LE === 'lf' && leadsText.indexOf('\r\n') !== -1) {
  throw new Error('CRLF introduced into LF leads/page.tsx')
}
if (usersInfo.LE === 'lf' && usersText.indexOf('\r\n') !== -1) {
  throw new Error('CRLF introduced into LF users/page.tsx')
}
if (agentsInfo.LE === 'lf' && agentsText.indexOf('\r\n') !== -1) {
  throw new Error('CRLF introduced into LF agents/page.tsx')
}

console.log('all post-patch assertions passed')

// ============================================================
// BACKUP + WRITE
// ============================================================
fs.copyFileSync(FILES.leads, FILES.leads + '.backup_' + stamp)
fs.copyFileSync(FILES.users, FILES.users + '.backup_' + stamp)
fs.copyFileSync(FILES.agents, FILES.agents + '.backup_' + stamp)
fs.writeFileSync(FILES.leads, leadsText, 'utf8')
fs.writeFileSync(FILES.users, usersText, 'utf8')
fs.writeFileSync(FILES.agents, agentsText, 'utf8')

// Re-verify LE
function reverify(filepath, expectedLE) {
  const b = fs.readFileSync(filepath)
  let crlf = 0
  let lf = 0
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0x0a) {
      if (i > 0 && b[i - 1] === 0x0d) crlf++
      else lf++
    }
  }
  if (expectedLE === 'lf' && crlf > 0) throw new Error('LE drift on ' + filepath + ': now has CRLF')
  if (expectedLE === 'crlf' && lf > 0) throw new Error('LE drift on ' + filepath + ': now has LF-only')
}
reverify(FILES.leads, leadsInfo.LE)
reverify(FILES.users, usersInfo.LE)
reverify(FILES.agents, agentsInfo.LE)

console.log('')
console.log('W5c-2 scope.ts consumer migration applied successfully.')
console.log('')
console.log('  ~ ' + FILES.leads)
console.log('    backup: leads/page.tsx.backup_' + stamp)
console.log('  ~ ' + FILES.users)
console.log('    backup: users/page.tsx.backup_' + stamp)
console.log('  ~ ' + FILES.agents)
console.log('    backup: agents/page.tsx.backup_' + stamp)
console.log('  7 anchors applied (3 leads + 2 users + 2 agents)')
console.log('')
console.log('Next:')
console.log('  npx tsc --noEmit')
console.log('  node scripts\\verify-w5c-2-static.js')
console.log('  Visual smoke: /admin-homes/leads + /admin-homes/users + /admin-homes/agents')
console.log('    in WALLiam scope + Universal scope (each must render without 500)')