'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('mary@condoleads.ca')
  const [password, setPassword] = useState('Agent123!')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    console.log(' Attempting login with:', email)

    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) {
              const cookie = document.cookie
                .split('; ')
                .find(row => row.startsWith(name + '='))
              return cookie ? decodeURIComponent(cookie.split('=')[1]) : null
            },
            set(name: string, value: string, options: any) {
              document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${options.maxAge}; ${options.sameSite ? 'SameSite=' + options.sameSite : ''}`
            },
            remove(name: string, options: any) {
              document.cookie = `${name}=; path=/; max-age=0`
            }
          }
        }
      )

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log(' Login response:', { 
        hasSession: !!data.session, 
        userId: data.user?.id,
        error: error?.message 
      })

      if (error) {
        console.error(' Login error:', error)
        throw error
      }

      if (data.session) {
        console.log(' Login successful, redirecting...')
        
        // Wait a bit for cookies to be set
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Force a full page reload to ensure cookies are recognized
        window.location.href = '/dashboard'
      }
    } catch (error: any) {
      console.error(' Catch block error:', error)
      setError(error.message || 'Invalid login credentials')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Agent Login</h1>
          <p className="text-gray-600">Sign in to access your dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="agent@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="/" className="text-sm text-blue-600 hover:text-blue-700">
             Back to website
          </a>
        </div>

        <div className="mt-4 text-xs text-gray-500 text-center">
          Test credentials pre-filled. Check browser console for debug info.
        </div>
      </div>
    </div>
  )
}
