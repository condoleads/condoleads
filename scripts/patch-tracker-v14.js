// scripts/patch-tracker-v14.js
//
// W-TERRITORY-TRACKER patch: v13 -> v14.
//
// Captures:
//   - T4a-2 CLOSED 2026-05-08 (commit d8ef4c5) -- /admin-homes/territory page +
//     coverage + audit-log API routes; per-tenant scoping; coverage table +
//     audit log viewer + 5-card stats.
//   - T4a-3 CLOSED 2026-05-08 -- F-APA-DELETE-INSERT-CHURN comprehensive fix:
//     apa + tpa server-side diff via computeApaDiff (lib/admin-homes/apa-diff.ts);
//     auto-reassign for primary claims preserved (T4a-1); inactive rows now
//     preserved on save (no longer nuked). Smoke 9/9 PASS.
//   - T4a-3b CLOSED 2026-05-08 -- F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP
//     fix: case 'neighbourhood' added to resolveAgentAccess switch with parent
//     propagation matching existing 'community' shape. Both V1 + V2 homepage
//     consumers covered.
//   - F-APA-DELETE-INSERT-CHURN CLOSED.
//   - F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP CLOSED.
//   - T4c phase opened with multi-tenant comprehensive scope locked:
//       * T4c-1: bulk-assign API route with per-agent permission gating + atomic
//         transaction + smoke.
//       * T4c-2: matrix component + page + cell editor + conflict UX (desktop).
//       * T4c-3: mobile responsive + a11y + inheritance preview + bulk row actions.
//     Locked: full recursive managed-agent subtree (per W-HIERARCHY walker, NOT
//     depth-limited); all 4 scopes (area/muni/community/neighbourhood); all access
//     flags (condo/homes/buildings + buildings_mode); per-cell primary toggle;
//     row-level conflict UX; cross-tenant + out-of-subtree write attempts -> 403.
//
// Patches applied:
//   P1. Status line tail: T4a-2/3/3b marked CLOSED, T4c open
//   P2. Insert v14 status log entry above v13
//   P3. Next Action -- replace T4a-2/3/3b sub-phase blocks with CLOSED summaries,
//       expand T4c into T4c-1/2/3 sub-phases with locked scope
//   P4. Findings append: F-APA-DELETE-INSERT-CHURN (CLOSED) +
//       F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP (CLOSED)
//   P5. Workflow rules append: per-row-diff-via-computeApaDiff pattern
//
// Pre-flight: requires v13 marker present, v14 marker absent.
// Idempotent: skips if V14_MARKER already present.
// Atomic: all patches in memory, file written once at end on full success.

const fs = require('fs');
const path = require('path');

const TRACKER = path.join('docs', 'W-TERRITORY-TRACKER.md');

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(TRACKER)) {
  fail(TRACKER + ' not found at ' + path.resolve(TRACKER));
}

const original = fs.readFileSync(TRACKER, 'utf8');

const V13_MARKER = '- **2026-05-08 v13**';
const V14_MARKER = '- **2026-05-08 v14**';

if (original.indexOf(V14_MARKER) !== -1) {
  console.log('SKIP: V14_MARKER already present in tracker. No-op.');
  process.exit(0);
}

if (original.indexOf(V13_MARKER) === -1) {
  fail('v13 state not detected. Expected V13_MARKER (' + V13_MARKER + ') to be present. Run scripts/patch-tracker-v13.js first.');
}

const now = new Date();
const pad = function (n) { return String(n).padStart(2, '0'); };
const stamp =
  now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' +
  pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
const backupPath = TRACKER + '.backup_' + stamp;
fs.writeFileSync(backupPath, original);
console.log('Backup: ' + backupPath + ' (' + original.length + ' chars)');

const NL = '\r\n';

// ===========================================================================
// P1 -- Status line tail
// ===========================================================================

const P1_OLD =
  "**Next:** T4a-1 \u2705 CLOSED v13 (handle_apa_update audits primary_set/unset + access_toggle_changed; UI toggle + auto-reassign route logic; smoke 9/9 PASS). T4a-2 `/admin-homes/territory` coverage page, T4a-3 server-side diff fix for F-APA-DELETE-INSERT-CHURN, T4a-3b gated F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix (gate = caller probe at start of T4a-3 coding), then T4c, T4b, T7.";

const P1_NEW =
  "**Next:** T4a-1 \u2705 + T4a-2 \u2705 + T4a-3 \u2705 + T4a-3b \u2705 all CLOSED v14 (full T4a phase done; coverage page + apa+tpa diff + resolver neighbourhood case all shipped + smoked). T4c phase opened with multi-tenant comprehensive scope: T4c-1 bulk-assign API route with per-agent permission gating + atomic transaction + smoke; T4c-2 matrix component + page + cell editor + conflict UX (desktop); T4c-3 mobile responsive + a11y + inheritance preview + bulk row actions. Then T4b, T7.";

// ===========================================================================
// P2 -- Insert v14 entry above v13
// ===========================================================================

const P2_ANCHOR = "- **2026-05-08 v13** \u2014 **F-APA-PRIMARY-AUDIT-GAP CLOSED + T4a-1 CLOSED + smoke pattern established.**";

const V14_ENTRY_LINES = [
  "- **2026-05-08 v14** \u2014 **T4a-2 CLOSED + T4a-3 CLOSED + T4a-3b CLOSED + T4c phase opened with multi-tenant comprehensive scope.** Three closures in one working block; full T4a sub-phase set complete. Per Rule Zero (multi-tenant at scale + comprehensive), T4c scope explicitly locked: full recursive managed-agent subtree (W-HIERARCHY walker, no depth cap), all 4 scopes (area / muni / community / neighbourhood), all access flags (condo / homes / buildings + buildings_mode), per-cell primary toggle, row-level conflict UX. Cross-tenant write attempts and out-of-subtree write attempts return 403. T4c builds in three phases shipping in sequence within the working block.",
  "",
  "  - **T4a-2 CLOSED (commit `d8ef4c5`):** new `/admin-homes/territory` page + 2 API routes (`coverage`, `audit-log`) + TerritoryClient component (coverage table + audit log viewer + 5-card stats). Per-tenant scoping (Q1 product call from v12). 1051 LOC across 5 files, TSC clean, 4 files written atomically via `scripts/r-territory-t4a-2-deploy.js`.",
  "",
  "  - **T4a-3 CLOSED:** F-APA-DELETE-INSERT-CHURN comprehensive fix. Replaced DELETE-all + INSERT-all churn pattern with server-side diff in both apa (`agents/[id]/geo/route.ts`) and tpa (`tenants/[id]/geo/route.ts`) POST routes. Diff logic extracted to `lib/admin-homes/apa-diff.ts` (computeApaDiff: pure function over identity-keyed maps). Auto-reassign for primary claims preserved (T4a-1 behavior). Inactive rows preserved on save (no longer nuked, behavior improvement over the original DELETE-all). 5 files via `scripts/r-territory-t4a-3-deploy.js` (1 NEW apa-diff + 3 REWRITES with timestamped backups + 1 NEW smoke).",
  "",
  "  - **T4a-3b CLOSED:** F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix. Caller probe confirmed live in production: 2 callers (`HomePageComprehensive.tsx`, `HomePageComprehensiveV2.tsx`) both invoked from `app/page.tsx` and `app/comprehensive-site/page.tsx` (V1/V2 split via runtime feature flag). Pre-fix: `case 'neighbourhood'` was missing from `resolveAgentAccess` switch; neighbourhood-scope rows silently dropped from access set. Fix: added `case 'neighbourhood':` with parent propagation (matches existing `community` case shape: adds parent community + muni + area to access ID sets). Tighter neighbourhood-grained filtering (extending ResolvedAccess + downstream listing filter) deferred to a future T4d -- not blocking and not regressive.",
  "",
  "  - **Smoke (9/9 PASS via `scripts/r-territory-t4a-3-smoke.ts`, savepoint-isolated):**",
  "    - T1\u2013T4: pure unit tests of computeApaDiff (identical \u2192 0 changes; addition \u2192 1 insert; removal \u2192 1 delete; primary toggle \u2192 1 update + 1 claim).",
  "    - T5: identical save \u2192 **0 audit rows** (the headline F-APA-DELETE-INSERT-CHURN proof).",
  "    - T6: row added \u2192 1 `assignment_granted`.",
  "    - T7: row removed \u2192 1 `assignment_revoked`.",
  "    - T8: `is_primary` off \u2192 1 `primary_unset` (no churn).",
  "    - T9: `condo_access` flip \u2192 1 `access_toggle_changed` (no churn).",
  "    Production data ROLLED BACK; no rows committed.",
  "",
  "  - **T4c phase scope (locked, multi-tenant comprehensive):**",
  "    - **T4c-1**: `POST /api/admin-homes/territory/bulk-assign` route. Accepts `{ agentId \u2192 ApaRow[] }` payload. Per-agent permission gate via `can()` with `agent.write` (manager must have write on every agent in payload; cross-tenant or out-of-subtree \u2192 403, zero DB writes). Per-tenant scoping enforced server-side. Atomic: all-or-nothing via single pg.Client transaction (BEGIN / per-agent computeApaDiff + apply / COMMIT, ROLLBACK on any failure). Auto-reassign primary runs once per (scope, scope_id) pair across the entire payload, not per-agent. Smoke covers: no-change save \u2192 0 audits; cross-tenant attempt \u2192 403 + 0 writes; out-of-subtree attempt \u2192 403 + 0 writes; per-agent failure mid-payload \u2192 full rollback.",
  "    - **T4c-2**: `/admin-homes/territory/manage` page + matrix component. Rows = manager's effective coverage geos at all 4 scopes. Columns = full recursive managed-agent subtree + a self column for the manager. Cell editor: `is_primary`, `condo_access`, `homes_access`, `buildings_access`, `buildings_mode` (full apa row spec, no fields hidden). Per-row primary-conflict surface (visual indicator before save). Per-row bulk actions (assign-all-to-X, clear-row). Inheritance preview (rows where agent currently inherits from manager are visually distinct from explicit assignments).",
  "    - **T4c-3**: mobile responsive (matrix \u2192 stacked per-agent accordion). Keyboard navigation + ARIA cell semantics. a11y audit. Empty states + loading states.",
  "",
  "  - **Files shipped in v14 batch:**",
  "    - `scripts/r-territory-t4a-2-deploy.js` + 4 created files (page + 2 routes + TerritoryClient component).",
  "    - `scripts/r-territory-t4a-3-deploy.js` + 5 created/rewritten files (apa-diff + 2 route rewrites + access-resolver rewrite + smoke).",
  "    - `scripts/r-territory-t4a-3-smoke.ts` (9-test smoke, savepoint-isolated, runs via `npx tsx`).",
  "    - `scripts/patch-tracker-v14.js` (this patch).",
  "",
  "  - **Commits:** `d8ef4c5` (T4a-2 ship), [T4a-3 commit hash to be added on push].",
  "",
  "  - **Next:** T4c-1 \u2014 backend bulk-assign API + smoke. Recon precedes build (existing matrix patterns inventory + transaction story confirmation: pg.Client in route vs RPC vs best-effort).",
  ""
];

const V14_ENTRY = V14_ENTRY_LINES.join(NL) + NL;
const P2_NEW = V14_ENTRY + P2_ANCHOR;

// ===========================================================================
// P3 -- Replace T4a-2/3/3b blocks in Next Action with CLOSED summaries +
//       expand T4c into T4c-1/2/3 sub-phases
// ===========================================================================

const P3_OLD_START = "**T4a-2: New `/admin-homes/territory` page**";
const P3_OLD_END_CANDIDATES = [
  "**T4b: Public-facing UI",
  "### 2. T4b",
  "### 2.",
];
// P3_OLD_END picked at runtime; first match wins.

const P3_NEW = [
  "**T4a-2: New `/admin-homes/territory` page** \u2705 CLOSED 2026-05-08 v14",
  "",
  "- New server component `app/admin-homes/territory/page.tsx` (auth + tenant scoping mirrors `agents/page.tsx` pattern). New client component `components/admin-homes/TerritoryClient.tsx` (coverage table + audit log viewer + 5-card stats with scope filter + change_type filter).",
  "- Two new GET API routes: `/api/admin-homes/territory/coverage` (active APA rows joined with agent + geo names + stats), `/api/admin-homes/territory/audit-log` (TAC rows with limit + change_type + agent_id filters + distinct change_types for filter UI).",
  "- Per-tenant scoping; platform admin can override via `?tenant_id=...`; cross-tenant access for non-platform users \u2192 400.",
  "- Commit `d8ef4c5` -- 5 files, 1051 LOC, TSC clean.",
  "",
  "**T4a-3: F-APA-DELETE-INSERT-CHURN comprehensive fix** \u2705 CLOSED 2026-05-08 v14",
  "",
  "- Server-side diff in apa POST route (`agents/[id]/geo/route.ts`) and tpa POST route (`tenants/[id]/geo/route.ts`). Diff logic extracted to `lib/admin-homes/apa-diff.ts` (`computeApaDiff` + `ApaRow` + `ApaDiff` types).",
  "- Identity key per row: `(scope, area_id, municipality_id, community_id, neighbourhood_id)`. Diff outcomes: identical \u2192 0 SQL ops; added \u2192 INSERT only new rows; removed \u2192 DELETE by id only the removed rows; mutated \u2192 UPDATE by id only the changed rows.",
  "- Auto-reassign for primary claims preserved (T4a-1 behavior). Inactive rows now preserved on save (no longer nuked -- behavior improvement).",
  "- Smoke 9/9 PASS via `scripts/r-territory-t4a-3-smoke.ts` (savepoint-isolated). T5 identical-save delta = 0 audit rows is the headline proof.",
  "",
  "**T4a-3b: F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix** \u2705 CLOSED 2026-05-08 v14",
  "",
  "- Caller probe confirmed live: `HomePageComprehensive.tsx` + `HomePageComprehensiveV2.tsx`, both wired from `app/page.tsx` and `app/comprehensive-site/page.tsx`.",
  "- Added `case 'neighbourhood':` to `resolveAgentAccess` switch in `lib/comprehensive/access-resolver.ts` with parent propagation (matches existing `community` case shape).",
  "- Tighter neighbourhood-grained listing filter (extending `ResolvedAccess` with `neighbourhoodIds` + downstream filter) deferred to future T4d -- non-regressive, additive.",
  "",
  "**T4c-1: Bulk-assign API route + smoke**",
  "",
  "- New route `POST /api/admin-homes/territory/bulk-assign`. Payload: `{ assignments: { [agentId]: ApaRow[] } }`.",
  "- Per-agent permission gate via `can()` with `agent.write`. Manager must have write on every agent in payload. Out-of-subtree or cross-tenant agent in payload \u2192 403, zero DB writes (atomicity guard).",
  "- Atomic: single pg.Client transaction wrapping per-agent computeApaDiff + apply. ROLLBACK on any per-agent failure.",
  "- Auto-reassign primary runs ONCE per (scope, scope_id) pair across the entire payload (not per-agent) to avoid redundant updates and partial-unique-index churn.",
  "- Smoke (savepoint-isolated): no-change bulk save \u2192 0 audits; cross-tenant attempt \u2192 403 + 0 writes; out-of-subtree attempt \u2192 403 + 0 writes; per-agent mid-payload failure \u2192 full rollback verified at row count level.",
  "",
  "**T4c-2: Matrix component + page (desktop)**",
  "",
  "- New page `/admin-homes/territory/manage`. Server component fetches manager's effective coverage geos (all 4 scopes) + full recursive managed-agent subtree (via `auth.ts` `managedAgentIds`).",
  "- Matrix component: rows = geos, columns = managed agents + self. Per-cell editor: `is_primary`, `condo_access`, `homes_access`, `buildings_access`, `buildings_mode`.",
  "- Per-row conflict UX: when two cells in same row both claim primary, visually flag before save (preempts the partial-unique-index rejection from the apa partial unique constraints).",
  "- Per-row bulk actions: assign-all-to-X, clear-row.",
  "- Inheritance preview: rows where agent has no explicit apa for that geo show inherited-from-manager state distinctly from explicit rows.",
  "",
  "**T4c-3: Mobile + a11y**",
  "",
  "- Matrix collapses to stacked per-agent accordion on narrow viewports (each agent = expandable card with their geo rows).",
  "- Keyboard navigation: arrow keys move focus between cells; Enter toggles primary; space toggles access flags.",
  "- ARIA cell semantics throughout (table is the natural primitive). Loading states + empty states + error states audited.",
  "",
  "**T4b: Public-facing UI",
].join(NL);

// ===========================================================================
// P4 -- Findings append
// ===========================================================================

const P4_ANCHOR = "**F-APA-PRIMARY-AUDIT-GAP (2026-05-08, CLOSED v13):**";

const P4_NEW = [
  "**F-APA-DELETE-INSERT-CHURN (2026-05-07 logged v12, 2026-05-08 CLOSED v14):** geo POST routes for apa and tpa used a `DELETE all + INSERT all` pattern: every save fired N \u00d7 `assignment_revoked` + N' \u00d7 `assignment_granted` + distribute fan-out + reroll, even when the payload was identical to existing state. Audit table accumulated churn, trigger pipeline did unnecessary work, and listings cache was rerolled redundantly. Fix: server-side diff via `computeApaDiff` (`lib/admin-homes/apa-diff.ts`) -- identity-keyed map of `(scope, area_id, municipality_id, community_id, neighbourhood_id)`, diff classifies rows as toDelete / toInsert / toUpdate / unchanged, route applies only the actual changes. Same fix shape applied to tpa POST route (no triggers/audit on tpa, but same primitive class of bug; consistent fix). Smoke T5 (identical-save \u2192 0 audit rows) is the canonical proof. Inactive rows now preserved on save as a behavior improvement (previously nuked).",
  "",
  "**F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP (2026-05-07 logged v12, 2026-05-08 CLOSED v14):** `lib/comprehensive/access-resolver.ts` switch on `assignment.scope` handled `area`, `municipality`, `community` only -- `neighbourhood` rows fell through silently. Caller probe confirmed live: 2 callers (`HomePageComprehensive.tsx`, `HomePageComprehensiveV2.tsx`), both wired into `app/page.tsx` and `app/comprehensive-site/page.tsx`. Currently 0 neighbourhood-scope rows in production, so the gap was theoretical -- but Rule Zero (multi-tenant at scale) demands the path be correct before tenant #2 onboards with neighbourhood-grained agents. Fix: added `case 'neighbourhood':` with parent propagation (community + muni + area added to access ID sets) -- matches the existing `community` case shape. Tighter neighbourhood-grained listing filter (extending `ResolvedAccess` with `neighbourhoodIds` + downstream filter) deferred as future T4d (non-regressive, additive).",
  "",
  "**F-APA-PRIMARY-AUDIT-GAP (2026-05-08, CLOSED v13):**"
].join(NL);

// ===========================================================================
// P5 -- Workflow rules append
// ===========================================================================

const P5_ANCHOR = "- **Smoke-via-savepoint-isolation pattern (v13):**";

const P5_NEW = [
  "- **Per-row-diff via computeApaDiff pattern (v14):** any future write path that ingests a desired-state payload for `agent_property_access` (or any similarly-shaped table) must use a server-side diff against the current active state, not a DELETE-all + INSERT-all pattern. Identity key for the diff is the natural compound key minus mutable fields (for apa: `(scope, area_id, municipality_id, community_id, neighbourhood_id)`). Diff produces `toDelete` (existing not in incoming), `toInsert` (incoming not in existing), `toUpdate` (in both with mutable-field difference), and `unchanged`. Apply order: auto-reassign for primary claims first (unset OTHERS' is_primary at claimed (scope, scope_id) within tenant), then DELETEs by id, then UPDATEs by id, then INSERTs. Result: identical save \u2192 0 SQL ops + 0 audit rows; partial change \u2192 minimum-necessary writes. Encoded in `lib/admin-homes/apa-diff.ts` and the apa+tpa geo POST routes. Reusable for any future apa-shaped reconciliation route.",
  "- **Smoke-via-savepoint-isolation pattern (v13):**"
].join(NL);

// ===========================================================================
// Apply
// ===========================================================================

const patches = [];

// P1
{
  const idx = original.indexOf(P1_OLD);
  patches.push({ name: 'P1: status line tail', kind: 'replace', old: P1_OLD, new: P1_NEW, found: idx !== -1 });
}

// P2
{
  const idx = original.indexOf(P2_ANCHOR);
  patches.push({ name: 'P2: insert v14 entry above v13', kind: 'replace', old: P2_ANCHOR, new: P2_NEW, found: idx !== -1 });
}

// P3 -- pick endAnchor
let p3EndAnchor = null;
for (const candidate of P3_OLD_END_CANDIDATES) {
  if (original.indexOf(candidate) !== -1 && original.indexOf(candidate) > original.indexOf(P3_OLD_START)) {
    p3EndAnchor = candidate;
    break;
  }
}
patches.push({
  name: 'P3: T4a-2/3/3b CLOSED summaries + T4c-1/2/3 expansion',
  kind: 'span-replace',
  startAnchor: P3_OLD_START,
  endAnchor: p3EndAnchor || '__P3_END_NOT_FOUND__',
  new: P3_NEW,
  found: p3EndAnchor !== null,
});

// P4
{
  patches.push({ name: 'P4: Findings append (CHURN + RESOLVER-GAP both CLOSED)', kind: 'replace', old: P4_ANCHOR, new: P4_NEW, found: original.indexOf(P4_ANCHOR) !== -1 });
}

// P5
{
  patches.push({ name: 'P5: Workflow rules append (per-row-diff pattern)', kind: 'replace', old: P5_ANCHOR, new: P5_NEW, found: original.indexOf(P5_ANCHOR) !== -1 });
}

let content = original;
const results = [];

for (const p of patches) {
  if (!p.found) {
    results.push({ name: p.name, status: 'FAIL', reason: 'anchor not found in source -- v13 state may differ from expected' });
    continue;
  }
  if (p.kind === 'replace') {
    const idx = content.indexOf(p.old);
    if (idx === -1) {
      results.push({ name: p.name, status: 'FAIL', reason: 'old anchor not found at apply time' });
      continue;
    }
    if (content.indexOf(p.old, idx + 1) !== -1) {
      results.push({ name: p.name, status: 'FAIL', reason: 'old anchor not unique' });
      continue;
    }
    content = content.slice(0, idx) + p.new + content.slice(idx + p.old.length);
    results.push({ name: p.name, status: 'OK', delta: p.new.length - p.old.length });
  } else if (p.kind === 'span-replace') {
    const startIdx = content.indexOf(p.startAnchor);
    if (startIdx === -1) {
      results.push({ name: p.name, status: 'FAIL', reason: 'startAnchor not found at apply time' });
      continue;
    }
    if (content.indexOf(p.startAnchor, startIdx + 1) !== -1) {
      results.push({ name: p.name, status: 'FAIL', reason: 'startAnchor not unique' });
      continue;
    }
    const endIdx = content.indexOf(p.endAnchor, startIdx + p.startAnchor.length);
    if (endIdx === -1) {
      results.push({ name: p.name, status: 'FAIL', reason: 'endAnchor not found after startAnchor' });
      continue;
    }
    const oldSpan = content.slice(startIdx, endIdx);
    content = content.slice(0, startIdx) + p.new + content.slice(endIdx);
    results.push({ name: p.name, status: 'OK', delta: p.new.length - oldSpan.length });
  }
}

console.log('\nPatch results:');
for (const r of results) {
  let line = '  ' + r.status + ': ' + r.name;
  if (r.reason) line += ' -- ' + r.reason;
  if (typeof r.delta === 'number') line += ' (delta ' + (r.delta >= 0 ? '+' : '') + r.delta + ' chars)';
  console.log(line);
}

const failed = results.filter(function (r) { return r.status === 'FAIL'; });
if (failed.length > 0) {
  console.error('\nFAIL: ' + failed.length + ' patch(es) failed. Original file untouched. Backup at ' + backupPath + ' (identical to original -- discardable).');
  process.exit(1);
}

if (content === original) {
  console.log('\nNo-op: file already at target state.');
  process.exit(0);
}

fs.writeFileSync(TRACKER, content);
console.log('\nWrote: ' + TRACKER + ' (' + content.length + ' chars; net delta ' + (content.length - original.length) + ' chars)');
console.log('Diff: git diff -- ' + TRACKER);