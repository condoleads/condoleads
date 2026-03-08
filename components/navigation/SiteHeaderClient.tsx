'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X, ChevronDown, ChevronRight, MapPin, Building2, Home, Search } from 'lucide-react'
import type { NeighbourhoodMenuItem } from './SiteHeader'
import SearchBar from './SearchBar'

interface SiteHeaderClientProps {
  neighbourhoods: NeighbourhoodMenuItem[]
  agentName: string
  agentLogo?: string | null
  primaryColor: string
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
  const [searchOpen, setSearchOpen] = useState(false)
  const megaMenuRef = useRef<HTMLDivElement>(null)
  const megaTriggerRef = useRef<HTMLButtonElement>(null)

  // Scroll detection — transparent → solid
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mega-menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        megaMenuRef.current &&
        !megaMenuRef.current.contains(e.target as Node) &&
        megaTriggerRef.current &&
        !megaTriggerRef.current.contains(e.target as Node)
      ) {
        setMegaMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section)
  }

  const navClasses = [
    'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
    scrolled || mobileOpen
      ? 'bg-white shadow-md'
      : 'bg-transparent',
  ].join(' ')

  const textClasses = scrolled || mobileOpen ? 'text-gray-800' : 'text-white'
  const logoTextClasses = scrolled || mobileOpen ? 'text-gray-900' : 'text-white'

  return (
    <>
      <header className={navClasses}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 md:h-18">

            {/* ── Logo ── */}
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              {agentLogo ? (
                <Image
                  src={agentLogo}
                  alt={agentName}
                  width={120}
                  height={36}
                  className="h-8 w-auto object-contain"
                />
              ) : (
                <span className={`font-bold text-xl tracking-tight ${logoTextClasses}`}>
                  {agentName}
                </span>
              )}
            </Link>

            {/* ── Desktop Nav ── */}
            <nav className="hidden md:flex items-center gap-1">

              {/* Browse — mega-menu trigger */}
              <button
                ref={megaTriggerRef}
                onClick={() => setMegaMenuOpen(o => !o)}
                className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-white/10 ${textClasses}`}
              >
                Browse
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${megaMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <Link
                href="/condos-for-sale"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-white/10 ${textClasses}`}
              >
                Buy
              </Link>
              <Link
                href="/condos-for-lease"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-white/10 ${textClasses}`}
              >
                Rent
              </Link>
            </nav>

            {/* ── Desktop Right Actions ── */}
            <div className="hidden md:flex items-center gap-3 flex-1 justify-end">
              <SearchBar className="max-w-sm" />
              <Link
                href="/vip"
                className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: primaryColor }}
              >
                Get VIP Access
              </Link>
            </div>

            {/* ── Mobile: hamburger only ── */}
            <div className="flex md:hidden items-center">
              <button
                onClick={() => setMobileOpen(o => !o)}
                className={`p-2 rounded-md ${textClasses}`}
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {/* ── No slide-in search panel needed — always visible on desktop, in mobile menu on mobile ── */}
        </div>

        {/* ── Desktop Mega-Menu ── */}
        {megaMenuOpen && (
          <div
            ref={megaMenuRef}
            className="absolute left-0 right-0 top-full bg-white shadow-xl border-t border-gray-100 z-40"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                  Browse Toronto by Neighbourhood
                </p>
              </div>
              <div className="grid grid-cols-3 gap-x-8 gap-y-6">
                {neighbourhoods.map((n) => (
                  <div key={n.id}>
                    <Link
                      href={`/toronto/${n.slug}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={() => setMegaMenuOpen(false)}
                      className="flex items-center justify-between group mb-2"
                    >
                      <span className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {n.name}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        {n.total_buildings.toLocaleString()} buildings
                      </span>
                    </Link>
                    <ul className="space-y-1">
                      {n.communities.map((c) => (
                        <li key={c.slug}>
                          <Link
                            href={`/${c.slug}`}
                            target="_blank" rel="noopener noreferrer"
                            onClick={() => setMegaMenuOpen(false)}
                            className="flex items-center justify-between text-sm text-gray-600 hover:text-blue-600 hover:pl-1 transition-all py-0.5"
                          >
                            <span>{c.name}</span>
                            <span className="text-xs text-gray-300">{c.buildings}</span>
                          </Link>
                        </li>
                      ))}
                      {n.total_communities > 5 && (
                        <li>
                          <Link
                            href={`/toronto/${n.slug}`}
                            target="_blank" rel="noopener noreferrer"
                            onClick={() => setMegaMenuOpen(false)}
                            className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 mt-1"
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

      {/* ── Mobile Menu Overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-white overflow-y-auto pt-16">
          <div className="px-4 py-6 space-y-1">

            {/* Mobile Search */}
            <div className="mb-4">
              <SearchBar placeholder="Search…" autoFocus />
            </div>

            {/* Browse — accordion */}
            <div>
              <button
                onClick={() => toggleSection('browse')}
                className="flex items-center justify-between w-full px-4 py-3 text-left font-semibold text-gray-900 rounded-lg hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  Browse Neighbourhoods
                </span>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === 'browse' ? 'rotate-180' : ''}`} />
              </button>

              {expandedSection === 'browse' && (
                <div className="mt-1 ml-4 border-l-2 border-gray-100 pl-4 space-y-1">
                  {neighbourhoods.map((n) => (
                    <div key={n.id}>
                      <button
                        onClick={() => toggleSection(`n-${n.id}`)}
                        className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-gray-800 rounded-lg hover:bg-gray-50"
                      >
                        <span>{n.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{n.total_buildings}</span>
                          <ChevronDown className={`w-4 h-4 text-gray-300 transition-transform ${expandedSection === `n-${n.id}` ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {expandedSection === `n-${n.id}` && (
                        <div className="ml-3 border-l border-gray-100 pl-3 space-y-0.5 mb-1">
                          {n.communities.map((c) => (
                            <Link
                              key={c.slug}
                              href={`/${c.slug}`}
                              onClick={() => setMobileOpen(false)}
                              className="flex items-center justify-between px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50 hover:text-blue-600"
                            >
                              <span>{c.name}</span>
                              <span className="text-xs text-gray-300">{c.buildings}</span>
                            </Link>
                          ))}
                          {n.total_communities > 5 && (
                            <Link
                              href={`/toronto/${n.slug}`}
                              onClick={() => setMobileOpen(false)}
                              className="flex items-center gap-1 px-3 py-2 text-xs text-blue-500"
                            >
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

            {/* Buy */}
            <Link
              href="/condos-for-sale"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 px-4 py-3 font-medium text-gray-900 rounded-lg hover:bg-gray-50"
            >
              <Building2 className="w-4 h-4 text-gray-400" />
              Buy
            </Link>

            {/* Rent */}
            <Link
              href="/condos-for-lease"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 px-4 py-3 font-medium text-gray-900 rounded-lg hover:bg-gray-50"
            >
              <Home className="w-4 h-4 text-gray-400" />
              Rent
            </Link>

            {/* VIP CTA */}
            <div className="pt-4">
              <Link
                href="/vip"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center w-full py-3 rounded-xl font-semibold text-white text-base"
                style={{ backgroundColor: primaryColor }}
              >
                Get VIP Access
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}