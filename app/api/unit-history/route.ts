import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const buildingId = searchParams.get('buildingId')
  const unitNumber = searchParams.get('unitNumber')
  const excludeId = searchParams.get('excludeId')

  if (!buildingId || !unitNumber) {
    return NextResponse.json({ error: 'Missing buildingId or unitNumber' }, { status: 400 })
  }

  const supabase = await createClient()

  let query = supabase
    .from('mls_listings')
    .select('id, list_price, close_price, close_date, listing_contract_date, days_on_market, transaction_type, standard_status, mls_status')
    .eq('building_id', buildingId)
    .eq('unit_number', unitNumber)
    .order('close_date', { ascending: false, nullsFirst: false })
    .order('listing_contract_date', { ascending: false })
    .limit(20)

  if (excludeId) {
    query = query.neq('id', excludeId)
  }

  const { data: history, error } = await query

  if (error) {
    console.error('Error fetching unit history:', error)
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }

  return NextResponse.json({ history: history || [] })
}