'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, Shield, Crown, MessageSquare, Calculator, BarChart3, History, ArrowDown, Sparkles } from 'lucide-react'

function JourneyStep({ step, index, isVisible }: { step: any; index: number; isVisible: boolean }) {
  const Icon = step.icon
  return (
    <div
      className={`relative flex items-start gap-6 md:gap-10 transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${index * 200}ms` }}
    >
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-500 ${
          isVisible ? step.dotColor : 'bg-gray-200'
        }`}>
          <Icon className={`w-6 h-6 ${isVisible ? 'text-white' : 'text-gray-400'}`} />
        </div>
        {index < 2 && (
          <div className="relative w-0.5 h-20 md:h-24 mt-2">
            <div className="absolute inset-0 bg-gray-200 rounded-full" />
            <div
              className={`absolute inset-x-0 top-0 bg-gradient-to-b ${step.lineColor} rounded-full transition-all duration-1000 ease-out`}
              style={{ height: isVisible ? '100%' : '0%', transitionDelay: `${index * 200 + 400}ms` }}
            />
          </div>
        )}
      </div>
      <div className={`flex-1 pb-8 md:pb-12`}>
        <div className={`rounded-2xl p-6 transition-all duration-500 ${step.cardBg} ${
          isVisible ? 'shadow-md' : ''
        }`}>
          <div className="flex items-center gap-3 mb-1">
            <span className={`text-xs font-bold uppercase tracking-wider ${step.labelColor}`}>
              {step.label}
            </span>
          </div>
          <h3 className={`text-xl font-bold mb-2 ${step.titleColor}`}>{step.title}</h3>
          <p className={`text-sm mb-4 ${step.descColor}`}>{step.description}</p>
          <div className="flex flex-wrap gap-2">
            {step.features.map((f: string, i: number) => (
              <span
                key={i}
                className={`inline-flex items-center text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-300 ${step.chipStyle}`}
                style={{ transitionDelay: `${index * 200 + 300 + i * 80}ms`, opacity: isVisible ? 1 : 0 }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const journeySteps = [
  {
    icon: Eye,
    label: 'Start Here',
    title: 'Explore Freely',
    description: 'Browse active listings, building details, amenities, and market stats  no account needed.',
    features: ['Active Listings', 'Building Stats', 'Amenities', '1 Free AI Chat', 'Market Overview'],
    dotColor: 'bg-slate-600',
    lineColor: 'from-slate-500 to-blue-500',
    cardBg: 'bg-slate-50 border border-slate-200',
    labelColor: 'text-slate-500',
    titleColor: 'text-slate-900',
    descColor: 'text-slate-600',
    chipStyle: 'bg-white text-slate-700 border border-slate-200',
  },
  {
    icon: Shield,
    label: 'Free Registration',
    title: 'Unlock Market Intelligence',
    description: 'Register with your name and email to access sold prices, transaction history, and extended AI features.',
    features: ['Sold & Leased Prices', 'Transaction History', 'AI Price Estimates', 'Extended AI Chat', 'All Photos'],
    dotColor: 'bg-blue-600',
    lineColor: 'from-blue-500 to-amber-500',
    cardBg: 'bg-blue-50 border border-blue-200',
    labelColor: 'text-blue-600',
    titleColor: 'text-blue-900',
    descColor: 'text-blue-700',
    chipStyle: 'bg-white text-blue-700 border border-blue-200',
  },
  {
    icon: Crown,
    label: 'VIP Access',
    title: 'Full Platform Access',
    description: 'Your agent reviews your registration and unlocks unlimited AI, direct connection, and priority support.',
    features: ['Unlimited AI Chat', 'Unlimited Estimates', 'Direct Agent Line', 'Priority Alerts', 'Personal Advisor'],
    dotColor: 'bg-amber-500',
    lineColor: '',
    cardBg: 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200',
    labelColor: 'text-amber-600',
    titleColor: 'text-amber-900',
    descColor: 'text-amber-700',
    chipStyle: 'bg-white text-amber-700 border border-amber-200',
  },
]

export function VIPTiers() {
  const [visible, setVisible] = useState<boolean[]>([false, false, false])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible([true, true, true])
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="py-20 bg-white" ref={ref}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-amber-50 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold mb-4 border border-blue-100">
            <Sparkles className="w-4 h-4" />
            How It Works
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Your Journey to Smarter Decisions
          </h2>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            More you engage, more intelligence you unlock
          </p>
        </div>
        <div className="relative">
          {journeySteps.map((step, i) => (
            <JourneyStep key={i} step={step} index={i} isVisible={visible[i]} />
          ))}
        </div>
      </div>
    </section>
  )
}