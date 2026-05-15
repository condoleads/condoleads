#!/usr/bin/env node
/**
 * patch-w-leads-workbench-tracker-w5b.js
 *
 * docs(W-LEADS-WORKBENCH W5b): tracker status log + phase row update.
 *
 * Three atomic patches against docs/W-LEADS-WORKBENCH-TRACKER.md:
 *   P1: version line v18 -> v19 (W5b SHIPPED; W5 GROUP IN PROGRESS continues;
 *       W5c remaining as the W5 group close-out)
 *   P2: phase table W5b row OPEN -> SHIPPED with commit a83ad9a + details
 *   P3: status log append -- 2026-05-14 W5b-SHIPPED entry after W5a tail
 *       anchored on the unique closing phrase
 *       'Collapse is default-on; toggle preserves user preference via URL param or cookie.'
 *
 * Two new findings logged in the W5b entry:
 *   F-W5B-LOW-CURRENT-FAN-OUT
 *   F-W5B-COLLAPSED-CHECKBOX-PRIMARY-ONLY
 *
 * Tracker LE: LF (verified via W5a patch run on 2026-05-14).
 * Idempotent (skips if v19 marker present).
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

const V19_MARKER = '**Version:** v19 \u2014 W5b SHIPPED'
if (text.indexOf(V19_MARKER) !== -1) {
  console.log('SKIP: v19 marker already present. No-op.')
  process.exit(0)
}

// ----- P1: Version line v18 -> v19 -----
//   P1_OLD is the FULL v18 line written by the W5a tracker patch (commit 8cda518).
const P1_OLD =
  '**Version:** v18 \u2014 W5a SHIPPED \u2014 **W4 GROUP COMPLETE + W5 GROUP IN PROGRESS** \u2014 Tenant switcher in TenantHeader (top bar): new POST `/api/admin-homes/scope/set-tenant` (writes/clears `platform_tenant_override` cookie that getAdminTenantContext already reads since Phase 3.1) + new `TenantSwitcher.tsx` client dropdown + full rewrite of `TenantHeader.tsx` to take `AdminHomesUser` prop and integrate the switcher (replaces the W3.3 "Switcher coming in 3.7" placeholder); per-role authorization (platform_admin/platform_assistant: any tenant or Universal; tenant_manager: only assigned tenants via tenant_manager_assignments; all other roles: 403); cookie attributes httpOnly + sameSite=lax + secure-in-production + 30-day maxAge; F-RESOLVEUSER-AGENTID-MAY-BE-CROSS-TENANT PARTIALLY mitigated (picking specific tenant scopes agents query correctly; Universal-view edge case full fix deferred to W5c); findings `F-W5A-TENANT-MANAGER-PATH-CODED-NOT-SMOKED` (no tenant_manager_assignments rows yet) + `F-W5A-LEADS-LIST-INLINE-SCOPING-NOT-MIGRATED` (deferred to W5c) logged; next: W5b (collapse-by-user_id in leads list)'

const P1_NEW =
  '**Version:** v19 \u2014 W5b SHIPPED \u2014 **W4 GROUP COMPLETE + W5 GROUP IN PROGRESS** \u2014 Leads list view now collapses by user_id when in default view: each identified user appears as one row (the most-recent lead = primary representative) with a "+N earlier" indigo chip in the Contact column. Click the chip -> inline-expands earlier leads directly below the primary with slate-bordered visual treatment (`bg-slate-50/70 border-l-4 border-slate-300`); click again to hide. Global toggle in sort bar ("Show all events" / "Collapse by user") switches between collapsed and flat modes; URL param `?expanded=1` persists state via router.replace (no full reload, no scroll jump). Anonymous leads (user_id IS NULL) always stay per-row regardless of mode. Stats cards (total/new/buyers/sellers/hot leads) + "Showing X of Y leads" filtered indicator + CSV export all count underlying leads not visual rows -- no regressions. Pure client-side render change; data already tenant-scoped in page.tsx (unchanged); no new DB queries or API surface. flatRows useMemo<FlatRow[]> with discriminated union (primary | earlier) groups by user_id, sorts each group by created_at DESC, emits primary + (if expandedUserIds.has) inline-expanded earlier rows. F-RESOLVEUSER-AGENTID-MAY-BE-CROSS-TENANT remains PARTIALLY mitigated (no change from W5a baseline; Universal-view full fix still W5c-scoped); findings `F-W5B-LOW-CURRENT-FAN-OUT` (1 multi-lead user today = -1 visual row of 164; architectural prep for repeat-engagement growth where every Charlie+questionnaire+VIP path generates 2-3 leads per user) + `F-W5B-COLLAPSED-CHECKBOX-PRIMARY-ONLY` (collapsed primary checkbox selects only primary lead; expand inline via "+N earlier" chip to select earlier; bulk-delete semantics preserved -- selectedLeads keyed by lead.id) logged; next: W5c (per-role action gates + scope.ts consumer migration of leads/page.tsx + users/page.tsx + agents/page.tsx + F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW Universal-view edge case fix + F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE evaluation + F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F helper extraction)'

// ----- P2: Phase table W5b row OPEN -> SHIPPED -----
const P2_OLD =
  '| W5b | Collapse-by-user_id in list view | OPEN | \u2014 | Default ON; "+N earlier events" indicator; anonymous leads stay per-row; toggle to expand |'

const P2_NEW =
  '| W5b | Collapse-by-user_id in list view | SHIPPED | 2026-05-14 | `a83ad9a` Default-collapse the leads list so each identified user appears as one row (the most-recent lead = primary representative). Multi-lead users show a "+N earlier" indigo chip in the Contact column that, on click, inline-expands the earlier leads directly below the primary with `bg-slate-50/70 + border-l-4 border-slate-300` visual treatment. Global toggle in sort bar ("Show all events" / "Collapse by user") switches between collapsed and flat modes; URL param `?expanded=1` persists state via router.replace (no full reload, no scroll jump). Anonymous leads (user_id IS NULL) always stay per-row regardless of mode. **Files (4)**: 2 modified (`app/admin-homes/leads/page.tsx` adds searchParams param + initialExpanded prop in both render branches; `components/admin-homes/AdminHomesLeadsClient.tsx` adds Fragment import + initialExpanded prop + expanded/expandedUserIds state + toggleExpanded/toggleUserIdExpand helpers + flatRows useMemo<FlatRow[]> with discriminated union + toggle button + tbody render rewire + isEarlier visual treatment + "+N earlier" chip with e.stopPropagation + !isEarlier guards on activity preview and plan data rows) + 2 new scripts (`patch-w-leads-workbench-w5b-collapse-by-user.js` 14-anchor LE-normalized patch script with idempotent skip on `const flatRows = useMemo` marker; `verify-w5b-static.js` 40-check read-only static verifier). **Multi-tenant safety**: pure client-side render change; data already tenant-scoped in page.tsx (unchanged); flatRows operates on already-filtered, already-tenant-scoped leads; no new DB queries, no new API surface, no hardcoded tenant_id literals. Code path identical for any tenant. **No regressions**: 8 explicit assertions in verifier all PASS (exportToCSV / stats useMemo counts over leads not flatRows / deleteLead / updateLeadStatus / select-all covers all filtered leads / row onClick navigates / row onClick guards intact / stats.total = leads.length). **Visual smoke 2026-05-14**: (1) default collapse at /admin-homes/leads with WALLiam selected via switcher -- "+1 earlier" chip on af5222e4 user (T3c smoke pair) verified; (2) chip click expands earlier row inline with slate visual + flips to "Hide earlier"; (3) toggle "Show all events" writes ?expanded=1 to URL via router.replace, both leads render flat with no chip; (4) toggle "Collapse by user" clears URL and re-collapses; (5) page reload with ?expanded=1 manually in URL honors initialExpanded; (6) stats cards (164/162/78/3/141) unchanged across all 4 mode transitions; (7) "Showing 2 of 164 leads" filtered indicator stable in both modes (reflects filteredLeads not visual rows). **TSC clean. 40/40 verifier PASS.** Findings: `F-W5B-LOW-CURRENT-FAN-OUT`, `F-W5B-COLLAPSED-CHECKBOX-PRIMARY-ONLY`. F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW unchanged from W5a (still PARTIALLY MITIGATED; Universal-view fix W5c-scoped). |'

// ----- P3: Status log append -----
const P3_ANCHOR = 'Collapse is default-on; toggle preserves user preference via URL param or cookie.'

const W5B_ENTRY_LINES = [
  '- **2026-05-14 W5b-SHIPPED** -- Collapse leads list by user_id in list view (default ON). Commit `a83ad9a` (8cda518..a83ad9a). **4 files**: 2 modified (`app/admin-homes/leads/page.tsx` + `components/admin-homes/AdminHomesLeadsClient.tsx`) + 2 new scripts (`scripts/patch-w-leads-workbench-w5b-collapse-by-user.js` 14-anchor LE-normalized patch script with idempotent skip on `const flatRows = useMemo` marker; `scripts/verify-w5b-static.js` 40-check read-only static verifier covering imports/props/state/helpers/useMemo/render-structure/toggle-button/+N-badge/!isEarlier-guards/8-explicit-no-regression-assertions/LE-preservation/backups-present, exits 1 on any FAIL). **No schema migration**. **No new DB queries or API surface**. **Implementation details**: (1) page.tsx accepts `searchParams: { expanded?: string }`, computes `initialExpanded = searchParams?.expanded === \'1\'`, passes the bool prop to AdminHomesLeadsClient in BOTH render branches (no-tenant early return + main return); (2) client.tsx adds `Fragment` to react imports (needed for keyed row fragments), `initialExpanded: boolean` to Props, destructures it in fn signature; (3) new state: `expanded` initialized from `initialExpanded` prop, `expandedUserIds: Set<string>` for per-user inline-expand tracking; (4) `toggleExpanded` helper computes next state, writes `?expanded=1`/delete via URLSearchParams + `router.replace` with `{ scroll: false }` (no full reload, no scroll jump); (5) `toggleUserIdExpand(userId)` mutates the Set via setExpandedUserIds(prev => new Set(prev) with conditional add/delete) -- immutable update pattern so React detects state change; (6) `flatRows useMemo<FlatRow[]>` with discriminated union `{ kind: \'primary\'; lead; earlierCount; groupUserId } | { kind: \'earlier\'; lead; groupUserId }`: in expanded mode returns 1:1 map of filteredLeads to primary rows (earlierCount=0); in collapsed mode walks filteredLeads preserving sort order from existing sortBy/sortOrder, routes anonymous leads to per-row primary entries immediately, accumulates identified leads into per-user_id groups using a Map<string, Lead[]>, then second-pass walks the recorded primary positions and for each group with size > 1 sorts internally by `created_at DESC` and emits {primary: most-recent, earlierCount: N-1} + (if `expandedUserIds.has(userId)`) the earlier rows inline as `{kind: \'earlier\'}` entries; (7) toggle button in sort bar with labels `Show all events` (collapsed mode -> click expands) / `Collapse by user` (expanded mode -> click collapses) + native title attr; (8) tbody render: `flatRows.length === 0 ? <no-leads-found-tr> : flatRows.map(row => { const lead = row.lead; const isEarlier = row.kind === \'earlier\'; const earlierCount = row.kind === \'primary\' ? row.earlierCount : 0; const groupUserId = row.groupUserId; const rowKey = isEarlier ? lead.id + \'-earlier\' : lead.id; return <Fragment key={rowKey}>...</Fragment> })`; (9) primary `<tr>` className conditionally appends `isEarlier ? \'bg-slate-50/70 border-l-4 border-slate-300\' : \'\'` for inline-expanded earlier rows; (10) `+N earlier` chip is a `<button>` in the Contact column inside the existing `flex items-center gap-2` div, after the engagement IIFE, with `e.stopPropagation()` in onClick to prevent row-click navigation bubbling (defense-in-depth: parent `<tr>` onClick already guards via `closest(\'button, input, select, a, label\')`); chip text flips between `+${earlierCount} earlier` and `Hide earlier` based on `expandedUserIds.has(groupUserId)`; chip only renders when `!isEarlier && earlierCount > 0 && groupUserId !== null`; (11) activity preview row (the L4 "Recent activity" tr) and plan data row (`expandedLead === lead.id && lead.plan_data`) both gated on `!isEarlier` so inline-expanded earlier rows render minimally (just the basic <tr>) -- keeps visual hierarchy clear: primary rows get full treatment with activity/plan panels, earlier rows get only the slate visual cue + minimal columns. **Anchor patch strategy**: 14 anchors (3 page.tsx + 11 client.tsx) with LE-normalization helper `withLE(s, LE)` that converts authored `\\n` to `\\r\\n` for CRLF files (page.tsx is CRLF, client.tsx is LF -- detected per file via byte scan; mixed-LE throws). Anchors are multi-line strings built via explicit `\\n` joins for authoring clarity. Each anchor checked for unique match (count == 1) before any replacement; failed uniqueness throws before any write so partial patches are impossible. Post-patch positive assertions verify: Fragment import present, initialExpanded type present, flatRows useMemo present, toggleExpanded helper present, toggleUserIdExpand helper present, flatRows.length empty-state present, flatRows.map call present, Fragment wrap present, both toggle button labels present. Backup + write + LE-reverify-on-disk after assertions pass. **Smoke matrix passed end-to-end**: (1) initial load at /admin-homes/leads with WALLiam selected via tenant switcher (W5a) -- default collapse rendered; "Showing 2 of 164 leads" indicator stable after filtering by `t3c1778499505411-tier7@t3c-smoke.local`; visible primary row showed indigo "+1 earlier" chip next to the engagement chip; (2) chip click -- earlier lead row appeared directly below the primary with slate-50/70 background + slate-300 left border; chip text flipped to "Hide earlier"; second click hid the earlier row again; row click on either primary or earlier row navigated to `/admin-homes/leads/<id>` drawer correctly (W4 drawer functionality untouched); (3) "Show all events" toggle button click -- URL gained `?expanded=1` via router.replace (no full reload, scroll position preserved), button label flipped to "Collapse by user", both leads rendered as separate primary rows with no chip on either; (4) "Collapse by user" toggle click -- URL `?expanded=1` cleared, button label flipped back to "Show all events", collapsed view restored; (5) page reload with `?expanded=1` manually in URL -- expanded mode honored from initialExpanded prop (no flash-of-collapsed-on-load because the bool is computed server-side in page.tsx and passed as initial state); (6) stats cards (Total 164 / New 162 / Buyers 78 / Sellers 3 / Hot Leads 141) unchanged across all 4 mode transitions -- counts over `leads.length` not `flatRows.length` per stats useMemo declaration (no-regression assertion #8 explicitly verifies `total: leads.length` in patched code); (7) "Showing X of Y leads" filtered indicator showed 2/164 in both modes (correct because it reflects `filteredLeads.length` which is unchanged by collapse, not visual row count); (8) CSV export from collapsed view returned all matching leads (mapped from `filteredLeads`, not `flatRows`) -- no-regression assertion #1 verifies `const rows = filteredLeads.map(l => [` intact. **Multi-tenant safety verified**: pure client-side render change; data already tenant-scoped in page.tsx (unchanged code path); flatRows operates only on the already-filtered already-tenant-scoped leads array; no new DB queries, no new API surface, no hardcoded tenant_id literals anywhere in the new code. Code path identical for any tenant -- works the same for WALLiam, future tenant #2, future tenant #50. **NEW finding F-W5B-LOW-CURRENT-FAN-OUT**: per pre-patch DB recon (164 WALLiam leads total: 42 anonymous + 122 identified across 121 unique users), only 1 user (af5222e4-adbc-4d63-a2fe-731337e12d0d) has multi-lead state today (T3c smoke pair: walliam_estimator_questionnaire lead `e3ee295b-cd45-416c-bb07-9c0a82869e71` at 2026-05-11 11:38:50 UTC + walliam_estimator_vip_request lead `5396fa2f-982e-4c1b-a70b-4099d668d602` at 2026-05-11 11:38:48 UTC, 2 seconds apart, same contact email). Collapse impact on current dataset: -1 visual row of 164. Architectural prep for repeat-engagement growth -- every Charlie chat + questionnaire + VIP-request user-journey naturally generates 2-3 leads per user; collapse becomes high-value as repeat engagement accumulates over months/quarters. Smoke depends on the af5222e4 user being in the visible/filtered set (mitigated during smoke by direct search for the t3c-smoke.local email). **NEW finding F-W5B-COLLAPSED-CHECKBOX-PRIMARY-ONLY**: in collapsed mode, the primary row\'s checkbox represents only the primary (most-recent) lead -- not the entire group of leads for that user. To select earlier leads in a collapsed group, the user must first expand the group inline via the "+N earlier" chip, then individually check the earlier rows. Bulk-delete semantics preserved (selectedLeads is keyed by lead.id, not user_id). Header "select all filtered" checkbox covers all 164 leads (uses `filteredLeads.map(l => l.id)` -- no-regression assertion #5 verifies this is unchanged). Acceptable initial UX; per-group select-all (one checkbox represents the whole group) is a candidate for W5c if user feedback requests it. **F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW UPDATE (carried over from W4g + W5a)**: W5b does NOT change the state of this finding. Status remains PARTIALLY MITIGATED from W5a (tenant-scoped agents query after switcher set so user.agentId is tenant-correct in single-tenant view). The remaining Universal-view edge case (no cookie + no host-resolved tenant + no home tenant; resolveAdminHomesUser still computes agentId without tenant scoping) is unchanged and still deferred to W5c per the W5c fix-spec: `if (!effectiveTenantId && isPlatformAdmin) { agentId = null }`. **No regressions ship audit**: 8 explicit no-regression assertions in verify-w5b-static.js all PASS -- (1) exportToCSV row build intact (`const rows = filteredLeads.map(l => [`), (2) stats useMemo intact (`const stats = useMemo(() => ({`), (3) deleteLead handler intact, (4) updateLeadStatus handler intact, (5) select-all checkbox uses filteredLeads.map(l => l.id) (covers all filtered leads regardless of collapse state), (6) row onClick still navigates to drawer (`router.push(\'/admin-homes/leads/\' + lead.id)`), (7) row onClick still guards against button/input/select/a/label clicks (`if (t.closest(\'button, input, select, a, label\')) return`), (8) stats counts unchanged (`total: leads.length` in stats useMemo, never `flatRows.length`). **W5 GROUP PROGRESS**: W5a SHIPPED (tenant switcher in TenantHeader top bar, commit a58dda0); W5b SHIPPED (collapse-by-user_id in list view, commit a83ad9a); W5c OPEN (final phase of W5 group -- per-role action gates everywhere + scope.ts consumer migration of leads/page.tsx + users/page.tsx + agents/page.tsx + F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW Universal-view edge case fix + F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE evaluation + F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F helper extraction). NEXT: **W5c** -- per-role action gates on the leads list view (delete/edit/assign-agent gated by user role + scope helpers) + scope.ts consumer migration across the 3 admin pages (leads/page.tsx + users/page.tsx + agents/page.tsx replacing inline seeAll/scopedTenantId patterns with scopeLeadsQuery/scopeAgentsByRole helpers) + Universal-view edge case fix in resolveAdminHomesUser (set agentId=null when in Universal cross-tenant view to close F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW carried over since W4g) + evaluation of F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE (whether per-agent scoping should apply to lead families anchor gate or only to leads themselves) + helper extraction for F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F (consolidate VIP approve logic between W4f and W4g code paths into a shared util to eliminate the duplicate-logic finding).',
]

const P3_NEW = P3_ANCHOR + NL + NL + W5B_ENTRY_LINES.join(NL)

const patches = [
  { name: 'P1 version line', old: P1_OLD, new: P1_NEW },
  { name: 'P2 W5b phase row', old: P2_OLD, new: P2_NEW },
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

if (text.indexOf(V19_MARKER) === -1) {
  throw new Error('post-patch: v19 marker missing')
}
if (
  text.indexOf(
    '| W5b | Collapse-by-user_id in list view | SHIPPED | 2026-05-14 |',
  ) === -1
) {
  throw new Error('post-patch: W5b SHIPPED phase row missing')
}
if (text.indexOf('2026-05-14 W5b-SHIPPED') === -1) {
  throw new Error('post-patch: W5b-SHIPPED status log entry missing')
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
console.log('W5b tracker patch applied successfully.')
console.log('')
console.log('  ~ ' + TRACKER)
console.log('    backup: W-LEADS-WORKBENCH-TRACKER.md.backup_' + stamp)
console.log('  3 patches applied:')
console.log('    P1: version line v18 -> v19 (W5 GROUP IN PROGRESS continues)')
console.log('    P2: phase table W5b row OPEN -> SHIPPED (a83ad9a)')
console.log('    P3: status log W5b-SHIPPED entry appended (2 findings)')
console.log('')
console.log('Next:')
console.log('  git add docs/W-LEADS-WORKBENCH-TRACKER.md \\')
console.log('          scripts/patch-w-leads-workbench-tracker-w5b.js')
console.log('  git commit -F <message file>')
console.log('  git push origin main')