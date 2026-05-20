# W-MULTITENANT-BENCH TRACKER

**Workstream:** End-to-end multi-tenant lead routing verification.
**Tenants under test:** WALLiam (Tenant #1, in production) + Aily (Tenant #2, full peer of WALLiam, not yet hosted but exercised through the same code path).
**Owner:** Shah (sole dev)
**Started:** 2026-05-20
**Status:** **P2 -- Defect retirement in progress.** C1-C8a, C8b-2, C8f, C9, C10 CLOSED. C11, C12 PENDING. C8c/C8d/C8e/C10-followup-A/C10-followup-B logged for post-C12. F-IS-WALLIAM-NAMING-MISLEADS-CALLERS logged.

---

## Why this tracker exists

The W7 smoke runner in W-LEADS-WORKBENCH proves the individual lead-capture endpoints can write rows. It does not prove the customer-facing chain:

> *User lands on a public page -> clicks a CTA -> the request carries the right context -> the territory resolver picks the right agent -> the hierarchy walker produces the right BCC chain -> the final lead row is correctly tagged -> the workbench role-scoping shows it to the right viewers -> zero leakage between tenants.*

That is the chain that ships to customers. That is what this tracker proves.

**This is a permanent benchmark.** Every future feature edit that touches lead capture, agent resolution, hierarchy walking, or workbench rendering re-runs this suite before merging. Pass = ship. Fail = revert. No exceptions.

## Yardstick contract -- three criteria, no exceptions

A test cell passes only when **all three** hold:

1. **Comprehensive** -- every lead source x every entry-point geo level x every territory cascade path x every role-viewing-perspective covered. No skipped combinations.
2. **Atomic** -- each cell wraps in `BEGIN ... ROLLBACK`. Zero production state mutation. A failing cell leaves zero residue.
3. **Accurate** -- every fixture UUID verified from disk or DB this session. Zero invented values. Real geo IDs. Real agent IDs. Real email addresses. Real HTTP requests against a running dev server.

---

## Phase status table

| Phase | Status | Owner | Notes |
|---|---|---|---|
| P1 -- Recon | DONE | Claude | All 7 endpoint inventory + defect catalog complete |
| P2.C1 -- source-key gates + auth-user attribution | **CLOSED 2026-05-20** | Claude | Commit `e3a711e` |
| P2.C2 -- walliam/contact strict-fail on tenant lookup | **CLOSED 2026-05-20** | Claude | Commit `2b36174` |
| P2.C3 -- estimator/session p_tenant_id | **CLOSED 2026-05-20** | Claude | Commit `b797c79` |
| P2.C4 -- admin agents page LIKE filter | **CLOSED 2026-05-20** | Claude | Commit `c9289a8` |
| P2.C5 -- Charlie system prompt URLs | **CLOSED 2026-05-20** | Claude | Commit `4176fb7` |
| P2.C6 -- Charlie executeTool URLs | **CLOSED 2026-05-20** | Claude | Commit `00d1f42` |
| P2.C7 -- Root layout + comprehensive-site + OG metadata | **CLOSED 2026-05-20** | Claude | Commit `83acdd5`. New `getTenantByHost` helper. |
| P2.C8a -- Homepage CTA text strings | **CLOSED 2026-05-20** | Claude | Commits `6db2699` + `1ffd2eb` |
| P2.C8b-1 -- SiteHeader wordmark tenant-conditional rendering | **CLOSED (pre-bench)** | Claude | Commit `479fc49` (2026-04-22) |
| P2.C8b-2 -- Homepage HeroWordmark tenant-conditional rendering | **CLOSED 2026-05-20** | Claude | Commit `14db882`. Extended BrandWordmark with `size='hero'` variant. 27/27 regression PASS. |
| P2.C8f -- `getTenant()` localhost fallback | **CLOSED 2026-05-20** | Claude | Commit `c441d98`. Single-file fix at source. All 10 callers across 6 files benefit. 20/20 regression PASS. |
| **P2.C9 -- Session agent-name fallback** | **CLOSED 2026-05-20** | Claude | Commit `1191d6f`. 4/4 regression PASS. |
| **P2.C10 -- Admin leads + agent management brand strings** | **CLOSED 2026-05-20 (pending push)** | Claude | 6 hardcoded brand-leak strings retired. 5 files modified, 18 edits via `scripts/patch-c10-admin-leads-agent-brand.js`. Server pages prop-drill `tenantBrandName` + `tenantDomain` to client components. CSV filename derives from tenant domain slug. 30/30 regression PASS at `scripts/test-c10-multitenant-regression.js`. Visual smoke: leads page renders `WALLiam Leads` + `walliam.ca` subtitle; modal title `Add WALLiam Agent` + `WALLiam VIP Access Config`. `.condoleads.ca` subdomain suffix preserved per Option Y (platform-wide convention, user-confirmed). Commit: **(TBD -- pending push)**. |
| P2.C11 -- territory.ts inheritedFrom hardcode | PENDING | Claude | D16 |
| P2.C12 -- Aggregate regression gate | PENDING | Claude | Greps full codebase, asserts every literal retired |
| P2.C8c -- Config-driven wordmark gating | PENDING (post-C12) | Claude | Replace WALLIAM_TENANT_ID hardcode in 3 files with `tenants.wordmark_style` config flag. |
| P2.C8d -- `app/page.tsx` King Shah UUID hardcode | PENDING (post-C12) | Claude | Resolve via `tenants.default_agent_id`. |
| P2.C8e -- Generic-tenant root path | PENDING (post-C12) | Claude | `/` should resolve generic tenant by host. |
| P2.C10-followup-A -- Platform-onboarding copy | PENDING (post-C12) | Claude | AddTenantModal + EditTenantModal + TenantsClient help text. Super-admin-facing. |
| P2.C10-followup-B -- Hardcoded `'Charlie'` in tenant-admin views | PENDING (post-C12) | Claude | PlanRenderer.tsx:136 + VipRequestsTab.tsx:199. Should derive from `tenants.assistant_name`. |
| F-IS-WALLIAM-NAMING-MISLEADS-CALLERS | PENDING (post-C12) | Claude | `getWalliamTenantId()` is existence-check misused as identity-check. |
| P3 -- Build Aily fixture | NOT STARTED | Claude+Shah | Starts after P2 closes |
| P4 -- Build runner | NOT STARTED | Claude | After P3 |
| P5 -- Eventuality coverage | NOT STARTED | Claude | After P4 happy path |
| P6 -- Lock as benchmark | NOT STARTED | Claude+Shah | After P5 green |

---

## Lessons learned (this session)

- Unicode anchors are dangerous. Probe disk bytes first; anchor on pure-ASCII surrounding lines.
- Component scope must be fully traced before patching. When threading props, read from callsite backwards to default export to find every intermediate function.
- PowerShell here-string backticks are escape characters. Use markdown without backticks in commit messages, or single-quoted here-strings.
- PowerShell `String.Split(string)` treats string as char-array. Trust the Node patch script's own occurrence check.
- Atomic precheck design works. Multiple anchor failures this session aborted before any disk write.
- Fix bugs at the source, not the symptom. C8f Option β (fix `getTenant()` itself) over Option α (patch one caller).
- Two tenant-resolution helpers coexist (`getTenant`, `getTenantByHost`). Both server-side. Future unification candidate.
- C10 was the smoothest patch run -- 18 edits across 5 files, first try, TSC clean. Pattern recognition pays off: third instance of "server page fetches tenant, prop-drills to client" architecture in this session (C8a, C8b-2, C10).

---

## Rule Zero invariants

- Multi-tenant at scale
- No regressions
- Comprehensive only
- Nothing deferred to tomorrow
- No guessing
- Backup before touching existing files
- No placeholders, no fake data
- System 1 isolation absolute
- Smoke locally before commit
- Multi-line commit messages via temp file on Windows

---

## Session log

- **2026-05-20** -- Tracker artifact created. P2.C1-C8a shipped pushed (HEAD `1ffd2eb`).
- **2026-05-20** -- C9 shipped `1191d6f`. C8b-2 shipped `14db882`. C8f shipped `c441d98`. Tracker materialized to disk.
- **2026-05-20** -- C10 code complete: 18 edits across 5 files. TSC clean. 30/30 regression PASS. Visual smoke verified leads page + agent modal both render tenant-aware. About to commit C10. **Next session entry point: P2.C11.**