// app/charlie/components/SellerEstimateBlock.tsx
'use client'
import ComparableCard, { type ComparableTier } from './ComparableCard'
// C-ENHANCE-2-RENDER (2026-06-13): label-map constants (no UI text drag).
// Component NOT imported — the estimator's tier-rail component carries
// white-card chrome + its own heading wording that doesn't belong in
// Charlie's dark voice. Charlie mirrors the row STRUCTURE only.
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

interface Props {
  estimate: {
    estimatedPrice: number
    priceRange: { low: number; high: number }
    confidence: string
    confidenceMessage: string
    showPrice: boolean
    matchTier: string
    marketSpeed: { avgDaysOnMarket: number; status: string; message: string }
    // C-ENHANCE-2-RENDER: P/G/S/B tier rail data + tax-match subsection
    // data, both populated by f0904e5 (data-foundation commit). Optional —
    // S1 paths + plex + lease + no-tax cases leave these undefined and
    // the rail/subsection skip cleanly.
    tiers?: {
      platinum: TierSlot | null
      gold:     TierSlot | null
      silver:   TierSlot | null
      bronze:   TierSlot | null
    }
    bestGeoTier?: TierKey | 'none'
    taxMatch?: {
      comparables: any[]
      estimatedPrice?: number
      priceRange?: { low: number; high: number }
      count?: number
      bestGeoTier?: TierKey | 'none'
    }
  }
  comparables: any[]
  buildingName?: string
  subjectAddress?: string
  geoLevel: string
  resolvedAddress?: any
  isLease?: boolean
  intent: 'sale' | 'lease'
  // C-ENHANCE-2-RENDER: path selects label map (HOME=Same street vs
  // CONDO=Same Building). Optional — when absent, derived from buildingName
  // (the runner sets buildingName on the resolved-data only for condos —
  // SellerEstimateRunner.tsx onEstimateReady), keeping ResultsPanel's mount
  // line byte-identical (no new prop required at the call site).
  path?: 'condo' | 'home'
}

const CONFIDENCE_COLORS: Record<string, string> = {
  'High': '#10b981',
  'Medium-High': '#3b82f6',
  'Medium': '#f59e0b',
  'Medium-Low': '#f59e0b',
  'Low': '#ef4444',
  'None': '#94a3b8',
}

// Tier color palette (verbatim from EstimatorResults; local literals).
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

export default function SellerEstimateBlock({ estimate, comparables, buildingName, subjectAddress, geoLevel, isLease, intent, path }: Props) {
  const confColor = CONFIDENCE_COLORS[estimate.confidence] || '#94a3b8'
  const priceLabel = isLease ? '/mo' : ''

  // C-ENHANCE-2-RENDER: tier rail + tax-match prep. All gates are checked
  // here so the JSX below stays clean. estimate.tiers absent (S1 condo
  // path pre-f0904e5, plex, or any path that doesn't populate tiers) →
  // hasTiers=false → rail block silent-skips.
  // Path derivation when not passed: buildingName presence = condo (set by
  // SellerEstimateRunner.tsx:157 only on the condo path), keeping
  // ResultsPanel's mount line byte-identical.
  const resolvedPath: 'condo' | 'home' = path ?? (buildingName ? 'condo' : 'home')
  const labelMap: GeoConfidenceLabelMap = resolvedPath === 'home' ? HOME_LABEL_MAP : CONDO_LABEL_MAP
  const hasTiers = !!estimate.tiers
  const bestTier: TierKey | null = (estimate.bestGeoTier && estimate.bestGeoTier !== 'none')
    ? (estimate.bestGeoTier as TierKey)
    : null
  const uniformTierForGeoTiles: ComparableTier | null = bestTier  // mono-tier comps from bestGeoTier
  const taxComps = estimate.taxMatch?.comparables || []
  const hasTaxMatch = taxComps.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Resolved context */}
      {(subjectAddress || buildingName) && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>📍</span>
          <div>
            {subjectAddress && <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{subjectAddress}</div>}
            {buildingName && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{buildingName} · {geoLevel} level estimate</div>}
            {!buildingName && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{geoLevel} level estimate</div>}
          </div>
        </div>
      )}

      {/* Estimate range card */}
      {estimate.showPrice ? (
        <div style={{
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16, padding: 20,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
            Estimated {intent === 'lease' ? 'Lease' : 'Sale'} Value
          </div>

          {/* Price range */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>Low</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
                ${estimate.priceRange.low.toLocaleString()}{priceLabel}
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>Mid Estimate</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#10b981', lineHeight: 1 }}>
                ${estimate.estimatedPrice.toLocaleString()}{priceLabel}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>High</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
                ${estimate.priceRange.high.toLocaleString()}{priceLabel}
              </div>
            </div>
          </div>

          {/* Confidence + Market speed */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{
              flex: 1, background: `${confColor}15`, border: `1px solid ${confColor}30`,
              borderRadius: 10, padding: '8px 12px',
            }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>CONFIDENCE</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: confColor }}>{estimate.confidence}</div>
            </div>
            <div style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '8px 12px',
            }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>AVG DOM</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{estimate.marketSpeed.avgDaysOnMarket}d</div>
            </div>
            <div style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '8px 12px',
            }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>MARKET</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{estimate.marketSpeed.status}</div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 10 }}>{estimate.confidenceMessage}</div>
        </div>
      ) : (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 16, padding: 20, textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>Insufficient Data for Automated Estimate</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Not enough comparable sales found. Your agent will prepare a manual CMA.</div>
        </div>
      )}

      {/* C-ENHANCE-2-RENDER — Tier rail ("Confidence by Area"). Charlie
          dark voice; mirrors the estimator's GeoConfidenceSpread ROW
          STRUCTURE only (4 rows P/G/S/B, anchor highlighted). Heading
          chosen specifically to NOT echo the estimator's "Geographic
          Confidence Spread" wording. Skips cleanly when estimate.tiers
          is undefined (S1 paths, plex, lease-without-cascade). */}
      {hasTiers && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 8 }}>
            Confidence by Area
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TIER_ORDER.map(slot => {
              const tr = estimate.tiers?.[slot] || null
              const isBest = bestTier === slot
              const tierColor = TIER_COLORS[slot]
              const slotLabel = labelMap[slot]
              const rowBg = isBest ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)'
              const rowBorder = isBest ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.06)'
              return (
                <div key={slot} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: 8, background: rowBg, border: rowBorder,
                  flexWrap: 'wrap', gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{
                      display: 'inline-block', fontSize: 11, fontWeight: 700,
                      padding: '2px 7px', borderRadius: 4,
                      background: tierColor, color: '#fff',
                    }}>{slotLabel.emoji} {slotLabel.name}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{slotLabel.sub}</span>
                    {isBest && (
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        padding: '2px 6px', borderRadius: 4,
                        background: 'rgba(16,185,129,0.25)', color: '#10b981',
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                      }}>Anchor</span>
                    )}
                  </div>
                  {tr ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, color: '#fff' }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtPrice(tr.median)}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        {tr.count ?? 0} comp{(tr.count ?? 0) === 1 ? '' : 's'}
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, fontStyle: 'italic', color: 'rgba(255,255,255,0.3)' }}>no data</span>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>
            Narrow spread = high confidence. Wide spread = your block sold differently than your community.
          </div>
        </div>
      )}

      {/* Comparables */}
      {comparables.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
            Comparable Sold · {comparables.length} found
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comparables.slice(0, 6).map((c, i) => (
              <ComparableCard
                key={i}
                comparable={c}
                isLease={isLease}
                // Geo comparables are mono-tier from bestGeoTier — uniform
                // chip per row mirroring EstimatorResults.tsx:616-617.
                sourceTier={uniformTierForGeoTiles}
                path={resolvedPath}
              />
            ))}
          </div>
        </div>
      )}

      {/* C-ENHANCE-2-RENDER — Tax-Matched subsection (CHILD of the same
          block, NOT a sibling section). Mirrors Charlie's existing
          "Comparable Sold · N found" pattern. Heading chosen in Charlie
          voice, not echoing the estimator's tax-section wording. Tiles
          reuse ComparableCard; tax-match tiles carry per-tile sourceTier
          (Platinum/Gold/Silver/Bronze) from the multi-tier display list.

          W-CHARLIE-FIX GAP 2 (2026-06-14): always render the Tax-Matched
          section header. Pre-fix bug: `{hasTaxMatch && (…)}` silent-hid
          the entire section when the matcher returned 0 banded comps
          (runHomeTaxMatchCascade returns undefined when all 3 tiers
          fail their >=1/>=3 thresholds — home-comparable-matcher-sales.ts
          L1352). Real-DOM harness confirmed this can happen for
          sparse-band subjects. Replaced with an honest empty-state so
          the section never silently vanishes — the operator now sees
          why the tax-match is absent instead of wondering if the
          renderer dropped it. */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 6 }}>
          Tax-Matched · {taxComps.length} found
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
          Same-municipality sales with similar property tax — a co-equal value signal alongside the comps above.
        </div>
        {!hasTaxMatch && (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '12px 14px', marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
              No tax-matched comparables for this property — the matcher's
              ±20% same-municipality tax band did not surface enough
              comps to qualify a tier. The geo-based comparables above
              remain the primary value signal.
            </div>
          </div>
        )}
        {hasTaxMatch && (<>
          {estimate.taxMatch?.estimatedPrice != null && (
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8, padding: '8px 12px', marginBottom: 10,
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Tax-matched estimate</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                {fmtPrice(estimate.taxMatch.estimatedPrice)}
                {estimate.taxMatch.priceRange && (
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>
                    · {fmtPrice(estimate.taxMatch.priceRange.low)}–{fmtPrice(estimate.taxMatch.priceRange.high)}
                  </span>
                )}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {taxComps.slice(0, 6).map((c: any, i: number) => (
              <ComparableCard
                key={i}
                comparable={c}
                isLease={isLease}
                // tax-match tiles can mix tiers — pass null so the card
                // falls back to the comparable's own c.sourceTier (already
                // stamped by runTaxMatchCascade per types.ts L86-90).
                sourceTier={null}
                path={resolvedPath}
              />
            ))}
          </div>
        </>)}
      </div>
    </div>
  )
}