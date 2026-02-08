// app/admin-homes/layout.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/admin-homes', label: 'Dashboard', icon: '' },
  { href: '/admin-homes/bulk-sync', label: 'Bulk Sync', icon: '' },
  { href: '/admin-homes/listings', label: 'Listings', icon: '' },
]

export default function AdminHomesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-green-900 text-white flex flex-col">
        <div className="p-4 border-b border-green-800">
          <h1 className="text-lg font-bold"> Admin Homes</h1>
          <p className="text-green-300 text-xs mt-1">Residential Properties</p>
        </div>
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
        <div className="p-3 border-t border-green-800">
          <Link
            href="/admin"
            className="flex items-center gap-2 px-3 py-2 rounded text-sm text-green-300 hover:bg-green-800 hover:text-white transition-colors"
          >
            <span></span>
            <span>Switch to Condos</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}
