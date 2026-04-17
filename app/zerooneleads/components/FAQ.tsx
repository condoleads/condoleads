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
  // Product understanding
  { group: 'Product', q: 'How does 01leads AI actually work?', a: 'Three AI systems (Chat, Plans, Estimator) all built on RAG — Retrieval-Augmented Generation. Before the AI answers, it pulls verified data from our live GTA database: real listings, real comparable sales, real neighbourhood trends. No hallucinations, no guessing — real answers from real data.' },
  { group: 'Product', q: "What's the difference between AI Chat, AI Plans, and AI Estimator?", a: 'AI Chat is the conversational agent answering anything about real estate. AI Plans are full personalized strategies for buyers (target area, listings, offer strategy) and sellers (comps, valuation, next steps). AI Estimator is specifically for home valuations based on real comparable sales. All three share one platform, one credit system, one VIP flow.' },
  { group: 'Product', q: 'What stops someone from using the AI for free forever?', a: 'A credit system you control. Each visitor gets a configurable number of free AI interactions across three separate credit pools (Chat, Plans, Estimator). Once credits run out, they must register or request VIP access — which you approve.' },
  { group: 'Product', q: 'What is VIP access and how does it work?', a: 'Serious prospects can request VIP access for more AI credits. Your agent receives an email with the request, approves or declines, and the visitor is automatically notified. You are in the loop for every serious lead — no one slips through unnoticed.' },
  { group: 'Product', q: 'How do I control how much AI people get for free?', a: 'Every setting is configurable: free messages before registration, auto-approve limits, manual approval thresholds, hard caps. You decide the balance between generosity (better UX) and conversion (more registered leads).' },
  { group: 'Product', q: 'Where does the GTA market data come from?', a: 'Our database covers over 1 million GTA listings (active and historical) across every building, community, municipality, area, and neighbourhood. Condos and homes tracked separately, updated daily. Specifics of our data pipeline covered on the discovery call.' },
  // Commercial
  { group: 'Commercial', q: 'How does approval work?', a: "Every client starts with a discovery call. We assess fit, scope, agent count, traffic volume, and service requirements. We approve businesses we believe we can serve well — we'd rather work with fewer, great-fit clients than chase every inquiry." },
  { group: 'Commercial', q: 'Is setup really included in the first month?', a: 'Yes. The setup fee ($3,500 Solo, $5,000 Team/Brokerage) covers full onboarding, platform configuration, branding, domain setup, training calls, and your first month of service. Monthly billing begins month two at the agreed rate.' },
  { group: 'Commercial', q: 'Why is pricing a range?', a: 'Exact price determined on discovery call based on agent count, traffic volume, and service requirements.' },
  { group: 'Commercial', q: 'What about AI and advertising costs?', a: 'AI platform usage and ad platform costs (Google, Meta) are paid by you directly to those providers. You own the accounts, you control the spend. Details covered on the discovery call.' },
  { group: 'Commercial', q: 'Do you manage our ads?', a: "Optional. You can manage your own Google/Meta/social campaigns, or we can help at below-agency rates. Discussed on discovery call only if you're interested." },
  { group: 'Commercial', q: "What's the refund policy?", a: 'Setup fee is non-refundable once onboarding has begun (we commit real engineering and support hours upfront). Monthly subscription cancelable with 30 days written notice.' },
  { group: 'Commercial', q: 'Can I cancel anytime?', a: 'Yes, with 30 days written notice. No long-term contracts beyond the first month.' },
  // Operational
  { group: 'Operational', q: "How long until I'm live?", a: 'Solo agents typically go live in 3-5 business days after onboarding call. Team/Brokerage setups take 5-10 business days depending on complexity.' },
  { group: 'Operational', q: 'Can I use my own domain and branding?', a: 'Yes. Every client runs on their own domain with their own branding. 01leads AI operates silently in the background — your clients see your brand, not ours.' },
  { group: 'Operational', q: 'What happens when a lead comes in?', a: "Your agent receives an instant email with the lead's name, contact, intent (buying/selling), target area, budget, timeline, and the full AI-generated plan they received. Everything needed for a meaningful first conversation." },
]
export default function FAQ() {
  const { ref, v } = useInView()
  const [open, setOpen] = useState<number|null>(null)
  const groups: Record<string, typeof FAQS> = {}
  FAQS.forEach(f => { if (!groups[f.group]) groups[f.group] = []; groups[f.group].push(f) })
  const groupColors: Record<string, string> = { Product: '#3b82f6', Commercial: '#8b5cf6', Operational: '#06b6d4' }
  let idx = 0
  return (
    <section ref={ref} id="faq" style={{ padding: '120px 24px', background: '#030d1f' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 100, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20 }}>FAQ</div>
          <h2 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, letterSpacing: '-0.02em', color: '#fff'  }}>Questions? We have answers.</h2>
        </div>
        {Object.keys(groups).map(groupName => (
          <div key={groupName} style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: groupColors[groupName], letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 16, paddingLeft: 4 }}>{groupName}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {groups[groupName].map((f) => {
                const i = idx++
                return (
                  <div key={i} style={{ borderRadius: 16, overflow: 'hidden', background: open===i ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.02)', border: open===i ? '1px solid rgba(59,130,246,0.2)' : '1px solid rgba(255,255,255,0.05)', transition: 'all 0.3s ease', opacity: v ? 1 : 0, transitionDelay: `${i*0.03}s` }}>
                    <button onClick={() => setOpen(open===i ? null : i)} style={{ width: '100%', padding: '20px 24px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', textAlign: 'left' }}>{f.q}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 22, flexShrink: 0, transition: 'transform 0.3s', transform: open===i ? 'rotate(45deg)' : 'rotate(0)', display: 'inline-block' }}>+</span>
                    </button>
                    {open===i && <div style={{ padding: '0 24px 20px', fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75 }}>{f.a}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
