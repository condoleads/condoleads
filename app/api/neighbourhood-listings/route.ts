// app/api/neighbourhood-listings/route.ts
// Mirrors geo-listings but uses .in('municipality_id', ids) for neighbourhood aggregation
// Used by: NeighbourhoodListingSection (neighbourhood page, multiple municipalities)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CONDO_TYPES = [
  'Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
  'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment',
]
const RESIDENTIAL_TYPES = [
  'Detached', 'Semi-Detached', 'Att/Row/Townhouse',
  'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex',
]

const LISTING_SELECT = [
  'id', 'building_id', 'community_id', 'municipality_id',
  'listing_id', 'listing_key', 'standard_status', 'transaction_type',
  'list_price', 'close_price', 'close_date',
  'unit_number', 'unparsed_address',
  'bedrooms_total', 'bathrooms_total_integer',
  'property_type', 'property_subtype',
  'living_area_range', 'square_foot_source', 'building_area_total',
  'parking_total', 'locker', 'association_fee', 'tax_annual_amount',
  'days_on_market', 'listing_contract_date',
  // Home-specific fields
  'lot_width', 'lot_depth', 'lot_size_dimensions', 'lot_size_area', 'lot_size_area_units',
  'frontage_length', 'basement', 'garage_type', 'garage_yn',
  'approximate_age', 'legal_stories', 'architectural_style',
  'cooling', 'pool_features', 'fireplace_yn',
  // Media join
  'media (id, media_url, variant_type, order_number, preferred_photo_yn)',
].join(', ')

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // Required params
  const municipalityIdsParam = searchParams.get('municipalityIds')
  const tab = searchParams.get('tab')
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '24')

  // Filter params
  const propertyCategory = searchParams.get('propertyCategory') // 'condo' | 'homes' | null
  const minPrice = searchParams.get('minPrice')
  const maxPrice = searchParams.get('maxPrice')
  const beds = searchParams.get('beds')
  const baths = searchParams.get('baths')
  const sort = searchParams.get('sort') || 'default'
  const subtypes = searchParams.get('subtypes')
  const minSqft = searchParams.get('minSqft')
  const maxSqft = searchParams.get('maxSqft')
  const garage = searchParams.get('garage')
  const basement = searchParams.get('basement')
  const parking = searchParams.get('parking')
  const locker = searchParams.get('locker')

  if (!municipalityIdsParam || !tab) {
    return NextResponse.json({ error: 'Missing required params: municipalityIds, tab' }, { status: 400 })
  }

  const municipalityIds = municipalityIdsParam.split(',').filter(Boolean)
  if (!municipalityIds.length) {
    return NextResponse.json({ error: 'No valid municipality IDs provided' }, { status: 400 })
  }

  const supabase = createClient()

  const isActive = tab === 'for-sale' || tab === 'for-lease'
  const transactionType = (tab === 'for-sale' || tab === 'sold') ? 'For Sale' : 'For Lease'
  const offset = (page - 1) * pageSize

  // ─── Query Builder ───────────────────────────────────────────────────────────
  // NOTE: Always use available_in_vow (not idx) — neighbourhood pages are on
  // agent sites where VOW access is appropriate for all tabs including active.
  // IDX would silently hide ~93% of active listings.
  const buildQuery = (select: string, countOnly = false) => {
    let q = supabase
      .from('mls_listings')
      .select(
        countOnly ? 'id' : select,
        countOnly ? { count: 'exact', head: true } : undefined
      )
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', isActive ? 'Active' : 'Closed')
      .eq('transaction_type', transactionType)

    // Property category filter
    if (propertyCategory === 'condo') {
      q = q.in('property_subtype', CONDO_TYPES)
    } else if (propertyCategory === 'homes') {
      q = q.in('property_subtype', RESIDENTIAL_TYPES)
    }

    // Price
    if (minPrice) q = q.gte('list_price', parseInt(minPrice))
    if (maxPrice) q = q.lte('list_price', parseInt(maxPrice))

    // Beds / baths
    if (beds && beds !== '0') q = q.gte('bedrooms_total', parseInt(beds))
    if (baths && baths !== '0') q = q.gte('bathrooms_total_integer', parseInt(baths))

    // Subtypes (advanced filter — overrides propertyCategory if set)
    if (subtypes) q = q.in('property_subtype', subtypes.split(','))

    // Square footage
    if (minSqft) q = q.gte('building_area_total', parseInt(minSqft))
    if (maxSqft) q = q.lte('building_area_total', parseInt(maxSqft))

    // Garage type (ilike for partial match: 'Attached', 'Detached', 'Underground', etc.)
    if (garage && garage !== 'any') q = q.ilike('garage_type', `%${garage}%`)

    // Basement (ilike: 'Finished', 'Unfinished', 'None', etc.)
    if (basement && basement !== 'any') q = q.ilike('basement', `%${basement}%`)

    // Parking spots minimum
    if (parking && parking !== '0') q = q.gte('parking_total', parseInt(parking))

    // Locker (exact: 'Owned', 'Exclusive', 'None', etc.)
    if (locker && locker !== 'any') q = q.eq('locker', locker)

    return q
  }

  // ─── Sort + Paginate ─────────────────────────────────────────────────────────
  const applySortAndPaginate = (q: ReturnType<typeof buildQuery>) => {
    switch (sort) {
      case 'price_asc':  q = q.order('list_price', { ascending: true });  break
      case 'price_desc': q = q.order('list_price', { ascending: false }); break
      case 'newest':     q = q.order('listing_contract_date', { ascending: false }); break
      case 'dom_asc':    q = q.order('days_on_market', { ascending: true }); break
      default:           q = q.order('list_price', { ascending: false })
    }
    return q.range(offset, offset + pageSize - 1)
  }

  // ─── Execute ─────────────────────────────────────────────────────────────────
  try {
    const [listingsResult, countResult] = await Promise.all([
      applySortAndPaginate(buildQuery(LISTING_SELECT)),
      buildQuery('id', true),
    ])

    if (listingsResult.error) throw listingsResult.error
    if (countResult.error) throw countResult.error

    // Reduce media to single thumbnail per listing (sorted by order_number)
    const listings = (listingsResult.data || []).map((l: any) => ({
      ...l,
      media: (l.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
        .sort((a: any, b: any) => (a.order_number ?? 999) - (b.order_number ?? 999))
        .slice(0, 1),
    }))

    return NextResponse.json({
      listings,
      total: countResult.count ?? 0,
    })
  } catch (err: any) {
    console.error('[neighbourhood-listings] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}