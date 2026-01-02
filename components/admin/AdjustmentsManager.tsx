'use client'

import { useState, useEffect } from 'react'

interface Adjustment {
  id: string
  scope_level: string
  scope_name: string
  area_id: string | null
  municipality_id: string | null
  neighbourhood_id: string | null
  community_id: string | null
  building_id: string | null
  parking_value_sale: number | null
  parking_value_lease: number | null
  locker_value_sale: number | null
  locker_value_lease: number | null
}

interface Options {
  areas: { id: string; name: string }[]
  municipalities: { id: string; name: string; code: string }[]
  neighbourhoods: { id: string; name: string }[]
  communities: { id: string; name: string }[]
  buildings: { id: string; building_name: string }[]
}

export default function AdjustmentsManager() {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [options, setOptions] = useState<Options | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Add/Edit modal state
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [scopeLevel, setScopeLevel] = useState<string>('generic')
  const [scopeId, setScopeId] = useState<string>('')
  const [parkingSale, setParkingSale] = useState<string>('')
  const [parkingLease, setParkingLease] = useState<string>('')
  const [lockerSale, setLockerSale] = useState<string>('')
  const [lockerLease, setLockerLease] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const fetchAdjustments = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/adjustments')
      const data = await res.json()
      if (data.success) {
        setAdjustments(data.adjustments || [])
        setOptions(data.options)
      }
    } catch (error) {
      console.error('Error fetching adjustments:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAdjustments()
  }, [])

  const openAddModal = () => {
    setEditingId(null)
    setScopeLevel('area')
    setScopeId('')
    setParkingSale('')
    setParkingLease('')
    setLockerSale('')
    setLockerLease('')
    setShowModal(true)
  }

  const openEditModal = (adj: Adjustment) => {
    setEditingId(adj.id)
    setScopeLevel(adj.scope_level.toLowerCase())
    setScopeId(adj.area_id || adj.municipality_id || adj.neighbourhood_id || adj.community_id || adj.building_id || '')
    setParkingSale(adj.parking_value_sale?.toString() || '')
    setParkingLease(adj.parking_value_lease?.toString() || '')
    setLockerSale(adj.locker_value_sale?.toString() || '')
    setLockerLease(adj.locker_value_lease?.toString() || '')
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        ...(editingId && { id: editingId }),
        scope_level: scopeLevel,
        scope_id: scopeId || null,
        parking_value_sale: parkingSale ? parseFloat(parkingSale) : null,
        parking_value_lease: parkingLease ? parseFloat(parkingLease) : null,
        locker_value_sale: lockerSale ? parseFloat(lockerSale) : null,
        locker_value_lease: lockerLease ? parseFloat(lockerLease) : null
      }

      const res = await fetch('/api/admin/adjustments', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      
      if (data.success) {
        setShowModal(false)
        fetchAdjustments()
      } else {
        alert(data.error || 'Failed to save')
      }
    } catch (error) {
      alert('Failed to save adjustment')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, scopeLevel: string) => {
    if (scopeLevel === 'Generic') {
      alert('Cannot delete generic adjustment. Edit it instead.')
      return
    }
    if (!confirm('Delete this adjustment?')) return
    
    try {
      const res = await fetch(`/api/admin/adjustments?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        fetchAdjustments()
      } else {
        alert(data.error || 'Failed to delete')
      }
    } catch (error) {
      alert('Failed to delete')
    }
  }

  const getScopeOptions = () => {
    if (!options) return []
    switch (scopeLevel) {
      case 'area': return options.areas.map(a => ({ id: a.id, name: a.name }))
      case 'municipality': return options.municipalities.map(m => ({ id: m.id, name: `${m.code} - ${m.name}` }))
      case 'neighbourhood': return options.neighbourhoods.map(n => ({ id: n.id, name: n.name }))
      case 'community': return options.communities.map(c => ({ id: c.id, name: c.name }))
      case 'building': return options.buildings.map(b => ({ id: b.id, name: b.building_name }))
      default: return []
    }
  }

  const getScopeBadgeColor = (level: string) => {
    switch (level) {
      case 'Generic': return 'bg-gray-100 text-gray-800'
      case 'Area': return 'bg-indigo-100 text-indigo-800'
      case 'Municipality': return 'bg-yellow-100 text-yellow-800'
      case 'Neighbourhood': return 'bg-blue-100 text-blue-800'
      case 'Community': return 'bg-green-100 text-green-800'
      case 'Building': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatCurrency = (val: number | null, isLease: boolean) => {
    if (val === null) return <span className="text-gray-400">inherit</span>
    return isLease ? `$${val.toLocaleString()}/mo` : `$${val.toLocaleString()}`
  }

  // Sort adjustments by priority (Generic first, then Area, Municipality, etc.)
  const sortedAdjustments = [...adjustments].sort((a, b) => {
    const order = ['Generic', 'Area', 'Municipality', 'Neighbourhood', 'Community', 'Building']
    return order.indexOf(a.scope_level) - order.indexOf(b.scope_level)
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading adjustments...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Estimator Adjustments</h2>
          <p className="text-sm text-gray-500">Configure parking & locker values by geographic level. Higher priority levels override lower ones.</p>
        </div>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
        >
          + Add Adjustment
        </button>
      </div>

      {/* Priority Legend */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Priority Order (Highest to Lowest):</h3>
        <div className="flex flex-wrap gap-2">
          <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">Building (King)</span>
          <span className="text-gray-400"></span>
          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Community</span>
          <span className="text-gray-400"></span>
          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Neighbourhood</span>
          <span className="text-gray-400"></span>
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">Municipality</span>
          <span className="text-gray-400"></span>
          <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded">Area</span>
          <span className="text-gray-400"></span>
          <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">Generic (Default)</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Level</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Scope</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Parking (Sale)</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Parking (Lease)</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Locker (Sale)</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Locker (Lease)</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortedAdjustments.map((adj) => (
              <tr key={adj.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 text-xs rounded font-medium ${getScopeBadgeColor(adj.scope_level)}`}>
                    {adj.scope_level}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{adj.scope_name}</td>
                <td className="px-4 py-3 text-right font-mono">{formatCurrency(adj.parking_value_sale, false)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatCurrency(adj.parking_value_lease, true)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatCurrency(adj.locker_value_sale, false)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatCurrency(adj.locker_value_lease, true)}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEditModal(adj)} className="text-indigo-600 hover:text-indigo-800 text-xs">Edit</button>
                  {adj.scope_level !== 'Generic' && (
                    <button onClick={() => handleDelete(adj.id, adj.scope_level)} className="text-red-600 hover:text-red-800 text-xs">Del</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold mb-4">{editingId ? 'Edit Adjustment' : 'Add Adjustment'}</h3>
            
            {!editingId && (
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scope Level</label>
                  <select
                    value={scopeLevel}
                    onChange={(e) => { setScopeLevel(e.target.value); setScopeId('') }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="area">Area</option>
                    <option value="municipality">Municipality</option>
                    <option value="neighbourhood">Neighbourhood</option>
                    <option value="community">Community</option>
                    <option value="building">Building</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select {scopeLevel}</label>
                  <select
                    value={scopeId}
                    onChange={(e) => setScopeId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">-- Select --</option>
                    {getScopeOptions().map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {editingId && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <span className={`px-2 py-1 text-xs rounded font-medium ${getScopeBadgeColor(scopeLevel.charAt(0).toUpperCase() + scopeLevel.slice(1))}`}>
                  {scopeLevel.charAt(0).toUpperCase() + scopeLevel.slice(1)}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parking (Sale)</label>
                <input
                  type="number"
                  value={parkingSale}
                  onChange={(e) => setParkingSale(e.target.value)}
                  placeholder="50000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">$/space</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parking (Lease)</label>
                <input
                  type="number"
                  value={parkingLease}
                  onChange={(e) => setParkingLease(e.target.value)}
                  placeholder="200"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">$/mo</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Locker (Sale)</label>
                <input
                  type="number"
                  value={lockerSale}
                  onChange={(e) => setLockerSale(e.target.value)}
                  placeholder="10000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">$/locker</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Locker (Lease)</label>
                <input
                  type="number"
                  value={lockerLease}
                  onChange={(e) => setLockerLease(e.target.value)}
                  placeholder="50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">$/mo</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-4">Leave fields empty to inherit from lower priority levels.</p>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-900">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || (!editingId && !scopeId)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
