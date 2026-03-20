// app/api/charlie/community-buildings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { communityId, geoType } = await req.json()
  if (!communityId) return NextResponse.json({ success: false, affordable: [], premium: [] })

  try {
    let targetCommunityId = communityId

    // If municipality level, find first community within it
    if (geoType === 'municipality') {
      const { data: comm } = await supabase
        .from('communities')
        .select('id')
        .eq('municipality_id', communityId)
        .limit(1)
        .single()
      if (!comm) return NextResponse.json({ success: true, affordable: [], premium: [] })
      targetCommunityId = comm.id
    }

    // Step 1: Get buildings in this community
    const { data: buildings, error: bErr } = await supabase
      .from('buildings')
      .select('id, building_name, slug, cover_photo_url')
      .eq('community_id', targetCommunityId)
      .limit(50)

    if (bErr || !buildings?.length) return NextResponse.json({ success: true, affordable: [], premium: [] })
    console.log('[community-buildings] found buildings:', buildings.length, 'communityId:', targetCommunityId)

    const buildingIds = buildings.map((b: any) => b.id)

    // Step 2: Try geo_analytics first (fast path)
    const { data: analytics, error: aErr } = await supabase
      .from('geo_analytics')
      .select('geo_id, median_psf, active_count, closed_avg_dom_90, sale_to_list_ratio')
      .eq('geo_type', 'building')
      .eq('track', 'condo')
      .eq('period_type', 'rolling_12mo')
      .in('geo_id', buildingIds)
      .not('median_psf', 'is', null)

    console.log('[community-buildings] analytics:', analytics?.length, 'aErr:', aErr?.message)

    // Step 3: If analytics has good coverage (≥5 buildings), use it directly
    if (!aErr && analytics?.length >= 5) {
      const buildingMap = new Map(buildings.map((b: any) => [b.id, b]))
      const enriched = analytics.map((a: any) => {
        const b = buildingMap.get(a.geo_id)
        if (!b) return null
        return {
          buildingName: b.building_name,
          slug: b.slug,
          photo: b.cover_photo_url,
          medianPsf: parseFloat(a.median_psf),
          activeCount: a.active_count || 0,
          avgDom: a.closed_avg_dom_90 ? parseFloat(a.closed_avg_dom_90) : null,
          saleToList: a.sale_to_list_ratio ? parseFloat(a.sale_to_list_ratio) : null,
        }
      }).filter(Boolean)

      return buildSplit(enriched)
    }

    // Step 4: Fallback — compute PSF live from mls_listings
    // Triggered when analytics has <5 buildings (sparse Stage 8 coverage)
    console.log('[community-buildings] falling back to live mls_listings query, analytics had:', analytics?.length ?? 0)

    const { data: listings, error: lErr } = await supabase
      .from('mls_listings')
      .select('building_id, close_price, calculated_sqft, list_price, standard_status, days_on_market')
      .in('building_id', buildingIds)
      .eq('available_in_vow', true)
      .eq('property_type', 'Residential Condo & Other')
      .not('calculated_sqft', 'is', null)
      .gt('calculated_sqft', 0)
      .limit(10000)

    if (lErr || !listings?.length) {
      console.log('[community-buildings] live fallback also empty:', lErr?.message)
      return NextResponse.json({ success: true, affordable: [], premium: [] })
    }

    console.log('[community-buildings] live listings:', listings.length)

    // Group by building_id and compute per-building stats
    const byBuilding = new Map<string, { psfs: number[]; doms: number[]; activeCount: number }>()

    for (const l of listings) {
      if (!l.building_id) continue
      if (!byBuilding.has(l.building_id)) {
        byBuilding.set(l.building_id, { psfs: [], doms: [], activeCount: 0 })
      }
      const entry = byBuilding.get(l.building_id)!

      // PSF from closed sales
      if (l.standard_status === 'Closed' && l.close_price && l.calculated_sqft) {
        const psf = l.close_price / l.calculated_sqft
        if (psf > 100 && psf < 5000) entry.psfs.push(psf) // sanity bounds
      }

      // Active count
      if (l.standard_status === 'Active') {
        entry.activeCount++
        if (l.days_on_market != null) entry.doms.push(l.days_on_market)
      }
    }

    const buildingMap = new Map(buildings.map((b: any) => [b.id, b]))
    const enriched: any[] = []

    for (const [buildingId, stats] of byBuilding.entries()) {
      if (stats.psfs.length < 3) continue // need at least 3 sales for a reliable median
      const b = buildingMap.get(buildingId)
      if (!b) continue

      const sorted = [...stats.psfs].sort((a, z) => a - z)
      const mid = Math.floor(sorted.length / 2)
      const medianPsf = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid]

      const avgDom = stats.doms.length
        ? stats.doms.reduce((s, v) => s + v, 0) / stats.doms.length
        : null

      enriched.push({
        buildingName: b.building_name,
        slug: b.slug,
        photo: b.cover_photo_url,
        medianPsf: Math.round(medianPsf),
        activeCount: stats.activeCount,
        avgDom: avgDom ? Math.round(avgDom) : null,
        saleToList: null, // not available from live query
      })
    }

    console.log('[community-buildings] live enriched:', enriched.length)
    return buildSplit(enriched)

  } catch (err: any) {
    console.error('[community-buildings]', err)
    return NextResponse.json({ success: false, affordable: [], premium: [], error: err.message })
  }
}

function buildSplit(enriched: any[]) {
  if (!enriched.length) return NextResponse.json({ success: true, affordable: [], premium: [] })
  const sorted = [...enriched].sort((a, b) => a.medianPsf - b.medianPsf)
  if (sorted.length <= 2) {
    // Not enough to split meaningfully — put all in affordable, none in premium
    return NextResponse.json({ success: true, affordable: sorted, premium: [] })
  }
  const mid = Math.ceil(sorted.length / 2)
  const affordable = sorted.slice(0, Math.min(5, mid))
  const premiumCount = Math.min(5, sorted.length - mid)
  const premium = sorted.slice(-premiumCount).reverse()
  return NextResponse.json({ success: true, affordable, premium })
}