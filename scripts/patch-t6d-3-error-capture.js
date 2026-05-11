#!/usr/bin/env node
/**
 * patch-t6d-3-error-capture.js
 *
 * T6d-3: defensive error capture on the two bare-await supabase calls in the
 * auto-approve path of walliam/charlie/vip-request. Both previously silently
 * swallowed errors, which masked the granted_by_tier CHECK constraint bug
 * found by T6d synthetic verify.
 *
 * 2 atomic patches:
 *   P1: chat_sessions.update at L274-L282 — capture error, log if present
 *   P2: user_credit_overrides.upsert at L288-L296 — capture error, log if present
 *
 * No behavior change on success. Failures now visible in dev-server.log + Vercel logs.
 * Does NOT add transactional rollback — that's a future hardening pass
 * (F-CHARLIE-VIP-REQUEST-AUTO-APPROVE-NON-TRANSACTIONAL, logged for Tlast).
 *
 * CRLF-preserving. Backup-on-write. Atomic 1x-match validation.
 */

const fs = require('fs');
const path = require('path');

const ROUTE = path.resolve('app/api/walliam/charlie/vip-request/route.ts');

if (!fs.existsSync(ROUTE)) {
  console.error('FAIL: route not found at ' + ROUTE);
  process.exit(1);
}

const raw = fs.readFileSync(ROUTE, 'utf8');
const usesCRLF = /\r\n/.test(raw);
const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw;

console.log('=== Pre-patch state ===');
console.log('Bytes: ' + Buffer.byteLength(raw, 'utf8'));
console.log('LE:    ' + (usesCRLF ? 'CRLF' : 'LF'));

if (content.includes('T6d-3 error capture')) {
  console.error('FAIL: T6d-3 marker already present. Aborting.');
  process.exit(1);
}
console.log('Idempotency OK.');
console.log('');

// ============================================================================
// P1: chat_sessions.update - capture error
// ============================================================================
const P1_OLD =
  "      await supabase\n" +
  "        .from('chat_sessions')\n" +
  "        .update({\n" +
  "          status: 'vip',\n" +
  "          vip_accepted_at: new Date().toISOString(),\n" +
  "          vip_messages_granted: currentGranted + autoApproveMessages,\n" +
  "          updated_at: new Date().toISOString(),\n" +
  "        })\n" +
  "        .eq('id', sessionId)\n";

const P1_NEW =
  "      // T6d-3 error capture\n" +
  "      const { error: sessionUpdateError } = await supabase\n" +
  "        .from('chat_sessions')\n" +
  "        .update({\n" +
  "          status: 'vip',\n" +
  "          vip_accepted_at: new Date().toISOString(),\n" +
  "          vip_messages_granted: currentGranted + autoApproveMessages,\n" +
  "          updated_at: new Date().toISOString(),\n" +
  "        })\n" +
  "        .eq('id', sessionId)\n" +
  "      if (sessionUpdateError) {\n" +
  "        console.error('[walliam/vip-request] chat_sessions update failed:', sessionUpdateError)\n" +
  "      }\n";

// ============================================================================
// P2: user_credit_overrides.upsert - capture error
// ============================================================================
const P2_OLD =
  "        await supabase.from('user_credit_overrides').upsert({\n" +
  "          user_id: session.user_id,\n" +
  "          tenant_id: tenantId,\n" +
  "          granted_by_agent_id: agent?.id || null,\n" +
  "          granted_by_tier: 'auto',\n" +
  "          note: 'Auto-approved — ' + autoApproveMessages + ' credits',\n" +
  "          [overrideColumn]: newLimit,\n" +
  "          granted_at: new Date().toISOString(),\n" +
  "        }, { onConflict: 'user_id,tenant_id' })\n";

const P2_NEW =
  "        // T6d-3 error capture\n" +
  "        const { error: overrideError } = await supabase.from('user_credit_overrides').upsert({\n" +
  "          user_id: session.user_id,\n" +
  "          tenant_id: tenantId,\n" +
  "          granted_by_agent_id: agent?.id || null,\n" +
  "          granted_by_tier: 'auto',\n" +
  "          note: 'Auto-approved — ' + autoApproveMessages + ' credits',\n" +
  "          [overrideColumn]: newLimit,\n" +
  "          granted_at: new Date().toISOString(),\n" +
  "        }, { onConflict: 'user_id,tenant_id' })\n" +
  "        if (overrideError) {\n" +
  "          console.error('[walliam/vip-request] user_credit_overrides upsert failed:', overrideError)\n" +
  "        }\n";

const patches = [
  { name: 'P1 chat_sessions update error capture        ', old: P1_OLD, new: P1_NEW },
  { name: 'P2 user_credit_overrides upsert error capture', old: P2_OLD, new: P2_NEW },
];

console.log('=== Atomic validation ===');
let working = content;
for (const p of patches) {
  const occ = working.split(p.old).length - 1;
  console.log('  ' + p.name + ': ' + occ + ' match(es)');
  if (occ !== 1) {
    console.error('FAIL: ' + p.name + ' expected 1 match, found ' + occ);
    console.error('First 240 chars of anchor:');
    console.error(p.old.slice(0, 240));
    process.exit(1);
  }
}
console.log('All anchors validated atomically.');
console.log('');

const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15);
const backupPath = ROUTE + '.backup_' + stamp;
fs.writeFileSync(backupPath, raw, 'utf8');
console.log('Backup written: ' + path.relative(process.cwd(), backupPath));
console.log('');

console.log('=== Applying patches ===');
for (const p of patches) {
  working = working.replace(p.old, p.new);
  console.log('  ' + p.name + ': applied');
}
console.log('');

const out = usesCRLF ? working.replace(/\n/g, '\r\n') : working;
fs.writeFileSync(ROUTE, out, 'utf8');
console.log('Route written: ' + path.relative(process.cwd(), ROUTE));

const newRaw = fs.readFileSync(ROUTE, 'utf8');
const newUsesCRLF = /\r\n/.test(newRaw);
const newContent = newUsesCRLF ? newRaw.replace(/\r\n/g, '\n') : newRaw;

console.log('');
console.log('=== Post-patch verification ===');
console.log('Post-write bytes: ' + Buffer.byteLength(newRaw, 'utf8'));
console.log('Post-write LE:    ' + (newUsesCRLF ? 'CRLF' : 'LF') + (newUsesCRLF === usesCRLF ? ' (preserved)' : ' (DRIFT)'));
console.log('Byte delta:       +' + (Buffer.byteLength(newRaw, 'utf8') - Buffer.byteLength(raw, 'utf8')));
console.log('');

const checks = [
  { label: 'T6d-3 marker present',                     re: /T6d-3 error capture/ },
  { label: 'sessionUpdateError destructure',           re: /const \{ error: sessionUpdateError \}/ },
  { label: 'sessionUpdate console.error log',          re: /chat_sessions update failed/ },
  { label: 'overrideError destructure',                re: /const \{ error: overrideError \}/ },
  { label: 'overrideError console.error log',          re: /user_credit_overrides upsert failed/ },
];
for (const c of checks) {
  const hit = c.re.test(newContent);
  console.log('  [' + (hit ? 'OK ' : 'FAIL') + '] ' + c.label.padEnd(48) + ' hit=' + hit);
}

console.log('');
console.log('=== Patch complete ===');