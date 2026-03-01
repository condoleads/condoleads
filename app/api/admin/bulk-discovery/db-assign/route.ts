import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { refreshMaterializedViews } from '@/lib/db/refresh-views';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateSlug(name: string, streetNum: string, streetName: string, streetSuffix: string | null, streetDir: string | null, city: string): string {
  const parts = [name, streetNum, streetName, streetSuffix, streetDir, city].filter(Boolean);
  return parts.join('-').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

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
    buildings_synced: mb?.filter(b => b.status === 'synced' || b.status === 'db_linked').length || 0
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

async function assignBuildingThumbnails(buildingId: string) {
  try {
    const { data: listings } = await supabase
      .from('mls_listings')
      .select('id')
      .eq('building_id', buildingId)
      .limit(20);

    if (!listings || listings.length === 0) return;

    const listingIds = listings.map(l => l.id);

    const { data: photos } = await supabase
      .from('media')
      .select('media_url, listing_id, order_number, variant_type')
      .in('listing_id', listingIds)
      .eq('variant_type', 'thumbnail')
      .eq('order_number', 1)
      .order('listing_id');

    if (!photos || photos.length === 0) {
      const { data: fallback } = await supabase
        .from('media')
        .select('media_url, listing_id, order_number')
        .in('listing_id', listingIds)
        .eq('variant_type', 'thumbnail')
        .order('order_number', { ascending: true })
        .limit(20);

      if (!fallback || fallback.length === 0) return;

      const seen = new Set<string>();
      const thumbs: string[] = [];
      for (const p of fallback) {
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
        console.log(`[DBAssign] Assigned ${thumbs.length} thumbnails (fallback) for ${buildingId}`);
      }
      return;
    }

    const seen = new Set<string>();
    const thumbs: string[] = [];
    for (const p of photos) {
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
      console.log(`[DBAssign] Assigned ${thumbs.length} thumbnails for ${buildingId}`);
    }
  } catch (err) {
    console.error(`[DBAssign] Thumbnail failed for ${buildingId}:`, err);
  }
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

    console.log(`[DBAssign] Geo IDs backfilled for building ${buildingId}`);
  } catch (err) {
    console.error(`[DBAssign] Geo backfill failed for ${buildingId}:`, err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { buildingIds } = await request.json();

    if (!buildingIds || !Array.isArray(buildingIds) || buildingIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Building IDs array is required' }, { status: 400 });
    }

    const { data: buildings, error: fetchError } = await supabase
      .from('discovered_buildings')
      .select('*')
      .in('id', buildingIds);

    if (fetchError) throw fetchError;
    if (!buildings || buildings.length === 0) {
      return NextResponse.json({ success: false, error: 'No buildings found' }, { status: 404 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data:${JSON.stringify(data)}\n\n`));
        };

        let completed = 0;
        let failed = 0;

        console.log(`[DBAssign] Starting DB assign for ${buildings.length} buildings`);

        for (const building of buildings) {
          const buildingName = building.building_name || `${building.street_number} ${building.street_name}`;
          const fullStreetName = [building.street_name, building.street_suffix, building.street_dir_suffix].filter(Boolean).join(' ');

          try {
            await supabase.from('discovered_buildings').update({ status: 'syncing' }).eq('id', building.id);
            send({
              type: 'progress', buildingId: building.id, buildingName,
              status: 'syncing',
              progress: { current: completed + failed + 1, total: buildings.length, completed, failed }
            });

            // STEP 1: Generate slug and canonical address
            const hasRealName = building.building_name && building.building_name.trim();
const slugParts = hasRealName 
  ? [building.building_name, building.street_number, fullStreetName, building.city]
  : [building.street_number, fullStreetName, building.city];
const slug = slugParts.filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            const canonicalAddress = `${building.street_number} ${fullStreetName}, ${building.city}`;

            console.log(`[DBAssign] Processing: ${buildingName} (${canonicalAddress})`);

            // STEP 2: Check if building already exists
            const { data: existing } = await supabase
              .from('buildings').select('id').eq('slug', slug).single();

            let buildingId: string;

            if (existing) {
              buildingId = existing.id;
              console.log(`[DBAssign] Building exists: ${buildingName} (${buildingId})`);
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
              buildingId = newBldg.id;
              console.log(`[DBAssign] Created building: ${buildingName} (${buildingId})`);
            }

            // STEP 3: Link existing DB listings by address match using RPC
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
              console.error(`[DBAssign] RPC link error:`, rpcErr);
            }

            const actualLinked = linkedCount || 0;
            console.log(`[DBAssign] Linked ${actualLinked} listings to ${buildingName}`);

            // STEP 4: Backfill geo IDs
            await backfillListingGeoIds(buildingId);

            // STEP 5: Auto-assign thumbnails
            await assignBuildingThumbnails(buildingId);

            // STEP 6: Update discovered_building status
            await supabase.from('discovered_buildings').update({
              status: 'db_linked',
              building_id: buildingId,
              synced_at: new Date().toISOString(),
              failed_reason: null
            }).eq('id', building.id);

            completed++;
            send({
              type: 'progress', buildingId: building.id, buildingName,
              status: 'db_linked', linkedListings: actualLinked,
              progress: { current: completed + failed, total: buildings.length, completed, failed }
            });

            console.log(`[DBAssign] âœ… ${buildingName}: ${actualLinked} listings linked`);

          } catch (err: any) {
            failed++;
            console.error(`[DBAssign] âŒ ${buildingName}:`, err.message);

            await supabase.from('discovered_buildings').update({
              status: 'failed',
              failed_reason: `DB Assign: ${err.message}`,
              retry_count: (building.retry_count || 0) + 1
            }).eq('id', building.id);

            send({
              type: 'progress', buildingId: building.id, buildingName,
              status: 'failed',
              progress: { current: completed + failed, total: buildings.length, completed, failed }
            });
          }
        }

        // Update hierarchy counts
        const uniqueMunis = [...new Set(buildings.map(b => b.municipality_id))];
        for (const muniId of uniqueMunis) {
          const areaId = buildings.find(b => b.municipality_id === muniId)?.area_id;
          await updateHierarchyCounts(muniId, areaId);
        }

        send({
          type: 'complete',
          progress: { current: buildings.length, total: buildings.length, completed, failed }
        });

        await refreshMaterializedViews();
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error: any) {
    console.error('[DBAssign] Fatal error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


