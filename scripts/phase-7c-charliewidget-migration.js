// scripts/phase-7c-charliewidget-migration.js
//
// W-CREDITS Phase 7c — CharlieWidget consumes CreditSessionContext directly,
// removes the Phase 7b initSession compatibility stub from useCharlie.
//
// 4 atomic edits across 2 files:
//
//   File 1: app/charlie/components/CharlieWidget.tsx
//     W1: Add useCreditSession import after useAuth import
//     W2: Drop initSession from useCharlie destructure; add creditsCtx near useAuth
//     W3: Replace initSession(uid, pageContext) call with creditsCtx.refresh(pageContext)
//
//   File 2: app/charlie/hooks/useCharlie.ts
//     U1: Remove initSession compatibility stub from return statement
//
// Risk profile: LOW.
//   - No new logic. Only wrapper removal.
//   - The 10-retry getUser pattern is preserved (separate Supabase cookie race).
//   - Race elimination strategy proven correct by 7b stub working through registration.
//
// Probe expected: identical to 7b (POST=0 GET=1 for tenant routes, 0/0 inert).
// Manual smoke: post-register flow on building page → session row gets pageContext tagging.

const fs = require('fs');
const path = require('path');

const WIDGET_PATH = path.resolve('app/charlie/components/CharlieWidget.tsx');
const HOOK_PATH = path.resolve('app/charlie/hooks/useCharlie.ts');

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
// FILE 1: app/charlie/components/CharlieWidget.tsx
// ═══════════════════════════════════════════════════════════════════════════

const widget = loadAndPrep(WIDGET_PATH, 'CharlieWidget.tsx');

// ─── W1: Add useCreditSession import after useAuth ────────────────────────
applyEdit(widget,
  'W1 (add useCreditSession import)',
  /^import \{ useAuth \} from '@\/components\/auth\/AuthContext'\r?\n/m,
  () =>
    `import { useAuth } from '@/components/auth/AuthContext'${widget.eol}` +
    `import { useCreditSession } from '@/components/credits/CreditSessionContext'${widget.eol}`
);

// ─── W2: Drop initSession from destructure ────────────────────────────────
// Remove line `    initSession,` from the useCharlie() destructure.
applyEdit(widget,
  'W2A (drop initSession from destructure)',
  /^[ \t]+initSession,\r?\n/m,
  () => ''
);

// ─── W2B: Add creditsCtx hook call after useAuth() call ───────────────────
applyEdit(widget,
  'W2B (add creditsCtx after useAuth)',
  /^([ \t]+)const \{ user \} = useAuth\(\)\r?\n/m,
  (_m, indent) =>
    `${indent}const { user } = useAuth()${widget.eol}` +
    `${indent}const creditsCtx = useCreditSession()${widget.eol}`
);

// ─── W3: Replace initSession call in onSuccess flow ───────────────────────
// Old: initSession(data.user.id, pageContext).then(() => resumeAfterGate())
// New: creditsCtx.refresh(pageContext).then(() => resumeAfterGate())
//
// Note: data.user.id is no longer needed in the call — provider's main effect
// will pick up the new user from AuthContext. Provider's loadSession reads
// userId from useAuth, not from arguments. The retry loop's purpose is to
// confirm Supabase has propagated the cookie (so AuthContext sees the user)
// before triggering refresh. Once the loop confirms data.user.id exists,
// AuthContext has the user and refresh() will fetch session for that user.
applyEdit(widget,
  'W3 (replace initSession call with creditsCtx.refresh)',
  /^([ \t]+)initSession\(data\.user\.id, pageContext\)\.then\(\(\) => resumeAfterGate\(\)\)$/m,
  (_m, indent) => `${indent}creditsCtx.refresh(pageContext).then(() => resumeAfterGate())`
);

// ═══════════════════════════════════════════════════════════════════════════
// FILE 2: app/charlie/hooks/useCharlie.ts
// ═══════════════════════════════════════════════════════════════════════════

const hook = loadAndPrep(HOOK_PATH, 'useCharlie.ts');

// ─── U1: Remove initSession compatibility stub from return statement ──────
// Anchor: from `// Phase 7b compatibility stub.` comment through the closing
// `},` of the stub object literal. Includes trailing newline so dismissGate
// remains the next line as before.
applyEdit(hook,
  'U1 (remove initSession compatibility stub)',
  /^[ \t]+\/\/ Phase 7b compatibility stub\.[\s\S]*?initSession: async \(uid: string \| null, pageContext\?: any\) => \{[\s\S]*?\},\r?\n/m,
  () => ''
);

// ═══════════════════════════════════════════════════════════════════════════
// WRITE
// ═══════════════════════════════════════════════════════════════════════════

writeIfChanged(widget);
writeIfChanged(hook);

// ═══════════════════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════════');
console.log('W-CREDITS Phase 7c — CharlieWidget migration applied');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');
reportFile(widget);
reportFile(hook);
console.log('Total edits: ' + (widget.applied.length + hook.applied.length));
console.log('');
console.log('Architectural completion:');
console.log('  • CharlieWidget imports useCreditSession');
console.log('  • Post-register flow calls creditsCtx.refresh(pageContext) directly');
console.log('  • useCharlie no longer publishes initSession');
console.log('  • Credit-context architecture: 100% provider-owned');
console.log('  • W-CREDITS Phase 7 work item: COMPLETE');
console.log('');
console.log('Next steps:');
console.log('  1. npx tsc --noEmit   (must be silent)');
console.log('  2. node scripts\\probe-phase-5.js');
console.log('     EXPECTED: identical to Phase 7b — / POST=0 GET=1, /<building> POST=0 GET=1');
console.log('  3. Manual smoke (when Anthropic quota restored):');
console.log('     a) Anonymous on /<building> page → register → confirm session row');
console.log('        gets current_page_type=building, current_page_id=<id> tagged');
console.log('     b) Chat send → pill increments live (Phase 7b behavior preserved)');
console.log('     c) Plan generation → plansUsed increments live');
console.log('  4. If green: stage 3 files, commit, push.');
console.log('');
console.log('Files to stage:');
console.log('  • app/charlie/components/CharlieWidget.tsx');
console.log('  • app/charlie/hooks/useCharlie.ts');
console.log('  • scripts/phase-7c-charliewidget-migration.js');