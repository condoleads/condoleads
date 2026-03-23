// components/admin-homes/AgentsManagementClient.tsx
// Adapted from components/admin/AgentsManagementClient.tsx
// WALLiam differences: site_type='comprehensive', geo territories, no subdomain display
'use client'

import { useState } from 'react'
import { Users, TrendingUp, Building2, Plus, Pencil, MapPin, UserCheck, ChevronDown, ChevronRight, X } from 'lucide-react'
import AddAgentModal from './AddAgentModal'
import EditAgentModal from './EditAgentModal'
import Link from 'next/link'

interface Agent {
  id: string
  full_name: string
  email: string
  cell_phone: string | null
  profile_photo_url: string | null
  is_active: boolean
  role: string | null
  parent_id: string | null
  can_create_children: boolean
  created_at: string
  total_leads: number
  new_leads: number
  hot_leads: number
  geo_territories: number
  assigned_buildings: number
  ai_free_messages: number | null
  vip_auto_approve: boolean | null
  subdomain: string
}

export default function AgentsManagementClient({ agents }: { agents: Agent[] }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editAgentId, setEditAgentId] = useState<string | null>(null)
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(new Set())
  const [preselectedParentId, setPreselectedParentId] = useState<string | null>(null)

  function getTeamMembers(managerId: string) {
    return agents.filter(a => a.parent_id === managerId)
  }

  function toggleExpand(managerId: string) {
    const s = new Set(expandedManagers)
    s.has(managerId) ? s.delete(managerId) : s.add(managerId)
    setExpandedManagers(s)
  }

  async function removeFromTeam(agentId: string, agentName: string) {
    if (!confirm(`Remove ${agentName} from team? They become a solo agent.`)) return
    const res = await fetch(`/api/admin/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: null }),
    })
    const data = await res.json()
    if (data.success) window.location.reload()
    else alert('Error: ' + data.error)
  }

  const filteredAgents = agents.filter(a => {
    const matchSearch = a.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchSearch && !a.parent_id // top-level only
  })

  const stats = {
    total: agents.length,
    active: agents.filter(a => a.is_active).length,
    managers: agents.filter(a => a.can_create_children).length,
    totalLeads: agents.reduce((s, a) => s + a.total_leads, 0),
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
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Agent', 'Hierarchy', 'Territories', 'Buildings', 'Leads', 'VIP Config', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredAgents.map(agent => {
              const teamMembers = agent.can_create_children ? getTeamMembers(agent.id) : []
              const isExpanded = expandedManagers.has(agent.id)

              return (
                <>
                  <tr key={agent.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {agent.can_create_children && teamMembers.length > 0 && (
                          <button onClick={() => toggleExpand(agent.id)} className="p-1 hover:bg-gray-200 rounded">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        )}
                        {(!agent.can_create_children || teamMembers.length === 0) && <div className="w-6" />}
                        <div className="w-9 h-9 rounded-full bg-green-700 flex items-center justify-center text-white font-semibold overflow-hidden flex-shrink-0">
                          {agent.profile_photo_url
                            ? <img src={agent.profile_photo_url} alt={agent.full_name} className="w-full h-full object-cover" />
                            : agent.full_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{agent.full_name}</p>
                          <p className="text-xs text-gray-500">{agent.email}</p>
                          {agent.can_create_children && teamMembers.length > 0 && (
                            <p className="text-xs text-orange-600">{teamMembers.length} team member{teamMembers.length > 1 ? 's' : ''}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {agent.can_create_children && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                          <UserCheck className="w-3 h-3" /> Manager
                        </span>
                      )}
                      {!agent.parent_id && !agent.can_create_children && (
                        <span className="text-xs text-gray-400">Solo Agent</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4 text-green-600" />
                        <span className="font-semibold">{agent.geo_territories}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <Building2 className="w-4 h-4 text-green-600" />
                        <span className="font-semibold">{agent.assigned_buildings}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold">{agent.total_leads}</p>
                      <p className="text-xs text-gray-400">{agent.new_leads} new · {agent.hot_leads} hot</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs text-gray-600">{agent.ai_free_messages ?? 1} free plan{(agent.ai_free_messages ?? 1) > 1 ? 's' : ''}</p>
                      <p className="text-xs text-gray-400">{agent.vip_auto_approve ? 'Auto-approve' : 'Manual approve'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${agent.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {agent.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
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
                      </div>
                    </td>
                  </tr>
                  {/* Nested team members */}
                  {agent.can_create_children && isExpanded && teamMembers.map(member => (
                    <tr key={member.id} className="bg-orange-50 hover:bg-orange-100">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 pl-12">
                          <div className="w-8 h-8 rounded-full bg-orange-400 flex items-center justify-center text-white text-sm font-semibold overflow-hidden">
                            {member.profile_photo_url
                              ? <img src={member.profile_photo_url} alt={member.full_name} className="w-full h-full object-cover" />
                              : member.full_name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{member.full_name}</p>
                            <p className="text-xs text-gray-500">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3"><span className="text-xs text-gray-500">Under: {agent.full_name}</span></td>
                      <td className="px-5 py-3"><div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-green-500" /><span className="text-sm font-semibold">{member.geo_territories}</span></div></td>
                      <td className="px-5 py-3"><div className="flex items-center gap-1"><Building2 className="w-3 h-3 text-green-500" /><span className="text-sm font-semibold">{member.assigned_buildings}</span></div></td>
                      <td className="px-5 py-3"><p className="text-sm">{member.total_leads} total</p></td>
                      <td className="px-5 py-3"><p className="text-xs text-gray-500">{member.ai_free_messages ?? 1} free</p></td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${member.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {member.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => { setEditAgentId(member.id); setShowEditModal(true) }} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-white rounded">
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <Link href={`/admin-homes/agents/${member.id}`} className="flex items-center gap-1 px-2 py-1 text-xs text-green-700 hover:bg-white rounded">
                            <MapPin className="w-3 h-3" /> Assign
                          </Link>
                          <button onClick={() => removeFromTeam(member.id, member.full_name)} className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">
                            <X className="w-3 h-3" /> Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              )
            })}
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