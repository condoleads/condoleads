// scripts/01leads-mls-fusion.js
// Creates MLSFusion component + wires it into page.tsx between Solution and Features

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// ============================================================
// 1. Create MLSFusion.tsx
// ============================================================
const mlsFusionContent = `'use client'
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

type Scenario = {
  question: string
  mlsStream: string[]
  aiReasoning: string[]
  chatgptAnswer: string
  fusedAnswer: string
  card: {
    badge: string
    title: string
    subtitle: string
    stats: { label: string; value: string }[]
  }
}

const SCENARIOS: Scenario[] = [
  {
    question: "What did 2BR condos sell for in Leslieville last month?",
    mlsStream: [
      "127 Boulton Ave · \$695K · 2BR/2BA · Sold Mar 14",
      "89 Curzon St · \$718K · 2BR/2BA · Sold Mar 22",
      "412 Pape Ave · \$682K · 2BR/1BA · Sold Mar 8",
      "56 Eastern Ave · \$735K · 2BR/2BA · Sold Mar 29",
      "203 Carlaw Ave · \$689K · 2BR/2BA · Sold Mar 18",
      "178 Booth Ave · \$712K · 2BR/2BA · Sold Mar 26",
      "95 Bertmount Ave · \$705K · 2BR/2BA · Sold Mar 11",
      "341 Logan Ave · \$698K · 2BR/1BA · Sold Mar 24",
    ],
    aiReasoning: [
      "filtering: Leslieville · 2BR · last 30d",
      "cross-checking status: Closed",
      "calculating median sale price",
      "ranking top match by proximity",
      "formatting final answer",
    ],
    chatgptAnswer: "I don't have real-time access to MLS sales data. Generally, 2BR condos in Leslieville range widely depending on the building and date...",
    fusedAnswer: "8 condos sold last month. Median \$702K. Top match:",
    card: {
      badge: "CLOSED · MAR 14",
      title: "127 Boulton Ave",
      subtitle: "2BR / 2BA · 820 sqft",
      stats: [
        { label: "Sold", value: "\$695K" },
        { label: "Asking", value: "\$689K" },
        { label: "DOM", value: "11 days" },
      ],
    },
  },
  {
    question: "What's a detached in Riverdale worth right now?",
    mlsStream: [
      "124 Logan Ave · \$1.48M · 3BR/2BA · Sold Feb 18",
      "67 Simpson Ave · \$1.52M · 4BR/3BA · Sold Feb 27",
      "245 Broadview Ave · \$1.41M · 3BR/2BA · Sold Mar 4",
      "89 Langley Ave · \$1.55M · 4BR/3BA · Sold Mar 12",
      "156 De Grassi St · \$1.39M · 3BR/2BA · Sold Mar 20",
      "78 Ivy Ave · \$1.46M · 3BR/2BA · Sold Mar 26",
      "203 Jones Ave · \$1.44M · 3BR/2BA · Sold Feb 8",
    ],
    aiReasoning: [
      "matching: Riverdale · detached · last 90d",
      "normalizing for lot size + bedrooms",
      "computing valuation range",
      "assessing market direction",
      "building estimate band",
    ],
    chatgptAnswer: "I can't access current real estate listings or recent sales. Riverdale prices typically vary, but for an accurate valuation you'd need to consult a realtor...",
    fusedAnswer: "Based on 14 comparable sales, estimated range:",
    card: {
      badge: "VALUATION · 14 COMPS",
      title: "Riverdale Detached",
      subtitle: "3BR / 2BA · Typical lot",
      stats: [
        { label: "Low", value: "\$1.38M" },
        { label: "Mid", value: "\$1.45M" },
        { label: "High", value: "\$1.52M" },
      ],
    },
  },
  {
    question: "Is the Port Credit condo market softening?",
    mlsStream: [
      "Apr '25 avg \$718K · 24 days · SNLR 42%",
      "May '25 avg \$722K · 26 days · SNLR 40%",
      "Jun '25 avg \$714K · 28 days · SNLR 38%",
      "Jul '25 avg \$708K · 31 days · SNLR 36%",
      "Aug '25 avg \$702K · 33 days · SNLR 34%",
      "Sep '25 avg \$697K · 35 days · SNLR 33%",
      "Oct '25 avg \$691K · 36 days · SNLR 32%",
      "Nov '25 avg \$688K · 37 days · SNLR 31%",
      "Mar '26 avg \$687K · 38 days · SNLR 31%",
    ],
    aiReasoning: [
      "pulling: Port Credit condo · 12 months",
      "computing price & DOM trendlines",
      "checking sales-to-listings ratio",
      "identifying direction",
      "summarizing for buyer context",
    ],
    chatgptAnswer: "I don't have current market data. Condo markets generally fluctuate based on interest rates and inventory. For up-to-date trends, consider...",
    fusedAnswer: "Yes. 12-month trend: buyers gaining leverage.",
    card: {
      badge: "TREND · 12 MONTHS",
      title: "Port Credit Condos",
      subtitle: "Buyer's market emerging",
      stats: [
        { label: "YoY Price", value: "↓ 4.2%" },
        { label: "DOM", value: "38 days" },
        { label: "SNLR", value: "31%" },
      ],
    },
  },
]

// ─── Typewriter hook ────────────────────────────────────────
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

// ─── MLS Data Stream (left column) ──────────────────────────
function MLSStream({ lines, trigger, show }: { lines: string[]; trigger: number; show: boolean }) {
  const [visibleCount, setVisibleCount] = useState(0)
  useEffect(() => {
    setVisibleCount(0)
    if (!show) return
    let i = 0
    const id = setInterval(() => {
      i++
      setVisibleCount(i)
      if (i >= lines.length) clearInterval(id)
    }, 350)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, show])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', maxHeight: 180 }}>
      {lines.slice(0, visibleCount).map((line, i) => (
        <div key={\`\${trigger}-\${i}\`} style={{
          padding: '7px 10px',
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.18)',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.7)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          animation: 'streamIn 0.3s ease',
        }}>{line}</div>
      ))}
    </div>
  )
}

// ─── AI Reasoning Stream (left column, below MLS) ──────────
function AIStream({ lines, trigger, show }: { lines: string[]; trigger: number; show: boolean }) {
  const [activeIdx, setActiveIdx] = useState(-1)
  useEffect(() => {
    setActiveIdx(-1)
    if (!show) return
    let i = 0
    const id = setInterval(() => {
      setActiveIdx(i)
      i++
      if (i >= lines.length) clearInterval(id)
    }, 600)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, show])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {lines.map((line, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          fontSize: 11,
          fontFamily: 'monospace',
          color: i <= activeIdx ? '#8b5cf6' : 'rgba(139,92,246,0.25)',
          transition: 'color 0.3s ease',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: i === activeIdx ? '#8b5cf6' : i < activeIdx ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.15)',
            boxShadow: i === activeIdx ? '0 0 8px #8b5cf6' : 'none',
            transition: 'all 0.3s ease',
            flexShrink: 0,
          }} />
          <span>{i <= activeIdx ? '▸ ' : '  '}{line}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Answer Card (fused output, center) ─────────────────────
function AnswerCard({ scenario, trigger, show }: { scenario: Scenario; trigger: number; show: boolean }) {
  return (
    <div style={{
      padding: '16px 18px',
      background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))',
      border: '1px solid rgba(16,185,129,0.35)',
      borderRadius: 14,
      opacity: show ? 1 : 0,
      transform: show ? 'translateY(0)' : 'translateY(12px)',
      transition: 'all 0.6s ease',
      boxShadow: show ? '0 12px 40px rgba(16,185,129,0.18)' : 'none',
    }}>
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        color: '#10b981',
        letterSpacing: '0.15em',
        marginBottom: 8,
      }}>{scenario.card.badge}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 3 }}>{scenario.card.title}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>{scenario.card.subtitle}</div>
      <div style={{ display: 'flex', gap: 16, paddingTop: 10, borderTop: '1px solid rgba(16,185,129,0.2)' }}>
        {scenario.card.stats.map((s, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginBottom: 2, textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────
export default function MLSFusion() {
  const { ref, v } = useInView()
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'question' | 'streaming' | 'reasoning' | 'converging' | 'answer' | 'hold'>('question')

  const scenario = SCENARIOS[idx]

  // Phase orchestration — 12s per scenario
  useEffect(() => {
    if (!v) return
    setPhase('question')
    const t1 = setTimeout(() => setPhase('streaming'), 1200)
    const t2 = setTimeout(() => setPhase('reasoning'), 4500)
    const t3 = setTimeout(() => setPhase('converging'), 7500)
    const t4 = setTimeout(() => setPhase('answer'), 8500)
    const t5 = setTimeout(() => setPhase('hold'), 11000)
    const t6 = setTimeout(() => setIdx(prev => (prev + 1) % SCENARIOS.length), 12000)
    return () => { [t1, t2, t3, t4, t5, t6].forEach(clearTimeout) }
  }, [idx, v])

  const questionText = useTypewriter(scenario.question, 28, 200, idx)
  const chatgptText = useTypewriter(scenario.chatgptAnswer, 22, 1800, idx)
  const fusedText = useTypewriter(scenario.fusedAnswer, 22, 8600, idx)

  const showMLS = phase !== 'question'
  const showReasoning = ['reasoning', 'converging', 'answer', 'hold'].includes(phase)
  const showConvergence = ['converging', 'answer', 'hold'].includes(phase)
  const showAnswer = ['answer', 'hold'].includes(phase)

  return (
    <section ref={ref} id="mls-fusion" style={{
      padding: '140px 24px',
      background: '#020812',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background decorative glows */}
      <div style={{
        position: 'absolute', top: '10%', left: '-10%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.07), transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '5%', right: '-10%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.07), transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            display: 'inline-block',
            padding: '4px 14px',
            borderRadius: 100,
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.3)',
            fontSize: 11,
            fontWeight: 700,
            color: '#10b981',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 22,
            opacity: v ? 1 : 0,
            transition: 'opacity 0.8s',
          }}>The Foundation</div>

          <h2 style={{
            fontSize: 'clamp(30px,5.5vw,58px)',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            marginBottom: 18,
            color: '#fff',
            opacity: v ? 1 : 0,
            transform: v ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 0.7s ease 0.1s',
          }}>
            Two things combined.<br />
            <span style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #10b981 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent',
              display: 'inline-block',
            }}>Only one vendor has both.</span>
          </h2>

          <p style={{
            fontSize: 17,
            color: 'rgba(255,255,255,0.5)',
            maxWidth: 640,
            margin: '0 auto',
            lineHeight: 1.65,
            opacity: v ? 1 : 0,
            transition: 'opacity 0.7s ease 0.25s',
          }}>
            01leads fuses live GTA MLS data with AI reasoning. That's why every answer is
            grounded in real sales — not invented. ChatGPT-style AI has only half the equation.
          </p>
        </div>

        {/* Question bar */}
        <div style={{
          maxWidth: 700,
          margin: '0 auto 40px',
          padding: '16px 22px',
          borderRadius: 14,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          opacity: v ? 1 : 0,
          transition: 'opacity 0.7s ease 0.4s',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14,
            flexShrink: 0,
          }}>❓</div>
          <div style={{
            flex: 1,
            fontSize: 15,
            color: 'rgba(255,255,255,0.9)',
            fontWeight: 600,
            minHeight: 22,
          }}>
            {questionText}
            {phase === 'question' && questionText.length < scenario.question.length && (
              <span style={{
                display: 'inline-block',
                width: 2, height: 16,
                background: '#3b82f6',
                marginLeft: 2,
                verticalAlign: 'middle',
                animation: 'blink 0.8s step-start infinite',
              }} />
            )}
          </div>
        </div>

        {/* Three-column fusion layout */}
        <div className="fusion-grid" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          maxWidth: 1000,
          margin: '0 auto',
          opacity: v ? 1 : 0,
          transition: 'opacity 0.8s ease 0.5s',
        }}>
          {/* LEFT — 01LEADS: MLS + AI fusion */}
          <div style={{
            padding: '24px 22px',
            borderRadius: 18,
            background: 'linear-gradient(180deg, rgba(59,130,246,0.06), rgba(139,92,246,0.04))',
            border: '1px solid rgba(59,130,246,0.25)',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              top: -10, left: 16,
              padding: '3px 10px',
              borderRadius: 100,
              background: '#020812',
              border: '1px solid rgba(59,130,246,0.4)',
              fontSize: 9,
              fontWeight: 900,
              color: '#3b82f6',
              letterSpacing: '0.15em',
            }}>01LEADS AI</div>

            {/* MLS Stream */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 8,
                fontSize: 10,
                fontWeight: 700,
                color: '#3b82f6',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}>
                <span>🗄</span> LIVE MLS FEED
                <span style={{
                  marginLeft: 'auto',
                  padding: '2px 7px',
                  borderRadius: 100,
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  color: '#10b981',
                  fontSize: 9,
                }}>● LIVE</span>
              </div>
              <MLSStream lines={scenario.mlsStream} trigger={idx} show={showMLS} />
            </div>

            {/* AI Reasoning */}
            <div style={{
              marginBottom: 14,
              paddingTop: 14,
              borderTop: '1px dashed rgba(255,255,255,0.1)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 8,
                fontSize: 10,
                fontWeight: 700,
                color: '#8b5cf6',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}>
                <span>🧠</span> AI REASONING
              </div>
              <AIStream lines={scenario.aiReasoning} trigger={idx} show={showReasoning} />
            </div>

            {/* Convergence indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
              opacity: showConvergence ? 1 : 0.2,
              transition: 'opacity 0.5s',
            }}>
              <div style={{
                padding: '8px 16px',
                borderRadius: 100,
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #10b981)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                boxShadow: showConvergence ? '0 0 20px rgba(139,92,246,0.5)' : 'none',
                transition: 'all 0.6s ease',
              }}>MLS + AI = 01leads</div>
            </div>

            {/* Fused Answer */}
            <div style={{
              padding: '14px 16px',
              borderRadius: 10,
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.25)',
              fontSize: 13,
              color: '#fff',
              fontWeight: 600,
              lineHeight: 1.5,
              marginBottom: showAnswer ? 14 : 0,
              opacity: fusedText || phase === 'hold' ? 1 : 0.3,
              transition: 'opacity 0.4s',
              minHeight: 40,
            }}>
              {fusedText}
              {phase === 'answer' && fusedText.length < scenario.fusedAnswer.length && (
                <span style={{
                  display: 'inline-block',
                  width: 2, height: 14,
                  background: '#10b981',
                  marginLeft: 2,
                  verticalAlign: 'middle',
                  animation: 'blink 0.8s step-start infinite',
                }} />
              )}
            </div>

            {showAnswer && <AnswerCard scenario={scenario} trigger={idx} show={showAnswer} />}
          </div>

          {/* RIGHT — CHATGPT-STYLE AI (dim) */}
          <div style={{
            padding: '24px 22px',
            borderRadius: 18,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            position: 'relative',
            opacity: 0.55,
            filter: 'grayscale(0.4)',
          }}>
            <div style={{
              position: 'absolute',
              top: -10, left: 16,
              padding: '3px 10px',
              borderRadius: 100,
              background: '#020812',
              border: '1px solid rgba(255,255,255,0.25)',
              fontSize: 9,
              fontWeight: 900,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.15em',
            }}>CHATGPT-STYLE AI</div>

            {/* No MLS badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 14,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.2)',
              fontSize: 10,
              fontWeight: 700,
              color: '#ef4444',
              letterSpacing: '0.08em',
            }}>
              <span>🚫</span> NO MLS FEED · NO REAL DATA
            </div>

            {/* AI Reasoning (generic, no data) */}
            <div style={{
              marginBottom: 14,
              paddingTop: 6,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 8,
                fontSize: 10,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.4)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}>
                <span>🧠</span> AI REASONING ONLY
              </div>
              <div style={{
                padding: '8px 10px',
                fontSize: 11,
                fontFamily: 'monospace',
                color: 'rgba(255,255,255,0.35)',
                fontStyle: 'italic',
              }}>
                ▸ no data to retrieve<br />
                ▸ generating from 2024 training<br />
                ▸ hedging with generalities
              </div>
            </div>

            {/* Answer */}
            <div style={{
              marginTop: 20,
              padding: '14px 16px',
              borderRadius: 10,
              background: 'rgba(239,68,68,0.04)',
              border: '1px solid rgba(239,68,68,0.15)',
              fontSize: 12,
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.6,
              fontStyle: 'italic',
              minHeight: 80,
            }}>
              {chatgptText}
              {phase === 'streaming' && chatgptText.length < scenario.chatgptAnswer.length && (
                <span style={{
                  display: 'inline-block',
                  width: 2, height: 13,
                  background: 'rgba(255,255,255,0.5)',
                  marginLeft: 2,
                  verticalAlign: 'middle',
                  animation: 'blink 0.8s step-start infinite',
                }} />
              )}
            </div>

            {/* Bottom caption */}
            <div style={{
              marginTop: 14,
              textAlign: 'center',
              fontSize: 11,
              color: 'rgba(239,68,68,0.7)',
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}>
              Half the equation. Half the answer.
            </div>
          </div>
        </div>

        {/* Scenario dots */}
        <div style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          marginTop: 36,
          opacity: v ? 1 : 0,
          transition: 'opacity 0.7s ease 0.6s',
        }}>
          {SCENARIOS.map((_, i) => (
            <div key={i} style={{
              width: i === idx ? 32 : 8,
              height: 8,
              borderRadius: 4,
              background: i === idx ? '#10b981' : 'rgba(255,255,255,0.12)',
              boxShadow: i === idx ? '0 0 10px rgba(16,185,129,0.7)' : 'none',
              transition: 'all 0.6s ease',
            }} />
          ))}
        </div>

        {/* Bottom statement */}
        <div style={{
          marginTop: 64,
          textAlign: 'center',
          opacity: v ? 1 : 0,
          transition: 'opacity 0.9s ease 0.7s',
        }}>
          <div style={{
            fontSize: 'clamp(18px, 2.8vw, 26px)',
            fontWeight: 900,
            color: '#fff',
            letterSpacing: '-0.01em',
            marginBottom: 8,
          }}>
            MLS + AI. Not one. <span style={{ color: '#10b981' }}>Both.</span>
          </div>
          <div style={{
            fontSize: 14,
            color: 'rgba(255,255,255,0.45)',
            fontStyle: 'italic',
          }}>
            Your clients get facts, not hedges.
          </div>
        </div>
      </div>

      <style>{\`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes streamIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          .fusion-grid { grid-template-columns: 1fr !important; }
        }
      \`}</style>
    </section>
  )
}
`;

const mlsFusionPath = path.join(ROOT, 'app', 'zerooneleads', 'components', 'MLSFusion.tsx');
fs.writeFileSync(mlsFusionPath, mlsFusionContent, 'utf8');
console.log('✓ Created: app/zerooneleads/components/MLSFusion.tsx');

// ============================================================
// 2. Update page.tsx — wire MLSFusion between Solution and Features
// ============================================================
const pageFile = path.join(ROOT, 'app', 'zerooneleads', 'page.tsx');
let pageContent = fs.readFileSync(pageFile, 'utf8');

// Add import
const importOld = `import Solution from './components/Solution'
import Features from './components/Features'`;
const importNew = `import Solution from './components/Solution'
import MLSFusion from './components/MLSFusion'
import Features from './components/Features'`;

if (!pageContent.includes(importOld)) {
  console.error('✗ Import pattern not found in page.tsx. Current content:');
  console.error(pageContent);
  process.exit(1);
}
pageContent = pageContent.replace(importOld, importNew);

// Add render call
const renderOld = `      <Solution />
      <Features />`;
const renderNew = `      <Solution />
      <MLSFusion />
      <Features />`;

if (!pageContent.includes(renderOld)) {
  console.error('✗ Render pattern not found in page.tsx.');
  process.exit(1);
}
pageContent = pageContent.replace(renderOld, renderNew);

fs.writeFileSync(pageFile, pageContent, 'utf8');
console.log('✓ Updated: app/zerooneleads/page.tsx');

console.log('\n✓ MLSFusion section created and wired in.');
console.log('Next: npx tsc --noEmit, then npm run dev to preview at localhost:3000/zerooneleads');