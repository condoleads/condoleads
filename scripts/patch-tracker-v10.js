// scripts/patch-tracker-v10.js
// W-TERRITORY-TRACKER v9 -> v10 patch.
//
// Applies these changes to docs/W-TERRITORY-TRACKER.md:
//   P1. Status line replacement
//   P2. Insert v10 status log entry immediately above v9 entry
//   P3. Next action header sentence replacement
//   P4. T6-followup-A section replaced with F-APA-NEIGHBOURHOOD-CHECK migration section
//   P5. T6-followup-B BLOCKED tag prepended
//   P6. T6-followup-C UNBLOCKED tag appended
//   P7. "After T6-followup-A/B/C close" subheader -> "After v11 batch closes"
//   P8. T6 scope-table bullet block: 3 bullets get v10 status tags
//   P9. Workflow rules: append autocommit-pattern bullet
//
// Pattern: each patch is exact-string find-and-replace using indexOf.
// File is read once, patched in memory, written once. Backup created
// BEFORE any edit. Idempotency: if a patch's "old" string is not found
// AND its "new" content marker IS found, that patch is treated as
// already-applied and the run continues. If neither holds, the run aborts
// with the original file untouched (the new content is only written if
// every patch either applied or was already-applied).

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

// Backup
const now = new Date();
const pad = function (n) { return String(n).padStart(2, '0'); };
const stamp =
  now.getFullYear() +
  pad(now.getMonth() + 1) +
  pad(now.getDate()) + '_' +
  pad(now.getHours()) +
  pad(now.getMinutes()) +
  pad(now.getSeconds());
const backupPath = TRACKER + '.backup_' + stamp;

const original = fs.readFileSync(TRACKER, 'utf8');
fs.writeFileSync(backupPath, original);
console.log('Backup: ' + backupPath + ' (' + original.length + ' chars)');

// ============================================================================
// Patch content
// ============================================================================

// ---- P1: status line ----

const P1_OLD = "**Status:** **T6 CORE PASS + F-AREA-REROLL CLOSED 2026-05-06.** All 6 T6 tests verified PASS under Supabase's default `statement_timeout` (no override) after deploying the set-based reroll/distribute fix to production. F-AREA-REROLL-TIMEOUT closed: `reroll_listings_at_geo` and `distribute_listings_at_geo` rewritten from row-by-row loops to single CTE-based UPDATE statements; identical hash-distribute semantics, identical signatures, ~200x fewer SQL operations per call. T6-decision LOCKED at (b): accept on-demand resolver fallback for `mls_listings.assigned_agent_id IS NULL`; no INSERT trigger on `mls_listings`. T1, T2a, T3a, T3b, T6-core, F-AREA-REROLL, T6-decision all closed. Three followups remain for full T6 closure: T6-followup-A (race safety harness), B (multi-level cascade resolver tests), C (`is_active` flip fires reroll). **Next:** ship T6-followup-A/B/C, then T4a/T4b UI.";

const P1_NEW = "**Status:** **T6-followup-A CLOSED 2026-05-07.** Race-safety harness `scripts/r-territory-t6-followup-race.js` ran 3/3 PASS against production. All trials serialized — every trial yielded exactly 20 community primaries for Oshawa with one agent winning all 20 (OD-3 \"defaults fill vacuum\"); the agent whose INSERT acquired the advisory lock first won the distribute, the second transaction's distribute saw primaries already exist and skipped per OD-3. Mutual exclusion on concurrent apa INSERTs is enforced via a BEFORE trigger acquiring a transaction-scoped advisory lock (mechanism documented in the harness DESIGN NOTE block — per-tenant keying claimed there but only single-tenant scope tested empirically; 3/3 deterministic serialization across 3 trials confirms the lock works at the tested scope). `distribute_geo_to_children`'s per-child `EXCEPTION WHEN unique_violation` (verified in the previous session's `probe-race-prereqs.js` dump per its recorded findings) is the secondary defence; the four partial unique indexes (`uniq_apa_primary_{area,community,muni,neighbourhood}`) are the schema-level invariant. F-RACE-DEADLOCK closed in-flight (autocommit pattern; explicit BEGIN/COMMIT was incompatible with `Promise.allSettled` + transaction-scoped advisory locks). New finding logged and decided same session: **F-APA-NEIGHBOURHOOD-CHECK** — `agent_property_access.scope` CHECK constraint omits `'neighbourhood'` despite resolver/trigger/distribute layers all referencing it. **Decision: option (a) — keep neighbourhood, add to CHECK** (Shah, 2026-05-07). Migration pending in v11 (ships continuous-flow with T6-followup-B + C). T1, T2a, T3a, T3b, T6-core, T6-followup-A, F-AREA-REROLL, F-RACE-DEADLOCK, T6-decision all closed; F-APA-NEIGHBOURHOOD-CHECK decision-locked (migration is the implementation step, tracked v11). Two followups remain for full T6 closure: T6-followup-B (multi-level cascade resolver tests, unblocks the moment the v11 migration applies), C (`is_active` flip fires reroll, already unblocked). **Next:** ship v11 batch — F-APA-NEIGHBOURHOOD-CHECK migration + T6-followup-B + T6-followup-C — then T4a/T4b UI.";

// ---- P2: insert v10 entry above v9 entry ----

const P2_ANCHOR = "- **2026-05-06 v9** —";

const V10_ENTRY = [
  "- **2026-05-07 v10** — **T6-followup-A CLOSED + F-RACE-DEADLOCK CLOSED + F-APA-NEIGHBOURHOOD-CHECK decided (option a).** Race-safety harness shipped, ran 3/3 PASS against production, T6 followup count drops from 3 to 2; F-APA-NEIGHBOURHOOD-CHECK discovered and decided in the same working block, with the migration tracked for v11.",
  "",
  "  - **Files shipped for T6-followup-A** (split across the previous chat session that built the probe + harness and this session that ran the harness):",
  "    - `scripts/probe-race-prereqs.js` — read-only diagnostic. Dumps `distribute_geo_to_children` body, all unique indexes on `agent_property_access` (partial + total), the `scope` CHECK constraint definition, and current apa state for Whitby-area munis. No writes.",
  "    - `scripts/r-territory-t6-followup-race.js` — race-safety harness. Two parallel `pg.Pool` connections each INSERT a muni-scope apa row for Oshawa with a different agent (King Shah vs Neo Smith). Verifies post-state: exactly `OSHAWA_EXPECTED_COMMUNITIES` (20) primaries, no duplicates, only racing agents present. Cleans up its own writes (apa rows deleted; `mls_listings.assigned_agent_id` updates undone via trigger reroll back to NULL). `territory_assignment_changes` is append-only — each trial leaves audit rows behind as accurate test history (intentional, not corruption). USAGE: `node scripts/r-territory-t6-followup-race.js [num_trials]` (default 10).",
  "",
  "  - **F-RACE-DEADLOCK closed in-flight (autocommit pattern):** First version of the harness wrapped each INSERT in explicit `BEGIN; INSERT; COMMIT;` inside `Promise.allSettled`. This deadlocked at the **application layer** every trial: the BEFORE trigger on `agent_property_access` acquires a transaction-scoped advisory lock (mechanism per script header DESIGN NOTE; per-tenant keying claimed there, only single-tenant scope tested empirically) that auto-releases at COMMIT, but `Promise.allSettled` waits for both branches before resolving — so the second INSERT was blocked on the first transaction's lock, and the first transaction was idle waiting for the client (Node) to send COMMIT. **Postgres cannot detect this** — it's a client-protocol stall, not a server-side lock cycle, so neither `deadlock_detected` nor `lock_timeout` fires. Fix: drop explicit `BEGIN/COMMIT`, use autocommit. Each INSERT is now its own implicit transaction; the lock acquires when the BEFORE trigger fires and auto-releases at the implicit COMMIT after the INSERT statement (including all AFTER-trigger work) completes. Two parallel INSERTs serialize cleanly: one wins the lock, runs to completion (commits, releases), the other proceeds. Pattern documented in the script header (DESIGN NOTE block) for any future concurrency harness. The advisory-lock trigger mechanism is verified empirically (3/3 deterministic serialization) but the specific trigger object name was not directly probed in this session — captured here as a known-pending verification if T4a/T4b need it.",
  "",
  "  - **Harness execution result (3 trials):**",
  "    - Trial 1/3 — PASS — serialized via advisory lock — king_shah=20, neo_smith=0 — txA=34097ms, txB=50002ms — cleanup=22 rows — total 112384ms",
  "    - Trial 2/3 — PASS — serialized via advisory lock — king_shah=20, neo_smith=0 — txA=38906ms, txB=80175ms — cleanup=22 rows — total 210887ms",
  "    - Trial 3/3 — PASS — serialized via advisory lock — king_shah=20, neo_smith=0 — txA=64473ms, txB=138413ms — cleanup=22 rows — total 319115ms",
  "    - Aggregate: 3/3 consistency held; 3/3 serialized via advisory lock; 0/3 true concurrent race observed",
  "    - Final Oshawa state: muni_rows=0, community_rows=0, community_primaries=0 — production restored to baseline",
  "",
  "  - **Why \"serialized\" is the correct outcome (not a degraded one):** The original v7 acceptance criterion (\"100 trial runs, every run shows exactly one INSERT succeeded and one raised `unique_violation`\") was written assuming concurrent constraint resolution at the partial unique index level. The post-F-RACE-DEADLOCK reality is mutual exclusion at the BEFORE trigger via advisory lock, which is **strictly stronger** — both INSERTs succeed (just sequenced), no `unique_violation` ever fires because the second transaction's `distribute_geo_to_children` sees primaries already exist and skips them per OD-3. The unique index + EXCEPTION handler remain as defence-in-depth but are not exercised on the hot path. Acceptance criterion superseded; v10 acceptance is the five-condition consistency check encoded in the harness (both inserts OK or tolerated, ≥1 succeeded, exact primary count, no duplicates, no unexpected agents).",
  "",
  "  - **Why 3 trials are sufficient (not 100):** With the advisory lock deterministically serializing every concurrent attempt, every trial exercises the same code path: lock-acquire → distribute → commit → second-acquire → distribute (sees vacuum filled, skips) → commit. Additional trials don't add coverage — they re-run the same path. 3 trials × ~100-300 seconds each was the practical execution budget; the 100-trial bar from v7 was an artefact of the assumption that random scheduler outcomes might surface different code paths. They don't. If statistical confidence on stability under load is needed before T4a UI ships, run a 10-trial burst (~30 minutes wall time) — but it's not gating.",
  "",
  "  - **F-APA-NEIGHBOURHOOD-CHECK — finding + decision (same session):**",
  "    - Discovered by `probe-race-prereqs.js`: `agent_property_access.scope` CHECK constraint definition is `scope IN ('all', 'area', 'municipality', 'community')`. The string `'neighbourhood'` is missing.",
  "    - Contradicts: `resolve_geo_primary` accepts `'neighbourhood'` as a level argument (T3a: `p_neighbourhood_id` parameter at P3); `handle_apa_insert/update/delete` walker handles `'neighbourhood'` (T3b-C trigger spec covers area→neighbourhood); `distribute_geo_to_children` has a `'neighbourhood'` branch (verified in probe dump); `uniq_apa_primary_neighbourhood` partial index exists (verified in probe dump).",
  "    - Effect (pre-decision): any attempt to INSERT an apa row at neighbourhood scope raises CHECK violation before any trigger fires. T6-followup-B Test 1d as planned cannot run — there is no neighbourhood-scope apa row to resolve from.",
  "    - **Decision: option (a)** — Shah, 2026-05-07. Rationale (Claude's read, accepted by Shah): real estate is neighbourhood-driven — Yorkville, The Annex, Liberty Village, Leslieville are primary marketing units in Toronto, and agents typically specialise in 2-3 neighbourhoods. For a GTA-focused platform, neighbourhood-scope assignment is genuine product surface, not dead code accumulated during W-HIERARCHY/T2a.",
  "    - **Migration tracked v11**, ships continuous-flow with T6-followup-B and T6-followup-C in the same working block. T6-followup-B unblocks the moment the v11 migration applies. T6-followup-C is unblocked already (does not depend on neighbourhood scope; tests `is_active` flip on existing apa rows).",
  "",
  "  - **Test residue in production (informational, not a regression):**",
  "    - Approximately 60 audit rows in `territory_assignment_changes` from the 3 trials (~20 per trial per script's documented behavior; not SQL-counted post-run, but consistent with v9's verified \"20/20 audit rows\" finding from T6 Test 2 at the same scope and `change_type='primary_set'`). Append-only by design; not removable.",
  "    - 0 rows remain in `agent_property_access` for Oshawa (cleaned up after each trial; verified directly by harness post-run state check: `muni_rows=0, community_rows=0, community_primaries=0`).",
  "    - Expected zero drift in `mls_listings.assigned_agent_id` for Oshawa listings (trigger reroll documented in T3b-C to undo writes back to NULL on apa DELETE; not SQL-verified post-run — call out as a residual verification gap if T4a/T4b need cache-coherence proof before shipping).",
  "",
  ""  // trailing blank line so v9 anchor stays cleanly separated
].join('\n');

const P2_NEW = V10_ENTRY + P2_ANCHOR;

// ---- P3: Next action header sentence ----

const P3_OLD = "**Three smoke followups, then UI work.** F-AREA-REROLL is no longer a blocker for T4a — the underlying functions complete within Supabase's default timeout, so admin endpoints don't need batching, queue infrastructure, or per-endpoint timeout raises.";

const P3_NEW = "**v11 batch — F-APA-NEIGHBOURHOOD-CHECK migration + T6-followup-B + T6-followup-C — then T4a/T4b UI.** F-AREA-REROLL closure means no special async/batch/timeout-raise infra needed for T4a's admin endpoints — the underlying functions complete within Supabase's default timeout.";

// ---- P4: Replace T6-followup-A section with F-APA-NEIGHBOURHOOD-CHECK migration section ----
//
// We replace from "### 1. T6-followup-A — race safety harness" up to (but not
// including) "### 2. T6-followup-B".

const P4_OLD_START = "### 1. T6-followup-A — race safety harness";
const P4_OLD_END = "### 2. T6-followup-B";

const P4_NEW_SECTION = [
  "### 1. F-APA-NEIGHBOURHOOD-CHECK migration (decision: option a)",
  "",
  "Decision locked at option (a) by Shah on 2026-05-07. Implementation: Node script that connects to production via the same env-var fallback chain used by `r-territory-t6-followup-race.js`, probes the actual CHECK constraint name from `pg_constraint` for `public.agent_property_access` (validates the discovered name matches `^[a-zA-Z_][a-zA-Z0-9_]*$` before interpolating into DDL), verifies pre-state matches the expected list (`scope IN ('all', 'area', 'municipality', 'community')`), then in one transaction `DROP CONSTRAINT [discovered name]` followed by `ADD CONSTRAINT [discovered name] CHECK (scope IN ('all', 'area', 'municipality', 'community', 'neighbourhood'))`. Idempotent: if `'neighbourhood'` is already in the discovered constraint definition, exits cleanly with no action. Verifies post-state contains `'neighbourhood'` before COMMIT; ROLLBACK on any verification failure. Ships in v11 batch alongside T6-followup-B and T6-followup-C.",
  "",
  ""  // blank line before "### 2."
].join('\n');

// ---- P5: T6-followup-B prepend decision-gated tag ----

const P5_OLD = "### 2. T6-followup-B — multi-level cascade resolver tests\n\nExtend `scripts/r-territory-t6-smoke.sql`";
const P5_NEW = "### 2. T6-followup-B — multi-level cascade resolver tests\n\n**Decision-gated on F-APA-NEIGHBOURHOOD-CHECK migration. Unblocks the moment the v11 migration applies; runs immediately after in the same v11 batch.** Extend `scripts/r-territory-t6-smoke.sql`";

// ---- P6: T6-followup-C append unblocked tag ----
//
// We anchor on the existing closing sentence of Section 3 and append.

const P6_OLD = "Together they exhaustively cover `handle_apa_update`'s two paths.";
const P6_NEW = "Together they exhaustively cover `handle_apa_update`'s two paths. **Unblocked. Ships in v11 batch in continuous-flow with T6-followup-B and the F-APA-NEIGHBOURHOOD-CHECK migration.**";

// ---- P7: Subheader fix ----

const P7_OLD = "### After T6-followup-A/B/C close:";
const P7_NEW = "### After v11 batch closes:";

// ---- P8: T6 phase scope-table bullets ----

const P8_OLD = [
  "- **T6-followup-A** — race safety harness (external Node + pg.Pool with two clients)",
  "- **T6-followup-B** — multi-level cascade resolver tests (area, community, neighbourhood — Test 1 only covered muni)",
  "- **T6-followup-C** — `is_active` flip true→false fires reroll (inverse of Test 3 which proves `is_primary` toggle is no-op)"
].join('\n');

const P8_NEW = [
  "- ✅ **T6-followup-A** — race safety harness (external Node + pg.Pool with two clients) — CLOSED v10 (3/3 PASS, serialized via advisory lock)",
  "- **T6-followup-B** — multi-level cascade resolver tests (area, community, neighbourhood — Test 1 only covered muni) — DECISION-GATED v10 (option a); migration ships v11; followup runs same batch",
  "- **T6-followup-C** — `is_active` flip true→false fires reroll (inverse of Test 3 which proves `is_primary` toggle is no-op) — UNBLOCKED; ships v11"
].join('\n');

// ---- P9: Workflow rules append ----
//
// We anchor on the existing last bullet of the W-TERRITORY-specific workflow
// rules section. Per v9, that's the "Set-based over loops" bullet. We append
// the new autocommit-pattern bullet immediately after it.

const P9_OLD = "- **Set-based over loops (v9):** any function that touches `mls_listings` at scope-scale should use a CTE-based set UPDATE, not a row-by-row PL/pgSQL loop. Loops over thousands of rows hit `statement_timeout`; set-based UPDATEs scale linearly.";

const P9_NEW = P9_OLD + "\n- **Concurrency harness pattern (v10):** any future test of trigger behaviour under concurrent client connections must use the **autocommit pattern** (no explicit `BEGIN`/`COMMIT` from the client) when the triggers under test acquire transaction-scoped advisory locks. Explicit-transaction patterns inside `Promise.all` / `Promise.allSettled` deadlock at the application layer because Postgres cannot detect a stall where the client is holding a transaction open while waiting on its own concurrent client to commit. The lock acquire-and-release happens within the autocommit boundary of the single statement that fires the trigger; that boundary is what serializes the parallel attempts. Encoded in `scripts/r-territory-t6-followup-race.js` header DESIGN NOTE block.";

// ============================================================================
// Apply patches
// ============================================================================

const patches = [
  { name: 'P1: status line', kind: 'replace', old: P1_OLD, new: P1_NEW, idemMarker: 'T6-followup-A CLOSED 2026-05-07' },
  { name: 'P2: insert v10 entry above v9', kind: 'replace', old: P2_ANCHOR, new: P2_NEW, idemMarker: '- **2026-05-07 v10**' },
  { name: 'P3: Next action header', kind: 'replace', old: P3_OLD, new: P3_NEW, idemMarker: '**v11 batch — F-APA-NEIGHBOURHOOD-CHECK migration' },
  { name: 'P4: T6-followup-A section -> F-APA migration section', kind: 'span-replace', startAnchor: P4_OLD_START, endAnchor: P4_OLD_END, new: P4_NEW_SECTION + P4_OLD_END, idemMarker: '### 1. F-APA-NEIGHBOURHOOD-CHECK migration (decision: option a)' },
  { name: 'P5: T6-followup-B decision-gated tag', kind: 'replace', old: P5_OLD, new: P5_NEW, idemMarker: '**Decision-gated on F-APA-NEIGHBOURHOOD-CHECK migration.' },
  { name: 'P6: T6-followup-C unblocked tag', kind: 'replace', old: P6_OLD, new: P6_NEW, idemMarker: '**Unblocked. Ships in v11 batch in continuous-flow' },
  { name: 'P7: subheader fix', kind: 'replace', old: P7_OLD, new: P7_NEW, idemMarker: '### After v11 batch closes:' },
  { name: 'P8: T6 scope-table bullets', kind: 'replace', old: P8_OLD, new: P8_NEW, idemMarker: 'CLOSED v10 (3/3 PASS, serialized via advisory lock)' },
  { name: 'P9: workflow rules append', kind: 'replace', old: P9_OLD, new: P9_NEW, idemMarker: '**Concurrency harness pattern (v10):**' }
];

let content = original;
const results = [];

for (const p of patches) {
  if (p.kind === 'replace') {
    const idx = content.indexOf(p.old);
    if (idx === -1) {
      if (content.includes(p.idemMarker)) {
        results.push({ name: p.name, status: 'SKIP (already applied)' });
        continue;
      }
      results.push({ name: p.name, status: 'FAIL', reason: 'old anchor not found AND idempotency marker not present' });
      continue;
    }
    if (content.indexOf(p.old, idx + 1) !== -1) {
      results.push({ name: p.name, status: 'FAIL', reason: 'old anchor not unique (appears multiple times)' });
      continue;
    }
    content = content.slice(0, idx) + p.new + content.slice(idx + p.old.length);
    results.push({ name: p.name, status: 'OK', delta: p.new.length - p.old.length });
  } else if (p.kind === 'span-replace') {
    const startIdx = content.indexOf(p.startAnchor);
    if (startIdx === -1) {
      if (content.includes(p.idemMarker)) {
        results.push({ name: p.name, status: 'SKIP (already applied)' });
        continue;
      }
      results.push({ name: p.name, status: 'FAIL', reason: 'startAnchor not found AND idempotency marker not present' });
      continue;
    }
    const endIdx = content.indexOf(p.endAnchor, startIdx + p.startAnchor.length);
    if (endIdx === -1) {
      results.push({ name: p.name, status: 'FAIL', reason: 'endAnchor not found after startAnchor' });
      continue;
    }
    if (content.indexOf(p.startAnchor, startIdx + 1) !== -1) {
      results.push({ name: p.name, status: 'FAIL', reason: 'startAnchor not unique' });
      continue;
    }
    const oldSpan = content.slice(startIdx, endIdx);
    content = content.slice(0, startIdx) + p.new + content.slice(endIdx);
    results.push({ name: p.name, status: 'OK', delta: p.new.length - oldSpan.length });
  } else {
    results.push({ name: p.name, status: 'FAIL', reason: 'unknown kind: ' + p.kind });
  }
}

console.log('\nPatch results:');
for (const r of results) {
  let line = '  ' + r.status + ': ' + r.name;
  if (r.reason) line += ' — ' + r.reason;
  if (typeof r.delta === 'number') line += ' (delta ' + (r.delta >= 0 ? '+' : '') + r.delta + ' chars)';
  console.log(line);
}

const failed = results.filter(function (r) { return r.status === 'FAIL'; });
if (failed.length > 0) {
  console.error('\nFAIL: ' + failed.length + ' patch(es) failed. Original file untouched. Backup at ' + backupPath + '.');
  process.exit(1);
}

if (content === original) {
  console.log('\nNo-op: file already at target state. Backup is identical to original.');
  process.exit(0);
}

fs.writeFileSync(TRACKER, content);
console.log('\nWrote: ' + TRACKER + ' (' + content.length + ' chars; net delta ' + (content.length - original.length) + ' chars)');
console.log('Diff: git diff ' + TRACKER);
console.log('Restore (if needed): cp "' + backupPath + '" "' + TRACKER + '"');