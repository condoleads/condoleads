import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const geoType = searchParams.get('geoType')
  const geoId = searchParams.get('geoId')
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '12')

  if (!geoType || !geoId) {
    return NextResponse.json({ error: 'Missing geoType or geoId' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const offset = (page - 1) * pageSize

  try {
    // Step 1: Resolve community IDs based on geo type
    let communityIds: string[] = []

    if (geoType === 'community') {
      communityIds = [geoId]
    } else if (geoType === 'municipality') {
      const { data: communities } = await supabase
        .from('communities')
        .select('id')
        .eq('municipality_id', geoId)
      communityIds = (communities || []).map(c => c.id)
    } else if (geoType === 'area') {
      const { data: municipalities } = await supabase
        .from('municipalities')
        .select('id')
        .eq('area_id', geoId)
      const muniIds = (municipalities || []).map(m => m.id)
      if (muniIds.length > 0) {
        const { data: communities } = await supabase
          .from('communities')
          .select('id')
          .in('municipality_id', muniIds)
        communityIds = (communities || []).map(c => c.id)
      }
    }

    if (communityIds.length === 0) {
      return NextResponse.json({ buildings: [], total: 0 })
    }

    // Step 2: Get buildings ordered by active listing count (RPC)
    const { data: buildings, error: buildingsError } = await supabase
      .rpc('get_geo_buildings', {
        p_community_ids: communityIds,
        p_offset: offset,
        p_limit: pageSize
      })

    if (buildingsError) {
      console.error('get_geo_buildings error:', buildingsError)
      return NextResponse.json({ error: 'Failed to fetch buildings' }, { status: 500 })
    }

    // Step 3: Get total count
    const { data: countData, error: countError } = await supabase
      .rpc('get_geo_buildings_count', { p_community_ids: communityIds })

    if (countError) {
      console.error('get_geo_buildings_count error:', countError)
    }

    const total = countData || 0

    // Step 4: Get sale/lease breakdown for these buildings
    const buildingIds = (buildings || []).map((b: any) => b.id)
    const countsMap = await getListingCounts(supabase, buildingIds)

    const enriched = (buildings || []).map((b: any) => ({
      ...b,
      gallery_photos: b.gallery_photos || [],
      forSale: countsMap[b.id]?.forSale || 0,
      forLease: countsMap[b.id]?.forLease || 0,
    }))

    return NextResponse.json({ buildings: enriched, total })
  } catch (error) {
    console.error('geo-buildings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function getListingCounts(supabase: any, buildingIds: string[]) {
  if (buildingIds.length === 0) return {}

  const { data: listings } = await supabase
    .from('mls_listings')
    .select('building_id, transaction_type')
    .in('building_id', buildingIds)
    .eq('standard_status', 'Active')
    .eq('available_in_idx', true)

  const counts: Record<string, { forSale: number; forLease: number }> = {}
  for (const l of (listings || [])) {
    if (!counts[l.building_id]) counts[l.building_id] = { forSale: 0, forLease: 0 }
    if (l.transaction_type === 'For Sale') counts[l.building_id].forSale++
    else if (l.transaction_type === 'For Lease') counts[l.building_id].forLease++
  }
  return counts
}
