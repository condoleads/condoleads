'use client'

import { useState } from 'react'
import { Building2, Home, LayoutGrid } from 'lucide-react'
import BuildingsGrid from './BuildingsGrid'
import GeoListingSection from './GeoListingSection'
import { MLSListing } from '@/lib/types/building'

type TopTab = 'buildings' | 'condos' | 'homes'

interface GeoPageTabsProps {
  geoType: 'community' | 'municipality' | 'area'
  geoId: string
  agentId: string
  buildingCount: number
  // Initial data for "all" listings (server-rendered for SEO)
  initialListings?: MLSListing[]
  initialTotal?: number
  counts?: { forSale: number; forLease: number; sold: number; leased: number }
  // Tab visibility
  showBuildings?: boolean
  buildingsTitle?: string
}

export default function GeoPageTabs({
  geoType,
  geoId,
  agentId,
  buildingCount,
  initialListings,
  initialTotal,
  counts,
  showBuildings = true,
  buildingsTitle = 'Buildings',
}: GeoPageTabsProps) {
  const [activeTab, setActiveTab] = useState<TopTab>(showBuildings && buildingCount > 0 ? 'buildings' : 'condos')

  const topTabs: { key: TopTab; label: string; icon: React.ReactNode; count: number; show: boolean }[] = [
    {
      key: 'buildings',
      label: 'Buildings',
      icon: <Building2 className="w-4 h-4" />,
      count: buildingCount,
      show: showBuildings && buildingCount > 0,
    },
    {
      key: 'condos',
      label: 'Condos',
      icon: <LayoutGrid className="w-4 h-4" />,
      count: 0, // Will show sub-tab counts
      show: true,
    },
    {
      key: 'homes',
      label: 'Homes',
      icon: <Home className="w-4 h-4" />,
      count: 0,
      show: true,
    },
  ]

  const visibleTabs = topTabs.filter(t => t.show)

  return (
    <div>
      {/* Top-level tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.key === 'buildings' && tab.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'buildings' && (
        <BuildingsGrid
          totalBuildings={buildingCount}
          geoType={geoType}
          geoId={geoId}
          title={buildingsTitle}
        />
      )}

      {activeTab === 'condos' && (
        <GeoListingSection
          initialListings={initialListings}
          initialTotal={initialTotal}
          counts={counts}
          geoType={geoType}
          geoId={geoId}
          agentId={agentId}
          propertyCategory="condo"
        />
      )}

      {activeTab === 'homes' && (
        <GeoListingSection
          geoType={geoType}
          geoId={geoId}
          agentId={agentId}
          propertyCategory="homes"
        />
      )}
    </div>
  )
}