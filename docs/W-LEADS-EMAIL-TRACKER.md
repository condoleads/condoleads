# W-LEADS-EMAIL — TRACKER

**Version:** v2 — T0 RECON COMPLETE + T1 DECISION LOCKED
**Status:** T2 build phase — IN PROGRESS. T2g + T2h shipped 2026-05-10 (T2g commits `d0c6ca3` + `f1bcf66`). Remaining: T2a–T2f schema migrations. Next action: T2a `leads` geo columns migration.
**Date:** 2026-05-10
**Owner:** Shah (sole dev)
**Sister tracker:** `docs/W-LAUNCH-TRACKER.md` (row pending update at Tlast close)

---

## Why this exists

Prior workstreams (W-HIERARCHY, W-ROLES-DELEGATION, W-TERRITORY) shipped the routing layer: hierarchy chain capture, delegation BCC overlay, territory assignment audit. This workstream covers everything downstream of routing that a launch needs:

- Credit accounting that's coherent across AI chat, Buyer Plan, Seller Plan, Estimator
- Public-form lead capture that carries typed origin metadata (not free-text)
- Recipient contract extension to the 6-layer chain + per-tenant overlay
- Plan delivery integration (Charlie plan-email creator + F57 enricher)
- Multitenant cross-tenant leak fixes in `resolve_agent_for_context` RPC
- New System 2 audit table for email recipient fan-out (`lead_email_log` is System 1 only)
- End-to-end smoke matrix proving the system holds at multi-tenant scale

Make-or-break for launch. T2 schema migrations are the longest pole.

---

## Scope contract — LOCKED at T1 (2026-05-10)

**In scope:**
1. Credit-write/read coherence across `tenants` config, `user_credit_overrides`, atomic counter RPCs
2. Lead INSERT/UPSERT writers (9 surfaces total — 7 API routes + `submitLeadFromForm` server action + `getOrCreateLead` shared helper)
3. Public form coverage across 6 page types (Area, Municipality, Community, Neighbourhood, Building, Property)
4. Email recipient resolution + send: 6-layer chain (agent / manager / area_manager / tenant_admin / platform_manager / platform_admin) + per-tenant overlay (`tenants.manager_cc`, `tenants.admin_bcc`)
5. Plan-delivery integration (Buyer Plan, Seller Plan) with credit accounting
6. Cross-tenant leak fixes in `resolve_agent_for_context` (P1, P2, P8 tiers)
7. New `lead_email_recipients_log` audit table for System 2 chain notifications
8. End-to-end smoke matrix per OD-6 = (c)

**Out of scope (logged for cohesion, deferred to other workstreams):**
- System 1 lead routes (`/admin`, `condoleads.ca` subdomain path) — System 1 isolation absolute
- Anonymous lead capture without registered user OR explicit anonymous-form path
- Lead → external CRM export (Salesforce / Pipedrive / HubSpot)
- SMS notifications
- Lead lifecycle UI in `/admin-homes` (already shipped via `AdminHomesLeadsClient`)
- Admin UI for `user_credit_overrides` (F-NO-ADMIN-CREDIT-UI — separate workstream)
- 01leads.com platform contact route (`/api/01leads-contact`) — intentional non-tenant
- Tenant homepage routing generalization (F-ROOT-PAGE-WALLIAM-HARDCODED-ROUTE — new W-TENANT-HOMEPAGE workstream)
- Development page WALLiam variant (F-DEVELOPMENT-PAGE-RENDERS-SYSTEM-1-AGENTCARD)
- Tenant lifecycle field consolidation (F-TENANTS-DUAL-LIFECYCLE-FIELDS)

---

## Open decisions — ALL LOCKED at T1 (2026-05-10)

| OD | Question | Anchor | Evidence |
|---|---|---|---|
| **OD-1** | Credit gating policy | **(c)** Credits unrelated to leads | T0-A: 4 lead-write routes have zero credit references; 9 credit-touching routes have zero lead INSERTs. Lead INSERT never blocks on credits; credits only gate Charlie chat, plan generation, estimator. |
| **OD-2** | Origin metadata shape | **(b)** Multiple typed columns | T0-F: `leads` schema confirmed missing `area_id`, `municipality_id`, `community_id`, `neighbourhood_id` columns. Callers pass these to resolver and discard. T2a adds them with FKs + indexes. |
| **OD-3** | Recipient layer count | **(c)** 6 layers + delegation overlay + per-tenant overlay | T0-D + T0-F: `lib/admin-homes/lead-email-recipients.ts` ships W-HIERARCHY H3.3 + W-ROLES-DELEGATION R7. T0-F additionally surfaced `tenants.manager_cc` + `tenants.admin_bcc` columns — T3a verifies helper consults them. |
| **OD-4** | Plan integration direction | **(c)** Both directions, already shipped | charlie/plan-email creates lead at plan-ready; charlie/lead F57 enriches via UPSERT. T6 verifies + tightens. |
| **OD-5** | Form variant per page type | **(a)** One canonical writer pipeline, multiple component shells | T0-C-3: every form shell (WalliamContactForm, ContactSection, ContactModal, AgentContactForm, OfferInquiryModal, UnitHistoryModal, EstimatorResults, HomeEstimatorResults, ListYourUnit, AppointmentForm, EstimatorVipWrapper, RegisterModal-via-joinTenant) ultimately routes to `submitLeadFromForm` or one of 7 API routes. Both writer surfaces verified multitenant-clean. |
| **OD-6** | Smoke test tier | **(c)** End-to-end | Locked 2026-05-10. Production-shape SQL state, real BCC fan-out via Resend dry-run, every credit/plan/form/page combo. Single-transaction-with-ROLLBACK per test (W-TERRITORY v13 savepoint-isolation pattern). |
| **OD-7** | Tenant-admin email override | **(b)** Tenant override allowed when verified domain configured | T0-D + T0-F: `tenants.send_from`, `resend_api_key`, `email_from_domain`, `resend_verified_at`, `resend_verification_status` (CHECK pending/verified/failed/revoked) all shipped. `sendTenantEmail` reads them per-tenant. |

---

## Phases

### T0 — Recon (CLOSED 2026-05-10)

All 7 sub-targets closed:

| Sub-target | Status | Output |
|---|---|---|
| T0-A | CLOSED | Credit surface — 9 routes inventoried, OD-1 anchored |
| T0-B | CLOSED (Phase 2 + T0-E corrections) | Lead routes — 7 API canonical writers |
| T0-C | CLOSED (T0-C-2 + T0-C-3 follow-ups) | Form coverage — render matrix locked, OD-5 anchored, `submitLeadFromForm`/`getOrCreateLead` confirmed multitenant-clean |
| T0-D | CLOSED | Email path inventory — 20 distinct send sites |
| T0-E | CLOSED | Plan/estimator delivery — 5 file dumps, lead-writer count corrected 5→7 |
| T0-F | CLOSED | `leads` schema — full column/constraint/FK/index/trigger inventory + RPC body |
| T0-G | CLOSED | Tenant→platform routing — schema mapping captured |

Recon outputs on disk under `recon/`:
- `W-LEADS-EMAIL-T0-A-credit-surface.txt` + `T0-A-REPROBE-*.txt`
- `W-LEADS-EMAIL-T0-B-2-canonical-pattern.txt`
- `W-LEADS-EMAIL-T0-C-form-coverage.txt`
- `W-LEADS-EMAIL-T0-C-2-form-render-callsites.txt`
- `W-LEADS-EMAIL-T0-C-3-action-writer-dumps.txt`
- `W-LEADS-EMAIL-T0-D-FILE-*.txt` (5 per-file dumps)
- `W-LEADS-EMAIL-T0-DG-*.txt`
- `W-LEADS-EMAIL-T0-F-leads-schema.txt`

### T1 — Decision lock (CLOSED 2026-05-10)

All 7 ODs anchored. Scope contract LOCKED. Phase plan T2..T8 + Tlast defined below.

### T2 — Schema migrations (IN PROGRESS — T2g + T2h CLOSED 2026-05-10; T2a–T2f pending)

Single transaction per migration file. Backup snapshots captured by `scripts/apply-*.js` runners before apply. Each phase ships independently with smoke verification before moving to the next.

**T2a — `leads` typed origin columns**
- ADD COLUMN `area_id uuid NULL FK treb_areas(id)` (T2a-pre verified table name; convention matches `agent_property_access.area_id`)
- ADD COLUMN `municipality_id uuid NULL FK municipalities(id)`
- ADD COLUMN `community_id uuid NULL FK communities(id)`
- ADD COLUMN `neighbourhood_id uuid NULL FK neighbourhoods(id)`
- CREATE INDEX on each new column
- Backfill: existing rows get NULL on new columns
- File: `supabase/migrations/<stamp>_t2a_leads_geo_columns.sql`

**T2b — `leads` performance indexes**
- CREATE INDEX `idx_leads_tenant_email ON leads (tenant_id, contact_email)` — fixes F-LEADS-NO-INDEX-ON-DUP-DETECTION-KEY
- CREATE INDEX `idx_leads_listing_id ON leads (listing_id) WHERE listing_id IS NOT NULL`
- CREATE INDEX `idx_leads_source ON leads (source)`
- File: `supabase/migrations/<stamp>_t2b_leads_indexes.sql`

**T2c — `leads.lead_origin_route` for questionnaire LIKE filter fix**
- ADD COLUMN `lead_origin_route text NOT NULL DEFAULT 'unknown'`
- CREATE INDEX on `(tenant_id, lead_origin_route)`
- Backfill existing rows: derive from `source` text via lookup table
- File: `supabase/migrations/<stamp>_t2c_lead_origin_route.sql`

**T2d — `leads` data-quality CHECK constraints**
- ADD CHECK `appointment_status IN ('pending', 'confirmed', 'cancelled', 'completed', 'rescheduled')`
- ADD CHECK `assignment_source IN ('geo', 'admin', 'manual', 'override')`
- File: `supabase/migrations/<stamp>_t2d_leads_check_constraints.sql`

**T2e — `vip_requests` tenant scoping fix**
- Backfill `tenant_id` on existing rows: `UPDATE vip_requests SET tenant_id = leads.tenant_id FROM leads WHERE vip_requests.lead_id = leads.id`. For rows with NULL `lead_id`, derive from `agent.tenant_id` via FK chain. Any unbackfillable rows are deleted (after audit).
- ALTER COLUMN `tenant_id SET NOT NULL`
- ADD FK `vip_requests_tenant_id_fkey REFERENCES tenants(id)`
- CREATE INDEX `idx_vip_requests_tenant ON vip_requests (tenant_id)`
- ADD CHECK on `status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')`
- ADD CHECK on `request_type IN ('plan', 'chat', 'estimator')`
- ADD CHECK on `request_source IN ('chat', 'estimator', 'questionnaire')`
- File: `supabase/migrations/<stamp>_t2e_vip_requests_tenant_scope.sql`

**T2f — `lead_email_recipients_log` new audit table**
```sql
CREATE TABLE lead_email_recipients_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agent_id uuid NULL REFERENCES agents(id),
  recipient_email text NOT NULL,
  recipient_layer text NOT NULL CHECK (recipient_layer IN
    ('agent','manager','area_manager','tenant_admin','platform_manager','platform_admin','tenant_overlay_cc','tenant_overlay_bcc')),
  direction text NOT NULL CHECK (direction IN ('to','cc','bcc')),
  subject text NOT NULL,
  template_key text NOT NULL,
  resend_message_id text NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN
    ('queued','sent','delivered','bounced','failed','complained')),
  sent_at timestamptz NULL,
  delivered_at timestamptz NULL,
  bounced_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lerl_tenant_sent ON lead_email_recipients_log (tenant_id, sent_at DESC);
CREATE INDEX idx_lerl_lead ON lead_email_recipients_log (lead_id);
CREATE INDEX idx_lerl_recipient ON lead_email_recipients_log (recipient_email);
CREATE INDEX idx_lerl_resend_msg ON lead_email_recipients_log (resend_message_id) WHERE resend_message_id IS NOT NULL;
-- Append-only triggers (W-TERRITORY pattern)
CREATE TRIGGER trg_lerl_no_delete BEFORE DELETE ON lead_email_recipients_log
  FOR EACH ROW EXECUTE FUNCTION lead_email_recipients_log_no_mutate();
-- Status updates allowed via webhook (carve-out trigger): only `status`, `delivered_at`, `bounced_at` mutable.
CREATE TRIGGER trg_lerl_status_only_update BEFORE UPDATE ON lead_email_recipients_log
  FOR EACH ROW EXECUTE FUNCTION lead_email_recipients_log_status_only();
```
- File: `supabase/migrations/<stamp>_t2f_lead_email_recipients_log.sql`

**T2g — `resolve_agent_for_context` RPC tenant-leak fix — ✅ CLOSED 2026-05-10 (commits `d0c6ca3` + `f1bcf66`)**
- Probe: `pg_get_functiondef('public.resolve_agent_for_context'::regproc)` captured at T0-F
- Patch P1: JOIN `agents` and filter by `p_tenant_id` (with NULL-tolerant guard)
- Patch P2: same shape via `agent_geo_buildings → agents`
- Patch P8: same shape via `user_profiles → agents` (or skip P8 entirely if `user_profiles.assigned_agent_id` doesn't carry tenant scope)
- Smoke: cross-tenant leak tests via savepoint isolation
- File: `supabase/migrations/<stamp>_t2g_resolve_agent_tenant_filter.sql`

**T2h — Cleanup: delete `app/actions/createLead.ts` — ✅ CLOSED 2026-05-10**
- Per F-CREATELEAD-IS-DEAD-CODE: zero callers, doc comment pre-stages deletion
- Backup before delete: `Copy-Item .backup_<stamp>` per Rule Zero
- Smoke: build passes, no import errors
- Not a SQL migration — file delete only

**T2 close criteria:** all migrations applied to production, all rollback snapshots saved, smoke 9/9 PASS via the test harness. No regressions in W-HIERARCHY or W-TERRITORY existing smoke suites.

### T3 — Recipient helper extension (NOT STARTED)

**T3a — Verify `tenants.manager_cc` / `tenants.admin_bcc` consultation**
- Probe: dump `lib/admin-homes/lead-email-recipients.ts` current body
- Verify it reads `tenants.manager_cc` and `tenants.admin_bcc` and adds them to CC/BCC respectively
- Patch if not — extend Layer 5/6 with `tenant_overlay_cc`/`tenant_overlay_bcc` semantics

**T3b — Wire `lead_email_recipients_log` writer into `sendTenantEmail`**
- Every TO/CC/BCC entry of every send call writes one row
- Capture: `tenant_id`, `lead_id` (from caller context), `recipient_email`, `recipient_layer`, `direction`, `subject`, `template_key`, `resend_message_id` (from Resend response)
- Status starts `'queued'`, transitions via webhook

**T3c — Resend webhook handler updates `lead_email_recipients_log.status`**
- File: `app/api/resend/webhook/route.ts` (NEW)
- Events: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed`
- Match by `resend_message_id`; update `status`, `delivered_at`, `bounced_at`
- Append-only constraint allows status carve-out via the `lead_email_recipients_log_status_only` trigger

### T4 — Credit gating (REDUCED scope per OD-1 = c)

OD-1 = (c) means lead INSERT does not gate on credits. T4 collapses to verification:

**T4a — Audit lead-write surfaces for accidental credit gating**
- 7 API routes + `submitLeadFromForm` + `getOrCreateLead`
- Confirm none of them returns 402 / blocks on credit balance
- T0-A already inventoried this; T4a is a final pre-build audit

(No code changes required if audit passes. If it fails, scope expands; current evidence says it passes.)

### T5 — Form coverage audit + UI updates (FIRST UI TOUCH — ping Shah)

**T5a — `WalliamContactForm` props extension**
- Add: `area_id?`, `municipality_id?`, `community_id?`, `neighbourhood_id?`, `listing_id?` (typed origin)
- Backward-compatible: existing render sites still work; new props optional

**T5b — Render-site updates per page-render matrix**
| Page | File | Change |
|---|---|---|
| Area | `app/[slug]/AreaPage.tsx` | Pass `area_id` to `WalliamAgentCard` (already passes `area_id` via existing prop chain — verify) |
| Municipality | `app/[slug]/MunicipalityPage.tsx` | Pass `municipality_id` |
| Community | `app/[slug]/CommunityPage.tsx` | Pass `community_id` |
| Building | `app/[slug]/BuildingPage.tsx` | Pass `building_id` to both `WalliamAgentCard` AND `WalliamContactForm` |
| Property variant 1 | `app/[slug]/PropertyPageContent.tsx` | Pass `listing_id` + `building_id` |
| Property variant 2 | `app/property/[id]/PropertyPageClient.tsx` | Pass `listing_id` + `building_id` |
| Property variant 3 | `app/property/[id]/HomePropertyPageClient.tsx` | Same shape |
| Neighbourhood (Toronto) | `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` | Pass `neighbourhood_id` |
| Contact page | `app/comprehensive-site/contact/page.tsx` | No origin IDs (page-level inquiry) |

**T5c — `submitLeadFromForm` signature extension**
- Already accepts `areaId`/`municipalityId`/`communityId`/`listingId`/`buildingId` per the current dump
- Add: `neighbourhoodId`
- Forward all to `getOrCreateLead`

**T5d — `getOrCreateLead` writes typed origin to new columns**
- Map params → INSERT columns: `area_id`, `municipality_id`, `community_id`, `neighbourhood_id`
- Set `lead_origin_route` based on caller (e.g., `'walliam_contact_building'`, `'walliam_estimator_questionnaire_listing'`)

**T5e — 7 API route writers update**
- Each route already passes geo IDs to `resolve_agent_for_context`
- Each route's INSERT payload now writes geo IDs to typed columns instead of discarding them
- Routes 1-7 in lead writer inventory below

**T5f — `WalliamCTA` double-render audit**
- Property pages (variants 2 + 3) render `<WalliamCTA>` TWICE (sidebar + bottom)
- Verify intentional (likely yes — different placements, different `context` strings)
- If double analytics-fire is happening on mount, dedupe at component level

**T5g — System 1 form components verification**
- `ContactSection`, `ContactModal`, `AgentContactForm`, `OfferInquiryModal`, `UnitHistoryModal`, `EstimatorResults`, `HomeEstimatorResults`, `ListYourUnit` all already call `submitLeadFromForm` (verified T0-C-3)
- T5 only needs to ensure they pass through the new origin ID props correctly

**T5h — Neighbourhood-page route generalization (out of W-LEADS-EMAIL scope, log-only)**
- F-NEIGHBOURHOOD-PAGE-TORONTO-HARDCODED-ROUTE
- Tracked in `docs/W-LAUNCH-TRACKER.md` for separate workstream

### T6 — Plan integration + multitenant defect fixes

**T6a — F-W-RECOVERY-A15 across 5 routes**
- Extract `validateSession(supabase, sessionId, userId, tenantId)` helper
- Helper reads `tenants.source_key` once, compares against `chat_sessions.source` substring
- Routes:
  1. `app/api/charlie/lead/route.ts:84`
  2. `app/api/charlie/plan-email/route.ts:64`
  3. `app/api/charlie/appointment/route.ts:88`
  4. `app/api/walliam/estimator/session/route.ts:100`
  5. `app/api/walliam/estimator/vip-request/route.ts:75`
- All 5 backed up before patch; smoke validates each

**T6b — F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER**
- Replace `LIKE 'walliam_estimator%'` with `lead_origin_route = $1` lookup using T2c column
- File: `app/api/walliam/estimator/vip-questionnaire/route.ts:~146`

**T6c — Source-string hardcoding in 5 routes**
- Routes 1, 2, 3, 5, 6 hardcode `source` strings (e.g., `'walliam_charlie'`, `'walliam_contact'`)
- Refactor: derive `source = `${tenants.source_key}_<route_label>`` at route entry
- One pass per route, with smoke verification before commit

**T6d — VIP auto-approve fixes**
- F-VIP-AUTO-APPROVE-ONLY-WRITES-BUYER-PLAN-LIMIT: seller VIP auto-approval grants seller credits, not buyer
- F-VIP-AUTO-APPROVE-USES-CHAT-LIMIT-FOR-PLAN-REQUESTS: limit selection respects request type
- File: `app/api/walliam/charlie/vip-request/route.ts`

**T6e — Plan integration verification**
- charlie/plan-email creator path: confirmed shipped, T6e verifies write path
- charlie/lead F57 enricher path: confirmed shipped, T6e verifies enrich-not-overwrite semantics

### T7 — Smoke matrix harness (per OD-6 = c)

**Architecture:** Node + pg single-transaction harness with SAVEPOINT/ROLLBACK per test (W-TERRITORY v13 pattern). Statement-timeout disabled via `DISABLE_STATEMENT_TIMEOUT=1` env var.

**T7a — Test infrastructure**
- File: `scripts/run-w-leads-email-smoke.js`
- Pattern: single transaction; per-test `SAVEPOINT test_N` / `ROLLBACK TO SAVEPOINT test_N`; final transaction-level `ROLLBACK`
- Test fixture seeded at transaction start: 2 tenants × 4 agent tiers × 6 page-type contexts × test users

**T7b — Test matrix dimensions**
- Tenants: WALLiam (existing) + tenant #2 (test fixture)
- Agent tiers: agent / manager / area_manager / tenant_admin
- Page types: area / municipality / community / neighbourhood / building / property
- Lead writers: 9 surfaces (7 API + 2 server-action paths)
- Form variants per page: as per page-render matrix
- Origin metadata: typed columns populated correctly
- Recipient layers: 6 chain + 2 overlay (manager_cc, admin_bcc) = 8 destinations

**T7c — Recipient assertion harness**
- Every TO/CC/BCC entry from `getLeadEmailRecipients` is asserted against expected set
- Per-tenant: assert `tenants.manager_cc` lands in CC; `tenants.admin_bcc` lands in BCC
- Cross-tenant: tenant A request never hits tenant B's recipient list (regression guard for T2g RPC fix)

**T7d — Resend dry-run integration**
- `sendTenantEmail` flag: `DRY_RUN=1` (env-gated) constructs the message but doesn't fire
- Assert: subject, html body, from address, recipient list match expected
- Real Resend API not hit during smoke

**T7e — Audit trail assertion**
- Every send produces correct row count in `lead_email_recipients_log`
- Per-recipient: row content matches (`recipient_layer`, `direction`, `template_key`)
- Status starts `'queued'`; webhook simulation transitions correctly

**T7f — Cross-tenant leak tests (regression guard for T2g)**
- Tenant A request with listing pinned to tenant A agent → resolves to tenant A agent ✓
- Tenant B request with same listing → resolves to NULL (tenant restriction) or tenant B fallback agent
- Same shape for buildings, user-profile-assigned agents
- Test count: ~30 cross-tenant scenarios

**T7g — Backward-compat tests**
- Existing `getOrCreateLead` callers without typed origin still work (Option A dup branch silent, etc.)
- Existing W-HIERARCHY chain notification still fans out correctly
- W-RECOVERY auth gates still hold

**Estimated test count:** ~150-200 distinct savepoint-isolated cases. Single transaction run; total runtime expected <60 seconds.

### T8 — Comprehensive smoke run + regression sweep

**T8a — Run T7 matrix on production-shape data**
- Single full run, all assertions PASS
- Output captured to `recon/W-LEADS-EMAIL-T8-smoke-output.txt`

**T8b — Cross-workstream regression**
- W-RECOVERY: 6 routes still gated, no Anthropic ungated calls
- W-HIERARCHY: chain notification still ships, audit on the existing path
- W-ROLES-DELEGATION: R7 delegation BCC overlay still applies
- W-TERRITORY: T6 smoke 6/6 PASS, T6-followup-A race harness clean

**T8c — Manual local smoke**
- `DEV_TENANT_DOMAIN=walliam.ca npm run dev`
- Each page type: render → submit lead form → verify email landed (Resend dashboard)
- Verify `lead_email_recipients_log` rows on Supabase Studio

### Tlast — Close

- All T2..T8 phases shipped
- Smoke matrix 100% PASS
- `docs/W-LAUNCH-TRACKER.md` Section 4 row updated: W-LEADS-EMAIL CLOSED
- This tracker → v3 FINAL CLOSED status
- Memory edit: prior "W-LEADS/EMAIL — Confirmed already shipped with delegation BCC" entry replaced with the comprehensive workstream completion record

---

## Findings catalog (125 total)

Organized by category. F-* IDs are stable; severity rated for T2 prioritization.

### Multitenant Rule Zero defects (T2/T6 fix scope — HIGH priority)

- **F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE** (5 routes) — auth gate compares against literal `'walliam'` in 5 routes. Refactor target: `validateSession(supabase, sessionId, userId, tenantId)` helper using `tenants.source_key`. Locked at T6a.
- **F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER** — `LIKE 'walliam_estimator%'` in vip-questionnaire route. Fix at T6b via `lead_origin_route` lookup (depends on T2c).
- **F-CHARLIE-APPOINTMENT-HARDCODED-SOURCE-STRING** — `source: 'walliam_charlie'` hardcoded. T6c.
- **F-ESTIMATOR-VIP-REQUEST-MULTITENANT-DEBT** — 6 hardcoded `'walliam'` references. T6c.
- **F-ESTIMATOR-VIP-APPROVE-MULTITENANT-DEBT** — same. T6c.
- **F-ESTIMATOR-SESSION-HARDCODED-WALLIAM-AGENT-NAME-FALLBACK** — `let agentName = 'WALLiam'`. Display-only smell. T6c.
- **F-ESTIMATOR-SESSION-MISSING-TENANT-ID-IN-RESOLVER-CALL** — `resolve_agent_for_context` called without `p_tenant_id`. T6c (caller fix; combines with T2g).
- **F-IS-WALLIAM-NAMING-MISLEADS-CALLERS** — function bodies tenant-generic; names imply WALLiam. Rename-only. Low. T6c.
- **F-ROOT-PAGE-WALLIAM-HARDCODED-ROUTE (MAJOR)** — `app/page.tsx` hardcoded WALLiam tenant gate. **OUT OF SCOPE** — logged to `docs/W-LAUNCH-TRACKER.md` as new W-TENANT-HOMEPAGE workstream.

### Cross-tenant leak in `resolve_agent_for_context` RPC (T2g — CRITICAL)

- **F-RESOLVE-AGENT-P1-P2-MISSING-TENANT-FILTER (MAJOR) ✅ CLOSED 2026-05-10 (commits `d0c6ca3` + `f1bcf66`)** — P1 (`agent_listing_assignments`) and P2 (`agent_geo_buildings`) lookups now filter by `a.tenant_id = p_tenant_id`. Cross-tenant data leak vector eliminated. Verified via DB-truth probe: 7 occurrences of `tenant_id = p_tenant_id` in live function body (vs 1 pre-T2g baseline = P10 only).
- **F-RESOLVE-AGENT-P8-USER-PROFILES-CROSS-TENANT-LEAK (MAJOR) ✅ CLOSED 2026-05-10 (commits `d0c6ca3` + `f1bcf66`)** — P8 now joins via `tenant_users` with explicit `(user_id, tenant_id)` scoping. Cross-tenant agent assignment leak via stale `user_profiles.assigned_agent_id` eliminated.

### Schema migration scope (T2)

- **F-ORIGIN-GEO-IDS-NOT-PERSISTED** — area_id/muni_id/community_id/neighbourhood_id passed to resolver, discarded. T2a adds typed columns.
- **F-VIP-REQUEST-LEAD-LOSES-GEO-CONTEXT** — charlie/vip-request INSERT lacks all geo IDs. T2a + T5e fix.
- **F-ESTIMATOR-VIP-PARTIAL-GEO-CAPTURE** — captures `building_id` only. T2a + T5e fix.
- **F-APPOINTMENT-LEAD-PARTIAL-GEO-CAPTURE** — community/muni/area passed to resolver, only `geo_name` lands. T2a + T5e fix.
- **F-LEADS-NO-INDEX-ON-DUP-DETECTION-KEY** — no `(tenant_id, contact_email)` composite index. Sequential scan. T2b.
- **F-LEADS-NO-INDEX-ON-LISTING-ID** — `idx_leads_building_id` exists; no listing-id sibling. T2b.
- **F-LEADS-NO-INDEX-ON-SOURCE** — analytics scan. T2b.
- **F-LEADS-APPOINTMENT-TIME-IS-TEXT** — typed as `text`, not `time`. Defer to T2-followup or post-launch (data-quality, not blocking).
- **F-LEADS-APPOINTMENT-STATUS-NO-CHECK** — no enum constraint. T2d.
- **F-LEADS-ASSIGNMENT-SOURCE-NO-CHECK** — no enum constraint. T2d.
- **F-VIP-REQUESTS-TENANT-ID-NULLABLE (MAJOR)** — `tenant_id NULL`. T2e.
- **F-VIP-REQUESTS-NO-FK-ON-TENANT-ID** — no referential integrity. T2e.
- **F-VIP-REQUESTS-NO-CHECK-CONSTRAINTS** — status/request_type/request_source unbounded. T2e.
- **F-VIP-REQUESTS-NO-TENANT-INDEX** — every per-tenant query scans. T2e.
- **F-LEAD-EMAIL-LOG-IS-SYSTEM-1-ONLY (CONFIRMED)** — System 2 chain BCC fan-out invisible. T2f introduces `lead_email_recipients_log`.
- **F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN (CONFIRMED)** — no recipient enumeration in current log. T2f.

### Bug fixes (T6)

- **F-VIP-AUTO-APPROVE-ONLY-WRITES-BUYER-PLAN-LIMIT** — seller VIP auto-approval grants buyer credits. T6d.
- **F-VIP-AUTO-APPROVE-USES-CHAT-LIMIT-FOR-PLAN-REQUESTS** — wrong limit selected. T6d.
- **F-LEADS-QUALITY-INCONSISTENT** — `quality` field set inconsistently across routes (some `'cold'`, some `'hot'`). T6 cleanup.
- **F-LEADS-REFERER-SOURCE-FALLBACK-FRAGILE** — `lib/actions/leads.ts:139-148` referer-based source detection. Low. Document at T6.

### Audit / observability gaps (T2f / T3b / T3c)

- **F-LEAD-OWNERSHIP-CHANGES-NEVER-WRITTEN (CONFIRMED, MAJOR)** — append-only table shipped via W-TERRITORY T2a; zero callers. T3b adds writers from territory reroll/distribute paths.
- **F-LEAD-EMAIL-LOG-IS-SYSTEM-1-ONLY** — see schema scope above. T2f.
- **F-LOW-CREDITS-EMAIL-DOES-NOT-LOG** — only `tenant_users.low_credit_email_sent` JSONB flip records "did we attempt". T2f writes recipient log entry on send.

### Architectural observations (no fix scope, T1 awareness)

- **F-WELCOME-IS-MULTITENANT-EXEMPLAR (POSITIVE)** — `app/api/email/welcome/route.ts` is the cleanest tenant-aware route. Pattern model.
- **F-SUBMITLEADFROMFORM-IS-MULTITENANT-EXEMPLAR (POSITIVE)** — server-action wrapper with `x-tenant-id` resolution. Pattern model.
- **F-GETORCREATELEAD-IS-CANONICAL-LEAD-WRITER (POSITIVE)** — `lib/actions/leads.ts` is THE pattern for lead writes.
- **F-TENANTS-SOURCE-KEY-IS-NOT-NULL-AND-UNIQUE (POSITIVE)** — F-W-RECOVERY-A15 fix target well-defined.
- **F-TENANTS-MANAGER-CC-AND-ADMIN-BCC-EXIST (POSITIVE)** — per-tenant overlay columns shipped. T3a verifies helper consults them.
- **F-WELCOME-DOES-NOT-USE-RECIPIENT-HELPER** — `email/welcome` bypasses `getLeadEmailRecipients`; recipient resolution route-built. Documented; no fix needed (welcome ≠ lead).
- **F-WELCOME-MANAGER-CC-USES-PARENT-NOT-WALKER** — same pattern; manager CC via `agent.parent_id`, not walker. Documented.
- **F-WELCOME-NO-AGENT-NO-ADMIN-SILENT-SKIP** — registration with all-null agent/admin paths sends only user-facing welcome. Documented.
- **F-LEADS-DUAL-AXIS-STATUS-MODEL** — 4 status-like columns (status / status_axis / stage / urgency). T7b smoke matrix design awareness.
- **F-LEADS-MUTABLE-NO-APPEND-ONLY** — DB allows DELETE/UPDATE on `leads`. Tracker rule says append-only; not enforced.
- **F-TENANTS-DUAL-LIFECYCLE-FIELDS** — `is_active boolean` AND `lifecycle_status text` co-exist. Out of scope.
- **F-USER-CREDIT-OVERRIDES-FK-IS-USER-PROFILES** — vs `tenant_users.user_id → auth.users`. Inconsistency. Documented.
- **F-TENANT-USERS-MARKETING-CONSENT-EXISTS-BUT-UNUSED (CASL CONCERN)** — schema has consent fields; no code consults them before email send. **T3a/T3b verify consent gate.** Canadian Anti-Spam Law exposure.
- **F-CONTACT-COMPONENTS-USE-SYSTEM-1-SERVER-ACTION** — DOWNGRADED to "not a defect" (server action is multitenant-clean).
- **F-HOMEPAGE-RENDERS-SYSTEM-1-CONTACTSECTION** — DOWNGRADED (HomePage not reached on WALLiam).
- **F-DEVELOPMENT-PAGE-RENDERS-SYSTEM-1-AGENTCARD** — out of scope, logged for separate workstream.
- **F-NEIGHBOURHOOD-PAGE-TORONTO-HARDCODED-ROUTE** — out of scope, logged for separate workstream.
- **F-PROPERTY-PAGES-TRIPLE-CLIENT** — 3 property page variants (PropertyPageClient + HomePropertyPageClient + PropertyPageContent). T5b handles each.
- **F-WALLIAMCTA-DOUBLE-RENDER-ON-PROPERTY-PAGES** — T5f audits intentionality.
- **F-OPTION-A-DUP-IS-SILENT** — locked behavior per W-HIERARCHY 2026-05-03. Not a defect.

### Cleanup / dead code (T2h)

- **F-CREATELEAD-IS-DEAD-CODE ✅ CLOSED 2026-05-10** — `app/actions/createLead.ts` deleted. Zero callers re-verified in-session before delete (only `createLead`-named function in repo is the local one in `lib/actions/leads.ts` L128, which exports a different symbol).
- **F-CREATELEAD-HARDCODED-CONDOLEADS-CA-URL** — dead-code defect. Disappears with delete.
- **F-CREATELEAD-HARDCODED-SLUG-BLACKLIST** — dead-code defect. Disappears with delete.

### Probe defects (lessons learned, no fix scope)

- **F-T0A-PROBE-DEFECT-SIMPLEMATCH-PIPE** — `Select-String -SimpleMatch` with `|` returns false negatives.
- **F-PROBE-INCLUDED-STALE-BACKUPS** — initial regex `\.backup_\d+` insufficient; corrected to `\.backup|\.backup\d*_|\.backup-|\.debug_|\.predebugremoval_`.
- **F-PASTE-OVERFLOW-AT-93KB** — paste corruption at 93 KB; per-file dump sentinels are the recovery pattern.
- **F-T0B-PHASE1-INVENTORY-INCOMPLETE** — initial inventory missed 3 routes; T0-D/T0-E corrected to 7.
- **F-T0C-PROBE-DEFECT-BACKUP-FILTER-INCOMPLETE** — see above.
- **F-T0C-PROBE-DEFECT-PAGE-PATHS-WRONG** — paths `app\(walliam)` and `app\area` don't exist; should have used `app\property\[id]` and `app\comprehensive-site`.
- **F-T0C-PROBE-DEFECT-SELECT-OBJECT-30-TRUNCATION** — fixed-row cap hid files; T0-C-2 removed cap.
- **F-PLACEHOLDER-VIOLATION-PATH-B-EXAMPLE** (Claude defect, 2026-05-10) — illustrative env-var example rendered in runnable code fence; user pasted, clobbered working value. Lesson: never put placeholder values inside `powershell` fences.

### Out of scope (logged for cohesion)

- **F-NO-ADMIN-CREDIT-UI** — `app/admin-homes/` no credit UI. Real launch blocker; separate workstream.
- **F-VIP-FLOW-COMPLEXITY** — multiple VIP route variants. Out.
- **F-CREDIT-CHAT-REFUND-ON-PLAN** — `message_count` decrements on `generate_plan` fire. Analytics relevance.
- **F-COMPREHENSIVE-SITE-DEFAULT-AGENT-LOOKUP-PATTERN** — tenant-domain fast-path. Out.

---

## Lead writer inventory — FINAL

| # | Writer | Layer | Multitenant status | T6 fix |
|---|---|---|---|---|
| 1 | `app/api/walliam/contact/route.ts` | API INSERT | Hardcoded source + auth gate | T6a + T6c |
| 2 | `app/api/charlie/lead/route.ts` | API F57 UPSERT | Hardcoded source + auth gate | T6a + T6c |
| 3 | `app/api/charlie/plan-email/route.ts` | API INSERT | Hardcoded source + auth gate | T6a + T6c |
| 4 | `app/api/walliam/charlie/vip-request/route.ts` | API INSERT | **Clean** ✓ (dynamic source) | none |
| 5 | `app/api/walliam/estimator/vip-request/route.ts` | API INSERT | Hardcoded source + auth gate | T6a + T6c |
| 6 | `app/api/charlie/appointment/route.ts` | API INSERT | Hardcoded source + auth gate | T6a + T6c |
| 7 | `app/api/walliam/estimator/vip-questionnaire/route.ts` | API F57-class UPSERT | Hardcoded LIKE filter | T6b |
| 8 | `app/actions/submitLeadFromForm.ts` | Server-action wrapper | **Clean** ✓ (exemplar) | none |
| 9 | `lib/actions/leads.ts::getOrCreateLead` | Underlying writer (canonical) | **Clean** ✓ (canonical) | none |
| – | `app/actions/joinTenant.ts:180` | Direct getOrCreateLead caller | **Clean** ✓ | none |
| – | `app/actions/createLead.ts::createLeadFromRegistration` | DELETED 2026-05-10 | n/a | T2h CLOSED |

**Form-component shells (UI layer, all routed to writers above):**
- `WalliamContactForm` (direct page form)
- `WalliamAgentCard` (agent-card embedded form)
- `ContactSection` (homepage form — System 1 subdomain only)
- `ContactModal` (sidebar/mobile modal — both System 1 and System 2 paths)
- `AgentContactForm` (System 1 property page form)
- `OfferInquiryModal` / `UnitHistoryModal` (property page modals)
- `EstimatorResults` / `HomeEstimatorResults` (value-result step)
- `ListYourUnit` (building/area pages — EVALUATION + VISIT submit paths)
- `AppointmentForm` (Charlie appointment booking)
- `EstimatorVipWrapper` family (estimator VIP flow)
- `RegisterModal` → `joinTenant` (registration flow)

---

## Page-render matrix — FINAL

| Page type | Page file | WalliamCTA | WalliamAgentCard | WalliamContactForm | T5b origin IDs to pass |
|---|---|---|---|---|---|
| Homepage (root `/`) — WALLiam | `components/HomePageComprehensive(V2).tsx` | NO | NO | NO (uses MobileContactBar→ContactModal) | none |
| Homepage (root `/`) — System 1 subdomain | `components/HomePage.tsx` | NO | NO | NO (uses ContactSection) | none (System 1) |
| Area | `app/[slug]/AreaPage.tsx` | ✓ L234 | ✓ L230 | NO | `area_id` |
| Municipality | `app/[slug]/MunicipalityPage.tsx` | ✓ L227 | ✓ L222 | NO | `municipality_id` |
| Community | `app/[slug]/CommunityPage.tsx` | ✓ L182 | ✓ L177 | NO | `community_id` |
| Building | `app/[slug]/BuildingPage.tsx` | ✓ L582 | ✓ L576 | ✓ L584 | `building_id` |
| Neighbourhood (Toronto only) | `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` | ✓ L256 | ✓ L257 | NO | `neighbourhood_id` |
| Property variant 1 (slug-routed) | `app/[slug]/PropertyPageContent.tsx` | NO | ✓ L175 | ✓ L199 | `listing_id`, `building_id` |
| Property variant 2 (id-routed, condo) | `app/property/[id]/PropertyPageClient.tsx` | ✓ L184 + L240 | ✓ L176 | NO | `listing_id`, `building_id` |
| Property variant 3 (id-routed, home) | `app/property/[id]/HomePropertyPageClient.tsx` | ✓ L177 + L219 | ✓ L170 | NO | `listing_id`, `building_id` |
| Contact page | `app/comprehensive-site/contact/page.tsx` | NO | NO | ✓ L64 (`source="contact_page"`) | none (page-level inquiry) |

---

## Schema reference (T0-F probe output, 2026-05-10)

**Column counts (current):** `leads` 42, `vip_requests` 22, `lead_email_log` 5, `lead_ownership_changes` 9, `tenant_users` 15, `user_credit_overrides` 12, `platform_admins` 10, `platform_manager_tenants` 4, `tenants` 64.

**Column counts (post-T2):** `leads` 47 (+area_id, municipality_id, community_id, neighbourhood_id, lead_origin_route), `vip_requests` 22 (no add, scope tighten), `lead_email_recipients_log` 14 NEW.

**Critical schema invariants to preserve in T2:**
- `leads.tenant_id NOT NULL` ✓
- `leads.agent_id NOT NULL` ✓
- `tenant_users` composite PK `(user_id, tenant_id)` ✓
- `tenants.source_key NOT NULL` + UNIQUE ✓ (T6a fix target)
- `lead_ownership_changes` append-only triggers ✓
- `leads_updated_at` BEFORE-UPDATE trigger ✓
- All FK cascade behaviors (tenants ON DELETE CASCADE for tenant-owned tables; ON DELETE SET NULL for agent ownership) ✓

**`resolve_agent_for_context` 10-tier waterfall (T2g target):**
1. Tenant restriction guard (`tenant_property_access`) ✓
2. P1: `agent_listing_assignments` ❌ MISSING tenant filter
3. P2: `agent_geo_buildings` ❌ MISSING tenant filter
4. P3-P6: `pick_routing_agent(scope, scope_id, tenant_id, listing_id)` ✓
5. P7: `tenant_users` ✓
6. P8: `user_profiles` ❌ MISSING tenant filter
7. P9: `tenants.default_agent_id` ✓
8. P10: any active agent in tenant ✓

---

## Workflow rules in effect

All Rule Zero invariants apply (multitenant at scale, no regressions, comprehensive only, nothing deferred, no guessing, backups before edits, no placeholders, secrets fingerprint, System 1 isolation, local smoke first).

Specific to W-LEADS-EMAIL:

- System 1 lead routes NEVER touched. All work is System 2.
- Email always uses per-tenant `tenants.send_from` / `resend_api_key` per OD-7 = (b). WALLiam baseline = `notifications@condoleads.ca`.
- Append-only audit on `lead_email_recipients_log` (DENY UPDATE/DELETE, with status-only carve-out for webhook).
- No DELETE on `leads` from any route. Soft-delete via `status` + `status_axis` only.
- Origin attribution required: every lead INSERT writes typed origin columns per OD-2 = (b).
- Smoke per OD-6 = (c): production-shape SQL state, savepoint isolation, real BCC fan-out via Resend dry-run, 150-200 distinct test cases.
- Probe-then-patch (W-TERRITORY v11): every prod trigger/function modification preceded by read-only probe; probe output is ground truth.
- Per-row-diff via diff helper (W-TERRITORY v14): future bulk-write paths use server-side diff vs DELETE-all + INSERT-all.
- Smoke-via-savepoint-isolation (W-TERRITORY v13).
- Local smoke first; never Vercel preview.
- `DATABASE_URL` sourced from `.env.local` via the matching probe pattern; never pasted in chat.
- Illustrative env-var values NEVER inside runnable `powershell` code fences (per F-PLACEHOLDER-VIOLATION-PATH-B-EXAMPLE).

---

## Next action

**T2a — `leads` typed origin columns migration.** First migration in the T2 chain. Steps:

1. Probe — capture current `leads` schema fingerprint:
   ```powershell
   $line = (Get-Content -LiteralPath ".env.local" | Select-String '^(DATABASE_URL|SUPABASE_DB_URL|POSTGRES_URL|DIRECT_URL)\s*=' | Select-Object -First 1).Line
   $val = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
   $env:DATABASE_URL = $val
   node scripts/recon-w-leads-email-t0-f-schema.js
   ```
   (Re-runs the T0-F probe; output diff vs current confirms no schema drift since recon.)

2. Verify referenced FK target tables exist with `id uuid PRIMARY KEY`. **CLOSED at T2a-pre probe (2026-05-10):** `treb_areas` (~73 rows), `municipalities` (~506), `communities` (~1948), `neighbourhoods` (~9). All four have `id uuid NOT NULL DEFAULT uuid_generate_v4()` PRIMARY KEY. Probe at `recon/W-LEADS-EMAIL-T2A-PRE-geo-tables.txt`; script at `scripts/recon-w-leads-email-t2a-geo-tables.js`.

3. Write migration: `supabase/migrations/20260510_t2a_leads_geo_columns.sql`. Migration body:
   ```sql
   BEGIN;
   ALTER TABLE leads ADD COLUMN area_id uuid NULL;
   ALTER TABLE leads ADD COLUMN municipality_id uuid NULL;
   ALTER TABLE leads ADD COLUMN community_id uuid NULL;
   ALTER TABLE leads ADD COLUMN neighbourhood_id uuid NULL;
   ALTER TABLE leads ADD CONSTRAINT leads_area_id_fkey FOREIGN KEY (area_id) REFERENCES treb_areas(id);
   ALTER TABLE leads ADD CONSTRAINT leads_municipality_id_fkey FOREIGN KEY (municipality_id) REFERENCES municipalities(id);
   ALTER TABLE leads ADD CONSTRAINT leads_community_id_fkey FOREIGN KEY (community_id) REFERENCES communities(id);
   ALTER TABLE leads ADD CONSTRAINT leads_neighbourhood_id_fkey FOREIGN KEY (neighbourhood_id) REFERENCES neighbourhoods(id);
   CREATE INDEX idx_leads_area_id ON leads (area_id) WHERE area_id IS NOT NULL;
   CREATE INDEX idx_leads_municipality_id ON leads (municipality_id) WHERE municipality_id IS NOT NULL;
   CREATE INDEX idx_leads_community_id ON leads (community_id) WHERE community_id IS NOT NULL;
   CREATE INDEX idx_leads_neighbourhood_id ON leads (neighbourhood_id) WHERE neighbourhood_id IS NOT NULL;
   COMMIT;
   ```

4. Apply via runner: `scripts/apply-t2a-leads-geo-columns.js` (W-TERRITORY-style — captures rollback snapshot before apply, verifies post-apply with marker check, reports byte-level diff).

5. Smoke: re-run T0-F probe; confirm 4 new columns + 4 new indexes; confirm 0 row-count drift on existing data.

6. Commit `t2a_leads_geo_columns`; push to `origin/main`.

T2a estimate: ~30 minutes including probe-then-patch + smoke. Then T2b (indexes), T2c (lead_origin_route), T2d (CHECK constraints), T2e (vip_requests scope), T2f (audit table) — each one ships before the next starts. T2g (RPC tenant-leak fix, commits `d0c6ca3` + `f1bcf66`) and T2h (`createLead.ts` delete) were prioritized and already shipped 2026-05-10; see status log v3 + v4 entries and findings closures.

---

## Status log

- **2026-05-09 v1 SKELETON** — Tracker created. Why-this-exists, scope contract DRAFT, ODs OD-1..OD-7 OPEN, phases T0..Tlast outlined.
- **2026-05-10 v4 T2h CLOSED** — `app/actions/createLead.ts` deleted. Zero callers re-verified in-session before delete via repo-wide grep: the only `createLead`-named function in the codebase is the one defined locally in `lib/actions/leads.ts` L128, which is unrelated to this dead-code file's exported `createLeadFromRegistration` symbol (zero matches anywhere). TSC clean post-deletion. Closes F-CREATELEAD-IS-DEAD-CODE. T2 phase progress: 2 of 8 sub-phases shipped (T2g + T2h); remaining T2a (leads geo columns), T2b (indexes), T2c (lead_origin_route), T2d (CHECK constraints), T2e (vip_requests scope), T2f (audit table). Next action: T2a probe + apply.
- **2026-05-10 v3 T2g CLOSED (out-of-order, security priority)** — `resolve_agent_for_context` RPC tenant-leak fix shipped (commit `d0c6ca3` initial migration + commit `f1bcf66` followup with verification regex fix). Live function body grew 82 → 105 lines; 7 occurrences of `tenant_id = p_tenant_id` in production vs 1 pre-T2g baseline (P10 preserved tier only). Closes F-RESOLVE-AGENT-P1-P2-MISSING-TENANT-FILTER and F-RESOLVE-AGENT-P8-USER-PROFILES-CROSS-TENANT-LEAK. Followup batch addressed false-positive P10 verification: runner's brittle `.includes(literal)` check replaced with regex `.test()` + `\s+` whitespace tolerance after v1 (multi-line literal) and v2 (single-line literal) substring approaches both failed against the file's actual whitespace. Lessons logged: (a) future apply runners should run verification INSIDE a Node-managed transaction so verification failures roll back the migration rather than leave the DB in a half-applied state; (b) regex matching should be the default for in-place source-code patches — literal-substring matching is fragile against whitespace/CRLF drift on Windows. Next action: resume T2a `leads` geo columns migration; remaining sequence T2a→T2b→T2c→T2d→T2e→T2f→T2h.
- **2026-05-10 v2 T0 RECON COMPLETE + T1 LOCKED** — All 7 sub-targets closed. 125 findings catalogued. 7 OD anchors locked: OD-1 (c), OD-2 (b), OD-3 (c), OD-4 (c), OD-5 (a), OD-6 (c), OD-7 (b). T2..Tn phase plan defined. Next action: T2a `leads` geo columns migration.

---

## Recon outputs (all on disk under `recon/`)

| File | Status |
|---|---|
| `W-LEADS-EMAIL-T0-A-credit-surface.txt` (41 KB) | Round 1, defective grep — superseded |
| `W-LEADS-EMAIL-T0-A-REPROBE-credit-surface.txt` (125 KB) | Pasted in 2 parts, processed |
| `W-LEADS-EMAIL-T0-A-REPROBE-PART1.txt` (102 KB) | Pasted, processed |
| `W-LEADS-EMAIL-T0-A-REPROBE-PART2.txt` (22 KB) | Pasted, processed |
| `W-LEADS-EMAIL-T0-B-2-canonical-pattern.txt` (63 KB) | Pasted, processed |
| `W-LEADS-EMAIL-T0-C-form-coverage.txt` (~19 KB) | Pasted, processed |
| `W-LEADS-EMAIL-T0-C-2-form-render-callsites.txt` (~22 KB) | Pasted, processed |
| `W-LEADS-EMAIL-T0-C-3-action-writer-dumps.txt` (~44 KB) | Pasted, processed |
| `W-LEADS-EMAIL-T0-DG-email-and-platform.txt` (114 KB) | Split — superseded by per-file dumps |
| `W-LEADS-EMAIL-T0-DG-PART1.txt` (93 KB) | Pasted with corruption — superseded |
| `W-LEADS-EMAIL-T0-DG-PART2.txt` (20 KB) | Pasted, processed |
| `W-LEADS-EMAIL-T0-D-FILE-low-credits.txt` (10 KB) | Pasted, processed |
| `W-LEADS-EMAIL-T0-D-FILE-charlie-vip-request.txt` (19 KB) | Pasted, processed |
| `W-LEADS-EMAIL-T0-D-FILE-charlie-vip-approve.txt` (12 KB) | Pasted, processed |
| `W-LEADS-EMAIL-T0-D-FILE-estimator-vip-request.txt` (18 KB) | Pasted, processed |
| `W-LEADS-EMAIL-T0-D-FILE-estimator-vip-approve.txt` (12 KB) | Pasted, processed |
| `W-LEADS-EMAIL-T0-F-leads-schema.txt` (35 KB) | Pasted, processed |

Probe scripts on disk under `scripts/`:

| Script | Purpose |
|---|---|
| `scripts/recon-w-leads-email-t0-f-schema.js` | T0-F SQL schema dump (Node + pg) |

T2 build scripts to be written:

| Script | Purpose |
|---|---|
| `scripts/apply-t2a-leads-geo-columns.js` | Apply T2a migration with rollback snapshot |
| `scripts/apply-t2b-leads-indexes.js` | Apply T2b indexes |
| `scripts/apply-t2c-lead-origin-route.js` | Apply T2c column |
| `scripts/apply-t2d-leads-check-constraints.js` | Apply T2d CHECKs |
| `scripts/apply-t2e-vip-requests-tenant-scope.js` | Apply T2e scope tightening |
| `scripts/apply-t2f-lead-email-recipients-log.js` | Apply T2f audit table |
| `scripts/apply-t2g-resolve-agent-tenant-filter.js` | Apply T2g RPC fix |
| `scripts/run-w-leads-email-smoke.js` | T7 smoke harness |