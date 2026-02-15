import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const address = searchParams.get('address')
  const excludeId = searchParams.get('excludeId')

  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }

  const supabase = await createClient()

  let query = supabase
    .from('mls_listings')
    .select('id, list_price, close_price, close_date, listing_contract_date, days_on_market, transaction_type, standard_status, mls_status, listing_key, property_subtype')
    .eq('unparsed_address', address)
    .order('close_date', { ascending: false, nullsFirst: false })
    .order('listing_contract_date', { ascending: false })
    .limit(20)

  if (excludeId) {
    query = query.neq('id', excludeId)
  }

  const { data: history, error } = await query

  if (error) {
    console.error('Error fetching address history:', error)
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }

  return NextResponse.json({ history: history || [] })
}