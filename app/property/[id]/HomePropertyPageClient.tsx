'use client'

import { useState } from 'react'
import { useAuth } from '@/components/auth/AuthContext'
import PropertyGallery from '@/components/property/PropertyGallery'
import PropertyHeader from '@/components/property/PropertyHeader'
import HomePropertyDetails from '@/components/property/HomePropertyDetails'
import PropertyDescription from '@/components/property/PropertyDescription'
import PriceHistory from '@/components/property/PriceHistory'
import RoomDimensions from '@/components/property/RoomDimensions'
import UnitHistory from '@/components/property/UnitHistory'
import GatedContent from '@/components/property/GatedContent'
import SimilarListings from '@/components/property/SimilarListings'
import { AgentCard } from '@/components/AgentCard'
import HomePropertyEstimateCTA from '@/components/property/HomePropertyEstimateCTA'
import HomePropertyInfo from '@/components/property/HomePropertyInfo'
import AgentContactForm from '@/components/property/AgentContactForm'
import PropertyStickyBar from '@/components/property/PropertyStickyBar'
import OfferInquiryModal from '@/components/property/OfferInquiryModal'
import ExitIntentPopup from '@/components/property/ExitIntentPopup'
import HomeEstimatorBuyerModal from '@/app/estimator/components/HomeEstimatorBuyerModal'
import Breadcrumb from '@/components/Breadcrumb'
import HomePropertySEO from '@/components/property/HomePropertySEO'

interface HomePropertyPageClientProps {
  listing: any
  largePhotos: any[]
  rooms: any[]
  addressHistory: any[]
  similarListings: any[]
  availableNearby: any[]
  isSale: boolean
  status: 'Active' | 'Closed'
  isClosed: boolean
  agent?: any
  community?: { id: string; name: string; slug: string } | null
  municipality?: { id: string; name: string; slug: string } | null
  area?: { id: string; name: string; slug: string } | null
}

export default function HomePropertyPageClient({
  listing,
  largePhotos,
  rooms,
  addressHistory,
  similarListings,
  availableNearby,
  isSale,
  status,
  isClosed,
  agent,
  community,
  municipality,
  area,
}: HomePropertyPageClientProps) {
  const { user } = useAuth()
  const shouldGate = isClosed && !user
  const shouldGateMLSData = !user

  const [showEstimatorModal, setShowEstimatorModal] = useState(false)
  const [showOfferModal, setShowOfferModal] = useState(false)

  // Extract short address for display (e.g., "22 Hopecrest Crescent")
  const shortAddress = listing.unparsed_address
    ? listing.unparsed_address.split(',')[0].trim()
    : 'Property'

  return (
    <>
      <PropertyGallery
        photos={largePhotos}
        listingId={listing.id}
        shouldBlur={shouldGate}
        buildingId=""
        maxPhotos={shouldGate ? 2 : undefined}
      />

      <div className="max-w-7xl mx-auto pb-16">
        <div className="px-4">
          <Breadcrumb items={[
            ...(area ? [{ label: area.name, href: `/${area.slug}` }] : []),
            ...(municipality ? [{ label: municipality.name, href: `/${municipality.slug}` }] : []),
            ...(community ? [{ label: community.name, href: `/${community.slug}` }] : []),
            { label: shortAddress }
          ]} />
        </div>

        <PropertyHeader
          listing={listing}
          status={status}
          isSale={isSale}
          shouldBlur={shouldGate}
          buildingId=""
          isHome={true}
          onEstimateClick={() => setShowEstimatorModal(true)}
          onOfferClick={() => setShowOfferModal(true)}
        />

        <div className="grid lg:grid-cols-3 gap-8 mt-8 px-4">
          {/* LEFT COLUMN - Main Content */}
          <div className="lg:col-span-2 space-y-8">
            <PropertyDescription description={listing.public_remarks} />

            <GatedContent shouldGate={shouldGate} sectionName="Property Details" buildingId="" buildingName={shortAddress} buildingAddress={listing.unparsed_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber="">
              <HomePropertyDetails listing={listing} />
            </GatedContent>

            {rooms && rooms.length > 0 && (
              <GatedContent shouldGate={shouldGate} sectionName="Room Dimensions" buildingId="" buildingName={shortAddress} buildingAddress={listing.unparsed_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber="">
                <RoomDimensions rooms={rooms} />
              </GatedContent>
            )}

            {addressHistory && addressHistory.length > 0 && (
              <GatedContent shouldGate={shouldGateMLSData} sectionName="Transaction History" buildingId="" buildingName={shortAddress} buildingAddress={listing.unparsed_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber="">
                <UnitHistory
                    history={addressHistory}
                    unitNumber={shortAddress}
                    buildingSlug=""
                    isHome={true}
                  />
              </GatedContent>
            )}

            {isClosed && (
              <GatedContent shouldGate={shouldGateMLSData} sectionName="Price History" buildingId="" buildingName={shortAddress} buildingAddress={listing.unparsed_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber="">
                <PriceHistory
                  listPrice={listing.list_price}
                  closePrice={listing.close_price}
                  listingDate={listing.listing_contract_date}
                  closeDate={listing.close_date}
                  daysOnMarket={listing.days_on_market}
                />
              </GatedContent>
            )}

            <SimilarListings
               listings={similarListings}
                title="Recently Sold Nearby"
                agentId={agent?.id}
                isHome={true}
              />

            {availableNearby && availableNearby.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">
                  Available {isSale ? 'For Sale' : 'For Lease'} Nearby
                </h2>
                <SimilarListings listings={availableNearby} agentId={agent?.id} isHome={true} />
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
                    buildingId=""
                    buildingName={shortAddress}
                    buildingAddress={listing.unparsed_address || ''}
                    unitNumber=""
                  />

                  <GatedContent shouldGate={shouldGateMLSData} sectionName="Price Estimate" buildingId="" buildingName={shortAddress} buildingAddress={listing.unparsed_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber="">
                    <HomePropertyEstimateCTA
                      listing={listing}
                      isSale={isSale}
                      agentId={agent.id}
                    />
                  </GatedContent>

                  <HomePropertyInfo listing={listing} />

                  <AgentContactForm
                      listing={{ ...listing, buildings: null }}
                      status={status}
                      isSale={isSale}
                      agent={agent}
                      isHome={true}
                    />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <PropertyStickyBar
        listing={{ ...listing, building_id: listing.building_id || '' }}
        buildingName={shortAddress}
        isHome={true}
        isSale={isSale}
        onEstimateClick={() => setShowEstimatorModal(true)}
        onOfferClick={() => setShowOfferModal(true)}
      />

      {/* Home Estimator Modal */}
      {showEstimatorModal && (
        <HomeEstimatorBuyerModal
          isOpen={showEstimatorModal}
          onClose={() => setShowEstimatorModal(false)}
          listing={listing}
          agentId={agent?.id || ''}
          type={isSale ? 'sale' : 'rent'}
          exactSqft={listing.building_area_total || null}
        />
      )}

      {/* Offer Inquiry Modal */}
      {showOfferModal && agent && (
        <OfferInquiryModal
          isOpen={showOfferModal}
          onClose={() => setShowOfferModal(false)}
          listing={listing}
          buildingName={shortAddress}
          isSale={isSale}
          agent={agent}
        />
      )}

      {/* Exit Intent Popup */}
      <ExitIntentPopup
        unitNumber=""
        buildingName={shortAddress}
        isSale={isSale}
        onEstimateClick={() => setShowEstimatorModal(true)}
      />

      {/* SEO Content */}
      <HomePropertySEO
        listing={listing}
        community={community || null}
        municipality={municipality || null}
        area={area || null}
        isSale={isSale}
        isClosed={isClosed}
      />
    </>
  )
}

