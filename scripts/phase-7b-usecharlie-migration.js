// scripts/phase-7b-usecharlie-migration.js
//
// W-CREDITS Phase 7b — useCharlie consumes CreditSessionContext.
//
// 15 atomic sub-edits implementing 11 logical changes, each behind a
// unique-match invariant. Aborts BEFORE writing if any anchor fails.
//
// File: app/charlie/hooks/useCharlie.ts
//
// Changes (logical):
//   1.  Add useCreditSession import
//   2.  Shrink CharlieState interface (drop 14 context-owned fields + 1 comment)
//   3.  Shrink INITIAL_STATE accordingly
//   4.  Add credits + creditsRef synced via useEffect (mirror tenantIdRef pattern)
//   5.  Delete walliamSessionIdRef + userIdRef declarations
//   6.  Delete entire initSession callback (lines 172-238 in original)
//   7.  Replace 3-second wait-loop with fail-fast on context loading/sessionId
//   8.  Replace VIP polling's initSession(uid, pctx) with creditsRef.current.refresh(pctx)
//   9.  Replace 800ms refetch hack with synchronous incrementMessageCount()
//   10. Add incrementPlansUsed(planType) at planReady success site
//   11. Update return statement (drop initSession, spread context fields — Tactic A)
//
// Bulk replaces (last steps, after structural edits):
//   E8: walliamSessionIdRef.current → creditsRef.current.state.sessionId (expect 2)
//   E9: userIdRef.current           → creditsRef.current.state.userId    (expect 4)

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.resolve('app/charlie/hooks/useCharlie.ts');

if (!fs.existsSync(FILE_PATH)) {
  console.error(`ERROR: File not found at ${FILE_PATH}`);
  process.exit(1);
}

const original = fs.readFileSync(FILE_PATH, 'utf8');
let content = original;
const applied = [];

// Detect existing line ending convention (CRLF on Windows / LF elsewhere)
const EOL = original.includes('\r\n') ? '\r\n' : '\n';

function applyEdit(name, regex, replacer) {
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const matches = content.match(new RegExp(regex.source, flags));
  const count = matches ? matches.length : 0;
  if (count !== 1) {
    console.error(
      `ERROR: ${name} anchor matched ${count} times (expected 1). ` +
      `File may have changed since recon. Aborting without write.`
    );
    process.exit(1);
  }
  content = content.replace(regex, replacer);
  applied.push(name);
}

function bulkReplace(name, regex, replacement, expectedCount) {
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const r = new RegExp(regex.source, flags);
  const matches = content.match(r);
  const count = matches ? matches.length : 0;
  if (count !== expectedCount) {
    console.error(
      `ERROR: ${name} bulk replace matched ${count} times (expected ${expectedCount}). ` +
      `Aborting without write.`
    );
    process.exit(1);
  }
  content = content.replace(new RegExp(regex.source, flags), replacement);
  applied.push(`${name} (${count} replacements)`);
}

// ─── E1: Add useCreditSession import after useTenantId import ─────────────
applyEdit(
  'E1 (add useCreditSession import)',
  /^import \{ useTenantId \} from '@\/hooks\/useTenantId'\r?\n/m,
  () => `import { useTenantId } from '@/hooks/useTenantId'${EOL}import { useCreditSession } from '@/components/credits/CreditSessionContext'${EOL}`
);

// ─── E2A: Drop CharlieState credit fields (lines 54-71 in original) ───────
applyEdit(
  'E2A (drop CharlieState credit fields)',
  /^[ \t]+\/\/ WALLiam session\r?\n[ \t]+sessionId: string \| null\r?\n[ \t]+userId: string \| null\r?\n[ \t]+buyerPlansUsed: number\r?\n[ \t]+sellerPlansUsed: number\r?\n[ \t]+totalAllowed: number\r?\n[ \t]+\/\/ Chat credits\r?\n[ \t]+messageCount: number\r?\n[ \t]+chatFreeMessages: number\r?\n[ \t]+chatHardCap: number\r?\n[ \t]+\/\/ Estimator credits\r?\n[ \t]+estimatorCount: number\r?\n[ \t]+estimatorFreeAttempts: number\r?\n[ \t]+estimatorHardCap: number\r?\n[ \t]+\/\/ Plan mode\r?\n[ \t]+planMode: 'shared' \| 'independent'\r?\n[ \t]+sellerPlanFreeAttempts: number\r?\n[ \t]+isRegistered: boolean\r?\n/m,
  () => ''
);

// ─── E2B: Drop CharlieState assistantName + comment ───────────────────────
applyEdit(
  'E2B (drop CharlieState assistantName)',
  /^[ \t]+\/\/ Assistant name \(per-tenant\)\r?\n[ \t]+assistantName: string\r?\n/m,
  () => ''
);

// ─── E3A: Drop INITIAL_STATE credit fields ────────────────────────────────
applyEdit(
  'E3A (drop INITIAL_STATE credit fields)',
  /^[ \t]+sessionId: null,\r?\n[ \t]+userId: null,\r?\n[ \t]+buyerPlansUsed: 0,\r?\n[ \t]+sellerPlansUsed: 0,\r?\n[ \t]+totalAllowed: 1,\r?\n[ \t]+messageCount: 0,\r?\n[ \t]+chatFreeMessages: 5,\r?\n[ \t]+chatHardCap: 25,\r?\n[ \t]+estimatorCount: 0,\r?\n[ \t]+estimatorFreeAttempts: 2,\r?\n[ \t]+estimatorHardCap: 10,\r?\n[ \t]+planMode: 'shared',\r?\n[ \t]+sellerPlanFreeAttempts: 1,\r?\n[ \t]+isRegistered: false,\r?\n/m,
  () => ''
);

// ─── E3B: Drop INITIAL_STATE assistantName ────────────────────────────────
applyEdit(
  'E3B (drop INITIAL_STATE assistantName)',
  /^[ \t]+assistantName: 'Charlie',\r?\n/m,
  () => ''
);

// ─── E4: Add credits + creditsRef after tenantIdRef useEffect ─────────────
applyEdit(
  'E4 (add credits + creditsRef)',
  /^([ \t]+)useEffect\(\(\) => \{ tenantIdRef\.current = tenantId \}, \[tenantId\]\)\r?\n/m,
  (_m, indent) =>
    `${indent}useEffect(() => { tenantIdRef.current = tenantId }, [tenantId])${EOL}` +
    `${indent}const credits = useCreditSession()${EOL}` +
    `${indent}const creditsRef = useRef(credits)${EOL}` +
    `${indent}useEffect(() => { creditsRef.current = credits }, [credits])${EOL}`
);

// ─── E5: Delete walliamSessionIdRef + userIdRef declarations + comment ────
applyEdit(
  'E5 (delete walliamSessionIdRef + userIdRef)',
  /^[ \t]+\/\/ WALLiam session ref\r?\n[ \t]+const walliamSessionIdRef = useRef<string \| null>\(null\)\r?\n[ \t]+const userIdRef = useRef<string \| null>\(null\)\r?\n/m,
  () => ''
);

// ─── E6: Delete entire initSession callback (lines 172-238 in original) ───
// Anchor: from `const initSession = useCallback(async (` through matching
// closing `}, [])` at the same indent level, plus trailing blank line.
// Uses [\s\S]*? non-greedy to traverse the multi-line body.
applyEdit(
  'E6 (delete initSession callback)',
  /^([ \t]+)const initSession = useCallback\(async \([\s\S]*?\n\1\}, \[\]\)\r?\n\r?\n/m,
  () => ''
);

// ─── E7: Replace 3-second wait-loop with fail-fast on context state ───────
// Anchor on the unique comment fragment "wait for sessionId" rather than
// embedding em-dash characters that can survive copy-paste poorly.
applyEdit(
  'E7 (replace wait-loop with fail-fast)',
  /^([ \t]+)\/\/ W-RECOVERY A1\.7[^\n]*wait for sessionId[^\n]*\r?\n[\s\S]*?return\r?\n[ \t]+\}\r?\n\r?\n/m,
  (_m, indent) =>
    `${indent}// W-CREDITS Phase 7b — fail-fast on context not ready${EOL}` +
    `${indent}if (creditsRef.current.state.loading || !creditsRef.current.state.sessionId) {${EOL}` +
    `${indent}  console.error('[useCharlie] credit session not ready — aborting send')${EOL}` +
    `${indent}  setState(s => ({ ...s, isStreaming: false }))${EOL}` +
    `${indent}  return${EOL}` +
    `${indent}}${EOL}${EOL}`
);

// ─── E10: Replace VIP polling's initSession(uid, pctx) call ───────────────
applyEdit(
  'E10 (replace VIP polling initSession call)',
  /^([ \t]+)if \(uid\) await initSession\(uid, pctx\)$/m,
  (_m, indent) => `${indent}if (uid) await creditsRef.current.refresh(pctx)`
);

// ─── E11: Replace 800ms refetch hack with synchronous increment ───────────
applyEdit(
  'E11 (replace 800ms refetch hack)',
  /^([ \t]+)\/\/ Refresh credits after every response[\s\S]*?if \(uid\) setTimeout\(\(\) => initSession\(uid, pctx\)\.catch\(\(\) => \{\}\), 800\)/m,
  (_m, indent) =>
    `${indent}// W-CREDITS Phase 7b — synchronous local increment, no refetch${EOL}` +
    `${indent}creditsRef.current.incrementMessageCount()`
);

// ─── E12: Add incrementPlansUsed after planReady setState ─────────────────
// Captures the entire planReady setState line and appends a new line right
// after it. Uses [^\n]*? to constrain the match to a single line.
applyEdit(
  'E12 (add incrementPlansUsed after planReady setState)',
  /^([ \t]+)(setState\(s => \(\{ \.\.\.s, planReady: true,[^\n]*?\}\)\))$/m,
  (_m, indent, setStateCall) =>
    `${indent}${setStateCall}${EOL}` +
    `${indent}creditsRef.current.incrementPlansUsed(data.type === 'seller' ? 'seller' : 'buyer')`
);

// ─── E13: Update return statement (drop initSession, spread context state) ─
// Tactic A: useCharlie publishes a flat `state` shape that includes both its
// own local state and the context-owned fields. CharlieOverlay + CharlieWidget
// see no API change.
applyEdit(
  'E13 (update return statement)',
  /^([ \t]+)return \{\r?\n[ \t]+state,\r?\n[ \t]+open,\r?\n[ \t]+close,\r?\n[ \t]+sendMessage,\r?\n[ \t]+setActivePanel,\r?\n[ \t]+setSellerEstimate,\r?\n[ \t]+setGeoContext,\r?\n[ \t]+initSession,\r?\n[ \t]+dismissGate,\r?\n[ \t]+setPageContext,\r?\n[ \t]+requestVipAccess,\r?\n[ \t]+setLeadCaptured,\r?\n[ \t]+resumeAfterGate,\r?\n[ \t]+\}\r?\n/m,
  (_m, indent) => {
    const inner = indent + '  ';
    const innerInner = indent + '    ';
    return (
      `${indent}return {${EOL}` +
      `${inner}state: {${EOL}` +
      `${innerInner}...state,${EOL}` +
      `${innerInner}sessionId: credits.state.sessionId,${EOL}` +
      `${innerInner}userId: credits.state.userId,${EOL}` +
      `${innerInner}isRegistered: credits.state.isRegistered,${EOL}` +
      `${innerInner}assistantName: credits.state.assistantName,${EOL}` +
      `${innerInner}messageCount: credits.state.messageCount,${EOL}` +
      `${innerInner}chatFreeMessages: credits.state.chatFreeMessages,${EOL}` +
      `${innerInner}chatHardCap: credits.state.chatHardCap,${EOL}` +
      `${innerInner}buyerPlansUsed: credits.state.buyerPlansUsed,${EOL}` +
      `${innerInner}sellerPlansUsed: credits.state.sellerPlansUsed,${EOL}` +
      `${innerInner}totalAllowed: credits.state.totalAllowed,${EOL}` +
      `${innerInner}planMode: credits.state.planMode,${EOL}` +
      `${innerInner}sellerPlanFreeAttempts: credits.state.sellerPlanFreeAttempts,${EOL}` +
      `${innerInner}estimatorCount: credits.state.estimatorCount,${EOL}` +
      `${innerInner}estimatorFreeAttempts: credits.state.estimatorFreeAttempts,${EOL}` +
      `${innerInner}estimatorHardCap: credits.state.estimatorHardCap,${EOL}` +
      `${inner}},${EOL}` +
      `${inner}open,${EOL}` +
      `${inner}close,${EOL}` +
      `${inner}sendMessage,${EOL}` +
      `${inner}setActivePanel,${EOL}` +
      `${inner}setSellerEstimate,${EOL}` +
      `${inner}setGeoContext,${EOL}` +
      `${inner}dismissGate,${EOL}` +
      `${inner}setPageContext,${EOL}` +
      `${inner}requestVipAccess,${EOL}` +
      `${inner}setLeadCaptured,${EOL}` +
      `${inner}resumeAfterGate,${EOL}` +
      `${indent}}${EOL}`
    );
  }
);

// ─── E8: Bulk replace remaining walliamSessionIdRef.current ───────────────
// Expected after E5+E6+E7 cleanup: 2 occurrences (lines 249 and 394 in original)
bulkReplace(
  'E8 (bulk replace walliamSessionIdRef.current)',
  /walliamSessionIdRef\.current/g,
  'creditsRef.current.state.sessionId',
  2
);

// ─── E9: Bulk replace remaining userIdRef.current ─────────────────────────
// Expected after E6+E11 cleanup: 4 occurrences (lines 284, 340, 395, 435)
bulkReplace(
  'E9 (bulk replace userIdRef.current)',
  /userIdRef\.current/g,
  'creditsRef.current.state.userId',
  4
);

// ─── Sanity: file should have changed ─────────────────────────────────────
if (content === original) {
  console.error('ERROR: Content unchanged after all edits. Aborting without write.');
  process.exit(1);
}

// ─── Write atomically: tmp file → rename ──────────────────────────────────
const tmp = FILE_PATH + '.tmp';
fs.writeFileSync(tmp, content, 'utf8');
fs.renameSync(tmp, FILE_PATH);

// ─── Report ────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════');
console.log('W-CREDITS Phase 7b — useCharlie migration applied');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`File:          ${FILE_PATH}`);
console.log(`Original size: ${original.length} chars`);
console.log(`New size:      ${content.length} chars`);
const delta = content.length - original.length;
console.log(`Delta:         ${delta >= 0 ? '+' : ''}${delta} chars`);
console.log('');
console.log('Edits applied (each verified unique-match before apply):');
applied.forEach(name => console.log(`  ✓ ${name}`));
console.log('');
console.log('Architectural changes:');
console.log('  • walliamSessionIdRef + userIdRef → creditsRef.current.state');
console.log('  • initSession callback → provider owns init via main effect');
console.log('  • 3s wait-loop → fail-fast on creditsRef.current.state.loading');
console.log('  • 800ms post-chat refetch → sync creditsRef.current.incrementMessageCount()');
console.log('  • plan tool success → creditsRef.current.incrementPlansUsed(planType)');
console.log('  • Return state spreads context fields (Tactic A — consumers unchanged)');
console.log('');
console.log('Next steps:');
console.log('  1. npx tsc --noEmit   (must be silent)');
console.log('  2. git --no-pager diff app/charlie/hooks/useCharlie.ts | Measure-Object -Line');
console.log('  3. node scripts\\probe-phase-5.js');
console.log('     EXPECTED: identical Phase 7a baseline numbers');
console.log('     (chat-flow behavior change does not show in page-load probe)');
console.log('  4. Manual chat smoke (dev server running):');
console.log('     a) Open homepage as anon → verify pills render');
console.log('     b) Register/sign in → verify pills populate, no console errors');
console.log('     c) Send 1 chat message → verify pill increments LIVE without page refresh');
console.log('        (NEW positive behavior — Phase 7a did not have this)');
console.log('     d) Generate a plan → verify plansUsed increments LIVE');
console.log('     e) Sign out → verify pills reset to defaults');
console.log('  5. If all green: stage, commit, push.');
console.log('');
console.log('Commit message:');
console.log('  refactor(credits): useCharlie consumes CreditSessionContext, removes duplicate session ownership');