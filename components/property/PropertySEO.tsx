import Link from 'next/link'

interface PropertySEOProps {
  listing: {
    unit_number: string | null
    bedrooms_total: number | null
    bathrooms_total_integer: number | null
    living_area_range: string | null
    list_price: number
    close_price: number | null
    transaction_type: string
    standard_status: string
    unparsed_address: string | null
    property_type: string | null
  }
  building: {
    building_name: string
    slug: string
    canonical_address: string
  } | null
  development?: {
    id?: string
    name: string
    slug: string
  } | null
  isSale: boolean
  isClosed: boolean
}

export default function PropertySEO({ listing, building, development, isSale, isClosed }: PropertySEOProps) {
  const unitNumber = listing.unit_number || 'N/A'
  const beds = listing.bedrooms_total || 0
  const baths = listing.bathrooms_total_integer || 0
  const sqft = listing.living_area_range || 'N/A'
  const price = isClosed ? (listing.close_price || listing.list_price) : listing.list_price
  const priceFormatted = price ? `$${(price / 1000).toFixed(0)}K` : 'Contact for price'
  const propertyType = listing.property_type || 'Condo'
  const statusText = isClosed ? (isSale ? 'sold' : 'leased') : (isSale ? 'for sale' : 'for lease')
  const address = listing.unparsed_address || building?.canonical_address || ''

  return (
    <section className="py-12 bg-slate-50">
      <div className="max-w-4xl mx-auto px-6">
        <div className="prose prose-slate max-w-none">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            About Unit {unitNumber} {building ? `at ${building.building_name}` : ''}
          </h2>

          <p className="text-slate-700 leading-relaxed mb-4">
            Unit {unitNumber} is a {beds}-bedroom, {baths}-bathroom {propertyType.toLowerCase()} 
            {sqft !== 'N/A' && ` spanning approximately ${sqft} square feet`}
            {building && ` located at ${building.building_name}, ${building.canonical_address}`}. 
            This unit is currently {statusText} {!isClosed && `at ${priceFormatted}`}
            {isClosed && ` (${statusText} for ${priceFormatted})`}.
          </p>

          {/* Building Link */}
          {building && (
            <>
              <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4">
                About {building.building_name}
              </h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                <Link 
                  href={`/${building.slug}`}
                  className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                >
                  {building.building_name}
                </Link>
                {' '}is located at {building.canonical_address} in Toronto. 
                Explore more units {isSale ? 'for sale and rent' : 'available'} in this building, 
                view building amenities, transaction history, and market insights.
              </p>
            </>
          )}

          {/* Development Link */}
          {development && (
            <>
              <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4">
                Part of {development.name}
              </h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                {building?.building_name || 'This building'} is part of the{' '}
                <Link 
                  href={`/${development.slug}`}
                  className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                >
                  {development.name}
                </Link>
                {' '}development. Explore all buildings and available units within this 
                prestigious multi-building community.
              </p>
            </>
          )}

          <p className="text-slate-700 leading-relaxed">
            Whether you're looking to buy, sell, or rent at {building?.building_name || address}, 
            our team of experienced real estate professionals can help you navigate the market 
            and find the perfect unit to match your needs. Contact us today for a free consultation.
          </p>

          <div className="mt-8 pt-8 border-t border-slate-300">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">
              Keywords: Unit {unitNumber} {building?.building_name || ''} Toronto
            </h3>
            <p className="text-sm text-slate-600">
              Unit {unitNumber} {building?.building_name || ''}, 
              {address} {isSale ? 'for sale' : 'for rent'}, 
              {beds} bedroom condo Toronto, 
              {building?.building_name || ''} condos, 
              {development ? `${development.name} Toronto, ` : ''}
              Toronto {propertyType.toLowerCase()} {statusText}, 
              {building?.canonical_address || ''} real estate
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}