const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

let content = original.replace(/\r\n/g, '\n')

// ---------- Section 2 content ----------
const section2 = [
  '## Section 2 \u2014 Integration Matrix',
  '',
  'Pairs that matter for launch readiness. Each entry: does A correctly consume B? Is the contract tested?',
  '',
  '### Hierarchy as provider',
  '',
  '- **Hierarchy \u2192 Leads**: \u2705 `walkHierarchy()` stamps `(manager_id, area_manager_id, tenant_admin_id)` on lead INSERT. 7/7 lead routes wired (W-HIERARCHY H3.4\u2013H3.8).',
  '- **Hierarchy \u2192 Email**: \u2705 `getLeadEmailRecipients(tenantId, agentId)` consumes walker output \u2192 6 BCC layers per Lead+Email contract. Smoke 3/3 (leaf agent, null agent, tenant-admin-as-agent).',
  '- **Hierarchy \u2192 Roles transitions**: \u2705 R4 RPCs update `agents.parent_id` atomically with `agent_role_changes` audit row. Walker re-reads on next lead.',
  '- **Hierarchy \u2192 Territory resolver**: \u2705 `resolve_agent_for_context` returns an `agent_id`; downstream walker climbs from there.',
  '',
  '### Roles & Delegation as provider',
  '',
  '- **Roles \u2192 Permission gating**: \ud83d\udfe1 `can()` shipped (R3.1); **only `POST /admin-homes/agents` gates through it in production**. W-ADMIN-AUTH-LOCKDOWN: 13 routes still on legacy `api-auth.ts`.',
  '- **Delegation \u2192 Email BCC overlay**: \u274c Helper does NOT yet read `agent_delegations`. R7 deferred. **Granting a delegation today does not cause the delegate to receive lead emails.**',
  '- **Roles \u2192 Audit trail**: \u2705 `agent_role_changes` append-only with triggers; 73-cell smoke confirms invariants.',
  '',
  '### Credit & Auth as provider',
  '',
  '- **Auth gate \u2192 /api/charlie**: \u2705 W-RECOVERY A1 \u2014 sessionId/userId/tenantId required; session ownership verified. Bleed plugged.',
  '- **Credit overrides \u2192 Charlie route**: \u2705 Resolution scoped by `(user_id, tenant_id)`. Three pools tracked. 11 override rows live.',
  '- **Charlie route \u2192 chat_messages_v2 logging**: \ud83d\udfe1 64 rows logged Apr 29\u2192May 2 (Chunk 6 working). **3-day gap May 3\u20135** \u2014 needs verification (no traffic vs silent break). No atomic increment RPC.',
  '- **Sessions \u2192 Auth gate**: \u274c `walliam/charlie/session/route.ts` still creates anonymous rows. Chunk 5 deferred. 51/61 post-Apr-28 sessions are anonymous.',
  '',
  '### Multi-tenant as provider',
  '',
  '- **tenant_id \u2192 critical writes**: \u2705 NOT NULL on `agents`, `leads`, `user_credit_overrides`, `tenant_users`. Walker stamps `lead.tenant_id` from agent.',
  '- **tenant_id \u2192 chat_sessions**: \ud83d\udfe1 nullable column; 48 historical NULL rows pre-W-RECOVERY; 0 NULL post-recovery.',
  '- **tenant_id \u2192 agent_property_access**: \ud83d\udfe1 NULLABLE. Multi-tenant gap at DB level. Currently irrelevant (1 tenant) but blocks tenant 2 onboarding.',
  '',
  '### User & Tenant as provider',
  '',
  '- **tenant_users \u2192 email throttle**: \u2705 `welcome_email_sent` boolean + `low_credit_email_sent` jsonb scoped per (user, tenant). Email routes consume both.',
  '- **tenant_users \u2192 registration consent**: \u2705 `marketing_consent` + `sms_consent` NOT NULL captured at registration via `joinTenant.ts` + `RegisterModal`.',
  '- **tenant_users membership coverage**: \ud83d\udfe1 46/96 user_profiles have a row. 50 pre-W-TENANT-AUTH legacy users without membership.',
  '',
  '### Territory as provider',
  '',
  '- **resolve_agent_for_context \u2192 9 callers**: \u2705 charlie session/lead/appointment, walliam session/contact/estimator/assign-user-agent/resolve-agent, lib leads, is-walliam.',
  '- **Territory data \u2192 resolution**: \ud83d\udfe1 1 muni-scoped assignment + 9 building picks (1 agent). Cascade is mostly fall-through to tenant default.',
  '- **Territory \u2192 UI**: \u274c No `/admin-homes/territory` page; configuration is fragmented across 4 embedded section components.',
  '',
  '### Dashboard UI as provider',
  '',
  '- **Sidebar \u2192 role-gated nav**: \u2753 logic not yet visible from grep \u2014 needs file inspection. Per Phase 3.2 spec each role should see different items.',
  '- **Pages \u2192 /admin-homes nav spec**: \ud83d\udfe1 6/9 nav items shipped. Missing: Territory, Approvals, Tickets.'
].join('\n')

// ---------- Section 3 content ----------
const section3 = [
  '## Section 3 \u2014 Launch Blockers',
  '',
  'Concrete items required to ship to first paid customer (P0), to scale beyond 3 customers (P1), or hygiene before launch (P2). Each with the verification step that confirms removal.',
  '',
  '### P0 \u2014 must ship before first paid customer',
  '',
  '**P0-1. W-RECOVERY Chunk 5 \u2014 anonymous session creation in `walliam/charlie/session/route.ts`**',
  '- Symptom: 51/61 post-Apr-28 sessions still anonymous; DB grows on every visitor.',
  '- Verify: `SELECT COUNT(*) FILTER (WHERE user_id IS NULL) FROM chat_sessions WHERE created_at > <ship_ts>` returns 0.',
  '- Source: `docs/W-RECOVERY-A1.5-TRACKER.md`',
  '',
  '**P0-2. W-CREDITS Phase 9 \u2014 atomic `increment_chat_message_count` RPC**',
  '- Symptom: read-then-write counter; race condition possible. 0 code or migration references found.',
  '- Verify: 10 parallel POSTs at msgUsed=23 \u2192 final counter \u2264 25; chat_messages_v2 row count matches.',
  '- Source: `Credit System \u2014 Sync & UX Plan.md`',
  '',
  '**P0-3. `chat_messages_v2` logging continuity gap May 3\u20135**',
  '- Symptom: 64 rows Apr 29 \u2192 May 2, then nothing. Cause unknown.',
  '- Verify: send one chat message, then `SELECT * FROM chat_messages_v2 ORDER BY created_at DESC LIMIT 5` shows new row with tenant_id + user_id.',
  '- Read `app/api/charlie/route.ts` lines 52, 354 if break is silent.',
  '',
  '**P0-4. W-ROLES-DELEGATION R7 \u2014 delegate BCC overlay**',
  '- Symptom: delegate gets no email when delegator\'s lead fires.',
  '- Verify: grant delegation \u2192 POST a lead \u2192 delegate\'s email is in BCC array.',
  '- Source: `docs/W-ROLES-DELEGATION-TRACKER.md`',
  '',
  '**P0-5. W-ADMIN-AUTH-LOCKDOWN \u2014 13 routes on legacy `api-auth.ts`**',
  '- Symptom: only `POST /admin-homes/agents` uses `can()`; remainder bypass matrix policy.',
  '- Verify: every admin-homes route imports + calls `can()` before any mutation.',
  '- Source: sister ticket noted in W-ROLES-DELEGATION close.',
  '',
  '### P1 \u2014 ship before scale',
  '',
  '**P1-1. W-ROLES-DELEGATION R5/R6 \u2014 delegation CRUD + workspace UI**',
  '- Verify: workspace tab on `/admin-homes/agents/[id]` has Delegations; grant/revoke buttons hit live RPCs.',
  '',
  '**P1-2. Sidebar role-gating verification**',
  '- Verify: read `components/admin-homes/AdminHomesSidebar.tsx`; confirm role checks gate every nav item per Phase 3.2 spec.',
  '',
  '**P1-3. Territory configurability**',
  '- Three sub-items: (a) build `/admin-homes/territory` page; (b) make `agent_property_access.tenant_id` NOT NULL (after backfill from `agents.tenant_id`); (c) decide whether `agent_geo_buildings` migrates to `(assignment_id, building_id)` junction or stays flat.',
  '- Verify: tenant onboarding can configure territory end-to-end without DB writes.',
  '',
  '**P1-4. Tenant onboarding \u2014 Phase 3.7**',
  '- Verify: platform admin can onboard, suspend, reactivate, terminate via `/platform` UI.',
  '',
  '**P1-5. Approvals + Tickets pages** (per Phase 3 nav spec)',
  '- Verify: pages exist, rendered for tenant_admin role.',
  '',
  '### P2 \u2014 data hygiene before launch',
  '',
  '**P2-1. 48 NULL `tenant_id` chat_sessions (historical)**',
  '- Verify: `SELECT COUNT(*) FROM chat_sessions WHERE tenant_id IS NULL` returns 0.',
  '- Approach: DELETE rows older than W-RECOVERY ship date (Apr 28).',
  '',
  '**P2-2. 50 pre-W-TENANT-AUTH user_profiles without `tenant_users`**',
  '- Verify: every user with `chat_sessions` has a corresponding `tenant_users` row.',
  '- Approach: backfill default WALLiam membership (marketing=false, sms=false; re-prompt next visit).',
  '',
  '**P2-3. 2 stale `useCharlie.ts` backups on disk**',
  '- Verify: `Get-ChildItem app/charlie/hooks/useCharlie* | Where Name -ne "useCharlie.ts"` returns nothing.',
  '- Approach: delete `.debug_20260427_071645` and `.predebugremoval_20260427_074506`.',
  '',
  '**P2-4. F55 \u2014 6 hardcoded admin email literals (System 1 + platform routes)**',
  '- Files: `app/api/01leads-contact`, `app/api/chat/{vip-approve,vip-questionnaire,vip-request}`, `app/api/paddle/webhook`, `app/api/submit-application`.',
  '- Verify: `git grep "condoleads.ca@gmail.com"` returns nothing.',
  '- Approach: env var `ADMIN_NOTIFICATION_EMAIL`. **System 1 routes are isolation-protected \u2014 touch with extreme care.**',
  '',
  '### External blockers',
  '',
  '**E-1. Paddle KYC** \u2014 Sumsub verification + action required per dashboard.',
  '',
  '### Scripts cleanup (per memory rule)',
  '',
  '**S-1.** `node scripts/seed-test-data.js --clean` then `Remove-Item -Recurse -Force "scripts"` after testing verified complete.'
].join('\n')

// ---------- Section 4 content ----------
const section4 = [
  '## Section 4 \u2014 Active Execution Trackers',
  '',
  'Pointers to per-ticket trackers on disk. Each one is the implementation detail; this master tracker is the cohesion view.',
  '',
  '| Tracker | Status | Open items |',
  '|---|---|---|',
  '| `docs/W-HIERARCHY-TRACKER.md` | CLOSED 2026-05-03 | F55 (out-of-scope, queued P2-4); F69 (frontend bug) |',
  '| `docs/W-ROLES-DELEGATION-TRACKER.md` | R1\u2013R4 CLOSED 2026-05-04 | **R5 CRUD, R6 UI, R7 delegate BCC, R8 smoke matrix \u2014 DEFERRED per cohesion review** |',
  '| `docs/W-RECOVERY-A1.5-TRACKER.md` | A1 + Wave 1\u20132 SHIPPED Apr 28 | **Chunk 5 anonymous sessions DEFERRED (P0-1)**; Chunk 6 logging confirmed working (May 5); Waves 3\u20134 deferred |',
  '| `docs/W-CREDIT-VERIFY-TRACKER.md` | OPEN @ `cd0fb14` (2026-05-02) | Phase C smoke + Phase D regression sweep not confirmed |',
  '| W-CREDITS Phase 9 (no dedicated tracker) | DEFERRED | Atomic increment RPC \u2014 P0-2 |',
  '| W-TENANT-AUTH | CLOSED @ `7dd818d` | 50 legacy users without `tenant_users` (P2-2) |',
  '| W-ADMIN-AUTH-LOCKDOWN (sister ticket) | OPEN | 13 routes \u2014 P0-5 |',
  '| W-MULTITENANT (defined Apr 28, parked) | OPEN | Wide audit, post-launch |',
  '| Territory ticket (not yet started) | NOT STARTED | Per W-ROLES-DELEGATION model: "Defaults cascade. Assignments override. Leads follow ownership." Schema 70%, UI 0%. |',
  '',
  '### Closed tickets (reference only)',
  '- W-HIERARCHY (2026-05-03)',
  '- W-ROLES-DELEGATION R1\u2013R4 (2026-05-04)',
  '- W-TENANT-AUTH Phase 4b (8/8 smoke per W-CREDIT-VERIFY)',
  '- W-RECOVERY A1 + Wave 1\u20132 + Chunk 6 logging confirmed'
].join('\n')

const replacements = [
  {
    name: 'Territory row count update',
    old: '`agent_geo_buildings` schema is **flat `(agent_id, building_id)` \u2014 NOT junction-to-`assignment_id` as implementation plan described**',
    new: '`agent_geo_buildings` (9 rows, 1 agent, 9 buildings) schema is **flat `(agent_id, building_id)` \u2014 NOT junction-to-`assignment_id` as implementation plan described**'
  },
  {
    name: 'Section 2 placeholder',
    old: '## Section 2 \u2014 Integration Matrix\n\n_RECON PENDING \u2014 populated after Section 1 complete. Each pair: does A correctly consume B? Is the contract tested?_',
    new: section2
  },
  {
    name: 'Section 3 placeholder',
    old: '## Section 3 \u2014 Launch Blockers\n\n_RECON PENDING \u2014 populated after Sections 1\u20132 complete. Concrete, named, each with the test that confirms removal._',
    new: section3
  },
  {
    name: 'Section 4 placeholder',
    old: '## Section 4 \u2014 Active Execution Trackers\n\n_RECON PENDING \u2014 pointer index to W-* tracker files on disk._',
    new: section4
  },
  {
    name: 'Status line',
    old: '**Status:** SECTION 1 COMPLETE \u2014 5/5 blocks. Sections 2\u20134 (integration matrix, launch blockers, tracker index) pending.',
    new: '**Status:** TRACKER COMPLETE \u2014 Section 1 (5/5 blocks) + Sections 2\u20134 populated. Launch-blocker execution begins.'
  },
  {
    name: 'Next action',
    old: '**Write Sections 2\u20134** \u2014 integration matrix, launch blockers, active execution tracker index. Synthesis from accumulated 5-block evidence; no further recon needed.',
    new: '**Begin P0-1: W-RECOVERY Chunk 5** \u2014 close anonymous session creation in `walliam/charlie/session/route.ts`. After P0-1 ships, P0-2 (W-CREDITS Phase 9 atomic counter), then P0-3 (logging continuity), P0-4 (R7 delegate BCC), P0-5 (auth lockdown sweep) in order.'
  },
]

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const v5Marker = '**Sections 2 (integration matrix), 3 (launch blockers), 4 (active tracker index) are next.**'
const v6Line = '\n- **2026-05-05 v6** \u2014 Sections 2\u20134 written. **Master tracker is complete.** Section 2 (integration matrix) covers ~25 system pairs grouped by provider. Section 3 (launch blockers) lists 16 concrete items (5 P0, 5 P1, 4 P2, 1 external, 1 scripts cleanup) with verification step + source tracker for each. Section 4 (active execution trackers) indexes 9 W-* trackers with status. **Three pivots emerged from cross-block synthesis that per-ticket trackers could not have surfaced:** (a) delegation BCC overlay (R7) is the only R5\u2013R8 item that\'s P0 \u2014 others are P1; (b) anonymous session bleed (Chunk 5) silently grows DB despite chat-endpoint gate being plugged; (c) `agent_property_access.tenant_id` NULLABLE blocks tenant-2 onboarding even though current single-tenant traffic is fine. **Territory `agent_geo_buildings` count folded into Territory row: 9 rows, 1 agent, 9 buildings.** **Next: execute P0-1 (Chunk 5) \u2192 P0-2 (Phase 9) \u2192 P0-3 (logging gap) \u2192 P0-4 (R7) \u2192 P0-5 (auth lockdown). No more recon.**'

if (!content.includes(v5Marker)) { console.error('v5 marker not found'); process.exit(1) }
content = content.replace(v5Marker, v5Marker + v6Line)
console.log('  Appended v6 status log')

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)