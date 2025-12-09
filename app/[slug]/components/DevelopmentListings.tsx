'use client'

import { useState } from 'react'
import ListingCard from './ListingCard'
import EstimatorBuyerModal from '@/app/estimator/components/EstimatorBuyerModal'

interface DevelopmentListingsProps {
  forSaleActive: any[]
  forLeaseActive: any[]
  soldListings: any[]
  leasedListings: any[]
  developmentName: string
  agentId: string
}

export default function DevelopmentListings({
  forSaleActive,
  forLeaseActive,
  soldListings,
  leasedListings,
  developmentName,
  agentId
}: DevelopmentListingsProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedListing, setSelectedListing] = useState<any>(null)
  const [modalType, setModalType] = useState<'sale' | 'lease'>('sale')
  
  const [showAllSale, setShowAllSale] = useState(false)
  const [showAllLease, setShowAllLease] = useState(false)
  const [showAllSold, setShowAllSold] = useState(false)
  const [showAllLeased, setShowAllLeased] = useState(false)

  const handleEstimateClick = (listing: any, type: 'sale' | 'lease') => {
    setSelectedListing(listing)
    setModalType(type)
    setModalOpen(true)
  }

  const displayedSale = showAllSale ? forSaleActive : forSaleActive.slice(0, 12)
  const displayedLease = showAllLease ? forLeaseActive : forLeaseActive.slice(0, 12)
  const displayedSold = showAllSold ? soldListings : soldListings.slice(0, 12)
  const displayedLeased = showAllLeased ? leasedListings : leasedListings.slice(0, 12)

  return (
    <>
      {forSaleActive.length > 0 && (
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Units For Sale ({forSaleActive.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {displayedSale.map((listing: any) => (
              <ListingCard 
                key={listing.id} 
                listing={listing} 
                type="sale" 
                onEstimateClick={() => handleEstimateClick(listing, 'sale')}
              />
            ))}
          </div>
          {forSaleActive.length > 12 && (
            <div className="text-center mt-6">
              <button 
                onClick={() => setShowAllSale(!showAllSale)}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors"
              >
                {showAllSale ? 'Show Less' : `Load More (${forSaleActive.length - 12} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}

      {forLeaseActive.length > 0 && (
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Units For Lease ({forLeaseActive.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedLease.map((listing: any) => (
              <ListingCard 
                key={listing.id} 
                listing={listing} 
                type="lease" 
                onEstimateClick={() => handleEstimateClick(listing, 'lease')}
              />
            ))}
          </div>
          {forLeaseActive.length > 12 && (
            <div className="text-center mt-6">
              <button 
                onClick={() => setShowAllLease(!showAllLease)}
                className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold transition-colors"
              >
                {showAllLease ? 'Show Less' : `Load More (${forLeaseActive.length - 12} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}

      {soldListings.length > 0 && (
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Recently Sold ({soldListings.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedSold.map((listing: any) => (
              <ListingCard key={listing.id} listing={listing} type="sale" />
            ))}
          </div>
          {soldListings.length > 12 && (
            <div className="text-center mt-6">
              <button 
                onClick={() => setShowAllSold(!showAllSold)}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
              >
                {showAllSold ? 'Show Less' : `Load More (${soldListings.length - 12} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}

      {leasedListings.length > 0 && (
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Recently Leased ({leasedListings.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedLeased.map((listing: any) => (
              <ListingCard key={listing.id} listing={listing} type="lease" />
            ))}
          </div>
          {leasedListings.length > 12 && (
            <div className="text-center mt-6">
              <button 
                onClick={() => setShowAllLeased(!showAllLeased)}
                className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition-colors"
              >
                {showAllLeased ? 'Show Less' : `Load More (${leasedListings.length - 12} remaining)`}
              </button>
            </div>
          )}
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
          agentId={agentId}
          exactSqft={null}
        />
      )}
    </>
  )
}