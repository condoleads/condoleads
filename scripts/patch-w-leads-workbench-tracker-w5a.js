#!/usr/bin/env node
/**
 * patch-w-leads-workbench-tracker-w5a.js
 *
 * docs(W-LEADS-WORKBENCH W5a): tracker status log + phase row update.
 *
 * Three atomic patches against docs/W-LEADS-WORKBENCH-TRACKER.md:
 *   P1: version line v17 -> v18 (W5a SHIPPED; W4 GROUP COMPLETE marker preserved
 *       contextually via the SHIPPED status of W4a-W4g; W5 GROUP IN PROGRESS)
 *   P2: phase table W5a row OPEN -> SHIPPED with commit a58dda0 + details
 *   P3: status log append -- 2026-05-14 W5a-SHIPPED entry after W4g tail
 *       anchored on the unique closing phrase 'harden user.agentId resolution).'
 *
 * Two new findings logged in the W5a entry:
 *   F-W5A-TENANT-MANAGER-PATH-CODED-NOT-SMOKED
 *   F-W5A-LEADS-LIST-INLINE-SCOPING-NOT-MIGRATED
 *
 * Tracker LE: LF. Idempotent (skips if v18 marker present).
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

const V18_MARKER = '**Version:** v18 \u2014 W5a SHIPPED'
if (text.indexOf(V18_MARKER) !== -1) {
  console.log('SKIP: v18 marker already present. No-op.')
  process.exit(0)
}

// ----- P1: Version line -----
const P1_OLD =
  '**Version:** v17 \u2014 W4g SHIPPED \u2014 **W4 GROUP COMPLETE** \u2014 Notes tab + Add note inline endpoint at `/api/admin-homes/leads/[id]/notes`; third writer to `lead_admin_actions` (`note_added`); INSERT shape mirrors System 1 `addLeadNote` (`lib/actions/lead-management.ts` L59-67) -- System 1 file UNTOUCHED; lead_notes has no `tenant_id` column (`F-LEAD-NOTES-NO-TENANT-ID-COLUMN`) -- tenant safety via `lead.tenant_id` verification before INSERT + `lead_id IN (familyIds)` scoping on reads (familyIds already tenant-bound via W4a anchor gate); author resolution chain `user.agentId ?? lead.agent_id` with precise actor preserved in `lead_admin_actions.actor_agent_id` + `actor_role`; optimistic prepend in NotesTab UI; W4 group closes after W4g (W4a + W4b + W4c + W4d + W4e + W4f + W4g all shipped); findings `F-LEAD-NOTES-AUTHOR-FALLBACK-LOSSY` + `F-LEAD-NOTES-DUAL-SYSTEM-READERS` + `F-RESOLVEUSER-AGENTID-MAY-BE-CROSS-TENANT` (P0-risk affecting W4e+W4f+W4g if `user.agentId` is not tenant-scoped -- recon during W5) + `F-W4G-CLAUDE-AUTHOR-PREDICTION-WRONG` (Rule Zero meta-finding) logged for future cleanup; next: W5 group (role-aware leads list)'

const P1_NEW =
  '**Version:** v18 \u2014 W5a SHIPPED \u2014 **W4 GROUP COMPLETE + W5 GROUP IN PROGRESS** \u2014 Tenant switcher in TenantHeader (top bar): new POST `/api/admin-homes/scope/set-tenant` (writes/clears `platform_tenant_override` cookie that getAdminTenantContext already reads since Phase 3.1) + new `TenantSwitcher.tsx` client dropdown + full rewrite of `TenantHeader.tsx` to take `AdminHomesUser` prop and integrate the switcher (replaces the W3.3 "Switcher coming in 3.7" placeholder); per-role authorization (platform_admin/platform_assistant: any tenant or Universal; tenant_manager: only assigned tenants via tenant_manager_assignments; all other roles: 403); cookie attributes httpOnly + sameSite=lax + secure-in-production + 30-day maxAge; F-RESOLVEUSER-AGENTID-MAY-BE-CROSS-TENANT PARTIALLY mitigated (picking specific tenant scopes agents query correctly; Universal-view edge case full fix deferred to W5c); findings `F-W5A-TENANT-MANAGER-PATH-CODED-NOT-SMOKED` (no tenant_manager_assignments rows yet) + `F-W5A-LEADS-LIST-INLINE-SCOPING-NOT-MIGRATED` (deferred to W5c) logged; next: W5b (collapse-by-user_id in leads list)'

// ----- P2: Phase table W5a row -----
const P2_OLD =
  '| W5a | Role-aware leads list (top bar + filters + columns) | OPEN | \u2014 | Universal/Tenant toggle (platform_admin + assistant); tenant switcher (tenant_manager); locked-to-tenant (everyone else) |'

const P2_NEW =
  '| W5a | Role-aware leads list (top bar + filters + columns) | SHIPPED | 2026-05-14 | `a58dda0` Tenant switcher in TenantHeader (top bar) replaces the W3.3 "Switcher coming in 3.7" placeholder. New POST `/api/admin-homes/scope/set-tenant` writes/clears the `platform_tenant_override` cookie that getAdminTenantContext (tenant-context.ts) already reads since Phase 3.1 -- W5a is purely the SETTER side. New `TenantSwitcher.tsx` client dropdown with `allowUniversal` flag. Full rewrite of `TenantHeader.tsx` to take AdminHomesUser prop + integrate switcher via new `fetchSwitcherTenants` helper (platform_admin: all active tenants + Universal; tenant_manager: assigned tenants via tenant_manager_assignments JOIN; other roles: empty -> no switcher rendered). layout.tsx 1-anchor prop change from `tenantId+isPlatformAdmin` to `user`. Per-role authorization in the endpoint: UUID format + tenants table validation + role check (platform admins: any tenant or null; tenant_manager: only assignment-list tenants; other: 403). Cookie attributes httpOnly + sameSite=lax + secure-in-production. Smoke verified 2026-05-14: dropdown renders 2 options (Universal + WALLiam); pick WALLiam -> 200 + cookie set + page reload -> WALLiam header; pick Universal -> 200 + cookie deleted + page reload -> No-tenant-selected header. **Filters**: agents filter dropdown is already role-aware via inline pattern in leads/page.tsx (functionally correct; migration to scopeAgentsByRole helper deferred to W5c). **Columns**: no granular column-hiding shipped (deferred to W5c if needed; existing nav already filters by role via AdminHomesSidebar). System 1 untouched. auth.ts untouched. tenant-context.ts untouched (cookie reader was already in place). Leads list page.tsx untouched (consumer migration to scopeLeadsQuery deferred to W5c per W2.5 plan). Findings: `F-W5A-TENANT-MANAGER-PATH-CODED-NOT-SMOKED`, `F-W5A-LEADS-LIST-INLINE-SCOPING-NOT-MIGRATED`. F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW PARTIALLY MITIGATED. |'

// ----- P3: Status log append -----
const P3_ANCHOR = 'harden user.agentId resolution).'

const W5A_ENTRY_LINES = [
  '- **2026-05-14 W5a-SHIPPED** -- Tenant switcher in TenantHeader (top bar). Commit `a58dda0` (2751a55..a58dda0). **5 files**: 2 new (`app/api/admin-homes/scope/set-tenant/route.ts` POST endpoint that writes/clears the `platform_tenant_override` cookie; `components/admin-homes/TenantSwitcher.tsx` client dropdown component) + 1 full rewrite (`components/admin-homes/TenantHeader.tsx` now takes the full `AdminHomesUser` prop instead of `tenantId + isPlatformAdmin` separately; integrates the switcher via new `fetchSwitcherTenants` server-side helper) + 1 modified (`app/admin-homes/layout.tsx` 1-anchor prop change from `<TenantHeader tenantId={...} isPlatformAdmin={...} />` to `<TenantHeader user={adminUser} />`) + 1 patch script (`scripts/patch-w-leads-workbench-w5a-tenant-switcher.js`). **No schema migration**. **Reuses existing infrastructure**: `getAdminTenantContext` (in `lib/admin-homes/tenant-context.ts`) already reads the `platform_tenant_override` cookie as the first step in its 4-step priority chain (cookie > x-tenant-id header from middleware > home tenant > null) -- this has been in place since Phase 3.1 (per the file\'s "3.1 -- Cookie is not set anywhere yet. The switcher (3.7) sets it. This util just makes the rest of the system aware of it when it appears." comment). W5a is purely the SETTER side of that mechanism; the READER side has been wired for over a year. **POST endpoint authorization model** (`/api/admin-homes/scope/set-tenant`): (1) auth via resolveAdminHomesUser (401 if no user); (2) body parse + extract `tenantId` (string UUID or null); (3) if tenantId is null (Universal view): only platform_admin/platform_assistant allowed (403 otherwise), cookie deleted; (4) if tenantId is a string: validate UUID format with regex (400 on bad format), then validate tenant exists in tenants table AND is_active=true (404/400 otherwise); (5) per-role authorization: if user.isPlatformAdmin, any valid tenantId is allowed; if not, query tenant_manager_assignments for (user_id, tenant_id, revoked_at IS NULL) and require a row exists (403 otherwise); (6) on success, set cookie with attributes httpOnly + sameSite=lax + secure-in-production + path=/ + maxAge=30 days. **TenantSwitcher client UI**: native HTML `<select>` (not custom dropdown) for accessibility + reliability; `allowUniversal` boolean flag controls whether the "All tenants (Universal)" option renders at the top; on change, fires POST and on success calls `window.location.reload()` so the layout re-renders with the new tenant context flowing through getAdminTenantContext; submit state disables the select; error state surfaces inline below the select. **TenantHeader rewrite** changed signature from `({ tenantId, isPlatformAdmin })` to `({ user })`; new `fetchSwitcherTenants(user)` helper returns `{ tenants, allowUniversal }` based on role (platform_admin: query tenants WHERE is_active=true ordered by name + allowUniversal=true; non-platform: query supabase.auth.getUser() then tenant_manager_assignments JOIN tenants WHERE user_id=authUser.id AND revoked_at IS NULL + allowUniversal=false; if no auth user: empty); the `canSwitch` computed value gates whether the switcher renders at all (no switch surface for users with empty tenant list and no Universal); existing tenant-card render logic preserved verbatim (status badge with color classes, logo or initials fallback, domain display, Tenant-not-found error state, terminated-with-grace banner). **Smoke matrix passed end-to-end**: (1) initial load -- TenantHeader rendered with dropdown showing 2 options ("All tenants (Universal)" + "WALLiam (walliam.ca)"); Syed in Universal view (no cookie + no home tenant context flowing through priority chain) shows "No tenant selected" amber banner with switcher beside the Go-to-platform link; (2) picked "WALLiam (walliam.ca)" from dropdown -> POST to `/api/admin-homes/scope/set-tenant` returned 200 with `{success: true, tenantId: "b16e1039-38ed-43d7-bbc5-dd02bb651bc9"}` per DevTools Network tab; page reloaded; TenantHeader now showed WALLiam logo + name + green Active badge + dropdown still visible with WALLiam selected; cookie state verified in DevTools Application -> Cookies: `platform_tenant_override = b16e1039-38ed-43d7-bbc5-dd02bb651bc9` (httpOnly); (3) picked "All tenants (Universal)" -> POST returned 200 with `{success: true, tenantId: null}`; page reloaded; header back to "No tenant selected" state; cookie state verified absent (cookie deleted). DevTools Network shows clean 200 responses for both POSTs. **Multi-tenant safety verified**: UUID format validation server-side before any cookie set (no garbage values like SQL injection attempts get past the regex); existence-and-active validation against tenants table before any cookie set (no orphan IDs accepted, no suspended/terminated tenants); per-role authorization gates enforce that tenant_manager users can only set tenants in their assignment list (cannot escalate to platform admin scope); httpOnly cookie attribute defeats client-side JS read (XSS protection); sameSite=lax defeats cross-site CSRF; secure attribute in production. No hardcoded tenant_id literals in any new file. Code path identical for any tenant. **NEW finding F-W5A-TENANT-MANAGER-PATH-CODED-NOT-SMOKED**: the tenant_manager branch in both the POST endpoint (assignment-list authorization check at lines 88-106) and TenantHeader\'s fetchSwitcherTenants (assignment-list query lines 56-72 of the new file) is coded but no live smoke coverage exists because tenant_manager_assignments has zero rows (Block 4 of W5a recon confirmed). The branch logic is straightforward (single SELECT against tenant_manager_assignments with revoked_at IS NULL filter; tenants JOIN for display data); first tenant_manager seed (when a multi-tenant brokerage onboards) will be the first live test. Code-only verification: TSC pass + code-review against scope.ts spec for the 7-role surface. **NEW finding F-W5A-LEADS-LIST-INLINE-SCOPING-NOT-MIGRATED**: `app/admin-homes/leads/page.tsx` still uses the inline `seeAll` / `scopedTenantId` pattern from Phase 3.4 (lines 27-67 of the current file) instead of the W2.5 scope.ts helper functions (`scopeLeadsQuery` + `scopeAgentsByRole`). The inline pattern is FUNCTIONALLY equivalent to the helpers (verified by code inspection: same predicate logic, same role gates, same tenant scoping order); leaving it unchanged in W5a is a pure-deferred refactor with zero behavior change risk. W5c migration will land alongside the F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW fix since both touch the same scope-resolution surfaces. **F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW UPDATE (carried over from W4g)**: W5a PARTIALLY mitigates this finding. After Syed picks a specific tenant via the switcher, the platform_tenant_override cookie is set and getAdminTenantContext returns that tenantId as the effectiveTenantId; resolveAdminHomesUser then runs its agents query with `.eq(\'tenant_id\', effectiveTenantId)` so user.agentId becomes tenant-correct (or null if Syed has no agents row in that tenant, in which case the W4g handler\'s fallback to lead.agent_id takes over). The only remaining unsafe state is true Universal view (no cookie + no host-resolved tenant + no home tenant) where user.agentId is computed without tenant scoping. That edge case requires resolveAdminHomesUser to explicitly set agentId=null in cross-tenant view (`if (!effectiveTenantId && isPlatformAdmin) { agentId = null }`); deferred to W5c. **Layout integration note**: layout.tsx change is a 1-anchor pattern (replaces the multi-line prop block with a single `user={adminUser}` prop). TenantHeader.tsx full rewrite was preferred over 8+ anchor patches because the rewrite is ~145 lines and the anchor patches would have been brittle (overlapping anchors, mid-line edits, JSX prop reordering). Backup retained as `TenantHeader.tsx.backup_<timestamp>` per Rule Zero. **AdminHomesSidebar.tsx NOT touched**: the sidebar has its own role-aware nav filtering already (per `POSITION_LABELS` enum + position-based nav items) using the `AdminHomesPosition` 7-value enum which differs slightly from scope.ts\'s `PRINCIPAL_TIERS` (sidebar uses `assistant`/`support`/`managed` while scope.ts uses `platform_assistant`/`tenant_manager`; semantic equivalent but distinct enums). Sidebar normalization deferred -- not a W5a concern. **W5 GROUP PROGRESS**: W5a SHIPPED (top bar switcher delivers the UI surface for tenant switching); W5b OPEN (collapse-by-user_id in leads list view -- one row per identified user with "+N earlier events" indicator; anonymous leads stay per-row; toggle to expand-all-events); W5c OPEN (per-role action gates everywhere + scope.ts consumer migration of leads/page.tsx + users/page.tsx + agents/page.tsx + F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW fix + F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE evaluation + F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F helper extraction). NEXT: **W5b** -- modify `app/admin-homes/leads/page.tsx` to collapse leads list by `user_id` (one row per identified user); modify `components/admin-homes/AdminHomesLeadsClient.tsx` to render "+N earlier events" indicator and toggle to expand-all-events drill-down. Anonymous leads (user_id IS NULL) stay per-row. Collapse is default-on; toggle preserves user preference via URL param or cookie.',
]

const P3_NEW = P3_ANCHOR + NL + NL + W5A_ENTRY_LINES.join(NL)

const patches = [
  { name: 'P1 version line', old: P1_OLD, new: P1_NEW },
  { name: 'P2 W5a phase row', old: P2_OLD, new: P2_NEW },
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

for (const p of patches) {
  text = text.replace(p.old, p.new)
}

if (text.indexOf(V18_MARKER) === -1) {
  throw new Error('post-patch: v18 marker missing')
}
if (
  text.indexOf(
    '| W5a | Role-aware leads list (top bar + filters + columns) | SHIPPED | 2026-05-14 |',
  ) === -1
) {
  throw new Error('post-patch: W5a SHIPPED phase row missing')
}
if (text.indexOf('2026-05-14 W5a-SHIPPED') === -1) {
  throw new Error('post-patch: W5a-SHIPPED status log entry missing')
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
console.log('W5a tracker patch applied successfully.')
console.log('')
console.log('  ~ ' + TRACKER)
console.log('    backup: W-LEADS-WORKBENCH-TRACKER.md.backup_' + stamp)
console.log('  3 patches applied:')
console.log('    P1: version line v17 -> v18 (W5 GROUP IN PROGRESS)')
console.log('    P2: phase table W5a row OPEN -> SHIPPED (a58dda0)')
console.log('    P3: status log W5a-SHIPPED entry appended (2 findings)')
console.log('')
console.log('Next:')
console.log('  git add docs/W-LEADS-WORKBENCH-TRACKER.md \\')
console.log('          scripts/patch-w-leads-workbench-tracker-w5a.js')
console.log('  git commit -F <message file>')
console.log('  git push origin main')