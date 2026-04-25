// app/admin-homes/settings/page.tsx
// Phase 3.3 — tenant settings workspace (server)

import { redirect } from 'next/navigation'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServerClient } from '@/lib/supabase/server'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await resolveAdminHomesUser()
  if (!user) redirect('/login?redirect=/admin-homes/settings')

  const allowed =
    user.isPlatformAdmin === true ||
    user.position === 'tenant_admin'
  if (!allowed) redirect('/admin-homes')

  if (!user.tenantId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tenant Settings</h1>
        <p className="text-gray-600">No tenant selected. Platform Admins should choose a tenant from <a href="/platform" className="text-blue-600 underline">/platform</a>.</p>
      </div>
    )
  }

  const supabase = await createServerClient()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', user.tenantId)
    .maybeSingle()

  if (!tenant) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-red-700">Tenant not found</h1>
        <p className="text-gray-600">Tenant id {user.tenantId} does not exist.</p>
      </div>
    )
  }

  return <SettingsClient tenant={tenant} canManageLifecycle={user.isPlatformAdmin || user.position === 'tenant_admin'} />
}