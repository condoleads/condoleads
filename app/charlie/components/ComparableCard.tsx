// app/charlie/components/ComparableCard.tsx
'use client'

// C-ENHANCE-2-RENDER (2026-06-13): per-tile tier chip. Reuses the IMPORTABLE
// label-map constants from the estimator (no UI text drag, no component
// reuse). Color values are local literals matching the estimator's tier
// palette verbatim. Chip is conditional — silent-omits when sourceTier is
// not provided (so the data-foundation gate at C-ENHANCE-1-DATA decides
// whether the chip ever appears; this render layer just respects the prop).
import {
  HOME_LABEL_MAP,
  CONDO_LABEL_MAP,
  type GeoConfidenceLabelMap,
} from '@/app/estimator/components/GeoConfidenceSpread'
import { buildPropertySlug } from '@/lib/utils/property-slug'

export type ComparableTier = 'platinum' | 'gold' | 'silver' | 'bronze'

interface Props {
  comparable: {
    closePrice?: number
    listPrice?: number
    unparsedAddress?: string
    bedrooms?: number
    bathrooms?: number
    livingAreaRange?: string
    exactSqft?: number
    daysOnMarket?: number
    closeDate?: string
    matchQuality?: string
    temperature?: string
    listingKey?: string
    mediaUrl?: string
    adjustedPrice?: number
    unitNumber?: string
    propertySubtype?: string
    sourceTier?: string | null
  }
  isLease?: boolean
  // C-ENHANCE-2-RENDER props. Both optional — when absent, the chip never
  // renders and the card is byte-equivalent to the pre-enhancement render.
  sourceTier?: ComparableTier | null
  path?: 'condo' | 'home'
}

const TEMP_COLORS: Record<string, string> = {
  HOT: '#ef4444', WARM: '#f59e0b', COLD: '#3b82f6', FROZEN: '#94a3b8'
}
const QUALITY_COLORS: Record<string, string> = {
  Perfect: '#10b981', Excellent: '#3b82f6', Good: '#8b5cf6', Fair: '#f59e0b'
}

// Tier color palette — verbatim from EstimatorResults.tsx:619-622 / 862-869.
// Local literals so Charlie's render doesn't depend on estimator UI imports.
const TIER_COLORS: Record<ComparableTier, string> = {
  platinum: '#10b981',
  gold:     '#f59e0b',
  silver:   '#64748b',
  bronze:   '#c2410c',
}

function timeAgo(dateStr: string): string {
  const months = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 30))
  if (months === 0) return 'This month'
  if (months === 1) return '1 month ago'
  return `${months} months ago`
}

// W-CHARLIE-FINETUNE-FIX (2026-06-14): HOME_TYPES literal + slug-build
// logic lifted to lib/utils/property-slug.ts so the email + lead-page
// tile builders can call the SAME function and produce byte-identical
// hrefs (verified). Keeping the local HOME_TYPES const removed —
// buildPropertySlug owns it.

export default function ComparableCard({ comparable: c, isLease = false, sourceTier, path }: Props) {
  // W-CHARLIE-BUYER-INCHAT-FIX (2026-06-15): dual-shape field reads —
  // ComparableCard now consumes both the seller-estimate API camelCase
  // shape (its original input) AND the raw mls_listings snake_case
  // shape (the buyer comp shape that get_comparables → /api/geo-
  // listings passes through unchanged). Mirrors the email template
  // (charlie-plan-email-html.ts:372-394) and the lead-page renderer
  // (PlanRenderer.tsx:604-609), which were already dual-shape. The
  // camelCase primary preserves seller no-regression — only when the
  // camel field is missing does the snake fallback fire.
  //
  // Numeric/price fields use ?? (so 0 isn't masked). String/optional
  // fields use || (matches email/lead pattern).
  const c_anon = c as any
  const price = (c.adjustedPrice ?? c_anon.adjusted_price)
    ?? (c.closePrice ?? c_anon.close_price)
    ?? (c.listPrice ?? c_anon.list_price)
  const livingAreaRange = c.livingAreaRange || c_anon.living_area_range
  const sqft = c.exactSqft || (livingAreaRange ? parseInt(String(livingAreaRange).split('-')[0]) + 50 : null)
  const unparsedAddress = c.unparsedAddress || c_anon.unparsed_address
  const bedrooms = c.bedrooms ?? c_anon.bedrooms_total
  const bathrooms = c.bathrooms ?? c_anon.bathrooms_total_integer
  const daysOnMarket = c.daysOnMarket ?? c_anon.days_on_market
  const closeDate = c.closeDate || c_anon.close_date
  const listingKey = c.listingKey || c_anon.listing_key
  const mediaUrl = c.mediaUrl || c_anon.media?.[0]?.media_url || c_anon.media?.[0]?.url
  const unitNumber = c.unitNumber || c_anon.unit_number
  const propertySubtype = c.propertySubtype || c_anon.property_subtype

  // Tier chip — prefer explicit prop (e.g. uniform-tier from estimate
  // .bestGeoTier for geo comparables) over per-tile sourceTier (mixed-tier
  // for the tax-match display list). Silent-omit when neither is present
  // or when the value isn't a known tier (forward-compat).
  const tierKey = (sourceTier || (c.sourceTier as ComparableTier | undefined)) as ComparableTier | undefined
  const validTier: ComparableTier | null =
    tierKey === 'platinum' || tierKey === 'gold' || tierKey === 'silver' || tierKey === 'bronze'
      ? tierKey
      : null
  const labelMap: GeoConfidenceLabelMap = path === 'home' ? HOME_LABEL_MAP : CONDO_LABEL_MAP
  const tierLabel = validTier ? labelMap[validTier] : null
  const tierColor = validTier ? TIER_COLORS[validTier] : null

  // LANE-B-2 (2026-07-08): compute slug once; anchor-wrap for crawl.
  const _cmpSlug = buildPropertySlug({
    listingKey,
    unparsedAddress,
    propertySubtype,
    unitNumber,
  })
  const _cmpHref = _cmpSlug ? '/' + _cmpSlug : null

  const cardInner = (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        overflow: 'hidden',
        cursor: listingKey ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
        display: 'flex',
        gap: 0,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
    >
      {/* Photo */}
      <div style={{
        width: 90, height: 90, flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {mediaUrl ? (
          <img src={mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏠</div>
        )}
        {c.temperature && (
          <div style={{
            position: 'absolute', top: 6, left: 6,
            background: TEMP_COLORS[c.temperature] || '#94a3b8',
            borderRadius: 4, padding: '2px 6px',
            fontSize: 9, fontWeight: 700, color: '#fff',
          }}>{c.temperature}</div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
        {/* Tier chip — silent-omit when no tier signal. Sits above the price
            row so it reads as a label for the tile (matches the estimator's
            structural placement at EstimatorResults.tsx:640-646), but uses
            Charlie's chip style + dark-panel-appropriate solid bg/white text. */}
        {tierLabel && tierColor && (
          <div style={{ marginBottom: 4 }}>
            <span style={{
              display: 'inline-block',
              fontSize: 10, fontWeight: 700,
              padding: '2px 7px', borderRadius: 4,
              background: tierColor, color: '#fff',
              letterSpacing: '0.02em',
            }}>{tierLabel.emoji} {tierLabel.name} · {tierLabel.sub}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
            {price ? `$${price.toLocaleString()}${isLease ? '/mo' : ''}` : '—'}
          </div>
          {c.matchQuality && (
            <div style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: `${QUALITY_COLORS[c.matchQuality] || '#94a3b8'}22`,
              color: QUALITY_COLORS[c.matchQuality] || '#94a3b8',
              flexShrink: 0, marginLeft: 8,
            }}>{c.matchQuality}</div>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {unparsedAddress?.split(',')[0] || '—'}
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          {bedrooms != null && <span>{bedrooms} bed</span>}
          {bathrooms != null && <span>{bathrooms} bath</span>}
          {sqft && <span>{sqft} sqft</span>}
          {daysOnMarket != null && <span>{daysOnMarket}d DOM</span>}
          {closeDate && <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.25)' }}>{timeAgo(closeDate)}</span>}
        </div>
      </div>
    </div>
  )

  if (_cmpHref) {
    return (
      <a href={_cmpHref} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
        {cardInner}
      </a>
    )
  }
  return cardInner
}