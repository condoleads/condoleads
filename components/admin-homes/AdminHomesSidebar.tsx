// components/admin-homes/AdminHomesSidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import type { AdminHomesUser } from '@/lib/admin-homes/auth'

const ALL_NAV = [
  { href: '/admin-homes', label: 'Dashboard', icon: '🏠', roles: ['admin', 'manager', 'agent'] },
  { href: '/admin-homes/leads', label: 'Leads', icon: '📋', roles: ['admin', 'manager', 'agent'] },
  { href: '/admin-homes/agents', label: 'Agents', icon: '👥', roles: ['admin', 'manager'] },
  { href: '/admin-homes/bulk-sync', label: 'Bulk Sync', icon: '🔄', roles: ['admin'] },
  { href: '/admin-homes/tenants', label: 'Tenants', icon: '🏢', roles: ['admin'] },
  { href: '/admin-homes/listings', label: 'Listings', icon: '📄', roles: ['admin'] },
]

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin:   { label: 'Admin',   color: 'bg-purple-600' },
  manager: { label: 'Manager', color: 'bg-blue-600' },
  agent:   { label: 'Agent',   color: 'bg-green-600' },
}

export default function AdminHomesSidebar({ user }: { user: AdminHomesUser }) {
  const pathname = usePathname()
  const router = useRouter()

  const navItems = ALL_NAV.filter(item => item.roles.includes(user.role))

  const handleLogout = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return document.cookie.split('; ').find(r => r.startsWith(name + '='))?.split('=')[1] || null
          },
          set(name, value, options) {
            document.cookie = `${name}=${value}; path=/; max-age=${options?.maxAge || 3600}`
          },
          remove(name) {
            document.cookie = `${name}=; path=/; max-age=0`
          },
        },
      }
    )
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const roleInfo = ROLE_LABELS[user.role]

  return (
    <aside className="w-56 bg-green-900 text-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-green-800">
        <h1 className="text-lg font-bold">Admin Homes</h1>
        <p className="text-green-300 text-xs mt-1">Residential Properties</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/admin-homes' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                isActive
                  ? 'bg-green-700 text-white font-medium'
                  : 'text-green-200 hover:bg-green-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User info + logout */}
      <div className="p-3 border-t border-green-800 space-y-3">
        {/* Role badge + name */}
        <div className="px-3 py-2 bg-green-800 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${roleInfo.color}`}>
              {roleInfo.label}
            </span>
          </div>
          <div className="text-sm font-medium text-white truncate">{user.name}</div>
          <div className="text-xs text-green-400 truncate">{user.email}</div>
        </div>

        {/* Switch to Condos */}
        <Link
          href="/admin"
          className="flex items-center gap-2 px-3 py-2 rounded text-sm text-green-300 hover:bg-green-800 hover:text-white transition-colors"
        >
          <span>🏢</span>
          <span>Switch to Condos</span>
        </Link>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-red-300 hover:bg-red-900 hover:text-white transition-colors"
        >
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}