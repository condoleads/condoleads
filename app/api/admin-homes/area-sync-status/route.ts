// app/api/admin-homes/area-sync-status/route.ts
// Area-level overview — fast DB counts for all municipalities in an area
// No PropTx calls (fast) — PropTx comparison happens per-municipality via sync-status

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const areaId = request.nextUrl.searchParams.get('areaId');

  try {
    // If areaId provided, get municipalities for that area
    // If not, get ALL areas with their municipalities (full overview)
    if (areaId) {
      return NextResponse.json(await getAreaDetail(areaId));
    } else {
      return NextResponse.json(await getFullOverview());
    }
  } catch (error: any) {
    console.error('[AreaSyncStatus] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function getFullOverview() {
  // Get all areas with municipality counts
  const { data: areas } = await supabase
    .from('treb_areas')
    .select('id, name, homes_count')
    .order('name');

  if (!areas) return { areas: [], totals: {} };

  // Get DB counts per area per property type
  const areaStats = await Promise.all(areas.map(async (area) => {
    const [freeholdResult, condoResult, muniCount, lastSync] = await Promise.all([
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq('area_id', area.id).eq('property_type', 'Residential Freehold'),
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq('area_id', area.id).eq('property_type', 'Residential Condo & Other'),
      supabase.from('municipalities').select('id', { count: 'exact', head: true })
        .eq('area_id', area.id),
      supabase.from('sync_history')
        .select('completed_at, municipality_name, sync_status')
        .eq('sync_status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1),
    ]);

    const freehold = freeholdResult.count || 0;
    const condo = condoResult.count || 0;

    // Count how many municipalities have been synced at least once
    const { data: syncedMunis } = await supabase
      .from('sync_history')
      .select('municipality_id')
      .eq('sync_status', 'completed')
      .not('municipality_id', 'is', null);

    // Get unique municipality_ids that belong to this area
    const { data: areaMunis } = await supabase
      .from('municipalities').select('id').eq('area_id', area.id);
    const areaMuniIds = new Set((areaMunis || []).map(m => m.id));
    const syncedInArea = new Set(
      (syncedMunis || []).filter(s => areaMuniIds.has(s.municipality_id)).map(s => s.municipality_id)
    );

    return {
      id: area.id,
      name: area.name,
      municipality_count: muniCount.count || 0,
      municipalities_synced: syncedInArea.size,
      freehold_db: freehold,
      condo_db: condo,
      total_db: freehold + condo,
    };
  }));

  // Filter out areas with 0 municipalities
  const activeAreas = areaStats.filter(a => a.municipality_count > 0);

  // Grand totals
  const totals = {
    total_areas: activeAreas.length,
    total_municipalities: activeAreas.reduce((s, a) => s + a.municipality_count, 0),
    total_freehold: activeAreas.reduce((s, a) => s + a.freehold_db, 0),
    total_condo: activeAreas.reduce((s, a) => s + a.condo_db, 0),
    total_listings: activeAreas.reduce((s, a) => s + a.total_db, 0),
    total_synced_munis: activeAreas.reduce((s, a) => s + a.municipalities_synced, 0),
  };

  return { areas: activeAreas, totals };
}

async function getAreaDetail(areaId: string) {
  // Get area info
  const { data: area } = await supabase
    .from('treb_areas').select('id, name').eq('id', areaId).single();

  if (!area) return { error: 'Area not found' };

  // Get all municipalities in this area
  const { data: municipalities } = await supabase
    .from('municipalities')
    .select('id, name, homes_count')
    .eq('area_id', areaId)
    .order('name');

  if (!municipalities) return { area, municipalities: [] };

  // For each municipality: DB counts + last sync info
  const muniStats = await Promise.all(municipalities.map(async (muni) => {
    const [freeholdResult, condoResult, lastFreeholdSync, lastCondoSync, runningSync] = await Promise.all([
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq('municipality_id', muni.id).eq('property_type', 'Residential Freehold'),
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq('municipality_id', muni.id).eq('property_type', 'Residential Condo & Other'),
      supabase.from('sync_history')
        .select('completed_at, duration_seconds, listings_created, sync_status')
        .eq('municipality_id', muni.id).eq('property_type', 'Residential Freehold')
        .eq('sync_status', 'completed').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('sync_history')
        .select('completed_at, duration_seconds, listings_created, sync_status')
        .eq('municipality_id', muni.id).eq('property_type', 'Residential Condo & Other')
        .eq('sync_status', 'completed').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('sync_history')
        .select('id, property_type').eq('municipality_id', muni.id).eq('sync_status', 'running'),
    ]);

    return {
      id: muni.id,
      name: muni.name,
      freehold: {
        db_count: freeholdResult.count || 0,
        last_sync: lastFreeholdSync.data || null,
      },
      condo: {
        db_count: condoResult.count || 0,
        last_sync: lastCondoSync.data || null,
      },
      total_db: (freeholdResult.count || 0) + (condoResult.count || 0),
      is_synced: !!(lastFreeholdSync.data || lastCondoSync.data),
      is_running: (runningSync.data || []).length > 0,
    };
  }));

  return {
    area,
    municipalities: muniStats,
    totals: {
      freehold_db: muniStats.reduce((s, m) => s + m.freehold.db_count, 0),
      condo_db: muniStats.reduce((s, m) => s + m.condo.db_count, 0),
      total_db: muniStats.reduce((s, m) => s + m.total_db, 0),
      synced: muniStats.filter(m => m.is_synced).length,
      total: muniStats.length,
    },
  };
}
