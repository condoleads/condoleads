/**
 * Parse condo property slug to extract MLS number
 * Example: "101-charles-st-e-unit-2503-c7351578" -> "C7351578"
 */
export function parsePropertySlug(slug: string): { mlsNumber: string | null } {
  if (!slug.includes('-unit-')) {
    return { mlsNumber: null }
  }
  
  const parts = slug.split('-')
  const mlsNumber = parts[parts.length - 1]
  
  return { mlsNumber: mlsNumber.toUpperCase() }
}

/**
 * Check if slug is for a condo property (contains -unit-) vs building
 */
export function isPropertySlug(slug: string): boolean {
  return slug.includes('-unit-')
}

export function isBuildingSlug(slug: string): boolean {
  return !slug.includes('-unit-') && !isHomePropertySlug(slug)
}

/**
 * Generate condo property slug from listing data
 * Format: /[building-slug]-unit-[unit-number]-[mls-number]
 * Example: /liberty-market-lofts-5-hanna-ave-toronto-unit-301-c12431082
 */
export function generatePropertySlug(
  listing: {
    unparsed_address?: string | null
    listing_key?: string | null
    unit_number?: string | null
  },
  buildingSlug?: string
): string {
  if (!listing.listing_key) {
    return `/property/${listing.listing_key}` // fallback to old format
  }

  const unitNumber = listing.unit_number || 'unit'
  const mlsNumber = listing.listing_key.toLowerCase()

  // If buildingSlug provided, use it for consistent URLs
  if (buildingSlug) {
    return `/${buildingSlug}-unit-${unitNumber}-${mlsNumber}`
  }

  // Fallback: Extract street address (before unit number)
  const address = listing.unparsed_address || ''
  const addressPart = address
    .split(',')[0] // Take only street address before comma
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '') // Remove special chars

  return `/${addressPart}-unit-${unitNumber}-${mlsNumber}`
}

// ===== HOME PROPERTY SLUGS =====

/**
 * MLS number pattern: starts with letter(s) followed by digits
 * Examples: W12569682, C7351578, E12345678
 */
const MLS_PATTERN = /^[a-zA-Z]\d{5,}$/

/**
 * Check if slug is for a home property (no -unit-, ends with MLS number)
 * Example: "123-main-street-burlington-w12569682" -> true
 * Example: "burlington" -> false
 * Example: "admirals-walk-5250-lakeshore-road-burlington" -> false
 */
export function isHomePropertySlug(slug: string): boolean {
  // Must NOT contain -unit- (that's a condo)
  if (slug.includes('-unit-')) return false

  // Must have at least 3 segments (address parts + mls)
  const parts = slug.split('-')
  if (parts.length < 3) return false

  // Last segment must match MLS pattern
  const lastPart = parts[parts.length - 1]
  return MLS_PATTERN.test(lastPart)
}

/**
 * Parse home property slug to extract MLS number
 * Example: "123-main-street-burlington-w12569682" -> "W12569682"
 */
export function parseHomePropertySlug(slug: string): { mlsNumber: string | null } {
  const parts = slug.split('-')
  const lastPart = parts[parts.length - 1]

  if (MLS_PATTERN.test(lastPart)) {
    return { mlsNumber: lastPart.toUpperCase() }
  }

  return { mlsNumber: null }
}

/**
 * Generate home property slug from listing data
 * Format: /[street-number]-[street-name]-[city]-[mls-number]
 * Example: /123-main-street-burlington-w12569682
 */
export function generateHomePropertySlug(
  listing: {
    unparsed_address?: string | null
    listing_key?: string | null
    street_number?: string | null
    street_name?: string | null
  }
): string {
  if (!listing.listing_key) {
    return `/property/${listing.listing_key}`
  }

  const mlsNumber = listing.listing_key.toLowerCase()

  // Use unparsed_address for the most complete info
  const address = listing.unparsed_address || ''

  // Extract street portion (before first comma) and city (after first comma)
  const parts = address.split(',').map(p => p.trim())
  const streetPart = parts[0] || ''
  // City is typically the second part: "Burlington" from "123 Main St, Burlington, ON L7L 3G9"
  const cityPart = parts[1] || ''

  const streetSlug = streetPart
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const citySlug = cityPart
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (streetSlug && citySlug) {
    return `/${streetSlug}-${citySlug}-${mlsNumber}`
  }

  if (streetSlug) {
    return `/${streetSlug}-${mlsNumber}`
  }

  // Absolute fallback
  return `/home-${mlsNumber}`
}