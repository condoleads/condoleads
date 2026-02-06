import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const agentId = url.searchParams.get('agentId')

    if (!agentId) {
      return NextResponse.json({ items: [] })
    }

    // Get buildings for this agent
    const { data: agentBuildings } = await supabase
      .from('agent_buildings')
      .select('buildings(id)')
      .eq('agent_id', agentId)

    const buildingIds = (agentBuildings || [])
      .map((ab: any) => ab.buildings?.id)
      .filter(Boolean)

    if (buildingIds.length === 0) {
      return NextResponse.json({ items: [] })
    }

    // Get recent active IDX-safe listings for these buildings
    const { data: listings } = await supabase
      .from('mls_listings')
      .select(`
        unit_number,
        list_price,
        transaction_type,
        bedrooms_total,
        days_on_market,
        modification_timestamp,
        building_id,
        buildings!inner(building_name, slug)
      `)
      .in('building_id', buildingIds)
      .eq('standard_status', 'Active')
      .eq('available_in_idx', true)
      .gt('list_price', 0)
      .order('modification_timestamp', { ascending: false })
      .limit(20)

    const items = (listings || []).map((l: any) => ({
      unitNumber: l.unit_number,
      price: l.list_price,
      type: l.transaction_type,
      bedrooms: l.bedrooms_total,
      dom: l.days_on_market,
      buildingName: l.buildings?.building_name,
      slug: l.buildings?.slug,
    }))

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Market ticker error:', error)
    return NextResponse.json({ items: [] })
  }
}