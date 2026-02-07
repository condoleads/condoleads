'use client'

import { useEffect, useRef, useState } from 'react'
import { TrendingUp, ArrowRight, Check, Building2 } from 'lucide-react'

function AnimatedCounter({ target, prefix = '', suffix = '', duration = 1200, delay = 0, start }: {
  target: number; prefix?: string; suffix?: string; duration?: number; delay?: number; start: boolean
}) {
  const [count, setCount] = useState(0)
  const animated = useRef(false)

  useEffect(() => {
    if (!start || animated.current) return
    const timer = setTimeout(() => {
      animated.current = true
      const begin = performance.now()
      const step = (now: number) => {
        const p = Math.min((now - begin) / duration, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        setCount(Math.round(eased * target))
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }, delay)
    return () => clearTimeout(timer)
  }, [start, target, duration, delay])

  return <span>{prefix}{count.toLocaleString()}{suffix}</span>
}

function AnimatedBar({ height, delay, start, color }: {
  height: number; delay: number; start: boolean; color: string
}) {
  return (
    <div className="flex-1 flex flex-col justify-end items-center h-full">
      <div
        className={`w-full rounded-t-sm transition-all ease-out ${color}`}
        style={{
          height: start ? `${height}%` : '0%',
          transitionDuration: '800ms',
          transitionDelay: `${delay}ms`,
        }}
      />
    </div>
  )
}

export function CMASection() {
  const [visible, setVisible] = useState(false)
  const [hovered, setHovered] = useState(false)
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
      { threshold: 0.25 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const bars = [
    { height: 45, color: 'bg-blue-300', delay: 600 },
    { height: 65, color: 'bg-blue-400', delay: 750 },
    { height: 80, color: 'bg-blue-500', delay: 900 },
    { height: 55, color: 'bg-blue-400', delay: 1050 },
    { height: 70, color: 'bg-emerald-500', delay: 1200 },
    { height: 90, color: 'bg-emerald-400', delay: 1350 },
  ]

  return (
    <section className="py-14 bg-gradient-to-b from-white to-slate-50" ref={ref}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <a
          href="/estimator"
          className="group block"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 transition-all duration-700 hover:shadow-2xl hover:shadow-blue-500/15 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}>
            {/* Ambient glow */}
            <div className={`absolute -top-20 -right-20 w-72 h-72 rounded-full transition-all duration-1000 ${
              hovered ? 'bg-blue-500/15 scale-110' : 'bg-blue-500/5 scale-100'
            }`} />
            <div className={`absolute -bottom-16 -left-16 w-56 h-56 rounded-full transition-all duration-1000 ${
              hovered ? 'bg-emerald-500/15 scale-110' : 'bg-emerald-500/5 scale-100'
            }`} />

            <div className="relative z-10 grid md:grid-cols-2 gap-8 p-8 md:p-10">
              
              {/* Left — Message */}
              <div className="flex flex-col justify-center">
                <div className={`inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-300 px-3 py-1.5 rounded-full text-xs font-semibold mb-5 w-fit transition-all duration-500 ${
                  visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`} style={{ transitionDelay: '100ms' }}>
                  <TrendingUp className="w-3.5 h-3.5" />
                  AI-Powered Valuations
                </div>

                <h2 className={`text-3xl md:text-4xl font-bold text-white mb-3 leading-tight transition-all duration-600 ${
                  visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                }`} style={{ transitionDelay: '200ms' }}>
                  Digital{' '}
                  <span className="relative inline-block">
                    <span className={`bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent transition-all duration-500 ${
                      hovered ? 'opacity-0' : 'opacity-100'
                    }`}>
                      CMA
                    </span>
                    <span className={`absolute inset-0 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent whitespace-nowrap transition-all duration-500 ${
                      hovered ? 'opacity-100' : 'opacity-0'
                    }`}>
                      Comparative Market Analysis
                    </span>
                  </span>
                  <br />
                  <span className="text-slate-300 text-2xl md:text-3xl font-semibold">at Your Fingertips</span>
                </h2>

                <p className={`text-slate-400 text-base mb-6 max-w-md transition-all duration-500 ${
                  visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`} style={{ transitionDelay: '400ms' }}>
                  Whether buying or selling — know the real market value before contacting your agent.
                </p>

                <div className={`inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-semibold px-6 py-3 rounded-xl w-fit group-hover:shadow-lg group-hover:shadow-blue-500/25 transition-all duration-500 ${
                  visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`} style={{ transitionDelay: '500ms' }}>
                  Get Your CMA
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                </div>
              </div>

              {/* Right — Animated CMA Report Card */}
              <div className={`transition-all duration-700 ${
                visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'
              }`} style={{ transitionDelay: '300ms' }}>
                <div className={`bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6 transition-all duration-500 ${
                  hovered ? 'bg-white/10 border-white/20 shadow-lg' : ''
                }`}>
                  {/* Report header */}
                  <div className={`flex items-center gap-3 mb-5 transition-all duration-500 ${
                    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                  }`} style={{ transitionDelay: '500ms' }}>
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">101 Charles St E</p>
                      <p className="text-slate-500 text-xs">Unit 2801 &middot; 2 Bed &middot; 850 sqft</p>
                    </div>
                  </div>

                  {/* Animated chart */}
                  <div className="mb-5">
                    <p className={`text-[10px] uppercase tracking-wider text-slate-500 mb-2 transition-all duration-500 ${
                      visible ? 'opacity-100' : 'opacity-0'
                    }`} style={{ transitionDelay: '600ms' }}>
                      Comparable Sales PSF
                    </p>
                    <div className="flex items-end gap-1.5 h-20">
                      {bars.map((bar, i) => (
                        <AnimatedBar key={i} height={bar.height} delay={bar.delay} start={visible} color={bar.color} />
                      ))}
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[9px] text-slate-600">Comparables</span>
                      <span className="text-[9px] text-emerald-400 font-medium">Your Unit</span>
                    </div>
                  </div>

                  {/* Animated values */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`bg-white/5 rounded-xl p-3 transition-all duration-500 ${
                      visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                    }`} style={{ transitionDelay: '1400ms' }}>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Avg PSF</p>
                      <p className="text-xl font-bold text-blue-400">
                        <AnimatedCounter target={1247} prefix="$" duration={1000} delay={1500} start={visible} />
                      </p>
                    </div>
                    <div className={`bg-white/5 rounded-xl p-3 transition-all duration-500 ${
                      visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                    }`} style={{ transitionDelay: '1600ms' }}>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Estimated Value</p>
                      <p className="text-xl font-bold text-emerald-400">
                        <AnimatedCounter target={685} prefix="$" suffix="K" duration={1000} delay={1700} start={visible} />
                      </p>
                    </div>
                  </div>

                  {/* Completion checkmark */}
                  <div className={`flex items-center justify-center gap-2 mt-4 transition-all duration-500 ${
                    visible ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
                  }`} style={{ transitionDelay: '2400ms' }}>
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </div>
                    <span className="text-xs text-emerald-400 font-medium">CMA Report Ready</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </a>
      </div>
    </section>
  )
}