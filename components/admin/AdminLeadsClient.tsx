'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Lead {
  id: string
  contact_name: string
  contact_email: string
  contact_phone: string
  message: string
  source: string
  status: string
  quality: string
  agent_id: string
  building_id: string
  created_at: string
  agents?: {
    id: string
    full_name: string
    email: string
  }
  buildings?: {
    id: string
    building_name: string
  }
}

interface Agent {
  id: string
  full_name: string
  email: string
}

interface Building {
  id: string
  building_name: string
}

interface AdminLeadsClientProps {
  initialLeads: Lead[]
  agents: Agent[]
  buildings: Building[]
}

export default function AdminLeadsClient({ 
  initialLeads, 
  agents, 
  buildings 
}: AdminLeadsClientProps) {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterAgent, setFilterAgent] = useState<string>('all')
  const [filterBuilding, setFilterBuilding] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterQuality, setFilterQuality] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'status'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Filter and sort leads
  const filteredLeads = useMemo(() => {
    let filtered = [...leads]

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(lead => 
        lead.contact_name?.toLowerCase().includes(search) ||
        lead.contact_email?.toLowerCase().includes(search) ||
        lead.contact_phone?.includes(search) ||
        lead.message?.toLowerCase().includes(search)
      )
    }

    // Agent filter
    if (filterAgent !== 'all') {
      filtered = filtered.filter(lead => lead.agent_id === filterAgent)
    }

    // Building filter
    if (filterBuilding !== 'all') {
      filtered = filtered.filter(lead => lead.building_id === filterBuilding)
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(lead => lead.status === filterStatus)
    }

    // Quality filter
    if (filterQuality !== 'all') {
      filtered = filtered.filter(lead => lead.quality === filterQuality)
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      
      if (sortBy === 'date') {
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      } else if (sortBy === 'name') {
        comparison = (a.contact_name || '').localeCompare(b.contact_name || '')
      } else if (sortBy === 'status') {
        comparison = (a.status || '').localeCompare(b.status || '')
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [leads, searchTerm, filterAgent, filterBuilding, filterStatus, filterQuality, sortBy, sortOrder])

  // Stats
  const stats = useMemo(() => {
    const total = leads.length
    const newLeads = leads.filter(l => l.status === 'new').length
    const contacted = leads.filter(l => l.status === 'contacted').length
    const qualified = leads.filter(l => l.status === 'qualified').length
    const hot = leads.filter(l => l.quality === 'hot').length

    return { total, newLeads, contacted, qualified, hot }
  }, [leads])

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Date', 'Name', 'Email', 'Phone', 'Agent', 'Building', 'Status', 'Quality', 'Message']
    const rows = filteredLeads.map(lead => [
      new Date(lead.created_at).toLocaleDateString(),
      lead.contact_name || '',
      lead.contact_email || '',
      lead.contact_phone || '',
      lead.agents?.full_name || '',
      lead.buildings?.building_name || '',
      lead.status || '',
      lead.quality || '',
      (lead.message || '').replace(/,/g, ';')
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  // Delete lead
  const deleteLead = async (leadId: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return

    try {
      const response = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setLeads(leads.filter(l => l.id !== leadId))
        alert('Lead deleted successfully')
      } else {
        alert('Failed to delete lead')
      }
    } catch (error) {
      console.error('Error deleting lead:', error)
      alert('Error deleting lead')
    }
  }

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'new': return 'bg-blue-100 text-blue-800'
      case 'contacted': return 'bg-yellow-100 text-yellow-800'
      case 'qualified': return 'bg-green-100 text-green-800'
      case 'closed': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getQualityColor = (quality: string) => {
    switch(quality) {
      case 'hot': return 'bg-red-100 text-red-800'
      case 'warm': return 'bg-orange-100 text-orange-800'
      case 'cold': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">All Leads</h1>
        <p className="text-gray-600 mt-2">View and manage leads from all agents</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Total Leads</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">New</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">{stats.newLeads}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Contacted</div>
          <div className="text-3xl font-bold text-yellow-600 mt-2">{stats.contacted}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Qualified</div>
          <div className="text-3xl font-bold text-green-600 mt-2">{stats.qualified}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Hot</div>
          <div className="text-3xl font-bold text-red-600 mt-2">{stats.hot}</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Name, email, phone, message..."
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Agent Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Agent
            </label>
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Agents</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Building Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Building
            </label>
            <select
              value={filterBuilding}
              onChange={(e) => setFilterBuilding(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Buildings</option>
              {buildings.map(building => (
                <option key={building.id} value={building.id}>
                  {building.building_name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Quality Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quality
            </label>
            <select
              value={filterQuality}
              onChange={(e) => setFilterQuality(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Quality</option>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
            </select>
          </div>
        </div>

        {/* Sort and Export */}
        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <div className="flex gap-4">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
              <option value="status">Sort by Status</option>
            </select>

            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              {sortOrder === 'asc' ? ' Ascending' : ' Descending'}
            </button>
          </div>

          <button
            onClick={exportToCSV}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Export to CSV
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-4 text-sm text-gray-600">
        Showing {filteredLeads.length} of {leads.length} leads
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Building
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quality
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No leads found matching your filters
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {lead.contact_name}
                      </div>
                      <div className="text-sm text-gray-500">{lead.contact_email}</div>
                      <div className="text-sm text-gray-500">{lead.contact_phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {lead.agents?.full_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {lead.buildings?.building_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(lead.status)}`}>
                        {lead.status || 'new'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getQualityColor(lead.quality)}`}>
                        {lead.quality || 'cold'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => deleteLead(lead.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
