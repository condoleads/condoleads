import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function BuildingPage({ params }: { params: { slug: string } }) {
  const { data: building } = await supabase
    .from('buildings')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (!building) return <div className="p-8">Building not found</div>

  const { data: listings } = await supabase
    .from('mls_listings')
    .select('*')
    .eq('building_id', building.id)
    .order('list_price', { ascending: false })

  const activeListings = listings?.filter(l => l.standard_status === 'Active') || []
  const activeSales = activeListings.filter(l => l.list_price > 10000)
  const activeRentals = activeListings.filter(l => l.list_price <= 10000)

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-4">{building.building_name}</h1>
        <p className="text-xl text-gray-600 mb-8">101 Charles Street E, Toronto</p>
        
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-blue-50 p-4 rounded">
            <p className="text-2xl font-bold">{building.total_units || 552}</p>
            <p className="text-gray-600">Total Units</p>
          </div>
          <div className="bg-green-50 p-4 rounded">
            <p className="text-2xl font-bold text-green-600">{activeSales.length}</p>
            <p className="text-gray-600">For Sale</p>
          </div>
          <div className="bg-blue-50 p-4 rounded">
            <p className="text-2xl font-bold text-blue-600">{activeRentals.length}</p>
            <p className="text-gray-600">For Rent</p>
          </div>
        </div>

        {activeSales.length > 0 && (
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="bg-gray-800 text-white p-4">
              <h2 className="text-xl font-bold">Active Listings</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Unit</th>
                  <th className="px-4 py-2 text-left">Price</th>
                  <th className="px-4 py-2 text-left">Beds</th>
                  <th className="px-4 py-2 text-left">Baths</th>
                </tr>
              </thead>
              <tbody>
                {activeSales.map(listing => (
                  <tr key={listing.id} className="border-t">
                    <td className="px-4 py-2">{listing.unit_number}</td>
                    <td className="px-4 py-2 font-bold">${listing.list_price?.toLocaleString()}</td>
                    <td className="px-4 py-2">{listing.bedrooms_total}</td>
                    <td className="px-4 py-2">{listing.bathrooms_total_integer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
