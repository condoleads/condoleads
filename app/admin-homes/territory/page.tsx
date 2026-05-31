// app/admin-homes/territory/page.tsx
// P-DASHBOARD GAP-A: route the legacy /admin-homes/territory URL to the
// operator cockpit (lives at /admin-homes/tenants/<id>'s Territory tab).
// The legacy TerritoryClient (Coverage/Matrix/Audit) is still reachable as
// the "Detail" sub-view inside the cockpit's TerritoryTab.
//
// Tenant-scoped users -> their tenant's cockpit.
// Platform admins without a tenant scope -> tenants list.

import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Territory – Admin' }

export default async function AdminHomesTerritoryPage() {
  const user = await resolveAdminHomesUser()
  if (!user) redirect('/login?redirect=/admin-homes/territory')
  if (user.tenantId) redirect(`/admin-homes/tenants/${user.tenantId}`)
  redirect('/admin-homes/tenants')
}
