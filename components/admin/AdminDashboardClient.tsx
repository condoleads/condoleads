'use client'

import { Users, Building2, TrendingUp, BarChart3 } from 'lucide-react'

interface AdminDashboardClientProps {
  stats: any
  agents: any[]
  buildings: any[]
}

export default function AdminDashboardClient({ stats, agents, buildings }: AdminDashboardClientProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600 mt-1">CondoLeads Platform Control Center</p>
            </div>
            <div className="flex gap-3">
              <a href="/admin/buildings/batch-sync" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Sync Buildings
              </a>
              <a href="/admin/database/validate" className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
                Database Tools
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Agents</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalAgents}</p>
              </div>
              <Users className="w-12 h-12 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Buildings</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalBuildings}</p>
              </div>
              <Building2 className="w-12 h-12 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Leads</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalLeads}</p>
              </div>
              <TrendingUp className="w-12 h-12 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Hot Leads</p>
                <p className="text-3xl font-bold text-red-600">{stats.hotLeads}</p>
              </div>
              <TrendingUp className="w-12 h-12 text-red-600" />
            </div>
          </div>
        </div>

        {/* Lead Status Breakdown */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Lead Status Overview</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{stats.newLeads}</p>
                <p className="text-sm text-gray-600">New</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.contactedLeads}</p>
                <p className="text-sm text-gray-600">Contacted</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">{stats.qualifiedLeads}</p>
                <p className="text-sm text-gray-600">Qualified</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-600">{stats.closedLeads}</p>
                <p className="text-sm text-gray-600">Closed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{stats.hotLeads}</p>
                <p className="text-sm text-gray-600">Hot</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <a href="/admin/agents" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <Users className="w-10 h-10 text-blue-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Agents</h3>
            <p className="text-sm text-gray-600">View, add, and assign buildings to agents</p>
          </a>

          <a href="/admin/buildings/batch-sync" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <Building2 className="w-10 h-10 text-green-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Buildings</h3>
            <p className="text-sm text-gray-600">Sync, edit, and manage building data</p>
          </a>

          <a href="/admin/leads" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <BarChart3 className="w-10 h-10 text-purple-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">View All Leads</h3>
            <p className="text-sm text-gray-600">Monitor and manage leads across all agents</p>
          </a>
        </div>

        {/* Recent Agents */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Recent Agents</h2>
          </div>
          <div className="p-6">
            {agents.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No agents yet</p>
            ) : (
              <div className="space-y-3">
                {agents.slice(0, 5).map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                        {agent.full_name?.charAt(0) || 'A'}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{agent.full_name}</p>
                        <p className="text-sm text-gray-500">{agent.email}</p>
                      </div>
                    </div>
                    <a href={`/admin/agents/${agent.id}`} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                      Manage
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
