'use client'

import { useState, useEffect, useRef } from 'react'

interface PropertyStickyBarProps {
  listing: {
    id: string
    unit_number?: string
    list_price: number
    building_id: string
  }
  buildingName: string
  isSale: boolean
  onEstimateClick: () => void
  onOfferClick: () => void
  isHome?: boolean
}


export default function PropertyStickyBar({
  listing,
  buildingName,
  isSale,
  onEstimateClick,
  onOfferClick,
  isHome = false
}: PropertyStickyBarProps) {
  const [isVisible, setIsVisible] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleScroll = () => {
      // Show after scrolling 400px
      setIsVisible(window.scrollY > 400)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // W-MOBILE-RESPONSIVE Fix B (2026-06-02): publish this bar's measured pixel
  // height to documentElement as --sticky-bar-height so the global Charlie bar
  // (CharlieWidget, mounted by ConditionalLayout) can read it via
  // calc(var(--sticky-bar-height, 0px) + 24px) and stack ABOVE this bar.
  // Cleared on hide/unmount; re-measured on resize.
  useEffect(() => {
    if (!isVisible) {
      document.documentElement.style.removeProperty('--sticky-bar-height')
      return
    }
    const measure = () => {
      if (barRef.current) {
        const h = Math.round(barRef.current.getBoundingClientRect().height)
        document.documentElement.style.setProperty('--sticky-bar-height', h + 'px')
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      document.documentElement.style.removeProperty('--sticky-bar-height')
    }
  }, [isVisible])

  if (!isVisible) return null

  const formatPrice = (price: number, isRental: boolean = false) => {
    if (isRental) {
      return `$${price.toLocaleString('en-CA')}`
    }
    if (price >= 1000000) {
      return `$${(price / 1000000).toFixed(2)}M`
    }
    return `$${Math.round(price / 1000)}K`
  }

  return (
    <div ref={barRef} className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] transform transition-transform duration-300">
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* Mobile Layout */}
        <div className="flex md:hidden items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 truncate">{isHome ? buildingName : `Unit ${listing.unit_number}`}</p>
            <p className="text-sm text-slate-600">{formatPrice(listing.list_price, !isSale)}{!isSale && '/mo'}</p>
          </div>
          <button
            onClick={onEstimateClick}
            className={`px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
              isSale 
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            {isSale ? 'Get Estimate' : 'Get Rent Estimate'}
          </button>
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="font-bold text-slate-900">
                {isHome ? buildingName : `Unit ${listing.unit_number}`} • {isHome ? '' : buildingName}
              </p>
              <p className="text-sm text-slate-600">
                {formatPrice(listing.list_price, !isSale)}{!isSale && '/mo'} • {isSale ? 'For Sale' : 'For Lease'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onEstimateClick}
              className={`px-6 py-2.5 rounded-lg font-semibold transition-colors ${
                isSale 
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              {isSale ? 'Get Sale Estimate' : 'Get Rent Estimate'}
            </button>
            <button
              onClick={onOfferClick}
              className={`px-6 py-2.5 rounded-lg font-semibold transition-colors ${
                isSale 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {isSale ? 'Make an Offer' : 'Apply for Lease'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}