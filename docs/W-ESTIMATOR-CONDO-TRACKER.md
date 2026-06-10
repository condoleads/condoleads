W-ESTIMATOR-CONDO — Condo Workstream Tracker (sibling of W-ESTIMATOR-RAG)
Status: v1 — DESIGN LOCKED (condo spine) + SYSTEM-BOUNDARY LOCKED + PORTS-FROM-HOMES INVENTORY + CONDO-SPECIFIC INVENTORY. NOTHING BUILT — no code touched, no design ships without operator okay.

Started: 2026-06-10
Owner: Shah
Predecessor: W-ESTIMATOR-RAG (homes) — this is the parallel condo workstream, sibling-not-child. The two are separate sources of truth, one per workstream.

Why this exists (separate from homes)
Condos and homes share the strategic estimator goal — accurate deterministic core; AI as optional commentary — but the data shape, the value drivers, and the System 1/System 2 boundary differ enough that bundling them into one tracker is what produced the lease-mis-pooling drift on homes. Each workstream gets its own tracker so design decisions don't bleed sideways. Cross-references back to W-ESTIMATOR-RAG where homes pieces port directly.

================================================================================
v1 — SYSTEM BOUNDARY (LOCKED 2026-06-10)
================================================================================

The existing condo estimator code (verified this session) is SHARED System 1 + System 2 infrastructure. Per CLAUDE.md Rule Zero ("System 1 — legacy condoleads.ca agent condo sites at /admin, app/api/chat/*, agent_buildings. Maintenance-only. Never modify. Never add features."), this workstream CANNOT modify the existing files. It builds parallel System 2-only files beside them, mirroring the home-* pattern already established.

Frozen (shared S1+S2 — never modified by this workstream):
- lib/estimator/comparable-matcher-sales.ts
- lib/estimator/comparable-matcher-rentals.ts
- lib/estimator/resolve-adjustments.ts
- lib/estimator/statistical-calculator.ts (shared math; touched only if absolutely required and only via additive functions on a new export)
- app/estimator/actions/estimate-sale.ts
- app/estimator/actions/estimate-rent.ts
- lib/estimator/types.ts (the existing UnitSpecs / ComparableSale / MatchTier types)

Build-fresh (System 2-only condo, sibling to the home-* set):
- lib/estimator/condo-comparable-matcher-sales.ts          (the new S2 sale matcher)
- lib/estimator/condo-comparable-matcher-rentals.ts        (the new S2 lease matcher)
- lib/estimator/resolve-condo-adjustments.ts               (the new S2 tenant-scoped adjustment resolver)
- app/estimator/actions/estimate-condo-sale.ts             (new S2 entry)
- app/estimator/actions/estimate-condo-rent.ts             (new S2 entry)
- (additional types lives in or beside types.ts as new exports — never modifying existing exports)

CTA threading: tenant-gated branch (leaning) — see NAMED-OPEN. The shared CTAs (PropertyEstimateCTA.tsx, EstimatorBuyerModal.tsx, EstimatorBuyer.tsx, EstimatorSeller.tsx) are reached from BuildingPage.tsx, which already serves both System 1 (condoleads agent subdomains) and System 2 (walliam tenant) — documented "shared exception" in CLAUDE.md. The S2 condo workstream will branch inside the existing CTAs on tenant resolution (call new estimate-condo-*.ts when tenant present, fall through to the existing shared estimate-*.ts when null). This is a small surgical edit to a shared file, defensible under "tenant identity is derived per request" — the existing CTA already accepts tenant-aware props; only the action call gets branched.

================================================================================
v1 — RECON FINDINGS (2026-06-10, read-only one-pass)
================================================================================

A) CONDO POPULATION (mls_listings, property_type = 'Residential Condo & Other')
- Total all-time: 506,764
- With building_id: 414,400 (81.8%)
- Without building_id (unattached): 92,364 (18.2%)
- Recent 3mo closed SALE cohort (n=1,326): building_id fill 95%
- Recent 3mo closed LEASE cohort (n=3,674): building_id fill 97%
The ~18% all-time unattached cohort is the dominant accuracy gap — the existing matcher hard-fails when subject.buildingId is null (line 38 of comparable-matcher-sales.ts: .eq('building_id', specs.buildingId)). Even on recent data, 3-5% of subjects can't start the match.

B) BUILDINGS → COMMUNITY LINK (the foundational fall-through hop)
- buildings rows total: 9,835
- With community_id: 9,347 (95.0%)
A building → community fall-through is feasible — only 5% of buildings have no community to fall back to.

C) RECENT 3mo CLOSED CONDO FIELD FILL (n=1,326 sale / 3,674 lease)
                            SALE   LEASE
  parking_total              100%   100%
  locker                     100%   100%
  association_fee            100%     2%   ← SALE-only signal
  living_area_range          100%   100%
  tax_annual_amount          100%     0%   ← SALE-only signal (h8 port lane)
  building_id                 95%    97%
  furnished                    —    100%   ← lease segmentation
  lease_term                   —    100%   ← lease segmentation
  portion_property_lease       —    100%   ← lease segmentation (semantic caveat below)
  rent_includes                —    100%   ← lease score nudge

D) ADJUSTMENTS TABLE STATE (408 rows total)
  Scope distribution:
    by_building     50
    by_community   239
    by_municipality 97
    by_area         21
  Column fill:
    parking_value_sale (manual override)        1/408 (~0%)
    parking_value_lease (manual override)       1/408 (~0%)
    parking_sale_weighted_avg (computed SALE)   30/408 (~7%)        ← SPARSE
    parking_lease_calculated (computed LEASE)  407/408 (~100%)      ← CLEAN
    locker_sale_calculated                       0/408 (0%)         ← NOT computed
    locker_lease_calculated                      0/408 (0%)         ← NOT computed
Lease parking is the clean filled field. Sale parking is sparse. Locker value (both sides) has no pipeline output at all — the data isn't being produced.

E) EXISTING CONDO MATCHER CURRENT STATE
- Hard-locked to subject.buildingId. NO geo cascade (no fallback to community / muni / area).
- 7-tier within-building: BINGO → BINGO-ADJ → RANGE → RANGE-ADJ → MAINT → MAINT-ADJ → CONTACT
  - BINGO: bed + bath + exact sqft ±10% + parking + locker
  - RANGE: bed + bath + same LAR + parking + locker
  - MAINT (sale only): bed + bath + assoc_fee ±20% + parking + locker
  - ADJ variants: drop parking/locker requirement, apply $-adjustment per missing space
- Lease matcher is identical structure minus MAINT.
- Zero lease segmentation (furnished / lease_term / portion / rent_includes are never read).
- Two-year window. Strict bed AND bath gate.

F) SCHEMA-DRIFT BUG IN EXISTING RESOLVER (filed as named-open)
resolve-adjustments.ts reads column parking_sale_calculated, but that column does not exist in the adjustments table (the actual computed-SALE column is parking_sale_weighted_avg). The current code falls through to the $50,000 hardcoded default on every condo SALE estimate, even where computed data exists. The new System 2 resolver will read the correct column from day 1; the existing shared resolver fix is a separate Rule-Zero call (it's a real defect, but touching it is a System 1 surface).

================================================================================
v1 — LOCKED DESIGN — CONDO SPINE (re-rooted from homes)
================================================================================

The homes 4-tier geo cascade is the architectural backbone. Condo re-roots the foundational tier from "exact street/odd-even" to "exact building" because the building is the strongest semantic anchor a condo has — units in the same building share elevators, amenities, maintenance regime, exposure category, and a price floor that the building's reputation drives.

GEO CASCADE (locked):
  Platinum = same BUILDING (subject.building_id matches comp building_id)
  Gold     = same COMMUNITY
  Silver   = same MUNICIPALITY
  Bronze   = same AREA
  Below Bronze → CONTACT

WITHIN-TIER MATCHING (locked):
The existing 7-tier sub-tier model (BINGO / BINGO-ADJ / RANGE / RANGE-ADJ / MAINT / MAINT-ADJ) becomes the within-Platinum sub-tier matcher — that's what same-building unit comparison already is. Gold / Silver / Bronze fall back to sqft-range + bed + bath as the within-tier match, because the building-specific signals (assoc_fee, parking spec, locker spec) lose meaning across buildings.

BUILDING-LESS PATH (locked — new behavior):
When subject.building_id is null (the 3-18% cohort the existing matcher hard-fails), skip Platinum and start at Gold. This requires the subject's community_id to be resolvable from address-level geo (the same resolver chain the homes path uses). If community_id is unresolvable, fall to Silver / Bronze in turn.

PRICING:
- Within-building (Platinum): sqft-range similarity is the dominant signal (condo sqft data is plentiful — LAR 100%, numeric SFS ~14%). Existing 7-tier within-building model is the pricing engine.
- Across buildings (Gold / Silver / Bronze): geo-signal pricing with sqft + bed + bath as the alignment. Score-nudge tier-band shape (h7 / h8 lineage) determines comp ordering.

================================================================================
v1 — PORTS FROM HOMES (locked)
================================================================================

PORT-DIRECT (homes → condo S2, minimal reshape):

  h7 4-tier geo cascade pattern (homes' Platinum→Gold→Silver→Bronze with sub-tier
  matching inside each tier). Re-root Platinum from "exact street/odd-even" to
  "exact building". Gold/Silver/Bronze stay community → muni → area. Existing
  homes structure (geoSubTier function, applyTypeGates within each tier) is the
  template; condo equivalents drop in the same shape with condo-specific
  predicates.

  h8 tax similarity score band (SALE only, same-muni gated, ±1 tax_year gated,
  silent-omit on missing, sliding 0→15 pts, band default 20%). Condo tax fill
  is 100% on SALE / 0% on LEASE — mirrors homes exactly. Same structure, same
  TAX_BAND_PCT env knob (default 0.20). Reorders within-pool, never gates.

  h9 lease segmentation gates (furnished / lease_term LONG-SHORT, rent_includes
  Jaccard nudge weight=7 [tuned in ac06475]). Both 100% filled on condos —
  even cleaner than homes' ~99%. portion_property_lease gate ports but is
  expected to be near-neutral on condos (semantic caveat below); MEASURE the
  effect, don't assume the homes +5pp ±15 lift. Direct env-knob mirror:
  CONDO_LEASE_GATE_FURNISHED, CONDO_LEASE_GATE_TERM, CONDO_LEASE_GATE_PORTION,
  CONDO_LEASE_RENT_INCL_WEIGHT (defaults: ON, ON, ON, 7).

  Two-rail design (homes h3/h4 — comparable-matched value + active-listing
  competitive context). Orthogonal to matcher. Ports unchanged for both
  SALE and LEASE on the condo side.

  Adjustment-layer pattern (homes h6 home_adjustments table + cascade
  resolver). Reuse the cascade pattern (Building → Community → Municipality
  → Area → Generic → Hardcoded), but build a FRESH tenant-scoped S2 resolver
  (resolve-condo-adjustments.ts). The existing condo adjustments table is
  already richer than homes (5 levels vs 2). The new S2 resolver reads the
  same table but uses the CORRECT column names (parking_sale_weighted_avg
  not parking_sale_calculated), wires in tenant scoping if/when adjustments
  becomes tenant-aware, and re-cascades cleanly.

PORTABLE WITH CAVEAT:

  portion_property_lease gate. Homes portion-pools (ENTIRE / BASEMENT / UPPER)
  exist because houses have basement-rental cohorts. Condos are overwhelmingly
  whole-unit leases. The gate ports but the BASEMENT and UPPER pools should
  be near-empty on condo data. MEASURE in the condo sweep: portion gate
  effect expected to be near-neutral, possibly net-zero or slight negative
  if it filters too aggressively on the rare condo subtype with a portion
  value. Decision rule: same as homes — gate ships if it improves or holds
  ±15 within noise; drops if it regresses.

================================================================================
v1 — CONDO-SPECIFIC (locked) — not in homes
================================================================================

PARKING VALUE (LEASE — score nudge):
parking_lease_calculated is filled on 407/408 (~100%) adjustment rows. Clean,
per-community continuous signal. Becomes a score-nudge in the LEASE matcher,
not a gate — same shape as h9 rent_includes nudge (default weight TBD by
sweep, single env knob). When subject parking matches comp parking, the
nudge fires; per-space delta scales by the resolved parking_lease_calculated
value at the comp's geo level. CONDO_LEASE_PARKING_WEIGHT env knob.

PARKING VALUE (SALE — geo-dependent adjustment):
parking_sale_weighted_avg is filled on 30/408 (~7%). Sparse. Stays as a
within-Platinum (within-building) adjustment, NOT a score nudge — same as
existing ADJ-tier behavior. The operator-locked observation: Toronto-core
buildings have separable parking-deeded (clean +$X per space adjustment);
outskirts buildings have bundled parking (no separate value). This is a
geo-dependent regime, not a global default. The new S2 resolver reads the
weighted_avg column at the correct geo level; when sparse/null, falls
through to a geo-aware default (Toronto-core vs outskirts) rather than the
$50,000 hardcoded global. CONDO_SALE_PARKING_CORE / CONDO_SALE_PARKING_OUTSKIRTS
defaults TBD by recon on parking_sale_weighted_avg distribution.

LOCKER VALUE (BOTH — pairs with parking; BUILD-THE-DATA item):
locker_sale_calculated and locker_lease_calculated are BOTH 0% computed in the
adjustments table. The value pipeline that should populate these doesn't
exist or doesn't write to these columns. The locker score nudge / adjustment
is wired into the S2 design as a parking-sibling (lease nudge / sale
adjustment), but until the analytics pipeline populates the columns, the
nudge silent-omits and locker stays as the existing binary gate / fixed
$-adjustment ($10,000 sale, $50 lease) within the within-building sub-tier.
Filed in NAMED-OPEN as an analytics workstream prerequisite. Existing binary
locker behavior ports as Platinum sub-tier behavior so the S2 matcher works
from day 1; the locker nudge becomes a separate phase once locker_*_calculated
rows are populated.

MAINTENANCE-$/SQFT (SALE — richness signal, replace existing MAINT tier):
The existing MAINT tier uses association_fee ±20% raw $ banding. Both
assoc_fee and living_area_range are 100% filled on SALE (n=1,326 recent),
so maintenance-$/sqft is computable for every SALE subject + every SALE comp.
Replace the raw $ band with a $/sqft sliding band (same shape as h8 tax
band): silent-omit if either side missing, sliding 0→15 pts, env-driven
band width (CONDO_MAINT_PSF_BAND_PCT default 0.20). SALE-only by design —
LEASE has 2% assoc_fee fill so the signal isn't testable. Reorders within-
pool, doesn't gate.

================================================================================
v1 — NAMED-OPEN (carries forward)
================================================================================

- parking_sale_calculated schema-drift bug in the SHARED resolve-adjustments.ts
  reads a non-existent column → every sale estimate falls through to the
  $50,000 hardcoded default, even where computed data exists. The new S2
  resolver reads the correct column (parking_sale_weighted_avg) from day 1.
  The S1 fix is a SEPARATE Rule-Zero call (touching shared System 1 surface
  to fix a real defect — defensible, but needs explicit operator sign-off
  per CLAUDE.md). Not blocking the condo workstream.

- Locker value analytics pipeline. locker_sale_calculated and
  locker_lease_calculated are both 0% populated. A separate analytics pass
  must compute per-geo locker values (sale + lease) before the locker score
  nudge / sale adjustment can fire on computed data. Existing binary locker
  behavior bridges in the meantime.

- Portion-gate effect on condos. Homes' +5pp ±15 from the portion gate was
  driven by basement-rental cohorts. Condos are whole-unit. Sweep the gate
  in the condo backtest the same way it was swept on homes; ship only if
  it improves or holds within noise.

- CTA threading decision. Tenant-gated branch (leaning) inside the existing
  shared CTAs vs forked CTAs (Home*Condo* equivalents) at the page layer.
  Branch is smaller surface (one if-block per CTA) but touches shared
  files; forked CTAs is cleaner separation but bigger walliam-side change.
  Decide before the first matcher ships.

- Toronto-core vs outskirts parking-sale regime. Operator-locked design
  asserts a geo-dependent split (Toronto-core separable, outskirts bundled).
  Confirm with a follow-up recon on parking_sale_weighted_avg distribution
  by muni / area before locking the geo-aware defaults. Not blocking the
  matcher design, but blocking the SALE parking adjustment defaults.

- Sample-cohort determinism for condo backtest (mirrors the homes
  named-open — N_SAMPLE env override + fixed-seed option). Condo lease
  universe is larger than homes lease (~3,674 / 3mo vs ~1,326 / 3mo for
  sale), so sampling noise will be in a similar range.

================================================================================
v1 — BUILD SEQUENCE (proposed)
================================================================================

Order driven by where the homes-port lift is cleanest and the data is
known-good.

  PHASE c1 — condo LEASE first.
    Rationale: lease segmentation ports cleanest (furnished / lease_term /
    rent_includes all 100% fill on condos, even cleaner than homes). Geo
    cascade (Platinum=building → Gold→Silver→Bronze) is the new spine.
    Building-less subjects (~3-5% recent cohort) start at Gold.
    Within-Platinum: existing 5-tier within-building model ports as the
    sub-tier matcher.
    Within-Gold/Silver/Bronze: sqft-range + bed + bath alignment.
    No tax band (lease tax fill is 0%).
    Parking lease nudge fires (parking_lease_calculated 100% available).
    Locker uses existing binary behavior (locker_lease_calculated 0%).
    Files: lib/estimator/condo-comparable-matcher-rentals.ts,
           lib/estimator/resolve-condo-adjustments.ts,
           app/estimator/actions/estimate-condo-rent.ts.
    Measurement: sweep gates + parking nudge weight same way h9 was swept.
    Decision rule: ±15 holds or improves vs current condo lease baseline.

  PHASE c2 — condo SALE.
    Building cascade + within-building 7-tier + h8 tax band (SALE)
    + parking sale adjustment (geo-aware default) + maintenance-$/sqft
    sliding band (replaces existing MAINT ±20%-$).
    Files: lib/estimator/condo-comparable-matcher-sales.ts,
           app/estimator/actions/estimate-condo-sale.ts.
    Measurement: sweep tax band width + maint-PSF band + parking SALE
    adjustment regimes.

  PHASE c3 — CTA threading.
    Tenant-gated branch (or fork) on PropertyEstimateCTA, EstimatorBuyer,
    EstimatorBuyerModal, EstimatorSeller. Drives traffic to the new S2
    actions on walliam, leaves System 1 traffic on the existing shared
    actions.

  PHASE c4 — locker value pipeline (separate analytics workstream).
    Computes per-geo locker values (sale + lease). Once populated, the
    locker nudge / adjustment switches from binary to data-driven.

================================================================================
v1 — RUN-LOG CONVENTION (mirrors homes tracker)
================================================================================

Each shipped phase appends a dated entry:
  2026-MM-DD — c{n} BRIEF NAME (LEASE-only / SALE-only / BOTH) — SHIPS at <metric>

Followed by:
  - Recon delta (what changed since prior phase)
  - Build (files modified, env knobs added)
  - Sweep table (config × n × priced × CONTACT × MAPE × median × ±15 × deltas)
  - Decision rule applied (per-config ship/drop)
  - Coverage / scope (what's touched, what's NOT touched)
  - NAMED-OPEN updates (resolved / carried forward / new)
  - Files modified (tracked vs local-only)
  - PUSH STATUS + APPLY STATUS

The first run-log entry will be c1 (condo lease).

================================================================================
v1 — TRACKING
================================================================================

PUSH STATUS — N/A (no commits yet for this workstream; this is the design
lock entry).
APPLY STATUS — N/A (no DB changes yet).
  origin/main = ac06475 (h9 rent_includes weight tune, 2026-06-10).
  This tracker is committed standalone; the workstream's first build phase
  follows.
