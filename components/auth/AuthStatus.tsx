'use client'
import { useAuth } from './AuthContext'
import { useState, useEffect } from 'react'
import RegisterModal from './RegisterModal'
import { User, LogOut } from 'lucide-react'

interface AuthStatusProps {
  agentId?: string
  buildingId?: string
  buildingName?: string
  buildingAddress?: string
  listingId?: string
  listingAddress?: string
  unitNumber?: string
  registrationSource?: string
}

interface Credits {
  buyerPlansUsed: number
  sellerPlansUsed: number
  totalAllowed: number
  messageCount: number
  chatFreeMessages: number
  estimatorCount: number
  estimatorFreeAttempts: number
}

export default function AuthStatus({
  agentId,
  buildingId,
  buildingName,
  buildingAddress,
  listingId,
  listingAddress,
  unitNumber,
  registrationSource = 'home_page'
}: AuthStatusProps) {
  const { user, signOut } = useAuth()
  const [showRegister, setShowRegister] = useState(false)
  const [credits, setCredits] = useState<Credits | null>(null)

  useEffect(() => {
    const tenantId = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
    fetch('/api/walliam/charlie/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
      body: JSON.stringify({ userId: user?.id || null, read_only: !user }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.sessionId) {
          setCredits({
            buyerPlansUsed: d.buyerPlansUsed || 0,
            sellerPlansUsed: d.sellerPlansUsed || 0,
            totalAllowed: d.totalAllowed || 1,
            messageCount: d.messageCount || 0,
            chatFreeMessages: d.chatFreeMessages || 0,
            estimatorCount: d.estimatorCount || 0,
            estimatorFreeAttempts: d.estimatorFreeAttempts || 2,
          })
        }
      })
      .catch(() => {})
  }, [user])

  if (user) {
    const plansUsed = credits ? credits.buyerPlansUsed + credits.sellerPlansUsed : 0
    const plansTotal = credits?.totalAllowed ?? 1
    const plansRemaining = Math.max(0, plansTotal - plansUsed)

    const chatRemaining = credits ? Math.max(0, credits.chatFreeMessages - credits.messageCount) : null
    const estimateRemaining = credits ? Math.max(0, credits.estimatorFreeAttempts - credits.estimatorCount) : null

    const pill = (emoji: string, remaining: number | null, title: string) => {
      if (remaining === null) return null
      const isEmpty = remaining === 0
      const isLow = remaining === 1
      const color = isEmpty ? '#ef4444' : isLow ? '#f59e0b' : 'rgba(255,255,255,0.5)'
      const bg = isEmpty ? 'rgba(239,68,68,0.1)' : isLow ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.06)'
      return (
        <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 4, background: bg, border: `1px solid ${color}30`, borderRadius: 100, padding: '3px 8px' }}>
          <span style={{ fontSize: 11 }}>{emoji}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color }}>
            {remaining}{isLow ? ' ⚠️' : ''}{isEmpty ? ' 🔴' : ''}
          </span>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {credits && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {pill('💬', chatRemaining, `${chatRemaining} AI chats remaining`)}
            {pill('📊', estimateRemaining, `${estimateRemaining} AI estimates remaining`)}
            {pill('📋', plansRemaining, `${plansRemaining} AI plans remaining`)}
          </div>
        )}
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }} className="hidden sm:inline">
          {user.email}
        </span>
        <button
          onClick={signOut}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <LogOut style={{ width: 14, height: 14 }} />
          <span>Sign Out</span>
        </button>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 4 }}>
        {[
          { emoji: '💬', label: '5 free', title: '5 AI chats free on registration' },
          { emoji: '📊', label: '2 free', title: '2 AI estimates free on registration' },
          { emoji: '📋', label: '1 free', title: '1 AI plan free on registration' },
        ].map(c => (
          <div key={c.emoji} title={c.title} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 100, padding: '3px 8px' }}>
            <span style={{ fontSize: 11 }}>{c.emoji}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{c.label}</span>
          </div>
        ))}
      </div>
      <button
        onClick={() => setShowRegister(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
      >
        Sign In / Register
      </button>
      <RegisterModal
        isOpen={showRegister}
        onClose={() => setShowRegister(false)}
        agentId={agentId}
        buildingId={buildingId}
        buildingName={buildingName}
        buildingAddress={buildingAddress}
        listingId={listingId}
        listingAddress={listingAddress}
        unitNumber={unitNumber}
        registrationSource={registrationSource}
      />
    </>
  )
}