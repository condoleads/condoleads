// app/estimator/components/EstimatorBuyer.tsx
'use client'

import { useState } from 'react'
import { estimateSale } from '../actions/estimate-sale'
import { EstimateResult } from '@/lib/estimator/types'
import EstimatorResults from './EstimatorResults'

interface EstimatorBuyerProps {
  buildingId: string
  buildingName: string
  // Pre-filled from listing data
  bedrooms: number
  bathrooms: number
  livingAreaRange: string
  parking: number
  hasLocker: boolean
}

export default function EstimatorBuyer({
  buildingId,
  buildingName,
  bedrooms,
  bathrooms,
  livingAreaRange,
  parking,
  hasLocker
}: EstimatorBuyerProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleEstimate = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    const response = await estimateSale({
      bedrooms,
      bathrooms,
      livingAreaRange,
      parking,
      hasLocker,
      buildingId
    }, true) // includeAI = true

    if (response.success && response.data) {
      setResult(response.data)
    } else {
      setError(response.error || 'Failed to calculate estimate')
    }

    setLoading(false)
  }

  return (
    <section className="py-16 bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold text-slate-900 mb-3">
            What Should You Pay?
          </h2>
          <p className="text-lg text-slate-600">
            Get an instant price estimate for this unit based on recent sales in {buildingName}
          </p>
        </div>

        {/* Unit Specs Summary */}
        <div className="bg-white rounded-xl p-6 mb-6 shadow-md">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Unit Specifications</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-2xl font-bold text-slate-900">{bedrooms}</p>
              <p className="text-sm text-slate-600">Bedrooms</p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-2xl font-bold text-slate-900">{bathrooms}</p>
              <p className="text-sm text-slate-600">Bathrooms</p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-2xl font-bold text-slate-900">{livingAreaRange}</p>
              <p className="text-sm text-slate-600">Sqft</p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-2xl font-bold text-slate-900">{parking}</p>
              <p className="text-sm text-slate-600">Parking</p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-2xl font-bold text-slate-900">{hasLocker ? '' : ''}</p>
              <p className="text-sm text-slate-600">Locker</p>
            </div>
          </div>
        </div>

        {/* Estimate Button */}
        {!result && !error && (
          <button
            onClick={handleEstimate}
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white py-4 px-8 rounded-xl font-semibold text-lg transition-colors shadow-lg"
          >
            {loading ? 'Analyzing Market Data...' : 'Get Price Estimate'}
          </button>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-800 font-semibold mb-2">Unable to Generate Estimate</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-8">
            <EstimatorResults result={result} />
            <button
              onClick={() => setResult(null)}
              className="w-full mt-6 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-xl font-semibold transition-colors"
            >
              Calculate New Estimate
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

