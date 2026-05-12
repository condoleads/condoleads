// app/admin-homes/leads/page.tsx
import { createClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'
import AdminHomesLeadsClient from '@/components/admin-homes/AdminHomesLeadsClient'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export const metadata = { title: 'Leads — Admin' }

export default async function AdminHomesLeadsPage() {
  const supabase = createServiceClient()
  const tenantId = await getCurrentTenantId()
  const adminUser = await resolveAdminHomesUser()

  // Phase 3.4+: tenant scoping
  // Tenant Admin / staff: filter by their own tenant
  // Platform Admin with no selected tenant: see all leads
  // Platform Admin with host-resolved tenant: filter by that
  const seeAll = adminUser?.isPlatformAdmin === true && !adminUser.tenantId && !tenantId
  const scopedTenantId = adminUser?.tenantId ?? tenantId

  // Build query based on role
  let query = supabase
    .from('leads')
    .select(`
      *,
      agents!leads_agent_id_fkey ( id, full_name, email ),
      manager:agents!leads_manager_id_fkey ( id, full_name, email ),
      area_manager:agents!leads_area_manager_id_fkey ( id, full_name, email ),
      tenant_admin:agents!leads_tenant_admin_id_fkey ( id, full_name, email )
    `)
    .order('created_at', { ascending: false })
    .limit(10000)

  if (!seeAll) {
    if (!scopedTenantId) {
      // Authenticated but no tenant context — return empty
      return (
        <AdminHomesLeadsClient
          initialLeads={[]}
          initialActivities={{}}
          initialCreditOverrides={{}}
          initialVipRequests={{}}
          agents={[]}
          currentRole={adminUser?.role || 'admin'}
          currentAgentId={adminUser?.agentId || null}
        />
      )
    }
    query = query.eq('tenant_id', scopedTenantId)
  }

  if (adminUser?.role === 'manager' && adminUser.agentId) {
    // Manager sees own leads + all managed agents' leads
    const agentIds = [adminUser.agentId, ...adminUser.managedAgentIds]
    query = query.in('agent_id', agentIds)
  } else if (adminUser?.role === 'agent' && adminUser.agentId) {
    // Agent sees only their own leads
    query = query.eq('agent_id', adminUser.agentId)
  }
  // Admin sees all — no filter

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

  // L5: pre-fetch user_credit_overrides + vip_requests for credit posture chip.
  // Multi-tenant safety: both tables have tenant_id NOT NULL. Scope by scopedTenantId when !seeAll.
  // user_credit_overrides keyed by (user_id, tenant_id) -- 1 row per user per tenant. Join by lead.user_id.
  // vip_requests has direct FK lead_id to leads. Join by lead.id (semantically equivalent to "by lead.user_id" since lead.id is keyed under lead.user_id).
  const leadUserIds = Array.from(
    new Set((leads || []).map((l: any) => l.user_id).filter(Boolean))
  ) as string[];
  const leadIds = (leads || []).map((l: any) => l.id) as string[];

  const creditByUserId: Record<string, any> = {};
  if (leadUserIds.length > 0) {
    let credQuery = supabase
      .from('user_credit_overrides')
      .select('user_id, ai_chat_limit, buyer_plan_limit, seller_plan_limit, estimator_limit, granted_at, granted_by_tier')
      .in('user_id', leadUserIds);
    if (!seeAll && scopedTenantId) {
      credQuery = credQuery.eq('tenant_id', scopedTenantId);
    }
    const { data: creditRows } = await credQuery;
    for (const c of (creditRows || [])) {
      const uid = (c as any).user_id;
      if (uid) creditByUserId[uid] = c;
    }
  }

  const vipByLeadId: Record<string, any[]> = {};
  if (leadIds.length > 0) {
    let vipQuery = supabase
      .from('vip_requests')
      .select('id, lead_id, status, request_type, messages_granted, created_at, expires_at')
      .in('lead_id', leadIds);
    if (!seeAll && scopedTenantId) {
      vipQuery = vipQuery.eq('tenant_id', scopedTenantId);
    }
    const { data: vipRows } = await vipQuery;
    for (const v of (vipRows || [])) {
      const lid = (v as any).lead_id;
      if (lid) {
        if (!vipByLeadId[lid]) vipByLeadId[lid] = [];
        vipByLeadId[lid].push(v);
      }
    }
  }

  // Agents for filter dropdown — scoped by role
  let agentsQuery = supabase
    .from('agents')
    .select('id, full_name, email')
    .eq('site_type', 'comprehensive')
    .order('full_name')

  if (!seeAll && scopedTenantId) {
    agentsQuery = agentsQuery.eq('tenant_id', scopedTenantId)
  }

  if (adminUser?.role === 'manager' && adminUser.agentId) {
    // Manager only sees themselves + their managed agents in filter
    agentsQuery = agentsQuery.in('id', [adminUser.agentId, ...adminUser.managedAgentIds])
  } else if (adminUser?.role === 'agent' && adminUser.agentId) {
    agentsQuery = agentsQuery.eq('id', adminUser.agentId)
  }

  const { data: agents } = await agentsQuery

  return (
    <AdminHomesLeadsClient
      initialLeads={leads || []}
      initialActivities={activitiesByLeadId}
      initialCreditOverrides={creditByUserId}
      initialVipRequests={vipByLeadId}
      agents={agents || []}
      currentRole={adminUser?.role || 'admin'}
      currentAgentId={adminUser?.agentId || null}
    />
  )
}