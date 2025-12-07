'use client'

import { useState, useEffect } from 'react'

interface Building {
  id: string
  building_name: string
  canonical_address: string
  slug: string
  total_units: number | null
  year_built: number | null
  created_at: string
  listing_count?: number
}

export default function ViewBuildingsTab() {
  const [buildings, setBuildings] = useState<Building[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchBuildings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/buildings/list')
      const data = await res.json()
      setBuildings(data.buildings || [])
    } catch (error) {
      console.error('Error fetching buildings:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBuildings()
  }, [])

  const handleDelete = async (building: Building) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${building.building_name}"?\n\nThis will also delete:\n- All listings\n- All media/photos\n- All room data\n- Agent assignments\n\nThis action cannot be undone.`
    )

    if (!confirmDelete) return

    setDeleting(building.id)
    try {
      const res = await fetch('/api/admin/buildings/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId: building.id })
      })

      const data = await res.json()

      if (data.success) {
        alert(`Successfully deleted "${building.building_name}" and ${data.deletedListings} listings.`)
        fetchBuildings()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete building')
    } finally {
      setDeleting(null)
    }
  }

  const filteredBuildings = buildings.filter(b =>
    b.building_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.canonical_address?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading buildings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">All Buildings</h2>
          <p className="text-sm text-gray-500">{buildings.length} buildings in database</p>
        </div>
        <input
          type="text"
          placeholder="Search buildings..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
        />
      </div>

      {/* Buildings Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Building</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Units</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Year Built</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredBuildings.map((building) => (
              <tr key={building.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{building.building_name || 'Unnamed'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {building.canonical_address}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {building.total_units || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {building.year_built || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                  {building.slug}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <a
                    href={`https://condoleads.ca/${building.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-900 mr-4"
                  >
                    View
                  </a>
                  <button
                    onClick={() => handleDelete(building)}
                    disabled={deleting === building.id}
                    className="text-red-600 hover:text-red-900 disabled:opacity-50"
                  >
                    {deleting === building.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredBuildings.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {searchTerm ? 'No buildings match your search' : 'No buildings found'}
          </div>
        )}
      </div>
    </div>
  )
}