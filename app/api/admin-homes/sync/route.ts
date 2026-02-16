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
  // Count ALL residential listings (freehold + condo) for geo hierarchy
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

export async function POST(request: NextRequest) {
  const { municipalityId, municipalityName, communityName, propertyType } = await request.json();

  if (!municipalityId || !municipalityName) {
    return new Response(JSON.stringify({ error: 'municipalityId and municipalityName required' }), { status: 400 });
  }
  if (!PROPTX_BASE_URL || !PROPTX_TOKEN) {
    return new Response(JSON.stringify({ error: 'PropTx configuration missing' }), { status: 500 });
  }

  const ptFilter: PropertyTypeFilter = propertyType || 'freehold';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: any) => {
        controller.enqueue(encoder.encode('data:' + JSON.stringify({ type, ...data }) + '\n\n'));
      };
      const progress = (message: string) => send('progress', { message });

      try {
        progress('Looking up area for ' + municipalityName + '...');
        const { data: muni } = await supabase
          .from('municipalities').select('area_id').eq('id', municipalityId).single();

        if (!muni?.area_id) { send('error', { message: 'Municipality not found or missing area_id' }); controller.close(); return; }
        const areaId = muni.area_id;

        const headers = { 'Authorization': 'Bearer ' + PROPTX_TOKEN, 'Accept': 'application/json' };

        // For 'both', split into sequential passes to avoid timeout on large municipalities
        const passes: { label: string; filter: string }[] = [];
        const cityFilter = "City eq '" + municipalityName + "'" + (communityName ? " and CityRegion eq '" + communityName + "'" : '');

        if (ptFilter === 'both') {
          passes.push({ label: 'Freehold', filter: "PropertyType eq 'Residential Freehold' and " + cityFilter });
          passes.push({ label: 'Condo', filter: "PropertyType eq 'Residential Condo & Other' and " + cityFilter });
        } else {
          passes.push({ label: PT_LABELS[ptFilter], filter: buildPropTxTypeFilter(ptFilter) + ' and ' + cityFilter });
        }

        let totalStats = { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0 };

        for (const pass of passes) {
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
          progress(pass.label + ' unique: ' + unique.length + ' -> After filter: ' + filtered.length);

          if (filtered.length === 0) {
            progress(pass.label + ': No listings to process, skipping.');
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
              totalStats.listings += result.stats.listings;
              totalStats.media += result.stats.media;
              totalStats.rooms += result.stats.rooms;
              totalStats.openHouses += result.stats.openHouses;
              totalStats.skipped += result.stats.skipped;
              progress('Chunk ' + chunkNum + '/' + totalChunks + ': ' + result.stats.listings + ' listings, ' + result.stats.media + ' media, ' + result.stats.rooms + ' rooms');
            } else {
              progress('Chunk ' + chunkNum + '/' + totalChunks + ' error: ' + result.error);
              totalStats.skipped += chunk.length;
            }
          }
          progress(pass.label + ' pass complete: ' + totalStats.listings + ' total listings saved so far');
        }

        if (totalStats.listings === 0 && totalStats.skipped === 0) {
          send('complete', { summary: { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0 } });
          controller.close(); return;
        }
        
        progress('Updating hierarchy counts...');
        await updateHierarchyCounts(municipalityId, areaId);
        progress('Hierarchy counts updated');

        send('complete', { summary: totalStats });
      } catch (error: any) {
        console.error('[HomesSync] Error:', error);
        send('error', { message: error.message || 'Unknown error' });
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
  });
}