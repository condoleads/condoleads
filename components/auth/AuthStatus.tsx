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
    if (!user) { setCredits(null); return }
    const tenantId = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
    fetch('/api/walliam/charlie/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
      body: JSON.stringify({ userId: user.id }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.sessionId) {
          setCredits({
            buyerPlansUsed: d.buyerPlansUsed || 0,
            sellerPlansUsed: d.sellerPlansUsed || 0,
            totalAllowed: d.totalAllowed || 1,
          })
        }
      })
      .catch(() => {})
  }, [user])

  if (user) {
    const plansUsed = credits ? credits.buyerPlansUsed + credits.sellerPlansUsed : 0
    const plansTotal = credits?.totalAllowed ?? 1
    const plansRemaining = Math.max(0, plansTotal - plansUsed)
    const isLow = plansRemaining === 1
    const isEmpty = plansRemaining === 0

    const planColor = isEmpty ? '#ef4444' : isLow ? '#f59e0b' : 'rgba(255,255,255,0.5)'
    const planBg = isEmpty ? 'rgba(239,68,68,0.1)' : isLow ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.06)'

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {credits && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div title={`${plansRemaining} AI plan${plansRemaining !== 1 ? 's' : ''} remaining`} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: planBg,
              border: `1px solid ${planColor}30`,
              borderRadius: 100,
              padding: '3px 8px',
              cursor: isEmpty ? 'pointer' : 'default',
            }}>
              <span style={{ fontSize: 11 }}>📋</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: planColor }}>
                {plansRemaining}
                {isLow && ' ⚠️'}
                {isEmpty && ' 🔴'}
              </span>
            </div>
          </div>
        )}
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }} className="hidden sm:inline">
          {user.email}
        </span>
        <button
          onClick={signOut}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'rgba(255,255,255,0.4)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <LogOut style={{ width: 14, height: 14 }} />
          <span>Sign Out</span>
        </button>
      </div>
    )
  }

  return (
    <>
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