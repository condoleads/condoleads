'use client'

import { useEffect, useRef, useState } from 'react'
import { Building2, Home, Key, TrendingUp } from 'lucide-react'

interface StatsSectionProps {
  buildingsCount: number
  developmentsCount: number
  totalForSale: number
  totalForLease: number
}

function AnimatedCounter({ target, duration = 1500 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const animated = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated.current) {
          animated.current = true
          const start = performance.now()
          const step = (now: number) => {
            const progress = Math.min((now - start) / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
            setCount(Math.round(eased * target))
            if (progress < 1) requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [target, duration])

  return <div ref={ref}>{count}</div>
}

export function StatsSection({ buildingsCount, developmentsCount, totalForSale, totalForLease }: StatsSectionProps) {
  const totalBuildings = buildingsCount + developmentsCount
  const totalListings = totalForSale + totalForLease

  const stats = [
    { icon: Building2, value: totalBuildings, label: 'Condo Buildings', sublabel: 'In Portfolio', color: 'from-blue-500 to-blue-600', bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
    { icon: Home, value: totalForSale, label: 'For Sale', sublabel: 'Active Listings', color: 'from-emerald-500 to-emerald-600', bgColor: 'bg-emerald-50', textColor: 'text-emerald-600' },
    { icon: Key, value: totalForLease, label: 'For Lease', sublabel: 'Available Now', color: 'from-sky-500 to-sky-600', bgColor: 'bg-sky-50', textColor: 'text-sky-600' },
    { icon: TrendingUp, value: totalListings, label: 'Total', sublabel: 'Active Listings', color: 'from-purple-500 to-purple-600', bgColor: 'bg-purple-50', textColor: 'text-purple-600' },
  ]

  return (
    <section className="py-8 md:py-12 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="relative group">
              <div className={`${stat.bgColor} rounded-2xl p-4 md:p-6 text-center transition-all duration-300 hover:shadow-lg hover:scale-105`}>
                <div className={`inline-flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br ${stat.color} text-white mb-3 shadow-lg`}>
                  <stat.icon className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                <div className={`text-3xl md:text-4xl font-black ${stat.textColor} mb-1`}>
                  <AnimatedCounter target={stat.value} />
                </div>
                <div className="text-sm md:text-base font-semibold text-gray-900">{stat.label}</div>
                <div className="hidden md:block text-xs text-gray-500 mt-1">{stat.sublabel}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}