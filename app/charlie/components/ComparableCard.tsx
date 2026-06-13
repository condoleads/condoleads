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

const HOME_TYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex']

export default function ComparableCard({ comparable: c, isLease = false, sourceTier, path }: Props) {
  const price = c.adjustedPrice || c.closePrice || c.listPrice
  const sqft = c.exactSqft || (c.livingAreaRange ? parseInt(c.livingAreaRange.split('-')[0]) + 50 : null)

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

  const handleClick = () => {
    if (!c.listingKey) return
    const mls = c.listingKey.toLowerCase()
    const rawAddr = (c.unparsedAddress || '').split(',')[0].trim()
    const unitStr = c.unitNumber || ''
    const withoutUnit = unitStr
      ? rawAddr.replace(new RegExp('\\s+' + unitStr + '\\s*$'), '').trim()
      : rawAddr
    const addr = withoutUnit
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    const isCondo = !HOME_TYPES.includes(c.propertySubtype || '')
    const city = (c.unparsedAddress || '').split(',')[1]?.trim().split(' ')[0].toLowerCase() || ''
    const url = isCondo
      ? (unitStr ? `${addr}-unit-${unitStr}-${mls}` : `${addr}-unit-${mls}`)
      : `${addr}-${city ? city + '-' : ''}${mls}`
    window.open('/' + url, '_blank')
  }

  return (
    <div
      onClick={handleClick}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        overflow: 'hidden',
        cursor: c.listingKey ? 'pointer' : 'default',
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
        {c.mediaUrl ? (
          <img src={c.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
          {c.unparsedAddress?.split(',')[0] || '—'}
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          {c.bedrooms && <span>{c.bedrooms} bed</span>}
          {c.bathrooms && <span>{c.bathrooms} bath</span>}
          {sqft && <span>{sqft} sqft</span>}
          {c.daysOnMarket != null && <span>{c.daysOnMarket}d DOM</span>}
          {c.closeDate && <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.25)' }}>{timeAgo(c.closeDate)}</span>}
        </div>
      </div>
    </div>
  )
}