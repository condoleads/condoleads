// W-FEATURED-CONDOS UNIT 53 (2026-06-30) — "GTA Condo Market — Live Activity"
// section. Server component. Tenant-neutral data per UNIT 52 R6: geo_analytics
// has no tenant_id (shared MLS facts). Same featured list on every tenant;
// branding/host flows through links via middleware naturally.
//
// Data path (UNIT 52 R3/R4 confirmed cheap):
//   Buildings: geo_analytics WHERE geo_type='building' AND track='condo'
//     AND period_type='rolling_12mo' AND low_volume_flag=false
//     ORDER BY closed_sale_count_90 DESC NULLS LAST  (cost ~13ms)
//   Communities: same shape at geo_type='community'  (cost ~5ms)
//
// Data-confidence gate (Rule Zero):
//   - exclude null closed_sale_count_90 / median_sale_price
//   - exclude buildings without cover_photo_url (no fake fallback hero)
//   - empty-state -> render nothing (no broken empty box)

import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import Sparkline from './Sparkline'

const FEATURED_LIMIT = 12
const BUILDING_FETCH_OVERFETCH = 24  // overfetch then filter missing-photo to land ~12

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface TrendPoint { month: string; value: number; count?: number }

interface BuildingCard {
  slug: string
  name: string
  address: string | null
  photoUrl: string
  soldCount: number
  medianPrice: number
  activeCount: number | null
  priceTrend: TrendPoint[]
}

interface CommunityCard {
  slug: string
  name: string
  soldCount: number
  medianPrice: number
  activeCount: number | null
}

function fmtPrice(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `$${m.toFixed(m >= 10 ? 1 : 2).replace(/\.?0+$/, '')}M`
  }
  return `$${Math.round(n / 1000)}K`
}

async function fetchFeaturedBuildings(supabase: ReturnType<typeof createServiceClient>): Promise<{
  cards: BuildingCard[]
  calculatedAt: string | null
}> {
  const { data: gaRows } = await supabase
    .from('geo_analytics')
    .select('geo_id, closed_sale_count_90, median_sale_price, active_count, price_trend_monthly, calculated_at')
    .eq('geo_type', 'building')
    .eq('track', 'condo')
    .eq('period_type', 'rolling_12mo')
    .eq('low_volume_flag', false)
    .not('closed_sale_count_90', 'is', null)
    .not('median_sale_price', 'is', null)
    .order('closed_sale_count_90', { ascending: false, nullsFirst: false })
    .limit(BUILDING_FETCH_OVERFETCH)

  if (!gaRows?.length) return { cards: [], calculatedAt: null }

  const ids = gaRows.map(r => r.geo_id).filter(Boolean) as string[]
  const { data: bldRows } = await supabase
    .from('buildings')
    .select('id, slug, building_name, canonical_address, cover_photo_url')
    .in('id', ids)
    .not('cover_photo_url', 'is', null)

  const bldMap = new Map((bldRows ?? []).map(b => [b.id as string, b]))

  const cards: BuildingCard[] = []
  let latest: string | null = null
  for (const g of gaRows) {
    const b = bldMap.get(g.geo_id as string)
    if (!b || !b.cover_photo_url || !b.slug || !b.building_name) continue
    if (g.closed_sale_count_90 == null || g.median_sale_price == null) continue
    cards.push({
      slug: b.slug as string,
      name: b.building_name as string,
      address: (b.canonical_address as string) || null,
      photoUrl: b.cover_photo_url as string,
      soldCount: g.closed_sale_count_90 as number,
      medianPrice: g.median_sale_price as number,
      activeCount: (g.active_count as number) ?? null,
      priceTrend: Array.isArray(g.price_trend_monthly) ? (g.price_trend_monthly as TrendPoint[]) : [],
    })
    if (!latest || (g.calculated_at && g.calculated_at > latest)) latest = g.calculated_at as string
    if (cards.length >= FEATURED_LIMIT) break
  }

  return { cards, calculatedAt: latest }
}

async function fetchFeaturedCommunities(supabase: ReturnType<typeof createServiceClient>): Promise<{
  cards: CommunityCard[]
  calculatedAt: string | null
}> {
  const { data: gaRows } = await supabase
    .from('geo_analytics')
    .select('geo_id, closed_sale_count_90, median_sale_price, active_count, calculated_at')
    .eq('geo_type', 'community')
    .eq('track', 'condo')
    .eq('period_type', 'rolling_12mo')
    .eq('low_volume_flag', false)
    .not('closed_sale_count_90', 'is', null)
    .not('median_sale_price', 'is', null)
    .order('closed_sale_count_90', { ascending: false, nullsFirst: false })
    .limit(FEATURED_LIMIT)

  if (!gaRows?.length) return { cards: [], calculatedAt: null }

  const ids = gaRows.map(r => r.geo_id).filter(Boolean) as string[]
  const { data: comRows } = await supabase
    .from('communities')
    .select('id, slug, name')
    .in('id', ids)
    .eq('is_active', true)

  const comMap = new Map((comRows ?? []).map(c => [c.id as string, c]))
  const cards: CommunityCard[] = []
  let latest: string | null = null
  for (const g of gaRows) {
    const c = comMap.get(g.geo_id as string)
    if (!c || !c.slug || !c.name) continue
    if (g.closed_sale_count_90 == null || g.median_sale_price == null) continue
    cards.push({
      slug: c.slug as string,
      name: c.name as string,
      soldCount: g.closed_sale_count_90 as number,
      medianPrice: g.median_sale_price as number,
      activeCount: (g.active_count as number) ?? null,
    })
    if (!latest || (g.calculated_at && g.calculated_at > latest)) latest = g.calculated_at as string
  }

  return { cards, calculatedAt: latest }
}

function fmtUpdatedDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function CondoMarketActivity() {
  const supabase = createServiceClient()
  const [{ cards: buildings, calculatedAt: bldCalc }, { cards: communities, calculatedAt: comCalc }] =
    await Promise.all([fetchFeaturedBuildings(supabase), fetchFeaturedCommunities(supabase)])

  // Empty-state — graceful absence (no broken empty box).
  if (buildings.length === 0 && communities.length === 0) return null

  const latestCalc = [bldCalc, comCalc].filter(Boolean).sort().slice(-1)[0] || null
  const updatedLabel = fmtUpdatedDate(latestCalc)

  return (
    <section
      style={{
        background: 'linear-gradient(180deg, #060b18 0%, #0a1226 100%)',
        padding: '64px 24px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
      aria-label="GTA Condo Market Live Activity"
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <h2 style={{
            fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em',
            margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif',
          }}>
            GTA Condo Market<span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}> — Live Activity</span>
          </h2>
          {updatedLabel && (
            <div style={{
              fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'rgba(110,231,183,0.6)', fontWeight: 600,
            }}>
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: 6,
                background: 'rgba(110,231,183,0.7)', marginRight: 6, verticalAlign: 'middle',
              }} />
              Updated {updatedLabel}
            </div>
          )}
        </div>
        <p style={{
          fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '0 0 36px',
          fontFamily: 'system-ui, sans-serif',
        }}>
          Most active buildings and communities by transactions in the last 90 days.
        </p>

        {/* Two-column grid: buildings (left, photo-led) + communities (right, text tiles) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 32 }}>
          {/* Buildings column */}
          {buildings.length > 0 && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
                color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
                marginBottom: 16,
              }}>
                Featured Buildings
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14,
              }}>
                {buildings.map(b => (
                  <Link
                    key={b.slug}
                    href={`/${b.slug}`}
                    style={{
                      position: 'relative', display: 'block',
                      borderRadius: 12, overflow: 'hidden',
                      background: '#0f172a',
                      border: '1px solid rgba(255,255,255,0.06)',
                      textDecoration: 'none', color: '#fff',
                      aspectRatio: '4 / 5',
                    }}
                  >
                    <img
                      src={b.photoUrl}
                      alt={b.name}
                      style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%',
                        objectFit: 'cover',
                      }}
                      loading="lazy"
                    />
                    {/* Gradient overlay for legibility */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(6,11,24,0.95) 100%)',
                    }} />
                    {/* Stat chip top-right */}
                    <div style={{
                      position: 'absolute', top: 10, right: 10,
                      background: 'rgba(6,11,24,0.7)', backdropFilter: 'blur(6px)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8, padding: '5px 9px',
                      fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.92)',
                      letterSpacing: '-0.005em',
                    }}>
                      {b.soldCount} sold / 90d
                    </div>
                    {/* Bottom content */}
                    <div style={{
                      position: 'absolute', left: 14, right: 14, bottom: 12,
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                        {b.name}
                      </div>
                      {b.address && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.3,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {b.address}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>
                          Median {fmtPrice(b.medianPrice)}
                        </div>
                        <Sparkline points={b.priceTrend} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Communities column */}
          {communities.length > 0 && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
                color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
                marginBottom: 16,
              }}>
                Most Active Communities
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12, overflow: 'hidden',
              }}>
                {communities.map((c, i) => (
                  <Link
                    key={c.slug}
                    href={`/${c.slug}`}
                    style={{
                      display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto',
                      alignItems: 'center', gap: 10,
                      padding: '12px 16px',
                      textDecoration: 'none',
                      borderBottom: i < communities.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}
                  >
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.92)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        letterSpacing: '-0.005em',
                      }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2,
                        fontVariantNumeric: 'tabular-nums' }}>
                        Median {fmtPrice(c.medianPrice)}{c.activeCount != null ? ` · ${c.activeCount.toLocaleString()} active` : ''}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 13, fontWeight: 800, color: 'rgba(110,231,183,0.85)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {c.soldCount}
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 500, marginLeft: 3 }}>/90d</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
