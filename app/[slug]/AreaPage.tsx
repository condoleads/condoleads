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
  media (id, media_url, variant_type, order_number, preferred_photo_yn)
`

const CONDO_SUBTYPES = ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
  'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment']

const HOME_SUBTYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse',
  'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']

interface AreaData { id: string; name: string; slug: string }
interface AreaPageProps { area: AreaData }

export async function generateAreaMetadata(area: AreaData) {
  return {
    title: `${area.name} Real Estate | Condos & Homes for Sale`,
    description: `Browse condos and homes for sale in ${area.name}. Explore municipalities, communities, and condo buildings.`,
    alternates: {
      canonical: `https://www.condoleads.ca/${area.slug}`,
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
    ] = await Promise.all([
      communityIds.length > 0
        ? supabase.from('buildings').select('id', { count: 'exact', head: true }).in('community_id', communityIds)
        : Promise.resolve({ count: 0 }),
      supabase.from('mls_listings').select(LISTING_SELECT)
        .eq(geoFilter.column, geoFilter.value)
        .eq('standard_status', 'Active')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .order('list_price', { ascending: false })
        .limit(24),
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
      supabase.from('treb_areas').select('id, name, slug').order('name'),
      // homeCounts
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .eq('standard_status', 'Active')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .in('property_subtype', HOME_SUBTYPES),
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .eq('standard_status', 'Active')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Lease')
        .in('property_subtype', HOME_SUBTYPES),
      // condoCounts
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .eq('standard_status', 'Active')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .in('property_subtype', CONDO_SUBTYPES),
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .eq('standard_status', 'Active')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Lease')
        .in('property_subtype', CONDO_SUBTYPES),
    ])

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

    const homeCounts = {
      forSale: homeForSaleCount.count || 0,
      forLease: homeForLeaseCount.count || 0,
      sold: 0,
      leased: 0,
    }

    const condoCounts = {
      forSale: condoForSaleCount.count || 0,
      forLease: condoForLeaseCount.count || 0,
      sold: 0,
      leased: 0,
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
  const { getWalliamTenantId } = await import('@/lib/utils/is-walliam')
  const [data, agent, tenantId] = await Promise.all([
    getAreaData(area.id),
    getAgentFromHost(host),
    getWalliamTenantId(),
  ])
  const isWalliam = !!tenantId
  const { initialListings, counts, homeCounts, condoCounts, buildingCount, allAreas, municipalityLinks, municipalities } = data

  return (
    <div className="min-h-screen bg-white">
      <GeoHero
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

        <div className="mt-8">
          <GeoPageTabs
            geoType="area"
            geoId={area.id}
            agentId={agent?.id || ''}
            tenantId={agent?.tenant_id || ''}
            buildingCount={buildingCount}
            initialListings={initialListings}
            initialTotal={counts.forSale}
            counts={counts}
            homeCounts={homeCounts}
            condoCounts={condoCounts}
            buildingsTitle="Buildings"
          />
        </div>

        {isWalliam && (
          <div className="mt-8 grid md:grid-cols-2 gap-6">
            <WalliamAgentCard
              area_id={area.id}
              tenant_id={tenantId!}
            />
            <WalliamCTA context={area.name} />
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