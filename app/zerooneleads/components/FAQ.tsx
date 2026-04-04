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
const FAQS = [
  { q: 'How quickly can I go live?', a: '3–5 business days from setup fee payment. We handle all technical configuration — you just review and approve.' },
  { q: 'Does this replace my agents?', a: 'Never. WALLiam is your agents’ unfair advantage. It works while they sleep, qualifies leads before they call, and makes every conversation more valuable.' },
  { q: 'What MLS data does it use?', a: 'PropTx RESO API — the same data source as the major Toronto platforms. 68,000+ active and historical GTA listings.' },
  { q: 'Can visitors tell it’s AI?', a: 'WALLiam is transparent about being an AI assistant. But it’s so good at its job that most users don’t care — they just want the plan.' },
  { q: 'What happens when a lead comes in?', a: 'Your agent gets an instant email with the lead’s name, contact info, intent, area, budget, timeline and the full AI plan they received.' },
  { q: 'Is there a long-term contract?', a: 'Month to month. Cancel anytime. We earn your business every month.' },
  { q: 'Can I use my own domain and branding?', a: 'Yes. Team and Brokerage plans include full white-label on your own domain. Your brand, your agents — WALLiam running silently behind the scenes.' },
  { q: 'What areas does it cover?', a: 'Currently the Greater Toronto Area (GTA) — 73 areas, 506 municipalities, 1,948 communities. Expanding nationally in 2026.' },
]
export default function FAQ() {
  const { ref, v } = useInView()
  const [open, setOpen] = useState<number|null>(null)
  return (
    <section ref={ref} id="faq" style={{ padding: '120px 24px', background: '#030d1f' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 100, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20 }}>FAQ</div>
          <h2 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, letterSpacing: '-0.02em' }}>Questions? We have answers.</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {FAQS.map((f, i) => (
            <div key={i} style={{ borderRadius: 16, overflow: 'hidden', background: open===i ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.02)', border: open===i ? '1px solid rgba(59,130,246,0.2)' : '1px solid rgba(255,255,255,0.05)', transition: 'all 0.3s ease', opacity: v ? 1 : 0, transitionDelay: `${i*0.04}s` }}>
              <button onClick={() => setOpen(open===i ? null : i)} style={{ width: '100%', padding: '20px 24px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', textAlign: 'left' }}>{f.q}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 22, flexShrink: 0, transition: 'transform 0.3s', transform: open===i ? 'rotate(45deg)' : 'rotate(0)', display: 'inline-block' }}>+</span>
              </button>
              {open===i && <div style={{ padding: '0 24px 20px', fontSize: 14, color: 'rgba(255,255,255,0.48)', lineHeight: 1.75 }}>{f.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}