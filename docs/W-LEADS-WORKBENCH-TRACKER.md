# W-LEADS-WORKBENCH-TRACKER

**Version:** v2 — OPEN 2026-05-12 — Scope expanded to full 7-role hierarchy (platform_admin / platform_assistant / tenant_manager / tenant_admin / area_manager / manager / agent) + cumulative-view architecture (workbench anchored on user_id, leads list collapsed by user) + source_url propagation to email recipients + Home property Book a Visit CTA parity.

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
| W1 | Deep recon (Group A) | PARTIAL | 2026-05-13 | 6/10 sub-targets VERIFIED from disk+DB. VERIFIED: (1) lead-capture surface — 10 paths (9 `submitLeadFromForm` callers + `WalliamContactForm` + `VIPAIAccess` SiteHeaderClient L139/L242); (2) property page CTAs — `PropertyPageClient.tsx` + `HomePropertyPageClient.tsx` full dumps, dual-branch isWalliam/agent, OfferInquiryModal P1 bug at L300/L266 `{agent && ...}` guard; (3) 5 API routes — `walliam/contact` P0 body-trust tenant_id, `charlie/{appointment,lead,plan-email}` + `walliam/charlie/vip-request` header-correct, `walliam/estimator/vip-request` L204 writes source_url:pageUrl (50% partial); (4) `leads` schema 47 cols `source_url TEXT` EXISTS — no W2 column-add — + `tenants` schema; (5) distributions Q3-Q8 + testingleads history + King Shah tenant_admin no parent; (6) `deriveLeadOriginRoute` at `lib/utils/lead-origin-route.ts`. 4/10 PENDING (verify in next probes, not silent absorption): (a) `can()` permission code; (b) Users page credit UI shape (W4c extraction source); (c) email template renderers across 5 API routes; (d) cumulative-view data model (union leads by user_id). |
| W2 | Schema migrations | OPEN | — | Status enum +3 values; `leads.source_url TEXT` + backfill; `lead_admin_actions` audit table; `tenant_manager_assignments` table; all multi-tenant safe with tenant_id NOT NULL |
| W2.5 | `scopeLeadsQuery` helper + `can()` permission expansion | OPEN | — | New file `lib/admin-homes/scope.ts`; role-aware predicates; permission constants for 7 roles; existing routes refactored to use it |

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

- **2026-05-13 Group A / W1-PARTIAL** — Deep recon 6 of 10 sub-targets VERIFIED with disk+DB output (not guess). VERIFIED: lead-capture surface 10 paths (9 `submitLeadFromForm` callers + `WalliamContactForm` direct POST + `VIPAIAccess` in `SiteHeaderClient`); property page dual-branch architecture (`PropertyPageClient` + `HomePropertyPageClient` full file dumps); 5 API routes audited; `leads` schema confirms `source_url TEXT` already exists (no W2 column-add for that column); status / source / lead_origin_route / assignment_source / source-url-by-source / testingleads-history / King-Shah-hierarchy distributions; `deriveLeadOriginRoute` source documented. P0 FOUND: `walliam/contact` body-trust `tenant_id` (multi-tenant leak vector). P1 FOUND: `OfferInquiryModal` `{showOfferModal && agent && ...}` guard breaks Make-an-Offer on every WALLiam property page (condo + home). PENDING — must verify on disk before downstream phase implementation: `can()` permission code (W2.5 Group A prereq); Users page credit UI shape (W4c Group C extraction source); email template renderers across 5 API routes + `lib/actions/leads.ts buildLeadEmail` (W3c Group B rendering target); cumulative-view data model for union by user_id (W4a Group C aggregation design). Founder direction 2026-05-13: bug-trace approach abandoned — `testingleads@gmail.com` buyer plan delivery + registration source fold into universal source URL wiring across all CTAs; "History missing contact" question retracted. Working group-by-group from now on (A Foundation → B Strip+Wire → C Workbench → D Role-Aware → E Enhancements → F Test+Close). Next: 4 probe pastes complete remaining Group A / W1 sub-targets, tracker flips to W1 VERIFIED, then W2 schema (status enum +3 values, `lead_admin_actions`, `tenant_manager_assignments`).
- **2026-05-12 W-open** — Workstream opened. v1 tracker created. 16-phase plan locked. Sized 10-15 hours. Master tracker Section 4 row inserted as OPEN; v18 status log entry appended. Commit: master `b1a327b` (Lclose) → W-open paste 114.

- **2026-05-12 W-v2** — Scope expansion. Founder review surfaced 4 substantial gaps: (1) Lead source completeness across the platform + 2 confirmed bugs (`testingleads@gmail.com` buyer plan delivery, registration source missing) + Home property Book a Visit CTA parity gap; (2) Source URL must propagate from every CTA to every email recipient (new `leads.source_url TEXT` column + email template rendering); (3) Cumulative view architecture — leads list collapses by user_id, workbench page anchored on user_id aggregating all leads from that user; (4) Full 7-role hierarchy with 2 new roles (`platform_assistant`, `tenant_manager`) — multi-tenant role membership via new `tenant_manager_assignments` table. Phase table expanded from 16 to 22 phases across 6 groups (A Foundation, B Strip+Wire, C Workbench, D Role-Aware, E Enhancements, F Test+Close). Sized now: ~25-30 hours focused work. Founder mandate: "I want this done once and for all comprehensively — efficient + comprehensive — done once." Multi-tenant safety contract restated: every query through `scopeLeadsQuery`, every action through `can()`, no exceptions. Testing approach: code-based smoke matrix in `scripts/smoke-w-leads-workbench.ts` validating every CTA × every role × cumulative-view variants. `testingleads@gmail.com` bug resolves as part of the architecture (Source URL + delivery pipeline correctness), not a separate hotfix. Next: W1 deep recon — read every CTA file, every lead-capture API, every email template, locate Users credit UI, SQL probe enum/state, trace 2 bugs, audit existing scope/permission code.