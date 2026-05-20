# W-MULTITENANT-BENCH TRACKER

**Workstream:** End-to-end multi-tenant lead routing verification.
**Tenants under test:** WALLiam (Tenant #1, in production) + Aily (Tenant #2, full peer of WALLiam, not yet hosted but exercised through the same code path).
**Owner:** Shah (sole dev)
**Started:** 2026-05-20
**Status:** **P2 -- Defect retirement in progress.** C1-C8a, C8b-2, C8f, C9 CLOSED. C8c/C8d/C8e logged for post-C12.

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
| P2.C1 -- source-key gates + auth-user attribution | **CLOSED 2026-05-20** | Claude | Commit `e3a711e`. Regression at `scripts/test-c1-multitenant-regression.js` |
| P2.C2 -- walliam/contact strict-fail on tenant lookup | **CLOSED 2026-05-20** | Claude | Commit `2b36174`. Regression at `scripts/test-c2-multitenant-regression.js` |
| P2.C3 -- estimator/session p_tenant_id | **CLOSED 2026-05-20** | Claude | Commit `b797c79`. Regression at `scripts/test-c3-multitenant-regression.js` |
| P2.C4 -- admin agents page LIKE filter | **CLOSED 2026-05-20** | Claude | Commit `c9289a8`. Regression at `scripts/test-c4-multitenant-regression.js` |
| P2.C5 -- Charlie system prompt URLs | **CLOSED 2026-05-20** | Claude | Commit `4176fb7`. Regression at `scripts/test-c5-multitenant-regression.js` |
| P2.C6 -- Charlie executeTool URLs | **CLOSED 2026-05-20** | Claude | Commit `00d1f42`. Regression at `scripts/test-c6-multitenant-regression.js` |
| P2.C7 -- Root layout + comprehensive-site + OG metadata | **CLOSED 2026-05-20** | Claude | Commit `83acdd5`. New `getTenantByHost` helper. 15 assertions. |
| P2.C8a -- Homepage CTA text strings | **CLOSED 2026-05-20** | Claude | Commits `6db2699` + `1ffd2eb`. 37/37 regression PASS. |
| P2.C8b-1 -- SiteHeader wordmark tenant-conditional rendering | **CLOSED (pre-bench)** | Claude | Commit `479fc49` (2026-04-22, pre-bench-tracker). Hardcoded UUID — see C8c. |
| **P2.C8b-2 -- Homepage HeroWordmark tenant-conditional rendering** | **CLOSED 2026-05-20** | Claude | Commit `14db882`. Extended `BrandWordmark` with `size='hero'` variant. Prop-drilled `tenantId` + `brandName` from server wrappers through WalliamHero into HeroWordmark. Tenant gate `tenantId !== WALLIAM_TENANT_ID` with hooks-first ordering. 5 files modified, 3 patch scripts, 27/27 regression PASS. WALLiam hero smoke verified visually. |
| **P2.C8f -- `getTenant()` localhost fallback** | **CLOSED 2026-05-20 (pending push)** | Claude | Option β: fix at source. Single file `lib/tenant/getTenant.ts` patched (~25-line fallback block added). Production path preserved. Dev path: when middleware doesn't inject `x-tenant-id` AND host matches `localhost`/`vercel.app`, resolve tenant by `DEV_TENANT_DOMAIN` env var. All 10 callers across 6 files benefit atomically (`SiteHeader.tsx`, `TenantFooter.tsx`, 4 static comprehensive-site pages). Patch: `scripts/patch-c8f-gettenant-localhost-fallback.js`. Regression: `scripts/test-c8f-multitenant-regression.js` 20/20 PASS. Smoke: localhost header now matches production (animated heart wordmark). Commit: **(TBD — pending push)**. |
| P2.C9 -- Session agent-name fallback | **CLOSED 2026-05-20** | Claude | Commit `1191d6f`. Regression at `scripts/test-c9-multitenant-regression.js` 4/4 PASS. |
| P2.C10 -- Admin leads client brand | PENDING | Claude | D14 |
| P2.C11 -- territory.ts inheritedFrom hardcode | PENDING | Claude | D16 |
| P2.C12 -- Aggregate regression gate | PENDING | Claude | Greps full codebase, asserts every literal retired |
| P2.C8c -- Config-driven wordmark gating | PENDING (post-C12) | Claude | Replace WALLIAM_TENANT_ID hardcode in 3 files with `tenants.wordmark_style` config flag. |
| P2.C8d -- `app/page.tsx` King Shah UUID hardcode | PENDING (post-C12) | Claude | Resolve via `tenants.default_agent_id` (column already exists). |
| P2.C8e -- Generic-tenant root path | PENDING (post-C12) | Claude | `/` should resolve generic tenant by host, mirroring `/comprehensive-site`. |
| F-IS-WALLIAM-NAMING-MISLEADS-CALLERS | PENDING (post-C12) | Claude | `getWalliamTenantId()` is existence-check misused as identity-check in V1+V2 server wrappers. |
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
- **Fix bugs at the source, not the symptom.** C8f Option β (fix `getTenant()` itself) over Option α (patch one caller) — comprehensive over band-aid. Same effort, more files fixed.
- **Two tenant-resolution helpers coexist for legacy reasons.** `getTenant()` (header-based, 6 callers including footer + static pages) and `getTenantByHost` (host-based, 14+ callers). C8f added dev fallback to `getTenant`; future C-row (or post-launch consolidation) should unify them.

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

- **2026-05-20** -- Tracker artifact created. P2.C1-C8a shipped pushed (HEAD `1ffd2eb`). C9 shipped pushed (`1191d6f`).
- **2026-05-20** -- C8b-2 committed `14db882` and pushed. Vercel build green. Tracker materialized to disk for the first time.
- **2026-05-20** -- C8f patched (Option β: fix at source, single file `lib/tenant/getTenant.ts`). TSC clean. 20/20 regression PASS. Localhost smoke confirmed animated heart wordmark renders. About to commit C8f.