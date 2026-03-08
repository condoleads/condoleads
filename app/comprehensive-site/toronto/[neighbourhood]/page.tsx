import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import NeighbourhoodListingSection from '@/app/[slug]/components/NeighbourhoodListingSection'

interface Props {
  params: { neighbourhood: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient()
  const { data: n } = await supabase
    .from('neighbourhoods')
    .select('name')
    .eq('slug', params.neighbourhood)
    .eq('is_active', true)
    .single()

  if (!n) return { title: 'Neighbourhood Not Found' }
  return {
    title: `${n.name} Real Estate – Condos & Homes | CondoLeads`,
    description: `Browse condos and homes for sale and lease in ${n.name}, Toronto.`,
  }
}

async function getNeighbourhoodData(slug: string) {
  const supabase = createClient()

  const { data: neighbourhood } = await supabase
    .from('neighbourhoods')
    .select('id, name, slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!neighbourhood) return null

  const { data: mappings } = await supabase
    .from('municipality_neighbourhoods')
    .select('municipality_id, municipalities(id, name, slug)')
    .eq('neighbourhood_id', neighbourhood.id)

  const municipalities = (mappings ?? [])
    .map((m: any) => m.municipalities)
    .filter(Boolean)

  const municipalityIds = municipalities.map((m: any) => m.id)
  if (!municipalityIds.length) return { neighbourhood, municipalities: [], municipalityIds: [], stats: null }

  // Stats — all use available_in_vow
  const [
    { count: activeCount },
    { count: condoCount },
    { count: homeCount },
  ] = await Promise.all([
    supabase
      .from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active'),
    supabase
      .from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active')
      .in('property_subtype', ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
        'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment']),
    supabase
      .from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active')
      .in('property_subtype', ['Detached', 'Semi-Detached', 'Att/Row/Townhouse',
        'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']),
  ])

  // Buildings count via communities
  const { data: communities } = await supabase
    .from('communities')
    .select('id')
    .in('municipality_id', municipalityIds)

  const communityIds = (communities ?? []).map((c: any) => c.id)
  const { count: buildingCount } = communityIds.length
    ? await supabase
        .from('buildings')
        .select('id', { count: 'exact', head: true })
        .in('community_id', communityIds)
    : { count: 0 }

  // Initial listings for SSR (for-sale, page 1)
  const { data: initialListings } = await supabase
    .from('mls_listings')
    .select(`id, building_id, community_id, municipality_id, listing_id, listing_key,
      standard_status, transaction_type, list_price, close_price, close_date,
      unit_number, unparsed_address, bedrooms_total, bathrooms_total_integer,
      property_type, property_subtype, living_area_range, square_foot_source,
      building_area_total, parking_total, locker, association_fee, tax_annual_amount,
      days_on_market, listing_contract_date,
      lot_width, lot_depth, frontage_length, basement, garage_type, garage_yn,
      approximate_age, architectural_style, cooling, pool_features, fireplace_yn,
      media (id, media_url, variant_type, order_number, preferred_photo_yn)`)
    .in('municipality_id', municipalityIds)
    .eq('available_in_vow', true)
    .eq('standard_status', 'Active')
    .eq('transaction_type', 'For Sale')
    .order('list_price', { ascending: false })
    .range(0, 23)

  const { count: initialTotal } = await supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true })
    .in('municipality_id', municipalityIds)
    .eq('available_in_vow', true)
    .eq('standard_status', 'Active')
    .eq('transaction_type', 'For Sale')

  // Tab counts for initial render
  const [
    { count: forSaleCount },
    { count: forLeaseCount },
    { count: soldCount },
    { count: leasedCount },
  ] = await Promise.all([
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds).eq('available_in_vow', true)
      .eq('standard_status', 'Active').eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds).eq('available_in_vow', true)
      .eq('standard_status', 'Active').eq('transaction_type', 'For Lease'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds).eq('available_in_vow', true)
      .eq('standard_status', 'Closed').eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds).eq('available_in_vow', true)
      .eq('standard_status', 'Closed').eq('transaction_type', 'For Lease'),
  ])

  // Process media thumbnails
  const processedListings = (initialListings ?? []).map((l: any) => ({
    ...l,
    media: (l.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number ?? 999) - (b.order_number ?? 999))
      .slice(0, 1),
  }))

  return {
    neighbourhood,
    municipalities,
    municipalityIds,
    stats: {
      active: activeCount ?? 0,
      condos: condoCount ?? 0,
      homes: homeCount ?? 0,
      buildings: buildingCount ?? 0,
    },
    initialListings: processedListings,
    initialTotal: initialTotal ?? 0,
    initialCounts: {
      forSale: forSaleCount ?? 0,
      forLease: forLeaseCount ?? 0,
      sold: soldCount ?? 0,
      leased: leasedCount ?? 0,
    },
  }
}

export default async function NeighbourhoodPage({ params }: Props) {
  const data = await getNeighbourhoodData(params.neighbourhood)
  if (!data) notFound()

  const { neighbourhood, municipalities, municipalityIds, stats, initialListings, initialTotal, initialCounts } = data

  return (
    <div className="min-h-screen bg-white">

      {/* Breadcrumb */}
      <div className="bg-gray-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-700">Home</Link>
            <span>/</span>
            <Link href="/toronto" className="hover:text-gray-700">Toronto</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">{neighbourhood.name}</span>
          </nav>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <p className="text-sm text-blue-600 font-medium mb-1">Toronto Neighbourhood</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-6">{neighbourhood.name}</h1>

          {stats && (
            <div className="flex flex-wrap gap-8">
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.active.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Active Listings</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.condos.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Condos</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.homes.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Homes</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.buildings.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Buildings</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Municipality pills — quick links */}
      {municipalities.length > 1 && (
        <div className="bg-gray-50 border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap gap-2">
            {municipalities.map((m: any) => (
              <Link
                key={m.id}
                href={`/${m.slug}`}
                className="px-3 py-1 text-sm bg-white border border-gray-200 rounded-full text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                {m.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Listings — single unified section across all municipalities */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <NeighbourhoodListingSection
          municipalityIds={municipalityIds}
          agentId=""
          initialListings={initialListings}
          initialTotal={initialTotal}
          counts={initialCounts}
          pageSize={24}
        />
      </div>

    </div>
  )
}