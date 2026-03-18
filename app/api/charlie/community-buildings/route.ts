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

    const buildingIds = buildings.map((b: any) => b.id)

    // Step 2: Get analytics for these buildings
    const { data: analytics, error: aErr } = await supabase
      .from('geo_analytics')
      .select('geo_id, median_psf, active_count, closed_avg_dom_90, sale_to_list_ratio')
      .eq('geo_type', 'building')
      .eq('track', 'condo')
      .eq('period_type', 'rolling_12mo')
      .in('geo_id', buildingIds)
      .not('median_psf', 'is', null)

    if (aErr || !analytics?.length) return NextResponse.json({ success: true, affordable: [], premium: [] })

    // Step 3: Join
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

    const sorted = enriched.sort((a: any, b: any) => a.medianPsf - b.medianPsf)
    const affordable = sorted.slice(0, 5)
    const premium = sorted.slice(-5).reverse()

    return NextResponse.json({ success: true, affordable, premium })
  } catch (err: any) {
    console.error('[community-buildings]', err)
    return NextResponse.json({ success: false, affordable: [], premium: [], error: err.message })
  }
}