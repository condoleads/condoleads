// scripts/patch-c10-admin-leads-agent-brand.js
// C10 -- replace hardcoded WALLiam/walliam.ca strings in admin-homes UI
// with tenant-derived values (brand_name, domain).
// 5 file edits, 6 logical changes. Idempotent. ASCII-only anchors.
// Excludes: AddAgentModal.tsx line 257 (.condoleads.ca suffix is platform-wide
// subdomain serving convention per user confirmation 2026-05-20).

const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()

function detectLineEnding(content) { return content.includes('\r\n') ? '\r\n' : '\n' }
function normalizeAnchorToFileLE(anchor, fileLE) {
  const normalized = anchor.replace(/\r\n/g, '\n')
  return fileLE === '\r\n' ? normalized.replace(/\n/g, '\r\n') : normalized
}

function patchFile(relPath, edits, description, idempotencyMarker) {
  const fullPath = path.join(ROOT, relPath)
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  if (idempotencyMarker && content.includes(idempotencyMarker)) {
    console.log('SKIP ' + relPath + ' -- already patched (marker: ' + idempotencyMarker + ')')
    return
  }

  const normalizedEdits = edits.map(e => ({
    find: normalizeAnchorToFileLE(e.find, LE),
    replace: normalizeAnchorToFileLE(e.replace, LE),
  }))

  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i]
    const occurrences = content.split(edit.find).length - 1
    if (occurrences === 0) throw new Error('Anchor #' + (i+1) + ' not found in ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + '):\n' + edit.find)
    if (occurrences > 1) throw new Error('Anchor #' + (i+1) + ' found ' + occurrences + ' times in ' + relPath + ':\n' + edit.find)
  }

  for (const edit of normalizedEdits) content = content.replace(edit.find, edit.replace)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- ' + edits.length + ' edit(s) -- ' + description)
}

// ============================================================
// 1. app/admin-homes/leads/page.tsx -- add tenant brand fetch + pass props
// ============================================================
patchFile(
  'app/admin-homes/leads/page.tsx',
  [
    // 1a. After scopedTenantId derived, fetch tenant brand info.
    {
      find: `  const seeAll = adminUser?.isPlatformAdmin === true && !adminUser.tenantId && !tenantId
  const scopedTenantId = adminUser?.tenantId ?? tenantId`,
      replace: `  const seeAll = adminUser?.isPlatformAdmin === true && !adminUser.tenantId && !tenantId
  const scopedTenantId = adminUser?.tenantId ?? tenantId

  // C10 -- fetch tenant brand identity for client display strings (page title,
  // subtitle, CSV filename). Falls back to null when no tenant scope (seeAll
  // path or unresolved). Client uses null-safe fallbacks.
  let tenantBrandName: string | null = null
  let tenantDomain: string | null = null
  if (scopedTenantId) {
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('brand_name, name, domain')
      .eq('id', scopedTenantId)
      .single()
    if (tenantRow) {
      tenantBrandName = tenantRow.brand_name || tenantRow.name || null
      tenantDomain = tenantRow.domain || null
    }
  }`,
    },
    // 1b. Empty-state JSX -- pass new props.
    {
      find: `      <AdminHomesLeadsClient
        initialLeads={[]}
        initialActivities={{}}
        agents={[]}
        currentRole={adminUser?.role || 'admin'}
        currentAgentId={adminUser?.agentId || null}
        initialExpanded={initialExpanded}
        initialShowTerminal={initialShowTerminal}
      />`,
      replace: `      <AdminHomesLeadsClient
        initialLeads={[]}
        initialActivities={{}}
        agents={[]}
        currentRole={adminUser?.role || 'admin'}
        currentAgentId={adminUser?.agentId || null}
        initialExpanded={initialExpanded}
        initialShowTerminal={initialShowTerminal}
        tenantBrandName={tenantBrandName}
        tenantDomain={tenantDomain}
      />`,
    },
    // 1c. Populated-state JSX -- pass new props.
    {
      find: `    <AdminHomesLeadsClient
      initialLeads={leads || []}
      initialActivities={activitiesByLeadId}
      agents={agents || []}
      currentRole={adminUser?.role || 'admin'}
      currentAgentId={adminUser?.agentId || null}
      initialExpanded={initialExpanded}
      initialShowTerminal={initialShowTerminal}
    />`,
      replace: `    <AdminHomesLeadsClient
      initialLeads={leads || []}
      initialActivities={activitiesByLeadId}
      agents={agents || []}
      currentRole={adminUser?.role || 'admin'}
      currentAgentId={adminUser?.agentId || null}
      initialExpanded={initialExpanded}
      initialShowTerminal={initialShowTerminal}
      tenantBrandName={tenantBrandName}
      tenantDomain={tenantDomain}
    />`,
    },
  ],
  'C10: leads page tenant brand fetch + 2 JSX props',
  'C10 -- fetch tenant brand identity for client display strings'
)

// ============================================================
// 2. components/admin-homes/AdminHomesLeadsClient.tsx -- accept props, replace 3 literals
// ============================================================
patchFile(
  'components/admin-homes/AdminHomesLeadsClient.tsx',
  [
    // 2a. Props interface -- add tenantBrandName + tenantDomain.
    {
      find: `interface Props {
  initialLeads: Lead[]
  initialActivities: Record<string, any[]>
  agents: Agent[]
  currentRole: 'admin' | 'manager' | 'agent'
  currentAgentId: string | null
  initialExpanded: boolean
  initialShowTerminal: boolean
}`,
      replace: `// C10 -- tenantBrandName + tenantDomain props for display-string substitution.
interface Props {
  initialLeads: Lead[]
  initialActivities: Record<string, any[]>
  agents: Agent[]
  currentRole: 'admin' | 'manager' | 'agent'
  currentAgentId: string | null
  initialExpanded: boolean
  initialShowTerminal: boolean
  tenantBrandName: string | null
  tenantDomain: string | null
}`,
    },
    // 2b. Destructure tenantBrandName + tenantDomain in default export.
    {
      find: `export default function AdminHomesLeadsClient({ initialLeads, initialActivities, agents, currentRole, currentAgentId, initialExpanded, initialShowTerminal }: Props) {`,
      replace: `export default function AdminHomesLeadsClient({ initialLeads, initialActivities, agents, currentRole, currentAgentId, initialExpanded, initialShowTerminal, tenantBrandName, tenantDomain }: Props) {`,
    },
    // 2c. CSV download filename.
    {
      find: "    a.download = `walliam-leads-${new Date().toISOString().split('T')[0]}.csv`",
      replace: `    // C10 -- filename slug derived from tenant domain (e.g., walliam.ca -> walliam-ca, aily.ca -> aily-ca).
    const _c10_slug = tenantDomain ? tenantDomain.replace(/\\./g, '-') : 'tenant'
    a.download = \`\${_c10_slug}-leads-\${new Date().toISOString().split('T')[0]}.csv\``,
    },
    // 2d. Page h1 + subtitle.
    {
      find: `        <h1 className="text-3xl font-bold text-gray-900">WALLiam Leads</h1>
        <p className="text-gray-600 mt-1">All lead sources from walliam.ca</p>`,
      replace: `        {/* C10 -- tenant-aware page header */}
        <h1 className="text-3xl font-bold text-gray-900">{tenantBrandName ?? 'Tenant'} Leads</h1>
        <p className="text-gray-600 mt-1">All lead sources from {tenantDomain ?? 'this tenant'}</p>`,
    },
  ],
  'C10: leads client (4 edits)',
  'C10 -- tenantBrandName + tenantDomain props for display-string substitution'
)

// ============================================================
// 3. app/admin-homes/agents/page.tsx -- compute tenantBrandName + tenantDomain
// ============================================================
patchFile(
  'app/admin-homes/agents/page.tsx',
  [
    // 3a. Extend tenants SELECT to include brand_name.
    {
      find: `  let tenantsQuery = supabase
    .from('tenants')
    .select('id, name, domain')
    .order('name')`,
      replace: `  // C10 -- include brand_name for admin modal display strings.
  let tenantsQuery = supabase
    .from('tenants')
    .select('id, name, domain, brand_name')
    .order('name')`,
    },
    // 3b. Compute tenantBrandName + tenantDomain alongside tenantName.
    {
      find: `  const tenantName =
    scopedTenantId
      ? (tenants || []).find(t => t.id === scopedTenantId)?.name ?? null
      : null`,
      replace: `  const tenantName =
    scopedTenantId
      ? (tenants || []).find(t => t.id === scopedTenantId)?.name ?? null
      : null

  // C10 -- brand_name (falls back to name) + domain for admin modal display strings.
  const _c10_scopedTenant = scopedTenantId
    ? (tenants || []).find(t => t.id === scopedTenantId)
    : null
  const tenantBrandName = _c10_scopedTenant
    ? (_c10_scopedTenant.brand_name || _c10_scopedTenant.name || null)
    : null
  const tenantDomain = _c10_scopedTenant?.domain ?? null`,
    },
    // 3c. Empty-state JSX -- pass props.
    {
      find: `      return <AgentsManagementClient agents={[]} tenants={[]} tenantName={null} />`,
      replace: `      return <AgentsManagementClient agents={[]} tenants={[]} tenantName={null} tenantBrandName={null} tenantDomain={null} />`,
    },
    // 3d. Populated-state JSX -- pass props.
    {
      find: `  return <AgentsManagementClient agents={agentsWithStats} tenants={tenants || []} tenantName={tenantName} />`,
      replace: `  return <AgentsManagementClient agents={agentsWithStats} tenants={tenants || []} tenantName={tenantName} tenantBrandName={tenantBrandName} tenantDomain={tenantDomain} />`,
    },
  ],
  'C10: agents page tenant brand fetch (4 edits)',
  'C10 -- include brand_name for admin modal display strings'
)

// ============================================================
// 4. components/admin-homes/AgentsManagementClient.tsx -- accept + thread props
// ============================================================
patchFile(
  'components/admin-homes/AgentsManagementClient.tsx',
  [
    // 4a. Default export signature -- destructure new props.
    {
      find: `export default function AgentsManagementClient({ agents, tenants, tenantName }: { agents: Agent[], tenants: Tenant[], tenantName: string | null }) {`,
      replace: `// C10 -- tenantBrandName + tenantDomain threaded to AddAgentModal.
export default function AgentsManagementClient({ agents, tenants, tenantName, tenantBrandName, tenantDomain }: { agents: Agent[], tenants: Tenant[], tenantName: string | null, tenantBrandName: string | null, tenantDomain: string | null }) {`,
    },
    // 4b. AddAgentModal callsite -- pass new props.
    {
      find: `      <AddAgentModal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setPreselectedParentId(null) }}
        onSuccess={() => window.location.reload()}
        preselectedParentId={preselectedParentId}
        existingAgents={agents}
      />`,
      replace: `      {/* C10 -- thread tenant brand identity into modal for display strings */}
      <AddAgentModal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setPreselectedParentId(null) }}
        onSuccess={() => window.location.reload()}
        preselectedParentId={preselectedParentId}
        existingAgents={agents}
        tenantBrandName={tenantBrandName}
        tenantDomain={tenantDomain}
      />`,
    },
  ],
  'C10: agents client (2 edits)',
  'C10 -- tenantBrandName + tenantDomain threaded to AddAgentModal'
)

// ============================================================
// 5. components/admin-homes/AddAgentModal.tsx -- accept props, replace 3 literals
// ============================================================
patchFile(
  'components/admin-homes/AddAgentModal.tsx',
  [
    // 5a. Props interface -- add new fields.
    {
      find: `interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  existingAgents?: Agent[]
  preselectedParentId?: string | null
}`,
      replace: `// C10 -- tenant brand identity props for display-string substitution.
interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  existingAgents?: Agent[]
  preselectedParentId?: string | null
  tenantBrandName?: string | null
  tenantDomain?: string | null
}`,
    },
    // 5b. Default export signature -- destructure new props.
    {
      find: `export default function AddAgentModal({ isOpen, onClose, onSuccess, existingAgents = [], preselectedParentId = null }: Props) {`,
      replace: `export default function AddAgentModal({ isOpen, onClose, onSuccess, existingAgents = [], preselectedParentId = null, tenantBrandName = null, tenantDomain = null }: Props) {`,
    },
    // 5c. Modal title -- line 126.
    {
      find: `          <h2 className="text-2xl font-bold text-gray-900">Add WALLiam Agent</h2>`,
      replace: `          {/* C10 -- tenant-aware modal title */}
          <h2 className="text-2xl font-bold text-gray-900">Add {tenantBrandName ?? 'Tenant'} Agent</h2>`,
    },
    // 5d. VIP comment + section header (lines 156-158).
    {
      find: `          {/* VIP Config — WALLiam specific */}`,
      replace: `          {/* C10 -- VIP Config (tenant-specific) */}`,
    },
    {
      find: `            <h3 className="font-semibold text-green-900 mb-3">✦ WALLiam VIP Access Config</h3>`,
      replace: `            {/* C10 -- tenant-aware VIP config header */}
            <h3 className="font-semibold text-green-900 mb-3">✦ {tenantBrandName ?? 'Tenant'} VIP Access Config</h3>`,
    },
  ],
  'C10: AddAgentModal (5 edits)',
  'C10 -- tenant brand identity props for display-string substitution'
)

console.log('\n=== C10 patch complete ===')