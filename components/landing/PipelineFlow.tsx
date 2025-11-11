'use client'

import { useEffect, useState } from 'react'
import { Search, Globe, FileText, Mail, Phone, DollarSign } from 'lucide-react'

export default function PipelineFlow() {
  const [activeStep, setActiveStep] = useState(0)

  const steps = [
    {
      icon: Search,
      title: 'Buyer/Seller Searches',
      subtitle: 'Google',
      color: 'bg-red-500',
      textColor: 'text-red-600'
    },
    {
      icon: Globe,
      title: 'Finds YOUR Site',
      subtitle: 'yourname.condoleads.ca',
      color: 'bg-blue-500',
      textColor: 'text-blue-600'
    },
    {
      icon: FileText,
      title: 'Requests Info',
      subtitle: 'Uses Estimator',
      color: 'bg-purple-500',
      textColor: 'text-purple-600'
    },
    {
      icon: Mail,
      title: 'YOU Get Notified',
      subtitle: 'Instant Email',
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600'
    },
    {
      icon: Phone,
      title: 'You Follow Up',
      subtitle: 'Call/Text',
      color: 'bg-green-500',
      textColor: 'text-green-600'
    },
    {
      icon: DollarSign,
      title: 'Close Deal',
      subtitle: 'Commission',
      color: 'bg-emerald-600',
      textColor: 'text-emerald-600'
    }
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length)
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Your Lead Pipeline - Automated
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Watch how buyers flow from search to closed deal, all through your branded website
          </p>
        </div>

        {/* Pipeline Flow - Desktop */}
        <div className="hidden md:block">
          <div className="relative">
            {/* Connection Lines */}
            <div className="absolute top-24 left-0 right-0 h-1 bg-gray-200">
              <div 
                className="h-full bg-gradient-to-r from-red-500 via-blue-500 to-emerald-600 transition-all duration-1000"
                style={{ 
                  width: `${((activeStep + 1) / steps.length) * 100}%` 
                }}
              />
            </div>

            {/* Steps */}
            <div className="grid grid-cols-6 gap-4">
              {steps.map((step, index) => {
                const Icon = step.icon
                const isActive = index === activeStep
                const isPast = index < activeStep

                return (
                  <div key={index} className="text-center">
                    {/* Icon Circle */}
                    <div className="relative mb-8">
                      <div
                        className={`
                          w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all duration-500
                          ${isActive ? `${step.color} scale-110 shadow-2xl` : isPast ? `${step.color}` : 'bg-gray-200'}
                        `}
                      >
                        <Icon 
                          className={`w-12 h-12 transition-all duration-500 ${
                            isActive || isPast ? 'text-white' : 'text-gray-400'
                          }`} 
                        />
                      </div>

                      {/* Active Pulse Animation */}
                      {isActive && (
                        <div className={`absolute inset-0 rounded-full ${step.color} animate-ping opacity-75`} />
                      )}

                      {/* Step Number */}
                      <div
                        className={`
                          absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                          ${isActive || isPast ? `${step.color} text-white` : 'bg-gray-300 text-gray-600'}
                        `}
                      >
                        {index + 1}
                      </div>
                    </div>

                    {/* Text */}
                    <div>
                      <h3
                        className={`
                          text-lg font-bold mb-1 transition-all duration-500
                          ${isActive ? step.textColor : isPast ? 'text-gray-700' : 'text-gray-400'}
                        `}
                      >
                        {step.title}
                      </h3>
                      <p
                        className={`
                          text-sm transition-all duration-500
                          ${isActive ? 'text-gray-700 font-semibold' : 'text-gray-500'}
                        `}
                      >
                        {step.subtitle}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Pipeline Flow - Mobile */}
        <div className="md:hidden space-y-6">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = index === activeStep
            const isPast = index < activeStep

            return (
              <div key={index} className="relative">
                {/* Connection Line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-8 top-16 bottom-0 w-1 bg-gray-200">
                    {isPast && (
                      <div className={`w-full h-full ${step.color}`} />
                    )}
                  </div>
                )}

                {/* Step Card */}
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className="relative flex-shrink-0">
                    <div
                      className={`
                        w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500
                        ${isActive ? `${step.color} scale-110 shadow-xl` : isPast ? `${step.color}` : 'bg-gray-200'}
                      `}
                    >
                      <Icon 
                        className={`w-8 h-8 ${
                          isActive || isPast ? 'text-white' : 'text-gray-400'
                        }`} 
                      />
                    </div>
                    {isActive && (
                      <div className={`absolute inset-0 rounded-full ${step.color} animate-ping opacity-75`} />
                    )}
                    <div
                      className={`
                        absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                        ${isActive || isPast ? `${step.color} text-white` : 'bg-gray-300 text-gray-600'}
                      `}
                    >
                      {index + 1}
                    </div>
                  </div>

                  {/* Text */}
                  <div className="flex-1">
                    <h3
                      className={`
                        text-lg font-bold mb-1
                        ${isActive ? step.textColor : isPast ? 'text-gray-700' : 'text-gray-400'}
                      `}
                    >
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-500">{step.subtitle}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Stats Counter */}
        <div className="mt-16 text-center">
          <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl p-8 max-w-md mx-auto border-2 border-blue-100">
            <p className="text-sm font-semibold text-gray-600 mb-2">AVERAGE TIME</p>
            <p className="text-5xl font-bold text-gray-900 mb-2">18 Days</p>
            <p className="text-gray-600">From first contact to closed deal</p>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <p className="text-xl text-gray-600 mb-6">
            Ready to automate your pipeline?
          </p>
          <button 
            onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            See More Features
          </button>
        </div>
      </div>
    </section>
  )
}

