'use client'

import { Eye, Shield, Crown, Check, Lock, MessageSquare, Calculator, BarChart3, History } from 'lucide-react'

export function VIPTiers() {
  return (
    <section className="py-20 bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Access Levels
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Start exploring for free, then unlock deeper market intelligence as you go
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {/* Free Tier */}
          <div className="relative bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-lg transition-all duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                <Eye className="w-6 h-6 text-slate-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Browse</h3>
                <p className="text-sm text-gray-500">No account needed</p>
              </div>
            </div>

            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">Active listings for sale & lease</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">Building amenities & details</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">1 free AI chat message</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">Market stats overview</span>
              </li>
              <li className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
                <span className="text-gray-400">Sold & leased prices</span>
              </li>
              <li className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
                <span className="text-gray-400">Transaction history</span>
              </li>
            </ul>

            <a href="#buildings" className="block w-full text-center py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors">
              Start Browsing
            </a>
          </div>

          {/* Registered Tier */}
          <div className="relative bg-white rounded-2xl border-2 border-blue-500 p-8 shadow-lg shadow-blue-100/50">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="bg-blue-600 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
                Free Registration
              </span>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Registered</h3>
                <p className="text-sm text-blue-600 font-medium">Name + email</p>
              </div>
            </div>

            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">Everything in Browse, plus:</span>
              </li>
              <li className="flex items-start gap-3">
                <History className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 font-medium">Sold & leased prices</span>
              </li>
              <li className="flex items-start gap-3">
                <BarChart3 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 font-medium">Full transaction history</span>
              </li>
              <li className="flex items-start gap-3">
                <Calculator className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 font-medium">AI price estimates</span>
              </li>
              <li className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 font-medium">Extended AI chat access</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">All property photos</span>
              </li>
            </ul>

            <a href="#buildings" className="block w-full text-center py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-md">
              Register Free
            </a>
          </div>

          {/* VIP Tier */}
          <div className="relative bg-gradient-to-b from-slate-900 to-slate-800 rounded-2xl p-8 text-white hover:shadow-xl transition-all duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-amber-400/20 flex items-center justify-center">
                <Crown className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold">VIP Access</h3>
                <p className="text-sm text-amber-300 font-medium">Agent approved</p>
              </div>
            </div>

            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-200">Everything in Registered, plus:</span>
              </li>
              <li className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-white font-medium">Unlimited AI conversations</span>
              </li>
              <li className="flex items-start gap-3">
                <Calculator className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-white font-medium">Unlimited price estimates</span>
              </li>
              <li className="flex items-start gap-3">
                <Crown className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-white font-medium">Direct agent connection</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-200">Priority response from agent</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-200">Personalized market alerts</span>
              </li>
            </ul>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <p className="text-sm text-slate-300 text-center leading-relaxed">
                VIP access is granted after registration when your agent reviews and approves your request  typically within minutes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}