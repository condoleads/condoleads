#!/usr/bin/env node
/**
 * patch-w-leads-workbench-w5c-close-v21.js
 *
 * W5c-5 (F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE evaluation) + W5c group close
 * + tracker v20 -> v21 bump, all in one atomic patch.
 *
 * Changes:
 *   (A) app/admin-homes/leads/[id]/page.tsx -- LF file
 *       Replace single-line F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE
 *       "logged for W5c evaluation" comment with an expanded
 *       EVALUATED-LOCKED decision block (4 rationale points + forward
 *       escape hatch note).
 *
 *   (B) docs/W-LEADS-WORKBENCH-TRACKER.md -- CRLF file
 *       (B1) Version line v20 -> v21
 *       (B2) W5c row IN PROGRESS -> SHIPPED, with W5c-4d commit ref
 *            (12407bb) and W5c-5 sub-phase added
 *       (B3) Append two status log entries:
 *            - 2026-05-16 W5c-4d-SHIPPED
 *            - 2026-05-16 W5c-5-SHIPPED (includes W5c GROUP CLOSED note)
 *
 * Idempotent: skips with exit 0 if the v21 marker is already present.
 * Atomic: ALL anchors must match in memory BEFORE either file is written.
 * Per-file LE preserved (page.tsx is LF; tracker is CRLF).
 * Backup-before-write for both files (Rule Zero).
 * 9 positive assertions before any file is written.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const PAGE = path.join(ROOT, 'app', 'admin-homes', 'leads', '[id]', 'page.tsx')
const TRACKER = path.join(ROOT, 'docs', 'W-LEADS-WORKBENCH-TRACKER.md')

if (!fs.existsSync(PAGE)) {
  console.error('FATAL: page.tsx missing: ' + PAGE)
  process.exit(2)
}
if (!fs.existsSync(TRACKER)) {
  console.error('FATAL: tracker missing: ' + TRACKER)
  process.exit(2)
}

let pageContent = fs.readFileSync(PAGE, 'utf8')
let trackerContent = fs.readFileSync(TRACKER, 'utf8')
const pageOrigLen = pageContent.length
const trackerOrigLen = trackerContent.length

// ---------- IDEMPOTENCY CHECK ----------
const V21_MARKER = 'v21 \u2014 W5c GROUP CLOSED'
if (trackerContent.indexOf(V21_MARKER) !== -1) {
  console.log('No-op: tracker already at v21 (marker "' + V21_MARKER + '" present).')
  process.exit(0)
}

// ---------- LE DETECTION ----------
function detectLE(content, name) {
  const sample = content.slice(0, 8192)
  const crlf = (sample.match(/\r\n/g) || []).length
  const bareLf = (sample.match(/(?<!\r)\n/g) || []).length
  const useCRLF = crlf > 0 && bareLf === 0
  const LE = useCRLF ? '\r\n' : '\n'
  console.log(name + ': ' + (useCRLF ? 'CRLF' : 'LF') + '  (crlf=' + crlf + ' bareLf=' + bareLf + ')')
  return LE
}
const pageLE = detectLE(pageContent, 'page.tsx LE')
const trackerLE = detectLE(trackerContent, 'tracker LE')

function countOccurrences(haystack, needle) {
  let count = 0
  let pos = 0
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++
    pos += needle.length
  }
  return count
}

// ============================================================
// (A) page.tsx -- expand F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE comment
// ============================================================
const pageOldComment =
  '//     F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE logged for W5c evaluation.'
const pageCount = countOccurrences(pageContent, pageOldComment)
if (pageCount !== 1) {
  console.error(
    'FATAL: expected 1 occurrence of page.tsx F-W4A anchor, found ' + pageCount,
  )
  process.exit(1)
}

const pageNewComment = [
  '//     F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE -- EVALUATED W5c-5 (2026-05-16):',
  '//     LOCKED keep-as-is. Decision rationale:',
  '//       (a) outcome #3 of W-LEADS-WORKBENCH v2 scope-lock explicitly',
  '//           calls for cumulative-journey view (agent sees the complete',
  '//           user journey across all touchpoints, even sibling leads',
  '//           owned by other agents in the same tenant);',
  '//       (b) tenant safety is preserved (every sibling fetch is gated',
  '//           by anchorLead.tenant_id, the trusted source from the',
  '//           cross-tenant gate above) -- this is NOT a multi-tenant leak;',
  '//       (c) the visibility is intra-tenant only: an agent in tenant A',
  '//           never sees a lead in tenant B regardless of user_id',
  '//           collisions;',
  '//       (d) changing to per-agent scope would be a UX regression for',
  '//           agents serving repeat-engagement users (the whole point of',
  '//           the workbench cumulative-history surface).',
  '//     Forward escape hatch: if a future requirement surfaces for',
  '//     agent-only sibling visibility (e.g. a tenant onboards with a',
  '//     brokerage-level privacy policy), implement as an opt-in tenant',
  '//     config flag rather than changing the default behavior.',
].join(pageLE)

pageContent = pageContent.replace(pageOldComment, pageNewComment)
console.log('(A) page.tsx F-W4A comment expanded.')

// ============================================================
// (B1) Tracker version line v20 -> v21
// ============================================================
const versionLineStart = '**Version:** v20 \u2014 W5c-4c SHIPPED'
const versionCount = countOccurrences(trackerContent, versionLineStart)
if (versionCount !== 1) {
  console.error(
    'FATAL: expected 1 occurrence of v20 version line anchor, found ' + versionCount,
  )
  process.exit(1)
}
const versionIdx = trackerContent.indexOf(versionLineStart)
let versionEnd = trackerContent.indexOf('\n', versionIdx)
if (versionEnd === -1) {
  console.error('FATAL: no newline after version line anchor')
  process.exit(1)
}
if (trackerLE === '\r\n' && versionEnd > 0 && trackerContent[versionEnd - 1] === '\r') {
  versionEnd -= 1
}

const newVersionLine =
  '**Version:** v21 \u2014 W5c GROUP CLOSED \u2014 **W4 + W5 GROUPS COMPLETE; W6 + W7 + W8 GROUPS REMAIN** \u2014 ' +
  'W5c-4d shipped (`12407bb`): final vip-approve route ' +
  '(`app/api/walliam/charlie/vip-approve/route.ts`) migrated to shared ' +
  '`approveVipRequest` helper, fully closing F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F ' +
  '(3 of 3 endpoints now consolidated; only System 1 ' +
  '`app/api/chat/vip-approve/route.ts` remains separate per isolation rule). ' +
  'W5c-5 shipped (this commit; comment-only): F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE ' +
  'EVALUATED and LOCKED keep-as-is, rationale recorded inline in ' +
  '`app/admin-homes/leads/[id]/page.tsx` header comment block (4 reasons: ' +
  'outcome #3 cumulative-journey intent; tenant safety preserved via ' +
  'anchorLead.tenant_id gate; visibility is intra-tenant only; per-agent ' +
  'scope would be UX regression). W5c row in phase table flipped IN PROGRESS ' +
  '\u2192 SHIPPED. NEXT: W6 group (W6a action audit log writes from every ' +
  'admin endpoint; W6b Assigned Agent reassign dropdown role-gated; W6c ' +
  'status default-filter active-only + Hot-quality sort) then W7 smoke matrix ' +
  '`scripts/smoke-w-leads-workbench.ts` (every CTA \u00d7 every role \u00d7 ' +
  'cumulative variants; transactional rollback per W-LEADS-EMAIL T3b pattern) ' +
  'then W8 local smoke + Wclose + master tracker entry.'

trackerContent =
  trackerContent.slice(0, versionIdx) +
  newVersionLine +
  trackerContent.slice(versionEnd)
console.log('(B1) Version line v20 -> v21.')

// ============================================================
// (B2) W5c row IN PROGRESS -> SHIPPED
// ============================================================
const w5cOldRowStart =
  '| W5c | Per-role action gates + scope migration + helper consolidation | IN PROGRESS | \u2014 |'
const w5cOldRowCount = countOccurrences(trackerContent, w5cOldRowStart)
if (w5cOldRowCount !== 1) {
  console.error(
    'FATAL: expected 1 occurrence of W5c IN PROGRESS row, found ' + w5cOldRowCount,
  )
  process.exit(1)
}
const w5cIdx = trackerContent.indexOf(w5cOldRowStart)
let w5cEnd = trackerContent.indexOf('\n', w5cIdx)
if (w5cEnd === -1) {
  console.error('FATAL: no newline after W5c row')
  process.exit(1)
}
if (trackerLE === '\r\n' && w5cEnd > 0 && trackerContent[w5cEnd - 1] === '\r') {
  w5cEnd -= 1
}

const w5cNewRow =
  '| W5c | Per-role action gates + scope migration + helper consolidation | SHIPPED | 2026-05-16 | ' +
  'All sub-phases SHIPPED: ' +
  'W5c-1 `c40530c` (F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW closed); ' +
  'W5c-2 `8c89c50` (scope.ts consumer migration of leads/users/agents pages); ' +
  'W5c-3 `d4fac31` (per-role action gates on leads list view \u2014 Delete buttons hidden for agents); ' +
  'W5c-4a `dbb3fb6` + `9bb1a27` + `7a1aa1f` (created `lib/admin-homes/approve-vip-request.ts` helper); ' +
  'W5c-4b `6dcf537` + `49f498b` (migrated admin-homes workbench vip-approve to helper); ' +
  'W5c-4c `d6079cf` (migrated walliam/estimator/vip-approve to helper); ' +
  'W5c-4d `12407bb` (migrated walliam/charlie/vip-approve to helper \u2014 F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F fully closed; 3 of 3 endpoints consolidated); ' +
  'W5c-5 (this commit; comment-only) (F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE EVALUATED and LOCKED keep-as-is; rationale documented in `app/admin-homes/leads/[id]/page.tsx` header). |'

trackerContent =
  trackerContent.slice(0, w5cIdx) +
  w5cNewRow +
  trackerContent.slice(w5cEnd)
console.log('(B2) W5c row IN PROGRESS -> SHIPPED.')

// ============================================================
// (B3) Append two status log entries
// ============================================================
trackerContent = trackerContent.replace(/\s+$/, '') + trackerLE

const w5c4dEntry =
  '- **2026-05-16 W5c-4d-SHIPPED** \u2014 Migrated ' +
  '`app/api/walliam/charlie/vip-approve/route.ts` (Charlie email-link approve ' +
  'from the agent\'s VIP request email Approve/Deny button) to consume ' +
  '`approveVipRequest` helper. Commit `12407bb`. Final helper consumer of the ' +
  '3-route consolidation; fully closes `F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F` ' +
  '(3 of 3 endpoints now consolidated; only System 1 ' +
  '`app/api/chat/vip-approve/route.ts` remains separate per isolation rule). ' +
  'Route side effects (status flip + chat_sessions upgrade + ' +
  'user_credit_overrides UPSERT for all 3 pools + email send to user) ' +
  'delegated to shared helper. Preserved verbatim from legacy: GET handler ' +
  'signature + token/action URL params; `createServiceClient` inline; ' +
  '`vip_requests` fetch shape (`chat_sessions(*)` + `agents(...)` joins keyed ' +
  'on `approval_token`); brand load via `getTenantContext` helper (legacy ' +
  'pattern; differs from W5c-4c estimator route which uses direct `tenants` ' +
  'SELECT \u2014 helper accepts brand as a value object so both patterns work); ' +
  'idempotency (`status !== \'pending\'`); expiry handling; ' +
  '`createHtmlResponse` function (5 status configs with HTML entity icons ' +
  '`&#10003;` / `&#10007;` / `&#9888;` / `&#8987;` / `&#8505;` \u2014 different ' +
  'from W5c-4c estimator route which uses Unicode escapes; both render ' +
  'identically in browsers); title format ' +
  '`${brand ? brand + \' - \' : \'\'}${title}` (hyphen separator with ' +
  'conditional brand prefix \u2014 different from W5c-4c em-dash separator); ' +
  'approve message `Plan access granted to <user>... additional plan(s)`; ' +
  'deny message `VIP request from <user> has been denied`. Helper params: ' +
  '`userId: vipRequest.chat_sessions?.user_id`; ' +
  '`creditGrantNotePrefix: \'Email approval \\u2014\'`; ' +
  '`estimatorBccFailurePolicy: \'fail-open\'` (IRRELEVANT for Charlie per ' +
  'helper docstring L155 \u2014 Charlie request_type is `plan` or `chat`, ' +
  'never `estimator`, so the helper does NOT fetch a BCC chain and the ' +
  'policy is not consulted; passed for type-completeness); `audit` OMITTED ' +
  '(legacy Charlie does not write `lead_admin_actions`). Two source-text ' +
  'deltas (runtime byte-identical): `F-W5C-4D-ASCII-COMMENTS` (em-dashes in ' +
  'comments replaced with `--` for pure-ASCII source; paste safety; matches ' +
  'W5c-4c convention) + `F-W5C-4D-EMPTY-TENANT-GUARD-ADDED` (explicit error ' +
  'HTML when `vipRequest.chat_sessions?.tenant_id` is null, replacing legacy ' +
  'silent-fail `tenantId || \'\'` pattern). Static verifier ' +
  '`scripts/verify-w5c-4d-static.js` (~55 checks) covers all preserved-verbatim ' +
  'contract items + ASCII purity + LE pure + helper wiring + isolation rules; ' +
  'ran clean before commit. TSC `--noEmit` clean. System 1 ' +
  '(`app/api/chat/vip-approve/route.ts`) untouched. NEXT: W5c-5 ' +
  '(F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE evaluation) then W5c row flip ' +
  'IN PROGRESS \u2192 SHIPPED + v21 tracker bump.'

const w5c5Entry =
  '- **2026-05-16 W5c-5-SHIPPED** \u2014 ' +
  '`F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE` EVALUATED and LOCKED keep-as-is. ' +
  'This is a doc/comment-only change (zero runtime behavior change); the ' +
  'workbench leadFamily aggregation continues to surface all leads from the ' +
  'same `user_id` within the same tenant, regardless of which agent owns ' +
  'each sibling lead. Rationale recorded inline in ' +
  '`app/admin-homes/leads/[id]/page.tsx` header comment block (4 reasons): ' +
  '(a) outcome #3 of W-LEADS-WORKBENCH v2 scope-lock explicitly calls for ' +
  'cumulative-journey view (agent sees the complete user journey across all ' +
  'touchpoints, even sibling leads owned by other agents in the same tenant); ' +
  '(b) tenant safety is preserved (every sibling fetch is gated by ' +
  '`anchorLead.tenant_id`, the trusted source from the cross-tenant gate; ' +
  'this is NOT a multi-tenant leak); (c) the visibility is intra-tenant only ' +
  '(an agent in tenant A never sees a lead in tenant B regardless of user_id ' +
  'collisions); (d) changing to per-agent scope would be a UX regression for ' +
  'agents serving repeat-engagement users (the whole point of the workbench ' +
  'cumulative-history surface). Forward escape hatch documented: if a future ' +
  'requirement surfaces for agent-only sibling visibility (e.g. a tenant ' +
  'onboards with a brokerage-level privacy policy), implement as an opt-in ' +
  'tenant config flag rather than changing the default behavior. ' +
  '**W5c GROUP CLOSED** \u2014 5 sub-phases shipped (W5c-1 through W5c-5). ' +
  '**W4 + W5 GROUPS COMPLETE.** Remaining work to close W-LEADS-WORKBENCH: ' +
  'W6a (action audit log writes from every admin endpoint), W6b (Assigned ' +
  'Agent reassign dropdown, role-gated), W6c (status default-filter ' +
  'active-only + Hot-quality sort), W7 (smoke matrix ' +
  '`scripts/smoke-w-leads-workbench.ts` \u2014 every CTA \u00d7 every role ' +
  '\u00d7 cumulative variants, transactional rollback per W-LEADS-EMAIL T3b ' +
  'pattern), W8 (local smoke + Wclose + master tracker entry).'

trackerContent += trackerLE + w5c4dEntry + trackerLE + trackerLE + w5c5Entry + trackerLE
console.log('(B3) 2 status log entries appended.')

// ============================================================
// POSITIVE ASSERTIONS (BEFORE WRITE)
// ============================================================
const assertions = [
  [
    'page: F-W4A EVALUATED W5c-5 marker present',
    pageContent.indexOf('F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE -- EVALUATED W5c-5 (2026-05-16)') !== -1,
  ],
  [
    'page: old "logged for W5c evaluation" single-line comment removed',
    pageContent.indexOf('F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE logged for W5c evaluation') === -1,
  ],
  [
    'page: forward escape hatch language present',
    pageContent.indexOf('Forward escape hatch') !== -1,
  ],
  ['tracker: v21 marker present', trackerContent.indexOf(V21_MARKER) !== -1],
  [
    'tracker: W5c SHIPPED row present',
    trackerContent.indexOf('| W5c | Per-role action gates + scope migration + helper consolidation | SHIPPED |') !== -1,
  ],
  [
    'tracker: old W5c IN PROGRESS row removed',
    trackerContent.indexOf('| W5c | Per-role action gates + scope migration + helper consolidation | IN PROGRESS |') === -1,
  ],
  ['tracker: W5c-4d-SHIPPED entry present', trackerContent.indexOf('2026-05-16 W5c-4d-SHIPPED') !== -1],
  ['tracker: W5c-5-SHIPPED entry present', trackerContent.indexOf('2026-05-16 W5c-5-SHIPPED') !== -1],
  [
    'tracker: old v20 version line removed',
    trackerContent.indexOf('**Version:** v20 \u2014 W5c-4c SHIPPED') === -1,
  ],
  ['tracker: W5c-4d commit ref 12407bb present in row + log', trackerContent.indexOf('12407bb') !== -1],
]

let allPass = true
console.log('')
console.log('Post-patch assertions:')
console.log('-'.repeat(60))
for (const [name, ok] of assertions) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name)
  if (!ok) allPass = false
}
console.log('-'.repeat(60))

if (!allPass) {
  console.error('\nFATAL: assertions failed. NO FILES WRITTEN.')
  process.exit(1)
}

// ============================================================
// BACKUP + WRITE (atomic: both files together)
// ============================================================
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

fs.copyFileSync(PAGE, PAGE + '.backup_' + ts)
fs.copyFileSync(TRACKER, TRACKER + '.backup_' + ts)
console.log('')
console.log('Backups created:')
console.log('  ' + path.basename(PAGE) + '.backup_' + ts)
console.log('  ' + path.basename(TRACKER) + '.backup_' + ts)

fs.writeFileSync(PAGE, pageContent, 'utf8')
fs.writeFileSync(TRACKER, trackerContent, 'utf8')

const pageNewLen = fs.statSync(PAGE).size
const trackerNewLen = fs.statSync(TRACKER).size

console.log('')
console.log('Files written:')
console.log(
  '  page.tsx:  ' + pageOrigLen + ' -> ' + pageNewLen +
    ' bytes  (net ' + (pageNewLen >= pageOrigLen ? '+' : '') + (pageNewLen - pageOrigLen) + ')',
)
console.log(
  '  tracker:   ' + trackerOrigLen + ' -> ' + trackerNewLen +
    ' bytes  (net ' + (trackerNewLen >= trackerOrigLen ? '+' : '') + (trackerNewLen - trackerOrigLen) + ')',
)

process.exit(0)