// app/api/charlie/competing-listings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const body = await req.json()
  const { path, communityId, municipalityId, bedrooms, livingAreaRange, propertySubtype } = body

  try {
    let listings: any[] = []

    if (path === 'condo' && communityId) {
      let query = supabase
        .from('mls_listings')
        .select('id, listing_key, list_price, unparsed_address, bedrooms_total, bathrooms_total_integer, living_area_range, days_on_market, list_date, approximate_age, year_built, association_fee, property_subtype, unit_number')
        .eq('standard_status', 'Active')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .eq('community_id', communityId)
        .eq('bedrooms_total', bedrooms)
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
      let query = supabase
        .from('mls_listings')
        .select('id, listing_key, list_price, unparsed_address, bedrooms_total, bathrooms_total_integer, living_area_range, days_on_market, list_date, approximate_age, year_built, property_subtype, frontage_length, lot_size_area')
        .eq('standard_status', 'Active')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .eq('municipality_id', municipalityId)
        .eq('bedrooms_total', bedrooms)
        .order('list_price', { ascending: true })
        .limit(10)

      if (propertySubtype) {
        query = query.eq('property_subtype', propertySubtype)
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