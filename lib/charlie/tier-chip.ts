// lib/charlie/tier-chip.ts
//
// W-CHARLIE-CONVERGENCE CV-0 (2026-06-14) — canonical tier-chip metadata +
// anchor-fallback helper. Single source of truth for tier color / label /
// marker / per-path subtitle. Pure JS — no React imports, no DOM, no
// string-HTML — so BOTH the React surfaces (in-chat ComparableCard /
// SellerEstimateBlock, dashboard CharlieLeadEstimate) AND the email-HTML
// builder (lib/email/charlie-plan-email-html.ts) can consume it without
// bundler complications.
//
// At the time CV-0 ships, the canonical values are duplicated literally
// across FOUR surfaces:
//   - app/charlie/components/ComparableCard.tsx:54-58           (TIER_COLORS)
//   - app/charlie/components/SellerEstimateBlock.tsx:75-79      (TIER_COLORS)
//   - components/dashboard/CharlieLeadEstimate.tsx:85-89        (TIER_COLORS)
//   - lib/email/charlie-plan-email-html.ts                     (TIER_COLORS_EMAIL)
// All four sets are byte-identical (platinum=#10b981, gold=#f59e0b,
// silver=#64748b, bronze=#c2410c). The label maps (HOME_LABEL_MAP /
// CONDO_LABEL_MAP at GeoConfidenceSpread.tsx:46-58) are the same too.
// CV-0 does NOT migrate any of these — it builds the canonical module so
// CV-1 / CV-2 can migrate them one surface at a time without risk.

export type TierName = 'platinum' | 'gold' | 'silver' | 'bronze'

export type TierBestSlot = TierName | 'none'

export type PathName = 'home' | 'condo'

export interface TierMeta {
  /** Hex (no alpha). Verbatim from ComparableCard.tsx:54-58. */
  color: string
  /** Display label, capitalized. Verbatim from GeoConfidenceSpread.tsx:46-58. */
  label: TierName extends infer N ? Capitalize<Extract<N, string>> : never
  /** Marker glyph. ◆ for platinum, ● for the others. */
  marker: string
  /** Sub-label for the home tier rail. */
  homeSub: string
  /** Sub-label for the condo tier rail. */
  condoSub: string
}

/**
 * The single canonical source for tier metadata. Values are byte-identical
 * to the four duplications listed in the header.
 */
export const TIER_META: Record<TierName, TierMeta> = {
  platinum: { color: '#10b981', label: 'Platinum' as any, marker: '◆', homeSub: 'Same street',  condoSub: 'Same Building' },
  gold:     { color: '#f59e0b', label: 'Gold'     as any, marker: '●', homeSub: 'Community',    condoSub: 'Community'      },
  silver:   { color: '#64748b', label: 'Silver'   as any, marker: '●', homeSub: 'Municipality', condoSub: 'Municipality'   },
  bronze:   { color: '#c2410c', label: 'Bronze'   as any, marker: '●', homeSub: 'Area',         condoSub: 'Area'           },
}

export const TIER_ORDER: ReadonlyArray<TierName> = ['platinum', 'gold', 'silver', 'bronze']

/**
 * Validates `t` as a known TierName. `undefined`, `null`, `'none'`, and any
 * other string return `null`.
 */
export function asTierName(t: string | null | undefined): TierName | null {
  if (t === 'platinum' || t === 'gold' || t === 'silver' || t === 'bronze') return t
  return null
}

export interface TierChipResolved {
  tier: TierName
  color: string
  label: TierMeta['label']
  marker: string
  sub: string
}

/**
 * Resolve which tier chip to render on a single tile. Implements the anchor-
 * fallback rule the renderers already use: per-tile `sourceTier` wins when
 * present; otherwise fall back to the geo anchor `bestGeoTier`. Returns
 * `null` (= "no chip on this tile") when neither is a valid TierName.
 *
 * This mirrors EstimatorResults.tsx:616-617 (`comp.sourceTier || result
 * .bestGeoTier`) and the in-chat/dashboard/email path of the same shape.
 *
 * @param sourceTier per-tile tier stamped by runTaxMatchCascade (silver on
 *                   the fixture's tax comps) — usually `null/undefined` on
 *                   geo cascade comps.
 * @param anchorTier estimate.bestGeoTier (gold on the fixture).
 * @param path       'home' | 'condo' — selects the sub label.
 */
export function tierChipFor(
  sourceTier: string | null | undefined,
  anchorTier: string | null | undefined,
  path: PathName,
): TierChipResolved | null {
  const tier = asTierName(sourceTier) ?? asTierName(anchorTier)
  if (!tier) return null
  const meta = TIER_META[tier]
  return {
    tier,
    color: meta.color,
    label: meta.label,
    marker: meta.marker,
    sub: path === 'home' ? meta.homeSub : meta.condoSub,
  }
}
