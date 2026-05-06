// scripts/patch-tracker-v8.js
// W-TERRITORY/T6 v8 — apply three exact-string patches to docs/W-TERRITORY-TRACKER.md
//
//   A. Replace top **Status:** line with v8 state (T6 CORE PASS).
//   B. Append v8 entry to ## Status log between v7 and the --- separator.
//   C. Replace ## Next action section with v8 forward plan.
//
// Pre-flight: timestamped backup. Fail-fast on any anchor miss. Verify all
// markers post-write. Restore command printed if verification fails.
//
// USAGE (from C:\Condoleads\project):
//   node scripts\patch-tracker-v8.js

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
const oldStatus = "**Status:** **T6 SCRIPT READY 2026-05-06.** `scripts/r-territory-t6-smoke.sql` produced — 6-test transactional smoke (BEGIN…ROLLBACK; production data untouched). Covers: (1) cascade resolution, (2) AFTER INSERT trigger creates community primaries, (3) UPDATE on `is_primary` is no-op, (4) recursion guard prevents area→community cascade, (5) AFTER DELETE fires without crash, (6) audit trail rows written. Three deferrals documented (race safety not single-tx-testable; MLS-sync is a decision item not a test; multi-level cascade + `is_active` flip are followups). **Pending:** paste into Supabase SQL editor + record PASS/FAIL per test. T1, T2a, T3a, T3b shipped. T4a/T4b UI work is the next gate after T6 PASS.";

const newStatus = "**Status:** **T6 CORE PASS 2026-05-06.** All 6 tests PASS via `scripts/run-r-territory-t6-smoke.js` (Node + pg, bypasses Studio's payload limit). Confirms: resolver baseline holds post-T3b; INSERT trigger fans out 20 community primaries on a sibling-muni INSERT; `is_primary` toggle is a true no-op (no audit, no apa change); recursion guard blocks depth-2 cascade (area INSERT does NOT touch community level); DELETE trigger runs clean; audit trail writes one row per child primary. **One P1 production finding surfaced — F-AREA-REROLL-TIMEOUT:** area-scope reroll on a large area (Whitby) exceeds Supabase's default `statement_timeout`; admin UI must batch or async this in production. Three followups still tracked: race safety (T6-followup-A, needs external harness), multi-level cascade (T6-followup-B), `is_active` flip reroll (T6-followup-C); plus T6-decision (MLS-sync trigger Y/N). T1, T2a, T3a, T3b, T6-core all closed. **Next:** address F-AREA-REROLL-TIMEOUT mitigation + close T6-decision before T4a UI work.";

if (!original.includes(oldStatus)) {
  console.error('FAIL Patch A: v7 top Status line anchor not found.');
  console.error('Restore: Copy-Item -LiteralPath "' + backupPath + '" -Destination "' + TRACKER + '" -Force');
  process.exit(1);
}
let working = original.replace(oldStatus, newStatus);
console.log('Patch A applied: top Status line replaced');

// ─── PATCH B: append v8 between v7's last line and --- separator ─────────────
const v7tail = "  - **Next:** Paste the script into Supabase SQL editor as one block, record per-test PASS/FAIL/SKIP results in this log as v8. Resolve T6-decision (MLS-sync trigger Y/N) before T4a/T4b. Then T4a/T4b UI work.";
const v7tailAnchor = v7tail + eol + eol + "---";

const v8Lines = [
  "",
  "- **2026-05-06 v8** — **T6 CORE PASS — 6/6 tests green.** Smoke executed via `scripts/run-r-territory-t6-smoke.js` (Node + `pg`); bypassed Supabase Studio's ~10 KB payload limit which had been returning \"Failed to fetch\" on the 14 KB script. Runner sets `statement_timeout = 0` per session, then sends body + final SELECT + ROLLBACK over a single connection. Production data untouched (transaction rolled back).",
  "  - **Setup row** — tenant=`b16e1039-...`, king_shah=`fafcd5b1-...`, whitby_muni=`70103aef-...`, whitby_area=`03d4e133-d9f9-4a7e-ba9a-83e57269c1d4` (newly captured), test_muni=`94447f26-216a-47be-ac73-d07f33732036` (selected at runtime — sibling muni in Whitby area), test_muni_communities=**20**.",
  "  - **Test 1 PASS** — `resolve_geo_primary('municipality', whitby_id, tenant_id)` returned `fafcd5b1-...` (King Shah). Resolver baseline preserved post-T3b trigger install.",
  "  - **Test 2 PASS** — INSERT apa at muni scope on test_muni → community-primary count went 0 → 20. expected_delta=20, actual_delta=20. `handle_apa_insert` + `distribute_geo_to_children` correctly fanned out at scale 20 (vs the canonical N=11 in T3b-B's Whitby smoke). All-distinct child-scope distribution at higher cardinality confirmed.",
  "  - **Test 3 PASS** — is_primary toggle (false→true) on a community-primary row: audit count 31 → 31, apa count 33 → 33. `handle_apa_update`'s early-return path verified — `is_primary` is purely cosmetic.",
  "  - **Test 4 PASS** — INSERT apa at AREA scope on Whitby's parent area: community-primary count UNCHANGED (31 → 31, delta 0). Muni-primary count went 1 → 8 (area→muni distribution at depth 1 created 7 new muni primaries — the Whitby area has 8 munis total). Recursion guard (`pg_trigger_depth() > 1`) verified at depth 2.",
  "  - **Test 5 PASS** — DELETE of the area-scope row from Test 4 ran clean. `handle_apa_delete` + `reroll_listings_at_geo` invoked without exception.",
  "  - **Test 6 PASS** — `territory_assignment_changes` audit rows from Test 2's distribution: expected_audit_rows=20, actual=20. One audit row per community primary, change_type='primary_set'.",
  "  - **SUMMARY** — `pass=6 fail=0 skip=0 total=6`.",
  "  - **NEW P1 production finding (F-AREA-REROLL-TIMEOUT):** Initial run hit `canceling statement due to statement timeout` on Test 4's area-scope INSERT — the trigger called `reroll_listings_at_geo('area', whitby_area_id, ...)` which tried to UPDATE every `mls_listings` row in the area in one statement. Supabase's default `statement_timeout` killed it. Fixed in the runner via `SET statement_timeout = 0;`. **In production, an admin assigning at area scope will hit the same wall via the API/UI.** Three mitigation options for T4a (admin UI) design: (a) batch the UPDATE into chunks of N rows; (b) async the reroll via a background job after the apa INSERT commits; (c) accept the slowdown and raise per-request statement_timeout for admin endpoints only. Decision needed at or before T4a kickoff.",
  "  - **Workflow note:** the runner pattern (Node + `pg` + connection-string env-var fallback chain + body/finalSelect split on comment markers) is now the established way to run any future SQL test that exceeds Studio's ~10 KB limit. Reusable for T6 followups.",
  "  - **Next:** decide F-AREA-REROLL-TIMEOUT mitigation; resolve T6-decision (MLS-sync INSERT trigger Y/N); ship T6-followup-A/B/C as `scripts/r-territory-t6-followups.sql` + `scripts/r-territory-t6-followup-race.js`. Then T4a UI work.",
];
const v8Block = v8Lines.join(eol);

const v7tailReplacement = v7tail + eol + v8Block + eol + eol + "---";

if (!working.includes(v7tailAnchor)) {
  console.error('FAIL Patch B: v7 tail anchor not found.');
  console.error('Restore: Copy-Item -LiteralPath "' + backupPath + '" -Destination "' + TRACKER + '" -Force');
  process.exit(1);
}
working = working.replace(v7tailAnchor, v7tailReplacement);
console.log('Patch B applied: v8 entry appended to Status log');

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
  "**Three items in sequence, all this working block:**",
  "",
  "### 1. F-AREA-REROLL-TIMEOUT — design mitigation",
  "",
  "Surfaced in T6 Test 4. Production blocker for any admin who assigns an agent at area scope on a large area (the Whitby area has 8 munis, hundreds-to-thousands of listings). Three options to evaluate:",
  "",
  "- **(a) Batch the UPDATE** — modify `reroll_listings_at_geo` to chunk the UPDATE into N rows (e.g., 500/iter) so the trigger doesn't blow past statement_timeout. Pros: single-tx, deterministic. Cons: still synchronous, still slow, ties up the request.",
  "- **(b) Async via job table** — apa INSERT writes a row to a `territory_reroll_jobs` queue; a worker (cron / pg_cron / external poller) picks it up and runs the reroll outside the request lifecycle. Pros: request returns instantly, no user-perceived latency. Cons: eventual consistency (geo page may show stale agents for seconds-to-minutes); needs queue infra.",
  "- **(c) Per-endpoint timeout raise** — admin endpoints `SET LOCAL statement_timeout = '5min'` in their request handler. Apa INSERT still blocks but doesn't error. Pros: minimal code change. Cons: 5-minute admin requests are bad UX; still a hard ceiling for huge areas.",
  "",
  "Most production-grade is (b); fastest to ship is (c); cleanest single-tx is (a). Decision pending Shah's call.",
  "",
  "### 2. T6-decision — MLS-sync INSERT trigger",
  "",
  "When nightly MLS sync inserts new `mls_listings` rows, they arrive with NULL `assigned_agent_id`. Two options:",
  "",
  "- **(a) Add an INSERT trigger on `mls_listings`** that calls `distribute_listings_at_geo` for the new row's geo scope. Pro: cache always populated. Con: nightly sync of thousands of rows = thousands of trigger fires.",
  "- **(b) Accept on-demand fallback via resolver** — when `mls_listings.assigned_agent_id` is NULL on read, the resolver falls through to `agent_property_access` and returns a routing agent. Pro: zero overhead on sync. Con: read path is slightly slower for unsynced rows.",
  "",
  "**Recommendation: (b).** Resolver already handles NULL gracefully; trigger overhead on sync is real and avoidable. Decision can be locked once Shah confirms.",
  "",
  "### 3. T6-followup-A/B/C — extend the smoke",
  "",
  "- **A — race safety** — needs external harness (two pg connections, concurrent INSERT at same child scope, assert exactly one primary survives via partial unique index). Ships as `scripts/r-territory-t6-followup-race.js` (Node + `pg` Pool).",
  "- **B — multi-level cascade** — extend the existing smoke with sub-tests covering area-, community-, and neighbourhood-level resolver calls. Synthetic geo data picked at runtime.",
  "- **C — `is_active` flip fires reroll** — add a Test 3b: flip `is_active` true→false on an existing apa row, assert audit row count increases AND `mls_listings.assigned_agent_id` for that scope's listings is updated.",
  "",
  "B and C ship together as additions to `scripts/r-territory-t6-smoke.sql` (or a sibling `t6-smoke-extended.sql` if size grows). A ships as a separate Node script.",
  "",
  "### After T6-* fully closed:",
  "",
  "- **T4a** — Admin UI at `/admin-homes/territory`. **Must implement the F-AREA-REROLL-TIMEOUT mitigation** chosen above.",
  "- **T4b** — Public-facing geo page primary agent display.",
  "- **T7** — Close the ticket.",
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
  { label: 'top Status updated to T6 CORE PASS',                test: verify.includes('T6 CORE PASS 2026-05-06') },
  { label: 'top Status v7 (T6 SCRIPT READY) removed',           test: !verify.includes('T6 SCRIPT READY 2026-05-06') },
  { label: 'F-AREA-REROLL-TIMEOUT marker present',              test: verify.includes('F-AREA-REROLL-TIMEOUT') },
  { label: 'v8 entry header present',                            test: verify.includes('2026-05-06 v8** — **T6 CORE PASS — 6/6 tests green') },
  { label: 'v7 entry preserved',                                 test: verify.includes('2026-05-06 v7** — **T6 SCRIPT SHIPPED') },
  { label: 'v6 entry preserved',                                 test: verify.includes('2026-05-06 v6** — **T3b CLOSED') },
  { label: 'all six T6 PASS lines present',                      test: ['Test 1 PASS','Test 2 PASS','Test 3 PASS','Test 4 PASS','Test 5 PASS','Test 6 PASS'].every(s => verify.includes(s)) },
  { label: 'SUMMARY line `pass=6 fail=0 skip=0 total=6` present',test: verify.includes('pass=6 fail=0 skip=0 total=6') },
  { label: 'whitby_area uuid recorded',                          test: verify.includes('03d4e133-d9f9-4a7e-ba9a-83e57269c1d4') },
  { label: 'test_muni uuid recorded',                            test: verify.includes('94447f26-216a-47be-ac73-d07f33732036') },
  { label: 'Next action heading present (singular)',             test: (verify.match(/## Next action/g) || []).length === 1 },
  { label: 'Next action body has F-AREA-REROLL-TIMEOUT section', test: verify.includes('### 1. F-AREA-REROLL-TIMEOUT') },
  { label: 'Next action v7 body removed',                        test: !verify.includes('T6 — Execute the smoke matrix') },
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
console.log(`DONE. Tracker patched to v8. Backup retained: ${path.basename(backupPath)}`);