'use client'

// components/dashboard/CharlieLeadEstimate.tsx
//
// C-ENHANCE-2-RENDER (2026-06-13) — agent dashboard render for Charlie
// seller-plan leads. Branches alongside the estimator-source render path
// (which serves estimator leads from lead.property_details). This component
// is mounted ONLY when lead.plan_data.sellerEstimate is present (Charlie
// writes it from app/api/charlie/plan-email/route.ts). Exclusive branch —
// never both renders.
//
// Reuses ONLY the label-map constants (HOME_LABEL_MAP / CONDO_LABEL_MAP)
// from the estimator. The estimator's tier-rail component carries white-
// card Tailwind + its own heading wording that doesn't fit Charlie's
// voice; this component mirrors the row structure only.
//
// Renders nothing when sellerEstimate is null/absent — caller's existing
// fallback handles those cases via the page.tsx branch.

import {
  HOME_LABEL_MAP,
  CONDO_LABEL_MAP,
  type GeoConfidenceLabelMap,
} from '@/app/estimator/components/GeoConfidenceSpread'

type TierKey = 'platinum' | 'gold' | 'silver' | 'bronze'

interface TierSlot {
  count?: number
  median?: number
  range?: { low: number; high: number }
}

interface SellerEstimatePayload {
  estimate?: {
    estimatedPrice?: number
    priceRange?: { low: number; high: number }
    confidence?: string
    matchTier?: string
    bestGeoTier?: TierKey | 'none'
    tiers?: {
      platinum: TierSlot | null
      gold:     TierSlot | null
      silver:   TierSlot | null
      bronze:   TierSlot | null
    }
    taxMatch?: {
      comparables: any[]
      estimatedPrice?: number
      priceRange?: { low: number; high: number }
      count?: number
      bestGeoTier?: TierKey | 'none'
    }
  }
  comparables?: any[]
  competingListings?: any[]
  buildingName?: string | null
  subjectAddress?: string | null
  geoLevel?: string | null
  intent?: 'sale' | 'lease'
  path?: 'condo' | 'home' | null
}

interface Props {
  sellerEstimate: SellerEstimatePayload | null | undefined
}

const TIER_COLORS: Record<TierKey, string> = {
  platinum: '#10b981',
  gold:     '#f59e0b',
  silver:   '#64748b',
  bronze:   '#c2410c',
}

const TIER_ORDER: TierKey[] = ['platinum', 'gold', 'silver', 'bronze']

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return '$' + Math.round(n).toLocaleString()
}

function TierChip({ tier, labelMap }: { tier: string | null | undefined; labelMap: GeoConfidenceLabelMap }) {
  if (!tier || tier === 'none') return null
  const k = tier as TierKey
  if (!TIER_COLORS[k]) return null
  const lbl = labelMap[k]
  return (
    <span
      className="inline-block text-[10px] font-bold text-white rounded px-2 py-0.5 mr-2"
      style={{ background: TIER_COLORS[k] }}
    >
      {lbl.emoji} {lbl.name} · {lbl.sub}
    </span>
  )
}

function CompRow({ c, tier, labelMap, kind }: { c: any; tier: string | null | undefined; labelMap: GeoConfidenceLabelMap; kind: 'sold' | 'tax' | 'competing' }) {
  const price = c.adjustedPrice || c.closePrice || c.close_price || c.listPrice || c.list_price || 0
  const photo = c.mediaUrl || (c.media && c.media[0]?.media_url) || ''
  const addr = (c.unparsedAddress || c.unparsed_address || '').split(',')[0]
  const beds = c.bedrooms ?? c.bedrooms_total
  const baths = c.bathrooms ?? c.bathrooms_total_integer
  const sqft = c.exactSqft || c.livingAreaRange || c.living_area_range
  const dom = c.daysOnMarket ?? c.days_on_market
  const priceColor = kind === 'competing' ? 'text-blue-700' : 'text-emerald-700'
  const affordance = kind === 'competing' ? 'For Sale →' : 'Sold →'
  return (
    <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white">
      {photo && (
        <div className="w-20 flex-shrink-0">
          <img src={photo} alt="" className="block w-20 h-[72px] object-cover" />
        </div>
      )}
      <div className="flex-1 px-3 py-2 min-w-0">
        <TierChip tier={tier} labelMap={labelMap} />
        <div className="text-sm font-bold text-slate-900 truncate">{addr || '—'}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {[
            beds != null ? `${beds} bed` : '',
            baths != null ? `${baths} bath` : '',
            sqft ? `${sqft}${typeof sqft === 'number' ? ' sqft' : ' sqft'}` : '',
            dom != null ? `${dom}d DOM` : '',
          ].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="px-3 py-2 text-right whitespace-nowrap">
        <div className={`text-base font-extrabold ${priceColor}`}>
          ${Number(price).toLocaleString('en-CA')}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">{affordance}</div>
      </div>
    </div>
  )
}

export default function CharlieLeadEstimate({ sellerEstimate }: Props) {
  if (!sellerEstimate) return null
  const est = sellerEstimate.estimate || {}
  const comps = sellerEstimate.comparables || []
  const competing = sellerEstimate.competingListings || []
  const taxComps = est.taxMatch?.comparables || []

  // Path derivation (mirrors SellerEstimateBlock.tsx) — uses explicit
  // payload.path when present, otherwise infers from buildingName.
  const resolvedPath: 'condo' | 'home' =
    sellerEstimate.path === 'home' || sellerEstimate.path === 'condo'
      ? sellerEstimate.path
      : (sellerEstimate.buildingName ? 'condo' : 'home')
  const labelMap = resolvedPath === 'home' ? HOME_LABEL_MAP : CONDO_LABEL_MAP

  const hasAnything =
    est.estimatedPrice != null ||
    comps.length > 0 ||
    competing.length > 0 ||
    !!est.tiers ||
    taxComps.length > 0
  if (!hasAnything) return null

  const bestTier: TierKey | null =
    est.bestGeoTier && est.bestGeoTier !== 'none' ? (est.bestGeoTier as TierKey) : null
  const uniformTierForGeoTiles: TierKey | null = bestTier

  return (
    <div className="bg-white rounded-lg shadow p-6 mt-6">
      {/* Header — Charlie voice. */}
      <h2 className="text-lg font-semibold mb-1">Charlie seller estimate</h2>
      {(sellerEstimate.subjectAddress || sellerEstimate.buildingName) && (
        <div className="text-xs text-slate-500 mb-4">
          {sellerEstimate.subjectAddress || ''}
          {sellerEstimate.subjectAddress && sellerEstimate.buildingName ? ' · ' : ''}
          {sellerEstimate.buildingName || ''}
          {sellerEstimate.geoLevel ? ` · ${sellerEstimate.geoLevel} level` : ''}
        </div>
      )}

      {/* Estimate price card */}
      {est.estimatedPrice != null && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Estimated value</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {fmtPrice(est.estimatedPrice)}
          </div>
          {est.priceRange && (
            <div className="text-xs text-slate-500 mt-0.5">
              Range {fmtPrice(est.priceRange.low)} — {fmtPrice(est.priceRange.high)}
            </div>
          )}
          {(est.confidence || est.matchTier) && (
            <div className="text-xs text-slate-600 mt-1.5">
              Confidence: {est.confidence || '—'}{est.matchTier ? ` · ${est.matchTier}` : ''}
            </div>
          )}
        </div>
      )}

      {/* Tier rail — Charlie voice. Heading matches the in-chat render.
          Skips when tiers absent. */}
      {est.tiers && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
            Confidence by Area
          </div>
          <div className="flex flex-col gap-1.5">
            {TIER_ORDER.map(slot => {
              const tr = est.tiers?.[slot] || null
              const isBest = bestTier === slot
              const rowCls = isBest
                ? 'flex items-center justify-between flex-wrap gap-2 px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50'
                : 'flex items-center justify-between flex-wrap gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50'
              return (
                <div key={slot} className={rowCls}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block text-xs font-bold text-white rounded px-2 py-0.5"
                      style={{ background: TIER_COLORS[slot] }}
                    >
                      {labelMap[slot].emoji} {labelMap[slot].name}
                    </span>
                    <span className="text-xs text-slate-600">{labelMap[slot].sub}</span>
                    {isBest && (
                      <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                        Anchor
                      </span>
                    )}
                  </div>
                  {tr ? (
                    <div className="flex items-baseline gap-3">
                      <span className="text-sm font-bold text-slate-900">{fmtPrice(tr.median)}</span>
                      <span className="text-[11px] text-slate-500">
                        {tr.count ?? 0} comp{(tr.count ?? 0) === 1 ? '' : 's'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] italic text-slate-400">no data</span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            Narrow spread = high confidence. Wide spread = subject's block sold differently than the community.
          </div>
        </div>
      )}

      {/* Comparable Sold — Charlie's existing section, with per-tile tier
          chip (uniform from anchor). Heading mirrors the in-chat copy. */}
      {comps.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">
            Comparable Sold · {comps.length} found
          </div>
          <div className="flex flex-col gap-2">
            {comps.slice(0, 10).map((c: any, i: number) => (
              <CompRow
                key={i}
                c={c}
                tier={c.sourceTier || uniformTierForGeoTiles}
                labelMap={labelMap}
                kind="sold"
              />
            ))}
          </div>
        </div>
      )}

      {/* Tax-Matched subsection — Charlie voice (matches in-chat copy).
          Child subsection of the same block (not a sibling section
          header). */}
      {taxComps.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">
            Tax-Matched · {taxComps.length} found
          </div>
          <div className="text-xs text-slate-500 mb-3">
            Same-municipality sales with similar property tax — a co-equal value signal alongside the comps above.
          </div>
          {est.taxMatch?.estimatedPrice != null && (
            <div className="flex justify-between items-baseline bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3">
              <span className="text-[11px] text-slate-500">Tax-matched estimate</span>
              <span className="text-sm font-bold text-slate-900">
                {fmtPrice(est.taxMatch.estimatedPrice)}
                {est.taxMatch.priceRange && (
                  <span className="text-[11px] font-normal text-slate-400 ml-2">
                    · {fmtPrice(est.taxMatch.priceRange.low)}–{fmtPrice(est.taxMatch.priceRange.high)}
                  </span>
                )}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {taxComps.slice(0, 10).map((c: any, i: number) => (
              <CompRow
                key={i}
                c={c}
                tier={c.sourceTier || uniformTierForGeoTiles}
                labelMap={labelMap}
                kind="tax"
              />
            ))}
          </div>
        </div>
      )}

      {/* Competing For Sale — Charlie's existing section. Same pattern. */}
      {competing.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">
            Competing For Sale · {competing.length} found
          </div>
          <div className="flex flex-col gap-2">
            {competing.slice(0, 10).map((c: any, i: number) => (
              <CompRow
                key={i}
                c={c}
                tier={null}
                labelMap={labelMap}
                kind="competing"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
