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
| Phase 1 house-account invariant (trigger + PATCH + picker + guards) | territory→leads (ownership fallback) | SHIPPED LOCAL, DDL live | ebc0487 | push held; live picker click-test on aily.ca |
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
