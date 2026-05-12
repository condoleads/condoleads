// components/admin-homes/AdminHomesLeadsClient.tsx
// WALLiam leads dashboard — v2
// Upgrades: inline status update, source filter, manager column, engagement score, fixed activity panel
'use client'
import { useState, useMemo, useEffect } from 'react'
import { deriveLeadOriginRoute, type LeadOriginRoute } from '@/lib/utils/lead-origin-route'

interface Lead {
  id: string
  user_id: string | null
  tenant_id: string
  notes: string | null
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
  area_manager_id: string | null
  tenant_admin_id: string | null
  assignment_source: string | null
  created_at: string
  agents?: { id: string; full_name: string; email: string }
  manager?: { id: string; full_name: string; email: string }
  area_manager?: { id: string; full_name: string; email: string }
  tenant_admin?: { id: string; full_name: string; email: string }
}

interface Agent { id: string; full_name: string; email: string }

interface Props {
  initialLeads: Lead[]
  initialActivities: Record<string, any[]>
  initialCreditOverrides: Record<string, any>
  initialVipRequests: Record<string, any[]>
  initialEmailLog: Record<string, any[]>
  initialNotes: Record<string, any[]>
  agents: Agent[]
  currentRole: 'admin' | 'manager' | 'agent'
  currentAgentId: string | null
}

const ROUTE_LABELS: Record<LeadOriginRoute, string> = {
  charlie: 'Charlie',
  charlie_vip_request: 'Charlie VIP',
  estimator: 'Estimator',
  estimator_questionnaire: 'Estimator Q',
  estimator_vip_request: 'Estimator VIP',
  contact_form: 'Contact',
  registration: 'Registration',
  property_inquiry: 'Property',
  building_visit: 'Building Visit',
  sale_evaluation: 'Sale Eval',
  unknown: 'Unknown',
}

const ROUTE_COLORS: Record<LeadOriginRoute, string> = {
  charlie: 'bg-purple-100 text-purple-700',
  charlie_vip_request: 'bg-violet-100 text-violet-700',
  estimator: 'bg-amber-50 text-amber-600',
  estimator_questionnaire: 'bg-orange-100 text-orange-700',
  estimator_vip_request: 'bg-amber-100 text-amber-700',
  contact_form: 'bg-blue-100 text-blue-700',
  registration: 'bg-emerald-100 text-emerald-700',
  property_inquiry: 'bg-cyan-100 text-cyan-700',
  building_visit: 'bg-teal-100 text-teal-700',
  sale_evaluation: 'bg-pink-100 text-pink-700',
  unknown: 'bg-slate-100 text-slate-600',
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

const QUALITY_VALUES = ['unqualified', 'qualified_hot', 'qualified_cold', 'disqualified'] as const
type QualityValue = typeof QUALITY_VALUES[number]
const QUALITY_LABELS: Record<QualityValue, string> = {
  unqualified: 'Unqualified',
  qualified_hot: 'Hot',
  qualified_cold: 'Cold',
  disqualified: 'Disqualified',
}

export default function AdminHomesLeadsClient({ initialLeads, initialActivities, initialCreditOverrides, initialVipRequests, initialEmailLog, initialNotes, agents, currentRole, currentAgentId }: Props) {
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
  const [activities, setActivities] = useState<Record<string, any[]>>(initialActivities)
  const [creditOverrides, setCreditOverrides] = useState<Record<string, any>>(initialCreditOverrides)
  const [vipRequests, setVipRequests] = useState<Record<string, any[]>>(initialVipRequests)
  const [grantFormOpenFor, setGrantFormOpenFor] = useState<string | null>(null)
  const [grantFormValues, setGrantFormValues] = useState<{ aiChatLimit: string; buyerPlanLimit: string; sellerPlanLimit: string; estimatorLimit: string }>({ aiChatLimit: '', buyerPlanLimit: '', sellerPlanLimit: '', estimatorLimit: '' })
  const [granting, setGranting] = useState<string | null>(null)
  const [drawerOpenForLead, setDrawerOpenForLead] = useState<Lead | null>(null)
  const [emailLog] = useState<Record<string, any[]>>(initialEmailLog)
  const [notes] = useState<Record<string, any[]>>(initialNotes)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpenForLead(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

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

  const handleOpenGrantForm = (lead: Lead) => {
    if (!lead.user_id) return
    const existing = creditOverrides[lead.user_id as string]
    setGrantFormValues({
      aiChatLimit: existing?.ai_chat_limit != null ? String(existing.ai_chat_limit) : '',
      buyerPlanLimit: existing?.buyer_plan_limit != null ? String(existing.buyer_plan_limit) : '',
      sellerPlanLimit: existing?.seller_plan_limit != null ? String(existing.seller_plan_limit) : '',
      estimatorLimit: existing?.estimator_limit != null ? String(existing.estimator_limit) : '',
    })
    setGrantFormOpenFor(lead.id)
  }

  const handleSubmitGrant = async (lead: Lead) => {
    if (!lead.user_id) return
    setGranting(lead.id)
    try {
      const parseField = (s: string): number | null => {
        const t = s.trim()
        if (t === '') return null
        const n = parseInt(t, 10)
        return isNaN(n) ? null : n
      }
      const body = {
        userId: lead.user_id,
        tenantId: lead.tenant_id,
        agentId: currentAgentId,
        agentTier: currentRole,
        note: 'Granted from leads page',
        aiChatLimit: parseField(grantFormValues.aiChatLimit),
        buyerPlanLimit: parseField(grantFormValues.buyerPlanLimit),
        sellerPlanLimit: parseField(grantFormValues.sellerPlanLimit),
        estimatorLimit: parseField(grantFormValues.estimatorLimit),
      }
      const res = await fetch('/api/admin-homes/users/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok && data.override) {
        setCreditOverrides(prev => ({ ...prev, [lead.user_id as string]: data.override }))
        setGrantFormOpenFor(null)
      } else {
        alert('Grant failed: ' + (data?.error || res.statusText))
      }
    } catch (err: any) {
      alert('Grant failed: ' + (err?.message || 'network error'))
    } finally {
      setGranting(null)
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
    if (filterSource !== 'all') f = f.filter(l => deriveLeadOriginRoute(l.source) === filterSource)
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
    qualified_hot: leads.filter(l => l.quality === 'qualified_hot').length,
  }), [leads])

  const exportToCSV = () => {
    const headers = ['Date', 'Name', 'Email', 'Phone', 'Source', 'Intent', 'Area', 'Budget', 'Agent', 'Manager', 'Area Manager', 'Tenant Admin', 'Status', 'Quality']
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
      l.area_manager?.full_name || '',
      l.tenant_admin?.full_name || '',
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
    qualified_hot: 'bg-red-100 text-red-800',
    qualified_cold: 'bg-blue-100 text-blue-800',
    unqualified: 'bg-gray-100 text-gray-700',
    disqualified: 'bg-zinc-100 text-zinc-500',
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
          { label: 'Hot Leads', value: stats.qualified_hot, color: 'text-red-600' },
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
              {Object.entries(ROUTE_LABELS).map(([k, v]) => (
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
              <option value="unqualified">Unqualified</option>
              <option value="qualified_hot">Hot</option>
              <option value="qualified_cold">Cold</option>
              <option value="disqualified">Disqualified</option>
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
                {['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Quality', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLeads.length === 0 ? (
                <tr><td colSpan={11} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>
              ) : filteredLeads.map(lead => (
                <>
                  <tr key={lead.id} onClick={(e) => { const t = e.target as HTMLElement; if (t.closest('button, input, select, a, label')) return; setDrawerOpenForLead(lead) }} className={`hover:bg-gray-50 cursor-pointer ${updatingStatus === lead.id ? 'opacity-60' : ''}`}>
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
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{lead.contact_name}</span>
                        {(() => {
                          const eng = calcEngagement(activities[lead.id] || []);
                          return (
                            <span className={`text-xs font-semibold ${eng.color}`} title={`Engagement: ${eng.label} (${eng.score})`}>
                              {eng.label} · {eng.score}
                            </span>
                          );
                        })()}
                        {/* L5: VIP pending badge -- excludes expired-but-not-yet-marked-expired rows */}
                        {(vipRequests[lead.id] || []).some((v: any) => v.status === 'pending' && (!v.expires_at || new Date(v.expires_at) > new Date())) && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 animate-pulse" title="VIP request pending approval">
                            VIP Pending
                          </span>
                        )}
                        {/* L6: Approve VIP link button -- opens existing token-based approve route */}
                        {(() => {
                          const pendingVip = (vipRequests[lead.id] || []).find((v: any) => v.status === 'pending' && (!v.expires_at || new Date(v.expires_at) > new Date()) && v.approval_token)
                          if (!pendingVip) return null
                          const baseRoute = pendingVip.request_type === 'estimator' ? 'estimator/vip-approve' : 'charlie/vip-approve'
                          const url = '/api/walliam/' + baseRoute + '?token=' + pendingVip.approval_token + '&action=approve'
                          return (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700" title="Approve VIP request (opens approval page in new tab)">
                              Approve VIP
                            </a>
                          )
                        })()}
                      </div>
                      <a href={`mailto:${lead.contact_email}`} className="text-blue-600 text-xs">{lead.contact_email}</a>
                      {lead.contact_phone && <div className="text-gray-400 text-xs">{lead.contact_phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROUTE_COLORS[deriveLeadOriginRoute(lead.source)]}`}>
                        {ROUTE_LABELS[deriveLeadOriginRoute(lead.source)]}
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
                      {(lead.manager || lead.area_manager || lead.tenant_admin) ? (
                        <div className="text-xs text-gray-500 space-y-0.5">
                          {lead.manager && (
                            <div title="Manager">
                              <span className="text-gray-400 mr-1">↑</span>
                              {lead.manager.full_name}
                            </div>
                          )}
                          {lead.area_manager && (
                            <div title="Area Manager">
                              <span className="text-gray-400 mr-1">↑↑</span>
                              {lead.area_manager.full_name}
                            </div>
                          )}
                          {lead.tenant_admin && (
                            <div title="Tenant Admin">
                              <span className="text-gray-400 mr-1">↑↑↑</span>
                              {lead.tenant_admin.full_name}
                            </div>
                          )}
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
                    {/* Inline quality action buttons -- L1 ships 4 state buttons */}
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {QUALITY_VALUES.map(q => {
                          const isActive = lead.quality === q
                          return (
                            <button
                              key={q}
                              onClick={() => updateLeadStatus(lead.id, 'quality', q)}
                              disabled={updatingStatus === lead.id}
                              className={`text-xs px-2 py-1 rounded-full font-semibold transition-colors ${isActive ? qualityColor(q) : 'bg-white text-gray-400 border border-gray-200 hover:bg-gray-50'} ${updatingStatus === lead.id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                              title={QUALITY_LABELS[q]}
                            >
                              {QUALITY_LABELS[q]}
                            </button>
                          )
                        })}
                      </div>
                      {/* L5: Credit posture chip -- only renders for leads with user_id */}
                      {lead.user_id && (() => {
                        const o = creditOverrides[lead.user_id as string]
                        if (!o) return <div className="mt-1 text-xs text-gray-400">Default credits</div>
                        const vals = [o.ai_chat_limit, o.buyer_plan_limit, o.seller_plan_limit, o.estimator_limit]
                        const nonNullVals = vals.filter((v: any) => v != null) as number[]
                        const allZero = nonNullVals.length > 0 && nonNullVals.every((v) => v === 0)
                        if (allZero) return <div className="mt-1 text-xs font-semibold text-red-600">Blocked: 0 credits</div>
                        const labels = [
                          o.ai_chat_limit != null ? 'Chat:' + o.ai_chat_limit : null,
                          o.buyer_plan_limit != null ? 'Buyer:' + o.buyer_plan_limit : null,
                          o.seller_plan_limit != null ? 'Seller:' + o.seller_plan_limit : null,
                          o.estimator_limit != null ? 'Est:' + o.estimator_limit : null,
                        ].filter(Boolean) as string[]
                        if (labels.length === 0) return <div className="mt-1 text-xs text-gray-400">Default credits</div>
                        return <div className="mt-1 text-xs text-emerald-700">{labels.join(' · ')}</div>
                      })()}
                      {/* L6: Grant credits inline button + form -- POSTs to /api/admin-homes/users/override */}
                      {lead.user_id && (grantFormOpenFor === lead.id ? (
                        <div className="mt-2 p-2 border border-emerald-200 bg-emerald-50 rounded space-y-1">
                          <div className="text-xs font-semibold text-emerald-700">Grant credits (clamped to tenant hard caps)</div>
                          <div className="grid grid-cols-2 gap-1">
                            <input type="number" placeholder="Chat" value={grantFormValues.aiChatLimit} onChange={e => setGrantFormValues((v: any) => ({...v, aiChatLimit: e.target.value}))} className="text-xs px-2 py-1 rounded border border-gray-200" />
                            <input type="number" placeholder="Buyer Plan" value={grantFormValues.buyerPlanLimit} onChange={e => setGrantFormValues((v: any) => ({...v, buyerPlanLimit: e.target.value}))} className="text-xs px-2 py-1 rounded border border-gray-200" />
                            <input type="number" placeholder="Seller Plan" value={grantFormValues.sellerPlanLimit} onChange={e => setGrantFormValues((v: any) => ({...v, sellerPlanLimit: e.target.value}))} className="text-xs px-2 py-1 rounded border border-gray-200" />
                            <input type="number" placeholder="Estimator" value={grantFormValues.estimatorLimit} onChange={e => setGrantFormValues((v: any) => ({...v, estimatorLimit: e.target.value}))} className="text-xs px-2 py-1 rounded border border-gray-200" />
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => handleSubmitGrant(lead)} disabled={granting === lead.id} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                              {granting === lead.id ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={() => setGrantFormOpenFor(null)} disabled={granting === lead.id} className="text-xs px-2 py-1 rounded bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => handleOpenGrantForm(lead)} className="mt-1 text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                          + Grant credits
                        </button>
                      ))}
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
                          onClick={() => deleteLead(lead.id)}
                          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* L4: Inline activity preview (last 2) -- full timeline moves to L7 drawer */}
                  {(activities[lead.id] || []).length > 0 && (
                    <tr key={lead.id + '-activity-preview'}>
                      <td colSpan={11} className="px-6 py-2 bg-slate-50 border-b">
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                          <span className="font-semibold text-gray-400 uppercase tracking-wider">Recent activity</span>
                          {(activities[lead.id] || []).slice(-2).reverse().map((a: any) => (
                            <span key={a.id} className="inline-flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              <span className="text-gray-700">{a.activity_type.replace(/_/g, ' ')}</span>
                              <span className="text-gray-400">
                                {new Date(a.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </span>
                          ))}
                        </div>
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
    {/* L7: Lead detail drawer -- right-side slide-out, click-row triggered */}
    {drawerOpenForLead && (
      <>
        <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDrawerOpenForLead(null)} aria-hidden="true" />
        <div className="fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Lead details">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <div className="min-w-0">
              <div className="text-base font-semibold text-gray-900 truncate">{drawerOpenForLead.contact_name}</div>
              <div className="text-xs text-gray-500 truncate">{drawerOpenForLead.contact_email}</div>
            </div>
            <button onClick={() => setDrawerOpenForLead(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2" aria-label="Close drawer">
              {'\u00d7'}
            </button>
          </div>
          <div className="p-6 space-y-6">
            {/* Section: Lead Info */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Lead Info</h3>
              <dl className="text-sm grid grid-cols-2 gap-2">
                <div><dt className="text-xs text-gray-400">Phone</dt><dd className="text-gray-800">{drawerOpenForLead.contact_phone || '\u2014'}</dd></div>
                <div><dt className="text-xs text-gray-400">Intent</dt><dd className="text-gray-800">{drawerOpenForLead.intent || '\u2014'}</dd></div>
                <div><dt className="text-xs text-gray-400">Area</dt><dd className="text-gray-800">{drawerOpenForLead.geo_name || '\u2014'}</dd></div>
                <div><dt className="text-xs text-gray-400">Created</dt><dd className="text-gray-800">{new Date(drawerOpenForLead.created_at).toLocaleString('en-CA')}</dd></div>
              </dl>
            </section>
            {/* Section: Hierarchy */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Hierarchy</h3>
              <div className="text-sm space-y-1">
                {drawerOpenForLead.agents && (<div className="text-gray-800"><span className="text-xs text-gray-400 mr-2">Agent:</span>{drawerOpenForLead.agents.full_name}</div>)}
                {drawerOpenForLead.manager && (<div className="text-gray-700"><span className="text-xs text-gray-400 mr-2">\u2191 Manager:</span>{drawerOpenForLead.manager.full_name}</div>)}
                {drawerOpenForLead.area_manager && (<div className="text-gray-600"><span className="text-xs text-gray-400 mr-2">\u2191\u2191 Area Manager:</span>{drawerOpenForLead.area_manager.full_name}</div>)}
                {drawerOpenForLead.tenant_admin && (<div className="text-gray-500"><span className="text-xs text-gray-400 mr-2">\u2191\u2191\u2191 Tenant Admin:</span>{drawerOpenForLead.tenant_admin.full_name}</div>)}
                {!drawerOpenForLead.agents && !drawerOpenForLead.manager && !drawerOpenForLead.area_manager && !drawerOpenForLead.tenant_admin && (<div className="text-gray-400">No hierarchy assigned</div>)}
              </div>
            </section>
            {/* Section: Credit Posture */}
            {drawerOpenForLead.user_id && (() => {
              const o = creditOverrides[drawerOpenForLead.user_id as string]
              return (
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Credit Posture</h3>
                  {!o ? <div className="text-sm text-gray-400">No override \u2014 using tenant defaults</div> : (
                    <div className="text-sm space-y-1">
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-xs text-gray-400">Chat:</span> <span className="text-gray-800">{o.ai_chat_limit != null ? o.ai_chat_limit : '(default)'}</span></div>
                        <div><span className="text-xs text-gray-400">Buyer Plan:</span> <span className="text-gray-800">{o.buyer_plan_limit != null ? o.buyer_plan_limit : '(default)'}</span></div>
                        <div><span className="text-xs text-gray-400">Seller Plan:</span> <span className="text-gray-800">{o.seller_plan_limit != null ? o.seller_plan_limit : '(default)'}</span></div>
                        <div><span className="text-xs text-gray-400">Estimator:</span> <span className="text-gray-800">{o.estimator_limit != null ? o.estimator_limit : '(default)'}</span></div>
                      </div>
                      {o.granted_by_tier && <div className="text-xs text-gray-400">Granted by tier: {o.granted_by_tier}</div>}
                      {o.granted_at && <div className="text-xs text-gray-400">At: {new Date(o.granted_at).toLocaleString('en-CA')}</div>}
                      {o.note && <div className="text-xs text-gray-500 italic mt-1">"{o.note}"</div>}
                    </div>
                  )}
                </section>
              )
            })()}
            {/* Section: VIP Requests */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">VIP Requests</h3>
              {(vipRequests[drawerOpenForLead.id] || []).length === 0 ? (
                <div className="text-sm text-gray-400">No VIP requests</div>
              ) : (
                <div className="text-sm space-y-2">
                  {(vipRequests[drawerOpenForLead.id] || []).map((v: any) => (
                    <div key={v.id} className="border-l-2 border-gray-200 pl-3 py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase text-gray-700">{v.request_type}</span>
                        <span className={(v.status === 'pending' ? 'bg-amber-100 text-amber-800 ' : v.status === 'approved' ? 'bg-emerald-100 text-emerald-800 ' : 'bg-gray-100 text-gray-600 ') + 'text-xs px-2 py-0.5 rounded-full'}>{v.status}</span>
                      </div>
                      <div className="text-xs text-gray-400">Created: {new Date(v.created_at).toLocaleString('en-CA')}{v.expires_at && ' \u00b7 Expires: ' + new Date(v.expires_at).toLocaleString('en-CA')}{v.messages_granted != null && ' \u00b7 Granted: ' + v.messages_granted}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {/* Section: Plan Content */}
            {drawerOpenForLead.plan_data && (
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Plan Content</h3>
                <div className="text-sm space-y-1">
                  {drawerOpenForLead.plan_data.planType && <div><span className="text-xs text-gray-400">Type:</span> <span className="text-gray-800 capitalize">{drawerOpenForLead.plan_data.planType}</span></div>}
                  {drawerOpenForLead.plan_data.geoName && <div><span className="text-xs text-gray-400">Area:</span> <span className="text-gray-800">{drawerOpenForLead.plan_data.geoName}</span></div>}
                  {drawerOpenForLead.plan_data.budgetMax != null && (
                    <div>
                      <span className="text-xs text-gray-400">Budget:</span>{' '}
                      <span className="text-gray-800">
                        {drawerOpenForLead.plan_data.budgetMin != null ? '$' + Number(drawerOpenForLead.plan_data.budgetMin).toLocaleString('en-CA') + ' \u2013 ' : ''}
                        ${'{'}Number(drawerOpenForLead.plan_data.budgetMax).toLocaleString('en-CA'){'}'}
                      </span>
                    </div>
                  )}
                  {drawerOpenForLead.plan_data.propertyType && <div><span className="text-xs text-gray-400">Property:</span> <span className="text-gray-800">{drawerOpenForLead.plan_data.propertyType}</span></div>}
                </div>
              </section>
            )}
            {/* Section: Activity Timeline (full) */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Activity Timeline ({(activities[drawerOpenForLead.id] || []).length})</h3>
              {(activities[drawerOpenForLead.id] || []).length === 0 ? (
                <div className="text-sm text-gray-400">No activity recorded</div>
              ) : (
                <div className="text-sm space-y-2 relative pl-4">
                  <div className="absolute left-1 top-0 bottom-0 w-px bg-gray-200" />
                  {(activities[drawerOpenForLead.id] || []).slice().reverse().map((a: any) => (
                    <div key={a.id} className="relative pl-4">
                      <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-amber-400" style={{ transform: 'translateX(-3px)' }} />
                      <div className="text-gray-700">{a.activity_type.replace(/_/g, ' ')}</div>
                      <div className="text-xs text-gray-400">{new Date(a.created_at).toLocaleString('en-CA')}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {/* Section: Emails Sent */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Emails Sent ({(emailLog[drawerOpenForLead.id] || []).length})</h3>
              {(emailLog[drawerOpenForLead.id] || []).length === 0 ? (
                <div className="text-sm text-gray-400">No emails logged</div>
              ) : (
                <div className="text-sm space-y-2">
                  {(emailLog[drawerOpenForLead.id] || []).map((em: any) => (
                    <div key={em.id} className="border-l-2 border-blue-200 pl-3 py-1">
                      <div className="text-gray-700 truncate" title={em.subject}>{em.subject}</div>
                      <div className="text-xs text-gray-400">{em.direction ? em.direction.toUpperCase() : ''} {em.recipient_email}{em.recipient_layer ? ' \u00b7 ' + em.recipient_layer : ''}</div>
                      <div className="text-xs text-gray-400">{em.status}{(em.sent_at || em.created_at) ? ' \u00b7 ' + new Date(em.sent_at || em.created_at).toLocaleString('en-CA') : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {/* Section: Notes (lead_notes table) */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes ({(notes[drawerOpenForLead.id] || []).length})</h3>
              {(notes[drawerOpenForLead.id] || []).length === 0 ? (
                <div className="text-sm text-gray-400">No notes yet</div>
              ) : (
                <div className="text-sm space-y-2">
                  {(notes[drawerOpenForLead.id] || []).map((n: any) => (
                    <div key={n.id} className="bg-gray-50 rounded p-3">
                      <div className="text-gray-800 whitespace-pre-wrap">{n.note}</div>
                      <div className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString('en-CA')}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {/* Section: Legacy leads.notes free-text */}
            {drawerOpenForLead.notes && (
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Admin Notes (legacy free-text)</h3>
                <div className="text-sm text-gray-700 bg-gray-50 rounded p-3 whitespace-pre-wrap">{drawerOpenForLead.notes}</div>
              </section>
            )}
          </div>
        </div>
      </>
    )}
    </div>
  )
}