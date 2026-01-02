// app/api/admin/adjustments/resolve/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const buildingId = searchParams.get('buildingId');

  if (!buildingId) {
    return NextResponse.json({ error: 'buildingId required' }, { status: 400 });
  }

  try {
    // Get building with full hierarchy
    const { data: building, error: buildingError } = await supabase
      .from('buildings')
      .select(`
        id,
        building_name,
        parking_value_sale,
        parking_value_lease,
        locker_value_sale,
        locker_value_lease,
        community_id,
        communities (
          id,
          name,
          municipality_id,
          municipalities (
            id,
            name,
            code,
            area_id
          )
        )
      `)
      .eq('id', buildingId)
      .single();

    if (buildingError || !building) {
      return NextResponse.json({ error: 'Building not found' }, { status: 404 });
    }

    const community = building.communities as any;
    const municipality = community?.municipalities;
    const areaId = municipality?.area_id;
    const municipalityId = municipality?.id;
    const communityId = community?.id;

    // Get neighbourhood for this municipality
    let neighbourhoodId = null;
    if (municipalityId) {
      const { data: neighbourhoodMapping } = await supabase
        .from('municipality_neighbourhoods')
        .select('neighbourhood_id')
        .eq('municipality_id', municipalityId)
        .single();
      neighbourhoodId = neighbourhoodMapping?.neighbourhood_id;
    }

    // Fetch all relevant adjustments
    const { data: allAdjustments } = await supabase
      .from('adjustments')
      .select('*');

    // Filter relevant adjustments
    const relevantAdjustments = (allAdjustments || []).filter(adj => {
      if (adj.building_id === buildingId) return true;
      if (communityId && adj.community_id === communityId) return true;
      if (neighbourhoodId && adj.neighbourhood_id === neighbourhoodId) return true;
      if (municipalityId && adj.municipality_id === municipalityId) return true;
      if (areaId && adj.area_id === areaId) return true;
      if (!adj.building_id && !adj.community_id && !adj.neighbourhood_id && !adj.municipality_id && !adj.area_id) return true;
      return false;
    });

    // Organize by scope level
    const adjustmentsByLevel: Record<string, any> = {
      building: null,
      community: null,
      neighbourhood: null,
      municipality: null,
      area: null,
      generic: null
    };

    relevantAdjustments.forEach(adj => {
      if (adj.building_id) adjustmentsByLevel.building = adj;
      else if (adj.community_id) adjustmentsByLevel.community = adj;
      else if (adj.neighbourhood_id) adjustmentsByLevel.neighbourhood = adj;
      else if (adj.municipality_id) adjustmentsByLevel.municipality = adj;
      else if (adj.area_id) adjustmentsByLevel.area = adj;
      else adjustmentsByLevel.generic = adj;
    });

    // Building's own fields override everything
    const buildingOverrides = {
      parking_value_sale: building.parking_value_sale,
      parking_value_lease: building.parking_value_lease,
      locker_value_sale: building.locker_value_sale,
      locker_value_lease: building.locker_value_lease
    };

    // Resolve with cascade
    const resolve = (field: string): number | null => {
      const key = field as keyof typeof buildingOverrides;
      if (buildingOverrides[key] !== null) {
        return buildingOverrides[key];
      }
      const levels = ['building', 'community', 'neighbourhood', 'municipality', 'area', 'generic'];
      for (const level of levels) {
        const adj = adjustmentsByLevel[level];
        if (adj && adj[field] !== null) {
          return parseFloat(adj[field]);
        }
      }
      return null;
    };

    const resolved = {
      parking_value_sale: resolve('parking_value_sale'),
      parking_value_lease: resolve('parking_value_lease'),
      locker_value_sale: resolve('locker_value_sale'),
      locker_value_lease: resolve('locker_value_lease')
    };

    const getSource = (field: string): string => {
      const key = field as keyof typeof buildingOverrides;
      if (buildingOverrides[key] !== null) return 'Building (direct)';
      const levels = ['building', 'community', 'neighbourhood', 'municipality', 'area', 'generic'];
      for (const level of levels) {
        const adj = adjustmentsByLevel[level];
        if (adj && adj[field] !== null) {
          return level.charAt(0).toUpperCase() + level.slice(1);
        }
      }
      return 'None';
    };

    return NextResponse.json({
      success: true,
      buildingId,
      hierarchy: {
        building: building.building_name,
        community: community?.name || null,
        neighbourhoodId,
        municipality: municipality?.code || null,
        areaId
      },
      resolved,
      sources: {
        parking_value_sale: getSource('parking_value_sale'),
        parking_value_lease: getSource('parking_value_lease'),
        locker_value_sale: getSource('locker_value_sale'),
        locker_value_lease: getSource('locker_value_lease')
      },
      adjustmentsByLevel
    });
  } catch (error: any) {
    console.error('Error resolving adjustments:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
