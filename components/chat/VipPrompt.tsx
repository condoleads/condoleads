// components/chat/VipPrompt.tsx
'use client'

import { useState } from 'react'
import { Star, X, Check, Phone } from 'lucide-react'

interface VipPromptProps {
  agentName: string
  onAccept: (phone?: string) => void
  onDecline: () => void
  isLoading?: boolean
}

export default function VipPrompt({ agentName, onAccept, onDecline, isLoading }: VipPromptProps) {
  const [phone, setPhone] = useState('')
  const [showPhoneInput, setShowPhoneInput] = useState(false)

  const handleAccept = () => {
    onAccept(phone || undefined)
  }

  return (
    <div className="absolute inset-0 bg-white z-10 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
          <Star className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">Upgrade to VIP</h3>
          <p className="text-xs text-amber-100">Unlock unlimited access</p>
        </div>
        <button
          onClick={onDecline}
          className="text-white/80 hover:text-white"
          disabled={isLoading}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-5 overflow-y-auto">
        <div className="text-center mb-4">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Star className="w-7 h-7 text-amber-600" />
          </div>
          <h4 className="text-lg font-semibold text-gray-900">
            You're Asking Great Questions!
          </h4>
          <p className="text-sm text-gray-600 mt-1">
            Unlock VIP access for free
          </p>
        </div>

        {/* Benefits */}
        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <p className="text-xs font-medium text-gray-500 uppercase mb-3">VIP Benefits</p>
          <ul className="space-y-2">
            {[
              'Unlimited AI chat access',
              'Personalized recommendations',
              `Priority response from ${agentName}`,
              'Custom property alerts',
              'Investment analysis reports'
            ].map((benefit, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        {/* Phone Input (Optional) */}
        {showPhoneInput ? (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone (optional)
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(416) 555-0123"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              For priority callback from {agentName}
            </p>
          </div>
        ) : (
          <button
            onClick={() => setShowPhoneInput(true)}
            className="text-sm text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-1"
          >
            <Phone className="w-3 h-3" />
            Add phone for priority callback
          </button>
        )}

        <p className="text-xs text-gray-500 text-center">
          No commitment required. No spam. Ever.
        </p>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-100 space-y-2">
        <button
          onClick={handleAccept}
          disabled={isLoading}
          className="w-full py-3 px-4 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <span className="animate-pulse">Upgrading...</span>
          ) : (
            <>
              <Star className="w-4 h-4" />
              Become VIP (Free)
            </>
          )}
        </button>
        
        <button
          onClick={onDecline}
          disabled={isLoading}
          className="w-full py-2 px-4 text-gray-600 text-sm hover:text-gray-800 transition-colors disabled:opacity-50"
        >
          Continue as regular user
        </button>
      </div>
    </div>
  )
}