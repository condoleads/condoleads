import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Fetch hierarchy + live listing counts in parallel
    const [areasRes, munisRes, commsRes, muniCountsRes, commCountsRes] = await Promise.all([
      supabase.from('treb_areas').select('id, name, is_active').eq('is_active', true).order('name'),
      supabase.from('municipalities').select('id, name, area_id, is_active').eq('is_active', true).order('name'),
      supabase.from('communities').select('id, name, municipality_id, is_active').eq('is_active', true).order('name'),
      // Live counts per municipality
      supabase.rpc('get_municipality_listing_counts'),
      // Live counts per community
      supabase.rpc('get_community_listing_counts'),
    ]);

    if (areasRes.error) throw areasRes.error;
    if (munisRes.error) throw munisRes.error;
    if (commsRes.error) throw commsRes.error;

    // Debug RPC results
    console.log('[GeoTree] muniCounts:', { error: muniCountsRes.error?.message, count: muniCountsRes.data?.length });
    console.log('[GeoTree] commCounts:', { error: commCountsRes.error?.message, count: commCountsRes.data?.length });
    // Build count maps (fallback to empty if RPC not yet created)
    const muniCounts = new Map<string, number>();
    for (const row of muniCountsRes.data || []) {
      muniCounts.set(row.municipality_id, row.listing_count);
    }

    const commCounts = new Map<string, number>();
    for (const row of commCountsRes.data || []) {
      commCounts.set(row.community_id, row.listing_count);
    }

    // Build tree
    const communityMap = new Map<string, any[]>();
    for (const comm of commsRes.data || []) {
      if (!communityMap.has(comm.municipality_id)) communityMap.set(comm.municipality_id, []);
      communityMap.get(comm.municipality_id)!.push({
        id: comm.id,
        name: comm.name,
        homes_count: commCounts.get(comm.id) || 0,
      });
    }

    const muniMap = new Map<string, any[]>();
    for (const muni of munisRes.data || []) {
      if (!muniMap.has(muni.area_id)) muniMap.set(muni.area_id, []);
      muniMap.get(muni.area_id)!.push({
        id: muni.id,
        name: muni.name,
        homes_count: muniCounts.get(muni.id) || 0,
        communities: communityMap.get(muni.id) || [],
      });
    }

    const tree = (areasRes.data || []).map(area => {
      const areaMunis = muniMap.get(area.id) || [];
      const areaTotal = areaMunis.reduce((sum: number, m: any) => sum + m.homes_count, 0);
      return {
        id: area.id,
        name: area.name,
        homes_count: areaTotal,
        municipalities: areaMunis,
      };
    });

    return NextResponse.json({ success: true, tree });
  } catch (error: any) {
    console.error('[HomesGeoTree] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}