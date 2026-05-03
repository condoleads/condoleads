# W-ROLES-DELEGATION Tracker

**Started:** 2026-05-02
**Owner:** Shah (sole dev)
**Status:** Spec locked. Ready for R1 (recon).
**Sister tracker:** `docs/W-HIERARCHY-TRACKER.md` (shared surface: recipients helper at H3.3)

---

## Why this exists

Real estate organizations restructure constantly. Agents get promoted to managers; managers step back to agents; tenant admins delegate authority when busy. The system must support these transitions fluidly, with proper permissions, audit trail, and without breaking existing data (leads, hierarchy walks, lead routing).

Additionally, every role needs **delegation** — the ability to grant another person the same rights, scoped to the delegator's domain. Used universally: an agent delegates to an assistant when on vacation; a tenant admin delegates to a co-admin while traveling; the platform admin delegates to a deputy.

W-HIERARCHY fixes the email/lead/territory wiring. W-ROLES-DELEGATION builds the human-organization layer on top.

---

## Scope contract (LOCKED)

In scope:
1. Role transitions (promote / demote / lateral move / parent-id reassignment) with state machine + permission enforcement
2. Universal delegation system (any role can have one or more active delegates; one delegate can serve multiple delegators)
3. Audit trail for both
4. Workspace UI on `/admin-homes` for both
5. Extension of W-HIERARCHY's recipients helper to include delegates in BCC at each layer

Out of scope:
- Anything in W-HIERARCHY's scope (email/lead fan-out, walker correctness, territory routing — those are the sister tracker's responsibility)
- Tenant onboarding / offboarding flows (separate phase)
- Per-tenant policy customization (e.g., "this tenant doesn't allow agents to delegate") — flagged but deferred
- Cross-tenant transfers (an agent moving from Tenant A to Tenant B) — flagged but deferred to mature-product phase
- System 1 (untouched per project rule)

---

## Locked product model

### The roles ladder (6 steps)

1. **Agent** — does the work, owns leads
2. **Manager** — manages a team of agents
3. **Area Manager** — manages multiple managers/teams
4. **Tenant Admin** — runs the tenant
5. **Manager Platform** — oversees multiple tenants
6. **Admin Platform** — exactly one (Shah, perpetual)

### Universal delegation

Every role can grant delegation. A delegate inherits the delegator's rights, scoped to the delegator's domain. Stored as a join table, not a column on agents:

```
agent_delegations
├── id (uuid pk)
├── delegator_id (uuid → agents.id)         -- person granting authority
├── delegate_id (uuid → agents.id)          -- person receiving authority
├── tenant_id (uuid)                        -- scope, denormalized
├── granted_at (timestamptz)
├── granted_by (uuid → agents.id)           -- who created delegation
├── revoked_at (timestamptz, nullable)
├── revoked_by (uuid → agents.id, nullable)
└── notes (text, nullable)
```

Constraints:
- `delegator_id != delegate_id` (no self)
- No cycles: delegate cannot delegate back to delegator (direct or transitive)
- Delegate cannot themselves delegate (no support-of-support)
- Soft-delete only — `revoked_at` set, row preserved for audit

Queries:
- "Active delegators for X": `SELECT delegator_id FROM agent_delegations WHERE delegate_id = X AND revoked_at IS NULL`
- "Active delegates of Y": `SELECT delegate_id FROM agent_delegations WHERE delegator_id = Y AND revoked_at IS NULL`
- "Can X act as Y?": exists in active delegators of X, OR X = Y

### Permission matrix for role changes

| Role of actor | Can promote/demote within | Cannot |
|---|---|---|
| Admin Platform | Anyone, any direction | Demote self; create another Admin Platform; delete self |
| Manager Platform | Within tenants overseen: agent ↔ manager ↔ area_manager ↔ tenant_admin | Promote to Manager Platform; touch Admin Platform |
| Tenant Admin | Within tenant: agent ↔ manager ↔ area_manager | Promote to tenant_admin (only Manager Platform+ does that); cross tenant boundary |
| Area Manager | Within subtree: agent ↔ manager | Outside subtree; tenant_admin+ |
| Manager | None | Change any role |
| Agent | None | Change any role |
| Delegate of X | Same as X, scoped to X's domain | Delegate further |

Self-protection invariants:
- Cannot demote self
- Admin Platform cardinality always exactly 1 (cannot demote sole Admin Platform; cannot promote anyone TO Admin Platform — that would create two)
- Tenant Admin cardinality always exactly 1 per tenant (cannot demote sole tenant_admin without simultaneously promoting replacement; new tenant_admin must be in same tenant)

### State machine for transitions

**Promote:**
- Set new role on agents.role
- `parent_id` stays
- `can_create_children` flips on if new role allows children
- No effect on existing leads (still assigned to same agent_id)
- New role applies to future hierarchy walks
- Audit row written

**Demote:**
- If agent has direct reports (descendants), block. UI must show "this person manages N people — reassign their reports first."
- If agent is sole tenant_admin of a tenant, block. UI must show "promote a replacement tenant admin first."
- Otherwise: change role, flip `can_create_children` if needed, write audit row
- Existing leads stay with agent_id
- New role applies to future walks

**Lateral (e.g., area_manager → tenant_admin or vice versa):**
- Same orphan-prevention rules
- Same single-tenant-admin invariant

**Parent-id reassignment (separate from role change, often paired with it):**
- An agent (or subtree) reports to a different parent
- `UPDATE parent_id` of the subtree root; descendants follow automatically
- Blocked if it would create a cycle in the parent_id graph
- Blocked if it would orphan the source tenant from its tenant_admin
- Audit row written with from_parent_id / to_parent_id

### Audit trail

```
agent_role_changes
├── id (uuid pk)
├── agent_id (uuid → agents.id)
├── from_role (text)
├── to_role (text)
├── from_parent_id (uuid, nullable)
├── to_parent_id (uuid, nullable)
├── from_can_create_children (bool)
├── to_can_create_children (bool)
├── changed_by (uuid → agents.id)
├── changed_at (timestamptz default now())
├── reason (text, nullable)
└── tenant_id (uuid)
```

Read-only after write. Append-only. Surfaces in dashboard as "history" tab on agent profile.

### Effect on existing leads

**Existing leads stay assigned to the agent_id they were assigned to.** Hierarchy IDs (manager_id, area_manager_id, tenant_admin_id) on existing lead rows are **historical snapshots**, not live references. They do not auto-update on role change.

Visibility queries (which leads can a given user see in the dashboard) re-walk the **live** hierarchy at read time, not the stored IDs. This means:
- A lead created when King Shah was tenant_admin still shows tenant_admin_id = King Shah's id forever
- If King Shah is later demoted and replaced, the new tenant_admin sees that lead via the live walk (King Shah's child agent → walk up → new tenant_admin), not via the stored tenant_admin_id

This preserves history while keeping visibility correct. Aligns with "lots of data accumulation, archive lifecycle later" — historical leads carry historical context.

---

## Coordination with W-HIERARCHY

**Shared surface:** `lib/admin-homes/lead-email-recipients.ts` (built in W-HIERARCHY H3.3).

W-HIERARCHY ships the helper with layers 1–4 + 6 (and layer 5 when F49 schema lands).

W-ROLES-DELEGATION extends the helper to add the **delegation overlay**: for each populated principal at any layer, query `agent_delegations` and add active delegates to BCC.

The extension is purely additive — no signature change, no behavior change for non-delegated cases. Helper version bumps; consumers don't change.

This means: **W-HIERARCHY can ship without waiting for W-ROLES-DELEGATION.** F40 retires. The system is correct without delegation; delegation makes it richer when it lands.

---

## Phases

### R1 — Recon

- Verify schema state: `agents.role` constraints (or absence), `agents.is_admin` semantics, existing audit tables
- Find all places `agents.role` is read or written today (grep for `\.role\s*=` and `from\('agents'\)`)
- Find all places `is_admin` is checked (grep `is_admin`)
- Find all places parent_id is updated (grep for `parent_id\s*[:=]`)
- Document current ad-hoc permission patterns (which routes do their own checks)
- Output: state document mapping current permission surface to target permission middleware

### R2 — Schema

- Migration: create `agent_delegations` table with constraints (no cycles, no self, no support-of-support enforced via trigger)
- Migration: create `agent_role_changes` audit table
- Migration: optional CHECK on `agents.role` to constrain to known values
- RLS policies on both new tables
- Verification: insert/update/delete probes against constraints

### R3 — Permission middleware

- New file: `lib/admin-homes/permissions.ts`
- Single function: `can(actor: Agent, action: PermAction, target: Agent | TargetSpec) → boolean`
- Implements the matrix from locked spec
- Resolves "actor X has rights of Y" via active delegations
- Every protected route in `/admin-homes` and `/api/admin-homes` calls this
- Replaces ad-hoc `is_admin` checks (audit from R1 lists them)

### R4 — Transition state machine

- New file: `lib/admin-homes/role-transitions.ts`
- Functions: `promote(actor, target, newRole)`, `demote(actor, target, newRole)`, `reassignParent(actor, target, newParentId)`, `revokeDelegation(actor, delegationId)`, `grantDelegation(actor, delegateId, notes?)`
- Each runs:
  1. `can()` permission check
  2. Invariant checks (no orphan, no cycle, single-admin)
  3. Apply change
  4. Write audit row
  5. Return result
- All-or-nothing: failure at any step rolls back

### R5 — Delegation CRUD

- API routes under `/api/admin-homes/delegations/` for grant + revoke
- Read endpoints: list active delegations granted-by-me, list active delegations granted-to-me
- All routes use R3 middleware

### R6 — UI on /admin-homes

- Workspace page (no modals — workspace pattern per project rule):
  - Agent profile shows current role, parent, role-history tab, delegations tab
  - Promote/Demote buttons gated by `can()` — disabled with tooltip if permission denied or invariant blocked
  - Reassign-parent UI gated similarly
  - Grant-delegation UI on agent profile
  - Revoke-delegation in delegations tab
- Confirmation step before any change (state machine returns "would-be-result"; UI shows it; user confirms; state machine commits)

### R7 — Recipients helper extension

- Extend `lib/admin-homes/lead-email-recipients.ts` (W-HIERARCHY H3.3) to query `agent_delegations` for each populated principal
- Active delegates added to BCC at the same layer as their delegator
- Tested via smoke: create delegation, fire a lead, confirm delegate received email

### R8 — Smoke matrix

- Promote agent → manager: role updates, audit written, `can_create_children` flips, future leads route correctly
- Demote manager (with reports) → blocked, UI shows reason
- Demote manager (no reports) → succeeds
- Demote sole tenant_admin → blocked
- Promote replacement tenant_admin + demote previous → succeeds atomically
- Reassign agent to new parent → walker reflects, future leads route correctly
- Reassign creating cycle → blocked
- Grant delegation → delegate appears in BCC on subsequent leads
- Grant delegation to delegate (support-of-support) → blocked
- Revoke delegation → delegate removed from BCC on subsequent leads (existing leads' historical state unaffected)
- Permission denied attempts from each role → all blocked with audit log of attempt
- Self-demotion attempt → blocked
- Admin Platform second-promotion attempt → blocked

### R9 — Close

When R1–R8 complete, all transitions and delegations work end-to-end, audit trail readable, UI workspace functional, smoke 12/12 pass, TSC clean.

---

## Findings

(To be populated during R1 recon.)

---

## Workflow rules in effect

All W-HIERARCHY rules apply identically: multi-tenant rule zero, no regressions, comprehensive only, nothing deferred, no guessing, backups before edits, no placeholders, secrets in fingerprint format, System 1 isolation, modal pattern is dead.

---

## Status log

- **2026-05-02 v1** — Tracker created from W-HIERARCHY F63 spinoff. Spec locked from product discussion. Ready for R1 recon.

---

## Next action

**R1 recon.** When W-HIERARCHY H2 lands and H3.3 (recipients helper skeleton) is shipped, R1 starts. Until then, this tracker exists as a spec; no code work yet.