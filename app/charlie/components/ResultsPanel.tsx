// app/charlie/components/ResultsPanel.tsx
'use client'
import dynamic from 'next/dynamic'

const AnalyticsSection = dynamic(() => import('@/components/analytics/AnalyticsSection'), { ssr: false })

interface Props {
  analytics: any | null
  listings: any[]
  comparables: any[]
  geoContext: { geoType: string; geoId: string; geoName: string } | null
}

const fmt = (n: number | null | undefined, prefix = '', suffix = '') =>
  n == null ? '—' : `${prefix}${n.toLocaleString('en-CA')}${suffix}`

function marketConditionLabel(stl: number | null, dom: number | null) {
  if (!stl || !dom) return { label: 'Insufficient Data', color: '#94a3b8' }
  if (stl >= 99 && dom <= 20) return { label: "Strong Seller's Market", color: '#10b981' }
  if (stl >= 97 && dom <= 40) return { label: "Seller's Market", color: '#10b981' }
  if (stl < 95 || dom > 70) return { label: "Buyer's Market", color: '#ef4444' }
  return { label: 'Balanced Market', color: '#f59e0b' }
}

export default function ResultsPanel({ analytics, listings, comparables, geoContext }: Props) {
  const allListings = listings.length > 0 ? listings : comparables
  const isComps = comparables.length > 0 && listings.length === 0

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      background: '#080f1a',
    }}>

      {/* Market snapshot */}
      {analytics && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
            Market Intelligence · {geoContext?.geoName}
          </div>
          {(() => {
            const cond = marketConditionLabel(analytics.sale_to_list_ratio, analytics.closed_avg_dom_90)
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: `${cond.color}18`,
                  border: `1px solid ${cond.color}40`,
                  borderRadius: 100, padding: '5px 14px', marginBottom: 14,
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: cond.color, boxShadow: `0 0 6px ${cond.color}` }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: cond.color }}>{cond.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Median PSF', value: fmt(analytics.median_psf, '$'), color: '#3b82f6' },
                    { label: 'Avg DOM', value: fmt(analytics.closed_avg_dom_90, '', 'd'), color: '#6366f1' },
                    { label: 'Sale/List', value: fmt(analytics.sale_to_list_ratio, '', '%'), color: '#10b981' },
                    { label: 'Active', value: fmt(analytics.active_count), color: '#8b5cf6' },
                    { label: 'Sold 90d', value: fmt(analytics.closed_sale_count_90), color: '#ec4899' },
                    { label: 'Absorption', value: fmt(analytics.absorption_rate_pct, '', '%'), color: '#f59e0b' },
                  ].map(m => (
                    <div key={m.label} style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 12, padding: '12px',
                    }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{m.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Listings */}
      {allListings.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
            {isComps ? 'Comparable Sales' : 'Matched Listings'} · {allListings.length} found
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {allListings.map((listing: any) => (
              <div key={listing.id} style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 14,
                padding: '14px',
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                cursor: 'pointer',
              }}
              onClick={() => window.open(`/${listing.slug || listing.listing_key}`, '_blank')}
              >
                {/* Photo */}
                <div style={{
                  width: 72, height: 72, borderRadius: 10,
                  background: 'rgba(255,255,255,0.08)',
                  flexShrink: 0, overflow: 'hidden',
                }}>
                  {listing.media?.[0]?.url && (
                    <img src={listing.media[0].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 3 }}>
                    {listing.close_price
                      ? `$${listing.close_price.toLocaleString()}`
                      : `$${listing.list_price?.toLocaleString() || '—'}`}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {listing.unparsed_address || listing.street_address}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    {listing.bedrooms_total && <span>{listing.bedrooms_total} bed</span>}
                    {listing.bathrooms_total && <span>{listing.bathrooms_total} bath</span>}
                    {listing.calculated_sqft && <span>{listing.calculated_sqft.toLocaleString()} sqft</span>}
                    {listing.closed_avg_dom && <span>{listing.closed_avg_dom}d DOM</span>}
                  </div>
                </div>
                {/* Arrow */}
                <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18, flexShrink: 0 }}>→</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!analytics && allListings.length === 0 && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.15)', gap: 12,
          padding: '60px 20px',
        }}>
          <div style={{ fontSize: 40 }}>✦</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.25)' }}>
            Results will appear here
          </div>
          <div style={{ fontSize: 12, textAlign: 'center' }}>
            Tell Charlie where you're looking and what you need
          </div>
        </div>
      )}
    </div>
  )
}