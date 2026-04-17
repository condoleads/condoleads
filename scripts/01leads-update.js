// scripts/01leads-update.js
// 01leads.com pricing + messaging overhaul
// Surgical file rewrites — read, modify, write atomically

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const Z = path.join(ROOT, 'app', 'zerooneleads');

function write(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓ Wrote ${path.relative(ROOT, filePath)}`);
}

// ============================================================
// 1. Hero.tsx — CTA + tagline + stats
// ============================================================
{
  const file = path.join(Z, 'components', 'Hero.tsx');
  let c = fs.readFileSync(file, 'utf8');

  // Tagline: WALLiam → 01leads AI
  c = c.replace(
    'WALLiam AI captures every lead, qualifies every buyer, estimates every home value — and delivers a personalized plan before your agent even picks up the phone.',
    '01leads AI captures every lead, qualifies every buyer, estimates every home value — and delivers a personalized plan before your agent even picks up the phone.'
  );

  // CTA button: Get Started → Book Discovery Call, link to /contact
  c = c.replace(
    `<a href="#pricing" style={{ padding: '15px 36px', borderRadius: 100, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 16, fontWeight: 800, textDecoration: 'none', boxShadow: '0 8px 40px rgba(59,130,246,0.45)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 50px rgba(59,130,246,0.6)' }}     
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 40px rgba(59,130,246,0.45)' }}        
          >Get Started — $500 Setup</a>`,
    `<a href="/contact" style={{ padding: '15px 36px', borderRadius: 100, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 16, fontWeight: 800, textDecoration: 'none', boxShadow: '0 8px 40px rgba(59,130,246,0.45)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 50px rgba(59,130,246,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 40px rgba(59,130,246,0.45)' }}
          >Book Discovery Call</a>`
  );

  // Stats: 68000+ GTA Listings → 1M+ GTA Listings
  c = c.replace(
    `[{v:24,s:'/7',l:'Lead Capture'},{v:68000,s:'+',l:'GTA Listings'},{v:3,s:' min',l:'To Qualified Lead'},{v:0,s:' missed',l:'After-Hours Leads'}]`,
    `[{v:24,s:'/7',l:'Lead Capture'},{v:1,s:'M+',l:'GTA Listings'},{v:3,s:' min',l:'To Qualified Lead'},{v:0,s:' missed',l:'After-Hours Leads'}]`
  );

  write(file, c);
}

// ============================================================
// 2. Solution.tsx — WALLiam → 01leads AI
// ============================================================
{
  const file = path.join(Z, 'components', 'Solution.tsx');
  let c = fs.readFileSync(file, 'utf8');

  c = c.replace(
    `{ icon: '🤖', label: 'WALLiam engages' },`,
    `{ icon: '🤖', label: '01leads AI engages' },`
  );

  c = c.replace(
    `            Meet WALLiam —<br />
            <span style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>your team's AI real estate brain.</span>`,
    `            Meet 01leads AI —<br />
            <span style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>your team's real estate brain.</span>`
  );

  c = c.replace(
    `            WALLiam is an AI assistant embedded into your real estate website. It talks to every visitor, understands their needs, delivers a personalized plan — and hands you a qualified lead.`,
    `            01leads AI is embedded into your real estate website. It talks to every visitor, understands their needs, delivers a personalized plan — and hands you a qualified lead. All grounded in live GTA data — no hallucinations.`
  );

  write(file, c);
}

// ============================================================
// 3. Features.tsx — Full rewrite: Three AI Systems + Three Platform capabilities
// ============================================================
{
  const file = path.join(Z, 'components', 'Features.tsx');
  const next = `'use client'
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
            <div key={i} className="feat-card" style={{ padding: '28px', borderRadius: 24, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.3s ease', cursor: 'default', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(30px)', transitionDelay: \`\${i*0.08}s\` }}
              onMouseEnter={e => { e.currentTarget.style.background = \`rgba(\${colorRgb[f.color]},0.07)\`; e.currentTarget.style.borderColor = f.color+'40'; e.currentTarget.style.transform = 'translateY(-4px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <div style={{ width: 50, height: 50, borderRadius: 14, background: f.color+'18', border: \`1px solid \${f.color}30\`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 20 }}>{f.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10, color: '#fff' }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.42)', lineHeight: 1.75, margin: 0 }}>{f.body}</p>
            </div>
          ))}
          </div>
        </div>
      </div>
      <style>{\`
    .feat-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -24px; padding: 0 24px 16px; }
    .feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .feat-card { min-width: 0; }
    .feat-scroll::-webkit-scrollbar { display: none; }
    @media(max-width: 768px) {
      .feat-grid { grid-template-columns: repeat(6, 280px); width: max-content; }
      .feat-card { width: 280px; }
    }
  \`}</style>
    </section>
  )
}
`;
  write(file, next);
}

// ============================================================
// 4. HowItWorks.tsx — WALLiam → 01leads AI + RAG messaging in step 2/3
// ============================================================
{
  const file = path.join(Z, 'components', 'HowItWorks.tsx');
  let c = fs.readFileSync(file, 'utf8');

  c = c.replace(
    `{ n: '01', title: 'Visitor lands on your site', body: 'They browse properties, neighbourhoods or search for a home value. WALLiam is watching — ready to engage the moment they show intent.', color: '#3b82f6' },`,
    `{ n: '01', title: 'Visitor lands on your site', body: 'They browse properties, neighbourhoods or search for a home value. 01leads AI is watching — ready to engage the moment they show intent.', color: '#3b82f6' },`
  );

  c = c.replace(
    `{ n: '02', title: 'WALLiam starts the conversation', body: 'Naturally, intelligently. It asks the right questions, pulls live market data, and starts building their plan in real time.', color: '#8b5cf6' },`,
    `{ n: '02', title: '01leads AI starts the conversation', body: 'Naturally, intelligently. RAG-grounded responses pulled from real GTA listings and comparable sales — not generic web content. Every answer is data-backed.', color: '#8b5cf6' },`
  );

  c = c.replace(
    `{ n: '03', title: 'A personalized plan is delivered', body: 'Buyer gets market analysis, matching listings, offer strategy. Seller gets comparable sales, a valuation, and next steps. All in seconds.', color: '#06b6d4' },`,
    `{ n: '03', title: 'A personalized plan is delivered', body: 'Buyer gets market analysis, matching listings, offer strategy. Seller gets real comparable sales, a valuation, and next steps. Built on live data, delivered in seconds.', color: '#06b6d4' },`
  );

  write(file, c);
}

// ============================================================
// 5. Pricing.tsx — Full structural rewrite: new tiers, ranges, notes
// ============================================================
{
  const file = path.join(Z, 'components', 'Pricing.tsx');
  const next = `'use client'
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
            <div key={i} style={{ padding: '40px 36px', borderRadius: 24, position: 'relative', background: p.popular ? 'linear-gradient(135deg,rgba(139,92,246,0.12),rgba(59,130,246,0.07))' : 'rgba(255,255,255,0.02)', border: p.popular ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.06)', transform: p.popular ? 'scale(1.03)' : 'scale(1)', opacity: v ? 1 : 0, transition: \`all 0.6s ease \${i*0.12}s\` }}>
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
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: p.color+'18', border: \`1px solid \${p.color}38\`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
    <style>{\`
      .price-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; align-items: start; }
      @media(max-width:768px){ .price-grid { grid-template-columns: repeat(3,300px); width: max-content; } }
      .price-grid::-webkit-scrollbar { display: none; }
    \`}</style>
    </section>
  )
}
`;
  write(file, next);
}

// ============================================================
// 6. FAQ.tsx — Full rewrite: 16 entries, 3 groups
// ============================================================
{
  const file = path.join(Z, 'components', 'FAQ.tsx');
  const next = `'use client'
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
                  <div key={i} style={{ borderRadius: 16, overflow: 'hidden', background: open===i ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.02)', border: open===i ? '1px solid rgba(59,130,246,0.2)' : '1px solid rgba(255,255,255,0.05)', transition: 'all 0.3s ease', opacity: v ? 1 : 0, transitionDelay: \`\${i*0.03}s\` }}>
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
`;
  write(file, next);
}

// ============================================================
// 7. Footer.tsx — "Powered by WALLiam AI" → "Powered by 01leads AI"
// ============================================================
{
  const file = path.join(Z, 'components', 'Footer.tsx');
  let c = fs.readFileSync(file, 'utf8');

  c = c.replace(
    `Powered by WALLiam AI. The real estate platform that never sleeps.`,
    `Powered by 01leads AI. The real estate platform that never sleeps.`
  );

  write(file, c);
}

// ============================================================
// 8. FooterCTA.tsx — WALLiam references + CTA
// ============================================================
{
  const file = path.join(Z, 'components', 'FooterCTA.tsx');
  let c = fs.readFileSync(file, 'utf8');

  c = c.replace(
    `Every day without WALLiam is another day of midnight leads going cold, visitors bouncing without a trace, and competitors capturing the buyers that should have been yours.`,
    `Every day without 01leads AI is another day of midnight leads going cold, visitors bouncing without a trace, and competitors capturing the buyers that should have been yours.`
  );

  c = c.replace(
    `          <a href="https://walliam.ca" target="_blank" rel="noopener" style={{ padding: '16px 40px', borderRadius: 100, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff', fontSize: 16, fontWeight: 800, textDecoration: 'none', boxShadow: '0 8px 40px rgba(59,130,246,0.45)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 14px 50px rgba(59,130,246,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 8px 40px rgba(59,130,246,0.45)' }}
          >See WALLiam Live</a>
          <a href="#pricing" style={{ padding: '16px 40px', borderRadius: 100, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}
          >View Pricing</a>`,
    `          <a href="/contact" style={{ padding: '16px 40px', borderRadius: 100, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff', fontSize: 16, fontWeight: 800, textDecoration: 'none', boxShadow: '0 8px 40px rgba(59,130,246,0.45)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 14px 50px rgba(59,130,246,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 8px 40px rgba(59,130,246,0.45)' }}
          >Book Discovery Call</a>
          <a href="https://walliam.ca" target="_blank" rel="noopener" style={{ padding: '16px 40px', borderRadius: 100, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}
          >See it Live →</a>`
  );

  write(file, c);
}

// ============================================================
// 9. Nav.tsx — "Get Started" → "Book Discovery Call", link to /contact
// ============================================================
{
  const file = path.join(Z, 'components', 'Nav.tsx');
  let c = fs.readFileSync(file, 'utf8');

  c = c.replace(
    `          <a href="#pricing" style={{ padding: '8px 20px', borderRadius: 100, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 20px rgba(59,130,246,0.4)' }}>Get Started</a>`,
    `          <a href="/contact" style={{ padding: '8px 20px', borderRadius: 100, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 20px rgba(59,130,246,0.4)' }}>Book Call</a>`
  );

  write(file, c);
}

// ============================================================
// 10. contact/page.tsx — Update plan dropdown, WALLiam references
// ============================================================
{
  const file = path.join(Z, 'contact', 'page.tsx');
  let c = fs.readFileSync(file, 'utf8');

  c = c.replace(
    `Interested in WALLiam for your team? Fill out the form and we'll get back to you within 24 hours.`,
    `Interested in 01leads AI for your team? Fill out the form and we'll get back to you within 24 hours. All clients subject to discovery call and approval.`
  );

  c = c.replace(
    `                <option value="">Select a plan</option>
                <option value="Solo Agent">Solo Agent — $500 setup + $999/mo</option>
                <option value="Team / Brokerage">Team / Brokerage — $1,000 setup + $3,000+/mo</option>
                <option value="Enterprise">Enterprise — Custom</option>`,
    `                <option value="">Select a plan</option>
                <option value="Solo Agent">Solo Agent — $3,500 setup + $2,500-$5,000/mo</option>
                <option value="Team / Brokerage">Team / Brokerage — $5,000 setup + $5,000-$10,000/mo</option>
                <option value="Enterprise">Enterprise — Custom (100+ agents)</option>`
  );

  write(file, c);
}

// ============================================================
// 11. Legal pages — Fix broken duplicate <div> wrapper + update WALLiam refs
// ============================================================

// refund-policy — already clean of WALLiam, just fix double div
{
  const file = path.join(Z, 'refund-policy', 'page.tsx');
  let c = fs.readFileSync(file, 'utf8');

  c = c.replace(
    `    <div style={{ background: '#020812', minHeight: '100vh' }}>
    <div style={{ background: '#020812', minHeight: '100vh' }}>
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '120px 24px', color: '#fff' }}>`,
    `    <div style={{ background: '#020812', minHeight: '100vh' }}>
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '120px 24px', color: '#fff' }}>`
  );

  c = c.replace(
    `    </div>
    </div>
    </div>
  )`,
    `    </div>
    </div>
  )`
  );

  write(file, c);
}

// terms-of-service — WALLiam → 01leads AI + fix double div
{
  const file = path.join(Z, 'terms-of-service', 'page.tsx');
  let c = fs.readFileSync(file, 'utf8');

  c = c.replace(
    `        01leads provides an AI-powered real estate lead capture platform ("WALLiam") as a software-as-a-service (SaaS) product. The service includes AI chat, lead capture, market data display, and agent notification features for real estate professionals in the Greater Toronto Area.`,
    `        01leads provides an AI-powered real estate lead capture platform ("01leads AI") as a software-as-a-service (SaaS) product. The service includes AI chat, AI-generated buyer and seller plans, AI home valuation (Estimator), lead capture, market data display, and agent notification features for licensed real estate professionals and brokerages. All clients are onboarded through a consultative discovery process and are subject to 01leads approval.`
  );

  c = c.replace(
    `        All prices are in USD. A one-time setup fee is charged upon signup. Monthly subscription fees are billed in advance. The first month of service is provided free of charge. Continued use after the free period constitutes acceptance of recurring monthly billing.`,
    `        All prices are in USD. A setup fee is charged upon signup which includes full onboarding and the first month of service. Monthly subscription billing begins in month two. Exact pricing is determined during the discovery call based on agent count, traffic volume, and service requirements.`
  );

  c = c.replace(
    `    <div style={{ background: '#020812', minHeight: '100vh' }}>
    <div style={{ background: '#020812', minHeight: '100vh' }}>
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '120px 24px', color: '#fff' }}>`,
    `    <div style={{ background: '#020812', minHeight: '100vh' }}>
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '120px 24px', color: '#fff' }}>`
  );

  c = c.replace(
    `    </div>
    </div>
    </div>
  )`,
    `    </div>
    </div>
  )`
  );

  write(file, c);
}

// privacy-policy — WALLiam → 01leads AI + fix double div
{
  const file = path.join(Z, 'privacy-policy', 'page.tsx');
  let c = fs.readFileSync(file, 'utf8');

  c = c.replace(
    `        We collect information provided directly by users of the WALLiam platform, including name, email address, phone number, and real estate intent (buying or selling). We also collect usage data such as pages visited and interactions with the AI assistant.`,
    `        We collect information provided directly by users of the 01leads AI platform, including name, email address, phone number, and real estate intent (buying or selling). We also collect usage data such as pages visited and interactions with the AI assistant.`
  );

  c = c.replace(
    `    <div style={{ background: '#020812', minHeight: '100vh' }}>
    <div style={{ background: '#020812', minHeight: '100vh' }}>
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '120px 24px', color: '#fff' }}>`,
    `    <div style={{ background: '#020812', minHeight: '100vh' }}>
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '120px 24px', color: '#fff' }}>`
  );

  c = c.replace(
    `    </div>
    </div>
    </div>
  )`,
    `    </div>
    </div>
  )`
  );

  write(file, c);
}

console.log('\n✓ All 01leads.com updates complete.');
console.log('Next: run "npx tsc --noEmit" to validate, then "npm run dev" to test.');