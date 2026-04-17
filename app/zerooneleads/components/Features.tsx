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
  { icon: '💬', title: 'AI Chat', body: 'Your 24/7 conversational AI. Visitors ask anything — neighbourhoods, listings, mortgages, specific buildings. Answers pulled from live GTA data (RAG-grounded, no hallucinations).', color: '#3b82f6' },
  { icon: '🧠', title: 'AI Plans — Buyer & Seller', body: 'Full personalized strategies delivered in 60 seconds. Buyers get market analysis, matching listings, offer strategy. Sellers get comps, valuation, next steps. Every plan = qualified lead.', color: '#8b5cf6' },
  { icon: '💰', title: 'AI Estimator', body: 'Homeowners enter their address and get a data-driven valuation based on actual comparable sales — not a vague range from a national database. Real comps. Real math. Real trust.', color: '#06b6d4' },
  { icon: '📊', title: 'Real GTA Data — RAG-Grounded', body: '1M+ GTA listings in our database, active and historical. Real comparable sales. Neighbourhood-level intelligence. Every building, community, municipality. Updated daily.', color: '#10b981' },
  { icon: '🔒', title: 'VIP Access Control', body: 'Credit system you control. Three separate pools (Chat, Plans, Estimator). Your agent approves VIP upgrades via email — every serious lead stays in your loop.', color: '#f59e0b' },
  { icon: '🏢', title: 'Full White Label', body: 'Your domain. Your brand. Your agents. 01leads AI runs silently in the background — your clients see only your brand, because it represents you.', color: '#ef4444' },
]
const colorRgb: Record<string,string> = { '#3b82f6':'59,130,246','#8b5cf6':'139,92,246','#06b6d4':'6,182,212','#10b981':'16,185,129','#f59e0b':'245,158,11','#ef4444':'239,68,68' }
export default function Features() {
  const { ref, v } = useInView()
  return (
    <section ref={ref} id="features" style={{ padding: '120px 24px', background: '#030d1f' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 100, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', fontSize: 11, fontWeight: 700, color: '#8b5cf6', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20 }}>Three AI Systems. One Platform.</div>
          <h2 style={{ fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#fff'  }}>
            Built for real conversions.<br /><span style={{ color: 'rgba(255,255,255,0.28)' }}>Not generic AI chat.</span>
          </h2>
        </div>
        <div className="feat-scroll">
          <div className="feat-grid">
          {F.map((f, i) => (
            <div key={i} className="feat-card" style={{ padding: '28px', borderRadius: 24, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.3s ease', cursor: 'default', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(30px)', transitionDelay: `${i*0.08}s` }}
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
      </div>
      <style>{`
    .feat-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -24px; padding: 0 24px 16px; }
    .feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .feat-card { min-width: 0; }
    .feat-scroll::-webkit-scrollbar { display: none; }
    @media(max-width: 768px) {
      .feat-grid { grid-template-columns: repeat(6, 280px); width: max-content; }
      .feat-card { width: 280px; }
    }
  `}</style>
    </section>
  )
}
