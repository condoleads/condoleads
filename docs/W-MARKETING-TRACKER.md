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

### A-UNIT-1 — Crawl foundation `[DEV]` — STATUS: **PARTIAL** (robots + noindex SHIPPED 2026-07-01; sitemap + canonicals remaining)

**SHIPPED 2026-07-01** (A-UNIT-1 first half):
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

**REMAINING** (A-UNIT-1 second half — next dispatch):
  - **`app/sitemap.ts`** — sitemap INDEX + child sitemaps:
    - active listings (~102,633 URLs -> 3 sitemap files, 50K-URL
      limit per file) — refreshed nightly
    - quality-gated buildings (~4,634 — photo + active listings) —
      refreshed weekly
    - communities (1,948), municipalities (506), treb_areas (73),
      neighbourhoods (9), developments (7) — refreshed weekly
    - Total: ~110K URLs across 4 listing/geo sitemaps + 1 index
    - `lastmod` sources:
      - mls_listings: `modification_timestamp` or `updated_at`
      - buildings: `updated_at` or `geo_analytics.calculated_at`
        (uses nightly stats freshness)
      - communities/munis/areas/neighbourhoods: `updated_at`
  - **`alternates.canonical` tags** added to: home, property,
    area, muni, community, neighbourhood. Building already has
    one — leave intact.
  - **`/property/[UUID]` -> slug canonical** (dual-URL defense
    so Google doesn't fragment indexed listings between the UUID
    direct route and the slug-based route per UNIT 61 R8).
  - **Dependencies for second half**: none blocking.

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
