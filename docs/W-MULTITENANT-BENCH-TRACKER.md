# W-MULTITENANT-BENCH TRACKER

**Workstream:** End-to-end multi-tenant lead routing verification.
**Tenants under test:** WALLiam (Tenant #1, in production) + Aily (Tenant #2, full peer of WALLiam, not yet hosted but exercised through the same code path).
**Owner:** Shah (sole dev)
**Started:** 2026-05-20
**Status:** **P2 -- Defect retirement in progress.** C1-C8a, C8b-2, C9 CLOSED. **C8f IN PROGRESS (next, immediate fast-follow to C8b-2 per Option C decision).** C8c/C8d/C8e logged for post-C12.

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
3. **Accurate** -- every fixture UUID verified from disk or DB this session. Zero invented values. Real geo IDs. Real agent IDs. Real email addresses (the three Shah owns). Real HTTP requests against a running dev server.

---

## Phase status table

| Phase | Status | Owner | Notes |
|---|---|---|---|
| P1 -- Recon | DONE | Claude | All 7 endpoint inventory + defect catalog complete |
| P2.C1 -- source-key gates + auth-user attribution | **CLOSED 2026-05-20** | Claude | D1/D5/D6/D7 retired. Commit `e3a711e`. Regression gate at `scripts/test-c1-multitenant-regression.js` |
| P2.C2 -- walliam/contact strict-fail on tenant lookup | **CLOSED 2026-05-20** | Claude | D4 retired. Commit `2b36174`. Regression gate at `scripts/test-c2-multitenant-regression.js` |
| P2.C3 -- estimator/session p_tenant_id | **CLOSED 2026-05-20** | Claude | D3 retired. Commit `b797c79`. Regression gate at `scripts/test-c3-multitenant-regression.js` |
| P2.C4 -- admin agents page LIKE filter | **CLOSED 2026-05-20** | Claude | D2 retired. Commit `c9289a8`. Regression gate at `scripts/test-c4-multitenant-regression.js` |
| P2.C5 -- Charlie system prompt URLs | **CLOSED 2026-05-20** | Claude | D8 retired. 10 tenantDomain interpolations. Commit `4176fb7`. Regression gate at `scripts/test-c5-multitenant-regression.js` |
| P2.C6 -- Charlie executeTool URLs | **CLOSED 2026-05-20** | Claude | D9 retired. 11 edits in 1 file. Commit `00d1f42`. Regression gate at `scripts/test-c6-multitenant-regression.js` |
| P2.C7 -- Root layout + comprehensive-site + OG metadata | **CLOSED 2026-05-20** | Claude | D10, D11, D12 retired. New `getTenantByHost` helper. Commit `83acdd5`. 15 assertions in regression gate. |
| P2.C8a -- Homepage CTA text strings (text-only subset of D13) | **CLOSED 2026-05-20** | Claude | Text strings + prop drilling. WalliamCTA stays client component. 10 callsites updated. 8 server pages + 2 client components threaded. Wordmark preserved. 37/37 regression PASS. Commits `6db2699` + `1ffd2eb` (architecture-revised). |
| P2.C8b-1 -- SiteHeader wordmark tenant-conditional rendering | **CLOSED (pre-bench)** | Claude | Already shipped pre-bench-tracker. Commit `479fc49` (2026-04-22): `feat(nav): tenant-aware SiteHeader logo fallback`. SiteHeaderClient.tsx:13 declares `WALLIAM_TENANT_ID` constant; line 101 ternary gates `WalliamWordmark` (animated heart) vs `BrandWordmark` (plain-text fallback). Verified via `git blame` 2026-05-20. **Caveat:** uses hardcoded UUID -- see C8c. |
| **P2.C8b-2 -- Homepage HeroWordmark tenant-conditional rendering** | **CLOSED 2026-05-20** | Claude | D13 (hero subset) retired. Extended `BrandWordmark` with `size='hero'` variant (`clamp(52px, 10vw, 96px)`, fontWeight 900, letterSpacing -0.03em). Prop-drilled `tenantId` + `brandName` from server wrappers (V1 + V2) -> default export -> WalliamHero -> HeroWordmark. Tenant gate `tenantId !== WALLIAM_TENANT_ID` in HeroWordmark with hooks-first ordering (Rules of Hooks safe). 5 files modified: `BrandWordmark.tsx`, `HomePageComprehensive.tsx`, `HomePageComprehensiveV2.tsx`, `HomePageComprehensiveClient.tsx`, `HomePageComprehensiveClientV2.tsx`. Three patch scripts: `patch-c8b-2-hero-wordmark.js`, `patch-c8b-2-clients-completion.js`, `patch-c8b-2-walliam-hero-prop-thread.js`. 27/27 regression PASS at `scripts/test-c8b-2-multitenant-regression.js`. Local smoke (WALLiam tenant): animated heart hero wordmark renders unchanged. Commit: **(TBD -- pending push)**. |
| **P2.C8f -- SiteHeader localhost tenant resolution** (NEW, IMMEDIATE) | **IN PROGRESS** | Claude | Surfaced during C8b-2 smoke 2026-05-20. `lib/tenant/getTenant.ts` resolves tenant from `x-tenant-id` request header (set by middleware on production). On localhost, no middleware match -> `getTenant()` returns null -> `SiteHeader.tsx:200` passes `tenantId={undefined}` -> `SiteHeaderClient:101` gate evaluates false -> plain `BrandWordmark` renders instead of animated `WalliamWordmark`. Bug is **localhost-only**, pre-existing (predates C8b-2 by ~one month). Production unaffected. Hero wordmark works on localhost because `HomePageComprehensive` uses `getTenantByHost(host)` which has dev fallback. **Fix shape:** unify tenant resolution -- in `SiteHeader.tsx`, if `getTenant()` returns null, fall back to `getTenantByHost(host)`. Ships as fast-follow commit immediately after C8b-2. |
| P2.C9 -- Session agent-name fallback | **CLOSED 2026-05-20** | Claude | D15 retired. `app/api/walliam/charlie/session/route.ts:93` `full_name: 'WALLiam'` initial fallback -> `full_name: ''`. Tenant.name (~line 118) and agent.full_name (~line 143) overrides intact. Commit `1191d6f`. Regression gate at `scripts/test-c9-multitenant-regression.js` 4/4 PASS. |
| P2.C10 -- Admin leads client brand | PENDING | Claude | D14 |
| P2.C11 -- territory.ts inheritedFrom hardcode | PENDING | Claude | D16 |
| P2.C12 -- Aggregate regression gate | PENDING | Claude | Greps full codebase, asserts every literal retired |
| P2.C8c -- Config-driven wordmark gating (NEW) | PENDING (post-C12) | Claude | Replace WALLIAM_TENANT_ID hardcode in 3 files with `tenants.wordmark_style` config flag. |
| P2.C8d -- `app/page.tsx` King Shah UUID hardcode (NEW) | PENDING (post-C12) | Claude | Resolve via `tenants.default_agent_id` (column already exists). |
| P2.C8e -- Generic-tenant root path (NEW) | PENDING (post-C12) | Claude | `/` should resolve generic tenant by host, mirroring `/comprehensive-site`. |
| F-IS-WALLIAM-NAMING-MISLEADS-CALLERS (latent bug) | PENDING (post-C12) | Claude | `getWalliamTenantId()` is existence-check misused as identity-check in V1+V2 server wrappers. |
| P3 -- Build Aily fixture | NOT STARTED | Claude+Shah | Starts after P2 closes |
| P4 -- Build runner | NOT STARTED | Claude | After P3 |
| P5 -- Eventuality coverage | NOT STARTED | Claude | After P4 happy path |
| P6 -- Lock as benchmark | NOT STARTED | Claude+Shah | After P5 green |

---

## Lessons learned (this session)

- **Unicode anchors are dangerous.** Probe disk bytes first; anchor on pure-ASCII surrounding lines.
- **Component scope must be fully traced before patching.** When threading props, read from callsite backwards to default export to find every intermediate function.
- **PowerShell here-string backticks are escape characters.** Use markdown without backticks in commit messages, or single-quoted here-strings.
- **PowerShell `String.Split(string)` treats string as char-array.** Trust the Node patch script's own occurrence check.
- **Atomic precheck design works.** Both anchor failures this session aborted before any disk write. Backups never needed but always created.

---

## Rule Zero invariants

- Multi-tenant at scale: no hardcoded tenant constants in business logic
- No regressions: every commit smoke-tested
- Comprehensive only: no half-fixes
- Nothing deferred to tomorrow: same-session sequential commits
- No guessing: every fact verified from disk
- Backup before touching existing files (timestamped)
- No placeholders, no fake data
- System 1 isolation absolute
- Smoke locally before commit
- Multi-line commit messages via temp file on Windows

---

## Session log

- **2026-05-20** -- Tracker artifact created. P2.C1-C8a shipped pushed (HEAD `1ffd2eb`). C9 shipped pushed (`1191d6f`). C8b-2 recon complete; patch plan locked; executed.
- **2026-05-20** -- C8b-2 code complete: 5 files patched across 3 patch scripts. TSC clean. 27/27 regression PASS. WALLiam hero smoke verified visually.
- **2026-05-20** -- C8f surfaced during C8b-2 smoke. Diagnosed root cause: `getTenant()` is header-only. Decision: Option C -- commit C8b-2 first, then C8f as fast-follow.
- **2026-05-20** -- Tracker materialized to disk for the first time. C8b-2 commit pending.