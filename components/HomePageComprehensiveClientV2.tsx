'use client';
import dynamic from 'next/dynamic'

const VIPAIAccess = dynamic(() => import('@/components/auth/VIPAIAccess'), { ssr: false })
import { useState, useEffect, useRef } from 'react';
import type { MarketStats, AreaCard } from '@/lib/comprehensive/types';
import type { NeighbourhoodMenuItem } from '@/components/navigation/SiteHeader';
import BrowseListingsView from './home-page/BrowseListingsView';

interface Agent {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  profile_photo_url: string | null;
  bio: string | null;
  title: string | null;
  brokerage_name: string | null;
  site_title: string | null;
  site_tagline: string | null;
}

interface AccessInfo {
  isAllMLS: boolean;
  buildings_access: boolean;
  condo_access: boolean;
  homes_access: boolean;
}

interface Props {
  agent: Agent;
  stats: MarketStats;
  topAreas: AreaCard[];
  neighbourhoods: NeighbourhoodMenuItem[];
  access: AccessInfo;
}

// ── Open Charlie helper ───────────────────────────────────────
function openCharlie(form?: 'buyer' | 'seller', message?: string) {
  window.dispatchEvent(new CustomEvent('charlie:open', { detail: { form, message } }));
}

// ── WALLiam Hero Wordmark ─────────────────────────────────────
function HeroWordmark() {
  const [revealed, setRevealed] = useState(false);
  const [wallGlow, setWallGlow] = useState(false);

  useEffect(() => {
    // Sequence: reveal → WALL glow → settle
    const t1 = setTimeout(() => setRevealed(true), 300);
    const t2 = setTimeout(() => setWallGlow(true), 900);
    const t3 = setTimeout(() => setWallGlow(false), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: revealed ? 1 : 0,
      transform: revealed ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity 0.7s ease, transform 0.7s ease',
      marginBottom: 20,
    }}>
      {/* WALL */}
      <span style={{
        fontSize: 'clamp(52px, 10vw, 96px)',
        fontWeight: 900,
        letterSpacing: '-0.03em',
        color: wallGlow ? '#ffffff' : '#ffffff',
        textShadow: wallGlow
          ? '0 0 40px rgba(245,158,11,0.8), 0 0 80px rgba(245,158,11,0.4)'
          : '0 0 0px transparent',
        transition: 'text-shadow 0.3s ease',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        lineHeight: 1,
      }}>WALL</span>

      {/* ı with heart as dot */}
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-end' }}>
        {/* Heart replaces the dot of i — positioned at exact dot height */}
        <span style={{
          position: 'absolute',
          top: '8%',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 'clamp(12px, 1.8vw, 18px)',
          color: '#f59e0b',
          animation: 'walliam-heartbeat 3s ease-in-out infinite',
          display: 'block',
          lineHeight: 1,
        }}>♥</span>
        {/* dotless i — ı */}
        <span style={{
          fontSize: 'clamp(52px, 10vw, 96px)',
          fontWeight: 200,
          letterSpacing: '-0.02em',
          color: 'rgba(255,255,255,0.75)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          lineHeight: 1,
        }}>ı</span>
      </span>

      {/* am */}
      <span style={{
        fontSize: 'clamp(52px, 10vw, 96px)',
        fontWeight: 200,
        letterSpacing: '-0.02em',
        color: 'rgba(255,255,255,0.75)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        lineHeight: 1,
      }}>am</span>
    </div>
  );
}

// ── Typing placeholder ────────────────────────────────────────
const SEARCH_EXAMPLES = [
  'I want to buy a 2-bed condo in downtown Toronto',
  'What is my home on Elm St worth?',
  'Find me detached homes in Whitby under $900K',
  'Show me investment condos with high rental yield',
  'I want to sell my condo in Waterfront Communities',
];

function TypingPlaceholder() {
  const [mounted, setMounted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const example = SEARCH_EXAMPLES[idx];
    let timeout: NodeJS.Timeout;
    if (!deleting) {
      if (text.length < example.length) {
        timeout = setTimeout(() => setText(example.slice(0, text.length + 1)), 48);
      } else {
        timeout = setTimeout(() => setDeleting(true), 2800);
      }
    } else {
      if (text.length > 0) {
        timeout = setTimeout(() => setText(text.slice(0, -1)), 22);
      } else {
        setDeleting(false);
        setIdx(i => (i + 1) % SEARCH_EXAMPLES.length);
      }
    }
    return () => clearTimeout(timeout);
  }, [text, deleting, idx, mounted]);

  if (!mounted) return null;
  return (
    <span style={{ color: 'rgba(255,255,255,0.55)' }}>
      {text}<span style={{ animation: 'blink 1s step-end infinite' }}>|</span>
    </span>
  );
}

// ── Animated Tagline ──────────────────────────────────────────
const TAGLINE_WORDS = ['Hi,', 'I', 'am', 'WALLiam', '—', 'I', 'can', 'create', 'your', 'AI', 'real', 'estate', 'plan'];

function AnimatedTagline({ visible }: { visible: boolean }) {
  const [wordCount, setWordCount] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let timeout: NodeJS.Timeout;

    const runCycle = () => {
      setFading(false);
      setWordCount(0);
      let i = 0;
      const typeNext = () => {
        i++;
        setWordCount(i);
        if (i < TAGLINE_WORDS.length) {
          timeout = setTimeout(typeNext, 90);
        } else {
          // Hold for 3s then fade out
          timeout = setTimeout(() => {
            setFading(true);
            // After fade, restart
            timeout = setTimeout(runCycle, 600);
          }, 3000);
        }
      };
      timeout = setTimeout(typeNext, 90);
    };

    runCycle();
    return () => clearTimeout(timeout);
  }, [visible]);

  return (
    <p style={{ margin: 0, fontSize: 'clamp(16px, 2.5vw, 22px)', lineHeight: 1.6, fontWeight: 300, letterSpacing: '0.01em' }}>
      {TAGLINE_WORDS.map((word, i) => (
        <span key={i} style={{
          opacity: fading ? 0 : i < wordCount ? 1 : 0,
          transform: i < wordCount && !fading ? 'translateX(0)' : 'translateX(-16px)',
          transition: fading
            ? 'opacity 0.4s ease, transform 0.4s ease'
            : 'opacity 0.35s ease, transform 0.35s ease',
          display: 'inline-block',
          marginRight: 6,
          color: word === 'WALLiam' ? '#f59e0b'
            : word === 'AI' ? '#3b82f6'
            : word === 'plan' ? 'rgba(255,255,255,0.95)'
            : 'rgba(255,255,255,0.55)',
          fontWeight: word === 'WALLiam' ? 700 : word === 'AI' || word === 'plan' ? 500 : 300,
        }}>{word}</span>
      ))}
    </p>
  );
}
function WalliamSearch() {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [query]);

  const submit = () => {
    if (!query.trim()) { openCharlie(); return; }
    openCharlie(undefined, query.trim());
    setQuery('');
  };

  return (
    <div style={{ width: '100%', maxWidth: 680, margin: '0 auto' }}>
      <div style={{
        borderRadius: 20,
        padding: 2,
        background: focused
          ? 'linear-gradient(135deg, #f59e0b, #3b82f6, #10b981)'
          : 'rgba(255,255,255,0.18)',
        transition: 'background 0.4s ease, box-shadow 0.4s ease',
        boxShadow: focused
          ? '0 0 50px rgba(245,158,11,0.25), 0 12px 40px rgba(0,0,0,0.4)'
          : '0 0 28px rgba(245,158,11,0.12), 0 8px 32px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          borderRadius: 18,
          background: 'rgba(8, 15, 26, 0.95)',
          padding: '14px 18px',
          display: 'flex', alignItems: 'flex-end', gap: 12,
        }}>
          {/* WALLiam mini wordmark */}
          <span style={{
            flexShrink: 0, alignSelf: 'flex-end', marginBottom: 2,
            display: 'inline-flex', alignItems: 'baseline',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            fontWeight: 800, fontSize: 13, letterSpacing: '-0.02em',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}>WALL<span style={{ fontWeight: 300, fontSize: 12 }}>iam</span></span>

          {/* Input */}
          <div style={{ flex: 1, position: 'relative', minHeight: 28 }}>
            <textarea
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              rows={1}
              style={{
                width: '100%', background: 'transparent', border: 'none',
                outline: 'none', color: '#fff', fontSize: 16, lineHeight: 1.6,
                resize: 'none', fontFamily: 'inherit', overflow: 'hidden',
              }}
              placeholder=""
            />
            {!query && !focused && (
              <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', fontSize: 16, lineHeight: 1.6 }}>
                <TypingPlaceholder />
              </div>
            )}
          </div>

          {/* Send */}
          <button onClick={submit} style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: query.trim()
              ? 'linear-gradient(135deg, #f59e0b, #d97706)'
              : 'rgba(255,255,255,0.08)',
            cursor: query.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background 0.3s ease',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={query.trim() ? '#000' : 'rgba(255,255,255,0.4)'}
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Ask WALLiam label */}
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Ask WALLiam anything about GTA real estate
      </div>
    </div>
  );
}

// ── How WALLiam Works — scroll-animated steps ─────────────────
function HowItWorks() {
  const [visible, setVisible] = useState([false, false, false]);
  const refs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  useEffect(() => {
    const observers = refs.map((ref, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) {
          setTimeout(() => setVisible(v => { const n = [...v]; n[i] = true; return n; }), i * 180);
          obs.disconnect();
        }
      }, { threshold: 0.3 });
      if (ref.current) obs.observe(ref.current);
      return obs;
    });
    return () => observers.forEach(o => o.disconnect());
  }, []);

  const steps = [
    {
      number: '01',
      icon: '💬',
      title: 'Tell WALLiam',
      desc: 'Share what you\'re looking for — buying, selling, budget, area. Takes 30 seconds.',
      color: '#f59e0b',
    },
    {
      number: '02',
      icon: '✦',
      title: 'AI Builds Your Plan',
      desc: 'WALLiam pulls live MLS data, market analytics, and comparable sales to build your personalized real estate plan.',
      color: '#3b82f6',
    },
    {
      number: '03',
      icon: '🤝',
      title: 'Your Agent Executes',
      desc: 'Your plan is handed to a local expert. No cold calls, no wasted time — they already know exactly what you need.',
      color: '#10b981',
    },
  ];

  return (
    <section style={{
      padding: '100px 24px',
      background: 'linear-gradient(180deg, #060b18 0%, #0d1117 100%)',
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{ fontSize: 11, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>
            How it works
          </div>
          <h2 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
            From conversation to plan<br />
            <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 300 }}>in minutes, not days</span>
          </h2>
        </div>

        {/* Steps — horizontal */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, position: 'relative' }}>
          {/* Connecting lines between steps */}
          <div style={{
            position: 'absolute', top: 28, left: 'calc(33% - 10px)', right: 'calc(33% - 10px)',
            height: 2, zIndex: 0,
            background: visible[0] && visible[1]
              ? `linear-gradient(90deg, ${steps[0].color}, ${steps[1].color}, ${steps[2].color})`
              : 'rgba(255,255,255,0.06)',
            transition: 'background 1s ease',
          }} />

          {steps.map((step, i) => (
            <div key={step.number} ref={refs[i]} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              textAlign: 'center', padding: '0 24px', position: 'relative', zIndex: 1,
              opacity: visible[i] ? 1 : 0,
              transform: visible[i] ? 'translateY(0)' : 'translateY(24px)',
              transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}>
              {/* Icon circle */}
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: visible[i] ? `${step.color}20` : 'rgba(255,255,255,0.04)',
                border: `2px solid ${visible[i] ? step.color : 'rgba(255,255,255,0.08)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, marginBottom: 20,
                transform: visible[i] ? 'scale(1)' : 'scale(0.7)',
                transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                boxShadow: visible[i] ? `0 0 28px ${step.color}35` : 'none',
              }}>
                {step.icon}
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color: step.color, marginBottom: 8, textTransform: 'uppercase' }}>
                Step {step.number}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 10 }}>{step.title}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>{step.desc}</div>
            </div>
          ))}
        </div>

        {/* CTA below steps */}
        <div style={{ textAlign: 'center', marginTop: 64 }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button
              onClick={() => openCharlie('buyer')}
              style={{
                padding: '14px 32px', borderRadius: 100, border: 'none',
                background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
                color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 8px 32px rgba(59,130,246,0.3)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
            >
              Get My Buyer Plan
            </button>
            <button
              onClick={() => openCharlie('seller')}
              style={{
                padding: '14px 32px', borderRadius: 100, border: 'none',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 8px 32px rgba(16,185,129,0.3)',
                transition: 'transform 0.2s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
            >
              Get My Seller Plan
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Hero ──────────────────────────────────────────────────────
type HomeMode = 'ai' | 'browse';

function WalliamHero({ topAreas, neighbourhoods, access }: { topAreas: AreaCard[]; neighbourhoods: NeighbourhoodMenuItem[]; access: AccessInfo }) {
  const [homeMode, setHomeMode] = useState<HomeMode>('ai');
  const [taglineVisible, setTaglineVisible] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setTaglineVisible(true), 1200);
    const t2 = setTimeout(() => setCtaVisible(true), 1700);
    const t3 = setTimeout(() => setSearchVisible(true), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <section style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '80px 24px 60px',
      background: 'linear-gradient(160deg, #060b18 0%, #0a1628 50%, #060b18 100%)',
      position: 'relative', overflow: 'hidden',
      textAlign: 'center',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 800, height: 800, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(245,158,11,0.04) 0%, transparent 65%)',
      }} />
      <div style={{
        position: 'absolute', top: '60%', left: '30%',
        width: 400, height: 400, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(59,130,246,0.04) 0%, transparent 70%)',
      }} />

      {/* WALLiam name */}
      <HeroWordmark />

      {/* Tagline */}
      <div style={{
        opacity: taglineVisible ? 1 : 0,
        transform: taglineVisible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
        marginBottom: 48,
      }}>
        <AnimatedTagline visible={taglineVisible} />
      </div>


      {/* Mode Toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
        <div style={{ position: 'relative', display: 'inline-flex', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999, padding: 5 }}>
          <div style={{ position: 'absolute', top: 5, bottom: 5, width: 'calc(50% - 5px)', background: '#f59e0b', borderRadius: 999, transition: 'left 0.25s ease', left: homeMode === 'ai' ? 5 : 'calc(50% + 0px)', zIndex: 0 }} />
          <button onClick={() => setHomeMode('ai')} style={{ position: 'relative', zIndex: 1, padding: '11px 26px', border: 0, background: 'transparent', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: homeMode === 'ai' ? '#0a1428' : 'rgba(255,255,255,0.7)', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polygon points="12,2 15,9 22,12 15,15 12,22 9,15 2,12 9,9"/></svg>
            Ask WALLiam (AI)
          </button>
          <button onClick={() => setHomeMode('browse')} style={{ position: 'relative', zIndex: 1, padding: '11px 26px', border: 0, background: 'transparent', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: homeMode === 'browse' ? '#0a1428' : 'rgba(255,255,255,0.7)', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Browse Listings
          </button>
        </div>
      </div>

      {homeMode === 'ai' && (<>
      {/* CTAs */}
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center',
        marginBottom: 48,
        opacity: ctaVisible ? 1 : 0,
        transform: ctaVisible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}>
        <button
          onClick={() => openCharlie('buyer')}
          style={{
            padding: '16px 36px', borderRadius: 100, border: 'none',
            background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
            color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', letterSpacing: '0.01em',
            boxShadow: '0 8px 40px rgba(59,130,246,0.35)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 12px 48px rgba(59,130,246,0.5)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 40px rgba(59,130,246,0.35)';
          }}
        >
          🏠 Get My Buyer Plan
        </button>

        <button
          onClick={() => openCharlie('seller')}
          style={{
            padding: '16px 36px', borderRadius: 100, border: 'none',
            background: 'linear-gradient(135deg, #059669, #10b981)',
            color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', letterSpacing: '0.01em',
            boxShadow: '0 8px 40px rgba(16,185,129,0.35)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 12px 48px rgba(16,185,129,0.5)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 40px rgba(16,185,129,0.35)';
          }}
        >
          💰 Get My Seller Plan
        </button>
      </div>

      {/* Search */}
      <div style={{
        width: '100%',
        opacity: searchVisible ? 1 : 0,
        transform: searchVisible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}>
        <WalliamSearch />
      </div>
      </>)}

      {homeMode === 'browse' && (
        <BrowseListingsView neighbourhoods={neighbourhoods} />
      )}

      {/* VIP AI Access Block */}
      <div style={{ width: '100%', maxWidth: 600, margin: '0 auto 32px' }}>
        <VIPAIAccess variant="full" registrationSource="homepage_hero" />
      </div>

      {/* Scroll hint */}
      <div style={{
        position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        opacity: searchVisible ? 0.4 : 0, transition: 'opacity 0.6s ease',
        animation: searchVisible ? 'bounce 2s ease-in-out infinite' : 'none',
      }}>
        <div style={{ fontSize: 11, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Scroll</div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      <style>{`
        @keyframes walliam-heartbeat {
          0%   { transform: translateX(-50%) scale(1); opacity: 0.9; }
          10%  { transform: translateX(-50%) scale(1.45); opacity: 1; }
          20%  { transform: translateX(-50%) scale(1); opacity: 0.9; }
          30%  { transform: translateX(-50%) scale(1.28); opacity: 1; }
          45%  { transform: translateX(-50%) scale(1); opacity: 0.9; }
          100% { transform: translateX(-50%) scale(1); opacity: 0.9; }
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(6px); }
        }
      `}</style>
    </section>
  );
}

// ── Main Export ───────────────────────────────────────────────
export default function HomePageComprehensiveClientV2({ agent, stats, topAreas, neighbourhoods, access }: Props) {
  return (
    <div style={{ minHeight: '100vh', background: '#060b18' }}>
      <WalliamHero topAreas={topAreas} neighbourhoods={neighbourhoods} access={access} />
      <HowItWorks />
    </div>
  );
}
