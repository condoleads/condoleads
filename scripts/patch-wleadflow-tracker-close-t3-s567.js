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

// === CHANGE 1: T3-S5/S6/S7 phase row ===
const a1 = '| T3-S5/S6/S7 Charlie chat | NOT STARTED | charlie/lead, charlie/appointment, charlie/plan-email |';
const r1 = "| T3-S5/S6/S7 Charlie chat | CLOSED | S5+S6+S7 all PASS via run-S5-S6-S7-charlie.js -- session-based + lead_origin_route='charlie' + intent disambiguation (S5/S6=buyer, S7=seller via planType) |";
assertSingle(patched, a1, 'Anchor 1 (T3-S5/S6/S7 phase row)');
patched = patched.replace(a1, r1);
console.log('CHANGE 1: T3-S5/S6/S7 -> CLOSED');

// === CHANGE 2: S5 ledger row ===
const a2 = '| S5       | Charlie lead capture | `charlie/lead` | NOT STARTED | -- | needs session + chat messages |';
const r2 = '| S5       | Charlie lead capture | `charlie/lead` | PASS | `408e96ba-7186-4bed-b427-1d25b205fbdd` | intent=buyer, plan_data populated, agent=King Shah, src=geo |';
assertSingle(patched, a2, 'Anchor 2 (S5 row)');
patched = patched.replace(a2, r2);
console.log('CHANGE 2: S5 -> PASS');

// === CHANGE 3: S6 ledger row ===
const a3 = '| S6       | Charlie appointment | `charlie/appointment` | NOT STARTED | -- | needs session |';
const r3 = '| S6       | Charlie appointment | `charlie/appointment` | PASS | `c558ca62-b208-468f-aee4-8a1f097f6557` | intent=buyer, appointment_date+time+properties set, agent=King Shah, src=geo |';
assertSingle(patched, a3, 'Anchor 3 (S6 row)');
patched = patched.replace(a3, r3);
console.log('CHANGE 3: S6 -> PASS');

// === CHANGE 4: S7 ledger row ===
const a4 = '| S7       | Charlie plan-email | `charlie/plan-email` | NOT STARTED | -- | needs session + plan_data |';
const r4 = "| S7       | Charlie plan-email | `charlie/plan-email` | PASS | `5477a25f-31c3-48ed-a428-eabbf585171f` | intent=seller (planType), plan_data.planType='seller', agent=King Shah, src=geo |";
assertSingle(patched, a4, 'Anchor 4 (S7 row)');
patched = patched.replace(a4, r4);
console.log('CHANGE 4: S7 -> PASS');

// === CHANGE 5: Footer last-updated ===
const a5 = '_Last updated: 2026-05-18 (G2 CLOSED: forward-only lead.user_id population via lib/auth/get-or-create-by-email.ts + walliam/contact route patch; S1-Build PASS lead abe3fd23 user_id f7de0765 with auth.users.email match)_';
const r5 = '_Last updated: 2026-05-18 (T3-S5/S6/S7 CLOSED: charlie/lead + charlie/appointment + charlie/plan-email all PASS via run-S5-S6-S7-charlie.js; user_id populated on all 7 lead-write routes per G2)_';
assertSingle(patched, a5, 'Anchor 5 (footer)');
patched = patched.replace(a5, r5);
console.log('CHANGE 5: footer last-updated');

fs.writeFileSync(trackerPath, patched, 'utf8');
const newBytes = Buffer.byteLength(patched, 'utf8');
console.log('Wrote ' + trackerPath + ': ' + newBytes + ' bytes (delta: +' + (newBytes - originalBytes) + ')');

const checks = {
  'T3-S5/S6/S7 CLOSED':           patched.includes('| T3-S5/S6/S7 Charlie chat | CLOSED |'),
  'No more "NOT STARTED" on S5':  !patched.includes('| S5       | Charlie lead capture | `charlie/lead` | NOT STARTED |'),
  'No more "NOT STARTED" on S6':  !patched.includes('| S6       | Charlie appointment | `charlie/appointment` | NOT STARTED |'),
  'No more "NOT STARTED" on S7':  !patched.includes('| S7       | Charlie plan-email | `charlie/plan-email` | NOT STARTED |'),
  'S5 lead UUID present':         patched.includes('408e96ba-7186-4bed-b427-1d25b205fbdd'),
  'S6 lead UUID present':         patched.includes('c558ca62-b208-468f-aee4-8a1f097f6557'),
  'S7 lead UUID present':         patched.includes('5477a25f-31c3-48ed-a428-eabbf585171f'),
  'Footer mentions T3-S5/S6/S7':  patched.includes('T3-S5/S6/S7 CLOSED:')
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