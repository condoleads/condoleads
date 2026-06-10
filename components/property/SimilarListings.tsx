'use client'

import { useState } from 'react'
import HomeListingCard from '@/app/[slug]/components/HomeListingCard'
import { MLSListing } from '@/lib/types/building'
import ListingCard from '@/app/[slug]/components/ListingCard'
import { extractExactSqft } from '@/lib/estimator/types'
import EstimatorBuyerModal from '@/app/estimator/components/EstimatorBuyerModal'
import HomeEstimatorBuyerModal from '@/app/estimator/components/HomeEstimatorBuyerModal'

// 2026-06-10 SimilarListings estimator wiring fix.
// Reference pattern copied from app/[slug]/components/NeighbourhoodListingSection.tsx
// (the known-good Walliam wiring). isHomeProperty detector copied verbatim
// from that file so the home/condo branch is identical.
//
// System-1 untouched: this component is reached from the shared property
// detail page (app/property/[id]/{Property,HomeProperty}PageClient.tsx).
// When tenantId is undefined (legacy condoleads.ca subdomain traffic), the
// modal wiring stays inactive — cards do not receive onEstimateClick, so
// the Sale Offer / Lease Offer button behaves exactly as it did pre-fix
// on the System 1 path. The fix only activates when tenantId is present
// (Walliam tenant), mirroring the c1/c2 tenant-gated additive pattern.
const isHomeProperty = (listing: MLSListing) =>
  listing.property_type === 'Residential Freehold' ||
  (!listing.building_id && ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link',
    'Duplex', 'Triplex', 'Fourplex', 'Multiplex'].some(t => listing.property_subtype?.trim() === t))

interface SimilarListingsProps {
  listings: MLSListing[]
  title?: string
  initialDisplay?: number
  agentId?: string
  isHome?: boolean
  tenantId?: string
}

export default function SimilarListings({
  listings,
  title,
  initialDisplay = 4,
  agentId,
  isHome = false,
  tenantId,
}: SimilarListingsProps) {
  const [showAll, setShowAll] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedListing, setSelectedListing] = useState<MLSListing | null>(null)
  const [modalType, setModalType] = useState<'sale' | 'rent'>('sale')
  const [modalExactSqft, setModalExactSqft] = useState<number | null>(null)
  const [selectedIsHome, setSelectedIsHome] = useState(false)

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

  // Mirror of NeighbourhoodListingSection.handleEstimateClick.
  const handleEstimateClick = (listing: MLSListing, type: 'sale' | 'lease', exactSqft: number | null) => {
    setSelectedListing(listing)
    setModalType(type === 'lease' ? 'rent' : 'sale')
    setModalExactSqft(exactSqft)
    setSelectedIsHome(isHomeProperty(listing))
    setModalOpen(true)
  }

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
          // Tenant-gated additive wiring: onEstimateClick only threaded when
          // a tenant is present (Walliam). null-tenant (System 1) path
          // receives no handler, preserving pre-fix dead-button behavior
          // exactly. isHome prop is the parent's hint; we still re-check
          // each listing via isHomeProperty inside handleEstimateClick so
          // mixed cohorts resolve correctly.
          const onEstimateClick = tenantId
            ? (sqft: number | null) => handleEstimateClick(listing, type, sqft)
            : undefined
          const cardIsHome = isHome || isHomeProperty(listing)

          return cardIsHome ? (
            <HomeListingCard
              key={listing.id}
              listing={listing}
              type={type}
              agentId={agentId}
              onEstimateClick={onEstimateClick}
            />
          ) : (
            <ListingCard
              key={listing.id}
              listing={listing}
              type={type}
              agentId={agentId}
              onEstimateClick={onEstimateClick}
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

      {/* Modals — only rendered when tenantId is present (S2 path). The S1
          path has tenantId undefined, so neither modal is in the tree and
          the cards' buttons stay inert (matches pre-fix behavior). */}
      {tenantId && !selectedIsHome && (
        <EstimatorBuyerModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          listing={selectedListing}
          buildingName={(selectedListing as any)?.building_name || selectedListing?.unparsed_address || ''}
          buildingId={selectedListing?.building_id || ''}
          type={modalType === 'rent' ? 'lease' : 'sale'}
          exactSqft={modalExactSqft}
          agentId={agentId || ''}
          tenantId={tenantId}
        />
      )}
      {tenantId && selectedIsHome && (
        <HomeEstimatorBuyerModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          listing={selectedListing}
          agentId={agentId || ''}
          tenantId={tenantId}
          type={modalType}
          exactSqft={modalExactSqft}
        />
      )}
    </div>
  )
}
