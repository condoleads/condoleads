import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const parentGeoType = searchParams.get('parentGeoType')
  const parentGeoId = searchParams.get('parentGeoId')
  const rankingType = searchParams.get('rankingType')
  const track = searchParams.get('track') || 'condo'

  if (!parentGeoType || !parentGeoId) {
    return NextResponse.json({ error: 'parentGeoType and parentGeoId required' }, { status: 400 })
  }

  const supabase = createClient()
  let query = supabase
    .from('geo_rankings')
    .select('*')
    .eq('parent_geo_type', parentGeoType)
    .eq('parent_geo_id', parentGeoId)
    .eq('track', track)

  if (rankingType) query = query.eq('ranking_type', rankingType)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
