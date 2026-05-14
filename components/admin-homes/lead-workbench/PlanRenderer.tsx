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

import { useState } from 'react'

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
        {hasListings && <TopListings listings={n.topListings} isBuyer={n.isBuyer} />}
        {lead.source_url && <SourceUrl url={lead.source_url} />}
        {lead.agents && <AgentCard agent={lead.agents} />}
        <Disclaimer />
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

function TopListings({ listings, isBuyer }: { listings: any[]; isBuyer: boolean }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {isBuyer ? 'Matched Listings' : 'Comparable Sales'} ({listings.length})
      </h3>
      <ul className="space-y-2 list-none p-0 m-0">
        {listings.map((l: any, i: number) => {
          const price = l.list_price || l.close_price || l.price || 0
          const addr = l.unparsed_address || l.address || '—'
          const beds = l.bedrooms_total ?? l.bedrooms ?? null
          const baths = l.bathrooms_total_integer ?? l.bathrooms ?? null
          const subtype = l.property_subtype || ''
          const key = l.listing_key || l.listingKey || 'idx-' + i
          const meta = [
            beds !== null && beds !== undefined ? beds + ' bed' : null,
            baths !== null && baths !== undefined ? baths + ' bath' : null,
            subtype || null,
          ].filter(Boolean).join(' · ')
          return (
            <li key={key} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 truncate">{addr}</div>
                {meta && <div className="text-xs text-slate-500 mt-1">{meta}</div>}
              </div>
              <div className="text-base font-extrabold text-blue-700 whitespace-nowrap">{fmtCAD(price)}</div>
            </li>
          )
        })}
      </ul>
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
