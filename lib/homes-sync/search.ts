// lib/homes-sync/search.ts
// Search PropTx for Residential Freehold properties by geography
// Reuses: two-variant media filter, parallel batch enhanced data fetch
// Difference from building search: queries by City/CityRegion, no building grouping

const PROPTX_BASE_URL = process.env.PROPTX_RESO_API_URL;
const PROPTX_TOKEN = process.env.PROPTX_DLA_TOKEN || process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_BEARER_TOKEN;

export interface HomesSearchParams {
  municipalityName: string;
  communityName?: string;
}

export interface HomesSearchResult {
  success: boolean;
  listings?: any[];
  counts?: {
    active: number;
    sold: number;
    leased: number;
    total: number;
  };
  error?: string;
}

// Two-variant media filter (identical to building-sync/search.ts)
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

// Paginate through ALL PropTx results
async function fetchAllListings(
  filter: string,
  select: string,
  headers: any
): Promise<any[]> {
  const allResults: any[] = [];
  let skip = 0;
  const pageSize = 5000;

  while (true) {
    const url = `${PROPTX_BASE_URL}Property?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=${pageSize}&$skip=${skip}`;
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        console.error(`[HomesSearch] Fetch error at skip=${skip}: ${resp.status}`);
        break;
      }
      const data = await resp.json();
      const results = data.value || [];
      if (results.length === 0) break;
      allResults.push(...results);
      console.log(`[HomesSearch] Fetched ${allResults.length} so far (skip=${skip})`);
      if (results.length < pageSize) break;
      skip += pageSize;
    } catch (error: any) {
      console.error(`[HomesSearch] Fetch error at skip=${skip}:`, error.message);
      break;
    }
  }

  return allResults;
}

export async function searchHomes(params: HomesSearchParams): Promise<HomesSearchResult> {
  const { municipalityName, communityName } = params;

  console.log(`[HomesSearch] Starting: ${municipalityName}${communityName ? ' / ' + communityName : ''}`);

  if (!municipalityName) {
    return { success: false, error: 'Municipality name is required' };
  }

  if (!PROPTX_BASE_URL || !PROPTX_TOKEN) {
    return { success: false, error: 'PropTx configuration missing' };
  }

  const headers = {
    'Authorization': `Bearer ${PROPTX_TOKEN}`,
    'Accept': 'application/json'
  };

  try {
    // Build base filter for Residential Freehold
    let baseFilter = `PropertyType eq 'Residential Freehold' and City eq '${municipalityName}'`;
    if (communityName) {
      baseFilter += ` and CityRegion eq '${communityName}'`;
    }

    // We do NOT use $select for the main sync - we need ALL fields for complete DLA mapping
    // Only use $select for counting/preview

    let allListings: any[] = [];

    // STRATEGY 1: Active listings
    console.log(`[HomesSearch] Fetching active listings...`);
    const activeFilter = baseFilter;
    const activeListings = await fetchAllListings(activeFilter, '', headers);
    const activeCount = activeListings.length;
    allListings.push(...activeListings);
    console.log(`[HomesSearch] Active: ${activeCount}`);

    // STRATEGY 2: Sold/Closed transactions
    console.log(`[HomesSearch] Fetching sold transactions...`);
    const soldFilter = `${baseFilter} and (StandardStatus eq 'Closed' or MlsStatus eq 'Sold' or MlsStatus eq 'Sld')`;
    const soldListings = await fetchAllListings(soldFilter, '', headers);
    const soldCount = soldListings.length;
    allListings.push(...soldListings);
    console.log(`[HomesSearch] Sold: ${soldCount}`);

    // STRATEGY 3: Leased transactions
    console.log(`[HomesSearch] Fetching leased transactions...`);
    const leasedFilter = `${baseFilter} and (MlsStatus eq 'Leased' or MlsStatus eq 'Lsd')`;
    const leasedListings = await fetchAllListings(leasedFilter, '', headers);
    const leasedCount = leasedListings.length;
    allListings.push(...leasedListings);
    console.log(`[HomesSearch] Leased: ${leasedCount}`);

    // Deduplicate by ListingKey
    const uniqueListings: any[] = [];
    const seenKeys = new Set();
    allListings.forEach(listing => {
      const key = listing.ListingKey || listing.ListingId || `${listing.StreetNumber}-${listing.StreetName}-${listing.MlsStatus}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueListings.push(listing);
      }
    });

    console.log(`[HomesSearch] Total: ${allListings.length}, Unique: ${uniqueListings.length}`);

    // Exclude unwanted statuses
    const excludedStatuses = ['Pending', 'Cancelled', 'Withdrawn'];
    const excludedMlsStatuses = ['Cancelled', 'Withdrawn', 'Pend'];
    const filteredListings = uniqueListings.filter(listing => {
      return !excludedStatuses.includes(listing.StandardStatus) &&
             !excludedMlsStatuses.includes(listing.MlsStatus);
    });

    console.log(`[HomesSearch] After status filter: ${filteredListings.length}`);

    if (filteredListings.length === 0) {
      return { success: true, listings: [], counts: { active: 0, sold: 0, leased: 0, total: 0 } };
    }

    // Fetch enhanced data (rooms, media, open houses) in parallel batches
    console.log(`[HomesSearch] Fetching enhanced data for ${filteredListings.length} listings...`);
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
            .then(r => {
              if (!r.ok) console.error(`[HomesSearch] Media fetch failed for ${listingKey}: ${r.status}`);
              return r.ok ? r.json() : { value: [] };
            }).catch(err => { console.error(`[HomesSearch] Media fetch error for ${listingKey}:`, err.message); return { value: [] }; }),
          fetch(`${PROPTX_BASE_URL}OpenHouse?$filter=${encodeURIComponent(`ListingKey eq '${listingKey}'`)}&$top=20`, { headers })
            .then(r => r.ok ? r.json() : { value: [] }).catch(() => ({ value: [] }))
        ]);

        listing.PropertyRooms = roomsResult.value || [];
        listing.Media = filterTwoVariants(mediaResult.value || []);
        listing.OpenHouses = openHouseResult.value || [];
      }));

      if (i % 50 === 0 || i + BATCH_SIZE >= filteredListings.length) {
        console.log(`[HomesSearch] Enhanced data: ${Math.min(i + BATCH_SIZE, filteredListings.length)}/${filteredListings.length}`);
      }
    }

    console.log(`[HomesSearch] Complete: ${filteredListings.length} listings with enhanced data`);

    return {
      success: true,
      listings: filteredListings,
      counts: {
        active: activeCount,
        sold: soldCount,
        leased: leasedCount,
        total: filteredListings.length
      }
    };

  } catch (error: any) {
    console.error('[HomesSearch] Error:', error.message);
    return { success: false, error: error.message };
  }
}

// Preview function - just counts, no enhanced data fetch
export async function previewHomes(params: HomesSearchParams): Promise<{ success: boolean; counts?: { forSale: number; forLease: number; sold: number; leased: number }; error?: string }> {
  const { municipalityName, communityName } = params;

  if (!PROPTX_BASE_URL || !PROPTX_TOKEN) {
    return { success: false, error: 'PropTx configuration missing' };
  }

  const headers = {
    'Authorization': `Bearer ${PROPTX_TOKEN}`,
    'Accept': 'application/json'
  };

  try {
    let baseFilter = `PropertyType eq 'Residential Freehold' and City eq '${municipalityName}'`;
    if (communityName) {
      baseFilter += ` and CityRegion eq '${communityName}'`;
    }

    const selectMin = 'ListingKey';

    // Count For Sale (Active + For Sale)
    const forSaleUrl = `${PROPTX_BASE_URL}Property?$filter=${encodeURIComponent(`${baseFilter} and StandardStatus eq 'Active' and TransactionType eq 'For Sale'`)}&$select=${selectMin}&$top=1&$count=true`;
    const forSaleResp = await fetch(forSaleUrl, { headers });
    const forSaleData = await forSaleResp.json();
    const forSaleCount = forSaleData['@odata.count'] || 0;

    // Count For Lease (Active + For Lease)
    const forLeaseUrl = `${PROPTX_BASE_URL}Property?$filter=${encodeURIComponent(`${baseFilter} and StandardStatus eq 'Active' and TransactionType eq 'For Lease'`)}&$select=${selectMin}&$top=1&$count=true`;
    const forLeaseResp = await fetch(forLeaseUrl, { headers });
    const forLeaseData = await forLeaseResp.json();
    const forLeaseCount = forLeaseData['@odata.count'] || 0;

    // Count sold
    const soldUrl = `${PROPTX_BASE_URL}Property?$filter=${encodeURIComponent(`${baseFilter} and (StandardStatus eq 'Closed' or MlsStatus eq 'Sold' or MlsStatus eq 'Sld')`  )}&$select=${selectMin}&$top=1&$count=true`;
    const soldResp = await fetch(soldUrl, { headers });
    const soldData = await soldResp.json();
    const soldCount = soldData['@odata.count'] || 0;

    // Count leased
    const leasedUrl = `${PROPTX_BASE_URL}Property?$filter=${encodeURIComponent(`${baseFilter} and (MlsStatus eq 'Leased' or MlsStatus eq 'Lsd')`)}&$select=${selectMin}&$top=1&$count=true`;
    const leasedResp = await fetch(leasedUrl, { headers });
    const leasedData = await leasedResp.json();
    const leasedCount = leasedData['@odata.count'] || 0;

    return {
      success: true,
      counts: { forSale: forSaleCount, forLease: forLeaseCount, sold: soldCount, leased: leasedCount }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
