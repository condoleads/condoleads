const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

let content = original.replace(/\r\n/g, '\n')

const replacements = [
  {
    name: 'User Management row (correction)',
    old: '| User Management (profiles, sessions, tenant link) | \u2705 | \ud83d\udfe1 | \ud83d\udfe1 | \ud83d\udfe1 | `user_profiles` (96 rows, **no `tenant_id`** \u2014 by design, cross-tenant users). `chat_sessions` (2096 rows; 48 with NULL `tenant_id`; 2003 anonymous). `user_credit_overrides` (11 rows, `tenant_id NOT NULL` \u2705). `tenant_users` table exists but **no `lib/` or `app/` code refs** \u2014 orphan or RLS-only, needs sweep. Auth helper: `lib/admin-homes/auth.ts` (R3.2.1, 11175B). |',
    new: '| User Management (profiles, sessions, tenant link) | \u2705 | \u2705 | \ud83d\udfe1 | \ud83d\udfe1 | `user_profiles` (96 rows, no `tenant_id` \u2014 global metadata). `tenant_users` (46 rows, **9 active callers**: `joinTenant.ts`, `RegisterModal.tsx`, welcome + low-credit emails, `assign-user-agent`, `smoke-w-tenant-auth`, 3 migrations) \u2014 per-tenant consent + agent assignment + email throttle. `chat_sessions` (2096 rows). `user_credit_overrides` (11 rows, `tenant_id NOT NULL`). 50 pre-W-TENANT-AUTH legacy users have no `tenant_users` row (52% of profiles). Auth helper: `lib/admin-homes/auth.ts` (R3.2.1). |'
  },
  {
    name: 'Multi-tenant isolation row (clarification)',
    old: '| Multi-tenant isolation (tenant_id propagation) | \u2705 | \ud83d\udfe1 | \ud83d\udfe1 | \u2014 | `tenant_id` columns present on `agents`, `leads`, `user_credit_overrides`, `chat_sessions`, `vip_requests`. **Strong enforcement:** `leads.tenant_id NOT NULL`, `user_credit_overrides.tenant_id NOT NULL`, `agents.tenant_id` (FK). **Soft enforcement:** `chat_sessions.tenant_id` nullable; 48 prod rows have NULL. **By design:** `user_profiles` has no `tenant_id` column \u2014 cross-tenant user model. W-TENANT-AUTH Phase 4b smoke matrix 8/8 per W-CREDIT-VERIFY tracker. |',
    new: '| Multi-tenant isolation (tenant_id propagation) | \u2705 | \u2705 | \u2705 | \u2014 | `tenant_id NOT NULL` on `agents`, `leads`, `user_credit_overrides`, `tenant_users`. `chat_sessions.tenant_id` nullable but **all 48 NULL rows are pre-W-RECOVERY (Apr 28); 0 NULL post-recovery** \u2014 historical hygiene, not active leak. By design: `user_profiles` has no `tenant_id` (global metadata; per-tenant membership lives in `tenant_users`). W-TENANT-AUTH Phase 4b 8/8. |'
  },
  {
    name: 'Credit System row',
    old: '| Credit System (pools, gates, overrides, logging) | _RECON PENDING_ | | | | Block 3 |',
    new: '| Credit System (pools, gates, overrides, logging) | \u2705 | \ud83d\udfe1 | \ud83d\udfe1 | \u2705 | `lib/credits/resolveUserLimits.ts` (only file in dir, Apr 9) + `components/credits/CreditSessionContext.tsx` (Apr 29) + `app/charlie/hooks/useCharlie.ts` (Apr 29). `chat_messages_v2` writes from 2 sites in `/api/charlie/route.ts` \u2014 **64 rows logged Apr 29 \u2192 May 2 (Chunk 6 confirmed working, retires W-RECOVERY unverified flag)**. **GAPS:** `increment_chat_message_count` RPC NOT in codebase \u2014 W-CREDITS Phase 9 atomic counter never shipped (race condition possible). No `chat_messages_v2` rows last 3 days \u2014 needs verification (no traffic vs silent break). 2 stale `useCharlie.ts` backups on disk. W-CREDIT-VERIFY tracker open at `cd0fb14`. |'
  },
  {
    name: 'Auth & Sessions row',
    old: '| Auth & Sessions (gates, anonymous\u2192registered) | _RECON PENDING_ | | | | Block 3 |',
    new: '| Auth & Sessions (gates, anonymous\u2192registered) | \u2705 | \ud83d\udfe1 | \u2705 | \u2705 | W-RECOVERY A1 auth gate live on `/api/charlie/route.ts` + Wave 1\u20132 routes. **CRITICAL:** 51/61 post-W-RECOVERY sessions still anonymous \u2014 **W-RECOVERY Chunk 5 (anonymous session creation in `walliam/charlie/session/route.ts`) DEFERRED, never shipped**. Bleed plugged at chat endpoint (no Anthropic burn) but anonymous DB rows still grow. `tenant_users` membership wired via `RegisterModal` + `joinTenant.ts`. W-TENANT-AUTH Phase 4b 8/8. |'
  },
  {
    name: 'Status line',
    old: '**Status:** RECON IN PROGRESS \u2014 2/5 blocks complete',
    new: '**Status:** RECON IN PROGRESS \u2014 3/5 blocks complete'
  },
  {
    name: 'Next action',
    old: '**Block 3 recon** \u2014 Credit system + Auth & Sessions (lib/credits, CreditSessionContext, atomic RPC, chat_messages_v2 logging, `tenant_users` orphan sweep). Verification commands in chat.',
    new: '**Block 4 recon** \u2014 Dashboard UI (every `app/admin-homes/**/page.tsx` + `components/admin-homes/**`, stub vs functional). Verification commands in chat.'
  },
]

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const v2Marker = '- **2026-05-05 v2** \u2014 Block 2 (User mgmt + Multi-tenant) recon complete. 4 user-related tables verified. **Two issues surfaced for Section 3 (launch blockers):** (a) 48 `chat_sessions` rows with NULL `tenant_id`; (b) 2003/2096 sessions are anonymous (pre-W-RECOVERY historical \u2014 needs post-Apr-28 confirmation). One open question: `tenant_users` table exists but unreferenced in code \u2014 Block 3 sweep.'
const v3Line = '\n- **2026-05-05 v3** \u2014 Block 3 (Credit + Auth & Sessions + tenant_users sweep) complete. **Two v2 claims corrected:** (a) `tenant_users` is NOT orphan \u2014 9 active callers, including W-TENANT-AUTH registration flow (v2 grep was scoped too narrowly to `lib/+app/.ts`); (b) The 48 NULL `tenant_id` rows are ALL pre-W-RECOVERY \u2014 historical hygiene, not active leak. **New findings:** (i) Chunk 6 logging confirmed working \u2014 64 rows in `chat_messages_v2` Apr 29\u2192May 2 (retires W-RECOVERY unverified flag); (ii) **W-CREDITS Phase 9 atomic counter RPC never shipped** \u2014 `increment_chat_message_count` not in codebase, race condition possible; (iii) **W-RECOVERY Chunk 5 deferred is biting** \u2014 51/61 post-Apr-28 sessions still created anonymous in `walliam/charlie/session/route.ts`; (iv) 50 pre-W-TENANT-AUTH legacy users have no `tenant_users` membership; (v) 2 stale `useCharlie.ts` backups on disk. **Section 3 launch-blocker candidates queueing up.**'

if (!content.includes(v2Marker)) { console.error('v2 marker not found'); process.exit(1) }
content = content.replace(v2Marker, v2Marker + v3Line)
console.log('  Appended v3 status log')

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)