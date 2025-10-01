import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Get basic stats
    const [
      buildingsResult,
      activeListingsResult,
      lastSyncResult,
      recentSyncsResult,
      priceChangesResult
    ] = await Promise.all([
      // Total buildings
      supabase
        .from('buildings')
        .select('id', { count: 'exact' }),
      
      // Active listings
      supabase
        .from('mls_listings')
        .select('id', { count: 'exact' })
        .eq('standard_status', 'Active'),
      
      // Last sync time
      supabase
        .from('sync_history')
        .select('completed_at')
        .order('completed_at', { ascending: false })
        .limit(1),
      
      // Recent sync history
      supabase
        .from('sync_history')
        .select(`
          id,
          building_id,
          feed_type,
          sync_status,
          listings_created,
          listings_updated,
          completed_at,
          buildings(building_name)
        `)
        .order('completed_at', { ascending: false })
        .limit(10),
      
      // Price changes in last 24 hours
      supabase
        .from('price_history')
        .select('id', { count: 'exact' })
        .gte('detected_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    ]);

    // Status changes in last 24 hours
    const { count: statusChanges } = await supabase
      .from('mls_listings')
      .select('id', { count: 'exact' })
      .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .neq('standard_status', 'Active');

    const stats = {
      totalBuildings: buildingsResult.count || 0,
      activeListings: activeListingsResult.count || 0,
      lastSyncTime: lastSyncResult.data?.[0]?.completed_at || null,
      priceChanges: priceChangesResult.count || 0,
      statusChanges: statusChanges || 0
    };

    const recentSyncs = (recentSyncsResult.data || []).map(sync => ({
      id: sync.id,
      building_name: sync.buildings?.[0]?.building_name || 'Unknown Building',
      feed_type: sync.feed_type,
      sync_status: sync.sync_status,
      listings_created: sync.listings_created,
      listings_updated: sync.listings_updated,
      completed_at: sync.completed_at
    }));

    return NextResponse.json({
      success: true,
      stats,
      recentSyncs
    });

  } catch (error: any) {
    console.error('Analytics fetch failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics', details: error.message },
      { status: 500 }
    );
  }
}

