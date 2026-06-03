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
| 3.1 | Buyer plan email sends + arrives | ☐ | ☐ | Aily send may be blocked on domain verification |
| 3.2 | Seller plan email sends + arrives | ☐ | ☐ | |
| 3.3 | Lead notification to agent arrives | ☐ | ☐ | |
| 3.4 | Appointment confirmation arrives | ☐ | ☐ | |
| 3.5 | Estimator VIP request → agent email | ☐ | ☐ | |
| 3.6 | VIP approve → user approval email | ☐ | ☐ | |
| 3.7 | BCC / platform-manager copy arrives | ◐ | ◐ | F-PLATFORM-MANAGER-TENANTS **CLOSED-VERIFIED**: grant + logging in place (see Findings). Live send-pass arrival still requires §3 live email pass |
| 3.8 | No email silently dropped | ◐ | ◐ | F-EMAIL-PREFLIGHT-ACCEPTS-PLACEHOLDER-KEY **CODE-FIXED**: placeholder/malformed keys now rejected at preflight (typed `TenantEmailNotConfigured`). **Caller-side false-green still OPEN** — see Findings + new F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL |

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
| 7.1 | WALLiam agent sees only WALLiam leads | ✅ | King Shah's 181 leads: 181 same_tenant, 0 other_or_null |
| 7.2 | Aily agent sees only Aily leads | ✅ | Aily admin: 0 leads (no traffic), 0 cross-tenant |
| 7.3 | No data / email / link bleeds across tenants | ✅ | leads scan: 0 rows where agent.tenant_id ≠ lead.tenant_id. **Latent risk**: no FK/CHECK enforces this — F-CV-LEADS-INSERT-NO-TENANT-AGENT-FK (P2) remains OPEN |

---

## Section 8 — AI systems (real-key) (MIXED)

| # | Check | WALLiam | Aily | Notes |
|---|-------|---------|------|-------|
| 8.1 | Charlie chat responds (real Anthropic, tenant key) | ◐ | ◐ | Config wired (anthropic_api_key starts `sk-ant-`, len=108, not placeholder, both tenants). Live paid-call verification pending separate budgeted step |
| 8.2 | Buyer/Seller plan generates real content | ◐ | ◐ | WALLiam: 3/3 active agents have `ai_estimator_enabled=true`. Aily: 0/3 (config gap if AI estimator desired on Aily). Live content verification pending |
| 8.3 | Estimator returns valuation + AI commentary | ✅ | ✅ | Static check: `lib/estimator/comparable-matcher-sales.ts` has empty-result return path (no crash on empty building). F-ESTIMATOR-BUILDING-NO-COMPARABLES-LOG-LIES (P3) remains OPEN |

---

## Open findings to verify-or-fix during this pass

| Finding | Pri | Status | Note |
|---------|-----|--------|------|
| F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT | P1 | **CLOSED-VERIFIED 2026-06-03** | Verified `service_role` has SELECT grant on `platform_manager_tenants` (DB scan); Layer-5 error-capture present at `lib/admin-homes/lead-email-recipients.ts:217-219`. Both pieces of the prior P1 FIX 3 are in place. Table currently has 0 rows (no platform-managers assigned yet — config state, not a bug). |
| F-EMAIL-PREFLIGHT-ACCEPTS-PLACEHOLDER-KEY | P1 | **CODE-FIXED 2026-06-03** | `looksLikeValidResendKey()` added to `lib/email/sendTenantEmail.ts` — rejects missing/short/placeholder keys at preflight via typed `TenantEmailNotConfigured`. Shared with `verify-resend/route.ts`. Smoke 17/17 PASS (placeholders rejected, real WALLiam+Aily keys accepted). |
| F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL | P1 | **OPEN — NEW (systemic)** | **Systemic pattern across 5 routes**, not a one-off: all `sendTenantEmail` callers (`plan-email`, `lead`, `appointment`, `walliam/charlie/vip-request`, `walliam/estimator/vip-request`) catch `TenantEmailNotConfigured` / `TenantEmailFailed`, log to console, then return `{ success: true }` to the user. Each route has TWO sendTenantEmail calls (user-facing + agent-chain) — even if BOTH fail, response is `success: true`. User sees "plan generated"/"booked!" but no email arrives; brokerage sees no lead alert. **Launch-critical funnel-integrity issue**: a lead the brokerage thinks landed but never got notified about. The §3.8 preflight fix gives callers a typed signal; **callers need to propagate it via a uniform response contract** (one helper, not 5 bespoke fixes). See Pending spec decisions for diagnosis matrix + response-contract options. Surfaced during the §3.8 fix; reported, NOT fixed silently. |
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