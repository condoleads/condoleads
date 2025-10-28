﻿'use client'

import { useAuth } from '@/components/auth/AuthContext'
import RegisterModal from '@/components/auth/RegisterModal'
import Link from 'next/link'
import { MLSListing } from '@/lib/types/building'
import { formatPrice } from '@/lib/utils/formatters'
import { useState } from 'react'

interface ListingCardProps {
  listing: MLSListing
  type: 'sale' | 'rent'
  onEstimateClick?: (exactSqft: number | null) => void
}

export default function ListingCard({ listing, type, onEstimateClick }: ListingCardProps) {
  const isSale = type === 'sale'
  const isClosed = listing.standard_status === 'Closed'
  const photos = listing.media?.filter(m => m.variant_type === 'large') || []
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)
  const [showRegister, setShowRegister] = useState(false)
  const { user } = useAuth()
  
  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length)
  }
  
  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length)
  }
  
  const getBadgeConfig = () => {
    if (isClosed) {
      if (isSale) {
        return { text: 'Sold', bgColor: 'bg-red-500/90' }
      } else {
        return { text: 'Leased', bgColor: 'bg-orange-500/90' }
      }
    } else {
      if (isSale) {
        return { text: 'For Sale', bgColor: 'bg-emerald-500/90' }
      } else {
        return { text: 'For Rent', bgColor: 'bg-sky-500/90' }
      }
    }
  }

  // Extract exact sqft with rejection logic
  const extractExactSqft = (squareFootSource: string | null): number | null => {
    if (!squareFootSource) return null

    const cleaned = squareFootSource.replace(/,/g, '').toLowerCase()

    // Reject patterns that aren't actual sqft
    if (cleaned.match(/^\+\s*\d+/)) return null
    if (cleaned.match(/^\d+-\d+$/)) return null
    if (cleaned.match(/3rd\s+party/i)) return null

    // Extract first 3-4 digit number
    const match = cleaned.match(/\b(\d{3,4})\b/)
    if (!match) return null

    const value = parseInt(match[1])
    if (value > 5000) return null

    return value
  }

  // Get display sqft with 3-tier priority
  const getDisplaySqft = (): string => {
    const exactSqft = extractExactSqft(listing.square_foot_source)
    if (exactSqft) {
      return `${exactSqft.toLocaleString()}`
    }

    if (listing.living_area_range) {
      return listing.living_area_range
    }

    return '-'
  }

  const badge = getBadgeConfig()
  const shouldBlur = isClosed && !user
  const accentColor = isClosed
    ? (isSale ? 'red' : 'orange')
    : (isSale ? 'emerald' : 'sky')

  const sqftDisplay = getDisplaySqft()
  const parkingCount = listing.parking_total || 0
  const lockerCount = (listing.locker && listing.locker !== 'None') ? 1 : 0
  
  // Get the appropriate price to display
  const displayPrice = isClosed ? (listing.close_price || listing.list_price) : listing.list_price

  return (
    <article className="group bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden h-full flex flex-col">
      {/* Image Carousel */}
      <div className="relative h-48 bg-slate-200 flex-shrink-0"> 
        <div className={shouldBlur ? 'blur-lg' : ''}>
          {photos.length > 0 ? (
            <>
              <img
                src={photos[currentPhotoIndex].media_url}
                alt={`Unit ${listing.unit_number} - Photo ${currentPhotoIndex + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

              {photos.length > 1 && !shouldBlur && (
                <>
                  <button
                    onClick={prevPhoto}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors z-10"
                    aria-label="Previous photo"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={nextPhoto}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors z-10"
                    aria-label="Next photo"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  <div className="absolute bottom-20 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                    {currentPhotoIndex + 1} / {photos.length}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="relative w-full h-full overflow-hidden">
              <div className={`absolute inset-0 ${isSale ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-gradient-to-br from-sky-400 to-sky-600'}`}>
                <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </div>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10">
                <svg className="w-20 h-20 mb-3 opacity-80" fill="currentColor" viewBox="0 0 24 24"> 
                  <path d="M12 3L2 12h3v8h14v-8h3L12 3zm0 2.5L18 11v7h-2v-6h-8v6H6v-7l6-5.5zM10 14h4v4h-4v-4z"/>
                </svg>
                <p className="text-sm font-semibold opacity-90">Photos Coming Soon</p>
              </div>

              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>
          )}
        </div>

        {/* Badge */}
        <div className="absolute top-4 left-4 z-10">
          <span className={`px-3 py-1.5 backdrop-blur-sm rounded-full text-sm font-semibold ${badge.bgColor} text-white`}>
            {badge.text}
          </span>
        </div>

        {/* Price Overlay - Always visible but blurred for closed listings */}
        <div className="absolute bottom-4 left-4 right-4 z-10">
          {!shouldBlur ? (
            <p className="text-3xl font-bold text-white">
              {formatPrice(displayPrice)}
              {!isSale && !isClosed && <span className="text-lg font-normal">/mo</span>}
            </p>
          ) : (
            <div className="blur-sm">
              <p className="text-3xl font-bold text-white">
                {formatPrice(displayPrice)}
              </p>
            </div>
          )}
        </div>

        {/* Blurred Stats Overlay for Closed Listings */}
        {shouldBlur && (
          <div className="absolute top-16 left-4 right-4 z-10">
            <div className="blur-md bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2 text-white space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">{listing.bedrooms_total || 0}</span>
                <span>bed</span>
                <span>|</span>
                <span className="font-semibold">{listing.bathrooms_total_integer || 0}</span>
                <span>bath</span>
                <span>|</span>
                <span className="font-semibold">{sqftDisplay}</span>
                <span>sqft</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span>{parkingCount} parking</span>
                <span>|</span>
                <span>{lockerCount} locker</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col flex-grow">
        {shouldBlur ? (
          // Blurred content preview for closed listings
          <div className="space-y-4">
            {/* Blurred Address/Unit */}
            <div className="blur-sm">
              <h3 className="text-xl font-bold text-slate-900">
                Unit {listing.unit_number || 'N/A'}
              </h3>
              {listing.unparsed_address && (
                <p className="text-sm text-slate-600 mt-1 truncate">
                  {listing.unparsed_address}
                </p>
              )}
            </div>

            {/* Blurred Details */}
            <div className="blur-sm space-y-2">
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <span>{listing.property_type || 'Condo'}</span>
                {listing.association_fee && listing.association_fee > 0 && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span>${Math.round(listing.association_fee)} fees</span>
                  </>
                )}
                {isSale && listing.tax_annual_amount && listing.tax_annual_amount > 0 && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span>${Math.round(listing.tax_annual_amount)} tax</span>
                  </>
                )}
              </div>
              
              <p className="text-xs text-slate-400">
                {listing.listing_key || listing.listing_id ? `MLS #${listing.listing_key || listing.listing_id}` : ''}
              </p>
            </div>

            {/* Register CTA */}
            <div className="pt-4 mt-auto">
              <button
                onClick={() => setShowRegister(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                Register to See {isSale ? 'Sold' : 'Leased'} Details
              </button>
              <p className="text-center text-xs text-slate-500 mt-2">
                View complete {isSale ? 'sale' : 'lease'} history and details
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3">
              <h3 className="text-xl font-bold text-slate-900">
                Unit {listing.unit_number || 'N/A'}
              </h3>
              {listing.unparsed_address && (
                <p className="text-sm text-slate-600 mt-1 truncate">
                  {listing.unparsed_address}
                </p>
              )}
            </div>

            {/* Row 1: Bed/Bath/Sqft */}
            <div className="h-5 flex items-center gap-2 text-slate-700 mb-2 text-sm">
              <span className="font-semibold">{listing.bedrooms_total || 0}</span>
              <span className="text-slate-500">bed</span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold">{listing.bathrooms_total_integer || 0}</span>
              <span className="text-slate-500">bath</span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold">{sqftDisplay}</span>
              <span className="text-slate-500">sqft</span>
            </div>

            {/* Row 2: Parking/Locker */}
            <div className="h-5 flex items-center gap-2 text-slate-700 mb-4 text-sm">
              <span className="font-semibold">{parkingCount}</span>
              <span className="text-slate-500">parking</span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold">{lockerCount}</span>
              <span className="text-slate-500">locker</span>
            </div>

            <div className="flex items-center gap-3 text-sm text-slate-600 mb-4">
              <span>{listing.property_type || 'Condo'}</span>
              {listing.association_fee && listing.association_fee > 0 && (
                <>
                  <span className="text-slate-300">|</span>
                  <span>${Math.round(listing.association_fee)} fees</span>
                </>
              )}
              {isSale && listing.tax_annual_amount && listing.tax_annual_amount > 0 && (
                <>
                  <span className="text-slate-300">|</span>
                  <span>${Math.round(listing.tax_annual_amount)} tax</span>
                </>
              )}
              {listing.days_on_market && (
                <>
                  <span className="text-slate-300">|</span>
                  <span>{listing.days_on_market} days</span>
                </>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
              <p className="text-xs text-slate-400">
                {listing.listing_key || listing.listing_id ? `MLS #${listing.listing_key || listing.listing_id}` : ''}
              </p>
              <div className="flex gap-2">
                {!isClosed && (
                  <button
                    onClick={() => {
                      if (!user) {
                        setShowRegister(true)
                      } else {
                        onEstimateClick?.(extractExactSqft(listing.square_foot_source))
                      }
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-4 rounded-lg text-sm font-semibold transition-colors"
                  >
                    {isSale ? 'Sale Offer' : 'Rent Offer'}
                  </button>
                )}
                <Link
                  href={`/property/${listing.id}`}
                  className={`flex-1 text-sm font-semibold py-2 px-4 rounded-lg border-2 transition-colors text-center border-${accentColor}-600 text-${accentColor}-600 hover:bg-${accentColor}-600 hover:text-white`}
                >
                  View Details
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
      
      <RegisterModal
        isOpen={showRegister}
        onClose={() => setShowRegister(false)}
        onSuccess={() => {
          setShowRegister(false)
          onEstimateClick?.(extractExactSqft(listing.square_foot_source))
        }}
        registrationSource="listing_card"
      />
    </article>
  )
}