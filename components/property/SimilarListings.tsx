'use client'

import { useState } from 'react'
import { MLSListing } from '@/lib/types/building'
import ListingCard from '@/app/[slug]/components/ListingCard'

interface SimilarListingsProps {
  listings: MLSListing[]
  title?: string
  initialDisplay?: number
}

export default function SimilarListings({ 
  listings, 
  title = "Similar Units in This Building",
  initialDisplay = 4 
}: SimilarListingsProps) {
  const [showAll, setShowAll] = useState(false)
  
  if (!listings || listings.length === 0) {
    return null
  }
  
  const maxDisplay = 20
  const displayedListings = showAll 
    ? listings.slice(0, maxDisplay)  // Cap at 20 units max
    : listings.slice(0, initialDisplay)
  const hasMore = listings.length > initialDisplay
  const totalToShow = Math.min(listings.length, maxDisplay)
  
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        {hasMore && (
          <span className="text-sm text-slate-600">
            Showing {displayedListings.length} of {listings.length}
          </span>
        )}
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        {displayedListings.map((listing) => {
          const isSale = listing.transaction_type === 'For Sale'
          const type = isSale ? 'sale' : 'rent'
          
          return (
            <ListingCard
              key={listing.id}
              listing={listing}
              type={type}
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
            Show {listings.length > maxDisplay ? `${maxDisplay} More` : `All ${listings.length}`} Units
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