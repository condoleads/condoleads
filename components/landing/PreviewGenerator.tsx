'use client'

import { useState } from 'react'
import { User, Building2, Sparkles, ExternalLink } from 'lucide-react'

export default function PreviewGenerator() {
  const [agentName, setAgentName] = useState('')
  const [brokerage, setBrokerage] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  const handlePreview = (e: React.FormEvent) => {
    e.preventDefault()
    if (agentName.trim() && brokerage.trim()) {
      setShowPreview(true)
    }
  }

  const reset = () => {
    setAgentName('')
    setBrokerage('')
    setShowPreview(false)
  }

  return (
    <section className="py-20 bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-full font-semibold mb-4">
            <Sparkles className="w-5 h-5" />
            See Yourself Here
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Preview YOUR Future Website
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Enter your details and see what your branded website will look like
          </p>
        </div>

        {!showPreview ? (
          /* Input Form */
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 border-2 border-purple-100">
              <form onSubmit={handlePreview} className="space-y-6">
                {/* Name Input */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <User className="w-5 h-5 text-purple-600" />
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="e.g. Sarah Chen"
                    className="w-full px-6 py-4 text-lg border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                    required
                  />
                </div>

                {/* Brokerage Input */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Building2 className="w-5 h-5 text-purple-600" />
                    Your Brokerage
                  </label>
                  <input
                    type="text"
                    value={brokerage}
                    onChange={(e) => setBrokerage(e.target.value)}
                    placeholder="e.g. RE/MAX Ultimate"
                    className="w-full px-6 py-4 text-lg border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                    required
                  />
                </div>

                {/* Preview Button */}
                <button
                  type="submit"
                  className="w-full px-8 py-5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-xl font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
                >
                  <span className="flex items-center justify-center gap-2">
                    <Sparkles className="w-6 h-6" />
                    Preview My Site
                  </span>
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-6">
                 See your personalized website in seconds
              </p>
            </div>
          </div>
        ) : (
          /* Preview */
          <div className="space-y-6">
            {/* Watermark Banner */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl p-6 text-center">
              <p className="text-2xl font-bold mb-2"> This Could Be Live in 24 Hours</p>
              <p className="text-purple-100">Your branded website, ready to capture leads</p>
            </div>

            {/* Mock Website Preview */}
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border-4 border-purple-200">
              {/* Mock Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6">
                <div className="flex items-center justify-between max-w-6xl mx-auto">
                  <div>
                    <h3 className="text-3xl font-bold mb-1">{agentName}</h3>
                    <p className="text-blue-200">{brokerage}</p>
                  </div>
                  <div className="hidden md:flex gap-6 text-sm">
                    <a className="hover:text-blue-200">Home</a>
                    <a className="hover:text-blue-200">Buildings</a>
                    <a className="hover:text-blue-200">Estimator</a>
                    <a className="hover:text-blue-200">Contact</a>
                  </div>
                </div>
              </div>

              {/* Mock Hero Section */}
              <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-12 text-center">
                <div className="max-w-3xl mx-auto">
                  <div className="w-32 h-32 bg-gradient-to-br from-purple-400 to-blue-400 rounded-full mx-auto mb-6 flex items-center justify-center text-white text-4xl font-bold">
                    {agentName.charAt(0).toUpperCase()}
                  </div>
                  <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                    {agentName}
                  </h1>
                  <p className="text-xl text-gray-600 mb-2">Toronto Condo Specialist</p>
                  <p className="text-lg text-gray-500 mb-8">{brokerage}</p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg">
                      Browse Condos
                    </button>
                    <button className="px-8 py-4 bg-green-500 text-white font-semibold rounded-lg">
                      Get Free Estimate
                    </button>
                  </div>
                </div>
              </div>

              {/* Mock Buildings Section */}
              <div className="p-12 bg-white">
                <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
                  Featured Buildings
                </h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {['X2 Condos', 'The One', 'Aura'].map((building, index) => (
                    <div key={index} className="bg-gray-100 rounded-xl p-6">
                      <div className="w-full h-40 bg-gradient-to-br from-gray-300 to-gray-400 rounded-lg mb-4" />
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{building}</h3>
                      <p className="text-gray-600 mb-4">Toronto Entertainment District</p>
                      <div className="flex gap-4 text-sm">
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-semibold">
                          12 For Sale
                        </span>
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-semibold">
                          5 For Lease
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mock Footer */}
              <div className="bg-gray-900 text-white p-8 text-center">
                <p className="text-gray-400 text-sm"> 2024 {agentName} - {brokerage}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={reset}
                className="px-8 py-4 bg-gray-600 hover:bg-gray-700 text-white text-lg font-semibold rounded-lg transition-all"
              >
                Try Different Name
              </button>
              <button
                onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
                className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-lg font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
              >
                <span className="flex items-center justify-center gap-2">
                  Make This Real
                  <ExternalLink className="w-5 h-5" />
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Bottom CTA */}
        {!showPreview && (
          <div className="text-center mt-12">
            <p className="text-gray-600">
              Or view a <a href="https://viyacondex.condoleads.ca" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-700 font-semibold underline">live example </a>
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
