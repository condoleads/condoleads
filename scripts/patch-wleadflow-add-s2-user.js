const fs = require('fs');
const path = require('path');

const harnessPath = path.join('scripts', 'wleadflow', 'run-S2-S3-S4-session.js');
const content = fs.readFileSync(harnessPath, 'utf8');
const originalBytes = Buffer.byteLength(content, 'utf8');
console.log('Read ' + harnessPath + ': ' + originalBytes + ' bytes');

// Detect line ending
const hasCrlf = content.includes('\r\n');
const eol = hasCrlf ? '\r\n' : '\n';
console.log('Line ending: ' + (hasCrlf ? 'CRLF' : 'LF'));

// Backup
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = harnessPath + '.backup_' + ts;
fs.writeFileSync(backupPath, content, 'utf8');
console.log('Backup: ' + backupPath);

function assertSingle(haystack, needle, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) {
    throw new Error(label + ': anchor must appear exactly once, found ' + count);
  }
}

let patched = content;

// === CHANGE 1: testUserIdS2 creation block ===
const anchor1 = [
  '  const testUserId = createdUser.user.id;',
  "  console.log('  Created test auth user: ' + testUserId + ' (' + testUserEmail + ')');"
].join(eol);

const replacement1 = [
  anchor1,
  '',
  '  // S2 (Charlie VIP) needs its own chat_sessions row. The unique partial index',
  '  // idx_chat_sessions_user_tenant_source_unique on (user_id, tenant_id, source)',
  "  // forbids two sessions for the same (auth user, tenant, source) trio.",
  "  // S3/S4 session and S2 session share tenant_id + source='walliam', so they",
  '  // must be owned by distinct auth users.',
  "  const testUserEmailS2 = 'wleadflow+sessS2+' + Date.now() + '@condoleads.ca';",
  '  const { data: createdUserS2, error: createUserErrS2 } = await supabase.auth.admin.createUser({',
  '    email: testUserEmailS2,',
  '    email_confirm: true,',
  "    user_metadata: { source: 'wleadflow-harness' },",
  '  });',
  '  if (createUserErrS2 || !createdUserS2 || !createdUserS2.user || !createdUserS2.user.id) {',
  "    abort('failed to create S2 test auth user: ' + (createUserErrS2 && createUserErrS2.message ? createUserErrS2.message : 'no user returned'));",
  '  }',
  '  const testUserIdS2 = createdUserS2.user.id;',
  "  console.log('  Created S2 test auth user: ' + testUserIdS2 + ' (' + testUserEmailS2 + ')');"
].join(eol);

assertSingle(patched, anchor1, 'Anchor 1 (testUserId creation block)');
patched = patched.replace(anchor1, replacement1);
console.log('CHANGE 1 applied: testUserIdS2 creation block inserted');

// === CHANGE 2: S2 clone user_id -> testUserIdS2 ===
const anchor2 = '    cloneS2.user_id       = testUserId;';
const replacement2 = '    cloneS2.user_id       = testUserIdS2;  // distinct user -- unique index (user_id, tenant_id, source)';

assertSingle(patched, anchor2, 'Anchor 2 (cloneS2.user_id assignment)');
patched = patched.replace(anchor2, replacement2);
console.log('CHANGE 2 applied: cloneS2.user_id -> testUserIdS2');

// === CHANGE 3: Lead lookup tolerant to either user ===
const anchor3 = "        .eq('user_id', testUserId)";
const replacement3 = "        .in('user_id', [testUserId, testUserIdS2])";

assertSingle(patched, anchor3, 'Anchor 3 (lead lookup user_id filter)');
patched = patched.replace(anchor3, replacement3);
console.log('CHANGE 3 applied: lead lookup -> .in([testUserId, testUserIdS2])');

// Write
fs.writeFileSync(harnessPath, patched, 'utf8');
const newBytes = Buffer.byteLength(patched, 'utf8');
const delta = newBytes - originalBytes;
console.log('Wrote ' + harnessPath + ': ' + newBytes + ' bytes (delta: ' + (delta >= 0 ? '+' : '') + delta + ')');

// Post-patch invariants
const checks = {
  'testUserIdS2 declared':                patched.includes('const testUserIdS2 = createdUserS2.user.id;'),
  'S2 clone uses testUserIdS2':           patched.includes('cloneS2.user_id       = testUserIdS2;'),
  'Lead lookup uses .in array':           patched.includes(".in('user_id', [testUserId, testUserIdS2])"),
  'No remaining .eq user_id literal':     !patched.includes(".eq('user_id', testUserId)"),
  'testUserIdS2 occurrences >= 4':        (patched.split('testUserIdS2').length - 1) >= 4
};
console.log('');
console.log('Verifications:');
let allPass = true;
for (const k of Object.keys(checks)) {
  const v = checks[k];
  console.log('  ' + (v ? 'OK  ' : 'FAIL') + '  ' + k);
  if (!v) allPass = false;
}
if (!allPass) {
  throw new Error('Post-patch verification failed -- inspect file and rollback from: ' + backupPath);
}
console.log('');
console.log('All verifications passed.');
console.log('Backup: ' + backupPath);