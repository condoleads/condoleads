// app/estimator/components/EstimatorSeller.tsx
'use client'

import { useState } from 'react'
import { estimateSale } from '../actions/estimate-sale'
import { EstimateResult } from '@/lib/estimator/types'
import EstimatorResults from './EstimatorResults'

interface EstimatorSellerProps {
  buildingId: string
  buildingName: string
}

export default function EstimatorSeller({ buildingId, buildingName }: EstimatorSellerProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [specs, setSpecs] = useState({
  bedrooms: 2,
  bathrooms: 2,
  livingAreaRange: '700-799',
  parking: 1,
  hasLocker: false,
  taxAnnualAmount: undefined as number | undefined
})

  const sqftRanges = [
    '0-499',
    '500-599',
    '600-699',
    '700-799',
    '800-899',
    '900-999',
    '1000-1199',
    '1200-1399',
    '1400-1599',
    '1600-1999',
    '2000+'
  ]

  const handleEstimate = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    const response = await estimateSale({
      ...specs,
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
    <section className="py-16 bg-gradient-to-br from-slate-50 to-emerald-50">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold text-slate-900 mb-3">
            What's Your Unit Worth?
          </h2>
          <p className="text-lg text-slate-600">
            Get a free market estimate for your unit in {buildingName}
          </p>
        </div>

        {!result && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h3 className="text-xl font-bold text-slate-900 mb-6">Enter Your Unit Details</h3>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {/* Bedrooms */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Bedrooms
                </label>
                <select
                  value={specs.bedrooms}
                  onChange={(e) => setSpecs({...specs, bedrooms: parseInt(e.target.value)})}  
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="0">Studio</option>
                  <option value="1">1 Bedroom</option>
                  <option value="2">2 Bedrooms</option>
                  <option value="3">3 Bedrooms</option>
                  <option value="4">4+ Bedrooms</option>
                </select>
              </div>

              {/* Bathrooms */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Bathrooms
                </label>
                <select
                  value={specs.bathrooms}
                  onChange={(e) => setSpecs({...specs, bathrooms: parseInt(e.target.value)})} 
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="1">1 Bathroom</option>
                  <option value="2">2 Bathrooms</option>
                  <option value="3">3 Bathrooms</option>
                  <option value="4">4+ Bathrooms</option>
                </select>
              </div>

              {/* Square Footage */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Approximate Square Footage
                </label>
                <select
                  value={specs.livingAreaRange}
                  onChange={(e) => setSpecs({...specs, livingAreaRange: e.target.value})}     
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  {sqftRanges.map(range => (
                    <option key={range} value={range}>{range} sqft</option>
                  ))}
                </select>
              </div>

              {/* Parking */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Parking Spaces
                </label>
                <select
                  value={specs.parking}
                  onChange={(e) => setSpecs({...specs, parking: parseInt(e.target.value)})}   
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="0">No Parking</option>
                  <option value="1">1 Space</option>
                  <option value="2">2 Spaces</option>
                  <option value="3">3+ Spaces</option>
                </select>
              </div>
            </div>
{/* Property Tax */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Annual Property Tax (Optional)
                  <span className="text-xs text-slate-500 ml-2">For better matching</span>
                </label>
                <input
                  type="number"
                  value={specs.taxAnnualAmount || ''}
                  onChange={(e) => setSpecs({...specs, taxAnnualAmount: e.target.value ? parseFloat(e.target.value) : undefined})}
                  placeholder="e.g., 3500"
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            {/* Locker */}
            <div className="mb-8">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={specs.hasLocker}
                  onChange={(e) => setSpecs({...specs, hasLocker: e.target.checked})}
                  className="w-5 h-5 text-emerald-600 border-slate-300 rounded focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-sm font-semibold text-slate-700">
                  Unit includes a storage locker
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleEstimate}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white py-4 px-8 rounded-xl font-semibold text-lg transition-colors shadow-lg"
            >
              {loading ? 'Analyzing Market Data...' : 'Get Free Estimate'}
            </button>

            {/* Error Message */}
            {error && (
              <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-800 font-semibold mb-1">Unable to Generate Estimate</p>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {result && (
          <div>
            <EstimatorResults result={result} />
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
                List Your Unit
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}