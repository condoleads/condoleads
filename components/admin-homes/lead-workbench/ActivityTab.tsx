'use client'

// components/admin-homes/lead-workbench/ActivityTab.tsx
// W-LEADS-WORKBENCH W4d (2026-05-14).
//
// Cumulative activity timeline across leadFamily. Merges:
//   - user_activities (visitor actions, keyed by contact_email within tenant)
//   - lead_admin_actions (admin actions, keyed by lead_id within tenant)
// Both arrays pre-fetched server-side in page.tsx; this component handles
// filtering, date bucketing, and rendering.
//
// 13 activity types mapped to icon+label dictionary (B3 verified 2026-05-14).
// admin actions array is empty until W6a writes start landing.

import { useState } from 'react'

export interface ActivityFeedItem {
  id: string
  kind: 'visitor' | 'admin'
  created_at: string
  // visitor fields
  contact_email?: string | null
  agent_id?: string | null
  activity_type?: string | null
  activity_data?: any
  page_url?: string | null
  // admin fields
  lead_id?: string | null
  actor_user_id?: string | null
  actor_agent_id?: string | null
  actor_role?: string | null
  action_type?: string | null
  target_field?: string | null
  before_value?: any
  after_value?: any
  notes?: string | null
}

const ACTIVITY_META: Record<string, { icon: string; label: string }> = {
  viewed_transaction_history: { icon: '👁', label: 'Viewed transaction history' },
  contact_form:               { icon: '✉',       label: 'Submitted contact form' },
  registration:               { icon: '✨',       label: 'Registered account' },
  sale_offer_inquiry:         { icon: '💰', label: 'Sale offer inquiry' },
  estimator_used:             { icon: '📊', label: 'Used estimator' },
  property_inquiry:           { icon: '🏠', label: 'Property inquiry' },
  lease_offer_inquiry:        { icon: '🔑', label: 'Lease offer inquiry' },
  sale_evaluation_request:    { icon: '💎', label: 'Sale evaluation request' },
  estimator_contact_submitted:{ icon: '📊', label: 'Estimator contact submitted' },
  building_visit_request:     { icon: '🏢', label: 'Building visit request' },
  estimator:                  { icon: '📊', label: 'Used estimator' },
  unit_history_inquiry:       { icon: '📜', label: 'Unit history inquiry' },
  plan_generated:             { icon: '📋', label: 'Generated plan' },
}

interface Props {
  activityFeed: ActivityFeedItem[]
  leadFamily: any[]
  anchorLeadId: string
}

type FilterMode = 'all' | 'visitor' | 'admin'

export default function ActivityTab({ activityFeed, leadFamily, anchorLeadId }: Props) {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [showAll, setShowAll] = useState(false)

  if (activityFeed.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-sm font-medium">No activity recorded for this lead family yet</div>
        <div className="text-xs mt-1">Visitor page views and admin actions will appear here once captured.</div>
      </div>
    )
  }

  const counts = {
    all: activityFeed.length,
    visitor: activityFeed.filter(a => a.kind === 'visitor').length,
    admin: activityFeed.filter(a => a.kind === 'admin').length,
  }

  const filtered = activityFeed.filter(a => filter === 'all' || a.kind === filter)
  const displayed = showAll ? filtered : filtered.slice(0, 50)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const buckets: Record<string, ActivityFeedItem[]> = {}
  const bucketOrder: string[] = []
  for (const item of displayed) {
    const d = new Date(item.created_at)
    let bucket: string
    if (d >= today) bucket = 'Today'
    else if (d >= yesterday) bucket = 'Yesterday'
    else if (d >= weekAgo) bucket = 'This week'
    else bucket = d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
    if (!buckets[bucket]) {
      buckets[bucket] = []
      bucketOrder.push(bucket)
    }
    buckets[bucket].push(item)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-gray-200">
        <div className="flex gap-1">
          {(['all', 'visitor', 'admin'] as FilterMode[]).map(f => (
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
        {filtered.length > 50 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-xs text-indigo-600 hover:underline bg-transparent border-0 cursor-pointer"
          >
            Show all {filtered.length} events
          </button>
        )}
      </div>

      {bucketOrder.map(bucketLabel => (
        <section key={bucketLabel}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{bucketLabel}</h3>
          <ul className="space-y-2 list-none p-0 m-0">
            {buckets[bucketLabel].map(item => (
              <li key={item.id}>
                {item.kind === 'visitor' ? (
                  <VisitorRow item={item} />
                ) : (
                  <AdminRow item={item} leadFamily={leadFamily} anchorLeadId={anchorLeadId} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function VisitorRow({ item }: { item: ActivityFeedItem }) {
  const meta = ACTIVITY_META[item.activity_type || ''] || { icon: '•', label: item.activity_type || 'Activity' }
  const time = new Date(item.created_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
  const dateStr = new Date(item.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

  const data = item.activity_data || {}
  const details: string[] = []
  if (data.buildingName) details.push(String(data.buildingName))
  if (data.unitNumber) details.push('Unit ' + data.unitNumber)
  if (data.buildingAddress) details.push(String(data.buildingAddress))
  if (data.totalSales) details.push(String(data.totalSales) + ' sales')
  if (data.geoName) details.push(String(data.geoName))

  function openUrl() {
    if (item.page_url) window.open(item.page_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-base">
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-medium text-slate-900">{meta.label}</div>
          <div className="text-xs text-slate-400 whitespace-nowrap">{dateStr} {time}</div>
        </div>
        {details.length > 0 && (
          <div className="text-xs text-slate-500 mt-1">{details.join(' · ')}</div>
        )}
        {item.contact_email && (
          <div className="text-xs text-slate-400 mt-1">{item.contact_email}</div>
        )}
        {item.page_url && (
          <button
            type="button"
            onClick={openUrl}
            className="text-xs text-blue-600 hover:underline mt-1 inline-block break-all text-left bg-transparent border-0 p-0 cursor-pointer"
          >
            {item.page_url.length > 80 ? item.page_url.slice(0, 80) + '…' : item.page_url}
          </button>
        )}
      </div>
    </div>
  )
}

function AdminRow({ item, leadFamily, anchorLeadId }: { item: ActivityFeedItem; leadFamily: any[]; anchorLeadId: string }) {
  const time = new Date(item.created_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
  const dateStr = new Date(item.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  const targetLead = leadFamily.find((l: any) => l.id === item.lead_id)

  return (
    <div className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center text-base">
        🛠
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-medium text-slate-900">
            <span className="text-purple-700">{item.actor_role || 'admin'}</span>: {item.action_type || 'action'}
            {item.target_field && <span className="text-slate-500 font-normal"> · {item.target_field}</span>}
          </div>
          <div className="text-xs text-slate-400 whitespace-nowrap">{dateStr} {time}</div>
        </div>
        {item.lead_id && item.lead_id !== anchorLeadId && leadFamily.length > 1 && targetLead && (
          <div className="text-xs text-slate-400 mt-1">
            On lead: {targetLead.source || 'unknown'} ({new Date(targetLead.created_at).toLocaleDateString('en-CA')})
          </div>
        )}
        {item.notes && (
          <div className="text-xs text-slate-600 mt-1">{item.notes}</div>
        )}
        {(item.before_value || item.after_value) && (
          <div className="text-xs text-slate-500 mt-1 font-mono break-all">
            {item.before_value && <span>{JSON.stringify(item.before_value)} → </span>}
            {item.after_value && <span>{JSON.stringify(item.after_value)}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
