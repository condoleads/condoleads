#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const TRACKER = path.resolve('docs/W-LEADS-EMAIL-TRACKER.md');
const T6D_HASH = '2b0dce6';

if (!fs.existsSync(TRACKER)) { console.error('FAIL: tracker not found'); process.exit(1); }

const raw = fs.readFileSync(TRACKER, 'utf8');
const usesCRLF = /\r\n/.test(raw);
const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw;

console.log('=== Pre-patch state ===');
console.log('Bytes: ' + Buffer.byteLength(raw, 'utf8'));
console.log('LE:    ' + (usesCRLF ? 'CRLF' : 'LF'));
console.log('T6d hash: ' + T6D_HASH);

const v19Count = (content.match(/v19/g) || []).length;
if (v19Count > 0) { console.error('FAIL: v19 already present (' + v19Count + ')'); process.exit(1); }
console.log('Idempotency OK.');
console.log('');

const P1_OLD = '**Version:** v18 — T6f-C CLOSED 2026-05-11 (C-1 + C-2 shipped)';
const P1_NEW = '**Version:** v19 — T6d CLOSED 2026-05-11 (T6d-1 + T6d-2 + T6d-3 shipped)';

const P2_OLD = '**T6 phase IN PROGRESS — T6a + T6b + T6c + T6f-A + T6f-B (B-1 + B-2 + B-3 + B-4) + T6f-C (C-1 + C-2) ✅ CLOSED 2026-05-11.**';
const P2_NEW = '**T6 phase IN PROGRESS — T6a + T6b + T6c + T6f-A + T6f-B (B-1 + B-2 + B-3 + B-4) + T6f-C (C-1 + C-2) + T6d (T6d-1 + T6d-2 + T6d-3) ✅ CLOSED 2026-05-11.**';

const P3_OLD = '**Next: T6 continues — T6d (VIP auto-approve fixes — F-VIP-AUTO-APPROVE-ONLY-WRITES-BUYER-PLAN-LIMIT + F-VIP-AUTO-APPROVE-USES-CHAT-LIMIT-FOR-PLAN-REQUESTS in walliam/charlie/vip-request), T6e (plan integration verification per OD-4=(c)). T6f-C fully closed: C-1 walliam/contact (commit `655ed9b`) + C-2 walliam/charlie/vip-approve (commit `d73ee70`). T6f-B fully closed: B-1 + B-2 (commit `99de227` v16) + B-3 (commit `60bc358`) + B-4 (commit `529aeae`).**';
const P3_NEW = '**Next: T6 continues — T6e (plan integration verification per OD-4=(c) — final T6 sub-phase). T6d fully closed: T6d-1 channel-aware auto-approve config + T6d-2 schema migration (granted_by_tier CHECK relaxation adding \'auto\') + T6d-3 defensive error capture, single commit `' + T6D_HASH + '`. T6f-C fully closed: C-1 walliam/contact (commit `655ed9b`) + C-2 walliam/charlie/vip-approve (commit `d73ee70`). T6f-B fully closed: B-1 + B-2 (commit `99de227` v16) + B-3 (commit `60bc358`) + B-4 (commit `529aeae`).**';

const V18_PREFIX = '- **2026-05-11 v18 T6f-C CLOSED — brand-strings + URL refactor across 2 walliam routes (walliam/contact + walliam/charlie/vip-approve)** — T6f-C sub-phase complete (C-1 + C-2 paired close,';

const V19_ENTRY = '- **2026-05-11 v19 T6d CLOSED — VIP auto-approve bug fixes (channel-aware config) + schema migration + defensive hardening (3 sub-phases, single commit `' + T6D_HASH + '`)** — Comprehensive close of 2 stated findings + 1 latent finding surfaced mid-fix by synthetic verify + 2 defensive hardening patches in walliam/charlie/vip-request auto-approve path. **T6d-1 (route patch, channel-aware config):** introduced 4-way channel discriminator from planType (chat / buyer_plan / seller_plan / estimator). Channel-aware lookups across 4 axes: VIP toggle (vip_auto_approve / plan_vip_auto_approve / estimator_vip_auto_approve — buyer/seller plans share plan_vip_auto_approve per schema, no separate seller toggle exists); auto-approve limit (ai_auto_approve_limit / plan_auto_approve_limit / seller_plan_auto_approve_limit / estimator_auto_approve_attempts); hard cap (ai_hard_cap / plan_hard_cap / seller_plan_hard_cap / estimator_hard_cap); user_credit_overrides target column (ai_chat_limit / buyer_plan_limit / seller_plan_limit / estimator_limit). 4 atomic anchor-validated patches via `scripts/patch-t6d-vip-request-wire.js`: P1 channel decl after planType extraction; P2 tenant SELECT extended with 5 new fields (plan_vip_auto_approve, estimator_vip_auto_approve, seller_plan_auto_approve_limit, seller_plan_hard_cap, estimator_auto_approve_attempts); P3 isAutoApprove + autoApproveMessages via vipToggle + autoApproveLimit branching; P4 currentUsed→newLimit→upsert via channelHardCap + overrideColumn + computed-key payload [overrideColumn]: newLimit. Closes F-VIP-AUTO-APPROVE-USES-CHAT-LIMIT-FOR-PLAN-REQUESTS (isAutoApprove checked ai_auto_approve_limit/chat config for plan flow) + F-VIP-AUTO-APPROVE-ONLY-WRITES-BUYER-PLAN-LIMIT (upsert hardcoded buyer_plan_limit regardless of planType, silently no-op\'d seller path). **T6d-2 (schema migration — latent finding surfaced by synthetic verify):** `scripts/verify-t6d-auto-approve-channel.js` (exercising mutated tenant config + DB-level write inspection) caught a bug smoke could never catch — `user_credit_overrides.granted_by_tier` CHECK constraint only allowed {admin, manager, managed}; route writes \'auto\' on auto-approve path causing PG error 23514 (check_violation) silently swallowed by PostgREST. Bug was TRIPLE-MASKED: (a) WALLiam never had auto-approve config enabled in production, (b) T6d-1\'s bug above made isAutoApprove always false even with config set, (c) silent error swallowing on the upsert response. Bug would have shipped to production undetected without the synthetic verify. Migration `supabase/migrations/20260511_t6d_add_auto_to_granted_by_tier_check.sql` (+ rollback at `..._rollback.sql`) drops + re-adds CHECK with \'auto\' included; semantic preserves audit trail (auto-grants distinct from human-clicker tiers admin/manager/managed). Applied via `scripts/apply-t6d-granted-by-tier-migration.js` with pre/post snapshot. New finding logged: F-USER-CREDIT-OVERRIDES-GRANTED-BY-TIER-CHECK-MISSING-AUTO (CLOSED in T6d-2). **T6d-3 (defensive error capture):** 2 atomic patches via `scripts/patch-t6d-3-error-capture.js` — P1 `chat_sessions.update` at L274-L282 captures { error: sessionUpdateError } + console.error; P2 `user_credit_overrides.upsert` at L288-L296 captures { error: overrideError } + console.error. Success behavior unchanged; failures now logged to dev-server.log + Vercel. Future schema mismatches or RLS issues no longer silently corrupt state. **TSC silent both patches.** **Synthetic verify GREEN end-to-end:** buyer planType → HTTP 200 status=approved granted=2 buyer_plan_limit=2 others NULL channel-correct+grant-correct; seller planType → granted=3 seller_plan_limit=3 channel-correct+grant-correct; tenant config restored to identical pre-test state after each run. **Smoke 9/9 GREEN as regression guard** (T3b 4/4 + T3c 5/5; T6d-3 doesn\'t affect smoke paths since smoke doesn\'t exercise auto-approve). For WALLiam tenant `b16e1039-38ed-43d7-bbc5-dd02bb651bc9` with current config (plan_vip_auto_approve=false, plan_auto_approve_limit=0) auto-approve path doesn\'t fire — observable behavior identical to pre-T6d. Fix becomes observable when any tenant enables plan_vip_auto_approve=true with plan_auto_approve_limit>0. **Findings logged for future (out of T6d scope):** F-CHARLIE-VIP-REQUEST-AUTO-APPROVE-NON-TRANSACTIONAL (Tlast — 3 sequential writes in auto-approve path have no transactional rollback; T6d-3 makes failures visible, proper fix needs DB transaction or app-level rollback); F-VIP-REQUESTS-REQUEST-TYPE-DROPS-BUYER-SELLER-DISCRIMINATOR (accepted gap — vip_requests.request_type CHECK is (plan, chat, estimator), buyer-vs-seller signal preserved via user_credit_overrides column choice + leads.intent but not on vip_requests row itself); F-LEAD-EMAIL-RECIPIENTS-LOG-ORPHAN-LEAD-IDS (Tlast cleanup — append-only audit table per T2f trigger; orphan lead_id rows accumulate after lead deletion). **Lessons logged:** (1) Silent error swallowing in bare await supabase.* calls is a SYSTEMIC RISK across 7 lead-writing routes; T6d-3 hardened 2 in auto-approve path; full sweep is a future hardening phase candidate. (2) Synthetic fix verification (mutated tenant config + DB-level write inspection of actual code path) catches bugs that positive-path-only regression smoke cannot — T6d verify caught the granted_by_tier CHECK bug that would have shipped silently. (3) Re-logged from T6f-C: git log --grep unreliable for sub-phase identification (commit bodies cross-reference adjacent sub-phases); use git log -N --oneline main with explicit subject inspection. **Files in v19 scope:** 1 modified route (`app/api/walliam/charlie/vip-request/route.ts` 19155→21261 bytes, +2106), 1 new T6d recon probe, 1 new T6d-1 wire patch, 1 new T6d synthetic verify (reusable test artifact), 1 new constraint diagnostic probe, 1 new T6d-2 migration runner, 1 new T6d-3 wire patch, 2 new SQL migration files (forward + rollback), `scripts/patch-w-leads-email-tracker-v19.js` (this script), and `docs/W-LEADS-EMAIL-TRACKER.md` (v18→v19). All shipped in commit `' + T6D_HASH + '`. **Next:** T6e (plan integration verification per OD-4=(c) — final T6 sub-phase). After T6 close: T7 smoke matrix with cross-tenant regression guards (covers new T6d findings + 2 neighbourhood findings F-SLUG-ROUTER-MISSING-NEIGHBOURHOOD-BRANCH + F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER from T5 closure), T8 sweep, Tlast workstream close.';

const P4_OLD = V18_PREFIX;
const P4_NEW = V19_ENTRY + '\n' + V18_PREFIX;

const patches = [
  { name: 'P1 version header v18 -> v19', old: P1_OLD, new: P1_NEW },
  { name: 'P2 L4 phase progress segment', old: P2_OLD, new: P2_NEW },
  { name: 'P3 L4 Next: pointer rewrite ', old: P3_OLD, new: P3_NEW },
  { name: 'P4 insert v19 entry above v18', old: P4_OLD, new: P4_NEW },
];

console.log('=== Atomic validation (1x match per patch) ===');
let working = content;
for (const p of patches) {
  const occ = working.split(p.old).length - 1;
  console.log('  ' + p.name + ': ' + occ + ' match(es)');
  if (occ !== 1) {
    console.error('FAIL: ' + p.name + ' expected 1 match, found ' + occ);
    console.error('First 240 chars of OLD anchor:');
    console.error(p.old.slice(0, 240));
    process.exit(1);
  }
}
console.log('All 4 anchors validated.');
console.log('');

const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15);
const backupPath = TRACKER + '.backup_' + stamp;
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
fs.writeFileSync(TRACKER, out, 'utf8');
console.log('Tracker written: ' + path.relative(process.cwd(), TRACKER));

const newRaw = fs.readFileSync(TRACKER, 'utf8');
const newUsesCRLF = /\r\n/.test(newRaw);
const newContent = newUsesCRLF ? newRaw.replace(/\r\n/g, '\n') : newRaw;
const newLines = newContent.split('\n');

console.log('');
console.log('=== Post-patch verification ===');
console.log('Post-write bytes: ' + Buffer.byteLength(newRaw, 'utf8'));
console.log('Post-write LE:    ' + (newUsesCRLF ? 'CRLF' : 'LF') + (newUsesCRLF === usesCRLF ? ' (preserved)' : ' (DRIFT)'));
console.log('Byte delta:       +' + (Buffer.byteLength(newRaw, 'utf8') - Buffer.byteLength(raw, 'utf8')));
console.log('');

const v19Marker = (newContent.match(/v19/g) || []).length;
console.log('v19 marker count: ' + v19Marker + ' (pre-patch 0)');

const verIdx = newLines.findIndex(l => /^\*\*Version:\*\*/.test(l));
console.log('L' + (verIdx + 1) + ' version: ' + newLines[verIdx]);

const v19Idx = newLines.findIndex(l => /^- \*\*2026-05-11 v19 T6d CLOSED/.test(l));
const v18Idx = newLines.findIndex(l => /^- \*\*2026-05-11 v18 T6f-C CLOSED/.test(l));
console.log('v19 entry line:   L' + (v19Idx + 1));
console.log('v18 entry line:   L' + (v18Idx + 1));
console.log('Adjacency:        ' + (v18Idx === v19Idx + 1 ? 'OK (v18 directly below v19)' : 'DRIFT'));

const phaseMatch = newContent.match(/T6f-C \(C-1 \+ C-2\) \+ T6d \(T6d-1 \+ T6d-2 \+ T6d-3\) ✅ CLOSED/);
console.log('P2 applied (T6d in phase progress):  ' + (phaseMatch ? 'YES' : 'NO'));

const nextMatch = newContent.match(/\*\*Next: T6 continues — T6e \(plan integration verification/);
console.log('P3 applied (T6e as next sub-phase):  ' + (nextMatch ? 'YES' : 'NO'));

const t6dHashIn = newContent.includes('`' + T6D_HASH + '`');
console.log('T6d hash ' + T6D_HASH + ' in tracker:        ' + t6dHashIn);

console.log('');
console.log('=== Patch complete ===');