'use client'

import { useState } from 'react'
import HomeListingCard from '@/app/[slug]/components/HomeListingCard'
import { MLSListing } from '@/lib/types/building'
import ListingCard from '@/app/[slug]/components/ListingCard'

interface SimilarListingsProps {
  listings: MLSListing[]
  title?: string
  initialDisplay?: number
  agentId?: string
  isHome?: boolean
}

export default function SimilarListings({ 
  listings, 
  title,
  initialDisplay = 4,
  agentId,
  isHome = false,
}: SimilarListingsProps) {
  const [showAll, setShowAll] = useState(false)
  
  if (!listings || listings.length === 0) {
    return null
  }

  // Auto-detect title if not provided
  const allClosed = listings.every(l => l.standard_status === 'Closed')
  const allActive = listings.every(l => l.standard_status === 'Active')
  
  const defaultTitle = allClosed 
      ? (isHome ? 'Recently Sold Nearby' : 'Similar Sold Units in This Building')
      : allActive
      ? (isHome ? 'Available Nearby' : 'Available For Sale in This Building')
      : (isHome ? 'Similar Properties Nearby' : 'Similar Units in This Building')

  const displayTitle = title || defaultTitle
  
  const maxDisplay = 20
  const displayedListings = showAll 
    ? listings.slice(0, maxDisplay)
    : listings.slice(0, initialDisplay)
  const hasMore = listings.length > initialDisplay
  const totalToShow = Math.min(listings.length, maxDisplay)

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-900">{displayTitle}</h2>
        {hasMore && (
          <span className="text-sm text-slate-600">
            Showing {displayedListings.length} of {listings.length}
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {displayedListings.map((listing) => {
          const isSale = listing.transaction_type === 'For Sale'
          const type = isSale ? 'sale' : 'lease'

          return isHome ? (
            <HomeListingCard
              key={listing.id}
              listing={listing}
              type={type}
              agentId={agentId}
            />
          ) : (
            <ListingCard
              key={listing.id}
              listing={listing}
              type={type}
              agentId={agentId}
            />
          )
        })}
      </div>

      {hasMore && !showAll && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setShowAll(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Show {listings.length > maxDisplay ? `${maxDisplay - initialDisplay} More` : `All ${listings.length}`} {isHome ? 'Properties' : 'Units'}
          </button>
        </div>
      )}

      {showAll && hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setShowAll(false)}
            className="bg-slate-600 hover:bg-slate-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Show Less
          </button>
        </div>
      )}
    </div>
  )
}
