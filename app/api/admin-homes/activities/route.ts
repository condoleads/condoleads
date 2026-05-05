// app/api/admin-homes/activities/route.ts
// Fetch user activity timeline by email for the leads dashboard.
// Phase 3.4+: tenant-scoped via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

export async function GET(request: NextRequest) {
  try {
    const user = await resolveAdminHomesUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const supabase = createServiceClient()

    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    // Tenant scoping: resolve which agent IDs the caller may see activity for.
    const seeAll = user.isPlatformAdmin === true && !user.tenantId
    const scopedTenantId = user.tenantId

    let agentIdFilter: string[] | null = null
    if (!seeAll) {
      if (!scopedTenantId) {
        return NextResponse.json({ activities: [] })
      }
      const { data: tenantAgents } = await supabase
        .from('agents')
        .select('id')
        .eq('tenant_id', scopedTenantId)
      agentIdFilter = (tenantAgents || []).map((a: any) => a.id)
      if (agentIdFilter.length === 0) {
        return NextResponse.json({ activities: [] })
      }

      // Role-based narrowing within tenant.
      if (user.role === 'manager' && user.agentId) {
        agentIdFilter = [user.agentId, ...user.managedAgentIds]
      } else if (user.role === 'agent' && user.agentId) {
        agentIdFilter = [user.agentId]
      }
    }

    let query = supabase
      .from('user_activities')
      .select('id, activity_type, activity_data, page_url, created_at')
      .eq('contact_email', email)
      .order('created_at', { ascending: true })
      .limit(50)

    if (agentIdFilter !== null) {
      query = query.in('agent_id', agentIdFilter)
    }

    const { data: activities, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ activities: activities || [] })
  } catch (error) {
    console.error('[admin-homes/activities] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}