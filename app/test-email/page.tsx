'use client'

import { useState } from 'react'

export default function TestEmailPage() {
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')

  const testEmail = async () => {
    if (!email || !email.includes('@')) {
      setStatus('❌ Please enter a valid email address')
      return
    }

    setLoading(true)
    setStatus('Sending test email...')

    try {
      const response = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail: email })
      })

      const result = await response.json()

      if (result.success) {
        setStatus(' Email sent successfully! Check your inbox (and spam folder).')
      } else {
        setStatus(` Error: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      setStatus(` Exception: ${error}`)
    }
    
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'white', padding: '40px', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxWidth: '500px', width: '100%' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}> Test Email Notification</h1>
        
        <p style={{ color: '#666', marginBottom: '30px' }}>
          Enter your email address to receive a test lead notification.
        </p>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
            Your Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <button
          onClick={testEmail}
          disabled={loading}
          style={{
            width: '100%',
            background: loading ? '#9ca3af' : '#2563eb',
            color: 'white',
            fontWeight: '600',
            padding: '15px 30px',
            borderRadius: '8px',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px'
          }}
        >
          {loading ? ' Sending...' : ' Send Test Email'}
        </button>

        {status && (
          <div style={{
            marginTop: '20px',
            padding: '15px',
            borderRadius: '8px',
            background: status.includes('') ? '#d1fae5' : '#fee2e2',
            color: status.includes('') ? '#065f46' : '#991b1b',
            fontSize: '14px'
          }}>
            {status}
          </div>
        )}

        <p style={{ fontSize: '12px', color: '#999', marginTop: '20px' }}>
          ℹ The email will come from <strong>onboarding@resend.dev</strong> (Resend's test domain)
        </p>
      </div>
    </div>
  )
}
