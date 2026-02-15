'use client'

interface HomePropertyInfoProps {
  listing: {
    lot_width?: string | null
    lot_depth?: string | null
    lot_size_dimensions?: string | null
    garage_type?: string | null
    basement?: string[] | null
    architectural_style?: string[] | null
    approximate_age?: string | null
    pool_features?: string[] | null
    cooling?: string[] | null
    fireplace_yn?: boolean | null
    property_subtype?: string | null
  }
}

export default function HomePropertyInfo({ listing }: HomePropertyInfoProps) {
  const lotWidth = listing.lot_width ? parseFloat(listing.lot_width) : null
  const lotDepth = listing.lot_depth ? parseFloat(listing.lot_depth) : null
  const lotSize = lotWidth && lotDepth
    ? `${lotWidth.toFixed(0)} × ${lotDepth.toFixed(0)} ft`
    : listing.lot_size_dimensions || null

  const basementText = listing.basement?.length
    ? listing.basement.filter(b => b && b !== 'None').join(', ')
    : null

  const styleText = listing.architectural_style?.[0] || null

  const poolText = listing.pool_features?.length
    ? listing.pool_features.filter(p => p && p !== 'None').join(', ')
    : null

  const coolingText = listing.cooling?.length
    ? listing.cooling.filter(c => c && c !== 'None').join(', ')
    : null

  const rows: { label: string; value: string }[] = []

  if (listing.property_subtype) rows.push({ label: 'Property Type', value: listing.property_subtype })
  if (styleText) rows.push({ label: 'Style', value: styleText })
  if (listing.approximate_age) rows.push({ label: 'Approx. Age', value: `${listing.approximate_age} years` })
  if (lotSize) rows.push({ label: 'Lot Size', value: lotSize })
  if (lotWidth) rows.push({ label: 'Frontage', value: `${lotWidth.toFixed(1)} ft` })
  if (lotDepth) rows.push({ label: 'Depth', value: `${lotDepth.toFixed(1)} ft` })
  if (listing.garage_type) rows.push({ label: 'Garage', value: listing.garage_type })
  if (basementText) rows.push({ label: 'Basement', value: basementText })
  if (coolingText) rows.push({ label: 'Cooling', value: coolingText })
  if (listing.fireplace_yn) rows.push({ label: 'Fireplace', value: 'Yes' })
  if (poolText) rows.push({ label: 'Pool', value: poolText })

  if (rows.length === 0) return null

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-2xl font-bold text-slate-900 mb-4">Property Details</h2>
      <div className="space-y-0">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-between py-3 border-b border-slate-100">
            <span className="text-slate-600">{row.label}</span>
            <span className="font-semibold text-slate-900 text-right">{row.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
