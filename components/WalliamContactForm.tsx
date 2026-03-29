// components/WalliamContactForm.tsx
// Reusable WALLiam contact form — building, property, and geo pages
// Posts to /api/walliam/contact
// Dark theme consistent with WalliamAgentCard
'use client'

import { useState } from 'react'

interface Props {
  tenantId: string
  building_id?: string | null
  listing_id?: string | null
  community_id?: string | null
  municipality_id?: string | null
  area_id?: string | null
  geo_name?: string | null
  source?: string
  contextLabel?: string // e.g. "310 Front St W" or "Whitby"
}

export default function WalliamContactForm({
  tenantId,
  building_id,
  listing_id,
  community_id,
  municipality_id,
  area_id,
  geo_name,
  source = 'walliam_contact',
  contextLabel,
}: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/walliam/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, phone, message,
          source,
          building_id: building_id || null,
          listing_id: listing_id || null,
          community_id: community_id || null,
          municipality_id: municipality_id || null,
          area_id: area_id || null,
          geo_name: geo_name || contextLabel || null,
          tenant_id: tenantId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSubmitted(true)
      } else {
        setError(data.error || 'Something went wrong')
      }
    } catch {
      setError('Failed to send. Please try again.')
    }
    setSubmitting(false)
  }

  // Success state
  if (submitted) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✦</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
          Message Received
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
          We'll be in touch shortly.
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {/* Top accent bar */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, #1d4ed8, #4f46e5, #7c3aed)' }} />

      <div style={{ padding: '20px' }}>
        {/* Header */}
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
          color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
          marginBottom: 4,
        }}>
          Get In Touch
        </div>
        {contextLabel && (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
            {contextLabel}
          </div>
        )}

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="text"
            placeholder="Your name *"
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputStyle}
          />
          <input
            type="email"
            placeholder="Email address *"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
          />
          <input
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            style={inputStyle}
          />
          <textarea
            placeholder="Message (optional)"
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
          />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%', marginTop: 12,
            padding: '11px',
            background: submitting
              ? 'rgba(255,255,255,0.1)'
              : 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
            border: 'none', borderRadius: 10,
            color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.15s',
          }}
        >
          {submitting ? 'Sending...' : 'Send Message ✦'}
        </button>

        <div style={{
          marginTop: 10, fontSize: 10,
          color: 'rgba(255,255,255,0.2)', textAlign: 'center',
        }}>
          Your info is private and never shared
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}