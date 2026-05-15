#!/usr/bin/env node
/**
 * patch-w-leads-workbench-tracker-w5c-progress.js
 *
 * docs(W-LEADS-WORKBENCH W5c-1 + W5c-2): tracker status log entries.
 *
 * Single patch against docs/W-LEADS-WORKBENCH-TRACKER.md:
 *   P1: append two status log entries (W5c-1 + W5c-2) after the W5b entry
 *       tail, anchored on the unique W5b-entry final sentence ending
 *       'consolidate VIP approve logic between W4f and W4g code paths
 *       into a shared util to eliminate the duplicate-logic finding).'
 *
 * No version bump (v19 stays -- W5c is mid-phase, only flips at W5c-5).
 * No phase row update (W5c stays OPEN -- only flips at W5c-5 close).
 *
 * Findings recorded in entries:
 *   F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW -> CLOSED (W5c-1)
 *   F-W5A-LEADS-LIST-INLINE-SCOPING-NOT-MIGRATED -> CLOSED (W5c-2)
 *   F-W5C-LEADS-HEADER-HARDCODED-WALLIAM-IN-UNIVERSAL-VIEW (logged W5c-1; cosmetic, not blocking)
 *   F-W5C-2-USERS-PAGE-PARTIAL-MIGRATION (logged W5c-2)
 *   F-W5C-2-AGENTS-PAGE-NO-ROLE-GATE (logged W5c-2)
 *
 * Tracker LE: LF. Idempotent (skips if W5c-2-SHIPPED marker present).
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

const W5C2_MARKER = '2026-05-15 W5c-2-SHIPPED'
if (text.indexOf(W5C2_MARKER) !== -1) {
  console.log('SKIP: W5c-2-SHIPPED marker already present. No-op.')
  process.exit(0)
}

// ----- P1: Append W5c-1 + W5c-2 entries after the W5b tail -----
const P1_ANCHOR = 'consolidate VIP approve logic between W4f and W4g code paths into a shared util to eliminate the duplicate-logic finding).'

const W5C_1_ENTRY =
  '- **2026-05-15 W5c-1-SHIPPED** -- close F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW (carried from W4g; PARTIALLY MITIGATED in W5a; now CLOSED). Commit `c40530c` (a19f8bf..c40530c). **3 files**: 1 modified (`lib/admin-homes/auth.ts`) + 2 new scripts (`patch-w-leads-workbench-w5c-1-resolveuser-agentid-leak.js` single LE-normalized anchor patch with idempotency + post-patch assertions + LE-reverify-on-disk; `verify-w5c-1-static.js` 19-check static verifier -- 4 W5c-1 fix-present + 13 NO REGRESSION + LE preservation + backup present, exits 1 on any FAIL). **Surface**: single ternary guard injected after the existing agent query in resolveAdminHomesUser -- `const { data: rawAgent } = await agentQuery.maybeSingle(); const agent = (!effectiveTenantId && isPlatformAdmin) ? null : rawAgent` plus 12-line explanatory comment citing the finding ID. Forces the Universal-view path (no platform_tenant_override cookie + no x-tenant-id header + no home tenant for a platform admin) into the existing synthetic admin code path which already correctly returns `{ agentId: null, role: \'admin\', ... }`. **No schema migration. No new DB queries. No new API surface.** **Multi-tenant safety (this commit IS the fix)**: after this patch resolveAdminHomesUser is provably tenant-safe across every (effectiveTenantId, isPlatformAdmin) combination -- (truthy, *) query filtered .eq tenant_id, agentId tenant-correct or null via synthetic path; (null, true) guard fires -> agent=null -> synthetic path -> agentId=null (THE FIX); (null, false) guard skipped -> tenant_id IS NULL agent row matched correctly (legacy condoleads.ca standalone agents like Shah). No implicit cross-tenant fallback path remains for platform admins. **No regressions**: 13 explicit assertions in verifier all PASS (synthetic admin path comment + if(!agent) guard + synthetic returns agentId:null + real path uses agent.id + position computation + roleDb assignment + computeManagedAgentIds + fetchActiveDelegators + export + interface + permissions field + agent query select shape + tenant filter gated on effectiveTenantId). **TSC clean. 19/19 verifier PASS.** **Visual smoke 2026-05-15**: /admin-homes/leads opened in incognito as Platform Admin Syed Shah, picked "All tenants (Universal)" in the tenant switcher -- page loaded cleanly (no 500, no redirect loop), "No tenant selected" amber banner displayed, leads list rendered all 164 leads from all tenants with no agent-scoped filter (seeAll behavior fully respected via synthetic admin path returning agentId=null). **Backup**: `lib/admin-homes/auth.ts.backup_20260515_062553`. **Finding CLOSED**: F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW (carried since W4g). **Cosmetic finding noted (not blocking)**: `F-W5C-LEADS-HEADER-HARDCODED-WALLIAM-IN-UNIVERSAL-VIEW` -- AdminHomesLeadsClient.tsx hardcodes `<h1>WALLiam Leads</h1>` + `<p>All lead sources from walliam.ca</p>`. In Universal view this is misleading (page shows ALL leads from ALL tenants); zero practical impact today (WALLiam is the only active tenant), will mislead as tenant #2+ onboards. Candidate for a future cosmetic phase or roll-in with W5c-3.'

const W5C_2_ENTRY =
  '- **2026-05-15 W5c-2-SHIPPED** -- scope.ts consumer migration across leads/page.tsx + users/page.tsx + agents/page.tsx (closes F-W5A-LEADS-LIST-INLINE-SCOPING-NOT-MIGRATED carried from W5a). Commit `8c89c50` (c40530c..8c89c50). **5 files**: 3 modified (`app/admin-homes/leads/page.tsx` + `app/admin-homes/users/page.tsx` + `app/admin-homes/agents/page.tsx`) + 2 new scripts (`scripts/patch-w-leads-workbench-w5c-2-scope-consumer-migration.js` 7-anchor LE-normalized patch with per-file LE detection + withLE normalization helper + idempotency on `scopeLeadsQuery` import marker in leads/page.tsx + post-patch positive + negative assertions + LE-reverify-on-disk per file; `scripts/verify-w5c-2-static.js` ~45-check read-only static verifier covering 4 scope.ts integrity + 9 leads W5c-2 + 8 leads NO REGRESSION + 5 users W5c-2 + 6 users NO REGRESSION + 6 agents W5c-2 + 5 agents NO REGRESSION + 3 LE preservation + 3 backup-present, exits 1 on any FAIL). **No schema migration. No new DB queries. No new API surface.** **Per-file migration scope**: (1) `leads/page.tsx` FULL migration -- imports `scopeLeadsQuery` + `scopeAgentsByRole` from `@/lib/admin-homes/scope`; leads query replaces inline tenant + role gates with `scopeLeadsQuery(query, adminUser, tenantId)` (behavior-preserving; inline pattern matched helper semantics exactly per code-level diff inspection); agents-for-filter query replaces inline tenant + role gates with `scopeAgentsByRole(agentsQuery, adminUser, tenantId)`; empty-return guard flattened from nested `if (!seeAll) { if (!scopedTenantId) }` to single `if (!seeAll && !scopedTenantId)` (functionally equivalent); null-adminUser tenant-only fallback preserved via `else if (!seeAll && scopedTenantId)` branch (no role gate applied when unauthenticated; behavior unchanged from pre-W5c-2). (2) `users/page.tsx` PARTIAL migration -- imports `scopeAgentsByRole`; agents-for-display-names query (single occurrence used to build the agent_id->name map for the users table) replaces inline tenant + role gates with `scopeAgentsByRole(agentsQuery, adminUser, hostTenantId)`. user_profiles + chat_sessions + user_credit_overrides queries keep inline scoping -- their patterns (assigned_agent_id IN pre-fetched tenant_agents; tenant-only filter without role gate) do not fit existing scope.ts helpers (adding new helpers would have been scope creep for W5c-2). (3) `agents/page.tsx` TENANT-ONLY migration -- imports `getCurrentTenantId` + `isCrossTenantView` + `getScopedTenantId`; hostTenantId now fetched via `getCurrentTenantId()` (was missing pre-W5c-2; defense-in-depth tightening with no observable delta in practice since `user.tenantId` already incorporates hostTenantId via auth.ts/getAdminTenantContext priority chain); seeAll/scopedTenantId computed via helpers (consistent with leads + users patterns). `scopeAgentsByRole` INTENTIONALLY NOT CALLED -- pre-W5c-2 agents page had NO role gate (lists all tenant agents to any user with page access); adding role gates would change behavior for manager/agent users on the agents management page; deferred to preserve current UX. **Multi-tenant safety (behavior-preserving)**: leads tenant gate before == after (inline matched helper exactly); leads role gate before == after; leads empty-return preserved (just flattened if-structure); leads null-adminUser fallback preserved; users (agents-for-display-names query) before == after; users other queries unchanged (user_profiles + chat_sessions + overrides keep inline scoping); agents tenant gate before == after in practice (user.tenantId already incorporates hostTenantId); agents role gate preserved as absent (no helper call). Helper functions are pure (no I/O, no async, no throws) per scope.ts contract. No implicit cross-tenant fallback path. **No regressions**: ~45 explicit assertions in verify-w5c-2-static.js all PASS. **TSC clean. All verifier PASS.** **Visual smoke 2026-05-15**: all 3 routes (/admin-homes/leads + /admin-homes/users + /admin-homes/agents) return 200 in both WALLiam scope (via tenant switcher pick) and Universal scope (via "All tenants (Universal)" switcher pick). Dev server log confirmed multiple GETs across both scopes with POST /api/admin-homes/scope/set-tenant 200 switcher transitions in between; no 500s, no redirect loops, no compile errors. **Backups**: `app/admin-homes/leads/page.tsx.backup_<stamp>`, `app/admin-homes/users/page.tsx.backup_<stamp>`, `app/admin-homes/agents/page.tsx.backup_<stamp>`. **Findings logged**: `F-W5C-2-USERS-PAGE-PARTIAL-MIGRATION` (user_profiles + chat_sessions + user_credit_overrides queries in users/page.tsx keep inline scoping; their patterns do not fit existing scope.ts helpers; adding new helpers would have been scope creep for W5c-2 and is deferred unless a future consumer surfaces the same pattern); `F-W5C-2-AGENTS-PAGE-NO-ROLE-GATE` (agents/page.tsx lists all tenant agents to any user with page access -- no role gate; scopeAgentsByRole would apply role gates -- manager sees only managed, agent sees only own -- which would be a behavior change for manager/agent users on the agents management page; deferred to preserve current UX; candidate for follow-up if role-gating the agents page becomes a UX/security requirement). **Finding CLOSED**: `F-W5A-LEADS-LIST-INLINE-SCOPING-NOT-MIGRATED` (carried from W5a) -- leads/page.tsx fully migrated to scope.ts helpers. **W5c GROUP PROGRESS**: W5c-1 SHIPPED (commit c40530c, F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW closed); W5c-2 SHIPPED (commit 8c89c50, F-W5A-LEADS-LIST-INLINE-SCOPING-NOT-MIGRATED closed); W5c-3 OPEN (per-role action gates on the leads list view -- delete/edit/assign-agent visibility + 403 enforcement on API routes); W5c-4 OPEN (F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F helper extraction -- consolidate VIP approve logic between W4f and W4g code paths into a shared util); W5c-5 OPEN (F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE evaluation -- final phase of W5c group; final W5c tracker patch will flip W5c row OPEN -> SHIPPED + bump v19 -> v20 + add status log entries for W5c-3 + W5c-4 + W5c-5). NEXT: **W5c-3** -- per-role action gates on the leads list view (delete/edit/assign-agent visibility in AdminHomesLeadsClient.tsx + 403 enforcement on API routes; uses `can()` permission helpers from `lib/admin-homes/permissions.ts` which already has ActorPermissionContext pre-fetched into AdminHomesUser per R3.2.1 refactor in auth.ts).'

const P1_NEW = P1_ANCHOR + NL + NL + W5C_1_ENTRY + NL + NL + W5C_2_ENTRY

const patches = [
  { name: 'P1 status log append (W5c-1 + W5c-2)', old: P1_ANCHOR, new: P1_NEW },
]

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

// Post-patch assertions
if (text.indexOf('2026-05-15 W5c-1-SHIPPED') === -1) {
  throw new Error('post-patch: W5c-1-SHIPPED marker missing')
}
if (text.indexOf('2026-05-15 W5c-2-SHIPPED') === -1) {
  throw new Error('post-patch: W5c-2-SHIPPED marker missing')
}
if (text.indexOf('Commit `c40530c`') === -1) {
  throw new Error('post-patch: W5c-1 commit hash missing')
}
if (text.indexOf('Commit `8c89c50`') === -1) {
  throw new Error('post-patch: W5c-2 commit hash missing')
}
// Sanity: v19 stays (no version bump)
if (text.indexOf('**Version:** v19') === -1) {
  throw new Error('post-patch: v19 version marker should still be present')
}
if (text.indexOf('**Version:** v20') !== -1) {
  throw new Error('post-patch: v20 version marker should NOT be present (W5c is mid-phase)')
}
// Sanity: W5c row still OPEN
if (text.indexOf('| W5c |') === -1) {
  throw new Error('post-patch: W5c phase row missing entirely (unexpected)')
}

if (LE === 'lf' && text.indexOf('\r\n') !== -1) {
  throw new Error('CRLF introduced into LF tracker')
}

fs.copyFileSync(TRACKER, TRACKER + '.backup_' + stamp)
fs.writeFileSync(TRACKER, text, 'utf8')

// Re-verify LE on disk
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
console.log('W5c progress tracker patch applied successfully.')
console.log('')
console.log('  ~ ' + TRACKER)
console.log('    backup: W-LEADS-WORKBENCH-TRACKER.md.backup_' + stamp)
console.log('  1 patch applied:')
console.log('    P1: status log append -- 2 entries (W5c-1 + W5c-2)')
console.log('')
console.log('Tracker state after this patch:')
console.log('  - **Version:** v19 (unchanged -- W5c is mid-phase)')
console.log('  - W5c phase row: OPEN (unchanged -- flips at W5c-5 close)')
console.log('  - Status log: 2 new entries (W5c-1-SHIPPED + W5c-2-SHIPPED)')
console.log('')
console.log('Next:')
console.log('  git add docs/W-LEADS-WORKBENCH-TRACKER.md \\')
console.log('          scripts/patch-w-leads-workbench-tracker-w5c-progress.js')
console.log('  git commit + push')