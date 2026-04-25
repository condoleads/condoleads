// app/admin-homes/layout.tsx
import { redirect } from 'next/navigation'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import AdminHomesSidebar from '@/components/admin-homes/AdminHomesSidebar'
import TenantHeader from '@/components/admin-homes/TenantHeader'

export default async function AdminHomesLayout({ children }: { children: React.ReactNode }) {
  const adminUser = await resolveAdminHomesUser()
  if (!adminUser) {
    redirect('/login?redirect=/admin-homes')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminHomesSidebar user={adminUser} />
      <div className="flex-1 flex flex-col min-w-0">
        <TenantHeader
          tenantId={adminUser.tenantId}
          isPlatformAdmin={adminUser.isPlatformAdmin}
        />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}