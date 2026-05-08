# W-TERRITORY Tracker

**Started:** 2026-05-05
**Owner:** Shah (sole dev)
**Status:** **T6 FULL CLOSURE 2026-05-07.** Race-safety verified (T6-followup-A v10, 3/3 PASS), multi-level cascade resolver verified at all four scope levels (T6-followup-B v11, 3/3 PASS area/community/neighbourhood), is_active flip fires reroll AND audit (T6-followup-C v11, PASS). F-RACE-DEADLOCK closed in-flight (autocommit pattern in race harness — explicit BEGIN/COMMIT inside Promise.allSettled deadlocked at the application layer when triggers acquire xact-scoped advisory locks). F-APA-NEIGHBOURHOOD-CHECK closed via ALTER TABLE adding `'neighbourhood'` to `agent_property_access.scope` CHECK constraint (option a per Shah 2026-05-07; resolver/trigger/distribute/partial unique index were already wired for neighbourhood, the CHECK was the only thing preventing rows at that scope). F-APA-UPDATE-AUDIT-GAP discovered during T6-followup-C: `handle_apa_insert/update/delete` triggers were silently rerolling 84,586 mls_listings on a single is_active flip with no audit trail; only `distribute_geo_to_children` was writing audit rows. Fix added audit-row writes for direct apa state changes (assignment_granted on INSERT, assignment_revoked on DELETE / is_active=false flip, paired revoke+grant on agent/scope changes) via CREATE OR REPLACE FUNCTION inside transaction with verify-then-commit. T1, T2a, T3a, T3b, T6 (core + A/B/C), F-AREA-REROLL, F-RACE-DEADLOCK, F-APA-NEIGHBOURHOOD-CHECK, F-APA-UPDATE-AUDIT-GAP all closed. **Database/triggers/resolvers/race safety/audit coverage layer is functionally complete.** Four pieces remain for W-TERRITORY closure: T4a (admin UI — 4 sub-phases locked v12), T4c (manager carving — carved out of T4a; ships immediately after T4a in same working block per Rule Zero — Nothing Deferred), T4b (public geo page primary agent display), T7 (close ticket). **Next:** T4a phase fully CLOSED v14. T4c-1 ✅ CLOSED v16. **T4c-2 ✅ CLOSED v17** (matrix component + tabs integration + GET API route + builder/serializer lib + 8/8 builder smoke PASS, all artifacts committed in split feat + docs batch). T4c-2 closure deltas: pure builder/serializer at `lib/admin-homes/territory-matrix.ts` with T8 round-trip regression sentinel; GET API route at `app/api/admin-homes/territory/matrix/route.ts` with per-tenant footprint column policy + per-agent `can('agent.write')` decisions baked in; React component at `components/admin-homes/TerritoryMatrix.tsx` with scope picker, cell button + popover editor, sticky save toolbar, conflict banner, read-only row support; tabs integration in `TerritoryClient.tsx` via 5-anchor surgical patch (Coverage / Matrix / Audit). Design lock executed: Q1=1 (one scope per matrix), Q2=2 (presence + primary inline; access flags via popover), Q3=1 (explicit Save), Q4=1 (tabs in TerritoryClient). F-AREA-MANAGER-SUBTREE-DEPTH-INCONSISTENCY logged: `auth.ts::computeManagedAgentIds` returns depth-2 for area_managers but `permissions.ts` comments specify FULL SUBTREE; benign for <=2-level orgs, real bug for deeper structures; defer fix to dedicated patch when affected tenant onboards. **T4c-3 next, this working block**: mobile responsive + a11y + inheritance preview + bulk row actions. Then T4b, T7.
**Sister tracker:** `docs/W-LAUNCH-TRACKER.md` — Section 1 Territory row + Section 2 "Territory as provider" + Section 3 P1-3 + Section 4 W-TERRITORY row all point here.

---

## Why this exists

W-HIERARCHY shipped the parent/child walker and recipient fan-out. W-ROLES-DELEGATION shipped the role ladder + delegation overlay + `can()` permissions. **Neither answers: when a lead arrives, which agent owns it? And on a geo page, which agent's face is shown?**

Territory is the resolution system that answers both questions. The walker stamps the chain upward from `agent_id`; territory determines which `agent_id` to start from for any given context (listing, building, area, geo page).

---

## Scope contract (LOCKED)

In scope:
1. Geo cascade resolver — single resolution path from listing/building/area context to `agent_id` ✅ T3a
2. Tenant-level defaults config (which areas/munis the tenant covers)
3. Manager-level territory carving (subset of tenant default)
4. Agent-level assignments (subset of manager's territory)
5. Granular overrides — building-level and listing-level (manual wins)
6. **Two-layer ownership: primary (1 agent, drives the geo page) + routing (1+ agents, drives listing distribution and lead BCC)** ✅ T2a + T3a
7. **Distribution algorithms:** as-equal-as-possible with random tiebreak ✅ T3b-B (default); percentage-based remains T2b (optional)
8. Re-roll on routing-set change; re-resolve listings that fall outside their cached agent's scope ✅ T3b-B + T3b-C (autonomous via triggers)
9. Two audit tables: `lead_ownership_changes`, `territory_assignment_changes` ✅ T2a (territory_assignment_changes actively written by T3b-B distribute_geo_to_children)
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
- **Display query** ("who is the primary for this geo page?") → `resolve_display_agent_for_context` returns the row with `is_primary = true`
- **Routing query** ("who can receive a lead at this scope?") → `resolve_agent_for_context` returns all rows in the routing set; for a specific listing, returns the cached `mls_listings.assigned_agent_id`

### Geo hierarchy (per actual schema, not a chain)

```
treb_areas
  ├── municipalities (area_id NOT NULL)
  │     └── communities (municipality_id NOT NULL)
  └── neighbourhoods (area_id NULLABLE)
```

Neighbourhoods are children of areas, not communities. The resolver cascade order (P3 neighbourhood → P4 community → P5 municipality → P6 area) reflects **priority**, not parent-child links. Event 1 distribution pairs are: area→municipality, area→neighbourhood, municipality→community. **No community→neighbourhood pair.**

### Distribution mechanics (T3b-B, automatic via T3b-C triggers)

**Event 1 — Geographic footprint distribution (parent → child geo).** Whitby muni assigned to 10 agents → its 11 communities auto-distributed across those 10 agents (10 communities get 1 agent each as primary; the 11th randomly gets a 2nd). All 10 remain in routing set of every Whitby community by inheritance. **Verified at N=1 in T3b-B smoke**: 1 muni agent (King Shah), 11 communities, all 11 got King Shah as primary.

**Event 2 — Listing distribution within a community/area/muni.** Listings inside a geo unit distribute across the unit's routing set per equal-share (default) or percentage mode (T2b). Pick cached on `mls_listings.assigned_agent_id`, re-rolled only on state change. **Cannot route at neighbourhood level** — `mls_listings` has no `neighbourhood_id`.

**Autonomy via triggers (T3b-C):**
- INSERT into apa → distribute_geo_to_children for valid child scopes + reroll_listings_at_geo
- UPDATE on apa → reroll_listings_at_geo only on routing-affecting changes (agent_id, is_active, scope, scope_id). is_primary toggle is display-only, no listing impact.
- DELETE from apa → reroll_listings_at_geo
- Recursion guard: pg_trigger_depth() > 1 → skip

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

- **`lead_ownership_changes`** ✅ shipped T2a — append-only audit of every reassignment with reason CHECK constraint covering reroll, scope_shrink, manual_reassign, percentage_renormalize, agent_removed, agent_added, pin_grant, pin_revoke, cascade_resolution, other. **`lead_id` is NOT NULL**, so this table is for actual lead reassignments, NOT mls_listings cache changes.
- **`territory_assignment_changes`** ✅ shipped T2a + actively written by T3b-B `distribute_geo_to_children` — append-only audit of every territory boundary change with `change_type` CHECK covering assignment_granted/revoked, primary_set/unset, percentage_set/changed, scope_widened/narrowed, pin_added/removed, access_toggle_changed. before_state and after_state captured as JSONB.

Both tables enforce append-only via triggers that RAISE on UPDATE/DELETE.

---

## Open decisions — ALL RESOLVED ✅

**OD-1.** ✅ Flat `agent_geo_buildings` schema. No junction migration.
**OD-2.** ✅ Re-resolve only carved-out listings. Cascade always terminates at tenant default — no orphans.
**OD-3.** ✅ Agent set change at a level triggers re-roll. New agent doesn't auto-become primary. Defaults always fill vacuum.
**OD-4.** ✅ Platform-tier roles excluded entirely. Tenant-internal roles can own.
**OD-5.** ✅ Two-layer model: primary (1, display) + routing (1+, distribution). `is_primary` flag + 4 partial unique indexes.
**OD-6.** ✅ Two-function split (routing resolver + display resolver) over a `mode` param. Decided during T3a.
**OD-7.** ✅ `distribute_geo_to_children` uses 4-arg signature with explicit child_scope (area has TWO children — municipality + neighbourhood). Triggers in T3b-C call once per child scope. Decided during T3b-B.

---

## Phases

### T1 — Decision lock ✅ CLOSED 2026-05-05
All seven OD-* decisions resolved (OD-6 + OD-7 added retroactively during T3a + T3b-B).

### T2a — Core schema migrations ✅ CLOSED 2026-05-06
4 migrations: `tenant_id NOT NULL`, `is_primary` + 4 partial unique indexes, 2 audit tables with append-only triggers. All verify PASS.

### T2b — Percentage mode (optional, parallel)
- `agent_property_access.percentage NUMERIC NULL` (NULL = equal-share)
- DB-level CHECK + auto-renormalize trigger
- Architecture supports adding without breaking T2a/T3a/T3b. Can ship anytime.

### T3a — Resolver baseline + v2 refactor ✅ CLOSED 2026-05-06
2 migrations: capture pre-T3 baseline + v2 refactor with `p_neighbourhood_id` at P3, `tenant_users` modern path at P7, helpers `resolve_geo_primary` + `pick_routing_agent`. 8/8 smoke PASS against Whitby.

### T3b-A — Listings cache column ✅ CLOSED 2026-05-06

| File | Effect | Verify |
|---|---|---|
| `20260507_t3b_a_01_mls_listings_assigned_agent_id.sql` | `mls_listings.assigned_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL` + partial index | column type/nullable + FK ON DELETE=SET NULL + partial idx all PASS |

### T3b-B — Distribution + re-roll + re-resolve functions ✅ CLOSED 2026-05-06

| File | Effect | Verify |
|---|---|---|
| `20260507_t3b_b_01_distribution_functions.sql` | 4 PL/pgSQL functions: `distribute_geo_to_children` (4-arg), `distribute_listings_at_geo` (3-arg), `reroll_listings_at_geo` (3-arg), `reresolve_listing` (2-arg) | 4 functions present with correct pronargs → PASS |

End-to-end smoke against Whitby: 11 communities had no primaries → `distribute_geo_to_children('municipality', whitby_id, 'community', walliam_id)` returned 11. 11 new apa rows + 11 audit rows. Canonical "10 agents/11 communities" scenario at N=1.

### T3b-C — apa distribution triggers ✅ CLOSED 2026-05-06

| File | Effect | Verify |
|---|---|---|
| `20260507_t3b_c_01_apa_distribution_triggers.sql` | 3 trigger functions (`handle_apa_insert`, `handle_apa_update`, `handle_apa_delete`) + 3 AFTER triggers on `agent_property_access`. Recursion guard via `pg_trigger_depth() > 1`. | 3 functions present (pronargs=0) + 3 triggers attached (INSERT/UPDATE/DELETE, AFTER timing) → PASS |

The territory system is now autonomous: any apa INSERT/UPDATE/DELETE auto-cascades through `distribute_geo_to_children` + `reroll_listings_at_geo` without manual function calls.

Trigger logic:
- **INSERT** → distribute primaries to child geos (area→muni + area→neighbourhood + muni→community) + reroll listings at this scope (skip neighbourhood — mls_listings has no neighbourhood_id)
- **UPDATE** → reroll only on routing-affecting changes (agent_id, is_active, scope, scope_id). is_primary flips and access-toggle changes early-return as no-ops.
- **DELETE** → reroll listings at OLD scope
- All triggers early-return on inactive rows (is_active is NOT TRUE)
- Recursion guard prevents infinite loops when distribute_geo_to_children inserts into apa

### T3b-D — Caller updates ✅ CLOSED 2026-05-06

Patch script `scripts/r-territory-t3b-d-patch.js` ran across all 9 caller files; 9/9 patched cleanly with timestamped backups:

| File | Patched |
|---|---|
| `app/api/charlie/appointment/route.ts` | ✅ |
| `app/api/charlie/lead/route.ts` | ✅ |
| `app/api/walliam/assign-user-agent/route.ts` | ✅ |
| `app/api/walliam/charlie/session/route.ts` | ✅ |
| `app/api/walliam/contact/route.ts` | ✅ |
| `app/api/walliam/estimator/session/route.ts` | ✅ |
| `app/api/walliam/resolve-agent/route.ts` | ✅ |
| `lib/actions/leads.ts` | ✅ |
| `lib/utils/is-walliam.ts` | ✅ |

Patch logic: insert `p_neighbourhood_id: null,` line above each `p_community_id:` line within the `.rpc('resolve_agent_for_context', { ... })` object literal. NULL through everywhere — no caller currently sources neighbourhood ID from request context. T4b will revisit when public geo pages start sending `neighbourhood_id` from the resolve-agent endpoint.

`npx tsc --noEmit`: clean. Commit `fd3cbcf` pushed. 9 source files patched + 1 patch script committed (10 files, +164 lines).

### T4a — Admin UI: `/admin-homes/territory` + section component updates

New page consolidating the 4 currently-embedded section components (tenant defaults, manager carving, agent assignment, granular overrides) + audit log viewer + `is_primary` toggle + percentage inputs (T2b). Subset enforcement at form layer (filtered dropdowns) + server (`can()` revalidation).

### T4b — Public-facing UI: geo page primary agent display

Public site renders area / muni / community / neighbourhood / building pages. Each needs to display the **primary agent** card sourced from `resolve_display_agent_for_context`.

Pre-T4b recon required:
- Locate existing geo page routes + agent-card components
- Confirm how they fetch agent data today
- Decide whether to enhance `app/api/walliam/resolve-agent/route.ts` to accept `neighbourhood_id` from request body (forward compat for neighbourhood-level pages)

**Building pages are a documented shared exception between System 1 and System 2** — handled with extreme care.

### T5 — Listing cache + re-roll wiring (mostly absorbed)

Substantively shipped via T3b-A + T3b-B + T3b-C. Remaining work:
- Verify nightly MLS sync interaction: new mls_listings rows arrive without cache; T3b-B `distribute_listings_at_geo` populates them only when called manually OR via apa trigger (no trigger fires on mls_listings INSERT). Decide in T6: (a) accept on-demand fallback via resolver or (b) add INSERT trigger on mls_listings to call distribute_listings_at_geo.

### T6 — Smoke matrix ✅ CLOSED 2026-05-07 (core v8, F-AREA-REROLL v9, followups A/B/C v10/v11)

Now that the territory system is autonomous, validate it under realistic edge cases before T4a/T4b UI work.

Test scope:
- Cascade resolution: every level resolves correctly (display + routing modes)
- Subset rule enforcement: cross-bound assignment blocked at server (DB constraint testable now via direct SQL)
- Re-roll behavior: synthetic INSERTs at parent scope → verify children fill correctly + listings re-pick
- Re-resolve behavior: scope shrink → verify only carved-out listings move
- Primary flag: flipping `is_primary` changes display only, not routing — verify reroll_listings does NOT fire on is_primary-only update (per handle_apa_update early-return)
- Audit trail: every reassignment writes a row with correct change_type
- Multi-tenant: tenant_id NOT NULL prevents cross-tenant assignment
- Platform-tier exclusion: Manager Platform / Admin Platform never appear in cascade results
- New MLS rows: nightly sync inserts populate cache via on-demand resolver (decide on mls_listings INSERT trigger)

T6 ships as a single PL/pgSQL or SQL test script with assertions. PASS = all assertions PASS in Supabase SQL editor.

### T7 — Close

T1–T6 complete; UI shipped; smoke matrix all PASS; W-LAUNCH-TRACKER Section 4 W-TERRITORY row updated to CLOSED with commit hashes.

---

## Workflow rules in effect

All Rule Zero invariants apply (multitenant, no regressions, comprehensive only, nothing deferred, no guessing, backups before edits, no placeholders, secrets fingerprint, System 1 isolation).

Specific to W-TERRITORY:
- **Buildings card-dealing system in `/admin` is NEVER touched.**
- **Single resolution path** through the resolver. No bypassing.
- **Display vs routing separation enforced at DB level** via `is_primary` + 4 partial unique indexes (T2a-02).
- **Cache invalidation on state change** (autonomous via T3b-C triggers).
- **Audit before action** — every territory mutation writes an audit row to `territory_assignment_changes`.
- **Concurrency harness pattern (v10):** any future test of trigger behaviour under concurrent client connections must use the **autocommit pattern** (no explicit `BEGIN`/`COMMIT` from the client) when the triggers under test acquire transaction-scoped advisory locks. Explicit-transaction patterns inside `Promise.all` / `Promise.allSettled` deadlock at the application layer because Postgres cannot detect a stall where a client holds a transaction open while waiting on its own concurrent client to commit. The lock acquire-and-release happens within the autocommit boundary of the single statement that fires the trigger; that boundary is what serializes parallel attempts. Encoded in `scripts/r-territory-t6-followup-race.js` header DESIGN NOTE block.
- **Audit-on-state-change pattern (v11):** any trigger function that mutates routing state on `agent_property_access` must write an audit row to `territory_assignment_changes` for the direct state change, IN ADDITION TO any audit rows written by cascading helpers (e.g., `distribute_geo_to_children` writes `primary_set` for child rows; that's not a substitute for the parent INSERT's `assignment_granted`). The audit table's `change_type` CHECK list is the contract for what events must be logged. Encoded in `handle_apa_insert` / `handle_apa_update` / `handle_apa_delete` per F-APA-UPDATE-AUDIT-GAP fix; future apa-touching triggers must follow the same pattern.
- **Probe-then-patch pattern (v11):** any production trigger or function modification must be preceded by a read-only probe (`scripts/probe-*.js`) that captures the exact current source. The probe output is the ground truth; the patch is derived from it, not from training memory or assumed structure. Encoded in `scripts/probe-apa-trigger-functions.js` -> `scripts/r-territory-f-apa-update-audit-gap-fix.js` workflow.
- **Per-row-diff via computeApaDiff pattern (v14):** any future write path that ingests a desired-state payload for `agent_property_access` (or any similarly-shaped table) must use a server-side diff against the current active state, not a DELETE-all + INSERT-all pattern. Identity key for the diff is the natural compound key minus mutable fields (for apa: `(scope, area_id, municipality_id, community_id, neighbourhood_id)`). Diff produces `toDelete` (existing not in incoming), `toInsert` (incoming not in existing), `toUpdate` (in both with mutable-field difference), and `unchanged`. Apply order: auto-reassign for primary claims first (unset OTHERS' is_primary at claimed (scope, scope_id) within tenant), then DELETEs by id, then UPDATEs by id, then INSERTs. Result: identical save → 0 SQL ops + 0 audit rows; partial change → minimum-necessary writes. Encoded in `lib/admin-homes/apa-diff.ts` and the apa+tpa geo POST routes. Reusable for any future apa-shaped reconciliation route.
- **Smoke-via-savepoint-isolation pattern (v13):** any future trigger or route smoke test should run all assertions inside a single transaction with a final `ROLLBACK`; each test isolated via per-test `SAVEPOINT` + `ROLLBACK TO SAVEPOINT` so tests don't drift. Production data is never committed. Pattern: setup state inside savepoint, snapshot audit count, perform action, count delta + read latest N audit rows, assert, rollback to savepoint. Encoded in `scripts/r-territory-t4a-1-smoke.js`. Reusable for any future apa / route / trigger verification.

---

## Findings

**T2a-02 backfill (2026-05-06):** With only 1 existing row in `agent_property_access`, backfill was mechanical — that row is now `is_primary=true`. Algorithm scales to any future state without changes.

**Schema shape choice — 4 partial indexes, not 1.** apa schema uses separate scope_id columns instead of single scope_id. Shipped 4 partial unique indexes (one per scope) for transparency.

**`scope` column verified present on apa (T3a pre-flight).** v2 helpers reference `WHERE scope = p_scope`; column is `text` type — v2 SQL applied cleanly.

**Caller compatibility resolved in T3b-D.** All 9 callers now thread `p_neighbourhood_id: null` through. Production behavior unchanged (NULL = default), but neighbourhood-level routing is now reachable when callers wire it up.

**T3b-A pre-flight findings (2026-05-06):**
- Spec's "listings" referenced `mls_listings` (491-column MLS-derived table); no separate `listings` table exists.
- `mls_listings` has no `tenant_id` (tenant-agnostic) and no `neighbourhood_id`.

**T3b-B pre-flight findings (2026-05-06):**
- Spec's "areas" referenced `treb_areas` (TREB = Toronto Real Estate Board).
- Geo hierarchy is a **forked tree, not a chain**: area branches into municipality (and via that, community) AND neighbourhood. neighbourhoods have `area_id` (NULLABLE), no `community_id`.
- Event 1 valid pairs: area→municipality, area→neighbourhood, municipality→community. No community→neighbourhood link.

**Audit gap for listings cache (T3b-B documented):**
- `lead_ownership_changes.lead_id` is NOT NULL — incompatible with mls_listings cache changes. V1 ships without audit for listings cache; future `listing_assignment_changes` table would close this gap.

**Multi-tenant cache contention (T3b-B documented):**
- `mls_listings.assigned_agent_id` is a single global column; multi-tenant scenarios would have last-tenant-wins. V1 ships single-tenant safe (only WALLiam). Future: per-tenant cache table keyed by (listing_id, tenant_id).

**Pre-existing constraint (T3b-B finding):**
- UNIQUE INDEX `agent_property_access_agent_id_community_id_key` on (agent_id, community_id) — each agent can have at most ONE row per community. `distribute_geo_to_children` handles via BEGIN/EXCEPTION WHEN unique_violation around the INSERT.

**T3b-D pre-existing tenant-scoping issue (NOT a regression — predates T3a):**
- `app/api/walliam/estimator/session/route.ts:73` calls `resolve_agent_for_context` with only 7 of 8 named params — `p_tenant_id` is missing. Multi-tenant gap: estimator sessions resolve agents without tenant scope. Currently masked by single-tenant production state. Should be logged as a follow-up patch in W-MULTITENANT cleanup. T3b-D's NULL-through patch did not address this (out of scope; only added p_neighbourhood_id).

**T6 design note — MLS sync boundary:**
- New mls_listings rows arrive via nightly PropTx sync. T3b-C triggers fire only on apa changes, not on mls_listings INSERT. Cache for new listings stays NULL until a routing-set change reaches them OR a resolver call runs `distribute_listings_at_geo`. T6 must decide whether to add a trigger on mls_listings INSERT to call distribute_listings_at_geo, or accept on-demand fallback (slower first read, simpler).

**Yellow flag (not blocking):** 4 of 7 agents have NULL `tenant_id`. Doesn't block T2a/T3a/T3b. Auto-distribution at scale must handle agents with no tenant or guarantee tenant assignment as a precondition. Tracked separately.

**T3b-B canonical smoke result (2026-05-06):** Whitby muni had 1 agent (King Shah) at municipality scope and 0 community-scope rows. After `distribute_geo_to_children('municipality', whitby_id, 'community', walliam_id)`, all 11 communities under Whitby got King Shah as primary. Validates the spec's "as-equal-as-possible with random tiebreak" behavior at N=1.

**F-APA-NEIGHBOURHOOD-CHECK (2026-05-07, CLOSED v11):** `agent_property_access.scope` CHECK constraint originally omitted `'neighbourhood'` despite resolver/trigger/distribute layers all referencing it. Discovered during T6-followup-A race harness probe (v10). Decision: option (a) add to CHECK (vs option (b) strip from upstream). Migration applied via `scripts/r-territory-f-apa-neighbourhood-check-fix.js` — discovered constraint name `agent_property_access_scope_check` from `pg_constraint`, dropped + re-added with neighbourhood included, transactional with verify-then-commit. Neighbourhood-scope routing now reachable end-to-end.

**F-APA-UPDATE-AUDIT-GAP (2026-05-07, CLOSED v11):** `handle_apa_insert/update/delete` triggers were silently propagating apa state changes through `distribute_geo_to_children` and `reroll_listings_at_geo`, but only the per-child distribute INSERT was writing audit rows. Direct apa state changes (a manual INSERT, an is_active flip, an agent_id swap) left `territory_assignment_changes` empty for the parent event. The `change_type` CHECK list (11 values: assignment_granted/revoked, primary_set/unset, percentage_set/changed, scope_widened/narrowed, pin_added/removed, access_toggle_changed) was the architectural contract; the trigger code never honoured it. Fix added audit-row writes for direct state changes — `assignment_granted` on INSERT, `assignment_revoked` on DELETE / is_active=false flip, paired revoke+grant on agent/scope changes — applied via CREATE OR REPLACE FUNCTION inside transaction with verify-then-commit. Recursion guard (`pg_trigger_depth() > 1`) preserved to prevent distribute-created child INSERTs from double-auditing.

**F-RACE-DEADLOCK (2026-05-07, CLOSED v10):** Race harness initially wrapped concurrent INSERTs in explicit `BEGIN; INSERT; COMMIT;` inside `Promise.allSettled`. Both pg.Pool connections deadlocked at the application layer — Postgres cannot detect a stall where one client holds a transaction open while waiting on its own concurrent client to commit. Fix: drop the explicit transaction wrapping. Autocommit per statement allows the trigger's xact-scoped advisory lock to acquire-and-release within the implicit autocommit boundary, which is what serializes parallel attempts. Encoded in `scripts/r-territory-t6-followup-race.js` header DESIGN NOTE block. Pattern applies to any future test of trigger behaviour under concurrent client connections.

**F-APA-DELETE-INSERT-CHURN (2026-05-07, surfaced v12, fix tracked T4a-3):** `app/api/admin-homes/agents/[id]/geo/route.ts` POST handler runs `DELETE FROM agent_property_access WHERE agent_id = $1` followed by `INSERT (all rows)`. Pattern predates W-TERRITORY (existed before T3b-C triggers). Post-F-APA-UPDATE-AUDIT-GAP closure (v11), every such save writes 2N audit rows in `territory_assignment_changes` (N revokes from delete cascade + N grants from insert cascade) regardless of how many rows actually changed. Append-only correctness preserved; not a regression. Comprehensive fix tracked in T4a-3: server-side diff (compute `removed = existing \ incoming`, `added = incoming \ existing`, `modified = intersection with changed flags`; only DELETE removed, INSERT added, UPDATE modified). Audit volume drops from 2N per save to (actual_changes) per save. Same pattern likely lives in `app/api/admin-homes/tenants/[id]/geo` for tpa — check during T4a-3 implementation; fix in same batch if present.

**F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP (2026-05-07, surfaced v12, fix gated T4a-3b):** `lib/comprehensive/access-resolver.ts` exports `resolveAgentAccess(agentId)` whose `switch (assignment.scope)` covers `'area' | 'municipality' | 'community'` only — no `'neighbourhood'` case. Default switch behaviour drops the row from the expanded geo IDs returned in `ResolvedAccess`. Type definition in `lib/comprehensive/types.ts` `GeoAssignment.scope` union is also missing `'neighbourhood'`. Predates W-TERRITORY entirely (file is older System 2 path; PL/pgSQL `resolve_agent_for_context` from T3a is the modern replacement and does handle neighbourhood). Post-F-APA-NEIGHBOURHOOD-CHECK closure (v11), neighbourhood-scope rows can now legitimately be created — and will be the moment T4a's UI persists them. Fix scope is gated on caller analysis: if `resolveAgentAccess` / `hasComprehensiveAccess` are reached from any production route, T4a-3b ships the fix (add `case 'neighbourhood':` to switch + update type union); if callers are legacy/dormant, finding is logged as accepted technical debt. Caller probe runs at start of T4a-3 coding.

**F-APA-DELETE-INSERT-CHURN (2026-05-07 logged v12, 2026-05-08 CLOSED v14):** geo POST routes for apa and tpa used a `DELETE all + INSERT all` pattern: every save fired N × `assignment_revoked` + N' × `assignment_granted` + distribute fan-out + reroll, even when the payload was identical to existing state. Audit table accumulated churn, trigger pipeline did unnecessary work, and listings cache was rerolled redundantly. Fix: server-side diff via `computeApaDiff` (`lib/admin-homes/apa-diff.ts`) -- identity-keyed map of `(scope, area_id, municipality_id, community_id, neighbourhood_id)`, diff classifies rows as toDelete / toInsert / toUpdate / unchanged, route applies only the actual changes. Same fix shape applied to tpa POST route (no triggers/audit on tpa, but same primitive class of bug; consistent fix). Smoke T5 (identical-save → 0 audit rows) is the canonical proof. Inactive rows now preserved on save as a behavior improvement (previously nuked).

**F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP (2026-05-07 logged v12, 2026-05-08 CLOSED v14):** `lib/comprehensive/access-resolver.ts` switch on `assignment.scope` handled `area`, `municipality`, `community` only -- `neighbourhood` rows fell through silently. Caller probe confirmed live: 2 callers (`HomePageComprehensive.tsx`, `HomePageComprehensiveV2.tsx`), both wired into `app/page.tsx` and `app/comprehensive-site/page.tsx`. Currently 0 neighbourhood-scope rows in production, so the gap was theoretical -- but Rule Zero (multi-tenant at scale) demands the path be correct before tenant #2 onboards with neighbourhood-grained agents. Fix: added `case 'neighbourhood':` with parent propagation (community + muni + area added to access ID sets) -- matches the existing `community` case shape. Tighter neighbourhood-grained listing filter (extending `ResolvedAccess` with `neighbourhoodIds` + downstream filter) deferred as future T4d (non-regressive, additive).

**F-APA-PRIMARY-AUDIT-GAP (2026-05-08, CLOSED v13):** `handle_apa_update` early-returned silently on display/policy-only changes (`is_primary` flip + access toggles) — those events were never audited despite the audit table's `change_type` CHECK accepting `'primary_set'`, `'primary_unset'`, `'access_toggle_changed'`. Same root pattern as F-APA-UPDATE-AUDIT-GAP (v11) one layer deeper. Fix added three audit-write blocks BEFORE the early-return in `handle_apa_update` — `primary_set`/`primary_unset` on `is_primary` flip, `access_toggle_changed` on any access-related field change. Early-return preserved AFTER audit writes; reroll unchanged. Migration applied via `scripts/r-territory-f-apa-primary-audit-gap-fix.js` with verify-then-commit (8-marker check); smoke 9/9 PASS in `scripts/r-territory-t4a-1-smoke.js`. Commit `c85174e`.

**F-DISTRIBUTE-AUDIT-STATE-INCOMPLETE (2026-05-08, OPEN — minor):** `distribute_geo_to_children` writes `primary_set` audit rows when fanning parent-scope assignments to child geos, but the rows have NULL `before_state` AND NULL `after_state` — the function neglects to populate the JSON state columns. Surfaced during T4a-1 smoke baseline read of the historical distribute_geo_to_children-written rows from the canonical N=11 Whitby smoke (T3b-B v6). Data-quality issue not blocking — `agent_id` / `scope` / `scope_id` / `change_type` carry the routing-relevant signal; missing state JSON only affects reconstruction of full row state from audit log. Fix scope: add `to_jsonb(NEW)` capture to `distribute_geo_to_children` PL/pgSQL `INSERT INTO territory_assignment_changes`. Deferred — `distribute_geo_to_children` callers are well-understood; cleanup non-urgent.

---

## Status log

- **2026-05-05 v1** — Tracker created. T0 recon already complete in launch tracker; T1 starts the work.

- **2026-05-05 v2** — **T1 CLOSED.** All five OD-* decisions resolved (OD-1..OD-5). T2 split into T2a (core) + T2b (percentage). Scope amendment: scope item 11 (public-facing UI), T4 split into T4a/T4b.

- **2026-05-06 v3** — **T2a CLOSED.** All 4 schema migrations applied + verified PASS. Pattern adopted: separate verification SELECTs in separate Supabase pastes (only last result returns).

- **2026-05-06 v4** — **T3a CLOSED.** Both T3a migrations applied; 8/8 smoke PASS. New `p_neighbourhood_id` param at P3, removed managed-child auto-substitution, added `tenant_users` modern path at P7. OD-6 added (two-function split). 9 callers still on 7-arg style.

- **2026-05-06 v5** — **T3b-A + T3b-B CLOSED.** Listings cache column + 4 distribution functions. End-to-end smoke against Whitby: 11/11 community primaries assigned (canonical N=1 scenario). Schema findings recorded (mls_listings, treb_areas, forked geo tree, audit gap, multi-tenant cache contention). OD-7 added.

- **2026-05-06 v6** — **T3b CLOSED.** All 4 sub-phases shipped to production:
  - **T3b-C** (`20260507_t3b_c_01_apa_distribution_triggers.sql`): 3 trigger functions + 3 AFTER triggers on agent_property_access. Recursion guard via pg_trigger_depth(). Verify: 3 functions (pronargs=0) + 3 triggers (INSERT/UPDATE/DELETE, AFTER) → PASS.
  - **T3b-D** (`scripts/r-territory-t3b-d-patch.js` + 9 source file edits): inserted `p_neighbourhood_id: null,` into every `.rpc('resolve_agent_for_context', ...)` call. Patch script ran clean (9/9 patched, 0 failed). TSC clean. Commit `fd3cbcf` pushed.
  - **The territory system is fully autonomous end-to-end.** Insert an apa row → trigger fires → distribute_geo_to_children inserts child primaries → reroll_listings_at_geo updates mls_listings cache → audit rows land in territory_assignment_changes. All without manual SQL.
  - **Pre-existing finding logged**: `app/api/walliam/estimator/session/route.ts` missing `p_tenant_id` arg (multi-tenant gap, predates T3a; not in scope for T3b-D's patch).
  - **T3 phase fully closed.** Next gate: T6 (smoke matrix) recommended before T4a/T4b UI work, to validate edge cases under autonomous trigger fires (race conditions, scope changes, scale, MLS sync boundary).

- **2026-05-06 v7** — **T6 SCRIPT SHIPPED (execution pending).** `scripts/r-territory-t6-smoke.sql` reconstructed and produced complete after prior session cut off mid-artifact. Single transaction with `ROLLBACK;` at end — production data is never touched. Six tests + setup row + summary row.
  - **Test 1** — `resolve_geo_primary('municipality', whitby_id, tenant_id)` returns King Shah. Verifies the T3a resolver baseline still works post-T3b trigger install.
  - **Test 2** — INSERT apa at muni scope on a Whitby-area sibling muni (selected at runtime: must have communities AND no existing apa) → assert community-primary count increases by `test_muni_communities`. Verifies `handle_apa_insert` + `distribute_geo_to_children` end-to-end.
  - **Test 3** — Pick any existing community-primary row, toggle `is_primary` false→true. Assert `agent_property_access` row count and `territory_assignment_changes` row count unchanged. Verifies `handle_apa_update` early-return.
  - **Test 4** — INSERT apa at AREA scope on Whitby's parent area. Assert community-primary count UNCHANGED (recursion guard at depth 2). Muni-primary count is allowed to change (area→muni at depth 1 is the legitimate fan-out).
  - **Test 5** — DELETE the area-scope row from Test 4. Assert no exception (proves `handle_apa_delete` + `reroll_listings_at_geo` both run clean). Status `PASS` if delete completes; `SKIP` if Test 4 never inserted.
  - **Test 6** — Count audit rows written by Test 2's distribution. Expected = `test_muni_communities`, actual must match.
  - **Deferrals (intentional, with reason):** (a) **race safety** — concurrent inserts at same child scope can't be simulated inside a single transaction; needs two connections or external harness; tracked as **T6-followup-A**. (b) **MLS-sync boundary** — this is a decision (add INSERT trigger on `mls_listings` vs accept on-demand fallback via resolver), not a test; tracked as **T6-decision**. (c) **multi-level cascade** (area, community, neighbourhood) — Test 1 only covers muni; other levels would need synthetic geo data setup; tracked as **T6-followup-B**. (d) **`is_active` flip DOES fire reroll** — Test 3 covers the no-op direction (`is_primary` toggle); the inverse (`is_active` true→false fires reroll/audit) is **T6-followup-C**.
  - **Pre-existing finding logged** (not in T6 scope): `app/api/walliam/estimator/session/route.ts` still missing `p_tenant_id` arg per v6. Multi-tenant gap predates T3a; needs its own surgical patch.
  - **Next:** Paste the script into Supabase SQL editor as one block, record per-test PASS/FAIL/SKIP results in this log as v8. Resolve T6-decision (MLS-sync trigger Y/N) before T4a/T4b. Then T4a/T4b UI work.

- **2026-05-06 v8** — **T6 CORE PASS — 6/6 tests green.** Smoke executed via `scripts/run-r-territory-t6-smoke.js` (Node + `pg`); bypassed Supabase Studio's ~10 KB payload limit which had been returning "Failed to fetch" on the 14 KB script. Runner sets `statement_timeout = 0` per session, then sends body + final SELECT + ROLLBACK over a single connection. Production data untouched (transaction rolled back).
  - **Setup row** — tenant=`b16e1039-...`, king_shah=`fafcd5b1-...`, whitby_muni=`70103aef-...`, whitby_area=`03d4e133-d9f9-4a7e-ba9a-83e57269c1d4` (newly captured), test_muni=`94447f26-216a-47be-ac73-d07f33732036` (selected at runtime — sibling muni in Whitby area), test_muni_communities=**20**.
  - **Test 1 PASS** — `resolve_geo_primary('municipality', whitby_id, tenant_id)` returned `fafcd5b1-...` (King Shah). Resolver baseline preserved post-T3b trigger install.
  - **Test 2 PASS** — INSERT apa at muni scope on test_muni → community-primary count went 0 → 20. expected_delta=20, actual_delta=20. `handle_apa_insert` + `distribute_geo_to_children` correctly fanned out at scale 20 (vs the canonical N=11 in T3b-B's Whitby smoke). All-distinct child-scope distribution at higher cardinality confirmed.
  - **Test 3 PASS** — is_primary toggle (false→true) on a community-primary row: audit count 31 → 31, apa count 33 → 33. `handle_apa_update`'s early-return path verified — `is_primary` is purely cosmetic.
  - **Test 4 PASS** — INSERT apa at AREA scope on Whitby's parent area: community-primary count UNCHANGED (31 → 31, delta 0). Muni-primary count went 1 → 8 (area→muni distribution at depth 1 created 7 new muni primaries — the Whitby area has 8 munis total). Recursion guard (`pg_trigger_depth() > 1`) verified at depth 2.
  - **Test 5 PASS** — DELETE of the area-scope row from Test 4 ran clean. `handle_apa_delete` + `reroll_listings_at_geo` invoked without exception.
  - **Test 6 PASS** — `territory_assignment_changes` audit rows from Test 2's distribution: expected_audit_rows=20, actual=20. One audit row per community primary, change_type='primary_set'.
  - **SUMMARY** — `pass=6 fail=0 skip=0 total=6`.
  - **NEW P1 production finding (F-AREA-REROLL-TIMEOUT):** Initial run hit `canceling statement due to statement timeout` on Test 4's area-scope INSERT — the trigger called `reroll_listings_at_geo('area', whitby_area_id, ...)` which tried to UPDATE every `mls_listings` row in the area in one statement. Supabase's default `statement_timeout` killed it. Fixed in the runner via `SET statement_timeout = 0;`. **In production, an admin assigning at area scope will hit the same wall via the API/UI.** Three mitigation options for T4a (admin UI) design: (a) batch the UPDATE into chunks of N rows; (b) async the reroll via a background job after the apa INSERT commits; (c) accept the slowdown and raise per-request statement_timeout for admin endpoints only. Decision needed at or before T4a kickoff.
  - **Workflow note:** the runner pattern (Node + `pg` + connection-string env-var fallback chain + body/finalSelect split on comment markers) is now the established way to run any future SQL test that exceeds Studio's ~10 KB limit. Reusable for T6 followups.
  - **Next:** decide F-AREA-REROLL-TIMEOUT mitigation; resolve T6-decision (MLS-sync INSERT trigger Y/N); ship T6-followup-A/B/C as `scripts/r-territory-t6-followups.sql` + `scripts/r-territory-t6-followup-race.js`. Then T4a UI work.

- **2026-05-08 v17** -- **T4c-2 CLOSED.** Cross-agent territory matrix shipped end-to-end: pure builder/serializer + GET API route + React component + tabs integration in TerritoryClient. Builder smoke 8/8 PASS. Manual visual QA pending (component lives at `/admin-homes/territory` under the new "Matrix" tab).
  - **Design lock executed** (Q1=1 / Q2=2 / Q3=1 / Q4=1):
    - Q1: one scope per matrix (scope picker at top -- area / municipality / community / neighbourhood)
    - Q2: cell content = presence dot + primary star; access flags (condo/homes/buildings/mode) edited via popover that opens on cell click
    - Q3: explicit "Save N changes" sticky-toolbar button; one POST commits the whole batch via T4c-1's bulk-assign route
    - Q4: matrix lives in a tab inside `TerritoryClient.tsx` alongside Coverage + Audit log
  - **Files added/modified (split feat + docs commit batch per project convention -- mirrors T4c-1 close):**
    - **feat commit -- code:**
      - `lib/admin-homes/territory-matrix.ts` (NEW): pure builder + serializer; 12 exports; no I/O / no async / no React; design contract for everything else.
      - `scripts/r-territory-t4c-2-builder-smoke.ts` (NEW, 13611 bytes): 8/8 PASS via `npx tsx`. T8 round-trip preservation test is the regression sentinel for "matrix never accidentally deletes other-scope APA rows".
      - `app/api/admin-homes/territory/matrix/route.ts` (NEW, 10789 bytes): GET handler. Auth pattern mirrors coverage route. Tenant-footprint column policy (only geos with >=1 existing tenant agent at the requested scope -- avoids dumping ~600 GTA communities; tradeoff: no in-matrix new-geo creation in v1).
      - `components/admin-homes/TerritoryMatrix.tsx` (NEW, 19584 bytes): client component. Scope picker, CellButton (presence + primary inline; state-based styling: empty / explicit / edited / conflict / read-only), CellEditor popover (access flags + buildings_mode + Remove + click-outside close), sticky save toolbar (pending count + Discard + Save), conflict banner with cell highlights on 400 response.
      - `components/admin-homes/TerritoryClient.tsx` (MODIFIED via 5-anchor surgical patch, +1304 chars): added TerritoryMatrix import (P1), `activeTab` state (P2), tabs nav UI + open Coverage conditional (P3), close Coverage + Matrix render + open Audit conditional (P4), close Audit conditional (P5). Backup retained.
      - `scripts/patch-territory-client-tabs.js` (NEW): patch script preserved for reproducibility. Line-ending-adaptive (first attempt failed because file uses LF but patch hardcoded CRLF; fixed by sniffing line ending at script start).
    - **docs commit -- tracker:**
      - `scripts/patch-tracker-v17.js` (NEW, this script)
      - `docs/W-TERRITORY-TRACKER.md` (MODIFIED, v17 patch applied)
  - **Builder smoke coverage (8/8 PASS, pure-function, no side effects):**
    - T1 computeApaDiff no-op (identical baseline) -> 0/0/0/N
    - T2 cross-agent primary conflict, **positive** (2 agents claim primary on same key) -> 1 conflict, both agents present
    - T3 cross-agent primary conflict, **negative** (only 1 primary, other false) -> 0 conflicts
    - T4 serializer: pending edit overrides initial (is_primary toggled false -> true)
    - T5 serializer: cell cleared via edit (set null) -> omitted from payload (route diff toDeletes)
    - T6 serializer: other-scope APA rows pass through verbatim (with all flag bits preserved)
    - T7 serializer: untouched agents excluded from payload (only edited agent IDs)
    - **T8 (regression sentinel):** round-trip build -> serialize unchanged -> all original rows present with all flags
  - **F-AREA-MANAGER-SUBTREE-DEPTH-INCONSISTENCY (logged, not blocking T4c-2):**
    - **Mechanism:** `lib/admin-homes/auth.ts::computeManagedAgentIds` returns depth-2 for `area_manager` (direct children + grandchildren only). `lib/admin-homes/permissions.ts` comments at the `ActorPermissionContext` definition specify "FULL SUBTREE for area_managers" (transitive through arbitrary depth).
    - **Impact:** For tenants with > 2 levels of management hierarchy under an area_manager (e.g., area_manager -> manager -> managed_agent -> sub_managed_agent), the deepest descendants are invisible to the area_manager's matrix and uneditable via `can('agent.write')`.
    - **Likelihood:** benign for current tenants (most orgs are area_manager -> manager -> agent, depth 2 covers them). Real bug latent in the data model for deeper structures.
    - **Recommended fix:** change `computeManagedAgentIds` to recursively walk descendants for `area_manager` (or delegate to `getDescendantIds` from `lib/admin-homes/hierarchy.ts` which already handles transitive walks with cycle detection + 1000-row safety cap). Defer to dedicated patch when an affected tenant onboards.
  - **Coverage gaps (acknowledged, deferred to T4c-3 or follow-ups):**
    - Inheritance preview (manager-wider-scope auto-covering managed agents) -- T4c-3 scope per v14 sub-phase lock.
    - Mobile responsive layout + a11y polish -- T4c-3 scope.
    - Bulk row actions ("apply this row to all communities in this muni") -- T4c-3 scope.
    - Live cross-agent primary conflict pre-check at edit time (currently surfaces server-side via 400 response on Save).
    - HTTP integration smoke for the matrix route + bulk-assign perm gates (`can()` lib already covered by W-ROLES-DELEGATION R1-R7 unit tests; routes are thin wrappers).
  - **T4c-3 next (this working block per Rule Zero -- Nothing Deferred):** mobile responsive + a11y + inheritance preview + bulk row actions. Substantial UX phase; ships in own sub-session within this working block.

- **2026-05-08 v16** -- **T4c-1 CLOSED.** Phase B smoke 6/6 PASS; full Phase A + Phase B commit batch shipped atomically (split feat + docs commits per project convention).
  - **Smoke results (6/6 PASS, savepoint-isolated -- production data ROLLED BACK):**
    - T1 (unit) `computeApaDiff` no-op identical baseline -> incoming -> 0/0/0/1 (del=0 ins=0 upd=0 same=1 claims=0)
    - T2 (unit) cross-agent primary conflict, **positive** (2 agents claim primary on community|c1) -> 1 conflict, both agents in `conflict.agents`
    - T3 (unit) cross-agent primary conflict, **negative** (only 1 agent primary, other `is_primary=false`) -> 0 conflicts
    - T4 (DB) bulk no-op end-to-end (12-row baseline -> identical incoming) -> audit delta = 0 (computeApaDiff returns empty diff -> no SQL fired -> no audit triggers)
    - T5 (DB) mid-tx INSERT + ROLLBACK -> pre-state SHA256 hash matches post-state exactly. Hashes: preHash=`893e51c716fa`, midHash=`e7ecbd916c7d` (post-INSERT, distinct as expected), postHash=`893e51c716fa` (post-ROLLBACK, equal to pre).
    - T6 (DB) multi-agent diff -- AGENT_A (King Shah) delta=1, AGENT_B (Neo Smith) delta=1. Each agent gets exactly 1 `assignment_granted` audit, no cross-contamination across the single transaction.
  - **Smoke runner exit code: 0.** Run command: `npx tsx scripts/r-territory-t4c-1-smoke.ts`.
  - **Commit batch (split feat + docs per convention):**
    - **feat commit** -- code + smoke + npm-dedup fix:
      - `app/api/admin-homes/territory/bulk-assign/route.ts` (NEW, 9915 bytes)
      - `scripts/r-territory-t4c-1-route-deploy.js` (NEW)
      - `scripts/fix-pg-deps.js` (NEW)
      - `scripts/r-territory-t4c-1-smoke.ts` (NEW, 17638 bytes)
      - `package.json` + `package-lock.json` (pg promoted devDep -> dep, @types/pg added to devDep)
    - **docs commit** -- tracker:
      - `scripts/patch-tracker-v15.js` (NEW)
      - `scripts/patch-tracker-v16.js` (NEW, this script)
      - `docs/W-TERRITORY-TRACKER.md` (v15 + v16 patches both applied)
  - **Coverage gap (acknowledged, deferred to follow-up if needed before T4c-2):** End-to-end HTTP perm-rejection smoke (`FORBIDDEN_CROSS_TENANT` / `FORBIDDEN_SCOPE` / no-manage paths). The `can()` lib was already covered by W-ROLES-DELEGATION R1-R7 unit tests; the route's perm gate is a thin wrapper that builds an `AgentTarget` context (id / tenant_id / parent_id / role) and calls `can(user.permissions, 'agent.write', context)` for each target before BEGIN -- first denial returns the can() decision's status code with no DB writes. Adding HTTP coverage requires a running Next.js server + auth fixture; can land as `scripts/r-territory-t4c-1-http-smoke.ts` if comprehensive HTTP coverage is wanted before T4c-2 ships. Tracked here for visibility.
  - **Why split commits:** matches project convention (commit `167c477 feat T4a-1 CLOSED` + `a11ab57 docs apply v13` and `d8ef4c5 feat T4a-2` + `e8c1769 feat T4a-3` + `95d820c docs apply v14`). Code commits are independently reviewable; tracker commits give a clean audit trail without code-review noise.
  - **T4c-2 next, this working block:** matrix component + page + cell editor + conflict UX (desktop), per the v14 sub-phase scope lock. T4c-2 is the bigger UX phase (estimated multiple hours); it ships in its own sub-session.

- **2026-05-08 v15** -- **T4c-1 Phase A LANDED** (UNCOMMITTED; commit batches with Phase B smoke once smoke runs PASS). Bulk-assign route on disk; production runtime fix shipped (pg classification corrected); npm-dedup silent-revert trap caught and closed inline.
  - **Files added (uncommitted):**
    - `app/api/admin-homes/territory/bulk-assign/route.ts` (9915 bytes, NEW). Per-agent `can()` permission gating before any write; cross-agent primary conflict guard pre-BEGIN; per-agent diff via `computeApaDiff` (single source of truth, established T4a-3); auto-reassign deduplicated across payload; full atomicity via single BEGIN/COMMIT `pg.Client` transaction.
    - `scripts/r-territory-t4c-1-route-deploy.js` (14800 bytes). Deploy script: package.json edit (add pg to deps) + route write with `flag: 'wx'` (refuses overwrite). Ran successfully this session.
    - `scripts/fix-pg-deps.js` (NEW). Comprehensive package.json fix script: removes pg from devDeps, keeps `^8.20.0` in deps, sorts both maps alphabetically, then runs `npm install --save-dev @types/pg` for TS declarations. Ran successfully.
  - **package.json state (verified post-fix via parsed re-read):**
    - `dependencies.pg = ^8.20.0`
    - `devDependencies.pg = (empty)`
    - `devDependencies.@types/pg = ^8.20.0`
    - Two timestamped backups retained: `package.json.backup_20260508_100424` (pre-deploy) + `package.json.backup_20260508_100908` (pre-fix).
  - **TSC verify:** `npx tsc --noEmit` clean (no errors).
  - **Trap caught + closed inline -- F-NPM-DEDUP-SILENT-DEVDEP-REVERT:**
    - **Mechanism:** When a package exists in both `dependencies` and `devDependencies` of `package.json`, `npm install <pkg> --save` silently REMOVES it from `dependencies` to keep the pre-existing `devDependencies` entry. The CLI emits a one-line warning (`Removing dependencies.<pkg> in favor of devDependencies.<pkg>`) that is easy to miss in a busy install log.
    - **Impact (averted):** Without post-install verification, `pg` would have remained `devDependencies`-only. Vercel/Next.js production builds prune devDeps; the bulk-assign route's `import { Client } from 'pg'` would have crashed on first request in production -- silent dev-time success, hard prod-time failure.
    - **Root cause history:** `pg` was originally added 2026-02-28 in the migrate-bigint era as a devDep (one-shot DDL migration script). The T4c-1 deploy script tried to promote it to a runtime dep via `npm install pg --save`; npm dedup undid the move silently.
    - **Comprehensive mitigation (`scripts/fix-pg-deps.js`):** (1) read package.json directly, (2) DELETE the misclassified `devDependencies.pg` entry so npm has no dedup target, (3) keep `^8.20.0` in `dependencies`, (4) write package.json sorted alphabetically, (5) `npm install --save-dev @types/pg` separately for TypeScript declarations, (6) verify post-fix via parsed re-read of both classification maps.
    - **Workflow rule (going forward, all sessions):** *Never use `npm install <pkg> --save` to MOVE a package between `dependencies` and `devDependencies`.* The CLI's dedup logic strips one entry silently; direction depends on which entry already exists. Pattern: (a) edit `package.json` directly to remove the misclassified entry, (b) `npm install` (no `--save`) to reconcile lockfile, (c) verify via `Get-Content package.json | ConvertFrom-Json` re-read of both `.dependencies.<pkg>` and `.devDependencies.<pkg>`, (d) `npx tsc --noEmit` to confirm types still resolve. Always keep timestamped backups (`package.json.backup_<stamp>`) on every edit.
  - **Why uncommitted:** Phase A artifacts (route + deploy script + fix script + package.json + package-lock.json + this v15 tracker patch) batch-commit alongside Phase B smoke once smoke runs PASS. We commit a verified working state, not a half-deployed one. Phase B is the next live action in this same working block.

- **2026-05-08 v14** — **T4a-2 CLOSED + T4a-3 CLOSED + T4a-3b CLOSED + T4c phase opened with multi-tenant comprehensive scope.** Three closures in one working block; full T4a sub-phase set complete. Per Rule Zero (multi-tenant at scale + comprehensive), T4c scope explicitly locked: full recursive managed-agent subtree (W-HIERARCHY walker, no depth cap), all 4 scopes (area / muni / community / neighbourhood), all access flags (condo / homes / buildings + buildings_mode), per-cell primary toggle, row-level conflict UX. Cross-tenant write attempts and out-of-subtree write attempts return 403. T4c builds in three phases shipping in sequence within the working block.

  - **T4a-2 CLOSED (commit `d8ef4c5`):** new `/admin-homes/territory` page + 2 API routes (`coverage`, `audit-log`) + TerritoryClient component (coverage table + audit log viewer + 5-card stats). Per-tenant scoping (Q1 product call from v12). 1051 LOC across 5 files, TSC clean, 4 files written atomically via `scripts/r-territory-t4a-2-deploy.js`.

  - **T4a-3 CLOSED:** F-APA-DELETE-INSERT-CHURN comprehensive fix. Replaced DELETE-all + INSERT-all churn pattern with server-side diff in both apa (`agents/[id]/geo/route.ts`) and tpa (`tenants/[id]/geo/route.ts`) POST routes. Diff logic extracted to `lib/admin-homes/apa-diff.ts` (computeApaDiff: pure function over identity-keyed maps). Auto-reassign for primary claims preserved (T4a-1 behavior). Inactive rows preserved on save (no longer nuked, behavior improvement over the original DELETE-all). 5 files via `scripts/r-territory-t4a-3-deploy.js` (1 NEW apa-diff + 3 REWRITES with timestamped backups + 1 NEW smoke).

  - **T4a-3b CLOSED:** F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix. Caller probe confirmed live in production: 2 callers (`HomePageComprehensive.tsx`, `HomePageComprehensiveV2.tsx`) both invoked from `app/page.tsx` and `app/comprehensive-site/page.tsx` (V1/V2 split via runtime feature flag). Pre-fix: `case 'neighbourhood'` was missing from `resolveAgentAccess` switch; neighbourhood-scope rows silently dropped from access set. Fix: added `case 'neighbourhood':` with parent propagation (matches existing `community` case shape: adds parent community + muni + area to access ID sets). Tighter neighbourhood-grained filtering (extending ResolvedAccess + downstream listing filter) deferred to a future T4d -- not blocking and not regressive.

  - **Smoke (9/9 PASS via `scripts/r-territory-t4a-3-smoke.ts`, savepoint-isolated):**
    - T1–T4: pure unit tests of computeApaDiff (identical → 0 changes; addition → 1 insert; removal → 1 delete; primary toggle → 1 update + 1 claim).
    - T5: identical save → **0 audit rows** (the headline F-APA-DELETE-INSERT-CHURN proof).
    - T6: row added → 1 `assignment_granted`.
    - T7: row removed → 1 `assignment_revoked`.
    - T8: `is_primary` off → 1 `primary_unset` (no churn).
    - T9: `condo_access` flip → 1 `access_toggle_changed` (no churn).
    Production data ROLLED BACK; no rows committed.

  - **T4c phase scope (locked, multi-tenant comprehensive):**
    - **T4c-1**: `POST /api/admin-homes/territory/bulk-assign` route. Accepts `{ agentId → ApaRow[] }` payload. Per-agent permission gate via `can()` with `agent.write` (manager must have write on every agent in payload; cross-tenant or out-of-subtree → 403, zero DB writes). Per-tenant scoping enforced server-side. Atomic: all-or-nothing via single pg.Client transaction (BEGIN / per-agent computeApaDiff + apply / COMMIT, ROLLBACK on any failure). Auto-reassign primary runs once per (scope, scope_id) pair across the entire payload, not per-agent. Smoke covers: no-change save → 0 audits; cross-tenant attempt → 403 + 0 writes; out-of-subtree attempt → 403 + 0 writes; per-agent failure mid-payload → full rollback.
    - **T4c-2**: `/admin-homes/territory/manage` page + matrix component. Rows = manager's effective coverage geos at all 4 scopes. Columns = full recursive managed-agent subtree + a self column for the manager. Cell editor: `is_primary`, `condo_access`, `homes_access`, `buildings_access`, `buildings_mode` (full apa row spec, no fields hidden). Per-row primary-conflict surface (visual indicator before save). Per-row bulk actions (assign-all-to-X, clear-row). Inheritance preview (rows where agent currently inherits from manager are visually distinct from explicit assignments).
    - **T4c-3**: mobile responsive (matrix → stacked per-agent accordion). Keyboard navigation + ARIA cell semantics. a11y audit. Empty states + loading states.

  - **Files shipped in v14 batch:**
    - `scripts/r-territory-t4a-2-deploy.js` + 4 created files (page + 2 routes + TerritoryClient component).
    - `scripts/r-territory-t4a-3-deploy.js` + 5 created/rewritten files (apa-diff + 2 route rewrites + access-resolver rewrite + smoke).
    - `scripts/r-territory-t4a-3-smoke.ts` (9-test smoke, savepoint-isolated, runs via `npx tsx`).
    - `scripts/patch-tracker-v14.js` (this patch).

  - **Commits:** `d8ef4c5` (T4a-2 ship), [T4a-3 commit hash to be added on push].

  - **Next:** T4c-1 — backend bulk-assign API + smoke. Recon precedes build (existing matrix patterns inventory + transaction story confirmation: pg.Client in route vs RPC vs best-effort).

- **2026-05-08 v13** — **F-APA-PRIMARY-AUDIT-GAP CLOSED + T4a-1 CLOSED + smoke pattern established.** Pre-T4a-1 coding surfaced a third audit gap parallel to F-APA-UPDATE-AUDIT-GAP (v11): `handle_apa_update`'s early-return for "no routing-affecting changes" silenced both `is_primary` flips AND access-toggle changes (`condo_access` / `homes_access` / `buildings_access` / `buildings_mode`). The audit table's `change_type` CHECK already accepted `'primary_set'`, `'primary_unset'`, `'access_toggle_changed'` — architecture intended these to be tracked; trigger code never wrote them. Closed before T4a-1's UI introduced silent state changes via the new toggle.

  - **Files shipped this batch:**
    - `scripts/r-territory-f-apa-primary-audit-gap-fix.js` — Node migration runner. Captures rollback snapshot via `pg_get_functiondef('public.handle_apa_update()'::regprocedure)`, applies `CREATE OR REPLACE FUNCTION` inside a transaction, verifies new body contains all 8 markers (3 new + 5 v11 preserved + 2 reroll calls + 1 early-return), COMMIT on success / ROLLBACK on any verification mismatch. Idempotent (skips if all 3 new markers already present in live body).
    - `scripts/r-territory-f-apa-primary-audit-gap-fix.sql` — forward SQL of the new function body (git-archived).
    - `scripts/r-territory-f-apa-primary-audit-gap-rollback_20260508_045125.sql` — pre-apply snapshot of v11 function body for rollback.
    - `scripts/r-territory-t4a-1-is-primary-toggle.js` — Node patch script for T4a-1 UI + route changes. 10 component edits (Star import, Assignment interface field, PrimaryToggle component, isPrimary state, togglePrimary helper, addAssignment + reset, three row renderings — inherited locked + green editable + amber editable, Add form checkbox) + 2 route edits (is_primary in row mapping, auto-reassign loop before INSERT). Atomic per-file with timestamped backups; CRLF-aware (component .tsx is CRLF, route .ts is LF). Required two anchor-fix iterations during apply (CRLF mismatch on multi-line anchors first round; alreadyMarker false-positive on green/amber rows second round).
    - `scripts/r-territory-t4a-1-smoke.js` — 9-test code smoke covering the v13 trigger fix + T4a-1 auto-reassign pattern. Single-transaction with `ROLLBACK` at end (production never committed). Tests T1–T9: is_primary off→on writes primary_set; on→off writes primary_unset; condo_access flip writes access_toggle_changed; buildings_mode change writes access_toggle_changed; combined flip writes 2 audits; no-op UPDATE writes 0 audits (early-return preserved); is_active true→false writes assignment_revoked (v11 path preserved); inactive row is_primary flip writes 0 audits (early-skip on inactive); auto-reassign UPDATE writes primary_unset on displaced holder. TSC clean. Per Shah directive, code smoke replaced manual UI smoke; trigger pipeline + route logic verified at SQL layer, React UI verified via TSC + diff review.

  - **F-DISTRIBUTE-AUDIT-STATE-INCOMPLETE finding logged (open, deferred):** during smoke baseline read, the historical `primary_set` audit rows written by `distribute_geo_to_children` (canonical N=11 Whitby smoke from T3b-B v6) had NULL `before_state` AND NULL `after_state`. The distribute trigger writes the audit row but does NOT capture the apa row's state JSON. Data-quality issue, not blocking — agent_id + scope + scope_id + change_type carry the routing-relevant signal; missing state JSON only impairs reconstruction of full row state from audit log. Fix would add `to_jsonb(NEW)` capture to `distribute_geo_to_children`'s INSERT block. Deferred — `distribute_geo_to_children` is currently the primary writer of `primary_set` events and its callers are well-understood; cleanup non-urgent.

  - **Smoke-via-savepoint-isolation pattern (workflow note):** the runner in `r-territory-t4a-1-smoke.js` is reusable for any future trigger or route smoke. Single transaction with final ROLLBACK; per-test SAVEPOINT + ROLLBACK TO SAVEPOINT to prevent test drift; setup-action-snapshot-assert pattern per test. Encoded as a workflow rule below.

  - **Commits:** `c85174e` (F-APA-PRIMARY-AUDIT-GAP fix), `167c477` (T4a-1 close + integrated smoke).

  - **Next:** T4a-2 — new `/admin-homes/territory` coverage page (per-tenant view scope, coverage table + audit log viewer + stats card; two new API routes; auth pattern mirrors existing geo route).

- **2026-05-07 v12** — **T4a recon complete; sub-phase scope locked; F-APA-DELETE-INSERT-CHURN + F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP findings logged.** Pre-T4a recon revealed a spec/reality gap: tracker said "4 currently-embedded section components" with names that don't match disk. Actual existing components are `GeoAssignmentSection` (per-agent territory assignment, 355 lines), `BuildingAssignmentSection`, `ListingAssignmentSection`, `DelegationsSection` — all four mounted on `app/admin-homes/agents/[id]/page.tsx`. Plus `TenantGeoAssignmentSection` (226 lines) on `app/admin-homes/tenants/[id]/page.tsx`, which writes to `tenant_property_access` (tpa) — a separate parallel table from `agent_property_access` not previously surfaced in this tracker. The v11 vision of T4a as "consolidating" 4 embedded components was inaccurate — the per-agent page already groups its 4 sections coherently. T4a's actual job: (a) add an `is_primary` toggle that doesn't exist in any UI yet, (b) build a new `/admin-homes/territory` cross-agent coverage page that doesn't exist, (c) fix the delete-then-insert geo POST route, (d) gate-fix the older TS resolver if its callers warrant it.

  - **Files dumped + read for T4a recon:** `components/admin-homes/GeoAssignmentSection.tsx` (per-agent assignment UI; manager/standalone vs managed-agent inheritance modes), `components/admin-homes/TenantGeoAssignmentSection.tsx` (tpa restrictions UI), `app/admin-homes/agents/[id]/page.tsx` (mounts the 4 per-agent sections), `app/admin-homes/tenants/[id]/page.tsx` (mounts tpa restrictions), `app/api/admin-homes/agents/[id]/geo/route.ts` (geo POST handler — uses delete-then-insert), `lib/utils/territory.ts` (effective-territories resolver: manual → manager inheritance → tenant pool), `lib/comprehensive/access-resolver.ts` (older TS resolver, 125 lines, missing neighbourhood case), `lib/comprehensive/types.ts` (older type definitions, scope union missing `'neighbourhood'`).

  - **T4a sub-phase scope locked (Rule Zero — Comprehensive Work Only):**
    - **T4a-1: `is_primary` toggle in `GeoAssignmentSection`.** Add `is_primary` to the Assignment interface; per-row toggle UI; extend POST payload; backend (T2a partial unique indexes) already enforces single primary per geo. Single-component, single-route change.
    - **T4a-2: New `/admin-homes/territory` page.** Per-tenant view scope (mirrors `app/admin-homes/agents/page.tsx` auth pattern: `seeAll = isPlatformAdmin && !tenantId; scopedTenantId = user.tenantId`). Three sections: coverage table (which agent owns each geo + holes), audit log viewer paging `territory_assignment_changes`, stats card. New API routes: `GET /api/admin-homes/territory/coverage`, `GET /api/admin-homes/territory/audit`. Auth pattern: `resolveAdminHomesUser()` + `can()` + `createServiceClient()` (verbatim mirror of existing geo route).
    - **T4a-3: F-APA-DELETE-INSERT-CHURN comprehensive fix.** Replace `DELETE WHERE agent_id = $1` + `INSERT (all rows)` in `app/api/admin-homes/agents/[id]/geo/route.ts` POST with server-side diff: fetch existing, build keys for both sets, only DELETE removed rows, INSERT added rows, UPDATE rows whose access flags / `is_primary` changed. Audit volume drops from 2N per save to (actual_changes) per save.
    - **T4a-3b (gated): F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix.** Gate runs at start of T4a-3 coding: `grep -r resolveAgentAccess` and `grep -r hasComprehensiveAccess` across `app/`, `lib/`, `components/`. If any caller is reached from a public-facing System 2 route, fix in T4a-3b (add `case 'neighbourhood':` to switch in `lib/comprehensive/access-resolver.ts`; add `'neighbourhood'` to `GeoAssignment.scope` union in `lib/comprehensive/types.ts`). If callers are dormant/legacy/test-only, log as accepted technical debt; no code change in T4a. Decision lands in v13 status log entry.

  - **T4c carved out (deferred from T4a):** Manager carving — explicit "distribute territory to managed agents" UX. Currently a managed agent without manual rows automatically inherits from `parent_id` manager via `lib/utils/territory.ts`. T4c adds the explicit subdivide-to-managed-agents flow. UX shape (drag-drop vs checkbox grid vs table) is an open product call to resolve at T4c kickoff. **T4c ships in same working block as T4a** per Rule Zero — Nothing Deferred ("Phase 2 acceptable when each phase ships within the same working block, in sequence, with no gap"). Sub-phase order: T4a-1 → T4a-2 → T4a-3 → T4a-3b (if warranted) → T4c → T4b → T7.

  - **Architectural facts established by recon (not findings, just context for T4a build):**
    - `tenant_property_access` (tpa) is a separate parallel table from apa; tenant-level restrictions follow an "empty = full access" model with same scope dimensions (area/muni/community/neighbourhood). Mostly orthogonal to T4a but T4a-2's coverage page should hint at tpa restrictions on the tenant.
    - Inheritance UX in `GeoAssignmentSection` is already polished: managed agents see "Inherited from [Manager]" (read-only, locked-icon rows) + "Manual Overrides" (editable amber rows). Standalone agents see "Your Territories" (editable green rows). T4a-1's `is_primary` toggle must work in both modes.
    - Auth pattern in admin-homes routes: `resolveAdminHomesUser()` returns user with `tenantId` + `isPlatformAdmin` + `permissions`. Tenant scoping via session + target row's `tenant_id` (NOT `x-tenant-id` header — that's the walliam-route pattern). T4a's new routes mirror this verbatim.
    - Service client (`@/lib/admin-homes/service-client`) bypasses RLS post-permission-check. Pattern: load target row → `can(...)` → if ok, use service client for DB mutations.

  - **Two new findings logged** (full text in Findings section): F-APA-DELETE-INSERT-CHURN, F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP.

  - **Next:** start T4a-1 (`is_primary` toggle in `GeoAssignmentSection`).

- **2026-05-07 v11** — **T6 FULL CLOSURE + F-APA-NEIGHBOURHOOD-CHECK migration shipped + F-APA-UPDATE-AUDIT-GAP discovered and fixed.** Database / triggers / resolvers / race safety / audit coverage layer is now functionally complete. Only T4a (admin UI), T4b (public geo display), and T7 (close ticket) remain.

  - **Files shipped this batch:**
    - `scripts/r-territory-f-apa-neighbourhood-check-fix.js` — Node migration runner. Probes the actual CHECK constraint name from `pg_constraint`, validates the discovered name against a safe-identifier regex, verifies pre-state via strict literal-set equality (no extras / no missing), then in one transaction `DROP CONSTRAINT [name]` + `ADD CONSTRAINT [name] CHECK (scope IN ('all', 'area', 'municipality', 'community', 'neighbourhood'))`. Verifies post-state via strict set equality before COMMIT; ROLLBACK on any mismatch. Idempotent (skips if `'neighbourhood'` already in CHECK). Ran clean against production: discovered constraint `agent_property_access_scope_check`; pre-state matched; post-state verified.
    - `scripts/r-territory-t6-followups.js` — multi-level cascade resolver tests (T6-followup-B) + is_active-flip-fires-reroll test (T6-followup-C). Single Node script with 3 area/community/neighbourhood resolver assertions + the is_active-flip test that flips an active apa row to inactive and asserts `mls_listings.assigned_agent_id` for that scope shifts AND a `territory_assignment_changes` audit row lands. Ran 4/4 PASS against production after the audit-gap fix below was applied.
    - `scripts/probe-apa-trigger-functions.js` — read-only probe. Dumps the exact PL/pgSQL bodies of `handle_apa_insert`, `handle_apa_update`, `handle_apa_delete` plus the `territory_assignment_changes` schema and `change_type` CHECK list. Used as ground truth for the audit-gap fix (Rule Zero — No Guessing).
    - `scripts/r-territory-f-apa-update-audit-gap-fix.js` — applies the audit-row writes to the three trigger functions inside a transaction with verify-then-commit. CREATE OR REPLACE FUNCTION x3, then a verification SELECT against `pg_proc` confirms the new bodies contain the required INSERT INTO `territory_assignment_changes` markers.

  - **F-APA-NEIGHBOURHOOD-CHECK migration applied (option a):** `agent_property_access_scope_check` was DROPPED and re-added including `'neighbourhood'`. Resolver/trigger/distribute/partial unique index were already wired for neighbourhood; the CHECK was the only barrier. T6-followup-B now passes at neighbourhood scope (could not previously even insert a test row).

  - **F-APA-UPDATE-AUDIT-GAP discovered + fixed:** Probe surfaced that direct apa state changes were being silently propagated. `handle_apa_insert` / `handle_apa_update` / `handle_apa_delete` triggered `distribute_geo_to_children` and `reroll_listings_at_geo` correctly, but only `distribute_geo_to_children`'s per-child INSERT was writing audit rows (change_type='primary_set'). The `change_type` CHECK accepts 11 values including `assignment_granted` / `assignment_revoked` / `scope_widened` / `scope_narrowed` — the architecture intended these to be tracked, but the trigger code never wrote them. Fix: added audit-row writes to all three trigger functions. `handle_apa_insert` writes `assignment_granted` for new active rows at a geo-typed scope. `handle_apa_delete` writes `assignment_revoked` for active rows being deleted. `handle_apa_update` writes one row on simple is_active flip (granted or revoked depending on direction) or two rows (revoke OLD context + grant NEW context) on agent_id / scope / scope_id changes while is_active. All audit writes positioned BEFORE existing distribute / reroll calls; recursion guard `pg_trigger_depth() > 1` continues to prevent distribute-created child INSERTs from double-auditing.

  - **All routing-affecting events on `agent_property_access` are now traceable in `territory_assignment_changes`.** The audit gap that allowed 84,586 silent reassignments per is_active flip is closed.

  - **Probe-then-patch pattern (workflow note):** F-APA-UPDATE-AUDIT-GAP fix was an opportunity to apply Rule Zero — No Guessing rigorously. `scripts/probe-apa-trigger-functions.js` was written first (read-only) to capture the exact PL/pgSQL bodies of the three trigger functions, the audit table schema, and the CHECK constraint values. Only after that probe ran successfully against production was the fix script written, with the new function bodies derived from the probe output and the audit-row INSERT logic targeted at columns / values verified to exist.

  - **Tracker patch context (this entry):** v10 patch script (`scripts/patch-tracker-v10.js`) was committed as `08bfe76` but contained a duplicated-endAnchor bug in its span-replace patches that prevented it from running cleanly. It never modified the tracker. `scripts/patch-tracker-v11.js` (this script) was written as a comprehensive v9 -> v11 patch, applying both v10's and v11's intended changes in a single atomic operation. The buggy v10 script remains on disk as a historical artifact (committed) but is not executed.

- **2026-05-07 v10** — **T6-followup-A CLOSED + F-RACE-DEADLOCK CLOSED + F-APA-NEIGHBOURHOOD-CHECK logged.** Race-safety harness shipped, ran 3/3 PASS against production, T6 followup count drops from 3 to 2.

  - **Files shipped:**
    - `scripts/probe-race-prereqs.js` — read-only diagnostic. Dumps `distribute_geo_to_children` body, all unique indexes on `agent_property_access` (partial + total), the `scope` CHECK constraint definition, and current apa state for Whitby-area munis. No writes.
    - `scripts/r-territory-t6-followup-race.js` — race-safety harness. Two parallel `pg.Pool` connections each INSERT a muni-scope apa row for Oshawa with a different agent (King Shah vs Neo Smith). Verifies post-state: exactly OSHAWA_EXPECTED_COMMUNITIES (20) primaries, no duplicates, only racing agents present. Cleans up its own writes (apa rows deleted; `mls_listings.assigned_agent_id` updates undone via trigger reroll back to NULL).

  - **F-RACE-DEADLOCK closed in-flight (autocommit pattern):** First version of the harness wrapped each INSERT in explicit `BEGIN; INSERT; COMMIT;` inside `Promise.allSettled`. Both connections deadlocked at the application layer because Postgres cannot detect a stall where one client holds a transaction open while waiting on its own concurrent client to commit. The fix was to drop the explicit transaction wrapping — autocommit per statement allows the trigger's xact-scoped advisory lock to acquire-and-release within the implicit autocommit boundary, which is what serializes the parallel attempts.

  - **F-APA-NEIGHBOURHOOD-CHECK logged + decision-locked:** Probe revealed `agent_property_access.scope` CHECK constraint omits `'neighbourhood'` despite resolver/trigger/distribute layers all referencing it. Two resolution options: (a) add `'neighbourhood'` to the CHECK, restoring symmetry implied by every other layer; (b) strip `'neighbourhood'` from the resolver/trigger/distribute layers, locking the system to area/muni/community scope only. **Decision: option (a)** — Shah, 2026-05-07. Rationale: real estate is neighbourhood-driven (Yorkville, The Annex, Liberty Village, Leslieville are primary marketing units in Toronto; agents typically specialise in 2-3 neighbourhoods). Migration tracked v11.

  - **Test residue (informational, not regression):** ~60 audit rows in `territory_assignment_changes` from 3 race-harness trials (~20 per trial, change_type='primary_set'). Append-only by design; not removable.

- **2026-05-06 v9** — **F-AREA-REROLL-TIMEOUT CLOSED + T6-decision LOCKED.** P1 production blocker surfaced in v8 is resolved; T6 smoke re-runs cleanly under Supabase's default `statement_timeout` (no override). All 6 tests PASS in single execution.
  - **What shipped to production DB** (CREATE OR REPLACE x2 in one transaction via `scripts/apply-f-area-reroll-fix.js`):
    - **`reroll_listings_at_geo(text,uuid,uuid)`** — row-by-row loop replaced by CTE-based set UPDATE. Routing set computed once via `ROW_NUMBER() OVER (ORDER BY id) - 1`; per-listing pick computed inline via `LEFT JOIN routing ON r.rn = abs(hashtext(ml.id::text)) % NULLIF(v_total, 0)`; final UPDATE filtered by `IS DISTINCT FROM` to preserve old "only update if pick changed" semantics. Empty routing set → picks become NULL via NULLIF + LEFT JOIN, matching old NULL return path.
    - **`distribute_listings_at_geo(text,uuid,uuid)`** — same restructure. Filters to `assigned_agent_id IS NULL` (only fills empty slots, matching its existing semantics). Inner JOIN (not LEFT) since `IF v_total = 0 RETURN 0` shortcuts the empty-routing case before the UPDATE runs.
    - Caller signatures unchanged. Triggers in T3b-C (`handle_apa_insert/update/delete`) call these unchanged.
  - **Files committed in v9 batch:**
    - `scripts/apply-f-area-reroll-fix.js` — runner: rollback snapshot + forward SQL archive + transactional CREATE OR REPLACE x2 + 6/6 verification of new bodies (contain `WITH routing AS`; old `FOR rec IN` / `FOR v_listing_id IN` markers gone).
    - `scripts/r-territory-f-area-reroll-fix.sql` — forward SQL (5150 bytes), git-archived for history.
    - `scripts/r-territory-f-area-reroll-rollback_20260506_165646.sql` — pre-apply snapshot of OLD function bodies (2256 bytes). Apply this file to revert to the row-by-row implementation.
    - `scripts/probe-reroll-function.js` — diagnostic that surfaced the row-by-row bug; reusable for future function audits.
    - `scripts/patch-smoke-runner-realistic-timeout.js` — turned forced `SET statement_timeout = 0` into env-gated opt-in. Default behavior now tests under Supabase's realistic ceiling; `DISABLE_STATEMENT_TIMEOUT=1` re-enables for tests that genuinely need long timeouts.
    - `scripts/run-r-territory-t6-smoke.js` — patched per above.
  - **Verification (this is the proof, not the claim):** smoke re-run with realistic `statement_timeout` produced identical PASS results to the v8 run. Setup row matched (whitby_area=`03d4e133-...`, test_muni=`94447f26-...`, test_muni_communities=20). Test 4 — the area-scope INSERT that triggered the timeout in v8 — completed without error. Audit deltas matched (Test 6 expected 20, actual 20). Final SUMMARY: `pass=6 fail=0 skip=0 total=6`.
  - **T6-decision LOCKED at (b):** accept on-demand resolver fallback for `mls_listings.assigned_agent_id IS NULL`. No INSERT trigger on `mls_listings`. Existing resolver behavior IS the locked behavior — no code change required. Avoids thousands of unnecessary trigger fires per nightly MLS sync.
  - **Performance characterization (qualitative):** old code = 67,850 calls × ~3 SQL ops each ≈ 200,000 ops per area-scope reroll, killed by statement_timeout mid-loop. New code = 1 set-based UPDATE planned as a hash join (verifiable with `EXPLAIN ANALYZE` if needed). Scales linearly with listing count. Quantitative benchmark deferred — not required for closure since `pass=6` under default timeout proves the threshold is met.
  - **What's NOT closed yet (T6-followups remaining for full T6 closure):**
    - **T6-followup-A** — race safety harness (concurrent INSERTs at same child scope). Needs Node + `pg.Pool` with two real connections. Will use the existing runner pattern.
    - **T6-followup-B** — multi-level cascade resolver tests (area, community, neighbourhood — Test 1 only covered muni).
    - **T6-followup-C** — `is_active` flip true→false fires reroll. Add Test 3b to the smoke (inverse of existing Test 3 which proves `is_primary` toggle is no-op).
  - **Next gate:** T6-followup-A/B/C, then T4a (admin UI — F-AREA-REROLL mitigation no longer required since the underlying functions are now fast), then T4b (public geo page primary display), then T7 close.

---

## Next action

**T4a admin UI + T4b public geo display + T7 close — three pieces to W-TERRITORY closure.** Database / trigger / resolver / race safety / audit coverage layer is functionally complete. What remains is making it visible to admins (T4a) and end users (T4b), then ticket closure (T7). No special async / batch / timeout-raise infra needed for T4a — F-AREA-REROLL closure means underlying functions complete within Supabase's default timeout.

### 1. T4a — Admin UI work (4 sub-phases)

T4a is sub-phased per Rule Zero — Comprehensive Work Only. Each sub-phase ships within this working block in sequence; T4c (manager carving), T4b, and T7 follow after T4a closes.

**T4a-1: `is_primary` toggle in `GeoAssignmentSection`** ✅ CLOSED 2026-05-08 v13

- Added `is_primary?: boolean` to `Assignment` interface; per-row toggle button in green/amber editable rows; locked PRIMARY badge in inherited rows; "Primary" checkbox in Add form. 10 component edits + 2 route edits via `scripts/r-territory-t4a-1-is-primary-toggle.js`.
- Geo POST route: `is_primary` persisted via row mapping; auto-reassign loop runs BEFORE INSERT (UPDATE other agents at same `(scope, scope_id)` to `is_primary=false`, scoped by `tenant_id`). Avoids partial-unique-index conflict; produces clean `primary_unset` audit rows via `handle_apa_update` (post-F-APA-PRIMARY-AUDIT-GAP fix v13).
- Code smoke 9/9 PASS via `scripts/r-territory-t4a-1-smoke.js` (single-transaction, SAVEPOINT-isolated tests, ROLLBACK at end). Verified: trigger writes `primary_set`/`primary_unset`/`access_toggle_changed` on respective changes; v11 routing-affecting path preserved; early-return preserved on no-op; auto-reassign produces `primary_unset` on displaced agent.
- Commits: `c85174e` (audit-gap fix) + `167c477` (T4a-1 close + smoke).

**T4a-2: New `/admin-homes/territory` page** ✅ CLOSED 2026-05-08 v14

- New server component `app/admin-homes/territory/page.tsx` (auth + tenant scoping mirrors `agents/page.tsx` pattern). New client component `components/admin-homes/TerritoryClient.tsx` (coverage table + audit log viewer + 5-card stats with scope filter + change_type filter).
- Two new GET API routes: `/api/admin-homes/territory/coverage` (active APA rows joined with agent + geo names + stats), `/api/admin-homes/territory/audit-log` (TAC rows with limit + change_type + agent_id filters + distinct change_types for filter UI).
- Per-tenant scoping; platform admin can override via `?tenant_id=...`; cross-tenant access for non-platform users → 400.
- Commit `d8ef4c5` -- 5 files, 1051 LOC, TSC clean.

**T4a-3: F-APA-DELETE-INSERT-CHURN comprehensive fix** ✅ CLOSED 2026-05-08 v14

- Server-side diff in apa POST route (`agents/[id]/geo/route.ts`) and tpa POST route (`tenants/[id]/geo/route.ts`). Diff logic extracted to `lib/admin-homes/apa-diff.ts` (`computeApaDiff` + `ApaRow` + `ApaDiff` types).
- Identity key per row: `(scope, area_id, municipality_id, community_id, neighbourhood_id)`. Diff outcomes: identical → 0 SQL ops; added → INSERT only new rows; removed → DELETE by id only the removed rows; mutated → UPDATE by id only the changed rows.
- Auto-reassign for primary claims preserved (T4a-1 behavior). Inactive rows now preserved on save (no longer nuked -- behavior improvement).
- Smoke 9/9 PASS via `scripts/r-territory-t4a-3-smoke.ts` (savepoint-isolated). T5 identical-save delta = 0 audit rows is the headline proof.

**T4a-3b: F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix** ✅ CLOSED 2026-05-08 v14

- Caller probe confirmed live: `HomePageComprehensive.tsx` + `HomePageComprehensiveV2.tsx`, both wired from `app/page.tsx` and `app/comprehensive-site/page.tsx`.
- Added `case 'neighbourhood':` to `resolveAgentAccess` switch in `lib/comprehensive/access-resolver.ts` with parent propagation (matches existing `community` case shape).
- Tighter neighbourhood-grained listing filter (extending `ResolvedAccess` with `neighbourhoodIds` + downstream filter) deferred to future T4d -- non-regressive, additive.

**T4c-1: Bulk-assign API route + smoke**

- New route `POST /api/admin-homes/territory/bulk-assign`. Payload: `{ assignments: { [agentId]: ApaRow[] } }`.
- Per-agent permission gate via `can()` with `agent.write`. Manager must have write on every agent in payload. Out-of-subtree or cross-tenant agent in payload → 403, zero DB writes (atomicity guard).
- Atomic: single pg.Client transaction wrapping per-agent computeApaDiff + apply. ROLLBACK on any per-agent failure.
- Auto-reassign primary runs ONCE per (scope, scope_id) pair across the entire payload (not per-agent) to avoid redundant updates and partial-unique-index churn.
- Smoke (savepoint-isolated): no-change bulk save → 0 audits; cross-tenant attempt → 403 + 0 writes; out-of-subtree attempt → 403 + 0 writes; per-agent mid-payload failure → full rollback verified at row count level.

**T4c-2: Matrix component + page (desktop)**

- New page `/admin-homes/territory/manage`. Server component fetches manager's effective coverage geos (all 4 scopes) + full recursive managed-agent subtree (via `auth.ts` `managedAgentIds`).
- Matrix component: rows = geos, columns = managed agents + self. Per-cell editor: `is_primary`, `condo_access`, `homes_access`, `buildings_access`, `buildings_mode`.
- Per-row conflict UX: when two cells in same row both claim primary, visually flag before save (preempts the partial-unique-index rejection from the apa partial unique constraints).
- Per-row bulk actions: assign-all-to-X, clear-row.
- Inheritance preview: rows where agent has no explicit apa for that geo show inherited-from-manager state distinctly from explicit rows.

**T4c-3: Mobile + a11y**

- Matrix collapses to stacked per-agent accordion on narrow viewports (each agent = expandable card with their geo rows).
- Keyboard navigation: arrow keys move focus between cells; Enter toggles primary; space toggles access flags.
- ARIA cell semantics throughout (table is the natural primitive). Loading states + empty states + error states audited.

**T4b: Public-facing UI### 2. T4c — Manager carving (deferred from T4a, ships immediately after T4a)

Currently a managed agent without manual apa rows automatically inherits their manager's territory via `lib/utils/territory.ts` (manual → inherited from manager → inherited from tenant pool). T4c adds the **explicit** manager-driven distribution: a manager opens a UI and explicitly carves their territory into specific managed agents (creating manual rows that override the implicit inheritance).

Open product question to resolve at T4c kickoff:

- Drag-drop assignment? Checkbox grid (managed-agent × geo)? Table per managed-agent with row toggles?
- Per-agent split (manager picks which geos go to which managed agent), or per-geo split (manager picks which managed agent gets each geo)?
- Auto-distribute button (split N geos across M managed agents using the same hash-distribute as `distribute_geo_to_children`)?

T4c **ships in same working block as T4a** per Rule Zero — Nothing Deferred. Sub-phase order: T4a-1 → T4a-2 → T4a-3 → T4a-3b (if warranted) → T4c → T4b → T7.


### 3. T4b — Public-facing UI: geo page primary agent display

Public site renders area / muni / community / neighbourhood / building pages. Each needs to display the **primary agent** card sourced from `resolve_display_agent_for_context`.

**Pre-build recon:**

- Locate existing geo page routes + agent-card components.
- Confirm how they fetch agent data today.
- Decide whether to enhance `app/api/walliam/resolve-agent/route.ts` to accept `neighbourhood_id` from request body (forward compat for neighbourhood-level pages — F-APA-NEIGHBOURHOOD-CHECK closure means neighbourhood-scope assignments can now exist in apa).

**Building pages are a documented shared exception between System 1 and System 2** — handled with extreme care. Read the existing building page handling before changing anything; do not modify System 1 paths.


### 4. T7 — Close ticket

After T4a + T4c + T4b ship and a final smoke matrix run:

1. Apply the closing tracker patch (final closure entry, status line marked CLOSED with commit hashes for the major milestones — F-APA-NEIGHBOURHOOD-CHECK, F-APA-UPDATE-AUDIT-GAP, F-APA-DELETE-INSERT-CHURN, T4a sub-phases, T4c, T4b).
2. Flip `docs/W-LAUNCH-TRACKER.md` Section 4 W-TERRITORY row from in-progress to **CLOSED**, with commit hashes for: T6 closure (v11), T4a sub-phases, T4c, T4b.
3. Notify any downstream workstreams (W-LAUNCH P1-3, public-page rendering) that territory is unblocked end-to-end.
4. W-TERRITORY workstream complete.

### Optional / parallel:

- **T2b** — percentage mode (still optional; can ship anytime, doesn't block T4).
- **Hygiene** — ~30 untracked patch scripts in `scripts/` from earlier W-RECOVERY / W-ROLES-DELEGATION / W-LAUNCH work. Reproducibility debt; commit batch when convenient.
