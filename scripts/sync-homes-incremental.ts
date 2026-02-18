import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// scripts/sync-homes-incremental.ts
// Standalone homes incremental sync for GitHub Actions
// Source: Extracted from app/api/admin-homes/incremental-sync/route.ts
// Changes: No Next.js, no SSE streaming, console logging, no timeout
// Safety: upsert on listing_key, never touches building_id, trigger_protect_building_id active

import { supabase } from './lib/supabase-client';
import { validateConfig, fetchPaginatedListings, fetchEnhancedDataForHomes } from './lib/proptx-client';
import { saveHomesListings } from './lib/homes-save';
import { log, warn, error, writeHomesSyncHistory } from './lib/sync-logger';

const TAG = 'HOMES';

interface MuniEntry {
  id: string;
  name: string;
  areaId: string;
  lastSync: string;
}

// =====================================================
// MAIN ENTRY POINT
// =====================================================

export async function runHomesIncremental(triggeredBy = 'github-nightly'): Promise<{
  success: number;
  failed: number;
  skipped: number;
}> {
  const results = { success: 0, failed: 0, skipped: 0 };

  try {
    validateConfig();

    // Auto mode: find ALL municipalities with at least one completed sync
    log(TAG, 'Finding municipalities with previous syncs...');

    const { data: synced, error: syncErr } = await supabase
      .from('sync_history')
      .select('municipality_id, municipality_name, property_type, completed_at')
      .eq('sync_status', 'completed')
      .order('completed_at', { ascending: false });

    if (syncErr || !synced || synced.length === 0) {
      error(TAG, 'No completed syncs found. Run full sync first.');
      return results;
    }

    // Get latest sync per municipality+propertyType combo
    const latestMap = new Map<string, { id: string; name: string; propertyType: string; lastSync: string }>();
    for (const s of synced) {
      if (!s.municipality_id || !s.municipality_name) continue;
      const key = s.municipality_id + '|' + s.property_type;
      if (!latestMap.has(key)) {
        latestMap.set(key, {
          id: s.municipality_id,
          name: s.municipality_name,
          propertyType: s.property_type,
          lastSync: s.completed_at,
        });
      }
    }

    // Get area_ids for all municipalities
    const muniIds = [...new Set([...latestMap.values()].map(m => m.id))];
    const { data: muniData } = await supabase
      .from('municipalities')
      .select('id, area_id')
      .in('id', muniIds);
    const areaMap = new Map((muniData || []).map(m => [m.id, m.area_id]));

    // Build municipality list â€” one entry per unique municipality
    // Use earliest lastSync across property types so we don't miss anything
    const muniMap = new Map<string, MuniEntry>();
    for (const entry of latestMap.values()) {
      const existing = muniMap.get(entry.id);
      if (!existing || new Date(entry.lastSync) < new Date(existing.lastSync)) {
        muniMap.set(entry.id, {
          id: entry.id,
          name: entry.name,
          areaId: areaMap.get(entry.id) || '',
          lastSync: entry.lastSync,
        });
      }
    }

    const municipalities = [...muniMap.values()].filter(m => m.areaId);
    log(TAG, `Found ${municipalities.length} municipalities to check for updates`);

    // Process each municipality sequentially
    for (let idx = 0; idx < municipalities.length; idx++) {
      const muni = municipalities[idx];
      const muniStart = new Date();

      try {
        log(TAG, `--- ${muni.name} (${idx + 1}/${municipalities.length}) since ${new Date(muni.lastSync).toLocaleDateString()} ---`);

        // Build filter: all listings modified since last sync
        const sinceISO = new Date(muni.lastSync).toISOString();
        const cityFilter = `City eq '${muni.name}'`;
        const timeFilter = `ModificationTimestamp gt ${sinceISO}`;

        // Query both property types
        const ptFilters = [
          "PropertyType eq 'Residential Freehold'",
          "PropertyType eq 'Residential Condo & Other'"
        ];

        let muniListings: any[] = [];

        for (const ptf of ptFilters) {
          const filter = `${ptf} and ${cityFilter} and ${timeFilter}`;
          log(TAG, `  Querying: ${ptf.split("'")[1]}...`);
          const listings = await fetchPaginatedListings(filter);
          log(TAG, `  Found ${listings.length} modified listings`);
          muniListings.push(...listings);
        }

        // Deduplicate by ListingKey
        const seen = new Set<string>();
        const unique = muniListings.filter(l => {
          const key = l.ListingKey || `${l.StreetNumber}-${l.StreetName}-${l.MlsStatus}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (unique.length === 0) {
          log(TAG, `${muni.name}: No changes since last sync`);
          results.skipped++;
          continue;
        }

        log(TAG, `${muni.name}: ${unique.length} modified listings â€” fetching enhanced data...`);
        await fetchEnhancedDataForHomes(unique);

        log(TAG, `${muni.name}: Saving to database...`);
        const result = await saveHomesListings(unique, muni.id, muni.areaId);

        if (result.success && result.stats) {
          log(TAG, `${muni.name}: âœ… ${result.stats.listings} listings, ${result.stats.media} media, ${result.stats.rooms} rooms`);
          results.success++;

          // Write sync_history record
          await writeHomesSyncHistory({
            municipalityId: muni.id,
            municipalityName: muni.name,
            propertyType: 'All Residential',
            startedAt: muniStart,
            listingsFound: unique.length,
            listingsCreated: result.stats.listings,
            listingsSkipped: result.stats.skipped,
            mediaSaved: result.stats.media,
            roomsSaved: result.stats.rooms,
            openHousesSaved: result.stats.openHouses,
            triggeredBy,
            status: 'completed',
          });
        } else {
          warn(TAG, `${muni.name}: Error â€” ${result.error || 'unknown'}`);
          results.failed++;

          await writeHomesSyncHistory({
            municipalityId: muni.id,
            municipalityName: muni.name,
            propertyType: 'All Residential',
            startedAt: muniStart,
            listingsFound: unique.length,
            listingsCreated: 0,
            listingsSkipped: unique.length,
            mediaSaved: 0,
            roomsSaved: 0,
            openHousesSaved: 0,
            triggeredBy,
            status: 'failed',
            errorDetails: result.error,
          });
        }

      } catch (err: any) {
        // Auth failures should abort the entire run
        if (err.message?.startsWith('AUTH_FAILURE')) {
          error(TAG, `Auth failure â€” aborting entire homes sync: ${err.message}`);
          throw err;
        }

        error(TAG, `${muni.name}: ${err.message}`);
        results.failed++;

        await writeHomesSyncHistory({
          municipalityId: muni.id,
          municipalityName: muni.name,
          propertyType: 'All Residential',
          startedAt: muniStart,
          listingsFound: 0,
          listingsCreated: 0,
          listingsSkipped: 0,
          mediaSaved: 0,
          roomsSaved: 0,
          openHousesSaved: 0,
          triggeredBy,
          status: 'failed',
          errorDetails: err.message,
        });
      }
    }

  } catch (err: any) {
    // Top-level catch: auth failures or config errors
    error(TAG, `Fatal error: ${err.message}`);
    throw err; // Let the orchestrator handle this
  }

  log(TAG, `Complete: ${results.success} success, ${results.failed} failed, ${results.skipped} no changes`);
  return results;
}

// =====================================================
// STANDALONE EXECUTION (for local testing)
// Usage: npx tsx scripts/sync-homes-incremental.ts
// =====================================================

if (require.main === module) {
  runHomesIncremental('github-manual')
    .then(results => {
      console.log('\n=== HOMES INCREMENTAL RESULTS ===');
      console.log(JSON.stringify(results, null, 2));
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('FATAL:', err.message);
      process.exit(1);
    });
}

