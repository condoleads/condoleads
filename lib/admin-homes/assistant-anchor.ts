// lib/admin-homes/assistant-anchor.ts
// W-ASSISTANT-FLOW UNIT 19 — assistant scope inheritance via reports-to anchor.
//
// Operator-locked model (UNIT 19):
//   An assistant INHERITS the lead/email flow of whoever they report to.
//   The anchor is the FIRST NON-ASSISTANT ancestor walking UP the parent_id
//   chain. Cycles + missing/inactive anchors short-circuit to "no anchor".
//
//   Anchor classification → scope:
//     - top tier (tenant_admin owner OR tenants.default_agent_id)
//         → assistant sees EVERY lead in the tenant
//     - branch (manager / area_manager / agent)
//         → assistant sees ONLY leads whose assigned-agent chain passes
//           through the anchor (i.e. anchor IS the assigned agent, OR
//           anchor appears in the assigned agent's UP-chain ancestors)
//     - none (no parent, all-assistant chain, cycle, anchor inactive)
//         → assistant sees NOTHING (no copies)
//
// Why this resolver runs UP-walk only:
//   The branch-membership check inverts trivially via the LEAD's own
//   walkHierarchy chain (already computed by lead-email-recipients.ts). For
//   each assistant we resolve THEIR anchor, then test "anchor.id ∈
//   leadChain.ancestors OR anchor.id == agentId". Avoids an N×getDescendants
//   cost.

import type { SupabaseClient } from '@supabase/supabase-js'

// Cap at 10 hops — enough for any sane org depth; defends against cycles
// alongside the seen-set guard. (walkHierarchy uses 6 because it stops at
// tenant_admin; we walk past the first non-assistant so allow more headroom.)
const MAX_HOPS = 10

export interface AssistantAnchor {
  /** First non-assistant ancestor walking up; null when none found
   *  (no parent / all-assistant chain to root / cycle / missing row). */
  anchorId: string | null
  anchorRole: string | null
  /** True when the anchor is the tenant owner (role='tenant_admin' AND
   *  parent_id IS NULL) OR the tenants.default_agent_id (house account).
   *  Top-tier-anchored assistants see EVERY lead in the tenant. */
  isTopTier: boolean
  /** True when the resolved anchor exists but is inactive — assistant
   *  inherits nothing. Distinguishes "inactive anchor" from "no anchor". */
  anchorInactive: boolean
}

interface AgentHopRow {
  id: string
  role: string | null
  parent_id: string | null
  is_active: boolean | null
  tenant_id: string | null
}

/**
 * Walk UP from `assistantId`, skipping role='assistant' nodes, until the
 * first non-assistant ancestor (or null if none). Classify as top-tier if
 * the anchor is the tenant owner OR the tenant's house account.
 *
 * Tenant-scoped: the walk verifies every visited row's tenant_id matches
 * `tenantId`; cross-tenant parent_id (shouldn't happen but defensive)
 * terminates the walk with no-anchor.
 */
export async function resolveAssistantAnchor(
  assistantId: string,
  tenantId: string,
  supabase: SupabaseClient,
  houseAccountAgentId: string | null
): Promise<AssistantAnchor> {
  const out: AssistantAnchor = {
    anchorId: null,
    anchorRole: null,
    isTopTier: false,
    anchorInactive: false,
  }

  // Read the assistant itself to seed the walk.
  const { data: self } = await supabase
    .from('agents')
    .select('id, role, parent_id, is_active, tenant_id')
    .eq('id', assistantId)
    .maybeSingle()
  if (!self) return out
  const selfRow = self as AgentHopRow
  if (selfRow.tenant_id !== tenantId) return out

  let cursor: string | null = selfRow.parent_id
  const seen = new Set<string>([assistantId])

  for (let hop = 0; hop < MAX_HOPS && cursor; hop++) {
    if (seen.has(cursor)) return out  // cycle -> no anchor
    seen.add(cursor)

    const { data: row } = await supabase
      .from('agents')
      .select('id, role, parent_id, is_active, tenant_id')
      .eq('id', cursor)
      .maybeSingle()
    if (!row) return out
    const r = row as AgentHopRow

    // Defensive multi-tenant guard: parent_id pointing cross-tenant -> no anchor.
    if (r.tenant_id !== tenantId) return out

    const role = r.role || 'agent'
    if (role === 'assistant') {
      // Skip — keep walking up the chain.
      cursor = r.parent_id
      continue
    }

    // First non-assistant ancestor: this is the anchor.
    out.anchorId = r.id
    out.anchorRole = role
    if (r.is_active === false) {
      out.anchorInactive = true
      return out  // inactive anchor -> assistant inherits nothing
    }

    // Top-tier classification:
    //   - tenant owner: role='tenant_admin' AND parent_id IS NULL
    //   - house account: r.id === tenants.default_agent_id
    //   (Today these coincide for Aily/WALLiam, but classify each path
    //   independently to stay forward-compat for tenants where they differ.)
    const isTenantOwner = role === 'tenant_admin' && r.parent_id === null
    const isHouseAccount = houseAccountAgentId !== null && r.id === houseAccountAgentId
    out.isTopTier = isTenantOwner || isHouseAccount
    return out
  }

  // Walked off the top (cursor became null) without hitting a non-assistant
  // OR hit MAX_HOPS without resolving. No anchor.
  return out
}

/**
 * W-TENANT-ASSISTANT UNIT 25 — viewer-side gate helper.
 *
 * Answers: "Should this VIEWER (when they are a position='assistant')
 * count as a top-tier (tenant-wide-admin) assistant?"
 *
 * One source of truth for the assistant-admin-rights distinction:
 * reuses resolveAssistantAnchor (the same predicate that scopes lead
 * flow in Unit 19). An assistant viewer is top-tier iff their own
 * reports-to chain anchors at the tenant owner or the house account
 * (possibly through other assistants — the up-walk skips assistant
 * nodes).
 *
 * Returns false (no admin rights) for:
 *   - non-assistant viewers (caller should branch separately for
 *     tenant_admin / platform_admin / DB role='admin' BEFORE calling this)
 *   - assistants with no agentId / no tenantId (defensive)
 *   - assistants whose anchor is branch-tier (manager / area_manager /
 *     agent) — gap closed
 *   - assistants with no anchor / cycle / inactive anchor — gap closed
 *
 * Tenant-scoped via the underlying resolveAssistantAnchor walk.
 *
 * Cost: one tenants SELECT (default_agent_id) + the up-walk (<=10 row
 * reads). Only paid for position='assistant' viewers — branches
 * short-circuit before any DB call.
 */
export async function viewerIsTopTierAssistant(
  user: { agentId: string | null; tenantId: string | null; position: string },
  supabase: SupabaseClient
): Promise<boolean> {
  if (user.position !== 'assistant') return false
  if (!user.agentId || !user.tenantId) return false

  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('default_agent_id')
    .eq('id', user.tenantId)
    .maybeSingle()
  const houseAccountAgentId =
    (tenantRow as { default_agent_id: string | null } | null)?.default_agent_id ?? null

  const anchor = await resolveAssistantAnchor(
    user.agentId,
    user.tenantId,
    supabase,
    houseAccountAgentId
  )
  return anchor.isTopTier
}

/**
 * Test whether an assistant with the given anchor inherits a specific lead.
 *
 * @param anchor              resolved via resolveAssistantAnchor
 * @param leadAssignedAgentId the lead's assigned agent (null when no agent)
 * @param leadChainAncestorIds the assigned agent's UP-chain ancestor ids
 *                             (already computed by lead-email-recipients.ts
 *                             via walkHierarchy; pass [] when chain is null)
 *
 * Top-tier-anchored assistants inherit EVERY lead in the tenant — they
 * see agent-less leads too (leadAssignedAgentId may be null).
 *
 * Branch-anchored assistants inherit ONLY when the anchor appears in the
 * lead's chain (either as the assigned agent itself, or as one of the
 * agent's ancestors).
 *
 * No-anchor / inactive-anchor assistants never inherit.
 */
export function assistantInheritsLead(
  anchor: AssistantAnchor,
  leadAssignedAgentId: string | null,
  leadChainAncestorIds: string[]
): boolean {
  if (anchor.anchorInactive) return false
  if (anchor.anchorId === null) return false
  if (anchor.isTopTier) return true
  if (leadAssignedAgentId && anchor.anchorId === leadAssignedAgentId) return true
  if (leadChainAncestorIds.includes(anchor.anchorId)) return true
  return false
}
