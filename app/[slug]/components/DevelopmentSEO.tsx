import Link from 'next/link'

interface DevelopmentSEOProps {
  developmentName: string
  buildings: Array<{
    building_name: string
    canonical_address: string
    slug: string
    total_units?: number
  }>
  totalForSale: number
  totalForLease: number
  totalSold: number
  totalLeased: number
  addresses: string
}

export default function DevelopmentSEO({ 
  developmentName, 
  buildings, 
  totalForSale, 
  totalForLease,
  totalSold,
  totalLeased,
  addresses 
}: DevelopmentSEOProps) {
  const totalUnits = buildings.reduce((sum, b) => sum + (b.total_units || 0), 0)
  const totalTransactions = totalSold + totalLeased
  
  return (
    <section className="py-12 bg-slate-50">
      <div className="max-w-4xl mx-auto px-6">
        <div className="prose prose-slate max-w-none">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            About {developmentName}
          </h2>
          
          <p className="text-slate-700 leading-relaxed mb-4">
            {developmentName} is a prestigious multi-building condominium development located in Toronto, 
            featuring {buildings.length} distinct {buildings.length === 1 ? 'building' : 'buildings'}. 
            {totalUnits > 0 && ` With a total of ${totalUnits} units across the development,`} {developmentName} offers 
            residents a vibrant community with shared amenities and convenient urban living.
          </p>

          {/* Buildings Section with Internal Links */}
          <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4">
            Buildings in {developmentName}
          </h3>
          <ul className="list-disc pl-6 mb-6 space-y-2">
            {buildings.map((building) => (
              <li key={building.slug} className="text-slate-700">
                <Link 
                  href={`/${building.slug}`} 
                  className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                >
                  {building.building_name}
                </Link>
                {' '}- {building.canonical_address}
                {building.total_units && ` (${building.total_units} units)`}
              </li>
            ))}
          </ul>

          <p className="text-slate-700 leading-relaxed mb-4">
            The development spans multiple addresses including {addresses}, providing excellent accessibility 
            and a variety of unit options to suit different lifestyles. From cozy studios to spacious 
            multi-bedroom units, {developmentName} caters to young professionals, families, and investors alike.
          </p>

          {/* Market Activity Section */}
          <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4">
            {developmentName} Market Activity
          </h3>
          {(totalForSale > 0 || totalForLease > 0) && (
            <p className="text-slate-700 leading-relaxed mb-4">
              Currently, {developmentName} has {totalForSale > 0 ? `${totalForSale} ${totalForSale === 1 ? 'unit' : 'units'} available for sale` : ''}
              {totalForSale > 0 && totalForLease > 0 ? ' and ' : ''}
              {totalForLease > 0 ? `${totalForLease} ${totalForLease === 1 ? 'unit' : 'units'} available for lease` : ''}.
              {totalTransactions > 0 && (
                <> The development has seen {totalSold} {totalSold === 1 ? 'sale' : 'sales'} and {totalLeased} {totalLeased === 1 ? 'lease' : 'leases'} recorded, demonstrating strong market activity and investor confidence.</>
              )}
            </p>
          )}

          <p className="text-slate-700 leading-relaxed mb-4">
            {developmentName} stands out in Toronto's competitive real estate market for its cohesive design, 
            shared amenities across buildings, and prime location. Residents enjoy easy access to public transit, 
            parks, restaurants, and all essential services. The development's modern architecture and 
            well-maintained common areas make it an attractive choice for both homeowners and investors.
          </p>

          {/* Individual Building Highlights */}
          <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4">
            Explore Each Building
          </h3>
          <p className="text-slate-700 leading-relaxed mb-4">
            Each building in {developmentName} offers unique features and floor plans. 
            {buildings.map((building, index) => (
              <span key={building.slug}>
                {index > 0 && (index === buildings.length - 1 ? ' and ' : ', ')}
                <Link 
                  href={`/${building.slug}`} 
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {building.building_name}
                </Link>
                {' '}at {building.canonical_address}
              </span>
            ))}
            {' '}{buildings.length === 1 ? 'provides' : 'each provide'} residents with modern living spaces and access to shared development amenities.
          </p>

          <p className="text-slate-700 leading-relaxed">
            Whether you're looking to buy, sell, or rent at {developmentName}, our team of experienced real estate 
            professionals can help you navigate the market and find the perfect unit to match your needs. 
            Contact us today for a free consultation and market analysis.
          </p>

          <div className="mt-8 pt-8 border-t border-slate-300">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">
              Keywords: {developmentName} Toronto Real Estate
            </h3>
            <p className="text-sm text-slate-600">
              {developmentName} condos for sale, {developmentName} units for rent,
              {buildings.map(b => ` ${b.building_name} Toronto,`)}
              {buildings.map(b => ` ${b.canonical_address} condos,`)}
              Toronto condo development, multi-building condo Toronto,
              {developmentName} amenities, Toronto condo market,
              buy condo {developmentName}, invest Toronto condos
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}