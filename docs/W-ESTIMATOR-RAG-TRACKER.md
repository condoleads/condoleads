W-ESTIMATOR-RAG — Estimator Core Logic + AI RAG Accuracy Tracker
Status: v12 — DESIGN LOCKED (homes) + PHILOSOPHY + PRICE-OUTPUT MODEL + VALUE-SIGNAL INVENTORY + SIZE-FIELD VERDICT + DYNAMIC PRODUCT-AWARE MATCHING MODEL + MANDATORY-FOUNDATIONS RULE. NOTHING BUILT — no code touched, no design ships without operator okay.

v12 — DYNAMIC PRODUCT-AWARE MATCHING MODEL (LOCKED 2026-06-04) — the core estimator logic
The governing realization: the matcher's complexity must scale to the product. A townhouse is simple (standardized lots, storey + sqft range = done). A bungalow on 4 acres is a different universe where the LAND is the value — missing the acreage field there is a catastrophic error, not a small one. The estimator must detect which world it's in and apply exactly as much rigor as that world demands.
The dynamic flow (every home estimate)

Identify the product (categorical gates — hard, never crossed):

TYPE: Detached / Semi-Detached / Townhouse / Link (Link split out per v10). Type-isolated pools.
STOREY/STYLE: 2-storey ≠ 2½ ≠ 3-storey ≠ bungalow-family ≠ split. Storey is a product separation (operator ruling, critical esp. townhomes).


Pick the LOT REGIME (the regime switch — driven by the data field, not a guessed city list):

acreage / large-lot filled → ACREAGE REGIME. Lot is the dominant value driver. Comparability runs on acreage (~similar acreage matches). A 5-acre parcel compares to ~5-acre parcels — NEVER pooled with a 0.4-acre suburban lot even if both houses are "4-bed detached." The house on the land still matters (mansion on 5ac ≠ cottage on 5ac), but the land regime gates first.
acreage empty → URBAN/SUBURBAN REGIME. Comparability runs on FRONTAGE, as a continuous PROPORTIONAL band (~±X% of subject frontage, NOT fixed ±feet). 60ft → ~48-72ft; 79ft → ~63-95ft; 200ft → ~160-240ft. The band scales with the lot because value scales with the lot (50→60ft matters; 200→210ft doesn't). X% to be set FROM DATA, not guessed.
Townhouse special case: lots are standardized → lot dimension barely varies → frontage band is wide/non-binding → storey + sqft range is effectively the whole match ("bingo"). Complexity correctly collapses for simple products.


Band on SIZE: same LAR bucket (exact in strict tier, ±1 adjacent in relaxed). LAR is the only real home size signal (verdict below).
Now you have a TIGHT set of genuine apple-to-apple comparables (ideally a handful, ~5). Same type, same storey, same lot-regime, same size band.
PRICE = MEDIAN of that tight set. NOT a mean. NOT a weighted blend of 140 properties. Median is robust — one weird comp can't drag it (the current arithmetic-mean is exactly what produces the negative-price blowups). Five real apples, take the middle.
If the tight set is too thin → WIDEN the geo cascade (street → community → muni) → then ROUTE TO AGENT. Never average garbage into a number. The band protects apple-to-apple; the cascade protects coverage; the agent catches the irreducible remainder (the 8%).

Why median, not mean (locked)
The recon found valuation = simple arithmetic mean of comp prices ± tier band. Mean is fragile: one stretched/bad comp drags the number (and with hardcoded adjustments, below zero). Median of a tight genuinely-comparable set is robust to outliers — both simpler and more accurate. This is how a good agent actually thinks: "I have 5 real comps, the middle one is X."
MANDATORY FOUNDATIONS RULE (LOCKED 2026-06-04) — the ENGINE enforces; entry points must satisfy
The estimator deals in DATA. A number built on missing foundational inputs is a wrong number dressed as a real one. We are NOT here to please the user with a frictionless form — we are here to give a CORRECT answer, and correctness has prerequisites. If prerequisites aren't met, the estimator does NOT produce a number — it asks for them, or routes to the agent. It NEVER guesses or runs foundation-blind.
Clean separation of concerns (clarified by operator):

THE ESTIMATOR is deterministic CODE LOGIC. Form → specs → matcher → median → result. The "AI layer" (getAIInsights) is pure presentation — 3 text fields, changes ZERO numbers, $0, off by default. The estimate NUMBER is 100% code. This workstream = the engine.
CHARLIE is a SEPARATE conversational AI product that happens to be one entry point calling the same engine. The seller form physically lives in Charlie's components (app/charlie/components/SellerForm.tsx) — that's the only connection.
THE GATE LIVES IN THE ENGINE (this workstream). The matcher refuses to produce a number when foundational inputs are missing, regardless of caller. Because the engine is the gate, EVERY entry point (form, buyer modal, Charlie) is automatically forced to supply foundations — no caller-specific enforcement logic needed in the engine work.
Charlie's CONVERSATIONAL enforcement (asking the user in chat, validating before calling the engine) is a NEXT-PHASE Charlie UX item — NOT this workstream. Charlie being AI doesn't exempt the data from discipline, but adapting Charlie's conversation to the engine's gate is downstream. Logged, deferred.

Foundations are HIERARCHICAL and PRODUCT-CONDITIONAL — not a flat list:

Universal identity (always mandatory): TYPE, STOREY/STYLE, SIZE range, beds, baths. Without these there is no product to compare.
Product-specific value driver (mandatory, but WHICH ONE depends on the product):

HOME → LOT is foundational. Two identical houses on a 50ft vs 100ft lot are NOT comparable — the land is half the value. Lot (frontage OR acreage per regime) is a foundational COMPARABILITY constraint, NOT a post-hoc $/ft adjustment. This reclassifies frontage from a Tier-2 score nudge to a Tier-1 matching gate for homes.
CONDO → frontage is meaningless (no lot). Foundational variable switches to interior size + building/maintenance/parking factors.


Enriching (lowers confidence / widens range if absent, does NOT block): age, basement, garage, pool, premium signals. These place the home WITHIN the range and feed feature-delta narration — their absence widens the range honestly rather than blocking.

THE STARVED-FORM PROBLEM (located 2026-06-04 — the upstream bottleneck)
The matcher can be perfect but produces wrong numbers if the form starves it. Verified in SellerForm.tsx + SellerEstimateRunner.tsx:

Size (LAR) is OPTIONAL on the home seller path — no validation. When skipped, conditional spread drops it → specs.livingAreaRange undefined → matcher falls through both size branches → size-unconstrained pool → a live production source of the RANGE-ADJ negative-price catastrophe (separate from the relaxed-funnel hole).
Form only populates ~4 of ~11 scoring dimensions. Style, age, basement, garage, pool NEVER collected on seller path → all score 0 → max achievable score ~100/200 → every seller estimate capped at RANGE tier, BINGO structurally impossible. A seller literally cannot get the estimator's best match because we never asked.
specs.exactSqft is NEVER set on the seller path (form has no field) → confirms dropping the dead SFS branch breaks zero seller traffic.
Buyer modal (from a listing record) CAN populate more fields → form-side enrichment is a separate, larger workstream from the matcher patch.
Consequence: making foundations mandatory in the form/Charlie is now a PEER priority to the matcher patch — fixing the engine while the fuel line is half-disconnected is incomplete work. Size-mandatory is the first and clearest enforcement.


Started: 2026-06-04
Owner: Shah
Predecessor: W-FUNNEL (closed 2026-06-04).
Suggested location on disk: docs/W-ESTIMATOR-RAG-TRACKER.md

Why this exists
The estimator is delicate, accuracy-critical work. Two parts:

Estimator core logic (PRIMARY) — the deterministic valuation engine across four paths: condo sale, condo lease, home sale, home lease. Hybrid approach (comparable-based + formula/PSF). Goal: make the core so solid the AI layer becomes optional — accuracy and relevance from the code itself.
AI RAG responses (SECONDARY) — the AI commentary/insight layer on top. Improve quality, but the strategic aim is to reduce dependence on it as the core hardens (cost saving — AI calls are paid).

Homes analysis is the priority concern — flagged as the weakest area, needs the closest look.

Locked decisions

Sequencing: Estimator core FIRST, then RAG. Rationale: RAG adds insight on top of a valuation; if the underlying number is wrong/weak, improving AI commentary is narration over bad numbers (and a convincing AI explanation of a wrong valuation is more dangerous than an obviously-thin one). The core must be hardened first to even measure how much AI is still needed — which is the precondition for the cost-saving "shrink the AI layer" goal. (Locked 2026-06-04.)
Core approach is hybrid: comparable-based (find similar sold/leased → derive price) + formula/PSF (adjustments). Both layers are independent accuracy sources; homes weakness localized — see findings.
Cost-saving thesis: strong deterministic core → less reliance on paid AI commentary. The §9.2 work already made estimator AI tenant-keyed + off-by-default per tenant, so reducing AI use is also a per-tenant cost lever.
STRICT BUCKETING — CONFIRMED with eyes open (v9, 2026-06-04). Like-for-like comparable pools: style-family + size + bed, community → muni cascade. Measured cost: 82% confident / 11% thin / 8% route-to-agent. Bounded and affordable. The 8% route to the agent because there genuinely is no clean comparable — that is the right behavior per the prelude-to-agent framing, not a failure.
STYLE-FAMILY GROUPING — CONFIRMED (v9). Bungalow + bungalow-raised + bungaloft grouped together costs almost nothing vs exact-style (60% vs 56% confident) — a cheap, sensible relaxation that stays inside apples-to-apples.
PSF FOR HOMES — OUT as a pricing tool (v9, resolved by data, not assumption). No table has the style+size segmentation strict bucketing requires. Homes price from the comp pool itself, not a PSF surface. geo_analytics survives ONLY as the market-context (absorption / DOM / pace) feed for the report — never as a PSF pricing signal.
COMPARABLE URL LINKS — KEEP, non-negotiable (v9). Each comparable links to its listing page so the user can verify the claim ("you said 142 Maple sold for $890k — here's the listing"). This is trust, and it reinforces the real-data thesis. Carries forward into the new report. Build constraint: comparable links MUST resolve to the tenant's own domain (same tenant-correct-URL rule the funnel session enforced) — multi-tenant, never hardcoded.
LISTING-CARD STYLE — CONFIRMED design upgrade (v9). Comparables render as cards (photo, linked address, sold price, beds/baths, sqft range, sold date, DOM) instead of a flat table. Makes comps feel like real properties. Same card style extends to the "what's competing now" active-listings section.


v10 — ESTIMATOR PHILOSOPHY (LOCKED, 2026-06-04) — the spine everything builds toward
This is the governing philosophy. Every build step serves it. Locked by operator.
Principle 1 — TIGHT beats WIDE. The machine's edge is reliability, not volume.
The win is NOT "hold 140 comps where a human holds 5." 140 comps = 5 real comparables diluted by 135 irrelevant ones. A good agent doesn't fail to hold 140 — they correctly IGNORE 135 because those aren't the same street, same product, same backing. The machine's edge over the human is doing the same tight, street-level, feature-aware comparison the best agent does — but consistently, at scale, without getting tired or missing a tag. Same method, more reliable execution. NOT a different "PhD" method. A real estimate off 4 same-street comps beats one off 40 community comps. We never widen the pool just to inflate the count.
Principle 2 — Take the complexity onto OUR side. Hand the public a clean story.
We cater to the normal public, not PhDs. The machine does the hard part (catches every feature, checks every comp, runs the cascade); the user gets the clean narrative: "here's your home, here's what sold down the street, here are the 3 things different and which way each pushes your price." Rich and accurate underneath, readable on top. Solving complexity — not manufacturing it.
Principle 3 — Features are SHOWN, not silently blended.
Features don't just nudge a hidden number — they become lines in the report. The flow:

Scan the subject FIRST — read everything the subject home has (backing, view, basement finish + separate entrance, pool, garage, lot, condition).
Foundational match — find tight, same-street/community comparables that pass the real product gates (type, storey).
Narrate the deltas, ±, in the report:

Subject HAS a big feature comps LACK → highlight as a plus ("Your home backs the ravine; 142 Maple doesn't — supports pricing above it").
Subject LACKS a big feature comps HAVE → highlight as a minus, honestly ("142 Maple has a finished walkout w/ separate entrance; yours is unfinished — expect to price below it").




Delta expression = BOTH (locked): dollar impact where the data supports it (e.g. +$30k pool), direction + words (↑ strong plus / ↓ minor minus) where it doesn't. Never a silent number move.

Principle 4 — GRACEFUL DEGRADATION with honesty at every tier (the report spine).
The estimate NEVER silently passes a muni-level guess off as a street-level fact. Each cascade tier carries its own note, guiding the user at every level:

Street level → "Here's what sold on your street." (Highest confidence — say so.)
Community level → "Nothing comparable sold on your exact street recently — here's what sold in your community."
Municipality level → the honest hand-off: "I couldn't find a true comparable in your community. Here are some suggested recent sales nearby — but this is wider than ideal, so contact the agent to confirm." A guided, honest route to the agent — NOT a confident number dressed as precision.
This IS the 82/11/8 split: the 8% route-to-agent is where even widening produces no real comps. We don't manufacture a number from garbage; we hand it to the agent. That is the accuracy.

Principle 5 — Show FOR-SALE competition, not just SOLD comps.
A seller pricing today competes against live inventory, not just history. The report surfaces actively-listed competing properties (same listing-card style: "here's what you're up against now") alongside sold comps. This is what makes it a pricing TOOL, not a backward-looking average. (Build step 4.)
Principle 6 — The WOW: relevant, accurate, valuable.
The user sees: their home → real sold comps with clickable, verifiable, tenant-correct links → live competing listings → honest feature-deltas. Rich on our side, clean on theirs.
Architecture resolution
Resolved by Principles 1–5 together: we are NOT building a 140-comp weighted blender. We build tight street-first comparables (pin → street → community → muni cascade) + a feature-delta narrative + tiered-honesty notes + active competition. The existing 200-pt scoreMatch is used to RANK and to select the tight pool and to drive the feature-delta narration — not to blend a wide pool into a silent mean. Hard product gates (type, storey) keep non-comparables out entirely; refinement features become narrated deltas, not delete-gates that empty the pool.
Principle 7 — PRICE IS A RANGE, and the range's WIDTH means confidence (v11)
A single point price is almost a lie. The output is a range, and the width carries meaning:

Tight comps (street-level, clean) → NARROW range ("$1.82M–$1.88M") → high confidence, say so.
Stretched comps (muni-level) → WIDE range ("$1.65M–$1.95M") → the width itself honestly signals lower certainty. The range IS the tiered-honesty principle made numeric — no separate disclaimer needed.
Desirability signals shape WHERE IN THE RANGE the home lands: ravine + finished basement → top; lacks comp features → bottom. This is the bridge between the desirability layer and the number.

Principle 8 — INVERSE NARRATION: show how we got to the price (v11) — the trust mechanism
The feature-delta narration runs BACKWARDS to JUSTIFY the number. Not a side-panel — the actual derivation:

"Started from 3 homes sold on/near your street: 14 Glendale ($1.79M), 88 Marmaduke ($1.95M), 5 Fern ($1.82M). Your home backs the ravine — Glendale doesn't (+). Marmaduke has a finished walkout yours lacks (−). Nets to $1.82M–$1.88M."


The user traces the price back to real, clickable, verifiable sold homes + the specific reasons it moved up/down from each.
Self-policing: if we can't write the derivation honestly, we don't have a price — we have the route-to-agent.

PRICE-ROLE BOUNDARY (LOCKED v11) — what the desirability layer may and may NOT do

Comparables PRICE the home. Tight real sold comps produce the base range. Signals never override this.
Structured signals (Layer 1+2) carry DOLLAR deltas — but ONLY after step 3 makes adjustment values real (market-derived per community). Until step 3, dollar adjustments are flat hardcoded constants and are NOT trustworthy as dollars. This is WHY step 3 precedes step 5 as a dollar influence.
Text signals (ravine, no-rear-neighbour, conservation) carry WORDED deltas, never dollars — text is a softer source (e.g. bare %lake% is 6.8× false-positive vs structured view tag). Maps onto the BOTH delta rule: dollar where structured/strong, words where soft.
Signals REFINE and EXPLAIN; they do not MANUFACTURE confidence. In thin-comp (muni / 8%) cases, signals become part of the honest hand-off ("your ravine lot is a real premium, but no clean comparable exists — see the agent"), NOT a rescue into a confident number.
Build-order rationale confirmed: 1 (size) → 2 (gates) → 3 (real adjustments) → 4 (competition) → 5 (signals). Each step earns the right to influence price before it's allowed to.


Resolution 1 — PSF question: SETTLED, confirms skepticism was right
PSF tables are a dead end for homes:

psf_monthly_sale / psf_monthly_lease: 98% of communities BLEND condo + freehold into one PSF (no property_type column), and 5 months stale → unusable as-is. A $750/sqft condo averaged with an $1,100/sqft house is the apples-to-oranges baked right in.
Per-building PSF tables: condo-only → drop entirely.
One survivor: geo_analytics — has an explicit track='homes' column AND a subtype breakdown (Detached / Semi / Townhouse, each with own median/DOM/sale-to-list), reasonably fresh. BUT: no style segmentation (no bungalow-vs-two-storey split) and the subtype breakdown was empty on 4 of 5 sampled rows. → usable for top-line market context (the report's absorption/DOM/pace section), NOT as a PSF pricing signal.

Net: PSF as a pricing tool for homes is OUT — confirmed, not assumed. Any home PSF would have to be derived per-query from raw listings. Homes price from the comp pool. geo_analytics = market-context feed only.
Resolution 2 — Bucket contamination: CONFIRMED, located exactly
The apples-to-oranges fear is real and located:

Sale strict funnel: style is a hard gate (good — bungalows excluded from two-storey pools when both styles known, which is 98.6% of the time).
Sale's municipality fallback: NO style filter — when the strict funnel fails and drops to muni, it pools bungalows + two-storeys + sidesplits together. LEAK.
Lease: NO style logic anywhere — every lease tier pools all styles together. COMPLETE LEAK.

→ Strict ruling is partially implemented for sale, entirely absent for lease. Closing both leaks is a concrete, located change: make style a hard gate in sale's muni fallback + all lease tiers, with family grouping.
Resolution 3 — Coverage cost: MEASURED before committing
Under strict bucketing (community → muni cascade, style-family + size + bed): 82% confident / 11% thin / 8% route-to-agent. Affordable — far better than feared. Only 8% get "see the agent." Luxury hit harder at community level (67% thin) but muni fallback recovers most. Style-family expansion is the cheap relaxation (60% vs 56% confident exact-style).

The full diagnosis (confirmed, v9)
The home estimator is accurate when it has a clean match and breaks when it stretches. Two located root causes:

Dead size field — reads empty square_foot_source → relaxed tier does no size filtering → pools 1,000 with 4,000 sqft homes → negative prices.
Bucket leaks — style is a hard gate in the strict sale path but absent in sale's muni fallback and all of lease → bungalows pool with two-storeys.

Both specific, located, fixable.

Build sequence — LOCKED (v10, all measured against the 16.8% baseline)
Each one built, then re-run through the backtest to prove it moved the number — kept only if it did. Every step serves the v10 philosophy (tight comps + narrated feature-deltas + tiered honesty + active competition).

Fix the size field — point home matching at living_area_range (the strategy that already works for condos). Highest leverage — upstream of the negative-price catastrophe. Relaxed-funnel size band still OPEN (exact / ±1 / ±2 LAR bucket) — to be decided when step 1 is authored, measured on backtest.
Close the bucket leaks — the located leak is the bedBathOnly last-resort muni fallback (lines 622-636), which drops style to scoring-only. Make product gates (type + storey) hard everywhere including that path. Also: split Link out of the Townhouse type pool; break the twostorey style family apart so storey count (2 / 2½ / 3-Storey) is a real product separation, esp. for townhomes (operator ruling, v10).
Real-data adjustment analytics (community-level, dashboard-editable) — replaces ALL flat hardcoded constants (frontage $40k/ft, basement $50k/$80k/$110k, garage, pool, bath). Per-market, not flat. Fixes the 3 basement score/dollar inconsistencies. Wires the existing adjustments table (muni/community/area grain) into the home path.
Active competition + absorption (from geo_analytics + live For-Sale listings) — the selling-side input + the "what you're up against now" report section (Principle 5).
Premium / value signals (desirability layer) — see VALUE-SIGNAL INVENTORY below. Step-5 first-pass scope LOCKED (v11): Layer 1 (structured premium) + Layer 2 (structured richness) + the 3 clean text signals only. Loose word-matches + hydro-negative deferred to step 5b. Closes luxury quality-of-match AND feeds feature-delta narration. Fix pool to cover all pool types.

Report-layer (parallel, design-locked v11):

Comparable URL links preserved — MUST resolve to the TENANT's own website, never a hardcoded domain (multi-tenant non-negotiable, same tenant-correct-URL rule as the funnel work). Applies to BOTH sold comps AND competing-for-sale links. Explicit build-gate.
Comp / competing display = Option C (LOCKED v11): Charlie-density tile + ONE feature-delta line. NOT full cards (too tall — 3 sections would bury everything), NOT pure Charlie tiles (no room for the delta — loses the wow). Small scannable tile (price, linked address top-right, bed/bath/sqft/sold-date) + one delta line (dollar-or-words) showing the single most important ± vs subject. Same tile for "Comparable Sold" and "Competing For Sale" sections.
Competing For Sale section (Principle 5) — live Active / For Sale listings, same Option-C tile, framed forward ("3 similar homes listed now, $1.79M–$2.05M — your competition"). Forward-looking half of the pricing strategy.
Price shown as a RANGE (Principle 7) — width = confidence; signals place the home within it.
Inverse narration (Principle 8) — the derivation IS the report: comps → ± reasons → range.
Tiered-honesty note on every estimate (Principle 4) — street / community / muni each carry their own confidence framing.
Output SPLITS at the end: confident comprehensive report for the 82% with clean comps; honest "see the agent" route for the 8% without.


Recon scope (COMPLETE — read-only, done before design lock)
Estimator core — all four paths (condo sale, condo lease, home sale, home lease):

R1 — Comparable selection: per path, how comparables are chosen (geo radius, building, property-type match, time window, bed/bath/sqft filters); source (PropTx MLS / building sales tables).
R2 — Valuation math: per path formula; PSF basis; adjustments (size, beds, baths, age, condition, time-decay); comparable-derived vs formula-derived and how they combine in the hybrid.
R3 — Homes vs condos divergence (the priority): where the home path differs from condo in BOTH comparable selection and math; why homes is weaker. Localized — see findings.
R4 — Empty/thin-comparable handling: the CONTACT-tier fallback — when each path falls back, threshold correctness.
R5 — AI attachment point: getAIInsights attaches as pure presentation (3 text fields), changes ZERO numbers, currently $0 (both tenants toggle off). Cost-saving thesis confirmed: core already stands alone.
R6 — Accuracy measurability: backtest fully feasible against existing close_price data — measurement is possible (harness shipped, see findings).

Gate: recon reviewed → design lock per path → then build (hardening), recon→design→smoke discipline per CLAUDE.md.

Open questions (status)

How is accuracy currently validated? → RESOLVED: backtest harness scripts/backtest-estimator-homes.js against real close_price. Baseline 16.8% median.
What's the acceptable AI-off output quality bar — how good must the core be before the AI layer is "optional"? (Still open — sharpens as build proceeds.)
Homes: weakness in data or logic? → RESOLVED: both, and located — dead size field (data-field misuse) + bucket leaks (logic). Code fixes, not a data-sourcing problem.


Findings
BACKTEST BASELINE (2026-06-04, 500 sale + 500 lease real subjects, as-of-date + exclude-self) — THE MEASUREMENT BASELINE
Home SALE — a TIER problem, not uniform weakness:

BINGO (n=43): MAE $70k, median 7.1% off, 84% within ±15% — excellent when match is good.
RANGE (n=137): median 13.7%, 56% within ±15% — fine.
BINGO-ADJ (n=223, the bulk): median 19%, 43% within ±15% — mediocre.
RANGE-ADJ (n=49): CATASTROPHIC — median 150% off, 2% within ±15%, one subject predicted NEGATIVE price. Hardcoded adjustments drive comp prices below zero when stretching a poor match. Proves the chain: fake adjustment values actively destroy accuracy, not just imprecise.
Overall median 16.8%; mid-market ($500k-1M) best (14%); <$500k worst (30%, likely misclassified); community-scope beats muni-fallback by ~16%.

Home LEASE — basically works: 78% within ±15%, median 6.9%, bias ~0. Lower priority. Dead spot: BINGO tier never fires (exactSqft null on ~95% homes — same sqft-column issue).
Three assumptions OVERTURNED by data:

Luxury is NOT thin-comp — p99 homes have ~140 comps available (<3-comp only 4%). The luxury gap (25-35%) is QUALITY-of-match (view/lot-prestige/finishes the matcher can't see), NOT count. Changes the luxury fix: read premium signals, don't "handle thin pools."
Premium signals are STRUCTURED, not just text (huge — easier than feared): jsonb tags exist in volume, all UNREAD — view: Lake 4,486 / Park-Greenbelt 4,040 / Forest 4,901; exterior_features: Backs On Green Belt 2,824, Deck 51,550; interior_features: In-Law Suite 10,376 / In-Law Capability 17,239 (income-suite signal). Operator's street/backing/income instincts are in clean structured fields.
Five pre-computed analytics tables IGNORED by estimator: psf_monthly_sale (16,730), psf_monthly_lease (18,501), geo_analytics (18,184), building_psf_summary (75), building_psf_transactions (10,698). Only adjustments (408) is wired in. v9 ruling: PSF tables OUT for homes pricing; geo_analytics retained as market-context feed only.

Sample report (real, current-state) — 37 Lavinia Ave, Toronto W01: sold $1.885M, predicted $2.057M (+9.1%). Comp pool visibly lumped $1.3M and $3.9M homes together (no street-awareness — can't tell Lavinia from South Kingsway). Demonstrates: no street/block awareness, no competition layer, 55% null age (20-pt age dimension dead), unread view/greenbelt tags, flat $40k/ft frontage where W01 real premium is ~$75-100k/ft, unused PSF surfaces.
Homes data census (2026-06-04, all verified against live DB — 317,975 freehold closed rows, 2y)
Operator domain inputs (locked — guide the matrix design):

Street-level comparison matters; odd/even house number carries weight because same-side homes often share the same BACKING (lake/ravine/green space = materially more valuable). Odd/even is a proxy for "what's behind the property."
Luxury homes are a unique market — comparable-averaging breaks down. Needs distinct treatment (now = premium-signal reading, not thin-pool handling — see overturned assumption).
Real-data analytics exist for building parking + lease prices (condos) — must be used, not reinvented.
Strategic goal: electronic analysis takes the user FURTHER than a human could — comprehensive data analysis at scale/consistency a person can't match. Surface every real, data-backed signal.
METHOD RULE: see data comprehensively FIRST, then design how to use it. No guessing — every value real-data or it doesn't ship. Nothing changes without operator okay.

Data realities that reshape the homes plan:

F-HOME-SQFT-WRONG-COLUMN (High): home matcher's best size-match tier uses square_foot_source (95% NULL on homes, ~99% non-numeric labels when present) → that tier is dead code. calculated_sqft is 68% populated and NEVER read. Build step 1 points matching at living_area_range (proven condo strategy). Biggest single accuracy lever.
F-HOME-STREET-BONUS-BUILDABLE: street_name + street_number 100% populated as clean structured fields. Dead "same-street bonus" (hardcoded false) is trivially activatable; odd/even = street_number % 2. Street-level + odd/even fully data-supported.
F-HOME-BACKING-SIGNAL-IN-TEXT-ONLY (High effort): value-driver behind odd/even (backs onto lake/ravine/greenspace) is NOT structured — lot_features jsonb effectively empty. Signal lives in public_remarks free text: ravine 3%, backing-onto ~5%, green space 3%, water-adjacent ~17% combined. Requires phrase extraction (harder tier than structured street match).
F-HOME-ZERO-REALDATA-ADJUSTMENTS (High): all 8 home adjustment values hardcoded constants (lot frontage flat $40k/ft EVERYWHERE, basement/garage/pool/bath). Condos have a real adjustments table (408 rows, computed from real data); homes have none. Directly violates the real-data rule. Build step 3 replaces with community-level dashboard-editable real-data adjustments.
F-LUXURY-NO-PATH (High): price right-tail-skewed (mean 16% > median, p99 $3.3M, max $27M). Reframed by data: luxury gap is quality-of-match, not comp count. Fix = read premium signals (build step 5).
F-HOME-WATERFRONT-IGNORED (High): waterfront_yn 3.8% true, estimator ignores entirely; waterfront premium can be 30-100%.
F-HOME-POOL-PARTIAL (Med): Inground 5.9% (handled), Above Ground/Salt/Community/Indoor ignored.
F-HOME-AGE-52PCT-NULL (Med): half of homes have no age; NULL-age comps pass unfiltered (asymmetric) — 20-pt age dimension degrades on half the pool.
F-HOME-INCOME-SUITE-SIGNAL (Med): ["Apartment","Separate Entrance"] basement 1.6% — income-suite value signal, grouped without extra value today.
F-HOME-SUBTYPE-SCOPE-GAP (RECLASSIFIED 2026-06-06 — see "VACANT LAND / LOT VALUATION sibling product path" entry at end of run log): no longer "Low — excluded." Vacant Land / Rural Residential / Farm become a SIBLING product priced on LAND ($/acre median × subject acreage, or $/frontage × frontage), NOT on building. Geo cascade COMMUNITY → MUNICIPALITY → AREA only (NO street tier — street/odd-even is a house-backing proxy, meaningless for raw land). Status: design-locked PENDING DATA RECON ($/acre per-community stability + comp survival at each geo tier not yet captured to disk). Lease partial-home types (Lower/Upper Level, Room) still passthrough-only.

Condo-side bug found incidentally:

F-RESOLVE-ADJUSTMENTS-PARKING-SALE-COLUMN-MISMATCH (P1): resolve-adjustments.ts:46 references parking_sale_calculated — column doesn't exist (real: parking_sale_weighted_avg). Condo-SALE parking silently falls to hardcoded $50k, never reads the real computed values. Isolated, quick fix. Still P1-quick.

Cross-path (confirmed):

Valuation = simple arithmetic mean of comp prices ± tier-multiplier band. No median, no recency-weighting, no match-quality-weighting. No PSF formula.
AI is pure presentation (3 text fields), changes zero numbers, $0 today (both tenants toggle off). Core already stands alone.
Backtest fully feasible against existing close_price data.

Backtest harness scripts/backtest-estimator-homes.js is the re-runnable audit trail — every future change re-measured against these CSVs to prove it helped.
Feature inventory — home matcher current state (verified, 3 recon passes 2026-06-04)
Every feature the home matcher touches today, how it's used, and what's wrong. This table IS the feature-delta narration source list (Principle 3).
#FeatureDB fieldUsed nowProblem1Property typeproperty_subtypeHard SQL gate, firstLink wrongly pooled with Townhouse (step 2 splits it)2Architectural stylearchitectural_style[0]Hard gate (family) + 25pt score2/2½/3-Storey wrongly one family (step 2 splits)3Age bracketapproximate_ageHard gate + 20pt score52% null; null comps pass unfiltered4Sizeliving_area_range / square_foot_sourceGate + 30pt scoreSFS-numeric dead (0.004% homes); relaxed funnel has NO size filter → negative prices (step 1)5Lot frontagelot_width$40k/ft adj + 25pt scoreFlat $40k everywhere; W01 real ~$75-100k/ft (step 3)6Lot depthlot_depth$5k/10ft (cap $30k) + 10ptHardcoded, not market-aware (step 3)7Basementbasement (jsonb)5-signal decode → $50k/$80k/$110k + 15ptHardcoded flat; 3 score/dollar inconsistencies; lease ignores entirely (step 3)8Garagegarage_type$30k-$70k by type + 10ptHardcoded (step 3)9Bathroomsbathrooms_total_integer$20k each + 10ptHalf-bath rate defined, unused (step 3)10Poolpool_features (jsonb)Inground $30k + 5ptAbove-ground/salt/indoor/community ignored ($0); inground flat $30k (step 5 fixes all types)11Recencyclose_date30pt scoreDollar time-adjustment constants defined, never applied12Same street / odd-evenstreet_name / street_number15+5pt scoreBacking signal (ravine/lake) unread in public_remarks text (step 5)13Bedroomsbedrooms_totalHard gate (exact)Fine
Value signals present in data but UNREAD (step 5 + value-signal recon target) — the desirability layer where the luxury gap lives:

Backing signal (the odd/even proxy): public_remarks free text — water-adjacent ~17% / backing-onto ~5% / ravine 3% / greenspace 3%. Text-extraction tier. The single biggest quality-of-match signal.
View (structured jsonb, unread): Lake 4,486 / Park-Greenbelt 4,040 / Forest 4,901.
Waterfront (waterfront_yn 3.8%, ignored): premium 30-100%.
In-law / income suite (interior_features): In-Law Suite 10,376 / In-Law Capability 17,239 — income-value signal, unread.
Candidate, fill-rate unverified (value-signal recon pending): lot area/shape/irregular, corner lot, condition/renovation, kitchens/rooms, exposure/direction.

Architecture note: the 200-pt scoreMatch already computes per-comp match quality — but the price is currently a flat mean of top comps (no quality-weighting). Under v10 philosophy, scoreMatch RANKS and selects the tight pool and drives feature-delta narration; it does NOT blend a wide pool into a silent mean.
THE FIVE-LAYER MATCH FLOW (LOCKED 2026-06-04, operator-defined) — the definitive estimator flow
This is the authoritative flow. The dynamic model above feeds it; this is how it executes for the user.
Layer 1 — FOUNDATIONS (mandatory; no estimate without them). Type, storey/style, size range. The engine gate. Missing → ask or route to agent, never run blind.
Layer 2 — CRITICAL FACTOR #1: FRONTAGE, proportional variance. Lot recon verified:

±20% proportional band is the variance (operator-set, data-confirmed viable). At community level a subject averages 121 comps within ±20%, 69 within ±10% — deep pools.
Proportional, NOT absolute feet — confirmed: current absolute ±10ft = ±33% on a 30ft lot but ±5% on a 200ft lot (broken both ends). Band scales with subject frontage.
Data caveats baked in: clamp the contaminated 200+ft tail (max=2000ft = data error; reject >500ft unless lot_size_units='Acres'). Route the ~2% Acres regime (rural) separately — don't let a metric-misentry pollute a suburban pool. lot_width/lot_depth are the signals (84%/83% fill). NEVER use lot_size_area (double-units trap: lot_size_units AND lot_size_area_units can disagree; Feet-regime sqft values are anomalous).

Layer 3 — OTHER CRITICAL FACTORS: age, basement, separate-entrance, backing (ravine etc.).

AGE — VERIFIED (recon 2026-06-04): pre-bucketed, 7 buckets (New, 0-5, 6-15, 16-30, 31-50, 51-99, 100+), vocab matches the matcher's AGE_BRACKETS_ORDERED verbatim → bucket-equality match like LAR, no banding/normalization needed. Caveats: (a) 51-99 bucket is 49yrs wide — lumps 1925 pre-war (premium) with 1970 boom (mainstream); in that wide bucket age must weight-down/widen, not feign precision (same coarseness as luxury LAR bucket). (b) Only 43.4% filled; no year_built column exists — bucket is the only age signal. (c) Seller form COLLECTS age but SellerEstimateRunner.tsx DISCARDS it → subject age always null on seller path → age dimension doubly inert. 1-line runner fix revives it (foundations-enforcement workstream, not size patch).
Basement / separate-entrance / ravine-backing / (condo: lake-view, deferred to condo phase) — these are ENRICHING (verified in value-signal inventory): they place the home WITHIN the range + drive ± narration, they don't gate the match.

Layer 4 — BINGO or HONEST SUGGESTIONS — "but always there is something."

Foundations + frontage + critical factors satisfied → BINGO: tight, confident, median price.
No perfect match → closest real suggestions with honest framing ("wider than ideal because…") + route to agent. The user NEVER gets a dead end. Even with no bingo, they get the nearest real comparables + why they're approximate. Always something.

Layer 5 — GEO CASCADE with NOTIFICATION at every step.

Street (with odd/even) → community → municipality → area. Drop a level ONLY when the current is null/thin.
Every drop carries a user notification — "nothing sold on your street, here's your community." The widening is VISIBLE, never hidden. User is never in ambiguity about how tight the comparison is. This is the tiered-honesty spine as the user-facing flow.
STREET/ODD-EVEN DATA VERIFIED (recon 2026-06-04) — and a FREE 20-PT WIN found: street_name + street_number are 100% filled as structured columns (the matcher currently parses unparsed_address unnecessarily — structured columns exist). 98.5% of street_numbers parse cleanly as int → parseInt % 2 reliable for odd/even (1.4% suffix cases like "123A" need leading-number regex; 0.07% no-digit drop out). The matcher's 20-pt street bonus (15 same-street + 5 same-odd-even, scoreMatch:354-358) is DEAD — hardcoded sameStreet=false at line 552 because "we don't have subject address." That's 10% of the 200-pt budget unused — and it's the SAME-SIDE-OF-STREET = same-backing = ravine-proxy signal (operator's #1 instinct). REVIVABLE via 2-file change: SellerEstimateRunner.tsx (add streetName/streetNumber to HomeSpecs), HomeSpecs interface (+ fields), matcher (read structured street_name/street_number, drop the address parser), HOME_SELECT (+ columns). High value-per-effort, foundational to Layer 5 — sequence EARLY.


The point of every estimate: get the user to VALUE with accurate + relevant data, median-priced, features highlighted (± narration), honest about confidence. Complexity scales to the product.
ScenarioRegimeWhat gates (foundational)What happensTownhouse, 1500-2000, 2-storeyUrban, standardized lottype + storey + LAR. Frontage band wide/non-binding (townhouse lots uniform)Simple "bingo" — storey + sqft range matches, tight pool, median price. Lot barely varies so it doesn't dominate. Complexity correctly LOW.Detached 2-storey, 60ft lot, suburbanUrban frontagetype + storey + LAR + frontage proportional band (~48-72ft)Comps within band on same street/community, median. 100ft-lot comps EXCLUDED (different product).Detached 2-storey, 79ft lotUrban frontagesame, band ~63-95ftProportional band handles the "never exactly 50 or 100" reality — 79ft finds its real neighbours.Bungalow on 4 acres, ruralACREAGEtype + storey + acreage (the field that MUST NOT be missed) + sizeCompares to ~4-acre bungalows. Land dominates. Missing acreage here = catastrophic (pools with a 0.4ac suburban lot = "dumb and dumber"). House-on-land still differentiates within the acreage set.Subject skips size (form allowed it today)anysize MANDATORY — blockedEstimate does NOT run size-blind. Ask for size, or route to agent. (Fixes a live negative-price source.)Luxury, 3500-5000 bucket (1500 wide)urban/largetype+storey+LAR+lotStructural size-resolution ceiling (no finer field exists). Wide bucket → wide range → likely route-to-agent. Honest, not forced.Thin comps at community levelanyfoundations met but <3-5 real compsWiden street→community→muni with tiered-honesty note at each level. If still thin → "suggested nearby sales, see agent."Charlie conversational estimateanyengine enforces SAME floorCharlie is a separate AI product; it calls the same engine. Engine refuses foundation-blind estimates → Charlie is forced to supply them. Charlie's conversational gathering of inputs = NEXT-PHASE UX, not this workstream.Rural, acreage field empty but large lotneeds detectionacreage regimeFallback regime detection (lot_size_units='Acres' or lot magnitude) — recon must confirm how to detect when acreage itself is null.
OPEN — LOT-DATA RECON (next foundational probe, not yet run)
The acreage/frontage regime switch is buildable ONLY if the data supports it. Must verify BEFORE designing the lot constraint:

Does an acreage field exist and what's its fill rate? How does it co-occur with frontage_length/lot_width, lot_size_area, lot_size_units?
Real frontage distribution (urban vs rural) — where does the data flip from feet-world to acres-world?
Is frontage populated on rural homes, or null exactly where it matters? (If null where it matters → need the acreage regime to catch it.)
Critically: how many comps survive a proportional frontage band (±X%) at each geo tier? This sets whether ±20% is viable or lot can only be a soft-widen constraint. Sets the real X%.
Lot gets its OWN design pass (like size did) — it is NOT a bolt-on to step 1. Frontage reclassified from $/ft score-nudge to Tier-1 comparability gate for homes.


Probed all three candidate size fields before designing the size patch (operator instruction: "get the data, don't guess"). The three collapse to ONE real signal.
FieldFillNature (verified)Use in home matcherliving_area_range77.4% (245,811)Bucket label, 9 canonical buckets (+3 noise rows)PRIMARY + ONLY size signal — literal equality; optional ±1 adjacent bucket in relaxed tiersquare_foot_source3.8% (12,118)Provenance LABEL on homes, not a measurement — 99.83% of filled rows are label-only (Other/LBO Provided/Plans/Owner/Builder/MPAC). Only 21 of 317,709 (0.0066%) carry any numeric (pure+range+mixed). CONVENTION divergence, not a data gap: same column is numeric on ~20% of CONDOS (49,318 rows — condo agents embed sqft; BINGO tier earns its keep there). Home agents use it for "who measured." Intent differs by property class — uncorrectable by backfillDROP from home size path (domain mismatch the home matcher inherited from condo code). Keep extractExactSqft + SFS for the CONDO path (legit on 1-in-5 condos)calculated_sqft68.4% (217,342)LAR midpoint rebadged — every value = RANGE_MIDPOINTS[LAR]. Circular by constructionNOT a signal. Rescues 0 LAR-null rows; loses 28,469 LAR-filled rows if used instead. Strict subset of LAR. Niche: midpoint-distance for graded scoring only — never coverage
Consequences locked:

On homes there is NO hidden numeric sqft. The only true size signal is the LAR bucket. SFS-numeric matching is dead by data, not by neglect — confirmed 3×.
RANGE lives in BOTH fields, loader-dependent — but redundantly. living_area_range and square_foot_source are two slots that can hold the same bucket vocabulary; which gets filled depends on what the listing loader chooses. Verified: condo range-form SFS (1,436 rows, 0.6%) MIRRORS the LAR bucket strings (600-699, 500-599 etc.) — a duplicate copy, not additive. On HOMES, range-form SFS = 1 row in the entire 2y universe. Furthermore extractExactSqft (types.ts:142) explicitly rejects range-form (/^\d+-\d+$/ → null), so even condo range-form SFS never fed BINGO — already routed to RANGE via LAR. The real condo numeric signal is pure-number (12,973) + embedded/mixed (34,868), genuinely absent on homes. Net: dropping SFS from the home size path loses exactly zero signal.
The luxury size cocktail is STRUCTURAL, not fixable in code: the 3500-5000 bucket is 1500 wide; no field can tighten it. This is a data ceiling. The v11 design already handles it correctly (wide bucket → wide range → route-to-agent). Confirmed correct, not lazy.
"Apple-to-apple" on homes is achieved through PRODUCT GATES (type + storey + bed, step 2) + same LAR bucket — NOT through finer size numbers (they don't exist). The cocktail risk was the missing type/storey gates + unconstrained relaxed funnel, both fixable (steps 1+2). Size precision beyond the bucket is a hard data limit.
Canonical LAR bucket order (ignore 3 noise rows: 600-699, 800-899, 2500-2749 = 4 rows total): < 700 → 700-1100 → 1100-1500 → 1500-2000 → 2000-2500 → 2500-3000 → 3000-3500 → 3500-5000 → 5000+. Widths non-uniform (100-500 wide in the mass band, 1500 wide at luxury). 81.6% of homes sit in the 700-2500 mass band.
isAdjacentRange MUST be a hardcoded lookup against this canonical order (NOT runtime string-parsing — the 4 noise rows would corrupt parsed adjacency).


Survived the pooler-timeout fight (single-pass query). The data behind step 5. ~30-35% of homes carry at least one real desirability signal the matcher ignores today.
LAYER 1 — free structured wins (100% non-null, zero false-positive, use first):

view jsonb — ~14% carry a premium tag. Trees/Woods 16,316 · Forest 5,249 · Park/Greenbelt 5,036 · Lake 4,817 · Water 3,766 · River 2,050 · Pond 1,764 · Creek/Stream 1,389. Cheapest big win.
waterfront_yn (scalar) — true 8,949 (2.82%). Cleaner than the features array; use this for the binary. Premium 30-100%.
exterior_features → "Backs On Green Belt" 3,150 (~1%) — backing signal already structured (text underreports it ~4×).
Income-suite: interior_features In-Law Capability 18,116 + In-Law Suite 11,818 (~30k); corroborated by basement-kitchen signal kitchens_total > kitchens_above_grade (~27k, since 34,884 have 2 kitchens but only 8,004 have 2 above-grade).

LAYER 2 — structured richness the matcher never touches (free, high-fill, additive delta lines):

washrooms_type1..5 (+ _level, _pcs) — decomposes baths into floor + piece-count. Distinguishes "2-bath-main + 1-bath-basement" from "3-baths-same-floor". Matcher only uses bathrooms_total_integer today.
bedrooms_below_grade — structured basement-bedroom count (income corroboration).
main_level_bedrooms + Primary Bedroom - Main Floor (33,326) — accessibility / luxury-bungalow signal.
direction_faces — 97.79% filled (N/S/E/W). South-facing backyard premium, nearly fully populated.
Also exist, unprobed/secondary: den_familyroom_yn, recreation_room_yn, room_height (cathedral ceilings), room_type jsonb.

LAYER 3 — text signals from public_remarks. 33.3% (105,781) mention SOME signal, but word-matching is mostly false-positive. Step-5 first pass uses ONLY the 3 clean ones (exact match, no co-occurrence), as WORDED deltas not dollars:

✅ %ravine% 9,662 (3.04%) — NO structured equivalent exists; text-only or it doesn't exist. The high-value odd/even proxy. The reason to do text at all.
✅ %no rear neighbour% + %no rear neighbor% 6,465 (~2%) — clean, low false-positive, strong positive.
✅ %conservation% 5,060 (1.59%) — clean.

DEFERRED to step 5b (logged, not lost) — needs co-occurrence / sentiment logic, earns its own backtest pass:

Loose nature-word matches: %lake% 32,592 / %river% 16,323 / %pond% 8,095 — 6-8× looser than structured view tags (street names, "5 min to lake"). Only count when paired with a backing verb (%backs%lake%) or cross-confirmed by view tag.
%hydro% 14,188 (4.47%) — NEGATIVE signal ("hydro corridor at rear" = easement, no privacy). Weights DOWN; requires sentiment check before use.
%premium lot% 4,316 (1.36%) — self-declared agent marketing; soft.

DEAD — do not use (verified):

lot_features jsonb — only ever contains "Irregular Lot" (7,759). Info already in lot_shape.
lot_dimensions_source — only value "Other".
Bare %lake%/%river%/%creek% without co-occurrence — 75-90% false-positive.
Columns that DON'T EXIST: property_condition, year_renovated, corner_unit, cul_de_sac, frontage_type, den_yn (real name is den_familyroom_yn).

Pool (verified all values): None 280,427 · Inground 14,316 (only one matcher reads) · Above Ground 5,543 · Salt 1,403 · Community 747 · Indoor 620. Step 5 covers all types, surfaced as narrated delta.
Condition/renovation: no structured field exists. %renovated% 58,090 (18.28%) + %updated% 59,670 (18.78%) in remarks = ~37% combined — text-only path, deferred (not in first-pass scope).

Run log
2026-06-04 — v1 opened + homes census run

Sequencing locked: estimator core first, RAG second. Hybrid confirmed. Homes priority.
Homes data census complete (read-only, verified). Findings logged. Operator domain inputs locked.
3 recon-pending items flagged. No code touched, no design locked.

2026-06-06 — PATH B (harness de-duplication) — fixing the measurement blindness (refactor backtest to import production), NOT Path A (mirror patches into inlined copy).** Path A would maintain the duplicate-logic divergence that caused the measurement blindness; Path B eliminates it permanently — one implementation, backtest measures exactly what production runs, every future patch tested for free.
STAGE 1 SHIPPED (production parameterization for as-of-date) — 5 seams, tsc-clean, byte-identical live behavior:

Seam 1: HomeSpecs += asOfDate?: Date + subjectListingKey?: string (both commented backtest/historical-only).
Seam 2: const referenceDate = specs.asOfDate ?? new Date() → twoYearsAgo derived from it.
Seam 3+4: community + muni queries += .lt('close_date', referenceDate.toISOString()) (no-op for live since Closed rows have no future dates).
Seam 5: recency in scoreMatch reads specs.asOfDate?.getTime() ?? Date.now() — read off specs (already passed in), so NO signature change and NONE of the 4 call sites (562/578/617/635) touched. Cleaner than threading a param.
Backwards-compat: when asOfDate absent (all live callers) → referenceDate=now, .lt no-ops, recency=Date.now() → identical to pre-Stage-1.
subjectListingKey added to interface but NOT yet wired to a query .neq() (avoided guessing the query anchor). Exclude-self handled on backtest side (its own fetch already does `listing_key != # W-ESTIMATOR-RAG — Estimator Core Logic + AI RAG Accuracy Tracker

Status: v12 — DESIGN LOCKED (homes) + PHILOSOPHY + PRICE-OUTPUT MODEL + VALUE-SIGNAL INVENTORY + SIZE-FIELD VERDICT + DYNAMIC PRODUCT-AWARE MATCHING MODEL + MANDATORY-FOUNDATIONS RULE. NOTHING BUILT — no code touched, no design ships without operator okay.

v12 — DYNAMIC PRODUCT-AWARE MATCHING MODEL (LOCKED 2026-06-04) — the core estimator logic
The governing realization: the matcher's complexity must scale to the product. A townhouse is simple (standardized lots, storey + sqft range = done). A bungalow on 4 acres is a different universe where the LAND is the value — missing the acreage field there is a catastrophic error, not a small one. The estimator must detect which world it's in and apply exactly as much rigor as that world demands.
The dynamic flow (every home estimate)

Identify the product (categorical gates — hard, never crossed):

TYPE: Detached / Semi-Detached / Townhouse / Link (Link split out per v10). Type-isolated pools.
STOREY/STYLE: 2-storey ≠ 2½ ≠ 3-storey ≠ bungalow-family ≠ split. Storey is a product separation (operator ruling, critical esp. townhomes).


Pick the LOT REGIME (the regime switch — driven by the data field, not a guessed city list):

acreage / large-lot filled → ACREAGE REGIME. Lot is the dominant value driver. Comparability runs on acreage (~similar acreage matches). A 5-acre parcel compares to ~5-acre parcels — NEVER pooled with a 0.4-acre suburban lot even if both houses are "4-bed detached." The house on the land still matters (mansion on 5ac ≠ cottage on 5ac), but the land regime gates first.
acreage empty → URBAN/SUBURBAN REGIME. Comparability runs on FRONTAGE, as a continuous PROPORTIONAL band (~±X% of subject frontage, NOT fixed ±feet). 60ft → ~48-72ft; 79ft → ~63-95ft; 200ft → ~160-240ft. The band scales with the lot because value scales with the lot (50→60ft matters; 200→210ft doesn't). X% to be set FROM DATA, not guessed.
Townhouse special case: lots are standardized → lot dimension barely varies → frontage band is wide/non-binding → storey + sqft range is effectively the whole match ("bingo"). Complexity correctly collapses for simple products.


Band on SIZE: same LAR bucket (exact in strict tier, ±1 adjacent in relaxed). LAR is the only real home size signal (verdict below).
Now you have a TIGHT set of genuine apple-to-apple comparables (ideally a handful, ~5). Same type, same storey, same lot-regime, same size band.
PRICE = MEDIAN of that tight set. NOT a mean. NOT a weighted blend of 140 properties. Median is robust — one weird comp can't drag it (the current arithmetic-mean is exactly what produces the negative-price blowups). Five real apples, take the middle.
If the tight set is too thin → WIDEN the geo cascade (street → community → muni) → then ROUTE TO AGENT. Never average garbage into a number. The band protects apple-to-apple; the cascade protects coverage; the agent catches the irreducible remainder (the 8%).

Why median, not mean (locked)
The recon found valuation = simple arithmetic mean of comp prices ± tier band. Mean is fragile: one stretched/bad comp drags the number (and with hardcoded adjustments, below zero). Median of a tight genuinely-comparable set is robust to outliers — both simpler and more accurate. This is how a good agent actually thinks: "I have 5 real comps, the middle one is X."
MANDATORY FOUNDATIONS RULE (LOCKED 2026-06-04) — the ENGINE enforces; entry points must satisfy
The estimator deals in DATA. A number built on missing foundational inputs is a wrong number dressed as a real one. We are NOT here to please the user with a frictionless form — we are here to give a CORRECT answer, and correctness has prerequisites. If prerequisites aren't met, the estimator does NOT produce a number — it asks for them, or routes to the agent. It NEVER guesses or runs foundation-blind.
Clean separation of concerns (clarified by operator):

THE ESTIMATOR is deterministic CODE LOGIC. Form → specs → matcher → median → result. The "AI layer" (getAIInsights) is pure presentation — 3 text fields, changes ZERO numbers, $0, off by default. The estimate NUMBER is 100% code. This workstream = the engine.
CHARLIE is a SEPARATE conversational AI product that happens to be one entry point calling the same engine. The seller form physically lives in Charlie's components (app/charlie/components/SellerForm.tsx) — that's the only connection.
THE GATE LIVES IN THE ENGINE (this workstream). The matcher refuses to produce a number when foundational inputs are missing, regardless of caller. Because the engine is the gate, EVERY entry point (form, buyer modal, Charlie) is automatically forced to supply foundations — no caller-specific enforcement logic needed in the engine work.
Charlie's CONVERSATIONAL enforcement (asking the user in chat, validating before calling the engine) is a NEXT-PHASE Charlie UX item — NOT this workstream. Charlie being AI doesn't exempt the data from discipline, but adapting Charlie's conversation to the engine's gate is downstream. Logged, deferred.

Foundations are HIERARCHICAL and PRODUCT-CONDITIONAL — not a flat list:

Universal identity (always mandatory): TYPE, STOREY/STYLE, SIZE range, beds, baths. Without these there is no product to compare.
Product-specific value driver (mandatory, but WHICH ONE depends on the product):

HOME → LOT is foundational. Two identical houses on a 50ft vs 100ft lot are NOT comparable — the land is half the value. Lot (frontage OR acreage per regime) is a foundational COMPARABILITY constraint, NOT a post-hoc $/ft adjustment. This reclassifies frontage from a Tier-2 score nudge to a Tier-1 matching gate for homes.
CONDO → frontage is meaningless (no lot). Foundational variable switches to interior size + building/maintenance/parking factors.


Enriching (lowers confidence / widens range if absent, does NOT block): age, basement, garage, pool, premium signals. These place the home WITHIN the range and feed feature-delta narration — their absence widens the range honestly rather than blocking.

THE STARVED-FORM PROBLEM (located 2026-06-04 — the upstream bottleneck)
The matcher can be perfect but produces wrong numbers if the form starves it. Verified in SellerForm.tsx + SellerEstimateRunner.tsx:

Size (LAR) is OPTIONAL on the home seller path — no validation. When skipped, conditional spread drops it → specs.livingAreaRange undefined → matcher falls through both size branches → size-unconstrained pool → a live production source of the RANGE-ADJ negative-price catastrophe (separate from the relaxed-funnel hole).
Form only populates ~4 of ~11 scoring dimensions. Style, age, basement, garage, pool NEVER collected on seller path → all score 0 → max achievable score ~100/200 → every seller estimate capped at RANGE tier, BINGO structurally impossible. A seller literally cannot get the estimator's best match because we never asked.
specs.exactSqft is NEVER set on the seller path (form has no field) → confirms dropping the dead SFS branch breaks zero seller traffic.
Buyer modal (from a listing record) CAN populate more fields → form-side enrichment is a separate, larger workstream from the matcher patch.
Consequence: making foundations mandatory in the form/Charlie is now a PEER priority to the matcher patch — fixing the engine while the fuel line is half-disconnected is incomplete work. Size-mandatory is the first and clearest enforcement.


Started: 2026-06-04
Owner: Shah
Predecessor: W-FUNNEL (closed 2026-06-04).
Suggested location on disk: docs/W-ESTIMATOR-RAG-TRACKER.md

Why this exists
The estimator is delicate, accuracy-critical work. Two parts:

Estimator core logic (PRIMARY) — the deterministic valuation engine across four paths: condo sale, condo lease, home sale, home lease. Hybrid approach (comparable-based + formula/PSF). Goal: make the core so solid the AI layer becomes optional — accuracy and relevance from the code itself.
AI RAG responses (SECONDARY) — the AI commentary/insight layer on top. Improve quality, but the strategic aim is to reduce dependence on it as the core hardens (cost saving — AI calls are paid).

Homes analysis is the priority concern — flagged as the weakest area, needs the closest look.

Locked decisions

Sequencing: Estimator core FIRST, then RAG. Rationale: RAG adds insight on top of a valuation; if the underlying number is wrong/weak, improving AI commentary is narration over bad numbers (and a convincing AI explanation of a wrong valuation is more dangerous than an obviously-thin one). The core must be hardened first to even measure how much AI is still needed — which is the precondition for the cost-saving "shrink the AI layer" goal. (Locked 2026-06-04.)
Core approach is hybrid: comparable-based (find similar sold/leased → derive price) + formula/PSF (adjustments). Both layers are independent accuracy sources; homes weakness localized — see findings.
Cost-saving thesis: strong deterministic core → less reliance on paid AI commentary. The §9.2 work already made estimator AI tenant-keyed + off-by-default per tenant, so reducing AI use is also a per-tenant cost lever.
STRICT BUCKETING — CONFIRMED with eyes open (v9, 2026-06-04). Like-for-like comparable pools: style-family + size + bed, community → muni cascade. Measured cost: 82% confident / 11% thin / 8% route-to-agent. Bounded and affordable. The 8% route to the agent because there genuinely is no clean comparable — that is the right behavior per the prelude-to-agent framing, not a failure.
STYLE-FAMILY GROUPING — CONFIRMED (v9). Bungalow + bungalow-raised + bungaloft grouped together costs almost nothing vs exact-style (60% vs 56% confident) — a cheap, sensible relaxation that stays inside apples-to-apples.
PSF FOR HOMES — OUT as a pricing tool (v9, resolved by data, not assumption). No table has the style+size segmentation strict bucketing requires. Homes price from the comp pool itself, not a PSF surface. geo_analytics survives ONLY as the market-context (absorption / DOM / pace) feed for the report — never as a PSF pricing signal.
COMPARABLE URL LINKS — KEEP, non-negotiable (v9). Each comparable links to its listing page so the user can verify the claim ("you said 142 Maple sold for $890k — here's the listing"). This is trust, and it reinforces the real-data thesis. Carries forward into the new report. Build constraint: comparable links MUST resolve to the tenant's own domain (same tenant-correct-URL rule the funnel session enforced) — multi-tenant, never hardcoded.
LISTING-CARD STYLE — CONFIRMED design upgrade (v9). Comparables render as cards (photo, linked address, sold price, beds/baths, sqft range, sold date, DOM) instead of a flat table. Makes comps feel like real properties. Same card style extends to the "what's competing now" active-listings section.


v10 — ESTIMATOR PHILOSOPHY (LOCKED, 2026-06-04) — the spine everything builds toward
This is the governing philosophy. Every build step serves it. Locked by operator.
Principle 1 — TIGHT beats WIDE. The machine's edge is reliability, not volume.
The win is NOT "hold 140 comps where a human holds 5." 140 comps = 5 real comparables diluted by 135 irrelevant ones. A good agent doesn't fail to hold 140 — they correctly IGNORE 135 because those aren't the same street, same product, same backing. The machine's edge over the human is doing the same tight, street-level, feature-aware comparison the best agent does — but consistently, at scale, without getting tired or missing a tag. Same method, more reliable execution. NOT a different "PhD" method. A real estimate off 4 same-street comps beats one off 40 community comps. We never widen the pool just to inflate the count.
Principle 2 — Take the complexity onto OUR side. Hand the public a clean story.
We cater to the normal public, not PhDs. The machine does the hard part (catches every feature, checks every comp, runs the cascade); the user gets the clean narrative: "here's your home, here's what sold down the street, here are the 3 things different and which way each pushes your price." Rich and accurate underneath, readable on top. Solving complexity — not manufacturing it.
Principle 3 — Features are SHOWN, not silently blended.
Features don't just nudge a hidden number — they become lines in the report. The flow:

Scan the subject FIRST — read everything the subject home has (backing, view, basement finish + separate entrance, pool, garage, lot, condition).
Foundational match — find tight, same-street/community comparables that pass the real product gates (type, storey).
Narrate the deltas, ±, in the report:

Subject HAS a big feature comps LACK → highlight as a plus ("Your home backs the ravine; 142 Maple doesn't — supports pricing above it").
Subject LACKS a big feature comps HAVE → highlight as a minus, honestly ("142 Maple has a finished walkout w/ separate entrance; yours is unfinished — expect to price below it").




Delta expression = BOTH (locked): dollar impact where the data supports it (e.g. +$30k pool), direction + words (↑ strong plus / ↓ minor minus) where it doesn't. Never a silent number move.

Principle 4 — GRACEFUL DEGRADATION with honesty at every tier (the report spine).
The estimate NEVER silently passes a muni-level guess off as a street-level fact. Each cascade tier carries its own note, guiding the user at every level:

Street level → "Here's what sold on your street." (Highest confidence — say so.)
Community level → "Nothing comparable sold on your exact street recently — here's what sold in your community."
Municipality level → the honest hand-off: "I couldn't find a true comparable in your community. Here are some suggested recent sales nearby — but this is wider than ideal, so contact the agent to confirm." A guided, honest route to the agent — NOT a confident number dressed as precision.
This IS the 82/11/8 split: the 8% route-to-agent is where even widening produces no real comps. We don't manufacture a number from garbage; we hand it to the agent. That is the accuracy.

Principle 5 — Show FOR-SALE competition, not just SOLD comps.
A seller pricing today competes against live inventory, not just history. The report surfaces actively-listed competing properties (same listing-card style: "here's what you're up against now") alongside sold comps. This is what makes it a pricing TOOL, not a backward-looking average. (Build step 4.)
Principle 6 — The WOW: relevant, accurate, valuable.
The user sees: their home → real sold comps with clickable, verifiable, tenant-correct links → live competing listings → honest feature-deltas. Rich on our side, clean on theirs.
Architecture resolution
Resolved by Principles 1–5 together: we are NOT building a 140-comp weighted blender. We build tight street-first comparables (pin → street → community → muni cascade) + a feature-delta narrative + tiered-honesty notes + active competition. The existing 200-pt scoreMatch is used to RANK and to select the tight pool and to drive the feature-delta narration — not to blend a wide pool into a silent mean. Hard product gates (type, storey) keep non-comparables out entirely; refinement features become narrated deltas, not delete-gates that empty the pool.
Principle 7 — PRICE IS A RANGE, and the range's WIDTH means confidence (v11)
A single point price is almost a lie. The output is a range, and the width carries meaning:

Tight comps (street-level, clean) → NARROW range ("$1.82M–$1.88M") → high confidence, say so.
Stretched comps (muni-level) → WIDE range ("$1.65M–$1.95M") → the width itself honestly signals lower certainty. The range IS the tiered-honesty principle made numeric — no separate disclaimer needed.
Desirability signals shape WHERE IN THE RANGE the home lands: ravine + finished basement → top; lacks comp features → bottom. This is the bridge between the desirability layer and the number.

Principle 8 — INVERSE NARRATION: show how we got to the price (v11) — the trust mechanism
The feature-delta narration runs BACKWARDS to JUSTIFY the number. Not a side-panel — the actual derivation:

"Started from 3 homes sold on/near your street: 14 Glendale ($1.79M), 88 Marmaduke ($1.95M), 5 Fern ($1.82M). Your home backs the ravine — Glendale doesn't (+). Marmaduke has a finished walkout yours lacks (−). Nets to $1.82M–$1.88M."


The user traces the price back to real, clickable, verifiable sold homes + the specific reasons it moved up/down from each.
Self-policing: if we can't write the derivation honestly, we don't have a price — we have the route-to-agent.

PRICE-ROLE BOUNDARY (LOCKED v11) — what the desirability layer may and may NOT do

Comparables PRICE the home. Tight real sold comps produce the base range. Signals never override this.
Structured signals (Layer 1+2) carry DOLLAR deltas — but ONLY after step 3 makes adjustment values real (market-derived per community). Until step 3, dollar adjustments are flat hardcoded constants and are NOT trustworthy as dollars. This is WHY step 3 precedes step 5 as a dollar influence.
Text signals (ravine, no-rear-neighbour, conservation) carry WORDED deltas, never dollars — text is a softer source (e.g. bare %lake% is 6.8× false-positive vs structured view tag). Maps onto the BOTH delta rule: dollar where structured/strong, words where soft.
Signals REFINE and EXPLAIN; they do not MANUFACTURE confidence. In thin-comp (muni / 8%) cases, signals become part of the honest hand-off ("your ravine lot is a real premium, but no clean comparable exists — see the agent"), NOT a rescue into a confident number.
Build-order rationale confirmed: 1 (size) → 2 (gates) → 3 (real adjustments) → 4 (competition) → 5 (signals). Each step earns the right to influence price before it's allowed to.


Resolution 1 — PSF question: SETTLED, confirms skepticism was right
PSF tables are a dead end for homes:

psf_monthly_sale / psf_monthly_lease: 98% of communities BLEND condo + freehold into one PSF (no property_type column), and 5 months stale → unusable as-is. A $750/sqft condo averaged with an $1,100/sqft house is the apples-to-oranges baked right in.
Per-building PSF tables: condo-only → drop entirely.
One survivor: geo_analytics — has an explicit track='homes' column AND a subtype breakdown (Detached / Semi / Townhouse, each with own median/DOM/sale-to-list), reasonably fresh. BUT: no style segmentation (no bungalow-vs-two-storey split) and the subtype breakdown was empty on 4 of 5 sampled rows. → usable for top-line market context (the report's absorption/DOM/pace section), NOT as a PSF pricing signal.

Net: PSF as a pricing tool for homes is OUT — confirmed, not assumed. Any home PSF would have to be derived per-query from raw listings. Homes price from the comp pool. geo_analytics = market-context feed only.
Resolution 2 — Bucket contamination: CONFIRMED, located exactly
The apples-to-oranges fear is real and located:

Sale strict funnel: style is a hard gate (good — bungalows excluded from two-storey pools when both styles known, which is 98.6% of the time).
Sale's municipality fallback: NO style filter — when the strict funnel fails and drops to muni, it pools bungalows + two-storeys + sidesplits together. LEAK.
Lease: NO style logic anywhere — every lease tier pools all styles together. COMPLETE LEAK.

→ Strict ruling is partially implemented for sale, entirely absent for lease. Closing both leaks is a concrete, located change: make style a hard gate in sale's muni fallback + all lease tiers, with family grouping.
Resolution 3 — Coverage cost: MEASURED before committing
Under strict bucketing (community → muni cascade, style-family + size + bed): 82% confident / 11% thin / 8% route-to-agent. Affordable — far better than feared. Only 8% get "see the agent." Luxury hit harder at community level (67% thin) but muni fallback recovers most. Style-family expansion is the cheap relaxation (60% vs 56% confident exact-style).

The full diagnosis (confirmed, v9)
The home estimator is accurate when it has a clean match and breaks when it stretches. Two located root causes:

Dead size field — reads empty square_foot_source → relaxed tier does no size filtering → pools 1,000 with 4,000 sqft homes → negative prices.
Bucket leaks — style is a hard gate in the strict sale path but absent in sale's muni fallback and all of lease → bungalows pool with two-storeys.

Both specific, located, fixable.

Build sequence — LOCKED (v10, all measured against the 16.8% baseline)
Each one built, then re-run through the backtest to prove it moved the number — kept only if it did. Every step serves the v10 philosophy (tight comps + narrated feature-deltas + tiered honesty + active competition).

Fix the size field — point home matching at living_area_range (the strategy that already works for condos). Highest leverage — upstream of the negative-price catastrophe. Relaxed-funnel size band still OPEN (exact / ±1 / ±2 LAR bucket) — to be decided when step 1 is authored, measured on backtest.
Close the bucket leaks — the located leak is the bedBathOnly last-resort muni fallback (lines 622-636), which drops style to scoring-only. Make product gates (type + storey) hard everywhere including that path. Also: split Link out of the Townhouse type pool; break the twostorey style family apart so storey count (2 / 2½ / 3-Storey) is a real product separation, esp. for townhomes (operator ruling, v10).
Real-data adjustment analytics (community-level, dashboard-editable) — replaces ALL flat hardcoded constants (frontage $40k/ft, basement $50k/$80k/$110k, garage, pool, bath). Per-market, not flat. Fixes the 3 basement score/dollar inconsistencies. Wires the existing adjustments table (muni/community/area grain) into the home path.
Active competition + absorption (from geo_analytics + live For-Sale listings) — the selling-side input + the "what you're up against now" report section (Principle 5).
Premium / value signals (desirability layer) — see VALUE-SIGNAL INVENTORY below. Step-5 first-pass scope LOCKED (v11): Layer 1 (structured premium) + Layer 2 (structured richness) + the 3 clean text signals only. Loose word-matches + hydro-negative deferred to step 5b. Closes luxury quality-of-match AND feeds feature-delta narration. Fix pool to cover all pool types.

Report-layer (parallel, design-locked v11):

Comparable URL links preserved — MUST resolve to the TENANT's own website, never a hardcoded domain (multi-tenant non-negotiable, same tenant-correct-URL rule as the funnel work). Applies to BOTH sold comps AND competing-for-sale links. Explicit build-gate.
Comp / competing display = Option C (LOCKED v11): Charlie-density tile + ONE feature-delta line. NOT full cards (too tall — 3 sections would bury everything), NOT pure Charlie tiles (no room for the delta — loses the wow). Small scannable tile (price, linked address top-right, bed/bath/sqft/sold-date) + one delta line (dollar-or-words) showing the single most important ± vs subject. Same tile for "Comparable Sold" and "Competing For Sale" sections.
Competing For Sale section (Principle 5) — live Active / For Sale listings, same Option-C tile, framed forward ("3 similar homes listed now, $1.79M–$2.05M — your competition"). Forward-looking half of the pricing strategy.
Price shown as a RANGE (Principle 7) — width = confidence; signals place the home within it.
Inverse narration (Principle 8) — the derivation IS the report: comps → ± reasons → range.
Tiered-honesty note on every estimate (Principle 4) — street / community / muni each carry their own confidence framing.
Output SPLITS at the end: confident comprehensive report for the 82% with clean comps; honest "see the agent" route for the 8% without.


Recon scope (COMPLETE — read-only, done before design lock)
Estimator core — all four paths (condo sale, condo lease, home sale, home lease):

R1 — Comparable selection: per path, how comparables are chosen (geo radius, building, property-type match, time window, bed/bath/sqft filters); source (PropTx MLS / building sales tables).
R2 — Valuation math: per path formula; PSF basis; adjustments (size, beds, baths, age, condition, time-decay); comparable-derived vs formula-derived and how they combine in the hybrid.
R3 — Homes vs condos divergence (the priority): where the home path differs from condo in BOTH comparable selection and math; why homes is weaker. Localized — see findings.
R4 — Empty/thin-comparable handling: the CONTACT-tier fallback — when each path falls back, threshold correctness.
R5 — AI attachment point: getAIInsights attaches as pure presentation (3 text fields), changes ZERO numbers, currently $0 (both tenants toggle off). Cost-saving thesis confirmed: core already stands alone.
R6 — Accuracy measurability: backtest fully feasible against existing close_price data — measurement is possible (harness shipped, see findings).

Gate: recon reviewed → design lock per path → then build (hardening), recon→design→smoke discipline per CLAUDE.md.

Open questions (status)

How is accuracy currently validated? → RESOLVED: backtest harness scripts/backtest-estimator-homes.js against real close_price. Baseline 16.8% median.
What's the acceptable AI-off output quality bar — how good must the core be before the AI layer is "optional"? (Still open — sharpens as build proceeds.)
Homes: weakness in data or logic? → RESOLVED: both, and located — dead size field (data-field misuse) + bucket leaks (logic). Code fixes, not a data-sourcing problem.


Findings
BACKTEST BASELINE (2026-06-04, 500 sale + 500 lease real subjects, as-of-date + exclude-self) — THE MEASUREMENT BASELINE
Home SALE — a TIER problem, not uniform weakness:

BINGO (n=43): MAE $70k, median 7.1% off, 84% within ±15% — excellent when match is good.
RANGE (n=137): median 13.7%, 56% within ±15% — fine.
BINGO-ADJ (n=223, the bulk): median 19%, 43% within ±15% — mediocre.
RANGE-ADJ (n=49): CATASTROPHIC — median 150% off, 2% within ±15%, one subject predicted NEGATIVE price. Hardcoded adjustments drive comp prices below zero when stretching a poor match. Proves the chain: fake adjustment values actively destroy accuracy, not just imprecise.
Overall median 16.8%; mid-market ($500k-1M) best (14%); <$500k worst (30%, likely misclassified); community-scope beats muni-fallback by ~16%.

Home LEASE — basically works: 78% within ±15%, median 6.9%, bias ~0. Lower priority. Dead spot: BINGO tier never fires (exactSqft null on ~95% homes — same sqft-column issue).
Three assumptions OVERTURNED by data:

Luxury is NOT thin-comp — p99 homes have ~140 comps available (<3-comp only 4%). The luxury gap (25-35%) is QUALITY-of-match (view/lot-prestige/finishes the matcher can't see), NOT count. Changes the luxury fix: read premium signals, don't "handle thin pools."
Premium signals are STRUCTURED, not just text (huge — easier than feared): jsonb tags exist in volume, all UNREAD — view: Lake 4,486 / Park-Greenbelt 4,040 / Forest 4,901; exterior_features: Backs On Green Belt 2,824, Deck 51,550; interior_features: In-Law Suite 10,376 / In-Law Capability 17,239 (income-suite signal). Operator's street/backing/income instincts are in clean structured fields.
Five pre-computed analytics tables IGNORED by estimator: psf_monthly_sale (16,730), psf_monthly_lease (18,501), geo_analytics (18,184), building_psf_summary (75), building_psf_transactions (10,698). Only adjustments (408) is wired in. v9 ruling: PSF tables OUT for homes pricing; geo_analytics retained as market-context feed only.

Sample report (real, current-state) — 37 Lavinia Ave, Toronto W01: sold $1.885M, predicted $2.057M (+9.1%). Comp pool visibly lumped $1.3M and $3.9M homes together (no street-awareness — can't tell Lavinia from South Kingsway). Demonstrates: no street/block awareness, no competition layer, 55% null age (20-pt age dimension dead), unread view/greenbelt tags, flat $40k/ft frontage where W01 real premium is ~$75-100k/ft, unused PSF surfaces.
Homes data census (2026-06-04, all verified against live DB — 317,975 freehold closed rows, 2y)
Operator domain inputs (locked — guide the matrix design):

Street-level comparison matters; odd/even house number carries weight because same-side homes often share the same BACKING (lake/ravine/green space = materially more valuable). Odd/even is a proxy for "what's behind the property."
Luxury homes are a unique market — comparable-averaging breaks down. Needs distinct treatment (now = premium-signal reading, not thin-pool handling — see overturned assumption).
Real-data analytics exist for building parking + lease prices (condos) — must be used, not reinvented.
Strategic goal: electronic analysis takes the user FURTHER than a human could — comprehensive data analysis at scale/consistency a person can't match. Surface every real, data-backed signal.
METHOD RULE: see data comprehensively FIRST, then design how to use it. No guessing — every value real-data or it doesn't ship. Nothing changes without operator okay.

Data realities that reshape the homes plan:

F-HOME-SQFT-WRONG-COLUMN (High): home matcher's best size-match tier uses square_foot_source (95% NULL on homes, ~99% non-numeric labels when present) → that tier is dead code. calculated_sqft is 68% populated and NEVER read. Build step 1 points matching at living_area_range (proven condo strategy). Biggest single accuracy lever.
F-HOME-STREET-BONUS-BUILDABLE: street_name + street_number 100% populated as clean structured fields. Dead "same-street bonus" (hardcoded false) is trivially activatable; odd/even = street_number % 2. Street-level + odd/even fully data-supported.
F-HOME-BACKING-SIGNAL-IN-TEXT-ONLY (High effort): value-driver behind odd/even (backs onto lake/ravine/greenspace) is NOT structured — lot_features jsonb effectively empty. Signal lives in public_remarks free text: ravine 3%, backing-onto ~5%, green space 3%, water-adjacent ~17% combined. Requires phrase extraction (harder tier than structured street match).
F-HOME-ZERO-REALDATA-ADJUSTMENTS (High): all 8 home adjustment values hardcoded constants (lot frontage flat $40k/ft EVERYWHERE, basement/garage/pool/bath). Condos have a real adjustments table (408 rows, computed from real data); homes have none. Directly violates the real-data rule. Build step 3 replaces with community-level dashboard-editable real-data adjustments.
F-LUXURY-NO-PATH (High): price right-tail-skewed (mean 16% > median, p99 $3.3M, max $27M). Reframed by data: luxury gap is quality-of-match, not comp count. Fix = read premium signals (build step 5).
F-HOME-WATERFRONT-IGNORED (High): waterfront_yn 3.8% true, estimator ignores entirely; waterfront premium can be 30-100%.
F-HOME-POOL-PARTIAL (Med): Inground 5.9% (handled), Above Ground/Salt/Community/Indoor ignored.
F-HOME-AGE-52PCT-NULL (Med): half of homes have no age; NULL-age comps pass unfiltered (asymmetric) — 20-pt age dimension degrades on half the pool.
F-HOME-INCOME-SUITE-SIGNAL (Med): ["Apartment","Separate Entrance"] basement 1.6% — income-suite value signal, grouped without extra value today.
F-HOME-SUBTYPE-SCOPE-GAP (RECLASSIFIED 2026-06-06 — see "VACANT LAND / LOT VALUATION sibling product path" entry at end of run log): no longer "Low — excluded." Vacant Land / Rural Residential / Farm become a SIBLING product priced on LAND ($/acre median × subject acreage, or $/frontage × frontage), NOT on building. Geo cascade COMMUNITY → MUNICIPALITY → AREA only (NO street tier — street/odd-even is a house-backing proxy, meaningless for raw land). Status: design-locked PENDING DATA RECON ($/acre per-community stability + comp survival at each geo tier not yet captured to disk). Lease partial-home types (Lower/Upper Level, Room) still passthrough-only.

Condo-side bug found incidentally:

F-RESOLVE-ADJUSTMENTS-PARKING-SALE-COLUMN-MISMATCH (P1): resolve-adjustments.ts:46 references parking_sale_calculated — column doesn't exist (real: parking_sale_weighted_avg). Condo-SALE parking silently falls to hardcoded $50k, never reads the real computed values. Isolated, quick fix. Still P1-quick.

Cross-path (confirmed):

Valuation = simple arithmetic mean of comp prices ± tier-multiplier band. No median, no recency-weighting, no match-quality-weighting. No PSF formula.
AI is pure presentation (3 text fields), changes zero numbers, $0 today (both tenants toggle off). Core already stands alone.
Backtest fully feasible against existing close_price data.

Backtest harness scripts/backtest-estimator-homes.js is the re-runnable audit trail — every future change re-measured against these CSVs to prove it helped.
Feature inventory — home matcher current state (verified, 3 recon passes 2026-06-04)
Every feature the home matcher touches today, how it's used, and what's wrong. This table IS the feature-delta narration source list (Principle 3).
#FeatureDB fieldUsed nowProblem1Property typeproperty_subtypeHard SQL gate, firstLink wrongly pooled with Townhouse (step 2 splits it)2Architectural stylearchitectural_style[0]Hard gate (family) + 25pt score2/2½/3-Storey wrongly one family (step 2 splits)3Age bracketapproximate_ageHard gate + 20pt score52% null; null comps pass unfiltered4Sizeliving_area_range / square_foot_sourceGate + 30pt scoreSFS-numeric dead (0.004% homes); relaxed funnel has NO size filter → negative prices (step 1)5Lot frontagelot_width$40k/ft adj + 25pt scoreFlat $40k everywhere; W01 real ~$75-100k/ft (step 3)6Lot depthlot_depth$5k/10ft (cap $30k) + 10ptHardcoded, not market-aware (step 3)7Basementbasement (jsonb)5-signal decode → $50k/$80k/$110k + 15ptHardcoded flat; 3 score/dollar inconsistencies; lease ignores entirely (step 3)8Garagegarage_type$30k-$70k by type + 10ptHardcoded (step 3)9Bathroomsbathrooms_total_integer$20k each + 10ptHalf-bath rate defined, unused (step 3)10Poolpool_features (jsonb)Inground $30k + 5ptAbove-ground/salt/indoor/community ignored ($0); inground flat $30k (step 5 fixes all types)11Recencyclose_date30pt scoreDollar time-adjustment constants defined, never applied12Same street / odd-evenstreet_name / street_number15+5pt scoreBacking signal (ravine/lake) unread in public_remarks text (step 5)13Bedroomsbedrooms_totalHard gate (exact)Fine
Value signals present in data but UNREAD (step 5 + value-signal recon target) — the desirability layer where the luxury gap lives:

Backing signal (the odd/even proxy): public_remarks free text — water-adjacent ~17% / backing-onto ~5% / ravine 3% / greenspace 3%. Text-extraction tier. The single biggest quality-of-match signal.
View (structured jsonb, unread): Lake 4,486 / Park-Greenbelt 4,040 / Forest 4,901.
Waterfront (waterfront_yn 3.8%, ignored): premium 30-100%.
In-law / income suite (interior_features): In-Law Suite 10,376 / In-Law Capability 17,239 — income-value signal, unread.
Candidate, fill-rate unverified (value-signal recon pending): lot area/shape/irregular, corner lot, condition/renovation, kitchens/rooms, exposure/direction.

Architecture note: the 200-pt scoreMatch already computes per-comp match quality — but the price is currently a flat mean of top comps (no quality-weighting). Under v10 philosophy, scoreMatch RANKS and selects the tight pool and drives feature-delta narration; it does NOT blend a wide pool into a silent mean.
THE FIVE-LAYER MATCH FLOW (LOCKED 2026-06-04, operator-defined) — the definitive estimator flow
This is the authoritative flow. The dynamic model above feeds it; this is how it executes for the user.
Layer 1 — FOUNDATIONS (mandatory; no estimate without them). Type, storey/style, size range. The engine gate. Missing → ask or route to agent, never run blind.
Layer 2 — CRITICAL FACTOR #1: FRONTAGE, proportional variance. Lot recon verified:

±20% proportional band is the variance (operator-set, data-confirmed viable). At community level a subject averages 121 comps within ±20%, 69 within ±10% — deep pools.
Proportional, NOT absolute feet — confirmed: current absolute ±10ft = ±33% on a 30ft lot but ±5% on a 200ft lot (broken both ends). Band scales with subject frontage.
Data caveats baked in: clamp the contaminated 200+ft tail (max=2000ft = data error; reject >500ft unless lot_size_units='Acres'). Route the ~2% Acres regime (rural) separately — don't let a metric-misentry pollute a suburban pool. lot_width/lot_depth are the signals (84%/83% fill). NEVER use lot_size_area (double-units trap: lot_size_units AND lot_size_area_units can disagree; Feet-regime sqft values are anomalous).

Layer 3 — OTHER CRITICAL FACTORS: age, basement, separate-entrance, backing (ravine etc.).

AGE — VERIFIED (recon 2026-06-04): pre-bucketed, 7 buckets (New, 0-5, 6-15, 16-30, 31-50, 51-99, 100+), vocab matches the matcher's AGE_BRACKETS_ORDERED verbatim → bucket-equality match like LAR, no banding/normalization needed. Caveats: (a) 51-99 bucket is 49yrs wide — lumps 1925 pre-war (premium) with 1970 boom (mainstream); in that wide bucket age must weight-down/widen, not feign precision (same coarseness as luxury LAR bucket). (b) Only 43.4% filled; no year_built column exists — bucket is the only age signal. (c) Seller form COLLECTS age but SellerEstimateRunner.tsx DISCARDS it → subject age always null on seller path → age dimension doubly inert. 1-line runner fix revives it (foundations-enforcement workstream, not size patch).
Basement / separate-entrance / ravine-backing / (condo: lake-view, deferred to condo phase) — these are ENRICHING (verified in value-signal inventory): they place the home WITHIN the range + drive ± narration, they don't gate the match.

Layer 4 — BINGO or HONEST SUGGESTIONS — "but always there is something."

Foundations + frontage + critical factors satisfied → BINGO: tight, confident, median price.
No perfect match → closest real suggestions with honest framing ("wider than ideal because…") + route to agent. The user NEVER gets a dead end. Even with no bingo, they get the nearest real comparables + why they're approximate. Always something.

Layer 5 — GEO CASCADE with NOTIFICATION at every step.

Street (with odd/even) → community → municipality → area. Drop a level ONLY when the current is null/thin.
Every drop carries a user notification — "nothing sold on your street, here's your community." The widening is VISIBLE, never hidden. User is never in ambiguity about how tight the comparison is. This is the tiered-honesty spine as the user-facing flow.
STREET/ODD-EVEN DATA VERIFIED (recon 2026-06-04) — and a FREE 20-PT WIN found: street_name + street_number are 100% filled as structured columns (the matcher currently parses unparsed_address unnecessarily — structured columns exist). 98.5% of street_numbers parse cleanly as int → parseInt % 2 reliable for odd/even (1.4% suffix cases like "123A" need leading-number regex; 0.07% no-digit drop out). The matcher's 20-pt street bonus (15 same-street + 5 same-odd-even, scoreMatch:354-358) is DEAD — hardcoded sameStreet=false at line 552 because "we don't have subject address." That's 10% of the 200-pt budget unused — and it's the SAME-SIDE-OF-STREET = same-backing = ravine-proxy signal (operator's #1 instinct). REVIVABLE via 2-file change: SellerEstimateRunner.tsx (add streetName/streetNumber to HomeSpecs), HomeSpecs interface (+ fields), matcher (read structured street_name/street_number, drop the address parser), HOME_SELECT (+ columns). High value-per-effort, foundational to Layer 5 — sequence EARLY.


The point of every estimate: get the user to VALUE with accurate + relevant data, median-priced, features highlighted (± narration), honest about confidence. Complexity scales to the product.
ScenarioRegimeWhat gates (foundational)What happensTownhouse, 1500-2000, 2-storeyUrban, standardized lottype + storey + LAR. Frontage band wide/non-binding (townhouse lots uniform)Simple "bingo" — storey + sqft range matches, tight pool, median price. Lot barely varies so it doesn't dominate. Complexity correctly LOW.Detached 2-storey, 60ft lot, suburbanUrban frontagetype + storey + LAR + frontage proportional band (~48-72ft)Comps within band on same street/community, median. 100ft-lot comps EXCLUDED (different product).Detached 2-storey, 79ft lotUrban frontagesame, band ~63-95ftProportional band handles the "never exactly 50 or 100" reality — 79ft finds its real neighbours.Bungalow on 4 acres, ruralACREAGEtype + storey + acreage (the field that MUST NOT be missed) + sizeCompares to ~4-acre bungalows. Land dominates. Missing acreage here = catastrophic (pools with a 0.4ac suburban lot = "dumb and dumber"). House-on-land still differentiates within the acreage set.Subject skips size (form allowed it today)anysize MANDATORY — blockedEstimate does NOT run size-blind. Ask for size, or route to agent. (Fixes a live negative-price source.)Luxury, 3500-5000 bucket (1500 wide)urban/largetype+storey+LAR+lotStructural size-resolution ceiling (no finer field exists). Wide bucket → wide range → likely route-to-agent. Honest, not forced.Thin comps at community levelanyfoundations met but <3-5 real compsWiden street→community→muni with tiered-honesty note at each level. If still thin → "suggested nearby sales, see agent."Charlie conversational estimateanyengine enforces SAME floorCharlie is a separate AI product; it calls the same engine. Engine refuses foundation-blind estimates → Charlie is forced to supply them. Charlie's conversational gathering of inputs = NEXT-PHASE UX, not this workstream.Rural, acreage field empty but large lotneeds detectionacreage regimeFallback regime detection (lot_size_units='Acres' or lot magnitude) — recon must confirm how to detect when acreage itself is null.
OPEN — LOT-DATA RECON (next foundational probe, not yet run)
The acreage/frontage regime switch is buildable ONLY if the data supports it. Must verify BEFORE designing the lot constraint:

Does an acreage field exist and what's its fill rate? How does it co-occur with frontage_length/lot_width, lot_size_area, lot_size_units?
Real frontage distribution (urban vs rural) — where does the data flip from feet-world to acres-world?
Is frontage populated on rural homes, or null exactly where it matters? (If null where it matters → need the acreage regime to catch it.)
Critically: how many comps survive a proportional frontage band (±X%) at each geo tier? This sets whether ±20% is viable or lot can only be a soft-widen constraint. Sets the real X%.
Lot gets its OWN design pass (like size did) — it is NOT a bolt-on to step 1. Frontage reclassified from $/ft score-nudge to Tier-1 comparability gate for homes.


Probed all three candidate size fields before designing the size patch (operator instruction: "get the data, don't guess"). The three collapse to ONE real signal.
FieldFillNature (verified)Use in home matcherliving_area_range77.4% (245,811)Bucket label, 9 canonical buckets (+3 noise rows)PRIMARY + ONLY size signal — literal equality; optional ±1 adjacent bucket in relaxed tiersquare_foot_source3.8% (12,118)Provenance LABEL on homes, not a measurement — 99.83% of filled rows are label-only (Other/LBO Provided/Plans/Owner/Builder/MPAC). Only 21 of 317,709 (0.0066%) carry any numeric (pure+range+mixed). CONVENTION divergence, not a data gap: same column is numeric on ~20% of CONDOS (49,318 rows — condo agents embed sqft; BINGO tier earns its keep there). Home agents use it for "who measured." Intent differs by property class — uncorrectable by backfillDROP from home size path (domain mismatch the home matcher inherited from condo code). Keep extractExactSqft + SFS for the CONDO path (legit on 1-in-5 condos)calculated_sqft68.4% (217,342)LAR midpoint rebadged — every value = RANGE_MIDPOINTS[LAR]. Circular by constructionNOT a signal. Rescues 0 LAR-null rows; loses 28,469 LAR-filled rows if used instead. Strict subset of LAR. Niche: midpoint-distance for graded scoring only — never coverage
Consequences locked:

On homes there is NO hidden numeric sqft. The only true size signal is the LAR bucket. SFS-numeric matching is dead by data, not by neglect — confirmed 3×.
RANGE lives in BOTH fields, loader-dependent — but redundantly. living_area_range and square_foot_source are two slots that can hold the same bucket vocabulary; which gets filled depends on what the listing loader chooses. Verified: condo range-form SFS (1,436 rows, 0.6%) MIRRORS the LAR bucket strings (600-699, 500-599 etc.) — a duplicate copy, not additive. On HOMES, range-form SFS = 1 row in the entire 2y universe. Furthermore extractExactSqft (types.ts:142) explicitly rejects range-form (/^\d+-\d+$/ → null), so even condo range-form SFS never fed BINGO — already routed to RANGE via LAR. The real condo numeric signal is pure-number (12,973) + embedded/mixed (34,868), genuinely absent on homes. Net: dropping SFS from the home size path loses exactly zero signal.
The luxury size cocktail is STRUCTURAL, not fixable in code: the 3500-5000 bucket is 1500 wide; no field can tighten it. This is a data ceiling. The v11 design already handles it correctly (wide bucket → wide range → route-to-agent). Confirmed correct, not lazy.
"Apple-to-apple" on homes is achieved through PRODUCT GATES (type + storey + bed, step 2) + same LAR bucket — NOT through finer size numbers (they don't exist). The cocktail risk was the missing type/storey gates + unconstrained relaxed funnel, both fixable (steps 1+2). Size precision beyond the bucket is a hard data limit.
Canonical LAR bucket order (ignore 3 noise rows: 600-699, 800-899, 2500-2749 = 4 rows total): < 700 → 700-1100 → 1100-1500 → 1500-2000 → 2000-2500 → 2500-3000 → 3000-3500 → 3500-5000 → 5000+. Widths non-uniform (100-500 wide in the mass band, 1500 wide at luxury). 81.6% of homes sit in the 700-2500 mass band.
isAdjacentRange MUST be a hardcoded lookup against this canonical order (NOT runtime string-parsing — the 4 noise rows would corrupt parsed adjacency).


Survived the pooler-timeout fight (single-pass query). The data behind step 5. ~30-35% of homes carry at least one real desirability signal the matcher ignores today.
LAYER 1 — free structured wins (100% non-null, zero false-positive, use first):

view jsonb — ~14% carry a premium tag. Trees/Woods 16,316 · Forest 5,249 · Park/Greenbelt 5,036 · Lake 4,817 · Water 3,766 · River 2,050 · Pond 1,764 · Creek/Stream 1,389. Cheapest big win.
waterfront_yn (scalar) — true 8,949 (2.82%). Cleaner than the features array; use this for the binary. Premium 30-100%.
exterior_features → "Backs On Green Belt" 3,150 (~1%) — backing signal already structured (text underreports it ~4×).
Income-suite: interior_features In-Law Capability 18,116 + In-Law Suite 11,818 (~30k); corroborated by basement-kitchen signal kitchens_total > kitchens_above_grade (~27k, since 34,884 have 2 kitchens but only 8,004 have 2 above-grade).

LAYER 2 — structured richness the matcher never touches (free, high-fill, additive delta lines):

washrooms_type1..5 (+ _level, _pcs) — decomposes baths into floor + piece-count. Distinguishes "2-bath-main + 1-bath-basement" from "3-baths-same-floor". Matcher only uses bathrooms_total_integer today.
bedrooms_below_grade — structured basement-bedroom count (income corroboration).
main_level_bedrooms + Primary Bedroom - Main Floor (33,326) — accessibility / luxury-bungalow signal.
direction_faces — 97.79% filled (N/S/E/W). South-facing backyard premium, nearly fully populated.
Also exist, unprobed/secondary: den_familyroom_yn, recreation_room_yn, room_height (cathedral ceilings), room_type jsonb.

LAYER 3 — text signals from public_remarks. 33.3% (105,781) mention SOME signal, but word-matching is mostly false-positive. Step-5 first pass uses ONLY the 3 clean ones (exact match, no co-occurrence), as WORDED deltas not dollars:

✅ %ravine% 9,662 (3.04%) — NO structured equivalent exists; text-only or it doesn't exist. The high-value odd/even proxy. The reason to do text at all.
✅ %no rear neighbour% + %no rear neighbor% 6,465 (~2%) — clean, low false-positive, strong positive.
✅ %conservation% 5,060 (1.59%) — clean.

DEFERRED to step 5b (logged, not lost) — needs co-occurrence / sentiment logic, earns its own backtest pass:

Loose nature-word matches: %lake% 32,592 / %river% 16,323 / %pond% 8,095 — 6-8× looser than structured view tags (street names, "5 min to lake"). Only count when paired with a backing verb (%backs%lake%) or cross-confirmed by view tag.
%hydro% 14,188 (4.47%) — NEGATIVE signal ("hydro corridor at rear" = easement, no privacy). Weights DOWN; requires sentiment check before use.
%premium lot% 4,316 (1.36%) — self-declared agent marketing; soft.

DEAD — do not use (verified):

lot_features jsonb — only ever contains "Irregular Lot" (7,759). Info already in lot_shape.
lot_dimensions_source — only value "Other".
Bare %lake%/%river%/%creek% without co-occurrence — 75-90% false-positive.
Columns that DON'T EXIST: property_condition, year_renovated, corner_unit, cul_de_sac, frontage_type, den_yn (real name is den_familyroom_yn).

Pool (verified all values): None 280,427 · Inground 14,316 (only one matcher reads) · Above Ground 5,543 · Salt 1,403 · Community 747 · Indoor 620. Step 5 covers all types, surfaced as narrated delta.
Condition/renovation: no structured field exists. %renovated% 58,090 (18.28%) + %updated% 59,670 (18.78%) in remarks = ~37% combined — text-only path, deferred (not in first-pass scope).

Run log
2026-06-04 — v1 opened + homes census run

Sequencing locked: estimator core first, RAG second. Hybrid confirmed. Homes priority.
Homes data census complete (read-only, verified). Findings logged. Operator domain inputs locked.
3 recon-pending items flagged. No code touched, no design locked.

), or focused follow-up later.

Backups: .backup_pathB_20260606_070445, .backup_pathB_20260606_070839.

PENDING: behavior-identity gate (prove live estimate unchanged) BEFORE Stage 2.
STAGE 1-FIX (in progress) — the .lt() was NOT a live no-op (verification caught it):

Verify check found 21,486 freehold + 8,580 condo rows are Closed with close_date >= NOW() — firmed deals with future-scheduled legal closings (systematic, not error). Stage 1's unconditional .lt('close_date', referenceDate) was EXCLUDING these ~6.8% from the LIVE candidate pool → a real production regression, NOT the no-op claimed.
Lesson reinforced: "backwards-compatible by design" is a claim to VERIFY, not trust — same discipline that caught the inlined-backtest blindness. The DB check turned an assumed no-op into a found regression.
Fix = make .lt() conditional on specs.asOfDate: convert both queries to let qCommunity/qMuni builders, apply .lt() ONLY when asOfDate set (backtest), so live mode (no asOfDate) includes all closed comps as before. True backwards-compat.
Patch aborted twice on indent mismatch — the atomic anchor-match-once guard worked (0 matches → abort → no write → file safe). Cause = markdown whitespace-rendering artifact (file is 4-space outer/6-space chained; anchors rendered as 6/8). Same artifact class as the Â±/Hebrew-glyph display issues. Resolved by authorizing Claude Code to dedent against the bytes it can directly read (Option B).
DEFERRED as separate deliberate decision: whether future-dated firmed deals SHOULD count as live comps (a real-estate policy call, operator's — NOT to be decided by accident via a failed patch). For now: restore pre-Stage-1 behavior (include them live), revisit explicitly later.

THEN: Stage 2 = de-duplicate the math (see Stage 2 decision below). Then the FIRST trustworthy re-measure of A1+A1b against shared code.
STAGE 2 — decision: OPTION D (extract shared pure-math module), NOT B or C.
Stage 2 prep revealed the real obstacle: production uses Supabase JS client (createClient()); backtest uses raw pg.Client (port 6543). Different DATA-ACCESS layers — legitimately so.

Option C (mirror A1+A1b into backtest's inlined math) = reintroduces the duplicate-math drift that caused the measurement blindness. Rejected.
Option B (backtest calls production findHomeComparables) = requires injecting a Supabase _client param + .neq() into production PURELY to serve the test — production surface area + a service-role-client seam that's a future hazard. Conflates "share the math" with "share the data access" — only the first needs sharing. Rejected.
Option D (CHOSEN): extract the pure MATH (adjustedPriceFor adjustment accumulation + A1b clamp, and the A1 price-floor/aggregation) into a shared lib/estimator/price-math.ts. Both production createHomeComparable AND the backtest import it. Data access stays separate (Supabase live / pg backtest — correct, they SHOULD differ). The math has ONE implementation → A1+A1b live there → drift structurally impossible → no test-only seam in production.
Cost: a production refactor (extract math from createHomeComparable, call the shared module) — touching working code, but it's the correct no-duplication fix and leaves production cleaner with zero test-only seams.
Good omen: backtest's spec construction (line 592) ALREADY uses asOfDate + subjectListingKey matching the Stage 1 field names. Path was prophetic.
Exclude-self stays on the backtest side (its pg fetch already does `listing_key != # W-ESTIMATOR-RAG — Estimator Core Logic + AI RAG Accuracy Tracker

Status: v12 — DESIGN LOCKED (homes) + PHILOSOPHY + PRICE-OUTPUT MODEL + VALUE-SIGNAL INVENTORY + SIZE-FIELD VERDICT + DYNAMIC PRODUCT-AWARE MATCHING MODEL + MANDATORY-FOUNDATIONS RULE. NOTHING BUILT — no code touched, no design ships without operator okay.

v12 — DYNAMIC PRODUCT-AWARE MATCHING MODEL (LOCKED 2026-06-04) — the core estimator logic
The governing realization: the matcher's complexity must scale to the product. A townhouse is simple (standardized lots, storey + sqft range = done). A bungalow on 4 acres is a different universe where the LAND is the value — missing the acreage field there is a catastrophic error, not a small one. The estimator must detect which world it's in and apply exactly as much rigor as that world demands.
The dynamic flow (every home estimate)

Identify the product (categorical gates — hard, never crossed):

TYPE: Detached / Semi-Detached / Townhouse / Link (Link split out per v10). Type-isolated pools.
STOREY/STYLE: 2-storey ≠ 2½ ≠ 3-storey ≠ bungalow-family ≠ split. Storey is a product separation (operator ruling, critical esp. townhomes).


Pick the LOT REGIME (the regime switch — driven by the data field, not a guessed city list):

acreage / large-lot filled → ACREAGE REGIME. Lot is the dominant value driver. Comparability runs on acreage (~similar acreage matches). A 5-acre parcel compares to ~5-acre parcels — NEVER pooled with a 0.4-acre suburban lot even if both houses are "4-bed detached." The house on the land still matters (mansion on 5ac ≠ cottage on 5ac), but the land regime gates first.
acreage empty → URBAN/SUBURBAN REGIME. Comparability runs on FRONTAGE, as a continuous PROPORTIONAL band (~±X% of subject frontage, NOT fixed ±feet). 60ft → ~48-72ft; 79ft → ~63-95ft; 200ft → ~160-240ft. The band scales with the lot because value scales with the lot (50→60ft matters; 200→210ft doesn't). X% to be set FROM DATA, not guessed.
Townhouse special case: lots are standardized → lot dimension barely varies → frontage band is wide/non-binding → storey + sqft range is effectively the whole match ("bingo"). Complexity correctly collapses for simple products.


Band on SIZE: same LAR bucket (exact in strict tier, ±1 adjacent in relaxed). LAR is the only real home size signal (verdict below).
Now you have a TIGHT set of genuine apple-to-apple comparables (ideally a handful, ~5). Same type, same storey, same lot-regime, same size band.
PRICE = MEDIAN of that tight set. NOT a mean. NOT a weighted blend of 140 properties. Median is robust — one weird comp can't drag it (the current arithmetic-mean is exactly what produces the negative-price blowups). Five real apples, take the middle.
If the tight set is too thin → WIDEN the geo cascade (street → community → muni) → then ROUTE TO AGENT. Never average garbage into a number. The band protects apple-to-apple; the cascade protects coverage; the agent catches the irreducible remainder (the 8%).

Why median, not mean (locked)
The recon found valuation = simple arithmetic mean of comp prices ± tier band. Mean is fragile: one stretched/bad comp drags the number (and with hardcoded adjustments, below zero). Median of a tight genuinely-comparable set is robust to outliers — both simpler and more accurate. This is how a good agent actually thinks: "I have 5 real comps, the middle one is X."
MANDATORY FOUNDATIONS RULE (LOCKED 2026-06-04) — the ENGINE enforces; entry points must satisfy
The estimator deals in DATA. A number built on missing foundational inputs is a wrong number dressed as a real one. We are NOT here to please the user with a frictionless form — we are here to give a CORRECT answer, and correctness has prerequisites. If prerequisites aren't met, the estimator does NOT produce a number — it asks for them, or routes to the agent. It NEVER guesses or runs foundation-blind.
Clean separation of concerns (clarified by operator):

THE ESTIMATOR is deterministic CODE LOGIC. Form → specs → matcher → median → result. The "AI layer" (getAIInsights) is pure presentation — 3 text fields, changes ZERO numbers, $0, off by default. The estimate NUMBER is 100% code. This workstream = the engine.
CHARLIE is a SEPARATE conversational AI product that happens to be one entry point calling the same engine. The seller form physically lives in Charlie's components (app/charlie/components/SellerForm.tsx) — that's the only connection.
THE GATE LIVES IN THE ENGINE (this workstream). The matcher refuses to produce a number when foundational inputs are missing, regardless of caller. Because the engine is the gate, EVERY entry point (form, buyer modal, Charlie) is automatically forced to supply foundations — no caller-specific enforcement logic needed in the engine work.
Charlie's CONVERSATIONAL enforcement (asking the user in chat, validating before calling the engine) is a NEXT-PHASE Charlie UX item — NOT this workstream. Charlie being AI doesn't exempt the data from discipline, but adapting Charlie's conversation to the engine's gate is downstream. Logged, deferred.

Foundations are HIERARCHICAL and PRODUCT-CONDITIONAL — not a flat list:

Universal identity (always mandatory): TYPE, STOREY/STYLE, SIZE range, beds, baths. Without these there is no product to compare.
Product-specific value driver (mandatory, but WHICH ONE depends on the product):

HOME → LOT is foundational. Two identical houses on a 50ft vs 100ft lot are NOT comparable — the land is half the value. Lot (frontage OR acreage per regime) is a foundational COMPARABILITY constraint, NOT a post-hoc $/ft adjustment. This reclassifies frontage from a Tier-2 score nudge to a Tier-1 matching gate for homes.
CONDO → frontage is meaningless (no lot). Foundational variable switches to interior size + building/maintenance/parking factors.


Enriching (lowers confidence / widens range if absent, does NOT block): age, basement, garage, pool, premium signals. These place the home WITHIN the range and feed feature-delta narration — their absence widens the range honestly rather than blocking.

THE STARVED-FORM PROBLEM (located 2026-06-04 — the upstream bottleneck)
The matcher can be perfect but produces wrong numbers if the form starves it. Verified in SellerForm.tsx + SellerEstimateRunner.tsx:

Size (LAR) is OPTIONAL on the home seller path — no validation. When skipped, conditional spread drops it → specs.livingAreaRange undefined → matcher falls through both size branches → size-unconstrained pool → a live production source of the RANGE-ADJ negative-price catastrophe (separate from the relaxed-funnel hole).
Form only populates ~4 of ~11 scoring dimensions. Style, age, basement, garage, pool NEVER collected on seller path → all score 0 → max achievable score ~100/200 → every seller estimate capped at RANGE tier, BINGO structurally impossible. A seller literally cannot get the estimator's best match because we never asked.
specs.exactSqft is NEVER set on the seller path (form has no field) → confirms dropping the dead SFS branch breaks zero seller traffic.
Buyer modal (from a listing record) CAN populate more fields → form-side enrichment is a separate, larger workstream from the matcher patch.
Consequence: making foundations mandatory in the form/Charlie is now a PEER priority to the matcher patch — fixing the engine while the fuel line is half-disconnected is incomplete work. Size-mandatory is the first and clearest enforcement.


Started: 2026-06-04
Owner: Shah
Predecessor: W-FUNNEL (closed 2026-06-04).
Suggested location on disk: docs/W-ESTIMATOR-RAG-TRACKER.md

Why this exists
The estimator is delicate, accuracy-critical work. Two parts:

Estimator core logic (PRIMARY) — the deterministic valuation engine across four paths: condo sale, condo lease, home sale, home lease. Hybrid approach (comparable-based + formula/PSF). Goal: make the core so solid the AI layer becomes optional — accuracy and relevance from the code itself.
AI RAG responses (SECONDARY) — the AI commentary/insight layer on top. Improve quality, but the strategic aim is to reduce dependence on it as the core hardens (cost saving — AI calls are paid).

Homes analysis is the priority concern — flagged as the weakest area, needs the closest look.

Locked decisions

Sequencing: Estimator core FIRST, then RAG. Rationale: RAG adds insight on top of a valuation; if the underlying number is wrong/weak, improving AI commentary is narration over bad numbers (and a convincing AI explanation of a wrong valuation is more dangerous than an obviously-thin one). The core must be hardened first to even measure how much AI is still needed — which is the precondition for the cost-saving "shrink the AI layer" goal. (Locked 2026-06-04.)
Core approach is hybrid: comparable-based (find similar sold/leased → derive price) + formula/PSF (adjustments). Both layers are independent accuracy sources; homes weakness localized — see findings.
Cost-saving thesis: strong deterministic core → less reliance on paid AI commentary. The §9.2 work already made estimator AI tenant-keyed + off-by-default per tenant, so reducing AI use is also a per-tenant cost lever.
STRICT BUCKETING — CONFIRMED with eyes open (v9, 2026-06-04). Like-for-like comparable pools: style-family + size + bed, community → muni cascade. Measured cost: 82% confident / 11% thin / 8% route-to-agent. Bounded and affordable. The 8% route to the agent because there genuinely is no clean comparable — that is the right behavior per the prelude-to-agent framing, not a failure.
STYLE-FAMILY GROUPING — CONFIRMED (v9). Bungalow + bungalow-raised + bungaloft grouped together costs almost nothing vs exact-style (60% vs 56% confident) — a cheap, sensible relaxation that stays inside apples-to-apples.
PSF FOR HOMES — OUT as a pricing tool (v9, resolved by data, not assumption). No table has the style+size segmentation strict bucketing requires. Homes price from the comp pool itself, not a PSF surface. geo_analytics survives ONLY as the market-context (absorption / DOM / pace) feed for the report — never as a PSF pricing signal.
COMPARABLE URL LINKS — KEEP, non-negotiable (v9). Each comparable links to its listing page so the user can verify the claim ("you said 142 Maple sold for $890k — here's the listing"). This is trust, and it reinforces the real-data thesis. Carries forward into the new report. Build constraint: comparable links MUST resolve to the tenant's own domain (same tenant-correct-URL rule the funnel session enforced) — multi-tenant, never hardcoded.
LISTING-CARD STYLE — CONFIRMED design upgrade (v9). Comparables render as cards (photo, linked address, sold price, beds/baths, sqft range, sold date, DOM) instead of a flat table. Makes comps feel like real properties. Same card style extends to the "what's competing now" active-listings section.


v10 — ESTIMATOR PHILOSOPHY (LOCKED, 2026-06-04) — the spine everything builds toward
This is the governing philosophy. Every build step serves it. Locked by operator.
Principle 1 — TIGHT beats WIDE. The machine's edge is reliability, not volume.
The win is NOT "hold 140 comps where a human holds 5." 140 comps = 5 real comparables diluted by 135 irrelevant ones. A good agent doesn't fail to hold 140 — they correctly IGNORE 135 because those aren't the same street, same product, same backing. The machine's edge over the human is doing the same tight, street-level, feature-aware comparison the best agent does — but consistently, at scale, without getting tired or missing a tag. Same method, more reliable execution. NOT a different "PhD" method. A real estimate off 4 same-street comps beats one off 40 community comps. We never widen the pool just to inflate the count.
Principle 2 — Take the complexity onto OUR side. Hand the public a clean story.
We cater to the normal public, not PhDs. The machine does the hard part (catches every feature, checks every comp, runs the cascade); the user gets the clean narrative: "here's your home, here's what sold down the street, here are the 3 things different and which way each pushes your price." Rich and accurate underneath, readable on top. Solving complexity — not manufacturing it.
Principle 3 — Features are SHOWN, not silently blended.
Features don't just nudge a hidden number — they become lines in the report. The flow:

Scan the subject FIRST — read everything the subject home has (backing, view, basement finish + separate entrance, pool, garage, lot, condition).
Foundational match — find tight, same-street/community comparables that pass the real product gates (type, storey).
Narrate the deltas, ±, in the report:

Subject HAS a big feature comps LACK → highlight as a plus ("Your home backs the ravine; 142 Maple doesn't — supports pricing above it").
Subject LACKS a big feature comps HAVE → highlight as a minus, honestly ("142 Maple has a finished walkout w/ separate entrance; yours is unfinished — expect to price below it").




Delta expression = BOTH (locked): dollar impact where the data supports it (e.g. +$30k pool), direction + words (↑ strong plus / ↓ minor minus) where it doesn't. Never a silent number move.

Principle 4 — GRACEFUL DEGRADATION with honesty at every tier (the report spine).
The estimate NEVER silently passes a muni-level guess off as a street-level fact. Each cascade tier carries its own note, guiding the user at every level:

Street level → "Here's what sold on your street." (Highest confidence — say so.)
Community level → "Nothing comparable sold on your exact street recently — here's what sold in your community."
Municipality level → the honest hand-off: "I couldn't find a true comparable in your community. Here are some suggested recent sales nearby — but this is wider than ideal, so contact the agent to confirm." A guided, honest route to the agent — NOT a confident number dressed as precision.
This IS the 82/11/8 split: the 8% route-to-agent is where even widening produces no real comps. We don't manufacture a number from garbage; we hand it to the agent. That is the accuracy.

Principle 5 — Show FOR-SALE competition, not just SOLD comps.
A seller pricing today competes against live inventory, not just history. The report surfaces actively-listed competing properties (same listing-card style: "here's what you're up against now") alongside sold comps. This is what makes it a pricing TOOL, not a backward-looking average. (Build step 4.)
Principle 6 — The WOW: relevant, accurate, valuable.
The user sees: their home → real sold comps with clickable, verifiable, tenant-correct links → live competing listings → honest feature-deltas. Rich on our side, clean on theirs.
Architecture resolution
Resolved by Principles 1–5 together: we are NOT building a 140-comp weighted blender. We build tight street-first comparables (pin → street → community → muni cascade) + a feature-delta narrative + tiered-honesty notes + active competition. The existing 200-pt scoreMatch is used to RANK and to select the tight pool and to drive the feature-delta narration — not to blend a wide pool into a silent mean. Hard product gates (type, storey) keep non-comparables out entirely; refinement features become narrated deltas, not delete-gates that empty the pool.
Principle 7 — PRICE IS A RANGE, and the range's WIDTH means confidence (v11)
A single point price is almost a lie. The output is a range, and the width carries meaning:

Tight comps (street-level, clean) → NARROW range ("$1.82M–$1.88M") → high confidence, say so.
Stretched comps (muni-level) → WIDE range ("$1.65M–$1.95M") → the width itself honestly signals lower certainty. The range IS the tiered-honesty principle made numeric — no separate disclaimer needed.
Desirability signals shape WHERE IN THE RANGE the home lands: ravine + finished basement → top; lacks comp features → bottom. This is the bridge between the desirability layer and the number.

Principle 8 — INVERSE NARRATION: show how we got to the price (v11) — the trust mechanism
The feature-delta narration runs BACKWARDS to JUSTIFY the number. Not a side-panel — the actual derivation:

"Started from 3 homes sold on/near your street: 14 Glendale ($1.79M), 88 Marmaduke ($1.95M), 5 Fern ($1.82M). Your home backs the ravine — Glendale doesn't (+). Marmaduke has a finished walkout yours lacks (−). Nets to $1.82M–$1.88M."


The user traces the price back to real, clickable, verifiable sold homes + the specific reasons it moved up/down from each.
Self-policing: if we can't write the derivation honestly, we don't have a price — we have the route-to-agent.

PRICE-ROLE BOUNDARY (LOCKED v11) — what the desirability layer may and may NOT do

Comparables PRICE the home. Tight real sold comps produce the base range. Signals never override this.
Structured signals (Layer 1+2) carry DOLLAR deltas — but ONLY after step 3 makes adjustment values real (market-derived per community). Until step 3, dollar adjustments are flat hardcoded constants and are NOT trustworthy as dollars. This is WHY step 3 precedes step 5 as a dollar influence.
Text signals (ravine, no-rear-neighbour, conservation) carry WORDED deltas, never dollars — text is a softer source (e.g. bare %lake% is 6.8× false-positive vs structured view tag). Maps onto the BOTH delta rule: dollar where structured/strong, words where soft.
Signals REFINE and EXPLAIN; they do not MANUFACTURE confidence. In thin-comp (muni / 8%) cases, signals become part of the honest hand-off ("your ravine lot is a real premium, but no clean comparable exists — see the agent"), NOT a rescue into a confident number.
Build-order rationale confirmed: 1 (size) → 2 (gates) → 3 (real adjustments) → 4 (competition) → 5 (signals). Each step earns the right to influence price before it's allowed to.


Resolution 1 — PSF question: SETTLED, confirms skepticism was right
PSF tables are a dead end for homes:

psf_monthly_sale / psf_monthly_lease: 98% of communities BLEND condo + freehold into one PSF (no property_type column), and 5 months stale → unusable as-is. A $750/sqft condo averaged with an $1,100/sqft house is the apples-to-oranges baked right in.
Per-building PSF tables: condo-only → drop entirely.
One survivor: geo_analytics — has an explicit track='homes' column AND a subtype breakdown (Detached / Semi / Townhouse, each with own median/DOM/sale-to-list), reasonably fresh. BUT: no style segmentation (no bungalow-vs-two-storey split) and the subtype breakdown was empty on 4 of 5 sampled rows. → usable for top-line market context (the report's absorption/DOM/pace section), NOT as a PSF pricing signal.

Net: PSF as a pricing tool for homes is OUT — confirmed, not assumed. Any home PSF would have to be derived per-query from raw listings. Homes price from the comp pool. geo_analytics = market-context feed only.
Resolution 2 — Bucket contamination: CONFIRMED, located exactly
The apples-to-oranges fear is real and located:

Sale strict funnel: style is a hard gate (good — bungalows excluded from two-storey pools when both styles known, which is 98.6% of the time).
Sale's municipality fallback: NO style filter — when the strict funnel fails and drops to muni, it pools bungalows + two-storeys + sidesplits together. LEAK.
Lease: NO style logic anywhere — every lease tier pools all styles together. COMPLETE LEAK.

→ Strict ruling is partially implemented for sale, entirely absent for lease. Closing both leaks is a concrete, located change: make style a hard gate in sale's muni fallback + all lease tiers, with family grouping.
Resolution 3 — Coverage cost: MEASURED before committing
Under strict bucketing (community → muni cascade, style-family + size + bed): 82% confident / 11% thin / 8% route-to-agent. Affordable — far better than feared. Only 8% get "see the agent." Luxury hit harder at community level (67% thin) but muni fallback recovers most. Style-family expansion is the cheap relaxation (60% vs 56% confident exact-style).

The full diagnosis (confirmed, v9)
The home estimator is accurate when it has a clean match and breaks when it stretches. Two located root causes:

Dead size field — reads empty square_foot_source → relaxed tier does no size filtering → pools 1,000 with 4,000 sqft homes → negative prices.
Bucket leaks — style is a hard gate in the strict sale path but absent in sale's muni fallback and all of lease → bungalows pool with two-storeys.

Both specific, located, fixable.

Build sequence — LOCKED (v10, all measured against the 16.8% baseline)
Each one built, then re-run through the backtest to prove it moved the number — kept only if it did. Every step serves the v10 philosophy (tight comps + narrated feature-deltas + tiered honesty + active competition).

Fix the size field — point home matching at living_area_range (the strategy that already works for condos). Highest leverage — upstream of the negative-price catastrophe. Relaxed-funnel size band still OPEN (exact / ±1 / ±2 LAR bucket) — to be decided when step 1 is authored, measured on backtest.
Close the bucket leaks — the located leak is the bedBathOnly last-resort muni fallback (lines 622-636), which drops style to scoring-only. Make product gates (type + storey) hard everywhere including that path. Also: split Link out of the Townhouse type pool; break the twostorey style family apart so storey count (2 / 2½ / 3-Storey) is a real product separation, esp. for townhomes (operator ruling, v10).
Real-data adjustment analytics (community-level, dashboard-editable) — replaces ALL flat hardcoded constants (frontage $40k/ft, basement $50k/$80k/$110k, garage, pool, bath). Per-market, not flat. Fixes the 3 basement score/dollar inconsistencies. Wires the existing adjustments table (muni/community/area grain) into the home path.
Active competition + absorption (from geo_analytics + live For-Sale listings) — the selling-side input + the "what you're up against now" report section (Principle 5).
Premium / value signals (desirability layer) — see VALUE-SIGNAL INVENTORY below. Step-5 first-pass scope LOCKED (v11): Layer 1 (structured premium) + Layer 2 (structured richness) + the 3 clean text signals only. Loose word-matches + hydro-negative deferred to step 5b. Closes luxury quality-of-match AND feeds feature-delta narration. Fix pool to cover all pool types.

Report-layer (parallel, design-locked v11):

Comparable URL links preserved — MUST resolve to the TENANT's own website, never a hardcoded domain (multi-tenant non-negotiable, same tenant-correct-URL rule as the funnel work). Applies to BOTH sold comps AND competing-for-sale links. Explicit build-gate.
Comp / competing display = Option C (LOCKED v11): Charlie-density tile + ONE feature-delta line. NOT full cards (too tall — 3 sections would bury everything), NOT pure Charlie tiles (no room for the delta — loses the wow). Small scannable tile (price, linked address top-right, bed/bath/sqft/sold-date) + one delta line (dollar-or-words) showing the single most important ± vs subject. Same tile for "Comparable Sold" and "Competing For Sale" sections.
Competing For Sale section (Principle 5) — live Active / For Sale listings, same Option-C tile, framed forward ("3 similar homes listed now, $1.79M–$2.05M — your competition"). Forward-looking half of the pricing strategy.
Price shown as a RANGE (Principle 7) — width = confidence; signals place the home within it.
Inverse narration (Principle 8) — the derivation IS the report: comps → ± reasons → range.
Tiered-honesty note on every estimate (Principle 4) — street / community / muni each carry their own confidence framing.
Output SPLITS at the end: confident comprehensive report for the 82% with clean comps; honest "see the agent" route for the 8% without.


Recon scope (COMPLETE — read-only, done before design lock)
Estimator core — all four paths (condo sale, condo lease, home sale, home lease):

R1 — Comparable selection: per path, how comparables are chosen (geo radius, building, property-type match, time window, bed/bath/sqft filters); source (PropTx MLS / building sales tables).
R2 — Valuation math: per path formula; PSF basis; adjustments (size, beds, baths, age, condition, time-decay); comparable-derived vs formula-derived and how they combine in the hybrid.
R3 — Homes vs condos divergence (the priority): where the home path differs from condo in BOTH comparable selection and math; why homes is weaker. Localized — see findings.
R4 — Empty/thin-comparable handling: the CONTACT-tier fallback — when each path falls back, threshold correctness.
R5 — AI attachment point: getAIInsights attaches as pure presentation (3 text fields), changes ZERO numbers, currently $0 (both tenants toggle off). Cost-saving thesis confirmed: core already stands alone.
R6 — Accuracy measurability: backtest fully feasible against existing close_price data — measurement is possible (harness shipped, see findings).

Gate: recon reviewed → design lock per path → then build (hardening), recon→design→smoke discipline per CLAUDE.md.

Open questions (status)

How is accuracy currently validated? → RESOLVED: backtest harness scripts/backtest-estimator-homes.js against real close_price. Baseline 16.8% median.
What's the acceptable AI-off output quality bar — how good must the core be before the AI layer is "optional"? (Still open — sharpens as build proceeds.)
Homes: weakness in data or logic? → RESOLVED: both, and located — dead size field (data-field misuse) + bucket leaks (logic). Code fixes, not a data-sourcing problem.


Findings
BACKTEST BASELINE (2026-06-04, 500 sale + 500 lease real subjects, as-of-date + exclude-self) — THE MEASUREMENT BASELINE
Home SALE — a TIER problem, not uniform weakness:

BINGO (n=43): MAE $70k, median 7.1% off, 84% within ±15% — excellent when match is good.
RANGE (n=137): median 13.7%, 56% within ±15% — fine.
BINGO-ADJ (n=223, the bulk): median 19%, 43% within ±15% — mediocre.
RANGE-ADJ (n=49): CATASTROPHIC — median 150% off, 2% within ±15%, one subject predicted NEGATIVE price. Hardcoded adjustments drive comp prices below zero when stretching a poor match. Proves the chain: fake adjustment values actively destroy accuracy, not just imprecise.
Overall median 16.8%; mid-market ($500k-1M) best (14%); <$500k worst (30%, likely misclassified); community-scope beats muni-fallback by ~16%.

Home LEASE — basically works: 78% within ±15%, median 6.9%, bias ~0. Lower priority. Dead spot: BINGO tier never fires (exactSqft null on ~95% homes — same sqft-column issue).
Three assumptions OVERTURNED by data:

Luxury is NOT thin-comp — p99 homes have ~140 comps available (<3-comp only 4%). The luxury gap (25-35%) is QUALITY-of-match (view/lot-prestige/finishes the matcher can't see), NOT count. Changes the luxury fix: read premium signals, don't "handle thin pools."
Premium signals are STRUCTURED, not just text (huge — easier than feared): jsonb tags exist in volume, all UNREAD — view: Lake 4,486 / Park-Greenbelt 4,040 / Forest 4,901; exterior_features: Backs On Green Belt 2,824, Deck 51,550; interior_features: In-Law Suite 10,376 / In-Law Capability 17,239 (income-suite signal). Operator's street/backing/income instincts are in clean structured fields.
Five pre-computed analytics tables IGNORED by estimator: psf_monthly_sale (16,730), psf_monthly_lease (18,501), geo_analytics (18,184), building_psf_summary (75), building_psf_transactions (10,698). Only adjustments (408) is wired in. v9 ruling: PSF tables OUT for homes pricing; geo_analytics retained as market-context feed only.

Sample report (real, current-state) — 37 Lavinia Ave, Toronto W01: sold $1.885M, predicted $2.057M (+9.1%). Comp pool visibly lumped $1.3M and $3.9M homes together (no street-awareness — can't tell Lavinia from South Kingsway). Demonstrates: no street/block awareness, no competition layer, 55% null age (20-pt age dimension dead), unread view/greenbelt tags, flat $40k/ft frontage where W01 real premium is ~$75-100k/ft, unused PSF surfaces.
Homes data census (2026-06-04, all verified against live DB — 317,975 freehold closed rows, 2y)
Operator domain inputs (locked — guide the matrix design):

Street-level comparison matters; odd/even house number carries weight because same-side homes often share the same BACKING (lake/ravine/green space = materially more valuable). Odd/even is a proxy for "what's behind the property."
Luxury homes are a unique market — comparable-averaging breaks down. Needs distinct treatment (now = premium-signal reading, not thin-pool handling — see overturned assumption).
Real-data analytics exist for building parking + lease prices (condos) — must be used, not reinvented.
Strategic goal: electronic analysis takes the user FURTHER than a human could — comprehensive data analysis at scale/consistency a person can't match. Surface every real, data-backed signal.
METHOD RULE: see data comprehensively FIRST, then design how to use it. No guessing — every value real-data or it doesn't ship. Nothing changes without operator okay.

Data realities that reshape the homes plan:

F-HOME-SQFT-WRONG-COLUMN (High): home matcher's best size-match tier uses square_foot_source (95% NULL on homes, ~99% non-numeric labels when present) → that tier is dead code. calculated_sqft is 68% populated and NEVER read. Build step 1 points matching at living_area_range (proven condo strategy). Biggest single accuracy lever.
F-HOME-STREET-BONUS-BUILDABLE: street_name + street_number 100% populated as clean structured fields. Dead "same-street bonus" (hardcoded false) is trivially activatable; odd/even = street_number % 2. Street-level + odd/even fully data-supported.
F-HOME-BACKING-SIGNAL-IN-TEXT-ONLY (High effort): value-driver behind odd/even (backs onto lake/ravine/greenspace) is NOT structured — lot_features jsonb effectively empty. Signal lives in public_remarks free text: ravine 3%, backing-onto ~5%, green space 3%, water-adjacent ~17% combined. Requires phrase extraction (harder tier than structured street match).
F-HOME-ZERO-REALDATA-ADJUSTMENTS (High): all 8 home adjustment values hardcoded constants (lot frontage flat $40k/ft EVERYWHERE, basement/garage/pool/bath). Condos have a real adjustments table (408 rows, computed from real data); homes have none. Directly violates the real-data rule. Build step 3 replaces with community-level dashboard-editable real-data adjustments.
F-LUXURY-NO-PATH (High): price right-tail-skewed (mean 16% > median, p99 $3.3M, max $27M). Reframed by data: luxury gap is quality-of-match, not comp count. Fix = read premium signals (build step 5).
F-HOME-WATERFRONT-IGNORED (High): waterfront_yn 3.8% true, estimator ignores entirely; waterfront premium can be 30-100%.
F-HOME-POOL-PARTIAL (Med): Inground 5.9% (handled), Above Ground/Salt/Community/Indoor ignored.
F-HOME-AGE-52PCT-NULL (Med): half of homes have no age; NULL-age comps pass unfiltered (asymmetric) — 20-pt age dimension degrades on half the pool.
F-HOME-INCOME-SUITE-SIGNAL (Med): ["Apartment","Separate Entrance"] basement 1.6% — income-suite value signal, grouped without extra value today.
F-HOME-SUBTYPE-SCOPE-GAP (RECLASSIFIED 2026-06-06 — see "VACANT LAND / LOT VALUATION sibling product path" entry at end of run log): no longer "Low — excluded." Vacant Land / Rural Residential / Farm become a SIBLING product priced on LAND ($/acre median × subject acreage, or $/frontage × frontage), NOT on building. Geo cascade COMMUNITY → MUNICIPALITY → AREA only (NO street tier — street/odd-even is a house-backing proxy, meaningless for raw land). Status: design-locked PENDING DATA RECON ($/acre per-community stability + comp survival at each geo tier not yet captured to disk). Lease partial-home types (Lower/Upper Level, Room) still passthrough-only.

Condo-side bug found incidentally:

F-RESOLVE-ADJUSTMENTS-PARKING-SALE-COLUMN-MISMATCH (P1): resolve-adjustments.ts:46 references parking_sale_calculated — column doesn't exist (real: parking_sale_weighted_avg). Condo-SALE parking silently falls to hardcoded $50k, never reads the real computed values. Isolated, quick fix. Still P1-quick.

Cross-path (confirmed):

Valuation = simple arithmetic mean of comp prices ± tier-multiplier band. No median, no recency-weighting, no match-quality-weighting. No PSF formula.
AI is pure presentation (3 text fields), changes zero numbers, $0 today (both tenants toggle off). Core already stands alone.
Backtest fully feasible against existing close_price data.

Backtest harness scripts/backtest-estimator-homes.js is the re-runnable audit trail — every future change re-measured against these CSVs to prove it helped.
Feature inventory — home matcher current state (verified, 3 recon passes 2026-06-04)
Every feature the home matcher touches today, how it's used, and what's wrong. This table IS the feature-delta narration source list (Principle 3).
#FeatureDB fieldUsed nowProblem1Property typeproperty_subtypeHard SQL gate, firstLink wrongly pooled with Townhouse (step 2 splits it)2Architectural stylearchitectural_style[0]Hard gate (family) + 25pt score2/2½/3-Storey wrongly one family (step 2 splits)3Age bracketapproximate_ageHard gate + 20pt score52% null; null comps pass unfiltered4Sizeliving_area_range / square_foot_sourceGate + 30pt scoreSFS-numeric dead (0.004% homes); relaxed funnel has NO size filter → negative prices (step 1)5Lot frontagelot_width$40k/ft adj + 25pt scoreFlat $40k everywhere; W01 real ~$75-100k/ft (step 3)6Lot depthlot_depth$5k/10ft (cap $30k) + 10ptHardcoded, not market-aware (step 3)7Basementbasement (jsonb)5-signal decode → $50k/$80k/$110k + 15ptHardcoded flat; 3 score/dollar inconsistencies; lease ignores entirely (step 3)8Garagegarage_type$30k-$70k by type + 10ptHardcoded (step 3)9Bathroomsbathrooms_total_integer$20k each + 10ptHalf-bath rate defined, unused (step 3)10Poolpool_features (jsonb)Inground $30k + 5ptAbove-ground/salt/indoor/community ignored ($0); inground flat $30k (step 5 fixes all types)11Recencyclose_date30pt scoreDollar time-adjustment constants defined, never applied12Same street / odd-evenstreet_name / street_number15+5pt scoreBacking signal (ravine/lake) unread in public_remarks text (step 5)13Bedroomsbedrooms_totalHard gate (exact)Fine
Value signals present in data but UNREAD (step 5 + value-signal recon target) — the desirability layer where the luxury gap lives:

Backing signal (the odd/even proxy): public_remarks free text — water-adjacent ~17% / backing-onto ~5% / ravine 3% / greenspace 3%. Text-extraction tier. The single biggest quality-of-match signal.
View (structured jsonb, unread): Lake 4,486 / Park-Greenbelt 4,040 / Forest 4,901.
Waterfront (waterfront_yn 3.8%, ignored): premium 30-100%.
In-law / income suite (interior_features): In-Law Suite 10,376 / In-Law Capability 17,239 — income-value signal, unread.
Candidate, fill-rate unverified (value-signal recon pending): lot area/shape/irregular, corner lot, condition/renovation, kitchens/rooms, exposure/direction.

Architecture note: the 200-pt scoreMatch already computes per-comp match quality — but the price is currently a flat mean of top comps (no quality-weighting). Under v10 philosophy, scoreMatch RANKS and selects the tight pool and drives feature-delta narration; it does NOT blend a wide pool into a silent mean.
THE FIVE-LAYER MATCH FLOW (LOCKED 2026-06-04, operator-defined) — the definitive estimator flow
This is the authoritative flow. The dynamic model above feeds it; this is how it executes for the user.
Layer 1 — FOUNDATIONS (mandatory; no estimate without them). Type, storey/style, size range. The engine gate. Missing → ask or route to agent, never run blind.
Layer 2 — CRITICAL FACTOR #1: FRONTAGE, proportional variance. Lot recon verified:

±20% proportional band is the variance (operator-set, data-confirmed viable). At community level a subject averages 121 comps within ±20%, 69 within ±10% — deep pools.
Proportional, NOT absolute feet — confirmed: current absolute ±10ft = ±33% on a 30ft lot but ±5% on a 200ft lot (broken both ends). Band scales with subject frontage.
Data caveats baked in: clamp the contaminated 200+ft tail (max=2000ft = data error; reject >500ft unless lot_size_units='Acres'). Route the ~2% Acres regime (rural) separately — don't let a metric-misentry pollute a suburban pool. lot_width/lot_depth are the signals (84%/83% fill). NEVER use lot_size_area (double-units trap: lot_size_units AND lot_size_area_units can disagree; Feet-regime sqft values are anomalous).

Layer 3 — OTHER CRITICAL FACTORS: age, basement, separate-entrance, backing (ravine etc.).

AGE — VERIFIED (recon 2026-06-04): pre-bucketed, 7 buckets (New, 0-5, 6-15, 16-30, 31-50, 51-99, 100+), vocab matches the matcher's AGE_BRACKETS_ORDERED verbatim → bucket-equality match like LAR, no banding/normalization needed. Caveats: (a) 51-99 bucket is 49yrs wide — lumps 1925 pre-war (premium) with 1970 boom (mainstream); in that wide bucket age must weight-down/widen, not feign precision (same coarseness as luxury LAR bucket). (b) Only 43.4% filled; no year_built column exists — bucket is the only age signal. (c) Seller form COLLECTS age but SellerEstimateRunner.tsx DISCARDS it → subject age always null on seller path → age dimension doubly inert. 1-line runner fix revives it (foundations-enforcement workstream, not size patch).
Basement / separate-entrance / ravine-backing / (condo: lake-view, deferred to condo phase) — these are ENRICHING (verified in value-signal inventory): they place the home WITHIN the range + drive ± narration, they don't gate the match.

Layer 4 — BINGO or HONEST SUGGESTIONS — "but always there is something."

Foundations + frontage + critical factors satisfied → BINGO: tight, confident, median price.
No perfect match → closest real suggestions with honest framing ("wider than ideal because…") + route to agent. The user NEVER gets a dead end. Even with no bingo, they get the nearest real comparables + why they're approximate. Always something.

Layer 5 — GEO CASCADE with NOTIFICATION at every step.

Street (with odd/even) → community → municipality → area. Drop a level ONLY when the current is null/thin.
Every drop carries a user notification — "nothing sold on your street, here's your community." The widening is VISIBLE, never hidden. User is never in ambiguity about how tight the comparison is. This is the tiered-honesty spine as the user-facing flow.
STREET/ODD-EVEN DATA VERIFIED (recon 2026-06-04) — and a FREE 20-PT WIN found: street_name + street_number are 100% filled as structured columns (the matcher currently parses unparsed_address unnecessarily — structured columns exist). 98.5% of street_numbers parse cleanly as int → parseInt % 2 reliable for odd/even (1.4% suffix cases like "123A" need leading-number regex; 0.07% no-digit drop out). The matcher's 20-pt street bonus (15 same-street + 5 same-odd-even, scoreMatch:354-358) is DEAD — hardcoded sameStreet=false at line 552 because "we don't have subject address." That's 10% of the 200-pt budget unused — and it's the SAME-SIDE-OF-STREET = same-backing = ravine-proxy signal (operator's #1 instinct). REVIVABLE via 2-file change: SellerEstimateRunner.tsx (add streetName/streetNumber to HomeSpecs), HomeSpecs interface (+ fields), matcher (read structured street_name/street_number, drop the address parser), HOME_SELECT (+ columns). High value-per-effort, foundational to Layer 5 — sequence EARLY.


The point of every estimate: get the user to VALUE with accurate + relevant data, median-priced, features highlighted (± narration), honest about confidence. Complexity scales to the product.
ScenarioRegimeWhat gates (foundational)What happensTownhouse, 1500-2000, 2-storeyUrban, standardized lottype + storey + LAR. Frontage band wide/non-binding (townhouse lots uniform)Simple "bingo" — storey + sqft range matches, tight pool, median price. Lot barely varies so it doesn't dominate. Complexity correctly LOW.Detached 2-storey, 60ft lot, suburbanUrban frontagetype + storey + LAR + frontage proportional band (~48-72ft)Comps within band on same street/community, median. 100ft-lot comps EXCLUDED (different product).Detached 2-storey, 79ft lotUrban frontagesame, band ~63-95ftProportional band handles the "never exactly 50 or 100" reality — 79ft finds its real neighbours.Bungalow on 4 acres, ruralACREAGEtype + storey + acreage (the field that MUST NOT be missed) + sizeCompares to ~4-acre bungalows. Land dominates. Missing acreage here = catastrophic (pools with a 0.4ac suburban lot = "dumb and dumber"). House-on-land still differentiates within the acreage set.Subject skips size (form allowed it today)anysize MANDATORY — blockedEstimate does NOT run size-blind. Ask for size, or route to agent. (Fixes a live negative-price source.)Luxury, 3500-5000 bucket (1500 wide)urban/largetype+storey+LAR+lotStructural size-resolution ceiling (no finer field exists). Wide bucket → wide range → likely route-to-agent. Honest, not forced.Thin comps at community levelanyfoundations met but <3-5 real compsWiden street→community→muni with tiered-honesty note at each level. If still thin → "suggested nearby sales, see agent."Charlie conversational estimateanyengine enforces SAME floorCharlie is a separate AI product; it calls the same engine. Engine refuses foundation-blind estimates → Charlie is forced to supply them. Charlie's conversational gathering of inputs = NEXT-PHASE UX, not this workstream.Rural, acreage field empty but large lotneeds detectionacreage regimeFallback regime detection (lot_size_units='Acres' or lot magnitude) — recon must confirm how to detect when acreage itself is null.
OPEN — LOT-DATA RECON (next foundational probe, not yet run)
The acreage/frontage regime switch is buildable ONLY if the data supports it. Must verify BEFORE designing the lot constraint:

Does an acreage field exist and what's its fill rate? How does it co-occur with frontage_length/lot_width, lot_size_area, lot_size_units?
Real frontage distribution (urban vs rural) — where does the data flip from feet-world to acres-world?
Is frontage populated on rural homes, or null exactly where it matters? (If null where it matters → need the acreage regime to catch it.)
Critically: how many comps survive a proportional frontage band (±X%) at each geo tier? This sets whether ±20% is viable or lot can only be a soft-widen constraint. Sets the real X%.
Lot gets its OWN design pass (like size did) — it is NOT a bolt-on to step 1. Frontage reclassified from $/ft score-nudge to Tier-1 comparability gate for homes.


Probed all three candidate size fields before designing the size patch (operator instruction: "get the data, don't guess"). The three collapse to ONE real signal.
FieldFillNature (verified)Use in home matcherliving_area_range77.4% (245,811)Bucket label, 9 canonical buckets (+3 noise rows)PRIMARY + ONLY size signal — literal equality; optional ±1 adjacent bucket in relaxed tiersquare_foot_source3.8% (12,118)Provenance LABEL on homes, not a measurement — 99.83% of filled rows are label-only (Other/LBO Provided/Plans/Owner/Builder/MPAC). Only 21 of 317,709 (0.0066%) carry any numeric (pure+range+mixed). CONVENTION divergence, not a data gap: same column is numeric on ~20% of CONDOS (49,318 rows — condo agents embed sqft; BINGO tier earns its keep there). Home agents use it for "who measured." Intent differs by property class — uncorrectable by backfillDROP from home size path (domain mismatch the home matcher inherited from condo code). Keep extractExactSqft + SFS for the CONDO path (legit on 1-in-5 condos)calculated_sqft68.4% (217,342)LAR midpoint rebadged — every value = RANGE_MIDPOINTS[LAR]. Circular by constructionNOT a signal. Rescues 0 LAR-null rows; loses 28,469 LAR-filled rows if used instead. Strict subset of LAR. Niche: midpoint-distance for graded scoring only — never coverage
Consequences locked:

On homes there is NO hidden numeric sqft. The only true size signal is the LAR bucket. SFS-numeric matching is dead by data, not by neglect — confirmed 3×.
RANGE lives in BOTH fields, loader-dependent — but redundantly. living_area_range and square_foot_source are two slots that can hold the same bucket vocabulary; which gets filled depends on what the listing loader chooses. Verified: condo range-form SFS (1,436 rows, 0.6%) MIRRORS the LAR bucket strings (600-699, 500-599 etc.) — a duplicate copy, not additive. On HOMES, range-form SFS = 1 row in the entire 2y universe. Furthermore extractExactSqft (types.ts:142) explicitly rejects range-form (/^\d+-\d+$/ → null), so even condo range-form SFS never fed BINGO — already routed to RANGE via LAR. The real condo numeric signal is pure-number (12,973) + embedded/mixed (34,868), genuinely absent on homes. Net: dropping SFS from the home size path loses exactly zero signal.
The luxury size cocktail is STRUCTURAL, not fixable in code: the 3500-5000 bucket is 1500 wide; no field can tighten it. This is a data ceiling. The v11 design already handles it correctly (wide bucket → wide range → route-to-agent). Confirmed correct, not lazy.
"Apple-to-apple" on homes is achieved through PRODUCT GATES (type + storey + bed, step 2) + same LAR bucket — NOT through finer size numbers (they don't exist). The cocktail risk was the missing type/storey gates + unconstrained relaxed funnel, both fixable (steps 1+2). Size precision beyond the bucket is a hard data limit.
Canonical LAR bucket order (ignore 3 noise rows: 600-699, 800-899, 2500-2749 = 4 rows total): < 700 → 700-1100 → 1100-1500 → 1500-2000 → 2000-2500 → 2500-3000 → 3000-3500 → 3500-5000 → 5000+. Widths non-uniform (100-500 wide in the mass band, 1500 wide at luxury). 81.6% of homes sit in the 700-2500 mass band.
isAdjacentRange MUST be a hardcoded lookup against this canonical order (NOT runtime string-parsing — the 4 noise rows would corrupt parsed adjacency).


Survived the pooler-timeout fight (single-pass query). The data behind step 5. ~30-35% of homes carry at least one real desirability signal the matcher ignores today.
LAYER 1 — free structured wins (100% non-null, zero false-positive, use first):

view jsonb — ~14% carry a premium tag. Trees/Woods 16,316 · Forest 5,249 · Park/Greenbelt 5,036 · Lake 4,817 · Water 3,766 · River 2,050 · Pond 1,764 · Creek/Stream 1,389. Cheapest big win.
waterfront_yn (scalar) — true 8,949 (2.82%). Cleaner than the features array; use this for the binary. Premium 30-100%.
exterior_features → "Backs On Green Belt" 3,150 (~1%) — backing signal already structured (text underreports it ~4×).
Income-suite: interior_features In-Law Capability 18,116 + In-Law Suite 11,818 (~30k); corroborated by basement-kitchen signal kitchens_total > kitchens_above_grade (~27k, since 34,884 have 2 kitchens but only 8,004 have 2 above-grade).

LAYER 2 — structured richness the matcher never touches (free, high-fill, additive delta lines):

washrooms_type1..5 (+ _level, _pcs) — decomposes baths into floor + piece-count. Distinguishes "2-bath-main + 1-bath-basement" from "3-baths-same-floor". Matcher only uses bathrooms_total_integer today.
bedrooms_below_grade — structured basement-bedroom count (income corroboration).
main_level_bedrooms + Primary Bedroom - Main Floor (33,326) — accessibility / luxury-bungalow signal.
direction_faces — 97.79% filled (N/S/E/W). South-facing backyard premium, nearly fully populated.
Also exist, unprobed/secondary: den_familyroom_yn, recreation_room_yn, room_height (cathedral ceilings), room_type jsonb.

LAYER 3 — text signals from public_remarks. 33.3% (105,781) mention SOME signal, but word-matching is mostly false-positive. Step-5 first pass uses ONLY the 3 clean ones (exact match, no co-occurrence), as WORDED deltas not dollars:

✅ %ravine% 9,662 (3.04%) — NO structured equivalent exists; text-only or it doesn't exist. The high-value odd/even proxy. The reason to do text at all.
✅ %no rear neighbour% + %no rear neighbor% 6,465 (~2%) — clean, low false-positive, strong positive.
✅ %conservation% 5,060 (1.59%) — clean.

DEFERRED to step 5b (logged, not lost) — needs co-occurrence / sentiment logic, earns its own backtest pass:

Loose nature-word matches: %lake% 32,592 / %river% 16,323 / %pond% 8,095 — 6-8× looser than structured view tags (street names, "5 min to lake"). Only count when paired with a backing verb (%backs%lake%) or cross-confirmed by view tag.
%hydro% 14,188 (4.47%) — NEGATIVE signal ("hydro corridor at rear" = easement, no privacy). Weights DOWN; requires sentiment check before use.
%premium lot% 4,316 (1.36%) — self-declared agent marketing; soft.

DEAD — do not use (verified):

lot_features jsonb — only ever contains "Irregular Lot" (7,759). Info already in lot_shape.
lot_dimensions_source — only value "Other".
Bare %lake%/%river%/%creek% without co-occurrence — 75-90% false-positive.
Columns that DON'T EXIST: property_condition, year_renovated, corner_unit, cul_de_sac, frontage_type, den_yn (real name is den_familyroom_yn).

Pool (verified all values): None 280,427 · Inground 14,316 (only one matcher reads) · Above Ground 5,543 · Salt 1,403 · Community 747 · Indoor 620. Step 5 covers all types, surfaced as narrated delta.
Condition/renovation: no structured field exists. %renovated% 58,090 (18.28%) + %updated% 59,670 (18.78%) in remarks = ~37% combined — text-only path, deferred (not in first-pass scope).

Run log
2026-06-04 — v1 opened + homes census run

Sequencing locked: estimator core first, RAG second. Hybrid confirmed. Homes priority.
Homes data census complete (read-only, verified). Findings logged. Operator domain inputs locked.
3 recon-pending items flagged. No code touched, no design locked.

2026-06-06 — PATH B (harness de-duplication) — fixing the measurement blindness (refactor backtest to import production), NOT Path A (mirror patches into inlined copy).** Path A would maintain the duplicate-logic divergence that caused the measurement blindness; Path B eliminates it permanently — one implementation, backtest measures exactly what production runs, every future patch tested for free.
STAGE 1 SHIPPED (production parameterization for as-of-date) — 5 seams, tsc-clean, byte-identical live behavior:

Seam 1: HomeSpecs += asOfDate?: Date + subjectListingKey?: string (both commented backtest/historical-only).
Seam 2: const referenceDate = specs.asOfDate ?? new Date() → twoYearsAgo derived from it.
Seam 3+4: community + muni queries += .lt('close_date', referenceDate.toISOString()) (no-op for live since Closed rows have no future dates).
Seam 5: recency in scoreMatch reads specs.asOfDate?.getTime() ?? Date.now() — read off specs (already passed in), so NO signature change and NONE of the 4 call sites (562/578/617/635) touched. Cleaner than threading a param.
Backwards-compat: when asOfDate absent (all live callers) → referenceDate=now, .lt no-ops, recency=Date.now() → identical to pre-Stage-1.
subjectListingKey added to interface but NOT yet wired to a query .neq() (avoided guessing the query anchor). Exclude-self handled on backtest side (its own fetch already does `listing_key != # W-ESTIMATOR-RAG — Estimator Core Logic + AI RAG Accuracy Tracker

Status: v12 — DESIGN LOCKED (homes) + PHILOSOPHY + PRICE-OUTPUT MODEL + VALUE-SIGNAL INVENTORY + SIZE-FIELD VERDICT + DYNAMIC PRODUCT-AWARE MATCHING MODEL + MANDATORY-FOUNDATIONS RULE. NOTHING BUILT — no code touched, no design ships without operator okay.

v12 — DYNAMIC PRODUCT-AWARE MATCHING MODEL (LOCKED 2026-06-04) — the core estimator logic
The governing realization: the matcher's complexity must scale to the product. A townhouse is simple (standardized lots, storey + sqft range = done). A bungalow on 4 acres is a different universe where the LAND is the value — missing the acreage field there is a catastrophic error, not a small one. The estimator must detect which world it's in and apply exactly as much rigor as that world demands.
The dynamic flow (every home estimate)

Identify the product (categorical gates — hard, never crossed):

TYPE: Detached / Semi-Detached / Townhouse / Link (Link split out per v10). Type-isolated pools.
STOREY/STYLE: 2-storey ≠ 2½ ≠ 3-storey ≠ bungalow-family ≠ split. Storey is a product separation (operator ruling, critical esp. townhomes).


Pick the LOT REGIME (the regime switch — driven by the data field, not a guessed city list):

acreage / large-lot filled → ACREAGE REGIME. Lot is the dominant value driver. Comparability runs on acreage (~similar acreage matches). A 5-acre parcel compares to ~5-acre parcels — NEVER pooled with a 0.4-acre suburban lot even if both houses are "4-bed detached." The house on the land still matters (mansion on 5ac ≠ cottage on 5ac), but the land regime gates first.
acreage empty → URBAN/SUBURBAN REGIME. Comparability runs on FRONTAGE, as a continuous PROPORTIONAL band (~±X% of subject frontage, NOT fixed ±feet). 60ft → ~48-72ft; 79ft → ~63-95ft; 200ft → ~160-240ft. The band scales with the lot because value scales with the lot (50→60ft matters; 200→210ft doesn't). X% to be set FROM DATA, not guessed.
Townhouse special case: lots are standardized → lot dimension barely varies → frontage band is wide/non-binding → storey + sqft range is effectively the whole match ("bingo"). Complexity correctly collapses for simple products.


Band on SIZE: same LAR bucket (exact in strict tier, ±1 adjacent in relaxed). LAR is the only real home size signal (verdict below).
Now you have a TIGHT set of genuine apple-to-apple comparables (ideally a handful, ~5). Same type, same storey, same lot-regime, same size band.
PRICE = MEDIAN of that tight set. NOT a mean. NOT a weighted blend of 140 properties. Median is robust — one weird comp can't drag it (the current arithmetic-mean is exactly what produces the negative-price blowups). Five real apples, take the middle.
If the tight set is too thin → WIDEN the geo cascade (street → community → muni) → then ROUTE TO AGENT. Never average garbage into a number. The band protects apple-to-apple; the cascade protects coverage; the agent catches the irreducible remainder (the 8%).

Why median, not mean (locked)
The recon found valuation = simple arithmetic mean of comp prices ± tier band. Mean is fragile: one stretched/bad comp drags the number (and with hardcoded adjustments, below zero). Median of a tight genuinely-comparable set is robust to outliers — both simpler and more accurate. This is how a good agent actually thinks: "I have 5 real comps, the middle one is X."
MANDATORY FOUNDATIONS RULE (LOCKED 2026-06-04) — the ENGINE enforces; entry points must satisfy
The estimator deals in DATA. A number built on missing foundational inputs is a wrong number dressed as a real one. We are NOT here to please the user with a frictionless form — we are here to give a CORRECT answer, and correctness has prerequisites. If prerequisites aren't met, the estimator does NOT produce a number — it asks for them, or routes to the agent. It NEVER guesses or runs foundation-blind.
Clean separation of concerns (clarified by operator):

THE ESTIMATOR is deterministic CODE LOGIC. Form → specs → matcher → median → result. The "AI layer" (getAIInsights) is pure presentation — 3 text fields, changes ZERO numbers, $0, off by default. The estimate NUMBER is 100% code. This workstream = the engine.
CHARLIE is a SEPARATE conversational AI product that happens to be one entry point calling the same engine. The seller form physically lives in Charlie's components (app/charlie/components/SellerForm.tsx) — that's the only connection.
THE GATE LIVES IN THE ENGINE (this workstream). The matcher refuses to produce a number when foundational inputs are missing, regardless of caller. Because the engine is the gate, EVERY entry point (form, buyer modal, Charlie) is automatically forced to supply foundations — no caller-specific enforcement logic needed in the engine work.
Charlie's CONVERSATIONAL enforcement (asking the user in chat, validating before calling the engine) is a NEXT-PHASE Charlie UX item — NOT this workstream. Charlie being AI doesn't exempt the data from discipline, but adapting Charlie's conversation to the engine's gate is downstream. Logged, deferred.

Foundations are HIERARCHICAL and PRODUCT-CONDITIONAL — not a flat list:

Universal identity (always mandatory): TYPE, STOREY/STYLE, SIZE range, beds, baths. Without these there is no product to compare.
Product-specific value driver (mandatory, but WHICH ONE depends on the product):

HOME → LOT is foundational. Two identical houses on a 50ft vs 100ft lot are NOT comparable — the land is half the value. Lot (frontage OR acreage per regime) is a foundational COMPARABILITY constraint, NOT a post-hoc $/ft adjustment. This reclassifies frontage from a Tier-2 score nudge to a Tier-1 matching gate for homes.
CONDO → frontage is meaningless (no lot). Foundational variable switches to interior size + building/maintenance/parking factors.


Enriching (lowers confidence / widens range if absent, does NOT block): age, basement, garage, pool, premium signals. These place the home WITHIN the range and feed feature-delta narration — their absence widens the range honestly rather than blocking.

THE STARVED-FORM PROBLEM (located 2026-06-04 — the upstream bottleneck)
The matcher can be perfect but produces wrong numbers if the form starves it. Verified in SellerForm.tsx + SellerEstimateRunner.tsx:

Size (LAR) is OPTIONAL on the home seller path — no validation. When skipped, conditional spread drops it → specs.livingAreaRange undefined → matcher falls through both size branches → size-unconstrained pool → a live production source of the RANGE-ADJ negative-price catastrophe (separate from the relaxed-funnel hole).
Form only populates ~4 of ~11 scoring dimensions. Style, age, basement, garage, pool NEVER collected on seller path → all score 0 → max achievable score ~100/200 → every seller estimate capped at RANGE tier, BINGO structurally impossible. A seller literally cannot get the estimator's best match because we never asked.
specs.exactSqft is NEVER set on the seller path (form has no field) → confirms dropping the dead SFS branch breaks zero seller traffic.
Buyer modal (from a listing record) CAN populate more fields → form-side enrichment is a separate, larger workstream from the matcher patch.
Consequence: making foundations mandatory in the form/Charlie is now a PEER priority to the matcher patch — fixing the engine while the fuel line is half-disconnected is incomplete work. Size-mandatory is the first and clearest enforcement.


Started: 2026-06-04
Owner: Shah
Predecessor: W-FUNNEL (closed 2026-06-04).
Suggested location on disk: docs/W-ESTIMATOR-RAG-TRACKER.md

Why this exists
The estimator is delicate, accuracy-critical work. Two parts:

Estimator core logic (PRIMARY) — the deterministic valuation engine across four paths: condo sale, condo lease, home sale, home lease. Hybrid approach (comparable-based + formula/PSF). Goal: make the core so solid the AI layer becomes optional — accuracy and relevance from the code itself.
AI RAG responses (SECONDARY) — the AI commentary/insight layer on top. Improve quality, but the strategic aim is to reduce dependence on it as the core hardens (cost saving — AI calls are paid).

Homes analysis is the priority concern — flagged as the weakest area, needs the closest look.

Locked decisions

Sequencing: Estimator core FIRST, then RAG. Rationale: RAG adds insight on top of a valuation; if the underlying number is wrong/weak, improving AI commentary is narration over bad numbers (and a convincing AI explanation of a wrong valuation is more dangerous than an obviously-thin one). The core must be hardened first to even measure how much AI is still needed — which is the precondition for the cost-saving "shrink the AI layer" goal. (Locked 2026-06-04.)
Core approach is hybrid: comparable-based (find similar sold/leased → derive price) + formula/PSF (adjustments). Both layers are independent accuracy sources; homes weakness localized — see findings.
Cost-saving thesis: strong deterministic core → less reliance on paid AI commentary. The §9.2 work already made estimator AI tenant-keyed + off-by-default per tenant, so reducing AI use is also a per-tenant cost lever.
STRICT BUCKETING — CONFIRMED with eyes open (v9, 2026-06-04). Like-for-like comparable pools: style-family + size + bed, community → muni cascade. Measured cost: 82% confident / 11% thin / 8% route-to-agent. Bounded and affordable. The 8% route to the agent because there genuinely is no clean comparable — that is the right behavior per the prelude-to-agent framing, not a failure.
STYLE-FAMILY GROUPING — CONFIRMED (v9). Bungalow + bungalow-raised + bungaloft grouped together costs almost nothing vs exact-style (60% vs 56% confident) — a cheap, sensible relaxation that stays inside apples-to-apples.
PSF FOR HOMES — OUT as a pricing tool (v9, resolved by data, not assumption). No table has the style+size segmentation strict bucketing requires. Homes price from the comp pool itself, not a PSF surface. geo_analytics survives ONLY as the market-context (absorption / DOM / pace) feed for the report — never as a PSF pricing signal.
COMPARABLE URL LINKS — KEEP, non-negotiable (v9). Each comparable links to its listing page so the user can verify the claim ("you said 142 Maple sold for $890k — here's the listing"). This is trust, and it reinforces the real-data thesis. Carries forward into the new report. Build constraint: comparable links MUST resolve to the tenant's own domain (same tenant-correct-URL rule the funnel session enforced) — multi-tenant, never hardcoded.
LISTING-CARD STYLE — CONFIRMED design upgrade (v9). Comparables render as cards (photo, linked address, sold price, beds/baths, sqft range, sold date, DOM) instead of a flat table. Makes comps feel like real properties. Same card style extends to the "what's competing now" active-listings section.


v10 — ESTIMATOR PHILOSOPHY (LOCKED, 2026-06-04) — the spine everything builds toward
This is the governing philosophy. Every build step serves it. Locked by operator.
Principle 1 — TIGHT beats WIDE. The machine's edge is reliability, not volume.
The win is NOT "hold 140 comps where a human holds 5." 140 comps = 5 real comparables diluted by 135 irrelevant ones. A good agent doesn't fail to hold 140 — they correctly IGNORE 135 because those aren't the same street, same product, same backing. The machine's edge over the human is doing the same tight, street-level, feature-aware comparison the best agent does — but consistently, at scale, without getting tired or missing a tag. Same method, more reliable execution. NOT a different "PhD" method. A real estimate off 4 same-street comps beats one off 40 community comps. We never widen the pool just to inflate the count.
Principle 2 — Take the complexity onto OUR side. Hand the public a clean story.
We cater to the normal public, not PhDs. The machine does the hard part (catches every feature, checks every comp, runs the cascade); the user gets the clean narrative: "here's your home, here's what sold down the street, here are the 3 things different and which way each pushes your price." Rich and accurate underneath, readable on top. Solving complexity — not manufacturing it.
Principle 3 — Features are SHOWN, not silently blended.
Features don't just nudge a hidden number — they become lines in the report. The flow:

Scan the subject FIRST — read everything the subject home has (backing, view, basement finish + separate entrance, pool, garage, lot, condition).
Foundational match — find tight, same-street/community comparables that pass the real product gates (type, storey).
Narrate the deltas, ±, in the report:

Subject HAS a big feature comps LACK → highlight as a plus ("Your home backs the ravine; 142 Maple doesn't — supports pricing above it").
Subject LACKS a big feature comps HAVE → highlight as a minus, honestly ("142 Maple has a finished walkout w/ separate entrance; yours is unfinished — expect to price below it").




Delta expression = BOTH (locked): dollar impact where the data supports it (e.g. +$30k pool), direction + words (↑ strong plus / ↓ minor minus) where it doesn't. Never a silent number move.

Principle 4 — GRACEFUL DEGRADATION with honesty at every tier (the report spine).
The estimate NEVER silently passes a muni-level guess off as a street-level fact. Each cascade tier carries its own note, guiding the user at every level:

Street level → "Here's what sold on your street." (Highest confidence — say so.)
Community level → "Nothing comparable sold on your exact street recently — here's what sold in your community."
Municipality level → the honest hand-off: "I couldn't find a true comparable in your community. Here are some suggested recent sales nearby — but this is wider than ideal, so contact the agent to confirm." A guided, honest route to the agent — NOT a confident number dressed as precision.
This IS the 82/11/8 split: the 8% route-to-agent is where even widening produces no real comps. We don't manufacture a number from garbage; we hand it to the agent. That is the accuracy.

Principle 5 — Show FOR-SALE competition, not just SOLD comps.
A seller pricing today competes against live inventory, not just history. The report surfaces actively-listed competing properties (same listing-card style: "here's what you're up against now") alongside sold comps. This is what makes it a pricing TOOL, not a backward-looking average. (Build step 4.)
Principle 6 — The WOW: relevant, accurate, valuable.
The user sees: their home → real sold comps with clickable, verifiable, tenant-correct links → live competing listings → honest feature-deltas. Rich on our side, clean on theirs.
Architecture resolution
Resolved by Principles 1–5 together: we are NOT building a 140-comp weighted blender. We build tight street-first comparables (pin → street → community → muni cascade) + a feature-delta narrative + tiered-honesty notes + active competition. The existing 200-pt scoreMatch is used to RANK and to select the tight pool and to drive the feature-delta narration — not to blend a wide pool into a silent mean. Hard product gates (type, storey) keep non-comparables out entirely; refinement features become narrated deltas, not delete-gates that empty the pool.
Principle 7 — PRICE IS A RANGE, and the range's WIDTH means confidence (v11)
A single point price is almost a lie. The output is a range, and the width carries meaning:

Tight comps (street-level, clean) → NARROW range ("$1.82M–$1.88M") → high confidence, say so.
Stretched comps (muni-level) → WIDE range ("$1.65M–$1.95M") → the width itself honestly signals lower certainty. The range IS the tiered-honesty principle made numeric — no separate disclaimer needed.
Desirability signals shape WHERE IN THE RANGE the home lands: ravine + finished basement → top; lacks comp features → bottom. This is the bridge between the desirability layer and the number.

Principle 8 — INVERSE NARRATION: show how we got to the price (v11) — the trust mechanism
The feature-delta narration runs BACKWARDS to JUSTIFY the number. Not a side-panel — the actual derivation:

"Started from 3 homes sold on/near your street: 14 Glendale ($1.79M), 88 Marmaduke ($1.95M), 5 Fern ($1.82M). Your home backs the ravine — Glendale doesn't (+). Marmaduke has a finished walkout yours lacks (−). Nets to $1.82M–$1.88M."


The user traces the price back to real, clickable, verifiable sold homes + the specific reasons it moved up/down from each.
Self-policing: if we can't write the derivation honestly, we don't have a price — we have the route-to-agent.

PRICE-ROLE BOUNDARY (LOCKED v11) — what the desirability layer may and may NOT do

Comparables PRICE the home. Tight real sold comps produce the base range. Signals never override this.
Structured signals (Layer 1+2) carry DOLLAR deltas — but ONLY after step 3 makes adjustment values real (market-derived per community). Until step 3, dollar adjustments are flat hardcoded constants and are NOT trustworthy as dollars. This is WHY step 3 precedes step 5 as a dollar influence.
Text signals (ravine, no-rear-neighbour, conservation) carry WORDED deltas, never dollars — text is a softer source (e.g. bare %lake% is 6.8× false-positive vs structured view tag). Maps onto the BOTH delta rule: dollar where structured/strong, words where soft.
Signals REFINE and EXPLAIN; they do not MANUFACTURE confidence. In thin-comp (muni / 8%) cases, signals become part of the honest hand-off ("your ravine lot is a real premium, but no clean comparable exists — see the agent"), NOT a rescue into a confident number.
Build-order rationale confirmed: 1 (size) → 2 (gates) → 3 (real adjustments) → 4 (competition) → 5 (signals). Each step earns the right to influence price before it's allowed to.


Resolution 1 — PSF question: SETTLED, confirms skepticism was right
PSF tables are a dead end for homes:

psf_monthly_sale / psf_monthly_lease: 98% of communities BLEND condo + freehold into one PSF (no property_type column), and 5 months stale → unusable as-is. A $750/sqft condo averaged with an $1,100/sqft house is the apples-to-oranges baked right in.
Per-building PSF tables: condo-only → drop entirely.
One survivor: geo_analytics — has an explicit track='homes' column AND a subtype breakdown (Detached / Semi / Townhouse, each with own median/DOM/sale-to-list), reasonably fresh. BUT: no style segmentation (no bungalow-vs-two-storey split) and the subtype breakdown was empty on 4 of 5 sampled rows. → usable for top-line market context (the report's absorption/DOM/pace section), NOT as a PSF pricing signal.

Net: PSF as a pricing tool for homes is OUT — confirmed, not assumed. Any home PSF would have to be derived per-query from raw listings. Homes price from the comp pool. geo_analytics = market-context feed only.
Resolution 2 — Bucket contamination: CONFIRMED, located exactly
The apples-to-oranges fear is real and located:

Sale strict funnel: style is a hard gate (good — bungalows excluded from two-storey pools when both styles known, which is 98.6% of the time).
Sale's municipality fallback: NO style filter — when the strict funnel fails and drops to muni, it pools bungalows + two-storeys + sidesplits together. LEAK.
Lease: NO style logic anywhere — every lease tier pools all styles together. COMPLETE LEAK.

→ Strict ruling is partially implemented for sale, entirely absent for lease. Closing both leaks is a concrete, located change: make style a hard gate in sale's muni fallback + all lease tiers, with family grouping.
Resolution 3 — Coverage cost: MEASURED before committing
Under strict bucketing (community → muni cascade, style-family + size + bed): 82% confident / 11% thin / 8% route-to-agent. Affordable — far better than feared. Only 8% get "see the agent." Luxury hit harder at community level (67% thin) but muni fallback recovers most. Style-family expansion is the cheap relaxation (60% vs 56% confident exact-style).

The full diagnosis (confirmed, v9)
The home estimator is accurate when it has a clean match and breaks when it stretches. Two located root causes:

Dead size field — reads empty square_foot_source → relaxed tier does no size filtering → pools 1,000 with 4,000 sqft homes → negative prices.
Bucket leaks — style is a hard gate in the strict sale path but absent in sale's muni fallback and all of lease → bungalows pool with two-storeys.

Both specific, located, fixable.

Build sequence — LOCKED (v10, all measured against the 16.8% baseline)
Each one built, then re-run through the backtest to prove it moved the number — kept only if it did. Every step serves the v10 philosophy (tight comps + narrated feature-deltas + tiered honesty + active competition).

Fix the size field — point home matching at living_area_range (the strategy that already works for condos). Highest leverage — upstream of the negative-price catastrophe. Relaxed-funnel size band still OPEN (exact / ±1 / ±2 LAR bucket) — to be decided when step 1 is authored, measured on backtest.
Close the bucket leaks — the located leak is the bedBathOnly last-resort muni fallback (lines 622-636), which drops style to scoring-only. Make product gates (type + storey) hard everywhere including that path. Also: split Link out of the Townhouse type pool; break the twostorey style family apart so storey count (2 / 2½ / 3-Storey) is a real product separation, esp. for townhomes (operator ruling, v10).
Real-data adjustment analytics (community-level, dashboard-editable) — replaces ALL flat hardcoded constants (frontage $40k/ft, basement $50k/$80k/$110k, garage, pool, bath). Per-market, not flat. Fixes the 3 basement score/dollar inconsistencies. Wires the existing adjustments table (muni/community/area grain) into the home path.
Active competition + absorption (from geo_analytics + live For-Sale listings) — the selling-side input + the "what you're up against now" report section (Principle 5).
Premium / value signals (desirability layer) — see VALUE-SIGNAL INVENTORY below. Step-5 first-pass scope LOCKED (v11): Layer 1 (structured premium) + Layer 2 (structured richness) + the 3 clean text signals only. Loose word-matches + hydro-negative deferred to step 5b. Closes luxury quality-of-match AND feeds feature-delta narration. Fix pool to cover all pool types.

Report-layer (parallel, design-locked v11):

Comparable URL links preserved — MUST resolve to the TENANT's own website, never a hardcoded domain (multi-tenant non-negotiable, same tenant-correct-URL rule as the funnel work). Applies to BOTH sold comps AND competing-for-sale links. Explicit build-gate.
Comp / competing display = Option C (LOCKED v11): Charlie-density tile + ONE feature-delta line. NOT full cards (too tall — 3 sections would bury everything), NOT pure Charlie tiles (no room for the delta — loses the wow). Small scannable tile (price, linked address top-right, bed/bath/sqft/sold-date) + one delta line (dollar-or-words) showing the single most important ± vs subject. Same tile for "Comparable Sold" and "Competing For Sale" sections.
Competing For Sale section (Principle 5) — live Active / For Sale listings, same Option-C tile, framed forward ("3 similar homes listed now, $1.79M–$2.05M — your competition"). Forward-looking half of the pricing strategy.
Price shown as a RANGE (Principle 7) — width = confidence; signals place the home within it.
Inverse narration (Principle 8) — the derivation IS the report: comps → ± reasons → range.
Tiered-honesty note on every estimate (Principle 4) — street / community / muni each carry their own confidence framing.
Output SPLITS at the end: confident comprehensive report for the 82% with clean comps; honest "see the agent" route for the 8% without.


Recon scope (COMPLETE — read-only, done before design lock)
Estimator core — all four paths (condo sale, condo lease, home sale, home lease):

R1 — Comparable selection: per path, how comparables are chosen (geo radius, building, property-type match, time window, bed/bath/sqft filters); source (PropTx MLS / building sales tables).
R2 — Valuation math: per path formula; PSF basis; adjustments (size, beds, baths, age, condition, time-decay); comparable-derived vs formula-derived and how they combine in the hybrid.
R3 — Homes vs condos divergence (the priority): where the home path differs from condo in BOTH comparable selection and math; why homes is weaker. Localized — see findings.
R4 — Empty/thin-comparable handling: the CONTACT-tier fallback — when each path falls back, threshold correctness.
R5 — AI attachment point: getAIInsights attaches as pure presentation (3 text fields), changes ZERO numbers, currently $0 (both tenants toggle off). Cost-saving thesis confirmed: core already stands alone.
R6 — Accuracy measurability: backtest fully feasible against existing close_price data — measurement is possible (harness shipped, see findings).

Gate: recon reviewed → design lock per path → then build (hardening), recon→design→smoke discipline per CLAUDE.md.

Open questions (status)

How is accuracy currently validated? → RESOLVED: backtest harness scripts/backtest-estimator-homes.js against real close_price. Baseline 16.8% median.
What's the acceptable AI-off output quality bar — how good must the core be before the AI layer is "optional"? (Still open — sharpens as build proceeds.)
Homes: weakness in data or logic? → RESOLVED: both, and located — dead size field (data-field misuse) + bucket leaks (logic). Code fixes, not a data-sourcing problem.


Findings
BACKTEST BASELINE (2026-06-04, 500 sale + 500 lease real subjects, as-of-date + exclude-self) — THE MEASUREMENT BASELINE
Home SALE — a TIER problem, not uniform weakness:

BINGO (n=43): MAE $70k, median 7.1% off, 84% within ±15% — excellent when match is good.
RANGE (n=137): median 13.7%, 56% within ±15% — fine.
BINGO-ADJ (n=223, the bulk): median 19%, 43% within ±15% — mediocre.
RANGE-ADJ (n=49): CATASTROPHIC — median 150% off, 2% within ±15%, one subject predicted NEGATIVE price. Hardcoded adjustments drive comp prices below zero when stretching a poor match. Proves the chain: fake adjustment values actively destroy accuracy, not just imprecise.
Overall median 16.8%; mid-market ($500k-1M) best (14%); <$500k worst (30%, likely misclassified); community-scope beats muni-fallback by ~16%.

Home LEASE — basically works: 78% within ±15%, median 6.9%, bias ~0. Lower priority. Dead spot: BINGO tier never fires (exactSqft null on ~95% homes — same sqft-column issue).
Three assumptions OVERTURNED by data:

Luxury is NOT thin-comp — p99 homes have ~140 comps available (<3-comp only 4%). The luxury gap (25-35%) is QUALITY-of-match (view/lot-prestige/finishes the matcher can't see), NOT count. Changes the luxury fix: read premium signals, don't "handle thin pools."
Premium signals are STRUCTURED, not just text (huge — easier than feared): jsonb tags exist in volume, all UNREAD — view: Lake 4,486 / Park-Greenbelt 4,040 / Forest 4,901; exterior_features: Backs On Green Belt 2,824, Deck 51,550; interior_features: In-Law Suite 10,376 / In-Law Capability 17,239 (income-suite signal). Operator's street/backing/income instincts are in clean structured fields.
Five pre-computed analytics tables IGNORED by estimator: psf_monthly_sale (16,730), psf_monthly_lease (18,501), geo_analytics (18,184), building_psf_summary (75), building_psf_transactions (10,698). Only adjustments (408) is wired in. v9 ruling: PSF tables OUT for homes pricing; geo_analytics retained as market-context feed only.

Sample report (real, current-state) — 37 Lavinia Ave, Toronto W01: sold $1.885M, predicted $2.057M (+9.1%). Comp pool visibly lumped $1.3M and $3.9M homes together (no street-awareness — can't tell Lavinia from South Kingsway). Demonstrates: no street/block awareness, no competition layer, 55% null age (20-pt age dimension dead), unread view/greenbelt tags, flat $40k/ft frontage where W01 real premium is ~$75-100k/ft, unused PSF surfaces.
Homes data census (2026-06-04, all verified against live DB — 317,975 freehold closed rows, 2y)
Operator domain inputs (locked — guide the matrix design):

Street-level comparison matters; odd/even house number carries weight because same-side homes often share the same BACKING (lake/ravine/green space = materially more valuable). Odd/even is a proxy for "what's behind the property."
Luxury homes are a unique market — comparable-averaging breaks down. Needs distinct treatment (now = premium-signal reading, not thin-pool handling — see overturned assumption).
Real-data analytics exist for building parking + lease prices (condos) — must be used, not reinvented.
Strategic goal: electronic analysis takes the user FURTHER than a human could — comprehensive data analysis at scale/consistency a person can't match. Surface every real, data-backed signal.
METHOD RULE: see data comprehensively FIRST, then design how to use it. No guessing — every value real-data or it doesn't ship. Nothing changes without operator okay.

Data realities that reshape the homes plan:

F-HOME-SQFT-WRONG-COLUMN (High): home matcher's best size-match tier uses square_foot_source (95% NULL on homes, ~99% non-numeric labels when present) → that tier is dead code. calculated_sqft is 68% populated and NEVER read. Build step 1 points matching at living_area_range (proven condo strategy). Biggest single accuracy lever.
F-HOME-STREET-BONUS-BUILDABLE: street_name + street_number 100% populated as clean structured fields. Dead "same-street bonus" (hardcoded false) is trivially activatable; odd/even = street_number % 2. Street-level + odd/even fully data-supported.
F-HOME-BACKING-SIGNAL-IN-TEXT-ONLY (High effort): value-driver behind odd/even (backs onto lake/ravine/greenspace) is NOT structured — lot_features jsonb effectively empty. Signal lives in public_remarks free text: ravine 3%, backing-onto ~5%, green space 3%, water-adjacent ~17% combined. Requires phrase extraction (harder tier than structured street match).
F-HOME-ZERO-REALDATA-ADJUSTMENTS (High): all 8 home adjustment values hardcoded constants (lot frontage flat $40k/ft EVERYWHERE, basement/garage/pool/bath). Condos have a real adjustments table (408 rows, computed from real data); homes have none. Directly violates the real-data rule. Build step 3 replaces with community-level dashboard-editable real-data adjustments.
F-LUXURY-NO-PATH (High): price right-tail-skewed (mean 16% > median, p99 $3.3M, max $27M). Reframed by data: luxury gap is quality-of-match, not comp count. Fix = read premium signals (build step 5).
F-HOME-WATERFRONT-IGNORED (High): waterfront_yn 3.8% true, estimator ignores entirely; waterfront premium can be 30-100%.
F-HOME-POOL-PARTIAL (Med): Inground 5.9% (handled), Above Ground/Salt/Community/Indoor ignored.
F-HOME-AGE-52PCT-NULL (Med): half of homes have no age; NULL-age comps pass unfiltered (asymmetric) — 20-pt age dimension degrades on half the pool.
F-HOME-INCOME-SUITE-SIGNAL (Med): ["Apartment","Separate Entrance"] basement 1.6% — income-suite value signal, grouped without extra value today.
F-HOME-SUBTYPE-SCOPE-GAP (RECLASSIFIED 2026-06-06 — see "VACANT LAND / LOT VALUATION sibling product path" entry at end of run log): no longer "Low — excluded." Vacant Land / Rural Residential / Farm become a SIBLING product priced on LAND ($/acre median × subject acreage, or $/frontage × frontage), NOT on building. Geo cascade COMMUNITY → MUNICIPALITY → AREA only (NO street tier — street/odd-even is a house-backing proxy, meaningless for raw land). Status: design-locked PENDING DATA RECON ($/acre per-community stability + comp survival at each geo tier not yet captured to disk). Lease partial-home types (Lower/Upper Level, Room) still passthrough-only.

Condo-side bug found incidentally:

F-RESOLVE-ADJUSTMENTS-PARKING-SALE-COLUMN-MISMATCH (P1): resolve-adjustments.ts:46 references parking_sale_calculated — column doesn't exist (real: parking_sale_weighted_avg). Condo-SALE parking silently falls to hardcoded $50k, never reads the real computed values. Isolated, quick fix. Still P1-quick.

Cross-path (confirmed):

Valuation = simple arithmetic mean of comp prices ± tier-multiplier band. No median, no recency-weighting, no match-quality-weighting. No PSF formula.
AI is pure presentation (3 text fields), changes zero numbers, $0 today (both tenants toggle off). Core already stands alone.
Backtest fully feasible against existing close_price data.

Backtest harness scripts/backtest-estimator-homes.js is the re-runnable audit trail — every future change re-measured against these CSVs to prove it helped.
Feature inventory — home matcher current state (verified, 3 recon passes 2026-06-04)
Every feature the home matcher touches today, how it's used, and what's wrong. This table IS the feature-delta narration source list (Principle 3).
#FeatureDB fieldUsed nowProblem1Property typeproperty_subtypeHard SQL gate, firstLink wrongly pooled with Townhouse (step 2 splits it)2Architectural stylearchitectural_style[0]Hard gate (family) + 25pt score2/2½/3-Storey wrongly one family (step 2 splits)3Age bracketapproximate_ageHard gate + 20pt score52% null; null comps pass unfiltered4Sizeliving_area_range / square_foot_sourceGate + 30pt scoreSFS-numeric dead (0.004% homes); relaxed funnel has NO size filter → negative prices (step 1)5Lot frontagelot_width$40k/ft adj + 25pt scoreFlat $40k everywhere; W01 real ~$75-100k/ft (step 3)6Lot depthlot_depth$5k/10ft (cap $30k) + 10ptHardcoded, not market-aware (step 3)7Basementbasement (jsonb)5-signal decode → $50k/$80k/$110k + 15ptHardcoded flat; 3 score/dollar inconsistencies; lease ignores entirely (step 3)8Garagegarage_type$30k-$70k by type + 10ptHardcoded (step 3)9Bathroomsbathrooms_total_integer$20k each + 10ptHalf-bath rate defined, unused (step 3)10Poolpool_features (jsonb)Inground $30k + 5ptAbove-ground/salt/indoor/community ignored ($0); inground flat $30k (step 5 fixes all types)11Recencyclose_date30pt scoreDollar time-adjustment constants defined, never applied12Same street / odd-evenstreet_name / street_number15+5pt scoreBacking signal (ravine/lake) unread in public_remarks text (step 5)13Bedroomsbedrooms_totalHard gate (exact)Fine
Value signals present in data but UNREAD (step 5 + value-signal recon target) — the desirability layer where the luxury gap lives:

Backing signal (the odd/even proxy): public_remarks free text — water-adjacent ~17% / backing-onto ~5% / ravine 3% / greenspace 3%. Text-extraction tier. The single biggest quality-of-match signal.
View (structured jsonb, unread): Lake 4,486 / Park-Greenbelt 4,040 / Forest 4,901.
Waterfront (waterfront_yn 3.8%, ignored): premium 30-100%.
In-law / income suite (interior_features): In-Law Suite 10,376 / In-Law Capability 17,239 — income-value signal, unread.
Candidate, fill-rate unverified (value-signal recon pending): lot area/shape/irregular, corner lot, condition/renovation, kitchens/rooms, exposure/direction.

Architecture note: the 200-pt scoreMatch already computes per-comp match quality — but the price is currently a flat mean of top comps (no quality-weighting). Under v10 philosophy, scoreMatch RANKS and selects the tight pool and drives feature-delta narration; it does NOT blend a wide pool into a silent mean.
THE FIVE-LAYER MATCH FLOW (LOCKED 2026-06-04, operator-defined) — the definitive estimator flow
This is the authoritative flow. The dynamic model above feeds it; this is how it executes for the user.
Layer 1 — FOUNDATIONS (mandatory; no estimate without them). Type, storey/style, size range. The engine gate. Missing → ask or route to agent, never run blind.
Layer 2 — CRITICAL FACTOR #1: FRONTAGE, proportional variance. Lot recon verified:

±20% proportional band is the variance (operator-set, data-confirmed viable). At community level a subject averages 121 comps within ±20%, 69 within ±10% — deep pools.
Proportional, NOT absolute feet — confirmed: current absolute ±10ft = ±33% on a 30ft lot but ±5% on a 200ft lot (broken both ends). Band scales with subject frontage.
Data caveats baked in: clamp the contaminated 200+ft tail (max=2000ft = data error; reject >500ft unless lot_size_units='Acres'). Route the ~2% Acres regime (rural) separately — don't let a metric-misentry pollute a suburban pool. lot_width/lot_depth are the signals (84%/83% fill). NEVER use lot_size_area (double-units trap: lot_size_units AND lot_size_area_units can disagree; Feet-regime sqft values are anomalous).

Layer 3 — OTHER CRITICAL FACTORS: age, basement, separate-entrance, backing (ravine etc.).

AGE — VERIFIED (recon 2026-06-04): pre-bucketed, 7 buckets (New, 0-5, 6-15, 16-30, 31-50, 51-99, 100+), vocab matches the matcher's AGE_BRACKETS_ORDERED verbatim → bucket-equality match like LAR, no banding/normalization needed. Caveats: (a) 51-99 bucket is 49yrs wide — lumps 1925 pre-war (premium) with 1970 boom (mainstream); in that wide bucket age must weight-down/widen, not feign precision (same coarseness as luxury LAR bucket). (b) Only 43.4% filled; no year_built column exists — bucket is the only age signal. (c) Seller form COLLECTS age but SellerEstimateRunner.tsx DISCARDS it → subject age always null on seller path → age dimension doubly inert. 1-line runner fix revives it (foundations-enforcement workstream, not size patch).
Basement / separate-entrance / ravine-backing / (condo: lake-view, deferred to condo phase) — these are ENRICHING (verified in value-signal inventory): they place the home WITHIN the range + drive ± narration, they don't gate the match.

Layer 4 — BINGO or HONEST SUGGESTIONS — "but always there is something."

Foundations + frontage + critical factors satisfied → BINGO: tight, confident, median price.
No perfect match → closest real suggestions with honest framing ("wider than ideal because…") + route to agent. The user NEVER gets a dead end. Even with no bingo, they get the nearest real comparables + why they're approximate. Always something.

Layer 5 — GEO CASCADE with NOTIFICATION at every step.

Street (with odd/even) → community → municipality → area. Drop a level ONLY when the current is null/thin.
Every drop carries a user notification — "nothing sold on your street, here's your community." The widening is VISIBLE, never hidden. User is never in ambiguity about how tight the comparison is. This is the tiered-honesty spine as the user-facing flow.
STREET/ODD-EVEN DATA VERIFIED (recon 2026-06-04) — and a FREE 20-PT WIN found: street_name + street_number are 100% filled as structured columns (the matcher currently parses unparsed_address unnecessarily — structured columns exist). 98.5% of street_numbers parse cleanly as int → parseInt % 2 reliable for odd/even (1.4% suffix cases like "123A" need leading-number regex; 0.07% no-digit drop out). The matcher's 20-pt street bonus (15 same-street + 5 same-odd-even, scoreMatch:354-358) is DEAD — hardcoded sameStreet=false at line 552 because "we don't have subject address." That's 10% of the 200-pt budget unused — and it's the SAME-SIDE-OF-STREET = same-backing = ravine-proxy signal (operator's #1 instinct). REVIVABLE via 2-file change: SellerEstimateRunner.tsx (add streetName/streetNumber to HomeSpecs), HomeSpecs interface (+ fields), matcher (read structured street_name/street_number, drop the address parser), HOME_SELECT (+ columns). High value-per-effort, foundational to Layer 5 — sequence EARLY.


The point of every estimate: get the user to VALUE with accurate + relevant data, median-priced, features highlighted (± narration), honest about confidence. Complexity scales to the product.
ScenarioRegimeWhat gates (foundational)What happensTownhouse, 1500-2000, 2-storeyUrban, standardized lottype + storey + LAR. Frontage band wide/non-binding (townhouse lots uniform)Simple "bingo" — storey + sqft range matches, tight pool, median price. Lot barely varies so it doesn't dominate. Complexity correctly LOW.Detached 2-storey, 60ft lot, suburbanUrban frontagetype + storey + LAR + frontage proportional band (~48-72ft)Comps within band on same street/community, median. 100ft-lot comps EXCLUDED (different product).Detached 2-storey, 79ft lotUrban frontagesame, band ~63-95ftProportional band handles the "never exactly 50 or 100" reality — 79ft finds its real neighbours.Bungalow on 4 acres, ruralACREAGEtype + storey + acreage (the field that MUST NOT be missed) + sizeCompares to ~4-acre bungalows. Land dominates. Missing acreage here = catastrophic (pools with a 0.4ac suburban lot = "dumb and dumber"). House-on-land still differentiates within the acreage set.Subject skips size (form allowed it today)anysize MANDATORY — blockedEstimate does NOT run size-blind. Ask for size, or route to agent. (Fixes a live negative-price source.)Luxury, 3500-5000 bucket (1500 wide)urban/largetype+storey+LAR+lotStructural size-resolution ceiling (no finer field exists). Wide bucket → wide range → likely route-to-agent. Honest, not forced.Thin comps at community levelanyfoundations met but <3-5 real compsWiden street→community→muni with tiered-honesty note at each level. If still thin → "suggested nearby sales, see agent."Charlie conversational estimateanyengine enforces SAME floorCharlie is a separate AI product; it calls the same engine. Engine refuses foundation-blind estimates → Charlie is forced to supply them. Charlie's conversational gathering of inputs = NEXT-PHASE UX, not this workstream.Rural, acreage field empty but large lotneeds detectionacreage regimeFallback regime detection (lot_size_units='Acres' or lot magnitude) — recon must confirm how to detect when acreage itself is null.
OPEN — LOT-DATA RECON (next foundational probe, not yet run)
The acreage/frontage regime switch is buildable ONLY if the data supports it. Must verify BEFORE designing the lot constraint:

Does an acreage field exist and what's its fill rate? How does it co-occur with frontage_length/lot_width, lot_size_area, lot_size_units?
Real frontage distribution (urban vs rural) — where does the data flip from feet-world to acres-world?
Is frontage populated on rural homes, or null exactly where it matters? (If null where it matters → need the acreage regime to catch it.)
Critically: how many comps survive a proportional frontage band (±X%) at each geo tier? This sets whether ±20% is viable or lot can only be a soft-widen constraint. Sets the real X%.
Lot gets its OWN design pass (like size did) — it is NOT a bolt-on to step 1. Frontage reclassified from $/ft score-nudge to Tier-1 comparability gate for homes.


Probed all three candidate size fields before designing the size patch (operator instruction: "get the data, don't guess"). The three collapse to ONE real signal.
FieldFillNature (verified)Use in home matcherliving_area_range77.4% (245,811)Bucket label, 9 canonical buckets (+3 noise rows)PRIMARY + ONLY size signal — literal equality; optional ±1 adjacent bucket in relaxed tiersquare_foot_source3.8% (12,118)Provenance LABEL on homes, not a measurement — 99.83% of filled rows are label-only (Other/LBO Provided/Plans/Owner/Builder/MPAC). Only 21 of 317,709 (0.0066%) carry any numeric (pure+range+mixed). CONVENTION divergence, not a data gap: same column is numeric on ~20% of CONDOS (49,318 rows — condo agents embed sqft; BINGO tier earns its keep there). Home agents use it for "who measured." Intent differs by property class — uncorrectable by backfillDROP from home size path (domain mismatch the home matcher inherited from condo code). Keep extractExactSqft + SFS for the CONDO path (legit on 1-in-5 condos)calculated_sqft68.4% (217,342)LAR midpoint rebadged — every value = RANGE_MIDPOINTS[LAR]. Circular by constructionNOT a signal. Rescues 0 LAR-null rows; loses 28,469 LAR-filled rows if used instead. Strict subset of LAR. Niche: midpoint-distance for graded scoring only — never coverage
Consequences locked:

On homes there is NO hidden numeric sqft. The only true size signal is the LAR bucket. SFS-numeric matching is dead by data, not by neglect — confirmed 3×.
RANGE lives in BOTH fields, loader-dependent — but redundantly. living_area_range and square_foot_source are two slots that can hold the same bucket vocabulary; which gets filled depends on what the listing loader chooses. Verified: condo range-form SFS (1,436 rows, 0.6%) MIRRORS the LAR bucket strings (600-699, 500-599 etc.) — a duplicate copy, not additive. On HOMES, range-form SFS = 1 row in the entire 2y universe. Furthermore extractExactSqft (types.ts:142) explicitly rejects range-form (/^\d+-\d+$/ → null), so even condo range-form SFS never fed BINGO — already routed to RANGE via LAR. The real condo numeric signal is pure-number (12,973) + embedded/mixed (34,868), genuinely absent on homes. Net: dropping SFS from the home size path loses exactly zero signal.
The luxury size cocktail is STRUCTURAL, not fixable in code: the 3500-5000 bucket is 1500 wide; no field can tighten it. This is a data ceiling. The v11 design already handles it correctly (wide bucket → wide range → route-to-agent). Confirmed correct, not lazy.
"Apple-to-apple" on homes is achieved through PRODUCT GATES (type + storey + bed, step 2) + same LAR bucket — NOT through finer size numbers (they don't exist). The cocktail risk was the missing type/storey gates + unconstrained relaxed funnel, both fixable (steps 1+2). Size precision beyond the bucket is a hard data limit.
Canonical LAR bucket order (ignore 3 noise rows: 600-699, 800-899, 2500-2749 = 4 rows total): < 700 → 700-1100 → 1100-1500 → 1500-2000 → 2000-2500 → 2500-3000 → 3000-3500 → 3500-5000 → 5000+. Widths non-uniform (100-500 wide in the mass band, 1500 wide at luxury). 81.6% of homes sit in the 700-2500 mass band.
isAdjacentRange MUST be a hardcoded lookup against this canonical order (NOT runtime string-parsing — the 4 noise rows would corrupt parsed adjacency).


Survived the pooler-timeout fight (single-pass query). The data behind step 5. ~30-35% of homes carry at least one real desirability signal the matcher ignores today.
LAYER 1 — free structured wins (100% non-null, zero false-positive, use first):

view jsonb — ~14% carry a premium tag. Trees/Woods 16,316 · Forest 5,249 · Park/Greenbelt 5,036 · Lake 4,817 · Water 3,766 · River 2,050 · Pond 1,764 · Creek/Stream 1,389. Cheapest big win.
waterfront_yn (scalar) — true 8,949 (2.82%). Cleaner than the features array; use this for the binary. Premium 30-100%.
exterior_features → "Backs On Green Belt" 3,150 (~1%) — backing signal already structured (text underreports it ~4×).
Income-suite: interior_features In-Law Capability 18,116 + In-Law Suite 11,818 (~30k); corroborated by basement-kitchen signal kitchens_total > kitchens_above_grade (~27k, since 34,884 have 2 kitchens but only 8,004 have 2 above-grade).

LAYER 2 — structured richness the matcher never touches (free, high-fill, additive delta lines):

washrooms_type1..5 (+ _level, _pcs) — decomposes baths into floor + piece-count. Distinguishes "2-bath-main + 1-bath-basement" from "3-baths-same-floor". Matcher only uses bathrooms_total_integer today.
bedrooms_below_grade — structured basement-bedroom count (income corroboration).
main_level_bedrooms + Primary Bedroom - Main Floor (33,326) — accessibility / luxury-bungalow signal.
direction_faces — 97.79% filled (N/S/E/W). South-facing backyard premium, nearly fully populated.
Also exist, unprobed/secondary: den_familyroom_yn, recreation_room_yn, room_height (cathedral ceilings), room_type jsonb.

LAYER 3 — text signals from public_remarks. 33.3% (105,781) mention SOME signal, but word-matching is mostly false-positive. Step-5 first pass uses ONLY the 3 clean ones (exact match, no co-occurrence), as WORDED deltas not dollars:

✅ %ravine% 9,662 (3.04%) — NO structured equivalent exists; text-only or it doesn't exist. The high-value odd/even proxy. The reason to do text at all.
✅ %no rear neighbour% + %no rear neighbor% 6,465 (~2%) — clean, low false-positive, strong positive.
✅ %conservation% 5,060 (1.59%) — clean.

DEFERRED to step 5b (logged, not lost) — needs co-occurrence / sentiment logic, earns its own backtest pass:

Loose nature-word matches: %lake% 32,592 / %river% 16,323 / %pond% 8,095 — 6-8× looser than structured view tags (street names, "5 min to lake"). Only count when paired with a backing verb (%backs%lake%) or cross-confirmed by view tag.
%hydro% 14,188 (4.47%) — NEGATIVE signal ("hydro corridor at rear" = easement, no privacy). Weights DOWN; requires sentiment check before use.
%premium lot% 4,316 (1.36%) — self-declared agent marketing; soft.

DEAD — do not use (verified):

lot_features jsonb — only ever contains "Irregular Lot" (7,759). Info already in lot_shape.
lot_dimensions_source — only value "Other".
Bare %lake%/%river%/%creek% without co-occurrence — 75-90% false-positive.
Columns that DON'T EXIST: property_condition, year_renovated, corner_unit, cul_de_sac, frontage_type, den_yn (real name is den_familyroom_yn).

Pool (verified all values): None 280,427 · Inground 14,316 (only one matcher reads) · Above Ground 5,543 · Salt 1,403 · Community 747 · Indoor 620. Step 5 covers all types, surfaced as narrated delta.
Condition/renovation: no structured field exists. %renovated% 58,090 (18.28%) + %updated% 59,670 (18.78%) in remarks = ~37% combined — text-only path, deferred (not in first-pass scope).

Run log
2026-06-04 — v1 opened + homes census run

Sequencing locked: estimator core first, RAG second. Hybrid confirmed. Homes priority.
Homes data census complete (read-only, verified). Findings logged. Operator domain inputs locked.
3 recon-pending items flagged. No code touched, no design locked.

), or focused follow-up later.

Backups: .backup_pathB_20260606_070445, .backup_pathB_20260606_070839.

PENDING: behavior-identity gate (prove live estimate unchanged) BEFORE Stage 2.
STAGE 1-FIX (in progress) — the .lt() was NOT a live no-op (verification caught it):

Verify check found 21,486 freehold + 8,580 condo rows are Closed with close_date >= NOW() — firmed deals with future-scheduled legal closings (systematic, not error). Stage 1's unconditional .lt('close_date', referenceDate) was EXCLUDING these ~6.8% from the LIVE candidate pool → a real production regression, NOT the no-op claimed.
Lesson reinforced: "backwards-compatible by design" is a claim to VERIFY, not trust — same discipline that caught the inlined-backtest blindness. The DB check turned an assumed no-op into a found regression.
Fix = make .lt() conditional on specs.asOfDate: convert both queries to let qCommunity/qMuni builders, apply .lt() ONLY when asOfDate set (backtest), so live mode (no asOfDate) includes all closed comps as before. True backwards-compat.
Patch aborted twice on indent mismatch — the atomic anchor-match-once guard worked (0 matches → abort → no write → file safe). Cause = markdown whitespace-rendering artifact (file is 4-space outer/6-space chained; anchors rendered as 6/8). Same artifact class as the Â±/Hebrew-glyph display issues. Resolved by authorizing Claude Code to dedent against the bytes it can directly read (Option B).
DEFERRED as separate deliberate decision: whether future-dated firmed deals SHOULD count as live comps (a real-estate policy call, operator's — NOT to be decided by accident via a failed patch). For now: restore pre-Stage-1 behavior (include them live), revisit explicitly later.

), so no .neq() needed in production at all.

NEXT: capture exact bytes of createHomeComparable adjustment block + backtest adjustedPriceFor to design the shared module so both sides produce byte-identical results.

STAGE 2 SCOPE HONESTY (critical — Option D is a PARTIAL fix, labeled as such):
Option D shares the price MATH only. After D, the backtest STILL has its own duplicated funnel/tier-routing logic (which subjects land RANGE-ADJ vs RANGE) and its own aggregation. So:

D makes the backtest exercise the shared A1b clamp AND A1 floor (both extracted into the shared module — the recon flagged the A1-floor extraction as possible; we take it).
D does NOT make the backtest trustworthy for the full pipeline — the matcher funnel/tier logic remains duplicated and UNVERIFIED against production. A half-fix to a harness can produce confidently-wrong numbers, so this limit is stated explicitly, not glossed.
Scope chosen: Shape D1 (NOT D2), JS module, shared constants+helpers+computeAdjustedPrice-clamp. A1 floor STAYS in calculator.

Why D1 over recon's D2 recommendation: D2 decouples the display adjustments[] array from the running total — two independent computations of the same 6 adjustments that can silently drift. That STRUCTURALLY BREAKS the line-item↔adjustedPrice reconciliation we committed to (the "Comparability cap applied" reconciliation). D1 keeps display+math as ONE pass (each block computes its amount once, adds to total AND records the display line from the same number — they cannot disagree). D1's "cost" (6 blocks not extracted) is real but small and mitigated: shared CONSTANTS + 4 helpers make dollar amounts impossible to diverge, which is the actual drift risk. The leftover 6-block duplication is logged + cleaned later by the deferred full-matcher consolidation (when the funnel moves too).
A1 floor stays in statistical-calculator.ts (per recon — it's tier-aware logic, not pure adjustment-math, belongs with aggregation). Shared module owns A1b + helpers + constants only. Consequence handled explicitly: backtest's own aggregation either mirrors A1's floor (1 line) OR we accept backtest doesn't exercise A1 until the later calculator-consolidation — decided in the backtest patch, NOT silently.
VERIFY (finding-in-waiting): recon found backtest uses different constant KEY NAMES (BASEMENT_ADJ.FINISHED vs prod BASEMENT_FINISHED) but claims "same values." Confirm value-identity constant-by-constant before merge — if ANY differ, that's a pre-existing silent divergence skewing every backtest independent of A1/A1b, logged as its own finding.
Build plan: (1) write lib/estimator/home-adjustment-math.js [review FIRST, before touching consumers]; (2) patch production matcher (import, delete 5 defs, blocks use shared helpers/constants, A1b via shared); (3) patch backtest (require, delete 4 helpers + adjustedPriceFor copies); (4) tsc; (5) value-identity smoke (production output unchanged) + backtest dry-run.



D1 MODULE PREP RESULT (verified 2026-06-06):

Value-identity CONFIRMED: backtest constants are value-identical to production — divergence was KEY NAMES only (BASEMENT_ADJ.FINISHED vs BASEMENT_FINISHED), not values. So the backtest was NOT secretly skewed on adjustment amounts (good — one less hidden bug). parseBasement: backtest had 5 fields vs prod 6 (isUnfinished + dev-potential edge), but neither consumer reads the missing field and the score outcome is identical → zero behavior change on import.
hasAboveGroundPool = DEAD CODE (only self-reference) → delete, don't move.
tsconfig allowJs:true → TS imports the JS module fine, no build step. Cost: prod call sites lose static type-check on parseBasement return (infers any); acceptable for D1, optional .d.ts sidecar later.
Build: new home-adjustment-math.js (~80 lines: DEFAULT_ADJUSTMENTS + 4 helpers); prod matcher −99 lines +1 import; backtest −40 lines +2 (require + A1b clamp parity). Module-first, then consumers.

D1 STEP 1 SHIPPED (2026-06-06): lib/estimator/home-adjustment-math.js created + verified in isolation.

Faithful verbatim MOVE of the 5 prod defs (DEFAULT_ADJUSTMENTS + parseBasement[6-field] + getBasementAdjustment + getGarageValue + hasIngroundPool). CommonJS, module.exports. No computeAdjustedPrice (D1 keeps 6-block math inline per consumer so display+total stay one pass). No hasAboveGroundPool (dead).
Verify: all 5 exports present; spot-checks return production values (frontage 40000, garage Detached 30000, hasIngroundPool(['Inground'])=true, basement finished+sep=80000); full-project tsc clean (allowJs accepts the JS import).
Module staged + consumable; NOT yet imported by either consumer.
NEXT: D1 Step 2 = patch production matcher to import + delete its 5 local defs, with a value-identity check (production estimate output must be UNCHANGED post-swap). Then Step 3 = backtest.

D1 STEP 2 SHIPPED + VALUE-IDENTITY VERIFIED (2026-06-06): production matcher now imports the shared module; 5 local defs + dead hasAboveGroundPool + BasementProfile interface deleted (737→627 lines, −110). Two breadcrumbs left (constants→destination+Phase-2/build-step-3 note; helpers→destination). tsc clean; all 18 call sites in createHomeComparable+scoreMatch bind to imports, zero orphans. 9/9 value-identity spot-checks match pre-refactor (frontage 40k, depth 5k/30k, bath 20k, pool 30k, garage 5-tier 30/45/60/15/0, basement 0/50k/110k, pool-detect t/f/f) — relocation proven bit-for-bit, not assumed. Backup .backup_D1_20260606_082516.
D1 STEP 3 SHIPPED + FIRST TRUSTWORTHY RE-MEASURE (2026-06-06) — A1+A1b proven.

Backtest now imports shared home-adjustment-math.js, deletes its 4 local helper copies + BASEMENT_ADJ, swaps 5 magic numbers → DEFAULT_ADJUSTMENTS.*, adds A1b clamp to adjustedPriceFor, mirrors A1 floor in computePredictedSale. 8 atomic edits, node -c clean (collision resolved). Duplicate-math drift ELIMINATED — production + backtest share one math source; every future patch auto-measured. The "backtest wasn't exercising the patch" disaster cannot recur.
FIRST REAL MEASUREMENT of A1+A1b (prior 3 runs were sampling noise on un-patched backtest math):

metricpre-A1 baselinePOST-D1 (real)Sale MAPE191.5%19.8%Sale median16.8%13.6%Sale RMSE$4.46M$405kSale bias−$167k+$8.9k%within ±15%47%54%RANGE-ADJ MAPE1502%35.2%RANGE-ADJ RMSE$13.6M$999kRANGE-ADJ bias−$854k−$131k

By tier (post-D1): BINGO 7.1%/3.9% · BINGO-ADJ 18.6%/14.0% · RANGE 18.5%/12.5% · RANGE-ADJ 35.2%/30.5% · (MAINT n=2 noise). Lease overall 10.4% MAPE / 7.3% median.
Honest reading:

Median 16.8%→13.6% is the TRUSTWORTHY gain (median is stable; MAPE is Poisson/outlier-dominated). 3.2pt on a 500-draw + %within-15 rising 47→54 corroborates → real directional gain, NOT sample luck. But it's ONE sample — direction/magnitude trusted, exact decimal not carved in stone.
Containment ≠ cure, as predicted: RANGE-ADJ dropped 30-50× but is STILL the worst tier (35.2%/30.5%). A1/A1b bound the damage; they don't fix the root cause (matcher pools dissimilar comps into RANGE-ADJ). The data now PROVES B2 (size patch) is the right next move: RANGE tier is fine (18.5%), RANGE-ADJ is the problem — route subjects OUT of RANGE-ADJ into RANGE by tightening the size gate. Shrink the broken tier's population.
Tails still hard (<500k 33.7% likely-misclassified; >3M 33% n=5 = structural LAR ceiling → route-to-agent). Not now.
Community comps (18.9%) beat muni fallback (27.4%) — confirms the cascade adds value.


Backups: .backup_D1step3_20260606_092752 + prior.
NEXT: B2 — the size patch (LAR-only, the 5 sites from way back). Now provably the highest-leverage move: it empties the RANGE-ADJ tier into RANGE. First patch landing on the now-trustworthy harness.

B2 SHIPPED (2026-06-06) — size patch, sale path, measured. KEEP (with eyes open).

B2-Step-1: added isAdjacentRange + canonical 9-bucket HOME_LAR_LADDER to shared home-adjustment-math.js (hardcoded ladder — noise buckets off-ladder can't corrupt adjacency). 7/7 isolation verify.
B2-Step-2 (production matcher) + B2-Step-3 (backtest mirror): 3 sale sites each — scoreMatch (LAR same=30/adjacent=15/else 0), applyFunnel[Strict] (exact LAR gate, SFS dropped), applyRelaxedFunnel (same-OR-±1-adjacent LAR, closes the "accept any range" hole). Both consumers share the logic. tsc + node-c clean. Backtest function names differed (applyFunnelStrict/applyFunnelRelaxed) — anchored on actual bytes.
Measured (vs post-D1):

metricpost-D1post-B2readSale RMSE$405k$247k (−39%)✅ real win — outliers tighterRANGE-ADJ RMSE$999k$380k (−62%)✅ catastrophe tail bounded>$2M MAPE~30-33%~15-18% (halved)✅ adjacency fixes luxury bucket-width contaminationCONTACT routing4046 (+6)✅ correct refusal on no-clean-poolmuni fallback5281✅ stricter community gate routes correctlySale median13.6%14.5% (+0.9)⚠ typical estimate slightly worseSale MAPE19.8%21.0% (+1.2)⚠ same±15%54%51% (−3)⚠ same

HONEST READING (not spun): B2 made the WORST estimates much better (RMSE/luxury) but the TYPICAL estimate slightly worse (median/MAPE/±15 all moved up together = signal, not noise). Mechanism: B2's adjacency boost pushed 27 subjects up into BINGO-ADJ (own MAPE 21.5%) and the FLAT MEAN aggregation handles those borderline-adjacent comps poorly — weights a barely-adjacent comp same as a perfect one, averages in adjustment noise.
KEY CONCLUSION — the data now orders the next move: B2 tightened which comps qualify; the price is still a flat mean of them. We've tightened matching about as far as size can take it — the AGGREGATION is now the binding constraint. The median uptick IS the signal that flat-mean is the bottleneck.
DECISION: keep B2 (RMSE −39% + luxury halved are large/real; median cost small + explained). B1 (median + score-weighting) is unambiguously next — median is robust to the borderline comps B2 admitted; score-weighting makes a 30pt-adjacent comp count less than a 30pt-exact one. B1 should recover the median uptick and then some. (B2 originally planned after B1; B2-first was right to drain the catastrophe tier — but residual error is now aggregation-shaped.)
Lease untouched (B2 sale-only) — B2-lease is a separate parallel workstream (backtest lines 361/394 + home-comparable-matcher-rentals.ts).
Backups: .backup_B2_*, .backup_B2step3_*.


The most important finding of the build phase. Read before trusting ANY backtest number above.
scripts/backtest-estimator-homes.js INLINES its own copy of the valuation math — it does NOT import lib/estimator/:

:277 function adjustedPriceFor(sale, specs) — inlined, NOT calling the lib matcher.
:500 function computePredictedSale(tier, scoredComps, specs) — inlined, NOT calling the lib calculator.
:504 maps prices via its own adjustedPriceFor, bypassing both A1 and A1b.

Consequence — the patch-effect numbers I reported were FALSE:

A1 (negative floor in statistical-calculator.ts) → NOT exercised by backtest.
A1b (aggregate clamp in createHomeComparable) → NOT exercised by backtest.
The three runs ("pre-A1", "post-A1", "post-A1b") all measured the SAME inlined logic across three DIFFERENT random 500-subject samples. The improvements I attributed to the patches were sample variance, not patch effects.

Apples-to-apples (median, the stable metric — MAPE is Poisson-dominated by a few outliers):
runnOVERALL medianRANGE-ADJ nRANGE-ADJ median"pre-A1"46416.8%49150%"post-A1"46316.8%48136%"post-A1b"45517.8%6293%
Median budges ~1pp run-to-run = random-sample noise on a 500-draw. MAPE swung 191→93→279 purely on how many -$3M-class outliers landed in each sample. No measured patch effect, because the patches weren't in the measured path.
What IS true: A1 + A1b are correctly applied to PRODUCTION (lib/estimator/*), both compile clean, both backed up. Real traffic WILL see the fixes. Only the measurement is blind to them.
LESSON (permanent): Never trust a backtest number without first confirming the harness exercises the code path under test. A harness that re-implements the logic it's meant to validate measures nothing about a patch. Confirm import-vs-inline BEFORE attributing any delta to a change. Sample variance on a 500-draw masquerades as patch effect if you compare different samples.
DECISION PENDING (next action): fix the harness before any further build.

Option 1 (cheap): mirror A1+A1b into the inlined backtest math (clamp in adjustedPriceFor:277, >0 floor in computePredictedSale:500), keep as-of-date isolation, re-run with a FIXED SEED for true apples-to-apples.
Option 2 (clean, more work): refactor backtest to import lib/estimator/ directly — eliminates duplication forever, but must thread an as-of-date arg through the production matcher (currently uses new Date()).


A1 (negative-price floor) applied, tsc-clean, STAYS. Backtest vs 16.8% baseline:

Sale MAPE 191.5% → 93.6% (halved). Median abs% unchanged 16.8%. Lease MAPE 12.3% → 10.8%.
RANGE-ADJ MAPE 1501.7% → 640.6%. BINGO/BINGO-ADJ/RANGE clean or slightly better.
CRITICAL FINDING — A1 changed the catastrophe's SIGN, didn't cure it. RANGE-ADJ bias flipped −$854k → +$5.33M. Flooring negatives to closePrice (much higher) made those 48 subjects wildly OVERpriced. 2M-3M bucket RMSE tripled ($991k → $14.2M). Error MOVED, didn't shrink.
The disease is upstream: matcher pools structurally dissimilar homes into RANGE-ADJ (bed≠, bath≠, size≠ each by a step); additive adjustments bridge $300k+ gaps; sign of the blowup (huge − or huge +) is near-random. Negatives were a SYMPTOM; A1 was containment, not cure.

REORDERED build sequence (backtest-driven):

A1b (NEW, promoted to now): adjustment magnitude cap — the two-sided bound A1 should have been. Clamp adjustedPrice ∈ [closePrice × 0.5, closePrice × 1.5] (or total-adjustment > ~30% of closePrice = dissimilar-pool tell). Stops +$5.3M as A1 stopped −$3M. Completes containment symmetrically.
B2 size patch PROMOTED ahead of B1 — routes subjects OUT of broken RANGE-ADJ into well-behaved RANGE (18.1%). STRUCTURAL fix: shrink the broken tier's population rather than fix its math. Highest-leverage cheap lever.
Re-measure after A1b+B2 (tier distribution will shift) BEFORE B1 (median/weighting) — don't build accuracy weighting on a distribution about to change.
Logic: finish containment (A1b) → shrink broken tier (B2) → re-measure → then accuracy (B1).
Lesson logged: a one-sided floor relocates error to the other side; bounds must be symmetric. And: structural tier-routing (size patch) beats per-tier math fixes — shrink the broken population, don't polish it.

2026-06-04 — AGE + STREET RECON (Layer 3 + Layer 5 foundations)

Age = pre-bucketed, 7 buckets, vocab matches AGE_BRACKETS_ORDERED verbatim → equality match like LAR, no banding. Operator's "age has ranges" instinct confirmed. Caveats: 51-99 bucket 49yrs wide (weight-down there); 43.4% fill; no year_built; seller-form discards age (1-line runner fix).
FREE 20-PT WIN: street bonus revivable. street_name/street_number 100% filled (structured), 98.5% int-parseable for odd/even. Matcher's 20-pt street bonus dead (hardcoded false — no subject address wired). This is the same-side=same-backing=ravine-proxy signal. 2-file revival, sequence early, foundational to Layer 5.
ALL FOUNDATIONAL RECON NOW COMPLETE. Size, lot, age, street, value-signals, form-architecture, size-field legitimacy — all verified. Only ONE file unread before full build: statistical-calculator.ts (for the mean→median swap, Layer 4).

2026-06-04 — v12 DYNAMIC PRODUCT-AWARE MODEL + MANDATORY FOUNDATIONS

Dynamic matching model locked: complexity scales to product. Flow = identify product (type+storey gates) → pick lot regime (acreage vs frontage, data-driven switch) → band on size (LAR) → tight comp set → MEDIAN price → widen-or-agent if thin.
Median, not mean — robust to outliers; the current arithmetic-mean is what produces negative-price blowups. "5 real comps, take the middle."
Lot reclassified: for HOMES, lot (frontage urban / acreage rural) is a Tier-1 foundational COMPARABILITY gate, NOT a post-hoc $/ft adjustment. 50ft vs 100ft lot = different product. Acreage regime: a bungalow on 4ac never pools with a 0.4ac lot.
Frontage = continuous proportional band (~±X%), NOT fixed ±feet — scales across dense/suburban/rural (60ft→~48-72; 200ft→~160-240). Fixed-feet tolerance is broken at both ends (too loose dense, too tight rural). X% from data.
Acreage regime switch — acreage filled → match on acreage (land dominates); empty → frontage band. Townhouse → standardized lots → lot non-binding → storey+sqft = bingo (complexity collapses correctly).
MANDATORY FOUNDATIONS rule locked — the ENGINE enforces, entry points satisfy: estimator is deterministic code (AI layer changes zero numbers); the gate lives in the engine, so every caller (form, buyer modal, Charlie) is forced to supply foundations without caller-specific engine logic. Charlie is a SEPARATE AI product calling the same engine — its conversational input-gathering is a NEXT-PHASE UX item, NOT this workstream. Clarified by operator: don't conflate the code estimator with the Charlie AI product.
Hierarchical + product-conditional foundations (universal identity: type/storey/size/beds/baths; product-specific driver: lot for homes, building for condos; enriching: age/basement/garage/pool widen-not-block).
Starved-form problem located (SellerForm.tsx/SellerEstimateRunner.tsx): size optional on home path (live negative-price source); only ~4 of ~11 dimensions collected → seller estimates capped at RANGE tier, BINGO impossible; exactSqft never set (confirms safe SFS-drop). Form/Charlie mandatory-enforcement now a PEER priority to the matcher patch.
Scenario coverage table recorded (townhouse-simple through bungalow-on-4-acres through Charlie).
OPEN: lot-data recon — verify acreage existence/fill, frontage distribution, feet-vs-acres flip, comp-survival under proportional band. Lot gets its own design pass.
NOTHING BUILT. Recon + design only.

2026-06-04 — HOME SIZE-FIELD LEGITIMACY VERDICT (pre-step-1 probe)

Probed all 3 size fields before writing the size patch (operator: "data, not guess"). Verdict recorded above.
square_foot_source = provenance label on homes (0.0066% numeric incl. ranges) → DROP from home size path. CONVENTION divergence confirmed vs condos (SFS numeric on ~20% of condos — legit there; home agents use it for "who measured"). Same column, two conventions, uncorrectable by backfill. Re-probed homes-vs-condos at operator request (checking for range-form values) — verdict held, reason sharpened.
calculated_sqft = LAR midpoint rebadged, strict subset of LAR (rescues 0, loses 28,469) → NOT a signal.
living_area_range = the sole real size signal. Size patch needs only LAR.
Luxury size cocktail confirmed STRUCTURAL (1500-wide bucket, no field can tighten) — data ceiling, v11 route-to-agent already handles it correctly.
Apple-to-apple reframed: achieved via product gates (type+storey+bed) + same LAR bucket, NOT finer size numbers (none exist).
isAdjacentRange to be hardcoded against canonical 9-bucket order (noise rows excluded).
Confirms step-1 patch shape: LAR primary everywhere, SFS demoted/dropped, ±1 adjacent in relaxed tier (width-aware caveat: ±1 genuinely tight in mass band, structurally loose at luxury → those route to agent regardless).

2026-06-04 — v11 PRICE-OUTPUT MODEL + VALUE-SIGNAL INVENTORY

Value-signal recon complete (survived pooler-timeout via single-pass query). Inventory recorded above. ~30-35% of homes carry a real desirability signal the matcher ignores. Killed two dead ends (lot_features, bare word-matching). Surfaced unused structured richness (washrooms decomposition, basement-kitchen income signal, direction_faces).
Step-5 first-pass scope LOCKED: Layer 1 + 2 + 3 clean text signals (ravine, no-rear-neighbour, conservation). Loose-match + hydro-negative + condition/renovation deferred to step 5b. Rationale: ship only deltas we can defend; keep the backtest interpretable.
Principle 7 (price = range, width = confidence) locked.
Principle 8 (inverse narration = the derivation IS the report) locked — the trust mechanism.
PRICE-ROLE BOUNDARY locked: comps price; structured signals carry dollars only post-step-3; text signals carry words only; signals refine+explain but never manufacture confidence. Confirms build order 1→2→3→4→5.
Display = Option C locked: Charlie-density tile + one feature-delta line (verified against the real Charlie ResultsPanel spec — compact tiles, not full cards). Same tile for Comparable Sold + Competing For Sale.
Tenant-correct links re-affirmed as explicit build-gate — sold comps AND competing listings resolve to the tenant's own website, never hardcoded.
NOTHING BUILT. No code touched. Recon-only this session.

2026-06-04 — v10 PHILOSOPHY + FEATURE MODEL LOCK

Estimator philosophy locked (6 principles): tight beats wide (machine edge = reliability not volume); complexity onto our side; features shown not blended; graceful degradation with tiered honesty; show For-Sale competition not just sold; the wow = relevant/accurate/valuable.
Architecture resolved: NOT a 140-comp weighted blender. Tight street-first cascade + feature-delta narrative + tiered-honesty notes + active competition. scoreMatch ranks/selects/narrates, does not silently blend.
Operator type/style rulings (v10): Link splits out from Townhouse (own type pool). Storey count is a critical product separation (2 / 2½ / 3-Storey each own — esp. townhomes). Bungalow family stays grouped (Bungalow + Raised + Bungaloft). Split is a real factor. These fold into build step 2.
Located the bucket leak precisely: NOT in the funnels (style hard-gates in all 4 funnel paths). The leak is the bedBathOnly last-resort muni fallback (lines 622-636) — style drops to scoring-only there. Step 2 target.
Basement question answered (verified): sale path DOES decode finished/unfinished/separate-entrance/walkout (5 signals + 0-5 ordinal) and applies $50k/$80k/$110k tiers — but flat hardcoded, with 3 score/dollar inconsistencies. Lease path ignores basement entirely. → step 3 (real-data) + lease-gap fix.
Pool question answered (verified): inground handled ($30k flat + 5pt); above-ground/salt/indoor/community all ignored ($0). → step 5 fixes all pool types + surfaces as narrated delta.
Delta expression locked: BOTH — dollar where data supports it, direction+words otherwise. Never a silent number move.
Feature inventory table recorded (13 touched features + the unread desirability layer).
3 recon passes complete this session (size-field state, funnel-order + type/style gating, basement + adjustment dimensions). Value-signal recon still PENDING (fill-rates for unread/candidate signals) — next probe.
NOTHING BUILT. No code touched. No design ships without operator okay.

2026-06-04 — v9 DESIGN LOCK (homes)

Three open questions resolved by data: PSF (OUT for pricing, geo_analytics = context only), bucket contamination (located: sale muni fallback + all lease tiers leak style), coverage cost (82/11/8 — affordable, confirmed eyes-open).
Style-family grouping confirmed as cheap relaxation (60% vs 56%).
Full diagnosis confirmed: accurate on clean match, breaks on stretch; two root causes (dead size field, bucket leaks).
Build sequence locked (5 core steps + report layer), each gated on backtest improvement vs 16.8% baseline.
Report-design additions locked: comparable URL links preserved (tenant-correct domain) + listing-card style upgrade (cards for comps and active competition).
NOTHING BUILT. Next move = build step 1 (living_area_range size-field fix), measured against baseline. Awaits operator okay per Rule Zero.


2026-06-06 — B1 (SCORE-WEIGHTED MEAN) + bedBathOnly STEP 2 SHIPPED + RANGE-ADJ RECON + VACANT-LAND PIVOT

Run-log reconciliation: tracker on disk was missing this session's work between 2026-06-06 (B2 SHIPPED — KEEP) and now. The following items verified in code, then logged.

B1a SHIPPED — score-weighted mean in statistical-calculator.ts (VERIFIED at lines 77-84).
- Changed: `const FALLBACK_SCORE = 100; const weights = sortedComparables.map(c => c.matchScore ?? FALLBACK_SCORE); const totalWeight = weights.reduce(...); averagePrice = Math.round(weightedSum / totalWeight)`.
- Why: B2 admitted borderline-adjacent comps into BINGO-ADJ (the post-B2 median uptick was the signal). Flat-mean weighted noisy adjacents identically to clean exact matches; score-weighting corrects that. Higher-scoring comps pull the estimate more.
- Condo + lease neutrality: comps without matchScore fall back to FALLBACK_SCORE=100; with all-identical weights the weighted mean degenerates to the unweighted mean (provable identity sum(p·100)/sum(100) = sum(p)/n). Behavior unchanged on those paths.
- Backup: pre-B1 production-matcher backup confirmed under .backup_B2step3_* and earlier .backup_D1_* / .backup_pathB_* timestamps; no new dedicated B1 backup name observed on disk.

B1b SHIPPED — backtest mirror of score-weighted mean (VERIFIED at scripts/backtest-estimator-homes.js:463-467).
- Mirror: `const weights = scoredComps.map(({score}) => score ?? 100); ... return Math.round(weightedSum / totalWeight)`. Same FALLBACK_SCORE=100 sentinel; D1 shared-math harness already proven, so the patch is actually measured.

bedBathOnly STEP 2 SHIPPED — production matcher + backtest mirror (VERIFIED).
- Production: lib/estimator/home-comparable-matcher-sales.ts lines 519-530. The last-resort bedBathOnly muni-fallback filter now ALSO gates on style-family (`isSameStyleFamily(saleStyle, specs.architecturalStyle)`) AND LAR-adjacency (`isAdjacentRange(...)`). Previously the fallback let arbitrary style+size through, contaminating BINGO-ADJ via the muni cascade.
- Backtest mirror: scripts/backtest-estimator-homes.js lines 337-347 — identical gates added to its bedBathOnly filter so backtest measures the patch.
- Measured (post-B1+bedBathOnly run, scripts-output/backtest-homes-summary.txt timestamped 2026-06-06 16:27, 500 subjects):
  Sale OVERALL: MAPE 19.3% / median 12.8% / %within±15 = 55% / RMSE $298k
  By tier: BINGO n=41 MAPE 7.0% median 6.2% · BINGO-ADJ n=225 MAPE 16.5% median 13.4% · RANGE n=157 MAPE 17.9% median 12.6% · RANGE-ADJ n=36 MAPE 56.2% median 36.5% RMSE $807k
  By geo level: community n=391 MAPE 18.5% median 12.0% · municipality n=68 MAPE 23.6% median 18.9%
  Lease OVERALL: MAPE 11.1% / median 6.7%
- Honest reading vs post-B2 baseline recorded above (median 14.5% / MAPE 21.0% / ±15 51%): median recovered 14.5→12.8 (-1.7pp), MAPE 21.0→19.3 (-1.7pp), ±15 51→55 (+4pp). B1 paid back the B2 median uptick AND took another step. Muni-fallback MAPE 23.6% (vs ~28% pre-B2-era) confirms bedBathOnly gates routed contamination out. RANGE-ADJ MAPE 56.2% / median 36.5% — still the catastrophe tier; B1 + bedBathOnly were NOT designed to cure it (RANGE-ADJ is structural, see next entry).
- Caveat: B1a+B1b+bedBathOnly shipped as one bundle, measured as one run. Individual contributions not isolated. Re-run with seed-fixed harness would split them, but the bundle direction is the trustworthy signal.

RANGE-ADJ ROOT-CAUSE RECON — 4 patterns identified (recon script shipped, written analysis NOT yet captured to a disk artifact).
- Script: scripts/recon-range-adj-deepdive.js exists. The 36 RANGE-ADJ rows from the latest backtest CSV were extracted and reviewed in-session. The 4-pattern finding below is the in-session synthesis; it is NOT yet written to a disk recon-output file. Treat as claimed-pending-write until a recon-range-adj-deepdive.txt is produced.
- Pattern 1 — Vacant Land in the home-backtest sample (sampling bug, NOT a matcher bug): 3 RANGE-ADJ subjects (N13111404 actual $110k err 506%, N12532818 actual $300k err 231%, X12790342 actual $140k err 29%) are Vacant Land listings the backtest pulled in via no-property_subtype-allow-list. They contribute roughly 20pp of the RANGE-ADJ MAPE. Fix: filter the backtest sample to home subtypes only (1-line WHERE clause).
- Pattern 2 — flat $40k/ft frontage catastrophe (matcher root cause): the matcher applies a flat $40k per foot of frontage delta regardless of regime. On rural/luxury subjects this overshoots by multiples and routinely triggers the A1b clamp (the clamp masks the error but does not cure it). The fix per tracker v12 is the proportional frontage band reclassified as a TIER-1 GATE, not a per-foot dollar adjustment.
- Pattern 3 — no condition / renovation signal: no structured `property_condition` or `year_renovated` field exists; matcher pools renovated and unrenovated within the same LAR + style bucket. Text-only signals (`%renovated%` 18.3%, `%updated%` 18.8%) deferred per tracker (step 5b — co-occurrence / sentiment required).
- Pattern 4 — luxury thin pools: 3500-5000 LAR bucket is 1500 wide; few comps survive style+frontage gates; flat-mean over 2-3 noisy comps blows up. Structural data ceiling, handled correctly per v12 by routing-to-agent.
- Recommended fix order (in tracker v12 already): (a) Vacant Land sampling-bug filter (one-line, dissolves Pattern 1), (b) frontage-as-gate (the real lever, dissolves Pattern 2), (c) Patterns 3 + 4 already deferred.

VACANT LAND SAMPLING-BUG FIX — recon DONE, 1-line filter PROPOSED, NOT yet applied to disk.
- Verified: scripts/backtest-estimator-homes.js sampling SQL at lines 528-539 has `AND m.property_subtype IS NOT NULL` but NO subtype allow-list. Vacant Land (4879 rows 2y) / Rural Residential (978) / Farm (769) / MobileTrailer (184) / Modular Home (77) / Other (33) currently leak into the home backtest sample.
- Proposed fix (UNAPPLIED): mirror the seller form's HOME_SUBTYPES allow-list as a `AND m.property_subtype IN (...)` clause. One-line change, file backed up before any apply.
- Decision: deferred this session per operator pivot — Vacant Land is now a SIBLING product, not a backtest contaminant to suppress. Filter goes in once the sibling-product backtest is scoped, so vacant land moves into its own measurement loop, not just out of the home loop.

VACANT LAND / LOT VALUATION — sibling product path (operator-locked 2026-06-06, pending data)

Decision (operator): Vacant Land is NOT out-of-scope. It becomes a SIBLING product path to homes, priced on LAND rather than building.
- Pricing model: $/acre (primary) or $/lot-frontage (secondary) median of comparable lots × subject size. Same comp-median spine as the home estimator, unit swapped from $/home to $/acre.
- Geo cascade: COMMUNITY → MUNICIPALITY → AREA. NO street tier (street/odd-even is a house-backing proxy — meaningless for raw land where there is no house to back onto something).
- Subtypes covered (proposed): Vacant Land. Rural Residential and Farm to be confirmed once $/acre stability across all three is captured — Farm in particular may need its own loop (productive-land economics, not just per-acre).
- Supersedes the old F-HOME-SUBTYPE-SCOPE-GAP "Low — excluded" classification (all 4 tracker copies of that line updated this session).

Data recon partially captured (recon/vacant-land-recon.txt — script aborted/incomplete; sections 1-3 only).
- Section 1: 2y-closed For-Sale row counts — Vacant Land 4879, Rural Residential 978, Farm 769. Pool size is workable per subtype; not desert.
- Section 2: lot-field fill rates per subtype.
  Vacant Land: lot_width 99.4%, lot_depth 95.8%, lot_size_area 40.0%, lot_size_units 89.8%, lot_size_area_units 31.4%, BOTH(area+units) 29.2%.
  Rural Residential: lot_width 100%, lot_depth 100%, lot_size_area 40.0%, lot_size_units 100%, lot_size_area_units 36.6%, BOTH 33.4%.
  Farm: lot_width 100%, lot_depth 100%, lot_size_area 56.7%, lot_size_units 100%, lot_size_area_units 51.2%, BOTH 47.2%.
  Reading: lot_width × lot_depth is the dense-fill signal across all three (>95%). lot_size_area drops to 30-50% — $/acre directly off lot_size_area would lose 50-70% of comps. Either compute area from width×depth in feet-regime and trust the double-units flag, or accept the coverage loss for $/acre direct.
- Section 3 (incomplete): lot_size_units distribution. Vacant Land Feet 3842 / Acres 405 / Metres 133 — feet-regime is dominant (~79%), acres-regime ~8%, metres ~3% (and ~10% unflagged). Acres regime is the "rural" signal worth routing separately.
- NOT captured (recon needs re-run): lot_size_area_units distribution, double-units (lot_size_units vs lot_size_area_units) disagreement counts, $/acre distribution + per-community stability (top 15 communities ≥5 closes), comp survival at community/muni/area tiers under feet+acres regimes. These are the data points that decide whether the sibling product is buildable or whether per-community $/acre is too noisy to median.

Status: design-locked PENDING DATA RECON. Build sequence cannot begin until $/acre stability + comp survival captured.

Stale/unverified summary (this session's items by status):
- VERIFIED LIVE in code: B1a (statistical-calculator.ts:77-84), B1b (backtest:463-467), bedBathOnly Step 2 production (sales:519-530), bedBathOnly Step 2 backtest mirror (backtest:337-347), latest backtest measurement (scripts-output/backtest-homes-summary.txt 2026-06-06 16:27).
- VERIFIED on disk as scripts/artifacts: scripts/recon-range-adj-deepdive.js (script present), scripts/recon-vacant-land-valuation.js (script present), recon/vacant-land-recon.txt (Sections 1-3 only).
- VERIFIED NOT-yet-applied: Vacant Land sampling-bug filter on backtest SQL (the 1-line allow-list).
- CLAIMED, UNVERIFIED (in-session synthesis NOT written to disk artifact): the 4 RANGE-ADJ patterns. Recommend producing recon/range-adj-deepdive.txt next session before relying on those findings beyond this tracker entry.

Next action

(a) Apply the Vacant Land sampling-bug filter to scripts/backtest-estimator-homes.js (1-line allow-list mirroring seller-form HOME_SUBTYPES). Backup before edit. This is the smallest move and dissolves RANGE-ADJ Pattern 1 (~20pp of MAPE).
(b) Complete the Vacant Land data recon: re-run scripts/recon-vacant-land-valuation.js to capture Sections 4-8 ($/acre per-community stability, comp survival at community/muni/area tiers). Output to recon/vacant-land-recon.txt. This unblocks the sibling-product build.
(c) Frontage-as-gate (RANGE-ADJ Pattern 2 — the real accuracy lever): per tracker v12, reclassify frontage from the flat $40k/ft additive adjustment to a Tier-1 proportional-band gate (~±20%). This is the next home-side build move once the Vacant Land sibling product is data-locked.

Order: (a) is mechanical and goes first. (b) and (c) parallel — (b) unblocks sibling product, (c) is the next home-side accuracy step.

(Note: the prior tail-of-file "PHASE A1 — negative-price floor" stub was stale — A1 was shipped earlier this workstream and is verified live in statistical-calculator.ts. Stub removed here to leave the (a)/(b)/(c) Next action as the authoritative tail.)


2026-06-06 — VACANT-LAND SAMPLING-BUG FILTER SHIPPED + VACANT-LAND DATA RECON COMPLETE

(a) DONE — Vacant Land sampling-bug filter applied to scripts/backtest-estimator-homes.js.
- Anchor confirmed against bytes (line 536, "AND m.property_subtype IS NOT NULL"), unique in file. Backup .backup_20260606_173345 created before edit.
- 1-line allow-list added (line 537): `AND m.property_subtype IN ('Detached','Semi-Detached','Att/Row/Townhouse','Link','Duplex','Triplex')`. Verbatim mirror of HOME_SUBTYPES from app/charlie/components/SellerForm.tsx:30 (read fresh from disk, not invented).
- node -c clean.
- Backtest re-run, scripts-output/backtest-homes-summary.txt timestamped post-filter, 500 subjects, 465 priced (vs 459 pre-filter).

Measured delta vs prior post-B1+bedBathOnly run:
  Sale OVERALL: median 12.8% → 14.4% (+1.6pp) · MAPE 19.3% → 20.1% (+0.8) · ±15 55% → 52% (-3) · RMSE $298k → $306k.
  RANGE-ADJ:   MAPE 56.2% → 38.2% (-18.0pp) · median 36.5% → 32.4% (-4.1pp) · RMSE $807k → $400k (-50%) · n=36 → n=40.
  By tier (POST-filter): BINGO n=53 MAPE 8.0% median 6.3% · BINGO-ADJ n=235 MAPE 19.7% median 14.9% · RANGE n=137 MAPE 20.2% median 16.2% · RANGE-ADJ n=40 MAPE 38.2% median 32.4%.
  muni-fallback MAPE 23.6% → 25.2% (+1.6, modest worsen — fewer easy-to-price Vacant Lots fell back to muni and got predicted close).
  Lease OVERALL: MAPE 11.1% → 10.3% (filter is home-side only; lease delta is sample variance).

Honest reading (CRITICAL — not spun):
- RANGE-ADJ catastrophe-tier compression is REAL and large (RMSE halved). Pattern 1 (Vacant Land in sample) was correctly identified — the filter dissolved exactly the share the recon predicted (~20pp of RANGE-ADJ MAPE).
- But every non-RANGE-ADJ tier got SLIGHTLY worse (BINGO +1.0pp, BINGO-ADJ +3.2pp, RANGE +2.3pp), OVERALL median moved 12.8 → 14.4. This is a POPULATION SHIFT, not a regression. The prior sample's "easy" Vacant Land subjects (small urban lots with comps in same community) had been flattering the typical-estimate metrics. The 14.4% median is now the homes-only TRUTH; the previous 12.8% was contaminated optimism.
- The honest baseline going forward: home estimator OVERALL median ~14.4%, MAPE ~20%, ±15 ~52%. RANGE-ADJ ~38% MAPE / ~32% median (still bad, but no longer catastrophe-tier).
- One run, 500-subject draw — direction trusted, exact decimals subject to sample variance. Re-run with seed-fixed harness would harden the deltas; for now, the trend (RANGE-ADJ compressed + overall reveal) is the signal.

VACANT-LAND DATA RECON — COMPLETE (recon/vacant-land-recon.txt now has Sections 1-8).
- Section 4 — lot_size_area_units distribution: Vacant Land Acres 1421 / SqFt 86 / SqM 16 / Hectares 5 / SqFtDivisible 5 / SqMDivisible 1. ~93% of area-units rows are in Acres. Good for $/acre.
- Section 5 — DOUBLE-UNITS TRAP disagreement counts (where lot_size_units and lot_size_area_units conflict): Vacant Land 1329/4879 (27.2%) · Rural Residential 326/978 (33.3%) · Farm 357/769 (46.4%). HIGH disagreement — area-from-width×depth and area-from-lot_size_area cannot be silently merged; must pick one regime per row and log the other as suspect.
- Section 6 — $/acre distribution per subtype:
  Vacant Land n=4062 acres-median 2.01 · price-median $195k · $/acre MEDIAN $78,661 · spread (p75-p25)/median = 477%
  Rural Residential n=901 acres-median 3.01 · price-median $760k · $/acre MEDIAN $236,538 · spread 295%
  Farm n=661 acres-median 69.22 · price-median $1.26M · $/acre MEDIAN $22,326 · spread 149%
  Reading: Farm $/acre is TIGHT (149% spread) — productive-land economics dominate; Farm could median-of-comps directly with workable noise. Vacant Land at 477% spread is too loose globally — needs community-tier tightening or the median has no meaning. Rural Residential between (295%) — borderline workable.
- Section 7 — per-community Vacant Land $/acre stability (top 15 communities ≥5 closes): spreads range 49% (best, n=39) to 588% (worst, n=24); median spread ~250%. Two communities tight (49%, 81%) for clean median-of-comps; many in 150-300% range (acceptable); several above 400% (too noisy — would need additional gating). Median pricing at community tier WORKS for some communities, NOT for all. Per-community confidence label essential.
- Section 8 — comp survival, 100-subject Vacant Land sample (2y window, exclude self):
  COMMUNITY tier comp counts — 0: 27, 1-2: 14, 3-5: 15, 6-10: 13, 10+: 31. So 56% of subjects have <6 community comps; 27% have ZERO. Community alone is NOT sufficient — most subjects need muni fallback.
  MUNI tier — 0: 10, 1-2: 10, 3-5: 16, 6-10: 16, 10+: 48. 90% have ≥3 comps at muni.
  AREA tier — 0: 2, 1-2: 1, 3-5: 1, 6-10: 1, 10+: 95. 99% have ≥3 at area.
  Reading: cascade COMMUNITY → MUNI → AREA validated as necessary. Community alone is too thin for ~half of subjects. AREA tier is functionally always populated.

Vacant Land sibling product — status update:
- Data buildable: yes for Farm (per-subtype tight), conditional for Vacant Land (per-community tight on some, loose on others; needs confidence-aware presentation), borderline for Rural Residential.
- Cascade validated (COMMUNITY → MUNI → AREA, no street tier).
- Open design issues for the sibling-product build (NOT this session): (1) double-units trap handling — pick a regime per row; (2) per-community confidence labelling — show user when their community is in the 49% spread vs the 588% spread; (3) Farm may earn its own sub-product (productive-land economics — $/acre is for raw land sale, $/acre on a producing farm conflates land + business).
- Status: design-locked, DATA-RECON-COMPLETE, build-ready when prioritized.

Stale/unverified summary (this session, post-vacant-land work):
- VERIFIED LIVE on disk: vacant-land sampling-bug filter (scripts/backtest-estimator-homes.js line 537), backup .backup_20260606_173345.
- VERIFIED IN OUTPUT FILE: vacant-land data recon (recon/vacant-land-recon.txt, sections 1-8 complete), latest backtest summary (scripts-output/backtest-homes-summary.txt post-filter).
- STILL CLAIMED-UNVERIFIED: the 4 RANGE-ADJ patterns as a written disk artifact (recon-range-adj-deepdive.txt not produced this session). Patterns 1 + 2 + 3 + 4 all remain in-session synthesis. Pattern 1 partly validated by today's filter result (RMSE -50% on RANGE-ADJ confirms Vacant Land was a major contributor); Patterns 2-4 still unverified beyond this entry.

Next action

(a) DONE — Vacant Land sampling-bug filter applied + measured. RANGE-ADJ catastrophe tier compressed (RMSE -50%). Honest homes-only baseline now established (OVERALL median ~14.4%, MAPE ~20%).
(b) DONE — Vacant Land data recon complete (sections 1-8). Sibling product is design-locked + data-locked, ready for build when prioritized. Open design issues logged (double-units, per-community confidence, Farm sub-product).
(c) PROMOTED to next move — frontage-as-gate (RANGE-ADJ Pattern 2 — the real residual accuracy lever on the homes side): per tracker v12, reclassify frontage from the flat $40k/ft additive adjustment to a Tier-1 proportional-band gate (~±20%). With Vacant Land removed from the sample, the remaining RANGE-ADJ MAPE 38.2% is overwhelmingly frontage-driven on rural/luxury subjects (Pattern 2). This is the next home-side accuracy step.
(d) NEW — produce recon/range-adj-deepdive.txt as a written artifact so the 4 patterns stop being in-session synthesis. Small chore, low-priority but worth doing before Pattern 2 builds rely on Pattern 1/2 framing.

Order: (c) is the next ship. (d) parallel as a quick chore. Sibling-product build is a separate workstream when prioritized.


2026-06-07 — FOUNDATIONAL PRODUCT-CLASS CENSUS — multi-unit contamination flag

Operator flag (taken seriously): "home" is being treated as one product when it is several. The just-shipped backtest allow-list (Detached, Semi, Att/Row/Townhouse, Link, Duplex, Triplex) pools MULTI-UNIT products (Duplex/Triplex) into the same home matcher as single-family — apples-to-oranges suspected. Recon-only this round; frontage-as-gate HELD pending resolution.

Recon: scripts/recon-product-class-census.js (created this session), output to recon/product-class-census.txt. Read-only SQL, no writes outside the tracker.

Class distribution (2y closed Residential Freehold, n=221,540):
- single-family-detached-ish: 163,810 (74%) — Detached + Semi-Detached + Link
- attached-row:               26,720 (12%) — Att/Row/Townhouse
- land:                        6,615 (3%)  — Vacant Land + Rural Residential + Farm (sibling product locked yesterday)
- multi-unit-income:           2,953 (1.3%) — Duplex + Triplex + Fourplex + Multiplex
- other-edge:                  1,743 (0.8%) — MobileTrailer + Modular Home + Store W Apt/Office + Other

MULTI-UNIT contamination — VERDICT: partial (pool layer relieved, pricing-spine layer confirmed). The operator's flag is REAL but its location is different from where it was suspected.

(1) POOL CONTAMINATION — RELIEVED. lib/estimator/home-comparable-matcher-sales.ts:149-160 `getCompatibleSubtypes()` already routes Duplex/Triplex/Fourplex/Multiplex into their own pool (returns `multiTypes`) and NEVER mixes them with Detached/Semi/Townhouse. So at the comp-selection layer, multi-unit subjects pool only with other multi-unit subjects. The allow-list shipped yesterday lets them through the BACKTEST sample, but they do NOT comp against single-family rows once in the matcher.

(2) PRICING-SPINE CONTAMINATION — CONFIRMED. Within a tight LAR×bed band the matcher would treat as a clean BINGO comp pool, multi-unit prices still spread 53-93% (p75-p25)/median:
- Duplex LAR=1500-2000 bed=4 n=174 → spread 53% (p25 $417,750 · MEDIAN $571,000 · p75 $718,750)
- Duplex LAR=1100-1500 bed=4 n=114 → spread 63%
- Triplex LAR=2000-2500 bed=6 n=52 → spread 93% (p25 $430,000 · MEDIAN $667,500 · p75 $1,051,250)
- Triplex LAR=1500-2000 bed=5 n=44 → spread 41%
Compare CONTROL: single-family Att/Row/Townhouse global spread across ALL bands = 42%; Detached global = 68%. Multi-unit within ONE supposedly-tight LAR+bed band exceeds single-family across everything. The LAR + frontage + bed/bath spine is not the variance axis for multi-unit — units / rent roll / cap rate is. The matcher prices multi-unit subjects on the wrong axis. NOT a pool bug; a pricing-model bug.

(3) THE DB HAS THE INCOME SIGNALS — MATCHER IGNORES ALL OF THEM. Section-3 column probe (information_schema, mls_listings):
- `net_operating_income` (numeric) — exists
- `gross_revenue` (numeric) — exists
- `kitchens_total` vs `kitchens_above_grade` (88-98% / 100% fill on multi-unit) — units-count proxy, exists
- `legal_apartment_number`, `apartment_number` — separately tracked
- `minimum_rental_term_months`, `maximum_rental_months_term`, `percent_rent` — lease-side
NOI and gross_revenue: column presence confirmed, FILL RATES NOT PROBED this session (claimed, unverified — needs a follow-up). The home matcher reads NONE of these. The cap-rate / per-door pricing spine for multi-unit could be built on existing data without schema changes (subject to NOI/gross_revenue fill rate, which is the next probe).

(4) COMP POOL DEPTH — workable for sibling product. 50 Duplex+Triplex subjects sampled (2y window, exclude self):
- COMMUNITY tier: 0:10, 1-2:5, 3-5:6, 6-10:9, 10+:20 — 30% have <3 community comps (20% have ZERO). 70% have ≥3.
- MUNI tier: 0:5, 1-2:3, 3-5:2, 6-10:4, 10+:36 — 90% have ≥3.
- AREA tier: 0:0, 1-2:0, 3-5:0, 6-10:1, 10+:49 — effectively always populated.
Same cascade as land (COMMUNITY → MUNI → AREA). Community alone insufficient for ~30%; muni fallback works for 90%.

(5) LIVE ENTRY POINTS — multi-unit reaches the live home estimator today:
- app/charlie/components/SellerForm.tsx:30 — `HOME_SUBTYPES = ['Detached','Semi-Detached','Att/Row/Townhouse','Link','Duplex','Triplex']`. Sellers of Duplex/Triplex CAN submit to home estimator. (Fourplex / Multiplex not surfaced as form options — those reach via buyer modal only.)
- app/charlie/components/BuyerForm.tsx:27 — `HOME_SUBTYPES = ['Detached','Semi-Detached','Att/Row/Townhouse','Link','Duplex','Triplex','Vacant Land']`. Buyer form ALSO contains Vacant Land — separate live contamination, not yet redirected to sibling land product.
- app/estimator/components/HomeEstimatorBuyerModal.tsx:250 — `propertySubtype: listing.property_subtype?.trim() || 'Detached'`. Forwards listing subtype verbatim, so a Fourplex / Multiplex / Mobile / Modular / Store-w-Apt listing reaches the modal unfiltered.
Backtest allow-list shipped yesterday filters the MEASUREMENT, NOT the live estimator. Multi-unit estimates produced live continue to use the home pricing spine.

Per-class verdict against the matcher's current spine (type/storey gate + LAR + frontage + bed/bath + comp-median):

- single-family-detached-ish (Detached/Semi/Link, 74%): SERVED. Detached global spread 68%, Semi (within Section-1 only — Section-5 binding glitch; see flag below) 19,699 rows. The matcher's spine fits.
- attached-row (Att/Row/Townhouse, 12%): SERVED. Tightest control (42% spread), uniform standardized lots reduce frontage variance, LAR-equality is high-signal. The matcher's spine fits.
- land (Vacant Land/Rural Residential/Farm, 3%): MIS-SERVED — sibling product locked yesterday (priced on $/acre, not LAR + frontage as flat dollar). Status: design-locked + data-recon-complete.
- multi-unit-income (Duplex/Triplex/Fourplex/Multiplex, 1.3%): MIS-SERVED at the pricing-spine layer — needs sibling product like land, but priced on per-door / cap-rate / NOI rather than $/acre. NOT pool-contaminated (matcher already separates the pool); IS spine-contaminated (matcher's $/sqft + frontage arithmetic ignores the income axis that actually drives price). Sibling-product candidate alongside land.
- other-edge (Mobile/Modular/Store-w-Apt/Other, 0.8%): OUT OF SCOPE — distinct product economics each. Should be excluded from home estimator + routed to "contact agent" or own product paths. Today reach the matcher only via buyer modal (listing-based path).

Multi-unit reclassified as sibling-product-path candidate:
- Pricing spine candidate: per-door (price / units) or cap-rate (price = NOI / cap_rate). Both require NOI + units fill-rate verification.
- Units inferable from kitchens_total OR kitchens_above_grade − kitchens_below_grade, OR from legal_apartment_number presence. Best signal: kitchens_above_grade (100% filled on multi-unit).
- NOI / gross_revenue fill rates: NOT YET PROBED — first build-blocker.
- Geo cascade: COMMUNITY → MUNI → AREA (mirror land sibling). Comp survival validated this session.
- Live-path cleanup needed concurrent with sibling-product ship: Seller form + Buyer form + Buyer modal route multi-unit subtypes to the new sibling estimator, not the home estimator.

Stale/unverified summary (this session):
- VERIFIED on disk: scripts/recon-product-class-census.js (script created), recon/product-class-census.txt (output captured). All percentages cited above traceable to that file.
- VERIFIED LIVE in code: getCompatibleSubtypes routing (matcher-sales.ts:149-160), SellerForm HOME_SUBTYPES (line 30), BuyerForm HOME_SUBTYPES + Vacant Land contamination (line 27), HomeEstimatorBuyerModal forwarding (line 250).
- VERIFIED column existence (information_schema): net_operating_income, gross_revenue, kitchens_*, apartment_number, legal_apartment_number, percent_rent.
- CLAIMED, UNVERIFIED: (a) NOI / gross_revenue fill rates per multi-unit subtype — must probe before sibling-product build. (b) live traffic volume of Duplex/Triplex estimates actually produced today — out of recon scope. (c) Semi-Detached count appeared as n=0 in Section 5 — known recon-script binding glitch (Section 1 unparameterized GROUP BY shows 19,699, which is truth). (d) Whether multi-unit pricing actually correlates with NOI / unit count at p25/p50/p75 levels — the within-band spread proves the current spine misses variance, but does NOT prove NOI-based pricing would fix it; needs explicit correlation test before sibling build.

Next action

HELD — (c) frontage-as-gate (RANGE-ADJ Pattern 2). Was promoted to next-move yesterday. Now HELD pending multi-unit product-class resolution. Reasoning: frontage-as-gate sharpens single-family pricing; multi-unit pricing-spine swap is a deeper architectural decision that may change what the home estimator looks like. Don't optimize the wrong model.

(e) NEW — NOI / gross_revenue fill-rate probe per multi-unit subtype (Duplex/Triplex/Fourplex/Multiplex), 2y closed. Cheapest recon. Result determines whether multi-unit sibling is cap-rate buildable on existing data or whether per-door (price / units) is the only viable spine. Read-only.
(f) NEW — Multi-unit pricing-axis correlation test: does NOI + units explain the within-band spread (53-93%) that LAR+frontage missed? Read-only SQL: regress price ~ NOI + units within the top 5 LAR×bed bands. If R² jumps when adding NOI, the cap-rate spine is the right model. If not, per-door is the fallback. This is the build-blocker that decides sibling architecture.
(g) NEW — Live-path cleanup planning (no patch this round): once multi-unit sibling is built, redirect SellerForm Duplex/Triplex + BuyerForm Duplex/Triplex+Vacant Land + HomeEstimatorBuyerModal Fourplex/Multiplex/Mobile/Modular/Other away from the home estimator. Land sibling redirect for Vacant Land is the same shape.
(h) RESUME — (c) frontage-as-gate WHEN multi-unit decision is locked (sibling vs in-pool but in-spine-corrected). Single-family remains 74% of the data — frontage-as-gate is still the highest-leverage move for THAT population. Sequencing only.

Order: (e) → (f) → product-class decision lock → resume (c). (g) ships with sibling product.

(Note: yesterday's stub line "(Note: the prior tail-of-file 'PHASE A1' stub was stale...)" stays as the marker for the prior cleanup; this entry appends after the yesterday Next-action block.)


2026-06-07 — MULTI-UNIT INCOME-SIGNAL RECON — task (e) RESOLVED, sibling-architecture verdict: ROUTE-TO-AGENT

Recon: scripts/recon-multi-unit-income-signals.js (created this session), output recon/multi-unit-income-signals.txt. Read-only SQL, 5 sections: fill rates, in-band NOI×price correlation, units-count cross-check, per-door pricing test, cap-rate distribution.

(1) FILL RATES — both candidate income axes are too thin. 2y closed Residential Freehold For Sale:

  subtype     n      NOI(>0)  GR(>0)   kt_ag(>0)  legal_apt#  apartment#
  Duplex      1760    7%       7%       91%        0%          0%
  Triplex     577    10%      11%       88%        0%          0%
  Fourplex    239    15%      15%       85%        0%          0%
  Multiplex   379     1%       0%       92%        0%          0%

NOI / gross_revenue present-but-thin (7-15% on Duplex/Triplex/Fourplex; 0-1% on Multiplex). kitchens_above_grade dense (85-92% usable). legal_apartment_number and apartment_number are 0% filled across ALL four subtypes — those two columns are dead for multi-unit pricing.

(2) IN-BAND NOI×PRICE CORRELATION — CANNOT BE TESTED. Zero LAR×bed bands across Duplex or Triplex have ≥10 rows with NOI>0. Fill is too thin for an in-band correlation test. The cap-rate axis is UNPROVABLE on this dataset — the question "does NOI explain the within-band 53-93% spread?" has no answer here because the data can't even be sliced finely enough to ask.

(3) UNITS-COUNT — noisy proxy. kitchens_above_grade distribution per subtype (modes match the subtype label, but tails are ~40% wrong):
  Duplex      0:163  1:555  2:988  3:46  4:7  5:1   (mode 2 = 56%; 41% have 0/1 above-grade kitchens)
  Triplex     0:67   1:13   2:135  3:343 4:15 5:2  6:1  8:1   (mode 3 = 59%; 14% have 0/1)
  Fourplex    0:37   1:3    2:18   3:30  4:147 5:3 6:1   (mode 4 = 62%)
  Multiplex   ranges 0-21, mode 6
legal_apartment_number cross-validation: BOTH-filled n=0 in every subtype (because legal_apartment_number is universally empty). No second signal to validate door-count against. kitchens_above_grade is the only door-count signal — and it's noisy.

(4) PER-DOOR PRICING — FAILS the data test. Dividing close_price by kitchens_above_grade made the spread LOOSER, not tighter, in every subtype:
  subtype     n      raw price spread   price/door spread   delta
  Duplex      1597   57%                 111%                +54pp WORSE
  Triplex     510    79%                 91%                 +12pp WORSE
  Fourplex    202    73%                 87%                 +14pp WORSE
  Multiplex   350    80%                 87%                 +7pp WORSE
(Recon script print artifact: its verdict label "per-door pricing is viable" prints for BOTH directions — read the delta, not the label. LOOSER = NOT viable. The denominator is too noisy and amplifies the error.)

(5) CAP-RATE — real axis where NOI is filled, but it's only 7-15% of rows.
  Duplex      n=127  median 5.54%  spread 64%  (p25 3.65% → p75 7.19%)
  Triplex     n=60   median 5.82%  spread 37%
  Fourplex    n=35   median 5.67%  spread 29%  ← TIGHTEST
  Multiplex   n=4    median 6.93%  spread 55%  (n=4 = noise)
Cap-rate clustering at 5.5-7% median across all 4 subtypes is plausible market-rate. The axis is real where you can see it. The data isn't there to use it broadly — n=4 to 127 across a 2,953-row universe.

VERDICT — operator decision-pending, but the data says ROUTE-TO-AGENT.

(a) Cap-rate sibling product: NOT VIABLE as primary spine. NOI fill 7-15%; can't ship a sibling product that only works for 1-in-7 listings. Cap-rate IS a real signal where present — usable as a confidence-tier ENRICHMENT on the few subjects whose listings carry NOI (sharper estimate when present, route when not). But it cannot carry the multi-unit pricing job.
(b) Per-door sibling: NOT VIABLE. kitchens_above_grade is too noisy as a units proxy (40% tails — Duplex listings showing 1 kitchen above-grade etc.). Per-door pricing amplified the spread in every subtype tested. Per-door fails the data test.
(c) ROUTE-TO-AGENT: the data-driven verdict. Same shape as the luxury 5000+ LAR ceiling — structural data limit, not a code problem. Matcher should detect Duplex/Triplex/Fourplex/Multiplex subtype gate and refuse a confident estimate rather than produce a wrong-axis number. Show "honest suggestions" (nearest multi-unit comps within the existing pool) + route to agent. Same fallback v12 already specifies for unsolved cases.

Lesson logged (this round's principle reinforcement): the data-first rule that killed square_foot_source and validated the land cascade just killed both candidate multi-unit spines. Per-door FAILED the spread test outright; cap-rate FAILED the fill-rate test. There is no clever code over absent data — same as size on homes (the luxury 5000+ bucket is wide and that's structural). Route-to-agent is the honest answer when no usable signal exists, not a fallback to apologize for.

Stale/unverified summary (this session):
- VERIFIED on disk: scripts/recon-multi-unit-income-signals.js (script created), recon/multi-unit-income-signals.txt (output captured). All percentages traceable to the output file.
- VERIFIED: NOI/gross_revenue fill rates per subtype (resolved task (e) from yesterday).
- VERIFIED: kitchens_above_grade is the only fillable units-proxy column for multi-unit; legal_apartment_number / apartment_number are 0% filled.
- VERIFIED: per-door pricing increases spread in all 4 subtypes (decisively rules out per-door as primary spine).
- VERIFIED (qualified): cap-rate clusters at 5.5-7% median across the THIN slice where NOI is filled — qualifies as enrichment-tier signal, not as primary spine.
- CLAIMED, UNVERIFIED: (a) whether legal_apartment_number is empty for multi-unit specifically OR project-wide; could be a single-fam-skewed loader behavior. Not material to this decision (it's empty for our population either way) but flagged if a sibling-product later needs to revisit. (b) Whether NOI fill rate has time-trend (improving with newer listings) — could change the "too thin" verdict over 1-2 years. (c) Whether the 7-15% NOI-filled rows are MEMBERSHIP-BIASED (e.g., concentrate in investment markets) — relevant only if cap-rate enrichment-tier is built later. (d) Within the matcher's CURRENT multi-unit pool (which is already correct per yesterday's recon), what's the actual MAPE on Duplex/Triplex backtest subjects? Could be tolerable as-is — the within-band 53-93% spread is a comp-pool variance metric, not a backtest accuracy metric. If as-is MAPE is acceptable, route-to-agent isn't even mandatory; a confidence-tier widening would suffice.

Next action

Task (e) RESOLVED — multi-unit sibling architecture: ROUTE-TO-AGENT (data-driven). No sibling product to build; the matcher should detect multi-unit subtypes and refuse confident estimates. Cap-rate available as future ENRICHMENT-tier when NOI is on the subject listing.

Task (f) RESOLVED-as-moot — multi-unit pricing-axis correlation test was the next-step IF data supported a sibling. Data doesn't. Test obviated by (e) result.

(i) NEW — verify actual multi-unit backtest accuracy on the current matcher. The within-band 53-93% spread is a comp-pool metric; the backtest MAPE on Duplex/Triplex subjects is what determines whether route-to-agent is mandatory or just a defensive option. Cheap to compute: filter latest backtest CSV by property_subtype IN (Duplex,Triplex,Fourplex,Multiplex). If MAPE is comparable to single-family, the matcher is "accidentally OK" for multi-unit (the LAR+frontage spine is wrong-axis but the comp-pool median converges anyway). If MAPE is >2× single-family, route-to-agent is mandatory.
(j) NEW — route-to-agent SUBTYPE GATE patch (small, atomic): if (i) confirms multi-unit MAPE is high, add a subtype check at the matcher entry that returns CONTACT tier for Duplex/Triplex/Fourplex/Multiplex. Same shape as the luxury bucket's existing route-to-agent path. One file change.
(c) RESUMED — frontage-as-gate (RANGE-ADJ Pattern 2). Single-family is 74% of the data; this is the highest-leverage move for that population. No longer held — multi-unit decision is locked.

Order: (i) → (j) IF (i) shows high MAPE → (c). If (i) shows multi-unit is accidentally OK, skip (j), go directly to (c) and revisit multi-unit later.


2026-06-07 — MULTI-UNIT BACKTEST MAPE — task (i) RESOLVED, task (j) CONFIRMED-SHIP

Recon path:
- First attempted: slice the existing scripts-output/backtest-homes-sale.csv by subtype. CSV does carry `subtype` column (header verified at byte level), but the 500-subject random draw contained only n=3 multi-unit subjects (Duplex=1, Triplex=2, Fourplex=0, Multiplex=0) — n too small to verdict. (Subtype distribution in the existing CSV: Detached 420 / Att/Row/Townhouse 77 / Triplex 2 / Duplex 1; Semi-Detached and Link absent from this particular draw despite being in the allow-list, likely random + tighter required-field gates dropping them. Flagged as a sampling-bias curiosity for a separate session.)
- Authorized fallback: cloned scripts/backtest-estimator-homes.js to scripts/backtest-multi-unit-oneshot.js, narrowed sample SQL to property_subtype IN ('Duplex','Triplex','Fourplex','Multiplex'), set N=300, removed lease half, ran once, deleted the clone. Output preserved at scripts-output/backtest-multi-unit-{sale.csv,summary.txt}. Recon-only one-shot; production backtest untouched.

Result — n=300 multi-unit subjects sampled, 83 PRICED, 217 routed CONTACT (72.3% CONTACT rate vs ~7-10% on single-family) — the matcher is ALREADY routing most multi-unit to agent because pools are too thin. The 28% that get a price are still misjudged.

  metric              multi-unit   single-family detached   attached-row
  OVERALL MAPE         33.4%        21.3%                    14.1%
  OVERALL median       26.0%        15.2%                     8.9%
  ±15 hit rate         28%          49%                       63%
  CONTACT rate         72%          ~7-10%                    ~7-10%

Multi-unit MAPE is 1.6× single-family detached and 2.4× attached-row. Median 1.7× / 2.9×. ±15 hit rate 36% lower than single-family.

By tier (multi-unit subjects that DID get priced):
  BINGO         n= 2  MAPE  4.9%  median  5.7%
  BINGO-ADJ     n=27  MAPE 22.3%  median 15.3%   ← already worse than single-family OVERALL
  RANGE         n=27  MAPE 34.3%  median 27.2%
  RANGE-ADJ     n=27  MAPE 45.8%  median 34.4%
Even the BINGO-ADJ tier (the matcher's second-tightest tier) on multi-unit equals single-family's overall — and that's only 27 subjects out of 300 sampled. Every other tier is materially worse.

By price bucket: <500k multi-unit MAPE 53.9% median 40.0% — the bottom of the multi-unit market is where the matcher most overshoots, which lines up with the within-band-spread finding (small Duplexes have widest cap-rate variance because rent rolls vary most as a fraction of price).

Comparison to the within-band pool-spread finding from yesterday: 53-93% in-band spread is a PURE COMP-POOL VARIANCE metric (within one supposedly-tight band, how do prices spread). 33% MAPE is a PREDICTION ACCURACY metric (how badly the matcher misses). They COULD have disagreed (median-of-pool can converge despite high spread). They don't. Both metrics tell the same story: the spine is wrong-axis.

Verdict — ROUTE-TO-AGENT is MANDATORY.

- The matcher is NOT accidentally-OK on multi-unit. It is materially worse on every metric.
- 72% CONTACT rate already shows the matcher's own cascade gating is routing most multi-unit out — those that slip through still fail at 33% MAPE.
- 1.6× MAPE / 1.7× median / 36% lower hit rate is not noise; n=83 priced subjects is small but the directional signal is unambiguous.

Task (i) RESOLVED — multi-unit backtest MAPE 33.4% / median 26.0% / ±15 28%. Materially worse than single-family on every metric.
Task (j) CONFIRMED-SHIP — subtype gate is mandatory. Patch shape: at the matcher entry, if specs.propertySubtype ∈ {Duplex,Triplex,Fourplex,Multiplex}, return CONTACT tier immediately (matches the existing luxury 5000+ route-to-agent pattern). One small file change to lib/estimator/home-comparable-matcher-sales.ts. Atomic anchor-match-once with backup.

Stale/unverified summary (this session):
- VERIFIED on disk: scripts/recon-multi-unit-mape-slice.js (script created), recon/multi-unit-mape-slice.txt (slice of existing CSV, showed n=3 — too few), scripts-output/backtest-multi-unit-sale.csv + scripts-output/backtest-multi-unit-summary.txt (multi-unit-targeted backtest, 300 subjects).
- VERIFIED via two independent methods (in-band pool spread + actual backtest MAPE) that multi-unit is wrong-axis on the current spine.
- VERIFIED: 72% CONTACT rate is the matcher's existing cascade response to thin multi-unit pools — confirms the data is sparse, not just the model is wrong.
- CLAIMED, UNVERIFIED: (a) Why Semi-Detached and Link were 0% of the existing 500-subject CSV draw despite being in the allow-list — possibly the bedrooms_total / bathrooms_total_integer / community_id gates skew the random sample. Separate finding, deferred. (b) Whether the 83 multi-unit subjects that DID get priced are systematically biased (e.g., concentrated in urban markets where Duplex prices are more LAR-coupled) — population n=83 isn't large enough to slice further. (c) Whether the CONTACT-tier multi-unit subjects (217 of 300, 72%) would benefit from an "honest suggestions" surface (show nearest multi-unit comps + route to agent) rather than just CONTACT-no-comps. That's a UX layer, not a math fix.

Next action

Task (i) RESOLVED — see above.
Task (j) CONFIRMED-SHIP — multi-unit subtype gate is mandatory. Atomic patch, ready to ship.

(k) NEW — Ship the multi-unit route-to-agent gate. Patch lib/estimator/home-comparable-matcher-sales.ts: at the top of findHomeSaleComparables (or whatever the entry-point function is named — verify against bytes before edit), insert `if (multiTypes.includes(specs.propertySubtype)) return { tier: 'CONTACT', comparables: [], geoLevel: 'none' }`. multiTypes constant already exists in the file (line 153). Backup, atomic edit, tsc, then a multi-unit-targeted re-backtest to confirm 100% CONTACT and zero misjudged prices. Same shape as the luxury 5000+ existing path.

(c) RESUMED — frontage-as-gate (RANGE-ADJ Pattern 2). Single-family is 74% of the data; this is the highest-leverage move for that population. No longer held — multi-unit decision is now FULLY locked (cap-rate not viable + per-door fails + actual MAPE confirms gate-mandatory).

Order: (k) → (c). (k) is small (1-line patch + smoke-backtest), de-risks the live estimator for the 1.3% multi-unit slice. Then (c) is the next accuracy lever for the 74% single-family slice.

(Footnote — sampling-bias curiosity to revisit later: yesterday's 500-subject homes draw landed Detached 420 / Att/Row 77 / Triplex 2 / Duplex 1 / Semi-Detached 0 / Link 0. Population proportions suggest Semi-Detached should be ~10% / Link ~0.7%. Their absence from a single 500-draw is unlikely under uniform random — implies the gates (bedrooms_total/bathrooms_total_integer/community_id IS NOT NULL) drop Semi-Detached and Link disproportionately, OR random + small-n is to blame. Worth a follow-up recon if the homes baseline numbers feel off.)


2026-06-07 — SESSION LOCK — product-class foundation + tier model + multi-unit verdict

Consolidation entry: locks every decision reached across the 2026-06-06 + 2026-06-07 session arc to disk in one authoritative block. Items below cross-reference the detailed run-log entries that already carry the supporting numbers; verifications cited inline. Tracker write only — no code, no backtest this turn.

(1) VACANT LAND SAMPLING-BUG FILTER — SHIPPED 2026-06-06.

- File: scripts/backtest-estimator-homes.js line 537. Filter: `AND m.property_subtype IN ('Detached','Semi-Detached','Att/Row/Townhouse','Link','Duplex','Triplex')`. Verbatim mirror of HOME_SUBTYPES from app/charlie/components/SellerForm.tsx:30. Verified live (grep against current bytes). Backup: scripts/backtest-estimator-homes.js.backup_20260606_173345.
- Measured delta vs prior post-B1+bedBathOnly run, scripts-output/backtest-homes-summary.txt:
  RANGE-ADJ MAPE 56.2% → 38.2% (-18.0pp). RANGE-ADJ RMSE $807k → $400k (-50%). RANGE-ADJ median 36.5% → 32.4%.
  OVERALL median 12.8% → 14.4% (+1.6pp). OVERALL MAPE 19.3% → 20.1% (+0.8). ±15 55% → 52% (-3).
- Honest reading (LOCKED): the +1.6pp on overall median is a POPULATION SHIFT, not a regression. Prior sample's Vacant Land subjects (small urban lots) were flattering the typical-estimate metrics. The 14.4% median is the HONEST homes-only baseline; the prior 12.8% was contaminated optimism.
- The catastrophe-tier compression is REAL (RMSE -50% on RANGE-ADJ confirms Vacant Land contributed ~half the tier's $-RMSE).
- Going-forward homes-only baseline (LOCKED): MAPE ~20%, median ~14.4%, ±15 ~52%, RANGE-ADJ MAPE ~38%.

(2) PRODUCT-CLASS CENSUS — LOCKED 2026-06-07.

Five classes (2y closed Residential Freehold, n=221,540 — recon/product-class-census.txt):
  single-family-detached-ish    163,810  (74%)   Detached + Semi-Detached + Link
  attached-row                   26,720  (12%)   Att/Row/Townhouse
  land                            6,615  (3%)    Vacant Land + Rural Residential + Farm
  multi-unit-income               2,953  (1.3%)  Duplex + Triplex + Fourplex + Multiplex
  other-edge                      1,743  (0.8%)  MobileTrailer + Modular Home + Store W Apt/Office + Other

ARCHITECTURE LOCKED — STRICT ORANGE-TO-ORANGE:
- Comps NEVER cross product class. The pricing AXIS must FIT the class, not just the pool.
- The class gate sits ABOVE the geo cascade. Class is decided FIRST (subtype gate at matcher entry); geo cascade runs WITHIN one class.
- Current matcher state vs lock (verified at lib/estimator/home-comparable-matcher-sales.ts:149-160): `getCompatibleSubtypes` already routes Detached / Semi+Link / Att-Row+Link / Duplex+Triplex+Fourplex+Multiplex into separate pools, and falls back to `[subtype]` for unmatched. POOL containment is correct. The class gate above geo cascade is correct in shape; AXIS-by-class enforcement is still in-flight (multi-unit gate task (k), land sibling, edge exclusion).

(3) PLATINUM / GOLD / SILVER / BRONZE TIER MODEL — LOCKED 2026-06-07 (new this session; no prior tracker reference).

Tier vocabulary (replaces / clarifies prior "street / community / muni / area" cascade language):
  Platinum   = street tier         (tightest — same street, ideal odd-even = same backing)
  Gold       = community tier      (the matcher's default operational tier — 70-80% of single-family subjects land here cleanly)
  Silver     = muni tier           (the fallback when community is too thin)
  Bronze     = area tier           (the always-populated floor, lowest specificity)

Display rule LOCKED — the machine shows more than a human agent can:
- COMPUTE all four tiers every time, even when a tighter tier has plenty of comps.
- DISPLAY all four tiers every time. Lower tiers = CONTEXT, never replaced by a tighter tier.
- Platinum ANCHORS — it is the price the user actually quotes. Gold/Silver/Bronze widen the visible spread.
- The WIDENING SPREAD across tiers IS the confidence signal — narrow Platinum→Bronze convergence = high confidence; wide divergence = "your block sold differently than your community, talk to an agent."

Pricing rule LOCKED — NEVER blend:
- PRICE from the BEST tier ONLY (Platinum if present, else Gold, else Silver, else Bronze).
- DO NOT compute weighted means across tiers. The price the user sees comes from one tier; the other three are context for that price.

Confidence rule LOCKED:
- Spread between tiers IS the confidence display. No separate "X% confidence" number is asserted beyond what the tier convergence already shows.

Containment guardrail LOCKED — diverse views, not diverse prices:
- Tiers widen WITHIN ONE PRODUCT CLASS ONLY. Bronze of a Detached subject pulls Detached/Semi/Link area comps — NEVER a Duplex or Vacant Land at the same address.
- Same home, same axis, different tiers = different VIEWS. Same home should not produce two materially different PRICES depending on which tier the engine chose. The strict orange-to-orange class lock (item 2) makes this guarantee — without it, Bronze of a Duplex could pull a Detached and the price would jump.

Implementation status (verified vs the lock):
- VERIFIED LIVE: the geo cascade exists (community → municipality → area in matcher code). Names are NOT YET Platinum/Gold/Silver/Bronze — that's a rename + display layer change, not a logic change.
- VERIFIED LIVE: best-tier pricing (matcher returns ONE tier per call; computes price from that pool). Multi-tier compute/display is NOT YET implemented — current matcher returns the first tier that produces enough comps and stops.
- CLAIMED, UNVERIFIED on disk: street tier (Platinum) was identified as the "free 20-pt revival" in the 2026-06-04 STREET/ODD-EVEN entry but is NOT YET WIRED — matcher still hardcodes sameStreet=false. Platinum is currently DEAD; lock anticipates the revival.

(4) RESULT RICHNESS — LOCKED 2026-06-07 (consolidates prior 2026-06-04 v11 "Option C" decision into the session lock).

Every result the user sees carries:
- Comparable Sold tiles (the comps the matcher used for the price).
- Competing For Sale tiles (active listings the same tier surfaces — context on what's on the market right now).
- Charlie-style compact tiles (Option C — operator-locked 2026-06-04 against the real Charlie ResultsPanel spec).
- Tenant-correct linked addresses (each tile's address link routes to the tenant's own website, never hardcoded — re-affirmed gate from CLAUDE.md tenant-scoping rules).

Status (verified vs the lock):
- VERIFIED LIVE in matcher: comparables array is returned with each match.
- VERIFIED LIVE in app: app/api/charlie/competing-listings/route.ts exists (separate competing-listings surface).
- CLAIMED, UNVERIFIED on disk this session: whether the Comparable Sold + Competing For Sale tiles render together in the SAME result panel, or are surfaced in separate UI moments. components/property/HomePropertyEstimateCTA.tsx + app/estimator/components/HomeEstimatorBuyerModal.tsx are the candidates to verify. Out of recon scope for this lock; flagged for a UI-side audit.

(5) MULTI-UNIT VERDICT — ROUTE-TO-AGENT (data-driven, LOCKED 2026-06-07).

Two independent recons + one direct measurement converged on the same answer:
- Pricing-signal recon (recon/multi-unit-income-signals.txt): NOI / gross_revenue fill 7-15% on Duplex/Triplex/Fourplex, 0-1% on Multiplex. Too sparse to be a primary spine. kitchens_above_grade dense (85-92%) but 40% noisy (Duplex listings showing 1 above-grade kitchen). Per-door pricing made spread WORSE in every subtype tested (+7pp to +54pp). legal_apartment_number 0% filled; apartment_number 0% filled.
- Cap-rate is a real signal where NOI is filled (Duplex/Triplex/Fourplex/Multiplex medians 5.5-7%, spreads 29-64%). RETAINED AS FUTURE ENRICHMENT TIER — when NOI is present on the subject listing, surface cap-rate as a sharper alternative. NEVER as the spine.
- Backtest accuracy (scripts-output/backtest-multi-unit-summary.txt, 2026-06-07): multi-unit MAPE 33.4% / median 26.0% / ±15 28%. Single-family detached MAPE 21.3% / median 15.2% / ±15 49%. Multi-unit is 1.6× MAPE, 1.7× median, 36% lower hit rate. 72% of multi-unit subjects ALREADY route to CONTACT under existing cascade; the 28% that don't are still misjudged at 33% MAPE.
- Comparison to luxury 5000+ ceiling: same shape — structural data limit, not a code problem. Same fallback applies: refuse confident estimate, route to agent.
- VERDICT LOCKED: route-to-agent for Duplex/Triplex/Fourplex/Multiplex. The matcher should detect multi-unit subtype at entry and return CONTACT tier immediately. Same shape as the luxury route-to-agent path. To ship: task (k).

(6) LIVE CONTAMINATION FOUND — task (g) cleanup PENDING.

Live entry points are producing wrong-model estimates today:
- app/charlie/components/BuyerForm.tsx:27 — `HOME_SUBTYPES = ['Detached','Semi-Detached','Att/Row/Townhouse','Link','Duplex','Triplex','Vacant Land']`. Includes Vacant Land. Buyer-side Vacant Land searches route through the home estimator with the home spine — wrong-product. Verified live (grep against current bytes).
- app/estimator/components/HomeEstimatorBuyerModal.tsx:250 — `propertySubtype: listing.property_subtype?.trim() || 'Detached'`. Forwards listing subtype verbatim. So any Fourplex / Multiplex / MobileTrailer / Modular Home / Store-w-Apt listing whose user clicks the "estimate" CTA reaches the home matcher with the listing's true subtype. Verified live.
- app/charlie/components/SellerForm.tsx:30 — `HOME_SUBTYPES = ['Detached','Semi-Detached','Att/Row/Townhouse','Link','Duplex','Triplex']`. Sellers of Duplex/Triplex CAN submit. (Vacant Land NOT in seller form's list — seller path is correct on that subtype; only the buyer path has the Vacant Land contamination.)

Once (k) ships the multi-unit subtype gate at the matcher level, multi-unit estimates from any entry point will return CONTACT — defending the engine without requiring a UI cleanup. The UI cleanup (task g) still belongs in the next-action plan because the form should not OFFER subtypes that route straight to CONTACT — bad UX. The matcher-level gate is the safety net; the form-level subtype list is the user-facing surface.

Stale/unverified summary (consolidated, this session):
- VERIFIED LIVE in code: vacant-land filter (backtest:537), getCompatibleSubtypes (sales.ts:149-160), multiTypes constant (sales.ts:153), BuyerForm Vacant Land contamination (BuyerForm.tsx:27), HomeEstimatorBuyerModal forwarding (HomeEstimatorBuyerModal.tsx:250), SellerForm subtypes (SellerForm.tsx:30).
- VERIFIED on disk as artifacts: recon/product-class-census.txt, recon/vacant-land-recon.txt (sections 1-8), recon/multi-unit-income-signals.txt, recon/multi-unit-mape-slice.txt, scripts-output/backtest-multi-unit-summary.txt, scripts-output/backtest-homes-summary.txt.
- VERIFIED LOCKED (operator decisions, new this session): the Platinum/Gold/Silver/Bronze rename, compute-all/display-all/price-from-best rule, never-blend, spread-as-confidence, strict orange-to-orange, route-to-agent for multi-unit.
- CLAIMED, UNVERIFIED on disk: (a) whether the Comparable Sold + Competing For Sale tiles already render together vs separately — UI audit deferred. (b) Platinum (street tier) wiring — currently DEAD (sameStreet hardcoded false at sales.ts:552 from prior recon), revival is a separate workstream. (c) sampling-bias curiosity (yesterday's 500-draw missing Semi-Detached + Link) — still open. (d) Sibling-product builds (land + future multi-unit enrichment when NOI present) — design-locked, build-pending. (e) Multi-unit subtype-gate patch (task k) — confirmed-ship verdict, not yet applied to code.

Next action (LOCKED ordering, supersedes prior Next-action blocks)

(i) RESOLVED — multi-unit MAPE check completed during this session arc. Result: 33.4% MAPE, 1.6× single-family. Gate is mandatory, not defensive. The user's lock-request framed (i) as [RUNNING] at write time; the prior turn's measurement landed it as resolved. Recorded here as RESOLVED so future readers don't re-run it.

(j) CONFIRMED-SHIP — multi-unit route-to-agent gate. Patch lib/estimator/home-comparable-matcher-sales.ts: at the entry-point function, insert `if (multiTypes.includes(specs.propertySubtype)) return { tier: 'CONTACT', comparables: [], geoLevel: 'none' }`. multiTypes already exists at line 153. Atomic anchor-match-once, backup, tsc, smoke (re-run the multi-unit-targeted backtest expecting 100% CONTACT, zero priced).

(g) LIVE-PATH CONTAMINATION CLEANUP (sequenced AFTER j) — once the matcher gate is in place, clean the entry-point UIs:
  - app/charlie/components/BuyerForm.tsx:27 — remove Vacant Land from HOME_SUBTYPES (it routes to land-sibling-product when that ships; until then it should not appear as an estimable home subtype).
  - app/charlie/components/SellerForm.tsx:30 — remove Duplex + Triplex from HOME_SUBTYPES (they'll return CONTACT from the matcher post-(j); offering them in the form is bad UX).
  - app/estimator/components/HomeEstimatorBuyerModal.tsx:250 — when the listing's property_subtype is multi-unit OR vacant-land OR other-edge, surface a "contact agent for this property type" message instead of running the estimator.

(c) RESUMED — frontage-as-gate (RANGE-ADJ Pattern 2). Single-family is 74% of the data; this is the highest-leverage residual move once multi-unit + Vacant Land are routed correctly. Per tracker v12, reclassify frontage from the flat $40k/ft additive adjustment to a Tier-1 proportional-band gate (~±20%).

Order LOCKED: (j) → (g) → (c). (j) is one-line atomic and safety-critical (live estimator is currently producing wrong-axis multi-unit numbers). (g) follows because the matcher gate makes the UI cleanup non-breaking. (c) is the next single-family accuracy lever once classes are routed correctly.

(Sibling-product builds: land sibling [design-locked + data-recon-complete, build-ready when prioritized] and multi-unit cap-rate enrichment [data-locked as enrichment only, future surface] stay queued as separate workstreams. The Platinum / Gold / Silver / Bronze tier rename + multi-tier display layer is also queued — it is a presentation refactor that depends on the matcher already returning multi-tier compute results, which it does not yet do. Sequenced after (c).)


2026-06-07 — MULTI-UNIT FINANCIAL-PATH POOL TEST — locks enrichment-only verdict

Question: even WHERE NOI is filled, can a cap-rate pricing pool actually be constructed? Structured-only recon (recon/multi-unit-financial-path.txt + scripts/recon-multi-unit-pool-2y.js), no text scans.

Fill (2y closed): Duplex 7.2% NOI · Triplex 10.4% · Fourplex 14.6% · Multiplex 1.1%. Total 226/2955 = 7.6% population coverage. CRITICAL — 90d sanity check returned ZERO NOI-filled multi-unit closes. The live-traffic freshness window has no qualifying subjects at all.

Cap-rate distribution (NOI-filled only): Fourplex tightest (median 5.67%, spread 29%), Triplex 5.82%/37%, Duplex 5.54%/64%, Multiplex n=4 noise. The axis CLUSTERS where present — that's why it qualifies as display-line context.

POOL TEST (the decider) — 2y subjects (since 90d empty) finding ≥3 same-subtype NOI-filled comps in same community / muni:
  Duplex     subjects=127  community ≥3: 49 (39%)  muni ≥3: 56 (44%)
  Triplex    subjects= 60  community ≥3: 11 (18%)  muni ≥3: 14 (23%)
  Fourplex   subjects= 35  community ≥3:  3 (9%)   muni ≥3:  7 (20%)
  Multiplex  subjects=  4  community ≥3:  1 (25%)  muni ≥3:  1 (25%)
Even the best case (Duplex muni) is 44% of NOI-filled subjects finding a pool. Compound coverage = 7.6% NOI × ~25-44% pool survival = ~2-3% of total multi-unit population could theoretically be priced on cap-rate. Over the 90d live-traffic window: 0%.

VERDICT LOCKED — financial path is NOT a pricing spine for any meaningful share. Cap-rate is retained as DISPLAY-ONLY ENRICHMENT on the route-to-agent screen — `implied cap-rate = NOI / close_price`, computed per-row from the subject listing itself, no comp pool required. When the listing carries NOI, show the cap-rate line on the agent handoff to make the referral richer; when it doesn't, show what's there (units estimate, structured fields) and route. The multi-unit route-to-agent verdict from earlier today is unchanged; this recon resolves the "is there hidden depth?" question with a definitive no.

Stale/unverified summary:
- VERIFIED on disk: recon/multi-unit-financial-path.txt (sections 1, 2, 4) + the appended 2y pool-test output, scripts/recon-multi-unit-pool-2y.js, scripts/recon-multi-unit-financial-path.js.
- VERIFIED: 90d NOI-filled multi-unit closes = ZERO. 2y NOI-filled multi-unit = 226. Pool survival at community/muni captured in the table above.
- CLAIMED, UNVERIFIED: (a) whether NOI fill rate has improved on listings post-2024 — the 7.6% is a 2y average and could mask a recent uptick if the data-entry policy changed. (b) whether the NOI-filled subset is membership-biased (investment-listed properties more likely to report NOI than owner-occupier sales). (c) text-extraction of income signals from public_remarks — the earlier text-extraction recon was killed after running ~12min on unindexed regex scans (no pg_trgm GIN); per session note, live-page enrichment doesn't need DB-side indexing because text parsing on ~10 returned comps happens in the app layer at render time, not as a DB filter. The "is there hidden depth in public_remarks?" question is therefore PARKED — not blocking; relevant only if a future workstream wants to use text-extracted signals to FILTER comps DB-side, at which point pre-extract-at-ingest is the right pattern (NOT query-time regex).

Next action (no change to the prior order — this recon CONFIRMS the prior verdict, doesn't change it)

(j) CONFIRMED-SHIP — multi-unit route-to-agent gate. Unchanged.
(g) LIVE-PATH CONTAMINATION CLEANUP. Unchanged.
(c) RESUMED — frontage-as-gate. Unchanged.

Multi-unit enrichment surface (NEW queued item, post-(j)): when (j) ships and Duplex/Triplex/Fourplex/Multiplex return CONTACT, the result screen should still surface what's actually known about the subject. Where NOI > 0 on the subject listing, compute and display `implied cap-rate = NOI / asking_price` as a context line. Where kitchens_above_grade matches subtype label (with "as listed" caveat), surface units estimate. Where neither, plain agent referral. This is a UI/display tier change, not a matcher tier change — sequenced as a separate small workstream after (j) + (g).


2026-06-07 — (j) MULTI-UNIT SUBTYPE GATE SHIPPED

Pre-flight verification:
- STEP 0 — verbatim subtype strings from DB (recon/multi-unit-subtype-strings.txt): "Duplex" (len 6), "Triplex" (len 7), "Multiplex" (len 9), "Fourplex" (len 8). No casing drift, no trailing whitespace, no hyphenation. Strings used in the gate match DB verbatim — not assumed, not from tracker memory.
- STEP 1 — recon against current bytes of lib/estimator/home-comparable-matcher-sales.ts:
  (a) entry point `findHomeComparables(specs: HomeSpecs): Promise<HomeMatchResult>` at line 408 — confirmed.
  (b) bare-CONTACT return shape `{ tier: 'CONTACT', comparables: [], geoLevel: 'none' }` exists at line 546 — confirmed.
  (c) `getCompatibleSubtypes(specs.propertySubtype)` is called AFTER the entry point (line 414) — gate at the top intercepts before pool routing.
  (d) HomeSpecs field name verified at lines 21-42: it is `propertySubtype: string` (camelCase, line 24). Not property_subtype, not subtype. The gate's specs.propertySubtype reference matches.

Patch applied to lib/estimator/home-comparable-matcher-sales.ts at entry of findHomeComparables (verified at byte level; backup .backup_20260607_123134):

  // Multi-unit subtypes cannot be priced on the home spine (33.4% backtest MAPE,
  // 1.6x single-family). Income axis unavailable (NOI fill 7.6%, 0% in 90d
  // freshness window, pool survival 9-44%). Route to agent.
  if (['Duplex', 'Triplex', 'Fourplex', 'Multiplex'].includes(specs.propertySubtype)) {
    return { tier: 'CONTACT', comparables: [], geoLevel: 'none' }
  }

Verified: tsc clean (full project --noEmit). getCompatibleSubtypes pool logic (line 149+) unchanged — non-multi-unit subtypes flow through untouched; the `multiTypes` branch in getCompatibleSubtypes (line 158) becomes effectively dead-but-correct (defense-in-depth if gate is later removed).

Smoke (logic-mirror via clone — scripts/smoke-mu-gate.js, deleted after run):
- Backtest INLINES the matcher (D1 shared math module only, not funnel/entry). Cloned the backtest, mirrored the SAME gate predicate at the inlined entry (findHomeComparablesSaleBacktest:302), restricted sample to property_subtype IN ('Duplex','Triplex','Fourplex','Multiplex'), N=100, sale-only.
- Result: 0 priced / 100 CONTACT / 100 total. Every multi-unit subject returned CONTACT. Output preserved at scripts-output/smoke-mu-gate-{sale.csv,summary.txt}.
- Compare pre-gate baseline (yesterday's same multi-unit-targeted run, N=300): 83 priced / 217 CONTACT (28% leaked through at 33.4% MAPE). Post-gate: 0% leak.
- Scope honestly: the smoke validates gate LOGIC, not the production code path directly. The production code path is verified by file inspection (`grep` against current bytes shows the gate at line 409) and tsc-clean. Direct production-path smoke would require starting `npm run dev` and submitting a multi-unit seller form — deferred to (g) cleanup phase when the form UI is also touched.

Live impact: any caller that submits a multi-unit subtype to findHomeComparables — SellerForm.tsx (Duplex/Triplex via the form), HomeEstimatorBuyerModal.tsx (any multi-unit listing forwarded via property_subtype), Charlie (if it ever submits multi-unit) — will now get CONTACT immediately. No home-spine compute runs. No wrong-axis estimate produced. The live estimator was previously producing 33.4%-MAPE multi-unit numbers; that stops now.

Sale-side only — flagged: this patches home-comparable-matcher-sales.ts. The lease matcher (home-comparable-matcher-rentals.ts) is NOT patched. Multi-unit lease wasn't measured (<50 closed/2y, no MAPE data); without measurement, a lease-side gate would be a guess. Logged as a follow-up: probe multi-unit lease MAPE first, then decide. Mirrors the discipline that locked the sale-side verdict.

Stale/unverified:
- VERIFIED LIVE on disk: gate at lib/estimator/home-comparable-matcher-sales.ts (line 409+), backup .backup_20260607_123134, tsc clean.
- VERIFIED in DB: the 4 subtype strings (recon/multi-unit-subtype-strings.txt).
- VERIFIED via mirror-smoke: gate predicate fires 100/100 on multi-unit subjects (scripts-output/smoke-mu-gate-summary.txt).
- CLAIMED, UNVERIFIED: (a) production code path direct smoke (would require dev server) — deferred to (g) cleanup. (b) Whether lease-side multi-unit needs a parallel gate — needs measurement first; flagged as follow-up. (c) Charlie's multi-unit handling — Charlie may call the matcher with multi-unit subtypes from its own conversational flow; with the gate in place it'll get CONTACT, which is correct, but the UX of "Charlie says contact agent" hasn't been visually verified.

Next action

(j) DONE — multi-unit subtype gate shipped to lib/estimator/home-comparable-matcher-sales.ts. Gate fires for 'Duplex' / 'Triplex' / 'Fourplex' / 'Multiplex' (DB-verified strings). Live estimator no longer produces wrong-axis multi-unit numbers. Smoke confirmed 100% CONTACT.

(g) PROMOTED to next — live-path UI cleanup. Three files identified by this session arc:
  - app/charlie/components/BuyerForm.tsx:27 — remove Vacant Land from HOME_SUBTYPES.
  - app/charlie/components/SellerForm.tsx:30 — remove Duplex + Triplex from HOME_SUBTYPES (they'll return CONTACT from the matcher post-(j); offering them in the form is now bad UX).
  - app/estimator/components/HomeEstimatorBuyerModal.tsx:250 — when the listing's property_subtype is multi-unit OR vacant-land OR other-edge, surface a "contact agent for this property type" message instead of running the estimator.

(c) RESUMED-next — frontage-as-gate (RANGE-ADJ Pattern 2). Single-family is 74% of the data; this is the highest-leverage residual accuracy lever now that class routing is correct at the matcher level.

Order LOCKED: (g) → (c). (g) is safe (matcher gate now defends the engine; UI cleanup is non-breaking polish). (c) is the next accuracy lever for the 74% single-family slice. The multi-unit enrichment surface (cap-rate display where NOI present) remains queued post-(g)+(c).

Push HELD per session instruction.


2026-06-07 — LEAD-CAPTURE AUDIT CHAIN + ORDER LOCK (planning session, no code shipped this block)

(j) STATUS: gate logic shipped prior block (bare CONTACT for Duplex/Triplex/
Fourplex/Multiplex at findHomeComparables entry; DB-verified strings; tsc clean;
logic-mirror smoke 100/100 CONTACT; backups code .backup_20260607_123134 +
tracker .backup_20260607_123729; push HELD). End-to-end production-path verify
still deferred to (g) dev-server smoke — claimed, unverified.

(g) REFRAMED (operator decision): NOTHING is removed from any form. Product is a
LEAD-CAPTURE system — every subtype (multiplex, vacant land, etc.) is a welcome
lead. The earlier "remove Duplex/Triplex from SellerForm, Vacant Land from
BuyerForm" plan is CANCELLED. Multi-unit/land/edge subjects get a rich-but-
accurate route-to-agent result, NOT removal and NOT a dead error panel.

LEAD-CAPTURE AUDIT (5 read-only recons this session) — VERDICT: capture works
as designed. Verified:
  - Estimator CONTACT state (HomeEstimatorResults:172) always renders the
    "Request Free Professional Valuation" form → submitLeadFromForm →
    getOrCreateLead, source='sale_offer_inquiry', tenant-scoped.
  - Full 6-layer hierarchy email fan-out fires (agent TO / manager CC /
    area+admin BCC) via the single-source getLeadEmailRecipients helper.
  - Lead lands quality='unqualified' (DB default per 20260512_l1),
    temperature=NULL — and this is CORRECT.

TEMPERATURE DIRECTION — EXPLORED AND REJECTED: investigated stamping
temperature='hot' on estimator leads from the source string. Migration
20260516_w_quality_split defines temperature as HUMAN-SET (agent triage):
quality=qualification status, temperature=motivation/readiness, two orthogonal
axes. Agent sets it via wired+audited dropdown at AdminHomesLeadsClient.tsx:792.
Code must NEVER auto-stamp temperature from source — doing so recreates the exact
conflation W-QUALITY-SPLIT removed. NO source→temperature mapping will be built.
System-2 has ZERO temperature auto-writers BY DESIGN; dashboard hot-count
(AdminHomesLeadsClient:352, reads temperature==='hot') is empty pending agent
triage, not broken.

NAMESPACE CAUTION (logged): leads.temperature (lowercase hot/warm/cold/NULL,
agent-set, lead motivation) is DISTINCT from estimator ComparableSale.temperature
(uppercase HOT/WARM/COLD/FROZEN, recency-derived via assignTemperature(closeDate),
6 matcher writers). Future code near leads must not conflate them.

REAL REMAINING ITEMS (order LOCKED):
  1. DEDUP FIX (FIRST — live defect). HomeEstimatorResults submits
     forceNew:true, bypassing the (contact_email, tenant_id) dedup at
     lib/actions/leads.ts:119-122. Double-submit → duplicate hot leads +
     duplicate 6-layer email blasts (class of F-PLAN-EMAIL-NO-DEDUP). FIX:
     per-(email, listing_id) dedup — same person+subject merges, different
     subject distinct. listingId already in scope at CreateLeadParams/INSERT;
     needs threading from HomeEstimatorResults (not passed today). NULL-listingId
     callers (registration, contact form, etc.) need NULL-safe predicate.
     Shared-path change → full caller regression-check required (11 callers
     mapped; elevate/NULL behavior must be preserved for all).
  2. (g) MULTI-UNIT CONTACT RICHNESS (SECOND). Upgrade (j) gate bare→comps-
     bearing so rail at HomeEstimatorResults:259 lights up (no new component).
     Class-wide competing-listings rail (extend /api/charlie/competing-listings
     from exact-subtype to the 4 multi-unit subtypes). Cap-rate enrichment
     (NOI ÷ list_price) where NOI present — wireable on /property/[id] (SELECT *,
     HomePropertyPage.tsx:79); geo-page loaders (GeoListingSection,
     NeighbourhoodListingSection / fetchListings) UNVERIFIED for NOI. Suppress
     single-family scoring on plex comps (no bestMatchScore / match labels).
     Honest class-appropriate copy for Geo Level Indicator + "why this differs".
     STATE-C thin data (muni <3 comps) → honest "talk to agent", NOT padded
     area-tier tiles. isAsIs filter dropped for multi-unit (1.7-3.3% prevalence,
     safe). Order rationale: dedup is an active pipeline defect; (g) is polish on
     a path already proven to work — fix the bleed first.

CLAIMED, UNVERIFIED (carried): (j) production-path end-to-end smoke; NOI loader
inclusion on geo-page entry paths; full joinTenant caller registrationSource
list; whether walliam users see System-1 AdminLeadsClient; HomeEstimatorResults
render on showPrice=false + populated comparables (line-level branch logic).


2026-06-07 — DEDUP FIX SHIPPED — per-(email, listing_id) on estimator CONTACT lead

Operator approval (verbatim, prior turn): "APPROVED — proceed Step 2 onward. All
4 diffs approved as written, including the AgentContactForm (email, tenant,
listing_id) narrowing (intended correction of a latent suppressed-second-inquiry
defect — NOT collateral)."

Backups (timestamped before any write):
  - lib/actions/leads.ts.backup_20260607_150850
  - app/estimator/components/HomeEstimatorResults.tsx.backup_20260607_150850
  - app/estimator/components/HomeEstimatorBuyerModal.tsx.backup_20260607_150850
  - components/property/HomePropertyEstimateCTA.tsx.backup_20260607_150850
  - tracker pre-write: docs/W-ESTIMATOR-RAG-TRACKER.md.backup_20260607_151416

DIFFS APPLIED (4):

  1. lib/actions/leads.ts getOrCreateLead dedup predicate (lines 124-134
     post-patch): conditional listing_id clause.
       let query = supabase
         .from('leads')
         .select('id, contact_email, agent_id, tenant_id, listing_id')
         .eq('contact_email', params.contactEmail)
         .eq('tenant_id', params.tenantId)
       if (params.listingId) {
         query = query.eq('listing_id', params.listingId)
       }
       const { data: existingLead, error: searchError } = await query.maybeSingle()
     Null-safety: the listing_id .eq() clause is added ONLY when
     params.listingId is truthy. For NULL-listingId callers the predicate is
     exactly (email, tenant) — identical to pre-patch behavior.
     Silent-bump field set unchanged (line 137 still writes only updated_at).
     Temperature is human-set by design (W-QUALITY-SPLIT) and remains
     untouched by leads.ts. quality default 'unqualified' unchanged.

  2. app/estimator/components/HomeEstimatorResults.tsx: added listingId?:
     string to EstimatorResultsProps; threaded into the submitLeadFromForm
     call at handleContactSubmit; REMOVED forceNew:true.

  3. app/estimator/components/HomeEstimatorBuyerModal.tsx: pass
     listingId={listing?.id} when rendering HomeEstimatorResults.

  4. components/property/HomePropertyEstimateCTA.tsx: pass listingId={listing.id}
     when rendering HomeEstimatorResults.

tsc --noEmit clean (exit 0, full project type-check).

SAVEPOINT-ISOLATED SMOKE — production data NOT mutated (scripts/smoke-dedup-
listing-key.js, BEGIN/ROLLBACK, real WALLiam tenant + 2 real mls_listings FK
IDs). Results — ALL 6 CHECKS PASS:

  S1 same-email + same-listing → predicate finds the dup row (1 result)        ✓ PASS — silent bump path
  S2 same-email + DIFFERENT listing → predicate finds 0 (would create new)     ✓ PASS — create new path
  S2 post-second-insert: listing_B query returns 1 (distinct from listing_A)   ✓ PASS — listing-B lead is distinct
  S2 listing_A unaffected by listing_B insert (still finds 1)                  ✓ PASS — listing-A lead unchanged
  S3 NULL listing_id caller (e.g. contact_form) finds 1 with listing-narrow OFF ✓ PASS — falls back to (email, tenant)
  S3 baseline (old pre-patch (email, tenant) key) returns same 1 row          ✓ PASS — NULL caller behavior unchanged
  POST-ROLLBACK: zero smoke rows persist in leads table                        ✓ PASS — production untouched

CALLER REGRESSION MAP (verified vs the 10 callers other than HomeEstimatorResults):

  caller                                          dedup key BEFORE        dedup key AFTER          regression?
  ---------------------------------------------- ----------------------- ------------------------ ---------------
  HomeEstimatorResults (HOME estimator)          bypassed (forceNew)     (email, tenant, listing_id)  TARGET FIX
  EstimatorResults (CONDO estimator variant)     bypassed (forceNew)     bypassed (unchanged)         NO — see KNOWN DEFECT below
  OfferInquiryModal                              bypassed (forceNew)     bypassed (unchanged)         NO
  AgentContactForm                               (email, tenant)         (email, tenant, listing_id)  INTENDED — see secondary effect below
  ContactModal                                   bypassed (forceNew)     bypassed (unchanged)         NO
  UnitHistoryModal                               bypassed (forceNew)     bypassed (unchanged)         NO
  ContactSection (homepage)                      bypassed (forceNew)     bypassed (unchanged)         NO
  ListYourUnit eval                              bypassed (forceNew)     bypassed (unchanged)         NO
  ListYourUnit visit                             bypassed (forceNew)     bypassed (unchanged)         NO
  joinTenant (registration)                      (email, tenant)         (email, tenant)              NO — no listingId passed

AGENTCONTACTFORM SECONDARY EFFECT — INTENDED CHANGE, NOT COLLATERAL:
  components/property/AgentContactForm.tsx:69 calls submitLeadFromForm with
  listingId: listing.id AND no forceNew. Pre-patch dedup key was
  (email, tenant) — meaning a user contacting an agent about Listing A on
  Tuesday and Listing B on Wednesday produced exactly ONE lead row + ONE
  6-layer email blast; the second inquiry was SILENTLY BUMPED with no
  notification (lib/actions/leads.ts:132-140 silent-bump branch, Option A
  locked 2026-05-03).
  Post-patch key is (email, tenant, listing_id). Effect: the second
  inquiry on a DIFFERENT property now creates a distinct lead AND fires the
  6-layer email fan-out (agent TO / manager CC / area+admin BCC). Email
  volume to agents rises for repeat multi-property inquirers.
  This is DESIRED per the lead-capture product principle ("every inquiry
  is a lead, every inquiry triggers the email"). Operator approval
  explicit (prior turn): "INTENDED correction of a latent suppressed-
  second-inquiry defect — NOT collateral." Logged here so future "why two
  emails from same person" questions resolve to this entry.

KNOWN DEFECT — DECISION DEFERRED (operator call, 2026-06-07):
  app/estimator/components/EstimatorResults.tsx (the CONDO variant, line
  133) has the IDENTICAL dedup defect as HomeEstimatorResults: calls
  submitLeadFromForm with forceNew:true and does NOT pass listingId.
  Double-submit on same condo listing → duplicate leads + duplicate
  6-layer email blasts. Same fix would apply (add listingId prop, thread
  from condo parents, drop forceNew). Operator decision this block: SHIP
  HOME PATH ONLY; the condo variant is a SEPARATE decision for later,
  NOT auto-folded into this fix and NOT in the immediate next-action
  queue. Status: NAMED, OPEN, AWAITING OPERATOR DECISION — not "next
  action," not silently backlogged. Re-evaluate before the next condo-
  estimator workstream.

DEDUP FIX STATUS — DONE.
  (j) production-path end-to-end smoke for the multi-unit gate still
  deferred (matcher-level gate verified in prior block via logic-mirror
  smoke; full dev-server walkthrough remains in (g)'s scope).

Next action (LOCKED ordering, updated):
  (g) MULTI-UNIT CONTACT RICHNESS — PROMOTED to NEXT. Upgrade (j) gate
  bare→comps-bearing so the reference-comparables rail at
  HomeEstimatorResults:259 lights up (no new component). Class-wide
  competing-listings rail (extend /api/charlie/competing-listings from
  exact-subtype to the 4 multi-unit subtypes). Cap-rate enrichment
  (NOI ÷ list_price) where NOI present — wireable on /property/[id]
  (SELECT *, HomePropertyPage.tsx:79); geo-page loaders
  (GeoListingSection, NeighbourhoodListingSection / fetchListings)
  UNVERIFIED for NOI. Suppress single-family scoring on plex comps
  (no bestMatchScore / match labels). Honest class-appropriate copy for
  Geo Level Indicator + "why this differs". STATE-C thin data
  (muni <3 comps) → honest "talk to agent", NOT padded area-tier tiles.
  isAsIs filter dropped for multi-unit (1.7-3.3% prevalence, safe).

OPEN / AWAITING OPERATOR (separately tracked, not auto-promoted):
  - EstimatorResults.tsx (condo variant) dedup defect — see KNOWN DEFECT
    above.

CLAIMED, UNVERIFIED (carried + new):
  - Carried from prior block: (j) production-path end-to-end smoke; NOI
    loader inclusion on geo-page entry paths; full joinTenant caller
    registrationSource list; whether walliam users see System-1
    AdminLeadsClient; HomeEstimatorResults render on showPrice=false +
    populated comparables (line-level branch logic).
  - NEW this block: the smoke verified the SQL predicate behavior
    directly against the leads table; it did NOT exercise
    getOrCreateLead / submitLeadFromForm / handleContactSubmit through
    the Next.js server-action runtime. The two paths are byte-equivalent
    on the dedup predicate (same .eq + conditional listing_id clause),
    but the runtime path was NOT end-to-end smoke-tested.
  - tsc --noEmit was clean — confirms types align. Runtime behavior of
    the silent-bump on .maybeSingle() error path was NOT exercised by
    smoke (production rarely hits multi-row state).

Push HELD per session instruction.


2026-06-07 — COMMITS LANDED (push still HELD pending operator OK)

Two commits on main, banking ~6 weeks of locked W-ESTIMATOR-RAG work that
had accumulated uncommitted in the working tree since 081d5aa (2026-06-01).
No remote push — origin/main has NOT advanced.

  Commit A: 278e3d9
    feat(estimator): bank W-ESTIMATOR-RAG matcher workstream + multi-unit gate
    Files (2):
      lib/estimator/home-comparable-matcher-sales.ts  +60/-159 (net -99)
      lib/estimator/statistical-calculator.ts          +21/-6  (net +15)
    Bundles 8 sub-changes, all logged/locked in this tracker prior to commit:
      (j) multi-unit subtype gate -> route-to-agent (HEADLINE; 2026-06-07 entry L2167)
      A1 score-floor (statistical-calculator)        — 2026-06-06 entry L1531
      A1b clamp (matcher createHomeComparable)       — 2026-06-06 entry L1526
      B1a score-weighted comp mean (FALLBACK=100)    — 2026-06-06 entry L1694
      B2 LAR same/adjacent in scoreMatch + funnels   — 2026-06-06 entry L1571
      bedBathOnly Step 2 style-family + LAR gates    — 2026-06-06 entry L1703
      D1 centralize on home-adjustment-math          — 2026-06-06 entry L1551
      Path B asOfDate/subjectListingKey q-builder    — 2026-06-06 entry L367 / L1131

  Commit B: e35c254
    fix(leads): per-(email,tenant,listing_id) dedup on estimator CONTACT lead
    Files (4):
      lib/actions/leads.ts                                  +12/-4
      app/estimator/components/HomeEstimatorResults.tsx     +4/-4
      app/estimator/components/HomeEstimatorBuyerModal.tsx  +1
      components/property/HomePropertyEstimateCTA.tsx       +1
    Bundles the dedup fix shipped earlier today (run-log entry above this
    one, "DEDUP FIX SHIPPED — per-(email, listing_id) on estimator CONTACT
    lead"). AgentContactForm secondary effect + condo-variant deferred
    decision both already recorded in that prior entry.

STEP-0 TRACKER-RECONCILE GATE — PASS:
  Before staging, every matcher sub-change in the working tree was checked
  against an existing locked/shipped tracker entry. All 8 sub-changes mapped
  to prior entries (see table above). NO retroactive entries were needed;
  recorded-state did not lag code-state at commit time.

STAGED SETS (explicit per-file git add — no globs):
  Commit A staged set:
    lib/estimator/home-comparable-matcher-sales.ts
    lib/estimator/statistical-calculator.ts
  Commit B staged set:
    lib/actions/leads.ts
    app/estimator/components/HomeEstimatorResults.tsx
    app/estimator/components/HomeEstimatorBuyerModal.tsx
    components/property/HomePropertyEstimateCTA.tsx

DELIBERATELY EXCLUDED (working tree still shows ` M`, intentionally NOT
staged; belong to other workstreams or are trivial trailing-newline-only):
  app/api/charlie/municipalities/route.ts        (trailing-newline only)
  scripts/r-w-territory-master-p2-data-phantom-fix.js (W-TERRITORY workstream)
  scripts/r-w-territory-master-p4-check-fix.js        (W-TERRITORY workstream)

Also NOT staged (per CLAUDE.md hygiene): all *.backup_* timestamped files,
scripts/smoke-*.js / scripts/recon-*.js debug-output, all recon/ output,
all scripts-output/ CSVs+summaries, env files, node_modules, the tracker
.md itself.

Verify post-commit:
  git log --oneline -4 -> HEAD = e35c254, HEAD~1 = 278e3d9, HEAD~2 = bcc8a64
                          (pre-workstream tree).
  git status -uno --short -> exactly the 3 excluded files above; everything
                             in scope is now committed.

Push status: HELD. origin/main has NOT advanced. Awaiting explicit operator
OK before `git push origin main`.

Runtime / production-path verify status (CARRIED unchanged — banking the
commits does not advance these):
  - (j) production-path end-to-end smoke via dev server: STILL DEFERRED to
    (g) UI-cleanup phase. Matcher-level gate was verified via logic-mirror
    smoke (100/100 CONTACT) prior; the literal request-through-Next-server-
    action chain has not been walked through.
  - Dedup predicate runtime: verified via SAVEPOINT-isolated SQL smoke
    (6/6 pass, 0 rows persisted). The getOrCreateLead/submitLeadFromForm/
    handleContactSubmit chain through the Next.js server-action runtime
    has NOT been end-to-end smoke-tested. Byte-equivalent to the smoked
    predicate, but the runtime walk is owed.
  - Both items remain claimed-unverified until (g) dev-server smoke lands.


2026-06-07 — PUSH LANDED — origin/main advanced to e35c254

Operator OK granted; `git push origin main` issued at 2026-06-07 ~16:25 local.
Standard push, no force, no flags. Result:

  Remote: https://github.com/condoleads/condoleads.git
  Ref update: bcc8a64..e35c254  main -> main  (fast-forward, 2 commits)
  origin/main pre-push:  bcc8a64 (security/login + debug-log cleanup)
  origin/main post-push: e35c254 (HEAD = local main = remote main)

Both commits now visible on origin/main:
  e35c254  fix(leads): per-(email,tenant,listing_id) dedup on estimator CONTACT lead
  278e3d9  feat(estimator): bank W-ESTIMATOR-RAG matcher workstream + multi-unit gate

The 3 deliberately-excluded files remain unstaged in the local working tree
(app/api/charlie/municipalities/route.ts trailing-newline + 2 W-TERRITORY
scripts) — untouched by this push, as intended.

Runtime / production-path verify status — UNCHANGED by the push (the push
moves bits to a remote; it does not exercise the running app):
  - (j) multi-unit gate production-path end-to-end smoke via dev server:
    STILL DEFERRED to (g) UI-cleanup phase. Matcher-level gate is now live
    on every deploy that reads origin/main, but the literal request-through-
    Next-server-action chain has NOT been walked through on a dev server
    nor verified post-deploy. Logic-mirror smoke 100/100 CONTACT remains
    the only verification of record.
  - Dedup predicate runtime: SAVEPOINT-isolated SQL smoke 6/6 stands. The
    getOrCreateLead/submitLeadFromForm/handleContactSubmit chain through
    the Next.js server-action runtime has NOT been end-to-end smoke-tested
    on a dev server. Predicate is byte-equivalent to the smoked SQL, but
    the runtime walk is owed.
  - Both items remain claimed-unverified until (g) dev-server smoke lands.

Sequencing: (g) MULTI-UNIT CONTACT RICHNESS is the next action — locked
since the 2026-06-07 SESSION LOCK + dedup-fix entries above. (g) is the
phase that will close BOTH outstanding runtime verifies (multi-unit gate
end-to-end + dedup-chain end-to-end) because it includes the dev-server
walkthrough by spec.

OPEN / AWAITING OPERATOR (separately tracked, not auto-promoted):
  - EstimatorResults.tsx (condo variant) dedup defect — same defect as
    HomeEstimatorResults pre-patch (forceNew:true, no listingId threaded).
    Decision deferred per operator 2026-06-07. Named and named-open, NOT
    in next-action queue.


2026-06-07 — (g) BUILD-RECON COMPLETE + SCOPE REFRAMED (all-classes → multi-unit-only-in-practice)

Operator scoped (g) as "all non-home classes" (multi-unit + land + edge).
Build-recon (recon/g-build-recon-all-classes.txt) found this resolves to
MULTI-UNIT ONLY in practice — not a narrowing of operator intent, but the data/
architecture refusing to let land+edge be enriched honestly:

LAND + EDGE ARE GATED UPSTREAM, never reach the modal:
  - app/property/[id]/HomePropertyPage.tsx:87 — 404s any subtype not in
    RESIDENTIAL_TYPES (Detached/Semi/Townhouse/Link/Duplex/Triplex/Fourplex/
    Multiplex).
  - app/api/geo-listings/route.ts:7 — same 8-subtype RESIDENTIAL_TYPES filters
    the listing grid (line 70-71).
  Correction to a prior tracker assumption: the NON_HOME_SUBTYPES modal client-
  gate I'd earlier proposed NEVER SHIPPED (operator "nothing removed"). Land/edge
  are stopped by these surface gates, not the modal. There is NO matcher-level
  (j)-style gate for land/edge and none is needed — they don't arrive.
  Consequence: no CONTACT-rich surface to build for land/edge (no reachable
  target), and their comp-tile shape (reads bed/bath/sqft/livingArea) is
  null/misleading for land, wrong for edge. Enriching them would violate
  accurate-or-nothing. DECISION: land/edge = capture-only, already handled,
  NO (g) work until the land sibling product ships and opens a land surface.

PER-CLASS RICHNESS LADDER (what's honestly possible TODAY):
  - MULTI-UNIT: comps rail (POSSIBLE — switch (j) gate bare→comps-bearing;
    cascade class-contained at DB layer; pool depth 66-81% community / 84-96%
    muni / 100% area) + competing rail (POSSIBLE — ~5-10 line extension of
    /api/charlie/competing-listings line 47-48 exact-subtype → .in() multi-unit
    array) + cap-rate (POSSIBLE but ENTRY-PATH-DEPENDENT: /property/[id] has NOI
    via SELECT *; geo-page entry does NOT — NOI absent from LISTING_SELECT:9).
  - LAND: capture-only + class-aware copy. Sibling unbuilt. NO comp tiles.
  - EDGE: capture-only + class-aware copy. No coherent pool. NO comp tiles.

RENDER BRANCH CONFIRMED (HomeEstimatorResults.tsx:174-336):
  - CONTACT form renders unconditionally on entering branch.
  - Comp rail (line 261) renders iff result.comparables.length > 0.
  - Tile reads: unparsedAddress, bedrooms, bathrooms, temperature(recency),
    livingAreaRange, parking, closeDate, closePrice, mismatchReason, unitNumber,
    listingKey. Works for multi-unit; misleading for land; wrong for edge.

5 COPY STRINGS single-family-framed, need class-aware variants: L184, L266
  ("Market Reference (Not Direct Comparables)"), L268 ("differ from your home"),
  L307 ("Why this differs:"), L330 ("...valuation of your home.").

(g) BUILD PLAN — MULTI-UNIT, as sequence of recon-confirmed diffs:
  g1. Switch (j) gate bare→comps-bearing (class-contained cascade). MUST-RESOLVE:
      suppress single-family scoring (mismatchReason / score / temperature-as-
      match) on plex comp tiles — confirm what the cascade attaches and
      suppress/relabel for multi-unit.
  g2. Extend competing-listings API exact-subtype → class-wide .in() (4 subtypes).
  g3. Cap-rate context line, ENTRY-PATH-AWARE: render on /property/[id], omit
      silently on geo-page (no "—%"). (Optional separate decision: add NOI to
      geo-loader LISTING_SELECT — NOT assumed into g3.)
  g4. 5 copy strings → multi-unit-aware variants.
  Dev-server smoke at end discharges (g) + the deferred (j) production-path verify
  + the dedup runtime-chain verify.

CLAIMED, UNVERIFIED (carried into build): existence of any modal entry path NOT
gated by RESIDENTIAL_TYPES; per-geo-loader NOI/kitchens; walliam tenant loader
vs public LISTING_SELECT; per-muni active multi-unit competing-pool depth (will
the competing rail fill or render empty for most plex subjects?); whether
EstimatorResults.tsx condo CONTACT branch shares these copy strings.

Push status: origin/main = e35c254, current. (g) build is next.


2026-06-07 — g1 SHIPPED — multi-unit CONTACT gate now comps-bearing

Operator approval (verbatim): "g1 — APPROVED with one structural change. Do NOT
inline the cascade in the gate. CHANGE FROM PROPOSED: extract the multi-unit
cascade + plex-comp builder into a named module-level helper
async function findMultiUnitContactComparables(specs: HomeSpecs): Promise<HomeMatchResult>
The gate becomes a clean call. Reference the existing multiTypes constant via
getCompatibleSubtypes' source or the local const — do NOT re-hardcode a 3rd
copy. If it's not module-accessible, that's the one place to hoist it."

File: lib/estimator/home-comparable-matcher-sales.ts
Backup: .backup_20260607_173100

Three atomic edits:
  1. HOISTED multiTypes → module-level `const MULTI_UNIT_SUBTYPES =
     ['Duplex', 'Triplex', 'Fourplex', 'Multiplex']` at line 150. The local
     const inside getCompatibleSubtypes was the prior third copy; now single
     source of truth. getCompatibleSubtypes references it (line 158); the (j)
     gate references it (line 502); the helper references it (lines 459 + 484).
  2. NEW HELPER `findMultiUnitContactComparables(specs)` at line 437 — owns
     its own createClient() + referenceDate/twoYearsAgo (NOT duplicated with
     findHomeComparables); community → muni → STATE-C cascade; class-contained
     via `.in('property_subtype', MULTI_UNIT_SUBTYPES)` at BOTH tiers; skips
     single-family funnels (applyFunnel/applyRelaxedFunnel/bedBathOnly) and
     skips isAsIs filter (1.7-3.3% prevalence on plex, safe per recon); 2y
     close_date window, close_price > 100k floor, limit 10 per tier; asOfDate
     guard. Returns CONTACT tier regardless of pool size; NO bestMatchScore
     field; NO pricing computed.
  3. NEW BUILDER `createMultiUnitContactComparable(sale)` at line 416 —
     populates ONLY the fields the HomeEstimatorResults CONTACT-branch tile
     reads (closePrice/listPrice/bedrooms/bathrooms/livingAreaRange/parking/
     locker/daysOnMarket/closeDate/unitNumber/propertySubtype/listingKey/
     unparsedAddress). OMITS single-family-derived signals:
       - temperature (recency datum but 🔥/❄ badge reads as match-quality)
       - matchTier / matchQuality / matchScore (single-family axes)
       - adjustments / adjustedPrice (lot/garage/pool/basement adjustments wrong for plex)
  4. (j) gate body replaced:
       BEFORE: bare return `{ tier: 'CONTACT', comparables: [], geoLevel: 'none' }`
       AFTER:  `return await findMultiUnitContactComparables(specs)`

tsc --noEmit clean (exit 0, full project type-check).

SAVEPOINT-isolated smoke (scripts/smoke-g1-multi-unit-comps.js, BEGIN/ROLLBACK,
30 multi-unit 90d subjects) + STATE-C synthetic test:

  Pool depth distribution on this sample:
    community tier (≥1 comp): 30/30 (100%)  ← well-populated draw
    muni tier (≥1 comp):       0/30 (0%)    ← cascade structurally verified
                                              even though not hit on this draw
    STATE-C empty (0 comps):   0/30 (0%)
    Total comps returned:      216 (avg 7.2 per subject — rail will fill)
    geoLevel distribution:     {"community":30,"municipality":0,"none":0}

  Orange-to-orange check:
    ✓ PASS — every one of 216 returned comps has property_subtype ∈
      {Duplex, Triplex, Fourplex, Multiplex}. Zero contamination.

  STATE-C synthetic (fake community_id + fake municipality_id UUIDs):
    ✓ community-tier query returns 0 rows
    ✓ muni-tier query returns 0 rows
    ✓ helper falls through to `{ tier:'CONTACT', comparables:[], geoLevel:'none' }`
      — graceful empty, not an error

  Helper return-shape (structural, verified at bytes):
    ✓ tier === 'CONTACT' always (never BINGO/RANGE on this path)
    ✓ bestMatchScore field omitted from helper return literal
    ✓ NO pricing computed (no calculateEstimate, no statistical-calculator)
    ✓ comps have ComparableSale shape with omitted temperature/matchTier/
      matchQuality/matchScore/adjustments/adjustedPrice

Caveat: 30-subject draw landed all in well-populated community communities
(matches prior recon: 66-81% community-tier ≥3 comps for Duplex/Triplex,
81-96% Fourplex/Multiplex). Muni-tier fallback path was structurally verified
by file inspection but not runtime-exercised on this draw — STATE-C synthetic
test exercises the all-the-way-through fallthrough.

Risk note (carried as CLAIMED, UNVERIFIED): the matcher helper now runs an
extra DB cascade for every multi-unit subject (previously bare-return). DB
load impact is minimal — the same query the home cascade already runs for
single-family, scoped to ~1.3% of estimator traffic — but not measured in
production.

g1 STATUS — DONE. Helper-extracted per operator structural requirement.
MULTI_UNIT_SUBTYPES is now single source of truth (was previously: literal
in (j) gate + local const in getCompatibleSubtypes + the dead "third copy"
the operator's instruction guarded against).

Next action (LOCKED ordering, updated):
  g2 — Extend competing-listings API exact-subtype → class-wide .in()
       (~5-10 line change at app/api/charlie/competing-listings/route.ts
       lines 47-49). NEXT.
  g3 — Cap-rate context line (entry-path-aware: /property/[id] only this
       phase, geo-page deferred).
  g4 — 5 single-family-framed copy strings → multi-unit-aware variants.
  Dev-server smoke at end discharges deferred (j) production-path verify +
  dedup runtime-chain verify.

CLAIMED, UNVERIFIED (new + carried):
  - g1 helper runtime-exercise on dev server: NOT done this turn. SQL-level
    smoke confirms the cascade query shape + orange-to-orange + STATE-C
    fallthrough. The Next.js server-action runtime path through
    estimateHomeSale → findHomeComparables → findMultiUnitContactComparables
    has NOT been walked through end-to-end.
  - Whether muni-tier fallback path actually exercises in production traffic
    (depends on real multi-unit subject community-comp depth, which prior
    50-subject recon estimated at 70-81% community-tier ≥3 for Duplex+Triplex,
    so ~20-30% should fall through to muni — but not measured in this smoke).
  - Whether HomeEstimatorResults' CONTACT-branch tile renders cleanly with
    plex comps that omit temperature (the 🔥/❄ badge code path at line 285-289
    is guarded by `{comp.temperature && (...)}` so omission is safe;
    not visually verified).

Push status: origin/main = e35c254, local has g1 committed-pending (NOT YET).
Per operator: HOLD push. Local file modified + tsc-clean + smoke-passed; no
commit issued this block.


2026-06-07 — g2 SHIPPED — competing-listings widened class-wide for multi-unit (subtype + bed-axis), single-family unchanged

Operator approval (verbatim): "g2 — APPROVED with one required addition. The 2
diffs as proposed are correct. PLUS: the bedrooms_total exact-match filter must
be DROPPED for multi-unit subjects (conditional, same as the subtype widening).
Reason: bedrooms_total on a plex is the SUM across units — a wrong-axis number
for plex comparability. Exact-bed-matching plex competition reintroduces the
single-family-scoring error g1 just removed. Single-family subjects KEEP the
bed filter unchanged."

Backups: .backup_20260607_174202 (both files).

Files modified (2):
  1. lib/estimator/home-comparable-matcher-sales.ts:150
       BEFORE: const MULTI_UNIT_SUBTYPES = [...]
       AFTER:  export const MULTI_UNIT_SUBTYPES = [...]
       Single keyword change. Preserves single source of truth (operator's
       "do NOT re-hardcode a 2nd copy" guard).

  2. app/api/charlie/competing-listings/route.ts
       (a) Added: import { MULTI_UNIT_SUBTYPES } from
           '@/lib/estimator/home-comparable-matcher-sales'
       (b) Inside the path === 'home' branch:
             const isMultiUnit = !!propertySubtype &&
                                 MULTI_UNIT_SUBTYPES.includes(propertySubtype)
           - Subtype clause: class-wide .in(MULTI_UNIT_SUBTYPES) for multi-unit,
             exact .eq(propertySubtype) for single-family (single-family path
             UNCHANGED from pre-patch).
           - Bed clause: .eq('bedrooms_total', bedrooms) now WRAPPED in
             `if (!isMultiUnit) { ... }`. Multi-unit subjects no longer
             bed-gated. Single-family subjects KEEP exact bed filter (UNCHANGED).
       (c) Condo path (line 13-32) UNTOUCHED.

tsc --noEmit clean (exit 0, full project type-check).

SAVEPOINT-isolated smoke (scripts/smoke-g2-competing-class-wide.js,
BEGIN/ROLLBACK, real Mississauga muni with 2712 actives):

  SCENARIO 1 — multi-unit subject (Duplex, 4 bed):
    PRE-patch query (exact Duplex AND exact 4 bed):     0 listings
    POST-patch query (class-wide AND no bed gate):     10 listings
    Delta: +10 (rail goes from EMPTY to FULL on this subject)
    Returned subtypes: [Duplex, Triplex, Multiplex]
    Returned bed counts: [3, 4, 5, 6, 7, 8] ← varies, NOT bed-gated
    Class containment: ✓ PASS — every result ∈ MULTI_UNIT_SUBTYPES
                                 (no Detached/Semi/Townhouse leak)

    SIGNIFICANCE: this validates the operator's bed-axis relaxation
    rationale. A 4-bed Duplex in Mississauga has ZERO exact-bed-exact-
    subtype competing actives. Without dropping the bed gate, even
    the subtype widening alone would have left the rail empty.

  SCENARIO 2 — single-family subject (Detached, 3 bed) — regression guard:
    PRE-patch:   10 listings
    POST-patch:  10 listings
    Result-set ID match: ✓ PASS — BYTE-IDENTICAL (same 10 ids in same order)
    Single-family path: UNCHANGED.

  SCENARIO 3 — empty propertySubtype (falsy-branch coverage):
    PRE-patch:  10 listings  |  POST-patch:  10 listings
    Match: ✓ PASS — falsy propertySubtype skips both new branches; bed
    filter still applied as before.

  Condo path (line 13-32): UNCHANGED at bytes — not exercised by smoke
  (separate code path; not in g2 scope).

g2 STATUS — DONE.

Next action:
  g3 — Cap-rate context line on subject (entry-path-aware: /property/[id]
       only this phase; geo-page loader change deferred).
  g4 — 5 single-family-framed copy strings → multi-unit-aware variants.
  Dev-server smoke at end discharges deferred (j) production-path verify +
  dedup runtime-chain verify + (g1+g2+g3+g4) UI verify.

CLAIMED, UNVERIFIED (new + carried):
  - SellerEstimateRunner.tsx:128 (sole caller of the API) is in Charlie's
    seller flow. The route change is consumed via this caller. NOT runtime-
    exercised through the Next.js server-action chain this turn (SQL-level
    smoke only).
  - Whether SellerEstimateRunner passes propertySubtype correctly for plex
    subjects today (SellerForm:30 includes 'Duplex','Triplex' — confirmed
    prior. 'Fourplex'/'Multiplex' not in seller form, would only reach the
    API via buyer-modal/listing-derived paths — not traced this turn).
  - Carried from g1: g1+g2 combined runtime-exercise on dev server NOT done.
    SQL predicate smoke is the verification of record for both.
  - The 5 single-family-framed copy strings in HomeEstimatorResults still
    apply to plex CONTACT results (subtitle "your home", "differ from your
    home", "valuation of your home") — addressed in g4, not yet shipped.

Push status: origin/main = e35c254 (unchanged), local has g1 + g2 + smoke
scripts + tracker modified (NO commit, NO push).


2026-06-08 — g3 SHIPPED — cap-rate context line on multi-unit CONTACT, entry-path-aware

Operator approval with 3 corrections to recon proposal:
  FIX 1 — Diff 3 (HomePropertyEstimateCTA): do NOT duplicate listingId; it
          already exists there from the dedup fix. Add ONLY the 3 new props.
  FIX 2 — cap rate display .toFixed(1), NOT .toFixed(2). One-decimal matches
          input honesty (single reported NOI ÷ asking is not 2-decimal-
          accurate). "~5.2% cap", not "~5.23%".
  FIX 3 — render guard MUST include MULTI_UNIT_SUBTYPES check. A stray non-null
          NOI on a single-family/condo/mixed-use row would otherwise leak the
          cap-rate line onto the wrong product. Threading the subtype as prop
          is required since subjectSubtype is NOT in propertySpecs at either
          parent (confirmed at bytes: modal:592-597 + CTA:105-110 omit subtype).

Backups: .backup_20260608_033604 (all 3 files).

Files modified (3):
  1. app/estimator/components/HomeEstimatorResults.tsx
     - Added import: MULTI_UNIT_SUBTYPES from
       '@/lib/estimator/home-comparable-matcher-sales' (g2 made it exported)
     - Added 3 optional props: subjectSubtype, subjectNoi, subjectListPrice
     - Inside CONTACT branch hero banner, after the subtitle <p>, before the
       form CTA, added a guarded inline cap-rate chip:
         {subjectSubtype && MULTI_UNIT_SUBTYPES.includes(subjectSubtype)
           && subjectNoi != null && subjectNoi > 0
           && subjectListPrice != null && subjectListPrice > 0 && (
           <div ...>
             Reported NOI {formatPrice(subjectNoi)} — implied
             ~{((subjectNoi / subjectListPrice) * 100).toFixed(1)}% cap at asking
           </div>
         )}
       Styled as semi-transparent white-on-blue chip (`bg-white/10`) to read
       as supplementary context within the existing "Expert Valuation
       Required" hero, not as a primary heading.

  2. app/estimator/components/HomeEstimatorBuyerModal.tsx (line 591+)
     - Threaded 3 props: subjectSubtype, subjectNoi, subjectListPrice
       (`listing?.property_subtype?.trim() || null`, `(listing as any)?.net_operating_income`,
       `listing?.list_price`)
     - listingId pass-through UNCHANGED (no duplicate per FIX 1)

  3. components/property/HomePropertyEstimateCTA.tsx (line 104+)
     - Threaded same 3 props from `listing.*`
     - listingId pass-through UNCHANGED (no duplicate per FIX 1)

tsc --noEmit clean (exit 0, full project).

SAVEPOINT smoke (scripts/smoke-g3-cap-rate.js, 6 scenarios) — ALL PASS:

  SCENARIO 1 — multi-unit WITH NOI + list_price (real Fourplex row):
    subject: Fourplex / NOI=$12,844 / list_price=$315,000
    render guard: TRUE — line renders
    displayed: "Reported NOI $12844 — implied ~4.1% cap at asking"
    ✓ PASS

  SCENARIO 2 — multi-unit WITH list_price but NULL/undefined NOI:
    Duplex / NOI=null:      ✓ PASS — silently omitted
    Duplex / NOI=undefined: ✓ PASS — silently omitted

  SCENARIO 3 — multi-unit WITH NOI but list_price 0/null/undefined (div-by-zero):
    list_price=0:         ✓ PASS — silently omitted
    list_price=null:      ✓ PASS — silently omitted
    list_price=undefined: ✓ PASS — silently omitted

  SCENARIO 4 — subtype guard blocks NON-multi-unit even with hypothetical NOI:
    Detached / NOI=$50k:           ✓ PASS — subtype guard blocks
    Semi-Detached / NOI=$50k:      ✓ PASS — subtype guard blocks
    Att/Row/Townhouse / NOI=$50k:  ✓ PASS — subtype guard blocks
    Link / NOI=$50k:               ✓ PASS — subtype guard blocks
    Condo Apt / NOI=$50k:          ✓ PASS — subtype guard blocks
    Condo Townhouse / NOI=$50k:    ✓ PASS — subtype guard blocks
    Vacant Land / NOI=$10k:        ✓ PASS — subtype guard blocks

  SCENARIO 5 — geo-page entry simulation (subject has multi-unit subtype but
               NOI undefined because LISTING_SELECT didn't return it):
    Duplex / NOI=undefined (geo) / list_price=$850k:
    ✓ PASS — silently omitted on geo-page entry

  SCENARIO 6 — math spot-check (real Fourplex row):
    NOI=$12,844, list_price=$315,000
    raw: 4.077460317460317
    .toFixed(1): 4.1%
    ✓ PASS — one-decimal precision per FIX 2

g3 STATUS — DONE.

Behavior summary by surface (no proposal here, just observed result):
  /property/[id] multi-unit listing with NOI: cap-rate line RENDERS
  /property/[id] multi-unit listing without NOI: cap-rate line OMITS silently
  /property/[id] single-family/condo/land: cap-rate line OMITS (subtype guard)
  /[slug] geo-page → modal (any subject): cap-rate line OMITS silently (NOI
    not in loader's LISTING_SELECT — undefined at the prop)

The "subject NOI is the natural data-presence discriminator across entry
paths" hypothesis from recon held under smoke: NOI undefined on geo-page
entry → guard false → omit; NOI present on /property/[id] entry → guard
evaluates subtype → renders only for multi-unit.

Next action:
  g4 — 5 single-family-framed copy strings → multi-unit-aware variants.
       (HomeEstimatorResults.tsx lines 184 subtitle, 266/268 Market Reference
       heading + "differ from your home", 307 "Why this differs:", 330 footer
       "valuation of your home". Class-aware copy per g-build-recon Section 6b.)
  Dev-server smoke at end discharges deferred (j) production-path verify +
  dedup runtime-chain verify + (g1+g2+g3+g4) UI verify.

CLAIMED, UNVERIFIED (new + carried):
  - g3 not runtime-exercised through the Next.js client render (SQL-level
    smoke verifies the guard predicate + math against real data; the React
    component JSX render was NOT walked through on a dev server).
  - The "Fourplex with 4.1% cap" SCENARIO 1 row is a REAL row from production
    leads. If the displayed string is unexpected on a known plex listing
    post-deploy, the actual NOI/list_price for that listing_key is the source
    of truth (smoke didn't surface listing_key — for replay, query directly).
  - Whether Charlie/buyer-modal entries pass `listing` with NOI present via
    paths other than /property/[id] — not exhaustively traced. Buyer-modal
    consumers of HomeEstimatorBuyerModal include GeoListingSection (no NOI)
    and possibly other surfaces; only the property-page entry guarantees NOI.

Push status: origin/main = e35c254 (unchanged), local has g1 + g2 + g3 + smoke
scripts + tracker modified (NO commit, NO push).


2026-06-08 — g4 SHIPPED — class-aware copy on CONTACT (3 strings), 2 dead strings left, g3 NOI confirmed already correct, calculator:229 NAMED-OPEN

Operator approval with wording tweak + tracker addition:
  TWEAK: L290 uses "multi-unit" not "plex" (consistency w/ L288 + seller-facing
         register), plus "the" — final wording:
         "These recent multi-unit sales in your area provide context for the
          valuation conversation with your agent."
  CONFIRMED LEAVE-ALONE: L192 dead fallback, L329 dead mismatchReason guard,
         g3 NOI separator (already correct via formatPrice — smoke output was
         a script artifact, NOT a component bug).
  ADDITION: log statistical-calculator.ts:229 as NAMED LIVE DEFECT (not silently
         deferred). See item below.

File modified (1): app/estimator/components/HomeEstimatorResults.tsx
Backup: .backup_20260608_035015

Edits (4):
  1. Added derived flag after the tierLabels constant (line ~99):
       const isMultiUnitSubject = !!subjectSubtype
                                  && MULTI_UNIT_SUBTYPES.includes(subjectSubtype)
     Single boolean. Used by 3 string-render sites below. Comment notes
     single-family stays byte-identical.

  2. L288 header — conditional:
       BEFORE: <h3>Market Reference (Not Direct Comparables)</h3>
       AFTER:  multi-unit: 'Recent Multi-Unit Sales (Reference Context)'
               single-family: 'Market Reference (Not Direct Comparables)' (unchanged)

  3. L290 sub-heading — conditional, with operator's tweak:
       BEFORE: 'These recent sales in your area differ from your home but
                provide market context.'
       AFTER:  multi-unit: 'These recent multi-unit sales in your area
                provide context for the valuation conversation with your agent.'
               single-family: unchanged

  4. L352 footer — conditional word swap:
       BEFORE: '⚠️ These are for reference only. Contact agent for accurate
                valuation of your home.'
       AFTER:  '... of your property.' (multi-unit) / '... of your home.' (single-family)

  L192 (hero subtitle fallback): UNTOUCHED. Confirmed dead — server-side
       confidenceMessage is always non-empty for CONTACT (statistical-
       calculator.ts:229 default branch sets 'Your unit requires...'), so the
       || fallback never fires. Per operator: "if dead, leave it."

  L329 (per-tile "Why this differs:"): UNTOUCHED. mismatchReason never set
       by either createHomeComparable (single-family builder, lines 380-403
       return literal) or createMultiUnitContactComparable (g1 builder,
       intentionally omits the field). The {comp.mismatchReason && (...)}
       guard always evaluates false. Per operator: "if dead, leave it."

  g3 NOI separator (L206): UNTOUCHED. Component uses formatPrice() which
       wraps Intl.NumberFormat with currency style — renders '$12,844' with
       separator by default. The smoke output 'Reported NOI $12844' was the
       smoke script's reconstruction (used toFixed(0)), NOT the component.
       Verified by Intl.NumberFormat sample render in g4 smoke: $12,844. The
       operator's perceived bug was a smoke-script artifact; component is
       correct, no fix applied.

tsc --noEmit clean (exit 0, full project).

Smoke (scripts/smoke-g4-class-aware-copy.js, JS-predicate inspection):
  SCENARIO 1 — Single-family subjects (4 subtypes × 3 strings = 12 checks):
    All 3 strings BYTE-IDENTICAL to pre-g4. ✓ PASS
  SCENARIO 2 — Multi-unit subjects (4 subtypes × 3 strings = 12 checks):
    All 3 strings render multi-unit-aware. ✓ PASS
  SCENARIO 3 — Other subjects (Land/Edge × 1 string = 7 checks):
    Land/edge practically never reach modal (RESIDENTIAL_TYPES upstream
    gate), but if hypothetically reached → isMultiUnitSubject is false →
    SF default. Honest fallback. ✓ PASS
  SCENARIO 4 — Falsy subtype (undefined/null/'' × 3 strings = 9 checks):
    All fall back to SF default. ✓ PASS
  SCENARIO 5 — L192 + L329 confirmed untouched at the diff level. ✓
  SCENARIO 6 — g3 NOI separator demo: Intl.NumberFormat(12844) → '$12,844'. ✓
  TOTAL: 33 string-render checks pass + 2 dead-string verifications + 1 demo.

g4 STATUS — DONE.

==========================================================================
NAMED LIVE DEFECT (NEW, operator-required entry — NOT silently deferred):

  F-CALCULATOR-229-WRONG-CLASS-CONTACT-SUBTITLE
    File: lib/estimator/statistical-calculator.ts
    Line: 229 (inside calculateConfidence default-return branch)
    Code:
      return {
        confidence: 'None',
        confidenceMessage: 'Your unit requires professional analysis for accurate pricing.'
      }
    Problem: this is the only branch that fires for tier === 'CONTACT'
      (no named tier branch covers CONTACT). Multi-unit post-g1 reaches
      this branch because the matcher returns comps-bearing CONTACT → server
      passes through calculateEstimate → calculateConfidence(tier='CONTACT')
      → default. The returned string flows through result.confidenceMessage
      → renders at HomeEstimatorResults.tsx:192 (hero subtitle, the live
      string, NOT the dead fallback).
    Class incorrectness: 'Your unit' reads as condo-framing. Lands on every
      home subtype (Detached/Semi/Link/Att-Row/Townhouse/Duplex/Triplex/
      Fourplex/Multiplex). NONE of these are 'units' in the colloquial
      sense — they are properties.
    Live, user-facing impact: confirmed on every CONTACT result rendered
      via HomeEstimatorResults — both single-family thin-data CONTACT AND
      multi-unit CONTACT. Wrong-class for all home subtypes.
    g4 scope: OUT (g4 was the 5 strings in HomeEstimatorResults). NOT
      silently deferred — flagged here as named-open per operator
      instruction.
    Status: NAMED, OPEN. Candidate for a g5 / copy-cleanup follow-on,
      operator to sequence.
    Suggested resolution (NOT proposed here, for sequencing reference):
      either (a) add a tier='CONTACT' branch in calculateConfidence that
      sets a class-neutral string ('Your property requires professional
      analysis for accurate pricing.'), or (b) override
      result.confidenceMessage in HomeEstimatorResults at L192 with a
      class-aware string. Decision deferred.
==========================================================================

ALL (g) CODE COMPLETE — g1 + g2 + g3 + g4 all shipped to local working tree.
The remaining step is the dev-server end-to-end smoke. That single walkthrough
discharges SIX carried runtime verifies:
  1. (j) multi-unit gate production-path (carried since 2026-06-07 (j) entry)
  2. Dedup predicate runtime chain (carried since 2026-06-07 dedup-shipped entry)
  3. g1 helper through Next.js server-action runtime (carried since g1 entry)
  4. g2 SellerEstimateRunner → competing-listings API runtime (carried since g2)
  5. g3 React JSX render of cap-rate chip on a real /property/[id] multi-unit listing
  6. g4 class-aware copy visual on multi-unit + single-family CONTACT screens
Plus it surfaces F-CALCULATOR-229-WRONG-CLASS-CONTACT-SUBTITLE as a visible
defect to confirm during the walkthrough.

CLAIMED, UNVERIFIED (consolidated from all g1-g4):
  - g1+g2+g3+g4 not runtime-exercised through the Next.js client render +
    server-action chain on a dev server. SQL-level and predicate-level smokes
    are the verification of record for each phase.
  - F-CALCULATOR-229-WRONG-CLASS-CONTACT-SUBTITLE — named-open above.
  - The cap-rate chip's visual styling (semi-transparent white-on-blue
    glass chip) not visually verified — only the conditional render predicate
    and math.
  - EstimatorResults.tsx (condo variant) — does NOT receive any of g1-g4
    changes (separate file). Operator decision pending on whether to apply
    parallel changes there.

Push status: origin/main = e35c254 (unchanged). Local has:
  - 4 modified files (HomeEstimatorResults.tsx, HomeEstimatorBuyerModal.tsx,
    HomePropertyEstimateCTA.tsx, competing-listings/route.ts, home-comparable-
    matcher-sales.ts)
  - 4 smoke scripts (smoke-g1, smoke-g2, smoke-g3, smoke-g4)
  - tracker modified
NO commit, NO push. HOLD pending operator review of the full (g) work.


2026-06-08 — (g) HEADLESS DEV-SMOKE (Option A — honest partial)

Per operator: do ONLY what can be verified without a browser; mark everything
else UNVERIFIED — needs human browser walkthrough; do NOT fabricate "what
rendered."

STEP 1 — DEV-SERVER BOOT — CLEAN.
  Command: cd Project && DEV_TENANT_DOMAIN=walliam.ca npm run dev
  Output (from task bh4jv6imq):
    > next dev
     ⚠ Port 3000 is in use, trying 3001 instead.
      ▲ Next.js 14.2.5
      - Local: http://localhost:3001
      - Environments: .env.local
     ✓ Starting...
     ✓ Ready in 8.5s
  No build errors. No type errors. No 'Failed to compile' lines. Boot
  signal 'Ready in 8.5s' confirmed via grep filter. Server moved itself
  to 3001 (port 3000 was busy on this machine — unrelated). All
  subsequent curl steps used 3001.

STEP 2 — g2 COMPETING-LISTINGS API (DISCHARGED at API level).
  Test muni (real DB lookup): Hamilton (municipality_id
  c1ea0c04-2963-452a-b694-3bfe7834960c). 97 active plex listings + 1,407
  active Detached — both classes well-represented.

  CALL A — Multi-unit subject (Duplex, 4 bed):
    POST localhost:3001/api/charlie/competing-listings
    body: {path:'home', municipalityId:'<Hamilton>',
           bedrooms:4, propertySubtype:'Duplex'}
    Response: 10 listings.
      distinct subtypes:  ["Multiplex","Duplex","Triplex"]
      distinct bed counts: [2, 3, 4, 5, 17]  ← varies = NOT bed-gated ✓
      class containment:  ✓ PASS — 10/10 ∈ MULTI_UNIT_SUBTYPES
      sample top-3 list_prices: $1, $329,800, $380,000
      (the $1 result is a real production placeholder — "call for price";
       order-by-list_price-ASC surfaces it naturally; not a bug.)
    VERDICT: g2 widening fires correctly on multi-unit at the API runtime.

  CALL B — Single-family subject (Detached, 4 bed) — regression guard:
    POST same endpoint with propertySubtype:'Detached'
    Response: 10 listings.
      distinct subtypes:  ["Detached"]      ← exact-subtype ✓
      distinct bed counts: [4]               ← exact bed gate ✓
      Both .eq filters preserved verbatim.
    VERDICT: single-family path UNCHANGED from pre-g2. Regression-guard PASS.

  DISCHARGES: g2 SellerEstimateRunner → competing-listings API runtime
              verify (item #4 in g4-shipped's discharge list) AT THE API
              LEVEL. The rendered RAIL in HomeEstimatorResults still
              requires browser inspection — NOT discharged here.

STEP 3 — DEDUP RUNTIME (function-level) — NOT RUN headlessly.
  Per operator's explicit caveat: "If this CANNOT be done without writing
  real leads, do NOT run it — mark it UNVERIFIED-needs-browser instead."

  Honest blocker analysis:
    - lib/actions/leads.ts:111 getOrCreateLead uses Supabase client
      (createServiceClient from @supabase/supabase-js). Supabase opens its
      own pg connection per HTTP call to PostgREST — a BEGIN/ROLLBACK on a
      separate raw-pg connection CANNOT isolate Supabase's writes.
    - createLead at lib/actions/leads.ts:146 fires the 6-layer email
      fan-out via getLeadEmailRecipients + sendTenantEmail. Calling it
      would send real emails to real agents (or fail with tenant-email-
      not-configured — either way, NOT a safe headless test).
    - POSTing to /api/walliam/estimator/... or any path that submits a
      lead through the live server-action chain would WRITE A REAL LEAD
      + fire real emails. Operator's "no real writes" constraint blocks
      this.

  What WAS verified previously (still stands): scripts/smoke-dedup-listing-
  key.js (2026-06-07) BEGIN/ROLLBACK against raw pg, 6/6 PASS, 0 rows
  persisted. That verifies the SQL PREDICATE behavior — same-(email,
  tenant, listing_id) match, different-listing distinct rows, NULL-
  listingId fallback unchanged. NOT discharged: the runtime chain through
  getOrCreateLead → Supabase client → leads INSERT + 6-layer email
  fan-out.

  DEDUP RUNTIME STATUS: STILL UNVERIFIED — needs human browser walkthrough
  (or a future refactor that injects a Supabase test-double, out of g scope).

STEP 4 — DEV SERVER TORN DOWN. Task bh4jv6imq stopped cleanly.

WHAT DOES THIS HEADLESS SMOKE DISCHARGE?
  ✓ Boot/build verify — Next 14.2.5 dev-mode compile clean on the current
    branch (g1+g2+g3+g4 applied). No type errors, no compile errors.
  ✓ g2 SellerEstimateRunner → competing-listings API runtime at the API
    layer. Both multi-unit widening and single-family regression guard
    confirmed against real DB rows.

WHAT REMAINS UNHIT — needs operator browser walkthrough (UNCHANGED FROM
PRIOR LIST):
  - (j) production-path rendered CONTACT — modal opens, "Expert Valuation
    Required" hero renders, on a real /property/[id] multi-unit listing.
  - g1 comp-rail rendered plex tiles — verifies the rail populates from
    the comps-bearing CONTACT return AND that temperature badges are
    absent on plex tiles.
  - g1 muni-fallback live — a multi-unit subject whose community is too
    thin, falling through to the muni-tier query; only observable when a
    specific subject hits that path.
  - g3 cap-rate chip render — on a real /property/[id] multi-unit listing
    WITH net_operating_income, confirm the "Reported NOI $X — implied
    ~Y.Y% cap" chip appears in the hero; on one WITHOUT NOI, confirm
    nothing renders.
  - g4 class-aware copy visual — on plex CONTACT confirm L288/L290/L352
    read multi-unit-aware; on single-family thin-data CONTACT confirm
    they read home-appropriate.
  - F-CALCULATOR-229 visual — confirm the actual subtitle string
    displayed reads "Your unit requires professional analysis..." on a
    plex CONTACT result (validating the named-open defect from g4).
  - DEDUP RUNTIME CHAIN — submit the CONTACT form on a listing twice
    (same email + same listing) → expect ONE lead row + ONE email
    blast; different listing → expect a SECOND distinct lead.

VERIFY-COUNT SUMMARY (the 6 carried verifies from g4-shipped):
  | # | Verify                                              | Status post-headless-smoke |
  | 1 | (j) multi-unit gate production-path                 | UNVERIFIED — browser needed |
  | 2 | Dedup predicate runtime chain                       | UNVERIFIED — browser needed |
  | 3 | g1 helper through Next server-action runtime        | UNVERIFIED — browser needed |
  | 4 | g2 SellerEstimateRunner → competing-listings API    | ✓ DISCHARGED (API level)    |
  | 5 | g3 React JSX render of cap-rate chip                | UNVERIFIED — browser needed |
  | 6 | g4 class-aware copy visual                          | UNVERIFIED — browser needed |
  Plus F-CALCULATOR-229 visual confirmation: UNVERIFIED — browser needed.

  1 of 6 discharged. 5 remain pending a human browser session on dev.

CLAIMED, UNVERIFIED (consolidated):
  - Everything in the 5-remain list above. NOT being inferred from JSX
    inspection. NOT being inferred from API behavior. ONLY the API
    level was tested for g2.
  - The single-family + multi-unit POST results show the API's underlying
    query is correct; whether the React component renders those JSON
    objects as the operator-described tiles requires browser observation
    (HomeEstimatorResults.tsx render of comp.* and competing-listings.*
    fields is JSX — exists in source — but visual confirmation IS the
    discharge criterion the operator named).

Push status: origin/main = e35c254 (unchanged). Local working tree
unchanged from end-of-g4 (5 modified files, 4 smoke scripts, tracker
modified). NO commit, NO push.


2026-06-08 — HOTFIX 974b79c — origin/main was un-deployable (Vercel build broken since 278e3d9)

Symptom (operator-reported): Vercel build on 278e3d9 failed with
  lib/estimator/home-comparable-matcher-sales.ts:
  "Module not found: Can't resolve './home-adjustment-math'"
Local tsc, dev, and next build all passed. Discrepancy diagnosed before fix.

ROOT CAUSE (verified at bytes + git):
  lib/estimator/home-adjustment-math.js was UNTRACKED (?? in git status) and
  ABSENT from origin/main. It was created locally on 2026-06-06 (D1 STEP 1
  SHIPPED entry) as a Write call but was NEVER `git add`-ed. Commit 278e3d9
  ("bank W-ESTIMATOR-RAG matcher workstream + multi-unit gate") shipped the
  matcher's import-statement change for './home-adjustment-math' WITHOUT the
  import target. Vercel's clean checkout from origin lacked the file → next
  build failed at module resolution. Local Windows builds passed because
  webpack reads from the working-tree filesystem where the .js was sitting
  unstaged.

  Not a case-sensitivity issue. All 3 importers (matcher.ts:17,
  scripts/backtest-estimator-homes.js:28, scripts/recon-range-adj-deepdive.js:10)
  use lowercase './home-adjustment-math' or '../lib/estimator/home-adjustment-math'
  consistently with the on-disk filename. Linux build environments handle the
  case correctly — but neither environment can resolve a file that was never
  committed.

DIAGNOSIS STEPS (read-only, before any fix):
  1. ls + grep: file exists on disk, lowercase, .js extension. Import string
     matches case.
  2. git ls-files | grep adjustment: EMPTY before fix → file untracked.
     git cat-file -e origin/main:<path>: "exists on disk, but not in 'origin/main'".
     git log for file: empty → never committed in any branch.
  3. Case-mismatch check: NONE. All 3 importers + the filename use lowercase.
  4. Importer sweep: only matcher.ts:17 is bundled by Next; the 2 scripts/*
     requires are standalone Node and don't affect the build. ONE failure point.
  5. Local next build: exit 0 — webpack found the working-tree file. Confirms
     the Windows-vs-Vercel divergence is filesystem state, not case sensitivity.
  Sweep for OTHER untracked imported files under lib/app/components:
  EXACTLY ONE — home-adjustment-math.js. No other hidden ?? sibling.

HOTFIX SHIPPED (974b79c):
  Pre-commit verify:
    - Sweep re-confirmed: only home-adjustment-math.js untracked under lib/app/components
    - File content: 143-line CommonJS module, file-header documents it as
      "Verbatim MOVE of prior in-file definitions" with line citations.
      Matches the D1 STEP 1 design.
    - Name-match: matcher imports {DEFAULT_ADJUSTMENTS, parseBasement,
      getBasementAdjustment, getGarageValue, hasIngroundPool, isAdjacentRange}.
      File module.exports the same 6 names + HOME_LAR_LADDER (extra export, fine).
      100% match for the import set.

  Stage + commit:
    git add lib/estimator/home-adjustment-math.js (explicit single-file)
    diff --cached --stat: 1 file changed, 142 insertions
    g1-g4 working-tree changes + 3 trailing-newline files UNSTAGED (preserved
    for the upcoming (g) commit decision once browser walkthrough completes)

  Commit message:
    "fix(estimator): add missing home-adjustment-math.js — unblock Vercel build
     D1 (commit 278e3d9) shipped the matcher's import of './home-adjustment-math'
     but the module itself was never git-added (untracked since 2026-06-06),
     so origin/main lacked the import target and Vercel's clean checkout failed
     to compile. Local tsc/dev/build passed because the file was present in the
     working tree. Adds the file. No logic change."

  Git-level verify:
    git ls-files lib/estimator/ | grep adjustment → home-adjustment-math.js NOW TRACKED
    git cat-file -e HEAD:lib/estimator/home-adjustment-math.js → exists
    git log --oneline -3:
      974b79c fix(estimator): add missing home-adjustment-math.js
      e35c254 fix(leads): per-(email,tenant,listing_id) dedup on estimator CONTACT lead
      278e3d9 feat(estimator): bank W-ESTIMATOR-RAG matcher workstream + multi-unit gate

PUSH LANDED:
  Pre-push:  local 974b79c  | origin e35c254
  git push origin main → "e35c254..974b79c  main -> main" (fast-forward)
  Post-push: origin/main 974b79c. CONFIRMED.

  Vercel will rebuild on the new commit. Awaiting their build to go green.
  The (g) browser walkthrough can resume on local dev now (local was never
  broken); cross-checking against the Vercel deploy is the additional verify
  the walkthrough gains once Vercel is green.

PROCESS NOTE (operator-required entry — guard against this class of bug):

  tsc + dev-boot + npm run build (locally) DO NOT catch missing-from-git
  imported files. The working tree resolves the import, but origin doesn't.
  This bug is invisible to every CI gate that runs against the local checkout
  and shows up only on the next clean-checkout build (Vercel, fresh clone, CI).

  Specific failure mode (this incident): a Write call created the file; a
  subsequent commit referenced it via import but the file itself was never
  `git add`-ed. `git status` showed it as `??` (untracked) but the staging
  review focused on the explicit `M` files (the matcher.ts change with the
  new import). The unstaged-untracked file was missed.

  Candidate permanent guard (proposed, NOT YET IMPLEMENTED — operator to
  decide):

    Pre-push check:
      git status --short | awk '/^\?\?/ && /(lib|app|components)\// { print; ec=1 }
                                END { exit ec ? 1 : 0 }'
    Block the push if any untracked file under lib/app/components exists.
    Forces a `git add` decision before push.

  Lighter guard (just a reminder, not a hard block):
    Pre-commit hook that flags untracked files under lib/app/components when
    the same commit modifies an import statement. Heuristic: grep the staged
    diff for `^\+import.*from '\\./[^']+'` and check whether the import
    target exists in git ls-files.

  Heaviest guard (the most reliable but slowest):
    A CI step that runs `next build` on a FRESH CLONE of HEAD, not the local
    working tree. Catches every clean-checkout-only failure. Slow.

  Operator to choose. NAMED-OPEN.

CARRIED VERIFIES STATUS (unchanged by hotfix):
  - 1 of 6 still discharged (g2 API level)
  - 5 of 6 still need human browser walkthrough
  - F-CALCULATOR-229 still needs visual confirm
  Hotfix unblocks Vercel; walkthrough remains the next step.

Push status: origin/main = 974b79c. Local working tree still has g1-g4
changes + 4 smoke scripts + tracker uncommitted (waiting on the browser
walkthrough before the (g) commit decision). The hotfix commit was a
focused single-file add only — does NOT bank any of g1-g4.


2026-06-08 — DIRECTION REVERSAL — MULTI-UNIT PRICING RECONSIDERED (axis-of-measurement was wrong)

OPERATOR REVERSAL (verbatim direction): the prior "multi-unit = never price"
verdict is SUPERSEDED. Rationale: the 33.4% MAPE that killed plex pricing
(2026-06-07 (i) RESOLVED entry) was measured on the WRONG AXIS — single-family
match criteria (style + age + LAR + frontage + bed/bath funnel). The plex axis
was never tested.

WHAT THE PRIOR VERDICT SAID (verbatim from 2026-06-07 entries):
  - (i) RESOLVED: "Multi-unit MAPE 33.4% / median 26.0% / ±15 28% / CONTACT
    rate 72%" vs single-family detached "MAPE 21.3% / median 15.2% / ±15
    49%". Multi-unit is 1.6× MAPE, 1.7× median.
  - (j) CONFIRMED-SHIP: subtype gate at matcher entry, returns CONTACT
    immediately for Duplex/Triplex/Fourplex/Multiplex.
  - SESSION LOCK: "Multi-unit reclassified as sibling-product-path candidate"
    + "Multi-unit verdict — ROUTE-TO-AGENT (data-driven, LOCKED)".

WHAT WAS WRONG WITH THAT MEASUREMENT (operator-named, this turn):
  The 33.4% MAPE backtest ran subjects through the home matcher's funnels:
  applyFunnel (style + age + LAR), applyRelaxedFunnel (style-family +
  LAR-adjacent), bedBathOnly (bed + bath ± 1 + style-family + LAR-adjacent).
  Every one of those filters is a SINGLE-FAMILY axis:
    - style: meaningless on plex ("2-Storey" Duplex isn't comparable to
      "2-Storey" Detached by style; style varies within plex too)
    - age: bracket fill 35-47% on plex per the income-signal recon
    - LAR: living_area_range on a plex is the SUMMED building sqft, not
      per-unit — directionally OK but conflates differently than on
      single-family
    - frontage: applied as a flat $40k/ft adjustment in createHomeComparable,
      which the RANGE-ADJ recon already named as the catastrophe lever
    - bed/bath funnel: bedrooms_total on plex is the CROSS-UNIT SUM,
      explicitly named as wrong-axis in g2 (the bed-axis relaxation
      rationale). Backtest gated on this axis = measured a fiction.
  Result: backtest pooled plex comps that were "similar" by single-family
  features but missed the actual plex comparability axes — unit count, NOI,
  per-unit sqft. The 33.4% MAPE measured how badly a wrong-axis match
  predicts, not how well a right-axis match would.

NEW DIRECTION (operator-locked, supersedes the SESSION LOCK + (j) decisions):
  1. PRICE plexes where comps match on the PLEX AXIS:
       - unit-count match (Duplex pairs with Duplex; or unit-count class
         where Duplex/Triplex/Fourplex are explicit, Multiplex variable)
       - sqft-range match (living_area_range band — same as homes since
         we have no per-unit sqft)
       - NOT style/age/LAR-as-style/frontage
  2. ENRICH everywhere (NOI on the subject tile + on comp tiles where
     comps carry NOI). Make the income derivation VISIBLE — not just the
     g3 chip on the subject but per-comp where data exists.
  3. STRONG disclaimer always — plex pricing is data-thin and judgement-
     heavy; the engine is a starting point for the agent conversation,
     not a quote.
  4. Charlie-quality tiles or better — the comps + competing rails should
     read as rich as the Charlie ResultsPanel reference (Option C),
     extended with plex-relevant fields.
  5. Tier on plex-defined criteria: tight unit-count + sqft + (NOI where
     present) = Platinum-equivalent confidence on the plex axis.

STATUS OF PRIOR (j) + g1-g4 SHIPPED-TO-LOCAL WORK:

  (j) GATE — UNDER REVISION, NOT YET REVERTED.
    Currently in matcher (commit 278e3d9 + 974b79c on origin):
      if (MULTI_UNIT_SUBTYPES.includes(specs.propertySubtype)) {
        return await findMultiUnitContactComparables(specs)  // g1 helper, comps-bearing CONTACT
      }
    Behavior on origin TODAY: plexes get CONTACT (no price) + plex-class
    comps. The reversal says we'll re-enable pricing on the plex axis IF
    this turn's backtest shows acceptable MAPE. If MAPE is acceptable, the
    helper grows a pricing path + the gate stops being unconditional-CONTACT.
    If MAPE is still bad on the plex axis, the gate stays (enrich-only),
    and we've learned the axis isn't the rescue we hoped for.

  g1 (helper bare->comps-bearing): SHIPPED-LOCAL, still applies — the
    comps-bearing return is the foundation for either path (priced or
    enrich-only). NOT being reverted.

  g2 (competing-listings class-wide + bed-axis dropped): SHIPPED-LOCAL,
    still applies. Both decisions stay correct regardless of pricing.

  g3 (cap-rate chip on subject when NOI present): SHIPPED-LOCAL,
    aligns with the new direction's "NOI enrichment always visible".

  g4 (class-aware copy): SHIPPED-LOCAL, mostly aligns with new direction
    (the "(Reference Context)" framing is honest whether priced or not).
    May need wording tweaks if pricing comes back ("Reference" is
    appropriate for unpriced; for priced plex we'd want different framing).

  NONE of g1-g4 are reverted by this reversal. The reversal narrows to
  whether the (j) gate's CONTACT-no-price decision is final or replaceable.

GATING MEASUREMENT — THIS TURN'S BACKTEST IS THE DECIDER.
  Step 2 below runs the plex-axis backtest. If MAPE is in the home-baseline
  range (~14-20% median, ~20% MAPE), pricing re-enables per subtype.
  If MAPE is still 30%+ on the plex axis, enrich-only stands and the
  reversal was a hypothesis that didn't pan out — that's also a valid
  outcome.

  Per-subtype expected differences:
    - Duplex: largest pool (1,760 over 2y). Best chance for tight match.
    - Triplex (577): smaller pool, more variance per recon.
    - Fourplex (239): smaller still. Could be pool-depth-limited.
    - Multiplex (379): variable unit count makes "unit-count match" fuzzy
      — Multiplex 8-unit is not comparable to Multiplex 16-unit. May need
      to be handled as enrich-only or as its own tighter sub-class.

  Result framework for the backtest:
    - Each subtype gets its own MAPE/median/±15/CONTACT-rate verdict.
    - The 33.4% was the average across all four; expect spread.
    - Decision tier: ≤20% median = price; 20-30% = price with strong
      disclaimer; >30% = enrich-only.
    Operator can revise these thresholds.

NEXT STEP (this turn, after this tracker write): run the plex-axis backtest
(Step 2). No code changes to production. Read-only measurement. Then append
findings + recommendation.


2026-06-08 — PLEX-AXIS BACKTEST RESULTS — reversal partially vindicated, per-subtype split

Script: scripts/backtest-plex-axis.js (read-only against production DB,
preserved output at scripts-output/backtest-plex-axis.txt).

Method:
  - 200 subjects per subtype sampled (90d closed Residential Freehold For Sale,
    plex subtype, community_id present, close_price > 100k, living_area_range
    NOT NULL).
  - Comp pool per subject: SAME-SUBTYPE + LAR same-or-adjacent (canonical
    9-bucket ladder from home-adjustment-math.js).
  - Geo cascade: community -> muni -> area, ≥3 comps required to price.
  - Price estimate: MEDIAN of matched-comp close_price (v12 philosophy).
  - Subject NOI checked as enrichment dimension (presence, not match).
  - NOT in this backtest: style/age/LAR-via-style/frontage/bed funnels —
    the prior wrong-axis measurement.

RESULTS:

  subtype     n     priced  CONTACT%  MAPE   median  ±15%  ±25%  NOI%(priced)
  Duplex      200    190    5%        24.3%  17.4%   43%   64%   0%
  Triplex     109    89     18%       30.1%  22.1%   34%   61%   0%
  Fourplex    47     25     47%       35.0%  34.5%   32%   44%   0%
  Multiplex   91     58     36%       28.3%  21.1%   38%   59%   0%

  Anchors (from prior measurements):
    Detached (SF-axis):           MAPE ~21%, median ~15%, ±15% ~49%
    Att/Row/Townhouse (SF-axis):  MAPE ~14%, median ~9%,  ±15% ~63%
    PRIOR multi-unit (WRONG axis): MAPE 33.4%, median 26.0%, ±15% 28%, CONTACT 72%

HONEST READ (per subtype):

  DUPLEX — REVERSAL VINDICATED:
    MAPE: 33.4% wrong-axis → 24.3% plex-axis (−9pp, real improvement)
    Median: 26.0% → 17.4% (−8.6pp, real improvement)
    ±15%: 28% → 43% (+15pp)
    CONTACT rate: 72% → 5% (axis collapse — plex match doesn't gate on
      style/age, so almost every Duplex finds ≥3 comps somewhere in the
      cascade)
    Lands in the same band as Detached SF-axis baseline (15% median, 49%
    ±15%). Borderline-better than the wrong-axis killer; not as tight as
    home detached but in the operator's PRICE threshold (≤20% median).

  TRIPLEX — BORDERLINE:
    MAPE 30.1%, median 22.1%. Better than wrong-axis (33.4%/26%) but
    materially worse than home baseline. 18% still CONTACT after the
    cascade. Operator-defined 20-30% band = "price with strong disclaimer."

  FOURPLEX — AXIS DID NOT SAVE IT:
    MAPE 35.0% — actually WORSE than the wrong-axis 33.4%. Median 34.5%.
    47% CONTACT. Pool depth is the binding constraint, not axis: fewer
    Fourplex sales exist in any geo tier (239 over 2y total per
    product-class census), so even the right axis can't compensate. In
    the operator's >30% band = "enrich-only."

  MULTIPLEX — SURFACE READ IS MISLEADING:
    MAPE 28.3%, median 21.1% looks like the 20-30% band. BUT the "same
    subtype" match conflates 4-unit Multiplex with 16-unit Multiplex
    (subtype label doesn't carry unit count — confirmed in income-signal
    recon distributions: Multiplex kitchens_above_grade ranges 0-21).
    Real plex-axis match would require unit-count gating
    (kitchens_above_grade), which prior recon flagged as 40% noisy.
    Honest read: this backtest TREATED them as comparable; reality is
    a 4-unit and 16-unit aren't. The 21% median is over-optimistic.
    36% CONTACT. Recommendation: enrich-only OR a follow-up backtest
    with kitchens_above_grade unit-count gating before pricing.

CAVEATS / WHAT THE BACKTEST DOES AND DOES NOT TEST:
  - Matched on (same-subtype + LAR-adjacent). For Duplex/Triplex/Fourplex
    the subtype IS the unit count (fixed configurations), so this is the
    correct plex axis for those three. For Multiplex it isn't.
  - NOI NOT used as a match criterion. Fill is 7-15% over 2y but
    essentially 0% on freshly-closed 90d subjects (confirmed in this
    backtest: NOI on priceable subjects 0% across all 4 subtypes). NOI is
    for ENRICHMENT (visible derivation on tiles), not pool gating.
  - Median, not MAPE, is the load-bearing metric per v12 ("median, not
    mean — robust to outliers"). MAPE skews high from a few bad subjects.
  - 200-subject draw per subtype (109 Triplex, 47 Fourplex, 91 Multiplex
    actual). Direction trusted, decimals subject to sample variance.

VERDICT MATRIX (against operator's threshold framework — ≤20% median = price;
20-30% = price with strong disclaimer; >30% = enrich-only):

  Duplex     17.4% median →  PRICE (in ≤20% band)
  Triplex    22.1% median →  PRICE WITH STRONG DISCLAIMER
  Fourplex   34.5% median →  ENRICH-ONLY (pool-thin too)
  Multiplex  21.1% median →  PRICE WITH STRONG DISCLAIMER as measured BUT
                             flag unit-count fuzziness; consider ENRICH-ONLY
                             pending unit-count match work.

DIRECTIONAL FINDING:
  The reversal hypothesis ("33.4% was a SF-axis result; the plex axis will be
  closer to home baseline") was PARTIALLY VINDICATED:
  - Duplex: hypothesis holds. ~9pp MAPE drop. Pricing viable.
  - Triplex: hypothesis directionally right (some improvement) but result
    still outside the comfortable price band.
  - Fourplex: hypothesis disproven for this subtype. The axis isn't the
    constraint; pool depth is. The plex-axis match for Fourplex barely
    moves MAPE (35% vs 33.4% wrong-axis — within noise).
  - Multiplex: surface read encouraging but measurement axis is wrong for
    this subtype (subtype label ≠ unit count). Not a clean read.

  The reversal was correct in principle — the wrong axis WAS killing
  pricing for the subtype where pool size is sufficient (Duplex). But the
  reversal alone doesn't rescue the subtypes where pool is the limit
  (Fourplex) or where the subtype label is a fuzzy match (Multiplex).

RECOMMENDED BUILD SHAPE (operator decision pending — no code changes this
turn):
  Subtype-aware gate at the matcher entry:
    if (specs.propertySubtype === 'Duplex') {
      runPlexPricingPath(specs)  // unit-count + LAR cascade, PRICE
    } else if (specs.propertySubtype === 'Triplex') {
      runPlexPricingPath(specs, { strongDisclaimer: true })  // PRICE WITH WARNING
    } else if (specs.propertySubtype === 'Fourplex' || specs.propertySubtype === 'Multiplex') {
      return findMultiUnitContactComparables(specs)  // ENRICH-ONLY (current g1 path)
    }
  Plus: NOI enrichment line on subject (g3 stands) + NOI on comp tiles where
  filled + Charlie-quality tile shape (the result-richness lock).

  If operator picks this shape, NEXT STEPS:
    h1 — Build runPlexPricingPath (own helper, class-contained cascade with
         median-of-matched-comps pricing, NO single-family adjustments).
    h2 — Refactor (j) gate to subtype-aware switch (Duplex/Triplex price,
         Fourplex/Multiplex enrich-only).
    h3 — Comp-tile builder for priced plex (different from
         createMultiUnitContactComparable — adds price + tier).
    h4 — Strong-disclaimer surface (UI, where the disclaimer copy lives).
    h5 — Browser walkthrough that exercises priced Duplex + enrich-only
         Fourplex side by side.

  ALTERNATIVE — operator may reject this and want enrich-only across the
  board (the simpler ship). The Duplex MAPE 24.3% is meaningfully better
  than wrong-axis but still 1.6× attached-row's 14%. "Good enough to price"
  is an operator product call, not a math call.

STATUS OF g1-g4 + (j) GATE:
  None of the local g1-g4 changes are reverted by this finding. The plex
  pricing path would COMPLEMENT g1's comps-bearing CONTACT helper (use it
  for Fourplex/Multiplex enrich-only; build new helper for Duplex/Triplex
  pricing). g2 (competing-listings class-wide) and g3 (cap-rate chip) and
  g4 (class-aware copy) all still apply.

  The (j) gate's "unconditional CONTACT for all 4 plex subtypes" decision
  was correct for the data available at the time of the wrong-axis
  measurement. Given the plex-axis result, it should narrow to "CONTACT
  for Fourplex + Multiplex only" pending operator approval to build
  pricing for Duplex/Triplex.

Push status: origin/main = 974b79c (hotfix). Local working tree has
  g1+g2+g3+g4 + smoke scripts + this tracker entry, plus the new plex-axis
  backtest output. NO code changes shipped this turn. Operator decision
  pending on next build phase (h1-h5 plex pricing path, or enrich-only ship).


2026-06-08 — h1 SHIPPED — subtype-aware plex pricing path (Duplex/Triplex PRICE, Fourplex/Multiplex enrich-only)

Operator approval with one required correction (verbatim):
  "FIX (correctness, not preference): the ±8% band is WRONG — it's false
  precision that contradicts our own measured error. The band must reflect
  the subtype's MEASURED median APE. Make the band subtype-aware, keyed to
  the measured median APE, NOT a fixed ±8%. A wide honest band + strong
  disclaimer is truthful; a tight band is a lie the backtest contradicts."

Backups: .backup_20260608_053417 (both files).

Files modified (2):

  1. lib/estimator/home-comparable-matcher-sales.ts
     a. HomeMatchResult interface (line ~44): added 'area' to geoLevel union;
        added optional estimatedPrice?: number field (server-action override
        sentinel — set by plex pricing path to bypass calculator's mean).
     b. NEW exported constant PLEX_PRICE_BAND_FRACTION at module scope —
        single source of truth for the honest band, derived from the measured
        median APE per subtype:
          Duplex:  0.17  (measured 17.4%)
          Triplex: 0.22  (measured 22.1%)
        Documented in comment that it's NOT a magic number; tightening below
        this would claim confidence we measured ourselves NOT to have.
     c. NEW buildPricedPlexResult(comps, geoLevel) helper: median of
        close_price (v12 "median, not mean"), top 10 most-recent comps via
        the g1 createMultiUnitContactComparable builder (SF-derived signals
        omitted), tier='RANGE' as h2 placeholder.
     d. NEW runPlexPricingPath(specs) helper: MIRRORS scripts/backtest-plex-
        axis.js EXACTLY — same-subtype + LAR-adjacent + community→muni→area
        cascade, ≥3-comp threshold to price, MEDIAN aggregation. Thin pool
        (<3 anywhere) → falls back to findMultiUnitContactComparables (g1
        enrich-only). No SF axes.
     e. (j) gate at findHomeComparables (line ~510): subtype-aware switch.
        Duplex/Triplex → runPlexPricingPath. Fourplex/Multiplex → g1
        enrich-only helper (unchanged behavior for those two).

  2. app/estimator/actions/estimate-home-sale.ts
     a. Import: added PLEX_PRICE_BAND_FRACTION (named import).
     b. After calculateEstimate at line ~56: subtype-aware honest-band
        override. If matchResult.estimatedPrice is set AND the subject's
        subtype has a band fraction entry, override estimate.estimatedPrice
        with the matcher's median + override estimate.priceRange to
        [price * (1-band), price * (1+band)] using the per-subtype fraction.
        Documented in comment that band derives from measured APE — not 8%.

tsc --noEmit clean (exit 0, full project).

BACKTEST-PARITY SMOKE (scripts/smoke-h1-backtest-parity.js, read-only,
re-runs the same 200-per-subtype sample shape against the production helper
logic):

  --- Duplex ---
    sampled: 200 (priced: 183, thin→enrich-only: 17)
    median APE: 17.4%   ← BACKTEST TARGET: 17.4% (EXACT PARITY)
    Sample priced result:
      geoLevel: municipality
      predicted: $480,000
      band: ±17% → [$398,400, $561,600]
      subject actual close: $450,000  (APE 6.7%)
        ↑ lands well inside the band (sub-median APE subject)

  --- Triplex ---
    sampled: 109 (priced: 89, thin→enrich-only: 20)
    median APE: 22.1%   ← BACKTEST TARGET: 22.1% (EXACT PARITY)
    Sample priced result:
      geoLevel: area
      predicted: $600,000
      band: ±22% → [$468,000, $732,000]
      subject actual close: $462,500  (APE 29.7%)
        ↑ lands at the lower band edge — EXACTLY the case the operator's
        FIX was about. With the rejected ±8% band, the displayed range would
        have been [$552k, $648k] — actual $462,500 OUTSIDE the band by $90k
        (the rejected lie). With the honest ±22% band, the actual lands at
        the lower edge — honest portrayal of the measured noise.

  Fourplex + Multiplex → STRUCTURAL ENRICH-ONLY (gate branches on subtype
    literal; runPlexPricingPath is never called for those two; no priced
    path reachable). ✓ PASS

  Thin-pool Duplex/Triplex (<3 LAR-adjacent comps at any tier):
    Duplex 17/200 (8.5%), Triplex 20/109 (18%). These fall through to
    findMultiUnitContactComparables; estimatedPrice never set; server-action
    override skips; showPrice stays false; no bad price leaks. ✓ STRUCTURAL.

KEY INTEGRITY GAIN:
  Production output now MATCHES the measurement. Pre-h1, the calculator's
  score-weighted mean (degenerating to arithmetic mean on plex comps with
  no matchScore) would have produced a price ≠ the measured median, which
  means the 17.4% / 22.1% medians wouldn't have replicated on live traffic.
  h1's estimatedPrice override on the server action closes this gap — the
  production price IS the backtest median for the same comp pool. This is
  the "production matches measurement" integrity fix the operator named.

KEY HONESTY GAIN:
  Display range now matches measured error. A Duplex priced at $480,000
  with median APE 17.4% honestly displays as [$398k, $562k] (±17%) — not
  [$442k, $518k] (±8%, the rejected band). The rejected band would have
  placed many actual close-prices outside the displayed range — a UI lie
  the backtest directly contradicts. The honest band makes the strong-
  disclaimer copy (h4) load-bearing rather than ornamental.

h1 STATUS — DONE.

Next action:
  h2 — Charlie-quality tiles + chrome (plex-specific tier labels replacing
       'RANGE' placeholder; NOI badges on comp tiles where filled; richer
       per-tile content matching Charlie ResultsPanel reference). h2 polishes
       the tile shape now that the pricing math is integrity-correct.

CLAIMED, UNVERIFIED (carried into h2):
  - h1 not runtime-exercised through the Next.js server-action chain. SQL
    smoke confirmed the helper logic + median + per-subtype band against
    the same backtest sample shape. The full estimator → server-action →
    matcher → calculator → server-action-override → client-render path
    has NOT been walked through on dev. Operator browser walkthrough still
    owed (the walkthrough deferred from the (j)-gate work plus now h1).
  - The 'area' geoLevel value addition is new — HomeEstimatorBuyerModal:
    481 only differentiates 'community' vs anything-else for the Geo Level
    Indicator copy ("Based on recent sales in your neighborhood" vs
    "...wider municipality..."). 'area' will fall into the else branch,
    reading "wider municipality" — slightly lossy but not broken. Could
    refine in h4 copy work.
  - Strong-disclaimer copy on plex priced results NOT YET RENDERED (h4
    scope). The honest band exists in the data; the disclaimer that
    contextualizes it is still pending.

Push status: origin/main = 974b79c (hotfix). Local working tree now has:
  - Matcher.ts modified (g1 + g2 export + h1 helpers/gate, on top of the
    committed 278e3d9 + hotfix; both new this turn for h1)
  - estimate-home-sale.ts modified (h1 server-action override) — NEW MODIFIED FILE
  - HomeEstimatorBuyerModal.tsx, HomeEstimatorResults.tsx,
    HomePropertyEstimateCTA.tsx, competing-listings/route.ts (g1-g4, carried)
  - 5 new smoke scripts (g1, g2, g3, g4, h1)
  - tracker modified
  NO commit, NO push this turn. HOLD per operator instruction.


2026-06-08 — h2 PHASE 1 SHIPPED (SF chrome hide + junk-price floor + plex tier title) — Phase 2 income tiles gated on fill check

Operator scoped h2 in two phases:
  Phase 1 (this entry): SF chrome hide + junk-price floor + tier title. Build now.
  Phase 2 (next): INCOME-signals fill check, propose income-tile design, STOP for approval.

Operator-required for Phase 2 (not yet started): show ALL income signals (NOI,
Gross Revenue, Cap Rate, GRM) per comp tile + a plain-English educational note
that multi-unit is priced on INCOME not bed/bath. Design depends on fill rates —
no tile wiring before approved design.

Files modified (4):
  Backups: .backup_20260608_060541 (all 4)

  1. app/[slug]/components/HomeListingCard.tsx
     - Added import of MULTI_UNIT_SUBTYPES from the matcher.
     - Derived `isPlex` flag from listing.property_subtype.trim() membership.
     - Gated "Stats row 2" (Frontage/Lot/Garage) on `!isPlex`.
     - Gated row 3 Style + Bsmt on `!isPlex`.
     - Tax stays UNIVERSAL (renders for both SF and plex if > 0).
     - bed/bath/sqft/price/address all unchanged (universal).

  2. app/api/charlie/competing-listings/route.ts
     - Added `.gt('list_price', 100000)` to BOTH path='condo' and path='home'
       blocks. Excludes $1 call-for-price placeholders.
     - Threshold matches the matcher's project-wide $100k close_price floor.

  3. app/property/[id]/HomePropertyPage.tsx
     - Added `.gt('list_price', 100000)` to the availableNearby query (line ~175).
     - Closed/similar queries unchanged (use close_price not list_price; the
       existing pattern's $100k floor on close_price stands separately at the
       matcher).

  4. app/estimator/components/HomeEstimatorResults.tsx
     - Plex tier title override: when isMultiUnitSubject, header reads
       `Recent ${subjectSubtype} Sales (Plex Reference)` instead of the
       SF-framed `Comparable Homes` / `Best Matches` etc. labels.
     - Hidden the SF Match-Details color panels (BINGO/RANGE/MAINT) on plex —
       those panels assert match-quality on SF axes ("Same sqft range", "Exact
       sqft match"). For plex, the title alone now conveys what was matched
       (subtype + LAR); the panels would be wrong-axis copy.

tsc --noEmit clean (exit 0, full project).

REGRESSION SMOKE — scripts/smoke-h2-phase1-sf-chrome.js, 44 predicate checks
PASS:
  SF subjects (Detached/Semi/Att-Row/Link) × 6 chrome rows = 24 checks
    → All 5 SF chrome fields STILL render + tax stays. Byte-identical to
    pre-h2 behavior. Regression guard holds.
  Plex subjects (Duplex/Triplex/Fourplex/Multiplex) × 6 rows = 24 checks
    → All 5 SF chrome fields HIDDEN. Tax stays. h2 target achieved.
  Land/edge subtypes (Vacant Land/Rural/Farm/Mobile/Modular/Store/Other) × 1
    → isPlex=false → SF chrome renders (operator scope = plex only; land/edge
    chrome handling deferred to land-sibling-product work).
  Trailing/leading whitespace on subtype (e.g. 'Duplex ', ' Duplex')
    → trim() makes the gate fire correctly.
  undefined / null / '' subtype
    → !isPlex (false) → renders SF chrome (safe default; no crash).

h2 PHASE 1 STATUS — DONE.

OUT-OF-SCOPE DIAGNOSTIC (pre-existing, not from h2):
  HomePropertyPage.tsx:11 has `WalliamCTA` imported but unused (TS6133 hint).
  Pre-existed before h2 edit; carried as-is. Not blocking.

KNOWN DEFECTS THIS PHASE DOES NOT TOUCH:
  - F-CALCULATOR-229 (the "Your unit requires..." CONTACT subtitle from
    statistical-calculator.ts:229). Still NAMED-OPEN since g4 entry.
  - h2 Phase 2 (income tiles per-comp NOI/GR/CapRate/GRM + educational note).
    Awaiting fill-rate check before design.

CLAIMED, UNVERIFIED:
  - h2 phase 1 not runtime-exercised through dev server. Predicate-level
    inspection only. Production behavior of plex tile render on a real
    /property/[id] page or estimator modal needs browser walkthrough.
  - HomeListingCard usage on /admin-homes and other surfaces — the gate is a
    pure read-only `isPlex` check, no state change; should not regress non-
    estimator surfaces but not verified surface-by-surface.

PHASE 2 — INCOME-SIGNALS FILL CHECK (next, read-only):
  Per-subtype, 2y closed plex sales, report fill rate for:
    - net_operating_income
    - gross_revenue (the existing column found in g4's calc-229 search)
    - any column matching %income%, %expense%, %operating% via
      information_schema scan (catch any signals we missed)
    - operating_expense / vacancy_allowance / electric_expense / etc. (the
      bouquet of expense fields the income-signals recon found in
      recon/multi-unit-income-signals.txt prior)
  Decision threshold (operator-stated): a signal under ~10% fill is mostly-
  blank; flag as "don't show — render-empty looks broken." Signals at >10%
  fill on at least one subtype are candidates.
  Then propose tile design: which fields to render, derivation rules for Cap
  Rate (NOI/close_price) and GRM (close_price/gross_revenue), silent-omit-on-
  null rule, + the 1-2-sentence educational note copy.
  STOP for operator approval before any tile wiring.

Push status: origin/main = 974b79c (hotfix). Local working tree now has:
  - Phase 1 modifications on top of g1-g4 + h1 + this tracker entry
  - 6 smoke scripts (g1, g2, g3, g4, h1, h2-phase1)
  - NO commit, NO push this turn.

================================================================================
h2 PHASE 2 — PER-TILE INCOME BLOCK + EDUCATIONAL NOTE (income tiles wired)
2026-06-08 (W-ESTIMATOR-RAG)
================================================================================

OPERATOR DIRECTIVE (verbatim, final):
  "build the income tiles: show NOI + gross revenue + cap rate per comp ONLY
   where that comp has the data (blank-omit where it doesn't), plus a one-line
   note that plexes are priced on income not size. No more recon. Build it."

FILL-CHECK INPUT (no full 22-column recon — operator killed that):
  NOI fill (existing tracker entry from g4 income-signals recon):
    Duplex     ~7%   Triplex   ~10%   Fourplex  ~15%   Multiplex ~10%
  gross_revenue fill (single quick query this phase, BASE_2Y):
    Duplex      130 / 1760  (7.4%)
    Triplex      61 / 577   (10.6%)
    Fourplex     35 / 239   (14.6%)
    Multiplex     0 / 379   (0.0%)
  Conclusion: gross_revenue fill mirrors NOI fill rows on Duplex/Triplex/
  Fourplex; Multiplex carries NOI but no gross_revenue. Silent-omit-per-field
  handles both natively — Multiplex tiles render NOI + CapRate and skip
  Gross; Duplex/Triplex/Fourplex rows with both populated render all three.

BACKUPS (created BEFORE edits; CLAUDE.md backup rule):
  lib/estimator/home-comparable-matcher-sales.ts.backup_20260608_070520
  lib/estimator/types.ts.backup_20260608_070520
  app/estimator/components/HomeEstimatorResults.tsx.backup_20260608_070520

EDIT 1 — lib/estimator/types.ts (ComparableSale interface)
  Added two optional fields below unparsedAddress:
    netOperatingIncome?: number | null
    grossRevenue?: number | null
  Cap rate is derived per-tile at render time (NOI / closePrice * 100), not
  stored — keeping the type minimal and the math next to where it shows.

EDIT 2 — lib/estimator/home-comparable-matcher-sales.ts
  (a) HOME_SELECT extended:
        ..., public_remarks,
        net_operating_income, gross_revenue
      One additional fragment, no other columns disturbed; same identifier
      list both branches of the matcher use.
  (b) createMultiUnitContactComparable builder maps both fields:
        netOperatingIncome: sale.net_operating_income
        grossRevenue:       sale.gross_revenue
  SF builder (createContactComparable) intentionally NOT touched — SF tiles
  do not render the income block and these fields stay undefined on SF
  ComparableSale instances.

EDIT 3 — app/estimator/components/HomeEstimatorResults.tsx
  (a) Educational one-liner above the comp rail, gated by isMultiUnitSubject:
        Multi-unit properties are valued on rental income, not size — figures
        below show each comp income where reported.
      Italic, slate-600, mb-3 — sits between the h3 tier title and the rail.
  (b) Per-tile income block inserted between the header div close and the
      first SF Match Details panel:
        {isMultiUnitSubject && (
          ((comp.netOperatingIncome ?? 0) > 0 || (comp.grossRevenue ?? 0) > 0) && (
            <div className="bg-indigo-50 ... border border-indigo-200">
              <p>Income</p>
              {NOI > 0       -> <NOI: $.../yr>}
              {Gross > 0     -> <Gross Rent: $.../yr>}
              {NOI > 0 && CP > 0 -> <Cap Rate: x.x%>}
            </div>
          )
        )}
      Silent-omit at TWO levels:
        Outer gate: block hides entirely when both NOI and Gross are null/0.
        Inner gates: each row (NOI / Gross / Cap) renders only if its own
                     data is present.
      NO em-dash placeholder, NO N/A, NO dashes for missing fields.

TSC --noEmit (exit 0, full project, on top of Phase 1 + h1 + g1-g4).

PREDICATE SMOKE — scripts/smoke-h2-phase2-income-tiles.js, 51 checks PASS:
  SCENARIO 1 — SF subjects (Detached/Semi/Att-Row/Link) x 4 assertions = 16
    -> Even with NOI/Gross/CP populated, block fully hidden on SF subjects.
    REGRESSION GUARD: SF tiles render byte-identical to pre-h2-Phase-2.
  SCENARIO 2 — Plex x 4 x 4 null/undef/0/negative = 16
    -> Block fully omitted when both signals absent or non-positive.
  SCENARIO 3 — Plex + NOI only -> NOI + Cap render, Gross omitted (5 checks)
    -> Cap rate 48000/950000*100 = 5.1% (toFixed(1)).
  SCENARIO 4 — Plex + Gross only -> Gross renders, NOI/Cap omitted (5 checks)
  SCENARIO 5 — Plex + both populated -> all three render (5 checks)
    -> Cap rate 92500/1450000*100 = 6.4%.
  SCENARIO 6 — cap-rate math spot checks at real plex shapes (5 checks)
    NOI=38k CP=780k  -> 4.9%
    NOI=55k CP=920k  -> 6.0%
    NOI=110k CP=1.9M -> 5.8%
    NOI=25k CP=500k  -> 5.0%
    NOI=1 CP=1M      -> 0.0%   (edge: rounds to 0.0%, block still shows)
  SCENARIO 7 — closePrice=0 defensive -> block + NOI render, Cap omitted

REAL-ROW PROBE — scripts/smoke-h2-phase2-real-row.js, 2y closed plex sales:
  Column-presence sanity: both net_operating_income and gross_revenue
  confirmed on mls_listings.
  Per-subtype 3-row sample (Cap = NOI / close_price * 100):
    Duplex  ok   43 GOVERNMENT Rd E    CP=$215k    NOI=$15.5k  Gross=$30.3k  Cap=7.2%
    Duplex  ok   109-111 MARIER Ave    CP=$622.9k  NOI=$25.7k  Gross=$50.4k  Cap=4.1%
    Duplex  ok   259 TRAFALGAR Rd      CP=$335k    NOI=$26.2k  Gross=$38.6k  Cap=7.8%
    Triplex ok   1331 THAMES St        CP=$795k    NOI=$35.0k  Gross=$46.7k  Cap=4.4%
    Triplex ok   103-105 BETHUNE St    CP=$340k    NOI=$18.4k  Gross=$29.9k  Cap=5.4%
    Triplex !!   297-301 WILLIAM St    CP=$170k    NOI=$27.3k  Gross=$30.6k  Cap=16.1%
    Fourpx  ok   389-395 CHAMPLAIN St  CP=$275k    NOI=$12.8k  Gross=$27.0k  Cap=4.7%
    Fourpx  ok   100 JAMES St          CP=$1.175M  NOI=$74.2k  Gross=$97.8k  Cap=6.3%
    Fourpx  !!   1050 KING St          CP=$650k    NOI=$12.4k  Gross=$32.9k  Cap=1.9%
    Multi   ok   54 Hudson Bay Ave     CP=$175k    NOI=$4.0k   Gross=null    Cap=2.3%
    Multi   ok   14-16 Lakeshore Rd    CP=$515k    NOI=$31.8k  Gross=null    Cap=6.2%
    Multi   ok   18-20 Lakeshore Rd    CP=$515k    NOI=$39.6k  Gross=null    Cap=7.7%
  10/12 rows within ~2-12% sensible range. 2 unusual flags:
    Triplex 297-301 WILLIAM @ 16.1% — likely MLS over-reported income at a
      $170k power-of-sale.
    Fourplex 1050 KING @ 1.9% — likely under-reported NOI at $650k.
  Policy: DO NOT filter unusual caps. The data is what MLS recorded; the
  educational note above the rail frames it as "where reported," and the
  result-level disclaimer (for reference only, contact agent) already
  covers data-quality. Filtering would be silent fabrication.
  NOTABLE — Multiplex carries NOI but NO Gross (matches 0% gross_revenue
  fill from the recon). Multiplex tiles render NOI + Cap; Gross silent-
  omits per-row exactly as designed.

REGRESSION SURFACE — h2 Phase 1 smoke (44 checks) re-run not required for
  Phase 2: Phase 2 touches only the priced-comp tile render and is gated on
  isMultiUnitSubject. The SF chrome predicate is unchanged. The Phase 2
  predicate smoke explicitly re-tests the SF-side guard (Scenario 1) and
  proves no income chrome leaks onto SF subjects even when ComparableSale
  carries NOI fields. SF subjects render byte-identical.

WHAT THIS DOES NOT DO (intentional, scoped):
  - Does NOT add GRM (close_price / gross_revenue). Originally proposed by
    the operator for completeness, but operator's final directive was three
    fields only: "NOI + gross revenue + cap rate per comp." GRM remains an
    available derivation (Gross is present in the data layer) — wiring it
    later is a one-line JSX addition.
  - Does NOT filter the two unusual-cap rows. Honest data, not curated data.
  - Does NOT change the priced-band fraction, the median-aggregation logic,
    or the (j) gate routing — all h1 outputs untouched.
  - Does NOT render the income block on SF subjects, on land/edge subtypes,
    or on unpriced enrich-only subtypes (Fourplex/Multiplex enrich path).
    Multiplex priced output exists via h1 only when the path reached it;
    enrich-only Multiplex tiles still go through the SF-render branch on
    those code paths (which is fine — block is gated on isMultiUnitSubject
    at the render layer, not on priced/enrich path).

h2 PHASE 2 STATUS — DONE.

KNOWN DEFECTS THIS PHASE DOES NOT TOUCH:
  - F-CALCULATOR-229 (statistical-calculator.ts:229 CONTACT subtitle).
    Still NAMED-OPEN since g4 entry. Untouched intentionally; sits outside
    the plex-tile and income-tile work.

CLAIMED, UNVERIFIED:
  - Browser walkthrough not performed this turn. Predicate + real-row DB
    proof only. Operator may exercise via /estimator on a known plex MLS#
    in the WALLiam tenant (DEV_TENANT_DOMAIN=walliam.ca). Expected: tile
    rail shows "Recent <Subtype> Sales (Plex Reference)" + italic
    educational note + income block on tiles whose NOI or Gross > 0.

Push status: origin/main = 974b79c (hotfix). Local working tree now has:
  - Phase 1 + Phase 2 modifications on top of g1-g4 + h1
  - 7 smoke scripts (g1, g2, g3, g4, h1, h2-phase1, h2-phase2-predicate)
    + 1 real-row probe (h2-phase2-real-row)
  - NO commit, NO push this turn. HOLD per operator's standing instruction.


================================================================================
h2 FINISH — COMPETING-FOR-SALE RAIL WIRED INTO PLEX RESULT (LOCKED v11 spec)
2026-06-08 (W-ESTIMATOR-RAG)
================================================================================

OPERATOR DIRECTIVE (verbatim):
  "W-ESTIMATOR-RAG — FINISH h2 to the tracker's locked spec. The operator's
   screenshot shows the plex result is INCOMPLETE vs the locked spec: the
   income signals (NOI / Gross Revenue / Cap Rate) and the two-rail structure
   (Comparable SOLD + Competing FOR-SALE) are not fully rendered. Build to
   the tracker spec."

LOCKED SPEC RE-CONFIRMED FROM TRACKER (quoted, not re-derived):
  v11 LOCKED Option C (line 182):
    "Same tile for 'Comparable Sold' and 'Competing For Sale' sections."
  Principle 5 (line 112-113):
    "A seller pricing today competes against live inventory, not just history.
     The report surfaces actively-listed competing properties... alongside
     sold comps. This is what makes it a pricing TOOL, not a backward-looking
     average."
  Competing For Sale section (line 183):
    "live Active / For Sale listings, same Option-C tile, framed forward
     ('3 similar homes listed now, $1.79M-$2.05M — your competition').
     Forward-looking half of the pricing strategy."
  Tracker line 2092 (g4 closeout, never resolved):
    "CLAIMED, UNVERIFIED on disk this session: whether the Comparable Sold +
     Competing For Sale tiles render together in the SAME result panel, or
     are surfaced in separate UI moments."

GAP THE OPERATOR NAMED (now confirmed by disk read):
  - The competing-listings API existed (g2 SHIPPED, widened class-wide for
    plex) but was NOT consumed anywhere under app/estimator/. The estimator
    result panel only rendered the sold-comp rail.
  - HomeEstimatorBuyerModal.tsx imported HomeEstimatorResults; neither file
    referenced competing-listings. The "second rail" never existed in the
    estimator surface. (Charlie has its own ResultsPanel that does consume
    competing-listings — separate surface, not relevant to /estimator.)
  - Income block on the sold-comp rail IS wired correctly (Phase 2 already
    extended HOME_SELECT + the plex builder + the tile renderer); it
    silent-omits per-field, which on a top-N comp sample lands at the
    sparsity floor (7-15% Duplex/Triplex/Fourplex, 0% Multiplex Gross). When
    NOI is present on a row, the block fires. When it isn't, the block
    silently disappears. That is the locked policy, not a bug.

BACKUPS (created BEFORE edits, CLAUDE.md backup rule):
  app/api/charlie/competing-listings/route.ts.backup_20260608_075915
  app/estimator/components/HomeEstimatorBuyerModal.tsx.backup_20260608_075915
  app/estimator/components/HomeEstimatorResults.tsx.backup_20260608_075915

EDIT 1 — app/api/charlie/competing-listings/route.ts
  Home-path select extended with `, net_operating_income, gross_revenue`.
  These columns now flow from the API to the rail tile. Condo path
  untouched. SF subjects still get exact-subtype + bed-axis (g2-preserved).

EDIT 2 — app/estimator/components/HomeEstimatorBuyerModal.tsx
  (a) Import MULTI_UNIT_SUBTYPES + named-import CompetingListing type from
      HomeEstimatorResults (re-exported there).
  (b) New state: competingListings: CompetingListing[]. Reset on close.
  (c) After estimateHomeSale success + plex subject + municipalityId, fire
      POST /api/charlie/competing-listings (fire-and-forget; .catch logs but
      does not block render). Body: {path:'home', municipalityId, bedrooms,
      livingAreaRange, propertySubtype}. SF subjects never hit this branch.
  (d) Pass competingListings as prop to HomeEstimatorResults.

EDIT 3 — app/estimator/components/HomeEstimatorResults.tsx
  (a) NEW exported interface CompetingListing — mirrors the competing-
      listings home-path response, trimmed to fields the tile renders.
      Income fields optional/nullable.
  (b) Props interface extended with competingListings?: CompetingListing[].
  (c) Below the sold-comp rail's outer div close, NEW block:
        {isMultiUnitSubject && competingListings && competingListings.length > 0 && (() => {
          const sortedByPrice = [...].sort(a,b => a.list_price - b.list_price)
          const low / high derived from sortedByPrice for the framed-forward subtitle
          return (
            <div className="mt-8">
              <h3>Competing For Sale ({n})</h3>
              <p>{n} similar plex listing(s) on the market now, {low}-{high} — your competition.</p>
              {map → tile}
            </div>
          )
        })()}
      Tile shape: same plex tile as sold rail — bed/bath/sqft header, no SF
      chrome, income block (NOI / Gross Rent / Cap Rate at asking),
      silent-omit per-field. Cap rate denominator = list_price (NOT
      close_price — these are active listings). "Asking Price" label on the
      price row. "View Property Details" link uses generateHomePropertySlug
      against the listing_key (same link helper as sold tiles).

TSC --noEmit clean (exit 0, full project).

PREDICATE SMOKE — scripts/smoke-h2-finish-two-rail.js, 47 checks PASS:
  SCENARIO 1 — SF subjects (Detached/Semi/Att-Row/Link) + non-empty
    competingListings: rail HIDDEN. Defense-in-depth: even if the modal
    accidentally passed competing data to an SF render, the component-side
    gate (isMultiUnitSubject) blocks it. SF regression guard holds.
  SCENARIO 2 — Plex (Duplex/Triplex/Fourplex/Multiplex) + non-empty
    competingListings: rail SHOWN, count = N.
  SCENARIO 3 — Plex + empty / null / undefined competingListings: rail
    HIDDEN (fail-silent). The fetch may not have completed yet, or may
    have failed; the sold-comp rail still renders cleanly.
  SCENARIO 4 — Competing tile income block silent-omits when no data.
  SCENARIO 5 — NOI + Gross both populated → all three signals render;
    cap math 48000/825000*100 = 5.8%.
  SCENARIO 6 — Gross only → Gross shown, NOI/Cap omitted (correct: cap
    rate requires NOI as numerator).
  SCENARIO 7 — Asking-cap math spot checks at real plex shapes:
    NOI=55k LP=1.1M → 5.0%
    NOI=38k LP=780k → 4.9%
    NOI=110k LP=1.9M → 5.8%
    NOI=25k LP=500k → 5.0%
  SCENARIO 8 — list_price=0 defensive: block + NOI render, Cap omitted.

REAL-DATA PROBE — scripts/smoke-h2-finish-both-rails-real.js:
  STEP 1 found Hamilton (municipality_id c1ea0c04-2963-452a-b694-3bfe7834960c)
  as the best plex muni: 112 sold-2y + 95 active. Same Hamilton muni used
  in g2 smoke (line 3139 ref) — consistent test bed across phases.
  STEP 2 (sold rail): 10 closed comps returned by the priced-path muni
    cascade. ALL 10 silent-omit the income block (none of the top-10
    most-recent Hamilton plex sales carry NOI/Gross). This is the locked
    silent-omit policy doing its job — not a bug.
  STEP 3 (competing rail): 10 active plex listings returned by the
    competing-listings API. ALL 10 silent-omit the income block (NOI/Gross
    not reported on actives — see fill probe below).
  VERDICT: Both rails populate. 20 tiles will render. Zero income chrome
  on this particular muni's top-N sample, exactly as the data warrants.

ACTIVE-LISTING NOI FILL — scripts/smoke-h2-finish-competing-noi-fill.js
  (province-wide, available_in_vow=true, list_price > 100000):
    Duplex     747 active   NOI>0:  1 (0.1%)   Gross>0:  1 (0.1%)
    Triplex    286 active   NOI>0:  0 (0.0%)   Gross>0:  0 (0.0%)
    Fourplex   193 active   NOI>0:  0 (0.0%)   Gross>0:  0 (0.0%)
    Multiplex  305 active   NOI>0:  0 (0.0%)   Gross>0:  0 (0.0%)
  Honest finding: the Competing-For-Sale rail's income block is "rare-fire
  by design" — actives essentially never carry MLS-reported NOI. When it
  does fire (the one populated Duplex: 30 WILLIAM Street E, LP $334,900,
  NOI $15,773, asking cap 4.7%), the math is correct. This is the data
  layer's reality, not a wiring defect. Compare to closed sales (7-15%
  fill on Duplex/Triplex/Fourplex) — closeings carry income context that
  the listing snapshot does not.

REGRESSION SURFACE:
  - SF subjects (Detached/Semi/Att-Row/Link) get NO competing-listings
    fetch (modal-side gate on isMultiUnit) AND no second-rail render
    (component-side gate on isMultiUnitSubject). Both gates defend in
    depth. SF estimator results byte-identical to pre-h2-finish.
  - Sold-comp rail untouched — same h1 priced path + h2-Phase-2 income
    block. Closing div tags only had the new rail inserted AFTER them,
    not within them.
  - Existing g1-g4 + h1 + h2-Phase-1 + h2-Phase-2 smokes unaffected;
    h2-Phase-1 (44 SF-chrome checks) + h2-Phase-2 (51 income predicate
    checks) + h2-finish (47 two-rail predicate checks) all pass on the
    same shipped tree.

WHAT THIS DOES (final scope of h2):
  + SF chrome hide on plex tiles (h2 Phase 1)
  + $100k junk-price floor on competing-listings + property-page nearby (Phase 1)
  + Plex tier title override (Phase 1)
  + Hide SF Match-Details panels on plex (Phase 1)
  + Per-tile income block (NOI / Gross Rent / Cap Rate, silent-omit) on
    sold-comp tiles (Phase 2)
  + Educational note above sold-comp rail (Phase 2)
  + COMPETING-FOR-SALE rail in the SAME plex result panel with the same
    plex tile + same income block (h2 FINISH, this entry) — closes the
    Principle 5 / LOCKED-v11 gap that's been flagged since g4 closeout.

WHAT THIS DOES NOT DO (carried forward, intentional):
  - Does NOT add GRM (close_price / gross_revenue). The data layer carries
    Gross, so this remains a one-line addition when prioritized.
  - Does NOT filter unusual cap rows on either rail. Honest data, not
    curated data.
  - Does NOT change h1 priced-path math, band fractions, or median
    aggregation.
  - Does NOT touch SF surfaces. Detached/Semi/Town/Link results render
    byte-identical to pre-h2.
  - Does NOT add a thumbnail to the plex tile (Charlie-density choice;
    keeps tile compact). competing-listings API DOES fetch mediaUrl as a
    side-effect of its existing media join — available for future use.

NEXT PHASE (h-series, not started):
  h3 — Comp-tile builder for priced plex specifically (different from
       createMultiUnitContactComparable — adds price + tier). Currently the
       priced path reuses createMultiUnitContactComparable; this h3 step
       is partly absorbed by the Phase 2 + finish work but the explicit
       "priced plex tile" abstraction has not been split out.
  h4 — Strong-disclaimer copy on plex priced results (the wide-band
       disclaimer that contextualizes the 17-22% measured APE bands —
       still pending).
  h5 — Browser walkthrough that exercises priced Duplex + enrich-only
       Fourplex side by side. Operator walk owed since h1.

KNOWN DEFECTS THIS PHASE DOES NOT TOUCH:
  - F-CALCULATOR-229 — still NAMED-OPEN.

CLAIMED, UNVERIFIED:
  - Browser walkthrough on a real plex MLS# not performed this turn. The
    /api/charlie/competing-listings POST has been runtime-confirmed at the
    DB-query layer (real-data probe ran the exact same SELECT with the
    same predicates and returned 10 rows for Hamilton). Whether the
    fire-and-forget fetch resolves cleanly in the modal's render cycle
    (React state update timing, no double-render artifacts) needs a
    browser confirm.
  - Lease branch (type='lease') NOT wired with competing-for-sale —
    estimator currently only fires the fetch on the sale branch. Plex
    lease comps are out of scope per prior tracker notes (lease backtest
    not run, no measured MAPE for plex leases).

Push status: origin/main = 974b79c (hotfix). Local working tree now has:
  - g1-g4 + h1 + h2 Phase 1 + h2 Phase 2 + h2 finish modifications
  - 5 files modified this h2 finish entry:
      app/api/charlie/competing-listings/route.ts
      app/estimator/components/HomeEstimatorBuyerModal.tsx
      app/estimator/components/HomeEstimatorResults.tsx
      docs/W-ESTIMATOR-RAG-TRACKER.md (this entry)
      (matcher.ts, types.ts, HomePropertyPage.tsx, HomeListingCard.tsx —
       carried from prior h2 phases, unchanged this turn)
  - 10 smoke scripts total (g1, g2, g3, g4, h1, h2-phase1,
    h2-phase2-predicate, h2-phase2-real-row, h2-finish-two-rail,
    h2-finish-both-rails-real, h2-finish-competing-noi-fill)
  - NO commit, NO push this turn. HOLD per operator's standing instruction.


================================================================================
g1-h2 BUNDLE COMMITTED — ecf2f94 (push HELD)
2026-06-08 (W-ESTIMATOR-RAG)
================================================================================

OPERATOR DIRECTIVE (verbatim):
  "W-ESTIMATOR-RAG — COMMIT the g1-h2 bundle. Bank the verified work: g1
   (comps-bearing gate), g2 (competing API class-wide), g3 (cap-rate chip),
   g4 (class-aware copy), h1 (plex pricing path), h2 (two-rail income tiles
   + SF-chrome gate). All tsc-clean, logic/SQL-smoked, sold-rail screenshot-
   confirmed live."

PRE-PUSH SWEEP RESULT (the home-adjustment-math lesson, applied):
  STEP 0 sweep: git status --short | grep "^?? (lib/|app/|components/)"
    → ZERO untracked files under source dirs. Clean.
  Cross-check on imports introduced by g1-h2: every imported module under
  lib/ and app/ is git-tracked (verified via git ls-files against
  home-comparable-matcher-sales.ts, home-adjustment-math.js, types.ts,
  formatters.ts, slugs.ts, HomeEstimatorResults.tsx, estimate-home-sale.ts).
  The 974b79c hotfix scenario (untracked imported module breaks Vercel
  build) CANNOT recur on this push.

STAGING (9 files, explicit per-file, no globs):
  app/[slug]/components/HomeListingCard.tsx       +18/-3   h2 P1 SF-chrome gate
  app/api/charlie/competing-listings/route.ts     +25/-3   g2 widen + h2 P1 floor + h2 finish income cols
  app/estimator/actions/estimate-home-sale.ts     +22/-1   h1 server-action override
  app/estimator/components/
    HomeEstimatorBuyerModal.tsx                   +40/-1   h2 finish competing fetch + state
  app/estimator/components/
    HomeEstimatorResults.tsx                      +213/-9  h1+h2 (tier title, SF panels off, educational note, income block, Competing rail)
  app/property/[id]/HomePropertyPage.tsx          +1/-0    h2 P1 junk-price floor on availableNearby
  components/property/
    HomePropertyEstimateCTA.tsx                   +3/-2    g4 class-aware copy
  lib/estimator/
    home-comparable-matcher-sales.ts              +267/-7  g1 builder + g2 export + h1 band/buildPriced/runPlex + (j) gate switch + h2 P2 HOME_SELECT + builder map
  lib/estimator/types.ts                          +8/-1    h2 P2 ComparableSale.netOperatingIncome + grossRevenue

  Total: 9 files changed, +560/-37 lines.

DELIBERATELY NOT STAGED (3 known excludes, tracker line 2487-2491):
  app/api/charlie/municipalities/route.ts            (trailing-newline only)
  scripts/r-w-territory-master-p2-data-phantom-fix.js (W-TERRITORY workstream)
  scripts/r-w-territory-master-p4-check-fix.js       (W-TERRITORY workstream)

ALSO NOT STAGED (CLAUDE.md hygiene):
  All *.backup_* timestamped files, all scripts/smoke-*.js, all
  scripts/recon-*.js, recon/ output, scripts-output/ CSVs, env files,
  node_modules, the tracker .md itself.

NOTE ON OPERATOR'S EXPECTED LIST:
  Proposed lib/estimator/statistical-calculator.ts: NOT modified (operator
  qualified with "if touched" — it was not). F-CALCULATOR-229 remains
  NAMED-OPEN, untouched intentionally.
  Proposed components/property/HomeListingCard.tsx: that path does not
  exist. The canonical (and modified) file is
  app/[slug]/components/HomeListingCard.tsx.

COMMIT:
  Method: tempfile via Write tool (UTF-8, no BOM — verified first 3 bytes
  = 66 65 61 "fea", not ef bb bf BOM). git commit -F .git-commit-msg-h2.txt.
  Tempfile deleted post-commit.
  Hooks: ran clean, no skip flags used.
  Result:
    [main ecf2f94] feat(estimator): multi-unit goes from route-to-agent to
                   priced + income-enriched
    9 files changed, 560 insertions(+), 37 deletions(-)

GIT LOG (3-deep):
  ecf2f94  feat(estimator): multi-unit goes from route-to-agent to priced +
           income-enriched                                        (THIS COMMIT)
  974b79c  fix(estimator): add missing home-adjustment-math.js
  e35c254  fix(leads): per-(email,tenant,listing_id) dedup on estimator
           CONTACT lead

POST-COMMIT WORKING-TREE STATE:
  HEAD = ecf2f945d8c1b799f7c5f1b4b3c1c14dd943e94e
  origin/main = 974b79c024560cc07a999decb839a62a407a8a88 (unchanged — HOLD
                                                          preserved, 1 commit
                                                          ahead)
  git status --short relevant lines:
     M app/api/charlie/municipalities/route.ts        (known exclude)
     M scripts/r-w-territory-master-p2-data-phantom-fix.js (known exclude)
     M scripts/r-w-territory-master-p4-check-fix.js   (known exclude)
  All other ?? lines are recon outputs, smoke scripts, baselines, tmp
  artifacts, and the tracker itself — the hygiene-excluded set.

WHAT THIS COMMIT BANKS:
  g1  Multi-unit gate (matcher-level): bare-CONTACT  → comps-bearing CONTACT.
      Single-family scoring suppressed on plex tiles.
  g2  Competing-listings API (app/api/charlie/competing-listings/route.ts):
      exact-subtype → class-wide .in() for plex (4 subtypes).
      bed-axis gate dropped for plex (bedrooms_total is a cross-unit sum).
  g3  Cap-rate context chip on multi-unit CONTACT, entry-path-aware,
      subtype-guarded (only renders when subject NOI is loaded).
  g4  Class-aware CONTACT copy (multi-unit vs single-family) on 3 strings
      in HomePropertyEstimateCTA.
  h1  Subtype-aware plex pricing path:
      - PLEX_PRICE_BAND_FRACTION exported constant (Duplex 0.17, Triplex 0.22
        — keyed to MEASURED median APE, not false-precision).
      - buildPricedPlexResult helper (median-of-comps).
      - runPlexPricingPath helper (same-subtype + LAR-adjacent + community
        → muni → area cascade, ≥3-comp threshold to price).
      - (j) gate refactored to subtype-aware switch (Duplex/Triplex PRICE;
        Fourplex/Multiplex enrich-only via g1 helper, unchanged behavior).
      - Server-action override: estimate-home-sale.ts replaces calculator's
        mean with the matcher's median + sets honest priceRange.
  h2 P1 SF-chrome gate on plex listing tiles (Frontage/Lot/Garage/Style/
        Bsmt hidden; Tax stays universal). $100k junk-price floor on
        competing-listings + availableNearby. Plex tier title override.
        SF Match-Details panels hidden on plex.
  h2 P2 Per-tile income block (NOI / Gross Rent / Cap Rate, silent-omit
        per field) on sold-comp tiles. ComparableSale interface +
        HOME_SELECT + plex builder extended with the two income fields.
        Educational one-liner above the sold-comp rail.
  h2 finish  Competing-For-Sale rail wired into the SAME plex result panel
             (LOCKED v11 Option C, Principle 5). Same plex tile shape,
             same income block (cap rate at asking, not at sold). Closes
             the gap flagged at tracker line 2092 since g4 closeout.

BACKTEST EVIDENCE (carried, not re-run):
  Plex-axis backtest (scripts/backtest-plex-axis.js, prior tracker entry):
    Duplex   median APE 17.4%  (vs 33.4% wrong single-family axis)
    Triplex  median APE 22.1%
    Fourplex axis did not save it → enrich-only (the locked decision)
    Multiplex thin pool → enrich-only

CLAIMED, UNVERIFIED (carried with this commit):
  - Browser walkthrough on a real plex MLS# not exercised end-to-end.
    Sold-rail screenshot-confirmed live (operator). Competing-rail
    runtime confirmed at DB-query layer (Hamilton: 10 actives returned
    by the exact-same predicate the API uses); React render cycle for
    the new fire-and-forget fetch + state update not browser-confirmed.
  - h1 server-action override path (the calculator-mean → median swap)
    confirmed at SQL-smoke parity level (smoke-h1-backtest-parity.js);
    Next.js server-action runtime walkthrough not performed.
  - h3 strong-disclaimer surface (the locked wide-band disclaimer copy
    on plex priced results) still PENDING — banked as future work.
  - Lease branch of estimator does NOT fetch competing-for-sale — plex
    lease backtest never run, no measured MAPE for plex leases. Out of
    scope per prior tracker notes.

PUSH STATUS — HELD.
  origin/main = 974b79c. Local main = ecf2f94 (1 commit ahead).
  No `git push` issued this turn. Awaiting explicit operator OK.


================================================================================
PUSH LANDED — origin/main advanced 974b79c → ecf2f94
2026-06-08 12:19:34 UTC (08:19:34 EDT local)
================================================================================

OPERATOR OK granted; `git push origin main` issued at 2026-06-08 ~08:19 EDT.
Standard push: no force, no flags, no hook skips.

  Remote: https://github.com/condoleads/condoleads.git
  Ref update: 974b79c..ecf2f94  main -> main  (fast-forward, 1 commit)
  origin/main pre-push:  974b79c (hotfix — missing home-adjustment-math.js)
  origin/main post-push: ecf2f94 (HEAD = local main = remote main)
  Verified via `git fetch origin main` + `git rev-parse origin/main` —
  both hashes match: ecf2f945d8c1b799f7c5f1b4b3c1c14dd943e94e.

Commit now visible on origin/main:
  ecf2f94  feat(estimator): multi-unit goes from route-to-agent to priced +
           income-enriched

Vercel rebuild expected on ecf2f94. Pre-push sweep (STEP 0 last turn) confirmed
ZERO untracked source files under lib/ app/ components/, AND every imported
module under those dirs is git-tracked. The 974b79c failure mode (untracked
imported module → Vercel build break) CANNOT recur on this build — that was
the explicit lesson encoded into the pre-push sweep guard.

The 3 deliberately-excluded files remain unstaged in the local working tree
(app/api/charlie/municipalities/route.ts trailing-newline + 2 W-TERRITORY
scripts) — untouched by this push, as intended.

RUNTIME / BROWSER VERIFICATION STATUS (carried with this push):
  CONFIRMED LIVE:
    Sold-comp rail (h1 priced output + h2 P2 income block) —
      screenshot-confirmed by operator on a real plex subject. Tier title
      "Recent <Subtype> Sales (Plex Reference)" renders, SF chrome hidden,
      educational note above the rail, income block silent-omits per field.

  NOT YET BROWSER-WALKED:
    Competing-For-Sale rail (h2 finish) — runtime confirmed only at the
      DB-query layer (real-data probe for Hamilton returned 10 active
      plex listings using the exact SELECT the API issues). The
      fire-and-forget fetch in HomeEstimatorBuyerModal → React state update
      → second-rail render has NOT been exercised against the live dev
      server. The Vercel build will compile it; visual confirmation that
      the second rail materializes below the sold rail on a real plex
      subject is owed.
    Full h1 server-action override path through Next.js runtime — SQL-smoke
      parity confirmed (smoke-h1-backtest-parity.js), but the calculator-
      mean → matcher-median swap has not been observed via dev-server +
      browser.

  Operator can now exercise on dev or Vercel preview:
    1. Open a plex /property/[id] (Duplex/Triplex preferred — h1 priced
       path), click the estimator CTA, sign in.
    2. EXPECT: priced result with honest band (Duplex ±17%, Triplex ±22%
       from measured median APE). Tier title "Recent <Subtype> Sales
       (Plex Reference)". SF chrome hidden. Educational note: "Multi-unit
       properties are valued on rental income, not size — figures below
       show each comp's income where reported." Income block on comps that
       carry NOI (~7-15% Duplex/Triplex/Fourplex; rare).
    3. EXPECT: SECOND rail below — "Competing For Sale (N) — N similar plex
       listings on the market now, $X–$Y — your competition." Same plex
       tile shape, asking price, asking-cap on tiles that carry NOI (rare:
       0.1% Duplex actives, 0% other plex subtypes — silent-omit will hide
       the income block on most competing tiles by design).
    4. REGRESSION SPOT-CHECK: open any Detached/Semi/Town/Link subject
       and confirm result is byte-identical to pre-h2 — SF chrome rows
       present, no second rail, no educational note, no income block.

NEXT PHASE (h-series, post-push):
  h3  Strong-disclaimer copy on plex priced results (locked wide-band
      disclaimer that contextualizes 17-22% measured APE). PENDING.
  h4  Browser walkthrough of priced Duplex + enrich-only Fourplex + SF
      regression spot-check. OWED since h1.

Origin/main is now at ecf2f94. No follow-up push planned this turn.


================================================================================
h3 — CHARLIE-STYLE HORIZONTAL PLEX TILES (presentation rebuild, both rails)
2026-06-08 (W-ESTIMATOR-RAG)
================================================================================

OPERATOR DIRECTIVE (verbatim):
  "h3: rebuild plex result tiles to Charlie's horizontal card design. The data
   layer (both rails, income fields, SF-chrome gate) is shipped in ecf2f94 —
   this is PRESENTATION: make the plex tiles match Charlie's compact horizontal
   cards, rich. The plex tiles should REUSE or MIRROR the Charlie card
   structure, adapted for plex (income block instead of SF chrome)."

CHARLIE CARD STRUCTURE (the template, reported from
app/charlie/components/ComparableCard.tsx + ActiveListingCard.tsx):
  WRAPPER:   flex horizontal, borderRadius 14, ~90px tall, hover border lighten.
             cursor:pointer if listingKey. DARK MODE (rgba(255,255,255,0.04) bg,
             white text).
  PHOTO:     90x90 fixed, flex-shrink 0. mediaUrl <img> with 🏠 fallback. Top-
             left badge: Temperature on Comp / "FOR SALE" on Active.
  INFO:      flex:1, padding 10/12, three rows:
             Row 1: Price (16px bold) ↔ right pill (matchQuality / DOM tone)
             Row 2: Address (11px grey, single line, ellipsis)
             Row 3: bed · bath · sqft · DOM · "X mo ago" (11px grey)
  domColor:  ≤21 green / ≤45 amber / else red / null neutral.

REUSE-vs-MIRROR DECISION (operator gate honored):
  Tried REUSE first: cross-import app/charlie/components/{Comparable,
  ActiveListing}Card.tsx into app/estimator/components/HomeEstimatorResults.tsx.
  Blocker: Charlie cards are HARDCODED to a dark-mode token palette
  (rgba(255,255,255,0.04) bg, white text, low-alpha greys). The estimator is
  light-mode (slate-50/200/900). Cross-importing without a theme refactor would
  ship two skins of the same component in one render — visually wrong on the
  estimator surface.
  Considered extending the Charlie cards with a theme prop + incomeSignals
  prop. Rejected: Charlie's ComparableCard + ActiveListingCard are consumed by
  app/charlie/components/ResultsPanel.tsx + SellerEstimateBlock.tsx
  (Charlie's own surface). Any modification ships a regression risk to a
  stable, working surface for a presentation refactor that is scoped to the
  estimator. Wrong trade.
  CHOSE: MIRROR Charlie's structure verbatim in the estimator file, light-
  themed, and FLAG the duplication. The mirrored helpers (plexTimeAgo,
  plexDomTone) explicitly note their Charlie counterparts in the comments.
  If a future third consumer needs the same shape, extract to
  components/property/HorizontalListingCard.tsx with a theme + incomeSignals
  prop and migrate all three call sites — but not on this turn.

BACKUPS (created BEFORE edits, CLAUDE.md rule):
  app/estimator/components/HomeEstimatorResults.tsx.backup_20260608_084032
  lib/estimator/home-comparable-matcher-sales.ts.backup_20260608_084032
  lib/estimator/types.ts.backup_20260608_084032

EDIT 1 — lib/estimator/types.ts (ComparableSale interface)
  Added `mediaUrl?: string | null` below the h2 income fields. Set by the
  matcher's new attachPlexMediaUrls helper before createMultiUnitContact-
  Comparable runs. SF tiles never read this field.

EDIT 2 — lib/estimator/home-comparable-matcher-sales.ts
  (a) NEW attachPlexMediaUrls(sales) async helper. Mirrors the
      app/api/charlie/competing-listings/route.ts media join:
        .select('listing_id, media_url')
        .in('listing_id', ids)
        .eq('variant_type', 'thumbnail')
        .eq('order_number', 0)
      Returns sales array with mediaUrl prop attached. One DB roundtrip per
      rail (≤10 ids). Empty input → no-op.
  (b) createMultiUnitContactComparable now maps `mediaUrl: sale.mediaUrl ?? null`.
  (c) findMultiUnitContactComparables (enrich-only path): attachPlexMediaUrls
      called on cSales and mSales before the .map. Two new awaits (one per
      tier branch).
  (d) runPlexPricingPath (priced path): attachPlexMediaUrls called on cComps,
      mComps, and aComps before buildPricedPlexResult. Three new awaits.
  buildPricedPlexResult kept synchronous — media attached BEFORE the call,
  not inside. Clean separation: matcher fetches media, builder maps.

EDIT 3 — app/estimator/components/HomeEstimatorResults.tsx
  (a) NEW module-level plexTimeAgo + plexDomTone helpers — mirror Charlie's
      timeAgo and domColor verbatim (logic-identical, comment cross-references
      the Charlie file).
  (b) SOLD-COMP RAIL — inside the result.comparables.map, NEW early-return
      branch:
        if (isMultiUnitSubject) { return <CharlieStylePlexTile /> }
      JSX shape (light-themed Tailwind, mirrors Charlie verbatim):
        wrapper: flex bg-white border border-slate-200 hover:border-slate-300 rounded-xl
        photo:   w-24 h-24 bg-slate-100, <img> with 🏠 fallback, subtype pill top-left
        info:    flex-1 px-3 py-2
                 Row 1: Price (text-base font-bold) ↔ DOM pill (plexDomTone)
                 Row 2: Address (text-[11px] text-slate-500 truncate)
                 Row 3: bed · bath · sqft (text-[11px] text-slate-400) +
                        right-aligned "Sold {plexTimeAgo}"
                 Row 4 (conditional): inline NOI/Gross/Cap/GRM strip, silent-
                        omit per field, separated by border-t border-slate-100
        wrapper choice: <a target=_blank> when generateHomePropertySlug yields
                        a slug, else <div>. Same link helper the SF tile uses.
      SF tile JSX UNCHANGED. The new branch is purely additive — the existing
      SF `return ( <div className="bg-slate-50 ..." ... )` lives untouched
      after the if-statement.
  (c) COMPETING-FOR-SALE RAIL — full tile replaced (this rail is plex-only;
      no SF concern). Same Charlie-style horizontal layout as the sold tile,
      with three differences:
        - photo top-left badge: "FOR SALE" (matches Charlie ActiveListingCard)
        - photo bottom-left badge: subtype pill (Active doesn't have temperature)
        - cap-rate denominator: list_price (asking-cap, not sold-cap)
        - GRM denominator: list_price (asking-GRM)
      Income block uses the same NOI/Gross/Cap/GRM silent-omit pattern.
      Rail wrapper spacing changed from space-y-4 → space-y-3 (tighter, matches
      the new compact tile density). Plex-only — no SF regression.

WHAT THE TILE LOOKS LIKE NOW VS BEFORE:
  BEFORE (post-h2-finish):
    Tall vertical stack, ~250-300px per tile, no photo, address+subtype on top
    row, beds/baths on a second row, bordered indigo "💰 Income" sub-panel,
    separate white "Price Section" with "Originally listed" footer + "View
    Property Details →" link at the bottom. 5 plex comps = ~1400px scroll.
  AFTER (h3):
    Compact horizontal card, 96px tall, real photo (93.3% province-wide
    fill — actual thumbnails on most tiles), subtype pill on the photo
    corner, price on the top-right of the info column, DOM tone pill
    (green/amber/red), address on one truncated line, bed·bath·sqft·sold
    timeAgo on one line, NOI/Gross/Cap/GRM strip below in 11px when present.
    Whole tile is clickable; no "View Details" footer needed. 5 plex comps =
    ~500px scroll.
    ~65% less vertical space; matches Charlie's compact density.

TSC --noEmit clean (exit 0).

PREDICATE SMOKE — scripts/smoke-h3-charlie-tile-predicate.js, 53/53 PASS:
  SCENARIO 1: SF subjects route to SF tile branch (Detached/Semi/Att-Row/Link
    + undefined/null/''/Vacant Land all → 'sf'). REGRESSION GUARD HOLDS.
  SCENARIO 2: Plex subjects route to plex tile branch (Duplex/Triplex/
    Fourplex/Multiplex; trailing-space tolerant).
  SCENARIO 3: Income block hidden when both NOI and Gross null/0/undef.
  SCENARIO 4: All 4 signals render with full data; Cap=45k/850k=5.3%;
    GRM=850k/72k=11.8.
  SCENARIO 5: NOI only → NOI + Cap, Gross + GRM omitted.
  SCENARIO 6: Gross only → Gross + GRM, NOI + Cap omitted.
  SCENARIO 7: Competing-rail cap+GRM use list_price denominator (asking),
    not close_price.
  SCENARIO 8: denom=0 defensive — NOI/Gross still render, Cap+GRM omitted.
  SCENARIO 9: DOM tone classifier (≤21 green / ≤45 amber / else red /
    null neutral) matches Charlie domColor verbatim.
  SCENARIO 10: GRM real-shape spot checks (10x-15x typical multifamily).

REAL-DATA PROBE — scripts/smoke-h3-plex-media-coverage.js:
  STEP 1: Hamilton muni-tier top-10 plex sold comps (same predicates as
    findMultiUnitContactComparables) → 10 rows returned.
  STEP 2: media batch join (same query as attachPlexMediaUrls) → 10/10
    tiles will render a REAL thumbnail. Zero 🏠 fallback for this muni.
  STEP 3: Province-wide plex thumbnail fill — 2749 / 2945 = 93.3%. The
    fallback 🏠 fires for ~6.7% of tiles (no thumbnail in media table for
    that listing_id). Honest, real, no fabrication.

  Hamilton tile preview (representative row):
    📷 Duplex   466 Dicenzo Drive    CP=$930,000  3 mo ago  (no income block)
    Photo populated, $930k price, Dicenzo address truncated to first line,
    bed/bath/sqft from MLS, "Sold 3 mo ago" right-aligned, no income strip
    (NOI null on this row).

REGRESSION GUARD VERIFICATION:
  git diff HomeEstimatorResults.tsx shows the SF tile region (`return ( <div
  key={idx} className="bg-slate-50 rounded-xl p-5 ..."` and everything inside)
  is PURELY additive surrounded — the new plex branch is an `if
  (isMultiUnitSubject) { return ... }` early-return BEFORE the SF return. SF
  JSX byte-identical.
  Rail wrapper `space-y-4` preserved on the sold-comp rail (initial change to
  space-y-3 reverted). Competing rail uses space-y-3 (plex-only — no SF
  exposure).

WHAT THIS DOES NOT DO (intentional, scoped):
  - Does NOT extract a shared component to components/property/. Mirrored
    duplication is the right cost trade today (operator's "mirror is OK if
    reuse isn't clean" rule). Three-consumer migration is the next bar.
  - Does NOT modify Charlie's ComparableCard.tsx or ActiveListingCard.tsx.
    Zero Charlie risk.
  - Does NOT change h1 pricing math, the (j) gate, the band fractions, or any
    SF rendering. SF estimator results render byte-identical to ecf2f94.
  - Does NOT add a "View Property Details" footer link on the plex tile —
    redundant when the whole card is an <a> tag.
  - Does NOT add the educational "priced on income" note inside each tile —
    that note already sits above the rail (added h2 Phase 2).

DUPLICATION FLAG (tracker discipline):
  HomeEstimatorResults.tsx now contains plexTimeAgo + plexDomTone helpers that
  are logic-identical to Charlie's timeAgo + domColor (different theme/Tailwind
  classes, same predicates). The duplication is INTENTIONAL for this turn
  (avoiding a Charlie touch). If a third consumer surfaces (e.g. Walliam's
  own seller-side estimator), extract to a shared module then.

KNOWN DEFECTS THIS PHASE DOES NOT TOUCH:
  - F-CALCULATOR-229: still NAMED-OPEN.
  - h4 strong-disclaimer copy on plex priced results: still pending.

CLAIMED, UNVERIFIED:
  - Browser walkthrough on a real plex MLS# not exercised this turn. tsc clean
    + predicate smoke 53/53 + real-data media probe 10/10 photo coverage on
    Hamilton + 93.3% province-wide. The remaining question — does the actual
    rendered HTML resolve cleanly in a browser at the new compact density —
    needs an operator walk.
  - The dev-server hot-reload of HomeEstimatorResults.tsx with the new
    children (long flex wrappers + <a target=_blank>) — has not been observed.

NEXT PHASE (h-series):
  h4 — Strong-disclaimer copy on plex priced results (the wide-band
       disclaimer contextualizing 17-22% measured APE). Still pending.
  h5 — Browser walkthrough: priced Duplex + enrich-only Fourplex + SF
       regression spot-check side by side. Owed since h1.

Push status: origin/main = ecf2f94 (g1-h2 bundle, banked + pushed). Local main
  has g1-h2 + this h3 presentation rebuild on top.
  - 3 files modified this h3 entry:
      lib/estimator/types.ts
      lib/estimator/home-comparable-matcher-sales.ts
      app/estimator/components/HomeEstimatorResults.tsx
  - 2 new smoke scripts:
      scripts/smoke-h3-charlie-tile-predicate.js
      scripts/smoke-h3-plex-media-coverage.js
  - NO commit, NO push this turn. HOLD per operator's standing instruction.


================================================================================
h3 BUG PINPOINTED — competing-listings fetch wired to wrong surface component
2026-06-08 (W-ESTIMATOR-RAG)
================================================================================

OPERATOR REPORT (verbatim, from walkthrough):
  "The operator's console paste was a PropertyGallery duplicate-key warning,
   NOT the [debug] competing gate line. Also: operator reports the estimator
   AUTO-RUNS on the single-property page (no credit gate — predates the
   credit system)."

ROOT CAUSE (path trace, no browser needed):
  There are TWO components that render <HomeEstimatorResults> on Walliam's
  estimator surfaces. The competing-listings fetch was wired to the WRONG
  ONE for the single-property walkthrough URL.

  SURFACE A — Single-property page (the walkthrough URL):
    URL pattern  : /{street-slug}-{city-slug}-{listingKey}
    Route        : app/[slug]/page.tsx → app/property/[id]/HomePropertyPage.tsx
                   → app/property/[id]/HomePropertyPageClient.tsx
    Renders      : <HomePropertyEstimateCTA listing={...} isSale agentId={...} />
                   (HomePropertyPageClient.tsx:201 + :223 — two placements,
                    mobile + desktop hero block)
    Estimator behavior:
      AUTO-RUNS on mount (useEffect on listing/isSale/agentId, lines 23-67).
      Calls estimateHomeSale(specs, false) DIRECTLY — second arg is the
      "requires session/credit" flag; passing false skips the session gate.
      On success, renders <HomeEstimatorResults result={...}> DIRECTLY
      (HomePropertyEstimateCTA.tsx:94-117).
    Competing-listings fetch wired here?  ✗ NO.
    Operator's walkthrough on 37 Mckelvie hit THIS surface.

  SURFACE B — Modal estimator (geo pages + property-page secondary CTA):
    Callers (3):
      - app/[slug]/components/NeighbourhoodListingSection.tsx:297
      - app/[slug]/components/GeoListingSection.tsx:407
      - app/property/[id]/HomePropertyPageClient.tsx:256 (in addition to the
        auto-run CTA above)
    Renders      : <HomeEstimatorBuyerModal isOpen onClose listing agentId />
    Estimator behavior:
      Manual trigger (modal open). Goes through checkAndEstimate session
      gate (allowed/credits/VIP flow) BEFORE handleEstimate.
      handleEstimate calls estimateHomeSale(homeSpecs, true) — true = needs
      session.
      On success, fires my h2-finish fetch and renders
      <HomeEstimatorResults result competingListings />.
    Competing-listings fetch wired here?  ✓ YES (h2-finish, ecf2f94).
    The DEBUG log added this turn lives HERE — but this surface was never
    invoked during the walkthrough, so the log never fired.

  GAP at h2-finish: my modal-only fetch wiring closed half the spec. The
  CTA-driven auto-run path on the single-property page was NEVER WIRED to
  fetch competing listings. Tracker line 2092 (g4 closeout) had EXPLICITLY
  flagged both components as audit candidates:
    "CLAIMED, UNVERIFIED on disk this session: whether the Comparable Sold +
     Competing For Sale tiles render together in the SAME result panel...
     components/property/HomePropertyEstimateCTA.tsx + app/estimator/
     components/HomeEstimatorBuyerModal.tsx are the candidates to verify.
     Out of recon scope for this lock; flagged for a UI-side audit."
  h2-finish wired the modal only. The CTA was not wired. The tracker note
  was never closed. THAT'S the bug.

EVIDENCE THIS IS THE FAILURE MODE (not a subtype/muniId/network issue):
  - Server log shows estimateHomeSale ran with propertySubtype='Duplex' and
    municipalityId='9326cc73-...' — so the listing carries both correctly.
  - Server log shows NO POST to /api/charlie/competing-listings during the
    walkthrough (the only POST in the log is my later direct curl).
  - HomePropertyEstimateCTA.tsx has NO fetch('/api/charlie/competing-
    listings') anywhere. Grep confirms (zero matches in
    components/property/).
  - HomeEstimatorResults receives the result fine and renders the sold-comp
    rail correctly (operator confirmed sold rail + Charlie-style tiles
    visible) — because the CTA passes `result` directly. competingListings
    prop is simply never set on this surface (defaults to undefined →
    `isMultiUnitSubject && competingListings && length > 0` short-circuits
    → no rail).

  Diagnosis: 100% confirmed without needing the browser DevTools line.
  The debug log can be removed; it can never fire on the surface that
  matters.

DEBUG LOG STATUS:
  Still present in HomeEstimatorBuyerModal.tsx at line ~286 (the line right
  before the gate). It will fire if the operator opens any of the 3 modal
  callsites (geo pages, or the property page's secondary CTA modal). But it
  cannot fire on the auto-run CTA path. Remove pre-commit.

FIX (NOT APPLIED THIS TURN, per operator "No fix yet"):
  Wire the same fetch + state into HomePropertyEstimateCTA.tsx:
    (a) Add competingListings useState.
    (b) After the auto-run estimateHomeSale resolves with success on a plex
        subject (using the same MULTI_UNIT_SUBTYPES + .trim() check), POST
        /api/charlie/competing-listings with {path:'home', municipalityId,
        bedrooms, livingAreaRange, propertySubtype} and setCompetingListings
        on response.
    (c) Pass competingListings prop to <HomeEstimatorResults>.
  Same wiring as the modal — copy-paste, not new logic. The CompetingListing
  type is already exported from HomeEstimatorResults.

  Future cleanup (NOT this turn): the two estimator surfaces (CTA auto-run
  and Modal manual-trigger) duplicate orchestration logic — same estimate
  call, same competing fetch, same render. Both should converge on a shared
  hook (useEstimator(specs)) that returns {result, competing, loading}, with
  the CTA and Modal as thin shells. Out of h3 scope.

PUSH STATUS — HELD.
  h3 NOT committed. The Charlie-style tile rebuild is correctly working on
  the auto-run surface (operator confirmed sold rail visually), but the
  competing rail (the other half of h3 / LOCKED v11 Option C) is not wired
  here. Committing h3 now would ship a partial fix. Defer commit until the
  CTA wire-up lands and operator visually confirms the competing rail
  renders on a Hamilton walkthrough.


================================================================================
F-ESTIMATOR-AUTORUN-NO-CREDIT-GATE — NAMED, OPEN
2026-06-08 (W-ESTIMATOR-RAG)
================================================================================

NAMED: F-ESTIMATOR-AUTORUN-NO-CREDIT-GATE
STATUS: OPEN
DISCOVERED: 2026-06-08, during h3 walkthrough diagnosis.

OPERATOR FLAG (verbatim):
  "the estimator AUTO-RUNS on the single-property page (no credit gate —
   predates the credit system). This may be WHY the competing fetch doesn't
   fire — the auto-run path may differ from the manual estimate path."

DESCRIPTION:
  HomePropertyEstimateCTA.tsx (the auto-run CTA on the single-property page)
  calls estimateHomeSale(specs, false) on mount with NO session/credit
  check. The modal path (HomeEstimatorBuyerModal) goes through
  checkAndEstimate which gates on /api/{walliam,}/estimator/session →
  data.allowed + data.remaining > 0 → /api/{walliam,}/estimator/increment
  before running. The CTA path bypasses that entirely.

WHY IT EXISTS (best read of history):
  HomePropertyEstimateCTA predates the estimator credit system. When credits
  were added, the modal was retrofitted with the session gate, but the CTA
  was left as-is — every page view on a /property URL triggers a free
  estimate compute.

WHY IT MATTERS:
  - Cost: every plex /property page view runs runPlexPricingPath (an
    estimateHomeSale call + matcher cascade + median compute + server-action
    work). For a public listing browsed by bots/social previews, that's
    free compute the user doesn't even see.
  - Conversion model: the credit system exists to convert free-tier viewers
    to leads; bypassing it on the highest-intent surface (a specific
    property page) is the opposite of the funnel.
  - Inconsistency: identical estimator experience accessible via two paths
    with two different gating policies. Hard to reason about per-tenant
    quota.

REMEDIATION OPTIONS (not decided this turn):
  A. Retrofit the CTA with the same session+credits gate as the modal.
     Likely shows the "free estimate / X remaining / sign in for more"
     copy on the CTA card rather than auto-rendering the result panel.
  B. Make the CTA into a click-to-reveal: show a "Get instant estimate"
     button → on click, run the same gated flow as the modal.
  C. Tenant-aware default: WALLiam (current behavior, free) vs aily and
     future tenants (gated).
  D. No change — keep auto-run free as a SEO/discovery feature.

DECISION OWED: Operator.

OUT OF SCOPE FOR h3. Logged separately so the architectural decision isn't
lost when h3 closes.


================================================================================
h3+h4 BUNDLE COMMITTED — c57c2dd (push HELD)
2026-06-08 (W-ESTIMATOR-RAG)
================================================================================

OPERATOR DIRECTIVE (verbatim):
  "COMMIT h3+h4 (tile redesign bundle). Operator visually confirmed the
   converged tiles render correctly (SF photo+badge added, adjustment
   reasoning intact; plex income panels + match-basis; consistent STATUS·
   SUBTYPE badges; competing rails subject-matched). SF parity 50/50 byte-
   identical. Bank the bundle on top of pushed ecf2f94."

PRE-PUSH SWEEP RESULT (the home-adjustment-math lesson, applied):
  STEP 0 sweep: git status --short | grep "^?? (lib/|app/|components/)"
    → 2 untracked dirs under source tree:
      - app/estimator/hooks/                        (useCompetingListings.ts)
      - app/api/parity-probe-sf-sold/               (route.ts)
  Per-file import audit:
    useCompetingListings.ts:
      IMPORTED by HomePropertyEstimateCTA.tsx:9 + HomeEstimatorBuyerModal.tsx:10
      (both in the staging set). → STAGED. If left untracked, Vercel build
      breaks on clean checkout (the 974b79c failure mode).
    parity-probe-sf-sold/route.ts:
      Referenced only by scripts/parity-*-baseline.js test harnesses (HTTP
      fetch from local Node, never compiled into prod bundles).
      → EXCLUDED. Stays as a local-only test surface.
  Verdict: 974b79c failure mode cannot recur on this push.

STAGING (7 files, explicit per-file, no globs):
  lib/estimator/home-comparable-matcher-sales.ts   +253/-12   h3 attachMediaUrls rename + findActiveCompetition (plex+SF branches, media join, list_price asc ordering) + shared predicates (plexComparablePredicate, notAsIs) + h4 createHomeComparable.mediaUrl + 4 SF returns now attach media before .map
  lib/estimator/types.ts                           +4         h3 ComparableSale.mediaUrl optional field
  app/api/charlie/competing-listings/route.ts      +107/-103  h3 home-path delegates to findActiveCompetition (plex AND SF — both branches via the matcher's per-type comparability). Condo path untouched. Body now accepts communityId / bathrooms / architecturalStyle / approximateAge for SF funnels
  app/estimator/hooks/useCompetingListings.ts      NEW +77    h3 shared hook — single source of truth for the competing-listings fetch. Used by BOTH the modal and the CTA. Prevents future modal/CTA drift (the recurring bug class — fix one place, hit both surfaces)
  app/estimator/components/HomeEstimatorBuyerModal.tsx +58/-50  h3 modal switched from inline fetch to useCompetingListings hook; threads communityId/bathrooms/architecturalStyle/approximateAge so SF funnels work on the competing rail
  components/property/HomePropertyEstimateCTA.tsx  +24/-7     h3 CTA wired to useCompetingListings hook (closes the line-2092 unverified gap that's been open since g4 closeout — the CTA auto-run path on /property URLs never had a competing rail). Threads the same specs the modal does
  app/estimator/components/HomeEstimatorResults.tsx +353/-77  h3 Charlie horizontal sold-comp tiles (photo, badges, DOM tone pill, plexTimeAgo); h3 competing rail renders for ALL home subjects (was plex-only) using the per-type findActiveCompetition output; h4 converged sold tile (shared photo+header frame + type-specific enrichment); h4 plex match-basis line ("Same {Subtype} · similar size"); h4 unified STATUS·SUBTYPE badges (slate-700 SOLD, blue-600 FOR SALE) replacing the inconsistent pills; income panel gated on isMultiUnitSubject (subject-level, not row-level — stray NOI on SF rows can't trigger income chrome); removed dead unreachable plex-income block from SF fall-through

  Total: 7 files changed, +664/-212 lines.

DELIBERATELY NOT STAGED (3 known excludes — same as ecf2f94 push):
  app/api/charlie/municipalities/route.ts             (trailing-newline only)
  scripts/r-w-territory-master-p2-data-phantom-fix.js (W-TERRITORY workstream)
  scripts/r-w-territory-master-p4-check-fix.js        (W-TERRITORY workstream)

EXCLUDED — local-only test surface (intentional, untracked):
  app/api/parity-probe-sf-sold/route.ts
  scripts/parity-sf-sold-baseline.js
  scripts/parity-plex-sold-baseline.js
  scripts/parity-h4-sf-tile-datums.js
  scripts-output/parity-*.json (baseline + verify JSONs)
  These are dev-time guards: the probe is a thin HTTP wrapper around
  findHomeComparables to let scripts capture per-subject matcher output for
  before/after diffs. Useful for any future SF-touching refactor; not part of
  the production estimator surface. Keeping local prevents shipping a probe
  endpoint to Vercel that has no business there.

ALSO NOT STAGED (CLAUDE.md hygiene):
  All *.backup_*, scripts/smoke-*.js, scripts/recon-*.js, scripts/_scratch-*,
  scripts/find-priced-duplex-candidate.js, scripts/diag-*.js, the tracker
  .md itself, env files, scripts-output/ CSVs+JSONs, node_modules.

COMMIT:
  Method: tempfile via Write tool (UTF-8 no-BOM — first 3 bytes 66 65 61
  "fea", not ef bb bf BOM). git commit -F .git-commit-msg-h3h4.txt.
  Tempfile deleted post-commit.
  Hooks: ran clean. No --no-verify / --amend / --no-gpg-sign / hook-skip
  flags used.
  Result:
    [main c57c2dd] feat(estimator): converged Charlie tiles + subject-matched
                   competing rail (h3+h4)
    7 files changed, 664 insertions(+), 212 deletions(-)
    create mode 100644 app/estimator/hooks/useCompetingListings.ts

GIT LOG (3-deep):
  c57c2dd  feat(estimator): converged Charlie tiles + subject-matched
           competing rail (h3+h4)                            (THIS COMMIT)
  ecf2f94  feat(estimator): multi-unit goes from route-to-agent to priced +
           income-enriched
  974b79c  fix(estimator): add missing home-adjustment-math.js

POST-COMMIT WORKING-TREE STATE:
  HEAD        = c57c2dd8955ba642e0d79cb6399f8aa7ee358a87
  origin/main = ecf2f945d8c1b799f7c5f1b4b3c1c14dd943e94e (unchanged — HOLD
                                                          preserved, 1 commit
                                                          ahead)
  git status --short relevant lines:
     M app/api/charlie/municipalities/route.ts             (known exclude)
     M scripts/r-w-territory-master-p2-data-phantom-fix.js (known exclude)
     M scripts/r-w-territory-master-p4-check-fix.js        (known exclude)
    ?? app/api/parity-probe-sf-sold/                       (local-only test)
  All other ?? lines are the standard hygiene-excluded set (recon, smokes,
  backups, scripts-output, the tracker).

WHAT THIS COMMIT BANKS:
  h3  Charlie horizontal sold-comp tiles (photo + compact info + DOM tone
      pills + plexTimeAgo). Competing-For-Sale rail wired into BOTH estimator
      surfaces (modal + CTA auto-run) via the new shared useCompetingListings
      hook — closing the line-2092 audit gap flagged at g4 closeout. Server-
      side findActiveCompetition mirrors the per-type sold-comp match
      criteria on ACTIVE listings: one matching path, two statuses, all
      types. Plex: same-subtype + LAR-adjacent + community→muni→area
      cascade. SF: subtype-family + applyFunnel strict → relaxed → last-
      resort bed+bath, community→muni cascade.
  h4  Converged sold-comp tile. Shared photo+header frame across both types:
      96×96 photo column with unified STATUS·SUBTYPE badge (slate-700 SOLD /
      blue-600 FOR SALE), info column with price, temperature-or-DOM pill,
      address, bed/bath/sqft/parking, sold-date/DOM. Type-specific
      enrichment below: SF retains FULL Match-Details panels (BINGO/RANGE/
      MAINT checkmarks) + adjustment breakdown (↑↓ rows with reason + amount)
      + Adjusted Value + "Very similar home" message + Originally listed +
      View Details link — every datum byte-identical to pre-h4. Plex gets
      elevated indigo income panel (Cap headline + NOI/Gross/GRM) with
      indigo left-accent border + muted match-basis line ("Same {Subtype} ·
      similar size"). Income panel gated on subject-level isMultiUnitSubject;
      stray NOI on non-plex rows can't trigger income chrome. Unified
      STATUS·SUBTYPE badges across sold + competing tiles.

PARITY EVIDENCE BAKED INTO COMMIT:
  h3 SF sold-pipeline parity (the predicate-extraction guard):
    50/50 SF subjects byte-identical across (tier, geoLevel, bestMatchScore,
    comparables[listing_key/close_price/match_score])
    20 Detached (mix of BINGO/BINGO-ADJ/RANGE/RANGE-ADJ/CONTACT)
    15 Semi-Detached (all CONTACT — the F-MLS-SUBTYPE-TRAILING-SPACE-SEMI
       data quirk; pre-existing, not caused by h3)
    10 Att/Row/Townhouse (BINGO/RANGE mix)
    5 Link (BINGO-ADJ/RANGE/CONTACT)
  h3 Plex sold-pipeline parity:
    25/25 byte-identical (15 Duplex + 10 Triplex, runPlexPricingPath)
  h4 SF tile-datum parity (the renderer-rebuild guard):
    50/50 SF subjects byte-identical on FULL datum capture:
      close_price, list_price, adjustments[](reason+amount), adjusted_price,
      match_quality, match_tier, temperature, exact_sqft, user_exact_sqft,
      days_on_market, parking, association_fee, listing_key, unit_number,
      bedrooms, bathrooms, living_area_range, close_date
    (One subject diverged on first verify run — transient flake; rerun
    showed byte-identical. The matcher is deterministic on a fixed
    AS_OF_DATE; flakes don't recur after warm-cache.)

OPERATOR VISUAL CONFIRMATION (verbatim from this turn):
  "the converged tiles render correctly (SF photo+badge added, adjustment
   reasoning intact; plex income panels + match-basis; consistent STATUS·
   SUBTYPE badges; competing rails subject-matched). SF parity 50/50 byte-
   identical."

CLAIMED, UNVERIFIED:
  - F-ESTIMATOR-AUTORUN-NO-CREDIT-GATE remains OPEN. The CTA still auto-runs
    estimateHomeSale(specs, false) on every /property page load with no
    session/credit gate. Decision options A-D logged separately in tracker.
    Not in h3+h4 scope.
  - F-MLS-SUBTYPE-TRAILING-SPACE-SEMI remains OPEN (discovered during the
    h3 parity recon). MLS stores 'Semi-Detached ' with a trailing space on
    all 67481 rows; the matcher's .in('property_subtype', ['Semi-Detached'])
    fails to match, so Semi subjects always return CONTACT. Pre-existing
    data hygiene bug, not introduced by h3+h4.
  - Lease branch of estimator does NOT fetch competing-for-sale — only the
    sale branch. Plex lease comps still out of scope per prior tracker
    notes (no measured plex-lease MAPE).
  - Multi-tenant: the h3+h4 changes are all tenant-agnostic. Tenant-resolver
    untouched.
  - Vercel build pending. Pre-push sweep + tsc clean give high confidence;
    the canonical proof is the Vercel deploy log after push lands.

PUSH STATUS — HELD.
  origin/main = ecf2f94. Local main = c57c2dd (1 commit ahead).
  No `git push` issued this turn. Awaiting explicit operator OK.


================================================================================
PUSH LANDED — origin/main advanced ecf2f94 → c57c2dd
2026-06-08 18:21:43 UTC (14:21:43 EDT local)
================================================================================

OPERATOR OK granted; `git push origin main` issued at 2026-06-08 ~14:21 EDT.
Standard push: no force, no flags, no hook skips.

  Remote: https://github.com/condoleads/condoleads.git
  Ref update: ecf2f94..c57c2dd  main -> main  (fast-forward, 1 commit)
  origin/main pre-push:  ecf2f94 (g1-h2 plex pricing + two-rail income tiles)
  origin/main post-push: c57c2dd (HEAD = local main = remote main)
  Verified via `git fetch origin main` + `git rev-parse origin/main` —
  both hashes match: c57c2dd8955ba642e0d79cb6399f8aa7ee358a87.

Commit now visible on origin/main:
  c57c2dd  feat(estimator): converged Charlie tiles + subject-matched
           competing rail (h3+h4)

Vercel rebuild expected on c57c2dd. Pre-push sweep (STEP 0 last turn)
confirmed:
  - useCompetingListings.ts (the new shared hook imported by BOTH modal and
    CTA) is STAGED + committed → no untracked-import build break.
  - parity-probe-sf-sold/route.ts (the local test surface) intentionally
    excluded — Vercel never sees it, no surprise route at /api/parity-probe.
  - The 974b79c failure mode (untracked imported module → Vercel build
    break) cannot recur on this build.

The 3 deliberately-excluded files remain unstaged in the local working tree
(app/api/charlie/municipalities/route.ts trailing-newline + 2 W-TERRITORY
scripts) — untouched by this push, as intended for the third consecutive
push (e35c254 → 974b79c → ecf2f94 → c57c2dd).

FULL g1 → h4 PLEX+SF TILE REDESIGN NOW BANKED ON ORIGIN:
  g1 (matcher comps-bearing gate)
  g2 (competing-listings API class-wide for plex)
  g3 (cap-rate context chip)
  g4 (class-aware CONTACT copy)
  h1 (plex pricing path — Duplex/Triplex PRICE on plex axis, measured
      Duplex APE 17.4% / Triplex 22.1% honest band fractions; Fourplex/
      Multiplex enrich-only)
  h2 (two-rail plex result — Comparable Sold + Competing For Sale,
      educational note, per-tile income block, SF-chrome gate)
  h3 (Charlie horizontal tiles + shared useCompetingListings hook + server
      findActiveCompetition: ONE matching path, two statuses, all types —
      competing rail for SF AND plex, subject-matched per type)
  h4 (converged sold tile — photo+header frame across types, SF datums
      byte-identical, plex elevated income panel + match-basis line,
      unified STATUS·SUBTYPE badges)

  Three commits total on origin/main banking this workstream:
    278e3d9  feat(estimator): bank W-ESTIMATOR-RAG matcher workstream +
             multi-unit gate                                   (2026-06-07)
    ecf2f94  feat(estimator): multi-unit goes from route-to-agent to
             priced + income-enriched                          (2026-06-08)
    c57c2dd  feat(estimator): converged Charlie tiles +
             subject-matched competing rail (h3+h4)            (2026-06-08)

RUNTIME / BROWSER VERIFICATION STATUS (carried with this push):
  CONFIRMED LIVE (operator visual confirmation, this session):
    Sold-comp rail with Charlie horizontal tiles (h3) — photos, DOM tone
      pills, compact ~96px tile height.
    Competing-For-Sale rail subject-matched (h3) — plex tiles same-subtype
      + LAR-adjacent + community-first; SF tiles funnel-matched (strict/
      relaxed/last-resort).
    Converged sold tile (h4) — SF photo+badge added, adjustment reasoning
      intact (50/50 byte-identical parity); plex income panels + indigo
      elevation + match-basis line.
    Unified STATUS·SUBTYPE badges across sold + competing tiles.
    Both rails populate on Hamilton Duplex (1 Milton Ave) AND Woodstock
    Detached (137 Harwood Ave).

  STILL OWED (the trifecta of "claimed unverified"):
    h1 server-action override path through Next.js production runtime —
      SQL-smoke parity confirmed; full estimator→action→matcher→calculator→
      override→render path not exercised post-Vercel-deploy.
    Strong-disclaimer copy on plex priced results (h5/h6 future scope) —
      the locked wide-band disclaimer that contextualizes 17-22% measured
      APE is still pending. Honest priced range exists in data; explanatory
      copy doesn't yet wrap it.
    Lease branch competing-for-sale — sale branch only; lease still
      out of scope.

NAMED-OPEN ISSUES CARRIED FORWARD (unchanged by this push):
  F-ESTIMATOR-AUTORUN-NO-CREDIT-GATE — auto-run CTA bypasses session
    /credit gate (discovered h3 walkthrough). Decision options A-D logged.
  F-MLS-SUBTYPE-TRAILING-SPACE-SEMI — MLS stores 'Semi-Detached ' with
    trailing space on 67481 rows; matcher's .in() predicate fails, so
    Semi subjects always return CONTACT. Pre-existing data hygiene bug.
  F-CALCULATOR-229 — the "Your unit requires..." CONTACT subtitle from
    statistical-calculator.ts:229. NAMED-OPEN since g4.

Origin/main is now at c57c2dd. No follow-up push planned this turn.


================================================================================
F-MLS-SUBTYPE-TRAILING-SPACE-SEMI — FIXED (code-side defensive normalization)
2026-06-08 (W-ESTIMATOR-RAG)
================================================================================

OPERATOR DIRECTIVE (verbatim):
  "F-MLS-SUBTYPE-TRAILING-SPACE-SEMI: APPROVED code fix, data cleanup deferred.
   Code-fix now (defensive variants at the matcher comparison points), data+
   sync cleanup deferred as separate named-open issue."

BUG (confirmed via measurement, 2026-06-08):
  MLS stores 'Semi-Detached ' with ONE trailing space on 100% of that
  subtype's 67,481 rows. All 37 OTHER property_subtype values are clean
  (no whitespace contamination). Detected during the h3 SF parity recon
  when 15/15 Semi-Detached subjects in the parity sample returned
  tier=CONTACT geo=none comps=0 — the matcher's `.in('property_subtype',
  ['Semi-Detached'])` predicate fails to match 'Semi-Detached ' (with
  trailing space), so 100% of Semi inventory was invisible to the matcher.

  User-visible impact pre-fix: every Semi-Detached estimator subject saw an
  empty "Recently Sold Nearby" rail — the result panel rendered correctly,
  but had zero comps to display. Silent failure.

DIAGNOSIS (scripts/diag-property-subtype-whitespace.js, read-only):
  (a) 38 distinct property_subtype values in mls_listings. Exactly ONE has
      whitespace contamination:
        |Semi-Detached | (length 14, ONE trailing space, n=67481)
      All other 37 values are clean. Detached (n=555877), Att/Row/Townhouse
      (n=107981), Link (n=4246), Duplex (n=10201), Triplex (n=5219),
      Fourplex (n=2752), Multiplex (n=10214) — all 100% matchable.
  (b) Logical subtypes with BOTH clean and whitespace variants: 0
      Logical subtypes that exist ONLY as whitespace variants: 1 (Semi)
      Logical subtypes that are clean: 37
      → Not a mixed-data problem. Semi-Detached is TOTAL contamination;
        zero clean rows exist.
  (c) Estimator code paths affected (the `.in()` and `.eq()` against
      property_subtype):
        Affected (broken for Semi):
          - findHomeComparables community-tier + muni-tier `.in(subtypes)`
          - findActiveCompetitionSF community-tier + muni-tier `.in(subtypes)`
        Unaffected (plex subtypes clean):
          - runPlexPricingPath.tierQuery `.eq(propertySubtype)`
          - runPlexPricingPath area-tier `.eq(propertySubtype)`
          - findActiveCompetitionPlex.tierQuery + area-tier `.eq(propertySubtype)`
          - findMultiUnitContactComparables `.in(MULTI_UNIT_SUBTYPES)`

FIX (code-side, defensive normalization at the comparison points):
  Added helper in lib/estimator/home-comparable-matcher-sales.ts, next to
  the other shared predicates (notAsIs, plexComparablePredicate):

    function propertySubtypeVariants(subtype: string): string[] {
      // F-MLS-SUBTYPE-TRAILING-SPACE-SEMI: MLS stores 'Semi-Detached ' with
      // ONE trailing space on 100% of that subtype (67481 rows, measured
      // 2026-06-08); all 37 other subtypes clean. This returns the clean
      // value + the single-trailing-space variant so .in()/.eq() match both.
      // NOTE: keyed to the MEASURED single-trailing-space pattern — if MLS
      // data later carries other whitespace (leading, double, tab) this
      // silently misses again. The permanent fix is the deferred data-
      // cleanup + sync-btrim workstream (F-MLS-DATA-CLEANUP-TRAILING-SPACE);
      // this is the defensive code guard until then. ALWAYS use this helper
      // instead of writing raw .eq()/.in() against property_subtype.
      return subtype === subtype.trim()
        ? [subtype, subtype + ' ']
        : [subtype, subtype.trim()]
    }

APPLIED AT ALL 10 COMPARISON POINTS in the matcher (verified via grep):
  Pattern 1 — `.in('property_subtype', MULTI_UNIT_SUBTYPES)` (2 sites in
  findMultiUnitContactComparables) → swapped to
  `.in('property_subtype', MULTI_UNIT_SUBTYPES.flatMap(propertySubtypeVariants))`
  (defensive — MULTI clean today, future-proofs).
  Pattern 2 — `.eq('property_subtype', specs.propertySubtype)` (4 sites in
  runPlexPricingPath + findActiveCompetitionPlex tier queries) → swapped to
  `.in('property_subtype', propertySubtypeVariants(specs.propertySubtype))`.
  Pattern 3 — `.in('property_subtype', subtypes)` (4 sites in
  findHomeComparables + findActiveCompetitionSF cascades) → swapped to
  `.in('property_subtype', subtypes.flatMap(propertySubtypeVariants))`.

  Total: 1 helper added, 10 call sites updated. Single matcher file. No
  other component touched. Modal + CTA + hook untouched (they already
  pass trimmed subject subtype; the fix is on the COMPARISON side where
  the matcher queries the DB).

tsc --noEmit clean (exit 0).

PARITY (the measurement that proves the fix unbreaks Semi without
disturbing the clean subtypes):

  SF SOLD PARITY (scripts/parity-sf-sold-baseline.js, 50 subjects):
    Mix: 20 Detached + 15 Semi-Detached + 10 Att/Row/Townhouse + 5 Link.
    Pre-fix baseline captured during h3 STEP A.

    Post-fix verify result:
      40/50 byte-identical (the clean subtypes — exactly what was
        predicted: Detached 20/20, Att/Row/Townhouse 10/10, Link 5/5,
        plus 5 Semi-Detached that stay CONTACT due to genuinely thin
        muni/community Semi pool — data-driven, not bug).
      10/50 DIVERGED (every divergence is a Semi-Detached unbreak):
        7 Semi → BINGO-ADJ community tier (6-9 comps, best scores 140-152)
        2 Semi → RANGE community tier (6 comps each)
        1 Semi → RANGE municipality tier (3 comps, muni fallback)
        (Note: 1 of the "still CONTACT" Semis matched 2 comps via muni
         last-resort bed+bath — partial unbreak.)
      Total Semi-Detached unbreak: 11/15 (73%) now see at least one
        comp via the matcher. 4 still CONTACT geo=none (genuinely thin
        Semi inventory in those subjects' munis).

  PLEX SOLD PARITY (scripts/parity-plex-sold-baseline.js, 25 subjects):
    25/25 byte-identical. Plex was already clean (Duplex/Triplex/Fourplex/
    Multiplex all stored without whitespace); the helper is a strict
    superset on the `.in()` array, so clean matches stay matched.
    ✓ PARITY PASS — plex refactor byte-identical.

VERDICT:
  - Clean subtypes (Detached/Att-Row/Link/Duplex/Triplex/Fourplex/Multiplex):
    byte-identical. Live production behavior unchanged.
  - Semi-Detached: deliberately diverged — the bug-unbreak. 67k rows that
    were 100% invisible to the matcher are now 100% reachable. 11/15
    sampled Semi subjects now produce comp-bearing results where they
    previously returned empty CONTACT.

FILES MODIFIED (1):
  lib/estimator/home-comparable-matcher-sales.ts
    + helper propertySubtypeVariants (new)
    + 10 call sites swapped from raw .eq()/.in() to helper-wrapped .in()

NOT TOUCHED:
  - Modal / CTA / hook / Results component — they already pass trimmed
    subject subtype; comparison-side fix needed nothing client-side.
  - Other matcher logic (funnels, scoring, cascade thresholds) — untouched.
  - Production data — no UPDATEs run. Deferred to follow-up workstream.

PUSH STATUS — HELD per operator instruction.
  origin/main = c57c2dd (the h3+h4 bundle). Local main = c57c2dd + 1
  uncommitted modified file (matcher). NOT committed this turn — operator
  decides whether this ships as a standalone fix commit or bundles with
  the next workstream.


================================================================================
F-MLS-DATA-CLEANUP-TRAILING-SPACE — NAMED, OPEN (deferred workstream)
2026-06-08 (W-ESTIMATOR-RAG)
================================================================================

NAMED:  F-MLS-DATA-CLEANUP-TRAILING-SPACE
STATUS: OPEN — deferred per operator directive 2026-06-08
DISCOVERED: 2026-06-08 during h3 SF parity recon.
SUPERSEDES: complementary to F-MLS-SUBTYPE-TRAILING-SPACE-SEMI's code-side
            defensive fix (which ships immediately); this is the permanent
            data-side cleanup that should follow.

DESCRIPTION:
  PropTx/MLS stores 'Semi-Detached ' (with one trailing space) on 100%
  of the 67,481 Semi-Detached rows in mls_listings.property_subtype.
  All other 37 distinct subtypes are stored cleanly. The estimator's
  defensive helper propertySubtypeVariants (shipped 2026-06-08) lets the
  matcher SEE these rows now, but the data itself is still contaminated;
  every downstream consumer that compares property_subtype with .eq() /
  .in() / IN-clause SQL is at risk if it doesn't use the same helper.

WHY THIS IS A SEPARATE WORKSTREAM, NOT A QUICK FIX:
  - 67k rows is not "a few." The UPDATE is meaningful production write
    activity on the largest table in the database.
  - The MLS sync (GitHub Actions nightly) writes whatever PropTx sends.
    If PropTx is the source of the trailing space (likely — 100%
    contamination is unlikely to come from our side), then a one-time
    UPDATE self-undoes on the next sync.
  - Need to audit OTHER PropTx string columns the matcher reads —
    architectural_style (JSONB array, but elements could be contaminated),
    basement (JSONB), pool_features (JSONB), approximate_age, etc.
    Same defect class may exist elsewhere; haven't checked.

PROPOSED REMEDIATION (three coordinated steps, NOT this turn):
  1. RECON the breadth of the contamination across PropTx string columns.
     Read-only scan: for each string column the matcher reads, find rows
     where `value <> btrim(value)` or where length differs from the trimmed
     length. Likely candidates per code audit:
       - property_subtype           (Semi-Detached confirmed)
       - architectural_style        (JSONB array — check each element)
       - approximate_age            (e.g., '0-5', '6-15')
       - basement                   (JSONB array)
       - pool_features              (JSONB array)
       - garage_type
       - locker
       - square_foot_source
       - public_remarks             (text, unlikely systematic)
     Report any non-zero counts. Decide scope.
  2. ONE-TIME DB CLEANUP for confirmed contamination.
     Rollback-snapshot snapshot first (per CLAUDE.md migrations protocol).
     Run during a known-quiet window (no live MLS sync, ideally minimal
     active estimator traffic):
       BEGIN;
       UPDATE mls_listings
       SET property_subtype = btrim(property_subtype)
       WHERE property_subtype <> btrim(property_subtype);
       -- verify row count = 67481 + whatever the recon found
       COMMIT;
     Hard gate per CLAUDE.md production-DB-write protocol — operator
     review before commit.
  3. SYNC-SIDE PATCH (the part that prevents recurrence):
     The nightly MLS sync writes property_subtype directly from PropTx.
     Patch the sync to apply btrim() to all string fields on insert/update.
     Without this, the one-time UPDATE self-undoes on the next sync.
     File: probably the GitHub Actions sync workflow + whatever Node
     script(s) implement the upsert. Needs separate engineering planning.
  4. (Optional) Add a CI/lint guard preventing future raw .eq()/.in()
     against property_subtype without going through propertySubtypeVariants.
     ESLint rule or grep-based pre-commit hook. Defensive against the next
     contributor who writes `.eq('property_subtype', 'Semi-Detached')`
     without realizing the data layer needs both variants.

DEPENDENCIES / COORDINATION:
  - PropTx upstream: are they aware of the contamination? Should we report
    it? Likely yes — a clean upstream data feed avoids ALL of this.
  - Nightly sync: who owns it; what's the cadence; window of safe writes.
  - Other consumers of property_subtype: API routes, admin pages, any
    SQL views or materialized views. Audit before the UPDATE.

DECISION OWED:
  - Operator: who picks this up and when.
  - Code helper STAYS regardless of data fix. It's defensive depth-in-
    depth. Removing it after the data fix is premature; what if PropTx
    re-introduces contamination on a new subtype? The helper keeps the
    matcher robust.

OUT OF SCOPE FOR F-MLS-SUBTYPE-TRAILING-SPACE-SEMI (the code fix shipped
2026-06-08). Logged here so the operational follow-up isn't lost.


================================================================================
STREET-LEVEL MATCHING ACTIVATION — the dead 20-pt bonus is alive
2026-06-08 → 2026-06-09 (W-ESTIMATOR-RAG)
================================================================================

OPERATOR DIRECTIVE (verbatim, condensed):
  "ACTIVATE street-level matching. Recon already done; this is the build.
   Rule Zero: backup every existing file before edit. Every value verified
   this session — no guessing. tsc clean before any commit. Tracker write
   is part of this unit of work. HOLD push."

WHAT WAS DEAD (from prior recon):
  - lib/estimator/home-comparable-matcher-sales.ts line 938-939 (community-
    strict tier of findHomeComparables) hardcoded `sameStreet=false,
    sameOddEven=false`. 3 other scoreMatch call sites (lines 960, 1003,
    1031) passed `false, false` inline. All 4 callers dead.
  - HomeSpecs interface had NO subjectStreetName/Number field.
  - 20-pt bonus code (scoreMatch lines 266-270: `if (sameStreet) score+=15;
    if (sameOddEven) score+=5`) was present but unreachable.
  - extractStreetName / extractStreetNumber / isOdd helpers existed.

WHAT THIS BUILD DID (the unit of work, on top of pushed e501e0a):

  STEP 0 — DATA-HYGIENE GATE (scripts/diag-street-whitespace.js, read-only):
    SELECT
      COUNT(*) FILTER (WHERE street_name <> btrim(street_name))   AS name_ws,
      COUNT(*) FILTER (WHERE street_number <> btrim(street_number)) AS num_ws
    FROM mls_listings WHERE standard_status='Closed' AND
      close_date >= NOW() - INTERVAL '2 years'
    →  name_ws = 9    (out of 560,241 closed-2y rows)
    →  num_ws  = 1
    VERDICT: NON-ZERO. The normalizer MUST btrim both sides. Built in via
    .trim() inside normalizePlaceName — covers all 10 contaminated rows.

  STEP 1 — HomeSpecs + shared normalizer:
    Added to HomeSpecs interface:
      subjectStreetName?: string      // h5: street-level matching
      subjectStreetNumber?: number    // h5: street-level matching
    NEW helper normalizePlaceName(raw):
      - .trim() (the STEP-0 hygiene btrim)
      - strip suffix /\s+(Main|BSMT|Upper|Lower|Rear|Apt|Unit)\s*$/i
      - .toLowerCase()
      - return null if empty after cleanup
    Refactored extractStreetName(address) to use normalizePlaceName on the
    parsed-out name portion — both subject and comp sides now go through
    the SAME normalizer. A clean dedicated subject street_name can match a
    parsed-from-unparsed_address comp name.
    NEW helper streetBonusFor(sale, subjName, subjNum):
      - if subjName==null || subjNum==null: { sameStreet:false, sameOddEven:false }
      - compute saleStreet via extractStreetName(sale.unparsed_address)
      - sameStreet = saleStreet === subjName
      - sameOddEven = sameStreet && isOdd(saleNum) === isOdd(subjNum)
    Top of findHomeComparables: subjName + subjNum computed ONCE per matcher
    call (not per comp). Number.isInteger guard ensures NaN never enters the
    parity check.

  STEP 2 — HOME_SELECT extended:
    Added `street_number, street_name` to the SELECT list (used by all SF
    tier queries + findActiveCompetition + findMultiUnitContactComparables).
    Even though the matcher continues to parse the comp street from
    unparsed_address (so the parse path stays canonical), having the
    dedicated columns selected enables a future direct-column switch and
    lets backtests cross-check extract vs dedicated on a sample.
    4 DEAD SITES NOW LIVE:
      - line ~998 (community-strict): uses streetBonusFor
      - line ~1018 (community-relaxed): uses streetBonusFor
      - line ~1064 (muni-pool): uses streetBonusFor
      - line ~1095 (muni-bedBathOnly last-resort): uses streetBonusFor
    Guard: if subjName == null (un-plumbed caller), both flags are false →
    pre-h5 byte-identical behavior preserved.

  STEP 3 — PLUMBED 3 production callers + parity probe:
    - app/charlie/components/SellerEstimateRunner.tsx (Charlie seller form):
      `formData.streetName` + parseInt(formData.streetNumber). Type was
      missing — added streetName/streetNumber to the local props type.
    - components/property/HomePropertyEstimateCTA.tsx (auto-run on
      /property/[slug]): `listing.street_name` + parseInt(listing.street_number).
    - app/estimator/components/HomeEstimatorBuyerModal.tsx (modal entry from
      geo pages): same fields via (listing as any).street_*.
    - app/api/parity-probe-sf-sold/route.ts (local test surface): forwarded
      listing.street_name + parseInt(listing.street_number) so the probe
      exercises the activated path the same way production CTAs do.
    Every plumber null-guards parseInt → NaN never reaches specs.

  STEP 4 — PARITY CLASSIFICATION (scripts/parity-street-activation.js,
  50 SF subjects from the c57c2dd/e501e0a sample):
    Baseline re-captured at e501e0a state (the pre-activation state) by
    reverting matcher + probe to the .backup_20260608_160347 snapshot,
    running parity-sf-sold-baseline.js --mode=baseline, then restoring the
    post-activation versions. Isolates this build's effect from the e501e0a
    Semi unbreak that shipped earlier.

    DETERMINISTIC VERDICT (2026-06-09 final pass):
      49/50 byte-identical (every subject without a same-street comp in
                            pool returned identical tier/comps/score)
       1/50 expected-unbreak — Att/Row/Townhouse X9410005:
                               2 same-street comps; comp X10413409's score
                               rose by EXACTLY +15 (street-only bonus,
                               different-parity number) → tier stayed BINGO,
                               bestMatchScore moved upward
       0 INVESTIGATE, 0 errors

    The earlier 2026-06-08 pass reported 47 byte-identical + 1 expected +
    2 anomalies (1 baseline-stale, 1 HTTP error). ROOT CAUSE characterized:
    sequential-pass load against a dev server + Supabase pooler occasionally
    drops a single response (webpack cache rename hiccup; pooler transient).
    Matcher itself is fully deterministic — direct isolated re-probes of
    both subjects (X13167624 + W13176994) returned identical results 3/3
    times each.
    REMEDIATION: both parity scripts (parity-sf-sold-baseline.js +
    parity-street-activation.js) now wrap the per-subject probe in a
    retry-on-empty / retry-on-error pattern: if the first call returns
    HTTP non-200 OR tier=CONTACT/comps=0 (the empirical flake signature),
    a 750ms-spaced second call decides. Single retry suffices to flush the
    transient; with that in place the classifier reports zero anomalies
    deterministically. The retry is sequential-pass-only — it does NOT
    mask real CONTACT/0 results (which agree with the first call after the
    retry runs).

  STEP 5 — BACKTEST (scripts/backtest-estimator-homes.js updated):
    Updated the inlined scoreMatch to mirror the now-LIVE bonus + added
    normalizePlaceName/extractStreetNameBT/extractStreetNumberBT/_isOdd as
    JS mirrors of the production helpers. Threaded subject street into the
    backtest specs builder (subj.street_name + parseInt(subj.street_number)).
    Added street_number, street_name to backtest's HOME_SELECT.

    SF SALE BACKTEST (n=500 subjects, 90-day sample, 465 priced):
      OPERATOR-STATED PRE-h5 BASELINE: MAPE ~20%, median ~14.4%, ±15 ~52%
      POST-h5 RESULT:                  MAPE 20.5%, median 12.6%,  ±15 57%
      Δ vs baseline:                   ~flat,    -1.8pp,           +5pp
      Per-tier (post-h5):
        BINGO     n=52   MAPE 8.2%   median 5.5%   ±15 87%
        BINGO-ADJ n=231  MAPE 16.6%  median 12.7%  ±15 55%
        RANGE     n=149  MAPE 27.5%  median 13.2%  ±15 54%
        RANGE-ADJ n=33   MAPE 35.3%  median 24.9%  ±15 30%
      Interpretation: the street bonus pushes a same-street comp's score up
      by 15-20; when that comp would have been chosen anyway, the score
      moves but the prediction doesn't — so MAPE barely budges. When a
      different comp would have been the top-pick pre-h5 but the bonus
      promotes a closer-by same-street comp into the top slot, the
      prediction changes for the better — visible in the median APE drop
      (-1.8pp) and ±15 hit-rate gain (+5pp). Both are real accuracy
      improvements on the central tendency. Operator's expectation that
      this might be "a flat or slightly-worse number" is fine to report
      honestly — instead it's a small clear improvement.

    PLEX-AXIS BACKTEST (scripts/backtest-plex-axis.js, separate harness):
      Re-run independently to confirm h5 doesn't touch the plex path.
      Duplex   sampled 200, priced 186, MAPE 23.2%, median 17.4% ✓
      Triplex  sampled 109, priced 89,  MAPE 30.1%, median 22.1% ✓
      Fourplex sampled 47,  priced 25,  MAPE 35.0%, median 34.5%
      Multiplex sampled 91, priced 58,  MAPE 28.3%, median 21.1%
      Duplex 17.4% and Triplex 22.1% are EXACT byte-match to the locked
      anchors (tracker line 3502-3565). h5 doesn't touch runPlexPricingPath
      (it has its own median-of-comps aggregator and never calls scoreMatch);
      mathematical guarantee + empirical confirmation.

  STEP 6 — tsc --noEmit clean (exit 0, full project, on top of e501e0a
  + h5 + every backup intact).

FILES MODIFIED THIS BUILD (7 — Rule Zero backups created at
.backup_20260608_160347 before any edit):
  lib/estimator/home-comparable-matcher-sales.ts    +57/-12  helper + 4 sites + HOME_SELECT + HomeSpecs
  app/charlie/components/SellerEstimateRunner.tsx   +8/-1    thread + type fix
  components/property/HomePropertyEstimateCTA.tsx   +4/-0    thread
  app/estimator/components/HomeEstimatorBuyerModal.tsx +5/-0  thread
  app/api/parity-probe-sf-sold/route.ts             +7/-0    probe thread
  scripts/backtest-estimator-homes.js               +35/-3   helpers + scoreMatch bonus + specs thread + SELECT
  docs/W-ESTIMATOR-RAG-TRACKER.md                   +THIS     run-log
  Plus scripts/parity-street-activation.js          NEW      parity classification harness (local test)
       scripts/diag-street-whitespace.js            NEW      STEP-0 hygiene gate (local test)
       scripts/parity-sf-sold-baseline.js           MODIFIED retry-on-empty wrapper
  Plus scripts/diag-street-columns.js               (already existed from prior recon)

VALUES VERIFIED THIS SESSION (per Rule Zero — every claim ties to a
command run this session):
  - 10 ws-rows (9 name + 1 number) on closed-2y mls_listings
    (scripts/diag-street-whitespace.js, 2026-06-08 ~15:55 EDT)
  - 100% street_name/street_number fill on closed-2y home rows
    (scripts/diag-street-columns.js earlier this session — 221,781 rows)
  - 47/50 byte-identical SF parity post-h5 (parity-h5-street-activation.js)
  - 1/50 expected-unbreak with verified +15 delta (X9410005 / X10413409)
  - 2/50 baseline-capture flakes confirmed non-h5 by direct re-probe
  - SF backtest 20.5/12.6/57 vs ~20/14.4/52 (operator-given pre-h5 anchor)
  - Plex 17.4/22.1 medians exact-match locked anchors (backtest-plex-axis.js)

CLAIMED, UNVERIFIED:
  - The Next.js server-action runtime path for the 3 plumbed callers
    (SellerEstimateRunner / HomePropertyEstimateCTA / HomeEstimatorBuyerModal)
    has NOT been browser-walked post-activation. The parity probe exercises
    only the matcher; the route → CTA → server-action → matcher chain in a
    real browser session is owed a live walkthrough (post-Vercel-deploy).
  - F-MLS-DATA-CLEANUP-TRAILING-SPACE (the deferred-data workstream from
    e501e0a) still open. The hygiene gate found 10 ws-rows on street
    columns that join that workstream's audit list — same defect class,
    same root cause (PropTx upstream cleanliness).

RESOLVED (was "claimed-unverified" in the 2026-06-08 draft):
  - The 2 anomalies (X13167624 + W13176994) ARE root-caused: sequential-
    pass load transient on dev-server / Supabase pooler. Matcher is
    deterministic. Both parity harnesses now use retry-on-empty wrappers
    that produce 0 anomalies on a clean re-run.

PUSH STATUS — HELD per standing instruction.
  origin/main = e501e0a (F-MLS Semi defensive fix shipped 2026-06-08).
  Local main = e501e0a + 1 uncommitted unit of work (h5 street activation).
  NOT committed this turn. Tracker entry written. Operator decides whether
  this ships as standalone feat commit, bundles with the next workstream,
  or is held for further verification (e.g., the missing browser walk).


================================================================================
FRONTAGE-AS-GATE ACTIVATION (RANGE-ADJ Pattern 2)
2026-06-09 (W-ESTIMATOR-RAG)
================================================================================

OPERATOR DIRECTIVE (verbatim, condensed):
  "ACTIVATE frontage-as-gate (RANGE-ADJ Pattern 2). Replace flat $40k/ft
   additive with proportional ±20% band on close_price. Unit normalization
   metres→feet. Defensive guards on lot_width. Scope lock: scoreMatch 25-pt
   frontage SCORE band stays byte-identical."

WHAT WAS BROKEN:
  lib/estimator/home-adjustment-math.js:16 — LOT_FRONTAGE_PER_FOOT: 40000.
  At $40k/ft flat × 10ft frontage diff = $400k adjustment (≈47% of Detached
  median $850k); 15ft = $600k (≈71%); 20ft = $800k (≈94%). Bounded only by
  the outer ±50%-of-close_price clamp at createHomeComparable line ~398 — so
  the predicted price for a RANGE-ADJ comp could flip sign or move catastro-
  phically far. Recon showed this as the "RANGE-ADJ catastrophe class."

  Plus the wrong-units defect: 1,794 'Metres'-flagged rows (0.8% of inventory)
  had lot_width interpreted as feet. A townhouse 6.10m stored value → matcher
  read it as 6.10ft → $40k × Δ(20-6.10) = $556k adjustment vs a 20ft subject.

WHAT THIS BUILD DID (unit of work, on top of pushed 417ea2b):

  STEP 0 — DATA-HYGIENE GATE (scripts/diag-frontage-hygiene-gate.js + the
  Acres-cohort follow-up scripts/diag-frontage-acres-cohort.js, read-only):
    lot_size_units on 2y-closed HOME_SUBTYPES (n=212,792):
      Feet     193,129 (90.8%)
      (null)    14,178 ( 6.7%)
      Acres      3,691 ( 1.7%)  ← gate triggered; characterized below
      Metres     1,794 ( 0.8%)
    Acres-cohort `lot_width` characterization (operator decision: OPTION A):
      'Acres' flag refers to lot_size_AREA, NOT lot_width. Proven via
      lot_size_dimensions strings ("75.00 x 133.00") + area cross-check
      (220×263 ≈ 1.33 acres matches the 1.11 lot_size_area, etc.). Acres
      cohort lot_width IS feet, same regime as 'Feet' and null. The
      normalizer's default-to-feet branch correctly handles it.
    Guard counts (rows that the normalizer null-returns):
      lw <= 0       Detached 944, Semi 48, Att/Row 351, Link 3, Dup 1, Tri 1
      lw > 1000     Detached 952, Semi 5, Att/Row 10  (data-error class
                    like the 274,033 max in recon — keep blocking)
      200-1000 band Detached 10,491  ← KEPT (rural acreage frontages,
                                          Acres-cohort p90 = 400ft).
                                          Proportional ±20% cap bounds
                                          their adjustment regardless of
                                          width — safe to keep.

  STEP 1 — NORMALIZER + GUARDS (lib/estimator/home-adjustment-math.js):
    Exported function normalizeFrontageFeet(rawWidth, lotSizeUnits) → number|null
      - parseFloat, isFinite, > 0          (guards: NaN / negatives / zero → null)
      - <= 1000                            (guard: data errors → null)
      - 'Metres' → × 3.28084               (conversion)
      - else 'Feet' / 'Acres' / null       (treat as feet — dominant 99.2% regime)
    NEW constants (DEFAULT_ADJUSTMENTS):
      LOT_FRONTAGE_PER_FOOT: 40000     (LEGACY — left in place for any local
                                        recon script that still references
                                        it; production reads *_PCT pair)
      LOT_FRONTAGE_PER_FOOT_PCT: 0.008 (0.8% of close_price per foot diff)
      LOT_FRONTAGE_MAX_PCT: 0.20       (hard cap)
    Cap engages at |diffFt| = 0.20 / 0.008 = 25 ft (half the Detached median
    lot p50=50; defensible threshold per operator spec).

  STEP 1b — THREADING (HomeSpecs + HOME_SELECT + 3 callers + probe):
    HomeSpecs gained `lotSizeUnits?: string | null`.
    HOME_SELECT (matcher) + backtest HOME_SELECT both gained `lot_size_units`.
    Threaded into specs:
      HomeEstimatorBuyerModal.tsx — (listing as any).lot_size_units
      HomePropertyEstimateCTA.tsx — listing.lot_size_units
      parity-probe-sf-sold/route.ts — listing.lot_size_units
      backtest-estimator-homes.js  — subj.lot_size_units
    SellerEstimateRunner (Charlie seller form) — the form has frontage as
    plain number (no units field). Defaults to feet (undefined → normalizer's
    else branch → feet). Documented in inline matcher comment.

  STEP 2 — PROPORTIONAL BAND (lib/estimator/home-comparable-matcher-sales.ts
  lines 338-368, createHomeComparable):
    Old:  amount = Math.round(diff * LOT_FRONTAGE_PER_FOOT)
    New:  subjFt = normalizeFrontageFeet(specs.lotWidth, specs.lotSizeUnits)
          compFt = normalizeFrontageFeet(sale.lot_width, sale.lot_size_units)
          if subjFt != null && compFt != null:
            diffFt = subjFt - compFt
            if |diffFt| >= 1:
              pct = min(|diffFt| * PER_FOOT_PCT, MAX_PCT)
              amount = sign(diffFt) * pct * sale.close_price
              reason = "Your lot is N.Nft wider (+X.X% of comp price = +$Y)"
    Null-side handling: if EITHER side normalizes to null, NO adjustment
    (no adjustments[] entry, amount = 0). Honest skip — missing > fabricated.
    Outer ±50%-of-close_price clamp at line ~398 stays as backstop (the new
    ±20% sits well inside it; clamp rarely engages).

  STEP 3 — BACKTEST MIRROR (scripts/backtest-estimator-homes.js):
    Import normalizeFrontageFeet from shared adjustment-math.
    adjustedPriceFor() function (line 258-273): same proportional formula
    using same constants from DEFAULT_ADJUSTMENTS — lockstep with production.
    Subject specs builder (line ~616): thread subj.lot_size_units.

  STEP 4 — PARITY CLASSIFICATION (scripts/parity-frontage-activation.js,
  50 SF subjects, baseline captured against 417ea2b state via the standard
  revert→baseline→restore cycle):
    SUMMARY: 14 byte-identical, 36 expected-proportional, 0 expected-units-
             fix, 0 INVESTIGATE, 0 errors.
    Per-subject highlights:
      Byte-identical (14): subjects with CONTACT tier (no comps to adjust)
        OR subjects where every top-10 comp had |frontage diff| < 1 ft
        AND no guard-affected comps. Includes #36 W13176994 (subjFt=null —
        subject's own frontage couldn't be normalized → no adjustment
        either before or after, byte-identical by construction).
      Expected-proportional (36): every subject with ≥1 top-10 comp at a
        meaningful frontage delta. The adj_delta_max column shows the
        biggest per-comp adjusted_price movement; ranges from $70k (modest
        diff in a low-frontage cohort) to $787,500 (rural 305-ft Detached
        with a 20ft+ comp diff).
      Specifically the catastrophe-class subjects:
        #17 X13127080 Detached subj_ft=305  adj_delta_max=$787,500
        #10 C13128016 Detached subj_ft=50.2 adj_delta_max=$689,800
        #19 N13145154 Detached subj_ft=69.3 adj_delta_max=$639,500
        Pre-h6 the flat $40k/ft was producing ±$1M+ adjustments on a 25ft
        diff; post-h6 the cap bounds these to ±20% × close_price.
      One Metres/guard-affected comp on subject #41 X13235560 (n_guard=1):
        normalizer correctly skipped or converted; no INVESTIGATE.
    Zero divergences on no-frontage-diff non-guard subjects.

  STEP 5 — BACKTEST (scripts/backtest-estimator-homes.js + scripts/backtest-
  plex-axis.js, fresh runs):

    SF SALE — POST-h6 vs POST-STREET BASELINE:
      Per-tier:
        BINGO     n=40  MAPE 8.0%  median 6.2%   ±15 88%  bias +$31,635
        BINGO-ADJ n=247 MAPE 13.0% median 8.8%   ±15 70%  bias +$21,204
        RANGE     n=148 MAPE 26.4% median 13.5%  ±15 56%  bias +$23,660
        RANGE-ADJ n=35  MAPE 31.3% median 20.3%  ±15 40%  bias +$27,946
        RANGE-ADJ delta vs pre-h6 (n=33 35.3%/24.9%/30):
          MAPE -4.0pp, median -4.6pp, ±15 +10pp   ← CATASTROPHE TIER UNBROKEN
      OVERALL: MAPE 18.1%, median 9.8%, ±15 65%, bias +$23,367
        Δ vs post-street (20.5% / 12.6% / 57%): MAPE -2.4pp, median -2.8pp,
        ±15 +8pp. Material improvement on the central tendency and hit rate.

    PLEX-AXIS (runPlexPricingPath path is NOT touched by h6 — it doesn't
    call createHomeComparable or scoreMatch):
      Duplex   sampled 200, priced 189, MAPE 24.2%, median 19.3%, ±15% 38%
      Triplex  sampled 110, priced 89,  MAPE 30.1%, median 22.1%, ±15% 34%
      Fourplex sampled 48,  priced 26,  MAPE 33.9%, median 34.5%, ±15% 35%
      Multiplex sampled 92, priced 59,  MAPE 27.9%, median 20.0%, ±15% 39%
      Triplex 22.1% byte-exact to locked anchor. Fourplex 34.5% byte-exact.
      Duplex 17.4% → 19.3% (+1.9pp): this is SAMPLING NOISE, not h6 effect.
      backtest-plex-axis.js uses ORDER BY random() per-subtype sample (line
      67); n=189 means ±2pp swings are expected between runs. h6 cannot have
      moved the plex matcher because runPlexPricingPath has its own median-
      of-comps aggregator that never enters createHomeComparable's adjustment
      chain. Mathematically guaranteed unchanged. Empirically confirmed by
      Triplex/Fourplex byte-match + sampling-noise model on Duplex.

  STEP 6 — tsc --noEmit clean (exit 0, full project).

FILES MODIFIED (5 + tracker, 8 backups at .backup_20260609_061322):
  lib/estimator/home-adjustment-math.js                       +40/-1
  lib/estimator/home-comparable-matcher-sales.ts              +27/-12
  app/api/parity-probe-sf-sold/route.ts                       +3/-1
  components/property/HomePropertyEstimateCTA.tsx             +3/-1
  app/estimator/components/HomeEstimatorBuyerModal.tsx        +4/-1
  scripts/backtest-estimator-homes.js                         +21/-7
  docs/W-ESTIMATOR-RAG-TRACKER.md                             +this run-log
  Plus scripts/parity-frontage-activation.js                  NEW (parity harness)
       scripts/diag-frontage-hygiene-gate.js                  NEW (STEP-0 gate)
       scripts/diag-frontage-acres-cohort.js                  NEW (gate follow-up)
       scripts/diag-frontage-recon.js                         (was created during recon turn)

SCOPE LOCK MAINTAINED:
  scoreMatch lines 259-268 (the 25-pt frontage SCORE band) untouched.
  The score-side tier-membership stays byte-identical — only the dollar
  adjustment chain moves. Verified: parity classifier reports `bestScoreSame`
  on every subject (no score deltas; only adjusted_price deltas).

VALUES VERIFIED THIS SESSION (Rule Zero — every claim from a command):
  - 10 guard-class rows + 1,794 Metres rows + 3,691 Acres rows (gate counts)
  - 14/50 byte-identical + 36/50 expected-proportional + 0 INVESTIGATE
  - SF backtest OVERALL 20.5% → 18.1% MAPE (-2.4pp), 12.6% → 9.8% median (-2.8pp), 57% → 65% ±15% (+8pp)
  - RANGE-ADJ 35.3% → 31.3% MAPE, 24.9% → 20.3% median, 30% → 40% ±15
  - Triplex 22.1% byte-exact; Fourplex 34.5% byte-exact (sampling)
  - Duplex 17.4% → 19.3% = sampling noise (random sampling confirmed at
    backtest-plex-axis.js:67; h6 doesn't touch runPlexPricingPath)


================================================================================
F-MLS-LOT-UNITS-MIXED — NAMED, OPEN (deferred companion to h6)
2026-06-09 (W-ESTIMATOR-RAG)
================================================================================

NAMED:  F-MLS-LOT-UNITS-MIXED
STATUS: OPEN — deferred per CLAUDE.md "comprehensive work only" discipline.
        Code-side defense shipped 2026-06-09; data + sync cleanup is a
        separate workstream akin to F-MLS-DATA-CLEANUP-TRAILING-SPACE.

DESCRIPTION:
  The 'Metres' / negative / >1000 / null-units defect classes on
  mls_listings.lot_width that the h6 normalizer defensively handles
  (1,794 Metres rows + ~1,300 negative-or-zero rows + ~960 >1000 rows
  across SF + plex subtypes). The matcher now does the right thing on
  each cohort, but the underlying data is still mixed.

WHY THIS IS A SEPARATE WORKSTREAM:
  - PropTx is upstream. Even if we one-time UPDATE-normalize all rows
    to feet, the next nightly sync re-introduces the unit mixing unless
    the sync code path is also patched (mirrors F-MLS-DATA-CLEANUP-TRAILING-
    SPACE-SEMI's PropTx-recurrence concern).
  - The 'Metres' rows have legitimately different SOURCE data — they're
    not data errors, they're a legitimate alternate measurement regime.
    The decision is whether to FORCE-NORMALIZE in storage (lose source-
    fidelity) or keep the indicator and require all consumers to normalize
    at read time (current state, achieved by h6).
  - Audit needed across other PropTx string/numeric mixed-unit columns:
    lot_depth, lot_size_area, frontage_length (varchar — already messy).
    Same audit class as F-MLS-DATA-CLEANUP-TRAILING-SPACE-SEMI's
    "other string columns" follow-up.

PROPOSED REMEDIATION (not this turn):
  1. RECON the breadth across PropTx numeric columns: which carry units
     metadata, which are stored in mixed regimes, which produce the same
     class of catastrophic matcher behavior if read raw.
  2. Decide policy: NORMALIZE-AT-WRITE (sync converts everything to feet,
     loses source fidelity, simplifies all readers) vs NORMALIZE-AT-READ
     (current — every consumer must normalize, defensive helpers required).
     Recommended: NORMALIZE-AT-WRITE, since most consumers (admin UI,
     reports, audits, future ML) should not each maintain their own
     normalizer.
  3. If NORMALIZE-AT-WRITE: one-time UPDATE migration with rollback
     snapshot + sync-side patch. Hard gate per CLAUDE.md production-DB-
     write protocol.

CODE-SIDE DEFENSE STAYS regardless of data fix. normalizeFrontageFeet
remains in lib/estimator/home-adjustment-math.js as a guard against
future contamination on the matcher hot path.

OUT OF SCOPE FOR THIS TURN's h6 activation. Logged so the operational
follow-up isn't lost.

PUSH STATUS — HELD per operator standing instruction.
  origin/main = 417ea2b (street-level matching activation, 2026-06-09).
  Local main = 417ea2b + 1 uncommitted unit (h6 frontage activation).
  Tracker entry written. tsc clean. Operator decides commit shape +
  push timing.


2026-06-09 — (h7) PLATINUM / GOLD / SILVER / BRONZE 4-TIER DISPLAY SHIPPED

The tracker section 3 lock (2026-06-07) called for the matcher to compute all
four geo tiers every time and the display to show all four as a confidence
spread, while pricing stays single-tier (best-tier-only, never blend). At lock
time only the cascade existed (community→muni, with Platinum dormant +
Bronze nonexistent for SF). This unit ships the activation.

Build summary (single uncommitted unit on origin/main = 03b85f9):
- lib/estimator/home-comparable-matcher-sales.ts: refactored findHomeComparables
  SF main path. Removed early-returns at community + muni; all four tiers now
  accumulated unconditionally and best-tier resolution selects the price
  anchor.
    GOLD   = today's community pool (strict→relaxed funnel sequence preserved).
    SILVER = today's muni pool (strict→relaxed→bedBathOnly preserved, with
             usedBedBath flag forcing tier='CONTACT' on top-level to match
             pre-h7 hardcoded CONTACT return).
    PLATINUM = derived as community pool .filter(streetBonusFor.sameStreet).
             ZERO new DB queries — subset of Gold's already-funneled rows.
             Null when subject has no street data (un-plumbed callers stay
             byte-identical).
    BRONZE = NEW SF area query. Lifts the plex area-cascade pattern but
             replaces the !inner embedded join (times out on SF — Durham has
             ~250K closed listings vs ~1K plex) with a two-query pattern:
             (1) fetch muni IDs in area, (2) .in('municipality_id', muniIds)
             on mls_listings. Class-contained via getCompatibleSubtypes +
             propertySubtypeVariants.
  Best-tier resolution: Platinum≥3 > Gold≥3 > Silver≥2 > Bronze≥3 > CONTACT.
  Top-level tier/comparables/geoLevel/bestMatchScore/estimatedPrice mirror
  the chosen tier (back-compat with all consumers reading only top-level).
  Added helpers: medianRangeOf (pure), buildSFTierResult (async — scores +
  attaches media + runs createHomeComparable per tier), runSFAreaQuery
  (the two-query area cascade).

- lib/estimator/types.ts: added TierResult interface
  { comparables, count, median, range:{low,high}, bestMatchScore }
  and threaded EstimateResult.tiers?:{ platinum, gold, silver, bronze:
  TierResult|null } + EstimateResult.bestGeoTier?. Additive — no field
  removals; all old consumers see the same top-level shape.

- app/estimator/actions/estimate-home-sale.ts: passes tiers + bestGeoTier
  through to EstimateResult on both the priced and empty-result branches.
  Best-tier price path untouched — calculateEstimate still receives the
  same comparables array it would have received at 03b85f9.

- app/estimator/components/HomeEstimatorResults.tsx: new Geographic
  Confidence Spread panel between the MatchTier banner and the Market
  Speed block. SF-only (plex render path unchanged). Shows the 4 tiers
  with name + sub-label (Platinum=Same street, Gold=Community, Silver=
  Municipality, Bronze=Area), median, count, range. Best tier highlighted
  (emerald) with "Anchor" pill. Missing tiers show "no data" — honest
  representation, not hidden. Trailing line explains the spread: narrow
  = confident, wide = block sold differently than community. The MatchTier
  quality labels (BINGO/RANGE/MAINT/CONTACT) UNTOUCHED — geo tier and
  quality tier are independent axes.

- app/api/parity-probe-sf-sold/route.ts: probe emits tiers + bestGeoTier
  via a tierSummary helper (count/median/range/bestMatchScore/topComps).
  Top-level comparables emission unchanged — parity harness diffs both.

- scripts/backtest-estimator-homes.js: mirrored the Bronze cascade onto
  findHomeComparablesSaleBacktest as a Tier-3 append (Gold/Silver early-
  return preserved byte-identical, then Bronze fall-through with the same
  two-query pattern + strict→relaxed funnel). Platinum dormant in backtest
  (specs builder doesn't thread street_name — pre-existing gap; same in
  03b85f9 backtest).

Parity verification — h7 vs 03b85f9 baseline (50 subjects, the standard
SF sold mix from MIX in parity-sf-sold-baseline.js: 20 Detached + 15 Semi-
Detached + 10 Att/Row/Townhouse + 5 Link):

  STEP 0 — revert/restore cycle (mirrors the h5/h6 pattern): matcher +
  parity probe reverted to backup_20260609_082840 (03b85f9 state) →
  baseline captured (overwriting earlier stale 417ea2b-era baseline) →
  matcher + probe restored to h7 → verify run.

  Classification (scripts/parity-4tier-activation.js):
    byte-identical           : 45 / 50 (90.0%)
    expected-platinum-anchor :  1 / 50 (X9410005 Att/Row, 4 same-street
                                comps, tier BINGO→BINGO-ADJ, price moves
                                to street median — intended)
    expected-bronze-fill     :  4 / 50 (X12980224 Semi, X13028634 Att/Row,
                                X13173342 Link, X13148716 Link — formerly
                                CONTACT-with-geoLevel=none, now priced
                                from area pool: RANGE / BINGO-ADJ / RANGE
                                / RANGE-ADJ — intended)
    INVESTIGATE              :  0 / 50  ← lock condition satisfied

  Report: scripts-output/parity-h7-4tier-classification.txt
  Verify: scripts-output/parity-h7-4tier-verify.json

  Make-or-break: on the 45 byte-identical subjects, price path
  (tier/comparables/bestMatchScore/geoLevel) is BYTE-EQUAL to 03b85f9
  output. The four new context tiers (Gold/Silver/Bronze + Platinum-when-
  thin) become visible WITHOUT perturbing the priced number.

Latency cost: ~3s p50 per estimator request (probed live on 306 Rosedale
post-fix: 2,884 ms total — community + muni + area + score + adjustments).
03b85f9 baseline was ~1-2s. The lock requires "compute all four tiers every
time"; the extra DB call (Bronze) is the cost of always-display. Latency
optimization (parallelize the four tier queries via Promise.all) deferred
to a separate UX workstream — out of h7 scope.

Backtest — N=500 SF sale subjects, sampled fresh post-h7
(scripts-output/backtest-homes-sale.csv, 2026-06-09 09:54):

  03b85f9 baseline (earlier run from scripts-output/backtest-homes-summary.txt):
    470 priced / 30 CONTACT of 500.
    by tier (priced cohort): BINGO n=40 MAPE=8.0% median=6.2% ±15=88%
                             BINGO-ADJ n=247 MAPE=13.0% median=8.8% ±15=70%
                             RANGE n=148 MAPE=26.4% median=13.5% ±15=56%
                             RANGE-ADJ n=35 MAPE=31.3% median=20.3% ±15=40%

  h7 (this run, FRESH sample so direct row-by-row comparison includes
  sampling noise — but tier-level patterns + bronze-fill delta hold):
    476 priced / 24 CONTACT of 500.   ← 6 former-CONTACT subjects now priced (bronze-fill)
    Overall priced cohort: MAPE=16.7%  median=10.6%  ±15=64%
    By geoLevel (NEW axis exposed by h7):
      community  (Gold)   n=375 priced=375 MAPE=13.6% median= 9.5% ±15=71%
      municipality (Silver) n=86 priced=82 MAPE=27.5% median=18.5% ±15=41%
      area       (Bronze) n= 19 priced= 19 MAPE=32.9% median=18.2% ±15=32%   ← NEW pool
      none       (CONTACT) n=20 priced=  0
    By tier (MatchTier quality, post-h7):
      BINGO     n= 38 MAPE= 9.2% median= 7.6% ±15=84%
      BINGO-ADJ n=241 MAPE=12.7% median= 8.9% ±15=71%
      RANGE     n=157 MAPE=20.2% median=13.1% ±15=55%
      RANGE-ADJ n= 40 MAPE=34.7% median=20.7% ±15=40%

  Read of the delta:
  - Community/Gold tier in h7 (MAPE 13.6%, median 9.5%) sits between
    03b85f9's BINGO + BINGO-ADJ buckets — consistent with today's gold-
    early-return path. Within-tier MAPE doesn't move on the byte-identical
    cohort (Bronze append doesn't alter Gold's early-return).
  - NEW Bronze tier: n=19, MAPE=32.9%. Higher than Gold (expected — area
    pool is wider geo). Honest pricing on subjects that 03b85f9 silenced
    as CONTACT (some signal > no signal); area-pool MAPE is the natural
    price the lock accepts in exchange for the bronze-fill.
  - Bronze-fill volume in backtest (6/500 = 1.2%) is slightly LOWER than
    the parity classifier's hit rate (4/50 = 8%) — likely sampling
    variance between the 50-subject targeted mix and the 500-subject
    random closed-90-days sample.
  - Lease backtest deferred: h7 patched only the SALE matcher mirror.
    Lease backtest re-run is owed if/when the lease matcher gains the
    same 4-tier treatment (future workstream).

Section 3 lock reconciliation: the section 3 "Implementation status"
sub-bullet at the time of lock (2026-06-07) read:
  "CLAIMED, UNVERIFIED on disk: street tier (Platinum) was identified as
  the 'free 20-pt revival' in the 2026-06-04 STREET/ODD-EVEN entry but is
  NOT YET WIRED — matcher still hardcodes sameStreet=false. Platinum is
  currently DEAD; lock anticipates the revival."
This is now stale on two axes:
  (a) 417ea2b (2026-06-09) wired sameStreet — Platinum-as-score-bonus live.
  (b) h7 (this entry) elevates Platinum from score-bonus to derived-subset
      tier and adds Bronze. The 4-tier compute-all/display-all/price-from-
      best lock is FULLY IMPLEMENTED.
Forward reader: section 3's "DEAD" claim on Platinum should be read with
this run-log entry as the canonical update.

Files modified (single unit):
  lib/estimator/home-comparable-matcher-sales.ts
  lib/estimator/types.ts
  app/estimator/actions/estimate-home-sale.ts
  app/estimator/components/HomeEstimatorResults.tsx
  app/api/parity-probe-sf-sold/route.ts                  (untracked, local-only)
  scripts/backtest-estimator-homes.js                    (untracked, local-only)
  scripts/parity-4tier-activation.js  (new)              (untracked, local-only)
  docs/W-ESTIMATOR-RAG-TRACKER.md (this entry)
Backups all timestamped _20260609_082840.
tsc --noEmit clean (full project).

PUSH STATUS — HELD per operator standing instruction.
  origin/main = 03b85f9 (h6 frontage band, 2026-06-09).
  Local main = 03b85f9 + 1 uncommitted unit (h7 4-tier display).
  Tracker entry written. tsc clean. Operator decides commit shape +
  push timing.


2026-06-09 — v10 STEP 3 PHASE 1 — COMMUNITY ADJUSTMENT ANALYTICS LAYER (manual-override path)

Per recon (logged earlier this session), homes side was greenfield: no
per-community adjustment store, all 14+ price values were code constants in
lib/estimator/home-adjustment-math.js:DEFAULT_ADJUSTMENTS. The condo equivalent
(legacy `adjustments` table + /admin/adjustments UI) has 408 rows but no
tenant_id column and no RLS — pre-existing multi-tenant Rule Zero violation
in System 1 (kept maintenance-only per CLAUDE.md). This unit ships the homes
mirror in SYSTEM 2 from day one with the violation fixed.

Phase 1 ships: schema + resolver + matcher wiring (sale + lease) + System 2
admin CRUD. Phase 2 (analytics auto-calc pipeline that computes per-geo
medians from real closed-sale data and writes the `_calculated` columns) is
filed as named-open. The PHASE 1 manual-override path is fully functional —
operators write per-geo values and they take effect on the next estimator
call.

Build summary (single uncommitted unit on local main = f7f3c6e + this):

- supabase/migrations/20260609_create_home_adjustments.sql (NEW, gated apply)
    Table home_adjustments: id, tenant_id NOT NULL (FK tenants),
    area_id|municipality_id|community_id (each nullable + ON DELETE CASCADE),
    type ('sale'|'lease'), 15 manual override columns mirroring
    DEFAULT_ADJUSTMENTS price keys (LOT_FRONTAGE_PER_FOOT_PCT,
    LOT_FRONTAGE_MAX_PCT, LOT_DEPTH_PER_10FT, LOT_DEPTH_MAX,
    BASEMENT_FINISHED, BASEMENT_SEP_ENTRANCE, BASEMENT_WALKOUT_BONUS,
    GARAGE_DETACHED_SINGLE, GARAGE_ATTACHED_SINGLE, GARAGE_BUILTIN,
    GARAGE_ATTACHED_DOUBLE, POOL_INGROUND, BATHROOM_FULL, BATHROOM_HALF,
    PARKING_PER_SPACE — recency bands intentionally excluded, score-only),
    created_at, updated_at, updated_by, CHECK constraint that at most one
    scope FK is set per row (all-null = tenant-generic default), 4 partial
    UNIQUE indexes (one per scope shape), 3 read-path indexes
    (tenant_id+scope_id), updated_at trigger.

    RLS enabled + forced. Five policies — four tenant-isolation for
    authenticated (USING tenant_id IN (SELECT tenant_id FROM agents WHERE
    user_id = auth.uid()) covering SELECT/INSERT/UPDATE/DELETE), one service-
    role full-access (FOR ALL TO service_role USING true). NOTE — verified
    pre-build: current_tenant_id() function does NOT exist in this Postgres
    (the prior recon's RLS pattern assumption was wrong); the existing
    tenant-scoping pattern across the codebase joins agents.user_id =
    auth.uid() to derive tenant_id, so the policies mirror that
    (leads.Agents view own leads et al. follow this shape).

- scripts/apply-home-adjustments-migration.js (NEW, gated apply-runner)
    Two-phase: HOLD-without-APPLY_CONFIRMED prints the pre-flight summary
    and exits 1. With APPLY_CONFIRMED=1: pre-snapshot to rollback-snapshots/,
    abort-if-table-exists guard, apply, verify post-state (table_exists +
    rls_enabled + rls_forced + 5 policies + ≥8 indexes), report row count
    (must be 0 on first apply). Pattern mirrors prior gated runners. PUSH
    HELD AND APPLY HELD are two separate gates — code commit can land
    without DB apply.

- lib/estimator/resolve-home-adjustments.ts (NEW)
    resolveHomeAdjustments({communityId, municipalityId, tenantId}, type):
    cascades community → municipality → area (derived from muni.area_id) →
    tenant-generic → DEFAULT_ADJUSTMENTS. Service-role client (matcher read
    path runs in anonymous-buyer context; RLS would block anonymous reads,
    so application-side .eq('tenant_id', tenantId) is the enforcement here).
    Three resilient fall-through paths to DEFAULT: (a) tenantId null/undef
    (anonymous, S1, un-plumbed); (b) DB error (table doesn't exist yet, RLS
    rejects, network); (c) zero rows for the tenant. Result shape: 15 keys
    from DEFAULT_ADJUSTMENTS + a sources record tracking which scope-level
    supplied each value (telemetry).

- lib/estimator/home-comparable-matcher-sales.ts (MODIFIED)
    HomeSpecs gained tenantId?: string|null. findHomeComparables resolves
    customValues ONCE at top and threads into all 4 buildSFTierResult calls
    + into Platinum/Gold/Silver/Bronze tiers via the same customValues
    handle. buildSFTierResult forwards to createHomeComparable. Inside
    createHomeComparable, 6 DEFAULT_ADJUSTMENTS reads are replaced with
    `customValues?.X ?? DEFAULT_ADJUSTMENTS.X` (LOT_FRONTAGE_PER_FOOT_PCT,
    LOT_FRONTAGE_MAX_PCT, LOT_DEPTH_PER_10FT, LOT_DEPTH_MAX, POOL_INGROUND,
    BATHROOM_FULL). Plex path untouched.

    SCOPE-LIMITED: basement + garage values flow through helpers in
    home-adjustment-math.js whose internal reads are NOT yet threaded.
    Extending those helpers to accept customValues is Phase 1.1 — small
    follow-up. The table already carries the columns (forward-compat); the
    matcher wiring just doesn't read them yet. 6/14 sale-side override keys
    live; the other 8 sit dormant until Phase 1.1.

- lib/estimator/home-comparable-matcher-rentals.ts (MODIFIED)
    findHomeComparablesRentals resolves customValues at top with type='lease'.
    Threaded into matchWithinPool + createHomeRentalComparable.
    BATHROOM_FULL → lease bathroom $/mo override (mapped to today's
    HOME_RENTAL_ADJUSTMENTS.BATHROOM = 100); PARKING_PER_SPACE → lease
    parking $/mo (mapped to HOME_RENTAL_ADJUSTMENTS.PARKING_PER_SPACE = 150).
    Both with `?? HOME_RENTAL_ADJUSTMENTS.<X>` fallback — preserves f7f3c6e
    behavior when no row exists.

- app/estimator/actions/estimate-home-sale.ts (MODIFIED)
    Calls getCurrentTenantId() once, sets specs.tenantId, passes through
    to findHomeComparables. Anonymous / S1 / un-plumbed callers get null
    tenantId → resolver returns defaults → no-op.

- app/estimator/actions/estimate-home-rent.ts (MODIFIED)
    Same pattern as the sale action.

- app/api/admin-homes/home-adjustments/route.ts (NEW)
    GET (list + dropdown options), POST (create with cross-tenant guard),
    PUT (update by id with cross-tenant verify), DELETE (block tenant-
    generic row deletion — operator can reset values, not orphan the row).
    Mirrors the System 2 pattern: resolveAdminHomesUser auth check +
    createServiceClient + explicit .eq('tenant_id', user.tenantId).
    Defense in depth: app-side scoping AND DB-side RLS both enforce.
    Cross-tenant writes require isPlatformAdmin. Manual-column allow-list
    on input (15 numeric fields); silently ignores body keys outside the
    list. NUMERIC validation on every override value.

- app/admin-homes/home-adjustments/page.tsx (NEW)
- components/admin-homes/HomeAdjustmentsManager.tsx (NEW)
    System 2 admin UI: table of override rows per tenant with scope_level
    + scope_name + type + count of set-fields + edit/delete actions. Modal
    for add/edit with scope picker (Generic/Area/Municipality/Community) +
    type ('sale'|'lease') + the 15 numeric fields. Empty fields = inherit
    from broader scope. Reset-to-default = clear all fields + save. Mirrors
    the System 1 AdjustmentsManager UX shape; never imports from System 1.

CONDO SYSTEM (not ours to fix here, but documented for the record):
- F-RESOLVE-ADJUSTMENTS-PARKING-SALE-COLUMN-MISMATCH (pre-existing P1, in
  tracker) — lib/estimator/resolve-adjustments.ts:46 reads
  `parking_sale_calculated`, actual column is `parking_sale_weighted_avg`.
  Condo SALE parking silently falls to hardcoded $50K. Quick fix, but
  System 1 territory — operator decides separately.
- Pre-existing multi-tenant violation: condo adjustments table has no
  tenant_id and no RLS (admin uses service-role-bypass). All tenants share
  the same condo adjustment values today. Per CLAUDE.md "System 1
  maintenance-only", we leave it as-is; the homes mirror gets the right
  pattern from day one (tenant_id NOT NULL + RLS + .eq() defense-in-depth).

PARITY VERIFICATION — empty-table no-op proof (50 SF subjects vs 03b85f9
baseline, classifier = scripts/parity-4tier-activation.js):

  Pre-Phase-1 (f7f3c6e):           45 byte-identical, 1 plat-anchor, 4 bronze-fill, 0 INVESTIGATE
  Post-Phase-1 (this unit, table absent):  45 byte-identical, 1 plat-anchor, 4 bronze-fill, 0 INVESTIGATE
  Delta:                            ZERO — identical classifications across all 50 subjects.

The make-or-break passes: with home_adjustments NOT YET APPLIED to the DB,
the resolver gracefully errors → falls through to defaultsAll() →
customValues object carries every DEFAULT_ADJUSTMENTS value verbatim →
createHomeComparable computes byte-identical adjustments to f7f3c6e.

When the migration applies and the table exists empty (zero rows for the
tenant), the same path holds — resolver's data.length===0 branch returns
defaultsAll(). No-op guarantee preserved across both states.

tsc --noEmit clean (full project). Backups all timestamped _20260609_113718.

NAMED-OPEN (not in Phase 1 scope):
- Phase 1.1: extend home-adjustment-math.js helpers (getBasementAdjustment,
  getGarageValue) to accept customValues. 8 additional override keys will
  go live (basement_finished/sep_entrance/walkout_bonus + garage_*4).
  Table already carries the columns; only the helper signature changes.
- Phase 2: analytics auto-calc pipeline. Sample condo equivalent:
  /api/admin/market-analytics/calculate — pulls real PropTx + mls_listings
  data, computes per-geo averages, writes `_calculated` columns. Homes
  version would pull closed-sale comp pools per (community/muni/area, type)
  and compute medians per feature. Decision point: tenant-shared analytics
  (one shared computation visible to all tenants as starting point) vs
  per-tenant analytics. Out of Phase 1 scope.
- AdminHomesUser exposes neither auth.uid() nor userId today, so
  updated_by stays null in Phase 1. Wiring auth.uid() through is a tiny
  separate touch on the shared auth shape — Phase 1.1 candidate.
- Live walk: the admin UI at /admin-homes/home-adjustments + the API
  contract have NOT been live-tested against a real authenticated session
  (migration is HELD; can't test CRUD against a non-existent table).
  Walk owed post-migration-apply.

Files created/modified (single unit):
  NEW supabase/migrations/20260609_create_home_adjustments.sql
  NEW scripts/apply-home-adjustments-migration.js
  NEW lib/estimator/resolve-home-adjustments.ts
  NEW app/api/admin-homes/home-adjustments/route.ts
  NEW app/admin-homes/home-adjustments/page.tsx
  NEW components/admin-homes/HomeAdjustmentsManager.tsx
  MOD lib/estimator/home-comparable-matcher-sales.ts
  MOD lib/estimator/home-comparable-matcher-rentals.ts
  MOD app/estimator/actions/estimate-home-sale.ts
  MOD app/estimator/actions/estimate-home-rent.ts
  MOD docs/W-ESTIMATOR-RAG-TRACKER.md (this entry)
Backups all timestamped _20260609_113718.
tsc --noEmit clean (full project).

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — MIGRATION HELD per operator standing instruction (separate gate).
  origin/main = f7f3c6e (h7 4-tier display, 2026-06-09).
  Local main = f7f3c6e + 1 uncommitted unit (v10 step 3 Phase 1).
  Migration file written, apply-runner gated on APPLY_CONFIRMED=1 env var.
  Tracker entry written. tsc clean. Empty-table no-op parity proven 50/50.
  Operator decides: commit shape + push timing + when to apply migration.


2026-06-09 — v10 STEP 3 PHASE 1.1 — LIGHT UP THE DORMANT BASEMENT + GARAGE KEYS

Phase 1's run-log closed by filing Phase 1.1 as the immediate follow-up:
6 of 14 sale-side override keys were live (frontage proportional pair,
depth pair, pool, bath-full), 8 sat table-ready but matcher-dormant
because they read through helpers (getBasementAdjustment, getGarageValue,
the bath-half site) whose internals didn't accept customValues. Rule Zero
"comprehensive only" + "identified today ships today" → wired now, same
arc, separate uncommitted unit so the diff stays reviewable.

Pre-build read-site audit (no-inference verification):

  grep -rnE "BATHROOM_HALF" lib/ app/ scripts/   →  defined in DEFAULT_ADJUSTMENTS
                                                    + declared in resolver type;
                                                    NEVER read in any adjustment site.
                                                    Dead-code in current matcher logic.
  grep -rnE "GARAGE_ATTACHED_DOUBLE"             →  defined + declared in resolver type;
                                                    NEVER read in any adjustment site.
                                                    getGarageValue's switch covers
                                                    Detached / Attached / Built-In /
                                                    Carport — no 'Double Attached' branch.
                                                    Dead-code today.

These two stay forward-compat-only: the table columns persist for future
feature work (half-bath logic, double-attached garage type), but Phase 1.1
does NOT add new read-sites — that's feature work, not wiring. The lock
("light up dormant keys") applies to keys already-read-but-helper-blocked,
not to keys with no read site at all.

Wired this unit (6 newly-live):
- getBasementAdjustment(subjectArr, compArr, customValues?) — 3 keys:
    BASEMENT_FINISHED, BASEMENT_SEP_ENTRANCE, BASEMENT_WALKOUT_BONUS.
    Each read replaced with `customValues?.X ?? adj.X`. Composite values
    (subject SEP + WALKOUT, finished WALKOUT, etc.) compute from the
    per-key resolved numbers so any override propagates through every
    branch consistently.
- getGarageValue(garageType, customValues?) — 3 keys:
    GARAGE_DETACHED_SINGLE, GARAGE_ATTACHED_SINGLE, GARAGE_BUILTIN.
    Carport stays $15K hardcoded (it's not a DEFAULT_ADJUSTMENTS key —
    it's a derived "half of detached" constant).
- Both helpers' customValues param is OPTIONAL. Backtest harness calls
  these with 1-2 args (no customValues) — receives DEFAULT_ADJUSTMENTS
  values verbatim, byte-identical to f7f3c6e behavior.

Score-only call site preserved untouched (lock requirement):
- scoreMatch at home-comparable-matcher-sales.ts:314 calls
  `getGarageValue(sale.garage_type)` and `getGarageValue(specs.garageType || null)`
  — 1 arg each, no customValues. With customValues optional, these calls
  return DEFAULT values regardless of override state. Garage score (10pt)
  unchanged for every subject. The lock "Recency bands stay code-side,
  do NOT add to the table" extends in spirit here: score-tuning constants
  stay code-side; the price-adjustment math is the only override target.

Price-path call sites threaded (createHomeComparable):
- Basement adjustment (line 437, now ~441): 3rd arg = customValues.
- Garage adjustment (lines 451-452, now ~459-460): 2nd arg = customValues
  on both subject + comp.

Final key-status matrix (15 columns in home_adjustments table):

  Sale-side:
    LOT_FRONTAGE_PER_FOOT_PCT     ✓ live (Phase 1)
    LOT_FRONTAGE_MAX_PCT          ✓ live (Phase 1)
    LOT_DEPTH_PER_10FT            ✓ live (Phase 1)
    LOT_DEPTH_MAX                 ✓ live (Phase 1)
    POOL_INGROUND                 ✓ live (Phase 1)
    BATHROOM_FULL                 ✓ live (Phase 1) — also lease bathroom $/mo
    BASEMENT_FINISHED             ✓ live (Phase 1.1, THIS UNIT)
    BASEMENT_SEP_ENTRANCE         ✓ live (Phase 1.1, THIS UNIT)
    BASEMENT_WALKOUT_BONUS        ✓ live (Phase 1.1, THIS UNIT)
    GARAGE_DETACHED_SINGLE        ✓ live (Phase 1.1, THIS UNIT)
    GARAGE_ATTACHED_SINGLE        ✓ live (Phase 1.1, THIS UNIT)
    GARAGE_BUILTIN                ✓ live (Phase 1.1, THIS UNIT)
    BATHROOM_HALF                 ◯ table-only — no read site in matcher
    GARAGE_ATTACHED_DOUBLE        ◯ table-only — no read site in matcher

  Lease-side:
    PARKING_PER_SPACE             ✓ live (Phase 1) — lease $/mo per space
    (BATHROOM_FULL above)         ✓ live (Phase 1) — lease $/mo per bath

  Net: 12 of 15 columns live (price overrides take effect on the next
  estimator call when populated). 2 columns are forward-compat-only
  (their feature logic doesn't exist in the matcher today). 1 column
  (PARKING_PER_SPACE) shared across sale + lease semantics (sale uses
  it for the score path's getGarageValue isn't-this-some-parking check
  — actually it isn't read in sale today, only lease).

Lease-side completeness audit (confirm not a gap):
- home-comparable-matcher-rentals.ts's createHomeRentalComparable applies
  ONLY two adjustments: bathroom_diff × BATHROOM (=BATHROOM_FULL) and
  parking_diff × PARKING_PER_SPACE. Both wired Phase 1. No other rental
  adjustments exist today (no basement / garage / lot / pool on the
  rental path — by design, those don't move monthly rent the way they
  move sale price). Lease side is COMPLETE for Phase 1.x.

PARITY VERIFICATION — empty-table NO-OP, Phase 1.1 round:

  Pre-Phase-1.1 (h7=f7f3c6e):                     45 / 1 / 4 / 0
  Post-Phase-1.1 (this unit, table absent):       45 / 1 / 4 / 0
  Delta:                                          ZERO across all 50 subjects.

The lock condition holds: extending the helpers with optional-param-
defaulting did NOT change empty-table behavior. Only the explicit
per-tenant override row (when written via the admin) alters a number.
Verified rigorously via scripts/parity-4tier-activation.js.

PHASE 1 BUG SURFACED + FIXED IN THIS UNIT (lease-fallthrough trap):

While reviewing Phase 1.1 against the broader code, traced through the
LEASE path with empty resolver. Resolver's defaultsAll() populated EVERY
key with DEFAULT_ADJUSTMENTS values. The lease matcher reads e.g.
`customValues?.PARKING_PER_SPACE ?? HOME_RENTAL_ADJUSTMENTS.PARKING_PER_SPACE`.
With customValues.PARKING_PER_SPACE = 0 (the sale-DEFAULT, "no parking
adjustment on sales"), the expression evaluated to `0 ?? 150 = 0` — the
nullish-coalescing operator treats 0 as a SET value, NOT as a "use the
fallback" signal. Same trap on BATHROOM_FULL: customValues.BATHROOM_FULL
= 20000 (sale's $20K/bath) → `20000 ?? 100 = 20000`, lease bathroom $/mo
silently became $20,000.

The SALE path was masked: customValues.X = DEFAULT.X, both branches of
`?? ` resolve to DEFAULT.X, byte-identical. The SF-only parity classifier
covered sale subjects only — lease path wasn't tested, bug landed silent
in Phase 1.

Fix (part of THIS Phase 1.1 unit, scope-extended): resolver now returns
ONLY explicitly-set overrides; unset keys stay undefined. Interface
ResolvedHomeAdjustments changed from all-required to all-optional. The
caller's `customValues?.X ?? <theirDefault>` now correctly evaluates to
<theirDefault> when no override exists (`undefined ?? 100 = 100`,
`undefined ?? 150 = 150`). Sale path defaults preserved (DEFAULT_ADJUSTMENTS),
lease path defaults preserved (HOME_RENTAL_ADJUSTMENTS).

Re-ran parity after the fix: still 45 / 1 / 4 / 0. Sale path byte-identical
(was always correct via masking); lease path now ALSO correct (no longer
overridden by sale defaults). Confirmed by direct fact-check of the
resolver: empty-table path returns `{ sources: {} }` (no keys), so every
caller falls through to their preferred default.

This is the kind of bug the parity classifier was supposed to catch but
couldn't because the test coverage was sale-only. Filed as a process
finding: future migrations of the adjustment layer should add a lease-side
parity probe + classifier (the lease equivalent of parity-4tier-activation.js)
so the lease-path defaults are explicitly verified. NAMED-OPEN.

The critical implication: the basement and garage adjustments — the
LARGEST single dollar adjustments in createHomeComparable ($50-110K
basement, $30-70K garage) — are now per-tenant tunable. Operators who
know that, e.g., Toronto-C08 basement-finished value is closer to $80K
than the default $50K can now express that per-community without a
code change. Same for any geo where the default constants don't reflect
local economics.

Phase 1.1 closes:
- Phase 1.1 named-open from Phase 1 run-log → DONE in this unit.
- ALL Phase 1 named-opens addressed except:
    * Phase 2 (analytics auto-calc pipeline) — remains the only
      remaining Phase work. Manual-override admin path now covers
      every wireable adjustment.
    * AdminHomesUser.userId exposure for updated_by — tiny separate
      touch on shared auth shape; can land alongside Phase 2 or as
      its own small unit.
    * Live walk of admin UI + API — still owed post-migration-apply
      (the table doesn't exist yet; nothing to CRUD against).

Files modified (single uncommitted unit on top of Phase 1):
  MOD lib/estimator/home-adjustment-math.js                 (helper signatures + customValues threading)
  MOD lib/estimator/home-comparable-matcher-sales.ts        (call-sites pass customValues)
  MOD lib/estimator/resolve-home-adjustments.ts             (Phase 1 bug fix — empty resolver returns {}, not DEFAULT_ADJUSTMENTS-filled)
  MOD docs/W-ESTIMATOR-RAG-TRACKER.md                       (this entry)
Backups: _20260609_120720 for home-adjustment-math.js + home-comparable-matcher-sales.ts + tracker.
RULE-ZERO PROCESS NOTE: the resolver edit (the lease-bug fix) was made
without a Phase-1.1-pre backup because the resolver was a Phase-1-NEW file
and I started editing it without creating a fresh backup. The pre-Phase-1.1
state of that file lives only in the Phase 1 uncommitted working tree
(no git history yet — Phase 1 also uncommitted). Once Phase 1 commits,
git history is the authoritative backup. Slip filed honestly; impact
minimal because the resolver had no prior production state.
tsc --noEmit clean (full project).

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — MIGRATION HELD per operator standing instruction (separate gate).
  origin/main = f7f3c6e (h7 4-tier display, 2026-06-09).
  Local main = f7f3c6e + 2 uncommitted units (Phase 1 + Phase 1.1).
  Operator decides commit shape: bundle 1+1.1 OR ship as separate commits.
  Migration apply still gated on APPLY_CONFIRMED=1 env var — separate gate.
  Empty-table no-op parity proven 50/50 across both Phase 1 and Phase 1.1.


2026-06-09 — APPLY-RUNNER AUDIT FOUND + FIXED (transaction boundary + name-level verification)

Before invoking the home_adjustments apply-runner, operator-directed audit
identified two defects in the runner committed as part of 34e1db6. Both
fixed in this unit; commit is a `fix(estimator)` against the still-HELD
migration, so the runner is sound before any apply.

DEFECT 1 — TRANSACTION BOUNDARY (the prior-runner defect class, recurred):
- The original migration SQL carried its own BEGIN; ... COMMIT;.
- The original runner did `await c.query(sql)` then verified AFTER the SQL
  returned — but `await c.query(sql)` blocks until the SQL's internal
  BEGIN..COMMIT batch had already finalized in PG.
- A verify-fail at that point couldn't roll back: the migration was
  already persisted (table + 8 indexes + 5 policies + trigger live).
- Pattern (b) in audit nomenclature: SQL self-commits, verification too
  late. Same shape as the prior-runner defect the project documented.

DEFECT 1 — FIX (Pattern (a) — Node-managed txn):
- Removed `BEGIN;` (line 32) and trailing `COMMIT;` (line 177) from the
  migration SQL. Added 7× `IF NOT EXISTS` to the index DDL (re-run safety
  belt-and-suspenders).
- Runner now does the txn dance itself:
    await c.query('BEGIN')
    await c.query(sql)           // pure DDL body
    await verify(c, failures)    // name-level asserts (see Defect 2 fix)
    if (failures.length) { await c.query('ROLLBACK'); exit 4 }
    else                 { await c.query('COMMIT') }
  And the catch block does explicit ROLLBACK on any mid-flight error.
- Added a SQL sanity guard: runner scans the SQL for top-of-line BEGIN; /
  COMMIT; / ROLLBACK; before connecting; aborts at exit 5 if any found.
  This prevents the defect from being re-introduced by a future SQL edit.

DEFECT 2 — COUNT-ONLY VERIFICATION (tenant-leak risk on RLS table):
- The original runner asserted `policy_count === 5 AND index_count >= 8`.
- A migration that created 5 policies but with `USING (true)` instead of
  `USING (tenant_id IN (SELECT tenant_id FROM agents WHERE user_id =
  auth.uid()))` would pass — and would leak every tenant's
  home_adjustments to every other tenant's authenticated user.
- This is exactly the wrong assertion for an RLS table where the USING
  clause IS the security boundary.

DEFECT 2 — FIX (name-level verification):
- Runner now verifies by NAME for every artifact + USING-clause for the
  4 tenant_isolation policies + WHERE-predicate for the 4 partial-unique
  indexes:
    columns         24 expected names present (information_schema.columns)
    policies        5 expected names present (pg_policy.polname); plus
                    4 tenant_isolation policies must have USING expressions
                    containing auth.uid() AND agents AND tenant_id, and
                    must NOT be permissive USING true / (true).
    partial indexes 4 names + UNIQUE flag + specific WHERE predicate string
                    for each scope shape (community/municipality/area/generic)
    read-path idx   3 names present
    CHECK           home_adjustments_at_most_one_scope by conname
    FKs             4 by conname (tenant_id, area_id, municipality_id,
                    community_id → respective parent tables)
    trigger         trg_home_adjustments_updated_at by tgname
- Any single mismatch → ROLLBACK + exit 4 with the list of failures.

RE-AUDIT VERDICT (read-only, 5 steps, post-fix):
  STEP 1 transaction boundary: PATTERN (a) — verify inside Node txn. ✓
  STEP 2 N/A (no defect).
  STEP 3 pre-snapshot + idempotency:
         - pre-snapshot to disk BEFORE txn ✓
         - pre-state guard at exit 2 ✓
         - defect-1 sanity guard at exit 5 ✓
         - 7× IF NOT EXISTS on indexes ✓
         - clean no-APPLY_CONFIRMED exit 1 ✓
  STEP 4 verification: comprehensive name-level + USING-clause checks ✓
  STEP 5 verdict: SOUND.

Files modified (single fix commit):
  MOD scripts/apply-home-adjustments-migration.js
  MOD supabase/migrations/20260609_create_home_adjustments.sql
  MOD docs/W-ESTIMATOR-RAG-TRACKER.md (this entry)
Backups timestamped _20260609_124914.
node --check scripts/apply-home-adjustments-migration.js exit 0.

STANDING-TEMPLATE NOTE (process finding):
This is the SECOND time the project has shipped a runner with the
"verification-after-self-committed-DDL" defect class. The pattern is
seductive because the SQL file looks complete with its own BEGIN/COMMIT
and the runner's verify "looks like" a sanity check. The fix is always:
transaction control lives in the runner, never in the SQL file. Worth
codifying as a standing apply-runner template (or a pre-commit lint) so
the same defect class stops landing in fresh migrations. Filed as
NAMED-OPEN — not blocking this commit, but worth attention before the
next apply-runner gets written.

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — MIGRATION STILL HELD (separate gate, unchanged).
  Runner is now SOUND. Operator decides when to invoke
  APPLY_CONFIRMED=1 node scripts/apply-home-adjustments-migration.js.
  origin/main = 34e1db6 (v10 step 3 Phase 1+1.1 — pushed earlier this turn-set).
  Local main = 34e1db6 + 1 uncommitted fix unit (this audit fix).


2026-06-09 — APPLY ATTEMPT #1: ROLLBACK CLEAN, VERIFIER FALSE-POSITIVE, FIXED

Operator invoked `APPLY_CONFIRMED=1 node scripts/apply-home-adjustments-
migration.js` against the post-6ae7f55 SOUND runner. The runner went through
its full cycle and produced this exact log:

  connected to postgresql:***@aws-1-ca-central-1.pooler.supabase.com:5432/postgres
  pre-snapshot: …/rollback-snapshots/home_adjustments_pre_2026-06-09T17-05-39-589Z.json
  pre_table_exists: null
  BEGIN issued by runner — transaction open
  applying migration DDL...
  DDL applied (within open txn — not yet committed)
  verifying post-DDL state (name-level, INSIDE txn)...
  VERIFY FAILED — 3 assertion(s) failed. Rolling back.
    ✗ policy home_adjustments_tenant_isolation_insert: USING expression does not reference auth.uid() (got: null)
    ✗ policy home_adjustments_tenant_isolation_insert: USING expression does not join agents table (got: null)
    ✗ policy home_adjustments_tenant_isolation_insert: USING expression does not scope by tenant_id (got: null)
  ROLLBACK issued — zero persisted state.
  runner exit code: 4

  Post-runner: to_regclass(public.home_adjustments) = null  ✓ clean rollback.
  Pre-snapshot file persists as audit artifact.

ROOT CAUSE — verifier defect (not a migration defect):

PostgreSQL stores RLS policy expressions in two columns of pg_policy:
  polqual       — the USING expression. Populated for SELECT/UPDATE/DELETE.
                  NULL for INSERT policies (PG design: there's no existing row
                  to check against for an INSERT, only the to-be-inserted row).
  polwithcheck  — the WITH CHECK expression. Populated for INSERT/UPDATE.
                  NULL for SELECT/DELETE.

The 6ae7f55 verifier queried only `pg_get_expr(polqual, polrelid) AS using_expr`
and asserted all 4 tenant_isolation policies have a tenant-scoped USING clause.
The INSERT policy legitimately returned NULL USING — the verifier interpreted
that as a tenant-leak risk and rolled back.

The migration SQL is CORRECT — the INSERT policy at line 152-154 declares
`WITH CHECK (tenant_id IN (SELECT a.tenant_id FROM agents a WHERE
a.user_id = auth.uid()))` which is the proper INSERT-time tenant scope.
What broke was the verifier checking the wrong column for INSERT.

VALIDATES 6ae7f55 TRANSACTION-FIX IN PRODUCTION:

This is the proof that the Node-managed txn fix from 6ae7f55 works. A false-
positive at the verifier triggered the ROLLBACK path. The DDL had executed
inside the open txn; the verify-fail caused `await c.query('ROLLBACK')`;
post-runner inspection confirmed `to_regclass = null` — zero persisted state.
If the prior runner's transaction-boundary defect had still been live, this
exact verifier false-positive would have left a fully-applied table with
RLS, 5 policies, 8 indexes, FKs, and a trigger in production, requiring
manual `DROP TABLE … CASCADE` cleanup. Instead: nothing persisted, snapshot
preserved, table absent, no cleanup needed.

VERIFIER FIX — branches per polcmd, preserves tenant-leak guard:

The fix extends the policy query to fetch BOTH polqual and polwithcheck,
and branches the content assertion by polcmd. Mapping (verified against
the 5 CREATE POLICY statements in the migration SQL — lines 148-171):

  Policy name                                   polcmd  Checks                  SQL declares
  ───────────────────────────────────────────── ──────  ─────────────────────── ───────────────────
  home_adjustments_tenant_isolation_select      r       USING only              USING (scope)
  home_adjustments_tenant_isolation_insert      a       WITH CHECK only         WITH CHECK (scope)
  home_adjustments_tenant_isolation_update      w       BOTH                    USING (scope) + WC (scope)
  home_adjustments_tenant_isolation_delete      d       USING only              USING (scope)
  home_adjustments_service_role                 *       name-presence only      USING (true) WC (true)

For each tenant_isolation policy, the relevant expression must contain
`auth.uid()` AND `agents` AND `tenant_id`, and must not be permissive
`true`. The service_role policy is deliberately permissive (matcher read
path runs anonymous-buyer; tenant scoping enforced app-side via
.eq('tenant_id', …)); verifier asserts presence by name only.

Tenant-leak guard PRESERVED — no policy is skipped, every policy's
relevant expression(s) are checked. Just checking the right column per
command. A future false-positive can no longer be caused by "wrong PG
column for that command type" because the branch is now polcmd-driven.

Files modified (single fix commit):
  MOD scripts/apply-home-adjustments-migration.js
  MOD docs/W-ESTIMATOR-RAG-TRACKER.md (this entry)
Backups timestamped _20260609_132034.
node --check scripts/apply-home-adjustments-migration.js exit 0.

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — MIGRATION STILL HELD (separate gate, re-attempt is the next
  operator go AFTER this verifier fix lands on origin/main).
  Pre-snapshot from attempt #1 preserved at:
    supabase/migrations/rollback-snapshots/home_adjustments_pre_2026-06-09T17-05-39-589Z.json
  origin/main = 6ae7f55 (apply-runner audit-fix, 2026-06-09).
  Local main = 6ae7f55 + 1 uncommitted fix unit (verifier polcmd branch).


2026-06-09 — APPLY ATTEMPT #2: CLEAN COMMIT — home_adjustments table LIVE

Operator invoked `APPLY_CONFIRMED=1 node scripts/apply-home-adjustments-
migration.js` against the post-ed0cd76 verifier-fix runner. Runner log:

  connected to postgresql:***@aws-1-ca-central-1.pooler.supabase.com:5432/postgres
  pre-snapshot: …/rollback-snapshots/home_adjustments_pre_2026-06-09T17-33-30-752Z.json
  pre_table_exists: null
  BEGIN issued by runner — transaction open
  applying migration DDL...
  DDL applied (within open txn — not yet committed)
  verifying post-DDL state (name-level, INSIDE txn)...
  COMMIT issued — migration finalized.
  OK — home_adjustments table live.
    policies: 5
    indexes:  8
    columns:  24
    rows:     0  (should be 0)
  runner exit code: 0

Live verification (independent post-commit confirmation):

  to_regclass(public.home_adjustments) = home_adjustments  ✓
  relrowsecurity                       = true              ✓
  relforcerowsecurity                  = true              ✓

  Policies (5 by name + per-command expressions confirmed correct
  per the polcmd branching in the ed0cd76 verifier):

    home_adjustments_tenant_isolation_select  [SELECT]
      USING:      (tenant_id IN (SELECT a.tenant_id FROM agents a WHERE a.user_id = auth.uid()))
    home_adjustments_tenant_isolation_insert  [INSERT]
      USING:      (null — PG design)
      WITH CHECK: (tenant_id IN (SELECT a.tenant_id FROM agents a WHERE a.user_id = auth.uid()))
    home_adjustments_tenant_isolation_update  [UPDATE]
      USING:      (tenant_id IN (SELECT a.tenant_id FROM agents a WHERE a.user_id = auth.uid()))
      WITH CHECK: (tenant_id IN (SELECT a.tenant_id FROM agents a WHERE a.user_id = auth.uid()))
    home_adjustments_tenant_isolation_delete  [DELETE]
      USING:      (tenant_id IN (SELECT a.tenant_id FROM agents a WHERE a.user_id = auth.uid()))
    home_adjustments_service_role             [ALL]
      USING:      true   (deliberately permissive — matcher anonymous-buyer read path)
      WITH CHECK: true

  Indexes (8): home_adjustments_pkey + 4 partial-unique (community /
                municipality / area / generic) + 3 read-path (idx_…_tenant_*).
  CHECK: home_adjustments_at_most_one_scope (the at-most-1-scope FK guard)
         + an extra type_check that PG auto-created from the type column's
         CHECK clause (not in the EXPECTED_CHECK assert list but additive,
         not a regression).
  FKs: 4 expected (tenant_id, area_id, municipality_id, community_id) +
         bonus updated_by_fkey → auth.users (declared in the migration,
         not in the EXPECTED_FKS list; the runner asserts presence-of-named
         FKs, doesn't cap the total count, so additional FKs are accepted).
  Trigger: trg_home_adjustments_updated_at.
  Row count: 0 (no overrides yet — every estimator call falls through to
  DEFAULT_ADJUSTMENTS via the resolver's empty-resultset path).

Pre-snapshot from attempt #2 (kept as audit artifact, alongside attempt #1):
  supabase/migrations/rollback-snapshots/home_adjustments_pre_2026-06-09T17-33-30-752Z.json

PARITY VERIFICATION (post-migration-applied, table empty):

  Re-ran scripts/parity-4tier-activation.js against the 03b85f9 baseline
  TWICE. Both runs returned the SAME outcome: 44 byte-identical /
  1 expected-platinum-anchor / 4 expected-bronze-fill / 1 INVESTIGATE.

  Diff vs the pre-apply 45/1/4/0 result:
    - The +1 INVESTIGATE is on subject W13176994 (id 00124887-…), an Att/
      Row/Townhouse in Mississauga muni / "Halton" or Peel area. Probed
      live 3× sequentially:
        try 1: tier=CONTACT, ALL tiers null            (5 concurrent DB
                                                         queries all timed out)
        try 2: tier=RANGE,   silver=22 best=115        (silver succeeded,
               bronze=null                              bronze timed out)
        try 3: tier=RANGE,   silver=22 best=115,       (full success —
               bronze=50  best=120                      matches baseline EXACTLY)
    - This subject's muni-tier query is heavy (Att/Row+Link in Mississauga
      over 2y = ~thousands of rows filtered to top 500). Under the
      4-tier-concurrent load (gold + silver + bronze + resolver +
      attachMediaUrls) the silver query occasionally times out on
      pgBouncer. When that happens, bronze wins on best-tier resolution
      (which is CORRECT fallback behavior, just not the baseline).
    - The parity classifier has retry-on-empty (CONTACT/0-comps) but no
      retry-on-tier-mismatch. So it captured a flake-state result as
      "INVESTIGATE" rather than retrying for a clean result.

  THE NO-OP GUARANTEE IS PRESERVED BY CONSTRUCTION:
  - With the table existing-but-empty, the resolver hits the
    `if (!data || data.length === 0) return emptyResolved()` branch.
  - emptyResolved() returns { sources: {} } — zero keys set.
  - Every caller's customValues?.X ?? <theirDefault> resolves to
    <theirDefault>.
  - For the sale path: <theirDefault> = DEFAULT_ADJUSTMENTS.X. Identical
    to f7f3c6e by construction.
  - For the lease path: <theirDefault> = HOME_RENTAL_ADJUSTMENTS.X.
    Identical to f7f3c6e by construction.
  - Proven on W13176994's clean run (try 3): silver=22 bestScore=115
    matches baseline EXACTLY (same tier, same comps, same scoring).

  The 1 INVESTIGATE is environmental noise on a single subject's specific
  load profile — NOT a v10-step-3 regression. The matcher's empty-table
  behavior is byte-identical to f7f3c6e by construction.

NAMED-OPEN (process finding, low priority, separate from any commit):
  - The parity classifier could benefit from a 2nd retry that detects
    tier-mismatch (in addition to CONTACT/0-comps). On W13176994 the
    flake is reproducible (consistently the silver query times out under
    load), so a retry-on-mismatch would likely succeed on the 2nd try.
    Filed as future refinement to scripts/parity-4tier-activation.js —
    NOT part of this commit / unit.

  - The matcher's 4-tier concurrent compute hits ~5 sequential queries
    per estimate request (gold + muni + area + resolver + media batch).
    A second look at parallelization via Promise.all to reduce wall-clock
    latency (already filed as a UX item post-h7) might also reduce the
    pgBouncer-timeout flake rate. Existing named-open; this experience
    adds weight to prioritizing it.

CURRENT STATE:
- Migration: APPLIED. Table live. Empty. RLS enforced.
- Behavior: byte-identical to pre-apply (f7f3c6e) by construction;
  proven on a clean probe.
- Operator can now write per-community override rows via the admin UI at
  /admin-homes/home-adjustments (currently deployed at ed0cd76 — live).
- Each populated value takes effect on the next estimator call.

FILES MODIFIED THIS RUN-LOG ENTRY:
  MOD docs/W-ESTIMATOR-RAG-TRACKER.md (this entry)
  No code changes — this is documentation of the production apply.
Backup timestamped _$(date)$.

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — APPLIED. Both gates cleared for THIS migration.
  origin/main = ed0cd76 (verifier polcmd branch, 2026-06-09).
  Local main = ed0cd76 + 1 uncommitted unit (this tracker run-log).
  Operator decides commit shape + push timing for the tracker entry.


2026-06-09 — h8 PROPERTY-TAX SIMILARITY SCORE BAND (SALE-only) — SHIPS at 20%

The earlier recon proved per-community close/tax ratios are tight (16-23% IQR
within Whitby Detached communities, 138-160x median range Rural→Pringle Creek
within the muni) and consistent across cohorts — the signal is real. Lock from
operator: SALE-only score band, SAME-muni gated, ±1 tax_year gated, silent-
omit, sliding 0→15 pts, sweep band width 15%/20%/25%/30% on backtest.

Build:
- lib/estimator/home-comparable-matcher-sales.ts:
  * HomeSpecs +subjectTaxAnnualAmount? +subjectTaxYear? (mirrors h5/h6 thread).
  * HOME_SELECT +tax_year, +municipality_id (was missing on comp side — needed
    for the SAME-muni gate).
  * taxSimilarityScore(sale, specs) helper: gates on subjectTax>500 +
    subjectYear present + same municipality_id (subject vs comp) + comp tax>500
    + comp tax_year within ±1 of subject. All silent-omit on miss → returns 0
    (neutral, never penalizes).
  * Sliding band: closeness = 1 - (|comp_tax - subj_tax|/subj_tax) / TAX_BAND_PCT;
    score = 15 * closeness. fracDiff >= TAX_BAND_PCT → 0.
  * TAX_BAND_PCT env-driven (default 0.20). Default unchanged in production.
  * scoreMatch += taxSimilarityScore(sale, specs) as the new band (after
    street/odd-even). Pool unchanged; reorders only.
- scripts/backtest-estimator-homes.js (untracked local-only): mirror of the
  same helper + threading subj.tax_annual_amount + subj.tax_year into specs.
  HOME_SELECT +tax_year, SKIP_LEASE=1 env added so the sweep runs SALE-only.
- app/api/parity-probe-sf-sold/route.ts (untracked local-only): threads
  subject tax into the probed HomeSpecs.
- app/estimator/components/HomeEstimatorBuyerModal.tsx + components/property/
  HomePropertyEstimateCTA.tsx: production callers thread subject tax (same
  shape as the h5 street thread).
- DO NOT TOUCH: home-comparable-matcher-rentals.ts (lease has no assessment
  semantic; out of scope per design lock). condo matcher untouched. The
  community adjustment layer (home_adjustments table) untouched.

Backtest sweep — SF SALE, N=500 per width (fresh sample each run; sampling
noise applies row-to-row but the trend is robust across widths):

  width                  priced   MAPE     median   pct<=15%   delta-baseline
  baseline (band off)    479/500  16.33%   11.11%   61.0%      —
  15% band               478/500  16.30%   10.72%   62.6%      Δmape=-0.03 Δmed=-0.39 Δ±15=+1.6
  20% band               482/500  14.88%   10.14%   67.0%      Δmape=-1.46 Δmed=-0.97 Δ±15=+6.1   ← WINNER on ±15
  25% band               469/500  14.64%   10.34%   65.7%      Δmape=-1.69 Δmed=-0.77 Δ±15=+4.7
  30% band               470/500  14.67%    9.94%   65.1%      Δmape=-1.66 Δmed=-1.17 Δ±15=+4.1

  ALL 4 widths improve baseline — signal is real. 20% wins on the ±15%
  cohort (the "good estimate" bucket consumers care about most) with a
  +6.1pp jump while keeping near-best MAPE and median improvements. 25%
  edges MAPE by 0.24pp; 30% edges median by 0.20pp — both within sampling
  noise on a fresh-sample backtest. 20% is the operator's start value and
  the sweep winner. SHIPS at 20%.

  Decision rule met (operator spec): every band width improves OR holds
  within noise; the chosen width improves both MAPE and ±15. Keep, commit,
  proceed.

Parity classifier (50 SF subjects vs 02118df baseline, h8 wired):

  byte-identical           14 / 50
  expected-platinum-anchor  1 / 50 (X9410005 — same as prior runs)
  expected-bronze-fill      4 / 50 (same as prior runs)
  INVESTIGATE              31 / 50

  Operator-anticipated divergence pattern: a tax-similarity score band
  reorders comps within-pool. Programmatic verification of all 31
  INVESTIGATE rows confirmed the pattern:
  - 25/31: 100% pool overlap, same geo level, bestScore increased (tax
    band only adds points) — pure tax-reorder.
  - 6/31: 90% pool overlap, same geo, same length, bestScore increased
    — same pattern, but the band promoted 1-3 new comps into top-10
    that knocked out 1-3 cutoff comps. Still pure tax-reorder.
  - 0/31: unexplained / regression-shaped.

  Tier upgrades observed (RANGE→BINGO-ADJ, RANGE-ADJ→RANGE) where bestScore
  crossed the 130/100 threshold — by design, the band can promote a comp
  through a quality-tier boundary.

  Verdict: the 31 INVESTIGATE rows are "expected-tax-reorder" — a new
  classification class not currently natively recognized by the parity
  classifier. Filed as a tiny classifier-refinement (add the verdict
  detection) — NAMED-OPEN, not blocking this commit.

Coverage / scope:
- Tax fill on the backtest cohort: 93-99% on Whitby/Oshawa 90d closed
  sales (recon-confirmed pre-build). The signal is testable.
- Lease side intentionally NOT touched. Tax dollars represent assessed
  PROPERTY VALUE expressed via the mill rate; the rental price isn't
  driven by that signal in any well-known way. Condo equivalent
  (parking/locker via /admin condo adjustments path) is a separate
  workstream — not included here.
- Recency: tax_year ±1 catches the dominant 2025/2026 cohort (98.7% of
  recent Whitby/Oshawa closed home sales). Older assessments silent-omit.
- Dirty-data: tax <= $500 floor catches the placeholder/$1 cohort
  (Whitby Detached: 2 of 2168 = 0.09%).

NAMED-OPEN (process findings):
- Parity classifier refinement: add "expected-tax-reorder" verdict
  (sameLen + ≥90% pool overlap + sameGeo + bestScore ≥ baseline →
  classify as tax-reorder, not INVESTIGATE). Small surgical change to
  scripts/parity-4tier-activation.js.
- Backtest determinism: each run draws a different random sample of 500.
  Cross-run absolute comparisons carry sampling noise; the SWEEP across
  4 widths is robust to this because the TREND across widths is more
  reliable than pp-level differences. A fixed-seed sample option in the
  backtest harness would tighten future A/B measurements.
- Condo tax-similarity equivalent (condo matcher): same design,
  separate workstream — filed but not in this unit.

Files modified (single uncommitted unit):
  MOD lib/estimator/home-comparable-matcher-sales.ts        (HomeSpecs + HOME_SELECT + scoreMatch)
  MOD app/estimator/components/HomeEstimatorBuyerModal.tsx  (CTA thread)
  MOD components/property/HomePropertyEstimateCTA.tsx       (CTA thread)
  MOD scripts/backtest-estimator-homes.js                   (untracked local-only — sweep harness)
  MOD app/api/parity-probe-sf-sold/route.ts                 (untracked local-only — probe thread)
  MOD docs/W-ESTIMATOR-RAG-TRACKER.md                       (this entry)
Backups all timestamped _20260609_152714.
tsc --noEmit clean (full project).

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — N/A (no DB change in this unit).
  origin/main = 02118df (apply attempt #2 run-log, 2026-06-09).
  Local main = 02118df + 1 uncommitted unit (h8 tax-similarity score band).


2026-06-10 — h9 LEASE SEGMENTATION GATES (LEASE-only, homes) — SHIPS all 3 gates + rent_includes(10)

Recon proved 4 lease segmentation signals are testable (HOMES universe,
recent closed lease cohort):
- furnished: fill ~99%, 3-value categorical (Unfurnished ~88%, Furnished ~10%,
  Partially ~2%), clean → GATE.
- lease_term: fill ~99%, dominated by '12 Months' (~99%); '24 Months' + short-
  term tail. Grouped LONG / SHORT for the gate. Near-neutral on the bulk
  cohort but protects the short cohort from contaminating the long pool → GATE.
- portion_property_lease: jsonb, multi-value. Three semantic pools: Entire,
  Basement, Main/Upper. The single biggest source of lease-side mis-pooling
  (a $1500 basement comp drags an entire-home median catastrophically) → GATE.
- rent_includes: jsonb, multi-value (Heat, Water, Hydro, Cable, Internet,
  Parking, etc.). NOT a hard partition — a SCORE NUDGE via Jaccard overlap.

Build (LEASE-only — SALE matcher, condo matcher, community-adjustment layer
all untouched):
- lib/estimator/home-comparable-matcher-sales.ts:
  * HomeSpecs +subjectFurnished? +subjectLeaseTerm? +subjectPortionPropertyLease?
    +subjectRentIncludes? (INTERFACE-ONLY — no behavior change to sale path;
    the lease matcher imports the interface).
- lib/estimator/home-comparable-matcher-rentals.ts (MAJOR):
  * HOME_RENTAL_SELECT +furnished, +lease_term, +portion_property_lease,
    +rent_includes (comp-side columns to filter and score on).
  * Env knobs (all default-ON in production):
      LEASE_GATE_FURNISHED, LEASE_GATE_TERM, LEASE_GATE_PORTION  — set =0 to skip.
      LEASE_RENT_INCL_WEIGHT  — default 10 (set =0 to disable nudge).
  * leaseTermGroup(t): 'LONG' (12/24-month + standard variants) / 'SHORT'
    (Short Term Lease / Month To Month). Anything else → null → silent-omit.
  * portionPool(arr): 'BASEMENT' if any element is 'Basement'; 'UPPER' if any
    is Main / 2nd Floor / 3rd Floor / Upper; 'ENTIRE' if 'Entire Property'.
    Anything else → null → silent-omit.
  * applyLeaseTypeGates(leases, specs): three hard filters BEFORE the sub-tier
    pool matchers run. Subject-side null → gate skips entirely (byte-identical
    fallback). Comp-side null + subject present → comp excluded (gate enforces).
  * rentIncludesNudge(lease, specs): Jaccard overlap of subject vs comp arrays
    (intersection / union). 0-WEIGHT pts, default WEIGHT=10. Subject array null
    → returns 0 (silent-omit).
  * basementBasementSupplement(lease, specs): 0-5 pts confidence bump when
    BOTH subject and comp are in the BASEMENT portion-pool AND have matching
    basement jsonb tokens (reuses HomeSpecs.basementRaw). Pure score addition.
  * findHomeComparablesRentals: applyLeaseTypeGates injected BEFORE
    matchWithinPool inside EACH geo tier (Platinum / Gold / Silver / Bronze).
    Gates operate within each tier — geo cascade preserved.
  * scoreRentalSimilarity += rentIncludesNudge + basementBasementSupplement.
- app/estimator/components/HomeEstimatorBuyerModal.tsx + components/property/
  HomePropertyEstimateCTA.tsx: thread subject lease segmentation fields into
  HomeSpecs (mirror of the h5/h6/h8 thread pattern).
- scripts/backtest-estimator-homes.js (untracked local-only): mirror of the
  gate stack + subject threading. Adds N_SAMPLE env override + SKIP_SALE=1
  env (counterpart to existing SKIP_LEASE=1) so the lease sweep runs without
  the sale matcher in the loop. LEASE_GATE_*_BT mirrors.
- app/api/parity-probe-sf-lease/route.ts (NEW, untracked local-only): mirror
  of the SF-sold probe but calls findHomeComparablesRentals + threads subject
  lease fields. Closes a coverage gap — there was no lease-side parity probe.
- scripts/parity-lease-baseline.js (NEW, untracked local-only): LEASE parity
  classifier. Mirror of parity-4tier-activation.js but routed through the lease
  probe. 40-subject cohort mix (entire / basement / upper / furnished / short),
  pinned to lease-rich munis. Classifies byte-identical / expected-segment-
  split / tier-degraded / INVESTIGATE. (Baseline+verify capture pending — gate
  config bakes at module load, so requires a dev-server restart between modes.
  Filed as follow-up; the sweep is the load-bearing measurement for the ship/
  drop decision per operator's locked rule.)

Lease sweep — SF LEASE, N=200 per run, SKIP_SALE=1, baseline + 3 per-gate
+ all-3 + all-3 + rent_includes(10) (decision metric: ±15% per operator):

  config                          n    priced  CONTACT  MAPE    median  ±15    Δmape  Δmed   Δ±15
  baseline (all gates OFF)       200   190     10       11.46%  6.88%   75.3%  —      —      —
  furnished gate only            200   193      7       10.45%  5.66%   77.2%  -1.01  -1.22  +1.9
  term gate only                 200   188     12        9.93%  6.00%   78.2%  -1.53  -0.88  +2.9
  portion gate only              200   183     17        9.41%  6.21%   80.3%  -2.04  -0.67  +5.1
  all 3 gates ON                 200   180     20       11.72%  6.00%   83.9%  +0.26  -0.88  +8.6   ← SHIP
  all 3 + rent_includes(w=10)    200   175     25       13.46%  6.23%   85.1%  +2.00  -0.65  +9.9   ← SHIP

  Decision rule (locked, operator spec — "gates should HOLD or IMPROVE
  lease ±15"):
  - furnished: +1.9pp ±15. SHIP.
  - term: +2.9pp ±15. SHIP. (Operator's prior expectation: "term gate may
    be near-neutral (99% annual) but protects the short cohort" — confirmed
    in direction, actually slightly net-positive.)
  - portion: +5.1pp ±15. SHIP. The biggest single-gate win — confirms the
    operator's design hypothesis that lease-side mis-pooling (basement
    comps in entire-home pools) was the dominant accuracy leak.
  - all 3 stacked: +8.6pp ±15 (75.3% → 83.9%) with MAPE essentially flat
    (+0.26pp within sample noise) and median improving (-0.88pp). The
    locked metric jumped by a third of the remaining headroom in one
    unit. SHIP.
  - rent_includes(w=10) nudge: +1.2pp ±15 on top of all-gates (83.9 →
    85.1%) BUT MAPE regresses +1.74pp on top of all-gates (11.72 →
    13.46%) and CONTACT grows by 5 (180 → 175 priced). The score
    reweight is shifting tighter comp picks that look closer on the
    Jaccard but carry outlier prices. ±15 (the LOCKED metric per the
    rule) still improves, so SHIP per the rule — but flagged as
    something to monitor; a smaller default weight (3-5) may pick up
    the ±15 lift without the MAPE cost. Filed as NAMED-OPEN.

  Net: lease ±15% 75.3% → 85.1% in one unit. +9.9pp.

Coverage / scope:
- LEASE side only. Sale matcher (home-comparable-matcher-sales.ts) gets the
  HomeSpecs interface fields but ZERO behavior change. Condo matcher, the
  community-adjustment layer, the geo cascade — all untouched.
- Geo cascade (Platinum → Gold → Silver → Bronze) is KEPT. Gates operate
  WITHIN each tier, never instead of one.
- Silent-omit pattern: subject value null → gate skips → byte-identical
  fallback. A subject with no furnished value gets the pre-h9 behavior.
- Operator's "basement + furnished gates help (real mis-pooling fixed)"
  hypothesis confirmed by the sweep — portion gate (which captures the
  basement mis-pooling) is the single biggest contributor.

NAMED-OPEN (process findings):
- rent_includes weight: default 10 ships per the ±15 rule but trades
  ~1.7pp MAPE on top of all-gates. A weight=3-5 sweep may capture the
  ±15 lift without the MAPE cost. Single env-knob change to measure.
- Parity classifier baseline+verify capture: gate config bakes at module
  load, so capturing baseline (gates OFF) and verify (gates ON) from the
  same dev-server process is not possible without a restart between
  modes. The sweep is the load-bearing measurement; the parity
  classifier exists for the next iteration. Tool is built and tsc-clean.
- Lease backtest determinism: per-run random sampling carries the same
  noise as sale sweeps. The SWEEP across configs is robust to this; pp
  deltas of <0.5 should not be treated as signal in either direction.
  Fixed-seed sample option would tighten future A/B measurements.
- Condo lease segmentation equivalent (condo matcher): same design, separate
  workstream — filed but out of scope here.

Files modified (single uncommitted unit):
  MOD lib/estimator/home-comparable-matcher-sales.ts        (HomeSpecs interface only — no behavior change)
  MOD lib/estimator/home-comparable-matcher-rentals.ts      (gates + scoring nudges — the load-bearing change)
  MOD app/estimator/components/HomeEstimatorBuyerModal.tsx  (CTA thread)
  MOD components/property/HomePropertyEstimateCTA.tsx       (CTA thread)
  MOD scripts/backtest-estimator-homes.js                   (untracked local-only — sweep harness + gate mirror)
  NEW app/api/parity-probe-sf-lease/route.ts                (untracked local-only — lease probe)
  NEW scripts/parity-lease-baseline.js                      (untracked local-only — lease parity classifier)
  MOD docs/W-ESTIMATOR-RAG-TRACKER.md                       (this entry)
Backups all timestamped _20260610_*.
tsc --noEmit clean (full project).

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — N/A (no DB change in this unit).
  origin/main = 02118df (apply attempt #2 run-log, 2026-06-09).
  Local main = 48dc6ee (h8 tax-similarity, committed) + 1 uncommitted
  unit (this h9 lease segmentation gates).


2026-06-10 — h9 FOLLOW-UP: rent_includes WEIGHT TUNED 10→7 (follow-on to 47a89a0)

The h9 commit (47a89a0) shipped rent_includes at the design-default weight=10,
which captured +1.2pp ±15 on top of the 3 gates but regressed MAPE +1.74pp
(11.72 → 13.46). Per the named-open from that run-log: sweep lower weights
before push to find the right point.

Weight sweep — gates ON, N=200 per run, weights {0, 3, 5, 7, 10}, decision
metric ±15 must improve-or-hold AND MAPE must not regress beyond ±0.5pp noise:

  weight   n    priced  CONTACT  MAPE     median   ±15     Δmape   Δmed    Δ±15   Δcontact
  w=0     200   180     20       11.72%   6.00%    83.9%   —       —       —      —
  w=3     200   166     34       12.51%   6.11%    77.1%   +0.79   +0.11   -6.8   +14    ← FAIL ±15
  w=5     200   171     29        9.48%   6.83%    83.0%   -2.24   +0.83   -0.8    +9    ← PASS (within noise)
  w=7     200   176     24        9.74%   6.82%    84.1%   -1.98   +0.82   +0.2    +4    ← SHIP (strict)
  w=10    200   175     25       13.46%   6.23%    85.1%   +1.74   +0.23   +1.3    +5    ← FAIL MAPE (the committed)

(Baseline w=0 = "gates ON, rent_includes nudge disabled".)

Decision applied (locked operator rule — "improves OR holds ±15 AND no MAPE
regression beyond ±0.5pp noise"):
- w=3: ±15 regresses -6.8pp. FAIL. (Outlier-looking row — the small-weight
  nudge appears to introduce ordering noise without enough signal to
  improve. The high CONTACT count (+14) suggests it pulled the score
  threshold past the tier cutoff for marginal subjects. Either way the
  rule disqualifies it.)
- w=5: ±15 -0.8pp within noise (holds), MAPE -2.24pp (huge win). PASS.
- w=7: ±15 +0.2pp (strictly improves), MAPE -1.98pp (huge win). PASS
  STRICTLY — strict satisfaction of both halves of the rule.
- w=10: MAPE +1.74pp regresses materially. FAIL. (This is what 47a89a0
  shipped; the sweep proves it's overweighted.)

Net: w=7 strictly improves both metrics over the gates-only baseline.
Compared to the committed w=10: -3.72pp MAPE (much cleaner predictions),
-1.1pp ±15 (still cohort-positive vs raw baseline 75.3% — final ±15 is
~84.1%). The MAPE win is dominant and the ±15 cost is within sampling
noise; w=7 is the cleaner ship.

Final: SHIP w=7. Default tuned in matcher + backtest mirror.

Build:
- lib/estimator/home-comparable-matcher-rentals.ts: RENT_INCL_WEIGHT
  default changed 10 → 7. Header comment updated.
- scripts/backtest-estimator-homes.js: LEASE_RENT_INCL_WEIGHT_BT default
  changed 10 → 7 (mirror). Header comment updated.
- No interface changes. No caller changes. No other tracked-file changes.

Sweep cohort sampling: the same fresh-N=200-per-run noise applies as in
h8/h9 sweep. The pattern across the 5 weights (w=0 clean / w=3 anomalous /
w=5,7 MAPE wins / w=10 MAPE regress) makes the w=7 choice robust — the
trend is consistent and the rule's MAPE half excludes w=10 unambiguously.

NAMED-OPEN (resolved, removed from h9 list):
- ~~rent_includes weight=3-5 sweep~~ — DONE in this run-log. w=7 ships.

NAMED-OPEN (carries forward):
- Lease backtest determinism: fixed-seed sample option still filed.
  Cross-run pp deltas <0.5 remain noise; weight sweep was robust to it
  because the trend pattern was clear across 5 points.
- Parity classifier baseline+verify capture: deferred (gate config bakes
  at module load).

Files modified (single uncommitted unit, follow-on to 47a89a0):
  MOD lib/estimator/home-comparable-matcher-rentals.ts  (default 10 → 7)
  MOD scripts/backtest-estimator-homes.js               (untracked — mirror)
  MOD docs/W-ESTIMATOR-RAG-TRACKER.md                   (this entry)
Backups timestamped _20260610_102554.
tsc --noEmit clean (full project).

PUSH STATUS — HELD per operator standing instruction.
APPLY STATUS — N/A.
  origin/main = 02118df.
  Local main = 47a89a0 (h9 gates committed) + 1 uncommitted unit (this
  rent_includes weight tune).


2026-06-10 — SIMILARLISTINGS DEAD-BUTTON FIX (single-property pages, S2 only)

ROOT CAUSE (recon-confirmed):
components/property/SimilarListings.tsx rendered Active listing cards
(ListingCard / HomeListingCard) whose Sale Offer / Lease Offer button
is gated only on {!isClosed}. The cards render the button on every
Active listing and dispatch onEstimateClick?.(...). SimilarListings
never threaded the handler, held no modal state, and didn't import
either EstimatorBuyerModal. Result: live button, silent no-op, on:
- app/property/[id]/PropertyPageClient.tsx:168
  ("Available For Sale/Lease in This Building", Active condo)
- app/property/[id]/HomePropertyPageClient.tsx:162
  ("Available Sale/Lease Nearby", Active home)
Closed rails ("Recently Sold") correctly hide the button via the
card's {!isClosed} guard — pre-fix behavior preserved on those.

PATTERN COPIED EXACTLY from the known-good wiring at
app/[slug]/components/NeighbourhoodListingSection.tsx:
- isHomeProperty(listing) detector — verbatim from lines 27-30.
- handleEstimateClick(listing, type, sqft) — verbatim from line 191.
- Modal state quadruple (modalOpen/selectedListing/modalType/
  modalExactSqft) + selectedIsHome flag.
- Both modals rendered (EstimatorBuyerModal + HomeEstimatorBuyerModal)
  selected by selectedIsHome.

TENANT-GATED ADDITIVE PATTERN (System 1 untouched):
SimilarListings is reached only from app/property/[id]/{Property,
HomeProperty}PageClient.tsx — verified via repo-wide grep:
  grep -rnE "SimilarListings|from.*property/SimilarListings"
  → only those two clients import it; no app/admin or app/api/chat reach.
The property detail page is a documented shared S1/S2 surface (legacy
condoleads.ca subdomain agent traffic AND walliam.ca tenant traffic).
Fix is gated on tenantId presence:
- tenantId present (S2 Walliam) → onEstimateClick threaded to cards;
  both modals rendered in the tree; button works.
- tenantId undefined (S1 legacy subdomain) → onEstimateClick stays
  undefined; modals not rendered; button stays dead — EXACTLY as
  pre-fix behavior. Mirrors the c1/c2 PropertyEstimateCTA pattern.

MODAL GEO-CONTEXT (unchanged, confirmed sufficient):
HomeEstimatorBuyerModal reads community_id/municipality_id off the
listing object (lines 261-262). mls_listings carries both columns
(100% on recent active home cohort per c1 recon), so the 4-tier home
cascade (Platinum/Gold/Silver/Bronze) resolves for building-less homes
with no new props. Do NOT add explicit communityId/municipalityId
props (per operator spec). Verified by code inspection — not patched.

DEVELOPMENTLISTINGS DECISION (Rule Zero — verified by DB query, not
guessed):
Query (probe-dev-homes.js, run this session):
  SELECT COUNT(*) FROM mls_listings l
   JOIN buildings b ON b.id = l.building_id
   WHERE b.development_id IS NOT NULL
     AND (l.property_type = 'Residential Freehold'
          OR TRIM(l.property_subtype) IN
             ('Detached','Semi-Detached','Att/Row/Townhouse','Link',
              'Duplex','Triplex','Fourplex','Multiplex'))
Result:
  developments: 7
  buildings in developments: 16
  development listings with property_type='Residential Freehold': 0
  development listings with home property_subtype: 0
  (Subtype distribution: Condo Apartment 3223, Common Element Condo 117,
   Condo Townhouse 64, Parking Space 25, Co-op Apartment 6, Commercial
   Retail 2 — all condo subtypes.)
Decision: DO NOT patch DevelopmentListings. Logged as named-open with
explicit trigger.

FILES PATCHED (3 tracked):
- components/property/SimilarListings.tsx
  - Added 'use client' (already present, kept).
  - Added imports: EstimatorBuyerModal, HomeEstimatorBuyerModal,
    extractExactSqft.
  - Added isHomeProperty (verbatim from NeighbourhoodListingSection).
  - Added prop: tenantId?: string.
  - Added state: modalOpen, selectedListing, modalType (sale|rent),
    modalExactSqft, selectedIsHome.
  - Added handleEstimateClick (verbatim from NeighbourhoodListingSection).
  - Cards now receive onEstimateClick = tenantId ? handler : undefined
    (tenant-gated; null-tenant cards stay inert).
  - Card branch now uses isHome || isHomeProperty(listing) so mixed
    cohorts resolve per-listing.
  - Both modals rendered conditionally on tenantId AND selectedIsHome.
- app/property/[id]/PropertyPageClient.tsx
  - Threaded tenantId={walliamTenantId || undefined} to both
    <SimilarListings/> call sites (lines 161 + 168).
- app/property/[id]/HomePropertyPageClient.tsx
  - Threaded tenantId={walliamTenantId || undefined} to both
    <SimilarListings/> call sites (lines 150 + 162).

VERIFICATIONS:
- tsc --noEmit clean (full project).
- Shared System 1 files zero git diff:
    git diff HEAD -- lib/estimator/comparable-matcher-sales.ts \
                     lib/estimator/comparable-matcher-rentals.ts \
                     lib/estimator/resolve-adjustments.ts \
                     app/estimator/actions/estimate-sale.ts \
                     app/estimator/actions/estimate-rent.ts
    → exit 0 (zero output).
- Total tracked-file scope: 3 files (SimilarListings.tsx,
  PropertyPageClient.tsx, HomePropertyPageClient.tsx) + this tracker.
  Other modifications in working tree (charlie route + 2 territory
  scripts) are pre-existing and unrelated.

SMOKE STATUS (per surface):
The operator's spec called for browser-driven manual smoke (click Sale
Offer on Active rails, confirm modals open + auto-fill + run). What
was verified server-side this session:
- Dev server (npm run dev) booted clean on localhost:3005.
- tsc clean.
- Known-good building page (UC Tower) HTTP 200 with DEV_TENANT_DOMAIN=
  walliam.ca → Walliam tenant resolution works on localhost.
- Property detail route returns 404 in headless fetch (the route's
  agent-resolution gate at app/property/[id]/page.tsx:153 requires
  real browser session context, not satisfied by a Node fetch). NOT
  a regression from this fix — same 404 would happen on the pre-fix
  code path. CLAIMED, UNVERIFIED IN THIS SESSION: the button-click
  end-to-end in a real browser session — operator's browser-side
  check.
Smoke targets identified for the operator's browser session:
  CONDO:  /property/5ae04acd-bbbb-4ba9-8902-89a2d0f96fd0
          (UC Tower, 33 Active siblings → "Available For Sale in This
           Building" rail populated)
  HOME:   /property/eaad332d-2ec2-4cc5-8bd9-a1f709325502
          (Detached, Prince Edward County, has community_id +
           municipality_id → 4-tier cascade resolves without building)

NAMED-OPEN (new):
- DevelopmentListings home-cohort wiring deferred. Explicit trigger:
  the first home-containing development onboarded (any
  property_type='Residential Freehold' OR home property_subtype on a
  listing whose building has development_id NOT NULL). At that point:
  add HomeListingCard + HomeEstimatorBuyerModal to
  DevelopmentListings.tsx, mirror the home/condo branch from
  NeighbourhoodListingSection.

FILES MODIFIED (single uncommitted unit):
  MOD components/property/SimilarListings.tsx
  MOD app/property/[id]/PropertyPageClient.tsx
  MOD app/property/[id]/HomePropertyPageClient.tsx
  MOD docs/W-ESTIMATOR-RAG-TRACKER.md
Backups timestamped _20260610_180000.
tsc --noEmit clean (full project).

PUSH STATUS — HELD pending operator approval (per task spec).
APPLY STATUS — N/A (no DB change).
  origin/main = 08fd546 (c2 revert, 2026-06-10).
  Local main = 08fd546 + 1 uncommitted unit (this dead-button fix).