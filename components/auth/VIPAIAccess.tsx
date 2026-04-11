'use client'
// components/auth/VIPAIAccess.tsx
// The core VIP AI Access block â€” compact nav version + full page version
// Replaces AuthStatus + Get VIP Access button entirely

import { useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'
import RegisterModal from './RegisterModal'

const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

interface Credits {
  // Chat
  messageCount: number
  chatFreeMessages: number
  chatHardCap: number
  // Estimates
  estimatorCount: number
  estimatorFreeAttempts: number
  // Plans
  buyerPlansUsed: number
  sellerPlansUsed: number
  totalAllowed: number
  planMode: string
  // Session
  sessionId: string | null
  status: string
  vipRequestStatus: string
}

interface Props {
  variant?: 'nav' | 'full'
  registrationSource?: string
  primaryColor?: string
}

export default function VIPAIAccess({
  variant = 'nav',
  registrationSource = 'vip_block',
  primaryColor = '#1d4ed8',
}: Props) {
  const { user, signOut } = useAuth()
  const [credits, setCredits] = useState<Credits | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)
  const [tenantConfig, setTenantConfig] = useState({ chatFree: 5, estFree: 2, planFree: 1 })
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    fetch('/api/walliam/tenant-config', {
      headers: { 'x-tenant-id': TENANT_ID }
    })
      .then(r => r.json())
      .then(d => {
        if (d.chatFree != null) setTenantConfig({
          chatFree: d.chatFree,
          estFree: d.estFree,
          planFree: d.planFree,
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) { setCredits(null); return }
    fetch('/api/walliam/charlie/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID },
      body: JSON.stringify({ userId: user.id, read_only: true }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.sessionId) setCredits({
          messageCount: d.messageCount || 0,
          chatFreeMessages: d.chatFreeMessages || 5,
          chatHardCap: d.chatHardCap || 25,
          estimatorCount: d.estimatorCount || 0,
          estimatorFreeAttempts: d.estimatorFreeAttempts || 2,
          buyerPlansUsed: d.buyerPlansUsed || 0,
          sellerPlansUsed: d.sellerPlansUsed || 0,
          totalAllowed: d.totalAllowed || 1,
          planMode: d.planMode || 'shared',
          sessionId: d.sessionId,
          status: d.status || 'active',
          vipRequestStatus: d.vipRequestStatus || 'none',
        })
      })
      .catch(() => {})
  }, [user])

  const chatRemaining = credits ? Math.max(0, credits.chatFreeMessages - credits.messageCount) : null
  const estRemaining = credits ? Math.max(0, credits.estimatorFreeAttempts - credits.estimatorCount) : null
  const planRemaining = credits ? Math.max(0, credits.totalAllowed - credits.buyerPlansUsed - credits.sellerPlansUsed) : null

  const anyLow = credits && (chatRemaining === 1 || estRemaining === 1 || planRemaining === 1)
  const anyEmpty = credits && (chatRemaining === 0 || estRemaining === 0 || planRemaining === 0)

  const creditColor = (rem: number | null) => {
    if (rem === null) return 'rgba(255,255,255,0.5)'
    if (rem === 0) return '#ef4444'
    if (rem === 1) return '#f59e0b'
    return '#10b981'
  }

  const requestMore = async () => {
    if (!credits?.sessionId || requesting) return
    setRequesting(true)
    try {
      await fetch('/api/walliam/charlie/vip-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID },
        body: JSON.stringify({ sessionId: credits.sessionId, planType: 'buyer' }),
      })
      setRequested(true)
    } catch {}
    setRequesting(false)
  }

  // â”€â”€ UNREGISTERED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!user) {
    if (variant === 'nav') return (
      <>
        <button
          onClick={() => setShowRegister(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 100, padding: '8px 16px',
            cursor: 'pointer', position: 'relative',
            boxShadow: '0 0 20px rgba(124,58,237,0.4)',
            animation: 'vip-pulse 3s ease-in-out infinite',
          }}
        >
          <span style={{ fontSize: 14 }}>✦</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>VIP AI Access</span>
          <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.2)' }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[{ e: '💬', v: '5' }, { e: '📊', v: '2' }, { e: '📋', v: '1' }].map(c => (
              <span key={c.e} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 10 }}>{c.e}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#a5f3fc' }}>{c.v}</span>
              </span>
            ))}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#fde68a', background: 'rgba(253,230,138,0.15)', borderRadius: 100, padding: '2px 8px' }}>Register Free →</span>
        </button>
        <style>{`@keyframes vip-pulse{0%,100%{box-shadow:0 0 20px rgba(124,58,237,0.4)}50%{box-shadow:0 0 30px rgba(124,58,237,0.7)}}`}</style>
        <RegisterModal isOpen={showRegister} onClose={() => setShowRegister(false)} registrationSource={registrationSource} onSuccess={() => setShowRegister(false)} />
      </>
    )

    // Full variant â€” unregistered
    return (
      <>
        <div style={{
          background: 'linear-gradient(135deg, #0f172a, #1e1b4b)',
          border: '1px solid rgba(124,58,237,0.4)',
          borderRadius: 16, padding: '24px 28px',
          boxShadow: '0 0 40px rgba(124,58,237,0.2)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #1d4ed8, #7c3aed, #ec4899)' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>✦</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>VIP AI Access</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fde68a', background: 'rgba(253,230,138,0.15)', borderRadius: 100, padding: '3px 10px', border: '1px solid rgba(253,230,138,0.3)' }}>FREE TO JOIN</span>
              </div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', lineHeight: 1.5 }}>
                Register free and unlock AI-powered real estate tools. Browse is always unlimited.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {[
                  { e: '💬', label: 'AI Chats', v: tenantConfig.chatFree + ' free', color: '#3b82f6' },
                  { e: '📊', label: 'AI Estimates', v: tenantConfig.estFree + ' free', color: '#10b981' },
                  { e: '📋', label: 'AI Plans', v: tenantConfig.planFree + ' free', color: '#7c3aed' },
                ].map(c => (
                  <div key={c.e} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.color}30`, borderRadius: 10, padding: '8px 12px' }}>
                    <span style={{ fontSize: 16 }}>{c.e}</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: c.color }}>{c.v}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => setShowRegister(true)}
              style={{
                padding: '14px 28px',
                background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
                border: 'none', borderRadius: 12,
                color: '#fff', fontSize: 15, fontWeight: 800,
                cursor: 'pointer', flexShrink: 0,
                boxShadow: '0 4px 20px rgba(124,58,237,0.5)',
                letterSpacing: '0.02em',
              }}
            >
              Join VIP Free →
            </button>
          </div>
        </div>
        <RegisterModal isOpen={showRegister} onClose={() => setShowRegister(false)} registrationSource={registrationSource} onSuccess={() => setShowRegister(false)} />
      </>
    )
  }

  // â”€â”€ REGISTERED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (variant === 'nav') return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(s => !s)}
        title='Click to view your VIP AI credits and request more access'
        style={{
          background: anyEmpty ? 'linear-gradient(135deg, #1e1b4b, #450a0a)' : anyLow ? 'linear-gradient(135deg, #1e1b4b, #451a03)' : 'linear-gradient(135deg, #1e1b4b, #0f2d1e)',
          border: `1px solid ${anyEmpty ? 'rgba(239,68,68,0.4)' : anyLow ? 'rgba(245,158,11,0.4)' : 'rgba(124,58,237,0.4)'}`,
          borderRadius: 100, padding: '7px 14px',
          cursor: 'pointer',
          boxShadow: `0 0 16px ${anyEmpty ? 'rgba(239,68,68,0.2)' : anyLow ? 'rgba(245,158,11,0.2)' : 'rgba(124,58,237,0.2)'}`,
        }}
      >
        <span style={{ fontSize: 12 }}>✦</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#a5b4fc', letterSpacing: '0.05em' }}>VIP Member</span>
        <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.15)' }} />
        {credits ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {[
              { e: '💬', r: chatRemaining },
              { e: '📊', r: estRemaining },
              { e: '📋', r: planRemaining },
            ].map(c => (
              <span key={c.e} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 10 }}>{c.e}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: creditColor(c.r) }}>{c.r ?? 'â€¦'}</span>
              </span>
            ))}
          </span>
        ) : <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>â€¦</span>}
        {(anyLow || anyEmpty) && (
          <span style={{ fontSize: 9, fontWeight: 700, color: anyEmpty ? '#ef4444' : '#f59e0b', background: anyEmpty ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', borderRadius: 100, padding: '2px 6px' }}>
            {anyEmpty ? 'Get More' : 'Low'}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>â–¾</span>
      </button>

      {showDropdown && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 280, background: '#0f172a',
          border: '1px solid rgba(124,58,237,0.3)',
          borderRadius: 14, padding: 16, zIndex: 1000,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            ✦ VIP Member Â· {user.email}
          </div>

          {[
            { e: '💬', label: 'AI Chats', used: credits?.messageCount ?? 0, total: credits?.chatFreeMessages ?? 5, color: '#3b82f6' },
            { e: '📊', label: 'AI Estimates', used: credits?.estimatorCount ?? 0, total: credits?.estimatorFreeAttempts ?? 2, color: '#10b981' },
            { e: '📋', label: 'AI Plans', used: (credits?.buyerPlansUsed ?? 0) + (credits?.sellerPlansUsed ?? 0), total: credits?.totalAllowed ?? 1, color: '#7c3aed' },
          ].map(c => {
            const rem = Math.max(0, c.total - c.used)
            const pct = c.total > 0 ? (c.used / c.total) * 100 : 0
            return (
              <div key={c.e} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{c.e}</span>{c.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: creditColor(rem) }}>{rem} remaining</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 100, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : c.color, borderRadius: 100, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 3 }}>{c.used} of {c.total} used</div>
              </div>
            )
          })}

          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 0' }} />

          {requested ? (
            <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 12, color: '#10b981', fontWeight: 600 }}>
              âœ“ Request sent â€” your agent will review shortly
            </div>
          ) : (
            <button
              onClick={requestMore}
              disabled={requesting}
              style={{
                width: '100%', padding: '10px',
                background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
                border: 'none', borderRadius: 10,
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: requesting ? 'not-allowed' : 'pointer',
                opacity: requesting ? 0.6 : 1, marginBottom: 8,
              }}
            >
              {requesting ? 'Sending...' : '✦ Request More AI Access'}
            </button>
          )}

          <button
            onClick={() => { signOut(); setShowDropdown(false) }}
            style={{
              width: '100%', padding: '8px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, color: 'rgba(255,255,255,0.3)',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  )

  // Full variant â€” registered
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a, #1e1b4b)',
      border: `1px solid ${anyEmpty ? 'rgba(239,68,68,0.4)' : anyLow ? 'rgba(245,158,11,0.4)' : 'rgba(124,58,237,0.4)'}`,
      borderRadius: 16, padding: '20px 24px',
      boxShadow: `0 0 40px ${anyEmpty ? 'rgba(239,68,68,0.15)' : 'rgba(124,58,237,0.15)'}`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #1d4ed8, #7c3aed, #ec4899)' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>✦</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>VIP Member</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#a5b4fc', background: 'rgba(165,180,252,0.1)', borderRadius: 100, padding: '3px 10px', border: '1px solid rgba(165,180,252,0.2)' }}>AI ACCESS</span>
        </div>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{user.email}</span>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { e: '💬', label: 'AI Chats', used: credits?.messageCount ?? 0, total: credits?.chatFreeMessages ?? 5, color: '#3b82f6' },
          { e: '📊', label: 'AI Estimates', used: credits?.estimatorCount ?? 0, total: credits?.estimatorFreeAttempts ?? 2, color: '#10b981' },
          { e: '📋', label: 'AI Plans', used: (credits?.buyerPlansUsed ?? 0) + (credits?.sellerPlansUsed ?? 0), total: credits?.totalAllowed ?? 1, color: '#7c3aed' },
        ].map(c => {
          const rem = Math.max(0, c.total - c.used)
          const pct = c.total > 0 ? (c.used / c.total) * 100 : 0
          return (
            <div key={c.e} style={{ flex: 1, minWidth: 120, background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.color}25`, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{c.e}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: creditColor(rem), lineHeight: 1, marginBottom: 6 }}>{rem}</div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 100, overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : c.color, borderRadius: 100 }} />
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{c.used} of {c.total} used</div>
            </div>
          )
        })}
      </div>

      {requested ? (
        <div style={{ textAlign: 'center', padding: '10px', fontSize: 13, color: '#10b981', fontWeight: 600, background: 'rgba(16,185,129,0.1)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)' }}>
          âœ“ Request sent â€” your agent will review and approve shortly
        </div>
      ) : (
        <button
          onClick={requestMore}
          disabled={requesting}
          style={{
            width: '100%', padding: '12px',
            background: anyEmpty ? 'linear-gradient(135deg, #dc2626, #7c3aed)' : 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
            border: 'none', borderRadius: 10,
            color: '#fff', fontSize: 14, fontWeight: 800,
            cursor: requesting ? 'not-allowed' : 'pointer',
            opacity: requesting ? 0.6 : 1,
            letterSpacing: '0.02em',
          }}
        >
          {requesting ? 'Sending request...' : anyEmpty ? '✦ Credits Empty — Request More AI Access' : '✦ Request More AI Access'}
        </button>
      )}
    </div>
  )
}
