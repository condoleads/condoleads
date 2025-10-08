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
{/* Adjustment Summary Banner - ONLY FOR SALES */}
      {isSale && result.adjustmentSummary && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200">
          <h3 className="text-lg font-bold text-slate-900 mb-3">Valuation Methodology</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-emerald-600">
                {result.adjustmentSummary.perfectMatches}
              </p>
              <p className="text-sm text-slate-600 mt-1">Perfect Matches</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">
                {result.adjustmentSummary.adjustedComparables}
              </p>
              <p className="text-sm text-slate-600 mt-1">Adjusted Comparables</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-700">
                {formatPrice(result.adjustmentSummary.avgAdjustment)}
              </p>
              <p className="text-sm text-slate-600 mt-1">Avg Adjustment</p>
            </div>
          </div>
          {result.adjustmentSummary.perfectMatches > 0 && (
            <p className="text-sm text-emerald-700 mt-4 font-semibold">
              ✓ Found {result.adjustmentSummary.perfectMatches} exact match{result.adjustmentSummary.perfectMatches > 1 ? 'es' : ''} with identical specs - highest confidence estimate
            </p>
          )}
        </div>
      )}
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

{/* Enhanced Comparables with Adjustments */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-4">
          Recent Comparable {isSale ? 'Sales' : 'Leases'} ({result.comparables.length})
        </h3>
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {result.comparables.slice(0, 8).map((comp, idx) => {
            const hasAdjustments = comp.adjustments && comp.adjustments.length > 0
            const matchQualityColors = {
              Perfect: 'bg-emerald-100 text-emerald-800 border-emerald-300',
              Excellent: 'bg-blue-100 text-blue-800 border-blue-300',
              Good: 'bg-amber-100 text-amber-800 border-amber-300',
              Fair: 'bg-slate-100 text-slate-800 border-slate-300'
            }

            return (
              <div key={idx} className="bg-slate-50 rounded-xl p-5 border-2 border-slate-200 hover:border-slate-300 transition-colors">
                {/* Header with Match Quality Badge */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-bold text-slate-900 text-lg">
                        {comp.bedrooms} bed, {comp.bathrooms} bath
                      </p>
                      {comp.matchQuality && (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border-2 ${matchQualityColors[comp.matchQuality]}`}>
                          {comp.matchQuality} Match
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600">
                      {comp.livingAreaRange} sqft • {comp.parking} parking • {comp.locker === 'Owned' ? 'Has locker' : 'No locker'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {isSale ? 'Sold' : 'Leased'}: {new Date(comp.closeDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} • {comp.daysOnMarket} days
                    </p>
                  </div>
                </div>
                {/* Match Details - WHY this comp was selected */}
<div className="bg-blue-50 rounded-lg p-4 mb-3 border border-blue-200">
  <p className="text-xs font-semibold text-blue-900 mb-2">Match Details:</p>
  <div className="space-y-1 text-xs">
    {/* Bedroom match */}
    <div className="flex items-center gap-2">
      <span className="text-emerald-600">✓</span>
      <span className="text-slate-700">Bedrooms: Exact {comp.bedrooms} bedroom match</span>
    </div>
    
    {/* Square footage match */}
    {comp.exactSqft && (
      <div className="flex items-center gap-2">
        <span className="text-emerald-600">✓</span>
        <span className="text-slate-700">
          Square footage: {comp.exactSqft} sqft{comp.userExactSqft ? ` (yours: ${comp.userExactSqft} sqft)` : ''}
        </span>
      </div>
    )}
    
    {/* Property tax match */}
    {comp.taxAnnualAmount && (
      <div className="flex items-center gap-2">
        <span className="text-emerald-600">✓</span>
        <span className="text-slate-700">
          Property tax: ${Math.round(comp.taxAnnualAmount).toLocaleString()}/year
        </span>
      </div>
    )}
    
    {/* Maintenance fee */}
    {comp.associationFee && comp.associationFee > 0 && (
      <div className="flex items-center gap-2">
        <span className="text-blue-600">ℹ</span>
        <span className="text-slate-700">
          Maintenance: ${Math.round(comp.associationFee).toLocaleString()}/month
        </span>
      </div>
    )}
    
    {/* Parking difference */}
    {comp.adjustments?.find(a => a.type === 'parking') && (
      <div className="flex items-center gap-2">
        <span className="text-amber-600">⚠</span>
        <span className="text-slate-700">
          {comp.adjustments.find(a => a.type === 'parking')?.reason}
        </span>
      </div>
    )}
    
    {/* Locker difference */}
    {comp.adjustments?.find(a => a.type === 'locker') && (
      <div className="flex items-center gap-2">
        <span className="text-amber-600">⚠</span>
        <span className="text-slate-700">
          {comp.adjustments.find(a => a.type === 'locker')?.reason}
        </span>
      </div>
    )}
  </div>
</div>

                {/* Price Breakdown with Adjustments */}
                <div className="bg-white rounded-lg p-4 mt-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-slate-600">Sale Price:</span>
                    <span className="text-lg font-bold text-slate-900">{formatPrice(comp.closePrice)}</span>
                  </div>

                  {/* Show Adjustments */}
                  {isSale && hasAdjustments && comp.adjustments!.map((adj, adjIdx) => (
                    <div key={adjIdx} className="flex justify-between items-center py-2 border-t border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${adj.adjustmentAmount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {adj.adjustmentAmount > 0 ? '↑' : '↓'}
                        </span>
                        <span className="text-sm text-slate-600">{adj.reason}</span>
                      </div>
                      <span className={`text-sm font-semibold ${adj.adjustmentAmount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {adj.adjustmentAmount > 0 ? '+' : ''}{formatPrice(adj.adjustmentAmount)}
                      </span>
                    </div>
                  ))}

                  {/* Adjusted Price */}
                  {isSale && hasAdjustments && (
                    <div className="flex justify-between items-center pt-3 mt-3 border-t-2 border-slate-300">
                      <span className="text-sm font-bold text-slate-900">Adjusted Value:</span>
                      <span className="text-xl font-bold text-emerald-600">{formatPrice(comp.adjustedPrice || comp.closePrice)}</span>
                    </div>
                  )}

                  {/* Perfect Match Indicator */}
                  {isSale && !hasAdjustments && comp.matchQuality === 'Perfect' && (
                    <div className="pt-3 mt-3 border-t-2 border-emerald-300">
                      <p className="text-sm font-semibold text-emerald-700 text-center">
                        ✓ Identical unit specifications - no adjustments needed
                      </p>
                    </div>
                  )}

                  {/* Show original listing price */}
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500">Originally listed:</span>
                    <span className="text-xs text-slate-500">{formatPrice(comp.listPrice)}</span>
                  </div>
                </div>
              </div>
            )
          })}
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