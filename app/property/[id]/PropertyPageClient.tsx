'use client'

import { useAuth } from '@/components/auth/AuthContext'
import PropertyGallery from '@/components/property/PropertyGallery'
import PropertyHeader from '@/components/property/PropertyHeader'
import PropertyDetails from '@/components/property/PropertyDetails'
import PropertyDescription from '@/components/property/PropertyDescription'
import PriceHistory from '@/components/property/PriceHistory'
import RoomDimensions from '@/components/property/RoomDimensions'
import UnitHistory from '@/components/property/UnitHistory'
import PropertyAmenities from '@/components/property/PropertyAmenities'
import GatedContent from '@/components/property/GatedContent'
import SimilarListings from '@/components/property/SimilarListings'
import { AgentCard } from '@/components/AgentCard'
import PropertyEstimateCTA from '@/components/property/PropertyEstimateCTA'
import BuildingInfo from '@/components/property/BuildingInfo'
import AgentContactForm from '@/components/property/AgentContactForm'

interface PropertyPageClientProps {
  listing: any
  largePhotos: any[]
  rooms: any[]
  unitHistory: any[]
  amenities: any[]
  feeIncludes: any[]
  similarListings: any[]
  availableListings: any[]
  isSale: boolean
  status: 'Active' | 'Closed'
  isClosed: boolean
  agent?: any
  building?: any
}

export default function PropertyPageClient({
  listing,
  largePhotos,
  rooms,
  unitHistory,
  amenities,
  feeIncludes,
  similarListings,
  availableListings,
  isSale,
  status,
  isClosed,
  agent,
  building
}: PropertyPageClientProps) {
  const { user } = useAuth()
  const shouldGate = isClosed && !user

  return (
    <>
      <PropertyGallery
        photos={largePhotos}
        shouldBlur={shouldGate}
          buildingId={listing.building_id}
        maxPhotos={shouldGate ? 2 : undefined}
      />

      <div className="max-w-7xl mx-auto pb-16">
        <PropertyHeader
          listing={listing}
          status={status}
          isSale={isSale}
          shouldBlur={shouldGate}
          buildingId={listing.building_id}
        />

        <div className="grid lg:grid-cols-3 gap-8 mt-8 px-4">
          {/* LEFT COLUMN - Main Content */}
          <div className="lg:col-span-2 space-y-8">
            <PropertyDescription description={listing.public_remarks} />

            <GatedContent shouldGate={shouldGate} sectionName="Property Details" buildingId={listing.building_id}>
              <PropertyDetails listing={listing} />
            </GatedContent>

            <PropertyAmenities amenities={amenities} feeIncludes={feeIncludes} />

            {rooms && rooms.length > 0 && (
            <GatedContent shouldGate={shouldGate} sectionName="Room Dimensions" buildingId={listing.building_id}>
                <RoomDimensions rooms={rooms} />
              </GatedContent>
            )}

            {unitHistory && unitHistory.length > 0 && (
            <GatedContent shouldGate={shouldGate} sectionName="Transaction History" buildingId={listing.building_id}>
                <UnitHistory
                  history={unitHistory}
                  unitNumber={listing.unit_number || 'N/A'}
                />
              </GatedContent>
            )}

            {isClosed && (
            <GatedContent shouldGate={shouldGate} sectionName="Price History" buildingId={listing.building_id}>
                <PriceHistory
                  listPrice={listing.list_price}
                  closePrice={listing.close_price}
                  listingDate={listing.listing_contract_date}
                  closeDate={listing.close_date}
                  daysOnMarket={listing.days_on_market}
                />
              </GatedContent>
            )}

            <SimilarListings listings={similarListings || []} />

            {availableListings && availableListings.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">
                  Available {isSale ? 'For Sale' : 'For Lease'} in This Building
                </h2>
                <SimilarListings listings={availableListings} />
              </div>
            )}
          </div>

          {/* RIGHT COLUMN - Sticky Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {agent && (
                <>
                  <AgentCard
                    agent={agent}
                    source="property_inquiry"
                    listingId={listing.id}
                    listingAddress={listing.unparsed_address || ''}
                    buildingId={listing.building_id}
                    buildingName={building?.building_name || ''}
                    
                  />
                  
                  <PropertyEstimateCTA
                    listing={{ ...listing, buildings: building }}
                    status={status}
                    isSale={isSale}
                    buildingName={building?.building_name || ''}
                    buildingAddress={building?.canonical_address || ''}
                    agentId={agent.id}
                  />

                  <BuildingInfo
                    buildingName={building?.building_name || 'N/A'}
                    address={building?.canonical_address || listing.unparsed_address || 'N/A'}
                    yearBuilt={listing.year_built}
                    totalUnits={null}
                    parkingType={listing.parking_features}
                    petPolicy={listing.pet_allowed}
                  />

                  <AgentContactForm
                    listing={{ ...listing, buildings: building }}
                    status={status}
                    isSale={isSale}
                    agent={agent}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
