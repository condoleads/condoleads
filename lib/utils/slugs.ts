/**
 * Parse property slug to extract MLS number
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
 * Check if slug is for a property (contains -unit-) vs building
 */
export function isPropertySlug(slug: string): boolean {
  return slug.includes('-unit-')
}

export function isBuildingSlug(slug: string): boolean {
  return !slug.includes('-unit-')
}

/**
 * Generate property slug from listing data
 * Format: /[street-number]-[street-name]-unit-[unit-number]-[mls-number]
 * Example: /101-charles-st-e-unit-2503-c7351578
 */
export function generatePropertySlug(listing: {
  unparsed_address?: string
  listing_key?: string
  unit_number?: string
}): string {
  if (!listing.listing_key) {
    return `/property/${listing.listing_key}` // fallback to old format
  }

  // Extract street address (before unit number)
  const address = listing.unparsed_address || ''
  const addressPart = address
    .split(',')[0] // Take only street address before comma
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '') // Remove special chars
  
  const unitNumber = listing.unit_number || 'unit'
  const mlsNumber = listing.listing_key.toLowerCase()
  
  return `/${addressPart}-unit-${unitNumber}-${mlsNumber}`
}
