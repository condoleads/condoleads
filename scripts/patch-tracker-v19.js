// scripts/patch-tracker-v19.js
//
// W-TERRITORY-TRACKER patch: v18 -> v19.
//
// Closes T4c-3. All four phases shipped:
//   - Phase 1 mobile responsive (commit d18578b)
//   - Phase 2 a11y basic floor (commit eac3afa)
//   - Phase 3+4 inheritance preview + per-row kebab menu (commit 00a312b)
//
// Patches:
//   P1. Status line tail: "T4c-3 next..." -> "T4c-3 CLOSED v19 (...) T4b next..."
//   P2. Insert v19 status log entry above v18.
//   P3. Replace T4c-3 design-locked spec block in Next Action with CLOSED summary.
//
// New finding logged (inline in v19 entry + Next Action summary):
//   F-RESET-TO-INHERITED-BUILDER-DEPENDENCY -- Phase 4's "Reset to inherited"
//   action was deferred. Implementing honestly requires the builder to expose
//   an `inheritedFallback` map alongside `cells`. Without that, the action is
//   a label-only alias for "Clear row" (dishonest UX).
//
// Pre-flight: requires v18 marker present, v19 marker absent.
// Atomic: all 3 patches in memory; file written once at end on success.
// CRLF-preserving: explicit \r\n joins for new content.

const fs = require('fs');
const path = require('path');

const TRACKER = path.join('docs', 'W-TERRITORY-TRACKER.md');
function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }
if (!fs.existsSync(TRACKER)) fail(TRACKER + ' not found at ' + path.resolve(TRACKER));

const original = fs.readFileSync(TRACKER, 'utf8');

const V18_MARKER = '- **2026-05-08 v18**';
const V19_MARKER = '- **2026-05-09 v19**';

if (original.indexOf(V19_MARKER) !== -1) {
  console.log('SKIP: V19_MARKER already present.');
  process.exit(0);
}
if (original.indexOf(V18_MARKER) === -1) {
  fail('v18 state not detected. Run patch-tracker-v18.js first.');
}

const now = new Date();
const pad = function (n) { return String(n).padStart(2, '0'); };
const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
const backupPath = TRACKER + '.backup_' + stamp;
fs.writeFileSync(backupPath, original);
console.log('Backup: ' + backupPath + ' (' + original.length + ' chars)');

const NL = '\r\n';
let content = original;

// ===========================================================================
// P1: Status line tail
// ===========================================================================

const P1_OLD = '**T4c-3 next, this working block**: mobile responsive + a11y + inheritance preview + bulk row actions. Then T4b, T7.';
const P1_NEW = '**T4c-3 \u2705 CLOSED v19** (Phases 1-4 shipped: P1 mobile responsive `d18578b`, P2 a11y basic floor `eac3afa`, P3+4 inheritance preview + per-row kebab menu `00a312b`; F-RESET-TO-INHERITED-BUILDER-DEPENDENCY logged; "Reset to inherited" deferred pending builder change; manual visual QA pending on the 3 kebab bulk handlers). **T4b next, this working block**: public-facing UI -- geo page primary agent display via `resolve_display_agent_for_context`. Then T7 (close ticket).';

let p1Count = content.split(P1_OLD).length - 1;
if (p1Count !== 1) fail('P1 anchor expected 1 match, found ' + p1Count);
content = content.replace(P1_OLD, P1_NEW);
console.log('P1 OK: status line tail updated');

// ===========================================================================
// P2: Insert v19 entry above v18
// ===========================================================================

const P2_ANCHOR = '- **2026-05-08 v18** -- **T4c-3 DESIGN LOCK';

const V19_LINES = [
  '- **2026-05-09 v19** -- **T4c-3 CLOSED.** Cross-agent territory matrix is feature-complete: mobile responsive + a11y basic floor + inheritance preview + per-row kebab menu shipped across 4 phases in this working block. Builder smoke 9/9 PASS through Phase 3 (T9 inherited round-trip is the new regression sentinel against accidental over-serialization that would duplicate parent APA rows onto child agents on Save). All four phases TSC clean.',
  '    - **Phases shipped:**',
  '      - **Phase 1 -- mobile responsive (commit `d18578b`):** `<thead>` gains `sticky top-0 z-20` (header stays visible during vertical scroll); wrapper gains `overflow-auto max-h-[80vh]` (bounded internal scroll for tall matrices); first-column `<th>` z-index promoted from `z-10` to `z-30` (corner intersection layer when both axes scroll); cell tap target `h-10 sm:h-7` (40px mobile / 28px desktop). 4 anchored edits, component-only.',
  '      - **Phase 2 -- a11y basic floor (commit `eac3afa`):** state-aware `aria-label` (agent name + geo name + assignment state + read-only/conflict/inherited info) + `aria-pressed`/`haspopup`/`expanded` on cell buttons; `role="dialog"` + `aria-modal="true"` + `aria-label="Edit cell access flags"` on popover; initial focus + ESC + Tab/Shift+Tab focus trap on `CellEditor`; `requestAnimationFrame`-based focus restore to originating cell button on popover close; `focus-visible:ring-2` rings on cell button + scope select + Discard/Save toolbar buttons + popover Remove/Close buttons + popover buildings-mode select. 15 anchored edits, component-only. a11y density jumped from baseline 0/0/0 to 6/1/19 (`aria-*` attribute count / `role="..."` count / `focus-visible:` rule count).',
  '      - **Phase 3 -- inheritance preview (commit `00a312b`, bundled with Phase 4):** `MatrixCell.presence` extended from `\'explicit\'` to `\'explicit\' | \'inherited\'` + optional `inherited_from_agent_id` and `inherited_from_agent_name` fields; `MatrixBuildInputs` gains optional `inheritedRowsByAgent` and `inheritedFromNamesByAgent` maps; builder loop processes inherited rows AFTER explicit rows (explicit-wins-at-same-key invariant); matrix route adds step 7b -- distinct parent_id Promise.all fetch of parent agent names + parent APA rows (depth-1 walk per F-INHERITANCE-DEPTH-1 + the per-agent page pattern in `app/admin-homes/agents/[id]/page.tsx`); component renders gray tint + `Lock` icon overlay on inherited-only cells, popover gains "Inherited from [Manager Name] -- editing creates an override" banner, "Remove assignment" button only renders for `presence === \'explicit\'` (preserving flex-between layout with empty span); ariaLabel + title surface inheritance state; clicking an inherited cell opens the popover, where editing any flag flips the cell to explicit (creating an override). Builder smoke gained T9: inherited cells render with `presence=\'inherited\'`, explicit beats inherited at same key, serializer emits zero inherited rows in the bulk-assign payload (regression sentinel against accidental over-serialization). 17 anchored edits across 4 files (builder / route / component / smoke).',
  '      - **Phase 4 -- kebab menu (commit `00a312b`):** per-row `MoreVertical` button on `can_write === true` rows at the right edge of the agent-name cell; opens a `role="menu"` dropdown with focus trap + ESC + click-outside + initial focus on first menu item. Three bulk actions ship in v1: **Set all primary** (flips `is_primary=true` on every assigned cell in the row, converts inherited cells to explicit overrides on the way), **Clear row** (sets all explicit cells to null in `editedCells`; route diff handles deletes; inherited cells fall through after refetch), **Copy from agent...** (sub-list of every other agent in the matrix; clicking copies the source agent\'s explicit cells onto the target with `is_primary=false` + `apa_id=null` so the copies don\'t conflict with the source\'s primary or pretend to be the source\'s APA records). 5 anchored edits, component-only.',
  '    - **F-RESET-TO-INHERITED-BUILDER-DEPENDENCY (logged at v19, not blocking T4c-3 closure):**',
  '      - **Mechanism:** the v18 design lock named four bulk actions in the kebab menu, the fourth being "Reset to inherited". Implementing it honestly requires the matrix builder to expose an `inheritedFallback: Record<string, MatrixCell>` map alongside the existing `cells` map, so the component can distinguish "explicit cell with inherited fallback underneath" (revertible to inherited) from "explicit cell without fallback" (would go empty on revert). Without that distinction, "Reset to inherited" becomes a label-only alias for "Clear row" -- two buttons doing the same thing is dishonest UX. Phase 4 ships 3 of 4 actions and explicitly defers the 4th.',
  '      - **Likelihood:** benign for v1. "Clear row" already covers the destructive case correctly; managed agents under managers will see inherited cells reappear after save+refetch (since the agent\'s parent\'s APA still exists), which delivers the intended "reset" effect by a different path. Users who want a true selective revert won\'t miss it until a tenant has explicit-without-inheritance cells they want to clear separately.',
  '      - **Recommended fix:** extend the builder to track inherited-fallback-when-explicit-exists in a parallel map; serializer doesn\'t change (still filters on `presence === \'explicit\'`); component\'s new `handleResetToInherited` becomes `for each cell where matrix.inheritedFallback[key] exists AND current cell is explicit-or-edited: setEditedCells[key] = null`. Adds smoke T10 (Reset action only clears cells with inherited fallback). ~30 LOC across builder + smoke + component. Defer to focused follow-up patch.',
  '    - **Manual visual QA pending (not blocking commit, recommended before production reliance):**',
  '      - Phase 1: scroll vertical on a 30+ agent matrix (sticky-top header stays visible); scroll horizontal on mobile-width viewport (sticky-left first column stays); both directions at once (corner cell stays anchored).',
  '      - Phase 2: tab through matrix from scope select (focus rings visible on every cell); Enter on an explicit cell (popover opens); Tab inside popover (focus traps); ESC (popover closes and focus returns to originating cell button).',
  '      - Phase 3: load matrix as a managed agent (or platform admin scoped to a tenant with manager hierarchy); inherited cells render gray + `Lock` overlay; click inherited cell (popover opens with "Inherited from X" banner); edit any flag (cell flips to amber-edited); Save (explicit override persists); refetch (cell shows as explicit, not inherited).',
  '      - Phase 4: open kebab on an agent with both explicit and inherited cells; **Set all primary** (inherited become amber-edited primary, explicit cells flip primary); **Clear row** (explicit cells go yellow toward null, inherited stay gray); **Copy from agent -> [other]** (explicit cells from source appear amber-edited on target with primary=false, apa_id=null on the copies); Save flow on each.',
  '    - **Files shipped this batch (cumulative across Phases 1-4):**',
  '      - `lib/admin-homes/territory-matrix.ts`: `MatrixCell` discriminator extended; `MatrixBuildInputs` gains inheritance maps; builder gains inheritance loop. +63 / -7 net.',
  '      - `app/api/admin-homes/territory/matrix/route.ts`: step 7b parent APA fetch via Promise.all; passes inherited maps to builder. +48 / -0 net.',
  '      - `components/admin-homes/TerritoryMatrix.tsx`: phases 1-4 all here (mobile + a11y + inheritance + kebab). +253 / -25 cumulative.',
  '      - `scripts/r-territory-t4c-2-builder-smoke.ts`: T9 inherited round-trip added. +62 / -0 net.',
  '      - `scripts/r-territory-t4c-3-phase-1-mobile.js`, `scripts/r-territory-t4c-3-phase-2-a11y.js`, `scripts/r-territory-t4c-3-phase-3-inheritance.js`, `scripts/r-territory-t4c-3-phase-4-kebab.js`: four reproducible patch scripts (NEW).',
  '      - **Commits:** `d18578b` (Phase 1), `eac3afa` (Phase 2), `00a312b` (Phases 3+4 cumulative).',
  '    - **Next:** T4b -- public-facing UI for primary agent display on geo pages (area / municipality / community / neighbourhood / building). Pre-build recon: locate existing geo page routes + agent-card components + how they fetch agent data today; consider extending `app/api/walliam/resolve-agent/route.ts` to accept `neighbourhood_id` (forward compat -- F-APA-NEIGHBOURHOOD-CHECK closure means neighbourhood-scope APA rows can now exist). Building pages are the documented System 1 / System 2 shared exception -- read existing handling before changing anything; do not modify System 1 paths. Then T7 (close ticket) + master launch tracker update flips the W-TERRITORY row to \u2705.',
  ''
];

const V19_ENTRY = V19_LINES.join(NL) + NL;

const p2Idx = content.indexOf(P2_ANCHOR);
if (p2Idx === -1) fail('P2 anchor not found: ' + P2_ANCHOR);
const p2Count = content.split(P2_ANCHOR).length - 1;
if (p2Count !== 1) fail('P2 anchor expected 1 match, found ' + p2Count);
content = content.slice(0, p2Idx) + V19_ENTRY + content.slice(p2Idx);
console.log('P2 OK: v19 entry inserted above v18 (delta: +' + V19_ENTRY.length + ' chars)');

// ===========================================================================
// P3: Replace T4c-3 spec block in Next Action with CLOSED summary
// ===========================================================================

const P3_OLD_LINES = [
  '**T4c-3: Mobile responsive + a11y + inheritance preview + bulk row actions** (DESIGN LOCKED v18: Q1=1 / Q2=1 / Q3=1 / Q4=1)',
  '',
  '- **Mobile (Q1=1):** horizontal scroll matrix with sticky first column. Wrap existing grid in `overflow-x-auto`; agent-name column gets `sticky left-0` + min-width; cell popover editor unchanged.',
  '- **A11y (Q2=1):** basic floor only. Semantic `<table>` / `<thead>` / `<tbody>` markup OR `role="grid"` + cell roles; `aria-label` on every cell button; `role="dialog"` + focus trap + ESC handler on popover; visible focus rings on all interactive elements. Spreadsheet-grade keyboard navigation deferred to future T4d.',
  '- **Inheritance preview (Q3=1):** cell tint by source -- gray (inherited only) / amber (override exists) / green (agent\'s own). Small `Lock` icon overlay on inherited-only cells. Popover editor shows inheritance lineage when editing. Builder gains `inherited: true` flag on inherited cells. Matrix route extension fetches each managed agent\'s parent APA rows (depth-1 walk per `app/admin-homes/agents/[id]/page.tsx` pattern; F-INHERITANCE-DEPTH-1 logged for future transitive fix).',
  '- **Bulk row actions (Q4=1):** per-row kebab (`MoreVertical` icon) at end of each row. Dropdown actions: "Set all primary / Clear row / Reset to inherited / Copy from agent...". Each action wired through existing builder cell-edit path. Multi-agent bulk ops served by T4c-1 bulk-assign route, not by this UI.',
  '- **Code phases (TSC + smoke gate between each):**',
  '  - Phase 1: mobile responsive (component-only edit).',
  '  - Phase 2: a11y basic floor (component-only edit).',
  '  - Phase 3: inheritance preview (route + builder + component; builder smoke gains T9 inherited round-trip).',
  '  - Phase 4: kebab menu (component-only edit).',
  '- **Closes in v19** with all four phases shipped.'
];

const P3_NEW_LINES = [
  '**T4c-3: Mobile responsive + a11y + inheritance preview + bulk row actions** \u2705 CLOSED 2026-05-09 v19',
  '',
  '- **Phase 1** \u2705 mobile responsive (commit `d18578b`): `<thead>` gains `sticky top-0 z-20`; wrapper gains `overflow-auto max-h-[80vh]`; first-column `<th>` z-index `z-10` -> `z-30` (corner intersection); cell tap target `h-10 sm:h-7` (40px mobile / 28px desktop). 4 anchored edits, component-only.',
  '- **Phase 2** \u2705 a11y basic floor (commit `eac3afa`): state-aware `aria-label` + `aria-pressed`/`haspopup`/`expanded` on cell buttons; `role="dialog"` + `aria-modal` + `aria-label` on popover; initial focus + ESC + Tab/Shift+Tab focus trap on `CellEditor`; `requestAnimationFrame` focus restore on close; `focus-visible:ring-2` rings on 7 interactive elements. 15 anchored edits, component-only. a11y density 0/0/0 -> 6/1/19.',
  '- **Phase 3** \u2705 inheritance preview (commit `00a312b`, bundled with Phase 4): `MatrixCell.presence` extended to `\'explicit\' | \'inherited\'` + optional `inherited_from_agent_id`/`name` fields; matrix route step 7b adds depth-1 parent APA fetch (Promise.all); builder gains inheritance loop (explicit-wins-at-same-key); component renders gray tint + `Lock` overlay on inherited-only cells, popover banner shows manager name + "editing creates an override"; clicking inherited cell opens popover. Builder smoke gained T9 (inherited round-trip regression sentinel against accidental over-serialization). 17 anchored edits across 4 files.',
  '- **Phase 4** \u2705 kebab menu (commit `00a312b`, bundled with Phase 3): per-row `MoreVertical` button on `can_write` rows; `role="menu"` dropdown with focus trap + ESC + click-outside + initial focus. Three actions ship: **Set all primary** (flips `is_primary` on every assigned cell, converts inherited to explicit override), **Clear row** (sets explicit cells to null in `editedCells`), **Copy from agent...** (lists other agents; clicking copies source\'s explicit cells with `is_primary=false` + `apa_id=null`). 5 anchored edits, component-only.',
  '- **F-RESET-TO-INHERITED-BUILDER-DEPENDENCY (logged):** the v18 design lock\'s fourth kebab action deferred. Honest implementation needs the builder to expose an `inheritedFallback` map alongside `cells` (so the component can distinguish "explicit-with-fallback" from "explicit-without"). Without that, the action is a label-only alias for "Clear row" -- dishonest UX. ~30 LOC across builder + smoke + component when picked up.',
  '- **Manual visual QA pending** on the kebab handlers (UI behavior, not covered by the pure-function smoke). Recommended click-through on a multi-agent tenant with manager hierarchy before production reliance. Specific behaviors: sticky-top header on tall matrices, focus trap in popover and kebab menu, inheritance lineage in popover banner, kebab actions converting inherited cells to amber-edited overrides, Copy-from-agent not transferring primary.',
  '- **Commits:** `d18578b` (Phase 1), `eac3afa` (Phase 2), `00a312b` (Phases 3+4 cumulative).'
];

const P3_OLD = P3_OLD_LINES.join(NL);
const P3_NEW = P3_NEW_LINES.join(NL);

const p3Idx = content.indexOf(P3_OLD);
if (p3Idx === -1) fail('P3 anchor (T4c-3 spec block) not found.');
const p3Count = content.split(P3_OLD).length - 1;
if (p3Count !== 1) fail('P3 anchor expected 1 match, found ' + p3Count);
content = content.slice(0, p3Idx) + P3_NEW + content.slice(p3Idx + P3_OLD.length);
console.log('P3 OK: T4c-3 spec block replaced with CLOSED summary (delta: ' + (P3_NEW.length - P3_OLD.length) + ' chars)');

// ===========================================================================
// Verify markers + write
// ===========================================================================

if (content.indexOf(V19_MARKER) === -1) fail('V19_MARKER missing.');
if (content.indexOf('T4c-3 \u2705 CLOSED v19') === -1) fail('T4c-3 closed marker missing.');
if (content.indexOf('F-RESET-TO-INHERITED-BUILDER-DEPENDENCY') === -1) fail('F-RESET marker missing.');
if (content.indexOf('**T4c-3 next, this working block**') !== -1) fail('Old "T4c-3 next" tail remnant present.');
if (content.indexOf('(DESIGN LOCKED v18: Q1=1') !== -1) fail('Old T4c-3 spec block remnant present.');

fs.writeFileSync(TRACKER, content, 'utf8');
console.log('WRITE OK: ' + TRACKER + ' (' + content.length + ' chars, delta: ' + (content.length - original.length) + ')');
console.log('DONE: v19 patch applied.');
