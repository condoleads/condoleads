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
