import { MLSListing } from '@/lib/types/building'
import ListingCard from '@/app/[slug]/components/ListingCard'

interface SimilarListingsProps {
  listings: MLSListing[]
}

export default function SimilarListings({ listings }: SimilarListingsProps) {
  if (!listings || listings.length === 0) {
    return null
  }
  
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Similar Units in This Building</h2>
      
      <div className="grid md:grid-cols-2 gap-6">
        {listings.map((listing) => {
          const isSale = listing.transaction_type === 'For Sale'
          const type = isSale ? 'sale' : 'rent'
          
          return (
            <ListingCard
              key={listing.id}
              listing={listing}
              type={type}              
            />
          )
        })}
      </div>
    </div>
  )
}