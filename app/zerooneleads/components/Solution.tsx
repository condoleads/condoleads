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

type CardType = 'listings' | 'valuation' | 'chart' | 'stats'

type Brand = {
  name: string
  subtitle: string
  avatar: string
  avatarStyle: 'photo' | 'logo'
  accent: string
  accentRgb: string
  question: string
  answer: string
  cardType: CardType
}

const BRANDS: Brand[] = [
  {
    name: 'Ask John',
    subtitle: 'Your real estate AI',
    avatar: 'J',
    avatarStyle: 'photo',
    accent: '#3b82f6',
    accentRgb: '59,130,246',
    question: "2BR condo under $700K in Leslieville?",
    answer: "Found 8 matches. Top 3 below — priced below 90-day comps.",
    cardType: 'listings',
  },
  {
    name: 'Ask Sarah Chen',
    subtitle: 'Team lead • Downtown Toronto',
    avatar: 'S',
    avatarStyle: 'photo',
    accent: '#8b5cf6',
    accentRgb: '139,92,246',
    question: "What's my Riverdale detached worth?",
    answer: "Based on 14 comparable sales, estimated range:",
    cardType: 'valuation',
  },
  {
    name: 'The Smith Team',
    subtitle: 'Boutique brokerage • Mississauga',
    avatar: 'ST',
    avatarStyle: 'logo',
    accent: '#06b6d4',
    accentRgb: '6,182,212',
    question: "Is Port Credit condo market softening?",
    answer: "Yes — 12-month trend shows buyers gaining leverage:",
    cardType: 'chart',
  },
  {
    name: 'Northbridge Realty',
    subtitle: 'Full-service brokerage • GTA',
    avatar: 'NR',
    avatarStyle: 'logo',
    accent: '#10b981',
    accentRgb: '16,185,129',
    question: "Parking premium on King West condos?",
    answer: "Across 47 sales this year, parking adds significant value:",
    cardType: 'stats',
  },
]

function useTypewriter(text: string, speed: number, startDelay: number, trigger: number) {
  const [out, setOut] = useState('')
  useEffect(() => {
    setOut('')
    const startTimer = setTimeout(() => {
      let i = 0
      const id = setInterval(() => {
        if (i < text.length) {
          setOut(text.slice(0, i + 1))
          i++
        } else {
          clearInterval(id)
        }
      }, speed)
      return () => clearInterval(id)
    }, startDelay)
    return () => clearTimeout(startTimer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])
  return out
}

function useCountUp(target: number, duration: number, trigger: number, startDelay: number) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    const startTimer = setTimeout(() => {
      const steps = 40
      const stepValue = target / steps
      let current = 0
      const id = setInterval(() => {
        current += stepValue
        if (current >= target) { setN(target); clearInterval(id) }
        else setN(Math.floor(current))
      }, duration / steps)
      return () => clearInterval(id)
    }, startDelay)
    return () => clearTimeout(startTimer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])
  return n
}

// ─── Card 1: Listings Grid ──────────────────────────────────
function ListingsCard({ accent, accentRgb, trigger, show }: { accent: string; accentRgb: string; trigger: number; show: boolean }) {
  const price1 = useCountUp(689, 1200, trigger, 400)
  const price2 = useCountUp(675, 1200, trigger, 600)
  const price3 = useCountUp(698, 1200, trigger, 800)
  const listings = [
    { addr: '123 King St E', price: price1, actual: 689, beds: 2, baths: 2, sqft: 820, match: true },
    { addr: '456 Queen St E', price: price2, actual: 675, beds: 2, baths: 1, sqft: 780, match: false },
    { addr: '789 Broadview Ave', price: price3, actual: 698, beds: 2, baths: 2, sqft: 850, match: false },
  ]
  return (
    <div style={{
      marginTop: 10,
      display: 'flex', flexDirection: 'column', gap: 8,
      opacity: show ? 1 : 0,
      transition: 'opacity 0.5s ease',
    }}>
      {listings.map((l, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          background: `rgba(${accentRgb},0.05)`,
          border: `1px solid rgba(${accentRgb},0.18)`,
          borderRadius: 10,
          opacity: show ? 1 : 0,
          transform: show ? 'translateX(0)' : 'translateX(-8px)',
          transition: `all 0.4s ease ${0.1 + i * 0.12}s`,
        }}>
          {/* Thumbnail */}
          <div style={{
            width: 44, height: 44, borderRadius: 8,
            background: `linear-gradient(135deg,${accent}66,${accent}22)`,
            border: `1px solid rgba(${accentRgb},0.25)`,
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>🏢</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.addr}</span>
              {l.match && (
                <span style={{
                  fontSize: 8, fontWeight: 900, letterSpacing: '0.08em',
                  padding: '2px 6px', borderRadius: 4,
                  background: `${accent}`, color: '#fff',
                  animation: 'matchPulse 2s infinite',
                }}>MATCH</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
              <span>{l.beds}🛏</span>
              <span>{l.baths}🛁</span>
              <span>{l.sqft} sqft</span>
            </div>
          </div>
          <div style={{
            fontSize: 14, fontWeight: 900, color: accent,
            fontFamily: 'monospace', whiteSpace: 'nowrap',
          }}>${l.price}K</div>
        </div>
      ))}
    </div>
  )
}

// ─── Card 2: Valuation Gauge ────────────────────────────────
function ValuationCard({ accent, accentRgb, trigger, show }: { accent: string; accentRgb: string; trigger: number; show: boolean }) {
  const mid = useCountUp(1450, 1600, trigger, 400)
  const comps = useCountUp(14, 800, trigger, 1200)
  // Gauge: 0° = $1.30M (left), 180° = $1.60M (right), needle at $1.45M → 50%
  const needleAngle = Math.min(180, ((mid - 1300) / 300) * 180)
  return (
    <div style={{
      marginTop: 10,
      padding: '14px 16px',
      background: `rgba(${accentRgb},0.06)`,
      border: `1px solid rgba(${accentRgb},0.22)`,
      borderRadius: 12,
      opacity: show ? 1 : 0,
      transition: 'opacity 0.5s ease',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: `rgba(${accentRgb},1)`, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Estimated value range</div>

      {/* Semi-circle gauge */}
      <div style={{ position: 'relative', width: '100%', paddingTop: '50%', marginBottom: 12 }}>
        <svg viewBox="0 0 200 110" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {/* Background arc */}
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" strokeLinecap="round" />
          {/* Filled arc */}
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={accent} strokeWidth="10" strokeLinecap="round"
            strokeDasharray="251.2"
            strokeDashoffset={show ? 251.2 * (1 - needleAngle/180) : 251.2}
            style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
          {/* Needle */}
          <g style={{ transform: `rotate(${show ? needleAngle - 90 : -90}deg)`, transformOrigin: '100px 100px', transition: 'transform 1.4s cubic-bezier(0.4, 0, 0.2, 1)' }}>
            <line x1="100" y1="100" x2="100" y2="30" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="100" cy="100" r="6" fill={accent} />
            <circle cx="100" cy="100" r="3" fill="#fff" />
          </g>
        </svg>
      </div>

      {/* Range labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', marginBottom: 10 }}>
        <span>$1.30M</span>
        <span style={{ color: accent, fontWeight: 900, fontSize: 18 }}>${(mid/1000).toFixed(2)}M</span>
        <span>$1.60M</span>
      </div>

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
        Based on <span style={{ color: '#fff', fontWeight: 800 }}>{comps}</span> comparable sales, last 90 days
      </div>
    </div>
  )
}

// ─── Card 3: Mini Trend Chart ───────────────────────────────
function ChartCard({ accent, accentRgb, trigger, show }: { accent: string; accentRgb: string; trigger: number; show: boolean }) {
  // 12 months of price data — showing declining trend
  const data = [100, 102, 101, 103, 104, 102, 99, 98, 97, 96, 94, 95]
  const max = Math.max(...data)
  const min = Math.min(...data) - 2
  const dom = useCountUp(38, 1200, trigger, 600)

  return (
    <div style={{
      marginTop: 10,
      padding: '14px 16px',
      background: `rgba(${accentRgb},0.06)`,
      border: `1px solid rgba(${accentRgb},0.22)`,
      borderRadius: 12,
      opacity: show ? 1 : 0,
      transition: 'opacity 0.5s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: '0.12em', textTransform: 'uppercase' }}>12-Month Trend</div>
        <div style={{
          padding: '3px 8px', borderRadius: 100,
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.35)',
          fontSize: 10, fontWeight: 800, color: '#ef4444',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          ↓ 4.2%
        </div>
      </div>

      {/* Bar chart */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60, marginBottom: 10 }}>
        {data.map((val, i) => {
          const pct = ((val - min) / (max - min)) * 100
          const isLast = i === data.length - 1
          return (
            <div key={i} style={{
              flex: 1,
              height: show ? `${pct}%` : '0%',
              background: isLast
                ? `linear-gradient(180deg,${accent},${accent}66)`
                : `linear-gradient(180deg,rgba(${accentRgb},0.5),rgba(${accentRgb},0.15))`,
              borderRadius: '3px 3px 0 0',
              transition: `height 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${0.2 + i * 0.06}s`,
              boxShadow: isLast ? `0 0 8px ${accent}88` : 'none',
            }} />
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
        <span>APR '25</span>
        <span>MAR '26</span>
      </div>

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', textAlign: 'center', borderTop: 'rgba(255,255,255,0.05) solid 1px', paddingTop: 8 }}>
        <span style={{ color: '#fff', fontWeight: 800 }}>{dom} days</span> on market <span style={{ color: accent }}>(↑ from 22)</span>
      </div>
    </div>
  )
}

// ─── Card 4: Stat Comparison ────────────────────────────────
function StatsCard({ accent, accentRgb, trigger, show }: { accent: string; accentRgb: string; trigger: number; show: boolean }) {
  const withP = useCountUp(820, 1400, trigger, 400)
  const withoutP = useCountUp(768, 1400, trigger, 600)
  const diff = useCountUp(52, 1200, trigger, 1100)
  const sales = useCountUp(47, 800, trigger, 1400)

  return (
    <div style={{
      marginTop: 10,
      padding: '14px 16px',
      background: `rgba(${accentRgb},0.06)`,
      border: `1px solid rgba(${accentRgb},0.22)`,
      borderRadius: 12,
      opacity: show ? 1 : 0,
      transition: 'opacity 0.5s ease',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Parking Premium Analysis</div>

      {/* With parking */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>With parking</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>${withP}K</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: show ? '100%' : '0%',
            background: `linear-gradient(90deg,${accent},${accent}aa)`,
            borderRadius: 4,
            transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1) 0.4s',
            boxShadow: `0 0 10px ${accent}88`,
          }} />
        </div>
      </div>

      {/* Without parking */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Without parking</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>${withoutP}K</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: show ? '93%' : '0%',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 4,
            transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1) 0.6s',
          }} />
        </div>
      </div>

      {/* Differential callout */}
      <div style={{
        padding: '10px 12px',
        background: `rgba(${accentRgb},0.15)`,
        border: `1px solid rgba(${accentRgb},0.35)`,
        borderRadius: 8,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: `rgba(${accentRgb},1)`, fontWeight: 700, letterSpacing: '0.05em' }}>↑ PARKING PREMIUM</span>
        <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>+${diff}K</span>
      </div>

      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 10 }}>
        Based on <span style={{ color: '#fff', fontWeight: 700 }}>{sales}</span> sales • 2026 YTD
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────
export default function Solution() {
  const { ref, v } = useInView()
  const [brandIdx, setBrandIdx] = useState(0)
  const [phase, setPhase] = useState<'fadeIn' | 'typing' | 'visible' | 'fadeOut'>('fadeIn')

  const brand = BRANDS[brandIdx]

  // Extended timeline to accommodate rich cards: 11 seconds per brand
  useEffect(() => {
    if (!v) return
    setPhase('fadeIn')
    const t1 = setTimeout(() => setPhase('typing'), 400)
    const t2 = setTimeout(() => setPhase('visible'), 9000)
    const t3 = setTimeout(() => setPhase('fadeOut'), 10400)
    const t4 = setTimeout(() => {
      setBrandIdx((prev) => (prev + 1) % BRANDS.length)
    }, 11000)
    return () => { [t1, t2, t3, t4].forEach(clearTimeout) }
  }, [brandIdx, v])

  const isFading = phase === 'fadeIn' || phase === 'fadeOut'
  const showCard = phase === 'typing' || phase === 'visible'

  const nameText = useTypewriter(brand.name, 40, 600, brandIdx)
  const questionText = useTypewriter(brand.question, 22, 1700, brandIdx)
  const answerText = useTypewriter(brand.answer, 16, 3400, brandIdx)
  const cardShouldShow = showCard && answerText.length >= Math.min(20, brand.answer.length - 5)

  return (
    <section ref={ref} id="solution" style={{
      padding: '140px 24px',
      background: 'linear-gradient(180deg,#020812 0%,#030d1f 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Accent color wash */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 1200, height: 1200, borderRadius: '50%',
        background: `radial-gradient(circle,rgba(${brand.accentRgb},0.10) 0%,transparent 70%)`,
        pointerEvents: 'none',
        transition: 'background 1.2s ease',
      }} />

      <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{
            display: 'inline-block', padding: '4px 14px', borderRadius: 100,
            background: `rgba(${brand.accentRgb},0.12)`,
            border: `1px solid rgba(${brand.accentRgb},0.35)`,
            fontSize: 11, fontWeight: 700,
            color: brand.accent,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            marginBottom: 22,
            transition: 'all 0.8s ease',
            opacity: v ? 1 : 0,
          }}>The Opportunity</div>

          <h2 style={{
            fontSize: 'clamp(30px,5.5vw,64px)',
            fontWeight: 900, letterSpacing: '-0.02em',
            lineHeight: 1.05, marginBottom: 20, color: '#fff',
            opacity: v ? 1 : 0,
            transform: v ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 0.7s ease 0.1s',
          }}>
            With 01leads,<br />
            <span
              className="brand-gradient-text"
              style={{
                background: 'linear-gradient(135deg,#3b82f6 0%,#8b5cf6 50%,#06b6d4 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                color: 'transparent',
                display: 'inline-block',
              }}
            >create your AI-powered brand.</span>
          </h2>

          <p style={{
            fontSize: 18, color: 'rgba(255,255,255,0.5)',
            maxWidth: 620, margin: '0 auto', lineHeight: 1.7,
            opacity: v ? 1 : 0,
            transition: 'opacity 0.7s ease 0.25s',
          }}>
            Launch your brand with an AI lead magnet.<br />
            Your own domain. Your name. Your leads.
          </p>

          <div style={{
            marginTop: 28,
            opacity: v ? 1 : 0,
            transition: 'opacity 0.7s ease 0.4s',
          }}>
            <a href="https://walliam.ca" target="_blank" rel="noopener" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '13px 30px', borderRadius: 100,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              textDecoration: 'none', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.18)' }}
            >See it Live →</a>
          </div>
        </div>

        {/* THE CHAT WIDGET */}
        <div style={{
          maxWidth: 600, margin: '0 auto',
          opacity: v ? 1 : 0,
          transform: v ? 'translateY(0)' : 'translateY(40px)',
          transition: 'all 0.9s ease 0.35s',
        }}>
          <div style={{
            borderRadius: 24,
            background: `linear-gradient(145deg, rgba(255,255,255,0.04), rgba(${brand.accentRgb},0.04))`,
            border: `1px solid rgba(${brand.accentRgb},0.25)`,
            overflow: 'hidden',
            boxShadow: `0 30px 90px rgba(${brand.accentRgb},0.18), 0 0 0 1px rgba(255,255,255,0.03)`,
            transition: 'all 1s ease',
          }}>
            {/* Widget header */}
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', gap: 14,
              background: `rgba(${brand.accentRgb},0.06)`,
              transition: 'background 0.8s ease',
            }}>
              <div style={{
                width: 44, height: 44,
                borderRadius: brand.avatarStyle === 'logo' ? 10 : '50%',
                background: `linear-gradient(135deg,${brand.accent},rgba(${brand.accentRgb},0.6))`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 900,
                fontSize: brand.avatarStyle === 'logo' ? 14 : 20,
                letterSpacing: brand.avatarStyle === 'logo' ? '-0.02em' : 0,
                fontFamily: brand.avatarStyle === 'logo' ? 'monospace' : 'inherit',
                boxShadow: `0 4px 16px rgba(${brand.accentRgb},0.4)`,
                flexShrink: 0,
                opacity: isFading ? 0.3 : 1,
                transform: isFading ? 'scale(0.92)' : 'scale(1)',
                transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>{brand.avatar}</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 16, fontWeight: 800, color: '#fff',
                  display: 'flex', alignItems: 'center', gap: 4, minHeight: 22,
                }}>
                  <span>{nameText}</span>
                  {phase === 'typing' && nameText.length < brand.name.length && (
                    <span style={{ width: 2, height: 15, background: brand.accent, animation: 'blink 0.8s step-start infinite' }} />
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, opacity: isFading ? 0 : 1, transition: 'opacity 0.5s' }}>
                  {brand.subtitle}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981', animation: 'onlinePulse 2s infinite' }} />
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.1em' }}>LIVE</span>
              </div>
            </div>

            {/* Chat body */}
            <div style={{
              padding: '20px 20px 16px',
              minHeight: 340,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {/* User question */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  maxWidth: '80%', padding: '11px 15px',
                  borderRadius: '18px 18px 4px 18px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 13, color: 'rgba(255,255,255,0.88)',
                  lineHeight: 1.55, minHeight: 18,
                  opacity: questionText ? 1 : 0.3,
                  transition: 'opacity 0.4s',
                }}>
                  {questionText || '\u2026'}
                  {phase === 'typing' && questionText.length > 0 && questionText.length < brand.question.length && (
                    <span style={{ display: 'inline-block', width: 2, height: 13, background: 'rgba(255,255,255,0.6)', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 0.8s step-start infinite' }} />
                  )}
                </div>
              </div>

              {/* AI answer + rich card */}
              <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: `linear-gradient(135deg,${brand.accent},rgba(${brand.accentRgb},0.6))`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 10, fontWeight: 900, color: '#fff',
                  fontFamily: brand.avatarStyle === 'logo' ? 'monospace' : 'inherit',
                  boxShadow: `0 2px 8px rgba(${brand.accentRgb},0.3)`,
                  transition: 'all 0.6s ease',
                }}>{brand.avatar}</div>

                <div style={{ flex: 1, maxWidth: 'calc(100% - 40px)' }}>
                  <div style={{
                    padding: '11px 15px',
                    borderRadius: '4px 18px 18px 18px',
                    background: `linear-gradient(135deg, rgba(${brand.accentRgb},0.12), rgba(${brand.accentRgb},0.04))`,
                    border: `1px solid rgba(${brand.accentRgb},0.2)`,
                    fontSize: 13, color: 'rgba(255,255,255,0.92)',
                    lineHeight: 1.6, minHeight: 18,
                    transition: 'all 0.6s ease',
                  }}>
                    {answerText || (questionText === brand.question ? (
                      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: brand.accent, animation: 'typingDot 1.2s infinite', animationDelay: '0s' }} />
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: brand.accent, animation: 'typingDot 1.2s infinite', animationDelay: '0.2s' }} />
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: brand.accent, animation: 'typingDot 1.2s infinite', animationDelay: '0.4s' }} />
                      </span>
                    ) : '')}
                    {phase === 'typing' && answerText.length > 0 && answerText.length < brand.answer.length && (
                      <span style={{ display: 'inline-block', width: 2, height: 13, background: brand.accent, marginLeft: 2, verticalAlign: 'middle', animation: 'blink 0.8s step-start infinite' }} />
                    )}
                  </div>

                  {/* Rich card — switches based on brand type */}
                  {brand.cardType === 'listings' && <ListingsCard accent={brand.accent} accentRgb={brand.accentRgb} trigger={brandIdx} show={cardShouldShow} />}
                  {brand.cardType === 'valuation' && <ValuationCard accent={brand.accent} accentRgb={brand.accentRgb} trigger={brandIdx} show={cardShouldShow} />}
                  {brand.cardType === 'chart' && <ChartCard accent={brand.accent} accentRgb={brand.accentRgb} trigger={brandIdx} show={cardShouldShow} />}
                  {brand.cardType === 'stats' && <StatsCard accent={brand.accent} accentRgb={brand.accentRgb} trigger={brandIdx} show={cardShouldShow} />}
                </div>
              </div>
            </div>

            {/* Widget footer */}
            <div style={{
              padding: '12px 20px 14px',
              borderTop: '1px solid rgba(255,255,255,0.04)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(0,0,0,0.15)',
            }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
                Powered by <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 800 }}>01leads</span>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
                GTA • Live Data
              </div>
            </div>
          </div>

          {/* Brand indicator dots */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24 }}>
            {BRANDS.map((b, i) => (
              <div key={i} style={{
                width: i === brandIdx ? 32 : 8,
                height: 8, borderRadius: 4,
                background: i === brandIdx ? b.accent : 'rgba(255,255,255,0.12)',
                transition: 'all 0.6s ease',
                boxShadow: i === brandIdx ? `0 0 12px ${b.accent}aa` : 'none',
              }} />
            ))}
          </div>
        </div>

        {/* Bottom statement */}
        <div style={{
          marginTop: 80, textAlign: 'center',
          opacity: v ? 1 : 0,
          transition: 'opacity 1s ease 0.6s',
        }}>
          <div style={{
            fontSize: 'clamp(20px,3vw,28px)',
            fontWeight: 900, color: '#fff',
            letterSpacing: '-0.01em', marginBottom: 10,
          }}>
            Your brand. Your domain. Your AI.
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.42)', fontStyle: 'italic' }}>
            Remembered as the brokerage that led — not the one that followed.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes onlinePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes matchPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.06); opacity: 0.85; }
        }
        .brand-gradient-text {
          background-size: 200% 200%;
          animation: gradientShift 8s ease infinite;
        }
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
    </section>
  )
}
