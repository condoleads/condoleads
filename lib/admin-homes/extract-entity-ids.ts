/**
 * extract-entity-ids
 *
 * Single source of truth for resolving a lead's entity context (building /
 * listing / 4 geo levels) from either a request body or a chat session row.
 * Used by lead-write routes in W-SOURCE-AXIS T4-h to ensure that, when the
 * data is present, the lead row stores the resolved entity IDs.
 *
 * Multi-tenant safe: this module makes no tenant-specific assumptions.
 */

export interface EntityIds {
  building_id: string | null;
  listing_id: string | null;
  area_id: string | null;
  municipality_id: string | null;
  community_id: string | null;
  neighbourhood_id: string | null;
}

const NULL_IDS: EntityIds = {
  building_id: null,
  listing_id: null,
  area_id: null,
  municipality_id: null,
  community_id: null,
  neighbourhood_id: null,
};

function nullIfEmpty(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Extract entity IDs from a request body. Each field is independently optional.
 */
export function entityIdsFromBody(body: any): EntityIds {
  if (!body || typeof body !== 'object') return { ...NULL_IDS };
  return {
    building_id:      nullIfEmpty(body.building_id),
    listing_id:       nullIfEmpty(body.listing_id),
    area_id:          nullIfEmpty(body.area_id),
    municipality_id:  nullIfEmpty(body.municipality_id),
    community_id:     nullIfEmpty(body.community_id),
    neighbourhood_id: nullIfEmpty(body.neighbourhood_id),
  };
}

/**
 * Extract entity IDs from a chat-session row using current_page_type /
 * current_page_id. Recognised values: 'building', 'listing', 'property',
 * 'area', 'municipality', 'community', 'neighbourhood'. 'property' maps
 * to listing_id as a synonym for 'listing' on the public site.
 */
export function entityIdsFromSession(session: any): EntityIds {
  if (!session) return { ...NULL_IDS };
  const t: unknown = session.current_page_type;
  const id = nullIfEmpty(session.current_page_id);
  if (!id || typeof t !== 'string') return { ...NULL_IDS };
  return {
    building_id:      t === 'building' ? id : null,
    listing_id:       (t === 'listing' || t === 'property') ? id : null,
    area_id:          t === 'area' ? id : null,
    municipality_id:  t === 'municipality' ? id : null,
    community_id:     t === 'community' ? id : null,
    neighbourhood_id: t === 'neighbourhood' ? id : null,
  };
}

/**
 * Combine body and session sources, preferring body when both are present.
 */
export function entityIdsFromBodyAndSession(body: any, session: any): EntityIds {
  const b = entityIdsFromBody(body);
  const s = entityIdsFromSession(session);
  return {
    building_id:      b.building_id      ?? s.building_id,
    listing_id:       b.listing_id       ?? s.listing_id,
    area_id:          b.area_id          ?? s.area_id,
    municipality_id:  b.municipality_id  ?? s.municipality_id,
    community_id:     b.community_id     ?? s.community_id,
    neighbourhood_id: b.neighbourhood_id ?? s.neighbourhood_id,
  };
}
