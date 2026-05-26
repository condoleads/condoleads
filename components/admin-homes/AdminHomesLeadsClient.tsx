// components/admin-homes/AdminHomesLeadsClient.tsx
// WALLiam leads dashboard — v2
// Upgrades: inline status update, source filter, manager column, engagement score, fixed activity panel
'use client'
import { useState, useMemo, useEffect, Fragment } from 'react'
import { deriveLeadOriginRoute, type LeadOriginRoute } from '@/lib/utils/lead-origin-route'
import { useRouter } from 'next/navigation'

interface Lead {
  id: string
  user_id: string | null
  tenant_id: string
  notes: string | null
  contact_name: string
  contact_email: string
  contact_phone: string
  source: string
  source_url: string | null
  appointment_date: string | null
  intent: string | null
  geo_name: string | null
  budget_max: number | null
  plan_data: any | null
  status: string
  quality: string
  temperature: string | null
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
  building?: { id: string; building_name: string | null; slug: string | null } | null
  listing?: { id: string; unparsed_address: string | null } | null
  area?: { id: string; name: string | null; slug: string | null } | null
  municipality?: { id: string; name: string | null; slug: string | null } | null
  community?: { id: string; name: string | null; slug: string | null } | null
  neighbourhood?: { id: string; name: string | null; slug: string | null } | null
}

interface Agent { id: string; full_name: string; email: string }

// C10 -- tenantBrandName + tenantDomain props for display-string substitution.
interface Props {
  initialLeads: Lead[]
  initialActivities: Record<string, any[]>
  agents: Agent[]
  currentRole: 'admin' | 'manager' | 'agent'
  currentAgentId: string | null
  initialExpanded: boolean
  initialShowTerminal: boolean
  tenantBrandName: string | null
  tenantDomain: string | null
}

const ROUTE_LABELS: Record<LeadOriginRoute, string> = {
  charlie: 'AI Chat',
  charlie_vip_request: 'AI Chat VIP',
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

// W-SOURCE-AXIS T4: derive source display from (lead_origin_route, plan_data, appointment_date).
// Surfaces 'Plan' for Charlie-routed leads with plan_data, 'Appointment' for those with
// appointment_date; otherwise falls through to ROUTE_LABELS. Lets Plan/Appointment become
// first-class source values without requiring a new lead_origin_route enum value.
function getSourceDisplay(
  route: LeadOriginRoute,
  planData: any,
  appointmentDate: any,
): { label: string; color: string } {
  if (route === 'charlie' && planData) {
    return { label: 'Plan', color: 'bg-blue-100 text-blue-700' }
  }
  if (route === 'charlie' && appointmentDate) {
    return { label: 'Appointment', color: 'bg-green-100 text-green-700' }
  }
  return { label: ROUTE_LABELS[route], color: ROUTE_COLORS[route] }
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
  if (score >= 75) return { score, label: 'High', color: 'text-red-600' }
  if (score >= 50) return { score, label: 'Mid', color: 'text-orange-500' }
  if (score >= 25) return { score, label: 'Active', color: 'text-yellow-600' }
  return { score, label: 'Low', color: 'text-gray-400' }
}

const QUALITY_VALUES = ['unqualified', 'qualified', 'disqualified'] as const
type QualityValue = typeof QUALITY_VALUES[number]
const QUALITY_LABELS: Record<QualityValue, string> = {
  unqualified: 'Unqualified',
  qualified: 'Qualified',
  disqualified: 'Disqualified',
}

const TEMPERATURE_VALUES = ['hot', 'warm', 'cold'] as const
type TemperatureValue = typeof TEMPERATURE_VALUES[number]
const TEMPERATURE_LABELS: Record<TemperatureValue, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cold: 'Cold',
}

// W6c: statuses hidden by default in the list view. closed/won/lost/archived are lifecycle-terminal.
// do_not_contact is a legal-compliance flag (CASL/TCPA); outbound email is ALSO blocked server-side
// in app/api/admin-homes/leads/[id]/send-email/route.ts. The visual hide here is UX defense in depth.
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['closed', 'won', 'lost', 'archived', 'do_not_contact'])

export default function AdminHomesLeadsClient({ initialLeads, initialActivities, agents, currentRole, currentAgentId, initialExpanded, initialShowTerminal, tenantBrandName, tenantDomain }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterAgent, setFilterAgent] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterQuality, setFilterQuality] = useState('all')
  const [filterTemperature, setFilterTemperature] = useState('all')
  const [filterIntent, setFilterIntent] = useState('all')
  const [filterSource, setFilterSource] = useState('all')
  // W-TERRITORY-MASTER P4 phase 2: ownership filter (all | owned | unowned)
  const [filterOwnership, setFilterOwnership] = useState<'all' | 'owned' | 'unowned'>('all')
  const [claimingLead, setClaimingLead] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'status'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [activities, setActivities] = useState<Record<string, any[]>>(initialActivities)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<boolean>(initialExpanded)
  const [showTerminal, setShowTerminal] = useState<boolean>(initialShowTerminal)
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set())
  const router = useRouter()

  const toggleExpanded = () => {
    const next = !expanded
    setExpanded(next)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (next) params.set('expanded', '1')
      else params.delete('expanded')
      const query = params.toString()
      router.replace(`/admin-homes/leads${query ? '?' + query : ''}`, { scroll: false })
    }
  }

  const toggleShowTerminal = () => {
    const next = !showTerminal
    setShowTerminal(next)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (next) params.set('showTerminal', '1')
      else params.delete('showTerminal')
      const query = params.toString()
      router.replace(`/admin-homes/leads${query ? '?' + query : ''}`, { scroll: false })
    }
  }

  const toggleUserIdExpand = (userId: string) => {
    setExpandedUserIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const updateLeadStatus = async (leadId: string, field: 'status' | 'quality' | 'temperature', value: string | null) => {
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

  // W-TERRITORY-MASTER P4 phase 2: claim an unowned lead
  const claimLead = async (leadId: string) => {
    if (!currentAgentId) {
      alert('Cannot claim: no agent identity in session.')
      return
    }
    if (!confirm('Claim this lead? You become the primary contact and the listing (if any) is pinned to you.')) {
      return
    }
    setClaimingLead(leadId)
    try {
      const res = await fetch(`/api/admin-homes/leads/${leadId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claiming_agent_id: currentAgentId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert('Claim failed: ' + (body?.error || `HTTP ${res.status}`))
        return
      }
      const claimingAgent = agents.find(a => a.id === currentAgentId)
      setLeads(prev => prev.map(l => l.id === leadId ? {
        ...l,
        agent_id: currentAgentId,
        assignment_source: 'claim',
        agents: claimingAgent ? { id: claimingAgent.id, full_name: claimingAgent.full_name, email: claimingAgent.email } : l.agents,
      } : l))
    } catch (err: any) {
      console.error('Claim failed:', err)
      alert('Claim failed: ' + (err?.message || 'network error'))
    } finally {
      setClaimingLead(null)
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
    // W6c: when no explicit status filter, default-hide terminal statuses (showTerminal=true opts out).
    if (filterStatus !== 'all') {
      f = f.filter(l => l.status === filterStatus)
    } else if (!showTerminal) {
      f = f.filter(l => !TERMINAL_STATUSES.has(l.status))
    }
    if (filterQuality !== 'all') f = f.filter(l => l.quality === filterQuality)
    if (filterTemperature !== 'all') {
      if (filterTemperature === 'none') f = f.filter(l => !l.temperature)
      else f = f.filter(l => l.temperature === filterTemperature)
    }
    if (filterIntent !== 'all') f = f.filter(l => l.intent === filterIntent)
    if (filterSource !== 'all') f = f.filter(l => deriveLeadOriginRoute(l.source) === filterSource)
    // W-TERRITORY-MASTER P4 phase 2: ownership filter
    if (filterOwnership === 'owned')   f = f.filter(l => l.agent_id !== null)
    if (filterOwnership === 'unowned') f = f.filter(l => l.agent_id === null)
    f.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'date') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      else if (sortBy === 'name') cmp = (a.contact_name || '').localeCompare(b.contact_name || '')
      else if (sortBy === 'status') cmp = (a.status || '').localeCompare(b.status || '')
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return f
  }, [leads, searchTerm, filterAgent, filterStatus, filterQuality, filterTemperature, filterIntent, filterSource, filterOwnership, sortBy, sortOrder, showTerminal])

  type FlatRow =
    | { kind: 'primary'; lead: Lead; earlierCount: number; groupUserId: string | null }
    | { kind: 'earlier'; lead: Lead; groupUserId: string }

  // W5b: collapse leads by user_id when !expanded. Anonymous (user_id IS NULL) stays per-row.
  // Identified users with N>1 leads collapse to the most-recent representative + "+N earlier" badge.
  // Clicking the badge adds the user_id to expandedUserIds, inline-rendering earlier leads.
  // expanded=true returns every filteredLead as its own primary row (preserves original behavior).
  const flatRows = useMemo<FlatRow[]>(() => {
    if (expanded) {
      return filteredLeads.map(l => ({ kind: 'primary' as const, lead: l, earlierCount: 0, groupUserId: l.user_id }))
    }
    const groups = new Map<string, Lead[]>()
    const orderedPrimaries: Array<{ groupUserId: string | null; firstSeenLead: Lead }> = []
    const seen = new Set<string>()
    for (const l of filteredLeads) {
      if (!l.user_id) {
        // Anonymous: each is its own group of 1, in filteredLeads order.
        orderedPrimaries.push({ groupUserId: null, firstSeenLead: l })
        continue
      }
      const key = l.user_id
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(l)
      if (!seen.has(key)) {
        seen.add(key)
        orderedPrimaries.push({ groupUserId: key, firstSeenLead: l })
      }
    }
    const out: FlatRow[] = []
    for (const p of orderedPrimaries) {
      if (p.groupUserId === null) {
        out.push({ kind: 'primary', lead: p.firstSeenLead, earlierCount: 0, groupUserId: null })
        continue
      }
      const groupLeads = groups.get(p.groupUserId) || [p.firstSeenLead]
      if (groupLeads.length <= 1) {
        out.push({ kind: 'primary', lead: p.firstSeenLead, earlierCount: 0, groupUserId: p.groupUserId })
        continue
      }
      // Sort within group by created_at DESC so the most recent is the primary representative.
      const sorted = [...groupLeads].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const primary = sorted[0]
      const earlier = sorted.slice(1)
      out.push({ kind: 'primary', lead: primary, earlierCount: earlier.length, groupUserId: p.groupUserId })
      if (expandedUserIds.has(p.groupUserId)) {
        for (const e of earlier) {
          out.push({ kind: 'earlier', lead: e, groupUserId: p.groupUserId })
        }
      }
    }
    return out
  }, [filteredLeads, expanded, expandedUserIds])

  const stats = useMemo(() => ({
    total: leads.length,
    newLeads: leads.filter(l => l.status === 'new').length,
    buyers: leads.filter(l => l.intent === 'buyer').length,
    sellers: leads.filter(l => l.intent === 'seller').length,
    hot: leads.filter(l => l.temperature === 'hot').length,
  }), [leads])

  const exportToCSV = () => {
    const headers = ['Date', 'Name', 'Email', 'Phone', 'Source', 'Intent', 'Area', 'Budget', 'Agent', 'Manager', 'Area Manager', 'Tenant Admin', 'Status', 'Quality', 'Temperature']
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
      l.temperature || '',
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // C10 -- filename slug derived from tenant domain (e.g., walliam.ca -> walliam-ca, aily.ca -> aily-ca).
    const _c10_slug = tenantDomain ? tenantDomain.replace(/\./g, '-') : 'tenant'
    a.download = `${_c10_slug}-leads-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  // W6a followup-B: deleteLead() removed -- per-row Delete UI consolidated to bulk-only.

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedLeads.size} leads?`)) return
    setDeleting(true)
    try {
      // W6a followup-B: per-fetch res.ok check. Failures must NOT silently vanish.
      // Only successfully-deleted ids leave local state and selection; failed ids
      // remain visible so the operator can retry. Failures are surfaced via alert
      // summarising up to the first 5 by id + server message.
      const ids = Array.from(selectedLeads)
      const results = await Promise.all(
        ids.map(async id => {
          try {
            const res = await fetch(`/api/admin-homes/leads/${id}`, { method: 'DELETE' })
            if (!res.ok) {
              const body = await res.json().catch(() => ({} as any))
              return { id, ok: false as const, status: res.status, message: (body && body.error) || `HTTP ${res.status}` }
            }
            return { id, ok: true as const }
          } catch (err: any) {
            return { id, ok: false as const, status: 0, message: (err && err.message) || 'Network error' }
          }
        }),
      )
      const okIds = results.filter(r => r.ok).map(r => r.id)
      const failed = results.filter(r => !r.ok)
      if (okIds.length > 0) {
        const okSet = new Set(okIds)
        setLeads(prev => prev.filter(l => !okSet.has(l.id)))
        setSelectedLeads(prev => {
          const next = new Set(prev)
          for (const id of okIds) next.delete(id)
          return next
        })
      }
      if (failed.length > 0) {
        const summary = failed.slice(0, 5).map(f => `  - ${f.id}: ${f.message}`).join('\n')
        const more = failed.length > 5 ? `\n  ... and ${failed.length - 5} more` : ''
        alert(`${failed.length} of ${ids.length} deletes failed:\n${summary}${more}`)
      }
    } finally { setDeleting(false) }
  }

  const statusColor = (s: string) => ({
    new: 'bg-blue-100 text-blue-800',
    contacted: 'bg-yellow-100 text-yellow-800',
    meeting_scheduled: 'bg-purple-100 text-purple-800',
    closed: 'bg-gray-100 text-gray-800',
    won: 'bg-emerald-100 text-emerald-800',
    lost: 'bg-rose-100 text-rose-800',
    archived: 'bg-slate-100 text-slate-600',
    do_not_contact: 'bg-red-600 text-white',
  }[s] || 'bg-gray-100 text-gray-800')

  const qualityColor = (q: string) => ({
    qualified: 'bg-green-100 text-green-800',
    unqualified: 'bg-gray-100 text-gray-700',
    disqualified: 'bg-zinc-100 text-zinc-500',
  }[q] || 'bg-gray-100 text-gray-800')

  const temperatureColor = (t: string | null) => {
    if (!t) return 'bg-gray-50 text-gray-500'
    return ({
      hot: 'bg-red-100 text-red-800',
      warm: 'bg-orange-100 text-orange-800',
      cold: 'bg-blue-100 text-blue-800',
    } as Record<string, string>)[t] || 'bg-gray-100 text-gray-800'
  }

  const intentColor = (i: string) => ({
    buyer: 'bg-indigo-100 text-indigo-800',
    seller: 'bg-emerald-100 text-emerald-800',
  }[i] || 'bg-gray-100 text-gray-800')

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        {/* C10 -- tenant-aware page header */}
        <h1 className="text-3xl font-bold text-gray-900">{tenantBrandName ?? 'Tenant'} Leads</h1>
        <p className="text-gray-600 mt-1">All lead sources from {tenantDomain ?? 'this tenant'}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900' },
          { label: 'New', value: stats.newLeads, color: 'text-blue-600' },
          { label: 'Buyers', value: stats.buyers, color: 'text-indigo-600' },
          { label: 'Sellers', value: stats.sellers, color: 'text-emerald-600' },
          { label: 'Hot Leads', value: stats.hot, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg shadow p-5">
            <div className="text-sm text-gray-500">{s.label}</div>
            <div className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-8 gap-4">
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
              <option value="meeting_scheduled">Meeting Scheduled</option>
              <option value="closed">Closed</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="archived">Archived</option>
              <option value="do_not_contact">Do Not Contact</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Quality</label>
            <select value={filterQuality} onChange={e => setFilterQuality(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="all">All</option>
              {QUALITY_VALUES.map(v => <option key={v} value={v}>{QUALITY_LABELS[v]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Temperature</label>
            <select value={filterTemperature} onChange={e => setFilterTemperature(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="all">All</option>
              {TEMPERATURE_VALUES.map(v => <option key={v} value={v}>{TEMPERATURE_LABELS[v]}</option>)}
              <option value="none">(none)</option>
            </select>
          </div>
          {/* W-TERRITORY-MASTER P4 phase 2: Ownership filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Ownership</label>
            <select value={filterOwnership} onChange={e => setFilterOwnership(e.target.value as 'all' | 'owned' | 'unowned')} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="all">All</option>
              <option value="owned">Owned</option>
              <option value="unowned">Unowned (claimable)</option>
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
            <button onClick={toggleExpanded} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50" title={expanded ? 'Collapse list by user' : 'Show every event as its own row'}>
              {expanded ? 'Collapse by user' : 'Show all events'}
            </button>
            <button onClick={toggleShowTerminal} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50" title={showTerminal ? 'Hide terminal statuses (closed/won/lost/archived/do-not-contact)' : 'Show all statuses including closed/won/lost/archived/do-not-contact'}>
              {showTerminal ? 'Hide terminal' : 'Show terminal'}
            </button>
          </div>
          <div className="flex gap-2">
            {/* W5c-3: bulk-delete hidden for agents (matches server policy:
                lead [id] route.ts 403s agent deletes regardless of ownership). */}
            {selectedLeads.size > 0 && currentRole !== 'agent' && (
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
                {['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Quality', 'Temperature'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {flatRows.length === 0 ? (
                <tr><td colSpan={11} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>
              ) : flatRows.map(row => {
                const lead = row.lead
                const isEarlier = row.kind === 'earlier'
                const earlierCount = row.kind === 'primary' ? row.earlierCount : 0
                const groupUserId = row.groupUserId
                const rowKey = isEarlier ? lead.id + '-earlier' : lead.id
                return (
                <Fragment key={rowKey}>
                  <tr onClick={(e) => { const t = e.target as HTMLElement; if (t.closest('button, input, select, a, label')) return; router.push('/admin-homes/leads/' + lead.id) }} className={`hover:bg-gray-50 cursor-pointer ${updatingStatus === lead.id ? 'opacity-60' : ''} ${isEarlier ? 'bg-slate-50/70 border-l-4 border-slate-300' : ''}`}>
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
                        {!isEarlier && earlierCount > 0 && groupUserId && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleUserIdExpand(groupUserId); }}
                            className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                            title="Toggle earlier events for this user"
                          >
                            {expandedUserIds.has(groupUserId) ? 'Hide earlier' : `+${earlierCount} earlier`}
                          </button>
                        )}
                      </div>
                      <a href={`mailto:${lead.contact_email}`} className="text-blue-600 text-xs">{lead.contact_email}</a>
                      {lead.contact_phone && <div className="text-gray-400 text-xs">{lead.contact_phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {

                        const src = getSourceDisplay(deriveLeadOriginRoute(lead.source), lead.plan_data, null)

                        const pill = (

                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${src.color}`}>

                            {src.label}{lead.source_url ? ' ↗' : ''}

                          </span>

                        )

                        const pillRendered = lead.source_url ? (
                          <a href={lead.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={lead.source_url} className="inline-block hover:opacity-80">
                            {pill}
                          </a>
                        ) : pill

                        const ctx: Array<{ name: string | null; slug: string | null }> = []
                        if (lead.building) ctx.push({ name: lead.building.building_name, slug: lead.building.slug })
                        if (lead.listing) ctx.push({ name: lead.listing.unparsed_address, slug: null })
                        if (lead.neighbourhood) ctx.push({ name: lead.neighbourhood.name, slug: lead.neighbourhood.slug })
                        if (lead.community) ctx.push({ name: lead.community.name, slug: lead.community.slug })
                        if (lead.municipality) ctx.push({ name: lead.municipality.name, slug: lead.municipality.slug })
                        if (lead.area) ctx.push({ name: lead.area.name, slug: lead.area.slug })

                        return (
                          <>
                            {pillRendered}
                            {ctx.length > 0 && (
                              <div className="text-xs text-gray-500 mt-1 truncate max-w-[260px]" title={ctx.map(c => c.name || '?').join(' · ')}>
                                {ctx.map((it, i) => (
                                  <span key={i}>
                                    {i > 0 && <span className="mx-1 text-gray-300">·</span>}
                                    {it.slug ? (
                                      <a href={`/${it.slug}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline">{it.name || '?'}</a>
                                    ) : (
                                      <span>{it.name || '?'}</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        )

                      })()}
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
                      {lead.agent_id ? (
                        <div className="text-xs font-medium text-gray-900">{lead.agents?.full_name || '—'}</div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); claimLead(lead.id) }}
                          disabled={claimingLead === lead.id}
                          className="px-2 py-1 rounded-md text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                          title="Claim this unowned lead"
                        >
                          {claimingLead === lead.id ? 'Claiming...' : 'Claim'}
                        </button>
                      )}
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
                        <option value="meeting_scheduled">Meeting Scheduled</option>
                        <option value="closed">Closed</option>
                        <option value="won">Won</option>
                        <option value="lost">Lost</option>
                        <option value="archived">Archived</option>
                        <option value="do_not_contact">Do Not Contact</option>
                      </select>
                    </td>
                    {/* Inline quality update (W-QUALITY-SPLIT) */}
                    <td className="px-4 py-3">
                      <select
                        value={lead.quality || 'unqualified'}
                        onChange={e => updateLeadStatus(lead.id, 'quality', e.target.value)}
                        disabled={updatingStatus === lead.id}
                        className={`text-xs px-2 py-1 rounded-full font-semibold border-0 cursor-pointer ${qualityColor(lead.quality)}`}
                      >
                        {QUALITY_VALUES.map(v => (
                          <option key={v} value={v}>{QUALITY_LABELS[v]}</option>
                        ))}
                      </select>
                    </td>
                    {/* Inline temperature update (W-QUALITY-SPLIT) */}
                    <td className="px-4 py-3">
                      <select
                        value={lead.temperature || ''}
                        onChange={e => updateLeadStatus(lead.id, 'temperature', e.target.value || null)}
                        disabled={updatingStatus === lead.id}
                        className={`text-xs px-2 py-1 rounded-full font-semibold border-0 cursor-pointer ${temperatureColor(lead.temperature)}`}
                      >
                        <option value="">—</option>
                        {TEMPERATURE_VALUES.map(v => (
                          <option key={v} value={v}>{TEMPERATURE_LABELS[v]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>

                  {/* L4: Inline activity preview (last 2) -- full timeline moves to L7 drawer */}
                  {!isEarlier && (activities[lead.id] || []).length > 0 && (
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

                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}