# W-TERRITORY-MASTER tracker

**Status:** Model LOCKED (v16, 2026-05-28). Build pending. This document is the authoritative spec for territory + lead routing.

Read `CLAUDE.md` (repo root) first for the engineering constraints that govern all work here.

---

# PART 1 — THE LOCKED MODEL

This is the canonical, long-term architecture. Do not deviate without an explicit decision recorded in this tracker.

## Core primitive: the routing set

One mechanism, three sizes:
- A **routing set** = 1..N agents attached to a `(scope, scope_id, property_type)` node.
- **Assignment** = N=1 (one agent owns the scope).
- **Distribution** = N>1 (agents share; each listing/sub-geo hashes to one).
- **Floor** = the routing set at the tenant root (catches everything uncarved).

Assignment, distribution, and floor are ONE feature at three sizes. Build the routing-set resolver once. "Distribute Durham among 20" = insert 20 routing-set rows at the Durham area node. There is never a fourth mechanism.

## Two orthogonal axes

1. **Geo specificity** (most-specific-first walk):
   `listing pin → building → neighbourhood → community → municipality → area → tenant floor`
2. **Property type**, applied at EVERY geo level (not just community):
   `condo | home`

A routing set targets a `(geo-level, property-type)` pair. "Durham-area condos → Agent A" and "Durham-area homes → Agent B" are two independent routing sets at the same geo level. The condo/home split exists at neighbourhood, community, municipality, AND area. Building level is condo-only (homes are orphans — no building parent — and skip it).

## Precedence: most-specific wins, enforced by STORED scope-level

Resolution walks most-specific → least-specific; first level with a routing set for the listing's property type wins; walk stops there.

**Precedence is a property of stored data, not execution order.** Each materialized cache row records WHICH scope-level set it (`assignment_scope` + `assignment_source_id`). A distribution at level L only overwrites cache rows whose current scope is L-or-broader — it NEVER clobbers a more-specific carve. Distributions are safely re-runnable in any order, any number of times. Re-running tenant-level distribution months later does NOT wipe area/community/building carves. This is the property that makes "never revisit" true.

## Materialized on-demand (NOT live resolver)

The resolved owner of every listing is **materialized** to a cache column. Display and leads read one indexed column — fast everywhere. Expensive resolution (geo walk + hash) happens at **distribution time** (operator-triggered, or scoped delta on data events), NOT on every page render or lead.

Rationale (verified by latency test, `scripts/r-p-floor-latency-test.js`): hash compute is cheap (0.39ms/geo pure DB) but a live-resolve-on-every-render model puts the resolver on 100% of the read path with per-call round-trip cost. Materializing removes the read-path resolver entirely. The "pure resolver, nothing stored" model was explicitly evaluated and DROPPED in favor of materialized-on-demand.

## Sticky distribution bindings

Distribution bindings (N>1) HOLD once materialized. Adding an agent to a set does NOT reshuffle existing bindings. Only three things re-materialize an existing row:
1. Agent departure/deactivation (reflow scoped to that agent's rows).
2. Explicit operator rebalance.
3. Carve removal (fall back to next-broader level).

Sticky is near-free under materialization — the binding is already stored; simply don't auto-rewrite on pool-add.

## Event lifecycle (every routing mutation + its scoped re-materialization)

| Event | Source | Re-materialization scope |
|---|---|---|
| Operator runs distribution | Operator | Rewrite that scope only; skips more-specific carves |
| Operator assigns (N=1) | Operator | Rewrite that scope, instant; overrides broader |
| Operator removes a carve | Operator | Fall back to next-broader level; re-resolve released scope |
| Agent departs / deactivated | System (flag) | Reflow that agent's rows only; leads+emails blocked instantly (resolver already filters `is_active AND is_selling`) |
| New listing arrives (nightly sync) | System (data) | Resolve at insert; delta only — cheap |
| Listing geography changes | System (sync diff) | Re-resolve that listing |
| Periodic reconciliation | System (scheduled) | Re-resolve mismatches; corrects stale cache (drift safety net) |

## Property-type asymmetry

- **Condos** (`'Residential Condo & Other'`): have building parent. Building set overrides community set. Walk: pin → building → community → muni → area → floor.
- **Homes** (`'Residential Freehold'`): orphans, no building. Walk: pin → community → muni → area → floor.
- Building-scope routing sets valid for condos only; invalid/ignored for homes.

## Lead alignment

- Display agent === lead agent — both read the materialized owner; cannot diverge.
- One agent per geo (not per-listing-card chaos). Buyer sees one consistent face per geography.
- Lead routed at arrival → stamped to `leads.agent_id` → frozen. Pool changes never disturb an already-routed lead.
- Lead flows up the stamped agent's hierarchy chain (`manager_id`, `area_manager_id`, `tenant_admin_id`) — existing W-HIERARCHY + R7 delegation BCC machinery.

## Open design decisions — NOW DECIDED (2026-05-28), do not re-ask

- **A. New-listing routing at insert — DECIDED: resolve-at-insert.**
  When the nightly PropTx sync inserts a new listing, resolve that one listing through the materialized path and write its `assigned_agent_id` in the same operation. Delta only (hundreds/night) — cheap. Honors "no time anything is unclaimed." Reuses the exact resolution the distribution engine uses (one code path). If resolution finds no routing set (shouldn't happen when a tenant floor exists, but defensively), fall to the tenant floor. New listings are NEVER left NULL.

- **B. Cache invalidation / reconciliation — DECIDED: triggers (primary) + incremental nightly reconcile (safety net).**
  - **Mutation-triggered re-resolution** is the primary mechanism: the 7 lifecycle events each fire scoped re-materialization the moment they happen. Keeps the cache correct in real time.
  - **Periodic reconcile job** is the safety net for missed triggers / manual edits / sync-without-hook. Runs nightly after sync. **Must be INCREMENTAL and BOUNDED** — only checks rows that could have changed (sync-delta that night + flagged rows + a small rolling sample), NOT a full 1.28M re-resolve. Full-table re-resolve is reserved for an explicit operator-triggered "rebuild" button only. The reconcile job doubles as drift telemetry: if it corrects many rows nightly, a trigger is missing.

- **C. Sticky scope — DECIDED (confirmed earlier):** distribution bindings hold; only departure-reflow, explicit rebalance, or carve-removal re-materialize.

---

# EXECUTION PROTOCOL — follow this rhythm for every phase

This project is executed with strict recon-first, baseline-before-change, smoke-after discipline. Nothing is guessed; nothing production-touching runs without review. Follow this protocol on EVERY phase, not just the risky ones.

## The rhythm (per phase)

1. **RECON FIRST (read-only).** Before writing any build code for a phase, run a read-only probe that verifies every assumption the phase depends on — schema shape, existing function bodies, current data state, constraint definitions. Output to a `*-output.txt`. One script, one run. Use explicit column allow-lists (never `SELECT *` on credential-bearing tables). Show the operator the output. Do not write build code until the recon output is reviewed.

2. **PROPOSE + WAIT.** State the build plan in plain language: what files change, what the migration does, what could regress. For any phase that WRITES to the DB or commits, show the full migration SQL and the apply-runner, then STOP and wait for explicit operator approval. Do not apply on your own initiative.

3. **BASELINE (for any phase that changes routing/resolution).** Before applying, run a smoke script against CURRENT production that captures the truth that must be preserved — specifically: the 12 Whitby carves (Neo Smith @ Whitby muni; King Shah @ the 11 named communities), a sample of floor-routed listings, the homes (NULL or otherwise), and cross-tenant (aily) isolation. Save this baseline to a file. This is the "what must not change" snapshot.

4. **APPLY (transactional, reversible).** Production DB changes use a `node scripts/apply-*.js` runner that: (a) captures a rollback snapshot of every function it will replace, to `supabase/migrations/rollback-snapshots/`; (b) runs the migration inside ONE transaction; (c) runs post-state verification checks; (d) COMMITs only if ALL checks pass, else ROLLBACK. Never apply outside this pattern.

5. **SMOKE AFTER + DIFF.** Re-run the same smoke script post-apply. DIFF against the baseline from step 3. Any listing that changed owner unexpectedly is a regression — HALT and show the operator. Only intended changes (e.g. the ~1.29M reverted-then-re-materialized rows: 495,428 condos + 799,688 homes) may differ; everything else (the 12 carves, aily) must be byte-identical.

6. **COMMIT (reviewed).** Show what is being committed. `git add` + commit with a descriptive message after the operator confirms.

7. **UPDATE THIS TRACKER (mandatory, non-skippable).** Before the phase is considered closed, update this tracker on disk:
   - Move the phase's row in the roadmap to CLOSED with the commit SHA.
   - Add a dated entry to PART 4 (Condensed History) stating: what was applied, what production state changed (with verified numbers, not estimates), what was committed, and any new finding or deviation discovered.
   - If anything was learned that future sessions must know (a schema surprise, a constraint, a gotcha), add it to PART 6 (Process Lessons).
   - If a new open item surfaced, add it to PART 5 (Open Findings).
   - **Back up the tracker before editing it** (it is an existing file): `Copy-Item docs/W-TERRITORY-MASTER-TRACKER.md docs/W-TERRITORY-MASTER-TRACKER.md.backup_<timestamp>` BEFORE the edit.
   - Commit the tracker update in the same commit as the phase work (or immediately after).

   **Why this is non-skippable:** Claude Code sessions do not persist. The next session — possibly days later, possibly a cold start that remembers nothing — resumes ONLY from this tracker and the git history. An un-updated tracker means the next session starts blind and may assume a clean slate that does not match production (the exact failure this whole protocol guards against). The tracker is the memory between sessions. Treat updating it as part of the work, not paperwork after it.

## At the START of every session (cold-start checklist)

Before proposing or doing anything, a fresh session MUST:
1. Read `CLAUDE.md` and this tracker in full.
2. Run `git status` and `git log --oneline -10` to see what is committed vs uncommitted.
3. Run a read-only DB state check against the verified-state facts in PART 2 (e.g. count NULL vs filled `assigned_agent_id`, count `tenant_floor_pool` rows, count apa rows) and CONFIRM the live DB matches what the tracker says the last session left. If the DB and tracker disagree, STOP and surface it to the operator — do not build on a mismatched assumption.
4. Only then propose the next action.

## Phases that run AUTONOMOUSLY (no per-step approval needed)

- All read-only recon probes.
- All smoke tests (they read, they don't write).
- Local `npm run dev` smoke checks.

## Phases that REQUIRE operator review before executing

- Any migration / DDL / DML against the production DB.
- The ~1.29M-row backfill revert (495,428 condos + 799,688 homes — destructive — see safety note below).
- Any `git commit` / `git push`.
- Any change to `resolve_agent_for_context` (13 direct/indirect callers + 1 placeholder — see frozen-contract note).

---

# REGRESSION + HARM GUARDS — mandatory

## Frozen contracts (never change without explicit operator sign-off)

- **`resolve_agent_for_context` SIGNATURE is frozen.** It has 13 direct/indirect callers + 1 placeholder (SimulatorTab stub) — corrected from the original v18 count of 9 after Phase 2 recon. 7 are cache-first eligible (have `listing_id` in scope, wired in Phase 2 EDITs A/B/C/D): `lib/utils/tenant-resolver.ts` (the wrapper invoked by 5 geo-page renders), `lib/actions/leads.ts` (leads helper), and 5 API routes (charlie/lead, walliam/contact, walliam/charlie/session, walliam/estimator/session, walliam/assign-user-agent). The remaining 6 are RPC-only by design (no `listing_id` in scope): 5 geo-page render call-sites (MunicipalityPage, CommunityPage, AreaPage, BuildingPage, toronto/[neighbourhood]) + charlie/appointment. Change the BODY only — never the parameters, never the return type. A signature change silently breaks Charlie, leads, contact, estimator.
- **The 12 existing apa carves must survive every migration.** Post-migration, Whitby-community condos still resolve to King Shah; Whitby buildings still resolve to Neo Smith. The smoke matrix asserts this explicitly.
- **System 1 isolation is absolute.** Territory work is all System 2. If any proposal touches `/admin`, `app/api/chat/*`, or `agent_buildings` — STOP, that is a red flag, surface it to the operator.

## The backfill revert — the one destructive operation

Setting ~1.29M rows (495,428 condos + 799,688 homes) `assigned_agent_id` to NULL is destructive IF done alone. It is safe ONLY because it happens in the SAME TRANSACTION as the v16 geo-level re-materialization that immediately re-fills them. **Structure it as: revert + re-materialize commit together or roll back together — never two separate transactions.** A split would leave ~1.29M listings unowned in a visible window. The apply-runner must verify post-state has zero unintended NULLs before COMMIT.

## Baseline-diff is the primary regression detector

For the migration phase: capture the resolution truth BEFORE (baseline), apply, capture AFTER, diff. Anything that moved that shouldn't have is caught automatically. This is stronger than eyeballing — it is a mechanical assertion that only intended rows changed.

## No mass operation without a timeout + compute plan

1.28M-row operations need `SET statement_timeout = 0` (gated by env var) and adequate Supabase compute. Prefer the materialized model that avoids mass rewrites; where a large operation is unavoidable (initial materialization, explicit rebuild), batch it or run on Medium compute and downgrade after.

## Local smoke before any prod-facing push

Nothing reaches a prod-facing surface until local `npm run dev` smoke passes. Never test on Vercel preview.

## GAP guards — additional mandatory checks (added 2026-05-28)

These close gaps identified in execution review. Apply at the relevant phase.

- **GAP 2 — Smoke-diff must assert NEW VALUES, not just detect change.** For the ~1.29M reverted-then-re-materialized rows (495,428 condos + 799,688 homes), the diff must confirm each one's new `assigned_agent_id` equals what the v16 geo-level resolver would produce — not merely that it changed. "Changed" is insufficient; a wrong-but-changed value would pass a change-only diff. Assert the new value matches expected resolver output for that listing's geo + property type. Everything OUTSIDE the reverted set must be byte-identical to baseline.

- **GAP 3 — Write the DOWN migration before applying the UP.** Before the P-ROUTING-SET + P-MATERIALIZE + P-REVERT-BACKFILL migration is applied, author and show the operator the explicit rollback: how to undo this specific change if a regression surfaces AFTER commit (when the transaction-level rollback no longer applies). Verification checks only catch what they test; the down-migration is the recovery for what they miss. New tables/columns: how to drop. Reverted+re-materialized rows: how to restore prior state (or confirm prior state was the known-wrong listing-level backfill and document that restoring it is not desired). Must cover BOTH condos AND homes — the ~1.29M reverted rows include 495,428 condos + 799,688 homes (homes confirmed 2026-05-28 as same v15 listing-level picks). No up-migration applies without a written, reviewed down-migration.

- **GAP 4 — Reconcile job action-on-mismatch is DEFINED: correct + log + threshold-alert.** When the nightly incremental reconcile finds a cache row whose owner != current resolver output: (a) correct it (that is reconcile's job), (b) log every correction to a `reconcile_corrections` table (listing_id, old_agent, new_agent, reason, timestamp), (c) if corrections in one run exceed a threshold (start at 50), alert the operator — because high correction volume means a mutation trigger is missing and silently drifting. Reconcile must never silently mass-correct; visibility is mandatory so a broken trigger surfaces instead of being masked.

- **GAP 5 — Departure boundary: in-flight leads complete, only NEW leads blocked.** Deactivating an agent blocks routing of leads arriving AFTER the deactivation commits. A lead already stamped and mid-processing (email/BCC in flight) completes normally — it is already owned. Do not attempt to claw back in-flight leads. Stated decision, not accidental timing.

- **GAP 6 — Materialized read path must be scale-tested.** Before declaring the build done, time the realistic production read: a geo page / search grid reading `assigned_agent_id` for many listings joined to agent profiles, under realistic row counts. Almost certainly fast (indexed column), but the no-guessing rule applies — 100% of production traffic hits this path. One timing query; record the number in the tracker.

---

# PART 2 — RECONCILIATION OF PRIOR WORK (v15 → v16)

A narrow version of this model shipped on 2026-05-27 (tenant-root floor only, listing-level hash, cached via backfill). Under the v16 model:

- **KEEP:** `tenant_floor_pool` table, `tenant_floor_alerts`, the resolver floor branch, audit/queue triggers (`handle_tenant_floor_pool_change`, `trg_tfp_after_*`), the `territory_assignment_changes.change_type` CHECK extension (+floor_pool_added/removed/access_changed), the `territory_reroll_queue.scope` CHECK extension (+tenant_default), `uq_trq_pending_dedup`. These constitute the tenant-root routing set — valid as the broadest distribution.
- **SUPERSEDE:** the listing-level hash in `pick_floor_agent`. v16 is geo-level + sticky, not per-listing. `pick_floor_agent` needs rework to hash at geo scope and respect stickiness.
- **REVERT:** the ~1.29M-row v15 listing-level backfill — 495,428 condos + 799,688 homes (homes confirmed 2026-05-28 as same v15 `reroll_listings_at_floor` picks; v15's "connection died mid-run" was a client disconnect after the DB-side transaction had already committed — see F-HOMES-FILLED-UNEXPECTEDLY and v17 history entry). Under v16 the floor is geo-level and materialized via the unified distribution path. Action: set those ~1.29M `assigned_agent_id` back to NULL, re-materialize via v16 geo-level distribution. Both condos and homes are reverted together in the same transaction.
- **GENERALIZE:** `tenant_floor_pool` is the root-scope special case of a general routing-set spanning all scopes × property type. `agent_property_access` already has scope + condo/homes/buildings flags + is_primary. RECON NEEDED: how much of the general routing-set primitive does `agent_property_access` + `distribute_listings_at_geo` already provide vs. net-new.

### Verified production state as of v16 (re-verify before building)

- `mls_listings`: ~1,295,935 rows. As of v15 backfill: condos materialized (listing-level, to be reverted), homes NULL, 12,547 pre-existing cascade assignments untouched. [RESOLVED 2026-05-28 — homes are NOT NULL: 799,688 of 801,325 homes have `assigned_agent_id` filled. Source identified: v15 `reroll_listings_at_floor` homes run DB-committed despite client disconnect — same listing-level `pick_floor_agent` picks as condos, requiring the same revert. See F-HOMES-FILLED-UNEXPECTEDLY.]
- `agent_property_access`: 12 WALLiam rows — 1 Neo Smith @ Whitby muni (all flags incl. buildings=true), 11 King Shah @ Whitby communities (condo=true homes=true buildings=false). All `is_primary=true is_active=true`.
- `tenant_floor_pool`: 3 WALLiam rows (King Shah, Neo Smith, WALLiam seed agent), all condo+homes access.
- Resolver functions, full bodies, captured in `scripts/r-p-floor-recon.js` output (v13).
- `resolve_agent_for_context` has 13 direct/indirect callers + 1 placeholder — signature is a stable contract, change body only (see frozen-contract note for the cache-first/RPC-only breakdown). Original v18 count of "9" was incomplete; corrected during Phase 2 recon.

---

# PART 3 — PHASE ROADMAP

| Phase | Name | Status |
|---|---|---|
| P1–P5.3 | All prior territory phases | CLOSED |
| P-FLOOR-recon | 3-round read-only probe of resolver + apa + agents | CLOSED |
| P-FLOOR-migration | Narrow floor schema + resolver | APPLIED, partially superseded |
| P-MODEL-LOCK | Comprehensive long-term model | LOCKED (this doc) |
| **P-MODEL-recon** | **Probe routing-set coverage in `agent_property_access` + `distribute_listings_at_geo` + cache** | **NEXT** |
| P-ROUTING-SET | Build/generalize the unified routing-set primitive (all scopes × property type) | OPEN |
| P-MATERIALIZE | On-demand distribution engine + scoped re-materialization per event | OPEN |
| P-LIFECYCLE | Wire the 7 lifecycle events (insert-resolve, departure-reflow, geo-change, reconcile, etc.) | OPEN |
| P-REVERT-BACKFILL | Revert ~1.29M rows (495,428 condos + 799,688 homes) listing-level cache to NULL | OPEN |
| P-DASHBOARD | Operator UI: run distributions, view coverage, assignment-vs-default per geo | OPEN |
| P-SMOKE | Full matrix: precedence, property-type split, sticky, departure-reflow, cross-tenant | OPEN |
| P-COMMIT | Atomic ship | OPEN |

## P-MODEL-recon — specific questions to answer (read-only, no writes)

1. Does `agent_property_access` already support multiple non-primary rows at one geo (i.e. a distribution set), or only one primary per geo? Check the constraints and existing data.
2. Does `distribute_listings_at_geo` already hash listings across multiple apa agents at a geo? Read its body (captured in `scripts/r-p-floor-recon.js` output) and confirm.
3. Is there any column on `mls_listings` (or a side table) recording WHICH scope-level set the current `assigned_agent_id` — i.e. the precedence provenance the v16 model requires? If not, it's net-new.
4. How do `reresolve_listing` / `reresolve_building` propagate to the cache, and do they respect property type?
5. What does the nightly sync (GitHub Actions) currently do with `assigned_agent_id` on new listings — set it, leave NULL, or nothing?
6. Map all readers of `mls_listings.assigned_agent_id` (display path, lead path) — confirm they read the cache, and that display and lead paths agree.

Output to a single `r-p-model-recon-output.txt`. One script, one run. Use explicit column allow-lists (never `SELECT *` on `tenants`/`agents`).

## Suggested build order (each phase follows the EXECUTION PROTOCOL above)

1. **P-MODEL-recon** — one read-only script answering the 6 questions. Review output before building. (Autonomous to run; review output.)
2. **P-ROUTING-SET + P-MATERIALIZE + P-REVERT-BACKFILL** — ONE atomic migration: generalize the routing-set primitive (extend `agent_property_access` semantics and/or add scope-level provenance columns to the cache), build the on-demand distribution engine that materializes with scope-level provenance, AND revert the ~1.29M rows (495,428 condos + 799,688 homes) + re-materialize them via the v16 geo-level path — all in one transaction. Apply-runner with snapshot + verification + transactional commit. REQUIRES baseline-capture before, smoke-diff after, operator review of the SQL before apply.
3. **P-LIFECYCLE** — wire the 7 events: resolve-at-insert hook in the nightly sync (decision A), mutation triggers for the operator/agent events, incremental nightly reconcile job (decision B). REQUIRES operator review before apply.
4. **P-DASHBOARD** — operator UI: run distributions, view coverage, assignment-vs-default per geo, see floor alerts. REQUIRES review before apply.
5. **P-SMOKE** — full matrix locally (`npm run dev`) before commit: precedence (pin > building > community > muni > area > floor), property-type split at every level, sticky (add agent → existing bindings unchanged), departure-reflow (deactivate agent → their rows re-flow, leads/emails blocked), cross-tenant isolation (aily never gets WALLiam agents). Autonomous to run; review results.
6. **P-COMMIT** — atomic. Review what's committed.

A and B are DECIDED (see above) — do not pause to re-ask. C is confirmed. Pause for operator review at the write-phases per the EXECUTION PROTOCOL, not for already-decided design questions.

### Phase 1 migration package — FINALIZED + COMMITTED (2026-05-29, attempt 4)

Three files on disk in final reviewed form (NOT executed, NOT committed):
- `supabase/migrations/20260528_phase1_routing_set_and_revert.sql` (561 lines) — up-migration
- `supabase/migrations/20260528_phase1_down.sql` (129 lines) — down-migration (GAP-3)
- `scripts/apply-phase1-routing-set.js` (427 lines) — apply-runner

Locked Phase 1 / Phase 2 split: Phase 1 corrects the cache in one atomic transaction; Phase 2 (separate, after Phase 1 smoke confirms cache is correct) wires the 9 `resolve_agent_for_context` callers to read `assigned_agent_id` first. Readers must NOT trust the cache until Phase 1 has corrected it — wiring before correction would route real leads to wrong agents silently.

Locked design decisions:
1. `assigned_source_id` for floor picks: set to `tenant_floor_pool.id` (load-bearing for precedence-by-stored-scope).
2. aily fixture: REMOVED from migration (no synthetic agent inserts into credentials-bearing tables); V6 stays vacuous-but-correct; real isolation smoke deferred (F-AILY-CROSS-TENANT-SMOKE-DEFERRED).
3. Transaction: `DISABLE_STATEMENT_TIMEOUT=1`, Medium compute, downgrade to Micro as non-skippable closing step.
4. `tenant_floor_alerts` writes inside same transaction.
5. Revert scope ~1.29M (495,428 condos + 799,688 homes) — confirmed v15 backfill picks (F-HOMES-FILLED-UNEXPECTEDLY).
6. Per-cache-change audit table: WAIT for reconcile work (GAP-4); provenance covers per-row "what set this."

Pre-execution requirements:
- `DATABASE_URL` = direct connection (`db.<project>.supabase.co:5432`), NOT pooler
- `DISABLE_STATEMENT_TIMEOUT=1` in `.env.local`
- Supabase compute upgraded to Medium before run
- Closing step (manual, non-skippable): downgrade compute Medium → Micro in dashboard after successful COMMIT

Verification coverage (V1–V8 + V7d):
- V1: provenance columns + CHECK constraints exist
- V2: slot-constraint swap (`uq_apa_active_slot` → `uq_apa_active_slot_per_agent`)
- V3: coupled-state invariant
- V7d (diagnostic, runs BEFORE V4a): WALLiam floor pool has effective condo + homes coverage
- V4a (PRIMARY): zero condo/home NULLs after re-materialize
- V4b sanity: total filled in 1,297,000–1,299,000
- V4c: coupled-state re-check
- V5a: Whitby-muni-outside-carves → Neo Smith @ municipality (NOT EXISTS, disjoint from V5b)
- V5b: King Shah's 11 communities @ scope=community (COUNT DISTINCT = 11)
- V5c: 2 Commercial pins preserved
- V6: cross-tenant isolation (vacuous against aily today)
- V7a: floor > 1,200,000 / V7b community > 0 / V7c municipality > 0
- V8: zero `empty_floor_pool` alerts in the window

Failure/recovery:
- ASSERT failure inside transaction → automatic ROLLBACK, no DB state changed, snapshots remain on disk
- Post-COMMIT regression → run down-migration: STEP 1 `psql -f` both rollback-snapshot files, STEP 2 `psql -f 20260528_phase1_down.sql`. Default leaves cache at v16-correct values; D.6 hard-restore optional and not run by default.

Attempt 4 outcome (2026-05-29, COMMITted):
- Three prior attempts rolled back cleanly before reaching COMMIT. Attempt 1: V2 coupled CHECK validated against 1.29M existing rows whose newly-added `assigned_scope` column was NULL → fixed via `ADD CONSTRAINT … NOT VALID` in §2 + `VALIDATE CONSTRAINT` in new §7.5 after re-materialization. Attempt 2: V5a `ASSERT v_n > 0` failed because King Shah's 11 community carves are exhaustive of Whitby muni (target set empty) → fixed via vacuous-pass Option C with refinement (positive boundary on Neo Smith + negative boundary on King Shah). Attempt 3: direct-host DNS (`db.<projref>.supabase.co`) unresolvable for this Supabase project — newer projects are pooler-only → fixed by switching `DATABASE_URL` back to session pooler (port 5432) + relaxing runner's pooler-heuristic to port 6543 only (transaction pooler) since session pooler preserves `SET LOCAL statement_timeout`.
- Attempt 4 transaction: **89 min wall time** (5,370.9s) for the 1.29M-row revert + re-materialize on Medium compute.
- **All V-asserts passed inside the transaction** (V1, V2, V3, V7d, V4a, V4b, V4c, V5a, V5b, V5c, V6, V7a, V7b, V7c, V8, plus §7.5 `VALIDATE CONSTRAINT`).
- **Post-COMMIT cache verified correct** via read-only probe (`scripts/investigate-phase1-post-commit.js`):
  - 12,621 Whitby community condo/home listings route to King Shah @ scope='community' (all 11 carves: Blue Grass Meadows 1217, Brooklin 1543, Downtown Whitby 1210, Lynde Creek 834, Port Whitby 1255, Pringle Creek 1591, Rolling Acres 1186, Rural Whitby 1870, Taunton North 771, Whitby Industrial 13, Williamsburg 1131 — zero mismatches).
  - 2 Commercial pins preserved: Neo Smith @ scope='municipality' with `assigned_source_id` set to the Neo Smith Whitby-muni apa row.
  - 1,284,892 condo/home listings at scope='floor' across 3 WALLiam pool agents — 3-way hash split: 428,444 / 428,259 / 428,189 (delta < 0.06%).
  - V3 coupled-state invariant holds (zero violations).
- **63 post-COMMIT smoke regressions identified as false positives** — all 63 are in carve samples. 58 "agent changed" reflect v15 floor-pool picks correctly being replaced by v16 community carves (expected); 5 "wrong scope" are Whitby muni baseline samples that the runner's baseline-capture incorrectly expected at scope='municipality' (they're inside community carves, community precedence wins). Cache is correct; runner's baseline-capture has a latent bug to fix in a future runner revision.
- **34 NULL condo/home rows accumulated in 1h38m post-COMMIT** — this is the resolve-at-insert gap (Decision A) confirmed as the live drift source. Tracked as F-RESOLVE-AT-INSERT-PRIORITY (PART 5).
- GAP-6 read-path timing: 1.88s for 17 rows in one Whitby community — slow; worth investigating separately when Phase 2 starts wiring readers.
- Migration `.sql` files and apply-runner remain untracked in git (no git commit of the artifacts themselves; the DB COMMIT is the source of truth).

### Phase 2 — CLOSED 2026-05-29 (cache-first reader wiring + tenant-scope fix)

Phase 2 wires the 7 cache-first eligible callers of `resolve_agent_for_context` to read `mls_listings.assigned_agent_id` before falling through to the RPC. Cache-first reads JOIN against `agents.tenant_id` filtered by the caller's tenant_id — cross-tenant cached agents are treated as cache-miss and fall through to the RPC's already-tenant-scoped path. **Frozen contract preserved**: RPC body + signature untouched across all 5 commits.

Commit chain (on `main`, not pushed):
- EDIT A `7b5a59c` — `lib/utils/tenant-resolver.ts` (wrapper used by 5 geo-page renders)
- EDIT B `4170ba6` — `lib/actions/leads.ts` (leads helper)
- EDITs C.1–C.4 `cfc3710` — charlie/lead, walliam/contact, walliam/estimator/session, walliam/charlie/session (4 API routes, single batched commit)
- EDIT C.5 `da86f13` — walliam/assign-user-agent (cache-first + provenance-based source-label switch on `assigned_scope`; uses snake_case `auto_floor` per operator clarification)
- EDIT D `748ddd8` — tenant-scope fix across all 7 files (closes F-PHASE2-CACHE-NOT-TENANT-SCOPED)

Smoke outcomes (E2E + EDIT D fix-proof):
- CARVED (WALLiam POST on Brooklin condo `f8a24890`): PASS — King Shah returned. Cache-first short-circuits RPC, verified via dev log: `[session] route hit` without `[session] calling rpc`.
- FLOOR (WALLiam POST on non-Whitby condo): PASS — Neo Smith returned (exact pre-named UUID from cache, not "a floor agent").
- **CROSS-TENANT (aily POST on WALLiam-cached `f8a24890`): FAILED on E2E → empirical fix-proof for F-PHASE2-CACHE-NOT-TENANT-SCOPED in EDIT D smoke.** Pre-EDIT-D `lead.tenant_id = aily, lead.agent_id = King Shah` (WALLiam agent — the leak). Post-EDIT-D `lead.tenant_id = aily, lead.agent_id = NULL` (cache-first INNER JOIN filtered cross-tenant agent → fell through to RPC → RPC tenant-filter returned null → graceful admin-routed lead).
- NULL-CACHE (WALLiam POST on `assigned_agent_id IS NULL` listing): PASS-with-caveat — `walliam/contact` returned graceful null-agent lead; same listing on `assign-user-agent` path hits F-FLOOR-POOL-PERMISSION-DENIED (pre-existing bug, bounded to NULL-cache, NOT a Phase 2 regression).

Smoke artifacts purged 2026-05-29: 13 leads (9 `phase2-smoke` + 4 `phase2-edit-d-smoke`) deleted in one transaction with strict-13 affected-row assertion (pre-tx count 13 → in-tx delete 13 → in-tx verify 0 → COMMIT → post-tx live verify 0).

### P-LIFECYCLE — IN PROGRESS (Landing 1 closed 2026-05-29)

P-LIFECYCLE wires the 7 lifecycle events from PART 1's Event Lifecycle table. Recon (`phase-lifecycle-recon-output.txt`) found Events 1-3 (operator distribute/assign/remove-carve) already covered by Phase 1's `agent_property_access` AFTER triggers + admin-homes API routes; Events 4-7 + the F-FLOOR-POOL-PERMISSION-DENIED grant-layer fix are the active scope. Three independently-shippable landings, recommended order 1 → 2 → 3:

- **Landing 1 — F-FLOOR-POOL-PERMISSION-DENIED fix: CLOSED 2026-05-29, commit `4e69773`.**
  - `ALTER FUNCTION pick_floor_agent SECURITY DEFINER SET search_path = public, pg_temp`.
  - Root cause: `tenant_floor_pool` had grants ONLY for postgres + an RLS policy keyed on `auth.uid()` which evaluates to empty for server-side service-role callers. The resolver chain (`resolve_agent_for_context` -> `pick_floor_agent` -> SELECT `tenant_floor_pool`) ran as INVOKER and hit "permission denied for table tenant_floor_pool" at the table-grant layer before RLS even applied.
  - SECURITY DEFINER moves the floor SELECT to postgres privileges for the function's body only; INVOKER chain elsewhere preserved. Safe because Phase 2 EDIT D validated every cache-miss caller passes `p_tenant_id` from a validated request context (preconditions documented in `phase-lifecycle-landing-1-precondition.txt`, both PASS).
  - Empirical fix-proof inside the migration transaction:
    - V4: `SET LOCAL ROLE service_role; SELECT pick_floor_agent(...)` -> Neo Smith `f2ce3011-...`. Pre-ALTER the same call raised the permission-denied error.
    - V5: same probe escalated through the full `resolve_agent_for_context` chain -> returns non-null. End-to-end resolver path unblocked under service_role.
  - 5 V-asserts (V1 prosecdef flipped, V2 search_path locked, V3 postgres sanity, V4 service_role probe, V5 end-to-end) all PASS inside the same transaction; COMMIT followed.
  - Rollback-snapshot of pre-ALTER `pick_floor_agent` definition captured: `supabase/migrations/rollback-snapshots/_phase-lifecycle-landing-1_pick_floor_agent_2026-05-29T16-35-25-864Z.sql`.
  - Down-migration on disk (`20260529_phase_lifecycle_landing_1_down.sql`): `ALTER FUNCTION ... SECURITY INVOKER RESET search_path` + restored comment.

- **Landing 2 — Event 5 + Event 6: resolve-at-insert + geo-change re-resolve. OPEN.**
  - Wire `reresolve_listing(p_listing_id, p_tenant_id)` (already exists, body 1121 bytes) into `lib/homes-save.ts` + `lib/condos-save.ts` after the upsert (Event 5) and on geo-diff (Event 6).
  - Closes F-RESOLVE-AT-INSERT-PRIORITY (drift rate measured ~15.2 NULL/hour steady, ~360/day).

- **Landing 3 — Event 4 + Event 7: deactivation reflow + nightly reconcile. OPEN.**
  - `agents.is_active` UPDATE trigger -> enqueue scoped reroll to `territory_reroll_queue`.
  - New `reconcile_corrections` table (per GAP-4) + GitHub Actions cron workflow (pg_cron is not installed on this Supabase project; reconcile must run external).
  - Threshold alert: > 50 corrections/run signals a missing mutation trigger.

---

# PART 4 — CONDENSED HISTORY

- **v1–v10 (2026-05-26/27):** P1 through P5.3 shipped. P5.3 (per-property-type resolved owner + source tier in GeographyView) CLOSED at commit `658ab62`.
- **v11–v13 (2026-05-27):** P-FLOOR opened. 3-round read-only recon resolved 9 Q-blocks. Confirmed: resolver terminates at `RETURN NULL` (no live P9/P10 fallback); `pick_routing_agent_for_type` honours condo/homes flags but not buildings; WALLiam apa = 1 muni + 11 community carves (deliberate, not phantom); Syed Shah is platform-tier (tenant_id NULL). Design D1–D6 locked (later generalized in v16).
- **v15 (2026-05-27):** Narrow floor migration APPLIED (18/18 verification checks, committed): `tenant_floor_pool`, `tenant_floor_alerts`, `pick_floor_agent`, resolver floor branch, `reroll_listings_at_floor`, audit/queue triggers, RLS, CHECK extensions. WALLiam pool seeded (3 agents; audit fired 3×; queue deduped to 1). Condo backfill ran (493,827 rows, even 3-way split) — to be reverted under v16. Homes backfill died mid-run (connection drop). BOM-strip fix applied to apply-runner.
- **v16 (2026-05-28):** Comprehensive long-term model LOCKED (Part 1). Narrow floor reframed as the unified routing-set primitive. Materialized-on-demand chosen over live-resolver. Sticky bindings, precedence-by-stored-scope, 7-event lifecycle defined. Two diagrams produced (resolution hierarchy, routing lifecycle). v15 reconciliation recorded (Part 2). GAP guards 2–6 added; cold-start checklist + mandatory tracker-update step (7) added to the EXECUTION PROTOCOL. Launch-readiness checklist (Part 7) and dashboard/launch-readiness gaps (GAP-7, GAP-8) recorded.
- **v17 (2026-05-28):** Cold-start investigation found the v15 homes backfill DB-committed despite the client logging "connection died mid-run" — a client-disconnect-after-commit. 799,688 homes were filled by `reroll_listings_at_floor`, not NULL as v15 recorded. P-REVERT-BACKFILL scope corrected to ~1.29M (495,428 condos + 799,688 homes). LESSON: a committed-server-side / failed-client-side transaction is why tracker memory and live DB diverged — the cold-start DB check is what caught it.
- **v18 (2026-05-28):** Phase 1 migration package finalized after recon + plan + 4 plan-review fixes + 3 SQL fixes (em-dashes, V7a tightened, V7d coverage diagnostic) + 2 down-migration fixes (em-dashes, NULL-safe NOT EXISTS). Three files on disk: up-migration (561 lines), down-migration (129 lines), apply-runner (427 lines). All reviewed, ASCII-clean, gated by `Bash(node scripts/apply-*)` ask permission. Pre-execution credential leak surfaced via Grep output_mode on `.env.local` — password rotated, lesson captured. NOT executed yet; pending operator approval after Supabase compute upgrade.
- **v19 (2026-05-29):** Phase 1 SHIPPED. DB-COMMITted on attempt 4 after three rolled-back attempts (V2 coupled-CHECK pre-population fixed via NOT VALID + later VALIDATE; V5a empty-target-set fixed via vacuous-pass Option C; direct-host DNS unresolvable for this project fixed by switching to session pooler + relaxing runner pooler-heuristic to port 6543 only). 89 min wall time. Cache verified v16-correct: 12,621 Whitby community listings → King Shah @ scope='community' (11/11 carves clean); 2 Commercial pins preserved; 1,284,892 condo/home at scope='floor' (3-way hash split, delta < 0.06%); V3 coupled-state invariant holds. 63 post-COMMIT smoke "regressions" identified as false positives (v15→v16 expected transitions + a baseline-capture bug in the runner). 34 NULL condo/home rows accumulated in 1h38m post-COMMIT — confirms resolve-at-insert as the live gap (F-RESOLVE-AT-INSERT-PRIORITY, elevated). Four lessons captured in PART 6.
- **v20 (2026-05-29):** Phase 2 SHIPPED — cache-first reader wiring complete across 7 files (wrapper + leads helper + 5 API routes), with tenant-scope fix. 5 commits: EDIT A `7b5a59c`, EDIT B `4170ba6`, EDITs C.1–C.4 `cfc3710`, EDIT C.5 `da86f13`, EDIT D `748ddd8`. New finding **F-PHASE2-CACHE-NOT-TENANT-SCOPED** surfaced in E2E smoke S3 (cross-tenant cache leak: aily POST against a WALLiam-cached listing returned a WALLiam agent through the cache-first shortcut, because the initial preamble keyed on `listing_id` alone with no tenant filter) and **closed in the same phase via EDIT D** (cache-first INNER JOIN on `agents.tenant_id` filtered by caller's tenant_id). Empirical fix-proof on same call shape (aily POST + listing `f8a24890`): pre-EDIT-D `agent_id = King Shah` → post-EDIT-D `agent_id = NULL`. **F-FLOOR-POOL-PERMISSION-DENIED** filed as a bounded pre-existing bug (only reachable via NULL-cache path through `assign-user-agent`; resolved as a side-effect by P-LIFECYCLE's resolve-at-insert hook). 13 smoke leads purged in one strict-asserted transaction. The "9 production callers" count from v18 corrected to 13 + 1 placeholder (7 cache-first eligible, 6 RPC-only). Three lessons captured in PART 6.
- **v21 (2026-05-29):** P-LIFECYCLE Landing 1 SHIPPED — `pick_floor_agent` flipped to SECURITY DEFINER with locked `search_path = public, pg_temp`. Closes **F-FLOOR-POOL-PERMISSION-DENIED** earlier than v20 anticipated (v20 expected it would be resolved as a side-effect of Landing 2's resolve-at-insert; Landing 1 instead addresses the grant layer directly, surgically, and ships independently). Recon (`phase-lifecycle-recon-output.txt`) confirmed Events 1-3 already covered by Phase 1's apa AFTER triggers, narrowing P-LIFECYCLE active scope to Landings 1-3 (grant fix, resolve-at-insert + geo-diff, deactivation + reconcile). Preconditions PASSED (both): (a) zero application code calls `pick_floor_agent` directly - only DB-internal callers (`resolve_agent_for_context`, `reroll_listings_at_floor`), both SECURITY INVOKER, both honor the validated-tenant-id contract via Phase 2 EDIT D's audit; (b) `pick_floor_agent` body uses no `auth.uid()` / `current_user` / `session_user` / `current_setting` - purely parameter-driven, so the INVOKER->DEFINER->INVOKER chain doesn't break caller auth context. Empirical fix-proof inside the same transaction: V4 `SET LOCAL ROLE service_role; SELECT pick_floor_agent(...)` returned Neo Smith (`f2ce3011-...`); V5 escalation through `resolve_agent_for_context` confirmed end-to-end. 1 commit: `4e69773`. Rollback-snapshot captured pre-BEGIN. NULL-cache growth measured at ~15.2/hour steady (~360/day) - elevates Landing 2 (resolve-at-insert + geo-diff) as next priority. One lesson captured in PART 6.

---

# PART 5 — OPEN FINDINGS / INDEPENDENT ITEMS

- **F-WALLIAM-CREDS-PLACEHOLDER-IN-DB** — During v15 recon, a `SELECT *` on `tenants` leaked WALLiam's Anthropic + Resend keys to a chat transcript; two subsequent placeholder UPDATEs overwrote the real keys with literal placeholder strings. Current state: `tenants.anthropic_api_key` and `tenants.resend_api_key` for WALLiam hold placeholder text, NOT valid credentials. WALLiam Charlie + Resend are auth-broken until restored. **Resolution: operator restores via Supabase Studio Table Editor (GUI), pasting valid keys into the two cells.** `.env.local` `RESEND_API_KEY` matches the original Resend value (can restore from there). Anthropic key: operator's choice between the original (recoverable, but was leaked) or a freshly generated key. INDEPENDENT of routing work — does not block the build, but blocks WALLiam production launch.
- **F-CASCADE-BUILDINGS-ACCESS-IGNORED** — `pick_routing_agent_for_type` honours condo/homes flags but has no buildings parameter; `buildings_access` on apa rows is currently decorative. Decide whether building-tier carving needs the flag wired (relevant to P-ROUTING-SET).
- **F-AUDIT-ORIGINATOR-WRITE-GAP** — partially fixed for the floor-pool surface (`handle_tenant_floor_pool_change` writes `changed_by = auth.uid()`). Other mutation surfaces may still not record originator. Sweep before launch.
- **F-HOMES-FILLED-UNEXPECTEDLY (RESOLVED 2026-05-28 — confirmed v15 backfill committed despite client disconnect)** — Cold-start check 2026-05-28 found 799,688 of 801,325 homes (99.8%) have `assigned_agent_id` filled, contradicting the tracker's claim that homes were never backfilled ("connection died mid-run — already clean NULL"). ~787K filled home rows are unaccounted for. Source unknown — three candidates: (a) the v15 homes backfill actually completed/partial-committed further than logged, (b) an unrecorded later backfill ran, (c) a trigger or the nightly sync is filling homes on insert/update. Changes P-REVERT-BACKFILL scope: currently ~493,827 condos; if homes are also listing-level picks, scope is ~1.29M, and GAP-3's down-migration must account for them. RESOLUTION: read-only investigation FIRST. Do NOT write any migration, amend the revert scope, or correct PART 2's homes number until the source is identified. RESOLVED: source is the v15 reroll_listings_at_floor homes run; same listing-level pick_floor_agent picks as condos. Revert scope corrected to ~1.29M (495,428 condos + 799,688 homes).
- **F-AILY-CROSS-TENANT-SMOKE-DEFERRED** — V6 cross-tenant isolation assertion is structurally correct but vacuous because aily has no routing data today. Real smoke deferred until aily has actual agents + routing-set rows. Do NOT add synthetic aily agents to the production agents table via migration SQL (credentials-bearing table).
- **F-RESOLVE-AT-INSERT-PRIORITY (active gap, elevated to next major phase after Phase 2)** — 34 NULL condo/home rows accumulated in 1h38m between Phase 1 COMMIT (2026-05-29 10:04 UTC) and the post-COMMIT verification probe. Cause: no resolve-at-insert hook — `assigned_agent_id` is left NULL on every new MLS row inserted by nightly sync (verified in P-MODEL-recon Q5: `lib/homes-save.ts` does not write the column; no insert trigger fills it). Confirms decision-A (resolve-at-insert) from the v16 model is no longer architectural future-work — it is the active drift source producing daily NULL accumulation. P-LIFECYCLE is now the highest-priority phase after Phase 2 reader-wiring; without it, the materialized cache silently grows holes that Phase 2 readers would fall back to the live resolver for (slow path), undermining Phase 2's read-path optimization.

- **F-PHASE2-CACHE-NOT-TENANT-SCOPED (RESOLVED 2026-05-29, EDIT D `748ddd8`)** — Phase 2's initial cache-first preamble (EDITs A/B/C in commits `7b5a59c`, `4170ba6`, `cfc3710`, `da86f13`) read `mls_listings.assigned_agent_id` by `listing_id` only with no tenant filter, bypassing the tenant scoping that `resolve_agent_for_context.p_tenant_id` enforced on the path it shortcut. Surfaced in E2E smoke S3: an aily POST on WALLiam-cached listing `f8a24890` returned a WALLiam agent (King Shah) into an aily lead. Architectural blast radius significant (reintroduces the v15-era tenant-leak class); practical blast radius today zero (aily has no production traffic). **RESOLUTION:** EDIT D rewrote the cache-first SELECT across all 7 files to INNER JOIN `agents` with `agents.tenant_id = caller_tenant_id` — cross-tenant cached agents become cache-miss and fall through to the RPC's already-tenant-scoped path. Selects only `tenant_id` from `agents` (respects no-`SELECT *`-on-`agents` rule). FK hint syntax (`agents!mls_listings_assigned_agent_id_fkey!inner`) mirrors the existing pattern in the codebase. **Empirical fix-proof** (same listing `f8a24890`, same aily POST shape, same call): pre-EDIT-D `lead.agent_id = fafcd5b1... (King Shah)` → post-EDIT-D `lead.agent_id = NULL`. Within-tenant cache-first preserved (S2: WALLiam POST → King Shah, cache-first short-circuits RPC, verified via `[session] route hit` log without `[session] calling rpc`).

- **F-FLOOR-POOL-PERMISSION-DENIED (RESOLVED 2026-05-29, P-LIFECYCLE Landing 1 `4e69773`)** — Surfaced in EDIT C.5 sub-smoke 2 and re-confirmed during E2E S4: POST to `/api/walliam/assign-user-agent` with a `listing_id` whose cache is NULL returned HTTP 500 "permission denied for table `tenant_floor_pool`". Root cause (recon-confirmed in `phase-lifecycle-recon-output.txt`): two compounding issues. (1) `tenant_floor_pool` had grants ONLY for the postgres superuser - no SELECT for service_role; (2) the single RLS policy `tfp_read_own_tenant` filtered on `auth.uid()` which is NULL for any server-side caller without a tenant_users JWT, evaluating the IN-subquery to empty. The grant-layer check fires before RLS, so even adding a service_role grant wouldn't have unblocked the existing RLS path. **RESOLUTION:** P-LIFECYCLE Landing 1 ran `ALTER FUNCTION pick_floor_agent SECURITY DEFINER SET search_path = public, pg_temp`. Function body now runs with the owner's (postgres) privileges for its `tenant_floor_pool` SELECT, bypassing both the missing grant AND the auth.uid-keyed policy in one move. Surgical: only `pick_floor_agent` changed; resolver chain elsewhere remains SECURITY INVOKER. **Empirical fix-proof (V4 inside migration transaction):** `SET LOCAL ROLE service_role; SELECT pick_floor_agent(FLOOR_LISTING, WALLiam, true, false)` returned Neo Smith `f2ce3011-...`; pre-ALTER the same call raised the permission-denied error. V5 escalation through `resolve_agent_for_context` confirmed the end-to-end resolver chain works under service_role.

- **GAP-7-DASHBOARD-UNDERSPECIFIED** — P-DASHBOARD is currently a wish ("run distributions, view coverage, assignment-vs-default per geo, see floor alerts"), not a spec. It needs its own design pass BEFORE building — what views, what operator actions, what the day-to-day workflow is — the same way the routing model needed one. When Claude Code reaches P-DASHBOARD, it should NOT guess the UI; it should stop and request a design pass (operator returns to design discussion, produces a dashboard spec, adds it here). Do not build the dashboard from this one-line description.

- **GAP-8-LAUNCH-READINESS-UNDEFINED** — "P-COMMIT done" is NOT "ready for first paid customer." See PART 7 launch-readiness checklist. Committed routing code is necessary but not sufficient. Do not conflate build-complete with launch-ready.

---

# PART 6 — PROCESS LESSONS (carry forward)

- **No placeholders in SQL string-literal position** — Postgres treats `'REPLACE_ME'` as a valid value; the UPDATE succeeds with garbage. Use parameterized queries, GUI for credentials, or syntactically-invalid sentinels outside quotes.
- **Never `SELECT *` on credential-bearing tables** (`tenants`, `agents`) — leaks secrets to output/logs. Explicit column allow-lists; fingerprint-only display of any secret.
- **Credential writes use the GUI** (Supabase Studio Table Editor), never chat-drafted SQL.
- **Leak response is proportionate, not rushed** — confirm scope, ask the user rotate-vs-accept, execute carefully with GUI, verify by fingerprint. Rushed remediation caused more damage than the leak.
- **PowerShell `Set-Content -Encoding UTF8` writes a BOM** — strip it when reading SQL in Node (`if (s.charCodeAt(0)===0xFEFF) s=s.slice(1)`), or write no-BOM via `[System.IO.File]::WriteAllText(path, content, [System.Text.UTF8Encoding]::new($false))`.
- **Probe geo table names before join-heavy recon** — the table is `treb_areas`, not `areas`; assuming crashed a script.
- **Large set-based UPDATEs on `mls_listings` exceed the 60s pool timeout** — disable `statement_timeout` for those sessions, and consider that 1.28M-row operations take real time; prefer scoped/batched work and the materialized model that avoids mass rewrites entirely.
- **Recon over memory** — prior tracker text is hypothesis until verified against the live DB. Probe before designing.
- **JSX:** raw `->` is invalid (TS1382); use `{'->'}`. Anchors must be ASCII; detect CRLF vs LF.
- **Client disconnect ≠ DB rollback (v17 lesson, 2026-05-28)** — a committed-server-side / failed-client-side transaction is why tracker memory and live DB diverged — the cold-start DB check is what caught it.
- **Credential leak via Grep output_mode (v18 lesson, 2026-05-28)** — Grepping `^DATABASE_URL=` with `output_mode=content` echoed the full DB password into the chat transcript despite an explicit "do not print" instruction. Safe pattern for credential checks: a Node script that reads, classifies, and prints ONLY a binary verdict (e.g. "direct"/"pooler"/"missing") — never the raw value. Never grep with content output on `.env.local` or any credentials file.
- **Verification asserts must test invariants, not data assumptions (v19 lesson, 2026-05-29)** — `ASSERT count > 0` on set X only works if the v16 model guarantees X is non-empty. Audit every assert with the question "what happens if the data shape shifts by 1%?". If the answer is "the assert false-fails", reformulate as a relational invariant (e.g. `filled = condo+home + filled-commercial`) or a conditional-vacuous structure (e.g. `IF target_set_non_empty THEN assert correctness ELSE pass vacuously`). Caught at V5a after Phase 1 attempt 2: King Shah's 11 community carves are exhaustive of Whitby muni, so the V5a target set is empty; the original `ASSERT v_n > 0` could never pass against today's data. Same audit class hit V4b (hardcoded count range), V5b (hardcoded =11), V5c (hardcoded =2) — all reformulated.
- **Post-COMMIT smoke baselines must distinguish intended-change vs unintended-change (v19 lesson, 2026-05-29)** — comparing pre-migration state to post-migration state and flagging any difference as "regression" produces noise when the migration is meant to produce different state. Smoke needs migration-intent awareness: the baseline must capture which rows are EXPECTED to change and assert the new value matches resolver output (GAP-2), not just "differs from baseline". Caught at Phase 1 attempt 4: 63 false-positive carve-sample regressions (58 expected v15→v16 agent changes + 5 muni-carve baseline samples that the capture logic incorrectly expected to stay at scope='municipality' when they're inside community carves).
- **Session pooler vs transaction pooler (v19 lesson, 2026-05-29)** — Supabase port 5432 (session pooler) allocates one server connection per client session for the session's duration, so `SET LOCAL statement_timeout` persists across statements; port 6543 (transaction pooler) resets server state between statements and breaks `SET LOCAL`. The "pooler" substring in the hostname alone is not the discriminator — port is. Caught at Phase 1 attempt 3: this Supabase project does not expose a direct-host endpoint at all (`db.<projref>.supabase.co` is not in DNS — newer Supabase projects are pooler-only), so the apply-runner's original "reject any pooler" heuristic locked us out. Runner's check relaxed to reject port 6543 only.
- **Two-phase constraints when the migration populates the data (v19 lesson, 2026-05-29)** — `ADD CONSTRAINT … CHECK (…)` validates the constraint against pre-existing data at constraint-creation time. When the migration itself populates the data that satisfies the constraint, use `ADD CONSTRAINT … NOT VALID` (enforces the constraint on every subsequent write but skips back-validation) followed by `ALTER TABLE … VALIDATE CONSTRAINT` AFTER the population step. Caught at Phase 1 attempt 1: the coupled `mls_listings_assigned_coupled_check` ((agent NULL ⇔ scope NULL)) validated against 1.29M existing rows whose newly-added `assigned_scope` column was NULL while `assigned_agent_id` was non-NULL — instant failure before any population statement ran.
- **Cache-first abstractions must preserve the security filters of the path they bypass (v20 lesson, 2026-05-29)** — Phase 2's initial cache reads keyed only on `listing_id` reintroduced the tenant-leak class that `resolve_agent_for_context.p_tenant_id` was designed to prevent. When wiring a fast path that skips an existing secure path, the new path must enforce every filter the old path enforced — auth, tenant scope, RLS. Bypassed filters are bypassed protections. Caught at E2E S3 when an aily POST on a WALLiam-cached listing returned a WALLiam agent through the cache-first shortcut; closed in EDIT D by adding INNER JOIN on `agents.tenant_id` filtered by caller's tenant. Generalizable check before shipping any cache/index/denormalization that bypasses an RPC or view: list every filter that path enforced (auth, tenant, RLS, soft-delete, active-flag) and confirm the fast path enforces each one — or document why each is structurally unnecessary on the fast path.
- **Vacuous assertions hide real bugs (v20 lesson, 2026-05-29)** — Phase 1's V6 cross-tenant isolation ASSERT was structurally correct but vacuous because aily had no routing data at the time it ran. It passed because nothing could fail it, not because the system was correct. F-PHASE2-CACHE-NOT-TENANT-SCOPED was only catchable by actually attempting a cross-tenant POST in Phase 2 E2E. Assertions whose failure mode requires non-empty data must be exercised with that data, not just declared. For every "isolation" or "scope" ASSERT, add a live smoke that posts cross-boundary traffic — synthetic-but-realistic if production has no traffic on one side of the boundary. A passing vacuous ASSERT is not evidence the system is correct.
- **E2E smoke must verify the WHOLE pipeline, not just the surface (v20 lesson, 2026-05-29)** — Phase 2 E2E S3 only failed because the lead row was inspected post-creation, not because the route returned a wrong value (the route returned HTTP 200 with a leadId — looked fine). A smoke checking only the API response would have missed the leak entirely. Test the full pipeline: resolve → stamp → email recipient → audit trail. Surface-only smokes (HTTP status + return body) are not E2E. The standing rule: for every smoke that exercises a write-path, query the resulting persisted state and assert against expected tenant/owner/scope, not just against API-level success.
- **SECURITY DEFINER as a surgical grant-layer fix when the caller chain already enforces the relevant input filters (v21 lesson, 2026-05-29)** — F-FLOOR-POOL-PERMISSION-DENIED was a grant-layer block: `tenant_floor_pool` had grants only for postgres, and the RLS policy keyed on `auth.uid()` evaluated to empty for server-side callers. Two viable fix shapes were on the table: (a) GRANT SELECT to service_role + reframe the RLS policy, or (b) `ALTER FUNCTION pick_floor_agent SECURITY DEFINER` so its body runs with owner privileges. (b) was chosen as surgical: only the one helper function changes; resolver chain elsewhere stays INVOKER; no policy rewrite. The cost is that SECURITY DEFINER moves security-of-the-input from the DB layer to the app layer: the function trusts its `p_tenant_id` parameter unconditionally, so every caller MUST source `p_tenant_id` from a validated request context (header, tenant-scoped body field, middleware-derived) and never from raw user input. Document the contract on the function (via COMMENT) and audit every caller before applying SECURITY DEFINER. Generalizable rule: SECURITY DEFINER is appropriate when (1) the function body has no internal auth-dependent logic (no `auth.uid()`, no `current_user`), (2) every caller is auditable, and (3) the caller chain already validates the function's inputs at a higher layer. Lock `search_path = public, pg_temp` to prevent search-path-injection attacks on the elevated body. Recon (`phase-lifecycle-landing-1-precondition.txt`) verified all three for Landing 1; (1) was bytes of `prosrc` grep, (2) was the Phase 2 audit + a code-side grep showing zero direct callers, (3) was Phase 2 EDIT D's caller contract.

---

# PART 7 — LAUNCH-READINESS CHECKLIST (WALLiam first paid customer)

The routing build is one input to launch, not launch itself. WALLiam is ready for its first paid customer only when ALL of these are true and verified (not assumed):

- [x] Routing build complete: Phase 1 + Phase 2 closed 2026-05-29. (Phase 1: P-ROUTING-SET + P-MATERIALIZE + P-REVERT-BACKFILL bundled atomic; cache verified v16-correct. Phase 2: cache-first reader wiring across 7 files, tenant-scoped via EDIT D `748ddd8`. P-LIFECYCLE remaining: resolve-at-insert + scoped re-materialization + reconcile.)
- [ ] **F-WALLIAM-CREDS-PLACEHOLDER-IN-DB resolved** — `tenants.anthropic_api_key` and `tenants.resend_api_key` for WALLiam hold VALID keys (verified by fingerprint + a live Charlie test + a live Resend send), not placeholder strings. (Quick win — restore via Supabase Studio Table Editor now to clear it.)
- [ ] Dashboard built (after its design pass — GAP-7) so the operator can actually run distributions and see coverage.
- [ ] End-to-end lead flow verified live: a lead submitted on a WALLiam page → resolves to the correct agent → stamped → email + BCC fire up the hierarchy chain → appears in the workbench. Test on a real WALLiam geo, both a carved one (Whitby) and an uncarved one (floor).
- [ ] Materialized read path scale-tested (GAP-6) — geo page render time acceptable.
- [ ] Reconcile job running and its corrections-log near zero (proves triggers are catching everything).
- [ ] Paddle KYC complete (EXTERNAL dependency — per project memory, running in parallel; not a code task but a launch gate).
- [ ] No P0/P1 open findings in PART 5.

Build-complete (P-COMMIT) ticks the first box only. The rest are real launch gates.