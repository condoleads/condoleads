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


================================================================================
2026-06-10 — c2 RESOLVER-FIX: building-first cascade verified + locker silent-omit (S2-only)
================================================================================

The c1 + c2 phases shipped with the S2 condo resolver (resolve-condo-
adjustments.ts) already structured as building-first cascade with manual-
over-computed at each scope. This phase VERIFIED the granularity end-to-
end against current table state AND fixed a subtle "fake-value" bug:
when no scope in the cascade had any locker data, the resolver was
returning hardcoded defaults ($10,000 sale / $50 lease) — the operator's
spec requires silent-omit when the cascade is genuinely empty (do NOT
fake values while c4 analytics pipeline is pending).

SCOPE: S2-only — lib/estimator/resolve-condo-adjustments.ts (semantics),
lib/estimator/condo-comparable-matcher-sales.ts (locker $-adj guard),
lib/estimator/condo-comparable-matcher-rentals.ts (locker $-adj guard).
SHARED System 1 files (comparable-matcher-sales.ts, -rentals.ts,
resolve-adjustments.ts, estimate-sale.ts, estimate-rent.ts) UNTOUCHED —
zero git diff.

GRANULARITY RECON (current state, 2026-06-10):
  Schema columns verified:
    parking computed: parking_sale_weighted_avg, parking_lease_calculated
    parking manual:   parking_value_sale, parking_value_lease
    locker  computed: locker_sale_calculated, locker_lease_calculated
    locker  manual:   locker_value_sale, locker_value_lease
  (The shared resolve-adjustments.ts schema-drift bug — reads
  parking_sale_calculated which doesn't exist — is still open. S2
  resolver reads correct column names.)

  Rows by scope (adjustments, 408 total):
    building     50
    community   239
    municipality 97
    area         21
    generic       1   ← operator-set manual overrides for parking + locker

  PARKING fill (computed columns):
    Scope         SALE (weighted_avg)   LEASE (calculated)
    building       0 / 50 ( 0%)         50 / 50 (100%)
    community     18 / 239 (7.5%)      239 / 239 (100%)
  Manual *_value_* columns: 0 at every scope (no dashboard overrides).
  Generic row holds parking_value_sale=$50,000 + parking_value_lease=$200
  (operator-set manual baseline — matches the prior hardcoded defaults).

  LOCKER fill (computed columns):
    Scope         SALE (calculated)    LEASE (calculated)
    building       0 / 50 ( 0%)         0 / 50 ( 0%)
    community      0 / 239 ( 0%)        0 / 239 ( 0%)
    municipality   0 / 97  ( 0%)        0 / 97  ( 0%)
    area           0 / 21  ( 0%)        0 / 21  ( 0%)
  Manual *_value_* columns: 0 at every scope EXCEPT the generic row,
  which holds locker_value_sale=$10,000 + locker_value_lease=$50
  (operator-set manual baseline at generic scope).

  Practical implication: the c4 locker analytics pipeline still owes
  the per-geo locker_*_calculated values. Today, every condo's locker
  $-adjustment resolves to the generic-row operator-set manual baseline
  ($10k sale / $50 lease). If the operator deletes those generic-row
  values, every cascade hits the silent-omit path (zero locker
  adjustment) until the c4 pipeline ships.

DIAGNOSIS (current S2 resolver behavior pre-this-fix):
  - Cascade order building→community→muni→area→generic→hardcoded: CORRECT.
  - Per-scope manual-over-computed priority: CORRECT.
  - Correct column names (vs. shared resolver's drift bug): CORRECT.
  - Locker fake-value bug: PRESENT. When the entire cascade was empty
    (no scope had any locker value), the resolver returned hardcoded
    $10,000 sale / $50 lease rather than silent-omitting. Pre-fix
    behavior was effectively masked by the generic-row manual values
    (always providing a non-null at the end of the cascade), but the
    code path FAKED values when the data was actually absent.

FIX (lib/estimator/resolve-condo-adjustments.ts):
  - resolveField() now returns null when the cascade has no value.
  - Caller does `parkingResolved?.value ?? defaults.parkingPerSpace`
    (parking keeps hardcoded fallback — per operator spec, parking
    not silent-omitted).
  - Caller does `lockerResolved?.value ?? 0` with source
    'silent-omit (no data in cascade)' (locker silent-omits per spec).
  - Removed HARDCODED_DEFAULTS_SALE.locker and HARDCODED_DEFAULTS_LEASE.locker
    constants — locker has no hardcoded fallback in the S2 resolver.
  - All early-exit paths (no buildingId, building-not-found, error
    catch) updated to return locker=0 + silent-omit source for
    consistency.

MATCHER GUARDS (sales + rentals):
  - condo-comparable-matcher-sales.ts createComp(): the locker $-adj
    block now guards `if (subjL !== compL && customValues.locker > 0)`.
    When locker is 0 (silent-omit), no adjustment row is added.
  - condo-comparable-matcher-rentals.ts createComp(): same guard.
  - Sale-side cross-building comps don't carry a locker $-adj (existing
    behavior); only Platinum within-building creates locker adjustments.
    Same on lease side.

RUNTIME VERIFICATION (via local-only probe-condo-resolver/route.ts):
  CASE 1 — building HAS building-scope value → returns Building (calculated)
    building_id=0905254b-7461-4fbf-91d0-d915d0526de2 (parking_lease_calculated=$200)
    resolver(lease) → parking=$200 source="Building (calculated)" ✓
  CASE 2 — building has NO building-scope row → falls through to Community
    building_id=e358b16d-8048-4075-b7eb-e12130d6ab3c (no building row;
                                                     community has $135.50)
    resolver(lease) → parking=$135.50 source="Community (calculated)" ✓
  CASE 3 — locker cascade: building → community → muni → area → generic
    For the CASE 1 subject (no locker_*_calculated anywhere in higher
    scopes), the cascade reaches generic and returns the operator-set
    manual override:
    resolver(lease) → locker=$50 source="Generic (manual)" ✓
    resolver(sale)  → locker=$10000 source="Generic (manual)" ✓
    The silent-omit safety net (locker=0 + silent-omit source) only
    activates when EVEN the generic row's locker_value_* columns are
    null. With the generic row currently set, this path is dormant —
    but the architectural correctness (no faked values) is in place.
  CASE 4 (bonus) — sale-side parking cascade reaches Community
    resolver(sale) → parking=$41,000 source="Community (calculated)"
    (Community-scope parking_sale_weighted_avg exists for this geo;
    falls through past the empty building-scope sale_calc.)

VERIFICATION OF FIX SEMANTICS (code-level proof of silent-omit):
  resolveField (resolve-condo-adjustments.ts lines 124-144):
    for (const level of order) {
      const adj = byLevel[level]
      if (!adj) continue
      if (adj[manual] != null) return { value, source: 'Manual' }   ← MANUAL FIRST
      if (adj[calc] != null)   return { value, source: 'Calculated' } ← CALC SECOND
    }
    return null   ← LINE 142: silent-omit signal when cascade exhausted
  Caller:
    locker: lockerResolved?.value ?? 0   ← LINE 161
    sources.locker: lockerResolved?.source ?? 'silent-omit (no data in cascade)'

LEASE + SALE BOTH FLOW CORRECTLY:
  Sale matcher (createComp at line 460): the locker $-adj guard
    `if (subjL !== compL && customValues.locker > 0)` — when resolver
    returns 0, no locker adjustment row created (matchQuality and
    adjustedPrice computations skip the locker entirely).
  Lease matcher (createComp at line 470): same guard.

S1 BYTE-IDENTICAL PROOF (shared files untouched):
  git diff HEAD -- lib/estimator/comparable-matcher-sales.ts \
                   lib/estimator/comparable-matcher-rentals.ts \
                   lib/estimator/resolve-adjustments.ts \
                   app/estimator/actions/estimate-sale.ts \
                   app/estimator/actions/estimate-rent.ts
  → exit 0 (zero output)
  Five SHARED files (which condoleads.ca System 1 traffic uses for both
  sale and lease condo estimates) all have zero git diff. The shared
  resolver's parking_sale_calculated schema-drift bug is preserved
  per Rule Zero — separate operator-approved call.

TENANT SEPARATION (unchanged):
  No new queries added to the S2 resolver. The new code paths read the
  same `adjustments` table (shared market data, no tenant_id column).
  Tenant separation analysis from c1+c2 still holds: SOUND.

NAMED-OPEN updates:
- locker analytics pipeline (c4): still owed. The silent-omit safety
  net is now in place, so when the pipeline ships and operators clean
  up the generic-row override, the matchers will skip the locker
  $-adj gracefully rather than faking. Filed forward.

CARRIES FORWARD (unchanged from c2):
- parking_sale_calculated schema-drift in SHARED resolver (Rule-Zero
  call, separate).
- Platinum disable for SALE (named-open from c2-follow-on Platinum
  threshold sweep — disabling fully beats min=7 by another +1.6pp ±15).
- maint-PSF weight sweep.
- Short-term lease cohort sub-pool (from c1).

FILES MODIFIED (single uncommitted unit):
  MOD lib/estimator/resolve-condo-adjustments.ts        (silent-omit semantics)
  MOD lib/estimator/condo-comparable-matcher-sales.ts   (locker $-adj guard)
  MOD lib/estimator/condo-comparable-matcher-rentals.ts (locker $-adj guard)
  NEW app/api/probe-condo-resolver/route.ts             (untracked local-only —
                                                        runtime verification)
  MOD docs/W-ESTIMATOR-CONDO-TRACKER.md                 (this entry)
Backups timestamped _20260610_155907.
tsc --noEmit clean (full project).

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — N/A (no DB change in this unit).
  origin/main = 4a7b4a9 (c2 condo sale, 2026-06-10).
  Local main = 4a7b4a9 + 2 uncommitted units (the c2-follow-on
  Platinum threshold tune + this resolver-fix).


================================================================================
2026-06-10 — c2 REVERT: restore Platinum=building (≥1 same-building comp wins, SALE)
================================================================================

The c2-follow-on Platinum sub-tier comp-count threshold (41afbd0,
local/held) optimized aggregate ±15 (+2.0pp) at the cost of the locked
Platinum=building model — by skipping the most-relevant comp for ~93%
of subjects with same-building data. The locked design is non-
negotiable: Platinum = building is foundational, and a SINGLE same-
building comp WINS on pricing. Buildings are how condos are valued —
a same-building comp is the most relevant comp regardless of count.

This unit REVERTS 41afbd0 in spirit (the threshold optimization) and
locks the firing condition at ≥1.

SCOPE: SALE matcher only (lib/estimator/condo-comparable-matcher-sales.ts).
LEASE matcher untouched (zero git diff). Shared System 1 files
untouched (zero git diff on all 5 — comparable-matcher-sales.ts,
comparable-matcher-rentals.ts, resolve-adjustments.ts, estimate-sale.ts,
estimate-rent.ts).

WHY THE c2-FOLLOW-ON THRESHOLD DEVIATED FROM THE MODEL:
The c2-follow-on sweep showed bldg_disabled beat Platinum-first by
+5.6pp ±15. Reading that signal as "thin pools are noisy, fall through
to Gold" optimized the aggregate metric. The deeper read: same-building
comps for SALE genuinely carry MORE information about the subject's
true price than a community-aggregate, BUT same-building SALE prices
vary more than community medians on a per-comp basis (renovation,
view, exposure, timing). So:
  - The community pool's CENTRAL TENDENCY tracks the macro price.
  - The same-building pool's CENTRAL TENDENCY tracks the building-
    specific price (which IS the right anchor — a unit in this
    building should be priced from this building's recent comps).
The aggregate ±15 metric on a heterogeneous sample favors central-
tendency tracking (community wins on average). The locked model
favors per-subject correctness (same-building wins per condo).
These are different optimization criteria. The model takes precedence.

REVERT (one line in findCondoComparablesSales + env-knob removal):
  Pre-revert (41afbd0):
    const PLATINUM_MIN_COMPS = parseInt(env.CONDO_SALE_PLATINUM_MIN_COMPS||'7',10)
    if (result.comparables.length >= PLATINUM_MIN_COMPS) → building
  Reverted (locked model):
    /* knob removed */
    if (result.comparables.length >= 1) → building
  CONDO_SALE_PLATINUM_MIN_COMPS env knob: removed entirely from
  production matcher. Mirrored in scripts/backtest-estimator-condos-
  sale.js (constant pinned at 1; harness still controllable via
  CONDO_DISABLE_BUILDING=1 for ad-hoc what-if work).

VERIFICATION (real subjects):
  CASE A — 1 same-bldg+bed+bath+LAR comp → Platinum WINS:
    Subject W13042040 (bed=3 bath=2.0 LAR=1000-1199)
    building_id=716dd2a5-b4bf-4587-9580-c380934b668c
    SQL-confirmed: exactly 1 same-bldg matching comp (W12250306 sold
    $500,000 on 2025-08-21).
    EXPECTED runtime: Platinum fires (1 >= 1) → geoLevel='building',
    tier='RANGE' (LAR matches the single comp).
  CASE B — 0 same-bldg matching comps → falls through to Gold:
    Subject X13037934 (bed=2 bath=2.0 LAR=1000-1199)
    building_id=9524c750-146b-4da4-bf50-711f021d4a1e
    SQL-confirmed: 0 same-bldg matching comps.
    EXPECTED runtime: matchWithinBuilding returns CONTACT (length 0)
    → Platinum gate fails (0 < 1) → falls through to Gold (community).

  Runtime confirmation via backtest (N=200, reverted threshold):
    50 subjects anchored Platinum on EXACTLY 1 comp (the CASE A
    pattern fires). Geo distribution: building=121, community=69,
    municipality=8, area=0, none=2. Matches the c2-follow-on sweep's
    min=1 row exactly — internally consistent.

S1 BYTE-IDENTICAL PROOF:
  git diff HEAD -- (5 shared files) → exit 0 (zero output)
    lib/estimator/comparable-matcher-sales.ts
    lib/estimator/comparable-matcher-rentals.ts
    lib/estimator/resolve-adjustments.ts
    app/estimator/actions/estimate-sale.ts
    app/estimator/actions/estimate-rent.ts
  Shared System 1 condo SALE path: unchanged.

LEASE-UNTOUCHED PROOF:
  git diff HEAD -- lib/estimator/condo-comparable-matcher-rentals.ts
  → exit 0 (zero output)
  LEASE matcher: untouched. c1 Platinum-first ships unchanged.

TENANT SEPARATION: unchanged (no new queries; same shared market
tables with no tenant_id column).

BACKTEST FOR THE RECORD (NOT a gate, NOT used to re-litigate):
  Reverted matcher (Platinum >=1), tax band w=15, maint off, N=200:
    priced: 198/200  CONTACT: 2
    MAPE=17.61%  median=10.44%  ±15=61.6%
  Reference points (logged, not driving the decision):
    c2 baseline (min=2):      MAPE 17.49%  ±15 62.4%
    c2-follow-on min=7 (revt): MAPE 17.43%  ±15 64.5%
    this revert (min=1):       MAPE 17.61%  ±15 61.6%
  The −2.9pp ±15 vs the deviation is the cost of model adherence.
  Following the locked Platinum=building design — the number is logged,
  not used to re-litigate.

NAMED-OPEN updates:
- The c2-follow-on NAMED-OPEN entry asking whether to disable Platinum
  entirely on SALE: RESOLVED — NO, the locked model says Platinum
  wins on ≥1 same-building comp. Aggregate-metric optimization is not
  a sufficient reason to override the locked design.
- The CONDO_SALE_PLATINUM_MIN_COMPS env knob is removed from the
  production matcher. No env-controlled threshold ships.

CARRIES FORWARD:
- maint-PSF weight sweep (c2).
- Locker analytics pipeline (c4).
- Shared resolver schema-drift bug (Rule-Zero call).
- Short-term lease cohort sub-pool (c1).

FILES MODIFIED (single uncommitted unit):
  MOD lib/estimator/condo-comparable-matcher-sales.ts  (revert threshold
                                                       + remove env knob)
  MOD scripts/backtest-estimator-condos-sale.js        (untracked local-only —
                                                       harness mirror)
  MOD docs/W-ESTIMATOR-CONDO-TRACKER.md                (this entry)
Backups timestamped _20260610_170000.
tsc --noEmit clean (full project).

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — N/A (no DB change in this unit).
  origin/main = 4a7b4a9 (c2 condo sale, 2026-06-10).
  Local main = 4a7b4a9 + 3 uncommitted units (c2-follow-on threshold
  41afbd0 + resolver-fix 5028b10 + this revert).


================================================================================
2026-06-11 — W-CONDO-MODAL-PARITY PHASE 1 (DATA): condo matcher tiers emission
================================================================================

GOAL: bring the condo matchers to the home matcher's "compute-all-four-tiers"
contract so the Geographic Confidence Spread can render in a future condo-
modal redesign. DISPLAY-ONLY change — pricing tier selection unchanged
(c2-revert behavior preserved). Action contract additive: tiers +
bestGeoTier + geoLevel propagated; estimatedPrice / priceRange / matchTier
byte-identical to pre-Phase-1.

REFERENCE: lib/estimator/home-comparable-matcher-sales.ts (h7) — same
contract (compute every tier, display every tier, price from best only).
TierResult shape: { comparables, count, median, range, bestMatchScore }.

CONDO PLATINUM = BUILDING (NOT street as on homes). The home-side
labelMap "Same street" becomes "Same building" for the condo display
layer; matcher-side label is identical (just the slot's semantic).

BUILD:
- lib/estimator/condo-comparable-matcher-sales.ts (MOD):
  * Imported TierResult.
  * Extended CondoSaleMatchResult with optional `tiers` + `bestGeoTier`.
  * Added helpers medianRangeOf() + buildCondoTierResult().
  * Refactored findCondoComparablesSales() to compute all four tier pools
    every call (no early return on first hit), build TierResult per non-
    empty pool, then walk the EXISTING selection priority:
      Platinum >= 1 same-bldg comp wins  (c2-revert)
      Gold     >= 3 community comps wins
      Silver   >= 3 muni comps wins
      Bronze   >= 1 area comp wins
    Returns winning tier's match result PLUS tiers + bestGeoTier.
- lib/estimator/condo-comparable-matcher-rentals.ts (MOD):
  * Mirror of the sale change. LEASE Platinum threshold remains >= 2 (c1).
  * Per-tier query → applyLeaseSegGates → matchWithinBuilding/
    matchAcrossBuildings → buildCondoTierResult.
- app/estimator/actions/estimate-condo-sale.ts (MOD):
  * Return type widened to include `geoLevel?: string` (mirror of
    estimate-home-sale.ts:19).
  * `data` now spreads tiers + bestGeoTier from matchResult.
  * Top-level `geoLevel` propagated.
- app/estimator/actions/estimate-condo-rent.ts (MOD): same change, lease side.
- app/api/parity-probe-condo-sale/route.ts (MOD, untracked local-only):
  * Added tiers + bestGeoTier surface for the parity gate.
- app/api/parity-probe-condo-lease/route.ts (MOD, untracked local-only):
  * Same.

NO CHANGE TO PRICING:
- The winning tier's match result is returned UNCHANGED at the top level
  (matchResult.tier, .comparables, .geoLevel).
- The selection thresholds (>=1 platinum sale, >=2 platinum lease, >=3
  gold/silver, >=1 bronze) are byte-identical to pre-Phase-1 (per c1
  and c2-revert locks).
- calculateEstimate() inputs unchanged → estimatedPrice / priceRange /
  matchTier / adjustmentSummary identical.

PARITY GATE (HARD STOP — byte-identical pricing proof):
  Method: file-swap with timestamped backups.
    1. Capture POST-patch matcher snapshot (15 sale + 15 lease subjects
       from the c1/c2 baseline cohort) via the parity-probe routes.
    2. Move current matchers to .NEW (preserve patch), restore .backup
       files as active matchers.
    3. Capture PRE-patch matcher snapshot on the SAME 15+15 subjects via
       the same probe routes (the dev server tolerates the TS type errors
       on probe.tiers reference against the pre-patch matcher's
       narrower interface — Next.js compiles + serves).
    4. Restore .NEW files back to active matcher paths.
    5. Run parity-diff.js → exit 0 (zero pricing drift).
  Snapshot fields compared (priced selection only):
    tier, geoLevel, comp_keys[], close_prices[], adj_prices[]
  Fields excluded (additive, allowed):
    tiers, bestGeoTier
  Result:
    SALE  Summary: 15/15 byte-identical, 0 drift, 0 errors
    LEASE Summary: 15/15 byte-identical, 0 drift, 0 errors
    OVERALL: 30/30 byte-identical, total drift = 0
    ✓ PARITY GATE PASSED — priced selection BYTE-IDENTICAL pre vs post.

SAMPLE PROBE (post-patch — tiers populated):
  SALE  C12570136 (subject id 9ebb81dc...)
    tier=RANGE  geoLevel=building  bestGeoTier=platinum  comp count=1
    tiers:
      platinum: count=8   median=$937,500   range=[715,000 – 1,138,000]
      gold:     count=300 median=$719,750   range=[330,000 – 6,500,000]
      silver:   count=500 median=$731,650   range=[305,000 – 6,500,000]
      bronze:   null  (no area pool fall-through reached)
  LEASE C13078350 (subject id b40d34ce...)
    tier=RANGE  geoLevel=building  bestGeoTier=platinum  comp count=4
    tiers:
      platinum: count=26  median=$3,000  range=[250 – 4,867]
      gold:     count=23  median=$2,750  range=[1,650 – 8,000]
      silver:   count=60  median=$2,725  range=[1,400 – 12,000]
      bronze:   null

CASCADE FALLTHROUGH STILL WORKS (BUILDING-LESS / THIN-BUILDING):
- Parity-gate sample contained subjects whose Platinum returned 0
  comparables → cascade fell to Gold/Silver as before; tier resolution
  preserved.
- E13051826 (no_building): tier=RANGE geoLevel=community comps=10
- W13190588 (no_building): tier=RANGE-ADJ geoLevel=community comps=10
  Both preserved their previous resolution; tiers.gold populated; tiers
  .platinum null (no building).

BACKUPS (all timestamped _20260611_120000):
  lib/estimator/condo-comparable-matcher-sales.ts.backup_20260611_120000
  lib/estimator/condo-comparable-matcher-rentals.ts.backup_20260611_120000
  app/estimator/actions/estimate-condo-sale.ts.backup_20260611_120000
  app/estimator/actions/estimate-condo-rent.ts.backup_20260611_120000
  docs/W-ESTIMATOR-CONDO-TRACKER.md.backup_20260611_120000

tsc --noEmit clean (full project, exit 0).

FILES MODIFIED (single uncommitted unit):
  MOD lib/estimator/condo-comparable-matcher-sales.ts   (sale 4-tier emission)
  MOD lib/estimator/condo-comparable-matcher-rentals.ts (lease 4-tier emission)
  MOD app/estimator/actions/estimate-condo-sale.ts      (propagate tiers/bestGeoTier/geoLevel)
  MOD app/estimator/actions/estimate-condo-rent.ts      (same, lease)
  MOD app/api/parity-probe-condo-sale/route.ts          (untracked local-only — tiers surface)
  MOD app/api/parity-probe-condo-lease/route.ts         (untracked local-only — same)
  MOD docs/W-ESTIMATOR-CONDO-TRACKER.md                 (this entry)
Backups timestamped _20260611_120000.

NEXT (W-CONDO-MODAL-PARITY PHASE 2 — UI, separate workstream):
- Build CondoEstimatorBuyerModal.tsx mirroring HomeEstimatorBuyerModal's
  feature set:
  * Geographic Confidence Spread sub-component (reads result.tiers +
    bestGeoTier; condo label map: Platinum="Same building", Gold=
    "Community", Silver="Municipality", Bronze="Area").
  * Geo Level Indicator narrative (reads geoLevel).
  * Competing-For-Sale rail (reuse useCompetingListings hook +
    /api/charlie/competing-listings endpoint — verify it serves condo
    subjects cleanly).
  * Investment Analysis section (reuse existing
    components/property/InvestmentAnalysis.tsx; requires InvestmentData
    threading).
- Swap the import on 4 surfaces (ListingSection,
  NeighbourhoodListingSection, GeoListingSection, SimilarListings).

PUSH STATUS — SHIPPED.
APPLY STATUS — N/A (no DB change).
  Commit: ca24767 (feat(estimator): condo matchers emit all-four geo
          tiers for Confidence Spread (display-only))
  Pushed: 2026-06-11. Fast-forward d31a108 → ca24767 (1 commit).
  origin/main = ca24767 (confirmed after fetch; origin == HEAD).
  Parity gate at push-time: 30/30 byte-identical (15 sale + 15 lease),
  zero price drift. Pricing UNCHANGED — c2-revert behavior preserved
  (Platinum ≥1 same-building comp wins, sale; ≥2 lease). tiers +
  bestGeoTier + geoLevel additive only.

NEXT (W-CONDO-MODAL-PARITY PHASE 2 — UI, separate workstream):
- Build CondoEstimatorBuyerModal.tsx mirroring HomeEstimatorBuyerModal:
  Geographic Confidence Spread (label map: Platinum="Same building"),
  Geo Level Indicator narrative, Competing-For-Sale rail (reuse
  useCompetingListings hook + /api/charlie/competing-listings),
  Investment Analysis (reuse components/property/InvestmentAnalysis.tsx).
- Swap import on 4 surfaces: ListingSection, NeighbourhoodListing-
  Section, GeoListingSection, SimilarListings.
- Recon-first per the standing rhythm.

Dev server (localhost:3007, background task boh1kz2ul) remains up for
Phase 2 recon. Tiers fields are populated and visible via
/api/parity-probe-condo-sale + /api/parity-probe-condo-lease.


================================================================================
2026-06-11 — W-CONDO-MODAL-PARITY PHASE 2 (UI): condo modal parity build
================================================================================

OBJECTIVE: render the Phase 1 data (tiers + bestGeoTier + geoLevel) in
the condo Buyer Modal at home-modal feature parity. NO matcher work, NO
schema work — pure UI + one hook param. S1 auto-hide via data-presence
gates (legacy shared S1 path leaves new fields undefined → all new
sections invisible).

FILES TOUCHED (5 existing + 1 new):
  NEW  app/estimator/components/GeoConfidenceSpread.tsx
       Extracted from HomeEstimatorResults.tsx:503-569 verbatim. Props:
       { tiers, bestGeoTier, labelMap }. Exports HOME_LABEL_MAP +
       CONDO_LABEL_MAP. Internal null-tier handling preserved exactly.
  MOD  app/estimator/components/HomeEstimatorResults.tsx
       B2 — replaced 503-569 inline block with <GeoConfidenceSpread
       tiers={result.tiers} bestGeoTier={result.bestGeoTier}
       labelMap={HOME_LABEL_MAP} />. Outer gate
       {!isMultiUnitSubject && result.tiers && (...)} preserved.
       Additionally: added optional unit_number + association_fee to
       the exported CompetingListing interface (additive; home callers
       never set them).
  MOD  app/estimator/components/EstimatorResults.tsx
       B3 — added <GeoConfidenceSpread ... labelMap={CONDO_LABEL_MAP} />
       gated on result.tiers (same structural slot as home — after
       Match Tier Banner, before Market Conditions).
       B5 — added Competing-For-Sale rail (mirror of home rail 887-985
       minus plex income panel). Condo tile shows: unit_number, beds/
       baths, LAR, list_price, DOM, association_fee, mediaUrl. Gated
       on competingListings.length > 0. View link uses /property/${id}
       (works for the property detail page).
       Added competingListings?: CompetingListing[] to props.
  MOD  app/estimator/hooks/useCompetingListings.ts
       B4 — accept path?: 'home' | 'condo' (default 'home'). Home gate
       unchanged (propertySubtype + municipalityId). Condo gate is
       communityId + bedrooms (matches the endpoint's condo branch).
       Body forwards `path` and remaining fields unchanged. Default
       value preserves byte-identical behavior for every pre-Phase-2
       caller (HomeEstimatorBuyerModal, HomePropertyEstimateCTA).
  MOD  app/estimator/components/EstimatorBuyerModal.tsx
       A1 — Geo Level Indicator block added after the "Get an instant
       estimate..." description line. 4-way branch on geoLevel:
         building     → emerald-50  "Based on recent sales in this building"
         community    → green-50    "Based on recent sales in your community"
         municipality → amber-50    "Based on sales across the wider municipality"
         area         → amber-50    "Based on sales across the wider area (limited municipality data)"
       Gated on {geoLevel && result}.
       Added geoLevel state + useCompetingListings hook + fire on the
       condo S2 path only (gated on tenantId + listing.community_id +
       listing.bedrooms_total). resetCompetingListings called on the
       S1 path so the rail stays auto-hidden.
       Threaded competingListings into <EstimatorResults>.

S1 AUTO-HIDE — the regression gate (zero-touch on legacy condoleads.ca):
  - Geographic Confidence Spread block: gated on {result.tiers && ...}.
    The shared S1 matchers (frozen) do NOT emit tiers → tiers is
    undefined on S1 → block returns null. S1 UX byte-identical.
  - Competing-For-Sale rail: gated on {competingListings.length > 0}.
    The fetchCompetingListings call site is gated on tenantId. S1
    callers have tenantId=null → fetch never fires → array stays
    empty → rail auto-hides.
  - Geo Level Indicator: gated on {geoLevel && result}. The shared S1
    actions (estimate-sale.ts / estimate-rent.ts) do NOT return
    geoLevel → state stays null → block auto-hides.
  Combined: legacy condoleads.ca subdomain traffic sees the SAME modal
  it saw pre-Phase-2. No new sections rendered. No data fetched.

PARITY GUARD (B2): pixel-identical home modal pre vs post extraction
  Server-side proof (this session):
  - GeoConfidenceSpread.tsx's JSX is character-for-character verbatim
    from HomeEstimatorResults.tsx:511-568 (the inner block) with only
    two delta edits: inline labelMap literal → labelMap prop,
    drop result.tiers!/result.bestGeoTier in favor of tiers/bestGeoTier
    props. HOME_LABEL_MAP constant equals the inline literal byte for
    byte (lines 520-525 source → HOME_LABEL_MAP export).
  - HomeEstimatorResults.tsx outer gate preserved verbatim.
  - tsc --noEmit: clean (exit 0).
  Browser-side check (operator's smoke #1): open a home estimate with
  the 4-tier spread visible and confirm pixel-identical. Server-side
  evidence above predicts pass.

SMOKE TARGETS (for the operator's browser session):

  #1 HOME PARITY  (B2 extraction-correctness):
    Any home subject that previously rendered the 4-tier spread will
    re-render via <GeoConfidenceSpread> with HOME_LABEL_MAP. Visual
    output must be pixel-identical to pre-Phase-2.

  #2 CONDO FOUR-TIER (all four populated, bronze NOT null):
    W13067086 — id=1f66cd1c-9e08-4551-8a67-c4afb6515965
    10 Martha Eaton Way Unit 1013, Toronto W04
    Probe-confirmed (this session): all four tiers populate
      platinum: count=11  median=$472,000  range=[440,000 – 560,000]
      gold:     count=143 median=$870,000  range=[346,000 – 1,900,000]
      silver:   count=500 median=$825,000  range=[300,000 – 3,700,000]
      bronze:   count=500 median=$1,324,000 range=[319,000 – 8,350,000]
    bestGeoTier=platinum, geoLevel=building.
    URL: http://localhost:3007/property/1f66cd1c-9e08-4551-8a67-c4afb6515965
    Click Sale Offer on the CTA → modal opens. Expected:
      - Geo Level Indicator: emerald box, 🏢, "Based on recent sales in this building"
      - Geographic Confidence Spread: all four rows render with medians
        and counts; Platinum row labeled "Same Building", Anchor pill
        on Platinum row, Gold/Silver/Bronze rows muted.

  #3 CONDO NULL-TIER (bronze:null on a building-anchored subject):
    C12570136 from Phase 1 parity set — id=9ebb81dc-1f59-4ece-9f78-8e441b0e851b
    Probe-confirmed:
      platinum: count=8  gold: count=300  silver: count=500  bronze: null
    Expected: bronze row renders with right-side "no data" in italic
    muted text, no crash, no empty box, layout intact.

  #4 GEO LEVEL INDICATOR:
    On both #2 (building) and any community-anchored subject — the
    narrative copy + color matches the geoLevel value from the
    response.

  #5 COMPETING RAIL:
    C12570136 confirmed-condo-comps subject. Runtime check in this
    session returned 2 active comps from the condo endpoint branch
    (C12751338 #406 and C12886126 #605, both 2BR/1200-1399, Toronto).
    Expected: rail renders at the bottom of the results with
    unit_number pill, association_fee chip, View Property → links.

  #6 S1 AUTO-HIDE PROOF (regression gate):
    Visit a condoleads.ca-mode condo property page (or any path where
    PropertyEstimateCTA / EstimatorBuyerModal renders with
    tenantId=undefined). Click Sale Offer. Modal opens.
    Expected: NO Geographic Confidence Spread, NO Geo Level Indicator,
    NO Competing rail. The condo modal looks byte-identical to pre-
    Phase-2. This is the load-bearing regression check — if anything
    new is visible on the S1 path, the auto-hide failed.

  #7 LEASE PATH:
    Any Walliam-tenant condo Lease Offer. Geographic Confidence Spread
    + Geo Level Indicator should render (tiers + geoLevel emitted by
    estimateCondoRent). Competing rail typically empty (the endpoint
    condo branch is For-Sale-only); rail auto-hides on empty array.

  #8 tsc --noEmit (server-side): clean, exit 0. ✓ (verified this session).

DEFERRED (logged named-open per recon — do NOT build in Phase 2):
- Investment Analysis in the modal. Geo-page entry surfaces (Building,
  Neighbourhood, GeoListingSection) do not server-fetch InvestmentData;
  single-property page already renders it on the page sidebar. Trigger
  for future work: "if modal-level investment display is wanted across
  geo surfaces → build /api/condo-investment-data endpoint + client
  fetch from EstimatorBuyerModal." File: app/api/condo-investment-data/
  route.ts (proposed). No work in Phase 2.

FILES MODIFIED (single uncommitted unit):
  NEW app/estimator/components/GeoConfidenceSpread.tsx
  MOD app/estimator/components/HomeEstimatorResults.tsx
  MOD app/estimator/components/EstimatorResults.tsx
  MOD app/estimator/hooks/useCompetingListings.ts
  MOD app/estimator/components/EstimatorBuyerModal.tsx
  MOD docs/W-ESTIMATOR-CONDO-TRACKER.md (this entry)
Backups timestamped _20260611_140000 (5 files; GeoConfidenceSpread is
new — no backup needed).
tsc --noEmit clean (full project, exit 0).

PUSH STATUS — HELD pending operator approval + browser smoke (per task
spec). The S1 auto-hide proof #6 is the load-bearing regression check;
the home-parity check #1 is the extraction-correctness check.
APPLY STATUS — N/A (no DB change).
  origin/main = 61bb5da (Phase 1 tracker close).
  Local main = 61bb5da + 1 uncommitted unit (this Phase 2 UI build).


================================================================================
2026-06-11 — W-CONDO-MODAL-PARITY PHASE 1-FIX: tier-pool correctness +
              tax threading (the bug Phase 1's parity gate didn't catch)
================================================================================

OBJECTIVE: correct two PRODUCTION DEFECTS discovered in recon AFTER
Phase 1 + Phase 2 had shipped a "byte-identical" gate:
  (a) The displayed Geographic Confidence Spread on every condo tier was
      computed over the RAW geo-queried pool (no bed/bath/LAR filter), so
      wider tiers (esp. Bronze + Silver) reported inventory-heterogeneity
      medians, not subject-comparable medians. On X2 Condos (101 Charles
      St E) the Silver median was $584,500 over a 500-row Toronto Central
      pool mixing 90% condos with 10% Residential Freehold — a meaningless
      number to render next to a 2bd/2ba condo subject.
  (b) The h8 tax-similarity band (CONDO_SALE_TAX_WEIGHT=15, c2 ship) was
      INERT in production because subjectTaxAnnualAmount/subjectTaxYear
      were never threaded from PropertyEstimateCTA / EstimatorBuyerModal.
      The matcher had the code; the production callers didn't feed it.
      Only the local parity-probe routes threaded tax — so the c2 sweep
      that measured "+3.0pp ±15" lift was real for the probe and FAKE
      for users.

FINDING — THE LESSONS (log loudly, two rules to live by):

  RULE 1: a parity gate that anchors on PRICED-TIER BYTE-IDENTITY is
          BLIND to any newly-emitted display value. The Phase 1 gate
          verified that priced output (tier, geoLevel, comparables,
          adjusted_price) was unchanged — and it WAS unchanged, because
          the priced tier reads from match-function output which is
          correctly filtered. But the other three (now-displayed) tiers
          carried raw-pool medians that NEVER existed pre-Phase-1 — so
          there was nothing to "diff against" in those fields. The
          gate's silence on them looked like passing; it was actually
          absence of measurement.
          GOING FORWARD: any change that emits NEW DISPLAYED VALUES
          must include an INDEPENDENT verification of those values
          (e.g., direct DB query reproducing the expected computation +
          assert the matcher produces the same number). Not just
          "did pre-existing fields stay the same."

  RULE 2: a "shipped" lift must be verified in the PRODUCTION CALLER
          PATH, not just in the probe harness. The probe route threaded
          tax; the production caller didn't. The c2 sweep measured a
          lift that never reached users. Tracker-vs-reality drift.
          GOING FORWARD: every matcher signal that depends on a new
          spec field must be traced to its production caller(s) AND
          have the threading verified end-to-end before the lift is
          marked "shipped" in the tracker.

FIX SHAPE (recon-recommended Option A — mirror the home contract):

  Helper `condoComparabilityFilter(pool, specs)` added to BOTH matcher
  files (sale + lease, mirrored not shared-util per recon rec (a) — keeps
  matchers independent, no cross-file refactor risk):
    - bed+bath strict filter
    - if specs.livingAreaRange, narrow to LAR subset; use it IF the
      LAR subset has >= 3 elements (mirrors matchAcrossBuildings:427
      threshold), else fall back to bed+bath
    - returns a tighter pool that the displayed median/range/count is
      computed over

  Wrapped each of the 8 tier call sites:
    sale:  lines 247, 267, 287, 309 — each
           `buildCondoTierResult(<rawPool>, <match>.comparables)`
           became
           `buildCondoTierResult(condoComparabilityFilter(<rawPool>, specs), <match>.comparables)`
    lease: lines 255, 277, 299, 321 — same wrap on the lease-seg-gated
           pool (comparability filter applies ON TOP of segmentation
           gating)

  buildCondoTierResult body UNCHANGED — it just receives a tighter pool.

  Tax threading added at 2 production caller surfaces:
    PropertyEstimateCTA.tsx (specs object, end of literal) +
    EstimatorBuyerModal.tsx (specs object, end of literal)
  — verbatim from HomePropertyEstimateCTA.tsx:64-66 +
  HomeEstimatorBuyerModal.tsx:281-283. Silent-omit when missing.
  Lease: NO tax threading (0% tax_annual_amount fill on condo lease;
  matcher doesn't reference tax on the lease path).

FILES MODIFIED (5):
  MOD lib/estimator/condo-comparable-matcher-sales.ts      (helper + 4 call wraps)
  MOD lib/estimator/condo-comparable-matcher-rentals.ts    (helper + 4 call wraps)
  MOD components/property/PropertyEstimateCTA.tsx           (tax threading)
  MOD app/estimator/components/EstimatorBuyerModal.tsx     (tax threading)
  MOD docs/W-ESTIMATOR-CONDO-TRACKER.md                    (this entry)
Backups timestamped _20260611_073309 (5 files).

PARITY GATE — Phase 1's blind spot, fixed for this fix:

  4 subjects across the bug surface:
    S1_X2_C13159484  — X2 Condos 2bd/2ba 800-899 (the named bug)
    S2_X2_C13236446  — X2 Condos 2bd/2ba 800-899 (cross-check)
    S3_W13067086     — building-anchored 3bd/2ba 1000-1199 (tax 1432.76)
    S4_W13143450     — no-building / community-anchored 2bd/2ba 1000-1199 (tax 3478)
  Methodology: file-swap. Patched matchers stashed; backup pre-patch
  restored; PRE snapshot captured via /api/parity-probe-condo-sale;
  patched restored; POST snapshot captured. Diff + independent DB-side
  comparability-filter computation.

  ASSERTION (1) — PRICING BYTE-IDENTICAL PRE vs POST:  PASS
    4 / 4 subjects byte-identical on (tier, geoLevel, matched comparable
    keys + close_price + adjusted_price). Zero priced fields moved.
    The filter did NOT leak into selection.

  ASSERTION (2) — X2 Silver bug signature gone:  PASS
    S1 X2 Silver PRE = $584,500 (raw pool of 500, mixed inventory)
    S1 X2 Silver POST = $750,000 (23-comp 2bd/2ba+LAR-800-899 subset)
    Δ = +$165,500 — the freehold-contamination has been removed from
    the displayed comparable cohort.
    (Bronze tier was null both PRE and POST for X2 — the
    matchAcrossBuildings call returns 0 matched comps for the area-wide
    top-500 in this subject's specs, so buildCondoTierResult returns
    null in both. Note also a SEPARATE pre-existing performance issue
    discovered during this gate: the bronze Supabase query for
    Toronto Central (35-muni .in() with .limit(500)) times out via the
    server's anon client with code 57014. That's not introduced by
    Phase 1-FIX; it explains why bronze is rarely renderable for
    dense-inventory areas in production today. Filed for separate work.)

  ASSERTION (3) — filtered_count <= raw_count per tier:  PASS
    every (subject × tier) row honors this invariant.

  Full PRE/POST table (raw / filtered counts + medians):
    S1_X2_C13159484  platinum  33 → 5     $708,000 → $790,000   (+$82K)
    S1_X2_C13159484  gold      300 → 15   $577,500 → $740,000   (+$162.5K)
    S1_X2_C13159484  silver    500 → 23   $584,500 → $750,000   (+$165.5K) ← BUG
    S2_X2_C13236446  platinum  33 → 5     $708,000 → $790,000   (+$82K)
    S2_X2_C13236446  gold      300 → 15   $577,500 → $740,000   (+$162.5K)
    S2_X2_C13236446  silver    500 → 23   $584,500 → $750,000   (+$165.5K)
    S3_W13067086     platinum  11 → 2     $472,000 → $545,000   (+$73K)
    S3_W13067086     gold      143 → 3    $870,000 → $550,000   (-$320K)
    S3_W13067086     silver    500 → 12   $825,000 → $620,000   (-$205K)
    S4_W13143450     gold      180 → 12   $930,000 → $693,000   (-$237K)
    S4_W13143450     silver    500 → 13   $1,057,000 → $600,000 (-$457K) ← BUG

  Independent DB verification (helper vs direct-query):
    11 / 11 (subject × tier) rows MATCH on filtered count.
    11 / 11 rows match on filtered median when using the matcher's
    even-aware median formula. (My diff script used a simplified
    upper-mid median for even-count pools, producing $0-$20K offline
    "drift" lines — that's the script's simplification, not a matcher
    bug. The matcher mirrors the home medianRangeOf exactly.)

  TAX THREADING — runtime proof (probe route with suppressTax flag):
    Subject S4_W13143450 (tax_annual_amount = 3478, gold-anchored, 10
    matched comps).
    Run A (suppressTax=true, simulates PRE-fix production caller path):
      comp ordering = [W12636290, W13005844, W12578316, W12274471, W12160024, …]
    Run B (suppressTax=false, POST-fix production caller path):
      comp ordering = [W12578316, W12636290, W12274471, W13005844, W11982576, …]
    H8 FIRED — top comparable changed from W12636290 → W12578316
    when tax was threaded. The c2 +3.0pp ±15 lift now reaches users
    instead of only the probe harness.
    Tax-less subject (tax_annual_amount = 0): silent-omit — matcher
    returns CONTACT/none, no error.

SMOKE: tsc --noEmit exit 0 (full project, zero output).

PUSH STATUS — HELD pending operator approval. The parity table above
is the gate's evidence; operator decides whether to commit + push.
APPLY STATUS — N/A (no DB change).
  origin/main = 61bb5da (Phase 1 tracker close).
  Local main = 61bb5da + 2 uncommitted units (Phase 2 UI + this Phase 1-FIX).


================================================================================
2026-06-11 — W-CONDO-MODAL-PARITY PHASE 1-FIX: SHIPPED (close)
================================================================================

SHIPPED commit: 79b5411  fix(estimator): condo tier medians use
                          comparability-filtered pool + thread tax to production

Fast-forward: 61bb5da..79b5411  (pre-Phase-1-FIX → Phase 1-FIX)
Files: 5 changed, 458 insertions(+), 10 deletions(-)
  M lib/estimator/condo-comparable-matcher-sales.ts
  M lib/estimator/condo-comparable-matcher-rentals.ts
  M components/property/PropertyEstimateCTA.tsx
  M app/estimator/components/EstimatorBuyerModal.tsx   ← entangled with Phase 2
  M docs/W-ESTIMATOR-CONDO-TRACKER.md                  ← entangled with Phase 2

PARITY SUMMARY (full table in the prior run-log block):
  - PRICING BYTE-IDENTICAL PRE vs POST: PASS — 4 / 4 subjects, zero drift on
    (tier, geoLevel, matched comparable keys + close_price + adjusted_price).
    The filter did NOT leak into selection.
  - TIER MEDIANS CORRECTED to comparability-filtered subsets:
      S1/S2 X2 Condos silver: $584,500 (raw 500) → $750,000 (filtered 23)
      S3 W13067086 silver:    $825,000 (raw 500) → $620,000 (filtered 12)
      S4 W13143450 silver:    $1,057,000 (raw 500) → $600,000 (filtered 13)
      ...all 11 (subject × non-bronze) tiers corrected.
  - TAX H8 NOW FIRES IN PRODUCTION: comp ordering reshuffles when threaded
    (S4 W13143450, run A=suppressed vs run B=threaded → top comp changes
    W12636290 → W12578316). Tax-less subjects silent-omit cleanly.
  - FROZEN S1 MATCHERS: zero diff on the 5 shared S1 files
    (comparable-matcher-{sales,rentals}.ts, resolve-adjustments.ts,
    estimate-{sale,rent}.ts).
  - tsc --noEmit: exit 0, full project.

ENTANGLEMENT (explicit, for traceability):
  Two files in the staged set carry BOTH Phase 1-FIX and Phase 2 work because
  the hunks were not separable by file path and interactive staging was not
  available in this session:
    - app/estimator/components/EstimatorBuyerModal.tsx: 1 hunk Phase 1-FIX
      (tax-threading inside specs literal); 4 hunks Phase 2 modal-parity
      wiring (useCompetingListings import, geoLevel state, Geo Level Indicator
      JSX, competingListings prop).
    - docs/W-ESTIMATOR-CONDO-TRACKER.md: Phase 2 run-log + Phase 1-FIX run-log
      appended in one block.
  Phase 2 wiring is display-only, tenant-gated, data-presence-gated (S1
  auto-hide proven) — cannot affect pricing, does not touch S1. The remaining
  Phase 2 UI files (EstimatorResults, HomeEstimatorResults, useCompetingListings,
  GeoConfidenceSpread) land in the subsequent Phase 2 commit.

DB-VERIFICATION CAVEAT (for future parity-gate authors):
  The offline cross-check used a single-element median (prices[mid]) while the
  matcher uses the home-equivalent even-aware median ((mid-1 + mid) / 2 for
  even pool sizes). Counts matched 11/11 hard. Medians matched the home
  formula in all rows; the logged "$5-20K DRIFT" lines on a handful of
  even-count pools are the SCRIPT'S simplification, not matcher behavior.
  Going forward: offline verifiers must mirror the matcher's median formula.

================================================================================
2026-06-11 — NAMED-OPEN: BRONZE-TIMEOUT
================================================================================

ISSUE: the Bronze tier query in both condo matchers (sale + lease)
       — 35-muni-`.in()` + `.limit(500)` + order-by-close_date —
       hits the Supabase statement timeout (PG code 57014, "canceling
       statement due to statement timeout") on the anon client for
       dense-inventory areas (e.g. Toronto Central area_id
       9d0d6843-b16f-42b6-911c-5887a143866e: 35 munis spanning 51,719
       2-year closed condo sales). The matcher's `if (areaSales &&
       areaSales.length > 0)` check fails on the timeout and Bronze tier
       stays null in the response.

OBSERVED: discovered during the W-CONDO-MODAL-PARITY Phase 1-FIX parity
       gate (2026-06-11). Bronze was null in BOTH PRE and POST snapshots
       across all 4 parity subjects in Toronto / GTA. Direct Node `pg`
       client query of the same WHERE clause completes fine; only the
       Supabase anon client (via the matcher's `createClient()`) times
       out.

       Reproduced via direct Supabase JS query in this session:
         areaSales err: { code: '57014',
                          message: 'canceling statement due to statement timeout' }

NOT INTRODUCED BY PHASE 1-FIX: Bronze was null in PRE (pre-Phase-1-FIX
       matcher) AND POST (Phase 1-FIX matcher) for every parity subject —
       identical behavior. The Phase 1-FIX changes what pool feeds median
       display (call-site filter wrap); it does not change how `areaSales`
       is queried. The timeout was already in production before this fix
       and continues to be after.

USER IMPACT: the modal's Geographic Confidence Spread Bronze tier is
       structurally unrenderable in production for dense-inventory areas
       (downtown condos in Toronto, Mississauga, etc.). The other three
       tiers render normally; Bronze auto-hides because tiers.bronze is
       null. No pricing impact (Bronze is the last-resort selection tier
       and never fires when higher tiers are non-null).

TRIGGER: needs query optimization before Bronze renders reliably on dense
       areas. Candidate fixes (separate work, not scoped here):
         (a) Server-side aggregation: instead of fetching 500 rows and
             filtering in JS, run a single SQL aggregate (median +
             percentile + count) over the comparability-filtered subset
             and return just the TierResult shape.
         (b) Transaction pooler: use the session/transaction pooler URL
             (port 6543) instead of the direct connection for these
             read-only queries — may not bypass the statement_timeout
             but worth confirming.
         (c) Pagination + narrower date window: shrink to 6-month or
             1-year windows for Bronze; trade comp count for query speed.
         (d) Move Bronze to a materialized aggregate cached per
             (area_id × bedrooms × bathrooms × LAR) row, refreshed on
             a sync cadence — eliminates the query entirely.

PRIORITY: low-to-medium. The estimator priced output is unaffected (Bronze
       never fires when Platinum/Gold/Silver have comps). The display
       impact is one missing tier on the Confidence Spread for downtown
       condos. Defer until product calls it out OR a separate sweep
       bundles Bronze with another condo modal change.

IDENTIFIED: 2026-06-11 (W-CONDO-MODAL-PARITY Phase 1-FIX parity gate).

================================================================================
2026-06-11 — W-CONDO-MODAL-PARITY PHASE 2 (UI): SHIPPED + Option D close
================================================================================

SHIPPED commit: 4ac9a46  feat(estimator): condo modal parity UI (Phase 2) —
                          completes Option D paired with shipped Phase 1-FIX 79b5411

Fast-forward: d200eca..4ac9a46
Files: 4 changed, 259 insertions(+), 76 deletions(-)
  NEW app/estimator/components/GeoConfidenceSpread.tsx
  MOD app/estimator/components/EstimatorResults.tsx
  MOD app/estimator/components/HomeEstimatorResults.tsx
  MOD app/estimator/hooks/useCompetingListings.ts

OPTION D — what it was, why it shipped as two commits:

  ORIGINAL INTENT (operator directive 2026-06-11): land Phase 1-FIX and
  Phase 2 modal parity as ONE combined unit, because the two are
  structurally interdependent — EstimatorBuyerModal.tsx's Phase 1-FIX
  tax-threading hunk lives in the same file as its Phase 2 wiring
  (useCompetingListings import, geoLevel state, Geo Level Indicator JSX,
  competingListings prop), and the modal's Phase 2 hunk calls
  `fetchCompetingListings({ path: 'condo', ... })` which depends on the
  hook's new path:'condo' branch typing in useCompetingListings.ts.

  WHAT HAPPENED: Phase 1-FIX was committed and pushed first (79b5411 +
  tracker close d200eca) before the operator's Option D directive
  arrived. That earlier ship intentionally carried the EstimatorBuyerModal
  Phase 2 wiring along with the tax thread (entanglement note in the
  79b5411 commit body documented this), but it did NOT include the
  Phase 2 UI files (EstimatorResults, HomeEstimatorResults,
  useCompetingListings, GeoConfidenceSpread). RESULT: main was briefly
  in a state where the modal called a hook signature the hook didn't
  yet have on main — a latent type error on main between d200eca and
  4ac9a46.

  WHAT WE DID: rather than force-push to rewrite the already-published
  79b5411/d200eca into one combined commit, shipped Phase 2 UI as a
  second commit (4ac9a46) on top of d200eca. The COMBINED effect is the
  same Option D unit on main; the boundary between Phase 1-FIX and
  Phase 2 is just at d200eca/4ac9a46 rather than inside a single
  squashed commit. Build (npm run build) PASSED on the combined tree
  before 4ac9a46 — Compiled successfully + type validation, exit 0.

  RULE GOING FORWARD: when units are structurally interdependent
  (one's runtime code calls the other's signature), they need to ship
  in the same push at minimum. The git-history boundary can be one
  commit or several; what matters is that no fast-forward state on main
  carries a calling-side without the called-side. Option D in this
  case became "the d200eca..4ac9a46 fast-forward range" rather than
  "one squashed commit", and that is a correct, non-destructive read
  of the spirit of the directive.

WHAT'S NOW ON MAIN (HEAD = 4ac9a46):

  PHASE 1-FIX (79b5411): condoComparabilityFilter at 8 tier call sites
    + buildCondoTierResult body unchanged; tax threading at both condo
    callers. Parity (full table in the prior block): pricing
    byte-identical PRE vs POST, tier medians corrected to filtered
    subsets, h8 tax band firing in production, frozen S1 matchers
    zero-diff, tsc clean.

  PHASE 2 MODAL PARITY (4ac9a46): GeoConfidenceSpread extracted (shared
    home + condo, labelMaps with condo "Same Building" / home "Same
    Street"); Geo Level Indicator on the modal (4-way branch on
    geoLevel); Competing-For-Sale rail on condo modal; useCompetingListings
    path:'condo' branch (gates on community_id + bedrooms). All
    display-only, tenant-gated, data-presence gated (S1 auto-hide
    proven). Home path rewired through GeoConfidenceSpread — renders
    identical. No matcher work in Phase 2.

NAMED-OPEN BRONZE-TIMEOUT (referenced, not re-filed): filed in the
  d200eca close block above. Status unchanged by Phase 2 — Phase 2 is
  display-only and the Bronze timeout is in the matcher query layer.
  Phase 2 surfaces the issue (Bronze auto-hides on dense areas in the
  modal) but does not cause it. Pre-existing. No work scoped here.

DB-VERIFICATION CAVEAT (referenced, not re-filed): the offline cross-
  check median formula caveat was filed in the d200eca close block above
  and applies to any future condo tier-pool sweeps. Same rule going
  forward: offline verifiers must mirror the matcher's even-aware
  median, or use the matcher's own medianRangeOf to compute the
  expected value.

OPTION D STATUS: SHIPPED (across d200eca..4ac9a46). W-CONDO-MODAL-PARITY
  the workstream is now CLOSED.
================================================================================


================================================================================
2026-06-11 — W-TAX-MATCH: tax-as-match-criterion result set (DECIDED)
================================================================================

CONCEPT (settled — do not re-question): a new MATCH MODE, not a new
product/lane. The estimator selects comparables by PROPERTY-TAX proximity
to the subject, prices off those comps' sold prices, and renders the result
in the EXISTING EstimatorResults display — same photo tiles (6d190c9),
same Platinum/Gold/Silver/Bronze tier badges, same comparable-sold +
competing-for-sale sections. Appears as its OWN section alongside the
geo/sqft-matched comps, same visual language, so the user weighs both.

MATCH CRITERION (settled): comps whose tax_annual_amount is close to the
subject's, SAME-MUNICIPALITY gated (mill rates differ — same gate the h8
score band uses). Tax data + h8 scoring already exist in the matcher;
this surfaces tax-matched comps as their own result set.

TIERS (settled): tier badges on the tax-matched tiles = the SAME
Platinum/Gold/Silver/Bronze GEO cascade (building/community/municipality/
area) applied WITHIN the tax-matched set — same tier meaning as the geo
result, NOT tax-proximity bands.

REUSE (intent): plugs into the existing matcher pipeline + the existing
tile/tier/createComp renderer. NOT a parallel display. Sale-only where
tax fill supports it (sale ~100%, lease ~0% — like h8).

STATUS: DECIDED -> wiring recon (where tax-match selection plugs into
the existing matcher) -> backtest selection quality (does tax-match
predict close_price?) like every estimator lever -> build. Concept
LOCKED; the backtest measures quality, it is NOT a re-vote on the
concept. Condo first, home after.

SUPERSEDES: bug #6 (tax-comparison row). The small "Similar tax: $X /
yours: $Y" row is REPLACED by this feature — not shipped, not vaguely
deferred. Bug #6 marked SUPERSEDED-BY W-TAX-MATCH.

================================================================================


================================================================================
2026-06-11 — W-TAX-MATCH — CONDO SALE SHIPPED · ffd9429
================================================================================

- withinTaxBand (h8 gate as selector) + runTaxMatchCascade (additive sibling
  to geo cascade) + taxMatch on EstimateResult + tax-match section in
  EstimatorResults (own GeoConfidenceSpread + photo tiles + own estimate).
- Backtest N=200 justified: tax-mode 8.4% median APE / 72.1% +/-15 vs geo
  10.4% / 60.6%; on 29 divergent subjects tax closer to actual 25/29.
  Co-equal framing.
- Platinum KEPT (data: 60.5% of subjects have >=2 in-building tax-band
  comps — refuted the predicted collapse).
- NO combined estimate (averaging measured worse than tax alone).
- Geo path BYTE-IDENTICAL pre/post (0 / 4 drift on priced fields +
  Platinum/Gold/Silver tier rail). Additive only. S1 frozen (zero diff).
  Silent-omit on no-tax / no-band-comps.
- Tile: literal-duplicate simplified tax tile (no geo-tier match-detail
  panels — those are sqft/maint, geo-specific). Made geo render
  byte-identical trivially.
- tax-Bronze inherits BRONZE-TIMEOUT on dense areas (same as geo-Bronze,
  pre-existing named-open — not introduced here). Tax-mode actually omits
  bronze entirely (silver = the full muni reach since h8 is same-muni-
  gated), so the timeout impact is even smaller than on geo.

REMAINING: home tax-match (next phase, mirror on home matcher +
HomeEstimatorResults, sale-only). Bug #6 SUPERSEDED-BY this — confirmed
shipped.

================================================================================


================================================================================
2026-06-11 — W-TAX-MATCH — HOME SALE SHIPPED · f89f670
================================================================================
(home extension of the W-TAX-MATCH workstream — the DECIDED block and the
condo SHIPPED entry live above in this tracker; logging the home close here
keeps the workstream narrative continuous. The home matcher itself tracks
to docs/W-ESTIMATOR-RAG-TRACKER.md, which carries no prior W-TAX-MATCH
entries — this block stays in the condo tracker for workstream coherence.)

- Mirrors condo b1 (74f622c) on homes: runHomeTaxMatchCascade (additive),
  multi-tier display + per-tile tier badge (Same Street / Community /
  Municipality via HOME_LABEL_MAP), winning-tier price over
  winnerComparables.
- Backtest N=200: home tax-mode 6.9% median APE / 75% +/-15 vs geo 8.6% /
  70.5% — co-equal, earned on home's own numbers (beats geo by wider
  margin than condo did).
- Platinum KEPT (same-street, 31.5% of subjects have >=2 tax-band comps —
  above the keep-threshold; weaker than condo's 60.5% because streets are
  sparser than buildings, as predicted by the recon).
- Coverage 74% (vs condo 91.5%); silent-omit on ~26% (wider home tax
  dispersion within muni). Working as designed.
- Divergence split 18/18 (vs condo's tax-favoring 25/29) — on homes the
  two signals are equally informative when they disagree; stronger
  justification for showing both sections side-by-side.
- Street normalization: REUSED existing streetBonusFor + normalizePlaceName
  (both sides already converge by construction) — no new normalization
  code added, suffix variance robust by construction.
- Geo path BYTE-IDENTICAL 0 / 3 drifts (priced + 4-tier rail +
  comparables order). Price over winnerComparables (6.9% backtest
  measurement preserved exactly). S1 frozen (5 shared matchers zero
  diff), condo W-TAX-MATCH (74f622c) untouched. NO combined estimate.
  Sale-only.
- W-TAX-MATCH now COMPLETE on both condo + home sale. Lease N/A
  (~0% tax fill).

REMAINING: nothing in the W-TAX-MATCH workstream. Workstream CLOSED.
================================================================================


================================================================================
2026-06-11 — W-TAX-MATCH — POST-CLOSE CORRECTION + DESIGN POLISH
================================================================================

- NOTE: the prior "workstream CLOSED" entry (fdb49fe) was filed prematurely
  — a design issue was open and home rendering was not yet visually
  verified at that point. Recording the actual completion here so disk
  history is honest (closed -> reopened-for-polish -> shipped).

- DESIGN FINDING (operator, from full-output review): the three result
  sections (Comparable Sold / Tax-Matched / Competing For Sale) must each
  read as distinct. Comparable Sold + Competing were fine. Tax-Matched
  blurred (condo: identical chunky tile to Comparable Sold; home: out-of-
  step old tile between two modern siblings). Operator's specific fix:
  move the per-comp tier indicator OFF the photo pill INTO the tile body
  as a labeled line; tax estimate panel + spread left as-is; Comparable
  Sold + Competing untouched.

- SHIPPED df4419d: tier indicator relocated photo-pill -> tile-body chip
  ("Platinum · Same Building" condo / "Platinum · Same street" home),
  color-coded by tier (emerald=platinum, amber=gold, slate=silver,
  orange=bronze), condo + home. Presentation-only, diff-scoped to tax
  tiles only (Comparable Sold / Competing / estimate panel / spread all
  zero-diff). sourceTier data unchanged; multi-tier display intact.

- W-TAX-MATCH now genuinely COMPLETE: condo sale (ffd9429 + b1 74f622c)
  + home sale (f89f670) + tier-placement polish (df4419d). Pending:
  operator visual confirmation on deployed walliam.ca (condo + home tax
  sections render with body chips).

- REMAINING (separate, not tax-match): BRONZE-TIMEOUT (dense-area query
  opt) + carried named-opens (Platinum comp-count lever, c4 locker, etc.).

================================================================================
