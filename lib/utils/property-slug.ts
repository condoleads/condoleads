// lib/utils/property-slug.ts
//
// W-CHARLIE-FINETUNE-FIX (2026-06-14) — single source of truth for the
// walliam.ca property page slug format. Lifted byte-for-byte from
// Charlie's working in-chat tile slug builder so the email + lead-page
// tiles produce the SAME urls Charlie produces (which are the only ones
// walliam.ca's property route resolves — bare-MLS 404s; descriptive slug
// returns 200, curl-verified).
//
// Original sources (verified byte-for-byte against):
//   app/charlie/components/ComparableCard.tsx:87-107  (camelCase fields)
//   app/charlie/components/ActiveListingCard.tsx:33-53 (snake_case fields)
// HOME_TYPES literal duplicated in both files at L68 / L23. Centralized
// here to kill the second duplication source.
//
// Format (homes):  {addr-kebab}-{city-kebab}-{mls_lowercase}
//                  e.g. '421-pineview-lane-pickering-e12856240'
// Format (condos): {addr-kebab}-unit-{unit}-{mls_lowercase}
//                  e.g. '15-iceboat-terrace-unit-2706-c1234567'
// Format (condos, unit missing): {addr-kebab}-unit-{mls_lowercase}
//                  Charlie's existing fallback — kept identical so tiles
//                  with no unitNumber land on the same page Charlie sends
//                  them to today.

const HOME_TYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex']

export interface PropertySlugInput {
  /** Full address, e.g. '421 Pineview Lane, Pickering, ON L1V 6X4'.
   *  Comma-split: [0]=street, [1]=city, etc. — same parsing Charlie does. */
  unparsedAddress?: string | null
  /** Optional unit number for condos. Charlie's ComparableCard reads
   *  c.unitNumber; ActiveListingCard reads l.unit_number — caller must
   *  pick the right field and pass it through here. */
  unitNumber?: string | null
  /** MLS property subtype — used ONLY to decide condo vs home format.
   *  When `path` is provided, this is ignored. */
  propertySubtype?: string | null
  /** Authoritative condo/home decider. When provided, overrides the
   *  propertySubtype check (e.g. CanonicalCompRow carries `path` but
   *  not propertySubtype — lead-page caller uses this). */
  path?: 'home' | 'condo' | null
  /** MLS listing key. Lowercased into the slug suffix. */
  listingKey?: string | null
}

/**
 * Returns a walliam.ca property page slug WITHOUT a leading slash. Callers
 * prepend either `'/'` (relative, browser resolves against current origin
 * — Charlie's in-chat pattern) or `${baseUrl}/` (absolute, server-rendered
 * — email + lead-page pattern).
 *
 * Returns `null` when there's no listingKey — the caller should silently
 * not link the tile in that case (mirrors Charlie's `if (!c.listingKey) return`
 * guard at ComparableCard.tsx:88).
 */
export function buildPropertySlug(input: PropertySlugInput): string | null {
  const listingKey = input.listingKey || null
  if (!listingKey) return null
  const mls = listingKey.toLowerCase()

  const rawAddr = (input.unparsedAddress || '').split(',')[0].trim()
  const unitStr = input.unitNumber || ''
  const withoutUnit = unitStr
    ? rawAddr.replace(new RegExp('\\s+' + unitStr + '\\s*$'), '').trim()
    : rawAddr
  const addr = withoutUnit
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  // Condo vs home decider. `path` is the canonical signal when available
  // (CanonicalCompRow caller). Fall back to propertySubtype check so the
  // existing Charlie callers (which pass propertySubtype) remain
  // byte-identical to their pre-refactor output.
  const isCondo = input.path
    ? input.path === 'condo'
    : !HOME_TYPES.includes(input.propertySubtype || '')

  const city = (input.unparsedAddress || '').split(',')[1]?.trim().split(' ')[0].toLowerCase() || ''

  if (isCondo) {
    return unitStr ? `${addr}-unit-${unitStr}-${mls}` : `${addr}-unit-${mls}`
  }
  return `${addr}-${city ? city + '-' : ''}${mls}`
}

/** Convenience wrapper: returns the leading-slash form Charlie's
 *  `window.open('/' + url, '_blank')` calls produce. Returns null when
 *  the slug is unbuildable (no listingKey). */
export function buildPropertyPath(input: PropertySlugInput): string | null {
  const slug = buildPropertySlug(input)
  return slug ? '/' + slug : null
}
