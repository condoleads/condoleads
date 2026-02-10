import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type PropertyTypeFilter = 'freehold' | 'condo' | 'both';

function getDbPropertyTypes(pt: PropertyTypeFilter): string[] {
  switch (pt) {
    case 'freehold': return ['Residential Freehold'];
    case 'condo': return ['Residential Condo & Other'];
    case 'both': return ['Residential Freehold', 'Residential Condo & Other'];
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const areaId = searchParams.get('areaId');
    const municipalityId = searchParams.get('municipalityId');
    const communityId = searchParams.get('communityId');
    const propertyType = (searchParams.get('propertyType') || 'freehold') as PropertyTypeFilter;

    let geoFilter: string;
    let geoValue: string;
    if (communityId) { geoFilter = 'community_id'; geoValue = communityId; }
    else if (municipalityId) { geoFilter = 'municipality_id'; geoValue = municipalityId; }
    else if (areaId) { geoFilter = 'area_id'; geoValue = areaId; }
    else { return NextResponse.json({ success: false, error: 'Provide areaId, municipalityId, or communityId' }, { status: 400 }); }

    const dbTypes = getDbPropertyTypes(propertyType);

    const { count: total } = await supabase
      .from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter, geoValue).in('property_type', dbTypes);

    const { count: active } = await supabase
      .from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter, geoValue).in('property_type', dbTypes).eq('standard_status', 'Active');

    const { count: sold } = await supabase
      .from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter, geoValue).in('property_type', dbTypes).in('mls_status', ['Sold', 'Sld']);

    const { count: leased } = await supabase
      .from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter, geoValue).in('property_type', dbTypes).in('mls_status', ['Leased', 'Lsd']);

    const { data: subtypeData } = await supabase
      .from('mls_listings').select('property_subtype')
      .eq(geoFilter, geoValue).in('property_type', dbTypes);

    const subtypes: Record<string, number> = {};
    for (const row of subtypeData || []) {
      const st = (row.property_subtype || 'Unknown').trim();
      subtypes[st] = (subtypes[st] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      stats: { total: total || 0, active: active || 0, sold: sold || 0, leased: leased || 0, subtypes }
    });
  } catch (error: any) {
    console.error('[HomesDbStats] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}