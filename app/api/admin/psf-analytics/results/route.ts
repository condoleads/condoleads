// app/api/admin/psf-analytics/results/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const type = searchParams.get('type') || 'sale'; // 'sale' or 'lease'
  const level = searchParams.get('level') || 'municipality'; // geo level
  const geoId = searchParams.get('geoId'); // specific geography
  const geoName = searchParams.get('geoName'); // for building address
  const months = parseInt(searchParams.get('months') || '24');

  const tableName = type === 'sale' ? 'psf_monthly_sale' : 'psf_monthly_lease';

  try {
    // Build query
    let query = supabase
      .from(tableName)
      .select(`
        *,
        treb_areas(name),
        municipalities(name),
        communities(name),
        buildings(building_name, slug)
      `)
      .eq('geo_level', level)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(months * 50); // Allow for multiple geographies

    // Filter by specific geography
    if (geoId) {
      if (level === 'area') query = query.eq('area_id', geoId);
      else if (level === 'municipality') query = query.eq('municipality_id', geoId);
      else if (level === 'community') query = query.eq('community_id', geoId);
      else if (level === 'building') query = query.eq('building_id', geoId);
    }

    if (geoName && level === 'building') {
      query = query.eq('building_address', geoName);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[PSF Results] Query error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      type,
      level,
      count: data?.length || 0,
      data: data || [],
    });
  } catch (error) {
    console.error('[PSF Results] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Get geographic tree for navigation
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === 'geo-tree') {
    // Get all areas with PSF data
    const { data: areas } = await supabase
      .from('treb_areas')
      .select('id, name')
      .order('name');

    const { data: municipalities } = await supabase
      .from('municipalities')
      .select('id, name, area_id')
      .order('name');

    const { data: communities } = await supabase
      .from('communities')
      .select('id, name, municipality_id')
      .order('name');

    // Get PSF data counts per level
    const { data: saleCounts } = await supabase
      .from('psf_monthly_sale')
      .select('geo_level, area_id, municipality_id, community_id')
      .limit(10000);

    const { data: leaseCounts } = await supabase
      .from('psf_monthly_lease')
      .select('geo_level, area_id, municipality_id, community_id')
      .limit(10000);

    // Count records per geography
    const saleByArea = new Map<string, number>();
    const saleByMuni = new Map<string, number>();
    const saleByComm = new Map<string, number>();

    saleCounts?.forEach(r => {
      if (r.area_id) saleByArea.set(r.area_id, (saleByArea.get(r.area_id) || 0) + 1);
      if (r.municipality_id) saleByMuni.set(r.municipality_id, (saleByMuni.get(r.municipality_id) || 0) + 1);
      if (r.community_id) saleByComm.set(r.community_id, (saleByComm.get(r.community_id) || 0) + 1);
    });

    const leaseByArea = new Map<string, number>();
    const leaseByMuni = new Map<string, number>();
    const leaseByComm = new Map<string, number>();

    leaseCounts?.forEach(r => {
      if (r.area_id) leaseByArea.set(r.area_id, (leaseByArea.get(r.area_id) || 0) + 1);
      if (r.municipality_id) leaseByMuni.set(r.municipality_id, (leaseByMuni.get(r.municipality_id) || 0) + 1);
      if (r.community_id) leaseByComm.set(r.community_id, (leaseByComm.get(r.community_id) || 0) + 1);
    });

    return NextResponse.json({
      success: true,
      areas: areas?.map(a => ({
        ...a,
        saleCount: saleByArea.get(a.id) || 0,
        leaseCount: leaseByArea.get(a.id) || 0,
      })) || [],
      municipalities: municipalities?.map(m => ({
        ...m,
        saleCount: saleByMuni.get(m.id) || 0,
        leaseCount: leaseByMuni.get(m.id) || 0,
      })) || [],
      communities: communities?.map(c => ({
        ...c,
        saleCount: saleByComm.get(c.id) || 0,
        leaseCount: leaseByComm.get(c.id) || 0,
      })) || [],
    });
  }

  if (action === 'summary') {
    // Get overall summary stats
    const { data: saleStats } = await supabase
      .from('psf_monthly_sale')
      .select('geo_level, all_sample_size, all_avg_psf')
      .limit(5000);

    const { data: leaseStats } = await supabase
      .from('psf_monthly_lease')
      .select('geo_level, all_sample_size, all_avg_psf')
      .limit(5000);

    const summary = {
      sale: {
        totalRecords: saleStats?.reduce((sum, r) => sum + (r.all_sample_size || 0), 0) || 0,
        periodCount: saleStats?.length || 0,
        avgPsf: saleStats?.length 
          ? Math.round(saleStats.filter(r => r.all_avg_psf).reduce((sum, r) => sum + r.all_avg_psf, 0) / saleStats.filter(r => r.all_avg_psf).length)
          : 0,
      },
      lease: {
        totalRecords: leaseStats?.reduce((sum, r) => sum + (r.all_sample_size || 0), 0) || 0,
        periodCount: leaseStats?.length || 0,
        avgPsf: leaseStats?.length
          ? Math.round(leaseStats.filter(r => r.all_avg_psf).reduce((sum, r) => sum + r.all_avg_psf, 0) / leaseStats.filter(r => r.all_avg_psf).length * 100) / 100
          : 0,
      },
    };

    return NextResponse.json({ success: true, summary });
  }

  return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
}

