import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get all areas with their municipalities and communities
    const { data: areas, error: areasError } = await supabase
      .from('treb_areas')
      .select('id, name, discovery_status, buildings_discovered, buildings_synced')
      .eq('is_active', true)
      .order('name');

    if (areasError) throw areasError;

    const tree = [];

    for (const area of areas || []) {
      // Get municipalities for this area
      const { data: municipalities, error: muniError } = await supabase
        .from('municipalities')
        .select('id, name, discovery_status, buildings_discovered, buildings_synced')
        .eq('area_id', area.id)
        .eq('is_active', true)
        .order('name');

      if (muniError) throw muniError;

      const muniWithCommunities = [];

      for (const muni of municipalities || []) {
        // Get communities for this municipality
        const { data: communities, error: commError } = await supabase
          .from('communities')
          .select('id, name, discovery_status, buildings_discovered, buildings_synced')
          .eq('municipality_id', muni.id)
          .eq('is_active', true)
          .order('name');

        if (commError) throw commError;

        muniWithCommunities.push({
          ...muni,
          communities: communities || []
        });
      }

      tree.push({
        ...area,
        municipalities: muniWithCommunities
      });
    }

    return NextResponse.json({
      success: true,
      tree,
      counts: {
        areas: areas?.length || 0,
        municipalities: tree.reduce((sum, a) => sum + a.municipalities.length, 0),
        communities: tree.reduce((sum, a) => sum + a.municipalities.reduce((s, m) => s + m.communities.length, 0), 0)
      }
    });

  } catch (error: any) {
    console.error('Geo tree error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
