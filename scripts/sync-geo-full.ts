import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// scripts/sync-geo-full.ts
// Weekly geo-driven full sync. Safety-net foundation for the daily incrementals.
//
// PER MUNICIPALITY (all 500 munis with area_id, or a subset via GEO_FULL_MUNI_FILTER):
//   a. Pull all residential listings from PropTx: City eq '<muni>' AND
//      ModificationTimestamp gt <now - GEO_FULL_LOOKBACK_DAYS>. Both Freehold
//      and Condo & Other. Commercial EXCLUDED by design.
//   b. Upsert on listing_key (created_at absent from payload → INSERT gets fresh,
//      UPDATE preserves; Cancelled/Withdrawn statuses ride through the standard
//      UPSERT path — no Filter-4 discard; NO delete).
//   c. Assign area_id / municipality_id / community_id per listing. area/muni
//      come from the outer iteration (this muni). community_id resolved from
//      each listing's CityRegion via the existing loadCommunityMap lookup.
//   d. Building attachment (linker) — INTENTIONALLY OMITTED IN v1. The existing
//      link_listings_to_building RPC uses street_word prefix matching which has
//      the same first-word substring collision the phantom cleanup exposed
//      (e.g., street_word='St' matches 'St Clair', 'St Joseph', 'Steeple', ...).
//      Adding it without a tighter matcher risks re-creating the hijack pattern
//      this session just cleaned up. Deferred to Phase 2 with a stricter matcher.
//   e. Cursor commit — writeHomesSyncHistory per completed muni. Resumable: a
//      kill mid-run resumes from the same muni list next invocation; already-
//      completed munis' most-recent sync_history rows show completed, so
//      subsequent daily incremental picks up from those cursors as usual.
//
// Env vars:
//   GEO_FULL_LOOKBACK_DAYS  default 30. For a truly-full pass set to 3650.
//   GEO_FULL_MUNI_FILTER    comma-separated muni names; if set, only those run.
//
// CONSTRAINTS PRESERVED (this file does not touch any of them):
// - VOW token only via existing proptx-client (PROPTX_VOW_TOKEN)
// - City filter: exact ('City eq X') — same pattern as sync-homes-incremental
// - created_at insert-only (via mapCompleteDLAFields in homes-save)
// - Cancelled/Withdrawn flow through (no Filter-4)
// - NO DELETE — homes-save uses upsert only
// - listing_key UNIQUE = onConflict target
// - Row count NEVER decreases

import { supabase } from './lib/supabase-client';
import { validateConfig, fetchPaginatedListings, fetchEnhancedDataForHomes } from './lib/proptx-client';
import { saveHomesListings } from './lib/homes-save';
import { log, warn, error, writeHomesSyncHistory } from './lib/sync-logger';

const TAG = 'GEO-FULL';
const LOOKBACK_DAYS = parseInt(process.env.GEO_FULL_LOOKBACK_DAYS || '30', 10);
const MUNI_FILTER = process.env.GEO_FULL_MUNI_FILTER;

interface Muni { id: string; name: string; areaId: string; }
interface MuniResult {
  name: string;
  pulled: number;
  saved: number;
  media: number;
  rooms: number;
  durationSec: number;
  ok: boolean;
  error?: string;
}

async function runOneMunicipality(muni: Muni, triggeredBy: string): Promise<MuniResult> {
  const started = new Date();
  const cursorMs = Date.now() - LOOKBACK_DAYS * 86400_000;
  const cursorISO = new Date(cursorMs).toISOString();
  const cityFilter = `City eq '${muni.name}'`;
  const timeFilter = `ModificationTimestamp gt ${cursorISO}`;
  const ptFilters = [
    "PropertyType eq 'Residential Freehold'",
    "PropertyType eq 'Residential Condo & Other'"
  ];

  let allListings: any[] = [];
  for (const ptf of ptFilters) {
    const filter = `${ptf} and ${cityFilter} and ${timeFilter}`;
    try {
      const listings = await fetchPaginatedListings(filter);
      log(TAG, `  ${muni.name}: ${ptf.split("'")[1]} → ${listings.length} listings`);
      allListings.push(...listings);
    } catch (e: any) {
      if (e.message?.startsWith('AUTH_FAILURE')) throw e;
      warn(TAG, `  ${muni.name}: ${ptf.split("'")[1]} fetch failed — ${e.message}`);
    }
  }

  // Deduplicate by ListingKey (condo/freehold overlap shouldn't happen but be safe)
  const seen = new Set<string>();
  const unique = allListings.filter(l => {
    const key = l.ListingKey;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) {
    const durationSec = (Date.now() - started.getTime()) / 1000;
    log(TAG, `  ${muni.name}: no listings modified in the last ${LOOKBACK_DAYS} days`);
    await writeHomesSyncHistory({
      municipalityId: muni.id,
      municipalityName: muni.name,
      propertyType: 'All Residential (geo-full)',
      startedAt: started,
      listingsFound: 0,
      listingsCreated: 0,
      listingsSkipped: 0,
      mediaSaved: 0,
      roomsSaved: 0,
      openHousesSaved: 0,
      triggeredBy,
      status: 'completed',
    });
    return { name: muni.name, pulled: 0, saved: 0, media: 0, rooms: 0, durationSec, ok: true };
  }

  await fetchEnhancedDataForHomes(unique);
  log(TAG, `  ${muni.name}: enhanced data fetched for ${unique.length} listings`);

  const result = await saveHomesListings(unique, muni.id, muni.areaId);
  const durationSec = (Date.now() - started.getTime()) / 1000;

  await writeHomesSyncHistory({
    municipalityId: muni.id,
    municipalityName: muni.name,
    propertyType: 'All Residential (geo-full)',
    startedAt: started,
    listingsFound: unique.length,
    listingsCreated: result.stats?.listings || 0,
    listingsSkipped: result.stats?.skipped || 0,
    mediaSaved: result.stats?.media || 0,
    roomsSaved: result.stats?.rooms || 0,
    openHousesSaved: result.stats?.openHouses || 0,
    triggeredBy,
    status: result.success ? 'completed' : 'failed',
    errorDetails: result.error,
  });

  return {
    name: muni.name,
    pulled: unique.length,
    saved: result.stats?.listings || 0,
    media: result.stats?.media || 0,
    rooms: result.stats?.rooms || 0,
    durationSec,
    ok: !!result.success,
    error: result.error,
  };
}

async function main() {
  validateConfig();
  const triggeredBy = process.env.GITHUB_ACTIONS ? 'github-geo-full' : 'manual-geo-full';

  log(TAG, '========================================');
  log(TAG, `GEO-FULL SYNC — LOOKBACK_DAYS=${LOOKBACK_DAYS}`);
  if (MUNI_FILTER) log(TAG, `MUNI_FILTER=${MUNI_FILTER}`);
  log(TAG, '========================================');

  const { data: allMunis, error: mErr } = await supabase
    .from('municipalities')
    .select('id, name, area_id')
    .not('area_id', 'is', null)
    .order('name')
    .limit(2000);

  if (mErr || !allMunis) {
    error(TAG, `Failed to load municipalities: ${mErr?.message || 'empty'}`);
    process.exit(1);
  }

  let munis: Muni[] = allMunis.map(m => ({ id: m.id, name: m.name, areaId: m.area_id }));

  if (MUNI_FILTER) {
    const allow = new Set(MUNI_FILTER.split(',').map(s => s.trim()).filter(Boolean));
    munis = munis.filter(m => allow.has(m.name));
    log(TAG, `Filtered to ${munis.length} munis: ${munis.map(m => m.name).join(', ')}`);
  }

  log(TAG, `Processing ${munis.length} municipalities`);

  const results = { success: 0, failed: 0, skipped: 0 };
  const perMuni: MuniResult[] = [];
  const t0 = Date.now();

  for (let i = 0; i < munis.length; i++) {
    const muni = munis[i];
    log(TAG, `--- ${muni.name} (${i + 1}/${munis.length}) ---`);
    try {
      const r = await runOneMunicipality(muni, triggeredBy);
      perMuni.push(r);
      if (!r.ok) results.failed++;
      else if (r.pulled === 0) results.skipped++;
      else results.success++;
    } catch (e: any) {
      if (e.message?.startsWith('AUTH_FAILURE')) {
        error(TAG, `Auth failure — aborting: ${e.message}`);
        throw e;
      }
      error(TAG, `${muni.name}: ${e.message}`);
      results.failed++;
      perMuni.push({ name: muni.name, pulled: 0, saved: 0, media: 0, rooms: 0, durationSec: 0, ok: false, error: e.message });
    }
  }

  const totalSec = (Date.now() - t0) / 1000;
  log(TAG, '');
  log(TAG, '========================================');
  log(TAG, `GEO-FULL COMPLETE in ${(totalSec / 60).toFixed(1)} min`);
  log(TAG, `Munis: ${results.success} success | ${results.failed} failed | ${results.skipped} no changes`);
  log(TAG, `Total pulled: ${perMuni.reduce((s, r) => s + r.pulled, 0)} listings`);
  log(TAG, `Total saved : ${perMuni.reduce((s, r) => s + r.saved, 0)} listings`);
  log(TAG, `Total media : ${perMuni.reduce((s, r) => s + r.media, 0)} media rows`);
  log(TAG, `Total rooms : ${perMuni.reduce((s, r) => s + r.rooms, 0)} room rows`);
  log(TAG, '========================================');
  console.log(JSON.stringify({ LOOKBACK_DAYS, results, totalSec, perMuni }, null, 2));
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
