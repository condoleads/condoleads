// app/api/admin/adjustments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - List all adjustments with scope details
export async function GET() {
  try {
    const { data: adjustments, error } = await supabase
      .from('adjustments')
      .select(`
        *,
        treb_areas (id, name),
        municipalities (id, name, code),
        neighbourhoods (id, name),
        communities (id, name),
        buildings (id, building_name)
      `)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Format with scope level info
    const formatted = (adjustments || []).map(adj => ({
      ...adj,
      scope_level: adj.building_id ? 'Building' :
                   adj.community_id ? 'Community' :
                   adj.neighbourhood_id ? 'Neighbourhood' :
                   adj.municipality_id ? 'Municipality' :
                   adj.area_id ? 'Area' : 'Generic',
      scope_name: adj.buildings?.building_name ||
                  adj.communities?.name ||
                  adj.neighbourhoods?.name ||
                  adj.municipalities?.code ||
                  adj.treb_areas?.name || 'Universal Default'
    }));

    // Get dropdown options
    const { data: areas } = await supabase.from('treb_areas').select('id, name').order('name');
    const { data: municipalities } = await supabase.from('municipalities').select('id, name, code').order('code');
    const { data: neighbourhoods } = await supabase.from('neighbourhoods').select('id, name').order('display_order');
    const { data: communities } = await supabase.from('communities').select('id, name').order('name');
    const { data: buildings } = await supabase.from('buildings').select('id, building_name').order('building_name');

    return NextResponse.json({
      success: true,
      adjustments: formatted,
      options: {
        areas: areas || [],
        municipalities: municipalities || [],
        neighbourhoods: neighbourhoods || [],
        communities: communities || [],
        buildings: buildings || []
      }
    });
  } catch (error: any) {
    console.error('Error fetching adjustments:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Create new adjustment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scope_level, scope_id, parking_value_sale, parking_value_lease, locker_value_sale, locker_value_lease } = body;

    // Build the insert object
    const insertData: any = {
      parking_value_sale: parking_value_sale || null,
      parking_value_lease: parking_value_lease || null,
      locker_value_sale: locker_value_sale || null,
      locker_value_lease: locker_value_lease || null
    };

    // Set the appropriate scope FK
    if (scope_level === 'area') insertData.area_id = scope_id;
    else if (scope_level === 'municipality') insertData.municipality_id = scope_id;
    else if (scope_level === 'neighbourhood') insertData.neighbourhood_id = scope_id;
    else if (scope_level === 'community') insertData.community_id = scope_id;
    else if (scope_level === 'building') insertData.building_id = scope_id;
    // else generic - all FKs stay null

    // Check if adjustment already exists for this scope
    let existingQuery = supabase.from('adjustments').select('id');
    if (scope_level === 'generic') {
      existingQuery = existingQuery
        .is('area_id', null)
        .is('municipality_id', null)
        .is('neighbourhood_id', null)
        .is('community_id', null)
        .is('building_id', null);
    } else if (scope_level === 'area') {
      existingQuery = existingQuery.eq('area_id', scope_id);
    } else if (scope_level === 'municipality') {
      existingQuery = existingQuery.eq('municipality_id', scope_id);
    } else if (scope_level === 'neighbourhood') {
      existingQuery = existingQuery.eq('neighbourhood_id', scope_id);
    } else if (scope_level === 'community') {
      existingQuery = existingQuery.eq('community_id', scope_id);
    } else if (scope_level === 'building') {
      existingQuery = existingQuery.eq('building_id', scope_id);
    }

    const { data: existing } = await existingQuery.single();

    if (existing) {
      return NextResponse.json({ error: 'Adjustment already exists for this scope. Use PUT to update.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('adjustments')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, adjustment: data });
  } catch (error: any) {
    console.error('Error creating adjustment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Update existing adjustment
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, parking_value_sale, parking_value_lease, locker_value_sale, locker_value_lease } = body;

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('adjustments')
      .update({
        parking_value_sale: parking_value_sale ?? null,
        parking_value_lease: parking_value_lease ?? null,
        locker_value_sale: locker_value_sale ?? null,
        locker_value_lease: locker_value_lease ?? null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, adjustment: data });
  } catch (error: any) {
    console.error('Error updating adjustment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Remove adjustment (except generic)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    // Check if this is the generic adjustment
    const { data: adj } = await supabase
      .from('adjustments')
      .select('*')
      .eq('id', id)
      .single();

    if (adj && !adj.area_id && !adj.municipality_id && !adj.neighbourhood_id && !adj.community_id && !adj.building_id) {
      return NextResponse.json({ error: 'Cannot delete generic adjustment. Update it instead.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('adjustments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting adjustment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
