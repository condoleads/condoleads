# W-TERRITORY Tracker

**Started:** 2026-05-05
**Owner:** Shah (sole dev)
**Status:** **T3a CLOSED 2026-05-06.** Resolver baseline captured + v2 refactor applied + all 8 smoke tests PASS in production Supabase. T1 (decisions), T2a (core schema), and T3a (resolver foundation) all done. T3b (distribution + re-roll functions) is the next gate; T2b (percentage mode) can ship in parallel. T3b unblocks T4a, T4b, and T5.
**Sister tracker:** `docs/W-LAUNCH-TRACKER.md` — Section 1 Territory row + Section 2 "Territory as provider" + Section 3 P1-3 + Section 4 W-TERRITORY row all point here.

---

## Why this exists

W-HIERARCHY shipped the parent/child walker and recipient fan-out. W-ROLES-DELEGATION shipped the role ladder + delegation overlay + `can()` permissions. **Neither answers: when a lead arrives, which agent owns it? And on a geo page, which agent's face is shown?**

Territory is the resolution system that answers both questions. The walker stamps the chain upward from `agent_id`; territory determines which `agent_id` to start from for any given context (listing, building, area, geo page).

---

## Scope contract (LOCKED)

In scope:
1. Geo cascade resolver — single resolution path from listing/building/area context to `agent_id`
2. Tenant-level defaults config (which areas/munis the tenant covers)
3. Manager-level territory carving (subset of tenant default)
4. Agent-level assignments (subset of manager's territory)
5. Granular overrides — building-level and listing-level (manual wins)
6. **Two-layer ownership: primary (1 agent, drives the geo page) + routing (1+ agents, drives listing distribution and lead BCC)** — locked OD-5
7. **Distribution algorithms:** as-equal-as-possible with random tiebreak (default) OR percentage-based (Admin Tenant config) with auto-renormalize on agent remove
8. Re-roll on routing-set change; re-resolve listings that fall outside their cached agent's scope
9. Two audit tables: `lead_ownership_changes`, `territory_assignment_changes` ✅ shipped T2a
10. Admin UI at `/admin-homes/territory` (closes Phase 3 nav gap) + updates to the 4 existing embedded section components for `is_primary` and percentage controls
11. Public-facing UI: geo pages render the resolved primary agent card via `resolve_geo_primary` — without this the schema and admin work are invisible to end users

Out of scope:
- Multi-agent cards on a single geo page — explicitly rejected per OD-5 design call
- Sold-by-agent separate from listed-by-agent — single `agent_id` per listing covers both
- Buildings card-dealing system in `/admin` (System 1 — NEVER touched)
- Email fan-out logic — territory only resolves `agent_id`; W-HIERARCHY recipients helper handles fan-out

---

## Locked product model

### The single rule (consolidated, one paragraph)

> Defaults cascade. Assignments override. Leads follow ownership. Each geo unit has a **primary agent** (exactly 1, drives the public page) and a **routing set** (1+ agents, drives listing distribution and lead BCC).

### The 8-step resolution cascade (first-hit-wins)

| # | Level | Source | Type | Notes |
|---|---|---|---|---|
| 1 | Listing pin | `agent_listing_assignments` | firm | Manual override at unit level. |
| 2 | Building pin | `agent_geo_buildings` | firm | Manual override at building level. |
| 3 | Neighbourhood routing set | `agent_property_access` (scope='neighbourhood') | distributed | Hash-by-listing or primary. |
| 4 | Community routing set | `agent_property_access` (scope='community') | distributed | Hash-by-listing or primary. |
| 5 | Municipality routing set | `agent_property_access` (scope='municipality') | distributed | Hash-by-listing or primary. |
| 6 | Area routing set | `agent_property_access` (scope='area') | distributed | Hash-by-listing or primary. |
| 7 | User assignment | `tenant_users.assigned_agent_id` (modern) → `user_profiles.assigned_agent_id` (legacy) | sticky | Per-user override; modern path takes precedence. |
| 8 | Tenant default | `tenants.default_agent_id` → any active agent | fallback | Last-resort fallback; cascade always terminates. |

**Two distinct queries hit the cascade:**
- **Display query** ("who is the primary for this geo page?") → returns the row with `is_primary = true`
- **Routing query** ("who can receive a lead at this scope?") → returns all rows in the routing set; for a specific listing, returns the cached `listings.assigned_agent_id`

### Distribution mechanics

**Event 1 — Geographic footprint distribution (parent → child geo).** Whitby muni assigned to 10 agents → its 11 communities auto-distributed across those 10 agents (10 communities get 1 agent each as primary; the 11th randomly gets a 2nd). All 10 remain in routing set of every Whitby community by inheritance.

**Event 2 — Listing distribution within a community/building/etc.** Listings inside a geo unit distribute across the unit's routing set per equal-share (default) or percentage mode. Pick cached on `listings.assigned_agent_id`, re-rolled only on state change.

### Re-roll vs re-resolve

| Event | Effect on firm pins | Effect on routing-distributed listings |
|---|---|---|
| Agent added to a level's routing set | nothing | re-roll across new set |
| Agent removed | nothing | re-roll; **deterministic re-pick of primary if removed agent was primary** |
| Agent's scope shrinks | nothing | re-resolve only listings outside new scope; in-scope keep cached owner |
| Listing/building pin grant/revoke | the entity follows the pin | nothing |
| Primary flag change (no routing change) | nothing | nothing — only the page face changes |
| Percentage mode: agent removed | nothing | their % auto-renormalizes proportionally (e.g., {50, 30, 20} → remove 50 → {60, 40}) |

**No listing is ever orphaned.** Cascade always terminates at tenant default.

### Authority flow

Tenant Admin sets tenant-wide footprint. Managers carve subsets. Agents work within their manager's bounds. Managed agent's territory MUST be a subset of their manager's. Toggles only restrict downward.

### Platform-tier roles excluded (OD-4)

Manager Platform + Admin Platform never appear as primary, never join routing sets, never enter the cascade.

### Audit tables

- **`lead_ownership_changes`** ✅ shipped T2a — append-only audit of every reassignment with reason CHECK constraint covering reroll, scope_shrink, manual_reassign, percentage_renormalize, agent_removed, agent_added, pin_grant, pin_revoke, cascade_resolution, other.
- **`territory_assignment_changes`** ✅ shipped T2a — append-only audit of every territory boundary change with `change_type` CHECK covering assignment_granted/revoked, primary_set/unset, percentage_set/changed, scope_widened/narrowed, pin_added/removed, access_toggle_changed. before_state and after_state captured as JSONB.

Both tables enforce append-only via triggers that RAISE on UPDATE/DELETE.

---

## Open decisions — ALL RESOLVED ✅

**OD-1.** ✅ Flat `agent_geo_buildings` schema (current on disk: `(agent_id, building_id)`). Junction-to-`agent_property_access.id` rejected as over-engineering. No junction migration.
**OD-2.** ✅ Re-resolve only carved-out listings. Cascade always terminates at tenant default — no orphans.
**OD-3.** ✅ Agent set change at a level triggers re-roll. New agent doesn't auto-become primary. Defaults always fill vacuum.
**OD-4.** ✅ Platform-tier roles excluded entirely. Tenant-internal roles (Tenant Admin, Area Manager, Manager, Agent) can own.
**OD-5.** ✅ Two-layer model: primary (1, display) + routing (1+, distribution). `is_primary` flag + 4 partial unique indexes. Resolves the multi-agent-cards-on-page blocker.
**OD-6.** ✅ Two-function split (`resolve_agent_for_context` routing + `resolve_display_agent_for_context` display) over a `mode` param. Decided during T3a — the two queries have substantively different cascade logic (display walks the tree for selling), so a mode-param would have been a switch statement inside one function. Split is cleaner.

---

## Phases

### T1 — Decision lock ✅ CLOSED 2026-05-05

All five OD-* decisions resolved. Tracker spec frozen. (OD-6 added retroactively during T3a.)

### T2a — Core schema migrations ✅ CLOSED 2026-05-06

All 4 migrations applied + verified PASS in Supabase:

| File | Effect | Verify |
|---|---|---|
| `20260506_t2a_01_apa_tenant_id_not_null.sql` | `tenant_id NOT NULL` | `tenant_id_nullable=NO` → PASS |
| `20260506_t2a_02_apa_is_primary.sql` | `is_primary boolean NOT NULL DEFAULT false` + 4 partial unique indexes + backfill | `is_primary_type=boolean`, `is_primary_default=false`, `partial_index_count=4`, `rows_marked_primary=1` → PASS |
| `20260506_t2a_03_lead_ownership_changes.sql` | audit table + append-only triggers | `table_name=lead_ownership_changes`, `trigger_count=2` → PASS |
| `20260506_t2a_04_territory_assignment_changes.sql` | audit table + append-only triggers | `table_name=territory_assignment_changes`, `trigger_count=2` → PASS |

Backfill outcome: the 1 existing row (King Shah's muni-scoped assignment in WALLiam tenant) is marked `is_primary=true`. Future inserts can rely on the partial unique indexes for the at-most-one-primary invariant.

### T2b — Percentage mode (parallel with T3b)

- `agent_property_access.percentage NUMERIC NULL` (NULL = equal-share for that level)
- DB-level CHECK: percentages within a routing set sum to 100 if any are set
- Auto-renormalize trigger / function: when an agent is removed from a level, their percentage redistributes proportionally to remaining agents
- Architecture supports adding without breaking T2a/T3a behavior; can ship after T3b if priorities shift.

### T3a — Resolver baseline + v2 refactor ✅ CLOSED 2026-05-06

Both migrations applied + all 8 smoke tests PASS in Supabase production:

| File | Effect | Verify |
|---|---|---|
| `20260507_t3_01_resolver_baseline.sql` | CREATE OR REPLACE both 7-param baseline functions (idempotent capture into migration history — fresh DB setups now end up with the same starting state as production) | `pronargs=7` for both → PASS |
| `20260507_t3_02_resolvers_v2.sql` | DROP both old (7-param) and new (8-param) signatures; CREATE OR REPLACE helpers `resolve_geo_primary` (3-arg) + `pick_routing_agent` (4-arg); CREATE both v2 resolvers (8-arg) | `pick_routing_agent=4`, `resolve_geo_primary=3`, both resolvers `pronargs=8` → PASS |

Smoke matrix against WALLiam tenant (`b16e1039-38ed-43d7-bbc5-dd02bb651bc9`) + Whitby municipality (`70103aef-1b32-4939-9ff8-264e859a5587`):

| Test | Call | Expected | Result |
|---|---|---|---|
| Primary resolver | `resolve_geo_primary('municipality', whitby, walliam)` | King Shah | ✅ PASS |
| Routing resolver (page-level, no listing) | `resolve_agent_for_context(NULL,…,muni=whitby,…,walliam)` | King Shah (only agent in routing set → returns primary) | ✅ PASS |
| Display resolver | `resolve_display_agent_for_context(NULL,…,muni=whitby,…,walliam)` | King Shah (confirms `is_selling=true`) | ✅ PASS |

**Behavior changes shipped vs baseline:**
- **NEW PARAM** `p_neighbourhood_id` at P3 (8 total params, was 7)
- **NEW LEVEL P3** for neighbourhood routing
- **REMOVED** managed-child auto-substitution at geo levels — contradicted spec
- **NEW PRIORITY** `tenant_users.assigned_agent_id` modern path at P7, before legacy `user_profiles.assigned_agent_id` at P8
- Multi-agent geo levels: hash-distribute by `listing_id` when present (equal-share, deterministic); `is_primary` row otherwise (drives page-level lead routing)
- Display resolver: calls `resolve_geo_primary` first to find `is_primary` at most-specific level; if primary `is_selling=true` returns it; else falls through to existing routing-then-walk-tree-for-selling logic

### T3b — Distribution + re-roll functions (RECOMMENDED NEXT)

Unblocks T4a, T4b, and T5 simultaneously.

- Event 1 distribution function: when a parent geo's routing set changes, auto-update children's primaries (as-equal-as-possible with random tiebreak) + trigger on `agent_property_access` INSERT/UPDATE/DELETE
- Event 2 distribution function: equal-share random pick (T2a) and percentage-based pick (T2b) for `listings.assigned_agent_id` cache + trigger on routing-set change
- Re-roll function (operationalizes the consolidated rule)
- Re-resolve function (handles scope-shrink case)
- **Caller update:** thread `p_neighbourhood_id` through the 9 existing callers of `resolve_agent_for_context` where applicable. Currently they call with 7 args; the new 8-arg signature accepts those calls (defaults handle the missing arg) but **routes neighbourhood-level requests to NULL → never resolves at neighbourhood level until callers are updated**.

### T4a — Admin UI: `/admin-homes/territory` + section component updates

New page consolidating the 4 currently-embedded section components:
- Tenant defaults, manager carving, agent assignment within bounds, granular overrides, primary flag toggle, percentage mode config (T2b feature, UI can ship even if T2b ships separately), audit log viewer
- Existing 4 components also updated: surface `is_primary` toggle, percentage inputs (T2b), inherited-vs-explicit indicators
- Subset enforcement at form layer (filtered dropdowns) + server (`can()` revalidation)

### T4b — Public-facing UI: geo page primary agent display

The public site renders area / muni / community / neighbourhood / building pages. Each needs to display the **primary agent** card sourced from `resolve_geo_primary`. Without T4b, T2a/T3a/T4a are invisible to end users.

Pre-T4b recon required (in this phase, not deferred):
- Locate existing geo page routes + agent-card components
- Confirm how they fetch agent data today

Scope:
- Update geo page routes to call the new display resolver
- Update agent card components to render the resolved primary
- Fall through gracefully when no primary set (cascade to parent's primary, ultimately tenant default) — every page always has exactly one card
- **Building pages are a documented shared exception between System 1 and System 2** — handled with extreme care. T4b touches only the System 2 path; System 1's card-dealing rendering stays untouched.

### T5 — Listing cache + re-roll wiring

- `listings.assigned_agent_id` column with FK to `agents` (verify or add)
- Trigger / scheduled function: re-roll on territory state change per the consolidated rule
- `lead_ownership_changes` row written on every reassignment with reason classification

### T6 — Smoke matrix

- Cascade resolution: every level resolves correctly (display + routing modes)
- Subset rule enforcement: cross-bound assignment blocked at server
- Re-roll behavior: agent add/remove triggers expected redistribution
- Re-resolve behavior: scope shrink moves only carved-out listings
- Primary flag: flipping changes display only, not routing
- Percentage mode (T2b): Sarah-leaves test produces auto-renormalize {Mike 60, Linda 40}
- Audit trail: every reassignment writes a row with correct reason
- Multi-tenant: `tenant_id NOT NULL` prevents cross-tenant assignment
- Platform-tier exclusion: Manager Platform / Admin Platform never appear in cascade results

### T7 — Close

T1–T6 complete; UI shipped; smoke matrix all PASS; W-LAUNCH-TRACKER Section 4 W-TERRITORY row updated to CLOSED with commit hashes.

---

## Workflow rules in effect

All Rule Zero invariants apply (multitenant, no regressions, comprehensive only, nothing deferred, no guessing, backups before edits, no placeholders, secrets fingerprint, System 1 isolation).

Specific to W-TERRITORY:
- **Buildings card-dealing system in `/admin` is NEVER touched.**
- **Single resolution path** through the resolver. No bypassing.
- **Display vs routing separation enforced at DB level** via `is_primary` + 4 partial unique indexes (T2a-02).
- **Cache invalidation on state change.** `listings.assigned_agent_id` re-roll trigger fires on routing-set change; `lead_ownership_changes` captures the diff with reason.
- **Audit before action** — every territory mutation writes an audit row.

---

## Findings

**T2a-02 backfill (2026-05-06):** With only 1 existing row in `agent_property_access`, backfill was mechanical — that row is now `is_primary=true`. Algorithm (deterministic earliest-by-created_at per group) scales to any future state without changes.

**Schema shape choice — 4 partial indexes, not 1.** The `agent_property_access` schema uses separate scope_id columns (`area_id`, `municipality_id`, `community_id`, `neighbourhood_id`) instead of a single `scope_id`. This shaped T2a-02: shipped 4 partial unique indexes (one per scope) instead of one composite index over a synthetic generated column. Trade-off: 4 indexes are more verbose but transparent and don't require generated-column complexity.

**`scope` column verified present on `agent_property_access` (T3a pre-flight, 2026-05-06).** The v2 helpers reference `WHERE scope = p_scope` and the column is `text` type — v2 SQL applied cleanly. Pre-flight check: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='agent_property_access' AND column_name='scope';` returned 1 row.

**Caller compatibility — 9 callers of `resolve_agent_for_context` still on 7-arg signature (T3a finding).** The v2 8-arg signature was created with `p_neighbourhood_id` defaulting to NULL, so existing 7-arg-style calls continue to work without change. **However** — none of the 9 callers can route at neighbourhood level until they are updated to thread `p_neighbourhood_id`. Logged as required step in T3b. No production behavior regression — neighbourhood-level routing didn't exist pre-T3a.

**Yellow flag (not blocking):** 4 of 7 agents have NULL `tenant_id`. Doesn't block T2a/T3a (the 1 apa row's agent has tenant_id set + the smoke tests passed against WALLiam-scoped data), but auto-distribution in T3b must handle agents with no tenant or guarantee tenant assignment as a precondition. Tracked separately — not in scope for T3a.

**Audit reason taxonomy.** `lead_ownership_changes.reason` CHECK includes 10 values; `territory_assignment_changes.change_type` includes 11. Both extensible via DB migration if T3b/T5 surface new reason classes.

---

## Status log

- **2026-05-05 v1** — Tracker created as artifact (markdown). Captured locked design from past sessions. T0 recon already complete in launch tracker; this artifact starts at T1 (decision lock).

- **2026-05-05 v2** — **T1 CLOSED.** All five open decisions resolved in single session:
  - **OD-1** = flat schema; **OD-2** = re-resolve only carved-out, cascade terminates at tenant default; **OD-3** = re-roll on agent set change, new agent not auto-primary; **OD-4** = platform-tier roles excluded; **OD-5** (added retroactively) = two-layer primary+routing model.
  - Spec refinements: distribution is two-level (Event 1 parent→child, Event 2 geo→listings), as-equal-as-possible with random tiebreak, percentage mode auto-renormalizes on remove. The 11-communities/10-agents canonical example documented.
  - T2 split into T2a (core) + T2b (percentage). Architecture supports both; V1 ships without %.
  - **Scope amendment same v2:** added scope item 11 (public-facing UI) and split T4 into T4a (admin) + T4b (public). Building pages flagged as System 1/System 2 shared exception.

- **2026-05-06 v3** — **T2a CLOSED.** All 4 schema migrations applied + verified PASS in Supabase SQL editor:
  - **T2a-01** (`20260506_t2a_01_apa_tenant_id_not_null.sql`): `agent_property_access.tenant_id NOT NULL`. Pre-flight DO block confirmed 0 NULL rows. Verify: `tenant_id_nullable=NO` → PASS.
  - **T2a-02** (`20260506_t2a_02_apa_is_primary.sql`): `is_primary boolean NOT NULL DEFAULT false` + 4 partial unique indexes + backfill. Verify: `is_primary_type=boolean`, `default=false`, `partial_index_count=4`, `rows_marked_primary=1` → PASS. The 1 existing muni-scoped row (King Shah, WALLiam tenant) flipped to primary via deterministic earliest-by-created_at backfill.
  - **T2a-03** (`20260506_t2a_03_lead_ownership_changes.sql`): audit table + 2 append-only triggers (no_update, no_delete) + 4 indexes + reason CHECK over 10 values. Verify: `table_name=lead_ownership_changes`, `trigger_count=2` → PASS.
  - **T2a-04** (`20260506_t2a_04_territory_assignment_changes.sql`): audit table + 2 append-only triggers + 4 indexes + change_type CHECK over 11 values + JSONB before_state/after_state. Verify: `table_name=territory_assignment_changes`, `trigger_count=2` → PASS.
  - **Schema foundation in place.** All future territory work (T3 resolver, T4 UI, T5 cache, T6 smoke) builds on these tables and constraints.
  - **Pattern clarification adopted:** Supabase SQL editor only returns the LAST result set when multiple SELECTs are pasted together. Verification SELECTs now go in SEPARATE blocks, one per result. Memory updated.

- **2026-05-06 v4** — **T3a CLOSED.** Both T3a migrations applied to production via Supabase SQL editor; smoke matrix 8/8 PASS.
  - **T3a-01** (`20260507_t3_01_resolver_baseline.sql`): CREATE OR REPLACE of both existing 7-param resolvers, capturing pre-T3 state into migration history (idempotent against production). Verify: `pronargs=7` for both `resolve_agent_for_context` and `resolve_display_agent_for_context` → PASS.
  - **T3a-02** (`20260507_t3_02_resolvers_v2.sql`): DROP both old (7-param) and new (8-param) signatures + CREATE OR REPLACE helpers `resolve_geo_primary` (3-arg) + `pick_routing_agent` (4-arg) + CREATE both v2 resolvers (8-arg). Verify: 4 functions present with correct pronargs → PASS.
  - **Smoke matrix** against WALLiam (`b16e1039-38ed-43d7-bbc5-dd02bb651bc9`) + Whitby (`70103aef-1b32-4939-9ff8-264e859a5587`): `resolve_geo_primary` → King Shah PASS; `resolve_agent_for_context` (no listing) → King Shah PASS; `resolve_display_agent_for_context` → King Shah PASS (confirms `is_selling=true`).
  - **T3 phase split into T3a (closed) + T3b (next gate).** T3a covers resolver foundation; T3b covers distribution + re-roll functions + caller updates.
  - **OD-6 recorded retroactively:** kept two-function split over `mode` param. Routing and display have substantively different cascade logic (display walks tree for selling) — split is cleaner.
  - **Pre-flight check added to Findings:** `scope text` column verified present on `agent_property_access` before T3a-02 apply. Without it, the v2 helpers' `WHERE scope = p_scope` clauses would have failed.
  - **Caller compatibility logged in Findings:** 9 callers still on 7-arg style; new 8-arg signature accepts those calls via NULL default for `p_neighbourhood_id`, but neighbourhood routing is unreachable until callers are updated. Required T3b step.

---

## Next action

**T3b — Distribution + re-roll functions.** Recommended over T2b because T3b unblocks T4a, T4b, AND T5 simultaneously. T2b (percentage mode) can ship in parallel or after T3b without breaking anything T2a/T3a put in place.

Pre-T3b recon (in this phase, not deferred):
1. Read all 9 callers of `resolve_agent_for_context` and confirm which currently expect to route at neighbourhood level (none do today since the param didn't exist). Decide per-caller whether to thread `p_neighbourhood_id` through or leave NULL.
2. Verify whether `listings.assigned_agent_id` column exists or must be added as part of T3b/T5.
3. Inventory existing trigger infrastructure on `agent_property_access` — Event 1 distribution will likely fire from this table's INSERT/UPDATE/DELETE.

After recon, T3b ships:
- Event 1 distribution function (parent geo → child primaries, as-equal-as-possible + random tiebreak) + trigger on `agent_property_access`
- Event 2 distribution function (geo → listing cache, equal-share or % per tenant config) + trigger on routing-set change
- Re-roll function (operationalizes the consolidated rule)
- Re-resolve function (scope-shrink handler)
- Caller update: thread `p_neighbourhood_id` through the 9 existing callers where applicable

After T3b closes, T2b (percentage) becomes a parallel ship; T4a + T4b + T5 all unblock.