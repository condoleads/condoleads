import { supabase } from '@/lib/supabase/client'
import { createClient, createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PropertyGallery from '@/components/property/PropertyGallery'
import PropertyHeader from '@/components/property/PropertyHeader'
import PropertyDetails from '@/components/property/PropertyDetails'
import PropertyDescription from '@/components/property/PropertyDescription'
import PriceHistory from '@/components/property/PriceHistory'
import BuildingInfo from '@/components/property/BuildingInfo'
import RoomDimensions from '@/components/property/RoomDimensions'
import UnitHistory from '@/components/property/UnitHistory'
import PropertyAmenities from '@/components/property/PropertyAmenities'
import PropertyEstimateCTA from '@/components/property/PropertyEstimateCTA'
import AgentContactForm from '@/components/property/AgentContactForm'
import SimilarListings from '@/components/property/SimilarListings'
import ShareButtons from '@/components/property/ShareButtons'
import { AgentCard } from '@/components/AgentCard'
import GatedContent from '@/components/property/GatedContent'

export default async function PropertyPage({ params }: { params: { id: string } }) {
  // Check authentication status using session-aware client
  const supabaseSession = await createServerClient()
  const { data: { user } } = await supabaseSession.auth.getUser()
  const isAuthenticated = !!user

  // Use service role client for data fetching
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

  // Fetch building data separately
  const { data: building } = await supabase
    .from('buildings')
    .select('id, name, slug, address')
    .eq('id', listing.building_id)
    .single()

  // Fetch the agent assigned to this building
  const { data: agentBuilding } = await supabaseServer
    .from('agent_buildings')
    .select('agents (*)')
    .eq('building_id', listing.building_id)
    .single()

  const agent = agentBuilding?.agents

  // Combine the data
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
  const amenities = listing.common_interest_elements || []
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
  
  // Determine if content should be gated
  const shouldGate = isClosed && !isAuthenticated

  return (
    <main className="min-h-screen bg-slate-50">
      <PropertyGallery 
        photos={largePhotos} 
        shouldBlur={shouldGate}
        maxPhotos={shouldGate ? 2 : undefined}
      />

      <div className="max-w-7xl mx-auto pb-16">
        <PropertyHeader
          listing={listingWithBuilding}
          status={status}
          isSale={isSale}
          shouldBlur={shouldGate}
        />

        <div className="grid lg:grid-cols-3 gap-8 mt-8 px-4">
          {/* MAIN CONTENT - Left side */}
          <div className="lg:col-span-2 space-y-8">
            {/* Property Description */}
            <PropertyDescription description={listing.public_remarks} />

            {/* Property Details */}
            <GatedContent shouldGate={shouldGate} sectionName="Property Details">
              <PropertyDetails listing={listingWithBuilding} />
            </GatedContent>

            {/* Amenities */}
            <PropertyAmenities amenities={amenities} feeIncludes={feeIncludes} />

            {/* Room Dimensions */}
            {rooms && rooms.length > 0 && (
              <GatedContent shouldGate={shouldGate} sectionName="Room Dimensions">
                <RoomDimensions rooms={rooms} />
              </GatedContent>
            )}

            {/* CONTACT FORM */}
            {agent && (
              <AgentContactForm
                listing={listingWithBuilding}
                status={status}
                isSale={isSale}
                agent={agent}
              />
            )}

            {/* Unit History */}
            {unitHistory && unitHistory.length > 0 && (
              <GatedContent shouldGate={shouldGate} sectionName="Transaction History">
                <UnitHistory
                  history={unitHistory}
                  unitNumber={listing.unit_number || 'N/A'}
                />
              </GatedContent>
            )}

            {/* Price History */}
            {isClosed && (
              <GatedContent shouldGate={shouldGate} sectionName="Price History">
                <PriceHistory
                  listPrice={listing.list_price}
                  closePrice={listing.close_price}
                  listingDate={listing.listing_contract_date}
                  closeDate={listing.close_date}
                  daysOnMarket={listing.days_on_market}
                />
              </GatedContent>
            )}

            {/* Similar Units */}
            <SimilarListings listings={similarListings || []} />

            {/* Available Units */}
            {availableListings && availableListings.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">
                  Available {isSale ? 'For Sale' : 'For Lease'} in This Building
                </h2>
                <SimilarListings listings={availableListings} />
              </div>
            )}
          </div>

          {/* SIDEBAR - Right side */}
          <div className="lg:col-span-1 space-y-6">
            {/* Agent Card + Estimate */}
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

            {/* Building Information */}
            <BuildingInfo
              buildingName={building?.name || 'N/A'}
              address={building?.address || listing.unparsed_address || 'N/A'}
              yearBuilt={listing.year_built}
              totalUnits={null}
              parkingType={listing.parking_features}
              petPolicy={listing.pet_allowed}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
