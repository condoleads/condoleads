'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowRight, Home, Mail, Phone, Building2, MessageSquare, Calculator, BarChart3, Sparkles } from 'lucide-react'

interface HeroSectionProps {
  agent: {
    full_name: string
    email: string
    cell_phone?: string | null
    office_phone?: string | null
    whatsapp_number?: string | null
    bio?: string
    profile_photo_url?: string
    team_name?: string | null
    team_tagline?: string | null
    team_logo_url?: string | null
  }
  isTeamSite?: boolean
}

const AI_RESPONSES = [
  'Units at 88 Scott average $1,247/sqft  12% above the C01 corridor average...',
  'Based on recent sales, your 2BR unit is estimated between $785K$820K...',
  'The building has 94% investor ownership with strong rental demand at $3.2K/mo...',
  'ROI analysis shows 4.1% gross yield  top 15% for downtown Toronto condos...',
]

export function HeroSection({ agent, isTeamSite = false }: HeroSectionProps) {
  const [typedText, setTypedText] = useState('')
  const [responseIndex, setResponseIndex] = useState(0)
  const charIndex = useRef(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const currentResponse = AI_RESPONSES[responseIndex]
    if (charIndex.current < currentResponse.length) {
      timeoutRef.current = setTimeout(() => {
        setTypedText(currentResponse.slice(0, charIndex.current + 1))
        charIndex.current++
      }, 28 + Math.random() * 22)
    } else {
      timeoutRef.current = setTimeout(() => {
        charIndex.current = 0
        setTypedText('')
        setResponseIndex((prev) => (prev + 1) % AI_RESPONSES.length)
      }, 3000)
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [typedText, responseIndex])

  const displayName = isTeamSite && agent.team_name ? agent.team_name : agent.full_name

  return (
    <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white overflow-hidden">
      {/* Animated data particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="particle particle-1" />
        <div className="particle particle-2" />
        <div className="particle particle-3" />
        <div className="particle particle-4" />
        <div className="particle particle-5" />
        <div className="particle particle-6" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />
      </div>

      <style jsx>{`
        .particle { position: absolute; width: 4px; height: 4px; background: rgba(59,130,246,0.4); border-radius: 50%; animation: float linear infinite; }
        .particle-1 { left: 10%; top: 20%; animation-duration: 15s; animation-delay: 0s; width: 3px; height: 3px; }
        .particle-2 { left: 30%; top: 60%; animation-duration: 18s; animation-delay: -3s; width: 5px; height: 5px; background: rgba(147,51,234,0.3); }
        .particle-3 { left: 55%; top: 15%; animation-duration: 20s; animation-delay: -7s; width: 3px; height: 3px; }
        .particle-4 { left: 75%; top: 45%; animation-duration: 16s; animation-delay: -5s; width: 4px; height: 4px; background: rgba(16,185,129,0.3); }
        .particle-5 { left: 85%; top: 70%; animation-duration: 22s; animation-delay: -10s; width: 3px; height: 3px; }
        .particle-6 { left: 45%; top: 80%; animation-duration: 17s; animation-delay: -2s; width: 5px; height: 5px; background: rgba(59,130,246,0.3); }
        @keyframes float { 0% { transform: translateY(0) translateX(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(-400px) translateX(100px); opacity: 0; } }
        .typing-cursor { display: inline-block; width: 2px; height: 1.1em; background: #3b82f6; margin-left: 2px; animation: blink 0.8s infinite; vertical-align: text-bottom; }
        @keyframes blink { 0%,50% { opacity: 1; } 51%,100% { opacity: 0; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-up { animation: slideUp 0.6s ease-out forwards; }
        .animate-slide-up-d1 { animation: slideUp 0.6s ease-out 0.15s forwards; opacity: 0; }
        .animate-slide-up-d2 { animation: slideUp 0.6s ease-out 0.3s forwards; opacity: 0; }
        .animate-slide-up-d3 { animation: slideUp 0.6s ease-out 0.45s forwards; opacity: 0; }
      `}</style>

      {/* ========== MOBILE LAYOUT ========== */}
      <div className="md:hidden relative px-4 py-6">
        <div className="flex items-center gap-4 mb-4">
          {agent.profile_photo_url ? (
            <img src={agent.profile_photo_url} alt={displayName} className="w-14 h-14 rounded-full border-2 border-blue-400/50 shadow-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 border-2 border-blue-400/50 shadow-lg flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold">{displayName.split(' ').map(n => n[0]).join('')}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{displayName}</h1>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-blue-300 text-sm font-medium">AI-Powered Condo Intelligence</p>
            </div>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur rounded-xl p-3 mb-4 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-xs text-blue-300 font-medium">AI Condo Advisor</span>
          </div>
          <p className="text-sm text-blue-100 leading-relaxed min-h-[40px]">
            {typedText}<span className="typing-cursor" />
          </p>
        </div>

        <div className="space-y-2">
          <a href="#buildings" className="flex items-center justify-between bg-white text-slate-900 px-4 py-3 rounded-lg font-semibold">
            <div className="flex items-center gap-2"><Building2 className="w-5 h-5" /><span>Browse Condo Buildings</span></div>
            <ArrowRight className="w-4 h-4" />
          </a>
          <a href="#estimate" className="flex items-center justify-between bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-3 rounded-lg font-semibold">
            <div className="flex items-center gap-2"><Calculator className="w-5 h-5" /><span>AI Price Estimate</span></div>
            <ArrowRight className="w-4 h-4" />
          </a>
          <div className="flex gap-2 pt-1">
            {agent.cell_phone && (
              <a href={`tel:${agent.cell_phone}`} className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg font-semibold text-sm">
                <Phone className="w-4 h-4" /> Call
              </a>
            )}
            <a href={`mailto:${agent.email}`} className="flex-1 flex items-center justify-center gap-2 bg-white/10 text-white px-4 py-2.5 rounded-lg font-semibold text-sm border border-white/20">
              <Mail className="w-4 h-4" /> Email
            </a>
          </div>
        </div>
      </div>

      {/* ========== DESKTOP LAYOUT ========== */}
      <div className="hidden md:block relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* LEFT: Agent + Messaging */}
          <div className="space-y-8 animate-slide-up">
            <div className="flex items-center gap-5">
              {agent.profile_photo_url ? (
                <img src={agent.profile_photo_url} alt={displayName} className="w-20 h-20 rounded-full border-[3px] border-blue-400/50 shadow-xl object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 border-[3px] border-blue-400/50 shadow-xl flex items-center justify-center">
                  <span className="text-2xl font-bold">{displayName.split(' ').map(n => n[0]).join('')}</span>
                </div>
              )}
              <div>
                <h1 className="text-4xl font-bold">{displayName}</h1>
                {isTeamSite && agent.team_name && (
                  <p className="text-blue-300 text-sm mt-0.5">Led by {agent.full_name}</p>
                )}
                
              </div>
            </div>

            <div>
              <h2 className="text-5xl lg:text-6xl font-black leading-tight">
                <span className="bg-gradient-to-r from-white via-blue-100 to-blue-200 bg-clip-text text-transparent">AI-Powered</span>
                <br />
                <span className="text-white">Condo Intelligence</span>
              </h2>
              <p className="text-xl text-slate-300 mt-4 leading-relaxed max-w-lg">
                {agent.bio || "Real-time market analysis, instant AI valuations, and expert insights for Toronto's top condo buildings."}
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <a href="#buildings" className="group inline-flex items-center gap-3 bg-white text-slate-900 px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl">
                <Building2 className="w-5 h-5" /> Browse Condos
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
              <a href="#estimate" className="group inline-flex items-center gap-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl">
                <Calculator className="w-5 h-5" /> AI Price Estimate
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <a href={`mailto:${agent.email}`} className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                <Mail className="w-4 h-4" /> {agent.email}
              </a>
              {agent.cell_phone && (
                <a href={`tel:${agent.cell_phone}`} className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <Phone className="w-4 h-4" /> {agent.cell_phone}
                </a>
              )}
            </div>
          </div>

          {/* RIGHT: AI Chat Preview + Feature Cards */}
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-slide-up-d1">
              <div className="flex items-center gap-3 px-5 py-3 bg-white/5 border-b border-white/10">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">AI Condo Advisor</p>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <p className="text-xs text-green-300">Online  ready to help</p>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex justify-end">
                  <div className="bg-blue-500/20 border border-blue-400/20 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
                    <p className="text-sm text-blue-100">What can you tell me about this building?</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]">
                    <p className="text-sm text-slate-200 leading-relaxed min-h-[44px]">
                      {typedText}<span className="typing-cursor" />
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-blue-400/30 transition-all group animate-slide-up-d1">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                </div>
                <p className="font-semibold text-white text-sm mb-1">AI Chat</p>
                <p className="text-xs text-slate-400 leading-relaxed">Ask anything about any building, 24/7</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-purple-400/30 transition-all group animate-slide-up-d2">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Calculator className="w-5 h-5 text-purple-400" />
                </div>
                <p className="font-semibold text-white text-sm mb-1">AI Estimator</p>
                <p className="text-xs text-slate-400 leading-relaxed">Instant valuations from live market data</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-emerald-400/30 transition-all group animate-slide-up-d3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="font-semibold text-white text-sm mb-1">Market Intel</p>
                <p className="text-xs text-slate-400 leading-relaxed">PSF trends, ROI analysis, price comparisons</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent" />
    </div>
  )
}