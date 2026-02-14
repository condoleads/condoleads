import { supabase } from '@/lib/supabase/client'
import { headers } from 'next/headers'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import GeoPageTabs from './components/GeoPageTabs'
import GeoSEOContent from './components/GeoSEOContent'
import GeoInterlinking from './components/GeoInterlinking'
import CommunityCard from './components/CommunityCard'

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

export default async function MunicipalityPage({ municipality }: MunicipalityPageProps) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const geoFilter = { column: 'municipality_id' as const, value: municipality.id }

  const [areaResult, communitiesResult, buildingCountResult, initialListingsResult, forSaleCount, forLeaseCount, soldCount, leasedCount, agentResult, siblingMunicipalitiesResult] = await Promise.all([
    supabase.from('treb_areas').select('name, slug').eq('id', municipality.area_id).single(),
    // Communities with listing counts via RPC-style: fetch communities then enrich
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
    supabase.from('municipalities').select('id, name, slug').eq('area_id', municipality.area_id).order('name'),
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

  // Enrich communities with listing counts
  const communityIds = communities.map(c => c.id)
  let communityCounts: Record<string, { forSale: number; forLease: number; buildingCount: number }> = {}
  if (communityIds.length > 0) {
    const [saleResult, leaseResult, buildingResult] = await Promise.all([
      supabase.from('mls_listings').select('community_id').in('community_id', communityIds).eq('standard_status', 'Active').eq('available_in_idx', true).eq('transaction_type', 'For Sale'),
      supabase.from('mls_listings').select('community_id').in('community_id', communityIds).eq('standard_status', 'Active').eq('available_in_idx', true).eq('transaction_type', 'For Lease'),
      supabase.from('buildings').select('community_id').in('community_id', communityIds),
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

        {/* Enhanced Community Cards */}
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

        {/* SEO Content */}
        <GeoSEOContent
          geoName={municipality.name}
          geoType="municipality"
          parentName={area?.name}
          buildingCount={buildingCount}
          counts={counts}
        />

        {/* Interlinking: Other Municipalities */}
        <GeoInterlinking
          title={`Other Areas in ${area?.name || 'the region'}`}
          links={siblingMunicipalities}
          currentSlug={municipality.slug}
        />
      </div>
    </div>
  )
}