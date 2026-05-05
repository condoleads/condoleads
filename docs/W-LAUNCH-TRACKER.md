# W-LAUNCH-TRACKER

**Started:** 2026-05-05
**Owner:** Shah (sole dev)
**Status:** TRACKER COMPLETE; **P0 execution: 2/5 shipped (P0-1 ✅, P0-2 ✅ 2026-05-05)**.
**Purpose:** Top-down product tracker. Every system, integration state, launch readiness.

---

## Why this exists

Per session 2026-05-04 strategic pivot: scattered backend tickets shipped (W-HIERARCHY, W-ROLES-DELEGATION, W-CREDITS, W-RECOVERY, W-TENANT-AUTH) without a top-down cohesion view. This tracker is the cohesion view.

Sister trackers (execution detail) are pointed to in Section 4. This tracker does not duplicate their content — it indexes them and answers the question "is the product ready to launch?"

---

## Section 1 — Product Systems Status

| System | Built | Wired | Tested | UI | Notes |
|---|---|---|---|---|---|
| Hierarchy (parent/child walker, role ladder) | ✅ | ✅ | ✅ | ✅ | Walker in 7/7 lead routes. `agents.role` CHECK constrains 5 values. `lib/admin-homes/hierarchy.ts` shipped W-HIERARCHY. **`AgentOrgChart` shipped** (`components/admin-homes/AgentOrgChart.tsx` 10.3KB Apr 25 + `app/admin-homes/agents/tree/page.tsx` 2KB) — corrects v1 claim. |
| Roles & Delegation (transitions, audit, can()) | ✅ | 🟡 | ✅ | ❌ | W-ROLES-DELEGATION R1–R4 shipped. 5 RPCs + `can()` + `role-transitions.ts` live. 73 cells passing. **R5 (delegation CRUD), R6 (workspace UI), R7 (delegate BCC overlay), R8 (full smoke matrix) NOT shipped — scope-defined, deferred per cohesion review.** Sister W-ADMIN-AUTH-LOCKDOWN: 13 routes still on legacy `api-auth.ts`. |
| Leads & Email Flow (helper, fan-out, lead rows) | ✅ | ✅ | ✅ | — | Helper `lib/admin-homes/lead-email-recipients.ts` (8458B, 4 exports). 10 consumers, 7 walker consumers. `leads` enforces `tenant_id NOT NULL` + `agent_id NOT NULL`. **Delegation BCC overlay NOT live (depends on R7).** 6 admin email literals remain in System 1 + platform routes (F55 class, out-of-scope). `leads` table currently empty — fresh state. |
| User Management (profiles, sessions, tenant link) | ✅ | ✅ | 🟡 | 🟡 | `user_profiles` (96 rows, no `tenant_id` — global metadata). `tenant_users` (46 rows, **9 active callers**: `joinTenant.ts`, `RegisterModal.tsx`, welcome + low-credit emails, `assign-user-agent`, `smoke-w-tenant-auth`, 3 migrations) — per-tenant consent + agent assignment + email throttle. `chat_sessions` (2096 rows). `user_credit_overrides` (11 rows, `tenant_id NOT NULL`). 50 pre-W-TENANT-AUTH legacy users have no `tenant_users` row (52% of profiles). Auth helper: `lib/admin-homes/auth.ts` (R3.2.1). |
| Credit System (pools, gates, overrides, logging) | ✅ | ✅ | 🟡 | ✅ | `lib/credits/resolveUserLimits.ts` + `components/credits/CreditSessionContext.tsx` + `app/charlie/hooks/useCharlie.ts`. `chat_messages_v2` writes from 2 sites in `/api/charlie/route.ts` — 64 rows logged Apr 29 → May 2 (Chunk 6 working). **Atomic counter SHIPPED** as W-CREDIT-VERIFY D0 (`increment_chat_session_counter` + `decrement_chat_session_counter`, parameterized whitelist, SECURITY DEFINER, UPDATE…RETURNING row-lock). v3 claim retired — grep used wrong name. **Residual:** pre-increment gate uses stale msgUsed; concurrent race can soft-exceed cap by 1–2 — P1-6. **Open:** logging gap May 3–5 — P0-3. 2 stale `useCharlie.ts` backups on disk. |
| Dashboard UI (/admin-homes pages + components) | ✅ | 🟡 | ❌ | 🟡 | **10 pages, 16 components.** Substantial: `SettingsClient` 35.8KB, `BulkSyncClient` 27.2KB + `CommandCenter` 25.4KB, `AdminHomesLeadsClient` 26.9KB, `EditTenantModal` 34.4KB. Per Phase 3 spec sidebar has 9 nav items; **6 pages shipped (Dashboard, Leads, Users, Agents, Settings, Tenants); 3 missing (Territory, Approvals, Tickets)**. AgentOrgChart wired at `/admin-homes/agents/tree`. Modal layer kept during deprecation window per Phase 3.3 spec. **Sidebar role-gating logic not verified from grep — needs file inspection** (per Phase 3.2 spec each role should see different nav). No UI smoke tests located. R5–R6 delegation UI not shipped. |
| Territory (geo cascade, building/listing assign) | 🟡 | 🟡 | ❌ | 🟡 | **4 tables exist, schema-ready but data-empty.** `agent_property_access` (1 row, 1 muni-scoped). `agent_geo_buildings` (9 rows, 1 agent, 9 buildings) schema is **flat `(agent_id, building_id)` — NOT junction-to-`assignment_id` as implementation plan described**. `tenant_property_access` (0 rows = full access per model). `agent_listing_assignments` (0 rows). RPC `resolve_agent_for_context` is the single resolver, **9 callers** across charlie/walliam/lib. 4 section components embedded in agent + tenant workspaces (March 2026). **No `/admin-homes/territory` page** (Phase 3 nav gap). **`agent_property_access.tenant_id` NULLABLE** (multi-tenant gap at DB level). No territory smoke tests. No migration files matching territory/geo/property_access/building keywords — tables created out-of-band. |
| Auth & Sessions (gates, anonymous→registered) | ✅ | ✅ | ✅ | ✅ | W-RECOVERY A1 auth gate on `/api/charlie/route.ts` + Wave 1–2 routes. **P0-1 SHIPPED 2026-05-05 commit `6dee05f`** — anonymous session creation closed in `walliam/charlie/session/route.ts` (read-only branch extended to cover `!userId`; create branch defensive `userId` guard). SQL acceptance post-ship: 0 anonymous rows. 51 legacy anonymous rows remain in DB (P2-1 cleanup). `tenant_users` membership wired via `RegisterModal` + `joinTenant.ts`. W-TENANT-AUTH Phase 4b 8/8. |
| Multi-tenant isolation (tenant_id propagation) | ✅ | ✅ | ✅ | — | `tenant_id NOT NULL` on `agents`, `leads`, `user_credit_overrides`, `tenant_users`. `chat_sessions.tenant_id` nullable but **all 48 NULL rows are pre-W-RECOVERY (Apr 28); 0 NULL post-recovery** — historical hygiene, not active leak. By design: `user_profiles` has no `tenant_id` (global metadata; per-tenant membership lives in `tenant_users`). W-TENANT-AUTH Phase 4b 8/8. |

Legend: ✅ done · 🟡 partial · ❌ missing · — n/a

---

## Section 2 — Integration Matrix

Pairs that matter for launch readiness. Each entry: does A correctly consume B? Is the contract tested?

### Hierarchy as provider

- **Hierarchy → Leads**: ✅ `walkHierarchy()` stamps `(manager_id, area_manager_id, tenant_admin_id)` on lead INSERT. 7/7 lead routes wired (W-HIERARCHY H3.4–H3.8).
- **Hierarchy → Email**: ✅ `getLeadEmailRecipients(tenantId, agentId)` consumes walker output → 6 BCC layers per Lead+Email contract. Smoke 3/3 (leaf agent, null agent, tenant-admin-as-agent).
- **Hierarchy → Roles transitions**: ✅ R4 RPCs update `agents.parent_id` atomically with `agent_role_changes` audit row. Walker re-reads on next lead.
- **Hierarchy → Territory resolver**: ✅ `resolve_agent_for_context` returns an `agent_id`; downstream walker climbs from there.

### Roles & Delegation as provider

- **Roles → Permission gating**: 🟡 `can()` shipped (R3.1); **only `POST /admin-homes/agents` gates through it in production**. W-ADMIN-AUTH-LOCKDOWN: 13 routes still on legacy `api-auth.ts`.
- **Delegation → Email BCC overlay**: ❌ Helper does NOT yet read `agent_delegations`. R7 deferred. **Granting a delegation today does not cause the delegate to receive lead emails.**
- **Roles → Audit trail**: ✅ `agent_role_changes` append-only with triggers; 73-cell smoke confirms invariants.

### Credit & Auth as provider

- **Auth gate → /api/charlie**: ✅ W-RECOVERY A1 — sessionId/userId/tenantId required; session ownership verified. Bleed plugged.
- **Credit overrides → Charlie route**: ✅ Resolution scoped by `(user_id, tenant_id)`. Three pools tracked. 11 override rows live.
- **Charlie route → chat_messages_v2 logging**: 🟡 64 rows logged Apr 29→May 2 (Chunk 6 working). **3-day gap May 3–5** — needs verification (no traffic vs silent break) — P0-3.
- **Sessions → Auth gate**: ❌ `walliam/charlie/session/route.ts` still creates anonymous rows. Chunk 5 deferred. 51/61 post-Apr-28 sessions are anonymous.

### Multi-tenant as provider

- **tenant_id → critical writes**: ✅ NOT NULL on `agents`, `leads`, `user_credit_overrides`, `tenant_users`. Walker stamps `lead.tenant_id` from agent.
- **tenant_id → chat_sessions**: 🟡 nullable column; 48 historical NULL rows pre-W-RECOVERY; 0 NULL post-recovery.
- **tenant_id → agent_property_access**: 🟡 NULLABLE. Multi-tenant gap at DB level. Currently irrelevant (1 tenant) but blocks tenant 2 onboarding.

### User & Tenant as provider

- **tenant_users → email throttle**: ✅ `welcome_email_sent` boolean + `low_credit_email_sent` jsonb scoped per (user, tenant). Email routes consume both.
- **tenant_users → registration consent**: ✅ `marketing_consent` + `sms_consent` NOT NULL captured at registration via `joinTenant.ts` + `RegisterModal`.
- **tenant_users membership coverage**: 🟡 46/96 user_profiles have a row. 50 pre-W-TENANT-AUTH legacy users without membership.

### Territory as provider

- **resolve_agent_for_context → 9 callers**: ✅ charlie session/lead/appointment, walliam session/contact/estimator/assign-user-agent/resolve-agent, lib leads, is-walliam.
- **Territory data → resolution**: 🟡 1 muni-scoped assignment + 9 building picks (1 agent). Cascade is mostly fall-through to tenant default.
- **Territory → UI**: ❌ No `/admin-homes/territory` page; configuration is fragmented across 4 embedded section components.

### Dashboard UI as provider

- **Sidebar → role-gated nav**: ❓ logic not yet visible from grep — needs file inspection. Per Phase 3.2 spec each role should see different items.
- **Pages → /admin-homes nav spec**: 🟡 6/9 nav items shipped. Missing: Territory, Approvals, Tickets.

---

## Section 3 — Launch Blockers

Concrete items required to ship to first paid customer (P0), to scale beyond 3 customers (P1), or hygiene before launch (P2). Each with the verification step that confirms removal.

**P0 progress: 2/5 shipped (P0-1 ✅, P0-2 ✅ 2026-05-05).**

### P0 — must ship before first paid customer

**P0-1. W-RECOVERY Chunk 5 — anonymous session creation in `walliam/charlie/session/route.ts`** — ✅ **SHIPPED 2026-05-05** commit `6dee05f`
- Symptom: 51/61 post-Apr-28 sessions still anonymous; DB grows on every visitor.
- Verify: `SELECT COUNT(*) FILTER (WHERE user_id IS NULL) FROM chat_sessions WHERE created_at > <ship_ts>` returns 0.
- Source: `docs/W-RECOVERY-A1.5-TRACKER.md`

**P0-2. W-CREDITS Phase 9 — atomic increment RPC** — ✅ **SHIPPED Apr 30** as W-CREDIT-VERIFY D0, migration `20260430_phase_d0_atomic_session_counters.sql`
- Atomic RPC is `increment_chat_session_counter(p_session_id, p_counter)` + sibling `decrement_chat_session_counter`. Parameterized whitelist over 4 counter columns. `UPDATE…RETURNING` with row-lock eliminates F5 race.
- **v3 claim retired**: prior tracker said "never shipped" — grep used the W-CREDITS-plan name (`increment_chat_message_count`); actual function is `increment_chat_session_counter` (parameterized).
- **Residual moved to P1-6**: post-increment cap check still missing.

**P0-3. `chat_messages_v2` logging continuity gap May 3–5**
- Symptom: 64 rows Apr 29 → May 2, then nothing. Cause unknown.
- Verify: send one chat message, then `SELECT * FROM chat_messages_v2 ORDER BY created_at DESC LIMIT 5` shows new row with tenant_id + user_id.
- Read `app/api/charlie/route.ts` lines 52, 354 if break is silent.

**P0-4. W-ROLES-DELEGATION R7 — delegate BCC overlay**
- Symptom: delegate gets no email when delegator's lead fires.
- Verify: grant delegation → POST a lead → delegate's email is in BCC array.
- Source: `docs/W-ROLES-DELEGATION-TRACKER.md`

**P0-5. W-ADMIN-AUTH-LOCKDOWN — 13 routes on legacy `api-auth.ts`**
- Symptom: only `POST /admin-homes/agents` uses `can()`; remainder bypass matrix policy.
- Verify: every admin-homes route imports + calls `can()` before any mutation.
- Source: sister ticket noted in W-ROLES-DELEGATION close.

### P1 — ship before scale

**P1-1. W-ROLES-DELEGATION R5/R6 — delegation CRUD + workspace UI**
- Verify: workspace tab on `/admin-homes/agents/[id]` has Delegations; grant/revoke buttons hit live RPCs.

**P1-2. Sidebar role-gating verification**
- Verify: read `components/admin-homes/AdminHomesSidebar.tsx`; confirm role checks gate every nav item per Phase 3.2 spec.

**P1-3. Territory configurability**
- Three sub-items: (a) build `/admin-homes/territory` page; (b) make `agent_property_access.tenant_id` NOT NULL (after backfill from `agents.tenant_id`); (c) decide whether `agent_geo_buildings` migrates to `(assignment_id, building_id)` junction or stays flat.
- Verify: tenant onboarding can configure territory end-to-end without DB writes.

**P1-4. Tenant onboarding — Phase 3.7**
- Verify: platform admin can onboard, suspend, reactivate, terminate via `/platform` UI.

**P1-5. Approvals + Tickets pages** (per Phase 3 nav spec)
- Verify: pages exist, rendered for tenant_admin role.

**P1-6. Post-increment cap check (W-CREDITS Phase 9 polish)**
- Symptom: pre-increment gate uses stale `msgUsed`. Concurrent same-user requests can soft-exceed cap by 1–2. Counter is correct (atomic), so subsequent requests are gated normally; soft over-cap is bounded.
- Verify: 10 parallel POSTs at msgUsed=24 (cap=25) → final counter ≤ 25, no requests proceed past cap.
- Fix shape: after `increment_chat_session_counter` returns `newMsgCount`, if `newMsgCount > chatAllowed`, call `decrement_chat_session_counter` and return gate. Same pattern at line 466 for plan counters (needs sum across buyer + seller for shared-pool semantics).

### P2 — data hygiene before launch

**P2-1. 48 NULL `tenant_id` chat_sessions (historical)**
- Verify: `SELECT COUNT(*) FROM chat_sessions WHERE tenant_id IS NULL` returns 0.
- Approach: DELETE rows older than W-RECOVERY ship date (Apr 28).

**P2-2. 50 pre-W-TENANT-AUTH user_profiles without `tenant_users`**
- Verify: every user with `chat_sessions` has a corresponding `tenant_users` row.
- Approach: backfill default WALLiam membership (marketing=false, sms=false; re-prompt next visit).

**P2-3. 2 stale `useCharlie.ts` backups on disk**
- Verify: `Get-ChildItem app/charlie/hooks/useCharlie* | Where Name -ne "useCharlie.ts"` returns nothing.
- Approach: delete `.debug_20260427_071645` and `.predebugremoval_20260427_074506`.

**P2-4. F55 — 6 hardcoded admin email literals (System 1 + platform routes)**
- Files: `app/api/01leads-contact`, `app/api/chat/{vip-approve,vip-questionnaire,vip-request}`, `app/api/paddle/webhook`, `app/api/submit-application`.
- Verify: `git grep "condoleads.ca@gmail.com"` returns nothing.
- Approach: env var `ADMIN_NOTIFICATION_EMAIL`. **System 1 routes are isolation-protected — touch with extreme care.**

### External blockers

**E-1. Paddle KYC** — Sumsub verification + action required per dashboard.

### Scripts cleanup (per memory rule)

**S-1.** `node scripts/seed-test-data.js --clean` then `Remove-Item -Recurse -Force "scripts"` after testing verified complete.

---

## Section 4 — Active Execution Trackers

Pointers to per-ticket trackers on disk. Each one is the implementation detail; this master tracker is the cohesion view.

| Tracker | Status | Open items |
|---|---|---|
| `docs/W-HIERARCHY-TRACKER.md` | CLOSED 2026-05-03 | F55 (out-of-scope, queued P2-4); F69 (frontend bug) |
| `docs/W-ROLES-DELEGATION-TRACKER.md` | R1–R4 CLOSED 2026-05-04 | **R5 CRUD, R6 UI, R7 delegate BCC, R8 smoke matrix — DEFERRED per cohesion review** |
| `docs/W-RECOVERY-A1.5-TRACKER.md` | A1 + Wave 1–2 SHIPPED Apr 28; **Chunk 5 SHIPPED via P0-1** 2026-05-05 commit `6dee05f` | Chunk 6 logging confirmed working (May 5); Waves 3–4 deferred |
| `docs/W-CREDIT-VERIFY-TRACKER.md` | OPEN @ `cd0fb14`; **Phase D0 (atomic counters) SHIPPED Apr 30** = P0-2 | Phase C smoke + Phase D regression sweep not confirmed |
| W-CREDITS Phase 9 (now W-CREDIT-VERIFY D0) | SHIPPED Apr 30 = P0-2 | P1-6 (post-increment check) is residual polish |
| W-TENANT-AUTH | CLOSED @ `7dd818d` | 50 legacy users without `tenant_users` (P2-2) |
| W-ADMIN-AUTH-LOCKDOWN (sister ticket) | OPEN | 13 routes — P0-5 |
| W-MULTITENANT (defined Apr 28, parked) | OPEN | Wide audit, post-launch |
| Territory ticket (not yet started) | NOT STARTED | Per W-ROLES-DELEGATION model: "Defaults cascade. Assignments override. Leads follow ownership." Schema 70%, UI 0%. |

### Closed tickets (reference only)
- W-HIERARCHY (2026-05-03)
- W-ROLES-DELEGATION R1–R4 (2026-05-04)
- W-TENANT-AUTH Phase 4b (8/8 smoke per W-CREDIT-VERIFY)
- W-RECOVERY A1 + Wave 1–2 + Chunk 6 logging confirmed

---

## Status log

- **2026-05-05 v0** — Skeleton created. Block 0 of 5 complete. Recon order: Leads/Email → User Mgmt → Credits → Dashboard UI → Territory.
- **2026-05-05 v1** — Block 1 (Leads + Email) recon complete. Hierarchy, Roles & Delegation, Leads & Email rows populated. Findings: helper + walker uniformity confirmed across 7 lead routes; R5–R8 of W-ROLES-DELEGATION NOT shipped (deferred); 6 F55-class admin literals remain in System 1 + platform routes (out of scope); `leads` table currently empty.
- **2026-05-05 v2** — Block 2 (User mgmt + Multi-tenant) recon complete. 4 user-related tables verified. **Two issues surfaced for Section 3 (launch blockers):** (a) 48 `chat_sessions` rows with NULL `tenant_id`; (b) 2003/2096 sessions are anonymous (pre-W-RECOVERY historical — needs post-Apr-28 confirmation). One open question: `tenant_users` table exists but unreferenced in code — Block 3 sweep.
- **2026-05-05 v3** — Block 3 (Credit + Auth & Sessions + tenant_users sweep) complete. **Two v2 claims corrected:** (a) `tenant_users` is NOT orphan — 9 active callers, including W-TENANT-AUTH registration flow (v2 grep was scoped too narrowly to `lib/+app/.ts`); (b) The 48 NULL `tenant_id` rows are ALL pre-W-RECOVERY — historical hygiene, not active leak. **New findings:** (i) Chunk 6 logging confirmed working — 64 rows in `chat_messages_v2` Apr 29→May 2 (retires W-RECOVERY unverified flag); (ii) **W-CREDITS Phase 9 atomic counter RPC never shipped** — `increment_chat_message_count` not in codebase, race condition possible; (iii) **W-RECOVERY Chunk 5 deferred is biting** — 51/61 post-Apr-28 sessions still created anonymous in `walliam/charlie/session/route.ts`; (iv) 50 pre-W-TENANT-AUTH legacy users have no `tenant_users` membership; (v) 2 stale `useCharlie.ts` backups on disk. **Section 3 launch-blocker candidates queueing up.**
- **2026-05-05 v4** — Block 4 (Dashboard UI) recon complete. **Another v1 claim corrected:** `AgentOrgChart.tsx` exists (10.3KB Apr 25) and is wired at `/admin-homes/agents/tree` — Phase 3.3b is shipped, not deferred. **New findings:** (i) 10 pages + 16 components, with substantial client files (35.8KB SettingsClient, 27.2KB BulkSyncClient); (ii) per Phase 3 nav spec, **3 pages missing: Territory, Approvals, Tickets**; (iii) modal layer (EditTenantModal etc.) still alive during Phase 3.3 deprecation window; (iv) sidebar role-gating logic not visible from grep — needs file inspection (per Phase 3.2 spec); (v) no UI smoke tests located; (vi) R5–R6 delegation UI NOT shipped. **Pattern: too-narrow recon greps in earlier blocks (v1 + v2) caused two false-claim regressions. v3 fixed v2 (`tenant_users` orphan); v4 fixes v1 (org chart). Going forward: widen grep scope before claiming absence.**
- **2026-05-05 v5** — Block 5 (Territory) recon complete. **Section 1 closed (9/9 rows populated).** Findings: (i) 4 territory tables exist with mostly-correct multi-tenant column shape, but data is empty/sparse — feature is schema-ready, not yet configurable end-to-end; (ii) RPC `resolve_agent_for_context` is the single resolution path, heavily wired with 9 callers across charlie/walliam/lib; (iii) **`agent_geo_buildings` schema diverges from implementation plan** — flat `(agent_id, building_id)` instead of junction to `agent_property_access.id`; (iv) **`agent_property_access.tenant_id` is NULLABLE** — multi-tenant gap at DB level; (v) **no `/admin-homes/territory` page exists**; (vi) no territory smoke tests; no migration files matching territory keywords (out-of-band schema creation). One follow-up SQL: `agent_geo_buildings` count (failed in 9.5 due to wrong column reference) — will be filed in v5b. **Sections 2 (integration matrix), 3 (launch blockers), 4 (active tracker index) are next.**
- **2026-05-05 v6** — Sections 2–4 written. **Master tracker is complete.** Section 2 (integration matrix) covers ~25 system pairs grouped by provider. Section 3 (launch blockers) lists 16 concrete items (5 P0, 5 P1, 4 P2, 1 external, 1 scripts cleanup) with verification step + source tracker for each. Section 4 (active execution trackers) indexes 9 W-* trackers with status. **Three pivots emerged from cross-block synthesis that per-ticket trackers could not have surfaced:** (a) delegation BCC overlay (R7) is the only R5–R8 item that's P0 — others are P1; (b) anonymous session bleed (Chunk 5) silently grows DB despite chat-endpoint gate being plugged; (c) `agent_property_access.tenant_id` NULLABLE blocks tenant-2 onboarding even though current single-tenant traffic is fine. **Territory `agent_geo_buildings` count folded into Territory row: 9 rows, 1 agent, 9 buildings.** **Next: execute P0-1 (Chunk 5) → P0-2 (Phase 9) → P0-3 (logging gap) → P0-4 (R7) → P0-5 (auth lockdown). No more recon.**
- **2026-05-05 v7** — **P0-1 SHIPPED.** Commit `6dee05f` pushed; TSC clean; SQL acceptance returned `anonymous_after_ship=0`. Three structural changes in `app/api/walliam/charlie/session/route.ts`: (i) read-only branch extended to `(read_only || !userId)`; (ii) create branch defensive `userId` guard; (iii) Step 4 comment updated to document W-RECOVERY P0-1. **Auth & Sessions row Wired column flipped 🟡 → ✅.** Section 4 W-RECOVERY-A1.5 row updated. **Next:** P0-2 recon — find current `message_count` increment site in `/api/charlie/route.ts`, write atomic RPC migration, replace read-then-write.
- **2026-05-05 v8** — **P0-2 SHIPPED** (already shipped Apr 30 as W-CREDIT-VERIFY Phase D0, migration `20260430_phase_d0_atomic_session_counters.sql`). **v3 claim retired**: atomic counter IS in codebase under name `increment_chat_session_counter` (parameterized), not `increment_chat_message_count` as the W-CREDITS plan named it. Migration verified: SECURITY DEFINER, EXECUTE format with whitelist over 4 counter columns, UPDATE…RETURNING with row-lock serialization, built-in DO $ smoke checks. Decrement uses GREATEST(0, …) — no underflow. Both wired in route.ts (lines 270 + 466 increment, 538 decrement). **Residual race opens as P1-6**: pre-increment gate uses stale `msgUsed`; concurrent burst can soft-exceed cap by 1–2 messages per user. Counter stays correct (atomic), subsequent requests gated normally. **Pattern note**: this is the THIRD too-narrow-grep correction (v3 tenant_users, v4 AgentOrgChart, v8 RPC name). Going forward, when checking "is X shipped" — grep on functional behavior or migration filenames, not on guessed function names. **Status: 2/5 P0 shipped. Next: P0-3 (logging continuity gap May 3–5).**

---

## Next action

**P0-3 in progress: chat_messages_v2 logging continuity gap (May 3–5).** Diagnose cause: query `chat_messages_v2` for any rows past May 2; if none and there has been chat traffic, read `/api/charlie/route.ts` lines 52, 354 to find silent break.