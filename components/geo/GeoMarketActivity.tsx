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
//
// W-MARKETING A-UNIT-4c (2026-07-03) — extended with 7 insight_* JSONB blocks
// rendered LITERALLY beneath the stat grid (no interpretation, no fabricated
// meaning, every % adjacent to its raw count, proxy fields labeled "estimated").
// Per-field null gate: a field renders only if non-null. Per-block absence:
// if a JSONB column is null on the row → block is absent (not empty-state).
// insight_value_migration is gated to geoType IN ('building','community')
// per verified coverage.

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
  // A-UNIT-4c: JSONB insight blocks (structures verified this session)
  insight_investor_ratio:    InvestorRatio    | null
  insight_price_reduction:   PriceReduction   | null
  insight_reentry:           Reentry          | null
  insight_seasonal:          Seasonal         | null
  insight_concession_matrix: ConcessionMatrix | null
  insight_demand_mismatch:   DemandMismatch   | null
  insight_value_migration:   ValueMigration   | null
}

// A-UNIT-4c JSONB shapes (verified this session against real DB rows)
interface InvestorRatio {
  investor_proxy_pct?: number | null   // PROXY — label "estimated"
  end_user_pct?: number | null         // PROXY — label "estimated"
  sale_count_90?: number | null
  lease_count_90?: number | null
  active_lease_count?: number | null
}
interface PriceReductionTrendPoint {
  month: string
  volume: number | null
  avg_reduction_amt: number | null
  reduction_rate_pct: number | null
}
interface PriceReduction {
  rate_pct_90d?: number | null
  avg_reduction_amt_90d?: number | null
  avg_reduction_pct_90d?: number | null
  monthly_trend?: PriceReductionTrendPoint[] | null
}
interface Reentry {
  reentry_count?: number | null
  total_sold_12mo?: number | null   // may be omitted on some rows
  reentry_rate_pct?: number | null
  avg_price_change_amt?: number | null
  avg_price_change_pct?: number | null
}
interface SeasonalMonthly {
  month: number
  volume: number | null
  avg_dom: number | null
  avg_stl: number | null
  stl_vs_annual?: number | null
  dom_vs_annual_pct?: number | null
  volume_vs_annual_pct?: number | null
}
interface Seasonal {
  best_months?: number[] | null
  worst_months?: number[] | null
  sample_size?: number | null
  current_month?: number | null
  current_month_rank?: number | null
  annual_avg_dom?: number | null
  annual_avg_stl?: number | null
  monthly_data?: SeasonalMonthly[] | null
}
interface ConcessionBucket {
  count?: number | null
  pct_at_ask?: number | null
  pct_over_ask?: number | null
  avg_premium_amt?: number | null
  avg_premium_pct?: number | null
  avg_concession_amt?: number | null
  avg_concession_pct?: number | null
  pct_with_concession?: number | null
}
type ConcessionMatrix = Record<string, ConcessionBucket>
interface DemandBucket {
  demand_pct?: number | null
  supply_pct?: number | null
  demand_count?: number | null
  supply_count?: number | null
  mismatch_pct?: number | null
}
interface DemandMismatch {
  breakdown?: Record<string, DemandBucket> | null
  total_active?: number | null
  total_sold_90?: number | null
}
interface ValueMigration {
  direction?: 'premium' | 'discount' | 'at_par' | string | null
  parent_geo_type?: string | null
  this_median_psf?: number | null
  parent_median_psf?: number | null
  index_vs_parent_pct?: number | null
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
    .select('track, median_sale_price, active_count, closed_sale_count_90, months_of_inventory, closed_avg_dom_90, sale_to_list_ratio, absorption_rate_pct, median_psf, avg_psf, psf_trend_pct, price_trend_monthly, calculated_at, insight_investor_ratio, insight_price_reduction, insight_reentry, insight_seasonal, insight_concession_matrix, insight_demand_mismatch, insight_value_migration')
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
            <TrackPanel key={t.track} row={t} geoType={geoType} />
          ))}
        </div>
      </div>
    </section>
  )
}

function TrackPanel({ row, geoType }: { row: TrackRow; geoType: Props['geoType'] }) {
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

      {/* A-UNIT-4c — insight blocks (literal-only, per-field gated, tenant-neutral) */}
      <InsightSection row={row} geoType={geoType} />
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

// ─── A-UNIT-4c — insight block rendering (literal-only, per-field gated) ───

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const BEDROOM_ORDER = ['studio', '1br', '2br', '3br', '4br']

function fmtPctRaw(n: number | null | undefined, digits = 2): string | null {
  if (n == null) return null
  return `${Number(n).toFixed(digits)}%`
}
function fmtIntRaw(n: number | null | undefined): string | null {
  if (n == null) return null
  return Number(n).toLocaleString('en-CA')
}
function fmtSignedPct(n: number | null | undefined, digits = 2): string | null {
  if (n == null) return null
  const v = Number(n)
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`
}
function fmtSignedDollar(n: number | null | undefined): string | null {
  if (n == null) return null
  const v = Number(n)
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  return `${sign}$${Math.round(abs).toLocaleString('en-CA')}`
}
function fmtDollarRaw(n: number | null | undefined): string | null {
  if (n == null) return null
  return `$${Math.round(Number(n)).toLocaleString('en-CA')}`
}
function monthName(m: number | null | undefined): string | null {
  if (m == null) return null
  const idx = Number(m) - 1
  if (idx < 0 || idx > 11) return null
  return MONTH_NAMES[idx]
}

// Section wrapper — mounted below the 6-metric grid inside each TrackPanel.
// Returns null when every insight column on the row is null (per-block absence,
// not empty-state — no fabricated "coming soon" text).
function InsightSection({ row, geoType }: { row: TrackRow; geoType: Props['geoType'] }) {
  const investor  = row.insight_investor_ratio
  const priceRed  = row.insight_price_reduction
  const reentry   = row.insight_reentry
  const seasonal  = row.insight_seasonal
  const concess   = row.insight_concession_matrix
  const demandMm  = row.insight_demand_mismatch
  const valueMig  = row.insight_value_migration

  // insight_value_migration: verified null at area/muni/nbhd — gate to building + community
  const valueMigEligible = geoType === 'building' || geoType === 'community'

  const investorEl  = investor  ? renderInvestor(investor)              : null
  const priceRedEl  = priceRed  ? renderPriceReduction(priceRed)        : null
  const reentryEl   = reentry   ? renderReentry(reentry)                : null
  const seasonalEl  = seasonal  ? renderSeasonal(seasonal)              : null
  const concessEl   = concess   ? renderConcession(concess)             : null
  const demandMmEl  = demandMm  ? renderDemandMismatch(demandMm)        : null
  const valueMigEl  = valueMigEligible && valueMig ? renderValueMigration(valueMig) : null

  if (!investorEl && !priceRedEl && !reentryEl && !seasonalEl && !concessEl && !demandMmEl && !valueMigEl) {
    return null
  }

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{
        fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
        color: 'rgba(110,231,183,0.6)', fontWeight: 700, marginBottom: 16,
      }}>
        Market Insights
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {investorEl}
        {priceRedEl}
        {reentryEl}
        {valueMigEl}
        {demandMmEl}
        {concessEl}
        {seasonalEl}
      </div>
    </div>
  )
}

function InsightBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 8,
      padding: 14,
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(255,255,255,0.85)' }}>
        {children}
      </div>
    </div>
  )
}

// 1. Investor ratio — PROXY, label "estimated". % always paired with raw counts.
function renderInvestor(v: InvestorRatio): JSX.Element | null {
  if (v.investor_proxy_pct == null && v.end_user_pct == null) return null
  const investor = fmtPctRaw(v.investor_proxy_pct, 2)
  const endUser  = fmtPctRaw(v.end_user_pct, 2)
  const sales    = fmtIntRaw(v.sale_count_90)
  const leases   = fmtIntRaw(v.lease_count_90)
  const counts: string[] = []
  if (sales)  counts.push(`${sales} sales`)
  if (leases) counts.push(`${leases} leases`)
  return (
    <InsightBlock title="Investor mix — estimated proxy (90d)">
      <div>
        {investor && <>Investor-proxy share: <strong>{investor}</strong></>}
        {investor && endUser && <> · </>}
        {endUser && <>End-user: <strong>{endUser}</strong></>}
        {counts.length > 0 && (
          <span style={{ opacity: 0.65 }}> (from {counts.join(', ')})</span>
        )}
      </div>
    </InsightBlock>
  )
}

// 2. Price reduction — avg_reduction_* rendered ONLY when non-null.
function renderPriceReduction(v: PriceReduction): JSX.Element | null {
  const rate = fmtPctRaw(v.rate_pct_90d, 2)
  const avgAmt = fmtDollarRaw(v.avg_reduction_amt_90d)
  const avgPct = fmtPctRaw(v.avg_reduction_pct_90d, 2)
  const trend = Array.isArray(v.monthly_trend) ? v.monthly_trend : []
  if (rate == null && avgAmt == null && avgPct == null && trend.length === 0) return null
  return (
    <InsightBlock title="Price reductions (90d)">
      {rate != null && (
        <div>Price-reduction rate: <strong>{rate}</strong></div>
      )}
      {(avgAmt || avgPct) && (
        <div style={{ marginTop: 4 }}>
          Avg reduction:{' '}
          {avgAmt && <strong>{avgAmt}</strong>}
          {avgAmt && avgPct && <> </>}
          {avgPct && <strong>({avgPct})</strong>}
        </div>
      )}
      {trend.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6,
          }}>
            Monthly reduction trend
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
            {trend.map((p, i) => {
              const rateStr = fmtPctRaw(p.reduction_rate_pct, 1)
              const volStr = fmtIntRaw(p.volume)
              const amtStr = fmtDollarRaw(p.avg_reduction_amt)
              return (
                <div key={p.month || i} style={{ fontSize: 11, opacity: 0.85 }}>
                  <span style={{ opacity: 0.6 }}>{p.month}:</span>{' '}
                  {rateStr && <strong>{rateStr}</strong>}
                  {volStr && <span style={{ opacity: 0.65 }}> ({volStr} listings)</span>}
                  {amtStr && <span style={{ opacity: 0.65 }}> · avg {amtStr}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </InsightBlock>
  )
}

// 3. Reentry — avg_price_change_* rendered ONLY when non-null.
// Denominator `total_sold_12mo` may be omitted on some rows (verified).
function renderReentry(v: Reentry): JSX.Element | null {
  if (v.reentry_count == null && v.reentry_rate_pct == null) return null
  const count    = fmtIntRaw(v.reentry_count)
  const total    = fmtIntRaw(v.total_sold_12mo)
  const rate     = fmtPctRaw(v.reentry_rate_pct, 2)
  const chgAmt   = fmtSignedDollar(v.avg_price_change_amt)
  const chgPct   = fmtSignedPct(v.avg_price_change_pct, 2)
  return (
    <InsightBlock title="Re-entries (past 12 months)">
      <div>
        {count && <>Re-entries: <strong>{count}</strong></>}
        {total && <> of {total} sold</>}
        {rate && <> · rate <strong>{rate}</strong></>}
      </div>
      {(chgAmt || chgPct) && v.reentry_count != null && v.reentry_count > 0 && (
        <div style={{ marginTop: 4 }}>
          Avg price change:{' '}
          {chgAmt && <strong>{chgAmt}</strong>}
          {chgAmt && chgPct && <> </>}
          {chgPct && <strong>({chgPct})</strong>}
        </div>
      )}
    </InsightBlock>
  )
}

// 4. Seasonal — best_months as names, monthly_data volume+figures per row.
function renderSeasonal(v: Seasonal): JSX.Element | null {
  const best = Array.isArray(v.best_months)
    ? v.best_months.map(monthName).filter(Boolean) as string[]
    : []
  const worst = Array.isArray(v.worst_months)
    ? v.worst_months.map(monthName).filter(Boolean) as string[]
    : []
  const avgDom = v.annual_avg_dom != null ? Number(v.annual_avg_dom).toFixed(1) : null
  const avgStl = fmtPctRaw(v.annual_avg_stl, 2)
  const sample = fmtIntRaw(v.sample_size)
  const monthly = Array.isArray(v.monthly_data) ? v.monthly_data : []

  if (best.length === 0 && worst.length === 0 && !avgDom && !avgStl && monthly.length === 0) return null

  return (
    <InsightBlock title="Seasonality (annual pattern)">
      {best.length > 0 && (
        <div>Historically strongest months: <strong>{best.join(', ')}</strong></div>
      )}
      {worst.length > 0 && (
        <div style={{ marginTop: 4 }}>
          Historically weakest months: <strong>{worst.join(', ')}</strong>
        </div>
      )}
      {(avgDom || avgStl) && (
        <div style={{ marginTop: 6, opacity: 0.85 }}>
          Annual averages:
          {avgDom && <> DOM <strong>{avgDom}d</strong></>}
          {avgDom && avgStl && <> · </>}
          {avgStl && <> sale-to-list <strong>{avgStl}</strong></>}
          {sample && <span style={{ opacity: 0.65 }}> (n={sample})</span>}
        </div>
      )}
      {monthly.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6,
          }}>
            Monthly detail
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
            {monthly.map((m, i) => {
              const name = monthName(m.month)
              const vol = fmtIntRaw(m.volume)
              const dom = m.avg_dom != null ? Number(m.avg_dom).toFixed(1) : null
              const stl = fmtPctRaw(m.avg_stl, 2)
              return (
                <div key={i} style={{ fontSize: 11, opacity: 0.85 }}>
                  <strong>{name || `M${m.month}`}</strong>
                  {vol && <span style={{ opacity: 0.7 }}> · {vol} sales</span>}
                  {dom && <span style={{ opacity: 0.7 }}> · DOM {dom}d</span>}
                  {stl && <span style={{ opacity: 0.7 }}> · STL {stl}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </InsightBlock>
  )
}

// 5. Concession matrix — per bedroom bucket, count ALWAYS shown adjacent to %.
function renderConcession(v: ConcessionMatrix): JSX.Element | null {
  const keys = Object.keys(v || {})
  if (keys.length === 0) return null
  const ordered = [
    ...BEDROOM_ORDER.filter(k => keys.includes(k)),
    ...keys.filter(k => !BEDROOM_ORDER.includes(k)),
  ]
  const rows = ordered.map(k => {
    const b = v[k] || {}
    const count = fmtIntRaw(b.count)
    const pctConc = fmtPctRaw(b.pct_with_concession, 2)
    const avgConc = fmtPctRaw(b.avg_concession_pct, 2)
    if (count == null && pctConc == null && avgConc == null) return null
    return { key: k, count, pctConc, avgConc }
  }).filter(Boolean) as Array<{ key: string; count: string | null; pctConc: string | null; avgConc: string | null }>
  if (rows.length === 0) return null
  return (
    <InsightBlock title="Concession pattern by unit type (90d)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(r => (
          <div key={r.key} style={{ fontSize: 12 }}>
            <strong style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.key}</strong>
            {r.count && <span style={{ opacity: 0.75 }}> ({r.count} sales)</span>}
            {r.pctConc && <> — <strong>{r.pctConc}</strong> closed with concessions</>}
            {r.avgConc && <>, avg <strong>{r.avgConc}</strong> below ask</>}
          </div>
        ))}
      </div>
    </InsightBlock>
  )
}

// 6. Demand-supply mismatch — per bedroom WITH raw counts always, mismatch_pct
// always shown alongside counts, never alone.
function renderDemandMismatch(v: DemandMismatch): JSX.Element | null {
  const breakdown = v.breakdown || {}
  const keys = Object.keys(breakdown)
  if (keys.length === 0) return null
  const ordered = [
    ...BEDROOM_ORDER.filter(k => keys.includes(k)),
    ...keys.filter(k => !BEDROOM_ORDER.includes(k)),
  ]
  const rows = ordered.map(k => {
    const b = breakdown[k] || {}
    const supplyCount = fmtIntRaw(b.supply_count)
    const demandCount = fmtIntRaw(b.demand_count)
    const mismatch    = fmtSignedPct(b.mismatch_pct, 2)
    if (supplyCount == null && demandCount == null && mismatch == null) return null
    return { key: k, supplyCount, demandCount, mismatch }
  }).filter(Boolean) as Array<{ key: string; supplyCount: string | null; demandCount: string | null; mismatch: string | null }>
  if (rows.length === 0) return null
  const totalActive = fmtIntRaw(v.total_active)
  const totalSold90 = fmtIntRaw(v.total_sold_90)
  return (
    <InsightBlock title="Supply vs demand by unit type (90d)">
      {(totalActive || totalSold90) && (
        <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 8 }}>
          Sample: {totalActive && <>{totalActive} active listings</>}
          {totalActive && totalSold90 && <> · </>}
          {totalSold90 && <>{totalSold90} sold (90d)</>}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(r => (
          <div key={r.key} style={{ fontSize: 12 }}>
            <strong style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.key}</strong>:{' '}
            {r.supplyCount && <>{r.supplyCount} active</>}
            {r.supplyCount && r.demandCount && <> / </>}
            {r.demandCount && <>{r.demandCount} sold</>}
            {r.mismatch && (
              <span style={{ opacity: 0.75 }}> · mismatch <strong>{r.mismatch}</strong></span>
            )}
          </div>
        ))}
      </div>
    </InsightBlock>
  )
}

// 7. Value migration — uses JSONB's own `direction` label. building+community only.
function renderValueMigration(v: ValueMigration): JSX.Element | null {
  const thisPsf   = fmtDollarRaw(v.this_median_psf)
  const parentPsf = fmtDollarRaw(v.parent_median_psf)
  const idx       = fmtSignedPct(v.index_vs_parent_pct, 2)
  const direction = v.direction && String(v.direction).length > 0 ? String(v.direction) : null
  const parentGeoType = v.parent_geo_type && String(v.parent_geo_type).length > 0 ? String(v.parent_geo_type) : null
  if (!thisPsf && !parentPsf && !idx && !direction) return null
  return (
    <InsightBlock title="Median PSF vs parent area">
      <div>
        {thisPsf && <>Median PSF: <strong>{thisPsf}</strong></>}
        {idx && (
          <>
            {' — '}
            <strong>{idx}</strong>
            {parentGeoType && <> vs {parentGeoType} avg</>}
            {parentPsf && <> (<strong>{parentPsf}</strong>)</>}
          </>
        )}
        {direction && (
          <span style={{ opacity: 0.7, marginLeft: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            [{direction}]
          </span>
        )}
      </div>
    </InsightBlock>
  )
}
