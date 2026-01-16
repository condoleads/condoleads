// app/api/admin/psf-analytics/buildings/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';

  try {
    // Get buildings with PSF summary data
    let query = supabase
      .from('building_psf_summary')
      .select(`
        building_id,
        sale_avg_psf,
        sale_median_psf,
        sale_count,
        lease_avg_psf,
        lease_median_psf,
        lease_count,
        earliest_transaction,
        latest_transaction,
        buildings!inner (
          id,
          building_name,
          street_number,
          street_name
        )
      `)
      .order('sale_count', { ascending: false, nullsFirst: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching buildings:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Transform and filter by search
    let buildings = (data || []).map((row: any) => ({
      id: row.building_id,
      building_name: row.buildings.building_name,
      street_number: row.buildings.street_number,
      street_name: row.buildings.street_name,
      sale_avg_psf: row.sale_avg_psf ? parseFloat(row.sale_avg_psf) : null,
      sale_median_psf: row.sale_median_psf ? parseFloat(row.sale_median_psf) : null,
      sale_count: row.sale_count || 0,
      lease_avg_psf: row.lease_avg_psf ? parseFloat(row.lease_avg_psf) : null,
      lease_median_psf: row.lease_median_psf ? parseFloat(row.lease_median_psf) : null,
      lease_count: row.lease_count || 0,
      earliest_transaction: row.earliest_transaction,
      latest_transaction: row.latest_transaction,
    }));

    // Filter by search term
    if (search) {
      const searchLower = search.toLowerCase();
      buildings = buildings.filter((b: any) =>
        b.building_name?.toLowerCase().includes(searchLower) ||
        b.street_name?.toLowerCase().includes(searchLower)
      );
    }

    return NextResponse.json({
      success: true,
      buildings,
      count: buildings.length,
    });
  } catch (error) {
    console.error('Buildings API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch buildings' },
      { status: 500 }
    );
  }
}