'use client'

import { useState } from 'react'
import { createLead } from '@/lib/actions/leads'

export default function TestLeadPage() {
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: 'John Doe',
    email: '',
    phone: '416-555-1234',
    message: 'I am interested in viewing this property. Please contact me to schedule a showing.'
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.email) {
      setStatus('❌ Please enter your email')
      return
    }

    setLoading(true)
    setStatus('Creating lead and sending email...')

    try {
      // Default agent ID (Mary Smith)
      const result = await createLead({
        agentId: 'd5ab9f8b-5819-4363-806c-a414657e7763',
        contactName: formData.name,
        contactEmail: formData.email,
        contactPhone: formData.phone,
        source: 'contact_form',
        message: formData.message,
        buildingId: '2bcd2f02-37e1-4083-9154-c589da99a459', // X2 Condos
      })

      if (result.success) {
        setStatus(' Success! Lead created and email sent. Check your inbox!')
      } else {
        setStatus(` Error: ${result.error}`)
      }
    } catch (error: any) {
      setStatus(` Exception: ${error.message}`)
    }
    
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '40px 20px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', background: 'white', padding: '40px', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}> Test Lead Creation + Email</h1>
        
        <p style={{ color: '#666', marginBottom: '30px' }}>
          This will create a real lead in the database AND send an email notification.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
              Your Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
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

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
              Your Email *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="your@email.com"
              required
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

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
              Phone
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
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

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
              Message
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({...formData, message: e.target.value})}
              rows={4}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '16px',
                boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <button
            type="submit"
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
            {loading ? ' Creating Lead...' : ' Create Lead & Send Email'}
          </button>
        </form>

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
          ℹ This creates a HOT lead (contact form + message) for Mary Smith
        </p>
      </div>
    </div>
  )
}
