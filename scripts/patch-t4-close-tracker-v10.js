#!/usr/bin/env node
/**
 * patch-t4-close-tracker-v10.js
 *
 * W-LEADS-EMAIL T4 close: tracker v9 -> v10.
 *
 * T4 was confirm-and-close per OD-1=(c) anchor (locked at v2). Probe v2
 * (`scripts/probe-t4-credit-vs-lead-matrix-v2.js`) ran whole-file regex +
 * proximity classification and produced clean evidence:
 *   - Matrix A: 0 proximity-concerns, 11 distant credit refs (all in
 *     unrelated auto-approval blocks)
 *   - Matrix B: 14 lead-write surfaces — 8 EXPECTED (audit-wired) + 6
 *     OUT-OF-SCOPE (4 System 1 legacy + 2 System 2 UPDATE-only management)
 *
 * Patches:
 *   P1 status line: T3 closed -> T3 + T4 closed
 *   P2 Next action paragraph: T4 roadmap -> T5 roadmap (regex)
 *   P3 insert v10 status log entry above v9 line (regex)
 *   P4 insert F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP finding after F-LERL line (regex)
 *   P5 (conditional) update T4 section header if present (regex; skip if absent)
 *
 * Atomic validation pre-write. Backup pre-edit. Read-write only on the tracker.
 */

const fs = require('fs')
const path = require('path')

const F = 'docs/W-LEADS-EMAIL-TRACKER.md'
const filePath = path.resolve(F)

if (!fs.existsSync(filePath)) {
  console.error('FAIL: tracker not found at ' + filePath)
  process.exit(1)
}

let working = fs.readFileSync(filePath, 'utf8')
const original = working

// ============================================================================
// P1 — Status line update (anchored to v9 text written 2026-05-11)
// ============================================================================

const P1_OLD = '**Status:** T2 ✅ CLOSED 2026-05-10. **T3 phase ✅ CLOSED 2026-05-11.** All sub-phases shipped: T3a helper (commit `27fe944`), T3b 4 LEAD_WRITER routes wired + 2 hotfixes (T2f-followup-grants migration, T3b-hotfix-A helper-schema vocabulary alignment) at v7/v8, T3c 4 EMAIL_ONLY routes wired + 1 verify-skip at v9 (this bump). 8 of 9 lead-touching email routes now write per-recipient audit rows to `lead_email_recipients_log`. One new non-blocker finding: F-LERL-RECIPIENT-LAYER-USER-FACING-GAP (vip-approve user-facing recipient gap, post-launch fix). **Next phase: T4 — Credit gating confirm-and-close** (~15 min probe given OD-1=(c) anchor already locked at v2).'

const P1_NEW = '**Status:** T2 ✅ CLOSED 2026-05-10. **T3 phase ✅ CLOSED 2026-05-11.** **T4 ✅ CLOSED 2026-05-11 — OD-1=(c) FINAL.** Probe v2 (proximity-aware) confirmed: zero credit refs co-located with any lead write (Matrix A clean — 0 proximity-concerns, 11 distant); 14 lead-write surfaces classified — 8 audit-wired (T3b/T3c) + 4 System 1 legacy (isolation absolute) + 2 System 2 management UPDATE-only (out of creation scope). Two non-blocker findings on file: F-LERL-RECIPIENT-LAYER-USER-FACING-GAP (vip-approve user-facing recipient gap) + F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP (probe-item: verify lead-management UPDATE flows for `sendTenantEmail` calls at T8). **Next phase: T5 — Form coverage audit per page type** (OD-5=(a) at v2: per-page-type form variants for Area / Muni / Community / Neighbourhood / Building / Property — audit current coverage, identify gaps).'

// ============================================================================
// P2 — Next action paragraph (regex; anchored to v9 text I wrote)
// ============================================================================

const P2_REGEX = /^T2 phase ✅ CLOSED 2026-05-10\. \*\*T3 phase ✅ CLOSED 2026-05-11\.\*\* All 4 sub-phases shipped \(T3a \+ T3b v7\/v8 with 2 hotfixes \+ T3c v9 with 1 verify-skip\).*$/m

const P2_NEW = 'T2 phase ✅ CLOSED 2026-05-10. **T3 phase ✅ CLOSED 2026-05-11.** **T4 phase ✅ CLOSED 2026-05-11 — OD-1=(c) locked FINAL via probe-evidence.** All 4 sub-phases of T3 shipped (T3a + T3b v7/v8 with 2 hotfixes + T3c v9 with 1 verify-skip). T4 closed via 2-matrix probe (`scripts/probe-t4-credit-vs-lead-matrix-v2.js`): Matrix A (credit-refs-near-lead-writes, proximity threshold 25 lines) CLEAN — 0 proximity-concerns, 11 distant credit refs all in unrelated auto-approval blocks (3 surfaces grant `user_credit_overrides` as a side effect of VIP approval, AFTER the lead is already written, ≥47 lines away from any lead INSERT). Matrix B (full lead-writer enumeration via whole-file regex) classified 14 lead-write surfaces — 8 EXPECTED audit-wired (T3b/T3c) + 6 OUT-OF-SCOPE: 4 System 1 legacy routes under `app/api/chat/*` (isolation absolute, frozen), 2 System 2 management UPDATE-only surfaces (`app/api/admin-homes/leads/[id]/route.ts` admin UI 1×update + `lib/actions/lead-management.ts` helper 6×update — none create leads). One new non-blocker probe-item logged: F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP (verify management UPDATE flows at T8 for `sendTenantEmail` calls that may need T3-style audit wiring). **Next: T5 — Form coverage audit per page type.** OD-5 was locked at (a) "per-page-type form variants" at v2 (anchored from T0-C recon). T5 work shape: (1) inventory current public-page form coverage across Area / Municipality / Community / Neighbourhood / Building / Property — for each, identify which components render lead-capture forms, what props they take, what route they post to, how they\'re conditionally rendered; (2) verify each page type renders a form variant appropriate to its context (Building pages get building-context form with `listing_id` field; Area pages get area-context form with `area_id` field; etc); (3) identify gaps where current coverage doesn\'t meet OD-5=(a); (4) propose component updates (T5a..T5n sub-phases as needed). **After T5:** T6 plan integration + T6b LIKE-filter replacement using `lead_origin_route` from T2c. **T7** smoke matrix per OD-6=(c). **T8** comprehensive smoke + regression sweep (extends to verify F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP). **Tlast** close + update `docs/W-LAUNCH-TRACKER.md` Section 4 with W-LEADS-EMAIL row at closure.'

// ============================================================================
// P3 — Insert v10 status log entry above v9 line (regex)
// ============================================================================

const V9_LINE_REGEX = /^- \*\*2026-05-11 v9 T3c SHIPPED \+ T3 PHASE CLOSED\*\*.*$/m

const V10_ENTRY = '- **2026-05-11 v10 T4 CLOSED — OD-1=(c) FINAL** — T4 Credit gating phase completed as confirm-and-close per OD-1=(c) "Credits unrelated to leads" anchor (locked at v2). Two probe scripts shipped: `scripts/probe-t4-credit-vs-lead-matrix.js` (v1, line-by-line scan — kept for history; had two defects: line-by-line missed multi-line chained `.from(\'leads\')\\n.insert` patterns, and credit-pattern matching flagged any credit-word occurrence regardless of distance to a lead write, producing false positives), and `scripts/probe-t4-credit-vs-lead-matrix-v2.js` (whole-file regex + proximity classification — the one that produced the clean verdict). **Matrix A (credit refs in 9 lead-touching surfaces, proximity threshold 25 lines):** CLEAN. 0 PROXIMITY-CONCERN hits — no credit reference within 25 lines of any lead write. 11 DISTANT credit refs across 3 surfaces: `walliam/charlie/vip-request` 6 refs at L155-458 (lead INSERT at L202, min distance 47 lines, all in plan-credit auto-approval block + email HTML strings), `charlie/plan-email` 1 ref at L569 (lead INSERT at L121, distance 448 lines, HTML email template), `walliam/estimator/vip-request` 4 refs at L283-311 (lead INSERT at L184, min distance 99 lines, plan-credit grant flow that runs after the INSERT). 1 surface (`vip-approve`) has 4 credit refs but no lead writes — out of OD-1 scope. **Matrix B (lead-write pattern scan across app/api/ + lib/actions/ via whole-file multi-line regex):** 14 files contain lead-write patterns — 8 EXPECTED (the audit-wired set from T3b/T3c: `walliam/contact` L103 insert, `walliam/charlie/vip-request` L202 insert, `charlie/plan-email` L121 insert, `lib/actions/leads.ts` L119/173/324 update/insert/update, `charlie/appointment` L136 insert, `charlie/lead` L187/209 update/insert, `walliam/estimator/vip-questionnaire` L156/171 update/insert, `walliam/estimator/vip-request` L184 insert) + 6 additional surfaces classified as **OUT-OF-SCOPE for OD-1 credit gating**: **(i) 4 SYSTEM 1 legacy routes** (`app/api/chat/vip-approve/route.ts` L138 update + L150 insert, `app/api/chat/vip-questionnaire/route.ts` L203 insert, `app/api/chat/vip-request/route.ts` L218 insert, `app/api/chat/vip-upgrade/route.ts` L64 update + L82 insert) — System 1 isolation is absolute per project rule (`app/api/chat/*` is the legacy parallel surface that was superseded by System 2 `app/api/walliam/*` routes; we never modify System 1, its behavior is frozen, and its lead-write patterns predate W-LEADS-EMAIL entirely); **(ii) 2 SYSTEM 2 lead-MANAGEMENT surfaces** that do UPDATE-only operations on existing leads and do NOT create leads: `app/api/admin-homes/leads/[id]/route.ts` (admin UI for lead detail page, 1×`.update` at L35 — status changes / assignment edits from the admin dashboard) and `lib/actions/lead-management.ts` (6×`.update` at L10/26/42/115/147/166 — internal helper for assignment changes, status transitions, contact tracking). UPDATEs to existing leads do not consume credits and are not the subject of OD-1 which is specifically about CREATION gating. **OD-1=(c) FINAL anchor:** no lead CREATION path is gated on credit balance; no credit-touching route INSERTs leads; the 8 audit-wired creation surfaces + 6 out-of-scope management/legacy surfaces are fully accounted for; the 11 distant credit refs are all plan-credit grant writes to `user_credit_overrides` that happen AFTER the lead INSERT in auto-approve flows, never gating the INSERT itself. **One new non-blocker probe-item logged:** F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP — verify at T8 comprehensive smoke whether `lib/actions/lead-management.ts` and `app/api/admin-homes/leads/[id]/route.ts` UPDATE flows trigger email sends (assignment-change notifications, status-change notifications, etc); if any do, those email sends need T3-style audit wiring into `lead_email_recipients_log` for full per-recipient audit observability. **Files in this commit:** `docs/W-LEADS-EMAIL-TRACKER.md` (v9→v10 bump in this script), `scripts/probe-t4-credit-vs-lead-matrix.js` (v1 probe, kept for history showing the line-by-line scan defect that produced 4 Matrix-A false positives + 5 Matrix-B false-missing), `scripts/probe-t4-credit-vs-lead-matrix-v2.js` (v2 probe with whole-file regex + proximity classification — the one that produced the clean verdict via correct classification of the 6 out-of-scope surfaces), `scripts/patch-t4-close-tracker-v10.js` (this close script). **Next phase:** T5 — Form coverage audit per page type (OD-5=(a) at v2: per-page-type form variants).'

// ============================================================================
// P4 — Insert new finding F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP after F-LERL line (regex)
// ============================================================================

const F_LERL_LINE_REGEX = /^- \*\*F-LERL-RECIPIENT-LAYER-USER-FACING-GAP\*\* .*$/m

const NEW_FINDING = '- **F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP** (NEW 2026-05-11, NON-BLOCKER, PROBE-ITEM) — Discovered at T4 probe v2: 2 SYSTEM 2 lead-management surfaces operate on existing leads via UPDATE — `app/api/admin-homes/leads/[id]/route.ts` (admin UI for lead detail page, 1×`.update` at L35) and `lib/actions/lead-management.ts` (6×`.update` at L10/26/42/115/147/166 covering assignment changes, status updates, contact tracking). These are NOT lead creation surfaces (so out of OD-1=(c) credit-gating scope) but they MAY trigger email notifications on certain state changes (e.g. lead reassigned to new agent → assignment notification email; status changed to "contacted" → manager notification; etc). If any of these UPDATE flows trigger `sendTenantEmail` calls, those emails need T3-style audit wiring into `lead_email_recipients_log` for full per-recipient audit observability. **Verification surface:** T8 comprehensive smoke — for each UPDATE flow that calls `sendTenantEmail`, add one tier asserting audit rows land in `lead_email_recipients_log`. **Fix surface** (if gaps found): mirror the T3c wire-and-audit pattern for each UPDATE flow that emails — pass `templateKey` per flow (e.g. `lead_management_assignment_change_chain`, `lead_management_status_change_chain`). **Status:** PROBE-ITEM, not blocking T4 close or launch — deferred to T8.'

// ============================================================================
// P5 — Conditional T4 section header update (regex; skip if absent)
// ============================================================================

const P5_REGEX = /^### T4 — Credit gating\b.*$/m

// ============================================================================
// Atomic validation
// ============================================================================

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1
}

const errors = []

// P1
const p1Count = countOccurrences(working, P1_OLD)
if (p1Count !== 1) errors.push(`P1 status line: expected 1 match, found ${p1Count}`)

// P2 (regex)
const p2Single = working.match(P2_REGEX)
if (!p2Single) {
  errors.push('P2 Next action regex: no match')
} else {
  const p2All = working.match(new RegExp(P2_REGEX.source, P2_REGEX.flags + 'g'))
  if ((p2All ? p2All.length : 0) !== 1) errors.push(`P2 Next action regex: expected 1 match, found ${p2All ? p2All.length : 0}`)
}
const P2_OLD = p2Single ? p2Single[0] : null

// P3 (regex on v9 line)
const v9Single = working.match(V9_LINE_REGEX)
if (!v9Single) {
  errors.push('P3 v9 line regex: no match')
} else {
  const v9All = working.match(new RegExp(V9_LINE_REGEX.source, V9_LINE_REGEX.flags + 'g'))
  if ((v9All ? v9All.length : 0) !== 1) errors.push(`P3 v9 line regex: expected 1 match, found ${v9All ? v9All.length : 0}`)
}
const V9_LINE = v9Single ? v9Single[0] : null

// P4 (regex on F-LERL line)
const flerlSingle = working.match(F_LERL_LINE_REGEX)
if (!flerlSingle) {
  errors.push('P4 F-LERL line regex: no match (was the v9 finding insertion successful?)')
} else {
  const flerlAll = working.match(new RegExp(F_LERL_LINE_REGEX.source, F_LERL_LINE_REGEX.flags + 'g'))
  if ((flerlAll ? flerlAll.length : 0) !== 1) errors.push(`P4 F-LERL line regex: expected 1 match, found ${flerlAll ? flerlAll.length : 0}`)
}
const F_LERL_LINE = flerlSingle ? flerlSingle[0] : null

// P5 (conditional — note but don't fail if absent)
const p5Single = working.match(P5_REGEX)
const p5Exists = !!p5Single

if (errors.length > 0) {
  console.error('FAIL: anchor validation:')
  for (const e of errors) console.error('  - ' + e)
  console.error('')
  console.error('No write performed.')
  process.exit(1)
}

console.log('Required anchors validated (P1, P2, P3, P4). Proceeding to backup + write.')
console.log(p5Exists
  ? '  P5 T4 section header: FOUND — will update'
  : '  P5 T4 section header: NOT FOUND — will skip (no ### T4 section in tracker)')

// ============================================================================
// Backup
// ============================================================================

const ts = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  ts.getFullYear() +
  pad(ts.getMonth() + 1) +
  pad(ts.getDate()) +
  '_' +
  pad(ts.getHours()) +
  pad(ts.getMinutes()) +
  pad(ts.getSeconds())
const backupPath = filePath + '.backup_' + stamp
fs.copyFileSync(filePath, backupPath)
console.log('Backup written: ' + path.basename(backupPath))

// ============================================================================
// Apply
// ============================================================================

working = working.replace(P1_OLD, P1_NEW)
console.log('  P1 status line: replaced')

working = working.replace(P2_OLD, P2_NEW)
console.log('  P2 Next action paragraph: replaced')

working = working.replace(V9_LINE, V10_ENTRY + '\n' + V9_LINE)
console.log('  P3 v10 entry: inserted above v9 line')

working = working.replace(F_LERL_LINE, F_LERL_LINE + '\n' + NEW_FINDING)
console.log('  P4 F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP finding: inserted')

if (p5Exists) {
  const P5_OLD = p5Single[0]
  const P5_NEW = '### T4 — Credit gating (✅ CLOSED 2026-05-11 — OD-1=(c) FINAL via probe-evidence; see v10 status log entry)'
  working = working.replace(P5_OLD, P5_NEW)
  console.log('  P5 T4 section header: replaced')
} else {
  console.log('  P5 T4 section header: skipped (not present)')
}

if (working === original) {
  console.error('FAIL: no diff after replacements. Aborting.')
  fs.unlinkSync(backupPath)
  process.exit(1)
}

fs.writeFileSync(filePath, working, 'utf8')

console.log('')
console.log('Wrote: ' + F)
console.log('T4 phase CLOSED. Tracker bumped v9 -> v10.')
console.log('Backup suffix: .backup_' + stamp)
console.log('')
console.log('Next steps:')
console.log('  1. Verify:')
console.log('     Select-String -Path "docs/W-LEADS-EMAIL-TRACKER.md" \\')
console.log('       -Pattern "v10 T4 CLOSED|F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP|T4 ✅ CLOSED 2026-05-11" |')
console.log('       Select-Object LineNumber')
console.log('  2. git add docs/W-LEADS-EMAIL-TRACKER.md \\')
console.log('             scripts/probe-t4-credit-vs-lead-matrix.js \\')
console.log('             scripts/probe-t4-credit-vs-lead-matrix-v2.js \\')
console.log('             scripts/patch-t4-close-tracker-v10.js')
console.log('  3. git commit -m "W-LEADS-EMAIL T4 close: OD-1=(c) FINAL via 2-matrix probe + tracker v10 + F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP probe-item"')
console.log('  4. git push origin main')
console.log('  5. Proceed to T5 — Form coverage audit per page type (OD-5=(a)).')