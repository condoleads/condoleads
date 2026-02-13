'use client'

import { useState } from 'react'
import { MLSListing } from '@/lib/types/building'
import ListingCard from './ListingCard'
import HomeListingCard from './HomeListingCard'
import EstimatorBuyerModal from '@/app/estimator/components/EstimatorBuyerModal'
import HomeEstimatorBuyerModal from '@/app/estimator/components/HomeEstimatorBuyerModal'

interface GeoListingSectionProps {
  initialListings: MLSListing[]
  initialTotal: number
  counts: { forSale: number; forLease: number; sold: number; leased: number }
  geoType: 'community' | 'municipality' | 'area'
  geoId: string
  agentId: string
  pageSize?: number
}

type TabType = 'for-sale' | 'for-lease' | 'sold' | 'leased'

export default function GeoListingSection({
  initialListings = [],
  initialTotal = 0,
  counts,
  geoType,
  geoId,
  agentId,
  pageSize = 24,
}: GeoListingSectionProps) {
  const [activeTab, setActiveTab] = useState<TabType>('for-sale')
  const [currentPage, setCurrentPage] = useState(1)
  const [listings, setListings] = useState<MLSListing[]>(initialListings)
  const [totalCount, setTotalCount] = useState(initialTotal)
  const [loading, setLoading] = useState(false)
  const [initialTabLoaded, setInitialTabLoaded] = useState(true)

  // Estimator modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedListing, setSelectedListing] = useState<MLSListing | null>(null)
  const [modalType, setModalType] = useState<'sale' | 'rent'>('sale')
  const [modalExactSqft, setModalExactSqft] = useState<number | null>(null)
  const [selectedIsHome, setSelectedIsHome] = useState(false)

  const totalPages = Math.ceil(totalCount / pageSize)

  const fetchListings = async (tab: TabType, page: number) => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/geo-listings?geoType=${geoType}&geoId=${geoId}&tab=${tab}&page=${page}&pageSize=${pageSize}`
      )
      const data = await res.json()
      setListings(data.listings || [])
      setTotalCount(data.total || 0)
    } catch (err) {
      console.error('Failed to fetch listings:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    setCurrentPage(1)
    if (tab === 'for-sale' && initialTabLoaded) {
      setListings(initialListings)
      setTotalCount(initialTotal)
    } else {
      fetchListings(tab, 1)
      if (tab === 'for-sale') setInitialTabLoaded(false)
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    if (activeTab === 'for-sale' && page === 1 && initialTabLoaded) {
      setListings(initialListings)
      setTotalCount(initialTotal)
    } else {
      fetchListings(activeTab, page)
      if (activeTab === 'for-sale') setInitialTabLoaded(false)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const getType = (): 'sale' | 'lease' => {
    return activeTab === 'for-lease' || activeTab === 'leased' ? 'lease' : 'sale'
  }

  // Handle estimate click from both condo and home cards
  const handleEstimateClick = (listing: MLSListing, type: 'sale' | 'lease', exactSqft: number | null) => {
    const isHome = listing.property_type === 'Residential Freehold' ||
      (!listing.building_id && ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'].includes(listing.property_subtype?.trim() || ''))
    setSelectedListing(listing)
    setModalType(type === 'lease' ? 'rent' : 'sale')
    setModalExactSqft(exactSqft)
    setSelectedIsHome(isHome)
    setModalOpen(true)
  }

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'for-sale', label: 'For Sale', count: counts.forSale },
    { key: 'for-lease', label: 'For Lease', count: counts.forLease },
    { key: 'sold', label: 'Sold', count: counts.sold },
    { key: 'leased', label: 'Leased', count: counts.leased },
  ]

  return (
    <div>
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {!loading && listings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((listing) => {
            const isHome = listing.property_type === 'Residential Freehold' ||
              (!listing.building_id && ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'].some(t => listing.property_subtype?.trim() === t))
            const currentType = getType()
            return isHome ? (
              <HomeListingCard
                key={listing.id}
                listing={listing}
                type={currentType}
                onEstimateClick={(exactSqft) => handleEstimateClick(listing, currentType, exactSqft)}
                agentId={agentId}
              />
            ) : (
              <ListingCard
                key={listing.id}
                listing={listing}
                type={currentType}
                onEstimateClick={(exactSqft) => handleEstimateClick(listing, currentType, exactSqft)}
                agentId={agentId}
              />
            )
          })}
        </div>
      )}

      {!loading && listings.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No listings found.</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <button
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1 || loading}
            className="px-4 py-2 rounded-lg border disabled:opacity-50 hover:bg-gray-50 text-sm">
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">
            Page {currentPage} of {totalPages} ({totalCount} total)
          </span>
          <button
            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages || loading}
            className="px-4 py-2 rounded-lg border disabled:opacity-50 hover:bg-gray-50 text-sm">
            Next
          </button>
        </div>
      )}

      {/* Condo Estimator Modal */}
      {!selectedIsHome && (
        <EstimatorBuyerModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          listing={selectedListing}
          buildingName={(selectedListing as any)?.building_name || selectedListing?.unparsed_address || ''}
          buildingId={selectedListing?.building_id || ''}
          type={modalType === 'rent' ? 'lease' : 'sale'}
          exactSqft={modalExactSqft}
          agentId={agentId}
        />
      )}

      {/* Home Estimator Modal */}
      {selectedIsHome && (
        <HomeEstimatorBuyerModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          listing={selectedListing}
          agentId={agentId}
          type={modalType}
          exactSqft={modalExactSqft}
        />
      )}
    </div>
  )
}