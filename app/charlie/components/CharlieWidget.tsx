// app/charlie/components/CharlieWidget.tsx
'use client'
import { useState, useEffect } from 'react'
import { useCharlie } from '../hooks/useCharlie'
import CharlieOverlay from './CharlieOverlay'

export default function CharlieWidget() {
  const { state, open, close, sendMessage, setActivePanel, setSellerEstimate, setGeoContext } = useCharlie()
  const [searchInput, setSearchInput] = useState('')

  const [isHomepage, setIsHomepage] = useState(false)

  useEffect(() => {
    setIsHomepage(window.location.pathname === '/')
  }, [])

  // Listen for homepage chip/search/form events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message?: string; form?: 'buyer' | 'seller' } | undefined
      open(detail?.message, detail?.form)
    }
    window.addEventListener('charlie:open', handler)
    return () => window.removeEventListener('charlie:open', handler)
  }, [open])

  const handleSearch = () => {
    if (!searchInput.trim()) { open(); return }
    const msg = searchInput.trim()
    setSearchInput('')
    open(msg)
  }

  return (
    <>
      {/* Floating bar — hidden on homepage, WALLiam CTAs handle it there */}
      {!state.isOpen && !isHomepage && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 100,
          padding: '8px 8px 8px 20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(59,130,246,0.15)',
          backdropFilter: 'blur(12px)',
          width: 'min(560px, calc(100vw - 32px))',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, fontSize: 14,
            boxShadow: '0 0 12px rgba(59,130,246,0.4)',
          }}>✦</div>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Ask Charlie — buy, sell, or explore..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#fff', fontSize: 14,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          />
          <button onClick={handleSearch} style={{
            background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
            border: 'none', borderRadius: 100,
            padding: '8px 18px', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            flexShrink: 0, letterSpacing: '0.02em',
          }}>Ask</button>
          <button onClick={() => open()} style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 100, padding: '8px 14px',
            color: 'rgba(255,255,255,0.6)', fontSize: 12,
            fontWeight: 600, cursor: 'pointer',           flexShrink: 0,
          }}>Browse</button>
        </div>
      )}

      {state.isOpen && (
        <CharlieOverlay
          state={state}
          onClose={close}
          onSend={sendMessage}
          onPanelChange={setActivePanel}
          onSendPlan={() => sendMessage('Yes, send me this plan')}
          onSellerEstimate={setSellerEstimate}
          onSetGeoContext={setGeoContext}
        />
      )}
    </>
  )
}