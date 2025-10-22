// app/api/admin/buildings/list/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get all buildings
    const { data: buildings, error: buildingsError } = await supabase
      .from('buildings')
      .select('*')
      .order('created_at', { ascending: false });

    if (buildingsError) {
      throw buildingsError;
    }

    // Get listing counts for each building
    const buildingsWithCounts = await Promise.all(
      buildings.map(async (building) => {
        const { count } = await supabase
          .from('mls_listings')
          .select('*', { count: 'exact', head: true })
          .eq('building_id', building.id);

        return {
          id: building.id,
          building_name: building.building_name,
          canonical_address: building.canonical_address,
          slug: building.slug,
          last_synced_at: building.last_synced_at,
          sync_status: building.sync_status,
          listingCount: count || 0
        };
      })
    );

    return NextResponse.json({
      success: true,
      buildings: buildingsWithCounts
    });

  } catch (error: any) {
    console.error('Failed to list buildings:', error);
    return NextResponse.json(
      { error: 'Failed to list buildings', details: error.message },
      { status: 500 }
    );
  }
}
