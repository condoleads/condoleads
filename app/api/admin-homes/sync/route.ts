import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { saveHomesListings } from '@/lib/homes-sync/save';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PROPTX_BASE_URL = process.env.PROPTX_RESO_API_URL;
const PROPTX_TOKEN = process.env.PROPTX_DLA_TOKEN || process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_BEARER_TOKEN;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CHUNK_SIZE = 50;
const ENHANCED_BATCH_SIZE = 10;

type PropertyTypeFilter = 'freehold' | 'condo' | 'both';

function buildPropTxTypeFilter(pt: PropertyTypeFilter): string {
  switch (pt) {
    case 'freehold': return "PropertyType eq 'Residential Freehold'";
    case 'condo': return "PropertyType eq 'Residential Condo & Other'";
    case 'both': return "(PropertyType eq 'Residential Freehold' or PropertyType eq 'Residential Condo & Other')";
  }
}

const PT_LABELS: Record<string, string> = { freehold: 'Freehold', condo: 'Condo', both: 'All Residential' };

function filterTwoVariants(allMediaItems: any[]) {
  if (!allMediaItems || allMediaItems.length === 0) return [];
  const sorted = [...allMediaItems].sort((a, b) => (parseInt(a.Order) || 999) - (parseInt(b.Order) || 999));
  const groups = new Map<string, any[]>();
  sorted.forEach(item => {
    const baseId = item.MediaURL ? item.MediaURL.split('/').pop()?.split('.')[0] || item.MediaKey : item.MediaKey || Math.random().toString();
    if (!groups.has(baseId)) groups.set(baseId, []);
    groups.get(baseId)!.push(item);
  });
  const filtered: any[] = [];
  groups.forEach(variants => {
    const thumb = variants.find((v: any) => v.MediaURL && (v.MediaURL.includes('rs:fit:240:240') || v.ImageSizeDescription === 'Thumbnail'));
    const large = variants.find((v: any) => v.MediaURL && (v.MediaURL.includes('rs:fit:1920:1920') || v.ImageSizeDescription === 'Large'));
    if (thumb) filtered.push({ ...thumb, variant_type: 'thumbnail' });
    if (large) filtered.push({ ...large, variant_type: 'large' });
  });
  return filtered;
}

async function fetchBasicListings(filter: string, headers: any, send: (msg: string) => void): Promise<any[]> {
  const all: any[] = [];
  let skip = 0;
  const pageSize = 5000;
  while (true) {
    const url = PROPTX_BASE_URL + 'Property?$filter=' + encodeURIComponent(filter) + '&$top=' + pageSize + '&$skip=' + skip;
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) { send('Warning: PropTx error at skip=' + skip + ': ' + resp.status); break; }
      const data = await resp.json();
      const results = data.value || [];
      if (results.length === 0) break;
      all.push(...results);
      send('Fetched ' + all.length + ' listings (page ' + (Math.floor(skip / pageSize) + 1) + ')');
      if (results.length < pageSize) break;
      skip += pageSize;
    } catch (err: any) { send('Fetch error at skip=' + skip + ': ' + err.message); break; }
  }
  return all;
}

async function fetchEnhancedData(listings: any[], headers: any) {
  for (let i = 0; i < listings.length; i += ENHANCED_BATCH_SIZE) {
    const batch = listings.slice(i, i + ENHANCED_BATCH_SIZE);
    await Promise.all(batch.map(async (listing) => {
      const key = listing.ListingKey;
      if (!key) return;
      const [rooms, media, openHouses] = await Promise.all([
        fetch(PROPTX_BASE_URL + 'PropertyRooms?$filter=' + encodeURIComponent("ListingKey eq '" + key + "'") + '&$top=50', { headers })
          .then(r => r.ok ? r.json() : { value: [] }).catch(() => ({ value: [] })),
        fetch(PROPTX_BASE_URL + 'Media?$filter=' + encodeURIComponent("ResourceRecordKey eq '" + key + "'") + '&$top=500', { headers })
          .then(r => r.ok ? r.json() : { value: [] }).catch(() => ({ value: [] })),
        fetch(PROPTX_BASE_URL + 'OpenHouse?$filter=' + encodeURIComponent("ListingKey eq '" + key + "'") + '&$top=20', { headers })
          .then(r => r.ok ? r.json() : { value: [] }).catch(() => ({ value: [] }))
      ]);
      listing.PropertyRooms = rooms.value || [];
      listing.Media = filterTwoVariants(media.value || []);
      listing.OpenHouses = openHouses.value || [];
    }));
  }
}

async function updateHierarchyCounts(municipalityId: string, areaId: string) {
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
// SYNC HISTORY HELPERS
// ============================================
async function createSyncRecord(params: {
  municipalityId: string;
  municipalityName: string;
  communityId?: string;
  communityName?: string;
  propertyType: string;
  triggeredBy: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('sync_history')
    .insert({
      municipality_id: params.municipalityId,
      municipality_name: params.municipalityName,
      community_id: params.communityId || null,
      community_name: params.communityName || null,
      property_type: params.propertyType,
      sync_type: 'full',
      sync_status: 'running',
      started_at: new Date().toISOString(),
      triggered_by: params.triggeredBy,
      listings_found: 0,
      listings_created: 0,
      listings_updated: 0,
      listings_skipped: 0,
      media_saved: 0,
      rooms_saved: 0,
      open_houses_saved: 0,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[SyncHistory] Failed to create record:', error);
    return null;
  }
  return data.id;
}

async function updateSyncRecord(id: string, updates: Record<string, any>) {
  const { error } = await supabase
    .from('sync_history')
    .update(updates)
    .eq('id', id);
  if (error) console.error('[SyncHistory] Failed to update:', error);
}

async function completeSyncRecord(id: string, stats: {
  listings: number; media: number; rooms: number; openHouses: number; skipped: number;
  listingsFound: number;
}, startTime: number) {
  const duration = (Date.now() - startTime) / 1000;
  await updateSyncRecord(id, {
    sync_status: 'completed',
    completed_at: new Date().toISOString(),
    duration_seconds: Math.round(duration),
    listings_found: stats.listingsFound,
    listings_created: stats.listings,
    listings_skipped: stats.skipped,
    media_saved: stats.media,
    rooms_saved: stats.rooms,
    open_houses_saved: stats.openHouses,
  });
}

async function failSyncRecord(id: string, errorMsg: string, startTime: number) {
  const duration = (Date.now() - startTime) / 1000;
  await updateSyncRecord(id, {
    sync_status: 'failed',
    completed_at: new Date().toISOString(),
    duration_seconds: Math.round(duration),
    error_details: errorMsg,
  });
}

// Mark any stale 'running' syncs as interrupted (safety net for crashes)
async function cleanupStaleSyncs() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabase
    .from('sync_history')
    .update({ sync_status: 'interrupted', completed_at: new Date().toISOString(), error_details: 'Process interrupted or timed out' })
    .eq('sync_status', 'running')
    .lt('started_at', oneHourAgo);
}

export async function POST(request: NextRequest) {
  const { municipalityId, municipalityName, communityId, communityName, propertyType, triggeredBy = 'manual' } = await request.json();

  if (!municipalityId || !municipalityName) {
    return new Response(JSON.stringify({ error: 'municipalityId and municipalityName required' }), { status: 400 });
  }
  if (!PROPTX_BASE_URL || !PROPTX_TOKEN) {
    return new Response(JSON.stringify({ error: 'PropTx configuration missing' }), { status: 500 });
  }

  const ptFilter: PropertyTypeFilter = propertyType || 'freehold';
  const startTime = Date.now();

  // Cleanup any stale running syncs before starting
  await cleanupStaleSyncs();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: any) => {
        controller.enqueue(encoder.encode('data:' + JSON.stringify({ type, ...data }) + '\n\n'));
      };
      const progress = (message: string) => send('progress', { message });

      // Create sync_history record(s) — one per pass
      const syncRecordIds: { label: string; id: string }[] = [];

      try {
        progress('Looking up area for ' + municipalityName + '...');
        const { data: muni } = await supabase
          .from('municipalities').select('area_id').eq('id', municipalityId).single();

        if (!muni?.area_id) { send('error', { message: 'Municipality not found or missing area_id' }); controller.close(); return; }
        const areaId = muni.area_id;

        const headers = { 'Authorization': 'Bearer ' + PROPTX_TOKEN, 'Accept': 'application/json' };

        // Build passes
        const passes: { label: string; filter: string; ptKey: string }[] = [];
        const cityFilter = "City eq '" + municipalityName + "'" + (communityName ? " and CityRegion eq '" + communityName + "'" : '');

        if (ptFilter === 'both') {
          passes.push({ label: 'Freehold', filter: "PropertyType eq 'Residential Freehold' and " + cityFilter, ptKey: 'Residential Freehold' });
          passes.push({ label: 'Condo', filter: "PropertyType eq 'Residential Condo & Other' and " + cityFilter, ptKey: 'Residential Condo & Other' });
        } else {
          const ptKey = ptFilter === 'freehold' ? 'Residential Freehold' : 'Residential Condo & Other';
          passes.push({ label: PT_LABELS[ptFilter], filter: buildPropTxTypeFilter(ptFilter) + ' and ' + cityFilter, ptKey });
        }

        // Create sync_history record for each pass
        for (const pass of passes) {
          const syncId = await createSyncRecord({
            municipalityId,
            municipalityName,
            communityId,
            communityName,
            propertyType: pass.ptKey,
            triggeredBy,
          });
          if (syncId) {
            syncRecordIds.push({ label: pass.label, id: syncId });
            progress('Sync tracking started for ' + pass.label + ' (ID: ' + syncId.slice(0, 8) + ')');
          }
        }

        let grandTotalListingsFound = 0;

        for (let passIdx = 0; passIdx < passes.length; passIdx++) {
          const pass = passes[passIdx];
          const syncRecord = syncRecordIds[passIdx];
          const passStartTime = Date.now();
          let passStats = { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0, listingsFound: 0 };

          try {
            progress('--- Pass: ' + pass.label + ' ---');
            progress('Filter: ' + (communityName ? municipalityName + ' / ' + communityName : municipalityName) + ' (' + pass.label + ')');

            progress('Fetching active listings from PropTx...');
            const activeListings = await fetchBasicListings(pass.filter, headers, progress);
            progress('Active/current: ' + activeListings.length);

            progress('Fetching sold transactions...');
            const soldFilter = pass.filter + " and (StandardStatus eq 'Closed' or MlsStatus eq 'Sold' or MlsStatus eq 'Sld')";
            const soldListings = await fetchBasicListings(soldFilter, headers, progress);
            progress('Sold: ' + soldListings.length);

            progress('Fetching leased transactions...');
            const leasedFilter = pass.filter + " and (MlsStatus eq 'Leased' or MlsStatus eq 'Lsd')";
            const leasedListings = await fetchBasicListings(leasedFilter, headers, progress);
            progress('Leased: ' + leasedListings.length);

            const allListings = [...activeListings, ...soldListings, ...leasedListings];
            const seen = new Set<string>();
            const unique = allListings.filter(l => {
              const key = l.ListingKey || (l.StreetNumber + '-' + l.StreetName + '-' + l.MlsStatus);
              if (seen.has(key)) return false;
              seen.add(key); return true;
            });
            const excluded = ['Pending', 'Cancelled', 'Withdrawn'];
            const excludedMls = ['Cancelled', 'Withdrawn', 'Pend'];
            const filtered = unique.filter(l => !excluded.includes(l.StandardStatus) && !excludedMls.includes(l.MlsStatus));

            passStats.listingsFound = filtered.length;
            grandTotalListingsFound += filtered.length;
            progress(pass.label + ' unique: ' + unique.length + ' -> After filter: ' + filtered.length);

            // Update sync record with listings_found
            if (syncRecord) {
              await updateSyncRecord(syncRecord.id, { listings_found: filtered.length });
            }

            if (filtered.length === 0) {
              progress(pass.label + ': No listings to process, skipping.');
              if (syncRecord) {
                await completeSyncRecord(syncRecord.id, passStats, passStartTime);
              }
              continue;
            }

            const totalChunks = Math.ceil(filtered.length / CHUNK_SIZE);
            for (let c = 0; c < filtered.length; c += CHUNK_SIZE) {
              const chunkNum = Math.floor(c / CHUNK_SIZE) + 1;
              const chunk = filtered.slice(c, c + CHUNK_SIZE);
              progress('Chunk ' + chunkNum + '/' + totalChunks + ': Fetching enhanced data for ' + chunk.length + ' listings...');
              await fetchEnhancedData(chunk, headers);
              progress('Chunk ' + chunkNum + '/' + totalChunks + ': Saving to database...');
              const result = await saveHomesListings(chunk, municipalityId, areaId);
              if (result.success && result.stats) {
                passStats.listings += result.stats.listings;
                passStats.media += result.stats.media;
                passStats.rooms += result.stats.rooms;
                passStats.openHouses += result.stats.openHouses;
                passStats.skipped += result.stats.skipped;
                progress('Chunk ' + chunkNum + '/' + totalChunks + ': ' + result.stats.listings + ' listings, ' + result.stats.media + ' media, ' + result.stats.rooms + ' rooms');
              } else {
                progress('Chunk ' + chunkNum + '/' + totalChunks + ' error: ' + result.error);
                passStats.skipped += chunk.length;
              }

              // Update sync record with running totals after each chunk
              if (syncRecord) {
                await updateSyncRecord(syncRecord.id, {
                  listings_created: passStats.listings,
                  listings_skipped: passStats.skipped,
                  media_saved: passStats.media,
                  rooms_saved: passStats.rooms,
                  open_houses_saved: passStats.openHouses,
                });
              }
            }

            progress(pass.label + ' pass complete: ' + passStats.listings + ' listings saved');

            // Mark this pass as completed
            if (syncRecord) {
              await completeSyncRecord(syncRecord.id, passStats, passStartTime);
              progress('Sync record updated for ' + pass.label);
            }

          } catch (passError: any) {
            console.error('[HomesSync] Pass error (' + pass.label + '):', passError);
            progress('ERROR in ' + pass.label + ' pass: ' + passError.message);
            if (syncRecord) {
              await failSyncRecord(syncRecord.id, passError.message, passStartTime);
            }
            // Continue to next pass even if one fails
          }
        }

        if (grandTotalListingsFound === 0) {
          send('complete', { summary: { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0 } });
          controller.close(); return;
        }

        progress('Updating hierarchy counts...');
        await updateHierarchyCounts(municipalityId, areaId);
        progress('Hierarchy counts updated');

        // Calculate grand totals from all sync records
        let grandTotal = { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0 };
        for (const sr of syncRecordIds) {
          const { data } = await supabase
            .from('sync_history')
            .select('listings_created, media_saved, rooms_saved, open_houses_saved, listings_skipped')
            .eq('id', sr.id)
            .single();
          if (data) {
            grandTotal.listings += data.listings_created || 0;
            grandTotal.media += data.media_saved || 0;
            grandTotal.rooms += data.rooms_saved || 0;
            grandTotal.openHouses += data.open_houses_saved || 0;
            grandTotal.skipped += data.listings_skipped || 0;
          }
        }

        send('complete', {
          summary: grandTotal,
          syncRecordIds: syncRecordIds.map(sr => sr.id),
          duration: Math.round((Date.now() - startTime) / 1000)
        });

      } catch (error: any) {
        console.error('[HomesSync] Error:', error);
        // Mark all running records as failed
        for (const sr of syncRecordIds) {
          await failSyncRecord(sr.id, error.message, startTime);
        }
        send('error', { message: error.message || 'Unknown error' });
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
  });
}