import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import { unstable_cache } from 'next/cache'
import GeoPageTabs from './components/GeoPageTabs'
import GeoSEOContent from './components/GeoSEOContent'
import GeoInterlinking from './components/GeoInterlinking'
import CommunityCard from './components/CommunityCard'
import GeoHero from './components/GeoHero'
import AnalyticsSection from '@/components/analytics/AnalyticsSection'
import WalliamCTA from '@/components/WalliamCTA'
import WalliamAgentCard from '@/components/WalliamAgentCard'

const LISTING_SELECT = `
  id, building_id, community_id, municipality_id, listing_id, listing_key, standard_status, transaction_type,
  list_price, close_price, close_date, unit_number, unparsed_address,
  bedrooms_total, bathrooms_total_integer, property_type, property_subtype,
  living_area_range, square_foot_source, parking_total, locker,
  association_fee, tax_annual_amount, days_on_market, listing_contract_date,
  building_area_total,
  lot_width, lot_depth, lot_size_dimensions, lot_size_area, lot_size_area_units,
  frontage_length, basement, garage_type, garage_yn, approximate_age,
  legal_stories, architectural_style, cooling, pool_features, fireplace_yn,
  media (id, media_url, variant_type, order_number, preferred_photo_yn)
`

interface MunicipalityData { id: string; name: string; slug: string; area_id: string }
interface MunicipalityPageProps { municipality: MunicipalityData }

export async function generateMunicipalityMetadata(municipality: MunicipalityData) {
  return {
    title: `${municipality.name} Real Estate | Condos & Homes for Sale`,
    description: `Browse condos and homes for sale in ${municipality.name}. Explore communities, condo buildings, and market intelligence.`,
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
    // FIX: flattened â€" still two steps but second is a single query, not chained
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
      .eq('standard_status', 'Active')
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Sale')
      .order('list_price', { ascending: false })
      .limit(24),
    // FIX: available_in_idx → available_in_vow
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .eq('standard_status', 'Active')
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .eq('standard_status', 'Active')
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Lease'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .eq('standard_status', 'Closed')
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .eq('standard_status', 'Closed')
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Lease'),
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
    forSale: forSaleCount.count || 0,
    forLease: forLeaseCount.count || 0,
    sold: soldCount.count || 0,
    leased: leasedCount.count || 0,
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
        .eq('standard_status', 'Active')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .limit(10000),
      supabase.from('mls_listings')
        .select('community_id')
        .in('community_id', communityIds)
        .eq('standard_status', 'Active')
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
  const [data, agent] = await Promise.all([
    getMunicipalityData(municipality.id, municipality.area_id),
    getAgentFromHost(host),
  ])
  const { area, communities, buildingCount, initialListings, counts, enrichedCommunities, siblingMunicipalities } = data
  const areaHref = area ? '/' + area.slug : '#'

  return (
    <div className="min-h-screen bg-white">
      <GeoHero
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

        <div className="mt-8">
          <GeoPageTabs
            geoType="municipality"
            geoId={municipality.id}
            agentId={agent?.id || ''}
            buildingCount={buildingCount}
            initialListings={initialListings}
            initialTotal={counts.forSale}
            counts={counts}
            buildingsTitle="Buildings"
          />
        </div>

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