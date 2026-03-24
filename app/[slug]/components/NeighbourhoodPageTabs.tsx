'use client'
import { useState } from 'react'
import { Building2, Home, LayoutGrid, List } from 'lucide-react'
import Link from 'next/link'
import NeighbourhoodListingSection from './NeighbourhoodListingSection'
import { MLSListing } from '@/lib/types/building'

type TopTab = 'all' | 'condos' | 'homes' | 'buildings'

interface Municipality {
  id: string
  name: string
  slug: string
  active: number
  buildings: number
}

interface NeighbourhoodPageTabsProps {
  municipalityIds: string[]
  agentId: string
  tenantId?: string
  buildingCount: number
  municipalities: Municipality[]
  // Initial SSR data (for-sale, all types)
  initialListings?: MLSListing[]
  initialTotal?: number
  counts?: { forSale: number; forLease: number; sold: number; leased: number }
}

export default function NeighbourhoodPageTabs({
  municipalityIds,
  agentId,
  tenantId,
  buildingCount,
  municipalities,
  initialListings,
  initialTotal,
  counts,
}: NeighbourhoodPageTabsProps) {
  const [activeTab, setActiveTab] = useState<TopTab>('all')

  const topTabs: { key: TopTab; label: string; icon: React.ReactNode; count?: number; show: boolean }[] = [
    { key: 'all',       label: 'All Listings', icon: <List className="w-4 h-4" />,     show: true },
    { key: 'condos',    label: 'Condos',       icon: <LayoutGrid className="w-4 h-4" />, show: true },
    { key: 'homes',     label: 'Homes',        icon: <Home className="w-4 h-4" />,     show: true },
    { key: 'buildings', label: 'Buildings',    icon: <Building2 className="w-4 h-4" />, count: buildingCount, show: buildingCount > 0 },
  ]

  return (
    <div>
      {/* Top-level tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {topTabs.map((tab) => (
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
          </button>
        ))}
      </div>

      {/* All listings — pass SSR data so first render is instant */}
      {activeTab === 'all' && (
        <NeighbourhoodListingSection
          municipalityIds={municipalityIds}
          agentId={agentId}
            tenantId={tenantId}
          initialListings={initialListings}
          initialTotal={initialTotal}
          counts={counts}
          pageSize={24}
        />
      )}

      {/* Condos only — no SSR data, client fetches */}
      {activeTab === 'condos' && (
        <NeighbourhoodListingSection
          municipalityIds={municipalityIds}
          agentId={agentId}
            tenantId={tenantId}
          pageSize={24}
          propertyCategory="condo"
        />
      )}

      {/* Homes only — no SSR data, client fetches */}
      {activeTab === 'homes' && (
        <NeighbourhoodListingSection
          municipalityIds={municipalityIds}
          agentId={agentId}
            tenantId={tenantId}
          pageSize={24}
          propertyCategory="homes"
        />
      )}
      {activeTab === 'buildings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {municipalities.filter(m => m.buildings > 0).map(m => (
            <Link key={m.id} href={`/${m.slug}`}
              className="p-4 border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-sm transition-all">
              <div className="font-semibold text-gray-900">{m.name}</div>
              <div className="text-sm text-gray-500 mt-1">
                {m.buildings} buildings · {m.active} active
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}