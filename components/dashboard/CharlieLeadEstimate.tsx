'use client'

// components/dashboard/CharlieLeadEstimate.tsx
//
// W-CHARLIE-CONVERGENCE CV-1 (2026-06-14) — agent dashboard render for
// Charlie seller-plan leads. Consumes the CANONICAL SellerEstimateView
// from lib/charlie/seller-estimate-view.ts (shipped in CV-0). All sections
// (price card, tier rail, comparables, tax-matched, competing, market intel,
// price-by-home-type, offer intel, best time, seller strategy, seller
// profile, pricing strategy & risk, AI disclaimer) render from the same
// canonical shape. Tier chips use tierChipFor / TIER_META from
// lib/charlie/tier-chip.ts — eliminates the white-card duplication that
// previously lived at L85-89 of this file (now sourced from CV-0).
//
// History:
//   - C-ENHANCE-2-RENDER (2026-06-13): initial dashboard render — estimate
//     block only (price card + tier rail + comparables + tax + competing).
//   - C-CHARLIE-FOLLOWUP C (2026-06-13): amber "No estimate captured"
//     notice for the 6 pre-3d9ac08 Charlie seller leads.
//   - W-CHARLIE-CONVERGENCE CV-1 (2026-06-14): plan-side parity. Adds the
//     8 missing sections from the recon gap matrix, all gated on
//     view.present flags. Tier-chip literals migrated to CV-0 (this file
//     no longer owns hex values).
//
// Mounted ONLY by LeadDetailClient. Branches alongside the estimator-source
// WorkingDocView; never both renders.

import {
  TIER_META,
  TIER_ORDER,
  tierChipFor,
  type TierName,
  type TierBestSlot,
} from '@/lib/charlie/tier-chip'
import type {
  SellerEstimateView,
  CanonicalCompRow,
  PriceByHomeTypeRow,
} from '@/lib/charlie/seller-estimate-view'

interface Props {
  // CV-1: consume the canonical view produced by buildSellerEstimateView in
  // LeadDetailClient. `null` means either (a) no Charlie seller content on
  // this lead (estimator lead — caller's branch sends to WorkingDocView) or
  // (b) a Charlie seller lead without persisted estimate (the 6 AMBER leads
  // — caller sets legacyNoticeWhenEmpty=true).
  view: SellerEstimateView | null | undefined
  legacyNoticeWhenEmpty?: boolean
  leadMeta?: {
    intent?: string | null
    geoName?: string | null
    contactName?: string | null
    createdAtIso?: string | null
  }
}

const MONTHS_ARR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return '$' + Math.round(n).toLocaleString()
}

function fmtNumber(n: number | null | undefined, suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Number(n).toLocaleString('en-CA') + suffix
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits) + '%'
}

function TierChip({ tier, anchorTier, path }: {
  tier: TierName | null
  anchorTier: TierBestSlot
  path: 'home' | 'condo'
}) {
  const chip = tierChipFor(tier, anchorTier !== 'none' ? anchorTier : null, path)
  if (!chip) return null
  return (
    <span
      className="inline-block text-[10px] font-bold text-white rounded px-2 py-0.5 mr-2"
      style={{ background: chip.color }}
    >
      {chip.marker} {chip.label} · {chip.sub}
    </span>
  )
}

function CompRow({ row, anchorTier, path, kind }: {
  row: CanonicalCompRow
  anchorTier: TierBestSlot
  path: 'home' | 'condo'
  kind: 'sold' | 'tax' | 'competing'
}) {
  const priceColor = kind === 'competing' ? 'text-blue-700' : 'text-emerald-700'
  const affordance = kind === 'competing' ? 'For Sale →' : 'Sold →'
  // No chip on competing tiles (deliberate — not a matched/scored comp).
  const tier: TierName | null = kind === 'competing' ? null : (row.sourceTier as TierName | null)
  return (
    <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white">
      {row.mediaUrl && (
        <div className="w-20 flex-shrink-0">
          <img src={row.mediaUrl} alt="" className="block w-20 h-[72px] object-cover" />
        </div>
      )}
      <div className="flex-1 px-3 py-2 min-w-0">
        {kind !== 'competing' && (
          <TierChip tier={tier} anchorTier={anchorTier} path={path} />
        )}
        <div className="text-sm font-bold text-slate-900 truncate">{row.address || '—'}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {[
            row.beds != null ? `${row.beds} bed` : '',
            row.baths != null ? `${row.baths} bath` : '',
            row.sqft != null ? `${row.sqft} sqft` : '',
            row.dom != null ? `${row.dom}d DOM` : '',
          ].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>
      <div className="px-3 py-2 text-right whitespace-nowrap">
        <div className={`text-base font-extrabold ${priceColor}`}>
          {row.price != null ? '$' + Number(row.price).toLocaleString('en-CA') : '—'}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">{affordance}</div>
      </div>
    </div>
  )
}

export default function CharlieLeadEstimate({ view, legacyNoticeWhenEmpty, leadMeta }: Props) {
  // Phase 2 amber-notice path — preserved exactly. When the caller signals
  // "this IS a Charlie seller lead but the estimate isn't persisted", show
  // the honest legacy notice. Estimator leads still get null and fall
  // through to the caller's WorkingDocView branch.
  if (!view) {
    if (!legacyNoticeWhenEmpty) return null
    return (
      <div className="bg-white rounded-lg shadow p-6 mt-6">
        <h2 className="text-lg font-semibold mb-1">Charlie seller estimate</h2>
        <div className="text-xs text-slate-500 mb-4">
          {leadMeta?.contactName || ''}
          {leadMeta?.geoName ? (leadMeta?.contactName ? ' · ' : '') + leadMeta.geoName : ''}
          {leadMeta?.createdAtIso ? ` · ${leadMeta.createdAtIso.slice(0, 10)}` : ''}
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-amber-900 mb-1">
            No estimate captured
          </div>
          <div className="text-xs text-amber-800 leading-relaxed">
            This Charlie seller lead pre-dates the estimate-persistence change (commit 3d9ac08,
            2026-06-13). The seller&apos;s tier rail, tax-match, and comparables were rendered
            in the chat panel at the time but were never stored on the lead row, so they cannot
            be displayed here. The plan email (sent at lead creation) is still available in the
            recipient&apos;s inbox and the chain BCC log if the agent needs to see the estimate
            content. New Charlie seller leads created after 3d9ac08 will show the full estimate
            on this page.
          </div>
        </div>
      </div>
    )
  }

  // ── canonical render ────────────────────────────────────────────────────
  const p = view.present
  const path = view.path
  const anchorTier = view.tierRail.bestGeoTier
  const bestTier: TierName | null =
    view.tierRail.bestGeoTier !== 'none' ? (view.tierRail.bestGeoTier as TierName) : null

  // Renders something only when at least one canonical section is present.
  const hasAnyCanonicalSection =
    p.priceCard || p.tierRail || p.comparables || p.taxMatch || p.competing ||
    p.marketIntel || p.priceByHomeType || p.offerIntel || p.bestTime ||
    p.planSummary || p.planCardGrid || p.pricingRisk
  if (!hasAnyCanonicalSection) return null

  return (
    <div className="bg-white rounded-lg shadow p-6 mt-6">
      {/* Header — Charlie voice. */}
      <h2 className="text-lg font-semibold mb-1">Charlie seller estimate</h2>
      {(view.subjectAddress || view.buildingName) && (
        <div className="text-xs text-slate-500 mb-4">
          {view.subjectAddress || ''}
          {view.subjectAddress && view.buildingName ? ' · ' : ''}
          {view.buildingName || ''}
          {view.geoLevel ? ` · ${view.geoLevel} level` : ''}
        </div>
      )}

      {/* CV-1 NEW — Seller Strategy summary (plan.summary text). */}
      {p.planSummary && view.planSummary && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-blue-700 mb-2">
            Seller Strategy
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">{view.planSummary}</p>
        </div>
      )}

      {/* CV-1 NEW — Seller Profile (planCardGrid). */}
      {p.planCardGrid && (
        <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">
            Seller Profile
          </div>
          <table className="w-full text-sm">
            <tbody>
              {view.planCardGrid.propertyType && (
                <tr><td className="text-slate-500 py-1 pr-3 w-32">Property Type</td><td className="font-semibold text-slate-900">{view.planCardGrid.propertyType}</td></tr>
              )}
              {view.planCardGrid.bedrooms != null && (
                <tr><td className="text-slate-500 py-1 pr-3">Bedrooms</td><td className="font-semibold text-slate-900">{view.planCardGrid.bedrooms}</td></tr>
              )}
              {view.planCardGrid.timeline && (
                <tr><td className="text-slate-500 py-1 pr-3">Timeline</td><td className="font-semibold text-slate-900">{view.planCardGrid.timeline}</td></tr>
              )}
              {view.planCardGrid.goal && (
                <tr><td className="text-slate-500 py-1 pr-3">Goal</td><td className="font-semibold text-slate-900">{view.planCardGrid.goal}</td></tr>
              )}
              {(view.planCardGrid.estimatedValueMin != null || view.planCardGrid.estimatedValueMax != null) && (
                <tr><td className="text-slate-500 py-1 pr-3">Est. Value</td><td className="font-semibold text-emerald-700">
                  {fmtPrice(view.planCardGrid.estimatedValueMin)} — {fmtPrice(view.planCardGrid.estimatedValueMax)}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Estimate price card — unchanged structure from Phase 2. */}
      {p.priceCard && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Estimated value</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {fmtPrice(view.priceCard.estimatedPrice)}
          </div>
          {view.priceCard.priceRange && (
            <div className="text-xs text-slate-500 mt-0.5">
              Range {fmtPrice(view.priceCard.priceRange.low)} — {fmtPrice(view.priceCard.priceRange.high)}
            </div>
          )}
          {(view.priceCard.confidence || view.priceCard.matchTier) && (
            <div className="text-xs text-slate-600 mt-1.5">
              Confidence: {view.priceCard.confidence || '—'}{view.priceCard.matchTier ? ` · ${view.priceCard.matchTier}` : ''}
            </div>
          )}
        </div>
      )}

      {/* Tier rail "Confidence by Area" — TIER_META migrated from CV-0. */}
      {p.tierRail && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
            Confidence by Area
          </div>
          <div className="flex flex-col gap-1.5">
            {TIER_ORDER.map(slot => {
              const tr = view.tierRail.slots[slot]
              const isBest = bestTier === slot
              const rowCls = isBest
                ? 'flex items-center justify-between flex-wrap gap-2 px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50'
                : 'flex items-center justify-between flex-wrap gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50'
              return (
                <div key={slot} className={rowCls}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block text-xs font-bold text-white rounded px-2 py-0.5"
                      style={{ background: TIER_META[slot].color }}
                    >
                      {TIER_META[slot].marker} {TIER_META[slot].label}
                    </span>
                    <span className="text-xs text-slate-600">
                      {path === 'home' ? TIER_META[slot].homeSub : TIER_META[slot].condoSub}
                    </span>
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
            Narrow spread = high confidence. Wide spread = subject&apos;s block sold differently than the community.
          </div>
        </div>
      )}

      {/* CV-1 NEW — Market Intelligence grid (analytics roll-up). */}
      {p.marketIntel && (
        <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">
            Market Intelligence{view.marketIntel.geoName ? ` · ${view.marketIntel.geoName}` : ''}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {view.marketIntel.closedAvgDom90 != null && (
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-[10px] text-slate-500 uppercase">Avg DOM</div>
                <div className="text-base font-bold text-slate-900">{view.marketIntel.closedAvgDom90}d</div>
              </div>
            )}
            {view.marketIntel.saleToListRatio != null && (
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-[10px] text-slate-500 uppercase">Sale / List</div>
                <div className="text-base font-bold text-slate-900">{fmtPct(view.marketIntel.saleToListRatio)}</div>
              </div>
            )}
            {view.marketIntel.activeCount != null && (
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-[10px] text-slate-500 uppercase">Active</div>
                <div className="text-base font-bold text-slate-900">{fmtNumber(view.marketIntel.activeCount)}</div>
              </div>
            )}
            {view.marketIntel.closedSaleCount90 != null && (
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-[10px] text-slate-500 uppercase">Sold (90d)</div>
                <div className="text-base font-bold text-slate-900">{fmtNumber(view.marketIntel.closedSaleCount90)}</div>
              </div>
            )}
            {view.marketIntel.absorptionRatePct != null && (
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-[10px] text-slate-500 uppercase">Absorption</div>
                <div className="text-base font-bold text-slate-900">{fmtPct(view.marketIntel.absorptionRatePct)}</div>
              </div>
            )}
            {view.marketIntel.medianSalePrice != null && (
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-[10px] text-slate-500 uppercase">Median Sale</div>
                <div className="text-base font-bold text-slate-900">{fmtPrice(view.marketIntel.medianSalePrice)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CV-1 NEW — Price by Home Type (subtype_breakdown). */}
      {p.priceByHomeType && view.priceByHomeType.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">
            Price by Home Type
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 pr-3 text-[10px] uppercase text-slate-500 font-bold">Type</th>
                <th className="text-center py-2 px-2 text-[10px] uppercase text-slate-500 font-bold">DOM</th>
                <th className="text-center py-2 px-2 text-[10px] uppercase text-slate-500 font-bold">STL</th>
                <th className="text-right py-2 pl-3 text-[10px] uppercase text-slate-500 font-bold">Median</th>
              </tr>
            </thead>
            <tbody>
              {view.priceByHomeType.map((r: PriceByHomeTypeRow, i: number) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-slate-900">{r.subtype}</td>
                  <td className="py-2 px-2 text-center text-slate-600">{r.avgDom != null ? Math.round(r.avgDom) + 'd' : '—'}</td>
                  <td className="py-2 px-2 text-center text-slate-600">{r.saleToList != null ? r.saleToList.toFixed(1) + '%' : '—'}</td>
                  <td className="py-2 pl-3 text-right font-bold text-blue-700">{fmtPrice(r.medianPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CV-1 NEW — Offer Intelligence (3 derived cards). */}
      {p.offerIntel && (
        <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">
            Offer Intelligence
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded p-2 text-center">
              <div className="text-[10px] text-slate-500 uppercase">Offer At</div>
              <div className="text-lg font-extrabold text-blue-700">{view.offerIntel.offerAt != null ? view.offerIntel.offerAt.toFixed(1) + '%' : '—'}</div>
              <div className="text-[9px] text-slate-400">of asking</div>
            </div>
            <div className="bg-white border border-slate-200 rounded p-2 text-center">
              <div className="text-[10px] text-slate-500 uppercase">Avg Concession</div>
              <div className="text-lg font-extrabold text-emerald-700">{view.offerIntel.avgConcession != null ? view.offerIntel.avgConcession.toFixed(1) + '%' : '—'}</div>
              <div className="text-[9px] text-slate-400">below asking</div>
            </div>
            <div className="bg-white border border-slate-200 rounded p-2 text-center">
              <div className="text-[10px] text-slate-500 uppercase">Decide In</div>
              <div className="text-lg font-extrabold text-amber-600">{view.offerIntel.decideIn != null ? Math.round(view.offerIntel.decideIn) + 'd' : '—'}</div>
              <div className="text-[9px] text-slate-400">avg DOM</div>
            </div>
          </div>
        </div>
      )}

      {/* CV-1 NEW — Best Time to Sell (seasonal). */}
      {p.bestTime && view.bestTime && (
        <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
            Best Time to Sell
          </div>
          <div className="text-sm text-slate-700 leading-relaxed">
            {view.bestTime.bestMonths.length > 0 && (
              <>Best months: <strong className="text-emerald-700">{view.bestTime.bestMonths.map((m: number) => MONTHS_ARR[m-1] || '?').join(', ')}</strong>{' '}</>
            )}
            {view.bestTime.worstMonths.length > 0 && (
              <>· Avoid: <strong className="text-red-600">{view.bestTime.worstMonths.map((m: number) => MONTHS_ARR[m-1] || '?').join(', ')}</strong></>
            )}
          </div>
          {view.bestTime.currentMonth != null && view.bestTime.currentMonthRank != null && (
            <div className="text-xs text-slate-500 mt-1">
              Currently <strong>{MONTHS_ARR[view.bestTime.currentMonth-1] || '?'}</strong> — ranked #{view.bestTime.currentMonthRank} of 12 for seller power.
            </div>
          )}
        </div>
      )}

      {/* Comparable Sold — canonical CompRow rows. */}
      {p.comparables && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">
            Comparable Sold · {view.comparables.length} found
          </div>
          <div className="flex flex-col gap-2">
            {view.comparables.slice(0, 10).map((row, i) => (
              <CompRow key={i} row={row} anchorTier={anchorTier} path={path} kind="sold" />
            ))}
          </div>
        </div>
      )}

      {/* Tax-Matched subsection. */}
      {p.taxMatch && view.taxMatch && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">
            Tax-Matched · {view.taxMatch.comparables.length} found
          </div>
          <div className="text-xs text-slate-500 mb-3">
            Same-municipality sales with similar property tax — a co-equal value signal alongside the comps above.
          </div>
          {view.taxMatch.estimatedPrice != null && (
            <div className="flex justify-between items-baseline bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3">
              <span className="text-[11px] text-slate-500">Tax-matched estimate</span>
              <span className="text-sm font-bold text-slate-900">
                {fmtPrice(view.taxMatch.estimatedPrice)}
                {view.taxMatch.priceRange && (
                  <span className="text-[11px] font-normal text-slate-400 ml-2">
                    · {fmtPrice(view.taxMatch.priceRange.low)}–{fmtPrice(view.taxMatch.priceRange.high)}
                  </span>
                )}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {view.taxMatch.comparables.slice(0, 10).map((row, i) => (
              <CompRow key={i} row={row} anchorTier={view.taxMatch!.bestGeoTier} path={path} kind="tax" />
            ))}
          </div>
        </div>
      )}

      {/* Competing For Sale — no chip on these tiles. */}
      {p.competing && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">
            Competing For Sale · {view.competingListings.length} found
          </div>
          <div className="flex flex-col gap-2">
            {view.competingListings.slice(0, 10).map((row, i) => (
              <CompRow key={i} row={row} anchorTier={anchorTier} path={path} kind="competing" />
            ))}
          </div>
        </div>
      )}

      {/* CV-1 NEW — Pricing Strategy & Risk. */}
      {p.pricingRisk && (() => {
        const pr = view.pricingRisk
        // Mirror PricingRiskBlock's logic (concession + DOM-risk table).
        const stl = pr.saleToListRatio
        const dom = pr.closedAvgDom90
        const ep = pr.estimatedPrice
        if (stl == null || dom == null || ep == null) return null
        const concessionPct = Math.max(0, 100 - stl)
        const concessionAmt = Math.round(ep * concessionPct / 100)
        const rows = [
          { label: 'At asking price', multiplier: 1.0, pct: '0%' },
          { label: '5% over asking',  multiplier: 1.8, pct: '+5%' },
          { label: '10% over asking', multiplier: 3.2, pct: '+10%' },
        ]
        function domColor(d: number): string {
          if (d <= 21) return 'text-emerald-700'
          if (d <= 45) return 'text-amber-600'
          return 'text-red-700'
        }
        return (
          <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">
              Pricing Strategy &amp; Risk
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-[10px] text-slate-500 uppercase">Avg Below Ask</div>
                <div className={`text-lg font-extrabold ${concessionPct > 3 ? 'text-red-700' : concessionPct > 1 ? 'text-amber-600' : 'text-emerald-700'}`}>
                  {concessionPct.toFixed(1)}%
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-[10px] text-slate-500 uppercase">Dollar Amount</div>
                <div className="text-lg font-extrabold text-slate-700">~${concessionAmt.toLocaleString()}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-[10px] text-slate-500 uppercase">Sale-to-List</div>
                <div className="text-lg font-extrabold text-blue-700">{stl.toFixed(1)}%</div>
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r, i) => {
                  const estDom = Math.round(dom * r.multiplier)
                  return (
                    <tr key={i} className="border-t border-slate-200">
                      <td className="py-2 pr-3">
                        <div className="font-semibold text-slate-900">{r.label}</div>
                        <div className="text-[10px] text-slate-500">{r.pct} vs market avg</div>
                      </td>
                      <td className="py-2 text-right">
                        <div className={`text-base font-extrabold ${domColor(estDom)}`}>{estDom}d</div>
                        <div className="text-[10px] text-slate-500">est. DOM</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="text-[11px] text-slate-500 mt-3">
              ⚠ Properties sitting 45+ days lose negotiating power and signal price issues to buyers.
            </div>
          </div>
        )
      })()}

      {/* CV-1 NEW — AI Disclaimer. */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-900 leading-relaxed">
        <strong>⚠ AI Disclaimer:</strong> This estimate and plan are generated by artificial
        intelligence using market data and algorithms. For informational purposes only;
        verify with a licensed real-estate agent before making decisions.
      </div>
    </div>
  )
}
