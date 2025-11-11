'use client'

import { useState } from 'react'
import { X, Check } from 'lucide-react'

export default function BeforeAfter() {
  const [sliderPosition, setSliderPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = () => setIsDragging(true)
  const handleMouseUp = () => setIsDragging(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = (x / rect.width) * 100
    setSliderPosition(Math.min(Math.max(percentage, 0), 100))
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.touches[0].clientX - rect.left
    const percentage = (x / rect.width) * 100
    setSliderPosition(Math.min(Math.max(percentage, 0), 100))
  }

  const badItems = [
    { icon: X, text: 'Pay $100-200 per lead', subtext: 'Expensive per contact' },
    { icon: X, text: 'Shared with 4+ agents', subtext: 'Fighting for attention' },
    { icon: X, text: 'Low quality, tire-kickers', subtext: 'Wasted time' },
    { icon: X, text: 'Compete on response time', subtext: 'Always racing' },
    { icon: X, text: 'Ongoing cost per lead', subtext: 'Never ends' }
  ]

  const goodItems = [
    { icon: Check, text: 'Unlimited leads included', subtext: 'No per-lead cost' },
    { icon: Check, text: '100% exclusive to you', subtext: 'Zero competition' },
    { icon: Check, text: 'High intent (used estimator)', subtext: 'Ready to talk' },
    { icon: Check, text: 'They contacted YOU directly', subtext: 'You\'re the expert' },
    { icon: Check, text: 'Fixed monthly investment', subtext: 'Predictable budget' }
  ]

  return (
    <section className="py-20 bg-gray-900">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Stop This. Start This.
          </h2>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Drag the slider to compare buying leads vs owning your pipeline
          </p>
        </div>

        {/* Comparison Slider */}
        <div
          className="relative bg-white rounded-2xl overflow-hidden shadow-2xl cursor-ew-resize select-none"
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onMouseMove={handleMouseMove}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          onTouchMove={handleTouchMove}
        >
          {/* Before Side (Red - Bad) */}
          <div className="grid md:grid-cols-2">
            <div className="bg-red-50 p-8 md:p-12 min-h-[600px] flex flex-col">
              <div className="mb-8">
                <div className="inline-block px-4 py-2 bg-red-500 text-white rounded-full font-bold mb-4">
                   OLD WAY
                </div>
                <h3 className="text-3xl font-bold text-gray-900 mb-2">
                  Buying Leads
                </h3>
                <p className="text-gray-600">The expensive treadmill</p>
              </div>

              <div className="space-y-6 flex-1">
                {badItems.map((item, index) => {
                  const Icon = item.icon
                  return (
                    <div key={index} className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-lg">{item.text}</p>
                        <p className="text-gray-600 text-sm">{item.subtext}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-8 p-6 bg-red-100 rounded-xl border-2 border-red-300">
                <p className="text-red-900 font-bold text-xl mb-2">Monthly Cost</p>
                <p className="text-4xl font-bold text-red-600">$2,000+</p>
                <p className="text-red-700 text-sm mt-1">For just 10-20 shared leads</p>
              </div>
            </div>

            {/* After Side (Green - Good) */}
            <div className="bg-green-50 p-8 md:p-12 min-h-[600px] flex flex-col">
              <div className="mb-8">
                <div className="inline-block px-4 py-2 bg-green-500 text-white rounded-full font-bold mb-4">
                   NEW WAY
                </div>
                <h3 className="text-3xl font-bold text-gray-900 mb-2">
                  CondoLeads
                </h3>
                <p className="text-gray-600">Own your pipeline</p>
              </div>

              <div className="space-y-6 flex-1">
                {goodItems.map((item, index) => {
                  const Icon = item.icon
                  return (
                    <div key={index} className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-lg">{item.text}</p>
                        <p className="text-gray-600 text-sm">{item.subtext}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-8 p-6 bg-green-100 rounded-xl border-2 border-green-300">
                <p className="text-green-900 font-bold text-xl mb-2">Monthly Investment</p>
                <p className="text-4xl font-bold text-green-600">$XXX</p>
                <p className="text-green-700 text-sm mt-1">Unlimited exclusive leads</p>
              </div>
            </div>
          </div>

          {/* Slider Overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`
            }}
          >
            <div className="grid md:grid-cols-2 h-full">
              <div className="bg-red-50/95 p-8 md:p-12" />
              <div className="bg-green-50/95 p-8 md:p-12" />
            </div>
          </div>

          {/* Slider Handle */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white pointer-events-none"
            style={{ left: `${sliderPosition}%` }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full shadow-2xl flex items-center justify-center border-4 border-gray-300 pointer-events-auto cursor-ew-resize">
              <div className="flex gap-1">
                <div className="w-1 h-6 bg-gray-400 rounded-full" />
                <div className="w-1 h-6 bg-gray-400 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Note */}
        <p className="text-center text-gray-400 mt-6 text-sm">
           Drag the slider left and right to compare
        </p>

        {/* CTA */}
        <div className="text-center mt-12">
          <p className="text-xl text-gray-300 mb-6">
            Ready to stop sharing and start owning?
          </p>
          <button 
            onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
            className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white text-lg font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            I Want Exclusive Leads
          </button>
        </div>
      </div>
    </section>
  )
}
