// app/estimator/components/EstimatorBuyerModal.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { estimateSale } from '../actions/estimate-sale'
import { estimateRent } from '../actions/estimate-rent'
import { EstimateResult } from '@/lib/estimator/types'
import EstimatorResults from './EstimatorResults'
import { MLSListing } from '@/lib/types/building'
import { useAuth } from '@/components/auth/AuthContext'
import VipPrompt from '@/components/chat/VipPrompt'
import VipRequestForm, { VipRequestData } from '@/components/chat/VipRequestForm'
import RegisterModal from '@/components/auth/RegisterModal'

interface EstimatorBuyerModalProps {
  isOpen: boolean
  onClose: () => void
  listing: MLSListing | null
  buildingName: string
  buildingAddress?: string
  buildingId: string
  buildingSlug?: string
  agentId: string
  type: 'sale' | 'lease'
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

export default function EstimatorBuyerModal({
  isOpen,
  onClose,
  listing,
  buildingName,
  buildingAddress,
  buildingId,
  buildingSlug,
  agentId,
  type,
  exactSqft
}: EstimatorBuyerModalProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
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
  const [showWaiting, setShowWaiting] = useState(false)
  const [showBlocked, setShowBlocked] = useState(false)
  const [vipLoading, setVipLoading] = useState(false)

  const isSale = type === 'sale'

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setResult(null)
      setError(null)
      setShowVipPrompt(false)
      setShowVipForm(false)
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
        const response = await fetch(`/api/chat/vip-request?requestId=${session.vipRequestId}`)
        const data = await response.json()

        if (data.status === 'approved') {
          setSession(prev => ({ ...prev, vipRequestStatus: 'approved' }))
          
          if (data.questionnaireCompleted || session.questionnaireCompleted) {
            setShowWaiting(false)
            setShowVipForm(false)
            // Re-run estimate
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
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const checkAndEstimate = async () => {
    // If not logged in, show register
    if (!user) {
      setShowRegister(true)
      return
    }

    setSessionLoading(true)

    try {
      // Check session/usage
      const response = await fetch('/api/estimator/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userId: user.id, buildingId })
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

      // Check if allowed
      if (data.allowed && data.remaining > 0) {
        // Increment usage
        await fetch('/api/estimator/increment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: data.sessionId,
            useSharedPool: data.limits?.useSharedPool || false
          })
        })

        setSessionLoading(false)
        // Run estimate
        handleEstimate()
        return
      }

      setSessionLoading(false)

      // Not allowed - show appropriate VIP flow
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
          setShowVipForm(true)
        }
        return
      }

      if (data.vipRequestStatus === 'approved' && !data.questionnaireCompleted) {
        setShowVipForm(true)
        return
      }

      // Need to start VIP flow
      setShowVipPrompt(true)

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
      const specs = {
      bedrooms: listing.bedrooms_total || 0,
      bathrooms: listing.bathrooms_total_integer || 0,
      livingAreaRange: listing.living_area_range || '',
      parking: listing.parking_total || 0,
      hasLocker: !!(listing.locker && listing.locker !== 'None'),
      buildingId,
      buildingSlug,
      agentId,
      ...(exactSqft !== null && { exactSqft }),
      ...(listing.association_fee && { associationFee: listing.association_fee })
    }

    const response = isSale
      ? await estimateSale(specs, true)
      : await estimateRent(specs, true)

    if (response.success && response.data) {
        setResult(response.data)
      } else {
        setError(response.error || 'Failed to calculate estimate')
      }
    } catch (err) {
      console.error('Estimate error:', err)
      setError('Failed to calculate estimate. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVipAccept = async (phone: string) => {
    setVipLoading(true)
    try {
      const response = await fetch('/api/chat/vip-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          phone,
          fullName: '',
          email: '',
          budgetRange: '',
          timeline: '',
          buyerType: '',
          requirements: '',
          pageUrl: window.location.href,
          buildingName,
          requestSource: 'estimator'
        })
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
      const response = await fetch('/api/chat/vip-questionnaire', {
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
          // Re-check and estimate
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

  const handleVipDecline = () => {
    setShowVipPrompt(false)
    onClose()
  }

  const handleFormCancel = () => {
    if (session.vipRequestStatus === 'pending' || session.vipRequestStatus === 'approved') {
      // Can't skip
      return
    }
    setShowVipForm(false)
    setShowVipPrompt(true)
  }

  if (!isOpen || !listing) return null

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
                {isSale ? 'Sale Price Estimate' : 'Lease Price Estimate'}
              </h2>
              <p className={`${isSale ? 'text-emerald-100' : 'text-sky-100'} text-sm`}>Unit {listing.unit_number}</p>
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

          {/* VIP Form */}
          {showVipForm && (
            <div className="mb-6">
              <VipRequestForm
                agentName={session.agentName}
                buildingName={buildingName}
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
                {session.agentName} has been notified. You'll get access once approved.
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
              <div className="w-16 h-16 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4"></div>
              <p className="text-slate-600 font-medium">Analyzing market data...</p>
            </div>
          )}

          {/* Error */}
          {error && !showVipPrompt && !showVipForm && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <p className="text-red-800 font-semibold mb-1">Unable to Generate Estimate</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Results */}
          {result && !showVipPrompt && !showVipForm && !showWaiting && !showBlocked && (
            <EstimatorResults
              result={result}
              buildingId={buildingId}
              buildingName={buildingName}
              buildingAddress={buildingAddress}
              agentId={agentId}
              propertySpecs={{
                bedrooms: listing.bedrooms_total || 0,
                bathrooms: listing.bathrooms_total_integer || 0,
                livingAreaRange: listing.living_area_range || '',
                parking: listing.parking_total || 0,
                hasLocker: !!(listing.locker && listing.locker !== 'None')
              }}
              type={type}
              unitNumber={listing.unit_number || ''}
            />
          )}
        </div>
      </div>

      {/* Register Modal */}
      <RegisterModal
        isOpen={showRegister}
        onClose={() => { setShowRegister(false); onClose(); }}
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