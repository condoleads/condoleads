'use client'

import { useState } from 'react'

// WalliamCTA — drop into any page to show Buyer/Seller Plan CTAs + AI search
// Fully decoupled: dispatches charlie:open event only, no direct imports

interface Props {
  context?: string // optional geo/building name for display
}

export default function WalliamCTA({ context }: Props) {
  const [query, setQuery] = useState('')

  const openCharlie = (form?: 'buyer' | 'seller', message?: string) => {
    window.dispatchEvent(new CustomEvent('charlie:open', { detail: { form, message } }))
  }

  const handleSearch = () => {
    if (query.trim()) openCharlie(undefined, query.trim())
    else openCharlie()
    setQuery('')
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #060b18 0%, #0d1629 100%)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20,
      padding: '24px 20px',
      margin: '24px 0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
    }}>
      {/* WALLiam wordmark */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', fontFamily: 'system-ui,sans-serif' }}>WALL</span>
        <span style={{ position: 'relative', display: 'inline-block' }}>
          <span style={{
            position: 'absolute', top: '-35%', left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 7, color: '#f59e0b',
            animation: 'walliam-cta-heartbeat 3s ease-in-out infinite',
            display: 'block', lineHeight: 1,
          }}>♥</span>
          <span style={{ fontSize: 15, fontWeight: 300, color: 'rgba(255,255,255,0.8)', fontFamily: 'system-ui,sans-serif' }}>ı</span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 300, color: 'rgba(255,255,255,0.8)', fontFamily: 'system-ui,sans-serif' }}>am</span>
      </div>

      {/* Tagline */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
          Get Your AI Real Estate Plan
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', maxWidth: 300 }}>
          {context
            ? `Ask WALLiam about ${context}`
            : 'Ask WALLiam anything about GTA real estate'}
        </div>
      </div>

      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 100, padding: '7px 7px 7px 16px',
        width: '100%',
      }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Ask WALLiam..."
          style={{
            flex: 1, minWidth: 0, background: 'transparent', border: 'none',
            outline: 'none', color: '#fff', fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleSearch}
          style={{
            padding: '6px 16px', borderRadius: 100, border: 'none',
            background: 'linear-gradient(135deg,#1d4ed8,#4f46e5)',
            color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >Ask AI</button>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => openCharlie('buyer')}
          style={{
            padding: '10px 20px', borderRadius: 100, border: 'none',
            background: 'linear-gradient(135deg,#1d4ed8,#4f46e5)',
            color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
          }}
        >🏠 Buyer Plan</button>

        <button
          onClick={() => openCharlie('seller')}
          style={{
            padding: '10px 20px', borderRadius: 100, border: 'none',
            background: 'linear-gradient(135deg,#059669,#10b981)',
            color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
          }}
        >💰 Seller Plan</button>
      </div>

      <style>{`
        @keyframes walliam-cta-heartbeat {
          0%,45%,100% { transform: translateX(-50%) scale(1); }
          10% { transform: translateX(-50%) scale(1.4); }
          30% { transform: translateX(-50%) scale(1.25); }
        }
      `}</style>
    </div>
  )
}