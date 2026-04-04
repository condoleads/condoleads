'use client'
import { useEffect, useRef, useState } from 'react'
function useInView() {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold: 0.15 })
    if (ref.current) o.observe(ref.current)
    return () => o.disconnect()
  }, [])
  return { ref, v }
}
const FLOW = [
  { icon: '👤', label: 'Visitor arrives' },
  null,
  { icon: '🤖', label: 'WALLiam engages' },
  null,
  { icon: '📊', label: 'Plan generated' },
  null,
  { icon: '📧', label: 'Agent notified' },
  null,
  { icon: '🏡', label: 'Deal closed' },
]
export default function Solution() {
  const { ref, v } = useInView()
  return (
    <section ref={ref} id="solution" style={{ padding: '120px 24px', background: 'linear-gradient(180deg,#020812 0%,#030d1f 100%)', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 900, height: 900, borderRadius: '50%', background: 'radial-gradient(circle,rgba(59,130,246,0.07) 0%,transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 100, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', fontSize: 11, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20, opacity: v ? 1 : 0, transition: 'opacity 0.6s' }}>The Solution</div>
          <h2 style={{ fontSize: 'clamp(28px,5vw,58px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 20, opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.1s' }}>
            Meet WALLiam —<br />
            <span style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>your team’s AI real estate brain.</span>
          </h2>
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.45)', maxWidth: 580, margin: '0 auto', lineHeight: 1.75, opacity: v ? 1 : 0, transition: 'opacity 0.6s ease 0.2s' }}>
            WALLiam is an AI assistant embedded into your real estate website. It talks to every visitor, understands their needs, delivers a personalized plan — and hands you a qualified lead.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 56 }}>
          {FLOW.map((s, i) => s === null ? (
            <div key={i} style={{ color: 'rgba(255,255,255,0.18)', fontSize: 22, opacity: v ? 1 : 0, transition: `opacity 0.4s ease ${i*0.07}s` }}>→</div>
          ) : (
            <div key={i} style={{ padding: '18px 24px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center', minWidth: 110, opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(20px)', transition: `all 0.5s ease ${i*0.07}s` }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}