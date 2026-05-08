// app/admin-homes/territory/page.tsx
// T4a-2: Territory coverage page (per-tenant view).
// Mirrors agents/page.tsx auth pattern. Per Q1 product call (W-TERRITORY v12).

import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TerritoryClient from '@/components/admin-homes/TerritoryClient'

export const metadata = { title: 'Territory – Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminHomesTerritoryPage() {
  const user = await resolveAdminHomesUser()
  if (!user) redirect('/login?redirect=/admin-homes/territory')

  const seeAll = user.isPlatformAdmin === true && !user.tenantId
  const scopedTenantId = user.tenantId

  let tenantName: string | null = null
  if (scopedTenantId) {
    const supabase = createClient()
    const { data } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', scopedTenantId)
      .maybeSingle()
    tenantName = data?.name ?? null
  }

  return (
    <TerritoryClient
      tenantId={scopedTenantId}
      tenantName={tenantName}
      seeAll={seeAll}
    />
  )
}
