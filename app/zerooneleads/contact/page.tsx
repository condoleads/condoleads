'use client'
import { useState } from 'react'

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', plan: '', message: '' })
  const [status, setStatus] = useState<'idle'|'loading'|'success'|'error'>('idle')

  const handle = (e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }))
  }

  const submit = async () => {
    if (!form.name || !form.email) return
    setStatus('loading')
    try {
      const res = await fetch('/api/01leads-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (res.ok) setStatus('success')
      else setStatus('error')
    } catch { setStatus('error') }
  }

  return (
    <div style={{ background: '#020812', minHeight: '100vh' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '120px 24px' }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 100, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', fontSize: 11, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>Contact</div>
          <h1 style={{ fontSize: 40, fontWeight: 900, color: '#fff', marginBottom: 12, letterSpacing: '-0.02em' }}>Get in touch</h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>Interested in 01leads AI for your team? Fill out the form and we'll get back to you within 24 hours. All clients subject to discovery call and approval.</p>
        </div>

        {status === 'success' ? (
          <div style={{ padding: '40px', borderRadius: 20, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#10b981', marginBottom: 8 }}>Message sent!</h2>
            <p style={{ color: 'rgba(255,255,255,0.45)' }}>We'll get back to you within 24 hours.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { name: 'name', label: 'Full Name *', type: 'text', placeholder: 'John Smith' },
              { name: 'email', label: 'Email *', type: 'email', placeholder: 'john@realty.com' },
              { name: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 416 000 0000' },
              { name: 'company', label: 'Brokerage / Company', type: 'text', placeholder: 'RE/MAX Realty' },
            ].map(f => (
              <div key={f.name}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>{f.label}</label>
                <input
                  type={f.type} name={f.name} value={(form as any)[f.name]}
                  onChange={handle} placeholder={f.placeholder}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>Plan Interest</label>
              <select name="plan" value={form.plan} onChange={handle} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, background: '#0d1629', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none' }}>
                <option value="">Select a plan</option>
                <option value="Solo Agent">Solo Agent — $3,500 setup + $2,500-$5,000/mo</option>
                <option value="Team / Brokerage">Team / Brokerage — $5,000 setup + $5,000-$10,000/mo</option>
                <option value="Enterprise">Enterprise — Custom (100+ agents)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>Message</label>
              <textarea name="message" value={form.message} onChange={handle} placeholder="Tell us about your team and what you're looking for..." rows={4}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            <button onClick={submit} disabled={status === 'loading' || !form.name || !form.email}
              style={{ padding: '14px', borderRadius: 100, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff', fontSize: 15, fontWeight: 800, border: 'none', cursor: form.name && form.email ? 'pointer' : 'not-allowed', opacity: form.name && form.email ? 1 : 0.5, transition: 'all 0.2s' }}>
              {status === 'loading' ? 'Sending...' : 'Send Message'}
            </button>

            {status === 'error' && <p style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>Something went wrong. Please email us directly at contact@01leads.com</p>}
          </div>
        )}

        <div style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Reach Us</h3>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, margin: 0 }}>
            <strong style={{ color: 'rgba(255,255,255,0.8)' }}>01leads</strong><br />
            14 V. Tabakhmela, Tabakhmela, Mtatsminda district, Tbilisi 0114, Georgia<br />
            Email: <a href="mailto:contact@01leads.com" style={{ color: '#3b82f6' }}>contact@01leads.com</a><br />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Response time: Within 24 hours</span>
          </p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 16 }}>
            Operated by Individual Entrepreneur LINKA · ID: 304805726
          </p>
        </div>
      </div>
    </div>
  )
}