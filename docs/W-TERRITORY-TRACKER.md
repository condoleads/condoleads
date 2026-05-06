# W-TERRITORY Tracker

**Started:** 2026-05-05
**Owner:** Shah (sole dev)
**Status:** **T6 CORE PASS + F-AREA-REROLL CLOSED 2026-05-06.** All 6 T6 tests verified PASS under Supabase's default `statement_timeout` (no override) after deploying the set-based reroll/distribute fix to production. F-AREA-REROLL-TIMEOUT closed: `reroll_listings_at_geo` and `distribute_listings_at_geo` rewritten from row-by-row loops to single CTE-based UPDATE statements; identical hash-distribute semantics, identical signatures, ~200x fewer SQL operations per call. T6-decision LOCKED at (b): accept on-demand resolver fallback for `mls_listings.assigned_agent_id IS NULL`; no INSERT trigger on `mls_listings`. T1, T2a, T3a, T3b, T6-core, F-AREA-REROLL, T6-decision all closed. Three followups remain for full T6 closure: T6-followup-A (race safety harness), B (multi-level cascade resolver tests), C (`is_active` flip fires reroll). **Next:** ship T6-followup-A/B/C, then T4a/T4b UI.
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

### T6 — Smoke matrix (RECOMMENDED NEXT)

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

**Three smoke followups, then UI work.** F-AREA-REROLL is no longer a blocker for T4a — the underlying functions complete within Supabase's default timeout, so admin endpoints don't need batching, queue infrastructure, or per-endpoint timeout raises.

### 1. T6-followup-A — race safety harness

Two pg connections in parallel attempt INSERTs at the same child scope. Assert exactly one succeeds (partial unique indexes from T2a-02 + `EXCEPTION WHEN unique_violation` in the trigger functions handle the conflict). Ships as `scripts/r-territory-t6-followup-race.js` using `pg.Pool` with two clients, `Promise.all` on competing INSERTs.

Acceptance: 100 trial runs, every run shows exactly one INSERT succeeded and one raised `unique_violation` (caught by the trigger and retried, or surfaced cleanly to the caller — depends on T3b-C's actual handling; verify against current code).

### 2. T6-followup-B — multi-level cascade resolver tests

Extend `scripts/r-territory-t6-smoke.sql` (or a sibling `t6-smoke-extended.sql`) with sub-tests:

- **Test 1b** — `resolve_geo_primary('area', whitby_area_id, tenant_id)` returns expected primary
- **Test 1c** — `resolve_geo_primary('community', some_community_id, tenant_id)` returns expected primary
- **Test 1d** — `resolve_geo_primary('neighbourhood', some_neighbourhood_id, tenant_id)` returns expected primary

Each picks synthetic test data at runtime (same pattern as the existing Test 2's test_muni selection — pick a sibling at runtime, no hardcoded IDs).

### 3. T6-followup-C — `is_active` flip fires reroll

Add Test 3b to the smoke: pick an existing apa row, flip `is_active` true→false, assert `territory_assignment_changes` row count INCREASES (some change was logged) AND `mls_listings.assigned_agent_id` for that scope's listings is updated. This is the inverse of Test 3 (which proves `is_primary` toggle is a no-op). Together they exhaustively cover handle_apa_update's two paths.

### After T6-followup-A/B/C close:

- **T4a** — Admin UI at `/admin-homes/territory`. Standard implementation, no special async / batch / timeout-raise infra required (F-AREA-REROLL closed at function level, not endpoint level).
- **T4b** — Public-facing geo page primary agent display via `resolve_display_agent_for_context`.
- **T7** — Close the ticket. Update `W-LAUNCH-TRACKER.md` Section 4 W-TERRITORY row to CLOSED with commit hashes.

### Optional / parallel:

- **T2b** — percentage mode (still optional; can ship anytime, doesn't block T4).
- **Hygiene** — ~30 untracked patch scripts in `scripts/` from earlier W-RECOVERY / W-ROLES-DELEGATION / W-LAUNCH work. Reproducibility debt; commit batch when convenient.
