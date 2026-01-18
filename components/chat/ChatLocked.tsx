// components/chat/ChatLocked.tsx
'use client'

import { useState } from 'react'
import { MessageCircle, Lock, X, Bot } from 'lucide-react'
import RegisterModal from '@/components/auth/RegisterModal'

interface ChatLockedProps {
  agentName: string
  agentId?: string
  buildingId?: string
  buildingName?: string
  buildingAddress?: string
}

export default function ChatLocked({ 
  agentName,
  agentId,
  buildingId,
  buildingName,
  buildingAddress
}: ChatLockedProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showRegister, setShowRegister] = useState(false)

  return (
    <>
      {/* Chat Toggle Button with Lock Badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 bg-blue-600 hover:bg-blue-700"
        aria-label="Open chat"
      >
        <MessageCircle className="w-6 h-6 text-white" />
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
          <Lock className="w-3 h-3 text-white" />
        </div>
      </button>

      {/* Locked Modal */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-48px)] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white">AI Condo Assistant</h3>
              <p className="text-xs text-blue-100">Powered by AI  {agentName}</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-blue-600" />
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">
              Sign Up Free to Chat
            </h4>
            <p className="text-sm text-gray-600 mb-6">
              Get instant answers about condos, pricing, investments, and more from our AI assistant. It's free!
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => {
                  setIsOpen(false)
                  setShowRegister(true)
                }}
                className="block w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Free Account
              </button>
              <button
                onClick={() => {
                  setIsOpen(false)
                  setShowRegister(true)
                }}
                className="block w-full py-3 px-4 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                Already have an account? Log in
              </button>
            </div>
            
            <p className="text-xs text-gray-500 mt-4">
              No spam. No commitment. Just helpful condo insights.
            </p>
          </div>
        </div>
      )}

      {/* Register Modal */}
      <RegisterModal
        isOpen={showRegister}
        onClose={() => setShowRegister(false)}
        agentId={agentId}
        buildingId={buildingId}
        buildingName={buildingName}
        buildingAddress={buildingAddress}
        registrationSource="ai_chat"
      />
    </>
  )
}
