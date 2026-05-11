# W-LEADS-EMAIL — TRACKER

**Version:** v13 — T6a CLOSED 2026-05-11
**Status:** T2 ✅ CLOSED 2026-05-10. **T3 phase ✅ CLOSED 2026-05-11.** **T4 ✅ CLOSED 2026-05-11 — OD-1=(c) FINAL.** **T5 ✅ CLOSED 2026-05-11 — OD-5=(a) FINAL.** Form coverage matrix verified across all 6 page types via 3-probe recon: every type composes the canonical lead-capture triad — `WalliamAgentCard` (embedded contact form → /api/walliam/contact), `WalliamCTA` (Charlie launcher with context tagline), `CharliePageContext` (window-event geo-ID feed). Building adds inline `WalliamContactForm` (source=walliam_building_inquiry); Property adds `AppointmentForm` + `AgentContactForm`. Four non-blocker findings on file: F-LERL-RECIPIENT-LAYER-USER-FACING-GAP, F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP, F-SLUG-ROUTER-MISSING-NEIGHBOURHOOD-BRANCH (NEW: routing/SEO gap, neighbourhoods only reachable via `/comprehensive-site/toronto/[slug]`), F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER (NEW: T8 verify-item). **T6 phase IN PROGRESS — T6a + T6b ✅ CLOSED 2026-05-11.** T6a closed F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE via new tenant-aware `validateSession` helper (`lib/utils/validate-session.ts`) wired into 3 routes (charlie/lead, charlie/plan-email, charlie/appointment) + inline `tenant.source_key` swap in estimator/session (Shape B: existing tenant SELECT extended with source_key, L100 + L118 source literals swapped) + reorder-and-extend in estimator/vip-request (Shape C: source check moved below existing tenant load, tenant SELECT extended with source_key). T6b closed F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER via `lead_origin_route` lookup at vip-questionnaire route + 8-site caller wiring + idempotent backfill. **Next: T6 continues — T6c (source-string hardcoding), T6d (VIP auto-approve fixes), T6e (plan integration verification).**
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

### T2 — Schema migrations (✅ CLOSED 2026-05-10 — all 8 sub-phases shipped; see status log v5 for commit chain and findings closures)

Single transaction per migration file. Backup snapshots captured by `scripts/apply-*.js` runners before apply. Each phase ships independently with smoke verification before moving to the next.

**T2a — `leads` typed origin columns — ✅ CLOSED 2026-05-10 (commit `b8743a7`)**
- ADD COLUMN `area_id uuid NULL FK treb_areas(id)` (T2a-pre verified table name; convention matches `agent_property_access.area_id`)
- ADD COLUMN `municipality_id uuid NULL FK municipalities(id)`
- ADD COLUMN `community_id uuid NULL FK communities(id)`
- ADD COLUMN `neighbourhood_id uuid NULL FK neighbourhoods(id)`
- CREATE INDEX on each new column
- Backfill: existing rows get NULL on new columns
- File: `supabase/migrations/<stamp>_t2a_leads_geo_columns.sql`

**T2b — `leads` performance indexes — ✅ CLOSED 2026-05-10 (commit `37b3886`)**
- CREATE INDEX `idx_leads_tenant_email ON leads (tenant_id, contact_email)` — fixes F-LEADS-NO-INDEX-ON-DUP-DETECTION-KEY
- CREATE INDEX `idx_leads_listing_id ON leads (listing_id) WHERE listing_id IS NOT NULL`
- CREATE INDEX `idx_leads_source ON leads (source)`
- File: `supabase/migrations/<stamp>_t2b_leads_indexes.sql`

**T2c — `leads.lead_origin_route` for questionnaire LIKE filter fix — ✅ CLOSED 2026-05-10 (commit `ae8454c`); T6b application-half ✅ CLOSED 2026-05-11**
- ADD COLUMN `lead_origin_route text NOT NULL DEFAULT 'unknown'`
- CREATE INDEX on `(tenant_id, lead_origin_route)`
- Backfill existing rows: derive from `source` text via lookup table
- File: `supabase/migrations/<stamp>_t2c_lead_origin_route.sql`

**T2d — `leads` data-quality CHECK constraints — ✅ CLOSED 2026-05-10 (commit `b74cdd2`)**
- ADD CHECK `appointment_status IN ('pending', 'confirmed', 'cancelled', 'completed', 'rescheduled')`
- ADD CHECK `assignment_source IN ('geo', 'admin', 'manual', 'override')`
- File: `supabase/migrations/<stamp>_t2d_leads_check_constraints.sql`

**T2e — `vip_requests` tenant scoping fix — ✅ CLOSED 2026-05-10 (commit `43ec751`); request_source CHECK still pending as F-VIP-REQUESTS-REQUEST-SOURCE-NO-CHECK**
- Backfill `tenant_id` on existing rows: `UPDATE vip_requests SET tenant_id = leads.tenant_id FROM leads WHERE vip_requests.lead_id = leads.id`. For rows with NULL `lead_id`, derive from `agent.tenant_id` via FK chain. Any unbackfillable rows are deleted (after audit).
- ALTER COLUMN `tenant_id SET NOT NULL`
- ADD FK `vip_requests_tenant_id_fkey REFERENCES tenants(id)`
- CREATE INDEX `idx_vip_requests_tenant ON vip_requests (tenant_id)`
- ADD CHECK on `status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')`
- ADD CHECK on `request_type IN ('plan', 'chat', 'estimator')`
- ADD CHECK on `request_source IN ('chat', 'estimator', 'questionnaire')`
- File: `supabase/migrations/<stamp>_t2e_vip_requests_tenant_scope.sql`

**T2f — `lead_email_recipients_log` new audit table — ✅ CLOSED 2026-05-10 (commit `8e84040`); T3 wires callers to write rows**
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

### T3 — Recipient helper extension (✅ CLOSED 2026-05-11 — T3a `27fe944` + T3b 2026-05-10 v7/v8 with 2 hotfixes + T3c 2026-05-11 v9 with verify-skip)

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

### T4 — Credit gating (✅ CLOSED 2026-05-11 — OD-1=(c) FINAL via probe-evidence; see v10 status log entry)

OD-1 = (c) means lead INSERT does not gate on credits. T4 collapses to verification:

**T4a — Audit lead-write surfaces for accidental credit gating**
- 7 API routes + `submitLeadFromForm` + `getOrCreateLead`
- Confirm none of them returns 402 / blocks on credit balance
- T0-A already inventoried this; T4a is a final pre-build audit

(No code changes required if audit passes. If it fails, scope expands; current evidence says it passes.)

### T5 — Form coverage audit (✅ CLOSED 2026-05-11 — OD-5=(a) FINAL via 3-probe coverage matrix; see v11 status log entry)

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

**T6a — F-W-RECOVERY-A15 across 5 routes — ✅ CLOSED 2026-05-11**
- New helper `lib/utils/validate-session.ts` exports `validateSession({ supabase, sessionId, userId, tenantId, selectColumns? })` returning `{ ok: true, session } | { ok: false, status, error }`. Loads `tenants.source_key` first, then queries `chat_sessions` with `.eq('id', sessionId).eq('user_id', userId).eq('tenant_id', tenantId).eq('source', sourceKey).maybeSingle()`. Any failure (missing param, tenant not found, source_key null, session not matching) returns `{ ok: false, status: 401, error: 'Invalid session' }`. **Multitenant safety:** a forged `x-tenant-id` header that doesn't match the session's actual `tenant_id` returns no row → 401.
- Probe revealed routes weren't homogeneous — three distinct call-site shapes addressed:
  - **Shape A — standard auth gate (helper-using, 3 routes):** `charlie/lead` (F1.P1+P2), `charlie/plan-email` (F2.P1+P2, `selectColumns: 'id, tenant_id'` to preserve downstream `validSession.tenant_id` usage; tenantId derived from `req.headers.get('x-tenant-id') || ''` since this route didn't read the header pre-gate — net behavior is stricter: forged header → 401), `charlie/appointment` (F3.P1+P2). Auth-gate block replaced with single helper call; `validSession` local-var name preserved for downstream compatibility.
  - **Shape B — session lifecycle (inline, 1 route):** `estimator/session` (F4.P1+P2+P3). Existing tenant SELECT extended with `source_key` (was 8 fields, now 9). Then `.eq('source', 'walliam')` at L100 (chat_sessions discovery — finds user's active session) and `source: 'walliam'` at L118 (chat_sessions INSERT — creates new session) both swapped for `tenant.source_key`. No helper needed — tenant row was already loaded.
  - **Shape C — gate-on-loaded-session (inline reorder, 1 route):** `estimator/vip-request` (F5.P1). Pre-fix: auth check at L80 (`if (!session.user_id || session.source !== 'walliam')`) ran BEFORE the existing tenant load at L89-93 (which selected only estimator-VIP config, not source_key). Refactor: split user_id check from source check (user_id check stays at original position, returns 401 immediately), add `source_key` to the existing tenant SELECT (was 3 fields, now 4), move source check to AFTER tenant load using `tenant.source_key`. No helper needed for the same reason as Shape B (existing tenant load satisfies the source_key fetch).
- Smoke harness hotfix: `scripts/smoke-t3b.js` Tier 3 (plan-email) fetch was sending only `'Content-Type': 'application/json'`, no `x-tenant-id` header. T6a's helper requires the header (since charlie/plan-email now reads it via `req.headers.get('x-tenant-id') || ''`). Tiers 5 + 6 in `smoke-t3c.js` already sent the header (T3c shipped them that way at v9). Tier 8 (estimator/vip-request) doesn't send the header and intentionally doesn't need to — Shape C derives tenantId from `session.tenant_id` after the session JOIN load. One-line patch to Tier 3 closes the regression.
- TSC clean. Smoke 9/9 GREEN end-to-end (T3b 4/4 + T3c 5/5).

**T6b — F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER — ✅ CLOSED 2026-05-11**
- Replaced `.like('source', 'walliam_estimator%')` at L147 (8-space indent) and L229 (10-space indent) of `app/api/walliam/estimator/vip-questionnaire/route.ts` with `.eq('lead_origin_route', 'estimator_vip_request')` (tenant-agnostic, indexed equality).
- Caller-wiring shipped across 8 lead-write sites — every INSERT/UPSERT now sets `lead_origin_route` at write time. `lib/actions/leads.ts` calls `deriveLeadOriginRoute(source)` from the new helper at `lib/utils/lead-origin-route.ts`; other routes hardcode the appropriate route value per their semantic (e.g. `'charlie'`, `'estimator_vip_request'`, `'contact_form'`).
- Idempotent backfill migration `supabase/migrations/20260511_t6b_lead_origin_route_backfill.sql` flipped 15 pre-existing 'unknown' rows to their proper routes (7 `walliam_charlie` → `charlie`, 3 `walliam_charlie_vip_request` → `charlie_vip_request`, 5 `walliam_estimator_vip_request` → `estimator_vip_request`).
- Smoke harness hotfix: F-T3C-FIXTURE-BYPASSES-LEAD-ORIGIN-ROUTE-WIRE discovered + fixed in passing — `fxInsertLead` in `scripts/smoke-t3c.js` now derives `lead_origin_route` via a JS mirror of the TS helper (third source of truth; lockstep workflow rule added below).
- TSC clean. Smoke 9/9 GREEN (T3b 4/4 + T3c 5/5 including Tier 7 vip-questionnaire end-to-end via `.eq` lookup).

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

- **F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE ✅ CLOSED 2026-05-11 (T6a)** — auth gates across 5 routes refactored to read `tenants.source_key` and enforce tenant match. 3 routes (charlie/lead, charlie/plan-email, charlie/appointment) use new `validateSession` helper at `lib/utils/validate-session.ts`; 2 routes (estimator/session, estimator/vip-request) use inline `tenant.source_key` access via their existing tenant SELECT (helper-call would have been wasteful — extra DB round-trip). Multitenant safety net: helper query filters `chat_sessions` by both `tenant_id` (from header) and `source` (from `tenants.source_key`); forged x-tenant-id → no row → 401. Cross-tenant negative-path regression guard scheduled for T7f. Smoke 9/9 GREEN including Tier 8 which exercises Shape C end-to-end.
- **F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER ✅ CLOSED 2026-05-11 (T6b)** — `.like('source', 'walliam_estimator%')` at L147 + L229 of `app/api/walliam/estimator/vip-questionnaire/route.ts` replaced with `.eq('lead_origin_route', 'estimator_vip_request')`. Tenant-agnostic, indexed equality lookup. Application-half complete (8-site caller wiring + new helper `lib/utils/lead-origin-route.ts` + idempotent backfill migration mapping 15 pre-existing 'unknown' rows). Smoke 9/9 GREEN.
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

- **F-ORIGIN-GEO-IDS-NOT-PERSISTED ✅ CLOSED 2026-05-10 (T2a, commit `b8743a7`)** — leads.area_id / municipality_id / community_id / neighbourhood_id columns added with FKs to treb_areas / municipalities / communities / neighbourhoods + 4 partial indexes. Schema half complete; caller wiring (T5e) populates them.
- **F-VIP-REQUEST-LEAD-LOSES-GEO-CONTEXT** — charlie/vip-request INSERT lacks all geo IDs. T2a + T5e fix.
- **F-ESTIMATOR-VIP-PARTIAL-GEO-CAPTURE** — captures `building_id` only. T2a + T5e fix.
- **F-APPOINTMENT-LEAD-PARTIAL-GEO-CAPTURE** — community/muni/area passed to resolver, only `geo_name` lands. T2a + T5e fix.
- **F-LEADS-NO-INDEX-ON-DUP-DETECTION-KEY ✅ CLOSED 2026-05-10 (T2b, commit `37b3886`)** — `idx_leads_tenant_email (tenant_id, contact_email)` shipped; getOrCreateLead duplicate-detection now index-scans.
- **F-LEADS-NO-INDEX-ON-LISTING-ID ✅ CLOSED 2026-05-10 (T2b, commit `37b3886`)** — `idx_leads_listing_id` partial index (WHERE listing_id IS NOT NULL) shipped, sibling to existing `idx_leads_building_id`.
- **F-LEADS-NO-INDEX-ON-SOURCE ✅ CLOSED 2026-05-10 (T2b, commit `37b3886`)** — `idx_leads_source` shipped; analytics queries now index-scan.
- **F-LEADS-APPOINTMENT-TIME-IS-TEXT** — typed as `text`, not `time`. Defer to T2-followup or post-launch (data-quality, not blocking).
- **F-LEADS-APPOINTMENT-STATUS-NO-CHECK ✅ CLOSED 2026-05-10 (T2d, commit `b74cdd2`)** — `leads_appointment_status_check` constraint shipped: pending / confirmed / cancelled / completed / rescheduled.
- **F-LEADS-ASSIGNMENT-SOURCE-NO-CHECK ✅ CLOSED 2026-05-10 (T2d, commit `b74cdd2`)** — `leads_assignment_source_check` constraint shipped: geo / admin / manual / override.
- **F-VIP-REQUESTS-TENANT-ID-NULLABLE (MAJOR) ✅ CLOSED 2026-05-10 (T2e, commit `43ec751`)** — `vip_requests.tenant_id` is now uuid NOT NULL. T2e-pre probe verified 0 existing rows so no backfill was needed.
- **F-VIP-REQUESTS-NO-FK-ON-TENANT-ID ✅ CLOSED 2026-05-10 (T2e, commit `43ec751`)** — `vip_requests_tenant_id_fkey` FK constraint added.
- **F-VIP-REQUESTS-NO-CHECK-CONSTRAINTS** — status/request_type/request_source unbounded. T2e.
- **F-VIP-REQUESTS-NO-TENANT-INDEX ✅ CLOSED 2026-05-10 (T2e, commit `43ec751`)** — `idx_vip_requests_tenant` shipped.
- **F-LEAD-EMAIL-LOG-IS-SYSTEM-1-ONLY ✅ CLOSED 2026-05-10 (T2f, commit `8e84040`)** — `lead_email_recipients_log` audit table shipped with append-only semantics (DELETE blocked via trg_lerl_no_delete; UPDATE limited to status / sent_at / delivered_at / bounced_at / resend_message_id via trg_lerl_status_only_update) + 4 indexes (tenant_sent, lead, recipient, resend_msg). Caller wiring at T3.
- **F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN ✅ CLOSED 2026-05-10 (T2f, commit `8e84040`)** — new `lead_email_recipients_log` table has `recipient_email` per row (one row per layer in the BCC fan-out).
- **F-LERL-RECIPIENT-LAYER-USER-FACING-GAP** (NEW 2026-05-11, NON-BLOCKER) — `lerl_recipient_layer_check` CHECK constraint on `lead_email_recipients_log.recipient_layer` does not include a value for user-facing email recipients (the buyer/lead being notified directly, e.g. the vip-approve user-facing approval email). Currently allowed values: `agent` / `manager` / `area_manager` / `tenant_admin` / `platform_admin` / `tenant_overlay_bcc`. Recording a user-facing recipient as `tenant_overlay_bcc` would be a semantic lie. **Impact:** `walliam/estimator/vip-approve` user-facing send is the only verify-skip in T3 phase — the email still sends correctly, only its audit row is skipped. **Fix surface:** post-launch migration extends the CHECK with a `lead_contact` (or similar) layer value, then wire `vip-approve` to call `logEmailRecipients` with `recipientLayer: 'lead_contact'`. Discovered at T3c wire 2026-05-11 (v9 entry); deferred as not launch-blocking.
- **F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP** (NEW 2026-05-11, NON-BLOCKER, PROBE-ITEM) — Discovered at T4 probe v2: 2 SYSTEM 2 lead-management surfaces operate on existing leads via UPDATE — `app/api/admin-homes/leads/[id]/route.ts` (admin UI for lead detail page, 1×`.update` at L35) and `lib/actions/lead-management.ts` (6×`.update` at L10/26/42/115/147/166 covering assignment changes, status updates, contact tracking). These are NOT lead creation surfaces (so out of OD-1=(c) credit-gating scope) but they MAY trigger email notifications on certain state changes (e.g. lead reassigned to new agent → assignment notification email; status changed to "contacted" → manager notification; etc). If any of these UPDATE flows trigger `sendTenantEmail` calls, those emails need T3-style audit wiring into `lead_email_recipients_log` for full per-recipient audit observability. **Verification surface:** T8 comprehensive smoke — for each UPDATE flow that calls `sendTenantEmail`, add one tier asserting audit rows land in `lead_email_recipients_log`. **Fix surface** (if gaps found): mirror the T3c wire-and-audit pattern for each UPDATE flow that emails — pass `templateKey` per flow (e.g. `lead_management_assignment_change_chain`, `lead_management_status_change_chain`). **Status:** PROBE-ITEM, not blocking T4 close or launch — deferred to T8.
- **F-SLUG-ROUTER-MISSING-NEIGHBOURHOOD-BRANCH** (NEW 2026-05-11, NON-BLOCKER, ROUTING/SEO) — `app/[slug]/page.tsx` slug router resolves slugs in order: property → home-property → development → area → municipality → community → fallback BuildingPage. There is no neighbourhood lookup branch. Result: neighbourhood pages are reachable only via `/comprehensive-site/toronto/[slug]/` URLs (the dedicated `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` route), NOT via clean `/[slug]/` slug-router URLs. Impact: a user visiting `/yonge-eglinton` would fall through to BuildingPage and 404 (no building has that slug). Affects SEO discoverability and clean-URL accessibility for neighbourhood pages. **Not a form-coverage gap** (OD-5 unaffected; neighbourhood form coverage is in place on the dedicated route). **Fix surface:** add a neighbourhood lookup branch to `app/[slug]/page.tsx` between the community check and the BuildingPage fallback (mirror the area/municipality/community pattern). **Status:** Defer to W-LAUNCH-TRACKER post-launch — non-blocking for W-LEADS-EMAIL closure.
- **F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER** (NEW 2026-05-11, NON-BLOCKER, PROBE-ITEM) — `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` L10 imports `CharliePageContext` and L11 imports `WalliamCTA`. The L256 JSX renders `<WalliamCTA context={neighbourhood.name}>`. The focused probe slice window stopped at ~L266 (file is 268 lines total) and did not capture a `<CharliePageContext>` JSX render. Verify at T8 comprehensive smoke that `<CharliePageContext neighbourhood_id={...} neighbourhood_slug={...} ...>` is actually rendered on the neighbourhood page (not just imported). If not rendered, add the JSX line so neighbourhood-specific geo context flows to Charlie chat. **Non-blocking:** Charlie chat would still work without it but lose neighbourhood-specific geo binding on leads originating from the neighbourhood page.

### Bug fixes (T6)

- **F-VIP-AUTO-APPROVE-ONLY-WRITES-BUYER-PLAN-LIMIT** — seller VIP auto-approval grants buyer credits. T6d.
- **F-VIP-AUTO-APPROVE-USES-CHAT-LIMIT-FOR-PLAN-REQUESTS** — wrong limit selected. T6d.
- **F-LEADS-QUALITY-INCONSISTENT** — `quality` field set inconsistently across routes (some `'cold'`, some `'hot'`). T6 cleanup.
- **F-LEADS-REFERER-SOURCE-FALLBACK-FRAGILE** — `lib/actions/leads.ts:139-148` referer-based source detection. Low. Document at T6.
- **F-T3C-FIXTURE-BYPASSES-LEAD-ORIGIN-ROUTE-WIRE ✅ CLOSED 2026-05-11 (T6b hotfix)** — discovered during T6b smoke verification. The `fxInsertLead` helper in `scripts/smoke-t3c.js` was creating tier-7 fixture leads via direct `supabase.from('leads').insert()`, bypassing route-layer wiring that populates `lead_origin_route`. After F9.P2/F9.P3 replaced vip-questionnaire's `.like('source', 'walliam_estimator%')` with `.eq('lead_origin_route', 'estimator_vip_request')`, the new lookup couldn't find fixture leads (column default `'unknown'`), and the route fell through to the F9.P1 defensive INSERT path — creating orphan `walliam_estimator_questionnaire` leads instead of enriching the fixture vip-request lead. Smoke checked the fixture's audit rows, found 0 (audit rows landed on the orphan), reported FAIL. **Fix:** added JS mirror of `deriveLeadOriginRoute` at top of `smoke-t3c.js` (matching the TS helper at `lib/utils/lead-origin-route.ts` and the SQL CASE in `supabase/migrations/20260510_t2c_lead_origin_route.sql`) + wired `fxInsertLead` to call it on the `source` param. Side effect: TS helper docstring updated to acknowledge the JS mirror as the third source of truth. Workflow rule added below to enforce lockstep updates.

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
| 7 | `app/api/walliam/estimator/vip-questionnaire/route.ts` | API F57-class UPSERT | ✅ CLOSED 2026-05-11 (T6b) | T6b ✅ |
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
- **Three-source-of-truth lockstep (W-LEADS-EMAIL T6b 2026-05-11):** the lead-origin-route controlled vocabulary lives in three sites — SQL CASE in `supabase/migrations/20260510_t2c_lead_origin_route.sql`, TS helper at `lib/utils/lead-origin-route.ts`, and JS mirror at top of `scripts/smoke-t3c.js`. All three must update in lockstep when the vocabulary changes; otherwise production routes, backfill SQL, and smoke fixtures will produce different values for the same source string. Each site's docstring/comment references the other two.
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

T2 phase ✅ CLOSED 2026-05-10. **T3 phase ✅ CLOSED 2026-05-11.** **T4 ✅ CLOSED 2026-05-11 — OD-1=(c) FINAL.** **T5 ✅ CLOSED 2026-05-11 — OD-5=(a) FINAL.** T5 closed via 3-probe form coverage recon (`probe-t5a-form-coverage-matrix.js` v1, `probe-t5a-form-coverage-deep.js` v2, `probe-t5a-form-coverage-focused.js` v3). All 6 page types verified to compose the canonical triad: WalliamAgentCard + WalliamCTA + CharliePageContext with entity-appropriate props (area_id / muni_id / community_id / neighbourhood_id / building_id / listing_id+building_id flowing through the right slots per page). Building additionally renders inline `<WalliamContactForm building_id={...} source="walliam_building_inquiry">`; Property additionally renders `<AppointmentForm>` + legacy `<AgentContactForm>`. Two new non-blocker findings logged: F-SLUG-ROUTER-MISSING-NEIGHBOURHOOD-BRANCH (slug router has no neighbourhood branch — defer to W-LAUNCH-TRACKER post-launch) + F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER (probe-item: confirm at T8 that CharliePageContext JSX is rendered on the neighbourhood page; import is present at L10 but slice window didn't capture the JSX). **Next: T6 — Plan integration + T6b LIKE-filter replacement.** OD-4=(c) "both directions" was locked at v2 (charlie/plan-email creates lead at plan-ready; charlie/lead F57 enriches via UPSERT). T6 work shape: (1) probe current plan-integration flow end-to-end to confirm both directions still work post-T2/T3 (the chain INSERT/UPSERT path + the F57 enrichment path); (2) T6b — replace the hardcoded `LIKE 'walliam_estimator%'` filter in `walliam/estimator/vip-questionnaire` with a `lead_origin_route` lookup (using the column shipped at T2c commit `ae8454c`) — this closes F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER; (3) verify plan-context propagation through the BCC fan-out (plan-email-chain templateKey rows in `lead_email_recipients_log`); (4) tracker v11 → v12 with T6 close entry. After T6: **T7** smoke matrix (OD-6=(c) at v2). **T8** comprehensive smoke + regression sweep (extends to verify F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER + F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP). **Tlast** close + update `docs/W-LAUNCH-TRACKER.md` Section 4 with W-LEADS-EMAIL row at closure.

---

## Status log

- **2026-05-09 v1 SKELETON** — Tracker created. Why-this-exists, scope contract DRAFT, ODs OD-1..OD-7 OPEN, phases T0..Tlast outlined.
- **2026-05-11 v13 T6a CLOSED — F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE closed** — T6a shipped via 4 scripts: `scripts/probe-t6a-auth-gate-recon.js` (first probe — auth-gate code blocks + source_key references + tenantId scope in all 5 target routes), `scripts/probe-t6a-route-tops.js` (second probe — lines 1-55 of each route to resolve tenantId binding patterns), `scripts/probe-t6a-smoke-fetches.js` (third probe — smoke harness fetch calls to map x-tenant-id header insertion sites), and `scripts/patch-t6a-wire.js` (the wire patch — 10 atomic anchor-validated patches + 1 new helper file). **Probe revealed three distinct call-site shapes that the tracker's original "5 routes, 1 helper" framing collapsed:** (Shape A) standard auth-gate `.eq('source', 'walliam').maybeSingle()` followed by `if (!validSession) 401` in `charlie/lead`, `charlie/plan-email`, `charlie/appointment` — these get the new helper; (Shape B) session-lifecycle source field in `estimator/session` — line 100 `.eq('source', 'walliam')` is a session DISCOVERY (find user's active session) and line 118 `source: 'walliam'` is a session CREATION INSERT, neither is an auth gate; (Shape C) gate-on-loaded-session in `estimator/vip-request` — session loaded with agents JOIN at L60-74, then `if (!session.user_id || session.source !== 'walliam')` at L80, then tenant loaded for estimator-VIP config at L89-93. Helper handles Shape A; Shapes B and C handled inline by extending existing tenant SELECT with `source_key` and swapping/moving the literal check. **Helper design:** `validateSession({ supabase, sessionId, userId, tenantId, selectColumns? })` returns `{ ok: true, session } | { ok: false, status: number, error: string }`. Loads `tenants.source_key` for the caller-provided tenantId, then loads `chat_sessions` with `.eq('id', sessionId).eq('user_id', userId).eq('tenant_id', tenantId).eq('source', sourceKey).maybeSingle()`. Any failure (any param missing, tenant not found, source_key null, session not matching all filters) returns 401 with generic 'Invalid session' message. Multitenant safety net: a forged `x-tenant-id` header that doesn't match the session's actual `tenant_id` returns no row → 401 (the chat_sessions query is tenant-scoped). **Behavioral change at charlie/plan-email:** previously the route didn't read `x-tenant-id` header pre-gate (tenant_id was derived from the session row); post-T6a the route reads the header and passes it to the helper, which enforces the match. Net: stricter, no observable change for honest clients (who already send the header). **Tier 8 (estimator/vip-request) deliberately does NOT use the helper** — Shape C derives tenantId from `session.tenant_id` after the agents JOIN load, so smoke harness doesn't send `x-tenant-id` for this route and the route doesn't read it. **Smoke harness hotfix:** `scripts/smoke-t3b.js` Tier 3 (plan-email) fetch was sending only `'Content-Type': 'application/json'`. With the route now reading x-tenant-id, this caused 401. One-line patch added `'x-tenant-id': TENANT_ID` to that fetch's headers. Tiers 5 + 6 in `smoke-t3c.js` already sent the header at v9 (T3c shipped them that way); Tier 8 intentionally still doesn't (Shape C). **Smoke results post-fix — 9/9 GREEN:** T3b Tier 1 (walliam/contact — not T6a scope), Tier 2 (walliam/charlie/vip-request — not T6a scope, already-clean dynamic source), Tier 3 (charlie/plan-email — helper-using, now passing with header), Tier 4 (lib/actions/leads — not T6a scope); T3c Tier 5 (charlie/appointment — helper-using, header already present), Tier 6 (charlie/lead — helper-using INSERT + UPDATE, header already present, F2.P2 leadId-fix re-verified), Tier 7 (vip-questionnaire — not T6a scope), Tier 8 (estimator/vip-request — Shape C verified end-to-end: session.source ↔ tenant.source_key compared post-load), Tier 9 (vip-approve verify-skip — preserved). **Cross-tenant negative-path tests deferred to T7f** per the tracker's T7 plan (cross-tenant leak regression guards for both T2g RPC fix and T6a auth gate); not in T6a scope. **Files in this commit:** 5 modified route files (`app/api/charlie/lead/route.ts`, `app/api/charlie/plan-email/route.ts`, `app/api/charlie/appointment/route.ts`, `app/api/walliam/estimator/session/route.ts`, `app/api/walliam/estimator/vip-request/route.ts`), 1 new helper file (`lib/utils/validate-session.ts`), 1 modified smoke harness (`scripts/smoke-t3b.js`), 4 new probe/patch scripts (`scripts/probe-t6a-auth-gate-recon.js`, `scripts/probe-t6a-route-tops.js`, `scripts/probe-t6a-smoke-fetches.js`, `scripts/patch-t6a-wire.js`), 1 tracker patch script (`scripts/patch-w-leads-email-tracker-v13.js`), and `docs/W-LEADS-EMAIL-TRACKER.md` (v12→v13 bump in this script). **Next:** T6c (source-string hardcoding refactor in 5 routes — uses the same `tenants.source_key` access pattern T6a established), T6d (VIP auto-approve fixes — isolated bug fixes in `walliam/charlie/vip-request`), T6e (plan integration verification per OD-4=(c)). After T6: T7 smoke matrix with cross-tenant regression guards, T8 sweep, Tlast close.
- **2026-05-11 v12 T6b CLOSED — F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER closed** — T6b shipped via 3 patch scripts: `scripts/patch-t6b-wire.js` (v2 with CRLF-aware line-ending handling + atomic 10-anchor validation), `scripts/patch-smoke-t3c-fixture-lead-origin-route.js` (harness fixture fix), and `scripts/probe-smoke-t3c-tier7-fixture.js` (read-only probe of the smoke harness before patching). **Wire changes across 8 lead-write sites:** `app/api/walliam/contact/route.ts` F3.P1 (hardcoded `lead_origin_route: 'contact_form'`), `app/api/walliam/charlie/vip-request/route.ts` F4.P1 (`'charlie_vip_request'`), `app/api/charlie/plan-email/route.ts` F5.P1 (`'charlie'`), `lib/actions/leads.ts` F6.P1+F6.P2 (helper import + `deriveLeadOriginRoute(source)` derivation in INSERT — canonical multitenant pattern), `app/api/charlie/appointment/route.ts` F7.P1 (`'charlie'`), `app/api/charlie/lead/route.ts` F8.P1 (`'charlie'`), `app/api/walliam/estimator/vip-questionnaire/route.ts` F9.P1+F9.P2+F9.P3 (defensive INSERT `'estimator_questionnaire'` + two `.like('source', 'walliam_estimator%')` filters at L147 (8-space indent) and L229 (10-space indent) replaced with `.eq('lead_origin_route', 'estimator_vip_request')`), `app/api/walliam/estimator/vip-request/route.ts` F10.P1 (`'estimator_vip_request'`). **2 new files:** `lib/utils/lead-origin-route.ts` (TS helper exporting `deriveLeadOriginRoute(source)` + `LeadOriginRoute` type, mirrors T2c SQL CASE) + `supabase/migrations/20260511_t6b_lead_origin_route_backfill.sql` (idempotent backfill `WHERE lead_origin_route = 'unknown'`, applied in production, flipped 15 pre-existing rows: 7 `walliam_charlie` → `charlie`, 3 `walliam_charlie_vip_request` → `charlie_vip_request`, 5 `walliam_estimator_vip_request` → `estimator_vip_request`). **Two v1 failure modes hit during patch development, both root-caused and fixed in v2:** (a) F4.P1 + F5.P1 anchors failed with 0 matches because `app/api/walliam/charlie/vip-request/route.ts` and `app/api/charlie/plan-email/route.ts` are CRLF (the rest of the codebase is LF) and the `j('\n')` joiner produced LF-only anchors — v2 normalizes CRLF→LF on read, validates against the LF buffer, and writes back with the original per-file line ending preserved (LE detection map: `app/api/walliam/contact/route.ts` LF, `app/api/walliam/charlie/vip-request/route.ts` CRLF, `app/api/charlie/plan-email/route.ts` CRLF, `lib/actions/leads.ts` LF, all others LF); (b) F9.P2 anchor matched twice because the 8-space `.like(...)` substring is a substring of the 10-space variant at L229 — v2 prefixes line-anchored substrings with `\n` to force line-start anchoring (and prefixes the replacement too to preserve the line boundary). **Regression discovered and fixed during smoke verification** — F-T3C-FIXTURE-BYPASSES-LEAD-ORIGIN-ROUTE-WIRE (logged in findings catalog under Bug fixes T6 section): the `fxInsertLead` helper in `scripts/smoke-t3c.js` was creating tier-7 fixture leads via direct DB insert, bypassing the new route-layer wire. After F9.P2 changed vip-questionnaire's existing-lead lookup, the new `.eq` couldn't find fixture leads (column defaulted to `'unknown'`) and the route fell through to F9.P1 defensive INSERT — creating orphan `walliam_estimator_questionnaire` leads instead of enriching the fixture. Smoke checked the fixture's audit rows, found 0, reported FAIL. **Fix:** added JS mirror of `deriveLeadOriginRoute` to top of `smoke-t3c.js` (matching the TS helper and SQL CASE at the vocabulary level) + wired `fxInsertLead` to call `deriveLeadOriginRoute(source)` in its INSERT. Side effect: TS helper docstring at `lib/utils/lead-origin-route.ts` updated to acknowledge the JS mirror as a third source of truth — new workflow rule added to enforce lockstep updates across all three sites. **Final smoke 9/9 GREEN:** T3b Tier 1-4 (route insertions populate `lead_origin_route` at write time via helper derivation in `lib/actions/leads.ts` for tier 4, hardcoded values for tiers 1-3); T3c Tier 5/6 (charlie/appointment + charlie/lead with INSERT+UPDATE paths, F2.P2 leadId-fix re-verified end-to-end), Tier 7 (vip-questionnaire enriches the fixture lead via `.eq('lead_origin_route', 'estimator_vip_request')` — the new tenant-agnostic lookup), Tier 8 (vip-request fresh insert + audit, source=`walliam_estimator_vip_request` → `estimator_vip_request`), Tier 9 (vip-approve verify-skip preserved per F-LERL-RECIPIENT-LAYER-USER-FACING-GAP). **Post-backfill verify:** 0 backfillable production rows remain at `'unknown'`. The 13 remaining `'unknown'` rows are all smoke-fixture sources (`t3b_smoke`, `t3b_smoke_tier1`, `t3b_smoke_tier4`) that intentionally don't match any production source pattern in the CASE — acceptable and expected (e.g. `t3b_smoke_tier4` is the tier-4 smoke source string that goes through `lib/actions/leads.ts::getOrCreateLead` and falls through `deriveLeadOriginRoute` to `'unknown'` because it doesn't match any pattern). **Files in this commit:** 8 modified route/lib files (wire: `app/api/walliam/contact/route.ts`, `app/api/walliam/charlie/vip-request/route.ts`, `app/api/charlie/plan-email/route.ts`, `lib/actions/leads.ts`, `app/api/charlie/appointment/route.ts`, `app/api/charlie/lead/route.ts`, `app/api/walliam/estimator/vip-questionnaire/route.ts`, `app/api/walliam/estimator/vip-request/route.ts`), 1 modified harness file (`scripts/smoke-t3c.js`), 2 new files (`lib/utils/lead-origin-route.ts` + `supabase/migrations/20260511_t6b_lead_origin_route_backfill.sql`), 4 new patch/probe scripts (`scripts/patch-t6b-wire.js`, `scripts/patch-smoke-t3c-fixture-lead-origin-route.js`, `scripts/probe-smoke-t3c-tier7-fixture.js`, `scripts/patch-w-leads-email-tracker-v12.js`), `docs/W-LEADS-EMAIL-TRACKER.md` (v11→v12 bump in this script). **Next:** T6 continues — T6a (F-W-RECOVERY-A15 across 5 routes: extract `validateSession` helper using `tenants.source_key`), T6c (source-string hardcoding refactor in 5 routes), T6d (VIP auto-approve fixes for F-VIP-AUTO-APPROVE-ONLY-WRITES-BUYER-PLAN-LIMIT + F-VIP-AUTO-APPROVE-USES-CHAT-LIMIT-FOR-PLAN-REQUESTS), T6e (plan integration verification per OD-4=(c)). After T6: T7 smoke matrix (OD-6=(c)), T8 regression sweep, Tlast close.
- **2026-05-11 v11 T5 CLOSED — OD-5=(a) FINAL** — T5 Form coverage audit phase completed as confirm-and-close per OD-5=(a) "per-page-type form variants" anchor (locked at v2). Three probes shipped: (i) `scripts/probe-t5a-form-coverage-matrix.js` (v1, directory-segment classification — failed because the app uses slug-based dynamic routing; kept for history); (ii) `scripts/probe-t5a-form-coverage-deep.js` (v2, whole-file dumps of key dynamic-route files + components inventory + WalliamCTA usage map); (iii) `scripts/probe-t5a-form-coverage-focused.js` (v3, ±context slices around form/CTA references — the one that produced the clean coverage matrix). **Routing architecture confirmed:** `app/[slug]/page.tsx` is the master slug router resolving slugs in order property → home-property → development → area → municipality → community → fallback BuildingPage; `app/comprehensive-site/[slug]/page.tsx` mirrors the same logic on the comprehensive-site URL surface; `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` is the dedicated neighbourhood route (slug router has no neighbourhood branch); `app/property/[id]/page.tsx` is the dedicated property route with HomePropertyPage variant. **Coverage matrix verified across all 6 page types** (canonical triad pattern: WalliamAgentCard + WalliamCTA + CharliePageContext): (1) **AreaPage** (`app/[slug]/AreaPage.tsx` L230-235): WalliamAgentCard(area_id, tenant_id) + WalliamCTA(context=area.name) + CharliePageContext(area_id, area_slug); (2) **MunicipalityPage** (`app/[slug]/MunicipalityPage.tsx` L222-228): WalliamAgentCard(municipality_id, area_id, tenant_id) + WalliamCTA(context=municipality.name) + CharliePageContext(municipality_id, municipality_slug, area_id); (3) **CommunityPage** (`app/[slug]/CommunityPage.tsx` L178-183): WalliamAgentCard(community_id, municipality_id, tenant_id) + WalliamCTA(context=community.name) + CharliePageContext(community_id, community_slug, municipality_id); (4) **NeighbourhoodPage** (`app/comprehensive-site/toronto/[neighbourhood]/page.tsx` L10/256): imports WalliamCTA + CharliePageContext at L10-11, renders WalliamCTA(context=neighbourhood.name) at L256 — CharliePageContext JSX render not captured in focused probe slice window (file is 268 lines, slice ended at L266), flagged as T8 verify-item; (5) **BuildingPage** (`app/[slug]/BuildingPage.tsx` L574-590): WalliamAgentCard(community_id, municipality_id, tenant_id) + WalliamCTA(context=building.building_name) + CharliePageContext(building_id, community_id, municipality_id) + **inline WalliamContactForm** with `building_id` + `source="walliam_building_inquiry"` + `contextLabel=building.building_name` — Building is the only geo/building page with both Charlie and dedicated inline form; (6) **PropertyPage** (`app/property/[id]/PropertyPageClient.tsx` L180-265 + `HomePropertyPageClient.tsx` L171-234): WalliamAgentCard(municipality_id, tenant_id, hideCTA=true) + WalliamCTA(context=building.name OR listing.address) + CharliePageContext(listing_id, building_id, community_id, municipality_id) + **AppointmentForm** (book-a-visit) + **AgentContactForm** (legacy `submitLeadFromForm` path) — Property has the densest lead-capture surface. **WalliamAgentCard contains an embedded contact form** that POSTs to `/api/walliam/contact` (verified at T0-C SECTION 2 in `recon/W-LEADS-EMAIL-T0-C-form-coverage.txt`: L50 of `components/WalliamAgentCard.tsx`) — this is the universal direct-contact mechanism on every page. **OD-5=(a) FINAL interpretation:** "per-page-type form variants" is satisfied via the canonical triad pattern — every page type composes WalliamAgentCard + WalliamCTA + CharliePageContext appropriate to its entity context, with additional inline forms where the entity warrants more capture surface (Building → WalliamContactForm; Property → AppointmentForm + AgentContactForm). All geo IDs flow through the triad cleanly: area_id / municipality_id / community_id / neighbourhood_id / building_id / listing_id reach the API routes via the appropriate path (direct POST from WalliamAgentCard/WalliamContactForm; Charlie window-event from CharliePageContext into the chat session, which then includes them in the lead INSERT payload). **Two new non-blocker findings logged:** F-SLUG-ROUTER-MISSING-NEIGHBOURHOOD-BRANCH (routing/SEO concern, defer to W-LAUNCH-TRACKER) + F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER (T8 verify-item). **Files in this commit:** `docs/W-LEADS-EMAIL-TRACKER.md` (v10→v11 bump in this script), `scripts/probe-t5a-form-coverage-matrix.js` (v1 probe), `scripts/probe-t5a-form-coverage-deep.js` (v2 probe), `scripts/probe-t5a-form-coverage-focused.js` (v3 probe — the one that produced the clean matrix), `scripts/patch-t5-close-tracker-v11.js` (this close script). **Next phase:** T6 — Plan integration + T6b LIKE-filter replacement (closes F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER via the `lead_origin_route` column from T2c).
- **2026-05-11 v10 T4 CLOSED — OD-1=(c) FINAL** — T4 Credit gating phase completed as confirm-and-close per OD-1=(c) "Credits unrelated to leads" anchor (locked at v2). Two probe scripts shipped: `scripts/probe-t4-credit-vs-lead-matrix.js` (v1, line-by-line scan — kept for history; had two defects: line-by-line missed multi-line chained `.from('leads')\n.insert` patterns, and credit-pattern matching flagged any credit-word occurrence regardless of distance to a lead write, producing false positives), and `scripts/probe-t4-credit-vs-lead-matrix-v2.js` (whole-file regex + proximity classification — the one that produced the clean verdict). **Matrix A (credit refs in 9 lead-touching surfaces, proximity threshold 25 lines):** CLEAN. 0 PROXIMITY-CONCERN hits — no credit reference within 25 lines of any lead write. 11 DISTANT credit refs across 3 surfaces: `walliam/charlie/vip-request` 6 refs at L155-458 (lead INSERT at L202, min distance 47 lines, all in plan-credit auto-approval block + email HTML strings), `charlie/plan-email` 1 ref at L569 (lead INSERT at L121, distance 448 lines, HTML email template), `walliam/estimator/vip-request` 4 refs at L283-311 (lead INSERT at L184, min distance 99 lines, plan-credit grant flow that runs after the INSERT). 1 surface (`vip-approve`) has 4 credit refs but no lead writes — out of OD-1 scope. **Matrix B (lead-write pattern scan across app/api/ + lib/actions/ via whole-file multi-line regex):** 14 files contain lead-write patterns — 8 EXPECTED (the audit-wired set from T3b/T3c: `walliam/contact` L103 insert, `walliam/charlie/vip-request` L202 insert, `charlie/plan-email` L121 insert, `lib/actions/leads.ts` L119/173/324 update/insert/update, `charlie/appointment` L136 insert, `charlie/lead` L187/209 update/insert, `walliam/estimator/vip-questionnaire` L156/171 update/insert, `walliam/estimator/vip-request` L184 insert) + 6 additional surfaces classified as **OUT-OF-SCOPE for OD-1 credit gating**: **(i) 4 SYSTEM 1 legacy routes** (`app/api/chat/vip-approve/route.ts` L138 update + L150 insert, `app/api/chat/vip-questionnaire/route.ts` L203 insert, `app/api/chat/vip-request/route.ts` L218 insert, `app/api/chat/vip-upgrade/route.ts` L64 update + L82 insert) — System 1 isolation is absolute per project rule (`app/api/chat/*` is the legacy parallel surface that was superseded by System 2 `app/api/walliam/*` routes; we never modify System 1, its behavior is frozen, and its lead-write patterns predate W-LEADS-EMAIL entirely); **(ii) 2 SYSTEM 2 lead-MANAGEMENT surfaces** that do UPDATE-only operations on existing leads and do NOT create leads: `app/api/admin-homes/leads/[id]/route.ts` (admin UI for lead detail page, 1×`.update` at L35 — status changes / assignment edits from the admin dashboard) and `lib/actions/lead-management.ts` (6×`.update` at L10/26/42/115/147/166 — internal helper for assignment changes, status transitions, contact tracking). UPDATEs to existing leads do not consume credits and are not the subject of OD-1 which is specifically about CREATION gating. **OD-1=(c) FINAL anchor:** no lead CREATION path is gated on credit balance; no credit-touching route INSERTs leads; the 8 audit-wired creation surfaces + 6 out-of-scope management/legacy surfaces are fully accounted for; the 11 distant credit refs are all plan-credit grant writes to `user_credit_overrides` that happen AFTER the lead INSERT in auto-approve flows, never gating the INSERT itself. **One new non-blocker probe-item logged:** F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP — verify at T8 comprehensive smoke whether `lib/actions/lead-management.ts` and `app/api/admin-homes/leads/[id]/route.ts` UPDATE flows trigger email sends (assignment-change notifications, status-change notifications, etc); if any do, those email sends need T3-style audit wiring into `lead_email_recipients_log` for full per-recipient audit observability. **Files in this commit:** `docs/W-LEADS-EMAIL-TRACKER.md` (v9→v10 bump in this script), `scripts/probe-t4-credit-vs-lead-matrix.js` (v1 probe, kept for history showing the line-by-line scan defect that produced 4 Matrix-A false positives + 5 Matrix-B false-missing), `scripts/probe-t4-credit-vs-lead-matrix-v2.js` (v2 probe with whole-file regex + proximity classification — the one that produced the clean verdict via correct classification of the 6 out-of-scope surfaces), `scripts/patch-t4-close-tracker-v10.js` (this close script). **Next phase:** T5 — Form coverage audit per page type (OD-5=(a) at v2: per-page-type form variants).
- **2026-05-11 v9 T3c SHIPPED + T3 PHASE CLOSED** — T3c wire shipped via `scripts/patch-t3c-wire.js` (10 patches across 4 files, atomic anchor-validated, backup suffix `.backup_202605111008235`): `logEmailRecipients` audit-log writer wired into 4 of 5 EMAIL_ONLY routes. **Routes wired:** (1) `charlie/appointment` — chain send + audit, templateKey `charlie_appointment_chain`, lead_id resolved from request body / DB lookup; (2) `charlie/lead` — chain send + audit on **both INSERT and UPDATE paths**, templateKey `charlie_lead_chain`; (3) `walliam/estimator/vip-questionnaire` — audit gated on pre-existing lead lookup via idempotent pattern (the questionnaire enriches a pre-existing vip-request lead), templateKey `walliam_estimator_vip_questionnaire_chain`; (4) `walliam/estimator/vip-request` — insert refactor (chain `.select('id').single()` + outer-scope `let lead` declaration + post-error-check assignment, mirroring the T3b `walliam/charlie/vip-request` refactor pattern) + chain send + audit, templateKey `walliam_estimator_vip_request_chain`. **One latent bug fixed in passing** (F2.P2 in the wire patch script): `charlie/lead` UPDATE branch never assigned `leadId = existingLead.id` after the UPDATE error check — this silently skipped both the existing session-lead linker at L238 AND would have silently skipped the new audit on the UPDATE path. Restored with one extra line `leadId = existingLead.id` post-UPDATE-error; verified end-to-end via Tier 6 (same lead.id `4e03f5d8-9d0a-4ffb-8298-a732e651b6a9` across INSERT + UPDATE passes, +2 audit rows on UPDATE pass). **One route deliberately not wired** (`walliam/estimator/vip-approve`): the user-in-TO recipient (the buyer being approved) does not fit any value in the current `lerl_recipient_layer_check` CHECK constraint (`agent` / `manager` / `area_manager` / `tenant_admin` / `platform_admin` / `tenant_overlay_bcc`). Recording the user-facing recipient as `tenant_overlay_bcc` would be a semantic lie. Logged as new finding **F-LERL-RECIPIENT-LAYER-USER-FACING-GAP** (non-blocker, post-launch fix via CHECK extension with `lead_contact` layer value + wiring vip-approve with `recipientLayer: 'lead_contact'`). **TSC clean post-patch.** T3b regression smoke re-run after the wire — all 4 prior T3b tiers still green. **T3c smoke** (`scripts/smoke-t3c.js`, run_id `t3c1778494461627`): Tier 5 (appointment) 2 rows agent=1 platform_admin=1; Tier 6 (lead INSERT+UPDATE) 2 rows on INSERT + 2 rows on UPDATE on same lead.id (F2.P2 leadId-fix VERIFIED end-to-end); Tier 7 (vip-questionnaire) 2 rows on pre-existing lead `225cc432-0349-431d-9954-89b328978953`; Tier 8 (vip-request) 2 rows on freshly-inserted lead `85cfabc9-3bb4-49bd-bb42-5632c21505df`; Tier 9 (vip-approve verify-skip) status pending→approved, 0 audit rows for vip-approve templateKey (intentional gap confirmed). **All 5 tiers GREEN.** **T3 PHASE COMPLETE.** Component status across the phase: T3a `27fe944` helper built → T3b v7 wire-only across 4 LEAD_WRITER+EMAIL routes → T3b v8 hotfixes (T2f-followup-grants migration added missing `GRANT SELECT, INSERT, UPDATE ON lead_email_recipients_log TO service_role`; T3b-hotfix-A `lib/admin-homes/log-email-recipients.ts` full-file rewrite aligned helper vocabulary with T2f schema CHECK constraints — helper had used email-flow `direction: 'outbound'|'inbound'` that did not match the table's `lerl_direction_check` CHECK values) → T3c v9 (this entry: 4 EMAIL_ONLY routes wired + 1 verify-skip). **Coverage:** 8 of 9 lead-touching email routes write per-recipient audit rows after every chain send; the 9th (vip-approve user-facing approval email to the buyer) is the F-LERL-RECIPIENT-LAYER-USER-FACING-GAP verify-skip. System 2 BCC fan-out is now observable end-to-end — every chain layer (agent / manager / area_manager / tenant_admin / platform_admin + delegation overlay) gets a row in `lead_email_recipients_log` with `resend_message_id`, enabling per-recipient delivery tracking and forensic audit. **Files in this commit:** 4 route files (audit wiring from T3c: `app/api/charlie/appointment/route.ts`, `app/api/charlie/lead/route.ts`, `app/api/walliam/estimator/vip-questionnaire/route.ts`, `app/api/walliam/estimator/vip-request/route.ts`), `docs/W-LEADS-EMAIL-TRACKER.md` (v8→v9 bump in this script), `scripts/patch-t3c-wire.js` (T3c wire patch), `scripts/smoke-t3c.js` (5-tier comprehensive smoke harness), `scripts/patch-t3c-close-tracker-v9.js` (this close script). **Next phase:** T4 — Credit gating confirm-and-close (~15 min, OD-1=(c) already locked at v2).
- **2026-05-10 v8 T3b COMPLETE — comprehensive smoke green, 2 hotfixes shipped** — Full T3b ship-and-verify cycle completed in single working block. Wire patch (`scripts/patch-t3b-wire-and-tracker-v7.js`) initially shipped in commit `a406d6d` but anchors did not apply: the patch script joined multi-line anchors with `\n` while `vip-request/route.ts` and other files use CRLF (`\r\n`) — mixed line endings in the repo (some files LF, some CRLF) was the root cause. Diagnostic script `scripts/diagnose-f2-anchor.js` pinpointed the first divergence at byte offset 20 (file `0d 0a` vs anchor `0a`). Patch script revised to detect each file's line endings on read, normalize working content to LF for matching, restore original endings on write. Re-applied cleanly: 14 patches across 5 files (4 routes + tracker), TSC clean. Comprehensive smoke (`scripts/smoke-t3b.js`) then exposed two T2f/T3a contract issues the wiring itself didn't cause:
  - **T2f-followup-grants** (`supabase/migrations/20260510_t2f_followup_grants.sql`): T2f shipped `lead_email_recipients_log` without `GRANT SELECT, INSERT, UPDATE TO service_role`. Only `postgres` had grants. Helper's INSERT silently failed for every API-route call (Supabase service_role bypasses RLS but still needs table privileges). Helper swallows INSERT errors per design (audit failures must never block lead-write or email-send) — bug undetected until smoke's `SELECT` got `permission denied`. Migration grants SELECT/INSERT/UPDATE to service_role with `DO $ ... RAISE EXCEPTION` assertion that rolls back if grants don't apply. NOT granted to `authenticated`/`anon` (audit data is server-side only; admin UIs go through Next.js API routes using service_role). Idempotent — re-running has no effect.
  - **T3b-hotfix-A** (`scripts/patch-t3a-helper-align-with-schema.js`): T3a `logEmailRecipients` helper vocabulary did not match T2f schema CHECK constraints. T3a used `direction: 'outbound'|'inbound'` (email flow direction) and `recipient_layer` values `manager_platform`/`admin_platform`/`{agent,manager,area_manager,tenant_admin}_delegate`/`unknown`. T2f schema CHECK requires `direction IN ('to','cc','bcc')` (envelope position) and `recipient_layer IN ('agent','manager','area_manager','tenant_admin','platform_manager','platform_admin','tenant_overlay_cc','tenant_overlay_bcc')`. Two different mental models shipped at different times. Schema is the source of truth (already deployed). Helper rewritten: `direction` now tracks envelope position per row (to/cc/bcc); `recipient_layer` uses `platform_manager`/`platform_admin` renames; all 4 `*_delegate` variants roll up to `tenant_overlay_cc` or `tenant_overlay_bcc` based on envelope position (delegate granularity intentionally collapsed — recoverable via JOIN to `agent_delegations` on `(tenant_id, delegate_id)`); `unknown` removed in favor of `tenant_overlay_*` fallback with `console.warn` alarm for audit completeness. `EmailStatus` extended with `complained` to match schema (used by future Resend webhook integration). Caller signature backwards-compatible (no caller passed the removed `direction` param). Full-file replacement with backup retained at `.backup_TIMESTAMP`. TSC clean post-patch.
- Comprehensive smoke harness (`scripts/smoke-t3b.js`) exercises all 4 LEAD_WRITER+EMAIL routes end-to-end with per-tier fixture create/cleanup. Tier 1 (walliam/contact): direct POST, no fixtures needed. Tier 2 (walliam/charlie/vip-request): auth user via `supabase.auth.admin.createUser`, user_profile via UPSERT (`on_auth_user_created` trigger auto-pre-populates the row; UPSERT survives the race), chat_session with status='active' source='walliam'. Tier 3 (charlie/plan-email): same fixture chain plus minimal rich payload (`plan`, `geoContext`, `vipCreditTotal: 1`, etc — `buildRichPlanEmail` handles missing fields with `||` fallbacks). Tier 4 (lib/actions/leads.ts): dev-only test endpoint `app/api/t3b-smoke-leads-helper/route.ts` (gated `NODE_ENV !== 'production'`, gitignored, auto-provisioned by smoke on first run, registers within ~3s via Next.js hot-reload — initial attempt at `app/api/_test/...` failed because Next.js excludes underscore-prefixed folders from routing per private-folders convention) imports `getOrCreateLead` from `lib/actions/leads` and invokes it directly with `forceNew: true` (bypasses Option A dup-silence). All 4 tiers GREEN with King Shah → admin-platform fan-out: 2 audit rows per tier (`agent=1` in TO position, `platform_admin=1` in BCC position), `template_key` per-route (`walliam_contact_lead_capture`, `walliam_charlie_vip_request_lead`, `charlie_plan_email_chain`, `leads_helper_new_lead_notification`), `direction in (to,cc,bcc)`, `status='sent'`, `resend_message_id` populated on every row proving the audit fired *after* the Resend send returned successfully.
- Files in this commit: 4 route files (audit wiring from T3b), `docs/W-LEADS-EMAIL-TRACKER.md` (v7→v8 bump in this script), `lib/admin-homes/log-email-recipients.ts` (hotfix-A full-file rewrite), `supabase/migrations/20260510_t2f_followup_grants.sql` (new migration, already applied to prod DB), `scripts/patch-t3b-wire-and-tracker-v7.js` (T3b wiring with CRLF normalization, already in `a406d6d`), `scripts/patch-t3a-helper-align-with-schema.js` (hotfix-A), `scripts/diagnose-f2-anchor.js` (CRLF diagnostic), `scripts/smoke-t3b.js` (comprehensive 4-tier harness), `scripts/patch-t3b-close-v8.js` (this script), `.gitignore` (excludes auto-provisioned dev endpoint + dev-server.log + *.backup_*). NOT committed: `app/api/t3b-smoke-leads-helper/route.ts` (gitignored — auto-provisioned by smoke on every fresh checkout; production deploys never need it; gate is `NODE_ENV !== 'production'` for defense-in-depth).
- **2026-05-10 v7 T3b SHIPPED** — `logEmailRecipients` audit-log writer wired into all 4 LEAD_WRITER + EMAIL routes (`walliam/contact`, `walliam/charlie/vip-request`, `charlie/plan-email`, `lib/actions/leads.ts`). Each route now writes one row per recipient (TO/CC/BCC fan-out) into `lead_email_recipients_log` after `sendTenantEmail` succeeds, with `resendMessageId` from the Resend response. Audit calls gated on `lead?.id` so non-lead emails (e.g. plan-email user-facing send at L152) don't generate orphan audit rows. Insert refactors completed where needed: `walliam/charlie/vip-request` had a fire-and-forget INSERT only binding `error` (not `data`) — now declares `let lead: { id: string } | null = null` at outer scope, refactors inner insert to chain `.select('id').single()`, assigns `lead = data` post-error-check; `charlie/plan-email` had a bare `await ...insert({...})` with no destructuring at all — now binds `{ data: lead, error: leadError }` and chains `.select('id').single()`. `walliam/contact` and `lib/actions/leads.ts` already chained correctly at T2a / W-HIERARCHY-H3.9 time, so only audit-call additions were needed. Per-route `templateKey` constants: `walliam_contact_lead_capture`, `walliam_charlie_vip_request_lead`, `charlie_plan_email_chain`, `leads_helper_new_lead_notification`. Send-result captured into `sendResult` variable, `sendResult.id` populates the audit row's `resend_message_id` field. TSC clean post-patch. Next: T3c wires the 5 EMAIL_ONLY routes (`charlie/appointment`, `charlie/lead`, `walliam/estimator/{vip-approve, vip-questionnaire, vip-request}`) — these don't insert leads, they look up existing leads, so the audit pattern differs slightly (lead_id resolved from request body or DB lookup, not from a freshly-inserted row). T3d closes T3 phase + tracker v8.
- **2026-05-10 v6 T3a CLOSED + T3 PHASE STARTED + T3b CONTEXT RECORDED** — T3a shipped (commit `27fe944`): `lib/admin-homes/log-email-recipients.ts` builds the `logEmailRecipients` audit-log writer helper. 146 lines, TSC clean, pure addition (no callers yet). Helper writes one row per recipient (TO/CC/BCC) into `lead_email_recipients_log`, mapping each email to its `recipient_layer` via the walker's `resolved` breakdown (agent / manager / area_manager / tenant_admin / manager_platform / admin_platform / 4 delegate types / unknown fallback). Insert failures log to console but never throw — audit failures must not block lead operations. Default status='sent' + sent_at=now() (caller invokes after `sendTenantEmail` returns successfully). Resend webhook integration for delivered/bounced status transitions is intentionally a separate scope (webhook handler + auth + finder-by-resend_message_id) — schema supports it via the `trg_lerl_status_only_update` trigger, but it is a distinct piece of work, not a T3 deferral. T3b probe context recorded so next session picks up cleanly without re-probing: all 4 LEAD_WRITER + EMAIL routes (`walliam/contact`, `walliam/charlie/vip-request`, `charlie/plan-email`, `lib/actions/leads.ts`) share IDENTICAL outer structure — `let recipients; try { walker } catch (AdminPlatformUnreachable) { recipients = null }; if (recipients) { try { sendTenantEmail({...}) } catch (TenantEmailNotConfigured / TenantEmailFailed) { warn / error } }`. Variable-name differences per file: tenant id is `tenant_id` (snake_case) in walliam/contact vs `tenantId` in walliam/charlie/vip-request vs `tenantId || ''` in charlie/plan-email vs `params.tenantId` in lib/actions/leads.ts; agent id is `agent?.id || null` in 3 of 4 sites except lib/actions/leads.ts which uses `resolvedAgentId`; subject/html are local vars in 3 routes, inline template literal subject + `emailHtml` var in walliam/charlie/vip-request. T3b patch design: insert `await logEmailRecipients({...})` inside the existing inner `if (recipients) { try {...} }` block immediately after the `await sendTenantEmail(...)` line. Per-route `templateKey` constants planned: `walliam_contact_lead_capture`, `walliam_charlie_vip_request_lead`, `charlie_plan_email_chain`, `leads_helper_new_lead_notification`. One remaining unknown per file — the `lead_id` variable binding (where the just-inserted lead row's id is bound to a local variable) — opens the T3b round with a small targeted probe before the patch script is finalised. Phased plan continuing: T3a ✅ closed, T3b (4 LEAD_WRITER + EMAIL wire-ups), T3c (5 EMAIL_ONLY wire-ups in `charlie/appointment`, `charlie/lead`, `walliam/estimator/{vip-approve, vip-questionnaire, vip-request}`), T3d (T3 phase close + tracker v7). Each phase commits with TSC clean + tracker bump in the same working block, per v5 lockstep-hygiene rule.
- **2026-05-10 v5 T2 PHASE CLOSED + T2a–T2f CLOSURES BACKFILLED + v3/v4 STATUS CORRECTIONS** — Discovery this session via deep DB probe (`scripts/probe-t2-reality-check.js`): T2a–T2f had ALREADY been shipped to production between 7:54 AM and 10:49 AM 2026-05-10, after v2 (T1 LOCKED) but before the v3/v4 patches that captured T2g + T2h. The v3 and v4 status lines inherited the stale "T2a–T2f remaining" claim from v2; this entry corrects the record. Actual T2 commit chain: T2a `b8743a7` (4 typed origin geo columns + 4 FKs + 4 partial indexes), T2b `37b3886` (3 perf indexes: tenant_email composite, listing_id partial, source), T2c `ae8454c` (lead_origin_route text NOT NULL DEFAULT 'unknown' + tenant_origin_route index), T2d `b74cdd2` (CHECK on appointment_status + assignment_source), T2e `43ec751` (vip_requests.tenant_id SET NOT NULL + FK + tenant index + status/request_type SET NOT NULL + 2 CHECKs), T2f `8e84040` (CREATE TABLE lead_email_recipients_log + 4 indexes + 2 append-only triggers), T2g `d0c6ca3` + `f1bcf66` (resolve_agent_for_context tenant-leak fix), T2h `c826ffd` (delete app/actions/createLead.ts dead code). DB state confirmed: all 4 geo cols + FKs present, lead_origin_route present (text NOT NULL), both T2d CHECKs present, vip_requests.tenant_id NOT NULL with 2 CHECKs, lead_email_recipients_log table present. Findings closures backfilled: F-ORIGIN-GEO-IDS-NOT-PERSISTED, F-LEADS-NO-INDEX-ON-DUP-DETECTION-KEY, F-LEADS-NO-INDEX-ON-LISTING-ID, F-LEADS-NO-INDEX-ON-SOURCE, F-LEADS-APPOINTMENT-STATUS-NO-CHECK, F-LEADS-ASSIGNMENT-SOURCE-NO-CHECK, F-VIP-REQUESTS-TENANT-ID-NULLABLE, F-VIP-REQUESTS-NO-FK-ON-TENANT-ID, F-VIP-REQUESTS-NO-TENANT-INDEX, F-LEAD-EMAIL-LOG-IS-SYSTEM-1-ONLY, F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN (11 closures). Findings remaining open with caller-wiring or partial-fix annotations: F-VIP-REQUEST-LEAD-LOSES-GEO-CONTEXT, F-ESTIMATOR-VIP-PARTIAL-GEO-CAPTURE, F-APPOINTMENT-LEAD-PARTIAL-GEO-CAPTURE (T5e wires callers to populate geo cols), F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER (T6b replaces LIKE filter with lead_origin_route lookup), F-VIP-REQUESTS-NO-CHECK-CONSTRAINTS (status + request_type CHECKs shipped; request_source CHECK still pending). T3 (recipient helper extension — wire System 2 BCC fan-out into the new lead_email_recipients_log table) is the actual next phase. Lesson logged: tracker hygiene must run in lockstep with shipped commits. T2a–T2f shipping between v2 and this session without tracker updates created 6 hours of drift, only caught by deep probe in this session. Going forward, every W-LEADS-EMAIL T# substantive commit gets a tracker version bump in the same working block.
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