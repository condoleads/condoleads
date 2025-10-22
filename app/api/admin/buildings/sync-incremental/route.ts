// app/api/admin/buildings/sync-incremental/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PropTx API Client
class EnhancedPropTxClient {
  private baseUrl = process.env.PROPTX_RESO_API_URL;
  private token = process.env.PROPTX_DLA_TOKEN || process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_BEARER_TOKEN;

  async searchBuildingListings(streetNumber: string) {
    const filter = `StreetNumber eq '${streetNumber}'`;
    const url = `${this.baseUrl}Property?$filter=${encodeURIComponent(filter)}&$top=500`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PropTx API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      total: data['@odata.count'] || data.value?.length || 0,
      allResults: data.value || []
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { buildingId, forceFullSync } = await request.json();
    
    console.log(' Starting incremental sync...');
    
    let results;
    if (buildingId) {
      results = await syncSingleBuilding(buildingId, forceFullSync || false);
    } else {
      results = await syncAllBuildings();
    }
    
    return NextResponse.json({
      success: true,
      ...results,
      message: 'Incremental sync completed successfully'
    });
    
  } catch (error: any) {
    console.error(' Incremental sync failed:', error);
    return NextResponse.json(
      { 
        error: 'Incremental sync failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}

async function syncAllBuildings() {
  console.log(' Syncing all buildings...');
  
  const { data: buildings, error } = await supabase
    .from('buildings')
    .select('id, building_name, street_number, street_name, last_synced_at, sync_status')
    .eq('sync_status', 'completed')
    .order('last_synced_at', { ascending: true, nullsFirst: true });
  
  if (error) throw error;
  
  const syncResults = [];
  let totalChanges = 0;
  
  for (const building of buildings || []) {
    try {
      const result = await syncSingleBuilding(building.id, false);
      syncResults.push({
        building_id: building.id,
        building_name: building.building_name,
        ...result
      });
      totalChanges += result.totalChanges;
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error: any) {
      console.error(`Failed to sync building ${building.building_name}:`, error);
      syncResults.push({
        building_id: building.id,
        building_name: building.building_name,
        error: error.message
      });
    }
  }
  
  return {
    buildingsProcessed: buildings?.length || 0,
    totalChanges,
    syncResults
  };
}

async function syncSingleBuilding(buildingId: string, forceFullSync: boolean) {
  console.log(` Syncing building ${buildingId}...`);
  
  const { data: building, error: buildingError } = await supabase
    .from('buildings')
    .select('*')
    .eq('id', buildingId)
    .single();
  
  if (buildingError) throw buildingError;
  
  const lastSyncDate = building.last_synced_at 
    ? new Date(building.last_synced_at) 
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  console.log(`Last sync: ${lastSyncDate.toISOString()}`);
  
  // Get raw PropTx results
  const proptxClient = new EnhancedPropTxClient();
  const rawResults = await proptxClient.searchBuildingListings(building.street_number);
  
  // APPLY EXACT SAME 3-STEP FILTERING AS WORKING SEARCH ROUTE
  let filteredListings = rawResults.allResults || [];
  
  // Filter 1: Street Number (exact match)
  console.log(`FILTER 1: Street Number = '${building.street_number}'`);
  filteredListings = filteredListings.filter((listing: any) => {
    return listing.StreetNumber === building.street_number;
  });
  console.log(`After street number filter: ${filteredListings.length} listings`);
  
  // Filter 2: Street Name (first word match)
  if (building.street_name && building.street_name.trim()) {
    const streetFirstWord = building.street_name.toLowerCase().trim().split(' ')[0];
    console.log(`FILTER 2: Street Name first word = '${streetFirstWord}'`);
    
    filteredListings = filteredListings.filter((listing: any) => {
      const address = (listing.UnparsedAddress || '').toLowerCase();
      const street = (listing.StreetName || '').toLowerCase();
      return address.includes(streetFirstWord) || street.includes(streetFirstWord);
    });
    
    console.log(`After street name filter: ${filteredListings.length} listings`);
  }
  
  // Filter 3: City (Toronto for all our buildings)
  const city = 'Toronto';
  const cityFirstWord = city.toLowerCase().trim();
  console.log(`FILTER 3: City = '${cityFirstWord}'`);
  
  filteredListings = filteredListings.filter((listing: any) => {
    const address = (listing.UnparsedAddress || '').toLowerCase();
    const listingCity = (listing.City || '').toLowerCase();
    return address.includes(cityFirstWord) || listingCity.includes(cityFirstWord);
  });
  
  console.log(`After city filter: ${filteredListings.length} listings`);
  console.log(` Final filtered count for ${building.building_name}: ${filteredListings.length} listings`);
  
  const currentListings = {
    total: filteredListings.length,
    allResults: filteredListings
  };
  
  const { data: existingListings } = await supabase
    .from('mls_listings')
    .select('*')
    .eq('building_id', buildingId);
  
  const changes = analyzeChanges(
    currentListings.allResults || [],
    existingListings || [],
    lastSyncDate,
    forceFullSync
  );
  
  const updateResults = await applyChanges(buildingId, changes);
  
  await supabase
    .from('buildings')
    .update({ 
      last_synced_at: new Date().toISOString(),
      sync_status: 'completed'
    })
    .eq('id', buildingId);
  
  await recordIncrementalSyncHistory(buildingId, changes, updateResults);
  
  return {
    buildingName: building.building_name,
    lastSyncDate: lastSyncDate.toISOString(),
    currentListingsFound: currentListings.total,
    existingListingsCount: existingListings?.length || 0,
    changes,
    updateResults,
    totalChanges: changes.newListings.length + changes.updatedListings.length + changes.removedListings.length
  };
}

function analyzeChanges(
  currentListings: any[], 
  existingListings: any[], 
  lastSyncDate: Date, 
  forceFullSync: boolean
) {
  console.log(' Analyzing changes...');
  
  const existingByMLS = new Map();
  existingListings.forEach(listing => {
    existingByMLS.set(listing.listing_key, listing);
  });
  
  const currentByMLS = new Map();
  currentListings.forEach(listing => {
    currentByMLS.set(listing.ListingKey, listing);
  });
  
  const changes = {
    newListings: [] as any[],
    updatedListings: [] as any[],
    removedListings: [] as any[],
    unchangedListings: [] as any[]
  };
  
  for (const currentListing of currentListings) {
    const mlsKey = currentListing.ListingKey;
    const existing = existingByMLS.get(mlsKey);
    
    if (!existing) {
      changes.newListings.push({
        type: 'new',
        listing: currentListing,
        reason: 'Not in database'
      });
    } else {
      const shouldUpdate = forceFullSync || 
        isListingModified(currentListing, existing, lastSyncDate);
      
      if (shouldUpdate) {
        changes.updatedListings.push({
          type: 'updated',
          listing: currentListing,
          existing: existing,
          reason: getUpdateReason(currentListing, existing)
        });
      } else {
        changes.unchangedListings.push(existing);
      }
    }
  }
  
  for (const [mlsKey, existing] of existingByMLS) {
    if (!currentByMLS.has(mlsKey)) {
      changes.removedListings.push({
        type: 'removed',
        existing: existing,
        reason: 'No longer in PropTx results'
      });
    }
  }
  
  console.log(` Changes: ${changes.newListings.length} new, ${changes.updatedListings.length} updated, ${changes.removedListings.length} removed, ${changes.unchangedListings.length} unchanged`);
  
  return changes;
}

function isListingModified(currentListing: any, existingListing: any, lastSyncDate: Date): boolean {
  if (!currentListing.ModificationTimestamp) return false;
  
  const modTimestamp = new Date(currentListing.ModificationTimestamp);
  const priceChanged = parseInt(currentListing.ListPrice) !== existingListing.list_price;
  const statusChanged = currentListing.StandardStatus !== existingListing.standard_status;
  
  return modTimestamp > lastSyncDate || priceChanged || statusChanged;
}

function getUpdateReason(currentListing: any, existingListing: any): string {
  const reasons = [];
  
  if (parseInt(currentListing.ListPrice) !== existingListing.list_price) {
    reasons.push('Price changed');
  }
  if (currentListing.StandardStatus !== existingListing.standard_status) {
    reasons.push('Status changed');
  }
  if (currentListing.ModificationTimestamp && 
      new Date(currentListing.ModificationTimestamp) > new Date(existingListing.modification_timestamp || 0)) {
    reasons.push('Modified timestamp updated');
  }
  
  return reasons.length > 0 ? reasons.join(', ') : 'Modified since last sync';
}

async function applyChanges(buildingId: string, changes: any) {
  console.log(' Applying changes...');
  
  const results = {
    newListingsAdded: 0,
    listingsUpdated: 0,
    listingsRemoved: 0,
    mediaAdded: 0,
    roomsAdded: 0,
    errors: [] as string[]
  };
  
  for (const change of changes.newListings) {
    try {
      const listingRecord = mapListingToDatabase(change.listing, buildingId);
      
      const { data, error } = await supabase
        .from('mls_listings')
        .insert(listingRecord)
        .select()
        .single();
      
      if (error) throw error;
      
      results.newListingsAdded++;
      
    } catch (error: any) {
      console.error(`Failed to add new listing ${change.listing.ListingKey}:`, error);
      results.errors.push(`New listing ${change.listing.ListingKey}: ${error.message}`);
    }
  }
  
  for (const change of changes.updatedListings) {
    try {
      const listingRecord = mapListingToDatabase(change.listing, buildingId);
      delete listingRecord.created_at;
      listingRecord.updated_at = new Date().toISOString();
      
      const { error } = await supabase
        .from('mls_listings')
        .update(listingRecord)
        .eq('id', change.existing.id);
      
      if (error) throw error;
      
      results.listingsUpdated++;
      
      const currentPrice = parseInt(change.listing.ListPrice) || 0;
      const existingPrice = change.existing.list_price || 0;
      if (currentPrice !== existingPrice) {
        await createPriceHistoryRecord(change.existing.id, existingPrice, currentPrice);
      }
      
    } catch (error: any) {
      console.error(`Failed to update listing ${change.listing.ListingKey}:`, error);
      results.errors.push(`Update listing ${change.listing.ListingKey}: ${error.message}`);
    }
  }
  
  for (const change of changes.removedListings) {
    try {
      await supabase
        .from('mls_listings')
        .update({
          standard_status: 'Removed',
          mls_status: 'Expired',
          updated_at: new Date().toISOString()
        })
        .eq('id', change.existing.id);
      
      results.listingsRemoved++;
      
    } catch (error: any) {
      console.error(`Failed to remove listing ${change.existing.listing_key}:`, error);
      results.errors.push(`Remove listing ${change.existing.listing_key}: ${error.message}`);
    }
  }
  
  return results;
}

function mapListingToDatabase(listing: any, buildingId: string) {
  return {
    building_id: buildingId,
    listing_key: listing.ListingKey || null,
    listing_id: listing.ListingId || null,
    street_number: listing.StreetNumber || null,
    street_name: listing.StreetName || null,
    unparsed_address: listing.UnparsedAddress || null,
    unit_number: listing.UnitNumber || listing.ApartmentNumber || null,
    property_type: listing.PropertyType || null,
    property_subtype: listing.PropertySubType || null,
    transaction_type: listing.TransactionType || null,
    list_price: parseInteger(listing.ListPrice),
    close_price: parseInteger(listing.ClosePrice),
    standard_status: listing.StandardStatus || null,
    mls_status: listing.MlsStatus || null,
    close_date: parseDate(listing.CloseDate),
    on_market_date: parseDate(listing.OnMarketDate),
    bedrooms_total: parseInteger(listing.BedroomsTotal),
    bathrooms_total_integer: parseDecimal(listing.BathroomsTotalInteger),
    building_area_total: parseInteger(listing.BuildingAreaTotal),
    association_fee: parseDecimal(listing.AssociationFee),
    parking_total: parseInteger(listing.ParkingTotal),
    locker: listing.Locker || null,
    balcony_type: listing.BalconyType || null,
    exposure: listing.Exposure || null,
    public_remarks: listing.PublicRemarks || null,
    modification_timestamp: parseTimestamp(listing.ModificationTimestamp),
    price_change_timestamp: parseTimestamp(listing.PriceChangeTimestamp),
    available_in_idx: listing.StandardStatus === 'Active',
    available_in_vow: true,
    available_in_dla: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_modified_at: parseTimestamp(listing.ModificationTimestamp),
    sync_source: 'dla_incremental'
  };
}

async function createPriceHistoryRecord(listingId: string, oldPrice: number, newPrice: number) {
  try {
    await supabase.from('price_history').insert({
      listing_id: listingId,
      price_type: 'list',
      old_price: oldPrice,
      new_price: newPrice,
      change_amount: newPrice - oldPrice,
      change_percent: oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice * 100) : 0,
      detected_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to create price history:', error);
  }
}

async function recordIncrementalSyncHistory(buildingId: string, changes: any, results: any) {
  try {
    await supabase.from('sync_history').insert({
      building_id: buildingId,
      sync_type: 'incremental',
      feed_type: 'dla_incremental',
      listings_found: changes.newListings.length + changes.updatedListings.length + changes.unchangedListings.length,
      listings_created: results.newListingsAdded,
      sync_status: results.errors.length > 0 ? 'partial' : 'success',
      error_message: results.errors.length > 0 ? results.errors.join('; ') : null,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to record sync history:', error);
  }
}

function parseInteger(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseInt(value.toString());
  return isNaN(parsed) ? null : parsed;
}

function parseDecimal(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(value.toString());
  return isNaN(parsed) ? null : parsed;
}

function parseDate(value: any): string | null {
  if (!value) return null;
  try {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function parseTimestamp(value: any): string | null {
  if (!value) return null;
  try {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}
