// app/charlie/components/ChatPanel.tsx
'use client'
import React from 'react'
import { useState, useRef, useEffect } from 'react'
import { ChatMessage } from '../hooks/useCharlie'

interface Props {
  messages: ChatMessage[]
  isStreaming: boolean
  assistantName: string
  onSend: (msg: string) => void
  onBuyClick?: () => void
  onSellClick?: () => void
  gateReason?: 'register' | 'vip_required' | null
  onOpenRegister?: () => void
}

function renderContent(text: string): React.ReactNode[] {
  const cleaned = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/#{1,3}\s/g, '')
    .replace(/\*([^*]+)\*/g, '$1')
  
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  
  while ((m = linkRegex.exec(cleaned)) !== null) {
    if (m.index > last) parts.push(cleaned.slice(last, m.index))
    parts.push(
      React.createElement('a', {
        key: i++,
        href: m[2],
        target: '_blank',
        rel: 'noopener noreferrer',
        style: { color: '#60a5fa', textDecoration: 'underline', textUnderlineOffset: '2px', fontWeight: 600 }
      }, m[1])
    )
    last = m.index + m[0].length
  }
  if (last < cleaned.length) parts.push(cleaned.slice(last))
  return parts.length ? parts : [cleaned]
}

const QUICK_REPLIES = ['I want to buy', 'I want to sell', 'Just browsing']

export default function ChatPanel({ messages, isStreaming, assistantName, onSend, onBuyClick, onSellClick, gateReason, onOpenRegister }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isGated = gateReason === 'register'
  const handleSend = () => {
    if (!input.trim() || isStreaming || isGated) return
    onSend(input.trim())
    setInput('')
  }

  const showQuickReplies = messages.length <= 2 && !isStreaming

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 20px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: 'rgba(255,255,255,0.25)',
            fontSize: 14,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
            <div style={{ fontWeight: 600, marginBottom: 8, color: 'rgba(255,255,255,0.4)' }}>
              {assistantName} is ready
            </div>
            <div style={{ fontSize: 13 }}>Your AI real estate guide</div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            {msg.role === 'assistant' && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, marginRight: 8, flexShrink: 0, alignSelf: 'flex-end',
              }}>✦</div>
            )}
            <div style={{
              maxWidth: '78%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: msg.role === 'user'
                ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)'
                : 'rgba(255,255,255,0.07)',
              border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.08)' : 'none',
              color: '#fff',
              fontSize: 14,
              lineHeight: 1.6,
              wordBreak: 'break-word',
            }}>
              {renderContent(msg.content)}
              {msg.streaming && (
                <span style={{
                  display: 'inline-block',
                  width: 6, height: 14,
                  background: '#3b82f6',
                  marginLeft: 3,
                  borderRadius: 2,
                  animation: 'charlie-blink 0.8s infinite',
                }} />
              )}
            </div>
          </div>
        ))}

        {/* Quick replies */}
        {showQuickReplies && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {QUICK_REPLIES.map(r => (
              <button key={r} onClick={() => {
                if (r === 'I want to buy') { onBuyClick?.(); return }
                if (r === 'I want to sell') { onSellClick?.(); return }
                onSend(r)
              }} style={{
                padding: '7px 14px',
                borderRadius: 100,
                border: '1px solid rgba(59,130,246,0.4)',
                background: 'rgba(59,130,246,0.1)',
                color: '#60a5fa',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}>{r}</button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Funnel entry buttons */}
      {messages.length === 0 && (
        <div style={{ padding: '0 20px 16px', display: 'flex', gap: 10 }}>
          <button onClick={onBuyClick} style={{
            flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)', color: '#fff',
            fontSize: 13, fontWeight: 700,
          }}>🏠 I Want to Buy</button>
          <button onClick={onSellClick} style={{
            flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff',
            fontSize: 13, fontWeight: 700,
          }}>💰 I Want to Sell</button>
        </div>
      )}
      {/* Input */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        gap: 10,
        background: '#0f172a',
        flexShrink: 0,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={`Message ${assistantName}...`}
          disabled={isStreaming}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            padding: '10px 14px',
            color: '#fff',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          style={{
            width: 42, height: 42,
            borderRadius: 12,
            background: input.trim() && !isStreaming ? '#3b82f6' : 'rgba(255,255,255,0.1)',
            border: 'none',
            cursor: input.trim() && !isStreaming ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
          </svg>
        </button>
      </div>

      {/* Gate overlay — blocks input when registration required */}
      {isGated && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, #080f1a 60%, transparent)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-end',
          padding: '24px 20px', gap: 12,
          zIndex: 10,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✦</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
              Create Your Free Account
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Register to unlock your VIP Access Credit and receive your personalized real estate plan
            </div>
            <button
              onClick={onOpenRegister}
              style={{
                width: '100%', padding: '13px',
                background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
                border: 'none', borderRadius: 12,
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.02em',
              }}
            >
              Register Free — Get My Plan ✦
            </button>
          </div>
        </div>
      )}
      <style>{`
        @keyframes charlie-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}