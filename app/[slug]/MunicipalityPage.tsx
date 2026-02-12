import { supabase } from '@/lib/supabase/client'
import { headers } from 'next/headers'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import GeoListingSection from './components/GeoListingSection'
import BuildingsGrid from './components/BuildingsGrid'

const LISTING_SELECT = `
  id, building_id, listing_id, listing_key, standard_status, transaction_type,
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
    description: `Browse condos and homes for sale in ${municipality.name}.`,
  }
}

export default async function MunicipalityPage({ municipality }: MunicipalityPageProps) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const geoFilter = { column: 'municipality_id' as const, value: municipality.id }

  const [areaResult, communitiesResult, buildingCountResult, initialListingsResult, forSaleCount, forLeaseCount, soldCount, leasedCount, agentResult] = await Promise.all([
    supabase.from('treb_areas').select('name, slug').eq('id', municipality.area_id).single(),
    supabase.from('communities').select('id, name, slug').eq('municipality_id', municipality.id).order('name'),
    supabase.from('communities').select('id').eq('municipality_id', municipality.id).then(async (res) => {
      const ids = (res.data || []).map(c => c.id)
      if (ids.length === 0) return { count: 0 }
      const { count } = await supabase.from('buildings').select('id', { count: 'exact', head: true }).in('community_id', ids)
      return { count: count || 0 }
    }),
    supabase.from('mls_listings').select(LISTING_SELECT).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Active').eq('available_in_idx', true).eq('transaction_type', 'For Sale').order('list_price', { ascending: false }).limit(24),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true }).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Active').eq('available_in_idx', true).eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true }).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Active').eq('available_in_idx', true).eq('transaction_type', 'For Lease'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true }).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Closed').eq('available_in_vow', true).eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true }).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Closed').eq('available_in_vow', true).eq('transaction_type', 'For Lease'),
    getAgentFromHost(host),
  ])

  const area = areaResult.data
  const communities = communitiesResult.data || []
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

  const buildingCount = (buildingCountResult as any)?.count || 0
  const agent = agentResult
  const areaHref = area ? '/' + area.slug : '#'

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {area && (
          <nav className="text-sm text-gray-500 mb-4">
            <a href={areaHref} className="hover:text-blue-600">{area.name}</a>
            <span className="mx-2">&rsaquo;</span>
            <span className="text-gray-900">{municipality.name}</span>
          </nav>
        )}
        <h1 className="text-3xl font-bold text-gray-900">{municipality.name} Real Estate</h1>
        <p className="text-gray-600 mt-2">{counts.forSale + counts.forLease} active &middot; {counts.sold} sold &middot; {counts.leased} leased</p>

        {communities.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Communities</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {communities.map((c) => (
                <a key={c.id} href={'/' + c.slug} className="p-3 border rounded-lg hover:border-blue-500 hover:shadow-md transition-all text-sm">
                  <span className="font-medium text-gray-900">{c.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          <BuildingsGrid
            initialBuildings={[]}
            totalBuildings={buildingCount}
            geoType="municipality"
            geoId={municipality.id}
            title="Buildings"
          />
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Listings</h2>
          <GeoListingSection
            initialListings={initialListings}
            initialTotal={counts.forSale}
            counts={counts}
            geoType="municipality"
            geoId={municipality.id}
            agentId={agent?.id || ''}
          />
        </div>
      </div>
    </div>
  )
}
