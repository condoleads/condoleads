import { getAmenityIcon } from '@/lib/utils/calculations'

interface BuildingAmenitiesProps {
  amenities: string[]
  feeIncludes: string[]
}

// SVG Icon component
const AmenityIcon = ({ name }: { name: string }) => {
  const iconMap: { [key: string]: JSX.Element } = {
    'Concierge': (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    'Pool': (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    'Gym': (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    'Parking': (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
      </svg>
    ),
    'Rooftop': (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    'Party Room': (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    'Guest Suite': (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    'Default': (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  }

  const getIcon = (amenityName: string) => {
    const lower = amenityName.toLowerCase()
    if (lower.includes('concierge')) return iconMap['Concierge']
    if (lower.includes('pool')) return iconMap['Pool']
    if (lower.includes('gym') || lower.includes('exercise') || lower.includes('fitness')) return iconMap['Gym']
    if (lower.includes('parking')) return iconMap['Parking']
    if (lower.includes('rooftop') || lower.includes('deck')) return iconMap['Rooftop']
    if (lower.includes('party') || lower.includes('meeting')) return iconMap['Party Room']
    if (lower.includes('guest') || lower.includes('suite')) return iconMap['Guest Suite']
    return iconMap['Default']
  }

  return (
    <div className="text-cyan-500">
      {getIcon(name)}
    </div>
  )
}

export default function BuildingAmenities({ amenities, feeIncludes }: BuildingAmenitiesProps) {
  if (amenities.length === 0) return null

  return (
    <section className="max-w-7xl mx-auto px-6 mb-16">
      <h2 className="text-3xl font-bold text-slate-900 mb-8">Amenities</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {amenities.map((amenity, index) => (
          <div 
            key={index} 
            className="bg-white rounded-lg border border-slate-200 p-4 hover:border-cyan-500 hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center gap-3">
              <AmenityIcon name={amenity} />
              <span className="text-slate-700 font-medium text-sm">{amenity}</span>
            </div>
          </div>
        ))}
      </div>
      
      {feeIncludes.length > 0 && (
        <div className="mt-8 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-100">
          <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Maintenance Fee Includes:
          </h3>
          <div className="flex flex-wrap gap-2">
            {feeIncludes.map((item, index) => (
              <span 
                key={index} 
                className="px-3 py-1.5 bg-white rounded-full text-sm text-slate-700 border border-blue-100 shadow-sm"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
