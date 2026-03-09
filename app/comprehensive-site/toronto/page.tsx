import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import NeighbourhoodPageTabs from '@/app/[slug]/components/NeighbourhoodPageTabs'

export const metadata: Metadata = {
  title: 'Toronto Real Estate – Condos & Homes for Sale | CondoLeads',
  description: 'Browse condos and homes for sale and lease across all Toronto neighbourhoods. Explore Downtown, Midtown, East End, North York, Etobicoke, Scarborough and more.',
}

async function getTorontoData() {
  const supabase = createClient()

  // All Toronto municipalities via neighbourhood mapping
  const { data: mappings } = await supabase
    .from('municipality_neighbourhoods')
    .select('municipality_id, municipalities(id, name, slug)')
    .limit(10000)

  const seen = new Set<string>()
  const municipalities = (mappings ?? [])
    .map((m: any) => m.municipalities)
    .filter((m: any) => {
      if (!m || seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
    .sort((a: any, b: any) => a.name.localeCompare(b.name))

  const municipalityIds = municipalities.map((m: any) => m.id)
  if (!municipalityIds.length) return null

  // Communities for bottom SEO links
  const { data: communities } = await supabase
    .from('communities')
    .select('id, name, slug')
    .in('municipality_id', municipalityIds)
    .order('name')
    .limit(10000)

  const communityIds = (communities ?? []).map((c: any) => c.id)

  const [
    { count: activeCount },
    { count: condoCount },
    { count: homeCount },
    { count: buildingCount },
    { data: initialListingsRaw },
    { count: forSaleCount },
    { count: forLeaseCount },
  ] = await Promise.all([
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active')
      .in('property_subtype', ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
        'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment']),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active')
      .in('property_subtype', ['Detached', 'Semi-Detached', 'Att/Row/Townhouse',
        'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']),
    communityIds.length
      ? supabase.from('buildings').select('id', { count: 'exact', head: true })
          .in('community_id', communityIds)
      : Promise.resolve({ count: 0 }),
    supabase.from('mls_listings')
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
      .range(0, 23),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active')
      .eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active')
      .eq('transaction_type', 'For Lease'),
  ])

  const initialListings = (initialListingsRaw ?? []).map((l: any) => ({
    ...l,
    media: (l.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number ?? 999) - (b.order_number ?? 999))
      .slice(0, 1),
  }))

  return {
    municipalities,
    municipalityIds,
    communities: communities ?? [],
    stats: {
      active: activeCount ?? 0,
      condos: condoCount ?? 0,
      homes: homeCount ?? 0,
      buildings: buildingCount ?? 0,
    },
    initialListings,
    initialTotal: forSaleCount ?? 0,
    initialCounts: {
      forSale: forSaleCount ?? 0,
      forLease: forLeaseCount ?? 0,
      sold: 0,
      leased: 0,
    },
  }
}

export default async function TorontoPage() {
  const data = await getTorontoData()
  if (!data) return <div>No data available</div>

  const { municipalities, municipalityIds, communities, stats, initialListings, initialTotal, initialCounts } = data

  return (
    <div className="min-h-screen bg-white">

      {/* Breadcrumb */}
      <div className="bg-gray-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-700">Home</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Toronto</span>
          </nav>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <p className="text-sm text-blue-600 font-medium mb-1">Ontario, Canada</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-6">Toronto Real Estate</h1>
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
        </div>
      </div>

      {/* Municipality chips */}
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

      {/* Listings — tabbed */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <NeighbourhoodPageTabs
          municipalityIds={municipalityIds}
          agentId=""
          buildingCount={stats.buildings}
          municipalities={municipalities}
          initialListings={initialListings}
          initialTotal={initialTotal}
          counts={initialCounts}
        />
      </div>

      {/* Neighbourhood links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 border-t border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Toronto Neighbourhoods</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'Downtown', slug: 'downtown' },
            { name: 'Midtown | Central', slug: 'midtown-central' },
            { name: 'East End', slug: 'east-end' },
            { name: 'West End', slug: 'west-end' },
            { name: 'North York', slug: 'north-york' },
            { name: 'East York', slug: 'east-york' },
            { name: 'Scarborough', slug: 'scarborough' },
            { name: 'Etobicoke', slug: 'etobicoke' },
            { name: 'York Crosstown', slug: 'york-crosstown' },
          ].map((n) => (
            <Link key={n.slug} href={`/toronto/${n.slug}`}
              className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
              {n.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Communities */}
      {communities.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 border-t border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Toronto Communities</h2>
          <div className="flex flex-wrap gap-2">
            {communities.map((c: any) => (
              <Link key={c.id} href={`/${c.slug}`}
                className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}