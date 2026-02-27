// scripts/bulk-discover-assign.ts
// Bulk Discovery + DB Assign for ALL municipalities
// Discovers condo buildings from PropTx, creates in DB, links listings
// CLI: npx tsx scripts/bulk-discover-assign.ts
// Options: --area=Toronto --concurrency=2 --discover-only --assign-only --force

import { supabase, testConnection } from './lib/supabase-client';
import { validateConfig, getBaseUrl, getHeaders, delay } from './lib/proptx-client';
import { log, warn, error } from './lib/sync-logger';

const TAG = 'BULK-DISCOVER';

// ============================================
// CLI ARGUMENT PARSING
// ============================================
function parseArgs() {
  const args = process.argv.slice(2);
  let area = 'all';
  let concurrency = 2;
  let discoverOnly = false;
  let assignOnly = false;
  let force = false;

  for (const arg of args) {
    if (arg.startsWith('--area=')) area = arg.split('=')[1];
    if (arg.startsWith('--concurrency=')) concurrency = Math.min(Math.max(parseInt(arg.split('=')[1]) || 2, 1), 5);
    if (arg === '--discover-only') discoverOnly = true;
    if (arg === '--assign-only') assignOnly = true;
    if (arg === '--force') force = true;
  }

  return { area, concurrency, discoverOnly, assignOnly, force };
}

// ============================================
// PROPTX DISCOVERY FUNCTIONS
// ============================================
function getStreetKey(streetName: string): string {
  if (!streetName) return '';
  let s = streetName.toLowerCase().trim();
  s = s.replace(/\(.*?\)/g, '');
  s = s.replace(/unit\s*\d*.*/i, '');
  s = s.replace(/\s*furnished.*/i, '');
  s = s.replace(/\s*furn$/i, '');
  s = s.replace(/\./g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  const skipWords = ['st', 'e', 'w', 'n', 's'];
  const words = s.split(' ');
  for (const word of words) {
    if (skipWords.includes(word)) continue;
    if (word.length >= 3) return word;
  }
  const cleaned = s.replace(/\s+/g, '');
  return cleaned.length >= 3 ? cleaned : '';
}

async function fetchAllListings(filter: string, select: string): Promise<any[]> {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();
  const allResults: any[] = [];
  let skip = 0;
  const pageSize = 5000;

  while (true) {
    const url = `${baseUrl}Property?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=${pageSize}&$skip=${skip}`;
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        warn(TAG, `PropTx returned ${resp.status} at skip=${skip}`);
        break;
      }
      const data = await resp.json();
      const results = data.value || [];
      if (results.length === 0) break;
      allResults.push(...results);
      if (results.length < pageSize) break;
      skip += pageSize;
    } catch (err: any) {
      error(TAG, `Fetch error at skip=${skip}: ${err.message}`);
      break;
    }
  }
  return allResults;
}

async function findBuildingName(
  streetNumber: string, streetKey: string, city: string
): Promise<string | null> {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();
  const cityPrefix = city.split(' ')[0];
  const filter = `StreetNumber eq '${streetNumber}' and contains(tolower(StreetName),'${streetKey}') and contains(City,'${cityPrefix}')`;
  const url = `${baseUrl}Property?$filter=${encodeURIComponent(filter)}&$select=BuildingName&$top=500`;

  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) return null;
    const data = await resp.json();
    const listings = data.value || [];

    const nameCounts = new Map<string, number>();
    for (const listing of listings) {
      if (listing.BuildingName?.trim()) {
        const name = listing.BuildingName.trim();
        nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
      }
    }

    let bestName: string | null = null;
    let maxCount = 0;
    for (const [name, count] of nameCounts) {
      if (count > maxCount) { maxCount = count; bestName = name; }
    }
    return bestName;
  } catch {
    return null;
  }
}

// ============================================
// DISCOVER MUNICIPALITY
// ============================================
async function discoverMunicipality(
  municipalityId: string,
  municipalityName: string,
  areaId: string | null,
  areaName: string | null
): Promise<number> {
  log(TAG, `Discovering: ${municipalityName}`);

  // Load communities for this municipality
  const { data: allCommunities } = await supabase
    .from('communities').select('id, name').eq('municipality_id', municipalityId);

  const communityMap = new Map<string, string>();
  for (const comm of allCommunities || []) {
    communityMap.set(comm.name.toLowerCase(), comm.id);
  }

  const baseFilter = `City eq '${municipalityName}' and PropertySubType eq 'Condo Apartment'`;
  const select = 'StreetNumber,StreetName,StreetSuffix,StreetDirSuffix,City,CityRegion,BuildingName';

  // Fetch ALL listings (all statuses)
  const allListings = await fetchAllListings(baseFilter, select);
  log(TAG, `  ${municipalityName}: ${allListings.length} listings found`);

  if (allListings.length === 0) {
    // Mark as discovered with 0 buildings
    await supabase.from('municipalities').update({
      buildings_discovered: 0,
      discovery_status: 'complete',
      last_discovery_at: new Date().toISOString()
    }).eq('id', municipalityId);
    return 0;
  }

  // Group by street number + first word
  const buildingMap = new Map<string, any>();

  for (const listing of allListings) {
    if (!listing.StreetNumber || !listing.StreetName) continue;
    const streetKey = getStreetKey(listing.StreetName);
    if (!streetKey || streetKey.length < 3) continue;

    const key = `${listing.StreetNumber}|${streetKey}`.toLowerCase();

    if (!buildingMap.has(key)) {
      const cityRegion = listing.CityRegion || '';
      const matchedCommunityId = communityMap.get(cityRegion.toLowerCase()) || null;

      buildingMap.set(key, {
        street_number: listing.StreetNumber,
        street_name: listing.StreetName,
        street_suffix: listing.StreetSuffix || null,
        street_dir_suffix: listing.StreetDirSuffix || null,
        street_key: streetKey,
        city: listing.City,
        proptx_community: cityRegion,
        community_id: matchedCommunityId,
        names: new Map<string, number>(),
        listing_count: 0
      });
    }

    const building = buildingMap.get(key)!;
    building.listing_count++;

    if (listing.BuildingName?.trim()) {
      const name = listing.BuildingName.trim();
      building.names.set(name, (building.names.get(name) || 0) + 1);
    }
  }

  log(TAG, `  ${municipalityName}: ${buildingMap.size} unique buildings grouped`);

  // Find names for buildings without names
  const noNameBuildings = Array.from(buildingMap.entries()).filter(([_, b]) => b.names.size === 0);
  let namesFound = 0;

  for (const [key, building] of noNameBuildings) {
    const foundName = await findBuildingName(building.street_number, building.street_key, building.city);
    if (foundName) {
      building.names.set(foundName, 1);
      namesFound++;
    }
    // Small delay to avoid PropTx rate limiting
    if (noNameBuildings.length > 20) await delay(100);
  }

  if (namesFound > 0) {
    log(TAG, `  Found names for ${namesFound} buildings via targeted search`);
  }

  // Load existing discovered buildings
  const { data: existingBuildings } = await supabase
    .from('discovered_buildings')
    .select('id, street_number, street_key, status, building_id, building_name, community_id')
    .eq('municipality_id', municipalityId);

  const existingMap = new Map<string, any>();
  for (const eb of existingBuildings || []) {
    const key = `${eb.street_number}|${eb.street_key}`.toLowerCase();
    existingMap.set(key, eb);
  }

  // Check synced buildings
  const { data: syncedBuildings } = await supabase
    .from('buildings').select('street_number, street_name, city_district');

  const syncedSet = new Set<string>();
  for (const sb of syncedBuildings || []) {
    const sk = getStreetKey(sb.street_name);
    syncedSet.add(`${sb.street_number}|${sk}`.toLowerCase());
  }

  // Prepare upserts
  const buildingsToUpsert = [];

  for (const [key, building] of buildingMap) {
    let bestName: string | null = null;
    let maxCount = 0;
    for (const [name, count] of building.names) {
      if (count > maxCount) { maxCount = count; bestName = name; }
    }

    const existing = existingMap.get(key);
    const isSynced = syncedSet.has(key) || existing?.status === 'synced' || existing?.status === 'db_linked';
    const finalName = existing?.building_name || bestName;
    const finalCommunityId = existing?.community_id || building.community_id;

    buildingsToUpsert.push({
      area_id: areaId,
      municipality_id: municipalityId,
      community_id: finalCommunityId,
      street_number: building.street_number,
      street_name: building.street_name,
      street_suffix: building.street_suffix,
      street_dir_suffix: building.street_dir_suffix,
      street_key: building.street_key,
      city: building.city,
      building_name: finalName,
      building_name_original: bestName,
      proptx_area: areaName,
      proptx_municipality: municipalityName,
      proptx_community: building.proptx_community,
      listing_count: building.listing_count,
      status: isSynced ? (existing?.status || 'synced') : (existing?.status || 'pending'),
      building_id: existing?.building_id || null,
      discovered_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Upsert in batches
  const batchSize = 100;
  for (let i = 0; i < buildingsToUpsert.length; i += batchSize) {
    const batch = buildingsToUpsert.slice(i, i + batchSize);
    const { error: upsertErr } = await supabase
      .from('discovered_buildings')
      .upsert(batch, { onConflict: 'street_number,street_key,municipality_id', ignoreDuplicates: false });

    if (upsertErr) {
      error(TAG, `Upsert error for ${municipalityName}: ${upsertErr.message}`);
    }
  }

  // Update hierarchy counts
  await updateHierarchyCounts(municipalityId, areaId);

  log(TAG, `  ✅ ${municipalityName}: ${buildingsToUpsert.length} buildings discovered`);
  return buildingsToUpsert.length;
}

// ============================================
// DB ASSIGN FUNCTIONS
// ============================================
function generateSlug(name: string, streetNum: string, streetName: string, streetSuffix: string | null, streetDir: string | null, city: string): string {
  const parts = [name, streetNum, streetName, streetSuffix, streetDir, city].filter(Boolean);
  return parts.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function backfillListingGeoIds(buildingId: string) {
  try {
    const { data: building } = await supabase
      .from('buildings').select('community_id').eq('id', buildingId).single();
    if (!building?.community_id) return;

    const { data: community } = await supabase
      .from('communities').select('id, municipality_id').eq('id', building.community_id).single();
    if (!community?.municipality_id) return;

    const { data: municipality } = await supabase
      .from('municipalities').select('area_id').eq('id', community.municipality_id).single();
    if (!municipality?.area_id) return;

    await supabase.from('mls_listings').update({
      area_id: municipality.area_id,
      municipality_id: community.municipality_id,
      community_id: building.community_id
    }).eq('building_id', buildingId);
  } catch (err: any) {
    error(TAG, `Geo backfill failed for ${buildingId}: ${err.message}`);
  }
}

async function assignBuildingThumbnails(buildingId: string) {
  try {
    const { data: listings } = await supabase
      .from('mls_listings').select('id').eq('building_id', buildingId).limit(20);

    if (!listings || listings.length === 0) return;
    const listingIds = listings.map(l => l.id);

    const { data: photos } = await supabase
      .from('media')
      .select('media_url, listing_id, order_number, variant_type')
      .in('listing_id', listingIds)
      .eq('variant_type', 'thumbnail')
      .eq('order_number', 1)
      .order('listing_id');

    const source = (photos && photos.length > 0) ? photos : (await supabase
      .from('media')
      .select('media_url, listing_id, order_number')
      .in('listing_id', listingIds)
      .eq('variant_type', 'thumbnail')
      .order('order_number', { ascending: true })
      .limit(20)).data;

    if (!source || source.length === 0) return;

    const seen = new Set<string>();
    const thumbs: string[] = [];
    for (const p of source) {
      if (!seen.has(p.listing_id) && p.media_url) {
        seen.add(p.listing_id);
        thumbs.push(p.media_url);
        if (thumbs.length >= 3) break;
      }
    }

    if (thumbs.length > 0) {
      await supabase.from('buildings').update({
        cover_photo_url: thumbs[0],
        gallery_photos: thumbs
      }).eq('id', buildingId);
    }
  } catch (err: any) {
    // Non-critical, just log
    warn(TAG, `Thumbnail failed for ${buildingId}: ${err.message}`);
  }
}

async function dbAssignMunicipality(municipalityId: string, municipalityName: string, areaId: string | null): Promise<{ completed: number; failed: number }> {
  // Get all pending discovered buildings for this municipality
  const { data: pendingBuildings } = await supabase
    .from('discovered_buildings')
    .select('*')
    .eq('municipality_id', municipalityId)
    .eq('status', 'pending');

  if (!pendingBuildings || pendingBuildings.length === 0) {
    return { completed: 0, failed: 0 };
  }

  log(TAG, `  DB Assigning ${pendingBuildings.length} buildings in ${municipalityName}`);

  let completed = 0;
  let failed = 0;

  for (const building of pendingBuildings) {
    const buildingName = building.building_name || `${building.street_number} ${building.street_name}`;
    const fullStreetName = [building.street_name, building.street_suffix, building.street_dir_suffix].filter(Boolean).join(' ');

    try {
      const slug = generateSlug(buildingName, building.street_number, fullStreetName, building.street_suffix, building.street_dir_suffix, building.city);
      const canonicalAddress = `${building.street_number} ${fullStreetName}, ${building.city}`;

      // Check if building exists
      const { data: existing } = await supabase
        .from('buildings').select('id').eq('slug', slug).single();

      let buildingId: string;

      if (existing) {
        buildingId = existing.id;
      } else {
        const { data: newBldg, error: insertErr } = await supabase
          .from('buildings')
          .insert({
            slug,
            building_name: buildingName,
            canonical_address: canonicalAddress,
            street_number: building.street_number,
            street_name: fullStreetName,
            city_district: building.city,
            community_id: building.community_id || null,
            sync_status: 'completed',
            last_sync_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (insertErr) throw insertErr;
        buildingId = newBldg!.id;
      }

      // Link listings via RPC
      const streetWord = (fullStreetName || '').split(' ')[0].toLowerCase();
      const cityWord = (building.city || '').split(' ')[0].toLowerCase();

      const { data: linkedCount, error: rpcErr } = await supabase
        .rpc('link_listings_to_building', {
          p_building_id: buildingId,
          p_street_number: building.street_number,
          p_street_word: streetWord,
          p_city_word: cityWord
        });

      if (rpcErr) {
        warn(TAG, `RPC link error for ${buildingName}: ${rpcErr.message}`);
      }

      // Backfill geo IDs
      await backfillListingGeoIds(buildingId);

      // Assign thumbnails
      await assignBuildingThumbnails(buildingId);

      // Update discovered_building status
      await supabase.from('discovered_buildings').update({
        status: 'db_linked',
        building_id: buildingId,
        synced_at: new Date().toISOString(),
        failed_reason: null
      }).eq('id', building.id);

      completed++;

      if (completed % 25 === 0) {
        log(TAG, `    Progress: ${completed}/${pendingBuildings.length} (${failed} failed)`);
      }

    } catch (err: any) {
      failed++;
      error(TAG, `  ❌ ${buildingName}: ${err.message}`);

      await supabase.from('discovered_buildings').update({
        status: 'failed',
        failed_reason: `DB Assign: ${err.message}`,
        retry_count: (building.retry_count || 0) + 1
      }).eq('id', building.id);
    }
  }

  // Update hierarchy counts
  await updateHierarchyCounts(municipalityId, areaId);

  return { completed, failed };
}

// ============================================
// HIERARCHY COUNT UPDATE
// ============================================
async function updateHierarchyCounts(municipalityId: string, areaId: string | null) {
  const { data: communities } = await supabase
    .from('communities').select('id').eq('municipality_id', municipalityId);

  for (const comm of communities || []) {
    const { data: cb } = await supabase
      .from('discovered_buildings').select('status').eq('community_id', comm.id);
    await supabase.from('communities').update({
      buildings_discovered: cb?.length || 0,
      buildings_synced: cb?.filter(b => b.status === 'synced' || b.status === 'db_linked').length || 0
    }).eq('id', comm.id);
  }

  const { data: mb } = await supabase
    .from('discovered_buildings').select('status').eq('municipality_id', municipalityId);
  await supabase.from('municipalities').update({
    buildings_discovered: mb?.length || 0,
    buildings_synced: mb?.filter(b => b.status === 'synced' || b.status === 'db_linked').length || 0,
    discovery_status: (mb?.length || 0) === 0 ? 'complete' : 'discovered',
    last_discovery_at: new Date().toISOString()
  }).eq('id', municipalityId);

  if (areaId) {
    const { data: ab } = await supabase
      .from('discovered_buildings').select('status').eq('area_id', areaId);
    await supabase.from('treb_areas').update({
      buildings_discovered: ab?.length || 0,
      buildings_synced: ab?.filter(b => b.status === 'synced' || b.status === 'db_linked').length || 0
    }).eq('id', areaId);
  }
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
    if (this.queue.length > 0) { this.running++; this.queue.shift()!(); }
  }
}

// ============================================
// MAIN
// ============================================
async function main() {
  const { area, concurrency, discoverOnly, assignOnly, force } = parseArgs();

  console.log('='.repeat(60));
  console.log('BULK DISCOVER + DB ASSIGN');
  console.log(`Area: ${area} | Concurrency: ${concurrency}`);
  console.log(`Mode: ${discoverOnly ? 'DISCOVER ONLY' : assignOnly ? 'ASSIGN ONLY' : 'DISCOVER + ASSIGN'}`);
  console.log(`Force: ${force}`);
  console.log('='.repeat(60));

  validateConfig();
  const dbOk = await testConnection();
  if (!dbOk) { process.exit(1); }

  // Get municipalities to process
  let query = supabase
    .from('municipalities')
    .select('id, name, area_id, buildings_discovered, treb_areas(id, name)')
    .order('name');

  if (area !== 'all') {
    // Filter by area name
    const { data: areaData } = await supabase
      .from('treb_areas').select('id').ilike('name', `%${area}%`);

    if (!areaData || areaData.length === 0) {
      console.error(`No area found matching "${area}"`);
      process.exit(1);
    }
    const areaIds = areaData.map(a => a.id);
    query = query.in('area_id', areaIds);
  }

  if (!force && !assignOnly) {
    // Only undiscovered municipalities
    query = query.eq('buildings_discovered', 0);
  }

  const { data: municipalities, error: muniErr } = await query;

  if (muniErr) {
    console.error('Failed to load municipalities:', muniErr.message);
    process.exit(1);
  }

  if (!municipalities || municipalities.length === 0) {
    console.log('No municipalities to process. Use --force to re-process all.');
    process.exit(0);
  }

  console.log(`\nProcessing ${municipalities.length} municipalities...\n`);

  const sem = new Semaphore(concurrency);
  let totalDiscovered = 0;
  let totalAssigned = 0;
  let totalFailed = 0;
  let muniCompleted = 0;

  const startTime = Date.now();

  const tasks = municipalities.map(async (muni) => {
    await sem.acquire();
    try {
      const areaId = muni.area_id;
      const areaName = (muni.treb_areas as any)?.name || null;

      // STEP 1: Discover
      if (!assignOnly) {
        const discovered = await discoverMunicipality(muni.id, muni.name, areaId, areaName);
        totalDiscovered += discovered;

        // Rate limit: avoid hammering PropTx
        await delay(500);
      }

      // STEP 2: DB Assign
      if (!discoverOnly) {
        const { completed, failed } = await dbAssignMunicipality(muni.id, muni.name, areaId);
        totalAssigned += completed;
        totalFailed += failed;
      }

      muniCompleted++;

      if (muniCompleted % 10 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        console.log(`\n📊 Progress: ${muniCompleted}/${municipalities.length} municipalities | ${totalDiscovered} discovered | ${totalAssigned} assigned | ${totalFailed} failed | ${elapsed}min elapsed\n`);
      }

    } catch (err: any) {
      error(TAG, `Fatal error for ${muni.name}: ${err.message}`);
    } finally {
      sem.release();
    }
  });

  await Promise.all(tasks);

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Municipalities processed: ${muniCompleted}`);
  console.log(`Buildings discovered: ${totalDiscovered}`);
  console.log(`Buildings DB assigned: ${totalAssigned}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Time: ${elapsed} minutes`);
  console.log('='.repeat(60));

  // Final counts
  const { data: finalStats } = await supabase
    .from('discovered_buildings')
    .select('status');

  if (finalStats) {
    const pending = finalStats.filter(b => b.status === 'pending').length;
    const synced = finalStats.filter(b => b.status === 'synced').length;
    const dbLinked = finalStats.filter(b => b.status === 'db_linked').length;
    const failedCount = finalStats.filter(b => b.status === 'failed').length;

    console.log(`\nFinal DB state:`);
    console.log(`  Pending: ${pending}`);
    console.log(`  Synced: ${synced}`);
    console.log(`  DB Linked: ${dbLinked}`);
    console.log(`  Failed: ${failedCount}`);
    console.log(`  Total: ${finalStats.length}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});