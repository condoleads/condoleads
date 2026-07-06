// Single source of truth for property_subtype-driven code paths.
//
// Any subtype appearing in one of these arrays:
//   - renders a page (HomePropertyPage RESIDENTIAL_TYPES gate for freehold;
//     PropertyPage is un-gated for condo — arrays here scope the CONDO chip UI
//     + API predicates, not the render decision itself)
//   - is returned by the geo-listings + neighbourhood-listings API predicates
//     (via .in('property_subtype', ...))
//   - is included in the sitemap chunk count for freehold
//   - appears as a chip in the "Advanced filters" panel on Community /
//     Municipality / Area / Neighbourhood pages
//
// If you add or remove a subtype: edit ONLY THIS FILE. Every code consumer
// imports from here. Prior drift shipped twice (freehold gap closed in
// 67bb717; condo gap closed by the same-session dispatch that introduced
// this module) — the second incident triggered this single-source-of-truth
// consolidation per Rule Zero "architecture prevents new instances of the
// same class of bug."
//
// NOT SHARED WITH the SQL RPC public.get_sitemap_listings (defined in
// supabase/migrations/20260705_a_unit_2_final_sitemap_rpc_widen.sql). The
// RPC has its own literal list because Postgres cannot import a JS array.
// If you touch RESIDENTIAL_TYPES here you MUST also cut a new migration
// re-creating the RPC with the matching list. That is the one remaining
// non-mechanical sync in the system.
//
// CONDO_TYPES contains only DWELLING-SHAPED condo subtypes. Non-dwelling
// condo tails intentionally excluded from both chip UI and API predicates:
// Parking Space, Locker, Vacant Land Condo, Timeshare, Phased Condo.
// Users searching for those hit a different (non-dwelling) filter UX; the
// dwelling chip list is scoped to what a person browsing for a home cares
// about. Verified this session against DB distinct-value probe.

export const RESIDENTIAL_TYPES = [
  'Detached',
  'Semi-Detached',
  'Att/Row/Townhouse',
  'Link',
  'Duplex',
  'Triplex',
  'Fourplex',
  'Multiplex',
  'Modular Home',
  'Upper Level',
  'Lower Level',
  'Room',
  'Shared Room',
  'Rural Residential',
  'MobileTrailer',
  'Farm',
  'Store W Apt/Office',
  'Other',
  'Vacant Land',
]

export const CONDO_TYPES = [
  'Condo Apartment',
  'Condo Townhouse',
  'Co-op Apartment',
  'Common Element Condo',
  'Detached Condo',
  'Semi-Detached Condo',
  'Co-Ownership Apartment',
  'Leasehold Condo',
]
