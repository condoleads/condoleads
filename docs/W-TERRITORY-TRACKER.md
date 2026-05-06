# W-TERRITORY Tracker

**Started:** 2026-05-05
**Owner:** Shah (sole dev)
**Status:** **T3b-A + T3b-B CLOSED 2026-05-06.** Listings cache column + 4 distribution/re-roll/re-resolve PL/pgSQL functions applied to production; end-to-end smoke against Whitby PASS (11/11 community primaries assigned, matching canonical spec scenario at N=1). T1 (decisions), T2a (core schema), T3a (resolver foundation), T3b-A (cache column), T3b-B (distribution functions) all done. **T3b-C (triggers) is the next gate** — wires distribution to fire autonomously on apa changes. T3b-D (TypeScript caller updates) follows.
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
| 3 | Neighbourhood routing set | `agent_property_access` (scope='neighbourhood') | distributed | Hash-by-listing or primary. Display only — `mls_listings` has no `neighbourhood_id`. |
| 4 | Community routing set | `agent_property_access` (scope='community') | distributed | Hash-by-listing or primary. |
| 5 | Municipality routing set | `agent_property_access` (scope='municipality') | distributed | Hash-by-listing or primary. |
| 6 | Area routing set | `agent_property_access` (scope='area') | distributed | Hash-by-listing or primary. |
| 7 | User assignment | `tenant_users.assigned_agent_id` (modern) → `user_profiles.assigned_agent_id` (legacy) | sticky | Per-user override; modern path takes precedence. |
| 8 | Tenant default | `tenants.default_agent_id` → any active agent | fallback | Last-resort fallback; cascade always terminates. |

**Two distinct queries hit the cascade:**
- **Display query** ("who is the primary for this geo page?") → returns the row with `is_primary = true`
- **Routing query** ("who can receive a lead at this scope?") → returns all rows in the routing set; for a specific listing, returns the cached `mls_listings.assigned_agent_id`

### Geo hierarchy (per actual schema, not a chain)

```
treb_areas
  ├── municipalities (area_id NOT NULL)
  │     └── communities (municipality_id NOT NULL)
  └── neighbourhoods (area_id NULLABLE)
```

Neighbourhoods are children of areas, not communities. The resolver cascade order (P3 neighbourhood → P4 community → P5 municipality → P6 area) reflects **priority**, not parent-child links. Event 1 distribution pairs are: area→municipality, area→neighbourhood, municipality→community. **No community→neighbourhood pair.**

### Distribution mechanics

**Event 1 — Geographic footprint distribution (parent → child geo).** Whitby muni assigned to 10 agents → its 11 communities auto-distributed across those 10 agents (10 communities get 1 agent each as primary; the 11th randomly gets a 2nd). All 10 remain in routing set of every Whitby community by inheritance. **Verified at N=1 in T3b-B smoke**: 1 muni agent (King Shah), 11 communities, all 11 got King Shah as primary.

**Event 2 — Listing distribution within a community/area/muni.** Listings inside a geo unit distribute across the unit's routing set per equal-share (default) or percentage mode. Pick cached on `mls_listings.assigned_agent_id`, re-rolled only on state change. **Cannot route at neighbourhood level** — `mls_listings` has no `neighbourhood_id`.

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

- **`lead_ownership_changes`** ✅ shipped T2a — append-only audit of every reassignment with reason CHECK constraint covering reroll, scope_shrink, manual_reassign, percentage_renormalize, agent_removed, agent_added, pin_grant, pin_revoke, cascade_resolution, other. **`lead_id` is NOT NULL**, so this table is for actual lead reassignments (T3b-D scope), NOT mls_listings cache changes.
- **`territory_assignment_changes`** ✅ shipped T2a + actively written by T3b-B `distribute_geo_to_children` — append-only audit of every territory boundary change with `change_type` CHECK covering assignment_granted/revoked, primary_set/unset, percentage_set/changed, scope_widened/narrowed, pin_added/removed, access_toggle_changed. before_state and after_state captured as JSONB.

Both tables enforce append-only via triggers that RAISE on UPDATE/DELETE.

---

## Open decisions — ALL RESOLVED ✅

**OD-1.** ✅ Flat `agent_geo_buildings` schema (current on disk: `(agent_id, building_id)`). Junction-to-`agent_property_access.id` rejected as over-engineering. No junction migration.
**OD-2.** ✅ Re-resolve only carved-out listings. Cascade always terminates at tenant default — no orphans.
**OD-3.** ✅ Agent set change at a level triggers re-roll. New agent doesn't auto-become primary. Defaults always fill vacuum.
**OD-4.** ✅ Platform-tier roles excluded entirely. Tenant-internal roles (Tenant Admin, Area Manager, Manager, Agent) can own.
**OD-5.** ✅ Two-layer model: primary (1, display) + routing (1+, distribution). `is_primary` flag + 4 partial unique indexes. Resolves the multi-agent-cards-on-page blocker.
**OD-6.** ✅ Two-function split (`resolve_agent_for_context` routing + `resolve_display_agent_for_context` display) over a `mode` param. Decided during T3a.
**OD-7.** ✅ `distribute_geo_to_children` uses 4-arg signature with explicit child_scope (rather than auto-deriving) because area has TWO children (municipality + neighbourhood). Triggers in T3b-C call the function once per child scope. Decided during T3b-B.

---

## Phases

### T1 — Decision lock ✅ CLOSED 2026-05-05

All five OD-* decisions resolved. (OD-6 + OD-7 added retroactively during T3a + T3b-B implementation.)

### T2a — Core schema migrations ✅ CLOSED 2026-05-06

All 4 migrations applied + verified PASS in Supabase:

| File | Effect | Verify |
|---|---|---|
| `20260506_t2a_01_apa_tenant_id_not_null.sql` | `tenant_id NOT NULL` | `tenant_id_nullable=NO` → PASS |
| `20260506_t2a_02_apa_is_primary.sql` | `is_primary boolean NOT NULL DEFAULT false` + 4 partial unique indexes + backfill | `is_primary_type=boolean`, `partial_index_count=4`, `rows_marked_primary=1` → PASS |
| `20260506_t2a_03_lead_ownership_changes.sql` | audit table + append-only triggers | `trigger_count=2` → PASS |
| `20260506_t2a_04_territory_assignment_changes.sql` | audit table + append-only triggers | `trigger_count=2` → PASS |

### T2b — Percentage mode (parallel with T3b/c remaining sub-phases)

- `agent_property_access.percentage NUMERIC NULL` (NULL = equal-share for that level)
- DB-level CHECK: percentages within a routing set sum to 100 if any are set
- Auto-renormalize trigger / function: when an agent is removed from a level, their percentage redistributes proportionally to remaining agents
- Architecture supports adding without breaking T2a/T3a/T3b behavior; can ship after T3b if priorities shift.

### T3a — Resolver baseline + v2 refactor ✅ CLOSED 2026-05-06

Both migrations applied + 8/8 smoke PASS:

| File | Effect | Verify |
|---|---|---|
| `20260507_t3_01_resolver_baseline.sql` | CREATE OR REPLACE both 7-param baseline functions (idempotent capture into migration history) | `pronargs=7` for both → PASS |
| `20260507_t3_02_resolvers_v2.sql` | DROP both old (7-param) and new (8-param) signatures; CREATE OR REPLACE helpers `resolve_geo_primary` (3-arg) + `pick_routing_agent` (4-arg); CREATE both v2 resolvers (8-arg) | All 4 functions with correct pronargs → PASS |

Behavior changes shipped vs baseline:
- New `p_neighbourhood_id` param at P3 (8 total params, was 7)
- Removed managed-child auto-substitution at geo levels — contradicted spec
- Added `tenant_users.assigned_agent_id` modern path at P7, before legacy `user_profiles` at P8
- Multi-agent geo levels: hash-distribute by listing_id when present; is_primary row otherwise
- Display resolver calls `resolve_geo_primary` first; falls through to walk-tree-for-selling

### T3b-A — Listings cache column ✅ CLOSED 2026-05-06

| File | Effect | Verify |
|---|---|---|
| `20260507_t3b_a_01_mls_listings_assigned_agent_id.sql` | `mls_listings.assigned_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL` + partial index `idx_mls_listings_assigned_agent_id WHERE NOT NULL` | column type/nullable + FK ON DELETE=SET NULL + partial idx all PASS |

Pre-flight findings (recorded in Findings):
- Spec said "listings"; actual table is `mls_listings` (491 columns, MLS-derived).
- mls_listings has no `tenant_id` (tenant-agnostic) and no `neighbourhood_id`.

Lock profile: ADD COLUMN nullable + no default = metadata-only change; FK validation trivially satisfied (initial NULL); partial index empty initially. Total lock duration: milliseconds.

### T3b-B — Distribution + re-roll + re-resolve functions ✅ CLOSED 2026-05-06

| File | Effect | Verify |
|---|---|---|
| `20260507_t3b_b_01_distribution_functions.sql` | CREATE OR REPLACE 4 PL/pgSQL functions: `distribute_geo_to_children` (4-arg), `distribute_listings_at_geo` (3-arg), `reroll_listings_at_geo` (3-arg), `reresolve_listing` (2-arg) | 4 functions present with correct pronargs → PASS |

End-to-end smoke against WALLiam tenant + Whitby municipality:
- Preview: 11 communities under Whitby, 0 had primaries → 11 vacuums.
- Execute: `distribute_geo_to_children('municipality', whitby_id, 'community', walliam_id)` returned 11.
- Side effect: 11 new apa rows at community scope (is_primary=true, agent_id=King Shah) + 11 audit rows in `territory_assignment_changes` (change_type='primary_set').
- This matches the canonical "10 agents/11 communities" spec scenario at N=1: a single muni-level agent fills every community vacuum.

Locked design choices (encoded in OD-7 + Findings):
- 4-arg signature with explicit child_scope (area has TWO children).
- Race safety via BEGIN/EXCEPTION WHEN unique_violation around the apa INSERT — handles concurrent triggers without aborting user transactions.
- Pre-existing UNIQUE INDEX `(agent_id, community_id)` is also caught by the same handler.
- mls_listings cache changes write NO audit row in V1 (lead_ownership_changes.lead_id NOT NULL incompatibility). Documented gap.

### T3b-C — Triggers on agent_property_access (RECOMMENDED NEXT)

Wires the T3b-B functions to fire automatically on apa INSERT/UPDATE/DELETE.

Trigger plan (locked design):
- **AFTER INSERT** trigger: fires `distribute_geo_to_children` for valid child scopes + `reroll_listings_at_geo` (if scope ∈ {area, municipality, community})
- **AFTER UPDATE** trigger: fires `reroll_listings_at_geo` only on routing-affecting changes (is_active flip, agent_id change)
- **AFTER DELETE** trigger: fires `reroll_listings_at_geo`
- **Recursion guard:** `pg_trigger_depth() > 1 → RETURN`. Built-in PG mechanism, no session variables. Prevents infinite loop when distribute_geo_to_children INSERTs into apa.

After T3b-C closes, the system is fully autonomous — any apa change auto-cascades through territory updates without manual function calls.

### T3b-D — Caller updates (TypeScript)

Thread `p_neighbourhood_id` through the 9 existing callers of `resolve_agent_for_context` where applicable. Currently they call with 7 args; the 8-arg signature accepts via NULL default, but neighbourhood-level routing is unreachable until callers are updated.

Callers (verified during T3b pre-recon):
- `app/api/charlie/appointment/route.ts:96`
- `app/api/charlie/lead/route.ts:99`
- `app/api/walliam/assign-user-agent/route.ts:116`
- `app/api/walliam/charlie/session/route.ts:63`
- `app/api/walliam/contact/route.ts:68`
- `app/api/walliam/estimator/session/route.ts:73`
- `app/api/walliam/resolve-agent/route.ts:32`
- `lib/actions/leads.ts:70`
- `lib/utils/is-walliam.ts:68`

Per-caller decision: which expect to route at neighbourhood level (none do today since the param didn't exist). Most likely answer: NULL through everywhere, with the resolver-agent endpoint accepting an optional neighbourhood param for forward compatibility.

### T4a — Admin UI: `/admin-homes/territory` + section component updates

New page consolidating the 4 currently-embedded section components:
- Tenant defaults, manager carving, agent assignment within bounds, granular overrides, primary flag toggle, percentage mode config (T2b), audit log viewer
- Existing 4 components also updated: surface `is_primary` toggle, percentage inputs, inherited-vs-explicit indicators
- Subset enforcement at form layer (filtered dropdowns) + server (`can()` revalidation)

### T4b — Public-facing UI: geo page primary agent display

The public site renders area / muni / community / neighbourhood / building pages. Each needs to display the **primary agent** card sourced from `resolve_geo_primary`.

Pre-T4b recon required:
- Locate existing geo page routes + agent-card components
- Confirm how they fetch agent data today

Scope:
- Update geo page routes to call the new display resolver
- Update agent card components to render the resolved primary
- Fall through gracefully when no primary set (cascade to parent's primary, ultimately tenant default)
- **Building pages are a documented shared exception between System 1 and System 2** — handled with extreme care.

### T5 — Listing cache + re-roll wiring

**Partly absorbed into T3b-A + T3b-B + T3b-C.** Remaining work:
- Verify all 4 trigger paths fire correctly under realistic edge cases (covered in T6 smoke matrix)
- Reconcile with any nightly-sync impact on mls_listings.assigned_agent_id (new MLS rows arrive without cache; T3b-B `distribute_listings_at_geo` populates them — but trigger fires on apa change, not on mls_listings INSERT; this is a sync-boundary gap that T6 must verify or T5 closes via mls_listings INSERT trigger if needed)

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
- New MLS rows: nightly sync inserts populate cache via on-demand resolver OR explicit distribute call

### T7 — Close

T1–T6 complete; UI shipped; smoke matrix all PASS; W-LAUNCH-TRACKER Section 4 W-TERRITORY row updated to CLOSED with commit hashes.

---

## Workflow rules in effect

All Rule Zero invariants apply (multitenant, no regressions, comprehensive only, nothing deferred, no guessing, backups before edits, no placeholders, secrets fingerprint, System 1 isolation).

Specific to W-TERRITORY:
- **Buildings card-dealing system in `/admin` is NEVER touched.**
- **Single resolution path** through the resolver. No bypassing.
- **Display vs routing separation enforced at DB level** via `is_primary` + 4 partial unique indexes (T2a-02).
- **Cache invalidation on state change.** `mls_listings.assigned_agent_id` re-roll fires from apa triggers (T3b-C, pending); `territory_assignment_changes` captures the diff.
- **Audit before action** — every territory mutation writes an audit row to `territory_assignment_changes`.

---

## Findings

**T2a-02 backfill (2026-05-06):** With only 1 existing row in `agent_property_access`, backfill was mechanical — that row is now `is_primary=true`. Algorithm (deterministic earliest-by-created_at per group) scales to any future state without changes.

**Schema shape choice — 4 partial indexes, not 1.** The `agent_property_access` schema uses separate scope_id columns (`area_id`, `municipality_id`, `community_id`, `neighbourhood_id`) instead of a single `scope_id`. This shaped T2a-02: shipped 4 partial unique indexes (one per scope) instead of one composite index over a synthetic generated column.

**`scope` column verified present on `agent_property_access` (T3a pre-flight, 2026-05-06).** The v2 helpers reference `WHERE scope = p_scope` and the column is `text` type — v2 SQL applied cleanly.

**Caller compatibility — 9 callers of `resolve_agent_for_context` still on 7-arg signature (T3a finding).** The v2 8-arg signature accepts existing 7-arg-style calls without change (defaults handle the missing arg). **However** — none of the 9 callers can route at neighbourhood level until they are updated to thread `p_neighbourhood_id`. Logged as T3b-D scope.

**T3b-A pre-flight findings (2026-05-06):**
- Spec's "listings" referenced `mls_listings` (the 491-column MLS-derived table); no separate `listings` table exists.
- `mls_listings` has no `tenant_id` (tenant-agnostic — MLS data shared across tenants).
- `mls_listings` has no `neighbourhood_id` — Event 2 listing distribution can't route at neighbourhood level.

**T3b-B pre-flight findings (2026-05-06):**
- Spec's "areas" referenced `treb_areas` (TREB = Toronto Real Estate Board).
- Geo hierarchy is a **forked tree, not a chain**: area branches into municipality (and via that, community) AND neighbourhood. neighbourhoods have `area_id` (NULLABLE), no `community_id`. Resolver cascade order (P3 neighbourhood → P4 community → P5 muni → P6 area) reflects **priority**, not parent-child links.
- Event 1 distribute_geo_to_children valid pairs: area→municipality, area→neighbourhood (nullable parent), municipality→community. **No community→neighbourhood link.**

**Audit gap for listings cache (T3b-B documented):**
- `lead_ownership_changes.lead_id` is NOT NULL — incompatible with `mls_listings.assigned_agent_id` cache changes (those aren't lead reassignments). V1 ships without audit for listings cache; a future `listing_assignment_changes` table would close this gap. Existing reasons remain valid for actual lead reassignments at the resolver-call level (T3b-D scope).

**Multi-tenant cache contention (T3b-B documented gap):**
- `mls_listings.assigned_agent_id` is a single global column; if multiple tenants both have routing rights at the same community, last-tenant-wins on the cache. V1 ships single-tenant safe (only WALLiam tenant in production). Future: per-tenant cache table keyed by `(listing_id, tenant_id)`.

**Pre-existing constraint (T3b-B finding):**
- UNIQUE INDEX `agent_property_access_agent_id_community_id_key` on `(agent_id, community_id)` — each agent can have at most ONE row per community, regardless of scope. `distribute_geo_to_children` handles via `BEGIN/EXCEPTION WHEN unique_violation` around the INSERT.

**Yellow flag (not blocking):** 4 of 7 agents have NULL `tenant_id`. Doesn't block T2a/T3a/T3b (the production apa rows have agents with tenant_id set + smoke tests pass against WALLiam-scoped data), but auto-distribution at scale must handle agents with no tenant or guarantee tenant assignment as a precondition. Tracked separately.

**T3b-B canonical smoke result (2026-05-06):** Whitby muni had 1 agent (King Shah) at municipality scope and 0 community-scope rows. After `distribute_geo_to_children('municipality', whitby_id, 'community', walliam_id)`, all 11 communities under Whitby got King Shah as primary. This validates the spec's "as-equal-as-possible with random tiebreak" behavior at N=1.

---

## Status log

- **2026-05-05 v1** — Tracker created as artifact (markdown). Captured locked design from past sessions. T0 recon already complete in launch tracker; this artifact starts at T1 (decision lock).

- **2026-05-05 v2** — **T1 CLOSED.** All five open decisions resolved in single session (OD-1 through OD-5). Spec refinements: distribution is two-level (Event 1 parent→child, Event 2 geo→listings), as-equal-as-possible with random tiebreak, percentage mode auto-renormalizes on remove. T2 split into T2a (core) + T2b (percentage). Scope amendment: added scope item 11 (public-facing UI), split T4 into T4a (admin) + T4b (public).

- **2026-05-06 v3** — **T2a CLOSED.** All 4 schema migrations applied + verified PASS in Supabase. Foundation in place for T3 onward. Pattern clarification adopted: Supabase SQL editor only returns the LAST result set when multiple SELECTs are pasted together; verification SELECTs go in SEPARATE blocks.

- **2026-05-06 v4** — **T3a CLOSED.** Both T3a migrations (`20260507_t3_01_resolver_baseline.sql` + `20260507_t3_02_resolvers_v2.sql`) applied; 8/8 smoke PASS. Scope changes: new `p_neighbourhood_id` param at P3 (8-arg signature), removed managed-child auto-substitution, added `tenant_users` modern path at P7, multi-agent geo levels hash-distribute by listing_id. OD-6 added (two-function split over mode-param). `scope text` column verified present on apa as pre-flight. 9 callers still on 7-arg style (back-compat via NULL default); T3b-D will thread neighbourhood through.

- **2026-05-06 v5** — **T3b-A + T3b-B CLOSED.** Two migrations applied to production via Supabase SQL editor; smoke PASS.
  - **T3b-A** (`20260507_t3b_a_01_mls_listings_assigned_agent_id.sql`): `mls_listings.assigned_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL` + partial index. Verify: column type/nullable + FK action + partial index all PASS.
  - **T3b-B** (`20260507_t3b_b_01_distribution_functions.sql`): 4 PL/pgSQL functions (`distribute_geo_to_children` 4-arg, `distribute_listings_at_geo` 3-arg, `reroll_listings_at_geo` 3-arg, `reresolve_listing` 2-arg). Verify: 4 functions with correct pronargs → PASS.
  - **End-to-end smoke against Whitby**: 11 communities had no primaries → `distribute_geo_to_children` created 11 community-scope apa rows (King Shah primary) + 11 audit rows. Matches canonical "10 agents / 11 communities" spec scenario at N=1.
  - **Schema findings recorded**: actual table names (`mls_listings`, `treb_areas`), geo hierarchy as forked tree (not chain), audit gap for listings cache, multi-tenant cache contention, pre-existing UNIQUE INDEX on (agent_id, community_id).
  - **OD-7 added retroactively** (4-arg signature for distribute_geo_to_children — area has two children).
  - **T3b split into 4 atomic phases** (A, B, C, D); A and B closed; C (triggers) and D (caller updates) remain.

---

## Next action

**T3b-C — Triggers on `agent_property_access`.** Wires the T3b-B functions to fire automatically on apa INSERT/UPDATE/DELETE. After T3b-C, the system is autonomous — any routing change cascades through territory updates without manual function calls.

Locked design (no recon needed; everything verified during T3b-A and T3b-B):
- **AFTER INSERT** trigger: fires `distribute_geo_to_children` for valid child scopes (area→muni, area→neighbourhood, muni→community) + `reroll_listings_at_geo` for the changed scope (if ∈ {area, muni, community}; skipped for neighbourhood per mls_listings constraint)
- **AFTER UPDATE** trigger: fires `reroll_listings_at_geo` only on routing-affecting changes (`is_active` flip, `agent_id` change). is_primary toggle is display-only, no listing impact.
- **AFTER DELETE** trigger: fires `reroll_listings_at_geo`
- **Recursion guard:** `pg_trigger_depth() > 1 → RETURN`. Built-in PG mechanism, no session variables. Prevents infinite loop when `distribute_geo_to_children` INSERTs into apa.

T3b-C ships:
- ~3 trigger functions (handle_apa_insert, handle_apa_update, handle_apa_delete)
- 3 trigger declarations (CREATE TRIGGER ... AFTER INSERT/UPDATE/DELETE ON agent_property_access)
- Smoke matrix: insert apa row → verify children's listings re-roll fires; delete row → verify reroll; update is_primary → verify NO reroll fires

After T3b-C closes, only T3b-D (TypeScript caller updates) remains in T3b. Then T4a/T4b/T5 unblock.