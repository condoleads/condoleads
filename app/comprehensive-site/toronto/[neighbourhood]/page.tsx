import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import GeoListingSection from '@/app/[slug]/components/GeoListingSection'

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
    description: `Browse condos and homes in ${n.name}, Toronto.`,
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

  const { data: mappings } = await supabase
    .from('municipality_neighbourhoods')
    .select('municipality_id, municipalities(id, name, slug)')
    .eq('neighbourhood_id', neighbourhood.id)

  const municipalities = (mappings ?? [])
    .map((m: any) => m.municipalities)
    .filter(Boolean)

  const municipalityIds = municipalities.map((m: any) => m.id)
  if (!municipalityIds.length) return { neighbourhood, municipalities: [], stats: null }

  // Active counts
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

  // Buildings via communities → municipality
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

  // Per-municipality stats
  const muniWithStats = await Promise.all(
    municipalities.map(async (m: any) => {
      const { count: active } = await supabase
        .from('mls_listings')
        .select('id', { count: 'exact', head: true })
        .eq('municipality_id', m.id)
        .eq('available_in_idx', true)
        .eq('standard_status', 'Active')

      // Buildings via communities
      const { data: muniComms } = await supabase
        .from('communities')
        .select('id')
        .eq('municipality_id', m.id)
      const muniCommIds = (muniComms ?? []).map((c: any) => c.id)
      const { count: buildings } = muniCommIds.length
        ? await supabase
            .from('buildings')
            .select('id', { count: 'exact', head: true })
            .in('community_id', muniCommIds)
        : { count: 0 }

      return { ...m, active: active ?? 0, buildings: buildings ?? 0 }
    })
  )

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

      {/* Listings per municipality */}
      {municipalities.map((m: any) => (
        <div key={m.id} className="border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold text-gray-900">{m.name}</h2>
              <Link
                href={`/${m.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                View all →
              </Link>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {m.active.toLocaleString()} active · {m.buildings.toLocaleString()} buildings
            </p>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
            <GeoListingSection
              geoType="municipality"
              geoId={m.id}
              agentId=""
              pageSize={6}
            />
          </div>
        </div>
      ))}
    </div>
  )
}