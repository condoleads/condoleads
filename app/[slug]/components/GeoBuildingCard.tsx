'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Building2 } from 'lucide-react'

interface GeoBuildingCardProps {
  building: {
    id: string
    building_name: string
    slug: string
    canonical_address: string
    cover_photo_url: string | null
    gallery_photos: string[]
    total_units: number | null
    year_built: number | null
    forSale: number
    forLease: number
  }
}

export default function GeoBuildingCard({ building }: GeoBuildingCardProps) {
  const photos = building.gallery_photos?.length > 0
    ? building.gallery_photos
    : building.cover_photo_url
      ? [building.cover_photo_url]
      : []

  const [idx, setIdx] = useState(0)
  const [hovered, setHovered] = useState(false)

  const prev = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIdx(i => (i === 0 ? photos.length - 1 : i - 1))
  }
  const next = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIdx(i => (i === photos.length - 1 ? 0 : i + 1))
  }

  const totalActive = building.forSale + building.forLease
  const href = '/' + building.slug

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl overflow-hidden border border-gray-200 bg-white hover:shadow-xl transition-all duration-300"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image / Carousel */}
      <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
        {photos.length > 0 ? (
          <>
            <img
              src={photos[idx]}
              alt={building.building_name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

            {/* Carousel arrows */}
            {photos.length > 1 && hovered && (
              <>
                <button
                  onClick={prev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-1.5 shadow-lg transition-all z-10"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-700" />
                </button>
                <button
                  onClick={next}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-1.5 shadow-lg transition-all z-10"
                  aria-label="Next photo"
                >
                  <ChevronRight className="w-4 h-4 text-gray-700" />
                </button>
              </>
            )}

            {/* Photo dots */}
            {photos.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                {photos.slice(0, 5).map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      i === idx ? 'bg-white scale-125' : 'bg-white/50'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            <Building2 className="w-14 h-14 text-slate-300" />
          </div>
        )}

        {/* Listing count badges */}
        {totalActive > 0 && (
          <div className="absolute top-3 left-3 flex gap-2 z-10">
            {building.forSale > 0 && (
              <span className="bg-green-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow-md">
                {building.forSale} For Sale
              </span>
            )}
            {building.forLease > 0 && (
              <span className="bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow-md">
                {building.forLease} For Lease
              </span>
            )}
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="p-4">
        <h3 className="font-bold text-gray-900 text-base group-hover:text-blue-600 transition-colors line-clamp-1">
          {building.building_name}
        </h3>
        <p className="text-sm text-gray-500 mt-1 line-clamp-1">{building.canonical_address}</p>
        <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
          {building.total_units && (
            <span className="flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              {building.total_units} units
            </span>
          )}
          {building.year_built && (
            <span>Built {building.year_built}</span>
          )}
          {totalActive === 0 && (
            <span className="text-gray-400 italic">No active listings</span>
          )}
        </div>
      </div>
    </a>
  )
}