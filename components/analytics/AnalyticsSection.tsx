'use client'
import { useEffect, useState } from 'react'
import {
  ComposedChart, Area, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────
type GeoType = 'area' | 'municipality' | 'community' | 'neighbourhood' | 'building'
type Track = 'condo' | 'homes'

interface Props {
  geoType: GeoType
  geoId: string
  geoName: string
  parentGeoType?: string
  parentGeoId?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, prefix = '', suffix = '', decimals = 0) =>
  n == null ? '—' : `${prefix}${n.toLocaleString('en-CA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function marketCondition(stl: number | null, dom: number | null): { label: string; color: string; bg: string } {
  if (!stl || !dom) return { label: 'Insufficient Data', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' }
  if (stl >= 99 && dom <= 20) return { label: "Strong Seller's Market", color: '#10b981', bg: 'rgba(16,185,129,0.12)' }
  if (stl >= 97 && dom <= 40) return { label: "Seller's Market", color: '#10b981', bg: 'rgba(16,185,129,0.1)' }
  if (stl < 95 || dom > 70)  return { label: "Buyer's Market", color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
  return { label: 'Balanced Market', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16, padding: 24, ...style
    }}>
      {children}
    </div>
  )
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' as const, marginBottom: 4 }}>{children}</div>
}

function MetricCard({ label, value, sub, trend, accent = '#3b82f6' }: {
  label: string; value: string; sub?: string; trend?: number | null; accent?: string
}) {
  return (
    <Card style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <CardLabel>{label}</CardLabel>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', lineHeight: 1, marginBottom: 6 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {trend != null && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: trend > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: trend > 0 ? '#10b981' : '#ef4444' }}>
            {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
        {sub && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{sub}</span>}
      </div>
    </Card>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
      {label} — data populating nightly
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ fontSize: 13, fontWeight: 700, color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AnalyticsSection({ geoType, geoId, geoName, parentGeoType, parentGeoId }: Props) {
  const [tab, setTab] = useState<'overview' | 'price' | 'trends' | 'lease' | 'timing' | 'rankings'>('overview')
  const [track, setTrack] = useState<Track>('condo')
  const [data, setData] = useState<any>(null)
  const [homesData, setHomesData] = useState<any>(null)
  const [rankings, setRankings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bedroomFilter, setBedroomFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/analytics?geoType=${geoType}&geoId=${geoId}&track=condo`).then(r => r.json()),
      fetch(`/api/analytics?geoType=${geoType}&geoId=${geoId}&track=homes`).then(r => r.json()),
      parentGeoType && parentGeoId
        ? fetch(`/api/rankings?parentGeoType=${parentGeoType}&parentGeoId=${parentGeoId}&track=condo`).then(r => r.json())
        : Promise.resolve({ data: [] }),
    ]).then(([condo, homes, rank]) => {
      setData(condo.data)
      setHomesData(homes.data)
      setRankings(rank.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [geoType, geoId, parentGeoType, parentGeoId])

  const activeData = track === 'condo' ? data : homesData
  const hasHomesData = !!homesData?.active_count
  const condition = marketCondition(activeData?.sale_to_list_ratio, activeData?.closed_avg_dom_90)

  // Seasonal chart data
  const seasonal = activeData?.insight_seasonal
  const seasonalChartData = seasonal?.monthly_data?.map((m: any) => ({
    month: MONTHS[m.month - 1],
    dom: m.avg_dom,
    stl: m.avg_stl,
    vol: m.volume,
  })) || []

  // Bedroom breakdown (condos)
  const bedroomBreakdown = data?.bedroom_breakdown || {}
  const bedroomChartData = ['studio','1br','2br','3br']
    .filter(k => bedroomBreakdown[k])
    .map((k, i) => ({
      bed: k === 'studio' ? 'Studio' : k === '1br' ? '1 Bed' : k === '2br' ? '2 Bed' : '3 Bed',
      psf: bedroomBreakdown[k].median_psf,
      price: bedroomBreakdown[k].median_price,
      dom: bedroomBreakdown[k].avg_dom,
      stl: bedroomBreakdown[k].sale_to_list,
      concession: bedroomBreakdown[k].concession_pct,
      color: ['#3b82f6','#6366f1','#8b5cf6','#a78bfa'][i],
    }))

  // Sqft range breakdown (condos)
  const sqftRangeBreakdown = data?.sqft_range_breakdown || {}
  const RANGE_ORDER = ['0-499','500-599','600-699','700-799','800-899','900-999','1000-1199','1200-1399','1400-1599','1600-1799','1800-1999','2000-2249','2250-2499']
  const sqftRangeChartData = RANGE_ORDER
    .filter(r => sqftRangeBreakdown[r]?.median_price > 0)
    .map((r, i) => ({
      range: r === '0-499' ? '<500' : r,
      price: sqftRangeBreakdown[r].median_price,
      psf: sqftRangeBreakdown[r].median_psf,
      count: sqftRangeBreakdown[r].count,
      color: ['#3b82f6','#6366f1','#8b5cf6','#a78bfa','#c4b5fd','#818cf8','#60a5fa','#34d399','#3b82f6','#6366f1','#8b5cf6','#a78bfa','#c4b5fd'][i] || '#3b82f6',
    }))

  // Subtype breakdown (homes)
  const subtypeBreakdown = homesData?.subtype_breakdown || {}
  const subtypeChartData = Object.entries(subtypeBreakdown)
    .filter(([, v]: any) => v?.median_price > 0)
    .sort(([, a]: any, [, b]: any) => b.median_price - a.median_price)
    .map(([type, v]: any, i) => ({
      type,
      price: v.median_price,
      dom: v.avg_dom,
      stl: v.sale_to_list,
      count: v.count,
      color: ['#10b981','#f59e0b','#6366f1','#ec4899','#3b82f6','#8b5cf6'][i] || '#10b981',
    }))

  // Investor ratio
  const investorRatio = activeData?.insight_investor_ratio
  const investorPct = investorRatio?.investor_proxy_pct ?? null
  const endUserPct = investorRatio?.end_user_pct ?? null

  // Monthly trend arrays — from new engine columns
  function fmtMonth(m: string) {
    const [y, mo] = m.split('-')
    return `${MONTHS[parseInt(mo) - 1]} '${y.slice(2)}`
  }
  const priceTrendMonthly = (activeData?.price_trend_monthly || []).map((m: any) => ({ ...m, label: fmtMonth(m.month) }))
  const domTrendMonthly = (activeData?.dom_trend_monthly || []).map((m: any) => ({ ...m, label: fmtMonth(m.month) }))
  const volumeTrendMonthly = (activeData?.volume_trend_monthly || []).map((m: any) => ({ ...m, label: fmtMonth(m.month) }))
  const leaseTrendMonthly = (data?.lease_trend_monthly || []).map((m: any) => ({ ...m, label: fmtMonth(m.month) }))

  // Merged PSF + DOM for dual-axis chart
  const mergedTrend = priceTrendMonthly.map((p: any) => {
    const d = domTrendMonthly.find((x: any) => x.month === p.month)
    return { label: p.label, psf: p.value, dom: d?.value ?? null, count: p.count, partial: p.partial }
  })

  // Filtered breakdown data for charts (tables always show all)
  const filteredBedroomData = bedroomFilter === 'all' ? bedroomChartData : bedroomChartData.filter(b => b.bed === bedroomFilter)
  const filteredSubtypeData = typeFilter === 'all' ? subtypeChartData : subtypeChartData.filter(d => d.type === typeFilter)

  // Rankings
  const rankingTypes = ['fastest_selling','best_value','best_yield','best_concession_opportunity']
  const rankingLabels: Record<string, string> = {
    fastest_selling: 'Fastest Selling',
    best_value: 'Best Value (PSF)',
    best_yield: 'Best Yield',
    best_concession_opportunity: 'Best Concession',
    slowest_moving: 'Slowest Moving',
    highest_price_reduction: 'Price Reductions',
    most_investor: 'Most Investor',
    most_end_user: 'Most End User',
  }
  const topRanking = rankings.find(r => r.ranking_type === 'best_value' && r.track === 'condo')
  const topResults: any[] = topRanking?.results?.slice(0, 5) || []

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'price', label: 'Price Intelligence' },
    { id: 'trends', label: 'Trends' },
    { id: 'lease', label: 'Lease & Yield' },
    { id: 'timing', label: 'Market Timing' },
    ...(parentGeoType && parentGeoId ? [{ id: 'rankings', label: 'Rankings' }] : []),
  ]

  if (loading) {
    return (
      <div style={{ background: '#080f1a', borderRadius: 20, padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
        Loading market intelligence…
      </div>
    )
  }

  if (!data && !homesData) {
    return (
      <div style={{ background: '#080f1a', borderRadius: 20, padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
        Market data for {geoName} is being computed — check back after the next nightly update.
      </div>
    )
  }

  return (
    <div style={{ background: '#080f1a', borderRadius: 20, padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#fff' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', color: '#3b82f6', textTransform: 'uppercase', marginBottom: 4 }}>
            Market Intelligence · {geoName}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: condition.bg, border: `1px solid ${condition.color}40`, borderRadius: 100, padding: '5px 14px' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: condition.color, boxShadow: `0 0 6px ${condition.color}` }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: condition.color }}>{condition.label}</span>
          </div>
        </div>
        {/* Track toggle */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 100, padding: 3 }}>
          {(['condo','homes'] as Track[]).map(t => {
            const disabled = t === 'homes' && !hasHomesData
            return (
              <button key={t} onClick={() => !disabled && setTrack(t)} style={{
                padding: '6px 16px', borderRadius: 100, border: 'none', cursor: disabled ? 'default' : 'pointer',
                background: track === t ? '#3b82f6' : 'transparent',
                color: track === t ? '#fff' : disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
                fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
                transition: 'all 0.2s',
              }}>{t}{disabled ? ' (soon)' : ''}</button>
            )
          })}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{
            padding: '9px 18px', border: 'none', cursor: 'pointer', background: 'transparent',
            color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.35)',
            fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
            borderBottom: tab === t.id ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <MetricCard label="Median PSF" value={fmt(activeData?.median_psf, '$')} sub="per sqft" trend={activeData?.psf_trend_pct} accent="#3b82f6" />
            <MetricCard label="Avg DOM" value={fmt(activeData?.closed_avg_dom_90)} sub="days (90d)" trend={activeData?.dom_trend_pct ? -activeData.dom_trend_pct : null} accent="#6366f1" />
            <MetricCard label="Sale-to-List" value={fmt(activeData?.sale_to_list_ratio, '', '%', 1)} sub="ratio" accent="#10b981" />
            <MetricCard label="Absorption" value={fmt(activeData?.absorption_rate_pct, '', '%', 1)} sub="monthly" accent="#f59e0b" />
            <MetricCard label="Active" value={fmt(activeData?.active_count)} sub="listings" accent="#8b5cf6" />
            <MetricCard label="Sold 90d" value={fmt(activeData?.closed_sale_count_90)} sub="transactions" accent="#ec4899" />
          </div>

          {/* DOM + STL Chart */}
          {seasonalChartData.length > 0 ? (
            <Card>
              <CardLabel>12-Month Trend</CardLabel>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>DOM vs Sale-to-List Ratio</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, marginBottom: 12 }}>
                <span style={{ color: '#6366f1', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 2, background: '#6366f1', display: 'inline-block', borderRadius: 2 }} />DOM</span>
                <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 2, background: '#10b981', display: 'inline-block', borderRadius: 2 }} />Sale/List %</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={seasonalChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="dom" orientation="left" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                  <YAxis yAxisId="stl" orientation="right" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} domain={[88, 102]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area yAxisId="dom" type="monotone" dataKey="dom" fill="rgba(99,102,241,0.1)" stroke="#6366f1" strokeWidth={2} name="DOM" />
                  <Line yAxisId="stl" type="monotone" dataKey="stl" stroke="#10b981" strokeWidth={2.5} dot={false} name="STL%" />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          ) : <EmptyState label="Trend chart" />}

          {/* Investor + Concession */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card>
              <CardLabel>Buyer Profile</CardLabel>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Investor vs End User</div>
              {investorPct != null ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <svg width={120} height={120}>
                    {(() => {
                      const r = 46, cx = 60, cy = 60, sw = 12, circ = 2 * Math.PI * r
                      const invDash = (investorPct / 100) * circ
                      return <>
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} />
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#6366f1" strokeWidth={sw} strokeDasharray={`${invDash} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#10b981" strokeWidth={sw} strokeDasharray={`${circ - invDash - 3} ${circ}`} strokeDashoffset={-(invDash + 1.5)} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
                        <text x={cx} y={cy - 4} textAnchor="middle" fill="#fff" fontSize={18} fontWeight={800}>{endUserPct}%</text>
                        <text x={cx} y={cy + 13} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={9}>End User</text>
                      </>
                    })()}
                  </svg>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>End User</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>{endUserPct}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Investor</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#6366f1' }}>{investorPct}%</div>
                    </div>
                  </div>
                </div>
              ) : <EmptyState label="Investor ratio" />}
            </Card>

            <Card>
              <CardLabel>Negotiation Power</CardLabel>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Concession by Bedroom</div>
              {bedroomChartData.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {bedroomChartData.map(b => (
                    <div key={b.bed} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 48, fontSize: 12, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{b.bed}</div>
                      <div style={{ flex: 1, height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, ((b.concession || 0) / 6) * 100)}%`, height: '100%', background: (b.concession || 0) > 3 ? '#ef4444' : (b.concession || 0) > 2 ? '#f59e0b' : '#10b981', borderRadius: 4 }} />
                      </div>
                      <div style={{ width: 38, fontSize: 12, fontWeight: 700, textAlign: 'right', color: (b.concession || 0) > 3 ? '#ef4444' : (b.concession || 0) > 2 ? '#f59e0b' : '#10b981' }}>
                        {b.concession != null ? `${b.concession}%` : '—'}
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>Avg concession below asking</div>
                </div>
              ) : <EmptyState label="Concession data" />}
            </Card>
          </div>
        </div>
      )}

      {/* ── PRICE INTELLIGENCE ── */}
      {tab === 'price' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── CONDOS ── */}
          {track === 'condo' && (
            <>
              {/* Bedroom filter */}
              {bedroomChartData.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['all', ...bedroomChartData.map(b => b.bed)].map(f => (
                    <button key={f} onClick={() => setBedroomFilter(f)} style={{
                      padding: '5px 14px', borderRadius: 100, border: '1px solid',
                      borderColor: bedroomFilter === f ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                      background: bedroomFilter === f ? 'rgba(59,130,246,0.15)' : 'transparent',
                      color: bedroomFilter === f ? '#60a5fa' : 'rgba(255,255,255,0.4)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                    }}>{f === 'all' ? 'All Bedrooms' : f}</button>
                  ))}
                </div>
              )}
              {/* Bedroom PSF bar chart */}
              {bedroomChartData.length > 0 ? (
                <>
                  <Card>
                    <CardLabel>By Bedroom Type</CardLabel>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Median PSF by Bedroom</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={filteredBedroomData} layout="vertical" barSize={24}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                        <YAxis type="category" dataKey="bed" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} axisLine={false} tickLine={false} width={50} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="psf" name="Median PSF" radius={[0, 6, 6, 0]}>
                          {bedroomChartData.map((b, i) => <Cell key={i} fill={b.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>

                  <Card>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Full Breakdown by Bedroom</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>
                            {['Bedroom','Median Price','PSF','Avg DOM','Sale/List','Concession'].map(h => (
                              <th key={h} style={{ textAlign: h === 'Bedroom' ? 'left' : 'right', padding: '8px 10px', color: 'rgba(255,255,255,0.3)', fontWeight: 600, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bedroomChartData.map(b => (
                            <tr key={b.bed} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '11px 10px', fontWeight: 700 }}>{b.bed}</td>
                              <td style={{ padding: '11px 10px', textAlign: 'right' }}>{fmt(b.price, '$')}</td>
                              <td style={{ padding: '11px 10px', textAlign: 'right', color: '#3b82f6', fontWeight: 700 }}>{fmt(b.psf, '$')}</td>
                              <td style={{ padding: '11px 10px', textAlign: 'right', color: (b.dom || 0) > 60 ? '#ef4444' : '#10b981' }}>{fmt(b.dom)}d</td>
                              <td style={{ padding: '11px 10px', textAlign: 'right' }}>{fmt(b.stl, '', '%', 1)}</td>
                              <td style={{ padding: '11px 10px', textAlign: 'right', color: (b.concession || 0) > 3 ? '#ef4444' : '#f59e0b' }}>{fmt(b.concession, '', '%', 1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              ) : <EmptyState label="Bedroom breakdown" />}

              {/* Sqft range chart */}
              {sqftRangeChartData.length > 0 ? (
                <Card>
                  <CardLabel>By Square Footage Range</CardLabel>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Median Price by Sqft Range</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={sqftRangeChartData} barSize={28}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="range" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-35} textAnchor="end" height={55} />
                      <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload
                        return (
                          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{d.range} sqft</div>
                            <div style={{ fontSize: 12, color: '#3b82f6' }}>Median Price: ${d.price?.toLocaleString()}</div>
                            {d.psf && <div style={{ fontSize: 12, color: '#6366f1' }}>Median PSF: ${d.psf}</div>}
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{d.count} sales (2yr)</div>
                          </div>
                        )
                      }} />
                      <Bar dataKey="price" name="Median Price" radius={[4, 4, 0, 0]}>
                        {sqftRangeChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              ) : <EmptyState label="Sqft range breakdown" />}
            </>
          )}

          {/* ── HOMES ── */}
          {track === 'homes' && (
            <>
              {/* Type filter */}
              {subtypeChartData.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['all', ...subtypeChartData.map(d => d.type)].map(f => (
                    <button key={f} onClick={() => setTypeFilter(f)} style={{
                      padding: '5px 14px', borderRadius: 100, border: '1px solid',
                      borderColor: typeFilter === f ? '#10b981' : 'rgba(255,255,255,0.1)',
                      background: typeFilter === f ? 'rgba(16,185,129,0.15)' : 'transparent',
                      color: typeFilter === f ? '#34d399' : 'rgba(255,255,255,0.4)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                    }}>{f === 'all' ? 'All Types' : f}</button>
                  ))}
                </div>
              )}
              {subtypeChartData.length > 0 ? (
                <>
                  <Card>
                    <CardLabel>By Property Type</CardLabel>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Median Price by Home Type</div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={filteredSubtypeData} layout="vertical" barSize={24}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                        <YAxis type="category" dataKey="type" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} axisLine={false} tickLine={false} width={140} />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0].payload
                          return (
                            <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{d.type}</div>
                              <div style={{ fontSize: 12, color: '#10b981' }}>Median: ${d.price?.toLocaleString()}</div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{d.count} sales · {Math.round(d.dom || 0)}d avg DOM</div>
                            </div>
                          )
                        }} />
                        <Bar dataKey="price" name="Median Price" radius={[0, 6, 6, 0]}>
                          {subtypeChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>

                  <Card>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Full Breakdown by Type</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>
                            {['Type','Median Price','Avg DOM','Sale/List','Sales'].map(h => (
                              <th key={h} style={{ textAlign: h === 'Type' ? 'left' : 'right', padding: '8px 10px', color: 'rgba(255,255,255,0.3)', fontWeight: 600, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {subtypeChartData.map(d => (
                            <tr key={d.type} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '11px 10px', fontWeight: 700 }}>{d.type}</td>
                              <td style={{ padding: '11px 10px', textAlign: 'right' }}>{fmt(d.price, '$')}</td>
                              <td style={{ padding: '11px 10px', textAlign: 'right', color: (d.dom || 0) > 60 ? '#ef4444' : '#10b981' }}>{fmt(d.dom)}d</td>
                              <td style={{ padding: '11px 10px', textAlign: 'right' }}>{fmt(d.stl, '', '%', 1)}</td>
                              <td style={{ padding: '11px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.4)' }}>{d.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              ) : <EmptyState label="Home type breakdown" />}
            </>
          )}

          {/* Price metrics — both tracks */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <MetricCard label="Avg Sale Price" value={fmt(activeData?.avg_sale_price, '$')} accent="#3b82f6" />
            <MetricCard label="P25 Price" value={fmt(activeData?.p25_sale_price, '$')} sub="25th pct" accent="#6366f1" />
            <MetricCard label="P75 Price" value={fmt(activeData?.p75_sale_price, '$')} sub="75th pct" accent="#8b5cf6" />
            <MetricCard label="Price Reductions" value={fmt(activeData?.price_reduction_rate_pct, '', '%', 1)} sub="of listings" accent="#f59e0b" />
          </div>
        </div>
      )}

      {/* ── MARKET TIMING ── */}
      {tab === 'timing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {seasonal ? (
            <>
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                  <div>
                    <CardLabel>Seasonal Intelligence</CardLabel>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>Best Time to Buy or Sell</div>
                  </div>
                  {seasonal.current_month_rank === 1 && (
                    <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '8px 14px' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>You are here</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>🟢 {MONTHS[(seasonal.current_month || 1) - 1]} — Peak Month</div>
                    </div>
                  )}
                </div>

                {/* Heatmap grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, marginBottom: 12 }}>
                  {seasonal.monthly_data?.map((m: any, i: number) => {
                    const isBest = seasonal.best_months?.includes(m.month)
                    const isWorst = seasonal.worst_months?.includes(m.month)
                    const isCurrent = m.month === seasonal.current_month
                    const maxVol = Math.max(...(seasonal.monthly_data?.map((x: any) => x.volume) || [1]))
                    const intensity = m.volume / maxVol
                    return (
                      <div key={i} style={{ textAlign: 'center' }}>
                        <div style={{
                          height: 44, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)',
                          position: 'relative',
                          background: isBest ? `rgba(16,185,129,${0.25 + intensity * 0.5})` : isWorst ? `rgba(239,68,68,${0.2 + intensity * 0.3})` : `rgba(59,130,246,${0.1 + intensity * 0.35})`,
                          border: isCurrent ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.05)',
                        }}>
                          {m.volume}
                          {isCurrent && <div style={{ position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)', fontSize: 7, background: '#f59e0b', color: '#000', padding: '1px 4px', borderRadius: 3, fontWeight: 800, whiteSpace: 'nowrap' }}>NOW</div>}
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{MONTHS[i]}</div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: '#10b981', display: 'inline-block' }} />
                    Best: {seasonal.best_months?.map((m: number) => MONTHS[m - 1]).join(', ')}
                  </span>
                  <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} />
                    Avoid: {seasonal.worst_months?.map((m: number) => MONTHS[m - 1]).join(', ')}
                  </span>
                </div>
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Card>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>SELLER INSIGHT</div>
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.75)' }}>
                    Best month: <span style={{ color: '#10b981', fontWeight: 700 }}>{MONTHS[(seasonal.best_months?.[0] || 1) - 1]}</span>.{' '}
                    Annual avg DOM: <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round(seasonal.annual_avg_dom)}d</span>.{' '}
                    Annual avg STL: <span style={{ color: '#fff', fontWeight: 700 }}>{seasonal.annual_avg_stl?.toFixed(1)}%</span>.
                  </div>
                </Card>
                <Card>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>BUYER INSIGHT</div>
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.75)' }}>
                    Most negotiating power in <span style={{ color: '#f59e0b', fontWeight: 700 }}>{MONTHS[(seasonal.worst_months?.[0] || 1) - 1]}</span>.{' '}
                    STL drops to <span style={{ color: '#f59e0b', fontWeight: 700 }}>{seasonal.monthly_data?.find((m: any) => m.month === seasonal.worst_months?.[0])?.avg_stl?.toFixed(1)}%</span> in worst months.
                  </div>
                </Card>
              </div>
            </>
          ) : <EmptyState label="Seasonal data" />}
        </div>
      )}

      {/* ── TRENDS ── */}
      {tab === 'trends' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* PSF + DOM dual-axis */}
          {mergedTrend.length > 0 ? (
            <Card>
              <CardLabel>24-Month Price & Activity Trend</CardLabel>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Median PSF vs Avg DOM</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, marginBottom: 14 }}>
                <span style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 2, background: '#3b82f6', display: 'inline-block', borderRadius: 2 }} />PSF (left)</span>
                <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 2, background: '#f59e0b', display: 'inline-block', borderRadius: 2, borderStyle: 'dashed' }} />DOM (right)</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={mergedTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis yAxisId="psf" orientation="left" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} domain={['auto', 'auto']} />
                  <YAxis yAxisId="dom" orientation="right" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}d`} domain={['auto', 'auto']} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{label}{d?.partial ? ' (partial)' : ''}</div>
                        {d?.psf && <div style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>PSF: ${d.psf}</div>}
                        {d?.dom && <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>DOM: {d.dom}d</div>}
                        {d?.count && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{d.count} sales</div>}
                      </div>
                    )
                  }} />
                  <Line yAxisId="psf" type="monotone" dataKey="psf" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="PSF" connectNulls />
                  <Line yAxisId="dom" type="monotone" dataKey="dom" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" name="DOM" connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          ) : <EmptyState label="Price trend" />}

          {/* Volume trend */}
          {volumeTrendMonthly.length > 0 ? (
            <Card>
              <CardLabel>Monthly Transaction Volume</CardLabel>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Sales per Month (24mo)</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={volumeTrendMonthly} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#8b5cf6' }}>{payload[0].value} sales</div>
                      </div>
                    )
                  }} />
                  <Bar dataKey="value" name="Sales" radius={[3, 3, 0, 0]}>
                    {volumeTrendMonthly.map((m: any, i: number) => (
                      <Cell key={i} fill={m.partial ? 'rgba(139,92,246,0.4)' : '#8b5cf6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          ) : <EmptyState label="Volume trend" />}
        </div>
      )}

      {/* ── LEASE & YIELD ── */}
      {tab === 'lease' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {track === 'homes' ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                Switch to <button onClick={() => setTrack('condo')} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Condos</button> to view lease & yield data
              </div>
            </Card>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <MetricCard label="Median Lease" value={data?.median_lease_price ? `$${data.median_lease_price.toLocaleString()}/mo` : '—'} sub="90d leases" accent="#10b981" />
                <MetricCard label="Lease PSF" value={fmt(data?.median_lease_psf, '$', '/sqft', 2)} sub="per sqft/mo" accent="#6366f1" />
                <MetricCard label="Gross Yield" value={fmt(data?.gross_rental_yield_pct, '', '%', 2)} sub="annualized" accent="#f59e0b" />
                <MetricCard label="Price/Rent" value={fmt(data?.price_to_rent_ratio, '', 'x', 1)} sub="ratio" accent="#ec4899" />
              </div>

              {data?.median_lease_price == null && (
                <Card>
                  <EmptyState label="Insufficient lease transactions in this area (min 3 required)" />
                </Card>
              )}

              {/* Lease PSF trend */}
              {leaseTrendMonthly.length > 0 ? (
                <Card>
                  <CardLabel>24-Month Lease Trend</CardLabel>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Median Lease PSF per Month</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={leaseTrendMonthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                      <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} domain={['auto', 'auto']} />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0]?.payload
                        return (
                          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{label}{d?.partial ? ' (partial)' : ''}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>Lease PSF: ${d?.value}/sqft</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{d?.count} leases</div>
                          </div>
                        )
                      }} />
                      <Area type="monotone" dataKey="value" fill="rgba(16,185,129,0.08)" stroke="#10b981" strokeWidth={2.5} dot={false} name="Lease PSF" connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>
              ) : <EmptyState label="Lease trend" />}

              {/* Yield context */}
              {data?.gross_rental_yield_pct != null && (
                <Card>
                  <CardLabel>Yield Context</CardLabel>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Investment Return Profile</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Gross Rental Yield</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: data.gross_rental_yield_pct >= 5 ? '#10b981' : data.gross_rental_yield_pct >= 4 ? '#f59e0b' : '#ef4444' }}>{data.gross_rental_yield_pct}%</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
                        {data.gross_rental_yield_pct >= 5 ? 'Above average — strong rental market' : data.gross_rental_yield_pct >= 4 ? 'Average GTA yield range' : 'Below average — price-heavy market'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Price-to-Rent Ratio</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: '#ec4899' }}>{data.price_to_rent_ratio}x</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>Annual rent × {data.price_to_rent_ratio}x = purchase price</div>
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── RANKINGS ── */}
      {tab === 'rankings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {topResults.length > 0 ? (
            <Card>
              <CardLabel>Within {geoName}</CardLabel>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Best Value Communities (PSF)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topResults.map((r: any, i: number) => {
                  const maxPsf = topResults[0]?.median_psf || 1
                  const colors = ['#3b82f6','#6366f1','#8b5cf6','#a78bfa','#c4b5fd']
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: i === 0 ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: i === 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: colors[i] }}>{fmt(r.median_psf, '$')}/sqft</span>
                        </div>
                        <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${(r.median_psf / maxPsf) * 100}%`, height: '100%', background: colors[i], borderRadius: 3 }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          ) : <EmptyState label="Rankings" />}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {rankingTypes.map((rt, i) => {
              const rData = rankings.find(r => r.ranking_type === rt && r.track === track)
              const top = rData?.results?.[0]
              const colors = ['#10b981','#f59e0b','#6366f1','#ec4899']
              return (
                <Card key={rt}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 8 }}>{rankingLabels[rt]}</div>
                  {top ? (
                    <>
                      <div style={{ fontSize: 16, fontWeight: 800, color: colors[i], marginBottom: 3 }}>{top.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                        {rt === 'fastest_selling' && top.avg_dom != null ? `${Math.round(top.avg_dom)} avg DOM` :
                         rt === 'best_yield' && top.gross_rental_yield_pct != null ? `${top.gross_rental_yield_pct}% yield` :
                         rt === 'best_concession_opportunity' && top.avg_concession_pct != null ? `${top.avg_concession_pct}% below ask` :
                         top.median_psf != null ? `$${top.median_psf}/sqft` : ''}
                      </div>
                    </>
                  ) : <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Populating…</div>}
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}