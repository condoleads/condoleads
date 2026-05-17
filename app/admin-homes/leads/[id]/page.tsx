// app/admin-homes/leads/[id]/page.tsx
// W-LEADS-WORKBENCH W4a (2026-05-13).
//
// Workbench page shell -- server component. Anchors on a single lead by id,
// then aggregates all leads from the same user_id within the same tenant_id
// (cumulative view per outcome #3). Permission-gated via can('lead.read').
//
// MULTITENANT CONTRACT (Rule Zero #1):
//   - Cross-tenant access returns notFound() (404, defense-in-depth -- no
//     leak of existence via 403).
//   - leadFamily aggregation scoped by anchorLead.tenant_id always
//     (trusted source -- anchorLead already passed the tenant gate).
//
// PERMISSION CONTRACT:
//   - can(user.permissions, 'lead.read', { kind: 'lead', leadId, tenantId, agentId })
//     gates access to the anchor. Sibling leads in the same user-family
//     within the same tenant are shown without per-agent filter (intent:
//     agents see the complete journey for that user -- outcome #3).
//     F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE -- EVALUATED W5c-5 (2026-05-16):
//     LOCKED keep-as-is. Decision rationale:
//       (a) outcome #3 of W-LEADS-WORKBENCH v2 scope-lock explicitly
//           calls for cumulative-journey view (agent sees the complete
//           user journey across all touchpoints, even sibling leads
//           owned by other agents in the same tenant);
//       (b) tenant safety is preserved (every sibling fetch is gated
//           by anchorLead.tenant_id, the trusted source from the
//           cross-tenant gate above) -- this is NOT a multi-tenant leak;
//       (c) the visibility is intra-tenant only: an agent in tenant A
//           never sees a lead in tenant B regardless of user_id
//           collisions;
//       (d) changing to per-agent scope would be a UX regression for
//           agents serving repeat-engagement users (the whole point of
//           the workbench cumulative-history surface).
//     Forward escape hatch: if a future requirement surfaces for
//     agent-only sibling visibility (e.g. a tenant onboards with a
//     brokerage-level privacy policy), implement as an opt-in tenant
//     config flag rather than changing the default behavior.

import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'
import { can } from '@/lib/admin-homes/permissions'
import { getScopedTenantId, isCrossTenantView } from '@/lib/admin-homes/scope'
import LeadWorkbenchClient from './LeadWorkbenchClient'

export const metadata = { title: 'Lead Workbench — Admin' }

const ANCHOR_SELECT = '*, agents!leads_agent_id_fkey(id, full_name, email, cell_phone, profile_photo_url, brokerage_name, title), manager:agents!leads_manager_id_fkey(id, full_name, email), area_manager:agents!leads_area_manager_id_fkey(id, full_name, email), tenant_admin:agents!leads_tenant_admin_id_fkey(id, full_name, email), building:buildings!leads_building_id_fkey(id, building_name, slug), listing:mls_listings!leads_listing_id_fkey(id, unparsed_address), area:treb_areas!leads_area_id_fkey(id, name, slug), municipality:municipalities!leads_municipality_id_fkey(id, name, slug), community:communities!leads_community_id_fkey(id, name, slug), neighbourhood:neighbourhoods!leads_neighbourhood_id_fkey(id, name, slug)'

const FAMILY_SELECT = '*, agents!leads_agent_id_fkey(id, full_name, email, cell_phone, profile_photo_url, brokerage_name, title)'

export default async function LeadWorkbenchPage({ params }: { params: { id: string } }) {
  const user = await resolveAdminHomesUser()
  if (!user) return notFound()

  const hostTenantId = await getCurrentTenantId()
  const seeAll = isCrossTenantView(user, hostTenantId)
  const scopedTenantId = getScopedTenantId(user, hostTenantId)

  // No tenant context for a tenant-scoped user -> nothing to show.
  if (!seeAll && !scopedTenantId) return notFound()

  const supabase = createServiceClient()

  const { data: anchorLead } = await supabase
    .from('leads')
    .select(ANCHOR_SELECT)
    .eq('id', params.id)
    .maybeSingle()

  if (!anchorLead) return notFound()

  // Cross-tenant gate: scoped user must match anchor's tenant.
  if (!seeAll && scopedTenantId && (anchorLead as any).tenant_id !== scopedTenantId) {
    return notFound()
  }

  // Permission gate.
  const decision = can(user.permissions, 'lead.read', {
    kind: 'lead',
    leadId: (anchorLead as any).id,
    tenantId: (anchorLead as any).tenant_id,
    agentId: (anchorLead as any).agent_id,
  })
  if (!decision.ok) return notFound()

  // leadFamily aggregation: all leads with same user_id within same tenant_id.
  // When anchor.user_id is null, family = [anchorLead] (single-event view).
  let leadFamily: any[] = [anchorLead]
  if ((anchorLead as any).user_id) {
    const { data: family } = await supabase
      .from('leads')
      .select(FAMILY_SELECT)
      .eq('user_id', (anchorLead as any).user_id)
      .eq('tenant_id', (anchorLead as any).tenant_id)
      .order('created_at', { ascending: false })
    if (family && family.length > 0) {
      leadFamily = family
    }
  }

  // W4c: User credit bundle (5-source) when user_id is present.
  // Null when anchorLead.user_id is null (anonymous lead) -- workbench
  // Credits tab renders an empty state in that case.
  let userCredit: any = null
  if ((anchorLead as any).user_id) {
    const u = (anchorLead as any).user_id
    const t = (anchorLead as any).tenant_id

    const [
      { data: userProfile },
      { data: sessions },
      { data: override },
      { data: tenant },
    ] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('id, full_name, phone, created_at, last_active_at, assigned_agent_id, looking_to')
        .eq('id', u)
        .maybeSingle(),
      supabase
        .from('chat_sessions')
        .select('user_id, message_count, buyer_plans_used, seller_plans_used, estimator_count, updated_at')
        .eq('user_id', u)
        .eq('tenant_id', t)
        .order('updated_at', { ascending: false })
        .limit(1),
      supabase
        .from('user_credit_overrides')
        .select('user_id, ai_chat_limit, buyer_plan_limit, seller_plan_limit, estimator_limit, note, granted_at, granted_by_tier, granted_by_agent_id')
        .eq('user_id', u)
        .eq('tenant_id', t)
        .maybeSingle(),
      supabase
        .from('tenants')
        .select('ai_free_messages, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap, plan_free_attempts, plan_auto_approve_limit, plan_manual_approve_limit, plan_hard_cap, seller_plan_free_attempts, seller_plan_auto_approve_limit, seller_plan_manual_approve_limit, seller_plan_hard_cap, estimator_free_attempts, estimator_auto_approve_attempts, estimator_manual_approve_attempts, estimator_hard_cap, plan_mode')
        .eq('id', t)
        .maybeSingle(),
    ])

    const session = (sessions as any[] | null)?.[0] || null

    let assignedAgent: any = null
    if ((userProfile as any)?.assigned_agent_id) {
      const { data: agentRow } = await supabase
        .from('agents')
        .select('id, full_name')
        .eq('id', (userProfile as any).assigned_agent_id)
        .maybeSingle()
      assignedAgent = agentRow
    }

    userCredit = {
      userProfile,
      usage: {
        chat:      session?.message_count    || 0,
        plans:     (session?.buyer_plans_used || 0) + (session?.seller_plans_used || 0),
        estimator: session?.estimator_count   || 0,
      },
      override,
      tenant,
      assignedAgent,
    }
  }

  // W4d: Activity feed (cumulative visitor + admin timeline across leadFamily)
  // Visitor activities keyed by contact_email; admin actions keyed by lead_id.
  // W4e: Email log (lead_email_recipients_log rows across leadFamily, lead_id-keyed).
  // All tenant_id-scoped to anchorLead.tenant_id (trusted source from cross-tenant gate).
  let activityFeed: any[] = []
  let emailLog: any[] = []
  let vipRequests: any[] = []
  let notes: any[] = []
  const familyEmails = Array.from(new Set(leadFamily.map((l: any) => l.contact_email).filter(Boolean))) as string[]
  const familyIds = leadFamily.map((l: any) => l.id) as string[]
  const tenantIdForActivity = (anchorLead as any).tenant_id
  if (tenantIdForActivity && (familyEmails.length > 0 || familyIds.length > 0)) {
    const [activitiesResult, actionsResult, emailLogResult, vipRequestsResult, notesResult] = await Promise.all([
      familyEmails.length > 0
        ? supabase
            .from('user_activities')
            .select('id, contact_email, agent_id, activity_type, activity_data, page_url, created_at')
            .in('contact_email', familyEmails)
            .eq('tenant_id', tenantIdForActivity)
            .order('created_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] as any[] }),
      familyIds.length > 0
        ? supabase
            .from('lead_admin_actions')
            .select('id, lead_id, actor_user_id, actor_agent_id, actor_role, action_type, target_field, before_value, after_value, notes, created_at')
            .in('lead_id', familyIds)
            .eq('tenant_id', tenantIdForActivity)
            .order('created_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] as any[] }),
      familyIds.length > 0
        ? supabase
            .from('lead_email_recipients_log')
            .select('id, lead_id, tenant_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key, resend_message_id, status, sent_at, delivered_at, bounced_at, created_at')
            .in('lead_id', familyIds)
            .eq('tenant_id', tenantIdForActivity)
            .order('created_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] as any[] }),
      familyIds.length > 0
        ? supabase
            .from('vip_requests')
            .select('id, lead_id, tenant_id, agent_id, session_id, status, request_type, request_source, phone, full_name, email, budget_range, timeline, buyer_type, requirements, approval_token, page_url, building_name, messages_granted, created_at, responded_at, expires_at')
            .in('lead_id', familyIds)
            .eq('tenant_id', tenantIdForActivity)
            .order('created_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] as any[] }),
      familyIds.length > 0
        ? supabase
            .from('lead_notes')
            .select('id, lead_id, agent_id, note, created_at, updated_at, agents(id, full_name)')
            .in('lead_id', familyIds)
            .order('created_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const visitorRows = ((activitiesResult.data as any[]) || []).map((r: any) => ({ ...r, kind: 'visitor' }))
    const adminRows = ((actionsResult.data as any[]) || []).map((r: any) => ({ ...r, kind: 'admin' }))
    activityFeed = [...visitorRows, ...adminRows].sort((a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    emailLog = (emailLogResult.data as any[]) || []
    vipRequests = (vipRequestsResult.data as any[]) || []
    notes = (notesResult.data as any[]) || []
  }

  return (
    <LeadWorkbenchClient
      anchorLead={anchorLead}
      leadFamily={leadFamily}
      currentRole={user.role || 'admin'}
      currentAgentId={user.agentId || null}
      userCredit={userCredit}
      adminUser={{
        agentId: user.agentId || null,
        role: user.role || null,
        isPlatformAdmin: user.isPlatformAdmin === true,
        tenantId: user.tenantId || null,
      }}
      activityFeed={activityFeed}
      emailLog={emailLog}
      vipRequests={vipRequests}
      notes={notes}
    />
  )
}
