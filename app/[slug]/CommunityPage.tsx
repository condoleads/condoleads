import { supabase } from '@/lib/supabase/client'
import { headers } from 'next/headers'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import GeoPageTabs from './components/GeoPageTabs'

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
    description: `Browse condos and homes for sale in ${community.name}.`,
  }
}

export default async function CommunityPage({ community }: CommunityPageProps) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const geoFilter = { column: 'community_id' as const, value: community.id }

  const [municipalityResult, buildingsResult, initialListingsResult, forSaleCount, forLeaseCount, soldCount, leasedCount, agentResult] = await Promise.all([
    supabase.from('municipalities').select('name, slug, area_id').eq('id', community.municipality_id).single(),
    supabase.from('buildings').select('id', { count: 'exact', head: true }).eq('community_id', community.id),
    supabase.from('mls_listings').select(LISTING_SELECT).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Active').eq('available_in_idx', true).eq('transaction_type', 'For Sale').order('list_price', { ascending: false }).limit(24),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true }).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Active').eq('available_in_idx', true).eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true }).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Active').eq('available_in_idx', true).eq('transaction_type', 'For Lease'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true }).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Closed').eq('available_in_vow', true).eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true }).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Closed').eq('available_in_vow', true).eq('transaction_type', 'For Lease'),
    getAgentFromHost(host),
  ])

  const municipality = municipalityResult.data
  const buildingCount = buildingsResult.count || 0
  const initialListings = (initialListingsResult.data || []).map((l: any) => ({
    ...l,
    media: (l.media?.filter((m: any) => m.variant_type === 'thumbnail') || []).sort((a: any, b: any) => (a.order_number || 999) - (b.order_number || 999)).slice(0, 1)
  }))

  const counts = {
    forSale: forSaleCount.count || 0,
    forLease: forLeaseCount.count || 0,
    sold: soldCount.count || 0,
    leased: leasedCount.count || 0,
  }

  let area = null
  if (municipality?.area_id) {
    const { data } = await supabase.from('treb_areas').select('name, slug').eq('id', municipality.area_id).single()
    area = data
  }

  const agent = agentResult
  const areaHref = area ? '/' + area.slug : '#'
  const muniHref = municipality ? '/' + municipality.slug : '#'

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <nav className="text-sm text-gray-500 mb-4">
          {area && (<><a href={areaHref} className="hover:text-blue-600">{area.name}</a><span className="mx-2">&rsaquo;</span></>)}
          {municipality && (<><a href={muniHref} className="hover:text-blue-600">{municipality.name}</a><span className="mx-2">&rsaquo;</span></>)}
          <span className="text-gray-900">{community.name}</span>
        </nav>
        <h1 className="text-3xl font-bold text-gray-900">{community.name} Real Estate</h1>
        <p className="text-gray-600 mt-2">
          {buildingCount} buildings &middot; {counts.forSale + counts.forLease} active listings &middot; {counts.sold} sold &middot; {counts.leased} leased
        </p>

        <div className="mt-8">
          <GeoPageTabs
            geoType="community"
            geoId={community.id}
            agentId={agent?.id || ''}
            buildingCount={buildingCount}
            initialListings={initialListings}
            initialTotal={counts.forSale}
            counts={counts}
            buildingsTitle={"Buildings in " + community.name}
          />
        </div>
      </div>
    </div>
  )
}
