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
  media (id, media_url, variant_type, order_number, preferred_photo_yn)
`

const CONDO_SUBTYPES = ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
  'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment']

const HOME_SUBTYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse',
  'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']

interface AreaData { id: string; name: string; slug: string }
interface AreaPageProps { area: AreaData }

export async function generateAreaMetadata(area: AreaData) {
  // W-MARKETING A-UNIT-1b (2026-07-01): fixed fallback from 'www.condoleads.ca'
  // to raw request host (self-canonical). Previous fallback would emit
  // `https://www.condoleads.ca/${slug}` when tenant lookup failed on aily,
  // telling Google aily pages canonicalize to condoleads — the exact
  // duplicate-content leak UNIT 56 flagged. Fix: fall back to the SERVING
  // host (never a different domain). Delegated to resolveCanonicalHost
  // so the same fallback rule applies to every page-type canonical.
  // A-UNIT-3 (2026-07-06): brand suffix + openGraph + Twitter card,
  // tenant-derived.
  const { resolveCanonicalHost } = await import('@/lib/utils/canonical')
  const { getTenantByHost } = await import('@/lib/utils/tenant-brand')
  const { headers } = await import('next/headers')
  const { createClient } = await import('@/lib/supabase/server')
  const canonicalDomain = await resolveCanonicalHost()
  const brandTenant = await getTenantByHost(createClient(), headers().get('host') || '')
  const brandSuffix = brandTenant?.name ? ` | ${brandTenant.name}` : ''
  const title = `${area.name} Real Estate | Condos & Homes for Sale${brandSuffix}`
  const description = `Browse condos and homes for sale in ${area.name}. Explore municipalities, communities, and condo buildings.`
  const url = `https://${canonicalDomain}/${area.slug}`
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
      // A-UNIT-3 EXTENSION (2026-07-06): og:image via tenant-aware /og.
      images: [{ url: `https://${canonicalDomain}/og`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`https://${canonicalDomain}/og`],
    },
  }
}

const getAreaData = unstable_cache(
  async (areaId: string) => {
    const supabase = createClient()
    const geoFilter = { column: 'area_id' as const, value: areaId }

    const { data: municipalitiesData } = await supabase
      .from('municipalities')
      .select('id, name, slug')
      .eq('area_id', areaId)
      .order('name')

    const municipalities = municipalitiesData || []
    const muniIds = municipalities.map(m => m.id)

    let communityIds: string[] = []
    if (muniIds.length > 0) {
      const { data: comms } = await supabase
        .from('communities')
        .select('id')
        .in('municipality_id', muniIds)
        .limit(10000)
      communityIds = (comms || []).map(c => c.id)
    }

    const [
      buildingCountResult,
      initialListingsResult,
      forSaleCount,
      forLeaseCount,
      soldCount,
      leasedCount,
      allAreasResult,
      homeForSaleCount,
      homeForLeaseCount,
      condoForSaleCount,
      condoForLeaseCount,
      // W-HOME-AND-NEIGHBOURHOOD Fix 2 part-2 (2026-06-02): split-type sold/leased.
      homeSoldCount,
      homeLeasedCount,
      condoSoldCount,
      condoLeasedCount,
    ] = await Promise.all([
      communityIds.length > 0
        ? supabase.from('buildings').select('id', { count: 'exact', head: true }).in('community_id', communityIds)
        : Promise.resolve({ count: 0 }),
      supabase.from('mls_listings').select(LISTING_SELECT)
        .eq(geoFilter.column, geoFilter.value)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .order('list_price', { ascending: false })
        .limit(24),
      // W-GEO-COUNT-FIX-2 (2026-06-02): Active counts via pg-direct.
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
        transaction_type: 'For Sale',
        available_in_vow: true,
      }),
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
        transaction_type: 'For Lease',
        available_in_vow: true,
      }),
      // W-GEO-COUNT-FIX (2026-06-02): Closed counts via pg-direct (see lib/db/pg.ts).
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status: 'Closed',
        transaction_type: 'For Sale',
        available_in_vow: true,
      }),
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status: 'Closed',
        transaction_type: 'For Lease',
        available_in_vow: true,
      }),
      supabase.from('treb_areas').select('id, name, slug').order('name'),
      // W-GEO-COUNT-FIX-2 (2026-06-02): split-type Active counts via pg-direct.
      // homeCounts
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
        transaction_type: 'For Sale',
        available_in_vow: true,
        property_subtype_in: HOME_SUBTYPES,
      }),
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
        transaction_type: 'For Lease',
        available_in_vow: true,
        property_subtype_in: HOME_SUBTYPES,
      }),
      // condoCounts
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
        transaction_type: 'For Sale',
        available_in_vow: true,
        property_subtype_in: CONDO_SUBTYPES,
      }),
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
        transaction_type: 'For Lease',
        available_in_vow: true,
        property_subtype_in: CONDO_SUBTYPES,
      }),
      // W-GEO-COUNT-FIX (2026-06-02): split-type Closed counts via pg-direct
      // (same threshold concern as main sold/leased; see lib/db/pg.ts).
      // home Sold
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status: 'Closed',
        transaction_type: 'For Sale',
        available_in_vow: true,
        property_subtype_in: HOME_SUBTYPES,
      }),
      // home Leased
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status: 'Closed',
        transaction_type: 'For Lease',
        available_in_vow: true,
        property_subtype_in: HOME_SUBTYPES,
      }),
      // condo Sold
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status: 'Closed',
        transaction_type: 'For Sale',
        available_in_vow: true,
        property_subtype_in: CONDO_SUBTYPES,
      }),
      // condo Leased
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status: 'Closed',
        transaction_type: 'For Lease',
        available_in_vow: true,
        property_subtype_in: CONDO_SUBTYPES,
      }),
    ])

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

    const homeCounts = {
      forSale: homeForSaleCount,
      forLease: homeForLeaseCount,
      sold: homeSoldCount,
      leased: homeLeasedCount,
    }

    const condoCounts = {
      forSale: condoForSaleCount,
      forLease: condoForLeaseCount,
      sold: condoSoldCount,
      leased: condoLeasedCount,
    }

    const buildingCount = (buildingCountResult as any)?.count || 0
    const allAreas = (allAreasResult.data || []).map(a => ({ name: a.name, slug: a.slug }))
    const municipalityLinks = municipalities.map(m => ({ name: m.name, slug: m.slug }))

    return { initialListings, counts, homeCounts, condoCounts, buildingCount, allAreas, municipalityLinks, municipalities }
  },
  ['area-data'],
  { revalidate: 300, tags: ['area'] }
)

export default async function AreaPage({ area }: AreaPageProps) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const { getCurrentTenantId, isHeroTenant, resolveAgentForContext } = await import('@/lib/utils/tenant-resolver')
  // W-GEO-COUNT-FIX (2026-06-02): graceful degrade outside the cache boundary.
  // unstable_cache does not cache rejected promises (Next.js skips caching
  // on rejection), so a thrown pg-direct timeout is retried on the next
  // request rather than serving a stale 0.
  const dataPromise = getAreaData(area.id).catch((err) => {
    console.error('[AreaPage] data fetch failed:', err)
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
  // W-AILY-ESTIMATOR-GAP (2026-06-22): resolve agent for ANY tenantId
  // (see MunicipalityPage for full rationale).
  let resolvedAgentId: string | null = null
  if (tenantId) {
    resolvedAgentId = await resolveAgentForContext({ area_id: area.id, tenant_id: tenantId })
  }
  const { initialListings, counts, homeCounts, condoCounts, buildingCount, allAreas, municipalityLinks, municipalities } = data

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

  // A-UNIT-2 Phase 2 (2026-07-04): breadcrumb + Place JSON-LD. Area is the
  // top of the geo hierarchy (no containedInPlace parent).
  const _domain = await resolveCanonicalHost()
  const _areaUrl = `https://${_domain}/${area.slug}`

  return (
    <div className="min-h-screen bg-white">
      <BreadcrumbSchema
        items={[{ name: area.name, url: _areaUrl }]}
        homeUrl={`https://${_domain}/`}
      />
      <PlaceSchema
        place={{
          type: 'AdministrativeArea',
          name: area.name,
          url: _areaUrl,
        }}
      />
      <GeoHero
        assistantName={assistantName}
        title={`${area.name} Real Estate`}
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: area.name, href: '#' },
        ]}
        stats={{
          active: counts.forSale + counts.forLease,
          sold: counts.sold,
          leased: counts.leased,
          buildings: buildingCount,
          municipalities: municipalities.length,
        }}
        geoType="area"
      />
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* W-MARKETING A-UNIT-4a (2026-07-02): SSR market panel (SEO-visible). */}
        <GeoMarketActivity geoType="area" geoId={area.id} geoName={area.name} />

        <div className="mt-8">
          <GeoPageTabs
            geoType="area"
            geoId={area.id}
            agentId={tenantId ? (resolvedAgentId || '') : (agent?.id || '')}
            tenantId={tenantId ? (tenantId || '') : (agent?.tenant_id || '')}
            buildingCount={buildingCount}
            initialListings={initialListings}
            initialTotal={counts.forSale}
            counts={counts}
            homeCounts={homeCounts}
            condoCounts={condoCounts}
            buildingsTitle="Buildings"
          />
        </div>

        {isHero && (
          <div className="mt-8 grid md:grid-cols-2 gap-6">
            <WalliamAgentCard
              area_id={area.id}
              tenant_id={tenantId!}
            />
            <WalliamCTA context={area.name} assistantName={assistantName} brandName={brandName} wordmarkStyle={wordmarkStyle} />
            <CharliePageContext area_id={area.id} area_slug={area.slug} />
          </div>
        )}

        <GeoInterlinking
          title={`Municipalities in ${area.name}`}
          links={municipalityLinks}
        />

        <AnalyticsSection
          geoType="area"
          geoId={area.id}
          geoName={area.name}
        />
        <GeoSEOContent
          geoName={area.name}
          geoType="area"
          buildingCount={buildingCount}
          counts={counts}
        />

        <GeoInterlinking
          title="Explore All Areas"
          links={allAreas}
          currentSlug={area.slug}
        />
      </div>
    </div>
  )
}