// app/[slug]/components/BuildingSchema.tsx
import { Building, MLSListing } from '@/lib/types/building'

interface BuildingSchemaProps {
  building: Building
  activeSales: MLSListing[]
  activeRentals: MLSListing[]
  avgPrice: number
}

export default function BuildingSchema({ building, activeSales, activeRentals, avgPrice }: BuildingSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ApartmentComplex",
    "name": building.building_name,
    "address": {
      "@type": "PostalAddress",
      "streetAddress": building.canonical_address,
      "addressLocality": "Toronto",
      "addressRegion": "ON",
      "addressCountry": "CA"
    },
    "geo": building.latitude && building.longitude ? {
      "@type": "GeoCoordinates",
      "latitude": building.latitude,
      "longitude": building.longitude
    } : undefined,
    "numberOfUnits": building.total_units,
    "yearBuilt": building.year_built,
    "offers": activeSales.length > 0 ? {
      "@type": "AggregateOffer",
      "priceCurrency": "CAD",
      "lowPrice": Math.min(...activeSales.map(l => l.list_price)),
      "highPrice": Math.max(...activeSales.map(l => l.list_price)),
      "offerCount": activeSales.length
    } : undefined
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}