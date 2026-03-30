// components/admin-homes/AgentsManagementClient.tsx
'use client'

import { useState } from 'react'
import { Users, TrendingUp, Building2, Plus, Pencil, MapPin, UserCheck, ChevronDown, ChevronRight, X } from 'lucide-react'
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

export default function AgentsManagementClient({ agents, tenants }: { agents: Agent[], tenants: Tenant[] }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editAgentId, setEditAgentId] = useState<string | null>(null)
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(new Set())
  const [preselectedParentId, setPreselectedParentId] = useState<string | null>(null)

  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t]))

  function getTeamMembers(managerId: string) {
    return agents.filter(a => a.parent_id === managerId)
  }

  function getManagerName(parentId: string | null) {
    if (!parentId) return null
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

  const filteredAgents = agents.filter(a => {
    const matchSearch = a.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchSearch && !a.parent_id
  })

  const stats = {
    total: agents.length,
    active: agents.filter(a => a.is_active).length,
    managers: agents.filter(a => a.can_create_children).length,
    totalLeads: agents.reduce((s, a) => s + a.total_leads, 0),
  }

  function RoleBadge({ agent }: { agent: Agent }) {
    if (agent.can_create_children)
      return <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium"><UserCheck className="w-3 h-3" /> Manager</span>
    if (agent.parent_id)
      return <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"><Users className="w-3 h-3" /> Agent</span>
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
    const teamMembers = agent.can_create_children ? getTeamMembers(agent.id) : []
    const isExpanded = expandedManagers.has(agent.id)
    const managerName = getManagerName(agent.parent_id)

    return (
      <>
        <tr className={isNested ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}>
          {/* Agent */}
          <td className="px-5 py-4">
            <div className="flex items-center gap-3">
              {!isNested && agent.can_create_children && teamMembers.length > 0 && (
                <button onClick={() => toggleExpand(agent.id)} className="p-1 hover:bg-gray-200 rounded">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              )}
              {(!agent.can_create_children || teamMembers.length === 0) && !isNested && <div className="w-6" />}
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
              <RoleBadge agent={agent} />
              {managerName && <p className="text-xs text-gray-400">Under: {managerName}</p>}
              {agent.can_create_children && teamMembers.length > 0 && (
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
        {agent.can_create_children && isExpanded && teamMembers.map(member => (
          <AgentRow key={member.id} agent={member} isNested />
        ))}
      </>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">WALLiam Agents</h1>
        <p className="text-gray-600">Manage agents, hierarchy, and territory assignments</p>
      </div>

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

      <AddAgentModal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setPreselectedParentId(null) }}
        onSuccess={() => window.location.reload()}
        preselectedParentId={preselectedParentId}
        existingAgents={agents}
      />
      <EditAgentModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditAgentId(null) }}
        onSuccess={() => window.location.reload()}
        agentId={editAgentId}
        existingAgents={agents}
      />
    </div>
  )
}