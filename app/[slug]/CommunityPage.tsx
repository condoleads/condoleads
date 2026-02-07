import { supabase } from '@/lib/supabase/client'

interface CommunityData {
  id: string
  name: string
  slug: string
  municipality_id: string
}

interface CommunityPageProps {
  community: CommunityData
}

export async function generateCommunityMetadata(community: CommunityData) {
  return {
    title: `${community.name} Real Estate | Condos & Homes for Sale`,
    description: `Browse condos and homes for sale in ${community.name}. View listings, pricing, and market data.`,
  }
}

export default async function CommunityPage({ community }: CommunityPageProps) {
  const { data: municipality } = await supabase
    .from('municipalities')
    .select('name, slug, area_id')
    .eq('id', community.municipality_id)
    .single()

  const { data: area } = municipality ? await supabase
    .from('treb_areas')
    .select('name, slug')
    .eq('id', municipality.area_id)
    .single() : { data: null }

  const { count: activeCount } = await supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true })
    .eq('community_id', community.id)
    .eq('standard_status', 'Active')
    .eq('available_in_idx', true)

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <nav className="text-sm text-gray-500 mb-4">
          {area && (
            <>
              <a href={`/${area.slug}`} className="hover:text-blue-600">{area.name}</a>
              <span className="mx-2">&rsaquo;</span>
            </>
          )}
          {municipality && (
            <>
              <a href={`/${municipality.slug}`} className="hover:text-blue-600">{municipality.name}</a>
              <span className="mx-2">&rsaquo;</span>
            </>
          )}
          <span className="text-gray-900">{community.name}</span>
        </nav>

        <h1 className="text-3xl font-bold text-gray-900">{community.name} Real Estate</h1>
        <p className="text-gray-600 mt-2">{activeCount || 0} active listings</p>

        <div className="mt-8">
          <p className="text-gray-500">Listings coming soon.</p>
        </div>
      </div>
    </div>
  )
}