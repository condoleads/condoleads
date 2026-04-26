// app/admin-homes/bulk-sync/page.tsx
// Phase 3.4+: Platform Admin only.

import { redirect } from 'next/navigation'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import BulkSyncClient from './BulkSyncClient'

export const metadata = { title: 'Bulk Sync - Platform' }

export default async function BulkSyncPage() {
  const user = await resolveAdminHomesUser()
  if (!user) redirect('/login?redirect=/admin-homes/bulk-sync')
  if (!user.isPlatformAdmin) redirect('/admin-homes')
  return <BulkSyncClient />
}