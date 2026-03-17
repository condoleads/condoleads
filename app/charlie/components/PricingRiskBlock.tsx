// app/charlie/components/PricingRiskBlock.tsx
'use client'

interface Props {
  analytics: {
    sale_to_list_ratio?: number
    closed_avg_dom_90?: number
  }
  estimatedPrice?: number
  intent: 'sale' | 'lease'
  geoName?: string
}

export default function PricingRiskBlock({ analytics, estimatedPrice, intent, geoName }: Props) {
  if (intent === 'lease') return null
  const stl = analytics?.sale_to_list_ratio
  const dom = analytics?.closed_avg_dom_90
  if (!stl || !dom || !estimatedPrice) return null

  const concessionPct = Math.max(0, 100 - stl)
  const concessionAmt = Math.round(estimatedPrice * concessionPct / 100)

  // DOM risk rows
  const rows = [
    { label: 'At asking price', multiplier: 1.0, pct: '0%' },
    { label: '5% over asking', multiplier: 1.8, pct: '+5%' },
    { label: '10% over asking', multiplier: 3.2, pct: '+10%' },
  ]

  function domColor(d: number): string {
    if (d <= 21) return '#10b981'
    if (d <= 45) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Concession card */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14, padding: '16px',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
          Market Concession
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Avg below asking</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: concessionPct > 3 ? '#ef4444' : concessionPct > 1 ? '#f59e0b' : '#10b981' }}>
              {concessionPct.toFixed(1)}%
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Dollar amount</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.7)' }}>
              {concessionAmt ? `~${concessionAmt.toLocaleString()}` : 'N/A'}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Sale-to-list</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#3b82f6' }}>
              {stl.toFixed(1)}%
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 10 }}>
          {concessionPct < 1
            ? '✓ Sellers are getting near or above asking — strong pricing position.'
            : `Buyers are negotiating an avg of ${concessionPct.toFixed(1)}% off asking. Price strategically to minimize exposure.`}
        </div>
      </div>

      {/* DOM Risk table */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14, padding: '16px',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
          Days on Market Risk
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row, i) => {
            const estDom = Math.round(dom * row.multiplier)
            const color = domColor(estDom)
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: 10,
                background: i === 0 ? 'rgba(16,185,129,0.06)' : i === 1 ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)',
                border: `1px solid ${i === 0 ? 'rgba(16,185,129,0.15)' : i === 1 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}`,
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{row.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{row.pct} vs market avg</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color }}>{estDom}d</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>est. DOM</div>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 10, lineHeight: 1.6 }}>
          ⚠ Properties sitting 45+ days lose negotiating power and signal price issues to buyers. Every 30 days on market reduces your leverage significantly.
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{
        background: 'rgba(245,158,11,0.06)',
        border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 12, padding: '12px 14px',
        fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6,
      }}>
        ⚠ AI-generated estimates based on market averages. Verify all pricing strategy with a licensed agent before making decisions.
      </div>
    </div>
  )
}