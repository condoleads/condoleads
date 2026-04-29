// scripts/phase-7b-cleanup-2.js
//
// W-CREDITS Phase 7b — extended cleanup: remove redundant CharlieWidget
// session-init useEffect that was driving probe regression GET=4 vs target 1.
//
// File: app/charlie/components/CharlieWidget.tsx
//
// Why:
//   The CharlieWidget mount useEffect at lines 67-70 was W-RECOVERY A1.7's
//   "drive session init from useAuth" pattern. Now redundant because:
//   - CreditSessionProvider's main effect in components/credits/CreditSessionContext.tsx
//     already drives session init for both anon (loadAnonymousDefaults) and
//     registered users (loadSession), keyed on (userId, tenantId, pathname).
//   - Provider has its own dedupe via lastFetchKey ref.
//   - CharlieWidget's useEffect was firing the compatibility-stub initSession
//     on every render where pageContext or initSession (now a fresh-per-render
//     inline arrow) changed identity — multiple fires per page load.
//
// Probe regression:
//   Phase 7a baseline: / POST=2 GET=1
//   Phase 7b after first cleanup: / POST=0 GET=4
//   POST=0 is correct (D1 anonymous policy compliance — provider doesn't POST
//   for anon, original initSession did. Win.)
//   GET=4 is regression — caused by the redundant useEffect calling stub.refresh()
//   multiple times.
//
// Expected after this cleanup:
//   / POST=0 GET=1
//   /<building> POST=0 GET=1
//   Inert routes 0/0
//
// Edits:
//   D1: Delete the redundant mount useEffect (3 comment lines + 4 useEffect lines + trailing blank)
//   D2: Delete the dead sessionInitialized useRef declaration
//
// Note: post-register `initSession(data.user.id, pageContext)` call at lines
// 187-207 is intentionally LEFT IN PLACE. It's how registration triggers a
// session refresh through the compatibility stub. Phase 7c will migrate that
// call site to creditsCtx.refresh(pageContext) directly and finally remove
// the stub from useCharlie.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.resolve('app/charlie/components/CharlieWidget.tsx');

if (!fs.existsSync(FILE_PATH)) {
  console.error(`ERROR: File not found at ${FILE_PATH}`);
  process.exit(1);
}

const original = fs.readFileSync(FILE_PATH, 'utf8');
let content = original;
const applied = [];
const EOL = original.includes('\r\n') ? '\r\n' : '\n';

function applyEdit(name, regex, replacer) {
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const matches = content.match(new RegExp(regex.source, flags));
  const count = matches ? matches.length : 0;
  if (count !== 1) {
    console.error(
      `ERROR: ${name} anchor matched ${count} times (expected 1). Aborting without write.`
    );
    process.exit(1);
  }
  content = content.replace(regex, replacer);
  applied.push(name);
}

// ─── D1: Delete redundant mount useEffect + its 3-line comment block ──────
// Anchor: from `// W-RECOVERY A1.7 — drive session init` comment through the
// closing `}, [user?.id, initSession, pageContext])` of the useEffect, plus
// the trailing blank line.
applyEdit(
  'D1 (delete redundant mount useEffect)',
  /^[ \t]+\/\/ W-RECOVERY A1\.7[^\n]*drive session init[\s\S]*?\n[ \t]+\}, \[user\?\.id, initSession, pageContext\]\)\r?\n\r?\n/m,
  () => ''
);

// ─── D2: Delete dead sessionInitialized useRef declaration ────────────────
applyEdit(
  'D2 (delete dead sessionInitialized useRef)',
  /^[ \t]+const sessionInitialized = useRef\(false\)\r?\n/m,
  () => ''
);

// ─── Sanity: file should have shrunk ──────────────────────────────────────
if (content.length >= original.length) {
  console.error(
    `ERROR: File did not shrink (orig=${original.length}, new=${content.length}). ` +
    `Aborting without write.`
  );
  process.exit(1);
}

// ─── Write atomically ─────────────────────────────────────────────────────
const tmp = FILE_PATH + '.tmp';
fs.writeFileSync(tmp, content, 'utf8');
fs.renameSync(tmp, FILE_PATH);

// ─── Report ────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════');
console.log('W-CREDITS Phase 7b — extended cleanup applied');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`File:          ${FILE_PATH}`);
console.log(`Original size: ${original.length} chars`);
console.log(`New size:      ${content.length} chars`);
console.log(`Delta:         ${content.length - original.length} chars`);
console.log('');
console.log('Edits applied:');
applied.forEach(name => console.log(`  ✓ ${name}`));
console.log('');
console.log('Next steps:');
console.log('  1. npx tsc --noEmit   (must remain silent)');
console.log('  2. node scripts\\probe-phase-5.js');
console.log('     EXPECTED: / POST=0 GET=1, /<building> POST=0 GET=1, inert 0/0');
console.log('  3. Manual chat smoke (dev server):');
console.log('     a) Anon homepage → pills render');
console.log('     b) Sign in → pills populate');
console.log('     c) Send 1 chat → pill increments LIVE');
console.log('     d) Generate plan → plansUsed increments LIVE');
console.log('     e) Sign out → pills reset');
console.log('  4. If green: stage all 5 files, commit, push.');
console.log('');
console.log('Files to stage:');
console.log('  • app/charlie/hooks/useCharlie.ts');
console.log('  • components/credits/CreditSessionContext.tsx');
console.log('  • app/charlie/components/CharlieWidget.tsx');
console.log('  • scripts/phase-7b-usecharlie-migration.js');
console.log('  • scripts/phase-7b-cleanup.js');
console.log('  • scripts/phase-7b-cleanup-2.js');