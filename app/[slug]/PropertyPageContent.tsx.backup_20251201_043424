import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import { parsePropertySlug } from '@/lib/utils/slugs'
import PropertyPageClient from '../property/[id]/PropertyPageClient'
import PropertyEstimateCTA from '@/components/property/PropertyEstimateCTA'
import AgentContactForm from '@/components/property/AgentContactForm'
import BuildingInfo from '@/components/property/BuildingInfo'
import { AgentCard } from '@/components/AgentCard'

export async function PropertyPageContent({ slug }: { slug: string }) {
  // Parse slug to get MLS number
  const { mlsNumber } = parsePropertySlug(slug)
  
  if (!mlsNumber) {
    notFound()
  }

  // Use service role client for data fetching
  const supabaseServer = createClient()

  // Fetch listing by MLS number
  const { data: listing, error } = await supabase
    .from('mls_listings')
    .select('*')
    .or(`listing_key.eq.${mlsNumber},listing_id.eq.${mlsNumber}`)
    .single()
  
  if (error || !listing) {
    notFound()
  }

  // Fetch building data
  const { data: building } = await supabase
    .from('buildings')
    .select('id, name, slug, address')
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
        bio
      )
    `)
    .eq('building_id', listing.building_id)
    .single()

  const agent = agentBuilding?.agents

  // Combine data
  const listingWithBuilding = {
    ...listing,
    buildings: building
  }

  // Fetch media
  const { data: allMedia } = await supabase
    .from('media')
    .select('media_url, order_number')
    .eq('listing_id', listing.id)
    .order('order_number')

  const largePhotos = allMedia?.filter(m => m.media_url.includes('1920:1920')) || []

  // Fetch similar listings
  const { data: similarListings } = await supabase
    .from('mls_listings')
    .select(`
      *,
      media (
        id,
        media_url,
        variant_type,
        order_number,
        preferred_photo_yn
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

  // Extract amenities
  const amenities = listing.association_amenities || []
  const feeIncludes = listing.association_fee_includes || []

  // Fetch available listings
  const targetTransactionType = listing.transaction_type
  const { data: availableListings } = await supabase
    .from('mls_listings')
    .select(`
      *,
      media (
        id,
        media_url,
        variant_type,
        order_number,
        preferred_photo_yn
      )
    `)
    .eq('building_id', listing.building_id)
    .eq('transaction_type', targetTransactionType)
    .eq('standard_status', 'Active')
    .neq('id', listing.id)
    .order('list_price', { ascending: false })
    .limit(8)

  const isSale = listing.transaction_type === 'For Sale'
  const status = listing.standard_status === 'Closed' ? 'Closed' : 'Active'
  const isClosed = listing.standard_status === 'Closed'

  return (
    <main className="min-h-screen bg-slate-50">
      <PropertyPageClient
        listing={listingWithBuilding}
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
      />

      {/* Server-rendered sidebar */}
      <div className="max-w-7xl mx-auto pb-16">
        <div className="grid lg:grid-cols-3 gap-8 mt-8 px-4">
          <div className="lg:col-span-2"></div>
          <div className="lg:col-span-1 space-y-6">
            <div className="sticky top-24 space-y-6">
              {agent && (
                <AgentCard
                  agent={agent}
                  source="property_inquiry"
                  listingId={listing.id}
                  listingAddress={listing.unparsed_address || ''}
                  buildingId={listing.building_id}
                  buildingName={building?.name || ''}
                />
              )}

              <PropertyEstimateCTA
                listing={listingWithBuilding}
                status={status}
                isSale={isSale}
                buildingName={building?.name || ''}
                agentId={agent?.id || ''}
              />
            </div>

            <BuildingInfo
              buildingName={building?.name || 'N/A'}
              address={building?.address || listing.unparsed_address || 'N/A'}
              yearBuilt={listing.year_built}
              totalUnits={null}
              parkingType={listing.parking_features}
              petPolicy={listing.pet_allowed}
            />

            {agent && (
              <AgentContactForm
                listing={listingWithBuilding}
                status={status}
                isSale={isSale}
                agent={agent}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
