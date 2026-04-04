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
const F = [
  { icon: '🧠', title: 'Buyer Intelligence Plans', body: 'WALLiam analyses the local market, finds matching listings, computes offer strategy, and delivers a personalized buyer plan — before your agent says a word.', color: '#3b82f6' },
  { icon: '💰', title: 'Instant Home Valuations', body: 'Sellers get a data-driven estimate based on real comparable sales — not a vague range. WALLiam shows the math, builds trust, captures the lead.', color: '#8b5cf6' },
  { icon: '📍', title: 'Geo-Intelligent Search', body: 'Every neighbourhood and community has its own market data. WALLiam knows Whitby from Mississauga — and tells your client the difference.', color: '#06b6d4' },
  { icon: '⚡', title: 'Instant Lead Capture', body: 'Name, email, phone, intent, budget, timeline — captured naturally in conversation. Your agent gets a notification with everything needed to close.', color: '#10b981' },
  { icon: '🔒', title: 'VIP Access Control', body: 'Gate premium content behind registration. Control how many free plans each visitor gets. Your agent approves VIP access — staying in the loop.', color: '#f59e0b' },
  { icon: '🏢', title: 'Full White Label', body: 'Your domain. Your brand. Your agents. WALLiam runs silently in the background — your clients think it’s you. Because it represents you.', color: '#ef4444' },
]
const colorRgb: Record<string,string> = { '#3b82f6':'59,130,246','#8b5cf6':'139,92,246','#06b6d4':'6,182,212','#10b981':'16,185,129','#f59e0b':'245,158,11','#ef4444':'239,68,68' }
export default function Features() {
  const { ref, v } = useInView()
  return (
    <section ref={ref} id="features" style={{ padding: '120px 24px', background: '#030d1f' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 100, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', fontSize: 11, fontWeight: 700, color: '#8b5cf6', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20 }}>Features</div>
          <h2 style={{ fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Everything your agents need.<br /><span style={{ color: 'rgba(255,255,255,0.28)' }}>Nothing they have to do.</span>
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: 20 }}>
          {F.map((f, i) => (
            <div key={i} style={{ padding: '36px', borderRadius: 24, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.3s ease', cursor: 'default', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(30px)', transitionDelay: `${i*0.08}s` }}
              onMouseEnter={e => { e.currentTarget.style.background = `rgba(${colorRgb[f.color]},0.07)`; e.currentTarget.style.borderColor = f.color+'40'; e.currentTarget.style.transform = 'translateY(-4px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <div style={{ width: 50, height: 50, borderRadius: 14, background: f.color+'18', border: `1px solid ${f.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 20 }}>{f.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10, color: '#fff' }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.42)', lineHeight: 1.75, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}