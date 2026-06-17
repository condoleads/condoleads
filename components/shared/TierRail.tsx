// components/shared/TierRail.tsx
//
// W-ESTIMATOR-TIER-RAIL (2026-06-17) — shared 4-row "Confidence by Area"
// tier rail.
//
// Background:
//   The seller surface (components/dashboard/CharlieLeadEstimate.tsx
//   :288-337) has owned this JSX since CV-0. Recon ([recon/estimator-
//   tier-pills-competing.txt] D2) confirmed the estimator workingDoc
//   now needs to render the same rail on (a) the agent email and
//   (b) the admin lead Estimator tab.
//
// Why extract:
//   "Do NOT rebuild" — the seller's render is the source of truth, and
//   the recon flagged option B (lift the 50-line block into its own
//   component) as the cleaner reuse path. This file is that lift —
//   the markup, the class strings, the TIER_META + TIER_ORDER reads,
//   the bestTier highlight, and the "no data" honest-empty fallback
//   are BYTE-IDENTICAL to the seller's inline JSX. CharlieLeadEstimate
//   imports this component; its rendered output is unchanged.
//
// Used by:
//   - components/dashboard/CharlieLeadEstimate.tsx (seller surface)
//   - app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx (estimator
//     lead Estimator tab via EstimatorRender)
//
// Email surface (lib/email/working-doc-render.ts) does NOT import this
// React component — emails render HTML strings server-side. The email
// renderer has its own `renderTierRail` helper that mirrors the same
// markup pattern Charlie's plan email already uses (charlie-plan-email-
// html.ts:664-688).

import {
  TIER_META,
  TIER_ORDER,
  type TierName,
  type TierBestSlot,
} from '@/lib/charlie/tier-chip'

export interface TierRailSlot {
  count: number | null
  median: number | null
  // `range` is part of the seller's TierSlotView but the rail render
  // only reads `count + median`. Optional so estimator workingDoc
  // slots (which carry the same shape) can omit it without a type
  // hole.
  range?: { low: number; high: number } | null
}

export interface TierRailSlots {
  platinum: TierRailSlot | null
  gold:     TierRailSlot | null
  silver:   TierRailSlot | null
  bronze:   TierRailSlot | null
}

interface TierRailProps {
  slots: TierRailSlots
  bestGeoTier: TierBestSlot
  path: 'home' | 'condo'
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return '$' + Math.round(n).toLocaleString()
}

export default function TierRail({ slots, bestGeoTier, path }: TierRailProps) {
  const bestTier: TierName | null =
    bestGeoTier !== 'none' ? (bestGeoTier as TierName) : null

  return (
    <div className="mb-6">
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
        Confidence by Area
      </div>
      <div className="flex flex-col gap-1.5">
        {TIER_ORDER.map(slot => {
          const tr = slots[slot]
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
  )
}
