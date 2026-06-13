# W-ESTIMATOR-PATHS — Entry-Point Unification + Section Parity + Credit Alignment

Opened: 2026-06-12
origin/main: 9d3e182
Parent: W-ESTIMATOR-CONDO
Status: P0 RECON COMPLETE; P0.5 verification next.

## Entry-point map (recon-traced 2026-06-12, file:line in recon/W-ESTIMATOR-ENTRY-POINTS-RECON.txt)
| Entry | Action | Matcher | TaxMatch | Competing | Credit | S1/S2 |
| Home geo-card modal | estimateHomeSale | home-S2 | NO* | YES | 1/click | S2 |
| Home property page | estimateHomeSale | home-S2 | YES | YES | 0 | S2 |
| Home worth widget | — | — | — | — | — | DOES NOT EXIST |
| Condo geo-card modal | estimateCondoSale | condo-S2 | YES | NO* | 1/click | S2 |
| Condo property page | estimateCondoSale | condo-S2 | YES | YES | 0 | S2 |
| Condo unit-worth widget | estimateSale | S1 FROZEN | NO | NO | 0 | S1 |
(* root cause traced below)

## Findings
- F-HOME-MODAL-NO-TAXMATCH: HomeEstimatorBuyerModal.tsx:282-283 optional-spreads subjectTaxAnnualAmount; silent-omits if listing prop lacks tax_annual_amount; matcher short-circuits at home-comparable-matcher-sales.ts:1176-1179. claimed-likely; P0.5 confirms.
- F-CONDO-MODAL-NO-COMPETING: EstimatorBuyerModal.tsx:323 3-gate (tenantId && community_id && bedrooms_total); building-card listing prop likely lacks community_id; fetch skipped. claimed-likely; P0.5 confirms.
- F-CONDO-WIDGET-S1 (VERIFIED): EstimatorSeller.tsx:128 calls estimateSale (S1) unconditionally; no tax-match/competing ever.
- F-HOME-WORTH-MISSING (VERIFIED): no HomeEstimatorSeller; no geo page mounts a home seller widget.
- F-CREDIT-INCOHERENT (VERIFIED): modals +1/click (EstimatorBuyerModal.tsx:211, HomeEstimatorBuyerModal.tsx:192); property-page CTAs 0; seller widget 0.
- F-RELOAD-BLEED-HELD (VERIFIED prod): PropertyEstimateCTA.tsx:119 + HomePropertyEstimateCTA.tsx:111 depend on listing.id (stable) post-aa4e627.

Renderer note: per type, modal + property page render SAME component (EstimatorResults / HomeEstimatorResults). Divergence is in DATA passed, not renderer. P1 is a SELECT/spec-threading fix.

## Phase plan
- P0 RECON — COMPLETE
- P0.5 confirm two SELECT clauses — NEXT
- P1 section parity (add missing fields to card SELECTs)
- P2 credit alignment (1 subject = 1 attempt, uniform)
- P3 condo unit-worth widget S1 to S2 (new S2 seller path beside frozen estimateSale; S1 byte-identical)
- P4 home-worth widget on geo pages (address-pick backfill from mls_listings; ~2 inputs not ~12)

## Open decision
D-CREDIT-MODEL (P2): should seller-side submissions count against VIP credits? Operator call before P2 spec.

## Home-worth field gaps (recon 4d)
propertySubtype, lotWidth/lotDepth/lotSizeUnits, subjectStreetName/StreetNumber, subjectTaxAnnualAmount/subjectTaxYear, architecturalStyle, approximateAge, basementRaw/garageType/poolFeatures. Recommended: address/listing-pick UX backfilling from an mls_listings row.

## Run log
2026-06-12 — P0 recon complete (recon/W-ESTIMATOR-ENTRY-POINTS-RECON.txt). Tracker opened.

2026-06-12 — P0.5 verification complete. Two SELECT clauses confirmed via direct file read.

### P0.5(a) — Home geo-page LISTING_SELECT (shared constant across all 3 geo pages)

LISTING_SELECT verbatim, app/[slug]/MunicipalityPage.tsx:18-29 (identical to AreaPage.tsx:17-25 + CommunityPage.tsx:17-28; both also contain it):
```
  id, building_id, community_id, municipality_id, listing_id, listing_key, standard_status, transaction_type,
  list_price, close_price, close_date, unit_number, unparsed_address,
  bedrooms_total, bathrooms_total_integer, property_type, property_subtype,
  living_area_range, square_foot_source, parking_total, locker,
  association_fee, tax_annual_amount, days_on_market, listing_contract_date,
  building_area_total,
  lot_width, lot_depth, lot_size_dimensions, lot_size_area, lot_size_area_units,
  frontage_length, basement, garage_type, garage_yn, approximate_age,
  legal_stories, architectural_style, cooling, pool_features, fireplace_yn,
  media (id, media_url, variant_type, order_number, preferred_photo_yn)
```

| Field needed by home tax-match cascade | Present in geo LISTING_SELECT? |
| `tax_annual_amount`                    | YES                            |
| `tax_year`                             | NO                             |

PASS/FAIL on "home cards carry tax_annual_amount?": **PARTIAL PASS — tax_annual_amount IS in the SELECT, but tax_year is MISSING.**

Confirmed root cause for F-HOME-MODAL-NO-TAXMATCH: HomeEstimatorBuyerModal.tsx:282-283 optional-spreads BOTH tax_annual_amount AND tax_year on the spec. When `listing.tax_year` is undefined (because the geo SELECT didn't pull it), `subjectTaxYear` is undefined on specs. The matcher then short-circuits at home-comparable-matcher-sales.ts:1178 (`if (specs.subjectTaxYear == null) return undefined`), `taxMatch` is `undefined`, the section silent-omits. Recon's "claimed-likely" status promoted to VERIFIED.

P1 fix shape (for follow-up phase, not this turn): add `tax_year` to the LISTING_SELECT constant in MunicipalityPage.tsx:18, AreaPage.tsx:17, CommunityPage.tsx:17. Three identical edits.

### P0.5(b) — Condo BuildingPage available-units SELECT

app/[slug]/BuildingPage.tsx:32-58 (getCachedActiveListings):
```
.from('mls_listings')
.select(`
  id, building_id, listing_id, listing_key, standard_status, transaction_type,
  list_price, close_price, close_date, unit_number, unparsed_address,
  bedrooms_total, bathrooms_total_integer, property_type, living_area_range,
  square_foot_source, parking_total, locker, association_fee, tax_annual_amount,
  days_on_market, listing_contract_date, building_area_total,
  association_amenities, association_fee_includes, property_management_company, tax_year,
  media (
    id,
    media_url,
    variant_type,
    order_number,
    preferred_photo_yn
  )
`)
.eq('building_id', buildingId)
.in('standard_status', ['Active', 'Active Under Contract'])
.order('list_price', { ascending: false })
```

| Field needed by condo competing gate at EstimatorBuyerModal.tsx:323 | Present in active-listings SELECT? |
| `bedrooms_total`                                                    | YES                                |
| `community_id`                                                      | NO                                 |

PASS/FAIL on "condo building cards carry community_id?": **FAIL — community_id is NOT in the SELECT.**

Confirmed root cause for F-CONDO-MODAL-NO-COMPETING: EstimatorBuyerModal.tsx:323 requires `(listing as any).community_id` to be truthy before calling fetchCompetingListings. The listing prop reaching the modal from a building-page card carries the unit row produced by this SELECT, which omits `community_id`. Gate evaluates false, resetCompetingListings runs, rail auto-hides. Recon's "claimed-likely" status promoted to VERIFIED.

Note: BuildingPage's SELECT INCLUDES `tax_year` (line 42, alongside property_management_company) — consistent with the operator's observation that tax-match WORKS on condo building cards.

P1 fix shape (for follow-up phase, not this turn): add `community_id` to the active-listings SELECT in BuildingPage.tsx:36-50 (and matching getCachedClosedListings at 60-79, for consistency). Two identical edits in the same file.

### P0.5 summary table

| Card source           | tax_annual_amount | tax_year | community_id | bedrooms_total | Symptom              |
| Home geo-card         | YES               | NO       | YES          | YES            | tax-match omits      |
| Condo building card   | YES               | YES      | NO           | YES            | competing omits      |

Both F-HOME-MODAL-NO-TAXMATCH and F-CONDO-MODAL-NO-COMPETING are SELECT-clause bugs in card-source queries, not modal/matcher bugs. Single-property pages use `select('*')` (PropertyPage.tsx:113 / HomePropertyPage.tsx:79) → all fields pulled → no silent-omit there. Consistent with the operator's observation that property pages render the full output.

Verification status: VERIFIED. No further P0.5 reads required.

Caveats — items still flagged as claimed-unverified:
- NeighbourhoodListingSection's listings source query was not traced here. It may share LISTING_SELECT from a Toronto-neighbourhood page or have its own; if separate, the same gap-or-not analysis would apply.
- BuildingPage's getCachedClosedListings has the same column shape (no community_id) but the operator's observation was on ACTIVE listings; closed listings on the same page would presumably also lack competing if/when triggered.

2026-06-12 — P1 section parity fix complete. SHA: pending operator push approval (HELD).

### P1 — column additions (additive only, no logic touched)

Pre-flight: confirmed via information_schema that both columns exist on mls_listings:
- `tax_year`     — integer, nullable
- `community_id` — uuid, nullable

Edit A — added `tax_year` adjacent to `tax_annual_amount` in three geo-page LISTING_SELECT constants:
- app/[slug]/MunicipalityPage.tsx:23   `association_fee, tax_annual_amount, tax_year, days_on_market, ...`
- app/[slug]/AreaPage.tsx:22            same insertion
- app/[slug]/CommunityPage.tsx:22       same insertion

Edit B — added `community_id` to BuildingPage active + closed listings SELECTs:
- app/[slug]/BuildingPage.tsx:37   getCachedActiveListings: `id, building_id, community_id, listing_id, ...`
- app/[slug]/BuildingPage.tsx:65   getCachedClosedListings: same insertion

Diff stat:
```
 app/[slug]/AreaPage.tsx         | 2 +-
 app/[slug]/BuildingPage.tsx     | 4 ++--
 app/[slug]/CommunityPage.tsx    | 2 +-
 app/[slug]/MunicipalityPage.tsx | 2 +-
 4 files changed, 5 insertions(+), 5 deletions(-)
```

Build: `npm run build` → ✓ Compiled successfully, exit 0.

### Un-block proofs (real listings, pulled via the new SELECT shapes)

Home — Mississauga geo-page proof:
```
listing_key:        W13123456 (Detached, Active)
tax_annual_amount:  14105.00   (already in old SELECT)
tax_year:           2025       (new — WAS MISSING from prior geo LISTING_SELECT)
→ HomeEstimatorBuyerModal.tsx:282-283 spread now sets BOTH subjectTaxAnnualAmount + subjectTaxYear
→ home-comparable-matcher-sales.ts:1178 (if specs.subjectTaxYear == null) DOES NOT short-circuit
→ runHomeTaxMatchCascade proceeds; taxMatch populates when band has coverage
```

Condo — X2 Condos active unit proof:
```
listing_key:        C13159484 (unit 1306, Active)
building_id:        2bcd2f02-37e1-4083-9154-c589da99a459
community_id:       a779120f-855d-410a-974f-795506b102be   (new — WAS MISSING from prior active-listings SELECT)
bedrooms_total:     2
→ EstimatorBuyerModal.tsx:323 gate (tenantId && community_id && bedrooms_total != null) NOW evaluates true
→ fetchCompetingListings({path:'condo', communityId, bedrooms, livingAreaRange}) fires
→ Competing-For-Sale rail populates when active comps exist in community
```

### No-regression confirmations

Property pages (already-working paths) — UNTOUCHED:
- app/property/[id]/page.tsx:111  uses `.select('*')` — gets all columns; not modified.
- app/property/[id]/HomePropertyPage.tsx:79  uses `.select('*')` — gets all columns; not modified.

BuildingPage byte-identical proof:
- Edit B added a column to the LISTING rows' SELECT (each unit row now carries community_id).
- BuildingPage code only references `building.community_id` (the BUILDING row's column, sourced separately) at lines 287, 592, 597, 677. Zero call sites read `listing.community_id` per-unit anywhere in BuildingPage or its consumers (`grep listing.community_id` over the file = 0 hits beyond the modal pass-through).
- The unit-card display logic (price, address, beds, baths, image) doesn't render the new column. The new column is only consumed downstream by EstimatorBuyerModal.tsx:323's gate.
- Conclusion: BuildingPage UX behavior is byte-identical pre/post; the added column is a pass-through for the modal.

Scope guards:
- 5 frozen S1 matchers: zero diff. PASS.
- 4 files changed (3 geo pages + BuildingPage). All additive. No WHERE/ORDER/LIMIT changes.
- No matcher / cascade / pricing / renderer code modified.
- Geo cascade and pricing paths: unchanged.

### P0.5(a) PARTIAL PASS → P1 brings full PASS
Operator notes: P0.5(a) was logged as PARTIAL because `tax_annual_amount` was present and `tax_year` was missing. P1's Edit A closes that gap. After P1: both fields populated → both spreads fire → matcher tax cascade reaches its cascade body for geo-card home subjects with tax data.

### Push status
HELD per operator instruction. Commit landed locally; awaiting push approval.

Pushed fbc2825; operator verifying on live walliam.ca (push-then-verify, by operator decision).

---

## P-CASCADE-REBUILD (2026-06-12) — run log

Operator-locked refinement to the geo cascade. Recon at recon/W-CASCADE-REBUILD-RECON.txt. NO rewrite, NO output regression — fine-tune the tier search so .limit applies AFTER match-filtering and Platinum anchors on a single match.

### Predicate-push set (operator-selected: Safe-superset only)
The locked predicate set in the original directive (bath ±1 home / exact condo, LAR exact, parking, locker, assoc_fee ±20%) was identified during build kickoff as semantically tighter than the existing JS funnel paths — home `applyFunnel` has no bath gate; `applyRelaxedFunnel` accepts adjacent LAR; condo `matchAcrossBuildings` has a bed-only last resort; condo `matchWithinBuilding` has BINGO/MAINT tiers that don't check LAR. Pushing those predicates into SQL would have tightened past the loosest funnel path and produced selection-shift on subjects whose anchor comp lives in the loose-path zone.

Decision (operator): SAFE-SUPERSET ONLY. Push `bedrooms_total = specs.bedrooms` and nothing else. Every funnel path in both matchers requires bed eq, so the SQL push is a mathematically guaranteed selection NOOP and only fixes the recency-truncation class. The probe (below) confirms: zero SELECTION-SHIFT across 100 subjects, 26 TRUNCATION-FIX.

### Applied changes
| Site | File | Change |
| Home geo Gold (community) query | lib/estimator/home-comparable-matcher-sales.ts | .eq('bedrooms_total', specs.bedrooms) added |
| Home geo Silver (muni) query | same | same |
| Home geo Bronze area query | same (runSFAreaQuery) | same |
| Condo geo Gold (community) query | lib/estimator/condo-comparable-matcher-sales.ts | same |
| Condo geo Silver (muni) query | same | same |
| Condo geo Bronze (area) query | same | same |
| Condo geo Platinum (building) query | same | UNCHANGED — operator spec scope was Gold/Silver/Bronze |
| Tax cascades | both matchers | UNCHANGED — tax-band pre-filter already in SQL (6/12 fix) |

### Parallelization plan applied
| Site | Before | After |
| Home geo (findHomeComparables) | Sequential await: Gd → Sv → Br → Tax | Promise.all([Gd, Sv, Br, Tax]); Platinum derives from Gold's funneled pool sequentially after |
| Condo geo (findCondoComparablesSales) | Sequential await: Pt → Gd → Sv → Br → Tax | Promise.all([Pt, Gd, Sv, Br, Tax]); anchor resolution after |
| Home tax (runHomeTaxMatchCascade) | Sequential await: community → muni | Promise.all([community, muni]); same-street Platinum derives from muniSales after |
| Condo tax (runTaxMatchCascade) | Sequential await: Pt → Gd → Sv | Promise.all([Pt, Gd, Sv]); winner select after |

### Threshold change
| Tier | Property | Before | After |
| Platinum | Home | >= 3 (L1604 pre-rebuild) | >= 1 |
| Platinum | Condo | >= 1 (already, locked c2-revert) | >= 1 (unchanged) |
| Gold/Silver/Bronze | both | unchanged | unchanged |

### Cap changes
| Section | Before | After |
| Geo comps (per tier) | top-10 (no change) | top-10 (no change) |
| Tax-match display (deduped multi-tier) | TAX_MATCH_DISPLAY_CAP=12 | TAX_MATCH_DISPLAY_CAP=10 |
| Competing-for-sale | .limit(10) / .slice(0,10) | unchanged |
| Condo matchWithinBuilding | already top-10 via scoreAndShape:786 | no edit needed (recon claim was wrong) |

### Competing ordering
Pure `list_price ASC` replaced with closeness/level priority + price tiebreak. Closeness rank = (same bed=4) + (same bath=2) + (same LAR=1); price ASC within bucket. Sites updated:
- app/api/charlie/competing-listings/route.ts — condo branch, post-fetch sort
- lib/estimator/home-comparable-matcher-sales.ts — findActiveCompetitionPlex tierQuery + area fallback, post-fetch sort
- same file — findActiveCompetitionSF runFunnels, sort applied to each funnel's output before slice

Each fetch widened from .limit(10) to .limit(100) so the bucketing has a usable spread.

### Confidence by count
Outer wrapper `calculateConfidence` over inner `_calculateConfidenceCore`. Inner is byte-identical to pre-rebuild. Wrapper appends ` Signal: <strength> (<n> comp[s]).` to confidenceMessage:
- 1 comp → weak
- 2 comps → ok
- 3–4 comps → good
- 5+ comps → strong

No new field threaded through types/matcher/renderer. CONTACT tier and 0-comp returns left untouched.

### Pricing-stability backtest (the hard gate)
scripts/probe-p-cascade-rebuild.js — N=50 home + N=50 condo random closed sales from the last 90 days. Pre/post diff of the community-tier funnel output (proxy for the matcher's pricing tier when community anchors). Classifier:
- TRUNCATION-FIX: new pool surfaced bed_eq comps the old pool truncated by recency
- SELECTION-SHIFT: new funnel output differs from old without truncation evidence
- IDENTICAL / NEUTRAL: no observable delta

Classification table (sample N=50 per stratum):
| Stratum | SELECTION-SHIFT | TRUNCATION-FIX | IDENTICAL | NEUTRAL | oldPoolsHitLimit | newBedEqIncreased | meanAbsPriceDelta |
| HOME    |        0        |       10       |    40     |    0    |        12        |        11         |     $21,778       |
| CONDO   |        0        |       16       |    34     |    0    |        16        |        16         |     $21,030       |

GATE: PASS. Zero SELECTION-SHIFT across both strata.

### Truncation-kill proof
Most dramatic example surfaced by the probe — subject listing_key C12818456 (condo):
- OLD path: community pool of 300 most-recent rows; 71 of those matched bedrooms eq (rest were other bed counts).
- NEW path: same .limit(300) but with .eq('bedrooms_total', specs.bedrooms) pushed; 267 bed_eq rows returned (every row in the 2-yr window since the community is sparse for that bedroom band — .limit(300) didn't even bind).
- Net bed_eq comps recovered: 196.
- OLD funnel produced 60 match(es); NEW funnel produced 214.
- Median close_price: OLD = $763,500, NEW = $801,500 — $38,000 shift driven entirely by previously-truncated bed_eq comps now visible.
- This is the exact bug class the 9d3e182 tax-band fix addressed for the tax cascade. P-CASCADE-REBUILD applies the same fix shape to the geo cascade.

### S1 zero-diff
S1 lives at /admin, app/api/chat/*, agent_buildings. Diff scope:
- lib/estimator/home-comparable-matcher-sales.ts (S2)
- lib/estimator/condo-comparable-matcher-sales.ts (S2)
- lib/estimator/statistical-calculator.ts (S2)
- app/api/charlie/competing-listings/route.ts (S2)
- scripts/probe-p-cascade-rebuild.js (NEW, S2 measurement-only)
- docs/W-ESTIMATOR-PATHS-TRACKER.md (this tracker)

No S1 paths touched.

### Push status
HELD per operator instruction. Commit landed locally; awaiting push approval after backtest review.

Pushed 9a451d1; operator-approved after zero-selection-shift backtest.

---

## P-SECTION-TEST + P-LEADS-RECON (2026-06-12) — run log

### P-SECTION-TEST — estimator section assembly: PASS
Build: scripts/test-estimator-sections.js (orchestrator) + app/api/test-estimator-sections/route.ts (probe; not committed, local-only). Picks one HOME subject (Detached, tax+comps+competing+tax-band-pool) and one CONDO subject (building+tax+same-building Platinum comp+competing) verified this run via direct pg, BEGIN/ROLLBACK isolated. For each of 4 cases (home-modal, home-page, condo-modal, condo-page) hits the probe (which invokes the REAL estimateHomeSale / estimateCondoSale actions + findActiveCompetition) and asserts all three sections.

Results table:

| case        | comparable-sold (tier/count/price) | tax-match (tier/count/price) | competing (count/order) | PASS/FAIL |
|-------------|------------------------------------|------------------------------|-------------------------|-----------|
| home-modal  | gold/8/$496,706                    | gold/7/$475,301              | 2/order-ok              | PASS      |
| home-page   | gold/8/$496,706                    | gold/7/$475,301              | 2/order-ok              | PASS      |
| condo-modal | platinum/3/$351,333                | platinum/4/$351,000          | 7/order-ok              | PASS      |
| condo-page  | platinum/3/$351,333                | platinum/4/$351,000          | 7/order-ok              | PASS      |

Parity (proof P1 closed the modal-vs-page section gap):
- home-parity:  anchor MATCH (gold==gold), price MATCH ($496,706==$496,706), taxMatch tier MATCH (gold==gold), taxMatch price MATCH ($475,301==$475,301), competing MATCH (2==2). PASS.
- condo-parity: anchor MATCH (platinum==platinum), price MATCH ($351,333==$351,333), taxMatch tier MATCH (platinum==platinum), taxMatch price MATCH ($351,000==$351,000), competing MATCH (7==7). PASS.

Mutation check (no write fired during test): mls_listings 1,331,508 → 1,331,508 (delta 0); agents 10 → 10 (delta 0). MUTATION: NONE.

Section verdicts (verified in production code path):
- Home Comparable Sold: WORKING (modal + page)
- Home Tax-Match:       WORKING (modal + page)
- Home Competing:       WORKING (modal + page)
- Condo Comparable Sold: WORKING (modal + page)
- Condo Tax-Match:       WORKING (modal + page)
- Condo Competing:       WORKING (modal + page)

Charlie-groundwork map (verified): 3 sections (Comparable Sold / Tax-Matched / Competing-For-Sale), modal-vs-page parity guarantee, credit-seam decoupling — modal path increments via /api/walliam/estimator/increment, page path auto-runs without incrementing. The data the matcher produces is identical on both paths.

### P-CASCADE-REBUILD — shipped 9a451d1 (2026-06-12)
Push committed at 9a451d1; tracker push-note at 216de05. Backtest pre-push: zero SELECTION-SHIFT across 100 subjects (50 home + 50 condo), TRUNCATION-FIX 10 home / 16 condo. Truncation-kill proof — subject C12818456 (condo): OLD path saw 71 bed_eq comps in the 300-row recency window, NEW path saw 267; median close_price $763.5k → $801.5k. Operator-approved push at 9a451d1.

### P-LEADS-RECON — property-page leads/emails NOT generating
Full recon in recon/W-PROPERTY-PAGE-LEADS-RECON.txt. Operator-flagged live revenue defect: property-page estimates on homes AND condos do not generate leads/emails despite the section assembly working (per P-SECTION-TEST PASS above).

PART A — BREAK POINT (lead+email chain):
- Both home and condo break at the SAME prop-wiring site:
  - CONDO: app/property/[id]/PropertyPageClient.tsx:218 — `agentId={walliamTenantId}`
  - HOME:  app/property/[id]/HomePropertyPageClient.tsx:205 — `agentId={walliamTenantId}`
- `walliamTenantId` is the WALLiam TENANTS.ID (sourced from `getCurrentTenantId()` at page.tsx:145 / HomePropertyPage.tsx:96), NOT a valid agents.id.
- The shared submit handler at EstimatorResults.tsx:106 has a falsy-only kill switch (`if (!agentId)`); a truthy tenant-UUID passes the guard.
- Submit fires → submitLeadFromForm(agentId=tenantsId) → createLead in lib/actions/leads.ts uses that value as the leads.agent_id FK. Either (a) FK rejects insert, or (b) lead persists with a bogus agent_id and getLeadEmailRecipients finds no recipients → no email. CLAIMED-UNVERIFIED which of (a)/(b) fires; both are consistent with the "no leads/emails" symptom.
- The non-WALLiam (agent-subdomain) branch is FINE — passes the real agent.id at PropertyPageClient.tsx:252 / HomePropertyPageClient.tsx:227. Operator's "modal works" observation matches: the modal's agentId derives correctly (CLAIMED-UNVERIFIED on the exact derivation; not re-traced this recon).

PART B — DEFAULT-OPEN CREDIT SEAM (metering gap, not correctness):
- Property-page CTAs auto-run the matcher on mount with no credit gate:
  - components/property/PropertyEstimateCTA.tsx:46-129 (deps [listing.id, isSale, buildingSlug, exactSqft])
  - components/property/HomePropertyEstimateCTA.tsx:30-111 (deps [listing.id, isSale, exactSqft, agentId, fetchCompetingListings])
- "Get Sale Estimate" button (PropertyHeader.tsx:118; PropertyStickyBar.tsx:94, 119) is WIRED but opens the MODAL (PropertyPageClient.tsx:108, 281, 286-300), which has its own credit+increment flow. The auto-run is a SEPARATE flow that bypasses metering.
- Modal flow to mirror: EstimatorBuyerModal.tsx:167-266 (session check L178 → if-allowed → POST /api/walliam/estimator/increment L209-218 → handleEstimate L222); HomeEstimatorBuyerModal.tsx:152-244 mirrors.
- Lease coverage: condo auto-runs lease too (PropertyEstimateCTA.tsx:70-86 calls estimateCondoRent/estimateRent on isSale=false) — same seam, same scope. Home lease is NOT implemented (HomePropertyEstimateCTA.tsx:32-35 early-exits).
- Increment endpoint sanity: app/api/walliam/estimator/increment/route.ts L16-77, tenant-scoped via session source_key match (W-RECOVERY A1.5 gate), writes chat_sessions.estimator_count. Reused not rebuilt — same route serves modal and would serve auto-run.

Parts A and B are INDEPENDENT defects on the same client files. Fix A = revenue (correctness). Fix B = metering (cost).

Status: RECON ONLY. No code changes, no commits. Operator decision next on whether to fix A first or batch both.

---

## P-LEADS-FIX (2026-06-12) — run log

Fixes the live revenue defect mapped in recon/W-PROPERTY-PAGE-LEADS-RECON.txt and pre-verified in recon/W-LEADS-FIX-PREVERIFY.txt. Property-page hero branch was passing tenant UUID (auto-CTA) or '' (button-modal) as agentId, causing every lead-write to FK-reject. Hierarchy guardrails (FKs, resolver, email chain, recipients, increment) untouched — fix makes data satisfy them.

### Composite-FK verification (pre-flight)
Direct pg query against production this run:
```
SELECT id, tenant_id, email, full_name, can_create_children FROM agents
WHERE id = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';
```
| id | tenant_id | email | full_name | can_create_children |
|----|-----------|-------|-----------|---------------------|
| fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe | b16e1039-38ed-43d7-bbc5-dd02bb651bc9 | kingshahone@gmail.com | King Shah | true |

King Shah's tenant_id matches the WALLiam tenant id b16e1039. The composite `leads_agent_tenant_consistency` constraint will accept (agent_id, tenant_id) = (KingShah.id, WALLiam.id). PROCEED.

### Edits — Option (b), surgical new prop
Hierarchy-load-bearing `agent={isHero ? null : agent}` nulling on parent pages LEFT IN PLACE. Added a separate `walliamAgentId` prop alongside the existing `walliamTenantId`.

Parent pages — expose resolved agent.id:
- app/property/[id]/page.tsx:~402 — added `walliamAgentId={agent?.id ?? null}` to `<PropertyPageClient>`
- app/property/[id]/HomePropertyPage.tsx:~313 — added `walliamAgentId={agent?.id ?? null}` to `<HomePropertyPageClient>`

PageClient interfaces + destructure:
- app/property/[id]/PropertyPageClient.tsx — added `walliamAgentId?: string | null` to props interface + destructured default null
- app/property/[id]/HomePropertyPageClient.tsx — same

4 lead-prop sites:
- PropertyPageClient.tsx:~218 (auto-CTA, hero branch): `agentId={walliamAgentId || ''}` (was `walliamTenantId`)
- PropertyPageClient.tsx:~295 (button-modal): `agentId={agent?.id || walliamAgentId || ''}` (was `agent?.id || ''`) — agent-subdomain branch (agent non-null) unchanged; hero branch (agent null) now uses walliamAgentId
- HomePropertyPageClient.tsx:~205 (auto-CTA, hero branch): `agentId={walliamAgentId || ''}` (was `walliamTenantId`)
- HomePropertyPageClient.tsx:~261 (button-modal): `agentId={agent?.id || walliamAgentId || ''}` (was `agent?.id || ''`)

Agent-subdomain (non-hero) branches at PropertyPageClient.tsx:~252 and HomePropertyPageClient.tsx:~227 still pass `agentId={agent.id}` — byte-identical to pre-fix. Only the hero branch resolves differently.

False-submit fix — EstimatorResults.tsx + HomeEstimatorResults.tsx:
- Added `submitError` state (cleared on each submit attempt).
- Introduced `leadSucceeded` flag inside handleContactSubmit; only `setSubmitted(true) + setShowContactForm(false)` when the flag is true.
- On `!leadResult.success` or `catch`: `setSubmitError(...)` with the server's error message or a generic retry message.
- Added an accessible `role="alert"` error banner inside both form sites (the contact-tier "Get Your Free Valuation" form and the disclaimer-banner "Connect with Your Agent" form) so the user sees the failure and can retry.

### Hierarchy untouched
- Both FKs (leads_agent_id_fkey + leads_agent_tenant_consistency composite) preserved — unmodified.
- resolveAgentForContext, getOrCreateLead, submitLeadFromForm, getLeadEmailRecipients — unmodified.
- `agent={isHero ? null : agent}` nulling left intact at page.tsx:397 + HomePropertyPage.tsx:308.
- Increment endpoint, email chain, recipients resolution, DB schema — unmodified.
- Condo `notAsIs` gap — not touched (out of scope per prior recon).

### Build
`npm run build` → exit 0. The Dynamic-server-usage warnings on /api/admin-homes/*, /api/chat/vip-approve, etc. are pre-existing Next.js notices for cookie/request-url usage — not failures.

### Code-test (scripts/test-p-leads-fix.js, SAVEPOINT-isolated)
| Verdict | Result |
|---------|--------|
| 1. NEW wiring (King Shah agent_id) satisfies both FKs | PASS (insert succeeded inside transaction, rolled back) |
| 2. OLD wiring (WALLiam tenant UUID as agent_id) FK-rejects | PASS — error code 23503, constraint `leads_agent_id_fkey` |
| 3a. Email recipients resolve King Shah email | PASS — kingshahone@gmail.com |
| 3b. Recipients of OLD wiring resolve to null | PASS — agents lookup for tenant UUID returns no row |
| 4. False-submit fix (simulation) | PASS — success → submitted=true; reject → submitted=false + error; throw → submitted=false + error |
| 5. Mutation check | PASS — leads row count 201 → 201 (delta 0) |

OVERALL: PASS. All proofs in one run.

### Scope guards confirmed
- S1 untouched: no `/admin`, `app/api/chat/*`, `agent_buildings` paths in this diff.
- Agent-subdomain path byte-identical: both PageClients' non-hero branches (PropertyPageClient.tsx:~252, HomePropertyPageClient.tsx:~227) still pass `agent.id`.
- No FK weakening, no resolver change, no email-path change, no schema change.

### Push status
HELD per operator instruction. Commit landed locally; awaiting push approval.

Pushed f4b555c; operator-approved. Live lead capture restored on walliam.ca property pages (home + condo).

---

## P-WORKING-DOC (2026-06-12) — run log

Refinement of EXISTING email paths: the estimator result now travels as a full 3-section working document on the lead row + agent email + a NEW property-page buyer copy. ONE shared render helper, tenant-correct property links via `buildBaseUrl(tenantDomain)`, no matcher re-run. Hierarchy + FKs + resolver + recipients + increment all untouched.

### Pre-flight findings
- `ComparableSale.listingKey` carries the MLS key (string); the `mls_listings.id` (UUID, used by `/property/[id]`) is NOT on the type. Batch-resolved at render time via `resolveListingIds`.
- `CompetingListing` carries both `id` and `listing_key` — its tiles already have the id pre-resolved.
- `/property/[id]` queries `mls_listings.id` (page.tsx:54). Tile hrefs must be UUID-keyed.

### Canonical JSON schema (persisted on `leads.property_details.workingDoc`)
```
{
  version: 1,
  type: 'home' | 'condo',
  subject: { buildingName, buildingAddress, unitNumber, bedrooms, bathrooms, livingAreaRange },
  estimate: { estimatedPrice, priceRange, matchTier, bestGeoTier, confidence, confidenceMessage },
  comparableSold: { bestGeoTier, count, estimatedPrice, median, tiles: WorkingDocTile[] } | null,
  taxMatch:       { bestGeoTier, count, estimatedPrice, tiles: WorkingDocTile[] }          | null,
  competing:      { count, tiles: WorkingDocTile[] }                                        | null,
}
```
Reconstructable into the email render WITHOUT running the matcher. Capped at 10 tiles per section. Backwards-compat with existing buildingName/buildingAddress/unitNumber summary fields (additive).

### Foundation — capture + persist
- `app/estimator/components/EstimatorResults.tsx` — handleContactSubmit builds the workingDoc subset from the already-computed `result` + `competingListings` and threads it via `propertyDetails.workingDoc`.
- `app/estimator/components/HomeEstimatorResults.tsx` — mirror.
- `app/actions/submitLeadFromForm.ts` — no change required (`propertyDetails: any` forwards the new nested field unchanged).
- `lib/actions/leads.ts:210` — `property_details: params.propertyDetails || null` write unchanged (the JSON now carries `workingDoc`).

### Shared render helper (NEW)
- `lib/email/working-doc-render.ts` — single source for:
  - `WorkingDoc` / `WorkingDocSection` / `WorkingDocTile` types
  - `resolveListingIds(supabase, keys)` — batch listing_key → mls_listings.id
  - `collectListingKeys(doc)` — pull every key-needing-resolution
  - `renderEstimateHeader(doc, opts)` — top estimate block (audience-aware)
  - `renderWorkingDocSections(doc, baseUrl, idMap, opts)` — 3-section render
  - `buildWorkingDocFromResult(...)` — server-side subset builder (currently the client does this inline; helper available for follow-ups)

### Agent email — enriched from stub to full doc
- `lib/actions/leads.ts buildLeadEmail` — extended signature accepts `workingDoc`, `baseUrl`, `idMap`, `brandName`. Existing contact block preserved; the 3 sections render via the shared helper when workingDoc is present. Tenant-correct property hrefs.

### NEW property-page buyer copy
- `lib/actions/leads.ts buildBuyerWorkingDocEmail` — new template, buyer-safe phrasing.
  - NO "New Lead" header
  - NO "Reply to {name}" CTA
  - NO agent PII (no other recipients' emails, no agent contact block)
  - Same 3 sections + same tenant-correct hrefs as the agent email (one render, two audiences)
- `lib/actions/leads.ts createLead` — adds a SECOND `sendTenantEmail` call targeting `params.contactEmail` AFTER the agent send. Guards: `contactEmail` present + plausibly valid + at least one workingDoc section non-empty. Failure of buyer send does not block the agent send.

### Hierarchy untouched (verified by code-test)
- `getLeadEmailRecipients` signature + 6-layer chain implementation UNCHANGED.
- Agent send still goes to `recipients.to / cc / bcc` from the helper.
- Buyer send is a SEPARATE `sendTenantEmail` call to `contactEmail` only — does not co-mingle with the hierarchy recipients.
- `logEmailRecipients` called for both sends with distinct `templateKey` ('leads_helper_new_lead_notification' for agent, 'leads_helper_buyer_working_doc' for buyer).

### Care guards
- FKs (leads_agent_id_fkey + composite consistency): UNTOUCHED
- `resolveAgentForContext`, `getOrCreateLead`, `getLeadEmailRecipients`, `sendTenantEmail` internals: UNTOUCHED
- Increment endpoint, DB schema: UNTOUCHED
- `buildBaseUrl`: reused (already canonical, already correct)
- Multi-tenant: `tenantDomain` resolved per-tenant via `tenants.domain` SELECT; never hardcoded
- S1 zero-diff: no `/admin`, `app/api/chat/*`, `agent_buildings` paths touched
- Charlie's `buildUserApprovalEmailHtml` (charlie/vip-request): UNTOUCHED
- S1 vip-request builder: UNTOUCHED

### VIP buyer email (estimator) — DEFERRED
The operator's spec included enriching `buildUserApprovalEmailHtml` (estimator) with the same shared helper. That path is fired from MODAL flows (EstimatorBuyerModal / HomeEstimatorBuyerModal / EstimatorVipWrapper), not from the property-page CTA. The VIP route currently does not receive a workingDoc payload — wiring it requires:
- Modal-side: build the same workingDoc subset (mirroring EstimatorResults.tsx handleContactSubmit) and include it in the vip-request POST body.
- Route-side: parse + render via the shared helper into the user-approval email.

The shared render helper is in place and ready for that integration; the wiring itself is the focused follow-up. Charlie's VIP buyer email + S1 vip-request remain UNTOUCHED per spec.

### Build
`npx tsc --noEmit` → exit 0
`npm run build` → exit 0 (pre-existing dynamic-server warnings unchanged)

### Code-test (scripts/test-p-working-doc.js, SAVEPOINT-isolated, no real send, no row persist)
| # | Verdict | Result |
|---|---------|--------|
| 1 | Persist (workingDoc round-trips on `leads.property_details`) | **PASS** — JSON inserted + read-back, all 3 section arrays present |
| 2 | Reconstructable (3 sections rendered from persisted JSON, no matcher re-run) | **PASS** |
| 3 | Agent email — 3 sections + tenant-correct hrefs (walliam.ca, zero condoleads) | **PASS** |
| 4 | Buyer email — PII-clean (no "New Lead", no "Reply to", no agent email) | **PASS** |
| 5 | Mutation delta = 0 (BEGIN/ROLLBACK) | **PASS** — leads 201 → 201 |
| 6 | Recipient hierarchy untouched (King Shah agent row intact) | **PASS** |

Sample property hrefs (both agent + buyer):
- `https://walliam.ca/property/ce215210-45c3-46fd-9deb-14f1ef46b274`
- `https://walliam.ca/property/8473b0a7-2f27-4a9b-a2fc-c67d6c98f658`
- `https://walliam.ca/property/c95533dd-eac8-4e01-8583-c5bf5db934d6`

All hrefs resolved via real `mls_listings.id` via the batch listing_key resolver — confirms production listings round-trip cleanly.

### Push status
HELD per operator instruction. Commit landed locally; awaiting push approval.

---

## P-WORKING-DOC Step 3 (2026-06-12) — estimator VIP buyer-email enrichment (completes b9336dc)

### Honest correction
`b9336dc`'s commit message claimed the shared render helper rendered into "the agent lead email, a NEW buyer copy on the property-page path, and the existing estimator VIP buyer email." Step 3 (the VIP buyer) was actually DEFERRED in that commit — flagged in the tracker under "VIP buyer email enrichment — DEFERRED" — but the commit message did not match. This commit ships Step 3 for real so the record is accurate. Not papered over: the deferral was reported in the executor's response to `b9336dc`; the re-issued spec confirmed Step 3 should ship.

### Modal-side capture (POST body now carries workingDoc)
- `app/estimator/components/EstimatorBuyerModal.tsx` — `handleWalliamVipSubmit` builds the same 3-section workingDoc subset that EstimatorResults already produces and includes it in the POST to `/api/walliam/estimator/vip-request`. Guarded on `result` being non-null (modal may VIP-request before estimating).
- `app/estimator/components/HomeEstimatorBuyerModal.tsx` — mirror.
- Backwards-compat: when `result` is null at VIP-request time (older flow / VIP-before-estimate), `workingDoc` is sent as `null`; the route renders the legacy approval body.

### Route render
- `app/api/walliam/estimator/vip-request/route.ts`:
  - Imports the shared helper (`resolveListingIds`, `collectListingKeys`, `renderEstimateHeader`, `renderWorkingDocSections`) from `lib/email/working-doc-render.ts`. ONE render impl reused.
  - POST body destructure now picks up `workingDoc` (optional, typed inline via `WorkingDoc | null`).
  - Before the user-approval send: batch-resolve listing-ids via `resolveListingIds(supabase, collectListingKeys(wd))`.
  - `buildUserApprovalEmailHtml` signature extended to accept `workingDoc?: WorkingDoc | null` and `idMap?: Record<string, string>`. The 3-section block (`renderEstimateHeader` + `renderWorkingDocSections`) is spliced into the email body when `workingDoc` is present; when absent, the existing approval body renders unchanged.

### Care guards (verified)
- Charlie's `buildUserApprovalEmailHtml` in `app/api/walliam/charlie/vip-request/route.ts`: UNTOUCHED.
- S1 `app/api/chat/vip-request/route.ts` builder: UNTOUCHED.
- Only the **estimator** VIP buyer template enriched.
- FKs / resolver / recipients / increment / `sendTenantEmail` internals: UNTOUCHED.
- Multi-tenant: `baseUrl = buildBaseUrl(tenantDomain)` (already resolved earlier in the route) — never hardcoded.
- S1 zero-diff: no `/admin`, `app/api/chat/*`, `agent_buildings` paths in diff.

### Build
`npx tsc --noEmit` → exit 0
`npm run build` → exit 0

### Extended SAVEPOINT test (scripts/test-p-working-doc.js)
9 verdicts, ALL PASS — previous 6 re-run + 3 new:

| # | Verdict | Result |
|---|---------|--------|
| 1 | Persist (workingDoc round-trips on `leads.property_details`) | PASS |
| 2 | Reconstructable (3 sections render from persisted JSON, no matcher re-run) | PASS |
| 3 | Agent email — 3 sections + tenant-correct hrefs | PASS |
| 4 | Buyer email (property-page) — PII-clean | PASS |
| 5 | Mutation delta = 0 (BEGIN/ROLLBACK) | PASS — leads 201 → 201 |
| 6 | Recipient hierarchy untouched | PASS |
| **7** | **VIP buyer email — 3 sections + tenant-correct hrefs (walliam.ca/property/{uuid})** | **PASS** |
| **8** | **VIP buyer email — PII-clean (no "New Lead", no "Reply to", no agent email)** | **PASS** |
| **9** | **VIP backwards-compat — absent workingDoc renders legacy body, no crash, no "undefined"/"null" leakage** | **PASS** |

Sample VIP-buyer property hrefs (all walliam.ca/property/{uuid}, zero condoleads):
- `https://walliam.ca/property/ce215210-45c3-46fd-9deb-14f1ef46b274`
- `https://walliam.ca/property/8473b0a7-2f27-4a9b-a2fc-c67d6c98f658`
- `https://walliam.ca/property/c95533dd-eac8-4e01-8583-c5bf5db934d6`

### Push status
HELD per operator instruction. b9336dc + this commit ready to push together after approval.

Pushed b9336dc + 45f5441; operator-approved. Full P-WORKING-DOC spec live — workingDoc persisted + rendered into agent, property-page buyer, and estimator VIP buyer emails via one shared helper; b9336dc message reconciled honest by 45f5441.

---

## P-WORKING-DOC-DASHBOARD (2026-06-12) — agent lead-detail view renders the persisted working doc

### Pre-flight findings
- **Lead query already pulls `property_details`** — `app/dashboard/leads/[id]/page.tsx:25` uses `select('*')`, so the jsonb column (including `workingDoc`) is already in the row. No SELECT widening needed.
- **Helper data + HTML are already separately exported** in `lib/email/working-doc-render.ts`. The React render can import the SHAPING (`WorkingDoc`, `WorkingDocSection`, `WorkingDocTile`, `resolveListingIds`, `collectListingKeys`) without pulling the email-HTML emitters (`renderEstimateHeader`, `renderWorkingDocSections`). NO split needed.
- **S2 confirmed** — `/dashboard` is S2 (CLAUDE.md: S1 = `/admin`, `app/api/chat/*`, `agent_buildings`). No S1 touch.
- **Tenant scoping intact** — `requireAgent` + `canAgentSeeLead(agent.id, lead.agent_id)` gate the page; this phase does NOT touch either.
- **Listing-id resolution** — same `resolveListingIds` batch query the emails use. Tile links via `buildBaseUrl(tenantDomain)` → `walliam.ca/property/{uuid}`.

### Design — persisted SNAPSHOT (live re-fetch deferred)
The dashboard renders the workingDoc the same way the emails do — the agent sees what was submitted, consistent with what was sent. Live re-fetch of comparable prices/statuses is a deferred enhancement (own workstream).

### Edits
- **NEW `components/dashboard/WorkingDocView.tsx`** (React, 'use client', Tailwind-styled):
  - Consumes `WorkingDoc`, `WorkingDocSection`, `WorkingDocTile` types imported from `lib/email/working-doc-render`.
  - Three section renderers (Comparable Sold / Tax-Matched / Competing For Sale) + tile rows.
  - Per-tile property link constructed from `idMap` (passed in from server) + `baseUrl` (tenant-correct).
  - Returns `null` when `workingDoc` is absent — graceful for legacy leads.
- **`app/dashboard/leads/[id]/page.tsx`** server-side assembly:
  - Imports `buildBaseUrl` + `resolveListingIds` + `collectListingKeys` + `WorkingDoc` type.
  - Pulls `workingDoc` from `lead.property_details.workingDoc` (already in scope).
  - One `tenants.domain` lookup per page load (by `lead.tenant_id` — never hardcoded).
  - `workingDocBaseUrl = buildBaseUrl(tenantDomain)`.
  - `workingDocIdMap = await resolveListingIds(supabase, collectListingKeys(workingDoc))` (skipped when `workingDoc` absent).
  - Threads the three new optional props to `LeadDetailClient`.
- **`components/dashboard/LeadDetailClient.tsx`**:
  - Three new optional props on the interface (`workingDoc`, `workingDocBaseUrl`, `workingDocIdMap`).
  - Embeds `<WorkingDocView ... />` between the header and the existing grid. When all three are absent, the child renders nothing — the existing Lead Information / Notes / Tags layout is unaffected.

### Care guards (verified)
- Lead query tenant scoping + RLS: UNTOUCHED.
- `requireAgent` + `canAgentSeeLead` hierarchy check: UNTOUCHED.
- Email helpers (`renderEstimateHeader`, `renderWorkingDocSections`, `sendTenantEmail`, `buildLeadEmail`, `buildBuyerWorkingDocEmail`, `buildUserApprovalEmailHtml`): UNTOUCHED — the dashboard imports only the **shaping** utilities + types, not the HTML emitters.
- `buildBaseUrl` reused (single source of truth for tenant URL resolution).
- FKs / `resolveAgentForContext` / `getLeadEmailRecipients` / increment / `sendTenantEmail` internals: UNTOUCHED.
- S1 zero-diff: no `/admin`, `app/api/chat/*`, `agent_buildings` paths.

### Build
- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0

### SAVEPOINT-isolated test (scripts/test-p-working-doc-dashboard.js)
The React render is type-checked by `tsc` (already passed). The test exercises the DATA-ASSEMBLY layer (which is where the failure modes live):

| # | Verdict | Result |
|---|---------|--------|
| 1 | `tenant.domain` resolves from the LEAD's `tenant_id` (not hardcoded); WALLiam tenant → `walliam.ca` | **PASS** |
| 2 | 3 sections present on the persisted workingDoc (round-trips through `select('*')`) | **PASS** |
| 3 | Tile links tenant-correct: `https://walliam.ca/property/{uuid}` (zero `condoleads`), 6 links sampled | **PASS** |
| 4 | Legacy lead (no `workingDoc` on `property_details`): graceful — empty `idMap`, no crash, no `undefined`/`null` leak; component returns null | **PASS** |
| 5 | Mutation delta = 0 (BEGIN/ROLLBACK; leads 201 → 201) | **PASS** |

Sample tile links (all walliam.ca/property/{uuid}):
- `https://walliam.ca/property/ce215210-45c3-46fd-9deb-14f1ef46b274`
- `https://walliam.ca/property/8473b0a7-2f27-4a9b-a2fc-c67d6c98f658`
- `https://walliam.ca/property/c95533dd-eac8-4e01-8583-c5bf5db934d6`

### Push status
HELD per operator instruction. Commit landed locally; awaiting push approval.

Pushed 0f3f5e0; operator-approved. Agent lead-detail view now renders the full working document (3 sections + tenant-correct links), consistent with the buyer/agent emails; legacy leads fall back gracefully.

---

## P-DEFAULT-GATE (2026-06-12) — property-page auto-fire removed; teaser CTA opens the metered modal

### Pre-flight findings (read-only, verified)
- **Session route reuses sessionId** for same `(source, user_id, tenant_id)`: confirmed at `app/api/walliam/estimator/session/route.ts:123-136` — SELECT existing active/vip session, ORDER BY last_activity_at DESC LIMIT 1; only creates new when none exists. **PLUS** the DB enforces a UNIQUE index on `(user_id, tenant_id, source)` (`idx_chat_sessions_user_tenant_source_unique`, discovered this turn) — two active sessions for the same triple are physically impossible.
- **Modal in-flight guard already present**: `EstimatorBuyerModal.tsx:110-114` useEffect gates `checkAndEstimate()` behind `!result && !loading && !sessionLoading`. `setSessionLoading(true)` is set BEFORE the session fetch (L174). Mirrors in `HomeEstimatorBuyerModal.tsx`.
- **Idempotent open-trigger**: both header + sticky-bar + (new) inline-teaser buttons call `setShowEstimatorModal(true)` — a boolean setter that's idempotent.
- **Verdict: NO new guard needed.** The combination of UNIQUE index + in-flight `!sessionLoading` guard + idempotent boolean opener covers all stated double-trigger scenarios. (Close + reopen for the same subject is an explicit separate user action and remains its own metered call by design.)

### Fix (Option A + inline teaser)
- **PropertyEstimateCTA.tsx** — full rewrite as a teaser-only component (78 lines, was ~180):
  - Removed: action imports (`estimateCondoSale`, `estimateCondoRent`, `estimateSale`, `estimateRent`), `EstimatorResults` import, `useCompetingListings` hook, the `useEffect`-based auto-fire, all `result`/`loading`/`error` state.
  - Added: `onEstimateClick?: () => void` prop; renders a sale/lease-aware teaser CTA whose button calls `onEstimateClick`.
- **HomePropertyEstimateCTA.tsx** — same shape; home lease still returns null (matches pre-fix behavior). Sale teaser button calls `onEstimateClick`.
- **PropertyPageClient.tsx** — both inline CTA call-sites (hero branch + agent-subdomain branch) now pass `onEstimateClick={() => setShowEstimatorModal(true)}` — the SAME handler the header + sticky-bar buttons use.
- **HomePropertyPageClient.tsx** — same.
- **Modal flow** — UNCHANGED. The teaser opens the existing metered modal; the modal's `checkAndEstimate` (session check → if-allowed → increment → estimate) is the single source of truth for metering.

### Backend untouched (verified)
- `app/api/walliam/estimator/session/route.ts` — UNCHANGED (sha 0534c79e0ba2, metering markers intact: `estimator_free_attempts`, `user_credit_overrides`).
- `app/api/walliam/estimator/increment/route.ts` — UNCHANGED (sha 4f5cb2300b2b, W-RECOVERY A1.5 auth gate + `estimator_count` write intact).
- `chat_sessions`, `user_credit_overrides`, `vip_requests` schemas: UNTOUCHED.
- Charlie endpoints, AI chat (S1), S1 `/api/estimator/*`: UNTOUCHED.
- FKs / resolver / recipient hierarchy / increment endpoint internals: UNTOUCHED.

### Build
- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0

### Test (scripts/test-p-default-gate.js) — 12/12 PASS
| # | Verdict | Result |
|---|---------|--------|
| 1a | Condo CTA: auto-fire imports/effect REMOVED (regex on actual imports, not docblock strings) | **PASS** |
| 1b | Home CTA: auto-fire imports/effect REMOVED | **PASS** |
| 1c | Condo CTA: teaser CTA with `onEstimateClick` PRESENT | **PASS** |
| 1d | Home CTA: teaser CTA with `onEstimateClick` PRESENT | **PASS** |
| 2a | Condo PageClient threads `onEstimateClick` (≥4 sites — header + stickybar + 2 inline) | **PASS** (count=5) |
| 2b | Home PageClient threads `onEstimateClick` (≥4 sites) | **PASS** (count=5) |
| 3a | Condo modal in-flight guard (`!sessionLoading`) intact | **PASS** |
| 3b | Home modal in-flight guard (`!sessionLoading`) intact | **PASS** |
| 4a | **UNIQUE index on (user_id, tenant_id, source) prevents dup sessions** (DB-level proof) | **PASS** |
| 4b | Session route SELECT returns same id on rapid re-call | **PASS** |
| 5a | Session route metering markers intact (no diff) | **PASS** (sha 0534c79e0ba2) |
| 5b | Increment route W-RECOVERY A1.5 + `estimator_count` markers intact (no diff) | **PASS** (sha 4f5cb2300b2b) |
| 6 | Mutation delta = 0 (BEGIN/ROLLBACK on chat_sessions) | **PASS** (2127 → 2127) |

### Why "ONE subject = ONE debit" is now structurally enforced
Three independent layers:
1. **UI layer** — header / sticky-bar / inline-teaser all call the same `setShowEstimatorModal(true)` (idempotent boolean setter). Cannot fire twice while modal is open.
2. **Modal layer** — `useEffect` guarded by `!sessionLoading` (mutex). `checkAndEstimate` sets `sessionLoading=true` before the network call. Re-fires within the same open cycle are silently dropped.
3. **DB layer** — `idx_chat_sessions_user_tenant_source_unique` makes a duplicate active session for the same user+tenant physically impossible. Even under race conditions, the session route can only return ONE sessionId per user+tenant. (Discovered this turn; documented for follow-on workstreams.)

### Push status
HELD per operator instruction. Commit landed locally; awaiting push approval.

Pushed 4db3a7f; operator-approved. Property-page estimator gated — no auto-fire; single metered modal entry; one subject = one debit (UNIQUE index + in-flight guard + idempotent opener); backend untouched.

---

## C-PLAN-DOC (2026-06-13) — Charlie plan email renders the full working document

First Charlie enhancement after W-CHARLIE-RECON. Additive-only, no regression. Threads the seller-estimate runner's modern matcher output (P-CASCADE-REBUILD: tax-match + Platinum/Gold/Silver/Bronze tiers + exhaustive cascade) into the plan email via the SHARED working-doc render helper. Same render the estimator emails + dashboard already use — ONE render impl, now five surfaces.

### Pre-flight findings (read-only, verified)
- `SellerEstimateRunner.tsx` produces raw `EstimateResult` (via `onEstimateReady({ estimate, comparables, competingListings, ... })`); does NOT shape into WorkingDoc. → Build shapes it at the useCharlie seam via `buildWorkingDocFromResult` (existing helper export, no logic duplication).
- `SellerEstimateRunner` renders `null` on success — it has NO UI. There's no "runner UI gap" to log; any UI surface for tax-match/tiers lives elsewhere (out of scope here).
- `plan-email/route.ts`:
  - Already has `tenantId` + `domain` in scope via `validateSession` helper.
  - Already computes `BASE_URL = buildBaseUrl(domain)` (L82).
  - Existing optional `sellerEstimate` param renders comparable-sold (~L566) + competing (~L593) blocks conditionally; the workingDoc render slot anchors right after these, before vipHtml.
- `useCharlie.ts`:
  - Plan-email POST at L464-484 carries `sellerEstimate: stateRef.current.sellerEstimate`. `workingDoc` adds beside it.

### Edits
- `app/charlie/hooks/useCharlie.ts`:
  - Imports `buildWorkingDocFromResult` from the shared helper.
  - Before the plan-email POST, computes `workingDoc` from `stateRef.current.sellerEstimate` via the helper (path → 'home'|'condo', subject fields, result, competingListings). NULL when no seller estimate ran this session.
  - Adds `workingDoc` to the POST body alongside `sellerEstimate`.
- `app/api/charlie/plan-email/route.ts`:
  - Imports `WorkingDoc` type + `resolveListingIds`, `collectListingKeys`, `renderEstimateHeader`, `renderWorkingDocSections` from the shared helper.
  - Destructures `workingDoc` from the POST body (optional).
  - Before sending: if `workingDoc` present, batch-resolves `mls_listings.id` for every tile's `listing_key` via `resolveListingIds(supabase, collectListingKeys(workingDoc))`. Empty map otherwise.
  - Extends `buildRichPlanEmail` signature with optional `workingDoc?: WorkingDoc | null` + `workingDocIdMap?: Record<string,string>`.
  - Inside the email body builder: computes `workingDocHtml` via `renderEstimateHeader(audience='buyer') + renderWorkingDocSections(audience='buyer')` when workingDoc is present; empty string otherwise.
  - Splices `${workingDocHtml}` into the email body right after the existing `${comparableSoldHtml}${competingHtml}` and before `${vipHtml}`.

### Care guards (verified by test)
- `app/api/charlie/route.ts` (chat stream + generate_plan stub at L728-743): UNTOUCHED — no matcher call introduced, planReady stub intact. Chat SSE events, word-by-word streaming, message/plan increment RPCs, gates, low-credit email, 13 tools' schemas, tenant system prompt, per-tenant Anthropic key: all unchanged.
- `app/api/walliam/charlie/vip-request/route.ts` `buildUserApprovalEmailHtml` (Charlie's buyer-approval email): UNTOUCHED — no working-doc-render imports added. Deliberate W-WORKING-DOC Step 3 boundary preserved.
- `audience='buyer'` on both render calls — plan email goes to the prospect; PII-safe.
- Per-tenant `baseUrl = buildBaseUrl(tenantDomain)` (already in scope from the existing validateSession path) — never hardcoded.
- S1 (`app/api/chat/*`, `/admin`, `agent_buildings`): zero diff.

### Credit metering — render-only, no debit change
- `plan-email/route.ts` does NOT call `/api/walliam/estimator/increment` (verified by test).
- Charlie's plan pool (`chat_sessions.buyer_plans_used` / `seller_plans_used`) is already debited at `generate_plan` tool call in the chat stream — UNTOUCHED here.
- `estimator_count` is NOT incremented by this enhancement. One seller-plan request = ONE plan-pool debit (the existing flow). 1-action-1-debit invariant preserved.

### Build
- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0

### Test (scripts/test-c-plan-doc.js) — 19/19 PASS

Static-code + DB proof checks:

| Group | Verdict | Result |
|---|---|---|
| useCharlie imports `buildWorkingDocFromResult` from shared helper | | PASS |
| useCharlie shapes workingDoc + threads into POST body | | PASS |
| useCharlie maps runner `path` → working-doc `type` (home/condo) | | PASS |
| plan-email imports shared helper module | | PASS |
| plan-email imports all 4 needed exports (resolveListingIds + collectListingKeys + renderEstimateHeader + renderWorkingDocSections) | | PASS |
| plan-email destructures `workingDoc` from POST body | | PASS |
| plan-email batch-resolves listing-ids via shared helper | | PASS |
| plan-email renders header + 3 sections via shared helper | | PASS |
| plan-email splices `${workingDocHtml}` into email body | | PASS |
| plan-email render uses `audience='buyer'` (PII-safe for prospect) | | PASS |
| **Backwards-compat: workingDoc absent → empty string (byte-identical email)** | | **PASS** (key regression gate) |
| plan-email does NOT call `/api/walliam/estimator/increment` | | PASS |
| plan-email still inserts lead row | | PASS |
| plan-email still logs `plan_generated` activity | | PASS |
| plan-email still uses `getLeadEmailRecipients` (6-layer chain) | | PASS |
| plan-email still uses `attemptTenantEmail` (F-EMAIL-CALLER pattern) | | PASS |
| Chat stream: `generate_plan` stub intact (planReady: true) | | PASS |
| Chat stream: NO matcher calls (still stub) | | PASS |
| Charlie VIP buyer-approval builder UNTOUCHED (no working-doc imports) | | PASS |

### Regression contract satisfied
The C-RECON Part D checklist gates this enhancement. Every item touched by the edits is verified intact:
- Chat-stream behavior (SSE events, streaming, metering, gates, 13 tools, system prompt, per-tenant key): file untouched.
- plan-email shape additions: nullable-additive only. Existing POST body fields (sessionId, userId, planType, plan, analytics, listings, geoContext, comparables, sellerEstimate, vipCreditUsed, vipCreditPlansUsed, vipCreditTotal, blocks) all preserved.
- Charlie VIP email builder: untouched.
- S1 routes (`app/api/chat/*`): zero diff.

### Push status
HELD per operator instruction. Commit landed locally; awaiting push approval.

Pushed df2ec76; operator-approved. Charlie plan email now renders the full working document (tax-match + P/G/S/B tiers + 3 sections, tenant-correct links) via the shared helper; nullable-additive, backwards-compat byte-identical; chat stream/tools/metering/VIP email untouched; credit invariant preserved.

---

## C-CHAT-VALUATION (2026-06-13) — in-chat seller valuation renders the full working document

UI-only enhancement on top of C-PLAN-DOC. The seller-estimate runner already computed tier-true matcher data (Platinum/Gold/Silver/Bronze, tax-match) and stored it in `state.sellerEstimate` BEFORE the chat begins — but the result panel was rendering only summary fields (price range + market snapshot). This change adds the full working document (tax-match + tiers + 3 sections) inline beneath the existing summary, REUSING the React WorkingDocView built for the dashboard.

### Pre-flight findings (verified)
- **Result-panel component** is `app/charlie/components/ResultsPanel.tsx`. SellerEstimate block at L248-338. Today's sub-sections: Property Estimate (via `SellerEstimateBlock`), Competing For Sale (`ActiveListingCard`), Pricing Strategy & Risk (`PricingRiskBlock`), and a "Your Seller Strategy" card. **NO tier badges, NO tax-match, NO working-doc 3-section render.**
- **state.sellerEstimate shape** at render time: full EstimateResult + comparables + competingListings + buildingName + intent + path — works directly with `buildWorkingDocFromResult` (already imported in useCharlie post-C-PLAN-DOC).
- **WorkingDocView reuse**: `components/dashboard/WorkingDocView.tsx` exists (P-WORKING-DOC-DASHBOARD), is a 'use client' React component with props `workingDoc | null + baseUrl + idMap`. Reusable as-is — no logic rebuilt. Email-HTML emitters (`renderEstimateHeader`/`renderWorkingDocSections`) are NOT imported by either the wrapper or the view; this is one schema, two render surfaces.

### Build
- **NEW `app/charlie/components/InChatWorkingDoc.tsx`** (one wrapper component, no logic duplication):
  - Imports `buildWorkingDocFromResult` + `collectListingKeys` + the `WorkingDoc` type from the shared helper.
  - Imports `WorkingDocView` from the dashboard (React reuse).
  - Imports `supabase` client (the same singleton SellerEstimateRunner uses).
  - `useMemo` shapes the runner's raw `EstimateResult` into a `WorkingDoc` via `buildWorkingDocFromResult` (path='home'|'condo', subject fields, result, competingListings).
  - `useEffect` does CLIENT-SIDE batch resolve `listing_key → mls_listings.id` via the supabase client (mirrors `resolveListingIds` from the shared helper). Cleanup flag prevents stale setState on unmount.
  - `baseUrl = window.location.origin` — browser-native, inherently tenant-correct (the widget runs on the tenant's host; links resolve to the same host). No tenant-domain threading needed in client state.
  - Returns `null` when sellerEstimate is absent/incomplete — graceful backwards-compat.
- **`app/charlie/components/ResultsPanel.tsx`** — minimal touch:
  - Single new import: `InChatWorkingDoc`.
  - Single new JSX line inside the existing sellerEstimate block, right after the Property Estimate sub-section: `<InChatWorkingDoc sellerEstimate={se} />`.
  - Existing sub-sections (Property Estimate, Competing For Sale, Pricing Risk, Seller Strategy) all preserved verbatim.

### Backend untouched (verified by SHA fingerprinting in test)
- `app/api/charlie/route.ts` (chat stream + generate_plan stub): **UNCHANGED** (sha `9c64acba0564`). All 13 tools, plan gating + atomic increment, SSE events, low-credit email, message logging, tenant prompt, per-tenant Anthropic key: byte-identical.
- `app/charlie/lib/charlie-tools.ts`: **UNCHANGED** (sha `a02ee7ab48f9`). 13 tools' schemas preserved.
- `app/charlie/lib/charlie-prompts.ts`: **UNCHANGED** (sha `fbe7b7de14b9`). BUYER/SELLER flow rules + tenant-parameterized identity intact.
- `app/api/walliam/charlie/vip-request/route.ts` (`buildUserApprovalEmailHtml`): **UNCHANGED** (sha `97c651e90c6f`). W-WORKING-DOC Step 3 boundary preserved.
- `components/dashboard/WorkingDocView.tsx`: **UNCHANGED** (sha `00e6b82ccfcf`). Reused as-is.
- `app/charlie/hooks/useCharlie.ts`: ZERO touch. C-PLAN-DOC's plan-email POST `workingDoc` threading still intact.
- `app/api/charlie/plan-email/route.ts`: ZERO touch. C-PLAN-DOC's `workingDoc` destructure + render still intact.
- S1 (`app/api/chat/*`, `/admin`, `agent_buildings`): zero diff.

### Credit metering — render-only, ZERO change
- No route file touched → debit logic byte-identical.
- Plan-pool atomic increment at `app/api/charlie/route.ts:467` unchanged.
- `/api/walliam/estimator/increment` NOT called by any new code (verified — wrapper does only Supabase read for listing-id resolution; no increment endpoint).
- `estimator_count` UNTOUCHED. 1-action-1-debit invariant preserved.

### Buyer flow
This is **SELLER-FLOW ONLY**. The runner mounts only in CharlieOverlay's seller branch ([CharlieOverlay.tsx:229-241](app/charlie/components/CharlieOverlay.tsx#L229-L241)). For buyer flow no `sellerEstimate` exists; `InChatWorkingDoc` is mounted inside the sellerEstimate block which only renders when `block.type === 'sellerEstimate'` is appended to blocks[] — that happens via `setSellerEstimate` in useCharlie which is called only from the seller path. Buyer flow renders exactly as today.

### Build
- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0

### Test (scripts/test-c-chat-valuation.js) — 24/24 PASS

| Group | Verdict |
|---|---|
| Wrapper imports shared helper (shaping + key-collection) | PASS |
| Wrapper reuses React WorkingDocView (no rebuild) | PASS |
| Wrapper does NOT import email-HTML emitters | PASS |
| Wrapper shapes via buildWorkingDocFromResult (useMemo) | PASS |
| Wrapper does client-side listing-id resolution (useEffect + supabase + mls_listings + listing_key IN) | PASS |
| Wrapper uses window.location.origin (no hardcoded host) | PASS |
| Wrapper returns null when workingDoc null (backwards-compat) | PASS |
| ResultsPanel imports + mounts InChatWorkingDoc | PASS |
| ResultsPanel sellerEstimate block structure intact (all 4 existing sub-sections) | PASS |
| WorkingDocView props unchanged (workingDoc + baseUrl + idMap) | PASS |
| WorkingDocView returns null gracefully | PASS |
| **Chat route NOT modified (no working-doc imports, no matcher imports)** | **PASS** |
| **Chat route generate_plan stub intact (planReady: true, no matcher call)** | **PASS** |
| **Chat route SSE event types intact (7 types)** | **PASS** |
| **Chat route plan-pool atomic increment RPC intact** | **PASS** |
| **Tools file: 13 tools intact (count matches)** | **PASS** |
| **System prompt: BUYER/SELLER flow rules + tenant-parameterized identity intact** | **PASS** |
| useCharlie C-PLAN-DOC threading intact | PASS |
| useCharlie SSE consumer + handleToolResult + block types intact | PASS |
| plan-email C-PLAN-DOC integration intact | PASS |
| plan-email does NOT call estimator increment | PASS |
| **Charlie VIP buyer-approval builder UNCHANGED** | **PASS** |

SHA fingerprints (byte-identity guards):
- chat route: `9c64acba0564`
- tools: `a02ee7ab48f9`
- system prompt: `fbe7b7de14b9`
- Charlie VIP builder: `97c651e90c6f`
- WorkingDocView (reused as-is): `00e6b82ccfcf`

### Operator-eyeball moment
The chat-side render is a Tailwind component (`WorkingDocView`) in a slate background container, while the surrounding Charlie panel is dark mode with inline styles. Functionally correct but visually distinct from the rest of the panel. The operator should eyeball it live to decide whether a follow-up styling pass is wanted (no code change required — visual polish is a separate workstream).

### Push status
HELD per operator instruction. Commit landed locally; awaiting push approval.

---

## C-CHAT-VALUATION-STYLE (2026-06-13) — dark-mode for the in-chat working document

Visual-only follow-up to 09b97ef. The chat panel's `bg-#080f1a` dark theme made the dashboard-light WorkingDocView (the React render reused in-chat) look like a misplaced light card. This pass adds a `theme` prop to WorkingDocView so the same component renders both surfaces correctly: dashboard stays byte-identical (default 'light'), Charlie passes 'dark'.

### Approach taken: theme prop on WorkingDocView (preferred; fallback path NOT needed)
The shared theme prop turned out clean: a `WorkingDocViewTheme = 'light' | 'dark'` type + two `ThemeClasses` lookups (`LIGHT`, `DARK`) + default 'light' on the prop. Both `TileRow` and `Section` accept the theme strings via a single `t` prop. No JSX restructuring — only `className=` strings differ between themes.

### Pre-flight findings (verified)
- **WorkingDocView pre-change styling** (Tailwind, light):
  - Outer: `bg-white rounded-lg shadow p-6 mt-6`
  - Header card: `bg-slate-50 border border-slate-200 rounded-lg p-4`
  - Text/labels: `text-gray-900` / `text-gray-500` / `text-gray-600`
  - Links: `text-blue-700 hover:text-blue-900`
  - Tile borders: `border-gray-200`
- **Charlie ResultsPanel palette** (inline-styled dark):
  - Background: `#080f1a`
  - Tile fills: `rgba(255,255,255,0.04)` + `1px solid rgba(255,255,255,0.07)`
  - Bright text: `#fff` + accents (`#10b981`, `#3b82f6`, `#6366f1`, `#8b5cf6`)
  - Dim labels: `rgba(255,255,255,0.30-0.45)`
  - Dividers: `rgba(255,255,255,0.06)`

### Build
- **`components/dashboard/WorkingDocView.tsx`**:
  - Added `WorkingDocViewTheme = 'light' | 'dark'` type + `Props.theme?: WorkingDocViewTheme` with default `'light'`.
  - Added `ThemeClasses` interface + `LIGHT` + `DARK` lookups + `THEMES` map.
  - `LIGHT` entries contain EVERY pre-change class string VERBATIM (the dashboard byte-identity guarantee). Test asserts 24 verbatim matches.
  - `DARK` entries use panel-matching classes: `bg-[#0f172a]` container with `border-white/5`, `bg-white/[0.04]` header card, `text-white` headings, `text-emerald-400` for the estimate price (accent matching the panel's `#10b981`), `text-blue-300 hover:text-blue-200` links, `border-white/[0.06]` row dividers, white-translucent dim labels.
  - `TileRow` + `Section` now accept the `t: ThemeClasses` prop; all className strings flow through `t`. No JSX structure change.
  - `WorkingDocView`'s top-level `<div>` uses `t.container`; same elements as before.
- **`app/charlie/components/InChatWorkingDoc.tsx`**:
  - Drops the outer light wrapper `<div className="rounded-2xl bg-slate-50 border border-slate-200 mt-4 overflow-hidden">` — the dark theme provides its own container now.
  - Passes `theme="dark"` to WorkingDocView.
  - Data layer untouched (`buildWorkingDocFromResult`, `collectListingKeys`, supabase listing-id resolution, `window.location.origin` base URL).

### Care guards
- **Dashboard byte-identity**: the dashboard mounts `<WorkingDocView workingDoc={...} baseUrl={...} idMap={...} />` with NO theme prop. Default 'light' applies. The LIGHT class strings are byte-identical to today's render. Test asserts every pre-change class string is present in the LIGHT lookup verbatim.
- **Data + logic**: zero change. The working-doc shape, listing-id resolution, tile content, section structure, anchors, footer text — all unchanged. This is purely className routing.
- **09b97ef byte-identity fingerprints** still match:
  - `app/api/charlie/route.ts`: sha `9c64acba0564` MATCH
  - `app/charlie/lib/charlie-tools.ts`: sha `a02ee7ab48f9` MATCH
  - `app/charlie/lib/charlie-prompts.ts`: sha `fbe7b7de14b9` MATCH
  - `app/api/walliam/charlie/vip-request/route.ts`: sha `97c651e90c6f` MATCH
- **C-PLAN-DOC integration** intact (plan-email workingDoc destructure + render; useCharlie workingDoc threading).
- **Charlie ResultsPanel** wiring from 09b97ef intact.
- **Buyer flow**: still no render (seller-only).
- **S1**: zero diff.

### Build
- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0

### Test (scripts/test-c-chat-valuation-style.js) — 15/15 PASS

| # | Verdict | Result |
|---|---|---|
| 1 | WorkingDocView has theme prop with default 'light' (signature preserved) | PASS |
| **2** | **LIGHT theme contains EVERY pre-change dashboard class string (byte-identical render)** | **PASS** (key dashboard guard) |
| 3 | DARK theme uses dark container | PASS |
| 4 | DARK theme uses white text | PASS |
| 5 | DARK theme uses light-blue link colors (readable on dark) | PASS |
| 6 | DARK theme has NO accidental light-mode solid-class leak | PASS |
| 7 | InChatWorkingDoc passes theme="dark" explicitly | PASS |
| 8 | InChatWorkingDoc data layer untouched | PASS |
| 9 | ResultsPanel wiring from 09b97ef intact | PASS |
| 10 | Chat route byte-identical to 09b97ef | PASS (sha 9c64acba0564) |
| 11 | Tools file byte-identical to 09b97ef | PASS (sha a02ee7ab48f9) |
| 12 | System prompt byte-identical to 09b97ef | PASS (sha fbe7b7de14b9) |
| 13 | Charlie VIP buyer-approval builder byte-identical to 09b97ef | PASS (sha 97c651e90c6f) |
| 14 | plan-email C-PLAN-DOC integration intact | PASS |
| 15 | useCharlie C-PLAN-DOC threading intact | PASS |

### Push status
HELD per operator instruction. Commit landed locally; awaiting push approval. Will push WITH 09b97ef.

---

## C-CHAT-VALUATION + C-CHAT-VALUATION-STYLE — PUSHED (2026-06-13)

Pushed 09b97ef + d5a1ca2; operator-approved after eyeball. Charlie in-chat seller valuation now renders the full tier + tax-match working document, dark-themed to match the panel; dashboard byte-identical (theme prop, default light); chat route/tools/prompt/VIP/metering untouched.

- origin/main: d5a1ca2 (fast-forward from f154a4a, no force)
- Build: tsc clean, next build clean
- Tests: scripts/test-c-chat-valuation.js 24/24 PASS, scripts/test-c-chat-valuation-style.js 15/15 PASS
- 09b97ef byte-identity guards (verified on push):
  - app/api/charlie/route.ts          sha 9c64acba0564 MATCH
  - app/charlie/lib/charlie-tools.ts  sha a02ee7ab48f9 MATCH
  - app/charlie/lib/charlie-prompts.ts sha fbe7b7de14b9 MATCH
  - app/api/walliam/charlie/vip-request/route.ts sha 97c651e90c6f MATCH
- Dashboard byte-identity: LIGHT theme contains 24 verbatim pre-change class strings; default 'light' on WorkingDocView preserves dashboard signature.
- S1 (condoleads.ca legacy /admin, app/api/chat/*, agent_buildings): zero diff.

---

## C-PLAN-DOC-DEDUP — BUILT, LOCAL COMMIT (2026-06-13, HEAD 9eaceb7)

Problem (surfaced by C-VERIFY recon): the Charlie plan email rendered the same seller comparables + competing listings TWICE — once via the legacy comparableSoldHtml/competingHtml blocks (reading sellerEstimate.comparables/competingListings) and once via the new C-PLAN-DOC working-doc render (reading workingDoc.comparableSold/competing tiles). Same source data, two visual outputs, recipient sees duplicates.

Pre-flight content-equivalence check: the working-doc render was NOT a superset of the legacy blocks — missing photo, temperature badge (HOT/WARM/COLD), matchQuality, and Sold → / For Sale → affordance. Per directive, those four fields were CARRIED INTO the working-doc tile render first, then the legacy blocks were gated off.

Files changed (3, +279 / -5):
- lib/email/working-doc-render.ts
  - WorkingDocTile interface: + mediaUrl?: string | null, + matchQuality?: string | null (additive optional)
  - buildWorkingDocFromResult: tileFromComp + tileFromCompeting capture mediaUrl (cascading fallback: c.mediaUrl → c.media[0].media_url → c.media[0].url); tileFromComp also captures matchQuality
  - renderTile: photo cell (when mediaUrl present), temperature badge on photo for sold tiles, matchQuality below address, Sold → / For Sale → affordance, price color matches legacy (#059669 sold / #1d4ed8 sale)
- app/api/charlie/plan-email/route.ts
  - comparableSoldHtml: gated by !workingDoc && ...
  - competingHtml:      gated by !workingDoc && ...
  - Mount order at L686-688 UNCHANGED. When workingDoc present, legacy slots emit '' and the working-doc section is the single source.
- scripts/test-c-plan-doc-dedup.js (NEW, 29 verdicts, 29/29 PASS)

Backwards-compat guarantee: workingDoc-absent path renders the legacy blocks BYTE-IDENTICAL to pre-edit (verified — bodies match backup minus the leading !workingDoc && guard). Older clients, buyer flows, and any plan session without a seller estimate see no change.

Wiring untouched (verified):
- Lead insert (agent_id + tenant_id + manager_id + area_manager_id + tenant_admin_id stamped, status='new')
- user_activities 'plan_generated' log
- getLeadEmailRecipients(tenantId, agentId) call site + chain
- Buyer copy send (to: userEmail) + chain send (recipients TO/CC/BCC)
- Per-tenant Resend key via attemptTenantEmail
- buildBaseUrl(domain) tenant-domain-first

09b97ef byte-identity guards still match (SHA fingerprints verified):
- app/api/charlie/route.ts          sha 9c64acba0564 MATCH
- charlie-tools.ts                  sha a02ee7ab48f9 MATCH
- charlie-prompts.ts                sha fbe7b7de14b9 MATCH
- charlie/vip-request/route.ts      sha 97c651e90c6f MATCH

Dashboard React WorkingDocView: SHA 40b1e460fe11 — UNCHANGED. Only imports the WorkingDocTile type; new optional fields are TS-compatible and unrendered, so dashboard stays byte-identical.

InChatWorkingDoc: SHA cfb3bd101cb1 — UNCHANGED.

Side-benefit: agent lead email, estimator VIP buyer email, and property-page buyer email (all consume renderWorkingDocSections) automatically gain photos + temperature + Sold/For Sale labels when their underlying comp data carries the same fields. Content gain, not regression — the data was always in EstimateResult, just not displayed.

Build: tsc --noEmit exit 0; npm run build exit 0.
Test: 29/29 PASS.
S1 zero-diff.

HOLD push per operator instruction. Local commit 9eaceb7. Awaiting operator eyeball + approval.

---

## C-PLAN-DOC-DEDUP — PUSHED (2026-06-13)

Pushed 9eaceb7 + 31f7bdc; operator-approved, eyeballing on live walliam.ca. Plan-email comparables/competing de-duplicated (working-doc single source when present; photo/temperature/matchQuality/affordance carried in so no content lost; legacy preserved for older clients).

- origin/main: 31f7bdc (fast-forward from 296b75a, no force)
- Build: tsc --noEmit exit 0; npm run build exit 0
- Test: scripts/test-c-plan-doc-dedup.js 29/29 PASS
- 09b97ef byte-identity guards still match:
  - app/api/charlie/route.ts          sha 9c64acba0564 MATCH
  - charlie-tools.ts                  sha a02ee7ab48f9 MATCH
  - charlie-prompts.ts                sha fbe7b7de14b9 MATCH
  - charlie/vip-request/route.ts      sha 97c651e90c6f MATCH
- Dashboard WorkingDocView: sha 40b1e460fe11 UNCHANGED (additive optional fields, graceful ignore).
- InChatWorkingDoc: sha cfb3bd101cb1 UNCHANGED.
- Wiring (lead insert + user_activities + getLeadEmailRecipients + buyer-copy send + per-tenant Resend key + buildBaseUrl): UNCHANGED.
- Backwards-compat (workingDoc-absent): legacy comparableSoldHtml + competingHtml bodies byte-identical to pre-edit (only the leading `!workingDoc &&` guard added).
- Side-benefit: agent lead email + estimator VIP buyer email + property-page buyer email gain photo + temperature + Sold/For Sale label when their comp data carries the same fields (UX gain, no regression).
- S1 (condoleads.ca legacy /admin, app/api/chat/*, agent_buildings): zero diff.

---

## C-PLAN-DOC-DEDUP-REVERT — LOCAL COMMIT (2026-06-13, HEAD 2367783)

Reverted the Charlie-side consumption of the working document. The render added to Charlie by df2ec76 / 09b97ef / d5a1ca2 / 9eaceb7 duplicated Charlie's pre-existing Comparable Sold + Competing For Sale sections AND surfaced internal "Estimator working document" language in the UI. Operator requested removal; Charlie's ORIGINAL comparable/competing rendering must be restored exactly.

Revert target: 460ef63 (the commit immediately before df2ec76 introduced workingDoc to Charlie). Verified: Charlie's plan-email + in-chat at 460ef63 rendered ONLY the original sections (no working-doc, no duplicates).

Files reverted (Charlie-side ONLY — restored from 460ef63 via `git checkout 460ef63 -- <path>`):
- app/api/charlie/plan-email/route.ts  — content-byte-identical to 460ef63 (CRLF-normalized diff: empty). Removes workingDoc destructure, shared-helper imports (renderEstimateHeader / renderWorkingDocSections / resolveListingIds / collectListingKeys), workingDocIdMap batch resolve, workingDocHtml block, and the !workingDoc gates added by 9eaceb7. comparableSoldHtml + competingHtml render Charlie's original sections, ungated, single render.
- app/charlie/components/ResultsPanel.tsx — content-byte-identical to 460ef63. Removes InChatWorkingDoc import + the <InChatWorkingDoc sellerEstimate={se} /> JSX line. sellerEstimate block shows 4 original sub-sections (Property Estimate, Competing For Sale, Pricing Strategy & Risk, Your Seller Strategy).
- app/charlie/hooks/useCharlie.ts — content-byte-identical to 460ef63. Removes buildWorkingDocFromResult import, the workingDoc shaping block, and the workingDoc field from the plan-email POST body.
- app/charlie/components/InChatWorkingDoc.tsx — DELETED. Confirmed via grep: ResultsPanel was the only importer (now reverted). Zero other consumers.

Shared estimator files LEFT INTACT (estimator's approved P-WORKING-DOC + dashboard depend on them):
- lib/email/working-doc-render.ts            sha 3d6579b89db6  UNCHANGED  (byte-identical to pre-revert state)
- components/dashboard/WorkingDocView.tsx     sha 40b1e460fe11  UNCHANGED
  Consumed by: lib/actions/leads.ts (agent + buyer working-doc emails), app/api/walliam/estimator/vip-request/route.ts (VIP buyer email), app/dashboard/leads/[id]/page.tsx + components/dashboard/LeadDetailClient.tsx (dashboard lead detail). All 4 estimator surfaces continue to render the working document.

Protected SHAs still byte-identical (09b97ef fingerprints):
- app/api/charlie/route.ts          sha 9c64acba0564 MATCH
- app/charlie/lib/charlie-tools.ts  sha a02ee7ab48f9 MATCH
- app/charlie/lib/charlie-prompts.ts sha fbe7b7de14b9 MATCH
- app/api/walliam/charlie/vip-request/route.ts sha 97c651e90c6f MATCH

Build: tsc --noEmit exit 0; npm run build exit 0.
S1 zero-diff.

Verified by code:
- Charlie plan-email body byte-identical to 460ef63 (comparable/competing rendered ONCE, original sections, no working-doc label).
- ResultsPanel body byte-identical to 460ef63 (sellerEstimate panel restored exactly).
- useCharlie body byte-identical to 460ef63 (POST body has no workingDoc field).
- Shared estimator files byte-identical to current (un-touched).

Needs operator live-eyeball on walliam.ca after push:
- Visual confirmation that Charlie's chat panel shows only the original sellerEstimate block (no "Estimator working document" label, no duplicate Comparable Sold / Competing For Sale).
- Visual confirmation that the agent lead email + buyer working-doc email + VIP buyer email + dashboard lead view still render the working document (estimator surfaces unchanged).

HOLD push pending operator approval. Local commit 2367783.

---

## C-PLAN-DOC-DEDUP-REVERT — PUSHED (2026-06-13)

Pushed 2367783 + 0be66de; operator-approved. Charlie reverted to 460ef63 original sections (no duplicate comparable/competing, no working-document label); shared estimator files untouched (estimator not regressed).

- origin/main: 0be66de (fast-forward from 9312ca9, no force)
- Build: tsc --noEmit exit 0; npm run build exit 0
- Charlie-side reverts (content-byte-identical to 460ef63 via `git checkout 460ef63 -- <path>`):
  - app/api/charlie/plan-email/route.ts        (workingDoc destructure/helpers/render block + !workingDoc gates REMOVED)
  - app/charlie/components/ResultsPanel.tsx    (InChatWorkingDoc import + JSX line REMOVED; original 4-section sellerEstimate panel restored)
  - app/charlie/hooks/useCharlie.ts            (buildWorkingDocFromResult + workingDoc POST field REMOVED)
  - app/charlie/components/InChatWorkingDoc.tsx (DELETED — zero other importers)
- Shared estimator files LEFT INTACT (estimator continues to render the working document):
  - lib/email/working-doc-render.ts       sha 3d6579b89db6  UNCHANGED
  - components/dashboard/WorkingDocView.tsx sha 40b1e460fe11 UNCHANGED
  - Consumed by 4 estimator surfaces (agent lead email, buyer working-doc email, VIP buyer email, dashboard lead detail) — all still wired and working.
- 09b97ef byte-identity guards still match:
  - app/api/charlie/route.ts          sha 9c64acba0564 MATCH
  - charlie-tools.ts                  sha a02ee7ab48f9 MATCH
  - charlie-prompts.ts                sha fbe7b7de14b9 MATCH
  - charlie/vip-request/route.ts      sha 97c651e90c6f MATCH
- Reference materialized for byte-compare: recon/_pre-df2ec76-plan-email.ts.txt, recon/_pre-df2ec76-ResultsPanel.tsx.txt, recon/_pre-df2ec76-useCharlie.ts.txt
- S1 (condoleads.ca legacy /admin, app/api/chat/*, agent_buildings): zero diff.
- Awaiting operator live-eyeball on walliam.ca to confirm Charlie's chat panel + plan email show only the original sections (no "Estimator working document" label, no duplicate comparable/competing) and the estimator surfaces still render the working doc.

---

## C-ENHANCE-1-DATA — LOCAL COMMIT (2026-06-13, HEAD f0904e5)

DATA-LAYER ONLY. No render change. Switched Charlie's seller runner to the S2 condo matcher and threaded propertyTax → subjectTaxAnnualAmount + subjectTaxYear on both condo and home specs. Charlie's state.sellerEstimate.estimate now carries tiers + bestGeoTier (anchor) + taxMatch when the form provides propertyTax — the data gate before the render build.

Scope:
- app/charlie/components/SellerEstimateRunner.tsx (only file edited)
  - imports: estimateSale → estimateCondoSale, estimateRent → estimateCondoRent
  - Props.formData: + propertyTax?: string
  - condo SALE: CondoSaleSpecs (= UnitSpecs + community/muni/area + subjectTax* + tenantId fallback)
  - condo LEASE: CondoLeaseSpecs (no tax fields — matcher doesn't compute tax-match on lease, by design)
  - home SALE/LEASE: HomeSpecs + subjectTaxAnnualAmount + subjectTaxYear
- scripts/verify-c-enhance-data.js (NEW)

NO render change. SellerEstimateBlock, ComparableCard, plan-email, ResultsPanel, dashboard: untouched.

S1 callers UNCHANGED (verified by grep):
- EstimatorSeller / EstimatorBuyer / EstimatorBuyerModal still import estimateSale/Rent.

09b97ef byte-identity guards still match:
- app/api/charlie/route.ts          sha 9c64acba0564 MATCH
- charlie-tools.ts                  sha a02ee7ab48f9 MATCH
- charlie-prompts.ts                sha fbe7b7de14b9 MATCH
- charlie/vip-request/route.ts      sha 97c651e90c6f MATCH

Charlie SHAs (post-edit):
- plan-email/route.ts        sha fd89b183e1b0 UNCHANGED (revert state)
- ResultsPanel.tsx           sha 72f5d88adef9 UNCHANGED
- useCharlie.ts              sha 5288819e9870 UNCHANGED
- SellerEstimateRunner.tsx   sha (edited — runner is the only file changed)

Build: tsc --noEmit exit 0; npm run build exit 0.
S1 (condoleads.ca legacy /admin, app/api/chat/*, agent_buildings): zero diff.

VERIFY (scripts/verify-c-enhance-data.js, code-verified — not live):
Ran against npm run dev on http://localhost:3001 (3000 was busy). Probe endpoint
/api/test-estimator-sections invokes the same S2 actions Charlie's runner now uses.
3 real WALLiam-coverage subjects discovered via SAVEPOINT-isolated pg (BEGIN ...
ROLLBACK, no mutation):

Case 1: CONDO with tax — X9436670, tax=$3,649, year=2023
  bestGeoTier=platinum  matchTier=MAINT  confidence=Medium-Low
  tiers.platinum={count:4,  median:$533,000}
  tiers.gold    ={count:7,  median:$437,000}
  tiers.silver  ={count:26, median:$631,750}
  tiers.bronze  =null
  taxMatch.comparablesCount=7  taxMatch.bestGeoTier=platinum  → FIRING

Case 2: HOME with tax — E12481299 Detached, tax=$4,162.56, year=2025
  bestGeoTier=gold  matchTier=BINGO  confidence=High
  tiers.platinum=null
  tiers.gold    ={count:8,  median:$795,000}
  tiers.silver  ={count:14, median:$812,500}
  tiers.bronze  =null
  taxMatch.comparablesCount=10  taxMatch.bestGeoTier=gold  → FIRING

Case 3: CONDO without tax — N9417561 (graceful path)
  bestGeoTier=platinum  matchTier=RANGE  confidence=Medium
  tiers.platinum={count:1, median:$725,354}
  taxMatch=null  → NO CRASH (matcher correctly returns undefined when no tax)

Assertions: all clean. FATAL issues: (none). Exit code 0.

tenantId fallback: getCurrentTenantId() server-side worked correctly in dev with
DEV_TENANT_DOMAIN=walliam.ca in .env.local. Matchers populated tiers + taxMatch
without explicit specs.tenantId — confirms Charlie's runner null-tenant path is
production-equivalent.

HOLD push pending operator approval. Operator's live walliam.ca eyeball is the
next gate. After approval, push → then the render build (C-ENHANCE-2-RENDER) lands
the tier rail + chip + tax-match subsection across the 3 surfaces.

---

## C-ENHANCE-1-DATA — PUSHED (2026-06-13)

Pushed f0904e5 + 6f685be; operator-approved. Charlie seller runner on S2 condo matcher + tax threaded; tiers/anchor/tax-match now populate (code-verified: condo X9436670 + home E12481299 firing; no-tax graceful); data layer only, no render change yet.

- origin/main: 6f685be (fast-forward from 34b0384, no force)
- Build: tsc --noEmit exit 0; npm run build exit 0
- Verify (scripts/verify-c-enhance-data.js): all clean, exit 0.
  - condo X9436670 (tax=$3,649): tiers Plat(4)/Gold(7)/Silver(26)/null; bestGeoTier=platinum; taxMatch.comparablesCount=7 FIRING
  - home  E12481299 (tax=$4,162.56): tiers null/Gold(8)/Silver(14)/null; bestGeoTier=gold; taxMatch.comparablesCount=10 FIRING
  - condo N9417561 (no tax): tiers Plat(1); taxMatch=null; estimatedPrice=$725,354 — graceful no-op, no crash
- tenantId fallback: getCurrentTenantId() server-side RESOLVED at runtime (dev with DEV_TENANT_DOMAIN=walliam.ca); Charlie's null-tenant client path is production-equivalent.
- S1 callers (EstimatorSeller / EstimatorBuyer / EstimatorBuyerModal): imports UNCHANGED — zero impact on legacy condoleads.ca estimator paths.
- 09b97ef byte-identity guards still match (chat route 9c64acba0564, tools a02ee7ab48f9, prompts fbe7b7de14b9, Charlie VIP 97c651e90c6f).
- Revert-state Charlie files BYTE-UNCHANGED: plan-email fd89b183e1b0, ResultsPanel 72f5d88adef9, useCharlie 5288819e9870.
- S1 (condoleads.ca legacy /admin, app/api/chat/*, agent_buildings): zero diff.
- Next: C-ENHANCE-2-RENDER builds the tier rail + chip + tax-match subsection across in-chat panel + plan email + dashboard, sitting on this data foundation.

---

## C-ENHANCE-2-RENDER — LOCAL COMMIT (2026-06-13, HEAD 3d9ac08)

Tier badges + anchor rail + tax-match subsection added to Charlie's EXISTING sections in place, across THREE surfaces. Charlie voice — no new sections, no "working document"/estimator labels. Form: sq-ft + tax now required. Sits on the f0904e5 data foundation.

Files changed (8: 6 modified + 2 new):
- app/charlie/components/ComparableCard.tsx (chip + props)
- app/charlie/components/SellerEstimateBlock.tsx (tier rail + tax subsection + path derive)
- app/charlie/components/SellerForm.tsx (sq-ft + tax required, hint fixed)
- app/api/charlie/plan-email/route.ts (chip in comp rows + taxMatchHtml + plan_data.sellerEstimate persist)
- components/dashboard/LeadDetailClient.tsx (exclusive branch)
- app/dashboard/leads/[id]/page.tsx (charlieSellerEstimate prop wiring)
- components/dashboard/CharlieLeadEstimate.tsx (NEW white-card render)
- scripts/test-c-enhance-render.js (NEW, 49/49 PASS)

Reuse strategy:
- HOME_LABEL_MAP + CONDO_LABEL_MAP from estimator (data constants, no UI text drag)
- Tier color hex literals declared locally in each Charlie file
- Estimator's tier-rail JSX + tax section NOT reused (white-card chrome + estimator voice)

Charlie-voice headings (test-asserted):
- "Confidence by Area"          (NOT "Geographic Confidence Spread")
- "Tax-Matched · N found"       (NOT "Tax-Matched Comparables")
- "Charlie seller estimate"     (NOT "Estimator working document")

In-chat (Charlie dark panel):
- ComparableCard: chip above price row, solid bg + white text, silent-omit when no tier.
- SellerEstimateBlock: tier rail between range card and Comparable Sold header — 4 rows P/G/S/B, emerald anchor highlight + ANCHOR chip, "no data" graceful. Tax-Matched subsection after the comp list with optional tax-estimate pill. path derived from buildingName so ResultsPanel mount line stays byte-identical.

Plan email:
- Inline TIER_COLORS_EMAIL + label maps + tierChipHtml helper (no working-doc-render import).
- comparableSoldHtml: chip per tile (c.sourceTier ?? bestGeoTier fallback).
- NEW taxMatchHtml block: heading + optional inline tax-matched estimate + tile rows with per-tile chips. Mounted between comparableSoldHtml and competingHtml.
- plan_data on lead insert ADDITIVELY persists sellerEstimate. Existing plan_data fields untouched.
- comparableSoldHtml + competingHtml stay UNGATED — preserves the C-PLAN-DOC-DEDUP-REVERT single-render guarantee. taxMatchHtml is a new sibling, not a dup.

Dashboard:
- NEW CharlieLeadEstimate (white-card, mirrors in-chat structure).
- LeadDetailClient branches exclusive: charlieSellerEstimate → CharlieLeadEstimate; else WorkingDocView. Never both.
- WorkingDocView UNTOUCHED (sha 40b1e460fe11) — estimator-lead path preserved exactly.

Form:
- livingAreaRange required (both condo + home, was condo-only).
- propertyTax required for SALE (was optional). Hint corrected to accuracy-focused. Lease keeps optional (lease ~0% tax fill).
- canSubmit guard enforces both.

Byte-identical proofs (verified by test):
- ResultsPanel.tsx          sha 72f5d88adef9   UNCHANGED
- WorkingDocView.tsx        sha 40b1e460fe11   UNCHANGED
- chat route                sha 9c64acba0564   MATCH (09b97ef)
- tools                     sha a02ee7ab48f9   MATCH (09b97ef)
- prompts                   sha fbe7b7de14b9   MATCH (09b97ef)
- Charlie VIP               sha 97c651e90c6f   MATCH (09b97ef)
- useCharlie                sha 5288819e9870   UNCHANGED

Build: tsc --noEmit exit 0; npm run build exit 0.
Test: scripts/test-c-enhance-render.js 49/49 PASS.
S1 (condoleads.ca legacy /admin, app/api/chat/*, agent_buildings): zero diff.

CODE-VERIFIED. NOT live. Operator's live walliam.ca eyeball after push is the next gate.
