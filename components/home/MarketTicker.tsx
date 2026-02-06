'use client'

import { useEffect, useRef, useState } from 'react'
import { Home, Key } from 'lucide-react'

interface TickerListing {
  unitNumber: string
  price: number
  type: string
  bedrooms: number
  dom: number | null
  buildingName: string
  slug: string
}

function formatPrice(price: number, type: string): string {
  if (type === 'For Lease' || type === 'For Sub-Lease') {
    return '$' + price.toLocaleString() + '/mo'
  }
  if (price >= 1000000) {
    return '$' + (price / 1000000).toFixed(2) + 'M'
  }
  return '$' + price.toLocaleString()
}

function bedroomLabel(beds: number): string {
  if (beds === 0) return 'Studio'
  return beds + 'BR'
}

export function MarketTicker({ agentId }: { agentId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [listings, setListings] = useState<TickerListing[]>([])
  const animRef = useRef<number>(0)
  const posRef = useRef(0)

  useEffect(() => {
    fetch('/api/market-ticker?agentId=' + agentId)
      .then(function(r) { return r.json() })
      .then(function(data) { setListings(data.items || []) })
      .catch(function() {})
  }, [agentId])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || listings.length === 0) return

    const scroll = () => {
      posRef.current += 0.5
      if (posRef.current >= el.scrollWidth / 2) posRef.current = 0
      el.scrollLeft = posRef.current
      animRef.current = requestAnimationFrame(scroll)
    }
    animRef.current = requestAnimationFrame(scroll)

    const pause = () => cancelAnimationFrame(animRef.current)
    const resume = () => { animRef.current = requestAnimationFrame(scroll) }

    el.addEventListener('mouseenter', pause)
    el.addEventListener('mouseleave', resume)

    return () => {
      cancelAnimationFrame(animRef.current)
      el.removeEventListener('mouseenter', pause)
      el.removeEventListener('mouseleave', resume)
    }
  }, [listings])

  if (listings.length === 0) return null

  var doubled = listings.concat(listings)

  return (
    <div className="bg-slate-950 border-y border-white/5 py-3 overflow-hidden">
      <div ref={scrollRef} className="flex gap-8 overflow-hidden whitespace-nowrap" style={{ scrollBehavior: 'auto' }}>
        {doubled.map(function(item, i) {
          var isSale = item.type === 'For Sale'
          var badgeClass = isSale
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-blue-500/20 text-blue-400'
          var label = isSale ? 'FOR SALE' : 'FOR LEASE'
          var href = '/' + item.slug

          return (
            <a key={i} href={href} className="flex items-center gap-3 flex-shrink-0 px-2 hover:opacity-80 transition-opacity">
              <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ' + badgeClass}>
                {isSale ? <Home className="w-3 h-3" /> : <Key className="w-3 h-3" />}
                {label}
              </span>
              <span className="text-sm text-slate-300">
                {bedroomLabel(item.bedrooms)} Unit {item.unitNumber} at {item.buildingName}  {formatPrice(item.price, item.type)}
              </span>
              <span className="text-slate-700"></span>
            </a>
          )
        })}
      </div>
    </div>
  )
}