import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const geoType = searchParams.get('geoType')
  const geoId = searchParams.get('geoId')
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')

  if (!geoType || !geoId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createClient()
  const offset = (page - 1) * pageSize

  if (geoType === 'community') {
    const { data, count } = await supabase
      .from('buildings')
      .select('id, building_name, slug, canonical_address, cover_photo_url, total_units, year_built', { count: 'exact' })
      .eq('community_id', geoId)
      .order('building_name')
      .range(offset, offset + pageSize - 1)
    return NextResponse.json({ buildings: data || [], total: count || 0 })
  }

  if (geoType === 'municipality') {
    const { data: communities } = await supabase
      .from('communities')
      .select('id')
      .eq('municipality_id', geoId)
    const communityIds = (communities || []).map(c => c.id)
    if (communityIds.length === 0) return NextResponse.json({ buildings: [], total: 0 })
    const { data, count } = await supabase
      .from('buildings')
      .select('id, building_name, slug, canonical_address, cover_photo_url, total_units, year_built', { count: 'exact' })
      .in('community_id', communityIds)
      .order('building_name')
      .range(offset, offset + pageSize - 1)
    return NextResponse.json({ buildings: data || [], total: count || 0 })
  }

  if (geoType === 'area') {
    const { data: municipalities } = await supabase
      .from('municipalities')
      .select('id')
      .eq('area_id', geoId)
    const muniIds = (municipalities || []).map(m => m.id)
    if (muniIds.length === 0) return NextResponse.json({ buildings: [], total: 0 })
    const { data: communities } = await supabase
      .from('communities')
      .select('id')
      .in('municipality_id', muniIds)
    const communityIds = (communities || []).map(c => c.id)
    if (communityIds.length === 0) return NextResponse.json({ buildings: [], total: 0 })
    const { data, count } = await supabase
      .from('buildings')
      .select('id, building_name, slug, canonical_address, cover_photo_url, total_units, year_built', { count: 'exact' })
      .in('community_id', communityIds)
      .order('building_name')
      .range(offset, offset + pageSize - 1)
    return NextResponse.json({ buildings: data || [], total: count || 0 })
  }

  return NextResponse.json({ error: 'Invalid geoType' }, { status: 400 })
}