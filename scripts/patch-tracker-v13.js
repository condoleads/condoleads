// scripts/patch-tracker-v13.js
//
// W-TERRITORY-TRACKER patch: v12 -> v13.
//
// Captures:
//   - F-APA-PRIMARY-AUDIT-GAP CLOSED (handle_apa_update now writes
//     primary_set / primary_unset / access_toggle_changed audit rows BEFORE
//     the early-return; v11 routing-affecting audit logic preserved; reroll
//     behaviour unchanged). Commit c85174e.
//   - T4a-1 CLOSED (is_primary toggle UI in GeoAssignmentSection +
//     auto-reassign loop in geo POST route; smoke 9/9 PASS via SAVEPOINT-
//     isolated code test). Commit 167c477.
//   - F-DISTRIBUTE-AUDIT-STATE-INCOMPLETE finding logged (distribute_geo_to_
//     children writes audit rows with NULL before/after_state; minor
//     data-quality issue, deferred fix).
//   - New workflow rule: smoke-via-savepoint-isolation pattern.
//
// Patches applied:
//   P1. Status line tail: T4a-1 marked CLOSED inline
//   P2. Insert v13 status log entry above v12
//   P3. Next Action -- replace T4a-1 sub-phase block with CLOSED summary
//   P4. Findings append: F-APA-PRIMARY-AUDIT-GAP (CLOSED) +
//       F-DISTRIBUTE-AUDIT-STATE-INCOMPLETE (open)
//   P5. Workflow rules append: smoke-via-savepoint-isolation pattern
//
// Pre-flight: requires v12 marker present, v13 marker absent.
// Idempotent: skips if V13_MARKER already present.
// Atomic: all patches in memory, file written once at end on full success.

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

const V12_MARKER = '- **2026-05-07 v12**';
const V13_MARKER = '- **2026-05-08 v13**';

if (original.indexOf(V13_MARKER) !== -1) {
  console.log('SKIP: V13_MARKER already present in tracker. No-op.');
  process.exit(0);
}

if (original.indexOf(V12_MARKER) === -1) {
  fail('v12 state not detected. Expected V12_MARKER (' + V12_MARKER + ') to be present. Run scripts/patch-tracker-v12.js first.');
}

const now = new Date();
const pad = function (n) { return String(n).padStart(2, '0'); };
const stamp =
  now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' +
  pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
const backupPath = TRACKER + '.backup_' + stamp;
fs.writeFileSync(backupPath, original);
console.log('Backup: ' + backupPath + ' (' + original.length + ' chars)');

const NL = '\r\n';

// ===========================================================================
// Patch content
// ===========================================================================

// ---- P1: Status line tail update ----

const P1_OLD =
  "**Next:** T4a-1 is_primary toggle, T4a-2 `/admin-homes/territory` coverage page, T4a-3 server-side diff fix for F-APA-DELETE-INSERT-CHURN, T4a-3b gated F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix (gate = caller probe at start of T4a-3 coding), then T4c, T4b, T7.";

const P1_NEW =
  "**Next:** T4a-1 \u2705 CLOSED v13 (handle_apa_update audits primary_set/unset + access_toggle_changed; UI toggle + auto-reassign route logic; smoke 9/9 PASS). T4a-2 `/admin-homes/territory` coverage page, T4a-3 server-side diff fix for F-APA-DELETE-INSERT-CHURN, T4a-3b gated F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix (gate = caller probe at start of T4a-3 coding), then T4c, T4b, T7.";

// ---- P2: Insert v13 entry above v12 ----

const P2_ANCHOR = "- **2026-05-07 v12** \u2014 **T4a recon complete; sub-phase scope locked; F-APA-DELETE-INSERT-CHURN + F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP findings logged.**";

const V13_ENTRY_LINES = [
  "- **2026-05-08 v13** \u2014 **F-APA-PRIMARY-AUDIT-GAP CLOSED + T4a-1 CLOSED + smoke pattern established.** Pre-T4a-1 coding surfaced a third audit gap parallel to F-APA-UPDATE-AUDIT-GAP (v11): `handle_apa_update`'s early-return for \"no routing-affecting changes\" silenced both `is_primary` flips AND access-toggle changes (`condo_access` / `homes_access` / `buildings_access` / `buildings_mode`). The audit table's `change_type` CHECK already accepted `'primary_set'`, `'primary_unset'`, `'access_toggle_changed'` \u2014 architecture intended these to be tracked; trigger code never wrote them. Closed before T4a-1's UI introduced silent state changes via the new toggle.",
  "",
  "  - **Files shipped this batch:**",
  "    - `scripts/r-territory-f-apa-primary-audit-gap-fix.js` \u2014 Node migration runner. Captures rollback snapshot via `pg_get_functiondef('public.handle_apa_update()'::regprocedure)`, applies `CREATE OR REPLACE FUNCTION` inside a transaction, verifies new body contains all 8 markers (3 new + 5 v11 preserved + 2 reroll calls + 1 early-return), COMMIT on success / ROLLBACK on any verification mismatch. Idempotent (skips if all 3 new markers already present in live body).",
  "    - `scripts/r-territory-f-apa-primary-audit-gap-fix.sql` \u2014 forward SQL of the new function body (git-archived).",
  "    - `scripts/r-territory-f-apa-primary-audit-gap-rollback_20260508_045125.sql` \u2014 pre-apply snapshot of v11 function body for rollback.",
  "    - `scripts/r-territory-t4a-1-is-primary-toggle.js` \u2014 Node patch script for T4a-1 UI + route changes. 10 component edits (Star import, Assignment interface field, PrimaryToggle component, isPrimary state, togglePrimary helper, addAssignment + reset, three row renderings \u2014 inherited locked + green editable + amber editable, Add form checkbox) + 2 route edits (is_primary in row mapping, auto-reassign loop before INSERT). Atomic per-file with timestamped backups; CRLF-aware (component .tsx is CRLF, route .ts is LF). Required two anchor-fix iterations during apply (CRLF mismatch on multi-line anchors first round; alreadyMarker false-positive on green/amber rows second round).",
  "    - `scripts/r-territory-t4a-1-smoke.js` \u2014 9-test code smoke covering the v13 trigger fix + T4a-1 auto-reassign pattern. Single-transaction with `ROLLBACK` at end (production never committed). Tests T1\u2013T9: is_primary off\u2192on writes primary_set; on\u2192off writes primary_unset; condo_access flip writes access_toggle_changed; buildings_mode change writes access_toggle_changed; combined flip writes 2 audits; no-op UPDATE writes 0 audits (early-return preserved); is_active true\u2192false writes assignment_revoked (v11 path preserved); inactive row is_primary flip writes 0 audits (early-skip on inactive); auto-reassign UPDATE writes primary_unset on displaced holder. TSC clean. Per Shah directive, code smoke replaced manual UI smoke; trigger pipeline + route logic verified at SQL layer, React UI verified via TSC + diff review.",
  "",
  "  - **F-DISTRIBUTE-AUDIT-STATE-INCOMPLETE finding logged (open, deferred):** during smoke baseline read, the historical `primary_set` audit rows written by `distribute_geo_to_children` (canonical N=11 Whitby smoke from T3b-B v6) had NULL `before_state` AND NULL `after_state`. The distribute trigger writes the audit row but does NOT capture the apa row's state JSON. Data-quality issue, not blocking \u2014 agent_id + scope + scope_id + change_type carry the routing-relevant signal; missing state JSON only impairs reconstruction of full row state from audit log. Fix would add `to_jsonb(NEW)` capture to `distribute_geo_to_children`'s INSERT block. Deferred \u2014 `distribute_geo_to_children` is currently the primary writer of `primary_set` events and its callers are well-understood; cleanup non-urgent.",
  "",
  "  - **Smoke-via-savepoint-isolation pattern (workflow note):** the runner in `r-territory-t4a-1-smoke.js` is reusable for any future trigger or route smoke. Single transaction with final ROLLBACK; per-test SAVEPOINT + ROLLBACK TO SAVEPOINT to prevent test drift; setup-action-snapshot-assert pattern per test. Encoded as a workflow rule below.",
  "",
  "  - **Commits:** `c85174e` (F-APA-PRIMARY-AUDIT-GAP fix), `167c477` (T4a-1 close + integrated smoke).",
  "",
  "  - **Next:** T4a-2 \u2014 new `/admin-homes/territory` coverage page (per-tenant view scope, coverage table + audit log viewer + stats card; two new API routes; auth pattern mirrors existing geo route).",
  ""
];

const V13_ENTRY = V13_ENTRY_LINES.join(NL) + NL;
const P2_NEW = V13_ENTRY + P2_ANCHOR;

// ---- P3: Replace T4a-1 sub-phase block with CLOSED summary ----

const P3_OLD_START = "**T4a-1: `is_primary` toggle in `GeoAssignmentSection`**";
const P3_OLD_END = "**T4a-2: New `/admin-homes/territory` page**";

const P3_NEW = [
  "**T4a-1: `is_primary` toggle in `GeoAssignmentSection`** \u2705 CLOSED 2026-05-08 v13",
  "",
  "- Added `is_primary?: boolean` to `Assignment` interface; per-row toggle button in green/amber editable rows; locked PRIMARY badge in inherited rows; \"Primary\" checkbox in Add form. 10 component edits + 2 route edits via `scripts/r-territory-t4a-1-is-primary-toggle.js`.",
  "- Geo POST route: `is_primary` persisted via row mapping; auto-reassign loop runs BEFORE INSERT (UPDATE other agents at same `(scope, scope_id)` to `is_primary=false`, scoped by `tenant_id`). Avoids partial-unique-index conflict; produces clean `primary_unset` audit rows via `handle_apa_update` (post-F-APA-PRIMARY-AUDIT-GAP fix v13).",
  "- Code smoke 9/9 PASS via `scripts/r-territory-t4a-1-smoke.js` (single-transaction, SAVEPOINT-isolated tests, ROLLBACK at end). Verified: trigger writes `primary_set`/`primary_unset`/`access_toggle_changed` on respective changes; v11 routing-affecting path preserved; early-return preserved on no-op; auto-reassign produces `primary_unset` on displaced agent.",
  "- Commits: `c85174e` (audit-gap fix) + `167c477` (T4a-1 close + smoke).",
  "",
  ""
].join(NL);

// ---- P4: Findings append ----

const P4_ANCHOR = "Caller probe runs at start of T4a-3 coding.";

const P4_NEW = [
  "Caller probe runs at start of T4a-3 coding.",
  "",
  "**F-APA-PRIMARY-AUDIT-GAP (2026-05-08, CLOSED v13):** `handle_apa_update` early-returned silently on display/policy-only changes (`is_primary` flip + access toggles) \u2014 those events were never audited despite the audit table's `change_type` CHECK accepting `'primary_set'`, `'primary_unset'`, `'access_toggle_changed'`. Same root pattern as F-APA-UPDATE-AUDIT-GAP (v11) one layer deeper. Fix added three audit-write blocks BEFORE the early-return in `handle_apa_update` \u2014 `primary_set`/`primary_unset` on `is_primary` flip, `access_toggle_changed` on any access-related field change. Early-return preserved AFTER audit writes; reroll unchanged. Migration applied via `scripts/r-territory-f-apa-primary-audit-gap-fix.js` with verify-then-commit (8-marker check); smoke 9/9 PASS in `scripts/r-territory-t4a-1-smoke.js`. Commit `c85174e`.",
  "",
  "**F-DISTRIBUTE-AUDIT-STATE-INCOMPLETE (2026-05-08, OPEN \u2014 minor):** `distribute_geo_to_children` writes `primary_set` audit rows when fanning parent-scope assignments to child geos, but the rows have NULL `before_state` AND NULL `after_state` \u2014 the function neglects to populate the JSON state columns. Surfaced during T4a-1 smoke baseline read of the historical distribute_geo_to_children-written rows from the canonical N=11 Whitby smoke (T3b-B v6). Data-quality issue not blocking \u2014 `agent_id` / `scope` / `scope_id` / `change_type` carry the routing-relevant signal; missing state JSON only affects reconstruction of full row state from audit log. Fix scope: add `to_jsonb(NEW)` capture to `distribute_geo_to_children` PL/pgSQL `INSERT INTO territory_assignment_changes`. Deferred \u2014 `distribute_geo_to_children` callers are well-understood; cleanup non-urgent."
].join(NL);

// ---- P5: Workflow rules append ----

const P5_ANCHOR = "Encoded in `scripts/probe-apa-trigger-functions.js` -> `scripts/r-territory-f-apa-update-audit-gap-fix.js` workflow.";

const P5_NEW =
  P5_ANCHOR + NL +
  "- **Smoke-via-savepoint-isolation pattern (v13):** any future trigger or route smoke test should run all assertions inside a single transaction with a final `ROLLBACK`; each test isolated via per-test `SAVEPOINT` + `ROLLBACK TO SAVEPOINT` so tests don't drift. Production data is never committed. Pattern: setup state inside savepoint, snapshot audit count, perform action, count delta + read latest N audit rows, assert, rollback to savepoint. Encoded in `scripts/r-territory-t4a-1-smoke.js`. Reusable for any future apa / route / trigger verification.";

// ===========================================================================
// Apply patches
// ===========================================================================

const patches = [
  { name: "P1: status line tail update", kind: "replace", old: P1_OLD, new: P1_NEW },
  { name: "P2: insert v13 entry above v12", kind: "replace", old: P2_ANCHOR, new: P2_NEW },
  { name: "P3: T4a-1 sub-phase -> CLOSED summary", kind: "span-replace", startAnchor: P3_OLD_START, endAnchor: P3_OLD_END, new: P3_NEW },
  { name: "P4: Findings append (F-APA-PRIMARY-AUDIT-GAP + F-DISTRIBUTE-AUDIT-STATE-INCOMPLETE)", kind: "replace", old: P4_ANCHOR, new: P4_NEW },
  { name: "P5: Workflow rules append (smoke-via-savepoint-isolation)", kind: "replace", old: P5_ANCHOR, new: P5_NEW }
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
    content = content.slice(0, startIdx) + p.new + content.slice(endIdx);
    results.push({ name: p.name, status: "OK", delta: p.new.length - oldSpan.length });
  }
}

console.log("\nPatch results:");
for (const r of results) {
  let line = "  " + r.status + ": " + r.name;
  if (r.reason) line += " \u2014 " + r.reason;
  if (typeof r.delta === "number") line += " (delta " + (r.delta >= 0 ? "+" : "") + r.delta + " chars)";
  console.log(line);
}

const failed = results.filter(function (r) { return r.status === "FAIL"; });
if (failed.length > 0) {
  console.error("\nFAIL: " + failed.length + " patch(es) failed. Original file untouched. Backup at " + backupPath + " (identical to original \u2014 discardable).");
  process.exit(1);
}

if (content === original) {
  console.log("\nNo-op: file already at target state.");
  process.exit(0);
}

fs.writeFileSync(TRACKER, content);
console.log("\nWrote: " + TRACKER + " (" + content.length + " chars; net delta " + (content.length - original.length) + " chars)");
console.log("Diff: git diff -- " + TRACKER);