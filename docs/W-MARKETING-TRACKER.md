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

**Next**: A-UNIT-4b (buildings) — extend the same `geo_type='building'` pattern to `BuildingPage.tsx` as a NEW panel that complements (does not replace) the existing `getBuildingMarketData`/`market_values` PSF-and-investment path. Requires sitemap-eligible-buildings coverage probe first (~4,574 quality-gated buildings — coverage TBD).
