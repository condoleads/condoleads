#!/usr/bin/env node
/**
 * patch-w-leads-email-tracker-v18.js
 *
 * Closes T6f-C sub-phase in W-LEADS-EMAIL workstream.
 * Mirrors v17 patch structure (B-3 + B-4 paired close) for v18 (C-1 + C-2 paired close).
 *
 * 4 atomic patches:
 *   P1: L3 version header v17 -> v18
 *   P2: L4 phase progress segment - append "+ T6f-C (C-1 + C-2)"
 *   P3: L4 Next: pointer - rewrite from T6f-C to T6d; append C-1 + C-2 closure
 *   P4: Insert new v18 status log entry above v17 entry at L618
 *
 * CRLF-aware: file is CRLF, normalized on read, preserved on write.
 * Backup-on-write: timestamped .backup file before mutation.
 * Idempotency: aborts if "v18" already present in tracker.
 *
 * Verified inputs (Paste 58 git probe):
 *   T6f-C-1 commit: 655ed9b (walliam/contact, Shape D)
 *   T6f-C-2 commit: d73ee70 (walliam/charlie/vip-approve, Shape ~A)
 */

const fs = require('fs');
const path = require('path');

const TRACKER = path.resolve('docs/W-LEADS-EMAIL-TRACKER.md');

if (!fs.existsSync(TRACKER)) {
  console.error('FAIL: tracker not found at ' + TRACKER);
  process.exit(1);
}

const raw = fs.readFileSync(TRACKER, 'utf8');
const usesCRLF = /\r\n/.test(raw);
const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw;

console.log('=== Pre-patch state ===');
console.log('Bytes: ' + Buffer.byteLength(raw, 'utf8'));
console.log('LE:    ' + (usesCRLF ? 'CRLF' : 'LF'));

// Idempotency
const v18Count = (content.match(/v18/g) || []).length;
if (v18Count > 0) {
  console.error('FAIL: tracker already contains "v18" (' + v18Count + ' occurrences). Aborting before any mutation.');
  process.exit(1);
}
console.log('Idempotency OK: v18 absent in pre-patch content.');
console.log('');

// ============================================================================
// P1: Version header (L3)
// ============================================================================
const P1_OLD = '**Version:** v17 — T6f-B FULLY CLOSED 2026-05-11 (B-1 + B-2 + B-3 + B-4 all shipped)';
const P1_NEW = '**Version:** v18 — T6f-C CLOSED 2026-05-11 (C-1 + C-2 shipped)';

// ============================================================================
// P2: L4 phase progress inline segment
// ============================================================================
const P2_OLD = '**T6 phase IN PROGRESS — T6a + T6b + T6c + T6f-A + T6f-B (B-1 + B-2 + B-3 + B-4) ✅ CLOSED 2026-05-11.**';
const P2_NEW = '**T6 phase IN PROGRESS — T6a + T6b + T6c + T6f-A + T6f-B (B-1 + B-2 + B-3 + B-4) + T6f-C (C-1 + C-2) ✅ CLOSED 2026-05-11.**';

// ============================================================================
// P3: L4 Next: pointer rewrite (T6f-C -> T6d, append C-1+C-2 closure tail)
// ============================================================================
const P3_OLD = '**Next: T6 continues — T6f-C (walliam/charlie/vip-approve + walliam/contact with new tenant load via getTenantContext helper from T6f-A + T6c-leftover cleanup at contact L113/L175), T6d (VIP auto-approve fixes), T6e (plan integration verification per OD-4=(c)). T6f-B fully closed: B-1 + B-2 (commit `99de227` v16) + B-3 (commit `60bc358`) + B-4 (commit `529aeae`).**';
const P3_NEW = '**Next: T6 continues — T6d (VIP auto-approve fixes — F-VIP-AUTO-APPROVE-ONLY-WRITES-BUYER-PLAN-LIMIT + F-VIP-AUTO-APPROVE-USES-CHAT-LIMIT-FOR-PLAN-REQUESTS in walliam/charlie/vip-request), T6e (plan integration verification per OD-4=(c)). T6f-C fully closed: C-1 walliam/contact (commit `655ed9b`) + C-2 walliam/charlie/vip-approve (commit `d73ee70`). T6f-B fully closed: B-1 + B-2 (commit `99de227` v16) + B-3 (commit `60bc358`) + B-4 (commit `529aeae`).**';

// ============================================================================
// P4: Insert v18 entry above v17 entry (L618)
// Anchor on v17 line opening prefix (220 chars - probe-verified unique)
// ============================================================================
const V17_PREFIX = '- **2026-05-11 v17 T6f-B FULLY CLOSED — brand-strings + URL refactor across remaining 2 estimator routes (vip-approve + vip-request)** — T6f-B sub-phase complete: v16 captured B-1 + B-2 closure;';

const V18_ENTRY = '- **2026-05-11 v18 T6f-C CLOSED — brand-strings + URL refactor across 2 walliam routes (walliam/contact + walliam/charlie/vip-approve)** — T6f-C sub-phase complete (C-1 + C-2 paired close, matching v15→v16 B-1+B-2 and v16→v17 B-3+B-4 pairing pattern). **T6f-C-1 (walliam/contact, commit `655ed9b`):** Shape D (no session/auth gate — pure POST handler with body params per commit subject). Brand-strings + sourceKey refactor: T6c-leftover cleanup at L113/L175 source literals + first-time tenant load via `getTenantContext` helper from T6f-A (route previously had zero tenant SELECT per v15 forward reference; `getTenantContext` designed precisely for this case — extends the helper from passive utility to primary tenant entry point for routes with no existing config-driven SELECT). **T6f-C-2 (walliam/charlie/vip-approve, commit `d73ee70`):** 246-line CRLF no-BOM file, 15 atomic anchor-validated patches via `scripts/patch-t6f-c-2-vip-approve-wire.js` (10924 bytes). Shape ~A (GET landing-page handler with token-based auth via approval_token URL param — NOT Shape A despite route family name; uses direct supabase queries with no validateSession call). Mirrors T6f-B-3 estimator/vip-approve pattern (production-smoke-verified at commit `60bc358`). **Anchors:** (A1) import `getTenantContext` + `buildBaseUrl` from `lib/utils/tenant-brand`; (A2) brand-load block inserted INSIDE try block after L49 vipRequest non-null check — uses `vipRequest.chat_sessions?.tenant_id` (chat_sessions JOIN at L37-L44 returns session-of-origin), soft-null-fallback to empty brand vars when brandTenantId is null (defensive for orphan vip_requests rows); (A3-A8) 8 createHtmlResponse + buildUserApprovalEmailHtml call sites extended with brandName / domain / baseUrl; (A9-A13) helper body sites — subject, agent fallback, wordmark, inline URL, link text all templated; (A14) createHtmlResponse signature adds `brandName: string = \'\'` defaulted param — backward-compatible (3 pre-vipRequest sites + catch-block site stay 2-arg, only 4 post-vipRequest sites get 3-arg); (A15) L234 title conditional prefix `${brandName ? brandName + \' - \' : \'\'}${cfg.title}` — graceful degrade when brandName empty. **Design decision logged:** scope-isolated brand-load block inside try (not hoisted to handler scope) — catch-path error pages lose brand prefix but architecture stays clean. **Multitenant safety:** vipRequest.chat_sessions JOIN guarantees session row co-resolved; brandTenantId derived from `vipRequest.chat_sessions.tenant_id` (not vipRequest.tenant_id directly) per established sessionTenantId pattern. **TSC silent both patches. Smoke 9/9 GREEN as regression guard** (T3b 4/4 + T3c 5/5). No tier directly exercises walliam/charlie/vip-approve — primary correctness confidence: TSC silence + symmetric-pattern match with T6f-B-3 (production-smoke-verified) + atomic anchor validation (1× match per anchor caught any whitespace drift before write). For WALLiam tenant `b16e1039-38ed-43d7-bbc5-dd02bb651bc9` brandName resolves to "WALLiam" via tenant.brand_name||tenant.name fallback chain — observable behavior byte-identical to pre-refactor for tenant-1, multitenant-correct for tenant-2+ onboarding. **Lesson logged (Paste 58 git probe):** `git log --grep` is unreliable for sub-phase identification because commit message bodies cross-reference adjacent sub-phases (T6f-C-2\'s message body references "T6f-C-1" in prose, causing `--grep=\'T6f-C-1\'` to match the C-2 commit, not C-1); authoritative source is `git log -N --oneline main` with explicit subject inspection. **Files in v18 scope:** 2 modified routes (`app/api/walliam/contact/route.ts` at commit `655ed9b`, `app/api/walliam/charlie/vip-approve/route.ts` at commit `d73ee70`), 1 new wire patch script (`scripts/patch-t6f-c-2-vip-approve-wire.js`), 1 tracker state probe script (`scripts/probe-w-leads-email-tracker-v17-state.js`), `scripts/patch-w-leads-email-tracker-v18.js` (this script), and `docs/W-LEADS-EMAIL-TRACKER.md` (v17 → v18 in this script). **Next:** T6d (VIP auto-approve fixes — F-VIP-AUTO-APPROVE-ONLY-WRITES-BUYER-PLAN-LIMIT + F-VIP-AUTO-APPROVE-USES-CHAT-LIMIT-FOR-PLAN-REQUESTS in walliam/charlie/vip-request, isolated bug fixes predating this session), T6e (plan integration verification per OD-4=(c)). After T6: T7 smoke matrix with cross-tenant regression guards, T8 sweep, Tlast close.';

const P4_OLD = V17_PREFIX;
const P4_NEW = V18_ENTRY + '\n' + V17_PREFIX;

// ============================================================================
// Atomic validation - all anchors must match exactly 1x before any write
// ============================================================================
const patches = [
  { name: 'P1 version header v17 -> v18', old: P1_OLD, new: P1_NEW },
  { name: 'P2 L4 phase progress segment', old: P2_OLD, new: P2_NEW },
  { name: 'P3 L4 Next: pointer rewrite ', old: P3_OLD, new: P3_NEW },
  { name: 'P4 insert v18 entry above v17', old: P4_OLD, new: P4_NEW },
];

console.log('=== Atomic validation (1x match required per patch) ===');
let working = content;
for (const p of patches) {
  const occ = working.split(p.old).length - 1;
  console.log('  ' + p.name + ': ' + occ + ' match(es)');
  if (occ === 0) {
    console.error('');
    console.error('FAIL: ' + p.name + ' - anchor not found.');
    console.error('First 220 chars of anchor:');
    console.error(p.old.slice(0, 220));
    process.exit(1);
  }
  if (occ !== 1) {
    console.error('');
    console.error('FAIL: ' + p.name + ' - expected 1 match, found ' + occ);
    console.error('First 220 chars of anchor:');
    console.error(p.old.slice(0, 220));
    process.exit(1);
  }
}
console.log('All 4 anchors validated atomically.');
console.log('');

// ============================================================================
// Backup before write (Rule Zero - backup before touching existing files)
// ============================================================================
const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15);
const backupPath = TRACKER + '.backup_' + stamp;
fs.writeFileSync(backupPath, raw, 'utf8');
console.log('Backup written: ' + path.relative(process.cwd(), backupPath));
console.log('Backup bytes:   ' + Buffer.byteLength(raw, 'utf8'));
console.log('');

// ============================================================================
// Apply patches in order
// ============================================================================
console.log('=== Applying patches ===');
for (const p of patches) {
  working = working.replace(p.old, p.new);
  console.log('  ' + p.name + ': applied');
}
console.log('');

// Preserve original line endings on write
const out = usesCRLF ? working.replace(/\n/g, '\r\n') : working;
fs.writeFileSync(TRACKER, out, 'utf8');
console.log('Tracker written: ' + path.relative(process.cwd(), TRACKER));

// ============================================================================
// Post-patch verification
// ============================================================================
const newRaw = fs.readFileSync(TRACKER, 'utf8');
const newUsesCRLF = /\r\n/.test(newRaw);
const newContent = newUsesCRLF ? newRaw.replace(/\r\n/g, '\n') : newRaw;
const newLines = newContent.split('\n');

console.log('');
console.log('=== Post-patch verification ===');
console.log('Post-write bytes: ' + Buffer.byteLength(newRaw, 'utf8'));
console.log('Post-write LE:    ' + (newUsesCRLF ? 'CRLF' : 'LF') + (newUsesCRLF === usesCRLF ? ' (preserved)' : ' (DRIFT - investigate)'));
console.log('Byte delta:       +' + (Buffer.byteLength(newRaw, 'utf8') - Buffer.byteLength(raw, 'utf8')));
console.log('');

// Verify v18 marker present
const v18MarkerCount = (newContent.match(/v18/g) || []).length;
console.log('v18 marker count (post-patch): ' + v18MarkerCount + ' (pre-patch was 0)');

// Verify version header L3
const versionLineIdx = newLines.findIndex(l => /^\*\*Version:\*\*/.test(l));
if (versionLineIdx >= 0) {
  console.log('L' + (versionLineIdx + 1) + ' version: ' + newLines[versionLineIdx]);
}

// Verify v18 entry exists immediately above v17 entry
const v18EntryIdx = newLines.findIndex(l => /^- \*\*2026-05-11 v18 T6f-C CLOSED/.test(l));
const v17EntryIdx = newLines.findIndex(l => /^- \*\*2026-05-11 v17 T6f-B FULLY CLOSED/.test(l));
console.log('v18 entry line:   L' + (v18EntryIdx + 1));
console.log('v17 entry line:   L' + (v17EntryIdx + 1));
console.log('Adjacency:        ' + (v17EntryIdx === v18EntryIdx + 1 ? 'OK (v17 directly below v18)' : 'DRIFT - investigate'));

// Verify T6f-C marker in phase-progress segment (P2 applied)
const phaseProgressMatch = newContent.match(/T6f-B \(B-1 \+ B-2 \+ B-3 \+ B-4\) \+ T6f-C \(C-1 \+ C-2\) ✅ CLOSED/);
console.log('P2 applied (T6f-C in phase-progress segment): ' + (phaseProgressMatch ? 'YES' : 'NO'));

// Verify T6d in Next: pointer (P3 applied)
const nextPointerMatch = newContent.match(/\*\*Next: T6 continues — T6d \(VIP auto-approve fixes/);
console.log('P3 applied (T6d as next sub-phase):           ' + (nextPointerMatch ? 'YES' : 'NO'));

// Verify C-1 and C-2 commit hashes captured in tracker
const c1HashIn = newContent.includes('`655ed9b`');
const c2HashIn = newContent.includes('`d73ee70`');
console.log('C-1 commit hash 655ed9b in tracker: ' + c1HashIn);
console.log('C-2 commit hash d73ee70 in tracker: ' + c2HashIn);

console.log('');
console.log('=== Patch complete ===');