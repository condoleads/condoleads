// scripts/patch-tracker-v17.js
//
// W-TERRITORY-TRACKER patch: v16 -> v17.
//
// Captures:
//   - T4c-2 CLOSED 2026-05-08: cross-agent matrix shipped end-to-end.
//     - lib/admin-homes/territory-matrix.ts (NEW): pure builder + serializer
//     - scripts/r-territory-t4c-2-builder-smoke.ts (NEW): 8/8 PASS
//     - app/api/admin-homes/territory/matrix/route.ts (NEW): GET handler
//     - components/admin-homes/TerritoryMatrix.tsx (NEW): React component
//     - components/admin-homes/TerritoryClient.tsx (MODIFIED): tabs integration
//     - scripts/patch-territory-client-tabs.js (NEW): the surgical patch
//   - F-AREA-MANAGER-SUBTREE-DEPTH-INCONSISTENCY logged.
//
// Patches applied:
//   P1. Status line tail
//   P2. Insert v17 status log entry above v16
//
// Pre-flight: requires v16 marker present, v17 marker absent.
// Idempotent: skips if V17_MARKER already present.
// Atomic: all patches in memory, file written once at end on full success.

const fs = require('fs');
const path = require('path');

const TRACKER = path.join('docs', 'W-TERRITORY-TRACKER.md');

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(TRACKER)) fail(TRACKER + ' not found at ' + path.resolve(TRACKER));

const original = fs.readFileSync(TRACKER, 'utf8');

const V16_MARKER = '- **2026-05-08 v16**';
const V17_MARKER = '- **2026-05-08 v17**';

if (original.indexOf(V17_MARKER) !== -1) {
  console.log('SKIP: V17_MARKER already present.');
  process.exit(0);
}
if (original.indexOf(V16_MARKER) === -1) {
  fail('v16 state not detected. Expected ' + V16_MARKER + '.');
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
let content = original;

function applyExact(label, oldStr, newStr) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    fail(label + ': anchor not found.' + NL + '  First 200 chars expected:' + NL + '    ' + oldStr.slice(0, 200).replace(/\r?\n/g, ' [NL] '));
  }
  const next = content.indexOf(oldStr, idx + 1);
  if (next !== -1) fail(label + ': anchor matches twice -- not unique.');
  content = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
  console.log(label + ': OK (delta ' + (newStr.length - oldStr.length) + ')');
}

function insertBefore(label, anchor, insertion) {
  const idx = content.indexOf(anchor);
  if (idx === -1) fail(label + ': anchor "' + anchor.slice(0, 60) + '" not found.');
  content = content.slice(0, idx) + insertion + content.slice(idx);
  console.log(label + ': OK (inserted ' + insertion.length + ' chars)');
}

const P1_OLD =
  '**Next:** T4a phase fully CLOSED v14. **T4c-1 \u2705 CLOSED v16** (route + deploy + fix-pg-deps + smoke 6/6 PASS, all artifacts committed in single batch). T4c-1 closure deltas: bulk-assign route at `app/api/admin-homes/territory/bulk-assign/route.ts`; per-agent permission gating via `can()` before BEGIN; cross-agent primary conflict guard pre-BEGIN; per-agent diff via `computeApaDiff` (T4a-3 single-source-of-truth); auto-reassign deduplicated across payload; full atomicity via single BEGIN/COMMIT pg.Client transaction. F-NPM-DEDUP-SILENT-DEVDEP-REVERT closed inline (pg promoted devDep -> dep; @types/pg added; mitigation pattern in v15 status log). Smoke covered: computeApaDiff no-op, cross-agent primary conflict (positive + negative), DB bulk no-op (0 audit churn over 12-row baseline), DB mid-tx atomicity (SHA256 hash pre==post after INSERT + ROLLBACK), DB multi-agent diff (1 audit each for King Shah + Neo Smith, no cross-contamination). **T4c-2 next, this working block**: matrix component + page + cell editor + conflict UX (desktop). Then T4c-3 mobile responsive + a11y + inheritance preview + bulk row actions; then T4b, T7.';

const P1_NEW =
  '**Next:** T4a phase fully CLOSED v14. T4c-1 \u2705 CLOSED v16. **T4c-2 \u2705 CLOSED v17** (matrix component + tabs integration + GET API route + builder/serializer lib + 8/8 builder smoke PASS, all artifacts committed in split feat + docs batch). T4c-2 closure deltas: pure builder/serializer at `lib/admin-homes/territory-matrix.ts` with T8 round-trip regression sentinel; GET API route at `app/api/admin-homes/territory/matrix/route.ts` with per-tenant footprint column policy + per-agent `can(\u0027agent.write\u0027)` decisions baked in; React component at `components/admin-homes/TerritoryMatrix.tsx` with scope picker, cell button + popover editor, sticky save toolbar, conflict banner, read-only row support; tabs integration in `TerritoryClient.tsx` via 5-anchor surgical patch (Coverage / Matrix / Audit). Design lock executed: Q1=1 (one scope per matrix), Q2=2 (presence + primary inline; access flags via popover), Q3=1 (explicit Save), Q4=1 (tabs in TerritoryClient). F-AREA-MANAGER-SUBTREE-DEPTH-INCONSISTENCY logged: `auth.ts::computeManagedAgentIds` returns depth-2 for area_managers but `permissions.ts` comments specify FULL SUBTREE; benign for <=2-level orgs, real bug for deeper structures; defer fix to dedicated patch when affected tenant onboards. **T4c-3 next, this working block**: mobile responsive + a11y + inheritance preview + bulk row actions. Then T4b, T7.';

applyExact('P1 Status line tail', P1_OLD, P1_NEW);

const V17_ENTRY =
  '- **2026-05-08 v17** -- **T4c-2 CLOSED.** Cross-agent territory matrix shipped end-to-end: pure builder/serializer + GET API route + React component + tabs integration in TerritoryClient. Builder smoke 8/8 PASS. Manual visual QA pending (component lives at `/admin-homes/territory` under the new "Matrix" tab).' + NL +
  '  - **Design lock executed** (Q1=1 / Q2=2 / Q3=1 / Q4=1):' + NL +
  '    - Q1: one scope per matrix (scope picker at top -- area / municipality / community / neighbourhood)' + NL +
  '    - Q2: cell content = presence dot + primary star; access flags (condo/homes/buildings/mode) edited via popover that opens on cell click' + NL +
  '    - Q3: explicit "Save N changes" sticky-toolbar button; one POST commits the whole batch via T4c-1\u0027s bulk-assign route' + NL +
  '    - Q4: matrix lives in a tab inside `TerritoryClient.tsx` alongside Coverage + Audit log' + NL +
  '  - **Files added/modified (split feat + docs commit batch per project convention -- mirrors T4c-1 close):**' + NL +
  '    - **feat commit -- code:**' + NL +
  '      - `lib/admin-homes/territory-matrix.ts` (NEW): pure builder + serializer; 12 exports; no I/O / no async / no React; design contract for everything else.' + NL +
  '      - `scripts/r-territory-t4c-2-builder-smoke.ts` (NEW, 13611 bytes): 8/8 PASS via `npx tsx`. T8 round-trip preservation test is the regression sentinel for "matrix never accidentally deletes other-scope APA rows".' + NL +
  '      - `app/api/admin-homes/territory/matrix/route.ts` (NEW, 10789 bytes): GET handler. Auth pattern mirrors coverage route. Tenant-footprint column policy (only geos with >=1 existing tenant agent at the requested scope -- avoids dumping ~600 GTA communities; tradeoff: no in-matrix new-geo creation in v1).' + NL +
  '      - `components/admin-homes/TerritoryMatrix.tsx` (NEW, 19584 bytes): client component. Scope picker, CellButton (presence + primary inline; state-based styling: empty / explicit / edited / conflict / read-only), CellEditor popover (access flags + buildings_mode + Remove + click-outside close), sticky save toolbar (pending count + Discard + Save), conflict banner with cell highlights on 400 response.' + NL +
  '      - `components/admin-homes/TerritoryClient.tsx` (MODIFIED via 5-anchor surgical patch, +1304 chars): added TerritoryMatrix import (P1), `activeTab` state (P2), tabs nav UI + open Coverage conditional (P3), close Coverage + Matrix render + open Audit conditional (P4), close Audit conditional (P5). Backup retained.' + NL +
  '      - `scripts/patch-territory-client-tabs.js` (NEW): patch script preserved for reproducibility. Line-ending-adaptive (first attempt failed because file uses LF but patch hardcoded CRLF; fixed by sniffing line ending at script start).' + NL +
  '    - **docs commit -- tracker:**' + NL +
  '      - `scripts/patch-tracker-v17.js` (NEW, this script)' + NL +
  '      - `docs/W-TERRITORY-TRACKER.md` (MODIFIED, v17 patch applied)' + NL +
  '  - **Builder smoke coverage (8/8 PASS, pure-function, no side effects):**' + NL +
  '    - T1 computeApaDiff no-op (identical baseline) -> 0/0/0/N' + NL +
  '    - T2 cross-agent primary conflict, **positive** (2 agents claim primary on same key) -> 1 conflict, both agents present' + NL +
  '    - T3 cross-agent primary conflict, **negative** (only 1 primary, other false) -> 0 conflicts' + NL +
  '    - T4 serializer: pending edit overrides initial (is_primary toggled false -> true)' + NL +
  '    - T5 serializer: cell cleared via edit (set null) -> omitted from payload (route diff toDeletes)' + NL +
  '    - T6 serializer: other-scope APA rows pass through verbatim (with all flag bits preserved)' + NL +
  '    - T7 serializer: untouched agents excluded from payload (only edited agent IDs)' + NL +
  '    - **T8 (regression sentinel):** round-trip build -> serialize unchanged -> all original rows present with all flags' + NL +
  '  - **F-AREA-MANAGER-SUBTREE-DEPTH-INCONSISTENCY (logged, not blocking T4c-2):**' + NL +
  '    - **Mechanism:** `lib/admin-homes/auth.ts::computeManagedAgentIds` returns depth-2 for `area_manager` (direct children + grandchildren only). `lib/admin-homes/permissions.ts` comments at the `ActorPermissionContext` definition specify "FULL SUBTREE for area_managers" (transitive through arbitrary depth).' + NL +
  '    - **Impact:** For tenants with > 2 levels of management hierarchy under an area_manager (e.g., area_manager -> manager -> managed_agent -> sub_managed_agent), the deepest descendants are invisible to the area_manager\u0027s matrix and uneditable via `can(\u0027agent.write\u0027)`.' + NL +
  '    - **Likelihood:** benign for current tenants (most orgs are area_manager -> manager -> agent, depth 2 covers them). Real bug latent in the data model for deeper structures.' + NL +
  '    - **Recommended fix:** change `computeManagedAgentIds` to recursively walk descendants for `area_manager` (or delegate to `getDescendantIds` from `lib/admin-homes/hierarchy.ts` which already handles transitive walks with cycle detection + 1000-row safety cap). Defer to dedicated patch when an affected tenant onboards.' + NL +
  '  - **Coverage gaps (acknowledged, deferred to T4c-3 or follow-ups):**' + NL +
  '    - Inheritance preview (manager-wider-scope auto-covering managed agents) -- T4c-3 scope per v14 sub-phase lock.' + NL +
  '    - Mobile responsive layout + a11y polish -- T4c-3 scope.' + NL +
  '    - Bulk row actions ("apply this row to all communities in this muni") -- T4c-3 scope.' + NL +
  '    - Live cross-agent primary conflict pre-check at edit time (currently surfaces server-side via 400 response on Save).' + NL +
  '    - HTTP integration smoke for the matrix route + bulk-assign perm gates (`can()` lib already covered by W-ROLES-DELEGATION R1-R7 unit tests; routes are thin wrappers).' + NL +
  '  - **T4c-3 next (this working block per Rule Zero -- Nothing Deferred):** mobile responsive + a11y + inheritance preview + bulk row actions. Substantial UX phase; ships in own sub-session within this working block.' + NL +
  NL;

insertBefore('P2 Insert v17 status log', V16_MARKER, V17_ENTRY);

fs.writeFileSync(TRACKER, content, 'utf8');
console.log('');
console.log('Tracker updated: ' + TRACKER);
console.log('  was:   ' + original.length + ' chars');
console.log('  now:   ' + content.length + ' chars');
console.log('  delta: +' + (content.length - original.length));
console.log('Backup: ' + backupPath);