// scripts/patch-tracker-v9.js
// W-TERRITORY/T6 v9 — apply three exact-string patches to docs/W-TERRITORY-TRACKER.md
//
//   A. Replace top **Status:** line with v9 state (T6 CORE PASS + F-AREA-REROLL CLOSED).
//   B. Append v9 entry to ## Status log between v8 and the --- separator.
//   C. Replace ## Next action section with v9 forward plan (T6-followup-A/B/C → T4).
//
// Pre-flight: timestamped backup. Fail-fast on any anchor miss. Verify all
// markers post-write. Restore command printed if verification fails.
//
// USAGE (from C:\Condoleads\project):
//   node scripts\patch-tracker-v9.js

const fs = require('fs');
const path = require('path');

const TRACKER = path.resolve('docs/W-TERRITORY-TRACKER.md');

if (!fs.existsSync(TRACKER)) {
  console.error('FAIL: tracker not found at', TRACKER);
  process.exit(1);
}

const ts = (() => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
})();
const backupPath = `${TRACKER}.backup_${ts}`;
fs.copyFileSync(TRACKER, backupPath);
console.log(`Backup written: ${path.basename(backupPath)} (${fs.statSync(backupPath).size} bytes)`);

const original = fs.readFileSync(TRACKER, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
console.log(`Detected line ending: ${eol === '\r\n' ? 'CRLF' : 'LF'}`);
console.log(`Original size: ${original.length} chars`);

// ─── PATCH A: top Status line ────────────────────────────────────────────────
const oldStatus = "**Status:** **T6 CORE PASS 2026-05-06.** All 6 tests PASS via `scripts/run-r-territory-t6-smoke.js` (Node + pg, bypasses Studio's payload limit). Confirms: resolver baseline holds post-T3b; INSERT trigger fans out 20 community primaries on a sibling-muni INSERT; `is_primary` toggle is a true no-op (no audit, no apa change); recursion guard blocks depth-2 cascade (area INSERT does NOT touch community level); DELETE trigger runs clean; audit trail writes one row per child primary. **One P1 production finding surfaced — F-AREA-REROLL-TIMEOUT:** area-scope reroll on a large area (Whitby) exceeds Supabase's default `statement_timeout`; admin UI must batch or async this in production. Three followups still tracked: race safety (T6-followup-A, needs external harness), multi-level cascade (T6-followup-B), `is_active` flip reroll (T6-followup-C); plus T6-decision (MLS-sync trigger Y/N). T1, T2a, T3a, T3b, T6-core all closed. **Next:** address F-AREA-REROLL-TIMEOUT mitigation + close T6-decision before T4a UI work.";

const newStatus = "**Status:** **T6 CORE PASS + F-AREA-REROLL CLOSED 2026-05-06.** All 6 T6 tests verified PASS under Supabase's default `statement_timeout` (no override) after deploying the set-based reroll/distribute fix to production. F-AREA-REROLL-TIMEOUT closed: `reroll_listings_at_geo` and `distribute_listings_at_geo` rewritten from row-by-row loops to single CTE-based UPDATE statements; identical hash-distribute semantics, identical signatures, ~200x fewer SQL operations per call. T6-decision LOCKED at (b): accept on-demand resolver fallback for `mls_listings.assigned_agent_id IS NULL`; no INSERT trigger on `mls_listings`. T1, T2a, T3a, T3b, T6-core, F-AREA-REROLL, T6-decision all closed. Three followups remain for full T6 closure: T6-followup-A (race safety harness), B (multi-level cascade resolver tests), C (`is_active` flip fires reroll). **Next:** ship T6-followup-A/B/C, then T4a/T4b UI.";

if (!original.includes(oldStatus)) {
  console.error('FAIL Patch A: v8 top Status line anchor not found.');
  console.error('Restore: Copy-Item -LiteralPath "' + backupPath + '" -Destination "' + TRACKER + '" -Force');
  process.exit(1);
}
let working = original.replace(oldStatus, newStatus);
console.log('Patch A applied: top Status line replaced');

// ─── PATCH B: append v9 between v8's last line and --- separator ─────────────
const v8tail = "  - **Next:** decide F-AREA-REROLL-TIMEOUT mitigation; resolve T6-decision (MLS-sync INSERT trigger Y/N); ship T6-followup-A/B/C as `scripts/r-territory-t6-followups.sql` + `scripts/r-territory-t6-followup-race.js`. Then T4a UI work.";
const v8tailAnchor = v8tail + eol + eol + "---";

const v9Lines = [
  "",
  "- **2026-05-06 v9** — **F-AREA-REROLL-TIMEOUT CLOSED + T6-decision LOCKED.** P1 production blocker surfaced in v8 is resolved; T6 smoke re-runs cleanly under Supabase's default `statement_timeout` (no override). All 6 tests PASS in single execution.",
  "  - **What shipped to production DB** (CREATE OR REPLACE x2 in one transaction via `scripts/apply-f-area-reroll-fix.js`):",
  "    - **`reroll_listings_at_geo(text,uuid,uuid)`** — row-by-row loop replaced by CTE-based set UPDATE. Routing set computed once via `ROW_NUMBER() OVER (ORDER BY id) - 1`; per-listing pick computed inline via `LEFT JOIN routing ON r.rn = abs(hashtext(ml.id::text)) % NULLIF(v_total, 0)`; final UPDATE filtered by `IS DISTINCT FROM` to preserve old \"only update if pick changed\" semantics. Empty routing set → picks become NULL via NULLIF + LEFT JOIN, matching old NULL return path.",
  "    - **`distribute_listings_at_geo(text,uuid,uuid)`** — same restructure. Filters to `assigned_agent_id IS NULL` (only fills empty slots, matching its existing semantics). Inner JOIN (not LEFT) since `IF v_total = 0 RETURN 0` shortcuts the empty-routing case before the UPDATE runs.",
  "    - Caller signatures unchanged. Triggers in T3b-C (`handle_apa_insert/update/delete`) call these unchanged.",
  "  - **Files committed in v9 batch:**",
  "    - `scripts/apply-f-area-reroll-fix.js` — runner: rollback snapshot + forward SQL archive + transactional CREATE OR REPLACE x2 + 6/6 verification of new bodies (contain `WITH routing AS`; old `FOR rec IN` / `FOR v_listing_id IN` markers gone).",
  "    - `scripts/r-territory-f-area-reroll-fix.sql` — forward SQL (5150 bytes), git-archived for history.",
  "    - `scripts/r-territory-f-area-reroll-rollback_20260506_165646.sql` — pre-apply snapshot of OLD function bodies (2256 bytes). Apply this file to revert to the row-by-row implementation.",
  "    - `scripts/probe-reroll-function.js` — diagnostic that surfaced the row-by-row bug; reusable for future function audits.",
  "    - `scripts/patch-smoke-runner-realistic-timeout.js` — turned forced `SET statement_timeout = 0` into env-gated opt-in. Default behavior now tests under Supabase's realistic ceiling; `DISABLE_STATEMENT_TIMEOUT=1` re-enables for tests that genuinely need long timeouts.",
  "    - `scripts/run-r-territory-t6-smoke.js` — patched per above.",
  "  - **Verification (this is the proof, not the claim):** smoke re-run with realistic `statement_timeout` produced identical PASS results to the v8 run. Setup row matched (whitby_area=`03d4e133-...`, test_muni=`94447f26-...`, test_muni_communities=20). Test 4 — the area-scope INSERT that triggered the timeout in v8 — completed without error. Audit deltas matched (Test 6 expected 20, actual 20). Final SUMMARY: `pass=6 fail=0 skip=0 total=6`.",
  "  - **T6-decision LOCKED at (b):** accept on-demand resolver fallback for `mls_listings.assigned_agent_id IS NULL`. No INSERT trigger on `mls_listings`. Existing resolver behavior IS the locked behavior — no code change required. Avoids thousands of unnecessary trigger fires per nightly MLS sync.",
  "  - **Performance characterization (qualitative):** old code = 67,850 calls × ~3 SQL ops each ≈ 200,000 ops per area-scope reroll, killed by statement_timeout mid-loop. New code = 1 set-based UPDATE planned as a hash join (verifiable with `EXPLAIN ANALYZE` if needed). Scales linearly with listing count. Quantitative benchmark deferred — not required for closure since `pass=6` under default timeout proves the threshold is met.",
  "  - **What's NOT closed yet (T6-followups remaining for full T6 closure):**",
  "    - **T6-followup-A** — race safety harness (concurrent INSERTs at same child scope). Needs Node + `pg.Pool` with two real connections. Will use the existing runner pattern.",
  "    - **T6-followup-B** — multi-level cascade resolver tests (area, community, neighbourhood — Test 1 only covered muni).",
  "    - **T6-followup-C** — `is_active` flip true→false fires reroll. Add Test 3b to the smoke (inverse of existing Test 3 which proves `is_primary` toggle is no-op).",
  "  - **Next gate:** T6-followup-A/B/C, then T4a (admin UI — F-AREA-REROLL mitigation no longer required since the underlying functions are now fast), then T4b (public geo page primary display), then T7 close.",
];
const v9Block = v9Lines.join(eol);

const v8tailReplacement = v8tail + eol + v9Block + eol + eol + "---";

if (!working.includes(v8tailAnchor)) {
  console.error('FAIL Patch B: v8 tail anchor not found.');
  console.error('Restore: Copy-Item -LiteralPath "' + backupPath + '" -Destination "' + TRACKER + '" -Force');
  process.exit(1);
}
working = working.replace(v8tailAnchor, v8tailReplacement);
console.log('Patch B applied: v9 entry appended to Status log');

// ─── PATCH C: replace ## Next action section ─────────────────────────────────
const nextActionIdx = working.indexOf("## Next action");
if (nextActionIdx === -1) {
  console.error('FAIL Patch C: ## Next action heading not found.');
  console.error('Restore: Copy-Item -LiteralPath "' + backupPath + '" -Destination "' + TRACKER + '" -Force');
  process.exit(1);
}

const newNextActionLines = [
  "## Next action",
  "",
  "**Three smoke followups, then UI work.** F-AREA-REROLL is no longer a blocker for T4a — the underlying functions complete within Supabase's default timeout, so admin endpoints don't need batching, queue infrastructure, or per-endpoint timeout raises.",
  "",
  "### 1. T6-followup-A — race safety harness",
  "",
  "Two pg connections in parallel attempt INSERTs at the same child scope. Assert exactly one succeeds (partial unique indexes from T2a-02 + `EXCEPTION WHEN unique_violation` in the trigger functions handle the conflict). Ships as `scripts/r-territory-t6-followup-race.js` using `pg.Pool` with two clients, `Promise.all` on competing INSERTs.",
  "",
  "Acceptance: 100 trial runs, every run shows exactly one INSERT succeeded and one raised `unique_violation` (caught by the trigger and retried, or surfaced cleanly to the caller — depends on T3b-C's actual handling; verify against current code).",
  "",
  "### 2. T6-followup-B — multi-level cascade resolver tests",
  "",
  "Extend `scripts/r-territory-t6-smoke.sql` (or a sibling `t6-smoke-extended.sql`) with sub-tests:",
  "",
  "- **Test 1b** — `resolve_geo_primary('area', whitby_area_id, tenant_id)` returns expected primary",
  "- **Test 1c** — `resolve_geo_primary('community', some_community_id, tenant_id)` returns expected primary",
  "- **Test 1d** — `resolve_geo_primary('neighbourhood', some_neighbourhood_id, tenant_id)` returns expected primary",
  "",
  "Each picks synthetic test data at runtime (same pattern as the existing Test 2's test_muni selection — pick a sibling at runtime, no hardcoded IDs).",
  "",
  "### 3. T6-followup-C — `is_active` flip fires reroll",
  "",
  "Add Test 3b to the smoke: pick an existing apa row, flip `is_active` true→false, assert `territory_assignment_changes` row count INCREASES (some change was logged) AND `mls_listings.assigned_agent_id` for that scope's listings is updated. This is the inverse of Test 3 (which proves `is_primary` toggle is a no-op). Together they exhaustively cover handle_apa_update's two paths.",
  "",
  "### After T6-followup-A/B/C close:",
  "",
  "- **T4a** — Admin UI at `/admin-homes/territory`. Standard implementation, no special async / batch / timeout-raise infra required (F-AREA-REROLL closed at function level, not endpoint level).",
  "- **T4b** — Public-facing geo page primary agent display via `resolve_display_agent_for_context`.",
  "- **T7** — Close the ticket. Update `W-LAUNCH-TRACKER.md` Section 4 W-TERRITORY row to CLOSED with commit hashes.",
  "",
  "### Optional / parallel:",
  "",
  "- **T2b** — percentage mode (still optional; can ship anytime, doesn't block T4).",
  "- **Hygiene** — ~30 untracked patch scripts in `scripts/` from earlier W-RECOVERY / W-ROLES-DELEGATION / W-LAUNCH work. Reproducibility debt; commit batch when convenient.",
  "",
];
const newNextAction = newNextActionLines.join(eol);

working = working.slice(0, nextActionIdx) + newNextAction;
console.log('Patch C applied: Next action section replaced');

// ─── Write back ──────────────────────────────────────────────────────────────
fs.writeFileSync(TRACKER, working, 'utf8');
console.log(`Wrote ${TRACKER} (${working.length} chars, delta ${working.length - original.length >= 0 ? '+' : ''}${working.length - original.length})`);

// ─── Verification ────────────────────────────────────────────────────────────
const verify = fs.readFileSync(TRACKER, 'utf8');
const checks = [
  { label: 'top Status updated to T6 CORE PASS + F-AREA-REROLL CLOSED',     test: verify.includes('T6 CORE PASS + F-AREA-REROLL CLOSED 2026-05-06') },
  { label: 'top Status v8 narrative removed',                                test: !verify.includes('**One P1 production finding surfaced — F-AREA-REROLL-TIMEOUT:**') },
  { label: 'T6-decision LOCKED at (b) marker present',                       test: verify.includes('T6-decision LOCKED at (b)') },
  { label: 'v9 entry header present',                                        test: verify.includes('2026-05-06 v9** — **F-AREA-REROLL-TIMEOUT CLOSED + T6-decision LOCKED') },
  { label: 'v8 entry preserved',                                             test: verify.includes('2026-05-06 v8** — **T6 CORE PASS — 6/6 tests green') },
  { label: 'v7 entry preserved',                                             test: verify.includes('2026-05-06 v7** — **T6 SCRIPT SHIPPED') },
  { label: 'v6 entry preserved',                                             test: verify.includes('2026-05-06 v6** — **T3b CLOSED') },
  { label: 'apply-f-area-reroll-fix.js mentioned in v9',                     test: verify.includes('scripts/apply-f-area-reroll-fix.js') },
  { label: 'rollback file mentioned in v9',                                  test: verify.includes('r-territory-f-area-reroll-rollback_20260506_165646.sql') },
  { label: 'verification "pass=6 fail=0 skip=0 total=6" still present',      test: verify.includes('pass=6 fail=0 skip=0 total=6') },
  { label: 'Next action heading present (singular)',                         test: (verify.match(/## Next action/g) || []).length === 1 },
  { label: 'Next action body lists T6-followup-A/B/C',                       test: verify.includes('T6-followup-A — race safety harness') && verify.includes('T6-followup-B — multi-level cascade') && verify.includes('T6-followup-C') },
  { label: 'Next action v8 body removed (no more F-AREA-REROLL design)',     test: !verify.includes('### 1. F-AREA-REROLL-TIMEOUT — design mitigation') },
];

let allPass = true;
console.log('');
console.log('Verification:');
for (const c of checks) {
  const status = c.test ? '  PASS' : '  FAIL';
  console.log(`${status}  ${c.label}`);
  if (!c.test) allPass = false;
}

if (!allPass) {
  console.error('');
  console.error('VERIFICATION FAILED — restore from backup with:');
  console.error(`  Copy-Item -LiteralPath "${backupPath}" -Destination "${TRACKER}" -Force`);
  process.exit(1);
}

console.log('');
console.log(`DONE. Tracker patched to v9. Backup retained: ${path.basename(backupPath)}`);
