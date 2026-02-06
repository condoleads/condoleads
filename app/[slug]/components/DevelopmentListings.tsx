'use client'

import { useState, useEffect } from 'react'
import ListingCard from './ListingCard'
import EstimatorBuyerModal from '@/app/estimator/components/EstimatorBuyerModal'

interface DevelopmentListingsProps {
  forSaleActive: any[]
  forLeaseActive: any[]
  soldCount: number
  leasedCount: number
  developmentId: string
  developmentName: string
  developmentAddresses: string
  agentId: string
}

type TabType = 'for-sale' | 'for-lease' | 'sold' | 'leased'

export default function DevelopmentListings({
  forSaleActive,
  forLeaseActive,
  soldCount,
  leasedCount,
  developmentId,
  developmentName,
  developmentAddresses,
  agentId
}: DevelopmentListingsProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedListing, setSelectedListing] = useState<any>(null)
  const [modalType, setModalType] = useState<'sale' | 'lease'>('sale')

  const [showAllSale, setShowAllSale] = useState(false)
  const [showAllLease, setShowAllLease] = useState(false)
  const [showAllSold, setShowAllSold] = useState(false)
  const [showAllLeased, setShowAllLeased] = useState(false)

  // Lazy-loaded data for sold/leased tabs
  const [soldListings, setSoldListings] = useState<any[]>([])
  const [leasedListings, setLeasedListings] = useState<any[]>([])
  const [loadingSold, setLoadingSold] = useState(false)
  const [loadingLeased, setLoadingLeased] = useState(false)
  const [soldLoaded, setSoldLoaded] = useState(false)
  const [leasedLoaded, setLeasedLoaded] = useState(false)

  // Determine default tab (first one with listings)
  const getDefaultTab = (): TabType => {
    if (forSaleActive.length > 0) return 'for-sale'
    if (forLeaseActive.length > 0) return 'for-lease'
    if (soldCount > 0) return 'sold'
    if (leasedCount > 0) return 'leased'
    return 'for-sale'
  }

  const [activeTab, setActiveTab] = useState<TabType>(getDefaultTab())

  // Fetch sold/leased data on tab click
  const fetchClosedListings = async (type: 'sold' | 'leased') => {
    if (type === 'sold' && soldLoaded) return
    if (type === 'leased' && leasedLoaded) return

    const setLoading = type === 'sold' ? setLoadingSold : setLoadingLeased
    const setData = type === 'sold' ? setSoldListings : setLeasedListings
    const setLoaded = type === 'sold' ? setSoldLoaded : setLeasedLoaded

    setLoading(true)
    try {
      const res = await fetch(`/api/development-listings?developmentId=${developmentId}&type=${type}`)
      const json = await res.json()
      setData(json.listings || [])
      setLoaded(true)
    } catch (err) {
      console.error(`Failed to fetch ${type} listings:`, err)
    } finally {
      setLoading(false)
    }
  }

  // Handle tab change - fetch data if needed
  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId)
    if (tabId === 'sold') fetchClosedListings('sold')
    if (tabId === 'leased') fetchClosedListings('leased')
  }

  // Handle URL hash navigation (when user clicks stats in hero)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as TabType
      if (['for-sale', 'for-lease', 'sold', 'leased'].includes(hash)) {
        handleTabChange(hash)
      }
    }

    // Check on mount
    handleHashChange()

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleEstimateClick = (listing: any, type: 'sale' | 'lease') => {
    setSelectedListing(listing)
    setModalType(type)
    setModalOpen(true)
  }

  const displayedSale = showAllSale ? forSaleActive : forSaleActive.slice(0, 12)
  const displayedLease = showAllLease ? forLeaseActive : forLeaseActive.slice(0, 12)
  const displayedSold = showAllSold ? soldListings : soldListings.slice(0, 12)
  const displayedLeased = showAllLeased ? leasedListings : leasedListings.slice(0, 12)

  const tabs = [
    { id: 'for-sale' as TabType, label: 'For Sale', count: forSaleActive.length, color: 'emerald' },
    { id: 'for-lease' as TabType, label: 'For Lease', count: forLeaseActive.length, color: 'sky' },
    { id: 'sold' as TabType, label: 'Sold', count: soldCount, color: 'red' },
    { id: 'leased' as TabType, label: 'Leased', count: leasedCount, color: 'orange' },
  ].filter(tab => tab.count > 0) // Only show tabs with listings

  const getTabClasses = (tab: typeof tabs[0]) => {
    const isActive = activeTab === tab.id
    const baseClasses = 'flex-1 py-3 px-2 text-center font-semibold text-sm md:text-base transition-all whitespace-nowrap'

    if (isActive) {
      switch (tab.color) {
        case 'emerald': return `${baseClasses} bg-emerald-600 text-white`
        case 'sky': return `${baseClasses} bg-sky-600 text-white`
        case 'red': return `${baseClasses} bg-red-600 text-white`
        case 'orange': return `${baseClasses} bg-orange-600 text-white`
        default: return `${baseClasses} bg-blue-600 text-white`
      }
    }
    return `${baseClasses} bg-gray-100 text-gray-700 hover:bg-gray-200`
  }

  const getLoadMoreClasses = (color: string) => {
    switch (color) {
      case 'emerald': return 'bg-emerald-600 hover:bg-emerald-700'
      case 'sky': return 'bg-sky-600 hover:bg-sky-700'
      case 'red': return 'bg-red-600 hover:bg-red-700'
      case 'orange': return 'bg-orange-600 hover:bg-orange-700'
      default: return 'bg-blue-600 hover:bg-blue-700'
    }
  }

  const LoadingSpinner = () => (
    <div className="flex justify-center items-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span className="ml-3 text-gray-600">Loading listings...</span>
    </div>
  )

  // No listings at all
  if (tabs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No listings available for this development.
      </div>
    )
  }

  return (
    <>
      {/* Sticky Tab Navigation */}
      <div id="listings" className="sticky top-32 z-10 bg-white shadow-md rounded-lg mb-6">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={getTabClasses(tab)}
            >
              {tab.label}
              <span className="ml-1 md:ml-2">({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* For Sale Tab Content */}
      {activeTab === 'for-sale' && forSaleActive.length > 0 && (
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {displayedSale.map((listing: any) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                type="sale"
                onEstimateClick={() => handleEstimateClick(listing, 'sale')}
                buildingName={developmentName}
                buildingAddress={developmentAddresses}
                buildingSlug={listing.building_slug}
                agentId={agentId}
              />
            ))}
          </div>
          {forSaleActive.length > 12 && (
            <div className="text-center mt-6">
              <button
                onClick={() => setShowAllSale(!showAllSale)}
                className={`px-6 py-3 ${getLoadMoreClasses('emerald')} text-white rounded-lg font-semibold transition-colors`}
              >
                {showAllSale ? 'Show Less' : `Load More (${forSaleActive.length - 12} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* For Lease Tab Content */}
      {activeTab === 'for-lease' && forLeaseActive.length > 0 && (
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {displayedLease.map((listing: any) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                type="lease"
                onEstimateClick={() => handleEstimateClick(listing, 'lease')}
                buildingName={developmentName}
                buildingAddress={developmentAddresses}
                buildingSlug={listing.building_slug}
                agentId={agentId}
              />
            ))}
          </div>
          {forLeaseActive.length > 12 && (
            <div className="text-center mt-6">
              <button
                onClick={() => setShowAllLease(!showAllLease)}
                className={`px-6 py-3 ${getLoadMoreClasses('sky')} text-white rounded-lg font-semibold transition-colors`}
              >
                {showAllLease ? 'Show Less' : `Load More (${forLeaseActive.length - 12} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sold Tab Content */}
      {activeTab === 'sold' && (
        <div className="mb-8">
          {loadingSold ? (
            <LoadingSpinner />
          ) : soldListings.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {displayedSold.map((listing: any) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    type="sale"
                    buildingName={developmentName}
                    buildingAddress={developmentAddresses}
                    buildingSlug={listing.building_slug}
                    agentId={agentId}
                  />
                ))}
              </div>
              {soldListings.length > 12 && (
                <div className="text-center mt-6">
                  <button
                    onClick={() => setShowAllSold(!showAllSold)}
                    className={`px-6 py-3 ${getLoadMoreClasses('red')} text-white rounded-lg font-semibold transition-colors`}
                  >
                    {showAllSold ? 'Show Less' : `Load More (${soldListings.length - 12} remaining)`}
                  </button>
                </div>
              )}
            </>
          ) : soldLoaded ? (
            <div className="text-center py-12 text-gray-500">No sold listings found.</div>
          ) : null}
        </div>
      )}

      {/* Leased Tab Content */}
      {activeTab === 'leased' && (
        <div className="mb-8">
          {loadingLeased ? (
            <LoadingSpinner />
          ) : leasedListings.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {displayedLeased.map((listing: any) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    type="lease"
                    buildingName={developmentName}
                    buildingAddress={developmentAddresses}
                    buildingSlug={listing.building_slug}
                    agentId={agentId}
                  />
                ))}
              </div>
              {leasedListings.length > 12 && (
                <div className="text-center mt-6">
                  <button
                    onClick={() => setShowAllLeased(!showAllLeased)}
                    className={`px-6 py-3 ${getLoadMoreClasses('orange')} text-white rounded-lg font-semibold transition-colors`}
                  >
                    {showAllLeased ? 'Show Less' : `Load More (${leasedListings.length - 12} remaining)`}
                  </button>
                </div>
              )}
            </>
          ) : leasedLoaded ? (
            <div className="text-center py-12 text-gray-500">No leased listings found.</div>
          ) : null}
        </div>
      )}

      {selectedListing && (
        <EstimatorBuyerModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          listing={selectedListing}
          type={modalType}
          buildingName={developmentName}
          buildingId={selectedListing.building_id}
          buildingSlug={selectedListing.building_slug}
          agentId={agentId}
          exactSqft={null}
        />
      )}
    </>
  )
}