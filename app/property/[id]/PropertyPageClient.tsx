'use client'

import { useState } from 'react'
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
import PropertyStickyBar from '@/components/property/PropertyStickyBar'
import OfferInquiryModal from '@/components/property/OfferInquiryModal'
import ExitIntentPopup from '@/components/property/ExitIntentPopup'
import EstimatorBuyerModal from '@/app/estimator/components/EstimatorBuyerModal'
import Breadcrumb from '@/components/Breadcrumb'
import PropertySEO from '@/components/property/PropertySEO'

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
  development?: { id: string; name: string; slug: string } | null
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
  building,
  development
}: PropertyPageClientProps) {
  const { user } = useAuth()
  const shouldGate = isClosed && !user
  
  // Modal state for sticky bar CTAs
  const [showEstimatorModal, setShowEstimatorModal] = useState(false)
  const [showOfferModal, setShowOfferModal] = useState(false)

  return (
    <>
      <PropertyGallery
        photos={largePhotos}
        shouldBlur={shouldGate}
          buildingId={listing.building_id}
        maxPhotos={shouldGate ? 2 : undefined}
      />

      <div className="max-w-7xl mx-auto pb-16">
          <div className="px-4">
            <Breadcrumb items={[
              ...(development ? [{ label: development.name, href: `/${development.slug}` }] : []),
              ...(building ? [{ label: building.building_name, href: `/${building.slug}` }] : []),
              { label: `Unit ${listing.unit_number || 'N/A'}` }
            ]} />
          </div>
          <PropertyHeader
          listing={listing}
          status={status}
          isSale={isSale}
          shouldBlur={shouldGate}
          buildingId={listing.building_id}
          onEstimateClick={() => setShowEstimatorModal(true)}
          onOfferClick={() => setShowOfferModal(true)}
        />

        <div className="grid lg:grid-cols-3 gap-8 mt-8 px-4">
          {/* LEFT COLUMN - Main Content */}
          <div className="lg:col-span-2 space-y-8">
            <PropertyDescription description={listing.public_remarks} />

            <GatedContent shouldGate={shouldGate} sectionName="Property Details" buildingId={listing.building_id} buildingName={building?.building_name || ''} buildingAddress={building?.canonical_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber={listing.unit_number || ''}>
              <PropertyDetails listing={listing} />
            </GatedContent>

            <PropertyAmenities amenities={amenities} feeIncludes={feeIncludes} />

            {rooms && rooms.length > 0 && (
            <GatedContent shouldGate={shouldGate} sectionName="Room Dimensions" buildingId={listing.building_id} buildingName={building?.building_name || ''} buildingAddress={building?.canonical_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber={listing.unit_number || ''}>
                <RoomDimensions rooms={rooms} />
              </GatedContent>
            )}

            {unitHistory && unitHistory.length > 0 && (
            <GatedContent shouldGate={shouldGate} sectionName="Transaction History" buildingId={listing.building_id} buildingName={building?.building_name || ''} buildingAddress={building?.canonical_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber={listing.unit_number || ''}>
                <UnitHistory
                  history={unitHistory}
                  unitNumber={listing.unit_number || 'N/A'}
                />
              </GatedContent>
            )}

            {isClosed && (
            <GatedContent shouldGate={shouldGate} sectionName="Price History" buildingId={listing.building_id} buildingName={building?.building_name || ''} buildingAddress={building?.canonical_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber={listing.unit_number || ''}>
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
                    buildingAddress={building?.canonical_address || ''}
                    unitNumber={listing.unit_number || ''}
                    
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
      
      {/* Sticky Bottom Bar */}
      <PropertyStickyBar
        listing={listing}
        buildingName={building?.building_name || ''}
        isSale={isSale}
        onEstimateClick={() => setShowEstimatorModal(true)}
        onOfferClick={() => setShowOfferModal(true)}
      />
      
      {/* Estimator Modal */}
      {showEstimatorModal && (
        <EstimatorBuyerModal
          isOpen={showEstimatorModal}
          onClose={() => setShowEstimatorModal(false)}
          listing={listing}
          buildingId={listing.building_id}
          buildingName={building?.building_name || ''}
          buildingAddress={building?.canonical_address || ''}
          agentId={agent?.id || ''}
          type={isSale ? 'sale' : 'lease'}
          exactSqft={listing.building_area_total || null}
        />
      )}
      
      {/* Offer Inquiry Modal */}
      {showOfferModal && agent && (
        <OfferInquiryModal
          isOpen={showOfferModal}
          onClose={() => setShowOfferModal(false)}
          listing={listing}
          buildingName={building?.building_name || ''}
          isSale={isSale}
          agent={agent}
        />
      )}
      
      {/* Exit Intent Popup - Desktop Only */}
      <ExitIntentPopup
        unitNumber={listing.unit_number || ''}
        buildingName={building?.building_name || ''}
        isSale={isSale}
        onEstimateClick={() => setShowEstimatorModal(true)}
      />

      {/* SEO Content */}
      <PropertySEO
        listing={listing}
        building={building}
        development={development}
        isSale={isSale}
        isClosed={isClosed}
      />
    </>
  )
}
