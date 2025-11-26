// app/estimator/components/EstimatorResults.tsx
'use client'
import { useState } from 'react'
import { EstimateResult } from '@/lib/estimator/types'
import { formatPrice } from '@/lib/utils/formatters'
import { MessageSquare, AlertTriangle } from 'lucide-react'
import { getOrCreateLead } from '@/lib/actions/leads'
import { trackActivity } from '@/lib/actions/user-activity'

interface EstimatorResultsProps {
  result: EstimateResult
  type?: 'sale' | 'rent'
  buildingId: string
  buildingName: string
  agentId?: string
  propertySpecs: any
}

export default function EstimatorResults({ 
  result, 
  type = 'sale',
  buildingId,
  buildingName,
  agentId,
  propertySpecs
}: EstimatorResultsProps) {
  const isSale = type === 'sale'
  const [showContactForm, setShowContactForm] = useState(false)
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  
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

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const specs = propertySpecs || {}
    const message = `Received estimate for ${buildingName}: ${formatPrice(result.estimatedPrice)} (${formatPrice(result.priceRange.low)} - ${formatPrice(result.priceRange.high)}). ${specs.bedrooms || 'N/A'}BR/${specs.bathrooms || 'N/A'}BA, ${specs.livingAreaRange || 'N/A'} sqft. Confidence: ${result.confidence}. Would like to discuss accurate valuation.`

    console.log('?? DEBUG EstimatorResults:', { agentId, buildingId, buildingName })
    
    // Only create lead if agentId is provided (agent context)
    if (!agentId) {
      console.log(' No agentId - skipping lead creation (public context)')
      setSubmitted(true)
      setShowContactForm(false)
      return
    }

    // Track estimator usage
    await trackActivity({
      contactEmail: contactForm.email,
      agentId: agentId,
      activityType: type === 'sale' ? 'sale_offer_inquiry' : 'lease_offer_inquiry',
      activityData: {
        buildingId,
        buildingName,
        estimatedPrice: result.estimatedPrice,
        priceRangeLow: result.priceRange.low,
        priceRangeHigh: result.priceRange.high,
        confidence: result.confidence,
        bedrooms: specs.bedrooms,
        bathrooms: specs.bathrooms,
        sqft: specs.livingAreaRange
      }
    })

    const leadResult = await getOrCreateLead({
  agentId,
  contactName: contactForm.name,
  contactEmail: contactForm.email,
  contactPhone: contactForm.phone,
  source: type === 'sale' ? 'sale_offer_inquiry' : 'lease_offer_inquiry',
  buildingId,
  message,
  estimatedValueMin: result.priceRange.low,
  estimatedValueMax: result.priceRange.high,
  propertyDetails: {
    ...(propertySpecs || {}),
    estimatedPrice: result.estimatedPrice,
    confidence: result.confidence,
    marketSpeed: result.marketSpeed.status
  },
  forceNew: true
})

    setIsSubmitting(false)

    if (leadResult.success) {
      setSubmitted(true)
    }
  }

  return (
    <div className="space-y-6">
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
                 Found {result.adjustmentSummary.perfectMatches} exact match{result.adjustmentSummary.perfectMatches > 1 ? 'es' : ''} with identical specs - highest confidence estimate
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
                    <span className="text-purple-600 mt-0.5"></span>
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

        {/* Enhanced Comparables - KEEPING ALL EXISTING CODE */}
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
                        {comp.livingAreaRange} sqft  {comp.parking} parking  {comp.locker === 'Owned' ? 'Has locker' : 'No locker'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {isSale ? 'Sold' : 'Leased'}: {new Date(comp.closeDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}  {comp.daysOnMarket} days
                      </p>
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4 mb-3 border border-blue-200">
                    <p className="text-xs font-semibold text-blue-900 mb-2">Match Details:</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-600"></span>
                        <span className="text-slate-700">Bedrooms: Exact {comp.bedrooms} bedroom match</span>
                      </div>

                      {comp.exactSqft && (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600"></span>
                          <span className="text-slate-700">
                            Square footage: {comp.exactSqft} sqft{comp.userExactSqft ? ` (yours: ${comp.userExactSqft} sqft)` : ''}
                          </span>
                        </div>
                      )}

                      {comp.taxAnnualAmount && (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600"></span>
                          <span className="text-slate-700">
                            Property tax: ${Math.round(comp.taxAnnualAmount).toLocaleString()}/year
                          </span>
                        </div>
                      )}

                      {isSale && comp.associationFee && comp.associationFee > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-blue-600">?</span>
                          <span className="text-slate-700">
                            Maintenance: ${Math.round(comp.associationFee).toLocaleString()}/month
                          </span>
                        </div>
                      )}

                      {comp.adjustments?.find(a => a.type === 'parking') && (
                        <div className="flex items-center gap-2">
                          <span className="text-amber-600"></span>
                          <span className="text-slate-700">
                            {comp.adjustments.find(a => a.type === 'parking')?.reason}
                          </span>
                        </div>
                      )}

                      {comp.adjustments?.find(a => a.type === 'locker') && (
                        <div className="flex items-center gap-2">
                          <span className="text-amber-600"></span>
                          <span className="text-slate-700">
                            {comp.adjustments.find(a => a.type === 'locker')?.reason}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 mt-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-600">Sale Price:</span>
                      <span className="text-lg font-bold text-slate-900">{formatPrice(comp.closePrice)}</span>
                    </div>

                    {isSale && hasAdjustments && comp.adjustments!.map((adj, adjIdx) => (
                      <div key={adjIdx} className="flex justify-between items-center py-2 border-t border-slate-200">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm ${adj.adjustmentAmount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {adj.adjustmentAmount > 0 ? '' : ''}
                          </span>
                          <span className="text-sm text-slate-600">{adj.reason}</span>
                        </div>
                        <span className={`text-sm font-semibold ${adj.adjustmentAmount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {adj.adjustmentAmount > 0 ? '+' : ''}{formatPrice(adj.adjustmentAmount)}
                        </span>
                      </div>
                    ))}

                    {isSale && hasAdjustments && (
                      <div className="flex justify-between items-center pt-3 mt-3 border-t-2 border-slate-300">
                        <span className="text-sm font-bold text-slate-900">Adjusted Value:</span>
                        <span className="text-xl font-bold text-emerald-600">{formatPrice(comp.adjustedPrice || comp.closePrice)}</span>
                      </div>
                    )}

                    {isSale && !hasAdjustments && comp.matchQuality === 'Perfect' && (
                      <div className="pt-3 mt-3 border-t-2 border-emerald-300">
                        <p className="text-sm font-semibold text-emerald-700 text-center">
                           Identical unit specifications - no adjustments needed
                        </p>
                      </div>
                    )}

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

        {/* Standard Disclaimer */}
        <div className="text-xs text-slate-500 pt-4 border-t">
          <p>
            * This estimate is based on recent {isSale ? 'sales' : 'lease'} data and market analysis. Actual market {isSale ? 'value' : 'rent'} may vary based on unit condition, view, finishes, and current market conditions. Contact an agent for a professional evaluation.
          </p>
        </div>
      </div>

      {/*  IMPORTANT DISCLAIMER + CONTACT AGENT */}
      <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 rounded-2xl border-2 border-amber-300 p-8 shadow-lg">
        <div className="flex items-start gap-4 mb-6">
          <div className="flex-shrink-0">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              Important: AI Estimates Require Human Verification
            </h3>
            <div className="space-y-3 text-gray-700">
              <p className="font-semibold">
                While our algorithm analyzes hundreds of data points, these numbers should NOT be relied upon for making financial decisions.
              </p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1"></span>
                  <span>Unit condition, view quality, and upgrades significantly impact value</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1"></span>
                  <span>Market dynamics change daily - timing matters</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1"></span>
                  <span>Building reputation and location nuances aren't captured by algorithms</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1"></span>
                  <span className="font-bold">Human expertise is irreplaceable - talk to a real agent for accurate pricing</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        {!submitted ? (
          !showContactForm ? (
            <button
              onClick={() => setShowContactForm(true)}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-5 px-8 rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3 text-lg"
            >
              <MessageSquare className="w-6 h-6" />
              Talk to an Agent - Get Accurate Pricing
            </button>
          ) : (
            <form onSubmit={handleContactSubmit} className="bg-white rounded-xl p-6 space-y-4">
              <h4 className="font-bold text-gray-900 text-lg mb-4">Connect with Your Agent</h4>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Name *</label>
                <input
                  type="text"
                  required
                  value={contactForm.name}
                  onChange={(e) => setContactForm({...contactForm, name: e.target.value})}
                  placeholder="John Doe"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
                <input
                  type="email"
                  required
                  value={contactForm.email}
                  onChange={(e) => setContactForm({...contactForm, email: e.target.value})}
                  placeholder="john@example.com"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                <input
                  type="tel"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({...contactForm, phone: e.target.value})}
                  placeholder="(416) 555-1234"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Sending...' : 'Get Professional Evaluation'}
              </button>
            </form>
          )
        ) : (
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h4 className="text-xl font-bold text-green-900 mb-2">Request Received!</h4>
            <p className="text-green-800">Your agent will contact you within 24 hours with an accurate market evaluation.</p>
          </div>
        )}
      </div>
    </div>
  )
}


