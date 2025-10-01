'use client'

import { useState } from 'react'
import { Building, MLSListing } from '@/lib/types/building'
import { parseUnitSizeRange } from '@/lib/utils/calculations'

interface BuildingHighlightsProps {
  building: Building
  listings: MLSListing[]
}

export default function BuildingHighlights({ building, listings }: BuildingHighlightsProps) {
  const [activeTab, setActiveTab] = useState<'highlights' | 'fees'>('highlights')

  const sizeRange = parseUnitSizeRange(listings)

  const listingWithManagement = listings.find(l => l.property_management_company && l.property_management_company.trim() !== '')
  const propertyManagement = listingWithManagement?.property_management_company || ''

  const closedWithDays = listings.filter(l => 
    l.standard_status === 'Closed' && 
    l.days_on_market !== null && 
    l.days_on_market !== undefined
  )
  
  const avgDaysOnMarket = closedWithDays.length > 0
    ? closedWithDays.reduce((sum, l) => sum + l.days_on_market!, 0) / closedWithDays.length
    : null
  
  const condoDemand = avgDaysOnMarket === null 
    ? '' 
    : avgDaysOnMarket < 90 
    ? 'High' 
    : avgDaysOnMarket > 90 
    ? 'Low' 
    : 'Medium'

  const activeCount = listings.filter(l => l.standard_status === 'Active').length
  const unitAvailability = activeCount > 5 ? 'High' : activeCount > 0 ? 'Low' : ''

  const allFeeIncludes = listings
    .flatMap(l => l.association_fee_includes || [])
    .filter(Boolean)

  const hasWater = allFeeIncludes.some(item => item.toLowerCase().includes('water'))
  const hasHeat = allFeeIncludes.some(item => item.toLowerCase().includes('heat'))
  const hasHydro = allFeeIncludes.some(item => item.toLowerCase().includes('hydro') || item.toLowerCase().includes('electric'))
  const hasAC = allFeeIncludes.some(item => item.toLowerCase().includes('cac') || item.toLowerCase().includes('a/c') || item.toLowerCase().includes('air conditioning'))

  return (
    <section className="max-w-7xl mx-auto px-6 mb-16">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('highlights')}
            className={`flex-1 px-6 py-4 text-lg font-semibold transition-colors relative ${
              activeTab === 'highlights' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Highlights
            {activeTab === 'highlights' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-cyan-500" />}
          </button>
          
          <button
            onClick={() => setActiveTab('fees')}
            className={`flex-1 px-6 py-4 text-lg font-semibold transition-colors relative ${
              activeTab === 'fees' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Fees & Utilities
            {activeTab === 'fees' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-cyan-500" />}
          </button>
        </div>

        <div className="p-8">
          {activeTab === 'highlights' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-500 text-xl"></span>
                    <span className="font-semibold text-slate-700">Property Type:</span>
                  </div>
                  <span className="text-slate-900 font-medium">Condo</span>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-500 text-xl"></span>
                    <span className="font-semibold text-slate-700">Number of Units:</span>
                  </div>
                  <span className="text-slate-900 font-medium">{building.total_units || ''}</span>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-500 text-xl"></span>
                    <span className="font-semibold text-slate-700">Condo Demand:</span>
                  </div>
                  <span className="text-slate-900 font-medium">{condoDemand}</span>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-500 text-xl"></span>
                    <span className="font-semibold text-slate-700">Unit Availability:</span>
                  </div>
                  <span className="text-slate-900 font-medium">{unitAvailability}</span>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-500 text-xl"></span>
                    <span className="font-semibold text-slate-700">Number of Storeys:</span>
                  </div>
                  <span className="text-slate-900 font-medium">{building.total_floors || ''}</span>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-500 text-xl"></span>
                    <span className="font-semibold text-slate-700">Condo Completion:</span>
                  </div>
                  <span className="text-slate-900 font-medium">{building.year_built || ''}</span>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-500 text-xl"></span>
                    <span className="font-semibold text-slate-700">Unit Size Range:</span>
                  </div>
                  <span className="text-slate-900 font-medium">{sizeRange}</span>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-500 text-xl"></span>
                    <span className="font-semibold text-slate-700">Property Management:</span>
                  </div>
                  <span className="text-slate-900 font-medium">{propertyManagement}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-500 text-xl"></span>
                    <span className="font-semibold text-slate-700">Water</span>
                  </div>
                  <span className={`font-medium ${hasWater ? 'text-green-600' : 'text-red-600'}`}>
                    {hasWater ? ' Included' : ' Not Included'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-500 text-xl"></span>
                    <span className="font-semibold text-slate-700">Heat</span>
                  </div>
                  <span className={`font-medium ${hasHeat ? 'text-green-600' : 'text-red-600'}`}>
                    {hasHeat ? ' Included' : ' Not Included'}
                  </span>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-500 text-xl"></span>
                    <span className="font-semibold text-slate-700">Hydro</span>
                  </div>
                  <span className={`font-medium ${hasHydro ? 'text-green-600' : 'text-red-600'}`}>
                    {hasHydro ? ' Included' : ' Not Included'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-500 text-xl"></span>
                    <span className="font-semibold text-slate-700">Air Conditioning</span>
                  </div>
                  <span className={`font-medium ${hasAC ? 'text-green-600' : 'text-red-600'}`}>
                    {hasAC ? ' Included' : ' Not Included'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
