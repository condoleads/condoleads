// app/estimator/components/EstimatorBuyerModal.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { estimateSale } from '../actions/estimate-sale'
import { estimateRent } from '../actions/estimate-rent'
// c1 (2026-06-10): tenant-gated S2 condo lease entry. When tenantId is
// present AND request is LEASE, route to the new condo matcher.
import { estimateCondoRent } from '../actions/estimate-condo-rent'
// c2 (2026-06-10): tenant-gated S2 condo SALE entry. Same pattern.
import { estimateCondoSale } from '../actions/estimate-condo-sale'
import { EstimateResult } from '@/lib/estimator/types'
import EstimatorResults from './EstimatorResults'
import { MLSListing } from '@/lib/types/building'
import { useAuth } from '@/components/auth/AuthContext'
// W-CONDO-MODAL-PARITY Phase 2 (2026-06-11) — condo competing rail
import { useCompetingListings } from '@/app/estimator/hooks/useCompetingListings'
// W-CREDIT-BLEED-PHASE2-1a (2026-06-19): creditsCtx.refresh on register
// so the panel display syncs to the freshly-registered user without
// waiting for AuthContext.onAuthStateChange propagation.
import { useCreditSession } from '@/components/credits/CreditSessionContext'
import type { CompetingListing } from '@/app/estimator/components/HomeEstimatorResults'
import VipPrompt from '@/components/chat/VipPrompt'
import VipRequestForm, { VipRequestData } from '@/components/chat/VipRequestForm'
import RegisterModal from '@/components/auth/RegisterModal'
import WalliamVipForm from '@/components/estimator/WalliamVipForm'

interface EstimatorBuyerModalProps {
  isOpen: boolean
  onClose: () => void
  listing: MLSListing | null
  buildingName: string
  buildingAddress?: string
  buildingId: string
  buildingSlug?: string
  agentId: string
  tenantId?: string
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
  tenantId,
  type,
  exactSqft
}: EstimatorBuyerModalProps) {
  const { user } = useAuth()
  // W-CREDIT-BLEED-PHASE2-1a (2026-06-19): refresh credit panel post-register
  const creditsCtx = useCreditSession()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [geoLevel, setGeoLevel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  // W-CONDO-MODAL-PARITY Phase 2: condo Competing-For-Sale rail
  const { competingListings, fetchCompetingListings, resetCompetingListings } = useCompetingListings()
  // W-COMPETING-INTO-WORKINGDOC (Option B, 2026-06-18): resolved-array state
  // for the workingDoc race fix. handleEstimate awaits the hook fetch then
  // setResolvedCompeting + setResult land in the same microtask -> React
  // batches into one render -> child sees populated prop on first paint.
  const [resolvedCompeting, setResolvedCompeting] = useState<CompetingListing[] | undefined>(undefined)
  
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
  // F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL (Phase 1): honest delivery warning.
  const [emailWarning, setEmailWarning] = useState<string | null>(null)

  const isSale = type === 'sale'

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setResult(null)
      setError(null)
      setShowVipPrompt(false)
      setShowVipForm(false)
      setShowWalliamForm(false)
      setShowWaiting(false)
      setShowBlocked(false)
      setResolvedCompeting(undefined)
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
          
          setShowWaiting(false)
          setShowVipForm(false)
          // WALLiam skips questionnaire — always re-run
          if (tenantId || data.questionnaireCompleted || session.questionnaireCompleted) {
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

  const checkAndEstimate = async (uidArg?: string) => {
    // W-CREDIT-BLEED-PHASE2-1a (2026-06-19): accept uidArg from the
    // RegisterModal.onSuccess confirmedUserId. AuthContext.user lags
    // behind supabase.auth.signUp by an async onAuthStateChange tick;
    // reading user.id from the closure here would post a STALE id and
    // Phase 1's server gate would 403. The override skips the race.
    const uid = uidArg ?? user?.id
    // If not logged in, show register
    if (!uid) {
      setShowRegister(true)
      return
    }

    setSessionLoading(true)

    try {
      // Check session/usage
      const sessionUrl = tenantId ? '/api/walliam/estimator/session' : '/api/estimator/session'
      const sessionHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
      if (tenantId) sessionHeaders['x-tenant-id'] = tenantId
      const sessionBody = tenantId ? { userId: uid } : { agentId, userId: uid, buildingId }
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

      // Check if allowed
      if (data.allowed && data.remaining > 0) {
        // Increment usage
        await fetch(tenantId ? '/api/walliam/estimator/increment' : '/api/estimator/increment', {
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
          tenantId ? setShowWalliamForm(true) : setShowVipForm(true)
        }
        return
      }

      if (data.vipRequestStatus === 'approved' && !data.questionnaireCompleted) {
        tenantId ? setShowWalliamForm(true) : setShowVipForm(true)
        return
      }

      // Need to start VIP flow
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
      ...(listing.association_fee && { associationFee: listing.association_fee }),
      // W-CONDO-MODAL-PARITY Phase 1-FIX (2026-06-11): h8 tax-similarity
      // band on the condo SALE matcher was inert in production because
      // these two fields were never threaded from the production caller —
      // mirror of HomeEstimatorBuyerModal.tsx:281-283. Silent-omit when missing.
      ...((listing as any).tax_annual_amount != null ? { subjectTaxAnnualAmount: parseFloat(String((listing as any).tax_annual_amount)) } : {}),
      ...((listing as any).tax_year != null ? { subjectTaxYear: parseInt(String((listing as any).tax_year), 10) } : {}),
    }

    // c1/c2 (2026-06-10): tenant-gated branches.
    //   SALE + tenantId  → estimateCondoSale (c2)
    //   SALE + !tenantId → estimateSale (shared, unchanged — S1 path)
    //   LEASE + tenantId → estimateCondoRent (c1)
    //   LEASE + !tenantId → estimateRent (shared, unchanged — S1 path)
    let response
    if (isSale && tenantId) {
      response = await estimateCondoSale({ ...specs, tenantId }, true)
    } else if (isSale) {
      response = await estimateSale(specs, true)
    } else if (tenantId) {
      response = await estimateCondoRent({ ...specs, tenantId }, true)
    } else {
      response = await estimateRent(specs, true)
    }

    if (response.success && response.data) {
        // W-COMPETING-INTO-WORKINGDOC (Option B, 2026-06-18): await the
        // competing fetch BEFORE setResult so the resolved array reaches
        // the child via state in the SAME batched render that exposes
        // result. Race fix: child's fire-on-generate effect reads
        // resolvedCompeting prop -> workingDoc.competing populated.
        let resolved: CompetingListing[] | undefined = undefined
        if (tenantId && (listing as any).community_id && listing.bedrooms_total != null) {
          resolved = await fetchCompetingListings({
            path: 'condo',
            communityId: (listing as any).community_id,
            bedrooms: listing.bedrooms_total,
            livingAreaRange: listing.living_area_range || null,
          })
        } else {
          resetCompetingListings()
        }
        setResolvedCompeting(resolved)
        setResult(response.data)
        // W-CONDO-MODAL-PARITY Phase 2 (2026-06-11): on the S2 condo path,
        // both actions return geoLevel at the TOP of the response (Phase 1).
        // The shared S1 actions don't — stays null on legacy traffic so the
        // modal's Geo Level Indicator block auto-hides.
        const respGeo = (response as any).geoLevel as string | undefined
        setGeoLevel(respGeo || null)
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
      const vipUrl = tenantId
        ? '/api/walliam/estimator/vip-request'
        : '/api/chat/vip-request'
      const vipBody = tenantId
        ? { sessionId: session.sessionId, phone, pageUrl: window.location.href, buildingName }
        : {
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
          }
      const response = await fetch(vipUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vipBody)
      })

      const result = await response.json()

      if (result.success) {
        const newStatus = result.status === 'approved' ? 'approved' : 'pending'
        setSession(prev => ({
          ...prev,
          vipRequestId: result.requestId,
          vipRequestStatus: newStatus
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
      const questionnaireUrl = tenantId
        ? '/api/walliam/estimator/vip-questionnaire'
        : '/api/chat/vip-questionnaire'
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

  const handleWalliamVipSubmit = async (formData: any) => {
    setVipLoading(true)
    try {
      // P-WORKING-DOC Step 3 (2026-06-12): if the modal already computed an
      // estimate this session, capture the 3-section working-doc subset so
      // the route can splice it into the user-approval email via the shared
      // helper. When result is null (user hit VIP before estimating), omit
      // the field — the route renders without the sections (backwards-compat).
      const workingDoc = result ? {
        version: 1 as const,
        type: 'condo' as const,
        subject: {
          buildingName,
          buildingAddress,
          unitNumber: listing?.unit_number || '',
          bedrooms: listing?.bedrooms_total ?? null,
          bathrooms: listing?.bathrooms_total_integer ?? null,
          livingAreaRange: listing?.living_area_range ?? null,
        },
        estimate: {
          estimatedPrice: result.showPrice ? result.estimatedPrice : null,
          priceRange: result.priceRange ?? null,
          matchTier: result.matchTier ?? null,
          bestGeoTier: (result as any).bestGeoTier ?? null,
          confidence: result.confidence ?? null,
          confidenceMessage: result.confidenceMessage ?? null,
        },
        comparableSold: Array.isArray(result.comparables) && result.comparables.length > 0 ? {
          bestGeoTier: (result as any).bestGeoTier ?? null,
          count: (result as any).tiers?.[(result as any).bestGeoTier]?.count ?? result.comparables.length,
          estimatedPrice: result.showPrice ? result.estimatedPrice : null,
          median: (result as any).tiers?.[(result as any).bestGeoTier]?.median ?? null,
          tiles: result.comparables.slice(0, 10).map((c: any) => ({
            listingKey: c.listingKey ?? null,
            closePrice: c.closePrice ?? null,
            adjustedPrice: c.adjustedPrice ?? null,
            closeDate: c.closeDate ?? null,
            daysOnMarket: c.daysOnMarket ?? null,
            bedrooms: c.bedrooms ?? null,
            bathrooms: c.bathrooms ?? null,
            livingAreaRange: c.livingAreaRange ?? null,
            unitNumber: c.unitNumber ?? null,
            unparsedAddress: c.unparsedAddress ?? null,
            matchTier: c.matchTier ?? null,
            sourceTier: c.sourceTier ?? null,
            temperature: c.temperature ?? null,
          })),
        } : null,
        taxMatch: (result as any).taxMatch && Array.isArray((result as any).taxMatch.comparables) && (result as any).taxMatch.comparables.length > 0 ? {
          bestGeoTier: (result as any).taxMatch.bestGeoTier ?? null,
          count: (result as any).taxMatch.count ?? (result as any).taxMatch.comparables.length,
          estimatedPrice: (result as any).taxMatch.estimatedPrice ?? null,
          tiles: (result as any).taxMatch.comparables.slice(0, 10).map((c: any) => ({
            listingKey: c.listingKey ?? null,
            closePrice: c.closePrice ?? null,
            adjustedPrice: c.adjustedPrice ?? null,
            closeDate: c.closeDate ?? null,
            daysOnMarket: c.daysOnMarket ?? null,
            bedrooms: c.bedrooms ?? null,
            bathrooms: c.bathrooms ?? null,
            livingAreaRange: c.livingAreaRange ?? null,
            unitNumber: c.unitNumber ?? null,
            unparsedAddress: c.unparsedAddress ?? null,
            matchTier: c.matchTier ?? null,
            sourceTier: c.sourceTier ?? null,
            temperature: c.temperature ?? null,
          })),
        } : null,
        competing: Array.isArray(competingListings) && competingListings.length > 0 ? {
          count: competingListings.length,
          tiles: competingListings.slice(0, 10).map((c: any) => ({
            id: c.id ?? null,
            listingKey: c.listing_key ?? null,
            listPrice: c.list_price ?? null,
            daysOnMarket: c.days_on_market ?? null,
            bedrooms: c.bedrooms_total ?? null,
            bathrooms: c.bathrooms_total_integer ?? null,
            livingAreaRange: c.living_area_range ?? null,
            unitNumber: c.unit_number ?? null,
            unparsedAddress: c.unparsed_address ?? null,
          })),
        } : null,
      } : null
      const vipRes = await fetch('/api/walliam/estimator/vip-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, phone: formData.phone, pageUrl: window.location.href, buildingName, workingDoc })
      })
      const vipResult = await vipRes.json()
      if (!vipResult.success) { setError(vipResult.error || 'Failed to submit request'); return }
      // F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL (Phase 1): if agent-chain email
      // didn't reach the agent, log a soft note for the user. The request row
      // was still saved.
      if (vipResult.chainEmailSent === false) {
        setEmailWarning("Request submitted — but we couldn't email your agent directly. They may not see it until they check the dashboard.")
      }
      const requestId = vipResult.requestId
      const newStatus = vipResult.status === 'approved' ? 'approved' : 'pending'
      setSession(prev => ({ ...prev, vipRequestId: requestId, vipRequestStatus: newStatus }))
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
    if (session.vipRequestStatus === 'pending' || session.vipRequestStatus === 'approved') {
      // Can't skip
      return
    }
    setShowVipForm(false)
    setShowVipPrompt(true)
  }

  if (!isOpen || !listing) return null

  // W-CHARLIE-REGISTRATION-FLOW-FIX (2026-06-14): up-front gate. Pre-fix
  // the full form rendered for unauth visitors; the gate then fired at
  // the "Calculate" button (handleEstimate/checkAndEstimate), AFTER the
  // user had set bedrooms/baths/etc. Now, when the modal opens and
  // there's no auth, render only the register prompt + the modal frame.
  // RegisterModal closes on success; AuthContext.user updates via the
  // supabase.auth.onAuthStateChange listener and this component
  // re-renders with `user` set, falling through to the full form.
  // Lead capture (callJoinTenant inside RegisterModal) runs at register
  // time — preserved regardless of when the gate fires.
  if (!user) {
    return createPortal(
      <>
        <div className="fixed inset-0 bg-black/50 z-[99]" onClick={onClose} />
        <div className="fixed inset-y-0 right-0 z-[100] w-full md:w-[600px] bg-white shadow-2xl overflow-y-auto">
          <div className={`sticky top-0 bg-gradient-to-r ${isSale ? 'from-emerald-600 to-teal-600' : 'from-sky-600 to-blue-600'} text-white p-6 shadow-lg z-10`}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">{isSale ? 'Sale Price Estimate' : 'Lease Price Estimate'}</h2>
                <p className={`${isSale ? 'text-emerald-100' : 'text-sky-100'} text-sm`}>Unit {listing.unit_number}</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors" aria-label="Close modal">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="text-center py-8">
              <div className="text-3xl mb-3">🏠</div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Sign in to estimate this listing</h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
                Create a free account or sign in to access the estimator. We'll match this unit
                against same-building comparables and tax-band sales.
              </p>
              <button
                onClick={() => setShowRegister(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
              >
                Get Started — Free Account
              </button>
              <p className="text-xs text-slate-400 mt-3">Already have an account? Click above and choose "Sign In".</p>
            </div>
          </div>
        </div>
        <RegisterModal
          isOpen={showRegister}
          onClose={() => { setShowRegister(false) }}
          onSuccess={() => {
            // AuthContext.user will update via supabase.auth.onAuthStateChange;
            // this component re-renders with user set and the full form mounts.
            // No checkAndEstimate replay — the form hasn't been filled.
            setShowRegister(false)
          }}
          registrationSource="estimator"
          agentId={agentId}
        />
      </>,
      document.body
    )
  }

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

          {/* W-CONDO-MODAL-PARITY Phase 2 (2026-06-11) — Geo Level Indicator
              (mirror of HomeEstimatorBuyerModal:518-532, 4-way branch on
              condo geoLevel). Gated on {geoLevel && result} — on the
              legacy S1 condo path the response carries no geoLevel
              (shared action doesn't emit it), so this block auto-hides. */}
          {geoLevel && result && (
            <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
              geoLevel === 'building'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : geoLevel === 'community'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              <span>
                {geoLevel === 'building'
                  ? '🏢'
                  : geoLevel === 'community'
                  ? '📍'
                  : '🗺️'}
              </span>
              <span>
                {geoLevel === 'building'
                  ? 'Based on recent sales in this building'
                  : geoLevel === 'community'
                  ? 'Based on recent sales in your community'
                  : geoLevel === 'municipality'
                  ? 'Based on sales across the wider municipality'
                  : geoLevel === 'area'
                  ? 'Based on sales across the wider area (limited municipality data)'
                  : ''}
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
                buildingName={buildingName}
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

          {/* F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL (Phase 1): honest email-delivery note */}
          {emailWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-amber-800 text-sm">{emailWarning}</p>
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
              competingListings={competingListings}
              resolvedCompeting={resolvedCompeting}
            />
          )}
        </div>
      </div>

      {/* Register Modal */}
      <RegisterModal
        isOpen={showRegister}
        onClose={() => { setShowRegister(false); onClose(); }}
        onSuccess={(confirmedUserId) => {
          // W-CREDIT-BLEED-PHASE2-1a (2026-06-19): pass confirmedUserId
          // through so the synchronous checkAndEstimate doesn't read a
          // stale user.id closure. Phase 1's server identity gate would
          // 403 a stale id; this avoids it. Also fire-and-forget refresh
          // the credit panel display so the user sees their fresh
          // (post-register) quotas without an F5.
          setShowRegister(false)
          if (confirmedUserId) {
            creditsCtx.refresh(undefined, confirmedUserId).catch(() => {})
          }
          checkAndEstimate(confirmedUserId)
        }}
        registrationSource="estimator"
        agentId={agentId}
      />
    </>,
    document.body
  )
}