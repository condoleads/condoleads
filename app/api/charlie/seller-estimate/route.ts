// app/api/charlie/seller-estimate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { estimateSale } from '@/app/estimator/actions/estimate-sale'
import { estimateHomeSale } from '@/app/estimator/actions/estimate-home-sale'
import { estimateRent } from '@/app/estimator/actions/estimate-rent'
import { estimateHomeRent } from '@/app/estimator/actions/estimate-home-rent'
import { UnitSpecs } from '@/lib/estimator/types'
import { HomeSpecs } from '@/lib/estimator/home-comparable-matcher-sales'

function sqftToRange(sqft: number): string {
  if (sqft < 500) return '0-499'
  if (sqft < 600) return '500-599'
  if (sqft < 700) return '600-699'
  if (sqft < 800) return '700-799'
  if (sqft < 900) return '800-899'
  if (sqft < 1000) return '900-999'
  if (sqft < 1200) return '1000-1199'
  if (sqft < 1400) return '1200-1399'
  if (sqft < 1600) return '1400-1599'
  if (sqft < 1800) return '1600-1799'
  if (sqft < 2000) return '1800-1999'
  return '2000+'
}

async function fetchMediaForComparables(supabase: any, listingKeys: string[]) {
  if (!listingKeys.length) return {}
  const { data: listings } = await supabase
    .from('mls_listings')
    .select('id, listing_key')
    .in('listing_key', listingKeys)
  if (!listings?.length) return {}
  const idMap: Record<string, string> = {}
  listings.forEach((l: any) => { idMap[l.listing_key] = l.id })
  const listingIds = listings.map((l: any) => l.id)
  const { data: media } = await supabase
    .from('media')
    .select('listing_id, media_url')
    .in('listing_id', listingIds)
    .eq('variant_type', 'thumbnail')
    .eq('order_number', 0)
  const mediaMap: Record<string, string> = {}
  media?.forEach((m: any) => {
    const key = Object.keys(idMap).find(k => idMap[k] === m.listing_id)
    if (key) mediaMap[key] = m.media_url
  })
  return mediaMap
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const body = await req.json()
  const {
    intent, propertyCategory,
    streetNumber, streetName, city,
    propertySubtype, bedrooms, bathrooms,
    sqft, parking, locker, frontage, propertyTax,
    timeline, goal
  } = body

  const bedsNum = parseInt(bedrooms) || 2
  const bathsNum = parseInt(bathrooms) || 1
  const sqftNum = sqft ? parseInt(sqft) : null
  const parkingNum = parseInt(parking) || 0
  const frontageNum = frontage ? parseFloat(frontage) : null
  const taxNum = propertyTax ? parseFloat(propertyTax) : undefined

  try {
    // ── CONDO PATH ──
    if (propertyCategory === 'condo') {
      // Step 1: Resolve building
      let building: any = null
      const { data: buildings } = await supabase
        .from('buildings')
        .select('id, building_name, canonical_address, community_id, cover_photo_url')
        .ilike('canonical_address', `%${streetNumber}%${streetName.split(' ')[0]}%`)
        .limit(3)
      if (buildings?.length) {
        building = buildings[0]
      } else {
        // Fallback: street name + city
        const { data: buildings2 } = await supabase
          .from('buildings')
          .select('id, building_name, canonical_address, community_id, cover_photo_url')
          .ilike('street_name', `%${streetName.split(' ')[0]}%`)
          .ilike('city_district', `%${city}%`)
          .limit(3)
        if (buildings2?.length) building = buildings2[0]
      }

      if (!building) {
        return NextResponse.json({
          success: false,
          error: 'Building not found for this address. Try checking the street name or contact the agent for a manual CMA.',
          resolvedAddress: null,
        })
      }

      const specs: UnitSpecs = {
        buildingId: building.id,
        bedrooms: bedsNum,
        bathrooms: bathsNum,
        livingAreaRange: sqftNum ? sqftToRange(sqftNum) : '700-799',
        parking: parkingNum,
        hasLocker: locker !== 'none' && !!locker,
        exactSqft: sqftNum || undefined,
        taxAnnualAmount: taxNum,
      }

      const result = intent === 'lease'
        ? await estimateRent(specs)
        : await estimateSale(specs)

      if (!result.success || !result.data) {
        return NextResponse.json({ success: false, error: result.error || 'Estimate failed' })
      }

      // Fetch correct analytics for this building's community
      const { data: analyticsData } = await supabase
        .from('geo_analytics')
        .select('median_psf, closed_avg_dom_90, sale_to_list_ratio, absorption_rate_pct, active_count, closed_sale_count_90, psf_trend_pct, dom_trend_pct')
        .eq('geo_type', 'community')
        .eq('geo_id', building.community_id)
        .eq('track', 'condo')
        .eq('period_type', 'rolling_12mo')
        .maybeSingle()
            // Fetch media
      const listingKeys = result.data.comparables.map((c: any) => c.listingKey).filter(Boolean)
      const mediaMap = await fetchMediaForComparables(supabase, listingKeys)
      const comparablesWithMedia = result.data.comparables.map((c: any) => ({
        ...c,
        mediaUrl: c.listingKey ? mediaMap[c.listingKey] : null,
      }))

      return NextResponse.json({
        success: true,
        estimate: result.data,
        comparables: comparablesWithMedia,
        buildingName: building.building_name,
        buildingId: building.id,
        buildingPhoto: building.cover_photo_url,
        geoLevel: 'building',
        analyticsGeoType: 'community',
        analyticsGeoId: building.community_id,
        marketAnalytics: analyticsData,
        resolvedAddress: {
          buildingId: building.id,
          communityId: building.community_id,
          address: building.canonical_address,
        }
      })
    }

    // ── HOME PATH ──
    if (propertyCategory === 'home') {
      // Step 1: Resolve municipality
      const { data: munis } = await supabase
        .from('municipalities')
        .select('id, name')
        .ilike('name', `%${city}%`)
        .limit(1)
      const municipality = munis?.[0]
      if (!municipality) {
        return NextResponse.json({
          success: false,
          error: `Municipality not found for "${city}". Try the full city name.`,
        })
      }

      // Step 2: Derive community from street
      let communityId: string | null = null
      const { data: streetSales } = await supabase
        .from('mls_listings')
        .select('community_id')
        .eq('municipality_id', municipality.id)
        .ilike('unparsed_address', `%${streetName}%`)
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

      const specs: HomeSpecs = {
        bedrooms: bedsNum,
        bathrooms: bathsNum,
        propertySubtype: propertySubtype || 'Detached',
        municipalityId: municipality.id,
        communityId,
        exactSqft: sqftNum,
        lotWidth: frontageNum,

      }

      const result = intent === 'lease'
        ? await estimateHomeRent(specs)
        : await estimateHomeSale(specs)

      if (!result.success || !result.data) {
        return NextResponse.json({ success: false, error: result.error || 'Estimate failed' })
      }

      // Fetch media
      const listingKeys = result.data.comparables.map((c: any) => c.listingKey).filter(Boolean)
      const mediaMap = await fetchMediaForComparables(supabase, listingKeys)
      const comparablesWithMedia = result.data.comparables.map((c: any) => ({
        ...c,
        mediaUrl: c.listingKey ? mediaMap[c.listingKey] : null,
      }))

      return NextResponse.json({
        success: true,
        estimate: result.data,
        comparables: comparablesWithMedia,
        municipalityName: municipality.name,
        communityId,
        geoLevel: communityId ? 'community' : 'municipality',
        resolvedAddress: {
          municipalityId: municipality.id,
          communityId,
        }
      })
    }

    return NextResponse.json({ success: false, error: 'Invalid propertyCategory' })

  } catch (err: any) {
    console.error('[seller-estimate]', err)
    return NextResponse.json({ success: false, error: err.message })
  }
}