'use client'

import { useEffect, useState, useRef } from 'react'
import { TrendingUp, TrendingDown, ArrowRight, Sparkles } from 'lucide-react'

interface TickerItem {
  text: string
  type: 'sale' | 'lease' | 'listed' | 'insight'
}

const TICKER_ITEMS: TickerItem[] = [
  { text: 'Unit 2103 at 88 Scott sold for $1,245,000', type: 'sale' },
  { text: 'New listing: 1BR at One Bloor  $2,850/mo', type: 'listed' },
  { text: 'Average PSF in C01 up 3.2% this quarter', type: 'insight' },
  { text: 'Unit 1504 at X2 Condos leased for $3,100/mo', type: 'lease' },
  { text: '2BR units at Harbour Plaza  12 days avg on market', type: 'insight' },
  { text: 'New listing: 2BR+Den at 88 Scott  $879,000', type: 'listed' },
  { text: 'Studio demand up 18% in Bay Street Corridor', type: 'insight' },
  { text: 'Unit 808 at Liberty Market sold for $695,000', type: 'sale' },
]

function TickerBadge({ type }: { type: TickerItem['type'] }) {
  const config = {
    sale: { label: 'SOLD', bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: TrendingUp },
    lease: { label: 'LEASED', bg: 'bg-blue-500/20', text: 'text-blue-400', icon: ArrowRight },
    listed: { label: 'NEW', bg: 'bg-amber-500/20', text: 'text-amber-400', icon: Sparkles },
    insight: { label: 'TREND', bg: 'bg-purple-500/20', text: 'text-purple-400', icon: TrendingUp },
  }
  const c = config[type]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${c.bg} ${c.text}`}>
      <c.icon className="w-3 h-3" />
      {c.label}
    </span>
  )
}

export function MarketTicker() {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let animFrame: number
    let pos = 0

    const scroll = () => {
      pos += 0.5
      if (pos >= el.scrollWidth / 2) pos = 0
      el.scrollLeft = pos
      animFrame = requestAnimationFrame(scroll)
    }
    animFrame = requestAnimationFrame(scroll)

    const pause = () => cancelAnimationFrame(animFrame)
    const resume = () => { animFrame = requestAnimationFrame(scroll) }

    el.addEventListener('mouseenter', pause)
    el.addEventListener('mouseleave', resume)

    return () => {
      cancelAnimationFrame(animFrame)
      el.removeEventListener('mouseenter', pause)
      el.removeEventListener('mouseleave', resume)
    }
  }, [])

  // Double the items for seamless loop
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS]

  return (
    <div className="bg-slate-950 border-y border-white/5 py-3 overflow-hidden">
      <div ref={scrollRef} className="flex gap-8 overflow-hidden whitespace-nowrap" style={{ scrollBehavior: 'auto' }}>
        {doubled.map((item, i) => (
          <div key={i} className="flex items-center gap-3 flex-shrink-0 px-2">
            <TickerBadge type={item.type} />
            <span className="text-sm text-slate-300">{item.text}</span>
            <span className="text-slate-700"></span>
          </div>
        ))}
      </div>
    </div>
  )
}