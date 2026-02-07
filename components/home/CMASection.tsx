'use client'

import { useEffect, useRef, useState } from 'react'
import { TrendingUp, ArrowRight, Search } from 'lucide-react'

export function CMASection() {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="py-12 bg-white" ref={ref}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-4 lg:gap-6">

          {/* Buy / Rent */}
          <a
            href="#buildings"
            className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-6 md:p-8 text-white cursor-pointer transition-all duration-700 hover:shadow-2xl hover:shadow-blue-500/25 hover:scale-[1.02] ${
              visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-16'
            }`}
          >
            {/* Animated bg circle */}
            <div className={`absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10 transition-all duration-1000 ${
              visible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            }`} style={{ transitionDelay: '300ms' }} />
            <div className={`absolute -left-4 -bottom-4 w-24 h-24 rounded-full bg-white/5 transition-all duration-1000 ${
              visible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            }`} style={{ transitionDelay: '500ms' }} />

            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center transition-all duration-500 group-hover:rotate-6 group-hover:scale-110 ${
                  visible ? 'scale-100 rotate-0' : 'scale-0 rotate-45'
                }`} style={{ transitionDelay: '200ms' }}>
                  <Search className="w-7 h-7" />
                </div>
                <div>
                  <h3 className={`text-xl md:text-2xl font-bold transition-all duration-500 ${
                    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                  }`} style={{ transitionDelay: '300ms' }}>
                    Buy or Rent
                  </h3>
                  <p className={`text-blue-200 text-sm transition-all duration-500 ${
                    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                  }`} style={{ transitionDelay: '400ms' }}>
                    Sale &amp; lease offers
                  </p>
                </div>
              </div>
              <ArrowRight className={`w-6 h-6 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all duration-500 ${
                visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
              }`} style={{ transitionDelay: '500ms' }} />
            </div>

            {/* Animated stat pills */}
            <div className="relative z-10 flex flex-wrap gap-2 mt-5">
              {['Active Listings', 'Building Intel', 'AI Insights'].map((t, i) => (
                <span
                  key={i}
                  className={`text-xs font-medium bg-white/10 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 transition-all duration-500 group-hover:bg-white/20 ${
                    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                  }`}
                  style={{ transitionDelay: `${500 + i * 100}ms` }}
                >
                  {t}
                </span>
              ))}
            </div>
          </a>

          {/* Sell / Lease — CMA */}
          <a
            href="/estimator"
            className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 md:p-8 text-white cursor-pointer transition-all duration-700 hover:shadow-2xl hover:shadow-emerald-500/25 hover:scale-[1.02] ${
              visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-16'
            }`}
          >
            <div className={`absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10 transition-all duration-1000 ${
              visible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            }`} style={{ transitionDelay: '400ms' }} />
            <div className={`absolute -left-4 -bottom-4 w-24 h-24 rounded-full bg-white/5 transition-all duration-1000 ${
              visible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            }`} style={{ transitionDelay: '600ms' }} />

            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center transition-all duration-500 group-hover:-rotate-6 group-hover:scale-110 ${
                  visible ? 'scale-100 rotate-0' : 'scale-0 -rotate-45'
                }`} style={{ transitionDelay: '300ms' }}>
                  <TrendingUp className="w-7 h-7" />
                </div>
                <div>
                  <h3 className={`text-xl md:text-2xl font-bold transition-all duration-500 ${
                    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                  }`} style={{ transitionDelay: '400ms' }}>
                    {"What's It Worth?"}
                  </h3>
                  <p className={`text-emerald-200 text-sm transition-all duration-500 ${
                    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                  }`} style={{ transitionDelay: '500ms' }}>
                    Digital CMA before you call
                  </p>
                </div>
              </div>
              <ArrowRight className={`w-6 h-6 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all duration-500 ${
                visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
              }`} style={{ transitionDelay: '600ms' }} />
            </div>

            <div className="relative z-10 flex flex-wrap gap-2 mt-5">
              {['Price Estimate', 'PSF Trends', 'Comparable Sales'].map((t, i) => (
                <span
                  key={i}
                  className={`text-xs font-medium bg-white/10 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 transition-all duration-500 group-hover:bg-white/20 ${
                    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                  }`}
                  style={{ transitionDelay: `${600 + i * 100}ms` }}
                >
                  {t}
                </span>
              ))}
            </div>
          </a>

        </div>
      </div>
    </section>
  )
}