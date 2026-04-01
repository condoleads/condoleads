import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import { unstable_cache } from 'next/cache'
import GeoPageTabs from './components/GeoPageTabs'
import GeoSEOContent from './components/GeoSEOContent'
import GeoInterlinking from './components/GeoInterlinking'
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

interface CommunityData { id: string; name: string; slug: string; municipality_id: string }
interface CommunityPageProps { community: CommunityData }

export async function generateCommunityMetadata(community: CommunityData) {
  return {
    title: `${community.name} Real Estate | Condos & Homes for Sale`,
    description: `Browse condos and homes for sale in ${community.name}. View listings, condo buildings, market data, and price estimates.`,
  }
}

const getCommunityData = unstable_cache(
  async (communityId: string, municipalityId: string) => {
    const supabase = createClient()
    const geoFilter = { column: 'community_id' as const, value: communityId }
    const [
      municipalityResult,
      buildingsResult,
      initialListingsResult,
      forSaleCount,
      forLeaseCount,
      soldCount,
      leasedCount,
      siblingCommunitiesResult,
    ] = await Promise.all([
    supabase.from('municipalities').select('id, name, slug, area_id').eq('id', municipalityId).single(),
    supabase.from('buildings').select('id', { count: 'exact', head: true }).eq('community_id', communityId),
    // FIX: available_in_idx → available_in_vow
    supabase.from('mls_listings').select(LISTING_SELECT)
      .eq(geoFilter.column, geoFilter.value)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Sale')
      .order('list_price', { ascending: false })
      .limit(24),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
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
    forSale: forSaleCount.count || 0,
    forLease: forLeaseCount.count || 0,
    sold: soldCount.count || 0,
    leased: leasedCount.count || 0,
  }

  const siblingCommunities = (siblingCommunitiesResult.data || []).map(c => ({
    name: c.name,
    slug: c.slug,
  }))
  return { municipality, buildingCount, initialListings, counts, siblingCommunities }
  },
  ['community-data'],
  { revalidate: 300, tags: ['community'] }
)

export default async function CommunityPage({ community }: CommunityPageProps) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const { getWalliamTenantId } = await import('@/lib/utils/is-walliam')
  const [data, agent, tenantId] = await Promise.all([
    getCommunityData(community.id, community.municipality_id),
    getAgentFromHost(host),
    getWalliamTenantId(),
  ])
  const isWalliam = !!tenantId
  const { municipality, buildingCount, initialListings, counts, siblingCommunities } = data

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

  return (
    <div className="min-h-screen bg-white">
      <GeoHero
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
        <div className="mt-8">
          <GeoPageTabs
            geoType="community"
            geoId={community.id}
            agentId={agent?.id || ''}
            tenantId={agent?.tenant_id || ''}
            buildingCount={buildingCount}
            initialListings={initialListings}
            initialTotal={counts.forSale}
            counts={counts}
            buildingsTitle={"Buildings in " + community.name}
          />
        </div>

        {isWalliam && (
          <div className="mt-8 grid md:grid-cols-2 gap-6">
            <WalliamAgentCard
              community_id={community.id}
              municipality_id={community.municipality_id}
              tenant_id={tenantId!}
            />
            <WalliamCTA context={community.name} />
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

        <GeoInterlinking
          title={`Other Communities in ${municipality?.name || 'this area'}`}
          links={siblingCommunities}
          currentSlug={community.slug}
        />
      </div>
    </div>
  )
}