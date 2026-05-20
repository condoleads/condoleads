// app/admin-homes/leads/page.tsx
import { createClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'
import { scopeLeadsQuery, scopeAgentsByRole } from '@/lib/admin-homes/scope'
import AdminHomesLeadsClient from '@/components/admin-homes/AdminHomesLeadsClient'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export const metadata = { title: 'Leads — Admin' }

export default async function AdminHomesLeadsPage({ searchParams }: { searchParams: { expanded?: string; showTerminal?: string } }) {
  const initialExpanded = searchParams?.expanded === '1'
  // W6c: default-hide of terminal statuses (closed/won/lost/archived/do_not_contact) is opt-out via ?showTerminal=1.
  const initialShowTerminal = searchParams?.showTerminal === '1'
  const supabase = createServiceClient()
  const tenantId = await getCurrentTenantId()
  const adminUser = await resolveAdminHomesUser()

  // Phase 3.4+: tenant scoping
  // Tenant Admin / staff: filter by their own tenant
  // Platform Admin with no selected tenant: see all leads
  // Platform Admin with host-resolved tenant: filter by that
  const seeAll = adminUser?.isPlatformAdmin === true && !adminUser.tenantId && !tenantId
  const scopedTenantId = adminUser?.tenantId ?? tenantId

  // C10 -- fetch tenant brand identity for client display strings (page title,
  // subtitle, CSV filename). Falls back to null when no tenant scope (seeAll
  // path or unresolved). Client uses null-safe fallbacks.
  let tenantBrandName: string | null = null
  let tenantDomain: string | null = null
  if (scopedTenantId) {
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('brand_name, name, domain')
      .eq('id', scopedTenantId)
      .single()
    if (tenantRow) {
      tenantBrandName = tenantRow.brand_name || tenantRow.name || null
      tenantDomain = tenantRow.domain || null
    }
  }

  // Build query based on role
  let query = supabase
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
    .order('created_at', { ascending: false })
    .limit(10000)

  if (!seeAll && !scopedTenantId) {
    // Authenticated but no tenant context — return empty
    return (
      <AdminHomesLeadsClient
        initialLeads={[]}
        initialActivities={{}}
        agents={[]}
        currentRole={adminUser?.role || 'admin'}
        currentAgentId={adminUser?.agentId || null}
        initialExpanded={initialExpanded}
        initialShowTerminal={initialShowTerminal}
        tenantBrandName={tenantBrandName}
        tenantDomain={tenantDomain}
      />
    )
  }

  // W5c-2: scope.ts consumer migration. Replaces inline tenant + role gates
  // with scopeLeadsQuery helper. Behavior-preserving when adminUser is non-null
  // (inline pattern matched helper semantics exactly). Preserves the existing
  // null-adminUser tenant-only fallback (no role gate when not authenticated).
  if (adminUser) {
    query = scopeLeadsQuery(query, adminUser, tenantId)
  } else if (!seeAll && scopedTenantId) {
    query = query.eq('tenant_id', scopedTenantId)
  }

  const { data: leads } = await query

  // L4: pre-fetch user_activities for inline engagement badge + last-2-activities preview.
  // Multi-tenant safety: scope by tenant_id when !seeAll (mirrors leads query at line above).
  // Role scoping is implicit -- only activities for emails of already-role-filtered leads are fetched.
  const leadEmails = Array.from(
    new Set((leads || []).map((l: any) => l.contact_email).filter(Boolean))
  ) as string[];
  const activitiesByLeadId: Record<string, Array<{ id: string; activity_type: string; activity_data: any; page_url: string | null; created_at: string }>> = {};
  if (leadEmails.length > 0) {
    let actQuery = supabase
      .from('user_activities')
      .select('id, activity_type, activity_data, page_url, created_at, contact_email')
      .in('contact_email', leadEmails)
      .order('created_at', { ascending: true });
    if (!seeAll && scopedTenantId) {
      actQuery = actQuery.eq('tenant_id', scopedTenantId);
    }
    const { data: allActivities } = await actQuery;
    const byEmail: Record<string, any[]> = {};
    for (const a of (allActivities || [])) {
      const email = (a as any).contact_email;
      if (!byEmail[email]) byEmail[email] = [];
      byEmail[email].push(a);
    }
    for (const lead of (leads || [])) {
      activitiesByLeadId[(lead as any).id] = byEmail[(lead as any).contact_email] || [];
    }
  }

  // W5c-2: scope.ts consumer migration. Agents-for-filter dropdown uses
  // scopeAgentsByRole (mirrors leads query scoping above with column=id).
  let agentsQuery = supabase
    .from('agents')
    .select('id, full_name, email')
    .eq('site_type', 'comprehensive')
    .order('full_name')

  if (adminUser) {
    agentsQuery = scopeAgentsByRole(agentsQuery, adminUser, tenantId)
  } else if (!seeAll && scopedTenantId) {
    agentsQuery = agentsQuery.eq('tenant_id', scopedTenantId)
  }

  const { data: agents } = await agentsQuery

  return (
    <AdminHomesLeadsClient
      initialLeads={leads || []}
      initialActivities={activitiesByLeadId}
      agents={agents || []}
      currentRole={adminUser?.role || 'admin'}
      currentAgentId={adminUser?.agentId || null}
      initialExpanded={initialExpanded}
      initialShowTerminal={initialShowTerminal}
      tenantBrandName={tenantBrandName}
      tenantDomain={tenantDomain}
    />
  )
}
