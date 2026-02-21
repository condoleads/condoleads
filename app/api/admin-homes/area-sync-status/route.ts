// app/api/admin-homes/area-sync-status/route.ts
// Area-level overview — single RPC for DB counts + PropTx grand totals for coverage

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PROPTX_BASE_URL = process.env.PROPTX_RESO_API_URL;
const PROPTX_TOKEN = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_DLA_TOKEN || process.env.PROPTX_BEARER_TOKEN;

async function getPropTxCount(filter: string): Promise<number> {
  if (!PROPTX_BASE_URL || !PROPTX_TOKEN) return -1;
  try {
    const params = filter ? '$filter=' + encodeURIComponent(filter) + '&' : '';
    const url = PROPTX_BASE_URL + 'Property?' + params + '$count=true&$top=0';
    const resp = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + PROPTX_TOKEN, 'Accept': 'application/json' },
    });
    if (!resp.ok) return -1;
    const data = await resp.json();
    return data['@odata.count'] ?? data['odata.count'] ?? -1;
  } catch {
    return -1;
  }
}

export async function GET(request: NextRequest) {
  const areaId = request.nextUrl.searchParams.get('areaId');

  try {
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
  // 5 parallel queries instead of 146+
  const [
    { data: areas },
    { data: listingCounts },
    { data: allMunis },
    { data: syncedMunis },
    proptxFreehold,
    proptxCondo,
  ] = await Promise.all([
    supabase.from('treb_areas').select('id, name, homes_count').order('name'),
    supabase.rpc('get_area_listing_counts'),
    supabase.from('municipalities').select('id, area_id'),
    supabase.from('sync_history')
      .select('municipality_id')
      .eq('sync_status', 'completed')
      .not('municipality_id', 'is', null),
    getPropTxCount("PropertyType eq 'Residential Freehold'"),
    getPropTxCount("PropertyType eq 'Residential Condo & Other'"),
  ]);

  if (!areas) return { areas: [], totals: {} };

  // Build lookup maps from the single RPC result
  const countMap: Record<string, { freehold: number; condo: number }> = {};
  for (const row of (listingCounts || [])) {
    if (!countMap[row.area_id]) countMap[row.area_id] = { freehold: 0, condo: 0 };
    if (row.property_type === 'Residential Freehold') countMap[row.area_id].freehold = Number(row.cnt);
    else if (row.property_type === 'Residential Condo & Other') countMap[row.area_id].condo = Number(row.cnt);
  }

  // Municipality counts per area
  const munisByArea: Record<string, string[]> = {};
  for (const m of (allMunis || [])) {
    if (!munisByArea[m.area_id]) munisByArea[m.area_id] = [];
    munisByArea[m.area_id].push(m.id);
  }

  // Synced municipality set
  const syncedSet = new Set((syncedMunis || []).map(s => s.municipality_id));

  // Build area stats — pure map, zero additional queries
  const areaStats = areas.map(area => {
    const counts = countMap[area.id] || { freehold: 0, condo: 0 };
    const areaMuniIds = munisByArea[area.id] || [];
    const syncedInArea = areaMuniIds.filter(id => syncedSet.has(id)).length;

    return {
      id: area.id,
      name: area.name,
      municipality_count: areaMuniIds.length,
      municipalities_synced: syncedInArea,
      freehold_db: counts.freehold,
      condo_db: counts.condo,
      total_db: counts.freehold + counts.condo,
    };
  });

  const activeAreas = areaStats.filter(a => a.municipality_count > 0);

  const dbFreehold = activeAreas.reduce((s, a) => s + a.freehold_db, 0);
  const dbCondo = activeAreas.reduce((s, a) => s + a.condo_db, 0);
  const dbTotal = dbFreehold + dbCondo;
  const proptxTotal = (proptxFreehold >= 0 && proptxCondo >= 0) ? proptxFreehold + proptxCondo : null;

  const totals = {
    total_areas: activeAreas.length,
    total_municipalities: activeAreas.reduce((s, a) => s + a.municipality_count, 0),
    total_synced_munis: activeAreas.reduce((s, a) => s + a.municipalities_synced, 0),
    // DB counts
    total_freehold: dbFreehold,
    total_condo: dbCondo,
    total_listings: dbTotal,
    // PropTx counts (live from API)
    proptx_freehold: proptxFreehold >= 0 ? proptxFreehold : null,
    proptx_condo: proptxCondo >= 0 ? proptxCondo : null,
    proptx_total: proptxTotal,
    // Coverage
    coverage_pct: proptxTotal && proptxTotal > 0 ? Math.round((dbTotal / proptxTotal) * 1000) / 10 : null,
    freehold_coverage_pct: proptxFreehold > 0 ? Math.round((dbFreehold / proptxFreehold) * 1000) / 10 : null,
    condo_coverage_pct: proptxCondo > 0 ? Math.round((dbCondo / proptxCondo) * 1000) / 10 : null,
    // Gaps
    gap: proptxTotal !== null ? proptxTotal - dbTotal : null,
    freehold_gap: proptxFreehold >= 0 ? proptxFreehold - dbFreehold : null,
    condo_gap: proptxCondo >= 0 ? proptxCondo - dbCondo : null,
  };

  return { areas: activeAreas, totals };
}

async function getAreaDetail(areaId: string) {
  const { data: area } = await supabase
    .from('treb_areas').select('id, name').eq('id', areaId).single();

  if (!area) return { error: 'Area not found' };

  const { data: municipalities } = await supabase
    .from('municipalities')
    .select('id, name, homes_count')
    .eq('area_id', areaId)
    .order('name');

  if (!municipalities) return { area, municipalities: [] };

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

