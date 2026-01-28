// components/estimator/EstimatorVipWrapper.tsx
'use client'

import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import VipPrompt from '@/components/chat/VipPrompt'
import VipRequestForm, { VipRequestData } from '@/components/chat/VipRequestForm'

interface EstimatorVipWrapperProps {
  agentId: string
  agentName?: string
  userId: string
  buildingName?: string
  buildingId?: string
  pageUrl?: string
  children: React.ReactNode
}

interface SessionState {
  sessionId: string | null
  allowed: boolean
  action: 'allow' | 'show_questionnaire' | 'request_approval' | 'blocked' | null
  reason?: string
  currentUsage: number
  totalAllowed: number
  remaining: number
  questionnaireCompleted: boolean
  vipRequestStatus: 'idle' | 'pending' | 'approved' | 'denied'
  vipRequestId: string | null
  useSharedPool: boolean
  aiEstimatorEnabled: boolean
}

interface EstimatorContextValue {
  requestEstimate: () => Promise<boolean>
  session: SessionState
}

const EstimatorContext = createContext<EstimatorContextValue | null>(null)

export function useEstimatorContext() {
  const context = useContext(EstimatorContext)
  return context // Returns null if not inside wrapper
}

export default function EstimatorVipWrapper({
  agentId,
  agentName,
  userId,
  buildingName,
  buildingId,
  pageUrl,
  children
}: EstimatorVipWrapperProps) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SessionState>({
    sessionId: null,
    allowed: false,
    action: null,
    currentUsage: 0,
    totalAllowed: 0,
    remaining: 0,
    questionnaireCompleted: false,
    vipRequestStatus: 'idle',
    vipRequestId: null,
    useSharedPool: false,
    aiEstimatorEnabled: false
  })
  
  const [agentNameState, setAgentNameState] = useState<string>(agentName || '')
  const [showVipPrompt, setShowVipPrompt] = useState(false)
  const [showVipForm, setShowVipForm] = useState(false)
  const [showWaiting, setShowWaiting] = useState(false)
  const [showDenied, setShowDenied] = useState(false)
  const [showBlocked, setShowBlocked] = useState(false)
  const [vipLoading, setVipLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize session on mount
  useEffect(() => {
    initializeSession()
  }, [agentId, userId])

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
            // Both conditions met - refresh session
            setShowWaiting(false)
            await initializeSession()
          } else {
            // Show questionnaire
            setShowWaiting(false)
            setShowVipForm(true)
          }
          clearInterval(pollInterval)
        } else if (data.status === 'denied') {
          setSession(prev => ({ ...prev, vipRequestStatus: 'denied' }))
          setShowWaiting(false)
          setShowDenied(true)
          clearInterval(pollInterval)
        }
      } catch (err) {
        console.error('Error polling VIP status:', err)
      }
    }, 5000)

    return () => clearInterval(pollInterval)
  }, [session.vipRequestId, session.vipRequestStatus, session.questionnaireCompleted])

  async function initializeSession() {
    setLoading(true)
    try {
      const response = await fetch('/api/estimator/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userId, buildingId })
      })

      const data = await response.json()

      if (data.error) {
        setError(data.error)
        return
      }

      if (data.agentName) {
        setAgentNameState(data.agentName)
      }

      setSession({
        sessionId: data.sessionId,
        allowed: data.allowed,
        action: data.action,
        reason: data.reason,
        currentUsage: data.currentUsage,
        totalAllowed: data.totalAllowed,
        remaining: data.remaining,
        questionnaireCompleted: data.questionnaireCompleted,
        vipRequestStatus: data.vipRequestStatus || 'idle',
        vipRequestId: data.vipRequestId,
        useSharedPool: data.limits?.useSharedPool || false,
        aiEstimatorEnabled: data.aiEstimatorEnabled
      })

    } catch (err) {
      console.error('Failed to initialize session:', err)
      setError('Failed to initialize. Please refresh.')
    } finally {
      setLoading(false)
    }
  }

  // This is the gatekeeper function - called BEFORE estimate runs
  const requestEstimate = useCallback(async (): Promise<boolean> => {
    // Re-fetch current session state to get latest usage
    try {
      const response = await fetch('/api/estimator/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userId })
      })

      const data = await response.json()

      if (data.error) {
        setError(data.error)
        return false
      }

      // Update session state
      setSession({
        sessionId: data.sessionId,
        allowed: data.allowed,
        action: data.action,
        reason: data.reason,
        currentUsage: data.currentUsage,
        totalAllowed: data.totalAllowed,
        remaining: data.remaining,
        questionnaireCompleted: data.questionnaireCompleted,
        vipRequestStatus: data.vipRequestStatus || 'idle',
        vipRequestId: data.vipRequestId,
        useSharedPool: data.limits?.useSharedPool || false,
        aiEstimatorEnabled: data.aiEstimatorEnabled
      })

      // Check if allowed
      if (data.allowed && data.remaining > 0) {
        // Increment usage FIRST
        await fetch('/api/estimator/increment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: data.sessionId,
            useSharedPool: data.limits?.useSharedPool || false
          })
        })
        return true // Proceed with estimate
      }

      // Not allowed - determine what to show
      if (data.action === 'blocked') {
        setShowBlocked(true)
        return false
      }

      if (data.vipRequestStatus === 'denied') {
        setShowDenied(true)
        return false
      }

      if (data.vipRequestStatus === 'pending') {
        if (data.questionnaireCompleted) {
          setShowWaiting(true)
        } else {
          setShowVipForm(true)
        }
        return false
      }

      if (data.vipRequestStatus === 'approved' && !data.questionnaireCompleted) {
        setShowVipForm(true)
        return false
      }

      // Need to start VIP flow - show phone prompt
      setShowVipPrompt(true)
      return false

    } catch (err) {
      console.error('Error checking usage:', err)
      setError('Error checking usage. Please try again.')
      return false
    }
  }, [agentId, userId])

  async function handleVipAccept(phone: string) {
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
          pageUrl: pageUrl || window.location.href,
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
        setShowVipForm(true) // Show questionnaire immediately
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

  async function handleQuestionnaireSubmit(data: VipRequestData) {
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

        // If already approved, refresh to unlock
        if (session.vipRequestStatus === 'approved') {
          await initializeSession()
        } else {
          // Show waiting message
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

  function handleVipDecline() {
    setShowVipPrompt(false)
  }

  function handleFormCancel() {
    if (session.vipRequestStatus === 'pending' || session.vipRequestStatus === 'approved') {
      // Can't skip - remind them
      setShowVipForm(false)
      setTimeout(() => setShowVipForm(true), 2000)
    } else {
      setShowVipForm(false)
      setShowVipPrompt(true)
    }
  }

  function closeOverlay() {
    setShowVipPrompt(false)
    setShowVipForm(false)
    setShowWaiting(false)
    setShowDenied(false)
    setShowBlocked(false)
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">{error}</p>
        <button 
          onClick={() => { setError(null); initializeSession(); }}
          className="mt-2 text-sm text-red-600 underline"
        >
          Try again
        </button>
      </div>
    )
  }

  // Render children with context, plus overlay if needed
  return (
    <EstimatorContext.Provider value={{ requestEstimate, session }}>
      <div className="relative">
        {children}
        
        {/* VIP Prompt Overlay */}
        {showVipPrompt && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-lg z-10">
            <VipPrompt
              agentName={agentNameState}
              onAccept={handleVipAccept}
              onDecline={handleVipDecline}
              isLoading={vipLoading}
              variant="inline"
            />
          </div>
        )}

        {/* Questionnaire Form Overlay */}
        {showVipForm && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-lg z-10">
            <VipRequestForm
              agentName={agentNameState}
              buildingName={buildingName}
              onSubmit={handleQuestionnaireSubmit}
              onCancel={handleFormCancel}
              isLoading={vipLoading}
              variant="inline"
            />
          </div>
        )}

        {/* Waiting for Approval Overlay */}
        {showWaiting && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-lg z-10">
            <div className="bg-white p-6 rounded-xl shadow-lg text-center max-w-sm">
              <div className="animate-pulse mb-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-2xl">⏳</span>
                </div>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Waiting for Approval</h3>
              <p className="text-sm text-gray-600">
                {agentNameState} has been notified. You'll get access once approved.
              </p>
            </div>
          </div>
        )}

        {/* Denied Overlay */}
        {showDenied && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-lg z-10">
            <div className="bg-white p-6 rounded-xl shadow-lg text-center max-w-sm">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📞</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Contact Agent Directly</h3>
              <p className="text-sm text-gray-600">
                Please reach out to {agentNameState} directly for a personalized estimate.
              </p>
            </div>
          </div>
        )}

        {/* Blocked Overlay */}
        {showBlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-lg z-10">
            <div className="bg-white p-6 rounded-xl shadow-lg text-center max-w-sm">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🔒</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Limit Reached</h3>
              <p className="text-sm text-gray-600">{session.reason}</p>
            </div>
          </div>
        )}
      </div>
    </EstimatorContext.Provider>
  )
}