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

// property_subtype → schema.org about @type. All source strings verified in
// mls_listings (100% populated). Fallback to generic Residence when the
// subtype does not have a schema.org mapping — avoids fabricating a type.
function aboutTypeFromSubtype(subtype: string | null | undefined): string {
  switch (subtype) {
    case 'Condo Apartment':
    case 'Common Element Condo':
    case 'Co-op Apartment':
      return 'Apartment'
    case 'Condo Townhouse':
    case 'Att/Row/Townhouse':
    case 'Semi-Detached':
    case 'Semi-Detached Condo':
    case 'Link':
      return 'House'
    case 'Detached':
    case 'Detached Condo':
      return 'SingleFamilyResidence'
    case 'Duplex':
    case 'Triplex':
    case 'Fourplex':
    case 'Multiplex':
      return 'Residence'
    default:
      return 'Residence'
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
    default:
      return null
  }
}

// Deterministic transaction_type → schema.org BusinessFunction.
function businessFunctionFromTx(tx: string | null | undefined): string | null {
  if (tx === 'For Sale') return 'https://schema.org/Sell'
  if (tx === 'For Lease') return 'https://schema.org/LeaseOut'
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

  // about — nested Residence / Apartment / House. Property @type derived
  // deterministically from property_subtype.
  const about: Record<string, unknown> = {
    '@type': aboutTypeFromSubtype(listing.property_subtype),
    address,
  }
  if (building?.building_name) about.name = building.building_name
  if (listing.bedrooms_total != null) about.numberOfBedrooms = listing.bedrooms_total
  if (listing.bathrooms_total_integer != null) {
    // Column type is numeric — normalize to a plain number without
    // fabricating precision. String forms like "1.0" cast cleanly.
    const bt = Number(listing.bathrooms_total_integer)
    if (!Number.isNaN(bt)) about.numberOfBathroomsTotal = bt
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
  const offers: Record<string, unknown> = {
    '@type': 'Offer',
  }
  if (listing.list_price != null) offers.price = listing.list_price
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
