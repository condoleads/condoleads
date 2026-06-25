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
| W-HOUSE-ACCOUNT UNIT 8B (house-account oversight: CC on every lead email + tenant-wide dashboard visibility; Part 0 = COMPUTE-met ownership confirmed) | territory→leads→email | SHIPPED LOCAL | (pending this commit) | live operator click-test (lead emails + leads dashboard) |
| Phase 1b NOT NULL on tenants.default_agent_id | territory | DEFERRED | — | needs create-tenant auto-seed first |
| Phase 2 cards_opt_out column + CHECK | territory→hierarchy (opt-out) | DEFERRED | — | adds the col the empty-house-account CHECK needs |
| Phase 3 admin_assistant role + SMOKE 7 role-ineligible | territory→hierarchy (roles) | DEFERRED | — | owns the role-ineligible reject test |

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
