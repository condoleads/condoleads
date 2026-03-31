// components/admin-homes/AdminHomesLeadsClient.tsx
// Adapted from components/admin/AdminLeadsClient.tsx
// WALLiam-specific: intent filter, geo_name, plan_data expandable panel
'use client'

import { useState, useMemo } from 'react'

interface Lead {
  id: string
  contact_name: string
  contact_email: string
  contact_phone: string
  source: string
  intent: string | null
  geo_name: string | null
  budget_max: number | null
  plan_data: any | null
  status: string
  quality: string
  agent_id: string | null
  manager_id: string | null
  assignment_source: string | null
  created_at: string
  agents?: { id: string; full_name: string; email: string }
  manager?: { id: string; full_name: string; email: string }
}

interface Agent {
  id: string
  full_name: string
  email: string
}

interface Props {
  initialLeads: Lead[]
  agents: Agent[]
  currentRole: 'admin' | 'manager' | 'agent'
  currentAgentId: string | null
}

export default function AdminHomesLeadsClient({ initialLeads, agents, currentRole, currentAgentId }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterAgent, setFilterAgent] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterQuality, setFilterQuality] = useState('all')
  const [filterIntent, setFilterIntent] = useState('all')
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'status'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [expandedLead, setExpandedLead] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [activities, setActivities] = useState<Record<string, any[]>>({})
  const [loadingActivities, setLoadingActivities] = useState<string | null>(null)

  const fetchActivities = async (leadId: string, email: string) => {
    if (activities[leadId]) return // already loaded
    setLoadingActivities(leadId)
    try {
      const res = await fetch(`/api/admin-homes/activities?email=${encodeURIComponent(email)}`)
      const data = await res.json()
      setActivities(prev => ({ ...prev, [leadId]: data.activities || [] }))
    } catch (err) {
      console.error('Failed to fetch activities:', err)
    } finally {
      setLoadingActivities(null)
    }
  }

  const filteredLeads = useMemo(() => {
    let f = [...leads]
    if (searchTerm) {
      const s = searchTerm.toLowerCase()
      f = f.filter(l =>
        l.contact_name?.toLowerCase().includes(s) ||
        l.contact_email?.toLowerCase().includes(s) ||
        l.contact_phone?.includes(s) ||
        l.geo_name?.toLowerCase().includes(s)
      )
    }
    if (filterAgent !== 'all') f = f.filter(l => l.agent_id === filterAgent)
    if (filterStatus !== 'all') f = f.filter(l => l.status === filterStatus)
    if (filterQuality !== 'all') f = f.filter(l => l.quality === filterQuality)
    if (filterIntent !== 'all') f = f.filter(l => l.intent === filterIntent)
    f.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'date') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      else if (sortBy === 'name') cmp = (a.contact_name || '').localeCompare(b.contact_name || '')
      else if (sortBy === 'status') cmp = (a.status || '').localeCompare(b.status || '')
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return f
  }, [leads, searchTerm, filterAgent, filterStatus, filterQuality, filterIntent, sortBy, sortOrder])

  const stats = useMemo(() => ({
    total: leads.length,
    newLeads: leads.filter(l => l.status === 'new').length,
    buyers: leads.filter(l => l.intent === 'buyer').length,
    sellers: leads.filter(l => l.intent === 'seller').length,
    hot: leads.filter(l => l.quality === 'hot').length,
  }), [leads])

  const exportToCSV = () => {
    const headers = ['Date', 'Name', 'Email', 'Phone', 'Intent', 'Area', 'Budget Max', 'Agent', 'Status', 'Quality', 'Source']
    const rows = filteredLeads.map(l => [
      new Date(l.created_at).toLocaleDateString('en-CA'),
      l.contact_name || '',
      l.contact_email || '',
      l.contact_phone || '',
      l.intent || '',
      l.geo_name || '',
      l.budget_max ? `$${Number(l.budget_max).toLocaleString('en-CA')}` : '',
      l.agents?.full_name || '',
      l.status || '',
      l.quality || '',
      l.source || '',
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `walliam-leads-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const deleteLead = async (leadId: string) => {
    if (!confirm('Delete this lead?')) return
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, { method: 'DELETE' })
      if (res.ok) setLeads(leads.filter(l => l.id !== leadId))
      else alert('Failed to delete lead')
    } catch { alert('Error deleting lead') }
  }

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedLeads.size} leads?`)) return
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/leads/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: Array.from(selectedLeads) }),
      })
      if (res.ok) {
        setLeads(leads.filter(l => !selectedLeads.has(l.id)))
        setSelectedLeads(new Set())
      } else alert('Failed to delete leads')
    } catch { alert('Error deleting leads') }
    finally { setDeleting(false) }
  }

  const statusColor = (s: string) => ({
    new: 'bg-blue-100 text-blue-800',
    contacted: 'bg-yellow-100 text-yellow-800',
    qualified: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
  }[s] || 'bg-gray-100 text-gray-800')

  const qualityColor = (q: string) => ({
    hot: 'bg-red-100 text-red-800',
    warm: 'bg-orange-100 text-orange-800',
    cold: 'bg-blue-100 text-blue-800',
  }[q] || 'bg-gray-100 text-gray-800')

  const intentColor = (i: string) => ({
    buyer: 'bg-indigo-100 text-indigo-800',
    seller: 'bg-emerald-100 text-emerald-800',
  }[i] || 'bg-gray-100 text-gray-800')

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">WALLiam Leads</h1>
        <p className="text-gray-600 mt-1">Charlie AI plan leads from walliam.ca</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900' },
          { label: 'New', value: stats.newLeads, color: 'text-blue-600' },
          { label: 'Buyers', value: stats.buyers, color: 'text-indigo-600' },
          { label: 'Sellers', value: stats.sellers, color: 'text-emerald-600' },
          { label: 'Hot', value: stats.hot, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg shadow p-5">
            <div className="text-sm text-gray-500">{s.label}</div>
            <div className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Name, email, phone, area..."
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Intent</label>
            <select value={filterIntent} onChange={e => setFilterIntent(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="all">All</option>
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Agent</label>
            <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="all">All Agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Quality</label>
            <select value={filterQuality} onChange={e => setFilterQuality(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="all">All</option>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
            </select>
          </div>
        </div>
        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <div className="flex gap-3">
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
              <option value="status">Sort by Status</option>
            </select>
            <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">
              {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>
          <div className="flex gap-2">
            {selectedLeads.size > 0 && (
              <button onClick={handleDeleteSelected} disabled={deleting} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting...' : `Delete (${selectedLeads.size})`}
              </button>
            )}
            <button onClick={exportToCSV} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="mb-3 text-sm text-gray-500">Showing {filteredLeads.length} of {leads.length} leads</div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3">
                  <input type="checkbox"
                    checked={selectedLeads.size === filteredLeads.length && filteredLeads.length > 0}
                    onChange={e => setSelectedLeads(e.target.checked ? new Set(filteredLeads.map(l => l.id)) : new Set())}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
                {['Date', 'Contact', 'Source', 'Intent', 'Area', 'Budget', 'Agent', 'Status', 'Quality', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLeads.length === 0 ? (
                <tr><td colSpan={10} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>
              ) : filteredLeads.map(lead => (
                <>
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input type="checkbox"
                        checked={selectedLeads.has(lead.id)}
                        onChange={e => {
                          const s = new Set(selectedLeads)
                          e.target.checked ? s.add(lead.id) : s.delete(lead.id)
                          setSelectedLeads(s)
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {new Date(lead.created_at).toLocaleDateString('en-CA')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{lead.contact_name}</div>
                      <a href={`mailto:${lead.contact_email}`} className="text-blue-600 text-xs">{lead.contact_email}</a>
                      {lead.contact_phone && <div className="text-gray-400 text-xs">{lead.contact_phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs font-mono bg-slate-100 text-slate-600 whitespace-nowrap">
                        {lead.source?.replace('walliam_', '') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lead.intent && (
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${intentColor(lead.intent)}`}>
                          {lead.intent === 'buyer' ? '🏠 Buyer' : '💰 Seller'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{lead.geo_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {lead.budget_max ? `$${Number(lead.budget_max).toLocaleString('en-CA')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{lead.agents?.full_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor(lead.status)}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${qualityColor(lead.quality)}`}>
                        {lead.quality}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-2">
                        {lead.plan_data && (
                          <button
                            onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}
                            className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100"
                          >
                            {expandedLead === lead.id ? 'Hide Plan' : 'View Plan'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                           const isOpen = expandedLead === lead.id + '-activity'
                          setExpandedLead(isOpen ? null : lead.id + '-activity')
                         if (!isOpen) fetchActivities(lead.id, lead.contact_email)
                     }}
                           className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded hover:bg-amber-100"
                          >
                          {expandedLead === lead.id + '-activity' ? 'Hide Activity' : 'Activity'}
                          </button>
                        <button
                          onClick={() => deleteLead(lead.id)}                          
                          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedLead === lead.id + '-activity' && (
  <tr key={`${lead.id}-activity`}>
    <td colSpan={11} className="px-6 py-4 bg-slate-50 border-b">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Activity Timeline — {lead.contact_email}
      </div>
      {loadingActivities === lead.id ? (
        <div className="text-sm text-gray-400">Loading...</div>
      ) : (activities[lead.id] || []).length === 0 ? (
        <div className="text-sm text-gray-400">No activity recorded yet.</div>
      ) : (
        <div className="relative pl-4">
          <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gray-200" />
          {(activities[lead.id] || []).map((a: any) => (
            <div key={a.id} className="relative mb-3 pl-5">
              <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-amber-400 -translate-x-[3px]" />
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <span className="text-xs font-semibold text-gray-700 px-2 py-0.5 bg-white border rounded-full">
                    {a.activity_type.replace(/_/g, ' ')}
                  </span>
                  {a.activity_data && Object.keys(a.activity_data).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {Object.entries(a.activity_data).filter(([_, v]) => v).map(([k, v]: any) => (
                        <span key={k} className="text-xs text-gray-500">
                          <span className="text-gray-400">{k}:</span> {String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(a.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </td>
  </tr>
)}
                  {/* Expandable plan_data panel */}
                  {expandedLead === lead.id && lead.plan_data && (
                    <tr key={`${lead.id}-plan`}>
                      <td colSpan={11} className="px-6 py-4 bg-gray-50 border-b">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Plan Data</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          {lead.plan_data.geoName && (
                            <div className="bg-white rounded-lg p-3 border">
                              <div className="text-xs text-gray-400">Area</div>
                              <div className="font-semibold text-gray-900">{lead.plan_data.geoName}</div>
                            </div>
                          )}
                          {lead.plan_data.budgetMax && (
                            <div className="bg-white rounded-lg p-3 border">
                              <div className="text-xs text-gray-400">Budget</div>
                              <div className="font-semibold text-gray-900">
                                {lead.plan_data.budgetMin ? `$${Number(lead.plan_data.budgetMin).toLocaleString('en-CA')} – ` : ''}
                                ${Number(lead.plan_data.budgetMax).toLocaleString('en-CA')}
                              </div>
                            </div>
                          )}
                          {lead.plan_data.propertyType && (
                            <div className="bg-white rounded-lg p-3 border">
                              <div className="text-xs text-gray-400">Property Type</div>
                              <div className="font-semibold text-gray-900">{lead.plan_data.propertyType}</div>
                            </div>
                          )}
                          {lead.plan_data.timeline && (
                            <div className="bg-white rounded-lg p-3 border">
                              <div className="text-xs text-gray-400">Timeline</div>
                              <div className="font-semibold text-gray-900">{lead.plan_data.timeline}</div>
                            </div>
                          )}
                          {lead.plan_data.estimatedValueMin && (
                            <div className="bg-white rounded-lg p-3 border">
                              <div className="text-xs text-gray-400">Est. Value</div>
                              <div className="font-semibold text-gray-900">
                                ${Number(lead.plan_data.estimatedValueMin).toLocaleString('en-CA')} – ${Number(lead.plan_data.estimatedValueMax).toLocaleString('en-CA')}
                              </div>
                            </div>
                          )}
                          {lead.plan_data.goal && (
                            <div className="bg-white rounded-lg p-3 border">
                              <div className="text-xs text-gray-400">Goal</div>
                              <div className="font-semibold text-gray-900">{lead.plan_data.goal}</div>
                            </div>
                          )}
                        </div>
                        {/* Top listings */}
                        {lead.plan_data.topListings?.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Matched Listings</div>
                            <div className="flex flex-wrap gap-2">
                              {lead.plan_data.topListings.map((l: any, i: number) => (
                                <a
                                  key={i}
                                  href={l.slug ? `/${l.slug}` : '#'}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs px-3 py-1.5 bg-white border rounded-lg text-blue-600 hover:bg-blue-50"
                                >
                                  {l.address?.split(',')[0]} — ${Number(l.price || 0).toLocaleString('en-CA')}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}