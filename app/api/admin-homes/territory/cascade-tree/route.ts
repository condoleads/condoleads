// app/api/admin-homes/territory/cascade-tree/route.ts
// W-COCKPIT P-B-2 Commit 2 -- cascade tree data for Territory Chart view.
//
// Returns: every card (defaults + assignments) for the requesting tenant,
// organized by scope. Single fetch, server-side, real data.
//
// Multi-tenant safe: tenant_id is derived from auth (resolveAdminHomesUser)
// OR from ?tenant_id= query param for platform-admin cross-tenant viewing.
// Tenant_managers can only fetch their assigned tenants.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'

export const dynamic = 'force-dynamic'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Resolve effective tenant_id (URL override or user's home).
  const overrideRaw = req.nextUrl.searchParams.get('tenant_id')
  let effectiveTenantId: string | null = null

  if (overrideRaw) {
    // UUID format check.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(overrideRaw)) {
      return NextResponse.json({ error: 'bad tenant_id format' }, { status: 400 })
    }
    // Authorization gate.
    if (user.isPlatformAdmin) {
      effectiveTenantId = overrideRaw
    } else {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      const { data: assignment } = await supabase
        .from('tenant_manager_assignments')
        .select('tenant_id')
        .eq('user_id', authUser.id)
        .eq('tenant_id', overrideRaw)
        .is('revoked_at', null)
        .maybeSingle()
      if (!assignment) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      effectiveTenantId = overrideRaw
    }
  } else {
    effectiveTenantId = user.tenantId
  }

  if (!effectiveTenantId) {
    return NextResponse.json({ error: 'no tenant scope' }, { status: 400 })
  }

  const s = svc()

  // ─── Fetch tenant + agents + geo skeletons + all cards in parallel ────
  const [
    tenantRes,
    agentsRes,
    areasRes,
    munisRes,
    commsRes,
    nbhdsRes,
    apaRes,
    agbRes,
    alaRes,
    tpaRes,
  ] = await Promise.all([
    s.from('tenants')
      .select('id, name, brand_name, default_agent_id')
      .eq('id', effectiveTenantId)
      .single(),

    s.from('agents')
      .select('id, full_name, email, role, is_selling, is_active, parent_id, tenant_id')
      .eq('tenant_id', effectiveTenantId)
      .eq('is_active', true),

    s.from('treb_areas').select('id, name, slug').order('name'),
    s.from('municipalities').select('id, name, slug, area_id').order('name'),
    s.from('communities').select('id, name, slug, municipality_id').order('name'),
    s.from('neighbourhoods').select('id, name, slug, area_id').order('name'),

    // All active apa cards for this tenant.
    s.from('agent_property_access')
      .select('id, agent_id, scope, area_id, municipality_id, community_id, neighbourhood_id, condo_access, homes_access, buildings_access, buildings_mode, is_primary, is_active, created_at, updated_at')
      .eq('tenant_id', effectiveTenantId)
      .eq('is_active', true),

    // All building cards for agents in this tenant (join via agent.tenant_id).
    // C2b: also pull building name + community + municipality chain so the
    // chart's building strip can render real labels, not UUIDs.
    s.from('agent_geo_buildings')
      .select('id, agent_id, building_id, assigned_by, created_at, agents!agent_geo_buildings_agent_id_fkey!inner(tenant_id, full_name, is_selling), buildings(id, building_name, community_id, communities(id, name, municipality_id, municipalities(id, name)))')
      .eq('agents.tenant_id', effectiveTenantId),

    // All listing pins for agents in this tenant.
    s.from('agent_listing_assignments')
      .select('id, agent_id, listing_id, assigned_by, created_at, agents!inner(tenant_id, full_name, is_selling)')
      .eq('agents.tenant_id', effectiveTenantId),

    // Tenant whitelist (gate at resolver step 0).
    s.from('tenant_property_access')
      .select('id, scope, area_id, municipality_id, community_id, neighbourhood_id, condo_access, homes_access, buildings_access, is_active')
      .eq('tenant_id', effectiveTenantId)
      .eq('is_active', true),
  ])

  // Surface errors but don't crash if a table is empty.
  if (tenantRes.error) return NextResponse.json({ error: 'tenant fetch: ' + tenantRes.error.message }, { status: 500 })

  const tenant = tenantRes.data
  const agents = agentsRes.data || []
  const sellingAgents = agents.filter(a => a.is_selling)

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      name: tenant.brand_name || tenant.name,
      default_agent_id: tenant.default_agent_id,
    },
    agents,
    sellingAgentsCount: sellingAgents.length,
    geo: {
      areas: areasRes.data || [],
      municipalities: munisRes.data || [],
      communities: commsRes.data || [],
      neighbourhoods: nbhdsRes.data || [],
    },
    cards: {
      geo: apaRes.data || [],
      buildings: agbRes.data || [],
      listings: alaRes.data || [],
    },
    restrictions: tpaRes.data || [],
    counts: {
      areasTotal: (areasRes.data || []).length,
      munisTotal: (munisRes.data || []).length,
      commsTotal: (commsRes.data || []).length,
      nbhdsTotal: (nbhdsRes.data || []).length,
      geoCards: (apaRes.data || []).length,
      buildingCards: (agbRes.data || []).length,
      listingCards: (alaRes.data || []).length,
      restrictionsActive: (tpaRes.data || []).length,
    },
  })
}