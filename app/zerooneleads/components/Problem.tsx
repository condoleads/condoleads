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
const PROBLEMS = [
  { icon: '🌙', title: 'Leads arrive at midnight', body: "A buyer visits your site at 11pm, asks a question, gets no response. By morning they’ve signed with a competitor who had an AI." },
  { icon: '📋', title: 'Agents ask the same 10 questions', body: "Budget? Timeline? Neighbourhood? Beds? Every first conversation is identical. Your agents’ time is worth more than a questionnaire." },
  { icon: '📉', title: '97% of visitors leave without a trace', body: "They came. They browsed. They left. No name, no email, no phone. You never knew they existed — and neither did your agent." },
  { icon: '🤷', title: 'No plan = no trust = no deal', body: "Buyers and sellers don’t call agents they don’t trust. Trust is built by demonstrating knowledge first — before the pitch." },
]
export default function Problem() {
  const { ref, v } = useInView()
  return (
    <section ref={ref} style={{ padding: '120px 24px', background: '#020812', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 1, height: 80, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.08))' }} />
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 100, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 11, fontWeight: 700, color: '#ef4444', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20, opacity: v ? 1 : 0, transition: 'opacity 0.6s' }}>The Problem</div>
          <h2 style={{ fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#fff', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.1s'  }}>
            You’re losing leads<br /><span style={{ color: 'rgba(255,255,255,0.28)' }}>you don’t even know exist.</span>
          </h2>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -24px', padding: '0 24px 16px' }}>
        <div className="prob-grid">
          {PROBLEMS.map((p, i) => (
            <div key={i} style={{ padding: '32px', borderRadius: 20, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(30px)', transition: `all 0.6s ease ${0.1 + i * 0.1}s` }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>{p.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10, color: '#fff' }}>{p.title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.42)', lineHeight: 1.75, margin: 0 }}>{p.body}</p>
            </div>
          ))}
          </div>
        </div>
        <div style={{ marginTop: 72, padding: '56px 40px', borderRadius: 24, background: 'linear-gradient(135deg, rgba(239,68,68,0.07), rgba(239,68,68,0.02))', border: '1px solid rgba(239,68,68,0.15)', textAlign: 'center', opacity: v ? 1 : 0, transition: 'opacity 0.6s ease 0.5s' }}>
          <div style={{ fontSize: 'clamp(56px,12vw,112px)', fontWeight: 900, fontFamily: 'monospace', color: '#ef4444', lineHeight: 1 }}>97%</div>
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.45)', marginTop: 12, fontWeight: 500 }}>of real estate website visitors leave without ever contacting an agent.</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.22)', marginTop: 8 }}>That’s not a traffic problem. That’s a conversion problem. And AI solves it.</div>
        </div>
      </div>
    <style>{`
      .prob-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 20px; }
      @media(max-width:768px){ .prob-grid { grid-template-columns: repeat(4,280px); width: max-content; } }
      .prob-grid::-webkit-scrollbar { display: none; }
    `}</style>
    </section>
  )
}