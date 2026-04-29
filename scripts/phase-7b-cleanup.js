// scripts/phase-7b-cleanup.js
//
// W-CREDITS Phase 7b — cleanup of TSC errors after the migration script.
//
// Files modified:
//   1. app/charlie/hooks/useCharlie.ts
//      - Restore CharlieState credit fields + assistantName (un-shrink interface)
//      - Restore INITIAL_STATE credit fields + assistantName
//      - Replace 2 stateRef.current refs (sessionId, userId) with creditsRef refs
//      - Add initSession compatibility stub in return statement
//   2. components/credits/CreditSessionContext.tsx
//      - Update refresh type signature in CreditSessionContextValue interface
//        (Phase 7a runtime had it but the type was missed)
//
// Why un-shrink the interface: CharlieOverlay imports CharlieState as a TYPE
// for its prop. The shrunk interface broke 18 places. Tactic A still merges
// context fields into the returned state at runtime; the unused local fields
// stay at INITIAL_STATE defaults and are overridden by the spread. Cleaner
// path than touching CharlieOverlay.
//
// Why initSession stub: CharlieWidget destructures `initSession` and calls it
// in the post-register flow. Removing it requires Phase 7c's CharlieWidget
// migration. The stub forwards to creditsRef.current.refresh(pageContext)
// while waiting for AuthContext to propagate the new user. Phase 7c will
// remove the stub when CharlieWidget itself migrates to creditsCtx.refresh.

const fs = require('fs');
const path = require('path');

const HOOK_PATH = path.resolve('app/charlie/hooks/useCharlie.ts');
const PROVIDER_PATH = path.resolve('components/credits/CreditSessionContext.tsx');

const PAGE_CTX_TYPE =
  '{ listing_id?: string; building_id?: string; community_id?: string; municipality_id?: string; area_id?: string }';

function loadAndPrep(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: ${label} not found at ${filePath}`);
    process.exit(1);
  }
  const original = fs.readFileSync(filePath, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  return { filePath, label, original, content: original, eol, applied: [] };
}

function applyEdit(file, name, regex, replacer) {
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const matches = file.content.match(new RegExp(regex.source, flags));
  const count = matches ? matches.length : 0;
  if (count !== 1) {
    console.error(
      `ERROR [${file.label}]: ${name} anchor matched ${count} times (expected 1). Aborting.`
    );
    process.exit(1);
  }
  file.content = file.content.replace(regex, replacer);
  file.applied.push(name);
}

function writeIfChanged(file) {
  if (file.content === file.original) {
    console.error(`ERROR [${file.label}]: content unchanged. Aborting.`);
    process.exit(1);
  }
  const tmp = file.filePath + '.tmp';
  fs.writeFileSync(tmp, file.content, 'utf8');
  fs.renameSync(tmp, file.filePath);
}

function reportFile(file) {
  console.log('───────────────────────────────────────────────────────────────────');
  console.log(`File: ${file.filePath}`);
  console.log(`Original size: ${file.original.length} chars`);
  console.log(`New size:      ${file.content.length} chars`);
  const delta = file.content.length - file.original.length;
  console.log(`Delta:         ${delta >= 0 ? '+' : ''}${delta} chars`);
  console.log('Edits applied:');
  file.applied.forEach(name => console.log(`  ✓ ${name}`));
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE 1: app/charlie/hooks/useCharlie.ts
// ═══════════════════════════════════════════════════════════════════════════

const hook = loadAndPrep(HOOK_PATH, 'useCharlie.ts');

// ─── C1A: Restore CharlieState credit fields ──────────────────────────────
// Anchor on `// Gate state` comment (unique inside CharlieState interface).
applyEdit(hook,
  'C1A (restore CharlieState credit fields)',
  /^([ \t]+)\/\/ Gate state\r?\n/m,
  (_m, indent) => {
    const E = hook.eol;
    return (
      `${indent}// WALLiam session${E}` +
      `${indent}sessionId: string | null${E}` +
      `${indent}userId: string | null${E}` +
      `${indent}buyerPlansUsed: number${E}` +
      `${indent}sellerPlansUsed: number${E}` +
      `${indent}totalAllowed: number${E}` +
      `${indent}// Chat credits${E}` +
      `${indent}messageCount: number${E}` +
      `${indent}chatFreeMessages: number${E}` +
      `${indent}chatHardCap: number${E}` +
      `${indent}// Estimator credits${E}` +
      `${indent}estimatorCount: number${E}` +
      `${indent}estimatorFreeAttempts: number${E}` +
      `${indent}estimatorHardCap: number${E}` +
      `${indent}// Plan mode${E}` +
      `${indent}planMode: 'shared' | 'independent'${E}` +
      `${indent}sellerPlanFreeAttempts: number${E}` +
      `${indent}isRegistered: boolean${E}` +
      `${indent}// Gate state${E}`
    );
  }
);

// ─── C1B: Restore CharlieState assistantName ──────────────────────────────
// Anchor on `blocks: ConversationBlock[]` followed by closing `}` of interface.
applyEdit(hook,
  'C1B (restore CharlieState assistantName)',
  /^([ \t]+)blocks: ConversationBlock\[\]\r?\n\}\r?\n/m,
  (_m, indent) => {
    const E = hook.eol;
    return (
      `${indent}blocks: ConversationBlock[]${E}` +
      `${indent}// Assistant name (per-tenant)${E}` +
      `${indent}assistantName: string${E}` +
      `}${E}`
    );
  }
);

// ─── C2A: Restore INITIAL_STATE credit fields ─────────────────────────────
// Anchor on `sellerEstimate: null,` (the field immediately preceding the
// deleted credit block in INITIAL_STATE) followed by `gateActive: false,`.
applyEdit(hook,
  'C2A (restore INITIAL_STATE credit fields)',
  /^([ \t]+)sellerEstimate: null,\r?\n([ \t]+)gateActive: false,\r?\n/m,
  (_m, indent1, indent2) => {
    const E = hook.eol;
    return (
      `${indent1}sellerEstimate: null,${E}` +
      `${indent1}sessionId: null,${E}` +
      `${indent1}userId: null,${E}` +
      `${indent1}buyerPlansUsed: 0,${E}` +
      `${indent1}sellerPlansUsed: 0,${E}` +
      `${indent1}totalAllowed: 1,${E}` +
      `${indent1}messageCount: 0,${E}` +
      `${indent1}chatFreeMessages: 5,${E}` +
      `${indent1}chatHardCap: 25,${E}` +
      `${indent1}estimatorCount: 0,${E}` +
      `${indent1}estimatorFreeAttempts: 2,${E}` +
      `${indent1}estimatorHardCap: 10,${E}` +
      `${indent1}planMode: 'shared',${E}` +
      `${indent1}sellerPlanFreeAttempts: 1,${E}` +
      `${indent1}isRegistered: false,${E}` +
      `${indent2}gateActive: false,${E}`
    );
  }
);

// ─── C2B: Restore INITIAL_STATE assistantName ─────────────────────────────
// Anchor on `blocks: [],` (INITIAL_STATE only) + closing `}`.
applyEdit(hook,
  'C2B (restore INITIAL_STATE assistantName)',
  /^([ \t]+)blocks: \[\],\r?\n\}\r?\n/m,
  (_m, indent) => {
    const E = hook.eol;
    return (
      `${indent}blocks: [],${E}` +
      `${indent}assistantName: 'Charlie',${E}` +
      `}${E}`
    );
  }
);

// ─── C3A: Fix stateRef.current.sessionId in plan-email body ───────────────
applyEdit(hook,
  'C3A (fix stateRef.current.sessionId)',
  /^([ \t]+)sessionId: stateRef\.current\.sessionId,$/m,
  (_m, indent) => `${indent}sessionId: creditsRef.current.state.sessionId,`
);

// ─── C3B: Fix stateRef.current.userId in plan-email body ──────────────────
applyEdit(hook,
  'C3B (fix stateRef.current.userId)',
  /^([ \t]+)userId: stateRef\.current\.userId,$/m,
  (_m, indent) => `${indent}userId: creditsRef.current.state.userId,`
);

// ─── C4: Add initSession compatibility stub in return statement ───────────
// Inserts between setGeoContext and dismissGate. The stub waits briefly for
// AuthContext to propagate the registered user, then calls refresh(pageContext).
// Phase 7c will remove this stub when CharlieWidget migrates directly to
// creditsCtx.refresh().
applyEdit(hook,
  'C4 (add initSession compatibility stub)',
  /^([ \t]+)setGeoContext,\r?\n([ \t]+)dismissGate,\r?\n/m,
  (_m, indent1, indent2) => {
    const E = hook.eol;
    return (
      `${indent1}setGeoContext,${E}` +
      `${indent2}// Phase 7b compatibility stub. CharlieWidget still calls initSession in its${E}` +
      `${indent2}// post-register flow. Phase 7c removes this when CharlieWidget migrates to${E}` +
      `${indent2}// creditsCtx.refresh() directly. Wait briefly for AuthContext to propagate${E}` +
      `${indent2}// the new user (Supabase cookie race), then refresh through provider.${E}` +
      `${indent2}initSession: async (uid: string | null, pageContext?: any) => {${E}` +
      `${indent2}  let waitMs = 0${E}` +
      `${indent2}  while (uid && !creditsRef.current.state.userId && waitMs < 3000) {${E}` +
      `${indent2}    await new Promise(r => setTimeout(r, 100))${E}` +
      `${indent2}    waitMs += 100${E}` +
      `${indent2}  }${E}` +
      `${indent2}  await creditsRef.current.refresh(pageContext)${E}` +
      `${indent2}},${E}` +
      `${indent2}dismissGate,${E}`
    );
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// FILE 2: components/credits/CreditSessionContext.tsx
// ═══════════════════════════════════════════════════════════════════════════

const provider = loadAndPrep(PROVIDER_PATH, 'CreditSessionContext.tsx');

// ─── C5: Update CreditSessionContextValue.refresh type signature ──────────
// Phase 7a updated the runtime signature but missed the TS interface.
applyEdit(provider,
  'C5 (update CreditSessionContextValue.refresh type)',
  /^([ \t]+)refresh: \(\) => Promise<void>$/m,
  (_m, indent) => `${indent}refresh: (pageContext?: ${PAGE_CTX_TYPE}) => Promise<void>`
);

// ═══════════════════════════════════════════════════════════════════════════
// WRITE
// ═══════════════════════════════════════════════════════════════════════════

writeIfChanged(hook);
writeIfChanged(provider);

// ═══════════════════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════════');
console.log('W-CREDITS Phase 7b — cleanup applied');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');
reportFile(hook);
reportFile(provider);
console.log('Total edits: ' + (hook.applied.length + provider.applied.length));
console.log('');
console.log('Next steps:');
console.log('  1. npx tsc --noEmit   (must be silent — was 22 errors before cleanup)');
console.log('  2. node scripts\\probe-phase-5.js   (must match Phase 7a baseline)');
console.log('  3. Manual chat smoke (dev server):');
console.log('     a) Anonymous load → pills render');
console.log('     b) Register → pills populate, no console errors');
console.log('     c) Send 1 chat message → pill increments LIVE without page refresh (NEW)');
console.log('     d) Send 1 plan request → plansUsed increments LIVE');
console.log('     e) Sign out → pills reset');
console.log('  4. If green: stage all 4 files, commit, push.');
console.log('');
console.log('Files to stage:');
console.log('  • app/charlie/hooks/useCharlie.ts');
console.log('  • components/credits/CreditSessionContext.tsx');
console.log('  • scripts/phase-7b-usecharlie-migration.js');
console.log('  • scripts/phase-7b-cleanup.js');