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

  1. **DEVELOPMENT DISPATCH BUG — RESOLVED 2026-07-01, commit `4d305b8`**
     — `/<development-slug>` was returning 404 on aily.ca for all 7
     developments.
     **Root cause found**: `getAgentFromHost('aily.ca')` in
     `lib/utils/agent-detection.ts:99-123` returns null because aily's
     tenant→agent linkage lives in `tenants.default_agent_id`, not in
     `agents.custom_domain` (verified via direct DB probe — 0 agents
     rows have `custom_domain='aily.ca'`). So `getDisplayAgentForDevelopment`
     returned `displayAgent: null`. `DevelopmentPage:130-132` called
     `notFound()` on null displayAgent, where `BuildingPage:315`
     tolerates the same null with "// May be null — page renders
     without agent features".
     **Fix**: match BuildingPage's tolerance in DevelopmentPage.
     Removed the null-guard; added null-safety wraps around the
     `<script>window.__AGENT_DATA__ = {agent.id...}</script>` block
     (:193-210) and `<MobileContactBar agent={agent} .../>` (:350-355)
     — mirrors BuildingPage:686 pattern. All other agent uses were
     already null-safe via optional chaining / truthy wrappers.
     **Verification**: all 7 dev URLs render 200 on production with
     real content (H1s: Corktown District Lofts, Pier 27 Condos,
     Playground Condos, The Monde Condos, Lighthouse East and West
     Towers, Harbour Plaza Residences, The Thompson Residences).
     Developments re-added to `get_sitemap_geo_slugs` in the follow-up
     migration.
     **NOT changed**: `lib/utils/agent-detection.ts` — a first attempt
     to add a comprehensive-tenant branch to `getDisplayAgentForDevelopment`
     was reverted (unreachable — the outer `if (!siteOwner)` guard fires
     before it can). Fixing the resolver itself is a separate broader
     follow-up (see item 7 below).

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

  6. **Route `GEO_PATH_PREFIX` map has `development` entry** in
     `app/sitemap/[id]/route.ts`. **NOW ACTIVE** after developments
     re-added to `get_sitemap_geo_slugs` (2026-07-01). Kind maps to
     `/` prefix — correct for the observed dev URL shape (e.g.
     `/the-thompson-residences-...`).

  7. **`getAgentFromHost` is tenant-blind** (LOW priority follow-up)
     — `lib/utils/agent-detection.ts:99-123` only checks
     `agents.custom_domain` + subdomain lookup; it does NOT consult
     `tenants.domain` → `tenants.default_agent_id` the way middleware
     does at `middleware.ts:258-276`. Result: for comprehensive
     tenants (aily, walliam), `getAgentFromHost` returns null even
     though the middleware has already resolved a real tenant agent.
     Downstream helpers (`getDisplayAgentForBuilding`,
     `getDisplayAgentForDevelopment`) return `displayAgent: null` on
     the null siteOwner short-circuit — worked around at the page
     level in BuildingPage (:315 tolerance) and now DevelopmentPage
     (commit 4d305b8, mirrors BuildingPage). If a third page type
     lands with the same pattern, consider a properly-audited
     tenant-aware `getAgentFromHost` as its own unit: grep every
     caller (currently 4+ in `agent-detection.ts` alone + external
     sites), do isolation review, verify System-1 hosts still resolve
     correctly, verify no caller depends on the current null-for-
     tenant-hosts return. NOT doing it now — page-level tolerance is
     the correct scope today.

  8. **DevelopmentPage metadata brand leak** — `DevelopmentPage.tsx:81`
     falls back to hardcoded `'CondoLeads'` when agent branding lookup
     fails, and the metadata title format is `${development.name} |
     ${addresses} | ${siteName}`. On aily, siteName resolves via the
     legacy `agents.custom_domain` / subdomain path (fails for
     comprehensive tenants — same class as item 7) so the fallback
     `'CondoLeads'` fires — production probe showed
     `<title>The Thompson Residences | 55 Stewart St, Toronto, 552
     Wellington St W, Toronto | CondoLeads</title>`. Should be
     `| aily` (or the tenant's brand). Same class as the
     neighbourhood-title bug UNIT 61 R1 flagged. Now visible on a
     live page type — bumped priority. Fix pattern already established
     in `resolveCanonicalHost` (used in A-UNIT-1b canonicals): resolve
     tenant via `tenants.domain` → `tenants.name`. Small dedicated
     dispatch.

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

### C-UNIT-2 — Search Console verification + programmatic sitemap submission — STATUS: **PATH-A CHOSEN, 2 EXTERNAL BLOCKERS + 1 CODE STEP**

**Path A (locked 2026-07-03)**: clear the 3 blockers so we can call `webmasters.sitemaps.submit` from a script (idempotent, safe to re-run per tenant onboarding). Chosen over Path B (manual GSC UI submission) because it matches the "add tenants by row-insert" architecture — tenant #3 onboarding auto-runs the same submission code once the tenant's domain is verified.

**A-UNIT-1 dependency**: CLEARED. Sitemap shipped + live (per earlier tracker entries in this doc). C-UNIT-2 is no longer blocked by A-UNIT-1 — the sitemap URL exists at `https://www.aily.ca/sitemap.xml`.

#### Re-verified blocker states (this session, 2026-07-03)

| # | Blocker | State | Evidence (commands run this session) |
|---|---|---|---|
| **1** | `googleapis` Node client not installed | **CONFIRMED-STILL-BLOCKED** | `grep -nE '"googleapis"|@googleapis/searchconsole|@googleapis/webmasters' package.json` → **0 matches**. `ls node_modules/googleapis/package.json` → **ABSENT**. Only `google-ads-api ^24.1.0` is present (Ads-only client, no Search Console support). |
| **2** | OAuth refresh token lacks `webmasters` scope | **CONFIRMED-STILL-BLOCKED** | `grep -rn "googleapis.com/auth" scripts/ lib/ app/` → single hit at `scripts/get-refresh-token.js:36`: `const SCOPES = ['https://www.googleapis.com/auth/adwords']`. `adwords` scope only. **No `webmasters` or `webmasters.readonly` scope anywhere in the codebase.** Refresh tokens carry the scopes they were consented with — cannot be silently upgraded. |
| **3** | aily.ca not verified as a GSC property (no code artifact) | **CONFIRMED-STILL-BLOCKED** | `grep -rn "google-site-verification|google.domain.verification" app/ components/ public/` → **0 matches**. `.env.local` Google keys are `GOOGLE_MAPS_API_KEY` + 6× `GOOGLE_ADS_*` only — no GSC/webmasters keys. No DNS TXT verification artifact in code. |

#### Ordered clearance plan

1. **[DEV] Install `googleapis` client — DONE (2026-07-04)** — `npm install googleapis` completed successfully. VERIFIED(this session): `require('googleapis/package.json').version` returned `173.0.0`; `package.json` line 23 now contains `"googleapis": "^173.0.0"`. Blocker 1 CLEARED. (Note: `npm audit` reports 19 pre-existing repo vulnerabilities — pre-existing, not from this install, not touched.)
2. **[DEV] Consent-script scope-edit — DONE (2026-07-04). [OPS] Operator re-consent — EXTERNAL BLOCKER (pending)** —
   - `[DEV]` — `scripts/get-refresh-token.js` line 36 patched to line 41: `const SCOPES = ['https://www.googleapis.com/auth/adwords', 'https://www.googleapis.com/auth/webmasters']`. VERIFIED(this session): grep `googleapis.com/auth` on the script confirms the new dual-scope array. Backup at `scripts/get-refresh-token.js.backup_20260704_081959` (6983 bytes preserved). `adwords` kept first so the existing Ads code path continues to work; `webmasters` (read/write) is what `sitemaps.submit` requires.
   - `[OPS]` — Operator re-runs the consent flow in a browser. Existing OAuth client credentials (`GOOGLE_ADS_CLIENT_ID` + `GOOGLE_ADS_CLIENT_SECRET` from UNIT 55a, 2026-06-30) are reused — no new OAuth client needed; the consent screen must show the new `webmasters` scope alongside `adwords`. **Claimed, unverified until the operator completes the flow.**
   - `[DEV]` — After operator completes consent: new refresh token saved to `.env.local` under a NEW key (proposed: `GOOGLE_WEBMASTERS_REFRESH_TOKEN`) so the existing `GOOGLE_ADS_REFRESH_TOKEN` (adwords-only) continues to work through the transition. No Ads regression window. Credentials write follows CLAUDE.md secrets rule (never echoed in chat; GUI/secure input only).
   - **Nothing-Deferred posture**: **external-blocker deferral** on the operator re-consent step. Resume the moment the new token is saved to `.env.local`.

2b. **[DEV] Consent-script stdout hardening — DONE (2026-07-04)** — pre-consent recon this session verified the script writes NO files (grep for `fs.write`/`writeFile*` returned 0), but prints a suggested `.env.local` line to stdout. That suggestion previously used the OLD key name (`GOOGLE_ADS_REFRESH_TOKEN=`), which would clobber the working Ads token if operator pasted it verbatim. Three stdout-only string changes shipped (Node patch script with ASCII anchors + idempotency guard + NL preserve):
   - `(a)` print-line key rename — VERIFIED(this session): `console.log('GOOGLE_ADS_REFRESH_TOKEN=' + tokens.refresh_token)` → `console.log('GOOGLE_WEBMASTERS_REFRESH_TOKEN=' + tokens.refresh_token)`.
   - `(b)` reminder line inserted immediately below the print-line — VERIFIED: `console.log('Save as GOOGLE_WEBMASTERS_REFRESH_TOKEN. Leave the existing GOOGLE_ADS_REFRESH_TOKEN in place - do not overwrite it.')`.
   - `(c)` header line rescoped — VERIFIED: `'=== Google Ads — Refresh Token Generation ==='` → `'=== Google OAuth - dual-scope refresh token (adwords + webmasters) ==='`. ASCII prefix/suffix anchors used to route around the Unicode em-dash in the previous text without hand-writing it into JS source (CLAUDE.md rule: anchors must be ASCII-only).
   - **No behavioral drift**: VERIFIED(this session) — `grep -n "googleapis.com/auth\|REDIRECT_URI\|GOOGLE_ADS_CLIENT_ID\|GOOGLE_ADS_CLIENT_SECRET"` on the patched script shows lines 33-35 (CLIENT_ID/SECRET/REDIRECT_URI) byte-identical to pre-edit; line 41 SCOPES array byte-identical to Step-2 state; lines 44/48 FATAL guards byte-identical; lines 55/88 redirect_uri usage byte-identical. Zero touch of OAuth logic — only stdout strings changed.
   - **Idempotency**: VERIFIED(this session) — re-running the patch script reports `NO CHANGES - file already at patched state`.
   - Backups: `scripts/get-refresh-token.js.backup_STEP-2b_20260704_083241` (7383 bytes preserved) + `docs/W-MARKETING-TRACKER.md.backup_C-UNIT-2-STEP-2b_20260704_083449`. Patch script left at `scripts/_w-c-unit-2-step-2b-patch.js` (idempotent, safe to re-run).
   - **Consequence for operator**: when the consent flow runs, the SUCCESS output now prints `GOOGLE_WEBMASTERS_REFRESH_TOKEN=<value>` with a "do not overwrite" reminder immediately below. Verbatim copy-paste into `.env.local` is now safe-by-default; the existing `GOOGLE_ADS_REFRESH_TOKEN` cannot be accidentally clobbered by following the script's own instructions.

2c. **[DEV] Consent-script auto-writes .env.local, fingerprint-only stdout — DONE (2026-07-04)** — Step 2b made copy-paste safe; Step 2c eliminates the copy-paste entirely. Pre-edit recon this session VERIFIED: token in scope at `try` block (lines 155-174 pre-2c); `.env.local` is CRLF-throughout (103/103 lines end `\r\n`); `.env.local` is gitignored (`git check-ignore` → IGNORED); 0 existing `GOOGLE_WEBMASTERS_REFRESH_TOKEN` keys in `.env.local` (grep -c → 0, first-run APPEND branch will fire). Two code changes shipped (Node patch script `scripts/_w-c-unit-2-step-2c-patch.js`, ASCII prefix/suffix anchors, per-file NL detect+preserve, idempotency guard, abort-on-mismatch):
   - `(a)` requires hoisted — VERIFIED(this session): `const { URL } = require('url')` line followed by two NEW lines `const fs = require('fs')` + `const path = require('path')`. Idempotent skip if `require('fs')` already present.
   - `(b)` SUCCESS-print block (was lines 164-174, 11 lines) replaced with a 33-line `.env.local` write helper — VERIFIED(this session): new block reads `.env.local` (strip BOM, detect NL), uses regex `/^GOOGLE_WEBMASTERS_REFRESH_TOKEN=.*$/m` as replace-or-append decision, preserves CRLF, writes back via `fs.writeFileSync`. Then prints ONLY: `SUCCESS` banner, file path, key name, action (REPLACED / APPENDED), fingerprint (`first6 + '...' + last4 + ' (len=' + N + ')'` per CLAUDE.md secrets rule), and an explicit reminder that `GOOGLE_ADS_REFRESH_TOKEN` was NOT modified.
   - **Leak verification** — VERIFIED(this session):
     - `grep -n "tokens.refresh_token|tokens.access_token|tokens.id_token" scripts/get-refresh-token.js` → 3 hits, ALL safe (line 158 null-guard, line 174 file-write string assembly, line 186 fingerprint slice source `const t = tokens.refresh_token`). Zero occurrences of `tokens.access_token` or `tokens.id_token`.
     - `grep -n "console.log.*tokens\\." scripts/get-refresh-token.js` → **empty**. Zero console.log statement includes any `tokens.*` property. No token material reaches stdout.
   - **No behavioral drift** — VERIFIED(this session): `grep -n "googleapis.com/auth|REDIRECT_URI|GOOGLE_ADS_CLIENT_ID|GOOGLE_ADS_CLIENT_SECRET"` returns 8 lines byte-identical to Step-2b state (line numbers shifted +2 from the two hoisted requires; content unchanged). SCOPES array, redirect URI, CLIENT_ID/SECRET reads, FATAL guards, both `redirect_uri: REDIRECT_URI` uses in `exchangeCodeForTokens` all untouched.
   - **Syntax check** — VERIFIED(this session): `node -c scripts/get-refresh-token.js` → SYNTAX OK.
   - **Idempotency** — VERIFIED(this session): re-running the patch script reports `NO CHANGES - file already at patched state`.
   - **Regex safety on `GOOGLE_ADS_REFRESH_TOKEN`**: the write helper's regex `^GOOGLE_WEBMASTERS_REFRESH_TOKEN=.*$` (anchored + `.*` is single-line by default) cannot match `GOOGLE_ADS_REFRESH_TOKEN=...` — VERIFIED by inspection. The replace branch mutates only its own key line.
   - Backups: `scripts/get-refresh-token.js.backup_STEP-2c_20260704_084931` (7569 bytes preserved) + `.env.local.backup_STEP-2c_20260704_084931` (6147 bytes preserved — a write-helper bug could truncate the secrets file, so the operator can restore from the timestamped copy) + `docs/W-MARKETING-TRACKER.md.backup_C-UNIT-2-STEP-2c_20260704_085440`.
   - **Operator experience post-2c**: `node scripts/get-refresh-token.js` in a local terminal → opens consent URL, prompts for redirected URL → on success, silently writes the dual-scope token to `.env.local` under `GOOGLE_WEBMASTERS_REFRESH_TOKEN` (APPEND on first run, REPLACE on re-runs / rotations) → prints file path, key name, action taken, and a first6...last4 (len=N) fingerprint. Zero manual paste, zero token material to stdout, `GOOGLE_ADS_REFRESH_TOKEN` untouched.

#### Consent-flow re-run — incident + recovery log (2026-07-04)

**Consent attempt 1 — burned**:
- Operator initiated `node scripts/get-refresh-token.js` in local terminal, opened consent URL in browser, completed Google consent screen (both `adwords` and `webmasters` scopes granted — VERIFIED against the redirect URL's `scope=` param this session).
- Operator pasted the redirect URL — containing the live single-use OAuth authorization code AND both granted scopes — **into the chat transcript** rather than into the terminal's readline prompt at `Step 2. Paste the redirected URL`.
- Per CLAUDE.md secrets rule ("Never ask for or print full secrets/keys/tokens" + "If a full secret is accidentally exposed, instruct rotation/revocation before doing anything else"): the exposed authorization code was treated as **BURNED**. Planner did NOT exchange it from the planner side, even though the code was still within its ~60-second validity window when observed. Rationale: exchanging the code planner-side would have pulled the resulting refresh token through the planner's tool output, defeating the entire Step-2c auto-write architecture (fingerprint-only stdout, zero token material in chat/logs).

**Recovery (operator-side, IN PROGRESS)**:
- Operator aborts the terminal script run (Ctrl+C — the readline prompt was still waiting).
- Operator revokes the client's existing authorization at `https://myaccount.google.com/permissions` so the burned code cannot be exchanged by anyone who saw the transcript, and so a fresh `prompt=consent` cycle fires next round (otherwise Google may silently short-circuit the re-auth and return no `refresh_token`).
- Operator re-runs `node scripts/get-refresh-token.js` in the local terminal, opens the printed consent URL, completes consent, and pastes the resulting `http://localhost/?code=...` URL **into the terminal's readline prompt only — NOT into chat**.
- Script exchanges the code, writes the new dual-scope refresh token to `.env.local` under `GOOGLE_WEBMASTERS_REFRESH_TOKEN` via the Step-2c auto-write helper, and prints only the file path + key name + action (APPEND / REPLACE) + fingerprint (`first6...last4 (len=N)`).
- Operator returns the fingerprint (safe to share — non-recoverable substring) as the success signal. **Claimed, unverified until fingerprint returned.**

**Consent-URL builder VERIFIED this session** (`scripts/get-refresh-token.js:52-62`, `buildConsentUrl`):
- Line 58: `response_type: 'code'` — authorization-code flow.
- Line 60: `access_type: 'offline'` — **REQUIRED** for `refresh_token` issuance. Without it, Google returns only an `access_token`.
- Line 61: `prompt: 'consent'` — **REQUIRED** on re-consent. Without it, Google may short-circuit the flow for an already-authorized client and return no new `refresh_token`. Present here → the recovery re-run WILL yield a fresh refresh_token even without the operator revoking first (the revoke is a defense-in-depth measure against the burned code, not a functional requirement for the re-consent to succeed).
- Manual URL assembly via `URLSearchParams` — no `google.auth.OAuth2.generateAuthUrl` in scope (grep confirms 0 hits).

**Blocker status after incident**:
- Blocker 2 (OAuth re-consent → dual-scope `GOOGLE_WEBMASTERS_REFRESH_TOKEN` in `.env.local`) — **STILL EXTERNAL BLOCKER, in progress**. Operator terminal action pending.
- Blocker 3 (aily.ca DNS/HTML verification in Search Console) — still pending, unchanged by incident.
- Step 4 (`scripts/gsc-submit-sitemap.js`) — still pending, unblocks when Blockers 2 and 3 both clear.

**Backups added this dispatch**: `docs/W-MARKETING-TRACKER.md.backup_C-UNIT-2-INCIDENT_20260704_102851`. No code files touched this dispatch.

#### Step 4 (part 1) — sites.list attempt (2026-07-04)

**Blocker 2 CLEARED** (with narrow-scope proof, not from-first-principles). `GOOGLE_WEBMASTERS_REFRESH_TOKEN` was written to `.env.local` by operator's second consent-flow run (VERIFIED this session: `grep -c "^GOOGLE_WEBMASTERS_REFRESH_TOKEN=" .env.local` → 1; dotenv-loaded value fingerprint `1//03l...rNuU (len=103)` — matches Step-2c fingerprint format). New `scripts/gsc-sites-list.js` built the OAuth2 client from `GOOGLE_ADS_CLIENT_ID` + `GOOGLE_ADS_CLIENT_SECRET`, injected the webmasters refresh token, called `webmasters.sites.list()`. The request **authenticated successfully with Google's OAuth infrastructure** — proven by the fact that the response was a targeted **HTTP 403 from the Search Console API surface itself** (not a `401 invalid_token` or `invalid_grant` from the OAuth token endpoint). Google minted an access token from the refresh token, forwarded it to the API endpoint, and the API endpoint rejected for a different reason (see 2.5 below).

**NEW EXTERNAL BLOCKER 2.5 — Search Console API not enabled in Cloud Project 678967923355**. VERIFIED(this session) via `sites.list` error message: `"Google Search Console API has not been used in project 678967923355 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=678967923355 then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry."` — HTTP 403, `code: 403`. The Cloud Project ID `678967923355` matches the `GOOGLE_ADS_CLIENT_ID` prefix (verified against `.env.local` line 98). Same Cloud Project that hosts the Google Ads OAuth client from UNIT 55a — the Ads API is enabled there, but Search Console API is a **separate per-API enable toggle** in the same project. This is a one-click Google Cloud Console UI action (operator visits the URL Google gave and clicks Enable), then ~1-few minute propagation delay.

**Nothing-Deferred posture**: **external-blocker deferral** on the Cloud Console API-enable step. Resume `sites.list` retry the moment it clears.

**Blocker 3 (aily.ca verified as GSC property)**: **UNKNOWN** — cannot check `webmasters.sites.list()` output until Blocker 2.5 clears. **Claimed, unverified**: aily.ca's verification state remains as it was pre-session; no observation this session confirms or refutes it.

**Blocker table state after Step 4 (part 1)**:
| # | Blocker | State | Type |
|---|---|---|---|
| 1 | `googleapis` npm package installed | CLEARED | code (Step 1) |
| 2 | OAuth refresh token has `webmasters` scope + saved to `.env.local` | CLEARED | operator terminal (Step 2c auto-write) — VERIFIED via successful OAuth authentication in `sites.list` request |
| **2.5 (NEW)** | Search Console API enabled in Cloud Project 678967923355 | **EXTERNAL BLOCKER (pending)** | operator Cloud Console UI action (~1 min + propagation) |
| 3 | aily.ca verified as GSC property (URL-prefix `https://www.aily.ca/` OR domain `sc-domain:aily.ca`) | UNKNOWN (unblocked-check pending 2.5) | operator DNS TXT / HTML meta tag |

**Files this dispatch**:
- New: `scripts/gsc-sites-list.js` (read-only sites.list caller; prints `siteUrl` + `permissionLevel` only; guards against full-`err`-object dump because `err.response.config.headers` can echo the bearer access token; error path prints only `err.message` + `err.code` + `err.errors[]`).
- Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_C-UNIT-2-BLOCKER-2_5_20260704_105207`.

#### Step 4 (part 1, re-run) — sites.list after API enable (2026-07-04)

**Blocker 2.5 CLEARED**. Operator enabled the Search Console API on Google Cloud Project `678967923355` (VERIFIED against operator screenshot: Status Enabled). Re-ran `node scripts/gsc-sites-list.js` — the earlier 403 is gone. Response was HTTP 200 with a valid `siteEntry` array.

**Sites.list output VERBATIM** (VERIFIED this session):
```
=== Search Console sites.list ===
  entries: 0
  (no properties visible to this authenticated user)
```

**Blocker 3 CONFIRMED — aily.ca NOT verified under this OAuth account**. VERIFIED this session: `siteEntry` array is empty. Both property forms explicitly checked and absent:
- URL-prefix (`https://www.aily.ca/` or `https://aily.ca/`): **absent** (no `siteEntry` with matching `siteUrl`).
- Domain property (`sc-domain:aily.ca`): **absent** (no `siteEntry` with matching `siteUrl`).

Additional finding: not only is aily.ca absent, but the authenticated user (the Google account that consented the OAuth flow, per operator context `yourcondorealtor@gmail.com`) has **ZERO verified properties in Search Console at all**. This narrows the resolution paths:

**Operator action required — one of three paths**:
1. **Verify aily.ca fresh under `yourcondorealtor@gmail.com`** via Search Console UI. Options: DNS TXT record on the aily.ca domain (preferred — one-time, covers all subdomain + protocol variants via a domain property), OR HTML meta tag on aily.ca's index page, OR HTML verification file, OR Google Analytics/Tag Manager if `yourcondorealtor@gmail.com` has GA access to aily.ca.
2. **If aily.ca is already verified under a different Google account** (e.g. a personal account or an earlier Aily-owner account): from that account, add `yourcondorealtor@gmail.com` as an **Owner or Full user** on the existing property (Search Console Settings → Users and permissions → Add User). Property will then appear in this `sites.list` output without a fresh verify.
3. **If aily.ca has never been verified anywhere**: proceed with path (1).

Recommended: **domain property (`sc-domain:aily.ca`) via DNS TXT** — catches all `https://aily.ca` / `https://www.aily.ca` / any future subdomains, matches the canonical-host architecture used elsewhere in this repo (`resolveCanonicalHost` normalizes across www/apex), and doesn't require serving an HTML file from the running Next.js app.

**Nothing-Deferred posture**: **external-blocker deferral** on the aily.ca verification step. Resume `sites.list` retry + Step 4 part 2 (`gsc-submit-sitemap.js`) the moment aily.ca appears in the `siteEntry` list with `permissionLevel: siteOwner` or `siteFullUser` (both permit sitemap submit; `siteRestrictedUser` does not).

**Blocker table state after Step 4 (part 1, re-run)**:
| # | Blocker | State | Type |
|---|---|---|---|
| 1 | `googleapis` npm package installed | CLEARED | code (Step 1) |
| 2 | OAuth refresh token has `webmasters` scope + saved to `.env.local` | CLEARED | Step 2c auto-write + verified in Step 4 part 1 |
| 2.5 | Search Console API enabled in Cloud Project 678967923355 | CLEARED | operator Cloud Console (VERIFIED via screenshot + successful HTTP 200 response) |
| **3** | **aily.ca verified as GSC property** (URL-prefix OR sc-domain) | **CONFIRMED-BLOCKED** — empty siteEntry proves absence, not silence | operator DNS TXT / HTML tag / add-user on existing property |
| 4 | `scripts/gsc-submit-sitemap.js` shipped | PENDING (blocked on 3) | code |

**No code files touched this dispatch**. Tracker append only. Backup: `docs/W-MARKETING-TRACKER.md.backup_C-UNIT-2-SITES-LIST-EMPTY_20260704_110130`.

#### Step 4 (part 1, final re-run) — Blocker 3 CLEARED (2026-07-04)

**Blocker 3 CLEARED**. Operator completed aily.ca ownership via the Domain-name-provider auto-verify path in Search Console (browser-side proof: operator screenshot showed "Ownership auto verified"). Re-ran `node scripts/gsc-sites-list.js` to confirm the token now sees the new property (browser proof is NOT the same as API-token-visible proof — required a fresh sites.list to confirm).

**Sites.list output VERBATIM** (VERIFIED this session):
```
=== Search Console sites.list ===
  entries: 1
  siteUrl="sc-domain:aily.ca"  permissionLevel="siteOwner"
```

- **Property form**: `sc-domain:aily.ca` (domain property). Consistent with DNS-name-provider verification path — that path creates ONLY the `sc-domain:` form, not URL-prefix. URL-prefix form (`https://www.aily.ca/` or `https://aily.ca/`) remains absent, as expected. The domain property covers all www/apex/subdomain + protocol variants under aily.ca in a single property, matching this repo's canonical-host architecture (`resolveCanonicalHost` normalizes www/apex).
- **`permissionLevel`**: `siteOwner` — top-level permission. Permits `sitemaps.submit`, `sitemaps.get`, `sitemaps.list`, `sitemaps.delete`, `searchanalytics.query`, `urlInspection.index.inspect`. `siteFullUser` would also permit sitemap submit; `siteRestrictedUser` would not — we have the strongest tier.

**Exact `siteUrl` string for `sitemaps.submit`** — VERIFIED(this session):
```
sc-domain:aily.ca
```

Step 4 part 2 (`scripts/gsc-submit-sitemap.js`) is now **unblocked**. Anticipated call shape (build dispatch will confirm the exact googleapis method signature and args):
```
webmasters.sitemaps.submit({
  siteUrl: 'sc-domain:aily.ca',
  feedpath: 'https://www.aily.ca/sitemap.xml'
})
```
Followed by `webmasters.sitemaps.get({ siteUrl, feedpath })` to verify submission landed. Idempotent — safe to re-run.

**Blocker table state after Step 4 (part 1, final re-run)**:
| # | Blocker | State | Type |
|---|---|---|---|
| 1 | `googleapis` npm package installed | CLEARED | code (Step 1) |
| 2 | OAuth refresh token has `webmasters` scope + saved to `.env.local` | CLEARED | Step 2c auto-write + Step 4 pt1 auth proof |
| 2.5 | Search Console API enabled in Cloud Project 678967923355 | CLEARED | operator Cloud Console + Step 4 pt1 re-run HTTP 200 |
| 3 | aily.ca verified as GSC property (domain or URL-prefix) | **CLEARED** — VERIFIED via API: `sc-domain:aily.ca` visible with `siteOwner` | operator DNS-provider auto-verify + this-session API confirmation |
| 4 | `scripts/gsc-submit-sitemap.js` shipped + smoke-verified | **UNBLOCKED, PENDING BUILD** | code (next dispatch) |

**No code files touched this dispatch**. Tracker append only. Backup: `docs/W-MARKETING-TRACKER.md.backup_C-UNIT-2-BLOCKER-3-CLEARED_20260704_114046`.
3. **[OPS] Verify aily.ca in Google Search Console — EXTERNAL BLOCKER (pending)** — one-time, out-of-band. Operator adds a DNS TXT record at Google's instruction (or we can serve an HTML meta tag if they prefer). Approximately 15 minutes end-to-end (DNS propagation dependent).
   - **Nothing-Deferred posture**: **external-blocker deferral** on the operator DNS/HTML verification step. Resume the moment verification lands.
4. **[DEV] Ship `scripts/gsc-submit-sitemap.js` — PENDING** — reads `GOOGLE_WEBMASTERS_REFRESH_TOKEN` from `.env.local`, uses `googleapis` client (installed above) to call `webmasters.sitemaps.submit({ siteUrl: 'https://www.aily.ca/', feedpath: 'https://www.aily.ca/sitemap.xml' })`, verifies via `webmasters.sitemaps.get`. Idempotent, safe to re-run. Prints result + submission timestamp. Extendable to loop over `tenants.domain` for future multi-tenant onboarding without code change. Cannot run until steps 2 and 3 are cleared.

#### `yourcondorealtor` removal — API status (verified this session)

The Search Console API does NOT support removing/de-indexing another site you don't own. Google's "URL Removal Tool" is UI-only (no API endpoint since 2018). The `urlNotifications` API was **deprecated by Google in 2023** and no longer accepts new integrations. Current de-indexing paths that DO work:
- **Rely on A-UNIT-1a's `X-Robots-Tag: noindex, nofollow`** on legacy hosts — SHIPPED. This IS the correct posture. Natural Google recrawl deindexes over weeks-to-months.
- Optional acceleration: if aily's owner is also the registered owner of yourcondorealtor.ca (via `agents.custom_domain` = `yourcondorealtor.ca`, VERIFIED prior session as a System-1 legacy custom_domain agent site), that domain COULD be added as its own separately-verified GSC property. Its sitemap could then be programmatically set to empty. Even so, still relies on natural de-indexing after noindex + empty-sitemap combo. **Not urgent to script** — the noindex is already doing the work.

#### Files touched this session (recon only, no state change)
- `docs/W-MARKETING-TRACKER.md` (this Path-A recon append; backup at `docs/W-MARKETING-TRACKER.md.backup_C-UNIT-2-PATH-A_20260703_172212`)
- No code files touched. No `npm install`. No scope edit. No API call.

**Awaiting**: operator DNS verification step for aily.ca + OAuth re-consent flow. When both clear, C-UNIT-2 Part 2 executes step 4 (build + smoke the submission script) autonomously.

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

---

## DECISION LOG — 2026-07-02

### CLAUDE.md tenant-neutral isolation amendment `[DECISION]`

**VERIFIED this session**: System 2 identifier in CLAUDE.md line 13 previously named `walliam.ca` as THE S2 tenant. Reality now: `tenants` table has **two active rows** — `aily.ca` (A-UNIT-1 live production tenant #1) and `walliam.ca` (`is_active=true`, verified via `SELECT id, name, domain, is_active FROM tenants`). Walliam code paths remain on disk: **82 files under `app/api/walliam/`** (assign-user-agent, charlie, contact, estimator, resolve-agent, plus 5+ subdirs). Verified `ls app/api/walliam/` this session.

**Amendment applied** (CLAUDE.md, this dispatch, timestamped backup at `.backup_20260702_072147`):
- **Line 13** (System 2 identifier) — reframed from "walliam.ca" to "the active multi-tenant platform. Tenants live as rows in the `tenants` table (currently: aily.ca, walliam.ca). New tenants added by row-insert, not by code change. Tenant identity is resolved per request from host → `tenants` row, never hardcoded." Preserved walliam-named paths on disk verbatim: `app/api/walliam/*`, `app/api/charlie/*`, `app/zerooneleads/*`, `/admin-homes`. Added `app/comprehensive-site/*` (verified exists — 28 files this session).
- **Line 55** (Rule Zero banned-constant list) — widened from `"walliam", "condoleads"` to `"walliam", "aily", "condoleads"`. Added trailing clarification: "Tenants are data-plane rows, not code-plane branches."
- **Line 132** (local smoke `DEV_TENANT_DOMAIN`) — reframed to tenant-neutral: set to whichever tenant is being smoked; smoke both when touching cross-tenant behavior (files under `app/comprehensive-site/*`, `middleware.ts`, tenant-resolution helpers).

**NOT changed**: the verified-IDs block (lines 155-165) is byte-for-byte unchanged. **Zero UUIDs added** across the entire diff (verified via `grep -oE "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"` on the `+` lines — count=0). Agent identity is a `tenants.default_agent_id` data-plane lookup, not a CLAUDE.md constant.

**Commit SHA**: `3a6e06d` (this commit — CLAUDE.md + tracker in the same block; SHA backfilled in a follow-up amend? — no: kept as-is, this DECISION section documents the commit it lives in).

---

### A-UNIT-4 — SCOPE LOCKED (5 entities, 3 phases, sequential, no gap) `[DEV]`

**Sequence** (single working block per "no deferral" rule):
- **4a — Geo pages** (community, municipality, treb_area, neighbourhood). Reuse UNIT 53's `CondoMarketActivity` pattern.
- **4b — Buildings** (SHARED-EXCEPTION path per CLAUDE.md line 15). New panel that **complements** — does NOT replace — the existing `getBuildingMarketData` / `market_values` PSF+investment path in `BuildingPage.tsx`. Includes an explicit regression check that the pre-existing PSF panel + investment-metrics render is unchanged after 4b lands.
- **4c — Insight blocks** (`insight_seasonal`, `insight_demand_mismatch`, `insight_investor_ratio`, `insight_reentry`, `insight_concession_matrix`, `insight_price_reduction`, `insight_value_migration`). JSONB blocks with rich SEO-valuable data. Rendered as expandable sections.

**Track rule**: for each geo page, render whichever `track` (`condo` / `homes`) has a `low_volume_flag=false` row for that geo. Render **both** side-by-side when both exist. **No default track** (would drop 78%-of-set data on some levels).

**Coverage — VERIFIED THIS SESSION** via SQL (`period_type='rolling_12mo' AND low_volume_flag=false`, distinct geo_ids joined against sitemap-eligible rows):
- community: **1,548 / 1,948 have ≥1 usable row = 79%**  (condo-only=682, homes-only=1,520 — sets barely overlap)
- municipality: **397 / 506 = 78%**  (condo-only=193, homes-only=397)
- treb_area (called `area` in geo_analytics — SAME entity, 73/73 geo_id match verified): **48 / 73 = 66%**  (condo=42, homes=47)
- neighbourhood: **9 / 9 = 100%**  (condo=9, homes=9 — both tracks always populated)
- building: **1,220 / 6,776 condo-usable = 18%** across all buildings; **homes track 20/6,776 = 0.3%** (near-zero, expected — buildings are condo-shape). Sitemap-eligible building subset (~4,574 quality-gated) coverage **NOT yet probed** — flagged as `to verify in 4b recon`.

**Per-track coverage inversion** — VERIFIED: community/muni **homes** coverage (78%) is 2x **condo** coverage (35–38%). Inverts the aily-audience assumption; the track-agnostic render rule is critical.

**Building fields — VERIFIED THIS SESSION**: sample building `50 O Neil Road, Toronto C13`, `geo_id=52efe4a7-606d-4857-9174-4d166b7ec198`, `track=condo`, `calculated_at=2026-06-19T12:58:12Z`, `low_volume_flag=false`. Populated: **58 / 69 columns** (median_sale_price=$525k, closed_sale_count_90=25, active_count=103, absorption_rate_pct=5.83, months_of_inventory=17.17, median_lease_price=$2,300, gross_rental_yield_pct=5.26, median_maint_fee=$601, all 5 monthly trend JSONBs, all 6 insight_* blocks). **NULL on buildings**: `median_psf`, `avg_psf`, `median_lease_psf`, `psf_trend_pct`, `insight_value_migration`, `active_avg_dom` — these come from the existing `market_values` / `getBuildingMarketData` path; **do NOT duplicate**.

**Empty-state text** — Rule Zero (no fake numbers): honest real text, ZERO numeric placeholders. **Exact string TBD — will present for operator approval BEFORE 4a code ships**. Candidates: "Market data will appear as more transactions accumulate" / "Not enough transactions yet to publish reliable market metrics" — final wording is operator's call.

**Reuse** — VERIFIED to exist this session:
- `components/home/CondoMarketActivity.tsx` (UNIT 53, 2026-06-30) — reference implementation, reads `geo_analytics` server-side
- `components/home/Sparkline.tsx` — reusable SVG sparkline from `TrendPoint[]` shape `{month, value, count}`
- Same `serviceClient()` factory pattern
- Same `low_volume_flag=false + closed_sale_count_90 IS NOT NULL + median_sale_price IS NOT NULL` gate

**Isolation** — VERIFIED: `geo_analytics` has NO `tenant_id` column (confirmed via `information_schema.columns` — 69 columns, zero contain "tenant"). Tenant-neutral like `mls_listings` per CLAUDE.md. Same data on every tenant; branding flows via host + links.

**Note**: sitemap index — canvas-tracked separately per operator directive; NOT tracked in this doc.

---

## DECISION LOG — 2026-07-02 (second entry, same day)

### CLAUDE.md SEO-scope clarification `[DECISION]`

**Amendment applied** (CLAUDE.md, this dispatch, timestamped backup at `.backup_20260702_073538`): appended a new paragraph AFTER the Multitenant Rule Zero block ("Tenant leakage is a data-breach incident.") and BEFORE the "No regressions" heading. Full verbatim text (VERIFIED via `git diff CLAUDE.md`):

> **SEO scope is a per-tenant capability, config-gated, never brand-hardcoded.** SEO surfaces — sitemap, robots policy, geo-content, structured data, ranking optimization — are aily's. Other tenants do not inherit them, and legacy agent sites (yourcondorealtor.ca, *.condoleads.ca) are actively blocked from crawlers so they never compete with aily in search. This is enforced as a tenant/host capability (the comprehensive-tenant vs owner-promo vs legacy-agent-host classification already in `app/robots.ts`), NEVER as `if (host === 'aily.ca')`. The multitenant rule is not weakened by this: "only aily gets SEO" is a data-plane fact (aily's config + host classification enable it), not a code-plane branch. If a future tenant should get SEO, it is a config change, not a code change.

**Why this matters**: documents what `app/robots.ts` (commit `e303773`) already does — 3-branch host-derived policy: owner-promo hosts get a permissive `Allow: /` with no tenant SEO; comprehensive-tenant hosts get sitemap + Allow; legacy-agent hosts get `Disallow: /` + `X-Robots-Tag: noindex, nofollow`. That classification is code; specific host names + tenant identities are data. No `if (host === 'aily.ca')` anywhere in that decision — VERIFIED via `grep -rn "aily.ca" app/robots.ts middleware.ts lib/utils/canonical.ts` this session (only strings are in fallback defaults + JSDoc, none in decision logic).

**Zero UUIDs added** — verified via `grep -oE "[0-9a-fA-F]{8}-...-[0-9a-fA-F]{12}"` on the `+` lines of the CLAUDE.md diff: count=0. Verified-IDs block byte-for-byte unchanged.

**Prior CLAUDE.md changes (from commit `3a6e06d`) still in effect**: System 2 line reframed tenant-neutral; banned-constant list includes `"aily"`; `DEV_TENANT_DOMAIN` line tenant-neutral. No re-edit of those in this dispatch.

**Commit SHA**: `bb23eee` (this commit — CLAUDE.md SEO-scope note + tracker second-entry, same block).

**A-UNIT-4 scope lock**: unchanged from the previous DECISION LOG entry (2026-07-02, first entry). 5 entities / 3 phases / sequential / no gap. Track rule: whichever `track` has `low_volume_flag=false`; both when both exist; NO default. Coverage numbers already verified (community 79%, muni 78%, area 66%, nbhd 100%, building 18% overall — sitemap-eligible subset TO VERIFY in 4b recon). Empty-state text TBD, operator-approved BEFORE 4a code ships. No new decisions in this dispatch beyond the CLAUDE.md SEO-scope note.

---

## DECISION LOG — 2026-07-02 (third entry, same day) — A-UNIT-4a SHIPPED

### A-UNIT-4a — geo-page market panel `[DEV]` — STATUS: **SHIPPED**

**Component**: `components/geo/GeoMarketActivity.tsx` (new file, new directory). Server component. Props `(geoType: 'area'|'community'|'municipality'|'neighbourhood', geoId: string, geoName: string)`. Tenant-neutral (VERIFIED: `geo_analytics` has no `tenant_id` column per prior recon; component takes zero tenant/agent/brand props). Reuses the UNIT 53 `CondoMarketActivity` query pattern (same `createServiceClient` factory + `.eq('period_type', 'rolling_12mo').eq('low_volume_flag', false).not(...is null)` gates), and the existing `components/home/Sparkline.tsx` for the price-trend visualization.

**4 pages wired** (all backed up with timestamp `.backup_20260702_170137` before edit):
- `app/[slug]/AreaPage.tsx` — passes `geoType="area"`, `geoId={area.id}`, `geoName={area.name}`. Mounted after `<GeoHero />`, before `<GeoPageTabs />` (top-of-page SSR slot).
- `app/[slug]/CommunityPage.tsx` — `geoType="community"`, `geoId={community.id}`, `geoName={community.name}`. Same top-of-page slot.
- `app/[slug]/MunicipalityPage.tsx` — `geoType="municipality"`, `geoId={municipality.id}`, `geoName={municipality.name}`. Same slot.
- `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` — `geoType="neighbourhood"`, `geoId={neighbourhood.id}`, `geoName={neighbourhood.name}`. Mounted after Communities pills block, before `{isHero && (...)}` walliam CTA.

**11-field render set** (VERIFIED-populated on `low_volume_flag=false` geo rows this session):
1. `median_sale_price` → **Median sale price** (headline, `fmtPrice`)
2. `active_count` → **Active listings**
3. `closed_sale_count_90` → **Sold last 90 days**
4. `months_of_inventory` → **Months of inventory**
5. `closed_avg_dom_90` → **Avg days on market**
6. `sale_to_list_ratio` → **Sale-to-list ratio** (2 decimals `%`)
7. `absorption_rate_pct` → **Absorption rate** (1 decimal `%`)
8. `median_psf` (fallback `avg_psf`) → **Median PSF** (rendered ONLY when non-null — VERIFIED NULL on homes-track geo rows, so PSF section disappears on homes panels)
9. `psf_trend_pct` → PSF trend badge ▲/▼ with `%` (paired with PSF)
10. `price_trend_monthly` → `<Sparkline points={...} width={160} height={40} />` when JSONB array has ≥4 finite `value`s (Sparkline `MIN_POINTS = 4` gate)
11. `calculated_at` → `Updated {MMM DD, YYYY}` footer (formatted via `toLocaleDateString('en-CA')`)

**Track rule (operator-locked)**: query fetches BOTH tracks (no `.eq('track', ...)` filter); component renders whichever track(s) return a row. Both tracks → STACKED panels labeled "Condos" then "Homes" (in query result order). Single track → single labeled panel. Neither → empty-state paragraph.

**Empty-state string (operator-approved verbatim)**:
> Market statistics for {geoName} will be published as transaction activity is recorded in this area.

Where `{geoName}` = the real geo name in page scope (interpolated as `${geoName}` in JSX). Zero fabricated numbers.

**Isolation posture VERIFIED**:
- `geo_analytics` has NO `tenant_id` column (VERIFIED prior session — 69 columns, zero contain "tenant"); shared MLS-derived facts identical for every tenant.
- Component signature `(geoType, geoId, geoName)` — zero tenant / agent / brand context in or out.
- No tenant-scoped query in the component; single `SELECT` against `geo_analytics`.
- Existing tenant/agent state on all 4 pages (`getCurrentTenantId`, `getAgentFromHost`, `isHeroTenant`, `resolveAgentForContext`, `getTenantByHost`) remains scoped to sibling components (`GeoPageTabs`, `WalliamCTA`, `WalliamAgentCard`, `CharliePageContext`) — untouched.

**Coexistence with existing `AnalyticsSection`**: `GeoMarketActivity` sits ABOVE (top-of-page SEO-visible SSR summary). `AnalyticsSection` (836-line client component using recharts, reads same `geo_analytics` via `/api/analytics`) stays where it was on Area/Community/Muni as the mid-page interactive dashboard. Neighbourhood page previously had no analytics; now has the new SSR panel.

**Local smoke this session** — REAL geo_ids picked from DB via SQL, values verified against RSC-rendered response body. Every case tested against BOTH aily.ca and walliam.ca local hosts. All 6 cases × 2 tenants = 12 renders, all HTTP 200:

| Case | Page type | Slug | geo_id (VERIFIED this session) | Expected DB medians | Rendered on aily | Rendered on walliam |
|---|---|---|---|---|---|---|
| Both tracks stacked | Community | `/windfields` | `022b1046-fc13-418c-8303-4f4edf28cb65` | condo $582K + homes $817K | `$582K $817K` ✓ | `$582K $817K` ✓ |
| Homes-only | Community | `/south-marysburg-ward` | `00001ef1-a6cb-4f8f-a0be-a9382f02267b` | homes $575K | `$575K` ✓ | `$575K` ✓ |
| Homes-only | Municipality | `/madoc` | `000916c4-41c4-4bc2-8640-7ad982faf14a` | homes $480K | `$480K` ✓ | `$480K` ✓ |
| Both tracks stacked | Area | `/lambton-area` | `025028c4-5cd3-45d1-a81d-7b968f4114c5` | condo $485K + homes $540K | `$485K $540K` ✓ | `$485K $540K` ✓ |
| Both tracks stacked | Neighbourhood | `/toronto/midtown-central` | `0b295da7-a949-4d23-8b33-fe4d4fcaafa4` | condo $635K + homes $1.9M | `$635K $1.9M` ✓ | `$635K $1.9M` ✓ |
| Thin (no usable row) | Community | `/hawtrey` | `000c579c-728b-4fbd-a63d-b59b298fc358` | (no rows) | empty-state × 2 ✓ zero fabricated | empty-state × 2 ✓ zero fabricated |

**Both-tenant match VERIFIED**: aily and walliam render byte-identical numbers from the same DB rows. Empty-state on Hawtrey shows the verbatim operator-approved string, zero dollar signs or metric labels rendered.

**Sparkline reuse**: `price_trend_monthly` populates 14–25 points on all `low_volume_flag=false` geo rows (well above `MIN_POINTS = 4`, VERIFIED via prior session probe) — sparklines draw on every panel with trend data.

**No regressions** (features touched, smoke-verified):
- 4 geo page types render 200 — existing `GeoHero`, `GeoPageTabs`, `AnalyticsSection`, `WalliamCTA`, `WalliamAgentCard`, `CharliePageContext`, `GeoInterlinking`, `GeoSEOContent` all still render (page byte counts 67K–299K depending on populated data).
- `components/home/Sparkline.tsx` — imported but not modified. Homepage `CondoMarketActivity` usage unaffected.
- No API route touched. No middleware touched. No DB migration. No schema changes.

TSC exit 0.

**Files (all in one commit)**:
- `components/geo/GeoMarketActivity.tsx` (NEW, 226 lines)
- `app/[slug]/AreaPage.tsx` (import + 1-line mount)
- `app/[slug]/CommunityPage.tsx` (import + 1-line mount)
- `app/[slug]/MunicipalityPage.tsx` (import + 1-line mount)
- `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` (import + wrapping div + mount)
- `docs/W-MARKETING-TRACKER.md` (this DECISION LOG entry)

**Commit SHA**: `f0cae79` (this commit — component + 4 pages + tracker in the same block).

### POST-PUSH VERIFY — 2026-07-02 (same-day close)

**Coexistence audit** (VERIFIED this session — both components read `geo_analytics`):
- `GeoMarketActivity`: server-side `.from('geo_analytics')` at `components/geo/GeoMarketActivity.tsx:113`.
- `AnalyticsSection`: client-side `fetch('/api/analytics?geoType=X&geoId=Y&track=T')` at `AnalyticsSection.tsx:121-122`; the API route `app/api/analytics/route.ts:17` `.from('geo_analytics')` for the same `(geo_type, geo_id, period_type='rolling_12mo', track)` key.
- **SAME source table, SAME rows** — impossible for medians to disagree.

Windfields (`022b1046-fc13-418c-8303-4f4edf28cb65`) sample DB values VERIFIED both tracks (rolling_12mo, community):
  - condo: median_psf=$416.67, closed_avg_dom_90=70.7, sale_to_list_ratio=99.65%, absorption_rate_pct=4.12%, active_count=97, closed_sale_count_90=11, median_sale_price=$582K
  - homes: median_psf=NULL, closed_avg_dom_90=30.2, sale_to_list_ratio=101.37%, absorption_rate_pct=16.67%, active_count=54, closed_sale_count_90=28, median_sale_price=$817K

**One-line verdict per page type**:
- **Area** — COMPLEMENT (both read `geo_analytics` geo_type='area'; 6-metric overlap of IDENTICAL values, plus unique content per component: GeoMarketActivity adds median_sale_price headline + months_of_inventory + price_trend sparkline; AnalyticsSection adds 12-month DOM/STL chart + bedroom/sqft/subtype breakdowns + 6 `insight_*` blocks). NO conflict, NO regression.
- **Community** — COMPLEMENT (same story with geo_type='community').
- **Municipality** — COMPLEMENT (same story with geo_type='municipality').
- **Neighbourhood** — no coexistence: `AnalyticsSection` was never wired on this page type; only `GeoMarketActivity` renders here.

**Behavior on `low_volume_flag=true` geos differs (not a regression, documented)**:
- `GeoMarketActivity` gates on `low_volume_flag=false` → panel disappears, empty-state string shows.
- `AnalyticsSection` has NO `low_volume_flag` gate → renders section with `'–'` dashes + per-block "populating nightly" empty-states.
- Same honest posture, different presentation. Consistent Rule Zero: neither fabricates numbers.

**PRODUCTION render VERIFIED this session** (`https://www.aily.ca`, cache-busted, HTTP 200):
- `/windfields` (community, both-tracks) — 200, 98,248 bytes, formatted medians `$582K $817K` present. Matches DB exact.
- `/madoc` (municipality, homes-only) — 200, 294,243 bytes, formatted median `$480K` present. Matches DB exact.
- `/toronto/midtown-central` (**comprehensive-site rewrite path**, both-tracks nbhd) — 200, 299,594 bytes, formatted medians `$1.9M $635K` present. Matches DB exact. **The rewrite path that previously 404'd for developments works cleanly for this new geo panel.**

Zero fabricated numbers on any URL. Empty-state count=0 on all 3 (as expected — all 3 are populated geos).

**A-UNIT-4a — CLOSED**. No open items from this unit. Ready to proceed to A-UNIT-4b (buildings) when dispatched.

---

## DECISION LOG — 2026-07-03 — A-UNIT-4b SHIPPED

### A-UNIT-4b — building market panel `[DEV]` — STATUS: **SHIPPED**

**Component path — EXTENDED, not new**: `components/geo/GeoMarketActivity.tsx` — added `'building'` to the `geoType` union (1-line change). Same server-component, same client factory, same query pattern with `.eq('geo_type', 'building').eq('period_type', 'rolling_12mo').eq('low_volume_flag', false)` gates and `.not(closed_sale_count_90 / median_sale_price, 'is', null)` null-guards. Zero query duplication. The 4b decision-locked field set (7 fields — median headline + 6-metric grid) IS EXACTLY what the existing component renders when `median_psf` is NULL and `price_trend_monthly` has < 4 points — both true for buildings VERIFIED this session.

**Mount** (`app/[slug]/BuildingPage.tsx`, backed up `.backup_20260703_054427`): SANDWICHED between `<MarketStats />` (line 514) and `<MarketIntelligence />` (line 516). Reader flow — basics → activity → deep PSF/yield:

```
MarketStats          — Year Built + Inventory Rate + Highest/Lowest Sale
GeoMarketActivity    — Median sale price + 6-metric activity grid (NEW)
MarketIntelligence   — PSF trend + PSF comparison + Investment yields + parking/locker
```

**7-field render set VERIFIED-populated on `low_volume_flag=false` condo building rows** (via prior session probes on cited buildings):
1. `median_sale_price` → headline (`fmtPrice`)
2. `active_count` → **Active listings**
3. `closed_sale_count_90` → **Sold last 90 days**
4. `months_of_inventory` → **Months of inventory**
5. `closed_avg_dom_90` → **Avg days on market**
6. `sale_to_list_ratio` → **Sale-to-list ratio** (`%`)
7. `absorption_rate_pct` → **Absorption rate** (`%`)

Plus `calculated_at` → `Updated {date}` footer.

**Auto-hidden on buildings** (via existing component null/point gates):
- **PSF row** — hidden when `median_psf` NULL (VERIFIED NULL on 82% of buildings; when present, e.g. 500 Talbot $217.69, would still render — but `MarketIntelligence` owns building PSF via `building_psf_summary`, so the geo_analytics PSF is redundant when both exist. Auto-hide via NULL is the desired behavior for the majority; occasional dual-render is acceptable and non-conflicting since it matches DB).
- **Sparkline** — hidden by Sparkline's `MIN_POINTS = 4` gate; VERIFIED 98% of `low_volume_flag=false` building rows have <4 trend points (86% have 0, 11% have 1-3).

**Excluded from render** (would overlap with existing `MarketIntelligence` — kept out to avoid two-values-for-one-metric UX):
- `gross_rental_yield_pct` — `InvestmentAnalysis` computes yield from avg-PSF (`buildingGrossYield = lease_avg_psf × 12 / sale_avg_psf × 100`)
- `median_maint_fee` / `median_tax_annual` — `InvestmentAnalysis` uses AVG of `mls_listings` columns
- `closed_sale_count_12mo` — matches `building_psf_summary.sale_count` shown in the existing panel

**Empty-state (no `low_volume_flag=false` row for building)**: existing component paragraph: `Market statistics for {buildingName} will be published as transaction activity is recorded in this area.` — building name interpolated. Zero fabricated numbers. Same verbatim string as A-UNIT-4a — no per-page-type divergence needed after all (contrary to earlier "silent hide" proposal — the paragraph is honest signal even at 82% incidence; no code change to hide behavior).

**Track handling**: query fetches BOTH tracks (no `.eq('track', ...)` filter — same as A-UNIT-4a). Buildings are effectively condo-only (VERIFIED prior session: 20 / 6,776 = 0.3% of buildings have `homes`-track `low_volume_flag=false`). "Both stacked" fires for the 0.3% edge case; 99.7% render single condo panel. Same graceful degradation.

**System-1 posture — NO TENANT GATE** (VERIFIED: BuildingPage's only `notFound()` at :273 is for missing building; tenant branches wrap agent-context features only at lines 500-501, 570, 604, 693 — never market data). `MarketStats` + `MarketIntelligence` already render on both systems without tenant gate; the new panel matches that posture. Gating on `tenantId` would be a shared-exception regression (S1/S2 divergence on a documented shared page).

**LOCAL SMOKE this session** — 3 buildings × 3 hosts = 9 renders, all HTTP 200:

| Case | Slug | geo_id (VERIFIED this session) | Expected panel median | aily | walliam | yourcondorealtor (S1) |
|---|---|---|---|---|---|---|
| Usable | `/5750-tosca-dr-townhouse-condos-3250-bentley-mississauga` | `b2c4f86e-9da2-44df-97c1-5a3636617c44` | $600K | $600K ✓ | $600K ✓ | $600K ✓ |
| Usable | `/500-talbot-street-london-east` | `38b3dba8-c1d3-4ce0-af77-cf926de20383` | $283K | $283K ✓ | $283K ✓ | $283K ✓ |
| Empty-state | `/side-launch-1-shipyard-lane-collingwood` | `055b861d-2b97-40e5-b5e3-614148e66714` | (no row) | empty ×2 ✓ | empty ×2 ✓ | empty ×2 ✓ |

**Panel renders IDENTICALLY across all 3 host types** (byte-for-byte matching panel prices) — tenant-neutrality PROVEN end-to-end. Tenant branding differences on the page (byte counts 300K aily / 294K walliam / 247K yourcondorealtor) come from `WalliamCTA` / `WalliamAgentCard` / hero rail gates fully unchanged — no regression to tenant branching.

**MarketStats + MarketIntelligence NON-REGRESSION VERIFIED** — 9/9 renders show:
- `"Market Overview"` (MarketStats heading) — present
- `"Price per sqft analysis and trends"` (MarketIntelligence subtitle) — present

Both existing panels render unchanged; new panel sandwiches cleanly between them.

**Coverage caveat** (VERIFIED this session, not blocking): 817 / 4,597 sitemap-eligible buildings (18%) have `low_volume_flag=false` condo geo_analytics row. 82% of building pages will render the empty-state paragraph. This is the honest post-population posture — nightly analytics fills in more buildings over time as their transaction counts cross the low-volume threshold. Not a regression, not a defect; documented data-confidence gate.

**No regressions**:
- `getBuildingMarketData` — untouched (grep confirmed 2 sites: import + call; no shared type-drift risk).
- `MarketStats`, `MarketIntelligence`, `PSFTrendChart`, `PSFComparisonTable`, `PSFAnalysis`, `InvestmentAnalysis` — untouched.
- BuildingPage's 4 `Promise.all` fetches (`getCachedDevelopment`, `getDisplayAgentForBuilding`, `getCachedActiveListings`, `getCachedClosedListings`, `getBuildingMarketData`) — unchanged.
- Agent-context features (`agentCard`, `WalliamCTA`, `WalliamAgentCard`, `ChatWidgetWrapper`) — tenant branching intact (byte-count deltas across hosts confirm S1/S2 render still diverges correctly).
- `GeoMarketActivity` — only the `Props.geoType` union widened. Runtime behavior on the 4 A-UNIT-4a page types unchanged.
- Homepage `CondoMarketActivity` — untouched (imports its own `Sparkline`; no shared component change beyond the type union).

TSC exit 0.

**Files (all in one commit)**:
- `components/geo/GeoMarketActivity.tsx` (1-line union extension + 6-line comment)
- `app/[slug]/BuildingPage.tsx` (import + 5-line mount with comment)
- `docs/W-MARKETING-TRACKER.md` (this DECISION LOG entry)

**Commit SHA**: `81394f5` (this commit — extended GeoMarketActivity + BuildingPage mount + tracker in the same block).

### POST-PUSH VERIFY — 2026-07-03 (same-day close)

**Production render VERIFIED this session** on `https://www.aily.ca` — direct DOM-context grep against RSC output confirmed the panel's own markers, not incidental price tokens elsewhere on the page:

| URL | HTTP | Panel median (in DOM near "Median sale price") | Panel 6-metric grid samples | Empty-state |
|---|---|---|---|---|
| `/5750-tosca-dr-townhouse-condos-3250-bentley-mississauga` | **200** | **$600K** (`>$600K<`) | present | — |
| `/500-talbot-street-london-east` | **200** | **$283K** (`>$283K<`) | Sold 90d=1, STL=97.30%, Absorption=0.0% (matches DB) | — |
| `/side-launch-1-shipyard-lane-collingwood` | **200** | (no headline) | (no grid) | `Side Launch will be published as transaction activity` — verbatim, real building name, ZERO numbers |

**Non-regression on production VERIFIED**: all 3 live pages contain `Market Overview` (MarketStats heading, `×2` each) and `Price per sqft analysis and trends` (MarketIntelligence subtitle, `×1` each) — existing sibling panels render unchanged.

**System-1 LIVE production check VERIFIED** (the isolation-critical one; matches shared-exception rule per CLAUDE.md line 15):

| Live URL | System | HTTP | Panel heading `5750 Tosca Dr Townhouse Condos Market Statistics` | Panel median | `X-Robots-Tag` (A-UNIT-1a) |
|---|---|---|---|---|---|
| `https://www.yourcondorealtor.ca/5750-tosca-...` | S1 legacy agent (custom_domain) | **200** | present ×1 | **$600K** | `noindex, nofollow` ✓ |
| `https://viyacondex.condoleads.ca/5750-tosca-...` | S1 legacy agent (subdomain) | **200** | present ×1 | **$600K** | `noindex, nofollow` ✓ |

**Both System-1 live hosts render the new panel with `$600K` — byte-identical panel median to aily.ca for the same building.** Tenant-neutrality of the shared-exception path VERIFIED end-to-end on production. A-UNIT-1a's crawler block (`X-Robots-Tag: noindex, nofollow`) still fires on legacy hosts — panel is user-visible-only, Google won't index. Same posture as `MarketStats` / `MarketIntelligence` which already ship on both systems. No S1/S2 divergence introduced.

**A-UNIT-4b — CLOSED**. No open items from this unit. Ready to proceed to A-UNIT-4c (insight_* JSONB blocks) when dispatched.

---

## A-UNIT-4c — SHIPPED (2026-07-03)

**Scope**: extended `components/geo/GeoMarketActivity.tsx` (the same component 4a/4b already mount) with 7 `insight_*` JSONB blocks rendered LITERALLY beneath the existing 6-metric grid. Renders on all 5 mount points (Area, Community, Municipality, Neighbourhood, BuildingPage). Tenant-neutral by construction — zero code-plane references to tenant/agent/host in the component (VERIFIED via grep). Closes A-UNIT-4.

**RENDER RULE (universal, Rule Zero #1)**: LITERAL VALUES ONLY. No interpretive conclusions ("seller's market", "hot", "favours investors") — those are fabricated meaning even off real numbers. Every percentage renders WITH its raw count adjacent (Option 2). Proxy/modeled fields labeled **"estimated"**. Month numbers → month names. Per-field null gate: a field renders only if non-null. Per-block absence: null column → block absent (not empty-state). All-null → InsightSection returns null (stat panel still renders).

**7 BLOCKS + literal mapping (structures VERIFIED this session from real DB rows)**:

| # | Block | Coverage (rolling_12mo, low_volume_flag=false) | Track render | Sample literal render (from cited geo_ids) |
|---|---|---|---|---|
| 1 | `insight_investor_ratio` (PROXY — labeled "estimated") | 34-100% varying by level | both tracks | `Investor mix — estimated proxy (90d): Investor-proxy share: 83.33% · End-user: 16.67% (from 1 sales, 5 leases)` — VERIFIED(5750 Tosca) |
| 2 | `insight_price_reduction` | 100% all levels + tracks | both tracks | `Price reductions (90d): Price-reduction rate: 36.36% · Avg reduction: $37,250 (6.64%) · Monthly trend (22 months)` — VERIFIED(Windfields community-condo) |
| 3 | `insight_reentry` | 100% all levels + tracks | both tracks | `Re-entries: 1 · of 172 sold · rate 0.58% · Avg price change: -$145,000 (-19.33%)` — VERIFIED(Windfields). Note: `total_sold_12mo` may be omitted on some rows → per-field null-guarded. |
| 4 | `insight_seasonal` | 85-100% all levels + tracks | both tracks | `Historically strongest months: May, Apr, Jun · Weakest months: Mar, Jan, Feb · Annual: DOM 37.9d · sale-to-list 99.65% (n=172)` — VERIFIED(Windfields) |
| 5 | `insight_concession_matrix` | 100% condo all levels, 0% homes | condo-only | `1BR (28 sales) — 78.57% closed with concessions, avg 3.17% below ask` — VERIFIED(Windfields). Iterates present bedroom keys only. |
| 6 | `insight_demand_mismatch` | 69-100% condo, 0% homes | condo-only | `2BR: 42 active / 1 sold · mismatch +34.21%` — VERIFIED(Windfields). All 4 bedroom keys always present; mismatch % always paired with raw active/sold counts. |
| 7 | `insight_value_migration` | building-condo 29%, community-condo 87%, others 0-4% | **building + community ONLY** (gated) | `Median PSF: $545 — +5.55% vs community avg ($517) [premium]` — VERIFIED(5750 Tosca). Uses JSONB's own `direction` enum. |

**Key locked design decisions (all VERIFIED empirically this session)**:
- `insight_value_migration` gated to `geoType IN ('building','community')` — VERIFIED 0% area/muni/nbhd (RECON-2 Q1). Regression test: fake payload on `geoType='area'` → returns 0 blocks. PASS.
- `total_sold_12mo` on `insight_reentry` is optional — RECON-3 confirmed community row without it. Render guarded with `if (total_sold_12mo)`.
- `avg_reduction_amt_90d` / `avg_reduction_pct_90d` on `insight_price_reduction` may be null when zero reductions (VERIFIED on 5750 Tosca). Render guarded — no "$null" emitted (regression #3 PASS).
- `avg_price_change_*` on `insight_reentry` only rendered when `reentry_count > 0` (division-by-zero would produce NaN otherwise).
- `insight_seasonal.best_months` renders as month names (Jan..Dec via MONTH_NAMES table) — locked per operator decision (no interpretive framing).
- `insight_concession_matrix` iterates present bedroom keys only (bucket may be absent when zero sales in that bedroom — VERIFIED on building bc680002 which has only 3BR).
- `insight_demand_mismatch` always shows raw `supply_count` + `demand_count` adjacent to `mismatch_pct` (Rule "no bare percentages" — % always paired with counts).
- Component still fetches BOTH tracks (no `.eq('track', ...)`); per-block track gating driven by DB reality (condo-only fields naturally null on homes tracks).

**LOCAL SMOKE (this session)** — real cited geo_ids × render simulation + live dev server:

| Cited geo | geoType | geoId | Track | Observed insight blocks |
|---|---|---|---|---|
| **5750 Tosca** (b2c4f86e) | building | `b2c4f86e-9da2-44df-97c1-5a3636617c44` | condo | investor(83.33%/16.67%), price_reduction(0%), reentry(0/rate 0%), value_migration($545, +5.55%, premium), concession(2BR only, 12 sales, 91.67%), seasonal(strongest Aug/May/Sep) |
| **1535 Lakeshore** (bc680002) | building | `bc680002-1dfa-409b-8d18-1e2285ffb725` | condo | price_reduction(0%), reentry(0/rate 0%), demand_mismatch(all 4 buckets, sample 5 active / 1 sold), concession(3BR only, 22 sales, 90.91%), seasonal(11 months) |
| **Windfields** (022b1046) | community | `022b1046-fc13-418c-8303-4f4edf28cb65` | condo + homes | condo: all 7 blocks; homes: 4 blocks (concession/demand_mismatch/value_migration correctly absent — condo-only fields, homes-track has NULL) |
| **Muni 0224274a** | municipality | `0224274a-e58e-4af5-8419-3fc4e3f3a7e1` | condo + homes | 5 blocks (value_migration correctly absent per gating — VERIFIED not building+community) |

**REGRESSION TESTS** (4/4 PASS):
1. All 7 insight columns null on row → InsightSection returns `null`, stat panel still renders independently. VERIFIED(simulated).
2. `insight_value_migration` on `geoType='area'` with fake populated payload → 0 blocks (gate blocks render). VERIFIED.
3. Bad token grep on observed output (`$null | null% | undefined | NaN`) → 0 matches. VERIFIED.
4. Interpretive-word grep on component source (`seller's market | buyer | favours | good time | strong | attractive | undervalued | hot | cool | lucrative | ideal | bargain`) → 0 matches in `components/geo/GeoMarketActivity.tsx`. VERIFIED.

**LIVE DEV SERVER RENDER — both S2 tenants** (`npm run dev` on `http://localhost:3000`):

| Case | Host header | Path | HTTP | Insight-block markers found (6/6) | Cited literal values in HTML |
|---|---|---|---|---|---|
| **aily.ca (S2)** | `aily.ca` (DEV_TENANT_DOMAIN=aily.ca) | `/5750-tosca-dr-townhouse-condos-3250-bentley-mississauga` | 200 | Investor mix ✓, Price reductions ✓, Re-entries ✓, Concession pattern ✓, Median PSF vs parent ✓, Seasonality ✓ | 83.33% ✓, 16.67% ✓, 5.55% ✓, 3.32% ✓, 91.67% ✓, `premium` ✓ |
| **walliam.ca (S2)** | `walliam.ca` (DEV_TENANT_DOMAIN=walliam.ca) | same building | 200 | same 6/6 ✓ | same 6 literal values ✓ — BYTE-IDENTICAL insight blocks across S2 tenants |

**Tenant-neutrality VERIFIED end-to-end**: aily and walliam render IDENTICAL insight literals for the same building — as expected, since GeoMarketActivity has zero tenant/agent/host code-plane references and `geo_analytics` has no `tenant_id` column. Same architectural guarantee as A-UNIT-4a/4b/MarketStats/MarketIntelligence — all render identically on S1 hosts too (documented shared-exception, VERIFIED in A-UNIT-4b live production check).

**No-regression VERIFIED**:
- TSC exit 0 (no type errors introduced by the 7 insight interfaces or the InsightSection mount).
- Existing 4a/4b stat panel still renders (headings + 6-metric grid appear in both aily + walliam HTML).
- SELECT list extension does NOT drop any pre-existing columns (all 13 original + 7 new = 20 columns fetched).
- Component signature preserved: `geoType`, `geoId`, `geoName` props unchanged. All 5 mount sites unchanged. Zero touch of BuildingPage, AreaPage, CommunityPage, MunicipalityPage, or `[neighbourhood]/page.tsx`.
- MarketStats + MarketIntelligence untouched. Agent-context features untouched.
- Homepage `CondoMarketActivity` untouched.
- No-interpretation grep on the new component source: 0 matches for the 12 banned interpretive phrases. Literal-only render confirmed.

**Files (all in one commit)**:
- `components/geo/GeoMarketActivity.tsx` (extended: 7 JSONB interfaces + 7 render helpers + InsightSection + 20-col SELECT + comment)
- `docs/W-MARKETING-TRACKER.md` (this DECISION LOG entry)
- Backups: `components/geo/GeoMarketActivity.tsx.backup_W-A-UNIT-4c_20260703_091022`, `docs/W-MARKETING-TRACKER.md.backup_W-A-UNIT-4c_20260703_100535`

**Field taxonomy (Rule Zero #1 — proxies labeled)**:
- PROXY / MODELED: `investor_proxy_pct`, `end_user_pct` (both in `insight_investor_ratio`) — rendered with "estimated proxy" wording. Never as fact.
- DERIVED (deterministic arithmetic — safe as-is): all rates/pcts/ratios in the other 6 blocks.
- DIRECT COUNTS: `sale_count_90`, `lease_count_90`, `reentry_count`, `total_sold_12mo`, `total_active`, `total_sold_90`, per-bucket `count`/`supply_count`/`demand_count`, `sample_size`, `this_median_psf`, `parent_median_psf` — rendered as-is.
- SEMI-MODELED (opaque ranking): `best_months`/`worst_months` — operator locked "Historically strongest/weakest months: {names}" wording (labels the ranking without editorial framing).

**A-UNIT-4c — CLOSED. A-UNIT-4 — CLOSED**. No open items from this unit. All 5 mount pages now render 7 insight blocks below the stat panel where data exists. Tenant-neutral, literal-only, per-field null-gated, per-block absence handling.

**Commit SHA**: `ec7edc4` (pushed to `origin/main` at 2026-07-03).

### POST-PUSH VERIFY — 2026-07-03 (same-day close)

**Production render VERIFIED on `https://www.aily.ca`** — 4 live URLs, direct DOM-context grep against RSC output (React `<!-- -->` comment nodes stripped before grep so text-node continuity is preserved for the literal-value check):

| Check | URL | HTTP | Insight blocks (marker phrases) | Cited literal values in DOM | Bad tokens |
|---|---|---|---|---|---|
| **A. Community** | `/windfields` | **200** | Investor mix ×2, Price reductions ×2, Re-entries ×2, Concession pattern ×2, Median PSF vs parent ×2, Seasonality ×2, Supply vs demand ×2 (×2 = SSR + RSC payload) | Investor `98.36%` / `1.64%` + `from 11 sales, 660 leases` ✓, price_red `36.36%` + `$37,250` `(6.64%)` ✓, reentry `1 of 172 sold · rate 0.58% · -$145,000 (-19.33%)` ✓, value_mig `Median PSF: $417 — -6.46% vs municipality avg ($445) [discount]` ✓, concession all 4 buckets (`1br (28 sales) — 78.57%`) ✓, seasonal `May, Apr, Jun` / `Mar, Jan, Feb` ✓ | 0 (`$null`=0, `null%`/`NaN%`/`undefined%`=0) |
| **B. Building 5750 Tosca** | `/5750-tosca-dr-townhouse-condos-3250-bentley-mississauga` | **200** | Same 6 marker phrases | Investor `83.33%` / `16.67%` + `from 1 sales, 5 leases` ✓, value_mig `Median PSF: $545 — +5.55% vs community avg ($517) [premium]` ✓ **(exact combined-string match)**, concession `(12 sales) — 91.67% closed with concessions, avg 3.32% below ask` ✓ **(12 sales adjacent to 91.67%)**, seasonal `Aug, May, Sep` ✓ | 0 |
| **C. Building 1535 Lakeshore** | `/1535-lakeshore-road-e-mississauga` | **200** | Same 6 markers + Supply vs demand ×2 | demand_mismatch sample `5 active listings · 1 sold (90d)` ✓, `3br: 5 active / 1 sold · mismatch +0.00%` ✓ **(raw counts adjacent to mismatch %, no bare percentage)**, all 4 bedroom rows show `mismatch <strong>+0.00%</strong>` alongside `active / sold` ✓, concession `3br (22 sales) — 90.91% closed with concessions, avg 4.75% below ask` ✓ | 0 |
| **D. No-insight building** | `/side-launch-1-shipyard-lane-collingwood` | **200** | ZERO insight markers (Investor mix ×0, Price reductions ×0, Re-entries ×0, Concession pattern ×0, Median PSF vs parent ×0, Seasonality ×0, Supply vs demand ×0, Market Insights ×0) | 4a/4b empty-state paragraph verbatim: `Side Launch will be published as transaction activity is recorded in this area.` — real building name, ZERO fabricated numbers ✓ | 0 |

**Non-regression on production VERIFIED**: Side Launch page still shows `Market Overview` ×2 (MarketStats heading) + `Price per sqft analysis and trends` ×1 (MarketIntelligence subtitle) — existing sibling panels render unchanged next to the empty A-UNIT-4a stat panel + absent A-UNIT-4c insight section. Insight-section correctly hides when no `low_volume_flag=false` row exists.

**E. Cross-page interpretive-language grep** (banned patterns: `seller's market / buyer's market / favours X / good time to (buy|sell) / strong seller / hot market / cool market / undervalued / overvalued / lucrative / bargain`) — VERIFIED across all 4 live pages: **0 hits on every page**. Additional targeted check for "attractive" INSIDE insight-block regions on the 3 data-populated pages: 0 hits (the word appears only in pre-existing `building_description` DB content on some buildings, not in the new insight code — verified by grep-context around insight markers).

**All 5 verify checks (A–E) PASS on live production**. A-UNIT-4c — CLOSED with production proof. A-UNIT-4 — CLOSED.

**Files (verify commit)**:
- `docs/W-MARKETING-TRACKER.md` (this POST-PUSH VERIFY entry)
- Backup: `docs/W-MARKETING-TRACKER.md.backup_W-A-UNIT-4c-VERIFY_20260703_150116`



