# W-ROLES-DELEGATION Tracker

**Started:** 2026-05-02 (spec locked); R1 executed 2026-05-03
**Owner:** Shah (sole dev)
**Status:** R1 + R2 + R3 + R4 DONE (2026-05-04). R4 shipped 5 atomic Postgres RPCs (rpc_promote_agent / rpc_demote_agent / rpc_reassign_parent / rpc_grant_delegation / rpc_revoke_delegation), TypeScript wrapper at lib/admin-homes/role-transitions.ts, and RPC integration smoke at scripts/r4-2-smoke-rpcs.js (25/25 against real DB). Roles ticket is functionally complete. Sister ticket W-ADMIN-AUTH-LOCKDOWN (13 routes still on api-auth.ts) is open but does not block roadmap. Per Shah roadmap: territory → leads → dashboard UI → massive testing → production.
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

### R2 — Schema migrations (DONE 2026-05-04)

Four migrations applied to production Supabase, code-side patches shipped, all verified.

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
- **2026-05-04 v3** (R2 DONE) — Four SQL migrations applied to production Supabase, all verified:

  - **R2.1** — agents.role CHECK tightened to spec values: agent, manager, area_manager, tenant_admin, admin. Vestigial values (assistant, support, managed) dropped from constraint.

  - **R2.2** — agent_delegations table created. Constraints: no-self CHECK, no-cycle trigger (named dollar-tag cycle), no-support-of-support trigger (named dollar-tag sos), revoke-consistency CHECK. Four indexes (PK + 3 functional). Service-role-only RLS. Smoke 4/4 PASS: valid grant succeeded; cycle attempt fired Delegation cycle; no-self attempt fired CHECK violation; support-of-support attempt fired No support-of-support.

  - **R2.3** — agent_role_changes audit table created. Append-only triggers (named dollar-tag append). At-least-one-change CHECK. Three indexes (PK + 2 functional). Service-role-only RLS. Structural verification passed. Runtime smoke deferred to R5 since Supabase SQL editor runs as superuser.

  - **R2.4a** — Code patches: app/dashboard/page.tsx and lib/admin-homes/auth.ts (3 sites) migrated from is_admin reads to role IN admin/tenant_admin checks. lib/credits/getAgentTier.ts deleted entirely (zero callers, dead code).

  - **R2.4b** — is_admin column dropped. TSC clean. Agents table integrity preserved (7 rows: 5 agents, 1 tenant_admin, 1 admin).

  **Lessons:** Supabase SQL editor cannot parse plain dollar-quoted function bodies that contain complex SQL (recursive CTEs especially). Always use named dollar-tags for function definitions. R2.2 SQL file on disk updated to match what was actually run.

  **R2 close mechanics note:** First close attempt corrupted the tracker (script v1 used template literals with dollar-tag names; tooling interpolated them as variables, causing 5x file repetition). Reset --soft, restored tracker from backup, re-patched with this v2 script (pure string concat, no template literals). Lesson logged for future tracker patch scripts.

  **Next action:** R3 — permission middleware (lib/admin-homes/permissions.ts with can() function consolidating the 10 ad-hoc branches in api-auth.ts per F5).

---

## Next action

Per Shah roadmap (locked 2026-05-04):

1. **Territory system** — next ticket. Per-agent geo / building access boundaries; tenant-scoped lead routing rules.
2. **Leads system enhancement** — routing using territory + can() permissions.
3. **Dashboard UI** — surface hierarchy, role transitions, delegations in /admin-homes (consumes R4 wrappers).
4. **Massive testing** — full integration pass before production launch.
5. **Production launch.**

### Open sister tickets (do not block roadmap)

- **W-ADMIN-AUTH-LOCKDOWN** — migrate the 13 production routes still calling api-auth.ts onto can() + role-transitions.ts. After all 13 ship, lib/admin-homes/api-auth.ts deletion becomes safe. Scope: app/api/admin-homes/{activities, agents/[id]/*, agents/list, leads/[id], tenants/*, users/override}/route.ts. Independent of feature roadmap; can ship anytime.

---

## R3 status log (2026-05-04)

**R3.0 — api-auth.ts catalogue.** Read existing api-auth.ts in full. 14 distinct authorization branches across 5 helpers. Mapped each branch to a (PermAction, TargetSpec) cell. Identified 2 new findings: F9 (System 1 isolation via site_type=comprehensive belongs in route handler not can()), F10 (position assistant/support predates delegation table, now display-only). Verified initial caller grep returned only scripts/ matches — caller count claim was based on under-recursing PowerShell glob, corrected during R3.5.

**R3.1 — permissions.ts shipped.** New file with PermAction enum (14 actions), TargetSpec discriminated union (5 kinds), ActorPermissionContext shape, and can() pure synchronous decision function. Delegation overlay implemented as effective-principal expansion (no SOS for delegation.grant). Self-protection on (promote/demote/reassignParent self) blocks before delegation overlay. 375 lines. TSC clean.

**R3.1 fix — Manager Platform.** Initial implementation virtualized Manager Platform as tenant_admin and routed through evaluateRoleChange. evaluateRoleChange blocks tenant_admin from acting on tenant_admin targets — correct rule for actual tenant_admins, wrong restriction for Manager Platform per locked spec ("Mgr Plat can promote a/m/am/ta within overseen tenants"). Fix: simplified Manager Platform to "OK except platform.write". Delta -160 bytes. Validated by R3.3 cell 26.

**R3.2.0 — GRANT migration.** R2.2 + R2.3 created agent_delegations + agent_role_changes with RLS but no GRANT to service_role. Service role hit "permission denied" before BYPASSRLS could apply. Migration 20260504_r3_2_0_grants_on_delegation_tables.sql added GRANT SELECT, INSERT, UPDATE, DELETE on both tables. Verified via information_schema.role_table_grants (8 rows) and live service-role probe (0 rows returned, no error).

**R3.2.1 — auth.ts extension.** resolveAdminHomesUser() return shape extended with permissions: ActorPermissionContext field. Three new internal helpers: computeManagedAgentIds (subtree-aware: direct children for manager, direct + grandchildren for area_manager, empty for agent/tenant_admin tier short-circuits), fetchActiveDelegators (agent_delegations join with FK embed). All existing fields preserved verbatim — 7 existing callers continue working unchanged.

**R3.2.2 — live verification against King Shah.** Smoke replicated R3.2.1 logic against production data. 6/6 checks PASS: agentId, tenantId, roleDb=tenant_admin, platformTier=null (King Shah is not in platform_admins), managedAgentIds=[] (tenant_admin tier short-circuit), activeDelegators=[].

**R3.3 — 42-cell matrix smoke.** scripts/r3-3-smoke-permissions.ts — in-memory tests of can() across 11 categories: self-protection (3), cross-tenant (3), agent tier (4), manager scope (5), area manager subtree (4), tenant admin (4), Manager Platform (5 incl. R3.1 fix regression), Admin Platform (3), delegation grant (3), delegation revoke (2), delegation overlay (5), self-protection vs delegation (1). Result: 42/42 PASS. Run via npx tsx. Re-runnable as ongoing CI asset.

**R3.4 — P0 security closure.** Recon of 7 existing auth'd surfaces revealed only 1 file required gate change: app/api/admin-homes/agents/route.ts. POST handler had no authentication check. Curl probe (Mon May 04 16:45 UTC) confirmed: unauthenticated request reached handler with X-Tenant-Id resolved to b16e1039 (WALLiam tenant context assigned to anonymous external request). Fix: resolveAdminHomesUser() gate + can('agent.adminMutate', target) check. Verified locally (401) and in production (Mon May 04 17:53 UTC, 401 confirmed). Other 6 surfaces (agents/leads/users/settings/bulk-sync/tenants pages) had correct gates already — no can() refactor.

**R3.5 — deletion attempted, reverted.** api-auth.ts deletion failed: TSC immediately surfaced 14 errors across 13 files. Initial recon (Block 1 grep at 09:31) used PowerShell glob "**\*.ts" which under-recurses by default; missed deeper paths like app/api/admin-homes/activities/route.ts, .../tenants/[id]/route.ts, etc. Wrong claim of "zero callers" was the proximate cause. Deletion commit edbf773 was reverted via 1657b59 within minutes. api-auth.ts restored byte-for-byte. Production stayed at 401 throughout (R3.4 gate is upstream of api-auth.ts). Spun out as W-ADMIN-AUTH-LOCKDOWN sister ticket; 13 routes need per-route can() migration before deletion is safe.

**Lesson logged:** PowerShell glob "**\*.ts" does NOT recurse into nested subdirectories by default. For caller-search before deletion, use git grep (index-aware, recurses correctly) or Get-ChildItem -Recurse | Select-String. TSC errors immediately after a delete are a hard-stop signal — abort, do not push past.

### Findings retired

- **F1 (CHECK tightened)** — retired R2.1.
- **F2 (audit table)** — retired R2.3.
- **F3 (delegations table)** — retired R2.2.
- **F4 (is_admin deprecation)** — retired R2.4a/b.
- **F5 (api-auth.ts consolidation)** — partially retired R3.1 (can() exists; new code uses it). Full retirement deferred to W-ADMIN-AUTH-LOCKDOWN.

### Findings open or spun out

- **F6 (setAgentParent hardening)** — R4 owns.
- **F7 (territory orthogonality)** — territory phase (deferred per Shah).
- **F8 (api-auth.ts dead code)** — spun out: W-ADMIN-AUTH-LOCKDOWN.
- **F9 (System 1 site_type guard)** — belongs in route handler, not can(). Documented in permissions.ts header. No action.
- **F10 (assistant/support position legacy)** — display-only, not in any decision path. Future cleanup ticket. No action.
- **F11 (POST /api/admin-homes/agents had no auth gate)** — NEW, surfaced during R3.4 recon. Closed in production at 17:20 UTC via R3.4 patch.

### R3 commits on main

- e0586ce — fix(security/W-ROLES-DELEGATION/R3.4): close P0 auth hole on POST /api/admin-homes/agents
- 6591ab9 — fix(W-ROLES-DELEGATION/R3): commit missing permissions.ts + auth.ts + migration (recovery from incomplete prior commit)
- edbf773 — chore(R3.5): delete dead api-auth.ts (BAD: reverted)
- 1657b59 — Revert "chore...R3.5...delete dead api-auth.ts"

---

## R4 status log (2026-05-04)

**R4.0 — atomic role transition RPCs.** New migration 20260504_r4_0_role_transition_rpcs.sql added 5 SECURITY DEFINER PL/pgSQL functions (rpc_promote_agent, rpc_demote_agent, rpc_reassign_parent, rpc_grant_delegation, rpc_revoke_delegation) plus 2 helpers (role_tier_rank, assert_same_tenant). Each RPC is a single Postgres transaction with structured RAISE EXCEPTION on invariant violations (INVARIANT_<NAME>: <details> prefix). Service-role-only EXECUTE grants. Verified via pg_proc query (7 functions in public schema) and information_schema.role_routine_grants (5 EXECUTE grants).

**R4.1 — TypeScript wrappers.** New file lib/admin-homes/role-transitions.ts with 5 exported async functions (promoteAgent, demoteAgent, reassignParent, grantDelegation, revokeDelegation). Each runs app-layer can() check first (R3.1) for fast 403 rejection, then invokes the corresponding RPC. INVARIANT_* error prefixes parsed and mapped to 400 with structured reason. Locked design (Q1=A, Q2=A, Q3=A): platform actors must act via tenant override before invoking; promote/demote are separate exported functions; RPC invariant errors return 400 verbatim. TSC clean. Size 16,207 bytes.

**R4.2 — RPC integration smoke.** scripts/r4-2-smoke-rpcs.js — fixture-driven test against real DB. Builds 2 sentinel tenants + 10 agents (TENANT_A: TA1, TA2, AM, M1, M2, A1, A2, A3; TENANT_B: TB_TA, TB_AGENT). Runs 25 cells across all 5 RPCs covering: promote success/self-block/cross-tenant/no-change/not-promotion/invalid-role; demote success/self-block/no-orphan/sole-TA/not-demotion; reassign success/self-block/self-parent/cross-tenant/parent-tier; grant success/self-block (table CHECK)/cross-tenant/no-SOS/no-cycle (trigger); revoke success/already-revoked/not-found. Wipes fixture in finally block. Result: 25/25 PASS.

**R4.2.1 — cell 17 retired.** Initial cell 17 attempted to test the CYCLE invariant by reassigning AM (area_manager) to A1 (agent, in AM's subtree). PARENT_TIER fired first because A1's tier is below AM's. Investigation: any reachable cycle case necessarily has the proposed parent at lower tier than target (cycle requires parent in target's subtree; subtrees are strictly lower-tier per spec). PARENT_TIER and CYCLE both correctly enforced; PARENT_TIER is checked first (cheaper). CYCLE remains in RPC as defense-in-depth against schema-corruption scenarios. Cell 17 retired with gravestone comment in smoke; smoke now 25 cells total.

### R4 commits on main

Single-batch commit pending; covers:
- supabase/migrations/20260504_r4_0_role_transition_rpcs.sql
- lib/admin-homes/role-transitions.ts
- scripts/r4-2-smoke-rpcs.js
- docs/W-ROLES-DELEGATION-TRACKER.md (this update)
