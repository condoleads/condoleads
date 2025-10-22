// app/api/admin/buildings/incremental-sync/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PROPTX_API_URL = process.env.PROPTX_RESO_API_URL!;
const PROPTX_TOKEN = process.env.PROPTX_BEARER_TOKEN!;

export async function POST(request: NextRequest) {
  try {
    const { buildingId } = await request.json();

    if (!buildingId) {
      return NextResponse.json(
        { error: 'Building ID required' },
        { status: 400 }
      );
    }

    console.log(` Starting incremental sync for building: ${buildingId}`);

    // Get building details
    const { data: building, error: buildingError } = await supabase
      .from('buildings')
      .select('*')
      .eq('id', buildingId)
      .single();

    if (buildingError || !building) {
      throw new Error('Building not found');
    }

    // Fetch current listings from PropTx
    const proptxListings = await fetchPropTxListings(building);

    // Separate active and inactive
    const proptxActive = proptxListings.filter(l => 
      l.StandardStatus === 'Active' || l.MlsStatus === 'Active'
    );
    const proptxInactive = proptxListings.filter(l => 
      l.StandardStatus !== 'Active' && l.MlsStatus !== 'Active'
    );

    console.log(`?? PropTx: ${proptxActive.length} active, ${proptxInactive.length} inactive`);

    // Get existing listings from DB
    const { data: dbListings } = await supabase
      .from('mls_listings')
      .select('*')
      .eq('building_id', buildingId);

    const dbActive = dbListings?.filter(l => 
      l.standard_status === 'Active' || l.mls_status === 'Active'
    ) || [];
    const dbInactive = dbListings?.filter(l => 
      l.standard_status !== 'Active' && l.mls_status !== 'Active'
    ) || [];

    console.log(`?? Database: ${dbActive.length} active, ${dbInactive.length} inactive`);

    // OPERATION 1: ACTIVE SYNC
    const activeResults = await syncActiveListings(buildingId, proptxActive, dbActive);

    // OPERATION 2: INACTIVE SYNC
    const inactiveResults = await syncInactiveListings(buildingId, proptxInactive, dbInactive);

    // Update building's last_synced timestamp
    await supabase
      .from('buildings')
      .update({ 
        last_synced_at: new Date().toISOString(),
        sync_status: 'completed'
      })
      .eq('id', buildingId);

    return NextResponse.json({
      success: true,
      building: building.building_name,
      active: activeResults,
      inactive: inactiveResults,
      message: 'Incremental sync completed'
    });

  } catch (error: any) {
    console.error(' Incremental sync failed:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error.message },
      { status: 500 }
    );
  }
}

async function fetchPropTxListings(building: any) {
  const searchTerms = [
    building.street_number,
    building.street_name,
    building.canonical_address
  ].filter(Boolean);

  let allListings: any[] = [];

  for (const term of searchTerms) {
    const filter = `contains(UnparsedAddress,'${term}')`;
    const url = `${PROPTX_API_URL}Property?$filter=${encodeURIComponent(filter)}&$top=500`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${PROPTX_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.value?.length > 0) {
        allListings = [...allListings, ...data.value];
      }
    }
  }

  // Deduplicate by ListingKey
  const unique = Array.from(
    new Map(allListings.map(l => [l.ListingKey, l])).values()
  );

  return unique;
}

async function syncActiveListings(buildingId: string, proptxActive: any[], dbActive: any[]) {
  const results = {
    updated: 0,
    added: 0,
    removed: 0,
    unchanged: 0
  };

  // Create maps for easy lookup
  const proptxMap = new Map(proptxActive.map(l => [l.ListingKey, l]));
  const dbMap = new Map(dbActive.map(l => [l.listing_key, l]));

  // UPDATE: Listings in both (check for changes)
  for (const [listingKey, proptxListing] of proptxMap) {
    const dbListing = dbMap.get(listingKey);

    if (dbListing) {
      // Check if anything changed
      const proptxPrice = parseInt(proptxListing.ListPrice) || 0;
      const dbPrice = dbListing.list_price || 0;
      const statusChanged = proptxListing.StandardStatus !== dbListing.standard_status;
      const priceChanged = proptxPrice !== dbPrice;

      if (statusChanged || priceChanged) {
        // Update the listing
        await supabase
          .from('mls_listings')
          .update({
            list_price: proptxPrice,
            standard_status: proptxListing.StandardStatus,
            mls_status: proptxListing.MlsStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', dbListing.id);

        results.updated++;
        console.log(` Updated: ${listingKey}`);
      } else {
        results.unchanged++;
      }
    }
  }

  // INSERT: Listings in PropTx but NOT in DB
  for (const [listingKey, proptxListing] of proptxMap) {
    if (!dbMap.has(listingKey)) {
      const mappedListing = mapListingToDatabase(proptxListing, buildingId);
      
      await supabase
        .from('mls_listings')
        .insert(mappedListing);

      results.added++;
      console.log(` Added: ${listingKey}`);
    }
  }

  // DELETE: Listings in DB but NOT in PropTx (expired/terminated)
  for (const [listingKey, dbListing] of dbMap) {
    if (!proptxMap.has(listingKey)) {
      await supabase
        .from('mls_listings')
        .delete()
        .eq('id', dbListing.id);

      results.removed++;
      console.log(` Removed: ${listingKey}`);
    }
  }

  return results;
}

async function syncInactiveListings(buildingId: string, proptxInactive: any[], dbInactive: any[]) {
  const results = {
    added: 0,
    skipped: 0
  };

  const dbMap = new Map(dbInactive.map(l => [l.listing_key, l]));

  // INSERT ONLY: Add new inactive listings, never delete
  for (const proptxListing of proptxInactive) {
    const listingKey = proptxListing.ListingKey;

    if (!dbMap.has(listingKey)) {
      const mappedListing = mapListingToDatabase(proptxListing, buildingId);
      
      await supabase
        .from('mls_listings')
        .insert(mappedListing);

      results.added++;
      console.log(` Added inactive: ${listingKey}`);
    } else {
      results.skipped++;
    }
  }

  return results;
}

function mapListingToDatabase(listing: any, buildingId: string) {
  return {
    building_id: buildingId,
    listing_key: listing.ListingKey,
    listing_id: listing.ListingId,
    mls_number: listing.ListingKey,
    
    // Status
    standard_status: listing.StandardStatus,
    mls_status: listing.MlsStatus,
    
    // Property Details
    property_type: listing.PropertyType,
    property_sub_type: listing.PropertySubType,
    unit_number: listing.UnitNumber,
    
    // Pricing
    list_price: parseInt(listing.ListPrice) || null,
    original_list_price: parseInt(listing.OriginalListPrice) || null,
    close_price: parseInt(listing.ClosePrice) || null,
    
    // Dates
    list_date: listing.ListingContractDate,
    close_date: listing.CloseDate,
    modification_timestamp: listing.ModificationTimestamp,
    
    // Property specs
    bedrooms_total: parseInt(listing.BedroomsTotal) || null,
    bathrooms_total: parseFloat(listing.BathroomsTotalInteger) || null,
    living_area: parseFloat(listing.LivingArea) || null,
    
    // Address
    unparsed_address: listing.UnparsedAddress,
    street_number: listing.StreetNumber,
    street_name: listing.StreetName,
    city: listing.City,
    postal_code: listing.PostalCode,
    
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
