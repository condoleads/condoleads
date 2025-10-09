interface PropertyAmenitiesProps {
  amenities: string[]
  feeIncludes: string[]
}

export default function PropertyAmenities({ amenities, feeIncludes }: PropertyAmenitiesProps) {
  if (amenities.length === 0 && feeIncludes.length === 0) return null

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Amenities</h2>
      
      {/* Building Amenities */}
      {amenities.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-3">Building Facilities</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {amenities.map((amenity, index) => (
              <div key={index} className="flex items-center gap-2 text-slate-700">
                <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm">{amenity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Included in Maintenance Fees */}
      {feeIncludes.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-3">Included in Maintenance Fees</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {feeIncludes.map((item, index) => (
              <div key={index} className="flex items-center gap-2 text-slate-700">
                <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}