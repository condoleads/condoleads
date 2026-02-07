import { supabase } from '@/lib/supabase/client'

interface MunicipalityData {
  id: string
  name: string
  slug: string
  area_id: string
}

interface MunicipalityPageProps {
  municipality: MunicipalityData
}

export async function generateMunicipalityMetadata(municipality: MunicipalityData) {
  return {
    title: `${municipality.name} Real Estate | Condos & Homes for Sale`,
    description: `Browse condos and homes for sale in ${municipality.name}. View listings, pricing, and market data.`,
  }
}

export default async function MunicipalityPage({ municipality }: MunicipalityPageProps) {
  const { data: communities } = await supabase
    .from('communities')
    .select('id, name, slug')
    .eq('municipality_id', municipality.id)
    .order('name')

  const { count: activeCount } = await supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true })
    .eq('municipality_id', municipality.id)
    .eq('standard_status', 'Active')
    .eq('available_in_idx', true)

  const { data: area } = await supabase
    .from('treb_areas')
    .select('name, slug')
    .eq('id', municipality.area_id)
    .single()

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {area && (
          <nav className="text-sm text-gray-500 mb-4">
            <a href={`/${area.slug}`} className="hover:text-blue-600">{area.name}</a>
            <span className="mx-2">&rsaquo;</span>
            <span className="text-gray-900">{municipality.name}</span>
          </nav>
        )}

        <h1 className="text-3xl font-bold text-gray-900">{municipality.name} Real Estate</h1>
        <p className="text-gray-600 mt-2">{activeCount || 0} active listings</p>

        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Communities</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {communities?.map((c) => (
              <a
                key={c.id}
                href={`/${c.slug}`}
                className="p-4 border rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
              >
                <span className="font-medium text-gray-900">{c.name}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}