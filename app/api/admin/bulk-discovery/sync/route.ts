import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { searchBuilding } from '@/lib/building-sync/search';
import { saveBuilding } from '@/lib/building-sync/save';

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================
// BATCH SIZE - Change this to adjust parallel sync count
// Recommended: 10 for normal, 20-50 for fast
// ============================================
const BATCH_SIZE = 100;

// Update hierarchy counts after sync
async function updateHierarchyCounts(municipalityId: string, areaId: string | null) {
  const { data: communities } = await supabase
    .from('communities')
    .select('id')
    .eq('municipality_id', municipalityId);

  for (const comm of communities || []) {
    const { data: commBuildings } = await supabase
      .from('discovered_buildings')
      .select('status')
      .eq('community_id', comm.id);
    
    await supabase
      .from('communities')
      .update({
        buildings_discovered: commBuildings?.length || 0,
        buildings_synced: commBuildings?.filter(b => b.status === 'synced').length || 0
      })
      .eq('id', comm.id);
  }

  const { data: muniBuildings } = await supabase
    .from('discovered_buildings')
    .select('status')
    .eq('municipality_id', municipalityId);

  await supabase
    .from('municipalities')
    .update({
      buildings_discovered: muniBuildings?.length || 0,
      buildings_synced: muniBuildings?.filter(b => b.status === 'synced').length || 0
    })
    .eq('id', municipalityId);

  if (areaId) {
    const { data: areaBuildings } = await supabase
      .from('discovered_buildings')
      .select('status')
      .eq('area_id', areaId);

    await supabase
      .from('treb_areas')
      .update({
        buildings_discovered: areaBuildings?.length || 0,
        buildings_synced: areaBuildings?.filter(b => b.status === 'synced').length || 0
      })
      .eq('id', areaId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { buildingIds } = await request.json();

    if (!buildingIds || !Array.isArray(buildingIds) || buildingIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Building IDs array is required' },
        { status: 400 }
      );
    }

    const { data: buildings, error: fetchError } = await supabase
      .from('discovered_buildings')
      .select('*')
      .in('id', buildingIds);

    if (fetchError) throw fetchError;

    if (!buildings || buildings.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No buildings found' },
        { status: 404 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (data: any) => {
          controller.enqueue(encoder.encode(`data:${JSON.stringify(data)}\n\n`));
        };

        let completed = 0;
        let failed = 0;

        console.log(`[BulkSync] Starting ${buildings.length} buildings with batch size ${BATCH_SIZE}`);

        // Process in batches
        for (let i = 0; i < buildings.length; i += BATCH_SIZE) {
          const batch = buildings.slice(i, i + BATCH_SIZE);
          console.log(`[BulkSync] Batch ${Math.floor(i/BATCH_SIZE) + 1}: ${batch.length} buildings`);

          // Process batch in parallel
          const promises = batch.map(async (building) => {
            const buildingName = building.building_name || `${building.street_number} ${building.street_name}`;
            
            try {
              // Update status to syncing
              await supabase
                .from('discovered_buildings')
                .update({ status: 'syncing' })
                .eq('id', building.id);

              sendProgress({
                type: 'progress',
                buildingId: building.id,
                buildingName,
                status: 'syncing',
                progress: { current: i + batch.indexOf(building) + 1, total: buildings.length, completed, failed }
              });

              // STEP 1: Direct search (no HTTP)
              console.log(`[BulkSync] Searching: ${buildingName}`);
              // Combine street name with suffix and direction
              const fullStreetName = [
                building.street_name,
                building.street_suffix,
                building.street_dir_suffix
              ].filter(Boolean).join(' ');

              const searchResult = await searchBuilding({
                streetNumber: building.street_number,
                streetName: fullStreetName,
                city: building.city,
                buildingName: buildingName
              });

              if (!searchResult.success || !searchResult.allListings || searchResult.allListings.length === 0) {
                throw new Error(searchResult.error || 'No listings found');
              }

              console.log(`[BulkSync] Found ${searchResult.allListings.length} listings for ${buildingName}`);

              // STEP 2: Direct save (no HTTP)
              console.log(`[BulkSync] Saving: ${buildingName}`);
              const saveResult = await saveBuilding(
                {
                  buildingName: buildingName,
                  streetNumber: building.street_number,
                  streetName: fullStreetName,
                  city: building.city,
                  slug: searchResult.building?.slug || '',
                  canonicalAddress: searchResult.building?.canonicalAddress || ''
                },
                searchResult.allListings
              );

              if (!saveResult.success) {
                throw new Error(saveResult.error || 'Save failed');
              }

              // Update discovered_building status
              await supabase
                .from('discovered_buildings')
                .update({
                  status: 'synced',
                  building_id: saveResult.building?.id || null,
                  synced_at: new Date().toISOString(),
                  retry_count: 0,
                  failed_reason: null
                })
                .eq('id', building.id);

              completed++;

              sendProgress({
                type: 'progress',
                buildingId: building.id,
                buildingName,
                status: 'synced',
                listingCount: searchResult.allListings.length,
                progress: { current: i + batch.indexOf(building) + 1, total: buildings.length, completed, failed }
              });

              console.log(`[BulkSync]  Synced: ${buildingName} (${saveResult.stats?.listings} listings)`);
              return { success: true, buildingId: building.id };

            } catch (error: any) {
              console.error(`[BulkSync]  Failed: ${buildingName}:`, error.message);

              await supabase
                .from('discovered_buildings')
                .update({
                  status: 'failed',
                  retry_count: (building.retry_count || 0) + 1,
                  failed_reason: error.message
                })
                .eq('id', building.id);

              failed++;

              sendProgress({
                type: 'progress',
                buildingId: building.id,
                buildingName,
                status: 'failed',
                error: error.message,
                progress: { current: i + batch.indexOf(building) + 1, total: buildings.length, completed, failed }
              });

              return { success: false, buildingId: building.id, error: error.message };
            }
          });

          // Wait for batch to complete
          await Promise.all(promises);
        }

        // Update hierarchy counts
        const firstBuilding = buildings[0];
        if (firstBuilding.municipality_id) {
          await updateHierarchyCounts(firstBuilding.municipality_id, firstBuilding.area_id);
        }

        sendProgress({
          type: 'complete',
          summary: { total: buildings.length, completed, failed }
        });

        console.log(`[BulkSync] Complete: ${completed} succeeded, ${failed} failed`);
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
    console.error('[BulkSync] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

