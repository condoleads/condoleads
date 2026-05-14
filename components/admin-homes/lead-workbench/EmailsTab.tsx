'use client'

// components/admin-homes/lead-workbench/EmailsTab.tsx
// W-LEADS-WORKBENCH W4e.6 (2026-05-14).
//
// Lists lead_email_recipients_log rows for the lead family, grouped by
// resend_message_id (one card per send, N recipients per card). Hosts the
// Send composer modal that POSTs to /api/admin-homes/leads/[id]/send-email.
//
// GROUPING
//   Primary key: resend_message_id (one logical email = one Resend message
//   = N audit rows for N recipients). Fallback when resend_message_id is
//   null: synthesize a group key from row.id (current writers always
//   populate resend_message_id, but defensive).
//
// FILTER UX
//   Status chips: all / sent / bounced / failed. A group is included if
//   ANY row in the group matches the filter (worst-case status surfacing).
//
// COMPOSER UX
//   Subject + plain-text body textarea + (when leadFamily.length > 1)
//   lead-context selector. On 200: router.refresh() so the server-rendered
//   emailLog includes the new row, then close modal. On 502: surface
//   tenant-config issue + missing list. On other errors: show message.
//
// TYPE NOTE
//   recipient_layer kept as string (not the union from log-email-recipients)
//   so new layer labels added by future migrations render gracefully via
//   LAYER_LABEL fallback to the raw value.

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

export interface EmailLogRow {
  id: string
  lead_id: string
  tenant_id: string
  agent_id: string | null
  recipient_email: string
  recipient_layer: string
  direction: string
  subject: string
  template_key: string
  resend_message_id: string | null
  status: string
  sent_at: string | null
  delivered_at: string | null
  bounced_at: string | null
  created_at: string
}

interface Props {
  emailLog: EmailLogRow[]
  leadFamily: any[]
  anchorLeadId: string
}

type StatusFilter = 'all' | 'sent' | 'bounced' | 'failed'

const LAYER_LABEL: Record<string, string> = {
  agent:              'Agent',
  manager:            'Manager',
  area_manager:       'Area Manager',
  tenant_admin:       'Tenant Admin',
  platform_manager:   'Platform Manager',
  platform_admin:     'Platform Admin',
  tenant_overlay_cc:  'Delegate (CC)',
  tenant_overlay_bcc: 'Delegate (BCC)',
  lead_contact:       'Customer',
}

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  sent:       { bg: '#dbeafe', fg: '#1e40af', label: 'Sent' },
  delivered:  { bg: '#dcfce7', fg: '#166534', label: 'Delivered' },
  queued:     { bg: '#fef3c7', fg: '#92400e', label: 'Queued' },
  bounced:    { bg: '#fee2e2', fg: '#991b1b', label: 'Bounced' },
  failed:     { bg: '#fee2e2', fg: '#991b1b', label: 'Failed' },
  complained: { bg: '#fef3c7', fg: '#92400e', label: 'Complained' },
}

interface EmailGroup {
  key: string
  subject: string
  sentAt: string
  templateKey: string
  leadId: string
  status: string
  rows: EmailLogRow[]
}

const STATUS_RANK: Record<string, number> = {
  bounced: 5, failed: 4, complained: 3, queued: 2, sent: 1, delivered: 0,
}

function worstStatus(rows: EmailLogRow[]): string {
  let worst = 'delivered'
  let worstRank = -1
  for (const r of rows) {
    const rank = STATUS_RANK[r.status] ?? 0
    if (rank > worstRank) {
      worst = r.status
      worstRank = rank
    }
  }
  return worst
}

export default function EmailsTab({ emailLog, leadFamily, anchorLeadId }: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [composerOpen, setComposerOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const groups = useMemo<EmailGroup[]>(() => {
    const map = new Map<string, EmailGroup>()
    for (const row of emailLog) {
      const key = row.resend_message_id || ('orphan_' + row.id)
      const existing = map.get(key)
      if (existing) {
        existing.rows.push(row)
      } else {
        map.set(key, {
          key,
          subject: row.subject,
          sentAt: row.sent_at || row.created_at,
          templateKey: row.template_key,
          leadId: row.lead_id,
          status: row.status,
          rows: [row],
        })
      }
    }
    for (const g of map.values()) g.status = worstStatus(g.rows)
    return Array.from(map.values()).sort((a, b) =>
      new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    )
  }, [emailLog])

  const filteredGroups = useMemo(() => {
    if (filter === 'all') return groups
    return groups.filter((g) => g.rows.some((r) => r.status === filter))
  }, [groups, filter])

  const counts = useMemo(() => ({
    all:     groups.length,
    sent:    groups.filter((g) => g.rows.some((r) => r.status === 'sent' || r.status === 'delivered')).length,
    bounced: groups.filter((g) => g.rows.some((r) => r.status === 'bounced')).length,
    failed:  groups.filter((g) => g.rows.some((r) => r.status === 'failed')).length,
  }), [groups])

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-gray-200">
        <div className="flex gap-1">
          {(['all', 'sent', 'bounced', 'failed'] as StatusFilter[]).map((f) => (
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
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
        >
          {'\u2709'} Send Email
        </button>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-sm font-medium">
            {emailLog.length === 0 ? 'No emails sent for this lead family yet' : 'No emails match this filter'}
          </div>
          <div className="text-xs mt-1">
            {emailLog.length === 0
              ? 'System notifications and admin-composed emails will appear here.'
              : 'Try a different filter.'}
          </div>
        </div>
      ) : (
        <ul className="space-y-2 list-none p-0 m-0">
          {filteredGroups.map((group) => (
            <li key={group.key}>
              <EmailGroupCard
                group={group}
                leadFamily={leadFamily}
                anchorLeadId={anchorLeadId}
                expanded={expandedGroups.has(group.key)}
                onToggle={() => toggleGroup(group.key)}
              />
            </li>
          ))}
        </ul>
      )}

      {composerOpen && (
        <ComposerModal
          leadFamily={leadFamily}
          anchorLeadId={anchorLeadId}
          onClose={() => setComposerOpen(false)}
        />
      )}
    </div>
  )
}

function EmailGroupCard({
  group, leadFamily, anchorLeadId, expanded, onToggle,
}: {
  group: EmailGroup
  leadFamily: any[]
  anchorLeadId: string
  expanded: boolean
  onToggle: () => void
}) {
  const dateStr = new Date(group.sentAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = new Date(group.sentAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
  const badge = STATUS_BADGE[group.status] || { bg: '#e5e7eb', fg: '#374151', label: group.status }
  const targetLead = leadFamily.find((l: any) => l.id === group.leadId)
  const isOtherLead = group.leadId !== anchorLeadId && leadFamily.length > 1

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50 transition-colors bg-transparent border-0 cursor-pointer"
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-base">
          {'\u2709'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-medium text-slate-900 truncate">{group.subject || '(no subject)'}</div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap"
                style={{ backgroundColor: badge.bg, color: badge.fg }}
              >
                {badge.label}
              </span>
              <span className="text-xs text-slate-400 whitespace-nowrap">{dateStr} {timeStr}</span>
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3">
            <span>{group.rows.length} recipient{group.rows.length === 1 ? '' : 's'}</span>
            <span className="font-mono">{group.templateKey}</span>
            {isOtherLead && targetLead && (
              <span className="text-slate-400">
                on lead: {targetLead.source || 'unknown'} ({new Date(targetLead.created_at).toLocaleDateString('en-CA')})
              </span>
            )}
          </div>
        </div>
        <span className="flex-shrink-0 text-slate-400 text-xs">{expanded ? '\u25BE' : '\u25B8'}</span>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-3 py-2 bg-slate-50">
          {(['to', 'cc', 'bcc'] as const).map((dir) => {
            const rowsForDir = group.rows.filter((r) => r.direction === dir)
            if (rowsForDir.length === 0) return null
            return (
              <div key={dir} className="mb-2 last:mb-0">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  {dir.toUpperCase()} ({rowsForDir.length})
                </div>
                <ul className="space-y-1 list-none p-0 m-0">
                  {rowsForDir.map((r) => (
                    <li key={r.id} className="text-xs text-slate-700 flex items-center gap-2 flex-wrap">
                      <span className="font-mono">{r.recipient_email}</span>
                      <span className="text-slate-400">
                        {LAYER_LABEL[r.recipient_layer] || r.recipient_layer}
                      </span>
                      {r.status !== 'sent' && r.status !== 'delivered' && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: (STATUS_BADGE[r.status] && STATUS_BADGE[r.status].bg) || '#e5e7eb',
                            color: (STATUS_BADGE[r.status] && STATUS_BADGE[r.status].fg) || '#374151',
                          }}
                        >
                          {r.status}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ComposerModal({
  leadFamily, anchorLeadId, onClose,
}: {
  leadFamily: any[]
  anchorLeadId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [selectedLeadId, setSelectedLeadId] = useState<string>(anchorLeadId)
  const [subject, setSubject] = useState<string>('')
  const [body, setBody] = useState<string>('')
  const [sending, setSending] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const selectedLead = leadFamily.find((l: any) => l.id === selectedLeadId)

  async function handleSend() {
    if (!subject.trim() || !body.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/admin-homes/leads/' + selectedLeadId + '/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        let msg = (data && data.error) || 'Send failed'
        if (data && data.detail) msg += ' - ' + data.detail
        if (data && Array.isArray(data.missing) && data.missing.length > 0) {
          msg += ' (missing: ' + data.missing.join(', ') + ')'
        }
        setError(msg)
        setSending(false)
        return
      }
      onClose()
      router.refresh()
    } catch (e: any) {
      setError((e && e.message) || 'Network error')
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Send Email to Lead</h2>
          {selectedLead && selectedLead.contact_email && (
            <p className="text-sm text-slate-500 mt-1">
              To: <span className="font-mono">{selectedLead.contact_email}</span>
              {selectedLead.contact_name && <span className="ml-2">({selectedLead.contact_name})</span>}
            </p>
          )}
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {leadFamily.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Lead context
              </label>
              <select
                value={selectedLeadId}
                onChange={(e) => setSelectedLeadId(e.target.value)}
                disabled={sending}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {leadFamily.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {(l.source || 'unknown') + ' - ' + new Date(l.created_at).toLocaleDateString('en-CA') + (l.id === anchorLeadId ? ' (current)' : '')}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Determines which lead this email is logged under and which agent receives a copy.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={sending}
              maxLength={998}
              placeholder="Brief subject line"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={sending}
              rows={10}
              placeholder="Plain text. Line breaks preserved."
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Sent from the tenant&apos;s verified send domain. The lead&apos;s contact email is TO; the agent hierarchy is BCC&apos;d for visibility. Reply-To routes customer replies to the assigned agent.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-900">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!subject.trim() || !body.trim() || sending}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}