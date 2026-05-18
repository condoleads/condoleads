#!/usr/bin/env node
// scripts/wleadflow/patch-S2-S3-S4-auth-and-headers-v3.js
//
// v3: NORMALIZES mixed line endings to the dominant value, THEN patches.
//
// Action 3's patch injected a single '\n' into a CRLF file, leaving
// the harness with 340 CRLF + 1 LF. v3 fixes that drift en passant.
//
// Same 4 edits as v2:
//   1. INSERT auth user creation in Phase 1 (before clone block)
//   2. REPLACE clone.user_id = null  ->  clone.user_id = testUserId
//   3. REPLACE fetch headers: add 'x-tenant-id'
//   4. REPLACE lead lookup strategy

const fs = require('fs');

const target = 'scripts/wleadflow/run-S2-S3-S4-session.js';
if (!fs.existsSync(target)) { console.error('ABORT: target not found: ' + target); process.exit(1); }

const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '_' +
              pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
const backupPath = target + '.backup_' + stamp;
fs.copyFileSync(target, backupPath);
console.log('BACKUP: ' + backupPath);

// Detect LE on input
const inputBytes = fs.readFileSync(target);
let crlfCount = 0, lfOnlyCount = 0;
for (let i = 0; i < inputBytes.length; i++) {
  if (inputBytes[i] === 0x0A) {
    if (i > 0 && inputBytes[i-1] === 0x0D) crlfCount++;
    else lfOnlyCount++;
  }
}
const dominantEol = crlfCount >= lfOnlyCount ? '\r\n' : '\n';
const wasMixed = crlfCount > 0 && lfOnlyCount > 0;
console.log('LE INPUT: crlf=' + crlfCount + ', lfOnly=' + lfOnlyCount +
            ', dominant=' + (dominantEol === '\r\n' ? 'CRLF' : 'LF') +
            (wasMixed ? ' (MIXED -- will normalize)' : ''));

// Normalize: collapse to \n first, then expand to dominant
let text = inputBytes.toString('utf8');
const originalLen = text.length;
text = text.replace(/\r\n/g, '\n');
if (dominantEol === '\r\n') text = text.replace(/\n/g, '\r\n');
if (wasMixed) {
  console.log('  normalized: all lines now ' + (dominantEol === '\r\n' ? 'CRLF' : 'LF'));
  console.log('  size after normalization: ' + text.length + ' bytes (input was ' + originalLen + ')');
}

function norm(s) { return s.replace(/\n/g, dominantEol); }

// Idempotency
if (text.indexOf('testUserId') !== -1) { console.error('ABORT: testUserId already present'); process.exit(1); }
if (text.indexOf("'x-tenant-id'") !== -1) { console.error('ABORT: x-tenant-id already present'); process.exit(1); }

// ----- Edit 1: Insert auth user creation -----
const edit1Anchor = norm(
  '  }\n' +
  '\n' +
  '  // Try to find an existing WALLiam session as a clone template'
);
const edit1Replacement = norm(
  '  }\n' +
  '\n' +
  '  // Create a real auth user. Both VIP request routes require\n' +
  '  // chat_sessions.user_id to reference a real auth.users row, and the\n' +
  '  // lead row\'s contact_email comes from auth.users (not the request body).\n' +
  '  const testUserEmail = \'wleadflow+sess+\' + Date.now() + \'@condoleads.ca\';\n' +
  '  const { data: createdUser, error: createUserErr } = await supabase.auth.admin.createUser({\n' +
  '    email: testUserEmail,\n' +
  '    email_confirm: true,\n' +
  '    user_metadata: { source: \'wleadflow-harness\' },\n' +
  '  });\n' +
  '  if (createUserErr || !createdUser || !createdUser.user || !createdUser.user.id) {\n' +
  '    abort(\'failed to create test auth user: \' + (createUserErr && createUserErr.message ? createUserErr.message : \'no user returned\'));\n' +
  '  }\n' +
  '  const testUserId = createdUser.user.id;\n' +
  '  console.log(\'  Created test auth user: \' + testUserId + \' (\' + testUserEmail + \')\');\n' +
  '\n' +
  '  // Try to find an existing WALLiam session as a clone template'
);

// ----- Edits 2 + 3: single line, LE-irrelevant -----
const edit2Anchor      = "    if ('user_id' in clone)           clone.user_id = null;  // anonymous test session";
const edit2Replacement = "    if ('user_id' in clone)           clone.user_id = testUserId;  // real auth user (required by VIP routes)";
const edit3Anchor      = "        headers: { 'Content-Type': 'application/json', 'Host': fx.tenant.domain },";
const edit3Replacement = "        headers: { 'Content-Type': 'application/json', 'Host': fx.tenant.domain, 'x-tenant-id': fx.tenant.id },";

// ----- Edit 4: multi-line -----
const edit4Anchor = norm(
  "    // Find the lead by either lead_id in response, or by contact_email\n" +
  "    let lead = null;\n" +
  "    if (resJson && resJson.leadId) {\n" +
  "      const { data } = await supabase.from('leads').select('*').eq('id', resJson.leadId).maybeSingle();\n" +
  "      lead = data;\n" +
  "    }\n" +
  "    if (!lead && body.email) {\n" +
  "      const { data } = await supabase.from('leads').select('*').eq('contact_email', body.email).order('created_at', { ascending: false }).limit(1).maybeSingle();\n" +
  "      lead = data;\n" +
  "    }\n" +
  "    if (!lead && resJson && resJson.lead_id) {\n" +
  "      const { data } = await supabase.from('leads').select('*').eq('id', resJson.lead_id).maybeSingle();\n" +
  "      lead = data;\n" +
  "    }"
);
const edit4Replacement = norm(
  "    // Find the lead. Production routes don't return leadId, and lead.contact_email\n" +
  "    // comes from auth.users (not request body), so look up by\n" +
  "    // tenant_id + the test auth user + lead_origin_route + most recent.\n" +
  "    let lead = null;\n" +
  "    if (resJson && resJson.leadId) {\n" +
  "      const { data } = await supabase.from('leads').select('*').eq('id', resJson.leadId).maybeSingle();\n" +
  "      lead = data;\n" +
  "    }\n" +
  "    if (!lead) {\n" +
  "      const { data } = await supabase.from('leads').select('*')\n" +
  "        .eq('tenant_id', fx.tenant.id)\n" +
  "        .eq('user_id', testUserId)\n" +
  "        .eq('lead_origin_route', expectLeadOriginRoute)\n" +
  "        .order('created_at', { ascending: false })\n" +
  "        .limit(1)\n" +
  "        .maybeSingle();\n" +
  "      lead = data;\n" +
  "    }"
);

const edits = [
  { name: 'edit1 (auth user creation)',  anchor: edit1Anchor,  replacement: edit1Replacement },
  { name: 'edit2 (clone.user_id)',        anchor: edit2Anchor,  replacement: edit2Replacement },
  { name: 'edit3 (x-tenant-id header)',   anchor: edit3Anchor,  replacement: edit3Replacement },
  { name: 'edit4 (lead lookup)',          anchor: edit4Anchor,  replacement: edit4Replacement },
];

// Anchor uniqueness
for (const e of edits) {
  const occ = text.split(e.anchor).length - 1;
  if (occ !== 1) {
    console.error('ABORT: anchor count ' + occ + ' != 1 for ' + e.name);
    console.error('  first 80 chars: ' + JSON.stringify(e.anchor.slice(0, 80)));
    process.exit(1);
  }
}

for (const e of edits) { text = text.replace(e.anchor, e.replacement); }
fs.writeFileSync(target, text, 'utf8');

const newLen = text.length;
console.log('PATCHED: ' + target);
console.log('  input bytes:  ' + originalLen);
console.log('  output bytes: ' + newLen);
console.log('  delta:        +' + (newLen - originalLen) + ' bytes');

// Post-verify: LE consistency (must be pure dominant, zero of the other)
const outBytes = fs.readFileSync(target);
let outCrlf = 0, outLf = 0;
for (let i = 0; i < outBytes.length; i++) {
  if (outBytes[i] === 0x0A) {
    if (i > 0 && outBytes[i-1] === 0x0D) outCrlf++;
    else outLf++;
  }
}
if (dominantEol === '\r\n' && outLf > 0) {
  console.error('ABORT: output has ' + outLf + ' stray LF line(s) in a CRLF file');
  process.exit(1);
}
if (dominantEol === '\n' && outCrlf > 0) {
  console.error('ABORT: output has ' + outCrlf + ' stray CRLF line(s) in an LF file');
  process.exit(1);
}
console.log('LE PRESERVED: ' + (dominantEol === '\r\n' ? 'all CRLF' : 'all LF') +
            ' (crlf=' + outCrlf + ', lfOnly=' + outLf + ')');

// Sentinels
const verify = outBytes.toString('utf8');
const sentinels = [
  'const testUserEmail',
  'supabase.auth.admin.createUser',
  'clone.user_id = testUserId',
  "'x-tenant-id': fx.tenant.id",
  ".eq('user_id', testUserId)",
];
const missing = sentinels.filter(s => verify.indexOf(s) === -1);
if (missing.length > 0) {
  console.error('ABORT: post-verify failed -- missing sentinels:');
  for (const m of missing) console.error('  - ' + m);
  process.exit(1);
}
console.log('VERIFIED: all ' + sentinels.length + ' sentinels present');