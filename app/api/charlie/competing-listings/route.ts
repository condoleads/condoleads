// app/api/charlie/competing-listings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MULTI_UNIT_SUBTYPES } from '@/lib/estimator/home-comparable-matcher-sales'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const body = await req.json()
  const { path, communityId, municipalityId, bedrooms, livingAreaRange, propertySubtype } = body

  try {
    let listings: any[] = []

    if (path === 'condo' && communityId) {
      let query = supabase
        .from('mls_listings')
        .select('id, listing_key, list_price, unparsed_address, bedrooms_total, bathrooms_total_integer, living_area_range, days_on_market, approximate_age, association_fee, property_subtype, unit_number')
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .eq('community_id', communityId)
        .eq('bedrooms_total', bedrooms)
        .gt('list_price', 100000)  // h2 F-PLEX-TILE-JUNK-PRICE: exclude $1 call-for-price placeholders
        .order('list_price', { ascending: true })
        .limit(10)

      if (livingAreaRange) {
        query = query.eq('living_area_range', livingAreaRange)
      }

      const { data, error } = await query
      if (error) throw error
      listings = data || []
    }

    if (path === 'home' && municipalityId) {
      // For homes: match on bedrooms + subtype only — livingAreaRange too restrictive
      const isMultiUnit = !!propertySubtype && MULTI_UNIT_SUBTYPES.includes(propertySubtype)

      let query = supabase
        .from('mls_listings')
        .select('id, listing_key, list_price, unparsed_address, bedrooms_total, bathrooms_total_integer, living_area_range, days_on_market, approximate_age, property_subtype, frontage_length, lot_size_area, net_operating_income, gross_revenue')
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .eq('municipality_id', municipalityId)
        .gt('list_price', 100000)  // h2 F-PLEX-TILE-JUNK-PRICE: exclude $1 call-for-price placeholders
        .order('list_price', { ascending: true })
        .limit(10)

      // g2: for multi-unit subjects, widen subtype to class (Duplex/Triplex/
      // Fourplex/Multiplex) for orange-to-orange containment; single-family
      // subjects preserve exact-subtype behavior unchanged.
      if (propertySubtype) {
        if (isMultiUnit) {
          query = query.in('property_subtype', MULTI_UNIT_SUBTYPES)
        } else {
          query = query.eq('property_subtype', propertySubtype)
        }
      }

      // g2: bedrooms_total exact-match for SINGLE-FAMILY only. On plex,
      // bedrooms_total is a cross-unit SUM (wrong axis for comparability) —
      // gating competition on it reintroduces the single-family-scoring
      // error that g1's gate switch just removed.
      if (!isMultiUnit) {
        query = query.eq('bedrooms_total', bedrooms)
      }

      const { data, error } = await query
      if (error) throw error
      listings = data || []
    }

    if (!listings.length) {
      return NextResponse.json({ success: true, listings: [] })
    }

    // Fetch thumbnail media
    const listingIds = listings.map((l: any) => l.id)
    const { data: media } = await supabase
      .from('media')
      .select('listing_id, media_url')
      .in('listing_id', listingIds)
      .eq('variant_type', 'thumbnail')
      .eq('order_number', 0)

    const mediaMap: Record<string, string> = {}
    media?.forEach((m: any) => { mediaMap[m.listing_id] = m.media_url })

    const enriched = listings.map((l: any) => ({
      ...l,
      mediaUrl: mediaMap[l.id] || null,
    }))

    return NextResponse.json({ success: true, listings: enriched })
  } catch (err: any) {
    console.error('[competing-listings]', err)
    return NextResponse.json({ success: false, error: err.message, listings: [] })
  }
}