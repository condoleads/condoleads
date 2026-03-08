import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'

interface Props {
  params: { neighbourhood: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data: n } = await supabase
    .from('neighbourhoods')
    .select('name')
    .eq('slug', params.neighbourhood)
    .eq('is_active', true)
    .single()

  if (!n) return { title: 'Neighbourhood Not Found' }
  return {
    title: `${n.name} Real Estate — Condos & Homes | CondoLeads`,
    description: `Browse condos and homes in ${n.name}, Toronto. ${n.name} buildings, communities and active listings.`,
  }
}

async function getNeighbourhoodData(slug: string) {
  const { data: neighbourhood } = await supabase
    .from('neighbourhoods')
    .select('id, name, slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!neighbourhood) return null

  // Municipalities in this neighbourhood
  const { data: mappings } = await supabase
    .from('municipality_neighbourhoods')
    .select('municipality_id, municipalities(id, name, slug)')
    .eq('neighbourhood_id', neighbourhood.id)

  const municipalities = (mappings ?? [])
    .map((m: any) => m.municipalities)
    .filter(Boolean)

  const municipalityIds = municipalities.map((m: any) => m.id)
  if (!municipalityIds.length) return { neighbourhood, municipalities: [], stats: null }

  // Active listing counts
  const { count: activeCount } = await supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true })
    .in('municipality_id', municipalityIds)
    .eq('available_in_idx', true)
    .eq('standard_status', 'Active')

  const { count: condoCount } = await supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true })
    .in('municipality_id', municipalityIds)
    .eq('available_in_idx', true)
    .eq('standard_status', 'Active')
    .in('property_subtype', ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
      'Common Element Condo', 'Leasehold Condo', 'Detached Condo'])

  const { count: homeCount } = await supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true })
    .in('municipality_id', municipalityIds)
    .eq('available_in_idx', true)
    .eq('standard_status', 'Active')
    .in('property_subtype', ['Detached', 'Semi-Detached', 'Att/Row/Townhouse',
      'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'])

  const { count: buildingCount } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .in('municipality_id', municipalityIds)

  // Per-municipality stats for cards
  const muniWithStats = await Promise.all(
    municipalities.map(async (m: any) => {
      const { count: active } = await supabase
        .from('mls_listings')
        .select('id', { count: 'exact', head: true })
        .eq('municipality_id', m.id)
        .eq('available_in_idx', true)
        .eq('standard_status', 'Active')

      const { count: buildings } = await supabase
        .from('buildings')
        .select('id', { count: 'exact', head: true })
        .eq('municipality_id', m.id)

      return { ...m, active: active ?? 0, buildings: buildings ?? 0 }
    })
  )

  // Sort by active listings desc
  muniWithStats.sort((a, b) => b.active - a.active)

  return {
    neighbourhood,
    municipalities: muniWithStats,
    stats: {
      active: activeCount ?? 0,
      condos: condoCount ?? 0,
      homes: homeCount ?? 0,
      buildings: buildingCount ?? 0,
    }
  }
}

export default async function NeighbourhoodPage({ params }: Props) {
  const data = await getNeighbourhoodData(params.neighbourhood)
  if (!data) notFound()

  const { neighbourhood, municipalities, stats } = data

  return (
    <div className="min-h-screen bg-white">

      {/* Breadcrumb */}
      <div className="bg-gray-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-700">Home</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">{neighbourhood.name}</span>
          </nav>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <p className="text-sm text-blue-600 font-medium mb-1">Toronto Neighbourhood</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{neighbourhood.name}</h1>

          {stats && (
            <div className="flex flex-wrap gap-6 text-sm mt-4">
              <div>
                <span className="text-2xl font-bold text-gray-900">{stats.active.toLocaleString()}</span>
                <span className="text-gray-500 ml-1 text-sm">Active Listings</span>
              </div>
              <div>
                <span className="text-2xl font-bold text-gray-900">{stats.condos.toLocaleString()}</span>
                <span className="text-gray-500 ml-1 text-sm">Condos</span>
              </div>
              <div>
                <span className="text-2xl font-bold text-gray-900">{stats.homes.toLocaleString()}</span>
                <span className="text-gray-500 ml-1 text-sm">Homes</span>
              </div>
              <div>
                <span className="text-2xl font-bold text-gray-900">{stats.buildings.toLocaleString()}</span>
                <span className="text-gray-500 ml-1 text-sm">Buildings</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Municipality cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">
          Explore {neighbourhood.name}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {municipalities.map((m: any) => (
            <Link
              key={m.id}
              href={`/${m.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors mb-2">
                {m.name}
              </h3>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>{m.active.toLocaleString()} active</span>
                <span>·</span>
                <span>{m.buildings.toLocaleString()} buildings</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}