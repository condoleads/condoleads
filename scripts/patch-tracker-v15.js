// scripts/patch-tracker-v15.js
//
// W-TERRITORY-TRACKER patch: v14 -> v15.
//
// Captures:
//   - T4c-1 Phase A LANDED 2026-05-08 (UNCOMMITTED; commit batches with Phase B smoke).
//       * app/api/admin-homes/territory/bulk-assign/route.ts (NEW, 9915 bytes)
//       * pg ^8.20.0 promoted from devDep to dep (production runtime fix)
//       * @types/pg ^8.20.0 added to devDep
//       * TSC clean
//   - F-NPM-DEDUP-SILENT-DEVDEP-REVERT discovered + closed inline:
//     `npm install <pkg> --save` silently strips a package from `dependencies`
//     when the same package already exists in `devDependencies`. Without
//     post-install verification, pg would have remained devDep-only and the
//     route would have crashed on first prod request (Vercel prunes devDeps).
//     Comprehensive mitigation: direct package.json edit + parsed re-read.
//
// Patches applied:
//   P1. Status line tail: reflect T4c-1 Phase A landed, Phase B next
//   P2. Insert v15 status log entry above v14
//        (full F-NPM-DEDUP mechanism + mitigation + workflow rule inline,
//         since formal Findings/Workflow-rules section anchors aren't
//         re-verified this turn -- promote to formal sections in v16 if
//         desired)
//
// Pre-flight: requires v14 marker present, v15 marker absent.
// Idempotent: skips if V15_MARKER already present.
// Atomic: all patches in memory, file written once at end on full success.
// CRLF-preserving: all new content joined with \r\n.

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

const V14_MARKER = '- **2026-05-08 v14**';
const V15_MARKER = '- **2026-05-08 v15**';

if (original.indexOf(V15_MARKER) !== -1) {
  console.log('SKIP: V15_MARKER already present in tracker. No-op.');
  process.exit(0);
}

if (original.indexOf(V14_MARKER) === -1) {
  fail('v14 state not detected. Expected V14_MARKER (' + V14_MARKER + ') to be present. Run scripts/patch-tracker-v14.js first.');
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
// EXACT match against the v14 P1_NEW that's currently on disk.

const P1_OLD =
  '**Next:** T4a-1 \u2705 + T4a-2 \u2705 + T4a-3 \u2705 + T4a-3b \u2705 all CLOSED v14 (full T4a phase done; coverage page + apa+tpa diff + resolver neighbourhood case all shipped + smoked). T4c phase opened with multi-tenant comprehensive scope: T4c-1 bulk-assign API route with per-agent permission gating + atomic transaction + smoke; T4c-2 matrix component + page + cell editor + conflict UX (desktop); T4c-3 mobile responsive + a11y + inheritance preview + bulk row actions. Then T4b, T7.';

const P1_NEW =
  '**Next:** T4a phase fully CLOSED v14. **T4c-1 Phase A \u2705 LANDED v15 (UNCOMMITTED)**: bulk-assign route on disk (`app/api/admin-homes/territory/bulk-assign/route.ts`, 9915 bytes); `pg ^8.20.0` promoted from devDep to dep via direct edit (caught + fixed npm-dedup silent-revert trap that would have crashed production); `@types/pg ^8.20.0` added to devDep; TSC clean. **T4c-1 Phase B (next, this working block)**: smoke (3 `can()` perm-rejection unit tests + cross-agent primary conflict guard + bulk no-op verify + mid-transaction atomicity rollback) -> run -> commit batch (route + r-territory-t4c-1-route-deploy.js + fix-pg-deps.js + package.json + package-lock.json + tracker v15 + smoke script). Then T4c-2 matrix component + page + cell editor + conflict UX (desktop); T4c-3 mobile responsive + a11y + inheritance preview + bulk row actions; then T4b, T7.';

applyExact('P1 Status line tail', P1_OLD, P1_NEW);

// ===========================================================================
// P2 -- Insert v15 status log entry above v14
// ===========================================================================

const V15_ENTRY =
  '- **2026-05-08 v15** -- **T4c-1 Phase A LANDED** (UNCOMMITTED; commit batches with Phase B smoke once smoke runs PASS). Bulk-assign route on disk; production runtime fix shipped (pg classification corrected); npm-dedup silent-revert trap caught and closed inline.' + NL +
  '  - **Files added (uncommitted):**' + NL +
  '    - `app/api/admin-homes/territory/bulk-assign/route.ts` (9915 bytes, NEW). Per-agent `can()` permission gating before any write; cross-agent primary conflict guard pre-BEGIN; per-agent diff via `computeApaDiff` (single source of truth, established T4a-3); auto-reassign deduplicated across payload; full atomicity via single BEGIN/COMMIT `pg.Client` transaction.' + NL +
  '    - `scripts/r-territory-t4c-1-route-deploy.js` (14800 bytes). Deploy script: package.json edit (add pg to deps) + route write with `flag: \'wx\'` (refuses overwrite). Ran successfully this session.' + NL +
  '    - `scripts/fix-pg-deps.js` (NEW). Comprehensive package.json fix script: removes pg from devDeps, keeps `^8.20.0` in deps, sorts both maps alphabetically, then runs `npm install --save-dev @types/pg` for TS declarations. Ran successfully.' + NL +
  '  - **package.json state (verified post-fix via parsed re-read):**' + NL +
  '    - `dependencies.pg = ^8.20.0`' + NL +
  '    - `devDependencies.pg = (empty)`' + NL +
  '    - `devDependencies.@types/pg = ^8.20.0`' + NL +
  '    - Two timestamped backups retained: `package.json.backup_20260508_100424` (pre-deploy) + `package.json.backup_20260508_100908` (pre-fix).' + NL +
  '  - **TSC verify:** `npx tsc --noEmit` clean (no errors).' + NL +
  '  - **Trap caught + closed inline -- F-NPM-DEDUP-SILENT-DEVDEP-REVERT:**' + NL +
  '    - **Mechanism:** When a package exists in both `dependencies` and `devDependencies` of `package.json`, `npm install <pkg> --save` silently REMOVES it from `dependencies` to keep the pre-existing `devDependencies` entry. The CLI emits a one-line warning (`Removing dependencies.<pkg> in favor of devDependencies.<pkg>`) that is easy to miss in a busy install log.' + NL +
  '    - **Impact (averted):** Without post-install verification, `pg` would have remained `devDependencies`-only. Vercel/Next.js production builds prune devDeps; the bulk-assign route\'s `import { Client } from \'pg\'` would have crashed on first request in production -- silent dev-time success, hard prod-time failure.' + NL +
  '    - **Root cause history:** `pg` was originally added 2026-02-28 in the migrate-bigint era as a devDep (one-shot DDL migration script). The T4c-1 deploy script tried to promote it to a runtime dep via `npm install pg --save`; npm dedup undid the move silently.' + NL +
  '    - **Comprehensive mitigation (`scripts/fix-pg-deps.js`):** (1) read package.json directly, (2) DELETE the misclassified `devDependencies.pg` entry so npm has no dedup target, (3) keep `^8.20.0` in `dependencies`, (4) write package.json sorted alphabetically, (5) `npm install --save-dev @types/pg` separately for TypeScript declarations, (6) verify post-fix via parsed re-read of both classification maps.' + NL +
  '    - **Workflow rule (going forward, all sessions):** *Never use `npm install <pkg> --save` to MOVE a package between `dependencies` and `devDependencies`.* The CLI\'s dedup logic strips one entry silently; direction depends on which entry already exists. Pattern: (a) edit `package.json` directly to remove the misclassified entry, (b) `npm install` (no `--save`) to reconcile lockfile, (c) verify via `Get-Content package.json | ConvertFrom-Json` re-read of both `.dependencies.<pkg>` and `.devDependencies.<pkg>`, (d) `npx tsc --noEmit` to confirm types still resolve. Always keep timestamped backups (`package.json.backup_<stamp>`) on every edit.' + NL +
  '  - **Why uncommitted:** Phase A artifacts (route + deploy script + fix script + package.json + package-lock.json + this v15 tracker patch) batch-commit alongside Phase B smoke once smoke runs PASS. We commit a verified working state, not a half-deployed one. Phase B is the next live action in this same working block.' + NL +
  NL;

insertBefore('P2 Insert v15 status log', V14_MARKER, V15_ENTRY);

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
console.log('Next: deliver Phase B smoke artifact, run smoke, commit batch.');