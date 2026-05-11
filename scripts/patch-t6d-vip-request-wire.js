#!/usr/bin/env node
/**
 * patch-t6d-vip-request-wire.js
 *
 * Fixes 2 VIP auto-approve bugs in app/api/walliam/charlie/vip-request/route.ts:
 *   - F-VIP-AUTO-APPROVE-USES-CHAT-LIMIT-FOR-PLAN-REQUESTS (isAutoApprove checks ai_* for plan flow)
 *   - F-VIP-AUTO-APPROVE-ONLY-WRITES-BUYER-PLAN-LIMIT (seller path writes wrong column)
 *
 * Architecture: channel-aware config lookup. Discriminator `channel` derived from planType.
 * 4-way: 'chat' | 'buyer_plan' | 'seller_plan' | 'estimator'.
 *
 * 4 atomic anchor-validated patches:
 *   P1: Channel declaration after planType extraction
 *   P2: Tenant SELECT - add 5 fields (plan_vip_auto_approve, estimator_vip_auto_approve,
 *       seller_plan_auto_approve_limit, seller_plan_hard_cap, estimator_auto_approve_attempts)
 *   P3: isAutoApprove / autoApproveMessages computation - channel-aware via vipToggle + autoApproveLimit
 *   P4: currentUsed -> newLimit -> upsert block - channelHardCap + overrideColumn + computed-key payload
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
console.log('Path:  ' + path.relative(process.cwd(), ROUTE));
console.log('Bytes: ' + Buffer.byteLength(raw, 'utf8'));
console.log('LE:    ' + (usesCRLF ? 'CRLF' : 'LF'));

// Idempotency - check for T6d marker
if (content.includes('// T6d - channel discriminator')) {
  console.error('FAIL: T6d marker already present. Patch is idempotent - aborting.');
  process.exit(1);
}
console.log('Idempotency OK.');
console.log('');

// ============================================================================
// P1: Channel declaration after planType extraction
// ============================================================================
const P1_OLD =
  "    const { sessionId, planType } = await request.json()\n" +
  "    // planType: 'buyer' | 'seller'\n" +
  "\n" +
  "    // W-RECOVERY A1.5 auth gate (part 1) — block requests without sessionId\n";

const P1_NEW =
  "    const { sessionId, planType } = await request.json()\n" +
  "    // planType: 'buyer' | 'seller' | 'chat' | 'estimator'\n" +
  "\n" +
  "    // T6d - channel discriminator for VIP auto-approve config + credit-override column\n" +
  "    // F-VIP-AUTO-APPROVE-USES-CHAT-LIMIT-FOR-PLAN-REQUESTS + F-VIP-AUTO-APPROVE-ONLY-WRITES-BUYER-PLAN-LIMIT\n" +
  "    const channel: 'chat' | 'buyer_plan' | 'seller_plan' | 'estimator' =\n" +
  "      planType === 'chat' ? 'chat' :\n" +
  "      planType === 'estimator' ? 'estimator' :\n" +
  "      planType === 'seller' ? 'seller_plan' :\n" +
  "      'buyer_plan'\n" +
  "\n" +
  "    // W-RECOVERY A1.5 auth gate (part 1) — block requests without sessionId\n";

// ============================================================================
// P2: Extend tenant SELECT to load 5 new fields
// ============================================================================
const P2_OLD =
  "      .select('source_key, name, brand_name, domain, assistant_name, vip_auto_approve, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap, plan_auto_approve_limit, plan_manual_approve_limit, plan_hard_cap, estimator_manual_approve_attempts, estimator_hard_cap')";

const P2_NEW =
  "      .select('source_key, name, brand_name, domain, assistant_name, vip_auto_approve, plan_vip_auto_approve, estimator_vip_auto_approve, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap, plan_auto_approve_limit, plan_manual_approve_limit, plan_hard_cap, seller_plan_auto_approve_limit, seller_plan_hard_cap, estimator_auto_approve_attempts, estimator_manual_approve_attempts, estimator_hard_cap')";

// ============================================================================
// P3: isAutoApprove / autoApproveMessages computation - channel-aware
// ============================================================================
const P3_OLD =
  "    // Use tenant config for credit decisions\n" +
  "    const isAutoApprove = tenantConfig.vip_auto_approve === true && (tenantConfig.ai_auto_approve_limit ?? 0) > 0\n" +
  "    const autoApproveMessages = tenantConfig.ai_auto_approve_limit ?? 0\n";

const P3_NEW =
  "    // Use tenant config for credit decisions - channel-aware per T6d\n" +
  "    const vipToggle =\n" +
  "      channel === 'chat' ? tenantConfig.vip_auto_approve === true :\n" +
  "      channel === 'estimator' ? tenantConfig.estimator_vip_auto_approve === true :\n" +
  "      tenantConfig.plan_vip_auto_approve === true\n" +
  "    const autoApproveLimit =\n" +
  "      channel === 'chat' ? (tenantConfig.ai_auto_approve_limit ?? 0) :\n" +
  "      channel === 'estimator' ? (tenantConfig.estimator_auto_approve_attempts ?? 0) :\n" +
  "      channel === 'seller_plan' ? (tenantConfig.seller_plan_auto_approve_limit ?? 0) :\n" +
  "      (tenantConfig.plan_auto_approve_limit ?? 0)\n" +
  "    const isAutoApprove = vipToggle && autoApproveLimit > 0\n" +
  "    const autoApproveMessages = autoApproveLimit\n";

// ============================================================================
// P4: currentUsed -> newLimit -> upsert block (channel-aware hard-cap + column write)
// ============================================================================
const P4_OLD =
  "        const currentUsed = (session.buyer_plans_used || 0) + (session.seller_plans_used || 0)\n" +
  "        const newLimit = Math.min(currentUsed + autoApproveMessages, tenantConfig.plan_hard_cap ?? 10)\n" +
  "        await supabase.from('user_credit_overrides').upsert({\n" +
  "          user_id: session.user_id,\n" +
  "          tenant_id: tenantId,\n" +
  "          granted_by_agent_id: agent?.id || null,\n" +
  "          granted_by_tier: 'auto',\n" +
  "          note: 'Auto-approved — ' + autoApproveMessages + ' credits',\n" +
  "          buyer_plan_limit: newLimit,\n" +
  "          granted_at: new Date().toISOString(),\n" +
  "        }, { onConflict: 'user_id,tenant_id' })\n";

const P4_NEW =
  "        const currentUsed = (session.buyer_plans_used || 0) + (session.seller_plans_used || 0)\n" +
  "        const channelHardCap =\n" +
  "          channel === 'chat' ? (tenantConfig.ai_hard_cap ?? 10) :\n" +
  "          channel === 'estimator' ? (tenantConfig.estimator_hard_cap ?? 10) :\n" +
  "          channel === 'seller_plan' ? (tenantConfig.seller_plan_hard_cap ?? 10) :\n" +
  "          (tenantConfig.plan_hard_cap ?? 10)\n" +
  "        const newLimit = Math.min(currentUsed + autoApproveMessages, channelHardCap)\n" +
  "        const overrideColumn: 'ai_chat_limit' | 'buyer_plan_limit' | 'seller_plan_limit' | 'estimator_limit' =\n" +
  "          channel === 'chat' ? 'ai_chat_limit' :\n" +
  "          channel === 'estimator' ? 'estimator_limit' :\n" +
  "          channel === 'seller_plan' ? 'seller_plan_limit' :\n" +
  "          'buyer_plan_limit'\n" +
  "        await supabase.from('user_credit_overrides').upsert({\n" +
  "          user_id: session.user_id,\n" +
  "          tenant_id: tenantId,\n" +
  "          granted_by_agent_id: agent?.id || null,\n" +
  "          granted_by_tier: 'auto',\n" +
  "          note: 'Auto-approved — ' + autoApproveMessages + ' credits',\n" +
  "          [overrideColumn]: newLimit,\n" +
  "          granted_at: new Date().toISOString(),\n" +
  "        }, { onConflict: 'user_id,tenant_id' })\n";

// ============================================================================
// Atomic validation
// ============================================================================
const patches = [
  { name: 'P1 channel declaration after planType', old: P1_OLD, new: P1_NEW },
  { name: 'P2 tenant SELECT - 5 new fields  ',     old: P2_OLD, new: P2_NEW },
  { name: 'P3 channel-aware isAutoApprove   ',     old: P3_OLD, new: P3_NEW },
  { name: 'P4 channel-aware grant block     ',     old: P4_OLD, new: P4_NEW },
];

console.log('=== Atomic validation (1x match per anchor) ===');
let working = content;
for (const p of patches) {
  const occ = working.split(p.old).length - 1;
  console.log('  ' + p.name + ': ' + occ + ' match(es)');
  if (occ !== 1) {
    console.error('');
    console.error('FAIL: ' + p.name + ' - expected 1 match, found ' + occ);
    console.error('First 240 chars of OLD anchor:');
    console.error(p.old.slice(0, 240));
    process.exit(1);
  }
}
console.log('All 4 anchors validated atomically.');
console.log('');

// ============================================================================
// Backup
// ============================================================================
const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15);
const backupPath = ROUTE + '.backup_' + stamp;
fs.writeFileSync(backupPath, raw, 'utf8');
console.log('Backup written: ' + path.relative(process.cwd(), backupPath));
console.log('Backup bytes:   ' + Buffer.byteLength(raw, 'utf8'));
console.log('');

// ============================================================================
// Apply
// ============================================================================
console.log('=== Applying patches ===');
for (const p of patches) {
  working = working.replace(p.old, p.new);
  console.log('  ' + p.name + ': applied');
}
console.log('');

const out = usesCRLF ? working.replace(/\n/g, '\r\n') : working;
fs.writeFileSync(ROUTE, out, 'utf8');
console.log('Route written: ' + path.relative(process.cwd(), ROUTE));

// ============================================================================
// Post-verify
// ============================================================================
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
  { label: 'T6d channel marker',                       re: /\/\/ T6d - channel discriminator/ },
  { label: 'channel union-type decl',                  re: /channel: 'chat' \| 'buyer_plan' \| 'seller_plan' \| 'estimator'/ },
  { label: 'plan_vip_auto_approve in SELECT',          re: /plan_vip_auto_approve/ },
  { label: 'seller_plan_auto_approve_limit in SELECT', re: /seller_plan_auto_approve_limit/ },
  { label: 'estimator_auto_approve_attempts in SELECT',re: /estimator_auto_approve_attempts/ },
  { label: 'vipToggle decl present',                   re: /const vipToggle =/ },
  { label: 'autoApproveLimit decl present',            re: /const autoApproveLimit =/ },
  { label: 'channelHardCap decl present',              re: /const channelHardCap =/ },
  { label: 'overrideColumn decl present',              re: /const overrideColumn:/ },
  { label: 'computed-key write [overrideColumn]:',     re: /\[overrideColumn\]: newLimit/ },
  { label: 'OLD ai_auto_approve_limit isAutoApprove removed', re: /vip_auto_approve === true && \(tenantConfig\.ai_auto_approve_limit/, expected: false },
  { label: 'OLD buyer_plan_limit hardcoded write removed',    re: /\s+buyer_plan_limit: newLimit,/, expected: false },
];

for (const c of checks) {
  const hit = c.re.test(newContent);
  const expected = c.expected === false ? false : true;
  const pass = hit === expected;
  console.log('  [' + (pass ? 'OK ' : 'FAIL') + '] ' + c.label.padEnd(50) + ' hit=' + hit);
}

console.log('');
console.log('=== Patch complete ===');