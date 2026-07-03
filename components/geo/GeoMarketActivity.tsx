// W-MARKETING A-UNIT-4a (2026-07-02) — server-rendered market data panel for
// geo landing pages (area / municipality / community / neighbourhood).
//
// Tenant-neutral: geo_analytics has NO tenant_id (verified via
// information_schema.columns — 69 cols, zero contain "tenant"). Same numbers
// on every tenant; branding/host flows through page chrome, not this panel.
//
// Data path (mirrors CondoMarketActivity UNIT 53 pattern — same client
// factory, same low_volume_flag=false Rule-Zero gate, same null-guards):
//   SELECT track, median_sale_price, active_count, closed_sale_count_90,
//          months_of_inventory, closed_avg_dom_90, sale_to_list_ratio,
//          absorption_rate_pct, median_psf, avg_psf, psf_trend_pct,
//          price_trend_monthly, calculated_at
//     FROM geo_analytics
//    WHERE geo_type = <prop>          -- 'area' | 'community' | 'municipality' | 'neighbourhood'
//      AND geo_id   = <prop>
//      AND period_type = 'rolling_12mo'
//      AND low_volume_flag = false     -- Rule Zero data-confidence gate
//      AND closed_sale_count_90 IS NOT NULL
//      AND median_sale_price     IS NOT NULL
//     -- NO .eq('track', ...) — return whichever tracks pass the gate
//
// Track rule (operator-locked): render whichever track has a usable row.
// Both tracks → stacked panels labeled "Condos" and "Homes" (in query
// return order). Neither → single empty-state paragraph.
//
// Track coverage varies by geo level (VERIFIED this session, low_volume_flag=false,
// rolling_12mo): community homes 78% vs condo 35%; muni homes 78% vs condo
// 38%. Sets barely overlap at community/muni — most usable geos are
// homes-only or condo-only, not both.
//
// Field-population VERIFIED this session on `low_volume_flag=false` geo rows:
// all 11 rendered fields are populated to real magnitudes (median $333K–$1.7M,
// active 13–2,537, sale-to-list 96.79–100.69%, absorption 8.99–30.77%,
// price_trend_monthly with 14–25 sparkline points).
//
// PSF (median_psf / avg_psf) is populated on condo-track geo rows only;
// homes-track geo rows have NULL PSF (VERIFIED). Component renders the PSF
// row only when non-null — no '–' placeholder for PSF; the row disappears.

import { createClient } from '@supabase/supabase-js'
import Sparkline from '@/components/home/Sparkline'

interface Props {
  // W-MARKETING A-UNIT-4b (2026-07-03): 'building' added — buildings share the
  // same geo_analytics query pattern + render shape. Buildings have condo track
  // only (0.3% homes-track usable), NULL PSF (existing MarketIntelligence owns
  // PSF via building_psf_summary — do NOT duplicate), and price_trend_monthly
  // with 0-1 points typically (Sparkline's MIN_POINTS=4 gate hides it).
  // Net effect: renders the 7-field summary (median headline + 6-metric grid).
  geoType: 'area' | 'community' | 'municipality' | 'neighbourhood' | 'building'
  geoId: string
  geoName: string  // for empty-state text + panel heading
}

interface TrendPoint { month: string; value: number; count?: number }

interface TrackRow {
  track: string  // 'condo' | 'homes'
  median_sale_price: number | null
  active_count: number | null
  closed_sale_count_90: number | null
  months_of_inventory: number | null
  closed_avg_dom_90: number | null
  sale_to_list_ratio: number | null
  absorption_rate_pct: number | null
  median_psf: number | null
  avg_psf: number | null
  psf_trend_pct: number | null
  price_trend_monthly: TrendPoint[] | null
  calculated_at: string | null
}

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ─── Formatters — return '–' on null so a mid-row null is honest, not fabricated
function fmtPrice(n: number | null): string {
  if (n == null) return '–'
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `$${m.toFixed(m >= 10 ? 1 : 2).replace(/\.?0+$/, '')}M`
  }
  return `$${Math.round(n / 1000)}K`
}
function fmtNumber(n: number | null): string {
  if (n == null) return '–'
  return n.toLocaleString('en-CA')
}
function fmtDecimal(n: number | null, digits = 1): string {
  if (n == null) return '–'
  return Number(n).toFixed(digits)
}
function fmtPct(n: number | null, digits = 1): string {
  if (n == null) return '–'
  return `${Number(n).toFixed(digits)}%`
}
function fmtUpdatedDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

const TRACK_LABEL: Record<string, string> = {
  condo: 'Condos',
  homes: 'Homes',
}

export default async function GeoMarketActivity({ geoType, geoId, geoName }: Props) {
  const supabase = createServiceClient()

  const { data: rows } = await supabase
    .from('geo_analytics')
    .select('track, median_sale_price, active_count, closed_sale_count_90, months_of_inventory, closed_avg_dom_90, sale_to_list_ratio, absorption_rate_pct, median_psf, avg_psf, psf_trend_pct, price_trend_monthly, calculated_at')
    .eq('geo_type', geoType)
    .eq('geo_id', geoId)
    .eq('period_type', 'rolling_12mo')
    .eq('low_volume_flag', false)
    .not('closed_sale_count_90', 'is', null)
    .not('median_sale_price', 'is', null)

  // Empty-state — operator-approved verbatim string. Zero fabricated numbers.
  if (!rows || rows.length === 0) {
    return (
      <section aria-label={`${geoName} Market Statistics`} style={{
        margin: '24px 0',
        padding: '32px 24px',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 12,
        background: '#fafbfc',
      }}>
        <p style={{
          fontSize: 14, color: '#64748b', textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          margin: 0, lineHeight: 1.5,
        }}>
          Market statistics for {geoName} will be published as transaction activity is recorded in this area.
        </p>
      </section>
    )
  }

  const tracks = rows as TrackRow[]
  const latestCalc = tracks.map(t => t.calculated_at).filter(Boolean).sort().slice(-1)[0] || null
  const updatedLabel = fmtUpdatedDate(latestCalc)

  return (
    <section aria-label={`${geoName} Market Statistics`} style={{
      background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
      padding: '32px 24px',
      borderRadius: 12,
      margin: '24px 0',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12, marginBottom: 24,
        }}>
          <h2 style={{
            fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0,
          }}>
            {geoName} Market
          </h2>
          {updatedLabel && (
            <div style={{
              fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(110,231,183,0.7)', fontWeight: 600,
            }}>
              Updated {updatedLabel}
            </div>
          )}
        </div>

        {/* Stacked track panels — both when both usable, one when one */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {tracks.map(t => (
            <TrackPanel key={t.track} row={t} />
          ))}
        </div>
      </div>
    </section>
  )
}

function TrackPanel({ row }: { row: TrackRow }) {
  const label = TRACK_LABEL[row.track] || row.track
  const psf = row.median_psf ?? row.avg_psf
  const trendPoints: TrendPoint[] = Array.isArray(row.price_trend_monthly) ? row.price_trend_monthly : []

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12,
      padding: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'rgba(110,231,183,0.85)', fontWeight: 700,
        }}>
          {label}
        </div>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      </div>

      {/* Headline row: median sale price + PSF (if non-null) + sparkline */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, marginBottom: 20, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4,
          }}>
            Median sale price
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>
            {fmtPrice(row.median_sale_price)}
          </div>
        </div>

        {psf != null && (
          <div>
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.4)',
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4,
            }}>
              Median PSF{row.psf_trend_pct != null && (
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 700,
                  color: row.psf_trend_pct >= 0 ? 'rgba(110,231,183,0.85)' : 'rgba(248,113,113,0.85)',
                }}>
                  {row.psf_trend_pct >= 0 ? '▲' : '▼'} {Math.abs(Number(row.psf_trend_pct)).toFixed(1)}%
                </span>
              )}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              ${Number(psf).toFixed(0)}
            </div>
          </div>
        )}

        {trendPoints.length >= 4 && (
          <div style={{ flexShrink: 0 }}>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.4)',
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4,
            }}>
              Price trend
            </div>
            <Sparkline points={trendPoints} width={160} height={40} />
          </div>
        )}
      </div>

      {/* 6-metric grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
      }}>
        <Metric label="Sold last 90 days"    value={fmtNumber(row.closed_sale_count_90)} />
        <Metric label="Active listings"      value={fmtNumber(row.active_count)} />
        <Metric label="Months of inventory"  value={fmtDecimal(row.months_of_inventory, 1)} />
        <Metric label="Avg days on market"   value={fmtDecimal(row.closed_avg_dom_90, 0)} />
        <Metric label="Sale-to-list ratio"   value={fmtPct(row.sale_to_list_ratio, 2)} />
        <Metric label="Absorption rate"      value={fmtPct(row.absorption_rate_pct, 1)} />
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: 10, color: 'rgba(255,255,255,0.4)',
        letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}
