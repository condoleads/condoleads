'use client'

// app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx
// W-LEADS-WORKBENCH W4a (2026-05-13).
//
// Workbench client component -- 7-tab nav + Overview tab content.
// Plan/Credits/Activity/Emails/VIP/Notes are placeholders filled by W4b-g.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PlanTab, { BuyerListingTile } from '@/components/admin-homes/lead-workbench/PlanRenderer'
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

      {(anchorLead as any)?.status === 'do_not_contact' && (
        <div role="alert" className="mb-4 rounded border-2 border-red-600 bg-red-50 p-4">
          <div className="text-red-900 font-bold text-sm uppercase tracking-wider">
            Do Not Contact — Outbound Communication Blocked
          </div>
          <div className="text-red-800 text-sm mt-2">
            This lead has requested no further contact. Outbound email is blocked server-side. Phone, SMS, and physical mail outreach are also prohibited under CASL / TCPA. Document any inadvertent contact in the Notes tab immediately.
          </div>
        </div>
      )}

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
          <EstimatorTab anchorLead={anchorLead} leadFamily={leadFamily} />
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

// =============================================================================
// W-ESTIMATOR-LEAD-RENDER-AND-EMAIL P3 (2026-06-17): EstimatorTab
//
// Mirrors the PlanTab pattern (components/admin-homes/lead-workbench/
// PlanRenderer.tsx:152-183):
//   - filter leadFamily for leads carrying an estimator workingDoc
//   - if >1 estimator lead → pill selector across them, exactly like
//     PlanSelector
//   - render the selected lead's workingDoc as estimate header + 3
//     sections (Comparable Sold / Tax-Matched / Competing) using the
//     SAME BuyerListingTile that PlanRenderer's BuyerCompSold +
//     BuyerTaxMatched + TopListings already use (photo + slug href via
//     buildPropertySlug + dual-shape reads + 🏠 placeholder on no
//     media)
//
// NO new tile component. We only adapt WorkingDocTile → the snake_case
// shape BuyerListingTile expects (it already handles dual-shape).
// =============================================================================
const ESTIMATOR_SOURCES = new Set(['estimator', 'sale_offer_inquiry', 'lease_offer_inquiry'])

function hasWorkingDoc(lead: any): boolean {
  return !!lead?.property_details?.workingDoc && ESTIMATOR_SOURCES.has(lead.source)
}

function estimatorPillLabel(lead: any): string {
  const wd = lead?.property_details?.workingDoc
  const src = lead.source as string
  const intent =
    src === 'sale_offer_inquiry' ? 'Sale Offer' :
    src === 'lease_offer_inquiry' ? 'Lease Offer' :
    'Get Estimate'
  const subj = wd?.subject?.buildingName
    || wd?.subject?.buildingAddress
    || (lead.property_details?.buildingName ?? '—')
  const unit = wd?.subject?.unitNumber ? ` #${wd.subject.unitNumber}` : ''
  const date = lead.created_at
    ? new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—'
  return `${intent} · ${subj}${unit} · ${date}`
}

function EstimatorTab({ anchorLead, leadFamily }: { anchorLead: any; leadFamily: any[] }) {
  const estimators = (leadFamily || []).filter(hasWorkingDoc)
  const defaultId = hasWorkingDoc(anchorLead) ? anchorLead.id : (estimators[0]?.id ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(defaultId)

  if (estimators.length === 0) {
    return (
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
        <p className="text-sm text-gray-500 italic">No estimator data captured for this lead family.</p>
      </div>
    )
  }

  const selected = estimators.find(l => l.id === selectedId) || estimators[0]
  const wd = selected.property_details.workingDoc
  const docType: 'home' | 'condo' = wd?.type === 'home' ? 'home' : 'condo'

  return (
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

      {/* Pill selector — same shape as PlanSelector */}
      {estimators.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-gray-200">
          <span className="text-xs text-gray-500 pr-1">
            Estimator events in family ({estimators.length}):
          </span>
          {estimators.map(l => {
            const isAnchor = l.id === anchorLead.id
            const isSelected = l.id === selected.id
            const cls = 'px-3 py-1.5 text-xs rounded-full border transition-colors ' + (
              isSelected
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            )
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedId(l.id)}
                className={cls}
              >
                {estimatorPillLabel(l)}
                {isAnchor && <span className="ml-1 opacity-70">(anchor)</span>}
              </button>
            )
          })}
        </div>
      )}

      <EstimatorRender lead={selected} workingDoc={wd} docType={docType} />
    </div>
  )
}

function EstimatorRender({ lead, workingDoc, docType }: { lead: any; workingDoc: any; docType: 'home' | 'condo' }) {
  const subj = workingDoc?.subject || {}
  const est = workingDoc?.estimate || {}
  const subjectLine = [subj.buildingName, subj.buildingAddress, subj.unitNumber ? '#' + subj.unitNumber : '']
    .filter(Boolean)
    .join(' · ')
  const priceFmt = (n: any) => (n != null && Number.isFinite(Number(n))
    ? '$' + Math.round(Number(n)).toLocaleString('en-CA')
    : '—')

  // Sections — adapt the WorkingDocTile (camelCase) into the dual-shape
  // BuyerListingTile expects. The tile reads snake_case OR camelCase, so
  // forwarding both name forms is safe.
  const adaptSoldTile = (t: any) => ({
    listing_key: t.listingKey,
    listingKey: t.listingKey,
    unparsed_address: t.unparsedAddress,
    unparsedAddress: t.unparsedAddress,
    close_price: t.closePrice,
    closePrice: t.closePrice,
    adjusted_price: t.adjustedPrice,
    adjustedPrice: t.adjustedPrice,
    close_date: t.closeDate,
    closeDate: t.closeDate,
    bedrooms_total: t.bedrooms,
    bedrooms: t.bedrooms,
    bathrooms_total_integer: t.bathrooms,
    bathrooms: t.bathrooms,
    living_area_range: t.livingAreaRange,
    livingAreaRange: t.livingAreaRange,
    unit_number: t.unitNumber,
    unitNumber: t.unitNumber,
    days_on_market: t.daysOnMarket,
    daysOnMarket: t.daysOnMarket,
    property_subtype: docType === 'home' ? 'Detached' : null,  // docType decides slug shape; passing a HOME_TYPES value forces home slug
    mediaUrl: t.mediaUrl,
    temperature: t.temperature,
  })
  const adaptCompetingTile = (t: any) => ({
    id: t.id,
    listing_key: t.listingKey,
    listingKey: t.listingKey,
    unparsed_address: t.unparsedAddress,
    unparsedAddress: t.unparsedAddress,
    list_price: t.listPrice,
    listPrice: t.listPrice,
    bedrooms_total: t.bedrooms,
    bedrooms: t.bedrooms,
    bathrooms_total_integer: t.bathrooms,
    bathrooms: t.bathrooms,
    living_area_range: t.livingAreaRange,
    livingAreaRange: t.livingAreaRange,
    unit_number: t.unitNumber,
    unitNumber: t.unitNumber,
    days_on_market: t.daysOnMarket,
    daysOnMarket: t.daysOnMarket,
    property_subtype: docType === 'home' ? 'Detached' : null,
    mediaUrl: t.mediaUrl,
  })

  return (
    <div className="space-y-6">
      {/* Estimate header — analogous to PlanRenderer's structured header card */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estimator working document</div>
        {subjectLine && (
          <div className="text-sm font-bold text-slate-900 mt-1">{subjectLine}</div>
        )}
        <div className="flex flex-wrap items-baseline gap-4 mt-2">
          {est.estimatedPrice != null && (
            <div className="text-2xl font-extrabold text-slate-900">{priceFmt(est.estimatedPrice)}</div>
          )}
          {est.priceRange && (
            <div className="text-xs text-slate-500">Range {priceFmt(est.priceRange.low)} – {priceFmt(est.priceRange.high)}</div>
          )}
        </div>
        {(est.confidence || est.matchTier) && (
          <div className="text-xs text-slate-600 mt-2">
            {est.confidence && <span>Confidence: {est.confidence}</span>}
            {est.confidence && est.matchTier ? ' · ' : ''}
            {est.matchTier && <span>{est.matchTier}</span>}
          </div>
        )}
        <div className="text-xs text-slate-400 mt-3">
          Source: <span className="font-semibold">{lead.source}</span>
          {lead.created_at ? ' · ' + new Date(lead.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
        </div>
      </section>

      {/* Comparable Sold */}
      {Array.isArray(workingDoc?.comparableSold?.tiles) && workingDoc.comparableSold.tiles.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Comparable Sold ({workingDoc.comparableSold.tiles.length})
          </h3>
          <div className="flex flex-col gap-2">
            {workingDoc.comparableSold.tiles.map((t: any, i: number) => (
              <BuyerListingTile key={t.listingKey || 'cs-' + i} listing={adaptSoldTile(t)} kind="sold" index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Tax-Matched */}
      {Array.isArray(workingDoc?.taxMatch?.tiles) && workingDoc.taxMatch.tiles.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Tax-Matched ({workingDoc.taxMatch.tiles.length})
          </h3>
          <div className="flex flex-col gap-2">
            {workingDoc.taxMatch.tiles.map((t: any, i: number) => (
              <BuyerListingTile key={t.listingKey || 'tm-' + i} listing={adaptSoldTile(t)} kind="sold" index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Competing For Sale */}
      {Array.isArray(workingDoc?.competing?.tiles) && workingDoc.competing.tiles.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Competing For Sale ({workingDoc.competing.tiles.length})
          </h3>
          <div className="flex flex-col gap-2">
            {workingDoc.competing.tiles.map((t: any, i: number) => (
              <BuyerListingTile key={t.listingKey || t.id || 'cp-' + i} listing={adaptCompetingTile(t)} kind="matched" index={i} />
            ))}
          </div>
        </section>
      )}
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
