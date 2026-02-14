import { supabase } from '@/lib/supabase/client'
import { headers } from 'next/headers'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import GeoPageTabs from './components/GeoPageTabs'
import GeoSEOContent from './components/GeoSEOContent'
import GeoInterlinking from './components/GeoInterlinking'

const LISTING_SELECT = `
  id, building_id, community_id, municipality_id, listing_id, listing_key, standard_status, transaction_type,
  list_price, close_price, close_date, unit_number, unparsed_address,
  bedrooms_total, bathrooms_total_integer, property_type, property_subtype,
  living_area_range, square_foot_source, parking_total, locker,
  association_fee, tax_annual_amount, days_on_market, listing_contract_date,
  building_area_total,
  media (id, media_url, variant_type, order_number, preferred_photo_yn)
`

interface AreaData { id: string; name: string; slug: string }
interface AreaPageProps { area: AreaData }

export async function generateAreaMetadata(area: AreaData) {
  return {
    title: `${area.name} Real Estate | Condos & Homes for Sale`,
    description: `Browse condos and homes for sale in ${area.name}. Explore municipalities, communities, and condo buildings.`,
  }
}

export default async function AreaPage({ area }: AreaPageProps) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const geoFilter = { column: 'area_id' as const, value: area.id }

  const [municipalitiesResult, buildingCountResult, initialListingsResult, forSaleCount, forLeaseCount, soldCount, leasedCount, agentResult, allAreasResult] = await Promise.all([
    supabase.from('municipalities').select('id, name, slug').eq('area_id', area.id).order('name'),
    supabase.from('municipalities').select('id').eq('area_id', area.id).then(async (res) => {
      const muniIds = (res.data || []).map(m => m.id)
      if (muniIds.length === 0) return { count: 0 }
      const { data: comms } = await supabase.from('communities').select('id').in('municipality_id', muniIds)
      const commIds = (comms || []).map(c => c.id)
      if (commIds.length === 0) return { count: 0 }
      const { count } = await supabase.from('buildings').select('id', { count: 'exact', head: true }).in('community_id', commIds)
      return { count: count || 0 }
    }),
    supabase.from('mls_listings').select(LISTING_SELECT).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Active').eq('available_in_idx', true).eq('transaction_type', 'For Sale').order('list_price', { ascending: false }).limit(24),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true }).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Active').eq('available_in_idx', true).eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true }).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Active').eq('available_in_idx', true).eq('transaction_type', 'For Lease'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true }).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Closed').eq('available_in_vow', true).eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true }).eq(geoFilter.column, geoFilter.value).eq('standard_status', 'Closed').eq('available_in_vow', true).eq('transaction_type', 'For Lease'),
    getAgentFromHost(host),
    supabase.from('treb_areas').select('id, name, slug').order('name'),
  ])

  const municipalities = municipalitiesResult.data || []
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

  const allAreas = (allAreasResult.data || []).map(a => ({
    name: a.name,
    slug: a.slug,
  }))

  const municipalityLinks = municipalities.map(m => ({
    name: m.name,
    slug: m.slug,
  }))

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <nav className="text-sm text-gray-500 mb-4">
          <span className="text-gray-900">{area.name}</span>
        </nav>
        <h1 className="text-3xl font-bold text-gray-900">{area.name} Real Estate</h1>
        <p className="text-gray-600 mt-2">
          {municipalities.length} municipalities &middot; {counts.forSale + counts.forLease} active &middot; {counts.sold} sold &middot; {counts.leased} leased
        </p>

        <div className="mt-8">
          <GeoPageTabs
            geoType="area"
            geoId={area.id}
            agentId={agent?.id || ''}
            buildingCount={buildingCount}
            initialListings={initialListings}
            initialTotal={counts.forSale}
            counts={counts}
            buildingsTitle="Buildings"
          />
        </div>

        {/* Municipality Links */}
        <GeoInterlinking
          title={`Municipalities in ${area.name}`}
          links={municipalityLinks}
        />

        {/* SEO Content */}
        <GeoSEOContent
          geoName={area.name}
          geoType="area"
          buildingCount={buildingCount}
          counts={counts}
        />

        {/* Interlinking: All Areas */}
        <GeoInterlinking
          title="Explore All Areas"
          links={allAreas}
          currentSlug={area.slug}
        />
      </div>
    </div>
  )
}