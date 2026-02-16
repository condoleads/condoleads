'use client'

import { useState, useEffect } from 'react'

interface Agent {
  id: string
  full_name: string
  email: string
  inherited?: boolean
}

interface Development {
  id: string
  name: string
  slug: string
}

interface Building {
  id: string
  building_name: string
  canonical_address: string
  slug: string
  listingCount: number
  development_id: string | null
  assignedAgents: Agent[]
  parking_value_sale: number | null
  parking_value_lease: number | null
  locker_value_sale: number | null
  locker_value_lease: number | null
  area: string | null
  municipality: string | null
  municipality_code: string | null
  community: string | null
  neighbourhood: string | null
}

export default function ViewBuildingsTab() {
  const [buildings, setBuildings] = useState<Building[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [developments, setDevelopments] = useState<Development[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Multi-select state
  const [selectedBuildings, setSelectedBuildings] = useState<Set<string>>(new Set())
  const [bulkAssigning, setBulkAssigning] = useState(false)

  // Filters
  const [filterArea, setFilterArea] = useState<string>('')
  const [filterNeighbourhood, setFilterNeighbourhood] = useState<string>('')
  const [filterMunicipality, setFilterMunicipality] = useState<string>('')
  const [filterCommunity, setFilterCommunity] = useState<string>('')
  const [filterAgent, setFilterAgent] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showAll, setShowAll] = useState(false)
  const PAGE_SIZE = 50

  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editParkingSale, setEditParkingSale] = useState<string>('')
  const [editParkingLease, setEditParkingLease] = useState<string>('')
  const [editLockerSale, setEditLockerSale] = useState<string>('')
  const [editLockerLease, setEditLockerLease] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchBuildings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/buildings/list')
      const data = await res.json()
      setBuildings(data.buildings || [])
      setAgents(data.agents || [])
      setDevelopments(data.developments || [])
    } catch (error) {
      console.error('Error fetching buildings:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBuildings()
  }, [])

  const uniqueAreas = [...new Set(buildings.map(b => b.area).filter(Boolean))].sort()
  const uniqueNeighbourhoods = [...new Set(buildings.map(b => b.neighbourhood).filter(Boolean))].sort()
  const uniqueMunicipalities = [...new Set(buildings.map(b => b.municipality_code).filter(Boolean))].sort()
  const uniqueCommunities = [...new Set(buildings.map(b => b.community).filter(Boolean))].sort()

  const openEditModal = (building: Building) => {
    setEditingBuilding(building)
    setEditName(building.building_name || '')
    setEditSlug(building.slug || '')
    setEditParkingSale(building.parking_value_sale?.toString() || '')
    setEditParkingLease(building.parking_value_lease?.toString() || '')
    setEditLockerSale(building.locker_value_sale?.toString() || '')
    setEditLockerLease(building.locker_value_lease?.toString() || '')
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
          slug: editSlug,
          parking_value_sale: editParkingSale ? parseFloat(editParkingSale) : null,
          parking_value_lease: editParkingLease ? parseFloat(editParkingLease) : null,
          locker_value_sale: editLockerSale ? parseFloat(editLockerSale) : null,
          locker_value_lease: editLockerLease ? parseFloat(editLockerLease) : null
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

  const toggleBuildingSelection = (buildingId: string) => {
    setSelectedBuildings(prev => {
      const newSet = new Set(prev)
      if (newSet.has(buildingId)) {
        newSet.delete(buildingId)
      } else {
        newSet.add(buildingId)
      }
      return newSet
    })
  }

  const toggleSelectAll = () => {
    if (selectedBuildings.size === filteredBuildings.length) {
      setSelectedBuildings(new Set())
    } else {
      setSelectedBuildings(new Set(filteredBuildings.map(b => b.id)))
    }
  }

  const clearSelection = () => {
    setSelectedBuildings(new Set())
  }

  const handleBulkAssign = async (agentId: string) => {
    if (!agentId || selectedBuildings.size === 0) return
    const agent = agents.find(a => a.id === agentId)
    const confirmAssign = window.confirm(`Assign ${selectedBuildings.size} building(s) to ${agent?.full_name}?`)
    if (!confirmAssign) return
    setBulkAssigning(true)
    try {
      const res = await fetch('/api/admin/buildings/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingIds: Array.from(selectedBuildings), agentId, action: 'assign' })
      })
      const data = await res.json()
      if (data.success) {
        alert(`Successfully assigned ${data.assigned} building(s) to ${agent?.full_name}`)
        setSelectedBuildings(new Set())
        fetchBuildings()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert('Failed to bulk assign')
    } finally {
      setBulkAssigning(false)
    }
  }

  const handleBulkUnassign = async (agentId: string) => {
    if (!agentId || selectedBuildings.size === 0) return
    const agent = agents.find(a => a.id === agentId)
    const confirmUnassign = window.confirm(`Remove ${agent?.full_name} from ${selectedBuildings.size} building(s)?`)
    if (!confirmUnassign) return
    setBulkAssigning(true)
    try {
      const res = await fetch('/api/admin/buildings/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingIds: Array.from(selectedBuildings), agentId, action: 'unassign' })
      })
      const data = await res.json()
      if (data.success) {
        alert(`Successfully removed ${agent?.full_name} from ${data.unassigned} building(s)`)
        setSelectedBuildings(new Set())
        fetchBuildings()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert('Failed to bulk unassign')
    } finally {
      setBulkAssigning(false)
    }
  }

  const filteredBuildings = buildings.filter(b => {
    const matchesSearch = b.building_name?.toLowerCase().includes(searchTerm.toLowerCase()) || b.canonical_address?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesArea = !filterArea || b.area === filterArea
    const matchesNeighbourhood = !filterNeighbourhood || b.neighbourhood === filterNeighbourhood
    const matchesMunicipality = !filterMunicipality || b.municipality_code === filterMunicipality
    const matchesCommunity = !filterCommunity || b.community === filterCommunity
    const matchesAgent = !filterAgent || b.assignedAgents?.some(a => a.id === filterAgent)
    return matchesSearch && matchesArea && matchesNeighbourhood && matchesMunicipality && matchesCommunity && matchesAgent
  })

  const totalPages = Math.ceil(filteredBuildings.length / PAGE_SIZE)
    const paginatedBuildings = showAll ? filteredBuildings : filteredBuildings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

    useEffect(() => { setCurrentPage(1) }, [searchTerm, filterArea, filterNeighbourhood, filterMunicipality, filterCommunity, filterAgent])

    const clearFilters = () => {
    setSearchTerm('')
    setFilterArea('')
    setFilterNeighbourhood('')
    setFilterMunicipality('')
    setFilterCommunity('')
    setFilterAgent('')
  }

  const hasActiveFilters = searchTerm || filterArea || filterNeighbourhood || filterMunicipality || filterCommunity || filterAgent

  const exportToCSV = () => {
    const headers = ['Building Name', 'Address', 'Area', 'Neighbourhood', 'Municipality', 'Community', 'Listings', 'Agents', 'Slug']
    const rows = filteredBuildings.map(b => [
      b.building_name || '', b.canonical_address || '', b.area || '', b.neighbourhood || '',
      b.municipality_code || '', b.community || '', b.listingCount.toString(),
      b.assignedAgents?.map(a => a.full_name).join('; ') || '', b.slug || ''
    ])
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `buildings_export_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading buildings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">All Buildings</h2>
          <p className="text-sm text-gray-500">{filteredBuildings.length} of {buildings.length} buildings</p>
        </div>
        <button onClick={exportToCSV} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Export CSV
        </button>
      </div>

      {selectedBuildings.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-medium text-blue-900">{selectedBuildings.size} building{selectedBuildings.size > 1 ? 's' : ''} selected</span>
            <button onClick={clearSelection} className="text-sm text-blue-600 hover:text-blue-800">Clear selection</button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Assign to:</label>
              <select onChange={(e) => { if (e.target.value) handleBulkAssign(e.target.value) }} disabled={bulkAssigning} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50" defaultValue="">
                <option value="">Select agent...</option>
                {agents.map(agent => (<option key={agent.id} value={agent.id}>{agent.full_name}</option>))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Remove:</label>
              <select onChange={(e) => { if (e.target.value) handleBulkUnassign(e.target.value) }} disabled={bulkAssigning} className="px-3 py-1.5 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 disabled:opacity-50 text-red-700" defaultValue="">
                <option value="">Select agent...</option>
                {agents.map(agent => (<option key={agent.id} value={agent.id}>{agent.full_name}</option>))}
              </select>
            </div>
            {bulkAssigning && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>}
          </div>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <input type="text" placeholder="Search name or address..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-64" />
          <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
            <option value="">All Areas</option>
            {uniqueAreas.map(a => <option key={a} value={a!}>{a}</option>)}
          </select>
          <select value={filterNeighbourhood} onChange={(e) => setFilterNeighbourhood(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
            <option value="">All Neighbourhoods</option>
            {uniqueNeighbourhoods.map(n => <option key={n} value={n!}>{n}</option>)}
          </select>
          <select value={filterMunicipality} onChange={(e) => setFilterMunicipality(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
            <option value="">All Municipalities</option>
            {uniqueMunicipalities.map(m => <option key={m} value={m!}>{m}</option>)}
          </select>
          <select value={filterCommunity} onChange={(e) => setFilterCommunity(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
            <option value="">All Communities</option>
            {uniqueCommunities.map(c => <option key={c} value={c!}>{c}</option>)}
          </select>
          <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
          {hasActiveFilters && <button onClick={clearFilters} className="px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg">Clear Filters</button>}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left"><input type="checkbox" checked={selectedBuildings.size === filteredBuildings.length && filteredBuildings.length > 0} onChange={toggleSelectAll} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" /></th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Building</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Area</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Neighbourhood</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Muni</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Community</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Listings</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Agents</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedBuildings.map((building) => (
              <tr key={building.id} className={`hover:bg-gray-50 ${selectedBuildings.has(building.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-3 py-3"><input type="checkbox" checked={selectedBuildings.has(building.id)} onChange={() => toggleBuildingSelection(building.id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" /></td>
                <td className="px-3 py-3">
                  <div className="font-medium text-gray-900 truncate max-w-[200px]" title={building.building_name}>{building.building_name || 'Unnamed'}</div>
                  <div className="text-xs text-gray-500 truncate max-w-[200px]" title={building.canonical_address}>{building.canonical_address}</div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{building.area ? <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded">{building.area}</span> : <span className="text-gray-400">-</span>}</td>
                <td className="px-3 py-3 whitespace-nowrap">{building.neighbourhood ? <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">{building.neighbourhood}</span> : <span className="text-gray-400">-</span>}</td>
                <td className="px-3 py-3 whitespace-nowrap">{building.municipality_code ? <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-mono">{building.municipality_code}</span> : <span className="text-gray-400">-</span>}</td>
                <td className="px-3 py-3 whitespace-nowrap"><span className="text-gray-600 truncate block max-w-[120px]" title={building.community || ''}>{building.community || <span className="text-gray-400">-</span>}</span></td>
                <td className="px-3 py-3 whitespace-nowrap text-center"><span className={`px-2 py-1 text-xs rounded-full font-medium ${building.listingCount > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{building.listingCount}</span></td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1 items-center max-w-[180px]">
                    {building.assignedAgents?.slice(0, 2).map(agent => (
                      <span key={agent.id} className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${agent.inherited ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`} title={`${agent.full_name}${agent.inherited ? ' (inherited)' : ''}`}>
                        {agent.full_name.split(' ')[0]}
                        <button onClick={() => handleAgentAssignment(building.id, agent.id, 'unassign')} className="ml-1 hover:text-red-600"></button>
                      </span>
                    ))}
                    {building.assignedAgents?.length > 2 && <span className="text-xs text-gray-500">+{building.assignedAgents.length - 2}</span>}
                    <select onChange={(e) => { if (e.target.value) { handleAgentAssignment(building.id, e.target.value, 'assign'); e.target.value = '' }}} className="text-xs border border-gray-300 rounded px-1 py-0.5 w-8" defaultValue="">
                      <option value="">+</option>
                      {agents.filter(a => !building.assignedAgents?.some(aa => aa.id === a.id)).map(agent => (<option key={agent.id} value={agent.id}>{agent.full_name}</option>))}
                    </select>
                  </div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-right space-x-1">
                  <a href={`https://condoleads.ca/${building.slug}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs">View</a>
                  <button onClick={() => openEditModal(building)} className="text-indigo-600 hover:text-indigo-800 text-xs">Edit</button>
                  <button onClick={() => handleDelete(building)} disabled={deleting === building.id} className="text-red-600 hover:text-red-800 text-xs disabled:opacity-50">{deleting === building.id ? '...' : 'Del'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredBuildings.length === 0 && <div className="text-center py-12 text-gray-500">{hasActiveFilters ? 'No buildings match your filters' : 'No buildings found'}</div>}
      </div>

      {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-2">
            <p className="text-sm text-gray-600">Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredBuildings.length)} of {filteredBuildings.length} buildings</p>
            <button onClick={() => setShowAll(true)} className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded">View All</button>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-50">&laquo;</button>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50">Prev</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) { page = i + 1; }
                else if (currentPage <= 3) { page = i + 1; }
                else if (currentPage >= totalPages - 2) { page = totalPages - 4 + i; }
                else { page = currentPage - 2 + i; }
                return (
                  <button key={page} onClick={() => setCurrentPage(page)} className={`px-3 py-1 text-sm border rounded ${currentPage === page ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'}`}>{page}</button>
                );
              })}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50">Next</button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-50">&raquo;</button>
            </div>
          </div>
        )}

        {editingBuilding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingBuilding(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Edit Building</h3>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Geographic Hierarchy</h4>
              <div className="flex flex-wrap gap-2 text-sm">
                {editingBuilding.area && <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded">{editingBuilding.area}</span>}
                {editingBuilding.neighbourhood && <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">{editingBuilding.neighbourhood}</span>}
                {editingBuilding.municipality_code && <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded font-mono">{editingBuilding.municipality_code}</span>}
                {editingBuilding.community && <span className="px-2 py-1 bg-green-100 text-green-800 rounded">{editingBuilding.community}</span>}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Building Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL)</label>
                <input type="text" value={editSlug} onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm" />
                <p className="text-xs text-gray-500 mt-1">condoleads.ca/{editSlug}</p>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-1">Building-Specific Estimator Values</h4>
              <p className="text-xs text-gray-500 mb-4">Leave empty to use hierarchy defaults</p>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Parking (Sale)</label><input type="number" value={editParkingSale} onChange={(e) => setEditParkingSale(e.target.value)} placeholder="50000" className="w-full px-4 py-2 border border-gray-300 rounded-lg" /><p className="text-xs text-gray-500 mt-1">$/space</p></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Parking (Lease)</label><input type="number" value={editParkingLease} onChange={(e) => setEditParkingLease(e.target.value)} placeholder="200" className="w-full px-4 py-2 border border-gray-300 rounded-lg" /><p className="text-xs text-gray-500 mt-1">$/mo</p></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Locker (Sale)</label><input type="number" value={editLockerSale} onChange={(e) => setEditLockerSale(e.target.value)} placeholder="10000" className="w-full px-4 py-2 border border-gray-300 rounded-lg" /><p className="text-xs text-gray-500 mt-1">$/locker</p></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Locker (Lease)</label><input type="number" value={editLockerLease} onChange={(e) => setEditLockerLease(e.target.value)} placeholder="50" className="w-full px-4 py-2 border border-gray-300 rounded-lg" /><p className="text-xs text-gray-500 mt-1">$/mo</p></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingBuilding(null)} className="px-4 py-2 text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
