'use client'

import { useState, useEffect } from 'react'
import { formatPrice } from '@/lib/utils/formatters'
import StatusBadge from './StatusBadge'
import { MLSListing } from '@/lib/types/building'
import RegisterModal from '@/components/auth/RegisterModal'

interface PropertyHeaderProps {
  listing: MLSListing & { buildings?: { name: string; address: string } }
  status: 'Active' | 'Closed'
  isSale: boolean
  shouldBlur?: boolean
  buildingId?: string
  onEstimateClick?: () => void
  onOfferClick?: () => void
  isHome?: boolean
}

export default function PropertyHeader({ listing, status, isSale, shouldBlur = false, buildingId, onEstimateClick, onOfferClick, isHome = false }: PropertyHeaderProps) {
  const [showRegister, setShowRegister] = useState(false)
  // W-PROPERTY-HYDRATION pattern C: defer formatTimeAgo (which reads new Date()
  // at render) to post-mount. First paint renders the absolute close_date; the
  // relative "X months ago" appears after hydration. Eliminates the SSR vs
  // client clock-skew hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const isClosed = status === 'Closed'

  // Home pages: h1 already shows the street segment (substring before the first
  // comma). Render only the REMAINDER (city, region, postal) below to avoid
  // repeating the street. Condo pages: h1 is "Unit N" -- no overlap with the
  // full address, so render unparsed_address as-is.
  const fullAddress = listing.unparsed_address || listing.buildings?.address || ''
  const displayAddress = isHome
    ? (fullAddress.includes(',') ? fullAddress.slice(fullAddress.indexOf(',') + 1).trim() : '')
    : fullAddress

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Toronto'
    })
  }
  
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const months = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30))
    
    if (months < 1) return 'less than a month ago'
    if (months === 1) return '1 month ago'
    if (months < 12) return `${months} months ago`
    
    const years = Math.floor(months / 12)
    return years === 1 ? '1 year ago' : `${years} years ago`
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-lg p-8 -mt-16 relative z-10 mx-4 max-w-7xl">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h1 className={`text-3xl font-bold text-slate-900 ${shouldBlur ? 'blur-sm' : ''}`}>
                {isHome ? (listing.unparsed_address?.split(',')[0]?.trim() || 'Property') : `Unit ${listing.unit_number || 'N/A'}`}
              </h1>
              <StatusBadge
                status={status}
                transactionType={listing.transaction_type as 'For Sale' | 'For Lease'}
              />
            </div>
            {displayAddress && (
              <p className={`text-lg text-slate-600 mb-2 ${shouldBlur ? 'blur-sm' : ''}`}>
                {displayAddress}
              </p>
            )}
            {!isHome && listing.buildings?.name && (
              <p className={`text-base text-slate-700 mb-2 font-semibold ${shouldBlur ? 'blur-sm' : ''}`}>
                {listing.buildings.name}
              </p>
            )}
            {isHome && (
              <p className={`text-base text-slate-700 mb-1 ${shouldBlur ? 'blur-sm' : ''}`}>
                {listing.bedrooms_total || 0} Bed · {listing.bathrooms_total_integer || 0} Bath
                {listing.property_subtype ? ` · ${listing.property_subtype}` : ''}
              </p>
            )}
            <p className={`text-sm text-slate-500 ${shouldBlur ? 'blur-sm' : ''}`}>
              MLS #{listing.listing_key || listing.listing_id}
            </p>
          </div>

          <div className="text-right relative">
            {!isClosed ? (
              <div className={shouldBlur ? 'blur-sm' : ''}>
                <div className="text-4xl font-bold text-slate-900">
                  {formatPrice(listing.list_price)}
                  {!isSale && <span className="text-2xl font-normal text-slate-600">/mo</span>}
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  {isSale ? 'Listed Price' : 'Monthly Rent'}
                </p>
                {/* Hero CTA Buttons */}
                {(onEstimateClick || onOfferClick) && (
                  <div className="flex flex-col sm:flex-row gap-2 mt-4">
                    {onEstimateClick && (
                      <button
                        onClick={onEstimateClick}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                          isSale 
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                            : 'bg-purple-600 hover:bg-purple-700 text-white'
                        }`}
                      >
                        {isSale ? 'Get Sale Estimate' : 'Get Rent Estimate'}
                      </button>
                    )}
                    {onOfferClick && (
                      <button
                        onClick={onOfferClick}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                          isSale 
                            ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        {isSale ? 'Make an Offer' : 'Apply for Lease'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className={shouldBlur ? 'blur-sm' : ''}>
                <div className="text-4xl font-bold text-slate-900">
                  {formatPrice(listing.close_price!)}
                  {!isSale && <span className="text-2xl font-normal text-slate-600">/mo</span>}
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  {isSale ? 'Sold' : 'Leased'} on {formatDate(listing.close_date!)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {mounted ? formatTimeAgo(listing.close_date!) : formatDate(listing.close_date!)}
                </p>
                {listing.list_price && (
                  <p className="text-xs text-slate-500 mt-2">
                    Originally listed at {formatPrice(listing.list_price)}
                    {!isSale && '/mo'}  {listing.days_on_market} days on market
                  </p>
                )}
              </div>
            )}

            {shouldBlur && (
              <button
                onClick={() => setShowRegister(true)}
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-lg">
                  Register to View Price
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      <RegisterModal
        isOpen={showRegister}
        onClose={() => setShowRegister(false)}
        onSuccess={() => {
          setShowRegister(false)
          window.location.reload()
        }}
        registrationSource="property_header"
        buildingId={buildingId}
      />
    </>
  )
}
