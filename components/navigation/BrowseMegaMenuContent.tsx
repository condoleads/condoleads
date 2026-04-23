'use client'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { NeighbourhoodMenuItem } from './SiteHeader'

interface Props {
  neighbourhoods: NeighbourhoodMenuItem[]
  onNavigate?: () => void
  openInNewTab?: boolean
}

export default function BrowseMegaMenuContent({ neighbourhoods, onNavigate, openInNewTab = false }: Props) {
  const linkProps = openInNewTab ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {}
  return (
    <div>
      <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">
        Browse Toronto by Neighbourhood
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
        {neighbourhoods.map(n => (
          <div key={n.id}>
            <Link
              href={`/toronto/${n.slug}`}
              onClick={onNavigate}
              className="flex items-center justify-between group mb-2"
              {...linkProps}
            >
              <span className="font-semibold text-white group-hover:text-blue-400 transition-colors">{n.name}</span>
              <span className="text-xs text-white/30 ml-2">{n.total_buildings.toLocaleString()} buildings</span>
            </Link>
            <ul className="space-y-1">
              {n.communities.map(c => (
                <li key={c.slug}>
                  <Link
                    href={`/${c.slug}`}
                    onClick={onNavigate}
                    className="flex items-center justify-between text-sm text-white/50 hover:text-blue-400 hover:pl-1 transition-all py-0.5"
                    {...linkProps}
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
                    onClick={onNavigate}
                    className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1 mt-1"
                    {...linkProps}
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
  )
}