# Bulk Building Discovery System - Technical Documentation

## Overview

The Bulk Building Discovery system automatically identifies and syncs condo buildings from PropTx MLS data across the Greater Toronto Area. This enables rapid population of the CondoLeads platform with minimal manual intervention.

---

## Architecture
```

                     BULK DISCOVERY FLOW                        

                                                                 
  1. DISCOVERY (PropTx Query)                                   
      /api/admin/bulk-discovery/discover/route.ts            
         - Query PropertyType = 'Condo Apt'                     
         - Group by StreetNumber + StreetName + City            
         - Extract BuildingName from MLS                        
         - Save to discovered_buildings table                   
                                                                 
  2. SEARCH (Direct Function - No HTTP)                         
      /lib/building-sync/search.ts                           
         - Fetch active listings ($top=5000)                    
         - Fetch completed transactions ($top=15000)            
         - Filter by exact address match                        
         - Fetch enhanced data (rooms, media, open houses)      
                                                                 
  3. SAVE (Direct Function - No HTTP)                           
      /lib/building-sync/save.ts                             
         - Clean existing building data                         
         - Map ALL 470+ DLA fields                              
         - UPSERT listings (handles duplicates)                 
         - Save media (2-variant: thumbnail + large)            
         - Save rooms and open houses                           
         - Link to geographic hierarchy                         
                                                                 
  4. SYNC ORCHESTRATION                                         
      /api/admin/bulk-discovery/sync/route.ts                
         - Batch parallel processing (BATCH_SIZE = 100)         
         - SSE progress streaming                               
         - Status tracking (pending/syncing/synced/failed)      
                                                                 

```

---

## File Paths

### Core Discovery & Sync Files

| Purpose | Path |
|---------|------|
| Discovery API | `app/api/admin/bulk-discovery/discover/route.ts` |
| Search Function | `lib/building-sync/search.ts` |
| Save Function | `lib/building-sync/save.ts` |
| Sync Orchestrator | `app/api/admin/bulk-discovery/sync/route.ts` |
| Geo Tree API | `app/api/admin/bulk-discovery/geo-tree/route.ts` |
| Buildings List API | `app/api/admin/bulk-discovery/buildings/route.ts` |
| UI Page | `app/admin/bulk-discovery/page.tsx` |

### Database Tables

| Table | Purpose |
|-------|---------|
| `discovered_buildings` | Staging table for discovered buildings |
| `buildings` | Production buildings table |
| `mls_listings` | All listing data (470+ fields) |
| `media` | Listing photos (2-variant storage) |
| `property_rooms` | Room details per listing |
| `open_houses` | Open house schedules |
| `treb_areas` | Geographic: Areas (Toronto, Peel, etc.) |
| `municipalities` | Geographic: Municipalities (C01-C15, etc.) |
| `communities` | Geographic: Communities/Neighbourhoods |

---

## PropTx Query Logic

### Discovery Query (discover/route.ts)
```typescript
// Primary filter: Condo apartments only
$filter = PropertyType eq 'Condo Apt' and City eq '{municipalityName}'

// Fields extracted:
- StreetNumber      // Building address
- StreetName        // Street name
- City              // Municipality (Toronto C01, etc.)
- BuildingName      // MLS building name (if present)
- ListingKey        // For counting listings per building

// Grouping logic:
Buildings are grouped by: StreetNumber + StreetName (first word) + City
```

### Search Query (lib/building-sync/search.ts)
```typescript
// Strategy 1: Active listings
$filter = PropertyType eq 'Condo Apt' and StandardStatus eq 'Active'
$expand = Media,PropertyRooms,OpenHouses
$top = 5000

// Strategy 2: Completed transactions
$filter = PropertyType eq 'Condo Apt' and 
          (StandardStatus eq 'Sold' or StandardStatus eq 'Leased' or 
           StandardStatus eq 'Expired' or StandardStatus eq 'Terminated')
$top = 15000

// Address filtering (in code):
1. Exact street number match
2. Street name first word match (handles "Bay St" vs "Bay Street")
3. City first word match (handles "Toronto C01" vs "Toronto")
```

---

## Key Optimizations

### 1. Direct Functions (No HTTP Overhead)
**Before:** sync  HTTP fetch  search route  PropTx  HTTP fetch  save route  Supabase
**After:** sync  direct function  PropTx  direct function  Supabase

**Result:** Eliminated 60-second timeout issues

### 2. UPSERT for Duplicates
```typescript
await supabase
  .from('mls_listings')
  .upsert(records, { onConflict: 'listing_key', ignoreDuplicates: false })
```
**Result:** No more "duplicate key" errors, orphaned listings auto-corrected

### 3. Parallel Batch Processing
```typescript
const BATCH_SIZE = 100; // Buildings processed in parallel
```
**Result:** 100 buildings sync simultaneously vs 1 at a time

### 4. Two-Variant Media Storage
```typescript
// Only store thumbnail + large (not all 6 variants)
const thumbnail = variants.find(v => v.ImageSizeDescription === 'Thumbnail');
const large = variants.find(v => v.ImageSizeDescription === 'Large');
```
**Result:** 60% storage reduction

### 5. Text Truncation
```typescript
function truncate(value: any, maxLength: number): string | null
// Applied to: directions, public_remarks, virtual_tour_url, etc.
```
**Result:** No more "VARCHAR overflow" errors

---

## Geographic Hierarchy
```
Area (Toronto, Peel, York, Durham, Halton)
   Municipality (Toronto C01, Toronto C02, Mississauga, etc.)
         Community (Bay Street Corridor, Yorkville, etc.)
               Building (One St Thomas, Aura Condos, etc.)
```

### Hierarchy Source
- **Discovery:** Uses PropTx `City` field to determine municipality
- **Building Save:** Uses PropTx fields:
  - `CountyOrParish`  Area
  - `City`  Municipality  
  - `CityRegion`  Community

---

## Status Tracking

| Status | Meaning |
|--------|---------|
| `pending` | Discovered but not synced |
| `syncing` | Currently being synced |
| `synced` | Successfully synced to buildings table |
| `failed` | Sync failed (see failed_reason) |

---

## Complete DLA Field Mapping

The save function maps ALL 470+ DLA fields from PropTx to our database.

### Field Categories:
- **Identifiers:** ListingKey, ListingId, OriginatingSystemID
- **Address:** StreetNumber, StreetName, City, PostalCode, UnitNumber
- **Property:** PropertyType, PropertySubType, TransactionType
- **Pricing:** ListPrice, ClosePrice, OriginalListPrice
- **Status:** StandardStatus, MlsStatus, ContractStatus
- **Dates:** ListingContractDate, CloseDate, PossessionDate
- **Rooms:** BedroomsTotal, BathroomsTotalInteger, KitchensTotal
- **Size:** BuildingAreaTotal, LotSizeArea
- **Fees:** AssociationFee, TaxAnnualAmount
- **Parking:** ParkingTotal, ParkingType1, ParkingSpot1
- **Features:** Balcony, Exposure, View, Laundry
- **Utilities:** HeatType, Cooling, Utilities
- **Descriptions:** PublicRemarks, Inclusions, Exclusions
- **Brokerage:** ListOfficeName, ListAgentFullName
- **Media References:** VirtualTourURL, photos
- **Access Control:** InternetEntireListingDisplayYN, DDFYN
- **And 400+ more fields...**

---

## Performance Benchmarks

| Metric | Value |
|--------|-------|
| Single building sync | ~30-60 seconds |
| Batch of 50 buildings | ~15-20 minutes |
| Batch of 100 buildings | ~25-35 minutes |
| Listings per building | 50-1500 average |
| Media records per building | 200-5000 |

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Timeout on large buildings | Direct functions eliminate HTTP timeout |
| Duplicate key error | UPSERT handles automatically |
| VARCHAR overflow | Text truncation applied |
| Fetch failed (network) | Transient - retry usually works |
| Statement timeout | Reduce batch size or retry |

---

## Future Improvements

1. **Area-level discovery** - Discover all municipalities in an area at once
2. **Retry logic** - Auto-retry failed buildings with exponential backoff
3. **Incremental sync** - Daily sync of only changed listings
4. **Pre-construction support** - Manual building creation for new developments
5. **Fuzzy matching** - Detect duplicate buildings with different addresses
6. **Rate limiting** - Dynamic batch size based on PropTx response times

---

## Milestone Achievement

**Date:** January 6, 2026

**Accomplishments:**
-  Bulk discovery system operational
-  Direct sync functions (no HTTP timeout)
-  470+ DLA field mapping complete
-  Parallel batch processing (100 buildings)
-  Multi-select bulk agent assignment
-  ~50+ buildings synced in Toronto C01
-  Geographic hierarchy auto-linking

**Next Phase:**
- Expand to all Toronto municipalities (C02-C15)
- Expand to Peel, York, Durham, Halton regions
- Estimated 5,000-20,000 buildings total

---

*Documentation created: January 6, 2026*
*System designed and implemented for CondoLeads.ca*
