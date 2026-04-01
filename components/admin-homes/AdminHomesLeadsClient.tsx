// components/admin-homes/AdminHomesLeadsClient.tsx
// WALLiam leads dashboard — v2
// Upgrades: inline status update, source filter, manager column, engagement score, fixed activity panel
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

interface Agent { id: string; full_name: string; email: string }

interface Props {
  initialLeads: Lead[]
  agents: Agent[]
  currentRole: 'admin' | 'manager' | 'agent'
  currentAgentId: string | null
}

const SOURCE_LABELS: Record<string, string> = {
  walliam_charlie: 'Charlie',
  walliam_contact: 'Contact',
  walliam_agent_card: 'Agent Card',
  walliam_charlie_vip_request: 'Charlie VIP',
  walliam_estimator_vip_request: 'Estimator VIP',
  walliam_estimator_questionnaire: 'Estimator Q',
  walliam_appointment: 'Appointment',
}

const SOURCE_COLORS: Record<string, string> = {
  walliam_charlie: 'bg-purple-100 text-purple-700',
  walliam_contact: 'bg-blue-100 text-blue-700',
  walliam_agent_card: 'bg-cyan-100 text-cyan-700',
  walliam_charlie_vip_request: 'bg-violet-100 text-violet-700',
  walliam_estimator_vip_request: 'bg-amber-100 text-amber-700',
  walliam_estimator_questionnaire: 'bg-orange-100 text-orange-700',
  walliam_appointment: 'bg-green-100 text-green-700',
}

const ACTIVITY_SCORES: Record<string, number> = {
  registration: 10,
  estimator_used: 20,
  estimator_contact_submitted: 30,
  contact_form: 15,
  building_visit_request: 25,
  viewed_sold_listings: 15,
  viewed_transaction_history: 10,
}

function calcEngagement(activities: any[]): { score: number; label: string; color: string } {
  const score = Math.min(activities.reduce((s, a) => s + (ACTIVITY_SCORES[a.activity_type] || 0), 0), 100)
  if (score >= 75) return { score, label: 'Hot', color: 'text-red-600' }
  if (score >= 50) return { score, label: 'Warm', color: 'text-orange-500' }
  if (score >= 25) return { score, label: 'Active', color: 'text-yellow-600' }
  return { score, label: 'Cold', color: 'text-gray-400' }
}

export default function AdminHomesLeadsClient({ initialLeads, agents, currentRole, currentAgentId }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterAgent, setFilterAgent] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterQuality, setFilterQuality] = useState('all')
  const [filterIntent, setFilterIntent] = useState('all')
  const [filterSource, setFilterSource] = useState('all')
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'status'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [expandedLead, setExpandedLead] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [activities, setActivities] = useState<Record<string, any[]>>({})
  const [loadingActivities, setLoadingActivities] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  const fetchActivities = async (leadId: string, email: string) => {
    if (activities[leadId]) return
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

  const updateLeadStatus = async (leadId: string, field: 'status' | 'quality', value: string) => {
    setUpdatingStatus(leadId)
    try {
      const res = await fetch(`/api/admin-homes/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, [field]: value } : l))
      }
    } catch (err) {
      console.error('Failed to update lead:', err)
    } finally {
      setUpdatingStatus(null)
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
    if (filterSource !== 'all') f = f.filter(l => l.source === filterSource)
    f.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'date') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      else if (sortBy === 'name') cmp = (a.contact_name || '').localeCompare(b.contact_name || '')
      else if (sortBy === 'status') cmp = (a.status || '').localeCompare(b.status || '')
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return f
  }, [leads, searchTerm, filterAgent, filterStatus, filterQuality, filterIntent, filterSource, sortBy, sortOrder])

  const stats = useMemo(() => ({
    total: leads.length,
    newLeads: leads.filter(l => l.status === 'new').length,
    buyers: leads.filter(l => l.intent === 'buyer').length,
    sellers: leads.filter(l => l.intent === 'seller').length,
    hot: leads.filter(l => l.quality === 'hot').length,
  }), [leads])

  const exportToCSV = () => {
    const headers = ['Date', 'Name', 'Email', 'Phone', 'Source', 'Intent', 'Area', 'Budget', 'Agent', 'Manager', 'Status', 'Quality']
    const rows = filteredLeads.map(l => [
      new Date(l.created_at).toLocaleDateString('en-CA'),
      l.contact_name || '',
      l.contact_email || '',
      l.contact_phone || '',
      l.source || '',
      l.intent || '',
      l.geo_name || '',
      l.budget_max ? `$${Number(l.budget_max).toLocaleString('en-CA')}` : '',
      l.agents?.full_name || '',
      l.manager?.full_name || '',
      l.status || '',
      l.quality || '',
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
      const res = await fetch(`/api/admin-homes/leads/${leadId}`, { method: 'DELETE' })
      if (res.ok) setLeads(leads.filter(l => l.id !== leadId))
      else alert('Failed to delete lead')
    } catch { alert('Error deleting lead') }
  }

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedLeads.size} leads?`)) return
    setDeleting(true)
    try {
      await Promise.all(Array.from(selectedLeads).map(id =>
        fetch(`/api/admin-homes/leads/${id}`, { method: 'DELETE' })
      ))
      setLeads(leads.filter(l => !selectedLeads.has(l.id)))
      setSelectedLeads(new Set())
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
        <p className="text-gray-600 mt-1">All lead sources from walliam.ca</p>
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
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
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
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Source</label>
            <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="all">All Sources</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
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
                {['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Manager', 'Status', 'Quality', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLeads.length === 0 ? (
                <tr><td colSpan={11} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>
              ) : filteredLeads.map(lead => (
                <>
                  <tr key={lead.id} className={`hover:bg-gray-50 ${updatingStatus === lead.id ? 'opacity-60' : ''}`}>
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
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">
                      {new Date(lead.created_at).toLocaleDateString('en-CA')}
                      <div className="text-gray-400">{new Date(lead.created_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{lead.contact_name}</div>
                      <a href={`mailto:${lead.contact_email}`} className="text-blue-600 text-xs">{lead.contact_email}</a>
                      {lead.contact_phone && <div className="text-gray-400 text-xs">{lead.contact_phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[lead.source] || 'bg-slate-100 text-slate-600'}`}>
                        {SOURCE_LABELS[lead.source] || lead.source?.replace('walliam_', '') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lead.intent && (
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${intentColor(lead.intent)}`}>
                          {lead.intent === 'buyer' ? '🏠 Buyer' : '💰 Seller'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{lead.geo_name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-gray-900">{lead.agents?.full_name || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      {lead.manager ? (
                        <div className="text-xs text-gray-500">
                          <span className="text-gray-400 mr-1">↑</span>
                          {lead.manager.full_name}
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    {/* Inline status update */}
                    <td className="px-4 py-3">
                      <select
                        value={lead.status}
                        onChange={e => updateLeadStatus(lead.id, 'status', e.target.value)}
                        disabled={updatingStatus === lead.id}
                        className={`text-xs px-2 py-1 rounded-full font-semibold border-0 cursor-pointer ${statusColor(lead.status)}`}
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="qualified">Qualified</option>
                        <option value="closed">Closed</option>
                      </select>
                    </td>
                    {/* Inline quality update */}
                    <td className="px-4 py-3">
                      <select
                        value={lead.quality}
                        onChange={e => updateLeadStatus(lead.id, 'quality', e.target.value)}
                        disabled={updatingStatus === lead.id}
                        className={`text-xs px-2 py-1 rounded-full font-semibold border-0 cursor-pointer ${qualityColor(lead.quality)}`}
                      >
                        <option value="hot">Hot</option>
                        <option value="warm">Warm</option>
                        <option value="cold">Cold</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-2">
                        {lead.plan_data && (
                          <button
                            onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}
                            className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100"
                          >
                            {expandedLead === lead.id ? 'Hide Plan' : 'Plan'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const key = lead.id + '-activity'
                            const isOpen = expandedLead === key
                            setExpandedLead(isOpen ? null : key)
                            if (!isOpen) fetchActivities(lead.id, lead.contact_email)
                          }}
                          className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded hover:bg-amber-100"
                        >
                          {expandedLead === lead.id + '-activity' ? 'Hide' : 'Activity'}
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

                  {/* Activity timeline */}
                  {expandedLead === lead.id + '-activity' && (
                    <tr key={`${lead.id}-activity`}>
                      <td colSpan={11} className="px-6 py-4 bg-slate-50 border-b">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Activity Timeline — {lead.contact_email}
                          </div>
                          {activities[lead.id] && (() => {
                            const eng = calcEngagement(activities[lead.id])
                            return (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">Engagement Score:</span>
                                <span className={`text-sm font-bold ${eng.color}`}>{eng.score}</span>
                                <span className={`text-xs font-semibold ${eng.color}`}>{eng.label}</span>
                              </div>
                            )
                          })()}
                        </div>
                        {loadingActivities === lead.id ? (
                          <div className="text-sm text-gray-400">Loading...</div>
                        ) : (activities[lead.id] || []).length === 0 ? (
                          <div className="text-sm text-gray-400">No activity recorded yet.</div>
                        ) : (
                          <div className="relative pl-5">
                            <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-200" />
                            {(activities[lead.id] || []).map((a: any) => (
                              <div key={a.id} className="relative mb-3 pl-4">
                                <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-amber-400" style={{ transform: 'translateX(-3px)' }} />
                                <div className="flex items-start gap-3">
                                  <div className="flex-1">
                                    <span className="text-xs font-semibold text-gray-700 px-2 py-0.5 bg-white border rounded-full">
                                      {a.activity_type.replace(/_/g, ' ')}
                                    </span>
                                    {a.activity_data && Object.keys(a.activity_data).length > 0 && (
                                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
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

                  {/* Plan data panel */}
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
                          {lead.plan_data.planType && (
                            <div className="bg-white rounded-lg p-3 border">
                              <div className="text-xs text-gray-400">Plan Type</div>
                              <div className="font-semibold text-gray-900 capitalize">{lead.plan_data.planType}</div>
                            </div>
                          )}
                        </div>
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