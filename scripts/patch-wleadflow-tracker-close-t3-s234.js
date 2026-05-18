const fs = require('fs');
const path = require('path');

const trackerPath = path.join('docs', 'W-LEAD-FLOW-VERIFICATION-TRACKER.md');
const content = fs.readFileSync(trackerPath, 'utf8');
const originalBytes = Buffer.byteLength(content, 'utf8');
console.log('Read ' + trackerPath + ': ' + originalBytes + ' bytes');

const hasCrlf = content.includes('\r\n');
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

// === CHANGE 1: Phase row IN PROGRESS -> CLOSED ===
const a1 = '| T3-S2/S3/S4 Session-based | IN PROGRESS | S3+S4+S2 harness built; chat_sessions clone session_token collision being fixed (commit 7b1874f) |';
const r1 = '| T3-S2/S3/S4 Session-based | CLOSED | S3+S4+S2 all PASS via run-S2-S3-S4-session.js; root cause: unique partial index `idx_chat_sessions_user_tenant_source_unique` on (user_id, tenant_id, source) -- fix: distinct auth user for S2 session + `.in()` lead lookup |';
assertSingle(patched, a1, 'Anchor 1 (T3 phase row)');
patched = patched.replace(a1, r1);
console.log('CHANGE 1: T3-S2/S3/S4 phase row -> CLOSED');

// === CHANGE 2: S3 ledger row ===
const a2 = '| S3       | Estimator VIP request | `walliam/estimator/vip-request` | BLOCKED | -- | session clone session_token collision; fix in run-S2-S3-S4-session.js |';
const r2 = '| S3       | Estimator VIP request | `walliam/estimator/vip-request` | PASS | `bf243fc5-e3c4-458a-9ced-520d60856d9e` | agent=King Shah, src=geo |';
assertSingle(patched, a2, 'Anchor 2 (S3 row)');
patched = patched.replace(a2, r2);
console.log('CHANGE 2: S3 row -> PASS');

// === CHANGE 3: S4 ledger row ===
const a3 = '| S4       | Estimator questionnaire | `walliam/estimator/vip-questionnaire` | BLOCKED | -- | depends on S3 vip_request_id |';
const r3 = '| S4       | Estimator questionnaire | `walliam/estimator/vip-questionnaire` | PASS | `bf243fc5-e3c4-458a-9ced-520d60856d9e` | enriches S3 lead in place; agent=King Shah, src=geo |';
assertSingle(patched, a3, 'Anchor 3 (S4 row)');
patched = patched.replace(a3, r3);
console.log('CHANGE 3: S4 row -> PASS');

// === CHANGE 4: S2 ledger row ===
const a4 = '| S2       | Charlie VIP request | `walliam/charlie/vip-request` | BLOCKED | -- | shares same session as S3 |';
const r4 = '| S2       | Charlie VIP request | `walliam/charlie/vip-request` | PASS | `f906a371-ca90-4816-944a-74c2e9d42229` | distinct session+auth user from S3/S4; agent=King Shah, src=geo |';
assertSingle(patched, a4, 'Anchor 4 (S2 row)');
patched = patched.replace(a4, r4);
console.log('CHANGE 4: S2 row -> PASS');

// === CHANGE 5: Footer last-updated ===
const a5 = '_Last updated: 2026-05-18 (G1 URL patterns replaced with verified table from `app/[slug]/page.tsx` + `lib/utils/slugs.ts`; pre S2-S3-S4 retry)_';
const r5 = '_Last updated: 2026-05-18 (T3-S2/S3/S4 CLOSED: S3+S4+S2 all PASS via real HTTP requests; harness fixed for unique partial index on chat_sessions (user_id, tenant_id, source))_';
assertSingle(patched, a5, 'Anchor 5 (footer)');
patched = patched.replace(a5, r5);
console.log('CHANGE 5: footer last-updated');

fs.writeFileSync(trackerPath, patched, 'utf8');
const newBytes = Buffer.byteLength(patched, 'utf8');
const delta = newBytes - originalBytes;
console.log('Wrote ' + trackerPath + ': ' + newBytes + ' bytes (delta: ' + (delta >= 0 ? '+' : '') + delta + ')');

const checks = {
  'Zero BLOCKED markers remain':              !patched.includes('BLOCKED'),
  'Zero IN PROGRESS markers remain':          !patched.includes('IN PROGRESS'),
  'S3/S4 lead UUID present':                  patched.includes('`bf243fc5-e3c4-458a-9ced-520d60856d9e`'),
  'S2 lead UUID present':                     patched.includes('`f906a371-ca90-4816-944a-74c2e9d42229`'),
  'T3 phase CLOSED':                          patched.includes('| T3-S2/S3/S4 Session-based | CLOSED |'),
  'S3 row carries PASS':                      patched.includes('| `walliam/estimator/vip-request` | PASS |'),
  'S4 row carries PASS':                      patched.includes('| `walliam/estimator/vip-questionnaire` | PASS |'),
  'S2 row carries PASS':                      patched.includes('| `walliam/charlie/vip-request` | PASS |'),
  'Footer mentions T3-S2/S3/S4 CLOSED':       patched.includes('T3-S2/S3/S4 CLOSED')
};
console.log('');
console.log('Verifications:');
let allPass = true;
for (const k of Object.keys(checks)) {
  const v = checks[k];
  console.log('  ' + (v ? 'OK  ' : 'FAIL') + '  ' + k);
  if (!v) allPass = false;
}
if (!allPass) throw new Error('Post-patch verification failed -- inspect file and rollback from: ' + backupPath);
console.log('');
console.log('All verifications passed.');
console.log('Backup: ' + backupPath);