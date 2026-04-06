// app/charlie/hooks/useCharlie.ts
'use client'
import { useState, useCallback, useRef } from 'react'

export type MessageRole = 'user' | 'assistant'
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
  analytics: any | null
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
  searchedBuildings: any[]
  rankings: any | null
  priceTrends: any | null
  seasonalData: any | null
  // WALLiam session
  sessionId: string | null
  userId: string | null
  buyerPlansUsed: number
  sellerPlansUsed: number
  totalAllowed: number
  isRegistered: boolean
  // Gate state
  gateActive: boolean
  gateReason: 'register' | 'vip_required' | null
  gatePlanType: 'buyer' | 'seller' | null
  vipRequestId: string | null
  vipRequestStatus: 'idle' | 'pending' | 'approved' | 'denied'
  vipCreditUsed: boolean
  vipCreditPlansUsed: number
  vipCreditTotal: number
}

const INITIAL_STATE: CharlieState = {
  messages: [],
  toolResults: [],
  analytics: null,
  searchedBuildings: [],
  rankings: null,
  priceTrends: null,
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
  isRegistered: false,
  gateActive: false,
  gateReason: null,
  gatePlanType: null,
  vipRequestId: null,
  vipRequestStatus: 'idle',
  vipCreditUsed: false,
  vipCreditPlansUsed: 0,
  vipCreditTotal: 1,
}

export function useCharlie() {
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
  // WALLiam session ref
  const walliamSessionIdRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  const pageContextRef = useRef<any>(null)

  const initSession = useCallback(async (
    userId: string | null,
    pageContext?: {
      listing_id?: string
      building_id?: string
      community_id?: string
      municipality_id?: string
      area_id?: string
    }
  ) => {
    try {
      const res = await fetch('/api/walliam/charlie/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9' },
        body: JSON.stringify({
          userId,
          listing_id: pageContext?.listing_id || null,
          building_id: pageContext?.building_id || null,
          community_id: pageContext?.community_id || null,
          municipality_id: pageContext?.municipality_id || null,
          area_id: pageContext?.area_id || null,
        }),
      })
      const data = await res.json()
      if (data.sessionId) {
        walliamSessionIdRef.current = data.sessionId
        pageContextRef.current = pageContext || null
        userIdRef.current = userId
        setState(s => ({
          ...s,
          sessionId: data.sessionId,
          userId,
          buyerPlansUsed: data.buyerPlansUsed || 0,
          sellerPlansUsed: data.sellerPlansUsed || 0,
          totalAllowed: data.totalAllowed || 1,
          isRegistered: !!userId,
        }))
      }
    } catch (err) {
      console.error('[useCharlie] initSession error:', err)
    }
  }, [])

  const setPageContext = useCallback((context: any) => {
    pageContextRef.current = context
  }, [])

  const dismissGate = useCallback(() => {
    setState(s => ({ ...s, gateActive: false, gateReason: null, gatePlanType: null }))
  }, [])

  const requestVipAccess = useCallback(async (planType: 'buyer' | 'seller') => {
    const sid = walliamSessionIdRef.current
    if (!sid) return
    try {
      const res = await fetch('/api/walliam/charlie/vip-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, planType }),
      })
      const data = await res.json()
      if (data.success) {
        setState(s => ({
          ...s,
          vipRequestId: data.requestId,
          vipRequestStatus: data.status,
          gateActive: false,
        }))
      }
    } catch (err) {
      console.error('[useCharlie] requestVipAccess error:', err)
    }
  }, [])

  const setLeadCaptured = useCallback(() => {
    setState(s => ({ ...s, leadCaptured: true }))
  }, [])

  const open = useCallback((initialMessage?: string, initialForm?: 'buyer' | 'seller') => {
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
      analytics: data.marketAnalytics || s.analytics,
      geoContext: data.analyticsGeoType ? { geoType: data.analyticsGeoType, geoId: data.analyticsGeoId, geoName: data.buildingName || '' } : s.geoContext
    }))
  }, [])

  const sendMessage = useCallback(async (userText: string, isGreeting = false) => {
    if (!userText.trim() && !isGreeting) return

    const userMessage = { role: 'user', content: userText }
    if (!isGreeting) lastUserMessageRef.current = userText

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
      const res = await fetch('/api/charlie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9' },
        body: JSON.stringify({
          messages: messagesRef.current,
          sessionId: walliamSessionIdRef.current,
          userId: userIdRef.current,
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

            if (event.type === 'vip_credit_used' && userIdRef.current) {
              setState(s => ({
                ...s,
                vipCreditUsed: true,
                vipCreditPlansUsed: event.plansUsed,
                vipCreditTotal: event.totalAllowed,
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
                isStreaming: false,
                messages: s.messages.map(m =>
                  m.id === assistantId ? { ...m, streaming: false } : m
                )
              }))
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
      setState(s => ({ ...s, analytics: { ...data.analytics, geoType: data.geoType, geoId: data.geoId, track: data.track }, activePanel: 'results' }))
        analyticsRef.current = data.analytics
    }
    if (tool === 'search_listings' && data.listings) {
      setState(s => ({ ...s, listingGroups: [...s.listingGroups, { label: data.label || 'Matched Listings', listings: data.listings }], activePanel: 'results' }))
    }
    if (tool === 'generate_plan' && data.planReady) {
      setState(s => ({ ...s, planReady: true, plan: data, activePanel: 'results' }))
        fetch('/api/charlie/plan-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: stateRef.current.sessionId,
            userId: stateRef.current.userId,
            planType: data.type,
            plan: data,
            analytics: analyticsRef.current,
            listings: stateRef.current.listingGroups.flatMap(g => g.listings).slice(0, 10),
            geoContext: stateRef.current.geoContext,
            vipCreditUsed: stateRef.current.vipCreditUsed,
            vipCreditPlansUsed: stateRef.current.vipCreditPlansUsed,
            vipCreditTotal: stateRef.current.vipCreditTotal,
            comparables: stateRef.current.comparables.slice(0, 6),
            sellerEstimate: stateRef.current.sellerEstimate,
          }),
        }).catch(err => console.error('[useCharlie] plan email error:', err))
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
      setState(s => ({ ...s, searchedBuildings: mapped, activePanel: 'results' }))
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
      setState(s => ({ ...s, searchedBuildings: mapped, activePanel: 'results' }))
    }
    if (tool === 'compare_geo' && data.comparisons) {
      setState(s => ({ ...s, rankings: { type: 'compare_geo', data }, activePanel: 'results' }))
    }
    if (tool === 'get_price_trends' && data.price_trend_monthly) {
      setState(s => ({ ...s, priceTrends: data, activePanel: 'results' }))
    }
    if (tool === 'get_investment_rankings' && data.rankings) {
      setState(s => ({ ...s, rankings: { type: 'investment', data }, activePanel: 'results' }))
    }
    if (tool === 'get_inventory_rankings' && data.rankings) {
      setState(s => ({ ...s, rankings: { type: 'inventory', data }, activePanel: 'results' }))
    }
    if (tool === 'get_seasonal_trends' && data.insight_seasonal) {
      setState(s => ({ ...s, rankings: { type: 'seasonal', data }, activePanel: 'results' }))
    }
    if (tool === 'get_comparables' && data.listings) {
      setState(s => ({ ...s, comparables: [...s.comparables, ...data.listings].filter((l, i, arr) => arr.findIndex(x => x.id === l.id) === i), activePanel: 'results' }))
    }
  }

  const resumeAfterGate = useCallback(() => {
    const lastMsg = lastUserMessageRef.current
    if (!lastMsg) return
    setState(s => ({ ...s, gateActive: false, gateReason: null, gatePlanType: null }))
    setTimeout(() => sendMessageRef.current?.(lastMsg), 300)
  }, [])

  return {
    state,
    open,
    close,
    sendMessage,
    setActivePanel,
    setSellerEstimate,
    setGeoContext,
    initSession,
    dismissGate,
    setPageContext,
    requestVipAccess,
    setLeadCaptured,
    resumeAfterGate,
  }
}