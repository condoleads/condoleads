import { supabase } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'
import PropertyGallery from '@/components/property/PropertyGallery'
import PropertyHeader from '@/components/property/PropertyHeader'
import PropertyDetails from '@/components/property/PropertyDetails'
import PropertyEstimateCTA from '@/components/property/PropertyEstimateCTA'
import AgentContactForm from '@/components/property/AgentContactForm'
import SimilarListings from '@/components/property/SimilarListings'

export default async function PropertyPage({ params }: { params: { id: string } }) {
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
    .select('*')
    .eq('building_id', listing.building_id)
    .eq('bedrooms_total', listing.bedrooms_total)
    .eq('bathrooms_total_integer', listing.bathrooms_total_integer)
    .neq('id', listing.id)
    .limit(4)

  const isSale = listing.transaction_type === 'For Sale'
  const status = listing.standard_status === 'Closed' ? 'Closed' : 'Active'

  return (
    <main className="min-h-screen bg-slate-50">
      <PropertyGallery photos={largePhotos} />
      
      <div className="max-w-7xl mx-auto pb-16">
        <PropertyHeader
          listing={listingWithBuilding}
          status={status}
          isSale={isSale}
        />
        
        <div className="grid lg:grid-cols-3 gap-8 mt-8 px-4">
          <div className="lg:col-span-2 space-y-8">
            <PropertyDetails listing={listingWithBuilding} />
            <SimilarListings listings={similarListings || []} />
          </div>
          
          <div className="lg:col-span-1 space-y-6">
            <PropertyEstimateCTA
              listing={listingWithBuilding}
              status={status}
              isSale={isSale}
              buildingName={building?.name || ''}
            />
            
            <AgentContactForm
              listing={listingWithBuilding}
              status={status}
              isSale={isSale}
            />
          </div>
        </div>
      </div>
    </main>
  )
}