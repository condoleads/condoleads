// lib/psf/fetch-proptx.ts

/**
 * Fetch sold/leased condo data from PropTx API
 * Mirrors parking calculation's fetch pattern with pagination
 */

const PROPTX_URL = process.env.PROPTX_RESO_API_URL || 'https://query.ampre.ca/odata/';
const PROPTX_TOKEN = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_BEARER_TOKEN;

// Get today's date in YYYY-MM-DD format for filtering out future closing dates
function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export interface PropTxRecord {
  ClosePrice: number;
  CloseDate: string;
  SquareFootSource: string | null;
  LivingAreaRange: string | null;
  ParkingTotal: number | null;
  CountyOrParish: string | null;
  City: string | null;
  CityRegion: string | null;
  StreetNumber: string | null;
  StreetName: string | null;
  TransactionType: string;
}

export interface FetchResult {
  records: PropTxRecord[];
  totalFetched: number;
  apiCalls: number;
}

const SELECT_FIELDS = [
  'ClosePrice',
  'CloseDate',
  'SquareFootSource',
  'LivingAreaRange',
  'ParkingTotal',
  'CountyOrParish',
  'City',
  'CityRegion',
  'StreetNumber',
  'StreetName',
  'TransactionType'
].join(',');

/**
 * Fetch sale transactions from PropTx
 */
export async function fetchSaleData(
  geoField?: 'CountyOrParish' | 'City' | 'CityRegion',
  geoValue?: string,
  maxRecords: number = 50000
): Promise<FetchResult> {
  const baseFilter = `PropertyType eq 'Residential Condo & Other' and StandardStatus eq 'Closed' and TransactionType eq 'For Sale' and ClosePrice gt 100000 and CloseDate le ${getTodayISO()}`;
  
  const filter = geoField && geoValue
    ? `${baseFilter} and ${geoField} eq '${geoValue.replace(/'/g, "''")}'`
    : baseFilter;

  return fetchFromPropTx(filter, maxRecords);
}

/**
 * Fetch lease transactions from PropTx
 */
export async function fetchLeaseData(
  geoField?: 'CountyOrParish' | 'City' | 'CityRegion',
  geoValue?: string,
  maxRecords: number = 50000
): Promise<FetchResult> {
  const baseFilter = `PropertyType eq 'Residential Condo & Other' and StandardStatus eq 'Closed' and TransactionType eq 'For Lease' and ClosePrice gt 500 and ClosePrice lt 15000 and CloseDate le ${getTodayISO()}`;
  
  const filter = geoField && geoValue
    ? `${baseFilter} and ${geoField} eq '${geoValue.replace(/'/g, "''")}'`
    : baseFilter;

  return fetchFromPropTx(filter, maxRecords);
}

/**
 * Core fetch function with pagination
 */
async function fetchFromPropTx(
  filter: string,
  maxRecords: number
): Promise<FetchResult> {
  const records: PropTxRecord[] = [];
  let skip = 0;
  const top = 5000;
  let apiCalls = 0;

  while (records.length < maxRecords) {
    const url = `${PROPTX_URL}Property?$filter=${encodeURIComponent(filter)}&$select=${SELECT_FIELDS}&$top=${top}&$skip=${skip}&$orderby=CloseDate desc`;

    try {
      apiCalls++;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${PROPTX_TOKEN}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`PropTx fetch failed: ${response.status}`);
        break;
      }

      const data = await response.json();
      const batch = data.value || [];

      if (batch.length === 0) break;

      records.push(...batch);
      skip += top;

      console.log(`[PropTx] Fetched ${records.length} records (${apiCalls} calls)`);

      if (batch.length < top) break;
    } catch (error) {
      console.error('[PropTx] Fetch error:', error);
      break;
    }
  }

  return {
    records: records.slice(0, maxRecords),
    totalFetched: records.length,
    apiCalls,
  };
}

/**
 * Fetch data for a specific building by address
 */
export async function fetchBuildingData(
  streetNumber: string,
  streetName: string,
  transactionType: 'sale' | 'lease'
): Promise<FetchResult> {
  const streetNameFirst = streetName.split(' ')[0];
  const priceFilter = transactionType === 'sale' 
    ? 'ClosePrice gt 100000' 
    : 'ClosePrice gt 500 and ClosePrice lt 15000';
  const typeFilter = transactionType === 'sale' 
    ? "TransactionType eq 'For Sale'" 
    : "TransactionType eq 'For Lease'";

  const filter = `PropertyType eq 'Residential Condo & Other' and StandardStatus eq 'Closed' and ${typeFilter} and ${priceFilter} and StreetNumber eq '${streetNumber}' and startswith(StreetName, '${streetNameFirst}')`;

  return fetchFromPropTx(filter, 5000);
}



/**
 * Fetch sale transactions for a specific building
 * Uses StreetNumber + StreetName + City for accurate matching
 */
export async function fetchBuildingSaleData(
  streetNumber: string,
  streetName: string,
  city: string,
  maxRecords: number = 5000
): Promise<FetchResult> {
  // Extract first word of street name (PropTx stores 'Hanna' not 'Hanna Ave')
  const streetNameFirst = streetName.split(' ')[0].replace(/'/g, "''");
  const cityFirst = city.split(' ')[0].replace(/'/g, "''");
  
  // Use contains for street name to handle variations (St vs Street, etc.)
  const filter = `PropertyType eq 'Residential Condo & Other' and StandardStatus eq 'Closed' and TransactionType eq 'For Sale' and ClosePrice gt 100000 and CloseDate le ${getTodayISO()} and StreetNumber eq '${streetNumber}' and contains(tolower(StreetName),tolower('${streetNameFirst}')) and contains(tolower(City),tolower('${cityFirst}'))`;
  
  return fetchFromPropTx(filter, maxRecords);
}

/**
 * Fetch lease transactions for a specific building
 */
export async function fetchBuildingLeaseData(
  streetNumber: string,
  streetName: string,
  city: string,
  maxRecords: number = 5000
): Promise<FetchResult> {
  // Extract first word of street name (PropTx stores 'Hanna' not 'Hanna Ave')
  const streetNameFirst = streetName.split(' ')[0].replace(/'/g, "''");
  const cityFirst = city.split(' ')[0].replace(/'/g, "''");
  
  const filter = `PropertyType eq 'Residential Condo & Other' and (TransactionType eq 'For Lease' or StandardStatus eq 'Leased') and ClosePrice gt 0 and ClosePrice lt 15000 and CloseDate le ${getTodayISO()} and StreetNumber eq '${streetNumber}' and contains(tolower(StreetName),tolower('${streetNameFirst}')) and contains(tolower(City),tolower('${cityFirst}'))`;
  
  return fetchFromPropTx(filter, maxRecords);
}

