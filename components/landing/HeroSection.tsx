'use client'

import { useState, useEffect } from 'react'
import { ArrowDown } from 'lucide-react'

export default function HeroSection() {
  const [leadCount, setLeadCount] = useState(2500)

  useEffect(() => {
    let start = 2500
    const end = 2847
    const duration = 2000
    const increment = (end - start) / (duration / 16)

    const timer = setInterval(() => {
      start += increment
      if (start >= end) {
        setLeadCount(end)
        clearInterval(timer)
      } else {
        setLeadCount(Math.floor(start))
      }
    }, 16)

    return () => clearInterval(timer)
  }, [])

  const scrollToNext = () => {
    window.scrollTo({
      top: window.innerHeight,
      behavior: 'smooth'
    })
  }

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 text-white overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
          Get Your AI-Powered<br />
          Condo Leads Funnel Today
        </h1>

        <div className="text-2xl md:text-3xl font-semibold mb-4 space-y-2">
          <p className="text-blue-200">Capture Condo Leads.</p>
          <p className="text-green-400">Close Condo Deals.</p>
        </div>

        <p className="text-xl md:text-2xl text-blue-100 mb-12 max-w-3xl mx-auto">
          Stop sharing leads with competitors. Get your branded website with AI estimates 
          that turn curious buyers & sellers into exclusive clients.
        </p>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 mb-12 max-w-md mx-auto border border-white/20">
          <p className="text-blue-200 text-sm uppercase tracking-wider mb-2">Live Stats</p>
          <p className="text-5xl font-bold mb-2">
            {leadCount.toLocaleString()}
          </p>
          <p className="text-blue-200">leads captured this month</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <button
            onClick={scrollToNext}
            className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white text-lg font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            See How It Works
          </button>
          
          
            <a href="https://viyacondex.condoleads.ca"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white text-lg font-semibold rounded-lg transition-all border-2 border-white/30"
          >
            View Live Demo 
          </a>
        </div>

        <button
          onClick={scrollToNext}
          className="animate-bounce inline-flex items-center gap-2 text-blue-200 hover:text-white transition-colors"
        >
          <span>Scroll to explore</span>
          <ArrowDown className="w-5 h-5" />
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
    </section>
  )
}

