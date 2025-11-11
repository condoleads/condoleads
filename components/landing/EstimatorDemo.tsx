'use client'

import { useState } from 'react'
import { Home, TrendingUp, CheckCircle } from 'lucide-react'

export default function EstimatorDemo() {
  const [address, setAddress] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [showLeadCapture, setShowLeadCapture] = useState(false)

  const handleEstimate = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!address.trim()) return

    setIsLoading(true)
    
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false)
      setShowResult(true)
      
      // Show lead capture notification after 1 second
      setTimeout(() => {
        setShowLeadCapture(true)
      }, 1000)
    }, 2000)
  }

  const reset = () => {
    setAddress('')
    setShowResult(false)
    setShowLeadCapture(false)
  }

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-4xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Try Our AI-Powered Estimator
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            This is what <span className="font-semibold text-blue-600">YOUR clients</span> will use. 
            Watch how lead capture works in action.
          </p>
        </div>

        {/* Estimator Widget */}
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 border-2 border-blue-100">
          {!showResult ? (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Home className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Get Instant Condo Estimate</h3>
                  <p className="text-gray-600">Enter any Toronto address to see pricing</p>
                </div>
              </div>

              <form onSubmit={handleEstimate} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Property Address
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. 180 University Ave, Toronto"
                    className="w-full px-6 py-4 text-lg border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                    disabled={isLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !address.trim()}
                  className="w-full px-8 py-5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xl font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-3">
                      <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Analyzing Property Data...
                    </span>
                  ) : (
                    'Get My Free Estimate'
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-4">
                 <span className="font-semibold">Demo Mode:</span> Try "180 University Ave" or any address
              </p>
            </>
          ) : (
            <>
              {/* Results */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900">Estimate Ready!</h3>
                      <p className="text-gray-600">{address}</p>
                    </div>
                  </div>
                  <button
                    onClick={reset}
                    className="text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    Try Another
                  </button>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-xl p-8 mb-6">
                  <p className="text-sm font-semibold text-gray-600 mb-2">ESTIMATED VALUE RANGE</p>
                  <p className="text-5xl font-bold text-gray-900 mb-4">$650,000 - $750,000</p>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">2</p>
                      <p className="text-sm text-gray-600">Bedrooms</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">2</p>
                      <p className="text-sm text-gray-600">Bathrooms</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">850</p>
                      <p className="text-sm text-gray-600">Sq Ft</p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-600 text-white rounded-xl p-6">
                  <p className="text-lg font-semibold mb-2">Want a detailed market analysis?</p>
                  <p className="text-blue-100 mb-4">Connect with an expert for personalized insights</p>
                  <button className="w-full py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-all">
                    Contact Agent
                  </button>
                </div>
              </div>

              {/* Lead Capture Notification */}
              {showLeadCapture && (
                <div className="border-4 border-green-500 rounded-xl p-6 bg-green-50 animate-pulse">
                  <div className="flex items-start gap-4">
                    <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-gray-900 mb-2">
                         Lead Captured!
                      </h4>
                      <div className="bg-white rounded-lg p-4 mb-4 border-2 border-green-200">
                        <p className="text-sm font-semibold text-gray-700 mb-2"> New Lead Alert!</p>
                        <div className="space-y-1 text-sm text-gray-600">
                          <p><span className="font-semibold">Contact:</span> Demo User</p>
                          <p><span className="font-semibold">Email:</span> demo@example.com</p>
                          <p><span className="font-semibold">Property:</span> {address}</p>
                          <p><span className="font-semibold">Estimate:</span> $650-750K</p>
                          <p><span className="font-semibold">Time:</span> Just now</p>
                        </div>
                      </div>
                      <p className="text-green-800 font-semibold text-lg">
                         This lead goes directly to YOU!
                      </p>
                      <p className="text-gray-600 text-sm mt-2">
                        No sharing. No competition. 100% exclusive.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* CTA Below */}
        <div className="text-center mt-12">
          <p className="text-xl text-gray-600 mb-6">
            Want these leads coming to <span className="font-bold text-blue-600">your</span> inbox?
          </p>
          <button 
            onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
            className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white text-lg font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            Get Started Now
          </button>
        </div>
      </div>
    </section>
  )
}
