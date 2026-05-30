// lib/utils/geo-diff.ts
//
// Geo-diff utility for the Landing 2 sync hooks. Used by the homes + building
// sync save layers to decide which upserted listings need a call to
// reresolve_listings_in_set:
//
//   Event 5 (resolve-at-insert): row did not exist pre-upsert -> include.
//   Event 6 (geo-change re-resolve): row existed pre-upsert AND any of the
//     four geo columns changed -> include.
//   No-op: row existed AND geo unchanged -> skip (saves an RPC round trip;
//     the function's sticky guard would no-op on it anyway).
//
// Source-of-truth fields per Landing 2 plan section 8:
//   area_id, municipality_id, community_id, building_id.
//   neighbourhood_id is INTENTIONALLY OMITTED -- mls_listings has no such
//   column (see F-NEIGHBOURHOOD-NOT-ON-MLS-LISTINGS in PART 5).
//
// Explicit column allow-list per CLAUDE.md: this module's readPreviousGeo
// SELECTs only id + listing_key + the 4 geo columns. Never SELECT *.
//
// The module is framework-agnostic. Imported from Next.js routes via
// '@/lib/utils/geo-diff' and from CLI scripts via '../../lib/utils/geo-diff'.

import type { SupabaseClient } from '@supabase/supabase-js';

export type GeoCols = {
  area_id:         string | null;
  municipality_id: string | null;
  community_id:    string | null;
  building_id:     string | null;
};

export type ListingRow = GeoCols & {
  id:          string;
  listing_key: string;
};

/**
 * Read the pre-upsert geo state for a batch of listing_keys. Returns a Map
 * keyed by listing_key so the caller can look up each upserted row's prior
 * state efficiently. Returns an empty Map if listingKeys is empty or the
 * SELECT failed (the caller can degrade gracefully -> treat all upserted
 * rows as Event 5 candidates; sticky guard handles unchanged ones).
 */
export async function readPreviousGeo(
  supabase: SupabaseClient<any, any, any>,
  listingKeys: string[]
): Promise<Map<string, ListingRow>> {
  if (listingKeys.length === 0) return new Map();
  const { data, error } = await supabase
    .from('mls_listings')
    .select('id, listing_key, area_id, municipality_id, community_id, building_id')
    .in('listing_key', listingKeys);
  if (error || !data) return new Map();
  const map = new Map<string, ListingRow>();
  for (const row of data as ListingRow[]) {
    if (row.listing_key) map.set(row.listing_key, row);
  }
  return map;
}

/**
 * Compare two GeoCols snapshots. Returns true if ANY of the 4 columns
 * differ. NULL-vs-NULL comparisons are equal; NULL-vs-set is a difference.
 */
export function geoChanged(a: GeoCols, b: GeoCols): boolean {
  return a.area_id         !== b.area_id
      || a.municipality_id !== b.municipality_id
      || a.community_id    !== b.community_id
      || a.building_id     !== b.building_id;
}

/**
 * Decide which upserted ids need a reresolve call:
 *   - row didn't exist pre-upsert (no previousByKey entry) -> Event 5, include
 *   - row existed AND geo differs -> Event 6, include
 *   - row existed AND geo unchanged -> skip
 *
 * Inputs: the rows returned by .upsert(...).select() AND a map of pre-upsert
 * state keyed by listing_key (from readPreviousGeo). Both inputs are produced
 * by the sync save layer; this function is pure.
 */
export function collectIdsForResolve(opts: {
  upsertedRows: ListingRow[];
  previousByKey: Map<string, ListingRow>;
}): string[] {
  const out: string[] = [];
  for (const row of opts.upsertedRows) {
    if (!row || !row.id) continue;
    const prev = opts.previousByKey.get(row.listing_key);
    if (!prev) {
      out.push(row.id);
    } else if (geoChanged(prev, row)) {
      out.push(row.id);
    }
  }
  return out;
}
