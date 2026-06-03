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
| 1.1 | Buyer plan | ☐ | ☐ | |
| 1.2 | Seller plan | ☐ | ☐ | |
| 1.3 | Charlie chat lead | ☐ | ☐ | |
| 1.4 | Estimator VIP request | ☐ | ☐ | lead + request row |
| 1.5 | Appointment booking | ☐ | ☐ | lead + appointment row |
| 1.6 | Contact form | ☐ | ☐ | |

---

## Section 2 — Routing / hierarchy (CODE-TESTABLE)

| # | Check | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 2.1 | Lead routes to correct agent per territory (geo/building) | ☐ | ☐ | `resolve_agent_for_context` RPC |
| 2.2 | Hierarchy escalation fires where expected | ☐ | ☐ | |
| 2.3 | No cross-tenant assignment | ☐ | ☐ | WALLiam lead never → Aily agent |

---

## Section 3 — Email delivery (6-layer chain) (LIVE EMAIL)

| # | Email | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 3.1 | Buyer plan email sends + arrives | ☐ | ☐ | Aily send may be blocked on domain verification |
| 3.2 | Seller plan email sends + arrives | ☐ | ☐ | |
| 3.3 | Lead notification to agent arrives | ☐ | ☐ | |
| 3.4 | Appointment confirmation arrives | ☐ | ☐ | |
| 3.5 | Estimator VIP request → agent email | ☐ | ☐ | |
| 3.6 | VIP approve → user approval email | ☐ | ☐ | |
| 3.7 | BCC / platform-manager copy arrives | ☐ | ☐ | **F-PLATFORM-MANAGER-TENANTS (P1) — silent BCC drop** |
| 3.8 | No email silently dropped | ☐ | ☐ | **F-EMAIL-PREFLIGHT-ACCEPTS-PLACEHOLDER-KEY (P1)** |

---

## Section 4 — Links in emails (LIVE — confirm fix `cbe86bb`)

| # | Check | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 4.1 | Plan email property links → tenant domain → 200 | ☐ | ☐ | walliam.ca / aily.ca |
| 4.2 | Lead/appointment/VIP email links → tenant domain | ☐ | ☐ | |
| 4.3 | No link → condoleads.ca | ☐ | ☐ | |
| 4.4 | No cross-tenant link, no 404 | ☐ | ☐ | |

---

## Section 5 — Landing pages (link destinations resolve) (BROWSER)

| # | Check | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 5.1 | Property links land on real property pages (200, correct brand) | ☐ | ☐ | |
| 5.2 | Geo links resolve, counts correct | ☐ | ☐ | pg-direct fix `d57c8e5` |
| 5.3 | Redirects work (/north-york → /toronto/north-york) | ☐ | ☐ | fix `1f4fa08` |

---

## Section 6 — Dashboard (agent side) (BROWSER)

| # | Check | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 6.1 | Lead appears in agent dashboard, correct tenant | ☐ | ☐ | |
| 6.2 | Plan data / appointment data renders | ☐ | ☐ | |
| 6.3 | Brand correct (NOT "CondoLeads") | ☐ | ☐ | **F-DASHBOARD-HARDCODED-CONDOLEADS-BRAND** (logged) |

---

## Section 7 — Multi-tenant isolation (Rule Zero) (CODE-TESTABLE)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 7.1 | WALLiam agent sees only WALLiam leads | ☐ | |
| 7.2 | Aily agent sees only Aily leads | ☐ | |
| 7.3 | No data / email / link bleeds across tenants | ☐ | |

---

## Section 8 — AI systems (real-key) (MIXED)

| # | Check | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 8.1 | Charlie chat responds (real Anthropic, tenant key) | ☐ | ☐ | ~1.5¢/interaction measured |
| 8.2 | Buyer/Seller plan generates real content | ☐ | ☐ | |
| 8.3 | Estimator returns valuation + AI commentary | ☐ | ☐ | **F-ESTIMATOR-BUILDING-NO-COMPARABLES (P3)** on empty buildings |

---

## Open findings to verify-or-fix during this pass

| Finding | Pri | Status | Note |
|---------|-----|--------|------|
| F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT | P1 | OPEN | service_role lacks SELECT on platform_manager_tenants → silent BCC drop (§3.7) |
| F-EMAIL-PREFLIGHT-ACCEPTS-PLACEHOLDER-KEY | P1 | OPEN | email preflight accepts placeholder key without error (§3.8) |
| F-CV-LEADS-INSERT-NO-TENANT-AGENT-FK | P2 | OPEN | leads table no FK/CHECK tying agent_id tenant to row tenant_id (§7) |
| F-DASHBOARD-HARDCODED-CONDOLEADS-BRAND | Low | OPEN | dashboard sidebar hardcoded "CondoLeads" h1 — wrong brand for tenant agents (§6.3) |
| F-ESTIMATOR-BUILDING-NO-COMPARABLES-LOG-LIES | P3 | OPEN | "Error fetching comparables: null" logs on empty-result; estimator falls back to contact-agent (§8.3) |

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

## Recommended execution order

1. **Code-testable first** (§1, §2, §7, §8 partial) — Node + pg scripts, SAVEPOINT-isolated. Fastest, no live-email dependency.
2. **P1 findings** (§3.7, §3.8) — fix before relying on email-delivery results.
3. **Live email pass** (§3, §4) — real sends to `delivered@resend.dev` + agent inbox.
4. **Browser pass** (§5, §6) — landing pages + dashboard, both tenants.
5. **Aily caveat:** if Aily email send is blocked on domain verification, verify rendered-link correctness even where send is blocked; mark send-dependent rows as blocked-external, resume when domain verifies.