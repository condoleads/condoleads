# W-ROLES-DELEGATION Tracker

**Started:** 2026-05-02 (spec locked); R1 executed 2026-05-03
**Owner:** Shah (sole dev)
**Status:** R1 (recon) DONE. R2 (schema) is next action. 7 findings documented. Test fixture tenant wiped.
**Sister tracker:** `docs/W-HIERARCHY-TRACKER.md` (CLOSED 2026-05-03; recipients helper at H3.3 is the integration point this tracker extends)

---

## Why this exists

Real estate organizations restructure constantly. Agents get promoted to managers; managers step back to agents; tenant admins delegate authority when busy. The system must support these transitions fluidly, with proper permissions, audit trail, and without breaking existing data (leads, hierarchy walks, lead routing).

Additionally, every role needs **delegation** — the ability to grant another person the same rights, scoped to the delegator's domain. Used universally: an agent delegates to an assistant when on vacation; a tenant admin delegates to a co-admin while traveling; the platform admin delegates to a deputy.

W-HIERARCHY fixed the email/lead/territory wiring. W-ROLES-DELEGATION builds the human-organization layer on top.

---

## Scope contract (LOCKED)

In scope:
1. Role transitions (promote / demote / lateral move / parent-id reassignment) with state machine + permission enforcement
2. Universal delegation system (any role can have one or more active delegates; one delegate can serve multiple delegators)
3. Audit trail for both
4. Workspace UI on `/admin-homes` for both
5. Extension of W-HIERARCHY's recipients helper to include delegates in BCC at each layer

Out of scope:
- Anything in W-HIERARCHY's scope (email/lead fan-out, walker correctness, territory routing — sister tracker's responsibility, now closed)
- Tenant onboarding / offboarding flows (separate phase)
- Per-tenant policy customization (e.g., "this tenant doesn't allow agents to delegate") — flagged but deferred
- Cross-tenant transfers (an agent moving from Tenant A to Tenant B) — flagged but deferred to mature-product phase
- Territory assignments (which agent owns which building/listing/geo) — territory phase
- System 1 (untouched per project rule)

---

## Locked product model

### The roles ladder (6 layers, 2 storage surfaces)

**Tenant-scoped layers (live on `agents` table, `agents.role`):**
1. **agent** — does the work, owns leads
2. **manager** — manages a team of agents
3. **area_manager** — manages multiple managers/teams
4. **tenant_admin** — runs the tenant

**Platform-scoped layers (live on `platform_admins` table, `platform_admins.tier`):**
5. **manager** (`tier='manager'`) — oversees multiple tenants
6. **admin** (`tier='admin'`) — exactly one (Syed Shah, perpetual)

**Spec correction (R1 outcome):** Earlier spec text used `admin_platform` and `manager_platform` as if they were `agents.role` values. They are not. Layer 5–6 storage is `platform_admins.tier`, separate table. The codebase already uses `admin` (not `admin_platform`) — keeping that label.

**All roles are selling roles** (R1 finding F7). A tenant_admin, area_manager, or manager can be assigned to a building/listing/geo as the lead's owning agent. Role determines hierarchy + permissions; territory assignment is orthogonal. When Mike (manager) is the assigned agent on a lead, the lead's `agent_id` is Mike, walker climbs from Mike. Demoting Mike to agent does not unassign his territories. Granting delegation to Mike's assistant does not transfer Mike's territories. Territory mechanics belong to a separate territory phase; W-ROLES-DELEGATION must leave the seam clean.

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
| admin (platform) | Anyone, any direction | Demote self; create another admin; delete self |
| manager (platform tier) | Within tenants overseen: agent ↔ manager ↔ area_manager ↔ tenant_admin | Promote to platform manager; touch platform admin |
| tenant_admin | Within tenant: agent ↔ manager ↔ area_manager | Promote to tenant_admin (only platform tier+ does that); cross tenant boundary |
| area_manager | Within subtree: agent ↔ manager | Outside subtree; tenant_admin+ |
| manager | None | Change any role |
| agent | None | Change any role |
| Delegate of X | Same as X, scoped to X's domain | Delegate further |

Self-protection invariants:
- Cannot demote self
- Platform admin cardinality always exactly 1 (cannot demote sole admin; cannot promote anyone TO admin — that would create two)
- Tenant admin cardinality always exactly 1 per tenant (cannot demote sole tenant_admin without simultaneously promoting replacement; new tenant_admin must be in same tenant)

### State machine for transitions

**Promote:**
- Set new role on `agents.role`
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

**Existing leads stay assigned to the agent_id they were assigned to.** Hierarchy IDs (`manager_id`, `area_manager_id`, `tenant_admin_id`) on existing lead rows are **historical snapshots**, not live references. They do not auto-update on role change.

Visibility queries (which leads can a given user see in the dashboard) re-walk the **live** hierarchy at read time, not the stored IDs. This means:
- A lead created when King Shah was tenant_admin still shows tenant_admin_id = King Shah's id forever
- If King Shah is later demoted and replaced, the new tenant_admin sees that lead via the live walk (King Shah's child agent → walk up → new tenant_admin), not via the stored tenant_admin_id

This preserves history while keeping visibility correct. Aligns with "lots of data accumulation, archive lifecycle later" — historical leads carry historical context.

---

## Coordination with W-HIERARCHY

**Shared surface:** `lib/admin-homes/lead-email-recipients.ts` (built in W-HIERARCHY H3.3, closed 2026-05-03).

W-HIERARCHY shipped the helper with layers 1-6 fully resolved (verified end-to-end via Stage 1 smoke 3/3 PASS + production deployment).

W-ROLES-DELEGATION extends the helper to add the **delegation overlay**: for each populated principal at any layer, query `agent_delegations` and add active delegates to BCC.

The extension is purely additive — no signature change, no behavior change for non-delegated cases. Helper version bumps; the 8 lead routes consuming it don't change.

This means: **W-HIERARCHY shipped without waiting for W-ROLES-DELEGATION.** F40 retired. The system is correct without delegation; delegation makes it richer when it lands.

---

## Phases

### R1 — Recon (DONE 2026-05-03)

All recon tasks complete. Schema verified (`agents.role` CHECK is wider than spec; no audit tables exist). 4 grep tasks executed (role reads/writes, is_admin checks, parent_id updates, permission patterns). Existing permission gateway found at `lib/admin-homes/api-auth.ts` (~10 enforcement branches; R3 will consolidate).

Test fixture tenant `00000000-0000-0000-0000-000000000003` (7 agents at `@test-3-2.local`) wiped — was vestigial role-fixture from Phase 3.2 era.

7 findings documented (see Findings section).

### R2 — Schema migrations (NEXT)

Three schema migrations + one code-then-schema migration for is_admin deprecation:

1. **Tighten `agents_role_check`** (R2.1) — drop `assistant, support, managed` from allowed values. Verify zero rows on those values first (already verified post-wipe). New constraint: `role IN ('agent', 'manager', 'area_manager', 'tenant_admin', 'admin')`.

2. **Create `agent_delegations`** (R2.2) per locked spec:
   - Columns per spec
   - Constraints: `delegator_id != delegate_id`, no cycles (trigger), no support-of-support (trigger)
   - Soft-delete: revoke sets `revoked_at`; row preserved
   - Indexes: (delegator_id, revoked_at), (delegate_id, revoked_at), (tenant_id)
   - RLS: tenant-scoped read; service-role write only

3. **Create `agent_role_changes`** (R2.3) per locked spec:
   - Columns per spec
   - Append-only (INSERT only; trigger blocks UPDATE/DELETE except by service role)
   - RLS: tenant-scoped read

4. **Deprecate `is_admin`** in stages:
   - **R2.4a (code)**: migrate the 3 reader sites (`app/dashboard/page.tsx:15`, `lib/admin-homes/auth.ts:101`, `lib/credits/getAgentTier.ts:20`) to use `role`-based checks
   - **R2.4b (schema)**: after readers migrated and verified, drop `is_admin` column

R2 ships as 5 commits. Each self-contained.

### R3 — Permission middleware

- New file: `lib/admin-homes/permissions.ts`
- Single function: `can(actor: Agent, action: PermAction, target: Agent | TargetSpec) → boolean`
- Implements the matrix from locked spec
- Resolves "actor X has rights of Y" via active delegations
- Every protected route in `/admin-homes` and `/api/admin-homes` calls this
- `lib/admin-homes/api-auth.ts` becomes thin wrapper around `can()` (consolidates the 10 ad-hoc branches found in R1)

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
- `reassignParent()` replaces `lib/hierarchy/agent-tree.ts:201` `setAgentParent()` (per F6 — current function has no cycle check, no permission check, no audit)

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
- 8 consumer routes do not change

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
- Platform admin second-promotion attempt → blocked

R8 will be part of the project-wide programmatic testing pass at end of W-program (per Shah's locked decision in W-HIERARCHY: build single auth-aware test harness once, applied across all trackers).

### R9 — Close

When R1-R8 complete, all transitions and delegations work end-to-end, audit trail readable, UI workspace functional, smoke pass, TSC clean.

---

## Findings

### Open

| ID | Description | Phase | Resolution |
|---|---|---|---|
| **F1** | `agents.role` CHECK constraint allows 8 values: `agent, manager, area_manager, tenant_admin, admin, assistant, support, managed`. Spec uses 6 layers across 2 tables. `assistant, support, managed` were vestigial from a pre-spec delegation prototype. Test fixture tenant wiped 2026-05-03; zero live rows on those role values. | R2.1 | Tighten CHECK to `role IN ('agent', 'manager', 'area_manager', 'tenant_admin', 'admin')`. |
| **F2** | No audit tables exist for agent role/parent changes. Spec defines `agent_role_changes`. | R2.3 | Create per spec. Append-only, RLS-protected. |
| **F3** | No `agent_delegations` table exists. Spec defines it. | R2.2 | Create per spec with constraints (no-self, no-cycle, no-support-of-support enforced via trigger). |
| **F4** | `is_admin` boolean dual-tracks with `role`. Read in 3 places: `app/dashboard/page.tsx:15`, `lib/admin-homes/auth.ts:101`, `lib/credits/getAgentTier.ts:20`. Comment in auth.ts:22 ("is_admin = true must win") indicates earlier reconciliation work. | R2.4a (code) → R2.4b (schema) | Migrate readers to `role IN ('tenant_admin', 'admin')` checks. Drop `is_admin` column at R2 close. `role` is single source of truth going forward. |
| **F5** | `lib/admin-homes/api-auth.ts` already implements ~10 permission enforcement branches (`Forbidden — cross-tenant access blocked`, `role cannot mutate agents`, `outside manager scope`, `not your lead`, etc.). | R3 | `can()` consolidates these into the spec's permission matrix. Existing file becomes thin wrapper. |
| **F6** | `lib/hierarchy/agent-tree.ts:201` `setAgentParent()` is the sole `parent_id` mutation site. **No cycle check, no permission check, no audit.** | R4 | `reassignParent()` replaces `setAgentParent()`. Adds permission check (R3 `can()`), cycle detection, audit row, transactional shape. |
| **F7** | All roles are selling roles (Shah's R1 observation). A tenant_admin, area_manager, or manager can be assigned to building/listing/geo and own leads as their `agent_id`. Role and territory-assignment are orthogonal. | Territory phase (separate) | W-ROLES-DELEGATION must leave seam clean. R3 middleware does NOT gate by role-against-territory. R4 demotion does NOT unassign territories. Documentation finding. |

### Closed

(none yet — R1 is the recon phase, no findings retired by R1)

### Spec corrections from R1

1. `admin_platform` (spec) → `admin` (codebase). Layer 6 = `platform_admins.tier='admin'`, exactly one row (Syed Shah).
2. `manager_platform` (spec) → `platform_admins.tier='manager'` (separate table, not `agents.role`).
3. `is_admin` column scheduled for deprecation in R2.
4. CHECK constraint `agents_role_check` to be tightened in R2.

---

## Workflow rules in effect

All W-HIERARCHY rules apply identically: multi-tenant rule zero, no regressions, comprehensive only, nothing deferred (within reason — programmatic smoke deferred to project-wide testing pass per Shah's decision), no guessing, backups before edits, no placeholders, secrets in fingerprint format, System 1 isolation, modal pattern is dead.

---

## Status log

- **2026-05-02 v1** — Tracker created from W-HIERARCHY F63 spinoff. Spec locked from product discussion. Ready for R1 recon.
- **2026-05-03 v2** — R1 (recon) DONE. W-HIERARCHY closed earlier same day, opening this tracker. Schema state verified: `agents.role` CHECK has 8 values (4 spec + 4 vestigial); no audit tables; `agent_delegations` doesn't exist. 4 grep tasks executed across role/is_admin/parent_id/permission patterns. Test fixture tenant `00000000-0000-0000-0000-000000000003` (7 agents, 0 downstream rows) wiped — vestigial Phase 3.2 prototype. 7 findings recorded (F1-F7). Spec corrections: `admin_platform` → `admin` (codebase wins), Layer 5-6 storage is `platform_admins.tier` not `agents.role`, `is_admin` scheduled for deprecation in R2. Shah noted F7 (all roles are selling roles — territory orthogonality) — deferred to territory phase but documented. **Tracker rewritten in clean UTF-8** to fix mojibake (em-dashes were corrupted as `â€"`). Next action: R2 schema migrations (CHECK tightening, agent_delegations + agent_role_changes tables, is_admin deprecation).

---

## Next action

**R2 — schema migrations.** Five commits, each self-contained:

```
feat(W-ROLES-DELEGATION/R2.1): tighten agents.role CHECK constraint
feat(W-ROLES-DELEGATION/R2.2): create agent_delegations + cycle/no-self triggers
feat(W-ROLES-DELEGATION/R2.3): create agent_role_changes audit table
refactor(W-ROLES-DELEGATION/R2.4a): migrate is_admin readers to role-based
feat(W-ROLES-DELEGATION/R2.4b): drop is_admin column
```

R2.1 → R2.2 → R2.3 → R2.4a → R2.4b sequenced. Each migration runs in its own transaction. After R2 ships: TSC clean check, then R3 (permission middleware) opens.
