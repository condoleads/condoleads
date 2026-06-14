// app/api/charlie/seller-estimate/route.ts
// Address resolution only - returns buildingId/communityId/municipalityId
// Actual estimation is done client-side via estimateSale/estimateHomeSale server actions
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const body = await req.json()
  const {
    propertyCategory, streetNumber, streetName, city,
    municipalityId: resolvedMunicipalityId,
    // W-CHARLIE-FORM-UX-FIX (2026-06-14): when the SellerForm condo
    // path picks a building from the AreaSearch typeahead, the
    // resolved buildingId comes through here and short-circuits the
    // canonical-address fuzzy resolve below. Legacy callers (no
    // buildingId) continue to hit the fuzzy path — no regression.
    buildingId: providedBuildingId,
  } = body

  try {
    if (propertyCategory === 'condo') {
      let building: any = null

      // ── W-CHARLIE-FORM-UX-FIX (2026-06-14) — DIRECT buildingId lookup ──
      // Skip the fuzzy ILIKE round-trip when the form already supplies a
      // resolved building (typeahead picked from /api/search). Falls
      // through to the fuzzy path below if the provided id doesn't
      // resolve, so a stale/invalid id can't break the flow.
      if (providedBuildingId) {
        const { data: byId } = await supabase
          .from('buildings')
          .select('id, building_name, canonical_address, community_id, cover_photo_url, slug')
          .eq('id', providedBuildingId)
          .maybeSingle()
        if (byId) building = byId
      }

      // Legacy / fallback: fuzzy resolve by canonical_address.
      // streetName is required for this path; legacy SellerForm callers
      // always supply it. Direct-buildingId callers may not — guard.
      if (!building && streetName) {
        const streetFirst = streetName.split(' ')[0]
        const { data: buildings } = await supabase
          .from('buildings')
          .select('id, building_name, canonical_address, community_id, cover_photo_url, slug')
          .ilike('canonical_address', `%${streetNumber}%${streetFirst}%`)
          .limit(5)

        building = buildings?.[0] || null

        // Fallback: street name only + city district
        if (!building) {
          const { data: buildings2 } = await supabase
            .from('buildings')
            .select('id, building_name, canonical_address, community_id, cover_photo_url, slug')
            .ilike('street_name', `%${streetFirst}%`)
            .ilike('city_district', `%${city.trim()}%`)
            .limit(5)
          building = buildings2?.[0] || null
        }
      }

      if (!building) {
        return NextResponse.json({
          success: false,
          error: providedBuildingId
            ? `Building id ${providedBuildingId} not found. Try picking from the dropdown again.`
            : `No building found at ${streetNumber} ${streetName}, ${city}. Please check the address.`,
        })
      }

      // Fetch community analytics
      // W-CHARLIE-FIX GAP 1 (2026-06-14): widen the analytics SELECT to
      // include subtype_breakdown / bedroom_breakdown / price_trend_monthly
      // (used by BuyerOfferBlock for Price by Home Type + trend chart) and
      // stamp `track: 'condo'` into the returned object so the in-chat
      // seller panel's BuyerOfferBlock can derive isCondo correctly. The
      // matcher path (estimateCondoSale server action) is unrelated and
      // independent; this only enlarges what we return for analytics display.
      const { data: analytics } = await supabase
        .from('geo_analytics')
        .select('median_psf, closed_avg_dom_90, sale_to_list_ratio, absorption_rate_pct, active_count, closed_sale_count_90, psf_trend_pct, dom_trend_pct, bedroom_breakdown, subtype_breakdown, price_trend_monthly, insight_seasonal')
        .eq('geo_type', 'community')
        .eq('geo_id', building.community_id)
        .eq('track', 'condo')
        .eq('period_type', 'rolling_12mo')
        .maybeSingle()

      return NextResponse.json({
        success: true,
        path: 'condo',
        buildingId: building.id,
        buildingName: building.building_name,
        buildingSlug: building.slug,
        buildingPhoto: building.cover_photo_url,
        communityId: building.community_id,
        canonicalAddress: building.canonical_address,
        marketAnalytics: analytics ? { ...analytics, track: 'condo' } : analytics,
        analyticsGeoType: 'community',
        analyticsGeoId: building.community_id,
      })
    }

    if (propertyCategory === 'home') {
      // Resolve municipality
      const { data: munis } = await supabase
        .from('municipalities')
        .select('id, name')
        .ilike('name', `%${city.trim()}%`)
        .limit(1)
      const municipality = munis?.[0]

      if (!municipality) {
        return NextResponse.json({
          success: false,
          error: `Municipality not found for "${city}".`,
        })
      }

      // Derive community from street sales
      let communityId: string | null = null
      const { data: streetSales } = await supabase
        .from('mls_listings')
        .select('community_id')
        .eq('municipality_id', municipality.id)
        .ilike('unparsed_address', `%${streetName.split(' ')[0]}%`)
        .eq('standard_status', 'Closed')
        .eq('available_in_vow', true)
        .not('community_id', 'is', null)
        .limit(20)

      if (streetSales?.length) {
        const counts: Record<string, number> = {}
        streetSales.forEach((s: any) => {
          if (s.community_id) counts[s.community_id] = (counts[s.community_id] || 0) + 1
        })
        communityId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
      }

      // Fetch analytics
      // W-CHARLIE-FIX GAP 1 (2026-06-14): widen analytics SELECT (see same-
      // comment in the condo branch above). subtype_breakdown is what
      // BuyerOfferBlock's "Price by Home Type" reads (line 171 of that
      // file); price_trend_monthly feeds the 24-month trend chart.
      // `track: 'homes'` stamped into the response so the BuyerOfferBlock
      // isHomes gate fires (line 66 of BuyerOfferBlock.tsx).
      const geoType = communityId ? 'community' : 'municipality'
      const geoId = communityId || municipality.id
      const { data: analytics } = await supabase
        .from('geo_analytics')
        .select('median_psf, closed_avg_dom_90, sale_to_list_ratio, absorption_rate_pct, active_count, closed_sale_count_90, psf_trend_pct, dom_trend_pct, bedroom_breakdown, subtype_breakdown, price_trend_monthly, insight_seasonal')
        .eq('geo_type', geoType)
        .eq('geo_id', geoId)
        .eq('track', 'homes')
        .eq('period_type', 'rolling_12mo')
        .maybeSingle()

      return NextResponse.json({
        success: true,
        path: 'home',
        municipalityId: municipality.id,
        municipalityName: municipality.name,
        communityId,
        marketAnalytics: analytics ? { ...analytics, track: 'homes' } : analytics,
        analyticsGeoType: geoType,
        analyticsGeoId: geoId,
      })
    }

    return NextResponse.json({ success: false, error: 'Invalid propertyCategory' })
  } catch (err: any) {
    console.error('[seller-estimate resolve]', err)
    return NextResponse.json({ success: false, error: err.message })
  }
}

