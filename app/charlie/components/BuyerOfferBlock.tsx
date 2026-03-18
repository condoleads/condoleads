// app/charlie/components/BuyerOfferBlock.tsx
'use client'

interface Props {
  analytics: any
  propertyType?: string // 'condo' | 'homes' | 'any'
  geoName?: string
}

const fmt = (n: number | null | undefined, prefix = '', suffix = '') =>
  n == null ? '—' : `${prefix}${n.toLocaleString('en-CA')}${suffix}`

const BR_LABELS: Record<string, string> = {
  studio: 'Studio', '1br': '1 Bed', '2br': '2 Bed', '3br': '3 Bed', '4br': '4 Bed'
}

const SUBTYPE_ORDER = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex']

function domColor(dom: number): string {
  if (dom <= 21) return '#10b981'
  if (dom <= 45) return '#f59e0b'
  return '#ef4444'
}

function concessionColor(pct: number): string {
  if (pct < 1) return '#10b981'
  if (pct < 3) return '#f59e0b'
  return '#ef4444'
}

export default function BuyerOfferBlock({ analytics, propertyType, geoName }: Props) {
  if (!analytics) return null

  const bedroomBreakdown = analytics.bedroom_breakdown
  const subtypeBreakdown = analytics.subtype_breakdown
  const stl = analytics.sale_to_list_ratio
  const dom = analytics.closed_avg_dom_90
  const medianPsf = analytics.median_psf

  const isCondo = propertyType === 'condo'
  const isHomes = propertyType === 'homes'

  // Nothing to show
  if (!bedroomBreakdown && !subtypeBreakdown && !stl) return null

  const concessionPct = stl ? Math.max(0, 100 - stl) : null
  const offerPct = stl ? Math.min(stl, 100) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Offer Intelligence */}
      {stl && dom && (
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14, padding: 16,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
            Offer Intelligence · {geoName}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>OFFER AT</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#3b82f6' }}>{offerPct?.toFixed(1)}%</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>of asking</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>AVG ROOM</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: concessionColor(concessionPct || 0) }}>{concessionPct?.toFixed(1)}%</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>negotiating</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>DECIDE IN</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: domColor(dom) }}>{Math.round(dom)}d</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>avg DOM</div>
            </div>
          </div>
          {medianPsf && isCondo && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
              📐 Market PSF benchmark: <span style={{ color: '#fff', fontWeight: 700 }}>${medianPsf.toLocaleString()}/sqft</span> — use this to evaluate if a listing is priced fairly.
            </div>
          )}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8, lineHeight: 1.6 }}>
            ⚠ AI-generated from market averages. Verify with your agent before making an offer.
          </div>
        </div>
      )}

      {/* Condo: Price by bedroom */}
      {isCondo && bedroomBreakdown && Object.keys(bedroomBreakdown).length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14, padding: 16,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
            Price by Bedroom Type
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(bedroomBreakdown).map(([key, val]: [string, any]) => (
              <div key={key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{BR_LABELS[key] || key}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                    {fmt(val.median_psf, '$', '/sqft')} · {val.count} sales · {Math.round(val.avg_dom)}d DOM
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>{fmt(val.median_price, '$')}</div>
                  <div style={{ fontSize: 10, color: concessionColor(val.concession_pct) }}>
                    ~{val.concession_pct?.toFixed(1)}% room
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Homes: Price by subtype */}
      {isHomes && subtypeBreakdown && Object.keys(subtypeBreakdown).length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14, padding: 16,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
            Price by Home Type
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SUBTYPE_ORDER.filter(k => subtypeBreakdown[k]).map(key => {
              const val = subtypeBreakdown[key]
              return (
                <div key={key} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{key}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                      {val.count} sales · {Math.round(val.avg_dom)}d DOM · {val.sale_to_list?.toFixed(1)}% STL
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>{fmt(val.median_price, '$')}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}