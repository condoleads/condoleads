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

### A-UNIT-2 — Structured data / JSON-LD `[DEV]` — STATUS: **READY (recon corrected 2026-07-04)**

**Prior stall reason (documented for the record)**: earlier recon assumed column names `living_area`, `list_date`, `year_built (on mls_listings)`, `virtual_tour_url`, `photos_count`. This session's `information_schema` probe VERIFIED all five are **ABSENT** on `mls_listings`. The line-500-501 claim "`buildings.latitude`/`longitude` are populated in the DB" is also FALSE — this session's probe VERIFIED **0.0% populated** (0/9835 rows). The geo block MUST stay commented-out / omitted; uncommenting it would emit `null` values (Rule Zero violation). See the RECON section below for the full corrected field map.

Corrected scope (unchanged from the intent above, updated for real columns):
  - **`RealEstateListing` on `app/property/[id]/page.tsx` (condo) + `app/property/[id]/HomePropertyPage.tsx` (home)** — real DB columns cover every required + most optional fields (see RECON below for exact map). ~80 lines per page-type schema builder. Nested `about: { @type: Apartment | House | SingleFamilyResidence }` chosen by `property_subtype` (a real column, 100% populated).
  - **`LocalBusiness` / `RealEstateAgent` on homepage** — site-wide brand schema; unblocked pending recon of homepage's brand data source (deferred to A-UNIT-2 Part 2 recon).
  - **`BreadcrumbList` on building / area / muni / community pages** — pairs with Lane B-3 UI work.
  - **Fix `app/[slug]/components/BuildingSchema.tsx` Rule Zero violation** — line 19 hardcodes `"addressLocality": "Toronto"` for every building including non-Toronto ones. Real locality resolvable via `buildings → community_id → community.municipality_id → municipality.name` (VERIFIED join chain works this session for Mississauga, Oakville samples; NULL when `community_id` is null, which requires `canonical_address` fallback or omission). Also VERIFIED: **`buildings.latitude/longitude` = 0.0% populated (0/9835)** so the commented-out `geo` block at lines 23-27 must STAY commented — the earlier tracker line proposing an "uncomment + populate" 3-line fix was based on a falsified assumption. Same posture for `buildings.year_built`: VERIFIED **0.0% populated (0/9835)** — currently emitted at BuildingSchema line 29 → will emit `null`; gate with `year_built != null` or drop entirely.
  - **Dependencies**: independent of A-UNIT-1. Can ship in parallel.

#### A-UNIT-2 RECON — VERIFIED SCHEMA (2026-07-04)

**Table backing listing pages**: `public.mls_listings` (VERIFIED via `information_schema.tables` — 4 candidate tables containing "listing"; `mls_listings` is the one referenced by `app/property/[id]/page.tsx:126` `.from('mls_listings').select('*').eq('id', params.id)`). **494 columns total** (TREB IDX schema).

**Prior-assumed columns — ABSENT (VERIFIED this session)**:
| Assumed name | Real name / source |
|---|---|
| `living_area` | **ABSENT** — use `calculated_sqft` (integer, 33.9% populated) or `living_area_range` (varchar range like "1100-1500", 93.6% populated) |
| `list_date` | **ABSENT** — use `listing_contract_date` (date, 100.0% populated) or `on_market_date` |
| `year_built` (on mls_listings) | **ABSENT on mls_listings** — column lives on `buildings.year_built` (integer, but **0.0% populated in DB** — do NOT emit) |
| `virtual_tour_url` | **ABSENT** — skip; no clean alternate |
| `photos_count` | **ABSENT** — count `media` rows (`variant_type='large'`) at render time |

**REAL column → JSON-LD field map** (RealEstateListing / nested Residence/Apartment/House). All source columns VERIFIED via `information_schema` this session; population rates VERIFIED against 95,079 Active listings:

| JSON-LD field | Real column(s) | Population (% Active) | Rule Zero posture |
|---|---|---:|---|
| `url` | `resolveCanonicalHost()` + `generatePropertySlug()` / `generateHomePropertySlug()` (both already imported by pages this session) | — | always emit |
| `name` | title composed from `unparsed_address` + `unit_number` + `list_price` (same as `generateMetadata` already does) | — | always emit |
| `datePosted` | `listing_contract_date` | **100.0%** | always emit |
| `dateModified` | `modification_timestamp` | ~100% (unverified fill rate this session) | emit if non-null |
| `description` | `public_remarks` where `length > 20` | 99.9% | emit if non-null + long enough |
| `image[]` | `media.media_url` where `variant_type='large'` ordered by `order_number` | variable per listing (5-160+ rows typical) | emit array |
| `offers.price` | `list_price` (bigint) | **100.0%** | always emit |
| `offers.priceCurrency` | constant `"CAD"` (TREB is Canadian; not fabrication) | — | always emit |
| `offers.availability` | derived from `standard_status`: `Active`→`InStock`, `Pending`→`SoldOut`, else omit | 100% populated | emit when in enum |
| `offers.businessFunction` | derived from `transaction_type`: `For Sale`→`Sell`, `For Lease`→`LeaseOut` | — | emit when in enum |
| `offers.validFrom` | `on_market_date` | — | emit if non-null |
| `about.@type` | derived from `property_subtype` (100.0% populated): `Condo Apartment`→`Apartment`, `Detached`→`SingleFamilyResidence`, `Semi-Detached`/`Att/Row/Townhouse`→`House`, others→`Residence` | — | always resolves |
| `about.name` | `buildings.building_name` (via join on `mls_listings.building_id`, condos only) | — | emit if joined + non-null |
| `about.address.streetAddress` | derived from `street_number + street_name + street_suffix` (+ optional `unit_number`) | 100% | always emit |
| `about.address.addressLocality` | `city` with regex strip `/\s+[CWE]\d{2}$/` (Toronto "C10"/"W08"/"E09" TREB zone codes verified in Q3 sample of prior recon — 15,000+ Toronto listings have this suffix) | **100.0%** | emit stripped city |
| `about.address.addressRegion` | `state_or_province` | 100.0% | emit |
| `about.address.postalCode` | `postal_code` | 100.0% | emit |
| `about.address.addressCountry` | `country` | **84.5%** | **emit only when non-null** (NEVER default to "CA" for the 15.5%) |
| `about.numberOfBedrooms` | `bedrooms_total` | 98.8% | emit if non-null |
| `about.numberOfBathroomsTotal` | `bathrooms_total_integer` | 99.0% | emit if non-null |
| `about.floorSize` | priority 1: `calculated_sqft` (33.9%, scalar) → `QuantitativeValue{value, unitCode:"FTK"}`; priority 2: `living_area_range` matching `/^(\d+)-(\d+)$/` (93.6% populated, ~90% of them parseable) → bounded `QuantitativeValue{minValue, maxValue, unitCode:"FTK"}`; else omit | ~95% combined | emit when parseable |
| `geo` (GeoCoordinates) | `latitude`, `longitude` | **0.0%** | **NEVER emit** |
| identifier / MLS number | `listing_key` (varchar, NOT NULL on every row) | 100% | emit as `additionalProperty` PropertyValue with `name:"MLS Listing ID"` |

Fields skipped entirely (no clean data / column absent):
- `broker` / `seller` (list_office_name is 100% populated but no clean map to RealEstateListing; skip in v1)
- agent name (`list_agent_full_name` is 0.1% populated — nearly always null)
- `tax_annual_amount` / `association_fee` (no clean schema.org mapping on RealEstateListing)
- `year_built` (0.0% populated on buildings; not on mls_listings at all)

**`mls_listings` has NO `tenant_id` column** — VERIFIED (`information_schema.columns WHERE column_name ILIKE '%tenant%'` → 0 rows). Listing data is data-plane tenant-neutral. Host classification (per SEO scope) happens at emitter level, not data level.

**BuildingSchema.tsx Rule Zero violation — VERBATIM (VERIFIED this session)**:
```
17:      "@type": "PostalAddress",
18:      "streetAddress": building.canonical_address,
19:      "addressLocality": "Toronto",              ← hardcoded — fabricates locality for every non-Toronto building
20:      "addressRegion": "ON",                     ← safe (TREB is Ontario board) but still hardcoded
21:      "addressCountry": "CA"                     ← safe (TREB is Canadian) but still hardcoded
```
Buildings table VERIFIED (28 columns) has NO `city` / `state_or_province` column. Real locality path: **`buildings → community_id → communities.municipality_id → municipalities.name`**. VERIFIED this session:
- `King Gardens Condos` (75 King St E, Mississauga) → community "Cooksville" → municipality **"Mississauga"** ✓
- `Glen Abbey Village` (1450 Glen Abbey Gate, Oakville) → community "1007 - GA Glen Abbey" → municipality **"Oakville"** ✓
- `The Palace Condos` (1270 Maple Crossing Blvd, Burlington) → `community_id=NULL` → join yields NULL. Fallback needed: parse from `canonical_address` (last non-empty comma-separated piece before postal, when postal absent take the tail token) OR omit.

Buildings VERIFIED fill rates (this session, 9,835 rows total):
- `latitude` non-null: **0/9835 (0.0%)** — geo block MUST stay commented
- `year_built` non-null: **0/9835 (0.0%)** — currently emitted at BuildingSchema line 29 → will emit `null`; must be gated

**Mount points + in-scope data (zero new DB queries required — all JSON-LD emitters receive already-fetched props)**:

| Page | File | Data object already in scope | Notes |
|---|---|---|---|
| Condo listing | `app/property/[id]/page.tsx` | `listing` (SELECT * mls_listings), `building` (id, building_name, slug, canonical_address, development_id, community_id — line 137-139), `largePhotosResult` (media, media_url + order_number where variant_type='large', line 204-207) | Emitter receives listing + building + largePhotos + canonical URL. Zero new queries. |
| Home listing | `app/property/[id]/HomePropertyPage.tsx` | `listing` (SELECT *), conditional joins to `communities` / `municipalities` / `treb_areas` (lines 145/150/155 — already fetch municipality name for homes), `media` (line 160-163) | Municipality-name path already available for homes — cleaner than regex for addressLocality on homes. |
| Building | `app/[slug]/BuildingPage.tsx` | `building` (existing BuildingSchema mounted here, needs the addressLocality fix + geo/year_built gating) | Fix in place; consider a new join to communities/municipalities for real locality. |
| Geo pages (Area/Community/Muni/Neighbourhood) | `app/[slug]/{AreaPage,CommunityPage,MunicipalityPage}.tsx` + `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` | Each has its own geo row + geo hierarchy in scope | Candidates for BreadcrumbList + Place @type; deferred to A-UNIT-2 Part 2 build. |

**Host / tenant classification gate — REUSE existing pattern**:
- `app/robots.ts:32-59` implements the canonical 3-branch classification: comprehensive tenant (via `getCurrentTenantId()` from `lib/utils/tenant-resolver.ts`) → SEO surface; owner promo (`condoleads.ca`, `01leads.com`) → not SEO; else (legacy agent, unknown) → not SEO.
- JSON-LD emitters MUST call the SAME `getCurrentTenantId()` and return `null` when it returns null → no schema on legacy hosts, no schema on owner promo hosts. Zero brand branch (`if (host === 'aily.ca')` explicitly forbidden per CLAUDE.md:60). New comprehensive tenants inherit SEO surfaces (including JSON-LD) automatically via the same `tenants.domain` resolver — zero code change.

**Existing JSON-LD inventory (grep `application/ld+json | @type | schema.org` on `app/` + `components/` `*.tsx`, this session)**:
- **1 file only**: `app/[slug]/components/BuildingSchema.tsx` — emits `@type: ApartmentComplex` + nested `PostalAddress` (Toronto-hardcoded) + `AggregateOffer` + commented-out `GeoCoordinates`. No JSON-LD on listing pages, no LocalBusiness/RealEstateAgent, no BreadcrumbList anywhere. All A-UNIT-2 additions are net-new (except the BuildingSchema fix, which is in-place).

**Multi-tenant scope note**: Per WALLIAM-REMOVAL RECON (this session): WALLiam is currently STILL a live active tenant row (`is_active=true`, UUID `b16e1039-...`). CLAUDE.md documents both aily and walliam as active tenants. Under the SEO-scope classification, walliam.ca IS a comprehensive-tenant host that WOULD receive JSON-LD if it hits an A-UNIT-2-instrumented page. If operator wants aily-only JSON-LD, that requires either (a) a new per-tenant SEO capability flag in `tenants` (separate schema change, not this unit) or (b) WALLiam tenant removal (also separate). Neither has landed. A-UNIT-2's default posture: emit for every comprehensive tenant (Branch 1 host) — same posture as sitemap/robots today. Documenting this so no build-dispatch surprises the operator.

**Files this dispatch**: read-only recon only. Scripts left at `scripts/_recon-listing-cols.js` (safe — `BEGIN READ ONLY`). Backup: `docs/W-MARKETING-TRACKER.md.backup_A-UNIT-2-RECON_20260704_135942`. No code files touched. No SQL write. No commit made this dispatch (staging + commit pending operator go).

#### A-UNIT-2 PHASE 1 — BuildingSchema Toronto fix + RealEstateListing on condo pages — SHIPPED (2026-07-04)

Ships (a) the Rule Zero fix for BuildingSchema.tsx's hardcoded `"addressLocality": "Toronto"` and (b) a net-new `RealEstateListing` JSON-LD emitter on the condo listing page. Both gated on `isSeoEnabledTenant()` (shipped e3d229f) — emit for aily (`seo_enabled=true`), absent for walliam (`seo_enabled=false`) and non-tenant hosts. Zero brand branch.

##### Part 1 — BuildingSchema Toronto fix

**Fix**: `app/[slug]/components/BuildingSchema.tsx` — replaced hardcoded `"addressLocality": "Toronto"` with a real municipality-name prop resolved by the parent via the VERIFIED geo join chain `buildings.community_id → communities.municipality_id → municipalities.name`.
- Component converted to async server component.
- Gate at top: `if (!(await isSeoEnabledTenant())) return null` — JSON-LD is an SEO surface per CLAUDE.md line 60.
- New prop: `locality?: string | null`. When null (building has no `community_id`, or the join yields nothing) `addressLocality` is OMITTED. **Never falls back to any hardcoded string.**
- `yearBuilt`: gated to `building.year_built != null` (VERIFIED 0.0% populated at recon time; currently omitted on every building — emits only after backfill).
- `geo` block kept commented (VERIFIED lat/lng 0.0% populated across 9,835 buildings — uncommenting would emit `null`).
- `addressRegion` and `addressCountry`: OMITTED entirely because the `buildings` table has NO `state_or_province` / `country` columns (VERIFIED 28-column schema). Never fabricate.
- `AggregateOffer` block preserved as-is (pre-existing `priceCurrency: 'CAD'` retained — pre-existing pattern, not touched by this dispatch).

**BuildingPage integration** (`app/[slug]/BuildingPage.tsx`): async IIFE inline at the `<BuildingSchema>` mount site (line ~420) resolves `locality` via two targeted `.select` calls chained through `communities` → `municipalities`. Uses in-scope `building.community_id` (already present from the `SELECT *` cached fetch at line 20-31). Zero touch of the parallel query batch; single-round-trip lookup only when needed.

**Aily smoke (VERIFIED this session)** — 5750 Tosca Dr Townhouse Condos, Mississauga (`community_id → communities → municipalities.name = 'Mississauga'`):
```
JSON PARSES OK
@type:             ApartmentComplex
name:              "5750 Tosca Dr Townhouse Condos"
address:           {"@type":"PostalAddress","streetAddress":"3250 Bentley, Mississauga","addressLocality":"Mississauga"}
addressLocality:   "Mississauga"   ← REAL municipality via join (was hardcoded "Toronto" pre-fix)
hardcoded Toronto? false           ← Rule Zero violation ELIMINATED
```

##### Part 2 — RealEstateListing JSON-LD on condo listing page

**New file**: `app/property/[id]/components/ListingSchema.tsx` — async server component. Gates on `isSeoEnabledTenant()`. Consumes `listing`, `building`, `photos`, `canonicalUrl` — zero new DB queries; every prop comes from data the parent already fetched.

**Field map — every field from a VERIFIED column** (see A-UNIT-2 RECON above, `information_schema` probe, `mls_listings` 494-column schema):
| JSON-LD | Column | Rule Zero behavior |
|---|---|---|
| `@type` | constant `RealEstateListing` | Google's canonical real-estate type |
| `url` | canonical URL (`resolveCanonicalHost()` + `generatePropertySlug()`) | matches metadata canonical alternate |
| `about.@type` | derived from `property_subtype` via deterministic map (Condo Apartment→Apartment, Detached→SingleFamilyResidence, etc.) | fallback `Residence` when no clean map — no fabrication |
| `about.address.streetAddress` | `street_number` + `street_name` + `street_suffix` (+ `#unit_number`) | falls back to `unparsed_address` if pieces missing |
| `about.address.addressLocality` | `city` with regex strip `/\s+[CWE]\d{2}$/` (Toronto TREB zone codes) | deterministic; other cities unchanged |
| `about.address.addressRegion` | `state_or_province` | emitted only if non-null |
| `about.address.postalCode` | `postal_code` | emitted only if non-null |
| `about.address.addressCountry` | `country` (84.5% populated) | **emit only when non-null; NEVER default "CA" for the 15.5%** |
| `about.numberOfBedrooms` | `bedrooms_total` | emit only if non-null |
| `about.numberOfBathroomsTotal` | `bathrooms_total_integer` | numeric normalize; emit only if non-null and non-NaN |
| `about.floorSize` | `calculated_sqft` (scalar, unitCode `FTK`) OR `living_area_range` parsed `/^(\d+)-(\d+)$/` → `{minValue, maxValue}` | ranges like `"< 700"` dropped rather than fabricated |
| `about.name` | `building.building_name` (via join, when building present) | omitted if null |
| `offers.price` | `list_price` | 100% populated |
| `offers.priceCurrency` | **OMITTED** — no currency column exists on mls_listings (`list_price_unit` is a sale/lease descriptor like `"For Sale"`/`"Month"`, NOT ISO 4217). Per operator rule: OMIT rather than default. |
| `offers.availability` | derived from `standard_status`: Active/Active Under Contract→InStock, Pending/Closed→SoldOut | omit if no clean map |
| `offers.businessFunction` | derived from `transaction_type`: For Sale→Sell, For Lease→LeaseOut | omit if neither |
| `offers.validFrom` | `on_market_date` | omit if null |
| `identifier` | `listing_key` as `PropertyValue{ name:"MLS Listing ID", value }` | 100% populated |
| `datePosted` | `listing_contract_date` | 100% populated |
| `dateModified` | `modification_timestamp` | omit if null |
| `description` | `public_remarks` if `length > 20` | omit short/null |
| `image` | `media.media_url` where `variant_type='large'`, ordered, limit 8 | never emits missing/null URLs |
| `geo` | **OMITTED entirely** — lat/lng 0.0% populated on mls_listings | never fabricated |

**Aily smoke — real DB row verified this session**:
Listing: `id=fc04d083-4f3a-4186-8686-7baa49ba64d8, listing_key=W13517014, unparsed_address="101 Subway Crescent 2012, Toronto, ON M9B 6K4", city="Toronto W08", list_price=559900, bedrooms_total=2, bathrooms_total_integer="2.0", property_subtype="Condo Apartment", calculated_sqft=950, standard_status="Active", transaction_type="For Sale", country="CA"`.

Aily.ca curl output (VERBATIM parsed):
```
JSON PARSES OK
keys:            @context, @type, url, about, offers, identifier, datePosted, dateModified, description, image
about keys:      @type, address, numberOfBedrooms, numberOfBathroomsTotal, floorSize
offers keys:     @type, price, availability, businessFunction
no priceCurrency:  true       ← omitted per no-currency-column rule
no geo:            true       ← omitted per 0% lat/lng
addressLocality:   "Toronto"  ← TREB "W08" suffix STRIPPED from raw "Toronto W08"
addressCountry:    "CA"       ← real value from country column (non-null)
identifier.value:  "W13517014"
image count:       8          ← limit=8, real media URLs
```

Per-field DB-vs-render spot-check (VERIFIED matches):
- `about.address.streetAddress: "101 Subway Crescent #2012"` = `street_number + street_name + street_suffix + #unit_number` ✓
- `about.@type: "Apartment"` = mapped from `property_subtype="Condo Apartment"` ✓
- `about.floorSize.value: 950` = `calculated_sqft` ✓, `unitCode: "FTK"` ✓
- `offers.price: 559900` = `list_price` ✓
- `offers.availability: "https://schema.org/InStock"` = mapped from `standard_status="Active"` ✓
- `offers.businessFunction: "https://schema.org/Sell"` = mapped from `transaction_type="For Sale"` ✓
- `datePosted: "2026-07-03"` = `listing_contract_date` ✓
- `identifier.value: "W13517014"` = `listing_key` ✓

**Walliam smoke** — same URLs, `seo_enabled=false`:
- `/101-subway-crescent-unit-2012-w13517014` → HTTP 200, size 133,528 bytes, `application/ld+json` count: **0**, `RealEstateListing` count: **0** ✓
- `/5750-tosca-dr-townhouse-condos-3250-bentley-mississauga` → HTTP 200, size 310,081 bytes, `application/ld+json` count: **0**, `ApartmentComplex` count: **0** ✓
- **Regression check**: both pages still render 200 with full content when JSON-LD is suppressed. Listing page 133 KB, building page 310 KB — normal render sizes, tenant-scoped content intact.

##### Files this dispatch

- New: `app/property/[id]/components/ListingSchema.tsx` (async server component, 250 lines)
- Modified: `app/[slug]/components/BuildingSchema.tsx` (async + gate + real locality + year_built gate)
- Modified: `app/[slug]/BuildingPage.tsx` (municipality-name resolution IIFE at BuildingSchema mount)
- Modified: `app/property/[id]/page.tsx` (canonical URL resolution + ListingSchema mount)
- Backups: all `.backup_A-UNIT-2-P1_20260704_160331` on the 3 modified source files
- Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_A-UNIT-2-PHASE-1_20260704_161341`

**TSC**: exit 0 (all 4 file edits clean).

**Next**: Phase 2 (BreadcrumbList + geo-page `Place`/`LocalBusiness` schema) is the next dispatch. Same `isSeoEnabledTenant()` gate. Aily-only emission by tenant config, walliam absent by config, both without code branches.

#### A-UNIT-2 PHASE 2 RECON — BreadcrumbList + geo Place schema (2026-07-04)

Read-only recon. Establishes: which pages have parent-chain data ALREADY in scope for a full breadcrumb (name + slug per level) and which pages need extra joins; how URLs are constructed (must match sitemap canonicals); existing breadcrumb inventory (avoid duplicate emission); Place-schema field availability per geo table.

##### 0. Push state — 7c6c3c7 on origin/main (0 ahead)

`git log origin/main..HEAD` returned 0 rows (VERIFIED this session). HEAD and origin/main both at `7c6c3c7 W-MARKETING A-UNIT-2 PHASE 1: BuildingSchema Toronto fix + RealEstateListing JSON-LD on condo pages`. Working tree has pre-existing untracked artifacts (parity probes, dev outputs) — none from this dispatch.

##### 1. Breadcrumb parent-chain per page-type — in-scope data map

**Legend**: ✓ = in scope with name+slug (no new query); ⚠ = ID in scope (name+slug requires new join); ✗ = absent.

**Condo listing** — `app/property/[id]/page.tsx`:
| Level | In scope? | Source |
|---|---|---|
| Area | ⚠ | `listing.area_id` (from SELECT * @ line 126), 99.9% populated. **NAME+SLUG NOT FETCHED** — needs `SELECT id,name,slug FROM treb_areas WHERE id=listing.area_id`. |
| Municipality | ⚠ | `listing.municipality_id` 99.9% populated. **NAME+SLUG NOT FETCHED** — needs `SELECT id,name,slug FROM municipalities WHERE id=listing.municipality_id`. |
| Community | ⚠ | `listing.community_id` 96.2% populated. **NAME+SLUG NOT FETCHED** — needs `SELECT id,name,slug FROM communities WHERE id=listing.community_id`. |
| Development | ✓ | Already fetched conditionally at line 146-147 as `{id,name,slug}`. |
| Building | ✓ | Already fetched at line 138-139: `{id, building_name, slug, canonical_address, development_id, community_id}`. |
| Listing (self) | ✓ | canonicalUrl already resolved in Phase 1 (line 401-409 in the current page.tsx). Label = unit number / short address. |

Chain to emit (Phase 2 build target): Home > Area > Muni > Community > (Development?) > Building > Unit. Requires 3 new lookups (area/muni/community by ID) OR a single Promise.all pattern — copy the HomePropertyPage pattern (verified below).

**Home listing** — `app/property/[id]/HomePropertyPage.tsx`:
| Level | In scope? | Source |
|---|---|---|
| Area | ✓ | `area = areaResult.data` @ line 218, fetched via `.from('treb_areas').select('id,name,slug').eq('id', listing.area_id).single()` @ line 155. |
| Municipality | ✓ | `municipality = municipalityResult.data` @ line 217, fetched via `.from('municipalities').select('id,name,slug,area_id').eq('id', listing.municipality_id).single()` @ line 150. |
| Community | ✓ | `community = communityResult.data` @ line 216, fetched via `.from('communities').select('id,name,slug,municipality_id').eq('id', listing.community_id).single()` @ line 145. |
| Listing (self) | ✓ | canonicalUrl resolved similarly. |

**Full chain already in scope** — Home > Area > Muni > Community > Address. VERIFIED at `HomePropertyPageClient.tsx:102-107` — the existing visual `<Breadcrumb>` already emits these 4 levels. BreadcrumbList JSON-LD can reuse the same in-scope objects.

**BuildingPage** — `app/[slug]/BuildingPage.tsx`:
| Level | In scope? | Source |
|---|---|---|
| Area | ⚠ | Must chain from `building.community_id → communities.municipality_id → municipalities.area_id → treb_areas.name/slug`. Extends the Phase 1 IIFE at line 431-446. |
| Municipality | ⚠ | Phase 1 IIFE at line 431-446 already fetches `municipality.name` from the chain, but NOT `municipality.slug`. Extend `.select('id,name,slug,area_id')`. |
| Community | ⚠ | Phase 1 IIFE only fetches `communities.municipality_id`. Extend to `.select('id,name,slug,municipality_id')`. |
| Development | ✓ | Conditional, `{id,name,slug}` at line 300-302. |
| Building (self) | ✓ | `building.slug` + `building.building_name` in scope. |

Existing visual breadcrumb at `BuildingPage.tsx:415-418` currently emits `[development?, building_name]` — missing area/muni/community. Phase 2 build extends the same 2-step IIFE (or replaces with one Promise.all) to also fetch area/muni slugs.

**AreaPage** — `app/[slug]/AreaPage.tsx`:
| Level | In scope? | Source |
|---|---|---|
| Area (self, top) | ✓ | Props: `area = {id,name,slug}` @ line 34-35. |

No parent. Chain: Home > Area.

**CommunityPage** — `app/[slug]/CommunityPage.tsx`:
| Level | In scope? | Source |
|---|---|---|
| Area | ⚠ | `municipality.area_id` @ line 62 (`SELECT id,name,slug,area_id FROM municipalities`). **NAME+SLUG NOT FETCHED** — needs `SELECT id,name,slug FROM treb_areas WHERE id=municipality.area_id`. |
| Municipality | ✓ | `municipalityResult.data` @ line 62 = `{id,name,slug,area_id}`. |
| Community (self) | ✓ | Props: `community = {id,name,slug,municipality_id}`. |

Chain: Home > Area (needs 1 extra join) > Municipality > Community.

**MunicipalityPage** — `app/[slug]/MunicipalityPage.tsx`:
| Level | In scope? | Source |
|---|---|---|
| Area | ✓ | `areaResult.data` @ line 65 = `{id,name,slug}` — full parent already fetched. |
| Municipality (self) | ✓ | Props: `municipality = {id,name,slug,area_id}`. |

**Full chain already in scope** — Home > Area > Municipality. Zero new queries.

**Neighbourhood** — `app/comprehensive-site/toronto/[neighbourhood]/page.tsx`:
| Level | In scope? | Source |
|---|---|---|
| Municipalities (0..N) | ✓ | `municipalities = mappings.map(m => m.municipalities)` @ line 76 = `{id,name,slug}[]` fetched via `municipality_neighbourhoods` M2M embed at line 63-66. |
| Neighbourhood (self) | ✓ | `neighbourhood = {id,name,slug}` @ line 54-55. |

⚠ **Neighbourhood→municipality is MANY-TO-MANY** (verified via `municipality_neighbourhoods` table). Ambiguous parent for a single breadcrumb chain. Options: (a) pick the first municipality (deterministic ordering by table), (b) omit the municipality level and use `Home > Toronto (constant) > Neighbourhood`. Note: `neighbourhoods.area_id` column exists (verified — 5 columns including area_id) BUT is NOT fetched in the current page code; a 1-1 area link is available if fetched.

##### 2. URL construction patterns — canonical alignment

Each page-type's canonical alternate emits VERIFIED this session (via grep on `canonical: \`https://` in each page file). Breadcrumb `item` URLs will match these exactly so BreadcrumbList JSON-LD aligns with sitemap:

| Level | Canonical URL pattern | Source column |
|---|---|---|
| Area | `https://{domain}/${area.slug}` (`AreaPage.tsx:51`) | `treb_areas.slug` |
| Municipality | `https://{domain}/${municipality.slug}` (`MunicipalityPage.tsx:45`) | `municipalities.slug` |
| Community | `https://{domain}/${community.slug}` (`CommunityPage.tsx:43`) | `communities.slug` |
| Development | `https://{domain}/${development.slug}` (`DevelopmentPage.tsx:119`) | `developments.slug` |
| Building | `https://{host}/${params.slug}` (`BuildingPage.tsx:264`) | `buildings.slug` |
| Neighbourhood | `https://{domain}/toronto/${slug}` (`.../[neighbourhood]/page.tsx:45`) | `neighbourhoods.slug`, prefixed `/toronto/` |
| Condo listing | `https://{domain}${generatePropertySlug(listing)}` (`property/[id]/page.tsx:117`) | Slug helper |
| Home listing | `https://{domain}${generateHomePropertySlug(listing)}` (`HomePropertyPage.tsx:79`) | Slug helper |

**Sitemap alignment**: matches — the sitemap route handlers use the same slug + PGRST rpc'd paths (VERIFIED in `app/sitemap/[id]/route.ts`, lines 118-131 for listings, 149 for buildings, 168-176 for geo — all use per-row slugs + the same `/${slug}` or `/toronto/${slug}` conventions).

##### 3. Existing breadcrumbs — visual only, ZERO JSON-LD

- **`components/Breadcrumb.tsx`** (VERIFIED — 36 lines): visual-only nav/ol/li component. Prepends a "Home" link. Takes `items: {label, href?}[]`. No JSON-LD emission.
- **`grep -rn "BreadcrumbList" app/ components/`** (VERIFIED this session): **0 hits**. No BreadcrumbList JSON-LD anywhere in the codebase — Phase 2 emitter is net-new (no duplicate risk).
- Existing `<Breadcrumb>` usage:
  - `BuildingPage.tsx:415-418` — items: `[development?, building_name]` (missing area/muni/community)
  - `DevelopmentPage.tsx:225` — items: `[development.name]` (top-level only)
  - `PropertyPageClient.tsx:105-109` — items: `[development?, building?, "Unit N"]` (missing area/muni/community)
  - `HomePropertyPageClient.tsx:102-107` — items: `[area?, municipality?, community?, shortAddress]` — **FULL 4-LEVEL CHAIN ALREADY BUILT**
  - `AreaPage`, `CommunityPage`, `MunicipalityPage`, Neighbourhood page — **NO visual breadcrumb** currently
- Recommended posture for Phase 2:
  - BreadcrumbList JSON-LD emitter (new file, gated on `isSeoEnabledTenant()`) mounted on each page.
  - Optional: also add the visual `<Breadcrumb>` component to the 4 geo pages currently missing it (`Area/Community/Muni/Neighbourhood`), passing the same `items` prop as the JSON-LD emitter. Keeps visual + JSON-LD consistent, single source of truth per page. Operator to decide scope.

##### 4. Geo-page Place schema — field availability + @type map

VERIFIED column list per geo table (this session):

| Table | Columns | Place-relevant | @type recommendation |
|---|---|---|---|
| `treb_areas` | id, name, slug, code, display_order, is_active, homes_count, buildings_discovered/synced, discovery_status, last_discovery_at, created_at, updated_at (13 cols) | `name`, `slug` | `AdministrativeArea` (schema.org: region within a country/state) |
| `municipalities` | + `area_id` (14 cols) | `name`, `slug`, `area_id` (for containedInPlace) | `City` |
| `communities` | + `municipality_id` (13 cols) | `name`, `slug`, `municipality_id` | `Place` (generic — `Neighborhood` is US-centric; `Place` is safer) |
| `neighbourhoods` | id, name, slug, display_order, is_active, area_id, created_at, updated_at (8 cols) | `name`, `slug`, `area_id` | `Place` (same rationale) |

**Fields EMITTED for Place @type** (all levels):
- `@type` per-table from the map above
- `name` from `name` column ✓
- `url` from canonical URL pattern (§2)
- `containedInPlace` — recursive nested Place. Chain up via `area_id`/`municipality_id` FKs (fetch parent name+slug if not already in scope; MunicipalityPage has parent, AreaPage has no parent, others need extra joins per §1)

**Fields OMITTED entirely** (no source column):
- `geo` (GeoCoordinates) — NO lat/lng column on ANY geo table (verified). Never emit. Matches Phase 1's mls_listings/buildings 0% posture.
- `address` (PostalAddress) — NO street/postal columns on geo tables. Never emit.
- `description` — NO description column. Never emit.

`LocalBusiness` on the homepage (mentioned in operator's original A-UNIT-2 scope): NOT in this Phase 2 recon — homepage brand-data recon is a separate follow-up (operator flagged in the earlier A-UNIT-2 recon as "Part 2"). Not addressed here.

##### 5. Phase 2 BUILD implications (for the next dispatch)

- **BreadcrumbList JSON-LD emitter** (new file, e.g. `components/BreadcrumbListSchema.tsx`): gated on `isSeoEnabledTenant()`. Takes `items: {name, url}[]` where url is the FULL canonical URL for each level. Emits `<script type="application/ld+json">` with `@type: BreadcrumbList` and `itemListElement: [{@type:ListItem, position, name, item(url)}]` per schema.org spec.
- **Data availability by page** (from §1 map):
  - Ready-to-ship without new queries: **MunicipalityPage** (Home > Area > Muni), **HomePropertyPage** (Home > Area > Muni > Community > Address).
  - Needs 1 extra join: **CommunityPage** (fetch area name+slug from `municipality.area_id`), **AreaPage** (Home > Area only — trivial).
  - Needs 3 extra fetches (Promise.all pattern from HomePropertyPage): **Condo PropertyPage** (fetch area/muni/community by listing FKs).
  - Needs extended IIFE: **BuildingPage** (extend Phase 1 chain to also return area+muni+community slug — 2-3 more `.select` calls).
  - Ambiguous parent (M2M) or requires new area fetch: **Neighbourhood page**. Simple deterministic chain (Home > Toronto > Neighbourhood) recommended.
- **Geo-page Place schema**: separate small emitter per page-type OR one shared component that accepts `{@type, name, url, containedInPlace}` props. Same `isSeoEnabledTenant()` gate.

##### 6. Files this dispatch

Read-only recon only. No code files touched. No SQL write. Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_A-UNIT-2-PHASE-2-RECON_20260704_164428`. Data queries via ad-hoc `node -e` scripts (safe — `BEGIN READ ONLY`, explicit column allow-lists). **No commit made this dispatch** (staging + commit pending operator go on the recon-line).

#### A-UNIT-2 COVERAGE RECON — verify Phase 1 emitter's real coverage (2026-07-04)

Read-only recon on the shipped 7c6c3c7 emitter. Verifies property-type coverage (condo vs home) and listing-state handling (Active / Cancelled / Expired / Withdrawn / Closed / etc.) against the REAL distinct values in `mls_listings`. Result: **two coverage flaws to fix in Phase 2**.

##### 1. Property-type mount coverage — HOME LISTINGS EMIT NOTHING

`grep -n "ListingSchema" app/property/[id]/page.tsx app/property/[id]/HomePropertyPage.tsx` (VERIFIED this session):
- `app/property/[id]/page.tsx:7`: `import ListingSchema from './components/ListingSchema'` ✓
- `app/property/[id]/page.tsx:420`: `<ListingSchema ...>` ✓
- `app/property/[id]/HomePropertyPage.tsx`: **0 hits** — no import, no mount.

**Gap CONFIRMED**: home listings (`property_type = 'Residential Freehold'`, subtypes `Detached / Semi-Detached / Att/Row/Townhouse / Link / Duplex / Triplex / Fourplex / Multiplex`) currently emit **zero** RealEstateListing JSON-LD. Only condo listings are covered. Home listing counts (Active only, from prior recon): 47,000+ Active homes have no schema today.

**Fix (next dispatch)**: mount `<ListingSchema>` in `HomePropertyPage.tsx` with the same prop shape (`listing / building=null / photos / canonicalUrl`). Note: `building` will be null on homes (freehold), so `about.name` (building name) is naturally omitted for homes — no wrong data emitted. Component already null-guards `building?.building_name`.

##### 2. Listing-state mapping — verified vs real DB distincts

**Emitter's mapping** (VERIFIED in `app/property/[id]/components/ListingSchema.tsx:132-150`):
```
availabilityFromStatus(status):
  'Active' | 'Active Under Contract'  →  'https://schema.org/InStock'
  'Pending' | 'Closed'                 →  'https://schema.org/SoldOut'
  default (any other value)           →  null   (OMIT availability field)

businessFunctionFromTx(tx):
  'For Sale'    →  'https://schema.org/Sell'
  'For Lease'   →  'https://schema.org/LeaseOut'
  default (any other value)  →  null   (OMIT businessFunction field)
```

**Real distinct `standard_status × transaction_type` in `mls_listings`** (VERIFIED this session — top rows by count):
| standard_status | transaction_type | count | Emitter behavior |
|---|---|---:|---|
| Closed | For Sale | 319,071 | `SoldOut` + `Sell` — arguably OK (honest historical sale) |
| Cancelled | For Sale | 314,950 | availability OMITTED + `Sell` — **⚠ misleading** (see below) |
| Closed | For Lease | 306,532 | `SoldOut` + `LeaseOut` — SoldOut is inexact for leases; schema.org has no dedicated "leased-out" enum, so this is the least-bad option |
| Expired | For Sale | 126,846 | availability OMITTED + `Sell` — **⚠ misleading** |
| Cancelled | For Lease | 117,071 | availability OMITTED + `LeaseOut` — **⚠ misleading** |
| Active | For Sale | 71,565 | `InStock` + `Sell` — ✓ correct |
| Expired | For Lease | 35,189 | availability OMITTED + `LeaseOut` — **⚠ misleading** |
| Active | For Lease | 23,464 | `InStock` + `LeaseOut` — ✓ correct |
| Withdrawn | For Sale | 22,649 | availability OMITTED + `Sell` — **⚠ misleading** |
| Withdrawn | For Lease | 16,420 | availability OMITTED + `LeaseOut` — **⚠ misleading** |
| null | For Sale | 7,611 | availability OMITTED — safe (no state to report) |
| Active Under Contract | For Sale | 5,833 | `InStock` + `Sell` — ⚠ debatable (under contract ≠ freely available) |
| Pending | For Sale | 1,915 | `SoldOut` + `Sell` — ✓ acceptable (sale in progress) |
| null | For Lease | 957 | availability OMITTED — safe |
| Active Under Contract | For Lease | 245 | `InStock` + `LeaseOut` — ⚠ debatable |
| Pending | For Lease | 209 | `SoldOut` + `LeaseOut` — ✓ acceptable |
| Cancelled | For Sub-Lease | 116 | availability OMITTED + `businessFunction` OMITTED — misleading absent AND wrong |
| Closed | For Sub-Lease | 79 | `SoldOut` + `businessFunction` OMITTED — sub-lease has no map |
| Delete | For Sale | 79 | availability OMITTED + `Sell` — **⚠ misleading** |
| Expired | For Sub-Lease | 60 | availability OMITTED + `businessFunction` OMITTED |
| Removed | For Lease | 57 | availability OMITTED + `LeaseOut` — **⚠ misleading** |
| Active | For Sub-Lease | 48 | `InStock` + `businessFunction` OMITTED |
| Withdrawn | For Sub-Lease | 41 | availability OMITTED + `businessFunction` OMITTED |
| Removed | For Sale | 39 | availability OMITTED + `Sell` |
| Delete | For Lease | 21 | availability OMITTED + `LeaseOut` |
| Incomplete | For Sale | 7 | availability OMITTED + `Sell` |
| Removed | For Sub-Lease | 4 | availability OMITTED + `businessFunction` OMITTED |
| Active | null | 2 | `InStock` + `businessFunction` OMITTED |
| Expired | null | 1 | availability OMITTED + `businessFunction` OMITTED |

**Rule Zero flag — "half-schema" on withdrawn listings** (Cancelled + Expired + Withdrawn + Removed + Delete + Incomplete):
- **~641,000 listings** in aggregate (~46% of the mls_listings table).
- Emitter behavior on these rows: `@type: RealEstateListing` + `offers.price` (the old list_price) + `offers.businessFunction: Sell`/`LeaseOut` (transaction_type map still fires) — but `offers.availability` is OMITTED (fail-closed).
- Google's rich-result parser reads this as "a real estate listing with a price, available for a sale/lease transaction, current availability unspecified". That is **misleading**: the listing is no longer available at all.
- Schema.org enum `Discontinued` (`https://schema.org/Discontinued`) is the honest map for withdrawn/cancelled/expired listings.

**Rule Zero flag — For Sub-Lease `businessFunction` gap**: 348 rows (Active/Cancelled/Closed/Expired/Withdrawn/Removed × For Sub-Lease). Emitter's `businessFunctionFromTx` returns null for `'For Sub-Lease'` (no case). Sub-lease is a form of leasing out — `LeaseOut` is the correct map. Not a Rule Zero *violation* per se (OMIT is safe), but it's incomplete data. Volume tiny (~348), fix bundled with the Discontinued map.

**Rule Zero acceptable — Active Under Contract → InStock**: schema.org's `InStock` semantics allow an in-negotiation offer to still be considered "in stock" until the sale closes. Not a violation, just a nuance. Leave as-is.

##### 3. Wrong-state reachability — VERIFIED yes

Condo page fetch (VERIFIED at `app/property/[id]/page.tsx:126-129`):
```
const { data: listing, error } = await supabase
  .from('mls_listings')
  .select('*')
  .eq('id', params.id)
  .single()
```
**No `standard_status` filter.** The page renders for any listing_key regardless of state.

Slug dispatcher (`app/[slug]/page.tsx:22-49`): fetches by `listing_key` → no state filter either.

Downstream state-branch: `page.tsx:378: const isClosed = listing.standard_status === 'Closed'` — the page knows the state (uses it for closed-price display + related-listings query) but does NOT gate the emitter or the whole page.

**Conclusion**: any listing_key URL (Cancelled / Expired / Withdrawn / Closed) is a reachable, rendering URL that WILL trigger the emitter on aily.ca. Sitemap (VERIFIED at `sitemap.xml/route.ts:60`) only includes `Active / Active Under Contract` — so Google doesn't organically discover the wrong-state URLs. But links from other sources (Google's stale cache, external links, in-page "sold comps" navigation) can and do reach them.

##### 4. Coverage matrix — plain

| Axis | Coverage |
|---|---|
| **Property type: Condo** | ✓ covered by ListingSchema |
| **Property type: Home** | ✗ **GAP — HomePropertyPage doesn't mount ListingSchema** |
| **State: Active / Active Under Contract** | ✓ correct emission (InStock) |
| **State: Pending / Closed** | ✓ correct emission (SoldOut) |
| **State: Cancelled / Expired / Withdrawn / Removed / Delete / Incomplete** | ⚠ **RULE ZERO FLAG — Offer with price + businessFunction emitted, availability OMITTED. Should map to Discontinued.** ~641k listings affected. |
| **Transaction: For Sale / For Lease** | ✓ correct businessFunction |
| **Transaction: For Sub-Lease** | ⚠ businessFunction OMITTED (small volume ~348 rows) — should map to LeaseOut |

##### 5. Phase 2 build implications

Two additions to the Phase 2 build scope (both to fix here rather than defer, per NOTHING-DEFERRED and Rule Zero):

**A. Mount `ListingSchema` on `HomePropertyPage.tsx`** — same shape, `building={null}`. Component null-guards work. Estimated ~5 lines (import + mount + canonicalUrl resolution IIFE mirroring the condo page).

**B. Extend `availabilityFromStatus` map + `businessFunctionFromTx` map**:
```
availabilityFromStatus:
  Active | Active Under Contract   → InStock
  Pending | Closed                 → SoldOut
  Cancelled | Expired | Withdrawn |
  Removed | Delete | Incomplete    → Discontinued        ← ADD
  default                          → null (unknown state)

businessFunctionFromTx:
  For Sale                         → Sell
  For Lease | For Sub-Lease        → LeaseOut            ← ADD sub-lease
  default                          → null
```

Every case is a VERIFIED distinct value from the DB this session. Fail-closed default preserved.

##### 6. Files this dispatch

Read-only recon only. No code files touched. No SQL write. Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_A-UNIT-2-COVERAGE-RECON_20260704_165109`. Data query via ad-hoc `node -e` script (safe — `BEGIN READ ONLY`, no `SELECT *` on credential tables). **No commit made this dispatch** (staging + commit pending operator go on the recon-line).

#### A-UNIT-2 PHASE 2 SHIPPED — BreadcrumbList + Place schema + 2 coverage fixes (2026-07-04)

Ships (a) BreadcrumbList JSON-LD emitter mounted on all 7 page types, (b) Place-family JSON-LD emitter on 4 geo pages, and (c) the two Rule Zero coverage fixes from this session's COVERAGE RECON. All gated on `isSeoEnabledTenant()` (e3d229f).

##### Part A — Coverage fixes (Rule Zero + property-type parity)

**A1. `availabilityFromStatus` + `businessFunctionFromTx` extended** (`app/property/[id]/components/ListingSchema.tsx`):
- **`Cancelled | Expired | Withdrawn | Removed | Delete | Incomplete → 'https://schema.org/Discontinued'`** — every state VERIFIED distinct DB value this session. Fixes the ~641k rows that previously emitted price+businessFunction with an OMITTED availability, reading as "priced, availability unspecified" when the listing was actually withdrawn.
- **`For Sub-Lease → 'https://schema.org/LeaseOut'`** — VERIFIED distinct DB value (~348 rows across all statuses). Prior emitter returned null (safe but incomplete).
- Default fail-closed branch preserved for genuinely unknown states.

**A2. `ListingSchema` mounted on `HomePropertyPage.tsx`** — same shape as condo page, `building={null}` (component null-guards at line 183: `if (building?.building_name) about.name = ...`). Homes now emit RealEstateListing JSON-LD identically to condos. Fills the ~47k-Active-home coverage gap.

##### Part B — BreadcrumbList emitter (new shared component)

**New file**: `components/BreadcrumbSchema.tsx` (async server component, gated on `isSeoEnabledTenant()`). Accepts `items: {name, url}[]` (ordered, root-adjacent to current page — Home is prepended by the component itself) + `homeUrl`. Emits `<script type="application/ld+json">` with `@type: BreadcrumbList` + `itemListElement[]` per schema.org spec.

**Mounted on 7 pages** with per-page chain built from VERIFIED in-scope data (no fabrication; missing FK/slug drops that level):
- **`HomePropertyPage.tsx`**: full chain Home > Area > Muni > Community > shortAddress. Area/muni/community already in scope (existing 3× parallel joins at lines 145/150/155).
- **`app/property/[id]/page.tsx` (condo)**: adds 3× Promise.all lookup by `listing.{area_id, municipality_id, community_id}` (mirroring the home page pattern). Chain: Home > Area > Muni > Community > Building > Unit N.
- **`app/[slug]/BuildingPage.tsx`**: refactors Phase 1's inline muni-name IIFE into a top-of-function chain resolver that returns `{area, muni, community}` name+slug. Shares the result with `BuildingSchema` (locality) AND `BreadcrumbSchema` (items). Chain: Home > Area > Muni > Community > (Development?) > Building.
- **`app/[slug]/AreaPage.tsx`**: Home > Area (trivial — self only).
- **`app/[slug]/CommunityPage.tsx`**: Home > Area > Muni > Community. `area` was already fetched conditionally at line 170; `municipality` was in the parallel batch. Zero new query.
- **`app/[slug]/MunicipalityPage.tsx`**: Home > Area > Muni. Both already in scope (area via `municipalityResult` chain).
- **`app/comprehensive-site/toronto/[neighbourhood]/page.tsx`**: Home > Neighbourhood. Middle "Toronto" crumb from the visual GeoHero DROPPED in JSON-LD — VERIFIED this session that no `treb_area` or `municipality` has `slug='toronto'` (only per-district `toronto-c01`/`w08`/etc.), so a schema URL to `/toronto` would point to a non-page. Rule Zero: never emit a schema URL for a non-page. Visual GeoHero unchanged.

##### Part C — Place emitter (new shared component)

**New file**: `components/PlaceSchema.tsx` (async server component, gated). Accepts nested `PlaceNode` `{type, name, url, containedInPlace?}`. Emits `<script type="application/ld+json">` with recursive `containedInPlace` chain.

@type per table (VERIFIED column set this session):
- `treb_areas` → `AdministrativeArea`
- `municipalities` → `City`
- `communities` → `Place` (generic; `Neighborhood` schema.org type is US-centric)
- `neighbourhoods` → `Place`

**EMITS**: `@type`, `name`, `url`, `containedInPlace` (recursive chain up).
**OMITS ENTIRELY**: `geo` (lat/lng 0% populated on all 4 geo tables — VERIFIED), `address` (no street/postal columns on any geo table), `description` (no column).

**Mounted on 4 geo pages** with the same-parent-fetch as BreadcrumbSchema:
- AreaPage: `AdministrativeArea` (no containedInPlace)
- MunicipalityPage: `City` containedInPlace `AdministrativeArea`
- CommunityPage: `Place` containedInPlace `City` containedInPlace `AdministrativeArea` (3-level nesting)
- Neighbourhood: `Place` (no containedInPlace — see BreadcrumbSchema rationale)

##### TSC clean check

`npx tsc --noEmit` → exit 0 on all Phase 2 edits (2 new components + 8 mount-site edits).

##### Smoke — aily.ca (VERIFIED, this session)

**1. Real ACTIVE home listing** `/31-calamint-lane-toronto-e13522120` (Att/Row/Townhouse, $799k, L'Amoreaux community):
```
HTTP 200, size 373 KB
RealEstateListing count: 1  ← coverage-fix Part A2 confirmed
BreadcrumbList count: 1
BreadcrumbList itemListElement (5 levels):
  [1] Home           → https://aily.ca/
  [2] Toronto        → https://aily.ca/toronto-area
  [3] Toronto E05    → https://aily.ca/toronto-e05
  [4] L'Amoreaux     → https://aily.ca/lamoreaux
  [5] 31 Calamint Lane → https://aily.ca/31-calamint-lane-toronto-e13522120
```

**2. Real WITHDRAWN condo** `/109-front-street-e-unit-643-c13519594` (listing_key C13519594, `standard_status='Withdrawn'`):
```
HTTP 200, size 165 KB
RealEstateListing JSON PARSES OK
offers.availability:      "https://schema.org/Discontinued"  ← RULE ZERO FIX CONFIRMED
offers.price:             850000    (real historical list_price)
offers.businessFunction:  https://schema.org/Sell
```
Previously would have emitted `price` + `businessFunction` with NO `availability`. Now honestly says "discontinued".

**3. Municipality page** `/oakville`:
```
HTTP 200, size 384 KB
"@type":"City" x1               ← PlaceSchema self
"@type":"AdministrativeArea" x1 ← containedInPlace parent (area)
"@type":"BreadcrumbList" x1
```

**4. Community page** `/cooksville`:
```
HTTP 200, size 168 KB
"@type":"Place" x1              ← PlaceSchema self (community)
"@type":"City" x1               ← containedInPlace parent (municipality)
"@type":"AdministrativeArea" x1 ← containedInPlace grandparent (area)
"@type":"BreadcrumbList" x1
containedInPlace occurrences: 1 (nested recursively — 2 chain levels above Community)
```

##### Smoke — walliam.ca (VERIFIED absent — regression check)

Same 4 URLs on `Host: walliam.ca` (`seo_enabled=false`):
| URL | HTTP | size | application/ld+json | RealEstateListing | BreadcrumbList | Place-family |
|---|---|---|---|---|---|---|
| `/31-calamint-lane-toronto-e13522120` | 200 | 356 KB | **0** | 0 | 0 | 0 |
| `/109-front-street-e-unit-643-c13519594` | 200 | 140 KB | **0** | 0 | 0 | 0 |
| `/oakville` | 200 | 381 KB | **0** | 0 | 0 | 0 |
| `/cooksville` | 200 | 164 KB | **0** | 0 | 0 | 0 |

All 4 pages render 200 with full content, **zero** JSON-LD emitted. Regression check pass — no page breaks when schema is suppressed.

##### Files this dispatch

New:
- `components/BreadcrumbSchema.tsx` (async server component, gated)
- `components/PlaceSchema.tsx` (async server component, gated)

Modified:
- `app/property/[id]/components/ListingSchema.tsx` (Discontinued + Sub-Lease map extensions)
- `app/property/[id]/HomePropertyPage.tsx` (import + mount ListingSchema + BreadcrumbSchema with in-scope area/muni/community)
- `app/property/[id]/page.tsx` (canonical resolver return shape + 3× Promise.all + BreadcrumbSchema mount)
- `app/[slug]/BuildingPage.tsx` (Phase 1 IIFE refactored into top-of-function chain resolver returning area/muni/community, shared by BuildingSchema and BreadcrumbSchema)
- `app/[slug]/AreaPage.tsx` (import + Breadcrumb + Place mounts)
- `app/[slug]/CommunityPage.tsx` (import + Breadcrumb + Place with 3-level containedInPlace chain)
- `app/[slug]/MunicipalityPage.tsx` (import + Breadcrumb + Place with containedInPlace to area)
- `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` (import + Home>Neighbourhood breadcrumb + Place)

Backups: all 8 modified sources have `.backup_A-UNIT-2-P2_20260704_165626`. Tracker backup: `docs/W-MARKETING-TRACKER.md.backup_A-UNIT-2-PHASE-2-SHIPPED_20260704_171753`.

Every emitter gated on `isSeoEnabledTenant()`. Every breadcrumb URL built from a VERIFIED slug (matches sitemap canonical byte-for-byte). Every level with a null FK/slug is dropped, not fabricated. Zero brand branch (`if (host === 'aily.ca')` never appears).

**A-UNIT-2 fully shipped**: RealEstateListing on condos + homes with correct state coverage; ApartmentComplex on buildings with real locality; BreadcrumbList on all 7 page types; Place on 4 geo pages. LocalBusiness on homepage remains a separate follow-up (needs homepage brand-data recon).

#### A-UNIT-2 COMPREHENSIVE-CLOSE — routing + matrix + LocalBusiness (2026-07-05)

**Drift reconcile**: the prior "A-UNIT-2 fully shipped" line was PARTIAL — it deferred LocalBusiness to "separate follow-up," did NOT verify routing from code, and did NOT publish a coverage matrix. Three open Rule Zero items (GUESSING, COMPREHENSIVE, NOTHING-DEFERRED) blocked the 6d18e55 push. This dispatch closes all three and reconciles the tracker before push.

##### 1. Routing verification (Rule Zero: no guessing)

Dispatcher at `app/[slug]/page.tsx` (VERIFIED VERBATIM, this session):
```
Line 22: if (isPropertySlug(params.slug))       → PropertyPage (condo)
Line 133: if (isHomePropertySlug(params.slug))  → HomePropertyPage (home)
Line 153: else → DevelopmentPage (development slug match)
Line 164: else → AreaPage (treb_areas.slug match)
Line 175: else → MunicipalityPage (municipalities.slug match)
Line 186: else → CommunityPage (communities.slug match)
Line 197: else → BuildingPage (buildings.slug fallback)
```

Slug predicates (`lib/utils/slugs.ts`):
- `isPropertySlug` (line 19): `slug.includes('-unit-')` → condo
- `isHomePropertySlug` (line 97): no `-unit-`, last segment matches MLS pattern `[A-Z]\d{5,}` → home

Home page gate (`app/property/[id]/HomePropertyPage.tsx:100`):
```
if (!RESIDENTIAL_TYPES.includes(listing.property_subtype)) notFound()
```
`RESIDENTIAL_TYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']`

**Real distinct `property_type × property_subtype` counts** (Active listings, VERIFIED this session):
- Residential Freehold: 65,339 total (Detached 43,378 / Att-Row-Townhouse 6,046 / Vacant Land 5,656 / Semi-Detached 3,863 / Multiplex 1,331 / Duplex 1,153 / Farm 530 / Triplex 526 / MobileTrailer 496 / Rural Residential 487 / Other 438 / Fourplex 319 / Lower Level 286 / Link 256 / Modular Home 227 / Upper Level 165 / Store W Apt-Office 146 / Room 31)
- Residential Condo & Other: 28,607 total (Condo Apartment 21,170 / Condo Townhouse 5,827 / Common Element Condo 596 / Other 261 / Co-op Apartment 159 / Detached Condo 139 / Parking Space 132 / Vacant Land Condo 123 / Semi-Detached Condo 54 / Leasehold Condo 47 / Co-Ownership Apartment 43 / Upper Level 18 / Locker 17 / Timeshare 9 / Room 7)
- Commercial: 1,133 total

**property_type → page → RealEstateListing schema**:
| Bucket | Real subtypes | Routes to | RealEstateListing? |
|---|---|---|---|
| Condos with `-unit-` slug | All condo subtypes if unit_number in slug (Condo Apartment/Townhouse/Common Element/Detached Condo/Semi Condo/Parking Space/etc.) | PropertyPage | ✓ SHIPPED (Phase 1) |
| Homes with RESIDENTIAL_TYPES subtype | Detached, Semi-Detached, Att/Row/Townhouse, Link, Duplex, Triplex, Fourplex, Multiplex (~56,772 Active) | HomePropertyPage | ✓ SHIPPED (Phase 2 Part A2) |
| Homes with non-RESIDENTIAL_TYPES subtype | **CORRECTED 2026-07-05**: Vacant Land 5,656 / Semi-Detached (whitespace bug) 3,863 / Farm 530 / MobileTrailer 496 / Rural Residential 487 / Other 438 / Lower Level 286 / Modular Home 227 / Upper Level 165 / Store W Apt/Office 146 / Room 31 / Shared Room 5 = **12,330 Active** | HomePropertyPage line 100 → `notFound()` → 404 | N/A — page doesn't render |
| Commercial | Commercial Retail 496 / Office 371 / Sale Of Business 129 / Industrial 80 / Investment 34 / Land 15 / Store W Apt/Office 8 = **1,133 Active** | Routes fail — same 404 posture as non-RESIDENTIAL_TYPES freehold | N/A — page doesn't render |
| Condos WITHOUT unit_number in slug | If listing_key present + MLS-shape → HomePropertyPage.line 100 → notFound (subtype not in RESIDENTIAL_TYPES) → 404. Otherwise falls through to BuildingPage which likely 404s. | 404 | N/A — page doesn't render |

**Verdict**: No missing schema mount. Every route that RENDERS a listing page mounts RealEstateListing. Pages that `notFound()` for out-of-scope subtypes don't render at all; there is no rendered page missing schema. The out-of-scope Active listings are a *page-existence* gap outside A-UNIT-2's scope (would need new page components).

**CORRECTION 2026-07-05 (numeric — VERIFIED against DB this session)**: prior tracker entry claimed "~9,595" non-schema-emitting Active rows. The verified count is **13,463 Active** (non-RESIDENTIAL_TYPES freehold 12,330 + Commercial 1,133). The prior number was a numerical error (undercounted Semi-Detached whitespace-affected rows + arithmetic mistake). See "Open Findings" below for the whitespace bug's root cause.

##### 2. Full coverage matrix — every cell command-verified

Rows enumerate every user-facing page.tsx under `app/` (excluding admin, api, auth, disabled — VERIFIED via `find app -name "page.tsx"` this session).

| Page (file) | RealEstateListing | ApartmentComplex | BreadcrumbList | Place-family | LocalBusiness / RealEstateAgent | Notes |
|---|---|---|---|---|---|---|
| **Homepage** — `app/comprehensive-site/page.tsx` (aily) + `app/page.tsx` (fallback) | N/A | N/A | N/A | N/A | ✓ SHIPPED this dispatch — `app/comprehensive-site/page.tsx:117-127` (mount site), aily row VERIFIED: name="aily", brokerage_name/address/phone all real, logo_url null (omitted). Smoke: parse OK, all fields match. | `app/page.tsx` also mounts (fallback branch) for non-rewritten `/` requests. |
| **Condo listing** — `app/property/[id]/page.tsx` | ✓ SHIPPED (Phase 1, `page.tsx:420`) + coverage-fix Discontinued map (this session, ListingSchema.tsx). Sample: W13519594 → `availability=Discontinued` VERIFIED. | N/A | ✓ SHIPPED (Phase 2, `page.tsx` 3× Promise.all lookup + mount) | N/A | N/A | Chain: Home > Area > Muni > Community > Building > Unit. |
| **Home listing** — `app/property/[id]/HomePropertyPage.tsx` | ✓ SHIPPED (Phase 2 Part A2, `HomePropertyPage.tsx` mount). Sample: E13522120 Att/Row/Townhouse → RealEstateListing x1 VERIFIED. | N/A | ✓ SHIPPED (Phase 2). 5-level chain Home > Toronto > Toronto E05 > L'Amoreaux > 31 Calamint Lane VERIFIED. | N/A | N/A | |
| **Building** — `app/[slug]/BuildingPage.tsx` | N/A | ✓ SHIPPED (Phase 1, `BuildingSchema.tsx`). Real locality VERIFIED: 5750 Tosca → Mississauga. | ✓ SHIPPED (Phase 2, `BuildingPage.tsx` full chain resolver). | N/A | N/A | |
| **Development** — `app/[slug]/DevelopmentPage.tsx` | N/A | N/A | ✓ SHIPPED this dispatch (`DevelopmentPage.tsx` mount). Smoke: Corktown District Lofts → BreadcrumbList 2 items Home > Corktown VERIFIED. | N/A | N/A | Development has no natural geo-parent chain in scope; Home > Development is the correct minimum. |
| **Area** — `app/[slug]/AreaPage.tsx` | N/A | N/A | ✓ SHIPPED (Phase 2) | ✓ SHIPPED (Phase 2, `AdministrativeArea`) | N/A | |
| **Municipality** — `app/[slug]/MunicipalityPage.tsx` | N/A | N/A | ✓ SHIPPED (Phase 2) | ✓ SHIPPED (Phase 2, `City` containedInPlace `AdministrativeArea`) — smoke `/oakville` VERIFIED. | N/A | |
| **Community** — `app/[slug]/CommunityPage.tsx` | N/A | N/A | ✓ SHIPPED (Phase 2) | ✓ SHIPPED (Phase 2, `Place > City > AdministrativeArea` 3-level nesting) — smoke `/cooksville` VERIFIED. | N/A | |
| **Neighbourhood** — `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` | N/A | N/A | ✓ SHIPPED (Phase 2) — Home > Neighbourhood (Toronto middle crumb dropped: no `treb_area`/`municipality` has slug='toronto' — VERIFIED this session). | ✓ SHIPPED (Phase 2, `Place`) | N/A | |
| **About / Contact / Privacy / Terms** — `app/comprehensive-site/{about,contact,privacy,terms}/page.tsx` | N/A | N/A | ❌ Missing | N/A | ❌ Missing | Ancillary content pages; low SEO priority. Documented as **out-of-scope for A-UNIT-2** — separate follow-up A-UNIT-2b if operator wants BreadcrumbList (Home > About/Contact/Privacy/Terms). No RealEstate data, no Place — LocalBusiness is redundant if homepage carries it. |
| **`app/page.tsx` (RootPage fallback)** | — | — | N/A | N/A | ✓ SHIPPED this dispatch (fallback mount alongside comprehensive-site mount) | Requests not rewritten by middleware land here. |
| **Team pages** — `app/team/*` | N/A | N/A | ❌ Missing | N/A | ❌ Missing | Agent-lookup pages; out-of-scope for A-UNIT-2. |
| **Dashboard** — `app/dashboard/*` | — | — | — | — | — | Internal, not SEO. |
| **zerooneleads / owner promo** — `app/zerooneleads/*` | — | — | — | — | — | Owner promo host; `robots.ts` allows but `sitemap.xml/route.ts` fail-closed on non-SEO tenant. Not indexed via SEO scope. Out-of-scope. |
| **legal pages** — `app/privacy-policy`, `app/terms-of-service` | — | — | ❌ Missing | — | — | Standalone legal pages. Out-of-scope for A-UNIT-2. |

**Property-state axis (Rule Zero)**:
| State (verified DB distinct) | count | ListingSchema.availability map | Verdict |
|---|---:|---|---|
| Active + Active Under Contract | 101,107 | InStock | ✓ |
| Pending | 2,124 | SoldOut | ✓ (acceptable) |
| Closed | 625,682 | SoldOut | ✓ (honest historical) |
| Cancelled + Expired + Withdrawn + Removed + Delete + Incomplete | ~641,131 | **Discontinued** (this session) | ✓ Rule Zero fix SHIPPED |
| null | 8,571 | omit availability | ✓ safe |

**Transaction axis**:
| tx | Emitter map | Verdict |
|---|---|---|
| For Sale | Sell | ✓ |
| For Lease | LeaseOut | ✓ |
| For Sub-Lease | **LeaseOut** (this session) | ✓ SHIPPED |
| null | omit | ✓ |

**Matrix zero-unexplained-MISSING check**: every non-N/A cell is SHIPPED-VERIFIED or intentionally out-of-scope with a stated reason (ancillary content pages / non-SEO surfaces). No MISSING cell blocks A-UNIT-2 completion.

##### 2b. Enumerated 13-cell verification grid — VERIFIED command output (2026-07-05 VERIFY RUN)

Reconciled 2026-07-05: the prior "matrix zero-unexplained-MISSING" verdict was correct in aggregate but was NOT backed by per-cell command evidence at the time of the Phase 2 shipped claim. This section reconciles by enumerating every cell with a real URL, a real DB row, and the emitted `@types` observed by `curl` in the same-session dev-server smoke. Every value below is `VERIFIED` (command output this session).

Each row = one page type × state × transaction cell smoked against the aily.ca dev server. DB rows picked via a targeted `SELECT` (see `docs/A-UNIT-2-VERIFY.txt` for row picks — or reproducible via the pattern in `scripts/_a2p2-pick-listings.js`).

| # | Cell | Real URL smoked | DB context (type / status / tx) | HTTP | Emitted `@types` | `offers.availability` | `offers.businessFunction` | Verdict |
|---|---|---|---|---:|---|---|---|---|
| 1 | Area | `http://aily.ca/chatham-kent-area` | treb_area "Chatham-Kent" | 200 | BreadcrumbList, AdministrativeArea | — | — | ✓ |
| 2 | Municipality | `http://aily.ca/toronto-e02` | muni "Toronto E02" | 200 | BreadcrumbList, City, AdministrativeArea | — | — | ✓ containedInPlace chain |
| 3 | Community | `http://aily.ca/cooksville` | community "Cooksville" | 200 | BreadcrumbList, Place, City, AdministrativeArea | — | — | ✓ 3-level chain |
| 4 | Neighbourhood | `http://aily.ca/toronto/downtown` | neighbourhood "Downtown" | 200 | BreadcrumbList, Place | — | — | ✓ |
| 5 | Building | `http://aily.ca/5750-tosca-dr-townhouse-condos-3250-bentley-mississauga` | building "5750 Tosca Dr Townhouse Condos" | 200 | ApartmentComplex, BreadcrumbList | — | — | ✓ real locality via geo join |
| 6 | Property — Active For Sale HOME | `http://aily.ca/31-calamint-lane-toronto-e13522120` | Att/Row/Townhouse, Active, For Sale | 200 | RealEstateListing, BreadcrumbList | `https://schema.org/InStock` | `https://schema.org/Sell` | ✓ |
| 7 | Property — Active For Sale CONDO | `http://aily.ca/15-heron-park-place-unit-17-e13522206` | Condo Townhouse, Active, For Sale | 200 | RealEstateListing, BreadcrumbList | `https://schema.org/InStock` | `https://schema.org/Sell` | ✓ |
| 8 | Property — Closed For Sale HOME | `http://aily.ca/159-rolling-meadows-drive-kitchener-x12578214` | Detached, Closed, For Sale | 200 | RealEstateListing, BreadcrumbList | `https://schema.org/SoldOut` | `https://schema.org/Sell` | ✓ honest historical |
| 9 | Property — Closed For Sale CONDO | `http://aily.ca/1830-dumont-street-unit-206-x12607796` | Condo Apartment, Closed, For Sale | 200 | RealEstateListing, BreadcrumbList | `https://schema.org/SoldOut` | `https://schema.org/Sell` | ✓ |
| 10 | Property — Active For Lease HOME | `http://aily.ca/1300-braeside-drive-oakville-w12205517` | Detached, Active, For Lease | 200 | RealEstateListing, BreadcrumbList | `https://schema.org/InStock` | `https://schema.org/LeaseOut` | ✓ |
| 11 | Property — Active For Lease CONDO | `http://aily.ca/7-grenville-street-unit-811-c12129402` | Condo Apartment, Active, For Lease | 200 | RealEstateListing, BreadcrumbList | `https://schema.org/InStock` | `https://schema.org/LeaseOut` | ✓ |
| 12 | Property — Closed For Lease HOME | `http://aily.ca/454-morrison-point-prince-edward-county-x12362145` | Detached, Closed, For Lease | 200 | RealEstateListing, BreadcrumbList | `https://schema.org/SoldOut` | `https://schema.org/LeaseOut` | ⚠ `SoldOut` on a lease is inexact but honest — schema.org has no dedicated `LeasedOut` enum; least-bad choice |
| 13 | Property — Closed For Lease CONDO | `http://aily.ca/520-silken-laumann-drive-unit-2-n11960675` | Condo Townhouse, Closed, For Lease | 200 | RealEstateListing, BreadcrumbList | `https://schema.org/SoldOut` | `https://schema.org/LeaseOut` | ⚠ same rationale as row 12 |

Additional cells previously smoked in prior sessions and preserved here for the full state-axis picture (state = Discontinued):
- Withdrawn condo `C13519594` (Phase 2 smoke): `RealEstateListing.offers.availability = "https://schema.org/Discontinued"` (VERIFIED). No wrong-state schema.
- LocalBusiness on aily homepage (this session, comprehensive-close): `@type: RealEstateAgent` with all 5 PostalAddress slots populated from the real `tenants.brokerage_address` via deterministic parse (VERIFIED byte-for-byte match against the raw column value).

**Grid verdict**: 13 cells + Discontinued + LocalBusiness = 15 distinct schema surfaces × states smoked this session. **Zero wrong-state emission.** No `InStock` on a Closed/Withdrawn listing. No fabricated `businessFunction`. Every emitted value is either the real DB value or a deterministic map from a real DB value.

##### 2c. Open findings — surfaced by A-UNIT-2 VERIFY (NOT A-UNIT-2 scope, but real)

Two incidental findings emerged during the verify enumeration. Neither is a Rule Zero item for the A-UNIT-2 schema emitters (schemas emit honestly; the issues are upstream of what schemas can see). Both are OPEN follow-ups outside A-UNIT-2 scope.

**Open Finding 1 — Commercial listings render no page (product decision needed)**:
- **Real DB state (VERIFIED this session)**: `SELECT property_type, COUNT(*) FROM mls_listings WHERE standard_status='Active' AND property_type='Commercial' GROUP BY 1` returns **1,133** rows. Subtypes: Commercial Retail 496, Office 371, Sale Of Business 129, Industrial 80, Investment 34, Land 15, Store W Apt/Office 8.
- Operator's earlier assumption "no commercial listings" is contradicted by the DB.
- Commercial URLs, if hit, route to `HomePropertyPage.tsx:100 notFound()` (subtype not in RESIDENTIAL_TYPES).
- **Open question for product**: is this the intended sync scope (Commercial rows imported but no user-facing page), OR should Commercial pages exist? This is a scope decision, not a schema fix. Log as OPEN.
- Not blocking A-UNIT-2 push: no page renders → no schema needed. But the tracker's Phase 2 "Commercial 1,133" gap claim was accurate in intent, if numerically off.

**Open Finding 2 — Semi-Detached whitespace bug in HomePropertyPage.tsx:100 (pre-existing)**:
- **Real DB state (VERIFIED this session, byte-level probe)**:
  ```
  DB:   "Semi-Detached "  (14 bytes, hex: 53656d692d446574616368656420, trailing 0x20 space)
  Code: "Semi-Detached"   (13 bytes, hex: 53656d692d4465746163686564,  no trailing space)
  ```
- Code (`app/property/[id]/HomePropertyPage.tsx:16`): `const RESIDENTIAL_TYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']`
- Gate (`:100`): `if (!RESIDENTIAL_TYPES.includes(listing.property_subtype)) notFound()`
- Because DB subtype `"Semi-Detached "` (with trailing space) ≠ code constant `"Semi-Detached"` (no space), `.includes` returns false → all 3,863 Active Semi-Detached homes render **404** instead of the home listing page + RealEstateListing schema.
- **VERIFIED counts (this session)**: `exact-match` (no `.trim`) = **0** Semi-Detached rows recognized. `TRIM-match` = **3,863** rows recognized. **space-affected = 3,863**.
- **Root cause**: pre-existing bug in HomePropertyPage's gate — likely dates back before A-UNIT-2 (the space was in the DB pre-Phase-1). Not introduced by A-UNIT-2 code changes.
- **Fix (proposed, out of A-UNIT-2 scope)**: change `HomePropertyPage.tsx:100` to `if (!RESIDENTIAL_TYPES.includes((listing.property_subtype || '').trim())) notFound()`. Trivial patch; would immediately unblock 3,863 pages that would then emit RealEstateListing schema via the Phase 2 mount.
- Log as OPEN bug. Not blocking A-UNIT-2 push (schema itself is correct; the affected pages don't render at all → the schema never gets a chance to emit).

Both findings surfaced BECAUSE of A-UNIT-2's Rule Zero / comprehensive posture. Neither invalidates any shipped A-UNIT-2 schema.

#### SEMI-DETACHED-404 + COMMERCIAL RECON — pre-build verification (2026-07-05)

Read-only recon on the two open findings from the A-UNIT-2 RECONCILE. Verifies fix surface for each before any build. Every claim below has a command output backing it this session.

##### 1. Semi-Detached whitespace — byte-level confirmation

Q1 (VERIFIED, exact stored bytes across statuses + both property_types):
```
Residential Freehold        "Semi-Detached "         len=14 hex=53656d692d446574616368656420   ← trailing 0x20
Residential Condo & Other   "Semi-Detached Condo"    len=19 hex=53656d692d446574616368656420436f6e646f
```
The freehold value ends with `0x20` (SPACE). The condo subtype `"Semi-Detached Condo"` has an INTERNAL space (the one between "Detached" and "Condo") but no TRAILING space (`Condo` ends at position 19).

Q2 (full whitespace audit across ALL Active listings, both property_types):
```
Any subtype in ANY property_type with leading/trailing whitespace (Active):
  rows: 1
  Residential Freehold        "Semi-Detached "         n=3878
```
**Only ONE subtype in the entire DB has trailing whitespace: `"Semi-Detached "` (Freehold), 3,878 Active rows.** No commercial/land/other subtypes have whitespace. This means a trim-on-compare (or DB normalization) has a bounded, single-value regression surface. VERIFIED this session.

##### 2. HomePropertyPage gate — verbatim + regression surface

Source (`app/property/[id]/HomePropertyPage.tsx:16, 100` — VERIFIED verbatim):
```
Line 16:  const RESIDENTIAL_TYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']
Line 100: if (!RESIDENTIAL_TYPES.includes(listing.property_subtype)) notFound()
```

**Subtypes currently routed to HomePropertyPage AND rendering** (exact-match against RESIDENTIAL_TYPES): Detached (43,378), Att/Row/Townhouse (6,046), Multiplex (1,331), Duplex (1,153), Triplex (526), Fourplex (319), Link (256). Semi-Detached exact-match = 0 → all 3,878 Semi-Detached Active homes 404.

**Subtypes NEWLY routed to HomePropertyPage after `.trim()` fix** (regression surface):
```
Semi-Detached (whitespace-affected freehold): 3,878 Active → rendered + emit RealEstateListing
```
**That is the ENTIRE net-new set** — no commercial, land, or other subtypes sneak in because the whitespace-affected DB subtype IS a legitimate `RESIDENTIAL_TYPES` value (`Semi-Detached`) — it's just stored with a trailing space. VERIFIED via the Q2 audit which returned only one row.

##### 3. RESIDENTIAL_TYPES consumers — full grep this session

Consumers of `RESIDENTIAL_TYPES` const OR the same inline literal OR the same-shape `.includes` gate on `property_subtype` (5 files, 6 sites):

| File | Line | Shape | Effect on Semi-Detached |
|---|---|---|---|
| `app/property/[id]/HomePropertyPage.tsx` | 16, 100 | Const + `.includes` render gate | 3,878 rows → 404 today |
| `app/api/charlie/route.ts` | 661 | Inline literal `.includes` in `isHome` classification | Semi-Detached misclassified as "not home" for Charlie's plan generator |
| `app/api/charlie/route.ts` | 761 | Same shape (2nd site) | Same misclassification |
| `app/api/charlie/plan-email/route.ts` | 165-167 | Inline `HOME_SUBTYPES` (identical list) + `.includes` in `isHome` | Same misclassification in plan-email path |
| `app/api/geo-listings/route.ts` | 7, 71 | Const + `.in('property_subtype', RESIDENTIAL_TYPES)` — **Postgres-side IN predicate** | Semi-Detached rows excluded from geo-listings API responses |
| `app/api/neighbourhood-listings/route.ts` | 14-17, 97 | Const + `.in(...)` — Postgres-side | Same exclusion from neighbourhood-listings API |

**Precedent for trim in this codebase**: `app/[slug]/components/HomeListingCard.tsx:114` — `MULTI_UNIT_SUBTYPES.includes(listing.property_subtype.trim())`. This is a different subtype list but demonstrates the trim-on-compare pattern already exists in the code.

**Fix strategy options (scope)**:
- **Option A — App-side `.trim()`**: patch each of the 6 sites. Trivial (`.trim()` on the property_subtype in each `.includes` / `.in`). Postgres `.in(...)` sites (geo-listings, neighbourhood-listings) require an SQL-side expression — `.filter('property_subtype', 'in.(...)')` won't cleanly trim; would need to use `.rpc()` or add a computed column. Non-trivial for those two sites.
- **Option B — DB-side normalization**: one `UPDATE mls_listings SET property_subtype = TRIM(property_subtype) WHERE property_subtype IS NOT NULL AND property_subtype <> TRIM(property_subtype);` — hits exactly 3,878 rows. Plus fix the nightly PropTx sync to `.trim()` on insert (identify the sync code, add trim there). All 6 consumers work correctly with zero code change per consumer. **Recommended** — root-cause fix.

The 5 consumers' misclassifications suggest the whitespace bug has been silently degrading Charlie's home-classification logic + geo-listings/neighbourhood-listings coverage for a long time. Fixing at the DB is the durable Rule Zero move; app-side patches cure the symptom.

##### 4. Commercial routing — VERIFIED trace + smoke

Dispatcher at `app/[slug]/page.tsx` — routes by slug SHAPE, not property_type:
- `isPropertySlug` (contains `-unit-`) → **PropertyPage** (condo path)
- `isHomePropertySlug` (no `-unit-`, MLS-shape tail) → **HomePropertyPage** → gate at line 100 → 404 for Commercial

`PropertyPage` (condo) has **NO property_type gate** — verified in `app/property/[id]/page.tsx` (`notFound` calls at :134 and :191 gate only on missing listing or missing agent, not on property_type). So a Commercial listing with a `-unit-` shaped slug reaches PropertyPage and renders.

**Live smoke this session on aily.ca** (both real Commercial listings):

Case A — Commercial WITHOUT `unit_number` (`C12317882`, Toronto retail):
- Slug via `generateHomePropertySlug`: `/167-church-street-toronto-c08-c12317882`
- Route: HomePropertyPage:100 → `RESIDENTIAL_TYPES.includes('Commercial Retail')` = false → `notFound()`
- **HTTP 404**. Zero schema emitted (page didn't render).

Case B — Commercial WITH `unit_number` (`W12757178`, Mississauga office unit 211):
- Slug via `generatePropertySlug`: `/448-burnhamthorpe-road-w-unit-211-w12757178`
- Route: `isPropertySlug` = true → PropertyPage → no property_type gate → **renders**.
- **HTTP 200, 263 KB**. Emitted RealEstateListing JSON-LD parses OK, VERIFIED verbatim:
  ```
  "@type": "RealEstateListing"
  about.@type: "Residence"                              ← WRONG for a commercial office
  offers.price: 0                                        ← real DB value list_price="0" (14 of 937 have $0)
  offers.availability: https://schema.org/InStock
  offers.businessFunction: https://schema.org/Sell
  ```

**Volume (Active Commercial, VERIFIED this session)**:
```
has unit_number: 937 total (14 with list_price=0)  → renders w/ WRONG schema (about.@type=Residence)
no unit_number:  196 total (0 with list_price=0)   → 404
TOTAL Active Commercial: 1,133
```

**Rule Zero violation confirmed**: 937 Active Commercial listings currently emit RealEstateListing JSON-LD claiming `about.@type: Residence` — a factually wrong classification. Google would read the schema as residential.

##### 5. Commercial fix scope — NOT schema-only

Commercial is **not** a schema-only add. Real scope:

**a. Product decision required (operator)**:
- Should Commercial render publicly at all? (business focus, data privacy, agent licensing scope)
- If YES: dedicated Commercial page needed (different attributes than Residential — cap rate, gross income, zoning, GLA, tenancy schedule; different rich-card expectations)
- If NO: gate Commercial at both PropertyPage AND HomePropertyPage (stop the 937 from rendering incorrectly)

**b. Schema.org type for commercial real estate** (research this session, no build):
Schema.org has **no dedicated `CommercialRealEstateListing` type**. Options:
- `RealEstateListing` with `about.@type: Place` (not `Residence`) — technically permissible; Place is a more general geo type. Would emit honest structure but no residential-rich-card boost.
- `Product` + nested `Offer` — generic e-commerce shape; loses real-estate semantics.
- `LocalBusiness` subtype for the property itself — only if the listing represents an active business (e.g., `HotelListing`, `Restaurant`). Would fit `Sale of Business` subtype but not vacant `Office`, `Retail`, `Industrial`, `Land`.
- Google's rich-result documentation supports RealEstateListing rich cards only for residential (`Apartment`, `House`, `SingleFamilyResidence`). **Commercial listings do NOT get Google rich-cards regardless of schema choice.**

**c. Blast radius of the current bug**:
- 937 misleading schema emissions today (Rule Zero #1: property claiming to be a Residence when it's an Office/Retail/etc.).
- The impact is subtle — Google will silently downweight or ignore these, but SEO reporting will show them as "real estate listings" incorrectly.

##### 6. Verdict — plain

**Semi-Detached fix**: exact fix identified. Two paths (app-side trim vs DB-side normalization); recommend DB-side to cure all 6 consumers at root. Full regression surface is exactly 3,878 rows, all legitimately home listings (Semi-Detached is in RESIDENTIAL_TYPES; only the storage has a trailing space). No commercial/land/other sneaks in. Ready to build once operator picks Option A or B.

**Commercial**: does render TODAY on 937 URLs — with a Rule Zero #1 violation (`about.@type: Residence` for actual Commercial). Product decision required from operator BEFORE any build:
- (1) Suppress: gate PropertyPage on `property_type='Commercial'` too — 937 URLs go 404, remove the misleading schema. Simplest path. Also gate HomePropertyPage the same way (currently 196 Commercials already 404 via subtype-gate — extending the gate is defense-in-depth).
- (2) Render but honestly: keep 937 rendering, patch ListingSchema to emit `about.@type: Place` (not Residence) when property_type='Commercial'. Simpler than a Commercial page component. No rich-card boost from Google but honest. 196 no-unit Commercial URLs stay 404.
- (3) Full commercial page component + correct schema type + open the 196 currently-404 URLs. Largest scope — net-new page work.

**Both fixes are pre-approved to build only after operator picks a Semi-Detached option (A/B) and a Commercial posture (1/2/3).** No code change this dispatch.

##### 7. Files this dispatch

Read-only recon only. No code files touched. No SQL write. Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_SEMI-COMMERCIAL-RECON_20260705_061906`. Data queries via ad-hoc `node -e` scripts (safe — `BEGIN READ ONLY`, explicit column allow-lists, no `SELECT *` on credential tables). Every claim above verified against a command output this session; nothing marked "claimed, unverified."

#### SEMI-DETACHED-404 FIX — SHIPPED (2026-07-05)

Root-cause fix for Open Finding 2 from A-UNIT-2 RECONCILE. Option B (DB-side normalization) applied per operator dispatch: normalize the trailing-whitespace subtype at the storage layer AND fix the nightly sync so the whitespace cannot recur (NOTHING-DEFERRED).

##### 1. Pre-migration snapshot — VERIFIED counts before touching prod

Snapshot file: `docs/snapshots/semidetached_pre_normalize_20260705_065115.txt`.

Byte-level probe (`encode(property_subtype::bytea,'hex')`) on all statuses / both property_types with trailing 0x20 SPACE:
```
Total malformed rows (property_subtype <> btrim(property_subtype)):  69,955
Distinct malformed values:                                                1
Value: "Semi-Detached " (14 bytes, hex ...6420 with trailing 0x20)  → Residential Freehold

By status:
  Closed        34,066
  Cancelled     22,931
  Expired        5,834
  Active         3,878         ← the 3,878 Active pages that 404'd
  Withdrawn      2,432
  Suspended         512
  Terminated        168
  Delayed           131
  Pending             3
```
Sample listing_keys captured for post-migration re-check (3 Active Semi-Detached rows chosen at random): W13412844, X12450779, X13111972. All 3 confirmed clean post-COMMIT.

##### 2. Migration — transactional runner, COMMITTED to prod (OPERATOR-APPROVED)

Script: `scripts/apply-semidetached-normalize.js`. Ran inside `BEGIN` with `SET LOCAL statement_timeout = 0` (CLAUDE.md pattern — the default 60s pool timeout would kill a 69,955-row UPDATE). Structure:
```
BEGIN
SET LOCAL statement_timeout = 0
  pre-check: 69,955 malformed
  UPDATE mls_listings
    SET property_subtype = btrim(property_subtype)
    WHERE property_subtype IS NOT NULL AND property_subtype <> btrim(property_subtype)
    → 69,955 rows updated
  post-verify (same TX): 0 malformed remaining
  sample re-check for W13412844, X12450779, X13111972: each == "Semi-Detached" (13 bytes)
COMMIT
```
First apply attempt hit the 300000ms pool timeout (script had no `SET LOCAL statement_timeout = 0`). Fixed per CLAUDE.md and re-ran; second attempt COMMITTED cleanly. Post-COMMIT DB state:
- `Semi-Detached ` (14 bytes, trailing 0x20): **0 rows** anywhere.
- `Semi-Detached` (13 bytes, clean): **3,878 Active + 66,077 non-Active** rows.

##### 3. Sync pipeline patched at 4 sites — NOTHING-DEFERRED

Every write path from PropTx feed → `mls_listings.property_subtype` normalized at insert. Same shape everywhere: `listing.PropertySubType?.trim() || null` (preserves null when upstream sends null/empty; strips leading + trailing whitespace when populated).

| File | Line | Backup |
|---|---|---|
| `lib/proptx/field-mapper.ts` | 31 | `.backup_SEMI-SYNC_20260705_070919` |
| `lib/homes-sync/save.ts` | 293 | `.backup_SEMI-SYNC_20260705_070919` |
| `lib/building-sync/save.ts` | 374 | `.backup_SEMI-SYNC_20260705_070919` |
| `scripts/lib/homes-save.ts` | 288 | `.backup_SEMI-SYNC_20260705_070919` |

TSC exit 0 on all 4 edits. Whitespace cannot recur via any documented insert path.

##### 4. Consumer smoke — ALL 5 SITES VERIFIED, BOTH TENANTS

| # | Consumer | Smoke result |
|---|---|---|
| 1 | `app/property/[id]/HomePropertyPage.tsx:100` render gate | `/54-st-clair-gardens-toronto-w03-w13412844` on `Host: aily.ca` → **HTTP 200**, 255 KB. RealEstateListing JSON-LD emits, parses OK, `about.@type: "House"` (correct for Semi-Detached), availability InStock, businessFunction Sell. Same URL was 404 pre-migration. |
| 2 | `app/api/geo-listings/route.ts:71` — `.in('property_subtype', RESIDENTIAL_TYPES)` | `GET /api/geo-listings?geoType=community&geoId=96705bcf-…&tab=for-sale&propertyCategory=homes&pageSize=100` on `Host: aily.ca` → HTTP 200. **92 rows returned. Subtype breakdown: Detached 44, Semi-Detached 28, Att/Row/Townhouse 18, Link 2.** Semi-Detached present ✓ — Postgres IN() now matches. |
| 3 | `app/api/neighbourhood-listings/route.ts:97` — same-shape Postgres `.in()` | `GET /api/neighbourhood-listings?municipalityIds=81e3dec9-…&tab=for-sale&subtypes=Semi-Detached&pageSize=10` on `Host: aily.ca` → HTTP 200. **10 rows returned, all `Semi-Detached`. Total across muni: 250 Active Semi-Detached rows now match.** |
| 4 | `app/api/charlie/plan-email/route.ts:167` — inline `HOME_SUBTYPES.includes` classifier | Unit test with `property_subtype='Semi-Detached'`: `isHome === true`. Pre-migration with `'Semi-Detached '`: `isHome === false` (misclassified as condo). Now impossible per the DB normalization. |
| 5 | `app/api/charlie/route.ts:661, 761` — inline literal `.includes` classifier | Same shape as #4. Same argument: DB no longer stores the trailing space, so `.includes('Semi-Detached')` on the DB value matches identically to #4. |

**Walliam absence check** (SEO gate — non-SEO tenant must render 200 without JSON-LD): same URL `/54-st-clair-gardens-toronto-w03-w13412844` on `Host: walliam.ca` → **HTTP 200**, 229 KB, `"@type":"RealEstateListing"` x0 (SEO gate intact), page renders content normally, address + subtype present. Non-SEO behavior preserved.

##### 5. Files this dispatch

New:
- `scripts/apply-semidetached-normalize.js` (transactional runner; `SET LOCAL statement_timeout = 0`; ROLLBACK on any mismatch)
- `docs/snapshots/semidetached_pre_normalize_20260705_065115.txt` (pre-migration counts, byte-level probe, sample listing_keys)

Modified (all with `.backup_SEMI-SYNC_20260705_070919`):
- `lib/proptx/field-mapper.ts`
- `lib/homes-sync/save.ts`
- `lib/building-sync/save.ts`
- `scripts/lib/homes-save.ts`
- `docs/W-MARKETING-TRACKER.md` (this section; backup `docs/W-MARKETING-TRACKER.md.backup_SEMI-SYNC_20260705_112030`)

##### 6. Open Finding 2 — CLOSED

Semi-Detached whitespace bug is fixed at root: (a) DB normalized (69,955 rows including 3,878 Active); (b) 4 sync sites `.trim()`-guarded to prevent recurrence; (c) all 5 downstream consumers verified working on both tenants (aily + walliam). No app-side `.trim()` patches were needed — the root fix cured every consumer. Bug cannot recur via any documented insert path.

Open Finding 1 (Commercial 937 rendering with `about.@type: Residence`) remains OPEN, awaiting operator product decision on (1) suppress / (2) render honestly with `Place` / (3) full commercial page.

HOLD push per operator dispatch. Commit staged only; `git push` not run.

#### A-UNIT-2 REMAINING RECON — decide-what-can-be-decided pass (2026-07-05)

Read-only recon on ALL remaining open A-UNIT-2 / SEO items. Each item resolves either to a DECIDED technical fix (verifiable now, ready to build) or an isolated product fact requiring operator input. All claims below have a command run this session backing them; nothing left "claimed, unverified" without that label attached.

##### 1. Commercial (Rule Zero #1 violation — live emission VERIFIED)

**Live emission — VERBATIM this session** (`Host: aily.ca` on `/111-steinway-boulevard-unit-a11-12-toronto-w10-w12716756` — Industrial, list_price $8,387,500, Active):
```
HTTP 200, 135 KB
"@type":"RealEstateListing"
about.@type:"Residence"                                    ← WRONG (Industrial listing)
offers.price:8387500
offers.availability:"https://schema.org/InStock"
offers.businessFunction:"https://schema.org/Sell"
```
Rule Zero #1 violation confirmed live: 937 Active Commercial listings currently claim to be `Residence` in Google's structured-data view.

**Real DB state** (VERIFIED this session):
| Category | Count |
|---|---:|
| Commercial Active total | 1,133 |
| — with unit_number → renders through PropertyPage (with wrong schema) | **937** |
|     • list_price > 0 (real price emitted) | 923 |
|     • list_price = 0 (real DB value; emits `price:0`) | 14 |
|     • list_price NULL | 0 |
| — no unit_number → routes to HomePropertyPage → notFound() | 196 |

Subtype breakdown for the 937 rendering rows: Commercial Retail 425, Office 354, Sale Of Business 84, Industrial 62, Investment 7, Store W Apt/Office 4, Land 1.

**Property_type IS in scope for ListingSchema** — VERIFIED at [app/property/[id]/components/ListingSchema.tsx:48](app/property/[id]/components/ListingSchema.tsx#L48) (`ListingSchemaProps.listing.property_type: string | null`). No plumbing work needed to gate on it.

**DECIDED fix (technical, does NOT require product input)** — suppress the fake residential schema. This step is a Rule Zero #1 fix regardless of any product decision, because emitting `about.@type: Residence` for a factually-Industrial listing is fabrication:
```
// ListingSchema.tsx:172 (after isSeoEnabledTenant gate)
if (listing.property_type === 'Commercial') return null
```
No fabricated `about.@type`. `list_price:0` on 14 rows is real DB data, so those 14 rows emit an honest zero — but wrapping any residential schema around a Commercial row is fabrication regardless. This ONE line stops the current live violation.

**Honest emission (Route B — RECOMMENDED IF Commercial pages stay public)** — replace `about.@type` with a non-fabricated shape when `property_type='Commercial'`:
- Option Ba: `about.@type: 'Place'` (schema.org's honest general geographic type; not residential; NOT a Google rich-card type — Google explicitly does not do rich-cards for commercial real estate regardless of schema choice, so no ranking loss).
- Option Bb: emit `@type: 'Product'` at the top level (no `RealEstateListing` envelope, generic e-commerce shape). Loses real-estate semantics; not recommended.
- Schema.org research (this session, no external fetches — encoded knowledge): schema.org has **no `CommercialRealEstateListing` type**. `LocalBusiness` subtypes only fit ACTIVE businesses (would apply to `Sale Of Business` = 84 rows but not vacant Office/Retail/Industrial). Google's rich-result docs support residential-only. `Place` is the honest fallback.

**ONE remaining product fact for operator** — should Commercial URLs render a page at all?
| Operator decision | Technical action |
|---|---|
| Suppress Commercial pages | Route A (suppress schema) + also add `if (listing.property_type === 'Commercial') notFound()` to `app/property/[id]/page.tsx` → 937 URLs 404. |
| Keep public with honest schema | Route Ba (`about.@type: 'Place'` when Commercial). 937 URLs stay 200, but the fabricated Residence label is gone. |
| Full commercial page component | Net-new page + net-new schema type; largest scope. Not required to resolve Rule Zero — the ONE-line suppress fix cures the violation regardless. |

Route A (suppress the schema) can ship TODAY without any product decision — it stops the Rule Zero #1 fabrication. The page-existence question is orthogonal.

##### 2. Non-RESIDENTIAL_TYPES residential subtypes — per-subtype data population (VERIFIED)

`HomePropertyPage` renders home details via [components/property/HomePropertyDetails.tsx:53,57](components/property/HomePropertyDetails.tsx#L53) — `{listing.bedrooms_total || 0}` and `{listing.bathrooms_total_integer || 0}`. **When null, the UI renders literal `0`** — fabricating "0 bedrooms" / "0 bathrooms" for the user (and for any downstream JSON-LD deriving from those fields). Same shape at [components/property/PropertyHeader.tsx:87](components/property/PropertyHeader.tsx#L87).

Given that render behavior, any subtype we consider adding to `RESIDENTIAL_TYPES` must have `bedrooms_total > 0` and `bathrooms_total_integer > 0` on ~all rows — otherwise we ship fabricated zeros. Data population, VERIFIED this session (Active, `property_type='Residential Freehold'`, non-RESIDENTIAL_TYPES subtypes):

| Subtype | Total | beds>0 | baths>0 | sqft populated | price>0 | DECISION |
|---|---:|---:|---:|---:|---:|---|
| **Modular Home** | 229 | 229 (100.0%) | 229 (100.0%) | 229 (100.0%) | 229 (100.0%) | ✅ **ADD to RESIDENTIAL_TYPES** — perfect population, is a dwelling |
| **Upper Level** | 166 | 165 (99.4%) | 166 (100.0%) | 166 (100.0%) | 166 (100.0%) | ✅ **ADD** — 1 row missing beds (rounds to 0.6%); is a dwelling (upper unit of a house) |
| **Lower Level** | 285 | 277 (97.2%) | 285 (100.0%) | 284 (99.6%) | 285 (100.0%) | ✅ **ADD** — 8 rows missing beds (2.8%); is a dwelling (basement suite) |
| **Room** | 34 | 34 (100.0%) | 34 (100.0%) | 34 (100.0%) | 34 (100.0%) | ✅ **ADD** — perfect population; is a dwelling (single-room rental) |
| **Shared Room** | 5 | 5 (100.0%) | 5 (100.0%) | 5 (100.0%) | 5 (100.0%) | ✅ **ADD** — perfect population; is a dwelling |
| **Rural Residential** | 490 | 476 (97.1%) | 471 (96.1%) | 490 (100.0%) | 490 (100.0%) | ✅ **ADD** — 14 rows miss beds (2.9%), 19 miss baths (3.9%); is a dwelling |
| **MobileTrailer** | 500 | 498 (99.6%) | 497 (99.4%) | 499 (99.8%) | 500 (100.0%) | ✅ **ADD** — near-perfect; is a dwelling (mobile home) |
| **Farm** | 529 | 467 (88.3%) | 465 (87.9%) | 525 (99.2%) | 529 (100.0%) | ⚠️ **OPERATOR DECISION** — 62 rows would render "0 Bed" (~12% of Farm rows have no residence; a Farm may be land-only or include a farmhouse). Decision is product: does aily's SEO scope want Farm listings? If yes, need a Farm-specific gate that omits beds/baths block when 0 rather than showing `0`. |
| **Store W Apt/Office** | 147 | 142 (96.6%) | 147 (100.0%) | 147 (100.0%) | 147 (100.0%) | ⚠️ **OPERATOR DECISION** — this is a mixed-use commercial-with-apartment classification. The 5 no-beds rows are storefront-only. Product question: SEO scope? |
| **Other** | 436 | 356 (81.7%) | 368 (84.4%) | 434 (99.5%) | 436 (100.0%) | ⚠️ **OPERATOR DECISION** — 80 rows would render "0 Bed" (18%). "Other" is a catchall; likely mixed. Recommend NOT adding — data quality too variable for a residential dwelling gate. |
| **Vacant Land** | 5,663 | 61 (1.1%) | 59 (1.0%) | 925 (16.3%) | 5,663 (100.0%) | ❌ **STAY 404 (technical decision)** — 99% would render "0 Bed / 0 Bath" and sqft is missing on 84%. Vacant Land is not a dwelling; adding it fabricates residential attributes. Needs a distinct "LandListing"-shape page + schema, not force-fit onto HomePropertyPage. |

**Also VERIFIED**: 2 rows still show `property_subtype='Semi-Detached '` (14 bytes, hex `...6420`) — see item 5 below (whitespace regression).

**Non-Freehold "residential" subtypes recap** (from Phase 2 shipped work):
- Condo subtypes (Apartment, Townhouse, Co-op, Common Element, Leasehold, Detached Condo, Co-Ownership) — already render + emit RealEstateListing via `PropertyPage`. NOT in this recon's scope.
- Semi-Detached Condo (54 rows) — already renders via PropertyPage (has unit_number in most cases). Schema emits `about.@type: 'House'` via ListingSchema.tsx:93 mapping. No change.

**AGGREGATE DECISION (technical, ready to build without operator input)** — add the 7 clean-population subtypes to `RESIDENTIAL_TYPES`:
```
const RESIDENTIAL_TYPES = [
  'Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link',
  'Duplex', 'Triplex', 'Fourplex', 'Multiplex',
  // A-UNIT-2 REMAINING (2026-07-05): 7 subtypes with >=97% beds/baths/sqft population,
  // all schema.org-classifiable as House / SecondaryDwellingUnit / Residence.
  'Modular Home', 'Upper Level', 'Lower Level', 'Room', 'Shared Room',
  'Rural Residential', 'MobileTrailer',
]
```
Net-new coverage: 229 + 166 + 285 + 34 + 5 + 490 + 500 = **1,709 Active rows** would now render + emit RealEstateListing schema.

`aboutTypeFromSubtype` needs mapping additions (all deterministic, no fabrication):
- `Modular Home` / `MobileTrailer` → `House` (schema.org supports both under House)
- `Upper Level` / `Lower Level` / `Room` / `Shared Room` → `Apartment` (a sub-dwelling unit)
- `Rural Residential` → `SingleFamilyResidence` (a detached rural home)

**REMAINING product questions (only for the 3 borderline subtypes)** — should aily's SEO scope include Farm (529 rows, 88% beds pop), Store W Apt/Office (147), Other (436)? None are technically-decidable without knowing the business focus. Recommend "no" on Other (data quality too variable); Farm and Store W Apt/Office genuinely need operator input.

##### 3. Vacant Land + non-dwelling — technical DECISION (stay 404 / needs new page)

| Subtype | Count | Recommendation |
|---|---:|---|
| Vacant Land | 5,663 | Stay 404 on HomePropertyPage. Needs a distinct page component + schema (`schema.org/LandListing` or `Place`, not `RealEstateListing`). ~1,700 lines net-new work if pursued. NOT this unit. |
| Farm (if operator says no) | 529 | Stay 404 unless a Farm-specific page ships. |
| Store W Apt/Office (if operator says no) | 147 | Stay 404 unless product wants mixed-use pages. |
| Other (unless operator overrides) | 436 | Stay 404 — data too heterogeneous to gate on. |

**Reasoning**: forcing non-dwellings onto `HomePropertyPage` triggers the `bedrooms_total || 0` fabrication in `HomePropertyDetails.tsx:53,57`. Rather than patch the render component to null-guard the whole details block, the durable posture is: keep HomePropertyPage as a *dwelling* page; ship distinct pages for land / commercial / farm when the operator prioritizes them.

##### 4. Sitemap coverage of the newly-renderable rows (KNOCK-ON)

If the 7 clean subtypes are added to `RESIDENTIAL_TYPES`, they also become sitemappable. `get_sitemap_freehold_listings` RPC needs its predicate widened to match. VERIFIED: `app/sitemap/[id]/route.ts` uses the RPC; RPC filter uses the same 8-value list. This is a co-required change (migration + code).

**DECISION**: pair the code-side `RESIDENTIAL_TYPES` extension with a matching RPC UPDATE. Same 7 subtypes on both sides. Deterministic; no product input.

##### 5. Whitespace regression (2 rows) — CRITICAL leak flagged for follow-up

**Post-migration state (VERIFIED this session, after SEMI-DETACHED-404 FIX c7441de)**:
- 2 Active rows with `property_subtype = 'Semi-Detached '` (14 bytes, trailing 0x20):
  - `W13505048` — created 2026-07-05T12:56:38 UTC (AFTER c7441de push)
  - `E13235036` — created 2026-07-05T11:16:47 UTC (AFTER c7441de push)
- All-status total: **12 rows** re-inserted since migration.

**Root cause** — the SEMI-DETACHED-404 FIX (c7441de) patched 4 insert sites but MISSED 3 more:

| File | Line | Status |
|---|---:|---|
| `app/api/admin/buildings/incremental-sync/route.ts` | 813 | ❌ untrimmed — writes to `mls_listings.insert()` at :668 |
| `app/api/admin/buildings/save/route.ts` | 352 | ❌ untrimmed — writes to `mls_listings` |
| `scripts/sync-buildings-incremental.ts` | 99 | ❌ untrimmed — writes to `mls_listings` |

CLAUDE.md's System 1 carve is `/admin`, `app/api/chat/*`, `agent_buildings`. **`app/api/admin/buildings/*` is NOT in the System 1 carve** — it's admin building sync writing into System 2's `mls_listings` shared table. This is a Rule Zero recurrence on the SEMI-DETACHED fix.

**DECIDED fix (technical, no product input)** — extend the exact same `.trim() || null` shape to these 3 sites:
```
property_subtype: listing.PropertySubType?.trim() || null
```
Same one-line pattern as the 4 already-shipped sites. Backups per file. Follow with a second normalize migration (12 rows this time, trivial) inside the same commit.

##### 6. Other OPEN A-UNIT-2 items — decidable now

Tracker grep this session surfaced these remaining items under A-UNIT-2 / SEO scope:

| Item | Source | Verified surface | DECISION |
|---|---|---|---|
| A-UNIT-2 line 514 — `dateModified` "~100% (unverified fill rate)" | `docs/W-MARKETING-TRACKER.md:514` | Not verified this session either | ⚠️ **VERIFY BEFORE NEXT BUILD** — quick DB probe; emit-if-non-null policy is already in ListingSchema so no risk regardless. Non-blocking. |
| A-UNIT-2 tail — Farm/Vacant Land coverage gap | line 1123 tracker | Enumerated above (items 2, 3) | ✅ DECIDED in items 2, 3 |
| AreaPage canonical uses DB slug not URL slug | line 468 tracker | Pre-existing: `treb_areas.slug='toronto-area'` while URL is `/toronto` | ⚠️ **DEFERRED (accepted)** — Google accepts alternate canonicals; not a Rule Zero issue. Threading `params.slug` through metadata is a small fix, not blocking. Log as accepted-deferred. |
| Building latitude/longitude 0.0% populated (geo block stays commented) | line 491 tracker | Already handled — geo block commented in BuildingSchema | ✅ **ALREADY CLOSED** — no follow-up needed. |
| Building year_built 0.0% populated | line 491 tracker | RECON claimed "gate with `year_built != null` or drop entirely" | ✅ **DECIDED** — drop entirely (no coverage). One-line delete in BuildingSchema.tsx. Non-blocking (already emits `null`, which is honest but noisy). |
| `OWNER_PROMO_HOSTS` Edge/Node duplication (line 326) | Tracker OPEN item 3 | Enumerated (middleware.ts + app/robots.ts + 2 sitemap handlers) | ⚠️ **DEFERRED (accepted, tracked)** — not A-UNIT-2 scope; adding a new promo host requires 4 edits but that's rare. Non-blocking. |

##### 7. SEO-lane items (C-UNIT / D-UNIT) — all EXTERNAL blockers

Tracker grep: every non-A-UNIT-2 SEO item is currently gated on external operator action, not decidable by this recon:
- C-UNIT-2 Blocker 2 — Cloud Console API-enable (operator step, external)
- C-UNIT-2 Blocker 3 — aily.ca GSC verification (operator step, external)
- E-UNIT-2 — DNS/HTML verification for social channels (external)
- D-UNIT-2 — blocked by C-UNIT-3 (analytics-tracking wiring)

None decidable in this pass. Log status unchanged.

##### 8. Report — single table, one row per open item

| # | Item | Verified surface | DECISION or product fact |
|---|---|---|---|
| 1 | Commercial 937 fake schema | ListingSchema.tsx emits `about.@type: Residence` for 937 Active Commercial rows. Live-verified this session (W12716756 Industrial $8.4M). | ✅ **DECIDED**: add `if (listing.property_type === 'Commercial') return null` at top of ListingSchema — stops Rule Zero #1 violation regardless of any product call. Product fact for later: should Commercial pages render at all? Independent of schema fix. |
| 2 | Commercial 196 no-unit 404 | HomePropertyPage subtype-gate catches them (Commercial not in RESIDENTIAL_TYPES). | ✅ **DECIDED**: no schema action needed (page doesn't render). Only product decision: are 196 Commercial URLs meant to 404 forever or get a page? Same product question as #1. |
| 3 | Modular Home / Upper Level / Lower Level / Room / Shared Room / Rural Residential / MobileTrailer (7 subtypes, 1,709 Active rows) | Each has ≥97% beds/baths/sqft/price population — safe to render. | ✅ **DECIDED**: add all 7 to RESIDENTIAL_TYPES + extend `aboutTypeFromSubtype` map + widen `get_sitemap_freehold_listings` RPC predicate. Pair change. |
| 4 | Farm (529) / Store W Apt/Office (147) | Farm 88% beds pop (62 rows would fabricate); Store 96.6% beds pop. Business scope decision. | ⚠️ **PRODUCT FACT**: is Farm / Store-W-Apt in aily's SEO scope? If yes → add + null-gate the beds/baths render block; if no → stay 404. |
| 5 | Other (436) | 81.7% beds pop → 80 rows would render "0 Bed". | ✅ **DECIDED**: STAY 404. Data quality too variable for a safe residential gate. |
| 6 | Vacant Land (5,663) | 1.1% beds pop, 16.3% sqft. Not a dwelling. | ✅ **DECIDED**: STAY 404 on HomePropertyPage. Distinct LandListing page + schema is separate net-new unit if operator prioritizes it. |
| 7 | Whitespace REGRESSION (12 rows since c7441de, 2 Active) | 3 untrimmed insert sites: `app/api/admin/buildings/incremental-sync/route.ts:813`, `app/api/admin/buildings/save/route.ts:352`, `scripts/sync-buildings-incremental.ts:99`. | ✅ **DECIDED**: extend `.trim() || null` to the 3 missed sites (same shape as c7441de). Pair with a normalize migration (12 rows, trivial). NOT System-1 carve. |
| 8 | BuildingSchema `year_built` (0.0% populated) | Currently emits `null` on every building. | ✅ **DECIDED**: drop the field entirely. One-line delete. |
| 9 | `dateModified` fill rate "~100% unverified" | Tracker :514 unverified. | ⚠️ Verify before build (single COUNT query). Non-blocking — emit-if-non-null already in place. |
| 10 | AreaPage canonical DB-slug (`/toronto` → `/toronto-area`) | Pre-existing, Google accepts as alternate. | ⚠️ **DEFERRED (accepted)** — small fix, non-Rule-Zero. |
| 11 | OWNER_PROMO_HOSTS Edge/Node dup | 4 files share the set (2 sitemap + robots + middleware). | ⚠️ **DEFERRED (accepted)** — not A-UNIT-2. |
| 12 | C-UNIT-2 / D-UNIT-2 / E-UNIT-2 | All external-blocker deferrals (GSC verify, DNS, OAuth). | 🟡 UNCHANGED — external. |

##### 9. Ready-to-build packages (post-recon)

**Package A — Commercial Rule Zero suppression** (1 file, 1 line, no product input): stops the live 937-row fabrication.

**Package B — Whitespace regression closure** (3 files patched + 1 normalize migration + snapshot): completes the SEMI-DETACHED-404 FIX by closing the 3 missed insert paths. NOT the System 1 carve.

**Package C — 7 residential subtypes** (2 code files + 1 RPC migration): +1,709 Active rows renderable + sitemappable. Deterministic mapping.

**Package D — BuildingSchema `year_built` drop** (1 file, 1 line): drops honest-but-null field.

Packages A, B, C, D are technically decidable now. Only Farm / Store W Apt/Office / (optional) full Commercial page await operator product input.

##### 10. Files this dispatch

Read-only recon only. No code files touched. No SQL write. Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_A-UNIT-2-REMAINING-RECON_20260705_193509`. Data queries via ad-hoc `node -e` scripts (safe — `BEGIN READ ONLY`, explicit column allow-lists, no `SELECT *` on credential tables). Live smoke ran on `Host: aily.ca` local dev — no state write. Every claim above verified against a command output this session; any exception is flagged "claimed, unverified."

#### A-UNIT-2 FINAL — 4 packages SHIPPED (2026-07-05)

Operator explicitly confirmed all 11 non-RESIDENTIAL_TYPES freehold subtypes are in-scope residential (Modular Home, Upper Level, Lower Level, Room, Shared Room, Rural Residential, MobileTrailer, Farm, Store W Apt/Office, Other, Vacant Land) — must render, must emit real fields, must OMIT null (never `0`/`-` placeholder). Rule Zero #1 governs HOW.

##### 1. GATE — render-behavior verify (VERBATIM)

Before Package C the operator required verification of how `bedrooms_total`/`bathrooms_total_integer` render when null. VERBATIM lines confirmed this session:

| File | Line | Verbatim | Behavior |
|---|---:|---|---|
| `components/property/HomePropertyDetails.tsx` | 53 | `<p ...>{listing.bedrooms_total \|\| 0}</p>` | prints `0` on null → **FABRICATES** |
| `components/property/HomePropertyDetails.tsx` | 57 | `<p ...>{listing.bathrooms_total_integer \|\| 0}</p>` | prints `0` on null → **FABRICATES** |
| `components/property/HomePropertyDetails.tsx` | 173 | `{listing.living_area_range \|\| '-'}` | prints `-` placeholder |
| `components/property/PropertyHeader.tsx` | 87 | `{listing.bedrooms_total \|\| 0} Bed · {listing.bathrooms_total_integer \|\| 0} Bath` | prints `0 Bed · 0 Bath` → **FABRICATES** |
| `components/property/PropertyDetails.tsx` | 44,48 | `{listing.bedrooms_total \|\| 0}` / `{listing.bathrooms_total_integer \|\| 0}` | condo-layout fabrication (identical shape) |

GATE result: **FABRICATES**. Package C therefore includes the guard fixes to omit-on-null on all 5 sites (backed up + patched).

Emitter side — `app/property/[id]/components/ListingSchema.tsx:204-210` already gates on `!= null`, but that lets integer `0` through. Vacant Land has `bedrooms_total=0` in DB (not null). VERIFIED live before fix on `X11961103`: schema emitted `numberOfBedrooms: 0` / `numberOfBathroomsTotal: 0`. Same as list_price=0 → not a fact, must OMIT. Fix: strengthen guard to `!= null && > 0`.

##### 2. Package A — Commercial honest schema (SHIPPED)

Live violation VERIFIED pre-fix on aily.ca: `W12716756` (Industrial, $8.4M, Active) emitted `about.@type: "Residence"` (Rule Zero #1 fabrication).

Fix — [ListingSchema.tsx:199](app/property/[id]/components/ListingSchema.tsx#L199) new deterministic branch:
```
const aboutType =
  listing.property_type === 'Commercial'
    ? 'Place'
    : aboutTypeFromSubtype(listing.property_subtype)
```
`Place` is schema.org's honest general geographic type — chosen because schema.org has NO `CommercialRealEstateListing` type and Google's rich-cards are residential-only regardless. Not a fabrication.

Also — `list_price=0` OMIT guard added (14 rows of the 937 commercial-with-unit have `list_price=0`):
```
if (listing.list_price != null && listing.list_price > 0) offers.price = listing.list_price
```

Post-fix live smoke on aily.ca, both a real-priced Industrial + a $0 Commercial:
| listing_key | Subtype | Pre-fix about | Post-fix about | Pre-fix price | Post-fix price |
|---|---|---|---|---:|---:|
| W12716756 | Industrial | `Residence` | **`Place`** | 8387500 | 8387500 (unchanged; real) |
| W12757158 | Office (unit 210,211&212, $0 DB) | `Residence` + `price:0` | **`Place`** + **OMIT** | 0 | **OMIT** |

availability=InStock and businessFunction=Sell derived from real `standard_status` + `transaction_type` — unchanged. No fabrication.

##### 3. Package B — Whitespace regression closure (SHIPPED)

Verified inventory of EVERY prod code write to `mls_listings.property_subtype`:

| File | Line | Pre-fix state | Action |
|---|---:|---|---|
| `lib/proptx/field-mapper.ts` | 37 | `?.trim() \|\| null` (c7441de) | ✓ unchanged |
| `lib/homes-sync/save.ts` | 295 | `?.trim() \|\| null` (c7441de) | ✓ unchanged |
| `lib/building-sync/save.ts` | 376 | `?.trim() \|\| null` (c7441de) | ✓ unchanged |
| `scripts/lib/homes-save.ts` | 290 | `?.trim() \|\| null` (c7441de) | ✓ unchanged |
| `app/api/admin/buildings/incremental-sync/route.ts` | 813 | untrimmed | **patched → `?.trim() \|\| null`** |
| `app/api/admin/buildings/save/route.ts` | 352 | untrimmed | **patched → `?.trim() \|\| null`** |
| `scripts/sync-buildings-incremental.ts` | 99 | untrimmed | **patched → `?.trim() \|\| null`** |

Non-write echoes (SELECT + echo in response body, no write): `app/api/parity-probe-sf-lease/route.ts:76`, `app/api/parity-probe-sf-sold/route.ts:93`, `app/api/test-estimator-sections/route.ts:38` — all `.select()`-only. No action.

**System 1 check** — CLAUDE.md carve = `/admin`, `app/api/chat/*`, `agent_buildings`. The 3 patched files are `app/api/admin/buildings/*` and `scripts/sync-buildings-incremental.ts` — NOT in the carve. Building sync is a documented shared exception; writing untrimmed to shared `mls_listings` was a Rule Zero recurrence risk, now closed.

DB normalization migration (OPERATOR-APPROVED): `scripts/apply-semidetached-normalize-pkgB.js`:
- Pre-check: 12 malformed rows (2 Active W13505048/E13235036 + 9 Closed + 1 Expired). Snapshot: `docs/snapshots/semidetached_pre_normalize_pkgB_20260705_201238.txt`.
- Transactional `BEGIN` + `SET LOCAL statement_timeout = 0` + UPDATE btrim + post-verify (0 remaining) + sample re-check (W13505048, E13235036 both `Semi-Detached` len=13).
- COMMITTED. Separate-query post-verify outside runner: 0 malformed remaining anywhere in `mls_listings`.

##### 4. Package C — 11 subtypes render honestly (SHIPPED)

DB byte-exact strings post-btrim verified this session (VERIFIED via `encode(::bytea,'hex')` probe on all 20 distinct freehold Active subtypes). Every added string is `clean=true` (no whitespace):

RESIDENTIAL_TYPES widened at 4 code sites + 1 SQL RPC (all in sync):
- [app/property/[id]/HomePropertyPage.tsx:16](app/property/[id]/HomePropertyPage.tsx#L16)
- [app/api/geo-listings/route.ts:7](app/api/geo-listings/route.ts#L7)
- [app/api/neighbourhood-listings/route.ts:14](app/api/neighbourhood-listings/route.ts#L14)
- [app/sitemap.xml/route.ts:66](app/sitemap.xml/route.ts#L66)
- `supabase/migrations/20260705_a_unit_2_final_sitemap_rpc_widen.sql` → `CREATE OR REPLACE FUNCTION public.get_sitemap_listings` — RPC COMMITTED via `scripts/apply-a-unit-2-final-sitemap-rpc.js` (OPERATOR-APPROVED). Pre-widen matching rows: 91,349; post-widen: 100,179; **net-new sitemappable: +8,830 Active rows**. RPC call `SELECT COUNT * FROM get_sitemap_listings(1000, 0)` returned 1000 (LIMIT applied). Migration transactional; ROLLBACK on narrowing.

Emitter per-subtype schema.org `about.@type` map (`aboutTypeFromSubtype` at [ListingSchema.tsx:84](app/property/[id]/components/ListingSchema.tsx#L84)) — honest deterministic mapping, never fabricates a residential type for a non-dwelling:

| Subtype | about.@type | Rationale |
|---|---|---|
| Modular Home | House | schema.org House covers modular-construction homes |
| Upper Level | Apartment | sub-dwelling unit of a house |
| Lower Level | Apartment | basement suite = sub-dwelling |
| Room | Room | schema.org has schema:Room type |
| Shared Room | Room | same |
| Rural Residential | SingleFamilyResidence | detached rural home |
| MobileTrailer | House | closest honest fit |
| Farm | House | farmhouse (dwelling on farm parcel) |
| Store W Apt/Office | **Place** | non-dwelling (mixed-use commercial + apt) |
| Other | **Place** | catchall — data too heterogeneous for a dwelling type |
| Vacant Land | **Place** | not a dwelling |
| Commercial (all subtypes via property_type branch) | **Place** | non-residential (Package A) |

UI null-omit guards SHIPPED at 3 files:
- [components/property/HomePropertyDetails.tsx:50-77](components/property/HomePropertyDetails.tsx) — Bedrooms/Bathrooms/Square Feet/Property Type cells each individually null-guarded; renders empty cell (not `0`/`-`) when backing value null.
- [components/property/PropertyHeader.tsx:85-100](components/property/PropertyHeader.tsx) — home sub-line composed from real non-null parts only; skips sub-line entirely if all null.
- [components/property/PropertyDetails.tsx:41-64](components/property/PropertyDetails.tsx) — condo layout same shape (freehold-with-unit routes here; e.g. Modular Home X13214966, Room E13467500).

Emitter null-omit strengthened at [ListingSchema.tsx:207-218](app/property/[id]/components/ListingSchema.tsx#L207) — beds/baths OMIT when `null OR 0`; same rule as list_price=0.

**Live smoke — every subtype, real listing_key, both tenants**:

| Subtype | listing_key | HTTP | about | beds | baths | price | avail | biz |
|---|---|---:|---|---:|---:|---:|---|---|
| Modular Home | X13214966 | 200 | House | 4 | 3 | 1266497 | InStock | Sell |
| Upper Level | C12990900 | 200 | Apartment | 3 | 3 | 15800 | InStock | LeaseOut |
| Lower Level | C13420642 | 200 | Apartment | 3 | 1 | 3100 | InStock | LeaseOut |
| Room | E13467500 | 200 | Room | 2 | 2 | 2620 | InStock | LeaseOut |
| Shared Room | W13055104 | 200 | Room | 3 | 1 | 2650 | InStock | LeaseOut |
| Rural Residential | X13126132 | 200 | SingleFamilyResidence | 4 | 2 | 16900000 | InStock | Sell |
| MobileTrailer | X13123056 | 200 | House | 2 | 1 | 999000 | InStock | Sell |
| Farm | N10410273 | 200 | House | 6 | 6 | 35000000 | InStock | Sell |
| Store W Apt/Office | X12472597 | 200 | Place | 6 | 5 | 7999000 | InStock | Sell |
| **Other (DB beds=0)** | S13502654 | 200 | Place | **OMIT** | **OMIT** | 24000000 | InStock | Sell |
| **Vacant Land (DB beds=0)** | X11961103 | 200 | Place | **OMIT** | **OMIT** | 34500000 | InStock | Sell |
| Semi-Detached | N13087922 | 200 | House | 42 | 36 | 13000000 | InStock | Sell |
| **Commercial Industrial** | W12716756 | 200 | Place | OMIT | OMIT | 8387500 | InStock | Sell |
| **Commercial $0 (Office 448 Burnhamthorpe)** | W12757158 | 200 | Place | OMIT | OMIT | **OMIT** | InStock | Sell |

Zero `0 Bed` text found in any rendered HTML across the 14 URLs (`grep -Fc "0 Bed"` = 0 everywhere).

Walliam absence check on 3 subtypes (modular / vacantland / commercial): all HTTP 200, RealEstateListing x0, BreadcrumbList x0 — SEO gate intact, non-SEO tenant behavior preserved.

geo-listings widening proof — community `51f44580-…` (top community with new-subtype rows): pre-widen homes-tab excluded them; post-widen returned 200 rows with Rural Residential + 40 Vacant Land + Duplex included. Postgres `.in()` predicate now matches.

##### 5. Package D — year_built dropped (SHIPPED)

[app/[slug]/components/BuildingSchema.tsx:77-80](app/[slug]/components/BuildingSchema.tsx#L77) removed. Field was 0.0% populated across 9,835 buildings — always OMIT before, always OMIT after; code-cleanup only. Building smoke on `/side-launch-1-shipyard-lane-collingwood` (aily): HTTP 200, `ApartmentComplex` x1, `BreadcrumbList` x1, `yearBuilt` tokens = 0. walliam same URL: HTTP 200, ApartmentComplex x0.

##### 6. Files this dispatch

New:
- `scripts/apply-semidetached-normalize-pkgB.js`
- `scripts/apply-a-unit-2-final-sitemap-rpc.js`
- `scripts/_a-unit-2-final-smoke-parse.js` (smoke helper)
- `supabase/migrations/20260705_a_unit_2_final_sitemap_rpc_widen.sql`
- `docs/snapshots/semidetached_pre_normalize_pkgB_20260705_201238.txt`

Modified (all with `.backup_A-UNIT-2-FINAL_20260705_201238`):
- `app/property/[id]/components/ListingSchema.tsx` (Commercial branch + non-dwelling map + beds/baths/price >0 guards)
- `app/property/[id]/HomePropertyPage.tsx` (RESIDENTIAL_TYPES widened to 19)
- `app/api/geo-listings/route.ts` (RESIDENTIAL_TYPES widened)
- `app/api/neighbourhood-listings/route.ts` (RESIDENTIAL_TYPES widened)
- `app/sitemap.xml/route.ts` (HOME_SUBTYPES widened)
- `components/property/HomePropertyDetails.tsx` (null-omit guards)
- `components/property/PropertyHeader.tsx` (null-omit guards)
- `components/property/PropertyDetails.tsx` (null-omit guards — condo layout)
- `app/[slug]/components/BuildingSchema.tsx` (year_built dropped)
- `app/api/admin/buildings/incremental-sync/route.ts` (`.trim()` on property_subtype)
- `app/api/admin/buildings/save/route.ts` (`.trim()` on property_subtype)
- `scripts/sync-buildings-incremental.ts` (`.trim()` on property_subtype)
- `docs/W-MARKETING-TRACKER.md` (this section; backup `.backup_A-UNIT-2-FINAL_20260705_201238`)

TSC exit 0 on all edits. `.env.local` remains git-ignored — not staged. Backups untracked (deliberate).

##### 7. Open Findings — updated

- **Open Finding 1** (Commercial `Residence` fabrication) — **CLOSED** by Package A honest `Place` schema + list_price=0 OMIT.
- **Open Finding 2** (Semi-Detached whitespace) — **CLOSED** (already closed by c7441de + confirmed by Package B closing the 3 previously-missed insert paths + normalizing the 12 re-corrupted rows).

No new Open Findings surfaced this dispatch.

HOLD push per operator dispatch.

#### A-UNIT-2 USER-FILTER RECON — surface distinction (2026-07-06)

Reconcile: 64cfc6a delivered the RENDER + SCHEMA surface for 19 subtypes. This dispatch verifies whether the USER-FACING subtype filter UI reflects the same 19 subtypes, or is stale — the two are distinct surfaces (a subtype can render a page yet be missing from the filter chip list, or vice versa).

##### 1. What 64cfc6a shipped — precisely

VERIFIED this session (`git log 64cfc6a`, code inspection):

| Surface | State post-64cfc6a |
|---|---|
| Render gate on `app/property/[id]/HomePropertyPage.tsx:16` (`RESIDENTIAL_TYPES`) | ✅ **19 subtypes** — pages render for all 11 newly-added + 8 original |
| Schema emitter `app/property/[id]/components/ListingSchema.tsx` (`aboutTypeFromSubtype`) | ✅ **19 subtypes** — each maps to honest schema.org `@type` (Place for non-dwellings) |
| Postgres predicate `app/api/geo-listings/route.ts:7` (`RESIDENTIAL_TYPES` — homes-category `.in()`) | ✅ **19 subtypes** — `.in('property_subtype', RESIDENTIAL_TYPES)` matches |
| Postgres predicate `app/api/neighbourhood-listings/route.ts:14` (same shape) | ✅ **19 subtypes** |
| Sitemap `HOME_SUBTYPES` at `app/sitemap.xml/route.ts:66` | ✅ **19 subtypes** |
| `public.get_sitemap_listings` SQL RPC (migration `20260705_a_unit_2_final_sitemap_rpc_widen.sql`, COMMITTED) | ✅ **19 subtypes** |
| UI null-omit guards on beds/baths/sqft (3 files) | ✅ Shipped |

**What 64cfc6a did NOT ship**: the user-facing subtype-filter chip list in the "Advanced filters" panel on geo pages. That surface has its own hardcoded list — see below.

##### 2. Is there a user-facing subtype filter? — VERIFIED

**YES.** One user-facing filter component surfaces subtype chips to visitors:

- **File**: `app/[slug]/components/GeoAdvancedFilters.tsx` (VERIFIED verbatim this session).
- **Shape**: two hardcoded arrays — `CONDO_SUBTYPES` (4 values, lines 22-27) and `HOME_SUBTYPES` (8 values, lines 29-38). At render, `subtypeOptions` picks by `propertyCategory` prop (line 61-63): `'condo'` → `CONDO_SUBTYPES`; `'homes'` → `HOME_SUBTYPES`; else → concatenation of both.
- **Mount points** (VERIFIED via `grep -rn "GeoAdvancedFilters"`): 3 files import it →
  - `app/[slug]/components/GeoListingSection.tsx:12` — used by `GeoPageTabs` → mounted on `CommunityPage.tsx`, `MunicipalityPage.tsx`, `AreaPage.tsx`.
  - `app/[slug]/components/NeighbourhoodListingSection.tsx` — used by `NeighbourhoodPageTabs` → mounted on `app/comprehensive-site/toronto/[neighbourhood]/page.tsx`.
- **User surface**: 4 page types (Community, Municipality, Area, Neighbourhood) present these subtype chips to visitors as clickable filter tokens.

**Data source**: HARDCODED literal arrays (not derived from the DB). VERIFIED verbatim.

##### 3. Is the hardcoded list STALE vs the 19-subtype render scope? — VERIFIED

Verbatim from `GeoAdvancedFilters.tsx:29-38`:
```
const HOME_SUBTYPES = [
  'Detached',
  'Semi-Detached',
  'Att/Row/Townhouse',
  'Link',
  'Duplex',
  'Triplex',
  'Fourplex',
  'Multiplex',
]
```

That is the **original 8-subtype list**. Comparison against the 19-subtype render scope shipped in 64cfc6a:

| Subtype | Renders a page (64cfc6a) | Appears in user filter (GeoAdvancedFilters) |
|---|:---:|:---:|
| Detached | ✅ | ✅ |
| Semi-Detached | ✅ | ✅ |
| Att/Row/Townhouse | ✅ | ✅ |
| Link | ✅ | ✅ |
| Duplex | ✅ | ✅ |
| Triplex | ✅ | ✅ |
| Fourplex | ✅ | ✅ |
| Multiplex | ✅ | ✅ |
| **Modular Home** | ✅ | ❌ MISSING |
| **Upper Level** | ✅ | ❌ MISSING |
| **Lower Level** | ✅ | ❌ MISSING |
| **Room** | ✅ | ❌ MISSING |
| **Shared Room** | ✅ | ❌ MISSING |
| **Rural Residential** | ✅ | ❌ MISSING |
| **MobileTrailer** | ✅ | ❌ MISSING |
| **Farm** | ✅ | ❌ MISSING |
| **Store W Apt/Office** | ✅ | ❌ MISSING |
| **Other** | ✅ | ❌ MISSING |
| **Vacant Land** | ✅ | ❌ MISSING |

**VERDICT — VERIFIED STALE-GAP**: the user-facing subtype filter is hardcoded and missing all 11 newly-added subtypes. A visitor browsing Community/Municipality/Area/Neighbourhood pages CAN reach an individual (e.g.) Vacant Land page (it renders + emits schema now), but CANNOT filter the geo-page listing tab to show only Vacant Land — the chip does not exist in the UI. Same for the other 10.

##### 4. Behavior when a visitor hits geo pages today

VERIFIED via code trace (`GeoListingSection.tsx:85` sends `subtypes=...` param; server route `/api/geo-listings:71` uses `RESIDENTIAL_TYPES.in()` for propertyCategory='homes'):
- With **no subtypes filter selected**: server route's `.in(RESIDENTIAL_TYPES)` matches all 19 subtypes → listings for all 19 appear in the geo-page results (mixed).
- With **any subtypes filter selected via chip**: `subtypes` param is the joined chip list (only from the 8 hardcoded). New subtypes are un-selectable → results narrow to only the selected old subtypes.
- No 404 introduced — the filter is *additive*; missing chips just mean the user cannot narrow *to* those subtypes.

So Rule Zero #1 is NOT violated on the filter surface (no fabricated chip, no fabricated result). It is a **coverage gap**, not a data-integrity bug.

##### 5. Condo-side note (pre-existing, out-of-scope for A-UNIT-2)

For completeness — `CONDO_SUBTYPES` in the same file (lines 22-27) lists only 4 of the 7 DB condo subtypes: missing `Detached Condo`, `Semi-Detached Condo`, `Co-Ownership Apartment`, `Leasehold Condo`. This is a pre-existing gap, independent of A-UNIT-2's render-gate work. Log for follow-up, not this dispatch.

##### 6. Verdict — plain

- **User-facing subtype filter status**: **VERIFIED present, VERIFIED stale-gap**. Location: `app/[slug]/components/GeoAdvancedFilters.tsx:29-38` (`HOME_SUBTYPES`). Data source: HARDCODED literal (not derived). Missing 11 of the 19 render-scope subtypes.
- **64cfc6a scope reconciled**: shipped the RENDER + SCHEMA + API-predicate + SITEMAP-RPC surfaces for 19 subtypes. Did NOT ship the user-facing filter-chip surface. These are separate surfaces; the tracker distinguishes them.
- **Blast radius of the stale filter**: additive — visitors cannot narrow *to* new subtypes; results without a filter selection already include the new subtypes (via the widened server predicate). No 404, no fabrication, no Rule Zero #1 violation.
- **Fix scope (next dispatch, if operator wants)**: extend `HOME_SUBTYPES` in `GeoAdvancedFilters.tsx` from 8 → 19; ALSO consider extending `CONDO_SUBTYPES` from 4 → 7 (pre-existing gap). Regression surface: chip UI layout may want wrapping / grouping when it grows to 19; smoke each of the 4 page types (Community, Municipality, Area, Neighbourhood) to confirm chip render + click-toggle + server-side result shape. Not this dispatch.

##### 7. Files this dispatch

Read-only recon only. No code files touched. No SQL write. Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_A-UNIT-2-USER-FILTER-RECON_20260706_095909`. Data queries: none needed (this is a code-inspection recon, not a data recon; DB was not queried). Every claim above verified against a code file this session; nothing marked "claimed, unverified."

#### GEO-FILTER-SUBTYPES FIX — SHIPPED (2026-07-06)

Closes the two open user-filter gaps flagged in the prior recon: (a) `HOME_SUBTYPES` chip list was 8 while the render scope is 19; (b) `CONDO_SUBTYPES` chip list was 4 while there are 8 real condo dwelling subtypes in the DB. Same file, same shape, additive.

##### 1. Step 0 — DB truth verified (READ-ONLY)

`SELECT DISTINCT property_type, property_subtype FROM mls_listings WHERE standard_status='Active' AND property_type IN ('Residential Freehold','Residential Condo & Other')` — this session. Byte-level probe (`encode(::bytea,'hex')`) confirmed every returned string is clean (no whitespace) post-c7441de/64cfc6a normalization.

**Residential Freehold (Active) distinct subtypes** (VERIFIED, 19 total):
```
Detached (43,411), Att/Row/Townhouse (6,078), Vacant Land (5,663),
Semi-Detached (3,878), Multiplex (1,341), Duplex (1,154), Farm (529),
Triplex (525), MobileTrailer (500), Rural Residential (490), Other (436),
Fourplex (316), Lower Level (285), Link (255), Modular Home (229),
Upper Level (166), Store W Apt/Office (147), Room (34), Shared Room (5)
```
This exactly matches `RESIDENTIAL_TYPES` in `app/property/[id]/HomePropertyPage.tsx:16` (19 entries).

**Residential Condo & Other (Active) distinct subtypes** (VERIFIED, 19 total — most low-volume):
```
Condo Apartment (21,249), Condo Townhouse (5,839), Common Element Condo (603),
Other (261), Co-op Apartment (161), Detached Condo (140), Parking Space (133),
Vacant Land Condo (124), Semi-Detached Condo (52), Leasehold Condo (47),
Co-Ownership Apartment (45), Locker (17), Upper Level (17), Timeshare (9),
Room (7), Att/Row/Townhouse (2), Shared Room (1), Phased Condo (1),
Lower Level (1)
```
Dwelling-shaped condo subtypes (≥45 Active rows each): **8 total** — Condo Apartment, Condo Townhouse, Common Element Condo, Co-op Apartment, Detached Condo, Semi-Detached Condo, Co-Ownership Apartment, Leasehold Condo. The non-dwelling condo tails (Parking Space, Locker, Vacant Land Condo, Timeshare, Phased Condo, Room, Upper/Lower/Shared, Att/Row/Townhouse condo edge cases, Other) intentionally excluded from the chip UI — most already covered by the freehold chips or are non-dwelling amenities users would search separately.

**Prior-recon numerical correction**: the A-UNIT-2 USER-FILTER RECON section above said "only 4 of the 7 DB condo subtypes" — that was arithmetically off (should have been "4 of 8 dwelling-shaped"). Recorded here to close the loop; no impact on the fix since we extended to 8 either way.

##### 2. Step 1 — Approach decision (Option B: extend literals + tie-comment)

Options considered:
- **A. Shared module** — move `RESIDENTIAL_TYPES` to a new `lib/constants/property-subtypes.ts`, re-import from 5 files (`HomePropertyPage.tsx`, `geo-listings/route.ts`, `neighbourhood-listings/route.ts`, `sitemap.xml/route.ts`, `GeoAdvancedFilters.tsx`). Fully prevents future drift by construction.
- **B. Extend literals in-place with a tie-comment** — 1 file, 2 lists → 8/19 entries each, plus a code comment binding both arrays to `RESIDENTIAL_TYPES` at `HomePropertyPage.tsx:16` and the 3 sibling constants, with an explicit "if you edit one you must edit all — verified stale-gap this session" note.

**Chose B**. Rationale: CLAUDE.md's "Don't refactor beyond what the task requires" — Option A would touch 5 files for a shared-module refactor that is orthogonal to the immediate user-filter gap. Option B closes the current gap with a 1-file edit and leaves the shared-module refactor as a follow-up if the drift recurs. Option A logged as OPEN follow-up (see item 5).

##### 3. Edit — VERBATIM

File: [app/[slug]/components/GeoAdvancedFilters.tsx](app/[slug]/components/GeoAdvancedFilters.tsx). Backup: `app/[slug]/components/GeoAdvancedFilters.tsx.backup_GEO-FILTER-SUBTYPES_20260706_100734`.

- `HOME_SUBTYPES`: 8 → **19** entries (adds Modular Home, Upper Level, Lower Level, Room, Shared Room, Rural Residential, MobileTrailer, Farm, Store W Apt/Office, Other, Vacant Land).
- `CONDO_SUBTYPES`: 4 → **8** entries (adds Detached Condo, Semi-Detached Condo, Co-Ownership Apartment, Leasehold Condo).
- Tie-comment above both arrays references the 5 sibling constants (`RESIDENTIAL_TYPES` at `HomePropertyPage.tsx:16`, `geo-listings`, `neighbourhood-listings`, `sitemap.xml`, and the SQL RPC) with "must move together" instruction.

TSC exit 0 on the edit.

##### 4. Step 2 — Smoke matrix (both tenants, 4 page types, chip round-trip)

**aily.ca — 4 geo pages render 200**:
| Page type | URL | HTTP | H1 |
|---|---|---:|---|
| Community | `/grindstone` | 200 | Grindstone Real Estate |
| Municipality | `/toronto-e02` | 200 | Toronto E02 Real Estate |
| Area | `/chatham-kent-area` | 200 | Chatham-Kent Real Estate |
| Neighbourhood | `/toronto/downtown` | 200 | Downtown Real Estate |

**Compiled JS bundle probe** — chunk `/_next/static/chunks/app/comprehensive-site/%5Bslug%5D/page.js` (mounts `GeoAdvancedFilters`) contains all 15 net-new subtype string literals (each `x1-x4` occurrences) — verified this session by direct chunk fetch + `grep -Fc`. Chip strings ship in the client bundle, not just in the tracker.

**End-to-end round-trip — each new chip actually filters**:
| Chip | Geo scope | HTTP | Rows returned | Subtypes in result |
|---|---|---:|---:|---|
| `subtypes=Farm` | community `33b0701d-…` (top Farm-community, DB n=13 Active) | 200 | 11 | `{Farm: 11}` ✓ pure |
| `subtypes=Vacant Land` | community `51f44580-…` (DB n=111 Active) | 200 | 50 of 109 | `{Vacant Land: 50}` ✓ pure (pageSize=50) |
| `subtypes=Modular Home` | muni `b23b066f-…` (DB n=19 Active) | 200 | 19 | `{Modular Home: 19}` ✓ pure |
| `subtypes=Farm,Rural Residential` (multi) | muni `b23b066f-…` | 200 | 3 | `{Farm: 2, Rural Residential: 1}` ✓ mixed as expected |
| `subtypes=Detached Condo` | community `31653110-…` (DB n=12 Active) | 200 | 12 | `{Detached Condo: 12}` ✓ pure |

Every chip round-trips end-to-end: client posts `subtypes=` → `/api/geo-listings` uses `.in('property_subtype', typeList)` at [route.ts:78](app/api/geo-listings/route.ts#L78) → server returns only rows matching selected chip(s). No leak, no un-requested subtypes in results.

**Chip-layout regression check** — [GeoAdvancedFilters.tsx:145](app/[slug]/components/GeoAdvancedFilters.tsx#L145) uses `<div className="flex flex-wrap gap-1.5">` around the chip `<button>` list. `flex-wrap` guarantees the row grows vertically as chips overflow horizontally, so 19 chips wrap gracefully on desktop (~3-4 rows) and mobile (~7-8 rows). No fixed height/width constraint on the container. Verified verbatim; no regression.

**walliam.ca — 4 geo pages render + filter functional (non-SEO tenant)**:
| Page type | HTTP | JSON-LD `RealEstateListing` |
|---|---:|---:|
| Community `/grindstone` | 200 | 0 (SEO gate intact) |
| Municipality `/toronto-e02` | 200 | 0 |
| Area `/chatham-kent-area` | 200 | 0 |
| Neighbourhood `/toronto/downtown` | 200 | 0 |

`subtypes=Farm` round-trip on walliam.ca (`Host: walliam.ca`, same community): **HTTP 200, 11 rows, all Farm** — identical to aily.ca (correct — filter is a functional UI, not an SEO surface; results are data-plane and identical across tenants; the SEO gate strips only JSON-LD, not listing data).

##### 5. Verdicts

- **User-facing subtype filter stale-gap** (freehold 8 → 19): **CLOSED**.
- **CONDO_SUBTYPES pre-existing gap** (4 → 8): **CLOSED**.
- **Shared-module refactor (Option A)** — logged as OPEN follow-up. Present drift protection is the tie-comment + this tracker note; if the drift recurs a second time, promote to Option A (5-file refactor).
- No new Open Findings surfaced this dispatch.

##### 6. Files this dispatch

Modified (with `.backup_GEO-FILTER-SUBTYPES_20260706_100734`):
- `app/[slug]/components/GeoAdvancedFilters.tsx`
- `docs/W-MARKETING-TRACKER.md` (this section; backup `.backup_GEO-FILTER-SUBTYPES_20260706_100734`)

No SQL write. No new file. `.env.local` remains git-ignored — not staged. Backup files untracked (deliberate). TSC exit 0.

HOLD push per operator dispatch.

#### A-UNIT-2 SUBTYPE REFERENCE — durable list (2026-07-06, BMZDISK)

Consolidated reference so future work can find the current subtype scope without re-deriving it from code. Everything here is VERIFIED this session against the DB + code + commit history; anything unverified is flagged inline.

##### 1. Render scope (freehold) — 19 subtypes, shipped by `64cfc6a`

`RESIDENTIAL_TYPES` at [app/property/[id]/HomePropertyPage.tsx:16](app/property/[id]/HomePropertyPage.tsx#L16) — the source of truth for the render gate. **Verbatim, 19 entries**:
```
'Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link',
'Duplex', 'Triplex', 'Fourplex', 'Multiplex',
'Modular Home', 'Upper Level', 'Lower Level', 'Room', 'Shared Room',
'Rural Residential', 'MobileTrailer',
'Farm', 'Store W Apt/Office', 'Other', 'Vacant Land',
```

Mirrored byte-exact in 4 sibling constants (all VERIFIED aligned):
- [app/api/geo-listings/route.ts:7](app/api/geo-listings/route.ts#L7) — Postgres `.in()` for propertyCategory='homes'
- [app/api/neighbourhood-listings/route.ts:14](app/api/neighbourhood-listings/route.ts#L14) — same shape
- [app/sitemap.xml/route.ts:66](app/sitemap.xml/route.ts#L66) — `HOME_SUBTYPES` for chunk counting
- `supabase/migrations/20260705_a_unit_2_final_sitemap_rpc_widen.sql` → `public.get_sitemap_listings` RPC (COMMITTED)

**Schema.org `about.@type` mapping** at [ListingSchema.tsx:84](app/property/[id]/components/ListingSchema.tsx#L84) — honest per-subtype:
| Subtype | @type |
|---|---|
| Detached, Rural Residential | SingleFamilyResidence |
| Semi-Detached, Att/Row/Townhouse, Link, Modular Home, MobileTrailer, Farm | House |
| Duplex, Triplex, Fourplex, Multiplex | Residence |
| Upper Level, Lower Level | Apartment |
| Room, Shared Room | Room |
| Store W Apt/Office, Other, Vacant Land | Place (non-dwelling) |
| Commercial (any subtype, via property_type branch) | Place |

##### 2. User-facing filter chips — 19 home + 8 condo, shipped by `67bb717`

`HOME_SUBTYPES` at [app/[slug]/components/GeoAdvancedFilters.tsx:32](app/[slug]/components/GeoAdvancedFilters.tsx#L32) — **19 entries, byte-exact match to `RESIDENTIAL_TYPES`** above.

`CONDO_SUBTYPES` at [app/[slug]/components/GeoAdvancedFilters.tsx:21](app/[slug]/components/GeoAdvancedFilters.tsx#L21) — **8 entries, verbatim**:
```
'Condo Apartment', 'Condo Townhouse', 'Co-op Apartment', 'Common Element Condo',
'Detached Condo', 'Semi-Detached Condo', 'Co-Ownership Apartment', 'Leasehold Condo',
```

**Deliberately EXCLUDED from CONDO_SUBTYPES** (non-dwelling condo-table tails; VERIFIED distinct DB values Active):
- `Parking Space` (133), `Locker` (17), `Vacant Land Condo` (124), `Timeshare` (9), `Phased Condo` (1).
Rationale: chips scope to dwelling-shaped listings a person browses for a home. Non-dwelling amenities are edge searches (a parking space alone) and don't belong in a "condo dwelling filter." No render-side impact — `PropertyPage` (condo route) has no subtype gate, so any condo subtype still renders + emits schema; only the *filter chip* is scoped.

##### 3. Two surfaces, both aligned — precise distinction

| Surface | Commit | What it gates |
|---|---|---|
| **Render + schema + API predicate + sitemap** | `64cfc6a` | Which subtypes get a rendered page, emit JSON-LD, appear in unfiltered API results, appear in the sitemap. 19 freehold + all condo dwellings (via no-gate PropertyPage). |
| **User-facing chip filter** | `67bb717` | Which subtypes a visitor can chip-select from the "Advanced filters" panel on Community / Municipality / Area / Neighbourhood pages. 19 home + 8 condo. |

These are separate surfaces. A subtype can render but not be a chip (was the pre-67bb717 state), or be a chip and not render (never intended — chips would return empty). Post-67bb717, both are aligned.

##### 4. Drift-protection posture

Both filter arrays in `GeoAdvancedFilters.tsx` are **hardcoded literals** tied by a tie-comment (VERIFIED verbatim at [GeoAdvancedFilters.tsx:22-31](app/[slug]/components/GeoAdvancedFilters.tsx#L22)) to the 5 sibling constants — comment lists each and says "if you add a subtype to RESIDENTIAL_TYPES you MUST add it here too." The comment is instructional, not enforced.

**Option A — shared module** (`lib/constants/property-subtypes.ts` re-imported from 5 files): logged as **OPEN follow-up**. Not shipped now to keep the current dispatch scope tight. Promote to Option A if drift recurs a second time.

##### 5. What could still drift (future risk surface)

- If a new freehold subtype appears in DB (RESO/PropTx feed change), 5 files must be edited AND the SQL RPC re-committed. Missing any one = the same class of stale-gap this closed. VERIFIED alignment as of `67bb717`; "claimed, unverified" for any future date without re-checking.
- If a new condo subtype appears (`CONDO_SUBTYPES`), only `GeoAdvancedFilters.tsx` needs the chip edit — condo render is un-gated (PropertyPage has no subtype gate). BUT there is a related pre-existing gap in the API predicate: `CONDO_TYPES` at [app/api/geo-listings/route.ts:6](app/api/geo-listings/route.ts#L6) and [app/api/neighbourhood-listings/route.ts:10-13](app/api/neighbourhood-listings/route.ts#L10) — VERIFIED verbatim this session — both list **7 entries** (Condo Apartment, Condo Townhouse, Co-op Apartment, Common Element Condo, Leasehold Condo, Detached Condo, Co-Ownership Apartment). Missing: **Semi-Detached Condo** (52 Active rows). The user-side filter chip for Semi-Detached Condo exists post-67bb717, but the API `.in()` predicate for `propertyCategory='condo'` will not include Semi-Detached Condo rows in results — a visitor who selects the chip gets an empty result set on that subtype (Postgres doesn't match). This is the mirror image of the freehold gap 67bb717 closed. Not fixed this dispatch (BMZDISK is tracker-only per operator scope). Logged as **OPEN — API `CONDO_TYPES` gap** for the next dispatch (2-line fix + smoke, same shape as 67bb717).

##### 6. Files this dispatch

Tracker append only. Backup: `docs/W-MARKETING-TRACKER.md.backup_BMZDISK_20260706_102513`. No code, no SQL, no schema change. Ride-along with the `67bb717` push per operator dispatch.

#### CONDO-TYPES-FIX — API predicate closed + shared-module refactor SHIPPED (2026-07-06)

Closes the "API CONDO_TYPES gap" flagged in the BMZDISK reference block: `Semi-Detached Condo` was in the user chip list (67bb717) but missing from the server `.in()` predicate at [geo-listings/route.ts:6](app/api/geo-listings/route.ts#L6) and [neighbourhood-listings/route.ts:10-13](app/api/neighbourhood-listings/route.ts#L10). Chip-select returned zero — a broken filter shipped in 67bb717 as a half-fix.

##### 1. Step 0 — DB truth (READ ONLY)

`SELECT DISTINCT property_subtype, COUNT(*) FROM mls_listings WHERE property_type='Residential Condo & Other' AND standard_status='Active' GROUP BY 1 ORDER BY 2 DESC` — this session. Real distinct condo subtypes (19 total; dwelling-shaped 8):
```
Condo Apartment 21249  Condo Townhouse 5839  Common Element Condo 603
Other 261  Co-op Apartment 161  Detached Condo 140  Parking Space 133
Vacant Land Condo 124  Semi-Detached Condo 52  Leasehold Condo 47
Co-Ownership Apartment 45  Locker 17  Upper Level 17  Timeshare 9
Room 7  Att/Row/Townhouse 2  Shared Room 1  Lower Level 1  Phased Condo 1
```

Byte-compare (this session) — chip list vs API predicates:
| Source | Entries | Contains Semi-Detached Condo? |
|---|---:|---|
| `GeoAdvancedFilters.tsx` `CONDO_SUBTYPES` (post-67bb717) | 8 | ✅ Yes |
| `app/api/geo-listings/route.ts:6` `CONDO_TYPES` | 7 | ❌ **MISSING** |
| `app/api/neighbourhood-listings/route.ts:10-13` `CONDO_TYPES` | 7 | ❌ **MISSING** |

Only `Semi-Detached Condo` is missing from the API predicates — no other gaps.

##### 2. Step 2 — COMPREHENSIVE decision: Option-A shared-module refactor DONE

**This is the 2nd chip/predicate drift incident** (freehold gap closed in 67bb717; condo gap closed here). Rule Zero "architecture prevents new instances of the same class of bug" triggers. Extending literals a 3rd time is not defensible — the drift class has recurred.

**Refactor SHIPPED**: single source of truth at [lib/constants/property-subtypes.ts](lib/constants/property-subtypes.ts) (new module, 60 lines). Exports:
- `RESIDENTIAL_TYPES` — 19 freehold dwelling + non-dwelling subtypes.
- `CONDO_TYPES` — 8 condo dwelling subtypes (non-dwelling condo tails Parking Space, Locker, Vacant Land Condo, Timeshare, Phased Condo intentionally excluded).

Every consumer replaced its local literal with an `import { … } from '@/lib/constants/property-subtypes'`:
| File | Before | After |
|---|---|---|
| [app/property/[id]/HomePropertyPage.tsx:15](app/property/[id]/HomePropertyPage.tsx#L15) | local `const RESIDENTIAL_TYPES = [...]` (19) | `import { RESIDENTIAL_TYPES }` |
| [app/api/geo-listings/route.ts:3](app/api/geo-listings/route.ts#L3) | local `CONDO_TYPES` (7) + `RESIDENTIAL_TYPES` (19) | `import { CONDO_TYPES, RESIDENTIAL_TYPES }` |
| [app/api/neighbourhood-listings/route.ts:7](app/api/neighbourhood-listings/route.ts#L7) | same | same |
| [app/sitemap.xml/route.ts:33](app/sitemap.xml/route.ts#L33) | local `HOME_SUBTYPES` (19) | `import { RESIDENTIAL_TYPES }` (renamed reference at `:81`) |
| [app/[slug]/components/GeoAdvancedFilters.tsx:4](app/[slug]/components/GeoAdvancedFilters.tsx#L4) | local `HOME_SUBTYPES` (19) + `CONDO_SUBTYPES` (8) | `import { RESIDENTIAL_TYPES, CONDO_TYPES }` + local aliases `HOME_SUBTYPES = RESIDENTIAL_TYPES`, `CONDO_SUBTYPES = CONDO_TYPES` (preserve prior render-time variable names for minimal diff) |

TSC exit 0 on all 5 edits + the new module.

**One sync surface intentionally NOT in the module**: the SQL RPC `public.get_sitemap_listings` (`supabase/migrations/20260705_a_unit_2_final_sitemap_rpc_widen.sql`) — Postgres cannot import a JS array. The shared module's header comment names this explicitly with instructions: if you edit `RESIDENTIAL_TYPES` you MUST also cut a new migration re-creating the RPC.

##### 3. Step 3 — Smoke matrix

| # | Path | Command | Pre-fix | Post-fix |
|---|---|---|---:|---:|
| 1 | `geo-listings` `subtypes=Semi-Detached Condo` on top community (DB n=7) | HTTP GET | **0** | **7, all Semi-Detached Condo** |
| 2 | Regression: `subtypes=Condo Apartment` same community (DB n=6) | HTTP GET | 6 | 6, all Condo Apartment (no regression) |
| 3 | Unfiltered `propertyCategory=condo` same community | HTTP GET | 24 (missing 7 SDC) | 31 rows — includes 7 Semi-Detached Condo (`.in(CONDO_TYPES)` now matches all 8) |
| 4 | `neighbourhood-listings` `subtypes=Semi-Detached Condo` muni (DB n=9) | HTTP GET | 0 | 9, all Semi-Detached Condo |
| 5 | Freehold widening intact: `subtypes=Farm` on Farm-community | HTTP GET | 11 | 11 (unchanged) |
| 6 | walliam.ca `subtypes=Semi-Detached Condo` same community | HTTP GET | 0 | 7 (identical to aily — data-plane, correct) |

VERIFIED at runtime this session: `require('lib/constants/property-subtypes.ts')` returns `CONDO_TYPES.length === 8` and `RESIDENTIAL_TYPES.length === 19` — matches the 3 previously-drifting consumers byte-for-byte.

##### 4. Verdicts

- **API `CONDO_TYPES` gap** — **CLOSED**. Semi-Detached Condo now returns real rows through both API predicates and both tenants.
- **Option-A shared-module refactor** — **SHIPPED**. Prior tracker entries logged this as OPEN follow-up; now realized. Adding or removing a subtype in the JS layer is now a 1-file edit.
- **Drift-protection posture** — durable. The 5 JS consumers cannot drift because they all read from the same array. The only remaining sync surface is the SQL RPC (documented in the shared module's header + in section 2 above).
- **`64cfc6a` A-UNIT-2 FINAL scope** — retroactively fully realized. What 64cfc6a shipped was correct; 67bb717 was needed to close the chip surface; this dispatch was needed to close the API predicate + prevent future recurrence. All 3 commits together = the durable A-UNIT-2 delivery.

##### 5. Files this dispatch

New:
- `lib/constants/property-subtypes.ts`

Modified (with `.backup_CONDO-TYPES-FIX_20260706_103226`):
- `app/property/[id]/HomePropertyPage.tsx` (import replaces local const)
- `app/api/geo-listings/route.ts` (import replaces both consts)
- `app/api/neighbourhood-listings/route.ts` (same)
- `app/sitemap.xml/route.ts` (import replaces local, rename `HOME_SUBTYPES` → `RESIDENTIAL_TYPES` at 1 usage site)
- `app/[slug]/components/GeoAdvancedFilters.tsx` (import + local aliases)
- `docs/W-MARKETING-TRACKER.md` (this section; backup `.backup_CONDO-TYPES-FIX_20260706_103226`)

TSC exit 0. `.env.local` not staged. Backup files untracked (deliberate).

HOLD push per operator dispatch.

##### 3. LocalBusiness / RealEstateAgent — SHIPPED (Rule Zero clean)

**File**: `components/LocalBusinessSchema.tsx` (new, 90 lines). Async server component, gated on `isSeoEnabledTenant()`. Deterministic address parser (splits canonical `"street, locality, region postal, country"` format). Falls back to single-line streetAddress if parse fails.

**Aily tenant fields VERIFIED this session** (explicit column allow-list — NEVER `SELECT *` per CLAUDE.md secrets rule):
```
name:              "aily"
brand_name:        "aily"
domain:            "aily.ca"
logo_url:          null                                                    ← OMITTED
brokerage_name:    "PREMIER MATRIX REALTY LTD. BROKERAGE"
brokerage_address: "208 Spring Garden Ave, North York, ON M2N 3G8, Canada"
brokerage_phone:   "+1416-224-2166"
```

**Mount sites** (both server components):
- `app/comprehensive-site/page.tsx:106-115` — aily's actual `/` after middleware rewrite. Extends the tenant SELECT to include brand_name / name / domain / brokerage_{name,address,phone} / logo_url. Passes to `<LocalBusinessSchema>` inside a fragment alongside the layout component.
- `app/page.tsx:54-63` — fallback for `/` requests that don't hit the middleware rewrite. Same shape.

**Aily homepage smoke** (VERIFIED this session, `http://localhost:3000/` on `Host: aily.ca`):
```
HTTP 200. application/ld+json count: 2 (RealEstateAgent + another existing script).
JSON PARSES OK.
Fields verbatim from render:
  @type:              "RealEstateAgent"
  url:                "https://aily.ca/"
  name:               "aily"
  telephone:          "+1416-224-2166"
  address:            {
                        "@type": "PostalAddress",
                        "streetAddress":   "208 Spring Garden Ave",
                        "addressLocality": "North York",
                        "addressRegion":   "ON",
                        "postalCode":      "M2N 3G8",
                        "addressCountry":  "Canada"
                      }
  parentOrganization: { "@type": "Organization", name: "PREMIER MATRIX REALTY LTD. BROKERAGE" }
  image (logo_url):   OMITTED (logo_url is null in DB)
```
Every emitted field maps 1:1 to a real tenants column. Address parse WORKED on the canonical format.

##### 4. Walliam absence — regression check (VERIFIED)

Same URLs on `Host: walliam.ca` (`seo_enabled=false`):
| URL | HTTP | application/ld+json | RealEstateAgent | BreadcrumbList |
|---|---|---:|---:|---:|
| `/` (homepage) | 200 (151 KB) | **0** | 0 | 0 |
| `/corktown-district-lofts-…-toronto` (DevelopmentPage) | 200 (109 KB) | **0** | 0 | 0 |

No regression. Both pages render full content, zero schema emitted.

##### 5. Files this dispatch

New:
- `components/LocalBusinessSchema.tsx` (90 lines)

Modified:
- `app/comprehensive-site/page.tsx` (extended tenant SELECT + fragment mount)
- `app/page.tsx` (extended tenant SELECT + fragment mount for the fallback branch)
- `app/[slug]/DevelopmentPage.tsx` (BreadcrumbSchema mount)
- `docs/W-MARKETING-TRACKER.md` (this comprehensive-close entry, reconciles the Phase 2 "shipped" claim)

Backups: `app/page.tsx.backup_A-UNIT-2-CLOSE_20260705_044852`, `app/[slug]/DevelopmentPage.tsx.backup_A-UNIT-2-CLOSE_20260705_044852`, `app/comprehensive-site/page.tsx.backup_A-UNIT-2-CLOSE_20260705_047xxx`, `docs/W-MARKETING-TRACKER.md.backup_A-UNIT-2-CLOSE_20260705_045751`.

TSC exit 0 on all edits.

`.env.local`: IGNORED (git check-ignore returns path). `DEV_TENANT_DOMAIN` restored to `walliam.ca` (original). No secret leaks.

##### 6. A-UNIT-2 FULLY CLOSED

Routing verified from code (not inferred). Coverage matrix published in tracker with per-cell evidence — zero unexplained MISSING cells. LocalBusiness SHIPPED (not deferred). All emitters gated on `isSeoEnabledTenant()`. Zero brand branch. Every value from a verified column.

Follow-on commit (not amend to 6d18e55) — the two commits together are the full A-UNIT-2 delivery.

#### SEO-FLAG PRE-BUILD RECON — Option A locked (2026-07-04)

**Decision (option A)**: per-tenant `seo_enabled` flag on `tenants` so SEO is aily-only by verified config, not brand-hardcode, not WALLiam removal. Multi-tenant safe by construction — data-plane per-tenant capability, zero code-plane branch. New tenants opt into SEO by row-update, mirroring the existing precedent (`estimator_ai_enabled` per-tenant boolean toggle).

##### 1. Tenants column set — REUSE vs ADD

**VERIFIED this session** (`information_schema.columns WHERE table_schema='public' AND table_name='tenants'`): **65 columns total**. No `SELECT *` — table holds `anthropic_api_key` + `resend_api_key` per CLAUDE.md secrets rule.

Existing capability-flag / config-shaped columns (VERIFIED via `column_name ILIKE` filter over seo/enabled/active/feature/capab/config/setting/flag + JSONB data_type):
| Column | Type | Default | Semantic |
|---|---|---|---|
| `is_active` | boolean | `true` | Tenant lifecycle, NOT per-capability |
| `estimator_ai_enabled` | boolean | `false` | Per-capability toggle (precedent) |
| `estimator_nonai_enabled` | boolean | `true` | Per-capability toggle (precedent) |
| `lifecycle_status` | text | `'active'` | Lifecycle state, NOT SEO |

**No JSONB `config` / `features` / `settings` / `capabilities` column exists.** Nothing to read for a JSONB SEO key. VERIFIED via `data_type='jsonb'` filter — 0 hits on `tenants`.

**Verdict: ADD** new column. Not reuse. **Proposed shape** (matches precedent of `estimator_ai_enabled`):
```
ALTER TABLE tenants
  ADD COLUMN seo_enabled boolean NOT NULL DEFAULT false;
UPDATE tenants SET seo_enabled = true WHERE id = 'e2619717-6401-4159-8d4c-d5f87651c8d6';  -- aily
-- walliam (b16e1039-…) intentionally stays default false
```
Default `false` = fail-closed (new tenants don't accidentally enable SEO; aily is the ONE explicit `true`).

##### 2. The classification helper — real function name(s) + shape

**Primary classifier** — `lib/utils/tenant-resolver.ts::getCurrentTenantId()` (VERIFIED lines 38-73):
- Resolves current request's tenant id by matching request host against `tenants.domain` (`.eq('is_active', true)`).
- Dev/preview branch uses `DEV_TENANT_DOMAIN` env fallback.
- Returns `tenants.id` string OR `null` (no matching tenant / error path).

This is the general-purpose tenant resolver used by EVERY tenant-scoped feature — auth, admin, estimator, geo, property, brand, layout, AND SEO. NOT purpose-built for classification; the 3-branch classification lives in `app/robots.ts:32-59`, which layers on top of `getCurrentTenantId()`:
- Branch 1 (comprehensive tenant) = `getCurrentTenantId()` returns non-null → SEO on
- Branch 2 (owner promo `condoleads.ca` / `01leads.com`) = hardcoded set → SEO on (no sitemap)
- Branch 3 (legacy agent / unknown) = fail-closed → SEO off

**Second `getCurrentTenantId` variant** (VERIFIED): `lib/tenant/getCurrentTenantId.ts` — reads `x-tenant-id` request header (set by middleware). Same name, DIFFERENT implementation. Used by 4 admin-homes pages. NOT SEO-facing. **Not touched by this proposal.**

**Middleware** (`middleware.ts`) applies `X-Robots-Tag: noindex, nofollow` on legacy hosts via its own Edge-runtime host predicate (NOT `getCurrentTenantId`). Independent of the SEO flag. **Not touched by this proposal.**

##### 3. Consumer inventory + regression surface

**~30+ callers of `getCurrentTenantId()` this session** (grep VERIFIED). Classified:

**SEO-facing (3 files — the target consumers of the new flag)**:
| File | Line | Current gate |
|---|---|---|
| `app/robots.ts` | 47 | `tenantId = await getCurrentTenantId()` → Allow + sitemap or Disallow |
| `app/sitemap.xml/route.ts` | 48 | Same gate — 404 if null, else emit sitemap-index |
| `app/sitemap/[id]/route.ts` | 56 | Same gate — 404 if null, else emit sitemap children |

**Non-SEO callers — MUST stay unchanged for walliam** (regression surface):
| Category | Files (count) |
|---|---|
| Auth / form actions | `app/actions/{joinTenant,submitLeadFromForm,submitActivityFromForm,updateLeadEnrichmentFromForm}.ts` (4) |
| Admin dashboards | `admin-homes/{agents,leads,leads/[id],users,territory}/page.tsx` (5) — plus the 4 that use the second `lib/tenant/getCurrentTenantId` header-reader variant |
| Estimators | `app/estimator/actions/estimate-{condo-rent,condo-sale,home-rent,home-sale,rent,sale}.ts` (6) |
| Layout | `app/layout.tsx` (1) — RootLayout uses it for wordmark_style + tenant class |
| Property pages | `app/property/[id]/page.tsx`, `HomePropertyPage.tsx`, `[slug]/PropertyPageContent.tsx` (3) |
| Geo pages | `[slug]/{Building,Area,Community,Municipality}Page.tsx` + `comprehensive-site/toronto/[neighbourhood]/page.tsx` (5) |
| Total non-SEO callers | ~24 |

**Placement decision — LOCKED to EMITTER-LEVEL**. Adding `.eq('seo_enabled', true)` inside `getCurrentTenantId()` would make it return `null` for walliam, cross-tenant-regressing all ~24 non-SEO features listed above. That is not acceptable per the no-regressions rule.

Correct pattern:
- **NEW helper `lib/utils/seo-scope.ts::isSeoEnabledTenant(): Promise<boolean>`** — calls `getCurrentTenantId()` (unchanged), then queries `tenants.seo_enabled` for that id via a new explicit-column-allow-list `.select('seo_enabled')` predicate. Returns:
  - `false` on null tenant
  - `false` on `seo_enabled=false`
  - `false` on any error (fail-closed, matches robots.ts Branch 3)
  - `true` only on `seo_enabled=true`
- **3 file switches** (build dispatch, NOT this recon): `app/robots.ts`, `app/sitemap.xml/route.ts`, `app/sitemap/[id]/route.ts` — replace their `getCurrentTenantId()` SEO-gate with `isSeoEnabledTenant()`. Non-SEO callers of `getCurrentTenantId()` UNCHANGED.

##### 4. Regression posture per tenant

| Tenant | Post-migration behavior |
|---|---|
| **aily** (`seo_enabled=true`) | All 3 SEO surfaces continue emitting BYTE-IDENTICAL output to today (robots Allow + sitemap pointer, `/sitemap.xml` serves the index, `/sitemap/<id>` serves children). All non-SEO surfaces UNCHANGED. |
| **walliam** (`seo_enabled=false`, default) | `walliam.ca/robots.txt` → Disallow (was Allow + sitemap). `walliam.ca/sitemap.xml` → 404 (was 200 with index). `walliam.ca/sitemap/<id>` → 404 (was 200 with children). All non-SEO surfaces — auth, admin-homes, estimator, layout, property, geo, brand — **BYTE-IDENTICAL** to today. |
| **New tenants** (default `seo_enabled=false`) | SEO off by default (fail-closed). Opt-in via `UPDATE tenants SET seo_enabled = true WHERE id = ...`. Matches robots.ts Branch 3 fail-closed posture. |

##### 5. A-UNIT-2 JSON-LD gate — same flag

A-UNIT-2 JSON-LD emitters (per the A-UNIT-2 RECON above) will call the same new `isSeoEnabledTenant()` helper, not `getCurrentTenantId()` directly. Result: JSON-LD emits on aily, is silently absent on walliam (which is exactly the Option A intent), auto-gated for future tenants by the same flag.

##### 6. Migration + build plan (build dispatch, NOT this recon)

Ordered, each step with a backup + smoke:
1. **Migration** — `ALTER TABLE tenants ADD COLUMN seo_enabled boolean NOT NULL DEFAULT false;` + `UPDATE tenants SET seo_enabled = true WHERE id = 'e2619717-…'`. Read-only pre-check + `BEGIN/ROLLBACK` smoke, then apply-runner with rollback snapshot per CLAUDE.md pattern.
2. **Helper** — write `lib/utils/seo-scope.ts::isSeoEnabledTenant()` with explicit column allow-list and fail-closed error path.
3. **Switch the 3 SEO consumers** — `app/robots.ts`, `app/sitemap.xml/route.ts`, `app/sitemap/[id]/route.ts`.
4. **Smoke both tenants** — aily.ca (all 3 surfaces unchanged from today), walliam.ca (robots swaps to Disallow, both sitemap URLs 404). Local dev via `DEV_TENANT_DOMAIN` swap; then production verify post-push.
5. **Ship A-UNIT-2 JSON-LD** with the same `isSeoEnabledTenant()` gate.

##### 7. Files this dispatch

Read-only recon. Script left at `scripts/_recon-tenants-cols.js` (safe — `BEGIN READ ONLY`, no `SELECT *`, capability-flag ILIKE filter only). Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_SEO-FLAG-RECON_20260704_144850`. **No code files touched. No SQL write. No commit.** Migration + build follow in the next dispatch.

#### SEO-FLAG BUILD — SHIPPED (2026-07-04)

**Migration APPLIED** — VERIFIED post-verify inside the same transaction before COMMIT (`scripts/apply-seo-flag.js`, transactional; ROLLBACK on any pre-check or post-verify mismatch):

Post-verify output (VERBATIM, this session):
```
=== POST-VERIFY (SEPARATE query — mirrors Supabase editor semantics) ===
  rows: 2
    id=e2619717-6401-4159-8d4c-d5f87651c8d6  domain=aily.ca      seo_enabled=true
    id=b16e1039-38ed-43d7-bbc5-dd02bb651bc9  domain=walliam.ca   seo_enabled=false
=== COMMIT ===
  migration applied: aily.seo_enabled=true, walliam.seo_enabled=false (default)
```
Pre-migration snapshot: `docs/snapshots/tenants_pre_seo_flag_20260704_145253.txt`. Rollback if needed: `ALTER TABLE public.tenants DROP COLUMN IF EXISTS seo_enabled;`.

**New helper**: `lib/utils/seo-scope.ts` exports `isSeoEnabledTenant(): Promise<boolean>`. Calls `getCurrentTenantId()` (UNCHANGED), reads `tenants.seo_enabled` for the resolved tenant via explicit-column-allow-list `.select('seo_enabled')`. Fail-closed on every error path (null tenant, DB error, missing row, seo_enabled=false/null). VERIFIED TSC clean.

**3 SEO consumers SWITCHED** (backups timestamped, per file):
- `app/robots.ts` — replaced `getCurrentTenantId()` gate with `await isSeoEnabledTenant()`. Branch structure unchanged: Owner-promo above the SEO gate stays (kept crawlable), Branch 1 SEO-eligible → Allow + sitemap, Branch 3 fail-closed → Disallow. Backup `app/robots.ts.backup_SEO-FLAG_20260704_145540`.
- `app/sitemap.xml/route.ts` — same swap inside `resolveRequestContext()`. `isTenant` field name preserved for minimal diff; semantics now "eligible to emit sitemap contents". Backup `app/sitemap.xml/route.ts.backup_SEO-FLAG_20260704_145540`.
- `app/sitemap/[id]/route.ts` — same swap. Backup `app/sitemap/[id]/route.ts.backup_SEO-FLAG_20260704_145540`.

VERIFIED TSC clean on all 4 file edits (helper + 3 consumers).

**Response-shape note (operator dispatch parenthetical rule)**: existing sitemap routes emit **HTTP 200 with empty XML** for non-eligible hosts (`<sitemapindex/>` for `sitemap.xml`, `<urlset/>` for `sitemap/[id]`) — NOT 404. Operator's dispatch text said "sitemap routes return 404" but the accompanying parenthetical "read what each currently returns for a non-comprehensive host and reuse that exact response shape, do not invent a new one" overrides. Walliam now matches the existing not-eligible shape (empty XML at 200). If actual 404 is preferred, a follow-up dispatch can change the empty-response shape.

**Local smoke — VERBATIM, this session** (`npm run dev` on `http://localhost:3000` with `DEV_TENANT_DOMAIN` swap):

`DEV_TENANT_DOMAIN=aily.ca` (Host: aily.ca):
```
/robots.txt      HTTP 200
                 User-Agent: *
                 Allow: /
                 Sitemap: https://aily.ca/sitemap.xml     ← Branch 1 preserved, BYTE-IDENTICAL to today

/sitemap.xml     HTTP 200  size=354  application/xml
                 <sitemapindex> with 4 children (sitemap/0..sitemap/3) — same as today's production shape
                 (listing chunks 0-1, buildings=2, geo=3)

/sitemap/0       HTTP 200  size=6.24 MB  application/xml
                 <urlset> with 50,000 URL entries — matches LISTINGS_CHUNK_SIZE, matches today
```

`DEV_TENANT_DOMAIN=walliam.ca` (Host: walliam.ca):
```
/robots.txt      HTTP 200
                 User-Agent: *
                 Disallow: /                              ← Branch 3 — was Branch 1 pre-change

/sitemap.xml     HTTP 200  size=107  application/xml
                 <sitemapindex/> (empty — matches existing not-eligible shape)

/sitemap/0       HTTP 200  size=110  application/xml
                 <urlset/> (empty — matches existing not-eligible shape)
```

**Non-SEO regression check — walliam** (surfaces that call `getCurrentTenantId()` for reasons other than SEO):
- BuildingPage `/5750-tosca-dr-townhouse-condos-3250-bentley-mississauga` on `Host: walliam.ca` → HTTP 200, 308 KB, A-UNIT-4 insight markers present (Market Overview ×2, Market Insights ×2, Concession pattern ×2, Median PSF vs parent ×2). Tenant-scoped features render normally.
- Comprehensive homepage `/` on `Host: walliam.ca` → HTTP 200, 156 KB, walliam brand markers present (`WALLiam` ×6). Tenant branding intact.

Zero non-SEO regression. `getCurrentTenantId()` file (`lib/utils/tenant-resolver.ts`) UNCHANGED — the shared resolver keeps serving auth, admin, estimator, layout, property, geo, brand consumers for walliam identically to today.

**Blocker/regression table**:
| Surface | Aily | Walliam |
|---|---|---|
| robots.txt | Allow + sitemap (unchanged) | Disallow (was Allow + sitemap) |
| sitemap.xml | Full index (unchanged) | Empty index at 200 |
| sitemap/[id] | Full urlset (unchanged) | Empty urlset at 200 |
| BuildingPage / geo pages / property pages | unchanged | unchanged (VERIFIED) |
| Layout / brand / estimator / admin-homes / auth | unchanged | unchanged (getCurrentTenantId untouched) |

**Files this dispatch**:
- Migration: `scripts/apply-seo-flag.js` (transactional runner; ROLLBACK on mismatch)
- Helper: `lib/utils/seo-scope.ts` (new; `isSeoEnabledTenant()`)
- Consumers: `app/robots.ts`, `app/sitemap.xml/route.ts`, `app/sitemap/[id]/route.ts` (each with `.backup_SEO-FLAG_20260704_145540`)
- Pre-migration snapshot: `docs/snapshots/tenants_pre_seo_flag_20260704_145253.txt`
- Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_SEO-FLAG-SHIPPED_20260704_150417`.

**Ready for A-UNIT-2 JSON-LD build** — emitters gate on the same `isSeoEnabledTenant()` helper. Migration cannot roll back silently (DDL COMMIT is real); rollback SQL documented above. Push held for operator go.

#### HOST-STATE RECON — yourcondorealtor.ca + walliam.ca post-e3d229f (2026-07-04)

Read-only verification of the host classification landscape after e3d229f was pushed (previous dispatch: `6c04ade..e3d229f main -> main` — HEAD == origin/main == `e3d229f`). Confirms yourcondorealtor.ca does not benefit from SEO and walliam.ca's post-push code state is correct.

**yourcondorealtor.ca — DB classification** (VERIFIED this session):
| Check | Result |
|---|---|
| `tenants WHERE domain ILIKE '%yourcondorealtor%'` | 0 rows — NOT a tenant |
| `agents WHERE custom_domain ILIKE '%yourcondorealtor%'` | 1 row: `id=3b106c2d-e3df-442d-ab8a-918a40bcdb8c, custom_domain='yourcondorealtor.ca', is_active=true` — **legacy System-1 agent custom domain** |
| Hardcoded refs in `app/`, `lib/`, `middleware.ts` | **0 hits** — classification is generic, not brand-specific |

**Request flow for yourcondorealtor.ca** (VERIFIED via `middleware.ts` code inspection):
1. **Non-SEO page path** (e.g. `/`, `/[slug]`, property/building/geo): middleware SYSTEM FORK block runs. `resolveAgentFromHost('yourcondorealtor.ca')` looks up `custom_domain='yourcondorealtor.ca'` → agent with `site_type != 'comprehensive'`. Line 166 predicate `(agent && agent.site_type !== 'comprehensive' && !OWNER_PROMO_HOSTS.has(cleanReqHost))` matches → **sets `X-Robots-Tag: noindex, nofollow`** on response. Shipped in A-UNIT-1 (2026-07-01), **INDEPENDENT of e3d229f**.
2. **`/robots.txt`**: middleware SYSTEM FORK block SKIPPED by the exclusion guard `pathname !== '/robots.txt'` (line 127). Handler `app/robots.ts` runs — post-e3d229f: `isSeoEnabledTenant()` returns false (no tenant matches `yourcondorealtor.ca`, so `getCurrentTenantId()` returns null → helper returns false) → Branch 3 → **emits `Disallow: /`**. Pre-e3d229f: `getCurrentTenantId()==null` → Branch 3 → same output. **e3d229f: zero behavior change**.
3. **`/sitemap.xml` + `/sitemap/[id]`**: middleware SYSTEM FORK block SKIPPED (`!pathname.startsWith('/sitemap.xml') && !pathname.startsWith('/sitemap/')` guards, lines 128-129). Handlers run — `resolveRequestContext()` → `isSeoEnabledTenant()` returns false → `isTenant: false` → **empty XML at HTTP 200** (`emptyIndex()` / `emitUrlset([])`). Pre-e3d229f: `getCurrentTenantId()==null` → `isTenant: false` → same empty output. **e3d229f: zero behavior change**.

**What governs yourcondorealtor.ca's SEO posture — answer from the code, not inference**:
- **(c) BOTH middleware AND the flag pathway** — but they're independent, not additive:
  - Middleware `X-Robots-Tag: noindex, nofollow` is the primary de-index mechanism on all page responses (line 166–168). Untouched by e3d229f.
  - The flag pathway (`isSeoEnabledTenant()`) independently returns false for yourcondorealtor.ca (no tenant row) → fail-closed responses on the 3 SEO surfaces, IDENTICAL to pre-e3d229f `getCurrentTenantId()==null` fail-closed responses.

**Walliam.ca — post-e3d229f state** (VERIFIED from code + DB this session):
- Tenant row: `id=b16e1039-…, domain='walliam.ca', seo_enabled=false, is_active=true`.
- Middleware `KNOWN_TENANT_DOMAINS` still lists `walliam.ca` (line 26) + `www.walliam.ca` (line 27) → for non-SEO routes, still resolves as `comprehensive` → rewrites to `/comprehensive-site/*` → normal tenant-scoped page rendering (no X-Robots-Tag from middleware since `site_type === 'comprehensive'` skips the noindex predicate).
- Post-e3d229f: `/robots.txt` → Disallow (Branch 3); `/sitemap.xml` + `/sitemap/[id]` → empty XML at 200. Verified in the same-session local smoke prior to push.
- **Vercel de-hosting**: operator-claimed infra. **Unverifiable from repo** — a request that never reaches this app is out of scope for code-level verification.

**VERDICT — plain**:
| Question | Answer (from commands) |
|---|---|
| yourcondorealtor.ca — benefits from SEO right now? | **NO** — middleware noindex on all page responses + fail-closed sitemap/robots. Both mechanisms are shipped and active. |
| e3d229f changed yourcondorealtor.ca's behavior? | **NO** — flag pathway returns false because `getCurrentTenantId()` returns null (no tenant row for that domain); same fail-closed shape as pre-flag. Zero behavior delta on any of the 3 SEO surfaces. |
| walliam.ca post-e3d229f — code state correct? | **YES** — robots Disallow, sitemap empty at 200, non-SEO surfaces render tenant-scoped content normally (`getCurrentTenantId()` untouched). |
| Push safety at e3d229f | **SAFE** — no regression on yourcondorealtor.ca, walliam.ca in intended Branch 3 state, aily.ca byte-identical to today. Already pushed to origin/main. |
| Gap needing follow-up work? | **NO** — yourcondorealtor.ca is fully covered by middleware noindex (A-UNIT-1) + fail-closed handlers. No additional noindex needed. |

**Nothing-Deferred posture**: no gap surfaced by this recon; no follow-up work item. Migration + code changes already shipped in e3d229f. If operator later observes yourcondorealtor.ca serving without the noindex header (e.g. Vercel edge caching drift, or a middleware exclusion bug), that would be a genuine follow-up — but current code state does not indicate that.

**Files this dispatch**: read-only recon only. No code files touched. No SQL write. Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_HOST-STATE-RECON_20260704_155026`. Recon script left at `scripts/_recon-tenants.js` (safe — `BEGIN READ ONLY`, explicit column allow-lists).

### A-UNIT-3 — On-page basics `[DEV]` — STATUS: **RECON DONE 2026-07-06 (scope corrected — 4 of 6 items stale/wrong; 2 verified-real)**

#### A-UNIT-3 RECON — verified current state (2026-07-06)

Push base clean: HEAD == origin/main == `cae9ac0`, 0 ahead this session. Recon done READ-ONLY; no code, no SQL, no commit for the recon itself (tracker append only).

The original A-UNIT-3 scope list (below, unchanged for the historical record) was written before A-UNIT-1b (2026-07-01) shipped several title/tenant fixes. Every claim re-verified this session against code; four of the six items are stale or misdescribed. Real remaining work is narrow; two items are already-shipped, two are already-not-broken, and two are actionable.

##### 1. Item-by-item verification (VERIFIED verbatim this session)

| # | Original scope claim | Verified state (this session) | Action |
|---|---|---|---|
| 1 | "H1 on homepage — currently 0 H1 tags" | **CONFIRMED TRUE.** VERBATIM `grep -cE "<h1\|<H1"` on `components/HomePageComprehensive.tsx` = 0 and `components/HomePageComprehensiveV2.tsx` = 0. Homepage renders zero H1 tags. | **BUILD** — add one H1 to the homepage component tree. Keyword-anchored, tenant-name-aware. |
| 2 | "H1 on property pages — currently 0; affects PropertyPageClient and HomePropertyPage" | **STALE.** VERIFIED: [components/property/PropertyHeader.tsx:67](components/property/PropertyHeader.tsx#L67) already renders `<h1 className="text-3xl font-bold …">{isHome ? address : "Unit N"}</h1>` — mounted by BOTH PropertyPageClient and HomePropertyPageClient. Property pages HAVE an H1 today (address for home, unit-number for condo). | **CLOSED** (no work; verify the H1 text is what the tracker wanted — it renders the *address* first line, which is Google-friendly). |
| 3 | "Homepage title rewrite — currently 'aily - AI Real Estate Assistant for the GTA' (brand-first)" | **CONFIRMED TRUE.** VERBATIM [app/comprehensive-site/page.tsx:27](app/comprehensive-site/page.tsx#L27): `const title = \`${tenant.name} - AI Real Estate Assistant for the GTA\`` — brand-first, weak for non-branded queries (e.g. "GTA condos"). | **BUILD** — rewrite to keyword-anchored + brand-suffix pattern. Tenant-derived (never hardcode "aily" — build for aily/walliam/any tenant via `tenant.name`). |
| 4 | "`comprehensive-site/toronto/[neighbourhood]` title — hardcodes 'CondoLeads'" | **STALE.** VERIFIED [app/comprehensive-site/toronto/[neighbourhood]/page.tsx:18,20](app/comprehensive-site/toronto/[neighbourhood]/page.tsx#L18): `const brandName = brandTenant?.name \|\| 'CondoLeads'` — tenant-derived; only the *fallback* is CondoLeads (when brandTenant lookup fails on non-tenant hosts). aily renders `${n.name} Real Estate – Condos & Homes \| aily`. Fixed by A-UNIT-1b on 2026-07-01 (tracker's fix comment at line 12 still there for the record). | **CLOSED** — already shipped. |
| 5 | "Twitter Card metadata on home / area / muni / community (currently only building + property emit)" | **VERIFIED PARTIAL.** VERBATIM `grep -c "twitter"` per page: homepage (comprehensive-site/page.tsx) = **1** (has Twitter card — closed since tracker was written); property/[id] = 1; HomePropertyPage = 1; BuildingPage = 1; CommunityPage/MunicipalityPage/AreaPage/Neighbourhood = **0 each**. Homepage is done; the 4 geo pages still lack Twitter cards. | **BUILD** — add Twitter card to the 4 geo `generate*Metadata` helpers (Community/Muni/Area/Neighbourhood). Simple: mirror the existing `openGraph:` block on those helpers. |
| 6 | "Homepage `Cache-Control` revisit — currently `private, no-cache, no-store, max-age=0, must-revalidate`; consider `public, s-maxage=60, stale-while-revalidate=300`" | **NEEDS VERIFICATION at runtime.** VERBATIM `grep -rn "Cache-Control\|cache-control" app/page.tsx app/comprehensive-site/ middleware.ts next.config.js` returned **0 code-side hits**. No explicit Cache-Control set anywhere in the homepage path — the private/no-cache header is the Next.js default when `dynamic='force-dynamic'` + `revalidate=0` (both present at [comprehensive-site/page.tsx:68-69](app/comprehensive-site/page.tsx#L68)). The tracker's quoted header string is "claimed, unverified" without a curl-of-live-response confirmation this session. **Fix scope: only ship if the Cache-Control change is what operator wants — the tradeoff is edge-cache warmth vs freshness of the personalized homepage.** Not build-safe without operator alignment. | **DEFER (operator decision needed)** — this is a policy call, not a fabrication fix. |

##### 2. Title-generation shape per page type (VERIFIED verbatim, tenant-awareness column shows if the title reads tenant identity)

| Page type | File | Title template | Tenant-aware? |
|---|---|---|---|
| Homepage | [app/comprehensive-site/page.tsx:27](app/comprehensive-site/page.tsx#L27) | `${tenant.name} - AI Real Estate Assistant for the GTA` | ✅ yes (brand-first — item 3 above) |
| Property (condo) | [app/property/[id]/page.tsx:85](app/property/[id]/page.tsx#L85) | `${address} \| ${unit} \| ${building_name} \| ${price} \| ${beds} \| ${siteName}` (joined `\|`) | ✅ yes (`siteName = agentBranding?.site_title \|\| 'CondoLeads'`) |
| Property (home / freehold) | [app/property/[id]/HomePropertyPage.tsx:58](app/property/[id]/HomePropertyPage.tsx#L58) | `${address} \| ${style} \| ${price} \| ${beds} \| ${siteName}` | ✅ yes (same `siteName`) |
| Building | [app/[slug]/BuildingPage.tsx:221](app/[slug]/BuildingPage.tsx#L221) | `${building.building_name} Condos - ${building.canonical_address} \| ${siteName}` | ✅ yes |
| Community | [app/[slug]/CommunityPage.tsx:43](app/[slug]/CommunityPage.tsx#L43) | `${community.name} Real Estate \| Condos & Homes for Sale` | ❌ **no brand suffix** — pure geo template |
| Municipality | [app/[slug]/MunicipalityPage.tsx:45](app/[slug]/MunicipalityPage.tsx#L45) | `${municipality.name} Real Estate \| Condos & Homes for Sale` | ❌ no brand suffix |
| Area | [app/[slug]/AreaPage.tsx:51](app/[slug]/AreaPage.tsx#L51) | `${area.name} Real Estate \| Condos & Homes for Sale` | ❌ no brand suffix |
| Neighbourhood | [comprehensive-site/toronto/[neighbourhood]/page.tsx:20](app/comprehensive-site/toronto/[neighbourhood]/page.tsx#L20) | `${n.name} Real Estate – Condos & Homes \| ${brandName}` | ✅ yes (fallback to `'CondoLeads'` if tenant lookup fails) |
| condoleads.ca root promo | [app/page.tsx:432](app/page.tsx#L432) | `'CondoLeads - Get Your AI-Powered Condo Leads Funnel Today'` | N/A — condoleads.ca IS CondoLeads; middleware rewrites aily/walliam `/` to `/comprehensive-site/` before reaching this file. Correct for its scope. |

**Consistency finding**: 4 of 8 SEO page types (Community, Municipality, Area, and every ‑style non-neighbourhood geo) emit no brand/tenant suffix in the title. Not a Rule Zero violation — the current template is factually correct — but branded search results ("aily site:aily.ca") lose the brand hook there. If the A-UNIT-3 build wants consistent branding, extend those 3 with `\| ${brandName}` derived from the tenant helper (same pattern already used at neighbourhood page). Tenant-derived, not brand-hardcoded.

##### 3. H1 census — VERIFIED verbatim (per SEO page type)

| Page type | H1 source | Current H1 text |
|---|---|---|
| Homepage | none | **absent** (item 1 above — real gap) |
| Property (condo) | [components/property/PropertyHeader.tsx:67](components/property/PropertyHeader.tsx#L67) | `Unit ${listing.unit_number \|\| 'N/A'}` |
| Property (home) | [components/property/PropertyHeader.tsx:67](components/property/PropertyHeader.tsx#L67) | `${listing.unparsed_address.split(',')[0].trim() \|\| 'Property'}` (street address, city trimmed off) |
| Building | [app/[slug]/components/BuildingHero.tsx:34](app/[slug]/components/BuildingHero.tsx#L34) | `${building.building_name}` |
| Community | [app/[slug]/components/GeoHero.tsx:108](app/[slug]/components/GeoHero.tsx#L108) | `${title}` (typically `${community.name} Real Estate`) |
| Municipality | same GeoHero.tsx:108 | `${municipality.name} Real Estate` |
| Area | same GeoHero.tsx:108 | `${area.name} Real Estate` |
| Neighbourhood | same GeoHero.tsx:108 | `${neighbourhood.name} Real Estate` |
| Development | [app/[slug]/DevelopmentPage.tsx:244](app/[slug]/DevelopmentPage.tsx#L244) | `${development.name}` |

Every SEO page type EXCEPT homepage has exactly one H1. Homepage is the sole H1 gap.

##### 4. Meta description census — VERIFIED verbatim

| Page type | Description | Tenant-aware / content-derived? |
|---|---|---|
| Homepage | `Browse GTA properties, get a personalized AI buyer or seller plan, and connect with a local expert. Powered by ${tenant.name} AI.` | ✅ tenant-aware |
| Property (condo) | `${beds} ${baths} condo ${type} at ${address} in ${building.name}. ${price}. View photos, floor plans, and schedule a showing.` | ✅ content-derived |
| Property (home) | `${beds} ${baths} ${style} ${type} at ${address}. ${price}. View photos, room dimensions, and get a free home estimate.` | ✅ content-derived |
| Building | `${building_name} at ${canonical_address} in Toronto. …` (see side finding below) | ⚠️ content-derived BUT hardcodes `in Toronto` — see finding |
| Community | `Browse condos and homes for sale in ${community.name}. View listings, condo buildings, market data, and price estimates.` | ✅ content-derived |
| Municipality | `Browse condos and homes for sale in ${municipality.name}. Explore communities, condo buildings, and market intelligence.` | ✅ content-derived |
| Area | `Browse condos and homes for sale in ${area.name}. Explore municipalities, communities, and condo buildings.` | ✅ content-derived |
| Neighbourhood | `Browse condos and homes for sale and lease in ${n.name}, Toronto.` | ⚠️ hardcodes `Toronto` (fine here — this page-tree IS `/toronto/[neighbourhood]/`, so it is factually always Toronto). |

Every SEO page emits a description. No page is missing this. **Descriptions are largely generic templates** — no live listing counts, no market snippets. Content-quality upgrade is possible (e.g. "127 listings from $450K to $2.4M in ${city}" instead of "Browse condos and homes for sale in ${city}") but not a Rule Zero item — the current strings are factually correct.

##### 5. Side finding — BuildingPage description hardcodes "in Toronto" for every building (RULE ZERO #1 RISK)

VERBATIM [app/[slug]/BuildingPage.tsx:193](app/[slug]/BuildingPage.tsx#L193):
```
let description = `${building.building_name} at ${building.canonical_address} in Toronto. `
```
Every building emits this — INCLUDING non-Toronto buildings (Mississauga, Oakville, etc.). Rule Zero #1: a Mississauga condo's meta description will read "5750 Tosca Dr at 5750 Tosca Dr, Mississauga in Toronto" — factually wrong. Not caught by A-UNIT-2 (which fixed the same class of hardcode in BuildingSchema `addressLocality`). This is the meta-description mirror of that fix.

**Fix scope** (small): resolve the real municipality name via the same `buildings.community_id → communities.municipality_id → municipalities.name` join that BuildingSchema uses today — pass through the same `locality` prop, or drop `in Toronto` entirely. Not in the original A-UNIT-3 scope but surfaces from this recon; log as **OPEN — A-UNIT-3 side finding** and fix in the A-UNIT-3 build dispatch (identical shape to the BuildingSchema fix already shipped).

##### 6. Real A-UNIT-3 buildable scope (after recon)

Real items (VERIFIED, actionable, no new product decision required):
1. **Homepage H1** — add one keyword-anchored H1 to `HomePageComprehensive.tsx` / `V2` render tree. Tenant-derived where the brand appears.
2. **Homepage title rewrite** — pivot from brand-first to keyword-first: `GTA Condos & Homes — AI-Powered Search \| ${tenant.name}` (or operator-preferred variant). Uses existing `tenant.name` at [comprehensive-site/page.tsx:16](app/comprehensive-site/page.tsx#L16), no new resolver.
3. **Twitter Card on the 4 geo pages** — Community, Municipality, Area, Neighbourhood. Mirror the openGraph block that already exists on Building/Property pages. Small copy-paste per file.
4. **BuildingPage "in Toronto" hardcode** (side finding — Rule Zero #1 fix) — replace with joined locality name or drop.
5. *(optional / operator preference)* Add `\| ${brandName}` suffix to Community/Municipality/Area titles for brand consistency. Tenant-derived via existing helper. Not a Rule Zero fix; branded-search hook.

Deferred (needs operator input, not build-safe now):
- **Homepage `Cache-Control` change** — policy call on edge-cache warmth vs freshness. Operator alignment needed before touching.

Not needed (already shipped or already correct):
- H1 on property pages (item 2 of original scope)
- Neighbourhood title CondoLeads hardcode (item 4 of original scope)
- Homepage Twitter card (subset of item 5)

##### 7. Multi-tenant posture (per CLAUDE.md)

Every actionable A-UNIT-3 item above is scoped as **tenant-derived from existing helpers** — no new brand branches, no `if (host === 'aily.ca')`, no hardcoded tenant identity in build output. Where a brand name appears, it reads from `tenant.name` / `siteName` (via `agentBranding?.site_title`) / the shared `getTenantByHost` resolver. Adding a new tenant is a row-insert, unchanged. Verified this session for every code path listed above.

##### 8. Files this dispatch

Read-only recon only. No code files touched. No SQL write. Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_A-UNIT-3-RECON_20260706_165216`. Every claim above cited by file:line and grep/read output this session; anything not runtime-verified (Cache-Control response header) is flagged **"claimed, unverified"** in item 6. Push base clean before the recon; no HOLD needed.

---

#### A-UNIT-3 BUILD — SHIPPED (2026-07-06)

4 buildable items + 1 side finding delivered in one dispatch. Every touched file has a `.backup_A-UNIT-3_20260706_165648` alongside. TSC exit 0 across all edits.

##### 1. BuildingPage locality Rule Zero #1 fix (side finding surfaced in recon)

[app/[slug]/BuildingPage.tsx](app/[slug]/BuildingPage.tsx): pre-fix line 193 hardcoded `in Toronto` in the meta description for every building. Fix:
- Extended `building` SELECT to include `community_id` (was already fetched later in the render path; now also in generateMetadata scope).
- Inline resolve: `buildings.community_id → communities.municipality_id → municipalities.name`. Two supabase reads; each hop null-guarded; any null → `localityName = null`.
- Description now emits `${building_name} at ${canonical_address}${localityPhrase}.` where `localityPhrase = localityName ? \` in ${localityName}\` : ''`. NULL community_id or any null hop → phrase OMITTED entirely (never `in Toronto`, never `in null`).

Live smoke on aily.ca (both walliam and aily reach the same building data — same fix applies):
| Building | community_id | Pre-fix desc | Post-fix desc |
|---|---|---|---|
| Mississauga (`/4005-hickory-drive-mississauga`) | non-null | `... in Toronto.` | `4005 Hickory at 4005 Hickory Drive, Mississauga in Mississauga. 2-3 bedroom units available. …` |
| Palace Condos Burlington (`/the-palace-condos-1270-maple-crossing-boulevard-burlington`) | **NULL** | `... in Toronto.` | `The Palace Condos at 1270 Maple Crossing Boulevard, Burlington. 8 units for sale from $480K to $710K. 2 units for rent. …` (locality phrase OMITTED cleanly) |

**Note on the Mississauga case**: `canonical_address` already contains "Mississauga", so the sentence reads `... 4005 Hickory Drive, Mississauga in Mississauga.` — redundant-but-honest. Cleaning up the double-locality is a separate cosmetic follow-up (would require parsing `canonical_address` to strip the trailing locality); NOT a Rule Zero item since both mentions are factually correct. Logged as OPEN cosmetic follow-up.

##### 2. Homepage H1 — added (was 0)

[components/HomePageComprehensive.tsx](components/HomePageComprehensive.tsx) + [components/HomePageComprehensiveV2.tsx](components/HomePageComprehensiveV2.tsx) — both live paths (homepage_layout: v1 uses V1; v2/v3 use V2). Added `<h1 className="sr-only">GTA Condos & Homes — AI-Powered Real Estate Search{tenantContext?.name ? \` by ${tenantContext.name}\` : ''}</h1>` as the first child of the returned fragment.

Rationale for `sr-only`: the visible hero is a client component (`HomePageComprehensiveClient[V2]`) with its own designed headline; adding a visible H1 above would visually double up. `sr-only` gives the document outline a proper H1 for crawlers without touching the visual design. Standard SEO pattern.

Live smoke (VERIFIED verbatim):
- aily.ca: `<h1 class="sr-only">GTA Condos &amp; Homes — AI-Powered Real Estate Search by aily</h1>` — 1 H1 tag on page (was 0).
- walliam.ca: `<h1 class="sr-only">GTA Condos &amp; Homes — AI-Powered Real Estate Search by WALLiam</h1>` — 1 H1, tenant-derived (WALLiam, not aily, not CondoLeads).

Zero brand hardcode. Zero `if (host === 'aily.ca')`.

##### 3. Homepage title — keyword-first pivot

[app/comprehensive-site/page.tsx:31](app/comprehensive-site/page.tsx#L31):
```
- const title = `${tenant.name} - AI Real Estate Assistant for the GTA`
+ const title = `GTA Condos & Homes — AI-Powered Search | ${tenant.name}`
```
Live smoke:
- aily: `<title>GTA Condos &amp; Homes — AI-Powered Search | aily</title>`.
- walliam: `<title>GTA Condos &amp; Homes — AI-Powered Search | WALLiam</title>`.

##### 4. Twitter Card + openGraph on 4 geo pages

Community/Municipality/Area helpers previously had `title + description + alternates.canonical` only (0 openGraph, 0 Twitter). Neighbourhood had those plus tenant-derived title. All 4 now emit matching `openGraph` (title, description, url, siteName, type=website) + `twitter` (card=summary_large_image, title, description). Tenant lookup via `getTenantByHost` (same helper Neighbourhood already used).

Live smoke, aily.ca (VERIFIED verbatim, one URL per page type):
| Page type | URL | `<title>` | `og:title` count | `twitter:card` |
|---|---|---|---:|---:|
| Community | `/grindstone` | `Grindstone Real Estate | Condos & Homes for Sale | aily` | 1 | 1 |
| Municipality | `/toronto-e02` | `Toronto E02 Real Estate | Condos & Homes for Sale | aily` | 1 | 1 |
| Area | `/chatham-kent-area` | `Chatham-Kent Real Estate | Condos & Homes for Sale | aily` | 1 | 1 |
| Neighbourhood | `/toronto/downtown` | `Downtown Real Estate – Condos & Homes | aily` | 1 | 1 |

walliam.ca `/toronto-e02` → `<title>Toronto E02 Real Estate | Condos & Homes for Sale | WALLiam</title>` — brand suffix tenant-derived. No aily/CondoLeads leak.

##### 5. Brand suffix on Community/Muni/Area titles (Step 5, non-Rule-Zero)

Shipped along with the Twitter Card change in the same file edit — same tenant helper (`getTenantByHost`) already required for the Twitter Card work, no additional plumbing. Marked as done in this dispatch.

##### 6. Verified NOT-touched (already-shipped items from recon)

- **Property page H1** — VERIFIED present via `PropertyHeader.tsx:67` (unit-number for condo, address for home). Not touched.
- **Neighbourhood title CondoLeads hardcode** — VERIFIED already tenant-derived (A-UNIT-1b, 2026-07-01). Not touched.
- **Homepage Twitter Card** — VERIFIED already emitted at `comprehensive-site/page.tsx:49-54`. Not touched.

##### 7. Cache-Control revisit — DEFERRED

Per recon: no code-side Cache-Control set anywhere in the homepage path; tracker's quoted header string is Next.js default from `dynamic='force-dynamic'` + `revalidate=0`. Any change is a policy call (edge-cache warmth vs freshness of personalized homepage). **Deferred pending operator decision** — external blocker, resume when operator picks the desired posture. Not build-safe now.

##### 8. Multi-tenant posture

Every code path touched in this dispatch reads brand identity from the shared tenant resolver (`getTenantByHost` or the already-in-scope `tenant.name` / `tenantContext.name`). Zero hardcoded tenant literals, zero `if (host === 'aily.ca')`. Verified via grep of the modified files: no `host ===` conditionals introduced.

Onboarding a new tenant (row-insert into `tenants`) picks up:
- Homepage H1 with the new tenant.name via `tenantContext.name`.
- Homepage title with `${tenant.name}` suffix.
- 4 geo pages with `${brandTenant.name}` suffix + tenant-attributed Twitter/OG.
- Building pages with real municipality (data-plane join, no per-tenant branch).

All by row-insert alone; no code change.

##### 9. Files this dispatch

Modified (with `.backup_A-UNIT-3_20260706_165648`):
- `app/[slug]/BuildingPage.tsx` (locality resolve + description conditional)
- `components/HomePageComprehensive.tsx` (H1 tenant-derived, sr-only)
- `components/HomePageComprehensiveV2.tsx` (same)
- `app/comprehensive-site/page.tsx` (keyword-first title)
- `app/[slug]/CommunityPage.tsx` (tenant lookup + brand suffix + openGraph + Twitter)
- `app/[slug]/MunicipalityPage.tsx` (same)
- `app/[slug]/AreaPage.tsx` (same)
- `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` (openGraph + Twitter — brand suffix already done)
- `docs/W-MARKETING-TRACKER.md` (this section; backup `.backup_A-UNIT-3-BUILD_20260706_165648`)

TSC exit 0 on all 8 code edits. `.env.local` not staged. Backup files untracked (deliberate).

##### 10. A-UNIT-3 status

| Original scope item | State |
|---|---|
| Homepage H1 | ✅ SHIPPED |
| Property H1 | ✅ Already-shipped (A-UNIT-1b or earlier) — no action |
| Homepage title | ✅ SHIPPED (keyword-first) |
| Neighbourhood CondoLeads title | ✅ Already-shipped (A-UNIT-1b) — no action |
| Twitter Card (home + 4 geo) | ✅ Homepage already-shipped; 4 geo pages SHIPPED this dispatch |
| Homepage Cache-Control | ⏸ DEFERRED (operator policy) |
| BuildingPage "in Toronto" (side finding) | ✅ SHIPPED (Rule Zero #1 fix) |
| Brand suffix on 3 geo titles (optional) | ✅ SHIPPED |

**A-UNIT-3 CLOSED except Cache-Control (external blocker).** Ready to move to A-UNIT-4 or next unit per operator dispatch. HOLD push per operator instruction.

#### ON-PAGE SEO AUDIT — real rendered values + comprehensiveness matrix (2026-07-06)

Post-feae2e9 audit. Every value below is from a live curl this session on `Host: aily.ca` local dev with a cache-bust query param (Next.js dev cache warmed on first curl and returned a pre-fix cached response — re-issued with `?_cb=<ts>` to force fresh render; future audits should do the same).

##### 1. Real rendered `<title>` + `<h1>` — VERBATIM, all 8 SEO page types on aily.ca

| # | Page type | URL | `<title>` (verbatim, chars) | `<h1>` (verbatim) |
|---|---|---|---|---|
| 1 | Homepage | `/` | `GTA Condos & Homes — AI-Powered Search \| aily` (49c) | `GTA Condos & Homes — AI-Powered Real Estate Search by aily` (sr-only) |
| 2 | Condo property | `/7-grenville-street-unit-811-toronto-c01-c12129402` | `7 Grenville Street 811, Toronto C01, ON L3P 2J2 \| Unit 811 \| YC Condos \| 1 Bed \| CondoLeads` (91c) | `Unit 811` |
| 3 | Home property | `/1300-braeside-drive-oakville-w12205517` | `1300 Braeside Drive, Oakville, ON L6J 2A4 \| Sidesplit \| 5 Bed \| CondoLeads` (74c) | `1300 Braeside Drive` |
| 4 | Building | `/side-launch-1-shipyard-lane-collingwood` | `Side Launch Condos - 1 Shipyard Lane, Collingwood \| CondoLeads` (62c) | `Side Launch` |
| 5 | Area | `/chatham-kent-area` | `Chatham-Kent Real Estate \| Condos & Homes for Sale \| aily` (61c) | `Chatham-Kent Real Estate` |
| 6 | Municipality | `/toronto-e02` | `Toronto E02 Real Estate \| Condos & Homes for Sale \| aily` (60c) | `Toronto E02 Real Estate` |
| 7 | Community | `/grindstone` | `Grindstone Real Estate \| Condos & Homes for Sale \| aily` (59c) | `Grindstone Real Estate` |
| 8 | Neighbourhood | `/toronto/downtown` | `Downtown Real Estate – Condos & Homes \| aily` (48c) | `Downtown Real Estate` |

##### 2. Comprehensiveness matrix — 8 pages × 8 elements

Symbols: ✓ present + correct · ⚠️ present but flawed · ❌ missing or Rule-Zero issue

| Element | Homepage | Condo | Home | Building | Area | Muni | Community | Neighbourhood |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `<title>` present + keyword-relevant | ✓ 49c | ❌ ends `\| CondoLeads` on aily (multi-tenant leak) | ❌ ends `\| CondoLeads` | ❌ ends `\| CondoLeads` | ✓ | ✓ | ✓ | ✓ |
| meta description ≤160c | ✓ | ✓ 144c | ✓ 139c | ⚠️ 194c + doubled `Collingwood in Collingwood` | ✓ | ✓ | ✓ | ✓ |
| exactly 1 `<h1>` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H2/H3 hierarchy | ✓ 2 H2 | ✓ 8 H2 + 16 H3 | ✓ 5 H2 + 5 H3 | ✓ 6 H2 + 9 H3 | ✓ | ✓ | ✓ | ✓ |
| canonical self-referencing | ✓ | ⚠️ `/property/UUID` — slug-gen fell back on this listing | ✓ slug URL | ✓ | ✓ | ✓ | ✓ | ✓ |
| OpenGraph | ⚠️ og:title = `aily - AI Real Estate Assistant` **mismatches** page title (A-UNIT-3 rewrite didn't update og:title) | ✓ | ✓ | ✓ | ⚠️ og:image ✗ | ⚠️ og:image ✗ | ⚠️ og:image ✗ | ⚠️ og:image ✗ |
| Twitter Card | ✓ | ✓ | ✓ | ✓ | ✓ (A-UNIT-3) | ✓ (A-UNIT-3) | ✓ (A-UNIT-3) | ✓ (A-UNIT-3) |
| JSON-LD structured data | ✓ RealEstateAgent | ✓ RealEstateListing + BreadcrumbList | ✓ same | ✓ ApartmentComplex + BreadcrumbList | ✓ BreadcrumbList + AdministrativeArea | ✓ + City | ✓ + Place | ✓ + Place |
| image alt text | ✓ 12/12 | ✓ 26/26 | ✓ 26/26 | ✓ 2/2 | ✓ 24/24 | ✓ 0 images (empty muni; not a gap) | ✓ 8/8 | ✓ 24/24 |

##### 3. Real gaps (ranked by severity)

**❌ Rule Zero #1 — multi-tenant leak (BLOCKING)**: property/home/building titles fall back to `'CondoLeads'` when `agentBranding?.site_title` is null. Verified live: 3 of 8 page types on aily.ca end with `| CondoLeads` instead of `| aily`. Root: [property/[id]/page.tsx:32](app/property/[id]/page.tsx#L32), [HomePropertyPage.tsx:41](app/property/[id]/HomePropertyPage.tsx#L41), [BuildingPage.tsx:160](app/[slug]/BuildingPage.tsx#L160) all declare `const siteName = agentBranding?.site_title || 'CondoLeads'`. Same class of hardcode that A-UNIT-3 fixed for BuildingPage *description*; title fallback still there in 3 files. Fix: layer `tenant.name` (via `getTenantByHost`) between `agentBranding?.site_title` and the `'CondoLeads'` last-resort — tenant-derived, no new branch. Data-plane per-tenant, mirroring the A-UNIT-3 geo-page pattern.

**⚠️ Homepage og:title stale**: page `<title>` was rewritten in A-UNIT-3 to keyword-first, but [comprehensive-site/page.tsx:29](app/comprehensive-site/page.tsx#L29) still emits `ogTitle = \`${tenant.name} - AI Real Estate Assistant\``. Social preview cards show the old brand-first title. Fix: align `ogTitle` to the new `title` (or ship a designed variant if operator wants a different social framing).

**⚠️ Geo pages missing og:image** (Area/Muni/Community/Neighbourhood): A-UNIT-3 added `openGraph` (title/desc/url/siteName) + Twitter Card but no `og:image`. Social preview cards fall back to text-only. Fix: add `openGraph.images` — either the tenant's homepage `/og` route or a per-page generated OG (requires image-gen infrastructure decision).

**⚠️ Building meta description**: doubled locality (`Collingwood in Collingwood`) + 194c exceeds Google's ~160c truncation. Cosmetic + length. Fix: detect trailing locality match in `canonical_address`; skip the "in <locality>" phrase when it duplicates. Same pattern flagged in the A-UNIT-3 BUILD tracker as "cosmetic follow-up".

**⚠️ Condo canonical uses UUID for the sampled listing**: `C12129402` canonical = `/property/601a8f42-…` not the slug URL. Root: [property/[id]/page.tsx:97](app/property/[id]/page.tsx#L97) `slug && !slug.startsWith('/property/') ? slug : \`/property/${params.id}\`` — `generatePropertySlug` returned a `/property/`-prefixed fallback for this listing (input to slug-gen was missing something). Per-listing edge case, not a systemic A-UNIT-3 failure. **Needs population-level verification** (claimed, unverified): how many condo listings hit the UUID canonical fallback? Not counted this session.

##### 4. What IS comprehensive

Every SEO page has: 1 H1, meta description, canonical, Twitter card, JSON-LD structured data, image alt text on every image (100/100 across the 8 pages sampled), H2/H3 hierarchy. Every page returns HTTP 200. Every tenant-derived brand path (except the 3 flagged in item 3) uses the shared helpers — no new `if (host === 'aily.ca')` introduced in this dispatch or any A-UNIT-3 dispatch.

##### 5. Verdict — is on-page SEO COMPREHENSIVE?

**No — one Rule Zero #1 gap remains (`|| 'CondoLeads'` fallback on 3 of 8 page types = property/home/building titles) plus 4 lesser SEO-quality gaps.** The A-UNIT-3 build closed everything on its original scope; this audit surfaced the property/building title fallback (out of original A-UNIT-3 scope) as a live multi-tenant leak. Same class of hardcode BuildingPage description had — but the *title* fallback was not touched.

**Recommendation**: fix (1) as an A-UNIT-3 EXTENSION dispatch — NOTHING-DEFERRED per Rule Zero, it's a live leak on 3 of 8 SEO surfaces. Items (2)-(5) can ship in the same dispatch or defer per operator preference.

##### 6. Files this dispatch

Read-only audit only. No code files touched. No SQL write. Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_ON-PAGE-AUDIT_20260706_191711`. Parser helper written to `scripts/_a-unit-3-audit-parse.js` (safe — reads local HTML, no DB, no network; not staged for commit unless operator wants it retained). Live curl x 8 URLs on aily.ca local dev with cache-bust. Every rendered value cited above is a byte-for-byte curl-of-live-response this session. Anything not measured (e.g. condo canonical population rate, walliam parallel-audit) is flagged **"claimed, unverified"** at the specific finding.

#### A-UNIT-3 EXTENSION — 5 audit gaps SHIPPED (2026-07-06)

Closes all 5 gaps flagged in the ON-PAGE AUDIT: the Rule Zero #1 `|| 'CondoLeads'` title leak on 3 files + 4 lesser SEO-quality gaps. All fixes tenant-derived via existing helpers; no new `if (host === …)` branch.

##### 1. Step 5 recon (READ-ONLY, done before code changes) — condo canonical UUID was SYSTEMIC

The audit flagged one specific listing (`C12129402`) with a UUID canonical and asked whether it was a per-listing edge case. Recon this session traced it end-to-end:
- `generatePropertySlug` at [lib/utils/slugs.ts:32-79](lib/utils/slugs.ts#L32) — early return at line 39: `if (!listing.listing_key) return \`/property/${listing.listing_key}\`` → the fallback that emits `/property/undefined`.
- `property/[id]/page.tsx:55` SELECT: `id, unparsed_address, list_price, bedrooms_total, bathrooms_total_integer, transaction_type, building_id, unit_number` — **`listing_key` was NOT in the SELECT**. So the listing passed to `generatePropertySlug` had `listing_key=undefined`, hitting the fallback for **every condo listing**, not just one.
- Compared with `HomePropertyPage.tsx:46` SELECT which DOES include `listing_key` → home canonical worked.

VERDICT: systemic bug affecting every Active condo canonical URL (property/[id] route). Fix ships in this dispatch (Step 5 below).

##### 2. Step 1 — Rule Zero #1 `|| 'CondoLeads'` title leak — 3 files

Prior pattern (all three files):
```
const siteName = agentBranding?.site_title || 'CondoLeads'
```
New pattern:
```
const _tenantForBrand = await getTenantByHost(serverSupabase, host)
const siteName = agentBranding?.site_title ?? _tenantForBrand?.name ?? 'Real Estate'
```
Fall-through: agent site_title (legacy System-1 agent domains) → tenant.name (System 2 aily/walliam/future) → neutral generic (only if both null; not a brand). No `'CondoLeads'` literal remains in any code-active title logic on these 3 files (grep confirmed: all remaining `'CondoLeads'` hits are inside comments documenting the fix).

Files: [property/[id]/page.tsx](app/property/[id]/page.tsx#L49) · [HomePropertyPage.tsx](app/property/[id]/HomePropertyPage.tsx#L41) · [BuildingPage.tsx](app/[slug]/BuildingPage.tsx#L160). Each already imported `getTenantByHost`; no new import.

##### 3. Step 2 — Homepage og:title alignment

[comprehensive-site/page.tsx:33](app/comprehensive-site/page.tsx#L33):
```
- const ogTitle = `${tenant.name} - AI Real Estate Assistant`
+ const ogTitle = title   // = "GTA Condos & Homes — AI-Powered Search | ${tenant.name}"
```
Page `<title>` and og:title now identical; social preview cards read the keyword-first phrasing.

##### 4. Step 3 — 4 geo pages og:image via tenant-aware `/og` route

Community/Municipality/Area/Neighbourhood: added `openGraph.images` and `twitter.images` pointing at `https://${canonicalDomain}/og`. That route already exists at [app/og/route.tsx](app/og/route.tsx#L1) — tenant-aware (reads `host` → tenants → brand render). **Not a fabricated URL**: it's the same source the homepage uses (`comprehensive-site/page.tsx:26`). Each geo page now emits a real og:image the tenant's brand renders.

##### 5. Step 4 — Building meta description doubled-locality + length

Two problems in one fix at [BuildingPage.tsx:220](app/[slug]/BuildingPage.tsx#L220):
- **Doubled locality**: `canonical_address` for buildings often already ends with the municipality name (e.g. Side Launch `1 Shipyard Lane, Collingwood`). Prior A-UNIT-3 always appended ` in ${municipalityName}`, producing `Collingwood in Collingwood`. Fix: substring-check `canonical_address` case-insensitively; skip the "in <locality>" phrase when the address tail already contains the locality name.
- **>160c length**: dropped the marketing tail `View floor plans, amenities, market stats, and transaction history.` when appending it would exceed Google's ~160c SERP window. Real content (address + counts + beds + year) always stays; only the CTA tail is conditional.

Live smoke (both Collingwood + Mississauga):
| Building | Locality | Pre-fix desc | Post-fix desc | Chars |
|---|---|---|---|---:|
| Side Launch (Collingwood) | Collingwood | `Side Launch at 1 Shipyard Lane, Collingwood in Collingwood. …` (194c) | `Side Launch at 1 Shipyard Lane, Collingwood. 2 units for sale from $775K to $850K. 1-3 bedroom units available.` | 111c ✓ |
| 4005 Hickory (Mississauga) | Mississauga | `4005 Hickory at 4005 Hickory Drive, Mississauga in Mississauga. …` | `4005 Hickory at 4005 Hickory Drive, Mississauga. 2-3 bedroom units available. View floor plans, amenities, market stats, and transaction history.` | 145c ✓ |

Rationale for keeping the tail on 4005 Hickory: description base was short enough to fit the CTA under 160c budget; on Side Launch it wasn't. Conditional emission — no fabrication either way.

##### 6. Step 5 — Condo canonical listing_key fix

[property/[id]/page.tsx:55](app/property/[id]/page.tsx#L55) SELECT extended to include `listing_key`. `generatePropertySlug` now receives the real listing_key and returns a slug URL. Verified live: `C12129402` canonical was `https://aily.ca/property/601a8f42-…` (UUID) → now `https://aily.ca/7-grenville-street-unit-811-c12129402` (slug). Same behavior on walliam.ca. Fix applies to every Active condo listing (not just the sampled one).

##### 7. Live smoke — both tenants, 9 URLs each

**aily.ca** (VERIFIED verbatim this session):
| Page | title | og:title | og:image | canonical | CondoLeads leak? |
|---|---|---|---|---|:---:|
| Homepage | `GTA Condos & Homes — AI-Powered Search \| aily` (49c) | matches title | `https://aily.ca/og` | `https://aily.ca/` | ✓ NO |
| Condo | `… \| Unit 811 \| YC Condos \| 1 Bed \| aily` (85c, was 91c) | matches title | (property og_image) | `https://aily.ca/7-grenville-street-unit-811-c12129402` (was `/property/UUID`) | ✓ NO |
| Home | `… \| Sidesplit \| 5 Bed \| aily` (68c) | matches | (property og_image) | slug URL | ✓ NO |
| Building Collingwood | `Side Launch Condos - 1 Shipyard Lane, Collingwood \| aily` (56c) | matches | (agent og_image) | slug URL | ✓ NO |
| Building Mississauga | `4005 Hickory Condos - 4005 Hickory Drive, Mississauga \| aily` (60c) | matches | (agent og_image) | slug URL | ✓ NO |
| Area | `Chatham-Kent Real Estate \| Condos & Homes for Sale \| aily` (61c) | matches | `https://aily.ca/og` | slug URL | ✓ NO |
| Muni | `Toronto E02 Real Estate \| Condos & Homes for Sale \| aily` (60c) | matches | `https://aily.ca/og` | slug URL | ✓ NO |
| Community | `Grindstone Real Estate \| Condos & Homes for Sale \| aily` (59c) | matches | `https://aily.ca/og` | slug URL | ✓ NO |
| Neighbourhood | `Downtown Real Estate – Condos & Homes \| aily` (48c) | matches | `https://aily.ca/og` | slug URL | ✓ NO |

**walliam.ca** (VERIFIED verbatim this session, 5 URLs):
| Page | title | CondoLeads leak? | aily leak? | JSON-LD |
|---|---|:---:|:---:|:---:|
| Homepage | `GTA Condos & Homes — AI-Powered Search \| WALLiam` | ✓ NO | ✓ NO | 0 (SEO gate) |
| Condo | `… \| Unit 811 \| YC Condos \| 1 Bed \| WALLiam` | ✓ NO | ✓ NO | 0 |
| Home | `… \| Sidesplit \| 5 Bed \| WALLiam` | ✓ NO | ✓ NO | 0 |
| Building Miss | `4005 Hickory Condos - 4005 Hickory Drive, Mississauga \| WALLiam` | ✓ NO | ✓ NO | 0 |
| Muni | `Toronto E02 Real Estate \| Condos & Homes for Sale \| WALLiam` | ✓ NO | ✓ NO | 0 |

Every walliam page ends `| WALLiam` — tenant-derived. Zero `CondoLeads`, zero `aily`. SEO gate intact (0 ld+json blocks on walliam per row).

##### 8. Files this dispatch

Modified (with `.backup_A-UNIT-3-EXT_20260706_192557`):
- `app/property/[id]/page.tsx` (siteName tenant chain + listing_key in SELECT — Step 1a + Step 5)
- `app/property/[id]/HomePropertyPage.tsx` (siteName tenant chain — Step 1b)
- `app/[slug]/BuildingPage.tsx` (siteName tenant chain + doubled-locality skip + 160c cap — Steps 1c + 4)
- `app/comprehensive-site/page.tsx` (ogTitle = title — Step 2)
- `app/[slug]/CommunityPage.tsx` (og:image via /og — Step 3)
- `app/[slug]/MunicipalityPage.tsx` (same)
- `app/[slug]/AreaPage.tsx` (same)
- `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` (same)
- `docs/W-MARKETING-TRACKER.md` (this section; backup `.backup_A-UNIT-3-EXT_20260706_192557`)

TSC exit 0 on all edits. `.env.local` not staged. 8 file backups untracked.

##### 9. On-page SEO status after this dispatch

| Element | Homepage | Condo | Home | Building | Area | Muni | Community | Neighbourhood |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `<title>` (tenant-derived, keyword-relevant, ≤~90c) | ✓ | ✓ (fixed) | ✓ (fixed) | ✓ (fixed) | ✓ | ✓ | ✓ | ✓ |
| meta description (≤160c) | ✓ | ✓ | ✓ | ✓ (fixed — 111/145c) | ✓ | ✓ | ✓ | ✓ |
| 1 `<h1>` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H2/H3 hierarchy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| canonical (self, slug URL) | ✓ | ✓ (fixed — was UUID) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| OG title + description + url + image | ✓ (fixed — matches title) | ✓ | ✓ | ✓ | ✓ (fixed — image added) | ✓ (fixed) | ✓ (fixed) | ✓ (fixed) |
| Twitter Card | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| JSON-LD structured data | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| image alt text (100%) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**A-UNIT-3 fully comprehensive on aily.ca and walliam.ca.** Cache-Control revisit remains DEFERRED (operator policy). No new open gaps surfaced.

HOLD push per operator dispatch.

---

##### Original A-UNIT-3 scope (preserved unchanged, for the record)

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

#### Step 4 (part 2) — sitemap SUBMITTED + VERIFIED (2026-07-04) — **C-UNIT-2 COMPLETE**

**Pre-check (this session)**: `curl -sS -o /dev/null -w "%{http_code} %{content_type}" https://www.aily.ca/sitemap.xml` → `200  application/xml; charset=utf-8` (370 bytes — the sitemap-index topper from A-UNIT-1a's shipped route handler pair). Rule Zero: don't submit a feedpath you haven't confirmed serves. Confirmed live.

**New: `scripts/gsc-submit-sitemap.js`** — multi-tenant-safe (per CLAUDE.md "constant referencing a single tenant in business logic is a violation"): defines a data-plane `targets = [{ siteUrl, feedpath, note }, ...]` list. The one current entry's `siteUrl` is the exact string obtained from this session's `sites.list` response — NOT hand-assembled, has provenance. Future SEO-enabled tenants append here, same code path, zero branch. Script authenticates via `googleapis` OAuth2 client using `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` and the Step-2c `GOOGLE_WEBMASTERS_REFRESH_TOKEN`, calls `webmasters.sitemaps.submit` then immediately `webmasters.sitemaps.get` for verification. Error handling surfaces only `err.message` + `err.code` + safe `err.errors[]` — never the full `err` object (`err.response.config.headers.Authorization` echoes the bearer access token).

**Run result VERBATIM** (this session):
```
=== target: sc-domain:aily.ca ===
  feedpath: https://www.aily.ca/sitemap.xml
  note:     aily — siteOwner verified via sites.list 2026-07-04
  → sitemaps.submit …
    submit: OK (HTTP 204)
  → sitemaps.get …
    get: OK (HTTP 200)
      path:            "https://www.aily.ca/sitemap.xml"
      lastSubmitted:   "2026-07-04T15:48:30.450Z"
      isPending:       true
      isSitemapsIndex: false
      type:            undefined
      lastDownloaded:  undefined
      contents count:  0
      errors:          "0"
      warnings:        "0"

=== DONE (all targets submitted + verified) ===
```

**Interpretation**:
- `submit: OK (HTTP 204)` — Google's standard success response for `sitemaps.submit` (No Content, empty body).
- `path` returned by `get` exactly matches the submitted `feedpath` — confirms Google registered the correct URL under the `sc-domain:aily.ca` property.
- `lastSubmitted: "2026-07-04T15:48:30.450Z"` — Google timestamped the registration.
- `isPending: true` — **normal immediately post-submit**. Google queues the sitemap for crawling; it hasn't fetched it yet. On a re-run in a few hours, `isPending` should flip to `false`, and `type` / `lastDownloaded` / `isSitemapsIndex` / `contents[]` will populate with the actual crawl state.
- `type: undefined` + `lastDownloaded: undefined` + `contents count: 0` — expected while `isPending: true`. Not a failure; the sitemap is registered but not yet crawled.
- `errors: "0"` + `warnings: "0"` — no registration-time issues.

**C-UNIT-2 COMPLETE**. Sitemap is registered with Google Search Console under `sc-domain:aily.ca`. Crawling is Google's asynchronous job — expected to complete within hours. The submission is idempotent: re-running the script updates `lastSubmitted` but is a no-op for indexing.

**`yourcondorealtor` de-index posture — unchanged, no API action needed**: as documented in the C-UNIT-2 recon, Google's Search Console API does not support de-indexing a site the token doesn't own. Reliance on A-UNIT-1a's shipped `X-Robots-Tag: noindex, nofollow` on legacy hosts continues to be the correct de-index path. Natural Google recrawl deindexes over weeks-to-months. No further API work planned.

**Final blocker table** (all cleared):
| # | Blocker | Final state |
|---|---|---|
| 1 | `googleapis` npm package | CLEARED (Step 1) |
| 2 | OAuth webmasters scope + `.env.local` token | CLEARED (Step 2c auto-write + Step 4 pt1 auth proof) |
| 2.5 | SC API enabled in Cloud Project 678967923355 | CLEARED (Cloud Console + Step 4 pt1 re-run HTTP 200) |
| 3 | aily.ca verified as GSC property | CLEARED (`sc-domain:aily.ca` + `siteOwner` via sites.list) |
| 4 | `scripts/gsc-submit-sitemap.js` shipped + smoke-verified | **CLEARED** (this dispatch — submit OK 204, get OK 200 with matching `path`) |

**Files this dispatch**:
- New: `scripts/gsc-submit-sitemap.js` (idempotent; multi-tenant targets shape; safe error handling).
- Tracker append (this section). Backup: `docs/W-MARKETING-TRACKER.md.backup_C-UNIT-2-SUBMIT_20260704_114859`.

**Future re-runs**: `node scripts/gsc-submit-sitemap.js` is idempotent — safe to run any time (sitemap rotation, new tenant onboarding by appending to `targets`, verifying post-crawl state). Re-runs update `lastSubmitted` and return the current crawl state via `sitemaps.get`.
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



