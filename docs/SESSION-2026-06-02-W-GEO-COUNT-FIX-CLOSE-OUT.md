# Session 2026-06-02 — W-GEO-COUNT-FIX + pre-launch polish close-out

**Date:** 2026-06-02
**Owner:** Shah (sole dev) + Claude
**Status:** **5 workstreams CLOSED**, all pushed to `origin/main` and live-verified on production (walliam.ca via deploy `dpl_J5gHpiQCs1CCPcLP8xAhqmEriDD7` / `condoleads-o4b8oawrz-condoleads-projects.vercel.app`).

The headline workstream is **W-GEO-COUNT-FIX** — closes long-standing finding F-POSTGREST-COUNT-EXACT-SILENT-500. The other 4 are tactical polish (hydration, mobile, console hygiene, home+neighbourhood SSR counts).

---

## 1. W-PROPERTY-HYDRATION — CLOSED

**Symptom (production):** Property pages emitted React minified errors #418/#423/#425 (hydration mismatch) and the "Multiple GoTrueClient instances detected" warning.

**Root causes (three, all in property render path):**
1. `formatTimeAgo` read `new Date()` at render time (server vs client clock skew → mismatch).
2. `toLocaleString()` / `toLocaleDateString()` called without explicit locale + timezone (server's UTC vs client's `America/Toronto`).
3. `lib/supabase/client.ts` exports both a `createClient()` factory AND a `supabase` singleton; four client components were calling `createClient()` directly, creating duplicate `GoTrueClient` instances.

**Fix:**
- **`e74efb5`** — `fix(property): use Supabase singleton in client components` — swapped `createClient()` calls in `WalliamAgentCard`, `CharlieWidget`, `AppointmentForm`, `SellerEstimateRunner` to the singleton `supabase` import (one dynamic-import case).
- **`f9e6857`** — `fix(property): pin locale + timezone on render-time formatters` — Pattern A (`en-CA` locale), Pattern B (`timeZone: 'America/Toronto'`), Pattern C (`mounted` state via `useEffect` to defer `formatTimeAgo`).
- **`cce15e4`** — `fix(property): de-duplicate home-header address` — confirmed pre-existing duplication (verified byte-for-byte against backup); home branch now renders the remainder-after-first-comma in the `<p>`, condo branch unchanged.

**Verification:** local dev-server reload + production curl — no React error overlay, no `GoTrueClient` warning, addresses no longer double-rendered on home property pages.

---

## 2. W-MOBILE-RESPONSIVE — CLOSED

**Symptom:** On mobile, the Charlie chat bar (72px footprint with safe-area) clipped page content at the bottom on every route; on property pages the PropertyStickyBar overlapped it; on geo pages the status-tab row horizontally scrolled with hidden counts.

**Fixes (two commits):**
- **`3a5dcf6`** — `fix(mobile): Charlie bar global clearance + stack above PropertyStickyBar (W-MOBILE-RESPONSIVE A+B)`
  - Added `--charlie-bar-clearance: calc(72px + var(--sticky-bar-height, 0px) + env(safe-area-inset-bottom, 0px) + 16px)` to `:root`.
  - Wrapped `ConditionalLayout` children in a div with `paddingBottom: var(--charlie-bar-clearance)` gated on `isCharlieVisible && pathname !== '/'`.
  - `PropertyStickyBar` publishes its measured pixel height to `--sticky-bar-height` via `useEffect`; clears on unmount.
  - `CharlieWidget` `bottom` changed from `24` to `calc(var(--sticky-bar-height, 0px) + 24px)`.
- **`7dd07ee`** — `fix(geo): wrap mobile tab rows instead of horizontal-scroll (W-MOBILE-RESPONSIVE C)` — replaced `flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4` (+ button `whitespace-nowrap flex-shrink-0`) with `flex flex-wrap gap-2 mb-4` in both `GeoListingSection` and `GeoPageTabs`. Counts now wrap onto a second row instead of being clipped.

**Verification:** mobile-viewport DevTools simulation + iOS Safari home-indicator preserved via `env(safe-area-inset-bottom)`.

---

## 3. W-CONSOLE-CLEANUP — CLOSED

**Symptom:** Two render-time `console.log` debug lines in production + "missing sizes prop" warnings on every `<Image fill>` element in `PropertyGallery`.

**Fixes:**
- **`67bb7c5`** — `chore(property): strip debug console.log lines from property/charlie tree` — removed two `console.log` lines: `PropertyEstimateCTA.tsx:21` and inline `console.log('[Runner] starting estimate, ...')` at `SellerEstimateRunner.tsx:74`.
- **`17162da`** — `fix(property): add sizes prop to fill <Image> in PropertyGallery (W-CONSOLE-CLEANUP image-warnings)` — added 5 `sizes` props in `PropertyGallery`:
  - 3 × `sizes="100vw"` (single-photo main, single-photo lightbox, multi-photo lightbox)
  - 2 × `sizes="(max-width: 639px) 100vw, 50vw"` (multi-photo LEFT, RIGHT)

**Verification:** browser console clean on property pages.

**Incident note:** during this work, a `.next` cache corruption (ENOENT `app-paths-manifest.json`, EPERM webpack `pack.gz` rename, POST 500) surfaced. Confirmed via `git show --stat` that the W-CONSOLE-CLEANUP commits did NOT cause it. Cleared by `rm -rf .next` + clean dev restart.

---

## 4. W-HOME-AND-NEIGHBOURHOOD — CLOSED

**Symptom:**
- Homepage geo-chip clicks navigated same-tab (lost browse state).
- Neighbourhood pages (e.g. `/toronto/midtown-central`) showed `Sold 0 / Leased 0` because SSR hardcoded zeros while a client-side fetcher would have populated them — but the initial-data path never triggered the client fetch.
- AreaPage split-type (Homes / Condos sub-tabs) had the same hardcoded-zero bug for `homeCounts.sold/leased` + `condoCounts.sold/leased`.

**Fixes (three commits, Option B — SSR-side counts):**
- **`3d595f9`** — `feat(home): open homepage geo-chips in a new tab` — `<a target="_blank" rel="noopener noreferrer">` added inside `QUICK_CHIPS.map` in `BrowseListingsView.tsx`.
- **`0ae3834`** — `fix(neighbourhood): compute Sold + Leased counts at SSR` — added 2 count queries to neighbourhood `page.tsx` Promise.all (sold + leased, vow=true, status=Closed), replaced `sold: 0 / leased: 0` hardcodes in `initialCounts` + `stats` + `GeoHero <stats>` prop.
- **`7c368fa`** — `fix(area): compute split-type Sold + Leased counts at SSR (W-HOME-AND-NEIGHBOURHOOD Fix 2 part-2)` — added 4 split-type count queries (home/condo × Sold/Leased) to `AreaPage.tsx` Promise.all + wired into `homeCounts`/`condoCounts`.

**Outcome:** all 4 geo-page types (community, municipality, neighbourhood, area) now use the same SSR-side Closed-status count pattern — convergence achieved. **This convergence directly enabled W-GEO-COUNT-FIX below** (one consistent call site to swap).

---

## 5. W-GEO-COUNT-FIX — CLOSED (F-POSTGREST-COUNT-EXACT-SILENT-500 RESOLVED)

**The headliner.** Closes the long-standing finding that high-volume Closed-status geos rendered `0/0` for Sold/Leased counts.

### Symptom

- `walliam.ca/toronto` (area, 35 munis): Sold `0`, Leased `0` (real values: 53k / 139k)
- `walliam.ca/toronto/downtown` (large neighbourhood): Sold `0`, Leased `0` (real: 11k / 62k)
- `walliam.ca/toronto/midtown-central` (mid-size neighbourhood): worked (7k / 18k)
- Active counts always worked.

Volume-driven, not page-specific. Cached for 5 minutes by `unstable_cache` — so users saw stale 0s long after underlying conditions resolved.

### Root cause

Three-layer defect:

1. **PostgREST authenticator timeout.** Service-role exact-count queries (`supabase.from('mls_listings').select('id', { count: 'exact', head: true })...`) flow through PostgREST under the authenticator role, which has a Supabase default 8-second `statement_timeout`. Toronto-area-leased (139,338 rows) takes ~9 seconds on the DB — exceeds the ceiling → query cancelled → 500 with empty body.
2. **Silent null fallback.** supabase-js surfaces `{ count: null, error: <500> }` on the cancel. The SSR code did `count ?? 0` / `count.count || 0` — null coerces to 0 with no log surface, no boundary trigger, no banner. **0 indistinguishable from "real 0".**
3. **`unstable_cache` poisoning.** The whole SSR data-fetch function is wrapped in `unstable_cache(..., { revalidate: 300 })`. The function resolves successfully (it returns `0`, not a rejection), so Next.js caches the `0` for 5 minutes. Subsequent requests serve the cached 0 without re-attempting the DB query. Even when the next attempt would have succeeded, the cache held the bad value.

### Fix shape

**`countDirect` via pg-direct, with three load-bearing properties:**
1. Bypasses PostgREST → 30-second pool-level `statement_timeout` instead of 8s.
2. Returns a real number **or throws** — no silent null path.
3. Throws on timeout → wrapped `unstable_cache` function rejects → **Next.js does not cache rejected promises**, so the failure is never persisted.

### Commits

- **`84f44b2`** — `feat(db): add pg-direct pool + countDirect helper (W-GEO-COUNT-FIX 1/2)`
  - New `lib/db/pg.ts`: module-scoped `pg.Pool` (HMR-safe via `globalThis.__wGeoCountFixPool`), `max: 10`, `idleTimeoutMillis: 30s`, `connectionTimeoutMillis: 5s`, `statement_timeout: 30s`.
  - Rejects port 6543 (Supabase transaction pooler — incompatible with session-scoped features).
  - `countDirect(filter)`: parameterized `SELECT count(*)::int FROM mls_listings WHERE ...`. Geo selector union: `area_id | municipality_id | community_id | municipality_ids`. Optional `property_subtype_in[]`.
  - **Anti-poisoning invariant documented in source comment:** no `try/catch return 0` — throws propagate to caller's `Promise.all` and out of `unstable_cache`.
  - + `scripts/smoke-w-geo-count-fix.js` — 4-sample smoke (3 geo levels + timeout assertion + pool-leak check + concurrent safety).

- **`e54c6d4`** — `fix(geo): route Closed-status counts via pg-direct (W-GEO-COUNT-FIX 2/2)`
  - 12 call-site swaps via `scripts/patch-w-geo-count-fix-pages.js`:
    - 2 in `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` (sold + leased)
    - 6 in `app/[slug]/AreaPage.tsx` (sold + leased main + home-split sold/leased + condo-split sold/leased)
    - 2 in `app/[slug]/CommunityPage.tsx` (sold + leased)
    - 2 in `app/[slug]/MunicipalityPage.tsx` (sold + leased)
  - Dropped now-unsafe `?? 0` / `|| 0` on count results (countDirect returns a number or throws).
  - Added page-level try/catch OUTSIDE the `unstable_cache` boundary that renders **"Counts temporarily unavailable"** on rejection. Critically: catch is at the page level (outside the cached function), so the failure path is never cached — next request retries fresh.

- **`cdad73b`** — `fix(db): make lib/db/pg.ts validate lazily (W-GEO-COUNT-FIX hotfix)`
  - Vercel build failure surfaced: `next build` page-data collection evaluates page modules without `DATABASE_URL` in env → top-level `throw` crashed build.
  - Moved connection-string resolution + port-6543 reject + Pool construction out of module top-level into `getPool()` (private, called by `countDirect`).
  - Module import now side-effect-free; throw only fires when a count is actually requested at runtime.
  - All prior guarantees preserved.
  - Verified locally with `.env.local` moved aside: `npm run build` exit 0; `/comprehensive-site/toronto/[neighbourhood]` compiled as ƒ (Dynamic).

### Vercel env-var landing

- `vercel env ls production` before: zero connection-string env vars present (DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING all absent). Runtime logs confirmed the "absent" variant of the throw, not port-6543 rejection.
- Operator set `DATABASE_URL` in Production + Development (Preview skipped — CLI v51 requires interactive branch disambiguation in non-interactive mode).
- Value fingerprint: `postgr...gres`, length 109, scheme `postgresql://`, host `aws-1-ca-central-1.pooler.supabase.com` (Session pooler — IPv4-safe on Vercel serverless), port `5432`, password real (13 chars, no placeholder, no shell-special chars).
- Redeployed via `vercel --prod --yes` → deployment `dpl_J5gHpiQCs1CCPcLP8xAhqmEriDD7`, ready in ~2 min.

### Live verification (production, post-redeploy)

All 8 sampled pages render REAL Closed counts (no "Counts temporarily unavailable" banner):

| URL | Type | Sold | Leased | Active |
|---|---|---|---|---|
| `walliam.ca/toronto/midtown-central` | neighbourhood | 7,381 | 18,452 | 3,082 |
| `walliam.ca/toronto/downtown` | neighbourhood | 10,996 | 62,198 | 5,622 |
| `walliam.ca/toronto` | **area (killer case)** | **53,241** | **139,353** | 10,740 |
| `walliam.ca/mississauga` | municipality | 12,511 | 21,390 | 3,871 |
| `walliam.ca/toronto-c01` | municipality | 7,562 | 39,318 | 3,432 |
| `walliam.ca/whitby` | municipality | 3,652 | 2,292 | 598 |
| `walliam.ca/blue-grass-meadows` | community | 385 | 193 | 44 |
| `walliam.ca/downtown-whitby` | community | 298 | 269 | 65 |

**Toronto-area went from `0 / 0` → `53,241 / 139,353`.** The 139K-row case that exceeded PostgREST's 8s ceiling now returns under pg-direct's 30s ceiling (~9s actual).

### Multi-tenant note

`mls_listings` has **no `tenant_id`** (verified via information_schema + CLAUDE.md "Verified key IDs"). The data is the global PropTx VOW feed shared across all tenants — `available_in_vow=true` is a RESO distribution-channel flag, not a tenant filter. `countDirect` filters by `municipality_id` / `area_id` / `community_id` only — tenant-agnostic by design, correct, no leak.

---

## Open follow-ups (logged, not done this session)

1. **Optional partial index** on `mls_listings (municipality_id, available_in_vow, transaction_type) WHERE standard_status='Closed'` (+ `area_id` sibling). Would drop the ~9s Toronto-area-leased query to sub-second. **Correctness already fixed; this is perf only.** DB MIGRATION — gated, defer to a dedicated apply-runner phase.

2. **Preview-scope DATABASE_URL** not set in Vercel. CLI v51 `vercel env add ... preview` returned `git_branch_required` even with the documented "all preview branches" form. Production + Development cover the critical paths; add Preview when PR-preview testing of geo pages is needed.

3. **`app/api/admin-homes/territory/reroll-worker/route.ts`** shared the same missing-env gap pre-this-session — it uses the identical `DATABASE_URL || SUPABASE_DB_URL || POSTGRES_URL || POSTGRES_URL_NON_POOLING` fallback chain. Likely now functional in production since `DATABASE_URL` was set; **verify on next cron run** before assuming.

4. **F-ESTIMATOR-BUILDING-NO-COMPARABLES-LOG-LIES** (P3, pre-existing). `lib/estimator/comparable-matcher-sales.ts:46-49` (+ rentals sibling) logs `console.error('Error fetching comparables:', error)` with `error: null` on empty-result. Misleading log. Split the early-return into 3 distinct messages (no-rows-without-error vs supabase-error vs unexpected).

5. **`system_settings` "permission denied" (42501)** observed at build-time static-gen step. Pre-existing, unrelated to this session. Note for a future grants-review pass.

---

## Anti-poisoning invariant — load-bearing design decision

`countDirect` **must not** catch its own errors and return 0. Future edits will look at the function and think "let me add a `try/catch return 0` for safety" — that re-creates the exact bug this whole workstream existed to fix. The invariant is documented in `lib/db/pg.ts` source comment + here:

- pg-direct timeout throws Postgres code `57014` (query_canceled).
- The throw propagates through `Promise.all` in the wrapped `unstable_cache` function.
- Next.js does NOT cache rejected promises.
- The next request retries fresh — no cached 0 to wait out.
- Catching and returning 0 here would: (a) silently mask the timeout, (b) be cached for 5 minutes by `unstable_cache`, (c) reproduce the original cache-poisoning bug at a new layer.

The graceful-degrade UI ("Counts temporarily unavailable") lives at the **page component level, outside the cache boundary** — that's where degrade UX belongs, not inside `countDirect`.

---

## Files of record

- New: `lib/db/pg.ts`, `scripts/smoke-w-geo-count-fix.js`, `scripts/patch-w-geo-count-fix-pages.js`, `scripts/diag-count-volume-threshold.js`
- Modified: `app/comprehensive-site/toronto/[neighbourhood]/page.tsx`, `app/[slug]/AreaPage.tsx`, `app/[slug]/CommunityPage.tsx`, `app/[slug]/MunicipalityPage.tsx`, plus the W-PROPERTY-HYDRATION + W-MOBILE-RESPONSIVE + W-CONSOLE-CLEANUP + W-HOME-AND-NEIGHBOURHOOD touches enumerated above.
- Backups: timestamped `.backup_<ts>` per CLAUDE.md Rule Zero — not committed (no-noise convention).

## Session commit log (chronological, all pushed to `origin/main`)

```
cdad73b  fix(db): make lib/db/pg.ts validate lazily (W-GEO-COUNT-FIX hotfix)
e54c6d4  fix(geo): route Closed-status counts via pg-direct (W-GEO-COUNT-FIX 2/2)
84f44b2  feat(db): add pg-direct pool + countDirect helper (W-GEO-COUNT-FIX 1/2)
7c368fa  fix(area): compute split-type Sold + Leased counts at SSR (W-HOME-AND-NEIGHBOURHOOD Fix 2 part-2)
0ae3834  fix(neighbourhood): compute Sold + Leased counts at SSR (W-HOME-AND-NEIGHBOURHOOD Fix 2)
3d595f9  feat(home): open homepage geo-chips in a new tab (W-HOME-AND-NEIGHBOURHOOD Fix 1)
17162da  fix(property): add sizes prop to fill <Image> in PropertyGallery (W-CONSOLE-CLEANUP image-warnings)
67bb7c5  chore(property): strip debug console.log lines from property/charlie tree (W-CONSOLE-CLEANUP)
7dd07ee  fix(geo): wrap mobile tab rows instead of horizontal-scroll (W-MOBILE-RESPONSIVE C)
3a5dcf6  fix(mobile): Charlie bar global clearance + stack above PropertyStickyBar (W-MOBILE-RESPONSIVE A+B)
cce15e4  fix(property): de-duplicate home-header address (h1 shows street, p shows remainder)
f9e6857  fix(property): pin locale + timezone on render-time formatters -- close React #418/#423/#425 hydration mismatch
e74efb5  fix(property): use Supabase singleton in client components -- close "Multiple GoTrueClient instances"
```

Production deploy: `dpl_J5gHpiQCs1CCPcLP8xAhqmEriDD7` (`condoleads-o4b8oawrz-condoleads-projects.vercel.app`) — READY, aliased to `condoleads.ca` and `walliam.ca`.
