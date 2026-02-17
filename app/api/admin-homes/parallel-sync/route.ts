// app/api/admin-homes/parallel-sync/route.ts
// Parallel municipality sync — processes N municipalities simultaneously
// Uses same saveHomesListings + same field mapping as single sync
// Guardrails: listing_key UNIQUE, trigger_protect_building_id, upsert pattern

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

const CHUNK_SIZE = 200;
const ENHANCED_BATCH_SIZE = 25;
const DEFAULT_CONCURRENCY = 3;

type PropertyTypeFilter = 'freehold' | 'condo' | 'both';
const PT_LABELS: Record<string, string> = { freehold: 'Freehold', condo: 'Condo', both: 'All Residential' };

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
// MEDIA FILTER (same as single sync)
// ============================================
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

// ============================================
// PROPTX FETCH FUNCTIONS
// ============================================
async function fetchBasicListings(filter: string, headers: any): Promise<any[]> {
  const all: any[] = [];
  let skip = 0;
  const pageSize = 5000;
  while (true) {
    const url = PROPTX_BASE_URL + 'Property?$filter=' + encodeURIComponent(filter) + '&$top=' + pageSize + '&$skip=' + skip;
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) break;
      const data = await resp.json();
      const results = data.value || [];
      if (results.length === 0) break;
      all.push(...results);
      if (results.length < pageSize) break;
      skip += pageSize;
    } catch { break; }
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

// ============================================
// HIERARCHY COUNT UPDATE
// ============================================
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
  municipalityId: string; municipalityName: string;
  propertyType: string; triggeredBy: string;
}): Promise<string | null> {
  const { data, error } = await supabase.from('sync_history').insert({
    municipality_id: params.municipalityId,
    municipality_name: params.municipalityName,
    property_type: params.propertyType,
    sync_type: 'full',
    sync_status: 'running',
    started_at: new Date().toISOString(),
    triggered_by: params.triggeredBy,
    listings_found: 0, listings_created: 0, listings_updated: 0,
    listings_skipped: 0, media_saved: 0, rooms_saved: 0, open_houses_saved: 0,
  }).select('id').single();
  if (error) { console.error('[ParallelSync] sync_history insert error:', error); return null; }
  return data.id;
}

async function updateSyncRecord(id: string, updates: Record<string, any>) {
  await supabase.from('sync_history').update(updates).eq('id', id);
}

async function completeSyncRecord(id: string, stats: any, startTime: number) {
  const duration = (Date.now() - startTime) / 1000;
  await updateSyncRecord(id, {
    sync_status: 'completed', completed_at: new Date().toISOString(),
    duration_seconds: Math.round(duration),
    listings_found: stats.listingsFound, listings_created: stats.listings,
    listings_skipped: stats.skipped, media_saved: stats.media,
    rooms_saved: stats.rooms, open_houses_saved: stats.openHouses,
  });
}

async function failSyncRecord(id: string, errorMsg: string, startTime: number) {
  const duration = (Date.now() - startTime) / 1000;
  await updateSyncRecord(id, {
    sync_status: 'failed', completed_at: new Date().toISOString(),
    duration_seconds: Math.round(duration), error_details: errorMsg,
  });
}

// ============================================
// PER-MUNICIPALITY SYNC (core engine)
// ============================================
async function syncOneMunicipality(
  muni: { id: string; name: string; areaId: string },
  ptFilter: PropertyTypeFilter,
  headers: any,
  send: (type: string, data: any) => void,
  triggeredBy: string
): Promise<{ listings: number; media: number; rooms: number; openHouses: number; skipped: number }> {
  const muniLabel = muni.name;
  const mp = (msg: string) => send('municipality_progress', { municipalityId: muni.id, municipalityName: muniLabel, message: msg });

  const passes: { label: string; filter: string; ptKey: string }[] = [];
  const cityFilter = "City eq '" + muni.name + "'";

  if (ptFilter === 'both') {
    passes.push({ label: 'Freehold', filter: "PropertyType eq 'Residential Freehold' and " + cityFilter, ptKey: 'Residential Freehold' });
    passes.push({ label: 'Condo', filter: "PropertyType eq 'Residential Condo & Other' and " + cityFilter, ptKey: 'Residential Condo & Other' });
  } else {
    const ptKey = ptFilter === 'freehold' ? 'Residential Freehold' : 'Residential Condo & Other';
    const ptFilterStr = ptFilter === 'freehold' ? "PropertyType eq 'Residential Freehold'" : "PropertyType eq 'Residential Condo & Other'";
    passes.push({ label: PT_LABELS[ptFilter], filter: ptFilterStr + ' and ' + cityFilter, ptKey });
  }

  const grandStats = { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0 };

  for (const pass of passes) {
    const passStart = Date.now();
    const syncId = await createSyncRecord({ municipalityId: muni.id, municipalityName: muni.name, propertyType: pass.ptKey, triggeredBy });
    const passStats = { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0, listingsFound: 0 };

    try {
      mp(pass.label + ': Fetching active listings...');
      const active = await fetchBasicListings(pass.filter, headers);
      mp(pass.label + ': Active: ' + active.length);

      mp(pass.label + ': Fetching sold...');
      const sold = await fetchBasicListings(pass.filter + " and (StandardStatus eq 'Closed' or MlsStatus eq 'Sold' or MlsStatus eq 'Sld')", headers);

      mp(pass.label + ': Fetching leased...');
      const leased = await fetchBasicListings(pass.filter + " and (MlsStatus eq 'Leased' or MlsStatus eq 'Lsd')", headers);

      mp(pass.label + ': Fetching expired...');
      const expired = await fetchBasicListings(pass.filter + " and StandardStatus eq 'Expired'", headers);

      mp(pass.label + ': Fetching cancelled/withdrawn/pending...');
      const other = await fetchBasicListings(pass.filter + " and (StandardStatus eq 'Cancelled' or StandardStatus eq 'Withdrawn' or StandardStatus eq 'Pending' or StandardStatus eq 'Active Under Contract')", headers);

      // Deduplicate
      const all = [...active, ...sold, ...leased, ...expired, ...other];
      const seen = new Set<string>();
      const unique = all.filter(l => {
        const key = l.ListingKey || (l.StreetNumber + '-' + l.StreetName + '-' + l.MlsStatus);
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });

      passStats.listingsFound = unique.length;
      mp(pass.label + ': ' + unique.length + ' unique listings');

      if (syncId) await updateSyncRecord(syncId, { listings_found: unique.length });

      if (unique.length === 0) {
        mp(pass.label + ': No listings, skipping.');
        if (syncId) await completeSyncRecord(syncId, passStats, passStart);
        continue;
      }

      // Chunk: enhanced data + save
      const totalChunks = Math.ceil(unique.length / CHUNK_SIZE);
      for (let c = 0; c < unique.length; c += CHUNK_SIZE) {
        const chunkNum = Math.floor(c / CHUNK_SIZE) + 1;
        const chunk = unique.slice(c, c + CHUNK_SIZE);

        mp(pass.label + ': Chunk ' + chunkNum + '/' + totalChunks + ' — enhanced data (' + chunk.length + ')...');
        await fetchEnhancedData(chunk, headers);

        mp(pass.label + ': Chunk ' + chunkNum + '/' + totalChunks + ' — saving...');
        const result = await saveHomesListings(chunk, muni.id, muni.areaId);

        if (result.success && result.stats) {
          passStats.listings += result.stats.listings;
          passStats.media += result.stats.media;
          passStats.rooms += result.stats.rooms;
          passStats.openHouses += result.stats.openHouses;
          passStats.skipped += result.stats.skipped;
          mp(pass.label + ': Chunk ' + chunkNum + '/' + totalChunks + ' — ' + result.stats.listings + ' saved');
        } else {
          passStats.skipped += chunk.length;
          mp(pass.label + ': Chunk ' + chunkNum + ' error: ' + (result.error || 'unknown'));
        }

        if (syncId) {
          await updateSyncRecord(syncId, {
            listings_created: passStats.listings, listings_skipped: passStats.skipped,
            media_saved: passStats.media, rooms_saved: passStats.rooms,
            open_houses_saved: passStats.openHouses,
          });
        }
      }

      mp(pass.label + ': Complete — ' + passStats.listings + ' listings');
      if (syncId) await completeSyncRecord(syncId, passStats, passStart);

      grandStats.listings += passStats.listings;
      grandStats.media += passStats.media;
      grandStats.rooms += passStats.rooms;
      grandStats.openHouses += passStats.openHouses;
      grandStats.skipped += passStats.skipped;

    } catch (err: any) {
      mp(pass.label + ': ERROR — ' + err.message);
      if (syncId) await failSyncRecord(syncId, err.message, passStart);
      grandStats.skipped += passStats.listingsFound;
    }
  }

  // Update hierarchy counts
  mp('Updating hierarchy counts...');
  await updateHierarchyCounts(muni.id, muni.areaId);
  mp('Done — ' + grandStats.listings + ' total listings');

  return grandStats;
}

// ============================================
// MAIN HANDLER — PARALLEL SYNC
// ============================================
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { municipalities, propertyType, concurrency } = body as {
    municipalities: { id: string; name: string; areaId: string }[];
    propertyType: PropertyTypeFilter;
    concurrency?: number;
  };

  if (!municipalities || municipalities.length === 0) {
    return new Response(JSON.stringify({ error: 'municipalities array required' }), { status: 400 });
  }
  if (!PROPTX_BASE_URL || !PROPTX_TOKEN) {
    return new Response(JSON.stringify({ error: 'PropTx configuration missing' }), { status: 500 });
  }

  const ptFilter: PropertyTypeFilter = propertyType || 'freehold';
  const maxConcurrent = Math.min(Math.max(concurrency || DEFAULT_CONCURRENCY, 1), 10);
  const headers = { 'Authorization': 'Bearer ' + PROPTX_TOKEN, 'Accept': 'application/json' };
  const startTime = Date.now();

  // Cleanup stale running syncs
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabase.from('sync_history')
    .update({ sync_status: 'interrupted', completed_at: new Date().toISOString(), error_details: 'Process interrupted or timed out' })
    .eq('sync_status', 'running').lt('started_at', oneHourAgo);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: any) => {
        try { controller.enqueue(encoder.encode('data:' + JSON.stringify({ type, ...data }) + '\n\n')); }
        catch { /* stream closed */ }
      };

      send('queue', {
        total: municipalities.length,
        concurrency: maxConcurrent,
        propertyType: PT_LABELS[ptFilter],
        municipalities: municipalities.map(m => ({ id: m.id, name: m.name, status: 'queued' })),
      });

      const semaphore = new Semaphore(maxConcurrent);
      const results: { id: string; name: string; success: boolean; stats: any; error?: string }[] = [];

      // Launch all municipalities — semaphore controls concurrency
      const promises = municipalities.map(async (muni) => {
        await semaphore.acquire();
        send('municipality_start', { municipalityId: muni.id, municipalityName: muni.name });

        try {
          const stats = await syncOneMunicipality(muni, ptFilter, headers, send, 'parallel-sync');
          send('municipality_complete', {
            municipalityId: muni.id, municipalityName: muni.name,
            stats, duration: Math.round((Date.now() - startTime) / 1000),
          });
          results.push({ id: muni.id, name: muni.name, success: true, stats });
        } catch (err: any) {
          send('municipality_error', { municipalityId: muni.id, municipalityName: muni.name, error: err.message });
          results.push({ id: muni.id, name: muni.name, success: false, stats: null, error: err.message });
        } finally {
          semaphore.release();
        }
      });

      await Promise.all(promises);

      // Grand totals
      const grandTotal = { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0 };
      let succeeded = 0; let failed = 0;
      for (const r of results) {
        if (r.success && r.stats) {
          grandTotal.listings += r.stats.listings;
          grandTotal.media += r.stats.media;
          grandTotal.rooms += r.stats.rooms;
          grandTotal.openHouses += r.stats.openHouses;
          grandTotal.skipped += r.stats.skipped;
          succeeded++;
        } else { failed++; }
      }

      send('complete', {
        grandTotal,
        municipalities: results,
        succeeded, failed,
        totalDuration: Math.round((Date.now() - startTime) / 1000),
      });

      controller.close();
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}