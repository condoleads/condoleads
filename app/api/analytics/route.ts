import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const geoType = searchParams.get('geoType')
  const geoId = searchParams.get('geoId')
  const track = searchParams.get('track') || 'condo'
  const periodType = searchParams.get('periodType') || 'rolling_12mo'

  if (!geoType || !geoId) {
    return NextResponse.json({ error: 'geoType and geoId required' }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('geo_analytics')
    .select('*')
    .eq('geo_type', geoType)
    .eq('geo_id', geoId)
    .eq('track', track)
    .eq('period_type', periodType)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
