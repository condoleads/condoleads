'use client'

// app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx
// W-LEADS-WORKBENCH W4a (2026-05-13).
//
// Workbench client component -- 7-tab nav + Overview tab content.
// Plan/Credits/Activity/Emails/VIP/Notes are placeholders filled by W4b-g.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PlanTab from '@/components/admin-homes/lead-workbench/PlanRenderer'
import UserCreditPanel, { UserCreditData } from '@/components/admin-homes/lead-workbench/UserCreditPanel'
import ActivityTab, { ActivityFeedItem } from '@/components/admin-homes/lead-workbench/ActivityTab'
import EmailsTab, { EmailLogRow } from '@/components/admin-homes/lead-workbench/EmailsTab'
import VipRequestsTab, { VipRequestRow } from '@/components/admin-homes/lead-workbench/VipRequestsTab'
import NotesTab, { NoteRow } from '@/components/admin-homes/lead-workbench/NotesTab'

function SourceContextSection({ lead }: { lead: any }) {
  const items: Array<{ label: string; name: string | null; slug: string | null }> = []
  if (lead?.building) items.push({ label: 'Building', name: lead.building.building_name, slug: lead.building.slug })
  if (lead?.listing) items.push({ label: 'Listing', name: lead.listing.unparsed_address, slug: null })
  if (lead?.neighbourhood) items.push({ label: 'Neighbourhood', name: lead.neighbourhood.name, slug: lead.neighbourhood.slug })
  if (lead?.community) items.push({ label: 'Community', name: lead.community.name, slug: lead.community.slug })
  if (lead?.municipality) items.push({ label: 'Municipality', name: lead.municipality.name, slug: lead.municipality.slug })
  if (lead?.area) items.push({ label: 'Area', name: lead.area.name, slug: lead.area.slug })
  if (items.length === 0) return null
  return (
    <div className="mt-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Source Context</div>
      <div className="space-y-1 text-sm">
        {items.map((it, i) => (
          <div key={i}>
            <span className="text-gray-400">{it.label}: </span>
            {it.slug ? (
              <a href={`/${it.slug}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {it.name || '(unnamed)'} ↗
              </a>
            ) : (
              <span>{it.name || '(unnamed)'}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

type TabKey = 'overview' | 'plan' | 'estimator' | 'estimator_questionnaire' | 'credits' | 'activity' | 'emails' | 'vip' | 'notes'

const TABS: { id: TabKey; label: string; phase: string }[] = [
  { id: 'overview', label: 'Overview', phase: 'W4a' },
  { id: 'plan', label: 'Plan', phase: 'W4b' },
  { id: 'estimator', label: 'Estimator', phase: 'W4b-est' },
  { id: 'estimator_questionnaire', label: 'Estimator Q', phase: 'W4b-estq' },
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
  emailLog: EmailLogRow[]
  vipRequests: VipRequestRow[]
  notes: NoteRow[]
  reassignCandidates: Array<{ id: string; full_name: string | null; role: string | null }>
}

export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser, activityFeed, emailLog, vipRequests, notes, reassignCandidates }: Props) {
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
          <OverviewTab
            anchorLead={anchorLead}
            leadFamily={leadFamily}
            currentRole={currentRole}
            reassignCandidates={reassignCandidates}
            anchorLeadId={anchorLead.id}
          />
        ) : tab === 'plan' ? (
          <PlanTab anchorLead={anchorLead} leadFamily={leadFamily} />
        ) : tab === 'estimator' ? (

          <div className="space-y-6">

            {anchorLead.source_url && (


              <div className="text-sm">


                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted from </span>


                <a href={anchorLead.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">


                  {anchorLead.source_url} ↗


                </a>


              </div>


            )}


            <SourceContextSection lead={anchorLead} />

            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Estimator Submission</h3>

            <div className="grid grid-cols-2 gap-x-12 gap-y-4">

              <Field label="Estimated Value Min" value={anchorLead.estimated_value_min ? `${Number(anchorLead.estimated_value_min).toLocaleString()}` : null} />

              <Field label="Estimated Value Max" value={anchorLead.estimated_value_max ? `${Number(anchorLead.estimated_value_max).toLocaleString()}` : null} />

              <Field label="Budget Max" value={anchorLead.budget_max ? `${Number(anchorLead.budget_max).toLocaleString()}` : null} />

            </div>

            {anchorLead.property_details && (

              <div className="mt-6">

                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Property Details</h4>

                <pre className="text-xs bg-gray-50 p-3 rounded border overflow-auto whitespace-pre-wrap">{JSON.stringify(anchorLead.property_details, null, 2)}</pre>

              </div>

            )}

            {!anchorLead.estimated_value_min && !anchorLead.estimated_value_max && !anchorLead.property_details && (

              <p className="text-sm text-gray-500 italic">No estimator data captured for this lead.</p>

            )}

          </div>

        ) : tab === 'estimator_questionnaire' ? (

          <div className="space-y-6">

            {anchorLead.source_url && (


              <div className="text-sm">


                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted from </span>


                <a href={anchorLead.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">


                  {anchorLead.source_url} ↗


                </a>


              </div>


            )}


            <SourceContextSection lead={anchorLead} />

            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Estimator Questionnaire</h3>

            {anchorLead.message ? (

              <div className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 p-4 rounded border">{anchorLead.message}</div>

            ) : (

              <p className="text-sm text-gray-500 italic">No questionnaire data captured for this lead.</p>

            )}

          </div>

        ) : tab === 'credits' ? (
          <CreditsTab anchorLead={anchorLead} userCredit={userCredit} adminUser={adminUser} />
        ) : tab === 'activity' ? (
          <ActivityTab activityFeed={activityFeed} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />
        ) : tab === 'emails' ? (
          <EmailsTab emailLog={emailLog} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />
        ) : tab === 'vip' ? (
          <VipRequestsTab vipRequests={vipRequests} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />
        ) : tab === 'notes' ? (
          <NotesTab notes={notes} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />
        ) : (
          <PlaceholderTab name={activeTabMeta.label} phase={activeTabMeta.phase} />
        )}
      </div>
    </div>
  )
}

function OverviewTab({
  anchorLead,
  leadFamily,
  currentRole,
  reassignCandidates,
  anchorLeadId,
}: {
  anchorLead: any
  leadFamily: any[]
  currentRole: string
  reassignCandidates: Array<{ id: string; full_name: string | null; role: string | null }>
  anchorLeadId: string
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Lead Info</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Status" value={anchorLead.status} />
          <Field label="Quality" value={anchorLead.quality} />
                <Field label="Temperature" value={anchorLead.temperature || '\u2014'} />
          <Field label="Intent" value={anchorLead.intent} />
          <Field label="Geo" value={anchorLead.geo_name} />
          <Field label="Budget Max" value={anchorLead.budget_max ? `$${Number(anchorLead.budget_max).toLocaleString()}` : null} />
          <Field label="Source" value={anchorLead.source} />
        </dl>
        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Source URL</div>
          <div className="text-sm break-all">
            {anchorLead.source_url ? (
              <a href={anchorLead.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {anchorLead.source_url} ↗
              </a>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </div>
        </div>

        <SourceContextSection lead={anchorLead} />
      </section>

      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Hierarchy</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Agent" value={anchorLead.agents?.full_name} />
          <Field label="Manager" value={anchorLead.manager?.full_name} />
          <Field label="Area Manager" value={anchorLead.area_manager?.full_name} />
          <Field label="Tenant Admin" value={anchorLead.tenant_admin?.full_name} />
        </dl>
        {currentRole !== 'agent' && (
          <ReassignAgentControl
            anchorLeadId={anchorLeadId}
            currentAgentId={(anchorLead as any).agent_id || null}
            currentAgentName={(anchorLead as any).agents?.full_name || null}
            candidates={reassignCandidates}
          />
        )}
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
              {l.temperature && <span>Temperature: {l.temperature}</span>}
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

function ReassignAgentControl({
  anchorLeadId,
  currentAgentId,
  currentAgentName,
  candidates,
}: {
  anchorLeadId: string
  currentAgentId: string | null
  currentAgentName: string | null
  candidates: Array<{ id: string; full_name: string | null; role: string | null }>
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eligible = candidates.filter((c) => c.id !== currentAgentId)

  if (eligible.length === 0) {
    return (
      <div className="mt-3 mb-3 text-xs text-gray-400">
        No other agents available to reassign to.
      </div>
    )
  }

  const handleSubmit = async () => {
    if (!selectedId) return
    setSubmitting(true)
    setError(null)
    try {
      const url = '/api/admin-homes/leads/' + anchorLeadId + '/reassign-agent'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newAgentId: selectedId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error || ('Reassign failed (status ' + res.status + ')'))
        setSubmitting(false)
        return
      }
      setSelectedId('')
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
      <div className="text-xs font-semibold text-blue-900 mb-2">Reassign agent</div>
      <div className="text-xs text-gray-600 mb-2">
        Currently assigned: <span className="font-medium">{currentAgentName || '(unassigned)'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={submitting}
          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50"
        >
          <option value="">Select new agent...</option>
          {eligible.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name || '(unnamed)'}{c.role ? ' (' + c.role + ')' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !selectedId}
          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Reassigning...' : 'Reassign'}
        </button>
      </div>
      {error && (
        <div className="mt-2 text-xs text-red-600">{error}</div>
      )}
    </div>
  )
}
