// components/chat/VipPrompt.tsx
'use client'

import { useState } from 'react'
import { Star, X, Phone, Loader2 } from 'lucide-react'

interface VipPromptProps {
  agentName: string
  onAccept: (phone: string) => void
  onDecline: () => void
  isLoading?: boolean
}

export default function VipPrompt({ agentName, onAccept, onDecline, isLoading }: VipPromptProps) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (!phone.trim()) {
      setError('Phone number is required')
      return
    }
    if (phone.trim().length < 10) {
      setError('Please enter a valid phone number')
      return
    }
    setError('')
    onAccept(phone.trim())
  }

  return (
    <div className="absolute inset-0 bg-white z-10 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-white" />
            <h3 className="font-semibold text-white">Get VIP Access</h3>
          </div>
          <button
            onClick={onDecline}
            className="text-white/80 hover:text-white"
            disabled={isLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col justify-center">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Star className="w-8 h-8 text-amber-500" />
          </div>
          <h4 className="text-lg font-semibold text-gray-900 mb-2">
            Unlock 10 More Messages
          </h4>
          <p className="text-sm text-gray-600">
            Enter your phone number and {agentName} will approve your VIP access shortly.
          </p>
        </div>

        {/* Phone Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Phone className="w-4 h-4 inline mr-1" />
            Phone Number *
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              setError('')
            }}
            placeholder="416-555-1234"
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
              error ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={isLoading}
          />
          {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
        </div>

        <p className="text-xs text-gray-500 text-center mb-4">
          {agentName} will call or text you to assist with your search.
        </p>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100 space-y-2">
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-full py-3 px-4 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Star className="w-4 h-4" />
              Request VIP Access
            </>
          )}
        </button>
        <button
          onClick={onDecline}
          disabled={isLoading}
          className="w-full py-2 px-4 text-gray-600 text-sm hover:text-gray-800 transition-colors disabled:opacity-50"
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}
