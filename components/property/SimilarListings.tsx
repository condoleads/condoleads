import { MLSListing } from '@/lib/types/building'
import { formatPrice } from '@/lib/utils/formatters'
import Link from 'next/link'
import { extractExactSqft } from '@/lib/estimator/types'

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
          const exactSqft = extractExactSqft(listing.square_foot_source)
          const displaySqft = exactSqft 
            ? `${exactSqft.toLocaleString()}` 
            : listing.living_area_range || '-'
          
          const isSale = listing.transaction_type === 'For Sale'
          const isClosed = listing.standard_status === 'Closed'
          
          const statusConfig = {
            'For Sale': 'bg-emerald-500',
            'Sold': 'bg-red-500',
            'For Lease': 'bg-sky-500',
            'Leased': 'bg-orange-500'
          }
          
          const statusText = isClosed 
            ? (isSale ? 'Sold' : 'Leased')
            : listing.transaction_type
          
          const statusColor = statusConfig[statusText as keyof typeof statusConfig]
          
          return (
            <Link 
              key={listing.id} 
              href={`/property/${listing.id}`}
              className="border-2 border-slate-200 rounded-xl p-4 hover:border-emerald-500 transition-colors"
            >
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-lg font-bold text-slate-900">
                  Unit {listing.unit_number || 'N/A'}
                </h3>
                <span className={`${statusColor} text-white px-3 py-1 rounded-full text-xs font-bold`}>
                  {statusText}
                </span>
              </div>
              
              <p className="text-2xl font-bold text-slate-900 mb-3">
                {formatPrice(listing.list_price)}
                {!isSale && <span className="text-lg font-normal">/mo</span>}
              </p>
              
              <div className="text-sm text-slate-600 space-y-1">
                <p>{listing.bedrooms_total} bed  {listing.bathrooms_total_integer} bath  {displaySqft} sqft</p>
                <p>{listing.parking_total || 0} parking  {listing.locker === 'Owned' ? 'Has locker' : 'No locker'}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
