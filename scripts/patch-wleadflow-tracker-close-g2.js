const fs = require('fs');
const path = require('path');

const trackerPath = path.join('docs', 'W-LEAD-FLOW-VERIFICATION-TRACKER.md');
const content = fs.readFileSync(trackerPath, 'utf8');
const originalBytes = Buffer.byteLength(content, 'utf8');
console.log('Read ' + trackerPath + ': ' + originalBytes + ' bytes');

const hasCrlf = content.includes('\r\n');
const eol = hasCrlf ? '\r\n' : '\n';
console.log('Line ending: ' + (hasCrlf ? 'CRLF' : 'LF'));

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = trackerPath + '.backup_' + ts;
fs.writeFileSync(backupPath, content, 'utf8');
console.log('Backup: ' + backupPath);

function assertSingle(haystack, needle, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) throw new Error(label + ': anchor must appear exactly once, found ' + count);
}
let patched = content;

// === CHANGE 1: T5 phase row -> IN PROGRESS (G2 closed, G1 still open) ===
const a1 = '| T5 Gap fixes (G1 + G2) | NOT STARTED | Source URL + Credits-at-lead-creation -- ships before launch |';
const r1 = '| T5 Gap fixes (G1 + G2) | IN PROGRESS | G2 CLOSED 2026-05-18 (lead.user_id via get-or-create from email; lib/auth/get-or-create-by-email.ts + walliam/contact patch). G1 (source_url) still open. |';
assertSingle(patched, a1, 'Anchor 1 (T5 phase row)');
patched = patched.replace(a1, r1);
console.log('CHANGE 1: T5 -> IN PROGRESS');

// === CHANGE 2: Replace G2 section with closure summary ===
const a2Lines = [
  '### G2 -- `user_credits` row not created at lead creation',
  '',
  'Decision (locked by Shah 2026-05-18): every lead-write route MUST create a `user_credits` row at lead creation, regardless of whether the lead will consume credits. Rationale: agent needs a single place in the workbench to grant or revoke privileges per lead. Money matters live in one place; agent does not hunt for the credit state.',
  '',
  '**Acceptance criteria**:',
  '- Schema: confirm `user_credits` (or equivalent) table shape -- columns, FK to `leads` or `users`, tenant scoping.',
  '- All 7 System 2 lead-write routes initialize a credit row on lead creation:',
  '  - tenant_id stamped',
  '  - lead_id (or user_id, whichever the schema uses) linked',
  '  - All usage counters at 0',
  '  - All caps / limits inherited from `tenants` defaults (`ai_free_messages`, `estimator_free_attempts`, `plan_free_attempts`, etc.)',
  '- Insert is idempotent / upsert -- if a row already exists for the user, do not duplicate.',
  '- Multi-tenant safe: scoped by `tenant_id` on every read.',
  '- Workbench Credits & Usage tab renders the row by default; agent can edit limits / grant credits / revoke privileges from this tab.',
  '- TSC clean; no regression on existing flows that already consume credits (Charlie messages, estimator, plan).'
];
const a2 = a2Lines.join(eol);

const r2Lines = [
  '### G2 -- CLOSED 2026-05-18: lead.user_id population for credit-management',
  '',
  '**Verified state**: No `user_credits` table exists. Per-user credit state is distributed: defaults on `tenants`, per-user overrides on `user_credit_overrides`, usage counters on `chat_sessions`. Workbench Credits & Usage tab (`components/admin-homes/lead-workbench/UserCreditPanel.tsx`) keys on `anchorLead.user_id` and handles override=NULL via tenant defaults (`getResolvedLimits`).',
  '',
  '**Realized G2 goal**: every System 2 lead must carry non-NULL `user_id` so the workbench credits tab is functional per lead. The literal "create user_credits row" spec did not map onto the actual architecture; the spirit of the spec (agent has one place to grant/revoke per lead) translates to ensuring `lead.user_id` is always populated.',
  '',
  '**Gap (forward-only -- no backfill; all current leads are test)**:',
  '- 6 of 7 lead-write routes already populated `user_id` from session context (charlie/*, estimator/*).',
  '- `app/api/walliam/contact/route.ts` was the only gap: public form, no session, was inserting leads with NULL `user_id`.',
  '',
  '**Shipped**:',
  '- New helper: `lib/auth/get-or-create-by-email.ts` -- resolves an `auth.users` row by email via create-first / list-on-conflict (Supabase Admin has no getUserByEmail). Returns `{ userId, created }`.',
  '- Patched: `app/api/walliam/contact/route.ts` -- calls helper before lead insert, populates `user_id` on lead row. Wrapped in try/catch; on helper failure the lead still saves with `user_id=null` (graceful degradation, no regression on existing behavior).',
  '',
  '**Verification**:',
  '- S1-Build harness: PASS lead `abe3fd23-3f39-4a07-9c9f-f3a4327ff613`, user_id `f7de0765-0f0c-4861-8035-0cd8869a4c04`, `auth.users.email` matches `lead.contact_email`.',
  '- S2/S3/S4 harness: PASS exit 0 (no regression on session-based routes).',
  '- TSC clean.'
];
const r2 = r2Lines.join(eol);
assertSingle(patched, a2, 'Anchor 2 (G2 section)');
patched = patched.replace(a2, r2);
console.log('CHANGE 2: G2 section replaced with closure summary');

// === CHANGE 3: Footer last-updated ===
const a3 = '_Last updated: 2026-05-18 (T3-S2/S3/S4 CLOSED: S3+S4+S2 all PASS via real HTTP requests; harness fixed for unique partial index on chat_sessions (user_id, tenant_id, source))_';
const r3 = '_Last updated: 2026-05-18 (G2 CLOSED: forward-only lead.user_id population via lib/auth/get-or-create-by-email.ts + walliam/contact route patch; S1-Build PASS lead abe3fd23 user_id f7de0765 with auth.users.email match)_';
assertSingle(patched, a3, 'Anchor 3 (footer)');
patched = patched.replace(a3, r3);
console.log('CHANGE 3: footer last-updated');

// Write
fs.writeFileSync(trackerPath, patched, 'utf8');
const newBytes = Buffer.byteLength(patched, 'utf8');
const delta = newBytes - originalBytes;
console.log('Wrote ' + trackerPath + ': ' + newBytes + ' bytes (delta: ' + (delta >= 0 ? '+' : '') + delta + ')');

const checks = {
  'T5 -> IN PROGRESS':              patched.includes('| T5 Gap fixes (G1 + G2) | IN PROGRESS |'),
  'No "NOT STARTED" on T5':         !patched.includes('| T5 Gap fixes (G1 + G2) | NOT STARTED |'),
  'G2 CLOSED header':               patched.includes('### G2 -- CLOSED 2026-05-18:'),
  'Old G2 framing removed':         !patched.includes('### G2 -- `user_credits` row not created at lead creation'),
  'Real lead UUID in tracker':      patched.includes('abe3fd23-3f39-4a07-9c9f-f3a4327ff613'),
  'Real auth user UUID in tracker': patched.includes('f7de0765-0f0c-4861-8035-0cd8869a4c04'),
  'Footer mentions G2 CLOSED':      patched.includes('G2 CLOSED:')
};
console.log('');
console.log('Verifications:');
let allPass = true;
for (const k of Object.keys(checks)) {
  const v = checks[k];
  console.log('  ' + (v ? 'OK  ' : 'FAIL') + '  ' + k);
  if (!v) allPass = false;
}
if (!allPass) throw new Error('Post-patch verification failed -- rollback from ' + backupPath);
console.log('');
console.log('All verifications passed.');
console.log('Backup: ' + backupPath);