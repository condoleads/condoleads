'use client'

import { useAuth } from './AuthContext'
import { useState } from 'react'
import RegisterModal from './RegisterModal'
import { User, LogOut } from 'lucide-react'

export default function AuthStatus({ agentId }: { agentId?: string }) {
  const { user, signOut } = useAuth()
  const [showRegister, setShowRegister] = useState(false)

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <User className="w-4 h-4" />
          <span className="hidden sm:inline">{user.email}</span>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowRegister(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
      >
        Sign In / Register
      </button>
      <RegisterModal
        isOpen={showRegister}
        onClose={() => setShowRegister(false)}
        agentId={agentId}
      />
    </>
  )
}
