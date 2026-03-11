'use client'

import { useState } from 'react'
import { Building2, Home, LayoutGrid, LayoutList } from 'lucide-react'
import BuildingsGrid from './BuildingsGrid'
import GeoListingSection from './GeoListingSection'
import { MLSListing } from '@/lib/types/building'

type TopTab = 'all' | 'homes' | 'condos' | 'buildings'

interface GeoPageTabsProps {
  geoType: 'community' | 'municipality' | 'area'
  geoId: string
  agentId: string
  buildingCount: number
  initialListings?: MLSListing[]
  initialTotal?: number
  counts?: { forSale: number; forLease: number; sold: number; leased: number }
  homeCounts?: { forSale: number; forLease: number; sold: number; leased: number }
  condoCounts?: { forSale: number; forLease: number; sold: number; leased: number }
  showBuildings?: boolean
  buildingsTitle?: string
}

export default function GeoPageTabs({
  geoType, geoId, agentId, buildingCount,
  initialListings, initialTotal, counts,
  homeCounts, condoCounts,
  showBuildings = true,
  buildingsTitle = 'Buildings',
}: GeoPageTabsProps) {
  const [activeTab, setActiveTab] = useState<TopTab>('all')

  // Total active listings for tab counts
  const allTotal  = (counts?.forSale || 0) + (counts?.forLease || 0)
  const homeTotal = (homeCounts?.forSale || 0) + (homeCounts?.forLease || 0)
  const condoTotal= (condoCounts?.forSale || 0) + (condoCounts?.forLease || 0)

  const topTabs: { key: TopTab; label: string; icon: React.ReactNode; count: number; show: boolean }[] = [
    { key: 'all',       label: 'All Listings', icon: <LayoutList className="w-4 h-4" />, count: allTotal,   show: true },
    { key: 'homes',     label: 'Homes',        icon: <Home className="w-4 h-4" />,       count: homeTotal,  show: true },
    { key: 'condos',    label: 'Condos',       icon: <LayoutGrid className="w-4 h-4" />, count: condoTotal, show: true },
    { key: 'buildings', label: 'Buildings',    icon: <Building2 className="w-4 h-4" />,  count: buildingCount, show: showBuildings && buildingCount > 0 },
  ]

  const visibleTabs = topTabs.filter(t => t.show)

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {visibleTabs.map(tab => (
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
            {tab.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {tab.count.toLocaleString()}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* All Listings — no category filter, uses initial server data */}
      {activeTab === 'all' && (
        <GeoListingSection
          initialListings={initialListings}
          initialTotal={initialTotal}
          counts={counts}
          geoType={geoType}
          geoId={geoId}
          agentId={agentId}
        />
      )}

      {/* Homes */}
      {activeTab === 'homes' && (
        <GeoListingSection
          geoType={geoType}
          geoId={geoId}
          agentId={agentId}
          propertyCategory="homes"
          counts={homeCounts}
        />
      )}

      {/* Condos */}
      {activeTab === 'condos' && (
        <GeoListingSection
          geoType={geoType}
          geoId={geoId}
          agentId={agentId}
          propertyCategory="condo"
          counts={condoCounts}
        />
      )}

      {/* Buildings */}
      {activeTab === 'buildings' && (
        <BuildingsGrid
          totalBuildings={buildingCount}
          geoType={geoType}
          geoId={geoId}
          title={buildingsTitle}
        />
      )}
    </div>
  )
}