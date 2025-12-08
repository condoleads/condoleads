'use client'

import { useState, useEffect } from 'react'

interface Agent {
  id: string
  full_name: string
  email: string
}

interface Building {
  id: string
  building_name: string
  canonical_address: string
  slug: string
  listingCount: number
  assignedAgents: Agent[]
}

export default function ViewBuildingsTab() {
  const [buildings, setBuildings] = useState<Building[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Edit modal state
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [saving, setSaving] = useState(false)
  
  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchBuildings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/buildings/list')
      const data = await res.json()
      setBuildings(data.buildings || [])
      setAgents(data.agents || [])
    } catch (error) {
      console.error('Error fetching buildings:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBuildings()
  }, [])

  // Handle Edit
  const openEditModal = (building: Building) => {
    setEditingBuilding(building)
    setEditName(building.building_name || '')
    setEditSlug(building.slug || '')
  }

  const handleSaveEdit = async () => {
    if (!editingBuilding) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/buildings/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingId: editingBuilding.id,
          building_name: editName,
          slug: editSlug
        })
      })
      const data = await res.json()
      if (data.success) {
        alert('Building updated successfully!')
        setEditingBuilding(null)
        fetchBuildings()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert('Failed to update building')
    } finally {
      setSaving(false)
    }
  }

  // Handle Delete
  const handleDelete = async (building: Building) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${building.building_name}"?\n\nThis will also delete:\n- ${building.listingCount} listings\n- All media/photos\n- All room data\n- Agent assignments\n\nThis action cannot be undone.`
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
        alert(`Successfully deleted "${building.building_name}"`)
        fetchBuildings()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert('Failed to delete building')
    } finally {
      setDeleting(null)
    }
  }

  // Handle Agent Assignment
  const handleAgentAssignment = async (buildingId: string, agentId: string, action: 'assign' | 'unassign') => {
    try {
      const res = await fetch('/api/admin/buildings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId, agentId, action })
      })
      const data = await res.json()
      if (data.success) {
        fetchBuildings()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert('Failed to update assignment')
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Building</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Listings</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Agents</th>
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
                  {building.listingCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono text-xs max-w-[200px] truncate" title={building.slug}>
                  {building.slug}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1 items-center">
                    {building.assignedAgents?.map(agent => (
                      <span
                        key={agent.id}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800"
                      >
                        {agent.full_name}
                        <button
                          onClick={() => handleAgentAssignment(building.id, agent.id, 'unassign')}
                          className="ml-1 text-green-600 hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAgentAssignment(building.id, e.target.value, 'assign')
                          e.target.value = ''
                        }
                      }}
                      className="text-sm border border-gray-300 rounded px-2 py-2"
                      defaultValue=""
                    >
                      <option value="">+ Add Agent</option>
                      {agents
                        .filter(a => !building.assignedAgents?.some(aa => aa.id === a.id))
                        .map(agent => (
                          <option key={agent.id} value={agent.id}>{agent.full_name}</option>
                        ))
                      }
                    </select>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <a
                    href={`https://condoleads.ca/${building.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-900"
                  >
                    View
                  </a>
                  <button
                    onClick={() => openEditModal(building)}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    Edit
                  </button>
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

      {/* Edit Modal */}
      {editingBuilding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingBuilding(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold mb-4">Edit Building</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Building Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL)</label>
                <input
                  type="text"
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">condoleads.ca/{editSlug}</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingBuilding(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
