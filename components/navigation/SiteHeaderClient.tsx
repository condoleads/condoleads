'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X, ChevronDown, ChevronRight, MapPin, Building2, Home } from 'lucide-react'
import type { NeighbourhoodMenuItem } from './SiteHeader'
import SearchBar from './SearchBar'
import dynamic from 'next/dynamic'
const AuthStatus = dynamic(() => import('@/components/auth/AuthStatus'), { ssr: false })

interface SiteHeaderClientProps {
  neighbourhoods: NeighbourhoodMenuItem[]
  agentName: string
  agentLogo?: string | null
  primaryColor: string
}

function WalliamWordmark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const iamSize = size === 'sm' ? 13 : 18
  const wallSize = size === 'sm' ? 15 : 20
  const heartSize = size === 'sm' ? 7 : 9
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', lineHeight: 1 }}>
      <span style={{ fontSize: wallSize, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>WALL</span>
      <span style={{ position: 'relative', display: 'inline-block' }}>
        <span style={{ position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)', fontSize: heartSize, color: '#f59e0b', animation: 'walliam-heartbeat 3s ease-in-out infinite', display: 'block', lineHeight: 1 }}>♥</span>
        <span style={{ fontSize: iamSize, fontWeight: 300, color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.01em' }}>ı</span>
      </span>
      <span style={{ fontSize: iamSize, fontWeight: 300, color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.01em' }}>am</span>
      <style>{`@keyframes walliam-heartbeat{0%,45%,100%{transform:translateX(-50%) scale(1)}10%{transform:translateX(-50%) scale(1.4)}30%{transform:translateX(-50%) scale(1.25)}}`}</style>
    </span>
  )
}

// ── Open Charlie helper ───────────────────────────────────────
function openCharlie(form?: 'buyer' | 'seller') {
  window.dispatchEvent(new CustomEvent('charlie:open', { detail: { form } }))
}

export default function SiteHeaderClient({
  neighbourhoods,
  agentName,
  agentLogo,
  primaryColor,
}: SiteHeaderClientProps) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const [megaMenuOpen, setMegaMenuOpen] = useState(false)
  const megaMenuRef = useRef<HTMLDivElement>(null)
  const megaTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        megaMenuRef.current && !megaMenuRef.current.contains(e.target as Node) &&
        megaTriggerRef.current && !megaTriggerRef.current.contains(e.target as Node)
      ) setMegaMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const navClasses = [
    'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
    'bg-[#060b18]/95 shadow-lg backdrop-blur-md',
  ].join(' ')

  const textColor = 'text-white/80 hover:text-white'
  const toggleSection = (s: string) => setExpandedSection(p => p === s ? null : s)

  return (
    <>
      <header className={navClasses}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              {agentLogo ? (
                <Image src={agentLogo} alt={agentName} width={120} height={36} className="h-8 w-auto object-contain" />
              ) : (
                <WalliamWordmark size="md" />
              )}
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              <button
                ref={megaTriggerRef}
                onClick={() => setMegaMenuOpen(o => !o)}
                className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-white/10 ${textColor}`}
              >
                Browse
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${megaMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Buyer Plan */}
              <button
                onClick={() => openCharlie('buyer')}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-all hover:bg-white/10 ${textColor}`}
              >
                Buyer Plan
              </button>

              {/* Seller Plan */}
              <button
                onClick={() => openCharlie('seller')}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-all hover:bg-white/10 ${textColor}`}
              >
                Seller Plan
              </button>
            </nav>

            {/* Desktop Right */}
            <div className="hidden md:flex items-center gap-3 flex-1 justify-end">
              <SearchBar className="max-w-sm" />
              <AuthStatus registrationSource="site_header" />
              <Link
                href="/vip"
                className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: primaryColor }}
              >
                Get VIP Access
              </Link>
            </div>

            {/* Mobile hamburger */}
            <div className="flex md:hidden items-center">
              <button onClick={() => setMobileOpen(o => !o)} className="p-2 rounded-md text-white" aria-label="Toggle menu">
                {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Mega-Menu */}
        {megaMenuOpen && (
          <div ref={megaMenuRef} className="absolute left-0 right-0 top-full bg-[#0d1117] shadow-xl border-t border-white/10 z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
              <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">
                Browse Toronto by Neighbourhood
              </p>
              <div className="grid grid-cols-3 gap-x-8 gap-y-6">
                {neighbourhoods.map(n => (
                  <div key={n.id}>
                    <Link
                      href={`/toronto/${n.slug}`}
                      onClick={() => setMegaMenuOpen(false)}
                      className="flex items-center justify-between group mb-2"
                    >
                      <span className="font-semibold text-white group-hover:text-blue-400 transition-colors">{n.name}</span>
                      <span className="text-xs text-white/30 ml-2">{n.total_buildings.toLocaleString()} buildings</span>
                    </Link>
                    <ul className="space-y-1">
                      {n.communities.map(c => (
                        <li key={c.slug}>
                          <Link
                            href={`/${c.slug}`}
                            onClick={() => setMegaMenuOpen(false)}
                            className="flex items-center justify-between text-sm text-white/50 hover:text-blue-400 hover:pl-1 transition-all py-0.5"
                          >
                            <span>{c.name}</span>
                            <span className="text-xs text-white/20">{c.buildings}</span>
                          </Link>
                        </li>
                      ))}
                      {n.total_communities > 5 && (
                        <li>
                          <Link
                            href={`/toronto/${n.slug}`}
                            onClick={() => setMegaMenuOpen(false)}
                            className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1 mt-1"
                          >
                            View all {n.total_communities} communities
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-[#060b18] overflow-y-auto pt-16">
          <div className="px-4 py-6 space-y-1">
            <div className="mb-4">
              <SearchBar placeholder="Search…" autoFocus />
            </div>

            <div>
              <button
                onClick={() => toggleSection('browse')}
                className="flex items-center justify-between w-full px-4 py-3 text-left font-semibold text-white rounded-lg hover:bg-white/5"
              >
                <span className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-white/40" />
                  Browse Neighbourhoods
                </span>
                <ChevronDown className={`w-5 h-5 text-white/40 transition-transform ${expandedSection === 'browse' ? 'rotate-180' : ''}`} />
              </button>

              {expandedSection === 'browse' && (
                <div className="mt-1 ml-4 border-l-2 border-white/10 pl-4 space-y-1">
                  {neighbourhoods.map(n => (
                    <div key={n.id}>
                      <button
                        onClick={() => toggleSection(`n-${n.id}`)}
                        className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-white/80 rounded-lg hover:bg-white/5"
                      >
                        <span>{n.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/30">{n.total_buildings}</span>
                          <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${expandedSection === `n-${n.id}` ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                      {expandedSection === `n-${n.id}` && (
                        <div className="ml-3 border-l border-white/10 pl-3 space-y-0.5 mb-1">
                          {n.communities.map(c => (
                            <Link key={c.slug} href={`/${c.slug}`} onClick={() => setMobileOpen(false)}
                              className="flex items-center justify-between px-3 py-2 text-sm text-white/50 rounded-lg hover:bg-white/5 hover:text-blue-400">
                              <span>{c.name}</span>
                              <span className="text-xs text-white/20">{c.buildings}</span>
                            </Link>
                          ))}
                          {n.total_communities > 5 && (
                            <Link href={`/toronto/${n.slug}`} onClick={() => setMobileOpen(false)}
                              className="flex items-center gap-1 px-3 py-2 text-xs text-blue-500">
                              View all {n.total_communities} →
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => { openCharlie('buyer'); setMobileOpen(false) }}
              className="flex items-center gap-2 w-full px-4 py-3 font-medium text-white rounded-lg hover:bg-white/5 text-left">
              <Building2 className="w-4 h-4 text-white/40" />
              Buyer Plan
            </button>

            <button onClick={() => { openCharlie('seller'); setMobileOpen(false) }}
              className="flex items-center gap-2 w-full px-4 py-3 font-medium text-white rounded-lg hover:bg-white/5 text-left">
              <Home className="w-4 h-4 text-white/40" />
              Seller Plan
            </button>

            <div className="pt-2 pb-2">
              <AuthStatus registrationSource="site_header_mobile" />
            </div>
            <div className="pt-4">
              <Link href="/vip" onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center w-full py-3 rounded-xl font-semibold text-white text-base"
                style={{ backgroundColor: primaryColor }}>
                Get VIP Access
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}