// app/estimator/components/EstimatorResults.tsx
'use client'

import { useState, useEffect } from 'react'
import { EstimateResult, TEMPERATURE_CONFIG } from '@/lib/estimator/types'
import { formatPrice } from '@/lib/utils/formatters'
import { MessageSquare, AlertTriangle, Phone } from 'lucide-react'
import { getOrCreateLead } from '@/lib/actions/leads'
import { trackActivity } from '@/lib/actions/user-activity'
import { useAuth } from '@/components/auth/AuthContext'

interface EstimatorResultsProps {
  result: EstimateResult
  type?: 'sale' | 'lease' | 'estimator'
  buildingId: string
  buildingName: string
  buildingAddress?: string
  unitNumber?: string
  agentId?: string
  propertySpecs: any
}

export default function EstimatorResults({ 
  result, 
  type = 'sale',
  buildingId,
  buildingName,
  buildingAddress,
  unitNumber,
  agentId,
  propertySpecs
}: EstimatorResultsProps) {
  const isSale = type === 'sale' || type === 'estimator'
  const { user } = useAuth()
  const [showContactForm, setShowContactForm] = useState(true)
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Pre-fill form with user data
  useEffect(() => {
    if (user) {
      setContactForm({
        name: user.user_metadata?.full_name || user.user_metadata?.name || '',
        email: user.email || '',
        phone: user.user_metadata?.phone || ''
      })
    }
  }, [user])
  const [submitted, setSubmitted] = useState(false)

  const confidenceColors: Record<string, string> = {
    'High': 'text-emerald-700 bg-emerald-50 border-emerald-200',
    'Medium-High': 'text-green-700 bg-green-50 border-green-200',
    'Medium': 'text-amber-700 bg-amber-50 border-amber-200',
    'Medium-Low': 'text-orange-600 bg-orange-50 border-orange-200',
    'Low': 'text-red-700 bg-red-50 border-red-200',
    'None': 'text-slate-700 bg-slate-50 border-slate-200'
  }

  const marketSpeedColors = {
    Fast: 'text-emerald-600',
    Moderate: 'text-blue-600',
    Slow: 'text-amber-600'
  }

  const temperatureDisplay = {
    HOT: { icon: '🔥', label: 'Hot', color: 'text-red-600 bg-red-50 border-red-200' },
    WARM: { icon: '🌡️', label: 'Warm', color: 'text-orange-600 bg-orange-50 border-orange-200' },
    COLD: { icon: '❄️', label: 'Cold', color: 'text-blue-600 bg-blue-50 border-blue-200' },
    FROZEN: { icon: '🧊', label: 'Frozen', color: 'text-slate-600 bg-slate-50 border-slate-200' }
  }

  const tierLabels: Record<string, { label: string; description: string }> = {
    'BINGO': { label: 'Perfect Matches', description: 'Identical units with exact sqft (±10%)' },
    'BINGO-ADJ': { label: 'Perfect Matches (Adjusted)', description: 'Identical sqft with parking/locker adjustments' },
    'RANGE': { label: 'Same Size Units', description: 'Same sqft range with matching specs' },
    'RANGE-ADJ': { label: 'Same Size Units (Adjusted)', description: 'Same sqft range with parking/locker adjustments' },
    'MAINT': { label: 'Similar Size Units', description: 'Similar maintenance fee (±20%) as size proxy' },
    'MAINT-ADJ': { label: 'Similar Size Units (Adjusted)', description: 'Similar maintenance with parking/locker adjustments' },
    'CONTACT': { label: 'Market Reference', description: 'Recent sales for context only' }
  }

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const specs = propertySpecs || {}
    const message = result.showPrice 
      ? `Received estimate for ${buildingName}${unitNumber ? ` Unit ${unitNumber}` : ''}${buildingAddress ? ` (${buildingAddress})` : ''}: ${formatPrice(result.estimatedPrice)} (${formatPrice(result.priceRange.low)} - ${formatPrice(result.priceRange.high)}). ${specs.bedrooms || 'N/A'}BR/${specs.bathrooms || 'N/A'}BA, ${specs.livingAreaRange || 'N/A'} sqft. Confidence: ${result.confidence}. Would like to discuss accurate valuation.`
      : `Requesting valuation for ${buildingName}${unitNumber ? ` Unit ${unitNumber}` : ''}${buildingAddress ? ` (${buildingAddress})` : ''}. ${specs.bedrooms || 'N/A'}BR/${specs.bathrooms || 'N/A'}BA, ${specs.livingAreaRange || 'N/A'} sqft. Unit requires professional analysis - no automated estimate available.`

    console.log('🔍 DEBUG EstimatorResults:', { agentId, buildingId, buildingName })

    if (!agentId) {
      console.log('⚠ No agentId - skipping lead creation (public context)')
      setSubmitted(true)
      setShowContactForm(false)
      return
    }

    try {
      await trackActivity({
        contactEmail: contactForm.email,
        agentId: agentId,
        activityType: type === 'estimator' ? 'estimator' : (type === 'sale' ? 'sale_offer_inquiry' : 'lease_offer_inquiry'),
        activityData: {
          buildingId,
          buildingName,
          buildingAddress,
          unitNumber,
          estimatedPrice: result.showPrice ? result.estimatedPrice : null,
          priceRangeLow: result.showPrice ? result.priceRange.low : null,
          priceRangeHigh: result.showPrice ? result.priceRange.high : null,
          confidence: result.confidence,
          matchTier: result.matchTier,
          bedrooms: specs.bedrooms,
          bathrooms: specs.bathrooms,
          sqft: specs.livingAreaRange
        }
      })
      console.log('✅ Activity tracked successfully')
    } catch (error) {
      console.error('❌ trackActivity error:', error)
    }

    console.log('✅ Now creating lead...')
    try {
      const leadResult = await getOrCreateLead({
        agentId,
        contactName: contactForm.name,
        contactEmail: contactForm.email,
        contactPhone: contactForm.phone,
        source: type === 'estimator' ? 'estimator' : (type === 'sale' ? 'sale_offer_inquiry' : 'lease_offer_inquiry'),
        buildingId,
        message,
        estimatedValueMin: result.showPrice ? result.priceRange.low : undefined,
        estimatedValueMax: result.showPrice ? result.priceRange.high : undefined,
        propertyDetails: {
          ...(propertySpecs || {}),
          buildingName,
          buildingAddress,
          unitNumber,
          estimatedPrice: result.showPrice ? result.estimatedPrice : null,
          confidence: result.confidence,
          matchTier: result.matchTier,
          marketSpeed: result.marketSpeed?.status
        },
        forceNew: true
      })

      console.log('🎯 Lead creation result:', leadResult)

      if (!leadResult.success) {
        console.error('❌ Lead creation failed:', leadResult)
      }
    } catch (error) {
      console.error('❌ Exception during lead creation:', error)
    }

    setIsSubmitting(false)
    setSubmitted(true)
    setShowContactForm(false)
  }

  // CONTACT TIER: No price - show reference comparables + strong CTA
  if (!result.showPrice || result.matchTier === 'CONTACT') {
    return (
      <div className="space-y-6">
        {/* Expert Valuation Required Banner */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-xl p-8 text-white">
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-3">Expert Valuation Required</h2>
            <p className="text-lg text-blue-100 max-w-lg mx-auto">
              {result.confidenceMessage || 'Your unit has unique characteristics that require professional analysis for accurate pricing.'}
            </p>
          </div>

          {/* Contact Form */}
          {!submitted ? (
            !showContactForm ? (
              <button
                onClick={() => setShowContactForm(true)}
                className="w-full bg-white text-blue-700 font-bold py-5 px-8 rounded-xl transition-all shadow-lg hover:shadow-xl hover:bg-blue-50 flex items-center justify-center gap-3 text-lg"
              >
                <MessageSquare className="w-6 h-6" />
                Request Free Professional Valuation
              </button>
            ) : (
              <form onSubmit={handleContactSubmit} className="bg-white rounded-xl p-6 space-y-4">
                <h4 className="font-bold text-gray-900 text-lg mb-4">Get Your Free Valuation</h4>

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
                  {isSubmitting ? 'Sending...' : 'Request Valuation'}
                </button>
              </form>
            )
          ) : (
            <div className="bg-white rounded-xl p-6 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-2">Request Received!</h4>
              <p className="text-gray-700">Your agent will contact you within 24 hours with an accurate market valuation.</p>
            </div>
          )}
        </div>

        {/* Reference Comparables */}
        {result.comparables.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-start gap-3 mb-6">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-bold text-slate-900">Market Reference (Not Direct Comparables)</h3>
                <p className="text-sm text-slate-600 mt-1">
                  These recent sales in your building differ from your unit but provide market context.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {result.comparables.map((comp, idx) => (
                <a 
                  key={idx} 
                  href={comp.buildingSlug && comp.unitNumber && comp.listingKey ? `/${comp.buildingSlug}-unit-${comp.unitNumber}-${comp.listingKey.toLowerCase()}` : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block bg-slate-50 rounded-xl p-5 border-2 border-slate-200 ${comp.buildingSlug && comp.unitNumber && comp.listingKey ? 'hover:border-blue-400 hover:shadow-md cursor-pointer transition-all' : ''}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {comp.unitNumber && (
                          <span className="text-sm font-semibold text-slate-500">Unit {comp.unitNumber}</span>
                        )}
                        <span className="font-bold text-slate-900">
                          {comp.bedrooms} bed, {comp.bathrooms} bath
                        </span>
                        {comp.temperature && (
                          <span className={`px-2 py-1 rounded-full text-xs font-bold border ${temperatureDisplay[comp.temperature].color}`}>
                            {temperatureDisplay[comp.temperature].icon} {temperatureDisplay[comp.temperature].label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">
                        {comp.livingAreaRange} sqft • {comp.parking} parking • {comp.locker === 'Owned' ? 'Has locker' : 'No locker'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {isSale ? 'Sold' : 'Leased'}: {new Date(comp.closeDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-900">{formatPrice(comp.closePrice)}</p>
                    </div>
                  </div>

                  {/* Mismatch Reason */}
                  {comp.mismatchReason && (
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                      <p className="text-xs text-amber-800">
                        <span className="font-semibold">Why this differs:</span> {comp.mismatchReason}
                      </p>
                    </div>
                  )}
                  
                </a>
              ))}
            </div>

            <p className="text-xs text-slate-500 mt-4 text-center">
              ⚠️ These are for reference only. Contact agent for accurate valuation of your specific unit.
            </p>
          </div>
        )}
      </div>
    )
  }

  // BINGO / FAIR / ADJUSTED TIERS: Show price estimates
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 space-y-8">
        {/* Main Estimate - Option A Display */}
        <div className="text-center border-b pb-6">
          <p className="text-sm text-slate-600 mb-2">
            Estimated {isSale ? 'Market Value' : 'Monthly Rent'}
          </p>
          <h2 className="text-5xl font-bold text-slate-900 mb-1">
            {formatPrice(result.estimatedPrice)}
            {!isSale && <span className="text-2xl font-normal">/mo</span>}
          </h2>
          <p className="text-sm text-slate-500 mb-3">
            (average of {result.comparables.length} {result.matchTier === 'BINGO' ? 'identical' : 'comparable'} unit{result.comparables.length > 1 ? 's' : ''})
          </p>

          {/* Current Market Price - Most Recent Sale */}
          {result.currentMarketPrice && result.currentMarketPrice !== result.estimatedPrice && (
            <div className="bg-emerald-50 rounded-lg px-4 py-3 inline-block mb-3">
              <p className="text-sm text-emerald-700">
                <span className="font-semibold">Current Market:</span> {formatPrice(result.currentMarketPrice)}
                <span className="text-emerald-600 ml-1">(most recent sale)</span>
              </p>
            </div>
          )}

          <p className="text-lg text-slate-600">
            Range: {formatPrice(result.priceRange.low)} - {formatPrice(result.priceRange.high)}
            {!isSale && '/mo'}
          </p>

          <div className="mt-4 flex flex-col items-center gap-2">
            <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold border ${confidenceColors[result.confidence]}`}>
              {result.confidence} Confidence
            </span>
            {result.confidenceMessage && (
              <p className="text-xs text-slate-500 max-w-md">{result.confidenceMessage}</p>
            )}
          </div>
        </div>

        {/* Match Tier Banner */}
        {result.matchTier && (
          <div className={`rounded-xl p-4 border-2 ${
            result.matchTier === 'BINGO' || result.matchTier === 'BINGO-ADJ' ? 'bg-emerald-50 border-emerald-200' :
            result.matchTier === 'RANGE' || result.matchTier === 'RANGE-ADJ' ? 'bg-blue-50 border-blue-200' :
            result.matchTier === 'MAINT' || result.matchTier === 'MAINT-ADJ' ? 'bg-amber-50 border-amber-200' :
            'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {result.matchTier === 'BINGO' || result.matchTier === 'BINGO-ADJ' ? '🎯' : 
                 result.matchTier === 'RANGE' || result.matchTier === 'RANGE-ADJ' ? '📊' : 
                 result.matchTier === 'MAINT' || result.matchTier === 'MAINT-ADJ' ? '🔧' : '📋'}
              </span>
              <div>
                <p className={`font-bold ${
                  result.matchTier === 'BINGO' || result.matchTier === 'BINGO-ADJ' ? 'text-emerald-800' :
                  result.matchTier === 'RANGE' || result.matchTier === 'RANGE-ADJ' ? 'text-blue-800' :
                  result.matchTier === 'MAINT' || result.matchTier === 'MAINT-ADJ' ? 'text-amber-800' :
                  'text-slate-800'
                }`}>
                  {tierLabels[result.matchTier]?.label || 'Comparables'}
                </p>
                <p className={`text-sm ${
                  result.matchTier === 'BINGO' || result.matchTier === 'BINGO-ADJ' ? 'text-emerald-600' :
                  result.matchTier === 'RANGE' || result.matchTier === 'RANGE-ADJ' ? 'text-blue-600' :
                  result.matchTier === 'MAINT' || result.matchTier === 'MAINT-ADJ' ? 'text-amber-600' :
                  'text-slate-600'
                }`}>
                  {tierLabels[result.matchTier]?.description || ''}
                </p>
              </div>
            </div>
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

        {/* Comparables with Temperature */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-4">
            {result.matchTier === 'BINGO' ? 'Perfect Matches' : 
             result.matchTier === 'BINGO-ADJ' ? 'Perfect Matches (Adjusted)' : 
             result.matchTier === 'RANGE' ? 'Same Size Units' :
             result.matchTier === 'RANGE-ADJ' ? 'Same Size Units (Adjusted)' :
             result.matchTier === 'MAINT' ? 'Similar Size Units' :
             result.matchTier === 'MAINT-ADJ' ? 'Similar Size Units (Adjusted)' :
             'Comparables'} ({result.comparables.length})
          </h3>
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {result.comparables.map((comp, idx) => {
              const hasAdjustments = comp.adjustments && comp.adjustments.length > 0

              return (
                <a 
                  key={idx} 
                  href={comp.buildingSlug && comp.unitNumber && comp.listingKey ? `/${comp.buildingSlug}-unit-${comp.unitNumber}-${comp.listingKey.toLowerCase()}` : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block bg-slate-50 rounded-xl p-5 border-2 border-slate-200 ${comp.buildingSlug && comp.unitNumber && comp.listingKey ? 'hover:border-blue-400 hover:shadow-md cursor-pointer transition-all' : 'hover:border-slate-300 transition-colors'}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {comp.unitNumber && (
                          <span className="text-sm font-semibold text-slate-500">Unit {comp.unitNumber}</span>
                        )}
                        <p className="font-bold text-slate-900 text-lg">
                          {comp.bedrooms} bed, {comp.bathrooms} bath
                        </p>
                        {/* Temperature Badge */}
                        {comp.temperature && (
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${temperatureDisplay[comp.temperature].color}`}>
                            {temperatureDisplay[comp.temperature].icon} {temperatureDisplay[comp.temperature].label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">
                        {comp.exactSqft ? `${comp.exactSqft} sqft` : comp.livingAreaRange + ' sqft'} • {comp.parking} parking • {comp.locker === 'Owned' ? 'Has locker' : 'No locker'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {isSale ? 'Sold' : 'Leased'}: {new Date(comp.closeDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} • {comp.daysOnMarket} days on market
                      </p>
                    </div>
                  </div>

                  {/* Match Details for BINGO / BINGO-ADJ */}
                  {(result.matchTier === 'BINGO' || result.matchTier === 'BINGO-ADJ') && (
                    <div className="bg-emerald-50 rounded-lg p-4 mb-3 border border-emerald-200">
                      <p className="text-xs font-semibold text-emerald-900 mb-2">🎯 {result.matchTier === 'BINGO' ? 'Perfect Match' : 'Perfect Match (Adjusted)'}:</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600">✓</span>
                          <span className="text-slate-700">Exact sqft match: {comp.exactSqft} sqft {comp.userExactSqft ? `(yours: ${comp.userExactSqft} sqft, ±10%)` : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600">✓</span>
                          <span className="text-slate-700">Bedroom: {comp.bedrooms} bed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600">✓</span>
                          <span className="text-slate-700">Bathroom: {comp.bathrooms} bath</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Match Details for RANGE / RANGE-ADJ */}
                  {(result.matchTier === 'RANGE' || result.matchTier === 'RANGE-ADJ') && (
                    <div className="bg-blue-50 rounded-lg p-4 mb-3 border border-blue-200">
                      <p className="text-xs font-semibold text-blue-900 mb-2">📊 {result.matchTier === 'RANGE' ? 'Same Size Match' : 'Same Size Match (Adjusted)'}:</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-600">✓</span>
                          <span className="text-slate-700">Same sqft range: {comp.livingAreaRange}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-600">✓</span>
                          <span className="text-slate-700">Bedroom: {comp.bedrooms} bed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-600">✓</span>
                          <span className="text-slate-700">Bathroom: {comp.bathrooms} bath</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Match Details for MAINT / MAINT-ADJ */}
                  {(result.matchTier === 'MAINT' || result.matchTier === 'MAINT-ADJ') && (
                    <div className="bg-amber-50 rounded-lg p-4 mb-3 border border-amber-200">
                      <p className="text-xs font-semibold text-amber-900 mb-2">🔧 {result.matchTier === 'MAINT' ? 'Similar Size Match' : 'Similar Size Match (Adjusted)'}:</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-600">✓</span>
                          <span className="text-slate-700">
                            Similar maintenance: ${comp.associationFee ? Math.round(comp.associationFee) : 'N/A'}/month (±20%)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-600">✓</span>
                          <span className="text-slate-700">Sqft range: {comp.livingAreaRange}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-600">✓</span>
                          <span className="text-slate-700">Bedroom: {comp.bedrooms} bed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-600">✓</span>
                          <span className="text-slate-700">Bathroom: {comp.bathrooms} bath</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Price Section */}
                  <div className="bg-white rounded-lg p-4 mt-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-600">{isSale ? 'Sale' : 'Lease'} Price:</span>
                      <span className="text-lg font-bold text-slate-900">{formatPrice(comp.closePrice)}</span>
                    </div>

                    {/* Adjustments for ADJUSTED tier */}
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

                    {isSale && hasAdjustments && (
                      <div className="flex justify-between items-center pt-3 mt-3 border-t-2 border-slate-300">
                        <span className="text-sm font-bold text-slate-900">Adjusted Value:</span>
                        <span className="text-xl font-bold text-emerald-600">{formatPrice(comp.adjustedPrice || comp.closePrice)}</span>
                      </div>
                    )}

                    {isSale && !hasAdjustments && result.matchTier === 'BINGO' && (
                      <div className="pt-3 mt-3 border-t-2 border-emerald-300">
                        <p className="text-sm font-semibold text-emerald-700 text-center">
                          ✨ Identical unit specifications - no adjustments needed
                        </p>
                      </div>
                    )}

                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-500">Originally listed:</span>
                      <span className="text-xs text-slate-500">{formatPrice(comp.listPrice)}</span>
                    </div>
                    
                  </a>
            
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

      {/* IMPORTANT DISCLAIMER + CONTACT AGENT */}
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
                  <span className="text-amber-600 mt-1">•</span>
                  <span>Unit condition, view quality, and upgrades significantly impact value</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
                  <span>Market dynamics change daily - timing matters</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
                  <span>Building reputation and location nuances aren't captured by algorithms</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
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