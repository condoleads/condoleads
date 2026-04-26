// app/api/admin-homes/agents/list/route.ts
// Lightweight dropdown list — id, full_name, subdomain, can_create_children, role
// Used by AddAgentModal and EditAgentModal for the "Reports To" selector
// Phase 3.4+: tenant-scoped via shared api-auth helper.

import { NextResponse } from 'next/server'
import { requireAdminHomesUser } from '@/lib/admin-homes/api-auth'

export async function GET() {
  const auth = await requireAdminHomesUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  let query = supabase
    .from('agents')
    .select('id, full_name, subdomain, can_create_children, role, tenant_id')
    .eq('site_type', 'comprehensive')
    .eq('is_active', true)
    .order('full_name')

  // Tenant scoping: only Platform Admin without selected tenant sees all.
  if (!(user.isPlatformAdmin && !user.tenantId)) {
    if (!user.tenantId) {
      return NextResponse.json({ agents: [] })
    }
    query = query.eq('tenant_id', user.tenantId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agents: data || [] })
}