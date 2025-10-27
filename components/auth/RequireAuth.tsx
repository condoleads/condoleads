'use client'

import { useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import RegisterModal from './RegisterModal'
import { Loader2 } from 'lucide-react'

interface RequireAuthProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  registrationSource?: string
  agentId?: string
  message?: string
}

export default function RequireAuth({
  children,
  fallback,
  registrationSource = 'content_gate',
  agentId,
  message = 'Register to view full details'
}: RequireAuthProps) {
  const { user, loading } = useAuth()
  const [showRegister, setShowRegister] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  console.log(' RequireAuth - user:', user, 'loading:', loading, 'mounted:', mounted)
  
  if (!mounted || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!user) {
    return (
      <>
        {fallback || (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border-2 border-blue-200 p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                {message}
              </h3>
              <p className="text-gray-600 mb-6">
                Create a free account to unlock pricing, full details, and contact agents
              </p>
              <button
                onClick={() => setShowRegister(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg transition-all shadow-lg hover:shadow-xl"
              >
                Create Free Account
              </button>
              <p className="text-sm text-gray-500 mt-4">
                Already have an account?{' '}
                <button
                  onClick={() => setShowRegister(true)}
                  className="text-blue-600 hover:text-blue-700 font-semibold"
                >
                  Sign In
                </button>
              </p>
            </div>
          </div>
        )}

        <RegisterModal
          isOpen={showRegister}
          onClose={() => setShowRegister(false)}
          registrationSource={registrationSource}
          agentId={agentId}
        />
      </>
    )
  }

  return <>{children}</>
}

