#!/usr/bin/env node
/**
 * patch-w-leads-workbench-tracker-w5c-3.js
 *
 * docs(W-LEADS-WORKBENCH W5c-3): tracker status log entry.
 *
 * SINGLE atomic patch against docs/W-LEADS-WORKBENCH-TRACKER.md:
 *   P1: status log append -- 2026-05-15 W5c-3-SHIPPED entry after W5c-2 tail
 *       anchored on the unique closing phrase
 *       'ActorPermissionContext pre-fetched into AdminHomesUser per R3.2.1 refactor in auth.ts).'
 *
 * Two new findings logged in the W5c-3 entry:
 *   F-W5C-3-AGENT-CHECKBOXES-NON-FUNCTIONAL
 *   F-W5C-3-CLIENT-RBAC-COARSER-THAN-SERVER
 *
 * IMPORTANT: This patch does NOT bump the version line (v19 stays) and does
 * NOT flip the W5c phase-table row (stays OPEN). Per the W5c-2 plan documented
 * in its own status log entry: "final W5c tracker patch will flip W5c row
 * OPEN -> SHIPPED + bump v19 -> v20" -- those happen at W5c CLOSE after
 * W5c-3 + W5c-4 + W5c-5 all ship. Matches per-sub-phase rhythm established
 * by the W5c-1 + W5c-2 docs commit (1873f17).
 *
 * Tracker LE: LF (verified via byte scan: 0 CRLF / 245 LF on 2026-05-15).
 * Idempotent (skips if `2026-05-15 W5c-3-SHIPPED` marker already present).
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

const MARKER = '2026-05-15 W5c-3-SHIPPED'
if (text.indexOf(MARKER) !== -1) {
  console.log('SKIP: W5c-3-SHIPPED marker already present. No-op.')
  process.exit(0)
}

// ----- P1: Status log append -----
const P1_ANCHOR = 'ActorPermissionContext pre-fetched into AdminHomesUser per R3.2.1 refactor in auth.ts).'

const W5C_3_ENTRY_LINES = [
  '- **2026-05-15 W5c-3-SHIPPED** -- per-role action gates on leads list view (hides bulk + per-row Delete buttons for agents). Commit `d4fac31` (1873f17..d4fac31). **3 files**: 1 modified (`components/admin-homes/AdminHomesLeadsClient.tsx` 2-anchor patch adding `currentRole !== \'agent\'` gate to (A1) bulk Delete button in sort/filter bar + (A2) per-row Delete button in table Actions cell) + 2 new scripts (`scripts/patch-w-leads-workbench-w5c-3-action-gates.js` LE-normalized 2-anchor patch script with idempotency on `currentRole !== \'agent\'` marker + post-patch positive + NO-REGRESSION assertions + LE-reverify-on-disk; `scripts/verify-w5c-3-static.js` 28-check read-only static verifier covering 5 W5c-3 gates-present + 4 delete-handlers-preserved + 2 status-select-unchanged + 6 W5b plumbing-preserved + 4 checkboxes+Plan+CSV-preserved + 1 currentRole-prop-preserved + 3 server-side-policy-unchanged + 1 LE-preservation + 1 backup-present, exits 1 on any FAIL). **No schema migration. No new DB queries. No new API surface.** **Surface**: pure UI visibility gate matching the server-side DELETE policy at `app/api/admin-homes/leads/[id]/route.ts` which 403s agent deletes regardless of own-lead ownership (`if (!user.isPlatformAdmin && user.permissions.roleDb === \'agent\') return 403`). Defense-in-depth UX: server enforcement remains the source of truth; client gate removes the misleading "Delete" affordance from users who cannot perform the action. Status `<select>` (the "edit" surface referenced in the W5b->W5c-3 spec) is INTENTIONALLY preserved for all roles -- `can(\'lead.write\', ...)` permits agents to update status on their OWN leads, and server-side `scopeLeadsQuery` (W5c-2) ensures only own leads are visible in the list. Assign-agent is not in the current UI -- out of W5c-3 scope. **Multi-tenant safety**: pure client-side render gate; no DB queries, no new API surface, no tenant_id implications; server-side `scopeLeadsQuery` (W5c-2) + `can()` decisions on the route are unchanged. Every lead visible in the client IS writeable per identical predicates. Code path identical for any tenant. **No regressions**: 28 explicit assertions in verifier all PASS -- W5b plumbing preserved (Fragment import, flatRows useMemo, toggle button labels "Show all events"/"Collapse by user", +N earlier chip, !isEarlier guards on activity-preview + plan-data rows); inline status `<select>` + `updateLeadStatus` handler unchanged; bulk + per-row Delete handler bindings preserved (just visibility-gated); `handleDeleteSelected` + `deleteLead` fn declarations intact; per-row + header select-all checkboxes preserved; Plan/Hide Plan button preserved; exportToCSV preserved; `currentRole` prop destructure preserved; server-side DELETE agent-restriction still in place; server-side `can()` decisions on DELETE + PATCH preserved. **TSC clean. 28/28 verifier PASS.** **Backup**: `components/admin-homes/AdminHomesLeadsClient.tsx.backup_20260515_083439`. **Findings logged**: `F-W5C-3-AGENT-CHECKBOXES-NON-FUNCTIONAL` -- agents see per-row + select-all checkboxes but the bulk-delete button is hidden, so selections are functionally inert. Server-side already blocks the deletes; client gate is informative UX. Per-row checkbox column is preserved to keep table layout consistent across roles (avoids colspan recalc + scroll jank). Acceptable initial UX; candidate for follow-up if user feedback requests hiding the checkbox column for agents. `F-W5C-3-CLIENT-RBAC-COARSER-THAN-SERVER` -- client uses legacy 3-tier `currentRole` (`\'admin\' | \'manager\' | \'agent\'`) which is coarser than the 7-role surface used by `can()` server-side. For most actions this is fine because server-side `can()` is the source of truth (defense-in-depth: client hides + server enforces). The client cannot perfectly mirror server decisions for Manager Platform (tier 5) or Area Manager (tier 3) which have different scope rules. Mitigated by server-side enforcement -- client gating is informative UX, not security. **Visual smoke deferred**: no agent test user available currently; defense-in-depth nature documented in `F-W5C-3-CLIENT-RBAC-COARSER-THAN-SERVER` -- since server enforcement is the source of truth, the client gate is informative UX behind a verified server contract; static verifier 28/28 PASS covers the code-correctness contract. **W5c GROUP PROGRESS**: W5c-1 SHIPPED (commit c40530c, F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW closed); W5c-2 SHIPPED (commit 8c89c50, F-W5A-LEADS-LIST-INLINE-SCOPING-NOT-MIGRATED closed); W5c-3 SHIPPED (commit d4fac31, per-role action gates on leads list view); W5c-4 OPEN (F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F helper extraction); W5c-5 OPEN (F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE evaluation -- final phase of W5c group; final W5c tracker patch will flip W5c row OPEN -> SHIPPED + bump v19 -> v20). NEXT: **W5c-4** -- F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F helper extraction -- consolidate VIP approve logic between `app/api/walliam/charlie/vip-approve/route.ts` + `app/api/walliam/estimator/vip-approve/route.ts` + `app/api/admin-homes/leads/[id]/vip-approve/route.ts` (W4f) into a shared `lib/admin-homes/approve-vip-request.ts` util with mode parameter encoding the charlie-vs-estimator behavior split (charlie: all-3-pools grant + no BCC; estimator: estimator-only grant + BCC chain); refactor all 3 callers to consume it.',
]

const P1_NEW = P1_ANCHOR + NL + NL + W5C_3_ENTRY_LINES.join(NL)

const patches = [{ name: 'P1 status log append', old: P1_ANCHOR, new: P1_NEW }]

for (const p of patches) {
  const count = text.split(p.old).length - 1
  if (count !== 1) {
    throw new Error(
      p.name + ' anchor count ' + count + ' != 1 (expected exactly one match)',
    )
  }
}

for (const p of patches) {
  text = text.replace(p.old, p.new)
}

if (text.indexOf(MARKER) === -1) {
  throw new Error('post-patch: W5c-3-SHIPPED marker missing')
}
if (text.indexOf('`d4fac31`') === -1) {
  throw new Error('post-patch: W5c-3 commit SHA d4fac31 missing')
}
if (text.indexOf('F-W5C-3-AGENT-CHECKBOXES-NON-FUNCTIONAL') === -1) {
  throw new Error('post-patch: F-W5C-3-AGENT-CHECKBOXES-NON-FUNCTIONAL finding missing')
}
if (text.indexOf('F-W5C-3-CLIENT-RBAC-COARSER-THAN-SERVER') === -1) {
  throw new Error('post-patch: F-W5C-3-CLIENT-RBAC-COARSER-THAN-SERVER finding missing')
}

// Guard against accidental version bump or phase-row flip (Rule Zero: this
// patch is deliberately scoped to the status log only).
const versionLineV20Probe = text.indexOf('**Version:** v20')
if (versionLineV20Probe !== -1) {
  throw new Error('post-patch: unexpected v20 version line -- this patch should NOT bump the version')
}
const w5cShippedRowProbe = text.indexOf('| W5c | Per-role action gates everywhere | SHIPPED |')
if (w5cShippedRowProbe !== -1) {
  throw new Error('post-patch: unexpected W5c SHIPPED phase row -- this patch should NOT flip the row')
}

if (LE === 'lf' && text.indexOf('\r\n') !== -1) {
  throw new Error('CRLF introduced into LF tracker')
}

fs.copyFileSync(TRACKER, TRACKER + '.backup_' + stamp)
fs.writeFileSync(TRACKER, text, 'utf8')

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

console.log('')
console.log('W5c-3 tracker patch applied successfully.')
console.log('')
console.log('  ~ ' + TRACKER)
console.log('    backup: W-LEADS-WORKBENCH-TRACKER.md.backup_' + stamp)
console.log('  1 patch applied:')
console.log('    P1: status log W5c-3-SHIPPED entry appended (2 findings)')
console.log('')
console.log('Note: version line stays at v19 and W5c phase row stays OPEN.')
console.log('Per W5c-2 plan, both flip at W5c close (after W5c-5).')
console.log('')
console.log('Next:')
console.log('  git add docs/W-LEADS-WORKBENCH-TRACKER.md \\')
console.log('          scripts/patch-w-leads-workbench-tracker-w5c-3.js')
console.log('  git commit -F <message file>')
console.log('  git push origin main')