#!/usr/bin/env node
/**
 * patch-t3c-close-tracker-v9.js (CORRECTED — second attempt)
 *
 * W-LEADS-EMAIL T3c ship + T3d phase close: tracker v8 -> v9 in one atomic write.
 *
 * First attempt failed P1 anchor because the tracker had moved past v7 to v8
 * via two hotfixes (T2f-followup-grants + T3b-hotfix-A). Re-probed disk state
 * via Get-Content + Select-String; anchors below now match the actual v8 disk
 * state. The disk's own status line already states the plan: "T3d (T3 phase
 * close + tracker v9)" — so this is a single-version-bump close (one v9 entry).
 *
 * Single file touched:
 *   docs/W-LEADS-EMAIL-TRACKER.md
 *     P1 status line: T3 IN PROGRESS -> T3 CLOSED
 *     P2 T3 section header: pending -> CLOSED
 *     P3 Next action paragraph: T3c roadmap -> T4 confirm-and-close roadmap (regex)
 *     P4 insert v9 status log entry above v8 line (regex)
 *     P5 insert F-LERL-RECIPIENT-LAYER-USER-FACING-GAP finding after
 *        F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN line (regex)
 *
 * Atomic: validates all 5 anchors before any write. If any anchor fails, no write.
 * Backup: timestamped .backup_<stamp> per Rule Zero.
 *
 * Key facts confirmed from probe before writing this script:
 *   - v8 (line 611) is the latest status log entry.
 *   - The `lerl_direction_check` error visible in the chat dev-log tail was
 *     historical — T3b-hotfix-A already rewrote the helper to align direction
 *     vocabulary with the T2f schema CHECK. So v9 does NOT log a follow-up probe.
 *   - All 7 ODs were locked at v2 (OD-1=c, OD-2=b, OD-3=c, OD-4=c, OD-5=a,
 *     OD-6=c, OD-7=b). v9's Next action references these as locked, not open.
 *   - F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN is the stable anchor for new-finding
 *     insertion (its line is fully visible in probe output).
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
// P1 — Status line update (exact text from probe section A)
// ============================================================================

const P1_OLD = '**Status:** T2 ✅ CLOSED 2026-05-10. **T3 phase IN PROGRESS** — T3a + T3b ✅ CLOSED 2026-05-10 with comprehensive 4-tier smoke green + 2 hotfixes (T2f-followup-grants migration, T3b-hotfix-A helper-schema vocabulary alignment). Remaining: T3c (wire 5 EMAIL_ONLY routes) + T3d (T3 phase close + tracker v9).'

const P1_NEW = '**Status:** T2 ✅ CLOSED 2026-05-10. **T3 phase ✅ CLOSED 2026-05-11.** All sub-phases shipped: T3a helper (commit `27fe944`), T3b 4 LEAD_WRITER routes wired + 2 hotfixes (T2f-followup-grants migration, T3b-hotfix-A helper-schema vocabulary alignment) at v7/v8, T3c 4 EMAIL_ONLY routes wired + 1 verify-skip at v9 (this bump). 8 of 9 lead-touching email routes now write per-recipient audit rows to `lead_email_recipients_log`. One new non-blocker finding: F-LERL-RECIPIENT-LAYER-USER-FACING-GAP (vip-approve user-facing recipient gap, post-launch fix). **Next phase: T4 — Credit gating confirm-and-close** (~15 min probe given OD-1=(c) anchor already locked at v2).'

// ============================================================================
// P2 — T3 section header (exact text from probe section C line 187)
// ============================================================================

const P2_OLD = '### T3 — Recipient helper extension (IN PROGRESS — T3a + T3b ✅ CLOSED 2026-05-10 with comprehensive smoke green + 2 hotfixes; T3c/T3d pending)'

const P2_NEW = '### T3 — Recipient helper extension (✅ CLOSED 2026-05-11 — T3a `27fe944` + T3b 2026-05-10 v7/v8 with 2 hotfixes + T3c 2026-05-11 v9 with verify-skip)'

// ============================================================================
// P3 — Next action paragraph (regex — full line at probe section D line 604 was truncated)
// ============================================================================

const P3_REGEX = /^T2 phase ✅ CLOSED 2026-05-10\. \*\*T3 phase IN PROGRESS\.\*\* T3a \+ T3b ✅ CLOSED 2026-05-10 with comprehensive 4-tier smoke green.*$/m

const P3_NEW = 'T2 phase ✅ CLOSED 2026-05-10. **T3 phase ✅ CLOSED 2026-05-11.** All 4 sub-phases shipped (T3a + T3b v7/v8 with 2 hotfixes + T3c v9 with 1 verify-skip) — see v9 status log entry for full component status, smoke results, and the new F-LERL-RECIPIENT-LAYER-USER-FACING-GAP non-blocker finding. **Next: T4 — Credit gating confirm-and-close.** OD-1=(c) "Credits unrelated to leads" was evidence-locked at v2 (T0-A recon found 4 lead-write routes have zero credit references; 9 credit-touching routes have zero lead INSERTs). T4 work shape (~15 min): (1) re-verify the lead-vs-credit matrix still holds post-T2/T3 by grep-ing the 8 wired routes for any `credit` / `increment_chat_session_counter` / `decrement_chat_session_counter` references AND grep-ing the 9 credit-touching routes for any new `INSERT INTO leads` / `.from(\'leads\').insert` calls introduced by T2/T3; (2) lock OD-1=(c) FINAL with evidence pointer captured from step 1; (3) tracker v9 → v10 with T4 close entry. After T4: **T5** Form coverage audit per page type (OD-5 already locked at (a) at v2 — Area / Muni / Community / Neighbourhood / Building / Property each get their own form variant per the (a) anchor). **T6** Plan integration + T6b LIKE-filter replacement using `lead_origin_route` column from T2c. **T7** Smoke matrix (OD-6 already locked at (c) at v2). **T8** Comprehensive smoke + regression sweep across all 9 lead routes × all 6 recipient layers × delegation overlay. **Tlast** close + update `docs/W-LAUNCH-TRACKER.md` Section 4 with W-LEADS-EMAIL row at closure.'

// ============================================================================
// P4 — Insert v9 status log entry above v8 line (regex)
// ============================================================================

const V8_LINE_REGEX = /^- \*\*2026-05-10 v8 T3b COMPLETE.*$/m

const V9_ENTRY = '- **2026-05-11 v9 T3c SHIPPED + T3 PHASE CLOSED** — T3c wire shipped via `scripts/patch-t3c-wire.js` (10 patches across 4 files, atomic anchor-validated, backup suffix `.backup_202605111008235`): `logEmailRecipients` audit-log writer wired into 4 of 5 EMAIL_ONLY routes. **Routes wired:** (1) `charlie/appointment` — chain send + audit, templateKey `charlie_appointment_chain`, lead_id resolved from request body / DB lookup; (2) `charlie/lead` — chain send + audit on **both INSERT and UPDATE paths**, templateKey `charlie_lead_chain`; (3) `walliam/estimator/vip-questionnaire` — audit gated on pre-existing lead lookup via idempotent pattern (the questionnaire enriches a pre-existing vip-request lead), templateKey `walliam_estimator_vip_questionnaire_chain`; (4) `walliam/estimator/vip-request` — insert refactor (chain `.select(\'id\').single()` + outer-scope `let lead` declaration + post-error-check assignment, mirroring the T3b `walliam/charlie/vip-request` refactor pattern) + chain send + audit, templateKey `walliam_estimator_vip_request_chain`. **One latent bug fixed in passing** (F2.P2 in the wire patch script): `charlie/lead` UPDATE branch never assigned `leadId = existingLead.id` after the UPDATE error check — this silently skipped both the existing session-lead linker at L238 AND would have silently skipped the new audit on the UPDATE path. Restored with one extra line `leadId = existingLead.id` post-UPDATE-error; verified end-to-end via Tier 6 (same lead.id `4e03f5d8-9d0a-4ffb-8298-a732e651b6a9` across INSERT + UPDATE passes, +2 audit rows on UPDATE pass). **One route deliberately not wired** (`walliam/estimator/vip-approve`): the user-in-TO recipient (the buyer being approved) does not fit any value in the current `lerl_recipient_layer_check` CHECK constraint (`agent` / `manager` / `area_manager` / `tenant_admin` / `platform_admin` / `tenant_overlay_bcc`). Recording the user-facing recipient as `tenant_overlay_bcc` would be a semantic lie. Logged as new finding **F-LERL-RECIPIENT-LAYER-USER-FACING-GAP** (non-blocker, post-launch fix via CHECK extension with `lead_contact` layer value + wiring vip-approve with `recipientLayer: \'lead_contact\'`). **TSC clean post-patch.** T3b regression smoke re-run after the wire — all 4 prior T3b tiers still green. **T3c smoke** (`scripts/smoke-t3c.js`, run_id `t3c1778494461627`): Tier 5 (appointment) 2 rows agent=1 platform_admin=1; Tier 6 (lead INSERT+UPDATE) 2 rows on INSERT + 2 rows on UPDATE on same lead.id (F2.P2 leadId-fix VERIFIED end-to-end); Tier 7 (vip-questionnaire) 2 rows on pre-existing lead `225cc432-0349-431d-9954-89b328978953`; Tier 8 (vip-request) 2 rows on freshly-inserted lead `85cfabc9-3bb4-49bd-bb42-5632c21505df`; Tier 9 (vip-approve verify-skip) status pending→approved, 0 audit rows for vip-approve templateKey (intentional gap confirmed). **All 5 tiers GREEN.** **T3 PHASE COMPLETE.** Component status across the phase: T3a `27fe944` helper built → T3b v7 wire-only across 4 LEAD_WRITER+EMAIL routes → T3b v8 hotfixes (T2f-followup-grants migration added missing `GRANT SELECT, INSERT, UPDATE ON lead_email_recipients_log TO service_role`; T3b-hotfix-A `lib/admin-homes/log-email-recipients.ts` full-file rewrite aligned helper vocabulary with T2f schema CHECK constraints — helper had used email-flow `direction: \'outbound\'|\'inbound\'` that did not match the table\'s `lerl_direction_check` CHECK values) → T3c v9 (this entry: 4 EMAIL_ONLY routes wired + 1 verify-skip). **Coverage:** 8 of 9 lead-touching email routes write per-recipient audit rows after every chain send; the 9th (vip-approve user-facing approval email to the buyer) is the F-LERL-RECIPIENT-LAYER-USER-FACING-GAP verify-skip. System 2 BCC fan-out is now observable end-to-end — every chain layer (agent / manager / area_manager / tenant_admin / platform_admin + delegation overlay) gets a row in `lead_email_recipients_log` with `resend_message_id`, enabling per-recipient delivery tracking and forensic audit. **Files in this commit:** 4 route files (audit wiring from T3c: `app/api/charlie/appointment/route.ts`, `app/api/charlie/lead/route.ts`, `app/api/walliam/estimator/vip-questionnaire/route.ts`, `app/api/walliam/estimator/vip-request/route.ts`), `docs/W-LEADS-EMAIL-TRACKER.md` (v8→v9 bump in this script), `scripts/patch-t3c-wire.js` (T3c wire patch), `scripts/smoke-t3c.js` (5-tier comprehensive smoke harness), `scripts/patch-t3c-close-tracker-v9.js` (this close script). **Next phase:** T4 — Credit gating confirm-and-close (~15 min, OD-1=(c) already locked at v2).'

// ============================================================================
// P5 — Insert new finding after F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN line (regex)
// ============================================================================

const P5_REGEX = /^- \*\*F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN .*$/m

const NEW_FINDING = '- **F-LERL-RECIPIENT-LAYER-USER-FACING-GAP** (NEW 2026-05-11, NON-BLOCKER) — `lerl_recipient_layer_check` CHECK constraint on `lead_email_recipients_log.recipient_layer` does not include a value for user-facing email recipients (the buyer/lead being notified directly, e.g. the vip-approve user-facing approval email). Currently allowed values: `agent` / `manager` / `area_manager` / `tenant_admin` / `platform_admin` / `tenant_overlay_bcc`. Recording a user-facing recipient as `tenant_overlay_bcc` would be a semantic lie. **Impact:** `walliam/estimator/vip-approve` user-facing send is the only verify-skip in T3 phase — the email still sends correctly, only its audit row is skipped. **Fix surface:** post-launch migration extends the CHECK with a `lead_contact` (or similar) layer value, then wire `vip-approve` to call `logEmailRecipients` with `recipientLayer: \'lead_contact\'`. Discovered at T3c wire 2026-05-11 (v9 entry); deferred as not launch-blocking.'

// ============================================================================
// Atomic validation pass — all 5 anchors must resolve to exactly 1 match
// ============================================================================

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1
}

const errors = []

// P1
const p1Count = countOccurrences(working, P1_OLD)
if (p1Count !== 1) {
  errors.push('P1 status line: expected 1 match, found ' + p1Count)
}

// P2
const p2Count = countOccurrences(working, P2_OLD)
if (p2Count !== 1) {
  errors.push('P2 T3 section header: expected 1 match, found ' + p2Count)
}

// P3 (regex)
const p3Matches = working.match(new RegExp(P3_REGEX.source, P3_REGEX.flags + 'g'))
const p3Count = p3Matches ? p3Matches.length : 0
if (p3Count !== 1) {
  errors.push('P3 Next action regex: expected 1 match, found ' + p3Count)
}
const p3Single = working.match(P3_REGEX)
const P3_OLD = p3Single ? p3Single[0] : null

// P4 (regex on v8 line)
const v8Matches = working.match(new RegExp(V8_LINE_REGEX.source, V8_LINE_REGEX.flags + 'g'))
const v8Count = v8Matches ? v8Matches.length : 0
if (v8Count !== 1) {
  errors.push('P4 v8 line regex: expected 1 match, found ' + v8Count)
}
const v8Single = working.match(V8_LINE_REGEX)
const V8_LINE = v8Single ? v8Single[0] : null

// P5 (regex on F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN line)
const p5Matches = working.match(new RegExp(P5_REGEX.source, P5_REGEX.flags + 'g'))
const p5Count = p5Matches ? p5Matches.length : 0
if (p5Count !== 1) {
  errors.push('P5 F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN line regex: expected 1 match, found ' + p5Count)
}
const p5Single = working.match(P5_REGEX)
const P5_LINE = p5Single ? p5Single[0] : null

if (errors.length > 0) {
  console.error('FAIL: anchor validation:')
  for (const e of errors) console.error('  - ' + e)
  console.error('')
  console.error('No write performed. Re-probe tracker state and rebuild script.')
  process.exit(1)
}

console.log('All 5 anchors validated (1 match each). Proceeding to backup + write.')

// ============================================================================
// Backup (Rule Zero: timestamped, BEFORE the edit)
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
// Apply all 5 patches sequentially (each replacement targets text still intact
// from the prior step because anchors are non-overlapping)
// ============================================================================

working = working.replace(P1_OLD, P1_NEW)
console.log('  P1 status line: replaced')

working = working.replace(P2_OLD, P2_NEW)
console.log('  P2 T3 section header: replaced')

working = working.replace(P3_OLD, P3_NEW)
console.log('  P3 Next action paragraph: replaced')

working = working.replace(V8_LINE, V9_ENTRY + '\n' + V8_LINE)
console.log('  P4 v9 entry: inserted above v8 line')

working = working.replace(P5_LINE, P5_LINE + '\n' + NEW_FINDING)
console.log('  P5 F-LERL-RECIPIENT-LAYER-USER-FACING-GAP finding: inserted')

// ============================================================================
// Safety check — confirm we actually changed something
// ============================================================================

if (working === original) {
  console.error('FAIL: working === original after all replacements. Something went wrong silently. No write.')
  fs.unlinkSync(backupPath)
  process.exit(1)
}

// ============================================================================
// Write
// ============================================================================

fs.writeFileSync(filePath, working, 'utf8')

console.log('')
console.log('Wrote: ' + F)
console.log('')
console.log('T3 phase CLOSED. Tracker bumped v8 -> v9.')
console.log('Backup suffix: .backup_' + stamp)
console.log('')
console.log('Next steps:')
console.log('  1. Verify tracker reads correctly:')
console.log('     Select-String -Path "docs/W-LEADS-EMAIL-TRACKER.md" \\')
console.log('       -Pattern "v9 T3c SHIPPED|F-LERL-RECIPIENT-LAYER-USER-FACING-GAP|T3 phase ✅ CLOSED 2026-05-11" |')
console.log('       Select-Object LineNumber')
console.log('  2. git add docs/W-LEADS-EMAIL-TRACKER.md \\')
console.log('             app/api/charlie/appointment/route.ts \\')
console.log('             app/api/charlie/lead/route.ts \\')
console.log('             app/api/walliam/estimator/vip-questionnaire/route.ts \\')
console.log('             app/api/walliam/estimator/vip-request/route.ts \\')
console.log('             scripts/patch-t3c-wire.js scripts/smoke-t3c.js \\')
console.log('             scripts/patch-t3c-close-tracker-v9.js')
console.log('  3. git commit -m "W-LEADS-EMAIL T3c + T3 phase close: wire 4 EMAIL_ONLY routes + tracker v9"')
console.log('  4. git push origin main')
console.log('  5. Proceed to T4 (Credit gating confirm-and-close, ~15 min).')