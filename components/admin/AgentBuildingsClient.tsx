'use client'

import { useState } from 'react'
import { Building2, Check, ArrowLeft } from 'lucide-react'

export default function AgentBuildingsClient({ agent, allBuildings, assignedBuildings }) {
  const [assigned, setAssigned] = useState(assignedBuildings.map(function(b) { return b.id }))
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)

  const filteredBuildings = allBuildings.filter(function(building) {
    return building.building_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           building.canonical_address?.toLowerCase().includes(searchTerm.toLowerCase())
  })

  function toggleBuilding(buildingId) {
    if (assigned.includes(buildingId)) {
      setAssigned(assigned.filter(function(id) { return id !== buildingId }))
    } else {
      setAssigned([...assigned, buildingId])
    }
  }

  async function saveAssignments() {
    setSaving(true)
    
    try {
      const response = await fetch('/api/admin/agents/' + agent.id + '/buildings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingIds: assigned })
      })

      const data = await response.json()

      if (data.success) {
        alert('Successfully assigned ' + data.count + ' buildings to ' + agent.full_name)
        window.location.reload()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      alert('Error saving assignments')
    }
    
    setSaving(false)
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <a href="/admin/agents" className="flex items-center text-blue-600 hover:text-blue-700 mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Agents
        </a>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Assign Buildings</h1>
            <p className="text-gray-600">Managing buildings for {agent.full_name}</p>
          </div>
          <button 
            onClick={saveAssignments} 
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:bg-blue-400"
          >
            {saving ? 'Saving...' : 'Save Assignments'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600">Total Buildings</p>
          <p className="text-3xl font-bold text-gray-900">{allBuildings.length}</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600">Assigned</p>
          <p className="text-3xl font-bold text-green-600">{assigned.length}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600">Unassigned</p>
          <p className="text-3xl font-bold text-gray-600">{allBuildings.length - assigned.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow mb-6 p-6">
        <input 
          type="text" 
          placeholder="Search buildings..." 
          value={searchTerm} 
          onChange={function(e) { setSearchTerm(e.target.value) }} 
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
        <p className="mt-4 text-sm text-gray-600">
          Showing {filteredBuildings.length} of {allBuildings.length} buildings
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBuildings.map(function(building) {
          const isAssigned = assigned.includes(building.id)
          
          return (
            <div 
              key={building.id}
              onClick={function() { toggleBuilding(building.id) }}
              className={'border-2 rounded-lg p-4 cursor-pointer transition-all ' + (isAssigned ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-blue-300')}
            >
              <div className="flex items-start justify-between mb-2">
                <Building2 className={'w-8 h-8 ' + (isAssigned ? 'text-green-600' : 'text-gray-400')} />
                {isAssigned ? (
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-gray-300"></div>
                )}
              </div>
              
              <h3 className="font-semibold text-gray-900 mb-1">{building.building_name}</h3>
              <p className="text-sm text-gray-600 mb-2">{building.canonical_address}</p>
              <p className="text-xs text-gray-500">{building.total_units} units</p>
            </div>
          )
        })}
      </div>

      {filteredBuildings.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No buildings found
        </div>
      )}
    </div>
  )
}