'use client'

import { MLSListing } from '@/lib/types/building'
import { formatPrice } from '@/lib/utils/formatters'
import { useState } from 'react'

interface ListingCardProps {
  listing: MLSListing
  type: 'sale' | 'rent'
  onEstimateClick?: () => void
}

export default function ListingCard({ listing, type, onEstimateClick }: ListingCardProps) {
  const isSale = type === 'sale'
  const isClosed = listing.standard_status === 'Closed'
  const photos = listing.media?.filter(m => m.variant_type === 'large') || []
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)
  
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

  const formatSqftRange = (range: string | null) => {
    if (!range) return null
    return range
  }
  
  const badge = getBadgeConfig()
  const accentColor = isClosed
    ? (isSale ? 'red' : 'orange')
    : (isSale ? 'emerald' : 'sky')

  const sqftRange = formatSqftRange(listing.living_area_range)
  const parkingCount = listing.parking_total || 0
  const lockerCount = (listing.locker && listing.locker !== 'None') ? 1 : 0

  return (
    <article className="group bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden h-full flex flex-col">
      {/* Image Carousel */}
      <div className="relative h-64 bg-slate-200 flex-shrink-0">
        {photos.length > 0 ? (
          <>
            <img
              src={photos[currentPhotoIndex].media_url}
              alt={\Unit \ - Photo \\}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

            {photos.length > 1 && (
              <>
                <button
                  onClick={prevPhoto}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors z-10"
                  aria-label=\"Previous photo\"
                >
                  <svg className="w-6 h-6" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">
                    <path strokeLinecap=\"round\" strokeLinejoin=\"round\" strokeWidth={2} d=\"M15 19l-7-7 7-7\" />
                  </svg>
                </button>
                <button
                  onClick={nextPhoto}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors z-10"
                  aria-label=\"Next photo\"
                >
                  <svg className="w-6 h-6" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">
                    <path strokeLinecap=\"round\" strokeLinejoin=\"round\" strokeWidth={2} d=\"M9 5l7 7-7 7\" />
                  </svg>
                </button>

                <div className="absolute bottom-20 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                  {currentPhotoIndex + 1} / {photos.length}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className={\w-full h-full \\} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </>
        )}

        <div className="absolute top-4 left-4 z-10">
          <span className={\px-3 py-1.5 backdrop-blur-sm rounded-full text-sm font-semibold \ text-white\}>
            {badge.text}
          </span>
        </div>

        <div className="absolute bottom-4 left-4 right-4 z-10">
          <p className="text-3xl font-bold text-white">
            {formatPrice(listing.list_price)}
            {!isSale && !isClosed && <span className="text-lg font-normal">/mo</span>}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col flex-grow">
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

        {/* Row 1: Bed/Bath/Sqft - Fixed Height */}
        <div className="h-5 flex items-center gap-2 text-slate-700 mb-2 text-sm">
          <span className="font-semibold">{listing.bedrooms_total || 0}</span>
          <span className="text-slate-500">bed</span>
          <span className="text-slate-300">|</span>
          <span className="font-semibold">{listing.bathrooms_total_integer || 0}</span>
          <span className="text-slate-500">bath</span>
          {sqftRange && (
            <>
              <span className="text-slate-300">|</span>
              <span className="font-semibold">{sqftRange}</span>
              <span className="text-slate-500">sqft</span>
            </>
          )}
        </div>

        {/* Row 2: Parking/Locker - Fixed Height */}
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
              <span>\ fees</span>
            </>
          )}
          {listing.days_on_market && (
            <>
              <span className="text-slate-300">|</span>
              <span>{listing.days_on_market} days</span>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
          <p className="text-xs text-slate-400">
            {listing.listing_key || listing.listing_id ? \MLS #\\ : ''}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onEstimateClick}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-4 rounded-lg text-sm font-semibold transition-colors"
            >
              Value Estimate
            </button>
            <button className={\lex-1 text-sm font-semibold py-2 px-4 rounded-lg border-2 transition-colors border-\-600 text-\-600 hover:bg-\-600 hover:text-white\}>
              View Details
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
