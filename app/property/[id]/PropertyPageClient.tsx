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
import InvestmentAnalysis from '@/components/property/InvestmentAnalysis'
import type { InvestmentData } from '@/lib/market/get-listing-investment-data'
import WalliamCTA from '@/components/WalliamCTA'
import CharliePageContext from '@/components/CharliePageContext'
import WalliamAgentCard from '@/components/WalliamAgentCard'
import WalliamContactForm from '@/components/WalliamContactForm'
import AppointmentForm from '@/app/charlie/components/AppointmentForm'

interface PropertyPageClientProps {
  assistantName: string
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
  // LANE-B-1 (2026-07-06): geo up-link chain for PropertySEO — resolved
  // in server page.tsx from listing.community_id / municipality_id / area_id
  // and passed through. Null when the FK is null or the row is not found.
  community?: { name: string; slug: string } | null
  municipality?: { name: string; slug: string } | null
  area?: { name: string; slug: string } | null
  investmentData?: InvestmentData
  isHero?: boolean
  walliamTenantId?: string | null
  // P-LEADS-FIX (2026-06-12): server-resolved tenant-admin agent.id, threaded
  // for the lead-form's agentId on the hero (walliam) branch. Sidesteps the
  // hierarchy-load-bearing isHero?null:agent nulling above without removing it.
  walliamAgentId?: string | null
  brandName: string
  wordmarkStyle: string
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
  development,
  community = null,
  municipality = null,
  area = null,
  investmentData,
  isHero = false,
  walliamTenantId = null,
  walliamAgentId = null,
  assistantName,
  brandName,
  wordmarkStyle,
}: PropertyPageClientProps) {
  const { user } = useAuth()
  const shouldGate = isClosed && !user
  const shouldGateMLSData = !user  // MLS requirement: always gate history & estimates
  
  // Modal state for sticky bar CTAs
  const [showEstimatorModal, setShowEstimatorModal] = useState(false)
  const [showOfferModal, setShowOfferModal] = useState(false)
  const [showBooking, setShowBooking] = useState(false)

  return (
    <>
      {isHero && <div className="h-16 bg-[#060b18]" />}
      <PropertyGallery
        photos={largePhotos}
        listingId={listing.id}
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
          buildingName={building?.building_name || null}
          onEstimateClick={() => setShowEstimatorModal(true)}
          onOfferClick={() => setShowOfferModal(true)}
        />

        <div className="grid lg:grid-cols-3 gap-8 mt-8 px-4">
          {/* LEFT COLUMN - Main Content */}
          <div className="lg:col-span-2 space-y-8">
            <PropertyDescription description={listing.public_remarks} />

            {/* Investment Analysis - Shows ROI, price context */}
            {investmentData && isSale && (
              <InvestmentAnalysis
               data={investmentData}
               listPrice={listing.list_price}
               buildingName={building?.building_name || 'Building'}
               isSale={isSale}
               />
            )}

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
            <GatedContent shouldGate={shouldGateMLSData} sectionName="Transaction History" buildingId={listing.building_id} buildingName={building?.building_name || ''} buildingAddress={building?.canonical_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber={listing.unit_number || ''}>
                <UnitHistory
                  history={unitHistory}
                  unitNumber={listing.unit_number || 'N/A'}
                  buildingSlug={building?.slug || ''}
                />
              </GatedContent>
            )}

            {isClosed && (
            <GatedContent shouldGate={shouldGateMLSData} sectionName="Price History" buildingId={listing.building_id} buildingName={building?.building_name || ''} buildingAddress={building?.canonical_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber={listing.unit_number || ''}>
                <PriceHistory
                  listPrice={listing.list_price}
                  closePrice={listing.close_price}
                  listingDate={listing.listing_contract_date}
                  closeDate={listing.close_date}
                  daysOnMarket={listing.days_on_market}
                />
              </GatedContent>
            )}

            <SimilarListings listings={similarListings || []} agentId={agent?.id} tenantId={walliamTenantId || undefined} />

            {availableListings && availableListings.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">
                  Available {isSale ? 'For Sale' : 'For Lease'} in This Building
                </h2>
                <SimilarListings listings={availableListings} agentId={agent?.id} tenantId={walliamTenantId || undefined} />
              </div>
            )}
          </div>

          {/* RIGHT COLUMN - Sticky Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {isHero && walliamTenantId ? (
                <>
                  <WalliamAgentCard
                    listing_id={listing.id}
                    building_id={listing.building_id}
                    community_id={listing.community_id || null}
                    municipality_id={listing.municipality_id || null}
                    tenant_id={walliamTenantId}
                    hideCTA={true}
                  />
                  <WalliamCTA context={building?.building_name} assistantName={assistantName} brandName={brandName} wordmarkStyle={wordmarkStyle} />
                  <CharliePageContext listing_id={listing.id} building_id={listing.building_id} community_id={listing.community_id || null} municipality_id={listing.municipality_id || null} />
                  <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
                    <button
                      onClick={() => setShowBooking(b => !b)}
                      style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>📅 Book a Visit</span>
                      <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)', transform: showBooking ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                    </button>
                    {showBooking && (
                      <div style={{ padding: '0 20px 20px' }}>
                        <AppointmentForm
                          type="buyer"
                          listings={[listing]}
                          userId={user?.id || null}
                          sessionId={null}
                          geoContext={null}
                          agent={null}
                          onBooked={() => setShowBooking(false)}
                        />
                      </div>
                    )}
                  </div>
                  <GatedContent shouldGate={shouldGateMLSData} sectionName="Price Estimate" buildingId={listing.building_id} buildingName={building?.building_name || ''} buildingAddress={building?.canonical_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber={listing.unit_number || ''}>
                    <PropertyEstimateCTA
                      listing={{ ...listing, buildings: building }}
                      status={status}
                      isSale={isSale}
                      buildingName={building?.building_name || ''}
                      buildingAddress={building?.canonical_address || ''}
                      buildingSlug={building?.slug || ''}
                      agentId={walliamAgentId || ''}
                      tenantId={walliamTenantId || undefined}
                      onEstimateClick={() => setShowEstimatorModal(true)}
                    />
                  </GatedContent>
                  <BuildingInfo
                    buildingName={building?.building_name || 'N/A'}
                    address={building?.canonical_address || listing.unparsed_address || 'N/A'}
                    yearBuilt={listing.year_built}
                    totalUnits={null}
                    parkingType={listing.parking_features}
                    petPolicy={listing.pet_allowed}
                  />
                </>
              ) : agent ? (
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
                  <WalliamCTA context={building?.building_name} assistantName={assistantName} brandName={brandName} wordmarkStyle={wordmarkStyle} />
                  <GatedContent shouldGate={shouldGateMLSData} sectionName="Price Estimate" buildingId={listing.building_id} buildingName={building?.building_name || ''} buildingAddress={building?.canonical_address || ''} listingId={listing.id} listingAddress={listing.unparsed_address || ''} unitNumber={listing.unit_number || ''}>
                    <PropertyEstimateCTA
                      listing={{ ...listing, buildings: building }}
                      status={status}
                      isSale={isSale}
                      buildingName={building?.building_name || ''}
                      buildingAddress={building?.canonical_address || ''}
                      buildingSlug={building?.slug || ''}
                      agentId={agent.id}
                      onEstimateClick={() => setShowEstimatorModal(true)}
                    />
                  </GatedContent>
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
              ) : null}
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
          buildingSlug={building?.slug || ''}
          buildingName={building?.building_name || ''}
          buildingAddress={building?.canonical_address || ''}
          agentId={agent?.id || walliamAgentId || ''}
          tenantId={walliamTenantId || undefined}
          type={isSale ? 'sale' : 'lease'}
          exactSqft={listing.building_area_total || null}
        />
      )}
      
      {/* Offer Inquiry Modal — W-OFFER-MODAL-WALLIAM-GATE (2026-06-17):
          mount gate refactored to consult walliamAgentId fallback so
          the modal renders on the walliam hero path (where parent
          passes agent=null). Same pattern + same fallback chain as the
          condo Get Estimate path at L302. agentId + agentName now strings
          (no more reading off a possibly-null agent object). */}
      {(() => {
        const offerAgentId = agent?.id || walliamAgentId || ''
        const offerAgentName = agent?.full_name || assistantName || 'our team'
        return showOfferModal && offerAgentId ? (
          <OfferInquiryModal
            isOpen={showOfferModal}
            onClose={() => setShowOfferModal(false)}
            listing={listing}
            buildingName={building?.building_name || ''}
            isSale={isSale}
            agentId={offerAgentId}
            agentName={offerAgentName}
            // W-ESTIMATOR-FIRE-ON-GENERATE (2026-06-17): silently run the
            // condo estimator engine on mount to build the rich workingDoc
            // for the agent email. UI unchanged.
            isHome={false}
            tenantId={walliamTenantId || undefined}
            buildingId={listing.building_id}
            buildingSlug={building?.slug || ''}
            buildingAddress={building?.canonical_address || ''}
            exactSqft={listing.building_area_total || null}
          />
        ) : null
      })()}
      
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
        community={community}
        municipality={municipality}
        area={area}
        isSale={isSale}
        isClosed={isClosed}
      />
    </>
  )
}

