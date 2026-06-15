'use client'

// components/admin-homes/lead-workbench/PlanRenderer.tsx
// W-LEADS-WORKBENCH W4b (2026-05-13).
//
// Plan tab + renderer. Reads plan_data JSONB off each lead row and renders
// at email-template richness, bounded by what is actually persisted.
//
// plan_data shapes (both real, both must normalize):
//   plan-email/route.ts:  { planType, plan: {nested profile}, analytics, topListings }
//   charlie/lead/route.ts: { intent, geoName, geoType, geoId, budgetMin/Max OR estimatedValueMin/Max, propertyType, bedrooms, timeline, goal, analytics, topListings, generatedAt }
//
// F-W4B-PLAN-DATA-RENDER-SUBSET: comparables, blocks, sellerEstimate,
// vipCreditUsed, summary are API-time-only (not in plan_data) -- unrenderable.
//
// W-CHARLIE-LEADS-FIX (2026-06-14): the L13-14 comment above is OUTDATED for
// Charlie SELLER leads created after commit 3d9ac08 (2026-06-13) — those
// leads DO carry plan_data.sellerEstimate (full estimate + comparables +
// taxMatch + competingListings). STEP 1 SAVEPOINT read confirms 3/12 (25%)
// of WALLiam Charlie seller leads carry it; 63b48f13 verified. Rather than
// duplicate CV-1's CharlieLeadEstimate work in this file, the seller branch
// below mounts CharlieLeadEstimate directly, fed by buildSellerEstimateView
// (same pattern LeadDetailClient.tsx:213-228 uses on the /dashboard/leads/
// route). Duplicate sections (Market Intel/Offer Intel/Best Time/Price by
// Home Type/Profile/Summary) are SUPPRESSED inside CharlieLeadEstimate via
// the view.present flags — PlanRenderer continues to render those itself.
// Buyer plans are untouched (TopListings remains the buyer-side rendering).

import { useState } from 'react'
import CharlieLeadEstimate from '@/components/dashboard/CharlieLeadEstimate'
import { buildSellerEstimateView } from '@/lib/charlie/seller-estimate-view'
// W-CHARLIE-BUYER-CHUNK3 (2026-06-15): shared property-slug helper that
// the seller comp tile (CharlieLeadEstimate.tsx:109) + email tile
// (charlie-plan-email-html.ts:377-382) + Charlie in-chat tile already
// use. Buyer matched-listings + comp-sold tiles below now adopt the
// SAME helper so all four surfaces produce byte-identical hrefs
// (walliam.ca-resolvable descriptive slug, NOT bare-MLS 404).
import { buildPropertySlug } from '@/lib/utils/property-slug'

interface Agent {
  id?: string
  full_name?: string | null
  email?: string | null
  cell_phone?: string | null
  profile_photo_url?: string | null
  brokerage_name?: string | null
  title?: string | null
}

interface Lead {
  id: string
  contact_name?: string | null
  contact_email?: string | null
  intent?: string | null
  geo_name?: string | null
  budget_max?: number | null
  estimated_value_min?: number | null
  estimated_value_max?: number | null
  source?: string | null
  source_url?: string | null
  created_at: string
  plan_data?: any
  agents?: Agent | null
}

interface NormalizedPlan {
  intent: string | null
  isBuyer: boolean
  geoName: string | null
  geoType: string | null
  geoId: string | null
  budgetMin: number | null
  budgetMax: number | null
  bedrooms: string | number | null
  propertyType: string | null
  timeline: string | null
  estimatedValueMin: number | null
  estimatedValueMax: number | null
  goal: string | null
  analytics: any
  topListings: any[]
  generatedAt: string | null
  summary: string | null
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function hasPlanData(lead: Lead): boolean {
  if (!lead.plan_data) return false
  if (typeof lead.plan_data !== 'object') return false
  return Object.keys(lead.plan_data).length > 0
}

function normalizePlan(planData: any, lead: Lead): NormalizedPlan {
  const isNested = planData && 'planType' in planData && 'plan' in planData
  const nested = isNested ? (planData.plan || {}) : {}

  const intent =
    planData?.intent ||
    planData?.planType ||
    lead.intent ||
    null

  return {
    intent,
    isBuyer: intent === 'buyer',
    geoName: nested.geoName || planData?.geoName || lead.geo_name || null,
    geoType: planData?.geoType || nested.geoType || null,
    geoId: planData?.geoId || nested.geoId || null,
    budgetMin: (nested.budgetMin !== undefined ? nested.budgetMin : null) ?? planData?.budgetMin ?? null,
    budgetMax: (nested.budgetMax !== undefined ? nested.budgetMax : null) ?? planData?.budgetMax ?? lead.budget_max ?? null,
    bedrooms: nested.bedrooms ?? planData?.bedrooms ?? null,
    propertyType: nested.propertyType || planData?.propertyType || null,
    timeline: nested.timeline || planData?.timeline || null,
    estimatedValueMin: nested.estimatedValueMin ?? planData?.estimatedValueMin ?? lead.estimated_value_min ?? null,
    estimatedValueMax: nested.estimatedValueMax ?? planData?.estimatedValueMax ?? lead.estimated_value_max ?? null,
    goal: nested.goal || planData?.goal || null,
    analytics: planData?.analytics || {},
    topListings: Array.isArray(planData?.topListings) ? planData.topListings : [],
    generatedAt: planData?.generatedAt || lead.created_at || null,
    summary: nested.summary || planData?.summary || null,
  }
}

function fmtCAD(n: any): string {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return '$' + num.toLocaleString('en-CA')
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

// =============================================================================
// PlanTab (default export) -- selector + renderer
// =============================================================================

interface PlanTabProps {
  anchorLead: Lead
  leadFamily: Lead[]
}

export default function PlanTab({ anchorLead, leadFamily }: PlanTabProps) {
  const plans = (leadFamily || []).filter(hasPlanData)

  if (plans.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-sm font-medium">No plan generated for this lead</div>
        <div className="text-xs mt-1">
          Plans are captured when Charlie completes a buyer or seller flow.
        </div>
      </div>
    )
  }

  const defaultId = hasPlanData(anchorLead) ? anchorLead.id : plans[0].id
  const [selectedId, setSelectedId] = useState<string>(defaultId)
  const selected = plans.find(p => p.id === selectedId) || plans[0]

  return (
    <div className="space-y-6">
      {plans.length > 1 && (
        <PlanSelector
          plans={plans}
          selectedId={selectedId}
          onSelect={setSelectedId}
          anchorId={anchorLead.id}
        />
      )}
      <PlanRenderer lead={selected} />
    </div>
  )
}

function PlanSelector({
  plans, selectedId, onSelect, anchorId,
}: {
  plans: Lead[]
  selectedId: string
  onSelect: (id: string) => void
  anchorId: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-gray-200">
      <span className="text-xs text-gray-500 pr-1">
        Plans in family ({plans.length}):
      </span>
      {plans.map(p => {
        const n = normalizePlan(p.plan_data, p)
        const intentLabel = n.isBuyer ? 'Buyer' : 'Seller'
        const label = intentLabel + ' · ' + (n.geoName || '—') + ' · ' + fmtDate(n.generatedAt)
        const isAnchor = p.id === anchorId
        const isSelected = p.id === selectedId
        const cls = 'px-3 py-1.5 text-xs rounded-full border transition-colors ' + (
          isSelected
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        )
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={cls}
          >
            {label}
            {isAnchor && <span className="ml-1 opacity-70">(anchor)</span>}
          </button>
        )
      })}
    </div>
  )
}

// =============================================================================
// PlanRenderer -- single plan_data render
// =============================================================================

function PlanRenderer({ lead }: { lead: Lead }) {
  const n = normalizePlan(lead.plan_data, lead)
  const a = n.analytics || {}

  const stl = a.sale_to_list_ratio ? Number(a.sale_to_list_ratio) : null
  const dom = a.closed_avg_dom_90 ? Number(a.closed_avg_dom_90) : null

  let conditionLabel = 'Insufficient Data'
  let conditionColor = '#94a3b8'
  if (stl && dom) {
    if (stl >= 99 && dom <= 20) { conditionLabel = "Strong Seller's Market"; conditionColor = '#10b981' }
    else if (stl >= 97 && dom <= 40) { conditionLabel = "Seller's Market"; conditionColor = '#10b981' }
    else if (stl < 95 || dom > 70) { conditionLabel = "Buyer's Market"; conditionColor = '#ef4444' }
    else { conditionLabel = 'Balanced Market'; conditionColor = '#f59e0b' }
  }

  const analyticsHasData = a && Object.keys(a).length > 0
  const hasOfferIntel = analyticsHasData && (a.sale_to_list_ratio || a.avg_concession_pct || a.closed_avg_dom_90)
  const hasSubtype = a.subtype_breakdown && typeof a.subtype_breakdown === 'object' && Object.keys(a.subtype_breakdown).length > 0
  const hasListings = n.topListings.length > 0

  // W-CHARLIE-LEADS-FIX (2026-06-14): hoist the canonical-view derivation so
  // the bottom-of-page <Disclaimer /> can suppress itself when SellerEstimate-
  // Mount will render CharlieLeadEstimate's own AI Disclaimer (line 552 of
  // CharlieLeadEstimate.tsx). Without this, the seller-WITH-sellerEstimate
  // case renders TWO disclaimers. Pure-function call; safe to repeat in
  // SellerEstimateMount.
  const sellerViewPresent = !n.isBuyer && buildSellerEstimateView(lead.plan_data ?? null) != null

  const headerIcon = n.isBuyer ? '🏠' : '💰'
  const headerLabel = n.isBuyer ? 'Buyer Plan' : 'Seller Strategy'

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-5 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-white m-0">
              {headerIcon} {headerLabel} — {n.geoName || 'GTA'}
            </h2>
            <div className="text-xs text-slate-400 mt-1">
              Generated {fmtDate(n.generatedAt)}
              {lead.contact_name ? ' · for ' + lead.contact_name : ''}
            </div>
          </div>
          <span
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold"
            style={{
              background: conditionColor + '20',
              border: '1px solid ' + conditionColor + '40',
              color: conditionColor,
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: conditionColor }} />
            {conditionLabel}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {analyticsHasData && <MarketIntel analytics={a} geoName={n.geoName} />}
        {hasOfferIntel && <OfferIntel analytics={a} />}
        {a.insight_seasonal && <BestTime seasonal={a.insight_seasonal} isBuyer={n.isBuyer} />}
        {hasSubtype && <SubtypeBreakdown breakdown={a.subtype_breakdown} />}
        {n.summary && <Summary text={n.summary} isBuyer={n.isBuyer} />}
        <Profile norm={n} />
        {/* W-CHARLIE-LEADS-FIX (2026-06-14): buyer keeps TopListings (matched
            listings preview). Seller routes to SellerEstimateMount, which
            consumes plan_data.sellerEstimate via the same canonical view
            LeadDetailClient uses on the dashboard route. Mount uses
            view.present flag overrides to suppress sections PlanRenderer
            already renders (Market Intel/Offer Intel/Best Time/Price by
            Home Type/Profile/Summary), so nothing duplicates. */}
        {n.isBuyer && hasListings && <TopListings listings={n.topListings} isBuyer={n.isBuyer} />}
        {/* W-CHARLIE-BUYER-CHUNK2 (2026-06-15): buyer-side comp-sold +
            tax-match mounts. Read straight off plan_data — both fields
            are written by /api/charlie/plan-email/route.ts on buyer
            plans (plan_data.comparables from get_comparables, plan_data
            .buyerTaxMatch from deriveBuyerTaxMatch). Honest empty-state
            on missing/empty (the BuyerCompSold/BuyerTaxMatch components
            return null when there's no data). */}
        {n.isBuyer && <BuyerCompSold comparables={lead.plan_data?.comparables} />}
        {n.isBuyer && <BuyerTaxMatched taxMatch={lead.plan_data?.buyerTaxMatch} />}
        {!n.isBuyer && <SellerEstimateMount lead={lead} />}
        {lead.source_url && <SourceUrl url={lead.source_url} />}
        {lead.agents && <AgentCard agent={lead.agents} />}
        {/* W-CHARLIE-LEADS-FIX: suppress PlanRenderer's Disclaimer when the
            seller-side CharlieLeadEstimate mount will render its own AI
            Disclaimer (else dup ×2). Buyer keeps it; seller w/o
            sellerEstimate keeps it (amber-notice path returns early in
            CharlieLeadEstimate before its disclaimer). */}
        {!sellerViewPresent && <Disclaimer />}
      </div>
    </div>
  )
}

// =============================================================================
// Sections
// =============================================================================

function MarketIntel({ analytics, geoName }: { analytics: any; geoName: string | null }) {
  const a = analytics
  const top = [
    { label: 'Avg Days on Market', value: a.closed_avg_dom_90 ? a.closed_avg_dom_90 + 'd' : '—' },
    { label: 'Sale / List Ratio', value: a.sale_to_list_ratio ? a.sale_to_list_ratio + '%' : '—' },
    { label: 'Active Listings', value: a.active_count ? Number(a.active_count).toLocaleString() : '—' },
  ]
  const bottom = [
    { label: 'Sold (90d)', value: a.closed_sale_count_90 ? Number(a.closed_sale_count_90).toLocaleString() : '—' },
    { label: 'Absorption Rate', value: a.absorption_rate_pct ? a.absorption_rate_pct + '%' : '—' },
    { label: 'Median PSF', value: a.median_psf ? '$' + Number(a.median_psf).toLocaleString('en-CA', { maximumFractionDigits: 0 }) : '—' },
  ]
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Market Intelligence{geoName ? ' · ' + geoName : ''}
      </h3>
      <div className="grid grid-cols-3 gap-2 mb-2">
        {top.map(m => <MetricCard key={m.label} label={m.label} value={m.value} />)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {bottom.map(m => <MetricCard key={m.label} label={m.label} value={m.value} />)}
      </div>
    </section>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-100 rounded-lg p-3 text-center">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-extrabold mt-1" style={{ color: color || '#0f172a' }}>{value}</div>
    </div>
  )
}

function OfferIntel({ analytics }: { analytics: any }) {
  const a = analytics
  const offerAt = a.sale_to_list_ratio ? Number(a.sale_to_list_ratio).toFixed(1) + '%' : '—'
  const concession = a.avg_concession_pct ? Number(a.avg_concession_pct).toFixed(1) + '%' : '—'
  const decide = a.closed_avg_dom_90 ? Number(a.closed_avg_dom_90).toFixed(0) + 'd' : '—'
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Offer Intelligence</h3>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-100 rounded-lg p-3 text-center">
          <div className="text-[10px] text-slate-500 uppercase">Offer At</div>
          <div className="text-lg font-extrabold text-blue-700 mt-1">{offerAt}</div>
          <div className="text-[10px] text-slate-400 mt-1">of asking</div>
        </div>
        <div className="bg-slate-100 rounded-lg p-3 text-center">
          <div className="text-[10px] text-slate-500 uppercase">Avg Concession</div>
          <div className="text-lg font-extrabold text-emerald-600 mt-1">{concession}</div>
          <div className="text-[10px] text-slate-400 mt-1">below asking</div>
        </div>
        <div className="bg-slate-100 rounded-lg p-3 text-center">
          <div className="text-[10px] text-slate-500 uppercase">Decide In</div>
          <div className="text-lg font-extrabold text-amber-500 mt-1">{decide}</div>
          <div className="text-[10px] text-slate-400 mt-1">avg DOM</div>
        </div>
      </div>
    </section>
  )
}

function BestTime({ seasonal, isBuyer }: { seasonal: any; isBuyer: boolean }) {
  const best = (seasonal.best_months || []) as number[]
  const worst = (seasonal.worst_months || []) as number[]
  const cur = seasonal.current_month as number | undefined
  const bestStr = best.map(m => MONTHS[m - 1]).filter(Boolean).join(', ') || '—'
  const worstStr = worst.map(m => MONTHS[m - 1]).filter(Boolean).join(', ') || '—'
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Best Time to {isBuyer ? 'Buy' : 'Sell'}
      </h3>
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700 leading-relaxed">
        Best months: <strong className="text-emerald-600">{bestStr}</strong>
        {' · '}
        Avoid: <strong className="text-rose-500">{worstStr}</strong>
        {cur && (
          <>
            <br />
            Currently <strong>{MONTHS[cur - 1]}</strong>
            {seasonal.current_month_rank && (
              <> — ranked #{seasonal.current_month_rank} of 12 for {isBuyer ? 'buyer' : 'seller'} power.</>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function SubtypeBreakdown({ breakdown }: { breakdown: Record<string, any> }) {
  const entries = Object.entries(breakdown)
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Price by Home Type</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <th className="text-left p-2">Type</th>
              <th className="text-center p-2">DOM</th>
              <th className="text-center p-2">STL</th>
              <th className="text-right p-2">Median</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([subtype, d]: [string, any]) => (
              <tr key={subtype} className="border-t border-slate-100">
                <td className="p-2 font-semibold text-slate-900">{subtype}</td>
                <td className="p-2 text-center text-slate-500">{d.avg_dom ? Math.round(d.avg_dom) + 'd' : '—'}</td>
                <td className="p-2 text-center text-slate-500">{d.sale_to_list ? d.sale_to_list + '%' : '—'}</td>
                <td className="p-2 text-right font-extrabold text-blue-700">{d.median_price ? '$' + Number(d.median_price).toLocaleString('en-CA') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Summary({ text, isBuyer }: { text: string; isBuyer: boolean }) {
  return (
    <section className="bg-gradient-to-br from-blue-50 to-emerald-50 border border-blue-200 rounded-lg p-4">
      <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">
        ✨ Your {isBuyer ? 'Buyer' : 'Seller'} Strategy
      </div>
      <p className="text-sm text-slate-800 leading-relaxed m-0">{text}</p>
    </section>
  )
}

function Profile({ norm }: { norm: NormalizedPlan }) {
  const rows: { label: string; value: string }[] = []
  if (norm.isBuyer) {
    if (norm.budgetMin !== null || norm.budgetMax !== null) {
      rows.push({
        label: 'Budget',
        value: fmtCAD(norm.budgetMin || 0) + ' — ' + fmtCAD(norm.budgetMax),
      })
    }
    if (norm.propertyType) rows.push({ label: 'Property Type', value: String(norm.propertyType) })
    if (norm.bedrooms !== null && norm.bedrooms !== undefined) rows.push({ label: 'Bedrooms', value: String(norm.bedrooms) + '+' })
    if (norm.timeline) rows.push({ label: 'Timeline', value: String(norm.timeline) })
  } else {
    if (norm.propertyType) rows.push({ label: 'Property Type', value: String(norm.propertyType) })
    if (norm.estimatedValueMin !== null || norm.estimatedValueMax !== null) {
      rows.push({
        label: 'Est. Value',
        value: fmtCAD(norm.estimatedValueMin || 0) + ' — ' + fmtCAD(norm.estimatedValueMax),
      })
    }
    if (norm.timeline) rows.push({ label: 'Timeline', value: String(norm.timeline) })
    if (norm.goal) rows.push({ label: 'Goal', value: String(norm.goal) })
  }

  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {norm.isBuyer ? 'Buyer Profile' : 'Seller Profile'}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No profile fields captured at plan time.</p>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {rows.map(r => (
              <div key={r.label} className="flex justify-between gap-4">
                <dt className="text-slate-500">{r.label}</dt>
                <dd className="font-semibold text-slate-900 text-right">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  )
}

// W-CHARLIE-LEADS-FIX (2026-06-14): seller-side full-content mount. Reuses
// CharlieLeadEstimate (CV-1) by feeding it the canonical view derived from
// plan_data.sellerEstimate. The duplicate-section suppression rationale
// is documented at the import block at the top of this file.
//
// Duplication map (PlanRenderer above renders → suppressed inside the mount):
//   PlanRenderer.MarketIntel       → view.present.marketIntel = false
//   PlanRenderer.OfferIntel        → view.present.offerIntel = false
//   PlanRenderer.BestTime          → view.present.bestTime = false
//   PlanRenderer.SubtypeBreakdown  → view.present.priceByHomeType = false
//   PlanRenderer.Profile           → view.present.planCardGrid = false
//   PlanRenderer.Summary           → view.present.planSummary = false
// What CharlieLeadEstimate DOES render under this mount (the sections
// PlanRenderer can't render from plan_data):
//   Property Estimate price card, 4-row tier rail (Confidence by Area),
//   Comparable Sold + tier chips, Tax-Matched + chips + estimate pill,
//   Competing For Sale, Pricing Strategy & Risk, AI Disclaimer.
// Null sellerEstimate → CharlieLeadEstimate renders the Phase-2 amber
// "no estimate captured" notice (legacyNoticeWhenEmpty=true).
function SellerEstimateMount({ lead }: { lead: Lead }) {
  const view = buildSellerEstimateView(lead.plan_data ?? null)
  if (view) {
    const adminView = {
      ...view,
      present: {
        ...view.present,
        // suppress PlanRenderer-duplicate sections
        planCardGrid: false,
        marketIntel: false,
        offerIntel: false,
        bestTime: false,
        priceByHomeType: false,
        planSummary: false,
      },
    }
    return <CharlieLeadEstimate view={adminView} />
  }
  return (
    <CharlieLeadEstimate
      view={null}
      legacyNoticeWhenEmpty={true}
      leadMeta={{
        intent: lead.intent ?? null,
        geoName: lead.geo_name ?? null,
        contactName: lead.contact_name ?? null,
        createdAtIso: lead.created_at ?? null,
      }}
    />
  )
}

// W-CHARLIE-BUYER-CHUNK3 (2026-06-15): single buyer tile renderer used
// by BOTH TopListings (matched/active) AND BuyerCompSold (sold). Mirrors
// the seller CompRow tile in CharlieLeadEstimate.tsx:96-165 — photo +
// dual-shape field reads + buildPropertySlug-driven clickable wrapper +
// optional temperature badge — but Tailwind-styled for the admin
// lead page and with no tier chip (buyer comps have no anchor tier;
// per recon they don't carry sourceTier either, so we honestly omit
// the chip rather than fabricate one).
//
// `kind` controls only the affordance ("For sale" vs "Sold") and the
// price-row accent color. Both kinds share the same dual-shape reads,
// the same slug helper, and the same photo-or-placeholder + link
// behavior so the admin sees ONE consistent tile shape for every
// buyer-side listing on the lead page.
function BuyerListingTile({ listing, kind, index }: { listing: any; kind: 'matched' | 'sold'; index: number }) {
  // Dual-shape reads — mirror the email + ComparableCard pattern from
  // Chunks 2 + 2b. Numerics use ?? so 0 isn't masked; strings use ||.
  const price = (listing.adjustedPrice ?? listing.adjusted_price)
    ?? (kind === 'sold'
        ? (listing.closePrice ?? listing.close_price ?? listing.listPrice ?? listing.list_price)
        : (listing.listPrice ?? listing.list_price ?? listing.closePrice ?? listing.close_price))
    ?? listing.price
    ?? null
  const unparsedAddress = listing.unparsedAddress || listing.unparsed_address || listing.address || ''
  const bedrooms = listing.bedrooms_total ?? listing.bedrooms ?? null
  const bathrooms = listing.bathrooms_total_integer ?? listing.bathrooms ?? null
  const subtype = listing.property_subtype || listing.propertySubtype || ''
  const daysOnMarket = listing.days_on_market ?? listing.daysOnMarket ?? null
  const listingKey = listing.listing_key || listing.listingKey || null
  const unitNumber = listing.unit_number || listing.unitNumber || null
  const mediaUrl = listing.mediaUrl
    || listing.media?.[0]?.media_url
    || listing.media?.[0]?.url
    || null
  // Temperature: geo-listings (the buyer comp source) does NOT return
  // a `temperature` field — confirmed via LISTING_SELECT at
  // app/api/geo-listings/route.ts:9. The badge only renders if the
  // listing happens to carry one (forward-compat). NO fabricated tier.
  const temperature = listing.temperature || null

  // Slug via the shared helper — same one CharlieLeadEstimate.tsx:109
  // and the email template (charlie-plan-email-html.ts:377-382) and
  // ComparableCard use. When listingKey is missing the helper returns
  // null and we render an honest un-wrapped tile (no broken link).
  const slug = buildPropertySlug({
    listingKey,
    unparsedAddress,
    propertySubtype: subtype,
    unitNumber,
  })
  const href = slug ? '/' + slug : null
  const addrShort = (unparsedAddress as string).split(',')[0] || '—'
  const meta = [
    bedrooms != null ? bedrooms + ' bed' : null,
    bathrooms != null ? bathrooms + ' bath' : null,
    subtype || null,
    daysOnMarket != null ? daysOnMarket + 'd DOM' : null,
  ].filter(Boolean).join(' · ')
  const priceColor = kind === 'sold' ? 'text-emerald-700' : 'text-blue-700'
  const affordance = kind === 'sold' ? 'Sold' : 'For sale'
  const tempColor: Record<string, string> = {
    HOT: 'bg-red-500', WARM: 'bg-amber-500', COLD: 'bg-blue-500', FROZEN: 'bg-slate-400',
  }

  const tileInner = (
    <>
      <div className="w-20 h-[72px] flex-shrink-0 bg-slate-100 overflow-hidden relative">
        {mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl} alt="" className="block w-20 h-[72px] object-cover" />
        ) : (
          <div className="w-20 h-[72px] flex items-center justify-center text-2xl text-slate-300">🏠</div>
        )}
        {temperature && (
          <div className={`absolute top-1 left-1 ${tempColor[temperature] || 'bg-slate-400'} text-white text-[9px] font-bold px-1.5 py-0.5 rounded`}>
            {temperature}
          </div>
        )}
      </div>
      <div className="flex-1 px-3 py-2 min-w-0">
        <div className="text-sm font-bold text-slate-900 truncate">{addrShort}</div>
        {meta && <div className="text-xs text-slate-500 mt-0.5 truncate">{meta}</div>}
      </div>
      <div className="px-3 py-2 text-right whitespace-nowrap">
        <div className={`text-base font-extrabold ${priceColor}`}>
          {price != null ? fmtCAD(price) : '—'}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">{affordance}</div>
      </div>
    </>
  )

  const key = listingKey || 'idx-' + index
  if (href) {
    return (
      <a
        key={key}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex border border-slate-200 rounded-lg overflow-hidden bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors no-underline"
      >
        {tileInner}
      </a>
    )
  }
  return (
    <div key={key} className="flex border border-slate-200 rounded-lg overflow-hidden bg-white">
      {tileInner}
    </div>
  )
}

function TopListings({ listings, isBuyer }: { listings: any[]; isBuyer: boolean }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {isBuyer ? 'Matched Listings' : 'Comparable Sales'} ({listings.length})
      </h3>
      <div className="flex flex-col gap-2">
        {/* W-CHARLIE-BUYER-CHUNK3 (2026-06-15): matched-listings tiles
            now match the seller-comp tile shape — photo + dual-shape
            address/price/meta + clickable slug-based href. Photoless
            legacy slim-shape leads fall through to the 🏠 placeholder
            (honest, not broken). */}
        {listings.map((l: any, i: number) => (
          <BuyerListingTile key={l.listing_key || l.listingKey || 'idx-' + i} listing={l} kind="matched" index={i} />
        ))}
      </div>
    </section>
  )
}

// W-CHARLIE-BUYER-CHUNK2 (2026-06-15): buyer comp-sold tiles on the admin
// lead page. Renders the SAME shape Charlie's in-chat comparables block
// uses, fed by plan_data.comparables (written by plan-email/route.ts on
// buyer plans from Charlie's get_comparables tool output). Null/empty
// data → null render (honest absence; the disclaimer block above remains).
// W-CHARLIE-BUYER-CHUNK3 (2026-06-15): upgraded to shared BuyerListingTile
// — photo, slug-driven link, dual-shape fields. Same tile pattern the
// matched-listings section uses; one consistent buyer tile shape across
// the entire lead page.
function BuyerCompSold({ comparables }: { comparables: any }) {
  if (!Array.isArray(comparables) || comparables.length === 0) return null
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Comparable Sold ({comparables.length})
      </h3>
      <p className="text-xs text-gray-500 mb-3">Recently sold listings in this geo + price band — real transaction evidence alongside the active matched listings.</p>
      <div className="flex flex-col gap-2">
        {comparables.map((c: any, i: number) => (
          <BuyerListingTile key={c.listing_key || c.listingKey || 'idx-' + i} listing={c} kind="sold" index={i} />
        ))}
      </div>
    </section>
  )
}

// W-CHARLIE-BUYER-CHUNK4 (2026-06-15): buyer Tax-Matched on admin lead
// page — RE-FRAMED as "recently sold homes matched by property-tax
// band" (NOT the prior assessment framing). Samples are SOLD comps
// from the shared tax-band SOLD query, rendered through the same
// BuyerListingTile that matched-listings + comp-sold sections use →
// photo + slug-driven link, dual-shape reads, ONE consistent buyer
// tile shape across every section of the buyer lead page.
function BuyerTaxMatched({ taxMatch }: { taxMatch: any }) {
  if (!taxMatch || typeof taxMatch !== 'object') return null
  if (taxMatch.isEmpty) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Tax-Matched (0)</h3>
        <p className="text-xs text-gray-500 mb-3">Recently sold homes matched by property-tax band — comparable value evidence.</p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-900 m-0">{taxMatch.reason || 'No SOLD comps matched the derived tax band.'}</p>
        </div>
      </section>
    )
  }
  const samples = Array.isArray(taxMatch.samples) ? taxMatch.samples : []
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Tax-Matched ({samples.length})</h3>
      <p className="text-xs text-gray-500 mb-3">
        Recently sold homes matched by property-tax band — real transaction evidence anchored to the {taxMatch.withTaxCount} of {taxMatch.totalCount} matched listings carrying tax data.
      </p>
      {taxMatch.taxBand && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 flex items-baseline justify-between">
          <span className="text-xs text-slate-500">Tax band (derived)</span>
          <span className="text-sm font-bold text-slate-900">
            ${Math.round(taxMatch.taxBand.low).toLocaleString('en-CA')}–${Math.round(taxMatch.taxBand.high).toLocaleString('en-CA')}<span className="text-xs font-normal text-slate-400 ml-2">/yr</span>
          </span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {samples.map((s: any, i: number) => (
          <BuyerListingTile
            key={s.listingKey || 'idx-' + i}
            kind="sold"
            index={i}
            listing={{
              listing_key: s.listingKey,
              unparsed_address: s.address,
              close_price: s.price,
              close_date: s.closeDate,
              bedrooms_total: s.bedrooms,
              bathrooms_total_integer: s.bathrooms,
              property_subtype: s.propertySubtype,
              unit_number: s.unitNumber,
              days_on_market: s.daysOnMarket,
              tax_annual_amount: s.tax,
              _slug: s._slug,
              media: s.media,
            }}
          />
        ))}
      </div>
    </section>
  )
}

function SourceUrl({ url }: { url: string }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Source URL</h3>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-blue-600 hover:underline break-all"
      >
        {url}
      </a>
    </section>
  )
}

function AgentCard({ agent }: { agent: Agent }) {
  if (!agent.full_name) return null
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Assigned Agent</h3>
      <div className="bg-slate-900 rounded-lg p-5 text-center">
        {agent.profile_photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agent.profile_photo_url}
            alt={agent.full_name || ''}
            className="w-14 h-14 rounded-full mx-auto mb-3 object-cover border-2 border-white/15"
          />
        )}
        <div className="text-base font-bold text-white">{agent.full_name}</div>
        {agent.title && <div className="text-xs text-white/40 mt-1">{agent.title}</div>}
        {agent.brokerage_name && <div className="text-[11px] text-white/30 mt-1">{agent.brokerage_name}</div>}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {agent.email && (
            <a
              href={'mailto:' + agent.email}
              className="px-3 py-1.5 bg-white/10 rounded-md text-blue-300 text-xs no-underline hover:bg-white/15"
            >
              {agent.email}
            </a>
          )}
          {agent.cell_phone && (
            <a
              href={'tel:' + agent.cell_phone}
              className="px-3 py-1.5 bg-white/10 rounded-md text-blue-300 text-xs no-underline hover:bg-white/15"
            >
              {agent.cell_phone}
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

function Disclaimer() {
  return (
    <section className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <p className="text-[11px] text-amber-900 leading-relaxed m-0">
        <strong className="text-amber-700">⚠ AI Disclaimer:</strong> This plan was generated by artificial intelligence using market data and algorithms. Informational only — does not constitute professional real estate, legal, or financial advice. Independently verify with a licensed agent before making decisions.
      </p>
    </section>
  )
}
