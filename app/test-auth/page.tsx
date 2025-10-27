'use client'

import { useState } from 'react'
import { useAuth } from '@/components/auth/AuthContext'
import RegisterModal from '@/components/auth/RegisterModal'
import RequireAuth from '@/components/auth/RequireAuth'

export default function TestAuthPage() {
  const { user, signOut } = useAuth()
  const [showRegister, setShowRegister] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-4xl font-bold mb-8">Authentication Test Page</h1>

        {/* Current Auth State */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">Current Auth State</h2>
          {user ? (
            <div>
              <p className="text-green-600 font-semibold mb-2"> Logged In</p>
              <p className="text-gray-600">Email: {user.email}</p>
              <p className="text-gray-600">ID: {user.id}</p>
              <button
                onClick={signOut}
                className="mt-4 bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div>
              <p className="text-gray-600 mb-4"> Not logged in</p>
              <button
                onClick={() => setShowRegister(true)}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
              >
                Open Registration Modal
              </button>
            </div>
          )}
        </div>

        {/* Test Content Gating */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">Test Content Gating</h2>
          <RequireAuth
            registrationSource="test_page"
            message="Register to see secret content"
          >
            <div className="bg-green-50 border-2 border-green-500 rounded-lg p-8">
              <h3 className="text-xl font-bold text-green-900 mb-2">
                 Secret Content Unlocked!
              </h3>
              <p className="text-green-800">
                You can only see this because you're registered and logged in.
              </p>
            </div>
          </RequireAuth>
        </div>

        {/* Manual Test */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Manual Modal Test</h2>
          <button
            onClick={() => setShowRegister(true)}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700"
          >
            Open Registration Modal
          </button>
        </div>

        <RegisterModal
          isOpen={showRegister}
          onClose={() => setShowRegister(false)}
          registrationSource="test_page"
        />
      </div>
    </div>
  )
}
