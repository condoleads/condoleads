// components/admin-homes/BuildingAssignmentSection.tsx
// Building assignment for WALLiam agents (Priority 2)
// Uses agent_geo_buildings — NOT agent_buildings (System 1)
'use client'

import { useState } from 'react'
import { Building2, Check } from 'lucide-react'

interface Building {
  id: string
  building_name: string
  canonical_address: string
  community_id: string | null
}

interface Props {
  agentId: string
  allBuildings: Building[]
  assignedBuildingIds: string[]
}

export default function BuildingAssignmentSection({ agentId, allBuildings, assignedBuildingIds }: Props) {
  const [assigned, setAssigned] = useState<string[]>(assignedBuildingIds)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const filtered = allBuildings.filter(b =>
    b.building_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.canonical_address?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  function toggle(id: string) {
    setAssigned(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin-homes/agents/${agentId}/buildings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingIds: assigned }),
      })
      const data = await res.json()
      if (data.success) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
      else alert('Error: ' + data.error)
    } catch { alert('Failed to save') }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-green-600" /> Building Assignment
          </h2>
          <p className="text-sm text-gray-500 mt-1">Assigned buildings override geo territory for all listings inside. {assigned.length} of {allBuildings.length} assigned.</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50">
          {saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? 'Saving...' : 'Save Buildings'}
        </button>
      </div>

      <input
        type="text"
        placeholder="Search buildings..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        className="w-full px-4 py-2 border rounded-lg mb-4 text-sm"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
        {filtered.map(b => {
          const isAssigned = assigned.includes(b.id)
          return (
            <div
              key={b.id}
              onClick={() => toggle(b.id)}
              className={`border-2 rounded-lg p-3 cursor-pointer transition-all ${isAssigned ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}
            >
              <div className="flex items-start justify-between">
                <Building2 className={`w-5 h-5 mt-0.5 ${isAssigned ? 'text-green-600' : 'text-gray-400'}`} />
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isAssigned ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                  {isAssigned && <Check className="w-3 h-3 text-white" />}
                </div>
              </div>
              <p className="font-semibold text-sm text-gray-900 mt-2">{b.building_name}</p>
              <p className="text-xs text-gray-500">{b.canonical_address}</p>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">No buildings found</div>
      )}
    </div>
  )
}