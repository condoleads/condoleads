// lib/building-sync/search.ts
// Direct search function - no HTTP overhead

const PROPTX_BASE_URL = process.env.PROPTX_RESO_API_URL;
const PROPTX_TOKEN = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_DLA_TOKEN || process.env.PROPTX_BEARER_TOKEN;

export interface SearchParams {
  streetNumber: string;
  streetName: string;
  city: string;
  buildingName: string;
}

export interface SearchResult {
  success: boolean;
  building?: {
    buildingName: string;
    canonicalAddress: string;
    slug: string;
    streetNumber: string;
    streetName: string;
    city: string;
    totalListings: number;
  };
  allListings?: any[];
  error?: string;
}

// Two-variant media filter
function filterTwoVariants(allMediaItems: any[]) {
  if (!allMediaItems || allMediaItems.length === 0) return [];

  const sortedItems = [...allMediaItems].sort((a, b) => {
    const orderA = parseInt(a.Order) || 999;
    const orderB = parseInt(b.Order) || 999;
    return orderA - orderB;
  });

  const imageGroups = new Map();
  
  sortedItems.forEach(item => {
    const baseId = item.MediaURL ?
      item.MediaURL.split('/').pop()?.split('.')[0] || item.MediaKey :
      item.MediaKey || Math.random().toString();

    if (!imageGroups.has(baseId)) {
      imageGroups.set(baseId, []);
    }
    imageGroups.get(baseId).push(item);
  });
  
  const filtered: any[] = [];

  imageGroups.forEach((variants) => {
    const thumbnail = variants.find((v: any) =>
      v.MediaURL && (
        v.MediaURL.includes('rs:fit:240:240') ||
        v.ImageSizeDescription === 'Thumbnail'
      )
    );

    const large = variants.find((v: any) =>
      v.MediaURL && (
        v.MediaURL.includes('rs:fit:1920:1920') ||
        v.ImageSizeDescription === 'Large'
      )
    );

    if (thumbnail) filtered.push({...thumbnail, variant_type: 'thumbnail'});
    if (large) filtered.push({...large, variant_type: 'large'});
  });
  
  return filtered;
}

function generateSlug(streetNumber: string, streetName?: string, city?: string, buildingName?: string) {
  const parts = [];
  if (buildingName?.trim()) parts.push(buildingName.toLowerCase());
  if (streetNumber?.trim()) parts.push(streetNumber);
  if (streetName?.trim()) parts.push(streetName.toLowerCase());
  
  // Clean city - remove district codes
  let cleanCity = city || '';
  cleanCity = cleanCity.replace(/\s+(C\d+|E\d+|W\d+)$/i, '').trim();
  if (cleanCity) parts.push(cleanCity.toLowerCase());

  return parts
    .join('-')
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function searchBuilding(params: SearchParams): Promise<SearchResult> {
  const { streetNumber, streetName, city, buildingName } = params;
  
  console.log(`[DirectSearch] Starting: ${buildingName || streetNumber + ' ' + streetName}`);

  if (!streetNumber || streetNumber.trim() === '') {
    return { success: false, error: 'Street number is required' };
  }

  if (!PROPTX_BASE_URL || !PROPTX_TOKEN) {
    return { success: false, error: 'PropTx configuration missing' };
  }

  const headers = {
    'Authorization': `Bearer ${PROPTX_TOKEN}`,
    'Accept': 'application/json'
  };

  try {
    let allListings: any[] = [];

    // STRATEGY 1: Active listings
    console.log(`[DirectSearch] Fetching active listings...`);
    const activeFilter = `StreetNumber eq '${streetNumber.trim()}'`;
    const activeUrl = `${PROPTX_BASE_URL}Property?$filter=${encodeURIComponent(activeFilter)}&$top=5000`;

    const activeResponse = await fetch(activeUrl, { headers });
    if (activeResponse.ok) {
      const activeData = await activeResponse.json();
      allListings.push(...(activeData.value || []));
      console.log(`[DirectSearch] Active: ${activeData.value?.length || 0}`);
    }
    
    // STRATEGY 2: Completed transactions
    console.log(`[DirectSearch] Fetching completed transactions...`);
    const completedFilter = `StreetNumber eq '${streetNumber.trim()}' and (StandardStatus eq 'Closed' or StandardStatus eq 'Sold' or StandardStatus eq 'Leased' or MlsStatus eq 'Sold' or MlsStatus eq 'Sld' or MlsStatus eq 'Leased' or MlsStatus eq 'Lsd')`;
    const completedUrl = `${PROPTX_BASE_URL}Property?$filter=${encodeURIComponent(completedFilter)}&$top=15000`;

    const completedResponse = await fetch(completedUrl, { headers });
    if (completedResponse.ok) {
      const completedData = await completedResponse.json();
      allListings.push(...(completedData.value || []));
      console.log(`[DirectSearch] Completed: ${completedData.value?.length || 0}`);
    }

    // Deduplicate
    const uniqueListings: any[] = [];
    const seenKeys = new Set();
    allListings.forEach(listing => {
      const key = listing.ListingKey || listing.ListingId || `${listing.StreetNumber}-${listing.UnitNumber}-${listing.MlsStatus}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueListings.push(listing);
      }
    });
    console.log(`[DirectSearch] Unique: ${uniqueListings.length}`);

    // Filter by street number
    let filteredListings = uniqueListings.filter(l => l.StreetNumber === streetNumber.trim());

    // Filter by street name
    if (streetName?.trim()) {
      const streetFirstWord = streetName.toLowerCase().trim().split(' ')[0];
      filteredListings = filteredListings.filter(listing => {
        const address = (listing.UnparsedAddress || '').toLowerCase();
        const street = (listing.StreetName || '').toLowerCase();
        return address.includes(streetFirstWord) || street.includes(streetFirstWord);
      });
    }

    // Filter by city
    if (city?.trim()) {
      const cityFirstWord = city.toLowerCase().trim().split(' ')[0];
      filteredListings = filteredListings.filter(listing => {
        const address = (listing.UnparsedAddress || '').toLowerCase();
        const listingCity = (listing.City || '').toLowerCase();
        return address.includes(cityFirstWord) || listingCity.includes(cityFirstWord);
      });
    }

    // Exclude unwanted statuses
    const excludedStatuses = ['Pending', 'Cancelled', 'Withdrawn'];
    const excludedMlsStatuses = ['Cancelled', 'Withdrawn', 'Pend'];
    filteredListings = filteredListings.filter(listing => {
      return !excludedStatuses.includes(listing.StandardStatus) && 
             !excludedMlsStatuses.includes(listing.MlsStatus);
    });

    console.log(`[DirectSearch] After filters: ${filteredListings.length}`);

    if (filteredListings.length === 0) {
      return { success: false, error: 'No listings found after filtering' };
    }

    // Fetch enhanced data in parallel batches
    console.log(`[DirectSearch] Fetching enhanced data...`);
    const BATCH_SIZE = 10;
    
    for (let i = 0; i < filteredListings.length; i += BATCH_SIZE) {
      const batch = filteredListings.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (listing) => {
        const listingKey = listing.ListingKey;
        if (!listingKey) return;

        const [roomsResult, mediaResult, openHouseResult] = await Promise.all([
          fetch(`${PROPTX_BASE_URL}PropertyRooms?$filter=${encodeURIComponent(`ListingKey eq '${listingKey}'`)}&$top=50`, { headers })
            .then(r => r.ok ? r.json() : { value: [] }).catch(() => ({ value: [] })),
          fetch(`${PROPTX_BASE_URL}Media?$filter=${encodeURIComponent(`ResourceRecordKey eq '${listingKey}'`)}&$top=500`, { headers })
            .then(r => r.ok ? r.json() : { value: [] }).catch(() => ({ value: [] })),
          fetch(`${PROPTX_BASE_URL}OpenHouse?$filter=${encodeURIComponent(`ListingKey eq '${listingKey}'`)}&$top=20`, { headers })
            .then(r => r.ok ? r.json() : { value: [] }).catch(() => ({ value: [] }))
        ]);

        listing.PropertyRooms = roomsResult.value || [];
        listing.Media = filterTwoVariants(mediaResult.value || []);
        listing.OpenHouses = openHouseResult.value || [];
      }));

      if (i % 50 === 0) {
        console.log(`[DirectSearch] Enhanced data: ${Math.min(i + BATCH_SIZE, filteredListings.length)}/${filteredListings.length}`);
      }
    }

    const buildingInfo = {
      buildingName: buildingName || `Building at ${streetNumber} ${streetName || ''}, ${city || ''}`.trim(),
      canonicalAddress: `${streetNumber} ${streetName || ''}, ${city || ''}`.trim(),
      slug: generateSlug(streetNumber, streetName, city, buildingName),
      streetNumber: streetNumber.trim(),
      streetName: streetName?.trim() || '',
      city: city?.trim() || '',
      totalListings: filteredListings.length
    };

    console.log(`[DirectSearch] Complete: ${filteredListings.length} listings`);

    return {
      success: true,
      building: buildingInfo,
      allListings: filteredListings
    };

  } catch (error: any) {
    console.error('[DirectSearch] Error:', error.message);
    return { success: false, error: error.message };
  }
}
