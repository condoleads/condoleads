// app/charlie/components/ActiveListingCard.tsx
'use client'

interface Props {
  listing: {
    id: string
    listing_key?: string
    list_price?: number
    unparsed_address?: string
    bedrooms_total?: number
    bathrooms_total_integer?: number
    living_area_range?: string
    days_on_market?: number
    approximate_age?: string
    year_built?: number
    association_fee?: number
    property_subtype?: string
    unit_number?: string
    mediaUrl?: string
  }
}

const HOME_TYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex']

function domColor(dom: number | undefined): string {
  if (dom == null) return 'rgba(255,255,255,0.3)'
  if (dom <= 21) return '#10b981'
  if (dom <= 45) return '#f59e0b'
  return '#ef4444'
}

export default function ActiveListingCard({ listing: l }: Props) {
  const handleClick = () => {
    if (!l.listing_key) return
    const mls = l.listing_key.toLowerCase()
    const rawAddr = (l.unparsed_address || '').split(',')[0].trim()
    const unitStr = l.unit_number || ''
    const withoutUnit = unitStr
      ? rawAddr.replace(new RegExp('\\s+' + unitStr + '\\s*$'), '').trim()
      : rawAddr
    const addr = withoutUnit
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    const isCondo = !HOME_TYPES.includes(l.property_subtype || '')
    const city = (l.unparsed_address || '').split(',')[1]?.trim().split(' ')[0].toLowerCase() || ''
    const url = isCondo
      ? (unitStr ? `${addr}-unit-${unitStr}-${mls}` : `${addr}-unit-${mls}`)
      : `${addr}-${city ? city + '-' : ''}${mls}`
    window.open('/' + url, '_blank')
  }

  const age = l.approximate_age || (l.year_built ? `Built ${l.year_built}` : null)

  return (
    <div
      onClick={handleClick}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        overflow: 'hidden',
        cursor: l.listing_key ? 'pointer' : 'default',
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
        overflow: 'hidden', position: 'relative',
      }}>
        {l.mediaUrl ? (
          <img src={l.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏠</div>
        )}
        {/* FOR SALE badge */}
        <div style={{
          position: 'absolute', top: 6, left: 6,
          background: '#3b82f6',
          borderRadius: 4, padding: '2px 6px',
          fontSize: 9, fontWeight: 700, color: '#fff',
        }}>FOR SALE</div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
            {l.list_price ? `$${l.list_price.toLocaleString()}` : '—'}
          </div>
          {l.days_on_market != null && (
            <div style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: `${domColor(l.days_on_market)}22`,
              color: domColor(l.days_on_market),
              flexShrink: 0, marginLeft: 8,
            }}>{l.days_on_market}d on market</div>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {l.unparsed_address?.split(',')[0] || '—'}
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)', flexWrap: 'wrap' }}>
          {l.bedrooms_total && <span>{l.bedrooms_total} bed</span>}
          {l.bathrooms_total_integer && <span>{l.bathrooms_total_integer} bath</span>}
          {l.living_area_range && <span>{l.living_area_range} sqft</span>}
          {age && <span style={{ color: 'rgba(255,255,255,0.25)' }}>{age}</span>}
          {l.association_fee && <span style={{ color: 'rgba(255,255,255,0.25)' }}>${l.association_fee}/mo maint.</span>}
        </div>
      </div>
    </div>
  )
}