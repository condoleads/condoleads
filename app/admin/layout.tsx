import { redirect } from 'next/navigation'
import { getCurrentUser, isAdmin } from '@/lib/auth/helpers'
import AdminLayoutClient from '@/components/admin/AdminLayoutClient'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const adminStatus = await isAdmin(user.id)
  
  if (!adminStatus) {
    redirect('/dashboard')
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>
}