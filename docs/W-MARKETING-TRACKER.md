# W-MARKETING-TRACKER — Aily.ca go-to-market plan

Master marketing tracker. Structured by **LANE** (who executes) +
**PRIORITY**. Created 2026-06-30 in UNIT 62. Lane A pre-populated
from the UNIT 61 SEO recon (which audited title/description/canonical/
OG/JSON-LD/H1 across every page type and scoped sitemap URL counts).

Tags per item: `[DEV]` = engineering build, `[OPS]` = operator-side
console/dashboard/account work, `[DECISION]` = strategic call the
operator owns, `[CONTENT]` = writing/creative production.

Status: `READY` = unblocked, can start now; `BLOCKED` = waiting on
another lane/decision; `IN-PROGRESS`; `DONE`; `DEFERRED`.

---

## SEQUENCING

Order is **SEO foundation (Lane A) → Analytics (Lane C) → Ads (D) +
Content/Social (E) in parallel**.

Rationale:
1. **SEO foundation first** (Lane A). It's free, it compounds, and
   it's the only marketing channel where the asset (organic ranking)
   is yours forever. Every day post-launch without crawl
   infrastructure is a day of lost compounding. Internal linking
   (Lane B) follows naturally.
2. **Analytics before paid/content** (Lane C). You cannot optimize
   what you cannot measure. GA4 + Search Console + conversion
   tracking must be live BEFORE Ads campaigns or content pushes —
   otherwise you spend money/effort blind and have no signal to
   refine.
3. **Ads + Content + Social in parallel** (Lanes D + E). Once a
   crawlable, measurable site exists, paid acquisition + organic
   content amplification + social presence all layer on. They share
   the analytics foundation but have independent execution paths.
4. **Strategy decisions** (Lane F) gate items across the other
   lanes. Resolve early to unblock parallel work.

---

## LANE A — SEO Technical Foundation `[DEV]`

**Pre-populated from UNIT 61 SEO recon.**

**Current state** (UNIT 61): URLs clean ✓, SSR good ✓. **GAPS**: no
sitemap, no robots.txt, canonical only on building pages, JSON-LD only
on buildings (no `RealEstateListing` on properties), no H1 on home or
property pages, generic homepage title without keyword anchor.

### A-UNIT-1 — Crawl foundation `[DEV]` — STATUS: **COMPLETE** (both halves SHIPPED 2026-07-01)

**SHIPPED 2026-07-01** (A-UNIT-1 first half, commit e303773 — robots.ts + noindex):
  - **`app/robots.ts`** — dynamic per-host route. Config-derived
    policy (no brand-string branch):
      Branch 1 comprehensive tenant (via `getCurrentTenantId` -> `tenants.domain`) -> Allow / + `Sitemap: https://${host}/sitemap.xml` pointer
      Branch 2 owner promo (`condoleads.ca` / `01leads.com` inc. www) -> Allow /, no sitemap
      Branch 3 everything else (legacy agent hosts, unknown) -> Disallow /
    Fail-closed on unknown hosts (Disallow). New comprehensive
    tenants auto-allowed by their `tenants.domain` row -> zero
    code change per new tenant.
  - **`middleware.ts` X-Robots-Tag: noindex, nofollow**
    on legacy agent hosts only (agent resolved + non-comprehensive
    site_type + not owner promo). De-indexes already-indexed
    agent pages; robots Disallow alone would only block future
    crawl, not evict existing indexed URLs.
  - **Middleware path exclusions added**: `/robots.txt` and
    `/sitemap.xml` skipped by both the 01leads rewrite branch
    AND the comprehensive-site rewrite branch (Next.js Metadata
    Files must live at the root of every host, not under
    `/comprehensive-site/*` or `/zerooneleads/*`).
  - Local smoke 9/9 passes (aily.ca + www, condoleads.ca + www,
    01leads.com + www, yourcondorealtor.ca, viyacondex.condoleads.ca,
    syedshah.condoleads.ca).

**SHIPPED 2026-07-01** (A-UNIT-1 second half, this commit — sitemap + canonicals):

  - **`app/sitemap.ts`** — 5-child sitemap-index served via Next.js
    `generateSitemaps` at `/sitemap.xml/[id]` (index at `/sitemap.xml`
    auto-serves in PRODUCTION per next-metadata-route-loader.js:157
    which gates on `NODE_ENV === "production"`; dev serves children
    only — production probe post-deploy will verify the index).
    Local smoke on aily.ca:
      /sitemap.xml/0: 50,000 listing URLs (chunk 0)
      /sitemap.xml/1: 50,000 listing URLs (chunk 1)
      /sitemap.xml/2:    409 listing URLs (chunk 2)
      /sitemap.xml/3:  4,580 building URLs (quality-gated)
      /sitemap.xml/4:  2,543 geo URLs (1948 comm + 506 muni + 73 area
                                       + 9 nbhd + 7 dev)
      Total: ~107,500 URLs.
    Non-tenant hosts (yourcondorealtor.ca, viyacondex.condoleads.ca,
      condoleads.ca): each returns `[]` (empty sitemap) — host gate
      mirrors robots.ts Branch 1.
    Listing predicate: `standard_status IN ('Active','Active Under
      Contract')` AND (`property_type = 'Residential Condo & Other'`
      OR `property_type = 'Residential Freehold' AND property_subtype
      IN residential-home-subtypes`). Filter mirrors HomePropertyPage.
      tsx:87 gate so sitemap URLs match what the site actually serves.
    Building predicate: `slug IS NOT NULL AND cover_photo_url IS NOT
      NULL AND EXISTS (active listing)`. Single SQL EXISTS clause.
    Geo predicate per table: `slug IS NOT NULL` + `is_active` on
      communities + neighbourhoods.
    lastmod: `modification_timestamp` (COALESCE to `updated_at`) on
      listings; `updated_at` on buildings + geo.
    Efficiency: pg-direct via DATABASE_URL with `SET statement_timeout
      = 0` for the two large scans (listings + buildings). Supabase-js
      caps at 5000 rows per query (verified during build; even
      `.range(0, 100000)` clamps). Geo stays on Supabase-js (all
      queries < 2k rows). Chunks 0 + 1 take ~30s each cold; revalidate
      3600 (1 hour) means each is cached after first hit — MLS
      refreshes hourly so cadence matches.
    NO changefreq, NO priority (Google largely ignores; noise).

  - **Canonicals added / fixed** — mirror the tenant-normalized pattern
    with self-host fallback via new shared `lib/utils/canonical.ts`
    `resolveCanonicalHost()` helper:
      home                    (both app/page.tsx + app/comprehensive-site/page.tsx —
                              aily's / rewrites to /comprehensive-site/)
      condo property          (app/property/[id]/page.tsx — dual-URL defense
                               canonical to slug URL when generatable)
      home property           (app/property/[id]/HomePropertyPage.tsx — same)
      municipality            (app/[slug]/MunicipalityPage.tsx)
      community               (app/[slug]/CommunityPage.tsx)
      development             (app/[slug]/DevelopmentPage.tsx)
      neighbourhood           (app/comprehensive-site/toronto/[neighbourhood]/page.tsx)
      area — FIXED FALLBACK   (app/[slug]/AreaPage.tsx: previous fallback of
                               'www.condoleads.ca' when tenant lookup failed
                               would emit `https://www.condoleads.ca/${slug}`
                               canonical on aily pages — the exact leak
                               UNIT 56 flagged. Fix: fall back to raw request
                               host, never a different domain. Delegated to
                               resolveCanonicalHost so same rule applies to
                               every page-type canonical uniformly.)

  - **Canonical fallback policy**: `resolveCanonicalHost()` prefers
    `tenants.domain` (normalized www/apex per DB); falls back to the
    raw request host (self-canonical). Never a different domain.

  - **Middleware exclusions extended**: `/sitemap.xml/*` (child
    sitemaps) also excluded from both the /comprehensive-site rewrite
    and the /zerooneleads rewrite. Next 14 serves child sitemaps at
    `/sitemap.xml/[id]` (dot in the segment, not `/sitemap/[id].xml`)
    — startsWith check catches both index + children.

**Known follow-up (not blocking A-UNIT-1)**:
  - `/toronto` canonical currently emits `https://aily.ca/toronto-area`
    (uses `area.slug` DB value which has the `-area` suffix for some
    areas) instead of the URL slug `toronto`. Pre-existing pattern in
    AreaPage.tsx; not introduced by this UNIT. Fix requires threading
    the URL slug through the metadata call; deferred to a follow-up
    (low SEO impact — Google will accept the canonical either way; the
    `-area` URL is a valid alternate that also serves).
  - `/property/[UUID]` on aily returns 404 (middleware rewrites into
    `/comprehensive-site/property/[UUID]` which doesn't exist) — this
    is _natural_ de-canonicalization: Google will drop indexed UUID
    URLs, only the slug URLs survive. Canonical code in place for
    legacy hosts (where /property/[UUID] still serves), harmless on
    aily.

### Post-launch stabilization (2026-07-01, same day — sitemap rebuild journey)

The metadata-route approach in `ed9de36` deployed cleanly but the
sitemap route silently failed to register on Vercel — `/sitemap.xml`
+ every `/sitemap.xml/[id]` returned 404 with a `[slug]` catchall
marker. Root-caused, rebuilt, and re-shipped over the course of a
single day. Final architecture:

**Full SHA chain for A-UNIT-1 (in chronological order)**:
  - `e303773` — A-UNIT-1a robots.ts + middleware X-Robots-Tag noindex
                on legacy agent hosts (LIVE, correct)
  - `ed9de36` — A-UNIT-1b (first attempt): sitemap metadata route +
                pg-direct, plus 8 canonicals + AreaPage fallback fix.
                Canonicals + robots correct; sitemap route FAILED to
                register on Vercel (silent — no build error).
  - `e03a35d` — HOTFIX runtime='nodejs'+dynamic='force-dynamic' pin —
                did not fix; sitemap still 404.
  - `d324c22` — DIAGNOSTIC trivial 3-URL metadata sitemap — proved
                registration works with zero non-type imports.
  - `373640a` — DB migration: 3 sitemap RPC functions committed
                (`get_sitemap_listings`, `get_sitemap_buildings`,
                `get_sitemap_geo_slugs`). Applied to prod same session.
  - `b05fbc9` — restore sitemap via supabase.rpc (still metadata
                route). Also FAILED to register — proved the failure
                is NOT pg-specific; ANY non-type import trips the
                metadata-route loader on Vercel.
  - `52c6e97` — Stage 0 revert to diagnostic (Vercel webhook never
                fired for this commit; harmless — superseded).
  - `7cecbf0` — STAGE 1: sitemap rebuilt as Route Handler
                (`app/sitemap.xml/route.ts` + `app/sitemap/[id]/route.ts`),
                trivial data. Route Handler mechanism REGISTERED.
  - `333c99a` — STAGE 2: real data through the Route Handler via RPC +
                slug-gen + middleware `/sitemap/` exclusion. Deployed
                but chunks 1+2 empty due to statement_timeout.
  - `653ffdd` — TIMEOUT FIX: SET statement_timeout=0 in each of the
                3 SQL functions + composite `(standard_status, id)`
                index CONCURRENTLY. Applied to prod.
  - `aa9d3c1` — PARTIAL INDEX SWAP: composite was never used by
                planner (rejected MergeAppend across 2 status values);
                dropped and replaced with predicate-matching partial
                `idx_mls_listings_sitemap` (2.6 MB vs 57 MB). Sitemap
                queries went from 25s to ~1s. Applied to prod.
  - `bbe7e65` — DEV-URL FIX: removed developments UNION branch from
                `get_sitemap_geo_slugs()` after production probe
                showed all 7 development URLs 404 despite dispatch
                code + DB rows existing. Applied to prod. **This
                commit closes A-UNIT-1.**

**Live sitemap on aily.ca (post-`bbe7e65`)**:
  - `/sitemap.xml` — 4-child sitemap-index (2 listings + 1 buildings + 1 geo)
  - `/sitemap/0` — 50,000 listing URLs (offsets 0..49999)
  - `/sitemap/1` — 36,144 listing URLs (offsets 50000..86143)
  - `/sitemap/2` — 4,574 building URLs
  - `/sitemap/3` — 2,536 geo URLs (community 1948, muni 506, treb_area
                    73, neighbourhood 9; developments removed)
  - **Total: 93,254 URLs**
  - Zero slug-skips on the listings path — every row with a
    `listing_key` produced a valid slug.

**Timings (measured cold via `?_cb=<ts>` cache-bust, warm via same URL
re-hit)**:
  - `/sitemap/0` — cold 12.0s, warm 5.6s
  - `/sitemap/1` — cold  7.2s, warm 9.3s (variance on warm; near cold)
  - `/sitemap/2` — cold 22.2s, warm 21.5s (buildings NOT helped by
                    partial listings index; its own EXISTS predicate
                    dominates)
  - `/sitemap/3` — cold  8.9s, warm 1.6s
  - All well under Vercel's 60s per-invocation ceiling.

**Isolation review** (post-rebuild):
  - Route handlers use `serviceClient()` (SUPABASE_SERVICE_ROLE_KEY).
    Host gate (`OWNER_PROMO_HOSTS` set + `getCurrentTenantId()` null-
    check) fires BEFORE any DB call — non-tenant hosts get empty XML
    with zero DB reads. Verified on `condoleads.ca` (owner promo):
    empty `<sitemapindex/>` and empty `<urlset>`.
  - SQL functions all `SECURITY DEFINER` + `SET search_path = public,
    pg_temp` + `SET statement_timeout = 0` + `GRANT EXECUTE ONLY TO
    service_role`. No `SELECT *`.
  - mls_listings / buildings / geo tables: no `tenant_id` per
    CLAUDE.md (shared MLS/geo). Tenant scoping is at the route layer.

### LEARNINGS — patterns to remember (2026-07-01)

  1. **Metadata Route convention silently fails to register on Vercel
     for any file with non-type imports.** The `next-metadata-route-
     loader.js` module analyzer accepts trivial files (pure inline
     data) but rejects the file — silently, no build error — when
     the module graph includes `pg`, `@supabase/supabase-js`, or
     even the app's own `lib/utils/tenant-resolver`. Diagnosis path:
     if `/sitemap.xml` returns HTML 404 with `"slug","sitemap.xml","d"`
     in the response body, the route was never registered — the
     `[slug]` catchall handled it. **Solution: use Route Handlers
     (`app/<path>/route.ts` with `export async function GET`) instead
     of the Metadata Route convention.** Route Handlers use a
     different loader path and don't suffer from this.

  2. **PostgREST connects as `authenticator` role which has an 8s
     `statement_timeout` set at role-login time.** `SET LOCAL ROLE
     service_role` per request does NOT reset the timeout — GUCs
     don't reset on `SET ROLE`. Even calling with the
     `SUPABASE_SERVICE_ROLE_KEY` inherits the 8s cap. **Solution:
     per-function `SET statement_timeout = 0`** in the function
     declaration. The pooler does not override — proven via
     `sb.rpc()` end-to-end. If a function scans large tables or
     runs long-lived aggregates, it must set its own timeout.

  3. **Composite index `(status, id)` rejected by the planner for
     `IN (status1, status2)` queries.** With 2 status values the
     planner considers MergeAppend more expensive than `Index Scan
     on idx_listings_status + external merge sort`. Even forced with
     `SET enable_seqscan=off + enable_sort=off` the composite is
     ignored. **Solution: partial index whose WHERE clause matches
     the query's WHERE literally** (`WHERE status IN (...) AND
     property_type = ... OR (...)`) — the planner recognizes it as
     pre-filtered and uses an index-order scan, eliminating the
     sort. Storage: ~1-2MB (86k entries) vs 30MB for the composite.

  4. **COUPLED-PREDICATE seam**: `idx_mls_listings_sitemap`'s WHERE
     clause MUST stay byte-identical to `get_sitemap_listings()`'s
     WHERE clause. If they drift, the partial index is silently
     rejected and the sitemap drops back to ~15s per rpc call with
     no error — only an EXPLAIN would show it. Documented in the
     migration SQL header block; any future edit to either predicate
     requires a matching edit to the other in the same dispatch.

### OPEN FOLLOW-UPS (logged so nothing is lost)

  1. **DEVELOPMENT DISPATCH BUG** — `/<development-slug>` returns 404
     on aily.ca for all 7 developments despite:
       - Dispatch code at `app/[slug]/page.tsx:145` and
         `app/comprehensive-site/[slug]/page.tsx:95-97`
       - DB rows existing in `developments` for all 7 slugs
       - `developments` table has `relrowsecurity=false` (no RLS)
       - Direct `supabase-anon .from('developments').eq('slug', ...)`
         returning the row correctly
     Suspected: interaction with the middleware `/comprehensive-
     site/` rewrite path OR the module-scoped `supabase` import in
     `comprehensive-site/[slug]/page.tsx:11` (`@/lib/supabase/client`
     is client-side; server context may misbehave). **Verify the
     bug is developments-ONLY, not a broader rewrite-layer class**
     (before fixing, sample muni/area/community dispatch under the
     same path to prove they don't ALSO have subtle route bugs).
     Developments removed from sitemap in `bbe7e65`; re-add per the
     migration comment when fixed.

  2. **Buildings chunk ~22s cold** — buildings uses a different
     predicate (`EXISTS` on `building_id` subquery, `~4574` rows).
     The listings partial index doesn't help. Acceptable at current
     data volume (well under Vercel 60s limit), but if `buildings`
     grows or the EXISTS subquery slows, a supporting index on
     `mls_listings (building_id, standard_status)` — or on
     `buildings (slug, cover_photo_url) WHERE both NOT NULL` —
     would help.

  3. **`OWNER_PROMO_HOSTS` Edge/Node duplication seam** — the set
     `{condoleads.ca, 01leads.com}` is declared in three places
     that can't share modules (Edge vs Node runtimes): `middleware.
     ts`, `app/robots.ts`, and both sitemap route handlers.
     Adding a new promo host = 4 edits. Not blocking, but tracked.

  4. **~400 untracked files in tree** including live route dirs
     (`app/api/parity-probe-*`, `app/api/probe-condo-resolver/`,
     `app/api/test-estimator-sections/`). Audit whether these are
     shipping to production as live routes and if so whether they
     leak data or provide unauthenticated access. Not touched by
     A-UNIT-1 but critical hygiene.

  5. **/property/[UUID] broken links** — 4 pre-existing call sites
     linking to the UUID route which 404s on aily:
       - `app/api/search/route.ts:104`
       - `app/estimator/components/EstimatorResults.tsx:1197`
       - `components/dashboard/WorkingDocView.tsx:142`
       - `components/property/HomeAddressHistoryModal.tsx:130`
     Pre-A-UNIT-1; canonical code in `app/property/[id]/page.tsx`
     is dead on aily but harmless. Fix = swap link generation to
     use `generatePropertySlug` / `generateHomePropertySlug`
     everywhere.

  6. **Route `GEO_PATH_PREFIX` map has unused `development`
     entry** in `app/sitemap/[id]/route.ts`. Harmless — the SQL
     function no longer emits `kind='development'` — but should
     be pruned when developments return, or immediately if we
     want a clean map.

**Isolation review (mandatory for tenant-scoped work)**:
  - Every query in `app/sitemap.ts` scopes as follows:
    - listings: filtered by `standard_status IN ('Active','Active
      Under Contract')` + `property_type/subtype` filter mirroring
      the render gate. No tenant column exists on `mls_listings` per
      CLAUDE.md — the DATA is tenant-neutral market data. The route
      itself gates on `getCurrentTenantId()` (host resolves to
      comprehensive tenant) BEFORE any listing query runs.
    - buildings: `slug IS NOT NULL AND cover_photo_url IS NOT NULL
      AND EXISTS (active mls_listing)`. Same tenant-neutral posture
      + same host gate.
    - geo (comm/muni/area/nbhd/dev): `slug IS NOT NULL` + `is_active`
      where applicable. Same posture.
  - Non-tenant host response verified `[]` empty (yourcondorealtor.ca
    / viyacondex.condoleads.ca / condoleads.ca all confirmed 0-URL
    sitemap during smoke).
  - NO `SELECT *` on tenants or agents — sitemap doesn't touch either
    table. Canonical helper's `getTenantByHost` uses tenants column
    allow-list.
  - Host-gate cannot emit a sitemap for a non-tenant host:
    `resolveRequestContext()` returns `isTenant: false` for owner promo
    hosts (in OWNER_PROMO_HOSTS set) + for any host where
    `getCurrentTenantId()` returns null. Both branches make the sitemap
    handler return `[]` before any DB query fires.

Files changed in this half (this commit):
  app/sitemap.ts                                                   (NEW)
  lib/utils/canonical.ts                                           (NEW)
  middleware.ts                                                    (extend exclusions)
  app/page.tsx                                                     (canonical via helper)
  app/comprehensive-site/page.tsx                                  (canonical via helper)
  app/property/[id]/page.tsx                                       (dual-URL canonical)
  app/property/[id]/HomePropertyPage.tsx                           (dual-URL canonical)
  app/[slug]/AreaPage.tsx                                          (FIX fallback via helper)
  app/[slug]/MunicipalityPage.tsx                                  (canonical via helper)
  app/[slug]/CommunityPage.tsx                                     (canonical via helper)
  app/[slug]/DevelopmentPage.tsx                                   (canonical via helper)
  app/comprehensive-site/toronto/[neighbourhood]/page.tsx          (canonical + tenant-aware brand)
  docs/W-MARKETING-TRACKER.md                                      (this delta)

### A-UNIT-4 — Geo-page unique content from geo_analytics `[DEV]` — STATUS: **READY** (HIGH priority ranking lever)

Templated geo pages (area, muni, community, neighbourhood) currently
share the same title-shape + description pattern (per UNIT 61 R1).
Google's Panda / helpful-content signals penalize templated pages
without unique substantive data. UNIT 53 established `geo_analytics`
has per-geo real numbers (median_sale_price, avg_psf, active_count,
closed_sale_count_90, closed_avg_dom_90, absorption_rate_pct,
months_of_inventory, etc.). Surface these visibly on each geo page
so every page has UNIQUE market data. Turns "generic templated" into
"real data page" — the exact kind of content Google's helpful-content
system rewards.

Approach: single reused server component reads `geo_analytics` for the
current geo (via getGeoAnalyticsForCurrentPage helper) and renders
stat cards + a mini sparkline (same pattern as UNIT 53's homepage
CondoMarketActivity). Mount on Area / Muni / Community / Neighbourhood
pages. Fallback: if `low_volume_flag=true` for this geo, hide the
whole panel (never emit thin data). Fully data-driven; multi-tenant
neutral by construction (geo_analytics has no tenant_id per UNIT 52
R6).

Dependencies: none. Ships independently of A-UNIT-1 completion (which
this commit closes). Follows the same "read-only, tenant-neutral,
data-quality-gated" posture as UNIT 53.

### Known seams (log for future refinement)

  - **`OWNER_PROMO_HOSTS` duplication** across `middleware.ts` (Edge
    runtime) and `app/robots.ts` + `app/sitemap.ts` (Node runtime).
    Middleware runs in Edge; robots/sitemap in Node. No shared-module
    import possible across runtimes. Adding a promo host requires
    editing three files: middleware.ts + app/robots.ts + app/sitemap.
    ts. Not blocking, but tracked so operator knows to touch all
    three in sync.

  - **AreaPage canonical uses DB slug not URL slug** — pre-existing
    behavior; `/toronto` emits `canonical: /toronto-area` because
    `treb_areas.slug = 'toronto-area'` while the URL is `/toronto`
    (via `findArea`'s fallback). Google accepts as valid alternate;
    fix requires threading `params.slug` through metadata helper.
    Deferred.

### Next dispatch: B-UNIT-1 (internal linking, coupled to sitemap)

Sitemap tells Google WHAT exists. Internal linking tells Google WHAT
MATTERS most and distributes rank across the site. B-UNIT-1 builds
programmatic cross-links: building pages -> community + area, community
-> its buildings + parent muni, etc. Complements A-UNIT-1's sitemap
by improving crawl depth + rank flow. Ready to dispatch.

### A-UNIT-2 — Structured data / JSON-LD `[DEV]` — STATUS: **READY** (HIGHEST SEO value per UNIT 61 R4)

  - **`RealEstateListing` / `SingleFamilyResidence` on property
    pages** — THE single highest-ROI SEO move for a real-estate
    site. Existing DB data covers every required field: address,
    price, beds, baths, sqft, photos, transaction_type. ~80 lines
    per page-type schema builder. Unlocks rich SERP results
    (price + photo card in search). Apply to both
    `app/property/[id]/page.tsx` (condo) and
    `app/property/[id]/HomePropertyPage.tsx` (home).
  - **`LocalBusiness` / `RealEstateAgent` on homepage** — site-
    wide brand schema. Unlocks Knowledge Graph eligibility,
    branded SERP enhancement.
  - **`BreadcrumbList` on building / area / muni / community
    pages** — pairs with Lane B-3 UI work; unlocks breadcrumb
    display in SERP results.
  - **Fix existing `BuildingSchema.tsx`**: uncomment + populate
    `geo` lat/long block (commented out at lines 23-27;
    `buildings.latitude`/`longitude` are populated in the DB).
    ~3-line fix; richer building rich-results.
  - **Dependencies**: independent of A-UNIT-1. Can ship in
    parallel.

### A-UNIT-3 — On-page basics `[DEV]` — STATUS: **READY**

  - **H1 on homepage** (keyword + brand anchor; currently 0 H1
    tags per UNIT 61 R7) — e.g. "AI-Powered GTA Real Estate
    Search". One sentence add.
  - **H1 on property pages** (address as H1; currently 0) —
    affects both PropertyPageClient and HomePropertyPage.
  - **Homepage title rewrite** — keyword-anchored. Currently
    "aily - AI Real Estate Assistant for the GTA" (brand-first,
    weak for non-branded queries). Suggested:
    "GTA Condos & Homes — AI-Powered Search | aily" or similar.
    Title is #1 ranking signal.
  - **Fix `comprehensive-site/toronto/[neighbourhood]` title** —
    currently hardcodes "CondoLeads" brand instead of tenant-
    aware brand. Should derive from tenant context.
  - **Twitter Card metadata** on home / area / muni / community
    (currently only building + property emit Twitter cards).
  - **Homepage `Cache-Control` revisit** — currently
    `private, no-cache, no-store, max-age=0, must-revalidate`.
    Consider `public, s-maxage=60, stale-while-revalidate=300`
    so edge cache absorbs traffic spikes without indexability
    cost. Not urgent but cheap win.
  - **Dependencies**: independent. Can ship in parallel with
    A-UNIT-1 / A-UNIT-2.

---

## LANE B — Internal Linking & Content Infrastructure `[DEV]`

### B-UNIT-1 — Programmatic internal linking — STATUS: **READY** (post-Lane-A)

  - Building pages link to their parent community + area +
    municipality. Community pages list their buildings. Area
    pages list muni's. Tightens the internal link graph so
    Google crawls deeper and distributes rank.
  - **Dependencies**: post-A (canonicals must exist first so
    links go to canonical URLs).

### B-UNIT-2 — Blog infrastructure — STATUS: **READY**

  - Route + render scaffolding for blog (e.g. `app/blog/[slug]`).
    NOT articles — just the platform. Static MDX or DB-backed,
    operator's call.
  - **Dependencies**: none for the platform; content authoring
    is Lane E.

### B-UNIT-3 — Breadcrumbs UI + `BreadcrumbList` JSON-LD — STATUS: **READY** (pairs with A-UNIT-2)

  - Visible breadcrumb component on building / area / muni /
    community / property pages.
  - JSON-LD twin is in A-UNIT-2 — ship them together for
    consistent SERP + on-page treatment.

---

## LANE C — Analytics & Measurement `[DEV+OPS]` (precedes Ads/content)

### C-UNIT-1 — GA4 integration — STATUS: **READY**

  - `[OPS]` Create GA4 property in Google Analytics for aily.ca.
  - `[DEV]` Add gtag.js to layout, configure consent mode,
    page-view + standard-event firing.
  - `[DEV]` Custom event tagging for key funnel actions: chat
    open, plan submit, lead form submit, building/property
    page views.
  - **Dependencies**: GA4 property created (OPS) before tag
    install (DEV).

### C-UNIT-2 — Search Console verification — STATUS: **BLOCKED** by A-UNIT-1

  - `[OPS]` Verify aily.ca in Google Search Console (DNS or HTML
    file method).
  - `[OPS]` Submit sitemap (URL from A-UNIT-1).
  - Monitor: index coverage, crawl errors, top queries,
    impression/click data.
  - **Dependencies**: A-UNIT-1 sitemap shipped + live first.

### C-UNIT-3 — Conversion tracking (lead forms → GA4 + Ads) — STATUS: **READY** (Ads side BLOCKED by D-UNIT-2)

  - `[DEV]` Fire GA4 conversion event on every lead form submit
    (Charlie buyer/seller plan submit, building contact form,
    direct contact form). Categorize by source (which page,
    which form).
  - Conversion goal/value mapping for GA4.
  - `[DEV]` Mirror to Google Ads conversion (when D-UNIT-2 lands).
  - **Dependencies**: C-UNIT-1 (GA4 must exist).

---

## LANE D — Google Ads

### D-UNIT-1 — API foundation — STATUS: **DONE** (UNIT 55, ac1dbcc)

  - Six env vars provisioned (`GOOGLE_ADS_*`), gitignored
    `.env.local`.
  - `src/lib/ads.ts` typed client wrapper.
  - 3 diagnostic scripts (`get-refresh-token.js`,
    `verify-ads-auth.js`, `list-ads-customers.js`).
  - Auth chain verified end-to-end against customer
    9565313746 ("Aily", CAD, America/Toronto) under MCC
    9809090748.
  - **Status**: dormant; no production code consumes the
    foundation yet. Ready for D-UNIT-2 wiring.

### D-UNIT-2 — Conversion wiring (Ads ← lead forms) `[DEV]` — STATUS: **BLOCKED** by C-UNIT-3

  - Upload offline conversions to Google Ads when lead forms
    fire (uses the UNIT 55 client).
  - Mirror of C-UNIT-3 GA4 events; let Ads optimize for
    lead-quality signal.
  - **Dependencies**: C-UNIT-3 (conversion event taxonomy + GA4
    integration) defines the events; this lane plumbs them to
    Ads.

### D-UNIT-3 — Campaign strategy `[DECISION + planning]` — STATUS: **BLOCKED** by Lane F

  - Search recommended as the first campaign type (intent-
    driven, lowest CPL for real estate). Display/Performance
    Max later.
  - Initial keyword set, geo targeting (GTA, then
    refinement), match types, negatives.
  - Ad copy + landing page strategy.
  - **Dependencies**: Lane F brand positioning + budget
    decision.

### D-UNIT-4 — Budget `[DECISION]` — STATUS: **BLOCKED** by Lane F

  - Daily / monthly cap; campaign-level split.

### D-UNIT-5 — Launch `[OPS]` — STATUS: **BLOCKED** by D-UNIT-2 + D-UNIT-3 + D-UNIT-4

  - Create campaigns in Ads UI, attach conversion goals from
    D-UNIT-2, enable.

---

## LANE E — Content & Social `[CONTENT + OPS + DECISION]`

### E-UNIT-1 — Blog content strategy + articles — STATUS: **BLOCKED** by Lane F (topics/voice) + B-UNIT-2 (platform)

  - `[DECISION]` topic strategy (neighbourhood guides,
    market reports, buyer/seller education, GTA-specific
    long-tail).
  - `[CONTENT]` article authoring + publishing.

### E-UNIT-2 — Social channels — STATUS: **BLOCKED** by Lane F

  - `[DECISION]` which channels (Instagram, YouTube, TikTok,
    LinkedIn, X) — match audience + brand voice + posting
    cadence sustainability.
  - `[OPS]` create accounts, brand setup, link to aily.ca.

### E-UNIT-3 — Content calendar — STATUS: **BLOCKED** by E-UNIT-1 + E-UNIT-2

  - Cadence, themes, who publishes what when.

---

## LANE F — Strategy Decisions Pending `[DECISION]` (gate other lanes)

These are operator-owned strategic choices that gate execution
elsewhere. Resolving them early unblocks parallel lanes.

  - **F-1 brand positioning / messaging** — what does aily promise
    that competitors don't? Drives D-UNIT-3 ad copy, E-UNIT-1
    article angle, A-UNIT-3 title rewrite.
  - **F-2 ad budget** — drives D-UNIT-4, campaign scale, content
    investment level.
  - **F-3 content topics + voice** — drives E-UNIT-1 article
    strategy, B-UNIT-2 blog UX decisions.
  - **F-4 social channels** — drives E-UNIT-2 platform setup +
    content adaptation.
  - **F-5 launch sequencing** — soft launch vs hard launch, paid
    + organic mix at week 1 / week 4 / month 3.

---

## Cross-lane dependency map (at-a-glance)

```
F (decisions) ────────────────┐
                              │
A-1 (crawl) ──── C-2 (Search Console) ──┐
                                        │
A-2 (JSON-LD) ──┬─ B-3 (breadcrumbs)    │
                │                       │
A-3 (on-page) ──┘                       │
                                        │
                              C-1 (GA4) │
                                  │     │
                              C-3 (conv tracking)
                                  │
                                  ├─→ D-2 (Ads conversion)
                                  │       │
                                  │   D-3,4 (strategy/budget — needs F)
                                  │       │
                                  │   D-5 (launch)
                                  │
                                  └─→ Insight loop for E-1 content
```

Lane A is the highest-priority "do now" cluster (parallel-shippable
UNITs 1/2/3). Lane C-1 (GA4) should start in parallel with A — no
A dependency on GA4 directly. Lane C-2 (Search Console) waits for
A-1's sitemap. Lanes D + E layer on once A + C are live.
