'use client'

import { useState } from 'react'
import { Sparkles, ArrowRight, BarChart3, TrendingUp, Clock } from 'lucide-react'

interface Building {
  id: string
  building_name: string
  slug: string
}

interface EstimatorBannerProps {
  buildings: Building[]
}

export function EstimatorBanner({ buildings }: EstimatorBannerProps) {
  const [selectedBuilding, setSelectedBuilding] = useState('')

  const handleGetEstimate = () => {
    if (selectedBuilding) {
      const building = buildings.find(b => b.id === selectedBuilding)
      if (building) {
        window.location.href = `/${building.slug}#estimator`
      }
    }
  }

  return (
    <div id="estimate" className="relative py-20 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 overflow-hidden">
      {/* Subtle grid background */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: `linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)`,
        backgroundSize: '40px 40px'
      }} />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-300 px-4 py-2 rounded-full text-sm font-semibold mb-6 border border-blue-400/20">
            <Sparkles className="w-4 h-4" />
            AI-Powered Valuations
          </div>

          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            What&apos;s Your Condo Worth?
          </h2>
          <p className="text-xl text-slate-300 max-w-xl mx-auto">
            Get an instant AI estimate based on real transaction data and live market trends
          </p>
        </div>

        {/* Building selector */}
        <div className="max-w-lg mx-auto mb-10">
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-3 border border-white/10 shadow-2xl">
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedBuilding}
                onChange={(e) => setSelectedBuilding(e.target.value)}
                className="flex-1 px-4 py-3.5 rounded-xl bg-white/10 border border-white/10 text-white focus:border-blue-400 focus:outline-none font-medium appearance-none"
                style={{ backgroundImage: 'none' }}
              >
                <option value="" className="text-gray-900">Select your building...</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id} className="text-gray-900">{b.building_name}</option>
                ))}
              </select>
              <button
                onClick={handleGetEstimate}
                disabled={!selectedBuilding}
                className="inline-flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 py-3.5 rounded-xl font-bold transition-all whitespace-nowrap"
              >
                Get AI Estimate
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Value props */}
        <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
          <div className="text-center">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center mx-auto mb-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-sm text-slate-300 font-medium">Real Data</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-400/20 flex items-center justify-center mx-auto mb-2">
              <Clock className="w-5 h-5 text-purple-400" />
            </div>
            <p className="text-sm text-slate-300 font-medium">Instant Results</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center mx-auto mb-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-sm text-slate-300 font-medium">100% Free</p>
          </div>
        </div>
      </div>
    </div>
  )
}