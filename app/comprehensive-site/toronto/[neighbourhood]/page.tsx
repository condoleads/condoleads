import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { unstable_cache } from 'next/cache'
import NeighbourhoodPageTabs from '@/app/[slug]/components/NeighbourhoodPageTabs'
import GeoHero from '@/app/[slug]/components/GeoHero'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import { headers } from 'next/headers'

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

const getNeighbourhoodData = unstable_cache(
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

  // Resolve community IDs for building count upfront
  const { data: communities } = await supabase
    .from('communities')
    .select('id, name, slug')
    .in('municipality_id', municipalityIds)
    .limit(10000)

  const communityIds = (communities ?? []).map((c: any) => c.id)

  // FIX: run all queries in parallel
  // FIX: initialTotal and forSaleCount were identical queries — merged into one
  // FIX: sold/leased counts deferred — not needed on initial SSR render, fetched by tabs on demand
  const [
    { count: activeCount },
    { count: condoCount },
    { count: homeCount },
    { count: buildingCount },
    { data: initialListingsRaw },
    { count: forSaleCount },
    { count: forLeaseCount },
  ] = await Promise.all([
    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active'),
    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active')
      .in('property_subtype', ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
        'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment']),
    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active')
      .in('property_subtype', ['Detached', 'Semi-Detached', 'Att/Row/Townhouse',
        'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']),
    communityIds.length
      ? supabase.from('buildings')
          .select('id', { count: 'exact', head: true })
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
    // FIX: forSaleCount and initialTotal were duplicated — now one query serves both
    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active')
      .eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Active')
      .eq('transaction_type', 'For Lease'),
  ])

  // FIX: sold/leased counts removed from SSR — NeighbourhoodPageTabs fetches them
  // when the user clicks those tabs via the API route
  const initialCounts = {
    forSale: forSaleCount ?? 0,
    forLease: forLeaseCount ?? 0,
    sold: 0,
    leased: 0,
  }

  // Process media thumbnails
  const initialListings = (initialListingsRaw ?? []).map((l: any) => ({
    ...l,
    media: (l.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number ?? 999) - (b.order_number ?? 999))
      .slice(0, 1),
  }))

  return {
    neighbourhood,
    municipalities,
    municipalityIds,
    communities,
    stats: {
      active: activeCount ?? 0,
      condos: condoCount ?? 0,
      homes: homeCount ?? 0,
      buildings: buildingCount ?? 0,
    },
    initialListings,
    initialTotal: forSaleCount ?? 0,
    initialCounts,
  }
  },
  ['neighbourhood-data'],
  { revalidate: 300, tags: ['neighbourhood'] }
)

export default async function NeighbourhoodPage({ params }: Props) {
  const data = await getNeighbourhoodData(params.neighbourhood)
  if (!data) notFound()

  const headersList = headers()
  const host = headersList.get('host') || ''
  const agent = await getAgentFromHost(host)

  const { neighbourhood, municipalities, municipalityIds, communities, stats, initialListings, initialTotal, initialCounts } = data

  return (
    <div className="min-h-screen bg-white">
      <GeoHero
        title={`${neighbourhood.name} Real Estate`}
        subtitle="Toronto Neighbourhood"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Toronto", href: "/toronto" },
          { label: neighbourhood.name, href: "#" },
        ]}
        stats={{
          active: stats?.active ?? 0,
          sold: 0,
          leased: 0,
          buildings: stats?.buildings ?? 0,
        }}
        geoType="neighbourhood"
      />

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

      {/* Listings — tabbed */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <NeighbourhoodPageTabs
          municipalityIds={municipalityIds}
          agentId={agent?.id || ''}
          tenantId={agent?.tenant_id || ''}
          buildingCount={stats?.buildings ?? 0}
          municipalities={municipalities}
          initialListings={initialListings}
          initialTotal={initialTotal}
          counts={initialCounts}
        />
      </div>

      {/* Communities */}
      {communities && communities.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 border-t border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Communities</h2>
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