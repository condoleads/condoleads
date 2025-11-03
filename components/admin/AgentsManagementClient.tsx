'use client'

import { useState } from 'react'
import { Users, Mail, Phone, TrendingUp, Building2, Plus } from 'lucide-react'

export default function AgentsManagementClient({ agents }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const filteredAgents = agents.filter(function(agent) {
    const matchesSearch = agent.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || agent.email?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === 'all' || agent.role === roleFilter
    return matchesSearch && matchesRole
  })

  const activeAgents = agents.filter(function(a) { return a.is_active }).length
  const totalLeads = agents.reduce(function(sum, a) { return sum + a.total_leads }, 0)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Agent Management</h1>
        <p className="text-gray-600">Manage agents and assign buildings</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Agents</p>
              <p className="text-3xl font-bold text-gray-900">{agents.length}</p>
            </div>
            <Users className="w-12 h-12 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Agents</p>
              <p className="text-3xl font-bold text-green-600">{activeAgents}</p>
            </div>
            <TrendingUp className="w-12 h-12 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Leads</p>
              <p className="text-3xl font-bold text-purple-600">{totalLeads}</p>
            </div>
            <TrendingUp className="w-12 h-12 text-purple-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow mb-6 p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <input type="text" placeholder="Search agents..." value={searchTerm} onChange={function(e) { setSearchTerm(e.target.value) }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg" />
          <select value={roleFilter} onChange={function(e) { setRoleFilter(e.target.value) }} className="px-4 py-2 border border-gray-300 rounded-lg">
            <option value="all">All Roles</option>
            <option value="agent">Agents</option>
            <option value="admin">Admins</option>
          </select>
        </div>
        <p className="mt-4 text-sm text-gray-600">Showing {filteredAgents.length} of {agents.length} agents</p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Buildings</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leads</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredAgents.map(function(agent) {
              return (
                <tr key={agent.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                        {agent.full_name?.charAt(0) || 'A'}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{agent.full_name}</p>
                        <p className="text-sm text-gray-500">{agent.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">{agent.email}</div>
                    {agent.phone && <div className="text-sm text-gray-600">{agent.phone}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={'px-2 py-1 text-xs font-semibold rounded-full ' + (agent.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700')}>
                      {agent.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-semibold text-gray-900">{agent.assigned_buildings}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold">{agent.total_leads} total</p>
                    <p className="text-xs text-gray-500">{agent.new_leads} new  {agent.hot_leads} hot</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={'px-2 py-1 text-xs font-semibold rounded-full ' + (agent.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                      {agent.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <a href={'/admin/agents/' + agent.id} className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded">
                      <Building2 className="w-4 h-4" />
                      Assign
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}