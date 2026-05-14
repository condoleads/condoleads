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
//     F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE logged for W5c evaluation.

import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'
import { can } from '@/lib/admin-homes/permissions'
import { getScopedTenantId, isCrossTenantView } from '@/lib/admin-homes/scope'
import LeadWorkbenchClient from './LeadWorkbenchClient'

export const metadata = { title: 'Lead Workbench — Admin' }

const ANCHOR_SELECT = '*, agents!leads_agent_id_fkey(id, full_name, email, cell_phone, profile_photo_url, brokerage_name, title), manager:agents!leads_manager_id_fkey(id, full_name, email), area_manager:agents!leads_area_manager_id_fkey(id, full_name, email), tenant_admin:agents!leads_tenant_admin_id_fkey(id, full_name, email)'

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

  return (
    <LeadWorkbenchClient
      anchorLead={anchorLead}
      leadFamily={leadFamily}
      currentRole={user.role || 'admin'}
      currentAgentId={user.agentId || null}
    />
  )
}
