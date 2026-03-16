// app/charlie/components/ComparableCard.tsx
'use client'

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
  }
  isLease?: boolean
}

const TEMP_COLORS: Record<string, string> = {
  HOT: '#ef4444', WARM: '#f59e0b', COLD: '#3b82f6', FROZEN: '#94a3b8'
}
const QUALITY_COLORS: Record<string, string> = {
  Perfect: '#10b981', Excellent: '#3b82f6', Good: '#8b5cf6', Fair: '#f59e0b'
}

function timeAgo(dateStr: string): string {
  const months = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 30))
  if (months === 0) return 'This month'
  if (months === 1) return '1 month ago'
  return `${months} months ago`
}

const HOME_TYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex']

export default function ComparableCard({ comparable: c, isLease = false }: Props) {
  const price = c.adjustedPrice || c.closePrice || c.listPrice
  const sqft = c.exactSqft || (c.livingAreaRange ? parseInt(c.livingAreaRange.split('-')[0]) + 50 : null)

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