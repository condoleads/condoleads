# W-HIERARCHY Tracker

**Started:** 2026-05-02 (resumed; original work began Apr 2026 as Phase 3.4+)
**Owner:** Shah (sole dev)
**Status:** H1 + H2 + H3.0–H3.8b + H3.9 + H4 DONE. Only H5 (smoke) + H6 (close) remain.
**Last patched:** 2026-05-03 v15 — H3.9 shipped (commit `bd1f462`). `lib/actions/leads.ts` brought into Lead+Email contract: walker, recipients helper, single helper-driven send replacing 3-call sendActivityEmail loop, F67 try/catch standard. Stage 1 contract smoke 3/3 PASS via `scripts/h3-9-smoke.js` against real Supabase + real Resend. Stage 2 folded into H5. F51 retired.

---

## Scope contract (LOCKED)

W-HIERARCHY covers three intersecting concerns:

1. **Hierarchy walking** — agents.parent_id chain correctness, role classification at walk time, walker behavior
2. **Email / lead fan-out** — every lead-triggering email writes a lead row first; every lead fans out to the full chain via the recipients helper
3. **Territory routing** — geo/listing/building/community routing determining which agent owns a lead, feeding the hierarchy walk

**Out of scope (preserved as-is, not touched):**
- Plan content, plan generation, plan dynamics, plan UX
- Appointment calendar at end of plan (user-initiated, working as intended)
- Inline form on PlanDocument (preserved — captures follow-up questions; enrichment writer for plan lead)
- Charlie chat experience, AI behavior, prompts, tools
- Estimator UX, estimator session shape
- Archive / data lifecycle (deferred to mature-product phase)
- System 1 (sacred — never modified)

**Spun out to sister tracker:**
- **F63 — Role transition system + universal delegation** → `docs/W-ROLES-DELEGATION-TRACKER.md`
- W-HIERARCHY exposes the recipients helper API (H3.3); W-ROLES-DELEGATION extends it for delegation lookup at each layer

---

## Locked product model

### Roles ladder (6 steps)

1. Agent
2. Manager
3. Area Manager
4. Tenant Admin
5. Manager Platform
6. Admin Platform (exactly one — Shah, perpetual)

### Universal delegation (Support / Supervisor / Assistant)

Every role on the ladder can have one or more **active delegations** of their authority. A delegation grants the delegate the same rights as the delegator, scoped to the delegator's domain. One person can be a delegate for multiple delegators (one Support → many delegators). A delegate cannot themselves create further delegations (no support-of-support — prevents rights laundering).

This is **not a separate tier**. Delegation is a relationship in a join table, queried alongside the role ladder.

### Email = lead = dashboard row

Every lead-triggering email writes a `leads` row first. Lead row keys to the user via auth `user_id`. Dashboard is durable; email is notification of the dashboard row. **Plan email is the lead email.**

### Recipient policy: open chain, no suppression

Every lead fans out to every populated layer below. No scale-aware filtering, no severity gating, no digest mode. Helper returns all populated layers; routes never branch around it.

### Lead+Email contract (PERMANENT INVARIANT)

- Every lead-triggering email writes a `leads` row first
- Every lead row carries (`agent_id`, `manager_id`, `area_manager_id`, `tenant_admin_id`, `tenant_id`)
- Every chain notification is a single `sendTenantEmail` call with TO/CC/BCC populated by `getLeadEmailRecipients` helper — no fan-out loops, no shadow admin sends
- Layer 6 (Admin Platform) is unconditional BCC; system fails closed via `AdminPlatformUnreachable` rather than silently dropping it
- F67 try/catch standard at every email send: `TenantEmailNotConfigured` → warn + soft-fail; `TenantEmailFailed` → error + soft-fail; unexpected → error log; `AdminPlatformUnreachable` → soft-fail chain notification, lead durability preserved

---

## Verified state

### Schema (verified 2026-05-03 via information_schema.columns; H3.0 + H3.2 applied)

- `agents.parent_id`, `agents.role`, `agents.is_admin`, `agents.tenant_id`, `agents.can_create_children`
- `agents` CHECK constraint `agents_tenant_admin_role_consistency` — prevents F50 recurrence
- `leads`: agent_id, manager_id, area_manager_id, **tenant_admin_id (added H3.0 2026-05-03)**, tenant_id, intent, geo_name, budget_max, plan_data, appointment_date, appointment_time, appointment_properties, appointment_status, reschedule_token, status, status_axis, stage, urgency, closed_reason, contact_*, source, source_url, building_id, listing_id
- `platform_admins.tier` (added H3.2) — CHECK constraint `tier IN ('admin', 'manager')`
- `platform_manager_tenants` join table (added H3.2) with PK on (platform_admin_id, tenant_id), indexes on both columns, RLS enabled
- `platform_audit_log`

### Hierarchy walker (`lib/admin-homes/hierarchy.ts`)

- `walkHierarchy(agentId, supabase)` — walks parent_id upward, max 6 hops, cycle defense
- Returns `{ manager_id, area_manager_id, tenant_admin_id, ancestors }`
- Stops at `role='tenant_admin'` boundary

### WALLiam tenant agents (verified post-H3.1 + H3.1b)

- King Shah — `role='tenant_admin'`, `is_admin=true`, `parent_id=null`. **F50 retired.**
- Neo Smith — `role='agent'`, parent_id=King Shah
- WALLiam (brand placeholder) — `role='agent'`, `parent_id=fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe` (King Shah). **F52 retired.**

### Recipients helper (`lib/admin-homes/lead-email-recipients.ts` — H3.3)

- `getLeadEmailRecipients(tenantId, agentId | null, supabase) → { to, cc, bcc, resolved }`
- Re-exports `sendTenantEmail`, `TenantEmailNotConfigured`, `TenantEmailFailed` for single import surface
- Throws `AdminPlatformUnreachable` if Layer 6 cannot resolve
- If `agentId` is null, Admin Platform promoted to TO

### Leads table state (post-H4 wipe)

- 277 pre-contract test leads wiped 2026-05-03
- 32 orphan vip_requests wiped same transaction
- 214 cascaded lead_email_log rows auto-wiped via FK CASCADE
- chat_sessions (2096) preserved; lead_id severed on the 1 row that had it
- chat_messages_v2 (64) untouched
- Backups: `leads_backup_20260503`, `vip_requests_backup_20260503`, `lead_email_log_backup_20260503` — drop after H6

---

## Phases — completed

### H1 — Foundation recon (DONE)

7 lead-creating routes identified via complementary greps. Schema state verified. Walker behavior verified.

### H2 — Per-route audit (DONE)

7 routes + vip-approve audited end-to-end. F47–F60 + F64–F69 surfaced.

### H3.0 — leads.tenant_admin_id column (DONE 2026-05-03)

`ALTER TABLE leads ADD COLUMN tenant_admin_id uuid REFERENCES agents(id);` + index.

### H3.1 — King Shah role + CHECK constraint (DONE 2026-05-03)

UPDATE King Shah's role to `tenant_admin`. CHECK constraint `agents_tenant_admin_role_consistency` prevents recurrence. **F50 retired.**

### H3.1b — Brand placeholder parent_id (DONE 2026-05-03)

UPDATE WALLiam brand-placeholder agent's parent_id → King Shah. **F52 retired.**

### H3.2 — Platform tier schema (DONE 2026-05-03)

`platform_admins.tier` column with CHECK constraint. `platform_manager_tenants` join table with PK + indexes + RLS. **F49 retired.**

### H3.3 — Recipients helper (DONE 2026-05-03)

`lib/admin-homes/lead-email-recipients.ts` shipped. 6 layers + unconditional layer-6 BCC + null-agent fallback. Single import surface. **F40 mechanism dead.**

### H3.4 — estimator/vip-request refactor (DONE 2026-05-03)

Walker + helper + tenant_admin_id capture. Dual-send anti-pattern collapsed to single helper-driven send. **F48 piece + F64 first-half retired.**

### H3.4b — charlie/lead bundle (DONE 2026-05-03)

Walker + UPSERT + auth-email enforcement in one commit. INSERT replaced with UPSERT keyed on (user_id, tenant_id, source, intent). Server uses `auth.users.email` regardless of form-typed value. **F53, F57, F60 retired.**

### H3.5 — estimator/vip-questionnaire refactor (DONE 2026-05-03)

Walker + helper + tenant_admin_id capture. UPSERT pattern enriches existing vip-request lead row (matched on user_id + tenant_id + source LIKE 'walliam_estimator%'). **F48 piece + F64 second-half retired.**

### H3.6 — charlie/appointment refactor (DONE 2026-05-03)

Walker + helper + appointment-specific columns preserved. W-RECOVERY A1.5 auth gate preserved. **F48 piece + F65 retired.**

### H3.7 — Per-route tenant_admin_id capture (DONE 2026-05-03)

Rolled into H3.4 + H3.5 + H3.6 + H3.8 (per-route capture rather than separate pass). **F58 retired across all routes.**

### H3.8 — Already-wired routes batch (DONE 2026-05-03)

3 routes (plan-email, walliam/charlie/vip-request, walliam/contact) refactored to consume helper uniformly. Hardcoded ADMIN_EMAIL constants removed. Walker call shape standardized. **F47 (lead-route scope), F66, F67 retired.**

### H3.8b — vip-approve helper integration (DONE 2026-05-03)

Inline literal `bcc: 'condoleads.ca@gmail.com'` removed; replaced with helper-resolved bcc. Pre-existing parent_id-missing-from-SELECT bug fixed in passing. **F54 retired.**

### H3.9 — lib/actions/leads.ts registration path (DONE 2026-05-03 commit `bd1f462`)

Final code-side gap. End-to-end Lead+Email contract compliance:
- Imports updated: `walkHierarchy` + `getLeadEmailRecipients` + `sendTenantEmail` + error classes
- Walker captures full chain (manager_id, area_manager_id, tenant_admin_id) on insert
- INSERT payload expanded from agent_id-only to all 5 hierarchy IDs
- Old 3-call loop (agent → manager → admin via sendActivityEmail with receive_*_emails flags) replaced with single helper-driven sendTenantEmail
- F67 try/catch standardized
- Option A locked: dup-branch in `getOrCreateLead` stays silent (no email on `updated_at` bump)

3 call sites verified passing tenantId correctly: `createLead.ts`, `joinTenant.ts`, `submitLeadFromForm.ts` — wrapper code untouched (thin shims around `getOrCreateLead`).

**Stage 1 contract smoke: 3/3 PASS** via `scripts/h3-9-smoke.js` against real Supabase + real Resend. Resend message IDs returned: `20ebfd4e-169c-4f4a-ac41-4f0e40dca006`, `2efc1cb5-c0ae-48df-8b8a-7712d80826ff`, `07c0fdda-4255-4732-97dd-4c66ec76ad7e`. Stage 2 (HTTP smoke against running Next.js) folded into H5.

**F51 retired.**

### H3.10 — Auth-email enforcement on charlie/lead (DONE 2026-05-03)

Rolled into H3.4b. Server uses `auth.users.email`; form-typed value ignored.

### H3.11 — INSERT → UPSERT on charlie/lead (DONE 2026-05-03)

Rolled into H3.4b. UPSERT keyed on (user_id, tenant_id, source='walliam_charlie', intent).

### H4 — Pre-contract data wipe (DONE 2026-05-03)

**Reframed from "backfill" to "wipe" after verification confirmed all 277 pre-existing leads were test data:**
- 277/277 had null `manager_id` and null `tenant_admin_id`
- 277/277 belonged to walliam tenant
- 100% of contact emails matched test patterns
- Date range Jan 26 → May 2 — three months of dev/smoke artifacts

Backups taken first (`*_backup_20260503` tables), then wipe transaction with in-flight verification + rollback-on-failure DO block. Post-wipe state: leads/lead_email_log/lead_notes/vip_requests all 0; chat_sessions preserved at 2096; chat_messages_v2 untouched at 64.

---

## Phases — remaining

### H5 — Live smoke matrix

All 9 lead-creating surfaces exercised against real walliam tenant on a clean (`H4`-wiped) leads table. F40 + F57 regression cases included.

#### Sequencing

Two execution models work; pick at H5 kickoff:

1. **HTTP smoke** — `npm run dev` running locally, scripted Node.js test posts realistic payloads to each route. Programmatic, reproducible, exercises framework + middleware + wrapper + contract. ~1.5h.
2. **Real-browser smoke** — Shah manually fires each entry point; SQL + inbox check after each. Slower but exercises actual user-facing flows. ~2.5h.

Recommended hybrid: HTTP smoke for routes 1–8, real-browser for route 9 (vip-approve is an email-link click flow harder to script).

#### Matrix (9 cases + 2 regression checks)

| # | Surface | Trigger | Expected lead row | Expected email chain |
|---|---|---|---|---|
| H5.1 | `/api/charlie/plan-email` (buyer) | Generate buyer plan, complete email step | all 5 hierarchy IDs, intent='buy' | TO=agent, CC=manager, BCC=area_mgr+tenant_admin+admin_platform |
| H5.2 | `/api/charlie/plan-email` (seller) | Generate seller plan | Same shape, intent='sell' | Same chain |
| H5.3 | `/api/walliam/charlie/vip-request` | Charlie hits VIP gate, user submits VIP form | source='walliam_charlie_vip_request' | Same chain |
| H5.4 | `/api/walliam/contact` | Submit contact form on building/listing/geo page | source='walliam_contact' | Same chain |
| H5.5 | `/api/walliam/estimator/vip-request` | Estimator VIP request | source='walliam_estimator_vip_request' | Same chain |
| H5.6 | `/api/walliam/estimator/vip-questionnaire` | Questionnaire after vip-request | UPSERT — enriches vip-request row, NOT new row | Single send (F64 regression check) |
| H5.7 | `/api/charlie/appointment` | Book appointment at end of plan | source includes appointment_*, all 5 hierarchy IDs | Same chain |
| H5.8 | `/api/charlie/lead` (form-enrichment) | Plan email + form submission flow | UPSERT keyed on (user_id, tenant_id, source, intent); auth.users.email used | Same chain |
| H5.9 | `/api/walliam/estimator/vip-approve` | Click approval link in agent inbox | n/a (status flip on existing vip_request) | Single email to applicant |
| **F40 regress** | H5.1 with `session.agent_id=null` (forced) | Inject null agent at email-send | Lead valid; admin-platform promoted to TO | Layer-6 BCC unconditional |
| **F57 regress** | H5.8 with prior plan-email lead | Submit form when plan-email already wrote a lead row | UPSERT enriches existing; total leads delta = 0 (or 1 if no prior) | n/a |

#### Done criteria

- Every case: lead row inserted with all 5 hierarchy IDs populated
- Every case: email chain matches expected layers (TO/CC/BCC verified per case)
- F40 regression: admin BCC present even when agent is null
- F57 regression: no duplicate row created on re-submission
- TSC clean
- All cases documented in tracker H5 status log entry

### H6 — Close

When H5 completes:
- Drop `leads_backup_20260503`, `vip_requests_backup_20260503`, `lead_email_log_backup_20260503`
- Cleanup `scripts/h3-9-smoke.js`, `scripts/h3-9-patch.js`, `scripts/h3-9-smoke-fix.js`, `scripts/h3-9-smoke-fix-v2.js`, `scripts/patch-tracker-v15.js`, `scripts/rewrite-tracker-v15.js` per memory's "cleanup scripts/ after testing" rule
- Retire W-HIERARCHY tracker
- Open W-ROLES-DELEGATION sister tracker (R1 recon)

---

## Findings

### Open

| ID | Description | Phase | Status |
|---|---|---|---|
| **F55** | 3 platform-level routes still hold the literal `condoleads.ca@gmail.com`. Out of W-HIERARCHY scope. | Separate phase post-W-HIERARCHY | OPEN |
| **F68** | Walker-contract documentation: when an agent is structurally tenant_admin themselves, `chain.tenant_admin_id` is null because walker only stamps ancestors. Behavior correct; H5 must explicitly test this case. | H5 acceptance criteria | OPEN — to verify in H5 |
| **F69** | Estimator VIP request modal asks registered users for phone they already provided at registration. Frontend bug, deferred to post-W-HIERARCHY. | Frontend bugs phase | OPEN |

### Closed

| ID | Description | Retired by |
|---|---|---|
| **F40** | Buyer plan email did not reach admin BCC during D2c smoke. | H3.3 (2026-05-03) — recipients helper enforces unconditional layer-6 BCC. |
| **F47** | Hardcoded `ADMIN_EMAIL` constants in lead routes. | H3.8 (2026-05-03) — replaced with helper across all 7 routes. F55 spun out for platform-level scope. |
| **F48** | 7 lead routes audit (3 wired, 1 partial, 3 not-wired). | H3.4 + H3.4b + H3.5 + H3.6 + H3.8 (2026-05-03) — all 7 routes uniformly wired with walker + helper. |
| **F49** | `platform_admins` had no tier column. | H3.2 (2026-05-03) — tier added with CHECK; platform_manager_tenants created with RLS + indexes. |
| **F50** | King Shah role/structure mismatch — class issue. | H3.1 (2026-05-03) — King Shah `role='tenant_admin'`; CHECK constraint prevents recurrence. |
| **F51** | `lib/actions/leads.ts` no walker, no helper integration. W-TENANT-AUTH overlap. | H3.9 (2026-05-03 commit `bd1f462`) — file refactored end-to-end. Stage 1 smoke 3/3 PASS. |
| **F52** | Brand-placeholder agent had `parent_id=null`. | H3.1b (2026-05-03) — parented to King Shah; walker climbs. |
| **F53** | `/api/charlie/lead` walked via direct parent_id. | H3.4b (2026-05-03) — walker added; route reclassified as enrichment writer (UPSERT). |
| **F54** | vip-approve inline `bcc:` literal. | H3.8b (2026-05-03) — replaced with helper call; pre-existing parent_id-missing-from-SELECT bug fixed in passing. |
| **F56** | `sendTenantEmail` helper clean. | Verified H1 — non-issue. |
| **F57** | Plan-email + `/charlie/lead` both insert. | H3.4b (2026-05-03) — INSERT replaced with UPSERT. |
| **F58** | All 7 lead routes computed `tenant_admin_id` from walker but didn't write it. | H3.0 + H3.4–H3.6 + H3.8 (2026-05-03) — every refactored route writes tenant_admin_id from walker. |
| **F59** | Plan-email's no-agent branch sent to admin as TO not BCC. | H3.3 (2026-05-03) — helper layer-6 unconditional. |
| **F60** | Auth email is identity. Form cannot override. | H3.4b (2026-05-03) — server uses `auth.users.email`; form email ignored. |
| **F64** | Estimator vip-request + vip-questionnaire two-email anti-pattern. | H3.4 + H3.5 (2026-05-03) — both routes use single helper-driven send. |
| **F65** | charlie/appointment same conditional-BCC bug as F59. | H3.3 + H3.6 (2026-05-03) — helper retired mechanism class; appointment now consumes helper. |
| **F66** | Walker call shape inconsistent across wired routes. | H3.8 (2026-05-03) — all wired routes refactored to identical pattern. |
| **F67** | walliam/contact try/catch is reference pattern; standardize across other 6 routes. | H3.4–H3.6 + H3.8 + H3.8b (2026-05-03) — every refactored lead route uses standard pattern. |

### Spun out (separate trackers)

| ID | Description | Where |
|---|---|---|
| **F63** | Role transition system + universal delegation. | `docs/W-ROLES-DELEGATION-TRACKER.md` (R1 recon, opens after H6). |

---

## Workflow rules in effect

All Rule Zero invariants hold for every change:

- **Multitenant rule zero** — every query carries tenant_id. No hardcoded tenant constants.
- **No regressions rule zero** — identify every feature touched, smoke each.
- **Comprehensive rule zero** — root cause not symptom. No half-fixes.
- **Nothing deferred rule zero** — identified-today-shipped-today.
- **No guessing rule zero** — verification commands run in current session.
- **Backup rule zero** — timestamped backup before any modification.
- **No placeholders rule zero** — fully-formed scripts only.
- **Secrets rule zero** — fingerprint format only in chat.
- **System 1 isolation** — no System 1 file modifications.
- **Modal pattern is dead** — hierarchy editing surfaces are workspace-based.
- **Lead+Email contract** — every lead-triggering email writes a leads row first; every lead fans out via the recipients helper to all populated chain layers.

---

## Status log

- **2026-05-02 16:00** — Tracker created. W-CREDIT-VERIFY closed.
- **2026-05-02 16:30** — H1 recon complete. F48 (3 routes not wired), F49 (no platform tier), F50 (King Shah role), F51 (lib/actions/leads.ts) added.
- **2026-05-02 v2** — H1 amendment. F47–F60 added.
- **2026-05-02 v3** — Q1+Q2+Q3 answered. Scope contract locked.
- **2026-05-02 v4** — Delegation model integrated. F63 spun out to W-ROLES-DELEGATION sister tracker.
- **2026-05-03 v5** — H2 audit complete. All 7 lead routes + vip-approve audited. F58 reclassified as 3-route class issue. F64 added. F65 added.
- **2026-05-03 v6** — H3.0 + H3.1 + H3.1b + H3.2 + H3.3 SHIPPED. F40, F49, F50, F52 retired. Recipients helper (`lib/admin-homes/lead-email-recipients.ts`) is single source of truth.
- **2026-05-03 v7** — H3.4 + H3.5 + H3.6 SHIPPED. estimator/vip-request, estimator/vip-questionnaire, charlie/appointment all refactored. F48 piece, F64 (both halves), F65 retired. F68 added (walker-contract documentation finding). SECURITY EVENT: SUPABASE_SERVICE_ROLE_KEY pasted in chat during smoke debugging — rotated immediately.
- **2026-05-03 v8** — H3.8b SHIPPED. vip-approve refactored. F54 retired.
- **2026-05-03 v9** — H3.8 SHIPPED. plan-email + walliam/charlie/vip-request + walliam/contact refactored as batch. F47 (lead-route scope), F66, F67 retired. **All 7 lead routes uniformly compliant with Lead+Email contract.**
- **2026-05-03 v10** — Internal review pass. F51 confirmed scoped to lib/actions/leads.ts only. H3.9 reframed as W-TENANT-AUTH coordination.
- **2026-05-03 v11** — H3.4b PRE-WORK. charlie/lead body read; design questions on F60 (server enforcement vs reconciliation) resolved in favor of strict server override.
- **2026-05-03 v12** — H3.8 batch retrospective. All 7 lead routes verified Lead+Email contract compliant. Only H3.4b bundle + H3.9 remain in code wave.
- **2026-05-03 v13** — H3.4b BUNDLE SHIPPED. charlie/lead refactored with walker + UPSERT + auth-email enforcement in one commit. F53, F57, F60 retired. **All 7 lead routes uniformly wired**; only H3.9 + H4 + H5 remain.
- **2026-05-03 v14** — H4 reframed and executed. Verification confirmed all 277 pre-existing leads test data (all walliam tenant, all test-pattern emails, all null hierarchy IDs). Backups taken (`*_backup_20260503` tables, 277 + 32 + 214 rows). Wipe transaction executed atomically with in-flight rollback-on-failure verification: leads → 0, lead_email_log → 0, lead_notes → 0, vip_requests → 0; chat_sessions (2096) and chat_messages_v2 (64) preserved per design. Backup-table cleanup deferred to post-H6.
- **2026-05-03 v15** — H3.9 SHIPPED (commit `bd1f462`). `lib/actions/leads.ts` brought into Lead+Email contract end-to-end: walker captures full chain on insert, INSERT payload expanded from agent_id-only to all 5 hierarchy IDs (was a contract regression; now compliant), 3-call sendActivityEmail loop replaced with single helper-driven sendTenantEmail, F67 try/catch standardized. Option A locked: dup-branch in `getOrCreateLead` silent. 3 call sites verified passing tenantId correctly. **Stage 1 contract smoke 3/3 PASS** via `scripts/h3-9-smoke.js` against real Supabase + real Resend; Resend message IDs `20ebfd4e`, `2efc1cb5`, `07c0fdda`. Stage 2 (HTTP smoke against running Next.js) folded into H5 — efficiency decision, no duplication. F51 retired. Tracker rewritten v8 → v15 (per Approach A) because v9–v14 chat-artifact patches never landed on disk. **Tracker progress: H1 + H2 + H3.0–H3.8b + H3.9 + H4 DONE. Only H5 + H6 remain.** Next action: H5 smoke matrix.

---

## Next action

**H5 — live smoke matrix.** Execute against the clean (H4-wiped) leads table. Hybrid model: HTTP smoke for routes H5.1–H5.8 (scripted against `npm run dev`); real-browser for H5.9 (vip-approve email-link click). 2 regression checks (F40, F57) included. After H5 PASS → H6 close (drop backup tables, cleanup smoke scripts, hand off to W-ROLES-DELEGATION sister tracker).

Open question for H5 kickoff: scripted HTTP test or real-browser? Recommend HTTP for speed/reproducibility; real-browser only for H5.9 because email-link click is hard to script cleanly.
