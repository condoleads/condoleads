import { supabase } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PropertyPageClient from './PropertyPageClient'

export default async function PropertyPage({ params }: { params: { id: string } }) {
  const supabaseServer = createClient()

  // Fetch listing data
  const { data: listing, error } = await supabase
    .from('mls_listings')
    .select('*')
    .eq('id', params.id)
    .single()
  
  if (error || !listing) {
    notFound()
  }

  // Fetch building data
  const { data: building } = await supabase
    .from('buildings')
    .select('id, building_name, slug, canonical_address')
    .eq('id', listing.building_id)
    .single()

  // Fetch agent
  const { data: agentBuilding } = await supabaseServer
    .from('agent_buildings')
    .select(`
      *,
      agents (
        id,
        full_name,
        email,
        phone,
        profile_photo_url,
        bio,
        brokerage_name,
        title
      )
    `)
    .eq('building_id', listing.building_id)
    .single()

  const agent = agentBuilding?.agents

  // Fetch media
  const { data: allMedia } = await supabase
    .from('media')
    .select('media_url, order_number')
    .eq('listing_id', listing.id)
    .order('order_number')

  const largePhotos = allMedia?.filter(m => m.media_url.includes('1920:1920')) || []

  // Fetch similar listings WITH media variant_type
  const { data: similarListings } = await supabase
    .from('mls_listings')
    .select(`
      *,
      media (
        id,
        media_url,
        order_number,
        variant_type
      )
    `)
    .eq('building_id', listing.building_id)
    .eq('transaction_type', listing.transaction_type)
    .eq('standard_status', 'Closed')
    .eq('bedrooms_total', listing.bedrooms_total)
    .eq('bathrooms_total_integer', listing.bathrooms_total_integer)
    .neq('id', listing.id)
    .limit(4)

  // Fetch unit history
  const { data: unitHistory } = await supabase
    .from('mls_listings')
    .select('id, list_price, close_price, close_date, listing_contract_date, days_on_market, transaction_type, standard_status')
    .eq('building_id', listing.building_id)
    .eq('unit_number', listing.unit_number)
    .eq('standard_status', 'Closed')
    .neq('id', listing.id)
    .order('close_date', { ascending: false })
    .limit(10)

  // Fetch room dimensions
  const { data: rooms } = await supabase
    .from('property_rooms')
    .select('*')
    .eq('listing_id', listing.id)
    .order('order_number')

  // Fetch amenities
  const { data: amenitiesData } = await supabase
    .from('property_amenities')
    .select('*')
    .eq('listing_id', listing.id)

  const amenities = amenitiesData?.filter(a => a.category === 'amenity') || []
  const feeIncludes = amenitiesData?.filter(a => a.category === 'fee_includes') || []

  // Fetch available listings in same building WITH media variant_type
  const { data: availableListings } = await supabase
    .from('mls_listings')
    .select(`
      *,
      media (
        id,
        media_url,
        order_number,
        variant_type
      )
    `)
    .eq('building_id', listing.building_id)
    .eq('transaction_type', listing.transaction_type)
    .eq('standard_status', 'Active')
    .neq('id', listing.id)
    .limit(4)

  const isSale = listing.transaction_type === 'For Sale'
  const isClosed = listing.standard_status === 'Closed'
  const status = isClosed ? 'Closed' : 'Active'

  return (
    <main className="min-h-screen bg-gray-50">
      <PropertyPageClient
        listing={listing}
        largePhotos={largePhotos}
        rooms={rooms || []}
        unitHistory={unitHistory || []}
        amenities={amenities}
        feeIncludes={feeIncludes}
        similarListings={similarListings || []}
        availableListings={availableListings || []}
        isSale={isSale}
        status={status}
        isClosed={isClosed}
        agent={agent}
        building={building}
      />
    </main>
  )
}