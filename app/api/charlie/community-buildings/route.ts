// app/api/charlie/community-buildings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { communityId, geoType } = await req.json()

  if (!communityId) return NextResponse.json({ success: false, affordable: [], premium: [] })

  try {
    let targetCommunityId = communityId

    // If municipality level, find the most active community within it
    if (geoType === 'municipality') {
      const { data: comm } = await supabase
        .from('communities')
        .select('id')
        .eq('municipality_id', communityId)
        .limit(1)
        .single()
      if (comm) targetCommunityId = comm.id
      else return NextResponse.json({ success: true, affordable: [], premium: [] })
    }

    const { data, error } = await supabase
      .from('geo_analytics')
      .select(`
        median_psf,
        active_count,
        closed_avg_dom_90,
        sale_to_list_ratio,
        buildings!inner(id, building_name, slug, cover_photo_url, community_id)
      `)
      .eq('geo_type', 'building')
      .eq('track', 'condo')
      .eq('period_type', 'rolling_12mo')
      .eq('buildings.community_id', targetCommunityId)
      .not('median_psf', 'is', null)
      .order('median_psf', { ascending: true })
      .limit(20)

    if (error) throw error

    const buildings = (data || []).map((row: any) => ({
      buildingName: row.buildings.building_name,
      slug: row.buildings.slug,
      photo: row.buildings.cover_photo_url,
      medianPsf: parseFloat(row.median_psf),
      activeCount: row.active_count,
      avgDom: row.closed_avg_dom_90 ? parseFloat(row.closed_avg_dom_90) : null,
      saleToList: row.sale_to_list_ratio ? parseFloat(row.sale_to_list_ratio) : null,
    }))

    const sorted = [...buildings].sort((a, b) => a.medianPsf - b.medianPsf)
    const affordable = sorted.slice(0, 5)
    const premium = sorted.slice(-5).reverse()

    return NextResponse.json({ success: true, affordable, premium })
  } catch (err: any) {
    console.error('[community-buildings]', err)
    return NextResponse.json({ success: false, affordable: [], premium: [], error: err.message })
  }
}