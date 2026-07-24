'use client'

/**
 * RegisterModal — System 2 user registration + sign-in.
 *
 * Architectural role (W-TENANT-AUTH File 9):
 *   - Both registration (signUp) and sign-in (signInWithPassword) success paths call
 *     `joinTenant`, an idempotent server action that:
 *       - Creates tenant_users(user_id, tenant_id) if missing
 *       - Creates the per-tenant lead via getOrCreateLead
 *       - Calls assign-user-agent for per-tenant agent resolution
 *       - Sends welcome email
 *
 *   - This eliminates the cross-tenant blind-spot bug: previously, an existing user
 *     signing in on tenant-2 would be invisible to tenant-2 (no lead, no welcome).
 *     With joinTenant called on every successful auth, tenant-2 captures every user
 *     who ever interacts with it — even users who originally registered on tenant-1.
 *
 *   - The user-facing UI is unchanged. All side effects move into joinTenant
 *     (server-side, tenant-context-aware).
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Mail, Lock, User, Phone, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { joinTenant } from '@/app/actions/joinTenant'
import { trackEvent, type TrackedEventName } from '@/lib/analytics/track'

// GA4-GAPS-FIX 2026-07-24: map registrationSource -> GA4 event for the four
// operator-listed gap surfaces. Sources NOT in this map (property_header,
// property_gallery, home_history_modal, estimator, ai_chat, home_page,
// vip_block, walliam_onboarding_banner, etc.) do not fire a dedicated event
// here -- they're either covered elsewhere (estimator/vip via their own
// components) or intentionally out of scope for this fix.
const REGISTRATION_SOURCE_TO_EVENT: Record<string, TrackedEventName> = {
  'site_header':          'header_cta_submit',
  'site_header_mobile':   'header_cta_submit',
  'walliam_charlie_gate': 'chat_gate_submit',
  'listing_card':         'listing_card_submit',
  'home_listing_card':    'listing_card_submit',
}

interface RegisterModalProps {
  isOpen: boolean
  onClose: () => void
  // W-CHARLIE-REGISTRATION-FLOW-FIX (2026-06-14): pass the freshly-
  // confirmed user.id through to onSuccess so consumers (CharlieWidget,
  // EstimatorSeller, etc.) can use it directly instead of re-reading
  // AuthContext.user (which lags behind supabase.auth.signUp by an
  // async onAuthStateChange tick — see CreditSessionContext.refresh
  // uidOverride comment). The parameter is optional so existing
  // callsites that don't need the id continue to work.
  onSuccess?: (userId?: string) => void
  registrationSource?: string
  agentId?: string
  buildingId?: string
  buildingName?: string
  buildingAddress?: string
  listingId?: string
  listingAddress?: string
  unitNumber?: string
  estimatedValueMin?: number
  estimatedValueMax?: number
  propertyDetails?: any
}

export default function RegisterModal({
  isOpen,
  onClose,
  onSuccess,
  registrationSource = 'home_page',
  agentId,
  buildingId,
  buildingName,
  buildingAddress,
  listingId,
  listingAddress,
  unitNumber,
  estimatedValueMin,
  estimatedValueMax,
  propertyDetails
}: RegisterModalProps) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  // Helper: invoke joinTenant with all available context.
  // Used by BOTH registration and sign-in success paths — joinTenant is idempotent.
  const callJoinTenant = async (
    userId: string,
    fullName: string,
    email: string,
    phone: string
  ) => {
    try {
      const result = await joinTenant({
        userId,
        fullName,
        email,
        phone,
        registrationSource,
        registrationUrl: window.location.href,
        marketingConsent: true,
        buildingId,
        buildingName,
        buildingAddress,
        listingId,
        listingAddress,
        unitNumber,
        estimatedValueMin,
        estimatedValueMax,
        propertyDetails,
      })

      if (!result.success) {
        console.error('[RegisterModal] joinTenant failed:', result.error)
      } else if (result.isNewToTenant) {
        console.log('[RegisterModal] new tenant relationship — lead created, agent assigned, welcome sent')
        // GA4-GAPS-FIX 2026-07-24: fire conversion only when joinTenant
        // reports isNewToTenant (i.e. a new lead row was created for this
        // tenant). Returning users get no event -- correct, no conversion
        // happened. Test-email guard on the visitor's typed email.
        const mappedEvent = REGISTRATION_SOURCE_TO_EVENT[registrationSource]
        if (mappedEvent) {
          trackEvent(
            mappedEvent,
            { source: registrationSource },
            { contactEmail: email },
          )
        }
      } else {
        console.log('[RegisterModal] returning user — no-op')
      }
    } catch (err) {
      console.error('[RegisterModal] joinTenant exception:', err)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match")
      return
    }
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    setIsSubmitting(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            phone: formData.phone,
            registration_url: window.location.href
          }
        }
      })

      if (authError) throw authError

      if (authData.user) {
        // joinTenant handles all server-side cascade:
        // tenant_users insert, agent assignment, lead creation, welcome email.
        await callJoinTenant(
          authData.user.id,
          formData.fullName,
          formData.email,
          formData.phone
        )

        // W-CHARLIE-REGISTRATION-FLOW-FIX (2026-06-14): pass the freshly-
        // confirmed user.id so the consumer can avoid the AuthContext
        // propagation race in refresh().
        if (onSuccess) onSuccess(authData.user.id)
        onClose()
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      })

      if (loginError) throw loginError

      if (data.user) {
        // CRITICAL: call joinTenant on EVERY successful sign-in.
        // For returning users on a known tenant: idempotent no-op.
        // For users new to this tenant (e.g., walliam user signing in on tenant-2 for
        // the first time): creates tenant_users row, lead, agent, welcome email.
        // This is the fix for the cross-tenant blind-spot bug.
        await callJoinTenant(
          data.user.id,
          // Pull what we have from form; fullName/phone may be empty on sign-in form.
          formData.fullName || (data.user.user_metadata?.full_name as string) || '',
          data.user.email || formData.email,
          formData.phone || (data.user.user_metadata?.phone as string) || ''
        )

        // W-CHARLIE-REGISTRATION-FLOW-FIX (2026-06-14): same as the
        // signUp path — pass the confirmed user.id so the consumer
        // doesn't race AuthContext.
        if (onSuccess) onSuccess(data.user.id)
        onClose()
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h3 className="text-2xl font-bold text-gray-900" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{'\u2726'}</span> {showLogin ? 'Welcome Back' : 'VIP AI Access'}
              </h3>
              <p className="text-gray-600 mt-1">
                {showLogin ? 'Sign in to your VIP account' : 'Register free \u2014 browse unlimited, AI features included'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={showLogin ? handleLogin : handleRegister} className="p-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {!showLogin && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Full Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    name="fullName"
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={handleChange}
                    placeholder="John Doe"
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="john@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {!showLogin && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Phone *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    name="phone"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="(416) 555-1234"
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder=""
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {!showLogin && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Confirm Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    name="confirmPassword"
                    type="password"
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}

            {!showLogin && (
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="marketing"
                  defaultChecked
                  className="mt-1"
                />
                <label htmlFor="marketing" className="text-sm text-gray-600">
                  I agree to receive property updates and market insights via email
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {showLogin ? 'Signing In...' : 'Creating Account...'}
                </>
              ) : (
                showLogin ? 'Sign In' : 'Create Account'
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setShowLogin(!showLogin)
                  setError(null)
                }}
                className="text-blue-600 hover:text-blue-700 text-sm font-semibold"
              >
                {showLogin ? "Don't have an account? Register" : 'Already have an account? Sign In'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )

  return createPortal(modalContent, document.body)
}