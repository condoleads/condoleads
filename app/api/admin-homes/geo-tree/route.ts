import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const [areasRes, munisRes, commsRes] = await Promise.all([
      supabase.from('treb_areas').select('id, name, homes_count, is_active').eq('is_active', true).order('name'),
      supabase.from('municipalities').select('id, name, area_id, homes_count, is_active').eq('is_active', true).order('name'),
      supabase.from('communities').select('id, name, municipality_id, homes_count, is_active').eq('is_active', true).order('name')
    ]);

    if (areasRes.error) throw areasRes.error;
    if (munisRes.error) throw munisRes.error;
    if (commsRes.error) throw commsRes.error;

    const communityMap = new Map<string, any[]>();
    for (const comm of commsRes.data || []) {
      if (!communityMap.has(comm.municipality_id)) communityMap.set(comm.municipality_id, []);
      communityMap.get(comm.municipality_id)!.push({ id: comm.id, name: comm.name, homes_count: comm.homes_count || 0 });
    }

    const muniMap = new Map<string, any[]>();
    for (const muni of munisRes.data || []) {
      if (!muniMap.has(muni.area_id)) muniMap.set(muni.area_id, []);
      muniMap.get(muni.area_id)!.push({
        id: muni.id, name: muni.name, homes_count: muni.homes_count || 0,
        communities: communityMap.get(muni.id) || []
      });
    }

    const tree = (areasRes.data || []).map(area => ({
      id: area.id, name: area.name, homes_count: area.homes_count || 0,
      municipalities: muniMap.get(area.id) || []
    }));

    return NextResponse.json({ success: true, tree });
  } catch (error: any) {
    console.error('[HomesGeoTree] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}