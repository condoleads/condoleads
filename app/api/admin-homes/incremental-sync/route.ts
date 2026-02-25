// app/api/admin-homes/incremental-sync/route.ts
// Incremental sync  only fetch listings modified since last sync
// Uses ModificationTimestamp gt '{lastSyncDate}' filter
// Safe: upsert on listing_key, trigger_protect_building_id active

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { saveHomesListings } from '@/lib/homes-sync/save';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PROPTX_BASE_URL = process.env.PROPTX_RESO_API_URL;
const PROPTX_TOKEN = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_DLA_TOKEN || process.env.PROPTX_BEARER_TOKEN;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ENHANCED_BATCH_SIZE = 25;

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

async function fetchListingsModifiedSince(filter: string, headers: any): Promise<any[]> {
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
// MAIN HANDLER
// ============================================
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { municipalityId, municipalityName, propertyType, sinceDate, triggeredBy = 'incremental' } = body;

  if (!PROPTX_BASE_URL || !PROPTX_TOKEN) {
    return new Response(JSON.stringify({ error: 'PropTx configuration missing' }), { status: 500 });
  }

  const headers = { 'Authorization': 'Bearer ' + PROPTX_TOKEN, 'Accept': 'application/json' };
  const startTime = Date.now();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: any) => {
        try { controller.enqueue(encoder.encode('data:' + JSON.stringify({ type, ...data }) + '\n\n')); }
        catch {}
      };
      const progress = (msg: string) => send('progress', { message: msg });

      try {
        // Determine which municipalities to process
        let municipalities: { id: string; name: string; areaId: string; lastSync: string }[] = [];

        if (municipalityId && municipalityName) {
          // Single municipality mode
          const { data: muni } = await supabase
            .from('municipalities').select('area_id').eq('id', municipalityId).single();
          if (!muni?.area_id) { send('error', { message: 'Municipality not found' }); controller.close(); return; }

          // Get last sync date
          const cutoff = sinceDate || await getLastSyncDate(municipalityId, propertyType);
          if (!cutoff) { send('error', { message: 'No previous sync found. Run full sync first.' }); controller.close(); return; }

          municipalities = [{ id: municipalityId, name: municipalityName, areaId: muni.area_id, lastSync: cutoff }];
        } else {
          // Auto mode  find ALL municipalities with at least one completed sync
          progress('Finding municipalities with previous syncs...');
          const { data: synced } = await supabase
            .from('sync_history')
            .select('municipality_id, municipality_name, property_type, completed_at')
            .eq('sync_status', 'completed')
            .order('completed_at', { ascending: false });

          if (!synced || synced.length === 0) {
            send('error', { message: 'No completed syncs found. Run full sync first.' });
            controller.close(); return;
          }

          // Get latest sync per municipality+propertyType combo
          const latestMap = new Map<string, { id: string; name: string; propertyType: string; lastSync: string }>();
          for (const s of synced) {
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

          // Build municipality list  one entry per unique municipality (use earliest lastSync across property types)
          const muniMap = new Map<string, { id: string; name: string; areaId: string; lastSync: string }>();
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
          municipalities = [...muniMap.values()].filter(m => m.areaId);
          progress('Found ' + municipalities.length + ' municipalities to check for updates');
        }

        let grandTotal = { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0, checked: 0 };

        for (const muni of municipalities) {
          progress('--- ' + muni.name + ' (since ' + new Date(muni.lastSync).toLocaleDateString() + ') ---');

          // Build filter: all listings modified since last sync
          const sinceISO = new Date(muni.lastSync).toISOString();
          const cityFilter = "City eq '" + muni.name + "'";
          const timeFilter = "ModificationTimestamp gt " + sinceISO;

          // Query both property types
          const ptFilters = propertyType === 'freehold'
            ? ["PropertyType eq 'Residential Freehold'"]
            : propertyType === 'condo'
              ? ["PropertyType eq 'Residential Condo & Other'"]
              : ["PropertyType eq 'Residential Freehold'", "PropertyType eq 'Residential Condo & Other'"];

          let muniListings: any[] = [];

          for (const ptf of ptFilters) {
            const filter = ptf + ' and ' + cityFilter + ' and ' + timeFilter;
            progress('Querying PropTx: ' + ptf.split("'")[1] + '...');
            const listings = await fetchListingsModifiedSince(filter, headers);
            progress('Found ' + listings.length + ' modified listings');
            muniListings.push(...listings);
          }

          // Deduplicate
          const seen = new Set<string>();
          const unique = muniListings.filter(l => {
            const key = l.ListingKey || (l.StreetNumber + '-' + l.StreetName + '-' + l.MlsStatus);
            if (seen.has(key)) return false;
            seen.add(key); return true;
          });

          grandTotal.checked++;

          if (unique.length === 0) {
            progress(muni.name + ': No changes since last sync');
            continue;
          }

          progress(muni.name + ': ' + unique.length + ' modified listings  fetching enhanced data...');
          await fetchEnhancedData(unique, headers);

          progress(muni.name + ': Saving to database...');
          const result = await saveHomesListings(unique, muni.id, muni.areaId);

          if (result.success && result.stats) {
            grandTotal.listings += result.stats.listings;
            grandTotal.media += result.stats.media;
            grandTotal.rooms += result.stats.rooms;
            grandTotal.openHouses += result.stats.openHouses;
            grandTotal.skipped += result.stats.skipped;
            progress(muni.name + ': Saved ' + result.stats.listings + ' listings, ' + result.stats.media + ' media');
          } else {
            progress(muni.name + ': Error  ' + (result.error || 'unknown'));
            grandTotal.skipped += unique.length;
          }

          // Record in sync_history
          await supabase.from('sync_history').insert({
            municipality_id: muni.id,
            municipality_name: muni.name,
            property_type: propertyType === 'freehold' ? 'Residential Freehold' : propertyType === 'condo' ? 'Residential Condo & Other' : 'All Residential',
            sync_type: 'incremental',
            sync_status: 'completed',
            started_at: new Date(startTime).toISOString(),
            completed_at: new Date().toISOString(),
            duration_seconds: Math.round((Date.now() - startTime) / 1000),
            listings_found: unique.length,
            listings_created: result.success ? result.stats?.listings || 0 : 0,
            listings_skipped: result.success ? result.stats?.skipped || 0 : unique.length,
            media_saved: result.success ? result.stats?.media || 0 : 0,
            rooms_saved: result.success ? result.stats?.rooms || 0 : 0,
            open_houses_saved: result.success ? result.stats?.openHouses || 0 : 0,
            triggered_by: triggeredBy,
          });
        }

        send('complete', {
          summary: grandTotal,
          duration: Math.round((Date.now() - startTime) / 1000),
        });

      } catch (error: any) {
        console.error('[IncrementalSync] Error:', error);
        send('error', { message: error.message || 'Unknown error' });
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}

async function getLastSyncDate(municipalityId: string, propertyType?: string): Promise<string | null> {
  let query = supabase
    .from('sync_history')
    .select('completed_at')
    .eq('municipality_id', municipalityId)
    .eq('sync_status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1);

  if (propertyType && propertyType !== 'both') {
    const pt = propertyType === 'freehold' ? 'Residential Freehold' : 'Residential Condo & Other';
    query = query.eq('property_type', pt);
  }

  const { data } = await query.maybeSingle();
  return data?.completed_at || null;
}
