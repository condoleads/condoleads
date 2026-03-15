// app/charlie/components/SellerEstimateBlock.tsx
'use client'
import ComparableCard from './ComparableCard'

interface Props {
  estimate: {
    estimatedPrice: number
    priceRange: { low: number; high: number }
    confidence: string
    confidenceMessage: string
    showPrice: boolean
    matchTier: string
    marketSpeed: { avgDaysOnMarket: number; status: string; message: string }
  }
  comparables: any[]
  buildingName?: string
  geoLevel: string
  resolvedAddress?: any
  isLease?: boolean
  intent: 'sale' | 'lease'
}

const CONFIDENCE_COLORS: Record<string, string> = {
  'High': '#10b981',
  'Medium-High': '#3b82f6',
  'Medium': '#f59e0b',
  'Medium-Low': '#f59e0b',
  'Low': '#ef4444',
  'None': '#94a3b8',
}

export default function SellerEstimateBlock({ estimate, comparables, buildingName, geoLevel, isLease, intent }: Props) {
  if (!estimate) return <div style={{ padding: 20, color: 'rgba(255,255,255,0.3)' }}>Computing estimate...</div>
  const confColor = CONFIDENCE_COLORS[estimate.confidence] || '#94a3b8'
  const priceLabel = isLease ? '/mo' : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Resolved context */}
      {buildingName && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
          📍 {buildingName} · {geoLevel} level estimate
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

      {/* Comparables */}
      {comparables.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
            Comparable Sales · {comparables.length} found
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comparables.slice(0, 6).map((c, i) => (
              <ComparableCard key={i} comparable={c} isLease={isLease} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}