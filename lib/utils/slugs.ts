// Generate property URL slug from listing data
export function generatePropertySlug(listing: {
  unparsed_address: string
  unit_number?: string
  listing_key?: string
  listing_id?: string
}): string {
  // Extract building address (remove unit number from address)
  const addressParts = listing.unparsed_address.split(',')
  const streetAddress = addressParts[0]?.trim() || ''
  
  // Slugify building address
  const buildingSlug = streetAddress
    .toLowerCase()
    .replace(/\s+/g, '-')           // spaces to hyphens
    .replace(/[^\w-]+/g, '')        // remove special chars
    .replace(/--+/g, '-')           // collapse multiple hyphens
    .replace(/^-+|-+$/g, '')        // trim hyphens
  
  // Get MLS number or fallback to listing_id
  const mlsNumber = (listing.listing_key || listing.listing_id || '').toLowerCase()
  
  // Create complete slug: address-unit-NUMBER-MLSNUMBER
  const unitPart = listing.unit_number 
    ? `unit-${listing.unit_number}-${mlsNumber}`
    : `unit-${mlsNumber}`
  
  return `${buildingSlug}-${unitPart}`
}

// Parse slug back to get unit and MLS info (for reverse lookup)
export function parsePropertySlug(slug: string): {
  unitNumber: string | null
  mlsNumber: string | null
} {
  // Extract from pattern: 183-wellington-st-w-toronto-unit-2503-c7351578
  const matches = slug.match(/-unit-(.+?)-([a-z0-9]+)$/i)
  
  if (matches) {
    return {
      unitNumber: matches[1],
      mlsNumber: matches[2].toUpperCase()
    }
  }
  
  // Fallback: address-unit-mlsnumber (no unit number)
  const fallbackMatch = slug.match(/-unit-([a-z0-9]+)$/i)
  if (fallbackMatch) {
    return {
      unitNumber: null,
      mlsNumber: fallbackMatch[1].toUpperCase()
    }
  }
  
  return { unitNumber: null, mlsNumber: null }
}
