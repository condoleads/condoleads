'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthContext'
import RegisterModal from '@/components/auth/RegisterModal'

const COOKIE_KEY = 'walliam_onboarding_dismissed'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${value};expires=${expires};path=/`
}

export default function WalliamOnboardingBanner() {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  const [showRegister, setShowRegister] = useState(false)

  useEffect(() => {
    if (user) { setVisible(false); return }
    if (getCookie(COOKIE_KEY) === '1') return
    setVisible(true)
  }, [user])

  const dismiss = () => {
    setCookie(COOKIE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <>
      <div style={{
        width: '100%',
        background: 'linear-gradient(135deg, #0f172a, #1e293b)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>🔍</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Browse freely — search, explore, compare listings
            </span>
          </div>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>✦</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Register free to unlock:
              <span style={{ color: '#60a5fa', fontWeight: 600 }}> AI Plans</span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}> • </span>
              <span style={{ color: '#34d399', fontWeight: 600 }}>AI Estimates</span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}> • </span>
              <span style={{ color: '#a78bfa', fontWeight: 600 }}>AI Market Chat</span>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setShowRegister(true)}
            style={{
              background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
              border: 'none',
              borderRadius: 8,
              padding: '6px 16px',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            Register Free →
          </button>
          <button
            onClick={dismiss}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.3)',
              cursor: 'pointer',
              fontSize: 16,
              padding: '4px 8px',
              lineHeight: 1,
            }}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>

      <RegisterModal
        isOpen={showRegister}
        onClose={() => setShowRegister(false)}
        registrationSource="onboarding_banner"
        onSuccess={() => setShowRegister(false)}
      />
    </>
  )
}