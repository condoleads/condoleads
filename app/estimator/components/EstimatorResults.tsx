// app/estimator/components/EstimatorResults.tsx
'use client'

import { EstimateResult } from '@/lib/estimator/types'
import { formatPrice } from '@/lib/utils/formatters'

interface EstimatorResultsProps {
  result: EstimateResult
  type?: 'sale' | 'rent'
}

export default function EstimatorResults({ result, type = 'sale' }: EstimatorResultsProps) {
  const isSale = type === 'sale'
  
  const confidenceColors = {
    High: 'text-emerald-700 bg-emerald-50',
    Medium: 'text-amber-700 bg-amber-50',
    Low: 'text-slate-700 bg-slate-50'
  }

  const marketSpeedColors = {
    Fast: 'text-emerald-600',
    Moderate: 'text-blue-600',
    Slow: 'text-amber-600'
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 space-y-8">
      {/* Main Estimate */}
      <div className="text-center border-b pb-6">
        <p className="text-sm text-slate-600 mb-2">
          Estimated {isSale ? 'Market Value' : 'Monthly Rent'}
        </p>
        <h2 className="text-5xl font-bold text-slate-900 mb-3">
          {formatPrice(result.estimatedPrice)}
          {!isSale && <span className="text-2xl font-normal">/mo</span>}
        </h2>
        <p className="text-lg text-slate-600">
          Range: {formatPrice(result.priceRange.low)} - {formatPrice(result.priceRange.high)}
          {!isSale && '/mo'}
        </p>
        <div className="mt-4">
          <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${confidenceColors[result.confidence]}`}>
            {result.confidence} Confidence
          </span>
        </div>
      </div>

      {/* Market Speed */}
      <div className="bg-slate-50 rounded-xl p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-3">Market Conditions</h3>
        <div className="flex items-start gap-3">
          <div className={`text-2xl font-bold ${marketSpeedColors[result.marketSpeed.status]}`}>
            {result.marketSpeed.avgDaysOnMarket} days
          </div>
          <div className="flex-1">
            <p className={`font-semibold ${marketSpeedColors[result.marketSpeed.status]} mb-1`}>
              {result.marketSpeed.status} Market
            </p>
            <p className="text-sm text-slate-600">
              {isSale 
                ? result.marketSpeed.message 
                : result.marketSpeed.message.replace(/selling/gi, 'leasing').replace(/sold/gi, 'leased')
              }
            </p>
          </div>
        </div>
      </div>

      {/* AI Insights (if available) */}
      {result.aiInsights && (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 9a1 1 0 112 0v4a1 1 0 11-2 0V9z"/>
            </svg>
            AI Market Insights
          </h3>
          <p className="text-slate-700 mb-4">{result.aiInsights.summary}</p>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">Key Factors:</p>
            <ul className="space-y-1">
              {result.aiInsights.keyFactors.map((factor, idx) => (
                <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="text-purple-600 mt-0.5">•</span>
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-sm font-semibold text-slate-900 mb-1">Market Trend:</p>
            <p className="text-sm text-slate-700">{result.aiInsights.marketTrend}</p>
          </div>
        </div>
      )}

      {/* Comparables */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-4">
          Recent Comparable {isSale ? 'Sales' : 'Leases'} ({result.comparables.length})
        </h3>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {result.comparables.slice(0, 5).map((comp, idx) => (
            <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
              <div className="flex-1">
                <p className="font-semibold text-slate-900">
                  {comp.bedrooms} bed, {comp.bathrooms} bath • {comp.livingAreaRange} sqft
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  {comp.parking} parking • {comp.locker === 'Owned' ? 'Has locker' : 'No locker'} • {comp.daysOnMarket} days on market
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {isSale ? 'Sold' : 'Leased'}: {new Date(comp.closeDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              </div>
              <div className="text-right ml-4">
                <p className="text-lg font-bold text-emerald-600">
                  {formatPrice(comp.closePrice)}{!isSale && '/mo'}
                </p>
                <p className="text-xs text-slate-500">
                  Listed: {formatPrice(comp.listPrice)}{!isSale && '/mo'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="text-xs text-slate-500 pt-4 border-t">
        <p>
          * This estimate is based on recent {isSale ? 'sales' : 'lease'} data and market analysis. Actual market {isSale ? 'value' : 'rent'} may vary based on unit condition, view, finishes, and current market conditions. Contact an agent for a professional evaluation.
        </p>
      </div>
    </div>
  )
}