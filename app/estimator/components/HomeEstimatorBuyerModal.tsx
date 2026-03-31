// app/estimator/components/HomeEstimatorBuyerModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { estimateHomeSale } from '../actions/estimate-home-sale'
import { EstimateResult } from '@/lib/estimator/types'
import HomeEstimatorResults from './HomeEstimatorResults'
import { MLSListing } from '@/lib/types/building'
import { useAuth } from '@/components/auth/AuthContext'
import VipPrompt from '@/components/chat/VipPrompt'
import VipRequestForm, { VipRequestData } from '@/components/chat/VipRequestForm'
import RegisterModal from '@/components/auth/RegisterModal'
import WalliamVipForm from '@/components/estimator/WalliamVipForm'
import { extractExactSqft } from '@/lib/estimator/types'

interface HomeEstimatorBuyerModalProps {
  isOpen: boolean
  onClose: () => void
  listing: MLSListing | null
  agentId: string
  tenantId?: string
  type: 'sale' | 'rent'
  exactSqft: number | null
}

interface SessionState {
  sessionId: string | null
  allowed: boolean
  action: string | null
  reason?: string
  questionnaireCompleted: boolean
  vipRequestStatus: 'idle' | 'pending' | 'approved' | 'denied'
  vipRequestId: string | null
  useSharedPool: boolean
  agentName: string
}

export default function HomeEstimatorBuyerModal({
  isOpen,
  onClose,
  listing,
  agentId,
  tenantId,
  type,
  exactSqft,
}: HomeEstimatorBuyerModalProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [geoLevel, setGeoLevel] = useState<string | null>(null)
  const [showRegister, setShowRegister] = useState(false)

  // VIP flow states
  const [sessionLoading, setSessionLoading] = useState(false)
  const [session, setSession] = useState<SessionState>({
    sessionId: null,
    allowed: false,
    action: null,
    questionnaireCompleted: false,
    vipRequestStatus: 'idle',
    vipRequestId: null,
    useSharedPool: false,
    agentName: ''
  })
  const [showVipPrompt, setShowVipPrompt] = useState(false)
  const [showVipForm, setShowVipForm] = useState(false)
  const [showWalliamForm, setShowWalliamForm] = useState(false)
  const [showWaiting, setShowWaiting] = useState(false)
  const [showBlocked, setShowBlocked] = useState(false)
  const [vipLoading, setVipLoading] = useState(false)
  const [prefillPhone, setPrefillPhone] = useState('')
  const isSale = type === 'sale'

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setResult(null)
      setError(null)
      setGeoLevel(null)
      setShowVipPrompt(false)
      setShowVipForm(false)
      setShowWalliamForm(false)
      setShowWaiting(false)
      setShowBlocked(false)
    }
  }, [isOpen])

  // Check session and run estimate when modal opens
  useEffect(() => {
    if (isOpen && listing && !result && !loading && !sessionLoading) {
      checkAndEstimate()
    }
  }, [isOpen, listing, user])

  // Poll for VIP approval
  useEffect(() => {
    if (!session.vipRequestId || session.vipRequestStatus !== 'pending') return

    const pollInterval = setInterval(async () => {
      try {
        const pollUrl = tenantId
          ? `/api/walliam/estimator/vip-request?requestId=${session.vipRequestId}`
          : `/api/chat/vip-request?requestId=${session.vipRequestId}`
        const response = await fetch(pollUrl)
        const data = await response.json()

        if (data.status === 'approved') {
          setSession(prev => ({ ...prev, vipRequestStatus: 'approved' }))
          if (data.questionnaireCompleted || session.questionnaireCompleted) {
            setShowWaiting(false)
            setShowVipForm(false)
            checkAndEstimate()
          } else {
            setShowWaiting(false)
            setShowVipForm(true)
          }
          clearInterval(pollInterval)
        } else if (data.status === 'denied') {
          setSession(prev => ({ ...prev, vipRequestStatus: 'denied' }))
          setShowWaiting(false)
          clearInterval(pollInterval)
        }
      } catch (err) {
        console.error('Error polling VIP status:', err)
      }
    }, 5000)

    return () => clearInterval(pollInterval)
  }, [session.vipRequestId, session.vipRequestStatus, session.questionnaireCompleted])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  const checkAndEstimate = async () => {
    if (!user) {
      setShowRegister(true)
      return
    }

    setSessionLoading(true)

    try {
      const sessionUrl = tenantId ? '/api/walliam/estimator/session' : '/api/estimator/session'
      const sessionHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
      if (tenantId) sessionHeaders['x-tenant-id'] = tenantId
      const sessionBody = tenantId ? { userId: user.id } : { agentId, userId: user.id, buildingId: '' }
      const response = await fetch(sessionUrl, {
        method: 'POST',
        headers: sessionHeaders,
        body: JSON.stringify(sessionBody)
      })

      const data = await response.json()

      if (data.error) {
        setError(data.error)
        setSessionLoading(false)
        return
      }

      setSession({
        sessionId: data.sessionId,
        allowed: data.allowed,
        action: data.action,
        reason: data.reason,
        questionnaireCompleted: data.questionnaireCompleted,
        vipRequestStatus: data.vipRequestStatus || 'idle',
        vipRequestId: data.vipRequestId,
        useSharedPool: data.limits?.useSharedPool || false,
        agentName: data.agentName || ''
      })

      if (data.allowed && data.remaining > 0) {
        await fetch(tenantId ? '/api/walliam/estimator/increment' : '/api/estimator/increment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: data.sessionId,
            useSharedPool: data.limits?.useSharedPool || false
          })
        })

        setSessionLoading(false)
        handleEstimate()
        return
      }

      setSessionLoading(false)

      if (data.action === 'blocked') {
        setShowBlocked(true)
        return
      }

      if (data.vipRequestStatus === 'denied') {
        setError('Access denied. Please contact the agent directly.')
        return
      }

      if (data.vipRequestStatus === 'pending') {
        if (data.questionnaireCompleted) {
          setShowWaiting(true)
        } else {
          tenantId ? setShowWalliamForm(true) : setShowVipForm(true)
        }
        return
      }

      if (data.vipRequestStatus === 'approved' && !data.questionnaireCompleted) {
        tenantId ? setShowWalliamForm(true) : setShowVipForm(true)
        return
      }

      if (tenantId) {
        if (data.userPhone) setPrefillPhone(data.userPhone)
        setShowWalliamForm(true)
      } else {
        setShowVipPrompt(true)
      }

    } catch (err) {
      console.error('Error checking session:', err)
      setError('Failed to check access. Please try again.')
      setSessionLoading(false)
    }
  }

  const handleEstimate = async () => {
    if (!listing) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const homeSpecs = {
        bedrooms: listing.bedrooms_total || 0,
        bathrooms: listing.bathrooms_total_integer || 0,
        propertySubtype: listing.property_subtype?.trim() || 'Detached',
        communityId: (listing as any).community_id || null,
        municipalityId: (listing as any).municipality_id || null,
        livingAreaRange: listing.living_area_range || '',
        parking: listing.parking_total || 0,
        lotWidth: listing.lot_width ? parseFloat(String(listing.lot_width)) : null,
        lotDepth: listing.lot_depth ? parseFloat(String(listing.lot_depth)) : null,
        lotArea: listing.lot_size_area ? parseFloat(String(listing.lot_size_area)) : null,
        garageType: listing.garage_type || null,
        basement: Array.isArray(listing.basement) ? listing.basement.join(', ') : listing.basement || null,
        basementRaw: Array.isArray(listing.basement) ? listing.basement : listing.basement ? [listing.basement] : null,
        architecturalStyle: Array.isArray((listing as any).architectural_style) ? (listing as any).architectural_style[0] || null : null,
        poolFeatures: Array.isArray((listing as any).pool_features) ? (listing as any).pool_features : null,
        approximateAge: listing.approximate_age || null,
        agentId,
        ...(exactSqft !== null && { exactSqft }),
      }

      if (isSale) {
        const response = await estimateHomeSale(homeSpecs, true)
        if (response.success && response.data) {
          setResult(response.data)
          setGeoLevel(response.geoLevel || null)
        } else {
          setError(response.error || 'Failed to calculate estimate')
        }
      } else {
        // Home lease estimation
        const { estimateHomeRent } = await import('../actions/estimate-home-rent')
        const response = await estimateHomeRent(homeSpecs, true)
        if (response.success && response.data) {
          setResult(response.data)
          setGeoLevel(response.geoLevel || null)
        } else {
          setError(response.error || 'Failed to calculate rental estimate')
        }
      }
    } catch (err) {
      console.error('Home estimate error:', err)
      setError('Failed to calculate estimate. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVipAccept = async (phone: string) => {
    setVipLoading(true)
    try {
      const displayAddress = listing?.unparsed_address ||
        `${(listing as any)?.street_number || ''} ${(listing as any)?.street_name || ''}`.trim() || 'Home'

      const vipUrl = tenantId ? '/api/walliam/estimator/vip-request' : '/api/chat/vip-request'
      const vipBody = tenantId
        ? { sessionId: session.sessionId, phone, pageUrl: window.location.href, buildingName: displayAddress }
        : { sessionId: session.sessionId, phone, fullName: '', email: '', budgetRange: '', timeline: '', buyerType: '', requirements: '', pageUrl: window.location.href, buildingName: displayAddress, requestSource: 'estimator' }
      const response = await fetch(vipUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vipBody)
      })

      const result = await response.json()

      if (result.success) {
        setSession(prev => ({
          ...prev,
          vipRequestId: result.requestId,
          vipRequestStatus: result.status === 'approved' ? 'approved' : 'pending'
        }))
        setShowVipPrompt(false)
        setShowVipForm(true)
      } else {
        setError(result.error || 'Failed to submit request')
      }
    } catch (err) {
      console.error('VIP request error:', err)
      setError('Failed to submit request')
    } finally {
      setVipLoading(false)
    }
  }

  const handleQuestionnaireSubmit = async (data: VipRequestData) => {
    setVipLoading(true)
    try {
      const questionnaireUrl = tenantId ? '/api/walliam/estimator/vip-questionnaire' : '/api/chat/vip-questionnaire'
      const response = await fetch(questionnaireUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: session.vipRequestId,
          fullName: data.fullName,
          email: data.email,
          budgetRange: data.budgetRange,
          timeline: data.timeline,
          buyerType: data.buyerType,
          requirements: data.requirements
        })
      })

      const result = await response.json()

      if (result.success) {
        setSession(prev => ({ ...prev, questionnaireCompleted: true }))
        setShowVipForm(false)

        if (session.vipRequestStatus === 'approved') {
          checkAndEstimate()
        } else {
          setShowWaiting(true)
        }
      } else {
        setError(result.error || 'Failed to submit questionnaire')
      }
    } catch (err) {
      console.error('Questionnaire error:', err)
      setError('Failed to submit questionnaire')
    } finally {
      setVipLoading(false)
    }
  }

  const handleWalliamVipSubmit = async (formData: any) => {
    setVipLoading(true)
    try {
      const displayAddress = listing?.unparsed_address || 'Home'
      const vipRes = await fetch('/api/walliam/estimator/vip-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, phone: formData.phone, pageUrl: window.location.href, buildingName: displayAddress })
      })
      const vipResult = await vipRes.json()
      if (!vipResult.success) { setError(vipResult.error || 'Failed to submit'); return }
      const requestId = vipResult.requestId
      const newStatus = vipResult.status === 'approved' ? 'approved' : 'pending'
      setSession(prev => ({ ...prev, vipRequestId: requestId, vipRequestStatus: newStatus }))
      const qRes = await fetch('/api/walliam/estimator/vip-questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, budgetRange: formData.budgetRange, timeline: formData.timeline, buyerType: formData.buyerType, requirements: formData.requirements })
      })
      const qResult = await qRes.json()
      if (!qResult.success) { setError(qResult.error || 'Failed to submit questionnaire'); return }
      setShowWalliamForm(false)
      setSession(prev => ({ ...prev, questionnaireCompleted: true }))
      if (newStatus === 'approved') { checkAndEstimate() } else { setShowWaiting(true) }
    } catch (err) {
      console.error('WALLiam VIP submit error:', err)
      setError('Failed to submit request')
    } finally {
      setVipLoading(false)
    }
  }

  const handleVipDecline = () => {
    setShowVipPrompt(false)
    onClose()
  }

  const handleFormCancel = () => {
    if (session.vipRequestStatus === 'pending' || session.vipRequestStatus === 'approved') return
    setShowVipForm(false)
    setShowVipPrompt(true)
  }

  if (!isOpen || !listing) return null

  const displayAddress = listing.unparsed_address ||
    `${(listing as any).street_number || ''} ${(listing as any).street_name || ''}`.trim() || 'This Property'
  const propertyLabel = listing.property_subtype?.trim() || 'Home'

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[99] transition-opacity"
        onClick={onClose}
      />

      {/* Modal Drawer */}
      <div className="fixed inset-y-0 right-0 z-[100] w-full md:w-[600px] bg-white shadow-2xl transform transition-transform overflow-y-auto">
        {/* Header */}
        <div className={`sticky top-0 bg-gradient-to-r ${isSale ? 'from-emerald-600 to-teal-600' : 'from-sky-600 to-blue-600'} text-white p-6 shadow-lg z-10`}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">
                {isSale ? 'Home Price Estimate' : 'Rental Estimate'}
              </h2>
              <p className={`${isSale ? 'text-emerald-100' : 'text-sky-100'} text-sm`}>
                {propertyLabel} — {displayAddress}
              </p>
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
          {/* Property Snapshot */}
          <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Property Details</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="font-semibold text-slate-900">{propertyLabel}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Beds</span><span className="font-semibold text-slate-900">{listing.bedrooms_total || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Baths</span><span className="font-semibold text-slate-900">{listing.bathrooms_total_integer || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Parking</span><span className="font-semibold text-slate-900">{listing.parking_total || 0}</span></div>
              {listing.lot_size_area && (
                <div className="flex justify-between"><span className="text-slate-500">Lot Size</span><span className="font-semibold text-slate-900">{listing.lot_size_area} {listing.lot_size_area_units || 'sqft'}</span></div>
              )}
              {listing.garage_type && listing.garage_type !== 'None' && (
                <div className="flex justify-between"><span className="text-slate-500">Garage</span><span className="font-semibold text-slate-900">{listing.garage_type}</span></div>
              )}
              {listing.approximate_age && (
                <div className="flex justify-between"><span className="text-slate-500">Age</span><span className="font-semibold text-slate-900">{listing.approximate_age} yrs</span></div>
              )}
              {listing.basement && (
                <div className="flex justify-between"><span className="text-slate-500">Basement</span><span className="font-semibold text-slate-900">{listing.basement}</span></div>
              )}
              {listing.living_area_range && (
                <div className="flex justify-between"><span className="text-slate-500">Living Area</span><span className="font-semibold text-slate-900">{listing.living_area_range} sqft</span></div>
              )}
            </div>
          </div>

          {/* Geo Level Indicator */}
          {geoLevel && result && (
            <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
              geoLevel === 'community'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              <span>{geoLevel === 'community' ? '📍' : '🗺️'}</span>
              <span>
                {geoLevel === 'community'
                  ? 'Based on recent sales in your neighborhood'
                  : 'Based on sales across the wider municipality (limited neighborhood data)'}
              </span>
            </div>
          )}

          {/* VIP Prompt */}
          {showVipPrompt && (
            <div className="mb-6">
              <VipPrompt
                agentName={session.agentName}
                onAccept={handleVipAccept}
                onDecline={handleVipDecline}
                isLoading={vipLoading}
              />
            </div>
          )}

          {/* WALLiam single-step VIP form */}
          {showWalliamForm && (
            <div className="mb-6">
              <WalliamVipForm
                agentName={session.agentName}
                buildingName={displayAddress}
                initialPhone={prefillPhone}
                onSubmit={handleWalliamVipSubmit}
                onCancel={() => { setShowWalliamForm(false); onClose() }}
                isLoading={vipLoading}
              />
            </div>
          )}
          {/* VIP Form (System 1 only) */}
          {showVipForm && (
            <div className="mb-6">
              <VipRequestForm
                agentName={session.agentName}
                buildingName={displayAddress}
                onSubmit={handleQuestionnaireSubmit}
                onCancel={handleFormCancel}
                isLoading={vipLoading}
              />
            </div>
          )}

          {/* Waiting for approval */}
          {showWaiting && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center mb-6">
              <div className="animate-pulse mb-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-2xl">⏳</span>
                </div>
              </div>
              <h3 className="font-semibold text-amber-900 mb-2">Waiting for Approval</h3>
              <p className="text-sm text-amber-700">
                {session.agentName} has been notified. You&apos;ll get access once approved.
              </p>
            </div>
          )}

          {/* Blocked */}
          {showBlocked && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center mb-6">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🔒</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Limit Reached</h3>
              <p className="text-sm text-gray-600">{session.reason}</p>
            </div>
          )}

          {/* Loading */}
          {(loading || sessionLoading) && !showVipPrompt && !showVipForm && !showWaiting && !showBlocked && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className={`w-16 h-16 border-4 ${isSale ? 'border-emerald-200 border-t-emerald-600' : 'border-sky-200 border-t-sky-600'} rounded-full animate-spin mb-4`}></div>
              <p className="text-slate-600 font-medium">Analyzing comparable homes...</p>
              <p className="text-slate-400 text-sm mt-1">Searching neighborhood sales data</p>
            </div>
          )}

          {/* Error */}
          {error && !showVipPrompt && !showVipForm && !loading && !sessionLoading && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <p className="text-red-800 font-semibold mb-1">Unable to Generate Estimate</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Results */}
          {result && !showVipPrompt && !showVipForm && !showWaiting && !showBlocked && !loading && (
            <HomeEstimatorResults
              result={result}
              buildingId=""
              buildingName={displayAddress}
              agentId={agentId}
              propertySpecs={{
                bedrooms: listing.bedrooms_total || 0,
                bathrooms: listing.bathrooms_total_integer || 0,
                livingAreaRange: listing.living_area_range || '',
                parking: listing.parking_total || 0,
                hasLocker: false,
              }}
              type={type === 'rent' ? 'lease' : type}
              unitNumber={displayAddress}
            />
          )}
        </div>
      </div>

      {/* Register Modal */}
      <RegisterModal
        isOpen={showRegister}
        onClose={() => { setShowRegister(false); onClose() }}
        onSuccess={() => {
          setShowRegister(false)
          checkAndEstimate()
        }}
        registrationSource="estimator"
        agentId={agentId}
      />
    </>,
    document.body
  )
}