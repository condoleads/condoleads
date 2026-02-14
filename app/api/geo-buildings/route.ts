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

  const columnMap: Record<string, string> = {
    community: 'community_id',
    municipality: 'community_id', // buildings link to communities, we need to get community IDs first
    area: 'community_id',
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const offset = (page - 1) * pageSize

  try {
    let buildingFilter = ''
    let filterValue = geoId

    if (geoType === 'community') {
      buildingFilter = 'community_id'
    } else if (geoType === 'municipality') {
      // Get all community IDs for this municipality
      const { data: communities } = await supabase
        .from('communities')
        .select('id')
        .eq('municipality_id', geoId)
      const communityIds = (communities || []).map(c => c.id)
      if (communityIds.length === 0) {
        return NextResponse.json({ buildings: [], total: 0 })
      }
      // Use RPC or raw query for IN clause
      const { data, count } = await supabase
        .from('buildings')
        .select('id, building_name, slug, canonical_address, cover_photo_url, gallery_photos, total_units, year_built', { count: 'exact' })
        .in('community_id', communityIds)
        .order('building_name')
        .range(offset, offset + pageSize - 1)

      const buildings = data || []
      const buildingIds = buildings.map(b => b.id)

      // Fetch listing counts for these buildings
      const countsMap = await getListingCounts(supabase, buildingIds)

      const enriched = buildings.map(b => ({
        ...b,
        gallery_photos: b.gallery_photos || [],
        forSale: countsMap[b.id]?.forSale || 0,
        forLease: countsMap[b.id]?.forLease || 0,
      }))

      return NextResponse.json({ buildings: enriched, total: count || 0 })
    } else if (geoType === 'area') {
      // Get all municipality IDs, then community IDs
      const { data: municipalities } = await supabase
        .from('municipalities')
        .select('id')
        .eq('area_id', geoId)
      const muniIds = (municipalities || []).map(m => m.id)
      if (muniIds.length === 0) {
        return NextResponse.json({ buildings: [], total: 0 })
      }
      const { data: communities } = await supabase
        .from('communities')
        .select('id')
        .in('municipality_id', muniIds)
      const communityIds = (communities || []).map(c => c.id)
      if (communityIds.length === 0) {
        return NextResponse.json({ buildings: [], total: 0 })
      }

      const { data, count } = await supabase
        .from('buildings')
        .select('id, building_name, slug, canonical_address, cover_photo_url, gallery_photos, total_units, year_built', { count: 'exact' })
        .in('community_id', communityIds)
        .order('building_name')
        .range(offset, offset + pageSize - 1)

      const buildings = data || []
      const buildingIds = buildings.map(b => b.id)
      const countsMap = await getListingCounts(supabase, buildingIds)

      const enriched = buildings.map(b => ({
        ...b,
        gallery_photos: b.gallery_photos || [],
        forSale: countsMap[b.id]?.forSale || 0,
        forLease: countsMap[b.id]?.forLease || 0,
      }))

      return NextResponse.json({ buildings: enriched, total: count || 0 })
    }

    // Default: community
    const { data, count } = await supabase
      .from('buildings')
      .select('id, building_name, slug, canonical_address, cover_photo_url, gallery_photos, total_units, year_built', { count: 'exact' })
      .eq('community_id', geoId)
      .order('building_name')
      .range(offset, offset + pageSize - 1)

    const buildings = data || []
    const buildingIds = buildings.map(b => b.id)
    const countsMap = await getListingCounts(supabase, buildingIds)

    const enriched = buildings.map(b => ({
      ...b,
      gallery_photos: b.gallery_photos || [],
      forSale: countsMap[b.id]?.forSale || 0,
      forLease: countsMap[b.id]?.forLease || 0,
    }))

    return NextResponse.json({ buildings: enriched, total: count || 0 })
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