## W-TENANT-TERRITORY-MODEL — agreed target model (2026-06-24 design session)

PURPOSE: the brokerage operating model for tenant/role/territory/lead distribution.
Engine (resolver + cascade + hash-split + hierarchy) is built (per W-TERRITORY-ARCH-REVIEW).
This records the AGREED model so review can find gaps = fine-tuning vs real work.

### The model (plain)
- Shared inventory (no tenant owns listings). Per-tenant ROUTING overlay resolves one agent per (tenant, context) at request time. RESOLUTION model, confirmed.
- Hierarchy: TENANT (e.g. Ovais) > AREA MANAGER > MANAGER > AGENT. Assignment flows DOWN; leads flow UP (visibility).

### Assignment vs Distribution (the "automation" we discussed)
- ASSIGNMENT = human act: give a geo/building/listing to one or more roles (cards).
- DISTRIBUTION = automatic: system hash-splits listings equally across assigned roles; anything unassigned falls through the cascade to the HOUSE ACCOUNT. Distribution is the automation — resolver does it per-request, no human per-listing.

### Granularity (specific wins)
LISTING pin > BUILDING (atomic — whole building to one role) > GEO+TYPE > AREA.
- GEO levels: area / municipality / community / neighbourhood.
- PROPERTY TYPE: homes and condos are SEPARATELY assignable at geo level ("Mississauga homes" vs "Mississauga condos" can go to different roles). [VERIFY: does card model support type-scoping today?]
- N roles share a geo+type → hash-RR equal split by listing_id (BUILT).

### House account (the mandatory catch-all)
- REGULATORY FLOOR: every public listing MUST show a LICENSED agent — cascade can never resolve to nobody.
- HOUSE ACCOUNT = one named, licensed, cards-IN role that catches everything unassigned. Chosen over floor-split (cleaner, auditable, one accountable party).
- INVARIANT: at least one licensed cards-in role must always exist per tenant. System must REFUSE any opt-out / removal that would leave no house account. Today this is implicit via tenants.default_agent_id — target: make it an ENFORCED, named invariant.

### Opt-out (two independent switches per role)
- CARDS/PUBLIC: out → not in distribution, NOT shown on public listings. Cascade skips them.
- LEADS/MANAGEMENT: in → sees & manages leads (incl. team leads flowing up). Out → (rare) no leads.
- TYPICAL case: manager/broker = CARDS-out + LEADS-in (manages, sees all, invisible to public).
- Opt-out NEVER orphans an asset — it falls through to the next role and ultimately the house account.
- A cards-out role CANNOT be the house account (house account is public by definition).

### Leads
- Route to the resolved (cards-in) agent; flow UP to manager/area-manager/tenant for visibility.
- Leads-visibility (flowing up) is INDEPENDENT of leads-as-routing-target. A cards-out/leads-in manager still SEES team leads, just isn't a routing target. Do not conflate.
- Email distribution follows the same routing + roll-up. [VERIFY against current lead/email code.]

### Status: built vs to-verify vs likely-new (to be filled by the review)
- BUILT (per arch review): resolver cascade, hash-split, hierarchy roles, default_agent_id fallback.
- TO VERIFY: property-type card granularity; lead roll-up populated + shown; license tracked as a field.
- LIKELY NEW: opt-out (cards + leads per role); house-account as enforced invariant (can't remove last licensed cards-in role); non-selling tenant.

### Queued dependency
W-AILY-RETIRE-SEED-ADMIN (re-parent + move default_agent_id to Ovais + reassign leads) intersects this — the seed admin IS Aily's current implicit house account.
