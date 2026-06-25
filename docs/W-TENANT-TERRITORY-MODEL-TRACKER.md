## W-TENANT-TERRITORY-MODEL — agreed target model (2026-06-24 design session)

PURPOSE: the brokerage operating model for tenant/role/territory/lead distribution.
Engine (resolver + cascade + hash-split + hierarchy) is built (per W-TERRITORY-ARCH-REVIEW).
This records the AGREED model so review can find gaps = fine-tuning vs real work.

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
