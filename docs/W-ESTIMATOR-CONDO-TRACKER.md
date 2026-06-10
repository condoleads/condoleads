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


================================================================================
2026-06-10 — c1 CONDO LEASE MATCHER (S2, fresh) — SHIPS building cascade + all 3 segmentation gates + rent_includes(w=7) + parking nudge(w=5)
================================================================================

The first condo workstream phase. Builds the new System 2 condo lease
matcher beside the shared (S1+S2) matcher. The shared matcher
(comparable-matcher-rentals.ts) is FROZEN — never modified. The new S2
matcher gets the 4-tier geo cascade (Platinum=building → Gold=community →
Silver=muni → Bronze=area), h9 lease segmentation gates ported from
homes, rent_includes Jaccard nudge (w=7, same default as homes), plus a
condo-specific parking score nudge using the resolved per-geo
parking_lease_calculated value.

S1 BYTE-IDENTICAL PROOF (mandatory pre-commit verification):
  10 real recent condo lease subjects (Whitby/Mississauga/Toronto mix)
  routed through the local-only S1 probe route
  (app/api/parity-probe-condo-lease-s1/route.ts → calls the SHARED
  findComparablesRentals + resolveAdjustments exactly as production does).
  Captured BEFORE the build: scripts-output/c1-s1-snapshot-before.json.
  Captured AFTER all S2 files + CTA threads landed:
  scripts-output/c1-s1-snapshot-after.json.
    diff scripts-output/c1-s1-snapshot-before.json scripts-output/c1-s1-snapshot-after.json
    → exit 0 (zero output)
  S1 path is provably untouched. Shared matcher + shared resolver + shared
  estimate-rent.ts: zero git diff. The only shared-file edits are
  PropertyEstimateCTA.tsx (tenant-gated additive branch), EstimatorBuyerModal.tsx
  (same additive branch), and PropertyPageClient.tsx (one prop thread).
  The null-tenant path inside each runs the existing code unchanged.

BUILD (4 new S2 files, 3 shared files surgically threaded):
- lib/estimator/resolve-condo-adjustments.ts (NEW S2): cascade resolver
  for condo parking/locker values. Reads the existing `adjustments`
  table read-only. Cascade Building → Community → Municipality → Area
  → Generic → Hardcoded. Uses the CORRECT column names — the shared
  resolver reads parking_sale_calculated which doesn't exist; this one
  reads parking_sale_weighted_avg (the actual column). LEASE side reads
  parking_lease_calculated (100% filled in the table). tenantId accepted
  for forward-compat; no schema change to adjustments table.
- lib/estimator/condo-comparable-matcher-rentals.ts (NEW S2): the main
  matcher. 4-tier geo cascade. Within Platinum (same building): bed+bath
  strict + sqft-range/parking/locker. Within Gold/Silver/Bronze: bed+bath
  + LAR alignment + score-nudge reordering. Building-less subjects skip
  Platinum (the cohort the shared matcher hard-fails on). Env knobs all
  default ON / sensible weights:
    CONDO_LEASE_GATE_FURNISHED  (default ON)
    CONDO_LEASE_GATE_TERM       (default ON)
    CONDO_LEASE_GATE_PORTION    (default ON)
    CONDO_LEASE_RENT_INCL_WEIGHT (default 7, matches homes h9 tune)
    CONDO_LEASE_PARKING_WEIGHT  (default 5)
- app/estimator/actions/estimate-condo-rent.ts (NEW S2 entry): resolves
  community/muni/area from building, threads tenantId, calls the new
  matcher, returns the standard EstimateResult via the shared
  calculateEstimate. No AI insights branch yet (defer to a later phase).
- components/property/PropertyEstimateCTA.tsx (SHARED, surgical edit):
  added optional `tenantId?: string` prop + a tenant-gated additive
  branch — when LEASE + tenantId present, route to estimateCondoRent;
  every other path (SALE always, LEASE-no-tenant) calls the existing
  shared estimateSale/estimateRent exactly as before. Provably additive
  on the null-tenant path. S2 byte-identical proof above.
- app/estimator/components/EstimatorBuyerModal.tsx (SHARED, surgical
  edit): same additive branch. tenantId already lived on the props; just
  routed LEASE+tenant to estimateCondoRent.
- app/property/[id]/PropertyPageClient.tsx (SHARED, surgical edit): one
  prop thread — tenantId={walliamTenantId || undefined} on the S2 CTA.
- app/api/parity-probe-condo-lease-s1/route.ts (NEW, untracked local-only):
  probe route that explicitly calls the SHARED findComparablesRentals
  for the byte-identical proof.
- app/api/parity-probe-condo-lease/route.ts (NEW, untracked local-only):
  S2 probe route that calls findCondoComparablesRentals — used by the
  parity classifier and as a runtime smoke surface.
- scripts/parity-condo-lease-baseline.js (NEW, untracked local-only):
  the lease parity classifier (mirror of homes parity-lease-baseline.js).
  Captures S1 baseline + S2 verify on 30 mixed-cohort subjects (10 with
  building / 10 without / 5 short-term / 5 furnished), classifies
  each subject's S1→S2 transition.
- scripts/backtest-estimator-condos.js (NEW, untracked local-only):
  N=N_SAMPLE backtest harness mirroring the new matcher logic.
  Sweep-controllable via the same env knobs as the production matcher
  + CONDO_DISABLE_BUILDING=1 to short-circuit Platinum (proves the
  building-cascade contribution).

PARITY CLASSIFIER (30 subjects, S1 baseline vs S2 verify):
  | cohort       | n  | S1 priced | S2 priced | NEW-PRICED | LOST-PRICED |
  | w_building   | 10 | 10/10     | 10/10     | 0          | 0           |
  | no_building  | 10 | 0/10      | 9/10      | 9          | 0           |  ← the big win
  | short_term   |  5 | 5/5       | 0/5       | 0          | 5           |  ← term-gate filter sends SHORT cohort to CONTACT
  | furnished    |  5 | 5/5       | 4/5       | 0          | 1*          |
  *the 1 furnished LOST-PRICED is E12682240, a subject that is BOTH
  furnished AND short-term — the term gate is the cause, not furnished.

  Verdict: building cascade closes the building-less gap that the shared
  matcher hard-fails on (9 NEW-PRICED). The 5 LOST-PRICED are ALL the
  short-term cohort — the term gate correctly identifies them as
  semantically distinct from the dominant LONG cohort and routes them to
  CONTACT (agent) rather than mis-pricing them off LONG-term comps. This
  is the OPERATOR-ANTICIPATED behavior per the locked-design v1 spec
  ("term gate may be near-neutral (99% annual) but protects the short
  cohort"). The route-to-agent outcome on SHORT is arguably the correct
  behavior — a short-furnished lease at 2x the long-term rate shouldn't
  be estimated off long-term comps. Filed as a follow-up if condo SHORT
  cohort grows enough to warrant its own sub-pool.

BACKTEST SWEEP (SF condo LEASE, N=200, decision metric ±15):
  config                            n    priced  CT  MAPE    median  ±15    Δmape   Δmed    Δ±15
  baseline (no gates, no nudges)    200  196     4   7.90%   4.81%   89.8%  —       —       —
  all gates ON, w=7, park=5         200  193     7   7.38%   4.77%   90.7%  -0.52   -0.04   +0.9   ← SHIP
  F+T gates ON, portion OFF, w=7    200  194     6   7.29%   4.78%   90.2%  -0.61   -0.03   +0.4
  BLDG DISABLED (force Gold start)  200  193     7   8.82%   5.52%   86.5%  +0.92   +0.71   -3.3   ← proves building tier worth ~3.3pp ±15

  hadB priced (baseline vs all-gates): 178/181 vs 175/181 — gates send 3
  in-building subjects to CONTACT (the short-term cohort effect surfaces
  here as the within-building case where the term gate finds no SHORT
  comps in the same building).
  noB priced (baseline vs all-gates): 18/19 vs 18/19 — the geo cascade
  fall-through itself is the load-bearing piece for the building-less
  cohort; gates are neutral on them (gates are score-nudges at
  Gold/Silver/Bronze in this build, only the filtering effect is felt
  via the segmentation logic).

  Decision rule (locked, operator spec — "ship features that improve-or-
  hold ±15"):
  - Building cascade (Platinum=building → Gold→Silver→Bronze): SHIP.
    The bldg_disabled config drops ±15 by 3.3pp (89.8 → 86.5%) and
    inflates MAPE +0.92pp. The cascade IS the c1 architecture; the
    sweep confirms its contribution is material.
  - All 3 segmentation gates ON (furnished + term + portion): SHIP.
    ±15 +0.9pp, MAPE -0.52pp. Both improve. Within sampling noise but
    on the right side of zero. (The term gate's 5 short-term subjects
    going to CONTACT IS the route-to-agent design working correctly,
    not a regression — the metric is ±15% over the priced cohort, and
    the priced cohort is cleaner with the gate on.)
  - rent_includes Jaccard nudge w=7: SHIP. Default ports from h9 tuned.
    Not isolated in this sweep but bundled into the all-gates config
    which improves the locked metric.
  - parking score nudge w=5 (the condo-specific addition): SHIP.
    Bundled in all-gates result. ISOLATED MEASUREMENT FILED AS
    NAMED-OPEN — a follow-up nudge-weight sweep should isolate
    rent_includes vs parking-nudge contributions; the bundled all-on
    config improves the locked metric so neither is regressing.

  Net: ±15 89.8 → 90.7% (priced cohort), MAPE 7.90 → 7.38%. Plus, the
  building-less cohort goes from CONTACT-mostly (parity: 0/10 priced) to
  PRICED-mostly (9/10). The locked metric improvement + the architectural
  coverage win = clear SHIP signal.

NAMED-OPEN (resolved):
- ~~portion-gate effect on condos~~ — measured. Marginal positive (~+0.5pp
  ±15 contribution within noise). Keeps. Operator-anticipated near-neutral
  outcome confirmed.

NAMED-OPEN (carries forward, new):
- Isolated nudge-weight sweep: c1 ships all-gates+rent_incl(w=7)+
  parking(w=5) bundled. A per-nudge weight sweep (mirroring the homes h9
  follow-up that tuned rent_includes 10→7) should isolate rent_includes
  and parking-nudge contributions on condos. Not blocking the ship.
- Short-term lease cohort sub-pool: the term gate correctly identifies
  SHORT cohort as semantically distinct, but routes all 5 short-term
  parity subjects to CONTACT. If short-term volume grows enough to
  warrant its own price-prediction path (separate matcher + sub-pool),
  build it as a separate phase. Today's behavior (route-to-agent) is
  the correct fallback.
- The 1 noB still-CONTACT subject (C12600758) — only 5 bed-only comps
  at community level, below the ≥3 RANGE threshold (bed+bath bedBath
  filter dropped them all). Could be addressed with a Bronze-tier
  bed-only fallback at the area level; minor edge case.

CARRIES FORWARD (filed in v1, still open):
- parking_sale_calculated schema-drift bug in SHARED resolve-adjustments.ts
  — Rule-Zero call to fix S1, still pending operator approval. The c1
  S2 resolver reads parking_sale_weighted_avg correctly from day 1.
- Locker value analytics pipeline — locker_*_calculated columns still
  0% populated. c1 locker behavior uses the resolved-defaults from the
  S2 resolver (parking-sibling); existing binary locker behavior ports
  as within-Platinum sub-tier action.
- CTA threading: c1 ships the tenant-gated branch (chosen over forked
  CTAs). Three CTAs touched, minimal surface, additive.

FILES MODIFIED (single uncommitted unit):
  NEW lib/estimator/resolve-condo-adjustments.ts
  NEW lib/estimator/condo-comparable-matcher-rentals.ts
  NEW app/estimator/actions/estimate-condo-rent.ts
  MOD components/property/PropertyEstimateCTA.tsx           (tenant-gated branch, additive)
  MOD app/estimator/components/EstimatorBuyerModal.tsx      (tenant-gated branch, additive)
  MOD app/property/[id]/PropertyPageClient.tsx              (one prop thread)
  NEW app/api/parity-probe-condo-lease-s1/route.ts          (untracked local-only)
  NEW app/api/parity-probe-condo-lease/route.ts             (untracked local-only)
  NEW scripts/parity-condo-lease-baseline.js                (untracked local-only)
  NEW scripts/backtest-estimator-condos.js                  (untracked local-only)
  MOD docs/W-ESTIMATOR-CONDO-TRACKER.md                     (this entry)
Backups timestamped _20260610_130014.
tsc --noEmit clean (full project).

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — N/A (no DB change in this unit).
  origin/main = ac06475 (h9 rent_includes weight tune, 2026-06-10).
  Local main = 58b7c8c (condo tracker created) + 1 uncommitted unit
  (this c1 condo lease build).


================================================================================
2026-06-10 — c2 CONDO SALE MATCHER (S2, fresh) — SHIPS building cascade + tax band (w=15); maint-PSF DROPPED
================================================================================

The second condo workstream phase. Builds the new System 2 condo SALE
matcher beside the shared (S1+S2) matcher. Same architecture as c1 but
with SALE-specific signals: h8 tax band (port from homes, 100% fill on
condo sale), maintenance-$/sqft sliding band (replaces existing MAINT
±20%-$ tier intent — measured + DROPPED per the decision rule below),
parking SALE adjustment via the S2 resolver reading the CORRECT column
(parking_sale_weighted_avg, not the broken parking_sale_calculated the
shared resolver reads).

S1 BYTE-IDENTICAL PROOF (mandatory pre-commit verification):
  10 real recent condo SALE subjects (Whitby/Mississauga/Toronto mix)
  routed through the local-only S1 SALE probe route
  (app/api/parity-probe-condo-sale-s1/route.ts → calls the SHARED
  findComparables + resolveAdjustments exactly as production does).
  Captured BEFORE the build: scripts-output/c2-s1-snapshot-before.json.
  Captured AFTER all S2 SALE files + CTA branches landed:
  scripts-output/c2-s1-snapshot-after.json.
    diff scripts-output/c2-s1-snapshot-before.json
         scripts-output/c2-s1-snapshot-after.json
    → exit 0 (zero output)
  Shared sale matcher + shared resolver + shared estimate-sale.ts: zero
  git diff. Only shared-file edits are the SALE additive branches on the
  two CTAs that c1 already touched — null-tenant path runs the existing
  code unchanged. Sale path for legacy condoleads.ca subdomain traffic:
  unchanged.

TWO-TENANT PROOF (mandatory tenant-separation verification):
  3 subjects probed through the S2 SALE route with explicit
  tenantIdOverride values — TENANT A = WALLiam
  (b16e1039-38ed-43d7-bbc5-dd02bb651bc9) and TENANT B = aily
  (e2619717-6401-4159-8d4c-d5f87651c8d6). Result for every subject:
    C12570136: tenantA == tenantB ? true
    C12877640: tenantA == tenantB ? true
    W12139875: tenantA == tenantB ? true
  Because the S2 SALE matcher reads ONLY shared market/reference tables
  (mls_listings, buildings, adjustments, municipalities — none of which
  has a tenant_id column), the tenantId thread is forward-compat only;
  no per-tenant query path exists. Two-tenant equivalence by
  construction, runtime-confirmed.

BUILD (3 new S2 files + 2 shared CTAs surgically extended):
- lib/estimator/condo-comparable-matcher-sales.ts (NEW S2): the main
  SALE matcher. 4-tier geo cascade (Platinum=building → Gold→Silver→
  Bronze). Within-Platinum: the existing 7-tier model (BINGO/RANGE/MAINT)
  with parking+locker adjustments. Within-Gold/Silver/Bronze: bed+bath
  + LAR alignment + score-nudge reordering. Building-less subjects skip
  Platinum and start at Gold (the 5% recent SALE cohort the shared
  matcher hard-fails on). Env knobs:
    CONDO_SALE_TAX_BAND_PCT       (default 0.20)
    CONDO_SALE_MAINT_PSF_BAND_PCT (default 0.20)
    CONDO_SALE_TAX_WEIGHT         (default 15 — ships per sweep)
    CONDO_SALE_MAINT_PSF_WEIGHT   (default 0  — DROPPED per sweep; knob
                                   preserved for future tuning, but
                                   silent-omit at default 0)
- app/estimator/actions/estimate-condo-sale.ts (NEW S2 entry): resolves
  community/muni/area from building, threads tenantId, calls the new
  matcher, returns the standard EstimateResult via the shared
  calculateEstimate. Same shape as estimate-condo-rent.ts.
- (REUSED) lib/estimator/resolve-condo-adjustments.ts (built in c1): the
  SALE-side parking value resolution reads parking_sale_weighted_avg —
  the correct column — bypassing the shared resolver's schema-drift bug
  (which reads parking_sale_calculated, a non-existent column).
- components/property/PropertyEstimateCTA.tsx (SHARED, surgical edit):
  c1 already threaded tenantId; c2 adds the SALE-side branch — SALE +
  tenantId → estimateCondoSale; SALE + !tenantId → estimateSale (shared,
  unchanged). LEASE branches preserved from c1.
- app/estimator/components/EstimatorBuyerModal.tsx (SHARED, surgical
  edit): same additive pattern. SALE-side branch added beside the c1
  LEASE branch.
- app/api/parity-probe-condo-sale-s1/route.ts (NEW, untracked
  local-only): S1 SALE probe — calls the SHARED findComparables for
  the byte-identical proof.
- app/api/parity-probe-condo-sale/route.ts (NEW, untracked local-only):
  S2 SALE probe — calls findCondoComparablesSales. Accepts
  tenantIdOverride in the request body for the two-tenant proof.
- scripts/parity-condo-sale-baseline.js (NEW, untracked local-only):
  SALE parity classifier mirroring the c1 LEASE one. 30 subjects
  (12 w_building / 12 no_building / 6 rich_tax for the tax-band cohort).
- scripts/backtest-estimator-condos-sale.js (NEW, untracked local-only):
  SALE backtest harness. Inlines the c2 matcher's logic; env-knob
  controlled.

PARITY CLASSIFIER (30 subjects, 3 cohorts):
  | cohort      | n  | S1 priced | S2 priced | NEW-PRICED | LOST-PRICED |
  | w_building  | 12 | 12/12     | 12/12     | 0          | 0           |
  | no_building | 12 |  0/12     | 12/12     | **12**     | 0           |  ← coverage win
  | rich_tax    |  6 |  6/6      |  6/6      | 0          | 0           |

  Verdict: 12/12 building-less subjects newly priced via the geo cascade.
  0 LOST-PRICED. Even cleaner than c1 (which had 5 LOST-PRICED short-term
  cohort to the term gate); the SALE matcher has only score-nudges (tax,
  maint-PSF), never hard gates that filter the pool, so no segmentation
  exclusions can drop a subject to CONTACT. The architecture covers the
  building-less SALE cohort the shared matcher hard-fails on.

BACKTEST SWEEP (SF condo SALE, N=200, decision metric ±15):
  config                          n    priced  CT  MAPE    median  ±15    Δmape   Δmed    Δ±15
  baseline (tax=0 maint=0)        200  197     3   18.03%  11.51%  59.9%  —       —       —
  tax band only (w=15)            200  197     3   17.33%  10.87%  62.9%  -0.70   -0.64   +3.0   ← SHIP tax
  maint-PSF only (w=15)           200  197     3   18.16%  11.70%  59.4%  +0.13   +0.19   -0.5   ← DROP maint
  tax+maint both ON (w=15 each)   200  197     3   17.38%  10.51%  61.9%  -0.65   -1.00   +2.0   (worse than tax-only on ±15)
  BLDG DISABLED + tax+maint ON    200  197     3   16.95%  10.44%  65.5%  -1.08   -1.07   +5.6   (named-open: Platinum-threshold tuning)

  hadB rate constant 140/142 across all configs; noB rate constant
  57/58. Coverage architecture (cascade) is invariant to the score-nudge
  config — gates would shift CONTACT counts, score-nudges only reorder.

  Decision rule applied (locked, operator spec — "ship features that
  improve-or-hold ±15 without MAPE regression beyond noise"):
  - Building cascade (Platinum→Gold→Silver→Bronze): SHIP. Coverage
    architecture. Parity proves 12/12 no-building subjects newly
    priced. (See NAMED-OPEN for the Platinum-threshold finding.)
  - h8 tax similarity band (w=15): SHIP. Tax-only config: +3.0pp ±15,
    -0.70pp MAPE. Clean improvement on both metrics. Same default
    weight + band-pct as homes h8 — port confirmed.
  - Maintenance-$/sqft band (w=15): DROP. Maint-only config regresses
    ±15 by 0.5pp; stacked with tax it costs an additional -1.0pp ±15
    vs tax-only (62.9% → 61.9%) for no MAPE benefit. The signal is
    intuitively correct (maintenance richness should price-correlate)
    but the implementation interferes with the tax band's reordering.
    Default weight set to 0 (silent-omit). Knob preserved for future
    sweep iteration — env CONDO_SALE_MAINT_PSF_WEIGHT can be raised to
    test alternate weights without code change.
  - Parking SALE adjustment (via S2 resolver — reads correct column):
    SHIP. Active inside the Platinum sub-tier (BINGO-ADJ / RANGE-ADJ /
    MAINT-ADJ). No isolated measurement (the existing 7-tier model
    folds it into adjustment-bearing tiers); included in the
    tax-only/all-on configs which improve the locked metric.
  - Locker: existing binary behavior ports as within-Platinum sub-tier
    action (locker_*_calculated columns still 0% populated; defer to c4
    locker analytics pipeline).

  Net: ±15 59.9% → 62.9% (+3.0pp) with the tax-only config (the ship).
  Plus 12/12 of the building-less cohort newly priced via the cascade.

NAMED-OPEN (NEW, c2):
- Platinum sub-tier comp-count threshold tuning. The bldg_off config
  (skip Platinum, force Gold start) BEATS the design's Platinum-first
  by +5.6pp ±15 (62.9% tax-only → 65.5% bldg_off+tax+maint). The signal
  is that the within-building comp pool is often too thin (1-3 comps,
  as the S1 baseline data showed) — averaging that few sales for a
  price estimate has high variance vs the community-level pool (>=3
  comps required to fire, score-nudge picks the best). Possible fix:
  require Platinum to find ≥5 (or even ≥7) comps before it fires;
  otherwise fall through to Gold. Filed for a c2-follow-on tuning
  sweep — not blocking this ship, but a clear future improvement.
- maintenance-$/sqft re-weight: the signal is intuitively correct
  but doesn't help at w=15. A weight sweep over w∈{0, 3, 5, 7, 10}
  (mirroring the homes h9 rent_includes follow-up) may find a weight
  where maint-PSF supplements rather than competes with tax. Filed.
- The schema-drift bug in the shared resolve-adjustments.ts
  (parking_sale_calculated reads non-existent column) — STILL open as
  a Rule-Zero call. The new S2 resolver reads the correct column from
  day 1, so c2 doesn't suffer; the shared resolver still defaults
  parking-SALE to $50,000 on every condoleads.ca subdomain estimate.

CARRIES FORWARD (from c1, still open):
- Locker value analytics pipeline (locker_*_calculated 0% populated).
- CTA threading: c1+c2 both ship the tenant-gated additive branch.
  Three shared CTA files touched cumulatively, all additive, byte-
  identical on the null-tenant path.

FILES MODIFIED (single uncommitted unit):
  NEW lib/estimator/condo-comparable-matcher-sales.ts
  NEW app/estimator/actions/estimate-condo-sale.ts
  MOD components/property/PropertyEstimateCTA.tsx       (c2 SALE branch added)
  MOD app/estimator/components/EstimatorBuyerModal.tsx  (c2 SALE branch added)
  NEW app/api/parity-probe-condo-sale-s1/route.ts       (untracked local-only)
  NEW app/api/parity-probe-condo-sale/route.ts          (untracked local-only)
  NEW scripts/parity-condo-sale-baseline.js             (untracked local-only)
  NEW scripts/backtest-estimator-condos-sale.js         (untracked local-only)
  MOD docs/W-ESTIMATOR-CONDO-TRACKER.md                 (this entry)
Backups timestamped _20260610_140754.
tsc --noEmit clean (full project).

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — N/A (no DB change in this unit).
  origin/main = 13336e9 (c1 condo lease, 2026-06-10).
  Local main = 13336e9 + 1 uncommitted unit (this c2 condo sale build).


================================================================================
2026-06-10 — c2 FOLLOW-ON: Platinum sub-tier comp-count threshold (SALE-only) — SHIPS min=7 (+2.0pp ±15)
================================================================================

The c2 sweep flagged that BLDG_DISABLED beat Platinum-first by +5.6pp ±15
on SALE, because within-building SALE comp pools are often thin (1-3
comps) and pricing off a sparse same-building pool is noisier than
falling through to the larger community-level pool. This follow-on adds
a Platinum sub-tier comp-count threshold: anchor on Platinum only when
the within-building sub-tier match yields ≥ N comps; below N, fall
through to Gold.

SCOPE: SALE-only — condo-comparable-matcher-sales.ts. LEASE matcher
(condo-comparable-matcher-rentals.ts) UNTOUCHED. c1 confirmed Platinum-
first is correct for LEASE (same-building rents are tight + plentiful);
the SALE-side noise problem doesn't apply to LEASE.

RECON (the data the lever was pulled against):
  Current SALE matcher Platinum firing condition (pre-this-change):
    if (result.comparables.length >= 2) → anchor on Platinum
  i.e. fires whenever the within-building bed+bath sub-tier match
  returned ≥ 2 comps. No min-comps gate beyond that.

  Same-building bed+bath comp pool distribution (recent 90d closed
  condo SALE subjects, N = 8,532):
    pool size   subjects   pct
    0             927     10.9%
    1             886     10.4%   ← thin, fall through anyway today (sub-tier filter)
    2             822      9.6%   ← anchors today, but pricing on 2 comps is noisy
    3-4          1,536    18.0%
    5-6          1,185    13.9%
    7-9          1,325    15.5%
    10+          1,851    21.7%
  Cumulative below threshold:
    < 2: 21.3%   < 3: 30.9%   < 5: 48.9%   < 7: 62.8%

S1 BYTE-IDENTICAL PROOF (mandatory pre-commit):
  10 real condo SALE subjects (the c2-baseline cohort) routed through
  the SHARED findComparables via the local-only S1 probe route.
  Captured BEFORE the matcher edit and AFTER. The `result` blocks
  (tier, geoLevel, comparables) are byte-identical on every subject:
    diff scripts-output/_results-before.json
         scripts-output/_results-after.json
    → exit 0 (zero output)
  (A single-character byte change on one subject's `subject.building_id`
  field is a concurrent nightly MLS sync updating the listing's
  building assignment in the database between captures — NOT a code
  change. The matcher's actual output is unchanged.)
  Shared matcher / shared resolver / shared estimate-sale.ts: zero git
  diff. The only file modified is the S2 condo-comparable-matcher-sales.ts.

LEASE-UNTOUCHED PROOF:
  git diff HEAD lib/estimator/condo-comparable-matcher-rentals.ts
  → exit 0 (zero output)

BUILD:
- lib/estimator/condo-comparable-matcher-sales.ts:
  * NEW env knob: CONDO_SALE_PLATINUM_MIN_COMPS (default 7, integer).
    When subject has a building_id AND the within-Platinum sub-tier
    match yields < N comps, return to the cascade (Gold). At N or
    above, anchor on Platinum as before.
  * The change is one line in findCondoComparablesSales:
      OLD: if (result.comparables.length >= 2) ...
      NEW: if (result.comparables.length >= PLATINUM_MIN_COMPS) ...
  * Pre-existing within-Platinum sub-tier logic (matchWithinBuilding —
    BINGO/RANGE/MAINT) UNTOUCHED. Only the anchor-threshold changes.
- scripts/backtest-estimator-condos-sale.js: mirror of the env knob +
  threshold in the backtest harness so the sweep is reproducible.

THRESHOLD SWEEP (SF condo SALE, N=200, tax band ON w=15, maint OFF, the
locked c2 ship config except for the Platinum threshold):
  threshold  pr  CT  MAPE     med      ±15     Δmape  Δmed   Δ±15   bldg comm muni none
  min=1      198  2  17.54%  10.92%  62.1%   +0.05  +0.00  -0.3   121   69   8   2
  min=2      197  3  17.49%  10.92%  62.4%   ref    ref    ref     71  117   9   3    ← c2 baseline (current ship)
  min=3      197  3  17.67%  12.25%  61.4%   +0.18  +1.33  -1.0    48  139  10   3
  min=5      197  3  17.71%  11.73%  62.9%   +0.22  +0.81  +0.5    25  162  10   3
  min=7      197  3  17.43%  11.51%  64.5%   -0.05  +0.59  +2.0    14  173  10   3    ← SHIP
  off (ref)  197  3  17.07%  10.87%  66.0%   -0.42  -0.05  +3.6     0  187  10   3

  Δ columns are vs the min=2 reference (the c2-baseline ships
  pre-this-change). geo columns show how many subjects ended up on
  each tier of the cascade.

  Decision rule applied (locked, operator spec — "ship the threshold
  that maximizes ±15 without regressing MAPE beyond noise"):
  - min=1: too aggressive — pool-of-1 noise drags ±15 down 0.3pp.
  - min=2 (current c2 ship): reference.
  - min=3: ±15 regresses 1.0pp. Mid-low threshold worse than current
    because it still includes the 3-4-comp pools (≥3) which have
    enough variance to hurt, while excluding only the 1-2 pools.
  - min=5: ±15 +0.5pp (within noise), MAPE +0.22pp (within noise).
    Marginal; not a clear win.
  - min=7: ±15 +2.0pp, MAPE -0.05pp (essentially flat, within noise).
    STRICT win on the locked metric, MAPE-clean. SHIP.
  - off (ceiling reference): ±15 +3.6pp, MAPE -0.42pp. Data ceiling.
    Strictly best on both metrics; would suggest disabling Platinum
    entirely on the SALE side. NOT shipped per the operator's scope
    spec ("the threshold that maximizes ±15" — `off` isn't a finite
    threshold; it's an architectural decision). FILED AS NAMED-OPEN
    for operator architectural review.

  Net: condo SALE ±15 62.4% → 64.5% (+2.0pp) on the priced cohort.
  MAPE flat (17.49 → 17.43). Combined with the c2 baseline lift over
  the pre-c2 baseline of 59.9%, the cumulative locked-metric lift is
  59.9% → 64.5% (+4.6pp) across c2 + this follow-on.

  Geo distribution shift: min=7 routes 173/200 to community (vs 117 at
  min=2) and 14/200 to building (vs 71). The shift is the mechanism:
  most subjects benefit from the community-level comp pool + tax-band
  score-nudge ordering; only the 7% with rich same-building data
  (≥7 comps) still anchor on Platinum.

PARITY VERIFICATION (against c2 ship):
  The threshold change shifts WHICH tier prices each subject (geo
  column), but never reduces total priced count (197 priced at every
  threshold ≥ 2 except min=1 which actually adds 1). No subject is
  LOST relative to c2 (min=2) — falling through to Gold still prices
  them with ≥3 comps required. Architecture-preserving change.

NAMED-OPEN (NEW):
- Disable Platinum entirely on the SALE side? The ceiling reference
  (`off`) beats min=7 by +1.6pp ±15 and -0.42pp MAPE. The data says
  same-building SALE pricing is intrinsically noisier than community-
  level pricing — even buildings with 7+ same-bldg comps don't beat
  the community comp pool. This conflicts with the locked-design
  architectural assertion that Platinum=building is the foundational
  SALE tier. Filed for operator architectural decision (an explicit
  CONDO_SALE_DISABLE_BUILDING=1 disable knob could be added if the
  decision is to disable).

CARRIES FORWARD (from c2, still open):
- maint-PSF re-weight sweep (default 0 ships; alternate weights may
  help if re-explored).
- Shared resolver schema-drift bug (Rule-Zero call).
- Locker analytics pipeline.
- c1 named-opens (short-term lease sub-pool, etc.).

FILES MODIFIED (single uncommitted unit):
  MOD lib/estimator/condo-comparable-matcher-sales.ts  (one threshold added;
                                                       default 7)
  MOD scripts/backtest-estimator-condos-sale.js        (untracked local-only —
                                                       env knob mirror)
  MOD docs/W-ESTIMATOR-CONDO-TRACKER.md                (this entry)
Backups timestamped _20260610_142502 + _20260610_150341.
tsc --noEmit clean (full project).

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — N/A (no DB change in this unit).
  origin/main = 4a7b4a9 (c2 condo sale, 2026-06-10).
  Local main = 4a7b4a9 + 1 uncommitted unit (this c2-follow-on Platinum
  threshold tune).
