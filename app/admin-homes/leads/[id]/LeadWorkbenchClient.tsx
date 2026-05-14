'use client'

// app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx
// W-LEADS-WORKBENCH W4a (2026-05-13).
//
// Workbench client component -- 7-tab nav + Overview tab content.
// Plan/Credits/Activity/Emails/VIP/Notes are placeholders filled by W4b-g.

import { useState } from 'react'
import Link from 'next/link'
import PlanTab from '@/components/admin-homes/lead-workbench/PlanRenderer'
import UserCreditPanel, { UserCreditData } from '@/components/admin-homes/lead-workbench/UserCreditPanel'
import ActivityTab, { ActivityFeedItem } from '@/components/admin-homes/lead-workbench/ActivityTab'

type TabKey = 'overview' | 'plan' | 'credits' | 'activity' | 'emails' | 'vip' | 'notes'

const TABS: { id: TabKey; label: string; phase: string }[] = [
  { id: 'overview', label: 'Overview', phase: 'W4a' },
  { id: 'plan', label: 'Plan', phase: 'W4b' },
  { id: 'credits', label: 'Credits & Usage', phase: 'W4c' },
  { id: 'activity', label: 'Activity', phase: 'W4d' },
  { id: 'emails', label: 'Emails', phase: 'W4e' },
  { id: 'vip', label: 'VIP Requests', phase: 'W4f' },
  { id: 'notes', label: 'Notes', phase: 'W4g' },
]

interface AdminUserShape {
  agentId: string | null
  role: string | null
  isPlatformAdmin: boolean
  tenantId: string | null
}

interface Props {
  anchorLead: any
  leadFamily: any[]
  currentRole: string
  currentAgentId: string | null
  userCredit: UserCreditData | null
  adminUser: AdminUserShape
  activityFeed: ActivityFeedItem[]
}

export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser, activityFeed }: Props) {
  const [tab, setTab] = useState<TabKey>('overview')
  const activeTabMeta = TABS.find(t => t.id === tab)!

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-4">
        <Link href="/admin-homes/leads" className="text-blue-600 hover:underline text-sm">
          {'←'} Back to leads
        </Link>
      </div>

      <header className="border-b border-gray-200 pb-4 mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{anchorLead.contact_name || 'Unnamed lead'}</h1>
        <div className="mt-1 text-sm text-gray-600">
          {anchorLead.contact_email && (
            <a href={`mailto:${anchorLead.contact_email}`} className="text-blue-600 hover:underline">
              {anchorLead.contact_email}
            </a>
          )}
          {anchorLead.contact_phone && <span className="ml-3 text-gray-500">{anchorLead.contact_phone}</span>}
        </div>
        <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>Created {new Date(anchorLead.created_at).toLocaleDateString('en-CA')}</span>
          {anchorLead.source && <span>Source: <span className="text-gray-700">{anchorLead.source}</span></span>}
          {anchorLead.intent && <span>Intent: <span className="text-gray-700">{anchorLead.intent}</span></span>}
          {anchorLead.agents?.full_name && <span>Agent: <span className="text-gray-700">{anchorLead.agents.full_name}</span></span>}
          {leadFamily.length > 1 && (
            <span className="font-semibold text-indigo-600">{leadFamily.length} events for this user</span>
          )}
        </div>
      </header>

      <nav className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div>
        {tab === 'overview' ? (
          <OverviewTab anchorLead={anchorLead} leadFamily={leadFamily} />
        ) : tab === 'plan' ? (
          <PlanTab anchorLead={anchorLead} leadFamily={leadFamily} />
        ) : tab === 'credits' ? (
          <CreditsTab anchorLead={anchorLead} userCredit={userCredit} adminUser={adminUser} />
        ) : tab === 'activity' ? (
          <ActivityTab activityFeed={activityFeed} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />
        ) : (
          <PlaceholderTab name={activeTabMeta.label} phase={activeTabMeta.phase} />
        )}
      </div>
    </div>
  )
}

function OverviewTab({ anchorLead, leadFamily }: { anchorLead: any; leadFamily: any[] }) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Lead Info</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Status" value={anchorLead.status} />
          <Field label="Quality" value={anchorLead.quality} />
          <Field label="Intent" value={anchorLead.intent} />
          <Field label="Geo" value={anchorLead.geo_name} />
          <Field label="Budget Max" value={anchorLead.budget_max ? `$${Number(anchorLead.budget_max).toLocaleString()}` : null} />
          <Field label="Source" value={anchorLead.source} />
        </dl>
        {anchorLead.source_url && (
          <div className="mt-3 text-sm">
            <span className="text-xs text-gray-400">Source URL: </span>
            <a href={anchorLead.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
              {anchorLead.source_url}
            </a>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Hierarchy</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Agent" value={anchorLead.agents?.full_name} />
          <Field label="Manager" value={anchorLead.manager?.full_name} />
          <Field label="Area Manager" value={anchorLead.area_manager?.full_name} />
          <Field label="Tenant Admin" value={anchorLead.tenant_admin?.full_name} />
        </dl>
      </section>

      {leadFamily.length > 1 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">All Events ({leadFamily.length})</h2>
          <ul className="space-y-2 text-sm">
            {leadFamily.map((l: any) => (
              <li key={l.id} className={`p-3 rounded border ${l.id === anchorLead.id ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">{l.source || 'unknown source'}</span>
                  <span className="text-xs text-gray-500">{new Date(l.created_at).toLocaleDateString('en-CA')}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3">
                  {l.status && <span>Status: {l.status}</span>}
                  {l.quality && <span>Quality: {l.quality}</span>}
                  {l.intent && <span>Intent: {l.intent}</span>}
                  {l.agents?.full_name && <span>Agent: {l.agents.full_name}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function CreditsTab({ anchorLead, userCredit, adminUser }: { anchorLead: any; userCredit: UserCreditData | null; adminUser: AdminUserShape }) {
  if (!anchorLead.user_id) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-sm font-medium">No user account linked to this lead</div>
        <div className="text-xs mt-1">Credit limits are user-scoped, not lead-scoped. Anonymous leads have no credit data.</div>
      </div>
    )
  }
  if (!userCredit) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-sm font-medium">Credit data not available</div>
        <div className="text-xs mt-1">Failed to load user credit bundle.</div>
      </div>
    )
  }
  return (
    <UserCreditPanel
      userId={anchorLead.user_id}
      tenantId={anchorLead.tenant_id}
      userCredit={userCredit}
      adminUser={adminUser}
    />
  )
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-gray-800">{value || '—'}</dd>
    </div>
  )
}

function PlaceholderTab({ name, phase }: { name: string; phase: string }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <div className="text-sm font-medium">{name}</div>
      <div className="text-xs mt-1">Coming in {phase}</div>
    </div>
  )
}
