// lib/admin-homes/permissions.ts
//
// W-ROLES-DELEGATION/R3.1 — pure permission decision function.
//
// Single source of truth for who-can-do-what across admin-homes.
// Replaces the 14 ad-hoc enforcement branches in lib/admin-homes/api-auth.ts.
//
// PURE FUNCTION CONTRACT
//   - No I/O. No DB queries. No async. No throws.
//   - Caller passes a pre-fetched ActorPermissionContext.
//   - R3.2 extends resolveAdminHomesUser() to populate that context in one
//     auth-time roundtrip (own role + active delegations + managed subtree).
//
// MULTITENANT CONTRACT (Rule Zero #1)
//   - Every decision factors tenant_id.
//   - No hardcoded tenant references. No 'walliam' literals.
//   - No per-tenant if/else branches. Same code, every tenant.
//
// BRANCH COVERAGE — every branch in api-auth.ts maps to a cell here.
//   B1   not logged in                              → 401 by route handler before can() (or UNAUTHORIZED below)
//   B2   not platform admin                         → can(*, 'platform.write', ...) blocks non-Mgr/Admin Platform
//   B4   tenantId mismatch                          → cross-tenant gate in evaluateTenantScoped
//   B5   role not in allowedRoles[]                 → folded into per-action cells (no generic role gate)
//   B6   agent target site_type !== 'comprehensive' → 404 by route handler before can() (System 1 isolation)
//   B7   B4 for agent target                        → folded
//   B8   write + role='agent'                       → 'agent.write' denies tier 1
//   B9   write + role='manager' + outside scope     → 'agent.write' for manager checks managedAgentIds
//   B10  requireAdmin + role !== 'admin'            → 'agent.adminMutate' requires tenant_admin tier
//   B11  lead missing                               → 404 by route handler before can()
//   B12  B4 for lead target                         → folded
//   B13  manager + lead.agent_id outside scope      → 'lead.read'/'lead.write' for manager
//   B14  agent + lead.agent_id !== self             → 'lead.read'/'lead.write' for agent
//
// PRINCIPAL LADDER (locked spec)
//   Tier 1: Agent             — agents.role = 'agent'
//   Tier 2: Manager           — agents.role = 'manager'
//   Tier 3: Area Manager      — agents.role = 'area_manager'
//   Tier 4: Tenant Admin      — agents.role IN ('tenant_admin', 'admin')
//   Tier 5: Manager Platform  — platform_admins.tier = 'manager'
//   Tier 6: Admin Platform    — platform_admins.tier = 'admin' (cardinality 1)
//
// DELEGATION OVERLAY (universal, join-table — agent_delegations)
//   For every action EXCEPT 'delegation.grant', any active delegator's
//   authority counts as the actor's. 'delegation.grant' considers only the
//   actor's OWN authority (no support-of-support — defence-in-depth alongside
//   the DB $sos$ trigger from R2.2).
//
// SELF-PROTECTION
//   - 'agent.promote' / 'agent.demote' / 'agent.reassignParent' on self → 403.
//   - Cardinality invariants (sole tenant_admin, sole admin) live in R4
//     transition state machine. can() answers "is this MOVE allowed by
//     your authority", not "would the resulting STATE be valid".
//
// AREA MANAGER SUBTREE NOTE
//   p.managedAgentIds is direct children for managers, FULL SUBTREE for
//   area_managers. R3.2 owns populating this correctly.

// ─────────────────────────────────────────────────────────────────────────────
// Type surface (exported)
// ─────────────────────────────────────────────────────────────────────────────

export type DbRole = 'agent' | 'manager' | 'area_manager' | 'tenant_admin' | 'admin'

export type PlatformTier = 'admin' | 'manager'

export type PermAction =
  | 'agent.read'
  | 'agent.write'
  | 'agent.promote'
  | 'agent.demote'
  | 'agent.reassignParent'
  | 'agent.adminMutate'
  | 'lead.read'
  | 'lead.write'
  | 'tenant.read'
  | 'tenant.write'
  | 'delegation.grant'
  | 'delegation.revoke'
  | 'platform.read'
  | 'platform.write'

export type TargetSpec =
  | { kind: 'agent'; agentId: string; tenantId: string; parentId: string | null; roleDb: DbRole }
  | { kind: 'lead'; leadId: string; tenantId: string; agentId: string | null }
  | { kind: 'tenant'; tenantId: string }
  | { kind: 'delegation'; delegatorId: string; delegateId: string; tenantId: string }
  | { kind: 'platform' }

export interface DelegatorRef {
  delegatorId: string
  delegatorRoleDb: DbRole
  delegatorTenantId: string
  // Direct children for managers; full subtree for area_managers.
  delegatorManagedAgentIds: string[]
}

export interface ActorPermissionContext {
  // Null when caller is a pure platform admin with no agents row.
  agentId: string | null
  tenantId: string | null
  roleDb: DbRole | null
  platformTier: PlatformTier | null
  // Direct children for managers; full subtree for area_managers.
  managedAgentIds: string[]
  activeDelegators: DelegatorRef[]
}

export type CanResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; reason: string }

// ─────────────────────────────────────────────────────────────────────────────
// Internal: canned results (immutable)
// ─────────────────────────────────────────────────────────────────────────────

const OK: CanResult = { ok: true }
const UNAUTHORIZED: CanResult = { ok: false, status: 401, reason: 'Unauthorized' }
const FORBIDDEN_CROSS_TENANT: CanResult = { ok: false, status: 403, reason: 'Forbidden — cross-tenant access blocked' }
const FORBIDDEN_SCOPE: CanResult = { ok: false, status: 403, reason: 'Forbidden — outside scope' }
const FORBIDDEN_ROLE: CanResult = { ok: false, status: 403, reason: 'Forbidden — role not permitted' }
const FORBIDDEN_SELF: CanResult = { ok: false, status: 403, reason: 'Forbidden — cannot perform this action on self' }
const FORBIDDEN_PLATFORM: CanResult = { ok: false, status: 403, reason: 'Forbidden — platform admin only' }
const FORBIDDEN_NOT_YOUR_LEAD: CanResult = { ok: false, status: 403, reason: 'Forbidden — not your lead' }
const FORBIDDEN_SOS: CanResult = { ok: false, status: 403, reason: 'Forbidden — delegates cannot grant further delegations' }

// Tier 4 (tenant admin) accepts both 'tenant_admin' and 'admin' DB values.
// Legacy: agents.role='admin' was used pre-R2 for the tenant-admin-equivalent
// role. R2.1 CHECK keeps 'admin' valid; can() treats both equivalently.
function isTenantAdminTier(role: DbRole | null): boolean {
  return role === 'tenant_admin' || role === 'admin'
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

export function can(
  actor: ActorPermissionContext,
  action: PermAction,
  target: TargetSpec
): CanResult {
  // Auth gate — must have at least an agent row OR a platform_admins row.
  if (!actor.agentId && !actor.platformTier) {
    return UNAUTHORIZED
  }

  // Self-protection: role/parent changes on the actor's own agent row are
  // always blocked, regardless of authority source. Applies before delegation
  // overlay so it cannot be bypassed via delegation.
  if (
    target.kind === 'agent' &&
    actor.agentId !== null &&
    target.agentId === actor.agentId &&
    (action === 'agent.promote' ||
      action === 'agent.demote' ||
      action === 'agent.reassignParent')
  ) {
    return FORBIDDEN_SELF
  }

  // Defence-in-depth: 'delegation.grant' requires the actor to hold their own
  // authority. Pure delegates (no own role/tier) cannot grant. DB layer also
  // enforces this via the $sos$ trigger from R2.2.
  if (action === 'delegation.grant' && !actor.roleDb && !actor.platformTier) {
    return FORBIDDEN_SOS
  }

  // Build effective principal list: actor's own authority + active delegators'
  // authority. For 'delegation.grant', exclude delegators (no SOS).
  const principals: EffectivePrincipal[] = [
    {
      agentId: actor.agentId,
      tenantId: actor.tenantId,
      roleDb: actor.roleDb,
      platformTier: actor.platformTier,
      managedAgentIds: actor.managedAgentIds,
      isDelegate: false,
    },
    ...actor.activeDelegators.map<EffectivePrincipal>((d) => ({
      agentId: d.delegatorId,
      tenantId: d.delegatorTenantId,
      roleDb: d.delegatorRoleDb,
      platformTier: null,
      managedAgentIds: d.delegatorManagedAgentIds,
      isDelegate: true,
    })),
  ]

  const candidates = action === 'delegation.grant'
    ? principals.filter((p) => !p.isDelegate)
    : principals

  // First permitting principal wins. If none permit, return last denial.
  let lastDenial: CanResult = FORBIDDEN_SCOPE
  for (const p of candidates) {
    const result = evaluateCell(p, action, target)
    if (result.ok) return result
    lastDenial = result
  }
  return lastDenial
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: principal × action × target evaluation
// ─────────────────────────────────────────────────────────────────────────────

interface EffectivePrincipal {
  agentId: string | null
  tenantId: string | null
  roleDb: DbRole | null
  platformTier: PlatformTier | null
  managedAgentIds: string[]
  isDelegate: boolean
}

function evaluateCell(
  p: EffectivePrincipal,
  action: PermAction,
  target: TargetSpec
): CanResult {
  // Tier 6: Admin Platform — anything goes (self-protection already checked upstream).
  if (p.platformTier === 'admin') {
    return OK
  }

  // Tier 5: Manager Platform — full authority across overseen tenants.
  // Cannot platform.write (no peer-promotion; no touching Admin Platform).
  // All other actions: OK across all tenants, including promote/demote of
  // tenant_admin which is Mgr Platform+ exclusive per locked spec.
  if (p.platformTier === 'manager') {
    if (action === 'platform.write') return FORBIDDEN_PLATFORM
    return OK
  }

  // No platform tier → tenant-scoped principal.
  if (action === 'platform.read' || action === 'platform.write') {
    return FORBIDDEN_PLATFORM
  }

  return evaluateTenantScoped(p, action, target, /*platformOverride=*/ false)
}

function evaluateTenantScoped(
  p: EffectivePrincipal,
  action: PermAction,
  target: TargetSpec,
  platformOverride: boolean
): CanResult {
  // Cross-tenant gate (B4 / B7 / B12). Manager Platform skips via override.
  if (!platformOverride) {
    const targetTenantId = extractTargetTenantId(target)
    if (targetTenantId !== null) {
      if (!p.tenantId || p.tenantId !== targetTenantId) {
        return FORBIDDEN_CROSS_TENANT
      }
    }
  }

  switch (target.kind) {
    case 'agent':
      return evaluateAgentTarget(p, action, target)
    case 'lead':
      return evaluateLeadTarget(p, action, target)
    case 'tenant':
      return evaluateTenantTarget(p, action)
    case 'delegation':
      return evaluateDelegationTarget(p, action, target)
    case 'platform':
      // Reached only if a non-platform principal somehow asks for a platform
      // target — already blocked upstream. Defensive.
      return FORBIDDEN_PLATFORM
  }
}

function extractTargetTenantId(target: TargetSpec): string | null {
  switch (target.kind) {
    case 'agent':
    case 'lead':
    case 'tenant':
    case 'delegation':
      return target.tenantId
    case 'platform':
      return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent target
// ─────────────────────────────────────────────────────────────────────────────

function evaluateAgentTarget(
  p: EffectivePrincipal,
  action: PermAction,
  target: Extract<TargetSpec, { kind: 'agent' }>
): CanResult {
  switch (action) {
    case 'agent.read':
      // Any tenant-resident principal reads agents in their tenant.
      // Cross-tenant already blocked upstream.
      return OK

    case 'agent.write':
      // B8: tier 1 (agent) cannot write.
      if (p.roleDb === 'agent') return FORBIDDEN_ROLE
      // B9: tier 2 (manager) writes within scope (self + direct children).
      // Tier 3 (area_manager) writes within full subtree (managedAgentIds
      // populated transitively for area_managers by R3.2).
      if (p.roleDb === 'manager' || p.roleDb === 'area_manager') {
        if (isInManagerScope(p, target)) return OK
        return FORBIDDEN_SCOPE
      }
      // Tier 4 (tenant admin): any agent in tenant.
      if (isTenantAdminTier(p.roleDb)) return OK
      return FORBIDDEN_ROLE

    case 'agent.adminMutate':
      // B10: tier 4+ only.
      if (isTenantAdminTier(p.roleDb)) return OK
      return FORBIDDEN_ROLE

    case 'agent.promote':
    case 'agent.demote':
    case 'agent.reassignParent':
      return evaluateRoleChange(p, target)

    default:
      return FORBIDDEN_ROLE
  }
}

function isInManagerScope(
  p: EffectivePrincipal,
  target: Extract<TargetSpec, { kind: 'agent' }>
): boolean {
  if (p.agentId === null) return false
  return (
    target.agentId === p.agentId ||
    target.parentId === p.agentId ||
    p.managedAgentIds.includes(target.agentId)
  )
}

// Role change matrix (locked spec):
//   Admin Platform   → any direction (handled upstream as OK).
//   Manager Platform → a ↔ m ↔ am ↔ ta within overseen tenants (handled via
//                       virtual tenant_admin; can also act on tenant_admin
//                       targets, which tenant_admin cannot).
//   Tenant Admin     → a ↔ m ↔ am within tenant. Cannot touch tenant_admin
//                       targets (Mgr Platform+ only).
//   Area Manager     → a ↔ m within own subtree.
//   Manager / Agent  → none.
//
// NOTE: This evaluates whether the actor has authority to act on this TARGET.
// It does not validate the resulting NEW role — R4 transition state machine
// owns "new role within actor's authority" + cardinality invariants.
function evaluateRoleChange(
  p: EffectivePrincipal,
  target: Extract<TargetSpec, { kind: 'agent' }>
): CanResult {
  // Admin/Manager Platform handled in evaluateCell upstream.

  if (isTenantAdminTier(p.roleDb)) {
    // Tenant Admin: cannot act on tenant_admin/admin targets.
    if (isTenantAdminTier(target.roleDb)) return FORBIDDEN_ROLE
    return OK
  }

  if (p.roleDb === 'area_manager') {
    if (target.roleDb !== 'agent' && target.roleDb !== 'manager') {
      return FORBIDDEN_ROLE
    }
    if (!isInManagerScope(p, target)) return FORBIDDEN_SCOPE
    return OK
  }

  return FORBIDDEN_ROLE
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead target
// ─────────────────────────────────────────────────────────────────────────────

function evaluateLeadTarget(
  p: EffectivePrincipal,
  action: PermAction,
  target: Extract<TargetSpec, { kind: 'lead' }>
): CanResult {
  if (action !== 'lead.read' && action !== 'lead.write') {
    return FORBIDDEN_ROLE
  }

  // B14: agent — only own leads.
  if (p.roleDb === 'agent') {
    if (p.agentId !== null && target.agentId === p.agentId) return OK
    return FORBIDDEN_NOT_YOUR_LEAD
  }

  // B13: manager — own leads + direct children's leads.
  // area_manager — own leads + full subtree's leads (managedAgentIds is
  // transitive for area_managers per R3.2 contract).
  if (p.roleDb === 'manager' || p.roleDb === 'area_manager') {
    if (target.agentId === null) return FORBIDDEN_SCOPE
    if (p.agentId !== null && target.agentId === p.agentId) return OK
    if (p.managedAgentIds.includes(target.agentId)) return OK
    return FORBIDDEN_SCOPE
  }

  // Tenant Admin: any lead in tenant.
  if (isTenantAdminTier(p.roleDb)) return OK

  return FORBIDDEN_ROLE
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenant target
// ─────────────────────────────────────────────────────────────────────────────

function evaluateTenantTarget(p: EffectivePrincipal, action: PermAction): CanResult {
  if (action === 'tenant.read') {
    // Any tenant-resident principal reads own tenant config.
    // Cross-tenant already blocked upstream.
    if (p.tenantId !== null || p.platformTier !== null) return OK
    return UNAUTHORIZED
  }

  if (action === 'tenant.write') {
    // Only tier 4+ mutates tenant config.
    if (isTenantAdminTier(p.roleDb)) return OK
    return FORBIDDEN_ROLE
  }

  return FORBIDDEN_ROLE
}

// ─────────────────────────────────────────────────────────────────────────────
// Delegation target
// ─────────────────────────────────────────────────────────────────────────────

function evaluateDelegationTarget(
  p: EffectivePrincipal,
  action: PermAction,
  target: Extract<TargetSpec, { kind: 'delegation' }>
): CanResult {
  if (action === 'delegation.grant') {
    // Delegation is personal: only the principal whose authority is being
    // delegated may grant. Admin Platform handled upstream as OK.
    if (p.agentId === null) return FORBIDDEN_ROLE
    if (p.agentId !== target.delegatorId) return FORBIDDEN_SCOPE
    return OK
  }

  if (action === 'delegation.revoke') {
    // Revoke: original delegator OR tenant_admin tier within tenant.
    // (Manager Platform / Admin Platform handled upstream.)
    if (p.agentId !== null && p.agentId === target.delegatorId) return OK
    if (isTenantAdminTier(p.roleDb)) return OK
    return FORBIDDEN_SCOPE
  }

  return FORBIDDEN_ROLE
}