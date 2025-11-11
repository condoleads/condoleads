'use client'

import { useState } from 'react'
import { ExternalLink, MousePointer2 } from 'lucide-react'

export default function DemoEmbed() {
  const [iframeLoaded, setIframeLoaded] = useState(false)

  return (
    <section className="py-20 bg-gradient-to-br from-gray-900 to-blue-900">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Now See The Complete System
          </h2>
          <p className="text-xl text-blue-200 max-w-2xl mx-auto mb-8">
            This is a <span className="font-bold text-white">real, live agent website</span>. Click around. Try everything. This is exactly what you get.
          </p>
        </div>

        {/* Demo Container */}
        <div className="relative">
          {/* Callout Arrows - Desktop */}
          <div className="hidden lg:block">
            {/* Arrow 1 - Top Left */}
            <div className="absolute -top-16 left-12 z-10">
              <div className="bg-yellow-400 text-gray-900 px-4 py-2 rounded-lg font-bold shadow-lg animate-bounce">
                 Try the estimator
              </div>
              <div className="w-1 h-12 bg-yellow-400 mx-auto"></div>
            </div>

            {/* Arrow 2 - Top Right */}
            <div className="absolute -top-16 right-12 z-10">
              <div className="bg-green-400 text-gray-900 px-4 py-2 rounded-lg font-bold shadow-lg animate-bounce" style={{ animationDelay: '0.2s' }}>
                 Browse buildings
              </div>
              <div className="w-1 h-12 bg-green-400 mx-auto"></div>
            </div>

            {/* Arrow 3 - Bottom Left */}
            <div className="absolute -bottom-16 left-12 z-10">
              <div className="w-1 h-12 bg-purple-400 mx-auto"></div>
              <div className="bg-purple-400 text-gray-900 px-4 py-2 rounded-lg font-bold shadow-lg animate-bounce" style={{ animationDelay: '0.4s' }}>
                 See lead capture
              </div>
            </div>

            {/* Arrow 4 - Bottom Right */}
            <div className="absolute -bottom-16 right-12 z-10">
              <div className="w-1 h-12 bg-pink-400 mx-auto"></div>
              <div className="bg-pink-400 text-gray-900 px-4 py-2 rounded-lg font-bold shadow-lg animate-bounce" style={{ animationDelay: '0.6s' }}>
                 Check mobile view
              </div>
            </div>
          </div>

          {/* Iframe Container */}
          <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden border-4 border-blue-400">
            {/* Loading Overlay */}
            {!iframeLoaded && (
              <div className="absolute inset-0 bg-white flex items-center justify-center z-20">
                <div className="text-center">
                  <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-600 font-semibold">Loading live demo...</p>
                </div>
              </div>
            )}

            {/* Live Demo Iframe */}
            <iframe
              src="https://viyacondex.condoleads.ca"
              className="w-full h-[600px] md:h-[800px] border-0"
              title="Live CondoLeads Demo - Viya Condex"
              onLoad={() => setIframeLoaded(true)}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />

            {/* Watermark Overlay */}
            <div className="absolute top-4 left-4 right-4 bg-blue-600/90 backdrop-blur-sm text-white px-6 py-3 rounded-lg shadow-lg z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="font-bold">LIVE DEMO</span>
                </div>
                
                  <a href="https://viyacondex.condoleads.ca"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm hover:text-blue-200 transition-colors"
                >
                  Open in New Tab
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>

          {/* Mobile Instructions */}
          <div className="lg:hidden mt-6 text-center">
            <div className="inline-flex items-center gap-2 bg-yellow-400 text-gray-900 px-6 py-3 rounded-lg font-bold">
              <MousePointer2 className="w-5 h-5" />
              Tap and scroll to explore
            </div>
          </div>
        </div>

        {/* Bottom Text */}
        <div className="text-center mt-12">
          <p className="text-2xl font-bold text-white mb-4">
            This is EXACTLY what you get.
          </p>
          <p className="text-xl text-blue-200 mb-8">
            Your name. Your brand. Your buildings. Your leads.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            
              <a href="https://viyacondex.condoleads.ca"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 bg-white text-blue-600 text-lg font-semibold rounded-lg hover:bg-blue-50 transition-all inline-flex items-center justify-center gap-2"
            >
              Open Full Demo
              <ExternalLink className="w-5 h-5" />
            </a>
            <button 
              onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
              className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white text-lg font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
            >
              Get Your Own Website
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
