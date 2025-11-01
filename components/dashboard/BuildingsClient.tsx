'use client'

import { useState } from 'react'
import { Building2, Users, TrendingUp, MapPin, Calendar, Layers } from 'lucide-react'

interface BuildingsClientProps {
  buildings: any[]
  agentId: string
}

export default function BuildingsClient({ buildings, agentId }: BuildingsClientProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredBuildings = buildings.filter((building) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      building.building_name?.toLowerCase().includes(searchLower) ||
      building.canonical_address?.toLowerCase().includes(searchLower)
    )
  })

  const totalLeads = buildings.reduce((sum, b) => sum + b.lead_count, 0)
  const totalHotLeads = buildings.reduce((sum, b) => sum + b.hot_leads, 0)
  const buildingsWithLeads = buildings.filter(b => b.lead_count > 0).length

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Buildings</h1>
        <p className="text-gray-600">View your assigned buildings and lead activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Buildings</p>
              <p className="text-3xl font-bold text-gray-900">{buildings.length}</p>
            </div>
            <Building2 className="w-12 h-12 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Buildings</p>
              <p className="text-3xl font-bold text-green-600">{buildingsWithLeads}</p>
            </div>
            <TrendingUp className="w-12 h-12 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Leads</p>
              <p className="text-3xl font-bold text-blue-600">{totalLeads}</p>
            </div>
            <Users className="w-12 h-12 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Hot Leads</p>
              <p className="text-3xl font-bold text-red-600">{totalHotLeads}</p>
            </div>
            <TrendingUp className="w-12 h-12 text-red-600" />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search buildings..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBuildings.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No buildings found</p>
          </div>
        ) : (
          filteredBuildings.map((building) => (
            <div key={building.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow border border-gray-200">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{building.building_name}</h3>
                    <div className="flex items-center text-sm text-gray-600 mb-2">
                      <MapPin className="w-4 h-4 mr-1" />
                      {building.canonical_address}
                    </div>
                  </div>
                  <Building2 className="w-8 h-8 text-blue-600 flex-shrink-0" />
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4 pb-4 border-b">
                  <div className="flex items-center text-sm">
                    <Layers className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="text-gray-600">{building.total_units || 0} units</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Building2 className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="text-gray-600">{building.total_floors || 0} floors</span>
                  </div>
                  {building.year_built && (
                    <div className="flex items-center text-sm col-span-2">
                      <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-gray-600">Built in {building.year_built}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Total Leads</span>
                    <span className="text-lg font-bold text-blue-600">{building.lead_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">New Leads</span>
                    <span className="text-sm font-semibold text-green-600">{building.new_leads}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Hot Leads</span>
                    <span className="text-sm font-semibold text-red-600">{building.hot_leads}</span>
                  </div>
                </div>

                <a href={'/dashboard/leads?building=' + building.id} className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  View Leads
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
