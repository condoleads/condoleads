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
}

interface Development {
  id: string
  name: string
  slug: string
  description: string | null
  buildings: Building[]
  assignedAgents: Agent[]
  created_at: string
}

export default function ViewDevelopmentsTab() {
  const [developments, setDevelopments] = useState<Development[]>([])
  const [unassignedBuildings, setUnassignedBuildings] = useState<Building[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingDev, setEditingDev] = useState<Development | null>(null)
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchDevelopments = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/developments/list')
      const data = await res.json()
      setDevelopments(data.developments || [])
      setUnassignedBuildings(data.unassignedBuildings || [])
      setAgents(data.agents || [])
    } catch (error) {
      console.error('Error fetching developments:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDevelopments()
  }, [])

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  const openCreateModal = () => {
    setEditingDev(null)
    setFormName('')
    setFormSlug('')
    setFormDescription('')
    setSelectedBuildingIds([])
    setShowModal(true)
  }

  const openEditModal = (dev: Development) => {
    setEditingDev(dev)
    setFormName(dev.name)
    setFormSlug(dev.slug)
    setFormDescription(dev.description || '')
    setSelectedBuildingIds(dev.buildings.map(b => b.id))
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formName || !formSlug) {
      alert('Name and slug are required')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/developments/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingDev?.id,
          name: formName,
          slug: formSlug,
          description: formDescription,
          buildingIds: selectedBuildingIds
        })
      })
      const data = await res.json()
      if (data.success) {
        alert(editingDev ? 'Development updated!' : 'Development created!')
        setShowModal(false)
        fetchDevelopments()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert('Failed to save development')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (dev: Development) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${dev.name}"?\n\nThis will NOT delete the buildings, only unlink them from this development.`
    )
    if (!confirmDelete) return

    setDeleting(dev.id)
    try {
      const res = await fetch('/api/admin/developments/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ developmentId: dev.id })
      })
      const data = await res.json()
      if (data.success) {
        alert('Development deleted!')
        fetchDevelopments()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert('Failed to delete development')
    } finally {
      setDeleting(null)
    }
  }

  const toggleBuilding = (buildingId: string) => {
    if (selectedBuildingIds.includes(buildingId)) {
      setSelectedBuildingIds(selectedBuildingIds.filter(id => id !== buildingId))
    } else {
      setSelectedBuildingIds([...selectedBuildingIds, buildingId])
    }
  }

  // All buildings available for selection (unassigned + currently assigned to this dev)
  const availableBuildings = editingDev
    ? [...unassignedBuildings, ...editingDev.buildings]
    : unassignedBuildings

  const filteredDevelopments = developments.filter(d =>
    d.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.slug?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading developments...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Developments</h2>
          <p className="text-sm text-gray-500">{developments.length} developments, {unassignedBuildings.length} unassigned buildings</p>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search developments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-64"
          />
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            + New Development
          </button>
        </div>
      </div>

      {/* Developments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Development</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Buildings</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Agents</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredDevelopments.map((dev) => (
              <tr key={dev.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{dev.name}</div>
                  {dev.description && (
                    <div className="text-xs text-gray-500 truncate max-w-[200px]">{dev.description}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono text-xs">
                  {dev.slug}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {dev.buildings.map(b => (
                      <span key={b.id} className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        {b.building_name || b.canonical_address}
                      </span>
                    ))}
                    {dev.buildings.length === 0 && (
                      <span className="text-gray-400 text-sm">No buildings</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {dev.assignedAgents?.map(agent => (
                      <span key={agent.id} className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                        {agent.full_name}
                      </span>
                    ))}
                    {(!dev.assignedAgents || dev.assignedAgents.length === 0) && (
                      <span className="text-gray-400 text-sm">No agents</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button
                    onClick={() => openEditModal(dev)}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(dev)}
                    disabled={deleting === dev.id}
                    className="text-red-600 hover:text-red-900 disabled:opacity-50"
                  >
                    {deleting === dev.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredDevelopments.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {searchTerm ? 'No developments match your search' : 'No developments yet. Create one to group buildings.'}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">
              {editingDev ? 'Edit Development' : 'Create Development'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Development Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value)
                    if (!editingDev) {
                      setFormSlug(generateSlug(e.target.value))
                    }
                  }}
                  placeholder="e.g., The Well, Playground Condos"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL) *</label>
                <input
                  type="text"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="e.g., the-well-455-480-front-st-w-toronto"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">condoleads.ca/{formSlug}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Link Buildings ({selectedBuildingIds.length} selected)
                </label>
                <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto p-2">
                  {availableBuildings.length === 0 ? (
                    <p className="text-gray-500 text-sm p-2">No available buildings to link</p>
                  ) : (
                    availableBuildings.map(b => (
                      <label key={b.id} className="flex items-center p-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBuildingIds.includes(b.id)}
                          onChange={() => toggleBuilding(b.id)}
                          className="mr-3"
                        />
                        <div>
                          <div className="font-medium text-sm">{b.building_name || 'Unnamed'}</div>
                          <div className="text-xs text-gray-500">{b.canonical_address}</div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'Saving...' : (editingDev ? 'Update Development' : 'Create Development')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}