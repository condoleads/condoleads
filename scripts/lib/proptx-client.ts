// scripts/lib/proptx-client.ts
// Shared PropTx API helpers for GitHub Actions sync scripts
// Includes: retry logic, pagination, enhanced data fetching, media filtering
// Source: Extracted from admin-homes/incremental-sync + buildings/incremental-sync

const PROPTX_BASE_URL = process.env.PROPTX_RESO_API_URL;
const PROPTX_TOKEN = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_DLA_TOKEN || process.env.PROPTX_BEARER_TOKEN;

// =====================================================
// CONFIGURATION & VALIDATION
// =====================================================

export function validateConfig(): void {
  if (!PROPTX_BASE_URL) throw new Error('PROPTX_RESO_API_URL not set');
  if (!PROPTX_TOKEN) throw new Error('No PropTx token found (checked PROPTX_DLA_TOKEN, PROPTX_VOW_TOKEN, PROPTX_BEARER_TOKEN)');
}

export function getBaseUrl(): string {
  return PROPTX_BASE_URL!;
}

export function getHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${PROPTX_TOKEN}`,
    'Accept': 'application/json'
  };
}

// =====================================================
// UTILITY
// =====================================================

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================================================
// FETCH WITH RETRY (Plan Section 6.1)
// Handles: 429 rate limit, 5xx server errors, timeouts
// Aborts on: 401/403 auth failures, 400 bad requests
// =====================================================

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  context = ''
): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) return response;

      // Auth failures â€” abort entire run, do NOT retry
      if (response.status === 401 || response.status === 403) {
        const body = await response.text().catch(() => 'no body');
        throw new Error(`AUTH_FAILURE: HTTP ${response.status} â€” ${context} â€” ${body}`);
      }

      // Rate limited â€” respect Retry-After header
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
        console.warn(`[RATE LIMITED] ${context} â€” waiting ${retryAfter}s (attempt ${attempt}/${maxRetries})`);
        await delay(retryAfter * 1000);
        continue;
      }

      // Server errors â€” exponential backoff
      if (response.status >= 500) {
        const waitTime = attempt * 30000; // 30s, 60s, 90s
        console.warn(`[SERVER ERROR] ${context} â€” ${response.status}, waiting ${waitTime / 1000}s (attempt ${attempt}/${maxRetries})`);
        await delay(waitTime);
        continue;
      }

      // 400 Bad Request â€” do not retry, log and throw
      const body = await response.text().catch(() => 'no body');
      throw new Error(`HTTP ${response.status}: ${body.substring(0, 200)} â€” ${context}`);

    } catch (err: any) {
      // Re-throw auth failures immediately
      if (err.message?.startsWith('AUTH_FAILURE')) throw err;

      // Handle timeout (AbortError)
      if (err.name === 'AbortError') {
        console.warn(`[TIMEOUT] ${context} â€” attempt ${attempt}/${maxRetries}`);
        if (attempt < maxRetries) {
          await delay(10000);
          continue;
        }
      }

      // Last attempt â€” throw
      if (attempt === maxRetries) throw err;

      // Network error â€” brief wait and retry
      await delay(5000);
    }
  }
  throw new Error(`Max retries exceeded for ${context}`);
}

// =====================================================
// PAGINATED LISTING FETCH
// Used by: homes incremental (fetchListingsModifiedSince)
// EXACT same logic as admin-homes/incremental-sync
// =====================================================

export async function fetchPaginatedListings(filter: string): Promise<any[]> {
  const headers = getHeaders();
  const baseUrl = getBaseUrl();
  const all: any[] = [];
  let skip = 0;
  const pageSize = 5000;

  while (true) {
    const url = `${baseUrl}Property?$filter=${encodeURIComponent(filter)}&$top=${pageSize}&$skip=${skip}`;
    try {
      const resp = await fetchWithRetry(url, { headers }, 3, `Property page skip=${skip}`);
      const data = await resp.json();
      const results = data.value || [];
      if (results.length === 0) break;
      all.push(...results);
      if (results.length < pageSize) break;
      skip += pageSize;
    } catch (err: any) {
      // Auth failures bubble up to abort the entire run
      if (err.message?.startsWith('AUTH_FAILURE')) throw err;
      console.error(`[PAGINATION] Failed at skip=${skip}: ${err.message}`);
      break; // Return what we have so far
    }
  }
  return all;
}

// =====================================================
// SINGLE URL FETCH (for buildings â€” non-paginated)
// Used by: buildings incremental (fetchPropTxListings strategies)
// =====================================================

export async function fetchSingleUrl(url: string, context: string): Promise<any[]> {
  try {
    const resp = await fetchWithRetry(url, { headers: getHeaders() }, 3, context);
    const data = await resp.json();
    return data.value || [];
  } catch (err: any) {
    if (err.message?.startsWith('AUTH_FAILURE')) throw err;
    console.error(`[FETCH] ${context} failed: ${err.message}`);
    return [];
  }
}

// =====================================================
// ENHANCED DATA FETCHING (Media, Rooms, Open Houses)
// Used by: homes incremental â€” fetches for a batch, applies 2-variant filter
// EXACT same logic as admin-homes/incremental-sync fetchEnhancedData
// =====================================================

const ENHANCED_BATCH_SIZE = 25;

export async function fetchEnhancedDataForHomes(listings: any[]): Promise<void> {
  const headers = getHeaders();
  const baseUrl = getBaseUrl();

  for (let i = 0; i < listings.length; i += ENHANCED_BATCH_SIZE) {
    const batch = listings.slice(i, i + ENHANCED_BATCH_SIZE);
    await Promise.all(batch.map(async (listing) => {
      const key = listing.ListingKey;
      if (!key) return;
      const [rooms, media, openHouses] = await Promise.all([
        fetchWithRetry(
          `${baseUrl}PropertyRooms?$filter=${encodeURIComponent(`ListingKey eq '${key}'`)}&$top=50`,
          { headers }, 2, `Rooms:${key}`
        ).then(r => r.json()).catch(() => ({ value: [] })),
        fetchWithRetry(
          `${baseUrl}Media?$filter=${encodeURIComponent(`ResourceRecordKey eq '${key}'`)}&$top=500`,
          { headers }, 2, `Media:${key}`
        ).then(r => r.json()).catch(() => ({ value: [] })),
        fetchWithRetry(
          `${baseUrl}OpenHouse?$filter=${encodeURIComponent(`ListingKey eq '${key}'`)}&$top=20`,
          { headers }, 2, `OpenHouse:${key}`
        ).then(r => r.json()).catch(() => ({ value: [] }))
      ]);
      listing.PropertyRooms = rooms.value || [];
      listing.Media = filterTwoVariants(media.value || []);
      listing.OpenHouses = openHouses.value || [];
    }));

    if (listings.length > ENHANCED_BATCH_SIZE && i > 0) {
      console.log(`  Enhanced data: ${Math.min(i + ENHANCED_BATCH_SIZE, listings.length)}/${listings.length}`);
    }
  }
}

// =====================================================
// ENHANCED DATA FETCHING (Per-listing, sequential)
// Used by: buildings incremental â€” fetches for newly added listings
// EXACT same logic as buildings/incremental-sync fetchEnhancedDataFromPropTx
// =====================================================

export async function fetchEnhancedDataForBuildings(originalListings: any[]): Promise<void> {
  const headers = getHeaders();
  const baseUrl = getBaseUrl();

  for (const listing of originalListings) {
    const key = listing.ListingKey;
    if (!key) {
      listing.Media = [];
      listing.PropertyRooms = [];
      listing.OpenHouses = [];
      continue;
    }

    // Fetch Media
    try {
      const mediaUrl = `${baseUrl}Media?$filter=${encodeURIComponent(`ResourceRecordKey eq '${key}'`)}&$top=500`;
      const resp = await fetchWithRetry(mediaUrl, { headers }, 2, `BuildingMedia:${key}`);
      const data = await resp.json();
      listing.Media = data.value || [];
    } catch {
      listing.Media = [];
    }

    // Fetch PropertyRooms
    try {
      const roomsUrl = `${baseUrl}PropertyRooms?$filter=${encodeURIComponent(`ListingKey eq '${key}'`)}&$top=50`;
      const resp = await fetchWithRetry(roomsUrl, { headers }, 2, `BuildingRooms:${key}`);
      const data = await resp.json();
      listing.PropertyRooms = data.value || [];
    } catch {
      listing.PropertyRooms = [];
    }

    // Fetch OpenHouses
    try {
      const ohUrl = `${baseUrl}OpenHouse?$filter=${encodeURIComponent(`ListingKey eq '${key}'`)}&$top=20`;
      const resp = await fetchWithRetry(ohUrl, { headers }, 2, `BuildingOH:${key}`);
      const data = await resp.json();
      listing.OpenHouses = data.value || [];
    } catch {
      listing.OpenHouses = [];
    }
  }
}

// =====================================================
// 2-VARIANT MEDIA FILTER (thumbnail + large only)
// EXACT same logic as admin-homes/incremental-sync filterTwoVariants
// Reduces storage by ~60% â€” only keep thumbnail (240px) and large (1920px)
// =====================================================

export function filterTwoVariants(allMediaItems: any[]): any[] {
  if (!allMediaItems || allMediaItems.length === 0) return [];

  // Sort by Order to maintain MLS photo sequence
  const sorted = [...allMediaItems].sort((a, b) =>
    (parseInt(a.Order) || 999) - (parseInt(b.Order) || 999)
  );

  // Group by base image ID
  const groups = new Map<string, any[]>();
  sorted.forEach(item => {
    const baseId = item.MediaURL
      ? item.MediaURL.split('/').pop()?.split('.')[0] || item.MediaKey
      : item.MediaKey || Math.random().toString();
    if (!groups.has(baseId)) groups.set(baseId, []);
    groups.get(baseId)!.push(item);
  });

  // Extract only thumbnail and large variants
  const filtered: any[] = [];
  groups.forEach(variants => {
    const thumb = variants.find((v: any) =>
      v.MediaURL && (v.MediaURL.includes('rs:fit:240:240') || v.ImageSizeDescription === 'Thumbnail')
    );
    const large = variants.find((v: any) =>
      v.MediaURL && (v.MediaURL.includes('rs:fit:1920:1920') || v.ImageSizeDescription === 'Large')
    );
    if (thumb) filtered.push({ ...thumb, variant_type: 'thumbnail' });
    if (large) filtered.push({ ...large, variant_type: 'large' });
  });

  return filtered;
}

// =====================================================
// CONNECTION TEST (preflight check)
// =====================================================

export async function testConnection(): Promise<boolean> {
  try {
    const url = `${getBaseUrl()}Property?$top=1&$select=ListingKey`;
    const resp = await fetchWithRetry(url, { headers: getHeaders() }, 1, 'connection-test');
    return resp.ok;
  } catch {
    return false;
  }
}

// =====================================================
// STREAMING PAGINATION  processes page-by-page, never accumulates
// Used by: full-sync-homes.ts to avoid OOM on large municipalities
// =====================================================
export async function forEachPage(
  filter: string,
  callback: (page: any[]) => Promise<void>,
  pageSize: number = 5000
): Promise<number> {
  const headers = getHeaders();
  const baseUrl = getBaseUrl();
  let skip = 0;
  let total = 0;

  while (true) {
    const url = `${baseUrl}Property?$filter=${encodeURIComponent(filter)}&$top=${pageSize}&$skip=${skip}`;
    try {
      const resp = await fetchWithRetry(url, { headers }, 3, `Property page skip=${skip}`);
      const data = await resp.json();
      const results = data.value || [];
      if (results.length === 0) break;
      total += results.length;
      await callback(results);
      if (results.length < pageSize) break;
      skip += pageSize;
    } catch (err: any) {
      if (err.message?.startsWith('AUTH_FAILURE')) throw err;
      console.error(`[PAGINATION-STREAM] Failed at skip=${skip}: ${err.message}`);
      break;
    }
  }
  return total;
}
