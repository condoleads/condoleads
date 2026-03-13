import GeoStatPill from './GeoStatPill'
import Link from 'next/link'

interface Breadcrumb {
  label: string
  href: string
}

interface GeoHeroStats {
  active: number
  sold: number
  leased: number
  buildings: number
  communities?: number
  municipalities?: number
}

interface GeoHeroProps {
  title: string
  subtitle?: string
  breadcrumbs: Breadcrumb[]
  stats: GeoHeroStats
  geoType: 'area' | 'municipality' | 'community' | 'neighbourhood'
}

export default function GeoHero({ title, subtitle, breadcrumbs, stats, geoType }: GeoHeroProps) {
  return (
    <div className="relative w-full overflow-hidden" style={{ minHeight: '340px' }}>

      {/* Base gradient */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f2456 100%)'
      }} />

      {/* Dot grid texture */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        opacity: 0.6,
      }} />

      {/* Blue glow — top right */}
      <div className="absolute" style={{
        top: '-80px', right: '-80px',
        width: '500px', height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.35) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Indigo glow — bottom left */}
      <div className="absolute" style={{
        bottom: '-60px', left: '-60px',
        width: '380px', height: '380px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Bottom fade to white */}
      <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none" style={{
        background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.06))'
      }} />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-12 md:pt-14 md:pb-16">

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 mb-8 flex-wrap">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <svg className="w-3 h-3 text-white/25 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
              {i < breadcrumbs.length - 1 ? (
                <Link
                  href={crumb.href}
                  className="text-xs font-medium text-white/50 hover:text-white/90 transition-colors px-3 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className="text-xs font-semibold text-white px-3 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>

        {/* Geo type label */}
        <div className="inline-flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
            {geoType === 'area' ? 'Region' : geoType === 'municipality' ? 'Municipality' : geoType === 'neighbourhood' ? 'Neighbourhood' : 'Community'}
          </span>
          <span className="w-8 h-px bg-blue-400/50" />
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-none mb-3">
          {title}
        </h1>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-base md:text-lg text-white/50 font-light mb-10 tracking-wide">
            {subtitle}
          </p>
        )}

        {/* Stat Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '32px', justifyContent: 'center' }}>
          <GeoStatPill value={stats.active} label="Active" />
          <GeoStatPill value={stats.sold} label="Sold" />
          <GeoStatPill value={stats.leased} label="Leased" />
          {stats.buildings > 0 && (
            <GeoStatPill value={stats.buildings} label="Buildings" />
          )}
          {stats.communities !== undefined && stats.communities > 0 && (
            <GeoStatPill value={stats.communities} label="Communities" />
          )}
          {stats.municipalities !== undefined && stats.municipalities > 0 && (
            <GeoStatPill value={stats.municipalities} label="Municipalities" />
          )}
        </div>
      </div>
    </div>
  )
}
