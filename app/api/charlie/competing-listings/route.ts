// app/api/charlie/competing-listings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { findActiveCompetition, type HomeSpecs } from '@/lib/estimator/home-comparable-matcher-sales'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const body = await req.json()
  const {
    path,
    communityId,
    municipalityId,
    bedrooms,
    bathrooms,
    livingAreaRange,
    propertySubtype,
    // h3 refinement — SF funnels need these for same-as-sold matching
    architecturalStyle,
    approximateAge,
  } = body

  try {
    let listings: any[] = []

    if (path === 'condo' && communityId) {
      // Condo path unchanged — separate matcher, bed+LAR exact at community.
      let query = supabase
        .from('mls_listings')
        .select('id, listing_key, list_price, unparsed_address, bedrooms_total, bathrooms_total_integer, living_area_range, days_on_market, approximate_age, association_fee, property_subtype, unit_number')
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .eq('community_id', communityId)
        .eq('bedrooms_total', bedrooms)
        .gt('list_price', 100000)
        .order('list_price', { ascending: true })
        .limit(10)

      if (livingAreaRange) {
        query = query.eq('living_area_range', livingAreaRange)
      }

      const { data, error } = await query
      if (error) throw error
      const rows = data || []
      // Condo path: attach media inline (no shared helper yet).
      if (rows.length > 0) {
        const ids = rows.map((l: any) => l.id)
        const { data: media } = await supabase
          .from('media').select('listing_id, media_url').in('listing_id', ids)
          .eq('variant_type', 'thumbnail').eq('order_number', 0)
        const mediaMap: Record<string, string> = {}
        media?.forEach((m: any) => { mediaMap[m.listing_id] = m.media_url })
        listings = rows.map((l: any) => ({ ...l, mediaUrl: mediaMap[l.id] || null }))
      }
    }

    if (path === 'home') {
      // h3 refinement: delegate to findActiveCompetition — same matching
      // criteria as the SOLD-comp pipeline, branched per subject type.
      // Plex: same-subtype + LAR-adjacent + community→muni→area.
      // SF:   getCompatibleSubtypes + notAsIs + applyFunnel/relaxed/last-resort
      //       + community→muni. Both attach media thumbnails.
      const specs: HomeSpecs = {
        bedrooms: bedrooms || 0,
        bathrooms: bathrooms || 0,
        propertySubtype: propertySubtype?.trim() || 'Detached',
        communityId: communityId || null,
        municipalityId: municipalityId || null,
        livingAreaRange: livingAreaRange || '',
        architecturalStyle: architecturalStyle || null,
        approximateAge: approximateAge || null,
      }
      listings = await findActiveCompetition(specs)
    }

    return NextResponse.json({ success: true, listings })
  } catch (err: any) {
    console.error('[competing-listings]', err)
    return NextResponse.json({ success: false, error: err.message, listings: [] })
  }
}
