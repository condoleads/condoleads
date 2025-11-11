'use client'

import { ExternalLink } from 'lucide-react'

export default function LandingHeader() {
  const scrollToApplication = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'smooth'
    })
  }

  return (
    <header className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm shadow-md z-50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="text-2xl font-bold text-blue-600">
            CondoLeads
          </a>

          {/* CTA Buttons */}
          <div className="flex items-center gap-4">
            
              <a href="https://viyacondex.condoleads.ca"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 px-6 py-2 text-blue-600 hover:text-blue-700 font-semibold transition-colors"
            >
              View Demo
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={scrollToApplication}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
            >
              Apply Now
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
