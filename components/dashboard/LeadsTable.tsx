'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Search, Download, Building2 } from 'lucide-react'

interface LeadsTableProps {
  leads: any[]
  agentId: string
  isAdmin?: boolean
  isManager?: boolean
}

export default function LeadsTable({ leads, agentId, isAdmin = false, isManager = false }: LeadsTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [qualityFilter, setQualityFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch = 
      lead.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.contact_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.buildings?.building_name?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
    const matchesQuality = qualityFilter === 'all' || lead.quality === qualityFilter
    const matchesSource = sourceFilter === 'all' || lead.source === sourceFilter
    const matchesAgent = agentFilter === 'all' || lead.agents?.id === agentFilter

    return matchesSearch && matchesStatus && matchesQuality && matchesSource && matchesAgent
  })

  const getSourceLabel = (source: string): string => {
  const sourceLabels: Record<string, string> = {
    'registration': 'Registration',
    'sale_evaluation_request': 'Request to List',
    'building_visit_request': 'Building Visit Request',
    'sale_offer_inquiry': 'Sale Offer Inquiry',
    'lease_offer_inquiry': 'Lease Offer Inquiry',
    'lease_evaluation_request': 'Lease Evaluation',
    'estimator': 'Used Price Estimator',
    'message_agent': 'Contact Form',
    'contact_form': 'Contact Form',
    'building_page': 'Building Page',
    'property_inquiry': 'Property Inquiry',
    'list_your_unit': 'Request to List'
  }
  return sourceLabels[source] || source.replace(/_/g, ' ')
}

  const getQualityBadge = (quality: string) => {
    const colors: Record<string, string> = {
      hot: 'bg-red-100 text-red-700 border-red-200',
      warm: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      cold: 'bg-blue-100 text-blue-700 border-blue-200'
    }
    return colors[quality] || colors.cold
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      new: 'bg-green-100 text-green-700 border-green-200',
      contacted: 'bg-blue-100 text-blue-700 border-blue-200',
      qualified: 'bg-purple-100 text-purple-700 border-purple-200',
      closed: 'bg-gray-100 text-gray-700 border-gray-200',
      lost: 'bg-red-100 text-red-700 border-red-200'
    }
    return colors[status] || colors.new
  }

  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'Phone', 'Building', 'Source', 'Quality', 'Status', 'Tags', 'Created']
    const rows = filteredLeads.map(lead => [
      lead.contact_name,
      lead.contact_email,
      lead.contact_phone || '',
      lead.buildings?.building_name || 'No building',
      lead.source,
      lead.quality,
      lead.status,
      (lead.tags || []).join('; '),
      new Date(lead.created_at).toLocaleDateString()
    ])

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by name, email, or building..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="closed">Closed</option>
            <option value="lost">Lost</option>
          </select>

          <select
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Quality</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Sources</option>
            <option value="registration">Registration</option>
            <option value="estimator">Estimator</option>
            <option value="contact_form">Contact Form</option>
            <option value="property_inquiry">Property Inquiry</option>
          </select>


          {(isAdmin || isManager) && (
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Agents</option>
              {Array.from(new Set(leads.map(l => l.agents?.id).filter(Boolean))).map((agentId) => {
                const agent = leads.find(l => l.agents?.id === agentId)?.agents
                return (
                  <option key={agentId} value={agentId}>
                    {agent?.full_name || agent?.email || 'Unknown'}
                  </option>
                )
              })}
            </select>
          )}
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          Showing {filteredLeads.length} of {leads.length} leads
        </div>
      </div>

      <div className="overflow-x-auto">
        {filteredLeads.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No leads found
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                {(isAdmin || isManager) && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Building</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tags</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quality</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">{lead.contact_name}</p>
                    <p className="text-sm text-gray-500">{lead.contact_email}</p>
                    {lead.contact_phone && <p className="text-xs text-gray-400">{lead.contact_phone}</p>}
                  </td>
                  {(isAdmin || isManager) && (
                    <td className="px-6 py-4">
                      {lead.agents ? (
                        <div>
                          <p className="text-sm font-medium text-gray-900">{lead.agents.full_name}</p>
                            {lead.agents.parent && <p className="text-xs text-blue-600">Manager: {lead.agents.parent.full_name}</p>}
                          <p className="text-xs text-gray-500">{lead.agents.subdomain}.condoleads.ca</p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No agent</span>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-4">
                    {lead.buildings ? (
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {lead.buildings.building_name}
                            {(lead.mls_listings?.unit_number || lead.property_details?.unitNumber) && ` ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ Unit ${lead.mls_listings?.unit_number || lead.property_details?.unitNumber}`}
                          </p>
                          <p className="text-xs text-gray-500">{lead.buildings.canonical_address}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-red-600 font-medium"> No building</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">{getSourceLabel(lead.source)}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(lead.tags || []).length === 0 ? (
                        <span className="text-xs text-gray-400">No tags</span>
                      ) : (
                        (lead.tags || []).slice(0, 2).map((tag: string) => (
                          <span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                            {tag}
                          </span>
                        ))
                      )}
                      {(lead.tags || []).length > 2 && (
                        <span className="text-xs text-gray-500">+{lead.tags.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getQualityBadge(lead.quality)}`}>
                      {lead.quality}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getStatusBadge(lead.status)}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-6 py-4">
                    <a href={`/dashboard/leads/${lead.id}`} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
