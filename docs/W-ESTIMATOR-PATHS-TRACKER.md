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
