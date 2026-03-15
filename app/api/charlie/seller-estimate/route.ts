// app/api/charlie/seller-estimate/route.ts
// Address resolution only - returns buildingId/communityId/municipalityId
// Actual estimation is done client-side via estimateSale/estimateHomeSale server actions
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const body = await req.json()
  const { propertyCategory, streetNumber, streetName, city } = body

  try {
    if (propertyCategory === 'condo') {
      // Try street number + first word of street name
      const streetFirst = streetName.split(' ')[0]
      const { data: buildings } = await supabase
        .from('buildings')
        .select('id, building_name, canonical_address, community_id, cover_photo_url, slug')
        .ilike('canonical_address', `%${streetNumber}%${streetFirst}%`)
        .limit(5)

      let building = buildings?.[0] || null

      // Fallback: street name only + city district
      if (!building) {
        const { data: buildings2 } = await supabase
          .from('buildings')
          .select('id, building_name, canonical_address, community_id, cover_photo_url, slug')
          .ilike('street_name', `%${streetFirst}%`)
          .ilike('city_district', `%${city}%`)
          .limit(5)
        building = buildings2?.[0] || null
      }

      if (!building) {
        return NextResponse.json({
          success: false,
          error: `No building found at ${streetNumber} ${streetName}, ${city}. Please check the address.`,
        })
      }

      // Fetch community analytics
      const { data: analytics } = await supabase
        .from('geo_analytics')
        .select('median_psf, closed_avg_dom_90, sale_to_list_ratio, absorption_rate_pct, active_count, closed_sale_count_90, psf_trend_pct, dom_trend_pct')
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
        marketAnalytics: analytics,
        analyticsGeoType: 'community',
        analyticsGeoId: building.community_id,
      })
    }

    if (propertyCategory === 'home') {
      // Resolve municipality
      const { data: munis } = await supabase
        .from('municipalities')
        .select('id, name')
        .ilike('name', `%${city}%`)
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
      const geoType = communityId ? 'community' : 'municipality'
      const geoId = communityId || municipality.id
      const { data: analytics } = await supabase
        .from('geo_analytics')
        .select('median_psf, closed_avg_dom_90, sale_to_list_ratio, absorption_rate_pct, active_count, closed_sale_count_90, psf_trend_pct, dom_trend_pct')
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
        marketAnalytics: analytics,
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