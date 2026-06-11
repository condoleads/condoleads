// app/estimator/components/GeoConfidenceSpread.tsx
//
// W-CONDO-MODAL-PARITY Phase 2 (2026-06-11) — extracted verbatim from
// HomeEstimatorResults.tsx:503-569 (the Geographic Confidence Spread block).
// Only changes vs. the original inline block:
//   - inline labelMap literal (520-525) → labelMap prop
//   - outer isMultiUnitSubject gate → callers gate now
// Internal null-tier handling (tr ? ... : 'no data', 546-560) is preserved
// EXACTLY so bronze:null / silver:null subjects render gracefully.
//
// Used by both:
//   - HomeEstimatorResults    (HOME_LABEL_MAP: Platinum='Same street')
//   - EstimatorResults (condo) (CONDO_LABEL_MAP: Platinum='Same Building')
//
// Auto-hides on the legacy condoleads.ca S1 path: when the shared S1 matcher
// runs, result.tiers is undefined → callers' {result.tiers && (...)} gate
// returns null → this component is never mounted → S1 UX byte-identical.

'use client'

import { TierResult } from '@/lib/estimator/types'
import { formatPrice } from '@/lib/utils/formatters'

export interface GeoConfidenceSpreadTiers {
  platinum: TierResult | null
  gold:     TierResult | null
  silver:   TierResult | null
  bronze:   TierResult | null
}

export interface GeoConfidenceLabel {
  name:  string
  sub:   string
  emoji: string
}

export interface GeoConfidenceLabelMap {
  platinum: GeoConfidenceLabel
  gold:     GeoConfidenceLabel
  silver:   GeoConfidenceLabel
  bronze:   GeoConfidenceLabel
}

// Pre-baked label maps for the two production callers. Exported so the
// home + condo callers don't duplicate the literal.
export const HOME_LABEL_MAP: GeoConfidenceLabelMap = {
  platinum: { name: 'Platinum', sub: 'Same street',     emoji: '◆' },
  gold:     { name: 'Gold',     sub: 'Community',       emoji: '●' },
  silver:   { name: 'Silver',   sub: 'Municipality',    emoji: '●' },
  bronze:   { name: 'Bronze',   sub: 'Area',            emoji: '●' },
}

export const CONDO_LABEL_MAP: GeoConfidenceLabelMap = {
  platinum: { name: 'Platinum', sub: 'Same Building',   emoji: '◆' },
  gold:     { name: 'Gold',     sub: 'Community',       emoji: '●' },
  silver:   { name: 'Silver',   sub: 'Municipality',    emoji: '●' },
  bronze:   { name: 'Bronze',   sub: 'Area',            emoji: '●' },
}

interface GeoConfidenceSpreadProps {
  tiers: GeoConfidenceSpreadTiers
  bestGeoTier?: 'platinum' | 'gold' | 'silver' | 'bronze' | 'none'
  labelMap: GeoConfidenceLabelMap
}

export default function GeoConfidenceSpread({
  tiers,
  bestGeoTier,
  labelMap,
}: GeoConfidenceSpreadProps) {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Geographic Confidence Spread</h3>
      <p className="text-xs text-slate-500 mb-4">
        Same home, four geographic scopes. The price above comes from the highlighted tier; the others are context.
      </p>
      <div className="space-y-2">
        {(['platinum', 'gold', 'silver', 'bronze'] as const).map(slot => {
          const tr = tiers[slot]
          const isBest = bestGeoTier === slot
          const tierColor = isBest
            ? 'bg-emerald-50 border-emerald-300'
            : tr ? 'bg-slate-50 border-slate-200' : 'bg-slate-50/40 border-slate-100'
          const tierTextStrong = isBest ? 'text-emerald-900' : tr ? 'text-slate-900' : 'text-slate-400'
          const tierTextMuted  = isBest ? 'text-emerald-700' : tr ? 'text-slate-600' : 'text-slate-400'
          return (
            // Outer row: flex-wrap + gap-y so right cluster drops below left in
            // the ~395px sidebar column (lg:grid-cols-3) instead of colliding.
            // Modal context (wider) stays inline — wrap only kicks in when space
            // is genuinely tight.
            <div key={slot} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 rounded-lg border ${tierColor}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                <span className={`text-sm font-bold ${tierTextStrong}`}>
                  {labelMap[slot].emoji} {labelMap[slot].name}
                </span>
                <span className={`text-xs ${tierTextMuted}`}>
                  {labelMap[slot].sub}
                </span>
                {isBest && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                    Anchor
                  </span>
                )}
              </div>
              {tr ? (
                // Right cluster: dropped flex-shrink-0 so it compresses when
                // sharing one line. Range dropped from inline row — at ~395px
                // it forced collision with the left cluster; median + count are
                // the primary signal, and the Platinum→Bronze delta + the
                // footer paragraph already convey spread context.
                <div className="flex items-center gap-3 text-right">
                  <div className={`text-sm font-bold ${tierTextStrong}`}>
                    {formatPrice(tr.median)}
                  </div>
                  <div className={`text-[11px] ${tierTextMuted}`}>
                    {tr.count} comp{tr.count === 1 ? '' : 's'}
                  </div>
                </div>
              ) : (
                <span className={`text-[11px] italic ${tierTextMuted}`}>no data</span>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-slate-500 mt-3">
        Narrow spread Platinum→Bronze = high confidence. Wide spread = your block sold differently than your community — worth a conversation with the agent.
      </p>
    </div>
  )
}
