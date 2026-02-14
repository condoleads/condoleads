import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CONDO_TYPES = ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment', 'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment']
const RESIDENTIAL_TYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']

const LISTING_SELECT = 'id, building_id, community_id, municipality_id, listing_id, listing_key, standard_status, transaction_type, list_price, close_price, close_date, unit_number, unparsed_address, bedrooms_total, bathrooms_total_integer, property_type, property_subtype, living_area_range, square_foot_source, parking_total, locker, association_fee, tax_annual_amount, days_on_market, listing_contract_date, building_area_total, lot_width, lot_depth, lot_size_dimensions, lot_size_area, lot_size_area_units, frontage_length, basement, garage_type, garage_yn, approximate_age, legal_stories, architectural_style, cooling, pool_features, fireplace_yn, media (id, media_url, variant_type, order_number, preferred_photo_yn)'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const geoType = searchParams.get('geoType')
  const geoId = searchParams.get('geoId')
  const tab = searchParams.get('tab')
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '24')

  // Filter params
  const propertyCategory = searchParams.get('propertyCategory')
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

  if (!geoType || !geoId || !tab) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const columnMap: Record<string, string> = {
    community: 'community_id',
    municipality: 'municipality_id',
    area: 'area_id',
  }
  const column = columnMap[geoType]
  if (!column) {
    return NextResponse.json({ error: 'Invalid geoType' }, { status: 400 })
  }

  const supabase = createClient()

  const isActive = tab === 'for-sale' || tab === 'for-lease'
  const transactionType = (tab === 'for-sale' || tab === 'sold') ? 'For Sale' : 'For Lease'
  const status = isActive ? 'Active' : 'Closed'
  const accessField = isActive ? 'available_in_idx' : 'available_in_vow'
  const priceField = isActive ? 'list_price' : 'close_price'
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('mls_listings')
    .select(LISTING_SELECT, { count: 'exact' })
    .eq(column, geoId)
    .eq('transaction_type', transactionType)
    .eq('standard_status', status)
    .eq(accessField, true)

  // Property category
  if (propertyCategory === 'condo') {
    query = query.in('property_subtype', CONDO_TYPES)
  } else if (propertyCategory === 'homes') {
    query = query.in('property_subtype', RESIDENTIAL_TYPES)
  }

  // Specific subtypes override category
  if (subtypes) {
    const typeList = subtypes.split(',').map(s => s.trim()).filter(Boolean)
    if (typeList.length > 0) {
      query = query.in('property_subtype', typeList)
    }
  }

  // Price filters
  if (minPrice) query = query.gte(priceField, parseInt(minPrice))
  if (maxPrice) query = query.lte(priceField, parseInt(maxPrice))

  // Bedrooms
  if (beds && beds !== '0') query = query.gte('bedrooms_total', parseInt(beds))

  // Bathrooms
  if (baths && baths !== '0') query = query.gte('bathrooms_total_integer', parseInt(baths))

  // Sqft - uses building_area_total (numeric)
  if (minSqft) query = query.gte('building_area_total', parseInt(minSqft))
  if (maxSqft) query = query.lte('building_area_total', parseInt(maxSqft))

  // Garage (homes)
  if (garage === 'yes') query = query.eq('garage_yn', true)

  // Basement (homes)
  if (basement && basement !== 'any') query = query.ilike('basement', `%${basement}%`)

  // Parking (condos)
  if (parking && parking !== '0') query = query.gte('parking_total', parseInt(parking))

  // Locker (condos)
  if (locker === 'yes') query = query.eq('locker', 'Owned')

  // Sorting
  let orderField = isActive ? 'list_price' : 'close_date'
  let ascending = false
  if (sort === 'price_asc') { orderField = priceField; ascending = true }
  else if (sort === 'price_desc') { orderField = priceField; ascending = false }
  else if (sort === 'newest') { orderField = 'listing_contract_date'; ascending = false }
  else if (sort === 'oldest') { orderField = 'listing_contract_date'; ascending = true }

  const { data: listings, count } = await query
    .order(orderField, { ascending })
    .range(offset, offset + pageSize - 1)

  const processed = (listings || []).map(listing => ({
    ...listing,
    media: (listing.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number || 999) - (b.order_number || 999))
      .slice(0, 1)
  }))

  return NextResponse.json({ listings: processed, total: count || 0 })
}