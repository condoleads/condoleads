## W-TENANT-TERRITORY-MODEL — agreed target model (2026-06-24 design session)

PURPOSE: the brokerage operating model for tenant/role/territory/lead distribution.
Engine (resolver + cascade + hash-split + hierarchy) is built (per W-TERRITORY-ARCH-REVIEW).
This records the AGREED model so review can find gaps = fine-tuning vs real work.

### Status grid

FLOW: Territory resolution decides lead/email ownership; hierarchy governs escalation + opt-out above it. One flow — do not edit territory without checking the lead/email + hierarchy stages it feeds.

| Phase | Stage(s) touched | Status | Commit | Blocker/Next |
|---|---|---|---|---|
| Target model design | territory→leads→hierarchy | LOCKED | a1925f4 | — |
| Governance design + phased plan | territory→hierarchy | LOCKED | bdc0122 | — |
| Phase 1 house-account invariant (trigger + PATCH + picker + guards) | territory→leads (ownership fallback) | SHIPPED, DDL live, pushed d39941f | d39941f | — |
| W-HOUSE-ACCOUNT UNIT 1 (picker feed fix + resolver P-HOUSE fallback + Aily→Ovais) | territory→leads (end-to-end flow) | SHIPPED, DDL live, pushed 18ee965 | 18ee965 | live operator click-test of picker on aily.ca |
| W-HOUSE-ACCOUNT UNIT 2 (house account assignable from Agents org chart — marker + drawer action) | territory (operator UX) | SHIPPED, pushed 248b6bd | 248b6bd | — |
| W-HOUSE-ACCOUNT UNIT 3 (seed root retired; Ovais real root; house-account marker on agents list; inactive agents filtered from list+chart) | territory (operator UX + data) | SHIPPED, pushed d50720c | d50720c | — |
| W-HOUSE-ACCOUNT UNIT 5 (operating-hierarchy display; owner-out-of-tree; House Account picker removed from Settings) | territory (operator UX) | SHIPPED, pushed 142168e | 142168e | — |
| W-HOUSE-ACCOUNT UNIT 6 (parent_id forest walk; orphan-at-its-level renders as own root row) | territory (operator UX) | SHIPPED, pushed 9953018 | 9953018 | — |
| W-HOUSE-ACCOUNT UNIT 7 (revert UNIT 5 over-exclusion — tenant_admin owner is BOTH header AND tree node; reports nest under owner) | territory (operator UX) | SHIPPED, pushed 59a213f | 59a213f | — |
| W-HOUSE-ACCOUNT UNIT 8B (house-account oversight: CC on every lead email + tenant-wide dashboard visibility; Part 0 = COMPUTE-met ownership confirmed) | territory→leads→email | SHIPPED, pushed 077c852 | 077c852 | — |
| W-HOUSE-ACCOUNT UNIT 9 (full branch-copy via chain.ancestors + tenant owner + assistants top-layer + tenant-admin-only opt-out via jsonb notification_preferences.oversight_opt_out) | territory→leads→email | SHIPPED, pushed 59da867 | 59da867 | — |
| W-HOUSE-ACCOUNT UNIT 10 (opt-out UI toggle in EditAgentModal; tenant_admin/assistant-only render gate; threads canSetOversightOptOut through page → AgentsManagementClient → modal) | territory→leads→email (operator UX) | SHIPPED, pushed 18c71f2 | 18c71f2 | — |
| W-TENANT-ASSISTANT UNIT 11 (agents.role CHECK extended to allow 'assistant'; AddAgentModal option; assistants card-eligible like any role — NO license gate; Unit 9 lead-email leg auto-activates) | territory→leads→email (role) | SHIPPED, pushed 9a6a52f (UNIT 11 3663749 + FIX 9a6a52f), DDL live | 9a6a52f | — |
| W-COCKPIT-PARITY UNIT 12 (thread tenantDefaultAgentId + canSetOversightOptOut from cockpit server page → CockpitShell → PeopleTab → AgentsManagementClient/EditAgentModal — closes the 3 carried cockpit follow-ups from UNITs 3 and 10) | territory (operator UX cockpit) | SHIPPED, pushed bed7bed | bed7bed | — |
| W-HOUSE-ACCOUNT UNIT 13 (inline "Set as house account" row action in agents list — works in standalone + cockpit via shared AgentsManagementClient; reuses Phase 1 Part 2 PATCH; gated to tenant_admin/assistant/admin/platform; hidden for assistant rows per trigger contract) | territory→leads→email (operator UX) | SHIPPED, pushed fee54461 | fee54461 | — |
| W-AGENT-EDIT UNIT 14 (role edit in EditAgentModal — gated to admin viewers; server PUT enforces 2 invariants: house-account-eligible role + no-orphan-on-demote) | hierarchy + territory (operator UX) | SHIPPED, pushed 011d627 | 011d627 | — |
| W-TENANT-CREATE UNIT 15 (auto-seed tenant owner as first agent + house account on tenant create — closes the "manual step 3" gap; prerequisite for Phase 1b NOT NULL) | tenant lifecycle + territory | SHIPPED, pushed b2ffd1a | b2ffd1a | — |
| W-TENANT-GOV PHASE 1b / UNIT 16 (FIRST ATTEMPT) — NOT NULL only | territory | REVERTED 2026-06-25 — broke UNIT 15 tenant-create (FK cycle: tenants.default_agent_id ↔ agents.tenant_id). Migration applied + emergency rolled back; no commit. Root cause + comprehensive fix path documented; supersession by UNIT 16b. | — | n/a |
| W-TENANT-GOV PHASE 1b / UNIT 16b (deferrable FKs + transactional create refactor + NOT NULL) | territory + tenant lifecycle | SHIPPED LOCAL, DDL live (Gate 1 + Gate 2) | (pending this commit) | live operator click-test (create test tenant on aily.ca → owner seeded under live NOT NULL) |
| Phase 3 admin_assistant role + SMOKE 7 role-ineligible | territory→hierarchy (roles) | SUPERSEDED — Phase 3's "admin_assistant" role intent is now W-TENANT-ASSISTANT UNIT 11's 'assistant' value (added to agents.role CHECK 2026-06-25). SMOKE 7 role-ineligible test is implicit in Unit 11's apply-runner SMOKE 4 (validate_house_account still rejects assistant as house). Closed as covered. | 18c71f2..(this) | — |
| Phase 2 cards_opt_out column + CHECK | territory→hierarchy (opt-out) | SUPERSEDED — UNIT 9 implemented opt-out via the existing agents.notification_preferences jsonb (no new column needed). Closed as covered. | 59da867 | — |

CROSS-TRACKER POINTERS — flow stages NOT closed by this tracker:
- Lead/email routing detail: see docs/W-LEADS-WORKBENCH-TRACKER.md.
- Hierarchy/roles/delegation: see docs/W-HIERARCHY-TRACKER.md + docs/W-ROLES-DELEGATION-TRACKER.md.
- Territory ops/resolver (F-HASH-RR-NOT-IMPLEMENTED, F-NON-SELLING-PRIMARY-SILENT-FAILOVER, v14 dashboard): see docs/W-TERRITORY-MASTER-TRACKER.md — OPEN, not closed by this tracker.

### The model (plain)
- Shared inventory (no tenant owns listings). Per-tenant ROUTING overlay resolves one agent per (tenant, context) at request time. RESOLUTION model, confirmed.
- Hierarchy: TENANT (e.g. Ovais) > AREA MANAGER > MANAGER > AGENT. Assignment flows DOWN; leads flow UP (visibility).

### Assignment vs Distribution (the "automation" we discussed)
- ASSIGNMENT = human act: give a geo/building/listing to one or more roles (cards).
- DISTRIBUTION = automatic: system hash-splits listings equally across assigned roles; anything unassigned falls through the cascade to the HOUSE ACCOUNT. Distribution is the automation — resolver does it per-request, no human per-listing.

### Granularity (specific wins)
LISTING pin > BUILDING (atomic — whole building to one role) > GEO+TYPE > AREA.
- GEO levels: area / municipality / community / neighbourhood.
- PROPERTY TYPE: homes and condos are SEPARATELY assignable at geo level ("Mississauga homes" vs "Mississauga condos" can go to different roles). [VERIFY: does card model support type-scoping today?]
- N roles share a geo+type → hash-RR equal split by listing_id (BUILT).

### House account (the mandatory catch-all)
- REGULATORY FLOOR: every public listing MUST show a LICENSED agent — cascade can never resolve to nobody.
- HOUSE ACCOUNT = one named, licensed, cards-IN role that catches everything unassigned. Chosen over floor-split (cleaner, auditable, one accountable party).
- INVARIANT: at least one licensed cards-in role must always exist per tenant. System must REFUSE any opt-out / removal that would leave no house account. Today this is implicit via tenants.default_agent_id — target: make it an ENFORCED, named invariant.

### Opt-out (two independent switches per role)
- CARDS/PUBLIC: out → not in distribution, NOT shown on public listings. Cascade skips them.
- LEADS/MANAGEMENT: in → sees & manages leads (incl. team leads flowing up). Out → (rare) no leads.
- TYPICAL case: manager/broker = CARDS-out + LEADS-in (manages, sees all, invisible to public).
- Opt-out NEVER orphans an asset — it falls through to the next role and ultimately the house account.
- A cards-out role CANNOT be the house account (house account is public by definition).

### Leads
- Route to the resolved (cards-in) agent; flow UP to manager/area-manager/tenant for visibility.
- Leads-visibility (flowing up) is INDEPENDENT of leads-as-routing-target. A cards-out/leads-in manager still SEES team leads, just isn't a routing target. Do not conflate.
- Email distribution follows the same routing + roll-up. [VERIFY against current lead/email code.]

### Status: built vs to-verify vs likely-new (to be filled by the review)
- BUILT (per arch review): resolver cascade, hash-split, hierarchy roles, default_agent_id fallback.
- TO VERIFY: property-type card granularity; lead roll-up populated + shown; license tracked as a field.
- LIKELY NEW: opt-out (cards + leads per role); house-account as enforced invariant (can't remove last licensed cards-in role); non-selling tenant.

### Queued dependency
W-AILY-RETIRE-SEED-ADMIN (re-parent + move default_agent_id to Ovais + reassign leads) intersects this — the seed admin IS Aily's current implicit house account.

---

## GOVERNANCE LAYER — final design + plan (2026-06-24, post-recon)

ENGINE IS BUILT (per W-TENANT-TERRITORY-REVIEW): cascade, hash-split, hierarchy walk,
lead roll-up, type-split at every geo tier, building/listing pin atomicity — all ✅ in sync.
LICENSE TRACKING: NOT NEEDED — all agent roles are licensed by trade; only the (new)
admin_assistant is unlicensed and never carded/public. No is_licensed field.

### Decisions locked
- D1 admin_assistant agent-mgmt rights: DEFAULT OFF, grantable per-assistant by Tenant or
  Platform Admin (operator is ultimate authority). A permission toggle, not baked in.
- D2 cards-in/leads-out IS allowed (rare). Lead still routes (listing shows the agent —
  regulatory floor), but the NOTIFICATION skips them and flows UP the walkHierarchy chain to
  the next leads-in role (manager→area_mgr→tenant→house account). Lead never orphaned.
- D3 house-account picker: per-tenant Settings UI (reachable today), NOT a new /platform page.

### Slot map (from W-TENANT-GOVERNANCE recon — exact insertion points)
- cards_opt_out (NEW bool col on agents, default false): filter in pick_floor_agent WHERE
  (20260527_p_floor_schema_and_resolver.sql:162-199) + pick_routing_agent_for_type WHERE
  (20260526_p2_resolver_strip.sql:76-92). Enforced at CONSUMPTION (resolver), not write.
- leads_opt_out (NEW bool col, default false): filter in getLeadEmailRecipients
  (lib/admin-homes/lead-email-recipients.ts:80-299) recipient assembly — skip as a recipient,
  fall to next leads-in upline. walkHierarchy stays UNFILTERED (structural truth). Lead-create
  attribution stays populating upline columns (denormalized cache).
- house-account invariant: FK already exists (RESTRICT — can't delete the agent). MISSING:
  NOT NULL on default_agent_id; CHECK/trigger tenant_id match; active check; cards_opt_out=false
  check; app-guard "can't empty/opt-out the last house account"; Settings UI picker.
- admin_assistant: widen agents.role CHECK to 6 values; add to DbRole union (permissions.ts:62)
  + TENANT_ROLES (scope.ts:34); permissions cells (lead.read/write + tenant.read/write YES;
  agent.adminMutate/agent.write = grantable toggle per D1); resolver role-filter
  role != 'admin_assistant' in both pick_ fns (belt + suspenders vs accidental card).

### PHASED PLAN (dependency order; each phase: recon-confirm slot → gated patch → smoke → commit)
- PHASE 1 — HOUSE-ACCOUNT INVARIANT (safety floor; opt-out depends on it).
  Settings UI picker + tenants PATCH validation (tenant-match, active, not-null) + app-guard
  preventing empty house account. (CHECK cards_opt_out=false deferred to after Phase 2 adds the col.)
- PHASE 2 — OPT-OUT FLAGS (the main feature).
  2 new bool cols + resolver-skip (2 WHERE clauses) + email-skip + agent-edit UI toggles +
  the D2 leads-out-routes-up behavior. Then close the Phase-1 house-account CHECK to also require
  cards_opt_out=false (house account can't be cards-out).
- PHASE 3 — admin_assistant ROLE (independent).
  CHECK widen + role plumbing + resolver role-filter + D1 grantable agent-mgmt toggle.
  Sits top-of-hierarchy, sees all tenant leads (scopeLeadsQuery "else" branch already does this),
  never carded, never house-account-eligible.

### Hard constraints (every phase)
- Multi-tenant: every new query/filter scopes by tenant_id. Opt-out cols are per-agent (agent
  carries tenant_id). No hero-bias.
- Resolver changes get the multi-tenant function review (CLAUDE.md hard gate) — both pick_ fns
  resolve tenant-scoped routing.
- WALLiam regression: opt-out cols default false = today's behavior exactly. C12 must stay baseline.
- System 1 untouched.
- Each resolver-skip filter PROVEN against the real resolver (SAVEPOINT-isolated smoke: card an
  agent, opt them out, assert resolver skips them) before ship — not asserted.

### Dependency note
W-AILY-RETIRE-SEED-ADMIN intersects Phase 1: Aily's house account is currently the seed admin
(0b3fcbf7). Phase 1's Settings picker is the clean tool to move it to Ovais — so RETIRE-SEED-ADMIN
becomes "use the Phase 1 picker to set Ovais as house account, re-parent, reassign leads."

---

## PHASE 1 RUN-LOG (2026-06-25) — house-account invariant SHIPPED

Phase 1 (Path C) committed as one unit: DDL + app-layer guards + Settings picker.
`default_agent_id` stays NULLABLE (Path C); NOT NULL deferred to Phase 1b after
create-tenant auto-seed is built.

### Part 1 — DDL applied LIVE

Migration: `supabase/migrations/20260625_w_gov_phase1_house_account_trigger.sql`.
Apply runner: `scripts/apply-gov-phase1-trigger.js` (one-shot, deleted after success).

Created `validate_house_account()` function + `trg_validate_house_account` BEFORE
INSERT OR UPDATE trigger on `tenants`. 4 reject conditions (all raise check_violation
23514 with named messages):
  (a) house_account_invalid          — agent does not exist
  (b) house_account_tenant_mismatch  — agent.tenant_id != tenants.id
  (c) house_account_inactive         — agent.is_active = false
  (d) house_account_role_ineligible  — role NOT IN (agent, manager, area_manager,
                                                     tenant_admin, admin)

Two guards short-circuit pass-through writes:
  (1) NEW.default_agent_id IS NULL  → RETURN NEW (Path C)
  (2) UPDATE + IS NOT DISTINCT FROM OLD → RETURN NEW (column unchanged)

### Part 1 — smoke results (6 executed + 1 documented-unreachable)

  SMOKE 1 pass-through       (primary_color write)            PASS
  SMOKE 2 valid set          (Aily seed agent)                PASS
  SMOKE 3 tenant mismatch    (WALLiam agent on Aily)          PASS — rejected with
                                                              house_account_tenant_mismatch
  SMOKE 4 nonexistent        (random uuid)                    PASS — rejected with
                                                              house_account_invalid
  SMOKE 5 null allowed       (Path C)                         PASS
  SMOKE 6 inactive           (deactivate Ovais in-savepoint,  PASS — rejected with
                              try to assign as default)       house_account_inactive
                                                              Ovais.is_active=true
                                                              restored post-rollback
                                                              (cleanup-verified).
  SMOKE 7 role-ineligible    UNREACHABLE today — agents.role  SKIP (logged)
                              CHECK only allows roles already
                              in the eligible set. Phase 3
                              owns this test when
                              admin_assistant is added.

All smoke mutations bracketed in SAVEPOINT/ROLLBACK TO SAVEPOINT — only the DDL
was committed. Post-verify: Aily default_agent_id = `0b3fcbf7-…` unchanged,
WALLiam default_agent_id = `fafcd5b1-…` unchanged.

### Part 2 — tenants PATCH allow + validation

File: `app/api/admin-homes/tenants/[id]/route.ts`.
- `default_agent_id` added to ALLOWED_FIELDS; L15-16 comment updated per D3.
- App-layer pre-validation runs BEFORE the UPDATE when `default_agent_id` is in
  the body. Friendly 400 with named messages mirroring the trigger's 4
  conditions (UUID format check + agent SELECT + tenant_id/is_active/role checks).
  Trigger remains the DB backstop.

### Part 3 — Settings UI House Account picker

File: `app/admin-homes/settings/SettingsClient.tsx`.
- General tab gains a "House Account (Default Agent)" picker.
- Eligible agents fetched via existing GET /api/admin-homes/agents (tenant-scoped),
  client-filtered to is_active && role in the eligible set.
- 3 rendered states: loading / no-eligible (disabled select + helper text) /
  picker-with-options. Helper text: "Leads with no territory match fall back to
  this agent. Must be an active agent in this tenant."
- `default_agent_id` added to the General section's `saveSection([...])` field
  list — flows through Part 2's validated PATCH.

### Part 4 — agent PUT + DELETE house-account guards

File: `app/api/admin-homes/agents/[id]/route.ts`.
- PUT: when body sets `is_active === false`, pre-check
  `SELECT id FROM tenants WHERE default_agent_id = params.id`. If found → 400
  "Cannot deactivate: this agent is the house account for its tenant. Set a
  different default agent in Settings → General first."
- DELETE: same pre-check BEFORE the agents-row delete (which the
  W-AGENT-LIFECYCLE-INTEGRITY teardown already does FIRST, before
  teardownAuthUser). Friendly 400 replaces the cryptic PG FK-RESTRICT error.
  Non-house-account agents continue to deactivate/delete normally
  (over-block check confirmed in guard-query simulation).

### Gates

  TSC --noEmit: exit 0.
  C12 multi-tenant regression: 17 PASS / 3 FAIL — baseline (c8b-2, c11, L2.1,
    pre-existing C8c-tracked). 0 NEW.
  Live DB guard-query simulation (read-only, against production):
    - Aily seed 0b3fcbf7 → house account YES → guard would BLOCK     ✓
    - Aily Ovais 319ad339 → house account NO  → guard ALLOWS         ✓
    - WALLiam King Shah fafcd5b1 → house account YES → guard BLOCKS  ✓
    - PATCH validations: valid Ovais ACCEPT; WALLiam-on-Aily REJECT
      (tenant mismatch); nonexistent uuid REJECT (not found); seed
      no-op ACCEPT. All 4 mirror the trigger.

### Files (4 code + 1 migration + 1 tracker)

  supabase/migrations/20260625_w_gov_phase1_house_account_trigger.sql   (DDL, LIVE)
  app/api/admin-homes/tenants/[id]/route.ts                              (Part 2)
  app/admin-homes/settings/SettingsClient.tsx                            (Part 3)
  app/api/admin-homes/agents/[id]/route.ts                               (Part 4)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                               (this run-log)

### Open follow-ups (post this commit)

- LIVE OPERATOR CLICK-TEST of the Settings picker on production after push:
  open Settings → General on aily.ca, confirm picker renders with Aily's
  agents, change default_agent_id, save, refresh, persist. (Claimed,
  unverified — auth-gated UI, can't be tested without operator session.)
- SMOKE 7 role-ineligible test: deferred to the Phase 3 admin_assistant
  migration, which is the first time agents.role can carry a value outside
  the eligible set.
- Phase 1b NOT NULL on tenants.default_agent_id: deferred — requires
  create-tenant POST to auto-seed a default agent in-flow first (otherwise
  the migration blocks tenant creation).

### Backups (timestamps)

  app/api/admin-homes/tenants/[id]/route.ts.backup_20260625_061300
  app/admin-homes/settings/SettingsClient.tsx.backup_20260625_061300
  app/api/admin-homes/agents/[id]/route.ts.backup_20260625_061300
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_063821 (pre-this-entry)

### Commit gate

  Migration applied + Parts 2-4 code + tracker shipped together (live-tracker rule).
  HOLD push pending operator instruction.

---

## W-HOUSE-ACCOUNT UNIT 1 RUN-LOG (2026-06-25) — house-account flow END TO END

Goal: make the house-account flow ACTUALLY WORK end-to-end. Phase 1 shipped
the invariant (trigger + picker + guards), but the picker showed "No eligible
agents" on Aily, and even with a default_agent_id set, raw-RPC callers
(including the lead-create path) bypassed the wrapper's fallback. Both fixed.

### R1 — Aily picker bug (root cause)

GET `/api/admin-homes/agents` (app/api/admin-homes/agents/route.ts:25) did NOT
include `role` in its SELECT col list. The SettingsClient client-side filter
(app/admin-homes/settings/SettingsClient.tsx:126) requires `a.role` for the
ELIGIBLE_ROLES.has(a.role) check. Every agent failed the filter (undefined !=
any eligible role) → picker showed "No eligible agents" even with 4 eligible
Aily agents present in DB.

  Fix: one-line additive patch. Added 'role' to GET SELECT.
  File: app/api/admin-homes/agents/route.ts (line 25).
  Backup: app/api/admin-homes/agents/route.ts.backup_20260625_073820.

### R2 — Resolver fallback gap (root cause)

RPC `resolve_agent_for_context` ends with `RETURN NULL` (20260527 P-FLOOR
migration line 369). The TS wrapper `resolveAgentForContext`
(lib/utils/tenant-resolver.ts:222-228) wraps the RPC with a default_agent_id
fallback, but 6 callers invoke the raw RPC and bypass the wrapper:
  app/api/charlie/lead/route.ts:115            (LEAD CREATE — most critical)
  app/api/charlie/appointment/route.ts:98
  app/api/walliam/estimator/session/route.ts:98
  app/api/walliam/contact/route.ts:98
  app/api/walliam/charlie/session/route.ts:78
  app/api/walliam/assign-user-agent/route.ts:137
  lib/actions/leads.ts:99

  Comprehensive fix (per CLAUDE.md): move the fallback INTO the RPC so every
  caller — wrapper or raw — gets it for free. Solves the F-NON-SELLING-PRIMARY-
  SILENT-FAILOVER class of bug at the root.

### F1 — Aily house account set to Ovais (one-row prod UPDATE)

```
UPDATE tenants SET default_agent_id = '319ad339-...' WHERE id = 'e2619717-...';
```

Validated automatically by the live `validate_house_account` trigger (Phase 1
d39941f). Snapshot captured before write.

  Before: Aily.default_agent_id = 0b3fcbf7 (Admin Tenant Aily — the seed admin)
  After:  Aily.default_agent_id = 319ad339 (OVAIS QASSIM, role=tenant_admin)
  Rollback snapshot: supabase/migrations/rollback-snapshots/
                     _aily-house-ovais_tenants_default_agent_id_
                     2026-06-25T12-22-55-366Z.sql
  WALLiam.default_agent_id: fafcd5b1 (King Shah) — unchanged, no cross-tenant
                            leak.

### F2 — Resolver P-HOUSE fallback migration

  File: supabase/migrations/20260625_w_gov_phase1_house_account_fallback.sql
  DDL: CREATE OR REPLACE FUNCTION resolve_agent_for_context — adds final
  P-HOUSE branch after P-FLOOR. Contract: is_active + tenant_id match,
  is_selling INTENTIONALLY OMITTED to mirror validate_house_account trigger
  (a non-selling tenant_admin is a valid house account by design).
  Rollback snapshot: supabase/migrations/rollback-snapshots/
                     _w-gov-phase1-fallback_resolve_agent_for_context_
                     2026-06-25T12-24-19-177Z.sql
  Function comment now: 'W-TENANT-GOV-PHASE1 (v14): canonical resolver ...
                         P-HOUSE=tenants.default_agent_id (is_active + tenant
                         match, NO is_selling filter — matches
                         validate_house_account trigger contract).'

  Apply note: the migration file contained its own BEGIN/COMMIT, which ended
  the apply-runner's outer transaction prematurely. Function CHANGE committed
  successfully (verified via live probe — comment + body markers + behavior
  all confirm P-HOUSE branch active). Runner errored on SAVEPOINT smokes
  4-7 because no tx was active. SMOKES 4-7 were re-run in a standalone
  outer-transaction script and ALL PASSED. Both apply-runners deleted post-
  success per the one-shot pattern (snapshots retained).

### Smoke results

  apply-runner SMOKES 1-3 (committed before SAVEPOINT issue):
    SMOKE 1 PASS — WALLiam empty-context → live default (fafcd5b1)
    SMOKE 2 PASS — Aily empty-context → live default (319ad339 Ovais)
    SMOKE 3 PASS — NULL tenant_id → NULL (no cross-tenant leak)
  Standalone smoke script SMOKES 4-7:
    SMOKE 4 PASS — tenant with NULL default → resolver returns NULL; cleanup OK
    SMOKE 5 PASS — inactive house account → returns NULL (defense-in-depth);
                   cleanup OK (Ovais.is_active restored)
    SMOKE 6 PASS — cross-tenant default (probe bypassed trigger) → filtered
                   out by resolver tenant_id check; cleanup OK
    SMOKE 7 PASS — Aily lead-create scenario → routes to live house account
                   (Ovais)

### T1-T3 end-to-end verification (zero prod mutation)

  T1 PASS: Aily empty-context lead-create resolves to Ovais (319ad339).
           agent.full_name=OVAIS QASSIM, agent.tenant_id=Aily, is_active=true,
           agent effective email=yourcondorealtor@gmail.com.
  T2 PASS: Simulated leads INSERT row has agent_id=Ovais,
           assignment_source='geo' (per route.ts:216,246 with non-null
           agentId). Simulated email chain Layer-1 TO=Ovais email; Layers 2-4
           via walkHierarchy; Layer 5-6 platform BCC unconditional.
  T3 PASS: WALLiam empty-context lead-create resolves to fafcd5b1 (King Shah),
           NOT to Aily's Ovais. agent.tenant_id=WALLiam (correct tenant).
           No cross-tenant leak.

### Gates

  TSC --noEmit: exit 0
  C12 multi-tenant regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11,
    L2.1). 0 NEW fails.
  Aily/WALLiam state post-run (fresh connection):
    Aily.default_agent_id    = 319ad339 (Ovais)       ← changed by F1
    WALLiam.default_agent_id = fafcd5b1 (King Shah)   ← unchanged
    Ovais.is_active = true (restored after SMOKE 5)

### Files (this commit)

  app/api/admin-homes/agents/route.ts                       (R1 picker fix: +role)
  supabase/migrations/20260625_w_gov_phase1_house_account_fallback.sql (F2 DDL)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                  (this run-log)
  supabase/migrations/rollback-snapshots/
    _aily-house-ovais_tenants_default_agent_id_2026-06-25T12-22-55-366Z.sql
    _w-gov-phase1-fallback_resolve_agent_for_context_2026-06-25T12-24-19-177Z.sql

### Backups (timestamps)

  app/api/admin-homes/agents/route.ts.backup_20260625_073820
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_083133 (pre-this-entry)

### Open follow-ups

- LIVE OPERATOR CLICK-TEST of the Settings picker on aily.ca production AFTER
  push: open Settings → General, confirm picker now renders all 4 eligible
  Aily agents (was empty), confirm current selection shows OVAIS QASSIM
  (the F1 result), confirm save persists. (Claimed, unverified — auth-gated
  UI cannot be tested headlessly. The R1 fix is the cause of the prior empty
  state; the resolver-side flow is verified.)
- Backfill the F2 migration file: remove its internal BEGIN; / COMMIT; so
  future apply-runner re-applies don't trip the SAVEPOINT issue. Low priority
  since the migration is already applied and the one-shot runner deleted; if
  any down-and-up rerun is needed, capture lesson at that time.
- W-LEADS-WORKBENCH-TRACKER + W-HIERARCHY-TRACKER intersection: the lead
  email Layer-2/3/4 chain now genuinely walks from Ovais (not 0b3fcbf7).
  Verify Ovais's hierarchy chain (parent_id walk) reaches a populated
  tenant_admin and any expected platform CC/BCC. T2 documented the chain
  abstractly; concrete walkHierarchy probe owned by W-LEADS-WORKBENCH
  follow-up.

### Commit gate

  R1 app fix + F2 migration + F1 data write (via runner) + tracker shipped
  together (live-tracker rule). HOLD push pending operator instruction.

---

## W-HOUSE-ACCOUNT UNIT 2 RUN-LOG (2026-06-25) — assignable from Agents org chart

Goal: from /admin-homes/agents/tree (the org chart), see the house-account
holder visually AND assign/change it inline via the agent's detail drawer.
Uses the SAME validated write path as the Settings picker (PATCH
/api/admin-homes/tenants/[id] → validate_house_account trigger). No new prod
DB writes; no migration. Pure app-layer change on top of Phase 1 + UNIT 1.

### R1 — tree-data route (recon)

  File: app/api/admin-homes/agents/tree-data/route.ts.
  Tenant-scoped (L51-58); knows tenantId via session OR platform-admin
  ?tenant_id= override. SELECT cols did NOT include is_active and did NOT
  query tenants.default_agent_id. Response shape was just { nodes, edges }.

### R2 — chart + node card (recon)

  AgentOrgChart.tsx: 2 mounts (standalone /agents/tree, cockpit PeopleTab).
  ApiNode had no is_house_account. ApiResponse had no tenant block.
  AgentNodeCard.tsx AgentNodeData had no is_house_account.
  Cockpit caveat: in PeopleTab, node click pipes to spine (not drawer); the
  drawer only opens in standalone context. So this unit's drawer-based action
  is reachable from the standalone /agents/tree route (the primary org-chart
  surface — Agents page has an "Org Chart" CTA at AgentsManagementClient.tsx:
  240-246 that links here). Cockpit users continue to use Settings.

### R3 — AgentDetailDrawer (recon)

  Props were { agentId, data, onClose } — no tenant context. Body had avatar/
  name/role/3 Stat cards + 1 "Open full agent page" CTA. No existing action
  area; new button fits cleanly above the existing CTA.

### B1 — tree-data route updates (app/api/admin-homes/agents/tree-data/route.ts)

  - SELECT now includes is_active.
  - NEW: explicit-col SELECT on tenants (id, default_agent_id only — CLAUDE.md
    NEVER SELECT * on tenants) for tenantId.
  - TreeNode interface gains is_active + is_house_account (boolean).
  - Per-node stamp: is_house_account = tenantDefaultAgentId !== null && a.id
    === tenantDefaultAgentId.
  - Response now includes tenant: { id, default_agent_id } at top level so the
    chart knows the holder (and PATCH target) even when that agent is filtered
    out by search/role-filter/selling-only.

### B2 — AgentOrgChart + AgentNodeCard (components/admin-homes/Agent*.tsx)

  AgentOrgChart.tsx:
    - ApiNode + ApiResponse + ApiTenant interfaces updated to mirror the new
      API shape (is_active, is_house_account, tenant block).
    - Per-render AgentNodeData gains is_active + is_house_account threaded
      from ApiNode.
    - NEW reloadTree() useCallback hoisted from confirmReassign so the
      drawer's house-account-change handler can reuse it.
    - AgentDetailDrawer mount now receives tenantIdForActions=api.tenant.id,
      currentHouseAccountId=api.tenant.default_agent_id, onHouseAccountChanged
      =reloadTree. Per-tenant, NEVER hardcoded.

  AgentNodeCard.tsx:
    - AgentNodeData gains is_active + is_house_account?.
    - Marker render: amber Crown lucide icon, absolutely positioned top-right
      (-top-2 -right-2), 6px ring of white shadow. title= renders native
      browser tooltip "House account — catch-all for unrouted leads".
    - Amber chosen deliberately to not clash with any existing ROLE_LABELS
      color (purple/indigo/blue/green/slate).

### B3 — AgentDetailDrawer (components/admin-homes/AgentDetailDrawer.tsx)

  - Props extended: tenantIdForActions?, currentHouseAccountId?,
    onHouseAccountChanged? (all optional — drawer still renders if a future
    caller mounts without them).
  - Header area: when data.is_house_account, the role line gets an amber
    "House account" badge underneath the role label.
  - Status Stat added (Active / Inactive) — uses the new AgentNodeData.is_active.
  - NEW action block (visible only when tenantIdForActions is set):
      - When isCurrentHouse: amber outlined "Current house account" disabled
        label.
      - When eligible: solid amber "Set as house account" button → PATCH
        /api/admin-homes/tenants/[tenantIdForActions] { default_agent_id:
        agentId }. Phase 1 PATCH pre-validation + validate_house_account
        trigger are the authoritative gates; this is just the entry point.
      - Loading state ("Setting..."), inline error message on PATCH 400
        (friendly trigger-mirror messages from Phase 1 Part 2), inline success
        message, helper paragraph explaining the eligibility rules.
      - On success: await onHouseAccountChanged() → reloadTree → marker moves
        in the chart without a page refresh.

### B4 — multi-tenant gate (NO per-tenant constants anywhere)

  tenantId for the PATCH target is sourced from the API response's tenant.id
  field, NOT from a hardcoded constant or per-tenant if/else. Adding tenant
  #3 onboarding requires zero code change — the chart will read whatever
  default_agent_id that tenant's row has and stamp the marker accordingly.

### Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query against live DB (read-only sim of the stamping logic):
    - aily   tenant: 4 nodes; exactly 1 flagged = OVAIS QASSIM (319ad339,
      tenant_admin, active=true)
    - walliam tenant: 3 nodes; exactly 1 flagged = King Shah (fafcd5b1,
      tenant_admin, active=true)
    - cross-tenant leak check: neither tenant's default_agent_id appears in
      the other tenant's agents list. PASS.
  T3 local dev / UI render: AUTH-GATED. The chart route is behind
    resolveAdminHomesUser; the PATCH route is also auth-gated. Cannot exercise
    the full click path headlessly. Claimed-unverified per the spec's
    allowance. Operator confirms on production after push:
      - load /admin-homes/agents/tree on aily.ca,
      - assert amber crown renders on OVAIS QASSIM,
      - click another eligible Aily agent → drawer shows enabled "Set as
        house account" button,
      - click an ineligible agent (e.g. if one is inactive) → friendly 400
        surfaces inline,
      - click "Set as house account" on an eligible agent → marker moves +
        tree updates.
  T4 C12 multi-tenant regression: 17 PASS / 3 FAIL — same baseline (c8b-2,
    c11, L2.1). 0 NEW fails.

### Files (this commit)

  app/api/admin-homes/agents/tree-data/route.ts                 (B1)
  components/admin-homes/AgentOrgChart.tsx                       (B2)
  components/admin-homes/AgentNodeCard.tsx                       (B2)
  components/admin-homes/AgentDetailDrawer.tsx                   (B3)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                       (this run-log)

### Backups (timestamps)

  app/api/admin-homes/agents/tree-data/route.ts.backup_20260625_083748
  components/admin-homes/AgentOrgChart.tsx.backup_20260625_083748
  components/admin-homes/AgentNodeCard.tsx.backup_20260625_083748
  components/admin-homes/AgentDetailDrawer.tsx.backup_20260625_083748
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_084838 (pre-this-entry)

### Open follow-ups

- Cockpit People-tab parity: the cockpit AgentOrgChart mount sends node clicks
  to the spine (not the drawer), so this drawer-based action isn't reachable
  in cockpit. Add a cockpit-side surface (e.g. an action in PeopleTab's
  selected-agent row, or open the drawer alongside spine sync) in a follow-up
  unit. Cockpit users currently use Settings → General picker as before.
- Live operator click-test on aily.ca production after push (see T3 above).

### Commit gate

  4 app files + tracker shipped together (live-tracker rule). NO prod DB
  writes in this unit. HOLD push pending operator instruction.

---

## W-HOUSE-ACCOUNT UNIT 3 RUN-LOG (2026-06-25) — retire seed, re-root, list marker

Goal: retire the placeholder "Admin Tenant (Aily)" seed root, re-root the
hierarchy to Ovais (the real tenant owner, also the Unit 1 F1 house account),
and surface the house-account marker on the LIST view (/admin-homes/agents)
too — Unit 2 only touched the org chart.

### R1 — Aily tree (pre-state)

  4 agents: Seed (0b3fcbf7, root, active), Manager (3c17dc80, under seed),
  Agent (28fee333, under Manager), Ovais (319ad339, under seed).
  WALLiam baseline (must be untouched): King Shah (root) + Neo Smith + WALLiam
  (both under King Shah). 3 active agents.

### R2 — Seed FK references (blockers to DELETE)

  tenants.default_agent_id = seed?         NO  (Unit 1 F1 moved it to Ovais)
  agents.parent_id = seed?                 2 rows (Manager + Ovais) — re-point in D1
  leads.agent_id = seed?                   8 rows                    *** BLOCKER ***
  agent_property_access.agent_id = seed?   1 row                     *** BLOCKER ***
  auth.users[seed]?                        EXISTS (would need teardownAuthUser)
  agent_listing_assignments / agent_geo_buildings / agent_delegations /
    territory_assignment_changes / leads.manager_id / leads.area_manager_id /
    leads.tenant_admin_id                  all 0 (clean)

  Conclusion: safe DELETE not possible without teardownAuthUser cascade + 8
  leads + 1 APA cleanup. Operator-authorized fallback path: is_active=false
  + filter from displays. Historical 8 leads + 1 APA preserved (audit trail).

### R3 — Agents list page (recon)

  File: app/admin-homes/agents/page.tsx loads agents server-side, augments
  with leads/geo/building counts, hands to AgentsManagementClient.
  AgentsManagementClient.tsx already renders the "Under: <manager>" line
  conditionally on `managerName` being truthy (L172) — so once Ovais's
  parent_id becomes NULL via D1, no further render-template change is needed
  to suppress the "Under:" line for the root. E1's app-side work is just
  filtering inactive agents from the LIST + TREE queries so the deactivated
  seed disappears from view.

### D1+D2+D3 — apply-runner results (snapshot retained)

  Runner: scripts/apply-unit3-aily-retire-seed.js (deleted post-success per
          one-shot pattern; snapshot retained in rollback-snapshots/).
  Snapshot: _unit3-aily-retire-seed_agents_2026-06-25T13-23-59-688Z.sql.

  3 UPDATEs in transaction:
    A. Manager (3c17dc80) parent_id: seed -> Ovais       rowCount=1
    B. Ovais (319ad339) parent_id: seed -> NULL          rowCount=1
    C. Seed (0b3fcbf7) is_active: true -> false          rowCount=1

  Post-write state:
    Aily:
      Ovais   parent_id=NULL  is_active=true   ← root
        Manager parent_id=Ovais  is_active=true
          Agent   parent_id=Manager (28fee333) is_active=true   ← unchanged
      Seed    parent_id=NULL  is_active=false  ← retired, no children
    WALLiam (post-write baseline):
      King Shah parent_id=NULL  is_active=true   ← byte-identical to pre-state
      Neo Smith parent_id=King Shah  is_active=true
      WALLiam   parent_id=King Shah  is_active=true

  D3 multi-tenant guard: 5 tenant-specific IDs live in a parameter block at
  the top of the runner. Logic is generic (re-parent everyone in the
  REPARENT_FROM_SEED_TO_NEW_ROOT list from SEED_ID to NEW_ROOT; set
  NEW_ROOT.parent_id=NULL; deactivate SEED_ID). Future tenants with the same
  fixup pattern (placeholder root → real owner) swap IDs only, no logic
  change.

### E1 + E2 — display changes (no DB writes)

  app/admin-homes/agents/page.tsx
    - agents query gains .eq('is_active', true) — filters retired seed from
      list (and any future deactivated agents).
    - tenants SELECT gains default_agent_id (explicit-col per CLAUDE.md).
    - tenantDefaultAgentId derived per scoped tenant + passed to client.
    - Empty-state mount also passes tenantDefaultAgentId=null.

  components/admin-homes/AgentsManagementClient.tsx
    - New Crown lucide import.
    - New prop tenantDefaultAgentId?: string | null (optional w/ null default
      so PeopleTab cockpit mount doesn't break — cockpit will get the Crown
      on the table view via a follow-up that threads default_agent_id through
      the cockpit shell).
    - AgentRow's role cell now renders an amber "House Account" pill next to
      the RoleBadge when agent.id === tenantDefaultAgentId.

  app/api/admin-homes/agents/tree-data/route.ts
    - Same is_active=true filter on the agents query (chart view consistency).

  Net effect on /admin-homes/agents (Aily):
    - 3 active rows (seed hidden); Ovais shows as top with no "Under:" line
      and a House Account pill; Manager shows "Under: OVAIS QASSIM"; Agent
      shows "Under: Manager (Aily)".

### Gates

  T1 TSC --noEmit: exit 0 (after adding tenantDefaultAgentId default=null so
    PeopleTab's cockpit mount compiles).
  T2 guard-query (read-only): 9/9 assertions PASS.
    - seed is_active=false
    - Ovais parent_id=NULL
    - no agent parented to seed
    - active Aily agent count = 3 (seed excluded)
    - exactly 1 active Aily agent flagged house account = Ovais
    - WALLiam: 3 rows, King Shah root + active, Neo Smith + WALLiam under
      King Shah, all active — byte-identical to pre-run.
  T3 local dev render: AUTH-GATED — operator click-test on production after
    push. (Claimed, unverified — auth-gated UI route cannot be exercised
    headlessly.)
  T4 C12 regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11, L2.1).
    INITIAL C12 had c10 newly failing because the test asserted an exact
    string snapshot `.select('id, name, domain, brand_name')` that broke
    when default_agent_id was added. Test updated to assertMatches() with
    a regex pattern allowing additional columns past brand_name (intent:
    brand_name must be in the SELECT; column order + extras are not what
    this test guards). 0 NEW C12 failures.

### Files (this commit)

  app/admin-homes/agents/page.tsx                            (E1a)
  components/admin-homes/AgentsManagementClient.tsx          (E2)
  app/api/admin-homes/agents/tree-data/route.ts              (E1b — chart filter)
  scripts/test-c10-multitenant-regression.js                 (test fix)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                   (this run-log)
  supabase/migrations/rollback-snapshots/
    _unit3-aily-retire-seed_agents_2026-06-25T13-23-59-688Z.sql

### Backups (timestamps)

  app/admin-homes/agents/page.tsx.backup_20260625_092418
  components/admin-homes/AgentsManagementClient.tsx.backup_20260625_092418
  app/api/admin-homes/agents/tree-data/route.ts.backup_20260625_092418
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_093148 (pre-this-entry)

### Open follow-ups

- Cockpit table view (PeopleTab.tsx mounts AgentsManagementClient): doesn't
  thread tenantDefaultAgentId through the cockpit shell, so the Crown badge
  doesn't appear on the cockpit's table tab. Follow-up: extend cockpit shell
  to load default_agent_id and pass it down. Standalone /admin-homes/agents
  works fully.
- Seed cleanup polish: 8 leads + 1 APA card still reference the retired seed
  (intentional — audit trail). A future archive sweep could reassign those to
  Ovais (lead-level) or revoke the APA card (territory-level) — out of scope
  here, captured for W-LEADS-WORKBENCH / W-TERRITORY-MASTER followup.
- Live operator click-test on /admin-homes/agents (aily.ca): assert Ovais at
  top with House Account pill, no "Under:" line; Manager / Agent below with
  correct "Under: <real manager>"; no "Admin Tenant (Aily" row visible.

### Commit gate

  D-phase data write (via runner) + 3 app files + 1 test fix + tracker
  shipped together (live-tracker rule). HOLD push pending operator
  instruction.

---

## W-HOUSE-ACCOUNT UNIT 5 RUN-LOG (2026-06-25) — operating-hierarchy display + Settings cleanup

Goal: surface the OPERATING hierarchy in the agents list + org chart
(area_manager → manager → agent, with assistant as its own row), with the
tenant owner shown SEPARATELY (header / overlay) and NOT as the tree root
everyone hangs under. And: remove the House Account picker from Settings →
General entirely — assignment lives only on the Agents surface (org chart
drawer, Unit 2). Display-only change + Settings UI cleanup. NO prod DB writes.

### Locked rules

- House account stays SINGULAR per tenant. No multi-house schema/UI change.
- Tenant owner (role=tenant_admin) is NOT a tree node. Shown as separate
  owner header / overlay. parent_id data is INTACT — display-only filtering.
- Operating hierarchy ordering: area_manager > manager > agent.
- Tenant assistant (role=assistant) renders as its own row (peer to
  operating roots, not nested under owner).
- House account assignment surface = Agents (org chart drawer, Unit 2). NOT
  Settings.

### R1-R3 (recon)

  R1 — list and chart both today render parent_id=NULL agents as roots, with
       children nesting via parent_id matching. Owner=tenant_admin currently
       acts as the visible root. Fix: define "operating root" = role !=
       tenant_admin AND (parent_id IS NULL OR parent.role == tenant_admin).
       Children of owners surface as operating roots; data unchanged.
  R2 — Roles in scope: tenant_admin (owner), area_manager, manager, agent,
       assistant (own row), plus forward-compat support / managed / admin
       (gracefully ordered last via ROLE_ORDER lookup with ?? 99 fallback).
  R3 — Settings General has 3 areas to remove:
       (a) useState/useEffect eligibleAgents fetch block (L112-132)
       (b) saveSection list contains 'default_agent_id' (L256)
       (c) 3-state House Account picker block (L262-291)
       Tenant interface keeps default_agent_id field (DB still has it; just
       not surfaced here).

### B1 + B2 — operating-hierarchy display

  components/admin-homes/AgentsManagementClient.tsx
    + OWNER_ROLE = 'tenant_admin', agentById map, ownerIds set, owners list
    + isOperatingRoot(a) helper — keyed on role + parent.role, multi-tenant safe
    + getManagerName() now returns null when parent is an owner (skips "Under:
      <owner>" line — owner is shown separately, not as an operational manager)
    + filteredAgents uses isOperatingRoot + new ROLE_ORDER (area_manager 1,
      manager 2, agent 3, managed 4, assistant 5, support 6; unknown = 99)
    + New Tenant Owner header block (above stats grid): purple-bordered card
      listing owner(s) with avatar, name, email, and House Account pill when
      the owner is also the tenant's default_agent_id

  components/admin-homes/AgentOrgChart.tsx
    + `visible` set now excludes role=tenant_admin (auto-drops outgoing
      edges via the existing source/target visibility filter; children
      become orphan roots in dagre layout)
    + New owner overlay (top-right of the canvas): small purple-bordered card
      listing owner(s) with avatar/name + House Account label when applicable

### B3 — Settings cleanup

  app/admin-homes/settings/SettingsClient.tsx
    - REMOVED: EligibleAgent type + eligibleAgents state + useEffect fetch
    - REMOVED: 3-state House Account picker block from General tab
    - REMOVED: 'default_agent_id' from General saveSection field list
    - REMOVED: useEffect import (no remaining consumer)
    + Comment added explaining the move to Agents surface (cites UNIT 2
      drawer 248b6bd) and that DB column + trigger + PATCH validation remain
      unchanged

### B4 — house account stays singular

  No schema change. tenants.default_agent_id remains a single uuid column.
  validate_house_account trigger unchanged. No multi-house UI/schema work.

### B5 — multi-tenant guarantee

  Operating-root logic keys on role + parent's role only — no tenant ids,
  brand names, or per-tenant if/else anywhere in the new render code.
  Tenant #3 onboards with zero code change provided their roles map to the
  known set (or fall through to the role-99 ordering fallback).

### Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query (read-only sim of new render logic):
    aily: owner=Ovais (319ad339), operating root=Manager (3c17dc80),
          no role=tenant_admin in operating roots, chart visible excludes
          tenant_admin. ALL 7 assertions OK.
    walliam: owner=King Shah (fafcd5b1), operating roots=[Neo Smith,
          WALLiam], no tenant_admin in roots, chart visible excludes
          tenant_admin. ALL 8 assertions OK.
    15 assertions PASS across both tenants — no cross-tenant logic leak.
  T3 local dev UI: AUTH-GATED — operator click-test on aily.ca after push.
    Expected: /admin-homes/agents shows Ovais in the Owner header card
    (purple border, House Account amber pill) NOT as a tree row; below it
    Manager → Agent renders as the operating tree. /admin-homes/agents/tree
    shows the same Owner overlay top-right of the canvas; chart nodes are
    just Manager + Agent (no Ovais node). Settings → General no longer has
    the House Account picker; remaining fields save normally.
  T4 C12 regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11, L2.1).
    0 NEW fails.

### Files (this commit)

  components/admin-homes/AgentsManagementClient.tsx  (B1+B2 list)
  components/admin-homes/AgentOrgChart.tsx           (B1+B2 chart)
  app/admin-homes/settings/SettingsClient.tsx        (B3 Settings cleanup)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md           (this run-log)

### Backups (timestamps)

  components/admin-homes/AgentsManagementClient.tsx.backup_20260625_094917
  components/admin-homes/AgentOrgChart.tsx.backup_20260625_094917
  app/admin-homes/settings/SettingsClient.tsx.backup_20260625_094917
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_095409 (pre-this-entry)

### Open follow-ups

- Cockpit People-tab table view: AgentsManagementClient is mounted in
  PeopleTab.tsx too (cockpit shell), but cockpit doesn't currently pass
  tenantDefaultAgentId. Cockpit's Owner header will render but without the
  House Account pill until the cockpit shell threads default_agent_id
  through. Carried over from UNIT 3.
- A list-row "Set as house account" action could be added (currently only
  the org-chart drawer offers this surface). Out of scope for this unit per
  operator spec ("already built in Unit 2"). If the operator wants it on
  the list later, extend EditAgentModal or add a row action.
- Live operator click-test on aily.ca after push (see T3 above).

### Commit gate

  3 app files + tracker shipped together (live-tracker rule). NO prod DB
  writes in this unit. HOLD push pending operator instruction.

---

## W-HOUSE-ACCOUNT UNIT 6 RUN-LOG (2026-06-25) — parent_id forest walk, orphans as roots

Goal: the list's tree structure must derive from real parent_id chains, NOT
from a role-sorted top-level grouping. Specifically: a node whose parent is
NOT in the visible operating set (parent_id NULL, parent is owner-excluded,
parent is inactive/missing) must render as its OWN root row — never silently
hidden by failing to nest. Pure display change in the LIST. The CHART
already does this via its visible/edges filter (no change needed).

### R1 — current state (UNIT 5 baseline)

  LIST: isOperatingRoot was {role!=owner && (parent_id IS NULL || parent IS
        owner)}. Two-case rule. The "parent NOT in visible set for any other
        reason" case (inactive, deleted, cross-tenant orphan) was NOT
        covered — those nodes silently disappeared because they weren't
        roots AND their parent didn't exist in any row's getTeamMembers.
  CHART: already uses `visible = nodes minus tenant_admin` with edge filter
        `visible.has(source) && visible.has(target)`. Children of any
        invisible parent become orphan roots in dagre. Correct as-is — no
        chart code change in UNIT 6.

### R2 — Aily + WALLiam real data

  Aily (active only): Ovais (owner) | Manager (parent=Ovais owner) | Agent
       (parent=Manager). Manager already rendered as root (parent=owner);
       Agent already nested. No real example of "parent inactive/missing".
  WALLiam (active only): King Shah (owner) | Neo Smith (parent=owner) |
       WALLiam agent (parent=owner). Both Neo and WALLiam rendered as roots
       (parent=owner). Same shape.
  Conclusion: neither tenant has a real-data inactive-parent example today.
  Guard-query synthesizes the case to verify the logic without DB mutation.

### B1 — isOperatingRoot refactor (components/admin-homes/AgentsManagementClient.tsx)

  Added: visibleIds = Set of agent ids where role != tenant_admin.

  New isOperatingRoot rule (priority order):
    1. role == tenant_admin                  -> not a tree row (owner header)
    2. parent_id IS NULL                     -> ROOT
    3. parent_id NOT IN visibleIds           -> ROOT
       (covers: owner-excluded, inactive parent filtered at page query,
        deleted parent, cross-tenant orphan)
    4. otherwise nests under real parent_id via getTeamMembers()

  Bug fixed: in UNIT 5, a node whose parent was filtered out for ANY reason
  OTHER than being the owner would fail isOperatingRoot AND wouldn't appear
  in any visible row's getTeamMembers — silently invisible. After UNIT 6,
  it appears as its own root row.

### B2 — secondary ordering (unchanged)

  The existing ROLE_ORDER + name sort still applies as a STABLE secondary
  ordering of peers at the same level. Primary structure now uses parent_id
  forest walk via the rule above; role-sort just disambiguates peers.

### B3 — chart parity (no code change)

  Verified the chart already does parent_id forest walk:
    visible = nodes.filter(n => n.role !== 'tenant_admin') ...
    edges:    visible.has(e.source) && visible.has(e.target)
  Children of any invisible parent get no incoming edge -> dagre lays them
  at the top as orphan roots. Already aligned with the operator's rule.

### B4 — multi-tenant

  Rule keys on role + visibleIds membership only. No tenant ids, no brand
  names, no per-tenant if/else. Tenant #3 onboards with zero code change.

### getManagerName parallel fix

  The "Under: <X>" caption was suppressed only when parent was an owner.
  Updated to suppress when parent is NOT in visibleIds (matches the new
  isOperatingRoot rule). Result: an orphan-as-root row never shows a
  "Under: <ghost>" line.

### Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query (read-only, NO mutations):
     - Aily real data: 4 row-kind assertions + Ovais=owner-header,
       Manager=root, Agent=nested-under-Manager.
     - WALLiam real data: 3 row-kind assertions + King Shah=owner-header,
       Neo Smith=root, WALLiam agent=root.
     - Aily SYNTHESIZED orphan (parent_id pointing at random ghost uuid):
       computed rowKind=ROOT. The exact case the UNIT 5 logic would have
       silently hidden.
     - Aily SYNTHESIZED child of inactive parent (parent_id=retired seed):
       computed rowKind=ROOT.
     - Cross-tenant leak guard: Ovais not in WALLiam set, King Shah not in
       Aily set.
     TOTAL: 18 assertions PASS.
  T3 local dev UI: AUTH-GATED — operator click-test on aily.ca after push.
     Aily: Manager appears as root row (no "Under: <X>" line). Agent nests
     under Manager. Org chart unchanged behavior (already correct).
     Real-data inactive-parent case has no live example today; guard-query
     synthesis covers the logic.
  T4 C12 regression: 17 PASS / 3 FAIL — same baseline. 0 NEW fails.

### Files (this commit)

  components/admin-homes/AgentsManagementClient.tsx          (B1 + getManagerName)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                   (this run-log)

### Backups (timestamps)

  components/admin-homes/AgentsManagementClient.tsx.backup_20260625_100113
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_100328 (pre-this-entry)

### Open follow-ups

- No live real-data example of "child of inactive parent" or "orphan with
  random parent_id" exists in Aily or WALLiam today. The logic is verified
  via guard-query synthesis. If a future tenant has such a case in
  production, the row will render correctly as a root without code change.
- Cockpit People-tab AgentsManagementClient mount picks up the same logic
  automatically (same component). Cockpit's owner-header House Account pill
  still pending tenantDefaultAgentId thread-through (UNIT 3 follow-up).
- Live operator click-test on aily.ca after push.

### Commit gate

  1 app file + tracker shipped together (live-tracker rule). NO prod DB
  writes in this unit. HOLD push pending operator instruction.

---

## W-HOUSE-ACCOUNT UNIT 7 RUN-LOG (2026-06-25) — revert UNIT 5 over-exclusion

UNIT 5 (142168e) excluded tenant_admin from the tree's visible set so the
owner would render ONLY in the separate owner header. That over-corrected:
anyone whose parent_id = the owner got decapitated. Aily Manager (parent =
Ovais) showed as a root row, not nested under Ovais. WALLiam Neo Smith and
WALLiam agent (both parent = King Shah) showed as parallel roots, with the
owner floating disconnected in the header overlay.

UNIT 7 puts the owner back into the tree as a real node — it ALSO stays in
the owner header. Direct reports nest under the owner. Brokerage decides
how deep / how flat. The UNIT 6 orphan-as-root rule still applies to anyone
else whose parent is missing/inactive.

### R1 — UNIT 5's three exclusion sites (now reverted)

  AgentsManagementClient.tsx (pre-UNIT 7):
    (a) visibleIds = agents.filter(role !== OWNER_ROLE) -> owner excluded
    (b) isOperatingRoot: if (role === OWNER_ROLE) return false
    (c) getManagerName: !visibleIds.has(parent) returns null (silently
        suppressed "Under: <owner>" since (a) excluded the owner)

  AgentOrgChart.tsx (pre-UNIT 7):
    (d) visible: .filter(n => n.role !== 'tenant_admin')

  Owner-header rendering at both surfaces is INDEPENDENT of these (uses a
  separate `owners` array) — kept intact.

### R2 — real-data impact

  Aily (active): Ovais (owner, parent NULL) | Manager (parent = Ovais) |
                 Agent (parent = Manager).
                 Pre-UNIT 7: Manager rendered as a ROOT (decapitated).
                 Post-UNIT 7: Manager nests under Ovais.
  WALLiam (active): King Shah (owner, parent NULL) | Neo Smith (parent =
                 King Shah) | WALLiam agent (parent = King Shah).
                 Pre-UNIT 7: both Neo + WALLiam rendered as parallel ROOTS.
                 Post-UNIT 7: both nest under King Shah.

### B1 — undo exclusions

  AgentsManagementClient.tsx:
    (a) visibleIds now = new Set(agents.map(a => a.id)) -- owner included.
    (b) isOperatingRoot drops the role === OWNER_ROLE early-return; rule is
        purely the UNIT 6 forest walk: parent_id IS NULL or parent NOT IN
        visibleIds -> root, else nests.
    (c) getManagerName comment refreshed to reflect: an agent under the
        owner now correctly shows "Under: <owner name>".
  AgentOrgChart.tsx:
    (d) `visible` no longer filters tenant_admin. Edges from owner -> reports
        survive the source/target visibility check; dagre nests reports
        under the owner naturally.

### B2 — preserved (no regressions to other features)

  - Operating-role secondary ordering (area_manager > manager > agent ...) at
    each level: unchanged. Owner is its OWN node, so it sorts among its
    parent_id=null siblings (typically alone).
  - House Account marker (UNIT 2 Crown on the tree node + UNIT 3 House
    Account pill on the list row): unchanged. Owner who is ALSO the house
    account (Ovais's case) renders both indicators automatically — the
    marker logic keys on agent.id === tenant.default_agent_id.
  - Settings -> General House Account picker removal (UNIT 5): unchanged.
    Assignment surface is still the org chart drawer only.
  - UNIT 6 orphan-as-root: still works — synthesized orphan (parent_id =
    random uuid) still resolves to root. Guard-query confirms.
  - UNIT 3 inactive-agent filter (page query .eq('is_active', true) +
    tree-data route filter): unchanged. Retired seed still hidden.

### B5 — multi-tenant

  isOperatingRoot is keyed purely on parent_id + visibleIds membership; no
  tenant ids, brand names, or per-tenant if/else. Tenant #3 with whatever
  owner-with-reports shape they have will render correctly with zero
  code change.

### Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query (read-only, NO mutations):
     Aily: 9 assertions OK (owner present, owner=owner-header, owner=tree-root,
           Manager nests under Ovais, Agent nests under Manager)
     WALLiam: 9 assertions OK (King Shah=owner-header AND tree-root,
           Neo Smith nests under King Shah, WALLiam nests under King Shah)
     Aily SYNTH orphan: 2 OK (parent missing -> still ROOT)
     Cross-tenant leak guard: 2 OK
     TOTAL: 22 assertions PASS.
  T3 local dev UI: AUTH-GATED -- operator click-test on aily.ca after push.
     Expected: /admin-homes/agents shows Owner header (Ovais, House Account
     pill) AND the table also shows Ovais as the top tree node with Manager
     nested under him and Agent nested under Manager. /agents/tree shows the
     owner overlay top-right AND Ovais as the top chart node with the chain
     hanging beneath. Settings General still has no House Account picker.
  T4 C12 regression: 17 PASS / 3 FAIL -- same baseline (c8b-2, c11, L2.1).
     0 NEW fails.

### Files (this commit)

  components/admin-homes/AgentsManagementClient.tsx          (visibleIds + isOperatingRoot + getManagerName)
  components/admin-homes/AgentOrgChart.tsx                   (visible set)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                   (this run-log)

### Backups (timestamps)

  components/admin-homes/AgentsManagementClient.tsx.backup_20260625_101838
  components/admin-homes/AgentOrgChart.tsx.backup_20260625_101838
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_102119 (pre-this-entry)

### Open follow-ups

- Cockpit People-tab table view picks up the new logic automatically (same
  component). Cockpit owner-header House Account pill still pending
  tenantDefaultAgentId thread-through (carried from UNIT 3).
- Live operator click-test on aily.ca after push.

### Commit gate

  2 app files + tracker shipped together (live-tracker rule). NO prod DB
  writes in this unit. HOLD push pending operator instruction.

---

## W-HOUSE-ACCOUNT UNIT 8B RUN-LOG (2026-06-25) — house-account oversight (CC + dashboard)

PART 0 — ownership question CLOSED via COMPUTE: recon proved the locked
model (every scope owned; unassigned routes to house account; assignment
overrides per scope) is ALREADY met at the architecture layer post-UNIT 1.
Resolver P-HOUSE branch (18ee965) routes unassigned-scope leads to
tenants.default_agent_id; geo-rollup route (territory/geo-rollup/route.ts:
274-275) falls back to tenant_default for GeographyView. No DB writes
needed for ownership. PATH SEED REJECTED — would bloat (~2,500+ geo apa
rows per tenant + ~9,800 building rows + ~1.3M listing rows) and risk
cascade short-circuits in pick_routing_agent.

PART B — house-account oversight (CC + visibility), the build.

### R1 — Lead-create path (recon)

  7 routes create leads; ALL flow through resolve_agent_for_context and
  the same email helper:
    app/api/charlie/lead/route.ts                  (plan-email enrichment)
    app/api/walliam/contact/route.ts               (contact forms)
    app/api/walliam/estimator/session/route.ts
    app/api/walliam/charlie/session/route.ts
    app/api/walliam/assign-user-agent/route.ts
    app/api/charlie/appointment/route.ts
    lib/actions/leads.ts

  Every route stamps lead.agent_id = resolver-resolved agent, then calls
  getLeadEmailRecipients(tenant_id, agent_id, supabase). ONE helper, one
  integration point for the CC.

### R2 — Email path (single integration point)

  lib/admin-homes/lead-email-recipients.ts assembles { to, cc, bcc } via
  6 layers (assigned agent TO + manager CC + area_manager / tenant_admin
  / delegates / platform managers / platform admins as BCC). The CC for
  the house account hooks in as a new section between the layer fetches
  and the assembly — same module, all consumers benefit automatically.

### R3 — Dashboard visibility (already satisfied for current data)

  app/admin-homes/leads/page.tsx uses scopeLeadsQuery (lib/admin-homes/
  scope.ts:101-120). Role-gate fires only for role=manager (limited to
  own + managedAgentIds) and role=agent (own only). Everything else
  (tenant_admin, area_manager, admin) falls through with no role gate
  → sees ALL tenant leads.

  Today both house accounts are role=tenant_admin (Ovais on Aily,
  King Shah on WALLiam), so they ALREADY see every tenant lead. The
  rule is keyed on role, not default_agent_id.

  UNIT 8B generalizes: rule should key on default_agent_id, not role.
  If a future tenant sets the house account to role=manager or
  role=agent, the role gate would prevent tenant-wide visibility. The
  fix is an OPTIONAL houseAccountAgentId parameter on scopeLeadsQuery
  that, when matched, bypasses the role gate.

### Path chosen — VISIBILITY-RULE + email CC

  No DB writes. No schema change. No migration. Two surface changes:
    1. lib/admin-homes/lead-email-recipients.ts: house-account CC hook
    2. lib/admin-homes/scope.ts + app/admin-homes/leads/page.tsx:
       optional houseAccountAgentId param that bypasses the role gate

### B1 — Email CC (lib/admin-homes/lead-email-recipients.ts)

  + LeadEmailRecipients.resolved.house_account: string | null (diagnostic
    surface)
  + New "house-account CC" section before Layer 6 BCC. Reads
    tenants.default_agent_id; if non-null AND not === agentId, fetches
    that agent's notification_email/email and adds to CC. Skips
    automatically when:
      - tenant has no house account
      - assigned agent IS the house account (no self-CC)
      - house-account agent has no usable email
  + Cross-list dedupe (CC and TO win over BCC): if the house account is
    also the tenant_admin walker hit (Aily/WALLiam case today), they
    appear in BOTH cc-push and bcc-push above. Promote CC over BCC so
    the recipient appears exactly once and tier is correct (CC =
    visible oversight; BCC = silent).
  + Multi-tenant: tenant_id parameter already scopes the
    default_agent_id read; never crosses tenants.

### B2 — Dashboard visibility override (lib/admin-homes/scope.ts)

  + scopeLeadsQuery signature extended with optional houseAccountAgentId
    parameter (default null = current behavior, backward-compatible).
  + If user.agentId === houseAccountAgentId, the role gate (agent /
    manager .in / .eq filters) is skipped — the tenant_id scope
    remains in force.
  + Pure-function contract preserved: no I/O. Caller pre-computes
    houseAccountAgentId by reading the tenant row server-side.

### B3 — Wire-through (app/admin-homes/leads/page.tsx)

  + tenant SELECT cols extended: brand_name, name, domain,
    default_agent_id (explicit cols per CLAUDE.md — NEVER SELECT * on
    tenants).
  + tenantHouseAccountAgentId derived per scoped tenant.
  + Passed as 4th arg to scopeLeadsQuery(query, adminUser, tenantId,
    tenantHouseAccountAgentId).

### B4 — No regression for the assigned-agent flow

  Assigned agent still in TO; their email + lead row unchanged. House
  account is ADDED (CC + dashboard visibility), never substituted.

### B5 — Multi-tenant guarantee

  Aily's house account CC keys on Aily's tenants.default_agent_id
  (Ovais email); WALLiam's keys on King Shah's. Cross-tenant leak
  impossible — the SELECT default_agent_id WHERE id = tenantId is the
  tenant boundary.

### Companion TS fix

  app/api/admin-homes/leads/[id]/reassign-agent/route.ts builds a
  LeadEmailRecipients literal for its single-recipient reassign envelope.
  Added house_account: null for type completeness (this envelope does
  NOT recompute the CC — it's a direct hand-off to the newly-assigned
  agent, not a fresh lead-create flow).

### Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query (read-only, NO mutations):
    aily   — 7 OK (house account is Ovais; lead to non-house agent
            → Ovais CC computed; lead to Ovais himself → no self-CC;
            dashboard override fires for Ovais, NOT for other agents,
            NOT cross-tenant)
    walliam — 7 OK (same shape; King Shah CC; no self-CC; override
            scoped to WALLiam)
    TOTAL: 14 assertions PASS, 0 cross-tenant leak.
  T3 C12 regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11,
    L2.1). The leads-page tenant SELECT assertion in C10 broke on the
    default_agent_id addition (same brittle exact-string pattern as
    UNIT 3 hit on the agents page). Test updated to assertMatches() +
    regex pattern, intent preserved. 0 NEW C12 failures.

### Files (this commit)

  lib/admin-homes/lead-email-recipients.ts            (B1)
  lib/admin-homes/scope.ts                             (B2)
  app/admin-homes/leads/page.tsx                       (B3)
  app/api/admin-homes/leads/[id]/reassign-agent/route.ts  (TS fix)
  scripts/test-c10-multitenant-regression.js           (test fix)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md             (this run-log)

### Backups (timestamps)

  lib/admin-homes/lead-email-recipients.ts.backup_20260625_104857
  lib/admin-homes/scope.ts.backup_20260625_104857
  app/admin-homes/leads/page.tsx.backup_20260625_104857
  app/api/admin-homes/leads/[id]/reassign-agent/route.ts.backup_20260625_105126
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_105342 (pre-this-entry)

### Open follow-ups

- Reassign-agent route (app/api/admin-homes/leads/[id]/reassign-agent/
  route.ts) builds a single-recipient envelope manually and stamps
  house_account: null. A future polish unit could call
  getLeadEmailRecipients to recompute the full chain (including the
  house-account CC) on reassign — matches the lead-create paths. Out
  of scope for UNIT 8B.
- Live operator click-test on aily.ca after push:
  - Submit a lead to a non-house-account agent (territory-routed): assert
    Ovais appears in CC on the chain email AND sees the lead in
    /admin-homes/leads.
  - Submit a lead to an UNASSIGNED scope (resolves to Ovais): assert ONE
    email, ONE lead, no self-CC.

### Commit gate

  PART 0 ownership: COMPUTE-met (no code change).
  PART B build: 4 app files + 1 test fix + tracker shipped together
  (live-tracker rule). NO prod DB writes in this unit. HOLD push.

---

## W-HOUSE-ACCOUNT UNIT 9 RUN-LOG (2026-06-25) — full branch-copy + top-layer + opt-out

Goal: extend UNIT 8B's house-account oversight into a complete copy model:
EVERY ancestor in the assigned agent's parent_id branch gets the lead/email
(closes multi-manager-stack gap); the top layer (tenant owner + assistants
+ house account) is always copied; opt-out (jsonb flag, tenant-admin-only
write) drops an agent from both the copy chain AND assignable-agents UI.
No schema migration — uses the existing agents.notification_preferences
jsonb column.

### R1-R3 recon findings

  R1 — walkHierarchy (lib/admin-homes/hierarchy.ts:36-89) ALREADY returns
       chain.ancestors: { id, role }[] — the full ancestor chain self->up
       to row-root (parent NULL or tenant_admin reached). 6-hop cap, cycle-
       safe. Current lead-email-recipients uses only the 3 named slots
       (manager_id/area_manager_id/tenant_admin_id) → multi-manager stacks
       drop the 2nd+ manager. Real data has zero multi-manager chains
       today, so this is forward-compat.
  R2 — agents.role CHECK constraint: agent | manager | area_manager |
       tenant_admin | admin. NO 'assistant' role exists today. Assistant
       leg is forward-compat (query returns 0 rows). Probe confirms
       tenant_admin owner == default_agent_id (house account) for BOTH
       Aily and WALLiam.
  R3 — agents.notification_preferences jsonb default '{}' ALREADY EXISTS
       (single column, per-agent, tenant-scoped via the agent row). NO
       schema migration needed. Sub-key oversight_opt_out: boolean is
       the home for both cards + leads/email opt-out.

### Path chosen — branch walk + top-layer queries + jsonb opt-out + perm gate

  NO HARD GATE. NO schema change. NO migration. Three surface changes:
    1. lib/admin-homes/lead-email-recipients.ts: iterate chain.ancestors;
       add tenant_owner + assistants queries; filter opt-outs everywhere
       except the TO (owner) leg.
    2. app/api/admin-homes/agents/[id]/route.ts: accept
       notification_preferences in PUT body; gate writes (tenant_admin /
       admin / platform_admin / assistant only); shallow-merge with prior
       prefs so callers can set a single sub-key without wiping the blob.
    3. app/api/admin-homes/territory/agents-summary/route.ts: post-filter
       the assignable-agents response to exclude oversight_opt_out=true
       agents from the dropdowns.

### B1 — branch walk + top-layer (lib/admin-homes/lead-email-recipients.ts)

  + AgentEmailRow type extended with notification_preferences.
  + New isOptedOut(row) predicate — true when row.notification_preferences
    .oversight_opt_out === true.
  + LeadEmailRecipients.resolved gains three diagnostic fields:
    branch_ancestors (extra ancestors beyond the named slots),
    tenant_owner, assistants.
  + Ancestor batch fetch now selects notification_preferences and reads
    EVERY chain.ancestors[*] id (not just manager_id/area_manager_id/
    tenant_admin_id). Named slots preserve the existing CC/BCC tier
    semantics. Additional ancestors -> branch_ancestors -> BCC. All
    opt-outs filtered.
  + New tenant-scoped query for top layer:
      SELECT ... FROM agents WHERE tenant_id=$1 AND is_active=true
        AND role IN ('tenant_admin', 'assistant')
    Tenant owner = role='tenant_admin' AND parent_id IS NULL.
    Assistants = role='assistant' (forward-compat; 0 rows today).
    Opt-outs filtered; self-copy skipped when raw.id === assignedAgentId.
  + Existing house-account section (UNIT 8B) also gains opt-out filter.
  + Assembly order: TO=agent | CC=manager (named slot) + house_account
    | BCC=area_manager + tenant_admin + branch_ancestors + tenant_owner
    + assistants + delegates + platform managers + platform admins.
  + Cross-list dedupe from UNIT 8B preserved: CC and TO win over BCC.
    Owner Ovais (who is simultaneously tenant_admin named-slot BCC,
    tenant_owner BCC, AND house_account CC for Aily) appears in CC
    exactly once.

### B3 — write-permission gate (app/api/admin-homes/agents/[id]/route.ts)

  + Destructure adds notification_preferences from body.
  + Type guard: must be a plain object (not null/array).
  + Permission gate: user.isPlatformAdmin OR user.role === 'admin' OR
    user.position === 'tenant_admin' OR user.position === 'assistant'.
    Agents (position='agent'/'managed'/'manager'/'area_manager'/'support')
    get 403 with friendly message directing them to a tenant admin.
  + Shallow-merge with prior notification_preferences via separate read +
    spread; preserves any unrelated sub-keys callers haven't touched.

### B3 (b) — assignable-agents UI filter (app/api/admin-homes/territory/
                                          agents-summary/route.ts)

  + Post-filter the territory_agents_summary RPC output: query
    notification_preferences for the returned agent ids; build optOutIds
    Set; drop those from the response.
  + Opt-out agents disappear from CardsView's "All agents" filter dropdown,
    CardsView's "Reassign to" picker, and GeographyView's CarveUpModal
    agent picker. They remain in the DB; tenant_admin can un-opt-out.

### B4 — no regression for the assigned agent

  Assigned agent (TO) is the lead OWNER, not a copy target. Opt-out does
  NOT apply to TO. The assigned agent gets their lead + email exactly as
  today. Copies are ADDED on top.

### B5 — multi-tenant

  All queries scoped to tenantId param: tenant-owner query .eq('tenant_id'),
  top-layer query .eq('tenant_id'), house-account read .eq('id', tenantId).
  Aily's chain never includes WALLiam agents; cross-tenant leak impossible.

### Companion TS fix

  app/api/admin-homes/leads/[id]/reassign-agent/route.ts builds a
  LeadEmailRecipients literal. Added branch_ancestors:[], tenant_owner:
  null, assistants:[] for type completeness (the single-recipient reassign
  envelope does not recompute the full chain — same pattern as UNIT 8B).

### Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query (SAVEPOINT-isolated; NO permanent mutation): 26 PASS
     Scenario 1 (Aily Agent under Manager under Ovais):
       - walker returns 2 ancestors (Manager + Ovais)
       - branch emails contains Manager AND Ovais
       - tenant_owner = Ovais; house_account = Ovais (will dedupe to CC)
     Scenario 2 (Aily Manager, no manager above):
       - walker returns 1 ancestor (Ovais)
       - top-layer still copied
     Scenario 3 (Aily lead to Ovais himself — unassigned scope):
       - walker returns 0 ancestors (parent_id NULL)
       - tenant_owner + house_account both null (self-copy skipped)
     Scenario 4 (opt out Manager mid-chain):
       - Manager email NOT in branch; walker still TRAVERSES through
         (skips them from copy, doesn't sever the chain above)
       - Ovais still copied (opt-out below does NOT cut off ancestors)
     Scenario 5 (opt out the house account itself):
       - house_account CC null; tenant_owner BCC null
       - branch Manager still copied
     Scenario 6 (WALLiam parity):
       - King Shah resolved as both tenant owner + house account
       - Ovais NOT in WALLiam chain (cross-tenant leak guard)
     Scenario 7 (agents-summary filter):
       - opted-out Manager in optIds; non-opted-out agents NOT in optIds
     Post-check on fresh connection: oversight_opt_out=false for all
     probe-targeted agents. No persistent mutation.
  T3 C12 regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11, L2.1).
     0 NEW fails.

### Files (this commit)

  lib/admin-homes/lead-email-recipients.ts                          (B1)
  app/api/admin-homes/agents/[id]/route.ts                          (B3 perm)
  app/api/admin-homes/territory/agents-summary/route.ts             (B3 UI filter)
  app/api/admin-homes/leads/[id]/reassign-agent/route.ts            (TS completeness)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                          (this run-log)

### Backups (timestamps)

  lib/admin-homes/lead-email-recipients.ts.backup_20260625_111800
  app/api/admin-homes/agents/[id]/route.ts.backup_20260625_111800
  app/api/admin-homes/territory/agents-summary/route.ts.backup_20260625_111800
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_114452 (pre-this-entry)

### Open follow-ups

- Settings/UI surface to TOGGLE oversight_opt_out per agent. The
  permission gate + storage are wired; an admin UI affordance (a checkbox
  on the agent edit modal, restricted by the existing user.position check
  client-side) is the next visible-feature unit. Today, opt-out can be
  set programmatically via PUT /api/admin-homes/agents/[id] with body
  { notification_preferences: { oversight_opt_out: true } } from a
  tenant_admin session.
- assistant role: when Phase 3 admin_assistant migration lands, the
  agents.role CHECK gains 'assistant' and the top-layer query starts
  returning rows automatically — no code change required here.
- Reassign-agent route still doesn't recompute the full UNIT 9 chain on
  hand-off (carried from UNIT 8B follow-up); a future polish unit wires
  it through getLeadEmailRecipients so the new agent's chain (including
  branch ancestors + top layer + house-account) gets a copy on reassign.
- Live operator click-test on aily.ca after push:
  - Submit a lead to Agent (Aily) → assert Manager + Ovais BOTH in the
    chain email; Ovais also visible in /admin-homes/leads.
  - Set oversight_opt_out=true on Manager via PUT (tenant_admin
    session) → repeat the lead submit → Manager dropped from CC/BCC.
  - Attempt the same PUT from a non-admin session → 403.

### Commit gate

  4 app files + tracker shipped together (live-tracker rule). NO prod DB
  writes in this unit. HOLD push pending operator instruction.

---

## W-HOUSE-ACCOUNT UNIT 10 RUN-LOG (2026-06-25) — opt-out UI toggle

Goal: surface UNIT 9's `notification_preferences.oversight_opt_out` flag in
EditAgentModal as a tenant_admin/assistant-only toggle. Storage + permission
gate already exist (UNIT 9: jsonb column + PUT route gate). This unit adds
the visible control — no schema change, no new write path.

### R1-R3 recon findings

  R1 — EditAgentModal.tsx is the admin edit surface, opened from
       AgentsManagementClient's row "Edit" button. Did NOT read or write
       notification_preferences. Has an existing styled toggle pattern
       (Agent Status, L162-172) to match for UX consistency.
  R2 — app/api/admin-homes/agents/[id]/route.ts PUT (Unit 9) already
       accepts notification_preferences, validates type, gates with
       `user.isPlatformAdmin || user.role === 'admin' || user.position
       === 'tenant_admin' || user.position === 'assistant'`, and
       shallow-merges with prior prefs. Request shape: { notification_
       preferences: { oversight_opt_out: true|false } }.
  R3 — Viewer role NOT currently available in AgentsManagementClient /
       EditAgentModal. Cleanest path: server computes a single boolean
       (canSetOversightOptOut) on the agents page and threads it through
       to the modal. Multi-tenant by construction (derived from viewer's
       own session).

### B-thread (3 files)

  app/admin-homes/agents/page.tsx
    + canSetOversightOptOut: boolean — mirror of Unit 9 PUT route gate.
    + Passed to AgentsManagementClient as a new prop.

  components/admin-homes/AgentsManagementClient.tsx
    + Accepts canSetOversightOptOut?: boolean (default false — safe for
      callers like cockpit PeopleTab that haven't threaded it yet).
    + Forwarded to EditAgentModal at mount.

  components/admin-homes/EditAgentModal.tsx
    + Props extended with canSetOversightOptOut?: boolean (default false).
    + formData.oversight_opt_out: boolean added.
    + loadAgent() derives oversight_opt_out from
      a.notification_preferences?.oversight_opt_out === true (default
      false when prefs blob missing or key absent).
    + handleSubmit() includes notification_preferences in the PUT body
      ONLY when canSetOversightOptOut is true. Non-admin saves don't even
      attempt the gated update (server is the backstop).
    + New toggle UI: amber-bordered card matching the existing Agent
      Status toggle style. Label "Oversight copies", helper text "When
      ON, this agent receives copies of leads/emails for their branch
      and appears in assignable territory dropdowns." Annotated "Only
      tenant admins and assistants can change this." Switch is inverted
      (checked = receiving = opt_out false) for natural read.
    + Rendered ONLY when canSetOversightOptOut === true. Non-admin
      viewers don't see a control they couldn't use.

### Multi-tenant guarantee

  canSetOversightOptOut is derived per-request from the VIEWER'S session
  (user.isPlatformAdmin / user.role / user.position). The PUT route
  separately scopes to the agent's own tenant via the existing permissions
  layer. No tenant ids or names in the new render code. Tenant #3 zero-
  change.

### Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query (SAVEPOINT-isolated; no persistent mutation):
    Scenario 1 (viewer-role gate matrix, 6 OK):
       platform admin → can set
       tenant_admin → can set
       assistant → can set (forward-compat)
       manager → cannot set
       agent → cannot set
       unauthenticated → cannot set
    Scenario 2 (PUT shallow-merge round-trip, 1 OK):
       Setting { oversight_opt_out: true } via shallow merge persists
       correctly.
    Scenario 3 (re-toggle, 1 OK):
       Setting it back to false persists correctly.
    Scenario 4 (loadAgent boolean derivation, 2 OK):
       reads oversight_opt_out=true when set; defaults to false when
       jsonb key absent.
    Post-check (fresh connection): notification_preferences = {} on the
    probe-target agent (Aily Manager). No persistent mutation.
    TOTAL: 10 assertions PASS.
  T3 C12 regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11, L2.1).
    0 NEW fails.

### Files (this commit)

  app/admin-homes/agents/page.tsx                       (boolean compute + pass)
  components/admin-homes/AgentsManagementClient.tsx     (prop forward)
  components/admin-homes/EditAgentModal.tsx             (toggle render + PUT wire)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md              (this run-log)

### Backups (timestamps)

  app/admin-homes/agents/page.tsx.backup_20260625_142017
  components/admin-homes/AgentsManagementClient.tsx.backup_20260625_142017
  components/admin-homes/EditAgentModal.tsx.backup_20260625_142017
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_142508 (pre-this-entry)

### Open follow-ups

- Cockpit PeopleTab table view: AgentsManagementClient is also mounted
  inside cockpit/tabs/PeopleTab.tsx. Cockpit's mount doesn't yet pass
  canSetOversightOptOut, so the toggle won't render in cockpit until the
  cockpit shell threads viewer role through. Standalone /admin-homes/
  agents works fully. Tracked alongside the existing UNIT 3
  tenantDefaultAgentId carry-over.
- Live operator click-test on aily.ca after push:
  - As tenant_admin (Ovais), open Agent (Aily) edit → toggle visible,
    reflects current state (Receiving). Uncheck → save → re-open and
    confirm shows Opted out.
  - As same viewer, open agents-summary dropdown elsewhere → Agent
    (Aily) NOT listed.
  - Submit a lead routed to a non-opted agent → Agent (Aily) should NOT
    receive copy.
  - Re-check the toggle → save → restored everywhere.
  - As a non-admin viewer (in a future tenant where one exists), the
    toggle should NOT render in EditAgentModal.

### Commit gate

  3 app files + tracker shipped together (live-tracker rule). NO prod DB
  writes in this unit. HOLD push pending operator instruction.

---

## W-TENANT-ASSISTANT UNIT 11 RUN-LOG (2026-06-25) — assistant role live

Goal: stand up the Tenant Assistant role end-to-end. agents.role CHECK
gains 'assistant'; AddAgentModal offers it; agents-summary filters out
unlicensed assistants from the card-eligible dropdown. UNIT 9's existing
lead-email leg (which queries role='assistant') activates automatically
the moment any assistant exists.

### R1-R4 recon findings

  R1 — agents.role CHECK before UNIT 11:
       CHECK ((role = ANY (ARRAY['agent','manager','area_manager',
       'tenant_admin','admin'])))
       'assistant' was NOT in the constraint; UNIT 9's
       .in('role', ['tenant_admin','assistant']) returned 0 rows because
       no agent CAN have role='assistant'.
  R2 — agents already has license_number (varchar). NO is_licensed boolean
       column. license_number is the operationally-correct credential
       field that brokerage compliance cares about. Recommendation:
       derive licensed-ness from license_number (no new column, single
       source of truth). Operator-approved on apply.
  R3 — lead-email-recipients.ts:240 queries
       .in('role', ['tenant_admin', 'assistant']) verbatim. Migration
       MUST add exactly 'assistant' (matches).
  R4 — AddAgentModal.tsx:43 type literal needs 'assistant'; agents POST
       route VALID_ROLES needs 'assistant'.

### HARD GATE — migration applied LIVE

  supabase/migrations/20260625_w_assistant_role.sql:
    ALTER TABLE agents DROP CONSTRAINT agents_role_check;
    ALTER TABLE agents ADD CONSTRAINT agents_role_check CHECK (
      role IN ('agent','manager','area_manager','tenant_admin','admin','assistant')
    );

  Applied via scripts/apply-assistant-role.js (deleted post-success per
  the one-shot pattern). Rollback snapshot:
    supabase/migrations/rollback-snapshots/
      _assistant-role_agents_role_check_2026-06-25T18-50-01-720Z.sql
  (apply-runner captured pg_get_constraintdef of the prior CHECK and
  wrote a restore script.)

  Apply-runner smoke probes (SAVEPOINT-isolated):
    SMOKE 1 PASS: role=assistant accepted by new CHECK.
    SMOKE 2 PASS: bogus role 'frobnicator' still rejected (CHECK is not
                  a wildcard).
    SMOKE 3 PASS: existing role=manager still accepted (existing valid
                  roles preserved as superset).
    SMOKE 4 PASS: validate_house_account trigger STILL rejects assistant
                  as house account (intentional — assistants aren't the
                  legal floor; house account must be agent / manager /
                  area_manager / tenant_admin / admin).

  Post-sanity: Aily 3 active + WALLiam 3 active role distribution
  byte-identical to pre-state. No row mutated.

### NO is_licensed boolean column — licensed-ness derived from license_number

  Decision: skip the optional is_licensed boolean column.
    - license_number already exists on agents (varchar, nullable).
    - It IS the credential brokerage compliance cares about.
    - Single source of truth — no drift risk between two columns.
    - "Licensed" = role !== 'assistant' OR
      (license_number IS NOT NULL AND length(trim(license_number)) > 0).
    - All normal agents (role != 'assistant') stay card-eligible
      regardless of license_number — operator's locked rule: "All normal
      agents are licensed by definition; no license field/check for them."

### B1 — Assistant role surfaces in create modal + server allow-list

  components/admin-homes/AddAgentModal.tsx
    + role type literal extended to include 'assistant'.
    + Role <select> gains <option value="assistant">Tenant Assistant.
    + Conditional helper text when role=assistant: "Assistant always
      receives lead/email copies. Card-eligible only when license
      number is filled below."

  app/api/admin-homes/agents/route.ts (POST handler)
    + VALID_ROLES tuple extended to include 'assistant'.

  EditAgentModal.tsx — UNCHANGED: role isn't editable post-create today.
    Future polish: allow role change with appropriate guards
    (W-TENANT-ASSISTANT follow-up).

### B2 — Card eligibility: unlicensed assistant excluded from dropdown

  app/api/admin-homes/territory/agents-summary/route.ts
    + Existing UNIT 9 opt-out filter extended:
      - prefs query now also reads role + license_number
      - new unlicensedAssistantIds Set: agents where role='assistant'
        AND length(trim(license_number || '')) === 0
      - .filter(a => !unlicensedAssistantIds.has(a.agent_id))
    + CardsView's "All agents" filter dropdown, CardsView's Reassign
      destination picker, and GeographyView's CarveUpModal "assign to
      agent" picker all hide unlicensed assistants. Licensed assistants
      and all non-assistant agents continue to show normally.

### B3 — Lead/email leg auto-activates (no code change)

  UNIT 9's lib/admin-homes/lead-email-recipients.ts already queries
  role='assistant' as a top-layer copy recipient (lines 239-256). The
  moment any agent is created/updated with role='assistant', that leg
  starts returning rows. License is NOT a factor for the copy leg —
  unlicensed assistants STILL receive lead/email copies (operator's
  locked rule: "Leads/emails flow to the Tenant Assistant REGARDLESS
  of license — core of the role").

### B4 — Multi-tenant guarantee

  All filters keyed on tenant_id scope inherited from the agents-summary
  RPC tenant resolution. No tenant ids in render code. Tenant #3 zero-
  change — onboarding a tenant and creating an assistant in their
  workspace works without code touching this unit.

### Companion TS fix

  lib/admin-homes/permissions.ts: DbRole type literal extended to
  include 'assistant'. Comment notes: assistants are NOT in Tier 4
  admin tier — can() decisions treat assistant as a non-admin tier.
  Admin-style powers (opt-out toggle, house-account picker) are gated
  on AdminHomesUser.position === 'assistant' separately (UNITs 9/10
  already enforced this; position was already in AdminHomesPosition).

### Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query (SAVEPOINT-isolated; NO permanent mutation): 17 PASS
     Scenario 1 (pre-state): Aily had no assistants pre-test.
     Scenario 2 (licensed assistant on Aily):
       - INSERT role='assistant' + license_number='LIC-12345' accepted
       - assistant APPEARS in agents-summary assignable dropdown
       - assistant in top-layer lead/email copy chain
     Scenario 3 (unlicensed assistant on Aily):
       - INSERT role='assistant' + license_number=NULL accepted
       - assistant ABSENT from agents-summary dropdown
       - assistant STILL in copy chain (license irrelevant for copy)
       - BOTH assistants (lic + unlic) coexist in copy chain
     Scenario 4 (empty-string license): whitespace-only license_number
       treated as unlicensed (.trim() check fires).
     Scenario 5: validate_house_account trigger STILL rejects assistant
       as house account (even when licensed). Phase-1 contract intact.
     Scenario 6 (opt-out interaction): opted-out licensed assistant
       drops from BOTH dropdown AND copy chain. UNITs 9/10 + UNIT 11
       compose correctly.
     Scenario 7 (WALLiam parity + cross-tenant leak):
       - WALLiam assistant in WALLiam dropdown + chain
       - WALLiam assistant NOT in Aily dropdown / chain
       - Aily assistant NOT in WALLiam dropdown / chain
     Post-check (fresh connection): 0 assistants persisted. ROLLBACK
     clean.
  T3 C12 regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11,
     L2.1). 0 NEW fails.

### Files (this commit)

  supabase/migrations/20260625_w_assistant_role.sql                   (DDL, applied)
  components/admin-homes/AddAgentModal.tsx                            (B1 UI)
  app/api/admin-homes/agents/route.ts                                 (B1 server allow-list)
  app/api/admin-homes/territory/agents-summary/route.ts               (B2 license filter)
  lib/admin-homes/permissions.ts                                      (TS DbRole)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                            (this run-log)
  supabase/migrations/rollback-snapshots/
    _assistant-role_agents_role_check_2026-06-25T18-50-01-720Z.sql

### Backups (timestamps)

  components/admin-homes/AddAgentModal.tsx.backup_20260625_145039
  components/admin-homes/EditAgentModal.tsx.backup_20260625_145039     (read for ref; no edit this unit)
  app/api/admin-homes/agents/route.ts.backup_20260625_145039
  app/api/admin-homes/territory/agents-summary/route.ts.backup_20260625_145039
  lib/admin-homes/permissions.ts.backup_20260625_145311
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_145536 (pre-this-entry)

### Open follow-ups

- EditAgentModal does NOT currently let viewers change role (e.g.
  promote agent → assistant). Out of scope here; future polish unit
  could allow role edit with appropriate guards (cross-role permission
  implications need design).
- Cockpit PeopleTab table view: AddAgentModal mount through cockpit
  would expose the assistant option there too (already works, since
  cockpit re-uses AgentsManagementClient + AddAgentModal). No cockpit-
  specific change needed.
- Permissions ladder for assistant role in can() decisions: today
  assistants fall through as a non-admin tier in can() because they're
  not in Tier 4 ('tenant_admin' OR 'admin'). The specific admin-style
  powers assistants have (opt-out toggle, house-account picker) are
  gated on position='assistant' separately. If future work needs
  assistants to write specific resources via can(), extend the
  permission ladder explicitly — out of scope here.
- Live operator click-test on aily.ca after push:
  - As tenant_admin (Ovais), open Add Agent → "Tenant Assistant" option
    visible; create one WITH license number → confirm appears in
    CardsView's "All agents" + reassign picker AND in lead copy chain
    next time a lead routes to a non-house Aily agent.
  - Create another WITHOUT license number → confirm absent from
    CardsView dropdowns but still in lead copy chain.
  - Multiple assistants coexist; both copied; deduped; no self-CC if
    assistant IS the assigned agent.

### Commit gate

  5 app/server files + tracker shipped together (live-tracker rule).
  DDL applied live. HOLD push pending operator instruction.

---

### UNIT 11 SAME-DAY FIX (2026-06-25) — remove license-based card-eligibility gating

CORRECTION: the initial UNIT 11 commit (3663749, not yet pushed) added a
license_number filter to app/api/admin-homes/territory/agents-summary/
route.ts that hid assistants WITHOUT a license_number from card/territory
dropdowns. Operator clarified that license-vs-not is NOT modeled by the
system — every role is a licensed trade by design. The filter was
incorrect and is removed.

What this FIX changes (3 files, all in 3663749's diff, app-layer only):

  app/api/admin-homes/territory/agents-summary/route.ts
    - REMOVED: unlicensedAssistantIds Set + the role + license_number
      SELECT + the .filter(a => !unlicensedAssistantIds.has(a.agent_id))
      line + the surrounding "card-eligible only when licensed" comment.
    - KEPT: UNIT 9 oversight_opt_out filter (unchanged).
    Result: assistants appear in territory dropdowns like any other role.

  components/admin-homes/AddAgentModal.tsx
    - REMOVED: the "Licensed assistant ... card-eligible only when license
      number is filled below" helper text + the comment block claiming
      "Licensed = card-eligible; unlicensed = lead/email copies only".
    - KEPT: the <option value="assistant">Tenant Assistant option (with
      a refreshed neutral comment) + the role type literal addition.

  lib/admin-homes/permissions.ts
    - REWORDED the DbRole comment to drop "card-eligible only when
      licensed (Unit 11 agents-summary filter)" and replace with
      "card-eligible like any other role (no license gate; the operator
      rejected license-vs-not modeling)".

What stays from UNIT 11 unchanged (preserved by the FIX):
  - DDL: agents.role CHECK gains 'assistant' (correct, kept live).
  - AddAgentModal: 'assistant' selectable in role dropdown.
  - POST route: VALID_ROLES includes 'assistant'.
  - DbRole TS literal includes 'assistant'.
  - UNIT 9 lead/email copy leg auto-activates when assistants exist
    (unchanged — assistant always copied regardless of any field).
  - validate_house_account trigger STILL rejects assistant as house
    account (Phase 1 contract intact).
  - UNIT 10 opt-out toggle works on assistants too (composes correctly).
  - Multiple assistants per tenant supported.
  - Multi-tenant: no cross-tenant leak.

### FIX Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query (SAVEPOINT-isolated, NO permanent mutation): 10 PASS
     Scenario 1: assistant WITH license_number → in dropdown
     Scenario 2 (THE FIX): assistant WITHOUT license_number → NOW in
       dropdown (pre-FIX broken behavior would have hidden it; assertion
       proves both the FIX surfaces them AND that the pre-FIX logic
       would have filtered)
     Scenario 3: assistant with whitespace-only license_number → ALSO
       in dropdown (no license check anywhere now)
     Scenario 4: all 3 assistants in Unit 9 copy chain (license
       irrelevant for copy — unchanged)
     Scenario 5: validate_house_account STILL rejects assistant as
       house account (licensed or not — Phase 1 contract intact)
     Scenario 6: opt-out interaction unchanged (Unit 10 still drops
       opted-out assistant from BOTH dropdown AND copy chain)
     Scenario 7: WALLiam unlicensed assistant in WALLiam dropdown,
       NOT in Aily dropdown (cross-tenant clean)
     Post-check (fresh connection): 0 assistants persisted.
  T3 C12: 17/20 baseline, 0 new fails.

### Files (this FIX commit, on top of 3663749)

  app/api/admin-homes/territory/agents-summary/route.ts   (filter removed)
  components/admin-homes/AddAgentModal.tsx                (helper text removed)
  lib/admin-homes/permissions.ts                          (comment reworded)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                (this correction)

### Backups (timestamps, FIX)

  app/api/admin-homes/territory/agents-summary/route.ts.backup_20260625_151302
  components/admin-homes/AddAgentModal.tsx.backup_20260625_151302
  lib/admin-homes/permissions.ts.backup_20260625_151302
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_151537 (pre-FIX-correction)

### Commit gate

  FIX ships as a follow-up commit on top of 3663749 (both held; neither
  pushed yet). After approval, both commits push together. HOLD push.

---

## W-COCKPIT-PARITY UNIT 12 RUN-LOG (2026-06-25) — close 3 carried cockpit gaps

Goal: bring the cockpit People tab to feature parity with the standalone
/admin-homes/agents route. Three carried follow-ups (UNIT 3 owner header
+ Crown pill, UNIT 10 opt-out toggle, UNIT 3 tenantDefaultAgentId
thread-through) share one root cause: cockpit's PeopleTab/CockpitShell
didn't thread the props the standalone route already passes. Closed by
wiring the same props through cockpit's mount chain.

### R1-R3 recon findings

  R1 — standalone-only props the cockpit lacked:
       - tenantDefaultAgentId (UNIT 3, drives owner header + Crown pill)
       - canSetOversightOptOut (UNIT 10, gates opt-out toggle render)
  R2 — cockpit server page (app/admin-homes/tenants/[id]/page.tsx)
       already has the data:
       - tenant row loaded via SELECT * → default_agent_id available
       - resolveAdminHomesUser() → user.role + user.position +
         user.isPlatformAdmin all available, same as standalone uses
  R3 — components already accept the props (UNITs 3, 7, 10 work):
       - AgentsManagementClient: tenantDefaultAgentId? +
         canSetOversightOptOut? (both optional, safe falsy defaults)
       - EditAgentModal: canSetOversightOptOut?
       - AgentOrgChart: gets default_agent_id via its own
         /api/admin-homes/agents/tree-data fetch (UNIT 2 baked-in)
       → wiring, not rebuilding

### B-thread (3 files)

  app/admin-homes/tenants/[id]/page.tsx
    + tenantDefaultAgentId={tenant.default_agent_id || null} added to
      CockpitShell props (no new query — value already in fetched row).
    + canSetOversightOptOut: derived inline as
      user.isPlatformAdmin === true
      || user.role === 'admin'
      || user.position === 'tenant_admin'
      || user.position === 'assistant'
      (mirror of standalone /admin-homes/agents page.tsx UNIT 10 logic).

  components/admin-homes/cockpit/CockpitShell.tsx
    + CockpitShellProps gains tenantDefaultAgentId?: string | null
      and canSetOversightOptOut?: boolean (both optional with safe
      falsy defaults for backward-compat with any other caller).
    + CockpitInner destructures + forwards them to PeopleTab in the
      'people' tab render branch only.

  components/admin-homes/cockpit/tabs/PeopleTab.tsx
    + MountProps gains tenantDefaultAgentId? + canSetOversightOptOut?.
    + Forwarded to <AgentsManagementClient> in the 'table' view branch.
    + AgentOrgChart needs no change — its tree-data fetch already
      returns default_agent_id (UNIT 2).

### B4 — multi-tenant

  Both new props are derived from cockpit page's tenant fetch +
  resolveAdminHomesUser session. No hardcoded tenant ids or per-tenant
  branches. Tenant #3 zero-change — onboarding a tenant gives the
  cockpit page the correct default_agent_id automatically.

### What now renders in cockpit People tab (parity with standalone)

  - Owner header (purple-bordered card above stats grid) showing the
    tenant_admin owner with the House Account pill when they hold the
    default_agent_id (UNIT 3 logic, now lit up via the thread-through).
  - Crown pill on the holder's row in the agents table (UNIT 3).
  - Opt-out toggle in EditAgentModal for tenant_admin / assistant /
    admin / platform_admin viewers ONLY (UNIT 10 + permission gate).
  - All UNIT 11 (assistant role) + UNIT 9 (copy chain) behavior already
    flowed through cockpit; this just lights up the surfaces that were
    missing their context props.

### Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query (read-only, NO mutations): 11 assertions PASS
     Cockpit page can derive tenantDefaultAgentId for Aily (Ovais) +
       WALLiam (King Shah) from the existing tenant SELECT.
     Viewer-role gate matrix (mirror of UNIT 10 logic, now applied at
       cockpit): platform admin / tenant_admin / assistant → toggle
       visible; manager / agent / unauthenticated → hidden.
     Multi-tenant safety: Aily.default_agent_id != WALLiam's, each
       cockpit page passes its OWN value.
  T3 C12 regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11,
     L2.1). 0 NEW fails.

### Files (this commit)

  app/admin-homes/tenants/[id]/page.tsx                      (derive + pass)
  components/admin-homes/cockpit/CockpitShell.tsx            (accept + forward)
  components/admin-homes/cockpit/tabs/PeopleTab.tsx          (accept + forward)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                   (this run-log)

### Backups (timestamps)

  app/admin-homes/tenants/[id]/page.tsx.backup_20260625_153227
  components/admin-homes/cockpit/CockpitShell.tsx.backup_20260625_153227
  components/admin-homes/cockpit/tabs/PeopleTab.tsx.backup_20260625_153227
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_153703 (pre-this-entry)

### Carried follow-ups CLOSED by this unit

  - UNIT 3 follow-up: "Cockpit table view Crown parity" → CLOSED
  - UNIT 10 follow-up: "Cockpit PeopleTab toggle render" → CLOSED
  - UNIT 11 follow-up: "Cockpit PeopleTab assistant role" — already
    auto-worked since UNIT 11 changes are component-internal; UNIT 12
    just makes the new context (owner pill, opt-out toggle) appear in
    cockpit too, which the operator's intent for UNIT 11 implied.

### Open follow-ups

- EditAgentModal still doesn't allow role edit post-create (carried
  from UNIT 11; out of scope).
- Live operator click-test on aily.ca cockpit after push:
  - /admin-homes/tenants/<aily-id>/ → People tab → Table view
  - Owner header visible (Ovais, purple card, Crown badge).
  - Crown pill on Ovais's row in the table.
  - Click Edit on any Aily agent → opt-out toggle visible (operator
    is tenant_admin / platform_admin).
  - WALLiam cockpit: same structure, King Shah surfaces correctly.

### Commit gate

  3 app files + tracker shipped together (live-tracker rule). NO prod DB
  writes in this unit. HOLD push pending operator instruction.

---

## W-HOUSE-ACCOUNT UNIT 13 RUN-LOG (2026-06-25) — inline list-row "Set as house account"

Goal: assign the house account directly from the agents list row (and the
cockpit People table view, via the shared component). Until UNIT 13, the
ONLY assignment surface was the org-chart drawer (UNIT 2, standalone
/agents/tree route). UNIT 3 + UNIT 12 surfaced the House Account pill on
the list, but you couldn't SET it there. Closed by adding a per-row action
that reuses the same validated PATCH path (Phase 1 Part 2).

### R1-R3 recon findings

  R1 — AgentsManagementClient.tsx row Actions cell (L284-307) has
       Edit / Assign / (cond) Add Agent / (cond nested) Remove / Delete.
       Each row has agent.id + agent.role + agent.full_name. The
       component already receives:
         tenantId (page-level)
         tenantDefaultAgentId (UNIT 3 standalone, UNIT 12 cockpit)
         canSetOversightOptOut (UNIT 10 standalone, UNIT 12 cockpit)
       → all data needed for the action is already in scope.
  R2 — PATCH /api/admin-homes/tenants/[tenantId] with body
         { default_agent_id: agentId }
       From Phase 1 Part 2 + UNIT 1. App-layer validates 4 conditions
       then validate_house_account trigger backstops. Reused as-is; no
       new endpoint.
  R3 — Same viewer set as opt-out (operator confirmed). Reuse the
       canSetOversightOptOut boolean (predicate identical:
       tenant_admin / assistant / admin / platform_admin). Server PATCH
       is the security backstop; this gates UI render only.

### B1 — row action (components/admin-homes/AgentsManagementClient.tsx)

  + New top-level handler setAsHouseAccount(targetAgentId, name):
      - confirm() prompt
      - PATCH /api/admin-homes/tenants/[tenantId] { default_agent_id }
      - On success: window.location.reload() to move the pill
      - On 400: surface the friendly message inline via alert()
        (matches the existing remove/delete handler pattern)

  + New row-action element (per-row, in the Actions cell, between
    Assign and Add Agent):
      Conditional render: canSetOversightOptOut AND tenantId AND
        agent.role !== 'assistant'
        ↓
      If tenantDefaultAgentId === agent.id:
        amber "Current house account" disabled span (matches drawer UX)
      Else:
        amber outlined "Set as house" button → setAsHouseAccount()
      Else (any condition false): nothing rendered.

### B2 — "Current" label on holder's row (mirrors UNIT 2 drawer)

  Same UX pattern as the org-chart drawer: the current holder shows a
  disabled "Current house account" pill where other rows show the
  button. No double-click-to-no-op possible.

### B3 — assistant UX decision: HIDE the action

  Per the recon report decision: assistants are barred from being house
  account by the validate_house_account trigger contract (Phase 1).
  Showing them a button that always returns 400 is confusing. HIDE the
  action entirely for assistant rows. If the operator wants the click-
  for-friendly-error UX instead, that's a single conditional flip in
  future polish.

### B4 — viewer permission gate

  Reuses canSetOversightOptOut (UNIT 10/12). Same admins; one less
  prop to thread. When the viewer can't set opt-out they also can't
  assign house account — matches the operator's "same admins" spec.

### B5 — multi-tenant + cockpit parity

  All values from row.id + page-threaded tenantId + tenantDefault. No
  hardcoded tenant. Works in standalone /admin-homes/agents AND
  cockpit /admin-homes/tenants/[id]/ People → Table view (cockpit
  already threads the same props via UNIT 12; no cockpit-specific
  code in this unit).

### Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query (read-only sim of conditional + Phase 1 PATCH
     validation): 10 assertions PASS
       Aily row visibility matrix:
         - Ovais (current house) → "Current" disabled
         - Manager (Aily) eligible non-house → enabled "Set as house"
         - Agent (Aily) eligible non-house → enabled "Set as house"
       Non-admin viewer → row action HIDDEN across all rows
       Synthesized assistant row → HIDDEN (B3 decision)
       Phase 1 PATCH validation surface (mirrored locally):
         - eligible Aily agent: PATCH would succeed
         - cross-tenant WALLiam agent: PATCH rejects "different tenant"
         - nonexistent uuid: PATCH rejects "Selected agent not found"
       WALLiam parity: King Shah "Current"; Neo/WALLiam enabled button
       Cross-tenant: each tenant manages its own house — clean
  T3 C12 regression: 17 PASS / 3 FAIL — same baseline. 0 NEW fails.

### Files (this commit)

  components/admin-homes/AgentsManagementClient.tsx        (row action + handler)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                 (this run-log)

### Backups (timestamps)

  components/admin-homes/AgentsManagementClient.tsx.backup_20260625_154345
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_154705 (pre-this-entry)

### Surfaces that can now assign the house account

  1. Standalone org-chart drawer (UNIT 2, /admin-homes/agents/tree)
  2. Settings → General picker — REMOVED in UNIT 5 (no longer a surface)
  3. Standalone agents list row action (THIS UNIT)
  4. Cockpit People → Table view row action (THIS UNIT via shared
     AgentsManagementClient component + UNIT 12 prop threading)

### Open follow-ups

- EditAgentModal still doesn't allow role edit post-create (carried
  from UNIT 11; out of scope).
- Future polish: a single Toast component instead of alert() for the
  PATCH-failure surface (current pattern matches the existing
  remove/delete handlers in the same file; consistent for now).
- Live operator click-test on aily.ca after push (both surfaces):
  - /admin-homes/agents: click "Set as house" on Manager (Aily) →
    confirm → pill moves to Manager + page reloads + Manager row
    shows "Current" / Ovais row shows the button.
  - /admin-homes/tenants/<aily-id>/ People → Table: same flow works.
  - As non-admin viewer, row action does NOT appear.

### Commit gate

  1 app file + tracker shipped together (live-tracker rule). NO prod DB
  writes in this unit. HOLD push pending operator instruction.

---

## W-AGENT-EDIT UNIT 14 RUN-LOG (2026-06-25) — role edit post-create

Goal: close the carried follow-up from UNIT 11 — let admin viewers change
an agent's role from EditAgentModal, with server-side guards so a careless
role change can't break the house account or orphan a manager's reports.
No schema change — agents.role CHECK already covers all roles (UNIT 11).

### R1-R3 recon findings

  R1 — EditAgentModal had no role field; PUT route did not accept role in
       its body destructure. Need to add both.
  R2 — Two invariants the role change can violate:
       (a) HOUSE-ACCOUNT-ELIGIBLE-ROLE: validate_house_account trigger
           (Phase 1, d39941f) requires role IN ('agent','manager',
           'area_manager','tenant_admin','admin'). 'assistant' is barred.
           The trigger fires only on tenants.default_agent_id writes, but
           a role change on the current house-account agent would put the
           tenant in a state where the trigger would block the NEXT
           house-account write — better to mirror the Phase 1 deactivate
           guard at the PUT route and BLOCK the role change up front.
       (b) ORPHAN-ON-DEMOTE: agents.role has no DB constraint linking it
           to parent_id, but operationally a leaf role (agent/assistant)
           with active reports is confusing. Lock: roles that can hold
           children = {tenant_admin, area_manager, manager}; roles that
           can't = {agent, assistant}. If the new role is in the can't
           set AND the agent has >=1 active child, BLOCK.
  R3 — Same admin set as opt-out: tenant_admin / assistant / admin /
       platform_admin. REUSE canSetOversightOptOut as the gate (UNITs 10/
       12/13). The boolean is now the canonical "tenant-agent admin
       authority" flag — gates opt-out toggle, set-house row action, AND
       role-edit select. Documented in the comment so future readers
       don't think it's only about opt-out.

### B1 — role select in EditAgentModal

  components/admin-homes/EditAgentModal.tsx
    + formData.role added (default 'agent'; type literal covers all 6
      VALID_ROLES including 'assistant').
    + loadAgent() reads a.role (fallback 'agent' defensively).
    + handleSubmit() sends body.role ONLY when canSetOversightOptOut
      (same gate as notification_preferences). Server PUT route is the
      backstop — non-admin saves don't even attempt the gated update.
    + New role <select> in Team Hierarchy section, rendered ONLY when
      canSetOversightOptOut === true. Options: Agent, Manager, Area
      Manager, Tenant Admin, Tenant Assistant. Helper text explains
      the server-side guards.

### B2 + B3 — server guards (app/api/admin-homes/agents/[id]/route.ts)

  PUT route extended with a role-change block after the destructure and
  the parent_id guard, before the email-changing pre-flight. Only fires
  when role !== undefined AND role !== target.role (avoids unnecessary
  work for no-ops).

  (a) Write gate: 403 if not (isPlatformAdmin || role==='admin' ||
      position==='tenant_admin' || position==='assistant'). Friendly
      message directs to a tenant admin.
  (b) Valid role: 400 if new role not in VALID_ROLES (server-side
      mirror of POST handler list — keeps client + server in lockstep).
  (c) HOUSE-ACCOUNT-ELIGIBLE guard: 400 if new role NOT in
      HOUSE_ELIGIBLE_ROLES (excludes 'assistant') AND this agent IS
      the tenant's current default_agent_id. Message: "Cannot change
      role: this agent is the house account, and the new role can't
      hold that responsibility. Assign a different house account
      first, then change the role." Mirrors Phase 1 Part 4 deactivate
      guard pattern.
  (d) ORPHAN-ON-DEMOTE guard: 400 if new role NOT in
      ROLES_THAT_CAN_HOLD_CHILDREN (agent + assistant are leaf-only)
      AND >=1 active agent has parent_id = this. Message includes the
      count: "Cannot change role: N active agent(s) report to this
      person. Reassign their reports first (Edit each report and
      change Reports To), then change the role."

  Server BLOCKS rather than auto-reparenting reports — auto-reparenting
  would need a target-parent decision the system can't make safely. The
  operator's reassign-each-then-retry flow is the predictable path.

### B4 — server is the only gate

  Client gate (UI render) is a UX nicety. Server PUT enforces all 4
  checks regardless of what the client sends. A non-admin attempting
  to PUT role via curl/fetch would still get 403.

### B5 — multi-tenant

  All guards keyed on agent's own tenant + viewer's role/position. No
  hardcoded tenants. WALLiam's King Shah block-on-→assistant works the
  same way as Aily's Ovais block, verified by guard.

### Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query (SAVEPOINT-isolated; NO permanent mutation): 16 PASS
     Scenario 1 (viewer gate): admin accepted, non-admin 403.
     Scenario 2 (happy path Aily Agent role changes): agent->manager,
        ->area_manager, ->assistant all accepted (no reports, not house).
     Scenario 3 (house guard): Ovais -> assistant BLOCKED with friendly
        message; Ovais -> tenant_admin no-op; Ovais -> manager allowed
        (manager IS house-eligible — orphan guard fires separately if
        reports exist).
     Scenario 4 (orphan guard): Manager (Aily, 1 report) -> agent
        BLOCKED with count message; -> area_manager allowed (can hold
        children); -> assistant BLOCKED (leaf + reports).
     Scenario 5 (invalid role value): 'frobnicator' -> 400.
     Scenario 6 (WALLiam parity): King Shah -> assistant BLOCKED;
        King Shah -> manager allowed (eligible + manager can hold his
        2 reports Neo + WALLiam).
     Post-check (fresh connection): Ovais.role still tenant_admin.
     No persistent mutation.
  T3 C12 regression: 17 PASS / 3 FAIL — same baseline. 0 NEW fails.

### Files (this commit)

  components/admin-homes/EditAgentModal.tsx           (role select + PUT wire)
  app/api/admin-homes/agents/[id]/route.ts             (4-check guard block)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md             (this run-log)

### Backups (timestamps)

  components/admin-homes/EditAgentModal.tsx.backup_20260625_155430
  app/api/admin-homes/agents/[id]/route.ts.backup_20260625_155430
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_155848 (pre-this-entry)

### canSetOversightOptOut now gates 3 things (documented)

  1. Opt-out toggle in EditAgentModal (UNIT 10)
  2. Set-as-house-account row action in agents list (UNIT 13)
  3. Role-select in EditAgentModal (THIS UNIT)
  Naming stays as-is to avoid renaming-churn across UNITs 10/12/13/14;
  the comment in the PUT route's role block notes the canonical use.

### Carried follow-up CLOSED

  - UNIT 11 follow-up: "EditAgentModal doesn't allow role edit" -> CLOSED

### Open follow-ups

- Toast vs alert() polish for PATCH/PUT failure messages (carried).
- Live operator click-test on aily.ca after push:
  - As Ovais (tenant_admin), open EditAgentModal on Agent (Aily) ->
    Role select visible -> change to manager -> save -> reload -> Agent
    now shows as manager in list/tree.
  - Open EditAgentModal on Manager (Aily) -> try change to agent ->
    save -> friendly inline error mentioning 1 report.
  - Open EditAgentModal on Ovais (himself) -> try change to assistant
    -> friendly inline error mentioning house account.
  - As non-admin viewer (if one exists), Role select does NOT render.

### Commit gate

  2 app files + tracker shipped together (live-tracker rule). NO prod DB
  writes in this unit. HOLD push pending operator instruction.

---

## W-TENANT-CREATE UNIT 15 RUN-LOG (2026-06-25) — auto-seed owner on tenant create

Goal: close the long-standing manual gap — when a platform admin creates
a new tenant, the OWNER (a real person) is collected as part of the form
and seeded as the first agent + house account in the same flow. No more
manual "Step 3" follow-up; no placeholder seeds (the retired Aily seed is
exactly what this prevents). Prerequisite for Phase 1b NOT NULL.

### R1-R3 recon findings

  R1 — AddTenantModal collected: name/domain/brand_name/admin_email +
       branding + AI/Plan/Estimator + Resend + analytics. Did NOT
       collect owner full_name or password. Post-create amber callout
       explicitly told operator to manually visit Agents and create a
       default — the exact step this unit automates.
  R2 — tenants POST never created an agent and never set
       default_agent_id. New tenants landed with default_agent_id = NULL
       until manually fixed.
  R3 — Agent creation mechanics in /api/admin-homes/agents POST:
         1. auth.admin.createUser({ email, password }) -> authUserId
         2. agents INSERT with id=authUserId
         3. teardownAuthUser on insert failure (W-AGENT-LIFECYCLE-INTEGRITY)
       Plus deriveUniqueAgentSubdomain helper. UNIT 15 inlines the same
       sequence in tenants POST (extracting a shared helper is out of
       scope; the inline pattern is small and readable).

### Decisions

  - Owner email REUSES admin_email (already on the form). Operator's
    mental model: "I'm creating a tenant; this person at this email is
    the owner." Adding a third email field would have introduced
    redundancy.
  - 2 NEW form fields: owner_full_name + owner_password (+ visual
    confirm). Both required by server; no placeholder defaults.
  - 4-step server flow with manual rollback (PG transactions can't span
    auth.admin):
      STEP 1: INSERT tenant
      STEP 2: auth.admin.createUser(email, password)
              On fail: DELETE tenant, return error
      STEP 3: INSERT agents row (role=tenant_admin, parent_id=NULL,
              tenant_id=new, is_active=true, can_create_children=true,
              title='Owner')
              On fail: teardownAuthUser + DELETE tenant
      STEP 4: UPDATE tenants SET default_agent_id = owner.id
              validate_house_account trigger validates (owner satisfies
              all 4 conditions: exists, tenant matches, active, role
              tenant_admin in eligible set).
              On fail (defensive): DELETE agent + teardownAuthUser +
              DELETE tenant
  - Smoke uses SAVEPOINT-isolated simulation: skips auth.admin.createUser
    (would persist outside the PG tx), uses generated UUID as agent id +
    NULL user_id (honors FK without writing to auth.users). NO HARD GATE
    needed — no persistent prod write.

### B1 — form (components/admin-homes/AddTenantModal.tsx)

  + formData: owner_full_name, owner_password, owner_password_confirm.
  + Client-side validation: password >= 8 chars, password === confirm,
    non-empty name. Friendly inline errors.
  + New "Tenant Owner (first agent + house account)" section in the
    Brand block, with helper text explaining the seed semantics.
  + POST body now sends owner_full_name + owner_password (admin_email
    re-used as owner email).
  + Post-create amber callout STEP 3 reworded: "Already seeded
    automatically — the owner you entered is now this tenant's
    tenant_admin root agent and house account."

### B2 — server (app/api/admin-homes/tenants/route.ts POST)

  + Imports: deriveUniqueAgentSubdomain + teardownAuthUser.
  + Validates owner_full_name + owner_password (length >= 8) up front.
  + Strips owner_* from the tenants insert payload (consumed by agent
    seed, not stored on tenants).
  + 4-step seeded create with manual rollback on each failure step.
  + Response includes both tenant and owner_agent for the client to
    confirm seeding.

### B3 — atomicity

  Best-effort across DB + auth boundary. Each failure mode has a
  documented rollback path that cleans up what was created at earlier
  steps. The worst observable outcome is an in-flight auth user that
  the teardown helper failed to remove — surfaced in the error message
  for operator action.

### B4 — multi-tenant

  Owner details flow from the form (per-create). No tenant ids or names
  in render or server code. Every future tenant seeds ITS OWN owner —
  guard-query Scenario 4 verified.

### B5 — Aily/WALLiam untouched

  This is create-path only; no retroactive backfill. Aily (Ovais) and
  WALLiam (King Shah) already have real owners set via UNITs 1 + 3 +
  manual existing state. Guard-query Scenario 3 verified.

### Gates

  T1 TSC --noEmit: exit 0
  T2 guard-query (SAVEPOINT-isolated; NO persistent mutation): 13 PASS
     Scenario 1 (happy path 4-step flow):
       STEP 1 OK: tenant with NULL default_agent_id
       STEP 3 OK x4: owner agent inserted with role=tenant_admin,
         parent_id NULL, is_active=true, tenant_id matches
       STEP 4 OK: validate_house_account trigger accepted
       NO placeholder: 1 agent total, real owner name
     Scenario 2 (trigger rejects ineligible role):
       Seeding role='assistant' as owner -> 23514
       house_account_role_ineligible (Phase 1 trigger intact).
       UNIT 15 hardcodes 'tenant_admin' so unreachable in real flow.
     Scenario 3: Aily + WALLiam default_agent_id byte-identical.
     Scenario 4 (multi-tenant): two seeded tenants in same tx, distinct
       owner ids, no cross-tenant share.
     Post-check (fresh connection): 0 SMOKE-prefixed tenants persisted,
       0 smoke test agents persisted. ROLLBACK clean.
  T3 C12 regression: 17 PASS / 3 FAIL — same baseline. 0 NEW fails.

### Files (this commit)

  components/admin-homes/AddTenantModal.tsx                  (B1 form)
  app/api/admin-homes/tenants/route.ts                       (B2 server)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                   (this run-log)

### Backups (timestamps)

  components/admin-homes/AddTenantModal.tsx.backup_20260625_160929
  app/api/admin-homes/tenants/route.ts.backup_20260625_160929
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260625_162222 (pre-this-entry)

### Status grid changes

  - Phase 1b NOT NULL on default_agent_id row: removed from DEFERRED;
    moved to "UNBLOCKED by UNIT 15" — next migration ALTER TABLE
    tenants ALTER COLUMN default_agent_id SET NOT NULL is now safe
    pending a backfill check (none of the live tenants should have
    NULL, but worth verifying before the migration).

### Open follow-ups

- Phase 1b NOT NULL migration (now unblocked) — separate unit when
  operator chooses to run it.
- Live operator click-test on aily.ca after push:
  - Click Add Tenant -> fill all fields incl. owner name + password.
  - Submit -> success callout shows "Owner agent seeded automatically"
    in step 3 of the amber list.
  - Navigate to the new tenant's cockpit -> People tab shows the owner
    as a tenant_admin root with the House Account pill.
  - The new tenant.default_agent_id is the new owner agent id.
- Toast vs alert() polish (carried).

### Commit gate

  2 app files + tracker shipped together (live-tracker rule). NO prod DB
  writes from this build (the smoke is SAVEPOINT-isolated). HOLD push
  pending operator instruction.

---

## W-TENANT-GOV PHASE 1b / UNIT 16 (FIRST ATTEMPT) — REVERTED 2026-06-25

Tried ALTER COLUMN default_agent_id SET NOT NULL alone on 2026-06-25.
Migration applied (4 smokes passed inside the runner), but post-apply
verification immediately uncovered a hard regression: under NOT NULL,
UNIT 15's POST handler INSERT tenants step fails with 23502 because the
handler inserts the tenant FIRST (with default_agent_id implicitly NULL),
then UPDATEs default_agent_id at step 4.

Emergency rollback executed minutes later — `ALTER TABLE tenants ALTER
COLUMN default_agent_id DROP NOT NULL`. Production restored, Aily +
WALLiam unchanged, no commit.

ROOT CAUSE — FK cycle:
  tenants.default_agent_id  --FK-->  agents(id)
  agents.tenant_id          --FK-->  tenants(id)
Neither row can be inserted before the other while both FKs are
IMMEDIATE. UNIT 15's two-step "insert tenant with NULL default → create
agent → backfill default" worked only because default_agent_id was
nullable.

Lesson: NOT NULL alone is structurally incomplete; the cycle must be
resolved AT THE SAME TIME (FK deferrability + transactional create
refactor). Single-step migration unsafe. See UNIT 16b for the
comprehensive fix.

---

## W-TENANT-GOV PHASE 1b / UNIT 16b RUN-LOG (2026-06-26) — comprehensive fix

Two migrations + one create-flow refactor shipped as ONE unit, with TWO
HARD GATES (operator-approved at each gate). Closes Phase 1b
structurally — the house-account invariant is now a DB constraint, not a
convention.

### Locked design (operator decision after UNIT 16 revert)

- Trigger validate_house_account is NOT modified. No relaxation. Strict
  cond (b) — agent.tenant_id must equal tenant.id, no NULL carve-out.
- FK cycle resolved by ORDERING in a single transaction, not by relaxing
  the trigger.
- Both FKs (tenants.default_agent_id_fkey + agents_tenant_id_fkey) made
  DEFERRABLE INITIALLY IMMEDIATE — behavior unchanged for existing queries
  (IMMEDIATE), opt-in deferred via SET CONSTRAINTS DEFERRED inside the
  create-tx.
- UNIT 15 POST refactored to pg-direct transaction: SET CONSTRAINTS ALL
  DEFERRED → INSERT agent WITH correct tenant_id (referencing not-yet-
  existing tenant, FK deferred) → INSERT tenant WITH default_agent_id
  pointing at the just-inserted agent (FK validates immediately, trigger
  fires + passes strictly because agent.tenant_id == NEW.id) → COMMIT
  flushes deferred FK.
- NO transient NULL state in agent.tenant_id; no relaxation anywhere.

### Gate 1 — deferrable FK migration (LIVE)

  supabase/migrations/20260626_w_phase1b_fk_deferrable.sql:
    ALTER TABLE tenants ALTER CONSTRAINT tenants_default_agent_id_fkey
      DEFERRABLE INITIALLY IMMEDIATE;
    ALTER TABLE agents ALTER CONSTRAINT agents_tenant_id_fkey
      DEFERRABLE INITIALLY IMMEDIATE;

  Applied via scripts/apply-phase1b-gate1.js (deleted post-success).
  Rollback snapshot retained:
    rollback-snapshots/_phase1b-gate1-fk-deferrable_2026-06-26T09-58-00-373Z.sql
  (captures pre-apply FK deferrability + FULL prior validate_house_account
  function body — to prove the trigger was not modified).

  Gate 1 runner smokes:
    SMOKE A PASS: trigger rejects nonexistent agent (cond a intact)
    SMOKE B PASS: trigger rejects WALLiam-agent-on-Aily mismatch
      (cond b strict path intact — no relaxation)
    SMOKE C PASS: deferred-tx (agent-first with correct tenant_id) COMMITs
      all FKs + trigger
    SMOKE D PASS: deferred-tx with WRONG agent.tenant_id rejected at
      trigger (cond b STILL bites)
  Post-verify: validate_house_account function body byte-identical to
    pre-apply (NO trigger modification).
  Aily + WALLiam state byte-identical.

### Refactored UNIT 15 POST (between gates)

  app/api/admin-homes/tenants/route.ts POST:
    + Imports Client (pg) + randomUUID (crypto).
    + Auth user created BEFORE the pg tx (auth.admin lives outside Postgres).
    + Pre-derives newTenantId (randomUUID), ownerSubdomain.
    + Single pg-direct transaction:
        BEGIN
        SET CONSTRAINTS ALL DEFERRED
        INSERT agents (id=authUserId, tenant_id=newTenantId, role=tenant_admin,
                       parent_id=NULL, is_active=true, ...)  -- FK deferred
        INSERT tenants (id=newTenantId, default_agent_id=authUserId, ...)
                       -- FK to agents validates immediately, trigger fires + passes
        COMMIT  -- deferred FK validates, all good
    + On any tx failure: ROLLBACK + teardownAuthUser (orphan-free).
    + 23505 friendly mapping preserved for source_key + domain collisions.
    + Tenant insert payload built generically from request body keys
      (same shape Unit 15 had); fixed columns (id, default_agent_id,
      updated_at) added explicitly.

  B2 verification (SAVEPOINT-isolated, under Gate 1 + still-nullable default):
    10 assertions PASS across 4 scenarios:
      1. Refactored tx GREEN (agent inserted with correct tenant_id;
         tenant inserted with default; trigger passes strictly).
      2. WRONG agent.tenant_id REJECTED at trigger (cond b strict
         preserved).
      3. OLD-style nullable-default INSERT still tolerated (Gate 2 not
         yet applied).
      4. Aily + WALLiam byte-identical.

### Gate 2 — NOT NULL migration (LIVE)

  supabase/migrations/20260626_w_phase1b_default_agent_id_not_null.sql:
    ALTER TABLE tenants ALTER COLUMN default_agent_id SET NOT NULL;

  Applied via scripts/apply-phase1b-gate2.js (deleted post-success).
  Rollback snapshot retained:
    rollback-snapshots/_phase1b-gate2-not-null_2026-06-26T10-05-27-756Z.sql

  Gate 2 runner pre-checks:
    Pre 1: zero NULL rows (drift guard from recon).
    Pre 2: both FKs verified DEFERRABLE (refuses to apply if Gate 1 was
      rolled back — Gate 1 is a prerequisite).
  Gate 2 runner smokes (the decisive ones):
    SMOKE 1 PASS: UPDATE Aily SET default_agent_id=NULL rejected with
      23502.
    SMOKE 2 PASS: OLD-style INSERT (no default in payload) rejected
      with 23502 — proves the refactored POST is REQUIRED, not optional.
    SMOKE 3 PASS: refactored UNIT 15 tx COMMITs cleanly under deferrable
      FKs + NOT NULL. This is the EXACT failure case from original
      UNIT 16; now GREEN.
    SMOKE 4 PASS: WRONG agent.tenant_id rejected at trigger (no
      relaxation under NOT NULL either).

  Post-sanity: Aily + WALLiam unchanged.

### Final verification (post-Gate 2, separate read-only script)

  7 assertions PASS:
    T1: is_nullable=NO; both FKs deferrable.
    T2: Aily + WALLiam state unchanged.
    T3: refactored UNIT 15 tx COMMITs under live constraints.
    T3b: OLD-style INSERT rejected 23502 (confirms refactored POST is
      required path).
  Post-check (fresh connection): 0 persistent test tenants.

### Gates

  T1 TSC --noEmit: exit 0
  T2 SAVEPOINT-isolated verification: 7 + 10 + 4 (Gate 1) + 4 (Gate 2)
     = 25 assertions across the whole unit. No persistent prod mutation
     beyond the two intentional migration DDLs.
  T3 C12 regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11,
     L2.1). 0 NEW fails.

### Files (this commit)

  supabase/migrations/20260626_w_phase1b_fk_deferrable.sql          (Gate 1 DDL, applied)
  supabase/migrations/20260626_w_phase1b_default_agent_id_not_null.sql (Gate 2 DDL, applied)
  app/api/admin-homes/tenants/route.ts                              (POST refactor)
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md                          (this run-log)
  supabase/migrations/rollback-snapshots/
    _phase1b-gate1-fk-deferrable_2026-06-26T09-58-00-373Z.sql
    _phase1b-gate2-not-null_2026-06-26T10-05-27-756Z.sql

### Backups (timestamps)

  app/api/admin-homes/tenants/route.ts.backup_20260626_055824
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260626_060700 (pre-this-entry)

### What's now structurally enforced

  - Every tenant row HAS a default_agent_id (NOT NULL).
  - That agent always satisfies the validate_house_account contract
    (exists, tenant matches, active, role eligible) — trigger fires on
    every write and rejects mismatches.
  - The FK relationship is intact (RESTRICT delete) — agents who are
    house accounts can't be deleted while held; deactivate is also
    blocked by UNIT 1 Part 4 + UNIT 14 guards.
  - The create-tenant flow can no longer leave a tenant in a half-
    configured house-account-less state — the atomic tx either succeeds
    fully or fails fully (with auth teardown).

### Open follow-ups

- The refactored POST uses pg-direct via the service-role connection
  string (DATABASE_URL). If DATABASE_URL is ever absent (misconfigured
  deploy), the route returns 500 + teardownAuthUser. Documented in code
  comment; no runtime fallback to the old order.
- Live operator click-test on aily.ca after push:
  - Add Tenant → real owner details → submit → success.
  - Verify the new tenant has default_agent_id populated AND the owner
    agent has tenant_id == new tenant.
  - Cockpit People tab shows owner as tenant_admin root with House
    Account pill.

### Commit gate

  2 migrations + 1 app file + tracker + 2 rollback snapshots shipped
  together (live-tracker rule). HOLD push pending operator instruction.

---

## W-ASSISTANT-FLOW UNIT 19 RUN-LOG (2026-06-26) — assistant inherits flow by reports-to anchor

Replaces the Unit 9 "every assistant is top-layer" treatment with operator-
locked anchor-based inheritance. NO schema migration. NO new role. NO
license logic. The 'assistant' role from Unit 11 stays as-is.

### Locked model (operator)

  - One assistant role. Sub-assistant = assistant reporting to another
    assistant; not a separate type.
  - An assistant INHERITS the lead/email scope of their FIRST NON-ASSISTANT
    ancestor walking UP the parent_id chain.
  - Top-tier anchor (tenant owner / house account) -> assistant sees ALL
    leads in the tenant (including agent-less leads).
  - Branch anchor (manager / area_manager / agent) -> assistant sees ONLY
    leads whose assigned-agent chain passes through the anchor.
  - Cycle / no-parent / inactive-anchor -> inherits NOTHING.
  - Inheritance CHAINS: assistant B -> assistant A -> tenant_admin: B
    inherits A's resolved anchor, which is the tenant_admin (top tier),
    so B sees everything. Chain depth bounded; cycle-safe.
  - Existing Unit 9/10 admin opt-out still filters at the end (an over-
    copied assistant can be muted by tenant_admin/assistant viewers).
  - Existing tenant_owner / house_account CC chain UNCHANGED — only
    assistant collection is rescoped.

### The bug fixed in B1

  AddAgentModal:110 + EditAgentModal:180 filtered
  `availableParents = agents.filter(a => a.can_create_children !== false)`.
  Assistants default to can_create_children=false, so they were silently
  DROPPED from the Reports-To dropdown — assistant->assistant chains
  could not be authored.

  Fix: extend the filter to `|| a.role === 'assistant'`. Reports-To
  selector itself was already visible for role='assistant'; both modals
  always render it. No UI gating change needed.

### Files

  components/admin-homes/AddAgentModal.tsx
    + availableParents filter now includes role='assistant' regardless
      of can_create_children. 1-line change at the dropdown source.
  components/admin-homes/EditAgentModal.tsx
    + same filter change, preserving the self-exclusion guard.
  lib/admin-homes/assistant-anchor.ts  (NEW)
    + resolveAssistantAnchor(assistantId, tenantId, supabase,
                             houseAccountAgentId): AssistantAnchor
        - UP-walk parent_id, skipping assistant nodes
        - 10-hop cap + seen-set cycle guard
        - tenant_id mismatch on any visited row -> no anchor (defensive
          multi-tenant guard)
        - classification: isTopTier when anchor is role='tenant_admin'
          with parent_id=NULL OR anchor.id == tenant.default_agent_id
        - inactive anchor flagged separately (anchorInactive=true)
    + assistantInheritsLead(anchor, leadAssignedAgentId, leadChainAncestorIds): boolean
        - top-tier anchor -> always true (even when leadAssignedAgentId
          is null; agent-less leads still reach top-tier assistants)
        - branch anchor -> true when anchor.id == leadAssignedAgentId
          OR anchor.id in leadChainAncestorIds
        - no-anchor / inactive-anchor -> false
  lib/admin-homes/lead-email-recipients.ts
    + import {resolveAssistantAnchor, assistantInheritsLead}
    + Tenant-owner-only block (was Unit 9 combined block): query narrowed
      to role='tenant_admin' AND parent_id IS NULL. Behavior preserved.
    + NEW block: fetch tenants.default_agent_id, walkHierarchy
      ancestor-id snapshot, then per-active-assistant:
        a. resolveAssistantAnchor with cycle / inactive / cross-tenant
           defenses
        b. assistantInheritsLead test against the lead's chain
        c. include in BCC + resolved.assistants only on pass
      Opt-out filter (Unit 9/10) still applied per-row.
    + resolved.assistants doc updated to reflect the new semantics.
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (this run-log)

### T3 fork smoke (synthetic mini-org under Aily; pre-cleaned)

  Built 11 synthetic agents:
    M1 (manager, parent=null)
    A_top (assistant, parent=Ovais)               [TOP TIER]
    A_M1 (assistant, parent=M1)                   [BRANCH=M1.down]
    A_M1_2 (assistant, parent=A_M1)               [chain skips asst -> M1]
    G1 (agent, parent=M1)
    Solo (agent, parent=null)                     [solo agent, no descendants]
    A_solo (assistant, parent=Solo)               [BRANCH=Solo only]
    A_orphan (assistant, parent=null)             [NO ANCHOR]
    A_cycle_1 + A_cycle_2 (assistants, mutual)    [CYCLE]
    A_via_top_chain (assistant, parent=A_top)     [chain resolves to top]

  3 lead scenarios:
    L1: lead assigned to G1 (inside M1's branch)
      A_top YES, A_M1 YES, A_M1_2 YES (chain skips A_M1 to M1),
      A_solo NO, A_orphan NO, A_cycle_1/2 NO, A_via_top_chain YES.
    L2: lead assigned to Solo
      A_top YES, A_M1 NO, A_M1_2 NO, A_solo YES, A_orphan NO,
      A_cycle_1 NO, A_via_top_chain YES.
    L3: agent-less lead (agentId=null)
      A_top YES (top-tier still gets agent-less leads), A_M1 NO,
      A_solo NO, A_orphan NO, A_via_top_chain YES.

  20 fork-membership assertions PASSED. Post-cleanup: 0 synthetic rows
  remaining (verified via fresh-connection re-query).

### Gates

  T1 tsc --noEmit: exit 0
  T3 fork smoke: 20 assertions PASS
  T4 C12 regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11, L2.1).
       0 NEW fails. (One run showed transient 15/5 due to spawn env race
       on L2.6/L2.7 child processes; immediately reran 17/3 stable.
       Tests don't touch any of UNIT 19's surfaces.)
  Aily / WALLiam state: unchanged (no DB writes from this unit).

### What changed for live recipients

  Before this unit: every active assistant in a tenant received BCC on
  every lead routed within that tenant — even leads outside their
  reporting branch. Effectively top-layer for all.

  After this unit:
    - Assistant reporting to tenant_admin owner / house account / a
      tenant-assistant whose chain resolves to top -> behavior unchanged
      (still gets all leads). Today this matches Unit 11's behavior for
      tenant-anchored assistants.
    - Assistant reporting to a manager / area_manager / agent -> ONLY
      receives leads from that anchor's down-branch. Out-of-branch leads
      no longer flood their inbox.
    - Assistant with no anchor (orphan / cycle / inactive anchor) -> no
      copies. Surfaced as own root row via existing Unit 6 orphan
      handling.

### Multi-tenant proof

  resolveAssistantAnchor verifies every visited row's tenant_id == the
  passed tenantId; cross-tenant parent_id (defensive) terminates with
  no-anchor. The lead-email-recipients assistant block filters by
  tenant_id at the top-level query. WALLiam parity: tested via the C12
  baseline (17/3, no new fails).

### Open follow-ups

  - Live operator click-test on aily.ca:
    - Add an assistant reporting to a manager, fire a lead within that
      manager's branch -> assistant gets BCC.
    - Fire a lead outside that manager's branch -> assistant does NOT
      get a copy.
    - Repeat with assistant reporting to Ovais (top tier) -> always
      gets BCC.
  - C12 brittle assertions (c8b-2, c11, L2.1) baseline carry-over; not
    in this unit's scope.

### Backups (timestamps)

  components/admin-homes/AddAgentModal.tsx.backup_20260626_071648
  components/admin-homes/EditAgentModal.tsx.backup_20260626_071648
  lib/admin-homes/lead-email-recipients.ts.backup_20260626_071648
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260626_094823

### Commit gate

  4 app/lib files (3 edited + 1 new) + tracker shipped together (live-
  tracker rule). HOLD push pending operator instruction.

---

## W-HOUSE-ACCOUNT UNIT 17 RUN-LOG (2026-06-26) — restore missing dashboard "Set as house account" action

Symptom (live aily.ca/admin-homes/agents, platform_admin viewer): Ovais's
row shows the disabled "Current house account" span (correct), but no
OTHER eligible agent row shows the assignable "Set as house" button —
operator can't change the house account from the dashboard.

### Recon

  R1 (gate audit). AgentsManagementClient.tsx:326 render gate is
    structurally correct:
      canSetOversightOptOut && tenantId && (agent as any).role !== 'assistant' && (
        tenantDefaultAgentId === agent.id
          ? <span>Current house account</span>
          : <button>Set as house</button>
      )
    File UNCHANGED since fee54461 (Unit 13). page.tsx UNCHANGED since
    18c71f2 (Unit 10). canSetOversightOptOut computed + passed correctly.
    For platform_admin: user.isPlatformAdmin=true -> canSetOversightOptOut=
    true. For aily.ca host: hostTenantId=AILY -> scopedTenantId=AILY ->
    tenantId prop=AILY (truthy). Gate evaluates true for Ovais (proving
    the gate works -- span renders), and would evaluate true for Manager
    (Aily) when its row is rendered.

  R2 (cause classification). NONE of the offered candidates (a/b/c/d)
    matched static analysis:
      (a) viewer-permission false -> would block Ovais's span too; doesn't.
      (b) eligible-role filter excludes shown rows -> filter is just
          `role !== 'assistant'`; Manager.role='manager' passes.
      (c) regression in Units 14/16b/19 -> git log shows none touched
          AgentsManagementClient.tsx or page.tsx.
      (d) current-holder check mis-fires on all rows -> would show
          "Current house account" span on every row; doesn't.
    THE ACTUAL CAUSE: row VISIBILITY. expandedManagers initial state at
    line 50 was `new Set()` -> every nested row hidden by default. Under
    Units 5/6/7's operating-tree nesting, every non-owner agent is nested
    under their parent_id. With the collapsed default, only top-level
    rows render. For Aily that's [Olga (assistant -> no action), Ovais
    (holder -> disabled span)] -- both eligible-non-holders (Manager,
    Agent (Aily)) live under Ovais and need a manual chevron click.
    Operators never saw the button.

  R3 (eligible non-holders confirmed by live probe).
      Ovais (319ad339, tenant_admin, parent=NULL, active)   = HOLDER
      Olga Condo (3c332140, assistant, parent=NULL, active) = assistant
      Manager (Aily) (3c17dc80, manager, parent=Ovais, active) = ELIGIBLE
      Agent (Aily) (28fee333, agent, parent=Manager, active)   = ELIGIBLE
    Both eligible non-holders nest under Ovais (or under a child of
    Ovais) and were collapsed-by-default.

### Fix

  components/admin-homes/AgentsManagementClient.tsx:50
    BEFORE: useState<Set<string>>(new Set())
    AFTER:  useState<Set<string>>(
              () => new Set(agents.filter(a =>
                agents.some(x => x.parent_id === a.id)
              ).map(a => a.id))
            )

  Every agent that has at least one child in the visible set is added
  to expandedManagers on initial render. Lazy initializer (function form)
  -- runs once at mount only.
  Manual collapse still works -- toggleExpand mutates the set as before.
  Multi-tenant safe -- driven entirely by the per-tenant `agents` prop,
  no hardcoding.

  Per-row gate (line 326) UNCHANGED. validate_house_account contract
  intact (Phase 1). Opt-out (Unit 9/10), assistant exclusion (Unit 13),
  holder disabled-span (Unit 13) all UNCHANGED.

### Smoke (render proof, SAVEPOINT-isolated; pre-cleaned)

  Mirror of the client's logic against live Aily agents + default:
    Auto-expanded by initial state: [Ovais, Manager (Aily)]
    Rendered table rows by default: [Olga, Ovais, Manager (Aily), Agent (Aily)]
    Per-row action:
      Olga          (assistant)    -> NO ACTION
      Ovais         (tenant_admin) -> DISABLED SPAN "Current house account"
      Manager (Aily)(manager)      -> BUTTON "Set as house"
      Agent (Aily)  (agent)        -> BUTTON "Set as house"
    Non-admin viewer simulation: every row -> NO ACTION (gate-off).
  8 assertions PASSED. No persistent DB writes.

### Gates

  T1 tsc --noEmit: exit 0
  T3 render proof: 8 assertions PASS
  T4 C12 regression: 17 PASS / 3 FAIL -- same baseline (c8b-2, c11, L2.1),
       0 new fails.
  Aily / WALLiam state: unchanged (no DB writes).

### What changed for live operators

  Before this unit: the dashboard's "Set as house account" action existed
  in source code per Unit 13 but was effectively unreachable -- nested
  rows stayed collapsed by default, so the only visible rows for typical
  tenants were the owner (disabled span) and any solo-parented assistants
  (excluded by gate). The operator couldn't change the house account
  without first clicking the chevron next to the owner -- and there was
  no signal in the UI that an expand step was needed.

  After this unit: every agent with team members is auto-expanded on
  mount; every eligible non-holder row is visible AND shows the
  assignable button. Manager (Aily) and Agent (Aily) on aily.ca are now
  directly assignable from the dashboard. The collapse toggle still
  works for branches an operator wants to hide.

### Backups (timestamps)

  components/admin-homes/AgentsManagementClient.tsx.backup_20260626_100410
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260626_100602

### Open follow-ups

  - Live operator click-test on aily.ca: confirm Manager (Aily) row shows
    "Set as house" button on page load (no chevron click required) and
    that clicking moves the pill via the validated PATCH.

### Commit gate

  1 app file + tracker shipped together (live-tracker rule). HOLD push
  pending operator instruction.

---

## W-AGENT-CREATE UNIT 18 RUN-LOG (2026-06-26) — auto-populate brokerage on Add Agent

Goal: on Add Agent, pre-fill brokerage name + brokerage address from the
scoped tenant's values so they're consistent across a tenant's agents
and not re-typed/mistyped. Fields remain editable. No fabricated
defaults: tenant has no value -> input stays blank.

### Recon

  Tenants schema (information_schema):
    brokerage_name      text
    brokerage_address   text
    brokerage_phone     text     (out of scope this unit; not seeded)

  Live values verified:
    Aily.brokerage_name    = "PREMIER MATRIX REALTY LTD. BROKERAGE"
    Aily.brokerage_address = "208 Spring Garden Ave, North York, ON M2N 3G8, Canada"
    WALLiam.brokerage_name = "WALLiam Realty Inc., Brokerage"
    WALLiam.brokerage_address = "1 Placeholder Ave, Suite 100, Toronto, ON M5V 0A1"

  Modal scope:
    components/admin-homes/AddAgentModal.tsx mounts at:
      - components/admin-homes/AgentsManagementClient.tsx (the agents
        page list)
    Confirmed via grep — no other System 2 caller mounts AddAgentModal.
    components/admin/* paths are System 1 (per CLAUDE.md) and untouched.

### Files

  app/admin-homes/agents/page.tsx
    + tenants SELECT: append brokerage_name, brokerage_address (allow-list
      extended; never SELECT *).
    + Derive tenantBrokerageName / tenantBrokerageAddress from the scoped
      tenant row; null when the row has no value.
    + Pass both as props to AgentsManagementClient.

  components/admin-homes/AgentsManagementClient.tsx
    + Accept tenantBrokerageName + tenantBrokerageAddress on the prop
      signature (default null).
    + Thread both to AddAgentModal.

  components/admin-homes/AddAgentModal.tsx
    + Props interface extended: tenantBrokerageName + tenantBrokerageAddress.
    + New useEffect on [isOpen, tenantBrokerageName, tenantBrokerageAddress]:
      when modal opens, replace form.brokerage_name + form.brokerage_address
      with the tenant values (|| '' fallback for null). Operator edits
      during a single open persist; closing + reopening resets to tenant
      defaults (each open is a fresh add).

  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (this run-log)

### Smoke (mirror of modal seed logic against live tenant rows)

  12 assertions PASS across 4 scenarios:
    Aily:    seeded form.brokerage_name + address match Aily tenant row.
    WALLiam: seeded values match WALLiam tenant row; WALLiam value does
             NOT leak to Aily (per-tenant scoping intact).
    NULL:    tenant with null brokerage values -> form fields blank
             (no fabricated default).
    Reopen:  operator-typed value overwritten by tenant value on reopen
             (each open is a fresh add; predictable seed semantics).
  No persistent DB writes.

### Gates

  T1 tsc --noEmit: exit 0
  T3 form-seed smoke: 12 assertions PASS
  T4 C12 regression: 17 PASS / 3 FAIL -- same baseline (c8b-2, c11, L2.1),
       0 new fails.
  Aily / WALLiam state: unchanged (no DB writes).

### Multi-tenant proof

  Brokerage values flow only from the scoped tenant row (selected by
  scopedTenantId derived in the server page); never from a per-tenant
  constant in code. Tenant #3 onboarding requires zero changes: their
  brokerage_name + brokerage_address are read via the same SELECT path
  and seed the modal identically. Null-value tenants stay blank — no
  cross-tenant default leak.

### Backups (timestamps)

  app/admin-homes/agents/page.tsx.backup_20260626_101140
  components/admin-homes/AgentsManagementClient.tsx.backup_20260626_101140
  components/admin-homes/AddAgentModal.tsx.backup_20260626_101140
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260626_101508

### Open follow-ups

  - Live operator click-test on aily.ca: Add Agent -> brokerage fields
    pre-filled with Aily's brokerage; edit a field then save -> the
    edited value persists on the agent row; reopen the modal for another
    new agent -> brokerage fields back to tenant defaults.
  - If operators need brokerage_phone seeded too (out of scope this
    unit, not in operator's spec), a follow-up unit would mirror this
    pattern on the (currently absent) phone fields in AddAgentModal.

### Commit gate

  3 app files + tracker shipped together (live-tracker rule). HOLD push
  pending operator instruction.

---

## W-HOUSE-ACCOUNT UNIT 21 RUN-LOG (2026-06-26) — gate set-as-house to top tier + move to overflow menu

Operator rule: setting the house account is rare + sensitive. (a) gate
to top tier + platform_admin: viewer position==='tenant_admin' OR
position==='assistant' OR isPlatformAdmin (keep platform_admin so the
system operator isn't locked out). (b) move it OUT of the always-visible
amber row button INTO a less-prominent row overflow (kebab) menu.

### Recon-confirm (the two predicates stay independent)

  - canSetOversightOptOut (BROADER, KEPT as-is): platform_admin OR DB
    role='admin' OR position='tenant_admin' OR position='assistant'.
    Used by: EditAgentModal opt-out toggle + role select. NOT MODIFIED.
  - canSetHouseAccount (NEW, NARROWER, this unit): platform_admin OR
    position='tenant_admin' OR position='assistant'. Drops the DB
    role='admin'-only clause that opt-out preserves. Used by:
    AgentsManagementClient set-as-house menu item ONLY.

  Why separate booleans:
    Opt-out + role edit have a different blast radius — they're
    per-agent admin operations that DB role='admin' (legacy
    "tenant admin" without the position bucket) should retain. Set-as-
    house mutates a tenant-level invariant (tenants.default_agent_id) and
    is one operator action away from re-routing every catch-all lead;
    operator wants the tightest population that fits the org model.

### Files

  app/admin-homes/agents/page.tsx
    + canSetHouseAccount: boolean — computed alongside the existing
      canSetOversightOptOut. Both passed to AgentsManagementClient.

  components/admin-homes/AgentsManagementClient.tsx
    + Prop signature accepts canSetHouseAccount (default false).
    + Removed: always-visible amber "Set as house" row button + its
      paired "Current house account" disabled span from the Actions cell.
      (The current-holder Crown pill in the Role/Hierarchy column is
      KEPT — that's the visible marker now.)
    + Added: row-overflow (kebab "MoreHorizontal") menu in the Actions
      cell. Renders ONLY when canSetHouseAccount AND tenantId is set AND
      the target row is eligible (active, role not 'assistant', not the
      current holder). Click-outside handler closes the open menu.
      Menu hosts a single item today: "Set as house account" — calling
      the same setAsHouseAccount() function that posted the validated
      PATCH before. The kebab itself is hidden when there's nothing to
      put in the menu, keeping the row uncluttered.
    + MoreHorizontal icon added to the lucide-react import.

  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (this run-log)

### Smoke (gate-proof, pure mirror of the predicates + per-row gate)

  24 assertions PASS across 4 sections:
    1) Predicate independence:
       - opt-out: TRUE for platform_admin, tenant_admin,
         tenant_assistant, db role='admin' (broader path).
         FALSE for plain manager / agent / area_manager.
       - set-house: TRUE for platform_admin, tenant_admin,
         tenant_assistant. FALSE for db role='admin' alone (NARROWER —
         the delta). FALSE for plain manager / agent / area_manager.
    2) Per-row menu visibility (tenant_admin viewer):
       - HIDDEN on holder row (Ovais).
       - SHOWN on Manager row + Agent row (eligible non-holders).
       - HIDDEN on assistant row (trigger contract).
       - HIDDEN on inactive row (trigger contract).
    3) Per-row menu visibility (plain manager viewer): HIDDEN everywhere.
    4) Per-row menu visibility (db role='admin' alone viewer): HIDDEN
       for set-house (narrower predicate); same viewer STILL passes
       opt-out (broader predicate preserved) — independence proven.
    Plus: cross-tenant view (tenantId=null) hides the menu even for
    platform_admin.

### Gates

  T1 tsc --noEmit: exit 0
  T3 gate-proof smoke: 24 assertions PASS
  T4 C12 regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11,
       L2.1), 0 new fails.
  Aily / WALLiam state: unchanged (no DB writes — pure UI gating change).

### What changed for live operators

  Before: tenant_admin / assistant / DB role='admin' / platform_admin
    viewers saw an always-visible amber "Set as house" button on every
    eligible non-holder row in the agents list (with a paired
    "Current house account" disabled span on the holder row).
  After:
    - Tenant_admin / assistant / platform_admin viewers see a small
      kebab "More actions" button on each eligible non-holder row,
      which on click reveals a single "Set as house account" menu
      item. Less prominent; one click of safety margin before the
      change.
    - DB role='admin' alone (no top-tier position) sees no menu — the
      narrower gate revokes their access to this specific action
      (still can opt-out + role-edit via the broader gate).
    - Holder still marked by the Crown pill in the Role / Hierarchy
      column (Unit 3 pill, unchanged).
    - All other action buttons (Edit, Assign, Add Agent, Remove,
      Delete) untouched.

### Multi-tenant proof

  Both predicates are derived from the viewer's session, not from any
  per-tenant constant. The per-row gate includes !!tenantId so the
  cross-tenant universal view (scopedTenantId=null) silently hides the
  menu for everyone — no accidental cross-tenant write. Tenant #3
  onboarding requires zero change.

### Backups (timestamps)

  app/admin-homes/agents/page.tsx.backup_20260626_103929
  components/admin-homes/AgentsManagementClient.tsx.backup_20260626_103929
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260626_104642

### Open follow-ups

  - Live operator click-test on aily.ca:
    - As Ovais (tenant_admin): kebab "More actions" appears on
      Manager (Aily) + Agent (Aily) rows; opening reveals "Set as
      house account"; click moves the Crown pill to that agent on
      reload. No kebab on Ovais's own row (holder) or Olga (assistant).
    - As a plain agent / manager viewer: no kebab anywhere in the
      agents list.
    - Opt-out toggle in EditAgentModal still gated to the broader
      population (DB role='admin' included) — unaffected by this unit.
  - Future rare row actions (e.g. impersonate, reset password) would
    nest under the same kebab without changing the row layout.

### Commit gate

  2 app files + tracker shipped together (live-tracker rule). HOLD push
  pending operator instruction.

---

## W-HOUSE-ACCOUNT UNIT 22 RUN-LOG (2026-06-26) — surface catch-all ownership on agents dashboard

Problem: the house account (Ovais on Aily, King Shah on WALLiam) is the
computational catch-all for unrouted leads under Phase 1 (P-HOUSE
resolver fallback), but his row on /admin-homes/agents shows Territories
N / Buildings N / Leads N — counts pulled from EXPLICIT seeded rows
only (agent_property_access + agent_geo_buildings + leads). Operators
reasonably misread the counts as "owns nothing" when in fact the agent
owns the remainder by computation. DISPLAY gap, not function gap.

### Recon (count cost — confirmed expensive / not tenant-scoped)

  - agent_property_access "unassigned scopes per tenant": requires a
    defined "tenant scope universe" (set of geo cards available to this
    tenant) which isn't stored anywhere. Computing NOT EXISTS over an
    implicit universe is EXPENSIVE.
  - agent_geo_buildings "unassigned buildings per tenant": same shape —
    needs a defined "tenant buildings universe". EXPENSIVE.
  - mls_listings.assigned_agent_id IS NULL: cheap globally (~3,993
    today) but mls_listings has NO tenant_id column; not tenant-scoped.
    Cannot be split per-tenant without joining via the resolver itself
    (which is per-listing too expensive).
  - leads.agent_id = house AND leads.tenant_id = scopedTenant: ALREADY
    counted by page.tsx total_leads. This IS the running tally of
    catch-all-routed leads (whether by explicit assignment of the house
    account or by P-HOUSE fallback). Cheap.

  Operator-locked B2 decision: "If the count is expensive, show the
  badge without a number rather than a slow query; state which." -->
  use the badge approach for territories + buildings. Annotate the
  leads cell instead of introducing a new query.

### Files

  components/admin-homes/AgentsManagementClient.tsx
    + Added isHouseAccount derivation per AgentRow (cheap closure over
      already-passed tenantDefaultAgentId; no new prop).
    + Role/Hierarchy column gains a plain-language amber subtext on the
      house-account row reinforcing the catch-all semantic:
        "Catch-all: receives any lead whose geo doesn't match an
         explicit assignment in this tenant."
    + Territories cell on the house-account row: count remains as-is
      (with new "explicit" mini-label) + amber "+ catch-all (all
      unassigned scopes)" line below. Tooltip explains why a number
      isn't shown.
    + Buildings cell on the house-account row: same treatment — amber
      "+ catch-all (all unassigned buildings)" line.
    + Leads cell on the house-account row: amber "incl. catch-all
      routing" annotation (the count itself IS the running tally — no
      number duplication).

  Existing Crown amber "House Account" pill UNCHANGED (already in the
  Role / Hierarchy column from UNIT 3). Non-house rows unchanged in
  every cell.

  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (this run-log)

### Smoke (display proof, live DB)

  19 assertions PASS across 4 scenarios:
    Aily view (default=Ovais):
      - Ovais row: Crown pill + catch-all subtext + amber annotations on
        Territories / Buildings / Leads cells. Explicit counts (0, 0, 0)
        unchanged.
      - Manager (Aily) (non-holder, role=manager): no pill / subtext /
        annotation anywhere.
    WALLiam view (default=King Shah):
      - King Shah row: Crown pill + catch-all subtext + annotations.
        Explicit counts SHOW REAL VALUES (11 territories explicit + 9
        buildings explicit) — annotation appears alongside without
        overwriting; explicit-vs-computed visibly distinct.
      - Neo Smith (non-holder, role=agent): no pill / annotation.
    Cross-tenant safety:
      - Ovais rendered with WALLiam's default_agent_id (synthetic test):
        no pill, no annotation — pivot is on agent.id == THIS tenant's
        default, not on a global flag.
    Null tenant default:
      - When tenantDefaultAgentId is null, no row in the entire table
        gets the annotation.

### Gates

  T1 tsc --noEmit: exit 0
  T3 display proof: 19 assertions PASS
  T4 C12 regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11,
       L2.1), 0 new fails.
  Aily / WALLiam state: unchanged (no DB writes — pure display layer).

### What changed for live operators

  Before: Ovais row read "Territories 0  /  Buildings 0  /  Leads 0",
    visually identical to a brand-new no-territory agent. The Crown
    pill alone (which most operators read as a status badge) didn't
    make clear that this agent computationally owns the remainder.
  After:
    - Ovais row's Role/Hierarchy column shows the existing Crown
      "House Account" pill PLUS a one-line amber sentence stating the
      catch-all semantic in plain language.
    - Each of the three count cells (Territories / Buildings / Leads)
      gains a small amber annotation below the explicit count clearly
      labeling the computed catch-all dimension. The explicit number
      keeps its green styling; the catch-all annotation uses amber
      (matching the Crown pill) so explicit vs computed are visually
      distinct.
    - No counts are faked. No seeding. No schema change. No resolver
      change. Pure display-layer addition driven by the existing
      tenantDefaultAgentId prop (already passed by page.tsx).

### Multi-tenant proof

  Annotation is rendered ONLY when agent.id === tenantDefaultAgentId,
  driven by the SCOPED tenant's own default (already passed per
  request by page.tsx since UNIT 3). Each tenant's house account sees
  its own annotation; no global flag, no per-tenant constant. WALLiam
  test verified inline (King Shah's row carries the annotation under
  the WALLiam-scoped view). Tenant #3 onboarding requires zero
  change — same prop path, same display rule.

### Backups (timestamps)

  components/admin-homes/AgentsManagementClient.tsx.backup_20260626_105037
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260626_105324

### Open follow-ups

  - Live operator click-test on aily.ca: Ovais row shows the Crown pill
    plus a one-line amber catch-all sentence; the three count cells
    each show "0 explicit" plus an amber "+ catch-all (...)" line.
    Non-house rows unchanged.
  - If per-tenant unassigned-scope counts become cheap in a future unit
    (e.g. a materialized "tenant geo universe" table), the catch-all
    line can be upgraded from text-only to "+ N (catch-all)" without
    further structural change.

### Commit gate

  1 app file + tracker shipped together (live-tracker rule). HOLD push
  pending operator instruction.

---

## W-HOUSE-ACCOUNT UNIT 23 RUN-LOG (2026-06-26) — single house-account picker

Operator decision: the Unit 21 per-row "..." menu (one kebab per
eligible non-holder row) clutters the dashboard. Replace with ONE
independent picker in the Tenant Owner header: agent select dropdown
+ Set button. Reuses the validated PATCH path; no DB write of any
new kind.

### Recon (preserved)

  R1. The Unit 21 per-row kebab lives in AgentRow's Actions cell as
      an IIFE gated on canSetHouseAccount && tenantId &&
      targetIsEligible; the only menu item calls
      setAsHouseAccount(agent.id, agent.full_name). PATCH path:
        PATCH /api/admin-homes/tenants/[tenantId]
        body: { default_agent_id: <id> }
      Reusable verbatim by the new single picker.
  R2. The Tenant Owner header card (UNIT 5, line 504-536) is the
      clean placement: it already shows the owner + Crown House
      Account pill in one block — the picker sits just below.
  R3. Eligible list = page-level agents array (already active +
      site_type='comprehensive' + tenant-scoped) MINUS role='assistant'
      (validate_house_account trigger contract; the only excluded
      role). Current holder included, marked "(current)".

### Files

  components/admin-homes/AgentsManagementClient.tsx
    REMOVED:
      - useEffect import (the click-outside handler for the kebab is gone).
      - MoreHorizontal lucide-react import.
      - openMenuAgentId state + the click-outside useEffect that watched it.
      - The per-row IIFE in AgentRow's Actions cell that rendered the
        kebab button + its menu item.
    ADDED:
      - houseAccountDraftId + houseAccountSaving local state seeded
        from tenantDefaultAgentId.
      - Single-picker block inside the Tenant Owner header card
        (below the owner rows), gated to canSetHouseAccount && tenantId:
          * Eligible-agent <select> sorted by full_name, options labeled
            "Full Name -- role (current)" where applicable.
          * "Set as house account" button calling the existing
            setAsHouseAccount handler (same validated PATCH).
          * Disabled when draft === current holder, or saving, or no
            agent selected. Graceful zero-eligible state shows an
            italic explanation instead of a broken control.
          * One-line subtext clarifying who the catch-all is for and
            why assistants are excluded.
      - Non-authorized viewers (no canSetHouseAccount) see the pill
        but no picker -- read-only display preserved.

  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (this run-log)

  No props changed; no server-page change. canSetHouseAccount + the
  agents prop + tenantDefaultAgentId were already threaded through
  AgentsManagementClient since UNIT 21.

### Smoke (picker proof, live DB)

  19 assertions PASS across 5 sections:
    1) Aily picker composition:
       eligible list = [Agent (Aily), Manager (Aily), OVAIS QASSIM];
       Olga (assistant) EXCLUDED; tenant_admin selectable; manager
       selectable; agent selectable.
    2) Set-button disable logic:
       disabled when draft == current (no-op); enabled when draft is
       a different eligible agent; disabled while saving; disabled
       with empty draft; disabled when no eligible agents exist
       (graceful degrade).
    3) WALLiam parity:
       eligible list = [King Shah, Neo Smith, WALLiam]; cross-tenant
       isolation intact (Ovais NOT in WALLiam list; King Shah NOT in
       Aily list).
    4) Picker visibility:
       SHOWN when canSetHouseAccount=true AND tenantId set; HIDDEN
       in non-admin / cross-tenant-universal-view paths.
    5) Per-row clutter check:
       openMenuAgentId / MoreHorizontal absent from source (grepped).

### Gates

  T1 tsc --noEmit: exit 0
  T3 picker proof: 19 assertions PASS
  T4 C12 regression: 17 PASS / 3 FAIL -- same baseline (c8b-2, c11,
       L2.1), 0 new fails.
  Aily / WALLiam state: unchanged (no DB writes; validated PATCH
       reused exactly).

### What changed for live operators

  Before (post-UNIT 21):
    - Eligible non-holder rows showed a small "..." kebab on the
      right of the Actions cell; clicking opened a one-item menu
      with "Set as house account". One kebab per eligible row =
      N controls.
  After (UNIT 23):
    - No per-row kebab anywhere. AgentRow Actions cell renders
      Edit / Assign / Add Agent / Remove / Delete only.
    - Tenant Owner header at the top of the page now hosts a single
      "House account" select + Set button. Pick an eligible agent,
      click Set, done.
    - Non-admin viewers see only the House Account Crown pill on
      the owner row (read-only), no picker.

### Multi-tenant proof

  Eligible list filter operates on the `agents` prop, which page.tsx
  scopes to the active tenant. Cross-tenant proof inline: WALLiam's
  agent set is disjoint from Aily's (verified by smoke).
  canSetHouseAccount + tenantId guards prevent cross-tenant-universal-
  view writes by hiding the picker entirely. Tenant #3 onboarding
  requires zero change -- same prop flow.

### Backups (timestamps)

  components/admin-homes/AgentsManagementClient.tsx.backup_20260626_112020
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260626_112313

### Open follow-ups

  - Live operator click-test on aily.ca:
    - Verify rows show NO kebab / no per-row set-house action; only
      the original Edit/Assign/Add Agent/Remove/Delete buttons.
    - Verify the Tenant Owner card shows a "House account" dropdown +
      Set button; dropdown lists Agent (Aily), Manager (Aily), OVAIS
      (current); does NOT list Olga.
    - Select Manager (Aily), click Set: page reloads, Crown pill +
      catch-all annotations move to Manager (Aily)'s row; dropdown
      default updates accordingly.
    - Set back to OVAIS, verify pill returns.
    - Open as a plain agent / manager viewer: picker not present;
      Crown pill still visible.

### Commit gate

  1 app file + tracker shipped together (live-tracker rule). HOLD
  push pending operator instruction.

---

## W-TENANT-ASSISTANT UNIT 25 RUN-LOG (2026-06-26) — close assistant admin-rights privilege gap (anchor-derived gating)

Operator-locked Option B: keep one DB role ('assistant'), derive
admin-rights from the SAME reports-to anchor that already drives
lead-flow (Unit 19). Single source of truth — no schema change, no
new role, no dropdown change.

### The gap (UNIT 24 recon)

  canSetHouseAccount + canSetOversightOptOut admitted position=='assistant'
  FLATLY in BOTH the UI gate (app/admin-homes/agents/page.tsx) and the
  API PUT route gates (app/api/admin-homes/agents/[id]/route.ts L154,
  L202). Result: ANY assistant -- including one reporting to a solo
  agent -- had tenant-wide admin rights (set house account, opt-out
  others, change roles). Unit 19 had already correctly scoped lead-flow
  by anchor; admin-rights diverged.

  The PATCH /tenants/[id] route (set-house) is unaffected by this gap
  -- it goes through can(tenant.write) which requires isTenantAdminTier
  (lib/admin-homes/permissions.ts:138) and assistants are NOT in that
  tier. So the set-house API was safe by accident; the agents/[id] PUT
  route was the live escalation path.

### Locked model

  An assistant's admin-rights mirror their lead-flow scope:
    - Top-tier-anchored (reports up to tenant owner / house account,
      possibly through other assistants) -> sees all + admin rights.
    - Branch-anchored (reports to manager / area_manager / agent) ->
      sees only that branch + NO tenant-wide admin rights.
    - No anchor / cycle / inactive anchor -> no scope + no admin rights.

  Single source of truth = Unit 19's resolveAssistantAnchor. No second
  implementation. New helper viewerIsTopTierAssistant() wraps it for
  the gate call sites.

### Files

  lib/admin-homes/assistant-anchor.ts
    + viewerIsTopTierAssistant(user, supabase): Promise<boolean>
      - Short-circuits to false for non-assistant viewers (cheap; no
        DB call).
      - For position='assistant', fetches tenants.default_agent_id
        once + calls resolveAssistantAnchor; returns anchor.isTopTier.
      - Tenant-scoped via the underlying walk.

  app/admin-homes/agents/page.tsx
    + Imports viewerIsTopTierAssistant.
    + Computes viewerAssistantIsTopTier ONCE per request.
    + Tightens both UI gates:
        canSetOversightOptOut = isPlatformAdmin || role==='admin'
                              || position==='tenant_admin'
                              || (position==='assistant' && viewerAssistantIsTopTier)
        canSetHouseAccount    = isPlatformAdmin
                              || position==='tenant_admin'
                              || (position==='assistant' && viewerAssistantIsTopTier)

  app/api/admin-homes/agents/[id]/route.ts
    + Imports viewerIsTopTierAssistant.
    + Computes viewerAssistantIsTopTier ONCE at PUT entry (after the
      can() decision; before the per-field gate branches).
    + Replaces the flat position==='assistant' clause in BOTH
      gates with the same (position==='assistant' && viewerAssistantIsTopTier)
      pattern:
        - notification_preferences (opt-out) write gate (L154 area)
        - role change write gate (L202 area)
    + Branch-scoped assistants now receive 403 from the API for these
      writes -- not just hidden from the UI. Security backstop tight.

  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (this run-log)

  validate_house_account trigger (Phase 1): UNCHANGED. HOUSE_ELIGIBLE_ROLES:
  unchanged (still excludes assistant as house-account TARGET). Unit
  19's assistant-anchor logic + lead-flow scoping: unchanged.
  normalizePosition + agents.role CHECK + AddAgent/EditAgent dropdowns:
  unchanged (operator-locked: distinction is anchor-derived, not role-
  derived).

### Smoke (gate matrix, SAVEPOINT-isolated synthetic Aily mini-org)

  Built 11 synthetic agents under Aily:
    M1                  manager,    parent=Ovais
    A_top               assistant,  parent=Ovais                  [TOP TIER]
    A_branch_mgr        assistant,  parent=M1                     [branch via manager]
    A_chain_top         assistant,  parent=A_top -> Ovais         [TOP TIER via chain]
    A_solo              agent,      parent=NULL
    A_branch_solo       assistant,  parent=A_solo                 [branch via agent]
    A_orphan            assistant,  parent=NULL                   [no anchor]
    A_cycle1+A_cycle2   assistants, mutual                        [cycle]
    inactive_mgr        manager,    parent=Ovais,  is_active=false
    A_branch_inactive   assistant,  parent=inactive_mgr           [inactive anchor]

  37 assertions PASS. Key results:
    - top-tier assistant: isTop=true,  canOptOut=true,  canSetHouse=true
    - top-tier-via-chain: isTop=true,  canOptOut=true,  canSetHouse=true
    - branch (-> manager): isTop=false, canOptOut=FALSE, canSetHouse=FALSE   <-- gap closed
    - branch (-> agent):   isTop=false, canOptOut=FALSE, canSetHouse=FALSE   <-- gap closed
    - orphan:              isTop=false, canOptOut=FALSE, canSetHouse=FALSE   <-- gap closed
    - cycle:               isTop=false, canOptOut=FALSE, canSetHouse=FALSE   <-- gap closed
    - inactive-anchor:     isTop=false, canOptOut=FALSE, canSetHouse=FALSE   <-- gap closed
    - tenant_admin Ovais:                  canOptOut=true,  canSetHouse=true (unchanged)
    - platform_admin:                      canOptOut=true,  canSetHouse=true (unchanged)
    - plain manager M1:                    canOptOut=false, canSetHouse=false (unchanged)
    - plain agent A_solo:                  canOptOut=false, canSetHouse=false (unchanged)
    - DB role='admin' + non-top-tier pos:  canOptOut=TRUE,  canSetHouse=FALSE
      (Unit 21 distinction preserved: opt-out broader than set-house;
       DB role='admin' admitted to opt-out but not to set-house.)

  Lead-flow unchanged proof:
    - top-tier assistant: viewerIsTopTierAssistant=true (admin-rights)
      AND resolveAssistantAnchor.isTopTier=true (lead-flow). Agree.
    - branch assistant: both false. Agree. Coherent model.

  Post-cleanup: 0 synthetic rows remaining (verified via fresh conn).

### Gates

  T1 tsc --noEmit: exit 0
  T2 gate matrix: 37 assertions PASS (esp. branch-scoped assistants
       DENIED, top-tier assistants KEPT, all non-assistant viewers
       UNCHANGED, opt-out vs set-house distinction preserved)
  T3 lead-flow unchanged: viewerIsTopTierAssistant agrees with
       resolveAssistantAnchor.isTopTier (same predicate; no drift)
  T4 C12 regression: 17 PASS / 3 FAIL -- same baseline (c8b-2, c11,
       L2.1), 0 new fails.
  Aily / WALLiam state: unchanged (no DB writes).

### What changed for live operators / API consumers

  Before:
    - An assistant created via "Tenant Assistant" dropdown — regardless
      of WHERE they were placed in the reports-to tree — got tenant-
      wide admin rights (opt-out toggle, set-house picker, role-edit).
    - Branch-scoped assistant (e.g. reporting to a manager) could
      escalate privileges via the agents/[id] PUT API even with the
      UI hidden.
  After:
    - "Tenant Assistant" is REAL only when placed under the tenant
      owner / house account (possibly via another top-tier assistant).
      Operator places the assistant at top tier in the reports-to chart
      to grant top-tier rights; placing them under a manager keeps them
      branch-scoped on BOTH lead-flow and admin-rights.
    - The agents/[id] PUT API returns 403 for branch-scoped assistant
      callers attempting opt-out / role-change writes. Security
      backstop is consistent with the UI gate.

### Multi-tenant proof

  viewerIsTopTierAssistant -> resolveAssistantAnchor -> tenant_id
  filtered on every visited row (Unit 19 invariant unchanged). All
  three call sites pass user.tenantId for the walk. Tenant #3 zero-
  change.

### Backups (timestamps)

  lib/admin-homes/assistant-anchor.ts.backup_20260626_113227
  app/admin-homes/agents/page.tsx.backup_20260626_113227
  app/api/admin-homes/agents/[id]/route.ts.backup_20260626_113227
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260626_113651

### Open follow-ups

  - Live operator click-test on aily.ca:
    - Create a top-tier assistant (reports-to = Ovais): logs in,
      sees house-account picker + opt-out + role-edit; can save
      changes successfully.
    - Create a branch assistant (reports-to = Manager (Aily)): logs
      in, NO house-account picker; opt-out toggle hidden in
      EditAgentModal; attempting role-change via the API returns
      403.
    - Lead-flow regression: send a test lead matched to Manager
      (Aily)'s branch -> branch assistant receives BCC. Send a
      lead matched to a different branch -> branch assistant does
      NOT receive BCC. Top-tier assistant receives BCC on every
      lead (Unit 19 unchanged).
  - PATCH /tenants/[id] (set-house) is already strict via
    can(tenant.write); no further tightening needed.

### Commit gate

  3 app files + tracker shipped together (live-tracker rule). HOLD
  push pending operator instruction.

---

## W-TENANT-ASSISTANT UNIT 27 RUN-LOG (2026-06-26) — split 'assistant' into two real roles

Operator-locked model — SUPERSEDES Unit 25's anchor-based admin gating:
  - tenant_assistant: DISTINCT top-tier role, equal-to-tenant. Full
    admin rights BY ROLE (set house account, opt-out others, edit
    roles). Top-tier lead/email copies BY ROLE. House-account
    eligible.
  - assistant: branch-scoped (Unit 19 unchanged). Reports to anyone;
    inherits anchor's lead flow. NO tenant-wide admin rights
    (reversing Unit 25's anchor-grant for plain assistant). NOT
    house-account eligible.
  - Access decided by the LOGGED-IN user's ROLE, not inferred from
    org position at request time.

### G1 + G2 migration (live)

  supabase/migrations/20260626_w_tenant_assistant_role_and_house_eligible.sql:
    (1) ALTER TABLE agents — extend role CHECK to include
        'tenant_assistant' (superset).
    (2) CREATE OR REPLACE FUNCTION validate_house_account — add
        'tenant_assistant' to eligible-role list; other 3 conditions
        byte-identical to d39941f; plain 'assistant' stays excluded.

  Applied via scripts/apply-tenant-assistant-role.js (deleted
  post-success). Snapshot retained:
    rollback-snapshots/_tenant-assistant-role_2026-06-26T16-01-20-014Z.sql

  Runner smokes:
    SMOKE A PASS: tenant_assistant INSERT accepted (CHECK extension)
    SMOKE B PASS: plain assistant INSERT still accepted (superset)
    SMOKE C PASS: tenant_assistant settable as house account (trigger)
    SMOKE D PASS: plain assistant STILL rejected as house account
    SMOKE E PASS: bogus role still CHECK-rejected
    SMOKE F PASS: inactive tenant_assistant rejected (cond c preserved)
  Post-sanity: Aily.default=Ovais, WALLiam.default=King Shah unchanged.

### B-phase (app layer)

  lib/admin-homes/auth.ts
    + 'tenant_assistant' added to AdminHomesPosition union + ALL_POSITIONS.
    + isValidDbRole now admits 'assistant' (was missing — Unit 11
      catch-up) and 'tenant_assistant'.
  lib/admin-homes/permissions.ts
    + 'tenant_assistant' added to DbRole.
    + isTenantAdminTier now admits 'tenant_assistant' (full Tier 4
      authority via can() — equal to tenant_admin owner per operator
      model).
  lib/admin-homes/assistant-anchor.ts
    + resolveAssistantAnchor isTopTier classifier: added
      `role === 'tenant_assistant'` so a plain assistant reporting
      up to a tenant_assistant correctly inherits tenant-wide (chain
      resolves to top tier).
    + Unit 25's viewerIsTopTierAssistant helper REMOVED (no remaining
      call site; admin-rights are now role-based, not anchor-derived).
  lib/admin-homes/lead-email-recipients.ts
    + NEW block: tenant_assistant top-tier copies — every active
      tenant_assistant in the tenant gets BCC by ROLE (parallel to
      the tenant_owner block, no anchor walk). Plain 'assistant'
      block (Unit 19 anchor-walk) UNCHANGED.
  app/admin-homes/agents/page.tsx
    + viewerIsTopTierAssistant import + computation REMOVED.
    + Both gates: `(position === 'assistant' && viewerAssistantIsTopTier)`
      replaced with `position === 'tenant_assistant'`. Plain assistants
      now FALSE on both gates regardless of anchor.
  app/api/admin-homes/agents/[id]/route.ts (security backstop)
    + Same Unit 25 helper removal + replacement at both PUT gates
      (notification_preferences + role change).
    + VALID_ROLES extended with 'tenant_assistant'.
  app/api/admin-homes/tenants/[id]/route.ts
    + ELIGIBLE_ROLES extended with 'tenant_assistant' (mirror of
      trigger eligible list).
  app/admin-homes/tenants/[id]/page.tsx
    + Cockpit canSetOversightOptOut prop updated to role-based gate
      (position === 'tenant_assistant', not 'assistant').
  components/admin-homes/AddAgentModal.tsx + EditAgentModal.tsx
    + Role union types extended with 'tenant_assistant'.
    + Dropdown now TWO options:
        Tenant Assistant (top tier) -> tenant_assistant
        Assistant (branch-scoped)   -> assistant
    + Reports-To availableParents filter also admits tenant_assistant.
  components/admin-homes/AgentsManagementClient.tsx
    + ROLE_ORDER: tenant_assistant added at slot 0 (top of non-owner
      ordering).
    + ROLE_LABELS: distinct pill for tenant_assistant (emerald-bordered)
      vs plain assistant (slate). Both clearly visible in the table.
    + House-account picker eligibility comment updated: filter is
      role !== 'assistant' ONLY; tenant_assistant naturally passes.
  components/admin-homes/AgentOrgChart.tsx
    + 'tenant_assistant' added to ALL_ROLES (legend / filter).
  components/admin-homes/AdminHomesSidebar.tsx
    + 'tenant_assistant' added to Agents + Listings + Settings nav
      position lists (Settings becomes accessible to top-tier
      assistants, equal-to-tenant per operator model).
    + POSITION_LABELS: distinct entry for tenant_assistant ("Tenant
      Assistant" purple-500 vs plain "Assistant" slate-400).
  app/admin-homes/agents/tree/page.tsx
    + tenant_assistant admitted to the org chart access gate.

  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (this run-log)

  Unit 19 plain-assistant anchor walk + branch-scoped lead-flow
  UNCHANGED. validate_house_account trigger's other 3 conditions
  UNCHANGED. agents.role 'assistant' value preserved (existing rows
  like Aily's Olga stay branch-scoped without migration).

### Rights matrix (live DB, synthetic Aily mini-org, 25 assertions PASS)

  Synthetic agents: M1 (manager), TA_root (TA -> Ovais),
  TA_branch (TA -> manager), A_root (assistant -> Ovais),
  A_branch (assistant -> manager), A_under_TA (assistant -> TA_root).

  Admin-rights (BY ROLE):
    TA_root (TA, parent=Ovais):       optOut=true,  house=true
    TA_branch (TA, parent=manager):   optOut=true,  house=true  <-- BY ROLE, not anchor
    A_root (asst, parent=Ovais):      optOut=FALSE, house=FALSE <-- Unit 25 REVERSAL
    A_branch (asst, parent=manager):  optOut=FALSE, house=FALSE
    A_under_TA (asst, parent=TA):     optOut=FALSE, house=FALSE
    tenant_admin Ovais:               optOut=true,  house=true
    platform_admin:                   optOut=true,  house=true
    plain manager M1:                 optOut=false, house=false

  House-account TARGET eligibility (trigger):
    tenant_assistant settable as house account: ACCEPTED
    plain assistant: REJECTED (house_account_role_ineligible)

  Lead flow:
    tenant_assistant top-tier query: TA_root + TA_branch (BY ROLE);
    plain assistant A_root NOT included.

  Anchor walk (Unit 19, plain-assistant LEAD-FLOW only):
    A_under_TA -> anchor=tenant_assistant -> isTopTier=TRUE via
      UNIT 27 classifier addition (chain to top via TA inherits tenant-
      wide for LEAD FLOW; admin-rights still gated separately by ROLE).
    A_branch -> anchor=manager -> isTopTier=FALSE (branch unchanged).

  Cleanup: synthetic agents deleted; fresh-conn post-check 0
  residual rows.

### T3 — existing Olga row (Aily plain assistant) regression check

  Olga (role='assistant', parent=NULL, active):
    Under UNIT 27 gates: canSetOversightOptOut=false, canSetHouseAccount=false
    OK -- Unit-25 anchor-grant correctly reversed for plain assistant.
  No data migration; Olga stays role='assistant'. Operator can change
  her to 'tenant_assistant' via Edit Agent if top-tier was intended.

### Gates

  G1 + G2 migration (live; rollback snapshot retained)
  T1 tsc --noEmit: exit 0
  T2 rights matrix (25 assertions PASS):
    admin BY ROLE for tenant_assistant (anchor-irrelevant),
    no admin for plain assistant (Unit 25 reversal),
    trigger eligibility, lead-flow distinction, anchor-walk chain.
  T3 Olga regression: now correctly no admin rights.
  T4 C12: 17 PASS / 3 FAIL -- baseline (c8b-2, c11, L2.1), 0 new.
  Aily / WALLiam state unchanged (post-sanity in runner).

### What changed for live operators

  Before (post-UNIT 25):
    - "Tenant Assistant" dropdown wrote role='assistant'.
    - Admin rights for any 'assistant' depended on whether their
      reports-to anchor resolved to top tier (a confusing,
      anchor-coupled rule that operator rejected).
    - Olga (plain assistant -> NULL parent under Aily) had tenant-
      wide admin rights through Unit 25's anchor heuristic.
  After (UNIT 27):
    - Dropdown is TWO options:
        Tenant Assistant (top tier)   -> writes tenant_assistant
        Assistant (branch-scoped)     -> writes assistant
    - tenant_assistant: full admin BY ROLE, settable as house
      account, top-tier lead copies. Equal-to-tenant.
    - assistant: branch-scoped (Unit 19 lead flow). NO admin.
      NOT house-account-eligible.
    - Olga's row stays role='assistant' (no data migration). Her
      admin rights are now correctly FALSE; operator changes her
      role to tenant_assistant via Edit Agent if top-tier intended.

### Multi-tenant proof

  Every role-based gate keys on the viewer's own user.position from
  auth.ts (per-request derived from the agents row of the logged-in
  user). Lead-flow top-tier query at lead-email-recipients.ts is
  scoped per tenantId. assistant-anchor's tenant-scoped walk
  unchanged. Tenant #3 onboarding zero-change.

### Backups (timestamps)

  lib/admin-homes/auth.ts.backup_20260626_120147
  lib/admin-homes/permissions.ts.backup_20260626_120147
  lib/admin-homes/assistant-anchor.ts.backup_20260626_120147
  lib/admin-homes/lead-email-recipients.ts.backup_20260626_120147
  app/admin-homes/agents/page.tsx.backup_20260626_120147
  app/api/admin-homes/agents/[id]/route.ts.backup_20260626_120147
  app/api/admin-homes/tenants/[id]/route.ts.backup_20260626_120147
  app/admin-homes/tenants/[id]/page.tsx.backup_20260626_120147
  components/admin-homes/AddAgentModal.tsx.backup_20260626_120147
  components/admin-homes/EditAgentModal.tsx.backup_20260626_120147
  components/admin-homes/AgentsManagementClient.tsx.backup_20260626_120147
  components/admin-homes/AgentOrgChart.tsx.backup_20260626_120147
  components/admin-homes/AdminHomesSidebar.tsx.backup_20260626_120147
  app/admin-homes/agents/tree/page.tsx.backup_20260626_120147
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260626_122708

### Open follow-ups

  - Live operator click-test on aily.ca:
    - Create a Tenant Assistant via Add Agent -> verify dropdown
      shows TWO options; pick "Tenant Assistant (top tier)" -> agent
      created with role='tenant_assistant'; log in as them: house-
      account picker visible, opt-out toggle visible, role-edit
      visible. Confirm they receive copies of a test lead.
    - Create an Assistant via the same flow with "Assistant
      (branch-scoped)" -> agent created with role='assistant';
      log in as them: no house-account picker, no opt-out, no
      role-edit. Lead flow depends on reports-to anchor.
    - Edit Olga's role to 'tenant_assistant' to grant top-tier
      rights; revert if it was not intended.
  - Future: if the operator wants tenant_assistant to also bypass
    Phase 1's "deactivate the current house account" guard,
    that's a separate guard in agents/[id] PUT — out of this unit's
    scope.

### Commit gate

  Migration (already applied) + 14 app files + tracker + 1 rollback
  snapshot shipped together (live-tracker rule). HOLD push pending
  operator instruction.

---

## W-TERRITORY-VIEW UNIT 30 RUN-LOG (2026-06-26) — surface the existing territory view (sidebar entry + real page)

Problem (UNIT 29 recon confirmed): 7 production territory views exist
(Agents / Cards / Geography / Pins / Buildings / Health / Detail) all
wired to real endpoints, but reachable ONLY through the cockpit URL
pattern (/admin-homes/tenants/[id]). No "Territory" entry in the
sidebar. The page at /admin-homes/territory was a pure REDIRECT —
never rendered anything. The work was invisible to operators.

Fix shape (operator-locked): discoverability ONLY — no new components,
no changes to the per-agent Assign flow, no changes to the 7 view
components. Promote the redirect-page to a real server page that
mounts the existing TerritoryTab; add a top-level "Territory" entry
to the sidebar.

### Recon-confirm

  R1. app/admin-homes/territory/page.tsx — confirmed pure redirect
      (auth check, then redirect to cockpit or tenants list).
  R2. AdminHomesSidebar.tsx ALL_NAV pattern: `PositionGate =
      'all' | 'platform_admin_only' | AdminHomesPosition[]`. Filter
      at line 44-48 admits via position list. Territory slots between
      Agents and Bulk Sync (operations grouping).
  R3. Server-page scope pattern from app/admin-homes/agents/page.tsx:
      `resolveAdminHomesUser` + `getCurrentTenantId` + scope.ts
      `isCrossTenantView` / `getScopedTenantId`. Cross-tenant
      universal view (platform_admin no host/no selected) → redirect
      to /admin-homes/tenants (same fallback as the prior redirect).
  R3b. TerritoryTab is a 'use client' component, mountable from a
      server page. Default view was hardcoded 'agents'.

### Files

  app/admin-homes/territory/page.tsx
    BEFORE: pure redirect to cockpit / tenants list.
    AFTER:  real server page that:
      - resolves user + scoped tenant via the same pattern as
        app/admin-homes/agents/page.tsx
      - universal-view (no tenant scope) -> redirect to
        /admin-homes/tenants (pick a tenant; matches prior fallback)
      - tenant-scoped viewer -> fetches scoped tenant name
        (allow-list: id, name only; no SELECT *) and renders
        TerritoryTab with defaultView="geography" (operator-locked
        landing — the "who owns which scope" picture)
      - Page header explains the views in plain language.

  components/admin-homes/AdminHomesSidebar.tsx
    + One new ALL_NAV entry between Agents and Bulk Sync:
        { href: '/admin-homes/territory', label: 'Territory', icon: '🗺️',
          positions: ['tenant_admin', 'tenant_assistant', 'assistant',
                      'area_manager', 'manager', 'agent'] }
    Visible to everyone who can have territory; platform_admin sees
    it too because they're synthesized to position='tenant_admin'
    via auth.ts. legacy 'support'/'managed' positions excluded.

  components/admin-homes/cockpit/tabs/TerritoryTab.tsx
    + Optional `defaultView?: View` prop added (default 'agents').
      Cockpit callers omit the prop -> behavior identical.
      Standalone page passes defaultView="geography".
    No other change. The 7 view components — AgentsView, CardsView,
    GeographyView, PinsView, BuildingsView, HealthView,
    TerritoryCascadeChart — are UNTOUCHED.

  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (this run-log)

  Per-agent Assign flow (Assign button on /admin-homes/agents →
  /admin-homes/agents/[id] with Geo / Building / Listing assignment
  sections) UNTOUCHED. Two complementary surfaces: per-agent form-
  driven + per-tenant hierarchy-driven.

### Smoke (nav + page-resolution mirror, no DB writes)

  23 assertions PASS across 4 sections:
    1) Sidebar Territory entry visibility (9 viewer profiles):
       - platform_admin: TRUE (synthesized as position='tenant_admin')
       - tenant_admin Ovais: TRUE
       - tenant_assistant: TRUE (UNIT 27)
       - plain assistant: TRUE
       - area_manager: TRUE
       - manager: TRUE
       - plain agent: TRUE
       - support (legacy): FALSE (not in positions list)
       - managed (legacy): FALSE
    2) Page resolution mirror (5 scenarios):
       - platform_admin on aily.ca host -> render Aily territory
       - platform_admin no scope (universal) -> redirect to tenants
       - tenant-scoped owner Ovais on aily.ca -> render Aily
       - tenant-scoped owner on walliam.ca -> render WALLiam
       - plain agent on aily.ca -> render Aily
    3) Per-agent Assign flow integrity:
       - Assign button still links to /admin-homes/agents/[id]
         with MapPin icon (regex match verified)
       - per-agent page still exists
    4) Territory view files untouched (file-existence check):
       - AgentsView, CardsView, GeographyView, PinsView,
         BuildingsView, HealthView, TerritoryCascadeChart all
         present.

### Gates

  T1 tsc --noEmit: exit 0
  T3 nav + page-resolution proof: 23 assertions PASS
  T4 C12 regression: 17 PASS / 3 FAIL — same baseline (c8b-2, c11,
       L2.1), 0 new fails.
  Aily / WALLiam state: unchanged (no DB writes — pure mount + nav).

### What changed for live operators

  Before:
    - No "Territory" link anywhere in the sidebar.
    - /admin-homes/territory just redirected to the cockpit / tenants
      list — never showed a view.
    - The 7 production territory views were reachable only by drilling
      into the cockpit per-tenant. Tenant-scoped operators landed
      there via auto-redirect but had no signal that "Territory" was a
      sub-tab; platform admins had to know the cockpit URL pattern.
  After:
    - Sidebar shows "Territory" (map pin icon) to every viewer who
      can have territory.
    - Click -> lands on /admin-homes/territory, scoped to the viewer's
      tenant, with GeographyView as the default sub-view (the
      "who owns which scope" overview, ASSIGNED / INHERITED / NONE
      per scope per access-type, carve-up modal one click away).
    - All 6 other sub-views (Agents/Cards/Pins/Buildings/Health/
      Detail) reachable via the in-page tab bar that was already there.
    - For Aily today (UNIT 28 data): GeographyView shows ~0 ASSIGNED
      rows + everything else INHERITED from the house account — the
      blank-canvas-with-fallback picture the operator described as
      "the work is wired but invisible." Now visible.

### Multi-tenant proof

  Page resolves scoped tenant the same way every other admin-homes
  page does (scope.ts isCrossTenantView + getScopedTenantId). Tenant
  name fetch uses an explicit allow-list (id, name) — no SELECT *.
  TerritoryTab + its 7 sub-views are already tenant-scoped via the
  tenantId prop (queries all filter by tenant_id). Tenant #3
  onboarding: zero change — same prop flow.

### Backups (timestamps)

  app/admin-homes/territory/page.tsx.backup_20260626_150309
  components/admin-homes/AdminHomesSidebar.tsx.backup_20260626_150309
  components/admin-homes/cockpit/tabs/TerritoryTab.tsx.backup_20260626_150309
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260626_150537

### Open follow-ups

  - Live operator click-test on aily.ca:
    - Sidebar shows "Territory" (map pin icon) — click navigates
      to /admin-homes/territory.
    - GeographyView renders by default — area / municipality /
      community drill, ASSIGNED / INHERITED / NONE per scope, carve-up
      modal reachable.
    - In-page tab bar still works — switch to AgentsView, CardsView,
      etc. without leaving the page.
    - Per-agent Assign flow on /admin-homes/agents/[id] still opens
      with the same Geo / Building / Listing sections and writes
      to the same endpoints. No regression.
    - Platform_admin universal view (no host, no selected tenant)
      → /admin-homes/territory redirects to /admin-homes/tenants.

### Commit gate

  1 server page + 1 sidebar file + 1 client wrapper (defaultView
  prop) + tracker shipped together (live-tracker rule). HOLD push
  pending operator instruction.

---

## W-TERRITORY-VIEW UNIT 32 RUN-LOG (2026-06-27) — standalone Territory destination for platform_admin

Problem (operator-verified in browser after UNIT 30 ship): platform_admin
navigates via the sidebar but does NOT see a Territory entry. The only
path to territory is Tenants -> click a tenant -> Territory tab inside
the cockpit. Operator wants a sidebar door that works WITHOUT entering
a tenant first, landing on the geo ownership map.

Root cause: UNIT 30's Territory sidebar entry used an array-of-positions
gate. In SOME platform_admin session states (where their derived
`user.position` falls outside the array), the entry is hidden. The
`platform_admin_only` gate (used by Tenants + Bulk Sync) is bypassing
position entirely via `user.isPlatformAdmin === true`; array gates were
not. Also, the page redirected platform_admin-no-scope to /admin-homes/
tenants — a bounce rather than an in-page destination.

### Recon-confirm

  R1. AdminHomesSidebar.tsx filter (line 49-53): array gates only
      check `item.positions.includes(user.position)`. Platform_admin
      sees array-gated entries only when their derived position is
      in the array. Bulk Sync + Tenants bypass via `'platform_admin_only'`
      (line 51). Territory needs the same bypass admission WITHOUT
      removing tenant-position visibility.
  R2. /admin-homes/territory/page.tsx (UNIT 30) redirects no-scope
      to /admin-homes/tenants (line 43-45). TerritoryTab props:
      tenantId, tenantName, actingAgentId, defaultView (optional).
  R3. /admin-homes/tenants/page.tsx uses `.select('*')` on tenants
      (line 18) — a CLAUDE.md violation; will NOT replicate. The
      picker uses explicit allow-list: id, name, domain, brand_name.

### Files

  components/admin-homes/AdminHomesSidebar.tsx
    + One-line filter change at line 49-53: array-gated entries now
      ALSO admit `user.isPlatformAdmin === true`, in addition to the
      existing position-array match. No structural change to ALL_NAV.
      Comment block explaining the operator-locked model:
      platform_admin is a meta-role admitted to every nav an array
      gate admits, mirroring the bypass that platform_admin_only
      entries already have.

  app/admin-homes/territory/page.tsx
    + searchParams typed: { tenant_id?: string }.
    + UUID_RX regex defined for param validation.
    + Replaced the universal-view redirect with three branches:
        a) Platform_admin + ?tenant_id present + UUID-valid + tenant
           exists -> set scopedTenantId = param, render territory.
        b) No scope after that resolution AND user is platform_admin
           -> fetch tenants list (allow-list: id, name, domain,
           brand_name) + render in-page picker (links to ?tenant_id=).
        c) No scope AND user is NOT platform_admin -> defensive
           redirect to /admin-homes (should not happen via normal
           paths; their session already scoped them).
    + When platform_admin is browsing via picker (seeAll && param),
      a "Switch tenant" link appears in the page header so they can
      return to the picker without retyping URLs.
    + Tenant-scoped users: unchanged from UNIT 30 (direct render,
      no picker, no Switch tenant link).
    + The ?tenant_id param is ONLY honored for platform_admin —
      tenant-scoped users have it ignored (can't jump to another
      tenant via URL).

  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (this run-log)

  Untouched: per-agent Assign flow, all 7 territory view components
  (AgentsView / CardsView / GeographyView / PinsView / BuildingsView /
  HealthView / TerritoryCascadeChart), TerritoryTab dispatcher,
  cascade-walker, audit-sidebar.

### Smoke (logic mirror + live dev compile)

  34 logic assertions PASS:
    Sidebar Territory visibility (12 viewer profiles):
      - platform_admin in any position (tenant_admin / agent /
        support / managed): TRUE  <-- the bug fix
      - tenant_admin, tenant_assistant, assistant, area_manager,
        manager, agent (non-platform): TRUE (unchanged)
      - legacy support / managed (non-platform): FALSE (unchanged)
    Existing platform_admin_only entry: unchanged.
    "all" gate: unchanged.
    Page resolution (8 scenarios):
      - platform_admin no scope, no param -> picker
      - platform_admin no scope, valid Aily param -> render Aily,
        showPickerSwitch=true
      - platform_admin no scope, bogus param -> picker
      - platform_admin on aily.ca host -> render Aily,
        showPickerSwitch=false (host-scoped)
      - tenant-scoped Aily user -> render Aily, switch hidden
      - tenant-scoped user with ?tenant_id=WAL -> param IGNORED,
        renders OWN tenant (defensive)
      - WALLiam user on walliam.ca -> render WALLiam
      - non-platform no scope -> defensive redirect /admin-homes
    Allow-list compliance: SELECT * absent; explicit selects present.
    7 territory view files: all present (file-existence verified).

  Live dev compile (npm run dev):
    /admin-homes/territory compiles in 1.7s (2762 modules).
    HTTP smoke:
      GET /admin-homes/territory (Host: aily.ca)    -> 307 to login
      GET /admin-homes/territory (Host: walliam.ca) -> 307 to login
      GET /admin-homes/territory?tenant_id=AILY     -> 307 to login
      GET /admin-homes/agents/<Ovais>               -> 307 to login
    All four routes 307 (middleware auth gate). No 500, no compile
    error, no hang. The picker / TerritoryTab branches all execute
    in compile but page reaches the auth gate first under curl.

### Gates

  T1 tsc --noEmit: exit 0
  T2 logic-proof smoke: 34 assertions PASS
  T3 dev compile + 4-route HTTP smoke: all 307 with no error;
     /admin-homes/territory compiled in 1.7s.
  T4 C12 regression: 17 PASS / 3 FAIL -- same baseline (c8b-2,
     c11, L2.1), 0 new fails.
  Aily / WALLiam state unchanged (no DB writes -- pure mount + nav).

### Live render-truth gap (acknowledged honestly)

  This unit's mechanical proofs verify:
    - the sidebar filter admits platform_admin to array gates,
    - the page compiles and reaches the auth gate without crashing,
    - the logic for picker vs render is correct,
    - SELECT * is NOT used.
  This unit's mechanical proofs do NOT verify (would require
  authenticated browser session):
    - the rendered picker UI for a logged-in platform_admin,
    - GeographyView landing for a chosen tenant,
    - the visible "Territory" entry in the operator's actual sidebar
      with their specific platform_admin account state.
  Operator click-test required before push.

### What changed for live operators

  Before (UNIT 30):
    - Tenant-scoped users: Territory sidebar entry visible -> page
      renders their tenant's territory directly (UNIT 30 works).
    - Platform_admin: Territory entry hidden in some session-state
      combinations; /admin-homes/territory bounced to tenants list.
      No standalone territory destination for platform_admin.
  After (UNIT 32):
    - Tenant-scoped users: unchanged from UNIT 30.
    - Platform_admin: Territory sidebar entry now ALWAYS visible
      (one-line filter admission). Click -> if no tenant scope and
      no ?tenant_id, see an in-page picker listing tenants by
      brand_name / domain. Click a tenant -> SAME page now renders
      that tenant's GeographyView. A "Switch tenant" link returns
      to the picker.
    - DB role='admin'-alone viewers (non-platform): UNIT 25/27
      distinction preserved; no admin-rights creep.

### Multi-tenant proof

  Tenant list query uses an explicit allow-list (id, name, domain,
  brand_name) — no SELECT *. The ?tenant_id param is validated
  against the tenants table; bogus / non-existent UUIDs fall through
  to the picker. tenant-scoped users have the param IGNORED — they
  can't jump tenants via URL. Tenant #3 onboarding: zero change.

### Backups (timestamps)

  components/admin-homes/AdminHomesSidebar.tsx.backup_20260627_053718
  app/admin-homes/territory/page.tsx.backup_20260627_053718
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260627_055330

### Open follow-ups

  - Operator click-test on the platform_admin session: sidebar shows
    Territory; click -> picker lands; pick aily -> GeographyView for
    Aily renders (everything INHERITED from Ovais / house account, 0
    explicit apa); "Switch tenant" link works; pick walliam ->
    GeographyView for WALLiam. Per-agent Assign on /agents/[id]
    unchanged. Then "go push 06e34ab + UNIT 32 commit".

### Commit gate

  2 app files + tracker shipped together (live-tracker rule). HOLD
  push pending operator click-test + go.

---

## UNITS 30 + 32 — PUSH RECORD (2026-06-27)

Operator authorized push without local click-test; verification moves to
live aily.ca post-deploy. Both units shipped to origin/main in one push.

### Pre-push gate (all green)

  - origin/main pre-push:  2073493 (UNIT 27)
  - HEAD:                  bca5a41 (UNIT 32)
  - HEAD~1:                06e34ab (UNIT 30)
  - Both commits ahead of origin/main: verified
  - System 1 zero-diff check (app/admin/*, app/api/chat/*,
    agent_buildings): EMPTY — no System 1 file touched
  - tsc --noEmit: exit 0
  - C12 regression: 17 PASS / 3 FAIL — baseline (c8b-2, c11, L2.1),
    0 new fails
  - Tracker reflects both unit run-logs

### Push

  git push origin main 2>&1
  -> 2073493..bca5a41  main -> main

  origin/main post-push:   bca5a41
  HEAD:                    bca5a41 (==origin/main)
  ahead of origin: empty (up-to-date)

### Vercel deploy status

  Push to main auto-triggers Vercel deploy via the GitHub integration.
  I cannot directly query Vercel's build queue from CLI (no API token
  in scope), but the live production site is responsive post-push:

  https://aily.ca/                                 308 (apex -> www; standard)
  https://aily.ca/admin-homes/territory            308 -> www
  https://www.aily.ca/admin-homes/territory        200 via middleware redirect to /login (auth gate fires, route resolves)
  X-Vercel-Id: fra1::47fk9-...                     served by Vercel
  Server: Vercel

  No 500 or build-error at the route level. If a build error materializes
  on Vercel's dashboard the deploy would not promote — operator should
  spot-check the Vercel dashboard.

### Render-truth — STILL PENDING (operator click-test on aily.ca)

  These verifications cannot be done from CLI (require authenticated
  session in a real browser). Operator click-test plan:

  Live URL to test: https://www.aily.ca/admin-homes/territory

  Logged in as platform_admin:
    1. Sidebar should show "Territory" entry (🗺️) on every admin-homes
       page — was hidden pre-UNIT 32.
    2. Click Territory with no tenant entered -> in-page tenant
       picker should render, listing aily + walliam (allow-list select
       respected). NO bounce to /admin-homes/tenants.
    3. Click "aily" -> GeographyView should land for Aily:
       area->muni->community drill, condo/homes/buildings columns,
       everything INHERITED from Ovais / house account (0 explicit
       apa rows for Aily — UNIT 28 data), 0 ASSIGNED, 0 NONE.
       "Switch tenant" link visible in page header.
    4. Click "Switch tenant" -> back to picker -> click "walliam" ->
       GeographyView for WALLiam renders.
    5. Per-agent Assign on /admin-homes/agents/<id> still mounts the
       Geo / Building / Listing assignment sections (regression check).

  Logged in as tenant-scoped Aily user (e.g. Ovais):
    6. Sidebar Territory entry visible (UNIT 30 behavior; unchanged).
    7. Click Territory -> direct render of Aily territory, NO picker,
       NO "Switch tenant" link.
    8. ?tenant_id=WALLIAM in URL -> IGNORED, still renders Aily
       (defensive; can't jump tenants via URL).

### Status (pushed, render-truth pending click-test)

  UNIT 30 06e34ab — PUSHED
  UNIT 32 bca5a41 — PUSHED
  Vercel deploy auto-triggered; production responsive at route level
    (200 through auth-gate redirect; no 500).
  Operator click-test pending — sidebar visibility + picker render +
    GeographyView land + tenant-scoped behavior + Assign regression.

### Commit gate (this PUSH record)

  Tracker-only delta. Will be folded into the next unit's commit per
  the operator's request style (push records typically land in the
  next unit's commit boundary).

---

## W-TERRITORY-SMOKE UNITS 33 + 34 (2026-06-27)

UNIT 33 — full territory audit (read-only, no fixes).
UNIT 34 — buildings rollup + listing label + apa-card tie-break root fix
+ regression baseline.

### UNIT 33 audit findings (verbatim)

  A1. BUILDINGS=0 root cause: (b) architecturally not rolled up.
      buildings.community_id is the only geo FK; geo-rollup/route.ts:159-164
      hardcodes `0::int` except at community level. DB CAN produce the
      rollup via community -> muni -> area (proven query).
      Expected post-fix area counts: Toronto=3,383, Ottawa=1,780,
      York=572, Peel=556, Halton=449, Simcoe=431, Niagara=276,
      Hamilton=243, Durham=208, Middlesex=199, Wellington=156,
      Muskoka=128.

  A2. LISTING COUNTS (Durham/Frontenac/Toronto): MV applies 2-year
      recency window; direct-join all-time count is higher. NOT a bug
      — column header just doesn't say "(last 2 yrs)". Cosmetic.

  A3. INHERITED owner: correct, no hardcode. Aily default -> Ovais
      (tenant_admin, active); WALLiam -> King Shah.

  B1-B3. Resolver cascade verified: 8-arg signature, P1->P-HOUSE
      cascade in 20260625_w_gov_phase1_house_account_fallback.sql,
      P-HOUSE terminal with tenant_id + is_active check.
      Fan-out: 4 lead routes call resolve_agent_for_context then
      getLeadEmailRecipients (charlie/lead, walliam/contact,
      charlie/appointment, lib/actions/leads).

  C1. F-HASH-RR-NOT-IMPLEMENTED — MIXED:
      pick_floor_agent (floor pool) FIXED with hash-RR.
      pick_routing_agent_for_type (apa-card layer) NO ORDER BY.
      But: 4 existing partial unique indexes
      (uniq_apa_primary_{area,community,muni,neighbourhood}) ALREADY
      enforce per-scope uniqueness, making C1 unfireable under current
      invariants. STILL: add ORDER BY as insurance for future
      invariant evolution.

  C2. F-NON-SELLING-PRIMARY-SILENT-FAILOVER — NOT PRESENT (already
      fixed). All 4 routes + the TS wrapper apply
      is_active+is_selling re-checks on the mls_listings cache via
      inner-join filter. Live data: WALLiam 1,355,999 assigned
      listings all link to active+selling agents; 0 stale.

### UNIT 34 fixes applied

  FIX 1 — buildings rollup (HIGH, code-only):
    app/api/admin-homes/territory/geo-rollup/route.ts:159-176
    The buildingCountExpr block extended:
      community  -> COUNT(*) FROM buildings b WHERE b.community_id = g.id
      muni       -> COUNT(*) FROM buildings b JOIN communities c
                    ON c.id = b.community_id WHERE c.municipality_id = g.id
      area       -> COUNT(*) FROM buildings b JOIN communities c
                    ON c.id = b.community_id JOIN municipalities m
                    ON m.id = c.municipality_id WHERE m.area_id = g.id
      neighbourhood -> 0 (buildings have no neighbourhood FK)
    Supporting indexes verified live:
      idx_buildings_community_id            (b -> c)
      idx_communities_municipality_id       (c -> m)
      idx_municipalities_area_id            (m -> ta)
    Post-fix verified live: Toronto=3,383, Ottawa=1,780, Durham=208,
    Toronto C01 (muni) = 597. All-areas rollup query timing: 154ms.

  FIX 3 — listing column label (LOW, code-only):
    components/admin-homes/cockpit/territory/GeographyView.tsx:208
    Header changed from 'Listings' to 'Listings <span ...>(last 2 yrs)</span>'.
    Pure UI string clarification of the MV semantic.

  FIX 2 — apa-card tie-break (HARD GATE; DDL ready, NOT applied):
    STEP 1 probe (live, read-only): 0 duplicates in
      (tenant_id, scope, scope_id, access_col) WHERE is_primary
      AND is_active. Safe to add partial unique index without
      operator data-resolution.
    STEP 2 verdict: existing 4 partial unique indexes already
      enforce the operator's intended invariant. Proposed new
      index would be REDUNDANT — recommend SKIP.
    STEP 3 — ORDER BY insurance:
      Migration: supabase/migrations/20260627_w_pick_routing_agent_order_by.sql
      Runner: scripts/apply-pick-routing-order-by.js
      The change: CREATE OR REPLACE FUNCTION pick_routing_agent_for_type
      with `ORDER BY apa.created_at, apa.agent_id` added before
      `LIMIT 1`. Behavior under current invariants: identical
      (still at most one match). Behavior if invariants ever slip:
      deterministic oldest-card-wins instead of undefined order.
      Runner: snapshot prior body -> apply in tx -> verify ORDER BY
      in new body -> SAVEPOINT smoke (call with bogus scope_id
      expects NULL).
      HARD GATE: HOLD for operator `node scripts/apply-pick-routing-order-by.js`.

### Regression baseline — scripts/test-territory-regression.js (NEW)

  14 assertions, all PASS:
    A. Buildings rollup at area + muni for known geos (Toronto > 1000,
       Durham > 100, Toronto C01 > 100) — DB-level.
    B. geo-rollup source contains buildings rollup at muni + area
       (regex match) — locks FIX 1 against future hardcode-to-0.
    C. P-HOUSE fallback: resolver(Aily, unmatched) -> Ovais;
       resolver(WALLiam, unmatched) -> King Shah.
    D. The 4 lead-create routes all filter agents.is_active=true and
       agents.is_selling=true on the cache lookup — locks C2 fix.
    E. pick_routing_agent_for_type body contains ORDER BY:
       currently PEND (Fix 2 STEP 3 DDL pending operator gate).
       Switches to PASS automatically once the DDL ships.

  Run from project root:
    node scripts/test-territory-regression.js
  Exit 0 = all pass; nonzero = regression.

### Gates

  T1 tsc --noEmit: exit 0
  T2 territory regression: 14 PASS / 0 FAIL (1 PEND for Fix 2 STEP 3)
  T3 Fix 1 sanity (live DB): Toronto=3383, Ottawa=1780, Durham=208,
       Toronto C01=597. Timing 154ms. Operator-expected counts confirmed.
  T4 C12 regression: 17 PASS / 3 FAIL -- same baseline (c8b-2, c11,
       L2.1), 0 new fails.
  Aily / WALLiam state unchanged (no DB writes -- code-only fixes 1+3;
    Fix 2 DDL held at gate).

### Files

  Code-only (this commit):
    app/api/admin-homes/territory/geo-rollup/route.ts          (Fix 1)
    components/admin-homes/cockpit/territory/GeographyView.tsx (Fix 3)
    scripts/test-territory-regression.js                        (regression baseline)
  DDL queued behind HARD GATE (not in this commit yet):
    supabase/migrations/20260627_w_pick_routing_agent_order_by.sql
    scripts/apply-pick-routing-order-by.js
  Tracker:
    docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (this run-log)

### Backups (timestamps)

  app/api/admin-homes/territory/geo-rollup/route.ts.backup_20260627_081914
  components/admin-homes/cockpit/territory/GeographyView.tsx.backup_20260627_081914
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260627_083122

### Open follow-ups

  - HARD GATE Fix 2 STEP 3 ORDER BY DDL — HOLD for operator
    `node scripts/apply-pick-routing-order-by.js`.
  - Live operator verification on aily.ca/admin-homes/territory:
    BUILDINGS column at area level shows the real numbers
    (Toronto 3383, etc.) instead of 0. "Listings (last 2 yrs)"
    header reads the new label.
  - C2 (non-selling cache failover) confirmed already-fixed by
    UNIT 33 audit — no work needed; regression baseline locks it.

### Commit gate

  2 app files + 1 new script + tracker shipped together
  (live-tracker rule). DDL migration + runner NOT in this commit
  (queued for operator HARD GATE). HOLD push pending operator
  instruction.

---

## UNIT 34 — PUSH RECORD (2026-06-27)

Operator authorized push of d78d61d (code-only fixes 1 + 3 + regression
baseline). DDL Fix 2 STEP 3 remains held at HARD GATE.

### Pre-push gate (all green)

  - origin/main pre-push:  6b39b8c (UNITS 30+32 push record)
  - HEAD:                  d78d61d (UNIT 33+34 code-only)
  - HEAD~1:                6b39b8c
  - Ahead: 1 commit
  - System 1 zero-diff (app/admin/*, app/api/chat/*, agent_buildings): EMPTY
  - tsc --noEmit: exit 0
  - territory regression: 14 PASS / 0 FAIL / 1 PEND (C1 ORDER BY,
    pending Fix 2 STEP 3 DDL gate)
  - C12 regression: 17 PASS / 3 FAIL — baseline, 0 new fails

### Push

  git push origin main
  -> 6b39b8c..d78d61d  main -> main

  origin/main post-push:   d78d61d  (==HEAD)
  HEAD:                    d78d61d
  ahead of origin: empty

### Vercel deploy status

  Push to main auto-triggers Vercel deploy via GitHub integration.
  Live production responsive post-push:

  https://aily.ca/admin-homes/territory             308 -> www canonical
  https://www.aily.ca/admin-homes/territory         200 final via /login redirect
                                                    (middleware auth gate fires, route resolves)
  total=1.78s
  Server: Vercel

  No 500 / build-error at the route level. Vercel dashboard spot-check
  recommended for green deploy confirmation of d78d61d SHA.

### Status

  FIX 1 — buildings rollup (geo-rollup/route.ts at muni + area):
    PUSHED. Post-deploy, the BUILDINGS column on
    /admin-homes/territory should show real counts (Toronto~3383,
    Durham~208) at area level instead of 0.
  FIX 3 — listing label (GeographyView column header):
    PUSHED. Header now reads "Listings (last 2 yrs)".
  Regression baseline (scripts/test-territory-regression.js):
    PUSHED. Locks Fix 1 + C2 + P-HOUSE fallback against future
    regression. Pre-deploy 14/0/1-PEND.
  FIX 2 STEP 3 — pick_routing_agent_for_type ORDER BY insurance:
    DDL HELD AT HARD GATE. Migration + runner files local-only;
    will commit alongside the apply call after operator go
    (node scripts/apply-pick-routing-order-by.js).

### Live URL to verify (operator)

  https://www.aily.ca/admin-homes/territory

  As platform_admin: sidebar -> Territory -> pick a tenant ->
  GeographyView. BUILDINGS column at area level should show real
  counts (Toronto 3383, etc.) — not 0. "Listings (last 2 yrs)" header
  visible.
  As tenant-scoped user: same view, direct to their tenant.

### Commit gate (this PUSH record)

  Tracker-only delta. Will be folded into the next unit's commit or
  pushed as a small "push record" commit per the existing pattern.

---

## UNIT 34 Fix 2 STEP 3 — pick_routing_agent_for_type ORDER BY APPLIED (2026-06-27)

Operator HARD GATE go. DDL applied to prod; behavior under current
invariants identical (deterministic-insurance only). The regression
baseline's section-E PEND flipped to PASS (14 -> 15 PASS).

### Runner transcript

  Snapshot:  rollback-snapshots/_pick-routing-agent-order-by_2026-06-27T14-01-39-514Z.sql
  BEGIN
  CREATE OR REPLACE FUNCTION public.pick_routing_agent_for_type(...)
    (ORDER BY apa.created_at, apa.agent_id added before LIMIT 1)
  Post-verify: function body now contains ORDER BY apa.created_at, apa.agent_id
  SMOKE 1 PASS: pick_routing_agent_for_type(neighbourhood, bogus_uuid,
                Aily, condo) -> NULL  (no apa match, as expected)
  COMMIT successful.

  Manual rollback path retained as snapshot.

### Files (this commit)

  supabase/migrations/20260627_w_pick_routing_agent_order_by.sql
  supabase/migrations/rollback-snapshots/_pick-routing-agent-order-by_2026-06-27T14-01-39-514Z.sql
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (this run-log)

  Runner scripts/apply-pick-routing-order-by.js was DELETED post-success
  (one-shot pattern; snapshot retained).

### Behavior delta — none today

  Under the existing 4 partial unique indexes
  (uniq_apa_primary_{area,community,muni,neighbourhood}), at most one
  apa row matches the WHERE clause of pick_routing_agent_for_type's
  SELECT per (scope, scope_id, tenant_id) where is_primary AND
  is_active. The bare LIMIT 1 returned that single row deterministically.
  ORDER BY apa.created_at, apa.agent_id picks the same single row.

  If a future migration ever relaxes one of those partial unique
  indexes, the ORDER BY becomes load-bearing: oldest-card-wins (with
  agent_id as deterministic secondary tie-break), instead of
  undefined-order. Insurance, not a behavior change today.

### Gates

  T1 runner SMOKE 1 PASS
  T2 territory regression: 15 PASS / 0 FAIL (was 14/0/1-PEND)
  T3 C12 regression: 17 PASS / 3 FAIL — baseline (c8b-2, c11, L2.1),
       0 new fails.
  Aily / WALLiam state unchanged (the live data already satisfied the
    invariants).

### What changed for live operators

  Nothing observable today. The change is a future-proofing
  insurance: if territory invariants ever evolve in a way that relaxes
  the per-scope is_primary uniqueness, lead routing will continue to
  pick the same agent deterministically (oldest card) instead of
  whatever the planner returns first.

### Backups (timestamps)

  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260627_103835

### Commit gate

  1 migration + 1 rollback snapshot + tracker shipped together
  (live-tracker rule). Runner deleted post-success. HOLD push pending
  operator instruction.

---

## W-LEAD-FLOW-SMOKE UNIT 37 RUN-LOG (2026-06-28) — fix silent email-failure swallow (R2 + R4) + LOW cleanups

UNIT 35 audit findings addressed (the MEDIUM + LOW items). NO domain/Resend
config changes — code only.

### Ground truth (UNIT 35)

  - R2 (walliam/contact:239) + R4 (lib/actions/leads.ts:403) returned bare
    `{success:true}` even when tenant email send failed. Caller / user
    had no signal the email never went out.
  - R1 + R3 already use the `attemptTenantEmail` helper (typed outcome)
    and surface result in their JSON responses — they were the reference
    pattern.
  - Lead persists BEFORE email in ALL 4 routes (UNIT 35 / 28 verified) —
    no data loss; this unit fixes REPORTING only.

### FIX A — R2 + R4 surface email outcome

  app/api/walliam/contact/route.ts
    - Replaced direct `sendTenantEmail` + try/catch swallow with
      `attemptTenantEmail({...}, '[walliam/contact]')`.
    - Imports: dropped sendTenantEmail/TenantEmailNotConfigured/
      TenantEmailFailed; added attemptTenantEmail.
    - Captures outcome in local vars `emailSent: boolean` +
      `emailReason: 'delivered'|'not_configured'|'send_failed'|
      'recipients_unavailable'`.
    - Return shape:
        BEFORE: `NextResponse.json({ success: true, leadId: lead?.id })`
        AFTER:  `NextResponse.json({ success: true, leadId: lead?.id, emailSent, emailReason })`
    - logEmailRecipients still fires on success (with outcome.messageId).

  lib/actions/leads.ts (createLead)
    - Replaced BOTH email blocks (agent-chain + buyer-copy) with
      `attemptTenantEmail({...}, '[leads]')` and
      `attemptTenantEmail({...}, '[leads:buyer]')`.
    - Imports: dropped sendTenantEmail/TenantEmailNotConfigured/
      TenantEmailFailed; added attemptTenantEmail.
    - Declared `chainEmailOutcome` + `buyerEmailOutcome` locals before
      the recipients block. Defaults to
      `{sent:false, reason:'recipients_unavailable'}` and
      `{sent:false, reason:'skipped'}`.
    - Return shape:
        BEFORE: `return { success: true, lead }`
        AFTER:  `return {
                  success: true, lead,
                  emailSent: chainEmailOutcome.sent,
                  emailReason: chainEmailOutcome.reason,
                  buyerEmailSent: buyerEmailOutcome.sent,
                  buyerEmailReason: buyerEmailOutcome.reason,
                }`
    - The "buyer email" path covered UNIT 35's separate LOW finding.

  Lead persistence verified UNCHANGED (still INSERTs BEFORE the email
  attempt; regression F2 asserts the source-order).

### FIX B — UNIT 35 LOW cleanups

  app/api/charlie/appointment/route.ts:202
    - `getLeadEmailRecipients(tenantId || '', agentId, supabase)` →
      `getLeadEmailRecipients(tenantId!, agentId, supabase)`
    - validateSession at L86 already rejects requests with null tenantId.
    - The `|| ''` fallback was dead (would have called with empty
      tenant_id, returning zero recipients anyway).

  lib/admin-homes/lead-email-recipients.ts (isOptedOut comment)
    - Strengthened the existing TO-exemption comment to explicitly
      enumerate the 8 CC/BCC consumer layers and warn future
      contributors: "Layer 1 (assigned agent in TO) MUST NOT be filtered
      here ... do NOT extend isOptedOut to Layer 1 without also
      redesigning the 'lead can never be address-less' guarantee."

### Regression lock — scripts/test-territory-regression.js extended

  Three new sections added (F + F2 + F3):
    F: R2 + R4 surface email outcome
       - R2 success response includes emailSent (regex match)
       - R2 uses attemptTenantEmail (presence)
       - R2 no longer calls sendTenantEmail directly (absence)
       - R4 success return includes emailSent + buyerEmailSent
       - R4 has >=3 attemptTenantEmail occurrences (import + 2 sites)
       - R4 no longer calls sendTenantEmail directly
       - R3 no longer uses tenantId || '' fallback
       - isOptedOut comment warns against extending to Layer 1
    F2: lead INSERT precedes email attempt (R2 + R4 source-order check
        — proves send failure cannot lose the lead)
    F3: attemptTenantEmail source contract verified (returns
        {sent:false} for both not_configured + send_failed paths)

  Pre-unit: 15 PASS. Post-unit: 28 PASS / 0 FAIL.

### Gates

  T1 tsc --noEmit: exit 0
  T2 territory regression: 28 PASS / 0 FAIL (was 15; +13 from UNIT 37)
  T3 C12 regression: 17 PASS / 3 FAIL — same baseline, 0 new fails
  Aily / WALLiam state unchanged (no DB writes — code-only)

### What changed for live callers

  Before (R2 / R4):
    Client/caller saw `{success: true}` even when the tenant's
    Resend send failed. No signal at all. User thinks email
    went out when it didn't.
  After (R2 / R4):
    Client/caller sees `{success: true, leadId, emailSent, emailReason}`
    (R2) or `{success: true, lead, emailSent, emailReason,
    buyerEmailSent, buyerEmailReason}` (R4). Lead capture status
    (success) is independent of email delivery status (emailSent).
    The UI / consumer can now render a "couldn't email — admin
    notified" hint when emailSent=false. Tenant config defects
    (UNIT 36 WALLiam send_from = condoleads.ca) surface as
    `emailReason='not_configured'` instead of silent success.

  R3:
    Dead `|| ''` fallback removed. Behavior identical (validateSession
    guard at L86 already prevented the empty-string branch from
    being reached).

  Lead-email-recipients:
    isOptedOut comment improved — code behavior identical.

### Multi-tenant proof

  No changes to tenant scoping. attemptTenantEmail passes tenantId
  through to sendTenantEmail which reads `tenants.resend_api_key`
  via `.eq('id', params.tenantId)` (UNIT 35 already verified). No
  cross-tenant leak surface introduced.

### Backups (timestamps)

  app/api/walliam/contact/route.ts.backup_20260628_052041
  lib/actions/leads.ts.backup_20260628_052041
  app/api/charlie/appointment/route.ts.backup_20260628_052041
  lib/admin-homes/lead-email-recipients.ts.backup_20260628_052041
  scripts/test-territory-regression.js.backup_20260628_052041
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260628_052733

### Open follow-ups

  - UI / caller surfaces of R2 + R4 can now consume `emailSent` to
    show a "lead captured but email not sent" hint where applicable.
    Out of scope for this unit (server-side fix only).
  - UNIT 36 send_from fix for WALLiam (operational: verify walliam.ca
    in Resend + update tenants row via Studio GUI) remains pending
    operator action.

### Commit gate

  4 app files + 1 regression script + tracker shipped together
  (live-tracker rule). NO DB writes. NO domain/Resend config changes.
  HOLD push pending operator instruction.

---

## UNIT 37 — PUSH RECORD (2026-06-28)

Operator authorized push of c30fca8 (silent email-failure fix + LOW
cleanups, code-only).

### Pre-push gate (all green)

  - origin/main pre-push:  b209629 (UNIT 34 Fix 2 STEP 3 — ORDER BY DDL)
  - HEAD:                  c30fca8 (UNIT 37)
  - HEAD~1:                b209629
  - Ahead: 1 commit
  - System 1 zero-diff (app/admin/*, app/api/chat/*, agent_buildings): EMPTY
  - tsc --noEmit: exit 0
  - territory regression: 28 PASS / 0 FAIL (was 15; +13 from UNIT 37
    sections F + F2 + F3)
  - C12 regression: 17 PASS / 3 FAIL — baseline, 0 new fails

### Push

  git push origin main
  -> b209629..c30fca8  main -> main

  origin/main post-push:   c30fca8  (==HEAD)
  HEAD:                    c30fca8
  ahead of origin: empty

### Vercel deploy status

  Push to main auto-triggers Vercel deploy via GitHub integration.
  Live production responsive post-push:

  https://www.aily.ca/admin-homes/territory     final=200 (1.68s)
                                                via middleware -> /login
  Server: Vercel
  X-Vercel-Cache: MISS (fresh response)
  X-Vercel-Id: fra1::iad1::xgg48-...

  No 500 / build-error at the route level. Operator should spot-check
  the Vercel dashboard for green deploy of c30fca8.

### Status

  UNIT 37 — silent email-failure swallow (R2 + R4) + LOW cleanups:
    PUSHED. Post-deploy, R2 + R4 callers will start seeing
      `emailSent: true|false` and `emailReason: 'delivered'|'not_configured'
      |'send_failed'|'recipients_unavailable'`
    in their JSON responses. Lead capture status (`success`) remains
    independent of email delivery — no data loss on send failure.
    WALLiam contact-form submissions in particular will now surface
    `emailReason: 'not_configured'` (or similar) while UNIT 36's
    walliam.ca verification + send_from update remains pending operator
    action — this is the expected revealed-state, not a new bug.

  Regression baseline (scripts/test-territory-regression.js):
    PUSHED. Now 28 PASS / 0 FAIL — locks UNIT 37's fixes plus the
    earlier UNIT 33/34 locks.

### What changes for live callers (revealed-state)

  Before c30fca8:
    walliam/contact form -> 200 OK -> {success:true, leadId}.
    Email may or may not have actually sent; caller had no idea.
  After c30fca8:
    walliam/contact form -> 200 OK -> {success:true, leadId, emailSent,
    emailReason}.
    If emailSent=false + emailReason='not_configured' -> tenant Resend
    config is missing/invalid (UNIT 36 known-defect for WALLiam's
    send_from). UI/caller can now show "lead captured, email pending"
    instead of falsely claiming delivery.

### Commit gate (this PUSH record)

  Tracker-only delta. Will be folded into the next unit's commit per
  the established pattern.

---

## W-C12-BASELINE UNIT 39 RUN-LOG (2026-06-28) — rewrite stale C12 tests (c8b-2 + c11)

UNIT 38 audit established: c8b-2 + c11 are stale tests asserting code that
was intentionally refactored to a more multi-tenant-correct pattern. Code
is right; tests assert old pattern. This unit rewrites the tests to guard
the CURRENT pattern. L2.1 is INTENTIONALLY LEFT RED — see below.

### TEST FILES ONLY — zero production code change

### Current production pattern (verified on disk this session)

  components/HomePageComprehensiveClient.tsx:
    L31-40  Props { tenantId, brandName, wordmarkStyle, ... }
    L51     function HeroWordmark({ wordmarkStyle, brandName }: ...)
    L69     if (wordmarkStyle !== 'hero') { ... fallback to BrandWordmark }
    L493    function WalliamHero({ wordmarkStyle, brandName, assistantName }: ...)
    L529    <HeroWordmark wordmarkStyle={wordmarkStyle} brandName={brandName} />
    L646    <WalliamHero wordmarkStyle={wordmarkStyle} ... />
    NO `const WALLIAM_TENANT_ID = '...'`
    NO `tenantId !== WALLIAM_TENANT_ID`
    NO WALLiam UUID literal in this file
  components/HomePageComprehensiveClientV2.tsx: same shape (V2 WalliamHero
    has extended props: topAreas, neighbourhoods, access, defaultHomeMode,
    showBrowsePlanCTAs).

  This is MTB-DEF-1 data-driven gating via `tenants.wordmark_style`:
  hero variant opt-in by data, not by hardcoded UUID. Adding a tenant-3
  with wordmark_style='hero' lights up the WALLiam-style animated hero
  without any code change.

### FIX 1 — c8b-2 rewritten (scripts/test-c8b-2-multitenant-regression.js)

  Pre-unit:  14 PASS / 13 FAIL (asserting deleted hardcoded-tenant pattern)
  Post-unit: 39 PASS / 0 FAIL (asserts current data-driven pattern)

  Structure of the rewritten gate (per client file, V1 + V2):
    (a) NEGATIVE assertions — old hardcoded-tenant shortcuts are ABSENT:
        - no `const WALLIAM_TENANT_ID =` constant
        - no WALLiam UUID literal (b16e1039-...) anywhere in the file
        - no `tenantId !== WALLIAM_TENANT_ID` gate
        - no `<HeroWordmark tenantId={...` callsite
        - no `<WalliamHero tenantId={...` callsite
        - no `function HeroWordmark({ tenantId` signature
        - no `function WalliamHero({ tenantId` signature
    (b) POSITIVE assertions — new data-driven pattern is PRESENT:
        - BrandWordmark import
        - HeroWordmark signature takes `wordmarkStyle, brandName`
        - data-driven gate `if (wordmarkStyle !== 'hero')`
        - fallback to <BrandWordmark size="hero">
        - WalliamHero signature takes `wordmarkStyle, ...`
        - callsites pass `wordmarkStyle={wordmarkStyle}` (not tenantId)
        - default export destructures wordmarkStyle from Props
    (c) Carry-over assertions: BrandWordmark hero type + branch + font
        size (3); wrapper passes tenantId + brandName (V1 + V2 = 4);
        no-unguarded-HeroWordmark negative (2).

  Also: relaxed `BrandWordmark-hero-size-in-type` regex from the rigid
  `'sm' | 'md' | 'hero'` to `'sm' [...] 'hero'` so adding a future size
  variant (e.g. 'lg', already present today) doesn't break the gate.

  IF a future change reintroduces a hardcoded WALLiam UUID shortcut in
  either client, ANY of the 14 NEGATIVE assertions will FAIL —
  regression caught.

### FIX 2 — c11 regex tightened (scripts/test-c11-multitenant-regression.js)

  Assertion 1 (lib/utils/territory.ts file absent) was already passing.
  Assertion 2's regex /lib\/utils\/territory/g over-matched and caught
  the LEGITIMATE replacement file lib/utils/territory-constants.ts +
  its consumers (5 false positives).

  Change: regex tightened to negative-lookahead exclusion of `-constants`:
    BEFORE: /lib\/utils\/territory/g
    AFTER:  /lib\/utils\/territory(?!-constants)/g

  Behavior:
    matches:  lib/utils/territory.ts, lib/utils/territory', lib/utils/territory"
              (catches any reintroduction of the deleted file)
    skips:    lib/utils/territory-constants.ts (the legitimate replacement)

  Pre-unit:  1 PASS / 1 FAIL on assertion 2 (5 false-positive hits)
  Post-unit: 5 PASS / 0 FAIL (all 4 forbidden patterns absent)

### L2.1 — INTENTIONALLY LEFT RED

  L2.1 fails on `lib/utils/territory-constants.ts:29` —
  `export const WALLIAM_TENANT_ID = 'b16e1039-...'`. This is REAL
  dormant debt tracked as `F-SYNC-SINGLE-TENANT-IMPLICIT`: the
  WALLiam-only PropTx MLS sync hardcodes this constant. Consumers:
  lib/homes-sync/save.ts and lib/building-sync/save.ts (the nightly
  sync, executed only against WALLiam's PropTx feed). Aily has NO
  runtime path that reads this constant — UNIT 38 audit confirmed.

  WE DELIBERATELY DO NOT ADD `lib/utils/territory-constants.ts` TO
  UNIT 38's UUID_LOCKED_LIST. Allow-listing would mask the debt; the
  red baseline IS the reminder that:
    (a) the WALLiam sync is single-tenant-implicit today, and
    (b) tenant-3 MLS-sync onboarding requires per-listing tenant
        derivation in those sync paths before the constant can go.

  L2.1 is therefore the single intentional red in the baseline, with
  a documented "do not allow-list" rationale.

### Verification

  Standalone test runs:
    node scripts/test-c11-multitenant-regression.js  -> 5 PASS / 0 FAIL
    node scripts/test-c8b-2-multitenant-regression.js -> 39 PASS / 0 FAIL
  Full C12: 19 PASS / 1 FAIL (was 17/3; +2 PASS, -2 FAIL)
    The 1 remaining fail is L2.1 only — confirmed in runner output.
  tsc --noEmit: exit 0 (no prod change; pure test edits)
  git diff --stat (staged for this commit):
    scripts/test-c11-multitenant-regression.js   (+10)
    scripts/test-c8b-2-multitenant-regression.js (+197)
    docs/W-TENANT-TERRITORY-MODEL-TRACKER.md     (this run-log)
    Pre-existing dirty files (charlie/municipalities/route.ts,
    r-w-territory-master p2/p4) are NOT in this commit — they predate
    this session and remain unstaged.

### New baseline

  C12: 19 PASS / 1 FAIL  (was 17/3)
  The single remaining fail (L2.1) is documented dormant debt, not
  noise. Any new fail is a real regression; the baseline now reads
  honestly.

### Backups (timestamps)

  scripts/test-c8b-2-multitenant-regression.js.backup_20260628_055239
  scripts/test-c11-multitenant-regression.js.backup_20260628_055239
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260628_055730

### Commit gate

  2 test files + tracker shipped together (live-tracker rule). ZERO
  production code change. ZERO DB write. ZERO sends. HOLD push
  pending operator instruction.

---

## UNIT 39 — PUSH RECORD (2026-06-28)

Operator authorized push of bb8b515 (test-files-only rewrite of c8b-2
+ c11 to guard CURRENT data-driven multi-tenant pattern).

### Pre-push gate (all green)

  - origin/main pre-push:  c30fca8 (UNIT 37)
  - HEAD:                  bb8b515 (UNIT 39)
  - HEAD~1:                c30fca8
  - Ahead: 1 commit
  - Commit contents (git show --stat): exactly 3 files
      scripts/test-c8b-2-multitenant-regression.js  (+197/-)
      scripts/test-c11-multitenant-regression.js    (+10/-)
      docs/W-TENANT-TERRITORY-MODEL-TRACKER.md      (+217)
    ZERO production code in commit. ZERO DB. ZERO Resend.
  - System 1 zero-diff (app/admin/*, app/api/chat/*, agent_buildings): EMPTY
  - tsc --noEmit: exit 0
  - C12: 19 PASS / 1 FAIL — only L2.1 red (intentional dormant debt,
    F-SYNC-SINGLE-TENANT-IMPLICIT; NOT allow-listed by design)

### Pre-existing dirty files (must NOT be swept in)

  Pre-push state, NOT in this commit:
    M app/api/charlie/municipalities/route.ts
    M scripts/r-w-territory-master-p2-data-phantom-fix.js
    M scripts/r-w-territory-master-p4-check-fix.js

  Post-push state — SAME 3 files still unstaged/modified:
    M app/api/charlie/municipalities/route.ts
    M scripts/r-w-territory-master-p2-data-phantom-fix.js
    M scripts/r-w-territory-master-p4-check-fix.js
  Untouched by UNIT 39 commit. Their pre-existing dirty state was
  preserved across the push.

### Push

  git push origin main
  -> c30fca8..bb8b515  main -> main

  origin/main post-push:   bb8b515  (==HEAD)
  HEAD:                    bb8b515
  ahead of origin: empty

### Vercel deploy status

  Push to main auto-triggers Vercel deploy. Live production
  responsive post-push:

  https://www.aily.ca/admin-homes/territory  final=200 (1.42s)
  Server: Vercel
  X-Vercel-Cache: MISS (fresh response)
  X-Vercel-Id: fra1::iad1::jjz2z-...

  No 500 / no build-error at the route level. Test-only commit
  doesn't change runtime behavior — Vercel build expected green
  for the test script changes (scripts/ isn't in the Next.js build
  graph anyway).

### New baseline

  C12: 19 PASS / 1 FAIL (was 17/3; +2 PASS / -2 FAIL via UNIT 39).
  The single remaining FAIL is L2.1 (territory-constants.ts:29
  WALLiam-only PropTx MLS sync constant). This is REAL dormant debt
  tracked as F-SYNC-SINGLE-TENANT-IMPLICIT — not allow-listed because
  the red flag IS the reminder. Aily has zero runtime path that
  reads it.

### Status

  UNIT 39 — test rewrites for current data-driven pattern: PUSHED.
  c8b-2 + c11 now correctly guard the post-MTB-DEF-1 wordmarkStyle
  data-driven hero gating. Any future reintroduction of a hardcoded
  WALLIAM_TENANT_ID shortcut in HomePageComprehensiveClient.tsx /
  V2 will be caught by the 14 NEGATIVE assertions.

  Baseline-noise reduction:
    Before UNIT 39: 17 PASS / 3 FAIL (c8b-2, c11, L2.1)
    After UNIT 39: 19 PASS / 1 FAIL (only L2.1, documented)

### Commit gate (this PUSH record)

  Tracker-only delta. Will be folded into the next unit's commit per
  the established pattern.

---

## W-CRON-FAIL UNIT 41 RUN-LOG (2026-06-28) — delete dead Reroll Worker Cron workflow

UNIT 40 audit established: .github/workflows/reroll-worker.yml has NEVER
succeeded — committed 2026-05-30 in commit 9255a18, the two required
secrets (REROLL_WORKER_BASE_URL + REROLL_WORKER_CRON_TOKEN) were never
provisioned in GH Actions, workflow's own preflight catches it and exits
1 in <1s every 5 min, spamming failure-notification emails for ~4 weeks.

UNIT 41: delete the dead trigger. Route + queue + manual drainer KEPT.

### Deleted

  .github/workflows/reroll-worker.yml
    Timestamped backup at .backup_20260628_070535 (per CLAUDE.md
    backup-before-touch).

### Retained (untouched)

  app/api/admin-homes/territory/reroll-worker/route.ts
    The drain ROUTE stays. Used by:
      - components/admin-homes/cockpit/territory/QueueIndicator.tsx
        (ad-hoc operator drain via cockpit polling at 10s while mounted)
      - any future autonomous drainer (operator can re-add a workflow
        with proper secrets provisioning, or use a different scheduler)
    The Bearer-token bypass code path (lines 25-33) remains; just
    nothing's calling it on a schedule today.

  territory_reroll_queue table
    Untouched. Producers (handle_agent_deactivate trigger,
    reroll_listings_at_geo) still enqueue rows; manual drainer still
    drains them.

  components/admin-homes/cockpit/territory/QueueIndicator.tsx
    Untouched. Manual drain via cockpit poll continues to work.

### Dangling-reference audit (D2)

  Grep for: reroll-worker.yml, "Reroll Worker Cron", REROLL_WORKER_BASE_URL,
  REROLL_WORKER_CRON_TOKEN. Hits after delete:
    Code: ZERO. No source file imports/depends on the deleted workflow.
    Comments/docs (historical, untouched):
      - .github/workflows/reconcile.yml:16,45 (sibling-workflow comments
        about reroll-worker as proven pattern)
      - .github/workflows/reconcile.yml:44 — reconcile.yml uses
        secrets.REROLL_WORKER_BASE_URL too; the secret NAME stays in
        repo settings because the sibling workflow consumes it.
      - f-event7-reconcile-recon.md, cv-event7-recon-output.txt,
        f-reroll-coupled-check-recon.md (recon transcripts)
      - docs/W-TERRITORY-MASTER-TRACKER.md (master tracker history)
      - 2 migration files' comments (20260601, 20260530)
      - The route's own comment (the route stays anyway)
    All historical/architectural references. No breakage.

### Shared secret note

  REROLL_WORKER_BASE_URL is consumed by both reroll-worker.yml (now
  deleted) and reconcile.yml (still present). Do NOT remove that
  secret if it ever gets provisioned — reconcile.yml needs it too.
  REROLL_WORKER_CRON_TOKEN is now exclusive-history (no live workflow
  uses it post-delete).

### Sibling-workflow status (out of scope, FLAGGED)

  .github/workflows/reconcile.yml ("Nightly Reconcile") is in the SAME
  failed state — same missing-secrets pattern (REROLL_WORKER_BASE_URL +
  RECONCILE_CRON_TOKEN both unprovisioned). Fails daily at 09:00 UTC
  in ~6s. Operator may want to address as a follow-up: either delete
  similarly OR provision both secrets + the cron will run.

### F-REROLL-CRON-UNPROVISIONED (tracked debt, not a regression)

  Autonomous WALLiam queue drain is NOT a lost capability — it's a
  deliberate future build. To restore it:
    1. Provision secrets in GH Actions: REROLL_WORKER_BASE_URL
       (= production base URL, shared with reconcile.yml) +
       REROLL_WORKER_CRON_TOKEN (= freshly-generated 32+ char string).
    2. Provision REROLL_WORKER_CRON_TOKEN on Vercel server env
       (Production scope) with the SAME value as step 1.
    3. Restore a workflow (re-create from the .backup_20260628_070535
       snapshot, or write a fresh one).
  Tracked. Not Aily-launch-blocking (Aily has near-zero reroll
  activity per UNIT 28 data).

### Gates

  T1 git status: D .github/workflows/reroll-worker.yml (deletion staged)
  T2 grep for dangling refs: zero CODE refs; only historical doc refs.
  T3 route + queue file present + unchanged.
  T4 tsc --noEmit: exit 0 (zero code path touched).
  T5 GH Actions: cron will stop firing on next push (workflow file
       removed from the schedule registry).

### Backups (timestamps)

  .github/workflows/reroll-worker.yml.backup_20260628_070535
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260628_070743

### Commit gate

  1 workflow file deleted + tracker shipped together (live-tracker
  rule). ZERO production code change. ZERO DB write. HOLD push
  pending operator instruction.

---

## W-HOMEPAGE-ERROR UNIT 44 RUN-LOG (2026-06-28) — decouple homepage render from agent.apa rows

UNIT 43 audit identified the live customer-facing symptom on aily.ca:
the literal string "Access configuration error" rendering as the main
content of the homepage. Root cause: HomePageComprehensive*.tsx
treated `null` from resolveAgentAccess(agent.id) as render-blocking,
and resolveAgentAccess returned null on zero active agent_property_access
rows. Aily's default_agent_id (Ovais Qassim, 319ad339) has 0 apa rows,
so the homepage hit the error string instead of rendering.

The author's comment at the call site ("Shouldn't happen — routing
should have caught this") confirmed the error was never meant to reach
prod. The fix decouples two unrelated concerns: "agent has assignments"
and "homepage can render".

### Files changed (3)

  lib/comprehensive/access-resolver.ts
    Signature: Promise<ResolvedAccess | null>  ->  Promise<ResolvedAccess>
    Zero-rows / error path: was `return null`, now returns a default
    all-MLS ResolvedAccess (isAllMLS: true, all categories true, empty
    geo) + structured console.warn with agent_id so operators still see
    misconfigured tenants in logs. Multi-tenant: no per-tenant
    branching — every zero-rows tenant gets the same graceful default.

  components/HomePageComprehensive.tsx
    Removed the dead `if (!access) return <div>Access configuration
    error</div>` branch (lines 43-46 pre-edit). Replaced with a single
    archeology comment so future readers know why the guard is absent.

  components/HomePageComprehensiveV2.tsx
    Same removal (lines 52-55 pre-edit). Same archeology comment.

### Render-truth smoke (local npm run dev, NOT compile-only)

  S1: aily.ca homepage (Ovais, 0 apa rows)
      - HTTP 200, 97994 bytes rendered (was: tiny error-string div)
      - grep "Access configuration error" /tmp/aily_home.html -> 0 hits
      - 8 homepage element hits (main/header/MLS/listings/Aily/nav)
      - VERDICT: error string ABSENT, homepage renders.

  S2: walliam.ca homepage (King Shah, 11 apa rows)
      - HTTP 200, 71745 bytes rendered (unchanged shape)
      - 5 walliam-brand mentions + 3 hero/wordmark hits
      - grep "Access configuration error" -> 0 hits
      - VERDICT: regression-clean, WALLiam untouched.

  S3: operator-facing warn log
      Aily (count=0):  "[resolveAgentAccess] zero active apa rows;
                        defaulting to all-MLS
                        { agent_id: '319ad339-f031-43af-b036-be06bd5221b3',
                          error: null }"
      WALLiam (count=11):  "[resolveAgentAccess] Query result:
                            { count: 11, error: undefined }"  -- no warn
      VERDICT: warn fires for misconfigured tenant, silent for healthy.

  S4: tsc --noEmit -> exit 0
      C12 multi-tenant regression: 19 PASS / 1 FAIL (baseline preserved;
        only L2.1 red, documented dormant debt
        F-SYNC-SINGLE-TENANT-IMPLICIT)

### Multi-tenant correctness

  - The fallback object is derived from no tenant constant; same shape
    for any tenant with zero apa rows.
  - The warn line includes agent_id so operators can identify which
    tenant's homepage agent is unconfigured.
  - WALLiam path (geo-scoped via apa rows) is byte-identical to before.
  - Tenant #3 onboarding with zero apa rows on its default agent will
    render its homepage gracefully + log the warn — no code edit needed
    per new tenant.

### What's NOT in this fix (deliberate scope discipline)

  - hasComprehensiveAccess (sibling function in same file) NOT touched.
    Used elsewhere as a boolean routing signal where null/false has
    semantic meaning; the fix is scoped to the customer-facing surface.
  - The cross-tenant anthropic_api_key sharing flagged in UNIT 43
    (aily + walliam fingerprint sk-ant...zwAA len 108 identical) is
    a separate operational concern — NOT addressed here.
  - Aily's missing apa rows are NOT being silently filled in DB. The
    correct long-term posture is: if Aily wants geo-scoped homepage
    behavior, operator inserts apa rows via Studio. If Aily's product
    positioning is MLS-wide (per UNIT 28 data: 0 explicit apa,
    AI-first), the default that this fix provides IS the right
    behavior, with the warn as the operational signal.

### Backups (timestamps)

  lib/comprehensive/access-resolver.ts.backup_20260628_130643
  components/HomePageComprehensive.tsx.backup_20260628_130643
  components/HomePageComprehensiveV2.tsx.backup_20260628_130643
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260628_131423

### Commit gate

  3 source files + tracker shipped together (live-tracker rule).
  Code-only fix. ZERO DB write. ZERO sends. HOLD push pending
  operator instruction.

---

## W-BUILDING-PAGE UNIT 46 RUN-LOG (2026-06-28) — decouple building-page right rail from hero-branding

UNIT 45 audit established the missing right-rail elements on aily.ca
building pages were architectural, not defensive: BuildingPage.tsx:594
gated the entire right rail on `isHero` (wordmark_style==='hero').
Hero path rendered all 4 tenant-aware widgets (WalliamAgentCard,
WalliamCTA, CharliePageContext, WalliamContactForm); non-hero path
rendered a degraded 2-widget surface gated on a host-derived agent
that was null for aily.ca (no agent has custom_domain='aily.ca').
NOT the same class as UNIT 44 — `isHero` was being used as a
brand-flavor-as-behavior-proxy (MTB-DEF-1 class).

UNIT 46 broadens the tenant-aware rail to every tenant-bound host;
the dramatic WalliamCTA wordmark stays hero-gated; legacy non-tenant
branch (subdomain/custom_domain solo-agent sites) unchanged.

### Files changed (1 source + tracker)

  app/[slug]/BuildingPage.tsx
    Line 594: `{isHero ? (` -> `{tenantId ? (`  + an in-place
      comment explaining the gate flip.
    Lines 602: wrapped `<WalliamCTA .../>` in `{isHero && (...)}`
      so the dramatic hero wordmark stays WALLiam-only.
    No other behavior changes. Legacy non-tenant branch (lines
      627-655 pre-edit) byte-identical in diff.
    Diff: 14 insertions, 2 deletions (10 of the 14 are the comment).

### F4 multi-tenant leak audit (pre-fix verification)

  WalliamAgentCard.tsx       CLEAN — receives tenant_id prop;
                              POSTs /api/walliam/resolve-agent with
                              x-tenant-id header. No hardcoded tenant
                              id, no host check. Caveat: the `!agent`
                              fallback renders a literal WALL/iam
                              brand visual; cascade's P-HOUSE always
                              returns the tenant's default agent
                              (UNIT 16b NOT NULL), so the fallback
                              is unreachable in practice for tenants
                              with a configured default_agent_id.
  WalliamContactForm.tsx     CLEAN — tenantId required prop; POSTs
                              with tenant_id from prop.
  CharliePageContext.tsx     CLEAN — generic page-context emitter;
                              no tenant reference. The global
                              Charlie route resolves tenant
                              server-side from host/cookies.
  WalliamCTA.tsx             CLEAN — brandName + wordmarkStyle as
                              props; supports aiglow already; kept
                              hero-gated per F2 scope discipline.

### Render-truth + tenant-data-correctness smoke (local npm run dev)

  S1: aily.ca / x2-condos-101-charles-st-e-toronto (the bug)
      HTTP 200 / 1,169,504 bytes rendered (vs the pre-fix empty rail)
      WalliamContactForm (SSR-visible markers Get In Touch +
        Send Message): present in HTML
      CharliePageContext (SSR-invisible — returns null + dispatches
        useEffect event): bundle markers present (charlie:open /
        charlie:pagecontext hits)
      WalliamAgentCard (SSR-invisible — `if (loading) return null`):
        verified via direct API probe.

      AILY-DATA-CORRECTNESS leak check (must NOT show WALLiam data):
        walliam.ca link hits in HTML: 0
        'King Shah' (WALLiam default agent) hits: 0
        'WALL' brand-card text hits: 0

      /api/walliam/resolve-agent direct probe with x-tenant-id=AILY
        returns:
          { success: true,
            agent: { id: '319ad339-...',  <- Ovais
                     full_name: 'OVAIS QASSIM',
                     email: 'yourcondorealtor@gmail.com',
                     cell_phone: '+1416-224-2166',
                     title: 'Broker of Record',
                     brokerage_name: 'PREMIER MATRIX REALTY LTD.
                                      BROKERAGE' },
            source: 'walliam_default' }    <- P-HOUSE for Aily
      VERDICT: Aily card resolves to Aily's OWN default agent.
      No cross-tenant data leak.

  S2: walliam.ca / x2-condos (regression check)
      HTTP 200 / 1,168,002 bytes rendered (similar shape to before)
      contact form present, hero WalliamCTA present (1 hit, hero-
        only), Own a Unit CTA present.
      /api/walliam/resolve-agent with x-tenant-id=WALLIAM returns
        King Shah (WALLiam's default), source walliam_default.
      VERDICT: WALLiam unchanged (was already in all-widgets path).

  S3: legacy non-tenant branch (System 1 solo-agent sites)
      git diff: the non-tenant branch (lines 627-655 pre-edit) does
      NOT appear in the diff — byte-identical. No System 1 impact.

  S4: tsc --noEmit -> exit 0
      C12 multi-tenant regression: 19 PASS / 1 FAIL (baseline
        preserved; only L2.1 red, documented dormant debt
        F-SYNC-SINGLE-TENANT-IMPLICIT)

### Multi-tenant correctness

  The new gate `{tenantId ? (...) : (...)}` is derived from
    getCurrentTenantId() which resolves the request's tenant from
    host -> tenants.domain. No per-tenant code branching.
  Tenant #3 onboarding gets the full tenant-aware right rail on its
    building pages automatically (assuming `tenants.domain` is set
    and `tenants.default_agent_id` is provisioned per UNIT 16b).
  Hero (dramatic WALLiam wordmark) stays exclusively gated on
    wordmark_style==='hero' — Aily's aiglow-style site keeps its
    own cleaner layout without the dramatic CTA card.

### What's NOT in this fix (deliberate scope discipline)

  - Rename Walliam* components to tenant-neutral names. Cosmetic;
    the fix is one gate flip. Deferred.
  - The Walliam-brand fallback inside WalliamAgentCard (lines
    142-189) still hardcodes WALL/iam visual. Unreachable today
    via the P-HOUSE cascade for any tenant with a default agent.
    Tracked as F-WALLIAM-FALLBACK-BRAND-LEAK; will replace with
    tenant-driven generic fallback in a future unit.
  - The legacy non-tenant branch (subdomain/custom_domain solo-
    agent sites) is unchanged. AI Ask + contact form are still
    absent there; they're tenant-aware concepts that don't apply
    to per-agent System 1 sites.

### Backups (timestamps)

  app/[slug]/BuildingPage.tsx.backup_20260628_143416
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260628_144004

### Commit gate

  1 source file + tracker shipped together (live-tracker rule).
  Code-only fix. ZERO DB write. ZERO sends. HOLD push pending
  operator instruction.

### UNIT 46 PUSH RECORD (2026-06-28)

  Operator authorized push of 9878633 (BuildingPage right-rail
  gate flip).

  Pre-push gate (all green):
    origin/main pre-push: 86eed78  (UNIT 44)
    HEAD:                 9878633  (UNIT 46)
    HEAD~1:               86eed78
    ahead: 1 commit
    Commit contents (git show --stat 9878633): exactly 2 files
      app/[slug]/BuildingPage.tsx              (+16/-2)
      docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (+195)
      2 files changed, 209 insertions, 2 deletions
    Live-tracker fold check: the UNIT 44 PUSH RECORD section
      added post-UNIT-44-push folded into THIS commit's tracker
      diff (1 occurrence in `git show 9878633 -- tracker`). NOT
      lost. Folding pattern preserved.
    System 1 zero-diff (app/admin/*, app/api/chat/*, agent_buildings): EMPTY
    tsc --noEmit: exit 0
    C12: 19 PASS / 1 FAIL (only L2.1 red, by design)

  Pre-existing dirty (must NOT be swept in):
    Pre-push:
      M app/api/charlie/municipalities/route.ts
      M scripts/r-w-territory-master-p2-data-phantom-fix.js
      M scripts/r-w-territory-master-p4-check-fix.js
    Post-push: SAME 3 files, untouched, still unstaged.

  Push:
    git push origin main
    -> 86eed78..9878633  main -> main
    origin/main post-push: 9878633  (== HEAD)

  Vercel auto-deploy + LIVE production probe:
    Polled https://www.aily.ca/x2-condos-101-charles-st-e-toronto
    until any new-build right-rail marker appeared. New build live
    in ~60s.

    Final live probe:
      HTTP 200 / 1.90s response time
      bytes: 1,172,941  (vs pre-fix empty rail)
      Right-rail markers in LIVE Aily HTML:
        contact form (walliam_building_inquiry + Get In Touch): 2 hits
        WalliamAgentCard + CharliePageContext: client-hydrated post-
          paint (SSR-invisible per `if (loading) return null` and
          `return null` patterns; visible after hydration completes).

      Leak check on the LIVE HTML (critical multi-tenant safety):
        'King Shah' (WALLiam's default agent) hits: 0
        'walliam.ca' link hits:                     0
      VERDICT: aily.ca's building page right rail renders with
      Aily-tenant context only. No cross-tenant data leak in live
      production.

  Status:
    UNIT 46 - building-page right-rail gate flip: PUSHED.
    aily.ca/<building-slug> public pages now render the
    tenant-aware right rail (agent card, AI Ask, contact form,
    Own a Unit CTA). Same components, tenant-driven by props,
    no per-tenant code branching. Tenant #3 onboarding gets the
    same rail without further code edits.

  Commit gate (this PUSH record):
    Tracker-only delta. Will fold into the next unit's commit per
    the established live-tracker pattern.

---

## W-BUILDING-PAGE UNIT 48 RUN-LOG (2026-06-28) — close residual MTB-DEF-1 gate on WalliamCTA

UNIT 47 audit established the missing "Get Your AI Real Estate Plan"
block on Aily building rails is the residue of a UNIT 46 mistake:
UNIT 46 kept WalliamCTA hero-gated ({isHero && <WalliamCTA/>})
believing it was just the dramatic hero WORDMARK. It is actually
the AI plan CTA card (Ask AI + Buyer Plan + Seller Plan); the
wordmark is one sub-element of it that already self-branches
correctly by wordmarkStyle (hero / aiglow / plain BrandWordmark)
per W-AILY-CTA-BRAND-LEAK + W-AILY-CTA-PANEL authoring. UNIT 47 R4
leak-audit confirmed CLEAN: no hardcoded WALLiam, no host check,
all flavor driven by wordmarkStyle/brandName/assistantName props.

UNIT 48 removes the residual gate — closes the MTB-DEF-1 case on
the 4th of 4 tenant-rail components. Same brand-flavor-as-behavior-
proxy class UNIT 46 was fixing.

### Sequencing

  C0 push-status:  origin/main = 9878633 (UNIT 46 ALREADY PUSHED).
  UNIT 48 = clean follow-up commit, normal flow. NOT an amend.

### File changed (1 source + tracker)

  app/[slug]/BuildingPage.tsx
    Removed the {isHero && (...)} wrapper around <WalliamCTA .../>;
    render unconditionally at the same level as WalliamAgentCard /
    CharliePageContext / WalliamContactForm inside the {tenantId ?}
    branch. wordmarkStyle/brandName/assistantName props unchanged.
    Diff: 15 insertions, 3 deletions (12 of 15 are the explanatory
    comment + post-mortem reference).

### Render-truth + flavor-correctness smoke (local npm run dev)

  S1: aily.ca / x2-condos-101-charles-st-e-toronto
      HTTP 200 / 1,173,574 bytes
      WalliamCTA presence (the 4th block):
        'Get Your AI Real Estate Plan' tagline: 1 hit (rendered)
        'Buyer Plan' button: 5 hits (component + repeat references)
        'Seller Plan' button: 5 hits
        'Ask AI' button: 2 hits
      AILY-FLAVOR check:
        'Ask aily about X2' subtitle: 1 hit (assistantName=aily +
          context=X2 Condos threaded correctly)
        Aiglow magenta panel #29142b: 1 hit (aiglow background
          rendered — wordmarkStyle='aiglow' branch confirmed taken)
        AiGlowWordmark bundle markers: 21 hits
      HERO-LEAK check (must all be 0 for visual rendering):
        'WALL' text in rendered visual: 0
        'King Shah' hits: 0
        'WALLiam' brand text hits: 0
      Dead-CSS artifacts (component emits unconditional <style>;
      visual is NOT used in aiglow path):
        walliam-cta-heartbeat keyframes: 1 (the @keyframes rule,
          no element references it for non-hero)
        #060b18 navy hex: 2 hits (from other components' styles;
          WalliamCTA's hero background ternary not taken for aiglow)
      VERDICT: Aily renders the 4th block in Aily's own flavor
        (aiglow wordmark + magenta panel + Aily assistant copy).
        Zero cross-tenant visual leak.

  S2: walliam.ca / x2-condos (regression check)
      HTTP 200 / 1,168,002 bytes
      WalliamCTA + HERO flavor preserved:
        'Get Your AI Real Estate Plan': 1 hit
        Buyer/Seller Plan: 5/5 hits
        HERO 'WALL' visual text: 3 hits (hero branch taken)
        Hero navy #060b18: 5 hits (hero background rendered)
        Aiglow magenta #29142b: 0 (not taken — WALLiam is hero)
        Ask {assistantName} subtitle: 3 hits
      VERDICT: WALLiam byte-comparable; hero wordmark + heartbeat
        animation + navy background all preserved.

  S3: tsc --noEmit -> exit 0
      C12 multi-tenant regression: 19 PASS / 1 FAIL (baseline
        preserved; only L2.1 red, documented dormant debt
        F-SYNC-SINGLE-TENANT-IMPLICIT)

### UNIT 46 post-mortem (recorded so it isn't repeated)

  UNIT 46 hero-gated WalliamCTA on the mistaken assumption that the
  component name (Walliam + CTA) + the wordmark sub-element made it
  a wordmark wrapper. The component header comment described it as
  "drop into any page to show Buyer/Seller Plan CTAs + AI search" —
  reading the full component body would have shown the wordmark is
  one of 4 sub-elements (wordmark / tagline / search bar / plan
  buttons), all of which work for any tenant via props.

  The post-mortem rule: when keeping a hero gate on a `Walliam*`
  named component during a tenant-decouple unit, verify the
  component is not itself already multi-tenant-safe at the prop
  level. WalliamCTA was — UNIT 46 negated its own design intent.

  This pattern (component multi-tenant-safe internally, but call
  site brand-gates the whole thing) is the residual MTB-DEF-1
  failure mode to scan for in future units.

### Backups (timestamps)

  app/[slug]/BuildingPage.tsx.backup_20260628_151921
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260628_152421

### Commit gate

  1 source file + tracker shipped together (live-tracker rule).
  Code-only fix. ZERO DB write. ZERO sends. HOLD push pending
  operator instruction.

### UNIT 48 PUSH RECORD (2026-06-28)

  Operator authorized push of cd13b0a (residual MTB-DEF-1 gate
  removal — WalliamCTA renders for all tenants).

  Pre-push gate (all green):
    origin/main pre-push: 9878633 (UNIT 46)
    HEAD:                 cd13b0a (UNIT 48)
    HEAD~1:               9878633
    ahead: 1 commit
    Commit contents (git show --stat cd13b0a): exactly 2 files
      app/[slug]/BuildingPage.tsx              (+18/-3)
      docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (+177)
      2 files changed, 192 insertions, 3 deletions
    System 1 zero-diff (app/admin/*, app/api/chat/*, agent_buildings): EMPTY
    tsc --noEmit: exit 0
    C12: 19 PASS / 1 FAIL (only L2.1 red, by design)

  Pre-existing dirty (must NOT be swept in):
    Pre-push:
      M app/api/charlie/municipalities/route.ts
      M scripts/r-w-territory-master-p2-data-phantom-fix.js
      M scripts/r-w-territory-master-p4-check-fix.js
    Post-push: SAME 3 files, untouched, still unstaged.

  Push:
    git push origin main
    -> 9878633..cd13b0a  main -> main
    origin/main post-push: cd13b0a  (== HEAD)

  Vercel auto-deploy + LIVE production probe:
    Polled https://www.aily.ca/x2-condos-101-charles-st-e-toronto
    until the "Get Your AI Real Estate Plan" tagline appeared in
    live HTML. New build live in ~60s.

    Final live probe:
      HTTP 200 / 1.85s response time
      bytes: 1,178,496
      4th block presence on LIVE Aily:
        'Get Your AI Real Estate Plan' tagline: 1 hit
        Buyer Plan / Seller Plan / Ask AI buttons: 4 / 4 / 2 hits
      AILY-flavor on LIVE:
        'Ask aily about X2' subtitle: 1 hit (assistantName + context)
        Aiglow magenta panel #29142b: 1 hit (aiglow background)
      Leak check on LIVE (must all be 0):
        'WALLiam' brand text: 0
        'King Shah': 0

    THE 4TH BLOCK IS LIVE ON PRODUCTION AILY.CA with Aily-flavor
    (aiglow wordmark + magenta panel + Aily assistant copy).
    Zero cross-tenant leak in live production.

  Status:
    UNIT 48 - residual MTB-DEF-1 gate on WalliamCTA closed: PUSHED.
    aily.ca/<building> right rail now renders all 4 blocks:
      1. Agent card (UNIT 46)
      2. Get Your AI Real Estate Plan CTA (UNIT 48) <- newly live
      3. Get In Touch contact form (UNIT 46)
      4. Own a Unit CTA (UNIT 46)
    Matches the WALLiam rail count; rendered in Aily-flavor via
    tenant-driven props. No per-tenant code branching.

  Commit gate (this PUSH record):
    Tracker-only delta. Will fold into the next unit's commit per
    the established live-tracker pattern.

---

## W-LANDING-CONTEXT UNIT 50 RUN-LOG (2026-06-29) — landing-page context propagation: Gap A (plan artifact) + Gap B (geo-page chat) + cosmetic form header

UNIT 49 audit established three gaps in landing-page context flow on
building / geo pages: (A) plan-email persistence and email subject
were building-blind even though the LLM reasoning was building-aware
in the system prompt; (B) the chat client forwarded only building_id
from pageContextRef, dropping community_id/municipality_id/area_id so
geo pages couldn't pre-load the route's geoAnalyticsContext; (C)
cosmetic — contact form header was generic "GET IN TOUCH" even when
contextLabel was passed.

UNIT 50 closes all three additively — current working paths
(homepage / building rail / contact form / building-page chat) stay
byte-intact.

### D1 verdict — data-layer

  chat_sessions has NO building_id column.
  NO standalone plans table exists.
  Plans persist as leads. leads.building_id column ALREADY EXISTS
    (UNIT 49 R4 confirmed).
  buildings table has NO tenant_id column (shared MLS data per
    CLAUDE.md).
  Verdict: Gap A is CODE-ONLY. No migration needed. No HARD GATE
    triggered.

### Files changed (3 source + tracker)

  app/charlie/hooks/useCharlie.ts
    Gap B (line ~422): widened geoContext forward from {building_id}
      only to {building_id, community_id, municipality_id, area_id}.
      Building-page behavior unchanged (route's
      `if (geoContext?.building_id)` pre-load wins; geo-pre-load is
      mutually exclusive via `!geoContext?.building_id` guard at
      route.ts:191).
    Gap A (line ~556): added `building_id:
      pageContextRef.current?.building_id || null` to the
      plan-email POST body. Additive — geoContext field unchanged.

  app/api/charlie/plan-email/route.ts
    Gap A: destructured `building_id` from body + UUID-shape validated
      into a typed null-safe local; null on non-building pages.
    Gap A: when buildingId present, fetch building_name from buildings
      table by id (no tenant scoping — buildings is shared MLS data).
    Gap A: leads.building_id = buildingId in the insert (null when
      absent — row shape identical to today).
    Gap A: email subject now `${brand} ${planType} Plan — ${building
      Name} — ${userName}` when buildingName present; falls back to
      today's `... — ${geoName||'GTA'} — ${userName}` otherwise.

  components/WalliamContactForm.tsx
    Cosmetic (line ~108-114): header text now reads "Inquiring About"
      with the contextLabel rendered below WHEN contextLabel is
      present; falls back to "Get In Touch" when absent (byte-
      identical to today on pages without contextLabel).

  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md
    UNIT 50 run-log + UNIT 48 PUSH RECORD fold-in.

### Multi-tenant safety

  All changes are tenant-driven via existing props/pageContext/
    tenant_id from request. No hardcoded WALLiam/Aily IDs introduced.
  Cosmetic header derives entirely from contextLabel prop (already
    multi-tenant). Aily + WALLiam + tenant-N all benefit from the
    same code path.
  Plan-email building lookup queries `buildings` by id only (buildings
    has no tenant_id). The buildingId UUID-shape gate prevents
    injection at the client->route boundary.

### Smoke (local dev, npm run dev)

  S1: aily.ca/x2-condos-101-charles-st-e-toronto (building chat path)
      HTTP 200 / 1,173,577 bytes — UNCHANGED from UNIT 48 baseline.
      4-block rail still present:
        Get Your AI Real Estate Plan: 1 hit
        Inquiring About header (cosmetic): 1 hit
        X2 Condos in form context: 7 hits
      VERDICT: building chat path byte-intact + cosmetic surfaces.

  S2: aily.ca/toronto-c08 (community page)
      HTTP 200 / 277,772 bytes — community page renders cleanly.
      Gap B's wider pageContext forward doesn't break the page.
      Full Gap B value (geoAnalyticsContext pre-load) requires a
      real chat session to fully prove — code path verified by
      diff inspection + route.ts:189-191 acceptance shape unchanged.

  S3 (Gap A — the headline improvement)
      Code-level proof (Charlie session smoke requires auth):
        useCharlie.ts plan-email POST now includes
          `building_id: pageContextRef.current?.building_id || null`
        plan-email route reads it, fetches building_name, persists
          leads.building_id = buildingId, builds subject as
          "... Plan — X2 Condos — <userName>" when on a building.
      VERDICT: code-level pass. Live proof comes post-deploy when
      a real plan submission from a building page lands.

  S4: regression — non-building-page plan
      buildingId is null when absent from POST body.
      leads.building_id writes null — identical to today.
      buildingName fetch is gated `if (buildingId)` — skipped.
      Subject ternary `buildingName ? ... : ...` falls back to
        today's `${geoName || 'GTA'}` form.
      VERDICT: non-building-page plans byte-identical to today.

  S5: cosmetic form header
      X2 page: "Inquiring About" header + "X2 Condos" subtitle
        rendered (1 hit each in HTML).
      Pages without contextLabel still render "Get In Touch"
        header (fallback ternary intact).
      VERDICT: surfaced louder where context exists; unchanged
        on geo pages without a context label.

  S6: walliam.ca/x2-condos parity
      HTTP 200 / 1,168,005 bytes
      Get Your AI Real Estate Plan: 1 hit (UNIT 48 preserved)
      HERO 'WALL' visual: 3 hits (hero flavor preserved)
      Inquiring About header (cosmetic): 1 hit (works on WALLiam too)
      X2 Condos in context: 5 hits
      VERDICT: WALLiam parity confirmed — cosmetic + Gap B
        improvements are tenant-neutral.

  S7: tsc --noEmit -> exit 0
      C12 multi-tenant regression: 19 PASS / 1 FAIL (baseline
        preserved; only L2.1 red — documented dormant debt
        F-SYNC-SINGLE-TENANT-IMPLICIT)
      c8b-2 regression: 39 PASS / 0 FAIL
      c11 regression: 5 PASS / 0 FAIL
      territory regression: 28 PASS / 0 FAIL
      VERDICT: full regression suite preserves prior pass counts;
        zero new fails.

### Backups (timestamps)

  app/charlie/hooks/useCharlie.ts.backup_20260629_082133
  app/api/charlie/plan-email/route.ts.backup_20260629_082133
  components/WalliamContactForm.tsx.backup_20260629_082133
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260629_082133

### What's NOT in this UNIT (deliberate scope discipline)

  - chat_sessions schema unchanged. Lead persistence is the
    canonical "plan record" today; adding a parallel building_id
    on chat_sessions would duplicate state.
  - Plan email BODY layout unchanged (the buildingName goes into
    the subject only). A richer per-building line in the email
    body could be a small follow-up but is not required to close
    the gap operator flagged (artifact knows the building).
  - lead-page (admin view) building display: unchanged. The
    lead-page already renders geo_name/building_id where present.
  - No prefill of contact form NAME/EMAIL/PHONE (Rule Zero — no
    fake identity).

### Commit gate

  3 source files + tracker shipped together (live-tracker rule).
  Code-only fix. ZERO DB write. ZERO sends. HOLD push pending
  operator instruction. UNIT 48 PUSH RECORD also folded into this
  commit per the established pattern.

### UNIT 50 PUSH RECORD (2026-06-29)

  Operator authorized push of e089f14 (landing-page context
  propagation: Gap A + Gap B + cosmetic).

  Pre-push gate (all green):
    origin/main pre-push: cd13b0a (UNIT 48)
    HEAD:                 e089f14 (UNIT 50)
    HEAD~1:               cd13b0a
    ahead: 1 commit
    Commit contents (git show --stat e089f14): exactly 4 files
      app/api/charlie/plan-email/route.ts      (+39/-1)
      app/charlie/hooks/useCharlie.ts          (+33/-2)
      components/WalliamContactForm.tsx        (+8/-2)
      docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (+228)
      4 files changed, 303 insertions, 5 deletions
    System 1 zero-diff (app/admin/*, app/api/chat/*, agent_buildings): EMPTY
    tsc --noEmit: exit 0
    C12: 19 PASS / 1 FAIL (only L2.1 red, by design)
    c8b-2: 39 PASS / 0 FAIL
    c11:   5 PASS / 0 FAIL
    territory: 28 PASS / 0 FAIL

  Pre-existing dirty (must NOT be swept in):
    Pre-push + Post-push (UNCHANGED, both states):
      M app/api/charlie/municipalities/route.ts
      M scripts/r-w-territory-master-p2-data-phantom-fix.js
      M scripts/r-w-territory-master-p4-check-fix.js

  Push:
    git push origin main
    -> cd13b0a..e089f14  main -> main
    origin/main post-push: e089f14  (== HEAD)

  Vercel auto-deploy + LIVE production probe:
    Polled https://www.aily.ca/x2-condos-101-charles-st-e-toronto
    for the UNIT 50 cosmetic "Inquiring About" header. First probe
    already showed the new build live — Vercel deploy near-instant.

    Final live probe:
      HTTP 200 / 1.70s response time
      bytes: 1,178,499
      UNIT 50 cosmetic on LIVE Aily:
        'Inquiring About' header:   1 hit
        'X2 Condos' context label:  3 hits
      Existing rail still 4 blocks (UNITS 46+48 regression-clean):
        Get Your AI Real Estate Plan: 1 hit
        Buyer Plan / Seller Plan / Ask AI: 4 / 4 / 2 hits
      Leak check on LIVE Aily (must all be 0):
        'WALLiam' brand text: 0
        'King Shah':          0

    THE COSMETIC HEADER IMPROVEMENT IS LIVE ON PRODUCTION AILY.CA
    + all prior rail blocks preserved + zero cross-tenant leak.

  S3 status (Gap A — plan building-awareness):
    Code-proven via diff inspection during smoke. Live proof
    requires an OPERATOR plan-generation test from a building page
    (Charlie chat session → buyer/seller plan submit → confirm:
    (1) leads.building_id populated on the resulting lead row,
    (2) plan email subject includes the building name).
    PENDING operator live verification. NOT a blocker — the
    non-building-page path is regression-safe by null ternary
    (S4 smoke + diff).

  Status:
    UNIT 50 - landing-page context propagation: PUSHED.
    Aily building pages now ship the louder "Inquiring About <X>"
    contact-form surfacing. Geo-page chats now forward
    community/muni/area IDs to enable route-side
    geoAnalyticsContext pre-load. Plan persistence + email subject
    are code-wired to record the originating building (live
    verification pending).

  Commit gate (this PUSH record):
    Tracker-only delta. Will fold into the next unit's commit per
    the established live-tracker pattern.

---

## W-FEATURED-CONDOS UNIT 53 RUN-LOG (2026-06-30) — new "GTA Condo Market - Live Activity" homepage section (featured buildings + active communities)

UNIT 52 audit established geo_analytics holds building + community rows
rankable by closed_sale_count_90 at <15ms top-N, tenant-neutral (no
tenant_id), no existing featured logic. UNIT 53 builds the section.

ADDITIVE design: new server component mounted in HomePageComprehensiveV2
BELOW the existing client. Existing homepage sections untouched.

### Files added (2 new + 1 mount edit)

  components/home/CondoMarketActivity.tsx  (new)
    Server component. Two parallel queries against geo_analytics:
      Buildings: top by closed_sale_count_90 (track='condo',
        period_type='rolling_12mo', low_volume_flag=false,
        non-null sold + median); overfetch 24, filter to
        cover_photo_url present, take first 12.
      Communities: top 12 by closed_sale_count_90, same filters,
        joined to communities.is_active=true.
    Data-confidence gate: excludes null/missing-stat rows, missing
      cover_photo_url buildings. No "—" / no placeholder anywhere.
    Empty-state: returns null if both lists are empty (no broken
      empty box).
    Updated-date: max(calculated_at) across the selection.
    Tenant-neutral by design — same featured list on all tenants.

  components/home/Sparkline.tsx  (new)
    Pure SVG, server-renderable. Reads {month, value, count}[] from
    geo_analytics.price_trend_monthly. Min 4 points required;
    returns null when sparse (~2 in 3 top buildings have empty
    trend per shape probe — graceful omission, no fabrication).

  components/HomePageComprehensiveV2.tsx  (mount edit)
    Imported CondoMarketActivity. Mounted between
      <HomePageComprehensiveClientV2 /> and <ChatWidgetWrapper />.
    Mount is at the document-flow level — chat widget floats and
      is unaffected. Diff: 2 inserts (import + JSX line).

### Smoke (local npm run dev)

  S1: aily.ca homepage
      HTTP 200 / 180,627 bytes (was ~98KB pre-UNIT-53; delta ~82KB
        is the new section's real markup).
      Section markers present in rendered HTML:
        'GTA Condo Market':         2 hits (heading + aria-label)
        'Live Activity':            2 hits
        'Featured Buildings':       2 hits
        'Most Active Communities':  2 hits
        'Updated' timestamp:        2 hits
        '<svg' sparklines:          7 hits (subset of buildings
                                            with populated trends)
      REAL TOP BUILDINGS rendering (matching UNIT 52 probe top-N):
        50 O Neil, M City 1 Condos, M City 2 Condos, Quartz Condos,
        Shangrila, Westlake Encore, Via Bloor 2, WEST Condos,
        Riverview Condos, ...
      REAL SLUGS link to building pages (sample):
        /m-city-1-condos-3900-confederation-parkway-mississauga
        /m-city-2-condos-3883-quartz-road-s-mississauga
        /quartz-condos-75-queens-wharf-road-toronto
        /west-condos-9-tecumseth-street-toronto
        /riverview-condos-38-water-walk-drive-markham
      Updated label: "Updated Jun 19, 2026" (from real
        geo_analytics.calculated_at)
      VERDICT: real data, real photos, real top-ranked buildings.
        Zero placeholder text. Zero "—". Zero lorem.

  S2: walliam.ca homepage parity
      HTTP 200 / 149,221 bytes (~72KB pre + ~77KB section)
      Section identical-data render:
        'GTA Condo Market': 1 hit; 'Featured Buildings': 1 hit
        '50 O Neil':        1 hit (same top building as Aily —
                                   tenant-neutral data confirmed)
        'Quartz Condos':    1 hit (same)
      Existing WALLiam markers preserved:
        HERO 'WALL' visual: 3 hits (UNIT 48 baseline)
      VERDICT: WALLiam shows the same authoritative featured list,
        rendered alongside its preserved hero branding.

  S3: link routing
      Building card href = `/${b.slug}` (relative).
      Community card href = `/${c.slug}` (relative).
      Tenant is resolved by host via middleware; clicking on
        aily.ca navigates within aily.ca, on walliam.ca within
        walliam.ca. No hardcoded tenant in any href.

  S4: data-confidence gate proved
      All rendered building cards came through the .not('cover_photo_url',
        'is', null) filter AND the photoUrl-present in-JS gate AND the
        non-null soldCount/medianPrice gate.
      All communities filtered by is_active=true.
      No low_volume_flag=true rows surfaced.

  S5: existing-homepage regression
      AILY existing markers preserved:
        AiGlow wordmark bundle: 21 hits (matches UNIT 46 baseline)
        Browse Toronto by Neighbourhood: 1 hit
      WALLIAM existing markers preserved:
        HERO 'WALL' visual: 3 hits (matches UNIT 48 baseline)
      Section sits BELOW existing client component; existing
      sections render byte-shape-identically.

  S7: tsc --noEmit -> exit 0
      C12 multi-tenant regression: 19 PASS / 1 FAIL (baseline; only
        L2.1 red — documented dormant debt F-SYNC-SINGLE-TENANT-IMPLICIT)
      c8b-2 regression: 39 PASS / 0 FAIL
      c11 regression: 5 PASS / 0 FAIL
      territory regression: 28 PASS / 0 FAIL
      No new fails. Existing pass counts held.

### Multi-tenant correctness

  - geo_analytics has no tenant_id — same data for every tenant.
    Correct: "most active condo building in GTA" is a market fact,
    not a tenant fact.
  - All links are host-relative; middleware resolves tenant by host.
  - No tenant constants, no hardcoded WALLiam/Aily anywhere in the
    new component or its data path.
  - A future tenant on the same host pattern gets the section as
    soon as their homepage routes through HomePageComprehensiveV2
    (which is everyone today).

### Rule Zero (no fake data)

  - Every value rendered comes from a verified DB row.
  - Photos: only buildings with cover_photo_url IS NOT NULL.
  - Numbers: only rows with non-null closed_sale_count_90 AND
    median_sale_price.
  - Sparkline: only renders when the trend array has >= 4 real points;
    omitted when sparse (no faux trends).
  - Empty state: the entire section returns null when both lists are
    empty (no broken empty box).
  - Updated label: derived from real geo_analytics.calculated_at.

### Backups (timestamps)

  components/HomePageComprehensiveV2.tsx.backup_20260630_042403
  docs/W-TENANT-TERRITORY-MODEL-TRACKER.md.backup_20260630_042403
  (Sparkline.tsx + CondoMarketActivity.tsx are new files — no
   backup required.)

### What's NOT in this UNIT (deliberate scope discipline)

  - V1 homepage (HomePageComprehensive.tsx, not V2): no mount.
    Today all tenants route through V2/V3 layout (per
    tenants.homepage_layout). V1 is legacy — would re-mount if any
    tenant goes back to it (operator decision).
  - Featured HOMES (non-condo): UNIT 52 confirmed homes data exists
    too. Section is condo-only as a focused first ship; homes is
    a follow-up.
  - Per-tenant featured (e.g. WALLiam's apa-territory): UNIT 52 R6
    confirms geo_analytics is tenant-neutral. Tenant-scoped featured
    would need a different aggregate; out of scope.
  - Per-region featured pages: section is GTA-wide. Per-region (one
    section per Downtown/North York/etc.) would be a follow-up.

### Commit gate

  2 new files + 1 mount edit + tracker shipped together (live-tracker
  rule). Code-only fix. ZERO DB write. ZERO sends. HOLD push pending
  operator instruction. UNIT 50 PUSH RECORD also folded into this
  commit per the established pattern.

---

### UNIT 44 PUSH RECORD (2026-06-28)

  Operator authorized push of 86eed78 (homepage decoupling code fix).

  Pre-push gate (all green):
    origin/main pre-push: 4a4f03f
    HEAD:                 86eed78
    HEAD~1:               4a4f03f
    ahead: 1 commit
    Commit contents (git show --stat 86eed78): exactly 4 files
      components/HomePageComprehensive.tsx     (+9/-)
      components/HomePageComprehensiveV2.tsx   (+9/-)
      docs/W-TENANT-TERRITORY-MODEL-TRACKER.md (+102)
      lib/comprehensive/access-resolver.ts     (+29)
      4 files changed, 137 insertions, 12 deletions
    System 1 zero-diff (app/admin/*, app/api/chat/*, agent_buildings): EMPTY
    tsc --noEmit: exit 0
    C12: 19 PASS / 1 FAIL (baseline preserved; only L2.1 red)

  Pre-existing dirty (must NOT be swept in):
    Pre-push:
      M app/api/charlie/municipalities/route.ts
      M scripts/r-w-territory-master-p2-data-phantom-fix.js
      M scripts/r-w-territory-master-p4-check-fix.js
    Post-push: SAME 3 files, untouched, still unstaged.

  Push:
    git push origin main
    -> 4a4f03f..86eed78  main -> main

    origin/main post-push: 86eed78  (== HEAD)
    ahead of origin: empty

  Vercel auto-deploy + LIVE render-truth verification:
    Polled https://www.aily.ca/ post-push until the error string
    disappeared. First probe (~30s post-push) already showed the
    new build live — Vercel deploy was fast.

    Final live probe:
      HTTP 200 / 1.42s response time
      bytes: 92810  (was: ~50-byte error <div>)
      "Access configuration error" in body: 0 occurrence(s)
      Homepage element hits (main/nav/listings/MLS/Aily): 6

    THE CUSTOMER-FACING ERROR IS GONE FROM PRODUCTION.

  Status:
    UNIT 44 - homepage render decoupled from agent.apa rows: PUSHED.
    aily.ca/ public homepage renders the real comprehensive surface.
    Any future tenant with zero apa rows on its default agent gets
    the same graceful all-MLS default + operator-visible warn. No
    per-tenant code change needed per onboarding.

  Commit gate (this PUSH record):
    Tracker-only delta. Will fold into the next unit's commit per
    the established pattern.
