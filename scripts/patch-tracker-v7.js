// scripts/patch-tracker-v7.js
// W-TERRITORY/T6 v7 — apply three exact-string patches to docs/W-TERRITORY-TRACKER.md
//
//   A. Replace top **Status:** line with v7 state (T6 SCRIPT READY).
//   B. Append v7 entry to ## Status log between v6 and the --- separator.
//   C. Replace the entire ## Next action section with the v7 forward plan.
//
// Pre-flight: timestamped backup. Fail-fast on any anchor miss. Verify all
// markers post-write. Restore command printed if verification fails.
//
// USAGE (from C:\Condoleads\project):
//   node scripts\patch-tracker-v7.js

const fs = require('fs');
const path = require('path');

const TRACKER = path.resolve('docs/W-TERRITORY-TRACKER.md');

if (!fs.existsSync(TRACKER)) {
  console.error('FAIL: tracker not found at', TRACKER);
  process.exit(1);
}

// ─── Belt-and-suspenders backup ──────────────────────────────────────────────
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
const oldStatus = "**Status:** **T3b CLOSED 2026-05-06.** All four sub-phases (T3b-A: cache column, T3b-B: distribution functions, T3b-C: triggers, T3b-D: caller updates) shipped to production. End-to-end smoke PASS (11/11 community primaries assigned at N=1 canonical scenario). TSC clean. The territory system is **fully autonomous** — any `agent_property_access` change auto-cascades through territory updates without manual function calls. T1, T2a, T3a, T3b all complete. **T6 (smoke matrix) is the next gate** — validate autonomous behavior under realistic edge cases before T4a/T4b UI work. T2b (percentage mode) remains optional/parallel.";

const newStatus = "**Status:** **T6 SCRIPT READY 2026-05-06.** `scripts/r-territory-t6-smoke.sql` produced — 6-test transactional smoke (BEGIN…ROLLBACK; production data untouched). Covers: (1) cascade resolution, (2) AFTER INSERT trigger creates community primaries, (3) UPDATE on `is_primary` is no-op, (4) recursion guard prevents area→community cascade, (5) AFTER DELETE fires without crash, (6) audit trail rows written. Three deferrals documented (race safety not single-tx-testable; MLS-sync is a decision item not a test; multi-level cascade + `is_active` flip are followups). **Pending:** paste into Supabase SQL editor + record PASS/FAIL per test. T1, T2a, T3a, T3b shipped. T4a/T4b UI work is the next gate after T6 PASS.";

if (!original.includes(oldStatus)) {
  console.error('FAIL Patch A: top Status line anchor not found.');
  console.error('Restore: Copy-Item -LiteralPath "' + backupPath + '" -Destination "' + TRACKER + '" -Force');
  process.exit(1);
}
let working = original.replace(oldStatus, newStatus);
console.log('Patch A applied: top Status line replaced');

// ─── PATCH B: append v7 entry between v6 last bullet and the --- separator ───
const v6tail = "  - **T3 phase fully closed.** Next gate: T6 (smoke matrix) recommended before T4a/T4b UI work, to validate edge cases under autonomous trigger fires (race conditions, scope changes, scale, MLS sync boundary).";
const v6tailAnchor = v6tail + eol + eol + "---";

const v7Lines = [
  "",
  "- **2026-05-06 v7** — **T6 SCRIPT SHIPPED (execution pending).** `scripts/r-territory-t6-smoke.sql` reconstructed and produced complete after prior session cut off mid-artifact. Single transaction with `ROLLBACK;` at end — production data is never touched. Six tests + setup row + summary row.",
  "  - **Test 1** — `resolve_geo_primary('municipality', whitby_id, tenant_id)` returns King Shah. Verifies the T3a resolver baseline still works post-T3b trigger install.",
  "  - **Test 2** — INSERT apa at muni scope on a Whitby-area sibling muni (selected at runtime: must have communities AND no existing apa) → assert community-primary count increases by `test_muni_communities`. Verifies `handle_apa_insert` + `distribute_geo_to_children` end-to-end.",
  "  - **Test 3** — Pick any existing community-primary row, toggle `is_primary` false→true. Assert `agent_property_access` row count and `territory_assignment_changes` row count unchanged. Verifies `handle_apa_update` early-return.",
  "  - **Test 4** — INSERT apa at AREA scope on Whitby's parent area. Assert community-primary count UNCHANGED (recursion guard at depth 2). Muni-primary count is allowed to change (area→muni at depth 1 is the legitimate fan-out).",
  "  - **Test 5** — DELETE the area-scope row from Test 4. Assert no exception (proves `handle_apa_delete` + `reroll_listings_at_geo` both run clean). Status `PASS` if delete completes; `SKIP` if Test 4 never inserted.",
  "  - **Test 6** — Count audit rows written by Test 2's distribution. Expected = `test_muni_communities`, actual must match.",
  "  - **Deferrals (intentional, with reason):** (a) **race safety** — concurrent inserts at same child scope can't be simulated inside a single transaction; needs two connections or external harness; tracked as **T6-followup-A**. (b) **MLS-sync boundary** — this is a decision (add INSERT trigger on `mls_listings` vs accept on-demand fallback via resolver), not a test; tracked as **T6-decision**. (c) **multi-level cascade** (area, community, neighbourhood) — Test 1 only covers muni; other levels would need synthetic geo data setup; tracked as **T6-followup-B**. (d) **`is_active` flip DOES fire reroll** — Test 3 covers the no-op direction (`is_primary` toggle); the inverse (`is_active` true→false fires reroll/audit) is **T6-followup-C**.",
  "  - **Pre-existing finding logged** (not in T6 scope): `app/api/walliam/estimator/session/route.ts` still missing `p_tenant_id` arg per v6. Multi-tenant gap predates T3a; needs its own surgical patch.",
  "  - **Next:** Paste the script into Supabase SQL editor as one block, record per-test PASS/FAIL/SKIP results in this log as v8. Resolve T6-decision (MLS-sync trigger Y/N) before T4a/T4b. Then T4a/T4b UI work.",
];
const v7Block = v7Lines.join(eol);

const v6tailReplacement = v6tail + eol + v7Block + eol + eol + "---";

if (!working.includes(v6tailAnchor)) {
  console.error('FAIL Patch B: v6 tail anchor not found.');
  console.error('Restore: Copy-Item -LiteralPath "' + backupPath + '" -Destination "' + TRACKER + '" -Force');
  process.exit(1);
}
working = working.replace(v6tailAnchor, v6tailReplacement);
console.log('Patch B applied: v7 entry appended to Status log');

// ─── PATCH C: replace ## Next action section through end of file ─────────────
const nextActionIdx = working.indexOf("## Next action");
if (nextActionIdx === -1) {
  console.error('FAIL Patch C: ## Next action heading not found.');
  console.error('Restore: Copy-Item -LiteralPath "' + backupPath + '" -Destination "' + TRACKER + '" -Force');
  process.exit(1);
}

const newNextActionLines = [
  "## Next action",
  "",
  "**T6 — Execute the smoke matrix.** Script ready: `scripts/r-territory-t6-smoke.sql`. Ship-ready, no parameters, transactional. Steps:",
  "",
  "1. Open Supabase SQL editor for the condoleads project.",
  "2. Open `scripts/r-territory-t6-smoke.sql` locally, copy the entire contents (BEGIN through ROLLBACK).",
  "3. Paste as one block into the SQL editor and Run.",
  "4. Read the final result table — one row per test (0=SETUP info, 1–6=tests, 99=summary). Each row: `test_id | test_name | result | detail`.",
  "5. Record results in this tracker as v8: per-test PASS/FAIL/SKIP plus the SUMMARY row.",
  "6. If any FAIL: do not patch the script blindly. Read the SQLERRM detail, find the root cause in the trigger or distribute function, fix at source. Re-run script (it's idempotent; ROLLBACK undoes everything every time).",
  "",
  "**After T6 PASS, in order:**",
  "",
  "- **T6-decision** — MLS-sync boundary. Decide: add an `AFTER INSERT` trigger on `mls_listings` to call `distribute_listings_at_geo`, or accept on-demand fallback via the resolver when a request hits a row with NULL `assigned_agent_id`. Document choice in v9.",
  "- **T6-followup-A/B/C** — Race safety harness, multi-level cascade tests, `is_active` flip reroll test. Ship together as `scripts/r-territory-t6-followups.sql` once the core six tests are green.",
  "- **T4a** — Admin UI at `/admin-homes/territory`.",
  "- **T4b** — Public-facing geo page primary agent display.",
  "- **T7** — Close the ticket.",
  "",
  "**Alternative path:** T2b (percentage mode) is still optional/parallel. If Shah wants visible end-user value before deeper smoke testing, T4b can run in parallel with T6 followups — but T6 core PASS is a hard prerequisite for ANY UI work, because the UI is a window onto a system that must already be correct.",
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
  { label: 'top Status updated to T6 SCRIPT READY', test: verify.includes('T6 SCRIPT READY 2026-05-06') },
  { label: 'top Status old (T3b CLOSED prefix) removed', test: !verify.includes('**Status:** **T3b CLOSED 2026-05-06.**') },
  { label: 'v7 entry header present', test: verify.includes('2026-05-06 v7** — **T6 SCRIPT SHIPPED') },
  { label: 'v6 entry preserved', test: verify.includes('2026-05-06 v6** — **T3b CLOSED') },
  { label: 'all six T6 test bullets present', test: ['Test 1**','Test 2**','Test 3**','Test 4**','Test 5**','Test 6**'].every(s => verify.includes(s)) },
  { label: 'Deferrals block present', test: verify.includes('**Deferrals (intentional, with reason):**') },
  { label: 'Next action heading still present (singular)', test: (verify.match(/## Next action/g) || []).length === 1 },
  { label: 'Next action body updated', test: verify.includes('T6 — Execute the smoke matrix') },
  { label: 'Next action old body removed', test: !verify.includes('Recommended over T2b (percentage) because T6 protects all the autonomous behavior') },
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
console.log(`DONE. Tracker patched to v7. Backup retained: ${path.basename(backupPath)}`);