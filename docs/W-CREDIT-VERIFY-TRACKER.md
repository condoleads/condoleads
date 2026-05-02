# W-CREDIT-VERIFY Tracker

**Started:** Late April 2026
**Last updated:** 2026-05-02
**Owner:** Shah (sole dev)
**Status:** Phase D2 complete (D2c shipped at `46f89d7`, encoding fix at `ae02c84`). Phase D3 not started.

---

## Goal

Make the WALLiam credit system fully tenant-aware end-to-end. Eliminate hardcoded `'walliam'` strings, hardcoded `walliam.ca` URLs, and queries missing tenant scope. Architecture should make it impossible for the next tenant onboarding to require code changes in the credit system.

---

## Phases

| Phase | Scope | Status | Commit(s) |
|---|---|---|---|
| D0 | Atomic session counters migration | ✅ Shipped | `776d8b6` (migration tracked) |
| D1 | `tenants.source_key` column + backfill | ✅ Shipped | `776d8b6` (migration tracked) |
| D2a | `app/api/charlie/route.ts` tenant-aware refactor | ✅ Shipped | (earlier commit, pre-tracker) |
| D2b | `app/api/walliam/charlie/session/route.ts` tenant-aware refactor | ✅ Shipped | (earlier commit, pre-tracker) |
| D2c | `app/api/walliam/charlie/vip-request/route.ts` tenant-aware refactor + GET tenant-leak fix | ✅ Shipped | `46f89d7` |
| D2c.1 | Email subject emoji strip + mojibake repair (deliverability) | ✅ Shipped | `ae02c84` |
| D3 | Frontend consumers of credit state (`useCharlie.ts`, admin pages) | ⏳ Not started | — |
| D4+ | TBD — depends on D3 audit findings | ⏳ Not started | — |

---

## Findings ledger

Findings are bugs/risks identified in code review of credit-system files. Each finding has an ID (F1, F2, etc.), a one-line description, the file/line where found, and which commit retired it (if any).

### Retired

| ID | Description | File | Retired by |
|---|---|---|---|
| F1 | Hardcoded `'walliam'` source filter in chat session lookup | `app/api/charlie/route.ts` | D2a |
| F2 | Hardcoded brand strings in chat response paths | `app/api/charlie/route.ts` | D2a |
| F8 | Hardcoded `'walliam'` source filter in session creation | `app/api/walliam/charlie/session/route.ts` | D2b |
| F9 | Missing tenant-required guard on session POST | `app/api/walliam/charlie/session/route.ts` | D2b |
| F10 | Dead `if (agentId && !tenantId)` block in session route | `app/api/walliam/charlie/session/route.ts` | D2b |
| F18 | Hardcoded `.eq('source', 'walliam')` in vip-request session lookup | `app/api/walliam/charlie/vip-request/route.ts` | D2c |
| F19 | Hardcoded `request_source: 'walliam_charlie'` in vip_requests INSERT | `app/api/walliam/charlie/vip-request/route.ts` | D2c |
| F20 | Hardcoded `source: 'walliam_charlie_vip_request'` in user_activities INSERT | `app/api/walliam/charlie/vip-request/route.ts` | D2c |
| F21 | Hardcoded `'https://walliam.ca'` URL fallbacks (route + email helper) | `app/api/walliam/charlie/vip-request/route.ts` | D2c |
| F22 | Hardcoded WALLiam brand strings in route logic + email templates | `app/api/walliam/charlie/vip-request/route.ts` | D2c |
| F36 | (D2a-related; details lost when I cleared context — assume it was tenant-routing related and was retired by D2a) | `app/api/charlie/route.ts` | D2a |
| F39 | GET handler queries `vip_requests` with no tenant_id filter — tenant-leak | `app/api/walliam/charlie/vip-request/route.ts` | D2c |
| F42 | Email subjects had emoji prefixes that combined with mojibake to trigger spam filtering | 4 email-sending route files | D2c.1 |
| F43 | `denied:` status row had wrong title `'Error'` (should be `'Denied'`) and broken cross-mark icon | `app/api/walliam/estimator/vip-approve/route.ts` | D2c.1 |

### Open

| ID | Description | File | Severity | Note |
|---|---|---|---|---|
| F37 | Deferred from D2a (reason not in current notes — needs re-discovery) | `app/api/charlie/route.ts` | unknown | Re-audit during D3 prep |
| F40 | Buyer plan summary email did not arrive at admin BCC during smoke test | `app/api/charlie/plan-email/route.ts` | medium | File is encoding-clean; bug is functional. Investigate as part of email-system phase |
| F41 | Buyer plan UI response missing comparable-listings cards (seller plan renders them correctly) | Frontend; specific component TBD | medium | Front-end bug; investigate during front-end-bugs phase |

### Discovered but not yet ID'd

The original W-CREDIT-VERIFY audit included findings F3–F7, F11–F17, F23–F35, F38 that aren't in the current notes. **These need to be re-discovered before D3 begins** — running the same audit pass on the remaining unaudited credit-system files would surface them.

---

## File inventory — credit system surface area

Files in the credit system that have been audited and refactored vs not. This is the map for "what's left" planning.

### Audited and refactored

| File | Refactor commit |
|---|---|
| `app/api/charlie/route.ts` | D2a |
| `app/api/walliam/charlie/session/route.ts` | D2b |
| `app/api/walliam/charlie/vip-request/route.ts` | D2c, D2c.1 |
| `app/api/walliam/charlie/vip-approve/route.ts` | D2c.1 (encoding only — full audit pending) |
| `app/api/walliam/estimator/vip-request/route.ts` | D2c.1 (encoding only — full audit pending) |
| `app/api/walliam/estimator/vip-approve/route.ts` | D2c.1 (encoding only — full audit pending) |

### Not yet audited (high-priority)

| File | Why it matters |
|---|---|
| `app/api/charlie/plan-email/route.ts` | Sends buyer/seller plan summary emails (F40 lives here) |
| `app/charlie/hooks/useCharlie.ts` | Frontend credit-state hook — reads + writes credit state to backend |
| `lib/email/sendTenantEmail.ts` | Tenant-aware email helper used by all routes — central infrastructure |
| `lib/admin-homes/hierarchy.ts` | Hierarchy walking for notification fan-out — central to manager/area-manager work |
| Admin UI for credit overrides — file path TBD | Where managers grant/decrease user credits |
| Low-credit warning email logic — file path TBD | Triggers when user approaches credit limit |
| `app/api/walliam/credits/...` (any routes) | Credit query/grant API surface |

### Schema/database

| Table | Audited | Notes |
|---|---|---|
| `chat_sessions` | Partial | tenant_id present and used in D2b |
| `vip_requests` | ✅ | tenant_id added + backfilled in D2c |
| `tenants` | ✅ | source_key, brand_name, domain, assistant_name + credit-limit columns confirmed |
| `tenant_users` | ✅ | Schema captured during D2c smoke prep |
| `user_credit_overrides` | ✅ | Schema captured during D2c smoke prep |
| `user_activities` | Partial | Used as INSERT target; no read-side audit |
| `agents` | Not audited | Has notification_email — used by email send paths |
| `leads` | Not audited | Created by vip-request flow |

---

## Pre-hierarchy checklist

You said the next phase after this is hierarchy work that was left incomplete. Here's what should be settled before that phase opens:

### 1. D2c.1 smoke test must pass
**Status:** Awaiting confirmation
- Email lands in Inbox (not Spam)
- Subject is plain text with no mojibake
- Body emojis render correctly across Gmail
- Approve and Deny buttons render their emojis

If the smoke fails, deliverability is investigated before anything else moves. The hierarchy phase is meaningless if the basic email path doesn't work.

### 2. F40 root cause identified (not necessarily fixed)
**Status:** Open
- Buyer plan summary email didn't reach admin BCC during testing on 2026-05-02
- File is encoding-clean, so it's a different bug than D2c.1 fixed
- Investigation needed: is `sendTenantEmail` being called at all for buyer plans? Does the call succeed? Where does it differ from the seller plan path?
- If F40 is a hierarchy-fan-out bug (admin BCC missing), it's part of the hierarchy phase. If it's something else (Resend error, missing template), it's a separate fix.
- **30 minutes of investigation before hierarchy starts** to determine which bucket F40 belongs in.

### 3. Re-discover findings F3–F7, F11–F17, F23–F35, F38
**Status:** Not done
- The original W-CREDIT-VERIFY audit had ~30 numbered findings; only ~13 are in current notes
- Either: (a) re-audit the unaudited files in the inventory above to surface remaining findings, or (b) accept that some findings were transient (already retired by other work) and move forward
- Recommendation: do (a) on the high-priority unaudited files (`useCharlie.ts`, `plan-email/route.ts`, `sendTenantEmail.ts`, hierarchy walker). 1-hour pass per file, list all findings into this tracker.

### 4. Hierarchy work scope defined
**Status:** Not in this tracker
- "Left incomplete" implies prior work exists. What was the original scope?
- Hierarchy phase needs its own scope doc before work begins:
  - What ancestors get notified for which events (vip-request, plan-generation, low-credit, lead-created)?
  - What roles exist (agent, manager, area-manager, admin)?
  - How is the chain walked (currently `walkHierarchy` in `lib/admin-homes/hierarchy.ts`)?
  - What gets persisted vs sent transiently?
- Without this scope, the phase will drift.

### 5. Front-end bugs catalog started
**Status:** F41 logged, but no broader catalog
- F41 (buyer plan listings missing) is the only front-end bug in the tracker
- Likely there are others surfaced during your manual testing today
- Recommendation: dedicate 30 minutes to a front-end smoke pass after hierarchy ships and log every visible bug into a `FRONTEND-BUGS.md` doc before the launch phase

### 6. Cost tracking decision
**Status:** Deferred
- $0.13–$0.14 per plan generation confirmed during D2c.1 testing
- No `ai_usage_log` table in current schema → no in-DB visibility on cost per tenant or per call
- Decision: build it (Phase E?) or rely on Anthropic dashboard for billing periods
- Not a blocker for hierarchy work, but worth deciding before launch so per-tenant billing isn't blocked

---

## Strategic ordering (yours, recorded)

You proposed this sequence on 2026-05-02. Recording so it's tracked, not session-memory:

1. **Now:** Fix the email/lead failures (D2c.1 — email subject emojis stripped, encoding repaired) ← shipped
2. **Next:** Hierarchy work that was left incomplete
3. **Then:** Email/lead system comprehensive audit
4. **Then:** Front-end bugs (F41 plus any others discovered)
5. **Then:** Launch

Phases 2 and 3 will likely interleave — hierarchy IS partly about who-gets-which-emails, and email-system audit IS partly about the hierarchy fan-out. Plan for them to merge.

---

## Workflow rules in effect

These rules apply to every commit in this work. Reference if any contributor (including future Claude sessions) drifts:

- **Multitenant rule zero:** Every query carries tenant_id. Every fetch/RPC/cache key scopes by tenant. No hardcoded tenant constants in business logic.
- **No regressions rule zero:** Identify every feature touched by a change before commit. Smoke-test each. TSC-clean is necessary but not sufficient.
- **Comprehensive rule zero:** Root cause not symptom. Architecture must prevent recurrence of the bug class. No "we'll do later."
- **Nothing deferred rule zero:** Identified-today-shipped-today. P2 backlog is forbidden. Phase 2 is acceptable only when phases ship in sequence with no gap.
- **No guessing rule zero:** Verification commands run in the current session, not training memory.
- **Backup rule zero:** Timestamped backup before any modification to an existing file.
- **No placeholders rule zero:** Scripts must not require user substitution of `<paste>` or similar.
- **Secrets rule zero:** Never paste full secrets in chat; fingerprint format only.
- **System 1 isolation:** No System 1 file modifications in this work. Building pages are the documented shared exception.

---

## Decision log (for future reference)

| Date | Decision | Reason |
|---|---|---|
| 2026-05-02 | Skip FK + NOT NULL on `vip_requests.tenant_id` | 4 System 1 test rows have NULL tenant_id; constraints would block them. App-layer filter (.eq('tenant_id', tenantId)) is sufficient defense. Per System 1 isolation, agent rows not modified. |
| 2026-05-02 | Skip cost-tracking index on `vip_requests.tenant_id` | Table too small to need it. Premature optimization. Add when query performance is measured to be slow. |
| 2026-05-02 | Strip emojis from email subjects globally | Even when correctly encoded, emojis in subjects elevate spam scores. Plain-text subjects are universally deliverable. Keep emojis in HTML body. |
| 2026-05-02 | Mojibake repair scoped to email-sending route files only | session/route.ts and plan-email/route.ts already encoding-clean per recon. Don't sweep more broadly than needed. |
| 2026-05-02 | $0.15/plan ballpark accepted as customer-pricing input | Sample size 2 (one buyer + one seller plan). Margin math against $2,500–$10,000/mo tiers is so favorable that more precise measurement isn't blocking work. |

---

## How to use this tracker

- **Before starting any work:** Read this file. Check the relevant phase status. Don't reconstruct from session memory.
- **When discovering a bug:** Add it to the Open findings table with a fresh F-number. Don't store it only in chat.
- **When shipping a commit:** Update Phase status, add to commit column, move retired findings.
- **Between sessions:** This file is the source of truth. If something here disagrees with chat history, this file wins until verified otherwise.