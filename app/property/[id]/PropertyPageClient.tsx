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
  isClosed
}: PropertyPageClientProps) {
  const { user } = useAuth()
  const shouldGate = isClosed && !user

  return (
    <>
      <PropertyGallery 
        photos={largePhotos} 
        shouldBlur={shouldGate}
        maxPhotos={shouldGate ? 2 : undefined}
      />

      <div className="max-w-7xl mx-auto pb-16">
        <PropertyHeader
          listing={listing}
          status={status}
          isSale={isSale}
          shouldBlur={shouldGate}
        />

        <div className="grid lg:grid-cols-3 gap-8 mt-8 px-4">
          <div className="lg:col-span-2 space-y-8">
            <PropertyDescription description={listing.public_remarks} />

            <GatedContent shouldGate={shouldGate} sectionName="Property Details">
              <PropertyDetails listing={listing} />
            </GatedContent>

            <PropertyAmenities amenities={amenities} feeIncludes={feeIncludes} />

            {rooms && rooms.length > 0 && (
              <GatedContent shouldGate={shouldGate} sectionName="Room Dimensions">
                <RoomDimensions rooms={rooms} />
              </GatedContent>
            )}

            {unitHistory && unitHistory.length > 0 && (
              <GatedContent shouldGate={shouldGate} sectionName="Transaction History">
                <UnitHistory
                  history={unitHistory}
                  unitNumber={listing.unit_number || 'N/A'}
                />
              </GatedContent>
            )}

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
        </div>
      </div>
    </>
  )
}
