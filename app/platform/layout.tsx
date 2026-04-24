// app/platform/layout.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { resolvePlatformAdmin } from '@/lib/platform/auth'

export const dynamic = 'force-dynamic'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await resolvePlatformAdmin()

  if (!admin) {
    redirect('/login?redirect=/platform')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/platform" className="flex flex-col">
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Platform</span>
              <span className="text-sm font-semibold text-slate-100">01leads Console</span>
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex flex-col text-right">
              <span className="text-slate-100 font-medium leading-tight">{admin.name}</span>
              <span className="text-xs text-slate-500 leading-tight">{admin.email}</span>
            </div>
          </div>
        </div>
      </header>
      <main className="p-6">
        {children}
      </main>
    </div>
  )
}