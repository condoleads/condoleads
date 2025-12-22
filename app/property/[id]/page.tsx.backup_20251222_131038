import { supabase } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import { getAgentForBuilding } from '@/lib/utils/agent-detection'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
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
    .select('id, building_name, slug, canonical_address, development_id')
    .eq('id', listing.building_id)
    .single()

  // Fetch development if building belongs to one
  let development: { id: string; name: string; slug: string } | null = null
  if (building?.development_id) {
    const { data: devData } = await supabase
      .from('developments')
      .select('id, name, slug')
      .eq('id', building.development_id)
      .single()
    development = devData
  }

  // Get agent from subdomain with access verification
  const headersList = headers()
  const host = headersList.get('host') || ''
  const agent = await getAgentForBuilding(host, listing.building_id)

  // If no agent (not assigned to this building), show 404
  if (!agent) {
    notFound()
  }

  // Fetch media
  const { data: allMedia } = await supabase
    .from('media')
    .select('media_url, order_number')
    .eq('listing_id', listing.id)
    .order('order_number')

  const largePhotos = allMedia?.filter(m => m.media_url.includes('1920:1920')) || []

  // Fetch similar SOLD listings with smart fallback
  // Try 1: Exact match (same bed/bath)
  let { data: similarListings } = await supabase
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
    .order('close_date', { ascending: false })
    .limit(8)

  // Try 2: If less than 4, get same bedrooms only
  if (!similarListings || similarListings.length < 4) {
    const { data: moreSimilar } = await supabase
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
      .neq('id', listing.id)
      .order('close_date', { ascending: false })
      .limit(8)
    
    // Merge and deduplicate
    if (moreSimilar) {
      const existingIds = new Set(similarListings?.map(l => l.id) || [])
      const newListings = moreSimilar.filter(l => !existingIds.has(l.id))
      similarListings = [...(similarListings || []), ...newListings]
    }
  }

  // Try 3: If still less than 4, get any sold units in building
  if (!similarListings || similarListings.length < 4) {
    const { data: anySold } = await supabase
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
      .neq('id', listing.id)
      .order('close_date', { ascending: false })
      .limit(8)
    
    // Merge and deduplicate
    if (anySold) {
      const existingIds = new Set(similarListings?.map(l => l.id) || [])
      const newListings = anySold.filter(l => !existingIds.has(l.id))
      similarListings = [...(similarListings || []), ...newListings]
    }
  }

  // Limit to 8 total
  similarListings = similarListings?.slice(0, 8) || []

  // Fetch unit history - ALL statuses for complete transaction history
  const { data: unitHistory } = await supabase
    .from('mls_listings')
    .select('id, list_price, close_price, close_date, listing_contract_date, days_on_market, transaction_type, standard_status, mls_status')
    .eq('building_id', listing.building_id)
    .eq('unit_number', listing.unit_number)
    .neq('id', listing.id)
    .order('close_date', { ascending: false, nullsFirst: false })
    .order('listing_contract_date', { ascending: false })
    .limit(20)

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
    .order('list_price', { ascending: true })
    .limit(8)

  const isSale = listing.transaction_type === 'For Sale'
  const isClosed = listing.standard_status === 'Closed'
  const status = isClosed ? 'Closed' : 'Active'

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__AGENT_DATA__ = ${JSON.stringify({
            full_name: agent.full_name,
            email: agent.email,
            phone: agent.cell_phone,
            brokerage_name: agent.brokerage_name,
            brokerage_address: agent.brokerage_address,
            title: agent.title,
            id: agent.id,
            buildingId: listing.building_id,
            buildingName: building?.building_name || '',
            buildingAddress: building?.canonical_address || '',
            listingId: listing.id,
            listingAddress: listing.unparsed_address || '',
            unitNumber: listing.unit_number || ''
          })};`
        }}
      />
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
        development={development}
        />
    </main>
    </>
  )
}
