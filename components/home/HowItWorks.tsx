'use client'

import { Building2, Sparkles, Crown } from 'lucide-react'

export function HowItWorks() {
  return (
    <div className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
            <Sparkles className="w-4 h-4" />
            AI-Powered Experience
          </div>
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Your AI Condo Advisor
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Not just listings  intelligent market analysis that helps you make smarter decisions
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 h-full">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">1</div>
              <div className="hidden md:block flex-1 h-px bg-blue-200" />
            </div>
            <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center mb-5">
              <Building2 className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Explore Buildings</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              Browse curated Toronto condo buildings with real-time active listings, market stats, and building intelligence.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">Active Listings</span>
              <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">Building Stats</span>
              <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">Amenities</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 h-full">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-lg">2</div>
              <div className="hidden md:block flex-1 h-px bg-purple-200" />
            </div>
            <div className="w-14 h-14 rounded-xl bg-purple-50 flex items-center justify-center mb-5">
              <Sparkles className="w-7 h-7 text-purple-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Get AI Insights</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              Chat with AI about any building, get instant price estimates, and access PSF analytics  your first interaction is free.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full font-medium">AI Chat</span>
              <span className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full font-medium">Price Estimates</span>
              <span className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full font-medium">Market Data</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 h-full">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-lg">3</div>
            </div>
            <div className="w-14 h-14 rounded-xl bg-emerald-50 flex items-center justify-center mb-5">
              <Crown className="w-7 h-7 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Unlock VIP Access</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              Register free to unlock sold prices, transaction history, unlimited AI chat, and get connected with your dedicated agent.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">Sold Prices</span>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">Unlimited AI</span>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">Agent Support</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}