// scripts/patch-tracker-v11.js
//
// W-TERRITORY-TRACKER comprehensive patch: v9 -> v11.
//
// Combines the never-applied v10 patch with the v11 patch into a single
// atomic operation. Applies directly from v9 state.
//
// Why combined: scripts/patch-tracker-v10.js (committed as 08bfe76) contains
// a duplicated-endAnchor bug in its span-replace patches. It was committed
// but never run successfully against the tracker; the tracker is still at
// v9 state. Rather than fix and re-run v10 then run v11, this script applies
// all v9 -> v11 changes in one go. The buggy v10 script remains on disk as
// a historical artifact (already in git history).
//
// What this captures:
//   v10 work (committed 2026-05-07 11:03 in 08bfe76):
//     - T6-followup-A CLOSED (race-safety harness, 3/3 PASS)
//     - F-RACE-DEADLOCK closed in-flight (autocommit pattern)
//     - F-APA-NEIGHBOURHOOD-CHECK logged + decision-locked (option a)
//   v11 work (committed across 832f222 + 946df62):
//     - F-APA-NEIGHBOURHOOD-CHECK migration shipped to production
//     - T6-followup-B CLOSED (3/3 PASS area/community/neighbourhood)
//     - T6-followup-C CLOSED (PASS after audit-gap fix)
//     - F-APA-UPDATE-AUDIT-GAP discovered + fixed (handle_apa_* triggers)
//
// Patches applied:
//   P1. Status line: v9 -> v11
//   P2. Insert v10 + v11 status log entries above v9 entry
//   P3. Next action header sentence
//   P4. Next Action Section 1 (T6-followup-A -> T4a Admin UI)
//   P5. Next Action Section 2 (T6-followup-B -> T4b Public Geo Display)
//   P6. Next Action Section 3 + "After T6-followup-A/B/C close:" subsection
//       -> T7 Close ticket
//   P7. T6 phase header marker (RECOMMENDED NEXT -> CLOSED 2026-05-07)
//   P8. Findings: append F-APA-NEIGHBOURHOOD-CHECK + F-APA-UPDATE-AUDIT-GAP
//       + F-RACE-DEADLOCK findings
//   P9. Workflow rules: append 3 new patterns (concurrency, audit-on-state,
//       probe-then-patch)
//
// Pre-flight: requires v9 state (v9 status line text present, no v10/v11
// markers).
// Idempotent: skips if V11_MARKER already present.
// Atomic: all patches in memory, file written once at end if all succeed.

const fs = require('fs');
const path = require('path');

const TRACKER = path.join('docs', 'W-TERRITORY-TRACKER.md');

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(TRACKER)) {
  fail(TRACKER + ' not found at ' + path.resolve(TRACKER));
}

const original = fs.readFileSync(TRACKER, 'utf8');

// Markers
const V11_MARKER = '- **2026-05-07 v11**';
const V9_PREFLIGHT = '**Status:** **T6 CORE PASS + F-AREA-REROLL CLOSED 2026-05-06.**';

// Idempotency
if (original.indexOf(V11_MARKER) !== -1) {
  console.log('SKIP: V11_MARKER already present in tracker. No-op.');
  process.exit(0);
}

// Pre-flight
if (original.indexOf(V9_PREFLIGHT) === -1) {
  fail(
    'v9 state not detected. Expected status line containing: ' + V9_PREFLIGHT +
    '. If the tracker has been modified independently, review state before re-running.'
  );
}

// Backup
const now = new Date();
const pad = function (n) { return String(n).padStart(2, '0'); };
const stamp =
  now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' +
  pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
const backupPath = TRACKER + '.backup_' + stamp;
fs.writeFileSync(backupPath, original);
console.log('Backup: ' + backupPath + ' (' + original.length + ' chars)');

// Use CRLF to match file's line endings (verified via probe: 389 CRLF, 0 LF-only).
const NL = '\r\n';

// ===========================================================================
// Patch content
// ===========================================================================

// ---- P1: Status line replacement ----

const P1_OLD =
  "**Status:** **T6 CORE PASS + F-AREA-REROLL CLOSED 2026-05-06.** All 6 T6 tests verified PASS under Supabase's default `statement_timeout` (no override) after deploying the set-based reroll/distribute fix to production. F-AREA-REROLL-TIMEOUT closed: `reroll_listings_at_geo` and `distribute_listings_at_geo` rewritten from row-by-row loops to single CTE-based UPDATE statements; identical hash-distribute semantics, identical signatures, ~200x fewer SQL operations per call. T6-decision LOCKED at (b): accept on-demand resolver fallback for `mls_listings.assigned_agent_id IS NULL`; no INSERT trigger on `mls_listings`. T1, T2a, T3a, T3b, T6-core, F-AREA-REROLL, T6-decision all closed. Three followups remain for full T6 closure: T6-followup-A (race safety harness), B (multi-level cascade resolver tests), C (`is_active` flip fires reroll). **Next:** ship T6-followup-A/B/C, then T4a/T4b UI.";

const P1_NEW =
  "**Status:** **T6 FULL CLOSURE 2026-05-07.** Race-safety verified (T6-followup-A v10, 3/3 PASS), multi-level cascade resolver verified at all four scope levels (T6-followup-B v11, 3/3 PASS area/community/neighbourhood), is_active flip fires reroll AND audit (T6-followup-C v11, PASS). F-RACE-DEADLOCK closed in-flight (autocommit pattern in race harness — explicit BEGIN/COMMIT inside Promise.allSettled deadlocked at the application layer when triggers acquire xact-scoped advisory locks). F-APA-NEIGHBOURHOOD-CHECK closed via ALTER TABLE adding `'neighbourhood'` to `agent_property_access.scope` CHECK constraint (option a per Shah 2026-05-07; resolver/trigger/distribute/partial unique index were already wired for neighbourhood, the CHECK was the only thing preventing rows at that scope). F-APA-UPDATE-AUDIT-GAP discovered during T6-followup-C: `handle_apa_insert/update/delete` triggers were silently rerolling 84,586 mls_listings on a single is_active flip with no audit trail; only `distribute_geo_to_children` was writing audit rows. Fix added audit-row writes for direct apa state changes (assignment_granted on INSERT, assignment_revoked on DELETE / is_active=false flip, paired revoke+grant on agent/scope changes) via CREATE OR REPLACE FUNCTION inside transaction with verify-then-commit. T1, T2a, T3a, T3b, T6 (core + A/B/C), F-AREA-REROLL, F-RACE-DEADLOCK, F-APA-NEIGHBOURHOOD-CHECK, F-APA-UPDATE-AUDIT-GAP all closed. **Database/triggers/resolvers/race safety/audit coverage layer is functionally complete.** Three pieces remain for W-TERRITORY closure: T4a (admin UI at `/admin-homes/territory`), T4b (public geo page primary agent display), T7 (close ticket). **Next:** T4a recon then build, T4b recon then build, T7 close.";

// ---- P2: Insert v10 + v11 status log entries above v9 ----

const P2_ANCHOR = "- **2026-05-06 v9** — **F-AREA-REROLL-TIMEOUT CLOSED + T6-decision LOCKED.**";

const V10_ENTRY_LINES = [
  "- **2026-05-07 v10** — **T6-followup-A CLOSED + F-RACE-DEADLOCK CLOSED + F-APA-NEIGHBOURHOOD-CHECK logged.** Race-safety harness shipped, ran 3/3 PASS against production, T6 followup count drops from 3 to 2.",
  "",
  "  - **Files shipped:**",
  "    - `scripts/probe-race-prereqs.js` — read-only diagnostic. Dumps `distribute_geo_to_children` body, all unique indexes on `agent_property_access` (partial + total), the `scope` CHECK constraint definition, and current apa state for Whitby-area munis. No writes.",
  "    - `scripts/r-territory-t6-followup-race.js` — race-safety harness. Two parallel `pg.Pool` connections each INSERT a muni-scope apa row for Oshawa with a different agent (King Shah vs Neo Smith). Verifies post-state: exactly OSHAWA_EXPECTED_COMMUNITIES (20) primaries, no duplicates, only racing agents present. Cleans up its own writes (apa rows deleted; `mls_listings.assigned_agent_id` updates undone via trigger reroll back to NULL).",
  "",
  "  - **F-RACE-DEADLOCK closed in-flight (autocommit pattern):** First version of the harness wrapped each INSERT in explicit `BEGIN; INSERT; COMMIT;` inside `Promise.allSettled`. Both connections deadlocked at the application layer because Postgres cannot detect a stall where one client holds a transaction open while waiting on its own concurrent client to commit. The fix was to drop the explicit transaction wrapping — autocommit per statement allows the trigger's xact-scoped advisory lock to acquire-and-release within the implicit autocommit boundary, which is what serializes the parallel attempts.",
  "",
  "  - **F-APA-NEIGHBOURHOOD-CHECK logged + decision-locked:** Probe revealed `agent_property_access.scope` CHECK constraint omits `'neighbourhood'` despite resolver/trigger/distribute layers all referencing it. Two resolution options: (a) add `'neighbourhood'` to the CHECK, restoring symmetry implied by every other layer; (b) strip `'neighbourhood'` from the resolver/trigger/distribute layers, locking the system to area/muni/community scope only. **Decision: option (a)** — Shah, 2026-05-07. Rationale: real estate is neighbourhood-driven (Yorkville, The Annex, Liberty Village, Leslieville are primary marketing units in Toronto; agents typically specialise in 2-3 neighbourhoods). Migration tracked v11.",
  "",
  "  - **Test residue (informational, not regression):** ~60 audit rows in `territory_assignment_changes` from 3 race-harness trials (~20 per trial, change_type='primary_set'). Append-only by design; not removable.",
  ""
];

const V11_ENTRY_LINES = [
  "- **2026-05-07 v11** — **T6 FULL CLOSURE + F-APA-NEIGHBOURHOOD-CHECK migration shipped + F-APA-UPDATE-AUDIT-GAP discovered and fixed.** Database / triggers / resolvers / race safety / audit coverage layer is now functionally complete. Only T4a (admin UI), T4b (public geo display), and T7 (close ticket) remain.",
  "",
  "  - **Files shipped this batch:**",
  "    - `scripts/r-territory-f-apa-neighbourhood-check-fix.js` — Node migration runner. Probes the actual CHECK constraint name from `pg_constraint`, validates the discovered name against a safe-identifier regex, verifies pre-state via strict literal-set equality (no extras / no missing), then in one transaction `DROP CONSTRAINT [name]` + `ADD CONSTRAINT [name] CHECK (scope IN ('all', 'area', 'municipality', 'community', 'neighbourhood'))`. Verifies post-state via strict set equality before COMMIT; ROLLBACK on any mismatch. Idempotent (skips if `'neighbourhood'` already in CHECK). Ran clean against production: discovered constraint `agent_property_access_scope_check`; pre-state matched; post-state verified.",
  "    - `scripts/r-territory-t6-followups.js` — multi-level cascade resolver tests (T6-followup-B) + is_active-flip-fires-reroll test (T6-followup-C). Single Node script with 3 area/community/neighbourhood resolver assertions + the is_active-flip test that flips an active apa row to inactive and asserts `mls_listings.assigned_agent_id` for that scope shifts AND a `territory_assignment_changes` audit row lands. Ran 4/4 PASS against production after the audit-gap fix below was applied.",
  "    - `scripts/probe-apa-trigger-functions.js` — read-only probe. Dumps the exact PL/pgSQL bodies of `handle_apa_insert`, `handle_apa_update`, `handle_apa_delete` plus the `territory_assignment_changes` schema and `change_type` CHECK list. Used as ground truth for the audit-gap fix (Rule Zero — No Guessing).",
  "    - `scripts/r-territory-f-apa-update-audit-gap-fix.js` — applies the audit-row writes to the three trigger functions inside a transaction with verify-then-commit. CREATE OR REPLACE FUNCTION x3, then a verification SELECT against `pg_proc` confirms the new bodies contain the required INSERT INTO `territory_assignment_changes` markers.",
  "",
  "  - **F-APA-NEIGHBOURHOOD-CHECK migration applied (option a):** `agent_property_access_scope_check` was DROPPED and re-added including `'neighbourhood'`. Resolver/trigger/distribute/partial unique index were already wired for neighbourhood; the CHECK was the only barrier. T6-followup-B now passes at neighbourhood scope (could not previously even insert a test row).",
  "",
  "  - **F-APA-UPDATE-AUDIT-GAP discovered + fixed:** Probe surfaced that direct apa state changes were being silently propagated. `handle_apa_insert` / `handle_apa_update` / `handle_apa_delete` triggered `distribute_geo_to_children` and `reroll_listings_at_geo` correctly, but only `distribute_geo_to_children`'s per-child INSERT was writing audit rows (change_type='primary_set'). The `change_type` CHECK accepts 11 values including `assignment_granted` / `assignment_revoked` / `scope_widened` / `scope_narrowed` — the architecture intended these to be tracked, but the trigger code never wrote them. Fix: added audit-row writes to all three trigger functions. `handle_apa_insert` writes `assignment_granted` for new active rows at a geo-typed scope. `handle_apa_delete` writes `assignment_revoked` for active rows being deleted. `handle_apa_update` writes one row on simple is_active flip (granted or revoked depending on direction) or two rows (revoke OLD context + grant NEW context) on agent_id / scope / scope_id changes while is_active. All audit writes positioned BEFORE existing distribute / reroll calls; recursion guard `pg_trigger_depth() > 1` continues to prevent distribute-created child INSERTs from double-auditing.",
  "",
  "  - **All routing-affecting events on `agent_property_access` are now traceable in `territory_assignment_changes`.** The audit gap that allowed 84,586 silent reassignments per is_active flip is closed.",
  "",
  "  - **Probe-then-patch pattern (workflow note):** F-APA-UPDATE-AUDIT-GAP fix was an opportunity to apply Rule Zero — No Guessing rigorously. `scripts/probe-apa-trigger-functions.js` was written first (read-only) to capture the exact PL/pgSQL bodies of the three trigger functions, the audit table schema, and the CHECK constraint values. Only after that probe ran successfully against production was the fix script written, with the new function bodies derived from the probe output and the audit-row INSERT logic targeted at columns / values verified to exist.",
  "",
  "  - **Tracker patch context (this entry):** v10 patch script (`scripts/patch-tracker-v10.js`) was committed as `08bfe76` but contained a duplicated-endAnchor bug in its span-replace patches that prevented it from running cleanly. It never modified the tracker. `scripts/patch-tracker-v11.js` (this script) was written as a comprehensive v9 -> v11 patch, applying both v10's and v11's intended changes in a single atomic operation. The buggy v10 script remains on disk as a historical artifact (committed) but is not executed.",
  ""
];

const V10_ENTRY = V10_ENTRY_LINES.join(NL) + NL;
const V11_ENTRY = V11_ENTRY_LINES.join(NL) + NL;
const P2_NEW = V11_ENTRY + V10_ENTRY + P2_ANCHOR;

// ---- P3: Next action header sentence ----

const P3_OLD =
  "**Three smoke followups, then UI work.** F-AREA-REROLL is no longer a blocker for T4a — the underlying functions complete within Supabase's default timeout, so admin endpoints don't need batching, queue infrastructure, or per-endpoint timeout raises.";

const P3_NEW =
  "**T4a admin UI + T4b public geo display + T7 close — three pieces to W-TERRITORY closure.** Database / trigger / resolver / race safety / audit coverage layer is functionally complete. What remains is making it visible to admins (T4a) and end users (T4b), then ticket closure (T7). No special async / batch / timeout-raise infra needed for T4a — F-AREA-REROLL closure means underlying functions complete within Supabase's default timeout.";

// ---- P4: Section 1 (T6-followup-A -> T4a Admin UI) ----

const P4_OLD_START = "### 1. T6-followup-A — race safety harness";
const P4_OLD_END = "### 2. T6-followup-B — multi-level cascade resolver tests";

const P4_NEW = [
  "### 1. T4a — Admin UI at `/admin-homes/territory`",
  "",
  "New page consolidating the 4 currently-embedded section components (tenant defaults, manager carving, agent assignment, granular overrides) + audit log viewer + `is_primary` toggle + percentage inputs (T2b — optional). Subset enforcement at form layer (filtered dropdowns) + server (`can()` revalidation).",
  "",
  "**Pre-build recon (do this first):**",
  "",
  "- Locate the 4 existing embedded section components in `/admin-homes` and read their current shape (props, data fetching, write paths).",
  "- Check existing API routes (likely under `app/api/walliam/` or `app/api/admin-homes/`) for any territory-related endpoints already wired.",
  "- Confirm `agent_property_access` writes happen via the supabase client with correct tenant_id derivation (RLS-aware).",
  "- Identify the existing audit log viewing pattern, if any.",
  "",
  "**Build steps:**",
  "",
  "1. Page route: `app/admin-homes/territory/page.tsx`. Server component for initial data fetch + client islands for interactive forms.",
  "2. API routes for apa CRUD: assign / revoke / update at each scope level (area / municipality / community / neighbourhood). Each route runs `can()` to enforce role + delegation gates before issuing the SQL write.",
  "3. Components: tenant default selector, area/muni/community/neighbourhood assignment forms, audit log viewer paging through `territory_assignment_changes`.",
  "4. Filtered dropdowns: once a parent scope is chosen (e.g., area), child scope options narrow accordingly (only munis in that area, only communities in that muni). Same pattern at neighbourhood level — pick the area first to filter the neighbourhood list.",
  "5. Server-side validation on every write — never trust client-filtered data.",
  "",
  "**Multi-tenant by default** — all writes scoped by current admin's tenant via RLS / per-request tenant_id derivation. No `walliam` or `condoleads` constants in business logic. Code must work identically for tenant #2, #50, #1000.",
  "",
  "**No special async / batch / timeout-raise infra required** — F-AREA-REROLL closure means underlying reroll/distribute functions complete within Supabase's default `statement_timeout`.",
  "",
  ""
].join(NL);

// ---- P5: Section 2 (T6-followup-B -> T4b Public Geo Display) ----

const P5_OLD_START = "### 2. T6-followup-B — multi-level cascade resolver tests";
const P5_OLD_END = "### 3. T6-followup-C — `is_active` flip fires reroll";

const P5_NEW = [
  "### 2. T4b — Public-facing UI: geo page primary agent display",
  "",
  "Public site renders area / muni / community / neighbourhood / building pages. Each needs to display the **primary agent** card sourced from `resolve_display_agent_for_context`.",
  "",
  "**Pre-build recon:**",
  "",
  "- Locate existing geo page routes + agent-card components.",
  "- Confirm how they fetch agent data today.",
  "- Decide whether to enhance `app/api/walliam/resolve-agent/route.ts` to accept `neighbourhood_id` from request body (forward compat for neighbourhood-level pages — F-APA-NEIGHBOURHOOD-CHECK closure means neighbourhood-scope assignments can now exist in apa).",
  "",
  "**Building pages are a documented shared exception between System 1 and System 2** — handled with extreme care. Read the existing building page handling before changing anything; do not modify System 1 paths.",
  "",
  ""
].join(NL);

// ---- P6: Section 3 + "After T6-followup-A/B/C close:" subsection -> T7 ----

const P6_OLD_START = "### 3. T6-followup-C — `is_active` flip fires reroll";
const P6_OLD_END = "### Optional / parallel:";

const P6_NEW = [
  "### 3. T7 — Close ticket",
  "",
  "After T4a + T4b ship and a final smoke matrix run:",
  "",
  "1. Apply `scripts/patch-tracker-v12.js` (final closure entry, status line marked CLOSED with commit hashes for the major milestones — F-APA-NEIGHBOURHOOD-CHECK, F-APA-UPDATE-AUDIT-GAP, T4a, T4b).",
  "2. Flip `docs/W-LAUNCH-TRACKER.md` Section 4 W-TERRITORY row from in-progress to **CLOSED**, with commit hashes for: T6 closure (v11), T4a UI ship, T4b UI ship.",
  "3. Notify any downstream workstreams (W-LAUNCH P1-3, public-page rendering) that territory is unblocked end-to-end.",
  "4. W-TERRITORY workstream complete.",
  "",
  ""
].join(NL);

// ---- P7: T6 phase header marker ----

const P7_OLD = "### T6 — Smoke matrix (RECOMMENDED NEXT)";
const P7_NEW = "### T6 — Smoke matrix ✅ CLOSED 2026-05-07 (core v8, F-AREA-REROLL v9, followups A/B/C v10/v11)";

// ---- P8: Findings — append F-APA-NEIGHBOURHOOD-CHECK + F-APA-UPDATE-AUDIT-GAP + F-RACE-DEADLOCK ----

const P8_ANCHOR =
  "**T3b-B canonical smoke result (2026-05-06):** Whitby muni had 1 agent (King Shah) at municipality scope and 0 community-scope rows. After `distribute_geo_to_children('municipality', whitby_id, 'community', walliam_id)`, all 11 communities under Whitby got King Shah as primary. Validates the spec's \"as-equal-as-possible with random tiebreak\" behavior at N=1.";

const P8_NEW_FINDINGS_LINES = [
  "",
  "**F-APA-NEIGHBOURHOOD-CHECK (2026-05-07, CLOSED v11):** `agent_property_access.scope` CHECK constraint originally omitted `'neighbourhood'` despite resolver/trigger/distribute layers all referencing it. Discovered during T6-followup-A race harness probe (v10). Decision: option (a) add to CHECK (vs option (b) strip from upstream). Migration applied via `scripts/r-territory-f-apa-neighbourhood-check-fix.js` — discovered constraint name `agent_property_access_scope_check` from `pg_constraint`, dropped + re-added with neighbourhood included, transactional with verify-then-commit. Neighbourhood-scope routing now reachable end-to-end.",
  "",
  "**F-APA-UPDATE-AUDIT-GAP (2026-05-07, CLOSED v11):** `handle_apa_insert/update/delete` triggers were silently propagating apa state changes through `distribute_geo_to_children` and `reroll_listings_at_geo`, but only the per-child distribute INSERT was writing audit rows. Direct apa state changes (a manual INSERT, an is_active flip, an agent_id swap) left `territory_assignment_changes` empty for the parent event. The `change_type` CHECK list (11 values: assignment_granted/revoked, primary_set/unset, percentage_set/changed, scope_widened/narrowed, pin_added/removed, access_toggle_changed) was the architectural contract; the trigger code never honoured it. Fix added audit-row writes for direct state changes — `assignment_granted` on INSERT, `assignment_revoked` on DELETE / is_active=false flip, paired revoke+grant on agent/scope changes — applied via CREATE OR REPLACE FUNCTION inside transaction with verify-then-commit. Recursion guard (`pg_trigger_depth() > 1`) preserved to prevent distribute-created child INSERTs from double-auditing.",
  "",
  "**F-RACE-DEADLOCK (2026-05-07, CLOSED v10):** Race harness initially wrapped concurrent INSERTs in explicit `BEGIN; INSERT; COMMIT;` inside `Promise.allSettled`. Both pg.Pool connections deadlocked at the application layer — Postgres cannot detect a stall where one client holds a transaction open while waiting on its own concurrent client to commit. Fix: drop the explicit transaction wrapping. Autocommit per statement allows the trigger's xact-scoped advisory lock to acquire-and-release within the implicit autocommit boundary, which is what serializes parallel attempts. Encoded in `scripts/r-territory-t6-followup-race.js` header DESIGN NOTE block. Pattern applies to any future test of trigger behaviour under concurrent client connections."
];

const P8_NEW_FINDINGS = P8_NEW_FINDINGS_LINES.join(NL);
const P8_NEW = P8_ANCHOR + NL + P8_NEW_FINDINGS;

// ---- P9: Workflow rules append ----

const P9_ANCHOR =
  "- **Audit before action** — every territory mutation writes an audit row to `territory_assignment_changes`.";

const P9_NEW_BULLETS_LINES = [
  "- **Concurrency harness pattern (v10):** any future test of trigger behaviour under concurrent client connections must use the **autocommit pattern** (no explicit `BEGIN`/`COMMIT` from the client) when the triggers under test acquire transaction-scoped advisory locks. Explicit-transaction patterns inside `Promise.all` / `Promise.allSettled` deadlock at the application layer because Postgres cannot detect a stall where a client holds a transaction open while waiting on its own concurrent client to commit. The lock acquire-and-release happens within the autocommit boundary of the single statement that fires the trigger; that boundary is what serializes parallel attempts. Encoded in `scripts/r-territory-t6-followup-race.js` header DESIGN NOTE block.",
  "- **Audit-on-state-change pattern (v11):** any trigger function that mutates routing state on `agent_property_access` must write an audit row to `territory_assignment_changes` for the direct state change, IN ADDITION TO any audit rows written by cascading helpers (e.g., `distribute_geo_to_children` writes `primary_set` for child rows; that's not a substitute for the parent INSERT's `assignment_granted`). The audit table's `change_type` CHECK list is the contract for what events must be logged. Encoded in `handle_apa_insert` / `handle_apa_update` / `handle_apa_delete` per F-APA-UPDATE-AUDIT-GAP fix; future apa-touching triggers must follow the same pattern.",
  "- **Probe-then-patch pattern (v11):** any production trigger or function modification must be preceded by a read-only probe (`scripts/probe-*.js`) that captures the exact current source. The probe output is the ground truth; the patch is derived from it, not from training memory or assumed structure. Encoded in `scripts/probe-apa-trigger-functions.js` -> `scripts/r-territory-f-apa-update-audit-gap-fix.js` workflow."
];

const P9_NEW_BULLETS = NL + P9_NEW_BULLETS_LINES.join(NL);
const P9_NEW = P9_ANCHOR + P9_NEW_BULLETS;

// ===========================================================================
// Apply patches
// ===========================================================================

const patches = [
  { name: "P1: status line", kind: "replace", old: P1_OLD, new: P1_NEW },
  { name: "P2: insert v10 + v11 entries above v9", kind: "replace", old: P2_ANCHOR, new: P2_NEW },
  { name: "P3: Next action header sentence", kind: "replace", old: P3_OLD, new: P3_NEW },
  { name: "P4: Section 1 -> T4a Admin UI", kind: "span-replace", startAnchor: P4_OLD_START, endAnchor: P4_OLD_END, new: P4_NEW },
  { name: "P5: Section 2 -> T4b Public Geo Display", kind: "span-replace", startAnchor: P5_OLD_START, endAnchor: P5_OLD_END, new: P5_NEW },
  { name: "P6: Section 3 + After-subsection -> T7 Close", kind: "span-replace", startAnchor: P6_OLD_START, endAnchor: P6_OLD_END, new: P6_NEW },
  { name: "P7: T6 phase header marker", kind: "replace", old: P7_OLD, new: P7_NEW },
  { name: "P8: Findings append (3 new findings)", kind: "replace", old: P8_ANCHOR, new: P8_NEW },
  { name: "P9: Workflow rules append (3 new patterns)", kind: "replace", old: P9_ANCHOR, new: P9_NEW }
];

let content = original;
const results = [];

for (const p of patches) {
  if (p.kind === "replace") {
    const idx = content.indexOf(p.old);
    if (idx === -1) {
      results.push({ name: p.name, status: "FAIL", reason: "old anchor not found" });
      continue;
    }
    if (content.indexOf(p.old, idx + 1) !== -1) {
      results.push({ name: p.name, status: "FAIL", reason: "old anchor not unique" });
      continue;
    }
    content = content.slice(0, idx) + p.new + content.slice(idx + p.old.length);
    results.push({ name: p.name, status: "OK", delta: p.new.length - p.old.length });
  } else if (p.kind === "span-replace") {
    const startIdx = content.indexOf(p.startAnchor);
    if (startIdx === -1) {
      results.push({ name: p.name, status: "FAIL", reason: "startAnchor not found" });
      continue;
    }
    if (content.indexOf(p.startAnchor, startIdx + 1) !== -1) {
      results.push({ name: p.name, status: "FAIL", reason: "startAnchor not unique" });
      continue;
    }
    const endIdx = content.indexOf(p.endAnchor, startIdx + p.startAnchor.length);
    if (endIdx === -1) {
      results.push({ name: p.name, status: "FAIL", reason: "endAnchor not found after startAnchor" });
      continue;
    }
    const oldSpan = content.slice(startIdx, endIdx);
    // CORRECT pattern: do NOT append endAnchor to p.new — content.slice(endIdx) already
    // begins at endAnchor. Appending it would duplicate. (This was the v10 bug.)
    content = content.slice(0, startIdx) + p.new + content.slice(endIdx);
    results.push({ name: p.name, status: "OK", delta: p.new.length - oldSpan.length });
  } else {
    results.push({ name: p.name, status: "FAIL", reason: "unknown kind: " + p.kind });
  }
}

console.log("\nPatch results:");
for (const r of results) {
  let line = "  " + r.status + ": " + r.name;
  if (r.reason) line += " — " + r.reason;
  if (typeof r.delta === "number") line += " (delta " + (r.delta >= 0 ? "+" : "") + r.delta + " chars)";
  console.log(line);
}

const failed = results.filter(function (r) { return r.status === "FAIL"; });
if (failed.length > 0) {
  console.error("\nFAIL: " + failed.length + " patch(es) failed. Original file untouched. Backup at " + backupPath + " (identical to original — discardable).");
  process.exit(1);
}

if (content === original) {
  console.log("\nNo-op: file already at target state. Backup is identical to original (discardable).");
  process.exit(0);
}

fs.writeFileSync(TRACKER, content);
console.log("\nWrote: " + TRACKER + " (" + content.length + " chars; net delta " + (content.length - original.length) + " chars)");
console.log("Diff: git diff -- " + TRACKER);
console.log("Restore (if needed): cp \"" + backupPath + "\" \"" + TRACKER + "\"");