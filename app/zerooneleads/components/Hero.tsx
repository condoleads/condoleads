'use client'
import { useEffect, useRef, useState } from 'react'

function BinaryRain() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    const cols = Math.floor(c.width / 20)
    const drops = Array(cols).fill(1)
    const id = setInterval(() => {
      ctx.fillStyle = 'rgba(2,8,18,0.05)'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.fillStyle = 'rgba(59,130,246,0.18)'
      ctx.font = '13px monospace'
      drops.forEach((y, i) => {
        ctx.fillText(Math.random() > 0.5 ? '1' : '0', i * 20, y * 20)
        if (y * 20 > c.height && Math.random() > 0.975) drops[i] = 0
        drops[i]++
      })
    }, 50)
    return () => { clearInterval(id); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, opacity: 0.35, pointerEvents: 'none' }} />
}

function Counter({ target, suffix = '' }: { target: number, suffix?: string }) {
  const [n, setN] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      let v = 0; const step = target / 60
      const t = setInterval(() => { v += step; if (v >= target) { setN(target); clearInterval(t) } else setN(Math.floor(v)) }, 16)
    }, { threshold: 0.5 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [target])
  return <span ref={ref}>{n.toLocaleString()}{suffix}</span>
}


function BinaryDecode() {
  const targets = ['L','E','A','D','S']
  const bins = ['01001100','01000101','01000001','01000100','01010011']
  const [chars, setChars] = useState(['01001100','01000101','01000001','01000100','01010011'])
  const [decoded, setDecoded] = useState([false,false,false,false,false])
  const [visible, setVisible] = useState(false)
  useEffect(() => { setTimeout(() => setVisible(true), 300) }, [])

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    targets.forEach((_, i) => {
      // Scramble phase
      const scramble = setInterval(() => {
        setChars(prev => {
          const n = [...prev]
          if (!decoded[i]) n[i] = Math.random()>0.5?'01'+Math.floor(Math.random()*1000000).toString(2).padStart(6,'0'):bins[i]
          return n
        })
      }, 80)
      // Decode to letter
      timers.push(setTimeout(() => {
        clearInterval(scramble)
        setDecoded(prev => { const n=[...prev]; n[i]=true; return n })
        setChars(prev => { const n=[...prev]; n[i]=targets[i]; return n })
        // Reset after pause
        timers.push(setTimeout(() => {
          setDecoded(prev => { const n=[...prev]; n[i]=false; return n })
          setChars(prev => { const n=[...prev]; n[i]=bins[i]; return n })
        }, 2000))
      }, 600 + i * 400))
    })
    const loop = setInterval(() => {
      targets.forEach((_, i) => {
        const scramble = setInterval(() => {
          setChars(prev => {
            const n = [...prev]
            n[i] = Math.random()>0.5?'01'+Math.floor(Math.random()*1000000).toString(2).padStart(6,'0'):bins[i]
            return n
          })
        }, 80)
        timers.push(setTimeout(() => {
          clearInterval(scramble)
          setDecoded(prev => { const n=[...prev]; n[i]=true; return n })
          setChars(prev => { const n=[...prev]; n[i]=targets[i]; return n })
          timers.push(setTimeout(() => {
            setDecoded(prev => { const n=[...prev]; n[i]=false; return n })
            setChars(prev => { const n=[...prev]; n[i]=bins[i]; return n })
          }, 2000))
        }, 600 + i * 400))
      })
    }, 5000)
    return () => { timers.forEach(clearTimeout); clearInterval(loop) }
  }, [])

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 28, alignItems: 'center', minHeight: 52, overflow: 'hidden' }}>
      {chars.map((ch, i) => (
        <div key={i} style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'monospace', fontSize: 14,
            fontWeight: decoded[i] ? 900 : 400, lineHeight: '1.4',
            color: decoded[i] ? '#3b82f6' : '#ffffff',
            letterSpacing: decoded[i] ? '-0.02em' : '0.1em',
            transition: 'all 0.3s ease',
            minWidth: decoded[i] ? 20 : 64,
          }}>{ch}</div>
          {decoded[i] && <div style={{ width: '100%', height: 2, background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)', borderRadius: 1, marginTop: 4 }} />}
        </div>
      ))}
    </div>
  )
}

export default function Hero() {
  const [v, setV] = useState(false)
  useEffect(() => { setTimeout(() => setV(true), 80) }, [])
  const t = (d: number) => ({ opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(28px)', transition: `all 0.7s ease ${d}s` })
  return (
    <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden', background: '#020812' }}>
      <BinaryRain />
      <div style={{ position: 'absolute', top: '15%', left: '5%', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '5%', right: '0%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '120px 24px 80px', width: '100%' }}>
        {/* Binary decode to LEADS */}
        <BinaryDecode />
                <div style={{ ...t(0), display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 100, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', marginBottom: 32 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', display: 'inline-block', animation: 'hpulse 2s infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI-Powered Real Estate Platform</span>
        </div>
        <div style={{ ...t(0.1), fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 8, color: '#fff', fontSize: 'clamp(18px, 2.2vw, 32px)', whiteSpace: 'nowrap' }}>
          Browse → Get an AI plan → <span style={{ background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Lead Captured</span></div>
        <div style={{ ...t(0.15), fontSize: 'clamp(42px, 6vw, 82px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 24 }}>
          <span style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Your AI works 24/7.
          </span></div>
        <p style={{ ...t(0.2), fontSize: 'clamp(16px, 2.2vw, 21px)', color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, maxWidth: 580, marginBottom: 48 }}>
          01leads AI captures every lead, qualifies every buyer, estimates every home value — and delivers a personalized plan before your agent even picks up the phone.
        </p>
        {/* Binary strip */}
        <div style={{ ...t(0.25), fontFamily: 'monospace', fontSize: 11, color: 'rgba(59,130,246,0.4)', letterSpacing: '0.15em', marginBottom: 8, overflow: 'hidden', maxWidth: 580 }} className="binary-strip">
          01001100 01000101 01000001 01000100 10011011 01001111 01001100 01001100 01001001 10101000 01001101
        </div>
        <div style={{ ...t(0.3), display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <a href="#pricing" style={{ padding: '15px 36px', borderRadius: 100, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 16, fontWeight: 800, textDecoration: 'none', boxShadow: '0 8px 40px rgba(59,130,246,0.45)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 50px rgba(59,130,246,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 40px rgba(59,130,246,0.45)' }}
          >Book Discovery Call</a>
          <a href="https://walliam.ca" target="_blank" rel="noopener" style={{ padding: '15px 36px', borderRadius: 100, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >See Live Demo →</a>
        </div>
        <div style={{ ...t(0.5), display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '0 48px', marginTop: 80, width: 'fit-content' }} className="hero-stats">
          {[{v:24,s:'/7',l:'Lead Capture'},{v:1,s:'M+',l:'GTA Listings'},{v:3,s:' min',l:'To Qualified Lead'},{v:0,s:' missed',l:'After-Hours Leads'}].map((s,i) => (
            <div key={i} style={{ borderLeft: '2px solid rgba(59,130,246,0.3)', paddingLeft: 20 }}>
              <div style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 900, color: '#fff', fontFamily: 'monospace', lineHeight: 1 }}>
                <Counter target={s.v} suffix={s.s} />
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4, fontWeight: 500 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes hpulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes binscroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        .bin-scroll { display:inline-block; animation: binscroll 10s linear infinite; }
        @keyframes bscroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        .binary-strip { animation: bscroll 12s linear infinite; white-space: nowrap; }
        @media(max-width:640px){ .hero-stats{ grid-template-columns: repeat(2,auto) !important; gap: 24px !important; } }
      `}</style>
    </section>
  )
}