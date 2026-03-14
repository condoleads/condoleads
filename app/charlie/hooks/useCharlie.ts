// app/charlie/hooks/useCharlie.ts
'use client'
import { useState, useCallback, useRef } from 'react'

export type MessageRole = 'user' | 'assistant'
export type ToolName = 'resolve_geo' | 'get_market_analytics' | 'search_listings' | 'get_comparables'

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
  activePanel: 'chat' | 'results'
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
  activePanel: 'chat',
}

export function useCharlie() {
  const [state, setState] = useState<CharlieState>(INITIAL_STATE)
  const sessionId = useRef(Math.random().toString(36).slice(2))
  const geoContextRef = useRef<any>(null)
  const messagesRef = useRef<any[]>([])

  const open = useCallback(() => {
    setState(s => ({ ...s, isOpen: true }))
    // Send greeting on first open
    if (messagesRef.current.length === 0) {
      sendGreeting()
    }
  }, [])

  const close = useCallback(() => {
    setState(s => ({ ...s, isOpen: false }))
  }, [])

  const setActivePanel = useCallback((panel: 'chat' | 'results') => {
    setState(s => ({ ...s, activePanel: panel }))
  }, [])

  const sendGreeting = async () => {
    const greetingMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: '__greeting__',
    }
    await sendMessage('Hi Charlie', true)
  }

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

    // Add streaming assistant message placeholder
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
          sessionId: sessionId.current,
          geoContext: geoContextRef.current,
        }),
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      let addedAssistant = true // placeholder already added

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
    if (tool === 'get_comparables' && data.listings) {
      setState(s => ({ ...s, comparables: [...s.comparables, ...data.listings].filter((l,i,arr) => arr.findIndex(x => x.id === l.id) === i), activePanel: 'results' }))
    }
  }

  return { state, open, close, sendMessage, setActivePanel }
}