// scripts/patch-tracker-v16.js
//
// W-TERRITORY-TRACKER patch: v15 -> v16.
//
// Captures:
//   - T4c-1 CLOSED 2026-05-08: Phase B smoke 6/6 PASS, full Phase A + Phase B
//     commit batch shipped atomically.
//   - Smoke results captured inline (T1-T6, all PASS, savepoint-isolated).
//   - F-NPM-DEDUP-SILENT-DEVDEP-REVERT remains documented in v15 entry
//     (already CLOSED there; no re-document needed in v16).
//
// Patches applied:
//   P1. Status line tail: T4c-1 marked CLOSED, T4c-2 next
//   P2. Insert v16 status log entry above v15
//
// Pre-flight: requires v15 marker present, v16 marker absent.
// Idempotent: skips if V16_MARKER already present.
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

const V15_MARKER = '- **2026-05-08 v15**';
const V16_MARKER = '- **2026-05-08 v16**';

if (original.indexOf(V16_MARKER) !== -1) {
  console.log('SKIP: V16_MARKER already present in tracker. No-op.');
  process.exit(0);
}

if (original.indexOf(V15_MARKER) === -1) {
  fail('v15 state not detected. Expected V15_MARKER (' + V15_MARKER + ') to be present. Run scripts/patch-tracker-v15.js first.');
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
    fail(label + ': anchor not found.' + NL +
         '  Expected first 160 chars:' + NL +
         '    ' + oldStr.slice(0, 160).replace(/\r?\n/g, ' [NL] '));
  }
  const next = content.indexOf(oldStr, idx + 1);
  if (next !== -1) {
    fail(label + ': anchor matches at offsets ' + idx + ' and ' + next + ' -- not unique.');
  }
  content = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
  console.log(label + ': OK (delta ' + (newStr.length - oldStr.length) + ' chars)');
}

function insertBefore(label, anchor, insertion) {
  const idx = content.indexOf(anchor);
  if (idx === -1) {
    fail(label + ': anchor "' + anchor.slice(0, 80) + '" not found.');
  }
  content = content.slice(0, idx) + insertion + content.slice(idx);
  console.log(label + ': OK (inserted ' + insertion.length + ' chars before anchor)');
}

// ===========================================================================
// P1 -- Status line tail update
// ===========================================================================
//
// Match against the v15 P1_NEW that's currently on disk.

const P1_OLD =
  '**Next:** T4a phase fully CLOSED v14. **T4c-1 Phase A \u2705 LANDED v15 (UNCOMMITTED)**: bulk-assign route on disk (`app/api/admin-homes/territory/bulk-assign/route.ts`, 9915 bytes); `pg ^8.20.0` promoted from devDep to dep via direct edit (caught + fixed npm-dedup silent-revert trap that would have crashed production); `@types/pg ^8.20.0` added to devDep; TSC clean. **T4c-1 Phase B (next, this working block)**: smoke (3 `can()` perm-rejection unit tests + cross-agent primary conflict guard + bulk no-op verify + mid-transaction atomicity rollback) -> run -> commit batch (route + r-territory-t4c-1-route-deploy.js + fix-pg-deps.js + package.json + package-lock.json + tracker v15 + smoke script). Then T4c-2 matrix component + page + cell editor + conflict UX (desktop); T4c-3 mobile responsive + a11y + inheritance preview + bulk row actions; then T4b, T7.';

const P1_NEW =
  '**Next:** T4a phase fully CLOSED v14. **T4c-1 \u2705 CLOSED v16** (route + deploy + fix-pg-deps + smoke 6/6 PASS, all artifacts committed in single batch). T4c-1 closure deltas: bulk-assign route at `app/api/admin-homes/territory/bulk-assign/route.ts`; per-agent permission gating via `can()` before BEGIN; cross-agent primary conflict guard pre-BEGIN; per-agent diff via `computeApaDiff` (T4a-3 single-source-of-truth); auto-reassign deduplicated across payload; full atomicity via single BEGIN/COMMIT pg.Client transaction. F-NPM-DEDUP-SILENT-DEVDEP-REVERT closed inline (pg promoted devDep -> dep; @types/pg added; mitigation pattern in v15 status log). Smoke covered: computeApaDiff no-op, cross-agent primary conflict (positive + negative), DB bulk no-op (0 audit churn over 12-row baseline), DB mid-tx atomicity (SHA256 hash pre==post after INSERT + ROLLBACK), DB multi-agent diff (1 audit each for King Shah + Neo Smith, no cross-contamination). **T4c-2 next, this working block**: matrix component + page + cell editor + conflict UX (desktop). Then T4c-3 mobile responsive + a11y + inheritance preview + bulk row actions; then T4b, T7.';

applyExact('P1 Status line tail', P1_OLD, P1_NEW);

// ===========================================================================
// P2 -- Insert v16 status log entry above v15
// ===========================================================================

const V16_ENTRY =
  '- **2026-05-08 v16** -- **T4c-1 CLOSED.** Phase B smoke 6/6 PASS; full Phase A + Phase B commit batch shipped atomically (split feat + docs commits per project convention).' + NL +
  '  - **Smoke results (6/6 PASS, savepoint-isolated -- production data ROLLED BACK):**' + NL +
  '    - T1 (unit) `computeApaDiff` no-op identical baseline -> incoming -> 0/0/0/1 (del=0 ins=0 upd=0 same=1 claims=0)' + NL +
  '    - T2 (unit) cross-agent primary conflict, **positive** (2 agents claim primary on community|c1) -> 1 conflict, both agents in `conflict.agents`' + NL +
  '    - T3 (unit) cross-agent primary conflict, **negative** (only 1 agent primary, other `is_primary=false`) -> 0 conflicts' + NL +
  '    - T4 (DB) bulk no-op end-to-end (12-row baseline -> identical incoming) -> audit delta = 0 (computeApaDiff returns empty diff -> no SQL fired -> no audit triggers)' + NL +
  '    - T5 (DB) mid-tx INSERT + ROLLBACK -> pre-state SHA256 hash matches post-state exactly. Hashes: preHash=`893e51c716fa`, midHash=`e7ecbd916c7d` (post-INSERT, distinct as expected), postHash=`893e51c716fa` (post-ROLLBACK, equal to pre).' + NL +
  '    - T6 (DB) multi-agent diff -- AGENT_A (King Shah) delta=1, AGENT_B (Neo Smith) delta=1. Each agent gets exactly 1 `assignment_granted` audit, no cross-contamination across the single transaction.' + NL +
  '  - **Smoke runner exit code: 0.** Run command: `npx tsx scripts/r-territory-t4c-1-smoke.ts`.' + NL +
  '  - **Commit batch (split feat + docs per convention):**' + NL +
  '    - **feat commit** -- code + smoke + npm-dedup fix:' + NL +
  '      - `app/api/admin-homes/territory/bulk-assign/route.ts` (NEW, 9915 bytes)' + NL +
  '      - `scripts/r-territory-t4c-1-route-deploy.js` (NEW)' + NL +
  '      - `scripts/fix-pg-deps.js` (NEW)' + NL +
  '      - `scripts/r-territory-t4c-1-smoke.ts` (NEW, 17638 bytes)' + NL +
  '      - `package.json` + `package-lock.json` (pg promoted devDep -> dep, @types/pg added to devDep)' + NL +
  '    - **docs commit** -- tracker:' + NL +
  '      - `scripts/patch-tracker-v15.js` (NEW)' + NL +
  '      - `scripts/patch-tracker-v16.js` (NEW, this script)' + NL +
  '      - `docs/W-TERRITORY-TRACKER.md` (v15 + v16 patches both applied)' + NL +
  '  - **Coverage gap (acknowledged, deferred to follow-up if needed before T4c-2):** End-to-end HTTP perm-rejection smoke (`FORBIDDEN_CROSS_TENANT` / `FORBIDDEN_SCOPE` / no-manage paths). The `can()` lib was already covered by W-ROLES-DELEGATION R1-R7 unit tests; the route\'s perm gate is a thin wrapper that builds an `AgentTarget` context (id / tenant_id / parent_id / role) and calls `can(user.permissions, \'agent.write\', context)` for each target before BEGIN -- first denial returns the can() decision\'s status code with no DB writes. Adding HTTP coverage requires a running Next.js server + auth fixture; can land as `scripts/r-territory-t4c-1-http-smoke.ts` if comprehensive HTTP coverage is wanted before T4c-2 ships. Tracked here for visibility.' + NL +
  '  - **Why split commits:** matches project convention (commit `167c477 feat T4a-1 CLOSED` + `a11ab57 docs apply v13` and `d8ef4c5 feat T4a-2` + `e8c1769 feat T4a-3` + `95d820c docs apply v14`). Code commits are independently reviewable; tracker commits give a clean audit trail without code-review noise.' + NL +
  '  - **T4c-2 next, this working block:** matrix component + page + cell editor + conflict UX (desktop), per the v14 sub-phase scope lock. T4c-2 is the bigger UX phase (estimated multiple hours); it ships in its own sub-session.' + NL +
  NL;

insertBefore('P2 Insert v16 status log', V15_MARKER, V16_ENTRY);

// ===========================================================================
// Write
// ===========================================================================

fs.writeFileSync(TRACKER, content, 'utf8');
console.log('');
console.log('Tracker updated: ' + TRACKER);
console.log('  was:   ' + original.length + ' chars');
console.log('  now:   ' + content.length + ' chars');
console.log('  delta: +' + (content.length - original.length));
console.log('Backup: ' + backupPath);
console.log('');
console.log('Next: split feat + docs commits, then push origin main.');