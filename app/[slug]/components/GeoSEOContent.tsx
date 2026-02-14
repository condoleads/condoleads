'use client'

interface GeoSEOContentProps {
  geoName: string
  geoType: 'community' | 'municipality' | 'area'
  parentName?: string       // municipality name for communities, area name for municipalities
  buildingCount: number
  counts: { forSale: number; forLease: number; sold: number; leased: number }
}

export default function GeoSEOContent({
  geoName,
  geoType,
  parentName,
  buildingCount,
  counts,
}: GeoSEOContentProps) {
  const totalActive = counts.forSale + counts.forLease
  const totalClosed = counts.sold + counts.leased

  const locationContext = parentName
    ? `located in ${parentName}`
    : ''

  const paragraphs: string[] = []

  // Main description
  if (geoType === 'community') {
    paragraphs.push(
      `Explore ${totalActive > 0 ? totalActive.toLocaleString() : ''} ${totalActive > 0 ? 'active listings' : 'real estate opportunities'} in ${geoName}${locationContext ? ', ' + locationContext : ''}. ${buildingCount > 0 ? `Browse ${buildingCount} condo building${buildingCount > 1 ? 's' : ''}, ` : ''}${counts.forSale > 0 ? `compare ${counts.forSale.toLocaleString()} properties for sale` : 'find properties for sale'}${counts.forLease > 0 ? ` and ${counts.forLease.toLocaleString()} for lease` : ''}, and find your next home with detailed market data and price estimates.`
    )
  } else if (geoType === 'municipality') {
    paragraphs.push(
      `Discover real estate in ${geoName}${locationContext ? ', ' + locationContext : ''}. ${totalActive > 0 ? `With ${totalActive.toLocaleString()} active listings` : 'Browse condos and homes'}${buildingCount > 0 ? ` across ${buildingCount} condo buildings` : ''}, find condos, townhouses, and detached homes with comprehensive market intelligence, price history, and investment analysis.`
    )
  } else {
    paragraphs.push(
      `Browse all real estate listings in the ${geoName} area. ${totalActive > 0 ? `${totalActive.toLocaleString()} active listings available` : 'Explore condos and homes'} with detailed analytics, price trends, and neighbourhood comparisons to make informed real estate decisions.`
    )
  }

  // Market activity
  if (totalClosed > 0) {
    paragraphs.push(
      `${geoName} has seen ${totalClosed.toLocaleString()} completed transactions recently, with ${counts.sold.toLocaleString()} sold and ${counts.leased.toLocaleString()} leased properties providing rich comparable data for accurate valuations.`
    )
  }

  return (
    <section className="mt-12 border-t border-gray-200 pt-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        About {geoName} Real Estate
      </h2>
      <div className="prose prose-sm prose-gray max-w-none">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-gray-600 text-sm leading-relaxed mb-3">{p}</p>
        ))}
      </div>
    </section>
  )
}