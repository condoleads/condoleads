// app/admin-homes/page.tsx
import { createClient } from '@/lib/supabase/server'

export default async function AdminHomesDashboard() {
  const supabase = createClient()

  // Get residential listing counts by subtype
  const { data: subtypeCounts } = await supabase
    .from('mls_listings')
    .select('property_subtype, standard_status')
    .is('building_id', null)
    .in('property_subtype', [
      'Detached', 'Semi-Detached', 'Semi-Detached ', 'Att/Row/Townhouse', 
      'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'
    ])

  // Count by subtype
  const subtypeMap: Record<string, { active: number; closed: number; total: number }> = {}
  for (const row of subtypeCounts || []) {
    const key = (row.property_subtype || 'Unknown').trim()
    if (!subtypeMap[key]) subtypeMap[key] = { active: 0, closed: 0, total: 0 }
    subtypeMap[key].total++
    if (row.standard_status === 'Active') subtypeMap[key].active++
    if (row.standard_status === 'Closed') subtypeMap[key].closed++
  }

  const totalHomes = subtypeCounts?.length || 0
  const totalActive = subtypeCounts?.filter(r => r.standard_status === 'Active').length || 0
  const totalClosed = subtypeCounts?.filter(r => r.standard_status === 'Closed').length || 0

  // Get municipality counts
  const { data: muniCounts } = await supabase
    .from('municipalities')
    .select('id, name, homes_count')
    .gt('homes_count', 0)
    .order('homes_count', { ascending: false })
    .limit(20)

  // Get area counts
  const { data: areaCounts } = await supabase
    .from('treb_areas')
    .select('id, name, homes_count')
    .gt('homes_count', 0)
    .order('homes_count', { ascending: false })
    .limit(10)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Residential Homes Dashboard</h1>
      <p className="text-gray-500 mt-1">Freehold properties synced from PropTx</p>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Total Homes</p>
          <p className="text-3xl font-bold text-green-700">{totalHomes.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Active Listings</p>
          <p className="text-3xl font-bold text-green-600">{totalActive.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Sold / Leased</p>
          <p className="text-3xl font-bold text-gray-700">{totalClosed.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Municipalities</p>
          <p className="text-3xl font-bold text-gray-700">{muniCounts?.length || 0}</p>
        </div>
      </div>

      {/* Property Types */}
      <div className="bg-white rounded-lg border mt-6 p-4">
        <h2 className="text-lg font-semibold mb-3">By Property Type</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Type</th>
              <th className="pb-2 text-right">Active</th>
              <th className="pb-2 text-right">Closed</th>
              <th className="pb-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(subtypeMap)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([subtype, counts]) => (
                <tr key={subtype} className="border-b last:border-0">
                  <td className="py-2 font-medium">{subtype}</td>
                  <td className="py-2 text-right text-green-600">{counts.active}</td>
                  <td className="py-2 text-right text-gray-500">{counts.closed}</td>
                  <td className="py-2 text-right font-semibold">{counts.total}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Top Municipalities */}
      {muniCounts && muniCounts.length > 0 && (
        <div className="bg-white rounded-lg border mt-6 p-4">
          <h2 className="text-lg font-semibold mb-3">Top Municipalities (Homes Synced)</h2>
          <div className="grid grid-cols-2 gap-2">
            {muniCounts.map((muni) => (
              <div key={muni.id} className="flex justify-between items-center p-2 rounded bg-gray-50">
                <span className="text-sm font-medium">{muni.name}</span>
                <span className="text-sm text-green-700 font-semibold">{muni.homes_count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border mt-6 p-4">
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="flex gap-3">
          
            href="/admin-homes/bulk-sync"
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium"
          >
             Sync Homes
          </a>
          
            href="/admin-homes/listings"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm font-medium"
          >
             Browse Listings
          </a>
        </div>
      </div>
    </div>
  )
}
