// app/admin-homes/tenants/[id]/page.tsx
// W-COCKPIT P-A-3 -- per-tenant cockpit entry point with real lens data.
//
// Server component: validates platform-admin access, fetches everything the
// cockpit's first three real lenses (People, Territory, Live) need, and the
// existing Settings data, and passes it all to CockpitShell.
//
// Tenant scope is the URL param. Agents, leads, activities, tenant brand are
// all fetched server-side scoped to that tenant. No client-side data fetching
// for the real lenses (matches the existing /admin-homes/leads + /agents
// pattern; SSR fast path; no loading state on tab switch).
//
// Inventory + Simulator stay placeholder (Phase B/C).

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import CockpitShell from '@/components/admin-homes/cockpit/CockpitShell'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function createServiceRoleClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function TenantCockpitPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { expanded?: string; showTerminal?: string }
}) {
  const user = await resolveAdminHomesUser()
  if (!user) redirect(`/login?redirect=/admin-homes/tenants/${params.id}`)
  if (!user.isPlatformAdmin) redirect('/admin-homes')

  // P-A-3: searchParams pass-through for Live lens (mirrors /admin-homes/leads).
  const initialExpanded = searchParams?.expanded === '1'
  const initialShowTerminal = searchParams?.showTerminal === '1'

  // Two clients: server (cookie-based) for tenant + geo lists. Service role for
  // leads + agents + activities (bypasses RLS for platform admin viewing any tenant).
  const supabase = createServerClient()
  const svc = createServiceRoleClient()

  // ---- 1. Tenant row (gates the rest) ----------------------------------------
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!tenant) notFound()

  const tenantName = tenant.brand_name || tenant.name
  const tenantBrandName = tenant.brand_name || tenant.name || null
  const tenantDomain = tenant.domain || null

  // ---- 2. Settings tab data (existing) ---------------------------------------
  const [
    { data: areas },
    { data: municipalities },
    { data: communities },
    { data: neighbourhoods },
    { data: currentRestrictions },
  ] = await Promise.all([
    supabase.from('treb_areas').select('id, name, slug').order('name'),
    supabase.from('municipalities').select('id, name, slug, area_id').order('name'),
    supabase.from('communities').select('id, name, slug, municipality_id').order('name'),
    supabase.from('neighbourhoods').select('id, name, slug, area_id').order('name'),
    supabase.from('tenant_property_access')
      .select('*')
      .eq('tenant_id', params.id)
      .eq('is_active', true),
  ])

  // ---- 3. People tab data: tenant-scoped agents with per-agent enrichment ----
  // Mirrors app/admin-homes/agents/page.tsx pattern (site_type filter +
  // N+1 enrichment for leads/territories/buildings counts).
  const { data: agentsRaw } = await svc
    .from('agents')
    .select('*')
    .eq('site_type', 'comprehensive')
    .eq('tenant_id', params.id)
    .order('created_at', { ascending: false })

  const agentsWithStats = await Promise.all(
    (agentsRaw || []).map(async (agent) => {
      const [
        { data: agentLeads },
        { data: geoAssignments },
        { data: buildingAssignments },
      ] = await Promise.all([
        svc.from('leads').select('id, status, quality, temperature').eq('agent_id', agent.id),
        svc.from('agent_property_access').select('id').eq('agent_id', agent.id).eq('is_active', true),
        svc.from('agent_geo_buildings').select('id').eq('agent_id', agent.id),
      ])
      return {
        ...agent,
        total_leads: agentLeads?.length || 0,
        new_leads: (agentLeads || []).filter(l => l.status === 'new').length,
        hot_leads: (agentLeads || []).filter(l => l.temperature === 'hot').length,
        geo_territories: geoAssignments?.length || 0,
        assigned_buildings: buildingAssignments?.length || 0,
      }
    })
  )

  // AgentsManagementClient expects a tenants[] array even when scoped to one.
  const tenantsForClient = [{ id: tenant.id, name: tenant.name, domain: tenant.domain }]

  // ---- 4. Live tab data: tenant-scoped leads + activities --------------------
  // Mirrors app/admin-homes/leads/page.tsx full select (all relations).
  // Cockpit is always tenant-scoped (URL has tenant id), so seeAll = false here.
  const { data: leads } = await svc
    .from('leads')
    .select(`
      *,
      agents!leads_agent_id_fkey ( id, full_name, email ),
      manager:agents!leads_manager_id_fkey ( id, full_name, email ),
      area_manager:agents!leads_area_manager_id_fkey ( id, full_name, email ),
      tenant_admin:agents!leads_tenant_admin_id_fkey ( id, full_name, email ),
      building:buildings!leads_building_id_fkey ( id, building_name, slug ),
      listing:mls_listings!leads_listing_id_fkey ( id, unparsed_address ),
      area:treb_areas!leads_area_id_fkey ( id, name, slug ),
      municipality:municipalities!leads_municipality_id_fkey ( id, name, slug ),
      community:communities!leads_community_id_fkey ( id, name, slug ),
      neighbourhood:neighbourhoods!leads_neighbourhood_id_fkey ( id, name, slug )
    `)
    .eq('tenant_id', params.id)
    .order('created_at', { ascending: false })
    .limit(10000)

  // Pre-fetch user_activities for engagement badge + last-2-activities preview.
  // Same pattern as /admin-homes/leads/page.tsx.
  const leadEmails = Array.from(
    new Set((leads || []).map((l: any) => l.contact_email).filter(Boolean))
  ) as string[]

  const activitiesByLeadId: Record<string, Array<{
    id: string; activity_type: string; activity_data: any; page_url: string | null; created_at: string
  }>> = {}

  if (leadEmails.length > 0) {
    const { data: allActivities } = await svc
      .from('user_activities')
      .select('id, activity_type, activity_data, page_url, created_at, contact_email')
      .eq('tenant_id', params.id)
      .in('contact_email', leadEmails)
      .order('created_at', { ascending: true })

    const byEmail: Record<string, any[]> = {}
    for (const a of (allActivities || [])) {
      const email = (a as any).contact_email
      if (!byEmail[email]) byEmail[email] = []
      byEmail[email].push(a)
    }
    for (const lead of (leads || [])) {
      activitiesByLeadId[(lead as any).id] = byEmail[(lead as any).contact_email] || []
    }
  }

  // Agents-for-filter dropdown (lean shape required by AdminHomesLeadsClient).
  const agentsForLeadsFilter = (agentsWithStats || []).map(a => ({
    id: a.id,
    full_name: a.full_name,
    email: a.email,
  }))

  // ---- Render ----------------------------------------------------------------
  return (
    <div className="-m-6">
      {/* Page chrome above the cockpit shell */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <Link
          href="/admin-homes/tenants"
          className="text-sm text-green-600 hover:text-green-700 inline-block mb-3"
        >
          {'\u2190'} Back to Tenants
        </Link>
        <div className="flex items-center gap-4">
          {tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo_url} alt={tenant.name} className="w-14 h-14 rounded-lg object-contain" />
          ) : (
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center text-white text-2xl font-black"
              style={{ background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})` }}
            >
              {'\u2728'}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{tenantName}</h1>
            <p className="text-gray-500">{tenant.domain} {'\u00B7'} {tenant.admin_email}</p>
            <span
              className={
                'text-xs font-semibold px-2 py-1 rounded-full ' +
                (tenant.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')
              }
            >
              {tenant.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      <CockpitShell
        tenantId={params.id}
        tenantName={tenantName}
        tenantBrandName={tenantBrandName}
        tenantDomain={tenantDomain}
        currentRole={user.role || 'admin'}
        currentAgentId={user.agentId || null}
        // W-COCKPIT-PARITY UNIT 12: closes the carried follow-ups from UNITs
        // 3 and 10. tenantDefaultAgentId drives the owner header card + Crown
        // pill in the cockpit People table view (UNIT 3 parity). The cockpit's
        // tenant fetch already loads the row via SELECT *, so default_agent_id
        // is available with no new query.
        tenantDefaultAgentId={tenant.default_agent_id || null}
        // canSetOversightOptOut mirrors the standalone /admin-homes/agents
        // page's logic (UNIT 10): tenant_admin / admin / assistant / platform
        // admin can write notification_preferences.oversight_opt_out. Drives
        // whether the opt-out toggle renders in cockpit EditAgentModal. The
        // server PUT route is the security backstop; this drives UI render
        // only.
        canSetOversightOptOut={
          user.isPlatformAdmin === true
          || user.role === 'admin'
          || user.position === 'tenant_admin'
          || user.position === 'assistant'
        }
        people={{
          agents: agentsWithStats,
          tenants: tenantsForClient,
        }}
        live={{
          leads: leads || [],
          activities: activitiesByLeadId,
          agents: agentsForLeadsFilter,
          initialExpanded,
          initialShowTerminal,
        }}
        settings={{
          tenant: {
            id: tenant.id,
            name: tenant.name,
            brand_name: tenant.brand_name,
            ai_free_messages: tenant.ai_free_messages,
            ai_auto_approve_limit: tenant.ai_auto_approve_limit,
            ai_manual_approve_limit: tenant.ai_manual_approve_limit,
            ai_hard_cap: tenant.ai_hard_cap,
            vip_auto_approve: tenant.vip_auto_approve,
          },
          areas: areas || [],
          municipalities: municipalities || [],
          communities: communities || [],
          neighbourhoods: neighbourhoods || [],
          currentRestrictions: currentRestrictions || [],
        }}
      />
    </div>
  )
}
