// scripts/full-sync-homes.ts
// Phase 6: Full MLS sync — downloads ALL listings for municipalities from PropTx
// Source: app/api/admin-homes/parallel-sync/route.ts (extracted, no Next.js/SSE)
// CLI: npx tsx scripts/full-sync-homes.ts --area=Toronto --type=both --concurrency=3
// GitHub Actions: triggered via .github/workflows/full-sync.yml

import { supabase } from './lib/supabase-client';
import {
  validateConfig,
  fetchPaginatedListings,
  fetchEnhancedDataForHomes,
  delay,
} from './lib/proptx-client';
import { saveHomesListings } from './lib/homes-save';
import { log, warn, error, writeHomesSyncHistory } from './lib/sync-logger';

const TAG = 'FULL-SYNC';
const CHUNK_SIZE = 200;

// ============================================
// CLI ARGUMENT PARSING
// ============================================
function parseArgs(): { area: string; propertyType: 'freehold' | 'condo' | 'both'; concurrency: number } {
  const args = process.argv.slice(2);
  let area = 'all';
  let propertyType: 'freehold' | 'condo' | 'both' = 'both';
  let concurrency = 3;

  for (const arg of args) {
    if (arg.startsWith('--area=')) area = arg.split('=')[1];
    if (arg.startsWith('--type=')) {
      const val = arg.split('=')[1];
      if (val === 'freehold' || val === 'condo' || val === 'both') propertyType = val;
    }
    if (arg.startsWith('--concurrency=')) concurrency = Math.min(Math.max(parseInt(arg.split('=')[1]) || 3, 1), 10);
  }

  return { area, propertyType, concurrency };
}

// ============================================
// CONCURRENCY LIMITER
// ============================================
class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;
  constructor(private max: number) {}
  async acquire(): Promise<void> {
    if (this.running < this.max) { this.running++; return; }
    return new Promise<void>(resolve => this.queue.push(resolve));
  }
  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) { this.running++; next(); }
  }
}

// ============================================
// SKIP ALREADY-SYNCED MUNICIPALITIES
// ============================================
async function getAlreadySyncedMuniIds(propertyType: 'freehold' | 'condo' | 'both'): Promise<Set<string>> {
  // Find municipalities that have at least one completed full sync for the relevant property types
  const ptKeys: string[] = [];
  if (propertyType === 'both' || propertyType === 'freehold') ptKeys.push('Residential Freehold');
  if (propertyType === 'both' || propertyType === 'condo') ptKeys.push('Residential Condo & Other');

  const { data } = await supabase
    .from('sync_history')
    .select('municipality_id, property_type')
    .eq('sync_status', 'completed')
    .in('property_type', ptKeys)
    .gt('listings_found', 0);

  if (!data || data.length === 0) return new Set();

  if (propertyType === 'both') {
    // Only skip if BOTH freehold and condo are completed for this municipality
    const freeholdDone = new Set(data.filter(r => r.property_type === 'Residential Freehold').map(r => r.municipality_id));
    const condoDone = new Set(data.filter(r => r.property_type === 'Residential Condo & Other').map(r => r.municipality_id));
    const bothDone = new Set<string>();
    freeholdDone.forEach(id => { if (condoDone.has(id)) bothDone.add(id); });
    return bothDone;
  }

  return new Set(data.map(r => r.municipality_id));
}

// ============================================
// FETCH MUNICIPALITIES FROM DB
// ============================================
async function getMunicipalities(areaFilter: string): Promise<{ id: string; name: string; areaId: string; areaName: string }[]> {
  let query = supabase
    .from('municipalities')
    .select('id, name, area_id, treb_areas!inner(id, name)')
    .order('name');

  if (areaFilter !== 'all') {
    // Look up area ID first
    const { data: areaData } = await supabase
      .from('treb_areas')
      .select('id')
      .ilike('name', areaFilter)
      .single();

    if (!areaData) {
      error(TAG, `Area "${areaFilter}" not found in treb_areas`);
      process.exit(1);
    }
    query = query.eq('area_id', areaData.id);
  }

  const { data, error: err } = await query;
  if (err) { error(TAG, `Failed to fetch municipalities: ${err.message}`); process.exit(1); }

  return (data || []).map((m: any) => ({
    id: m.id,
    name: m.name,
    areaId: m.area_id,
    areaName: m.treb_areas?.name || 'Unknown',
  }));
}

// ============================================
// HIERARCHY COUNT UPDATE
// ============================================
async function updateHierarchyCounts(municipalityId: string, areaId: string): Promise<void> {
  const allResTypes = ['Residential Freehold', 'Residential Condo & Other'];

  const { count: muniCount } = await supabase
    .from('mls_listings').select('id', { count: 'exact', head: true })
    .eq('municipality_id', municipalityId).in('property_type', allResTypes);
  await supabase.from('municipalities').update({ homes_count: muniCount || 0 }).eq('id', municipalityId);

  const { data: communities } = await supabase.from('communities').select('id').eq('municipality_id', municipalityId);
  for (const comm of communities || []) {
    const { count: commCount } = await supabase
      .from('mls_listings').select('id', { count: 'exact', head: true })
      .eq('community_id', comm.id).in('property_type', allResTypes);
    await supabase.from('communities').update({ homes_count: commCount || 0 }).eq('id', comm.id);
  }

  const { count: areaCount } = await supabase
    .from('mls_listings').select('id', { count: 'exact', head: true })
    .eq('area_id', areaId).in('property_type', allResTypes);
  await supabase.from('treb_areas').update({ homes_count: areaCount || 0 }).eq('id', areaId);
}

// ============================================
// SYNC ONE MUNICIPALITY (all statuses)
// ============================================
async function syncOneMunicipality(
  muni: { id: string; name: string; areaId: string; areaName: string },
  propertyType: 'freehold' | 'condo' | 'both',
  muniIndex: number,
  totalMunis: number,
): Promise<{ listings: number; media: number; rooms: number; openHouses: number; skipped: number; error?: string }> {
  const prefix = `[${muniIndex}/${totalMunis}] ${muni.name}`;
  const grandStats = { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0 };

  const passes: { label: string; ptKey: string; ptFilter: string }[] = [];
  const cityFilter = `City eq '${muni.name}'`;

  if (propertyType === 'both' || propertyType === 'freehold') {
    passes.push({ label: 'Freehold', ptKey: 'Residential Freehold', ptFilter: `PropertyType eq 'Residential Freehold' and ${cityFilter}` });
  }
  if (propertyType === 'both' || propertyType === 'condo') {
    passes.push({ label: 'Condo', ptKey: 'Residential Condo & Other', ptFilter: `PropertyType eq 'Residential Condo & Other' and ${cityFilter}` });
  }

  for (const pass of passes) {
    const passStart = Date.now();
    const passStats = { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0, listingsFound: 0 };

    try {
      // Process each status SEQUENTIALLY to minimize memory
      const seen = new Set<string>();
      const statusPasses = [
        { label: "active", filter: pass.ptFilter },
        { label: "sold", filter: `${pass.ptFilter} and (StandardStatus eq 'Closed' or MlsStatus eq 'Sold' or MlsStatus eq 'Sld')` },
        { label: "leased", filter: `${pass.ptFilter} and (MlsStatus eq 'Leased' or MlsStatus eq 'Lsd')` },
        { label: "expired", filter: `${pass.ptFilter} and StandardStatus eq 'Expired'` },
        { label: "other", filter: `${pass.ptFilter} and (StandardStatus eq 'Cancelled' or StandardStatus eq 'Withdrawn' or StandardStatus eq 'Pending' or StandardStatus eq 'Active Under Contract')` },
      ];

      for (const sp of statusPasses) {
        log(TAG, `${prefix} ${pass.label}: Fetching ${sp.label}...`);
        let listings = await fetchPaginatedListings(sp.filter);

        // Deduplicate against already-seen keys
        let fresh = listings.filter(l => {
          const key = l.ListingKey || `${l.StreetNumber}-${l.StreetName}-${l.MlsStatus}`;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });
        listings = null as any; // release raw fetch

        passStats.listingsFound += fresh.length;
        log(TAG, `${prefix} ${pass.label}: ${sp.label}  ${fresh.length} unique listings`);

        if (fresh.length === 0) { fresh = null as any; continue; }

        // Chunk + save this status batch
        const totalChunks = Math.ceil(fresh.length / CHUNK_SIZE);
        for (let c = 0; c < fresh.length; c += CHUNK_SIZE) {
          const chunkNum = Math.floor(c / CHUNK_SIZE) + 1;
          const chunk = fresh.slice(c, c + CHUNK_SIZE);

          log(TAG, `${prefix} ${pass.label}: ${sp.label} chunk ${chunkNum}/${totalChunks}  enhanced data (${chunk.length})...`);
          await fetchEnhancedDataForHomes(chunk);

          log(TAG, `${prefix} ${pass.label}: ${sp.label} chunk ${chunkNum}/${totalChunks}  saving...`);
          const result = await saveHomesListings(chunk, muni.id, muni.areaId);

          if (result.success && result.stats) {
            passStats.listings += result.stats.listings;
            passStats.media += result.stats.media;
            passStats.rooms += result.stats.rooms;
            passStats.openHouses += result.stats.openHouses;
            passStats.skipped += result.stats.skipped;
            log(TAG, `${prefix} ${pass.label}: ${sp.label} chunk ${chunkNum}/${totalChunks}  ${result.stats.listings} saved`);
          } else {
            passStats.skipped += chunk.length;
            warn(TAG, `${prefix} ${pass.label}: ${sp.label} chunk ${chunkNum} error: ${result.error || 'unknown'}`);
          }
        }
        fresh = null as any; // release for GC
      }
      seen.clear();

      if (passStats.listingsFound === 0) {
        log(TAG, `${prefix} ${pass.label}: No listings, skipping.`);
        await writeHomesSyncHistory({
          municipalityId: muni.id, municipalityName: muni.name,
          propertyType: pass.ptKey, startedAt: new Date(passStart),
          triggeredBy: 'github-full-sync', syncType: 'full', status: 'completed',
          listingsFound: 0, listingsCreated: 0, listingsSkipped: 0,
          mediaSaved: 0, roomsSaved: 0, openHousesSaved: 0,
        });
        continue;
      }

      // Write sync history for this pass
      const passDuration = Math.round((Date.now() - passStart) / 1000);
      log(TAG, `${prefix} ${pass.label}: Complete — ${passStats.listings} listings in ${passDuration}s`);

      await writeHomesSyncHistory({
        municipalityId: muni.id, municipalityName: muni.name,
        propertyType: pass.ptKey, startedAt: new Date(passStart),
        triggeredBy: 'github-full-sync', syncType: 'full', status: 'completed',
        listingsFound: passStats.listingsFound, listingsCreated: passStats.listings,
        listingsSkipped: passStats.skipped, mediaSaved: passStats.media,
        roomsSaved: passStats.rooms, openHousesSaved: passStats.openHouses,
      });

      grandStats.listings += passStats.listings;
      grandStats.media += passStats.media;
      grandStats.rooms += passStats.rooms;
      grandStats.openHouses += passStats.openHouses;
      grandStats.skipped += passStats.skipped;

    } catch (err: any) {
      error(TAG, `${prefix} ${pass.label}: FAILED — ${err.message}`);
      const passDuration = Math.round((Date.now() - passStart) / 1000);
      await writeHomesSyncHistory({
        municipalityId: muni.id, municipalityName: muni.name,
        propertyType: pass.ptKey, startedAt: new Date(passStart),
        triggeredBy: 'github-full-sync', syncType: 'full', status: 'failed',
        listingsFound: passStats.listingsFound, listingsCreated: passStats.listings,
        listingsSkipped: passStats.skipped, mediaSaved: passStats.media,
        roomsSaved: passStats.rooms, openHousesSaved: passStats.openHouses,
        errorDetails: err.message,
      });
      return { ...grandStats, error: err.message };
    }
  }

  // Update hierarchy counts
  log(TAG, `${prefix}: Updating hierarchy counts...`);
  await updateHierarchyCounts(muni.id, muni.areaId);

  return grandStats;
}

// ============================================
// MAIN
// ============================================
async function main() {
  const { area, propertyType, concurrency } = parseArgs();
  const startTime = Date.now();

  log(TAG, '='.repeat(60));
  log(TAG, `Full MLS Sync Starting`);
  log(TAG, `  Area: ${area}`);
  log(TAG, `  Property Type: ${propertyType}`);
  log(TAG, `  Concurrency: ${concurrency}`);
  log(TAG, '='.repeat(60));

  // Pre-flight
  validateConfig();
  log(TAG, 'Config validated ?');

  // Get municipalities
  const allMunicipalities = await getMunicipalities(area);
  log(TAG, `Found ${allMunicipalities.length} total municipalities`);

  // Skip already-synced (unless --force flag)
  const force = process.argv.includes('--force');
  let municipalities = allMunicipalities;

  if (!force) {
    const synced = await getAlreadySyncedMuniIds(propertyType);
    municipalities = allMunicipalities.filter(m => !synced.has(m.id));
    const skipped = allMunicipalities.length - municipalities.length;
    if (skipped > 0) log(TAG, `Skipping ${skipped} already-synced municipalities (use --force to re-sync)`);
  }

  log(TAG, `${municipalities.length} municipalities to sync`);

  if (municipalities.length === 0) {
    log(TAG, 'All municipalities already synced. Nothing to do.');
    process.exit(0);
  }

  // List what we're syncing
  const areaGroups = new Map<string, number>();
  municipalities.forEach(m => areaGroups.set(m.areaName, (areaGroups.get(m.areaName) || 0) + 1));
  areaGroups.forEach((count, areaName) => log(TAG, `  ${areaName}: ${count} municipalities`));

  // Cleanup stale running syncs (older than 1 hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabase.from('sync_history')
    .update({ sync_status: 'interrupted', completed_at: new Date().toISOString(), error_details: 'Process interrupted or timed out' })
    .eq('sync_status', 'running').lt('started_at', oneHourAgo);

  // Record baseline
  const { count: baselineCount } = await supabase.from('mls_listings').select('id', { count: 'exact', head: true });
  log(TAG, `Baseline: ${baselineCount || 0} total listings in DB`);

  // Run with semaphore concurrency
  const semaphore = new Semaphore(concurrency);
  const results: { name: string; success: boolean; stats: any; error?: string }[] = [];
  let completed = 0;

  const promises = municipalities.map(async (muni, idx) => {
    await semaphore.acquire();
    try {
      const stats = await syncOneMunicipality(muni, propertyType, idx + 1, municipalities.length);
      completed++;
      const hasError = 'error' in stats && stats.error;
      results.push({ name: muni.name, success: !hasError, stats: { listings: stats.listings || 0, media: stats.media || 0, rooms: stats.rooms || 0, openHouses: stats.openHouses || 0, skipped: stats.skipped || 0 }, error: hasError ? stats.error : undefined });
    } catch (err: any) {
      completed++;
      results.push({ name: muni.name, success: false, stats: null, error: err.message });
      error(TAG, `[${completed}/${municipalities.length}] ${muni.name}: CRASHED — ${err.message}`);
    } finally {
      semaphore.release();
      // Small delay between releases to avoid API hammering
      await delay(1000);
    }
  });

  await Promise.all(promises);

  // Summary
  const totalDuration = Math.round((Date.now() - startTime) / 1000);
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const grandTotal = { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0 };

  results.forEach(r => {
    if (r.success && r.stats) {
      grandTotal.listings += r.stats.listings;
      grandTotal.media += r.stats.media;
      grandTotal.rooms += r.stats.rooms;
      grandTotal.openHouses += r.stats.openHouses;
      grandTotal.skipped += r.stats.skipped;
    }
  });

  // Post-run count
  const { count: postCount } = await supabase.from('mls_listings').select('id', { count: 'exact', head: true });

  log(TAG, '='.repeat(60));
  // Refresh materialized view for Command Center dashboard
  try {
    log(TAG, 'Refreshing area_listing_counts_mv...');
    await supabase.rpc('refresh_area_listing_counts');
    log(TAG, 'Materialized view refreshed');
  } catch (e: any) {
    warn(TAG, 'Failed to refresh materialized view: ' + e.message);
  }

  log(TAG, 'FULL SYNC COMPLETE');
  log(TAG, `  Duration: ${Math.floor(totalDuration / 3600)}h ${Math.floor((totalDuration % 3600) / 60)}m ${totalDuration % 60}s`);
  log(TAG, `  Municipalities: ${succeeded} succeeded, ${failed} failed`);
  log(TAG, `  Listings saved: ${grandTotal.listings}`);
  log(TAG, `  Media: ${grandTotal.media} | Rooms: ${grandTotal.rooms} | Open Houses: ${grandTotal.openHouses}`);
  log(TAG, `  Skipped: ${grandTotal.skipped}`);
  log(TAG, `  DB count: ${baselineCount || 0} ? ${postCount || 0} (+${(postCount || 0) - (baselineCount || 0)})`);
  log(TAG, '='.repeat(60));

  // Log failed municipalities
  const failedMunis = results.filter(r => !r.success);
  if (failedMunis.length > 0) {
    warn(TAG, `Failed municipalities (${failedMunis.length}):`);
    failedMunis.forEach(r => warn(TAG, `  ${r.name}: ${r.error}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  error(TAG, `Fatal error: ${err.message}`);
  process.exit(1);
});

