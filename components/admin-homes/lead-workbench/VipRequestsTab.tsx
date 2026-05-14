'use client'

// components/admin-homes/lead-workbench/VipRequestsTab.tsx
// W-LEADS-WORKBENCH W4f (2026-05-14)
//
// Lists vip_requests rows for the lead family. Per-card Approve/Deny buttons
// for pending rows. Optimistic state update: action mutates local state
// immediately, then POSTs to /api/admin-homes/leads/[id]/vip-approve. On
// success: keep optimistic state. On error: revert + show error.
//
// FILTER UX
//   Status chips: all / pending / approved / denied / expired. Counts per chip.
//
// CARD UX
//   - Status badge + request type + source
//   - Phone / name / email
//   - Created / expires dates
//   - Expandable detail (budget, timeline, buyer_type, requirements, page_url, building_name)
//   - Footer: Approve / Deny buttons (pending only)

import { useState, useMemo } from 'react'

export interface VipRequestRow {
  id: string
  lead_id: string | null
  tenant_id: string
  agent_id: string | null
  session_id: string | null
  status: string
  request_type: string
  request_source: string | null
  phone: string
  full_name: string | null
  email: string | null
  budget_range: string | null
  timeline: string | null
  buyer_type: string | null
  requirements: string | null
  approval_token: string | null
  page_url: string | null
  building_name: string | null
  messages_granted: number | null
  created_at: string
  responded_at: string | null
  expires_at: string | null
}

interface Props {
  vipRequests: VipRequestRow[]
  leadFamily: any[]
  anchorLeadId: string
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'denied' | 'expired'

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  pending:  { bg: '#fef3c7', fg: '#92400e', label: 'Pending' },
  approved: { bg: '#dcfce7', fg: '#166534', label: 'Approved' },
  denied:   { bg: '#fee2e2', fg: '#991b1b', label: 'Denied' },
  expired:  { bg: '#e5e7eb', fg: '#374151', label: 'Expired' },
}

const TYPE_LABEL: Record<string, string> = {
  plan:      'Plan',
  chat:      'Chat',
  estimator: 'Estimator',
}

const SOURCE_LABEL: Record<string, string> = {
  chat:      'Chat',
  estimator: 'Estimator',
}

function isEffectivelyExpired(row: VipRequestRow): boolean {
  if (row.status !== 'pending') return false
  if (!row.expires_at) return false
  return new Date(row.expires_at).getTime() < Date.now()
}

export default function VipRequestsTab({ vipRequests, leadFamily, anchorLeadId }: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Optimistic state -- maps vip_request.id -> override status, on success.
  const [overrides, setOverrides] = useState<Record<string, { status: string; messagesGranted: number | null }>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState<string | null>(null)  // vip_request.id in flight

  const rows = useMemo(() => {
    return vipRequests.map((r) => {
      const ov = overrides[r.id]
      const status = ov ? ov.status : (isEffectivelyExpired(r) ? 'expired' : r.status)
      const messagesGranted = ov ? ov.messagesGranted : r.messages_granted
      return { ...r, status, messages_granted: messagesGranted }
    })
  }, [vipRequests, overrides])

  const counts = useMemo(() => ({
    all:      rows.length,
    pending:  rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    denied:   rows.filter((r) => r.status === 'denied').length,
    expired:  rows.filter((r) => r.status === 'expired').length,
  }), [rows])

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAction(row: VipRequestRow, action: 'approve' | 'deny') {
    if (actionPending) return
    setActionError(null)
    setActionPending(row.id)
    const newStatus = action === 'approve' ? 'approved' : 'denied'
    // Optimistic update first.
    setOverrides((prev) => ({
      ...prev,
      [row.id]: { status: newStatus, messagesGranted: action === 'approve' ? (row.messages_granted ?? null) : 0 },
    }))
    try {
      // Use the lead_id from the row (handles family rows on other leads).
      const leadIdForUrl = row.lead_id || anchorLeadId
      const res = await fetch('/api/admin-homes/leads/' + leadIdForUrl + '/vip-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vipRequestId: row.id, action }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        // Revert optimistic update.
        setOverrides((prev) => {
          const next = { ...prev }
          delete next[row.id]
          return next
        })
        let msg = (data && data.error) || 'Action failed'
        if (data && data.currentStatus) msg += ' (current: ' + data.currentStatus + ')'
        setActionError(msg)
      } else {
        // Server confirmed -- update optimistic state with server-returned messagesGranted.
        setOverrides((prev) => ({
          ...prev,
          [row.id]: { status: data.status || newStatus, messagesGranted: data.messagesGranted ?? null },
        }))
      }
    } catch (e: any) {
      setOverrides((prev) => {
        const next = { ...prev }
        delete next[row.id]
        return next
      })
      setActionError((e && e.message) || 'Network error')
    } finally {
      setActionPending(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-gray-200">
        <div className="flex gap-1 flex-wrap">
          {(['all', 'pending', 'approved', 'denied', 'expired'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={'px-3 py-1.5 text-xs rounded-full border transition-colors ' + (filter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-900">
          {actionError}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-sm font-medium">
            {vipRequests.length === 0
              ? 'No VIP requests for this lead family yet'
              : 'No VIP requests match this filter'}
          </div>
          <div className="text-xs mt-1">
            {vipRequests.length === 0
              ? 'VIP requests submitted via Charlie or the estimator will appear here.'
              : 'Try a different filter.'}
          </div>
        </div>
      ) : (
        <ul className="space-y-2 list-none p-0 m-0">
          {filteredRows.map((row) => (
            <li key={row.id}>
              <VipRequestCard
                row={row}
                leadFamily={leadFamily}
                anchorLeadId={anchorLeadId}
                expanded={expanded.has(row.id)}
                onToggle={() => toggleExpand(row.id)}
                onAction={(action) => handleAction(row, action)}
                pending={actionPending === row.id}
                disabled={actionPending !== null && actionPending !== row.id}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function VipRequestCard({
  row, leadFamily, anchorLeadId, expanded, onToggle, onAction, pending, disabled,
}: {
  row: VipRequestRow
  leadFamily: any[]
  anchorLeadId: string
  expanded: boolean
  onToggle: () => void
  onAction: (action: 'approve' | 'deny') => void
  pending: boolean
  disabled: boolean
}) {
  const badge = STATUS_BADGE[row.status] || { bg: '#e5e7eb', fg: '#374151', label: row.status }
  const typeLabel = TYPE_LABEL[row.request_type] || row.request_type
  const sourceLabel = row.request_source ? (SOURCE_LABEL[row.request_source] || row.request_source) : null
  const createdStr = new Date(row.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  const expiresStr = row.expires_at ? new Date(row.expires_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const targetLead = leadFamily.find((l: any) => l.id === row.lead_id)
  const isOtherLead = row.lead_id !== anchorLeadId && leadFamily.length > 1

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50 transition-colors bg-transparent border-0 cursor-pointer"
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center text-base">
          {'\u2728'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-medium text-slate-900">
              {typeLabel}{sourceLabel ? ' \u00b7 ' + sourceLabel : ''}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap"
                style={{ backgroundColor: badge.bg, color: badge.fg }}
              >
                {badge.label}
              </span>
              <span className="text-xs text-slate-400 whitespace-nowrap">{createdStr}</span>
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3">
            <span className="font-mono">{row.phone}</span>
            {row.full_name && <span>{row.full_name}</span>}
            {row.email && <span className="font-mono">{row.email}</span>}
            {expiresStr && row.status === 'pending' && (
              <span className="text-slate-400">expires {expiresStr}</span>
            )}
            {isOtherLead && targetLead && (
              <span className="text-slate-400">on lead: {targetLead.source || 'unknown'}</span>
            )}
          </div>
        </div>
        <span className="flex-shrink-0 text-slate-400 text-xs">{expanded ? '\u25BE' : '\u25B8'}</span>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-3 py-3 bg-slate-50 space-y-3">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {row.budget_range && <DetailField label="Budget" value={row.budget_range} />}
            {row.timeline && <DetailField label="Timeline" value={row.timeline} />}
            {row.buyer_type && <DetailField label="Type" value={row.buyer_type} />}
            {row.building_name && <DetailField label="Building" value={row.building_name} />}
            {expiresStr && <DetailField label="Expires" value={expiresStr} />}
            {row.messages_granted != null && (
              <DetailField label="Messages granted" value={String(row.messages_granted)} />
            )}
          </dl>
          {row.requirements && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Requirements</div>
              <div className="text-xs text-slate-700 whitespace-pre-wrap bg-white border border-slate-200 rounded p-2">
                {row.requirements}
              </div>
            </div>
          )}
          {row.page_url && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Page URL</div>
              <a href={row.page_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all">
                {row.page_url}
              </a>
            </div>
          )}
          {row.status === 'pending' && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAction('deny') }}
                disabled={pending || disabled}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? 'Working\u2026' : 'Deny'}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAction('approve') }}
                disabled={pending || disabled}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? 'Working\u2026' : 'Approve'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  )
}
