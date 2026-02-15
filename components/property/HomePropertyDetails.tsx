import { extractExactSqft } from '@/lib/estimator/types'

interface HomePropertyDetailsProps {
  listing: any
}

export default function HomePropertyDetails({ listing }: HomePropertyDetailsProps) {
  const exactSqft = extractExactSqft(listing.square_foot_source)
  const displaySqft = exactSqft
    ? `${exactSqft.toLocaleString()} sqft`
    : listing.living_area_range
    ? `${listing.living_area_range} sqft`
    : '-'

  const lotWidth = listing.lot_width ? parseFloat(listing.lot_width) : null
  const lotDepth = listing.lot_depth ? parseFloat(listing.lot_depth) : null
  const lotSize = lotWidth && lotDepth
    ? `${lotWidth.toFixed(0)}  ${lotDepth.toFixed(0)} ft`
    : listing.lot_size_dimensions || null

  const basementText = listing.basement?.length
    ? listing.basement.filter((b: string) => b && b !== 'None').join(', ')
    : null

  const styleText = listing.architectural_style?.[0] || null

  const poolText = listing.pool_features?.length
    ? listing.pool_features.filter((p: string) => p && p !== 'None').join(', ')
    : null

  const coolingText = listing.cooling?.length
    ? listing.cooling.filter((c: string) => c && c !== 'None').join(', ')
    : null

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
          <p className="text-2xl font-bold text-slate-900">{listing.property_subtype || 'Home'}</p>
        </div>
      </div>

      {/* Home-Specific Details */}
      <div className="border-t border-slate-200 pt-6">
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">

          {styleText && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Style</span>
              <span className="font-semibold text-slate-900">{styleText}</span>
            </div>
          )}

          {listing.approximate_age && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Approx. Age</span>
              <span className="font-semibold text-slate-900">{listing.approximate_age} years</span>
            </div>
          )}

          {lotSize && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Lot Size</span>
              <span className="font-semibold text-slate-900">{lotSize}</span>
            </div>
          )}

          {lotWidth && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Frontage</span>
              <span className="font-semibold text-slate-900">{lotWidth.toFixed(1)} ft</span>
            </div>
          )}

          {lotDepth && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Depth</span>
              <span className="font-semibold text-slate-900">{lotDepth.toFixed(1)} ft</span>
            </div>
          )}

          {listing.garage_type && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Garage</span>
              <span className="font-semibold text-slate-900">{listing.garage_type}</span>
            </div>
          )}

          {basementText && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Basement</span>
              <span className="font-semibold text-slate-900">{basementText}</span>
            </div>
          )}

          {coolingText && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Cooling</span>
              <span className="font-semibold text-slate-900">{coolingText}</span>
            </div>
          )}

          {listing.heat_type && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Heating</span>
              <span className="font-semibold text-slate-900">{listing.heat_type}</span>
            </div>
          )}

          {listing.fireplace_yn && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Fireplace</span>
              <span className="font-semibold text-slate-900">Yes</span>
            </div>
          )}

          {poolText && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Pool</span>
              <span className="font-semibold text-slate-900">{poolText}</span>
            </div>
          )}

          {listing.parking_total > 0 && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Parking Spaces</span>
              <span className="font-semibold text-slate-900">{listing.parking_total}</span>
            </div>
          )}

          {listing.neighborhood && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Neighbourhood</span>
              <span className="font-semibold text-slate-900">{listing.neighborhood}</span>
            </div>
          )}

          {listing.listing_contract_date && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Listed On</span>
              <span className="font-semibold text-slate-900">{formatDate(listing.listing_contract_date)}</span>
            </div>
          )}

          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-600">MLS Size</span>
            <span className="font-semibold text-slate-900">{listing.living_area_range || '-'}</span>
          </div>
        </div>

        {/* Financial Details */}
        <div className="mt-6 space-y-3">
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
    </div>
  )
}
