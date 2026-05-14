#!/usr/bin/env node
/**
 * patch-w-leads-workbench-tracker-w4f.js
 *
 * docs(W-LEADS-WORKBENCH W4f): tracker status log + phase row update.
 *
 * Three atomic patches against docs/W-LEADS-WORKBENCH-TRACKER.md:
 *   P1: version line v15 -> v16 (W4d -> W4f reference; W4e drift acknowledged)
 *   P2: phase table W4f row OPEN -> SHIPPED with commit hash + details
 *   P3: status log append -- 2026-05-14 W4f-SHIPPED entry after W4e tail
 *
 * Tracker LE: LF (verified 2026-05-14 probe -- 233 lines, 69190 bytes).
 *
 * Idempotent: skips if v16 marker present. Backup before write. LE-preserved.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const d = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  d.getFullYear() +
  pad(d.getMonth() + 1) +
  pad(d.getDate()) +
  '_' +
  pad(d.getHours()) +
  pad(d.getMinutes()) +
  pad(d.getSeconds())

const TRACKER = path.join(ROOT, 'docs', 'W-LEADS-WORKBENCH-TRACKER.md')

if (!fs.existsSync(TRACKER)) {
  throw new Error('tracker missing: ' + TRACKER)
}

// ----- LE detection -----
const buf = fs.readFileSync(TRACKER)
let crlfCount = 0
let lfCount = 0
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x0a) {
    if (i > 0 && buf[i - 1] === 0x0d) crlfCount++
    else lfCount++
  }
}
if (crlfCount > 0 && lfCount > 0) {
  throw new Error('mixed LE: crlf=' + crlfCount + ', lf=' + lfCount)
}
const LE = crlfCount > 0 ? 'crlf' : 'lf'
const NL = LE === 'crlf' ? '\r\n' : '\n'
console.log('LE detected: ' + LE)

let text = buf.toString('utf8')

// ----- Idempotency check -----
const V16_MARKER = '**Version:** v16 \u2014 W4f SHIPPED'
if (text.indexOf(V16_MARKER) !== -1) {
  console.log('SKIP: v16 marker already present. No-op.')
  process.exit(0)
}

// ----- P1: Version line -----
const P1_OLD =
  '**Version:** v15 \u2014 W4d SHIPPED \u2014 Activity tab with cumulative visitor + admin timeline across leadFamily; user_activities by contact_email + lead_admin_actions by lead_id, both tenant_id-scoped; 13 activity types mapped to icon+label dictionary; filter pills + date-bucket grouping + 50-event cap with "Show all" expansion'

const P1_NEW =
  '**Version:** v16 \u2014 W4f SHIPPED \u2014 VIP Requests tab + admin approve/deny endpoint at `/api/admin-homes/leads/[id]/vip-approve`; second writer to `lead_admin_actions` (`vip_approved` / `vip_denied`); triple-gate vip_request fetch (id + tenant_id = lead.tenant_id + lead_id = lead.id); per-request_type credit-grant branch (estimator: estimator-only grant + BCC chain via helper; plan/chat: all-3-pools grant matching charlie endpoint); optimistic UI flip with revert on error; existing charlie + estimator vip-approve routes UNTOUCHED; findings `F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F` + `F-VIP-APPROVE-EMAILS-NOT-AUDITED` + `F-VIP-APPROVE-GRANTED-BY-TIER-HARDCODED-MANAGER` + `F-W-LEADS-WORKBENCH-VERSION-LINE-DRIFTED-AT-W4E` logged for future cleanup'

// ----- P2: Phase table W4f row -----
const P2_OLD =
  '| W4f | VIP Requests tab + in-page Approve | OPEN | \u2014 | Optimistic state update, no tab flip |'

const P2_NEW =
  '| W4f | VIP Requests tab + in-page Approve | SHIPPED | 2026-05-14 | `4c8b7ff` VIP Requests tab with 5 status filter chips + Approve/Deny optimistic action; new POST `/api/admin-homes/leads/[id]/vip-approve` (second writer to `lead_admin_actions` -- `vip_approved` / `vip_denied`); triple-gate fetch (id + tenant_id + lead_id); per-request_type branch (estimator: estimator-only grant + BCC chain; plan/chat: all-3-pools grant matching charlie endpoint). Existing System 2 charlie + estimator vip-approve routes UNTOUCHED. No schema migration: `lead_admin_actions.action_type` is free-form. Smoke verified 2026-05-14 16:12:42 UTC: vip_request `fd30dd2d-0f00-4d6c-9128-3f0e6bd17888` flipped pending -> approved with messages_granted=3 (agent fallback). Findings: `F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F`, `F-VIP-APPROVE-EMAILS-NOT-AUDITED`, `F-VIP-APPROVE-GRANTED-BY-TIER-HARDCODED-MANAGER`. |'

// ----- P3: Status log append (anchor on the unique tail sentence of W4e entry) -----
const P3_ANCHOR = 'NEXT: W4f VIP Requests tab + in-page Approve.'

const W4F_ENTRY_LINES = [
  '- **2026-05-14 W4f-SHIPPED** -- VIP Requests tab + admin approve/deny endpoint. Commit `4c8b7ff` (b7c687d..4c8b7ff). **5 files**: 2 new (`app/api/admin-homes/leads/[id]/vip-approve/route.ts` 16170 bytes; `components/admin-homes/lead-workbench/VipRequestsTab.tsx` 13656 bytes) + 2 modified (`app/admin-homes/leads/[id]/page.tsx` 5 anchor patches adding 4th parallel `vip_requests` prefetch filtered by `lead_id IN (familyIds) AND tenant_id = anchorLead.tenant_id` + `vipRequests` prop pass; `app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx` 4 anchor patches adding `VipRequestsTab` import + Props extension + destructure + `tab === \'vip\'` dispatch) + 1 patch script (`scripts/patch-w-leads-workbench-w4f-vip-requests-tab.js`). **No schema migration**: Block 3 SQL recon confirmed `lead_admin_actions.action_type` has zero CHECK constraints (free-form text), so `vip_approved` / `vip_denied` write cleanly via existing `logLeadAdminAction` helper. Second writer to `lead_admin_actions` after W4e\'s first writer (`email_sent`). **VipRequestsTab UI**: 5 status filter chips with live counts (All/Pending/Approved/Denied/Expired); per-card status badge + type label (Plan/Chat/Estimator from `TYPE_LABEL` dict) + source label (Chat/Estimator from `SOURCE_LABEL` dict); expandable card detail (budget/timeline/buyer_type/building/requirements/page_url/messages_granted/expires_at); per-pending-card Approve/Deny buttons; optimistic state update on click via `overrides` Map keyed on vip_request.id (badge flips immediately, no `router.refresh()`, no tab flip) with revert-on-error; in-flight tracking via `actionPending` state ID prevents double-clicks across rows; `isEffectivelyExpired()` predicate auto-surfaces server-pending rows as locally-expired when `expires_at < Date.now()`. **POST `/api/admin-homes/leads/[id]/vip-approve` handler**: auth via `resolveAdminHomesUser`; lead fetch; permission gate via `can(\'lead.write\', {kind:\'lead\', leadId, tenantId, agentId})`; body parse with strict type check on `vipRequestId` (string) + `action` (`\'approve\'` | `\'deny\'`); **triple-gate vip_request fetch** `WHERE id = $vipRequestId AND tenant_id = lead.tenant_id AND lead_id = lead.id` -- no cross-tenant or cross-lead approval possible; idempotency check (status === `\'pending\'` returns 409 with `currentStatus`); expiry check (auto-flips DB row to `\'expired\'` and returns 410); per-request_type branch on credit grant + email. **Estimator branch** (`request_type === \'estimator\'`): grants `estimator_limit` only via `user_credit_overrides` UPSERT preserving other pool fields (matches existing `walliam/estimator/vip-approve` endpoint behavior); includes BCC chain via `getLeadEmailRecipients` + manager CC via `parent_id` lookup; uses `AdminPlatformUnreachable` recovery pattern (logs warning, does NOT fail action since approve already recorded -- different from existing estimator endpoint which fails-closed; intentional W4f tradeoff since admin already authenticated). **Plan/Chat branch** (`request_type` in `{plan, chat}`): grants all 3 pools (`ai_chat_limit` + `buyer_plan_limit` + `estimator_limit`) using tenant `*_manual_approve_limit` configs capped at `*_hard_cap` (matches `walliam/charlie/vip-approve` behavior); fallback to agent\'s `ai_manual_approve_limit` when tenant `plan_manual_approve_limit` is unset (the case for walliam tenant -- King Shah\'s value `3` was applied in smoke). No BCC chain in this branch (matches charlie endpoint behavior; existing inconsistency between charlie and estimator endpoints preserved in W4f rather than introduced). On approve: `chat_sessions` upgrade if `session_id` present (status=`\'vip\'`, `vip_messages_granted` + `manual_approvals_count` incremented, `last_approval_at` stamped); `user_credit_overrides` UPSERT only if `lead.user_id` non-null (testingleads is anonymous so the smoke correctly skipped this branch and demonstrated the `if (userId)` guard works as intended); confirmation email via `sendTenantEmail` with brand context from `getTenantContext` (`buildApprovalEmailHtml` generates dark-themed HTML matching existing endpoint visual style; estimator-vs-plan label differentiation via `isEstimator` boolean). Audit via `logLeadAdminAction` -- `action_type=\'vip_approved\'` (or `\'vip_denied\'`), `target_field=\'status\'`, `before_value={status:\'pending\'}`, `after_value={status, vip_request_id, request_type, request_source, messages_granted}`, `actor_role` resolved via `user.role || (user.isPlatformAdmin ? \'platform_admin\' : \'admin\')`, `notes=\'VIP request <approve/deny>d from admin workbench\'`. Returns JSON `{success, vipRequestId, status, messagesGranted}` for the UI to confirm the optimistic state. **System 2 existing vip-approve endpoints UNTOUCHED**: `app/api/walliam/charlie/vip-approve/route.ts` and `app/api/walliam/estimator/vip-approve/route.ts` not modified -- avoids regression risk on two working production flows during launch-blocking work; the duplication cost is acknowledged as `F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F` for future cleanup. **Multi-tenant safety verified**: lead\'s `tenant_id` is the trust boundary throughout (not user\'s); vip_request triple-gate prevents cross-tenant or cross-lead approval at the DB-query level; `can(\'lead.write\')` gates per-request authorization at the app level; no hardcoded tenant constants in handler or UI; code path identical for any tenant. **Smoke matrix passed end-to-end**: (1) empty state -- lead `996b5d71-4a67-418a-9dfa-c11b2170e5d0` with zero VIP requests rendered 5 filter chips at 0 + "No VIP requests for this lead family yet" empty message; (2) seed insert -- SQL INSERT created vip_request `fd30dd2d-0f00-4d6c-9128-3f0e6bd17888` with `request_type=\'plan\'`, `request_source=\'chat\'`, expires_at 24h ahead; (3) UI refresh -- counts updated to `All (1) Pending (1)`; expand worked; (4) Approve click -- badge flipped to green "Approved" optimistically, counts updated to `All (1) Pending (0) Approved (1)`; (5) DB verification at 16:12:42 UTC -- `vip_requests.status=\'approved\'`, `responded_at=\'2026-05-14 16:12:40.325+00\'`, `messages_granted=3` (matches expected agent `ai_manual_approve_limit` fallback for walliam tenant since `plan_manual_approve_limit` is unset); audit row written with `action_type=\'vip_approved\'`, `target_field=\'status\'`, correct `before_value` / `after_value`, `actor_role=\'admin\'`, `notes=\'VIP request approved from admin workbench\'`; (6) Block 3c verified `l.user_id IS NULL` so the credit-override UPSERT path correctly skipped (anonymous lead). TSC --noEmit exit 0. Local dev smoke green (npm run dev). **NEW finding F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F**: same business logic (status flip + credit grant + confirmation email) now exists in 3 endpoints (`walliam/charlie/vip-approve`, `walliam/estimator/vip-approve`, `admin-homes/leads/[id]/vip-approve`). Future cleanup workstream extracts shared `lib/admin-homes/approve-vip-request.ts` helper with mode parameter encoding the charlie-vs-estimator behavior split (charlie: all-3-pools grant + no BCC; estimator: estimator-only grant + BCC chain), refactors all 3 callers to consume it. **NEW finding F-VIP-APPROVE-EMAILS-NOT-AUDITED**: VIP approve confirmation emails sent from all 3 endpoints are NOT written to `lead_email_recipients_log` (matches pre-existing behavior of charlie + estimator endpoints; W4e\'s audit only covers admin-composed emails sent via `/api/admin-homes/leads/[id]/send-email`). Future cleanup workstream adds `logEmailRecipients` call alongside `sendTenantEmail` in the approve handlers (parallel to W4e\'s send-email pattern). **NEW finding F-VIP-APPROVE-GRANTED-BY-TIER-HARDCODED-MANAGER**: `user_credit_overrides.granted_by_tier` hardcoded to `\'manager\'` in all 3 vip-approve endpoints including new W4f. Admin actor identity correctly preserved in `lead_admin_actions.actor_role` for audit trail; only the credit-overrides table loses actor-tier accuracy. Cleanup bundled with `F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F` (helper extraction is the natural place to accept `actor_tier` as a parameter from the calling endpoint). **NEW finding F-W-LEADS-WORKBENCH-VERSION-LINE-DRIFTED-AT-W4E**: tracker version line was last bumped at W4d (`v15`); W4e shipped without bumping it; W4f bumps directly to `v16 -- W4f SHIPPED`. Hygiene drift in one phase; not worth a separate fix since status log already captures W4e fully. NEXT: W4g Notes tab + Add note inline -- reuses existing `lead_notes` table (`F-LEAD-NOTES-NO-TENANT-ID-COLUMN` finding from W-TRACKERS-GUIDE deferred backlog applies; recon will confirm `lead_id`-based scoping is correct for the per-lead-family fetch since `lead_id` is tenant-bound through the lead anchor); third writer to `lead_admin_actions` (`action_type=\'note_added\'`); audit pattern fully established by W4e + W4f.',
]

const P3_NEW =
  P3_ANCHOR + NL + NL + W4F_ENTRY_LINES.join(NL)

// ----- Validate anchor uniqueness BEFORE applying any patch -----
const patches = [
  { name: 'P1 version line', old: P1_OLD, new: P1_NEW },
  { name: 'P2 W4f phase row', old: P2_OLD, new: P2_NEW },
  { name: 'P3 status log append', old: P3_ANCHOR, new: P3_NEW },
]

for (const p of patches) {
  const count = text.split(p.old).length - 1
  if (count !== 1) {
    throw new Error(
      p.name + ' anchor count ' + count + ' != 1 (expected exactly one match)',
    )
  }
}

// ----- Apply (atomic in-memory) -----
for (const p of patches) {
  text = text.replace(p.old, p.new)
}

// ----- Post-patch marker validation -----
if (text.indexOf(V16_MARKER) === -1) {
  throw new Error('post-patch: v16 marker missing')
}
if (
  text.indexOf(
    '| W4f | VIP Requests tab + in-page Approve | SHIPPED | 2026-05-14 |',
  ) === -1
) {
  throw new Error('post-patch: W4f SHIPPED phase row missing')
}
if (text.indexOf('2026-05-14 W4f-SHIPPED') === -1) {
  throw new Error('post-patch: W4f-SHIPPED status log entry missing')
}

// ----- LE preservation pre-write -----
if (LE === 'lf' && text.indexOf('\r\n') !== -1) {
  throw new Error('CRLF introduced into LF tracker')
}

// ----- Backup + write -----
fs.copyFileSync(TRACKER, TRACKER + '.backup_' + stamp)
fs.writeFileSync(TRACKER, text, 'utf8')

// ----- Post-write LE re-verify -----
const postBuf = fs.readFileSync(TRACKER)
let postCrlf = 0
let postLf = 0
for (let i = 0; i < postBuf.length; i++) {
  if (postBuf[i] === 0x0a) {
    if (i > 0 && postBuf[i - 1] === 0x0d) postCrlf++
    else postLf++
  }
}
if (LE === 'lf' && postCrlf > 0) {
  throw new Error('LE drift: LF tracker now has ' + postCrlf + ' CRLF lines')
}
if (LE === 'crlf' && postLf > 0) {
  throw new Error('LE drift: CRLF tracker now has ' + postLf + ' LF-only lines')
}

console.log('')
console.log('W4f tracker patch applied successfully.')
console.log('')
console.log('  ~ ' + TRACKER)
console.log('    backup: W-LEADS-WORKBENCH-TRACKER.md.backup_' + stamp)
console.log('  3 patches applied:')
console.log('    P1: version line v15 -> v16')
console.log('    P2: phase table W4f row OPEN -> SHIPPED')
console.log('    P3: status log W4f-SHIPPED entry appended')
console.log('')
console.log('Next:')
console.log('  git add docs/W-LEADS-WORKBENCH-TRACKER.md \\')
console.log('          scripts/patch-w-leads-workbench-tracker-w4f.js')
console.log('  git commit -F <message file>  (see message template below)')
console.log('  git push origin main')