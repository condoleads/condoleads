// app/[slug]/components/BuildingSchema.tsx
//
// W-MARKETING A-UNIT-2 PHASE 1 (2026-07-04):
//
//   Rule Zero fix: line 19 previously hardcoded
//     "addressLocality": "Toronto"
//   which fabricated the locality for every non-Toronto building. Locality
//   is now sourced from a real geo join (buildings.community_id →
//   communities.municipality_id → municipalities.name) resolved in the
//   parent BuildingPage and passed here as `locality`. When null (the
//   building has no community_id, or the join yields null),
//   addressLocality is OMITTED — never falls back to "Toronto".
//
//   Field gates: yearBuilt is emitted only when `building.year_built` is
//   non-null (VERIFIED 0.0% populated at recon time — will emit only if
//   backfilled). geo remains commented (VERIFIED lat/lng 0.0% populated
//   across 9,835 buildings) — uncommenting would emit `null` values.
//
//   SEO-scope gate: entire emitter is gated by isSeoEnabledTenant()
//   (shipped e3d229f). Emits for tenants with tenants.seo_enabled=true
//   (aily today); returns null (no schema tag) for tenants with
//   seo_enabled=false and for non-tenant hosts. Multi-tenant safe by
//   construction — the SEO gate is a data-plane per-tenant capability,
//   not a code-plane brand branch.

import { Building, MLSListing } from '@/lib/types/building'
import { isSeoEnabledTenant } from '@/lib/utils/seo-scope'

interface BuildingSchemaProps {
  building: Building
  activeSales: MLSListing[]
  activeRentals: MLSListing[]
  avgPrice: number
  // A-UNIT-2 Phase 1: real locality resolved by parent via
  // buildings.community_id → communities.municipality_id → municipalities.name.
  // null when the building has no community_id or the join yields nothing —
  // in that case addressLocality is omitted (Rule Zero: never fabricate).
  locality?: string | null
}

export default async function BuildingSchema({
  building,
  activeSales,
  activeRentals,
  avgPrice,
  locality,
}: BuildingSchemaProps) {
  // A-UNIT-2 Phase 1 SEO-scope gate. JSON-LD is an SEO surface (per
  // CLAUDE.md line 60). Only tenants with tenants.seo_enabled=true emit
  // structured data.
  if (!(await isSeoEnabledTenant())) return null

  const address: Record<string, unknown> = {
    '@type': 'PostalAddress',
    streetAddress: building.canonical_address,
  }
  // Locality: emit only when the geo join produced a real municipality
  // name. Never fall back to a hardcoded string.
  if (locality && locality.trim().length > 0) {
    address.addressLocality = locality
  }
  // addressRegion / addressCountry: buildings.canonical_address is a
  // free-form string; the buildings table has NO state_or_province or
  // country column (verified 28-column schema). Omit rather than
  // fabricate — mls_listings-level Region/Country flow via the
  // RealEstateListing schema on individual listing pages.

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ApartmentComplex',
    name: building.building_name,
    address,
    numberOfUnits: building.total_units,
  }
  // A-UNIT-2 FINAL (2026-07-05): yearBuilt DROPPED — buildings.year_built is
  // 0.0% populated across 9,835 rows (VERIFIED). The field never emitted
  // anyway (null-gated), so removing it is a code-cleanup, not a behavior
  // change. Re-add if a backfill lands.
  // geo: buildings.latitude / longitude verified 0.0% populated (0/9835).
  // Left commented so future backfill can uncomment without a code change:
  // if (building.latitude != null && building.longitude != null) {
  //   schema.geo = {
  //     '@type': 'GeoCoordinates',
  //     latitude: building.latitude,
  //     longitude: building.longitude,
  //   }
  // }
  if (activeSales.length > 0) {
    schema.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'CAD',
      lowPrice: Math.min(...activeSales.map(l => l.list_price)),
      highPrice: Math.max(...activeSales.map(l => l.list_price)),
      offerCount: activeSales.length,
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
