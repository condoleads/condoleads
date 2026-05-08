// scripts/patch-tracker-v18.js
//
// W-TERRITORY-TRACKER patch: v17 -> v18.
//
// Captures:
//   - T4c-3 design lock executed (Q1=1 / Q2=1 / Q3=1 / Q4=1).
//   - Plumbing recon: inheritance fetch pattern from
//     app/admin-homes/agents/[id]/page.tsx is depth-1 parent-walk.
//     Matrix will mirror exactly for surface consistency.
//   - F-INHERITANCE-DEPTH-1 finding logged (sibling of
//     F-AREA-MANAGER-SUBTREE-DEPTH-INCONSISTENCY from v17).
//
// Patches:
//   P1. Insert v18 status log entry above v17.
//   P2. Replace T4c-3 stub in Next Action section with design-locked spec.
//
// Pre-flight: requires v17 marker present, v18 marker absent.
// Idempotent: skips if V18_MARKER already present.
// Atomic: all patches in memory, file written once at end.
// CRLF-preserving: explicit \r\n joins for new content.

const fs = require('fs');
const path = require('path');

const TRACKER = path.join('docs', 'W-TERRITORY-TRACKER.md');

function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }

if (!fs.existsSync(TRACKER)) fail(TRACKER + ' not found at ' + path.resolve(TRACKER));

const original = fs.readFileSync(TRACKER, 'utf8');

const V17_MARKER = '- **2026-05-08 v17**';
const V18_MARKER = '- **2026-05-08 v18**';

if (original.indexOf(V18_MARKER) !== -1) {
  console.log('SKIP: V18_MARKER already present. No-op.');
  process.exit(0);
}
if (original.indexOf(V17_MARKER) === -1) {
  fail('v17 state not detected. Run scripts/patch-tracker-v17.js first.');
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
// P1: Insert v18 status log entry above v17
// ===========================================================================

const P1_ANCHOR = '- **2026-05-08 v17** -- **T4c-2 CLOSED.**';

const V18_ENTRY_LINES = [
  '- **2026-05-08 v18** -- **T4c-3 DESIGN LOCK executed (Q1=1 / Q2=1 / Q3=1 / Q4=1).** Pre-coding probe complete; four product calls answered; inheritance plumbing pattern confirmed; T4c-3 stub in Next Action section replaced with design-locked spec. Code phases land in v19 with T4c-3 close.',
  '    - **Design lock answers:**',
  '      - Q1=1 mobile: horizontal scroll matrix with sticky first column (NOT per-agent accordion). Preserves matrix metaphor across breakpoints; smallest dev cost; cell popover editor unchanged.',
  '      - Q2=1 a11y: basic floor -- semantic `<table>` markup, `aria-label` on cell buttons, `role="dialog"` + focus trap + ESC on popover, visible focus rings. Sets a project-wide convention the codebase does not have today (admin-homes density across 8 components: 8 responsive hits / 2 a11y hits). Spreadsheet-grade keyboard navigation deferred unless a user surfaces the need.',
  '      - Q3=1 inheritance: cell tint (gray inherited / amber override / green own) + small `Lock` icon overlay on inherited-only cells. Matches `GeoAssignmentSection` color grammar so users see the same visual language across both surfaces. Split-cell rejected for vertical density; tap-to-reveal rejected for losing at-a-glance visibility.',
  '      - Q4=1 bulk row actions: per-row kebab (3-dot) menu -- "Set all primary / Clear row / Reset to inherited / Copy from agent...". 44px tap target; no extra column on already-tight mobile; multi-agent ops out of scope (T4c-1 bulk-assign route serves that).',
  '    - **Plumbing recon -- inheritance fetch pattern (read from `app/admin-homes/agents/[id]/page.tsx`):**',
  '      - When `agent.parent_id` is non-null, page does a single parent-walk via `Promise.all`: fetches parent agent name + parent active APA rows; passes both as props to `GeoAssignmentSection`.',
  '      - Depth-1 only -- no transitive walk through grandparents.',
  '      - Matrix route extension will mirror this exact pattern: per managed agent in payload with non-null `parent_id`, fetch parent APA rows scoped to tenant; merge into builder output as inherited cells. Consistency with single-agent surface beats depth-N "correctness" because divergence between two surfaces is worse than a shared quirk.',
  '    - **F-INHERITANCE-DEPTH-1 (logged, not blocking T4c-3):**',
  '      - **Mechanism:** both single-agent surface (`GeoAssignmentSection` via `app/admin-homes/agents/[id]/page.tsx`) and the upcoming matrix surface compute inherited APA rows by walking up exactly ONE level (`agent.parent_id`). Multi-level org structures (tenant -> area_manager -> manager -> managed_agent) leave a managed_agent\'s grand-ancestor APA rows invisible to inheritance preview.',
  '      - **Relationship to F-AREA-MANAGER-SUBTREE-DEPTH-INCONSISTENCY (v17):** sibling concern. v17 is about WHO an area_manager can see/edit (descendants); this is about WHOSE APA a managed_agent inherits from (ancestors). Different direction; identical depth-1 limit shape.',
  '      - **Likelihood:** benign for current tenants (most orgs are tenant -> manager -> agent, depth 1 covers them). Real bug latent in the data model for deeper structures.',
  '      - **Recommended fix:** transitively walk ancestors via a shared `getAncestorApa(agentId, tenantId)` helper in `lib/admin-homes/hierarchy.ts` (mirrors the `getDescendantIds` pattern with cycle detection + safety cap). MUST land in BOTH `agents/[id]/page.tsx` and the matrix route in the same patch to avoid surface divergence. Defer to dedicated patch when an affected tenant onboards.',
  ''
];

const V18_ENTRY = V18_ENTRY_LINES.join(NL) + NL;

const p1Idx = original.indexOf(P1_ANCHOR);
if (p1Idx === -1) fail('P1 anchor not found: ' + P1_ANCHOR);
const p1Count = original.split(P1_ANCHOR).length - 1;
if (p1Count !== 1) fail('P1 anchor expected exactly 1 match, found ' + p1Count);
const after_P1 = original.slice(0, p1Idx) + V18_ENTRY + original.slice(p1Idx);
console.log('P1 OK: v18 entry inserted above v17 (delta: +' + V18_ENTRY.length + ' chars)');

// ===========================================================================
// P2: Replace T4c-3 stub in Next Action section
// ===========================================================================

const P2_OLD_LINES = [
  '**T4c-3: Mobile + a11y**',
  '',
  '- Matrix collapses to stacked per-agent accordion on narrow viewports (each agent = expandable card with their geo rows).',
  '- Keyboard navigation: arrow keys move focus between cells; Enter toggles primary; space toggles access flags.',
  '- ARIA cell semantics throughout (table is the natural primitive). Loading states + empty states + error states audited.'
];
const P2_OLD = P2_OLD_LINES.join(NL);

const P2_NEW_LINES = [
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
const P2_NEW = P2_NEW_LINES.join(NL);

const p2Idx = after_P1.indexOf(P2_OLD);
if (p2Idx === -1) fail('P2 anchor (T4c-3 stub) not found.');
const p2Count = after_P1.split(P2_OLD).length - 1;
if (p2Count !== 1) fail('P2 anchor expected exactly 1 match, found ' + p2Count);
const after_P2 = after_P1.slice(0, p2Idx) + P2_NEW + after_P1.slice(p2Idx + P2_OLD.length);
const p2Delta = P2_NEW.length - P2_OLD.length;
console.log('P2 OK: T4c-3 stub replaced with design-locked spec (delta: ' + (p2Delta >= 0 ? '+' : '') + p2Delta + ' chars)');

// ===========================================================================
// Verify markers + write
// ===========================================================================

if (after_P2.indexOf(V18_MARKER) === -1) fail('V18_MARKER missing from final content.');
if (after_P2.indexOf('**T4c-3: Mobile + a11y**') !== -1) fail('Old T4c-3 stub still present.');
if (after_P2.indexOf('DESIGN LOCKED v18: Q1=1 / Q2=1 / Q3=1 / Q4=1') === -1) fail('New T4c-3 spec marker missing.');
if (after_P2.indexOf('F-INHERITANCE-DEPTH-1') === -1) fail('F-INHERITANCE-DEPTH-1 marker missing.');

fs.writeFileSync(TRACKER, after_P2, 'utf8');
console.log('WRITE OK: ' + TRACKER + ' (' + after_P2.length + ' chars, delta: ' + (after_P2.length - original.length) + ')');
console.log('DONE: v18 patch applied.');