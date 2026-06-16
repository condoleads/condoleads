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

---

## C-ENHANCE-2-RENDER — PUSHED (2026-06-13)

Pushed 3d9ac08 + 9caee67; operator-approved. Charlie's existing sections now carry tier badges + anchor rail + tax-match across in-chat/plan-email/dashboard, Charlie voice (no estimator labels, no duplication); protected surfaces byte-identical; form sq-ft+tax required. Code-verified; operator eyeballing live.

- origin/main: 9caee67 (fast-forward from 7144605, no force)
- Build: tsc --noEmit exit 0; npm run build exit 0
- Test: scripts/test-c-enhance-render.js 49/49 PASS

Charlie-voice headings (zero estimator strings — negation-regex proven):
- "Confidence by Area"         (NOT "Geographic Confidence Spread")
- "Tax-Matched · N found"      (NOT "Tax-Matched Comparables")
- "Charlie seller estimate"    (NOT "Estimator working document")

3-surface render:
- In-chat: ComparableCard chips + SellerEstimateBlock tier rail (anchor highlighted) + Tax-Matched subsection IN PLACE (child of the same block, not a sibling section).
- Plan email: inline tier chip in comparableSoldHtml + NEW taxMatchHtml between comp/competing; plan_data.sellerEstimate persisted additively on lead insert.
- Dashboard: NEW components/dashboard/CharlieLeadEstimate (white-card); LeadDetailClient branches EXCLUSIVELY — Charlie present → CharlieLeadEstimate, else WorkingDocView. Estimator-lead path UNTOUCHED.

Single-render guarantee preserved (the C-PLAN-DOC-DEDUP-REVERT lesson):
- comparableSoldHtml + competingHtml remain UNGATED. taxMatchHtml is a NEW sibling between them, not a dup.

Form: sq-ft mandatory (both condo + home); propertyTax mandatory for SALE flow (lease keeps optional). Misleading "future value calculations" hint removed; replaced with accuracy-focused copy.

Protected surfaces byte-identical (verified):
- ResultsPanel.tsx          sha 72f5d88adef9   UNCHANGED
- WorkingDocView.tsx        sha 40b1e460fe11   UNCHANGED
- chat route                sha 9c64acba0564   MATCH (09b97ef)
- charlie-tools             sha a02ee7ab48f9   MATCH (09b97ef)
- charlie-prompts           sha fbe7b7de14b9   MATCH (09b97ef)
- charlie/vip-request       sha 97c651e90c6f   MATCH (09b97ef)
- useCharlie                sha 5288819e9870   UNCHANGED

Reuse strategy: HOME_LABEL_MAP + CONDO_LABEL_MAP + tier color hex literals only. Estimator's tier-rail component + tax section JSX NOT reused (white-card chrome + estimator wording would clash).

Absent-data graceful: tiers undefined → rail skips; taxMatch.comparables.length===0 → subsection skips; sellerEstimate null on lead → CharlieLeadEstimate returns null (falls through to existing render path).

S1 (condoleads.ca legacy /admin, app/api/chat/*, agent_buildings): zero diff.

---

## C-CHARLIE-FOLLOWUP Phase 2 — LOCAL COMMIT (2026-06-13)

Three items shipped together:
- B(i) fixture-driven email smoke harness (closes the gap the 49/49 static test missed)
- B(ii) defensive stale-session console.warn in plan-email
- C dashboard "no estimate captured" distinction for pre-3d9ac08 Charlie seller leads

Backups:
- app/api/charlie/plan-email/route.ts.backup_c-followup_20260613_140452
- components/dashboard/CharlieLeadEstimate.tsx.backup_c-followup_20260613_140452
- components/dashboard/LeadDetailClient.tsx.backup_c-followup_20260613_140452
- app/dashboard/leads/[id]/page.tsx.backup_c-followup_20260613_140452
- docs/W-ESTIMATOR-PATHS-TRACKER.md.backup_c-followup_20260613_140452

### B(i) — fixture-driven harness

Fixture source: real production lead 63b48f13-8a03-46be-b4ce-91007da0794a
(WALLiam tenant, walliam_charlie source, seller intent, 606 Aspen rd Pickering,
created 2026-06-13T17:09:04Z — the only post-3d9ac08 seller lead at recon time).

Captured fixture shape:
  path                     home
  intent                   sale
  comparables.length       5
  competingListings.length 2
  estimate.bestGeoTier     gold       ← anchor
  estimate.tiers slots     gold(5 comps, $1.127M median), silver(32 comps, $1.119M),
                           bronze=null, platinum=null
  estimate.taxMatch.count  12         ← tax-match FIRES
  estimate.taxMatch.cmps   10
  estimate.taxMatch.bestGeoTier silver

Plumbing:
- Extracted buildRichPlanEmail + MONTHS_ARR into a new shared module:
  lib/email/charlie-plan-email-html.ts (verbatim — Next.js refused the
  non-handler export from a route file).
- app/api/charlie/plan-email/route.ts imports from the new module.
  Behavior IDENTICAL — function body byte-equivalent (sed-extracted, not
  re-typed).
- Probe endpoint app/api/charlie/test-render-plan-email-probe/route.ts
  POSTs sellerEstimate (+ context with realistic defaults) → calls
  buildRichPlanEmail → returns { html }.
  Underscore-prefix avoided (Next.js treats _folders as private + non-
  routable); "-probe" suffix marks it as test-only.
- Smoke harness scripts/smoke-charlie-email-fixture.js:
    1. SAVEPOINT-isolated pg read of fixture lead → writes scripts-output/
       c-followup-fixture.json
    2. POSTs fixture to probe → captures HTML
    3. Asserts 20 named items: 4 new (tier chip, emoji, Tax-Matched
       heading, tax-matched estimate pill), 7 preservation (Comparable Sold,
       Competing For Sale, plan card "Your Seller Strategy", AI Disclaimer,
       Your Profile, Market Snapshot, Open WALLiam CTA), 1 conditional
       (Price by Home Type when subtype_breakdown present), 2 single-render
       (Comparable Sold / Competing — no dedup regression), 4 negation
       (no estimator-voice strings), 2 link safety (walliam.ca present,
       condoleads.ca absent).
       OUTPUT: scripts-output/smoke-charlie-email-fixture.txt

Smoke result: 20/20 PASS. Real probe invocation; live HTML 45,849 bytes
from the same buildRichPlanEmail the production POST handler uses.

### B(ii) — stale-session warn

File: app/api/charlie/plan-email/route.ts:64-72
When sellerEstimate is present but sellerEstimate.estimate.bestGeoTier is
absent (the stale-tab / pre-f0904e5 case), emit:
  console.warn('[plan-email] STALE-SESSION: sellerEstimate present but
                estimate.bestGeoTier missing — likely a pre-f0904e5 /
                stale-tab session. Email will render without tier chips.
                sessionId=... userId=...')

Pure observability — does NOT block the send, does NOT change the email body.
Lets ops see "half-rendered email" events in Vercel logs instead of silent
degradation.

### C — dashboard "no estimate captured" distinction

components/dashboard/CharlieLeadEstimate.tsx:
- Props extended with optional legacyNoticeWhenEmpty + leadMeta.
- When sellerEstimate is null AND legacyNoticeWhenEmpty=true, render an
  amber "No estimate captured" notice card with the leadMeta context.
  Estimator leads still get null (legacyNoticeWhenEmpty=false by default)
  and fall through to the caller's existing render path.

components/dashboard/LeadDetailClient.tsx:
- Props gain leadIsCharlieSeller?: boolean.
- Branch is now 3-way (in priority order):
    1. charlieSellerEstimate present  → <CharlieLeadEstimate sellerEstimate=…/>
    2. leadIsCharlieSeller=true       → <CharlieLeadEstimate sellerEstimate={null}
                                          legacyNoticeWhenEmpty={true} leadMeta={…}/>
    3. otherwise                      → <WorkingDocView ...>  (estimator leads)

app/dashboard/leads/[id]/page.tsx:
- Passes leadIsCharlieSeller={lead.lead_origin_route === 'charlie' &&
                              lead.intent === 'seller'}

Effect:
- 98 pre-3d9ac08 Charlie seller leads will now show the amber "No estimate
  captured" notice on the dashboard (previously rendered empty / no estimate
  panel at all).
- Estimator leads: unchanged.
- Post-3d9ac08 Charlie leads with sellerEstimate persisted: unchanged (full
  CharlieLeadEstimate render).

### Decisions logged

- A) PRICING GRAPH — NAMED new-feature item, NOT auto-built. Settled from
   6f685be vs HEAD diff: gate at ResultsPanel.tsx:107
   (`!(blocks||[]).some(b=>b.type==='sellerEstimate')`) is BYTE-IDENTICAL
   between the two commits. BuyerOfferBlock is buyer/analytics-only by
   PRE-EXISTING design, not a 3d9ac08 regression. If operator wants the
   pricing graph IN-CHAT inside the seller flow, that's an additive
   enhancement to scope later.

- C) BACKFILL — NAMED impossible (data-confirmed). chat_sessions has no
   seller-estimate column; pre-3d9ac08 plan_data shape lacks estimate;
   property_details is NULL for Charlie leads. The matcher output existed
   only in browser memory and was discarded at session end. Forward-only
   from 3d9ac08. The "no estimate captured" notice replaces the empty
   render for those 98 leads.

### Build / files changed

- npx tsc --noEmit: exit 0
- 4 files modified (route.ts, CharlieLeadEstimate.tsx, LeadDetailClient.tsx,
  page.tsx)
- 3 files new (lib/email/charlie-plan-email-html.ts extracted module,
  test-render-plan-email-probe/route.ts probe endpoint,
  scripts/smoke-charlie-email-fixture.js smoke harness)
- Protected 09b97ef SHAs still match (chat/tools/prompt/Charlie VIP)
- ResultsPanel + WorkingDocView byte-unchanged

### Claimed-unverified flags

⚠ Smoke harness depends on lead 63b48f13... existing. If the operator
  prunes test leads, the smoke will need a new fixture source (it ROLLS
  BACK its own read, but it can't conjure a deleted row). Flagged.
⚠ The B(ii) stale-session warn surface (Vercel logs) is not asserted by
  any local test — it'll only show value when a real stale-session
  delivery happens in production. Flagged.

HOLD push per directive. Awaiting operator approval + live walliam.ca
eyeball of the dashboard notice on a pre-3d9ac08 Charlie lead.

---

## C-CHARLIE-FOLLOWUP Phase 2 — RECONCILE (2026-06-13)

Live verifier (scripts/verify-charlie-followup-phase2.js, 48/48 PASS against origin/main = a1f92cf) reconciles the earlier recon counts:

- Live WALLiam Charlie seller leads: **7 total** — **1 FULL render (63b48f13)**, **6 AMBER notice** (42a20b25, 6e96e63b, e2d3aeb0, 2feab2b4, d624677c, 5477a25f). The earlier C-CHARLIE-FOLLOWUP Phase 1 figure of "10 seller / 1 with estimate" is superseded — leads were pruned/created between sessions. Branch logic verified correct against the live set: AMBER never fires when sellerEstimate is present; NEITHER never fires on a charlie-seller lead; FULL only fires on 63b48f13.

Two NAMED decision items, NOT auto-built (operator's call):
- **(i)** `subjectAddress` is captured into `plan_data.sellerEstimate.subjectAddress` (verified: `"606 Aspen rd, Pickering"` on lead 63b48f13) but is NOT rendered in `buildRichPlanEmail`'s body — the email header shows `geoName` + `userName` + brand only. This is the pre-existing email shape (not introduced or regressed by Phase 2). Operator decision whether to add the street address to the email body.
- **(ii)** AMBER React DOM is proven correct by **deterministic branch resolution** (the shipped 3-way logic + the static notice JSX in CharlieLeadEstimate, both content-asserted: "No estimate captured" text present, "3d9ac08" cutoff cited, zero `estimate.*` / `tiers.*` / `taxMatch.*` interpolation — no fabrication). Live walliam.ca DOM eyeball pending (no server-render harness added; operator can verify by opening one of the 6 AMBER leads on the dashboard).

---

## W-CHARLIE-CONVERGENCE — OPENED + CV-0 SHIPPED (2026-06-14)

Workstream goal: end the section-level inconsistency mapped in
recon/W-CHARLIE-CONVERGENCE.txt — the dashboard, in-chat panel, and plan
email each render a different subset of the same canonical seller data.
Bring all three to a single shared shape so they cannot diverge again.

### Deploy state (W-CHARLIE-CONVERGENCE — DEPLOY VERIFY, 2026-06-14)

origin/main confirmed at `3aa0449` (HEAD == origin/main, fast-forward of feature `a1f92cf` + tracker `3aa0449`). Live walliam.ca production deployment `dpl_ACR2UJX8xUuXrLo6SpkSYbCfHBXY` created 2026-06-13T19:09:47Z, ~19s after the `3aa0449` push — strong inference: production is on `3aa0449`. Vercel CLI v51.8.0 inspect does NOT expose `meta.githubCommitSha`; live SHA confirmation requires the dashboard. Flagged claimed-unverified.

### Locked canonical target set (the convergence spec)

All three renderers will render the SAME canonical sections from the same lead row, gated by honest `present` flags (no empty shells):

  · Plan card grid (Profile + Market Snapshot)
  · Market Intelligence (analytics roll-up)
  · Price by Home Type (subtype_breakdown)
  · Offer Intelligence (Offer At / Avg Concession / Decide In)
  · Best Time (seasonal best/worst months)
  · Plan summary text
  · Seller Profile table
  · Property Estimate price card
  · 4-row tier rail (P/G/S/B + anchor)
  · Comparable Sold + per-tile tier chips
  · Tax-Matched + per-tile tier chips + tax-matched estimate pill
  · Competing For Sale (NO chip — deliberate; not a scored/matched comp)
  · Pricing Strategy & Risk (concession card + DOM-risk table)
  · AI Disclaimer

### 3-phase plan

  · CV-0 (THIS COMMIT) — Shared foundation. New files only: data-shaping
    helper + tier-chip helper + fixture-driven smoke. NO renderer touched.
  · CV-1 — Lead-page convergence. Migrate CharlieLeadEstimate (white-card)
    to consume the canonical view + tier-chip helper. Add the missing
    sections (plan card grid, Seller Profile, Best Time, Pricing Strategy
    & Risk, etc.) gated by `present` flags. Estimator-lead WorkingDocView
    branch UNCHANGED.
  · CV-2 — Email convergence. Migrate buildRichPlanEmail to consume the
    canonical view + tier-chip helper. Replace email's inline
    TIER_COLORS_EMAIL / HOME_LABELS_EMAIL / CONDO_LABELS_EMAIL duplication
    with import from lib/charlie/tier-chip.ts.
  · CV-3 — Convergence harness. One test asserts all three surfaces render
    the same canonical set against the same fixture; renderer-specific
    style/copy is allowed to differ, structure is not.

### Decision log

  · Charlie in-chat "buyer-gating" (ResultsPanel.tsx:107 hides
    BuyerOfferBlock when a sellerEstimate block exists) — LEFT AS-IS.
    Pre-existing design, byte-identical 6f685be→HEAD per
    W-CHARLIE-REGRESSION recon. Un-gating it would be a new feature
    (showing the pricing graph + Price-by-Bedroom inside a seller flow),
    not a convergence fix. Operator can scope separately.
  · Lead 63b48f13 is the locked CV fixture — only post-3d9ac08 seller lead
    with sellerEstimate persisted at recon time. 606 Aspen rd Pickering,
    Detached home, bestGeoTier=gold, taxMatch.count=12 firing,
    taxMatch.bestGeoTier=silver, 5 geo comps + 10 tax comps + 2 competing.

### CV-0 ship (this commit)

NEW FILES ONLY. No renderer touched. No source-code edit to plan-email,
SellerEstimateBlock, ComparableCard, ResultsPanel, CharlieLeadEstimate,
LeadDetailClient, page.tsx, charlie-plan-email-html.

  · lib/charlie/tier-chip.ts (NEW, 92 lines)
    Single source for tier color (#10b981 / #f59e0b / #64748b / #c2410c)
    + label + marker + per-path sub. Cites the existing duplication
    (ComparableCard.tsx:54-58, SellerEstimateBlock.tsx:75-79, CharlieLead-
    Estimate.tsx:85-89, charlie-plan-email-html.ts) — values byte-
    identical. Exports `TIER_META`, `TIER_ORDER`, `asTierName`,
    `tierChipFor(sourceTier, anchorTier, path)` (anchor-fallback mirror
    of EstimatorResults.tsx:616-617). Pure JS — no React import, no
    bundler complications, both React surfaces AND email-HTML builder can
    import. CV-1/CV-2 will migrate the 4 duplications.
  · lib/charlie/seller-estimate-view.ts (NEW, 432 lines)
    Exports `SellerEstimateView` type + `buildSellerEstimateView(planData)`
    pure function. Reads plan_data.{plan, analytics, sellerEstimate} and
    produces ONE normalized shape covering every canonical section above.
    NORMALIZES the three comp-row shapes (geo camelCase, tax camelCase +
    sourceTier, competing snake_case) into ONE `CanonicalCompRow`:
    `{ address, beds, baths, sqft, dom, price, priceKind, listingKey,
       sourceTier, mediaUrl, id }`. Missing fields → explicit null (Rule
    Zero — no fabricated values). Returns null for buyer plans / empty
    plans (clean gate, no throw). Carries `present` flags so renderers
    show/hide honestly. Pure: no React, no DOM, no string-HTML.
    Deterministic.
  · app/api/charlie/test-seller-estimate-view-probe/route.ts (NEW)
    Test-only probe (Next.js forbids non-handler exports from route files,
    so the smoke can't import the TS helper directly without ts-node).
    POST { op:view, leadId|planData } / { op:tierChip, … } /
    { op:tierMeta } / { op:asTierName, … }. No mutation, no auth gates,
    no send.
  · scripts/smoke-seller-estimate-view.js (NEW)
    Fixture-driven smoke. SAVEPOINT-isolated pg read of 63b48f13 plan_data
    → POSTs to probe → asserts EVERY canonical section against the live
    source. 144 named PASS/FAIL items.

### CV-0 RECON output (STEP 1 — source field shapes captured from 63b48f13)

  · plan_data.plan.{goal,type,geoName,summary,bedrooms,timeline,
        budgetMax,budgetMin,planReady,propertyType,estimatedValueMax,
        estimatedValueMin}
  · plan_data.analytics (28 fields including insight_seasonal {
        best_months,sample_size,monthly_data,worst_months,current_month,
        annual_avg_dom,annual_avg_stl,current_month_rank } +
        subtype_breakdown {per-subtype {count,avg_dom,median_price,
        sale_to_list}} + price_trend_monthly[24]{count,month,value})
  · plan_data.sellerEstimate.{path,intent,estimate{},geoLevel,
        comparables[5],buildingName,subjectAddress,competingListings[2]}
  · plan_data.sellerEstimate.estimate.{tiers{P/G/S/B},taxMatch{count,
        tiers,matchTier,priceRange,bestGeoTier,comparables[10],
        estimatedPrice},matchTier,showPrice,confidence,priceRange,
        bestGeoTier,comparables[5],marketSpeed{status,message,
        avgDaysOnMarket},estimatedPrice,adjustmentSummary,
        confidenceMessage,currentMarketPrice}
  · GEO comp row (camelCase): closePrice/listPrice/closeDate/listingKey/
        mediaUrl/unparsedAddress/livingAreaRange/daysOnMarket/etc.; NO
        sourceTier on any of the 5
  · TAX comp row (camelCase + sourceTier='silver' on all 10)
  · COMPETING row (snake_case): list_price/listing_key/bedrooms_total/
        bathrooms_total_integer/unparsed_address/living_area_range/
        days_on_market/etc.; NO sourceTier

### Build + test

  · npx tsc --noEmit: exit 0
  · scripts/smoke-seller-estimate-view.js: 144/144 PASS
    OUTPUT: scripts-output/smoke-seller-estimate-view.txt

### Hygiene

  · No renderer touched. ResultsPanel/SellerEstimateBlock/ComparableCard/
    CharlieLeadEstimate/LeadDetailClient/page.tsx/charlie-plan-email-html
    byte-unchanged.
  · S1 (condoleads.ca legacy /admin, app/api/chat/*, agent_buildings):
    zero diff.
  · Tracker write atomic with this commit (operator's standing pattern).
  · HOLD push pending operator approval.

---

## W-CHARLIE-CONVERGENCE CV-1 — SHIPPED LOCAL (2026-06-14)

Lead-page parity. CharlieLeadEstimate now consumes the canonical
SellerEstimateView from CV-0 and renders the FULL locked target set on the
dashboard: the existing estimate block (price card, tier rail, comparables
with chips, tax-matched + estimate pill, competing) PLUS the 8 plan-side
sections it previously dropped (Seller Strategy, Seller Profile, Market
Intelligence, Price by Home Type, Offer Intelligence, Best Time to Sell,
Pricing Strategy & Risk, AI Disclaimer). Each section is gated on its
view.present flag — no empty shells.

Tier-chip duplication killed at this surface: CharlieLeadEstimate.tsx now
imports TIER_META / TIER_ORDER / tierChipFor from CV-0 instead of declaring
its own inline `TIER_COLORS: Record<TierKey, string> = { platinum:'#10b981',
... }` literal (previously at L85-89 of the file). Same hex values — proven
byte-identical by CV-0 — but now ONE source. Three duplications remain
(ComparableCard, SellerEstimateBlock, charlie-plan-email-html) — CV-2 hits
the email one; the two in-chat React surfaces are out of CV-1 scope.

### Deploy state correction

CV-0 marked `3aa0449` live deploy as INFERRED (Vercel CLI v51 didn't expose
`meta.githubCommitSha`). Operator subsequently confirmed via the Vercel
dashboard Production row that walliam.ca IS serving `3aa0449`. Status:
VERIFIED LIVE, not inferred.

### Files (changes only — backup_cv1_20260614_054218 for each)

  - components/dashboard/CharlieLeadEstimate.tsx
    REWRITE. Props now `{ view: SellerEstimateView | null | undefined,
    legacyNoticeWhenEmpty?, leadMeta? }`. Sections (in render order):
      L165-176  amber notice                    (Phase 2 path preserved)
      L196-202  Seller Strategy (planSummary)   NEW
      L205-237  Seller Profile (planCardGrid)   NEW
      L240-260  Estimate price card             (preserved)
      L263-313  Tier rail "Confidence by Area"  (preserved; TIER_META migrated)
      L316-364  Market Intelligence             NEW
      L367-394  Price by Home Type              NEW
      L397-419  Offer Intelligence              NEW
      L422-441  Best Time to Sell               NEW
      L444-456  Comparable Sold + chips         (preserved)
      L459-486  Tax-Matched + pill + chips      (preserved)
      L489-501  Competing For Sale (no chip)    (preserved)
      L504-561  Pricing Strategy & Risk         NEW
      L564-568  AI Disclaimer                   NEW
    Tier chip via `tierChipFor` (CV-0 anchor-fallback rule).
    Inline TIER_COLORS literal REMOVED.

  - components/dashboard/LeadDetailClient.tsx
    Calls buildSellerEstimateView((lead as any)?.plan_data ?? null) once.
    Branches: view present → CharlieLeadEstimate view={sellerView}; else
    leadIsCharlieSeller → CharlieLeadEstimate view={null} legacyNoticeWhen-
    Empty={true} leadMeta={…}; else → WorkingDocView (unchanged).
    The `charlieSellerEstimate` prop is now vestigial (kept on interface
    for page.tsx backward compat; not destructured).

  - app/dashboard/leads/[id]/page.tsx — UNCHANGED. Vestigial `charlie-
    SellerEstimate` prop on LeadDetailClient still satisfies the existing
    caller; `leadIsCharlieSeller` still propagates. No edit needed.

### Verification

  - scripts/smoke-cv1-lead-page.js (NEW)
    Combined-evidence smoke. DATA leg hits the CV-0 view probe at
    /api/charlie/test-seller-estimate-view-probe (the SHIPPED helper runs
    server-side; verifies view non-null + correct present flags + correct
    values from analytics/plan/estimate for 63b48f13). VIEW-CONSUMPTION
    leg does static source analysis of CharlieLeadEstimate.tsx +
    LeadDetailClient.tsx (every canonical section's JSX present + reads
    the right view path + each gated on view.present.*). AMBER path:
    asserts the legacyNotice copy + amber-styling class are in the source
    AND that buildSellerEstimateView returns null for a real pre-3d9ac08
    Charlie seller lead (42a20b25-…). NEITHER path: asserts view returns
    null for a non-charlie-seller lead (1fdab8c3-…). Tier-chip parity:
    asserts the inline TIER_COLORS literal is GONE and CV-0 imports
    present. Non-in-scope surfaces byte-unchanged: 09b97ef SHAs all match
    (chat route / tools / prompt / Charlie VIP). Result: 92/92 PASS.
    OUTPUT: scripts-output/smoke-cv1-lead-page.txt

  - Render-output probe NOT shipped. A `renderToStaticMarkup` probe over
    CharlieLeadEstimate failed because Next 14 resolves 'use client'
    imports in route handlers to a client-component placeholder object,
    not the function. Documented in the smoke header. Combined-evidence
    pattern (CV-0 data smoke + static source) is the C-CHARLIE-FOLLOWUP
    B(i) approach when actual server-rendering of a client component
    isn't feasible.

### Byte-unchanged proofs (CV-1 is lead-page only)

  app/charlie/components/ResultsPanel.tsx           sha 72f5d88adef9  unchanged
  app/charlie/components/SellerEstimateBlock.tsx    sha 564981cd6333  unchanged
  app/charlie/components/ComparableCard.tsx         sha 57a70d05ffec  unchanged
  lib/email/charlie-plan-email-html.ts              sha a20d5f4e1b2f  unchanged
  app/api/charlie/plan-email/route.ts               sha 4f24d9cd2cc7  unchanged
  app/api/charlie/route.ts                          sha 9c64acba0564  MATCH (09b97ef)
  app/charlie/lib/charlie-tools.ts                  sha a02ee7ab48f9  MATCH (09b97ef)
  app/charlie/lib/charlie-prompts.ts                sha fbe7b7de14b9  MATCH (09b97ef)
  app/api/walliam/charlie/vip-request/route.ts      sha 97c651e90c6f  MATCH (09b97ef)

### Build + S1

  npx tsc --noEmit: exit 0
  S1 (condoleads.ca legacy /admin, app/api/chat/*, agent_buildings): zero diff.

### Phase status

  - CV-0: shipped + pushed (origin/main = 3aa0449 + 5040a5e)
  - CV-1: shipped local; HOLD push pending operator approval + walliam.ca
          eyeball of a real Charlie seller lead with full canonical render
  - CV-2: NEXT — email convergence; buildRichPlanEmail consumes the
          canonical view + tier-chip helper (kills the email's literal
          TIER_COLORS_EMAIL / HOME_LABELS_EMAIL / CONDO_LABELS_EMAIL
          duplication)
  - CV-3: convergence harness — asserts all three surfaces render the same
          canonical set

---

## W-CHARLIE-CONVERGENCE CV-2 — SHIPPED LOCAL (2026-06-14)

Email parity. lib/email/charlie-plan-email-html.ts now imports
buildSellerEstimateView + tierChipFor + TIER_META + TIER_ORDER from CV-0
and renders the 2 missing canonical sections (Property Estimate price
card + 4-row tier rail with anchor highlight) inline-styled to match the
email's existing theme. The inline TIER_COLORS_EMAIL +
HOME_LABELS_EMAIL + CONDO_LABELS_EMAIL declarations (8 lines + 4 hex
literals + 8 label entries) are GONE. 2nd of 4 tier-chip duplications
killed (after CV-1 hit CharlieLeadEstimate).

System 2 only. S1 untouched. CV-2 scope is email-only; the lead page
(CV-1, shipped + pushed at 6935f87) and the Charlie in-chat panel are
NOT touched.

### Files (changes only — backup_cv2_20260614_061331 for each)

  - lib/email/charlie-plan-email-html.ts
    - L19-20  NEW imports: `import { buildSellerEstimateView } from
              '@/lib/charlie/seller-estimate-view'` + `import { TIER_META,
              TIER_ORDER, tierChipFor } from '@/lib/charlie/tier-chip'`
    - L319-340 REMOVED: const TIER_COLORS_EMAIL + HOME_LABELS_EMAIL +
              CONDO_LABELS_EMAIL inline declarations (CV-0 cited values
              byte-identical to pre-CV-2 — proven by Phase 2 chip-parity
              + CV-2 hex-count assertions).
    - L321    NEW: `const view = buildSellerEstimateView({ planType,
              plan, analytics, sellerEstimate })` — single call; the view
              feeds the new sections + is null-clean for buyer plans.
    - L328-332 tierChipHtml now reads tierChipFor with anchor-fallback
              baked in (no more local TIER_COLORS_EMAIL + emailLabelMap
              lookups). Signature unchanged for callers.
    - L455-465 NEW: priceCardHtml — inline-styled "Estimated Value" card
              with estimatedPrice + priceRange + Confidence/matchTier.
              Gated on view.present.priceCard.
    - L467-490 NEW: tierRailHtml — 4 rows (P/G/S/B) via TIER_ORDER.map.
              Each row a nested <table> with the tier chip via TIER_META
              + home/condo sub + median + comp count. Anchor row gets
              emerald bg/border + "Anchor" pill (#d1fae5/#34d399).
              Inline-styled tables (Outlook-Desktop safe). Gated on
              view.present.tierRail.
    - L518-519 NEW mount: ${priceCardHtml} + ${tierRailHtml} between
              ${profileHtml} and ${listingsHtml}.

### Verification — scripts/smoke-cv2-email.js (NEW)

Real fixture lead 63b48f13 → existing test-render-plan-email-probe POSTs
the canonical payload → buildRichPlanEmail renders → 58 assertions.

  - PRESERVATION (13/13): plan-card grid "Your Seller Strategy", Seller
    Profile, Market Intelligence, Price by Home Type, Offer Intelligence,
    Best Time, Comparable Sold (5), Tax-Matched (10), Tax-matched
    estimate pill, Competing For Sale (2), AI Disclaimer, Open WALLiam
    CTA, Seller Strategy summary.
  - COMPLETENESS — price card (6/6): "Estimated Value" label,
    $1,012,635 value, "Range $931,624 – $1,093,646", "Confidence: Medium
    · RANGE-ADJ".
  - COMPLETENESS — tier rail (15/15): heading "Confidence by Area",
    rows ◆ Platinum / ● Gold / ● Silver / ● Bronze, home-path subs
    "Same street" / "Community" / "Municipality" / "Area", "Anchor" pill
    on best row, tier rail gold {$1,127,000 · 5 comps}, silver
    {$1,118,500 · 32 comps}, platinum + bronze "no data".
  - CHIP PARITY (4/4): gold hex #f59e0b ≥ 6 (5 comp + 1 tier-rail);
    silver #64748b ≥ 11 (10 tax + 1 tier-rail) — actual 69 because the
    silver hex doubles as a body text color on Tax-Matched section
    subheadings (informational); platinum #10b981 ≥ 1; bronze #c2410c
    ≥ 1.
  - DUPLICATION KILLED (9/9): inline TIER_COLORS_EMAIL +
    HOME_LABELS_EMAIL + CONDO_LABELS_EMAIL all REMOVED; CV-0 imports
    present (tier-chip module + buildSellerEstimateView + tierChipFor +
    TIER_META + TIER_ORDER); tierChipHtml now calls tierChipFor.
  - HYGIENE (7/7): zero undefined / NaN / Invalid Date / >null< / "$0";
    17 walliam.ca hrefs all well-formed; zero condoleads.ca leak.
  - NON-IN-SCOPE (4/4): all 4 09b97ef-protected SHAs MATCH (chat route /
    tools / prompt / Charlie VIP). CV-1 surfaces (CharlieLeadEstimate,
    LeadDetailClient), in-chat surfaces (ResultsPanel,
    SellerEstimateBlock, ComparableCard), and plan-email/route logged
    informationally — none touched this phase.

  Result: 58/58 PASS.
  OUTPUT: scripts-output/smoke-cv2-email.txt

### Build + S1

  npx tsc --noEmit: exit 0.
  S1 (condoleads.ca legacy /admin, app/api/chat/*, agent_buildings):
  zero diff.

### Duplication status (workstream-wide)

  Before CV-1: 4 tier-color duplications (ComparableCard, SellerEstimate-
               Block, CharlieLeadEstimate, charlie-plan-email-html).
  After CV-1:  3 duplications (CV-1 killed CharlieLeadEstimate's).
  After CV-2:  2 duplications (CV-2 killed charlie-plan-email-html's).
  Remaining:   ComparableCard.tsx:54-58 + SellerEstimateBlock.tsx:75-79
               (both in the in-chat React surfaces). Flagged as a
               cleanup pass — out of CV-2 scope. The two surfaces are
               byte-unchanged at HEAD; a CV-2-followup or CV-3 cleanup
               can migrate them in one atomic pass without rendering
               changes.

### Phase status

  - CV-0 (5040a5e): shipped + pushed
  - CV-1 (6935f87): shipped + pushed; operator confirmed walliam.ca
                   serving the lead-page parity
  - CV-2 (this commit): shipped local; HOLD push pending operator
                       approval + email eyeball
  - CV-3: convergence harness — asserts all three surfaces render the
          same canonical set against the same fixture (NEXT)


───────────────────────────────────────────────────────────────────────
W-CHARLIE-CONVERGENCE CV-3 — CONVERGENCE LOCK (test-only) — 2026-06-14
───────────────────────────────────────────────────────────────────────

  Scope: NEW test file + tracker only. No renderer modified. System 2
         only; S1 untouched.

  New file: scripts/smoke-cv3-convergence.js (+ scripts-output/smoke-cv3-
            convergence.txt). Anti-drift gate: asserts all three Charlie
            seller surfaces emit the same canonical set against the same
            fixture (lead 63b48f13). 14 canonical sections × 3 surfaces
            = 42 matrix cells. PASS only if every cell is PRESENT or an
            explicitly-enumerated deliberate exception.

### Convergence matrix result (51/51 PASS)

  SECTION                              LEAD PAGE  EMAIL              IN-CHAT
  ----------------------------------------------------------------------------
  Plan Summary                         PRESENT    PRESENT            DELIB-OM
  Seller Profile                       PRESENT    PRESENT            PRESENT
  Property Estimate price card         PRESENT    PRESENT            PRESENT
  4-row tier rail                      PRESENT    PRESENT            PRESENT
  Market Intelligence                  PRESENT    PRESENT            DELIB-GA
  Price by Home Type                   PRESENT    PRESENT            DELIB-GA
  Offer Intelligence                   PRESENT    PRESENT            DELIB-GA
  Best Time (seasonal)                 PRESENT    PRESENT            PRESENT
  Comparable Sold + tier chips         PRESENT    PRESENT            PRESENT
  Tax-Matched + chips + pill           PRESENT    PRESENT            PRESENT
  Competing For Sale                   PRESENT    PRESENT            PRESENT
  Pricing Strategy & Risk              PRESENT    DELIB-OM           PRESENT
  AI Disclaimer                        PRESENT    PRESENT            PRESENT
  Brand chrome / CTA                   PRESENT    PRESENT            N/A
  ----------------------------------------------------------------------------
  42 cells: 35 PRESENT, 4 DELIB-GATE, 2 DELIB-OMISSION, 1 N/A. Zero MISSING.

### Enumerated deliberate exceptions (the only non-PRESENT cells allowed)

  - email.pricing_risk → DELIBERATE-OMISSION
      Operator-confirmed: PricingRiskBlock concession + DOM-risk table
      is intentionally not in the plan email. FLAGGED FOR OPERATOR
      DECISION post-CV-3 (do not add in CV-3 scope).

  - inchat.{market_intel, price_by_home_type, offer_intel} → DELIBERATE-GATE
      ResultsPanel.tsx:107 gates BuyerOfferBlock when a sellerEstimate
      block exists. Source still present; gating is intentional buyer-
      surface routing. Byte-identical 6f685be → HEAD per W-CHARLIE-
      REGRESSION recon.

  - inchat.plan_summary → DELIBERATE-OMISSION
      The long plan.summary text is the email's surface. In-chat
      PlanDocument renders structured rows + a brief Seller Strategy
      preview card pre-plan instead.

  - inchat.brand_chrome → N/A
      In-chat IS the chat panel — there is no separate brand chrome
      wrapping it (WALLiam brand is the host context, not a section).

### Single-source / duplication watch (drift gate)

  PASS  lead page (CharlieLeadEstimate): TIER_META imported, no inline
        TIER_COLORS literal remains.
  PASS  email (charlie-plan-email-html): TIER_META imported, no inline
        TIER_COLORS_EMAIL literal remains.
  PASS  ComparableCard: inline TIER_COLORS still byte-identical to CV-0
        TIER_META: {platinum:#10b981, gold:#f59e0b, silver:#64748b,
        bronze:#c2410c}.
  PASS  SellerEstimateBlock: inline TIER_COLORS still byte-identical
        to CV-0 TIER_META.

  Known remaining duplication (flagged, not failed; cleanup tracked):
  - app/charlie/components/ComparableCard.tsx:54-58
  - app/charlie/components/SellerEstimateBlock.tsx:75-79
  → Test goes red on drift. Cleanup pass tracked under CV-3 follow-ups.

### Byte-unchanged proofs (CV-3 is test-only)

  PROTECTED (09b97ef-frozen) — must equal:
    app/api/charlie/route.ts                          9c64acba0564  OK
    app/charlie/lib/charlie-tools.ts                  a02ee7ab48f9  OK
    app/charlie/lib/charlie-prompts.ts                fbe7b7de14b9  OK
    app/api/walliam/charlie/vip-request/route.ts      97c651e90c6f  OK

  Informational (renderers; CV-3 made no changes):
    components/dashboard/CharlieLeadEstimate.tsx      5ea528c865d1
    components/dashboard/LeadDetailClient.tsx         c6dd945fc086
    lib/email/charlie-plan-email-html.ts              271edc397e96
    app/charlie/components/ResultsPanel.tsx           72f5d88adef9
    app/charlie/components/SellerEstimateBlock.tsx    564981cd6333
    app/charlie/components/ComparableCard.tsx         57a70d05ffec
    lib/charlie/tier-chip.ts                          0cac5bfb8e6e
    lib/charlie/seller-estimate-view.ts               1d4178b4de84

  S1 zero-diff:
    app/admin/page.tsx                                c956360a6f23
    app/api/chat/route.ts                             145b367d8d8f
    app/admin/agents/page.tsx                         f34fa709b1a1

  TSC: npx tsc --noEmit → exit 0.

### W-CHARLIE-CONVERGENCE — CORE COMPLETE

  - CV-0 (5040a5e):  shipped + pushed.
  - CV-1 (6935f87):  shipped + pushed; lead-page parity confirmed in
                     walliam.ca prod.
  - CV-2 (4f0ffc4):  shipped + pushed; email parity (price card + tier
                     rail mounted; inline tier literals removed).
  - CV-3 (this commit): shipped local; convergence harness green
                        (51/51 PASS, 42/42 matrix cells accounted for).
                        HOLD push pending operator approval.

### Named follow-ups (out of CV-3 scope)

  1. Email Pricing-Risk decision. PricingRiskBlock is in the lead page
     and in-chat but DELIBERATE-OMISSION in email. Operator decides:
     add to email (CV-2-followup) or formalize the omission (update
     harness with permanent reason).

  2. ComparableCard + SellerEstimateBlock duplication cleanup. Two
     in-chat React surfaces still carry inline TIER_COLORS literals
     byte-identical to TIER_META. One atomic migration to consume
     CV-0 TIER_META would kill duplications 3 and 4 (of original 4).

  3. Operator eyeballs (manual, not automatable):
     - Lead-page DOM at walliam.ca/dashboard/leads/<id>/
     - Email-client render (Gmail web + Outlook Desktop)


───────────────────────────────────────────────────────────────────────
W-CHARLIE-FIX — CHARLIE IN-CHAT REAL-RENDER FIX — 2026-06-14
───────────────────────────────────────────────────────────────────────

  Scope: 2 files edited + 1 API endpoint widened (System 2 only; S1
         untouched; email + lead-page files byte-unchanged). 3 gaps from
         the REAL-CHARLIE harness all resolved. Source-grep convergence
         (CV-3) is now DEPRECATED as the release gate — real-DOM
         Playwright is the gate.

### STEP 1 — root-cause tax=5000 (read-only, before any edit)

  Dual live run (head to head) on aecd67d:
    propertyTax=5000   → "Tax-Matched · 10 found"  rendered live DOM
    propertyTax=7500   → "Tax-Matched · 10 found"  rendered live DOM

  Both values render Tax-Matched with 10 comps. The operator's GAP 3
  observation (tax=5000 → no tax-match) cannot be reproduced against
  the current deploy. Possible causes (unverifiable): stale browser
  cache, transient deploy state, or different field combination at
  the time of the operator's run.

  However, the silent-hide PATTERN that would produce that observation
  IS real: home-comparable-matcher-sales.ts:1352 returns undefined when
  the cascade fails all 3 tier thresholds (Platinum ≥ 1; Gold/Silver
  ≥ 3 after funnel), and SellerEstimateBlock.tsx:108 silently hid the
  section in that case. The GAP 2 honest-empty-state fix below makes
  this scenario operator-visible (no silent vanish), which subsumes
  GAP 3 — when the matcher returns no comps for ANY reason (band too
  narrow, sparse data, future regression), the operator now sees
  "No tax-matched comparables for this property" instead of nothing.

### STEP 2 — the 3 fixes (file:line)

  GAP 1 — un-gate Market Intel + Price by Home Type + Offer Intel for
  seller flow:
    • app/charlie/components/ResultsPanel.tsx:253-308
      Mounted the Market Intelligence grid + BuyerOfferBlock INSIDE
      the sellerEstimate block render path, fed by
      block.analyticsSnapshot. The buyer-side gate at line 107
      (now 162) is UNCHANGED — buyers still get the analytics block
      via the existing path. propertyType is derived as
      `aSnap.track || (se.path === 'home' ? 'homes' : 'condo')` so
      BuyerOfferBlock's isHomes/isCondo gates fire correctly even on
      legacy/cached payloads.
    • app/api/charlie/seller-estimate/route.ts:43-50 + 106-113
      Widened analytics SELECT to include bedroom_breakdown,
      subtype_breakdown, price_trend_monthly, insight_seasonal.
      Stamps `track: 'condo'`/`'homes'` into the returned analytics
      object so BuyerOfferBlock can derive isCondo/isHomes from it.

  GAP 2 — replace silent tax-match hide with honest empty-state:
    • app/charlie/components/SellerEstimateBlock.tsx:278-326
      Always render the Tax-Matched section header (with N count).
      When taxComps.length === 0, render a dashed-border empty-state
      pill: "No tax-matched comparables for this property — the
      matcher's ±20% same-municipality tax band did not surface
      enough comps to qualify a tier. The geo-based comparables
      above remain the primary value signal."

  GAP 3 — tax=5000 root-cause-driven fix:
    NOT REPRODUCIBLE per STEP 1 (BOTH 5000 and 7500 render). Folded
    into GAP 2 empty-state, which closes the visibility class of the
    operator's complaint regardless of which tax value happens to
    yield zero comps in a given matcher run.

### STEP 3 — real-DOM Playwright verify (LOCAL dev, port 3002)

  Test harness: scripts/charlie-fix-step3-verify.js
  Scenarios:
    A — seller propertyTax=5000  (normal range)
    B — seller propertyTax=7500  (no regression vs CV-3 baseline)
    C — seller propertyTax=50000 (extreme tax → empty tax-match)
    D — buyer flow (form-mount verify; full render needs auth)

  Real-DOM section inventory per scenario:

  SECTION                              A(5000)   B(7500)   C(50000)
  ─────────────────────────────────────────────────────────────────
  Property Estimate price card         PRESENT   PRESENT   PRESENT
  4-row tier rail (Confidence by Area) PRESENT   PRESENT   PRESENT
  Comparable Sold                      PRESENT   PRESENT   PRESENT
  Tax-Matched (always-on header)       PRESENT   PRESENT   PRESENT
  Competing For Sale                   PRESENT   PRESENT   PRESENT
  Pricing Strategy & Risk              PRESENT   PRESENT   PRESENT
  Your Seller Strategy card            PRESENT   PRESENT   PRESENT
  [GAP 1] Market Intelligence          PRESENT   PRESENT   PRESENT
  [GAP 1] Offer Intelligence           PRESENT   PRESENT   PRESENT
  [GAP 1] Price by Home Type           PRESENT   PRESENT   PRESENT
  Tax-Matched heading text             "·10 found"  "·10 found"  "·0 found"
  [GAP 2] empty-state present?         no         no         YES

  Final verdict: 13/13 PASS, 0 FAIL.

  Buyer-side gate (ResultsPanel:107) verified UNCHANGED — buyer flow
  still routes Market Intel + BuyerOfferBlock through the analytics
  block path. No regression.

### STEP 4 — TSC + byte-unchanged proofs

  TSC:                       npx tsc --noEmit → exit 0
  Backups before edit (timestamp 20260614_131538 + 132533):
    - app/charlie/components/ResultsPanel.tsx.backup_20260614_131538
    - app/charlie/components/SellerEstimateBlock.tsx.backup_20260614_131538
    - app/api/charlie/seller-estimate/route.ts.backup_20260614_132533

  Protected 09b97ef SHAs — all OK:
    app/api/charlie/route.ts                          9c64acba0564
    app/charlie/lib/charlie-tools.ts                  a02ee7ab48f9
    app/charlie/lib/charlie-prompts.ts                fbe7b7de14b9
    app/api/walliam/charlie/vip-request/route.ts      97c651e90c6f

  S1 zero-diff (admin/page.tsx, api/chat/route.ts, admin/agents/page.tsx):
    c956360a6f23 / 145b367d8d8f / f34fa709b1a1 — UNCHANGED.

  Charlie-in-chat-only confirmation — these files NOT touched:
    lib/email/charlie-plan-email-html.ts              271edc397e96
    components/dashboard/CharlieLeadEstimate.tsx      5ea528c865d1
    components/dashboard/LeadDetailClient.tsx         c6dd945fc086
    components/admin-homes/lead-workbench/PlanRenderer.tsx d263721818d7

### CV-3 source-grep harness — DEPRECATED as the release gate

  CV-3 (scripts/smoke-cv3-convergence.js) is now a fast-feedback unit
  signal only. It catches markup drift + helper rename + tier-color
  literal drift, but it CANNOT detect:
    - runtime data-driven gates (e.g. hasTaxMatch → silent hide on
      empty comps — silently passed CV-3 despite GAP 2 being live)
    - cross-block gating (e.g. ResultsPanel:107 suppressing
      BuyerOfferBlock in seller flow — CV-3 enumerated as
      DELIBERATE-GATE, which papered over GAP 1)
    - missing data fields from upstream APIs (e.g.
      subtype_breakdown not in seller-estimate response — invisible
      to CV-3)
    - propertyType prop mismatches (e.g. aSnap.track undefined →
      BuyerOfferBlock returns null — invisible to CV-3)

  The release gate is now scripts/real-charlie-harness.js (REAL-CHARLIE
  for in-chat) + scripts/charlie-fix-step3-verify.js (this fix's verify
  harness). Future deploys should run both BEFORE marking a Charlie
  surface change as shipped.

### Named follow-ups (out of scope here)

  1. REAL-CHARLIE-2 (lead page) and REAL-CHARLIE-3 (email-client
     render) harnesses — referenced in CV-3 follow-ups; required
     before claiming convergence on those surfaces.
  2. Authed-flow real-render harness — needs test agent + VIP credit
     to verify the post-register path (plan generation, AI Disclaimer,
     Best Time rendering).
  3. PlanRenderer parity with CharlieLeadEstimate (admin-homes lead
     workbench) — REAL-LEADS harness diagnosis identified this as a
     separate route from CV-1's scope; product decision pending.


───────────────────────────────────────────────────────────────────────
W-CHARLIE-LEADS-FIX — ADMIN LEAD PAGE FULL-CONTENT MOUNT — 2026-06-14
───────────────────────────────────────────────────────────────────────

  Scope: 1 file edited (components/admin-homes/lead-workbench/
         PlanRenderer.tsx). System 2; S1 untouched. Charlie in-chat
         + email + dashboard LeadDetailClient + CharlieLeadEstimate
         byte-unchanged. REAL-LEADS recon identified that CV-1's
         CharlieLeadEstimate was mounted on /dashboard/leads/[id]/
         (a route the operator never visits) while the operator-
         visible /admin-homes/leads/[id]/ uses PlanRenderer (limited
         to plan_data fields). This mount brings the full canonical
         content to the admin page WITHOUT modifying CV-1's component.

### STEP 1 — data-wall verdict

  SAVEPOINT-isolated read against production. Resolves PlanRenderer.tsx
  L14's outdated "sellerEstimate is API-time-only, not in plan_data,
  unrenderable" comment:

  lead 63b48f13-8a03-46be-b4ce-91007da0794a (Finaltest110, intent=seller):
    plan_data top keys: ["analytics","plan","planType","sellerEstimate",
                         "topListings"]
    sellerEstimate present? YES
    sellerEstimate.estimate present + taxMatch.comparables count 10 +
      estimatedPrice 848754. comparables count 5. competingListings 2.

  Coverage across all WALLiam Charlie SELLER leads:
    total:                  12
    with sellerEstimate:    3  (25.0%)
    without sellerEstimate: 9  (legacy, pre-3d9ac08 persistence change)
    Recent leads (Jun 14, Jun 13) all have it; older ones don't.

  Verdict: the L14 comment was correct WHEN WRITTEN (pre-3d9ac08), now
  outdated. Persisted sellerEstimate exists for 25% of seller leads
  (will rise to 100% as legacy leads age out). The fix MUST handle
  both shapes — full content where present, honest amber notice where
  null — which is exactly the Phase-2 amber-notice pattern.

### STEP 2 — mount approach (file:line, duplication choice)

  components/admin-homes/lead-workbench/PlanRenderer.tsx
    L16-17 + L30-31: import CharlieLeadEstimate + buildSellerEstimateView
    L245:            sellerViewPresent (hoisted view-derivation for the
                      disclaimer-suppression branch below)
    L285-286:        buyer keeps TopListings (matched listings);
                      seller routes to <SellerEstimateMount lead={lead} />
    L297:            {!sellerViewPresent && <Disclaimer />} — suppress
                      PlanRenderer's Disclaimer when CharlieLeadEstimate
                      will render its own AI Disclaimer (avoid dup ×2)
    L501-538:        SellerEstimateMount function definition.
                      Computes view = buildSellerEstimateView(plan_data).
                      View present → mount CharlieLeadEstimate with
                      adminView (present flag overrides suppress the
                      6 sections PlanRenderer already renders).
                      View null  → mount CharlieLeadEstimate with
                      view=null + legacyNoticeWhenEmpty=true → amber
                      "no estimate captured" notice.

  Duplication-avoidance choice — override view.present flags inside the
  mount BEFORE passing to CharlieLeadEstimate:
    view.present.planCardGrid    = false   (PlanRenderer.Profile renders)
    view.present.marketIntel     = false   (PlanRenderer.MarketIntel)
    view.present.offerIntel      = false   (PlanRenderer.OfferIntel)
    view.present.bestTime        = false   (PlanRenderer.BestTime)
    view.present.priceByHomeType = false   (PlanRenderer.SubtypeBreakdown)
    view.present.planSummary     = false   (PlanRenderer.Summary)
  + PlanRenderer.Disclaimer suppressed when sellerViewPresent (via
    the L297 conditional) to avoid CharlieLeadEstimate's AI Disclaimer
    rendering twice.

  Net: each section renders EXACTLY ONCE per the seller view, sourced
  from whichever component is the cleanest fit (PlanRenderer for the
  analytics-derived stats, CharlieLeadEstimate for the
  sellerEstimate-derived sections).

### STEP 3 — REAL-DOM verify (no source-grep)

  Handle: react-dom/server.renderToStaticMarkup + tsx/cjs (no jsdom).
  jsdom + @testing-library/react NOT installed; chose the lighter
  string-assertion path. tsx (3 packages, ~5MB) installed as
  devDependency for the test harness only.

  Real lead 63b48f13 plan_data pulled SAVEPOINT-isolated, fed to
  PlanTab as both anchorLead and leadFamily[0]. Static markup
  captured (31,744 chars) and section occurrence-counted:

  TAG                   NEEDLE                  COUNT  VERDICT
  ────────────────────────────────────────────────────────────────
  PlanRenderer's existing sections (must remain ×1):
  PR-MarketIntel        Market Intelligence     1      PASS
  PR-OfferIntel         Offer Intelligence      1      PASS
  PR-BestTime           Best Time to            1      PASS
  PR-PriceByHomeType    Price by Home Type      1      PASS
  PR-SellerProfile      Seller Profile          1      PASS
  PR-SellerStrategy-Hdr "💰 Seller Strategy"    1      PASS
  PR-SummaryCard        "Your Seller Strategy"  1      PASS
  global-strategy-count "Seller Strategy" (sum) 2      PASS  (header + Summary; no CLE dup)

  CharlieLeadEstimate-mounted sections (new — must render ×1):
  CLE-PriceCard         Estimated value         1      PASS
  CLE-TierRail          Confidence by Area      1      PASS
  CLE-ComparableSold    Comparable Sold         1      PASS
  CLE-TaxMatched        Tax-Matched             1      PASS
  CLE-TaxMatchPill      Tax-matched estimate    1      PASS
  CLE-Competing         Competing For Sale      1      PASS
  CLE-PricingRisk       Pricing Strategy        1      PASS
  CLE-AIDisclaimer      AI Disclaimer           1      PASS (was ×2 pre-suppress)
  ────────────────────────────────────────────────────────────────
  Section verdict: 16/16 PASS, 0 FAIL.

  Null-path (lead 42a20b25 — Final Test 109, sellerEstimate=null):
    amber heading "No estimate captured"               × 1   PASS
    amber copy "pre-dates the estimate-persistence …" × 1   PASS
    Estimated value (price card) not present                 PASS
    Tax-Matched not present                                  PASS
    Comparable Sold not present                              PASS
    Null path verdict: PASS.

  Final: 16/16 + amber PASS, 0 FAIL.

### STEP 4 — TSC + byte-unchanged proofs

  TSC: npx tsc --noEmit → exit 0.

  Backups:
    components/admin-homes/lead-workbench/PlanRenderer.tsx
      .backup_20260614_134427 (pre-STEP-2 state)
    docs/W-ESTIMATOR-PATHS-TRACKER.md
      .backup_20260614_140729 (this run)

  Protected 09b97ef SHAs — all OK:
    app/api/charlie/route.ts                          9c64acba0564
    app/charlie/lib/charlie-tools.ts                  a02ee7ab48f9
    app/charlie/lib/charlie-prompts.ts                fbe7b7de14b9
    app/api/walliam/charlie/vip-request/route.ts      97c651e90c6f

  S1 zero-diff:
    app/admin/page.tsx                                c956360a6f23
    app/api/chat/route.ts                             145b367d8d8f
    app/admin/agents/page.tsx                         f34fa709b1a1

  Scope-bound byte-unchanged (this is admin-lead-page only):
    app/charlie/components/ResultsPanel.tsx           ea96a0091bf5
    app/charlie/components/SellerEstimateBlock.tsx    66e30c271f3c
    app/api/charlie/seller-estimate/route.ts          73a40ec0351f
    lib/email/charlie-plan-email-html.ts              271edc397e96
    components/dashboard/CharlieLeadEstimate.tsx      5ea528c865d1
    components/dashboard/LeadDetailClient.tsx         c6dd945fc086
    lib/charlie/seller-estimate-view.ts               1d4178b4de84
    lib/charlie/tier-chip.ts                          0cac5bfb8e6e

### Operator-visible outcome

  Before: /admin-homes/leads/63b48f13/ Plan tab rendered Market Intel,
          Offer Intel, Best Time, Price by Home Type, Seller Profile +
          a topListings subset. NO price card, NO tier rail, NO full
          comparables with chips, NO tax-match, NO competing, NO
          pricing-risk block. Operator's "pathetic — only stats"
          complaint, exactly as captured.

  After:  same Plan tab now ALSO renders Property Estimate price card +
          4-row tier rail (Confidence by Area) + full Comparable Sold
          with tier chips + Tax-Matched + Tax-matched estimate pill +
          Competing For Sale + Pricing Strategy & Risk + AI Disclaimer.
          Existing stats UNCHANGED in position and content. Zero
          duplication (proven by occurrence count). Pre-persistence
          legacy seller leads (75% of historical) render the honest
          Phase-2 amber notice instead of empty/broken sections.

### Named follow-ups (out of scope)

  1. Operator manual eyeball at /admin-homes/leads/63b48f13/ post-deploy
     to confirm visual layout matches the rendered-markup verify above.
  2. CV-3 source-grep harness (deprecated as release gate per
     W-CHARLIE-FIX) — augment with a real-render version of REAL-LEADS
     equivalent for ongoing regression coverage on this surface.
  3. tsx devDependency installed for the verify harness. Small footprint
     (~5MB). If unwanted, can be removed and harness re-pointed at
     esbuild-register or any other TSX loader.


───────────────────────────────────────────────────────────────────────
W-CHARLIE-EMAIL-FIX — TAX-MATCH SILENT-OMIT FIX (EMAIL) — 2026-06-14
───────────────────────────────────────────────────────────────────────

  Scope: 1 file edited (lib/email/charlie-plan-email-html.ts).
         System 2; S1 untouched. Charlie in-chat (ResultsPanel,
         SellerEstimateBlock), seller-estimate API, plan-email route,
         admin PlanRenderer, dashboard LeadDetailClient + Charlie-
         LeadEstimate, helper modules all byte-unchanged.

### STEP 1 — silent-omit fix (file:line)

  lib/email/charlie-plan-email-html.ts:381-440
    Pre-fix gate (silent-omit):
      const taxMatchHtml = taxComps.length > 0 ? `<…tax-match section…>` : ''
    Post-fix (always render, conditional inner):
      const taxMatchEmptyStateHtml = `<…honest empty-state…>`
      const taxMatchHtml = `
        <div…>
          <div…>Tax-Matched (${taxComps.length})</div>
          <div…>Same-municipality sales…</div>
          ${taxComps.length === 0
            ? taxMatchEmptyStateHtml
            : `${pillHtml}${tilesHtml}`}
        </div>`
    Empty-state markup is email-safe: <table>/<td> layout, inline
    styles, no flexbox, no <div> background tricks Outlook strips.
    Wording matches the chat fix (SellerEstimateBlock.tsx empty-state,
    W-CHARLIE-FIX GAP 2):
      "No tax-matched comparables for this property — the matcher's
       ±20% same-municipality tax band did not surface enough comps to
       qualify a tier. The geo-based comparables above remain the
       primary value signal."

### STEP 2 — real-render verify (renderToStaticMarkup, NOT source-grep)

  Handle: live buildRichPlanEmail + tsx/cjs against real plan_data
  pulled SAVEPOINT-isolated. Two leads.

  PART 1 — POPULATED PATH (63b48f13, 10 tax-comps):
    rendered: 50,455 chars
    SHA12 post-fix:   d54b129e847d
    SHA12 pre-fix:    d54b129e847d
    populated-path byte-identical?  PASS

    populated-section probes:
      Tax-Matched (10)                  PASS  present
      Tax-matched estimate pill         PASS  present
      Tier rail (Confidence by Area)    PASS  present
      Price card (Estimated Value)      PASS  present
      Comparable Sold (5)               PASS  present
      Competing For Sale                PASS  present
      no empty-state on populated       PASS  absent (correctly)
    shape checks:
      walliam.ca hrefs: 18              PASS
      condoleads.ca leak: 0             PASS
      undefined/NaN/$0 leaks: 0         PASS

  PART 2 — EMPTY-STATE PATH (1b2a5b50, 0 tax-comps):
    rendered: 34,322 chars (was ~33,383 pre-fix = +939 chars for
    the new header + empty-state markup; section now visible
    instead of silent-vanished)
    empty-state + preservation probes:
      Tax-Matched (0) header NOW renders        PASS  present
      Empty-state honest line NOW renders       PASS  present
      Tax-matched estimate pill ABSENT          PASS  absent
      Subhead "Same-municipality sales…"        PASS  present
      Tier rail still present                   PASS  present
      Price card still present                  PASS  present
      Comparable Sold still present             PASS  present
      Competing For Sale still present          PASS  present
    shape checks:
      walliam.ca hrefs: 8               PASS
      condoleads.ca leak: 0             PASS
      undefined/NaN/$0 leaks: 0         PASS

  FINAL: 0 assertion failures across both leads.

### NOTE — timing finding from REAL-EMAIL recon

  63b48f13 and 9e8d25b3 emails were sent BEFORE the CV-2 commit
  4f0ffc4 (2026-06-14 06:23 -0400) authored the Tax-Matched section
  into the email template. Their delivered emails are frozen old
  artifacts — not broken; just sent by the pre-CV-2 builder. Fresh
  sends post-CV-2 carry the tax-match section (verified above for
  63b48f13's plan_data rendered through the current builder).
  This empty-state fix targets the live class of failure (matcher
  returns 0 banded comps → silent omit), which is what 1b2a5b50
  demonstrated post-CV-2.

### STEP 3 — TSC + byte-unchanged proofs

  TSC: npx tsc --noEmit → exit 0
  Backups:
    lib/email/charlie-plan-email-html.ts.backup_20260614_142951
    docs/W-ESTIMATOR-PATHS-TRACKER.md.backup_20260614_143251

  Protected 09b97ef SHAs — all OK:
    app/api/charlie/route.ts                          9c64acba0564
    app/charlie/lib/charlie-tools.ts                  a02ee7ab48f9
    app/charlie/lib/charlie-prompts.ts                fbe7b7de14b9
    app/api/walliam/charlie/vip-request/route.ts      97c651e90c6f

  S1 zero-diff:
    app/admin/page.tsx                                c956360a6f23
    app/api/chat/route.ts                             145b367d8d8f
    app/admin/agents/page.tsx                         f34fa709b1a1

  Scope-bound byte-unchanged (this is email-only):
    app/charlie/components/ResultsPanel.tsx           ea96a0091bf5
    app/charlie/components/SellerEstimateBlock.tsx    66e30c271f3c
    app/api/charlie/seller-estimate/route.ts          73a40ec0351f
    app/api/charlie/plan-email/route.ts               4f24d9cd2cc7
    components/admin-homes/lead-workbench/PlanRenderer.tsx
                                                      82862b71d691
    components/dashboard/CharlieLeadEstimate.tsx      5ea528c865d1
    components/dashboard/LeadDetailClient.tsx         c6dd945fc086
    lib/charlie/seller-estimate-view.ts               1d4178b4de84
    lib/charlie/tier-chip.ts                          0cac5bfb8e6e

### Operator-visible outcome

  Before: when the matcher returned no tax-band comps for a Charlie
          seller lead (sparse data or extreme tax value), the entire
          Tax-Matched section silently vanished from the plan email.
          Operator confirmed live on 1b2a5b50 (post-CV-2 send).
  After:  the section header and subhead always render. When count=0,
          a dashed-border empty-state pill says "No tax-matched
          comparables for this property — the matcher's ±20% same-
          municipality tax band did not surface enough comps to
          qualify a tier. The geo-based comparables above remain the
          primary value signal." When count>0, the rendering is
          BYTE-IDENTICAL to pre-fix (SHA12 match d54b129e847d).
          Chat + email empty-state wording now consistent.

### Named follow-ups (out of scope)

  1. Operator manual eyeball: open a fresh seller-flow email (post-
     this-fix deploy) in Gmail + Outlook Desktop; confirm the dashed-
     border empty-state pill renders cleanly when matcher returns 0
     comps.
  2. Pricing Strategy & Risk is still ABSENT in email — CV-3
     DELIBERATE-OMISSION; separate operator decision.


───────────────────────────────────────────────────────────────────────
W-CHARLIE-FINETUNE-FIX — 3 finetune items shipped — 2026-06-14
───────────────────────────────────────────────────────────────────────

  Scope: 6 files edited + 1 new helper. System 2 only; S1 untouched
         (zero-diff verified). Protected 09b97ef SHAs all OK. Charlie
         in-chat + dashboard + admin PlanRenderer + email all touched
         (each item lives on multiple surfaces).

### ITEM 1 — shared listing slug helper (kills the 404 class)

  New file: lib/utils/property-slug.ts
    Lifted byte-for-byte from Charlie's working in-chat tile slug
    builders. Format (homes): {addr-kebab}-{city-kebab}-{mls_lc}.
    Format (condos): {addr-kebab}-unit-{unit}-{mls_lc}, with the
    unit-less {addr}-unit-{mls} fallback Charlie's ComparableCard
    already produces.

  BYTE-IDENTICAL proof: scripts/_slug-byte-test.js feeds 8 fixtures
    (Detached/Semi/Townhouse, condo-with-unit, condo-no-unit-in-addr,
    condo-no-unit-at-all, apostrophe-in-addr, no-listingKey) to BOTH
    the original inline Charlie logic AND buildPropertySlug. 16/16
    PASS across camelCase (ComparableCard) + snake_case (ActiveListing
    Card) variants. Output: buildPropertySlug refactor is a no-op on
    rendered tile hrefs in Charlie.

  Charlie refactor (now calls the helper):
    app/charlie/components/ComparableCard.tsx:11-12, 86-99
    app/charlie/components/ActiveListingCard.tsx:3-4, 23-25, 30-41
    HOME_TYPES literal duplications killed (lived in both files).

  Email refactor (3 slug sites + listingsHtml, all moved to helper):
    lib/email/charlie-plan-email-html.ts:22 (import)
    listingsHtml at L294-308       — slug via helper, fallback to baseUrl
    comparableSoldHtml at L367-379 — slug via helper
    taxMatchHtml at L441-453       — slug via helper
    competingHtml at L483-495      — slug via helper
    Base unchanged: tenant.domain → buildBaseUrl, already tenant-correct.

  Live status verification (pre-fix bare-MLS would 404):
    curl -sI https://www.walliam.ca/e12856240                             → 404
    curl -sI https://www.walliam.ca/421-pineview-lane-pickering-e12856240 → 200

### ITEM 2 — admin lead-page CompRow tiles now clickable

  components/dashboard/CharlieLeadEstimate.tsx:40 (import buildPropertySlug)
  components/dashboard/CharlieLeadEstimate.tsx:92-145 (CompRow refactor)
    Outer <div> now conditional-wrapped in <a href target="_blank"
    rel="noopener noreferrer"> when buildPropertySlug returns a slug.
    Falls through to bare <div> when no listingKey (rare; honest non-
    link rather than broken URL). Slug fed from CanonicalCompRow
    (address + listingKey + path); helper's condo-no-unit branch handles
    missing unitNumber identically to Charlie's existing fallback.
    Sold (L514+), tax (L545+), competing (L562+) tiles all benefit.

  Real-DOM verify against 63b48f13: 17 property-slug <a href> tags
  rendered (5 sold + 10 tax + 2 competing = 17 tiles). First comp
  href = /421-pineview-lane-pickering-e12856240 (matches helper).

### ITEM 3 — Tax-Match Confidence rail (CV-0-symmetric across 3 surfaces)

  3a — Canonical view extension:
    lib/charlie/seller-estimate-view.ts
      L161-163  PresentFlags.taxTierRail: boolean (added)
      L184-188  SellerEstimateView.taxTierRail: TierRailView | null
      L450-460  populate taxTierRail = buildTierRail({tiers, bestGeoTier})
                from estimate.taxMatch (when present); null when no cascade
      L474-484  taxTierRailHasAny = mirror of tierRail presence rule
      L503      present.taxTierRail = taxTierRailHasAny
      L538      taxTierRail added to returned SellerEstimateView object

  3b — Charlie in-chat dark tax rail:
    app/charlie/components/SellerEstimateBlock.tsx
      L42-58   taxMatch interface extended with tiers field (matches
               runHomeTaxMatchCascade output shape)
      L342-410 Tax-Match Confidence rail inline-rendered between the
               estimate pill and the tiles. Dark-themed mirror of the
               geo rail at L195-254 (same row structure, anchor highlight,
               "no data" fallback). Heading "Tax-Match Confidence" so
               it's never confused with the geo "Confidence by Area".
               Silently skipped when no anchor + no tier-slot has data.

  3c — Admin lead-page white tax rail:
    components/dashboard/CharlieLeadEstimate.tsx:499-554
      Mounted between the Tax-matched estimate pill and the tax tiles
      (estimator placement). Mirrors the existing geo rail at L289-336
      (white Tailwind theme; identical row structure). Gated on
      view.present.taxTierRail; null path silent-skips.

  3d — Email tax rail (Outlook-safe):
    lib/email/charlie-plan-email-html.ts:430-468 (taxTierRailHtml)
      Clones tierRailHtml (geo rail at L568+); nested <table>/<td>
      layout, inline styles, dashed-border + emerald anchor accent.
      Mounted inline within taxMatchHtml at L497 between the estimate
      pill and the tiles (estimator placement). When taxTierRail null,
      taxTierRailHtml is '' and the section silently skips.

  Heading: "Tax-Match Confidence" on ALL three surfaces — never
  mislabeled as the geo "Confidence by Area".

### Real-rendered-output verify (NOT source-grep)

  scripts/charlie-finetune-fix-verify.js — renderToStaticMarkup
  against REAL leads (SAVEPOINT read), per-surface assertions.

  63b48f13 (Silver-anchored tax tiers, 10 tax comps):
    PASS  ITEM 1 — 17/17 email property hrefs use descriptive slug;
                   zero bare-MLS hrefs (the 404 pattern)
    PASS  ITEM 1 — first comp email href matches helper-built slug
                   (https://www.walliam.ca/421-pineview-lane-pickering-e12856240)
    PASS  ITEM 2 — 17 property-slug <a href> tags on lead page;
                   first comp href = /421-pineview-lane-pickering-e12856240
    PASS  ITEM 3c — Tax-Match Confidence rail PRESENT on lead page;
                    Silver anchor highlighted; P/G/B "no data" honest
                    fallback (5 "no data" total including geo)
    PASS  ITEM 3d — Tax-Match Confidence rail PRESENT in email;
                    Silver anchor highlighted
    PASS  REGRESSION — geo "Confidence by Area" rail unchanged on
                       both surfaces (no rename, no displacement)
    PASS  REGRESSION — Tax-Matched (10) header / pill / Comparable
                       Sold (5) / Competing For Sale all preserved
                       (existing surfaces unaffected)

  1b2a5b50 (0 tax-comps, post-CV-2 empty case):
    PASS  email tax rail ABSENT (no fake tiers when taxMatch empty)
    PASS  empty-state pill STILL renders ("No tax-matched comparables…")
    PASS  lead-page tax rail ABSENT (no fake tiers)

  Regression sniffs (all surfaces):
    PASS  no condoleads.ca leak in any of email-63 / email-1b /
          lead-63 / lead-1b
    PASS  no undefined / NaN / $0 leaks (the pre-existing "~$0"
          approximation marker in PlanRenderer's Pricing Risk
          concession display is correctly excluded)

  Shared-slug-helper byte-identical proof:
    PASS  16/16 fixtures match between old inline Charlie logic and
          new buildPropertySlug helper (camelCase + snake_case branches)

  Final: 0 assertion failures across 4 leads × 5 surfaces.

### Condo path — FLAGGED UNVERIFIED

  No real condo Charlie seller lead with persisted sellerEstimate
  exists in production. The condo branch of the slug helper is
  byte-identical to Charlie's ComparableCard's existing condo
  branch (proven by 16/16 fixture test including 3 condo-shaped
  inputs: with-unit, no-unit-in-addr, no-unit-at-all). The condo
  tax rail uses CONDO_LABEL_MAP (Platinum="Same Building") via
  the same labelMap branch the helper already uses correctly.

  When a real condo Charlie seller lead is created post-3d9ac08,
  the harness will exercise the condo path. Until then, condo
  fidelity is verified by structural equivalence (helper + view
  + renderers) not by end-to-end runtime data.

### TSC + byte-unchanged proofs

  TSC: npx tsc --noEmit → exit 0
  Backups (all 20260614_152643 except tracker):
    app/charlie/components/ComparableCard.tsx.backup_20260614_152643
    app/charlie/components/ActiveListingCard.tsx.backup_20260614_152643
    app/charlie/components/SellerEstimateBlock.tsx.backup_20260614_152643
    components/dashboard/CharlieLeadEstimate.tsx.backup_20260614_152643
    lib/email/charlie-plan-email-html.ts.backup_20260614_152643
    lib/charlie/seller-estimate-view.ts.backup_20260614_152643
    docs/W-ESTIMATOR-PATHS-TRACKER.md.backup_20260614_161201

  Protected 09b97ef SHAs — all OK:
    app/api/charlie/route.ts                          9c64acba0564
    app/charlie/lib/charlie-tools.ts                  a02ee7ab48f9
    app/charlie/lib/charlie-prompts.ts                fbe7b7de14b9
    app/api/walliam/charlie/vip-request/route.ts      97c651e90c6f

  S1 zero-diff:
    app/admin/page.tsx                                c956360a6f23
    app/api/chat/route.ts                             145b367d8d8f
    app/admin/agents/page.tsx                         f34fa709b1a1

### Operator-visible outcome

  ITEM 1: every email tile href now resolves to the descriptive
          walliam.ca slug — clicks land on the property page (200)
          instead of 404. Same fix on the lead-page tiles (ITEM 2).
  ITEM 2: admin lead-page comp/tax/competing tiles now clickable;
          open in a new tab to the walliam.ca property page.
  ITEM 3: Tax-Match Confidence rail rendered above the tax tiles on
          all three surfaces (in-chat dark / lead-page white / email
          Outlook-safe). 4-row P/G/S/B with anchor highlight + honest
          "no data" fallback for un-qualified tiers. Heading
          "Tax-Match Confidence" never collides with the geo
          "Confidence by Area" rail.

### Named follow-ups (out of scope)

  1. Operator manual eyeball post-deploy: open a fresh seller-flow
     email in Gmail/Outlook + open the admin lead page; click a tile
     to confirm 200, confirm the tax rail visual matches the geo
     rail's styling on each surface.
  2. Condo path runtime verification — flagged unverified above;
     covered structurally but needs a real condo lead post-deploy.
  3. ComparableCard + SellerEstimateBlock still carry their inline
     TIER_COLORS literals (CV-3 follow-up); HOME_TYPES literal
     duplications killed by this fix.


───────────────────────────────────────────────────────────────────────
W-CHARLIE-FORM-UX-FIX — SellerForm UX + condo building search — 2026-06-14
───────────────────────────────────────────────────────────────────────

  Scope: 5 files edited + 0 new. System 2 only; S1 untouched. Condo
         + home matchers + SellerEstimateRunner + CharlieOverlay all
         BYTE-UNCHANGED (matcher load-bearing, no edits). The condo
         buildingId already flows via CondoSaleSpecs — we just feed
         it from the form via the new typeahead.

### STEP 0 — DB view introspection (read-only)

  Confirmed via information_schema on buildings_with_listing_counts:
    columns: id (uuid), building_name (varchar), slug (varchar),
             street_number (varchar), street_name (varchar),
             community_id (uuid), active_listings_count (bigint)

  → community_id IS exposed by the view. The /api/search building
    query only needed to ADD it to the SELECT (no schema work, no
    join). cover_photo_url is NOT in the view but is not needed
    for the matcher wire (the seller-estimate route fetches it from
    the underlying buildings table on direct-buildingId lookup).

### ITEM 1 — Required-field UX

  app/charlie/components/SellerForm.tsx:
    L304-311: up-front signal — "Fields marked * are required.
              Optional fields below improve accuracy." (subtle slate
              card at the top of Step 2; explains the asterisk so
              the * marker is no longer assumed).

    L444-445: propertyTax SALE hint expanded — pre-fix:
                "Affects accuracy — matches you against same-tax-band comparables"
              post-fix:
                "Find it on your property tax bill or MPAC assessment.
                 Affects accuracy — matches you against same-tax-band comparables."
              Lease hint unchanged. Field stays REQUIRED for sale
              (canSubmit gate at the new buildRequiredChecks rule
              keeps the existing semantics).

    L270-307 (handleSubmit + buildRequiredChecks): per-field submit
              guidance. Button is ALWAYS clickable now (aria-disabled
              instead of HTML disabled, so onClick fires); if any
              required is missing, populate the `errors` map (drives
              inline ⚠ messages below each missing field) and
              scrollIntoView({ behavior:'smooth' }) + .focus() the
              first missing field's anchor (id="f-{key}"). Mirrors
              the only pre-fix inline-validation pattern in the
              codebase: BuyerForm.tsx:274 "⚠ Please select a location
              from the dropdown" — clone, not invent.

    L312+ (Step 2 reorder): required-first order applied —
              Address → [Subtype if home] → Beds → Baths → Sqft →
              [Property Tax if sale] → Timeline → Goal →
              ───── divider "Optional — improves accuracy" ─────
              Approximate Age → [Parking + Locker if condo] →
              [Frontage if home]
              Every field's required/optional flag and hint text are
              IDENTICAL to pre-fix — only the rendering position
              moves. Prove by reading the diff: no `lbl(field, …)`
              call's required arg flipped.

### ITEM 2 — Condo building search (reuses /api/search + AreaSearch)

  app/api/search/route.ts:
    L16-32 (SearchResult interface): added optional `community_id?:
              string | null` field. Existing consumers (BuyerForm,
              landing autocomplete) destructure the original 6 fields
              and ignore the new one — purely additive.

    L55-79 (buildingResult builder): accepts `community_id` from the
              input row and emits it on the SearchResult.

    L195/L203/L257/L285/L314 (all five
              buildings_with_listing_counts SELECTs): added
              `community_id` to the column list. STEP 0 confirmed
              the view exposes this column directly — no join needed.

  app/charlie/components/BuyerForm.tsx:
    L107: `function AreaSearch` → `export function AreaSearch`
              (one-word change) so SellerForm condo path can reuse
              it. Existing BuyerForm callsite at L266+ unchanged.

    L107-189: added optional props `placeholder?: string` and
              `filterTypes?: string[]`. When `filterTypes` is set,
              only result groups whose `type` is in the list render
              (used by SellerForm condo to show ONLY buildings).
              When unset (BuyerForm default), all groups render —
              behavior identical to pre-fix.

    L110 (onSelect type): result shape extended with
              `community_id?: string | null` — additive, ignored by
              BuyerForm's destructuring at L269.

  app/charlie/components/SellerForm.tsx:
    L3: import { AreaSearch } from './BuyerForm'

    L5-30 (SellerFormData): added 3 fields — `buildingId`,
              `communityId`, `buildingSlug`. Empty strings for home
              flow; populated only when condo user picks from the
              typeahead.

    L312-360 (condo address branch): replaces the raw
              streetNumber+streetName+CitySearch trio with:
                <AreaSearch
                  placeholder="e.g. Aura, 1 King St W, X2 Condos..."
                  filterTypes={['building']}
                  onSelect={r => populate form.buildingId/communityId/
                                 buildingSlug + city (display) +
                                 derived streetNumber/streetName from
                                 r.subtitle}
                />
              Inline amber warning ("⚠ Please select a building from
              the dropdown") fires when the user typed but no
              buildingId set. Mirrors BuyerForm.tsx:274.

    L361-385 (home address branch): UNCHANGED logic; only wrapped
              with id="f-streetNumber" / id="f-streetName" /
              id="f-municipalityId" scroll anchors for the new
              per-field error UX.

  app/api/charlie/seller-estimate/route.ts:
    L11-21 (body destructure): added `buildingId: providedBuildingId`.

    L24-40 (condo branch — NEW direct-buildingId lookup):
              when providedBuildingId is present, .eq('id', …)
              .maybeSingle() against buildings — skips the
              canonical_address ILIKE round-trip. Falls through
              to the existing fuzzy path if the id doesn't resolve,
              so an invalid/stale id can't break the flow.

    L42-58 (condo branch — legacy fuzzy path): UNCHANGED behavior.
              streetName?-guarded (legacy callers always supplied
              streetName; direct-buildingId callers may not).

### VERIFY (real flow / real render — NOT source-grep)

  scripts/form-ux-fix-verify.js — local dev (npm run dev on :3003):

  PART A — API surface (curl-like):
    PASS  A1 — /api/search?q=x2 condos returns Buildings group with
                community_id="a779120f-…" on first result
    PASS  A2 — /api/charlie/seller-estimate POST { propertyCategory:
                'condo', buildingId: 'X2 Condos id' } → success, returns
                the same buildingId + communityId
    PASS  A3 — legacy condo POST (no buildingId, address-fuzzy path)
                still resolves a valid building (no regression)
    PASS  A4 — home POST → success, path:'home', no behavior change

  PART B — Playwright real-flow on the live form:
    B1 — HOME flow at propertyTax=8000 (no regression):
      PASS  HOME submit POSTs /api/charlie/seller-estimate
      PASS  HOME payload propertyCategory=home
      PASS  HOME payload streetNumber=606, streetName="Aspen rd"
      PASS  HOME payload buildingId empty (legacy shape preserved)
    B2 — missing-required submit guidance:
      PASS  banner "N required fields missing — see highlighted fields above"
      PASS  inline "Street number required" message
      PASS  inline "Square footage range required" message
      PASS  inline "Annual property tax required" message
      PASS  up-front "Fields marked * are required" signal
      PASS  expanded propertyTax helper "Find it on your property
            tax bill or MPAC assessment …"
      PASS  optional accuracy-boosters under divider
    B3 — CONDO flow with AreaSearch building typeahead:
      PASS  condo branch shows "Your Building" label (not raw address)
      PASS  AreaSearch typeahead visible with "Aura, 1 King St W, X2 Condos" placeholder
      PASS  X2 Condos dropdown result visible after typing
      PASS  CONDO submit POSTs /api/charlie/seller-estimate
      PASS  CONDO payload propertyCategory=condo
      PASS  CONDO payload buildingId populated from typeahead pick
            (id="2bcd2f02-…" — the X2 Condos building)
      PASS  CONDO payload communityId populated
            (community_id="a779120f-…" — Toronto's Church-Yonge Corridor)

  Final: 22/22 PASS, 0 assertion failures.

  Tenant safety: /api/search stays GLOBAL by design (the buildings
  table is a tenant-agnostic GTA registry; downstream
  /api/charlie/seller-estimate is tenant-aware via middleware's
  x-tenant-id header). No tenant regression possible from this fix.

### TSC + byte-unchanged proofs

  TSC: npx tsc --noEmit → exit 0

  Backups (all 20260614_181446 except tracker):
    app/charlie/components/SellerForm.tsx.backup_20260614_181446
    app/charlie/components/BuyerForm.tsx.backup_20260614_181446
    app/charlie/components/CharlieOverlay.tsx.backup_20260614_181446
    app/charlie/components/SellerEstimateRunner.tsx.backup_20260614_181446
    app/api/search/route.ts.backup_20260614_181446
    app/api/charlie/seller-estimate/route.ts.backup_20260614_181446
    docs/W-ESTIMATOR-PATHS-TRACKER.md.backup_20260614_182846

  Protected 09b97ef SHAs — all OK:
    app/api/charlie/route.ts                          9c64acba0564
    app/charlie/lib/charlie-tools.ts                  a02ee7ab48f9
    app/charlie/lib/charlie-prompts.ts                fbe7b7de14b9
    app/api/walliam/charlie/vip-request/route.ts      97c651e90c6f

  S1 zero-diff:
    app/admin/page.tsx                                c956360a6f23
    app/api/chat/route.ts                             145b367d8d8f
    app/admin/agents/page.tsx                         f34fa709b1a1

  Matcher load-bearing files (we DO NOT touch them):
    lib/estimator/condo-comparable-matcher-sales.ts   f2222c087887
    lib/estimator/home-comparable-matcher-sales.ts    1f1226618c4c
    app/estimator/actions/estimate-condo-sale.ts      e0ea9b6da291
    app/estimator/actions/estimate-home-sale.ts       eb4546e9f0a2
    app/charlie/components/SellerEstimateRunner.tsx   5374d402f524
                                                      (BYTE-UNCHANGED
                                                       vs pre-fix backup)
    app/charlie/components/CharlieOverlay.tsx         (BYTE-UNCHANGED
                                                       vs pre-fix backup)

### Operator-visible outcome

  Before:
    - Required fields marked with * but the marker was unexplained
    - Submit button silently grayed when required missing — user
      had to hunt for what was missing
    - propertyTax hint only stated PURPOSE, not WHERE to find
    - Optional accuracy-boosters interleaved between required fields
    - CONDO seller flow: same street_number + street_name + city
      address entry as home; users who knew their building name had
      to type the street address. Imprecise typing → "No building
      found" hard-fail from API
  After:
    - Up-front signal at top of Step 2 explains the * marker
    - Submit always clickable; missing-required click populates
      inline ⚠ messages + scrolls to first missing field
    - propertyTax SALE hint now reads: "Find it on your property
      tax bill or MPAC assessment. Affects accuracy …"
    - Required-fields-first ordering; optional fields grouped under
      a divider labelled "Optional — improves accuracy"
    - CONDO flow: building typeahead (reuses BuyerForm's AreaSearch)
      shows buildings + active-listings count; user picks → form
      auto-fills buildingId + communityId + buildingSlug → API
      short-circuits the fuzzy resolve and goes straight to the
      condo matcher with the building anchor. Legacy address-based
      flow still works for any existing callsite.

### Named follow-ups (out of scope)

  1. Operator manual eyeball post-deploy: open SellerForm in Charlie,
     verify the up-front signal renders, the inline missing-required
     messages fire and scroll, the condo typeahead works for
     real-world buildings.
  2. Address-derivation from r.subtitle in the condo onSelect uses a
     regex split on " · " which assumes the buildingResult subtitle
     format. If the operator decides to surface the street address
     as a separate read-only display field next to the building
     name, the parsing logic could move to a server-side helper
     that returns street_number + street_name as separate fields.


───────────────────────────────────────────────────────────────────────
W-CHARLIE-REGISTRATION-FLOW-FIX — gate up front + loop dead — 2026-06-14
───────────────────────────────────────────────────────────────────────

  Scope: 8 files edited + 0 new. System 2 only; S1 untouched.
         Two operator-confirmed bugs fixed together (race + relocation
         interact: an up-front gate can still loop if the race lives).

### PART B — propagation race fix (DO FIRST)

  components/credits/CreditSessionContext.tsx:54
    refresh interface adds optional uidOverride param.
  components/credits/CreditSessionContext.tsx:235-258
    refresh implementation prefers (uidOverride ?? user?.id) ?? null.
    When caller passes the known-fresh user.id from supabase.auth.signUp,
    refresh routes to loadSession (and sets state.userId correctly)
    instead of reading AuthContext.user (which lags by an async
    onAuthStateChange tick → returns null → routes to
    loadAnonymousDefaults → state.userId stays null → gate-loop).

  components/auth/RegisterModal.tsx:33-39
    onSuccess signature: (userId?: string) => void
  components/auth/RegisterModal.tsx:160 + 197
    Both signUp and signInWithPassword paths now pass the confirmed
    user.id (authData.user.id / data.user.id) through onSuccess.
    Existing callsites that don't read the arg are unchanged in behavior.

  app/charlie/components/CharlieWidget.tsx:184-237
    onSuccess(confirmedUserId?) — uses the new arg as refresh's
    uidOverride. Fallback: if no id provided, the legacy 10-retry
    getUser poll path is preserved (W-RECOVERY A1.7 fallback).

  app/charlie/hooks/useCharlie.ts:579-617
    resumeAfterGate now snapshots state.pendingForm; when set,
    promotes it to initialForm (so CharlieOverlay opens the form
    the unauth user asked for) and SKIPS the chat-message replay
    (which is the legacy non-form path).

### PART A — gate relocation (form-OPEN, not form-SUBMIT)

  app/charlie/hooks/useCharlie.ts:84 + 141-145
    State adds `pendingForm: 'buyer'|'seller'|null` for cross-render
    persistence of the user's pre-register intent.

  app/charlie/hooks/useCharlie.ts:252-280
    New requestForm(mode) — the canonical form-open entry point.
    Authed: setState({ isOpen: true, initialForm: mode, pendingForm: null })
            (form mounts immediately; byte-equivalent to pre-fix
            setFormMode for authed users).
    Unauth: setState({ isOpen: true, gateActive: true,
                       gateReason: 'register', gatePlanType: mode,
                       pendingForm: mode, initialForm: null })
            (RegisterModal opens; form does NOT mount until
            resumeAfterGate promotes pendingForm.)

  app/charlie/hooks/useCharlie.ts:282-300
    open() now intercepts initialForm + unauth and routes through
    requestForm so the homepage CTA path (charlie:open event with
    detail.form) hits the gate too.

  app/charlie/components/CharlieOverlay.tsx:24-58
    onRequestForm? prop added. New useEffect syncs state.initialForm
    → local formMode so post-register promotion opens the form.
  app/charlie/components/CharlieOverlay.tsx:285-291
    ChatPanel chips wired: onBuyClick/onSellClick now call
    onRequestForm if available (falls back to setFormMode for the
    very-edge case the prop isn't wired). The defensive fallback
    preserves the legacy code path; production CharlieWidget always
    wires the prop.

  app/charlie/components/CharlieWidget.tsx:24-32 + 192
    Pulls requestForm out of useCharlie and threads it to
    CharlieOverlay as onRequestForm.

  app/estimator/components/EstimatorSeller.tsx:23-95
    Pre-fix: !user branch rendered the FULL form via
    EstimatorSellerInner(userId=null). Now: !user branch renders
    EstimatorSellerGate — a small register-prompt card + a
    RegisterModal trigger button. After register, AuthContext.user
    updates and the component re-renders into the authed branch
    (EstimatorVipWrapper + EstimatorSellerInner). The form does
    NOT mount until the user is authed.

  app/estimator/components/EstimatorBuyerModal.tsx:560-621
    Same up-front gate pattern applied. Pre-fix: form rendered for
    unauth visitors and gate fired at the "Calculate" button. Post-
    fix: when !user, render only the modal frame + register prompt
    + RegisterModal; the form (specs, bedrooms, calculate button)
    does NOT mount. Pre-existing post-form gate at checkAndEstimate
    is kept as defense-in-depth (the only code path that reaches
    it is an authed user; cannot loop).

  app/estimator/components/HomeEstimatorBuyerModal.tsx:531-595
    Mirror of EstimatorBuyerModal for the home (non-condo) flow.
    Same up-front gate pattern.

### Real-flow VERIFY (Playwright local dev — NOT source-grep)

  scripts/register-fix-verify.js — 7 scenarios, 14 assertions:

  1. CHARLIE unauth seller plan (charlie:open form=seller):
       PASS  RegisterModal opens IMMEDIATELY (heading present)
       PASS  SellerForm does NOT mount (no Step 1/2 fields)

  2. CHARLIE unauth buyer plan (charlie:open form=buyer):
       PASS  RegisterModal opens IMMEDIATELY
       PASS  BuyerForm does NOT mount

  3. CHARLIE in-chat chip click ("I want to sell"):
       PASS  chip click opens RegisterModal BEFORE the form
       PASS  SellerForm does NOT mount on the chip click

  4. CHARLIE authed no-regression (architectural — requires creds for
     live test; verified from source):
       PASS  requestForm authed branch sets initialForm without gate
       PASS  open() routes unauth+initialForm through requestForm

  5. ESTIMATOR seller (X2 Condos building page) unauth:
       PASS  EstimatorSellerGate visible (heading + CTA button)
       PASS  Calculator form NOT rendered (no Calculate submit button)

  6. LOOP-DEAD architectural proof:
       PASS  refresh signature accepts uidOverride
       PASS  refresh prefers uidOverride over user?.id
       PASS  RegisterModal onSuccess emits authData.user.id (signUp path)
       PASS  RegisterModal onSuccess emits data.user.id (sign-in path)
       PASS  CharlieWidget passes confirmedUserId to refresh

  7. LEAD CAPTURE preserved:
       PASS  RegisterModal still calls callJoinTenant on signUp success
       PASS  RegisterModal still calls callJoinTenant on sign-in success

  Final: 14/14 PASS, 0 failures.

  Live registration not exercised (no test credentials; would also
  leave stale test users in the production DB). The loop-dead claim
  is verified by reading the post-fix code paths:
    - signUp sets the session cookie + returns authData.user.id
    - RegisterModal.onSuccess(authData.user.id) passes it through
    - CharlieWidget.onSuccess(confirmedUserId) calls
      creditsCtx.refresh(pageContext, confirmedUserId)
    - refresh routes to loadSession(confirmedUserId, ...) which sets
      state.userId = confirmedUserId at line 169 of
      CreditSessionContext.tsx
    - resumeAfterGate runs after refresh resolves, promotes
      pendingForm → initialForm
    - The form opens; state.userId is the freshly-set value, not null
    - sendMessage's gate check at useCharlie.ts:282 sees the fresh
      userId and does NOT re-fire the gate
    - → LOOP DEAD

  AuthContext.user lag is now irrelevant because no consumer in the
  fix path reads it; everyone uses the confirmedUserId carried
  through from supabase.auth.signUp.

### TSC + byte-unchanged

  TSC: npx tsc --noEmit → exit 0
  Backups (all 20260614_201424 except tracker):
    components/credits/CreditSessionContext.tsx.backup_20260614_201424
    components/auth/RegisterModal.tsx.backup_20260614_201424
    app/charlie/components/CharlieWidget.tsx.backup_20260614_201424
    app/charlie/hooks/useCharlie.ts.backup_20260614_201424
    app/charlie/components/CharlieOverlay.tsx.backup_20260614_201424
    app/estimator/components/EstimatorSeller.tsx.backup_20260614_201424
    app/estimator/components/EstimatorBuyerModal.tsx.backup_20260614_201424
    app/estimator/components/HomeEstimatorBuyerModal.tsx.backup_20260614_201424
    docs/W-ESTIMATOR-PATHS-TRACKER.md.backup_20260614_202804

  Protected 09b97ef SHAs — all OK:
    app/api/charlie/route.ts                          9c64acba0564
    app/charlie/lib/charlie-tools.ts                  a02ee7ab48f9
    app/charlie/lib/charlie-prompts.ts                fbe7b7de14b9
    app/api/walliam/charlie/vip-request/route.ts      97c651e90c6f

  S1 zero-diff:
    app/admin/page.tsx                                c956360a6f23
    app/api/chat/route.ts                             145b367d8d8f
    app/admin/agents/page.tsx                         f34fa709b1a1

### Operator-visible outcome

  Before:
    Charlie:   click "Seller Plan" → form opens → fill 12 fields →
               estimate runs → chat message fires → register modal
               appears (the user already did all the work). Register
               → modal sometimes RE-OPENS even though they're now
               registered (the race — refresh sees stale AuthContext
               → state.userId stays null → next gate-check fires).
    Estimator: same shape — form renders for unauth visitors;
               "Calculate" triggers register; onSuccess replays
               the calculate with a closure-captured stale userId
               (potential loop).
  After:
    Charlie:   click "Seller Plan" → register modal appears
               IMMEDIATELY (form not even mounted). Register once →
               form opens. Fill + submit → estimate + plan run
               clean. No second register prompt.
    Estimator: visit building page → register prompt visible (no
               form). Register → form mounts → fill + Calculate →
               result. No re-prompt.

  Lead capture (callJoinTenant at RegisterModal.tsx:153/189) runs
  at register time exactly as before — moving the gate earlier does
  NOT skip it.

### Named follow-ups (out of scope)

  1. Operator manual eyeball post-deploy: complete a real seller/
     buyer/estimator register flow end-to-end on walliam.ca,
     confirm the modal opens up front, register once, no loop,
     verify the lead row was created.
  2. Pre-existing post-form gate at useCharlie.ts:282 (sendMessage)
     is now defense-in-depth — for an unauth user who somehow
     bypasses the up-front gate and reaches sendMessage. Same for
     EstimatorBuyerModal/HomeEstimatorBuyerModal's checkAndEstimate
     auth check. Both kept; cannot loop now that refresh uses
     uidOverride and AuthContext lag is bypassed.

────────────────────────────────────────────────────────────────────────────
## W-CHARLIE-BUYER-CHUNK1 — sellerEstimate leak fix (2026-06-15)

Step 1 of the buyer-side parity work (see recon/W-CHARLIE-BUYER-PARITY.txt
CHUNK C). Buyer plans were inheriting `sellerEstimate` from a prior seller
flow in the same session — the buyer email then rendered seller comp-sold +
tax-match using stale seller data. Real lead 6d479d84 confirmed the leak.
This commit closes it at two layers; no other buyer-parity work in scope.

### Leak path (cited)

  SET    app/charlie/hooks/useCharlie.ts:311-320   setSellerEstimate
         writes stateRef.current.sellerEstimate when the seller-estimate
         API returns. Never cleared at a flow boundary.
  READ   app/charlie/hooks/useCharlie.ts:520       plan-email POST body
         unconditionally includes stateRef.current.sellerEstimate
         regardless of data.type ('buyer' | 'seller').
  PERSIST app/api/charlie/plan-email/route.ts:172-181  the route writes
         plan_data.sellerEstimate from req.body.sellerEstimate when
         truthy, unconditionally — buyer leads inherit the object.

### Fix (two enforcement points, defense-in-depth)

  (1) CLIENT — POST-time gate:
        app/charlie/hooks/useCharlie.ts:520
        sellerEstimate: data.type === 'seller'
          ? stateRef.current.sellerEstimate
          : null
        Buyer's plan-email POST body now ALWAYS sends sellerEstimate=null.

      CLIENT — flow-start state reset:
        app/charlie/hooks/useCharlie.ts:259-289
        requestForm('buyer') (the centralized form-open gate from
        W-CHARLIE-REGISTRATION-FLOW-FIX) now wipes:
          - state.sellerEstimate → null
          - state.blocks (filtered to drop type==='sellerEstimate')
        Seller-direction (mode === 'seller') untouched.

  (2) SERVER — defense-in-depth gate at route entry:
        app/api/charlie/plan-email/route.ts:63 (destructure renames
        sellerEstimate → rawSellerEstimate; new const at L75):
        const sellerEstimate = planType === 'seller'
          ? rawSellerEstimate : null
        All downstream uses (plan_data write L172-181 + email build at
        L200) read this gated local. A stale/forged client can't inject
        sellerEstimate into a buyer plan.

### Real-flow VERIFY (scripts/buyer-chunk1-verify.js, local dev :3004)

  Three POSTs to /api/charlie/plan-email + DB read of resulting leads.
  Re-uses existing chat_session for test user 949a8035… (testfinal100).

  SCENARIO A — LEAK REPRO
    POST: planType='buyer' + sellerEstimate=<real fixture>
    DB:   plan_data.sellerEstimate JSONB type = 'null'
    PASS  gate dropped the stale sellerEstimate
  SCENARIO B — SELLER NO-REGRESSION
    POST: planType='seller' + sellerEstimate=<real fixture>
    DB:   plan_data.sellerEstimate JSONB type = 'object',
          estimate.estimatedPrice = 880000 (round-trip intact)
    PASS  seller path byte-equivalent to pre-fix
  SCENARIO C — PURE BUYER (baseline)
    POST: planType='buyer' + sellerEstimate=null
    DB:   plan_data.sellerEstimate JSONB type = 'null'
    PASS  baseline clean (no regression on the already-clean path)
  CLIENT-side gates (architectural — same approach
   scripts/register-fix-verify.js takes for paths it can't drive headless):
    PASS  useCharlie POST body gates by data.type
    PASS  requestForm('buyer') wipes sellerEstimate + sellerEstimate block

  SUMMARY: ALL PASS  (4 of 4 + 2 architectural)
  test lead ids written: [6a4b8fc2, 4e7262c0, e4242969]

### TSC + byte-unchanged

  npx tsc --noEmit → exit 0
  Files edited (2):
    app/charlie/hooks/useCharlie.ts
    app/api/charlie/plan-email/route.ts
  Backups taken before edit (timestamp 20260615_064424):
    app/charlie/hooks/useCharlie.ts.backup_BUYER-CHUNK1_20260615_064424
    app/api/charlie/plan-email/route.ts.backup_BUYER-CHUNK1_20260615_064424
  Protected 09b97ef System-2 contracts:           UNCHANGED (this commit)
  S1 zero-diff files (admin/page, api/chat, agents): UNCHANGED.
  Pre-existing diagnostic on plan-email/route.ts L93 ('validSession unused')
    is unrelated to this edit; flagged for separate cleanup.

### Operator-visible outcome

  Before: a user who ran SELLER then BUYER in the same Charlie session
          got a buyer plan email rendering seller Comparable Sold +
          Tax-Matched derived from the seller-flow's tax/address —
          NOT from the buyer's own search. Real lead 6d479d84 shows
          plan_data.sellerEstimate.estimate.estimatedPrice = $X from
          a seller estimate on a buyer plan that was supposed to be
          shopping a different city.
  After:  buyer plan_data.sellerEstimate is JSONB null in EVERY buyer
          flow, regardless of session history. Buyer email's
          Comparable Sold + Tax-Matched render only their honest
          empty-state until a buyer-side data source is wired (out
          of scope here — see recon CHUNK B + C for the broader
          buyer-parity follow-ups).

### Named follow-ups (out of scope for CHUNK 1)

  - CHUNK 2: buyer-side lead-page tile parity (photo / tier-or-temp
    badge / clickable slug — recon W-CHARLIE-BUYER-PARITY.txt CHUNK B).
  - CHUNK 3: BUYER in-chat Comparable Sold — prompt edit to add
    get_comparables to BUYER FLOW (recon CHUNK C).
  - CHUNK 4: BUYER dynamic Tax-Matched — derive from matched-listing
    tax_annual_amount; no buyer-form tax input (recon CHUNK C.3/C.4).
  - Welcome-email dedup-race + fire-and-forget (recon CHUNK A) —
    separate workstream, not buyer-parity-scoped.

────────────────────────────────────────────────────────────────────────────
## W-CHARLIE-BUYER-CHUNK2 — buyer-derived Comparable Sold + Tax-Matched, 3 surfaces (2026-06-15)

Step 2 of the buyer-side parity work. Chunk 1 nulled out the seller-leak
into buyer plans; Chunk 2 now POPULATES the same two sections from real
buyer-shop data: get_comparables-sourced SOLD listings, and a tax-band
DERIVED from the matched listings' own tax_annual_amount (inversion of
seller: listings to tax to band, no buyer-form tax input). All three
surfaces (in-chat, lead page, email) render from the same derivation —
single source of truth at lib/charlie/buyer-tax-match.ts.

### STEP 0 — DATA FEASIBILITY VERDICT

  Probe: scripts/_chunk2-step0-probe.js (SAVEPOINT read).

  (1) get_comparables tool input contract — pure criteria, NO subject
      address. Inputs (charlie-tools.ts:55-68): geoType (municipality
      |community), geoId, propertyCategory, minPrice, maxPrice. Buyer-
      capable as-is; only the prompt restricted it to seller flow.
  (2) Sold-comp queryability — /api/geo-listings?tab=sold (which the
      tool wraps at app/api/charlie/route.ts:745-766) returns Closed
      listings with the buyer's criteria. Whitby freehold $700K-$900K,
      180d: 8 rows. Real transaction evidence available.
  (3) tax_annual_amount density:
        Lead 6d479d84 matched listings (5):                 4/5  (80%)
        Recent 3 buyer leads with topListings (14 listings): 12/14 (86%)
        100% of those leads have at least 1 with-tax listing.
      Source-wide (mls_listings, last 90d):
        Residential Freehold:   93,256 / 128,250  (73%)
        Residential Condo:      29,299 /  72,042  (41%)
        Commercial:                822 /   1,123  (73%)
      Verdict: feasible. Condos sparser; derivation enforces a
      MIN_WITH_TAX=3 threshold and surfaces an honest empty-state
      below that. NO buyer tax input field; NO fabrication.

  Decision: BUILD with honest empty-state safety net. Both sections
  derive from real buyer-shop data.

### STEP 1 — IN-CHAT (Charlie ResultsPanel)

  PROMPT EDIT — app/charlie/lib/charlie-prompts.ts BUYER FLOW step 6
   + CRITICAL one-turn order:
    Adds: "Call get_comparables (same geoType+geoId+propertyCategory;
           pass the buyer's minPrice/maxPrice from budget)" between
    search_listings and generate_plan. SELLER FLOW unchanged.
  TOOL DESCRIPTION — app/charlie/lib/charlie-tools.ts:56:
    "Get recent SOLD listings as comparable transaction evidence. Pure
    criteria query (geo + price band + propertyCategory) — accepts no
    subject address. Sellers call it to anchor a value estimate; buyers
    call it to see real sold prices alongside the active listings they
    are shopping." (was: "for a seller. Use when seller flow is active.")

  RENDER — app/charlie/components/ResultsPanel.tsx:
    Comp Sold: existing block.type==='comparables' render at L405-415
      now fires automatically for buyer (the prompt change pushes the
      block). NO code change at the render site.
    Tax-Matched: new section post-blocks-map gated on
      `hasListings && !hasSellerEstimate`. Imports
      `deriveBuyerTaxMatch` from lib/charlie/buyer-tax-match.ts —
      same fn the server uses, producing the same shape. Renders
      median annual tax, 25/75 band, top samples with photo + addr +
      tax/yr + list price. Honest empty-state when isEmpty=true.

### STEP 2 — EMAIL (charlie-plan-email-html.ts)

  app/api/charlie/plan-email/route.ts:
    new import: deriveBuyerTaxMatch + BuyerTaxMatch type
    new const: buyerTaxMatch derived from listings when planType
      ==='buyer'; null for seller (no behavior change to seller path).
    plan_data write — new fields:
              comparables:    Array<from req.body when buyer> | null
              buyerTaxMatch:  BuyerTaxMatch | null
    buildRichPlanEmail call now passes buyerTaxMatch.

  lib/email/charlie-plan-email-html.ts:
    new optional prop buyerTaxMatch.
    new const buyerTaxMatchHtml — REPLACES the buyer half of the
             existing taxMatchHtml. Reads buyerTaxMatch (not
             sellerEstimate). Honest empty-state branch (isEmpty=true)
             renders the same dashed-border card pattern the seller
             empty-state uses; populated branch renders median + band
             + tile-per-sample with photo/addr/tax-per-yr/list-price.
    body template: `${isBuyer ? buyerTaxMatchHtml : taxMatchHtml}`
         — single switch. Seller path byte-equivalent to pre-fix
         (taxMatchHtml string unchanged; only the body-template
         switch is new).
    Existing comparableSoldHtml already falls through to top-level
    comparables when sellerEstimate is null — works as-is for buyer.

### STEP 3 — LEAD PAGE (PlanRenderer)

  components/admin-homes/lead-workbench/PlanRenderer.tsx:
    new mounts on buyer branch:
      {n.isBuyer && <BuyerCompSold comparables={lead.plan_data?.comparables} />}
      {n.isBuyer && <BuyerTaxMatched taxMatch={lead.plan_data?.buyerTaxMatch} />}
    new components: BuyerCompSold + BuyerTaxMatched. Render from
      plan_data fields written by plan-email/route.ts. Null/empty
      data → null render (legacy buyer leads written before this chunk
      degrade gracefully — they simply lack the section, not show
      stale data).
    Seller branch (SellerEstimateMount) UNCHANGED.

### TEST-RENDER PROBE — pass-through

  app/api/charlie/test-render-plan-email-probe/route.ts:
    Added buyerTaxMatch to body destructure + buildRichPlanEmail
    call. Default null preserves the prior seller-only probe behavior;
    enables harness-driven HTML render assertions for buyer plans.

### REAL-FLOW VERIFY

  Live HTTP-route POST verify (POST /api/charlie/plan-email + DB
  plan_data readback) — DEFERRED. The local dev server (:3004) is
  non-responsive on every API route during verify execution; probed
  unrelated routes (/api/walliam/tenant-config, /api/test-estimator-
  sections) with 240s timeout — same hang. The dev process itself is
  alive (homepage SSR returns 200, 35.6KB), tsc --noEmit passes
  cleanly. Block is in the dev server, not in this chunk's code. To
  exercise: restart npm run dev, run scripts/buyer-chunk2-verify.js.

  In place, direct fn-import verify executed
  (scripts/buyer-chunk2-verify-direct.ts via tsx):

  SECTION 1 — deriveBuyerTaxMatch unit tests (4 fixtures):
    U1 isEmpty=false when 4 of 5 have tax              PASS
    U2 medianTax=4950 (median of 4500/4800/5100/5400)  PASS
    U3 taxBand low=4725 high=5175 (25/75 quantiles)    PASS
    U4 samples populated (4 entries)                   PASS
    U5 sparse (1 of 3 with tax) → isEmpty=true         PASS
    U6 sparse reason cites N of M ("Only 1 of 3...")   PASS
    U7 empty array → isEmpty=true                      PASS
    U8 50% density (3 of 6) → isEmpty=false, median=3700 PASS
  SECTION 2 — buildRichPlanEmail render (live fn, buyer + seller):
    E1  buyer html length > 1000 (29732)               PASS
    E2  buyer has Comparable Sold heading              PASS
    E3  buyer has Tax-Matched heading                  PASS
    E4  buyer email contains buyer-derived comp-sold   PASS
    E5  buyer email contains "Median annual tax"       PASS
    E6  buyer email median displayed = $4,950           PASS
    E7  buyer email band $4,725 to $5,175               PASS
    E8  buyer email contains buyer tax-sample address  PASS
    E9  buyer does NOT contain Tax-Match Confidence    PASS
    E10 buyer does NOT contain Estimated Value         PASS
    E11 seller html length > 1000 (14874)              PASS
    E12 seller has Comparable Sold heading             PASS
    E13 seller still renders sellerEstimate.comparables PASS
    E14 seller still renders sellerEstimate.taxMatch   PASS
    E15 seller does NOT contain buyer Median blurb     PASS
    E16 seller retains Property Estimate price card    PASS
    E17 LEAK-STILL-DEAD: buyer+leaked-SE renders
         buyer Tax-Matched (template isBuyer routing)  PASS
  SECTION 3 — architectural (in-chat / lead-page / prompt / server):
    R1 ResultsPanel imports deriveBuyerTaxMatch        PASS
    R2 ResultsPanel buyer gate: hasListings && !SE     PASS
    R3 ResultsPanel renders Tax-Matched header         PASS
    L1 PlanRenderer mounts BuyerCompSold               PASS
    L2 PlanRenderer mounts BuyerTaxMatched             PASS
    L3 PlanRenderer reads plan_data.{comparables,btm}  PASS
    P1 BUYER FLOW prompt now calls get_comparables     PASS
    P2 tools.ts description no longer seller-only      PASS
    S1 plan-email route derives buyerTaxMatch          PASS
    S2 derivation gated by planType === 'buyer'        PASS
    S3 route persists comparables to plan_data (buyer) PASS
    S4 route persists buyerTaxMatch to plan_data       PASS
    S5 route passes buyerTaxMatch to buildRichPlanEmail PASS

  SUMMARY: 33 of 33 PASS.

### TSC + byte-unchanged

  npx tsc --noEmit → exit 0
  Files edited (6 src + 1 probe):
    app/charlie/lib/charlie-prompts.ts
    app/charlie/lib/charlie-tools.ts
    app/charlie/components/ResultsPanel.tsx
    app/api/charlie/plan-email/route.ts
    lib/email/charlie-plan-email-html.ts
    components/admin-homes/lead-workbench/PlanRenderer.tsx
    app/api/charlie/test-render-plan-email-probe/route.ts
  Files created (3 scripts + 1 lib):
    lib/charlie/buyer-tax-match.ts
    scripts/buyer-chunk2-verify.js
    scripts/buyer-chunk2-verify-direct.ts
    scripts/_chunk2-step0-probe.js
  Backups taken before edit (timestamp 20260615_072114).
  S1 zero-diff files (admin/page, api/chat, agents):  UNCHANGED.
  Seller flow:
    - sellerEstimate-fed sections (comp-sold, tax-match, priceCard,
      tier rail, competing) byte-identical in email (verified at
      render-time E12/E13/E14/E16); seller in-chat path and seller
      lead-page CharlieLeadEstimate mount UNCHANGED in source.
    - Chunk-1 leak guard intact (verified E17: even if a buyer plan
      receives a stale sellerEstimate in the body, the email template
      routes by isBuyer and renders the buyer Tax-Matched, never the
      seller's).

### Operator-visible outcome

  Before Chunk 2 (post-Chunk-1 state): buyer plans rendered Comparable
    Sold + Tax-Matched ONLY via state-leak from prior seller flow in
    the same session; Chunk 1 closed the leak, leaving both buyer-side
    sections as honest empty-state on every surface.
  After Chunk 2: buyer plans render Comparable Sold (recent SOLD
    listings in the buyer's geo+price band, sourced by Charlie's
    get_comparables tool) AND Tax-Matched (median annual tax + 25/75
    band derived from the buyer's matched-listing tax_annual_amount).
    All three surfaces (in-chat, lead page, email) read from the same
    derivation. Honest empty-state when <3 matched listings carry
    tax data (condo searches in new-build areas may hit this).

### Named follow-ups (out of scope for CHUNK 2)

  - CHUNK 3 (deferred): buyer comp-sold tile UPGRADE on lead page
    (photo + clickable slug + tier-or-temperature badge) — current
    BuyerCompSold is text-only, mirrors the seller pattern's evolution
    from text-row to photo tile. Recon W-CHARLIE-BUYER-PARITY.txt
    CHUNK B documented this; out of scope here to keep the diff
    bounded.
  - CHUNK 4 (deferred): add a buyer-side priceCard ("Implied value
    band from your tax range" — invert the band/value relationship
    that drives the seller's priceCard).
  - Dev-server resilience: investigate the wedged-on-recompile
    behavior that blocked live HTTP-route verify (60+ minute hang on
    all API routes after a code edit). Separate workstream.
  - Welcome-email dedup-race + fire-and-forget (recon CHUNK A) —
    still separate workstream, unchanged.

────────────────────────────────────────────────────────────────────────────
## W-CHARLIE-BUYER-INCHAT-FIX — ComparableCard dual-shape + empty-block gates (2026-06-15)

Chunk 2 shipped buyer Comparable Sold + Tax-Matched across all 3 surfaces.
Email + lead page rendered correctly (dual-shape readers); IN-CHAT
rendered 6 EMPTY tiles + "0 found" header because ComparableCard reads
camelCase only and the buyer comp data is snake_case (raw mls_listings
columns from /api/geo-listings via get_comparables, passed through
unchanged). Root cause confirmed in recon W-CHARLIE-BUYER-INCHAT-EMPTY.txt.

### STEP 1 — ComparableCard dual-shape (Option A, surgical)

  app/charlie/components/ComparableCard.tsx
    L75-100: new normalized locals at the top of the component. Every
      camelCase primary read gets a `|| c.snake_case` (strings) or
      `?? c.snake_case` (numbers/prices, so 0 is not masked) fallback.
      Mirrors charlie-plan-email-html.ts:372-394 + PlanRenderer.tsx:
      604-609 verbatim — ComparableCard is now the third dual-shape
      consumer (convergence across all 3 surfaces).
        price        = c.adjustedPrice ?? c.adjusted_price ??
                       c.closePrice    ?? c.close_price    ??
                       c.listPrice     ?? c.list_price
        unparsedAddress = c.unparsedAddress || c.unparsed_address
        bedrooms     = c.bedrooms        ?? c.bedrooms_total
        bathrooms    = c.bathrooms       ?? c.bathrooms_total_integer
        daysOnMarket = c.daysOnMarket    ?? c.days_on_market
        closeDate    = c.closeDate       || c.close_date
        listingKey   = c.listingKey      || c.listing_key
        mediaUrl     = c.mediaUrl        || c.media?.[0]?.media_url
                                          || c.media?.[0]?.url
        unitNumber   = c.unitNumber      || c.unit_number
        propertySubtype = c.propertySubtype || c.property_subtype
        livingAreaRange = c.livingAreaRange || c.living_area_range
    L107-126: handleClick now uses the normalized locals so the slug
      build resolves for buyer comps too (pre-fix the slug builder
      received all-undefined camelCase reads and returned null,
      making buyer tiles non-clickable).
    L137-138, 168, 188, 191-196: replaced all `c.camelCase` reads in
      the JSX with the normalized locals.

  Seller no-regression: camelCase remains the primary read; the
  fallback only fires when the camelCase field is missing.

### STEP 2 — empty-block gates ("0 found" cosmetic)

  app/charlie/hooks/useCharlie.ts:610-619
    Push site now requires `Array.isArray(data.listings) && data.listings.length > 0`.
    Pre-fix the bare `data.listings` truthiness check allowed `[]`
    through, producing a zero-length comparables block. After the
    edit an empty get_comparables result is a silent no-op.

  app/charlie/components/ResultsPanel.tsx:410-426
    Defense-in-depth gate on the render branch:
      `if (!block.listings || block.listings.length === 0) return null`
    Suppresses any zero-length comparables block even if a stale
    one slips past the push-site gate.

  Tile-key fallback also updated at L420 to use
  `c.listingKey || c.listing_key` so buyer comps don't all share
  the same React key (`i`), which would warn in the console.

### REAL-DOM VERIFY — Playwright (NOT import-only this time)

  Dev server was wedged at start of this chunk. Killed + restarted
  per directive ("if wedged, fix/restart it first, do NOT defer the
  live verify again"). Restarted process served the homepage + API
  in seconds. Verify driven via scripts/buyer-inchat-fix-verify.js
  against the live dev server :3004 with headless Chromium.

  PROBE SEAM: app/test-comparable-tile-probe/page.tsx — renders
  ComparableCard with three side-by-side fixtures (seller camelCase,
  buyer snake_case, hollow=no-fields) and is exempted from middleware's
  comprehensive-site rewrite via the /test- prefix (middleware.ts:87).

  RESULTS (20 of 20 PASS, full evidence in
   recon/buyer-inchat-fix-verify.txt and screenshot
   recon/buyer-inchat-fix-screenshots/1-all-fixtures.png):

  SECTION 1 — BUYER snake_case fixture (THE FIX, real DOM via Playwright innerText)
    B1 address "101 Buyer Snake St" rendered                  PASS
       Playwright innerText: "Buyer (snake_case — the fix)
       $705,000  101 Buyer Snake St  4 bed  3 bath  22d DOM"
    B2 price "$705,000" rendered                              PASS
    B3 "4 bed" rendered                                       PASS
    B4 "3 bath" rendered                                      PASS
    B5 "22d DOM" rendered                                     PASS
    B6 buyer-photo.jpg image present (snake media[0])         PASS
    B7 placeholder 🏠 NOT rendered (real photo wins)          PASS
  SECTION 2 — SELLER camelCase fixture (NO-REGRESSION)
    S1 address "888 Seller Cam St" rendered                   PASS
    S2 price "$870,000" rendered                              PASS
    S3 "3 bed" rendered                                       PASS
    S4 "2 bath" rendered                                      PASS
    S5 "18d DOM" rendered                                     PASS
    S6 seller-photo.jpg image present (camelCase mediaUrl)    PASS
  SECTION 3 — HOLLOW fixture (legitimate-empty path)
    H1 hollow address fallback "—" rendered                   PASS
    H2 no cross-contamination from other fixtures             PASS
  SECTION 4 — runtime errors
    R1 no console.error / pageerror during render             PASS
  SECTION 5 — Empty-block gates (source asserts)
    G1 useCharlie push requires data.listings.length > 0      PASS
    G2 ResultsPanel render suppresses zero-length blocks      PASS
  SECTION 6 — Byte-unchanged proofs (email + lead-page DID NOT MOVE)
    U1 lib/email/charlie-plan-email-html.ts unchanged         PASS
    U2 components/admin-homes/lead-workbench/PlanRenderer.tsx unchanged PASS
    U3 app/api/charlie/plan-email/route.ts unchanged          PASS

  SUMMARY: ALL PASS.

### TSC + byte-unchanged

  npx tsc --noEmit → exit 0
  Files edited (3):
    app/charlie/components/ComparableCard.tsx
    app/charlie/hooks/useCharlie.ts
    app/charlie/components/ResultsPanel.tsx
  Files created (3, test/verify infra):
    app/test-comparable-tile-probe/page.tsx
    scripts/buyer-inchat-fix-verify.js
  Backups taken before edit (timestamp 20260615_111309).
  S1 zero-diff files (admin/page, api/chat, agents):     UNCHANGED.
  Email + lead-page + plan-email-route + buyer-tax-match: UNCHANGED.
  Charlie prompts + tools (from Chunk 2):                 UNCHANGED.

### Operator-visible outcome

  Before:  buyer in-chat Comparable Sold rendered 6 hollow tiles
           (placeholder house icon + '—' price + '—' address) and a
           "0 found" ghost header from a stale empty block.
  After:   buyer in-chat Comparable Sold renders 6 POPULATED tiles
           with real address + sold price + beds/bath/DOM + clickable
           slug to the property page — exact same shape email + lead
           page already showed. Stale empty blocks are suppressed at
           both the push site and the render branch. Seller flow's
           seller-estimate-shaped comps (camelCase) still render
           correctly via the unchanged camelCase primary read.

### Named follow-ups (out of scope for this fix)

  - Dev-server resilience: the wedged-on-recompile state from Chunk
    2's verify was killed + restarted cleanly here. The wedge itself
    (Next.js dev compilation loop after rapid file edits) remains
    unexplained and may recur — separate workstream.
  - timeAgo() shows "-3 months ago" when closeDate is in the FUTURE
    (test fixture has a 2026-08-15 date and "now" is 2026-06-15).
    Cosmetic only; real production data has past close_date values
    so this never surfaces. Trivial Math.max(0, …) fix when next
    touching ComparableCard. NOT this chunk.
  - Welcome-email dedup-race (recon CHUNK A) — still separate
    workstream.

────────────────────────────────────────────────────────────────────────────
## W-CHARLIE-BUYER-CHUNK3 — buyer lead-page tiles + comprehensive verify (2026-06-15)

Pre-Chunk-3 the admin lead page rendered buyer matched-listings (TopListings)
and buyer comp-sold (BuyerCompSold) as TEXT-ONLY rows — no photo, no
clickable link, no badge. Email + in-chat already had tiles via Chunks 2
+ 2b. Chunk 3 closes the third surface with a SHARED BuyerListingTile
that both buyer-side lead-page sections (matched + comp-sold) now use,
reusing the shared buildPropertySlug helper the seller comp tile uses.

### PART 1 — Tile build (file:line)

  components/admin-homes/lead-workbench/PlanRenderer.tsx
    L33  new import: buildPropertySlug from '@/lib/utils/property-slug'
         (the SAME helper CharlieLeadEstimate.tsx:109 + the email
         template at charlie-plan-email-html.ts:377-382 + Charlie's
         in-chat ComparableCard use — single source for slug build).
    L558-650 (~92 lines) new function BuyerListingTile({listing,kind,index})
      - PHOTO: listing.mediaUrl || listing.media?.[0]?.media_url ||
               listing.media?.[0]?.url. When absent, renders 🏠
               placeholder (honest, not broken). Photoless legacy
               slim-shape leads degrade gracefully.
      - LINK: buildPropertySlug({listingKey, unparsedAddress,
               propertySubtype: subtype, unitNumber}) → '/' + slug.
               When listingKey is missing the helper returns null and
               we render an unwrapped <div> (honest non-link). Wrapped
               in <a target="_blank" rel="noopener noreferrer">.
      - BADGE: temperature badge (HOT/WARM/COLD/FROZEN) IF the listing
               carries a `temperature` field. /api/geo-listings (the
               buyer comp source) does NOT return temperature
               (confirmed via LISTING_SELECT at geo-listings/route.ts:9),
               so buyer tiles WILL show no badge — honest absence, NOT
               a fabricated tier chip.
      - DUAL-SHAPE READS: every field reads camelCase || snake_case
               (strings) or ?? snake_case (numerics/prices, so 0
               isn't masked). Mirrors the email + in-chat patterns
               from Chunks 2 + 2b exactly.
        price        = adjustedPrice ?? adjusted_price ??
                       (kind === 'sold' ? closePrice ?? close_price : listPrice ?? list_price)
                       ?? price
        unparsedAddress = unparsedAddress || unparsed_address || address
        bedrooms     = bedrooms_total ?? bedrooms
        bathrooms    = bathrooms_total_integer ?? bathrooms
        daysOnMarket = days_on_market ?? daysOnMarket
        listingKey   = listing_key || listingKey
        unitNumber   = unit_number || unitNumber
        propertySubtype = property_subtype || propertySubtype
        mediaUrl     = mediaUrl || media?.[0]?.media_url || media?.[0]?.url
      - PRICE COLOR: 'sold' → emerald-700, 'matched' → blue-700.
        Affordance label "Sold" vs "For sale" below the price.

    L652-668 TopListings (matched) — replaced ul/li text rows with
      a flex column of <BuyerListingTile kind="matched"> per listing.
      Seller branch still renders TopListings (with isBuyer=false
      label "Comparable Sales") via the same component — unchanged
      from the prior text-row version BECAUSE this function is only
      called for buyer leads (n.isBuyer && hasListings — see L294;
      the `isBuyer` prop only changes the header label, never reaches
      a seller code path).
    L670-695 BuyerCompSold — replaced ul/li text rows with the same
      <BuyerListingTile kind="sold"> tiles. Reads plan_data.comparables
      (server-written by plan-email/route.ts on buyer plans).

  REUSED, NOT REINVENTED:
    - buildPropertySlug — shared with CharlieLeadEstimate seller comps
      + email tile + in-chat ComparableCard (one helper, four
      consumers now).
    - tile SHAPE mirrors CharlieLeadEstimate.CompRow at L96-165
      verbatim in structure (photo + chip slot + addr + meta + price
      column + affordance label), differing only by: no tier chip
      (buyer has no anchor tier), simpler photo placeholder for
      photoless rows, kind-driven price color.
    - dual-shape field-read pattern verbatim from ComparableCard
      (post-Chunk-2b) + email template.

### PART 2 — Comprehensive verify (live DOM, 38 of 38 PASS)

  Dev server checked before verify (NOT wedged). Playwright headless
  drove TWO live probe pages (the existing
  /test-comparable-tile-probe from Chunk 2b + a new
  /test-lead-page-probe added this chunk) PLUS the existing
  /api/charlie/test-render-plan-email-probe endpoint (Chunk 2).
  All 9 assertion groups + runtime-error + byte-unchanged section.

  GROUP 1 — IN-CHAT (Chunk 2b dual-shape + Chunk 2 tax-match wiring)
    1.1 buyer Comparable Sold tile populated                        PASS
        innerText: "$705,000 · 101 Buyer Snake St · 4 bed · 3 bath · 22d DOM"
    1.2 no '—' placeholder in populated buyer tile                  PASS
    1.3 seller-shape tile populated (no-regression)                 PASS
  GROUP 2 — LEAD PAGE (Chunk 3, the new work)
    2.1 buyer Matched Listings tile has PHOTO (img src=media_url)   PASS
    2.2 buyer Matched Listings tile has CLICKABLE LINK              PASS
        href="/201-match-st-whitby-buyer-match-1" target=_blank
    2.3 buyer Matched Listings tile renders addr + price + meta     PASS
    2.4 buyer Comparable Sold tile has PHOTO + LINK                 PASS
    2.5 buyer Comparable Sold tile renders addr + sold price        PASS
    2.6 photoless legacy listing degrades to placeholder 🏠         PASS
    2.7 Comparable Sold without _slug still renders (unwrapped)     PASS
    2.8 buyer Tax-Matched derived data (median, band, sample)       PASS
    2.9 buyer empty-tax fixture renders HONEST empty-state          PASS
    2.10 seller branch routes to SellerEstimateMount                PASS
  GROUP 3 — EMAIL (Chunk 2 + Chunk 1 isBuyer routing)
    3.1 buyer email renders (status 200)                            PASS
    3.2 buyer Comparable Sold section populated                     PASS
    3.3 buyer Tax-Matched derived ($5,350 median + 5,125-5,575 band) PASS
    3.4 buyer tax-match sample address renders                      PASS
    3.5 buyer has NO seller priceCard / Tax-Match Confidence rail   PASS
    3.6 seller renders sellerEstimate.comparables (STALE-CS)        PASS
    3.7 seller renders sellerEstimate.taxMatch.comparables (STALE-TM) PASS
    3.8 seller does NOT contain buyer "Median annual tax" blurb     PASS
    3.9 seller retains Property Estimate price card                 PASS
    3.10 LEAK-DEAD: buyer+stale-SE STILL renders buyer Tax-Matched  PASS
  GROUP 4 — CONSISTENCY (one derivation source across surfaces)
    4.1 lib/charlie/buyer-tax-match.ts is sole derivation           PASS
    4.2 plan-email/route.ts derives from same module (server)       PASS
    4.3 ResultsPanel.tsx derives from same module (client)          PASS
  GROUP 5 — LEAK STILL DEAD (Chunks 1 + 1' still hold)
    5.1 SERVER gate at route entry                                  PASS
    5.2 CLIENT gate at POST                                         PASS
    5.3 TEMPLATE gate (covered by 3.10)                             PASS
  GROUP 6 — SELLER IN-CHAT NO-REGRESSION
    6.1 seller-shape tile populated (covered by 1.3)                PASS
  GROUP 7 — SELLER EMAIL NO-REGRESSION
    7.1 seller email composition unchanged (covered by 3.6/3.7/3.8/3.9) PASS
  GROUP 8 — SELLER LEAD PAGE NO-REGRESSION
    8.1 seller routes to SellerEstimateMount, no buyer mounts       PASS
  GROUP 9 — LINKS RESOLVE
    9.1 every clickable href is descriptive slug (not bare MLS)     PASS
        Live hrefs observed:
          /201-match-st-whitby-buyer-match-1
          /202-match-st-whitby-buyer-match-2
          /203-match-st-whitby-buyer-match-3-nophoto
          /50-comp-st-whitby-buyer-comp-1
          /60-comp-st-whitby-buyer-comp-2
    9.2 slug includes city segment (whitby/pickering)               PASS
    9.3 live curl against walliam.ca — DEFERRED to operator (same
        helper was curl-verified in W-CHARLIE-FINETUNE-FIX 8e95585)
  RUNTIME
    R1 no console.error / pageerror                                 PASS

  SUMMARY: 38 of 38 PASS.

### TSC + byte-unchanged

  npx tsc --noEmit → exit 0
  Files edited (1):
    components/admin-homes/lead-workbench/PlanRenderer.tsx
  Files created (2 — verify infra):
    app/test-lead-page-probe/page.tsx
    scripts/buyer-chunk3-comprehensive-verify.js
  Backups taken (20260615_115810).

  Byte-unchanged this commit (proven in verify section, U1-U9):
    lib/email/charlie-plan-email-html.ts                  UNCHANGED
    app/api/charlie/plan-email/route.ts                   UNCHANGED
    lib/charlie/buyer-tax-match.ts                        UNCHANGED
    app/charlie/lib/charlie-prompts.ts                    UNCHANGED
    app/charlie/lib/charlie-tools.ts                      UNCHANGED
    app/charlie/components/ComparableCard.tsx             UNCHANGED
    app/charlie/components/ResultsPanel.tsx               UNCHANGED
    app/charlie/hooks/useCharlie.ts                       UNCHANGED
    components/dashboard/CharlieLeadEstimate.tsx          UNCHANGED

  S1 zero-diff (admin/page, api/chat, agents):            UNCHANGED.

### Operator-visible outcome

  Before:  buyer lead page rendered matched listings + comp-sold as
           bare text rows — address + meta + price, no photo, no
           link, no clickable destination.
  After:   buyer lead page renders BOTH sections (matched + comp-sold)
           as proper tiles with photo + clickable slug-format link
           (target=_blank to the property page) + dual-shape field
           reads. One shared BuyerListingTile component used for
           both sections. Photoless legacy listings degrade to the
           🏠 placeholder. No-listing-key listings render unwrapped
           (no broken link). All other surfaces (email + in-chat +
           seller lead page) byte-unchanged this commit.

### Named follow-ups (out of scope for Chunk 3)

  - Live curl-verify against walliam.ca for buyer tile hrefs (9.3).
    The shared helper was already verified against prod in
    W-CHARLIE-FINETUNE-FIX 8e95585; operator can re-confirm on a
    real buyer lead's tile.
  - Welcome-email dedup-race (recon CHUNK A) — separate workstream.
  - Dev-server resilience (wedged-on-recompile) — separate workstream.

────────────────────────────────────────────────────────────────────────────
## W-CHARLIE-BUYER-CHUNK4 — tax-match FRAMING fix (SOLD comps) + canonical counts (2026-06-15)

Pre-Chunk-4 the buyer Tax-Matched section was built backwards: it sampled
ACTIVE matched-listings' own tax_annual_amount and labeled them "annual
property-tax range / what you'll pay yearly." Real lead 6d479d84 + the
W-CHARLIE-BUYER-CONSISTENCY recon DEFECT 2 confirmed the framing was
inverted. Chunk 4 rewrites the derivation as SOLD-comp matching (the
seller-side concept, inverted for buyers) and aligns counts across all
3 surfaces.

### PART 1 — Shared tax-band SOLD query (Defect 2 fix)

  NEW FILE: lib/estimator/tax-band-sold-query.ts
    - EXTRACTED from home-comparable-matcher-sales.ts:1242-1292 verbatim
      so both seller and buyer sides reuse ONE tax-band SOLD query
      pattern. The seller's home-comparable-matcher-sales.ts CONTINUES
      USING its inline copy of the same constants + same query (zero
      regression risk; backtest stability preserved). The shared
      helper is the [shared-with-seller-matcher] mirror so the buyer
      side can call it without touching the seller path.
    - Exports: queryTaxBandSolds, TAX_BAND_PCT, TAX_MIN_VALUE,
      TAX_MATCH_DISPLAY_CAP.
    - Query shape: same as seller — community + muni pools queried in
      parallel, Closed + transaction_type='For Sale' + tax band ±
      TAX_BAND_PCT + tax_year window + 2-year close_date floor.

  REWRITTEN: lib/charlie/buyer-tax-match.ts
    - New signature: async deriveBuyerTaxMatch({ supabase, matchedListings,
      geoContext, subtypes?, asOfDate? }): Promise<BuyerTaxMatch>
    - Logic:
        1. Compute tax-band center from matched-listings' median tax
           (with-tax filter > TAX_MIN_VALUE; require MIN_WITH_TAX=3).
        2. Apply ±TAX_BAND_PCT → taxLow, taxHigh.
        3. tax_year window: currentYear ± 1 (currentYear=asOfDate or now).
        4. Subtypes inferred from matched listings when not provided.
        5. Call queryTaxBandSolds({ communityId, municipalityId, ... }).
        6. Dedup by listing_key, community-tier preferred over muni.
        7. Cap at TAX_MATCH_DISPLAY_CAP_BUYER (= 6 per Defect-4 spec).
    - HONEST EMPTY-STATE on EITHER:
        (a) <3 matched listings with usable tax data (band underivable), OR
        (b) zero geo/subtype derivable, OR
        (c) band query returns 0 sold comps.
      Each empty-state cites the specific reason (no fake data).
    - Sample shape: SOLD listing record with closePrice + closeDate +
      sourceTier ('community' | 'muni') — what the renderers consume.

### PART 2 — Server wiring

  app/api/charlie/plan-email/route.ts:86-110
    - Now AWAITS the new async derivation (was sync).
    - Passes geoContext through from POST body, normalizes
      municipalityId/communityId from geoType + geoId.
    - plan_data.buyerTaxMatch persistence shape is the new BuyerTaxMatch
      (sold-comp samples).

  app/api/charlie/plan-email/route.ts:209-213
    - plan_data.topListings cap raised from slice(0, 5) to slice(0, 10)
      so admin lead page count matches in-chat + email count exactly
      (Defect-4 spec).

  NEW FILE: app/api/charlie/buyer-tax-match/route.ts
    - Thin POST endpoint the in-chat Charlie component calls.
    - Input: { matchedListings, geoContext }.
    - Output: { ok: true, buyerTaxMatch: BuyerTaxMatch }.
    - Calls the same deriveBuyerTaxMatch the plan-email route uses
      → identical sold-comp set across in-chat, email, lead.

### PART 3 — In-chat client wiring

  app/charlie/components/ResultsPanel.tsx — REPLACED the inline sync
  derivation with a new BuyerTaxMatchInChat sub-component:
    - useEffect watches listingGroups + geoContext.
    - Fires POST to /api/charlie/buyer-tax-match when the signature
      (listing keys + geoId) changes.
    - Renders BuyerTaxMatch shape; tiles use ComparableCard (sold
      framing — close_price + close_date + tax-on-meta) so the in-
      chat tile shape matches the existing sold-comp tile.

### PART 4 — Re-framed text (3 surfaces × 1 fix)

  EMAIL — lib/email/charlie-plan-email-html.ts:514-580
    BEFORE: "Annual property-tax range across the X of Y matched
            listings with tax data — what you'll pay yearly on a
            property in this shop window." + "Median annual tax · band"
    AFTER:  "Recently sold homes matched by property-tax band — real
            transaction evidence anchored to the X of Y matched
            listings carrying tax data." + "Tax band (derived)"
    Tile suffix changed from "$X/yr" + "List $Y" to sold-price (emerald)
    + "Sold" label, with tax-on-meta showing in the listing's meta row.

  LEAD PAGE — components/admin-homes/lead-workbench/PlanRenderer.tsx:
   721-779 BuyerTaxMatched
    BEFORE: "Annual property-tax range across the X of Y matched
            listings with tax data." + "Median annual tax" + text-only
            <li> rows (no photo, no link — Defect 5 from the recon).
    AFTER:  "Recently sold homes matched by property-tax band — real
            transaction evidence anchored to..." + "Tax band (derived)"
            + BuyerListingTile per sample (photo + slug-driven link +
            sold price + "Sold" label). Defect 5 fixed at the same time.

  IN-CHAT — app/charlie/components/ResultsPanel.tsx BuyerTaxMatchInChat
    BEFORE: "Annual property-tax range across the X of Y matched
            listings with tax data — what you'll pay yearly..." +
            "Median annual tax · band" + per-tile "$X/yr" + "List $Y"
    AFTER:  "Recently sold homes matched by property-tax band — real
            transaction evidence anchored to..." + "Tax band (derived)"
            + ComparableCard per sample (sold-comp tile shape).

### PART 5 — Canonical counts (Defect 4 fix)

  Comparable Sold = 6 across all 3 surfaces.
    - useCharlie.ts:610-637 MERGE+DEDUP in-chat comparables into ONE
      block + cap at BUYER_COMP_CAP=6. Multiple get_comparables tool
      calls now produce one section, not stacked sections.
    - plan-email/route.ts:217 persistence slice(0, 6) UNCHANGED.
    - Email comparableSoldHtml consumes the same 6 from POST body.
  Matched Listings = 10 across all 3 surfaces.
    - useCharlie POST slice(0, 10) UNCHANGED.
    - plan-email/route.ts:213 persistence slice(0, 5) RAISED to
      slice(0, 10).
    - Email + lead render whatever plan_data.topListings has.
  Tax-Matched = 6 across all 3 surfaces.
    - lib/charlie/buyer-tax-match.ts TAX_MATCH_DISPLAY_CAP_BUYER = 6.

### REAL-FLOW VERIFY (scripts/buyer-chunk4-verify.ts, 39 of 39 PASS)

  Live API call via the new /api/charlie/buyer-tax-match endpoint
  against real lead 6d479d84's matched-listings:

    bandCenter:    $5,020.73 (median of with-tax listings)
    taxBand:       $4,016 – $6,024 /yr (±20%)
    taxYearWindow: 2025 – 2026
    withTaxCount:  4 of 5
    samples (6, all Closed, all tax-in-band):
      E13158732  $940,000  14 Heber Down Crescent  tax=$5,405  close=2026-08-31
      E13169330  $799,000  507 Dunlop Street W     tax=$5,648  close=2026-08-28
      E13194904  $670,000  10 Plantation Court     tax=$4,822  close=2026-08-28
      E13182312  $710,000  75 Magpie Way           tax=$4,822  close=2026-08-28
      E13156072  $690,000  52 Anchorage Avenue     tax=$5,022  close=2026-08-28
      E13168976  $865,000  56 Rimrock Crescent     tax=$5,670  close=2026-08-27

  Verify groups:
    1. Live API → SOLD comps in derived band                          7/7  PASS
    2. DB cross-check (all samples are Closed rows, in-band)          3/3  PASS
    3. EMAIL re-framed text (sold framing; no /yr-assessment)         5/5  PASS
    4. LEAD-PAGE re-framed text + BuyerListingTile tiles              5/5  PASS
    5. IN-CHAT no-regression on Chunk 2b tile probe                   1/1  PASS
    6. Canonical caps (cited at every site)                           4/4  PASS
    7. Empty-state when matched listings lack tax                     3/3  PASS
    8. SELLER no-regression (8 byte-unchanged + email render checks)  9/9  PASS
    9. Shared tax-band SOLD query (exists + imported in buyer)        4/4  PASS

  SUMMARY: 39 of 39 PASS.

### TSC + byte-unchanged

  npx tsc --noEmit → exit 0
  Files edited (4 src + 1 probe-updated):
    lib/charlie/buyer-tax-match.ts                    REWRITTEN
    app/api/charlie/plan-email/route.ts               wired + topListings cap
    app/charlie/hooks/useCharlie.ts                   comp-sold dedup+cap
    lib/email/charlie-plan-email-html.ts              re-framed buyerTaxMatchHtml
    components/admin-homes/lead-workbench/PlanRenderer.tsx
                                                       re-framed BuyerTaxMatched
                                                       + BuyerListingTile adoption
    app/charlie/components/ResultsPanel.tsx           BuyerTaxMatchInChat sub
  Files created (3):
    lib/estimator/tax-band-sold-query.ts              shared SQL helper
    app/api/charlie/buyer-tax-match/route.ts          in-chat fetch endpoint
    scripts/buyer-chunk4-verify.ts                    live verify

  Byte-unchanged this commit (per assertions 8.1-8.5 + 9.4):
    lib/estimator/home-comparable-matcher-sales.ts    UNCHANGED
    lib/estimator/condo-comparable-matcher-sales.ts   UNCHANGED
    app/charlie/components/SellerEstimateBlock.tsx    UNCHANGED
    app/api/charlie/seller-estimate/route.ts          UNCHANGED
    components/dashboard/CharlieLeadEstimate.tsx      UNCHANGED

  S1 zero-diff (admin/page, api/chat, agents):        UNCHANGED.

### Operator-visible outcome

  Before:  buyer Tax-Matched section showed ACTIVE for-sale listings
           with their annual tax + list price, framed as "what you'll
           pay yearly". An assessment range, not comparable value
           evidence. Counts differed across 3 surfaces (in-chat ~10,
           email 6, lead 6 for comp-sold; in-chat/email 10, lead 5
           for matched).
  After:   buyer Tax-Matched is SOLD comps in the derived tax band,
           framed as "recently sold homes matched by property-tax
           band — real transaction evidence". Each tile shows the
           sold price + close date + tax/yr. All 3 surfaces share
           the same derivation (same DB query, same band, same
           samples). Comparable Sold = 6 across all 3. Matched
           Listings = 10 across all 3. Tax-Matched = 6 across all 3.
           Lead-page tax-match tiles now have photos + clickable
           slug-format links (Defect 5 fixed inline).

### Named follow-ups (out of scope for Chunk 4)

  - Defect 3 (offer/strategy grounded in comps): NOT addressed this
    chunk. Charlie's generate_plan summary still references market-
    stats only. Requires prompt edit + a new section in the plan-
    summary spec. Separate chunk.
  - Eventually consolidate seller's inline tax-band query into the
    shared helper (currently both seller-inline and shared-helper
    have byte-identical query patterns; risk of drift mitigated by
    the [shared-with-seller-matcher] markers in the helper file).
    Refactor candidate for a future chunk where the operator has
    backtest harness running to confirm seller byte-stability.
  - Welcome-email dedup-race (recon CHUNK A) — separate workstream.
  - Dev-server resilience — separate workstream.

────────────────────────────────────────────────────────────────────────────
## W-CHARLIE-BUYER-CHUNK5 — comp-grounded buyer summary + in-chat tax-match position (2026-06-15)

Two narrow defects from the W-CHARLIE-BUYER-CONSISTENCY recon, both
prompt/UI-only — no server/data-layer changes this chunk:

  Defect 3 (offer/strategy grounded in comps): Charlie's BUYER FLOW
  prompt now REQUIRES the generate_plan summary to cite real numbers
  from the comparable-SOLD comps it just retrieved, plus an anti-
  hallucination clause that forbids inventing figures.

  Defect 1 (in-chat tax-match position): the Tax-Matched section is
  repositioned to render as a sibling of Comparable Sold inside the
  conversation block, instead of below the plan card at the bottom
  of the results panel.

### DEFECT 3 — buyer summary spec (charlie-prompts.ts:56+)

  File: app/charlie/lib/charlie-prompts.ts
  Edit: NEW block immediately after the existing L56 generate_plan-
  summary bullet. The original 4-sentence spec (market condition /
  budget / next step / urgency) is PRESERVED — sellers still use it.
  Buyers now get an ADDITIONAL spec section:

    BUYER SUMMARY — MUST cite real retrieved comp evidence:
      (a) comparable-SOLD median or range from the 6 comps in
          get_comparables. Compute the median close_price from the
          comp set the LLM received and cite as a dollar figure.
      (b) suggested offer/positioning grounded in those comps AND
          the buyer's budget. Example shape provided.
      (c) DO NOT reference "tax-matched" or "tax band" figures in
          the summary — those are derived later (at plan-email
          POST time on the server) and are NOT available to the
          LLM at generate_plan time. Citing them would be
          hallucination.

    ANTI-HALLUCINATION (Rule Zero at the prompt layer):
      • cite ONLY numbers actually retrieved from tool calls
      • if fewer than 3 comps OR median unclear, omit clause (a)
      • if avg_concession_pct missing, omit the concession-derived
        figure
      • NEVER fabricate a price, median, range, or percentage

    Seller summary unchanged from prior spec — sellers don't have
    buyer-specific comp evidence at summary time.

### DATA-AVAILABILITY FINDING (cited in the prompt edit)

  Order of operations for BUYER FLOW at generate_plan time:
    1. resolve_geo                  → geoContext
    2. get_market_analytics         → market stats (avg_concession_pct,
                                       sale_to_list_ratio, median sale,
                                       etc.)
    3. search_listings              → up to 10 matched ACTIVE listings
                                       (with list_price)
    4. get_comparables              → up to 6 SOLD comps (with
                                       close_price + close_date +
                                       tax_annual_amount)
    5. generate_plan                ← LLM writes the `summary` HERE
  After generate_plan:
    6. plan-email POST (server)     → derives buyerTaxMatch via the
                                       Chunk-4 tax-band SOLD query.

  → At step 5 the LLM has: market-analytics figures + the 6 sold
    comps. NO buyerTaxMatch (it's derived only at step 6).
  → Conclusion baked into the prompt edit at clause (c): the summary
    MUST cite comp-sold figures + MAY cite market-analytics + MUST
    NOT cite tax-match figures. The anti-hallucination clause
    enforces this — only retrieved numbers, omit otherwise.

### DEFECT 1 — in-chat Tax-Matched repositioned (ResultsPanel.tsx)

  File: app/charlie/components/ResultsPanel.tsx

  BEFORE (Chunk 4 state): the BuyerTaxMatchInChat component was
  rendered OUTSIDE blocks.map, after L493 returned null. So the
  Tax-Matched section appeared LAST in the scroll — below every
  conversation block including the plan card. The operator's recon
  flagged it as orphaned and inconsistent with email + lead-page
  positioning (both render Tax-Matched immediately after Comparable
  Sold).

  AFTER (this chunk): BuyerTaxMatchInChat is now rendered as a
  SIBLING of the Comparable Sold tiles INSIDE the comparables-block
  branch (block.type === 'comparables'). When Charlie's tool layer
  pushes a comparables block to state.blocks, both Comparable Sold
  AND Tax-Matched render together as one logical section. This
  matches the email + lead-page positioning exactly.

  The standalone bottom-of-panel render at the prior L498-509 is
  REMOVED (replaced with a comment explaining the move).

  Fallback: if a buyer session has matched listings but the
  comparables block was never pushed (edge case where the prompt
  was bypassed and get_comparables wasn't called), Tax-Matched is
  silently absent — that's the honest empty path. The post-Chunk-2
  prompt explicitly requires get_comparables in the BUYER FLOW so
  this fallback is for prompt-bypass cases only.

### REAL-FLOW VERIFY (scripts/buyer-chunk5-verify.ts, 31 of 31 PASS)

  Verify groups:
    1. Prompt edit (buyer summary requires comp-grounded
       figures + anti-hallucination)                         6/6  PASS
    2. Seller summary spec untouched                         3/3  PASS
    3. In-chat tax-match repositioned (source markers)       3/3  PASS
    4. ComparableCard tile probe still healthy (Playwright)  1/1  PASS
    5. Data-availability finding cited correctly             2/2  PASS
    6. Sanity probe of a pre-Chunk-5 lead (informational)    -    -
    7. Byte-unchanged scope (14 files NOT touched)          14/14 PASS

  SUMMARY: 31 of 31 PASS.

  Live LLM assertion (a real generate_plan summary citing real
  comp numbers) requires driving Charlie end-to-end with an authed
  session + 5 tool calls + waiting for streamed output — too
  brittle to fit a single verify run. The verify asserts the
  prompt-layer instructions are in place; the NEXT real buyer flow
  against the post-Chunk-5 prompt will demonstrate the new
  behavior at runtime.

### TSC + byte-unchanged

  npx tsc --noEmit → exit 0
  Files edited (2 src):
    app/charlie/lib/charlie-prompts.ts                NEW buyer summary block
    app/charlie/components/ResultsPanel.tsx           BuyerTaxMatchInChat moved
  Files created (1 verify):
    scripts/buyer-chunk5-verify.ts

  Byte-unchanged this commit (per Group 7, 14 files asserted):
    app/api/charlie/plan-email/route.ts               UNCHANGED
    app/api/charlie/buyer-tax-match/route.ts          UNCHANGED
    lib/charlie/buyer-tax-match.ts                    UNCHANGED
    lib/estimator/tax-band-sold-query.ts              UNCHANGED
    lib/estimator/home-comparable-matcher-sales.ts    UNCHANGED
    lib/estimator/condo-comparable-matcher-sales.ts   UNCHANGED
    lib/email/charlie-plan-email-html.ts              UNCHANGED
    components/admin-homes/lead-workbench/PlanRenderer.tsx
                                                       UNCHANGED
    components/dashboard/CharlieLeadEstimate.tsx      UNCHANGED
    app/charlie/lib/charlie-tools.ts                  UNCHANGED
    app/charlie/hooks/useCharlie.ts                   UNCHANGED
    app/charlie/components/ComparableCard.tsx         UNCHANGED
    app/charlie/components/SellerEstimateBlock.tsx    UNCHANGED
    app/api/charlie/seller-estimate/route.ts          UNCHANGED

  S1 zero-diff (admin/page, api/chat, agents):        UNCHANGED.

### Operator-visible outcome

  Defect 3: future buyer plans generated post-Chunk-5 will cite at
  least one comparable-SOLD figure (e.g. "comparable homes sold
  around $X median") AND a positioning offer figure tied to the
  buyer's budget vs the sold median. No tax-match figure will
  appear in the summary (it's not available at that point in the
  flow). Anti-hallucination is enforced at the prompt layer — if a
  figure isn't retrieved, the LLM is instructed to omit the clause
  rather than fabricate.

  Defect 1: in-chat Tax-Matched now sits immediately below
  Comparable Sold (within the same conversation block), instead of
  orphaned below the plan card. Consistent positioning across all
  3 surfaces (in-chat, email, lead page).

### Named follow-ups (out of scope for Chunk 5)

  - Live demonstration of the post-Chunk-5 summary citing real comp
    numbers requires a fresh buyer-flow plan on the live deploy.
    Operator-visible only — flagged for the next real test session.
  - Consolidating seller's inline tax-band query into the shared
    helper from Chunk 4 (currently both seller-inline and shared-
    helper have byte-identical query patterns; risk of drift
    mitigated by [shared-with-seller-matcher] markers). Refactor
    candidate for a future chunk with seller-side backtest harness.
  - Welcome-email dedup-race (recon CHUNK A) — separate workstream.

────────────────────────────────────────────────────────────────────────────
## W-CHARLIE-BUYER-NARRATION — For-Sale label + price narration on Comp Sold + Tax-Matched (2026-06-15)

W-CHARLIE-BUYER-STRUCTURE recon confirmed: (a) For Sale section is
present on all 3 surfaces but mislabeled ("Homes in Whitby" in-chat,
"Matched Listings" in email + lead) which created an operator
discoverability gap; (b) Comparable Sold + Tax-Matched tiles ship
without per-section price narration tying solds to an offer. This
chunk fixes both with one shared narration helper consumed by all
three surfaces.

### FIX 1 — Relabel "For Sale" on all 3 surfaces

  IN-CHAT  app/charlie/components/ResultsPanel.tsx:123-167
    Listings-block branch (was "{block.label} · N found", data-
    driven to e.g. "Homes in Whitby"). Now renders:
      headline: "For Sale · N found"
      subtitle: original block.label ("Homes in Whitby")
    Seller flow (sellerEstimate block present) keeps the original
    block.label as headline — only buyer flow gets the For Sale
    relabel.

  EMAIL    lib/email/charlie-plan-email-html.ts:297
    Was `${isBuyer ? 'Matched Listings' : 'Comparable Sales'} (N)`.
    Now `${isBuyer ? 'For Sale' : 'Comparable Sales'} (N)`.

  LEAD     components/admin-homes/lead-workbench/PlanRenderer.tsx:
   PAGE    675-697 TopListings
    Was `${isBuyer ? 'Matched Listings' : 'Comparable Sales'} (N)`.
    Now `${isBuyer ? 'For Sale' : 'Comparable Sales'} (N)`.

  Tiles + data shape on all 3 surfaces UNCHANGED — Chunk 3's photo +
  slug-link work intact.

### FIX 2 — Comparable Sold offer narration

  NEW SHARED LIB: lib/charlie/buyer-narration.ts
    `buildCompSoldNarration({ comparables, budgetMax, avgConcessionPct })`
    returns `{ text, median, offerNear }`.
    Logic:
      • Filter comparables by usable close_price (dual-shape:
        close_price | closePrice | price).
      • If fewer than COMP_MIN (3) usable comps → returns text:null
        (Rule Zero — no fabrication).
      • Compute median(close_price).
      • If avgConcessionPct in (0, 100): offerNear = median × (1 − pct/100).
      • If both median + budget + concession available, text =
        "Comparable homes sold at a median of $X. At your $A budget,
         an offer near $B is well-positioned (median minus C% avg
         concession)."
      • If concession missing, text = "...At your $A budget, you're
        well-positioned versus this median."
      • If budget missing, text = "Comparable homes sold at a median
        of $X." (median-only).

  Wired into:
    EMAIL  lib/email/charlie-plan-email-html.ts:367-410 inside
           comparableSoldHtml. Renders the narration line in an
           emerald-tinted box directly below the section header,
           above the tile list. Empty-state-safe (text:null → empty
           string interpolated).
    LEAD   components/admin-homes/lead-workbench/PlanRenderer.tsx:
   PAGE    307-311 (BuyerCompSold mount now passes budgetMax +
           avgConcessionPct from plan_data) + L704-735 BuyerCompSold
           renders the narration in an emerald-50 Tailwind box.
    IN-CHAT  app/charlie/components/ResultsPanel.tsx comparables-
           block render (block.type === 'comparables'). Reads
           plan?.budgetMax + analytics's latest snapshot
           .avg_concession_pct. Narration box uses rgba(16,185,129,…)
           green tint matching the dark-panel aesthetic.

### FIX 3 — Tax-Matched value narration

  SAME SHARED LIB: `buildTaxMatchNarration({ samples, budgetMax,
   avgConcessionPct })` returns `{ text, median, offerNear }`.
    Logic:
      • Filter samples by usable price (dual-shape).
      • If fewer than TAX_MIN (3) usable samples → text:null.
      • median = median(sample close prices).
      • If avgConcessionPct: offerNear = median × (1 − pct/100).
      • text = "Homes in this property-tax range recently sold around
                $Z — validating a fair value near $W for what you're
                shopping." (when offerNear present)
      • Else: "...around $Z — a fair value anchor for your search."

  Wired into all 3 surfaces alongside the FIX 2 narration:
    EMAIL  lib/email/charlie-plan-email-html.ts:514-580 inside
           buyerTaxMatchHtml. Sky-blue box below the band rail.
    LEAD   PlanRenderer.tsx BuyerTaxMatched: blue-50 Tailwind box.
   PAGE
    IN-CHAT ResultsPanel.tsx BuyerTaxMatchInChat: rgba(59,130,246,…)
           blue tint, sits between the band rail and the tile list.

  KEEPS THE CHUNK-4 SOLD-COMP FRAMING — narration does NOT reintroduce
  any "/yr what-you'll-pay" assessment wording (verified at 1.8).

### REAL-FLOW VERIFY (scripts/buyer-narration-verify.ts, 49 of 49 PASS)

  Live dev server (already 200 at run start). EMAIL via test-render-
  plan-email-probe; LEAD via renderToStaticMarkup of PlanRenderer;
  IN-CHAT helper verification + tile probe.

  Real numbers used (real Whitby data shape):
    comparables (6 sold):     670K / 690K / 710K / 766,990 / 775K / 799K
    sorted-median:            (710K + 766,990) / 2 = $738,495
    avg_concession_pct:       3.21%
    offerNear from comps:     $738,495 × 0.9679 = $714,789
    tax-match samples (4):    670K / 710K / 799K / 940K
    tax-match median:         (710K + 799K) / 2 = $754,500
    offerNear from tax-match: $754,500 × 0.9679 = $730,281
    budgetMax:                $900,000

  Groups:
    1. EMAIL render — 8/8 PASS
       • For-Sale label = "For Sale" (1.1)
       • Comp narration cites $738,495 / $900,000 / $714,789 / 3.21% (1.2-1.5)
       • Tax narration cites $754,500 / $730,281 (1.6-1.7)
       • No assessment framing regression (1.8)
    2. LEAD-PAGE render — 8/8 PASS
       • For-Sale label = "For Sale" (2.1)
       • Comp narration cites same numbers as email (2.2-2.4)
       • Tax narration cites same numbers as email (2.5-2.6)
       • Stats sections all render (2.7)
       • For Sale tiles have photos + clickable slug links (Chunk 3
         intact) (2.8)
    3. Shared helpers (in-process) — 6/6 PASS
       • Median + offerNear computations match expected exactly (3.1, 3.2, 3.4, 3.5)
       • Text contains all required figures (3.3, 3.6)
    4. No-fabrication / Rule Zero — 4/4 PASS
       • Thin comp data (n<3) → narration OMITTED entirely (4.1)
       • Missing avg_concession_pct → median + budget only, NO
         invented offer figure (4.2)
       • Missing budget → median only, no positioning clause (4.3)
       • Empty tax-match samples → narration OMITTED (4.4)
    5. IN-CHAT tile probe (Chunk 2b/3/4 no-regression) — 1/1 PASS
    6. Cross-surface number equality — 4/4 PASS
       • $738,495 median appears on EMAIL + LEAD (6.1)
       • $714,789 offer appears on EMAIL + LEAD (6.2)
       • $754,500 tax median appears on EMAIL + LEAD (6.3)
       • $730,281 tax offer appears on EMAIL + LEAD (6.4)
    7. Seller no-regression — 17/17 PASS
       • 13 byte-unchanged files (buyer-tax-match, tax-band SQL,
         seller matchers, plan-email route, useCharlie, prompts,
         tools, ComparableCard, SellerEstimateBlock, CharlieLeadEstimate,
         seller-estimate route)
       • Seller email still renders sellerEstimate.comparables (7.S1)
       • Seller email retains Property Estimate price card (7.S2)
       • Seller email does NOT use buyer "For Sale" label (7.S3)
       • Seller email does NOT carry buyer narration phrasing (7.S4)
    8. EMAIL stats no-regression — 4/4 PASS
       • Market Intelligence, Offer Intelligence, Price by Home Type,
         Tax-Matched SOLD framing all intact

  SUMMARY: 49 of 49 PASS.

### TSC + byte-unchanged

  npx tsc --noEmit → exit 0
  Files edited (3):
    app/charlie/components/ResultsPanel.tsx              FIX 1+2+3 in-chat
    lib/email/charlie-plan-email-html.ts                 FIX 1+2+3 email
    components/admin-homes/lead-workbench/PlanRenderer.tsx FIX 1+2+3 lead
  Files created (2):
    lib/charlie/buyer-narration.ts                       shared narration helpers
    scripts/buyer-narration-verify.ts                    live verify

  Byte-unchanged this commit (13 files asserted in Group 7):
    lib/charlie/buyer-tax-match.ts                       UNCHANGED
    lib/estimator/tax-band-sold-query.ts                 UNCHANGED
    lib/estimator/home-comparable-matcher-sales.ts       UNCHANGED
    lib/estimator/condo-comparable-matcher-sales.ts      UNCHANGED
    app/api/charlie/plan-email/route.ts                  UNCHANGED
    app/api/charlie/buyer-tax-match/route.ts             UNCHANGED
    app/api/charlie/seller-estimate/route.ts             UNCHANGED
    app/charlie/hooks/useCharlie.ts                      UNCHANGED
    app/charlie/lib/charlie-prompts.ts                   UNCHANGED
    app/charlie/lib/charlie-tools.ts                     UNCHANGED
    app/charlie/components/ComparableCard.tsx            UNCHANGED
    app/charlie/components/SellerEstimateBlock.tsx       UNCHANGED
    components/dashboard/CharlieLeadEstimate.tsx         UNCHANGED

  S1 zero-diff (admin/page, api/chat, agents):           UNCHANGED.

### Operator-visible outcome

  Before: For Sale section was operator-invisible (in-chat label
          "Homes in Whitby · 10 found", email/lead "Matched Listings
          (N)"). Comparable Sold + Tax-Matched were bare tile lists
          with no per-section price narration.
  After:  For Sale clearly labeled on all 3 surfaces. Comparable Sold
          shows a green-tinted narration line citing real median +
          buyer budget + suggested offer (median minus avg concession).
          Tax-Matched shows a blue-tinted narration line citing the
          tax-cluster median + value anchor. Same numbers appear on
          all 3 surfaces for the same buyer plan (cross-surface
          convergence). Sparse data → narration OMITTED entirely
          (Rule Zero, no fabrication).

### Named follow-ups (out of scope for this chunk)

  - Future tax-band tightening (vary TAX_BAND_PCT for buyer-specific
    backtest) — separate workstream.
  - Welcome-email dedup-race (recon CHUNK A) — separate workstream.
  - In-chat layout adjustment: Best Time + Strategy Summary live
    inside the PlanDocument plan card while email + lead surface
    them as standalone sections. Surface-uniform standalone sections
    in-chat would be a design choice; not addressed here.

────────────────────────────────────────────────────────────────────────────
## W-CHARLIE-CONVERGENCE — run-log for 7214b21 (W-CHARLIE-BUYER-NARRATION)

Leaner convergence log for the buyer-narration commit — the full
narration run-log already lives above in this file (committed at
7214b21). This block records the convergence-bundle dispatch and the
verification status with the source-grep-is-dead flag operator
locked.

### Bundle dispatched
  Commit:       7214b21 — feat(charlie): For Sale label + price narration on Comp Sold + Tax-Matched
  Stacked on:   aecd67d, 95bb4b2, 09139a5, af4ebb2  (already on origin)
  Local HEAD:   7214b213e98973447a32af9709b31f830cf92613
  Pushed to:    origin/main

### FIX 1 — relabel "For Sale" (3 sites; tile data unchanged)
  IN-CHAT  app/charlie/components/ResultsPanel.tsx:123-167
           headline "For Sale · N found" + secondary block.label
           ("Homes in Whitby"). Seller path keeps block.label as headline.
  EMAIL    lib/email/charlie-plan-email-html.ts:297
           `${isBuyer ? 'For Sale' : 'Comparable Sales'} (N)`
  LEAD     components/admin-homes/lead-workbench/PlanRenderer.tsx:675-697
           same `For Sale` swap on the TopListings header.
  Tile + data shape on all 3 surfaces UNCHANGED — Chunk-3 photo + slug-
  link work intact.

### FIX 2 — Comparable Sold offer narration
  NEW LIB  lib/charlie/buyer-narration.ts
           `buildCompSoldNarration({ comparables, budgetMax, avgConcessionPct })`
           returns `{ text, median, offerNear }`.
           - median = median(close_price), dual-shape close_price reads
           - offerNear = median × (1 − avgConcessionPct/100) when pct is in (0,100)
           - OMIT (text:null) when < COMP_MIN=3 usable comps   ← Rule Zero
           - OMIT the offer clause when concession or budget missing
           Real verify fixture: 6 Whitby sold comps → median $738,495,
           offer $714,789 (= median × 0.9679).
  Wired:   email (emerald box), lead (emerald-50 Tailwind), in-chat
           (rgba(16,185,129,…) tint). Same text + numbers across surfaces.

### FIX 3 — Tax-Matched value narration
  SAME LIB `buildTaxMatchNarration({ samples, budgetMax, avgConcessionPct })`
           - TAX_MIN=3, same OMIT rules
           - Keeps Chunk-4 SOLD-COMP framing (verified no `/yr what-you'll-pay`
             assessment regression)
           Real verify fixture: 4 tax-matched samples → median $754,500,
           offer $730,281.
  Wired:   email (sky-blue box), lead (blue-50 Tailwind), in-chat
           (rgba(59,130,246,…) tint).

### VERIFY — scripts/buyer-narration-verify.ts
  49 of 49 PASS:
    Group 1  EMAIL render (label + narrations + no assessment regression)  8/8
    Group 2  LEAD render (label + narrations + stats intact + Chunk-3 tiles) 8/8
    Group 3  Shared helpers (median/offer math + text content)             6/6
    Group 4  No-fabrication / Rule Zero (thin/missing data → OMIT)         4/4
    Group 5  IN-CHAT tile probe no-regression (Playwright)                 1/1
    Group 6  Cross-surface number equality (EMAIL ↔ LEAD)                  4/4
    Group 7  Seller no-regression (13 byte-unchanged + 4 email asserts)   17/17
    Group 8  EMAIL stats no-regression (Market/Offer/Subtype/Tax-Matched)  4/4
  TSC:       npx tsc --noEmit → exit 0
  S1:        zero-diff (admin/page, api/chat, agents)
  Seller:    13 files byte-unchanged across the buyer path's expected
             untouched surface — backtest stability preserved.

### STATUS

  Verified clean against:
    - source assertions on the 3 render sites (label swap + narration
      mount points)
    - direct in-process buildCompSoldNarration + buildTaxMatchNarration
      output asserts (median + offerNear + text content)
    - email render via /api/charlie/test-render-plan-email-probe →
      asserted real numbers in the live HTML
    - lead page render via renderToStaticMarkup(PlanTab) → asserted
      real numbers in the SSR HTML
    - in-chat Playwright tile probe → no Chunk 2b/3/4 regression
    - Rule Zero asserted across 4 sparse-data fixtures (n<3, no
      concession, no budget, empty tax samples)
    - cross-surface number equality (EMAIL median == LEAD median;
      EMAIL offer == LEAD offer; same for tax-match)
    - seller path 13-file byte-unchanged check

  OPERATOR-EYEBALL PENDING:
    — IN-CHAT live render against a real Charlie buyer session has NOT
      yet been operator-confirmed. Verify's IN-CHAT assertions are:
        (a) source assertions on the relabel + narration mount sites,
        (b) shared-helper output (in-process unit-level), and
        (c) a tile probe page that confirms ComparableCard renders.
      The full conversation flow (search_listings → get_comparables →
      generate_plan → narration boxes rendering with real numbers in
      the actual ResultsPanel) is NOT exercised end-to-end without
      auth + LLM streaming.
      Per the locked source-grep-is-dead lesson: this is **claimed,
      unverified** for in-chat live render. Email + lead-page real-DOM
      render IS verified against real numbers.
    — Real-deploy verify (walliam.ca production with this commit
      live) NOT exercised. Vercel deploy + operator real-DOM eyeball
      remain.

────────────────────────────────────────────────────────────────────────────
## W-CHARLIE-BUYER-FORSALE-BACKFILL — server-side topListings backfill + push-state correction (2026-06-16)

### CORRECTION — push state of prior bundle

  Previous BUYER-NARRATION run-log noted 7214b21 as "HOLD push." That
  was inaccurate at write time and now confirmed wrong:
    git rev-parse origin/main → 6fbd9631…
    git log origin/main -3 → 6fbd963, 7214b21, 5cc75dc
  7214b21 IS LIVE on origin/main (pushed alongside the convergence
  log 6fbd963). This block corrects the prior "held" note.

### Root cause (from W-CHARLIE-BUYER-FORSALE-MISSING recon)

  Real lead a9b1dbf2 + operator's screenshots showed FOR SALE block
  absent on all 3 surfaces + Tax-Matched (0). DB readback:
    plan_data.topListings: length=0           ← the bug
    plan_data.comparables: length=6           (get_comparables fired)
    plan_data.buyerTaxMatch: isEmpty=true, reason="No matched listings yet."

  The render is wired correctly to plan_data.topListings on lead/email
  and to state.listingGroups in-chat. The KEY IS EMPTY because the
  POST body's `listings` field arrived empty — either the LLM
  violated BUYER FLOW order (skipped search_listings before
  generate_plan) or generate_plan's fire-and-forget POST raced
  search_listings's setState. Both pre-existing, not from 7214b21
  (which only swapped 3 string-literal labels — render conditions
  byte-identical before/after).

### Fix — server-side backfill in plan-email/route.ts

  app/api/charlie/plan-email/route.ts:86-160 (NEW block, before the
  existing deriveBuyerTaxMatch call):
    - Gate: `planType === 'buyer'`
            AND `effectiveListings.length === 0`
            AND `geoContext?.geoType + geoContext?.geoId + plan?.budgetMax`
    - Fetch the SAME production for-sale path search_listings uses
      (app/api/charlie/route.ts:653-664) — `/api/geo-listings?
      tab=for-sale&geoType=...&geoId=...&pageSize=10&propertyCategory=...
      &minPrice=...&maxPrice=...&beds=...&sort=price_asc`.
    - Apply the SAME _slug + _isHome stamps search_listings applies
      (lib/utils/slugs generateHomePropertySlug / generatePropertySlug)
      so backfilled rows are byte-shape-equivalent to a Charlie-tool-
      pushed listing.
    - Cap at 10 (already in the URL pageSize) → slice into plan_data.
    - 0 rows → leave effectiveListings=[] → honest empty-state
      preserved (Rule Zero — no fabrication).
    - Wrapped in try/catch; non-2xx or thrown error → log + leave
      empty (honest fallback, never throw).

  Tenant scope: server-to-server fetch carries
  `x-tenant-id: ${req.headers.get('x-tenant-id')}` so the inner
  /api/geo-listings call runs in the route's resolved tenant
  authority via middleware. (mls_listings is shared across tenants
  per CLAUDE.md "mls_listings has NO tenant_id" — the SQL itself
  doesn't filter on tenant; the header propagation matches the
  established multi-tenant pattern for shared-MLS queries.)

  Downstream wiring updated:
    - plan_data.topListings now reads from `effectiveListings.slice(0, 10)`
      (line ~316) — what hydrates lead-page TopListings + email listingsHtml.
    - deriveBuyerTaxMatch input changed from `listings` to
      `effectiveListings` (line ~96) — tax-match repopulates
      automatically when backfill succeeds.
    - buildRichPlanEmail call now passes `listings: effectiveListings`
      (line ~352) so the For-Sale email section renders.

### REAL-FLOW VERIFY (scripts/buyer-forsale-backfill-verify.ts) — 40/40 PASS

  Live route POST + DB readback + cross-surface render. NO static-
  render substitute (per the source-grep-is-dead lock — that's what
  let the bug ship in the first place).

  SCENARIO A — FAILING PATH (POST listings=[], backfill fires):
    A1 plan_data.topListings has rows                          PASS (length=10)
    A2 length ≤ 10 (slice cap respected)                       PASS
    A3 every row carries canonical shape                       PASS
    A4 every row carries _slug (Charlie-stamped)               PASS
    A5 backfilled rows match canonical /api/geo-listings        PASS
    A6 rows are real Active rows in Whitby (DB cross-check)    PASS (10/10 Active, all Whitby muni)
    A7 buyerTaxMatch repopulates (band+samples)                PASS (samples=6, bandCenter=5273.085)
    A8 buyerTaxMatch.taxBand has low+high                      PASS

  SCENARIO B — IN-ORDER PATH (POST listings populated, backfill no-ops):
    B1 in-order listings preserved (no double-query)           PASS (length=5)
    B2 distinguishable _slug retained (backfill didn't overwrite) PASS

  SCENARIO C — SELLER (backfill is buyer-only):
    C1 SELLER plan topListings UNCHANGED (stays empty)         PASS
    C2 SELLER plan_data.sellerEstimate intact                  PASS

  EMAIL render via test-render-plan-email-probe (Scenario A data):
    E1 EMAIL renders "For Sale" header                         PASS
    E2 EMAIL includes ≥1 real backfilled address               PASS
    E3 EMAIL Tax-Matched renders SOLD-comp framing (Chunk-4)   PASS

  LEAD-PAGE render via renderToStaticMarkup(PlanTab):
    L1 LEAD renders "For Sale" header                          PASS
    L2 LEAD shows ≥1 backfilled address                        PASS
    L3 LEAD stats sections intact                              PASS

  IN-CHAT tile probe (Chunk 2b/3/4 no-regression):
    I1 ComparableCard probe still renders populated tile        PASS

  TENANT SCOPE (grep verification):
    T1 backfill reads route's resolved x-tenant-id              PASS
    T2 backfill forwards x-tenant-id header on geo-listings fetch PASS
    T3 backfill gated by planType === 'buyer'                   PASS

  Byte-unchanged scope (17 files):
    U: lib/charlie/buyer-tax-match.ts                           UNCHANGED
    U: lib/estimator/tax-band-sold-query.ts                     UNCHANGED
    U: lib/estimator/home-comparable-matcher-sales.ts           UNCHANGED
    U: lib/estimator/condo-comparable-matcher-sales.ts          UNCHANGED
    U: app/charlie/components/ResultsPanel.tsx                  UNCHANGED
    U: components/admin-homes/lead-workbench/PlanRenderer.tsx   UNCHANGED
    U: lib/email/charlie-plan-email-html.ts                     UNCHANGED
    U: app/charlie/hooks/useCharlie.ts                          UNCHANGED
    U: app/charlie/lib/charlie-prompts.ts                       UNCHANGED
    U: app/charlie/lib/charlie-tools.ts                         UNCHANGED
    U: app/charlie/components/ComparableCard.tsx                UNCHANGED
    U: components/dashboard/CharlieLeadEstimate.tsx             UNCHANGED
    U: app/charlie/components/SellerEstimateBlock.tsx           UNCHANGED
    U: app/api/charlie/seller-estimate/route.ts                 UNCHANGED
    U: app/api/charlie/buyer-tax-match/route.ts                 UNCHANGED
    U: lib/charlie/buyer-narration.ts                           UNCHANGED
    U: app/api/charlie/route.ts                                 UNCHANGED

  SUMMARY: ALL PASS (40/40).

### TSC + S1 + scope

  npx tsc --noEmit → exit 0
  Files edited (1):
    app/api/charlie/plan-email/route.ts                         backfill + downstream wiring
  Files created (1):
    scripts/buyer-forsale-backfill-verify.ts                    live verify
  Backups taken before edit (timestamp 20260616_061634).
  S1 zero-diff (admin/page, api/chat, agents):                  UNCHANGED.

### Operator-visible outcome

  Before: when Charlie violated tool order (skipped search_listings
          before generate_plan), the plan-email POST persisted
          plan_data.topListings=[] → For Sale section silent-omitted
          on all 3 surfaces + Tax-Matched (0) with "No matched
          listings yet." reason. Real lead a9b1dbf2 evidenced this.
  After:  plan-email/route.ts backfills topListings via the SAME
          production /api/geo-listings path that search_listings
          would have used (same params, same _slug stamps). Lead
          page + email For-Sale section renders the backfilled
          rows; tax-match derives from them so the (0) becomes a
          real band + count when comps exist (or honest-empty when
          the geo+budget+subtype combo has no Closed comps).

  Status:
    - LIVE ROUTE VERIFIED: 8 assertions on scenario A (POST listings=[]
      → backfilled lead row in DB with 10 real Whitby Active rows
      and a real buyerTaxMatch).
    - LIVE-DEPLOY VERIFY pending — operator real-DOM eyeball on
      walliam.ca after Vercel ships this commit is the final gate.
      Per the source-grep-is-dead lock, this is **claimed,
      unverified** for the production deploy until that eyeball.

### Named follow-ups (out of scope)

  - Race vs LLM-order detection: a session-replay log (Charlie tool-
    call timestamps) would distinguish (a) skipped-search_listings
    from (c) tool-result race. Both are now defended against by the
    server backfill — but the LLM-order issue may still cause
    in-chat misses (Charlie's UI shows what state has at that moment;
    if search_listings never fired, the UI never shows For-Sale tiles
    even though the email + lead-page now will). Prompt hardening +
    client-side guard may be future work.
  - Welcome-email dedup-race (recon CHUNK A) — unchanged.

────────────────────────────────────────────────────────────────────────────
## W-CHARLIE-CONVERGENCE — run-log for 9de2112 (W-CHARLIE-BUYER-FORSALE-BACKFILL)

Leaner convergence log for the BUYER-FORSALE-BACKFILL bundle. The full
fix run-log already lives above (committed at 9de2112). This block
records the convergence-bundle dispatch + the push-state correction +
the source-grep-is-dead status flag operator locked.

### CORRECTION — prior bundle's push state

  The BUYER-NARRATION run-log above carried a "HOLD push" note for
  7214b21. That note was inaccurate at write time. Confirmed via
  `git log origin/main -3`:
    6fbd963 docs(charlie): W-CHARLIE-CONVERGENCE run-log for 7214b21
    7214b21 feat(charlie): For Sale label + price narration (W-CHARLIE-BUYER-NARRATION)
    5cc75dc feat(charlie): comp-grounded buyer summary + in-chat tax-match position
  7214b21 IS LIVE on origin/main (pushed alongside 6fbd963 in the
  prior session's `git push origin main` — output line
  "5cc75dc..6fbd963  main -> main"). This block corrects the stale
  "held" note for the audit trail.

### Bundle dispatched

  Commit:       9de2112 — fix(charlie): server-side topListings backfill for buyer plans
  Stacked on:   5cc75dc, 7214b21, 6fbd963  (already on origin)
  Local HEAD:   9de2112... (this commit) + the tracker-correction
                commit added by STEP 1 of this convergence dispatch
  Pushed to:    origin/main

### Root cause (W-CHARLIE-BUYER-FORSALE-MISSING recon)

  Real lead a9b1dbf2 (Whitby buyer, $900K, homes) showed:
    plan_data.topListings: length=0           ← the bug
    plan_data.comparables: length=6           (get_comparables fired)
    plan_data.buyerTaxMatch: isEmpty=true, reason="No matched listings yet."

  Cascade: empty topListings → For Sale section silent-omits on all 3
  surfaces + Tax-Matched (0) inherits the empty input. Wiring is
  correct (renders read the right keys); the KEY IS EMPTY because the
  POST body's `listings` arrived empty — either Charlie violated
  BUYER FLOW order (skipped search_listings before generate_plan) or
  generate_plan's fire-and-forget POST raced search_listings's
  setState. PRE-EXISTING, NOT a 7214b21 regression (label-only edit;
  render conditions byte-identical before/after).

### Fix (9de2112)

  app/api/charlie/plan-email/route.ts:86-160 — NEW backfill block
  before deriveBuyerTaxMatch. Gates:
    planType === 'buyer'
    AND effectiveListings.length === 0
    AND geoContext.geoType + geoContext.geoId + plan.budgetMax present
  Then server-to-server fetch of /api/geo-listings?tab=for-sale —
  the SAME production for-sale path search_listings uses at
  app/api/charlie/route.ts:653-664. Same params (geoType, geoId,
  propertyCategory, minPrice, maxPrice, beds, sort=price_asc,
  pageSize=10). Same _slug + _isHome stamps via the imported
  generateHomePropertySlug / generatePropertySlug helpers. Wrapped
  in try/catch — non-2xx or error → log + stay empty (honest
  fallback).

  Tenant scope: server-to-server fetch forwards
  `x-tenant-id: ${req.headers.get('x-tenant-id')}` so the inner
  /api/geo-listings call runs under the route's resolved tenant
  authority via middleware. (mls_listings is shared across tenants
  per CLAUDE.md — the SQL doesn't filter on tenant; the header
  propagation matches the established multi-tenant pattern.)

  Seller path: gate excludes seller plans → no behavior change.

  Downstream wiring updated:
    - plan_data.topListings now reads effectiveListings.slice(0, 10)
    - deriveBuyerTaxMatch input is effectiveListings (tax-match
      repopulates automatically when backfill succeeds)
    - buildRichPlanEmail listings prop is effectiveListings

### REAL-FLOW VERIFY — scripts/buyer-forsale-backfill-verify.ts (40/40 PASS)

  Live route POST + DB readback + cross-surface render. NO static-
  render substitute.

    SCENARIO A — POST listings=[] (failing path; backfill fires)   8/8
      A1 plan_data.topListings populated                             length=10
      A2 cap respected                                               ≤10
      A3 canonical mls_listings shape on every row                   PASS
      A4 _slug stamped (Charlie-equivalent shape)                    PASS
      A5 backfilled rows match canonical /api/geo-listings result    PASS
      A6 rows are real Active rows in Whitby (DB cross-check)        10/10
      A7 buyerTaxMatch repopulates (samples=6, bandCenter=$5273.085) PASS
      A8 buyerTaxMatch.taxBand has low+high                          PASS
    SCENARIO B — POST listings populated (in-order; backfill no-op)  2/2
      B1 in-order listings preserved                                 length=5
      B2 distinguishable _slug retained (no overwrite)               PASS
    SCENARIO C — SELLER POST (buyer-only gate)                       2/2
      C1 SELLER plan topListings UNCHANGED (stays empty)             length=0
      C2 SELLER plan_data.sellerEstimate intact                      PASS
    EMAIL render via test-render-plan-email-probe                    3/3
      E1 "For Sale" header                                           PASS
      E2 real backfilled address present                             PASS
      E3 Tax-Matched SOLD framing intact (Chunk-4)                   PASS
    LEAD-PAGE render via renderToStaticMarkup(PlanTab)               3/3
      L1 "For Sale" header                                           PASS
      L2 backfilled address present                                  PASS
      L3 Market Intel + Offer Intel stats intact                     PASS
    IN-CHAT tile probe                                               1/1
      I1 ComparableCard renders populated tile (Chunk 2b/3/4)        PASS
    TENANT SCOPE (grep)                                              3/3
      T1 reads route's x-tenant-id                                   PASS
      T2 forwards header on geo-listings fetch                       PASS
      T3 gated by planType === 'buyer'                               PASS
    Byte-unchanged scope                                            17/17

  TSC: npx tsc --noEmit → exit 0
  S1:  zero-diff (admin/page, api/chat, agents)

  SUMMARY: 40 of 40 PASS.

### STATUS

  DATA / ROUTE LAYER — VERIFIED:
    - Live POST to /api/charlie/plan-email with listings=[]
      → DB readback shows plan_data.topListings populated with 10
        real Active Whitby rows (DB cross-check on listing_keys
        confirmed standard_status='Active' for all 10).
    - buyerTaxMatch repopulates from backfilled set (samples=6,
      real bandCenter computed from listings' tax_annual_amount).
    - In-order path (listings already populated) → backfill no-op
      (B2 distinguishable _slug suffix retained).
    - Seller path → untouched (C1/C2).
    - Honest empty-state preserved when geo+budget+subtype combo
      has no Active comps (try/catch + 0-rows branch).
    - Tenant header forwarded; multi-tenant pattern preserved.

  LIVE-DOM ALL 3 SURFACES — CLAIMED, UNVERIFIED:
    - EMAIL render via test-render-plan-email-probe + LEAD-PAGE
      render via renderToStaticMarkup(PlanTab) both pass static
      string assertions (E1-E3, L1-L3) using the BACKFILLED data
      from the live route POST. However, per the source-grep-is-
      dead lock (CLAUDE.md), these are NOT the gate. The gate is
      operator real-DOM eyeball on walliam.ca after Vercel deploys
      this commit.
    - IN-CHAT live render against a real Charlie buyer session
      remains the unverified path — the tile-probe (I1) only
      confirms ComparableCard does not regress; it does not drive
      the full search_listings → get_comparables → generate_plan
      flow to confirm the For-Sale block renders.
    - REAL-DEPLOY verify: operator opens walliam.ca, runs a buyer
      flow that previously failed (e.g. a session where Charlie
      skips search_listings), generates the plan, confirms For-
      Sale + Tax-Matched render on all 3 surfaces with real data.
      Until that happens, this fix is **claimed, unverified** for
      the production deploy.

### Named follow-ups (out of scope)

  - Race vs LLM-order detection: a session-replay log would
    distinguish (a) Charlie skipped search_listings vs (c) tool-
    result race. The server backfill defends both; the LLM-order
    issue may still leave the in-chat panel without For-Sale tiles
    even though the email + lead-page now will.
  - Prompt hardening + client-side guard at the POST site remain
    possible future work.
  - Welcome-email dedup-race (recon CHUNK A) — unchanged.


## W-CHARLIE-TAXMATCH-PHOTOS — buyer Tax-Matched tile photos (2026-06-16)

### Defect

  Tax-Matched tiles rendered correctly on all 3 surfaces (in-chat,
  email, admin lead page) — address, price, beds, DOM, band, narration
  all present — but showed the orange-house PLACEHOLDER icon instead of
  real photos. For Sale and Comparable Sold tiles DO show real photos
  (from /api/geo-listings and get_comparables respectively).

### Root cause

  Shared seller-estimator query queryTaxBandSolds (lib/estimator/tax-
  band-sold-query.ts:80) was extracted from home-comparable-matcher-
  sales.ts:1242-1292 verbatim. The seller path renders NO tiles — it
  reads tax/price/beds/dom for SCORING only and produces a number, not
  a photo. So the SELECT had no reason to fetch media.

  Buyer reuses the same query at lib/charlie/buyer-tax-match.ts:198
  and then RENDERS tiles (a new requirement that wasn't flowed into
  the query). The sample mapping at L235-249 hardcoded `media: null`,
  so every Tax-Matched sample reached all 3 render surfaces with no
  media — the surfaces correctly fell through to the placeholder
  branch (they were doing the right thing with empty data).

  DB reality (RECON E in recon/taxmatch-photos.txt): Closed Whitby
  Residential Freehold carries thumbnails at 3,384 of 3,388 (99.9%).
  Identical to Active coverage. Real trreb-image.ampre.ca CDN URLs.
  → QUERY FIX, not HONEST NO-MEDIA, not render bug.

### Fix (3 edits, additive only)

  EDIT #1 — lib/estimator/tax-band-sold-query.ts
    After the SOLD fetch Promise.all, ADDITIVE post-fetch step that
    mirrors app/api/geo-listings/route.ts:128-147 verbatim:
      collect listing.id values from commSales + muniSales
      SELECT listing_id, media_url, order_number FROM media
        WHERE listing_id = ANY(...) AND variant_type='thumbnail'
        ORDER BY order_number ASC
      build {listing_id → first media_url} map
      mutate each row: r.media = [{media_url}] or []
    NO change to DEFAULT_TAX_BAND_SELECT, WHERE, ORDER, LIMIT —
    row set byte-identical. Media is purely an additional property.

  EDIT #2 — lib/charlie/buyer-tax-match.ts:235-249
    Sample mapping: replace `media: null` with
      `media: Array.isArray(row.media) ? row.media : null`
    Reads the attached media from edit #1; honest null when row has
    no media row.

  EDIT #3 — app/charlie/components/ResultsPanel.tsx:749-761
    BuyerTaxMatchInChat comp literal widened with:
      mediaUrl: s.media?.[0]?.media_url || s.media?.[0]?.url || undefined
    Email + admin pass `s` directly so they pick up edit #2 alone;
    only the in-chat projection-into-ComparableCard needed widening.

### Seller no-regression — HARD PROOF

  E1 IMPORT-GRAPH: grep across lib/estimator confirms neither
       home-comparable-matcher-sales.ts NOR condo-comparable-matcher-
       sales.ts imports from tax-band-sold-query. Both retain their
       own inline copy of the query (per the file's own comment at
       lib/estimator/tax-band-sold-query.ts:10-17).

  E2 GIT STATUS: home-comparable-matcher-sales.ts and condo-comparable-
       matcher-sales.ts do not appear in git status —  byte-unchanged
       on disk.

  E3 SELECT BYTE-IDENTITY: all 4 fragments of DEFAULT_TAX_BAND_SELECT
       present in current file unchanged.

  E4 GIT DIFF HEAD: `git diff HEAD -- lib/estimator/home-comparable-
       matcher-sales.ts` and the condo equivalent both return EMPTY.
       This is the strongest possible statement of byte-identity —
       and combined with E1 (no import), it is mathematically
       equivalent to running the seller scoring flow BEFORE and AFTER
       and asserting identical output: the seller code path is the
       same bytes, exercising the same machine code.

### DATA-LAYER VERIFY — scripts/taxmatch-photos-fix-verify.ts (29/29 PASS)

  Runs the REAL deriveBuyerTaxMatch function on the same Whitby
  freehold buyer's matched-listings used by buyer-chunk4-verify.

    A. deriveBuyerTaxMatch — REAL function, Whitby buyer, n=5 matched   8/8
       A1 btm.isEmpty === false                                          PASS
       A2 btm.samples.length === 6                                       PASS
       A3.0-5  all 6 samples carry trreb-image.ampre.ca URLs             6/6
       A5 realCount + nullCount === samples.length                       PASS
       A6 at least one real URL (99.9% Whitby coverage)                  PASS
    B. URLs cross-check as REAL media-table rows                          3/3
       B1-3 each helper_url EXISTS as a thumbnail of its listing          PASS
       NOTE: many listings carry MULTIPLE thumbnail rows per order_
       number (e.g. E13169330 has 67 thumbnails, 2 at order=0). The
       helper picks A real thumbnail (mirrors geo-listings' pattern),
       but the choice is non-deterministic. Upstream data observation.
    C. Honest no-media fallthrough                                        2/2
       C1 no-media row → media = [] (NOT fabricated URL)                  PASS
       C2 !url → tile renderer falls through to placeholder               PASS
    D. Cross-surface same-URL projection (single shaping source)          3/3
       D1 email url === sample url                                        PASS
       D2 admin (BuyerListingTile) url === sample url                     PASS
       D3 in-chat (comp.mediaUrl) url === sample url                      PASS
    E. Seller no-regression                                              5/5
       E1 seller files do NOT import tax-band-sold-query                  PASS
       E2 seller files byte-unchanged on disk (git status)                PASS
       E3 DEFAULT_TAX_BAND_SELECT byte-unchanged (4 fragments)            PASS
       E4a home-comparable-matcher-sales.ts byte-IDENTICAL to HEAD        PASS
       E4b condo-comparable-matcher-sales.ts byte-IDENTICAL to HEAD       PASS
    F. For Sale + Comparable Sold no-regression                          4/4
       F1 app/api/geo-listings/route.ts unchanged                         PASS
       F2 app/api/charlie/route.ts unchanged                              PASS
       F3 lib/email/charlie-plan-email-html.ts unchanged                  PASS
       F4 PlanRenderer.tsx unchanged                                      PASS
    G. Edit-set identity                                                  2/2
       G1 all 3 expected targets in `M` list                              PASS
       G2 no NEW unexpected source files modified                         PASS

  TSC: npx tsc --noEmit → exit 0
  S1:  zero-diff (admin/page, api/chat, agents)
  Pre-existing dirty (predates session, EXCLUDED from commit):
       app/api/charlie/municipalities/route.ts (trailing-newline only)
       scripts/r-w-territory-master-p2-data-phantom-fix.js
       scripts/r-w-territory-master-p4-check-fix.js

  SUMMARY: 29 of 29 PASS.

### STATUS

  DATA LAYER — VERIFIED:
    - deriveBuyerTaxMatch returns 6 samples; each carries a real
      trreb-image.ampre.ca thumbnail URL cross-verified against the
      media table.
    - Honest empty-state preserved when row has no thumbnail
      (the 0.1%): media = [] → tile renders placeholder honestly.
    - Cross-surface same-URL: in-chat / email / admin all derive
      from the SAME sample.media[0].media_url shape (single shaping
      source = buyer-tax-match.ts edit #2).
    - Seller scoring is mathematically guaranteed byte-identical
      BEFORE/AFTER: helper file is byte-unchanged AND seller code
      path doesn't import the edited helper.

  LIVE-DOM ALL 3 SURFACES — CLAIMED, UNVERIFIED:
    - Per the source-grep-is-dead lock (CLAUDE.md), live-DOM photo
      render is the operator's eyeball gate on walliam.ca post-
      deploy. This verify harness asserts the DATA reaches each
      surface with a real URL; whether the <img> actually paints
      is the operator's eyeball gate.
    - REAL-DEPLOY verify: operator opens walliam.ca, runs the
      Whitby buyer flow, confirms Tax-Matched tiles render REAL
      photos on all 3 surfaces (in-chat, email, admin lead page).
      Until that happens, this fix is **claimed, unverified** for
      production.

### Named observations (out of scope)

  - Many listings carry multiple thumbnail rows per order_number
    (e.g. E13169330 has 67 thumbnails, 2 at order=0). Both helper
    and geo-listings pick non-deterministically among same-order
    rows. Affects For Sale too — pre-existing upstream data issue,
    not introduced by this fix. Tracked here for visibility.

### Commit

  W-CHARLIE-TAXMATCH-PHOTOS: a589f10


## W-CHARLIE-INCHAT-CONVERGENCE — in-chat hydrates from backfill (2026-06-16)

### Defect

  In-chat Charlie panel was missing the For-Sale block AND the Tax-
  Matched block on sessions where Charlie called get_comparables
  before search_listings (or where search_listings never fired in-
  session). Email + admin lead BOTH rendered the same blocks WITH
  photos correctly off persisted plan_data — the W-CHARLIE-BUYER-
  FORSALE-BACKFILL fix from 9de2112 repaired those PERSISTED
  surfaces. The recon (recon/inchat-forsale-taxmatch.txt) confirmed
  PRE-EXISTING IN-CHAT-ONLY: not a regression from 7214b21/9de2112/
  a589f10 (in-chat render gates byte-identical across all three).
  The in-chat panel is purely client-session-driven; the server
  backfill writes only to lead.plan_data, which the in-chat panel
  never reads.

### Root cause

  3-surface source divergence:
    • IN-CHAT  reads state.listingGroups (search_listings tool
      result) and renders BuyerTaxMatchInChat as a sibling INSIDE
      the comparables block branch (which gated on get_comparables
      tool firing in-session).
    • EMAIL    reads persisted plan_data.topListings + plan_data.
      buyerTaxMatch.
    • LEAD     same as email.
  The 9de2112 backfill repaired persisted plan_data for failing-
  path sessions but had no path back to the in-chat panel — the
  plan-email response returned only userEmailSent outcomes, not
  the backfilled artifacts the in-chat panel needed.

### Fix (3 declared edits + 1 latent-bug fix surfaced by verify)

  EDIT 1 — app/api/charlie/plan-email/route.ts response widening
    Additive widening (buyer-only): expose effectiveListings as
    backfilledListings and buyerTaxMatch as backfilledTaxMatch.
    Seller plans get `undefined` for these → JSON.stringify omits
    them → seller response shape byte-identical (5 original fields
    only). The 5 original fields (success, userEmailSent,
    userEmailReason, chainEmailSent, chainEmailReason) preserved
    exactly in all paths.

  EDIT 2 — app/charlie/hooks/useCharlie.ts .then hydration handler
    In the existing plan-email response handler, EMPTY-ONLY hydrate
    the For-Sale block from response.backfilledListings using the
    SAME state-update path search_listings uses (push 'listings'
    block + set listingGroups). Guard:
      if (s.listingGroups.length > 0) return s   // strict no-op
    The hoisted BuyerTaxMatchInChat (Edit 3) self-fetches on
    listingGroups change, so seeding listingGroups is sufficient
    to wake the tax-match block too — no extra state plumbing.

  EDIT 3 — app/charlie/components/ResultsPanel.tsx single-render hoist
    Hoist BuyerTaxMatchInChat OUT of the comparables-block branch
    (~L466-473 sibling REMOVED). Add a TOP-LEVEL single invocation
    just below the conversation blocks (wrapped in an IIFE that
    computes budgetMax + avgConcessionPct from analytics + plan).
    Single invocation site → guaranteed single render regardless of
    which path (in-session OR hydrate) provided the listings.
    BuyerTaxMatchInChat self-gates: returns null when btm is null
    and not loading. Non-buyer / no-listingGroups sessions render
    no DOM here.

  EDIT 4 (added per operator approval) —
       lib/estimator/tax-band-sold-query.ts media-join chunking
    The convergence verify surfaced a latent bug in W-CHARLIE-
    TAXMATCH-PHOTOS's helper (a589f10): single-shot
    .in(allListingIds, ...) with the FULL muni-pool (limit=500
    SOLD comps) produces ~18 KB URI that exceeds PostgREST's
    transport cap → fetch throws `TypeError: fetch failed` →
    mediaRows is null → all sampled comps silently lose photos.
    The original verify (5 matched listings → narrow band → small
    pool) didn't hit the threshold; convergence verify (10 backfilled
    listings → wider band → 500-cap pool) did.

    Fix: paginate .in() in CHUNK_SIZE=200 batches, union responses
    into a single thumbnailMap. Strictly additive: row count, row
    order, and the FIRST-thumbnail-per-listing semantics byte-
    identical to original a589f10. Also added error logging via
    the previously-discarded `error` field — failures now surface
    in logs instead of silently dropping photos.

    Required for the convergence promise: in-chat hydration uses
    the SAME plan-email backfill the persisted surfaces use, so
    photos must reach all 3 surfaces uniformly. Without this sub-
    fix, wide-pool buyer sessions would show placeholders on email
    + lead too. The fix preserves the seller's byte-identity (the
    home/condo seller matchers do not import this helper).

### No-regression — HARD ASSERT proof

  EMAIL + LEAD — byte-identical:
    lib/email/charlie-plan-email-html.ts                   → git diff HEAD empty
    components/admin-homes/lead-workbench/PlanRenderer.tsx → git diff HEAD empty
    Inputs they read (plan_data.topListings + plan_data.buyerTaxMatch)
    populate the SAME way as before — Edit 1 just exposes the same
    data in the response.

  SELLER — byte-identical:
    Response on seller POSTs has the 5 original fields exactly
    (success, userEmailSent, userEmailReason, chainEmailSent,
    chainEmailReason). New fields are `undefined` → JSON omits.
    home-comparable-matcher-sales.ts   → git diff HEAD empty
    condo-comparable-matcher-sales.ts  → git diff HEAD empty
    Neither imports tax-band-sold-query.ts (per file comment +
    grep + import-graph proof from W-CHARLIE-TAXMATCH-PHOTOS).

  IN-ORDER IN-CHAT — byte-identical:
    Pure-logic simulation of the .then hydration (Section B):
      empty state    + backfill    → state hydrated (B1.1, B1.2)
      non-empty state + backfill   → state JSON byte-identical (B2.1-3)
      empty state    + no backfill → state byte-identical (B3.1)
    The in-order path (search_listings tool fired) populates
    listingGroups before plan-email's .then resolves; the guard
    `s.listingGroups.length > 0` ⇒ strict no-op.

  IN-CHAT SINGLE-RENDER — proved by source:
    exactly ONE `<BuyerTaxMatchInChat` invocation in ResultsPanel
    (C1); old comparables-branch sibling REMOVED (C2); top-level
    invocation wrapped in IIFE with budgetMax + avgConcessionPct
    (C3). Single invocation → cannot double-render.

### DATA-LAYER VERIFY — scripts/inchat-convergence-verify.ts (48/48 PASS)

  Live POST + DB readback + pure-logic state-machine simulation +
  source-level proofs:

    A. Edit 1 — response widening (live POST, 3 scenarios)
       A1 buyer failing-path (listings=[]):
          A1.1-6   5 original fields present                          6/6
          A1.7-10  backfilledListings: 10 real Whitby Active          4/4
          A1.11-14 backfilledTaxMatch: 6 samples + real trreb URLs    4/4
       A2 buyer in-order (listings populated):
          A2.1-4   backfill no-op + tax-match derived                 4/4
       A3 seller plan:
          A3.1-5   no buyer-only fields; 5 original preserved         5/5
    B. Edit 2 — hydration guard (pure-logic simulation)              6/6
    C. Edit 3 — ResultsPanel single-render                            4/4
    D. Cross-surface convergence (DB readback)                        5/5
       D5     persisted samples carry REAL photos (6/6 trreb-image URLs) PASS
    E. Byte-identity (email + lead + seller + helper-additive)
       E1-3   email-html + PlanRenderer + buyer-tax-match unchanged   3/3
       E4     tax-band-sold-query.ts additive chunking — 11 SOLD+media
              predicates preserved + CHUNK_SIZE added                  PASS
       E5-6   home + condo comparable-matcher byte-identical          2/2
       E7-8   geo-listings + charlie route byte-identical              2/2
    F. Edit-set identity                                              2/2

  TSC: npx tsc --noEmit → exit 0
  S1:  zero-diff (admin/page, api/chat, agents)
  Pre-existing dirty (predates this session, EXCLUDED from commit):
       app/api/charlie/municipalities/route.ts
       scripts/r-w-territory-master-p2-data-phantom-fix.js
       scripts/r-w-territory-master-p4-check-fix.js

  SUMMARY: 48 of 48 PASS.

### STATUS

  DATA LAYER + STATE-MACHINE — VERIFIED:
    - Failing-path POST returns backfilledListings (10 real Whitby
      Active rows) + backfilledTaxMatch (6 samples, all carrying
      trreb-image.ampre.ca URLs).
    - In-order POST returns backfill no-op (response listings ===
      input listings); client hydration guard makes it a strict
      no-op (state JSON byte-identical).
    - Seller POST returns the 5 original fields, no buyer-only
      additions — seller response shape byte-identical.
    - DB persistence matches response (D2/D4) and persists photos
      (D5: 6/6 samples carry real URLs).
    - tax-band-sold-query chunking fix prevents silent photo
      regression on wide-pool sessions across all 3 surfaces.

  LIVE-DOM IN-CHAT — CLAIMED, UNVERIFIED:
    - Per source-grep-is-dead lock (CLAUDE.md), live-DOM in-chat
      render (For-Sale block + tax-match block WITH photos appearing
      in the panel) is the operator's eyeball gate on walliam.ca
      post-deploy.
    - REAL-DEPLOY verify: operator opens walliam.ca, runs a buyer
      flow that skips search_listings (e.g. asks Charlie to "give
      me my plan" without browsing), generates the plan, confirms
      For-Sale tiles + Tax-Matched tiles appear IN-CHAT with real
      photos, same listings as the email + lead surfaces show.
      Until that happens, this fix is **claimed, unverified** for
      production.

### Named observation

  - tax-band-sold-query.ts is buyer-only (per file comment + import-
    graph). The chunking fix (Edit 4) is additive to that helper;
    seller home/condo comparable-matchers retain their own inline
    copy of the tax-band query and DO NOT pull this helper. Seller
    behavior is byte-identical.

### Commit

  W-CHARLIE-INCHAT-CONVERGENCE: 06dc1bd


## W-CHARLIE-INCHAT-TAXMATCH-HYDRATE — in-chat tax-match direct-hydrate (2026-06-16)

### Defect

  After 06dc1bd shipped, operator reported live walliam.ca: in-chat
  For-Sale rendered WITH photos (convergence's listings-hydration
  worked), Comparable Sold rendered WITH photos (in-session
  get_comparables fired), but Tax-Matched was ABSENT from the in-chat
  DOM. Email + admin lead rendered Tax-Matched correctly off persisted
  plan_data. So data was correct; the in-chat tax-match RENDER chain
  did not produce DOM.

### Root cause

  BuyerTaxMatchInChat MOUNTED unconditionally per the W-CHARLIE-INCHAT-
  CONVERGENCE Edit 3 hoist (IIFE with no gate). But it rendered NULL
  because its self-fetch to /api/charlie/buyer-tax-match never resolved
  with populated btm on the failing-path session (silent-fail; could
  be auth, network, race — not deterministically diagnosable from
  static trace). The chain has multiple silent-failure modes:
    - non-2xx response swallowed by .catch
    - response shape with j.buyerTaxMatch null
    - component unmount-while-pending
    - thrown error in the response pipeline
  Any one of them leaves btm null + loading false → return null.

  Critical realization: response.backfilledTaxMatch from Edit 1 of the
  convergence commit was ALREADY reaching the client (verified in the
  prior commit's data-layer harness: A1.11-A1.14 + D5 PASS, 6/6
  samples carry real trreb-image URLs). But useCharlie's .then handler
  only consumed `backfilledListings`, ignoring `backfilledTaxMatch`.
  The fix: hydrate tax-match DIRECTLY from the response we already
  have, bypassing the silently-failing self-fetch on the failing path.

### Fix (4 edits, 3 source files)

  EDIT 1 — app/charlie/hooks/useCharlie.ts state shape
    Add `backfilledTaxMatch: BuyerTaxMatch | null` to CharlieState
    interface + INITIAL_STATE (null). Additive only; no existing
    field changed. Imports BuyerTaxMatch type from
    @/lib/charlie/buyer-tax-match.

  EDIT 2 — app/charlie/hooks/useCharlie.ts .then handler
    Alongside the existing _bfl listings hydration (UNCHANGED), add a
    parallel _bfm dispatch with empty-only semantics captured PRE-
    dispatch via _preHydrateEmpty = stateRef.current.listingGroups
    .length === 0. Without that capture, the sequential setStates
    would see the post-_bfl state and the _bfm guard would never
    short-circuit on the in-order path. _preHydrateEmpty preserves
    "in-session path leaves backfilledTaxMatch null".

  EDIT 3 — prop-drill via CharlieOverlay + ResultsPanel
    CharlieOverlay.tsx <ResultsPanel> mount: add
      backfilledTaxMatch={state.backfilledTaxMatch}
    ResultsPanel.tsx Props: add
      backfilledTaxMatch?: BuyerTaxMatch | null
    Destructure, pass to the hoisted BuyerTaxMatchInChat invocation:
      initialBtm={backfilledTaxMatch ?? null}
    Prop-drill only; no logic in the intermediates.

  EDIT 4 — ResultsPanel.tsx BuyerTaxMatchInChat consume + bypass
    Added `export` keyword (so the render-gate verify harness can
    mount it in isolation — the only way to assert the block NODE
    appears in the rendered DOM).
    Added initialBtm?: BuyerTaxMatch | null to props.
    PRE-SEED useState:
      const [btm, setBtm] = useState<BuyerTaxMatch | null>(initialBtm ?? null)
    This is the line that produces the FIRST-PAINT DOM on the
    hydration path.
    BYPASS self-fetch when initialBtm provided:
      useEffect(() => {
        if (initialBtm) {
          setBtm(prev => prev ?? initialBtm)
          setLoading(false)
          return
        }
        // ...existing self-fetch logic unchanged...
      }, [listingGroups, geoContext, initialBtm])
    Functional setBtm(prev => prev ?? initialBtm) handles the late-
    arrival case (initialBtm transitions null → populated after
    mount). The `prev ??` form refuses to clobber a btm already
    populated by an earlier self-fetch (in-session path's behavior
    preserved). Deps include initialBtm so late-arrival triggers
    re-evaluation.

### No-regression — HARD ASSERT

  IN-SESSION IN-CHAT path (byte-identical to today):
    state.backfilledTaxMatch stays null in the in-session path (the
    _preHydrateEmpty guard short-circuits when listingGroups was non-
    empty pre-dispatch). → initialBtm prop is null → useState(null)
    → useEffect runs the same code path as today (the
    `if (initialBtm)` early-return doesn't fire) → matched.length,
    sig, lastSigRef, fetch all behave EXACTLY as today.

  EMAIL + LEAD + SELLER (no server change at all):
    All 4 edits are client-state only. Server code unchanged.
    git diff HEAD on the following = empty:
      lib/email/charlie-plan-email-html.ts
      components/admin-homes/lead-workbench/PlanRenderer.tsx
      lib/charlie/buyer-tax-match.ts
      lib/estimator/tax-band-sold-query.ts (Edit 4 from prior commit holds)
      lib/estimator/home-comparable-matcher-sales.ts
      lib/estimator/condo-comparable-matcher-sales.ts
      app/api/charlie/plan-email/route.ts
      app/api/charlie/buyer-tax-match/route.ts
      app/api/geo-listings/route.ts
      app/api/charlie/route.ts

  FOR SALE + COMPARABLE SOLD IN-CHAT blocks (UNCHANGED render path):
    For Sale renders from listingGroups (Edit-2 backfill hydration
    from prior commit, unchanged in this commit). Comparable Sold
    renders from state.blocks 'comparables'-type block (unchanged).
    Neither touched by this commit's 4 edits.

### RENDER-GATE VERIFY — scripts/inchat-taxmatch-hydrate-verify.ts (31/31 PASS)

  Render method: react-dom/server.renderToStaticMarkup on the REAL
  EXPORTED BuyerTaxMatchInChat function. Effects do NOT run in
  static markup, so the useState(initialBtm ?? null) PRE-SEED is the
  line that must produce DOM on FIRST PAINT — the gate that was
  missing every prior round.

    0.0  BuyerTaxMatchInChat exported (typeof === function)        PASS

    1. HYDRATION PATH (initialBtm populated, failing-path session):
       1.1  hydration markup is NOT empty (BLOCK NODE EXISTS)        PASS
       1.2  "Tax-Matched" header present                              PASS
       1.3  heading shows "6 sold comps"                              PASS
       1.4  tax-band footer renders ($4,218 – $6,328/yr)              PASS
       1.5  6 trreb-image.ampre.ca URL hits                           PASS
       1.6  6 <img> tags (one per sample)                             PASS
       1.7  sample addresses survive to markup                        PASS

    2. EMPTY PATH (initialBtm null, no listingGroups):
       2.1  returns null, zero markup                                 PASS

    3. ISEMPTY PATH (initialBtm.isEmpty=true, honest empty-state):
       3.1  "0 sold comps" heading rendered                            PASS
       3.2  reason text surfaced (no fabricated tiles)                 PASS
       3.3  zero <img src="trreb-image..."> tags                       PASS

    4. CONVERGENCE (deterministic render):
       4.1  same btm → same markup byte-by-byte                       PASS

    5. SOURCE-LEVEL (in-session byte-identity protection):
       5.1  `export function BuyerTaxMatchInChat` present              PASS
       5.2  initialBtm typed `BuyerTaxMatch | null`                    PASS
       5.3  useState pre-seeded with `initialBtm ?? null`              PASS
       5.4  useEffect bypass `if (initialBtm) … return`                PASS
       5.5  useEffect deps include initialBtm                          PASS
       5.6  self-fetch logic unchanged (lastSigRef + endpoint URL)    PASS

    6. BYTE-IDENTITY (10 files git diff HEAD empty)                 10/10
    7. EDIT-SET (exactly 3 declared targets in M list)              2/2

  TSC: npx tsc --noEmit → exit 0
  S1: zero-diff (admin/page, api/chat, agents)
  Pre-existing dirty (predates session, EXCLUDED from commit):
    app/api/charlie/municipalities/route.ts
    scripts/r-w-territory-master-p2-data-phantom-fix.js
    scripts/r-w-territory-master-p4-check-fix.js

  SUMMARY: 31 of 31 PASS.

### STATUS

  RENDER GATE — VERIFIED:
    The Tax-Matched section NODE is asserted present in the static
    markup whenever initialBtm has populated data. This is the
    gate that every prior round of fixes left unverified.

  LIVE-DOM ALL 3 SURFACES — CLAIMED, UNVERIFIED:
    Per source-grep-is-dead lock (CLAUDE.md), the live-DOM eyeball
    on walliam.ca is the final gate. Operator opens the failing-path
    session (e.g. comparables-first, no search_listings), generates
    the plan, confirms the Tax-Matched block now appears in-chat
    with the same 6 samples + photos email + lead show.

### Named follow-up (out of scope for this commit)

  The in-session self-fetch silent-fail path remains latent. The
  hydration path now bypasses it, but a session that DID fire
  search_listings in-order (and thus has listingGroups populated
  pre-POST) still depends on the self-fetch to /api/charlie/buyer-
  tax-match. If that fetch silently fails on the in-order path
  too, in-chat tax-match would be absent (email + lead still fine
  because they read persisted plan_data). Belt-and-suspenders
  future work:
    - Surface fetch errors visibly (loading=false + error-state UI
      instead of silent null on .catch)
    - Server-side log of /api/charlie/buyer-tax-match outcomes for
      audit trail when in-chat block is blank
    - Apply the SAME direct-hydrate pattern to the in-session path:
      pre-seed initialBtm from a server-side derivation embedded in
      get_comparables tool output. Eliminates the self-fetch round-
      trip entirely.

### Commit

  W-CHARLIE-INCHAT-TAXMATCH-HYDRATE: 384fa51


## W-CHARLIE-INCHAT-TAXMATCH-ORDER — Tax-Matched immediately after Comparable Sold (2026-06-16)

### Defect

  After 384fa51 shipped the W-CHARLIE-INCHAT-TAXMATCH-HYDRATE fix,
  operator confirmed: in-chat Tax-Matched NOW renders WITH photos
  (hydrate works). Only remaining issue is DOM ORDER. Tax-Matched
  appears AFTER the plan card (which contains the scheduler /
  AppointmentForm + AI Disclaimer) because the W-CHARLIE-INCHAT-
  CONVERGENCE Edit-3 hoist placed BuyerTaxMatchInChat as a sibling
  of blocks.map() output — which means it renders AFTER the last
  in-map block (the plan block).

  Desired order matches email + lead:
    Comparable Sold → Tax-Matched → Plan (PlanDocument + scheduler) → AI Disclaimer

### Root cause

  The W-CHARLIE-INCHAT-CONVERGENCE Edit-3 hoist removed
  BuyerTaxMatchInChat from inside the comparables-block branch and
  placed it at the top-level outside blocks.map(). That fix solved the
  W-CHARLIE-INCHAT-FORSALE-TAXMATCH-MISSING bug (block didn't mount
  when no comparables block existed) but introduced an unintended
  ordering shift: tax-match renders AFTER the entire map completes,
  which is AFTER the plan block content.

### Decision log

  Recon (recon/inchat-taxmatch-order.txt) presented two options:
    (i) Render inside comparables branch + keep hoist as fallback
        gated to no-comparables sessions. Mutual exclusion → exactly
        ONE invocation per render. Smaller diff, preserves plan
        block's chronological position.
    (ii) Extract plan-block render out of blocks.map() and place
         AFTER the hoist. Larger surface, conversation-order
         regression (post-plan blocks would render BEFORE plan).

  Operator decision: OPTION (i).

  The directive language "do NOT nest it back inside the comparables
  branch or gate it" was reconciled with the INTENT ("don't reintroduce
  mount-null by tying render to comparables-block existence"). Option
  (i) places an INVOCATION inside the comparables branch but PRESERVES
  unconditional mount via the hoist fallback for no-comparables
  sessions — the mount-null protection holds via mutual exclusion, not
  via single-site. Intent over letter.

### Fix (1 file, ~10-line additive diff)

  EDIT 1 — ResultsPanel.tsx comparables-block branch return
    AFTER the ComparableCard tile list (the
    `<div>{block.listings.map(... <ComparableCard/>)}</div>`), add:
      <BuyerTaxMatchInChat
        listingGroups={listingGroups}
        geoContext={geoContext}
        budgetMax={_budgetMax}
        avgConcessionPct={_avgConc}
        initialBtm={backfilledTaxMatch ?? null}
      />
    The _budgetMax and _avgConc are already in scope (declared at the
    top of the comparables-block branch for buildCompSoldNarration).
    UNGATED by branch-local data — the component self-gates internally.

  EDIT 2 — ResultsPanel.tsx top-level hoist gate
    Wrap the existing hoist IIFE with a mutual-exclusion gate:
      {!(blocks || []).some((b: any) => b.type === 'comparables') && (() => {
        // ...existing IIFE body unchanged...
      })()}
    Comparables present → branch renders tax-match, hoist short-
    circuits. No comparables → branch never runs, hoist renders.

### No-regression — HARD ASSERT

  SINGLE INVOCATION:
    - Comparables-present render: 1 "Tax-Matched" header in markup
      (branch fires, hoist gated off).
    - No-comparables render: 1 "Tax-Matched" header (hoist fires,
      branch never enters because no 'comparables'-type block).
    - Never zero, never two → mutual exclusion holds.

  ORDER (comparables-present buyer session):
    Index in static markup:
      "Comparable Sold": 6096
      "Tax-Matched":     8399
      "AI Disclaimer":  35821
    Tax-Matched is AFTER Comparable Sold and BEFORE the plan block
    content (PlanDocument + scheduler + disclaimer).

  MOUNT-NULL FIX INTACT (no-comparables / hydration path):
    Tax-Matched STILL renders via the hoist with all 6 sample URLs
    populated. The W-CHARLIE-INCHAT-TAXMATCH-HYDRATE direct-hydrate
    fix survives — backfilledTaxMatch flows through to initialBtm at
    BOTH invocation sites identically.

  EMAIL + LEAD + SELLER + OTHER PATHS:
    Only ResultsPanel.tsx modified in this commit. 10 byte-identity
    files git diff HEAD = empty (charlie-plan-email-html, PlanRenderer,
    buyer-tax-match.ts, tax-band-sold-query.ts, both seller matchers,
    plan-email + buyer-tax-match routes, useCharlie.ts, CharlieOverlay).

  CONVERSATION ORDER PRESERVED:
    Plan block stays in blocks.map() — no extraction, no rearrangement.
    Any future post-plan blocks render in their natural chronological
    position after the plan block. No regression on the "rendered in
    conversation order, never overwritten" contract.

### RENDER-GATE + ORDER VERIFY — scripts/inchat-taxmatch-order-verify.ts (30/30 PASS)

  Render method: react-dom/server.renderToStaticMarkup on the REAL
  default-exported ResultsPanel. Exercises blocks.map() + hoist
  together so DOM order can be asserted via string-index positions
  of section headers.

    0.0  ResultsPanel exported as default                          PASS

    SECTION 1 — Comparables-present:
      1.1  exactly ONE "Tax-Matched" header (single invocation)    PASS
      1.2  "Comparable Sold" header present (idx=6096)              PASS
      1.3  "Tax-Matched" header present (idx=8399)                  PASS
      1.4  Tax-Matched AFTER Comparable Sold (8399 > 6096)          PASS
      1.5  Tax-Matched BEFORE AI Disclaimer (8399 < 35821)          PASS
      1.6  all 6 sample URLs in markup (tiles with photos)          PASS
      1.7  Comparable Sold "2 found" count present                  PASS

    SECTION 2 — No-comparables (hoist fires, mount-null fix intact):
      2.1  exactly ONE "Tax-Matched" header                         PASS
      2.2  NO "Comparable Sold" header                              PASS
      2.3  all 6 sample URLs present (mount-null fix intact)        PASS

    SECTION 3 — Mutual exclusion:
      3.1  with-comp render: 1 Tax-Matched                          PASS
      3.2  no-comp render:   1 Tax-Matched                          PASS
      3.3  never zero, never two                                    PASS

    SECTION 4 — Source-level (gate + branch invocation):
      4.1  hoist gated with !(blocks||[]).some(b => 'comparables')  PASS
      4.2  exactly 2 <BuyerTaxMatchInChat invocation sites          PASS
      4.3  both sites pass `initialBtm={backfilledTaxMatch ?? null}` PASS
      4.4  W-CHARLIE-INCHAT-TAXMATCH-ORDER markers present          PASS

    SECTION 5 — Byte-identity (10 files unchanged)                10/10
    SECTION 6 — Edit-set identity                                  2/2

  TSC: npx tsc --noEmit → exit 0
  S1: zero-diff (admin/page, api/chat, agents)
  Pre-existing dirty (predates session, EXCLUDED from commit):
    app/api/charlie/municipalities/route.ts
    scripts/r-w-territory-master-p2-data-phantom-fix.js
    scripts/r-w-territory-master-p4-check-fix.js

  SUMMARY: 30 of 30 PASS.

### STATUS

  ORDER + single-invocation — VERIFIED via static markup index positions:
    Comparable Sold (6096) → Tax-Matched (8399) → AI Disclaimer (35821).
    Mutual exclusion proven in both scenarios.

  LIVE-DOM IN-CHAT order — CLAIMED, UNVERIFIED:
    Per source-grep-is-dead lock (CLAUDE.md), the live-DOM eyeball on
    walliam.ca is the final gate. Operator opens a comparables-present
    buyer session, confirms Tax-Matched now sits immediately below
    Comparable Sold tiles, BEFORE the plan card / scheduler / AI
    Disclaimer — matching email + lead order.

### Commit

  W-CHARLIE-INCHAT-TAXMATCH-ORDER: fe6228f
