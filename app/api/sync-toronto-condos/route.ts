// app/api/sync-toronto-condos/route.ts - IMPROVED VERSION
import { NextResponse } from 'next/server';
import { DatabaseClient } from '../../../lib/supabase/client';

export async function GET() {
  return POST();
}

export async function POST() {
  try {
    console.log('Starting Toronto condo sync...');
    
    const apiUrl = process.env.PROPTX_RESO_API_URL!;
    const bearerToken = process.env.PROPTX_BEARER_TOKEN!;
    
    if (!apiUrl || !bearerToken) {
      throw new Error('Missing PropTx credentials in environment variables');
    }
    
    const db = new DatabaseClient();
    
    // Updated query for better results
    const query = "Property?$filter=contains(City,'Toronto') and (PropertySubType eq 'Condo Apartment' or PropertySubType eq 'Condo Townhouse') and StandardStatus eq 'Active'&$top=100";
    
    console.log('Query:', query);
    
    const response = await fetch(`${apiUrl}/${query}`, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Accept': 'application/json',
        'RESO-Version': '1.7'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    const listings = data.value || [];
    
    console.log(`Processing ${listings.length} Toronto condo listings...`);
    
    let buildingsCreated = 0;
    let listingsUpserted = 0;
    let errors = [];
    const buildingMap = new Map<string, string>();
    
    for (const rawListing of listings) {
      try {
        // Improved data transformation
        const transformedListing = transformMLSListing(rawListing);
        const buildingInfo = extractBuildingInfo(rawListing);
        
        console.log(`Processing: ${buildingInfo.canonical_address}`);
        
        // Get or create building
        let buildingId = buildingMap.get(buildingInfo.canonical_address);
        
        if (!buildingId) {
          console.log(`Creating building: ${buildingInfo.building_name || buildingInfo.canonical_address}`);
          
          const building = await db.createOrUpdateBuilding({
            ...buildingInfo,
            static_content: {
              ...buildingInfo.static_content,
              unit_count: rawListing.UnitsInBuilding || null,
              year_built: rawListing.YearBuilt || null,
              neighborhood: rawListing.CityRegion || rawListing.City || null,
              building_amenities: rawListing.AssociationAmenities || null,
              association_fee: rawListing.AssociationFee || null,
              last_sync: new Date().toISOString()
            }
          });
          
          buildingId = building.id;
          buildingMap.set(buildingInfo.canonical_address, buildingId);
          buildingsCreated++;
          console.log(`✅ Created building: ${buildingInfo.building_name || buildingInfo.canonical_address}`);
        }
        
        // Upsert the listing
        console.log(`Upserting listing: ${transformedListing.mls_number}`);
        
        await db.upsertListing({
          ...transformedListing,
          building_id: buildingId
        });
        
        listingsUpserted++;
        console.log(`✅ Upserted listing: ${transformedListing.mls_number}`);
        
      } catch (listingError) {
        console.error(`Failed to process listing ${rawListing.ListingKey || rawListing.ListingId}:`, listingError);
        errors.push({
          listingId: rawListing.ListingKey || rawListing.ListingId,
          error: listingError instanceof Error ? listingError.message : 'Unknown error'
        });
      }
    }
    
    const summary = {
      totalListings: listings.length,
      buildingsCreated,
      listingsUpserted,
      errors: errors.length,
      errorDetails: errors.slice(0, 5), // First 5 errors
      syncTime: new Date().toISOString()
    };
    
    console.log('Sync completed:', summary);
    
    return NextResponse.json({
      success: true,
      message: 'Toronto condo sync completed successfully!',
      summary
    });
    
  } catch (error) {
    console.error('Sync failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

// IMPROVED Helper functions
function transformMLSListing(rawListing: any) {
  return {
    mls_number: rawListing.ListingId || rawListing.ListingKey,
    price: Math.round(rawListing.ListPrice || 0),
    beds: rawListing.BedroomsTotal || rawListing.BedroomsAboveGrade || null,
    baths: rawListing.BathroomsTotalInteger || rawListing.BathroomsTotalDecimal || rawListing.BathroomsTotal || null,
    sqft: rawListing.BuildingAreaTotal || rawListing.LivingAreaSqFt || rawListing.TotalFinishedArea || null,
    unit_number: extractUnitNumber(rawListing.UnparsedAddress || '', rawListing.ApartmentNumber),
    status: mapStatus(rawListing.StandardStatus || 'Active'),
    photos: [], // Will be populated later
    description: rawListing.PublicRemarks || '',
    listing_date: rawListing.OnMarketDate || rawListing.ListingContractDate || new Date().toISOString()
  };
}

function extractBuildingInfo(rawListing: any) {
  const address = rawListing.UnparsedAddress || rawListing.FullStreetAddress || '';
  const buildingAddress = cleanAddressForBuilding(address);
  const normalizedAddress = normalizeAddress(buildingAddress);
  
  return {
    slug: createSlug(normalizedAddress),
    canonical_address: normalizedAddress,
    building_name: rawListing.BuildingName || extractBuildingName(address) || null,
    static_content: {
      original_address: address,
      last_sync: new Date().toISOString()
    }
  };
}

function cleanAddressForBuilding(address: string): string {
  if (!address) return '';
  
  // Remove unit numbers from the end for building grouping
  // "2 Liszt Gate 11, Toronto C15, ON M2H 1G7" -> "2 Liszt Gate, Toronto C15, ON M2H 1G7"
  return address
    .replace(/\s+\d+,\s*([A-Z])/g, ', $1') // Remove number before comma and city
    .replace(/\s+\d+$/, '') // Remove trailing number
    .trim();
}

function extractUnitNumber(address: string, apartmentNumber?: string): string | null {
  // Try apartment number field first
  if (apartmentNumber) return apartmentNumber;
  
  if (!address) return null;
  
  // Extract unit from address patterns
  const patterns = [
    /(\d+),\s*[A-Z]/,  // "123, Toronto" pattern
    /(?:UNIT|APT|#)\s*([0-9A-Z]+)/i,  // Traditional unit patterns
    /\s(\d+)$/  // Number at the end
  ];
  
  for (const pattern of patterns) {
    const match = address.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

function normalizeAddress(address: string): string {
  if (!address) return '';
  
  return address
    .toUpperCase()
    .replace(/\b(STREET|ST\.?)\b/g, 'ST')
    .replace(/\b(AVENUE|AVE\.?)\b/g, 'AVE')
    .replace(/\b(ROAD|RD\.?)\b/g, 'RD')
    .replace(/\b(GATE|GT\.?)\b/g, 'GATE')
    .replace(/\b(EAST|E\.?)\b/g, 'E')
    .replace(/\b(WEST|W\.?)\b/g, 'W')
    .replace(/\b(NORTH|N\.?)\b/g, 'N')
    .replace(/\b(SOUTH|S\.?)\b/g, 'S')
    .replace(/[,.\s]+/g, ' ')
    .trim();
}

function extractBuildingName(address: string): string | null {
  if (!address) return null;
  
  // For these addresses, building name might be in a different format
  const patterns = [
    /^(.+?)\s*-\s*\d+\s+/,  // "Name - 123 Street"
    /^((?:THE\s+)?[A-Z\s]+?)\s+(?:CONDOS?|TOWERS?|RESIDENCES?|TOWNHOMES?)/i,
    /^((?:ONE|TWO|THREE)\s+[A-Z\s]+?)(?:\s+\d|\s+-)/,
    // New pattern for complex names
    /^([A-Z\s]+(?:TOWNHOMES?|CONDOS?|TOWERS?|RESIDENCES?|VILLAGE|PLACE|COURT))/i
  ];
  
  for (const pattern of patterns) {
    const match = address.match(pattern);
    if (match && match[1].length > 3) {
      return match[1].trim();
    }
  }
  
  return null;
}

function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
}

function mapStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'Active': 'A',
    'Sold': 'S',
    'Expired': 'E',
    'Pending': 'P',
    'Under Contract': 'U'
  };
  return statusMap[status] || 'A';
}