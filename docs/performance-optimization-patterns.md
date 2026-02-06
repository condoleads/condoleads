# CondoLeads Performance Optimization Patterns

**Date:** February 6, 2026
**Purpose:** Document proven patterns for page load performance across all page types. MUST be followed when building new pages (landing pages, residential pages, combined listing pages).

---

## Core Problem & Solution

Real estate pages with 100+ listings cause massive HTML payloads (1-2MB+) and server response times (10-30s). The solution is a **tiered data loading strategy** that delivers fast initial paint while keeping all data accessible.

### Results Achieved

| Page | Before | After | Target |
|------|--------|-------|--------|
| Building Page (88 Scott) | 5.81s LCP | 1.90s LCP | < 2.5s ✅ |
| Development Page (Harbour Plaza) | 7.28s LCP | 1.42s LCP | < 2.5s ✅ |
| Home Page | 3.46s LCP | 2.32s LCP | < 2.5s ✅ |

---

## Pattern 1: Tiered Data Loading (CRITICAL)

### Rule: Never server-render ALL listings with media

Server-side rendering 700+ listings with media creates 1.5MB+ HTML payloads. Instead:

**Tier 1 - Server Rendered (Active Listings):**
- Fetch WITH media (thumbnails only, 1 per listing)
- These are what 95% of visitors want to see
- Typically 5-30 listings per building
- Uses `unstable_cache` with 60s revalidate

**Tier 2 - Client Fetched on Tab Click (Sold/Leased):**
- Only counts sent server-side for tab badges
- Full data fetched via API when user clicks Sold/Leased tab
- API routes: `/api/building-listings` and `/api/development-listings`
- Includes loading spinner during fetch

**Tier 3 - Stats/Calculations (Closed listings without media):**
- Fetch closed listings WITHOUT media for server-side calculations
- Used for: avg price, highest sale, avg days on market, price charts
- Lightweight query (~50 fields vs 50 fields + media joins)

### Implementation Pattern

```typescript
// ✅ CORRECT: Split queries by status
const getCachedActiveListings = unstable_cache(
  async (buildingId: string) => {
    const { data } = await supabase
      .from('mls_listings')
      .select('...all_fields..., media (id, media_url, variant_type, order_number, preferred_photo_yn)')
      .eq('building_id', buildingId)
      .eq('standard_status', 'Active')  // Only active
      .order('list_price', { ascending: false })
    return data
  },
  ['active-listings'],
  { revalidate: 60 }
)

const getCachedClosedListings = unstable_cache(
  async (buildingId: string) => {
    const { data } = await supabase
      .from('mls_listings')
      .select('...all_fields...')  // NO media join
      .eq('building_id', buildingId)
      .eq('standard_status', 'Closed')
      .order('list_price', { ascending: false })
    return data
  },
  ['closed-listings'],
  { revalidate: 60 }
)

// ❌ WRONG: Fetching everything at once
const { data: allListings } = await supabase
  .from('mls_listings')
  .select('...all_fields..., media (...)')
  .eq('building_id', buildingId)  // Gets ALL 700+ listings with media
```

---

## Pattern 2: unstable_cache Usage

### Rules:
1. **Cache per building, not per development** - Large developments have too much data for single cache entries
2. **Never pass arrays directly** - `unstable_cache` doesn't serialize arrays properly for cache keys
3. **Use unique cache key names** - Change key name (e.g., v2) to bust stale cache after deployments
4. **Only cache with the anon supabase client** - Cached functions run outside request context, can't use `createClient()` server client
5. **Agent lookups are NEVER cached** - They depend on the request host/domain

### Array Parameter Pattern
```typescript
// ❌ WRONG: Array argument breaks cache key
const getCachedListings = unstable_cache(
  async (buildingIds: string[]) => { ... },  // Arrays don't cache properly
  ['listings'],
  { revalidate: 60 }
)

// ✅ CORRECT: Serialize array to JSON string
const getCachedListings = unstable_cache(
  async (buildingIdsJson: string) => {
    const buildingIds = JSON.parse(buildingIdsJson) as string[]
    // ... query using buildingIds
  },
  ['listings'],
  { revalidate: 60 }
)
// Call with: getCachedListings(JSON.stringify(buildingIds))

// ✅ BEST: Cache per building individually, run in parallel
const listingsPerBuilding = await Promise.all(
  buildingIds.map(id => getCachedListingsForBuilding(id))
)
const allListings = listingsPerBuilding.flat()
```

---

## Pattern 3: API Routes for Lazy-Loaded Data

### Building Listings API
**File:** `app/api/building-listings/route.ts`
**Params:** `buildingId`, `type` ('sold' | 'leased')
**Returns:** Closed listings WITH media (thumbnails only, 1 per listing)
**Used by:** ListingSection component on tab click

### Development Listings API
**File:** `app/api/development-listings/route.ts`
**Params:** `developmentId`, `type` ('sold' | 'leased')
**Returns:** Closed listings WITH media for all buildings in development
**Used by:** DevelopmentListings component on tab click

### Pattern for New Page Types
```typescript
// API route template for lazy-loaded listings
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const entityId = searchParams.get('entityId')
  const type = searchParams.get('type') // 'sold' | 'leased'
  
  const transactionType = type === 'sold' ? 'For Sale' : 'For Lease'
  
  const { data } = await supabase
    .from('mls_listings')
    .select('...fields..., media (...)')
    .eq('building_id', entityId)  // or .in('building_id', buildingIds)
    .eq('transaction_type', transactionType)
    .eq('standard_status', 'Closed')
    
  // Filter to thumbnail media only
  const processed = (data || []).map(listing => ({
    ...listing,
    media: (listing.media?.filter(m => m.variant_type === 'thumbnail') || [])
      .sort((a, b) => (a.order_number || 999) - (b.order_number || 999))
      .slice(0, 1)
  }))
  
  return NextResponse.json({ listings: processed })
}
```

---

## Pattern 4: Client Component Lazy Loading

### Tab-Based Lazy Loading (ListingSection / DevelopmentListings)
```typescript
// State for lazy-loaded data
const [closedSales, setClosedSales] = useState<any[]>([])
const [loadingSold, setLoadingSold] = useState(false)
const [soldLoaded, setSoldLoaded] = useState(false)

// Fetch on tab click (only once)
const fetchClosedListings = async (type: 'sold' | 'leased') => {
  if (type === 'sold' && soldLoaded) return  // Don't re-fetch
  setLoadingSold(true)
  try {
    const res = await fetch(`/api/building-listings?buildingId=${id}&type=${type}`)
    const json = await res.json()
    setClosedSales(json.listings || [])
    setSoldLoaded(true)
  } finally {
    setLoadingSold(false)
  }
}
```

---

## Pattern 5: Media Optimization

### Rules:
1. **Only store 2 variants:** thumbnail (240x240) and large (1920x1920)
2. **Server-render thumbnails only** - 1 per listing card
3. **Load additional photos on demand** - When user clicks carousel arrows
4. **Never server-render large images** - Only loaded on property detail pages
5. **Filter media in queries:** `.eq('variant_type', 'thumbnail')`

### ListingCard Media Pattern
```typescript
// Initial: 1 thumbnail from server
const initialPhotos = listing.media?.filter(m => m.variant_type === 'thumbnail') || []

// On-demand: Fetch more photos when user navigates carousel
const loadAllPhotos = async () => {
  const { data } = await supabase
    .from('media')
    .select('id, media_url, variant_type, order_number, preferred_photo_yn')
    .eq('listing_id', listing.id)
    .eq('variant_type', 'thumbnail')
    .order('order_number', { ascending: true })
  setPhotos(data || [])
}
```

---

## Pattern 6: Home Page / Landing Page Optimization

### For pages showing multiple buildings/developments:
1. **Only fetch active listing COUNTS** - Don't fetch full listing data
2. **Filter at database level** - `.eq('standard_status', 'Active')` in query
3. **Limit building data** - Select only fields needed for cards
4. **Cache building queries** - Buildings data rarely changes

```typescript
// ✅ CORRECT: Count-only query for building cards
const { data: allListings } = await supabase
  .from('mls_listings')
  .select('id, building_id, transaction_type')
  .in('building_id', allBuildingIds)
  .eq('standard_status', 'Active')
  .limit(5000)

// ❌ WRONG: Fetching all listings with all fields for building cards
const { data: allListings } = await supabase
  .from('mls_listings')
  .select('*')
  .in('building_id', allBuildingIds)
```

---

## Diagnostic Commands

### Measure page performance (ALWAYS run before/after changes):
```powershell
# Measure server response time and HTML payload size
$timing = Measure-Command { 
    $r = Invoke-WebRequest -Uri "https://yourcondorealtor.ca/PAGE-SLUG" -UseBasicParsing -TimeoutSec 30
}
Write-Host "Response: $([math]::Round($timing.TotalSeconds, 2))s / $([math]::Round($r.Content.Length / 1024, 1)) KB"

# Count embedded images in HTML
($r.Content | Select-String -Pattern "trreb-image" -AllMatches).Matches.Count

# Compare pages
Write-Host "Building:" ; $t1 = Measure-Command { $r1 = Invoke-WebRequest -Uri "https://yourcondorealtor.ca/88-scott-condos-88-scott-st-toronto" -UseBasicParsing -TimeoutSec 30 } ; Write-Host "$([math]::Round($t1.TotalSeconds,2))s / $([math]::Round($r1.Content.Length/1024,1))KB"
```

### Performance Targets:
- **HTML payload:** < 300 KB for any page
- **Server response (TTFB):** < 3s cold, < 1s warm
- **LCP:** < 2.5s (Google Core Web Vitals target)
- **CLS:** < 0.1
- **Embedded images:** < 50 per page

---

## Checklist for New Pages

When building ANY new page that displays listings:

- [ ] Identify which listings need server rendering (active only?)
- [ ] Use `unstable_cache` for database queries (60s revalidate)
- [ ] Never cache agent/host-dependent queries
- [ ] Fetch closed listings WITHOUT media for calculations
- [ ] Create API route for lazy-loaded tab data if needed
- [ ] Use thumbnail variant only for listing cards
- [ ] Limit to 1 photo per card server-side
- [ ] Measure HTML payload size (must be < 300 KB)
- [ ] Measure LCP (must be < 2.5s)
- [ ] Test both cold start and cached performance
- [ ] Run diagnostic PowerShell commands before AND after

---

## File Reference

| File | Purpose |
|------|---------|
| `app/[slug]/BuildingPage.tsx` | Building page with split active/closed queries |
| `app/[slug]/DevelopmentPage.tsx` | Development page with lazy-loaded sold/leased |
| `app/[slug]/components/ListingSection.tsx` | Building listing tabs with lazy loading |
| `app/[slug]/components/DevelopmentListings.tsx` | Development listing tabs with lazy loading |
| `app/[slug]/components/ListingCard.tsx` | Individual listing card with on-demand photos |
| `app/api/building-listings/route.ts` | API for lazy-loaded building sold/leased |
| `app/api/development-listings/route.ts` | API for lazy-loaded development sold/leased |
| `lib/supabase/client.ts` | Anon key client (used in cached functions) |
| `lib/supabase/server.ts` | Service role client (used in non-cached queries) |
