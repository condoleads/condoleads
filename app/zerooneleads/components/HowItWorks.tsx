'use client'
import { useEffect, useRef, useState } from 'react'
function useInView() {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold: 0.1 })
    if (ref.current) o.observe(ref.current)
    return () => o.disconnect()
  }, [])
  return { ref, v }
}
const STEPS = [
  { n: '01', title: 'Visitor lands on your site', body: 'They browse properties, neighbourhoods or search for a home value. 01leads AI is watching — ready to engage the moment they show intent.', color: '#3b82f6' },
  { n: '02', title: '01leads AI starts the conversation', body: 'Naturally, intelligently. RAG-grounded responses pulled from real GTA listings and comparable sales — not generic web content. Every answer is data-backed.', color: '#8b5cf6' },
  { n: '03', title: 'A personalized plan is delivered', body: 'Buyer gets market analysis, matching listings, offer strategy. Seller gets real comparable sales, a valuation, and next steps. Built on live data, delivered in seconds.', color: '#06b6d4' },
  { n: '04', title: 'Lead captured. Agent notified.', body: 'Name, email, phone, intent, budget, area, timeline — your agent gets it all instantly. The conversation is already warm.', color: '#10b981' },
]
export default function HowItWorks() {
  const { ref, v } = useInView()
  return (
    <section ref={ref} id="how-it-works" style={{ padding: '120px 24px', background: 'linear-gradient(180deg,#030d1f 0%,#020812 100%)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 100, background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', fontSize: 11, fontWeight: 700, color: '#06b6d4', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20 }}>How It Works</div>
          <h2 style={{ fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#fff'  }}>
            From visitor to qualified lead<br />
            <span style={{ background: 'linear-gradient(135deg,#3b82f6,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>in under 3 minutes.</span>
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 4 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ padding: '40px 32px', borderRadius: 20, background: i%2===0 ? 'rgba(255,255,255,0.025)' : 'transparent', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(30px)', transition: `all 0.6s ease ${i*0.12}s` }}>
              <div style={{ fontFamily: 'monospace', fontSize: 56, fontWeight: 900, color: s.color+'1a', lineHeight: 1, marginBottom: 20 }}>{s.n}</div>
              <div style={{ width: 36, height: 3, background: s.color, borderRadius: 2, marginBottom: 18 }} />
              <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 10, color: '#fff', lineHeight: 1.3 }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.42)', lineHeight: 1.75, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}