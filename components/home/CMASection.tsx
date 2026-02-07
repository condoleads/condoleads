'use client'

import { useEffect, useRef, useState } from 'react'
import { Home, TrendingUp, BarChart3, ArrowRight, Key, Search } from 'lucide-react'

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
      { threshold: 0.2 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="py-16 bg-white" ref={ref}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">

          {/* Left  Buying / Renting */}
          <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-8 text-white transition-all duration-700 ${
            visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-12'
          }`}>
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

            <div className="relative z-10">
              <div className={`flex items-center gap-4 mb-6 transition-all duration-500 delay-200 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}>
                <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
                  <Search className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Looking to Buy or Rent?</h3>
                  <p className="text-blue-200 text-sm">Find your next Toronto condo</p>
                </div>
              </div>

              <div className="space-y-3 mb-8">
                {[
                  { icon: Home, text: 'Browse sale offers across Toronto condos', delay: 300 },
                  { icon: Key, text: 'Explore lease offers with real-time availability', delay: 400 },
                  { icon: BarChart3, text: 'Compare buildings with AI market intelligence', delay: 500 },
                ].map((item, i) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-3 bg-white/10 backdrop-blur rounded-xl px-4 py-3 transition-all duration-500 ${
                        visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-6'
                      }`}
                      style={{ transitionDelay: `${item.delay}ms` }}
                    >
                      <Icon className="w-5 h-5 text-blue-200 flex-shrink-0" />
                      <span className="text-sm text-blue-50">{item.text}</span>
                    </div>
                  )
                })}
              </div>

              
                href="#buildings"
                className={`inline-flex items-center gap-2 bg-white text-blue-700 font-semibold px-6 py-3 rounded-xl hover:bg-blue-50 transition-all duration-500 delay-500 ${
                  visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
              >
                Browse Buildings
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Right  Selling / Leasing */}
          <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-8 text-white transition-all duration-700 ${
            visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'
          }`}>
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

            <div className="relative z-10">
              <div className={`flex items-center gap-4 mb-6 transition-all duration-500 delay-200 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}>
                <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
                  <TrendingUp className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">What's Your Unit Worth?</h3>
                  <p className="text-emerald-200 text-sm">Get prepared before contacting a realtor</p>
                </div>
              </div>

              <div className="space-y-3 mb-8">
                {[
                  { icon: BarChart3, text: 'Get a Digital Comparative Market Analysis (CMA)', delay: 300 },
                  { icon: TrendingUp, text: 'See PSF trends and recent comparable sales', delay: 400 },
                  { icon: Home, text: 'Understand your position before listing or leasing', delay: 500 },
                ].map((item, i) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-3 bg-white/10 backdrop-blur rounded-xl px-4 py-3 transition-all duration-500 ${
                        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6'
                      }`}
                      style={{ transitionDelay: `${item.delay}ms` }}
                    >
                      <Icon className="w-5 h-5 text-emerald-200 flex-shrink-0" />
                      <span className="text-sm text-emerald-50">{item.text}</span>
                    </div>
                  )
                })}
              </div>

              
                href="/estimator"
                className={`inline-flex items-center gap-2 bg-white text-emerald-700 font-semibold px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all duration-500 delay-500 ${
                  visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
              >
                Get AI Estimate
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}