import { formatPrice } from '@/lib/utils/formatters'
import StatusBadge from './StatusBadge'
import { MLSListing } from '@/lib/types/building'

interface PropertyHeaderProps {
  listing: MLSListing & { buildings?: { name: string; address: string } }
  status: 'Active' | 'Closed'
  isSale: boolean
}

export default function PropertyHeader({ listing, status, isSale }: PropertyHeaderProps) {
  const isClosed = status === 'Closed'
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
  
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const months = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30))
    
    if (months < 1) return 'less than a month ago'
    if (months === 1) return '1 month ago'
    if (months < 12) return `${months} months ago`
    
    const years = Math.floor(months / 12)
    return years === 1 ? '1 year ago' : `${years} years ago`
  }
  
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 -mt-16 relative z-10 mx-4 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h1 className="text-3xl font-bold text-slate-900">
              Unit {listing.unit_number || 'N/A'}
            </h1>
            <StatusBadge 
              status={status}
              transactionType={listing.transaction_type as 'For Sale' | 'For Lease'}
            />
          </div>
          
          <p className="text-lg text-slate-600 mb-2">
            {listing.unparsed_address || listing.buildings?.address}
          </p>
          
          {listing.buildings?.name && (
            <p className="text-base text-slate-700 mb-2 font-semibold">
              {listing.buildings.name}
            </p>
          )}
          
          <p className="text-sm text-slate-500">
            MLS #{listing.listing_key || listing.listing_id}
          </p>
        </div>
        
        <div className="text-right">
          {!isClosed ? (
            <div>
              <div className="text-4xl font-bold text-slate-900">
                {formatPrice(listing.list_price)}
                {!isSale && <span className="text-2xl font-normal text-slate-600">/mo</span>}
              </div>
              <p className="text-sm text-slate-600 mt-1">
                {isSale ? 'Listed Price' : 'Monthly Rent'}
              </p>
            </div>
          ) : (
            <div>
              <div className="text-4xl font-bold text-slate-900">
                {formatPrice(listing.close_price!)}
                {!isSale && <span className="text-2xl font-normal text-slate-600">/mo</span>}
              </div>
              <p className="text-sm text-slate-600 mt-1">
                {isSale ? 'Sold' : 'Leased'} on {formatDate(listing.close_date!)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {formatTimeAgo(listing.close_date!)}
              </p>
              {listing.list_price && (
                <p className="text-xs text-slate-500 mt-2">
                  Originally listed at {formatPrice(listing.list_price)}
                  {!isSale && '/mo'}  {listing.days_on_market} days on market
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
