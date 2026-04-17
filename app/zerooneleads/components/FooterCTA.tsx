'use client'
import { useEffect, useRef, useState } from 'react'
function useInView() {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold: 0.2 })
    if (ref.current) o.observe(ref.current)
    return () => o.disconnect()
  }, [])
  return { ref, v }
}
export default function FooterCTA() {
  const { ref, v } = useInView()
  return (
    <section ref={ref} style={{ padding: '140px 24px', background: '#020812', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(59,130,246,0.1) 0%, transparent 65%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,92,246,0.07) 0%,transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
        <h2 style={{ fontSize: 'clamp(32px,6.5vw,68px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 24, color: '#fff', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.7s ease'  }}>
          Ready to stop leaving<br />
          <span style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>leads on the table?</span>
        </h2>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.42)', marginBottom: 52, lineHeight: 1.7, maxWidth: 560, margin: '0 auto 52px', opacity: v ? 1 : 0, transition: 'opacity 0.7s ease 0.1s' }}>
          Every day without 01leads AI is another day of midnight leads going cold, visitors bouncing without a trace, and competitors capturing the buyers that should have been yours.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', opacity: v ? 1 : 0, transition: 'opacity 0.7s ease 0.2s' }}>
          <a href="/contact" style={{ padding: '16px 40px', borderRadius: 100, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff', fontSize: 16, fontWeight: 800, textDecoration: 'none', boxShadow: '0 8px 40px rgba(59,130,246,0.45)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 14px 50px rgba(59,130,246,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 8px 40px rgba(59,130,246,0.45)' }}
          >Book Discovery Call</a>
          <a href="https://walliam.ca" target="_blank" rel="noopener" style={{ padding: '16px 40px', borderRadius: 100, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}
          >See it Live →</a>
        </div>
      </div>
    </section>
  )
}