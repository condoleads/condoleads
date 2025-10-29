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
