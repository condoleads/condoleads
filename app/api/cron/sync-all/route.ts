import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PROPTX_API_URL = process.env.PROPTX_RESO_API_URL!;
const PROPTX_TOKEN = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_BEARER_TOKEN!;

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // If no CRON_SECRET set, allow in development
  if (!cronSecret) {
    console.warn('⚠️ CRON_SECRET not set - allowing request');
    return true;
  }
  
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  console.log('🕐 Cron job triggered: sync-all');
  
  // Verify authorization
  if (!verifyCronSecret(request)) {
    console.error('❌ Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results = {
    buildingsProcessed: 0,
    buildingsSuccess: 0,
    buildingsFailed: 0,
    totalListingsCreated: 0,
    totalListingsUpdated: 0,
    errors: [] as { buildingId: string; buildingName: string; error: string }[]
  };

  try {
    // Get all buildings
    const { data: buildings, error: buildingsError } = await supabase
      .from('buildings')
      .select('id, building_name, street_number, street_name, city_district')
      .order('building_name');

    if (buildingsError || !buildings) {
      throw new Error('Failed to fetch buildings: ' + buildingsError?.message);
    }

    console.log(`📊 Found ${buildings.length} buildings to sync`);

    // Process each building
    for (const building of buildings) {
      results.buildingsProcessed++;
      
      try {
        console.log(`🔄 Syncing ${results.buildingsProcessed}/${buildings.length}: ${building.building_name}`);
        
        // Call the incremental sync endpoint internally
        const syncResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/admin/buildings/incremental-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ buildingId: building.id, triggeredBy: 'cron' })
        });

        if (!syncResponse.ok) {
          throw new Error(`Sync failed with status ${syncResponse.status}`);
        }

        const syncResult = await syncResponse.json();
        
        results.buildingsSuccess++;
        results.totalListingsCreated += (syncResult.active?.added || 0) + (syncResult.inactive?.added || 0);
        results.totalListingsUpdated += syncResult.active?.updated || 0;
        
        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error: any) {
        console.error(`❌ Failed to sync ${building.building_name}:`, error.message);
        results.buildingsFailed++;
        results.errors.push({
          buildingId: building.id,
          buildingName: building.building_name,
          error: error.message
        });
        
        // Continue with next building - don't stop on failure
        continue;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Log summary to sync_history
    await supabase.from('sync_history').insert({
      building_id: null, // null indicates "all buildings" sync
      sync_type: 'cron_all',
      feed_type: 'dla',
      listings_found: results.buildingsProcessed,
      listings_created: results.totalListingsCreated,
      listings_updated: results.totalListingsUpdated,
      listings_unchanged: 0,
      media_records_created: 0,
      sync_status: results.buildingsFailed > 0 ? 'partial' : 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_seconds: parseFloat(duration),
      triggered_by: 'cron',
      error_details: results.errors.length > 0 ? JSON.stringify(results.errors) : null
    });

    console.log(`✅ Cron sync complete: ${results.buildingsSuccess}/${results.buildingsProcessed} success, ${results.buildingsFailed} failed, ${duration}s`);

    return NextResponse.json({
      success: true,
      message: 'Cron sync completed',
      results: {
        ...results,
        duration: `${duration}s`
      }
    });

  } catch (error: any) {
    console.error('❌ Cron sync failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      results
    }, { status: 500 });
  }
}