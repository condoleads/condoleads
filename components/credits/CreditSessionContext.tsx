// components/credits/CreditSessionContext.tsx
'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthContext'
import { useTenantId } from '@/hooks/useTenantId'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreditSessionState {
  // Identity
  sessionId: string | null
  userId: string | null
  tenantId: string | null
  isRegistered: boolean

  // Tenant-configured assistant name (dynamic per tenant; fallback only if API response missing)
  assistantName: string

  // Chat credit state
  messageCount: number
  chatFreeMessages: number
  chatHardCap: number

  // Plan credit state
  buyerPlansUsed: number
  sellerPlansUsed: number
  totalAllowed: number
  planMode: 'shared' | 'independent'
  sellerPlanFreeAttempts: number

  // Estimator credit state
  estimatorCount: number
  estimatorFreeAttempts: number
  estimatorHardCap: number

  // VIP / status
  status: string
  vipRequestStatus: string
  vipAutoApprove: boolean

  // Loading flag — true until first fetch resolves (or we determine no fetch is needed)
  loading: boolean
}

interface CreditSessionContextValue {
  state: CreditSessionState
  /** Bump message_count locally after a successful chat call. */
  incrementMessageCount: () => void
  /** Bump plans_used locally after a successful plan generation. */
  incrementPlansUsed: (planType: 'buyer' | 'seller') => void
  /** Re-fetch session from server (e.g. after registration completes). */
  // W-CHARLIE-REGISTRATION-FLOW-FIX (2026-06-14): optional uidOverride.
  // After register/login success, the calling component already has the
  // freshly-confirmed user.id (from supabase.auth.signUp's authData) and
  // would otherwise pass it to AuthContext, but AuthContext's user state
  // only updates via supabase.auth.onAuthStateChange (async listener),
  // which has NOT necessarily fired by the time refresh() runs from the
  // RegisterModal.onSuccess callback. Without an override, refresh()
  // reads `user?.id` from AuthContext at line ~238, gets the lagged null,
  // and routes to loadAnonymousDefaults — leaving state.userId = null
  // and triggering the post-register gate-loop. Override lets the caller
  // pass the known-fresh id so refresh routes to loadSession correctly.
  refresh: (pageContext?: { listing_id?: string; building_id?: string; community_id?: string; municipality_id?: string; area_id?: string }, uidOverride?: string | null) => Promise<void>
  /** Reset to defaults (e.g. on sign-out). */
  clear: () => void
}

// ─── Defaults ───────────────────────────────────────────────────────────────
// Safety floors used only if API response is malformed. Tenant-agnostic.

const DEFAULT_STATE: CreditSessionState = {
  sessionId: null,
  userId: null,
  tenantId: null,
  isRegistered: false,
  assistantName: '',
  messageCount: 0,
  chatFreeMessages: 0,
  chatHardCap: 25,
  buyerPlansUsed: 0,
  sellerPlansUsed: 0,
  totalAllowed: 1,
  planMode: 'shared',
  sellerPlanFreeAttempts: 1,
  estimatorCount: 0,
  estimatorFreeAttempts: 0,
  estimatorHardCap: 10,
  status: 'active',
  vipRequestStatus: 'none',
  vipAutoApprove: false,
  loading: true,
}

// ─── Context ────────────────────────────────────────────────────────────────

const CreditSessionContext = createContext<CreditSessionContextValue | null>(null)

// ─── Pathname guard ─────────────────────────────────────────────────────────
// Routes where the provider is inert (mirrors ConditionalLayout's isCharlieVisible).
// These are platform-level routes that never consume credits, regardless of tenant.

function isInertRoute(pathname: string | null): boolean {
  if (!pathname) return true
  if (pathname.startsWith('/admin')) return true
  if (pathname.startsWith('/dashboard')) return true
  if (pathname === '/login') return true
  return false
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function CreditSessionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const tenantId = useTenantId()
  const pathname = usePathname()

  const [state, setState] = useState<CreditSessionState>(DEFAULT_STATE)

  // Track which (userId, tenantId) tuple was last fetched. Prevents duplicate
  // fetches in StrictMode dev double-mount and across re-renders.
  const lastFetchKey = useRef<string | null>(null)

  // ─── Anonymous defaults loader ────────────────────────────────────────────
  // For anonymous users on a tenant page, pull tenant config so pills show
  // "X free" before registration. Cheap, separate from /session.

  const loadAnonymousDefaults = useCallback(async (tid: string) => {
    try {
      const res = await fetch('/api/walliam/tenant-config', {
        headers: { 'x-tenant-id': tid },
      })
      if (!res.ok) return
      const cfg = await res.json()
      // W-CREDIT-STALE-INVALIDATION (2026-06-19): FULL REPLACE — was a
      // SPREAD over prev. Auth flicker (user.id momentarily null) was
      // landing this overlay on top of a previously-loaded registered
      // state, preserving fields like estimatorCount/status/vipRequest
      // Status from the registered render. Anonymous state must be
      // self-consistent. Values are byte-identical to the prior spread
      // for the fields cfg carries; other fields take DEFAULT_STATE.
      setState({
        sessionId: null,
        userId: null,
        tenantId: tid,
        isRegistered: false,
        assistantName: cfg.assistantName || '',
        messageCount: 0,
        chatFreeMessages: cfg.chatFree ?? 0,
        chatHardCap: DEFAULT_STATE.chatHardCap,
        buyerPlansUsed: 0,
        sellerPlansUsed: 0,
        totalAllowed: cfg.planFree ?? 1,
        planMode: 'shared',
        sellerPlanFreeAttempts: DEFAULT_STATE.sellerPlanFreeAttempts,
        estimatorCount: 0,
        estimatorFreeAttempts: cfg.estFree ?? 0,
        estimatorHardCap: DEFAULT_STATE.estimatorHardCap,
        status: 'active',
        vipRequestStatus: 'none',
        vipAutoApprove: false,
        loading: false,
      })
    } catch {
      // W-CREDIT-STALE-INVALIDATION (2026-06-19): FULL REPLACE on the
      // catch branch too — preserves DEFAULT_STATE semantics on network
      // failure, no stale registered fragments. Behaviour change: any
      // prior registered render is REPLACED with DEFAULT_STATE on a
      // tenant-config network failure during an anonymous overlay.
      // Trade-off accepted: failing closed to clean defaults is safer
      // than a half-overlaid registered state.
      setState({ ...DEFAULT_STATE, tenantId: tid, loading: false })
    }
  }, [])

  // ─── Session loader ───────────────────────────────────────────────────────
  // For registered users: single POST to the session route.
  // The route handles claim-existing-anonymous + create-if-none.

  const loadSession = useCallback(async (uid: string, tid: string, pageContext?: { listing_id?: string; building_id?: string; community_id?: string; municipality_id?: string; area_id?: string }) => {
    try {
      const res = await fetch('/api/walliam/charlie/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tid },
        body: JSON.stringify({
          userId: uid,
          listing_id: pageContext?.listing_id || null,
          building_id: pageContext?.building_id || null,
          community_id: pageContext?.community_id || null,
          municipality_id: pageContext?.municipality_id || null,
          area_id: pageContext?.area_id || null,
          existingSessionId: null,
        }),
      })
      if (!res.ok) {
        setState(prev => ({ ...prev, loading: false }))
        return
      }
      const data = await res.json()
      setState({
        sessionId: data.sessionId ?? null,
        userId: uid,
        tenantId: tid,
        isRegistered: !!data.isRegistered,
        assistantName: data.assistantName || '',
        messageCount: data.messageCount ?? 0,
        chatFreeMessages: data.chatFreeMessages ?? 0,
        chatHardCap: data.chatHardCap ?? 25,
        buyerPlansUsed: data.buyerPlansUsed ?? 0,
        sellerPlansUsed: data.sellerPlansUsed ?? 0,
        totalAllowed: data.totalAllowed ?? 1,
        planMode: data.planMode ?? 'shared',
        sellerPlanFreeAttempts: data.sellerPlanFreeAttempts ?? 1,
        estimatorCount: data.estimatorCount ?? 0,
        estimatorFreeAttempts: data.estimatorFreeAttempts ?? 0,
        estimatorHardCap: data.estimatorHardCap ?? 10,
        status: data.status ?? 'active',
        vipRequestStatus: data.vipRequestStatus ?? 'none',
        vipAutoApprove: !!data.vipAutoApprove,
        loading: false,
      })
    } catch {
      setState(prev => ({ ...prev, loading: false }))
    }
  }, [])

  // ─── Main effect: decide what to fetch ────────────────────────────────────

  useEffect(() => {
    // Inert on admin/dashboard/login routes — no work, no fetch
    if (isInertRoute(pathname)) {
      lastFetchKey.current = null
      return
    }

    // Wait for auth resolution and tenantId hydration
    if (authLoading) return
    if (!tenantId) return

    const userId = user?.id ?? null
    const fetchKey = `${userId ?? 'anon'}:${tenantId}`

    // Deduplicate — same (userId, tenantId) shouldn't trigger a refetch
    if (lastFetchKey.current === fetchKey) return
    lastFetchKey.current = fetchKey

    if (userId) {
      loadSession(userId, tenantId)
    } else {
      loadAnonymousDefaults(tenantId)
    }
  }, [authLoading, user?.id, tenantId, pathname, loadSession, loadAnonymousDefaults])

  // ─── Mutators ────────────────────────────────────────────────────────────

  const incrementMessageCount = useCallback(() => {
    setState(prev => ({ ...prev, messageCount: prev.messageCount + 1 }))
  }, [])

  const incrementPlansUsed = useCallback((planType: 'buyer' | 'seller') => {
    setState(prev =>
      planType === 'seller'
        ? { ...prev, sellerPlansUsed: prev.sellerPlansUsed + 1 }
        : { ...prev, buyerPlansUsed: prev.buyerPlansUsed + 1 }
    )
  }, [])

  const refresh = useCallback(async (
    pageContext?: { listing_id?: string; building_id?: string; community_id?: string; municipality_id?: string; area_id?: string },
    uidOverride?: string | null,
  ) => {
    if (!tenantId) return
    if (isInertRoute(pathname)) return
    // W-CHARLIE-REGISTRATION-FLOW-FIX (2026-06-14): prefer caller-supplied
    // uidOverride over AuthContext.user.id. See interface comment above.
    // When undefined OR an explicit empty string, fall through to
    // AuthContext (preserves pre-fix behavior for every callsite that
    // does NOT pass the override).
    const userId = (uidOverride ?? user?.id) ?? null
    // Force refetch by clearing dedupe key
    lastFetchKey.current = null
    if (userId) {
      await loadSession(userId, tenantId, pageContext)
    } else {
      await loadAnonymousDefaults(tenantId)
    }
    lastFetchKey.current = `${userId ?? 'anon'}:${tenantId}`
  }, [tenantId, pathname, user?.id, loadSession, loadAnonymousDefaults])

  // ─── Focus / visibility refetch ──────────────────────────────────────────
  // W-CREDIT-STALE-INVALIDATION (2026-06-19): close the stale-grant gap.
  // Server returns the live denominator fresh per request (RECON-3 R1),
  // but the dedup key in the main useEffect (userId:tenantId) means a tab
  // open at the moment an admin writes user_credit_overrides never sees
  // the new value until F5 / sign-out+in. Realtime invalidation is not
  // viable today (RECON R2: supabase_realtime publication is empty,
  // user_credit_overrides is not published — channels would silently
  // no-op). Visibility-refetch pattern matches AuditSidebar.tsx:107-124
  // and QueueIndicator.tsx:88. Refetches on tab-focus — the natural
  // moment the user discovers the new grant when they return to use a
  // credit. Reuses the existing refresh() which calls loadSession.
  const refreshInFlight = useRef(false)
  useEffect(() => {
    // Guard: skip on inert routes (refresh() also guards but defense in depth)
    if (isInertRoute(pathname)) return

    const onWake = async () => {
      // Skip if tab isn't actually visible (visibilitychange fires both
      // ways; we only want the visible side).
      if (typeof document !== 'undefined' && document.hidden) return
      // Skip if no signed-in user — anonymous defaults don't depend on
      // the user_credit_overrides table.
      if (!user?.id) return
      // Skip if a refresh is already in flight (coalesces double-fire
      // when both focus + visibilitychange land in the same tick).
      if (refreshInFlight.current) return
      refreshInFlight.current = true
      try {
        await refresh()
      } finally {
        refreshInFlight.current = false
      }
    }

    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [pathname, user?.id, refresh])

  const clear = useCallback(() => {
    lastFetchKey.current = null
    setState(DEFAULT_STATE)
  }, [])

  return (
    <CreditSessionContext.Provider
      value={{ state, incrementMessageCount, incrementPlansUsed, refresh, clear }}
    >
      {children}
    </CreditSessionContext.Provider>
  )
}

// ─── Consumer hook ──────────────────────────────────────────────────────────

export function useCreditSession(): CreditSessionContextValue {
  const ctx = useContext(CreditSessionContext)
  if (!ctx) {
    throw new Error('useCreditSession must be used within CreditSessionProvider')
  }
  return ctx
}