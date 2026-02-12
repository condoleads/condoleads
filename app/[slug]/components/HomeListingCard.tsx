'use client'
import { useAuth } from '@/components/auth/AuthContext'
import RegisterModal from '@/components/auth/RegisterModal'
import Link from 'next/link'
import { MLSListing } from '@/lib/types/building'
import { formatPrice } from '@/lib/utils/formatters'
import { calculateDaysOnMarket } from '@/lib/utils/dom'
import { generatePropertySlug } from '@/lib/utils/slugs'
import { useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

// Home-specific property subtypes
const HOMES_SUBTYPES = [
  'Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link',
  'Duplex', 'Triplex', 'Fourplex', 'Multiplex'
]

// Sale/Lease color scheme
function getStatusStyle(transactionType: string, status: string) {
  const isSale = transactionType === 'For Sale'
  const isClosed = status === 'Closed'
  if (isSale && !isClosed) return { bg: 'bg-blue-600', text: 'For Sale', accent: 'border-blue-500', priceColor: 'text-white' }
  if (isSale && isClosed)  return { bg: 'bg-green-600', text: 'Sold', accent: 'border-green-500', priceColor: 'text-white' }
  if (!isSale && !isClosed) return { bg: 'bg-purple-600', text: 'For Lease', accent: 'border-purple-500', priceColor: 'text-white' }
  return { bg: 'bg-amber-600', text: 'Leased', accent: 'border-amber-500', priceColor: 'text-white' }
}

interface HomeListingCardProps {
  listing: MLSListing
  type: 'sale' | 'lease'
  agentId?: string
}

export default function HomeListingCard({ listing, type, agentId }: HomeListingCardProps) {
  const isSale = type === 'sale'
  const isClosed = listing.standard_status === 'Closed'
  const statusStyle = getStatusStyle(listing.transaction_type, listing.standard_status)

  // Photos
  const initialPhotos = listing.media?.filter(m => m.variant_type === 'thumbnail') || []
  const [photos, setPhotos] = useState(initialPhotos)
  const [allPhotosLoaded, setAllPhotosLoaded] = useState(false)
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)
  const [showRegister, setShowRegister] = useState(false)
  const { user } = useAuth()

  const shouldBlur = isClosed && !user

  // Load all photos on demand
  const loadAllPhotos = useCallback(async () => {
    if (allPhotosLoaded || loadingPhotos) return
    setLoadingPhotos(true)
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data } = await supabase
        .from('media')
        .select('id, media_url, variant_type, order_number, preferred_photo_yn')
        .eq('listing_id', listing.id)
        .eq('variant_type', 'thumbnail')
        .order('order_number', { ascending: true })
      if (data && data.length > 0) setPhotos(data)
      setAllPhotosLoaded(true)
    } catch (err) { console.error('Error loading photos:', err) }
    finally { setLoadingPhotos(false) }
  }, [listing.id, allPhotosLoaded, loadingPhotos])

  const nextPhoto = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (!allPhotosLoaded) loadAllPhotos()
    setCurrentPhotoIndex(prev => (prev + 1) % Math.max(photos.length, 1))
  }
  const prevPhoto = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (!allPhotosLoaded) loadAllPhotos()
    setCurrentPhotoIndex(prev => (prev - 1 + Math.max(photos.length, 1)) % Math.max(photos.length, 1))
  }

  // Display values
  const displayPrice = isClosed ? (listing.close_price || listing.list_price) : listing.list_price

  // Lot size display
  const lotDisplay = (() => {
    const w = listing.lot_width ? parseFloat(String(listing.lot_width)) : null
    const d = listing.lot_depth ? parseFloat(String(listing.lot_depth)) : null
    if (listing.lot_size_dimensions) return listing.lot_size_dimensions
    if (w && d) return `${w} × ${d} ft`
    if (listing.lot_size_area) return `${listing.lot_size_area} ${listing.lot_size_area_units || 'sqft'}`
    return null
  })()

  // Sqft display (homes often only have living_area_range)
  const sqftDisplay = (() => {
    if (listing.building_area_total) return `${listing.building_area_total.toLocaleString()} sqft`
    if (listing.square_foot_source) {
      const num = parseInt(listing.square_foot_source.replace(/[^\d]/g, ''))
      if (!isNaN(num) && num > 0) return `${num.toLocaleString()} sqft`
    }
    if (listing.living_area_range) return `${listing.living_area_range} sqft`
    return null
  })()

  // Basement display (JSONB array)
  const basementDisplay = (() => {
    if (!listing.basement) return null
    if (Array.isArray(listing.basement)) return listing.basement.join(', ')
    if (typeof listing.basement === 'string') return listing.basement
    return null
  })()

  // Architectural style (JSONB array)
  const styleDisplay = (() => {
    if (!listing.architectural_style) return listing.property_subtype || 'Home'
    if (Array.isArray(listing.architectural_style)) return listing.architectural_style[0] || listing.property_subtype
    return listing.property_subtype || 'Home'
  })()

  // Garage display
  const garageDisplay = listing.garage_type || (listing.garage_yn ? 'Yes' : null)

  // Days on market
  const dom = calculateDaysOnMarket(listing.days_on_market, listing.listing_contract_date, listing.standard_status)

  // Property slug for link
  const propertySlug = generatePropertySlug(listing)
  const propertyUrl = `/${propertySlug}`

  // Address (no unit number for most homes)
  const addressDisplay = listing.unparsed_address || 'Address Not Available'

  return (
    <>
      <Link href={propertyUrl} className={`group bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col border-l-4 ${statusStyle.accent}`}>
        {/* Photo Section */}
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
          {photos.length > 0 ? (
            <>
              <img
                src={photos[currentPhotoIndex]?.media_url}
                alt={addressDisplay}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
              {photos.length > 1 && (
                <>
                  <button onClick={prevPhoto} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">‹</button>
                  <button onClick={nextPhoto} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">›</button>
                  <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-1 z-20">
                    {photos.slice(0, 5).map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === currentPhotoIndex % 5 ? 'bg-white' : 'bg-white/50'}`} />
                    ))}
                  </div>
                </>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <svg className="w-16 h-16 mx-auto mb-2 opacity-60" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3L2 12h3v8h14v-8h3L12 3zm0 2.5L18 11v7h-2v-6h-8v6H6v-7l6-5.5zM10 14h4v4h-4v-4z"/>
                </svg>
                <p className="text-sm">Photos Coming Soon</p>
              </div>
            </div>
          )}

          {/* Status Badge */}
          <div className="absolute top-3 left-3 z-10">
            <span className={`px-3 py-1 ${statusStyle.bg} text-white text-xs font-bold rounded-full backdrop-blur-sm`}>
              {statusStyle.text}
            </span>
          </div>

          {/* Price */}
          <div className="absolute bottom-3 left-3 right-3 z-10">
            {!shouldBlur ? (
              <p className="text-2xl font-bold text-white">
                {formatPrice(displayPrice)}
                {!isSale && !isClosed && <span className="text-base font-normal">/mo</span>}
              </p>
            ) : (
              <div className="blur-sm">
                <p className="text-2xl font-bold text-white">{formatPrice(displayPrice)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col flex-grow">
          {shouldBlur ? (
            <div className="space-y-3">
              <div className="blur-sm">
                <h3 className="text-base font-bold text-slate-900 truncate">{addressDisplay}</h3>
                <p className="text-sm text-slate-600">{styleDisplay}</p>
              </div>
              <div className="pt-3 mt-auto">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRegister(true) }}
                  className={`w-full ${statusStyle.bg} hover:opacity-90 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors`}
                >
                  Register to See {isSale ? 'Sold' : 'Leased'} Details
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Address */}
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-bold text-slate-900 truncate">{addressDisplay}</h3>
              </div>
              <span className="inline-block text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded mb-1">{listing.property_subtype?.trim() || 'Home'}</span>

              {/* Row 1: Beds / Baths / Sqft */}
              <div className="flex items-center gap-2 text-sm text-slate-700 mb-1">
                <span className="font-semibold">{listing.bedrooms_total || 0}</span>
                <span className="text-slate-400">bed</span>
                <span className="text-slate-300">|</span>
                <span className="font-semibold">{Math.floor(parseFloat(String(listing.bathrooms_total_integer)) || 0)}</span>
                <span className="text-slate-400">bath</span>
                {sqftDisplay && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className="font-semibold">{sqftDisplay}</span>
                  </>
                )}
              </div>

              {/* Row 2: Frontage / Lot / Garage */}
              <div className="flex items-center gap-2 text-sm text-slate-700 mb-2">
                {listing.lot_width && parseFloat(String(listing.lot_width)) > 0 && (
                  <>
                    <span className="text-slate-400">Frontage:</span>
                    <span className="font-semibold">{parseFloat(String(listing.lot_width))}ft</span>
                  </>
                )}
                {lotDisplay && (
                  <>
                    {listing.lot_width && parseFloat(String(listing.lot_width)) > 0 && <span className="text-slate-300">|</span>}
                    <span className="text-slate-400">Lot:</span>
                    <span className="font-semibold">{lotDisplay}</span>
                  </>
                )}
                {garageDisplay && (
                  <>
                    {lotDisplay && <span className="text-slate-300">|</span>}
                    <span className="text-slate-400">Garage:</span>
                    <span className="font-semibold">{garageDisplay}</span>
                  </>
                )}
              </div>

              {/* Row 3: Style / Basement / Tax / DOM */}
              <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap mb-3">
                <span>{styleDisplay}</span>
                {basementDisplay && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span>Bsmt: {basementDisplay}</span>
                  </>
                )}
                {isSale && listing.tax_annual_amount && Number(listing.tax_annual_amount) > 0 && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span>${Math.round(Number(listing.tax_annual_amount)).toLocaleString()} tax</span>
                  </>
                )}
                {dom !== null && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span>{dom} days</span>
                  </>
                )}
              </div>

              {/* Footer: MLS# */}
              <div className="pt-3 border-t border-slate-100 mt-auto">
                <p className="text-xs text-slate-400">
                  {listing.listing_key ? `MLS® #${listing.listing_key}` : ''}
                </p>
              </div>
            </>
          )}
        </div>
      </Link>

      {showRegister && (
        <RegisterModal
          isOpen={showRegister}
          onClose={() => setShowRegister(false)}
          agentId={agentId || ''}
          registrationSource="home_listing_card"
        />
      )}
    </>
  )
}
