'use client'
import { useState, useEffect } from 'react'
const BINARY = ['0','1','0','1','0','0','1','1']
let binIdx = 0
export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      transition: 'all 0.3s ease',
      background: scrolled ? 'rgba(2,8,18,0.95)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: '#fff' }}><span className="bin-logo">01</span></div>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>leads</span>
        </div>
        <div className="nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {['Features', 'How It Works', 'Pricing', 'FAQ'].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/ /g, '-')}`} style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            >{l}</a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="https://walliam.ca" target="_blank" rel="noopener" style={{ padding: '8px 20px', borderRadius: 100, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 20px rgba(59,130,246,0.4)' }}>See Demo</a>
        </div>
      </div>
      <style>{`
    @media (max-width: 768px) { .nav-desktop { display: none !important; } }
    @keyframes binflip {
      0%,100% { content: '01'; }
      25% { content: '10'; }
      50% { content: '11'; }
      75% { content: '00'; }
    }
    .bin-logo { animation: binflip 3s steps(1) infinite; font-family: monospace; }
  `}</style>
    </nav>
  )
}