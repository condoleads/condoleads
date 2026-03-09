import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Toronto Real Estate – Condos & Homes for Sale | CondoLeads',
  description: 'Browse condos and homes for sale and lease across all Toronto neighbourhoods. Explore Downtown, Midtown, East End, North York, Etobicoke, Scarborough and more.',
}

const NEIGHBOURHOODS = [
  { name: 'Downtown',        slug: 'downtown' },
  { name: 'Midtown | Central', slug: 'midtown-central' },
  { name: 'East End',        slug: 'east-end' },
  { name: 'West End',        slug: 'west-end' },
  { name: 'North York',      slug: 'north-york' },
  { name: 'East York',       slug: 'east-york' },
  { name: 'Scarborough',     slug: 'scarborough' },
  { name: 'Etobicoke',       slug: 'etobicoke' },
  { name: 'York Crosstown',  slug: 'york-crosstown' },
]

async function getTorontoStats() {
  const supabase = createClient()

  // Get all Toronto municipality IDs via the neighbourhood → municipality mapping
  const { data: mappings } = await supabase
    .from('municipality_neighbourhoods')
    .select('municipality_id')
    .limit(10000)

  const municipalityIds = [...new Set((mappings ?? []).map((m: any) => m.municipality_id))]
  if (!municipalityIds.length) return null

  const [
    { count: forSale },
    { count: forLease },
    { count: condos },
    { count: homes },
  ] = await Promise.all([
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
  ])

  return {
    forSale: forSale ?? 0,
    forLease: forLease ?? 0,
    condos: condos ?? 0,
    homes: homes ?? 0,
  }
}

export default async function TorontoPage() {
  const stats = await getTorontoStats()

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

          {stats && (
            <div className="flex flex-wrap gap-8">
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.forSale.toLocaleString()}</div>
                <div className="text-sm text-gray-500">For Sale</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.forLease.toLocaleString()}</div>
                <div className="text-sm text-gray-500">For Lease</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.condos.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Condos</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.homes.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Homes</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Neighbourhood Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Explore Toronto Neighbourhoods</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {NEIGHBOURHOODS.map((n) => (
            <Link
              key={n.slug}
              href={`/toronto/${n.slug}`}
              className="group block p-5 bg-gray-50 border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <div className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                {n.name}
              </div>
              <div className="text-sm text-gray-500 mt-1 group-hover:text-blue-500 transition-colors">
                Browse listings →
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}