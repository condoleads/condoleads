'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Sparkles, Crown, ArrowRight } from 'lucide-react'

export function VIPTiers() {
  const [active, setActive] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          let i = 0
          const interval = setInterval(() => {
            setActive(i)
            i++
            if (i > 2) clearInterval(interval)
          }, 400)
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const steps = [
    { icon: Search, label: 'Browse', sub: 'Explore free', color: 'from-slate-500 to-slate-600', glow: 'shadow-slate-200' },
    { icon: Sparkles, label: 'Register', sub: 'Unlock insights', color: 'from-blue-500 to-blue-600', glow: 'shadow-blue-200' },
    { icon: Crown, label: 'VIP', sub: 'Full AI access', color: 'from-amber-500 to-amber-600', glow: 'shadow-amber-200' },
  ]

  return (
    <section className="py-16 bg-gradient-to-b from-white to-slate-50" ref={ref}>
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
          Agent-Approved VIP Access
        </h2>
        <p className="text-gray-500 mb-10 text-base">
          Unlock full AI insights in three simple steps
        </p>

        <div className="flex items-center justify-center gap-3 md:gap-6">
          {steps.map((s, i) => {
            const Icon = s.icon
            const isActive = i <= active
            return (
              <div key={i} className="flex items-center gap-3 md:gap-6">
                <div className={`flex flex-col items-center transition-all duration-500 ${
                  isActive ? 'opacity-100 scale-100' : 'opacity-30 scale-90'
                }`}>
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br ${s.color} flex items-center justify-center shadow-lg ${
                    isActive ? s.glow : ''
                  } transition-all duration-500`}>
                    <Icon className="w-7 h-7 md:w-8 md:h-8 text-white" />
                  </div>
                  <p className="mt-3 font-bold text-gray-900 text-sm md:text-base">{s.label}</p>
                  <p className="text-xs text-gray-500">{s.sub}</p>
                </div>
                {i < 2 && (
                  <div className={`transition-all duration-500 ${
                    i < active ? 'opacity-100 text-blue-500' : 'opacity-20 text-gray-300'
                  }`}>
                    <ArrowRight className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className={`mt-10 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-700 ${
          active >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}>
          <Crown className="w-4 h-4 text-amber-600" />
          Your agent personally approves VIP access for the full AI experience
        </div>
      </div>
    </section>
  )
}