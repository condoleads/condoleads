import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const buildingId = searchParams.get('buildingId')
  const type = searchParams.get('type') // 'sold' or 'leased'

  if (!buildingId || !type) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createClient()
  const transactionType = type === 'sold' ? 'For Sale' : 'For Lease'

  const { data: listings } = await supabase
    .from('mls_listings')
    .select('id, building_id, listing_id, listing_key, standard_status, transaction_type, list_price, close_price, close_date, unit_number, unparsed_address, bedrooms_total, bathrooms_total_integer, property_type, living_area_range, square_foot_source, parking_total, locker, association_fee, tax_annual_amount, days_on_market, listing_contract_date, building_area_total, media (id, media_url, variant_type, order_number, preferred_photo_yn)')
    .eq('building_id', buildingId)
    .eq('transaction_type', transactionType)
    .eq('standard_status', 'Closed')
    .order('list_price', { ascending: false })

  const processed = (listings || []).map(listing => ({
    ...listing,
    media: (listing.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number || 999) - (b.order_number || 999))
      .slice(0, 1)
  }))

  return NextResponse.json({ listings: processed })
}