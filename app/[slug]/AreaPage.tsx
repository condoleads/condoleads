import { supabase } from '@/lib/supabase/client'

interface AreaData {
  id: string
  name: string
  slug: string
}

interface AreaPageProps {
  area: AreaData
}

export async function generateAreaMetadata(area: AreaData) {
  return {
    title: `${area.name} Real Estate | Condos & Homes for Sale`,
    description: `Browse condos and homes for sale in ${area.name}. View listings, pricing, and market data.`,
  }
}

export default async function AreaPage({ area }: AreaPageProps) {
  const { data: municipalities } = await supabase
    .from('municipalities')
    .select('id, name, slug')
    .eq('area_id', area.id)
    .order('name')

  const { count: activeCount } = await supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true })
    .eq('area_id', area.id)
    .eq('standard_status', 'Active')
    .eq('available_in_idx', true)

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900">{area.name} Real Estate</h1>
        <p className="text-gray-600 mt-2">{activeCount || 0} active listings</p>

        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Municipalities</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {municipalities?.map((m) => (
              <a
                key={m.id}
                href={`/${m.slug}`}
                className="p-4 border rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
              >
                <span className="font-medium text-gray-900">{m.name}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}