#!/usr/bin/env node
// scripts/wleadflow/patch-S2-S3-S4-s2-session-and-s4-enrichment.js
//
// 3 surgical edits in response to Action 7 findings:
//
//   edit1: INSERT a second chat_sessions clone (sessionIdS2) for S2.
//          Charlie route dedupes by session_id when status=pending; S3 leaves
//          such a row on the shared session. Separate session sidesteps the
//          short-circuit.
//
//   edit2: REPLACE S4 fireAndVerify call. Per the questionnaire route's own
//          header ("Lead UPSERT instead of INSERT -- enriches existing
//          vip-request lead"), the route UPDATES the S3 lead in place.
//          lead_origin_route stays 'estimator_vip_request'. Assertion now
//          checks message contains 'Questionnaire' (post-enrichment marker).
//
//   edit3: REPLACE S2 body's sessionId reference to use sessionIdS2.
//
// LE-aware (normalizes mixed input to dominant). Idempotent.

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

// LE detection
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

let text = inputBytes.toString('utf8');
const originalLen = text.length;
text = text.replace(/\r\n/g, '\n');
if (dominantEol === '\r\n') text = text.replace(/\n/g, '\r\n');

function norm(s) { return s.replace(/\n/g, dominantEol); }

// Idempotency
if (text.indexOf('sessionIdS2') !== -1) { console.error('ABORT: sessionIdS2 already present'); process.exit(1); }
if (text.indexOf('message_includes_questionnaire') !== -1) { console.error('ABORT: questionnaire assertion already present'); process.exit(1); }

// ----- Edit 1: Insert S2 second-session clone before Helpers -----
const edit1Anchor = norm(
  '  // ========================================================================\n' +
  '  // Helpers\n' +
  '  // ========================================================================'
);
const edit1Replacement = norm(
  '  // S2 (Charlie VIP) needs its own session. The Charlie route dedupes\n' +
  '  // on session_id when status=pending, and S3 just left such a vip_request\n' +
  '  // on the first session. A second session sidesteps the short-circuit.\n' +
  '  let sessionIdS2;\n' +
  '  {\n' +
  '    const cloneS2Source = template || { tenant_id: fx.tenant.id };\n' +
  '    const cloneS2 = { ...cloneS2Source };\n' +
  '    delete cloneS2.id;\n' +
  '    if (\'created_at\' in cloneS2)        delete cloneS2.created_at;\n' +
  '    if (\'updated_at\' in cloneS2)        delete cloneS2.updated_at;\n' +
  '    if (\'last_message_at\' in cloneS2)   cloneS2.last_message_at = null;\n' +
  '    if (\'current_page_type\' in cloneS2) cloneS2.current_page_type = \'building\';\n' +
  '    if (\'current_page_id\' in cloneS2)   cloneS2.current_page_id   = fx.building.id;\n' +
  '    if (\'current_page_url\' in cloneS2)  cloneS2.current_page_url  = \'/buildings/\' + fx.building.slug;\n' +
  '    if (\'message_count\' in cloneS2)     cloneS2.message_count = 0;\n' +
  '    cloneS2.user_id       = testUserId;\n' +
  '    cloneS2.session_token = require(\'crypto\').randomUUID();\n' +
  '    const { data: insertedS2, error: insErrS2 } = await supabase\n' +
  '      .from(\'chat_sessions\')\n' +
  '      .insert(cloneS2)\n' +
  '      .select()\n' +
  '      .single();\n' +
  '    if (insErrS2) abort(\'chat_sessions clone insert (S2): \' + insErrS2.message);\n' +
  '    sessionIdS2 = insertedS2.id;\n' +
  '    console.log(\'  Cloned second session for S2: \' + sessionIdS2);\n' +
  '  }\n' +
  '\n' +
  '  // ========================================================================\n' +
  '  // Helpers\n' +
  '  // ========================================================================'
);

// ----- Edit 2: Fix S4 call -----
const edit2Anchor = norm(
  "    await fireAndVerify(\n" +
  "      'S4', 'Surface 5: Estimator Questionnaire', '/api/walliam/estimator/vip-questionnaire',\n" +
  "      s4Body, 'estimator_questionnaire',\n" +
  "      (lead) => ({ message_set: typeof lead.message === 'string' && lead.message.length > 0 }),\n" +
  "    );"
);
const edit2Replacement = norm(
  "    await fireAndVerify(\n" +
  "      'S4', 'Surface 5: Estimator Questionnaire', '/api/walliam/estimator/vip-questionnaire',\n" +
  "      s4Body, 'estimator_vip_request',  // questionnaire enriches the S3 lead in-place; lead_origin_route stays 'estimator_vip_request'\n" +
  "      (lead) => ({\n" +
  "        message_includes_questionnaire: typeof lead.message === 'string' && lead.message.indexOf('Questionnaire') !== -1,\n" +
  "      }),\n" +
  "    );"
);

// ----- Edit 3: S2 body uses sessionIdS2 -----
const edit3Anchor = norm(
  "  const s2Body = {\n" +
  "    sessionId: sessionId,\n" +
  "    planType:  'buyer',"
);
const edit3Replacement = norm(
  "  const s2Body = {\n" +
  "    sessionId: sessionIdS2,  // own session to avoid Charlie's session_id-based dedup\n" +
  "    planType:  'buyer',"
);

const edits = [
  { name: 'edit1 (S2 second session)',         anchor: edit1Anchor, replacement: edit1Replacement },
  { name: 'edit2 (S4 enrichment lookup)',      anchor: edit2Anchor, replacement: edit2Replacement },
  { name: 'edit3 (S2 sessionId reference)',    anchor: edit3Anchor, replacement: edit3Replacement },
];

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

// LE post-check
const outBytes = fs.readFileSync(target);
let outCrlf = 0, outLf = 0;
for (let i = 0; i < outBytes.length; i++) {
  if (outBytes[i] === 0x0A) {
    if (i > 0 && outBytes[i-1] === 0x0D) outCrlf++;
    else outLf++;
  }
}
if (dominantEol === '\r\n' && outLf > 0) { console.error('ABORT: stray LF in CRLF output'); process.exit(1); }
if (dominantEol === '\n' && outCrlf > 0) { console.error('ABORT: stray CRLF in LF output'); process.exit(1); }
console.log('LE PRESERVED: ' + (dominantEol === '\r\n' ? 'all CRLF' : 'all LF') +
            ' (crlf=' + outCrlf + ', lfOnly=' + outLf + ')');

// Sentinels
const verify = outBytes.toString('utf8');
const sentinels = [
  'let sessionIdS2',
  'Cloned second session for S2',
  "'estimator_vip_request',  // questionnaire enriches",
  'message_includes_questionnaire',
  'sessionId: sessionIdS2',
];
const missing = sentinels.filter(s => verify.indexOf(s) === -1);
if (missing.length > 0) {
  console.error('ABORT: post-verify failed -- missing sentinels:');
  for (const m of missing) console.error('  - ' + m);
  process.exit(1);
}
console.log('VERIFIED: all ' + sentinels.length + ' sentinels present');