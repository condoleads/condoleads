const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

let content = original.replace(/\r\n/g, '\n')

const replacements = [
  {
    name: 'Credit System row',
    old: '| Credit System (pools, gates, overrides, logging) | \u2705 | \ud83d\udfe1 | \ud83d\udfe1 | \u2705 | `lib/credits/resolveUserLimits.ts` (only file in dir, Apr 9) + `components/credits/CreditSessionContext.tsx` (Apr 29) + `app/charlie/hooks/useCharlie.ts` (Apr 29). `chat_messages_v2` writes from 2 sites in `/api/charlie/route.ts` \u2014 **64 rows logged Apr 29 \u2192 May 2 (Chunk 6 confirmed working, retires W-RECOVERY unverified flag)**. **GAPS:** `increment_chat_message_count` RPC NOT in codebase \u2014 W-CREDITS Phase 9 atomic counter never shipped (race condition possible). No `chat_messages_v2` rows last 3 days \u2014 needs verification (no traffic vs silent break). 2 stale `useCharlie.ts` backups on disk. W-CREDIT-VERIFY tracker open at `cd0fb14`. |',
    new: '| Credit System (pools, gates, overrides, logging) | \u2705 | \u2705 | \ud83d\udfe1 | \u2705 | `lib/credits/resolveUserLimits.ts` + `components/credits/CreditSessionContext.tsx` + `app/charlie/hooks/useCharlie.ts`. `chat_messages_v2` writes from 2 sites in `/api/charlie/route.ts` \u2014 64 rows logged Apr 29 \u2192 May 2 (Chunk 6 working). **Atomic counter SHIPPED** as W-CREDIT-VERIFY D0 (`increment_chat_session_counter` + `decrement_chat_session_counter`, parameterized whitelist, SECURITY DEFINER, UPDATE\u2026RETURNING row-lock). v3 claim retired \u2014 grep used wrong name. **Residual:** pre-increment gate uses stale msgUsed; concurrent race can soft-exceed cap by 1\u20132 \u2014 P1-6. **Open:** logging gap May 3\u20135 \u2014 P0-3. 2 stale `useCharlie.ts` backups on disk. |'
  },
  {
    name: 'Section 2 — Charlie route logging entry',
    old: '- **Charlie route \u2192 chat_messages_v2 logging**: \ud83d\udfe1 64 rows logged Apr 29\u2192May 2 (Chunk 6 working). **3-day gap May 3\u20135** \u2014 needs verification (no traffic vs silent break). No atomic increment RPC.',
    new: '- **Charlie route \u2192 chat_messages_v2 logging**: \ud83d\udfe1 64 rows logged Apr 29\u2192May 2 (Chunk 6 working). **3-day gap May 3\u20135** \u2014 needs verification (no traffic vs silent break) \u2014 P0-3.'
  },
  {
    name: 'Section 3 P0-2 entry',
    old: '**P0-2. W-CREDITS Phase 9 \u2014 atomic `increment_chat_message_count` RPC**\n- Symptom: read-then-write counter; race condition possible. 0 code or migration references found.\n- Verify: 10 parallel POSTs at msgUsed=23 \u2192 final counter \u2264 25; chat_messages_v2 row count matches.\n- Source: `Credit System \u2014 Sync & UX Plan.md`',
    new: '**P0-2. W-CREDITS Phase 9 \u2014 atomic increment RPC** \u2014 \u2705 **SHIPPED Apr 30** as W-CREDIT-VERIFY D0, migration `20260430_phase_d0_atomic_session_counters.sql`\n- Atomic RPC is `increment_chat_session_counter(p_session_id, p_counter)` + sibling `decrement_chat_session_counter`. Parameterized whitelist over 4 counter columns. `UPDATE\u2026RETURNING` with row-lock eliminates F5 race.\n- **v3 claim retired**: prior tracker said "never shipped" \u2014 grep used the W-CREDITS-plan name (`increment_chat_message_count`); actual function is `increment_chat_session_counter` (parameterized).\n- **Residual moved to P1-6**: post-increment cap check still missing.',
  },
  {
    name: 'Add P1-6 after P1-5',
    old: '**P1-5. Approvals + Tickets pages** (per Phase 3 nav spec)\n- Verify: pages exist, rendered for tenant_admin role.',
    new: '**P1-5. Approvals + Tickets pages** (per Phase 3 nav spec)\n- Verify: pages exist, rendered for tenant_admin role.\n\n**P1-6. Post-increment cap check (W-CREDITS Phase 9 polish)**\n- Symptom: pre-increment gate uses stale `msgUsed`. Concurrent same-user requests can soft-exceed cap by 1\u20132. Counter is correct (atomic), so subsequent requests are gated normally; soft over-cap is bounded.\n- Verify: 10 parallel POSTs at msgUsed=24 (cap=25) \u2192 final counter \u2264 25, no requests proceed past cap.\n- Fix shape: after `increment_chat_session_counter` returns `newMsgCount`, if `newMsgCount > chatAllowed`, call `decrement_chat_session_counter` and return gate. Same pattern at line 466 for plan counters (needs sum across buyer + seller for shared-pool semantics).'
  },
  {
    name: 'Section 4 W-CREDIT-VERIFY row',
    old: '| `docs/W-CREDIT-VERIFY-TRACKER.md` | OPEN @ `cd0fb14` (2026-05-02) | Phase C smoke + Phase D regression sweep not confirmed |',
    new: '| `docs/W-CREDIT-VERIFY-TRACKER.md` | OPEN @ `cd0fb14`; **Phase D0 (atomic counters) SHIPPED Apr 30** = P0-2 | Phase C smoke + Phase D regression sweep not confirmed |'
  },
  {
    name: 'Section 4 W-CREDITS Phase 9 row',
    old: '| W-CREDITS Phase 9 (no dedicated tracker) | DEFERRED | Atomic increment RPC \u2014 P0-2 |',
    new: '| W-CREDITS Phase 9 (now W-CREDIT-VERIFY D0) | SHIPPED Apr 30 = P0-2 | P1-6 (post-increment check) is residual polish |'
  },
  {
    name: 'Status line',
    old: '**Status:** TRACKER COMPLETE; **P0 execution: 1/5 shipped (P0-1 \u2705 2026-05-05)**.',
    new: '**Status:** TRACKER COMPLETE; **P0 execution: 2/5 shipped (P0-1 \u2705, P0-2 \u2705 2026-05-05)**.'
  },
  {
    name: 'Next action',
    old: '**P0-2 in progress: W-CREDITS Phase 9** \u2014 atomic `increment_chat_message_count` RPC. After P0-2 ships, P0-3 (logging continuity), P0-4 (R7 delegate BCC), P0-5 (auth lockdown sweep) in order.',
    new: '**P0-3 in progress: chat_messages_v2 logging continuity gap (May 3\u20135).** Diagnose cause: query `chat_messages_v2` for any rows past May 2; if none and there has been chat traffic, read `/api/charlie/route.ts` lines 52, 354 to find silent break.'
  },
  {
    name: 'Section 3 progress header',
    old: '**P0 progress: 1/5 shipped (P0-1 \u2705 2026-05-05).**',
    new: '**P0 progress: 2/5 shipped (P0-1 \u2705, P0-2 \u2705 2026-05-05).**'
  },
]

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name, '(occurrences:', occurrences, ')'); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const v7Marker = '**Next:** P0-2 recon \u2014 find current `message_count` increment site in `/api/charlie/route.ts`, write atomic RPC migration, replace read-then-write.'
const v8Line = '\n- **2026-05-05 v8** \u2014 **P0-2 SHIPPED** (already shipped Apr 30 as W-CREDIT-VERIFY Phase D0, migration `20260430_phase_d0_atomic_session_counters.sql`). **v3 claim retired**: atomic counter IS in codebase under name `increment_chat_session_counter` (parameterized), not `increment_chat_message_count` as the W-CREDITS plan named it. Migration verified: SECURITY DEFINER, EXECUTE format with whitelist over 4 counter columns, UPDATE\u2026RETURNING with row-lock serialization, built-in DO $$ smoke checks. Decrement uses GREATEST(0, \u2026) \u2014 no underflow. Both wired in route.ts (lines 270 + 466 increment, 538 decrement). **Residual race opens as P1-6**: pre-increment gate uses stale `msgUsed`; concurrent burst can soft-exceed cap by 1\u20132 messages per user. Counter stays correct (atomic), subsequent requests gated normally. **Pattern note**: this is the THIRD too-narrow-grep correction (v3 tenant_users, v4 AgentOrgChart, v8 RPC name). Going forward, when checking "is X shipped" \u2014 grep on functional behavior or migration filenames, not on guessed function names. **Status: 2/5 P0 shipped. Next: P0-3 (logging continuity gap May 3\u20135).**'

if (!content.includes(v7Marker)) { console.error('v7 marker not found'); process.exit(1) }
content = content.replace(v7Marker, v7Marker + v8Line)
console.log('  Appended v8 status log')

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)