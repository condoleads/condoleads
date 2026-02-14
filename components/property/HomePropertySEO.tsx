import Link from 'next/link'

interface HomePropertySEOProps {
  listing: {
    bedrooms_total: number | null
    bathrooms_total_integer: string | number | null
    living_area_range: string | null
    list_price: number
    close_price: number | null
    transaction_type: string
    standard_status: string
    unparsed_address: string | null
    property_subtype: string | null
    lot_width: string | null
    lot_depth: string | null
    architectural_style: string[] | null
    approximate_age: string | null
    garage_type: string | null
    basement: string[] | null
  }
  community: { name: string; slug: string } | null
  municipality: { name: string; slug: string } | null
  area: { name: string; slug: string } | null
  isSale: boolean
  isClosed: boolean
}

export default function HomePropertySEO({ listing, community, municipality, area, isSale, isClosed }: HomePropertySEOProps) {
  const beds = listing.bedrooms_total || 0
  const baths = listing.bathrooms_total_integer || 0
  const sqft = listing.living_area_range || null
  const price = isClosed ? (listing.close_price || listing.list_price) : listing.list_price
  const priceFormatted = price ? `$${price.toLocaleString()}` : 'Contact for price'
  const subtype = listing.property_subtype || 'Home'
  const statusText = isClosed ? (isSale ? 'sold' : 'leased') : (isSale ? 'for sale' : 'for lease')
  const address = listing.unparsed_address || ''
  const style = listing.architectural_style?.[0] || null
  const lotWidth = listing.lot_width ? parseFloat(listing.lot_width) : null
  const lotDepth = listing.lot_depth ? parseFloat(listing.lot_depth) : null
  const basementText = listing.basement?.filter(b => b && b !== 'None').join(', ') || null

  return (
    <section className="py-12 bg-slate-50">
      <div className="max-w-4xl mx-auto px-6">
        <div className="prose prose-slate max-w-none">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            About {address}
          </h2>

          <p className="text-slate-700 leading-relaxed mb-4">
            {address} is a {beds}-bedroom, {baths}-bathroom {style ? style.toLowerCase() + ' ' : ''}{subtype.toLowerCase()}
            {sqft && ` with approximately ${sqft} square feet of living space`}
            {lotWidth && lotDepth && `, situated on a ${lotWidth.toFixed(0)}  ${lotDepth.toFixed(0)} foot lot`}.
            This property is currently {statusText} {!isClosed ? `at ${priceFormatted}` : `(${statusText} for ${priceFormatted})`}.
            {listing.garage_type && ` The home features a ${listing.garage_type.toLowerCase()} garage`}
            {basementText && `${listing.garage_type ? ' and a' : ' The home features a'} ${basementText.toLowerCase()} basement`}
            {listing.approximate_age && `, built approximately ${listing.approximate_age} years ago`}.
          </p>

          {/* Community Link */}
          {community && (
            <>
              <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4">
                {community.name} Neighbourhood
              </h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                This home is located in{' '}
                <Link href={`/${community.slug}`} className="text-blue-600 hover:text-blue-800 font-medium hover:underline">
                  {community.name}
                </Link>
                {municipality && (
                  <>, part of{' '}
                    <Link href={`/${municipality.slug}`} className="text-blue-600 hover:text-blue-800 font-medium hover:underline">
                      {municipality.name}
                    </Link>
                  </>
                )}
                {area && (
                  <> in the{' '}
                    <Link href={`/${area.slug}`} className="text-blue-600 hover:text-blue-800 font-medium hover:underline">
                      {area.name}
                    </Link>
                    {' '}area
                  </>
                )}.
                Explore more homes for sale and recently sold properties in this neighbourhood.
              </p>
            </>
          )}

          <p className="text-slate-700 leading-relaxed">
            Whether you are looking to buy, sell, or lease in {community?.name || 'this neighbourhood'},
            our team of experienced real estate professionals can help you navigate the market
            and find the perfect home. Contact us today for a free consultation.
          </p>

          <div className="mt-8 pt-8 border-t border-slate-300">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">
              {address}
            </h3>
            <p className="text-sm text-slate-600">
              {address} {statusText},
              {beds} bedroom {subtype.toLowerCase()} {community?.name || ''},
              {municipality?.name || ''} homes for sale,
              {area?.name || ''} real estate,
              {style && `${style} homes, `}
              {subtype.toLowerCase()} {statusText}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
