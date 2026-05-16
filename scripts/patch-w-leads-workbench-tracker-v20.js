#!/usr/bin/env node
/**
 * patch-w-leads-workbench-tracker-v20.js
 *
 * Brings docs/W-LEADS-WORKBENCH-TRACKER.md from v19 -> v20 reflecting the
 * six W5c sub-phases shipped since the last tracker update (W5b SHIPPED on
 * 2026-05-14). Three changes:
 *
 *   (A) Version line: v19 W5b SHIPPED -> v20 W5c-4c SHIPPED + summary of
 *       the 3 helper-consolidation commits (W5c-4a + W5c-4b + W5c-4c).
 *   (B) W5c row in Group D phase table: OPEN -> IN PROGRESS with explicit
 *       sub-phase list (W5c-1/2/3/4a/4b/4c SHIPPED; W5c-4d + W5c-5 OPEN).
 *   (C) Three new status log entries appended at end of file:
 *       2026-05-15 W5c-4a-SHIPPED, 2026-05-15 W5c-4b-SHIPPED,
 *       2026-05-16 W5c-4c-SHIPPED.
 *
 * Idempotent: skips with exit 0 if the v20 marker is already present.
 * LE-preserving: detects CRLF vs LF and matches it.
 * Anchor-strict: both replacement anchors must appear EXACTLY ONCE;
 *   throws otherwise (no partial-apply risk).
 * Backup-before-write: creates timestamped backup of the tracker before
 *   any modification.
 * Positive assertions: 8 checks run in-memory before file is written.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const TRACKER = path.join(ROOT, 'docs', 'W-LEADS-WORKBENCH-TRACKER.md')

if (!fs.existsSync(TRACKER)) {
  console.error('FATAL: tracker file missing: ' + TRACKER)
  process.exit(2)
}

let content = fs.readFileSync(TRACKER, 'utf8')
const originalLength = content.length

// =========================================================================
// IDEMPOTENCY CHECK
// =========================================================================
const V20_MARKER = 'v20 \u2014 W5c-4c SHIPPED'
if (content.indexOf(V20_MARKER) !== -1) {
  console.log('No-op: tracker already at v20 (marker "' + V20_MARKER + '" present).')
  process.exit(0)
}

// =========================================================================
// LE DETECTION (sample first 8 KB)
// =========================================================================
const sample = content.slice(0, 8192)
const crlfMatches = sample.match(/\r\n/g) || []
const lfMatches = sample.match(/(?<!\r)\n/g) || []
const useCRLF = crlfMatches.length > 0 && lfMatches.length === 0
const LE = useCRLF ? '\r\n' : '\n'
console.log('Line endings: ' + (useCRLF ? 'CRLF' : 'LF') +
  '  (sampled: crlf=' + crlfMatches.length + ', bareLf=' + lfMatches.length + ')')

// =========================================================================
// Helper: occurrence count
// =========================================================================
function countOccurrences(haystack, needle) {
  let count = 0
  let pos = 0
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++
    pos += needle.length
  }
  return count
}

// =========================================================================
// (A) VERSION LINE
// =========================================================================
const versionLineStart = '**Version:** v19 \u2014 W5b SHIPPED'
const versionCount = countOccurrences(content, versionLineStart)
if (versionCount !== 1) {
  console.error(
    'FATAL: expected exactly 1 occurrence of version line anchor, found ' + versionCount,
  )
  process.exit(1)
}

const versionIdx = content.indexOf(versionLineStart)
let versionEnd = content.indexOf('\n', versionIdx)
if (versionEnd === -1) {
  console.error('FATAL: no newline found after version line anchor')
  process.exit(1)
}
// If CRLF, back off so we don't strip the \r
if (useCRLF && versionEnd > 0 && content[versionEnd - 1] === '\r') {
  versionEnd -= 1
}

const newVersionLine =
  '**Version:** v20 \u2014 W5c-4c SHIPPED \u2014 **W4 GROUP COMPLETE + W5 GROUP IN PROGRESS** \u2014 ' +
  'Three vip-approve routes now consolidated on shared `lib/admin-homes/approve-vip-request.ts` helper. ' +
  'W5c-4a (commits `dbb3fb6` + `9bb1a27` + `7a1aa1f`) created the helper (~26 KB) encapsulating status flip + ' +
  'chat_sessions upgrade + estimator_limit UPSERT + email send with BCC chain + fail-closed posture on ' +
  'AdminPlatformUnreachable + optional audit-write to lead_admin_actions (only when caller passes audit param). ' +
  'W5c-4b (`6dcf537` + `49f498b`) migrated `app/api/admin-homes/leads/[id]/vip-approve/route.ts` ' +
  '(workbench manual approve from W4f) to the helper. W5c-4c (`d6079cf`) migrated ' +
  '`app/api/walliam/estimator/vip-approve/route.ts` (email-link estimator approve) to the helper with two ' +
  'source-text deltas logged: `F-W5C-4C-UNICODE-AS-ESCAPES` (icons + em-dash written as `\\uXXXX` escapes; ' +
  'source file is pure ASCII for paste safety) and `F-W5C-4C-EMPTY-TENANT-GUARD-ADDED` (explicit error HTML ' +
  'when `vipRequest.chat_sessions?.tenant_id` is null, replacing legacy silent-fail `tenantId || \'\'` pattern). ' +
  'Each migration gated by a dedicated static verifier (`scripts/verify-w5c-4[a,b,c]-*.js`); W5c-4c verifier ' +
  'ran 55/55 PASS before commit. System 1 (`app/api/chat/vip-approve/route.ts`) untouched. Helper consumers ' +
  'now 2 of 3 candidate routes; third candidate `app/api/walliam/charlie/vip-approve/route.ts` still inline ' +
  'pending W5c-4d. `F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F` partially closed (2 of 3 endpoints consolidated). ' +
  'NEXT: W5c-4d (walliam/charlie/vip-approve migration \u2192 fully closes F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F) ' +
  'then W5c-5 (F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE evaluation) then W5c row flip OPEN \u2192 SHIPPED + v21 bump.'

content = content.slice(0, versionIdx) + newVersionLine + content.slice(versionEnd)
console.log('(A) Version line replaced.')

// =========================================================================
// (B) W5c ROW IN PHASE TABLE
// =========================================================================
const w5cOldRow =
  '| W5c | Per-role action gates everywhere | OPEN | \u2014 | ' +
  'Delete, reassign, bulk_sync, etc. \u2014 visibility + enablement per role; UI + API both check |'

const w5cCount = countOccurrences(content, w5cOldRow)
if (w5cCount !== 1) {
  console.error(
    'FATAL: expected exactly 1 occurrence of W5c row anchor, found ' + w5cCount,
  )
  process.exit(1)
}

const w5cIdx = content.indexOf(w5cOldRow)

const w5cNewRow =
  '| W5c | Per-role action gates + scope migration + helper consolidation | IN PROGRESS | \u2014 | ' +
  'Sub-phases: W5c-1 SHIPPED `c40530c` (F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW closed); ' +
  'W5c-2 SHIPPED `8c89c50` (scope.ts consumer migration of leads/users/agents pages); ' +
  'W5c-3 SHIPPED `d4fac31` (per-role action gates on leads list view \u2014 Delete buttons hidden for agents); ' +
  'W5c-4a SHIPPED `dbb3fb6` + `9bb1a27` + `7a1aa1f` (created `lib/admin-homes/approve-vip-request.ts` helper); ' +
  'W5c-4b SHIPPED `6dcf537` + `49f498b` (migrated admin-homes workbench vip-approve to helper); ' +
  'W5c-4c SHIPPED `d6079cf` (migrated walliam/estimator/vip-approve to helper). ' +
  'W5c-4d OPEN (walliam/charlie/vip-approve migration \u2014 final helper consumer); ' +
  'W5c-5 OPEN (F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE evaluation). |'

content = content.slice(0, w5cIdx) + w5cNewRow + content.slice(w5cIdx + w5cOldRow.length)
console.log('(B) W5c row replaced (OPEN -> IN PROGRESS).')

// =========================================================================
// (C) APPEND STATUS LOG ENTRIES
// =========================================================================
// Normalize trailing whitespace: strip then ensure exactly one trailing LE.
content = content.replace(/\s+$/, '') + LE

const w5c4aEntry =
  '- **2026-05-15 W5c-4a-SHIPPED** \u2014 Created `lib/admin-homes/approve-vip-request.ts` (~26 KB) as ' +
  'shared helper consolidating VIP approve/deny side effects across three caller routes (closes ' +
  'F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F in part \u2014 helper itself created here; consumers migrate in 4b/4c/4d). ' +
  'Helper contract: takes `{ supabase, tenantId, vipRequest: VipRequestWithJoins, action: \'approve\' | \'deny\', ' +
  'brand: { brandName, baseUrl, domain }, userId, creditGrantNotePrefix, estimatorBccFailurePolicy: ' +
  '\'fail-closed\' | \'best-effort\', audit?: { actorRole, actorAgentId, leadId, notes } }`. Encapsulates: ' +
  '(1) `vip_requests` status flip (pending \u2192 approved | denied + responded_at + messages_granted); ' +
  '(2) `chat_sessions` upgrade (status=vip + vip_messages_granted + manual_approvals_count + last_approval_at) ' +
  'when session_id present; (3) `user_credit_overrides` UPSERT preserving sibling pool fields (estimator-only ' +
  'for estimator request_type; all-3-pools for plan/chat request_type with tenant config + agent fallback); ' +
  '(4) confirmation email via `sendTenantEmail` with brand context + agent TO + manager CC (via parent_id ' +
  'lookup) + admin BCC (via `getLeadEmailRecipients` Admin Platform layer 6) \u2014 fail-closed posture when ' +
  '`AdminPlatformUnreachable` fires in BCC fetch (side effects persist; email suppressed; helper returns ok:false); ' +
  '(5) optional audit write to `lead_admin_actions` (only when caller passes audit param; admin-homes workbench ' +
  'passes; email-link routes omit per F-VIP-APPROVE-EMAILS-NOT-AUDITED preservation). Three commits this phase: ' +
  '`dbb3fb6` feat (helper created); `9bb1a27` fix (normalize helper to LF + tighten verifier); ' +
  '`7a1aa1f` fix (replace bogus heading checks with literal-string checks in verifier \u2014 false-positive regex ' +
  'was matching markdown rendering tokens, not actual code structure). Static verifier ' +
  '`scripts/verify-w5c-4a-helper.js` covers contract surface (5 exports, type signatures, default param values, ' +
  'error class names). System 1 untouched. NEXT: W5c-4b migrate admin-homes workbench manual approve to ' +
  'consume the helper.'

const w5c4bEntry =
  '- **2026-05-15 W5c-4b-SHIPPED** \u2014 Migrated `app/api/admin-homes/leads/[id]/vip-approve/route.ts` ' +
  '(W4f endpoint \u2014 admin manual approve from the workbench VIP Requests tab) to consume `approveVipRequest` ' +
  'helper. Route reduced from ~16 KB inline to ~9 KB thin shell (parses params + permission gate via ' +
  '`can(\'lead.write\')` + delegates side effects to helper + returns JSON for the optimistic-UI workbench client). ' +
  'Audit write retained via helper\'s audit param: ' +
  '`{ actorRole, actorAgentId, leadId, notes: \'VIP request <action>d from admin workbench\' }` \u2014 second writer ' +
  'to `lead_admin_actions` semantics preserved through the migration. `estimatorBccFailurePolicy: ' +
  '\'best-effort\'` preserved from legacy behavior (admin already authenticated; AdminPlatformUnreachable logs ' +
  'warning but does NOT fail action, unlike the email-link estimator route which is fail-closed). ' +
  'Two commits this phase: `6dcf537` refactor (initial migration) + `49f498b` fix (tune verifier \u2014 size ' +
  'threshold widened for thin-shell route + `AdminPlatformUnreachable` regex literal check added to catch ' +
  'the helper\'s error type at the call site). Static verifier `scripts/verify-w5c-4b-static.js` ~10 KB / ' +
  '~38 checks covering helper import + call shape + audit param + permission gate + JSON response shape ' +
  'preserved. TSC clean. NEXT: W5c-4c migrate `app/api/walliam/estimator/vip-approve/route.ts` (email-link ' +
  'estimator approve from agent\'s VIP request email) to the helper.'

const w5c4cEntry =
  '- **2026-05-16 W5c-4c-SHIPPED** \u2014 Migrated `app/api/walliam/estimator/vip-approve/route.ts` (email-link ' +
  'estimator approve from the Approve/Deny button in the agent\'s VIP request email) to consume `approveVipRequest` ' +
  'helper. Commit `d6079cf` (2 files, 617 insertions, 161 deletions). Route side effects (status flip + ' +
  'chat_sessions upgrade + estimator_limit UPSERT + email send with BCC chain) delegated to shared helper. ' +
  'Preserved verbatim from legacy: GET handler signature + token/action URL params; `createServiceClient` ' +
  'inline (NOT switched to admin-homes/service-client); `vip_requests` fetch shape (`chat_sessions(*)` + ' +
  '`agents(...)` joins keyed on `approval_token`); direct `tenants` brand SELECT (NOT `getTenantContext`); ' +
  'idempotency (`status !== \'pending\'`); expiry handling (auto-flip to \'expired\' + render HTML); ' +
  '`createHtmlResponse` function (all 5 status configs + HTML template + System 2 dashboard link); all ' +
  'user-facing messages. Helper params: `userId: vipRequest.chat_sessions?.user_id` (legacy session-bound ' +
  'source), `creditGrantNotePrefix: \'Email approval \\u2014\'` (em-dash escape), ' +
  '`estimatorBccFailurePolicy: \'fail-closed\'` (matches legacy L141-145 abort posture \u2014 different from W5c-4b\'s ' +
  '\'best-effort\' since this is an unauthenticated email-link route), `audit` OMITTED ' +
  '(`F-VIP-APPROVE-EMAILS-NOT-AUDITED` preserved \u2014 legacy estimator does not write `lead_admin_actions`). ' +
  'Two source-text deltas logged (runtime byte-identical): `F-W5C-4C-UNICODE-AS-ESCAPES` (icons + em-dash ' +
  'written as `\\uXXXX` escapes rather than raw UTF-8 chars; source file is pure ASCII; bulletproofs against ' +
  'clipboard/encoding gotchas during paste) + `F-W5C-4C-EMPTY-TENANT-GUARD-ADDED` (explicit error HTML when ' +
  '`vipRequest.chat_sessions?.tenant_id` is null, replacing legacy silent-fail `tenantId || \'\'` pattern; ' +
  'practically unreachable but defensively prevents downstream errors). Static verifier ' +
  '`scripts/verify-w5c-4c-static.js` (15.8 KB / 55 checks) covers all preserved-verbatim contract items + ' +
  'ASCII purity + CRLF line endings + backup presence + helper wiring + isolation rules; ran 55/55 PASS ' +
  'before commit (3 verifier-side bugs in initial cut were corrected via 3 surgical updates: strip ' +
  '`//`-line-comments before checking `getTenantContext` literal in route body; same for ' +
  '`getLeadEmailRecipients`; allow optional trailing comma in `createHtmlResponse` signature regex). ' +
  'TSC `--noEmit` clean. System 1 (`app/api/chat/vip-approve/route.ts`) untouched. Helper consumers now ' +
  '2 of 3 candidate routes. `F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F` partially closed (2 of 3 endpoints ' +
  'consolidated). NEXT: W5c-4d migrate `app/api/walliam/charlie/vip-approve/route.ts` (Charlie email-link ' +
  'approve, parallel shape to the estimator one we just migrated) to the helper; will fully close ' +
  '`F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F`.'

content += LE + w5c4aEntry + LE + LE + w5c4bEntry + LE + LE + w5c4cEntry + LE
console.log('(C) 3 status log entries appended.')

// =========================================================================
// POSITIVE ASSERTIONS BEFORE WRITE
// =========================================================================
const assertions = [
  ['v20 marker present', content.indexOf(V20_MARKER) !== -1],
  [
    'W5c IN PROGRESS row present',
    content.indexOf('| W5c | Per-role action gates + scope migration + helper consolidation | IN PROGRESS |') !== -1,
  ],
  ['W5c-4d OPEN mentioned in row', content.indexOf('W5c-4d OPEN') !== -1],
  ['W5c-4a-SHIPPED entry present', content.indexOf('2026-05-15 W5c-4a-SHIPPED') !== -1],
  ['W5c-4b-SHIPPED entry present', content.indexOf('2026-05-15 W5c-4b-SHIPPED') !== -1],
  ['W5c-4c-SHIPPED entry present', content.indexOf('2026-05-16 W5c-4c-SHIPPED') !== -1],
  ['v19 W5b SHIPPED version-line removed', content.indexOf('**Version:** v19 \u2014 W5b SHIPPED') === -1],
  ['Old W5c OPEN row removed', content.indexOf('| W5c | Per-role action gates everywhere | OPEN |') === -1],
]

console.log('')
console.log('Post-patch assertions:')
console.log('-'.repeat(60))
let allPass = true
for (const [name, ok] of assertions) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name)
  if (!ok) allPass = false
}
console.log('-'.repeat(60))

if (!allPass) {
  console.error('\nFATAL: post-patch assertions failed. File NOT written.')
  process.exit(1)
}

// =========================================================================
// BACKUP + WRITE
// =========================================================================
const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const ts =
  now.getFullYear() +
  pad(now.getMonth() + 1) +
  pad(now.getDate()) +
  '_' +
  pad(now.getHours()) +
  pad(now.getMinutes()) +
  pad(now.getSeconds())
const backupPath = TRACKER + '.backup_' + ts

fs.copyFileSync(TRACKER, backupPath)
console.log('')
console.log('Backup created: ' + path.basename(backupPath))

fs.writeFileSync(TRACKER, content, 'utf8')
const finalSize = fs.statSync(TRACKER).size
console.log('Tracker written: ' + TRACKER)
console.log(
  'Size: ' + originalLength + ' bytes -> ' + finalSize + ' bytes  ' +
  '(net ' + (finalSize >= originalLength ? '+' : '') + (finalSize - originalLength) + ' bytes)',
)

process.exit(0)