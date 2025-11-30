'use client'

import { useState } from 'react'
import RegisterModal from '@/components/auth/RegisterModal'

interface GatedContentProps {
  children: React.ReactNode
  shouldGate: boolean
  sectionName: string
  buildingId?: string
}

export default function GatedContent({ children, shouldGate, sectionName, buildingId }: GatedContentProps) {
  const [showRegister, setShowRegister] = useState(false)

  if (!shouldGate) {
    return <>{children}</>
  }

  return (
    <div className="relative">
      {/* Blurred content */}
      <div className="blur-md pointer-events-none select-none">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/80 to-white flex items-center justify-center">
        <div className="text-center bg-white rounded-xl shadow-xl p-8 max-w-md mx-4">
          <div className="mb-4">
            <svg 
              className="w-16 h-16 mx-auto text-blue-600" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
              />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            {sectionName} Available
          </h3>
          <p className="text-gray-600 mb-6">
            Register for free to view complete {sectionName.toLowerCase()} and access exclusive sold data
          </p>
          <button
            onClick={() => setShowRegister(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Register to View
          </button>
          <p className="text-xs text-gray-500 mt-4">
            Free account • No credit card required
          </p>
        </div>
      </div>

      <RegisterModal
        isOpen={showRegister}
        onClose={() => setShowRegister(false)}
        onSuccess={() => {
          setShowRegister(false)
          window.location.reload()
        }}
        registrationSource="property_detail"
        buildingId={buildingId}
      />
    </div>
  )
}
