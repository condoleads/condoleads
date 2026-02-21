'use client';

import { useState, useEffect, useRef } from 'react';
import type { MarketStats, AreaCard } from '@/lib/comprehensive/types';

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
  access: AccessInfo;
}

// ============================================================
// ANIMATED COUNTER
// ============================================================
function AnimatedCounter({ end, prefix = '', suffix = '' }: { end: number; prefix?: string; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const duration = 2000;
        const animate = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setCount(Math.floor(eased * end));
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [end]);

  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

// ============================================================
// TYPING PLACEHOLDER
// ============================================================
const SEARCH_EXAMPLES = [
  '2-bed condo in Burlington under $700K',
  'What is my townhouse on Elm St worth?',
  'Best investment areas for condos',
  'Show me new listings in Mississauga',
  'Compare Oakville vs Burlington prices',
];

function TypingPlaceholder() {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const example = SEARCH_EXAMPLES[idx];
    let timeout: NodeJS.Timeout;
    if (!deleting) {
      if (text.length < example.length) {
        timeout = setTimeout(() => setText(example.slice(0, text.length + 1)), 50);
      } else {
        timeout = setTimeout(() => setDeleting(true), 2500);
      }
    } else {
      if (text.length > 0) {
        timeout = setTimeout(() => setText(text.slice(0, -1)), 25);
      } else {
        setDeleting(false);
        setIdx((i) => (i + 1) % SEARCH_EXAMPLES.length);
      }
    }
    return () => clearTimeout(timeout);
  }, [text, deleting, idx]);

  return <span className="text-gray-400">{text}<span className="animate-pulse">|</span></span>;
}

// ============================================================
// AI RESPONSE (inline after search)
// ============================================================
function AIResponse({ query, onClose }: { query: string; onClose: () => void }) {
  const [typing, setTyping] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setTyping(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="mt-4 w-full max-w-[680px] rounded-2xl border border-blue-500/20 bg-white/[0.06] p-6 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">AI</span>
          <span className="text-sm font-semibold text-blue-400">AI Advisor</span>
        </div>
        <button onClick={onClose} className="border-none bg-transparent text-white/30 cursor-pointer text-lg">&times;</button>
      </div>

      {typing ? (
        <div className="text-sm text-white/50">Analyzing your request...</div>
      ) : (
        <div>
          <p className="mb-4 text-sm leading-relaxed text-white/85">
            Based on current MLS data, I found <strong className="text-blue-400">matching listings</strong> for
            your search. Let me help you narrow down the best options.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white border-none cursor-pointer">
              View Listings &rarr;
            </button>
            <button className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-white/70 cursor-pointer">
              Compare Areas
            </button>
            <button className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-white/70 cursor-pointer">
              Ask Follow-up &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ICON COMPONENTS (avoid emoji encoding issues)
// ============================================================
function IconDollar() {
  return <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-sm font-bold text-emerald-400">$</span>;
}
function IconBuilding() {
  return <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-sm font-bold text-blue-400">B</span>;
}
function IconHome() {
  return <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/20 text-sm font-bold text-green-400">H</span>;
}
function IconChart() {
  return <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-sm font-bold text-amber-400">%</span>;
}
function IconUser() {
  return <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-sm font-bold text-purple-400">A</span>;
}
function IconTarget() {
  return <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-xl font-bold text-blue-400 mx-auto">!</span>;
}
function IconReport() {
  return <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-xl font-bold text-emerald-400 mx-auto">R</span>;
}

const QUICK_CHIPS = [
  { label: "What's My Home Worth?", iconLabel: '$', journey: 'seller', color: 'emerald' },
  { label: 'Find Condos', iconLabel: 'C', journey: 'buyer', color: 'blue' },
  { label: 'Find Homes', iconLabel: 'H', journey: 'buyer', color: 'green' },
  { label: 'Investment Analysis', iconLabel: '%', journey: 'investor', color: 'amber' },
  { label: 'Talk to Agent', iconLabel: 'A', journey: 'agent', color: 'purple' },
];

// ============================================================
// HERO SECTION
// ============================================================
function HeroSection({ agent, onJourneySelect }: { agent: Agent; onJourneySelect: (j: string) => void }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  return (
    <section className="relative flex min-h-[85vh] flex-col items-center justify-center overflow-hidden px-5 py-10"
      style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 40%, #0d2137 100%)' }}>
      {/* Ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-[20%] h-[600px] w-[600px] -translate-x-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }} />

      {/* Subtle branding */}
      <div className="mb-10 text-center">
        <div className="mb-2 text-xs uppercase tracking-[3px] text-white/40">
          Powered by AI &bull; Guided by Experience
        </div>
        <h1 className="m-0 text-4xl font-bold leading-tight text-white md:text-5xl">
          Your Real Estate
          <span className="block bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent">
            AI Hub
          </span>
        </h1>
        {agent.site_tagline && (
          <p className="mt-2 text-sm text-white/40">{agent.site_tagline}</p>
        )}
      </div>

      {/* AI Search Bar */}
      <div className="mb-8 w-full max-w-[680px]">
        <div className={`flex items-center gap-2 rounded-2xl border p-1 pl-5 transition-all duration-300 ${
          focused
            ? 'border-blue-500/50 bg-white/[0.12] shadow-[0_0_30px_rgba(59,130,246,0.15)]'
            : 'border-white/10 bg-white/[0.07]'
        }`}>
          <svg className="h-5 w-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <div className="relative flex min-h-[52px] flex-1 items-center">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => e.key === 'Enter' && query && setAiResponse(query)}
              className="w-full border-none bg-transparent text-base text-white outline-none placeholder:text-transparent"
              placeholder="Ask anything about GTA real estate..."
            />
            {!query && !focused && (
              <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-base">
                <TypingPlaceholder />
              </div>
            )}
          </div>
          <button
            onClick={() => query && setAiResponse(query)}
            className="whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-3 text-sm font-semibold text-white border-none cursor-pointer"
          >
            Ask AI
          </button>
        </div>
      </div>

      {/* Quick Chips */}
      <div className="flex max-w-[680px] flex-wrap justify-center gap-2.5">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.label}
            onClick={() => {
              onJourneySelect(chip.journey);
              if (chip.journey === 'agent') {
                document.getElementById('agent-section')?.scrollIntoView({ behavior: 'smooth' });
              } else {
                document.getElementById('journey-section')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/80 transition-all duration-200 cursor-pointer hover:border-blue-500/30 hover:bg-blue-500/[0.15]"
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded-full bg-${chip.color}-500/20 text-[10px] font-bold text-${chip.color}-400`}>{chip.iconLabel}</span>
            {chip.label}
          </button>
        ))}
      </div>

      {/* AI Response */}
      {aiResponse && <AIResponse query={aiResponse} onClose={() => setAiResponse(null)} />}
    </section>
  );
}

// ============================================================
// MARKET PULSE
// ============================================================
function MarketPulse({ stats, access }: { stats: MarketStats; access: AccessInfo }) {
  const items = [
    ...(access.condo_access ? [{ label: 'Active Condos', value: stats.activeCondos, color: 'text-blue-400' }] : []),
    ...(access.homes_access ? [{ label: 'Active Homes', value: stats.activeHomes, color: 'text-emerald-400' }] : []),
    ...(access.buildings_access ? [{ label: 'Buildings', value: stats.buildingsCount, color: 'text-purple-400' }] : []),
    { label: 'Avg PSF', value: stats.avgPsf, color: 'text-amber-400', prefix: '$' },
    { label: 'Sold This Month', value: stats.soldThisMonth, color: 'text-rose-400' },
  ];

  return (
    <section className="border-y border-blue-500/15 bg-[#0d1117] py-5">
      <div className="mx-auto flex max-w-[900px] flex-wrap justify-center gap-12 px-5">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <div className={`text-2xl font-bold ${item.color}`}>
              <AnimatedCounter end={item.value} prefix={item.prefix || ''} />
            </div>
            <div className="mt-0.5 text-[11px] uppercase tracking-[1.5px] text-white/40">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// BUYER JOURNEY
// ============================================================
function BuyerJourney({ topAreas, access }: { topAreas: AreaCard[]; access: AccessInfo }) {
  const [step, setStep] = useState(0);
  const [selectedArea, setSelectedArea] = useState<AreaCard | null>(null);
  const [propertyType, setPropertyType] = useState('');

  const typeOptions = [
    ...(access.condo_access ? [{ id: 'condos', label: 'Condos', iconLabel: 'C', color: 'blue' }] : []),
    ...(access.homes_access ? [{ id: 'homes', label: 'Homes', iconLabel: 'H', color: 'green' }] : []),
    ...((access.condo_access && access.homes_access) ? [{ id: 'all', label: 'Both', iconLabel: 'A', color: 'cyan' }] : []),
  ];

  return (
    <div className="mx-auto max-w-[600px] rounded-2xl border border-blue-500/15 bg-blue-500/5 p-8 md:p-10">
      {/* Progress bar */}
      <div className="mb-8 flex gap-2">
        {['Where?', 'What?', 'Results'].map((s, i) => (
          <div key={s} className={`flex-1 border-b-[3px] pb-2 text-center text-sm font-semibold transition-all duration-300 ${
            i <= step ? 'border-blue-500 text-blue-400' : 'border-white/10 text-white/30'
          }`}>{s}</div>
        ))}
      </div>

      {step === 0 && (
        <div>
          <h3 className="mb-4 text-xl font-semibold text-white">Where are you looking?</h3>
          <div className="grid grid-cols-2 gap-3">
            {topAreas.map((area) => (
              <button
                key={area.id}
                onClick={() => { setSelectedArea(area); setStep(1); }}
                className="cursor-pointer rounded-xl border border-white/[0.08] bg-white/[0.04] p-3.5 text-left transition-all duration-200 hover:border-blue-500/30 hover:bg-blue-500/10"
              >
                <div className="text-sm font-semibold text-white">{area.name}</div>
                <div className="mt-1 text-xs text-white/40">
                  {(area.condoCount + area.homeCount).toLocaleString()} listings
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && selectedArea && (
        <div>
          <h3 className="mb-4 text-xl font-semibold text-white">What type of property?</h3>
          <div className="flex gap-3">
            {typeOptions.map((t) => (
              <button
                key={t.id}
                onClick={() => { setPropertyType(t.id); setStep(2); }}
                className="flex-1 cursor-pointer rounded-xl border border-white/[0.08] bg-white/[0.04] py-6 text-center transition-all duration-200 hover:border-blue-500/30"
              >
                <div className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-${t.color}-500/20 text-lg font-bold text-${t.color}-400`}>
                  {t.iconLabel}
                </div>
                <div className="font-semibold text-white">{t.label}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(0)} className="mt-4 border-none bg-transparent text-sm text-blue-400 cursor-pointer">
            &larr; Change area
          </button>
        </div>
      )}

      {step === 2 && selectedArea && (
        <div className="text-center">
          <IconTarget />
          <h3 className="mt-4 mb-2 text-xl font-semibold text-white">
            {propertyType === 'condos' ? 'Condos' : propertyType === 'homes' ? 'Homes' : 'Properties'} in {selectedArea.name}
          </h3>
          <p className="mb-6 text-sm text-white/50">
            {(selectedArea.condoCount + selectedArea.homeCount).toLocaleString()} listings available with live MLS data.
          </p>
          <a
            href={`/${selectedArea.slug}${propertyType !== 'all' ? `?type=${propertyType}` : ''}`}
            className="inline-block rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-10 py-3.5 text-base font-semibold text-white no-underline"
          >
            View Listings &rarr;
          </a>
          <div className="mt-3">
            <button onClick={() => setStep(1)} className="border-none bg-transparent text-sm text-blue-400 cursor-pointer">
              &larr; Change property type
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SELLER JOURNEY
// ============================================================
function SellerJourney() {
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState<'condo' | 'home'>('condo');

  return (
    <div className="mx-auto max-w-[600px] rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-8 md:p-10">
      <div className="mb-8 flex gap-2">
        {['What is It Worth?', 'Market Position', 'Digital CMA'].map((s, i) => (
          <div key={s} className={`flex-1 border-b-[3px] pb-2 text-center text-sm font-semibold transition-all duration-300 ${
            i <= step ? 'border-emerald-500 text-emerald-400' : 'border-white/10 text-white/30'
          }`}>{s}</div>
        ))}
      </div>

      {step === 0 && (
        <div>
          <h3 className="mb-2 text-xl font-semibold text-white">What is your property worth?</h3>
          <p className="mb-5 text-sm text-white/50">Get an AI-powered estimate in seconds.</p>
          <div className="mb-4 flex gap-3">
            {(['condo', 'home'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPropertyType(t)}
                className={`flex-1 cursor-pointer rounded-lg border p-3 text-center font-medium text-white transition-all ${
                  propertyType === t ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 bg-white/[0.04]'
                }`}
              >
                {t === 'condo' ? 'Condo' : 'Home'}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Enter your address..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 p-3.5 text-base text-white outline-none"
          />
          <button
            onClick={() => address && setStep(1)}
            className={`w-full rounded-lg border-none py-3.5 text-base font-semibold transition-all ${
              address
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white cursor-pointer'
                : 'bg-white/5 text-white/30 cursor-default'
            }`}
          >
            Get AI Estimate &rarr;
          </button>
        </div>
      )}

      {step === 1 && (
        <div>
          <h3 className="mb-4 text-xl font-semibold text-white">Your Market Position</h3>
          <div className="mb-5 rounded-2xl bg-emerald-500/10 p-6 text-center">
            <div className="mb-1 text-xs text-white/50">AI Estimated Value</div>
            <div className="text-4xl font-bold text-emerald-400">$847,000</div>
            <div className="mt-1 text-sm text-white/40">Based on comparable sales in your area</div>
          </div>
          <div className="mb-5 grid grid-cols-3 gap-3">
            {[
              { label: 'Avg Days on Market', value: '18' },
              { label: 'Area Trend', value: '+3.2%' },
              { label: 'Active Competitors', value: '23' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-white/[0.04] p-3 text-center">
                <div className="text-xl font-bold text-white">{s.value}</div>
                <div className="mt-0.5 text-[10px] text-white/40">{s.label}</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setStep(2)}
            className="w-full cursor-pointer rounded-lg border-none bg-gradient-to-r from-emerald-500 to-emerald-600 py-3.5 text-base font-semibold text-white"
          >
            Get Full Digital CMA Report &rarr;
          </button>
          <button onClick={() => setStep(0)} className="mx-auto mt-3 block border-none bg-transparent text-sm text-emerald-400 cursor-pointer">
            &larr; Try different address
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="text-center">
          <IconReport />
          <h3 className="mt-4 mb-2 text-xl font-semibold text-white">Your Digital CMA is Ready</h3>
          <p className="mx-auto mb-6 max-w-[400px] text-sm text-white/50">
            Be prepared with data before contacting your realtor. Knowledge is your leverage.
          </p>
          <div className="mb-6 rounded-xl bg-white/[0.03] p-5 text-left">
            {[
              'AI Price Estimate with confidence range',
              'Comparable sold properties analyzed',
              'Area market trends and days on market',
              'Optimal listing price recommendation',
              'Monthly cost breakdown for buyers',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 py-1.5 text-sm text-white/70">
                <span className="text-emerald-400">&#10003;</span> {item}
              </div>
            ))}
          </div>
          <a href="/estimator" className="inline-block rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-10 py-3.5 text-base font-semibold text-white no-underline">
            Get Your CMA Report &rarr;
          </a>
        </div>
      )}
    </div>
  );
}

// ============================================================
// JOURNEY SECTION (Buyer/Seller toggle)
// ============================================================
function JourneySection({ activeJourney, setActiveJourney, topAreas, access }: {
  activeJourney: string;
  setActiveJourney: (j: string) => void;
  topAreas: AreaCard[];
  access: AccessInfo;
}) {
  return (
    <section className="px-5 py-20" style={{ background: 'linear-gradient(180deg, #0d1117 0%, #111827 100%)' }}>
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-12 text-center">
          <h2 className="m-0 text-3xl font-bold text-white">What brings you here?</h2>
          <p className="mt-2 text-sm text-white/50">Two paths. Both lead to confident decisions.</p>
        </div>

        <div className="mb-12 flex flex-col sm:flex-row justify-center gap-4">
          {[
            { id: 'buyer', label: "I'm Buying or Renting", iconLabel: 'B', color: 'blue' },
            { id: 'seller', label: "I'm Selling or Leasing", iconLabel: 'S', color: 'emerald' },
          ].map((j) => (
            <button
              key={j.id}
              onClick={() => setActiveJourney(j.id)}
              className={`flex items-center gap-2.5 rounded-2xl border-2 px-8 py-5 text-base font-semibold transition-all duration-300 cursor-pointer ${
                activeJourney === j.id
                  ? j.color === 'blue'
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-emerald-500 bg-emerald-500/10 text-white'
                  : 'border-white/[0.08] bg-white/[0.03] text-white/50'
              }`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                activeJourney === j.id
                  ? j.color === 'blue' ? 'bg-blue-500/30 text-blue-300' : 'bg-emerald-500/30 text-emerald-300'
                  : 'bg-white/10 text-white/40'
              }`}>{j.iconLabel}</span>
              {j.label}
            </button>
          ))}
        </div>

        {activeJourney === 'buyer' && <BuyerJourney topAreas={topAreas} access={access} />}
        {activeJourney === 'seller' && <SellerJourney />}
      </div>
    </section>
  );
}

// ============================================================
// AI TOOLS SHOWCASE
// ============================================================
function AIToolsShowcase() {
  const [active, setActive] = useState<string | null>(null);

  const tools = [
    {
      id: 'estimator', iconLabel: 'E', name: 'AI Estimator',
      desc: 'Instant property valuation powered by real MLS data',
      href: '/estimator', color: 'emerald',
    },
    {
      id: 'chat', iconLabel: 'C', name: 'AI Chat Advisor',
      desc: 'Ask anything - building history, market trends, investment analysis',
      href: '#', color: 'blue',
    },
    {
      id: 'market', iconLabel: 'M', name: 'Market Analytics',
      desc: 'PSF trends, area comparisons, investment insights from live data',
      href: '#', color: 'amber',
    },
  ];

  return (
    <section className="bg-[#111827] px-5 py-20">
      <div className="mx-auto max-w-[900px]">
        <div className="mb-12 text-center">
          <h2 className="m-0 text-2xl font-bold text-white">AI-Powered Tools</h2>
          <p className="mt-2 text-sm text-white/40">Make decisions with confidence, not assumptions</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {tools.map((tool) => (
            <a
              key={tool.id}
              href={tool.href}
              className={`block cursor-pointer rounded-2xl border p-6 no-underline transition-all duration-300 ${
                active === tool.id ? 'border-blue-500/30 bg-blue-500/[0.08]' : 'border-white/[0.06] bg-white/[0.03]'
              }`}
              onMouseEnter={() => setActive(tool.id)}
              onMouseLeave={() => setActive(null)}
            >
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-${tool.color}-500/20 text-lg font-bold text-${tool.color}-400`}>
                {tool.iconLabel}
              </div>
              <h3 className="m-0 text-base font-semibold text-white">{tool.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/40">{tool.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// NEIGHBORHOOD EXPLORER
// ============================================================
function NeighborhoodExplorer({ topAreas, access }: { topAreas: AreaCard[]; access: AccessInfo }) {
  if (topAreas.length === 0) return null;

  return (
    <section className="px-5 py-20" style={{ background: 'linear-gradient(180deg, #111827 0%, #0d1117 100%)' }}>
      <div className="mx-auto max-w-[900px]">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="m-0 text-2xl font-bold text-white">Top Markets by Activity</h2>
            <p className="mt-1 text-sm text-white/40">Ranked by listing volume - real data, updated daily</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topAreas.map((area) => (
            <a
              key={area.id}
              href={`/${area.slug}`}
              className="block cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 no-underline transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-500/30"
            >
              <div className="mb-3 flex items-start justify-between">
                <h3 className="m-0 text-base font-semibold text-white">{area.name}</h3>
                {area.trend && area.trend !== '+0.0%' && (
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                    area.trend.startsWith('+') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                  }`}>{area.trend}</span>
                )}
              </div>
              <div className="flex gap-4">
                {access.condo_access && (
                  <div>
                    <div className="text-lg font-bold text-blue-400">{area.condoCount.toLocaleString()}</div>
                    <div className="text-[10px] text-white/30">Condos</div>
                  </div>
                )}
                {access.homes_access && (
                  <div>
                    <div className="text-lg font-bold text-emerald-400">{area.homeCount.toLocaleString()}</div>
                    <div className="text-[10px] text-white/30">Homes</div>
                  </div>
                )}
                {access.buildings_access && (
                  <div>
                    <div className="text-lg font-bold text-purple-400">{area.buildingCount.toLocaleString()}</div>
                    <div className="text-[10px] text-white/30">Buildings</div>
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// AGENT SECTION
// ============================================================
function AgentSection({ agent }: { agent: Agent }) {
  return (
    <section id="agent-section" className="border-t border-white/5 bg-[#0d1117] px-5 py-20">
      <div className="mx-auto max-w-[700px] text-center">
        <div className="mb-4 text-[11px] uppercase tracking-[2px] text-white/30">
          Your Expert at the End of the Journey
        </div>
        <h2 className="m-0 mb-2 text-3xl font-bold text-white">
          Work with {agent.full_name}
        </h2>
        {agent.title && <p className="m-0 text-sm text-white/50">{agent.title}</p>}
        {agent.brokerage_name && <p className="m-0 mt-1 text-xs text-white/30">{agent.brokerage_name}</p>}
        {agent.bio && (
          <p className="mx-auto mt-4 max-w-[500px] text-sm leading-relaxed text-white/50">{agent.bio}</p>
        )}
        <div className="mt-8 flex justify-center gap-3">
          <a href={`mailto:${agent.email}`}
            className="inline-block rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-8 py-3.5 text-base font-semibold text-white no-underline">
            Schedule Consultation
          </a>
          {agent.phone && (
            <a href={`tel:${agent.phone}`}
              className="inline-block rounded-xl border border-white/15 bg-white/5 px-8 py-3.5 text-base font-medium text-white no-underline">
              Call Now
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// FOOTER
// ============================================================
function ComprehensiveFooter({ topAreas, access }: { topAreas: AreaCard[]; access: AccessInfo }) {
  return (
    <footer className="border-t border-white/5 bg-[#080b12] px-5 pb-8 pt-12">
      <div className="mx-auto max-w-[900px]">
        <div className="mb-8 grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <h4 className="mb-3 text-xs uppercase tracking-[1.5px] text-white/60">Buy</h4>
            {access.condo_access && <div className="py-1 text-sm text-white/30 cursor-pointer hover:text-white/60">Condos for Sale</div>}
            {access.homes_access && <div className="py-1 text-sm text-white/30 cursor-pointer hover:text-white/60">Homes for Sale</div>}
            <div className="py-1 text-sm text-white/30 cursor-pointer hover:text-white/60">New Developments</div>
          </div>
          <div>
            <h4 className="mb-3 text-xs uppercase tracking-[1.5px] text-white/60">Sell</h4>
            <div className="py-1 text-sm text-white/30 cursor-pointer hover:text-white/60">What is My Condo Worth?</div>
            <div className="py-1 text-sm text-white/30 cursor-pointer hover:text-white/60">What is My Home Worth?</div>
            <div className="py-1 text-sm text-white/30 cursor-pointer hover:text-white/60">Digital CMA Report</div>
          </div>
          <div>
            <h4 className="mb-3 text-xs uppercase tracking-[1.5px] text-white/60">Explore</h4>
            {topAreas.slice(0, 5).map((area) => (
              <a key={area.id} href={`/${area.slug}`} className="block py-1 text-sm text-white/30 no-underline hover:text-white/60">
                {area.name}
              </a>
            ))}
          </div>
          <div>
            <h4 className="mb-3 text-xs uppercase tracking-[1.5px] text-white/60">Tools</h4>
            <div className="py-1 text-sm text-white/30 cursor-pointer hover:text-white/60">AI Estimator</div>
            <div className="py-1 text-sm text-white/30 cursor-pointer hover:text-white/60">AI Chat Advisor</div>
            <div className="py-1 text-sm text-white/30 cursor-pointer hover:text-white/60">Market Analytics</div>
          </div>
        </div>
        <div className="border-t border-white/5 pt-4 text-center">
          <span className="text-xs text-white/20">Powered by CondoLeads AI</span>
        </div>
      </div>
    </footer>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function HomePageComprehensiveClient({ agent, stats, topAreas, access }: Props) {
  const [activeJourney, setActiveJourney] = useState('buyer');

  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      <HeroSection agent={agent} onJourneySelect={setActiveJourney} />
      <MarketPulse stats={stats} access={access} />
      <div id="journey-section">
        <JourneySection
          activeJourney={activeJourney}
          setActiveJourney={setActiveJourney}
          topAreas={topAreas}
          access={access}
        />
      </div>
      <AIToolsShowcase />
      <NeighborhoodExplorer topAreas={topAreas} access={access} />
      <AgentSection agent={agent} />
      <ComprehensiveFooter topAreas={topAreas} access={access} />
    </div>
  );
}