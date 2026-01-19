// components/chat/ChatWidget.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2, User, Bot, Star } from 'lucide-react'
import VipPrompt from './VipPrompt'
import { renderMessageContent } from '@/lib/utils/link-parser'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatContext {
  pageType: 'home' | 'building' | 'property'
  buildingName?: string
  buildingAddress?: string
  buildingId?: string
  communityId?: string
  listingId?: string
  unitNumber?: string
  listPrice?: number
  bedrooms?: number
  bathrooms?: number
  agentId: string
  agentName: string
  welcomeMessage?: string
  vipThreshold: number
}

interface ChatWidgetProps {
  context: ChatContext
  user: {
    id: string
    email: string
    name?: string
  }
}

export default function ChatWidget({ context, user }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'active' | 'vip'>('active')
  const [messageCount, setMessageCount] = useState(0)
  const [showVipPrompt, setShowVipPrompt] = useState(false)
  const [vipLoading, setVipLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Initialize session when chat opens
  useEffect(() => {
    if (isOpen && !sessionId) {
      initializeSession()
    }
  }, [isOpen])

  async function initializeSession() {
    try {
      const response = await fetch('/api/chat/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: context.agentId, userId: user.id })
      })
      
      const data = await response.json()
      
      if (data.sessionId) {
        setSessionId(data.sessionId)
        setSessionStatus(data.status || 'active')
        setMessageCount(data.messageCount || 0)
        
        // Load existing messages if any
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages)
        } else {
          // Show welcome message
          const greeting = context.welcomeMessage || getDefaultGreeting()
          setMessages([{ role: 'assistant', content: greeting }])
        }
      }
    } catch (error) {
      console.error('Error initializing session:', error)
      // Fallback to greeting without session
      const greeting = context.welcomeMessage || getDefaultGreeting()
      setMessages([{ role: 'assistant', content: greeting }])
    }
  }

  function getDefaultGreeting(): string {
    if (context.pageType === 'home') {
      return `Hi${user.name ? ` ${user.name}` : ''}! 👋 I'm here to help you find your perfect condo. Are you looking to buy or rent?`
    } else if (context.pageType === 'building') {
      return `Hi${user.name ? ` ${user.name}` : ''}! 👋 I can help you learn more about ${context.buildingName || 'this building'}. What would you like to know?`
    } else if (context.pageType === 'property') {
      return `Hi${user.name ? ` ${user.name}` : ''}! 👋 Interested in ${context.unitNumber ? `Unit ${context.unitNumber}` : 'this unit'}${context.buildingName ? ` at ${context.buildingName}` : ''}? I can answer your questions or help schedule a viewing!`
    }
    return `Hi! 👋 How can I help you today?`
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }],
          context,
          sessionId,
          userId: user.id
        })
      })

      const data = await response.json()

      if (data.error) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "I'm sorry, I'm having trouble connecting. Please try again or contact us directly."
        }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
        
        // Update message count and check for VIP prompt
        const newCount = (data.messageCount || messageCount + 1)
        setMessageCount(newCount)
        
        if (data.showVipPrompt && sessionStatus !== 'vip') {
          setShowVipPrompt(true)
        }
        
        if (data.sessionStatus) {
          setSessionStatus(data.sessionStatus)
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'm sorry, something went wrong. Please try again."
      }])
    } finally {
      setIsLoading(false)
    }
  }

  async function handleVipAccept(phone?: string) {
    setVipLoading(true)
    try {
      const response = await fetch('/api/chat/vip-upgrade', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, phone })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setSessionStatus('vip')
        setShowVipPrompt(false)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `🌟 Welcome to VIP! You now have unlimited access. ${phone ? `${context.agentName} will reach out to you shortly.` : ''} How can I help you further?`
        }])
      }
    } catch (error) {
      console.error('VIP upgrade error:', error)
    } finally {
      setVipLoading(false)
    }
  }

  function handleVipDecline() {
    setShowVipPrompt(false)
    // Mark as prompted in API
    fetch('/api/chat/vip-prompted', {
      method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    }).catch(console.error)
  }

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
          isOpen
            ? 'bg-gray-600 hover:bg-gray-700'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <>
            <MessageCircle className="w-6 h-6 text-white" />
            {sessionStatus === 'vip' && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                <Star className="w-3 h-3 text-white" />
              </div>
            )}
          </>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-48px)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* VIP Prompt Overlay */}
          {showVipPrompt && (
            <VipPrompt
              agentName={context.agentName}
              onAccept={handleVipAccept}
              onDecline={handleVipDecline}
              isLoading={vipLoading}
            />
          )}

          {/* Header */}
          <div className={`px-4 py-3 flex items-center gap-3 ${
            sessionStatus === 'vip' 
              ? 'bg-gradient-to-r from-amber-500 to-amber-600' 
              : 'bg-gradient-to-r from-blue-600 to-blue-700'
          }`}>
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              {sessionStatus === 'vip' ? (
                <Star className="w-6 h-6 text-white" />
              ) : (
                <Bot className="w-6 h-6 text-white" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white">
                {sessionStatus === 'vip' ? 'VIP Assistant' : 'Condo Assistant'}
              </h3>
              <p className="text-xs text-white/80">
                {sessionStatus === 'vip' ? '⭐ VIP Access' : 'Powered by AI'} • {context.agentName}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[400px] min-h-[300px] bg-gray-50">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 ${
                  message.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === 'user'
                    ? 'bg-blue-600'
                    : sessionStatus === 'vip' ? 'bg-amber-500' : 'bg-gray-200'
                }`}>
                  {message.role === 'user' ? (
                    <User className="w-4 h-4 text-white" />
                  ) : sessionStatus === 'vip' ? (
                    <Star className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-gray-600" />
                  )}
                </div>
                <div
                  className={`max-w-[75%] px-4 py-2 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-md'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{renderMessageContent(message.content)}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  sessionStatus === 'vip' ? 'bg-amber-500' : 'bg-gray-200'
                }`}>
                  {sessionStatus === 'vip' ? (
                    <Star className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-gray-600" />
                  )}
                </div>
                <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-md shadow-sm border border-gray-100">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="p-3 bg-white border-t border-gray-100">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className={`w-10 h-10 rounded-full text-white flex items-center justify-center disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors ${
                  sessionStatus === 'vip' 
                    ? 'bg-amber-500 hover:bg-amber-600' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}