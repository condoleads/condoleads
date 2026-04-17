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
const PLANS = [
  { name: 'Solo Agent', setup: '$3,500', monthly: '$2,500 – $5,000', monthlySuffix: '/mo', color: '#3b82f6', cta: 'Book Discovery Call', popular: false, href: '/contact?plan=solo', features: ['1 agent website','01leads AI Chat, Plans & Estimator','Live GTA market data (RAG-grounded)','Instant lead capture & notifications','VIP credit control','Full GTA coverage','Your domain + branding','Subject to approval'] },
  { name: 'Team / Brokerage', setup: '$5,000', monthly: '$5,000 – $10,000', monthlySuffix: '/mo', color: '#8b5cf6', cta: 'Book Discovery Call', popular: true, href: '/contact?plan=team', features: ['Up to 99 agents','Manager hierarchy & territory routing','Lead routing by geography','All Solo AI features','Priority support & onboarding','Full white label — your brand only','Custom domain','Subject to approval'] },
  { name: 'Enterprise', setup: 'Custom', monthly: 'Custom', monthlySuffix: '', color: '#06b6d4', cta: 'Book a Demo', popular: false, href: '/contact?plan=enterprise', features: ['100+ agents','Custom AI persona & integrations','Dedicated support & SLA','API access','All Team features','Custom onboarding','Custom contract','Subject to approval'] },
]
export default function Pricing() {
  const { ref, v } = useInView()
  return (
    <section ref={ref} id="pricing" style={{ padding: '120px 24px', background: '#020812' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 100, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: 11, fontWeight: 700, color: '#10b981', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20 }}>Pricing</div>
          <h2 style={{ fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 16, color: '#fff'  }}>Simple, transparent pricing.</h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.38)', maxWidth: 560, margin: '0 auto' }}>Call-based. Approval-gated. Setup fee includes your first month. Monthly billing begins month two.</p>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -24px', padding: '0 24px 16px' }}>
        <div className="price-grid">
          {PLANS.map((p, i) => (
            <div key={i} style={{ padding: '40px 36px', borderRadius: 24, position: 'relative', background: p.popular ? 'linear-gradient(135deg,rgba(139,92,246,0.12),rgba(59,130,246,0.07))' : 'rgba(255,255,255,0.02)', border: p.popular ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.06)', transform: p.popular ? 'scale(1.03)' : 'scale(1)', opacity: v ? 1 : 0, transition: `all 0.6s ease ${i*0.12}s` }}>
              {p.popular && <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', padding: '4px 20px', borderRadius: 100, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', fontSize: 11, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Most Popular</div>}
              <div style={{ fontSize: 12, fontWeight: 700, color: p.color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{p.name}</div>
              <div style={{ marginBottom: 6 }}><span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Setup: </span><span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{p.setup}</span><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginLeft: 6 }}>{p.setup !== 'Custom' ? '(includes first month)' : ''}</span></div>
              <div style={{ marginBottom: 32 }}>
                <span style={{ fontSize: p.monthly === 'Custom' ? 44 : 32, fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>{p.monthly}</span>
                {p.monthlySuffix && <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', marginLeft: 4 }}>{p.monthlySuffix}</span>}
              </div>
              <div style={{ marginBottom: 36 }}>
                {p.features.map((f, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: p.color+'18', border: `1px solid ${p.color}38`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
                    </div>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{f}</span>
                  </div>
                ))}
              </div>
              <a href={p.href} style={{ display: 'block', textAlign: 'center', padding: '14px', borderRadius: 100, textDecoration: 'none', fontWeight: 800, fontSize: 15, background: p.popular ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)', color: '#fff', border: p.popular ? 'none' : '1px solid rgba(255,255,255,0.1)', boxShadow: p.popular ? '0 8px 30px rgba(139,92,246,0.4)' : 'none', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.opacity='0.85'; e.currentTarget.style.transform='translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)' }}
              >{p.cta}</a>
            </div>
          ))}
          </div>
        </div>
        <p style={{ textAlign: 'center', marginTop: 40, fontSize: 13, color: 'rgba(255,255,255,0.38)', maxWidth: 780, margin: '40px auto 0', lineHeight: 1.7 }}>
          Exact price determined on discovery call based on agent count, traffic volume, and service requirements. All plans subject to approval. Setup fee includes full onboarding and your first month. Monthly billing begins month two.
        </p>
        <div style={{ marginTop: 32, padding: '24px 32px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', maxWidth: 780, margin: '32px auto 0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>AI &amp; Ad Costs</div>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, margin: 0 }}>
            AI platform usage and ad costs are paid by you directly to those providers. You own the accounts, you control the spend — we handle the expertise and configuration.
          </p>
        </div>
        <div style={{ marginTop: 16, padding: '24px 32px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', maxWidth: 780, margin: '16px auto 0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Optional — Ad Management</div>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, margin: 0 }}>
            Running Google, Meta, or social ads? You can manage them yourself, or we can help at below-agency rates. You pay ad platforms directly. Optional — discussed on discovery call if you're interested.
          </p>
        </div>
      </div>
    <style>{`
      .price-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; align-items: start; }
      @media(max-width:768px){ .price-grid { grid-template-columns: repeat(3,300px); width: max-content; } }
      .price-grid::-webkit-scrollbar { display: none; }
    `}</style>
    </section>
  )
}
