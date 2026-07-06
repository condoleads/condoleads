import { headers } from 'next/headers'
import { createClient as createTenantClient } from '@/lib/supabase/server'
import { getTenantByHost } from '@/lib/utils/tenant-brand'
import { createClient } from '@/lib/supabase/server'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import { unstable_cache } from 'next/cache'
import { countDirect } from '@/lib/db/pg'
import GeoPageTabs from './components/GeoPageTabs'
import GeoSEOContent from './components/GeoSEOContent'
import GeoInterlinking from './components/GeoInterlinking'
import CommunityCard from './components/CommunityCard'
import GeoHero from './components/GeoHero'
import AnalyticsSection from '@/components/analytics/AnalyticsSection'
import GeoMarketActivity from '@/components/geo/GeoMarketActivity'
import WalliamCTA from '@/components/WalliamCTA'
import CharliePageContext from '@/components/CharliePageContext'
import WalliamAgentCard from '@/components/WalliamAgentCard'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import PlaceSchema from '@/components/PlaceSchema'
import { resolveCanonicalHost } from '@/lib/utils/canonical'

const LISTING_SELECT = `
  id, building_id, community_id, municipality_id, listing_id, listing_key, standard_status, transaction_type,
  list_price, close_price, close_date, unit_number, unparsed_address,
  bedrooms_total, bathrooms_total_integer, property_type, property_subtype,
  living_area_range, square_foot_source, parking_total, locker,
  association_fee, tax_annual_amount, tax_year, days_on_market, listing_contract_date,
  building_area_total,
  lot_width, lot_depth, lot_size_dimensions, lot_size_area, lot_size_area_units,
  frontage_length, basement, garage_type, garage_yn, approximate_age,
  legal_stories, architectural_style, cooling, pool_features, fireplace_yn,
  media (id, media_url, variant_type, order_number, preferred_photo_yn)
`

interface MunicipalityData { id: string; name: string; slug: string; area_id: string }
interface MunicipalityPageProps { municipality: MunicipalityData }

export async function generateMunicipalityMetadata(municipality: MunicipalityData) {
  // W-MARKETING A-UNIT-1b (2026-07-01): add self-canonical (was absent per
  // UNIT 61 R2). Uses shared resolver — fallback is raw request host
  // (self-canonical, never a different domain).
  // A-UNIT-3 (2026-07-06): brand suffix + openGraph + Twitter card,
  // tenant-derived.
  const { resolveCanonicalHost } = await import('@/lib/utils/canonical')
  const { getTenantByHost } = await import('@/lib/utils/tenant-brand')
  const { headers } = await import('next/headers')
  const { createClient } = await import('@/lib/supabase/server')
  const canonicalDomain = await resolveCanonicalHost()
  const brandTenant = await getTenantByHost(createClient(), headers().get('host') || '')
  const brandSuffix = brandTenant?.name ? ` | ${brandTenant.name}` : ''
  const title = `${municipality.name} Real Estate | Condos & Homes for Sale${brandSuffix}`
  const description = `Browse condos and homes for sale in ${municipality.name}. Explore communities, condo buildings, and market intelligence.`
  const url = `https://${canonicalDomain}/${municipality.slug}`
  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: brandTenant?.name || undefined,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

const getMunicipalityData = unstable_cache(
  async (municipalityId: string, areaId: string) => {
    const supabase = createClient()
    const geoFilter = { column: 'municipality_id' as const, value: municipalityId }
    const [
      areaResult,
      communitiesResult,
      buildingCountResult,
      initialListingsResult,
      forSaleCount,
      forLeaseCount,
      soldCount,
      leasedCount,
      siblingMunicipalitiesResult,
    ] = await Promise.all([
    supabase.from('treb_areas').select('id, name, slug').eq('id', areaId).single(),
    supabase.from('communities').select('id, name, slug').eq('municipality_id', municipalityId).order('name'),
    // FIX: flattened — still two steps but second is a single query, not chained
    supabase.from('communities').select('id').eq('municipality_id', municipalityId).then(async (res) => {
      const ids = (res.data || []).map(c => c.id)
      if (!ids.length) return { count: 0 }
      const { count } = await supabase
        .from('buildings')
        .select('id', { count: 'exact', head: true })
        .in('community_id', ids)
      return { count: count || 0 }
    }),
    // FIX: available_in_idx → available_in_vow
    supabase.from('mls_listings').select(LISTING_SELECT)
      .eq(geoFilter.column, geoFilter.value)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Sale')
      .order('list_price', { ascending: false })
      .limit(24),
    // FIX: available_in_idx → available_in_vow
    // W-GEO-COUNT-FIX-2 (2026-06-02): Active counts via pg-direct.
    countDirect({
      geo: { kind: 'municipality_id', value: municipalityId },
      standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
      transaction_type: 'For Sale',
      available_in_vow: true,
    }),
    countDirect({
      geo: { kind: 'municipality_id', value: municipalityId },
      standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
      transaction_type: 'For Lease',
      available_in_vow: true,
    }),
    // W-GEO-COUNT-FIX (2026-06-02): Closed counts via pg-direct (see lib/db/pg.ts).
    countDirect({
      geo: { kind: 'municipality_id', value: municipalityId },
      standard_status: 'Closed',
      transaction_type: 'For Sale',
      available_in_vow: true,
    }),
    countDirect({
      geo: { kind: 'municipality_id', value: municipalityId },
      standard_status: 'Closed',
      transaction_type: 'For Lease',
      available_in_vow: true,
    }),
    supabase.from('municipalities').select('id, name, slug').eq('area_id', areaId).order('name'),
  ])
  const area = areaResult.data
  const communities = communitiesResult.data || []
  const initialListings = (initialListingsResult.data || []).map((l: any) => ({
    ...l,
    media: (l.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number || 999) - (b.order_number || 999))
      .slice(0, 1),
  }))

  const counts = {
    forSale: forSaleCount,
    forLease: forLeaseCount,
    sold: soldCount,
    leased: leasedCount,
  }

  const buildingCount = (buildingCountResult as any)?.count || 0

  // FIX: community enrichment uses count queries only — no row fetching
  // FIX: add .limit(10000) to prevent silent PostgREST 1000-row truncation
  const communityIds = communities.map(c => c.id)
  let communityCounts: Record<string, { forSale: number; forLease: number; buildingCount: number }> = {}

  if (communityIds.length > 0) {
    const [saleResult, leaseResult, buildingResult] = await Promise.all([
      supabase.from('mls_listings')
        .select('community_id')
        .in('community_id', communityIds)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .limit(10000),
      supabase.from('mls_listings')
        .select('community_id')
        .in('community_id', communityIds)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Lease')
        .limit(10000),
      supabase.from('buildings')
        .select('community_id')
        .in('community_id', communityIds)
        .limit(10000),
    ])

    for (const id of communityIds) {
      communityCounts[id] = {
        forSale: (saleResult.data || []).filter(l => l.community_id === id).length,
        forLease: (leaseResult.data || []).filter(l => l.community_id === id).length,
        buildingCount: (buildingResult.data || []).filter(b => b.community_id === id).length,
      }
    }
  }

  const enrichedCommunities = communities.map(c => ({
    ...c,
    forSale: communityCounts[c.id]?.forSale || 0,
    forLease: communityCounts[c.id]?.forLease || 0,
    buildingCount: communityCounts[c.id]?.buildingCount || 0,
  }))

  const siblingMunicipalities = (siblingMunicipalitiesResult.data || []).map(m => ({
    name: m.name,
    slug: m.slug,
  }))

  return { area, communities, buildingCount, initialListings, counts, enrichedCommunities, siblingMunicipalities }
  },
  ['municipality-data'],
  { revalidate: 300, tags: ['municipality'] }
)

export default async function MunicipalityPage({ municipality }: MunicipalityPageProps) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const { getCurrentTenantId, isHeroTenant, resolveAgentForContext } = await import('@/lib/utils/tenant-resolver')
  // W-GEO-COUNT-FIX (2026-06-02): graceful degrade outside the cache boundary.
  const dataPromise = getMunicipalityData(municipality.id, municipality.area_id).catch((err) => {
    console.error('[MunicipalityPage] data fetch failed:', err)
    return null
  })
  const [dataMaybe, agent, tenantId] = await Promise.all([
    dataPromise,
    getAgentFromHost(host),
    getCurrentTenantId(),
  ])
  if (dataMaybe === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Counts temporarily unavailable</h1>
          <p className="text-gray-600">Please refresh in a moment.</p>
        </div>
      </div>
    )
  }
  const data = dataMaybe
  const isHero = await isHeroTenant()
  // W-AILY-ESTIMATOR-GAP (2026-06-22): resolve agent for ANY tenantId, not
  // gated on hero. Aily (isHero=false) previously fell back to
  // getAgentFromHost(host) -> null -> 'Agent ID required' on the estimator.
  // System 1 path (tenantId === null) preserved by the else branch below.
  let resolvedAgentId: string | null = null
  if (tenantId) {
    resolvedAgentId = await resolveAgentForContext({ municipality_id: municipality.id, tenant_id: tenantId })
  }
  const { area, communities, buildingCount, initialListings, counts, enrichedCommunities, siblingMunicipalities } = data
  const areaHref = area ? '/' + area.slug : '#'

  // C8a/D13 -- tenant for assistantName threading
  const _c8a_host = headers().get('host')
  const _c8a_supabase = createTenantClient()
  const _c8a_tenant = await getTenantByHost(_c8a_supabase, _c8a_host)
  const assistantName = _c8a_tenant?.name || 'Charlie'
  // W-AILY-CTA-BRAND-LEAK (2026-06-23): brandName + wordmarkStyle for per-tenant
  // WalliamCTA wordmark. Geo callsite is still {isHero && (...)}-gated today
  // (so wordmarkStyle === 'hero' for the only tenant that hits this), but
  // threading the values now keeps the contract honest for future unguard.
  const brandName     = _c8a_tenant?.brandName     || 'Brand'
  const wordmarkStyle = _c8a_tenant?.wordmarkStyle || 'standard'

  // A-UNIT-2 Phase 2 (2026-07-04): Home > Area > Muni breadcrumb + City
  // Place schema. Both area + muni are already in scope (area fetched
  // via municipalityResult chain in the parallel batch).
  const _domain = await resolveCanonicalHost()
  const _muniUrl = `https://${_domain}/${municipality.slug}`
  const _areaUrl = area?.slug ? `https://${_domain}/${area.slug}` : null
  const _bcItems = [] as { name: string; url: string }[]
  if (area?.name && _areaUrl) _bcItems.push({ name: area.name, url: _areaUrl })
  _bcItems.push({ name: municipality.name, url: _muniUrl })

  return (
    <div className="min-h-screen bg-white">
      <BreadcrumbSchema
        items={_bcItems}
        homeUrl={`https://${_domain}/`}
      />
      <PlaceSchema
        place={{
          type: 'City',
          name: municipality.name,
          url: _muniUrl,
          containedInPlace: area?.name && _areaUrl ? {
            type: 'AdministrativeArea',
            name: area.name,
            url: _areaUrl,
          } : null,
        }}
      />
      <GeoHero
        assistantName={assistantName}
        title={`${municipality.name} Real Estate`}
        subtitle={area ? `${area.name} Region` : undefined}
        breadcrumbs={[
          { label: 'Home', href: '/' },
          ...(area ? [{ label: area.name, href: areaHref }] : []),
          { label: municipality.name, href: '#' },
        ]}
        stats={{
          active: counts.forSale + counts.forLease,
          sold: counts.sold,
          leased: counts.leased,
          buildings: buildingCount,
          communities: enrichedCommunities.length,
        }}
        geoType="municipality"
      />
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* W-MARKETING A-UNIT-4a (2026-07-02): SSR market panel (SEO-visible). */}
        <GeoMarketActivity geoType="municipality" geoId={municipality.id} geoName={municipality.name} />

        <div className="mt-8">
          <GeoPageTabs
            geoType="municipality"
            geoId={municipality.id}
            agentId={tenantId ? (resolvedAgentId || '') : (agent?.id || '')}
            tenantId={tenantId ? (tenantId || '') : (agent?.tenant_id || '')}
            buildingCount={buildingCount}
            initialListings={initialListings}
            initialTotal={counts.forSale}
            counts={counts}
            buildingsTitle="Buildings"
          />
        </div>

        {isHero && (
          <div className="mt-8 grid md:grid-cols-2 gap-6">
            <WalliamAgentCard
              municipality_id={municipality.id}
              area_id={municipality.area_id}
              tenant_id={tenantId!}
            />
            <WalliamCTA context={municipality.name} assistantName={assistantName} brandName={brandName} wordmarkStyle={wordmarkStyle} />
            <CharliePageContext municipality_id={municipality.id} municipality_slug={municipality.slug} area_id={municipality.area_id} />
          </div>
        )}

        {enrichedCommunities.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-semibold mb-4">Communities in {municipality.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {enrichedCommunities.map((c) => (
                <CommunityCard key={c.id} community={c} />
              ))}
            </div>
          </div>
        )}

        <AnalyticsSection
          geoType="municipality"
          geoId={municipality.id}
          geoName={municipality.name}
          parentGeoType="area"
          parentGeoId={municipality.area_id}
        />
        <GeoSEOContent
          geoName={municipality.name}
          geoType="municipality"
          parentName={area?.name}
          buildingCount={buildingCount}
          counts={counts}
        />

        <GeoInterlinking
          title={`Other Areas in ${area?.name || 'the region'}`}
          links={siblingMunicipalities}
          currentSlug={municipality.slug}
        />
      </div>
    </div>
  )
}