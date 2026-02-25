import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const PROPTX_BASE_URL = process.env.PROPTX_RESO_API_URL;
const PROPTX_TOKEN = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_DLA_TOKEN || process.env.PROPTX_BEARER_TOKEN;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Fast count from PropTx using $count=true&$top=0
async function getPropTxCount(filter: string): Promise<number> {
  if (!PROPTX_BASE_URL || !PROPTX_TOKEN) return -1;
  try {
    const url = PROPTX_BASE_URL + 'Property?$filter=' + encodeURIComponent(filter) + '&$count=true&$top=0';
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
  const searchParams = request.nextUrl.searchParams;
  const municipalityId = searchParams.get('municipalityId');
  const municipalityName = searchParams.get('municipalityName');
  const communityName = searchParams.get('communityName');

  if (!municipalityId || !municipalityName) {
    return NextResponse.json({ error: 'municipalityId and municipalityName required' }, { status: 400 });
  }

  try {
    const cityFilter = "City eq '" + municipalityName + "'" + (communityName ? " and CityRegion eq '" + communityName + "'" : '');

    // Parallel: PropTx counts + DB counts + sync history
    const [
      proptxFreehold,
      proptxCondo,
      dbFreeholdResult,
      dbCondoResult,
      dbFreeholdBreakdown,
      dbCondoBreakdown,
      lastSyncFreehold,
      lastSyncCondo,
      recentHistory,
      runningSync,
    ] = await Promise.all([
      // PropTx counts (fast, $top=0)
      getPropTxCount("PropertyType eq 'Residential Freehold' and " + cityFilter),
      getPropTxCount("PropertyType eq 'Residential Condo & Other' and " + cityFilter),
      // DB total counts
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq('municipality_id', municipalityId).eq('property_type', 'Residential Freehold').gte('original_entry_timestamp', new Date(Date.now() - 2 * 365.25 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq('municipality_id', municipalityId).eq('property_type', 'Residential Condo & Other').gte('original_entry_timestamp', new Date(Date.now() - 2 * 365.25 * 24 * 60 * 60 * 1000).toISOString()),
      // DB breakdown by status — Freehold
      supabase.from('mls_listings')
        .select('standard_status')
        .eq('municipality_id', municipalityId).eq('property_type', 'Residential Freehold'),
      // DB breakdown by status — Condo
      supabase.from('mls_listings')
        .select('standard_status')
        .eq('municipality_id', municipalityId).eq('property_type', 'Residential Condo & Other'),
      // Last completed sync — Freehold
      supabase.from('sync_history')
        .select('id, completed_at, duration_seconds, listings_found, listings_created, listings_skipped, media_saved, rooms_saved, sync_status')
        .eq('municipality_id', municipalityId).eq('property_type', 'Residential Freehold').eq('sync_status', 'completed')
        .order('completed_at', { ascending: false }).limit(1).single(),
      // Last completed sync — Condo
      supabase.from('sync_history')
        .select('id, completed_at, duration_seconds, listings_found, listings_created, listings_skipped, media_saved, rooms_saved, sync_status')
        .eq('municipality_id', municipalityId).eq('property_type', 'Residential Condo & Other').eq('sync_status', 'completed')
        .order('completed_at', { ascending: false }).limit(1).single(),
      // Recent sync history (last 10 for this municipality)
      supabase.from('sync_history')
        .select('id, property_type, sync_status, started_at, completed_at, duration_seconds, listings_found, listings_created, listings_skipped, media_saved, rooms_saved, error_details, triggered_by')
        .eq('municipality_id', municipalityId)
        .order('started_at', { ascending: false }).limit(10),
      // Check for currently running syncs
      supabase.from('sync_history')
        .select('id, property_type, started_at')
        .eq('municipality_id', municipalityId).eq('sync_status', 'running'),
    ]);

    // Build status breakdown
    function buildBreakdown(data: any[] | null) {
      const b = { active: 0, closed: 0, expired: 0, other: 0 };
      for (const row of data || []) {
        const s = (row.standard_status || '').toLowerCase();
        if (s === 'active') b.active++;
        else if (s === 'closed') b.closed++;
        else if (s === 'expired') b.expired++;
        else b.other++;
      }
      return b;
    }

    const dbFreehold = dbFreeholdResult.count || 0;
    const dbCondo = dbCondoResult.count || 0;

    const response = {
      municipality: { id: municipalityId, name: municipalityName },
      freehold: {
        proptx_count: proptxFreehold,
        db_count: dbFreehold,
        gap: proptxFreehold >= 0 ? proptxFreehold - dbFreehold : null,
        coverage_pct: proptxFreehold > 0 ? Math.round((dbFreehold / proptxFreehold) * 1000) / 10 : null,
        breakdown: buildBreakdown(dbFreeholdBreakdown.data),
        last_sync: lastSyncFreehold.data || null,
      },
      condo: {
        proptx_count: proptxCondo,
        db_count: dbCondo,
        gap: proptxCondo >= 0 ? proptxCondo - dbCondo : null,
        coverage_pct: proptxCondo > 0 ? Math.round((dbCondo / proptxCondo) * 1000) / 10 : null,
        breakdown: buildBreakdown(dbCondoBreakdown.data),
        last_sync: lastSyncCondo.data || null,
      },
      total: {
        proptx_count: (proptxFreehold >= 0 && proptxCondo >= 0) ? proptxFreehold + proptxCondo : null,
        db_count: dbFreehold + dbCondo,
      },
      running_syncs: runningSync.data || [],
      recent_history: recentHistory.data || [],
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[SyncStatus] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
