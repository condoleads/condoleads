'use client'

import { Building2, Sparkles, Crown } from 'lucide-react'

const steps = [
  {
    num: 1,
    icon: Building2,
    title: 'Explore',
    desc: 'Browse buildings, listings & market stats',
    tags: ['Listings', 'Stats', 'Amenities'],
    color: 'bg-blue-600',
    tagBg: 'bg-blue-50 text-blue-700',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  {
    num: 2,
    icon: Sparkles,
    title: 'AI Insights',
    desc: 'Chat with AI, get estimates & PSF analytics',
    tags: ['AI Chat', 'Estimates', 'PSF Data'],
    color: 'bg-purple-600',
    tagBg: 'bg-purple-50 text-purple-700',
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
  },
  {
    num: 3,
    icon: Crown,
    title: 'VIP Access',
    desc: 'Unlock sold prices, unlimited AI & agent support',
    tags: ['Sold Prices', 'Unlimited AI', 'Agent'],
    color: 'bg-emerald-600',
    tagBg: 'bg-emerald-50 text-emerald-700',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
]

export function HowItWorks() {
  return (
    <div className="py-12 md:py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8 md:mb-12">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold mb-3">
            <Sparkles className="w-4 h-4" />
            AI-Powered Experience
          </div>
          <h2 className="text-2xl md:text-4xl font-bold text-gray-900 mb-2">
            Your AI Condo Advisor
          </h2>
          <p className="text-sm md:text-lg text-gray-600 max-w-2xl mx-auto">
            Intelligent market analysis for smarter decisions
          </p>
        </div>

        {/* Mobile: horizontal scroll */}
        <div className="flex md:hidden gap-3 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {steps.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.num} className="flex-shrink-0 w-[75vw] snap-center">
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 h-full">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-full ${s.color} text-white flex items-center justify-center font-bold text-sm`}>
                      {s.num}
                    </div>
                    <div className={`w-10 h-10 rounded-lg ${s.iconBg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${s.iconColor}`} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{s.title}</h3>
                  </div>
                  <p className="text-gray-600 text-sm mb-3">{s.desc}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.tags.map((t, i) => (
                      <span key={i} className={`text-[11px] ${s.tagBg} px-2 py-1 rounded-full font-medium`}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop: 3 column grid */}
        <div className="hidden md:grid md:grid-cols-3 gap-6">
          {steps.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.num} className="bg-white rounded-2xl p-7 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100">
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-10 h-10 rounded-full ${s.color} text-white flex items-center justify-center font-bold text-lg`}>
                    {s.num}
                  </div>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <div className={`w-12 h-12 rounded-xl ${s.iconBg} flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${s.iconColor}`} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">{s.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {s.tags.map((t, i) => (
                    <span key={i} className={`text-xs ${s.tagBg} px-2.5 py-1 rounded-full font-medium`}>{t}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}