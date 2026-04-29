// scripts/phase-7a-provider-extension.js
//
// W-CREDITS Phase 7a — Provider extension to support per-call pageContext.
//
// Purpose: extend loadSession() and refresh() in CreditSessionContext.tsx
//   to accept an optional pageContext arg, propagated to the existing
//   POST /api/walliam/charlie/session call body. Existing call sites pass
//   nothing → behavior unchanged. Phase 7c will introduce the new call
//   site (CharlieWidget onSuccess passes pageContext) which restores
//   session-row tagging at the registration moment.
//
// File: components/credits/CreditSessionContext.tsx
// Edits: 4 surgical regex-anchored changes.
// Safety: every edit asserts unique-match (count === 1) before applying.
// Indentation: regex captures (\s*) so original whitespace is preserved.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.resolve('components/credits/CreditSessionContext.tsx');
const PAGE_CONTEXT_TYPE =
  '{ listing_id?: string; building_id?: string; community_id?: string; municipality_id?: string; area_id?: string }';

if (!fs.existsSync(FILE_PATH)) {
  console.error(`ERROR: File not found at ${FILE_PATH}`);
  process.exit(1);
}

const original = fs.readFileSync(FILE_PATH, 'utf8');
let content = original;
const applied = [];

// Detect the file's existing line ending convention. The repo on Windows
// has CRLF on disk (per .gitattributes auto-conversion). We must emit
// the same EOL in our inserts to avoid mixed line endings.
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

// ─── Edit 1: loadSession signature ─────────────────────────────────────────
// OLD:  const loadSession = useCallback(async (uid: string, tid: string) => {
// NEW:  const loadSession = useCallback(async (uid: string, tid: string, pageContext?: {...}) => {
applyEdit(
  'Edit 1 (loadSession signature)',
  /^(\s*)const loadSession = useCallback\(async \(uid: string, tid: string\) => \{$/m,
  (_m, indent) =>
    `${indent}const loadSession = useCallback(async (uid: string, tid: string, pageContext?: ${PAGE_CONTEXT_TYPE}) => {`
);

// ─── Edit 2: loadSession fetch body — hardcoded nulls → pageContext optional ─
// Anchor: ^([ \t]+) with `m` flag captures ONLY the line's indent (spaces/tabs),
// not the preceding line terminator. Earlier version used (\s+) which greedily
// consumed the preceding \r\n along with the indent, producing blank lines on
// reinsert. EOL detected from file is used for inter-line breaks.
applyEdit(
  'Edit 2 (loadSession body — pageContext propagation)',
  /^([ \t]+)listing_id: null,\r?\n[ \t]+building_id: null,\r?\n[ \t]+community_id: null,\r?\n[ \t]+municipality_id: null,\r?\n[ \t]+area_id: null,/m,
  (_m, indent) =>
    `${indent}listing_id: pageContext?.listing_id || null,${EOL}` +
    `${indent}building_id: pageContext?.building_id || null,${EOL}` +
    `${indent}community_id: pageContext?.community_id || null,${EOL}` +
    `${indent}municipality_id: pageContext?.municipality_id || null,${EOL}` +
    `${indent}area_id: pageContext?.area_id || null,`
);

// ─── Edit 3a: refresh signature ────────────────────────────────────────────
// OLD:  const refresh = useCallback(async () => {
// NEW:  const refresh = useCallback(async (pageContext?: {...}) => {
applyEdit(
  'Edit 3a (refresh signature)',
  /^(\s*)const refresh = useCallback\(async \(\) => \{$/m,
  (_m, indent) =>
    `${indent}const refresh = useCallback(async (pageContext?: ${PAGE_CONTEXT_TYPE}) => {`
);

// ─── Edit 3b: refresh body — propagate pageContext to loadSession ──────────
// Anchor: `await loadSession(userId, tenantId)`. The main effect at line ~214
// calls loadSession WITHOUT await, so this anchor is unique to the refresh function.
applyEdit(
  'Edit 3b (refresh body — propagate to loadSession)',
  /^(\s*)await loadSession\(userId, tenantId\)$/m,
  (_m, indent) => `${indent}await loadSession(userId, tenantId, pageContext)`
);

// ─── Sanity: file should have grown (we only added, never removed) ────────
if (content.length <= original.length) {
  console.error(
    `ERROR: File did not grow (orig=${original.length}, new=${content.length}). ` +
    `Aborting without write.`
  );
  process.exit(1);
}

// ─── Write atomically: tmp file → rename ──────────────────────────────────
const tmp = FILE_PATH + '.tmp';
fs.writeFileSync(tmp, content, 'utf8');
fs.renameSync(tmp, FILE_PATH);

// ─── Report ────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════');
console.log('W-CREDITS Phase 7a — Provider extension applied');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`File:          ${FILE_PATH}`);
console.log(`Original size: ${original.length} chars`);
console.log(`New size:      ${content.length} chars`);
console.log(`Delta:         +${content.length - original.length} chars`);
console.log('');
console.log('Edits applied (each verified unique-match before apply):');
applied.forEach(name => console.log(`  ✓ ${name}`));
console.log('');
console.log('Existing call sites unchanged: provider main effect still passes');
console.log('  no pageContext → loadSession defaults to nulls → identical behavior.');
console.log('');
console.log('Next steps:');
console.log('  1. npx tsc --noEmit');
console.log('  2. Spot-check the diff: git diff components/credits/CreditSessionContext.tsx');
console.log('  3. Smoke: dev server, open homepage, verify pills render for both');
console.log('     anonymous and registered users. No console errors expected.');
console.log('  4. If green: stage, commit, push.');
console.log('');
console.log('Commit message:');
console.log('  feat(credits): refresh(pageContext?) — provider supports per-call page-context tagging');
console.log('');
console.log('  W-CREDITS Phase 7a. Adds optional pageContext arg to loadSession() and');
console.log('  refresh() in CreditSessionContext. Existing callers (provider main effect)');
console.log('  pass nothing → identical behavior. Unblocks Phase 7c, where CharlieWidget');
console.log('  onSuccess will pass pageContext to refresh() so the session row created at');
console.log('  registration carries current_page_type/current_page_id, restoring tagging');
console.log('  that initSession provided pre-W-CREDITS.');
console.log('');
console.log('  Pre-W-CREDITS checkpoint: 96244dbb55913e3c5a147ee682cce44fc47fcd87');
console.log('  Phase 6 SHA: 65b32491c9746592d640b5982a41c7e9ead64941');