// app/api/admin/sync-listings/route.ts - Create this file
import { NextResponse } from 'next/server';
import { DatabaseClient } from '@/lib/supabase/client';
import { PropTxRESOClient } from '@/lib/proptx/client';
import { MLSDataTransformer } from '@/lib/proptx/transformer';

export async function POST() {
  try {
    console.log('🚀 Starting PropTx data sync...');
    
    const propTxClient = new PropTxRESOClient();
    const transformer = new MLSDataTransformer();
    const db = new DatabaseClient();
    
    // Step 1: Fetch all Toronto condo listings
    const rawListings = await propTxClient.getTorontoCondoListings();
    console.log(`📊 Processing ${rawListings.length} raw listings...`);
    
    let buildingsCreated = 0;
    let listingsUpserted = 0;
    const addressMap = new Map<string, string>(); // address -> buildingId
    
    // Step 2: Process each listing
    for (const rawListing of rawListings) {
      try {
        // Transform listing data
        const transformedListing = transformer.transformListing(rawListing);
        const buildingInfo = transformer.extractBuildingInfo(rawListing);
        
        // Get or create building
        let buildingId = addressMap.get(buildingInfo.canonical_address);
        
        if (!buildingId) {
          const building = await db.createOrUpdateBuilding(buildingInfo);
          buildingId = building.id;
          addressMap.set(buildingInfo.canonical_address, buildingId);
          buildingsCreated++;
        }
        
        // Upsert listing
        await db.upsertListing({
          ...transformedListing,
          building_id: buildingId
        });
        
        listingsUpserted++;
        
        if (listingsUpserted % 100 === 0) {
          console.log(`⏳ Processed ${listingsUpserted} listings...`);
        }
        
      } catch (listingError) {
        console.error(`❌ Failed to process listing ${rawListing.ListingId}:`, listingError);
        continue; // Skip this listing and continue
      }
    }
    
    const summary = {
      total_raw_listings: rawListings.length,
      buildings_created: buildingsCreated,
      listings_upserted: listingsUpserted,
      sync_completed_at: new Date().toISOString()
    };
    
    console.log('✅ Sync completed:', summary);
    
    return NextResponse.json({
      success: true,
      message: 'Data sync completed successfully',
      summary
    });
    
  } catch (error) {
    console.error('❌ Data sync failed:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Data sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint to check sync status
export async function GET() {
  try {
    const db = new DatabaseClient();
    
    // Get basic stats
    const { data: buildingCount } = await db.supabase
      .from('buildings')
      .select('*', { count: 'exact', head: true });
      
    const { data: listingCount } = await db.supabase
      .from('mls_listings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'A');
    
    return NextResponse.json({
      buildings_total: buildingCount?.length || 0,
      active_listings: listingCount?.length || 0,
      last_checked: new Date().toISOString()
    });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to get sync status'
    }, { status: 500 });
  }
}