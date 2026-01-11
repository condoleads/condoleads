import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Fetch discovered buildings with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const communityId = searchParams.get('communityId');
    const municipalityId = searchParams.get('municipalityId');
    const status = searchParams.get('status');

    let query = supabase
      .from('discovered_buildings')
      .select('*')
      .order('building_name', { ascending: true, nullsFirst: false });

    if (communityId) {
      query = query.eq('community_id', communityId);
    }

    if (municipalityId) {
      query = query.eq('municipality_id', municipalityId);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      buildings: data || []
    });

  } catch (error: any) {
    console.error('Fetch buildings error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update building fields (name, address, status, etc.)
export async function PUT(request: NextRequest) {
  try {
    const { buildings } = await request.json();

    if (!buildings || !Array.isArray(buildings)) {
      return NextResponse.json(
        { success: false, error: 'Buildings array is required' },
        { status: 400 }
      );
    }

    const results = [];

    for (const building of buildings) {
      const { id, building_name, street_number, street_name, street_suffix, status, retry_count, failed_reason } = building;
      
      if (!id) continue;

      // Build update object with only provided fields
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (building_name !== undefined) {
        updateData.building_name = building_name;
      }

      if (street_number !== undefined) {
        updateData.street_number = street_number;
      }

      if (street_name !== undefined) {
        updateData.street_name = street_name;
      }

      if (street_suffix !== undefined) {
        updateData.street_suffix = street_suffix;
      }

      if (status !== undefined) {
        updateData.status = status;
      }

      if (retry_count !== undefined) {
        updateData.retry_count = retry_count;
      }

      if (failed_reason !== undefined) {
        updateData.failed_reason = failed_reason;
      }

      const { data, error } = await supabase
        .from('discovered_buildings')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error(`Failed to update building ${id}:`, error);
        results.push({ id, success: false, error: error.message });
      } else {
        results.push({ id, success: true, data });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      updated: results.filter(r => r.success).length
    });

  } catch (error: any) {
    console.error('Update buildings error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
