// lib/admin-homes/lead-email-recipients.ts
// W-HIERARCHY H3.3 — single source of truth for lead email fan-out recipients.
//
// Returns the 6-layer recipient chain for any lead-triggering email:
//   Layer 1: assigned agent              -> TO
//   Layer 2: manager (walker)            -> CC
//   Layer 3: area_manager (walker)       -> BCC
//   Layer 4: tenant_admin (walker)       -> BCC
//   Layer 5: Manager Platform (per tenant assignment) -> BCC
//   Layer 6: Admin Platform              -> BCC (UNCONDITIONAL — F40/F59/F65 lesson)
//
// Layer 6 is unconditional. If for any reason Layer 6 cannot resolve, this throws.
// Better to alarm loudly than silently lose admin BCC.
//
// Layer 1 fallback: if agentId is null, agent layer is empty and Admin Platform
// is promoted to TO so the email is never address-less.
//
// Delegation overlay (Support / Supervisor / Assistant) will be added by
// W-ROLES-DELEGATION sister tracker as additive extension — same return shape,
// just more BCC entries when active delegations exist for any layer's principal.

import type { SupabaseClient } from '@supabase/supabase-js'
import { walkHierarchy } from '@/lib/admin-homes/hierarchy'

// Re-export the email send helper's error types so consuming routes have one import surface.
export {
  sendTenantEmail,
  TenantEmailNotConfigured,
  TenantEmailFailed,
} from '@/lib/email/sendTenantEmail'
export type {
  SendTenantEmailParams,
  SendTenantEmailResult,
} from '@/lib/email/sendTenantEmail'

export interface LeadEmailRecipients {
  to: string[]
  cc: string[]
  bcc: string[]
  /** Diagnostic: which layers were resolved, for logging/debugging. */
  resolved: {
    agent: string | null
    manager: string | null
    area_manager: string | null
    tenant_admin: string | null
    manager_platforms: string[]
    admin_platforms: string[]
    /** W-ROLES-DELEGATION R7 — active delegates of each layer-1–4 principal. */
    agent_delegates: string[]
    manager_delegates: string[]
    area_manager_delegates: string[]
    tenant_admin_delegates: string[]
  }
}

export class AdminPlatformUnreachable extends Error {
  constructor(detail: string) {
    super(`Admin Platform layer-6 BCC could not be resolved — ${detail}. This is a system alarm.`)
    this.name = 'AdminPlatformUnreachable'
  }
}

interface AgentEmailRow {
  id: string
  email: string | null
  notification_email: string | null
}

/**
 * Resolve the 6-layer recipient chain for a lead email.
 *
 * @param tenantId - The tenant the lead belongs to. Required.
 * @param agentId  - The assigned agent. Pass null when no agent is resolved
 *                   (in that case Admin Platform is promoted to TO).
 * @param supabase - A Supabase service-role client.
 *
 * @throws AdminPlatformUnreachable if no active Admin Platform with email exists.
 *         Layer 6 is unconditional; the system fails closed rather than dropping it.
 */
export async function getLeadEmailRecipients(
  tenantId: string,
  agentId: string | null,
  supabase: SupabaseClient
): Promise<LeadEmailRecipients> {
  const resolved: LeadEmailRecipients['resolved'] = {
    agent: null,
    manager: null,
    area_manager: null,
    tenant_admin: null,
    manager_platforms: [],
    admin_platforms: [],
    agent_delegates: [],
    manager_delegates: [],
    area_manager_delegates: [],
    tenant_admin_delegates: [],
  }

  let agentEmail: string | null = null
  let managerEmail: string | null = null
  let areaManagerEmail: string | null = null
  let tenantAdminEmail: string | null = null

  // ─── Layer 1: assigned agent ─────────────────────────────────────────────
  if (agentId) {
    const { data } = await supabase
      .from('agents')
      .select('id, email, notification_email')
      .eq('id', agentId)
      .maybeSingle()
    const row = data as AgentEmailRow | null
    if (row) {
      agentEmail = row.notification_email || row.email || null
      resolved.agent = agentEmail
    }
  }

  // ─── Layers 2–4: walker (manager / area_manager / tenant_admin) ──────────
  // R7: walker hoisted to outer scope so the delegation overlay block below
  // can reuse the chain without a second walkHierarchy round-trip.
  const chain = agentId ? await walkHierarchy(agentId, supabase) : null
  if (chain) {
    // Resolve emails for any walker-classified ancestor in one query
    const idsToResolve = [
      chain.manager_id,
      chain.area_manager_id,
      chain.tenant_admin_id,
    ].filter((x): x is string => !!x)

    if (idsToResolve.length > 0) {
      const { data } = await supabase
        .from('agents')
        .select('id, email, notification_email')
        .in('id', idsToResolve)
      const rows = (data || []) as AgentEmailRow[]
      const byId = new Map(rows.map(r => [r.id, r.notification_email || r.email || null]))

      if (chain.manager_id) {
        managerEmail = byId.get(chain.manager_id) || null
        resolved.manager = managerEmail
      }
      if (chain.area_manager_id) {
        areaManagerEmail = byId.get(chain.area_manager_id) || null
        resolved.area_manager = areaManagerEmail
      }
      if (chain.tenant_admin_id) {
        tenantAdminEmail = byId.get(chain.tenant_admin_id) || null
        resolved.tenant_admin = tenantAdminEmail
      }
    }
  }

  // ─── Layers 1–4 delegation overlay (W-ROLES-DELEGATION R7) ──────────
  // For each populated principal at layers 1–4, fetch active delegates and add
  // their notification_email to BCC. Single batched query; in-memory map keyed
  // by delegator. Layers 5–6 are platform_admins (different table); their
  // delegation overlay would require a parallel mechanism — out of R7 scope.
  const principalAgentIds: string[] = [
    agentId,
    chain?.manager_id ?? null,
    chain?.area_manager_id ?? null,
    chain?.tenant_admin_id ?? null,
  ].filter((x): x is string => !!x)

  const delegateEmailsByDelegator = new Map<string, string[]>()
  if (principalAgentIds.length > 0) {
    const { data: delegationRows } = await supabase
      .from('agent_delegations')
      .select('delegator_id, delegate_id')
      .in('delegator_id', principalAgentIds)
      .eq('tenant_id', tenantId)
      .is('revoked_at', null)

    const delegateIds = (delegationRows || [])
      .map(r => (r as { delegator_id: string; delegate_id: string }).delegate_id)

    if (delegateIds.length > 0) {
      const { data: delegateAgentRows } = await supabase
        .from('agents')
        .select('id, email, notification_email')
        .in('id', delegateIds)

      const emailByDelegateId = new Map<string, string | null>()
      for (const r of (delegateAgentRows || []) as AgentEmailRow[]) {
        emailByDelegateId.set(r.id, r.notification_email || r.email || null)
      }

      for (const d of (delegationRows || []) as Array<{ delegator_id: string; delegate_id: string }>) {
        const email = emailByDelegateId.get(d.delegate_id)
        if (email) {
          const arr = delegateEmailsByDelegator.get(d.delegator_id) || []
          arr.push(email)
          delegateEmailsByDelegator.set(d.delegator_id, arr)
        }
      }

      // Populate diagnostic resolved.* fields
      if (agentId) resolved.agent_delegates = delegateEmailsByDelegator.get(agentId) || []
      if (chain?.manager_id) resolved.manager_delegates = delegateEmailsByDelegator.get(chain.manager_id) || []
      if (chain?.area_manager_id) resolved.area_manager_delegates = delegateEmailsByDelegator.get(chain.area_manager_id) || []
      if (chain?.tenant_admin_id) resolved.tenant_admin_delegates = delegateEmailsByDelegator.get(chain.tenant_admin_id) || []
    }
  }

  // ─── Layer 5: Manager Platforms assigned to this tenant ──────────────────
  // Two-step query (cleaner than nested-join type inference):
  //   1. Find platform_admin_ids assigned to this tenant
  //   2. Read those rows from platform_admins, filter active + tier='manager'
  const { data: assignmentRows } = await supabase
    .from('platform_manager_tenants')
    .select('platform_admin_id')
    .eq('tenant_id', tenantId)

  const assignedAdminIds = (assignmentRows || []).map(r => (r as { platform_admin_id: string }).platform_admin_id)
  const managerPlatformEmails: string[] = []

  if (assignedAdminIds.length > 0) {
    const { data: managerPlatformRows } = await supabase
      .from('platform_admins')
      .select('id, email, is_active, tier')
      .in('id', assignedAdminIds)
      .eq('tier', 'manager')
      .eq('is_active', true)

    for (const row of (managerPlatformRows || []) as Array<{ id: string; email: string | null; is_active: boolean; tier: string }>) {
      if (row.email) {
        managerPlatformEmails.push(row.email)
        resolved.manager_platforms.push(row.email)
      }
    }
  }

  // ─── Layer 6: Admin Platform — UNCONDITIONAL ─────────────────────────────
  const { data: adminPlatformRows, error: adminError } = await supabase
    .from('platform_admins')
    .select('id, email, is_active, tier')
    .eq('tier', 'admin')
    .eq('is_active', true)

  if (adminError) {
    throw new AdminPlatformUnreachable(`db error: ${adminError.message}`)
  }
  const adminPlatformEmails: string[] = []
  for (const row of (adminPlatformRows || []) as Array<{ id: string; email: string | null; is_active: boolean; tier: string }>) {
    if (row.email) {
      adminPlatformEmails.push(row.email)
      resolved.admin_platforms.push(row.email)
    }
  }
  if (adminPlatformEmails.length === 0) {
    throw new AdminPlatformUnreachable('no active Admin Platform with email')
  }

  // ─── Assemble TO / CC / BCC ──────────────────────────────────────────────
  const to: string[] = []
  const cc: string[] = []
  const bcc: string[] = []

  // Layer 1 → TO. Fallback: if no agent, promote Admin Platform to TO (single recipient
  // to ensure the email is never address-less).
  if (agentEmail) {
    to.push(agentEmail)
  } else {
    // No agent assigned — surface Admin Platform as TO so the message is delivered.
    // Admin Platform is also still in BCC below; routes/inboxes can dedupe.
    to.push(adminPlatformEmails[0])
  }

  // Layer 2 → CC
  if (managerEmail) cc.push(managerEmail)

  // Layer 3 → BCC
  if (areaManagerEmail) bcc.push(areaManagerEmail)
  // Layer 4 → BCC
  if (tenantAdminEmail) bcc.push(tenantAdminEmail)
  // Layers 1–4 delegate overlay → BCC (W-ROLES-DELEGATION R7)
  for (const emails of delegateEmailsByDelegator.values()) {
    for (const e of emails) bcc.push(e)
  }
  // Layer 5 → BCC
  for (const e of managerPlatformEmails) bcc.push(e)
  // Layer 6 → BCC (unconditional)
  for (const e of adminPlatformEmails) bcc.push(e)

  // De-dupe each list (an email shouldn't appear twice in the same field)
  return {
    to: dedupe(to),
    cc: dedupe(cc),
    bcc: dedupe(bcc),
    resolved,
  }
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)))
}