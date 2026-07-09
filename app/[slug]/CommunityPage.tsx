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
  lot_width, lot_depth, lot_size_dimensions, lot_size_area, lot_size_area_units,
  frontage_length, basement, garage_type, garage_yn, approximate_age,
  legal_stories, architectural_style, cooling, pool_features, fireplace_yn,
  media (id, media_url, variant_type, order_number, preferred_photo_yn)
`

interface CommunityData { id: string; name: string; slug: string; municipality_id: string }
interface CommunityPageProps { community: CommunityData }

export async function generateCommunityMetadata(community: CommunityData) {
  // W-MARKETING A-UNIT-1b (2026-07-01): add self-canonical (was absent per
  // UNIT 61 R2). Shared resolver — raw-host fallback, never cross-tenant.
  // A-UNIT-3 (2026-07-06): brand suffix + openGraph + Twitter card,
  // tenant-derived via the same helper the neighbourhood page uses.
  const { resolveCanonicalHost } = await import('@/lib/utils/canonical')
  const { getTenantByHost } = await import('@/lib/utils/tenant-brand')
  const { headers } = await import('next/headers')
  const { createClient } = await import('@/lib/supabase/server')
  const canonicalDomain = await resolveCanonicalHost()
  const brandTenant = await getTenantByHost(createClient(), headers().get('host') || '')
  const brandSuffix = brandTenant?.name ? ` | ${brandTenant.name}` : ''
  const title = `${community.name} Real Estate | Condos & Homes for Sale${brandSuffix}`
  const description = `Browse condos and homes for sale in ${community.name}. View listings, condo buildings, market data, and price estimates.`
  const url = `https://${canonicalDomain}/${community.slug}`
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
      // A-UNIT-3 EXTENSION (2026-07-06): og:image via the tenant-aware /og
      // route (same source homepage uses). Reader gets a real image card.
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

const getCommunityData = unstable_cache(
  async (communityId: string, municipalityId: string) => {
    const supabase = createClient()
    const geoFilter = { column: 'community_id' as const, value: communityId }
    const [
      municipalityResult,
      buildingsResult,
      buildingsListResult,
      initialListingsResult,
      forSaleCount,
      forLeaseCount,
      soldCount,
      leasedCount,
      siblingCommunitiesResult,
    ] = await Promise.all([
    supabase.from('municipalities').select('id, name, slug, area_id').eq('id', municipalityId).single(),
    supabase.from('buildings').select('id', { count: 'exact', head: true }).eq('community_id', communityId),
    // LANE-B BUILD 2 (2026-07-09): crawlable buildings-in-community list.
    // Alphabetical, capped 24 (prevents link-dilution on high-density
    // communities like Waterfront). Real slugs from buildings table.
    // Silent-omit at render when array is empty.
    supabase.from('buildings').select('id, slug, building_name, canonical_address').eq('community_id', communityId).order('building_name').limit(24),
    // FIX: available_in_idx → available_in_vow
    supabase.from('mls_listings').select(LISTING_SELECT)
      .eq(geoFilter.column, geoFilter.value)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Sale')
      .order('list_price', { ascending: false })
      .limit(24),
    // W-GEO-COUNT-FIX-2 (2026-06-02): Active counts via pg-direct.
    countDirect({
      geo: { kind: 'community_id', value: communityId },
      standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
      transaction_type: 'For Sale',
      available_in_vow: true,
    }),
    countDirect({
      geo: { kind: 'community_id', value: communityId },
      standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
      transaction_type: 'For Lease',
      available_in_vow: true,
    }),
    // W-GEO-COUNT-FIX (2026-06-02): Closed counts via pg-direct (see lib/db/pg.ts).
    countDirect({
      geo: { kind: 'community_id', value: communityId },
      standard_status: 'Closed',
      transaction_type: 'For Sale',
      available_in_vow: true,
    }),
    countDirect({
      geo: { kind: 'community_id', value: communityId },
      standard_status: 'Closed',
      transaction_type: 'For Lease',
      available_in_vow: true,
    }),
    supabase.from('communities').select('id, name, slug').eq('municipality_id', municipalityId).order('name'),
  ])
  const municipality = municipalityResult.data
  const buildingCount = buildingsResult.count || 0
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

  const siblingCommunities = (siblingCommunitiesResult.data || []).map(c => ({
    name: c.name,
    slug: c.slug,
  }))
  const buildingsInCommunity = ((buildingsListResult as any)?.data || [])
    .filter((b: any) => b && b.slug && b.building_name)
    .map((b: any) => ({ slug: b.slug, name: b.building_name, address: b.canonical_address || null }))
  return { municipality, buildingCount, initialListings, counts, siblingCommunities, buildingsInCommunity }
  },
  ['community-data'],
  { revalidate: 300, tags: ['community'] }
)

export default async function CommunityPage({ community }: CommunityPageProps) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const { getCurrentTenantId, isHeroTenant, resolveAgentForContext } = await import('@/lib/utils/tenant-resolver')
  // W-GEO-COUNT-FIX (2026-06-02): graceful degrade outside the cache boundary.
  const dataPromise = getCommunityData(community.id, community.municipality_id).catch((err) => {
    console.error('[CommunityPage] data fetch failed:', err)
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
    resolvedAgentId = await resolveAgentForContext({ community_id: community.id, tenant_id: tenantId })
  }
  const { municipality, buildingCount, initialListings, counts, siblingCommunities, buildingsInCommunity } = data

  // FIX: area lookup moved inside Promise.all above isn't possible since we need municipality.area_id
  // but we avoid a second sequential await by checking early and running in parallel with siblings
  let area = null
  if (municipality?.area_id) {
    const supabase = createClient()
    const { data } = await supabase
      .from('treb_areas')
      .select('name, slug')
      .eq('id', municipality.area_id)
      .single()
    area = data
  }

  const areaHref = area ? '/' + area.slug : '#'
  const muniHref = municipality ? '/' + municipality.slug : '#'

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

  // A-UNIT-2 Phase 2 (2026-07-04): breadcrumb + Place JSON-LD.
  // area was already fetched conditionally at line 170; municipality was
  // fetched in the parallel batch. Drop levels whose slug/name is null.
  const _domain = await resolveCanonicalHost()
  const _communityUrl = `https://${_domain}/${community.slug}`
  const _muniUrl = municipality?.slug ? `https://${_domain}/${municipality.slug}` : null
  const _areaUrl = area?.slug ? `https://${_domain}/${area.slug}` : null
  const _bcItems = [] as { name: string; url: string }[]
  if (area?.name && _areaUrl) _bcItems.push({ name: area.name, url: _areaUrl })
  if (municipality?.name && _muniUrl) _bcItems.push({ name: municipality.name, url: _muniUrl })
  _bcItems.push({ name: community.name, url: _communityUrl })

  return (
    <div className="min-h-screen bg-white">
      <BreadcrumbSchema
        items={_bcItems}
        homeUrl={`https://${_domain}/`}
      />
      <PlaceSchema
        place={{
          type: 'Place',
          name: community.name,
          url: _communityUrl,
          containedInPlace: municipality?.name && _muniUrl ? {
            type: 'City',
            name: municipality.name,
            url: _muniUrl,
            containedInPlace: area?.name && _areaUrl ? {
              type: 'AdministrativeArea',
              name: area.name,
              url: _areaUrl,
            } : null,
          } : null,
        }}
      />
      <GeoHero
        assistantName={assistantName}
        title={`${community.name} Real Estate`}
        subtitle={municipality ? `${municipality.name}${area ? `, ${area.name}` : ""}` : undefined}
        breadcrumbs={[
          { label: "Home", href: "/" },
          ...(area ? [{ label: area.name, href: areaHref }] : []),
          ...(municipality ? [{ label: municipality.name, href: muniHref }] : []),
          { label: community.name, href: "#" },
        ]}
        stats={{
          active: counts.forSale + counts.forLease,
          sold: counts.sold,
          leased: counts.leased,
          buildings: buildingCount,
        }}
        geoType="community"
      />
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* W-MARKETING A-UNIT-4a (2026-07-02): SSR market panel (SEO-visible). */}
        <GeoMarketActivity geoType="community" geoId={community.id} geoName={community.name} />

        <div className="mt-8">
          <GeoPageTabs
            geoType="community"
            geoId={community.id}
            agentId={tenantId ? (resolvedAgentId || '') : (agent?.id || '')}
            tenantId={tenantId ? (tenantId || '') : (agent?.tenant_id || '')}
            buildingCount={buildingCount}
            initialListings={initialListings}
            initialTotal={counts.forSale}
            counts={counts}
            buildingsTitle={"Buildings in " + community.name}
          />
        </div>

        {isHero && (
          <div className="mt-8 grid md:grid-cols-2 gap-6">
            <WalliamAgentCard
              community_id={community.id}
              municipality_id={community.municipality_id}
              tenant_id={tenantId!}
            />
            <WalliamCTA context={community.name} assistantName={assistantName} brandName={brandName} wordmarkStyle={wordmarkStyle} />
            <CharliePageContext community_id={community.id} community_slug={community.slug} municipality_id={community.municipality_id} />
          </div>
        )}

        <AnalyticsSection
          geoType="community"
          geoId={community.id}
          geoName={community.name}
          parentGeoType="municipality"
          parentGeoId={municipality?.id}
        />
        <GeoSEOContent
          geoName={community.name}
          geoType="community"
          parentName={municipality?.name}
          buildingCount={buildingCount}
          counts={counts}
        />

        {/* LANE-B BUILD 2 (2026-07-09): crawlable buildings-in-community list.
            Fills the Community → Building gap in the down-link matrix. Real
            slugs (buildings.slug), alphabetical, capped 24 at fetch time to
            prevent link-dilution on high-density communities. Silent-omit
            when the community has zero buildings (row-count driven, not
            fabricated). Section header ties keyword to community name. */}
        {buildingsInCommunity && buildingsInCommunity.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Buildings in {community.name}
              {buildingCount > buildingsInCommunity.length && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  ({buildingsInCommunity.length} of {buildingCount})
                </span>
              )}
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {buildingsInCommunity.map((b: { slug: string; name: string; address: string | null }) => (
                <li key={b.slug}>
                  <a
                    href={`/${b.slug}`}
                    className="block px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-slate-800">{b.name}</span>
                    {b.address && (
                      <span className="block text-xs text-slate-500 truncate">{b.address}</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <GeoInterlinking
          title={`Other Communities in ${municipality?.name || 'this area'}`}
          links={siblingCommunities}
          currentSlug={community.slug}
        />
      </div>
    </div>
  )
}