// scripts/01leads-solution-cinematic.js
// Full cinematic Solution section — animated branded AI widget

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const file = path.join(ROOT, 'app', 'zerooneleads', 'components', 'Solution.tsx');

const content = `'use client'
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

type Brand = {
  name: string
  subtitle: string
  avatar: string
  avatarStyle: 'photo' | 'logo'
  accent: string
  accentRgb: string
  question: string
  answer: string
}

const BRANDS: Brand[] = [
  {
    name: 'Ask John',
    subtitle: 'Your real estate AI',
    avatar: 'J',
    avatarStyle: 'photo',
    accent: '#3b82f6',
    accentRgb: '59,130,246',
    question: "What's a good 2BR condo under $700K in Leslieville?",
    answer: "I found 8 matches. Top pick: 123 King St E, listed $689K. Closed comps average $702K last 90 days — priced below market. Want to see all 8?",
  },
  {
    name: 'Ask Sarah Chen',
    subtitle: 'Team lead • Downtown Toronto',
    avatar: 'S',
    avatarStyle: 'photo',
    accent: '#8b5cf6',
    accentRgb: '139,92,246',
    question: "Thinking of selling my detached in Riverdale. What's it worth?",
    answer: "Riverdale detached has been strong. 14 comparable sales in the last 90 days averaged $1.42M. Based on your specs, estimated range: $1.38M – $1.52M. Shall I build a full report?",
  },
  {
    name: 'The Smith Team',
    subtitle: 'Boutique brokerage • Mississauga',
    avatar: 'ST',
    avatarStyle: 'logo',
    accent: '#06b6d4',
    accentRgb: '6,182,212',
    question: "Is now a good time to buy in Port Credit?",
    answer: "Port Credit condos are down 4.2% year-over-year — inventory is up and days on market rose to 38. Good negotiating position for buyers. I can send this week's best-priced listings.",
  },
  {
    name: 'Northbridge Realty',
    subtitle: 'Full-service brokerage • GTA',
    avatar: 'NR',
    avatarStyle: 'logo',
    accent: '#10b981',
    accentRgb: '16,185,129',
    question: "Parking premium on King West condos?",
    answer: "King West parking adds $52K on average to sale price — data pulled from 47 comparable sales this year. In buildings with limited parking, the premium climbs to $68K. Want the list?",
  },
]

function useTypewriter(text: string, speed: number = 22, startDelay: number = 0, trigger: number = 0) {
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

export default function Solution() {
  const { ref, v } = useInView()
  const [brandIdx, setBrandIdx] = useState(0)
  const [phase, setPhase] = useState<'fadeIn' | 'typing' | 'visible' | 'fadeOut'>('fadeIn')

  const brand = BRANDS[brandIdx]

  // Brand rotation orchestrator
  useEffect(() => {
    if (!v) return
    // Phase timings (in ms):
    // fadeIn: 0 -> 400ms
    // typing: 400ms -> ~6200ms (name + question + answer all complete)
    // visible: 6200ms -> 7400ms (brief pause to read)
    // fadeOut: 7400ms -> 8000ms (transition to next brand)
    setPhase('fadeIn')
    const t1 = setTimeout(() => setPhase('typing'), 400)
    const t2 = setTimeout(() => setPhase('visible'), 6200)
    const t3 = setTimeout(() => setPhase('fadeOut'), 7400)
    const t4 = setTimeout(() => {
      setBrandIdx((prev) => (prev + 1) % BRANDS.length)
    }, 8000)
    return () => { [t1, t2, t3, t4].forEach(clearTimeout) }
  }, [brandIdx, v])

  const isFading = phase === 'fadeIn' || phase === 'fadeOut'

  // Typewriters — each triggered off brandIdx
  const nameText = useTypewriter(brand.name, 40, 600, brandIdx)
  const questionText = useTypewriter(brand.question, 22, 1700, brandIdx)
  const answerText = useTypewriter(brand.answer, 16, 3600, brandIdx)

  return (
    <section ref={ref} id="solution" style={{
      padding: '140px 24px',
      background: \`linear-gradient(180deg,#020812 0%,#030d1f 100%)\`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Accent color wash — morphs with active brand */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 1100, height: 1100, borderRadius: '50%',
        background: \`radial-gradient(circle,rgba(\${brand.accentRgb},0.10) 0%,transparent 70%)\`,
        pointerEvents: 'none',
        transition: 'background 1.2s ease',
      }} />

      <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{
            display: 'inline-block', padding: '4px 14px', borderRadius: 100,
            background: \`rgba(\${brand.accentRgb},0.12)\`,
            border: \`1px solid rgba(\${brand.accentRgb},0.35)\`,
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
            <span style={{
              background: \`linear-gradient(135deg,\${brand.accent},#8b5cf6)\`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              transition: 'background 1s ease',
            }}>create your AI-powered brand.</span>
          </h2>

          <p style={{
            fontSize: 18, color: 'rgba(255,255,255,0.5)',
            maxWidth: 620, margin: '0 auto', lineHeight: 1.7,
            opacity: v ? 1 : 0,
            transition: 'opacity 0.7s ease 0.25s',
          }}>
            Don't rent someone else's chatbot. Launch your own AI —
            on your domain, in your voice, under your name.
          </p>
        </div>

        {/* THE CHAT WIDGET — the star of the show */}
        <div style={{
          maxWidth: 560, margin: '0 auto',
          opacity: v ? 1 : 0,
          transform: v ? 'translateY(0)' : 'translateY(40px)',
          transition: 'all 0.9s ease 0.35s',
        }}>
          <div style={{
            borderRadius: 24,
            background: \`linear-gradient(145deg, rgba(255,255,255,0.04), rgba(\${brand.accentRgb},0.04))\`,
            border: \`1px solid rgba(\${brand.accentRgb},0.25)\`,
            overflow: 'hidden',
            boxShadow: \`0 30px 90px rgba(\${brand.accentRgb},0.18), 0 0 0 1px rgba(255,255,255,0.03)\`,
            transition: 'all 1s ease',
          }}>
            {/* Widget header with avatar + name */}
            <div style={{
              padding: '20px 22px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', gap: 14,
              background: \`rgba(\${brand.accentRgb},0.06)\`,
              transition: 'background 0.8s ease',
            }}>
              {/* Avatar — morphs between brands */}
              <div style={{
                width: 46, height: 46, borderRadius: brand.avatarStyle === 'logo' ? 10 : '50%',
                background: \`linear-gradient(135deg,\${brand.accent},rgba(\${brand.accentRgb},0.6))\`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff',
                fontWeight: 900,
                fontSize: brand.avatarStyle === 'logo' ? 15 : 20,
                letterSpacing: brand.avatarStyle === 'logo' ? '-0.02em' : 0,
                fontFamily: brand.avatarStyle === 'logo' ? 'monospace' : 'inherit',
                boxShadow: \`0 4px 16px rgba(\${brand.accentRgb},0.4)\`,
                flexShrink: 0,
                opacity: isFading ? 0.3 : 1,
                transform: isFading ? 'scale(0.92)' : 'scale(1)',
                transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>{brand.avatar}</div>

              {/* Name + subtitle */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 17, fontWeight: 800, color: '#fff',
                  display: 'flex', alignItems: 'center', gap: 4,
                  minHeight: 24,
                }}>
                  <span>{nameText}</span>
                  {phase === 'typing' && nameText.length < brand.name.length && (
                    <span style={{ width: 2, height: 16, background: brand.accent, animation: 'blink 0.8s step-start infinite' }} />
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2, opacity: isFading ? 0 : 1, transition: 'opacity 0.5s' }}>
                  {brand.subtitle}
                </div>
              </div>

              {/* Online dot */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981', animation: 'onlinePulse 2s infinite' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>LIVE</span>
              </div>
            </div>

            {/* Chat body */}
            <div style={{
              padding: '24px 22px 18px',
              minHeight: 260,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              {/* User question bubble */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '12px 16px',
                  borderRadius: '18px 18px 4px 18px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.85)',
                  lineHeight: 1.55,
                  minHeight: 20,
                  opacity: questionText ? 1 : 0.3,
                  transition: 'opacity 0.4s',
                }}>
                  {questionText || '\\u2026'}
                  {phase === 'typing' && questionText.length > 0 && questionText.length < brand.question.length && (
                    <span style={{ display: 'inline-block', width: 2, height: 14, background: 'rgba(255,255,255,0.6)', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 0.8s step-start infinite' }} />
                  )}
                </div>
              </div>

              {/* AI answer bubble */}
              <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: \`linear-gradient(135deg,\${brand.accent},rgba(\${brand.accentRgb},0.6))\`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 11, fontWeight: 900, color: '#fff',
                  fontFamily: brand.avatarStyle === 'logo' ? 'monospace' : 'inherit',
                  boxShadow: \`0 2px 8px rgba(\${brand.accentRgb},0.3)\`,
                  transition: 'all 0.6s ease',
                }}>{brand.avatar}</div>
                <div style={{
                  maxWidth: '80%',
                  padding: '12px 16px',
                  borderRadius: '4px 18px 18px 18px',
                  background: \`linear-gradient(135deg, rgba(\${brand.accentRgb},0.12), rgba(\${brand.accentRgb},0.04))\`,
                  border: \`1px solid rgba(\${brand.accentRgb},0.2)\`,
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.92)',
                  lineHeight: 1.6,
                  minHeight: 20,
                  transition: 'all 0.6s ease',
                }}>
                  {answerText || (questionText === brand.question ? (
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: brand.accent, animation: 'typingDot 1.2s infinite', animationDelay: '0s' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: brand.accent, animation: 'typingDot 1.2s infinite', animationDelay: '0.2s' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: brand.accent, animation: 'typingDot 1.2s infinite', animationDelay: '0.4s' }} />
                    </span>
                  ) : '')}
                  {phase === 'typing' && answerText.length > 0 && answerText.length < brand.answer.length && (
                    <span style={{ display: 'inline-block', width: 2, height: 14, background: brand.accent, marginLeft: 2, verticalAlign: 'middle', animation: 'blink 0.8s step-start infinite' }} />
                  )}
                </div>
              </div>
            </div>

            {/* Widget footer */}
            <div style={{
              padding: '12px 22px 14px',
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
          <div style={{
            display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24,
          }}>
            {BRANDS.map((b, i) => (
              <div key={i} style={{
                width: i === brandIdx ? 32 : 8,
                height: 8, borderRadius: 4,
                background: i === brandIdx ? b.accent : 'rgba(255,255,255,0.12)',
                transition: 'all 0.6s ease',
                boxShadow: i === brandIdx ? \`0 0 12px \${b.accent}aa\` : 'none',
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
            fontWeight: 900,
            color: '#fff',
            letterSpacing: '-0.01em',
            marginBottom: 10,
          }}>
            Your brand. Your domain. Your AI.
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.42)', fontStyle: 'italic' }}>
            Remembered as the brokerage that led — not the one that followed.
          </div>
        </div>
      </div>

      <style>{\`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes onlinePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      \`}</style>
    </section>
  )
}
`;

fs.writeFileSync(file, content, 'utf8');
console.log(`✓ Wrote ${path.relative(ROOT, file)}`);
console.log('\n✓ Cinematic Solution section ready.');
console.log('Next: npx tsc --noEmit, then npm run dev to preview.');