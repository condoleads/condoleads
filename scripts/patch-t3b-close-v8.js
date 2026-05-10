#!/usr/bin/env node
/**
 * patch-t3b-close-v8.js
 *
 * Closes W-LEADS-EMAIL T3b:
 *   - Bumps W-LEADS-EMAIL-TRACKER.md v7 → v8 with the full T3b story
 *     (anchor fix, CRLF normalization, T2f-followup-grants, T3b-hotfix-A
 *     schema alignment, comprehensive 4-tier smoke green)
 *   - Adds .gitignore entries for the auto-provisioned dev test endpoint,
 *     the dev-server.log capture file, and *.backup_* files from patch scripts
 *
 * Idempotency: detects already-applied state via v8 marker, no-ops if so.
 * Per-file: detects each .gitignore line individually; only appends if missing.
 *
 * Lockstep hygiene (v5 lesson): substantive commits get a tracker bump in the
 * same working block. T3b shipped + verified end-to-end → tracker reflects truth.
 */

const fs = require('fs')
const path = require('path')

// ============================================================================
// Tracker patches
// ============================================================================

const TRACKER_PATH = 'docs/W-LEADS-EMAIL-TRACKER.md'

const V7_LINE_RE = /^- \*\*2026-05-10 v7 T3b SHIPPED.*$/m

// Status line: v7 → v8
const STATUS_OLD = "**Status:** T2 ✅ CLOSED 2026-05-10. **T3 phase IN PROGRESS** — T3a + T3b shipped 2026-05-10. T3a built `logEmailRecipients` helper (commit `27fe944`); T3b wired it into all 4 LEAD_WRITER + EMAIL routes with insert refactors where needed. Remaining: T3c (wire 5 EMAIL_ONLY routes) + T3d (T3 phase close + tracker v8)."
const STATUS_NEW = "**Status:** T2 ✅ CLOSED 2026-05-10. **T3 phase IN PROGRESS** — T3a + T3b ✅ CLOSED 2026-05-10 with comprehensive 4-tier smoke green + 2 hotfixes (T2f-followup-grants migration, T3b-hotfix-A helper-schema vocabulary alignment). Remaining: T3c (wire 5 EMAIL_ONLY routes) + T3d (T3 phase close + tracker v9)."

// T3 section header
const SECTION_OLD = "### T3 — Recipient helper extension (IN PROGRESS — T3a + T3b CLOSED 2026-05-10; T3c/T3d pending)"
const SECTION_NEW = "### T3 — Recipient helper extension (IN PROGRESS — T3a + T3b ✅ CLOSED 2026-05-10 with comprehensive smoke green + 2 hotfixes; T3c/T3d pending)"

// Next-action passage (replaces the entire v7 next-action passage)
const NEXT_OLD = "T2 phase ✅ CLOSED 2026-05-10. **T3 phase IN PROGRESS.** T3a + T3b ✅ CLOSED 2026-05-10. T3a built `logEmailRecipients` helper (commit `27fe944`); T3b wired it into all 4 LEAD_WRITER + EMAIL routes with insert refactors where needed (`walliam/contact` and `lib/actions/leads.ts` already chained `.select().single()`; `walliam/charlie/vip-request` and `charlie/plan-email` got chain refactors). **Next: T3c** — wire `logEmailRecipients` into the 5 EMAIL_ONLY routes: `charlie/appointment`, `charlie/lead`, `walliam/estimator/vip-approve`, `walliam/estimator/vip-questionnaire`, `walliam/estimator/vip-request`. These routes don't insert leads; they email about existing leads (status changes, approvals, confirmations). lead_id resolution differs per route — needs targeted probe at the start of T3c to find each route's lead lookup pattern. After T3c: T3d (T3 phase close + tracker v8). Lockstep hygiene per v5 lesson — every substantive commit gets a tracker version bump in the same working block."
const NEXT_NEW = "T2 phase ✅ CLOSED 2026-05-10. **T3 phase IN PROGRESS.** T3a + T3b ✅ CLOSED 2026-05-10 with comprehensive 4-tier smoke green (`scripts/smoke-t3b.js`: walliam/contact, walliam/charlie/vip-request, charlie/plan-email, lib/actions/leads.ts via dev test endpoint) and 2 hotfixes shipped in the same session: T2f-followup-grants migration (`supabase/migrations/20260510_t2f_followup_grants.sql`) and T3b-hotfix-A helper-schema vocabulary alignment (`scripts/patch-t3a-helper-align-with-schema.js`). **Next: T3c** — wire `logEmailRecipients` into the 5 EMAIL_ONLY routes: `charlie/appointment`, `charlie/lead`, `walliam/estimator/vip-approve`, `walliam/estimator/vip-questionnaire`, `walliam/estimator/vip-request`. These routes don't insert leads; they email about existing leads (status changes, approvals, confirmations). lead_id resolution differs per route — needs targeted probe at the start of T3c to find each route's lead lookup pattern. T3c smoke matrix can reuse `scripts/smoke-t3b.js` patterns (fixture chain + dev endpoint pattern) — extend with tier-5 through tier-9. After T3c: T3d (T3 phase close + tracker v9). **Process finding logged for T3d close:** future 'create new table' migrations must include explicit `GRANT ... TO service_role` block as part of the migration template — T2f shipping without grants was a class-of-bug exposed by the smoke harness, not a one-off. Add to migration template hardening. Lockstep hygiene per v5 lesson — every substantive commit gets a tracker version bump in the same working block."

// V8 entry — full T3b story
const V8_ENTRY = [
  '- **2026-05-10 v8 T3b COMPLETE — comprehensive smoke green, 2 hotfixes shipped** — Full T3b ship-and-verify cycle completed in single working block. Wire patch (`scripts/patch-t3b-wire-and-tracker-v7.js`) initially shipped in commit `a406d6d` but anchors did not apply: the patch script joined multi-line anchors with `\\n` while `vip-request/route.ts` and other files use CRLF (`\\r\\n`) — mixed line endings in the repo (some files LF, some CRLF) was the root cause. Diagnostic script `scripts/diagnose-f2-anchor.js` pinpointed the first divergence at byte offset 20 (file `0d 0a` vs anchor `0a`). Patch script revised to detect each file\'s line endings on read, normalize working content to LF for matching, restore original endings on write. Re-applied cleanly: 14 patches across 5 files (4 routes + tracker), TSC clean. Comprehensive smoke (`scripts/smoke-t3b.js`) then exposed two T2f/T3a contract issues the wiring itself didn\'t cause:',
  '  - **T2f-followup-grants** (`supabase/migrations/20260510_t2f_followup_grants.sql`): T2f shipped `lead_email_recipients_log` without `GRANT SELECT, INSERT, UPDATE TO service_role`. Only `postgres` had grants. Helper\'s INSERT silently failed for every API-route call (Supabase service_role bypasses RLS but still needs table privileges). Helper swallows INSERT errors per design (audit failures must never block lead-write or email-send) — bug undetected until smoke\'s `SELECT` got `permission denied`. Migration grants SELECT/INSERT/UPDATE to service_role with `DO $$ ... RAISE EXCEPTION` assertion that rolls back if grants don\'t apply. NOT granted to `authenticated`/`anon` (audit data is server-side only; admin UIs go through Next.js API routes using service_role). Idempotent — re-running has no effect.',
  '  - **T3b-hotfix-A** (`scripts/patch-t3a-helper-align-with-schema.js`): T3a `logEmailRecipients` helper vocabulary did not match T2f schema CHECK constraints. T3a used `direction: \'outbound\'|\'inbound\'` (email flow direction) and `recipient_layer` values `manager_platform`/`admin_platform`/`{agent,manager,area_manager,tenant_admin}_delegate`/`unknown`. T2f schema CHECK requires `direction IN (\'to\',\'cc\',\'bcc\')` (envelope position) and `recipient_layer IN (\'agent\',\'manager\',\'area_manager\',\'tenant_admin\',\'platform_manager\',\'platform_admin\',\'tenant_overlay_cc\',\'tenant_overlay_bcc\')`. Two different mental models shipped at different times. Schema is the source of truth (already deployed). Helper rewritten: `direction` now tracks envelope position per row (to/cc/bcc); `recipient_layer` uses `platform_manager`/`platform_admin` renames; all 4 `*_delegate` variants roll up to `tenant_overlay_cc` or `tenant_overlay_bcc` based on envelope position (delegate granularity intentionally collapsed — recoverable via JOIN to `agent_delegations` on `(tenant_id, delegate_id)`); `unknown` removed in favor of `tenant_overlay_*` fallback with `console.warn` alarm for audit completeness. `EmailStatus` extended with `complained` to match schema (used by future Resend webhook integration). Caller signature backwards-compatible (no caller passed the removed `direction` param). Full-file replacement with backup retained at `.backup_TIMESTAMP`. TSC clean post-patch.',
  '- Comprehensive smoke harness (`scripts/smoke-t3b.js`) exercises all 4 LEAD_WRITER+EMAIL routes end-to-end with per-tier fixture create/cleanup. Tier 1 (walliam/contact): direct POST, no fixtures needed. Tier 2 (walliam/charlie/vip-request): auth user via `supabase.auth.admin.createUser`, user_profile via UPSERT (`on_auth_user_created` trigger auto-pre-populates the row; UPSERT survives the race), chat_session with status=\'active\' source=\'walliam\'. Tier 3 (charlie/plan-email): same fixture chain plus minimal rich payload (`plan`, `geoContext`, `vipCreditTotal: 1`, etc — `buildRichPlanEmail` handles missing fields with `||` fallbacks). Tier 4 (lib/actions/leads.ts): dev-only test endpoint `app/api/t3b-smoke-leads-helper/route.ts` (gated `NODE_ENV !== \'production\'`, gitignored, auto-provisioned by smoke on first run, registers within ~3s via Next.js hot-reload — initial attempt at `app/api/_test/...` failed because Next.js excludes underscore-prefixed folders from routing per private-folders convention) imports `getOrCreateLead` from `lib/actions/leads` and invokes it directly with `forceNew: true` (bypasses Option A dup-silence). All 4 tiers GREEN with King Shah → admin-platform fan-out: 2 audit rows per tier (`agent=1` in TO position, `platform_admin=1` in BCC position), `template_key` per-route (`walliam_contact_lead_capture`, `walliam_charlie_vip_request_lead`, `charlie_plan_email_chain`, `leads_helper_new_lead_notification`), `direction in (to,cc,bcc)`, `status=\'sent\'`, `resend_message_id` populated on every row proving the audit fired *after* the Resend send returned successfully.',
  '- Files in this commit: 4 route files (audit wiring from T3b), `docs/W-LEADS-EMAIL-TRACKER.md` (v7→v8 bump in this script), `lib/admin-homes/log-email-recipients.ts` (hotfix-A full-file rewrite), `supabase/migrations/20260510_t2f_followup_grants.sql` (new migration, already applied to prod DB), `scripts/patch-t3b-wire-and-tracker-v7.js` (T3b wiring with CRLF normalization, already in `a406d6d`), `scripts/patch-t3a-helper-align-with-schema.js` (hotfix-A), `scripts/diagnose-f2-anchor.js` (CRLF diagnostic), `scripts/smoke-t3b.js` (comprehensive 4-tier harness), `scripts/patch-t3b-close-v8.js` (this script), `.gitignore` (excludes auto-provisioned dev endpoint + dev-server.log + *.backup_*). NOT committed: `app/api/t3b-smoke-leads-helper/route.ts` (gitignored — auto-provisioned by smoke on every fresh checkout; production deploys never need it; gate is `NODE_ENV !== \'production\'` for defense-in-depth).',
].join('\n')

// ============================================================================
// .gitignore additions
// ============================================================================

const GITIGNORE_PATH = '.gitignore'
const GITIGNORE_ADDITIONS = [
  '',
  '# W-LEADS-EMAIL T3b smoke artifacts',
  'app/api/t3b-smoke-leads-helper/',
  'dev-server.log',
  '*.backup_*',
]

// ============================================================================
// Idempotency check + apply
// ============================================================================

if (!fs.existsSync(TRACKER_PATH)) {
  console.error('FAIL: tracker not found at ' + TRACKER_PATH)
  process.exit(1)
}

const original = fs.readFileSync(TRACKER_PATH, 'utf8')

if (original.indexOf('- **2026-05-10 v8 T3b COMPLETE') !== -1) {
  console.log('Tracker v8 marker already present. No-op on tracker.')
} else {
  // Find v7 line for V8 insertion anchor
  const v7Match = original.match(V7_LINE_RE)
  if (!v7Match) {
    console.error('FAIL: could not find v7 entry line in tracker (regex: ' + V7_LINE_RE + ')')
    process.exit(1)
  }
  const V7_FULL_LINE = v7Match[0]

  // Apply tracker patches
  const patches = [
    { name: 'status line', old: STATUS_OLD, new: STATUS_NEW },
    { name: 'v8 entry insertion above v7', old: V7_FULL_LINE, new: V8_ENTRY + '\n' + V7_FULL_LINE },
    { name: 'T3 section header', old: SECTION_OLD, new: SECTION_NEW },
    { name: 'next-action passage', old: NEXT_OLD, new: NEXT_NEW },
  ]

  // Detect line endings, normalize for matching, restore on write
  const lineEnding = original.includes('\r\n') ? '\r\n' : '\n'
  let content = original.replace(/\r\n/g, '\n')

  for (const p of patches) {
    const occ = content.split(p.old).length - 1
    if (occ === 0) {
      console.error('FAIL: ' + p.name + ' — old text not found in tracker')
      console.error('  Looking for (first 200 chars): ' + p.old.slice(0, 200))
      process.exit(1)
    }
    if (occ !== 1) {
      console.error('FAIL: ' + p.name + ' — expected 1 match, found ' + occ)
      process.exit(1)
    }
    content = content.replace(p.old, p.new)
    console.log('  ✓ ' + p.name + ': matched + replaced')
  }

  // Backup + write
  const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15)
  const backupPath = TRACKER_PATH + '.backup_' + stamp
  fs.writeFileSync(backupPath, original)
  console.log('Backed up tracker to: ' + backupPath)

  if (lineEnding === '\r\n') content = content.replace(/\n/g, '\r\n')
  fs.writeFileSync(TRACKER_PATH, content)
  console.log('Wrote tracker: ' + TRACKER_PATH + ' (v8)')
}

// ============================================================================
// .gitignore patches
// ============================================================================

let gitignoreContent = ''
if (fs.existsSync(GITIGNORE_PATH)) {
  gitignoreContent = fs.readFileSync(GITIGNORE_PATH, 'utf8')
}

const linesToAdd = GITIGNORE_ADDITIONS.filter(line => {
  if (!line || line.startsWith('#')) return true  // always include blanks/comments
  return !gitignoreContent.split(/\r?\n/).some(existing => existing.trim() === line.trim())
})

// Filter out leading comment/blank if all real entries already present
const realEntries = linesToAdd.filter(l => l && !l.startsWith('#'))
if (realEntries.length === 0) {
  console.log('.gitignore: all T3b entries already present, no changes')
} else {
  // Only add comment block if at least one real entry is new
  const trailingNewline = gitignoreContent.endsWith('\n') ? '' : '\n'
  const newGitignore = gitignoreContent + trailingNewline + linesToAdd.join('\n') + '\n'
  fs.writeFileSync(GITIGNORE_PATH, newGitignore)
  console.log('.gitignore: added ' + realEntries.length + ' entr' + (realEntries.length === 1 ? 'y' : 'ies') + ': ' + realEntries.join(', '))
}

console.log('')
console.log('T3b CLOSE complete.')
console.log('')
console.log('Next steps:')
console.log('  1. Verify changes:')
console.log('       git status')
console.log('       git diff docs/W-LEADS-EMAIL-TRACKER.md')
console.log('       git diff .gitignore')
console.log('  2. Stage everything for the amend:')
console.log('       git add app/api/walliam/contact/route.ts \\')
console.log('               app/api/walliam/charlie/vip-request/route.ts \\')
console.log('               app/api/charlie/plan-email/route.ts \\')
console.log('               lib/actions/leads.ts \\')
console.log('               lib/admin-homes/log-email-recipients.ts \\')
console.log('               docs/W-LEADS-EMAIL-TRACKER.md \\')
console.log('               supabase/migrations/20260510_t2f_followup_grants.sql \\')
console.log('               scripts/patch-t3b-wire-and-tracker-v7.js \\')
console.log('               scripts/patch-t3a-helper-align-with-schema.js \\')
console.log('               scripts/diagnose-f2-anchor.js \\')
console.log('               scripts/smoke-t3b.js \\')
console.log('               scripts/patch-t3b-close-v8.js \\')
console.log('               .gitignore')
console.log('  3. Amend a406d6d with truthful message:')
console.log('       git commit --amend -m "T3b: wire logEmailRecipients into 4 LEAD_WRITER+EMAIL routes; T2f-followup-grants; T3b-hotfix-A; comprehensive smoke green; tracker v8"')
console.log('  4. Force-with-lease push:')
console.log('       git push --force-with-lease origin main')