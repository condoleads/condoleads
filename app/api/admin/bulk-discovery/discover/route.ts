import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Extract first meaningful word from street name for grouping
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

// Paginate through ALL results - no limits
async function fetchAllListings(
  baseUrl: string,
  filter: string,
  select: string,
  headers: any
): Promise<any[]> {
  const allResults: any[] = [];
  let skip = 0;
  const pageSize = 5000;

  while (true) {
    const url = `${baseUrl}Property?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=${pageSize}&$skip=${skip}`;

    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) break;

      const data = await resp.json();
      const results = data.value || [];

      if (results.length === 0) break;
      
      allResults.push(...results);

      if (results.length < pageSize) break;
      skip += pageSize;
    } catch (error) {
      console.error(`Fetch error at skip=${skip}:`, error);
      break;
    }
  }

  return allResults;
}

// Search for building name for a specific address
async function findBuildingName(
  baseUrl: string,
  headers: any,
  streetNumber: string,
  streetKey: string,
  city: string
): Promise<string | null> {
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
      if (listing.BuildingName && listing.BuildingName.trim()) {
        const name = listing.BuildingName.trim();
        nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
      }
    }
    
    let bestName: string | null = null;
    let maxCount = 0;
    for (const [name, count] of nameCounts) {
      if (count > maxCount) {
        maxCount = count;
        bestName = name;
      }
    }

    return bestName;
  } catch (error) {
    console.error(`Error finding name for ${streetNumber} ${streetKey}:`, error);
    return null;
  }
}

// Update counts for all hierarchy levels
async function updateHierarchyCounts(municipalityId: string, areaId: string | null) {
  // Get all communities for this municipality
  const { data: communities } = await supabase
    .from('communities')
    .select('id')
    .eq('municipality_id', municipalityId);

  // Update each community's count
  for (const comm of communities || []) {
    const { data: commBuildings } = await supabase
      .from('discovered_buildings')
      .select('status')
      .eq('community_id', comm.id);
    
    const discovered = commBuildings?.length || 0;
    const synced = commBuildings?.filter(b => b.status === 'synced').length || 0;

    await supabase
      .from('communities')
      .update({
        buildings_discovered: discovered,
        buildings_synced: synced,
        discovery_status: discovered === 0 ? 'not_started' : synced === discovered ? 'complete' : 'discovered'
      })
      .eq('id', comm.id);
  }

  // Update municipality count (total of all buildings in municipality)
  const { data: muniBuildings } = await supabase
    .from('discovered_buildings')
    .select('status')
    .eq('municipality_id', municipalityId);

  const muniDiscovered = muniBuildings?.length || 0;
  const muniSynced = muniBuildings?.filter(b => b.status === 'synced').length || 0;

  await supabase
    .from('municipalities')
    .update({
      buildings_discovered: muniDiscovered,
      buildings_synced: muniSynced,
      discovery_status: muniDiscovered === 0 ? 'not_started' : muniSynced === muniDiscovered ? 'complete' : 'discovered',
      last_discovery_at: new Date().toISOString()
    })
    .eq('id', municipalityId);

  // Update area count (total of all municipalities in area)
  if (areaId) {
    const { data: areaBuildings } = await supabase
      .from('discovered_buildings')
      .select('status')
      .eq('area_id', areaId);

    const areaDiscovered = areaBuildings?.length || 0;
    const areaSynced = areaBuildings?.filter(b => b.status === 'synced').length || 0;

    await supabase
      .from('treb_areas')
      .update({
        buildings_discovered: areaDiscovered,
        buildings_synced: areaSynced,
        discovery_status: areaDiscovered === 0 ? 'not_started' : areaSynced === areaDiscovered ? 'complete' : 'discovered'
      })
      .eq('id', areaId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { communityId, communityName, municipalityId, municipalityName } = await request.json();

    if (!municipalityId || !municipalityName) {
      return NextResponse.json(
        { success: false, error: 'Municipality is required' },
        { status: 400 }
      );
    }

    // Get area info
    const { data: muniData } = await supabase
      .from('municipalities')
      .select('area_id, treb_areas(id, name)')
      .eq('id', municipalityId)
      .single();

    const areaId = muniData?.area_id;

    // Load ALL communities for this municipality (for mapping CityRegion -> community_id)
    const { data: allCommunities } = await supabase
      .from('communities')
      .select('id, name')
      .eq('municipality_id', municipalityId);

    // Create a map of community name -> community_id
    const communityMap = new Map<string, string>();
    for (const comm of allCommunities || []) {
      communityMap.set(comm.name.toLowerCase(), comm.id);
    }

    const baseUrl = process.env.PROPTX_RESO_API_URL;
    const token = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_DLA_TOKEN || process.env.PROPTX_BEARER_TOKEN;

    if (!baseUrl || !token) {
      return NextResponse.json(
        { success: false, error: 'PropTx configuration missing' },
        { status: 500 }
      );
    }

    let baseFilter = `City eq '${municipalityName}' and PropertySubType eq 'Condo Apartment'`;
    if (communityName) {
      baseFilter += ` and CityRegion eq '${communityName}'`;
    }

    const select = 'StreetNumber,StreetName,StreetSuffix,StreetDirSuffix,City,CityRegion,BuildingName';
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    };

    console.log('Discovering buildings:', { municipalityName, communityName });

    // STEP 1: Fetch ALL listings - all statuses (paginated, no limit)
    console.log('Fetching ALL listings (all statuses)...');
    const allListings = await fetchAllListings(baseUrl, baseFilter, select, headers);
    console.log(`Total listings found: ${allListings.length}`);

    // STEP 2: Group by street number + first word
    const buildingMap = new Map<string, any>();

    for (const listing of allListings) {
      if (!listing.StreetNumber || !listing.StreetName) continue;

      const streetKey = getStreetKey(listing.StreetName);
      if (!streetKey || streetKey.length < 3) continue;

      const key = `${listing.StreetNumber}|${streetKey}`.toLowerCase();

      if (!buildingMap.has(key)) {
        // Look up community_id from CityRegion
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
          community_id: communityId || matchedCommunityId, // Use passed communityId OR lookup from CityRegion
          names: new Map<string, number>(),
          listing_count: 0
        });
      }

      const building = buildingMap.get(key)!;
      building.listing_count++;

      if (listing.BuildingName && listing.BuildingName.trim()) {
        const name = listing.BuildingName.trim();
        building.names.set(name, (building.names.get(name) || 0) + 1);
      }
    }

    console.log(`Grouped into ${buildingMap.size} unique buildings`);

    // STEP 3: For buildings WITHOUT names, do targeted search
    const buildingsWithoutNames = Array.from(buildingMap.entries()).filter(([_, b]) => b.names.size === 0);
    console.log(`Buildings without names: ${buildingsWithoutNames.length} - searching...`);

    let namesFoundCount = 0;
    for (const [key, building] of buildingsWithoutNames) {
      const foundName = await findBuildingName(
        baseUrl,
        headers,
        building.street_number,
        building.street_key,
        building.city
      );

      if (foundName) {
        building.names.set(foundName, 1);
        namesFoundCount++;
        console.log(`  Found: ${building.street_number} ${building.street_key} -> '${foundName}'`);
      }
    }

    console.log(`Found names for ${namesFoundCount} additional buildings`);

    // Load existing discovered buildings (all for municipality, not just one community)
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
      .from('buildings')
      .select('street_number, street_name, city');

    const syncedSet = new Set<string>();
    for (const sb of syncedBuildings || []) {
      const streetKey = getStreetKey(sb.street_name);
      const key = `${sb.street_number}|${streetKey}`.toLowerCase();
      syncedSet.add(key);
    }

    // Prepare upserts
    const buildingsToUpsert = [];

    for (const [key, building] of buildingMap) {
      let bestName: string | null = null;
      let maxCount = 0;
      for (const [name, count] of building.names) {
        if (count > maxCount) {
          maxCount = count;
          bestName = name;
        }
      }

      const existing = existingMap.get(key);
      const isSynced = syncedSet.has(key) || existing?.status === 'synced';

      // Keep manual edits to building_name
      const finalName = existing?.building_name || bestName;
      
      // Use existing community_id if already set, otherwise use the new one
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
        proptx_area: (muniData?.treb_areas as any)?.name || null,
        proptx_municipality: municipalityName,
        proptx_community: building.proptx_community,
        listing_count: building.listing_count,
        status: isSynced ? 'synced' : (existing?.status || 'pending'),
        building_id: existing?.building_id || null,
        discovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    // Upsert in batches
    const batchSize = 100;
    for (let i = 0; i < buildingsToUpsert.length; i += batchSize) {
      const batch = buildingsToUpsert.slice(i, i + batchSize);
      const { error: upsertError } = await supabase
        .from('discovered_buildings')
        .upsert(batch, {
          onConflict: 'street_number,street_key,municipality_id',
          ignoreDuplicates: false
        });

      if (upsertError) {
        console.error('Upsert error:', upsertError);
      }
    }

    // Update counts for ALL hierarchy levels
    await updateHierarchyCounts(municipalityId, areaId);

    // Fetch results based on selection
    let fetchQuery = supabase
      .from('discovered_buildings')
      .select('*')
      .eq('municipality_id', municipalityId)
      .order('building_name', { ascending: true, nullsFirst: false });

    if (communityId) {
      fetchQuery = fetchQuery.eq('community_id', communityId);
    }

    const { data: savedBuildings, error: fetchError } = await fetchQuery;

    if (fetchError) throw fetchError;

    const finalWithNames = savedBuildings?.filter(b => b.building_name).length || 0;
    const finalWithoutNames = (savedBuildings?.length || 0) - finalWithNames;

    return NextResponse.json({
      success: true,
      buildings: savedBuildings || [],
      summary: {
        total: savedBuildings?.length || 0,
        withNames: finalWithNames,
        withoutNames: finalWithoutNames,
        pending: savedBuildings?.filter(b => b.status === 'pending').length || 0,
        synced: savedBuildings?.filter(b => b.status === 'synced').length || 0,
        failed: savedBuildings?.filter(b => b.status === 'failed').length || 0,
        listingsSearched: {
          total: allListings.length
        },
        namesFoundViaSearch: namesFoundCount
      }
    });

  } catch (error: any) {
    console.error('Discovery error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
