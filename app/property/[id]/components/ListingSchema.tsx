// app/property/[id]/components/ListingSchema.tsx
//
// W-MARKETING A-UNIT-2 PHASE 1 (2026-07-04): RealEstateListing JSON-LD
// for the condo listing page.
//
// SEO-scope gate: emits only when the request tenant has
// tenants.seo_enabled=true (aily today). Returns null for
// seo_enabled=false tenants (walliam) and for non-tenant hosts.
//
// Rule Zero (no fabricated fields):
//   - Every field emitted maps to a real column verified in the A-UNIT-2
//     recon (docs/W-MARKETING-TRACKER.md, SEO-FLAG BUILD SHIPPED + A-UNIT-2
//     RECON entries, 2026-07-04).
//   - country: omitted when mls_listings.country is null (VERIFIED 84.5%
//     populated — the 15.5% get their addressCountry omitted, NEVER
//     defaulted to "CA").
//   - priceCurrency: no currency column exists on mls_listings (VERIFIED
//     — list_price_unit is a sale/lease unit descriptor like "For Sale"
//     or "Month", NOT ISO 4217). Per operator rule: OMIT priceCurrency
//     rather than default. Downstream Google rich-results may flag this
//     as a warning but that is honest to the source data.
//   - geo: latitude/longitude are 0.0% populated on mls_listings
//     (VERIFIED). Never emitted.
//   - floorSize: prefers calculated_sqft (33.9% populated) as
//     QuantitativeValue.value; falls back to a bounded QuantitativeValue
//     built from living_area_range when it matches /^(\d+)-(\d+)$/
//     (93.6% populated, ~90% parseable). Ranges like "< 700" are dropped
//     rather than fabricated.
//   - addressLocality: strips the TREB district-code suffix
//     (/\s+[CWE]\d{2}$/) from city so "Toronto C10" → "Toronto".
//     Deterministic; other cities unchanged.
//
// This emitter runs on both PropertyPage (condos, mounted here) and — in a
// subsequent dispatch — HomePropertyPage. Zero new DB queries: consumes
// listing / building / largePhotosResult already fetched by the parent page.

import { isSeoEnabledTenant } from '@/lib/utils/seo-scope'

type Photo = { media_url: string | null; order_number: number | null }

interface ListingSchemaProps {
  listing: {
    id: string
    listing_key: string | null
    list_price: number | null
    standard_status: string | null
    transaction_type: string | null
    property_type: string | null
    property_subtype: string | null
    street_number: string | null
    street_name: string | null
    street_suffix: string | null
    unit_number: string | null
    unparsed_address: string | null
    city: string | null
    state_or_province: string | null
    postal_code: string | null
    country: string | null
    bedrooms_total: number | null
    bathrooms_total_integer: number | string | null
    calculated_sqft: number | null
    living_area_range: string | null
    listing_contract_date: string | null
    on_market_date: string | null
    modification_timestamp: string | null
    public_remarks: string | null
  }
  building: {
    id: string
    building_name: string | null
    canonical_address: string | null
  } | null
  photos: Photo[]
  // The canonical URL of THIS listing page. Parent page already resolves
  // it via resolveCanonicalHost() + generatePropertySlug() for the
  // metadata canonical alternate; pass it here so JSON-LD `url` matches
  // the canonical exactly (Google index-consolidation guidance).
  canonicalUrl: string
}

// property_subtype → schema.org about @type. Every source string verified
// this session against mls_listings post-btrim. Non-dwelling subtypes
// (Vacant Land, Store W Apt/Office, Other) emit `Place` — schema.org's
// honest general geographic type when the listing is not a residence. Never
// fabricate a residential @type for a non-dwelling.
function aboutTypeFromSubtype(subtype: string | null | undefined): string {
  switch (subtype) {
    case 'Condo Apartment':
    case 'Common Element Condo':
    case 'Co-op Apartment':
    case 'Co-Ownership Apartment':
    case 'Leasehold Condo':
    case 'Upper Level':
    case 'Lower Level':
      return 'Apartment'
    case 'Condo Townhouse':
    case 'Att/Row/Townhouse':
    case 'Semi-Detached':
    case 'Semi-Detached Condo':
    case 'Link':
    case 'Modular Home':
    case 'MobileTrailer':
    case 'Farm':
      return 'House'
    case 'Detached':
    case 'Detached Condo':
    case 'Rural Residential':
      return 'SingleFamilyResidence'
    case 'Duplex':
    case 'Triplex':
    case 'Fourplex':
    case 'Multiplex':
      return 'Residence'
    case 'Room':
    case 'Shared Room':
      return 'Room'
    // Non-dwelling residential-freehold subtypes: use Place, never Residence.
    case 'Vacant Land':
    case 'Store W Apt/Office':
    case 'Other':
      return 'Place'
    default:
      return 'Place'
  }
}

// Deterministic TREB district-code suffix strip. Only matches Toronto's
// C##/W##/E## trailing pattern. Other cities (Cobourg, Burlington, etc.)
// pass through unchanged.
function stripTrebSuffix(city: string): string {
  return city.replace(/\s+[CWE]\d{2}$/, '')
}

// Assemble street piece from the parts. Falls back to unparsed_address
// when structured parts are missing.
function buildStreetAddress(listing: ListingSchemaProps['listing']): string | null {
  const parts = [listing.street_number, listing.street_name, listing.street_suffix]
    .filter(p => p && String(p).trim().length > 0)
  if (parts.length === 0) return listing.unparsed_address || null
  let street = parts.join(' ')
  if (listing.unit_number && String(listing.unit_number).trim().length > 0) {
    street = street + ' #' + listing.unit_number
  }
  return street
}

// Deterministic status → schema.org ItemAvailability enum. Emits only for
// values with a clean mapping; omits (returns null) otherwise. Never
// fabricates.
function availabilityFromStatus(status: string | null | undefined): string | null {
  switch (status) {
    case 'Active':
    case 'Active Under Contract':
      return 'https://schema.org/InStock'
    case 'Pending':
    case 'Closed':
      return 'https://schema.org/SoldOut'
    // A-UNIT-2 Phase 2 (2026-07-04): Rule Zero #1 fix. Prior emitter's
    // default→null branch emitted an Offer with price + businessFunction
    // for withdrawn listings without an availability field — reads as
    // "priced, availability unspecified" when the listing is actually
    // withdrawn from market. Coverage recon this session VERIFIED ~641k
    // rows (Cancelled 432k + Expired 162k + Withdrawn 39k + Removed +
    // Delete + Incomplete) affected. Discontinued is schema.org's honest
    // enum for these. All 6 status values below are VERIFIED distinct DB
    // values (SELECT DISTINCT standard_status, this session).
    case 'Cancelled':
    case 'Expired':
    case 'Withdrawn':
    case 'Removed':
    case 'Delete':
    case 'Incomplete':
      return 'https://schema.org/Discontinued'
    default:
      return null
  }
}

// Deterministic transaction_type → schema.org BusinessFunction.
function businessFunctionFromTx(tx: string | null | undefined): string | null {
  if (tx === 'For Sale') return 'https://schema.org/Sell'
  // A-UNIT-2 Phase 2 (2026-07-04): For Sub-Lease also emits LeaseOut.
  // Sub-lease is a form of leasing out; VERIFIED distinct DB value with
  // ~348 rows across all statuses. Prior emitter returned null (OMIT),
  // which was safe but incomplete.
  if (tx === 'For Lease' || tx === 'For Sub-Lease') return 'https://schema.org/LeaseOut'
  return null
}

export default async function ListingSchema(props: ListingSchemaProps) {
  // A-UNIT-2 Phase 1 SEO-scope gate — JSON-LD is an SEO surface
  // (CLAUDE.md line 60). Returns null for seo_enabled=false tenants and
  // non-tenant hosts.
  if (!(await isSeoEnabledTenant())) return null

  const { listing, building, photos, canonicalUrl } = props

  // Address block — locality regex strip; country only when non-null.
  const address: Record<string, unknown> = { '@type': 'PostalAddress' }
  const street = buildStreetAddress(listing)
  if (street) address.streetAddress = street
  if (listing.city && listing.city.trim().length > 0) {
    address.addressLocality = stripTrebSuffix(listing.city.trim())
  }
  if (listing.state_or_province && listing.state_or_province.trim().length > 0) {
    address.addressRegion = listing.state_or_province.trim()
  }
  if (listing.postal_code && listing.postal_code.trim().length > 0) {
    address.postalCode = listing.postal_code.trim()
  }
  if (listing.country && listing.country.trim().length > 0) {
    address.addressCountry = listing.country.trim()
  }

  // about — nested type derived deterministically from property_type +
  // property_subtype. Commercial always emits `Place` (never a residential
  // type) — schema.org has no dedicated commercial-listing type; Place is
  // the honest generic geographic type. For all other property_types the
  // subtype mapping decides (dwelling → Apartment/House/etc., non-dwelling
  // freehold → Place).
  const aboutType =
    listing.property_type === 'Commercial'
      ? 'Place'
      : aboutTypeFromSubtype(listing.property_subtype)
  const about: Record<string, unknown> = {
    '@type': aboutType,
    address,
  }
  if (building?.building_name) about.name = building.building_name
  // A-UNIT-2 FINAL (2026-07-05): OMIT beds/baths when null OR 0. 0 is real
  // DB data for non-dwelling subtypes (Vacant Land etc.) but not a factual
  // count — emitting numberOfBedrooms:0 misrepresents the listing as a
  // dwelling with zero bedrooms. Same rule as list_price=0 → OMIT.
  if (listing.bedrooms_total != null && listing.bedrooms_total > 0) {
    about.numberOfBedrooms = listing.bedrooms_total
  }
  if (listing.bathrooms_total_integer != null) {
    // Column type is numeric — normalize to a plain number without
    // fabricating precision. String forms like "1.0" cast cleanly.
    const bt = Number(listing.bathrooms_total_integer)
    if (!Number.isNaN(bt) && bt > 0) about.numberOfBathroomsTotal = bt
  }
  // floorSize: prefer calculated_sqft (scalar), fall back to
  // living_area_range parsed as min/max. Ranges like "< 700" are dropped.
  if (listing.calculated_sqft != null && listing.calculated_sqft > 0) {
    about.floorSize = {
      '@type': 'QuantitativeValue',
      value: listing.calculated_sqft,
      unitCode: 'FTK',
    }
  } else if (listing.living_area_range) {
    const m = listing.living_area_range.match(/^(\d+)-(\d+)$/)
    if (m) {
      about.floorSize = {
        '@type': 'QuantitativeValue',
        minValue: Number(m[1]),
        maxValue: Number(m[2]),
        unitCode: 'FTK',
      }
    }
  }

  // Offer — price only. priceCurrency omitted (no currency column verified).
  // list_price=0 is a real DB value but not a real price (verified this
  // session: 14 Commercial-with-unit rows have list_price=0). OMIT price
  // when 0 rather than emit a fabricated zero.
  const offers: Record<string, unknown> = {
    '@type': 'Offer',
  }
  if (listing.list_price != null && listing.list_price > 0) {
    offers.price = listing.list_price
  }
  const availability = availabilityFromStatus(listing.standard_status)
  if (availability) offers.availability = availability
  const businessFunction = businessFunctionFromTx(listing.transaction_type)
  if (businessFunction) offers.businessFunction = businessFunction
  if (listing.on_market_date) offers.validFrom = listing.on_market_date

  // Images: from largePhotosResult already in scope. Ordered ascending;
  // limit to a reasonable count so the schema stays lean.
  const IMAGE_LIMIT = 8
  const images = (photos || [])
    .filter(p => !!p.media_url)
    .slice(0, IMAGE_LIMIT)
    .map(p => p.media_url as string)

  // Compose the RealEstateListing envelope.
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    url: canonicalUrl,
    about,
    offers,
  }
  if (listing.listing_key) {
    // MLS number as identifier — additionalProperty PropertyValue is the
    // Google-recommended shape when there is no dedicated schema.org
    // field for the identifier.
    schema.identifier = {
      '@type': 'PropertyValue',
      name: 'MLS Listing ID',
      value: listing.listing_key,
    }
  }
  if (listing.listing_contract_date) schema.datePosted = listing.listing_contract_date
  if (listing.modification_timestamp) schema.dateModified = listing.modification_timestamp
  if (listing.public_remarks && listing.public_remarks.trim().length > 20) {
    schema.description = listing.public_remarks.trim()
  }
  if (images.length > 0) schema.image = images

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
