// components/admin-homes/AgentsManagementClient.tsx
'use client'

import { useState } from 'react'
import { Users, TrendingUp, Building2, Plus, Pencil, MapPin, UserCheck, ChevronDown, ChevronRight, X, Crown } from 'lucide-react'
import AddAgentModal from './AddAgentModal'
import EditAgentModal from './EditAgentModal'
import Link from 'next/link'

interface Tenant { id: string; name: string; domain: string }

interface Agent {
  id: string
  full_name: string
  email: string
  cell_phone: string | null
  profile_photo_url: string | null
  is_active: boolean
  parent_id: string | null
  can_create_children: boolean
  tenant_id: string | null
  notification_email: string | null
  brokerage_name: string | null
  title: string | null
  created_at: string
  total_leads: number
  new_leads: number
  hot_leads: number
  geo_territories: number
  assigned_buildings: number
  subdomain: string
}

// C10 -- tenantBrandName + tenantDomain threaded to AddAgentModal.
// D26 (P3.F5) -- tenantId threaded from server page to AddAgentModal so the
// modal posts to the correct admin-scope tenant instead of the
// hostname-derived useTenantId() value (which leaks cross-tenant on localhost).
// W-HOUSE-ACCOUNT UNIT 3 -- tenantDefaultAgentId threaded so the list can
// render a Crown badge on the holding agent's row. Multi-tenant safe — driven
// by the scoped tenant's own default_agent_id, never hardcoded.
// W-HOUSE-ACCOUNT UNIT 10 -- canSetOversightOptOut threaded so the
// EditAgentModal only renders the opt-out toggle for viewers who can write
// it. Backstop is the server PUT gate (Unit 9); this stops a non-admin
// viewer being shown a control that would 403.
// W-AGENT-CREATE UNIT 18: tenantBrokerageName + tenantBrokerageAddress
// threaded through to AddAgentModal so the brokerage fields pre-fill from
// the scoped tenant's values. Each is null when the tenant row has no
// value (no fabricated default). Multi-tenant safe — driven entirely by
// the scoped tenant's own columns, never hardcoded.
export default function AgentsManagementClient({ agents, tenants, tenantName, tenantBrandName, tenantDomain, tenantId, tenantDefaultAgentId = null, canSetOversightOptOut = false, tenantBrokerageName = null, tenantBrokerageAddress = null }: { agents: Agent[], tenants: Tenant[], tenantName: string | null, tenantBrandName: string | null, tenantDomain: string | null, tenantId: string | null, tenantDefaultAgentId?: string | null, canSetOversightOptOut?: boolean, tenantBrokerageName?: string | null, tenantBrokerageAddress?: string | null }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editAgentId, setEditAgentId] = useState<string | null>(null)
  // W-HOUSE-ACCOUNT UNIT 17: default-expand every row that has team
  // members. Unit 13's "Set as house account" row action is rendered per
  // AgentRow but only DOM-rendered when the row is visible. Under Unit 5/
  // 6/7's operating-tree nesting, every non-owner agent is nested under
  // their parent; with the prior `new Set()` initial state, those rows
  // stayed collapsed by default and the assignable action was effectively
  // hidden — operators saw only Ovais's disabled "Current house account"
  // and Olga's no-action (assistant) and concluded the action was missing.
  //
  // Initializer lazy form: computed once at mount from the `agents` prop;
  // collected at expand-call sites still mutate the set. Multi-tenant
  // safe — driven entirely by the per-tenant `agents` prop, no hardcoding.
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(
    () => new Set(agents.filter(a => agents.some(x => x.parent_id === a.id)).map(a => a.id))
  )
  const [preselectedParentId, setPreselectedParentId] = useState<string | null>(null)

  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t]))

  // W-HOUSE-ACCOUNT UNIT 5+6+7: operating-hierarchy display via parent_id
  // forest walk. The tenant owner (role=tenant_admin) is shown in the owner
  // header AND ALSO as a real tree node — its reports nest under it. UNIT 5
  // wrongly excluded the owner from the tree entirely, decapitating anyone
  // whose parent_id pointed at the owner (Aily Manager, WALLiam Neo Smith /
  // WALLiam agent). UNIT 7 puts the owner back into the tree node set while
  // keeping the owner header card as a useful label.
  //
  // UNIT 6 invariant preserved: a node is a root whenever parent_id is NULL
  // OR points to an agent NOT in the visible set (inactive / deleted /
  // cross-tenant orphan). Owners are NO LONGER excluded from visibleIds —
  // so a child of the owner correctly nests under the owner, not orphans.
  //
  // Multi-tenant safe — no tenant ids or brand names in any rule.
  const OWNER_ROLE = 'tenant_admin'
  const ownerIds = new Set(agents.filter(a => (a as any).role === OWNER_ROLE).map(a => a.id))
  const owners = agents.filter(a => (a as any).role === OWNER_ROLE)
  // visibleIds = the set of agent ids that participate in the operating
  // tree. UNIT 7: now includes EVERYONE (owners included). Used purely as
  // the "is parent in scope?" oracle for the UNIT 6 orphan-as-root rule.
  const visibleIds = new Set(agents.map(a => a.id))

  function getTeamMembers(managerId: string) {
    return agents.filter(a => a.parent_id === managerId)
  }

  // True when this agent should appear as a top-level row in the operating
  // hierarchy view. UNIT 7: the owner exclusion is REMOVED — the owner is
  // a tree node with parent_id=NULL, so it naturally hits rule 1 and renders
  // as a root with its reports nesting under it.
  //   1. parent_id IS NULL -> root.
  //   2. parent_id points to a node NOT in visibleIds -> root.
  //      (UNIT 6 orphan-as-root: inactive parent, deleted parent, cross-
  //      tenant orphan all surface as their own root rather than vanish.)
  //   3. Otherwise nests under its real parent_id via getTeamMembers().
  function isOperatingRoot(a: Agent): boolean {
    if (!a.parent_id) return true
    return !visibleIds.has(a.parent_id)
  }

  function getManagerName(parentId: string | null) {
    if (!parentId) return null
    // W-HOUSE-ACCOUNT UNIT 5+6+7: skip the "Under: <X>" line when the parent
    // is not in visibleIds (UNIT 6 orphan case: inactive parent, deleted
    // parent, cross-tenant orphan). UNIT 7: visibleIds now INCLUDES the
    // owner, so an agent whose parent is the owner WILL show "Under:
    // <owner name>" correctly. The orphan-as-root logic still skips this
    // line for true orphans (parent missing from visibleIds).
    if (!visibleIds.has(parentId)) return null
    return agents.find(a => a.id === parentId)?.full_name || null
  }

  function toggleExpand(managerId: string) {
    const s = new Set(expandedManagers)
    s.has(managerId) ? s.delete(managerId) : s.add(managerId)
    setExpandedManagers(s)
  }

  async function removeFromTeam(agentId: string, agentName: string) {
    if (!confirm(`Remove ${agentName} from team? They become a solo agent.`)) return
    const res = await fetch(`/api/admin-homes/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: null }),
    })
    const data = await res.json()
    if (data.success) window.location.reload()
    else alert('Error: ' + data.error)
  }

  async function deleteAgent(agentId: string, agentName: string) {
    if (!confirm(`Permanently delete ${agentName}? This cannot be undone.`)) return
    const res = await fetch(`/api/admin-homes/agents/${agentId}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) window.location.reload()
    else alert('Error: ' + data.error)
  }

  // W-HOUSE-ACCOUNT UNIT 13: inline "Set as house account" action on each
  // row. Reuses the SAME validated PATCH path as UNIT 2's drawer (PATCH
  // /api/admin-homes/tenants/[tenantId] { default_agent_id }); the Phase 1
  // Part 2 app-layer validation + validate_house_account trigger are the
  // authoritative gates. Friendly 400s from those gates surface inline as
  // a window.alert() — same pattern as the existing remove/delete handlers.
  async function setAsHouseAccount(targetAgentId: string, targetAgentName: string) {
    if (!tenantId) { alert('Tenant context unavailable; cannot assign house account.'); return }
    if (!confirm(`Make ${targetAgentName} the house account? Leads with no territory match will fall back to them.`)) return
    const res = await fetch(`/api/admin-homes/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_agent_id: targetAgentId }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Phase 1 Part 2 pre-validation surfaces 400s with messages mirroring
      // the validate_house_account trigger's 4 conditions. Surface inline.
      alert('Cannot set house account: ' + (j.error || `HTTP ${res.status}`))
      return
    }
    window.location.reload()
  }

  // W-HOUSE-ACCOUNT UNIT 5: deterministic role-based ordering for the
  // visible top-level rows (operating roots + tenant-level assistants /
  // support / managed). Owners are excluded from the tree — they render in
  // the separate owner header above the table. Unknown / forward-compat roles
  // (e.g. future 'admin_assistant' from Phase 3) fall to the end of the
  // ordering, ensuring graceful render rather than a crash.
  const ROLE_ORDER: Record<string, number> = {
    area_manager: 1,
    manager:      2,
    agent:        3,
    managed:      4,
    assistant:    5,
    support:      6,
  }
  const filteredAgents = agents
    .filter(a => {
      const matchSearch = a.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.email?.toLowerCase().includes(searchTerm.toLowerCase())
      return matchSearch && isOperatingRoot(a)
    })
    .sort((x, y) => {
      const rx = ROLE_ORDER[(x as any).role] ?? 99
      const ry = ROLE_ORDER[(y as any).role] ?? 99
      if (rx !== ry) return rx - ry
      return (x.full_name || '').localeCompare(y.full_name || '')
    })

  const stats = {
    total: agents.length,
    active: agents.filter(a => a.is_active).length,
    managers: agents.filter(a => a.can_create_children).length,
    totalLeads: agents.reduce((s, a) => s + a.total_leads, 0),
  }

  // D29 (W-MULTITENANT-BENCH P3.F5): badge reads agent.role directly from DB,
  // not inferred from hierarchy flags. Friendly-label map covers all 5
  // DB role values (agents_role_check) plus a fallback for unexpected values.
  const ROLE_LABELS: Record<string, { label: string; classes: string }> = {
    agent:        { label: 'Agent',         classes: 'bg-blue-100 text-blue-700' },
    manager:      { label: 'Manager',       classes: 'bg-orange-100 text-orange-700' },
    area_manager: { label: 'Area Manager',  classes: 'bg-purple-100 text-purple-700' },
    tenant_admin: { label: 'Tenant Admin',  classes: 'bg-emerald-100 text-emerald-700' },
    admin:        { label: 'Platform Admin', classes: 'bg-rose-100 text-rose-700' },
  }

  function RoleBadge({ agent }: { agent: Agent }) {
    const role = (agent as any).role as string | null
    const entry = (role && ROLE_LABELS[role]) || { label: role || 'Unknown', classes: 'bg-gray-100 text-gray-700' }
    const Icon = (role === 'manager' || role === 'area_manager' || role === 'tenant_admin' || role === 'admin') ? UserCheck : Users
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 ${entry.classes} rounded-full text-xs font-medium`}>
        <Icon className="w-3 h-3" /> {entry.label}
      </span>
    )
    return <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs">Solo</span>
  }

  function TenantBadge({ tenantId }: { tenantId: string | null }) {
    if (!tenantId) return <span className="text-xs text-gray-400">—</span>
    const t = tenantMap[tenantId]
    if (!t) return <span className="text-xs text-gray-400">{tenantId.slice(0, 8)}</span>
    return (
      <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
        {t.name}
      </span>
    )
  }

  function AgentRow({ agent, isNested = false }: { agent: Agent; isNested?: boolean }) {
    const teamMembers = getTeamMembers(agent.id)
    const isExpanded = expandedManagers.has(agent.id)
    const managerName = getManagerName(agent.parent_id)

    return (
      <>
        <tr className={isNested ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}>
          {/* Agent */}
          <td className="px-5 py-4">
            <div className="flex items-center gap-3">
              {teamMembers.length > 0 && (
                  <button onClick={() => toggleExpand(agent.id)} className="p-1 hover:bg-gray-200 rounded">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              )}
              {teamMembers.length === 0 && <div className="w-6" />}
              {isNested && <div className="w-10" />}
              <div className="w-10 h-10 rounded-full bg-green-700 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0 text-sm">
                {agent.profile_photo_url
                  ? <img src={agent.profile_photo_url} alt={agent.full_name} className="w-full h-full object-cover" />
                  : agent.full_name?.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{agent.full_name}</p>
                <p className="text-xs text-gray-500">{agent.email}</p>
                {agent.cell_phone && <p className="text-xs text-gray-400">{agent.cell_phone}</p>}
                {agent.brokerage_name && <p className="text-xs text-gray-400">{agent.brokerage_name}</p>}
              </div>
            </div>
          </td>
          {/* Tenant */}
          <td className="px-5 py-4">
            <TenantBadge tenantId={agent.tenant_id} />
          </td>
          {/* Role + Reports To */}
          <td className="px-5 py-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <RoleBadge agent={agent} />
                {/* W-HOUSE-ACCOUNT UNIT 3: Crown badge when this agent is the
                    tenant's current default_agent_id. Amber harmonizes with
                    the org chart marker (Unit 2). */}
                {tenantDefaultAgentId && agent.id === tenantDefaultAgentId && (
                  <span
                    title="House account — catch-all for unrouted leads"
                    className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-xs font-medium"
                  >
                    <Crown className="w-3 h-3" /> House Account
                  </span>
                )}
              </div>
              {managerName && <p className="text-xs text-gray-400">Under: {managerName}</p>}
              {teamMembers.length > 0 && (
                <p className="text-xs text-orange-600">{teamMembers.length} agent{teamMembers.length > 1 ? 's' : ''}</p>
              )}
            </div>
          </td>
          {/* Territories */}
          <td className="px-5 py-4">
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4 text-green-600" />
              <span className="font-semibold">{agent.geo_territories}</span>
            </div>
          </td>
          {/* Buildings */}
          <td className="px-5 py-4">
            <div className="flex items-center gap-1">
              <Building2 className="w-4 h-4 text-green-600" />
              <span className="font-semibold">{agent.assigned_buildings}</span>
            </div>
          </td>
          {/* Leads */}
          <td className="px-5 py-4">
            <p className="font-semibold">{agent.total_leads}</p>
            <p className="text-xs text-gray-400">{agent.new_leads} new · {agent.hot_leads} hot</p>
          </td>
          {/* Status */}
          <td className="px-5 py-4">
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${agent.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {agent.is_active ? 'Active' : 'Inactive'}
            </span>
          </td>
          {/* Actions */}
          <td className="px-5 py-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => { setEditAgentId(agent.id); setShowEditModal(true) }} className="flex items-center gap-1 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">
                <Pencil className="w-3 h-3" /> Edit
              </button>
              <Link href={`/admin-homes/agents/${agent.id}`} className="flex items-center gap-1 px-3 py-1 text-xs text-green-700 hover:bg-green-50 rounded">
                <MapPin className="w-3 h-3" /> Assign
              </Link>
              {/* W-HOUSE-ACCOUNT UNIT 13: inline "Set as house account" row
                  action. Gated to tenant_admin / assistant / admin / platform
                  admin viewers (same canSetOversightOptOut predicate from
                  UNITs 10/12 — admin-level writes to tenant agent records).
                  Hidden for role='assistant' rows: assistants are barred from
                  being house account by the validate_house_account trigger
                  contract (Phase 1) — no point offering a button that always
                  fails. The current holder's row shows a disabled "Current"
                  label instead of the action, mirroring UNIT 2 drawer UX. */}
              {canSetOversightOptOut && tenantId && (agent as any).role !== 'assistant' && (
                tenantDefaultAgentId === agent.id ? (
                  <span
                    title="This agent is the current house account."
                    className="flex items-center gap-1 px-3 py-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded cursor-default"
                  >
                    <Crown className="w-3 h-3" /> Current house account
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAsHouseAccount(agent.id, agent.full_name)}
                    className="flex items-center gap-1 px-3 py-1 text-xs text-amber-700 border border-amber-300 hover:bg-amber-50 rounded"
                    title="Make this agent the catch-all for unrouted leads."
                  >
                    <Crown className="w-3 h-3" /> Set as house
                  </button>
                )
              )}
              {agent.can_create_children && (
                <button onClick={() => { setPreselectedParentId(agent.id); setShowAddModal(true) }} className="flex items-center gap-1 px-3 py-1 text-xs text-orange-600 hover:bg-orange-50 rounded">
                  <Plus className="w-3 h-3" /> Add Agent
                </button>
              )}
              {isNested && (
                <button onClick={() => removeFromTeam(agent.id, agent.full_name)} className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">
                  <X className="w-3 h-3" /> Remove
                </button>
              )}
              <button onClick={() => deleteAgent(agent.id, agent.full_name)} className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">
                🗑 Delete
              </button>
            </div>
          </td>
        </tr>
        {/* Nested team members */}
        {isExpanded && teamMembers.map(member => (
          <AgentRow key={member.id} agent={member} isNested />
        ))}
      </>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{tenantName ? `${tenantName} Agents` : 'Agents'}</h1>
            <p className="text-gray-600">Manage agents, hierarchy, and territory assignments</p>
          </div>
          <Link
            href="/admin-homes/agents/tree"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md"
          >
            <span>📊</span>
            <span>Org Chart</span>
          </Link>
        </div>

      {/* W-HOUSE-ACCOUNT UNIT 5: Tenant owner header. tenant_admin agents are
          surfaced here as the owner(s), NOT as the root of the operating tree.
          Multi-tenant safe — keyed on role only, so every tenant's owner
          renders the same way. */}
      {owners.length > 0 && (
        <div className="mb-6 bg-white rounded-lg shadow p-5 border-l-4 border-purple-600">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Tenant Owner</p>
          </div>
          <div className="flex flex-col gap-2">
            {owners.map(o => {
              const isHouse = tenantDefaultAgentId && o.id === tenantDefaultAgentId
              return (
                <div key={o.id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-700 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0 text-sm">
                    {o.profile_photo_url
                      ? <img src={o.profile_photo_url} alt={o.full_name} className="w-full h-full object-cover" />
                      : (o.full_name?.charAt(0) || '?')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{o.full_name}</p>
                    <p className="text-xs text-gray-500">{o.email}</p>
                  </div>
                  {isHouse && (
                    <span
                      title="House account — catch-all for unrouted leads"
                      className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-xs font-medium"
                    >
                      <Crown className="w-3 h-3" /> House Account
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Total Agents', value: stats.total, color: 'text-gray-900', icon: <Users className="w-10 h-10 text-green-600" /> },
          { label: 'Active', value: stats.active, color: 'text-green-600', icon: <TrendingUp className="w-10 h-10 text-green-500" /> },
          { label: 'Managers', value: stats.managers, color: 'text-orange-600', icon: <UserCheck className="w-10 h-10 text-orange-500" /> },
          { label: 'Total Leads', value: stats.totalLeads, color: 'text-purple-600', icon: <TrendingUp className="w-10 h-10 text-purple-500" /> },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg shadow p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{s.label}</p>
              <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
            {s.icon}
          </div>
        ))}
      </div>

      {/* Search + Add */}
      <div className="bg-white rounded-lg shadow mb-6 p-5">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search agents..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Add Agent
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-400">Showing {filteredAgents.length} of {agents.length} agents</p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Agent', 'Tenant', 'Role / Hierarchy', 'Territories', 'Buildings', 'Leads', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredAgents.map(agent => (
              <AgentRow key={agent.id} agent={agent} />
            ))}
          </tbody>
        </table>
        {filteredAgents.length === 0 && (
          <div className="p-8 text-center text-gray-400">No agents found</div>
        )}
      </div>

      {/* C10 -- thread tenant brand identity into modal for display strings */}
      {/* D26 (P3.F5) -- tenantId from admin-scope context, not hostname-derived hook */}
      <AddAgentModal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setPreselectedParentId(null) }}
        onSuccess={() => window.location.reload()}
        preselectedParentId={preselectedParentId}
        existingAgents={agents}
        tenantBrandName={tenantBrandName}
        tenantDomain={tenantDomain}
        tenantId={tenantId}
        tenantBrokerageName={tenantBrokerageName}
        tenantBrokerageAddress={tenantBrokerageAddress}
      />
      <EditAgentModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditAgentId(null) }}
        onSuccess={() => window.location.reload()}
        agentId={editAgentId}
        existingAgents={agents}
        canSetOversightOptOut={canSetOversightOptOut}
      />
    </div>
  )
}