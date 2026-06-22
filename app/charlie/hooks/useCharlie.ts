// app/charlie/hooks/useCharlie.ts
'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useTenantId } from '@/hooks/useTenantId'
import { useCreditSession } from '@/components/credits/CreditSessionContext'
// W-CHARLIE-INCHAT-TAXMATCH-HYDRATE (2026-06-16): direct-hydrate path
// stashes plan-email response.backfilledTaxMatch here so the in-chat
// Tax-Matched block can render without depending on its self-fetch
// (which silently fails on the failing-path session per operator
// report on a589f10/06dc1bd post-deploy).
import type { BuyerTaxMatch } from '@/lib/charlie/buyer-tax-match'

export type MessageRole = 'user' | 'assistant'
export type ConversationBlock =
  | { type: 'analytics'; data: any; geoName: string }
  | { type: 'listings'; label: string; listings: any[] }
  | { type: 'buildings'; label: string; buildings: any[] }
  | { type: 'rankings'; rankType: string; data: any }
  | { type: 'priceTrends'; data: any }
  | { type: 'sellerEstimate'; data: any; analyticsSnapshot: any | null; geoName: string }
  | { type: 'comparables'; listings: any[]; intent: string }
  | { type: 'plan'; data: any; analyticsSnapshot: any; listingsSnapshot: any[]; geoContext: any }

export type ToolName = 'resolve_geo' | 'get_market_analytics' | 'search_listings' | 'get_comparables' | 'generate_plan' | 'search_buildings' | 'compare_geo' | 'get_price_trends' | 'get_investment_rankings' | 'get_inventory_rankings' | 'get_seasonal_trends' | 'get_building_directory'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  streaming?: boolean
}

export interface ToolResult {
  tool: ToolName
  data: any
}

export interface CharlieState {
  messages: ChatMessage[]
  toolResults: ToolResult[]
  analytics: any[]
  geoContext: { geoType: string; geoId: string; geoName: string } | null
  listingGroups: { label: string; listings: any[] }[]
  comparables: any[]
  isStreaming: boolean
  isOpen: boolean
  initialForm: 'buyer' | 'seller' | null
  activePanel: 'chat' | 'results'
  mode: 'search' | 'buyer_funnel' | 'seller_funnel'
  planReady: boolean
  plan: any | null
  leadCaptureActive: boolean
  leadCaptured: boolean
  buyerProfile: any
  sellerProfile: any
  sellerEstimate: any | null
  searchedBuildings: { label: string; buildings: any[] }[]
  rankings: any[]
  priceTrends: any[]
  seasonalData: any | null
  // WALLiam session
  sessionId: string | null
  userId: string | null
  buyerPlansUsed: number
  sellerPlansUsed: number
  totalAllowed: number
  // Chat credits
  messageCount: number
  chatFreeMessages: number
  chatHardCap: number
  // Estimator credits
  estimatorCount: number
  estimatorFreeAttempts: number
  estimatorHardCap: number
  // Plan mode
  planMode: 'shared' | 'independent'
  sellerPlanFreeAttempts: number
  isRegistered: boolean
  // Gate state
  gateActive: boolean
  gateReason: 'register' | 'vip_required' | 'chat_limit' | null
  gatePlanType: 'buyer' | 'seller' | null
  // W-CHARLIE-REGISTRATION-FLOW-FIX (2026-06-14): when an unauth user
  // tries to open a buyer/seller form, requestForm() sets this BEFORE
  // surfacing the register gate. After register success, resumeAfterGate
  // promotes pendingForm → initialForm so CharlieOverlay opens the
  // form the user wanted. Replaces the post-form gate which
  // historically let the user fill the form before being prompted to
  // register, and which depended on a stale chat-message replay to
  // resume the flow.
  pendingForm: 'buyer' | 'seller' | null
  vipRequestId: string | null
  vipRequestStatus: 'idle' | 'pending' | 'approved' | 'denied'
  vipCreditUsed: boolean
  chatCreditUsed: boolean
  approvalNotification: boolean
  chatCreditCount: number
  chatCreditTotal: number
  isPlanGenerating: boolean
  vipCreditPlanType: 'buyer' | 'seller' | null
  vipCreditPlansUsed: number
  vipCreditTotal: number
  blocks: ConversationBlock[]
  // Assistant name (per-tenant)
  assistantName: string
  // W-CHARLIE-INCHAT-TAXMATCH-HYDRATE (2026-06-16): stash slot for the
  // plan-email route's already-derived buyerTaxMatch. Populated by the
  // .then handler when the session was on the failing-path (listings
  // were empty pre-POST). Read by BuyerTaxMatchInChat via initialBtm
  // prop so the block renders without depending on its self-fetch.
  // null in every in-session code path — see the empty-only guard in
  // the .then handler.
  backfilledTaxMatch: BuyerTaxMatch | null
}

const INITIAL_STATE: CharlieState = {
  messages: [],
  toolResults: [],
  analytics: [],
  searchedBuildings: [],
  rankings: [],
  priceTrends: [],
  seasonalData: null,
  geoContext: null,
  listingGroups: [],
  comparables: [],
  isStreaming: false,
  isOpen: false,
  initialForm: null,
  activePanel: 'chat',
  mode: 'search',
  planReady: false,
  plan: null,
  leadCaptureActive: false,
  leadCaptured: false,
  buyerProfile: {},
  sellerProfile: {},
  sellerEstimate: null,
  sessionId: null,
  userId: null,
  buyerPlansUsed: 0,
  sellerPlansUsed: 0,
  totalAllowed: 1,
  messageCount: 0,
  chatFreeMessages: 5,
  chatHardCap: 25,
  estimatorCount: 0,
  estimatorFreeAttempts: 2,
  estimatorHardCap: 10,
  planMode: 'shared',
  sellerPlanFreeAttempts: 1,
  isRegistered: false,
  gateActive: false,
  gateReason: null,
  gatePlanType: null,
  // W-CHARLIE-REGISTRATION-FLOW-FIX (2026-06-14): see state interface comment.
  pendingForm: null,
  vipRequestId: null,
  vipRequestStatus: 'idle',
  vipCreditUsed: false,
  chatCreditUsed: false,
  approvalNotification: false,
  chatCreditCount: 0,
  chatCreditTotal: 5,
  isPlanGenerating: false,
  vipCreditPlansUsed: 0,
  vipCreditTotal: 1,
  vipCreditPlanType: null,
  blocks: [],
  assistantName: 'Charlie',
  backfilledTaxMatch: null,
}

export function useCharlie() {
  const tenantId = useTenantId()
  const tenantIdRef = useRef<string | null>(null)
  useEffect(() => { tenantIdRef.current = tenantId }, [tenantId])
  const credits = useCreditSession()
  const creditsRef = useRef(credits)
  useEffect(() => { creditsRef.current = credits }, [credits])
  const [state, setStateRaw] = useState<CharlieState>(INITIAL_STATE)
  const setState = (updater: CharlieState | ((s: CharlieState) => CharlieState)) => {
    setStateRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      stateRef.current = next
      return next
    })
  }
  const stateRef = useRef<CharlieState>(INITIAL_STATE)
  const analyticsRef = useRef<any>(null)
  const sessionId = useRef(Math.random().toString(36).slice(2))
  const geoContextRef = useRef<any>(null)
  const greetingSentRef = useRef(false)
  const messagesRef = useRef<any[]>([])
  const lastUserMessageRef = useRef<string | null>(null)
  const sendMessageRef = useRef<any>(null)
  const pageContextRef = useRef<any>(null)

  const setPageContext = useCallback((context: any) => {
    pageContextRef.current = context
  }, [])

  const dismissGate = useCallback(() => {
    setState(s => ({ ...s, gateActive: false, gateReason: null, gatePlanType: null }))
  }, [])

  const requestVipAccess = useCallback(async (planType: 'buyer' | 'seller' | 'chat' | 'estimator') => {
    const sid = creditsRef.current.state.sessionId
    if (!sid) return
    try {
      const res = await fetch('/api/walliam/charlie/vip-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, planType }),
      })
      const data = await res.json()
      if (data.success) {
        // F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL (Phase 1): if the request's
        // agent-chain email or the user-approval email (auto-approve branch)
        // didn't reach the recipient, surface a soft note. Request row saved.
        const vipWarning = data.chainEmailSent === false
          ? "Request submitted — but we couldn't email your agent directly. They may not see it until they check the dashboard."
          : (data.userEmailSent === false
            ? "Access approved — we couldn't email confirmation. You can return to your plan anytime."
            : null)
        setState(s => ({
          ...s,
          vipRequestId: data.requestId,
          vipRequestStatus: data.status,
          gateActive: false,
          ...(vipWarning ? { vipEmailWarning: vipWarning } : {}),
        }))
      }
    } catch (err) {
      console.error('[useCharlie] requestVipAccess error:', err)
    }
  }, [])

  // Poll VIP request status when pending — refresh credits on approval
  useEffect(() => {
    if (stateRef.current?.vipRequestStatus !== 'pending') return
    const requestId = stateRef.current?.vipRequestId
    if (!requestId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/walliam/charlie/vip-request?requestId=${requestId}`)
        const data = await res.json()
        if (data.status === 'approved' || data.status === 'denied') {
          clearInterval(interval)
          if (data.status === 'approved') {
            // Refresh session credits after approval
            const uid = creditsRef.current.state.userId
            const pctx = pageContextRef.current
            if (uid) await creditsRef.current.refresh(pctx)
          }
          setState(s => ({ ...s, vipRequestStatus: data.status, gateActive: false, approvalNotification: data.status === 'approved' ? true : s.approvalNotification }))
        }
      } catch {}
    }, 10000)
    return () => clearInterval(interval)
  }, [state.vipRequestStatus])

  const setLeadCaptured = useCallback(() => {
    setState(s => ({ ...s, leadCaptured: true }))
  }, [])

  // W-CHARLIE-REGISTRATION-FLOW-FIX (2026-06-14): centralized form-open
  // gate. ChatPanel's "I want to buy/sell" chips AND the homepage CTAs
  // both call this. When userId is null, surface the register modal
  // BEFORE the form mounts and stash the desired form in pendingForm
  // so resumeAfterGate can apply it post-register. When userId is
  // present, set initialForm directly so the form opens immediately
  // (authed path is byte-equivalent to pre-fix behavior).
  const requestForm = useCallback((mode: 'buyer' | 'seller') => {
    // W-CHARLIE-BUYER-CHUNK1 (2026-06-15): when switching INTO a buyer flow,
    // wipe stale seller state so it can't render under the buyer flow OR
    // thread into the buyer plan-email POST. Real lead 6d479d84 was a buyer
    // plan that inherited the prior seller flow's sellerEstimate because
    // nothing cleared it at flow boundaries. We clear:
    //   - sellerEstimate (the canonical leak source — passed to plan-email
    //     POST at line ~520; gated there by data.type, but clearing here
    //     also stops in-chat blocks from rendering stale seller content).
    //   - blocks of type 'sellerEstimate' (the visible in-chat seller-
    //     estimate panel that would otherwise stay on screen while the
    //     user fills the buyer form).
    // Seller-flow direction (mode === 'seller') is untouched — operators
    // who switch buyer→seller want the seller estimator to mount fresh,
    // and a prior buyer flow has nothing equivalent to leak.
    const isAuthed = !!creditsRef.current.state.userId
    if (isAuthed) {
      setState(s => ({
        ...s,
        isOpen: true,
        initialForm: mode,
        pendingForm: null,
        ...(mode === 'buyer'
          ? { sellerEstimate: null, blocks: s.blocks.filter(b => b.type !== 'sellerEstimate') }
          : {}),
      }))
      return
    }
    setState(s => ({
      ...s,
      isOpen: true,
      gateActive: true,
      gateReason: 'register',
      gatePlanType: mode,
      pendingForm: mode,
      // Make sure no stale form is showing under the modal.
      initialForm: null,
      ...(mode === 'buyer'
        ? { sellerEstimate: null, blocks: s.blocks.filter(b => b.type !== 'sellerEstimate') }
        : {}),
    }))
  }, [])

  const open = useCallback((initialMessage?: string, initialForm?: 'buyer' | 'seller') => {
    // W-CHARLIE-REGISTRATION-FLOW-FIX (2026-06-14): when called with an
    // initialForm but the user isn't authed yet, route through
    // requestForm so the gate fires BEFORE the form mounts. Without
    // this, the homepage CTA path (charlie:open event with form prop)
    // would still open the form for unauth users and the gate would
    // only fire later on a chat message.
    if (initialForm && !creditsRef.current.state.userId) {
      requestForm(initialForm)
      if (initialMessage && messagesRef.current.length === 0 && !greetingSentRef.current) {
        lastUserMessageRef.current = initialMessage // resume after register
      }
      return
    }
    setState(s => ({ ...s, isOpen: true, initialForm: initialForm || null }))
    if (initialMessage && messagesRef.current.length === 0 && !greetingSentRef.current) {
      greetingSentRef.current = true
      setTimeout(() => sendMessageRef.current?.(initialMessage), 100)
    }
  }, [])

  const close = useCallback(() => {
    setState(s => ({ ...s, isOpen: false }))
  }, [])

  const setActivePanel = useCallback((panel: 'chat' | 'results') => {
    setState(s => ({ ...s, activePanel: panel }))
  }, [])

  const setGeoContext = useCallback((geoType: string, geoId: string, geoName: string) => {
    geoContextRef.current = { geoType, geoId, geoName }
    setState(s => ({ ...s, geoContext: { geoType, geoId, geoName } }))
  }, [])

  const setSellerEstimate = useCallback((data: any) => {
    setState(s => ({
      ...s,
      sellerEstimate: data,
      activePanel: 'results',
      analytics: data.marketAnalytics ? [...s.analytics, { ...data.marketAnalytics }] : s.analytics,
      geoContext: data.analyticsGeoType ? { geoType: data.analyticsGeoType, geoId: data.analyticsGeoId, geoName: data.buildingName || '' } : s.geoContext,
      blocks: [...s.blocks, { type: 'sellerEstimate', data, analyticsSnapshot: data.marketAnalytics || null, geoName: data.analyticsGeoType ? (data.buildingName || '') : s.geoContext?.geoName || '' }],
    }))
  }, [])

  const sendMessage = useCallback(async (userText: string, isGreeting = false) => {
    if (!userText.trim() && !isGreeting) return

    const userMessage = { role: 'user', content: userText }
    if (!isGreeting) lastUserMessageRef.current = userText

    // W-RECOVERY A1.2 client gate — require registration before any /api/charlie call.
    // Server enforces this too (returns 401 without auth), but client gate prevents the
    // wasted round-trip and surfaces the register modal immediately.
    if (!creditsRef.current.state.userId && !isGreeting) {
        setState(s => ({
        ...s,
        gateActive: true,
        gateReason: 'register',
        gatePlanType: null,
        isStreaming: false,
      }))
      return
    }
    // END W-RECOVERY A1.2 client gate

    if (!isGreeting) {
      const uiMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: userText,
      }
      setState(s => ({ ...s, messages: [...s.messages, uiMsg] }))
    }

    messagesRef.current = [...messagesRef.current, userMessage]

    const assistantId = (Date.now() + 1).toString()
    setState(s => ({
      ...s,
      isStreaming: true,
      messages: isGreeting ? s.messages : [
        ...s.messages,
        { id: assistantId, role: 'assistant', content: '', streaming: true }
      ]
    }))

    try {
      const currentTenantId = tenantIdRef.current
      if (!currentTenantId) { setState(s => ({ ...s, isStreaming: false })); return }

      // W-CREDITS Phase 7b — fail-fast on context not ready
      if (creditsRef.current.state.loading || !creditsRef.current.state.sessionId) {
        console.error('[useCharlie] credit session not ready — aborting send')
        setState(s => ({ ...s, isStreaming: false }))
        return
      }

      const res = await fetch('/api/charlie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': currentTenantId },
        body: JSON.stringify({
          messages: messagesRef.current,
          sessionId: creditsRef.current.state.sessionId,
          userId: creditsRef.current.state.userId,
          geoContext: geoContextRef.current ? { ...geoContextRef.current, building_id: pageContextRef.current?.building_id || null } : (pageContextRef.current?.building_id ? { building_id: pageContextRef.current.building_id } : null),
        }),
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      let addedAssistant = true

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          const raw = line.replace('data: ', '')
          try {
            const event = JSON.parse(raw)

            if (event.type === 'text') {
              assistantText += event.content
              if (!addedAssistant) {
                addedAssistant = true
                setState(s => ({
                  ...s,
                  messages: [...s.messages, { id: assistantId, role: 'assistant', content: assistantText, streaming: true }]
                }))
              } else {
                setState(s => ({
                  ...s,
                  messages: s.messages.map(m =>
                    m.id === assistantId ? { ...m, content: assistantText } : m
                  )
                }))
              }
            }

            if (event.type === 'vip_credit_used' && creditsRef.current.state.userId) {
              setState(s => ({
                ...s,
                vipCreditUsed: true,
                vipCreditPlansUsed: event.plansUsed,
                vipCreditTotal: event.totalAllowed,
                vipCreditPlanType: event.planType || 'buyer',
              }))
            }

            if (event.type === 'chat_credit_used') {
              setState(s => ({
                ...s,
                chatCreditUsed: true,
                chatCreditCount: (event as any).messageCount,
                chatCreditTotal: (event as any).chatFreeMessages,
              }))
            }

            // Gate event — plan gating fired server-side
            if (event.type === 'gate') {
              setState(s => ({
                ...s,
                isStreaming: false,
                gateActive: true,
                gateReason: event.reason,
                gatePlanType: event.planType || null,
                messages: s.messages.map(m =>
                  m.id === assistantId ? { ...m, streaming: false, content: assistantText } : m
                )
              }))
            }

            if (event.type === 'tool_result') {
              handleToolResult(event.tool, event.data)
            }

            if (event.type === 'done') {
              setState(s => ({
                ...s,
                isStreaming: false, isPlanGenerating: false,
                messages: s.messages.map(m =>
                  m.id === assistantId ? { ...m, streaming: false } : m
                )
              }))
              // W-CREDITS Phase 7b — synchronous local increment, no refetch
              creditsRef.current.incrementMessageCount()
              messagesRef.current = [
                ...messagesRef.current,
                { role: 'assistant', content: assistantText }
              ]
            }

          } catch {}
        }
      }
    } catch (err) {
      setState(s => ({ ...s, isStreaming: false }))
    }
  }, [])

  sendMessageRef.current = sendMessage

  const handleToolResult = (tool: ToolName, data: any) => {
    if (tool === 'resolve_geo' && data.geoId) {
      geoContextRef.current = { geoType: data.geoType, geoId: data.geoId, geoName: data.geoName }
      setState(s => ({ ...s, geoContext: { geoType: data.geoType, geoId: data.geoId, geoName: data.geoName } }))
    }
    if (tool === 'get_market_analytics' && data.analytics) {
        setState(s => ({ ...s, analytics: [...s.analytics, { ...data.analytics, geoType: data.geoType, geoId: data.geoId, track: data.track }], blocks: [...s.blocks, { type: 'analytics', data: { ...data.analytics, geoType: data.geoType, geoId: data.geoId, track: data.track }, geoName: s.geoContext?.geoName || '' }], activePanel: 'results' }))
        analyticsRef.current = data.analytics
    }
    if (tool === 'search_listings' && data.listings) {
      setState(s => ({ ...s, listingGroups: [...s.listingGroups, { label: data.label || 'Matched Listings', listings: data.listings }], blocks: [...s.blocks, { type: 'listings', label: data.label || 'Matched Listings', listings: data.listings }], activePanel: 'results' }))
    }
    if (tool === 'generate_plan') {
      setState(s => ({ ...s, isPlanGenerating: true }))
    }
    if (tool === 'generate_plan' && data.planReady) {
      setState(s => ({ ...s, planReady: true, plan: data, blocks: [...s.blocks, { type: 'plan', data, analyticsSnapshot: analyticsRef.current, listingsSnapshot: stateRef.current.listingGroups.flatMap(g => g.listings), geoContext: stateRef.current.geoContext }], activePanel: 'results' }))
      creditsRef.current.incrementPlansUsed(data.type === 'seller' ? 'seller' : 'buyer')
        // F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL (Phase 1): READ the response so
        // we know whether the plan email actually reached the user. If it
        // didn't, set planEmailWarning so the UI can show an honest banner.
        fetch('/api/charlie/plan-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantIdRef.current || '' },
          body: JSON.stringify({
            sessionId: creditsRef.current.state.sessionId,
            userId: creditsRef.current.state.userId,
            planType: data.type,
            plan: data,
            analytics: analyticsRef.current,
            listings: stateRef.current.listingGroups.flatMap(g => g.listings).slice(0, 10),
            geoContext: stateRef.current.geoContext,
            vipCreditUsed: stateRef.current.vipCreditUsed,
            vipCreditPlansUsed: stateRef.current.vipCreditPlansUsed,
            vipCreditTotal: stateRef.current.vipCreditTotal,
            comparables: stateRef.current.comparables.slice(0, 6),
            // W-CHARLIE-BUYER-CHUNK1 (2026-06-15): gate sellerEstimate by
            // the plan TYPE so a buyer plan never carries stale seller-flow
            // state into the POST. stateRef.current.sellerEstimate is set by
            // setSellerEstimate (line ~311) during seller flow and never
            // cleared at flow boundaries — if the same session ran seller
            // then buyer, the buyer email would render seller comp-sold +
            // tax-match (real lead 6d479d84 confirms). requestForm('buyer')
            // also wipes the state field (see edit below) for UX, but this
            // POST-time guard is the authoritative defense at the actual
            // network boundary. Server (plan-email/route.ts) gates again
            // for defense-in-depth.
            sellerEstimate: data.type === 'seller' ? stateRef.current.sellerEstimate : null,
            blocks: stateRef.current.blocks.filter(b => b.type !== 'plan').slice(0, 20),
          }),
        })
          .then(r => r.json())
          .then(planEmailData => {
            if (planEmailData?.userEmailSent === false) {
              setState(s => ({ ...s, planEmailWarning: "Plan generated — we couldn't email it to you. Save this page or contact your agent." }))
            }
            // W-CHARLIE-INCHAT-CONVERGENCE (2026-06-16): hydrate the
            // in-chat panel from the server's backfilled artifacts so
            // all 3 surfaces (in-chat, email, lead) converge on a
            // single source of truth. EMPTY-ONLY guard: only fires
            // when state.listingGroups is empty (the failing-path
            // session that skipped search_listings). In-order sessions
            // (search_listings + get_comparables fired in sequence)
            // see no change — the existing tool-pushed listingGroups
            // is preserved verbatim.
            //
            // We dispatch the For-Sale listings through the SAME
            // state-update path search_listings uses (line ~518-519
            // pattern) so the existing in-chat 'listings' block render
            // Just Works — single shaping source. BuyerTaxMatchInChat
            // self-fetches on listingGroups change, so seeding
            // listingGroups is sufficient to wake the hoisted tax-
            // match block — no additional state plumbing required.
            // Capture pre-dispatch listingGroups state BEFORE the _bfl
            // dispatch mutates it. The _bfm dispatch below uses this to
            // mirror the SAME empty-only semantics — without it, the
            // sequential setStates would see the post-_bfl state and
            // the _bfm guard would never short-circuit on the in-order
            // path. stateRef.current reflects the latest committed
            // state per the setState wrapper at line ~167-173.
            const _preHydrateEmpty = stateRef.current.listingGroups.length === 0
            const _bfl = planEmailData?.backfilledListings
            if (Array.isArray(_bfl) && _bfl.length > 0) {
              setState(s => {
                if (s.listingGroups.length > 0) return s
                return {
                  ...s,
                  listingGroups: [{ label: 'Matched Listings', listings: _bfl }],
                  blocks: [...s.blocks, { type: 'listings', label: 'Matched Listings', listings: _bfl }],
                }
              })
            }
            // W-CHARLIE-INCHAT-TAXMATCH-HYDRATE (2026-06-16): stash
            // backfilledTaxMatch alongside listings hydration. Same
            // empty-only guard semantics via _preHydrateEmpty — if
            // the session ran in-order (search_listings + get_comparables
            // fired before generate_plan), listingGroups was already
            // non-empty PRE-dispatch, so this no-ops and the existing
            // self-fetch path drives the in-chat tax-match render
            // (byte-identical to today). Only the failing-path
            // session (empty listingGroups pre-POST) populates this
            // slot, which BuyerTaxMatchInChat consumes via initialBtm.
            const _bfm = planEmailData?.backfilledTaxMatch
            if (_preHydrateEmpty && _bfm && _bfm.isEmpty === false) {
              setState(s => {
                if (s.backfilledTaxMatch) return s
                return { ...s, backfilledTaxMatch: _bfm }
              })
            }
          })
          .catch(err => console.error('[useCharlie] plan email error:', err))
    }
    if (tool === 'search_buildings' && data.buildings) {
      const mapped = (data.buildings || []).map((b: any) => ({
        buildingName: b.building_name,
        slug: b.slug,
        photo: b.cover_photo_url || null,
        medianPsf: b.avg_psf || 0,
        activeCount: b.active_count || 0,
        avgDom: b.closed_avg_dom_90 || null,
        saleToList: b.sale_to_list_ratio || null,
        medianPrice: b.median_sale_price || null,
        medianMaintFee: b.median_maint_fee || null,
        yearBuilt: b.year_built || null,
        url: b.url || null,
      }))
        setState(s => ({ ...s, searchedBuildings: [...s.searchedBuildings, { label: s.geoContext?.geoName || 'Buildings', buildings: mapped }], blocks: [...s.blocks, { type: 'buildings', label: s.geoContext?.geoName || 'Buildings', buildings: mapped }], activePanel: 'results' }))
    }
    if (tool === 'get_building_directory' && data.buildings) {
      const mapped = (data.buildings || []).map((b: any) => ({
        buildingName: b.building_name,
        slug: b.slug,
        photo: b.cover_photo_url || null,
        medianPsf: 0,
        activeCount: 0,
        url: b.url || null,
      }))
        setState(s => ({ ...s, searchedBuildings: [...s.searchedBuildings, { label: s.geoContext?.geoName || 'Buildings', buildings: mapped }], blocks: [...s.blocks, { type: 'buildings', label: s.geoContext?.geoName || 'Buildings', buildings: mapped }], activePanel: 'results' }))
    }
    if (tool === 'compare_geo' && data.comparisons) {
        setState(s => ({ ...s, rankings: [...s.rankings, { type: 'compare_geo', data }], blocks: [...s.blocks, { type: 'rankings', rankType: 'compare_geo', data }], activePanel: 'results' }))
    }
    if (tool === 'get_price_trends' && data.price_trend_monthly) {
        setState(s => ({ ...s, priceTrends: [...s.priceTrends, data], blocks: [...s.blocks, { type: 'priceTrends', data }], activePanel: 'results' }))
    }
    if (tool === 'get_investment_rankings' && data.rankings) {
        setState(s => ({ ...s, rankings: [...s.rankings, { type: 'investment', data }], blocks: [...s.blocks, { type: 'rankings', rankType: 'investment', data }], activePanel: 'results' }))
    }
    if (tool === 'get_inventory_rankings' && data.rankings) {
        setState(s => ({ ...s, rankings: [...s.rankings, { type: 'inventory', data }], blocks: [...s.blocks, { type: 'rankings', rankType: 'inventory', data }], activePanel: 'results' }))
    }
    if (tool === 'get_seasonal_trends' && data.insight_seasonal) {
        setState(s => ({ ...s, rankings: [...s.rankings, { type: 'seasonal', data }], blocks: [...s.blocks, { type: 'rankings', rankType: 'seasonal', data }], activePanel: 'results' }))
    }
    if (tool === 'get_comparables' && Array.isArray(data.listings) && data.listings.length > 0) {
      // W-CHARLIE-BUYER-CHUNK4 (2026-06-15): MERGE results into a single
      // comparables block + cap at BUYER_COMP_SOLD_CAP (6) so in-chat
      // count matches email + lead exactly. Pre-fix Chunk-4 multiple
      // get_comparables calls each pushed a new block, so the in-chat
      // total could be 12+ while email + lead were capped at 6 by the
      // POST/persistence slice — inconsistency the operator flagged.
      // Now: state.comparables is the dedup'd union (by listing id;
      // falls through to listing_key when id is absent), capped at 6.
      // The single 'comparables' block in state.blocks ALWAYS reflects
      // that capped union — so if a second get_comparables call adds
      // 2 new dedup'd comps, the block grows from 6 to 6 (capped) and
      // re-renders the same shape email + lead will see.
      const BUYER_COMP_CAP = 6
      setState(s => {
        const merged = [...s.comparables, ...data.listings].filter((l, i, arr) =>
          arr.findIndex(x => (x.id ?? x.listing_key) === (l.id ?? l.listing_key)) === i
        ).slice(0, BUYER_COMP_CAP)
        // Replace any existing comparables block with the freshly-merged
        // one (single section render — no more multi-block stacking).
        const withoutOldComp = s.blocks.filter(b => b.type !== 'comparables')
        return {
          ...s,
          comparables: merged,
          blocks: [...withoutOldComp, { type: 'comparables', listings: merged, intent: '' }],
          activePanel: 'results',
        }
      })
    }
  }

  const resumeAfterGate = useCallback(() => {
    // W-RECOVERY A1.7 — clear gate first, regardless of whether there's a queued message
    // W-CHARLIE-REGISTRATION-FLOW-FIX (2026-06-14): if the gate fired from
    // requestForm (pendingForm set), promote it to initialForm so
    // CharlieOverlay opens the form the user wanted. Do NOT replay the
    // chat-message in that case — the form is the resume path; the form's
    // own submit will fire the post-form chat message later with a fresh
    // userId. When pendingForm is null (legacy chat-gate path), keep the
    // existing replay behavior (lastUserMessageRef.current).
    let pending: 'buyer' | 'seller' | null = null
    setState(s => {
      pending = s.pendingForm
      return {
        ...s,
        gateActive: false,
        gateReason: null,
        gatePlanType: null,
        pendingForm: null,
        initialForm: pending ?? s.initialForm,
      }
    })
    if (pending) {
      // Form path: no chat-message replay needed. The form itself will
      // mount and produce a fresh message after the user submits it.
      return
    }
    const lastMsg = lastUserMessageRef.current
    if (lastMsg) {
      setTimeout(() => sendMessageRef.current?.(lastMsg), 300)
    }
  }, [])

  return {
    state: {
      ...state,
      sessionId: credits.state.sessionId,
      userId: credits.state.userId,
      isRegistered: credits.state.isRegistered,
      assistantName: credits.state.assistantName,
      messageCount: credits.state.messageCount,
      chatFreeMessages: credits.state.chatFreeMessages,
      chatHardCap: credits.state.chatHardCap,
      buyerPlansUsed: credits.state.buyerPlansUsed,
      sellerPlansUsed: credits.state.sellerPlansUsed,
      totalAllowed: credits.state.totalAllowed,
      planMode: credits.state.planMode,
      sellerPlanFreeAttempts: credits.state.sellerPlanFreeAttempts,
      estimatorCount: credits.state.estimatorCount,
      estimatorFreeAttempts: credits.state.estimatorFreeAttempts,
      estimatorHardCap: credits.state.estimatorHardCap,
    },
    open,
    close,
    sendMessage,
    setActivePanel,
    setSellerEstimate,
    setGeoContext,
    dismissGate,
    setPageContext,
    requestVipAccess,
    setLeadCaptured,
    resumeAfterGate,
    // W-CHARLIE-REGISTRATION-FLOW-FIX (2026-06-14)
    requestForm,
  }
}
