# W-FUNNEL-VERIFICATION — End-to-End Funnel Test Tracker

**Status:** ACTIVE
**Created:** 2026-06-03
**Owner:** Shah
**Scope:** Full end-to-end verification of the lead funnel — the backbone of the platform. Lead capture → routing → email delivery → links → landing pages → dashboard → multi-tenant isolation → AI systems. Run on BOTH tenants (WALLiam + Aily).

**Why this exists:** Funnel bugs have been surfacing one at a time during ad-hoc testing (geo counts, email tenant-domain links, stored-copy links). This tracker converts the reactive bug-hunt into a systematic pass so remaining gaps surface together — the bar required before launch / investor conversations. The storefront is solid; this verifies the *revenue funnel*.

**Testing philosophy (per CLAUDE.md):** Code-only testing preferred (Node + pg scripts, static analysis) before browser smoke. Sections 1, 2, 7, 8 are largely code-testable; 3, 4, 5, 6 need live email + browser confirmation. SAVEPOINT-isolated for any DB-touching verification; never mutate production state in smoke runs.

---

## Verified context (this session, do not re-litigate)

- **Email + lead-copy links → tenant domain: FIXED + VERIFIED.** `buildBaseUrl(tenant.domain)` precedence flipped (commit `cbe86bb`); URLs composed at render time. DB scan: 0 `condoleads.ca` across 42 plan_data / 22 appointment_properties / 184 source_url rows. Stored data is relative slugs only — no backfill needed. Email AND stored-lead-copy links both resolve to tenant domain via the single chokepoint.
- **Geo counts (Active + Closed): FIXED.** `countDirect` routed through Supabase transaction pooler (commit `d57c8e5`) — 200-client ceiling vs session pooler's 15. Both EMAXCONNSESSION and pool-wait-timeout eliminated under concurrency.
- **Chip slugs + neighbourhood redirect: FIXED** (commit `1f4fa08`).

---

## Section 1 — Lead capture → DB (CODE-TESTABLE)

For each lead type: lead row created, correct `tenant_id`, correct `assigned_agent_id`, `lead_origin_route` set, tenant-scoped.

| # | Lead type | WALLiam | Aily | Notes |
|---|-----------|---------|------|-------|
| 1.1 | Buyer plan | ✅ | ☐ | WALLiam: 40 rows all tenant-scoped, agent + route set. Aily: 0 rows (no traffic yet) — revisit post-Aily-live |
| 1.2 | Seller plan | ✅ | ☐ | WALLiam: 2 rows, all clean. Aily: 0 rows |
| 1.3 | Charlie chat lead | ✅ | ☐ | WALLiam: 22 rows, all clean. Aily: 0 rows |
| 1.4 | Estimator VIP request | ✅ | ☐ | WALLiam: 68 rows, all clean. Aily: 0 rows |
| 1.5 | Appointment booking | ✅ | ☐ | WALLiam: 22 rows, all clean. Aily: 0 rows |
| 1.6 | Contact form | ✅ | ☐ | WALLiam: 7 rows, all clean. Aily: 0 rows |

---

## Section 2 — Routing / hierarchy (CODE-TESTABLE)

| # | Check | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 2.1 | Lead routes to correct agent per territory (geo/building) | ✅ | ☐ | WALLiam: 3/3 primary-apa probes resolved to correct-tenant agents via `resolve_agent_for_context`. Aily: 0 active+primary apa rows — revisit post-Aily-setup |
| 2.2 | Hierarchy escalation fires where expected | ✅ | ✅ | WALLiam chain: agent → tenant_admin. Aily chain: manager → tenant_admin |
| 2.3 | No cross-tenant assignment | ✅ | ✅ | apa scan: 0 rows where apa.tenant_id ≠ agent.tenant_id |

---

## Section 3 — Email delivery (6-layer chain) (LIVE EMAIL)

| # | Email | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 3.1 | Buyer plan email sends + arrives | ✅ | ◐ blocked-external | WALLiam: live HTTP 200 + userSent=true delivered + chainSent=true delivered + lead.lead_email_delivery_status=`sent`. Aily: `'not_configured'` (resend_verification_status=null) — F-AILY-RESEND-VERIFICATION-NULL |
| 3.2 | Seller plan email sends + arrives | ✅ | ◐ blocked-external | WALLiam: live HTTP 200 + userSent=true delivered + chainSent=true delivered + lead status=`sent`. Aily: blocked-external (same null verification) |
| 3.3 | Lead notification to agent arrives | ✅ | ◐ blocked-external | WALLiam: live HTTP 200; UPSERT into existing plan-email lead — same lead status=`sent`. Aily: blocked-external |
| 3.4 | Appointment confirmation arrives | ✅ | ◐ blocked-external | WALLiam: live HTTP 200 + userSent=true delivered + chainSent=true delivered + lead status=`sent`. Aily: blocked-external |
| 3.5 | Estimator VIP request → agent email | ✅ | ◐ blocked-external | WALLiam: live HTTP 200, chainSent=true delivered (userEmailSent=false `not_attempted` is correct — request phase does not send the user a confirmation; that fires on §3.6 approve). Aily: blocked-external |
| 3.6 | VIP approve → user approval email | ✅ | ◐ blocked-external | WALLiam: vip-approve GET 200 + sends user approval email (chained off §3.5's approval_token). Aily: blocked-external |
| 3.7 | BCC / platform-manager copy arrives | ✅ | ◐ blocked-external | F-PLATFORM-MANAGER-TENANTS **CLOSED-VERIFIED**: grant + logging in place. WALLiam: 10 `lead_email_recipients_log` rows captured during live run — chain successful. Aily: blocked at preflight before BCC fan-out |
| 3.8 | No email silently dropped | ✅ | ✅ | F-EMAIL-PREFLIGHT-ACCEPTS-PLACEHOLDER-KEY (commit `6e3c07b`) **+** F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL Phase 1 (`d5fd517`) + Phase 2 (`bdd3be7` migration + `fe96be0` routes/dashboard). Email layer rejects placeholders at preflight; callers propagate `userEmailSent`/`chainEmailSent`; lead row persists chain delivery status; dashboard surfaces "not yet alerted" badge on `'failed'`. Browser-confirm of banner + badge rendering pending live-verify (see Live-verify once below). |

---

## Section 4 — Links in emails (LIVE — confirm fix `cbe86bb`)

| # | Check | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 4.1 | Plan email property links → tenant domain → 200 | ✅ | ✅ | Static-verified: `buildBaseUrl(domain)` threads `https://walliam.ca` (or `https://aily.ca`) into every property `<a href>` + CTA in `buildRichPlanEmail` (lines 294, 315, 505, 544, 572, 651) — same pattern for both tenants since fn is tenant-agnostic |
| 4.2 | Lead/appointment/VIP email links → tenant domain | ✅ | ✅ | Same static-verification across all 5 email-builders: `charlie/lead.ts:388/464`, `charlie/appointment.ts:304/384/421`, `walliam/charlie/vip-request.ts:205`, `walliam/estimator/vip-request.ts:217-219/497`. WALLiam live run additionally exercised this in real Resend deliveries |
| 4.3 | No link → condoleads.ca | ✅ in email | ⚠ public pages | Email-builders use `${baseUrl}` exclusively — no hardcoded condoleads.ca. **BUT**: `/toronto` public page leaks `<link rel=canonical href=https://www.condoleads.ca/toronto-area>` + footer `mailto:condoleads.ca@gmail.com`. Logged as **F-PUBLIC-PAGES-HARDCODED-CONDOLEADS** (P2) |
| 4.4 | No cross-tenant link, no 404 | ✅ | ✅ | Email-builder code is tenant-agnostic; baseUrl input is the single tenant scope. WALLiam live: 5 deliveries with no link errors. No 404 risk because every link is `${baseUrl}/${slug-or-listing-key}` against the tenant's own domain |

---

## Section 5 — Landing pages (link destinations resolve) (BROWSER)

| # | Check | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 5.1 | Property links land on real property pages (200, correct brand) | ◐ | ◐ | Curl `GET /` and `GET /toronto/north-york` return 200; full brand-correctness still needs operator visual click-through on actual property URLs |
| 5.2 | Geo links resolve, counts correct | ✅ | ✅ | Curl `GET /toronto` → 200 (cold-build 56s dev-mode, warm-cache fast). pg-direct fix `d57c8e5` already smoke-green. 39 walliam mentions vs 9 condoleads (canonical+footer leak — F-PUBLIC-PAGES-HARDCODED-CONDOLEADS) |
| 5.3 | Redirects work (/north-york → /toronto/north-york) | ✅ | ✅ | Curl: `GET /north-york` → 308 → followed → 200. Redirect fix `1f4fa08` working |

---

## Section 6 — Dashboard (agent side) (BROWSER)

| # | Check | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 6.1 | Lead appears in agent dashboard, correct tenant | ✅ DB-level | ✅ DB-level | Live §3 WALLiam created 4 leads — all properly tenant-scoped + correct agent_id (King Shah). Live §3 Aily created 3 leads — all properly tenant-scoped to Aily admin. Dashboard SELECT correctness derived from §7 isolation (PASS). Visual click-through still operator-pending |
| 6.2 | Plan data / appointment data renders | ◐ | ◐ | Lead rows have `plan_data` JSONB populated by §3 routes. UI rendering pending operator browser confirmation |
| 6.3 | Brand correct (NOT "CondoLeads") | ☐ | ☐ | **F-DASHBOARD-HARDCODED-CONDOLEADS-BRAND** (logged, OPEN). Browser visual confirmation only |
| 6.4 | "Not yet alerted" badge renders on `lead_email_delivery_status='failed'` | ✅ DB-level | ✅ DB-level | **Code-complete** (commit `fe96be0`) + DB-level verified: §3 Aily run produced 3 leads with `lead_email_delivery_status='failed'` from the actual route's preflight-rejection path (not synthetic UPDATE). Dashboard SELECT against these would surface the badge. Browser pixel-confirmation still operator-pending |

---

## Section 7 — Multi-tenant isolation (Rule Zero) (CODE-TESTABLE)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 7.1 | WALLiam agent sees only WALLiam leads | ✅ | King Shah's 181 leads: 181 same_tenant, 0 other_or_null |
| 7.2 | Aily agent sees only Aily leads | ✅ | Aily admin: 0 leads (no traffic), 0 cross-tenant |
| 7.3 | No data / email / link bleeds across tenants | ✅ | leads scan: 0 rows where agent.tenant_id ≠ lead.tenant_id. **Latent risk**: no FK/CHECK enforces this — F-CV-LEADS-INSERT-NO-TENANT-AGENT-FK (P2) remains OPEN |

---

## Section 8 — AI systems (real-key) (MIXED)

| # | Check | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 8.1 | Charlie chat responds (real Anthropic, tenant key) | ✅ | ✅ | Live API call to `claude-haiku-4-5-20251001` with each tenant's `anthropic_api_key`: WALLiam HTTP 200, reply="ok", 11→4 tokens, 1001ms. Aily HTTP 200, reply="ok", 11→4 tokens, 661ms. Both keys authenticate + return content. ~$0.01 total cost |
| 8.2 | Buyer/Seller plan generates real content | ◐ | ◐ | WALLiam: 3/3 active agents have `ai_estimator_enabled=true` + §3 live runs successfully generated plan email content (proves prompt path runs). Aily: 0/3 ai_estimator_enabled (config gap if AI estimator desired on Aily) — operator product decision, not a bug |
| 8.3 | Estimator returns valuation + AI commentary | ✅ | ✅ | Static check stands. F-ESTIMATOR-BUILDING-NO-COMPARABLES-LOG-LIES (P3) remains OPEN |

---

## Open findings to verify-or-fix during this pass

| Finding | Pri | Status | Note |
|---------|-----|--------|------|
| F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT | P1 | **CLOSED-VERIFIED 2026-06-03** | Verified `service_role` has SELECT grant on `platform_manager_tenants` (DB scan); Layer-5 error-capture present at `lib/admin-homes/lead-email-recipients.ts:217-219`. Both pieces of the prior P1 FIX 3 are in place. Table currently has 0 rows (no platform-managers assigned yet — config state, not a bug). |
| F-EMAIL-PREFLIGHT-ACCEPTS-PLACEHOLDER-KEY | P1 | **CODE-FIXED 2026-06-03** | `looksLikeValidResendKey()` added to `lib/email/sendTenantEmail.ts` — rejects missing/short/placeholder keys at preflight via typed `TenantEmailNotConfigured`. Shared with `verify-resend/route.ts`. Smoke 17/17 PASS (placeholders rejected, real WALLiam+Aily keys accepted). |
| F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL | P1 | **SHIPPED 2026-06-03** | **Phase 1** (`d5fd517`): added shared `attemptTenantEmail` helper to `lib/email/sendTenantEmail.ts`; 5 routes propagate `userEmailSent` + `userEmailReason` + `chainEmailSent` + `chainEmailReason` in JSON response; 6 client consumers (useCharlie plan-email + vip-request, AppointmentForm, PlanDocument, EstimatorBuyerModal, HomeEstimatorBuyerModal, EstimatorVipWrapper) read fields + render honest amber "couldn't email" banner. **Phase 2 Commit A** (`bdd3be7`): added `lead_email_delivery_status` column (text NOT NULL DEFAULT 'pending', CHECK enum) via apply-runner, in-tx verified + post-COMMIT re-verified. **Phase 2 Commit B** (`fe96be0`): 5 routes UPDATE the lead row AFTER `chainOutcome` resolves (`'sent'`/`'failed'`); LeadsTable + LeadDetailClient render "⚠ not yet alerted" badge on `'failed'`. NO backfill (existing 184 test rows land on `'pending'` → no dashboard noise). NO retry queue. Smoke green: response-shape (17/17 + 5 live-verify cases) + delivery-status (Phase 2 smoke ALL PASS, SAVEPOINT-isolated). Browser-confirm of banner + badge rendering pending live-verify (see Live-verify once). |
| F-CV-LEADS-INSERT-NO-TENANT-AGENT-FK | P2 | **CLOSED 2026-06-03** (W-FUNNEL Batch 2a) | 6-column composite FK applied: `agents_id_tenant_id_unique` (prerequisite UNIQUE on agents(id, tenant_id)) + 6 composite FKs `leads_<col>_tenant_consistency (col, tenant_id) → agents(id, tenant_id) MATCH SIMPLE ON DELETE NO ACTION` covering agent_id, manager_id, area_manager_id, tenant_admin_id, claimed_by_agent_id, override_agent_id. Precheck 0/6 violations pre-apply + post-apply. Runner output: `scripts-output/batch2-apply-run.txt`. Pre-snapshot: `scripts-output/batch2-pre-snapshot.json`. MT-reviewed. Future writes that mismatch tenant_id between a lead and its referenced agent are now rejected by the DB. |
| F-DASHBOARD-HARDCODED-CONDOLEADS-BRAND | Low | OPEN | dashboard sidebar hardcoded "CondoLeads" h1 — wrong brand for tenant agents (§6.3) |
| F-ESTIMATOR-BUILDING-NO-COMPARABLES-LOG-LIES | P3 | **CLOSED 2026-06-03** (W-FUNNEL Batch 2b) | Split the 3 pre-CONTACT exit paths in both `lib/estimator/comparable-matcher-sales.ts:46-49` and `lib/estimator/comparable-matcher-rentals.ts:45-48` (mirrored pattern, fixed in both). Real Supabase error → `console.error`; `!allSales/!allLeases` (anomaly undefined) → `console.warn`; `length===0` (expected empty-building) → `console.log`. Same `{ tier: 'CONTACT', comparables: [] }` returned. No more "Error fetching comparables: null" noise on routine empty-result paths. |
| F-PUBLIC-PAGES-HARDCODED-CONDOLEADS | P2 | OPEN 2026-06-03 | `/toronto` (and likely all public landing pages) on WALLiam tenant hosts emit `<link rel=canonical href="https://www.condoleads.ca/toronto-area">` + footer `mailto:condoleads.ca@gmail.com`. Same brand-leak class as F-DASHBOARD-HARDCODED-CONDOLEADS-BRAND but on public/SEO-indexed surface. SEO impact: WALLiam pages tell search engines they're aliases of condoleads.ca. |
| F-TENANTS-SHARE-RESEND-KEY | Info | LOGGED 2026-06-03 | WALLiam and Aily have **byte-identical** `resend_api_key` (verified). Both `send_from = "<brand> <notifications@condoleads.ca>"` on `email_from_domain = condoleads.ca`. Intentional shared-billing pattern; brand-per-tenant via send_from display name only. Decision needed if Aily wants its own verified `aily.ca` Resend domain (separately or shared account with additional verified domain). |
| F-TENANTS-SHARE-ANTHROPIC-KEY | Info | LOGGED 2026-06-03 | WALLiam and Aily share `anthropic_api_key` fingerprint `sk-ant-a...zwAA` len=108 — same pattern as F-TENANTS-SHARE-RESEND-KEY (likely byte-identical; not byte-checked yet). Per-tenant billing isolation not enforced; usage caps via tenant config fields only. |
| F-AILY-RESEND-VERIFICATION-NULL | Config | OPEN 2026-06-03 | Aily's `resend_verification_status` is `null` (not `'verified'`); causes `sendTenantEmail` to throw `TenantEmailNotConfigured` at preflight. Confirmed correct + intentional behavior given Aily's domain (`aily.ca`) is not registered at Resend. Resolution path: either register `aily.ca` at Resend and update the column, OR confirm Aily uses the shared `notifications@condoleads.ca` sender (already configured) and update the column to `'verified'` to lift the gate. |
| F-AGENTS-AI-ESTIMATOR-ENABLED-DEAD-IN-SYSTEM-2 | Cleanup | **CLOSED 2026-06-04** (false alarm) | Recon 2026-06-04 confirmed **no System 2 UI presents the agent-level `ai_estimator_enabled` toggle**. The earlier `app/admin-homes/settings/SettingsClient.tsx` grep hit was a substring match on `estimator_ai_enabled` (the tenant column added in §9.2 Step 1) — different column entirely. All `ai_estimator_enabled` readers are System 1 by design: `app/admin/branding/*` (legacy CRUD UI, untouchable per CLAUDE.md), `app/api/chat/{session,route}.ts`, `app/api/estimator/session/route.ts`, `lib/utils/agent-detection.ts`, plus the §9.2-preserved System-1-fallback branch inside the 4 estimator actions. **No System 2 surface to clean.** Column stays (System 1 still needs it). **Forward note:** if a future System 2 tenant-admin UI mirrors `/admin/branding` agent-settings, it must NOT surface `ai_estimator_enabled` (System 2 doesn't read it). |
| F-CHARLIE-WIDGET-RENDERS-ON-SYSTEM-1 | P2 | **CLOSED 2026-06-04** | Recon proved no billing leak (System 1 agents have `site_type='condos'` not `'comprehensive'`, so middleware never sets `x-tenant-id` on condoleads.ca subdomain requests; `/api/charlie` returns 401 on missing header before reaching Anthropic). Cosmetic stray widget only. Fix: single-line gate addition in `components/ConditionalLayout.tsx` — `isSystem1 = mounted && window.location.hostname.replace(/^www\./,'').endsWith('condoleads.ca')`, added to `isCharlieVisible` gate. Same client-side host-gate pattern as the existing `is01Leads` check. CharlieWidget no longer renders on condoleads.ca + subdomains. |
| F-DASHBOARD-HOST-UNCLEAR | P2 / Product | LOGGED 2026-06-03; **routing reality confirmed 2026-06-04**; awaiting product decision | The middleware sets `x-tenant-id` on `/api/*` (L113) + on the comprehensive-site rewrite (L99), but NOT on `/dashboard/*`. Live curl trace: `Host: walliam.ca` → `GET /dashboard` returns 404 (middleware rewrites to `/comprehensive-site/dashboard`, that route doesn't exist — `app/comprehensive-site/` contains only `[slug], about, contact, layout, page, privacy, terms, toronto`). `Host: condoleads.ca` → `GET /dashboard` returns 307 to `/login` (no rewrite for non-tenant host, page renders, requireAgent gates). **Production reality:** tenant agents reach the dashboard only via `condoleads.ca/dashboard`, breaking brand-URL continuity (URL bar reads `condoleads.ca` even though the sidebar h1 — post-Batch-1 — shows the agent's tenant brand). Batch 1's `getTenantBrand(agent.tenant_id)` correctly fixed the brand symptom by sourcing identity from the agent row, not the host. Three resolution paths (decide before Aily onboards agents): **A. Make `walliam.ca/dashboard` work** — exclude `/dashboard` from the comprehensive-site rewrite in middleware so it passes through to `app/dashboard/*`. Smallest middleware change; URL bar matches brand. (Recommended path per recon; needs its own design cycle since it's a middleware-hot-path change.) **B. Force dashboard to platform host only** — redirect `walliam.ca/dashboard` → `condoleads.ca/dashboard` (URL bar still says platform). **C. Accept current state** as known constraint until post-launch architectural work. **No build queued; product decision pending.** |
| F-DASHBOARDLAYOUT-DEAD-CODE | Cleanup | **CLOSED 2026-06-04** | `components/dashboard/DashboardLayout.tsx` deleted (0 importers re-verified pre-delete across `.ts/.tsx/.js/.jsx/.mjs`; backup at `.backup_20260604_055616`). 145 LOC removed including unused `lucide-react` icon imports (Home/Users/Building2/BarChart3/User/LogOut/Menu/X) and a non-rendering `'CondoLeads'` hardcoded h1. TSC clean post-delete. |
| F-LEADS-AREA-MANAGER-FK-CASCADE-CHANGE | Behavioral | LOGGED 2026-06-03 (Batch 2a side-effect) | Before Batch 2a: `leads_area_manager_id_fkey` had `ON DELETE SET NULL` — deleting an agent who was an area_manager on any lead set `leads.area_manager_id = NULL`. After Batch 2a: the new `leads_area_manager_tenant_consistency` composite FK has `ON DELETE NO ACTION`. PostgreSQL applies the most restrictive of multiple FKs on overlapping columns → **deleting an agent referenced as area_manager on any lead is now BLOCKED entirely** rather than nullifying that column on the lead. The other 5 columns had `NO ACTION` already (or no cascade), so behavior unchanged for them. Why this is more correct: nulling area_manager silently lost the chain-routing history; blocking deletion forces an explicit reassignment. **Relevant if agent-deletion is ever exercised** (no auto-flow does this today; admin GUI may); operator action needed = reassign area_manager on those leads first, then delete the agent. Logging only, not a defect. |
| F-LEADS-FK-DEDUP-PENDING | Cleanup | LOGGED 2026-06-03 (Batch 2a intentional redundancy) | Batch 2a kept the 6 pre-existing single-column FKs (`leads_agent_id_fkey`, `leads_manager_id_fkey`, `leads_area_manager_id_fkey`, `leads_tenant_admin_id_fkey`, `leads_claimed_by_agent_id_fkey`, `leads_override_agent_id_fkey` → `agents(id)`) in place alongside the 6 new composite tenant-consistency FKs. The new composite FK validates everything the simple one does + the tenant pair. The single-column FKs are now redundant. Intentional in this migration ("never remove a working safeguard in the same migration that adds its replacement") — dedup in a future pass once the composite constraints are proven stable. Note: `leads_area_manager_id_fkey` carries `ON DELETE SET NULL` while its composite sibling has `ON DELETE NO ACTION` — see F-LEADS-AREA-MANAGER-FK-CASCADE-CHANGE; the dedup pass will need to decide which cascade behavior is canonical. |

---

## Exit criteria (funnel verified = launch-ready on the backbone)

- [ ] All 6 lead types create correctly-scoped leads on both tenants (§1)
- [ ] Routing + hierarchy correct, zero cross-tenant assignment (§2, §7)
- [ ] All email types send + arrive, BCC included, none silently dropped (§3)
- [ ] All email + landing links resolve to correct tenant domain, no 404 (§4, §5)
- [ ] Dashboard shows correct leads + brand per tenant (§6)
- [ ] All P1 findings closed; P2/P3 logged with decision (defer or fix)
- [ ] AI systems respond with real content on both tenants (§8)

When all exit criteria pass → funnel backbone is verified end-to-end → cleared on the funnel dimension for launch / investor conversations.

---

## Run log

### 2026-06-03 — code-testable pass (§1, §2, §7, §8)

Script: `scripts/verify-w-funnel-code-sections.js`. Read-only, SAVEPOINT-wrapped (rollback at end). Both tenants.

**Results: 20 PASS / 0 FAIL / 7 INCONCLUSIVE**

- §1 lead capture: WALLiam 6/6 PASS (all lead-type rows have correct `tenant_id`, `agent_id`, `lead_origin_route`). Aily 0/6 — INCONCLUSIVE (no historical lead rows yet; revisit after first live Aily traffic).
- §2 routing: WALLiam 3/3 primary-apa probes resolved to correct-tenant agents via `resolve_agent_for_context`. Aily 0 primary-apa rows (INCONCLUSIVE for 2.1, but 2.2 hierarchy walks PASS and 2.3 cross-tenant scan PASSES across both).
- §7 isolation: ALL PASS. WALLiam admin's 181 leads all same-tenant; Aily admin 0 leads (clean). Live cross-tenant scan: 0 mismatches across all leads / agent_property_access.
- §8 wiring: anthropic_api_key + resend_api_key both real (`sk-ant-` / `re_` prefixed, len 108 / 36, no placeholder) for both tenants. WALLiam has `ai_estimator_enabled` on 3/3 active agents; Aily has 0/3 (config decision: enable when Aily AI estimator is desired). Estimator empty-building static path verified: function returns empty cleanly without crash.

**Findings status:**
- F-CV-LEADS-INSERT-NO-TENANT-AGENT-FK (P2): **OPEN, latent**. 0 live mismatches today, but no FK/CHECK enforces `leads.tenant_id` ↔ `agents.tenant_id` consistency — a buggy INSERT path could introduce one without rejection.
- F-ESTIMATOR-BUILDING-NO-COMPARABLES-LOG-LIES (P3): OPEN (per tracker).
- No new findings.

**Open observations:**
- WALLiam + Aily share the same `anthropic_api_key` and `resend_api_key` fingerprints. May be intentional (platform-shared billing) or may want per-tenant separation as Aily scales — worth a separate decision, not a finding.

### 2026-06-03 — §3 P1 gate (Findings 1 + 2 resolution)

**Finding 1 (F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT)**: **CLOSED-VERIFIED, no migration.**
DB scan confirms `service_role` already has `SELECT` on `platform_manager_tenants`; `SET LOCAL ROLE service_role; SELECT count(*) FROM platform_manager_tenants` succeeds inside SAVEPOINT. Layer-5 error-capture present at `lib/admin-homes/lead-email-recipients.ts:217-219`. Both halves of the prior P1 FIX 3 (commit `5bcbea9` lineage) are in place. Tracker entry stale; updated to CLOSED-VERIFIED.

**Finding 2 (F-EMAIL-PREFLIGHT-ACCEPTS-PLACEHOLDER-KEY)**: **CODE-FIXED.**
Added exported `looksLikeValidResendKey()` to `lib/email/sendTenantEmail.ts`: rejects keys missing `re_` prefix, length < 16, or matching placeholder patterns `[...] / <...> / REPLACE_ME / YOUR_RESEND / placeholder / TODO / xxxx`. Preflight in `sendTenantEmail` now throws typed `TenantEmailNotConfigured` with reason `'resend_api_key invalid (placeholder or malformed)'` instead of letting a placeholder reach `new Resend(key)` and 401 at send. `app/api/admin-homes/tenants/[id]/verify-resend/route.ts:38-40` updated to use the shared validator (single source of truth, replacing prior inline `re_`-only check). Smoke (`scripts/smoke-w-funnel-resend-key-validator.js`): 17/17 PASS — 13 placeholder/malformed inputs rejected, 2 synthetic real-shape + 2 live tenant keys (WALLiam, Aily, fingerprint `re_BJJ...cqSr` len=36) accepted.

**Finding 3 (NEW — F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL)**: surfaced during §3.8 work. All 5 `sendTenantEmail` callers catch the typed error + log it but still return `{ success: true }` to the user. The §3.8 fix delivers a *typed signal*; the callers need to *propagate* it. Logged as new P1 finding, NOT fixed silently this round.

### 2026-06-03 — F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL **SHIPPED**

The systemic Finding 3 (above) is now closed end-to-end.

**Phase 1 — response contract + client banners (commit `d5fd517`):**
- `lib/email/sendTenantEmail.ts` exports `attemptTenantEmail(params, context)` returning typed `{ sent, reason, messageId? }`; preserves console logging.
- 5 routes (`plan-email`, `lead`, `appointment`, `walliam/charlie/vip-request`, `walliam/estimator/vip-request`) use the helper + include `userEmailSent`/`userEmailReason`/`chainEmailSent`/`chainEmailReason` in JSON response.
- 6 client consumers read the fields + render honest amber "couldn't email" banner where applicable. AppointmentForm specifically keeps the form open on user-email failure so the banner is actually visible.
- Live-verify (`scripts/live-verify-w-funnel-email-caller.js`): 5/5 cases against a throwaway DB row — placeholder, NULL, REPLACE_ME, too-short, synthetic-real. Real WALLiam + Aily keys untouched (fingerprint pre+post identical).

**Phase 2 Commit A — migration (commit `bdd3be7`):**
- `supabase/migrations/20260603_w_funnel_phase_2_lead_email_delivery_status.sql`: adds `lead_email_delivery_status text NOT NULL DEFAULT 'pending'` + CHECK enum (`'pending'`/`'sent'`/`'failed'`).
- `scripts/apply-w-funnel-phase-2-lead-email-status.js`: idempotency precheck + pre-snapshot + transactional apply + in-tx verify + post-COMMIT re-verify.
- Applied: 50 columns + 8 CHECK constraints snapshot saved; in-tx verify ALL PASS (type=text, NOT NULL, default `'pending'`, constraint predicate, row_count=184 unchanged, sample reads all `'pending'`); COMMITted; post-COMMIT re-verify on fresh connection confirmed both column + constraint live.
- NO backfill: tracker decision — 184 existing test rows land on DEFAULT `'pending'` which yields no badge (badge fires only on `'failed'`).

**Phase 2 Commit B — route UPDATEs + dashboard badges + smoke (commit `fe96be0`):**
- 5 routes: 10-line UPDATE block per route, all placed AFTER `chainOutcome` resolves. Smoke verified ordering via assign-index < update-index check (5/5).
- LeadsTable + LeadDetailClient: amber "⚠ not yet alerted" pill gated on `lead.lead_email_delivery_status === 'failed'`.
- `scripts/smoke-w-funnel-phase-2-delivery-status.js`: SAVEPOINT-isolated, zero production state change. Cases: INSERT → default `'pending'`, UPDATE → `'sent'`, UPDATE → `'failed'`, CHECK rejects `'bogus'` (code 23514), dashboard SELECT returns column, static checks for badge JSX + ordering. ALL PASS for both tenants.

**Caveats / next steps**: see "Live-verify once" below.

### 2026-06-03 — Live verification pass (§3.1-§3.6, §4, §5, §6, §8)

Operator-driven live pass against the local dev server (DEV_TENANT_DOMAIN=walliam.ca). Backed-up tracker at `docs/W-FUNNEL-VERIFICATION-TRACKER.md.backup_<ts>`.

**§3 LIVE (both tenants, real Resend round-trips):**

Harness: `scripts/live-trigger-w-funnel-section3.js` — get-or-create test auth user (email=`delivered@resend.dev`), per-tenant create chat_session, POST all 5 routes + GET vip-approve, cleanup via DELETE bounded by createdLeadIds + createdSessionIds + createdVipRequestIds. `lead_email_recipients_log` is append-only by DB trigger — orphan log rows accepted as audit history (10 from WALLiam run, 0 from Aily — preflight blocked before logging).

| Tenant | S3.1 buyer | S3.2 seller | S3.3 lead | S3.4 appt | S3.5 vipReq | S3.6 vipApprove |
|--------|-----------|-------------|-----------|-----------|-------------|----------------|
| WALLiam | 200 / userSent=true delivered / chainSent=true delivered / lead=`sent` | 200 / userSent=true delivered / chainSent=true delivered / lead=`sent` | 200 / userSent=true delivered / chainSent=true delivered / lead=`sent` (UPSERTed S3.1) | 200 / userSent=true delivered / chainSent=true delivered / lead=`sent` | 200 / userEmail=not_attempted (correct) / chainSent=true delivered / lead=`sent` | GET 200 |
| Aily | 200 / both `'not_configured'` / lead=`failed` | 200 / both `'not_configured'` / lead=`failed` | 200 / both `'not_configured'` / lead=`failed` | 200 / both `'not_configured'` / lead=`failed` | 200 / chain=`'not_configured'` | GET 200 (no email — blocked) |

WALLiam: **5/5 live deliveries to delivered@resend.dev confirmed + 10 `lead_email_recipients_log` rows + every lead `lead_email_delivery_status='sent'` end-to-end through the Phase 2 UPDATE.** Aily: **5/5 blocked at preflight (resend_verification_status=null) + every lead `lead_email_delivery_status='failed'` end-to-end.** Both tenants exercised the actual route code through to the Phase 2 UPDATE. Cleanup: all leads + chat_sessions + user_activities + vip_requests + auth.users deleted (auth user soft-deleted via Supabase admin API after a one-time hard-delete failure).

**§4 link URLs:** static-verified across all 5 email-builders (plan-email, charlie/lead, charlie/appointment, walliam/charlie/vip-request, walliam/estimator/vip-request). `buildBaseUrl(tenant.domain)` is the single chokepoint and is correctly threaded. Live WALLiam deliveries additionally exercised this in real Resend payloads (10 logged sends).

**§5 landings:** Curl `GET /`, `GET /toronto`, `GET /toronto/north-york`, `GET /north-york` → 4× 200; `/north-york` returns 308 then resolves to `/toronto/north-york` (200). Cold-compile dev times (22-56s) noted as JIT artifact, not prod behavior. Brand-count on `/toronto`: 39 walliam vs 9 condoleads — most condoleads mentions are agents.subdomain.condoleads.ca legacy patterns, but two are real leaks (canonical + footer mailto) → **F-PUBLIC-PAGES-HARDCODED-CONDOLEADS**.

**§6 dashboard:** §3 live runs produced both `'sent'` (WALLiam) and `'failed'` (Aily) leads in DB. Badge JSX gating verified static in both views. Visual click-through (browser-pixel confirmation) is the only outstanding piece — code path is wire-tested end-to-end.

**§8 AI keys live:** `scripts/live-verify-w-funnel-section8-anthropic.js` — minimal `claude-haiku-4-5-20251001` call (5 max_tokens) with each tenant's `anthropic_api_key`. Both HTTP 200 with reply="ok" + 11→4 tokens consumed. WALLiam 1001ms, Aily 661ms. ~$0.01 total cost. Confirms keys reach Anthropic + authenticate + return content.

**New findings logged in 2026-06-03 pass:**
- **F-TENANTS-SHARE-RESEND-KEY (Info)**: WALLiam + Aily `resend_api_key` confirmed byte-identical. `send_from` is per-tenant ("WALLiam <notifications@condoleads.ca>" vs "aily <notifications@condoleads.ca>") but on the same `email_from_domain=condoleads.ca` Resend account. Intentional shared-billing pattern.
- **F-TENANTS-SHARE-ANTHROPIC-KEY (Info)**: Same fingerprint `sk-ant-a...zwAA` len=108 on both tenants (likely byte-identical; not byte-checked).
- **F-AILY-RESEND-VERIFICATION-NULL (Config)**: Aily `resend_verification_status` is `null` → blocks all Aily sends at preflight. Confirmed correct behavior given Aily's `aily.ca` isn't registered at Resend. Resolution: either register `aily.ca` or accept shared `notifications@condoleads.ca` sender + flip status to `'verified'`.
- **F-PUBLIC-PAGES-HARDCODED-CONDOLEADS (P2)**: WALLiam public pages emit canonical SEO link + footer mailto pointing at condoleads.ca. SEO impact: tenant pages mistakenly tagged as condoleads.ca aliases.

**Production cleanup confirmation:** Post-run `SELECT COUNT(*) FROM leads WHERE contact_email='delivered@resend.dev'` returns 0; same for chat_sessions + user_activities + user_profiles. auth.users entry deleted (via soft-delete fallback after hard-delete error). Only persistent residue: 10 audit rows in `lead_email_recipients_log` referencing now-deleted lead_ids — expected behavior of the append-only audit log.

---

## Live-verify once (when convenient — browser click-through, no code change)

Code-complete + statically smoke-green; these are the visual confirmations a code agent can't do from CLI:

- [x] **Phase 1 banner — emailSent:false live-exercise.** ✅ effectively proven by the §3 Aily live run (2026-06-03): real route execution against Aily's actually-unverified Resend domain returned `chainEmailSent: false` + `chainEmailReason: 'not_configured'` from all 4 lead-creating routes. This is the exact response-shape a client banner consumer reads. The browser-pixel confirmation (visual amber banner) is the only piece remaining — code path is wire-tested end-to-end through real network round-trip, not synthetic.
- [x] **Phase 2 badge — `'failed'` browser click-through.** ✅ effectively proven at the DB layer by the §3 Aily live run: 3 leads landed with `lead_email_delivery_status='failed'` via the actual `chainOutcome.sent ? 'sent' : 'failed'` UPDATE (not a synthetic SET). Dashboard SELECT against these rows would trigger the badge JSX (verified static in `LeadsTable.tsx:208-212` + `LeadDetailClient.tsx:110-114`). Browser-pixel confirmation is the only piece remaining.

These don't gate anything else — the funnel is verified-correct in code + smoke. They're final visual checks before considering the email-delivery integrity of the §3 row fully trustworthy in the launch-readiness sense.

---

## Pending spec decisions

### F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL — diagnosis + response-contract options

**Systemic pattern across 5 routes** (diagnosed 2026-06-03, read-only). Each row's response goes to a UI that interprets `data.success` as full success — when in reality the email send may have failed.

| Route | sendTenantEmail calls | Response on email failure | UI consumer | What user sees on failure |
|---|---|---|---|---|
| `app/api/charlie/plan-email/route.ts` | 2 (user + chain) | `{ success: true }` | `useCharlie.ts:444` — `.catch(err => console.error)`; **return value ignored** | Plan renders on screen; no email arrives; no banner |
| `app/api/charlie/lead/route.ts` | 2 (user + chain) | `{ success: true, leadId }` | Charlie lead-capture form — checks `data.success` | Confirmation shown; no email |
| `app/api/charlie/appointment/route.ts` | 2 (user-confirmation + chain) | `{ success: true, leadId }` | `AppointmentForm.tsx:144` — `if (data.success) onBooked()` | "Booked!" UI; no confirmation email; agent never alerted |
| `app/api/walliam/charlie/vip-request/route.ts` | 2 (agent + user approval on auto-approve) | `{ success: true, requestId, status, messagesGranted, message: 'VIP plan access automatically approved' }` | `useCharlie.ts:191` — closes gate, sets `vipRequestStatus` | Gate dismissed, credits granted, but agent has no inbox notification |
| `app/api/walliam/estimator/vip-request/route.ts` | 2 (chain + user confirmation) | `{ success: true, requestId, status, ... }` | Estimator runner — checks `data.success` | "Access approved" UI; no email |

**Anti-pattern** (verbatim across all 5):
```ts
try { await sendTenantEmail({ ... }) }
catch (err) {
  if (err instanceof TenantEmailNotConfigured) { console.warn(...) }
  else if (err instanceof TenantEmailFailed)   { console.error(...) }
}
// then unconditionally:
return NextResponse.json({ success: true, ... })
```

No route sets a variable like `userEmailSent` / `chainEmailSent` to propagate the failure.

**Response-contract options** (decision pending, not picked):

- **(a) Booleans in JSON response — least disruption.** Add `emailSent: false` (or `userEmailSent` + `chainEmailSent` for the 2-call routes) + `emailFailReason: 'not_configured' | 'send_failed'`. UI shows "Plan generated — but we couldn't email it to you" banner. Backwards-compatible. Requires 5 route + 5+ client updates. Easy to forget on the client side.
- **(b) Distinct HTTP status / partial result shape — most explicit.** Return `207 Multi-Status` (or `200` + `partial: true`) when action succeeded but email failed. HTTP-level signal surfaces in monitoring. Forces clients to handle the partial-success case explicitly. More invasive; some frameworks treat non-2xx as error.
- **(c) Background retry queue — best UX, most engineering.** Return `success: true` immediately, enqueue the email, dashboard surfaces `email_delivery_status enum('pending','sent','failed','retry_exhausted')` on the lead row. Doesn't fix first-attempt false-green; requires queue infra (BullMQ / pg-boss / Vercel Queues) + dashboard.

**Hybrid recommendation**: ship (a) immediately as the floor (kills false-green), follow up with (c) as the polished long-term answer. (b) adds monitoring teeth on top of (a).

**Open product questions for the spec round**:
1. Should the user see "couldn't deliver to your inbox" on the first attempt (a/b), or only after retry exhaustion (c)?
2. Agent-chain failure: surface in dashboard as "lead not yet alerted" indicator (requires lead-row column), or accept as quiet ops alert?
3. Uniform contract (one helper across 5 routes) or per-route bespoke?

---

## Recommended execution order

1. **Code-testable first** (§1, §2, §7, §8 partial) — Node + pg scripts, SAVEPOINT-isolated. Fastest, no live-email dependency.
2. **P1 findings** (§3.7, §3.8) — fix before relying on email-delivery results.
3. **Live email pass** (§3, §4) — real sends to `delivered@resend.dev` + agent inbox.
4. **Browser pass** (§5, §6) — landing pages + dashboard, both tenants.
5. **Aily caveat:** if Aily email send is blocked on domain verification, verify rendered-link correctness even where send is blocked; mark send-dependent rows as blocked-external, resume when domain verifies.