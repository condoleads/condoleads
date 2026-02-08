'use client'

interface BuildingCardProps {
  building: {
    id: string
    building_name: string
    slug: string
    canonical_address: string
    cover_photo_url: string | null
    total_units: number | null
    year_built: number | null
  }
}

export default function BuildingCard({ building }: BuildingCardProps) {
  const href = '/' + building.slug

  return (
    <a
      href={href}
      target="_blank"
      className="group block border rounded-lg overflow-hidden hover:shadow-lg transition-all"
    >
      <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
        {building.cover_photo_url ? (
          <img
            src={building.cover_photo_url}
            alt={building.building_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 text-sm group-hover:text-blue-600 transition-colors truncate">
          {building.building_name}
        </h3>
        <p className="text-xs text-gray-500 mt-1 truncate">{building.canonical_address}</p>
        <div className="flex gap-3 mt-2 text-xs text-gray-500">
          {building.total_units && (
            <span>{building.total_units} units</span>
          )}
          {building.year_built && (
            <span>Built {building.year_built}</span>
          )}
        </div>
      </div>
    </a>
  )
}