# W-LEADS-WORKBENCH-TRACKER

**Version:** v6 — OPEN 2026-05-13 — W2 + W2.5 + W3c-A SHIPPED. W2: leads.status CHECK +3 values, lead_admin_actions audit table, tenant_manager_assignments junction. W2.5: lib/admin-homes/scope.ts with isCrossTenantView + getScopedTenantId + scopeLeadsQuery + scopeAgentsByRole + 7-role constants (TENANT_ROLES, PLATFORM_TIERS, PRINCIPAL_TIERS). Pure helpers; consumer migration phase-by-phase as each surface is touched (W4 workbench uses scope.ts on day 1). can() permission expansion deferred — W1-VERIFIED Probe 1 confirmed existing permissions.ts already covers all needed semantics. Next: W3c source-URL wiring across lib/actions/leads.ts buildLeadEmail + 8 inline builders + 3 estimator routes (~80-100 min).

**Workstream:** Build `/admin-homes/leads/[id]` as the canonical lead workbench page. Strip the L1+L5+L6+L7 surfaces from the leads table row. Surface the working user credit system in lead context. Render plans at full email-template richness. Replace tab-flipping flows with in-page actions. Add unified action audit log. Build full 7-role hierarchy with scope predicates + permission gates. Aggregate per-user lead history into a cumulative workbench view. Propagate source URL from every CTA to every email recipient.

**Opened:** 2026-05-12
**Closed:** —

---

## Background — why this workstream exists (v1)

W-LEADS-UI-POLISH (closed 2026-05-12 v17) shipped 7 phases of inline-on-row + drawer features that surfaced thin versions of user-level data on the leads page. Review found this approach architecturally wrong:

1. Credit management belongs at the user level and was already working/tested on `/admin-homes/users`. The row credit chip + 4-input grant form duplicated and thinned that working surface.
2. Drawer Plan Content rendered 4 fields vs the agent-email full `plan_data` JSONB rendering. Information density regressed inside the platform vs the email already going out.
3. Quality 4-button row overlapped conceptually with Status and drove zero business behavior.
4. Drawer-based detail limits real estate to ~480px, is not deep-linkable, not shareable.

Founder direction 2026-05-12: "make a tracker and lets get to work — a day's delay in launch won't hurt but we need something solid not a mediocre."

---

## v2 scope expansion 2026-05-12

After the v1 plan locked, founder review surfaced three substantial gaps:

### Gap 1: Lead source completeness + bugs
Comprehensive lead capture inventory across the platform was missing. Every CTA must be wired, source-correct, URL-bearing, and email-flowing. Home property page is missing the Book a Visit CTA that exists on Condo property pages (parity gap). The two known-bug instances (testingleads@gmail.com buyer plan delivery; registration source) are tackled comprehensively through universal source URL + lead-write wiring covering every CTA — not as separate bug traces.

### Gap 2: Source URL propagation to email
Every lead capture has a context URL (the property page, the building page, the listing card's parent, the home page). That URL must be captured at lead-write time, stored on the lead row (`leads.source_url TEXT` column), and rendered in every email going to the hierarchy chain. Recipient clicks URL in email → instantly at the relevant page → acts in seconds. This applies to every CTA in the inventory, no exceptions.

### Gap 3: Cumulative view architecture
Lead events are NOT independent — when a user touches multiple CTAs over time, the agent must see the complete journey from a single entry point. Architecture:
- `leads` table stays as event log (no shape change)
- Leads list view **collapses by user_id** when present (one row per identified user, anonymous leads stay per-row), with "+N earlier events" indicator
- Workbench page (`/admin-homes/leads/[id]`) is **anchored on user_id** when present, aggregating all leads from that user (timeline, plans, emails, VIP requests, credit grants, admin actions all union'd)
- Status / Quality / Notes become per-user-journey values when user_id is present (latest lead's values render as the user's current state)

### Gap 4: Role hierarchy — 7 roles, not 5
Founder corrected the role list. Full hierarchy:
1. **platform_admin** (founder) — all tenants, all tech
2. **platform_assistant** (NEW) — supports platform_admin; all tenants visible; no destructive or tech actions (no delete, no bulk_sync, no schema, no tenant_create, no API keys)
3. **tenant_manager** (NEW) — admin role spanning a subset of tenants (their assigned set); full business admin within those tenants; no tech (no bulk_sync, no API keys, no schema)
4. **tenant_admin** — owns single tenant; full admin including tech
5. **area_manager** — within tenant, manages a geographic area; sees descendants in hierarchy
6. **manager** — within tenant, direct reports + self
7. **agent** — within tenant, own assigned leads only

Multi-tenant assignment for `tenant_manager` requires a new table `tenant_manager_assignments(user_id, tenant_id, granted_at, granted_by)` with composite primary key.

Top-bar UI per role:
- platform_admin → Universal / Tenant toggle + tenant dropdown
- platform_assistant → Universal / Tenant toggle + tenant dropdown (read-only badges on destructive actions)
- tenant_manager → tenant switcher dropdown showing only their assigned tenants
- tenant_admin / area_manager / manager / agent → no toggle, locked to their tenant

Two scoping mechanisms enforce safety:
- `scopeLeadsQuery(user, baseQuery)` — applies the tenant + hierarchy scope predicate per role
- `can(user, 'action.name')` — gates per-action permissions independently of scope

---

## Scope contract (v2)

### This workstream OWNS

- New route `app/admin-homes/leads/[id]/page.tsx` (server-rendered workbench)
- New client component for the workbench (tabs, action handlers)
- Reusable `<UserCreditPanel>` component extracted from existing Users page credit UI
- Reusable `<PlanRenderer>` component (handles buyer + seller variants at email-template richness)
- New file `lib/admin-homes/scope.ts` exposing `scopeLeadsQuery(user, baseQuery)` — every leads read goes through it
- Permission constants extension in `can()` for `platform_assistant`, `tenant_manager` roles + per-action gates (delete, bulk_sync, reassign, tech_settings, etc.)
- Schema migrations:
  - Status enum extension: `do_not_contact`, `not_interested`, `disqualified`
  - `leads.source_url TEXT` column with backfill
  - `lead_admin_actions` audit table (unified admin action log)
  - `tenant_manager_assignments` table (multi-tenant role membership)
- New admin endpoints (all gated by scope + can()):
  - `POST /api/admin-homes/leads/[id]/send-email`
  - `POST /api/admin-homes/leads/[id]/vip-approve`
  - `POST /api/admin-homes/leads/[id]/reassign-agent`
  - `POST /api/admin-homes/leads/[id]/notes`
- Strip from `AdminHomesLeadsClient.tsx`: L1 quality buttons, L5 credit chip, L6 grant pill, L7 drawer
- Home property page parity fix: add Book a Visit CTA matching Condo
- Source URL wiring across every lead-capture endpoint + email template
- Default leads view filtering (drop terminal statuses)
- Default leads view sorting (Hot quality at top within active)
- Click-row → navigate to workbench
- Leads list collapse-by-user_id (default ON, toggle to show-all-events)
- Workbench cumulative view (anchored on user_id, unions all leads' data)
- Role-aware top bar (Universal/Tenant toggle for platform_admin/assistant; tenant switcher for tenant_manager)
- Per-role action gates in UI + API (delete, reassign, bulk_sync hidden/disabled per role)
- Code-based smoke matrix (every CTA × every role × cumulative variants) in `scripts/smoke-w-leads-workbench.ts`

### This workstream does NOT own

- Charlie / chat / estimator / plan generation flows (W-LEADS-EMAIL already shipped)
- Existing `POST /api/admin-homes/users/override` endpoint (reused as-is)
- Email walker (W-HIERARCHY + W-LEADS-EMAIL already shipped)
- VIP token-based approve route (wrapped, original kept untouched)
- Tenant onboarding / Paddle integration
- Users page / Agents page / Listings page / Dashboard scope-helper adoption (these get the same `scopeLeadsQuery`-equivalent treatment in follow-up workstreams; this workstream defines the helper and applies to leads surfaces only)
- Mobile-specific UX (default responsive only)

---

## Outcomes desired (v2)

After Wclose:

1. Click any lead in `/admin-homes/leads` → navigates to `/admin-homes/leads/[id]` workbench page.
2. Workbench renders 7 tabs: Overview, Plan, Credits & Usage, Activity, Emails, VIP Requests, Notes.
3. **Workbench aggregates all leads from the same user_id** — agent sees the complete journey on the latest lead. Anonymous leads (no user_id) show single-event view.
4. **Leads list collapses by user_id** (default), with "+N earlier events" indicator. Anonymous leads each get their own row. Toggle to show-all-events for drill-down.
5. Credits & Usage tab embeds canonical user credit panel (extracted from Users page surface).
6. Plan tab renders full buyer + full seller plan content at email-template richness.
7. **Source URL** captured on every lead, rendered in every email — recipient clicks to act instantly.
8. **Home property page has Book a Visit CTA** matching Condo (parity).
9. Approve VIP works in-page (no new-tab flip).
10. Send Email composer with audit logging.
11. Reassign Agent dropdown (gated per role).
12. Action audit log records every admin action.
13. Status enum gains `do_not_contact`, `not_interested`, `disqualified`. Default view filters terminal states out.
14. Quality field UI = Hot / Cold binary (NULL default for new leads). Hot sorts to top.
15. **Role-aware UI:** Universal/Tenant toggle (platform_admin + platform_assistant), tenant switcher (tenant_manager), locked-to-tenant (everyone else). Action visibility/enablement per role.
16. **scopeLeadsQuery** wraps every leads read across the workstream's API surface.
17. **Smoke matrix** in `scripts/smoke-w-leads-workbench.ts` validates: every CTA writes correct source + lead_origin_route + source_url + tenant_id; every email fans out correctly; every role sees only their scope; cumulative-view aggregation works.

---

## Phase table (v2 — 22 phases across 6 groups)

### Group A — Foundation

| # | Phase | Status | Commit | Notes |
|---|---|---|---|---|
| W1 | Deep recon (Group A) | VERIFIED | 2026-05-13 | 10/10 sub-targets verified from disk+DB. W1-PARTIAL pass (1-6): lead-capture surface 10 paths; property page CTAs dual-branch isWalliam/agent with OfferInquiryModal P1 bug at L300/L266; 5 API routes audited (`walliam/contact` P0 body-trust tenant_id; charlie/{appointment,lead,plan-email} + walliam/charlie/vip-request header-correct; walliam/estimator/vip-request L204 source_url partial); `leads` schema 47 cols `source_url TEXT` already exists; distributions + testingleads history + King Shah no-parent; `deriveLeadOriginRoute`. W1-VERIFIED pass (7-10): (7) `can()` at `lib/admin-homes/permissions.ts` 20,167 B — 15 PermAction literals, 5 TargetSpec kinds, 38 caller sites, pure function, cross-tenant gate, delegation overlay universal except `delegation.grant`; (8) Users credit UI — `users/page.tsx` 6,387 B + `UsersClient.tsx` 12,477 B + `override/route.ts` 4,211 B, 5-source data bundle, 3-pool resolved-limit algorithm, multi-tenant safe; (9) email renderers — `lib/actions/leads.ts buildLeadEmail` + 8 inline builders across 5 routes; `sourceUrl` already accepted by `CreateLeadParams` and writes `source_url` to row but NOT rendered in any email body; (10) cumulative-view — `leads/page.tsx` 8,681 B 6-table parallel pre-fetcher fully tenant-scoped, `[id]/route.ts` 3,220 B uses `can('lead.write')` for PATCH+DELETE, `[id]/` UI directory absent (W4a clean start), `AdminHomesLeadsClient.tsx` 48,066 B (F-W3-NEEDS-PROBE). NEW findings: F-USERS-NO-SELLER-PLAN-INPUT, F-W3C-LIB-ACTIONS-LEADS-EMAIL-NO-SOURCE-URL, F-W3C-WALLIAM-CONTACT-REFERER-CAPTURED-BUT-DISCARDED, F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED, F-W3C-EVERY-ROUTE-OWNS-ITS-OWN-BUILDER, F-W3-NEEDS-ADMINHOMESLEADSCLIENT-PROBE, F-LEADS-PAGE-NO-PAGINATION, F-NO-LEADS-GET-API, F-LEAD-OWNERSHIP-CHANGES-ALSO-NEVER-READ. W2.5 decision LOCKED: lead.write covers PATCH-style mutations per existing [id]/route.ts precedent. |
| W2 | Schema migrations | SHIPPED | 2026-05-13 | `leads_status_check` CHECK +3 values (`meeting_scheduled`, `won`, `archived`) — atomic DROP+ADD; `lead_admin_actions` audit table created (12 cols + 2 indexes + 4 FKs, mirrors `lead_email_recipients_log`); `tenant_manager_assignments` junction created (7 cols + UNIQUE(user_id,tenant_id) + 2 partial indexes WHERE revoked_at IS NULL + 3 FKs, mirrors `platform_manager_tenants`); `leads.source_url` already exists (no column-add); 143 legacy NULL rows left intact (no fabrication backfill). Migrations on disk: `20260513_w2_a_lead_admin_actions.sql`, `20260513_w2_b_tenant_manager_assignments.sql`, `20260513_w2_c_leads_status_check.sql`. All idempotent. |
| W2.5 | `scopeLeadsQuery` helper + `can()` permission expansion | SHIPPED | 2026-05-13 | `lib/admin-homes/scope.ts` CREATED with 5 exports: `isCrossTenantView(user, hostTenantId)` predicate; `getScopedTenantId(user, hostTenantId)` resolver; `scopeLeadsQuery<T>(query, user, hostTenantId)` generic helper applying tenant + role gate (manager → `.in('agent_id', [own + managed])`; agent → `.eq('agent_id', own)`; admin → no filter); `scopeAgentsByRole<T>(query, user, hostTenantId)` same pattern keyed on `id`; constants `TENANT_ROLES` (5-value) + `PLATFORM_TIERS` (2-value) + `PRINCIPAL_TIERS` (7-value full surface). Pattern extracted verbatim from `leads/page.tsx` L70-78 + L62-67. Pure helpers — zero side effects, no DB hits, no async. `can()` permission expansion DEFERRED: W1-VERIFIED Probe 1 confirmed existing `lib/admin-homes/permissions.ts` (15 actions, 5 kinds, 38 caller sites) already covers all PATCH-style workbench mutations via `lead.write` + inline tier check pattern per `app/api/admin-homes/leads/[id]/route.ts` precedent. Consumer migration of `leads/page.tsx`, `users/page.tsx`, `agents/page.tsx` DEFERRED phase-by-phase (Rule Zero #2 no-regression: each migration needs smoke; W4 workbench uses scope.ts on day 1 as fresh consumer with zero regression risk). |

### Group B — Strip + Wire

| # | Phase | Status | Commit | Notes |
|---|---|---|---|---|
| W3a | Strip L1/L5/L6/L7 noise from leads-row | OPEN | — | Remove quality 4-buttons, credit chip, grant pill, drawer JSX from `AdminHomesLeadsClient.tsx` |
| W3b | Home property Book a Visit parity | OPEN | — | Add Book a Visit CTA to home property page matching condo (4 CTAs total per property type) |
| W3c | Source URL wiring across all CTAs | OPEN | — | Every lead-capture endpoint receives + stores `source_url`; every email template renders as clickable link |
| W3d | Click-row → navigate (drawer removal) | OPEN | — | `router.push('/admin-homes/leads/' + id)` |

### Group C — Workbench Page

| # | Phase | Status | Commit | Notes |
|---|---|---|---|---|
| W4a | Page shell + header + sidebar + Overview tab | OPEN | — | Server-side prefetch aggregating across all leads from user_id |
| W4b | Plan tab (buyer + seller renderer) | OPEN | — | Match email richness exactly |
| W4c | Credits & Usage tab (extract UserCreditPanel) | OPEN | — | Reusable component from Users page surface |
| W4d | Activity tab (unified visitor + admin timeline, cumulative) | OPEN | — | Joins `user_activities` + `lead_admin_actions` across all user's leads |
| W4e | Emails tab + Send composer | OPEN | — | List + new send-email endpoint with audit logging |
| W4f | VIP Requests tab + in-page Approve | OPEN | — | Optimistic state update, no tab flip |
| W4g | Notes tab + Add note inline | OPEN | — | Reuse `lead_notes` table |

### Group D — Role-Aware Surfaces

| # | Phase | Status | Commit | Notes |
|---|---|---|---|---|
| W5a | Role-aware leads list (top bar + filters + columns) | OPEN | — | Universal/Tenant toggle (platform_admin + assistant); tenant switcher (tenant_manager); locked-to-tenant (everyone else) |
| W5b | Collapse-by-user_id in list view | OPEN | — | Default ON; "+N earlier events" indicator; anonymous leads stay per-row; toggle to expand |
| W5c | Per-role action gates everywhere | OPEN | — | Delete, reassign, bulk_sync, etc. — visibility + enablement per role; UI + API both check |

### Group E — Enhancements

| # | Phase | Status | Commit | Notes |
|---|---|---|---|---|
| W6a | Action audit log writes from every endpoint | OPEN | — | Every admin endpoint writes to `lead_admin_actions` with tenant_id, actor, action_type, target_id, before/after JSON |
| W6b | Assigned Agent reassign dropdown | OPEN | — | Gated by role (platform/assistant/tenant_manager/tenant_admin: any in scope; manager: direct reports; area_manager: descendants; agent: hidden) |
| W6c | Status default filter + Quality sort | OPEN | — | Default view = active statuses only; sort by Hot quality DESC within active |

### Group F — Test + Close

| # | Phase | Status | Commit | Notes |
|---|---|---|---|---|
| W7 | Smoke matrix | OPEN | — | `scripts/smoke-w-leads-workbench.ts` — every CTA × every role × cumulative variants; verifies source + source_url + email fan-out + scope predicate per role; rolls back transactionally (W-LEADS-EMAIL T3b pattern) |
| W8 | Local smoke + Wclose | OPEN | — | Master tracker close entry referencing all phase commits |

---

## Multi-tenant safety contract

Every new query, every new admin endpoint, every new UI surface in this workstream MUST:

- Pass through `scopeLeadsQuery(user, baseQuery)` (or equivalent for non-leads tables) — never query leads directly without it
- Use `resolveAdminHomesUser` + `can(user, 'action.name')` for action authorization
- Cross-tenant access returns 403 with no data leak in error message
- Audit log writes (`lead_admin_actions`) include tenant_id, actor_id, actor_role
- New `lead_admin_actions` and `tenant_manager_assignments` tables have tenant_id NOT NULL from creation (avoids F-LEAD-NOTES-NO-TENANT-ID-COLUMN class of issue)

---

## Recon findings carried forward (from paste 113-recon, before W1 deep recon)

- `/admin-homes/users/[id]/page.tsx` does NOT exist — no dedicated user detail page route. The "working user credit system" Shah referenced must live on `/admin-homes/users/page.tsx` (6387 bytes). W1 reads to discover credit UI shape and extracts the reusable component in W4c.
- `components/admin-homes/AdminHomesUsersClient.tsx` does NOT exist by that exact name.
- `app/api/walliam/charlie/plan-email/route.ts` does NOT exist at that path — plan email route is elsewhere; W1 globs to find.
- `app/admin-homes/leads/page.tsx` (8681 bytes) and `components/admin-homes/AdminHomesLeadsClient.tsx` (48066 bytes) confirmed present.

---

## Status log

- **2026-05-13 W3c-A-SHIPPED** — `lib/actions/leads.ts` canonical helper update (5 transforms, 1 file). `buildLeadEmail` declaration L274: new `sourceUrl?: string | null` param added between `source` and `buildingName`. Destructure L284 updated to include `sourceUrl`. Render row added in HTML table between Property and Message rows: `${sourceUrl ? <tr>...Source URL...word-break: break-all...mailto-style anchor to ${sourceUrl}...</tr> : ''}`. Insert at L183 now `source_url: params.sourceUrl || referer || null` (referer in scope from L159 capture). Call site L222-232 passes `sourceUrl: params.sourceUrl || referer || null` to match insert. Pure-additive in signature shape (optional field, no callers broken). Closes W3c-A. Phase 1-8 recon verified shape; W2.5-SHIPPED tracker entry name `emailHtml` for builder #7 confirmed wrong (real function is `buildAgentEmailHtml`); tracker entry count `8 inline builders` confirmed undercount (real total 10 in named routes + 1 local copy in vip-approve = 11 inline). NEXT: W3c-B (5 route files: walliam/contact + charlie/appointment + charlie/lead + charlie/plan-email + walliam/charlie/vip-request — referer capture via headers() from next/headers + source_url insert backfill + 8 builder updates) then W3c-C (3 estimator routes — render row in buildApprovalEmailHtml + sourceUrl param/render in buildQuestionnaireEmailHtml + buildUserApprovalEmailHtml typed-object refactor in vip-approve).
- **2026-05-13 W2.5-SHIPPED** — `lib/admin-homes/scope.ts` shipped as new file (pure additive, no existing file modified). 5 exports: `isCrossTenantView(user, hostTenantId): boolean` (platform admin + no tenant + no host = cross-tenant view); `getScopedTenantId(user, hostTenantId): string|null` (returns user.tenantId ?? hostTenantId, null on cross-tenant); `scopeLeadsQuery<T extends ScopableQuery<T>>(query, user, hostTenantId): T` (applies tenant_id .eq() filter when !seeAll, then role gate: manager → .in('agent_id', [own + managedAgentIds]); agent → .eq('agent_id', own); admin → no filter); `scopeAgentsByRole<T>(query, user, hostTenantId): T` (same pattern keyed on 'id'); 3 constant arrays `TENANT_ROLES` (5-value: agent/manager/area_manager/tenant_admin/admin from agents.role CHECK), `PLATFORM_TIERS` (2-value: admin/manager from platform_admins.tier), `PRINCIPAL_TIERS` (7-value: full surface platform_admin/platform_assistant/tenant_manager/tenant_admin/area_manager/manager/agent for documentation). Pattern extracted VERBATIM from `app/admin-homes/leads/page.tsx` L70-78 (tenant gate) + L62-67 (role gate) verified W2.5 recon. Pure functions — zero side effects, zero DB hits, zero async, zero throws (Rule Zero PURE FUNCTION CONTRACT). `can()` permission expansion DEFERRED based on W1-VERIFIED Probe 1: existing `lib/admin-homes/permissions.ts` (15 PermAction literals, 5 TargetSpec kinds, 38 caller sites, cross-tenant gate in evaluateTenantScoped, delegation overlay universal except delegation.grant) already covers all PATCH-style workbench mutations via `lead.write` + inline tier check pattern (`app/api/admin-homes/leads/[id]/route.ts` DELETE branch demonstrates `lead.write + roleDb==='agent' inline 403 check` precedent). Consumer migration DEFERRED phase-by-phase: existing inline scoping in `leads/page.tsx` (20 hits), `users/page.tsx` (13 hits), `agents/page.tsx` (9 hits), `api/admin-homes/activities/route.ts` (6 hits), `territory/page.tsx` (6 hits), `delegations/route.ts` (3 hits) preserved unchanged — Rule Zero #2 no-regression (each consumer migration needs smoke test; ship now would block W3c on smoke matrix). W4 workbench page uses scope.ts on day 1 as fresh consumer (no regression risk — no prior behavior to preserve). Consumer refactors will land alongside other changes when each page is touched (W4 leads workbench, W5 leads list collapse-by-user, etc.). Multi-tenant safety: every helper enforces `tenant_id` filter when !seeAll; cross-tenant aggregation requires explicit platform admin + no tenant context (verified pre-existing safe pattern). NEXT: W3c source-URL wiring across `lib/actions/leads.ts buildLeadEmail` (add sourceUrl param + render row) + 8 inline builders across 5 routes (`walliam/contact buildContactEmail`, `charlie/appointment buildUserConfirmationEmail + buildAgentNotificationEmail`, `charlie/lead buildUserPlanEmail + buildAgentLeadEmail`, `charlie/plan-email buildRichPlanEmail`, `walliam/charlie/vip-request emailHtml + buildUserApprovalEmailHtml`) + 3 estimator routes (`walliam/estimator/{vip-request,vip-approve,vip-questionnaire}` per F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED). Rule Zero compliance: comprehensive (all 5 expected exports + 3 constant arrays + JSDoc), verified (shape extracted from recon-confirmed pattern), no regressions (pure additive, zero existing file modifications), no deferrals on W2.5 itself (consumer migration is correctly out-of-scope, not deferred work).
- **2026-05-13 W2-SHIPPED** — W2 schema migrations applied + verified in production. (A) `leads.status` CHECK constraint replaced atomically (DROP + ADD in single Supabase transaction); 5 existing values (`new`/`contacted`/`qualified`/`closed`/`lost`) + 3 NEW (`meeting_scheduled`/`won`/`archived`); current population 163 new + 1 closed unchanged. (B) `lead_admin_actions` audit table CREATED: 12 columns mirroring `lead_email_recipients_log` shape (`id` uuid PK gen_random_uuid; `tenant_id` uuid NOT NULL FK→tenants CASCADE; `lead_id` uuid NOT NULL FK→leads CASCADE; `actor_user_id` uuid NULL FK→auth.users SET NULL; `actor_agent_id` uuid NULL FK→agents SET NULL; `actor_role` text NOT NULL [snapshot at action time]; `action_type` text NOT NULL; `target_field` text NULL; `before_value` jsonb NULL; `after_value` jsonb NULL; `notes` text NULL; `created_at` timestamptz NOT NULL DEFAULT now()); 2 btree indexes (`idx_lead_admin_actions_tenant_lead` on (tenant_id, lead_id, created_at DESC); `idx_lead_admin_actions_actor` on (actor_user_id, created_at DESC)); 4 FK constraints all verified. (C) `tenant_manager_assignments` junction CREATED: 7 cols + PK (`id`; `user_id` uuid NOT NULL FK→auth.users CASCADE; `tenant_id` uuid NOT NULL FK→tenants CASCADE; `granted_by_user_id` uuid NULL FK→auth.users SET NULL; `granted_at` timestamptz NOT NULL DEFAULT now(); `revoked_at` timestamptz NULL; `notes` text NULL); UNIQUE(user_id, tenant_id); 2 partial btree indexes WHERE revoked_at IS NULL for active-lookup hot path; mirrors `platform_manager_tenants`. (D) `leads.source_url` already exists (W1-VERIFIED Probe 3), 143 NULL legacy + 21 populated; default leave NULL (no fabrication backfill; W3c writes on new leads going forward). Migrations captured retroactively in 3 idempotent files in `supabase/migrations/`: `20260513_w2_a_lead_admin_actions.sql`, `20260513_w2_b_tenant_manager_assignments.sql`, `20260513_w2_c_leads_status_check.sql` — all use CREATE TABLE IF NOT EXISTS / DROP IF EXISTS + ADD; safe to re-run any environment. Multi-tenant safety verified: every new table has `tenant_id NOT NULL` with FK CASCADE; cross-tenant aggregation impossible by schema design. W2.5 decision LOCKED based on W1-VERIFIED Probe 1: `lead.write` already covers PATCH-style mutations (status enum change, quality change, assign) per existing `app/api/admin-homes/leads/[id]/route.ts` precedent (DELETE branch demonstrates `lead.write + inline tier check` pattern); W2.5 is additive only (new `scopeLeadsQuery` helper file + 7-role permission constants); no migration of 38 existing `can()` caller sites needed. NEXT: W2.5 ship (helper file + permission constants — single small commit), then W3c source-URL wiring across `lib/actions/leads.ts buildLeadEmail` + 8 inline builders + 3 estimator routes (`walliam/estimator/{vip-request,vip-approve,vip-questionnaire}` per F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED). Rule Zero compliance: comprehensive, verified, multi-tenant safe, no regressions (schema additions only), no deferrals.
- **2026-05-13 W1-VERIFIED** — All 4 remaining Group A / W1 sub-targets verified from disk. Probe 1 `can()` permission code: `lib/admin-homes/permissions.ts` 20,167 B; 15 PermAction literals (`agent.{read,write,promote,demote,reassignParent,adminMutate}`, `lead.{read,write}`, `tenant.{read,write}`, `delegation.{grant,revoke}`, `platform.{read,write}`); 5 TargetSpec kinds (agent/lead/tenant/delegation/platform); 38 caller sites use `can(user.permissions, action, { kind, ... })`; pure function (no I/O, no async, no throws); cross-tenant gate in `evaluateTenantScoped`; delegation overlay universal except `delegation.grant`. W2.5 decision LOCKED: `lead.write` already covers PATCH-style mutations (status/quality) — `app/api/admin-homes/leads/[id]/route.ts` proves this works; admin actions (archive/reassign/hardDelete) reuse `lead.write` + inline tier check (matches existing DELETE branch precedent that adds `roleDb==='agent'` 403 check); only ADD discrete PermAction if a workbench action needs different semantics. Probe 2 Users credit UI: `app/admin-homes/users/page.tsx` 6,387 B server component does ALL fetching; `UsersClient.tsx` 12,477 B is `'use client'` table + modal; `app/api/admin-homes/users/override/route.ts` 4,211 B POST+DELETE; data bundle = `user_profiles` + `chat_sessions` (most-recent only) + `user_credit_overrides` (4 limit cols: ai_chat_limit/buyer_plan_limit/seller_plan_limit/estimator_limit) + 17-column `tenants` cap config + `agents` for display names; resolved-limit algorithm `min(override[col], tenant.X_hard_cap) | tenant.X_free`; 3 pools rendered (AI Chat / AI Plans / Estimator). Multi-tenant safety: 4/4 supabase queries `.eq('tenant_id', scopedTenantId)` when `!seeAll`. NEW finding F-USERS-NO-SELLER-PLAN-INPUT — override API accepts `seller_plan_limit` (route L48) but UsersClient modal has no input for it; W4c decision call: expose 4th input or preserve 3-pool simplicity. Probe 3 email renderers: `lib/actions/leads.ts` 15,301 B central authority — `CreateLeadParams.sourceUrl?` declared (L57), `createLead()` INSERT writes `source_url: params.sourceUrl || null` (L168), BUT `buildLeadEmail()` (L211-249) signature has NO `sourceUrl` parameter and renders NO row for it. 5 routes have 8 distinct inline email builders: `walliam/contact buildContactEmail`, `charlie/appointment buildUserConfirmationEmail + buildAgentNotificationEmail`, `charlie/lead buildUserPlanEmail + buildAgentLeadEmail`, `charlie/plan-email buildRichPlanEmail`, `walliam/charlie/vip-request emailHtml + buildUserApprovalEmailHtml`. NEW findings: F-W3C-LIB-ACTIONS-LEADS-EMAIL-NO-SOURCE-URL (builder defect at central authority); F-W3C-WALLIAM-CONTACT-REFERER-CAPTURED-BUT-DISCARDED (L191 reads referer only for trackUserActivity, never threads to lead row or email); F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED (walliam/estimator/{vip-request,vip-approve,vip-questionnaire} ship 16 sendTenantEmail hits combined, not in W1 5-missing-source_url list; per Rule Zero Comprehensive, folded into W3c scope); F-W3C-EVERY-ROUTE-OWNS-ITS-OWN-BUILDER (8 builder signatures need sourceUrl param; consolidation deferred to potential future W-EMAIL-CONSOLIDATION). Probe 4 cumulative-view: `app/admin-homes/leads/page.tsx` 8,681 B is 6-table parallel pre-fetcher fully tenant-scoped (leads + 4 hierarchy joins, user_activities by contact_email, user_credit_overrides by user_id, vip_requests by lead_id, lead_email_recipients_log by lead_id, lead_notes by lead_id via implicit JOIN scoping); `app/api/admin-homes/leads/[id]/route.ts` 3,220 B uses `can(user.permissions, 'lead.write', {kind:'lead', leadId, tenantId, agentId})` for PATCH + DELETE (DELETE adds inline `roleDb==='agent'` 403 check — establishes lead.write-plus-extra-tier-check pattern); `app/admin-homes/leads/[id]/` UI directory does NOT exist — W4a clean start. `AdminHomesLeadsClient.tsx` is 48,066 bytes — far larger than initially scoped; W3 strip phase needs dedicated probe before delete-vs-preserve decisions. NEW findings: F-W3-NEEDS-ADMINHOMESLEADSCLIENT-PROBE; F-LEADS-PAGE-NO-PAGINATION (`.limit(10000)` at page.tsx L37, out of workbench scope); F-NO-LEADS-GET-API (W4a server-component pattern matches list page; mutations refresh via router.refresh()); F-LEAD-OWNERSHIP-CHANGES-ALSO-NEVER-READ (table both write-orphaned from W-LEADS-EMAIL T0 AND read-orphaned; W4 surface-or-sunset call). Cumulative-view aggregation pattern LOCKED: anchorLead by id+tenant_id → can('lead.read') gate → leadFamily by user_id (fallback contact_email) within same tenant_id → fan-out vip_requests/email_log/notes/activities across leadFamily.ids using page.tsx patterns verbatim → credit panel by single anchorLead.user_id reusing Probe 2 5-source bundle. Multi-tenant safety preserved: every sibling query scoped by anchorLead.tenant_id (trusted source); cross-tenant aggregation blocked by design. NEXT: W2 schema migrations — status enum +3 values (TBD W2.1 decision-lock); `lead_admin_actions` audit table; `tenant_manager_assignments` table; `leads.source_url` ALREADY EXISTS (no column-add). Then W2.5 scope helper + permission expansion (additive only). Then W3c source-URL wiring (~80-100 min: lib/actions/leads.ts + 5 main routes + 3 estimator routes; 8 builder-signature changes). Then W3a/b/d, then W4 group, then W5/W6, then W7 smoke matrix, then W8 close.
- **2026-05-13 Group A / W1-PARTIAL** — Deep recon 6 of 10 sub-targets VERIFIED with disk+DB output (not guess). VERIFIED: lead-capture surface 10 paths (9 `submitLeadFromForm` callers + `WalliamContactForm` direct POST + `VIPAIAccess` in `SiteHeaderClient`); property page dual-branch architecture (`PropertyPageClient` + `HomePropertyPageClient` full file dumps); 5 API routes audited; `leads` schema confirms `source_url TEXT` already exists (no W2 column-add for that column); status / source / lead_origin_route / assignment_source / source-url-by-source / testingleads-history / King-Shah-hierarchy distributions; `deriveLeadOriginRoute` source documented. P0 FOUND: `walliam/contact` body-trust `tenant_id` (multi-tenant leak vector). P1 FOUND: `OfferInquiryModal` `{showOfferModal && agent && ...}` guard breaks Make-an-Offer on every WALLiam property page (condo + home). PENDING — must verify on disk before downstream phase implementation: `can()` permission code (W2.5 Group A prereq); Users page credit UI shape (W4c Group C extraction source); email template renderers across 5 API routes + `lib/actions/leads.ts buildLeadEmail` (W3c Group B rendering target); cumulative-view data model for union by user_id (W4a Group C aggregation design). Founder direction 2026-05-13: bug-trace approach abandoned — `testingleads@gmail.com` buyer plan delivery + registration source fold into universal source URL wiring across all CTAs; "History missing contact" question retracted. Working group-by-group from now on (A Foundation → B Strip+Wire → C Workbench → D Role-Aware → E Enhancements → F Test+Close). Next: 4 probe pastes complete remaining Group A / W1 sub-targets, tracker flips to W1 VERIFIED, then W2 schema (status enum +3 values, `lead_admin_actions`, `tenant_manager_assignments`).
- **2026-05-12 W-open** — Workstream opened. v1 tracker created. 16-phase plan locked. Sized 10-15 hours. Master tracker Section 4 row inserted as OPEN; v18 status log entry appended. Commit: master `b1a327b` (Lclose) → W-open paste 114.

- **2026-05-12 W-v2** — Scope expansion. Founder review surfaced 4 substantial gaps: (1) Lead source completeness across the platform + 2 confirmed bugs (`testingleads@gmail.com` buyer plan delivery, registration source missing) + Home property Book a Visit CTA parity gap; (2) Source URL must propagate from every CTA to every email recipient (new `leads.source_url TEXT` column + email template rendering); (3) Cumulative view architecture — leads list collapses by user_id, workbench page anchored on user_id aggregating all leads from that user; (4) Full 7-role hierarchy with 2 new roles (`platform_assistant`, `tenant_manager`) — multi-tenant role membership via new `tenant_manager_assignments` table. Phase table expanded from 16 to 22 phases across 6 groups (A Foundation, B Strip+Wire, C Workbench, D Role-Aware, E Enhancements, F Test+Close). Sized now: ~25-30 hours focused work. Founder mandate: "I want this done once and for all comprehensively — efficient + comprehensive — done once." Multi-tenant safety contract restated: every query through `scopeLeadsQuery`, every action through `can()`, no exceptions. Testing approach: code-based smoke matrix in `scripts/smoke-w-leads-workbench.ts` validating every CTA × every role × cumulative-view variants. `testingleads@gmail.com` bug resolves as part of the architecture (Source URL + delivery pipeline correctness), not a separate hotfix. Next: W1 deep recon — read every CTA file, every lead-capture API, every email template, locate Users credit UI, SQL probe enum/state, trace 2 bugs, audit existing scope/permission code.