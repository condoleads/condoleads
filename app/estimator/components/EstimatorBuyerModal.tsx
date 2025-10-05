'use client'

import { useState, useEffect } from 'react'
import { estimateSale } from '../actions/estimate-sale'
import { estimateRent } from '../actions/estimate-rent'
import { EstimateResult } from '@/lib/estimator/types'
import EstimatorResults from './EstimatorResults'
import { MLSListing } from '@/lib/types/building'

interface EstimatorBuyerModalProps {
  isOpen: boolean
  onClose: () => void
  listing: MLSListing | null
  buildingName: string
  buildingId: string
  type: 'sale' | 'rent'
}

export default function EstimatorBuyerModal({
  isOpen,
  onClose,
  listing,
  buildingName,
  buildingId,
  type
}: EstimatorBuyerModalProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isSale = type === 'sale'

  // Reset state when modal closes or listing changes
  useEffect(() => {
    if (!isOpen) {
      setResult(null)
      setError(null)
    }
  }, [isOpen, listing])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen || !listing) return null

  const handleEstimate = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    const specs = {
      bedrooms: listing.bedrooms_total || 0,
      bathrooms: listing.bathrooms_total_integer || 0,
      livingAreaRange: listing.living_area_range || '',
      parking: listing.parking_total || 0,
      hasLocker: !!(listing.locker && listing.locker !== 'None'),
      buildingId
    }

    const response = isSale 
      ? await estimateSale(specs, true)
      : await estimateRent(specs, true)

    if (response.success && response.data) {
      setResult(response.data)
    } else {
      setError(response.error || 'Failed to calculate estimate')
    }

    setLoading(false)
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal Drawer - Slides from right */}
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[600px] bg-white shadow-2xl transform transition-transform overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6 shadow-lg z-10">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">
                {isSale ? 'Sale Price Estimate' : 'Rental Price Estimate'}
              </h2>
              <p className="text-emerald-100 text-sm">Unit {listing.unit_number}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-slate-600 mb-6">
            Get an instant {isSale ? 'price' : 'rent'} estimate based on recent {isSale ? 'sales' : 'leases'} in {buildingName}
          </p>

          {/* Unit Specs Summary */}
          <div className="bg-slate-50 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Unit Specifications</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-slate-900">{listing.bedrooms_total || 0}</p>
                <p className="text-sm text-slate-600">Bedrooms</p>
              </div>
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-slate-900">{listing.bathrooms_total_integer || 0}</p>
                <p className="text-sm text-slate-600">Bathrooms</p>
              </div>
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-slate-900">{listing.living_area_range || 'N/A'}</p>
                <p className="text-sm text-slate-600">Sqft</p>
              </div>
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-slate-900">{listing.parking_total || 0}</p>
                <p className="text-sm text-slate-600">Parking</p>
              </div>
            </div>
            <div className="mt-4 text-center p-3 bg-white rounded-lg">
              <p className="text-2xl font-bold text-slate-900">
                {listing.locker && listing.locker !== 'None' ? '✓' : '✗'}
              </p>
              <p className="text-sm text-slate-600">Locker</p>
            </div>
          </div>

          {/* Estimate Button */}
          {!result && !error && (
            <button
              onClick={handleEstimate}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white py-4 px-8 rounded-xl font-semibold text-lg transition-colors shadow-lg"
            >
              {loading ? 'Analyzing Market Data...' : `Get ${isSale ? 'Price' : 'Rent'} Estimate`}
            </button>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-800 font-semibold mb-2">Unable to Generate Estimate</p>
              <p className="text-red-600 text-sm mb-4">{error}</p>
              <button
                onClick={handleEstimate}
                className="bg-red-600 hover:bg-red-700 text-white py-2 px-6 rounded-lg font-semibold transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Results */}
          {result && (
            <div>
              {/* Rental-specific: Show parking/locker breakdown */}
              {!isSale && 'parkingCost' in result && 'lockerCost' in result && (
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h4 className="font-bold text-slate-900 mb-2">Monthly Cost Breakdown</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Base Rent:</span>
                      <span className="font-semibold">${result.estimatedPrice.toLocaleString()}</span>
                    </div>
                    {result.parkingCost > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Parking ({listing.parking_total} space):</span>
                        <span>+${result.parkingCost}</span>
                      </div>
                    )}
                    {result.lockerCost > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Locker:</span>
                        <span>+${result.lockerCost}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-blue-300 font-bold">
                      <span>Total Monthly:</span>
                      <span>${(result.estimatedPrice + (result.parkingCost || 0) + (result.lockerCost || 0)).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              <EstimatorResults result={result} type={type} />
              
              <div className="mt-6 flex gap-4">
                <button
                  onClick={() => setResult(null)}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-xl font-semibold transition-colors"
                >
                  Calculate New Estimate
                </button>
                <button
                  onClick={() => window.location.href = '/contact'}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-semibold transition-colors"
                >
                  Contact Agent
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}