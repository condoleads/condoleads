'use client'
import { useAuth } from './AuthContext'
import { useCreditSession } from '@/components/credits/CreditSessionContext'
import { useState } from 'react'
import RegisterModal from './RegisterModal'
import { LogOut } from 'lucide-react'

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
  const { state } = useCreditSession()
  const [showRegister, setShowRegister] = useState(false)

  // Pills only render after the provider's first fetch resolves
  const creditsReady = !state.loading

  if (user) {
    const plansUsed = state.buyerPlansUsed + state.sellerPlansUsed
    const plansTotal = state.totalAllowed
    const plansRemaining = Math.max(0, plansTotal - plansUsed)

    const chatRemaining = creditsReady ? Math.max(0, state.chatFreeMessages - state.messageCount) : null
    const estimateRemaining = creditsReady ? Math.max(0, state.estimatorFreeAttempts - state.estimatorCount) : null

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
            {remaining}{isLow ? ' âš ï¸' : ''}{isEmpty ? ' ðŸ”´' : ''}
          </span>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {creditsReady && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {pill('ðŸ’¬', chatRemaining, `${chatRemaining} AI chats remaining`)}
            {pill('ðŸ“Š', estimateRemaining, `${estimateRemaining} AI estimates remaining`)}
            {pill('ðŸ“‹', plansRemaining, `${plansRemaining} AI plans remaining`)}
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

  // Unregistered — pull tenant defaults from context, no hardcoded numbers
  const chatFreeLabel = creditsReady ? `${state.chatFreeMessages} free` : '— free'
  const estFreeLabel = creditsReady ? `${state.estimatorFreeAttempts} free` : '— free'
  const planFreeLabel = creditsReady ? `${state.totalAllowed} free` : '— free'

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 4 }}>
        {[
          { emoji: 'ðŸ’¬', label: chatFreeLabel, title: `${chatFreeLabel} AI chats on registration` },
          { emoji: 'ðŸ“Š', label: estFreeLabel, title: `${estFreeLabel} AI estimates on registration` },
          { emoji: 'ðŸ“‹', label: planFreeLabel, title: `${planFreeLabel} AI plan on registration` },
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