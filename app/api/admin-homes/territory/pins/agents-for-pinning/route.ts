// app/api/admin-homes/territory/pins/agents-for-pinning/route.ts
// W-TERRITORY-MASTER P5: Active selling agents in a tenant, for the Pin form picker.
//
// GET /api/admin-homes/territory/pins/agents-for-pinning?tenant_id=...
// Returns: { data: [{ id, full_name, is_active, is_selling, role }] }
//
// Dedicated to PinsView. Avoids piggy-backing on /admin-homes/agents/list,
// which filters by site_type='comprehensive' (legacy condos-vs-comprehensive
// split) and would return zero WALLiam agents (site_type='condos').

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

export async function GET(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const requestedTenantId = url.searchParams.get('tenant_id')

  let tenantId: string | null = null
  if (user.isPlatformAdmin) {
    tenantId = requestedTenantId || user.tenantId
  } else {
    tenantId = user.tenantId
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant scope' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('agents')
    .select('id, full_name, is_active, is_selling, role, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('is_selling', true)
    .order('full_name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data || [] })
}