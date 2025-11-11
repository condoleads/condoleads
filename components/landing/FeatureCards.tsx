'use client'

import { useState } from 'react'
import { Building2, TrendingUp, Smartphone, Mail, BarChart3, CheckCircle, ChevronDown } from 'lucide-react'

export default function FeatureCards() {
  const [expandedCard, setExpandedCard] = useState<number | null>(null)

  const features = [
    {
      icon: Building2,
      title: 'Your Buildings',
      subtitle: 'Showcase unlimited condos',
      description: 'Display all your assigned buildings with stunning galleries, floor plans, and real-time listing data. Auto-updated from MLS daily.',
      color: 'blue',
      details: [
        'Unlimited building profiles',
        'Auto-synced MLS data',
        'Beautiful photo galleries',
        'Floor plans & amenities',
        'Active listings display'
      ]
    },
    {
      icon: TrendingUp,
      title: 'AI Estimates',
      subtitle: 'Capture leads while they browse',
      description: 'Instant property valuations powered by real market data. Visitors get estimates, you get their contact info automatically.',
      color: 'purple',
      details: [
        'Real-time market data',
        'Instant valuations',
        'Automatic lead capture',
        'Email notifications',
        'Mobile-friendly widget'
      ]
    },
    {
      icon: Smartphone,
      title: 'Mobile Perfect',
      subtitle: '60% of traffic is mobile',
      description: 'Your website looks stunning on any device. Responsive design ensures perfect display on phones, tablets, and desktops.',
      color: 'green',
      details: [
        'Responsive design',
        'Fast loading times',
        'Touch-optimized',
        'Works offline',
        'App-like experience'
      ]
    },
    {
      icon: Mail,
      title: 'Lead Alerts',
      subtitle: 'Instant alerts to your inbox',
      description: 'Get notified immediately when someone requests an estimate or contacts you. Never miss an opportunity.',
      color: 'yellow',
      details: [
        'Instant email alerts',
        'SMS notifications (optional)',
        'Lead details included',
        'Timestamps & source',
        'Direct response links'
      ]
    },
    {
      icon: BarChart3,
      title: 'Your Dashboard',
      subtitle: 'Track leads and stats',
      description: 'Manage everything in one place. See your leads, track conversions, update content, and monitor performance.',
      color: 'indigo',
      details: [
        'Lead management',
        'Conversion tracking',
        'Performance analytics',
        'Content updates',
        'Building assignments'
      ]
    },
    {
      icon: CheckCircle,
      title: 'RECO Compliant',
      subtitle: 'Automatically compliant',
      description: 'We handle all RECO regulations automatically. Your brokerage info displays correctly, and disclaimers are included.',
      color: 'emerald',
      details: [
        'Automatic compliance',
        'Brokerage display',
        'Required disclaimers',
        'IDX/VOW compliant',
        'Regular updates'
      ]
    }
  ]

  const getColorClasses = (color: string, expanded: boolean) => {
    const colors = {
      blue: {
        bg: expanded ? 'bg-blue-50' : 'bg-white',
        icon: 'bg-blue-100 text-blue-600',
        border: 'border-blue-200',
        hover: 'hover:border-blue-300'
      },
      purple: {
        bg: expanded ? 'bg-purple-50' : 'bg-white',
        icon: 'bg-purple-100 text-purple-600',
        border: 'border-purple-200',
        hover: 'hover:border-purple-300'
      },
      green: {
        bg: expanded ? 'bg-green-50' : 'bg-white',
        icon: 'bg-green-100 text-green-600',
        border: 'border-green-200',
        hover: 'hover:border-green-300'
      },
      yellow: {
        bg: expanded ? 'bg-yellow-50' : 'bg-white',
        icon: 'bg-yellow-100 text-yellow-600',
        border: 'border-yellow-200',
        hover: 'hover:border-yellow-300'
      },
      indigo: {
        bg: expanded ? 'bg-indigo-50' : 'bg-white',
        icon: 'bg-indigo-100 text-indigo-600',
        border: 'border-indigo-200',
        hover: 'hover:border-indigo-300'
      },
      emerald: {
        bg: expanded ? 'bg-emerald-50' : 'bg-white',
        icon: 'bg-emerald-100 text-emerald-600',
        border: 'border-emerald-200',
        hover: 'hover:border-emerald-300'
      }
    }
    return colors[color as keyof typeof colors]
  }

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Everything You Need. Nothing You Don't.
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Click any card to explore features built specifically for Toronto condo agents
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon
            const isExpanded = expandedCard === index
            const colorClasses = getColorClasses(feature.color, isExpanded)

            return (
              <div
                key={index}
                onClick={() => setExpandedCard(isExpanded ? null : index)}
                className={`
                  ${colorClasses.bg} ${colorClasses.border} ${colorClasses.hover}
                  border-2 rounded-2xl p-6 cursor-pointer transition-all duration-300
                  transform hover:scale-105 hover:shadow-xl
                  ${isExpanded ? 'md:col-span-2 lg:col-span-1 shadow-2xl' : 'shadow-lg'}
                `}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 rounded-xl ${colorClasses.icon} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-7 h-7" />
                  </div>
                  <ChevronDown 
                    className={`w-6 h-6 text-gray-400 transition-transform duration-300 ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </div>

                {/* Card Content */}
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm font-semibold text-gray-600 mb-3">
                  {feature.subtitle}
                </p>
                <p className="text-gray-700 mb-4">
                  {feature.description}
                </p>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-6 pt-6 border-t-2 border-gray-200">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Key Features:</p>
                    <ul className="space-y-2">
                      {feature.details.map((detail, detailIndex) => (
                        <li key={detailIndex} className="flex items-center gap-2 text-gray-700">
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Click Hint */}
                {!isExpanded && (
                  <p className="text-xs text-gray-500 mt-4">
                    Click to see more 
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <p className="text-xl text-gray-600 mb-6">
            Ready to get all these features?
          </p>
          <button 
            onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            See Pricing & Demo
          </button>
        </div>
      </div>
    </section>
  )
}
