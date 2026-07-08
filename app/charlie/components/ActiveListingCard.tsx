// app/charlie/components/ActiveListingCard.tsx
'use client'

import { buildPropertySlug } from '@/lib/utils/property-slug'

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

// W-CHARLIE-FINETUNE-FIX (2026-06-14): HOME_TYPES literal + slug-build
// inlined logic lifted to lib/utils/property-slug.ts. See ComparableCard.
function domColor(dom: number | undefined): string {
  if (dom == null) return 'rgba(255,255,255,0.3)'
  if (dom <= 21) return '#10b981'
  if (dom <= 45) return '#f59e0b'
  return '#ef4444'
}

export default function ActiveListingCard({ listing: l }: Props) {
  // LANE-B-2 (2026-07-08): compute slug up front, wrap in <a href> for
  // crawlable in-app nav. Same shape LANE-B-1 applied to Geo/Home listing
  // cards. Missing listing_key → no anchor (renders plain div).
  const _slug = buildPropertySlug({
    listingKey: l.listing_key,
    unparsedAddress: l.unparsed_address,
    propertySubtype: l.property_subtype,
    unitNumber: l.unit_number,
  })
  const _href = _slug ? '/' + _slug : null

  const age = l.approximate_age || (l.year_built ? `Built ${l.year_built}` : null)

  const cardInner = (
    <div
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

  if (_href) {
    return (
      <a href={_href} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
        {cardInner}
      </a>
    )
  }
  return cardInner
}