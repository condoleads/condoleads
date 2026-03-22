// app/charlie/hooks/useCharlie.ts
'use client'
import { useState, useCallback, useRef } from 'react'

export type MessageRole = 'user' | 'assistant'
export type ToolName = 'resolve_geo' | 'get_market_analytics' | 'search_listings' | 'get_comparables' | 'generate_plan'

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
  const [state, setState] = useState<CharlieState>(INITIAL_STATE)
  const sessionId = useRef(Math.random().toString(36).slice(2))
  const geoContextRef = useRef<any>(null)
  const greetingSentRef = useRef(false)
  const messagesRef = useRef<any[]>([])
  const sendMessageRef = useRef<any>(null)
  // WALLiam session ref
  const walliamSessionIdRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(null)

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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesRef.current,
          sessionId: walliamSessionIdRef.current,
          userId: userIdRef.current,
          geoContext: geoContextRef.current,
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
    }
    if (tool === 'search_listings' && data.listings) {
      setState(s => ({ ...s, listingGroups: [...s.listingGroups, { label: data.label || 'Matched Listings', listings: data.listings }], activePanel: 'results' }))
    }
    if (tool === 'generate_plan' && data.planReady) {
      setState(s => ({ ...s, planReady: true, plan: data, activePanel: 'results' }))
    }
    if (tool === 'get_comparables' && data.listings) {
      setState(s => ({ ...s, comparables: [...s.comparables, ...data.listings].filter((l, i, arr) => arr.findIndex(x => x.id === l.id) === i), activePanel: 'results' }))
    }
  }

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
    requestVipAccess,
    setLeadCaptured,
  }
}