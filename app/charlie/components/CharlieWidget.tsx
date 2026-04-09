// app/charlie/components/CharlieWidget.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { useCharlie } from '../hooks/useCharlie'
import CharlieOverlay from './CharlieOverlay'
import { createClient } from '@/lib/supabase/client'
import RegisterModal from '@/components/auth/RegisterModal'

interface CharlieWidgetProps {
  // Optional page context for agent resolution + session
  pageContext?: {
    listing_id?: string
    building_id?: string
    community_id?: string
    municipality_id?: string
    area_id?: string
  }
}

export default function CharlieWidget({ pageContext }: CharlieWidgetProps = {}) {
  const {
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
  } = useCharlie()

  const [searchInput, setSearchInput] = useState('')
  const [isHomepage, setIsHomepage] = useState(false)
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const sessionInitialized = useRef(false)

  useEffect(() => {
    setIsHomepage(window.location.pathname === '/')
  }, [])

  // Init WALLiam session on mount — read auth + resolve agent
  useEffect(() => {
    if (sessionInitialized.current) return
    sessionInitialized.current = true

    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const userId = data?.user?.id || null
      initSession(userId, pageContext)
    }).catch(() => {
      initSession(null, pageContext)
    })
  }, [initSession, pageContext])

  // Listen for homepage chip/search/form events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message?: string; form?: 'buyer' | 'seller' } | undefined
      open(detail?.message, detail?.form)
    }
    window.addEventListener('charlie:open', handler)
    return () => window.removeEventListener('charlie:open', handler)
  }, [open])
  // Listen for page context events — update context ref only, never reset session
  useEffect(() => {
    const ctxHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      setPageContext(detail)
    }
    window.addEventListener('charlie:pagecontext', ctxHandler)
    return () => window.removeEventListener('charlie:pagecontext', ctxHandler)
  }, [setPageContext])

  // Handle gate events — show register modal or VIP prompt
  useEffect(() => {
    if (!state.gateActive) return
    if (state.gateReason === 'register') {
      setShowRegisterModal(true)
    }
  }, [state.gateActive, state.gateReason])

  const handleSearch = () => {
    if (!searchInput.trim()) { open(); return }
    const msg = searchInput.trim()
    setSearchInput('')
    open(msg)
  }

  return (
    <>
      {/* Floating bar — hidden on homepage */}
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
            fontWeight: 600, cursor: 'pointer', flexShrink: 0,
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
          onLeadCaptured={setLeadCaptured}
          onRequestVip={requestVipAccess}
          onDismissGate={dismissGate}
          onOpenRegister={() => setShowRegisterModal(true)}
        />
      )}

      {/* Gate: Registration wall */}
      {showRegisterModal && (
        <RegisterModal
          isOpen={showRegisterModal}
          onClose={() => {
            setShowRegisterModal(false)
            // Do NOT dismiss gate — user must register to proceed
          }}
          onSuccess={() => {
            setShowRegisterModal(false)
            const supabase = createClient()
            supabase.auth.getUser().then(({ data }) => {
              if (data?.user?.id) {
                initSession(data.user.id, pageContext).then(() => {
                  resumeAfterGate()
                })
              }
            })
          }}
          registrationSource="walliam_charlie_gate"
        />
      )}

      {/* Gate: VIP required overlay */}
      {state.gateActive && state.gateReason === 'vip_required' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 20, padding: 36,
            maxWidth: 420, width: '100%',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✦</div>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>
              Plan Credits Used
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
              You've used your {state.gatePlanType === 'seller' ? 'seller' : 'buyer'} plan credits.
              Request additional access from your agent — they'll review and approve shortly.
            </p>
            <button
              onClick={() => requestVipAccess(state.gatePlanType || 'buyer')}
              style={{
                width: '100%', padding: '14px',
                background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
                border: 'none', borderRadius: 12,
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', marginBottom: 10,
              }}
            >
              Request More Plan Access
            </button>
            <button
              onClick={dismissGate}
              style={{
                width: '100%', padding: '12px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                color: 'rgba(255,255,255,0.4)', fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Gate: Chat limit overlay */}
      {state.gateActive && state.gateReason === 'chat_limit' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 20, padding: 36,
            maxWidth: 420, width: '100%',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>💬</div>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>
              Chat Credits Used
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
              You've used your AI chat credits.
              Request additional access from your agent — they'll review and approve shortly.
            </p>
            <button
              onClick={() => requestVipAccess('buyer')}
              style={{
                width: '100%', padding: '14px',
                background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
                border: 'none', borderRadius: 12,
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', marginBottom: 10,
              }}
            >
              Request More Chat Access
            </button>
            <button
              onClick={dismissGate}
              style={{
                width: '100%', padding: '12px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                color: 'rgba(255,255,255,0.4)', fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* VIP pending notification */}
      {state.vipRequestStatus === 'pending' && !state.gateActive && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, padding: '12px 20px',
          color: 'rgba(255,255,255,0.7)', fontSize: 13,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          ⏳ Plan access request sent — your agent will review shortly
        </div>
      )}
    </>
  )
}