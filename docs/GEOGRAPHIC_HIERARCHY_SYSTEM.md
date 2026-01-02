# CondoLeads Geographic Hierarchy System

## Overview

This document describes the complete geographic hierarchy system for CondoLeads, including the TREB data layer (auto-populated from PropTx MLS data) and the presentation layer (user-friendly neighbourhoods for browsing).

---

## Part 1: PropTx Source Fields

When syncing buildings from PropTx RESO API, geographic data comes from these fields in each listing:

### VERIFIED: PropTx Geographic Field Mapping

| PropTx Field | TREB Level | Example Value |
|--------------|------------|---------------|
| `CountyOrParish` | AREA | "Toronto" |
| `City` | MUNICIPALITY | "Toronto C01" |
| `CityRegion` | COMMUNITY | "Waterfront Communities C1" |

### Key Findings

1. **`CountyOrParish` = AREA** - This gives us "Toronto" directly, no parsing needed!
2. **`City` = MUNICIPALITY** - "Toronto C01" is the full municipality code
3. **`CityRegion` = COMMUNITY** - Direct community name
4. **`MLSAreaDistrictToronto`** - Inconsistent (sometimes null) - don't rely on it
5. **`Town`** - Always null for Toronto properties

### Database Mapping

| PropTx Field | Maps To |
|--------------|---------|
| `CountyOrParish` | `treb_areas.name` |
| `City` | `municipalities.name` |
| `CityRegion` | `communities.name` |

### Field Extraction in Code

```typescript
// In app/api/admin/buildings/save/route.ts
const communityId = await ensureGeographicHierarchy(
  firstListing.CountyOrParish,  // Area: "Toronto"
  firstListing.City,             // Municipality: "Toronto C01"
  firstListing.CityRegion        // Community: "Bay Street Corridor"
);
```

---

## Part 2: Database Schema - TREB Data Layer

### 2.1 Table: `treb_areas`

Top level of TREB hierarchy. Auto-populated from `CountyOrParish` field.

```sql
CREATE TABLE treb_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,  -- "Toronto", "Peel", "York"
  code VARCHAR(20),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Current Areas:**
- Toronto (covers all Toronto district codes)
- Peel (Mississauga, Brampton - future)
- York (Vaughan, Markham - future)

---

### 2.2 Table: `municipalities`

Second level. Auto-populated from `City` field. Links to Area.

```sql
CREATE TABLE municipalities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  area_id UUID NOT NULL REFERENCES treb_areas(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,         -- "Toronto C01"
  code VARCHAR(20),                   -- "C01" (extracted from name)
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(area_id, name)
);
```

**Toronto Municipalities (35 total):**

| Code | Full Name | Neighbourhood |
|------|-----------|---------------|
| C01 | Toronto C01 | Downtown |
| C02 | Toronto C02 | Midtown \| Central |
| C04 | Toronto C04 | Midtown \| Central |
| C06 | Toronto C06 | North York |
| C07 | Toronto C07 | North York |
| C08 | Toronto C08 | Downtown |
| C09 | Toronto C09 | Midtown \| Central |
| C10 | Toronto C10 | Midtown \| Central |
| C11 | Toronto C11 | Midtown \| Central |
| C12 | Toronto C12 | Midtown \| Central |
| C13 | Toronto C13 | Midtown \| Central |
| C14 | Toronto C14 | North York |
| C15 | Toronto C15 | North York |
| E01 | Toronto E01 | East End |
| E02 | Toronto E02 | East End |
| E03 | Toronto E03 | East York |
| E04 | Toronto E04 | East York |
| E05 | Toronto E05 | East York |
| E06 | Toronto E06 | Scarborough |
| E07 | Toronto E07 | Scarborough |
| E08 | Toronto E08 | Scarborough |
| E09 | Toronto E09 | Scarborough |
| E10 | Toronto E10 | Scarborough |
| E11 | Toronto E11 | Scarborough |
| W01 | Toronto W01 | West End |
| W02 | Toronto W02 | West End |
| W03 | Toronto W03 | West End |
| W04 | Toronto W04 | Etobicoke |
| W05 | Toronto W05 | Etobicoke |
| W06 | Toronto W06 | Etobicoke |
| W07 | Toronto W07 | Etobicoke |
| W08 | Toronto W08 | Etobicoke |
| W09 | Toronto W09 | York Crosstown |
| W10 | Toronto W10 | York Crosstown |

---

### 2.3 Table: `communities`

Third level. Auto-populated from `CityRegion` field. Links to Municipality.

```sql
CREATE TABLE communities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,         -- "Bay Street Corridor"
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(municipality_id, name)
);
```

**Example Communities (auto-created from synced buildings):**

| Municipality | Community |
|--------------|-----------|
| Toronto C01 | Bay Street Corridor |
| Toronto C01 | Waterfront Communities C1 |
| Toronto C01 | Niagara |
| Toronto C01 | University |
| Toronto C02 | Annex |
| Toronto C08 | Church-Yonge Corridor |
| Toronto C08 | Moss Park |
| Toronto C08 | Waterfront Communities C8 |
| Toronto C09 | Rosedale-Moore Park |

---

### 2.4 Table: `buildings`

Links to Community via `community_id` FK.

```sql
-- Added column to existing buildings table
ALTER TABLE buildings ADD COLUMN community_id UUID REFERENCES communities(id);
```

**Hierarchy Access:**
```sql
-- Get full hierarchy for a building
SELECT 
  b.building_name,
  c.name as community,
  m.name as municipality,
  m.code as muni_code,
  a.name as area
FROM buildings b
JOIN communities c ON c.id = b.community_id
JOIN municipalities m ON m.id = c.municipality_id
JOIN treb_areas a ON a.id = m.area_id
WHERE b.slug = 'your-building-slug';
```

---

### 2.5 Table: `mls_listings` (Properties)

Stores raw text values + inherits hierarchy through building FK.

```sql
-- Text fields (raw PropTx data)
county_or_parish VARCHAR(100),  -- "Toronto"
city VARCHAR(100),              -- "Toronto C01"
city_region VARCHAR(100),       -- "Bay Street Corridor"

-- Access control flags
available_in_idx BOOLEAN,       -- Public (Active listings)
available_in_vow BOOLEAN,       -- Registered users (Sold/Leased)
available_in_dla BOOLEAN,       -- Admin only (All data)
```

**Property Hierarchy Access:**
```sql
-- Get properties with full hierarchy
SELECT 
  l.listing_key,
  l.list_price,
  b.building_name,
  c.name as community,
  m.code as muni_code,
  n.name as neighbourhood
FROM mls_listings l
JOIN buildings b ON b.id = l.building_id
JOIN communities c ON c.id = b.community_id
JOIN municipalities m ON m.id = c.municipality_id
JOIN municipality_neighbourhoods mn ON mn.municipality_id = m.id
JOIN neighbourhoods n ON n.id = mn.neighbourhood_id;
```

---

## Part 3: Presentation Layer - Neighbourhoods

### 3.1 Table: `neighbourhoods`

User-friendly groupings of municipalities (Toronto only).

```sql
CREATE TABLE neighbourhoods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  area_id UUID REFERENCES treb_areas(id),  -- Links to Toronto area
  name VARCHAR(100) NOT NULL UNIQUE,        -- "Downtown"
  slug VARCHAR(100) NOT NULL UNIQUE,        -- "downtown"
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**9 Neighbourhoods (matching Condos.ca):**

| Order | Name | Slug |
|-------|------|------|
| 1 | Downtown | downtown |
| 2 | Midtown \| Central | midtown-central |
| 3 | North York | north-york |
| 4 | East End | east-end |
| 5 | East York | east-york |
| 6 | Scarborough | scarborough |
| 7 | West End | west-end |
| 8 | Etobicoke | etobicoke |
| 9 | York Crosstown | york-crosstown |

---

### 3.2 Table: `municipality_neighbourhoods`

Many-to-many mapping (a municipality belongs to one neighbourhood).

```sql
CREATE TABLE municipality_neighbourhoods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  neighbourhood_id UUID NOT NULL REFERENCES neighbourhoods(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(municipality_id, neighbourhood_id)
);
```

**Complete Mappings (matching Condos.ca exactly):**

| Neighbourhood | Municipality Codes |
|---------------|-------------------|
| Downtown | C01, C08 |
| Midtown \| Central | C02, C04, C09, C10, C11, C12, C13 |
| North York | C06, C07, C14, C15 |
| East End | E01, E02 |
| East York | E03, E04, E05 |
| Scarborough | E06, E07, E08, E09, E10, E11 |
| West End | W01, W02, W03 |
| Etobicoke | W04, W05, W06, W07, W08 |
| York Crosstown | W09, W10 |

---

## Part 4: Complete Hierarchy Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER BROWSES                                     │
│                              ↓                                           │
│     ┌─────────────────────────────────────────────────────────┐         │
│     │           PRESENTATION LAYER (Manual Setup)              │         │
│     │                                                          │         │
│     │  neighbourhoods                                          │         │
│     │  ├── Downtown                                            │         │
│     │  ├── Midtown | Central                                   │         │
│     │  ├── North York                                          │         │
│     │  └── ...                                                 │         │
│     │           ↓                                              │         │
│     │  municipality_neighbourhoods (mapping table)             │         │
│     │           ↓                                              │         │
│     └─────────────────────────────────────────────────────────┘         │
│                              ↓                                           │
│     ┌─────────────────────────────────────────────────────────┐         │
│     │              TREB DATA LAYER (Auto from PropTx)          │         │
│     │                                                          │         │
│     │  treb_areas (CountyOrParish)                             │         │
│     │  └── Toronto                                             │         │
│     │           ↓                                              │         │
│     │  municipalities (City)                                   │         │
│     │  ├── Toronto C01                                         │         │
│     │  ├── Toronto C08                                         │         │
│     │  └── ...                                                 │         │
│     │           ↓                                              │         │
│     │  communities (CityRegion)                                │         │
│     │  ├── Bay Street Corridor                                 │         │
│     │  ├── Waterfront Communities C1                           │         │
│     │  └── ...                                                 │         │
│     │           ↓                                              │         │
│     │  buildings (community_id FK)                             │         │
│     │  ├── Aura at College Park                                │         │
│     │  ├── 88 Scott Condos                                     │         │
│     │  └── ...                                                 │         │
│     │           ↓                                              │         │
│     │  mls_listings (building_id FK)                           │         │
│     │  └── Individual units/properties                         │         │
│     │                                                          │         │
│     └─────────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Auto-Population Logic

### 5.1 Full Sync (app/api/admin/buildings/save/route.ts)

When admin syncs a building:

```typescript
// Step 1: Save building record
// Step 2: Save listings
// Step 3: Save media, rooms, open houses
// Step 3.5: Link building to geographic hierarchy (NEW)
if (chunkIndex === 0) {
  await linkBuildingToHierarchy(building.id, listingsData);
}
```

**`linkBuildingToHierarchy()` function:**
1. Extracts `CountyOrParish`, `City`, `CityRegion` from first listing
2. Calls `ensureGeographicHierarchy()` to create/find hierarchy entries
3. Updates `buildings.community_id` with the community ID

**`ensureGeographicHierarchy()` function:**
1. Creates Area if not exists → returns `area_id`
2. Creates Municipality under Area if not exists → returns `municipality_id`
3. Creates Community under Municipality if not exists → returns `community_id`
4. Returns `community_id` for building link

---

### 5.2 Incremental Sync (TO BE UPDATED)

File: `app/api/admin/buildings/incremental-sync/route.ts`

Needs backfill logic:
```typescript
// At end of incremental sync
if (!building.community_id && listings.length > 0) {
  await linkBuildingToHierarchy(building.id, listings);
}
```

---

## Part 6: Access Control Tagging

Properties are tagged for IDX/VOW/DLA access:

| Tag | Logic | Who Sees It |
|-----|-------|-------------|
| `available_in_idx` | Active + InternetEntireListingDisplayYN = true | Anonymous (public) |
| `available_in_vow` | DDFYN = true | Registered users (sold/leased) |
| `available_in_dla` | Always true | Admin/Internal (all data) |

```typescript
// In save route
available_in_idx: determineIDXAccess(listing),
available_in_vow: determineVOWAccess(listing),
available_in_dla: true,
```

---

## Part 7: Useful Queries

### Get full hierarchy with building counts
```sql
SELECT 
  n.name as neighbourhood,
  m.code as muni_code,
  c.name as community,
  COUNT(b.id) as buildings
FROM neighbourhoods n
JOIN municipality_neighbourhoods mn ON mn.neighbourhood_id = n.id
JOIN municipalities m ON m.id = mn.municipality_id
JOIN communities c ON c.municipality_id = m.id
LEFT JOIN buildings b ON b.community_id = c.id
GROUP BY n.name, n.display_order, m.code, c.name
ORDER BY n.display_order, m.code, c.name;
```

### Get neighbourhood summary
```sql
SELECT 
  n.name as neighbourhood,
  STRING_AGG(m.code, ', ' ORDER BY m.code) as municipality_codes
FROM neighbourhoods n
JOIN municipality_neighbourhoods mn ON mn.neighbourhood_id = n.id
JOIN municipalities m ON m.id = mn.municipality_id
GROUP BY n.name, n.display_order
ORDER BY n.display_order;
```

### Filter properties by neighbourhood
```sql
SELECT l.* 
FROM mls_listings l
JOIN buildings b ON b.id = l.building_id
JOIN communities c ON c.id = b.community_id
JOIN municipalities m ON m.id = c.municipality_id
JOIN municipality_neighbourhoods mn ON mn.municipality_id = m.id
JOIN neighbourhoods n ON n.id = mn.neighbourhood_id
WHERE n.slug = 'downtown'
AND l.available_in_idx = true;  -- Public listings only
```

---

## Part 8: Future Work

| Task | Status | Notes |
|------|--------|-------|
| TREB hierarchy tables | ✅ Done | Auto-populates from PropTx |
| Buildings linked to communities | ✅ Done | 31/31 buildings |
| Neighbourhoods created | ✅ Done | 9 neighbourhoods |
| Municipality mappings | ✅ Done | 35 codes mapped |
| IDX/VOW/DLA tagging | ✅ Done | Auto-tagged on sync |
| Incremental sync backfill | ❌ Pending | Add hierarchy logic |
| Admin UI for hierarchy | ❌ Pending | View/edit neighbourhoods |
| Map filtering | ❌ Pending | Filter by neighbourhood |
| GTA expansion | ❌ Future | Peel, York, Durham areas |

---

## Part 9: File Locations

| File | Purpose |
|------|---------|
| `app/api/admin/buildings/save/route.ts` | Full sync with hierarchy creation |
| `app/api/admin/buildings/search/route.ts` | PropTx search (returns raw data) |
| `app/api/admin/buildings/incremental-sync/route.ts` | Incremental updates (needs update) |

---

## Part 10: Database Permissions

All geographic tables have RLS disabled and full grants:

```sql
ALTER TABLE treb_areas DISABLE ROW LEVEL SECURITY;
ALTER TABLE municipalities DISABLE ROW LEVEL SECURITY;
ALTER TABLE communities DISABLE ROW LEVEL SECURITY;
ALTER TABLE neighbourhoods DISABLE ROW LEVEL SECURITY;
ALTER TABLE municipality_neighbourhoods DISABLE ROW LEVEL SECURITY;

GRANT ALL ON treb_areas TO postgres, anon, authenticated, service_role;
GRANT ALL ON municipalities TO postgres, anon, authenticated, service_role;
GRANT ALL ON communities TO postgres, anon, authenticated, service_role;
GRANT ALL ON neighbourhoods TO postgres, anon, authenticated, service_role;
GRANT ALL ON municipality_neighbourhoods TO postgres, anon, authenticated, service_role;
```

---

*Document created: January 2, 2026*
*Last updated: January 2, 2026*