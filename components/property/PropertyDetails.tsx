import { MLSListing } from '@/lib/types/building'
import { extractExactSqft } from '@/lib/estimator/types'

interface PropertyDetailsProps {
  listing: MLSListing & { buildings?: { name: string; slug: string } }
}

export default function PropertyDetails({ listing }: PropertyDetailsProps) {
  const exactSqft = extractExactSqft(listing.square_foot_source)
  const displaySqft = exactSqft 
    ? `${exactSqft.toLocaleString()} sqft` 
    : listing.living_area_range 
    ? `${listing.living_area_range} sqft`
    : '-'
  
  const parkingCount = listing.parking_total || 0
  const hasLocker = listing.locker === 'Owned' || listing.locker === 'Rental'
  
  // Extract additional details
  const hasEnsuitelaundry = false // laundry_features not in MLSListing type
  const architecturalStyle = null // architectural_style not in MLSListing type
  const parkingType = 'None' // parking_features not in MLSListing type
  
  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }
  
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Property Details</h2>
      
      {/* Key Specs Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <div>
          <p className="text-sm text-slate-600 mb-1">Bedrooms</p>
          <p className="text-2xl font-bold text-slate-900">{listing.bedrooms_total || 0}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600 mb-1">Bathrooms</p>
          <p className="text-2xl font-bold text-slate-900">{listing.bathrooms_total_integer || 0}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600 mb-1">Square Feet</p>
          <p className="text-2xl font-bold text-slate-900">{displaySqft}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600 mb-1">Property Type</p>
          <p className="text-2xl font-bold text-slate-900">{listing.property_type || 'Condo'}</p>
        </div>
      </div>
      
      {/* Additional Details - Two Column Layout */}
      <div className="border-t border-slate-200 pt-6">
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
          
          {false && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Neighbourhood</span>
              <span className="font-semibold text-slate-900">{false}</span>
            </div>
          )}
          
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-600">Parking</span>
            <span className="font-semibold text-slate-900">{parkingCount > 0 ? 'Yes' : 'No'}</span>
          </div>
          
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-600">Parking Type</span>
            <span className="font-semibold text-slate-900">{parkingType}</span>
          </div>
          
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-600">Locker</span>
            <span className="font-semibold text-slate-900">{hasLocker ? 'Yes' : 'No'}</span>
          </div>
          
          {false && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Heating Type</span>
              <span className="font-semibold text-slate-900">{false}</span>
            </div>
          )}
          
          {architecturalStyle && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Style</span>
              <span className="font-semibold text-slate-900">{architecturalStyle}</span>
            </div>
          )}
          
          {hasEnsuitelaundry !== null && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Ensuite Laundry</span>
              <span className="font-semibold text-slate-900">{hasEnsuitelaundry ? 'Yes' : 'No'}</span>
            </div>
          )}
          
          {false && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Corp #</span>
              <span className="font-semibold text-slate-900">TSCC-{false}</span>
            </div>
          )}
          
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-600">MLS Size</span>
            <span className="font-semibold text-slate-900">{listing.living_area_range || '-'}</span>
          </div>
          
          {listing.listing_contract_date && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Listed On</span>
              <span className="font-semibold text-slate-900">{formatDate(listing.listing_contract_date)}</span>
            </div>
          )}
          
        </div>
        
        {/* Financial Details - Full Width */}
        <div className="mt-6 space-y-3">
          {listing.association_fee && listing.association_fee > 0 && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Maintenance Fees</span>
              <span className="font-semibold text-slate-900">
                ${Math.round(listing.association_fee).toLocaleString()}/month
              </span>
            </div>
          )}
          
          {listing.tax_annual_amount && listing.tax_annual_amount > 0 && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Property Tax</span>
              <span className="font-semibold text-slate-900">
                ${Math.round(listing.tax_annual_amount).toLocaleString()}/year
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Building Info */}
      {false && (
        <div className="border-t border-slate-200 mt-6 pt-6">
          <h3 className="text-lg font-bold text-slate-900 mb-3">Building Information</h3>
          <p className="text-slate-700 mb-2">
            <span className="font-semibold">{false.name}</span>
          </p>
          <a 
            href={`/${false.slug}`}
            className="text-emerald-600 hover:text-emerald-700 font-semibold text-sm"
          >
            View All Units in This Building ?
          </a>
        </div>
      )}
    </div>
  )
}
