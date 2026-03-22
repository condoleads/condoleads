// components/WalliamAgentCard.tsx
// Self-resolving agent card for WALLiam (System 2)
// Calls resolve-agent on mount — shows agent card or WALLiam brand card
// Design: sophisticated inline dark card — NOT a sidebar panel
// System 1 AgentCard is never touched

'use client'
import { useState, useEffect } from 'react'

interface WalliamAgentCardProps {
  // Page context for agent resolution — pass whatever is available
  listing_id?: string | null
  building_id?: string | null
  community_id?: string | null
  municipality_id?: string | null
  area_id?: string | null
}

interface Agent {
  id: string
  full_name: string
  email: string
  cell_phone?: string | null
  title?: string | null
  brokerage_name?: string | null
  profile_photo_url?: string | null
}

export default function WalliamAgentCard({
  listing_id,
  building_id,
  community_id,
  municipality_id,
  area_id,
}: WalliamAgentCardProps) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Read user_id from Supabase auth client-side
    import('@/lib/supabase/client').then(({ createClient }) => {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data }) => {
        const userId = data?.user?.id || null
        fetch('/api/walliam/resolve-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listing_id: listing_id || null,
            building_id: building_id || null,
            community_id: community_id || null,
            municipality_id: municipality_id || null,
            area_id: area_id || null,
            user_id: userId,
          }),
        })
          .then(r => r.json())
          .then(data => {
            setAgent(data.agent || null)
            setLoading(false)
          })
          .catch(() => setLoading(false))
      })
    })
  }, [listing_id, building_id, community_id, municipality_id, area_id])

  if (loading) return null

  // ── WALLiam brand card (no agent assigned) ────────────────────────────────
  if (!agent) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        {/* WALLiam mark */}
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 0 20px rgba(59,130,246,0.3)',
        }}>
          <span style={{ fontSize: 20, color: '#fff' }}>✦</span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
            <span style={{ fontWeight: 900 }}>WALL</span>
            <span style={{ fontWeight: 300, color: 'rgba(255,255,255,0.5)' }}>iam</span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            AI Real Estate · Get your personalized plan
          </div>
        </div>

        <button
          onClick={() => window.dispatchEvent(new CustomEvent('charlie:open', { detail: {} }))}
          style={{
            background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
            border: 'none', borderRadius: 10,
            padding: '9px 16px',
            color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          Get My Plan ✦
        </button>
      </div>
    )
  }

  // ── Agent card ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1a2540 100%)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {/* Top accent bar */}
      <div style={{
        height: 3,
        background: 'linear-gradient(90deg, #1d4ed8, #4f46e5, #7c3aed)',
      }} />

      <div style={{ padding: '18px 20px' }}>
        {/* Label */}
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
          color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
          marginBottom: 14,
        }}>
          Your Agent
        </div>

        {/* Agent info row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          {/* Photo */}
          {agent.profile_photo_url ? (
            <img
              src={agent.profile_photo_url}
              alt={agent.full_name}
              style={{
                width: 52, height: 52, borderRadius: 12,
                objectFit: 'cover', flexShrink: 0,
                border: '2px solid rgba(255,255,255,0.1)',
              }}
            />
          ) : (
            <div style={{
              width: 52, height: 52, borderRadius: 12,
              background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: 18, fontWeight: 800, color: '#fff',
            }}>
              {agent.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15, fontWeight: 800, color: '#fff',
              letterSpacing: '-0.01em', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {agent.full_name}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {agent.title || 'Sales Representative'}
            </div>
            {agent.brokerage_name && (
              <div style={{
                fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {agent.brokerage_name}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {agent.cell_phone && (
            <a
              href={`tel:${agent.cell_phone}`}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '9px 12px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, color: '#fff',
                fontSize: 12, fontWeight: 600,
                textDecoration: 'none', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 14 }}>📞</span>
              <span>{agent.cell_phone}</span>
            </a>
          )}
          <a
            href={`mailto:${agent.email}`}
            style={{
              flex: agent.cell_phone ? '0 0 auto' : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: '9px 14px',
              background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
              border: 'none', borderRadius: 10,
              color: '#fff', fontSize: 12, fontWeight: 700,
              textDecoration: 'none', cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 13 }}>✉</span>
            {!agent.cell_phone && <span>Email Agent</span>}
          </a>
        </div>

        {/* Charlie CTA */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('charlie:open', { detail: {} }))}
          style={{
            width: '100%', marginTop: 8,
            padding: '9px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 12, fontWeight: 600,
            cursor: 'pointer', letterSpacing: '0.01em',
          }}
        >
          ✦ Get My AI Real Estate Plan
        </button>
      </div>
    </div>
  )
}