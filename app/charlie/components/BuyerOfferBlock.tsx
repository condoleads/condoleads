// app/charlie/components/BuyerOfferBlock.tsx
'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'

interface Props {
  analytics: any
  propertyType?: string
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

const tooltipStyle = { background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }

function TrendChart({ data, dataKey, color, formatter }: { data: any[], dataKey: string, color: string, formatter: (v: any) => string }) {
  if (!data || data.length < 3) return null
  const avg = data.reduce((s, d) => s + (d[dataKey] || 0), 0) / data.length
  return (
    <ResponsiveContainer width="100%" height={130}>
      <LineChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false}
          tickFormatter={v => v?.slice(5) || v} interval="preserveStartEnd" />
        <YAxis hide domain={['auto', 'auto']} />
        <ReferenceLine y={avg} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
        <Tooltip contentStyle={tooltipStyle}
          formatter={(v: any) => [formatter(v), '']}
          labelStyle={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false}
          activeDot={{ r: 4, fill: color }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default function BuyerOfferBlock({ analytics, propertyType, geoName }: Props) {
  if (!analytics) return null
  console.log('[BuyerOfferBlock] track:', analytics.track, 'has trend:', !!analytics.price_trend_monthly, 'trend length:', analytics.price_trend_monthly?.length)

  const bedroomBreakdown = analytics.bedroom_breakdown
  const subtypeBreakdown = analytics.subtype_breakdown
  const stl = analytics.sale_to_list_ratio
  const dom = analytics.closed_avg_dom_90
  const medianPsf = analytics.median_psf

  const isCondo = propertyType === 'condo'
  const isHomes = propertyType === 'homes'

  if (!bedroomBreakdown && !subtypeBreakdown && !stl) return null

  const concessionPct = stl ? Math.max(0, 100 - stl) : null
  const offerPct = stl ? Math.min(stl, 100) : null

  // Build trend data
  let trendData: any[] = []
  if (isCondo && Array.isArray(analytics.price_trend_monthly)) {
    trendData = analytics.price_trend_monthly
      .filter((d: any) => !d.partial && d.value)
      .map((d: any) => ({ month: d.month, psf: d.value }))
  }
  if (isHomes && Array.isArray(analytics.price_trend_monthly)) {
    trendData = analytics.price_trend_monthly
      .filter((d: any) => !d.partial && d.value)
      .map((d: any) => ({ month: d.month, price: d.value }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Offer Intelligence */}
      {stl && dom && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
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
              📐 PSF benchmark: <span style={{ color: '#fff', fontWeight: 700 }}>${medianPsf.toLocaleString()}/sqft</span> — use this to evaluate if a listing is priced fairly.
            </div>
          )}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
            ⚠ AI-generated from market averages. Verify with your agent before making an offer.
          </div>
        </div>
      )}

      {/* Condo: 24-month PSF trend + bedroom table */}
      {isCondo && (
        <>
          {trendData.length >= 3 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>
                Median PSF · 24 Months
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>Price per sqft trend — rising or falling market signal</div>
              <TrendChart data={trendData} dataKey="psf" color="#3b82f6" formatter={v => `$${Number(v).toLocaleString()}/sqft`} />
            </div>
          )}
          {bedroomBreakdown && Object.keys(bedroomBreakdown).length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
                Price by Bedroom Type
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(bedroomBreakdown).map(([key, val]: [string, any]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{BR_LABELS[key] || key}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>{val.count} sales · {Math.round(val.avg_dom)}d DOM</span>
                    </div>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#10b981', marginRight: 10 }}>{fmt(val.median_price, '$')}</span>
                      <span style={{ fontSize: 11, color: '#3b82f6' }}>{fmt(val.median_psf, '$', '/sqft')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Homes: 24-month price trend + subtype table */}
      {isHomes && (
        <>
          {trendData.length >= 3 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>
                Median Sale Price · 24 Months
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>Market price trend — are prices rising or falling?</div>
              <TrendChart data={trendData} dataKey="price" color="#6366f1" formatter={v => `$${Number(v).toLocaleString()}`} />
            </div>
          )}
          {subtypeBreakdown && Object.keys(subtypeBreakdown).length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
                Price by Home Type
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SUBTYPE_ORDER.filter(k => subtypeBreakdown[k]).map(key => {
                  const val = subtypeBreakdown[key]
                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{key}</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>{val.count} sales · {Math.round(val.avg_dom)}d DOM · {val.sale_to_list?.toFixed(1)}% STL</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>{fmt(val.median_price, '$')}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}