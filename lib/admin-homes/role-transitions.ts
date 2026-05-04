// lib/admin-homes/role-transitions.ts
//
// W-ROLES-DELEGATION/R4.1 — TypeScript wrappers for role transition RPCs.
//
// Five functions, one per atomic operation. Each follows the same pattern:
//   1. Pre-flight: app-layer can() check using the actor's permissions context
//      (R3.1). Rejects fast with 403 if the matrix forbids the action.
//   2. RPC invocation: calls the SECURITY DEFINER Postgres function (R4.0).
//      DB layer enforces invariants (cardinality, no-cycle, no-orphan, etc.).
//   3. Error mapping: parses INVARIANT_* prefix on RPC error, returns 400 with
//      the structured reason. Unknown errors surface as 500.
//
// PRINCIPAL INPUT:
//   All functions take an AdminHomesUser. The actor agentId passed to RPCs
//   comes from user.permissions.agentId. If null (synthetic platform admin
//   with no agents row) the function rejects: per R4.1 design Q1=A,
//   platform admins must act via tenant override (getAdminTenantContext)
//   which gives them an effective agentId.
//
// PROMOTE VS DEMOTE:
//   Per R4.1 Q2=A, promote and demote are separate exported functions, each
//   checks its own can() action. Caller picks based on whether new tier is
//   higher or lower than current.

import { createClient } from '@supabase/supabase-js'
import type { AdminHomesUser } from '@/lib/admin-homes/auth'
import { can } from '@/lib/admin-homes/permissions'
import type { DbRole, TargetSpec } from '@/lib/admin-homes/permissions'

// ─────────────────────────────────────────────────────────────────────────────
// Service-role client (RPCs are SECURITY DEFINER + service_role-grant-only).
// Only invoked from server actions / API routes after auth check.
// ─────────────────────────────────────────────────────────────────────────────

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

export type TransitionResult<TPayload = Record<string, unknown>> =
  | { ok: true; payload: TPayload }
  | { ok: false; status: 401 | 403 | 400 | 404 | 500; reason: string; invariant?: string }

interface AgentMinimal {
  id: string
  tenant_id: string
  parent_id: string | null
  role: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function fail(status: 401 | 403 | 400 | 404 | 500, reason: string, invariant?: string): TransitionResult {
  return { ok: false, status, reason, invariant }
}

/**
 * Resolves the actor agentId to pass to RPCs.
 * Per Q1=A: platform actors without an agents row are rejected here.
 * They must act via tenant override (getAdminTenantContext sets their
 * effective tenant context, which gives auth.ts a path to populate agentId).
 */
function resolveActorAgentId(user: AdminHomesUser): string | null {
  return user.permissions.agentId
}

/**
 * Parses the INVARIANT_<NAME>: <details> prefix from a Postgres error message.
 * Returns the invariant name + the details text, or null if unstructured.
 */
function parseInvariant(message: string): { name: string; details: string } | null {
  const m = message.match(/^INVARIANT_([A-Z_]+):\s*(.*)$/)
  if (!m) return null
  return { name: m[1], details: m[2] }
}

/**
 * Loads minimal agent fields needed to build a TargetSpec for can().
 * Returns null if the agent doesn't exist.
 */
async function loadTargetAgent(targetAgentId: string): Promise<AgentMinimal | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('agents')
    .select('id, tenant_id, parent_id, role')
    .eq('id', targetAgentId)
    .maybeSingle()
  if (error || !data) return null
  return data as AgentMinimal
}

function isValidDbRole(s: string): s is DbRole {
  return s === 'agent' || s === 'manager' || s === 'area_manager' || s === 'tenant_admin' || s === 'admin'
}

function buildAgentTarget(agent: AgentMinimal): TargetSpec {
  // If agent.role is somehow not a known DbRole, default to 'agent' for the
  // permission check; the RPC will reject any malformed downstream operation.
  const roleDb: DbRole = isValidDbRole(agent.role) ? agent.role : 'agent'
  return {
    kind: 'agent',
    agentId: agent.id,
    tenantId: agent.tenant_id,
    parentId: agent.parent_id,
    roleDb,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// promoteAgent
// ─────────────────────────────────────────────────────────────────────────────

export async function promoteAgent(
  user: AdminHomesUser,
  targetAgentId: string,
  newRole: DbRole,
  reason?: string
): Promise<TransitionResult<{ agent_id: string; from_role: string; to_role: string }>> {
  const actorAgentId = resolveActorAgentId(user)
  if (!actorAgentId) {
    return fail(403, 'Platform actors must act via tenant override before invoking transitions') as TransitionResult<never>
  }

  const target = await loadTargetAgent(targetAgentId)
  if (!target) {
    return fail(404, `Agent ${targetAgentId} not found`) as TransitionResult<never>
  }

  // App-layer permission check
  const decision = can(user.permissions, 'agent.promote', buildAgentTarget(target))
  if (!decision.ok) {
    return fail(decision.status, decision.reason) as TransitionResult<never>
  }

  // RPC call — DB enforces invariants atomically
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_promote_agent', {
    p_actor_id: actorAgentId,
    p_target_id: targetAgentId,
    p_new_role: newRole,
    p_reason: reason ?? null,
  })

  if (error) {
    const inv = parseInvariant(error.message)
    if (inv) return fail(400, inv.details, inv.name) as TransitionResult<never>
    return fail(500, error.message) as TransitionResult<never>
  }

  return { ok: true, payload: data as { agent_id: string; from_role: string; to_role: string } }
}

// ─────────────────────────────────────────────────────────────────────────────
// demoteAgent
// ─────────────────────────────────────────────────────────────────────────────

export async function demoteAgent(
  user: AdminHomesUser,
  targetAgentId: string,
  newRole: DbRole,
  reason?: string
): Promise<TransitionResult<{ agent_id: string; from_role: string; to_role: string }>> {
  const actorAgentId = resolveActorAgentId(user)
  if (!actorAgentId) {
    return fail(403, 'Platform actors must act via tenant override before invoking transitions') as TransitionResult<never>
  }

  const target = await loadTargetAgent(targetAgentId)
  if (!target) {
    return fail(404, `Agent ${targetAgentId} not found`) as TransitionResult<never>
  }

  const decision = can(user.permissions, 'agent.demote', buildAgentTarget(target))
  if (!decision.ok) {
    return fail(decision.status, decision.reason) as TransitionResult<never>
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_demote_agent', {
    p_actor_id: actorAgentId,
    p_target_id: targetAgentId,
    p_new_role: newRole,
    p_reason: reason ?? null,
  })

  if (error) {
    const inv = parseInvariant(error.message)
    if (inv) return fail(400, inv.details, inv.name) as TransitionResult<never>
    return fail(500, error.message) as TransitionResult<never>
  }

  return { ok: true, payload: data as { agent_id: string; from_role: string; to_role: string } }
}

// ─────────────────────────────────────────────────────────────────────────────
// reassignParent
// ─────────────────────────────────────────────────────────────────────────────

export async function reassignParent(
  user: AdminHomesUser,
  targetAgentId: string,
  newParentId: string | null,  // null = move to top of tenant (no parent)
  reason?: string
): Promise<TransitionResult<{ agent_id: string; from_parent_id: string | null; to_parent_id: string | null }>> {
  const actorAgentId = resolveActorAgentId(user)
  if (!actorAgentId) {
    return fail(403, 'Platform actors must act via tenant override before invoking transitions') as TransitionResult<never>
  }

  const target = await loadTargetAgent(targetAgentId)
  if (!target) {
    return fail(404, `Agent ${targetAgentId} not found`) as TransitionResult<never>
  }

  const decision = can(user.permissions, 'agent.reassignParent', buildAgentTarget(target))
  if (!decision.ok) {
    return fail(decision.status, decision.reason) as TransitionResult<never>
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_reassign_parent', {
    p_actor_id: actorAgentId,
    p_target_id: targetAgentId,
    p_new_parent_id: newParentId,
    p_reason: reason ?? null,
  })

  if (error) {
    const inv = parseInvariant(error.message)
    if (inv) return fail(400, inv.details, inv.name) as TransitionResult<never>
    return fail(500, error.message) as TransitionResult<never>
  }

  return { ok: true, payload: data as { agent_id: string; from_parent_id: string | null; to_parent_id: string | null } }
}

// ─────────────────────────────────────────────────────────────────────────────
// grantDelegation
// ─────────────────────────────────────────────────────────────────────────────

export async function grantDelegation(
  user: AdminHomesUser,
  delegatorId: string,    // whose authority is being delegated
  delegateId: string,     // to whom
  notes?: string
): Promise<TransitionResult<{ delegation_id: string; delegator_id: string; delegate_id: string }>> {
  const actorAgentId = resolveActorAgentId(user)
  if (!actorAgentId) {
    return fail(403, 'Platform actors must act via tenant override before invoking transitions') as TransitionResult<never>
  }

  // Need delegator's tenant for the can() target spec
  const delegator = await loadTargetAgent(delegatorId)
  if (!delegator) {
    return fail(404, `Delegator ${delegatorId} not found`) as TransitionResult<never>
  }

  const target: TargetSpec = {
    kind: 'delegation',
    delegatorId,
    delegateId,
    tenantId: delegator.tenant_id,
  }

  const decision = can(user.permissions, 'delegation.grant', target)
  if (!decision.ok) {
    return fail(decision.status, decision.reason) as TransitionResult<never>
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_grant_delegation', {
    p_actor_id: actorAgentId,
    p_delegator_id: delegatorId,
    p_delegate_id: delegateId,
    p_notes: notes ?? null,
  })

  if (error) {
    const inv = parseInvariant(error.message)
    if (inv) return fail(400, inv.details, inv.name) as TransitionResult<never>
    // No-cycle and no-SOS triggers raise plain RAISE EXCEPTION (not INVARIANT_*).
    // Map known trigger messages to 400.
    if (error.message.startsWith('Delegation cycle') || error.message.startsWith('Transitive delegation cycle')) {
      return fail(400, error.message, 'CYCLE') as TransitionResult<never>
    }
    if (error.message.startsWith('No support-of-support')) {
      return fail(400, error.message, 'NO_SOS') as TransitionResult<never>
    }
    return fail(500, error.message) as TransitionResult<never>
  }

  return { ok: true, payload: data as { delegation_id: string; delegator_id: string; delegate_id: string } }
}

// ─────────────────────────────────────────────────────────────────────────────
// revokeDelegation
// ─────────────────────────────────────────────────────────────────────────────

export async function revokeDelegation(
  user: AdminHomesUser,
  delegationId: string,
  reason?: string
): Promise<TransitionResult<{ delegation_id: string; revoked_at: string }>> {
  const actorAgentId = resolveActorAgentId(user)
  if (!actorAgentId) {
    return fail(403, 'Platform actors must act via tenant override before invoking transitions') as TransitionResult<never>
  }

  // Load the delegation to build a TargetSpec
  const supabase = createServiceClient()
  const { data: row, error: rowErr } = await supabase
    .from('agent_delegations')
    .select('id, delegator_id, delegate_id, tenant_id, revoked_at')
    .eq('id', delegationId)
    .maybeSingle()

  if (rowErr || !row) {
    return fail(404, `Delegation ${delegationId} not found`) as TransitionResult<never>
  }
  if (row.revoked_at) {
    return fail(400, `Delegation ${delegationId} was already revoked`, 'ALREADY_REVOKED') as TransitionResult<never>
  }

  const target: TargetSpec = {
    kind: 'delegation',
    delegatorId: row.delegator_id,
    delegateId: row.delegate_id,
    tenantId: row.tenant_id,
  }

  const decision = can(user.permissions, 'delegation.revoke', target)
  if (!decision.ok) {
    return fail(decision.status, decision.reason) as TransitionResult<never>
  }

  const { data, error } = await supabase.rpc('rpc_revoke_delegation', {
    p_actor_id: actorAgentId,
    p_delegation_id: delegationId,
    p_reason: reason ?? null,
  })

  if (error) {
    const inv = parseInvariant(error.message)
    if (inv) return fail(400, inv.details, inv.name) as TransitionResult<never>
    return fail(500, error.message) as TransitionResult<never>
  }

  return { ok: true, payload: data as { delegation_id: string; revoked_at: string } }
}