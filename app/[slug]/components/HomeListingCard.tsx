'use client'
import { useAuth } from '@/components/auth/AuthContext'
import RegisterModal from '@/components/auth/RegisterModal'
import { MLSListing } from '@/lib/types/building'
import { formatPrice } from '@/lib/utils/formatters'
import { calculateDaysOnMarket } from '@/lib/utils/dom'
import { generateHomePropertySlug } from '@/lib/utils/slugs'
import { useState, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import HomeAddressHistoryModal from '@/components/property/HomeAddressHistoryModal'

const STYLES = `
@keyframes shimmer { 0% { background-position:-400px 0 } 100% { background-position:400px 0 } }
@keyframes fadeSlideUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
@keyframes pulseDot { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:.4; transform:scale(1.6) } }
@keyframes photoFade { from { opacity:0 } to { opacity:1 } }
`

function getStatusConfig(type: 'sale' | 'lease', isClosed: boolean) {
  if (type === 'sale' && !isClosed)  return { label: 'For Sale',  color: '#059669', rgb: '5,150,105'  }
  if (type === 'sale' && isClosed)   return { label: 'Sold',      color: '#e11d48', rgb: '225,29,72'  }
  if (type === 'lease' && !isClosed) return { label: 'For Lease', color: '#7c3aed', rgb: '124,58,237' }
  return                                    { label: 'Leased',    color: '#d97706', rgb: '217,119,6'  }
}

function getPropertyLabel(subtype: string | null | undefined): string {
  const s = (subtype || '').trim()
  const map: Record<string,string> = {
    'Detached': 'Detached', 'Att/Row/Townhouse': 'Townhouse',
    'Semi-Detached': 'Semi-Det', 'Semi-Detached ': 'Semi-Det',
    'Duplex': 'Duplex', 'Triplex': 'Triplex', 'Multiplex': 'Multiplex',
    'Fourplex': 'Fourplex', 'Link': 'Link', 'Vacant Land': 'Land',
    'Rural Residential': 'Rural', 'Farm': 'Farm', 'MobileTrailer': 'Mobile',
    'Modular Home': 'Modular', 'Upper Level': 'Upper', 'Lower Level': 'Lower',
    'Store W Apt/Office': 'Mixed Use',
  }
  return map[s] || (s.length > 12 ? s.slice(0,11)+'…' : s) || 'Home'
}

interface HomeListingCardProps {
  listing: MLSListing
  type: 'sale' | 'lease'
  onEstimateClick?: (exactSqft: number | null) => void
  agentId?: string
  priority?: boolean
  index?: number
}

export default function HomeListingCard({
  listing, type, onEstimateClick, agentId, priority = false, index = 0
}: HomeListingCardProps) {
  const isClosed = listing.standard_status === 'Closed'
  const status   = getStatusConfig(type, isClosed)
  const { user } = useAuth()
  const shouldBlur = isClosed && !user

  const initialPhotos = (() => {
    const raw  = listing.media?.filter(m => m.variant_type === 'thumbnail') || []
    const seen = new Set<string>()
    return raw
      .sort((a:any,b:any) => (a.order_number||999)-(b.order_number||999))
      .filter((m:any) => { if (seen.has(m.media_url)) return false; seen.add(m.media_url); return true })
  })()

  const [photos, setPhotos]             = useState(initialPhotos)
  const [allPhotosLoaded, setAllLoaded] = useState(false)
  const [loadingPhotos, setLoading]     = useState(false)
  const [idx, setIdx]                   = useState(0)
  const [imgKey, setImgKey]             = useState(0)
  const [isHovered, setIsHovered]       = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [showHistory, setShowHistory]   = useState(false)
  const [historyPending, setHistPending]= useState(false)
  const [bookVisitPending, setBookPend] = useState(false)
  const touchStartX = useRef(0)

  const loadAllPhotos = useCallback(async () => {
    if (allPhotosLoaded || loadingPhotos) return
    setLoading(true)
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data } = await sb.from('media')
        .select('id, media_url, variant_type, order_number, preferred_photo_yn')
        .eq('listing_id', listing.id).eq('variant_type', 'thumbnail')
        .order('order_number', { ascending: true })
      if (data?.length) {
        const seen = new Set<string>()
        setPhotos(data.filter((m:any) => { if (seen.has(m.media_url)) return false; seen.add(m.media_url); return true }))
      }
      setAllLoaded(true)
    } catch(e) { console.error(e) } finally { setLoading(false) }
  }, [listing.id, allPhotosLoaded, loadingPhotos])

  const go = useCallback(async (dir: 1|-1, e?: React.MouseEvent) => {
    e?.preventDefault(); e?.stopPropagation()
    if (!allPhotosLoaded) await loadAllPhotos()
    setIdx(i => { const n=(i+dir+Math.max(photos.length,1))%Math.max(photos.length,1); setImgKey(k=>k+1); return n })
  }, [allPhotosLoaded, loadAllPhotos, photos.length])

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd   = (e: React.TouchEvent) => { const d=touchStartX.current-e.changedTouches[0].clientX; if(Math.abs(d)>40) go(d>0?1:-1) }

  const displayPrice = isClosed ? (listing.close_price || listing.list_price) : listing.list_price
  const propertyUrl  = generateHomePropertySlug(listing)
  const dom          = calculateDaysOnMarket(listing.days_on_market, listing.listing_contract_date, listing.standard_status)
  const isNew        = dom !== null && dom <= 3
  const propLabel    = getPropertyLabel(listing.property_subtype)
  const totalDots    = Math.min(photos.length, 7)

  const shadowHover = `0 16px 40px rgba(${status.rgb},0.18), 0 4px 14px rgba(${status.rgb},0.12), 0 1px 3px rgba(0,0,0,0.06)`

  // Home-specific data
  const lotDisplay = (() => {
    const w = listing.lot_width ? parseFloat(String(listing.lot_width)) : null
    const d = listing.lot_depth ? parseFloat(String(listing.lot_depth)) : null
    if (listing.lot_size_dimensions) return listing.lot_size_dimensions
    if (w && d) return `${w} × ${d} ft`
    if (listing.lot_size_area) return `${listing.lot_size_area} ${listing.lot_size_area_units||'sqft'}`
    return null
  })()
  const sqftDisplay = (() => {
    if (listing.building_area_total) return listing.building_area_total.toLocaleString()
    if (listing.square_foot_source) { const n=parseInt(listing.square_foot_source.replace(/[^\d]/g,'')); if(!isNaN(n)&&n>0&&n<=20000) return n.toLocaleString() }
    if (listing.living_area_range) return listing.living_area_range
    return null
  })()
  const basementDisplay = (() => {
    if (!listing.basement) return null
    if (Array.isArray(listing.basement)) return listing.basement[0] || null
    return typeof listing.basement === 'string' ? listing.basement : null
  })()
  const garageDisplay = listing.garage_type || (listing.garage_yn ? 'Yes' : null)
  const styleDisplay  = (() => {
    if (Array.isArray(listing.architectural_style) && listing.architectural_style[0]) return listing.architectural_style[0]
    return null
  })()

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div style={{ animation:'fadeSlideUp 0.45s ease both', animationDelay:`${index*55}ms` }}>
        <article
          onClick={() => window.open(propertyUrl,'_blank')}
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
          onMouseEnter={() => { setIsHovered(true); if(!allPhotosLoaded) loadAllPhotos() }}
          onMouseLeave={() => setIsHovered(false)}
          className="relative bg-white cursor-pointer select-none"
          style={{
            borderRadius:16, overflow:'hidden',
            boxShadow: isHovered ? shadowHover : 'none',
            transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
            transition:'box-shadow 0.3s ease, transform 0.25s ease',
          }}
        >
          {/* IMAGE */}
          <div style={{ padding:'8px 8px 0 8px' }}>
            <div style={{ position:'relative', width:'100%', overflow:'hidden', borderRadius:12, aspectRatio:'3/2', background:'#e9eef4' }}>

              {photos.length === 0 && (
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,#e9eef4 25%,#f3f6f9 50%,#e9eef4 75%)', backgroundSize:'400px 100%', animation:'shimmer 1.4s ease-in-out infinite' }} />
              )}

              {photos.length > 0 && (
                <img key={imgKey} src={photos[idx]?.media_url}
                  alt={listing.unparsed_address||''}
                  style={{ width:'100%', height:'100%', objectFit:'cover', transform:isHovered?'scale(1.04)':'scale(1)', transition:'transform 0.6s ease', filter:shouldBlur?'blur(16px)':'none', animation:'photoFade 0.3s ease' }}
                  loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'}
                  onError={e => { (e.target as HTMLImageElement).style.display='none' }}
                />
              )}

              <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'linear-gradient(to bottom,rgba(0,0,0,0.08) 0%,transparent 30%,transparent 60%,rgba(0,0,0,0.07) 100%)' }} />

              {/* Property type badge — top left */}
              <div style={{ position:'absolute', top:10, left:10, zIndex:10, display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ background:'rgba(255,255,255,0.82)', backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)', color:'#0f172a', fontSize:11, fontWeight:700, letterSpacing:'0.02em', padding:'4px 10px', borderRadius:99, boxShadow:'0 1px 4px rgba(0,0,0,0.12)' }}>
                  {propLabel}
                </span>
                {isNew && !isClosed && (
                  <span style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)', padding:'4px 8px', borderRadius:99, border:'1px solid rgba(255,255,255,0.15)' }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:'#4ade80', display:'inline-block', animation:'pulseDot 1.6s ease-in-out infinite' }} />
                    <span style={{ fontSize:10, fontWeight:700, color:'#4ade80', letterSpacing:'0.05em' }}>NEW</span>
                  </span>
                )}
              </div>

              {/* DOM — top right */}
              {dom !== null && (
                <div style={{ position:'absolute', top:10, right:10, zIndex:10 }}>
                  <span style={{ background:'rgba(15,23,42,0.55)', backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)', color:'rgba(255,255,255,0.85)', fontSize:10, fontWeight:600, padding:'4px 9px', borderRadius:99, border:'1px solid rgba(255,255,255,0.18)' }}>
                    {dom}d
                  </span>
                </div>
              )}

              {/* Arrows */}
              {photos.length > 1 && !shouldBlur && (
                <>
                  <button onClick={e=>go(-1,e)} aria-label="Previous" style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', zIndex:20, width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,0.96)', boxShadow:'0 2px 10px rgba(0,0,0,0.2)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:isHovered?1:0, transition:'opacity 0.2s ease', pointerEvents:isHovered?'auto':'none' }}>
                    <svg width="11" height="11" fill="none" stroke="#0f172a" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <button onClick={e=>go(1,e)} aria-label="Next" style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', zIndex:20, width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,0.96)', boxShadow:'0 2px 10px rgba(0,0,0,0.2)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:isHovered?1:0, transition:'opacity 0.2s ease', pointerEvents:isHovered?'auto':'none' }}>
                    <svg width="11" height="11" fill="none" stroke="#0f172a" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                  </button>
                </>
              )}

              {/* Dots */}
              {totalDots > 1 && !shouldBlur && (
                <div style={{ position:'absolute', bottom:9, left:0, right:0, display:'flex', justifyContent:'center', gap:5, zIndex:10, pointerEvents:'none' }}>
                  {Array.from({length:totalDots}).map((_,i) => (
                    <span key={i} style={{ display:'block', width:i===idx?8:6, height:i===idx?8:6, borderRadius:'50%', background:i===idx?'#fff':'rgba(255,255,255,0.5)', boxShadow:'0 1px 4px rgba(0,0,0,0.5)', transition:'all 0.25s ease', flexShrink:0 }} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CONTENT */}
          <div style={{ padding:'13px 14px 14px' }}>
            {shouldBlur ? (
              <>
                <div style={{ filter:'blur(6px)', marginBottom:12 }}>
                  <p style={{ fontSize:21, fontWeight:800, color:'#0f172a', margin:'0 0 4px', letterSpacing:'-0.03em' }}>{formatPrice(displayPrice)}</p>
                  <p style={{ fontSize:13, color:'#64748b', margin:0 }}>{listing.unparsed_address}</p>
                </div>
                <button onClick={e=>{e.preventDefault();e.stopPropagation();setShowRegister(true)}}
                  style={{ width:'100%', padding:'10px', borderRadius:10, background:status.color, color:'#fff', fontSize:13, fontWeight:700, border:'none', cursor:'pointer' }}>
                  Register to View {type==='sale'?'Sold':'Leased'} Details
                </button>
              </>
            ) : (
              <>
                {/* Price + status */}
                <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:5, marginBottom:4, paddingLeft:9, borderLeft:`3px solid ${status.color}` }}>
                  <div style={{ display:'flex', alignItems:'baseline', gap:5 }}>
                    <p style={{ fontSize:21, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:'-0.03em', lineHeight:1.15 }}>{formatPrice(displayPrice)}</p>
                    {type==='lease' && !isClosed && <span style={{ fontSize:12, color:'#94a3b8', fontWeight:500 }}>/mo</span>}
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, color:status.color, background:`rgba(${status.rgb},0.08)`, border:`1px solid rgba(${status.rgb},0.25)`, padding:'2px 8px', borderRadius:99, letterSpacing:'0.03em', whiteSpace:'nowrap', flexShrink:0 }}>
                    {status.label}
                  </span>
                </div>

                {/* Address */}
                <p style={{ fontSize:13, fontWeight:600, color:'#0f172a', margin:'0 0 6px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {listing.unparsed_address || 'Address Not Available'}
                </p>

                {/* Stats row 1 — beds/baths/sqft */}
                <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:5, flexWrap:'wrap' }}>
                  {[
                    { val:`${listing.bedrooms_total||0}`, label:'bed' },
                    { val:`${listing.bathrooms_total_integer||0}`, label:'bath' },
                    ...(sqftDisplay ? [{ val:sqftDisplay, label:'sf' }] : []),
                  ].map((s,i) => (
                    <span key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
                      {i>0 && <span style={{ color:'#e2e8f0', fontSize:11 }}>·</span>}
                      <span style={{ fontSize:12, color:'#334155' }}>
                        <strong style={{ fontWeight:700 }}>{s.val}</strong>
                        <span style={{ color:'#94a3b8', marginLeft:2 }}>{s.label}</span>
                      </span>
                    </span>
                  ))}
                </div>

                {/* Stats row 2 — lot/frontage/garage */}
                {(listing.lot_width || lotDisplay || garageDisplay) && (
                  <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:5, flexWrap:'wrap' }}>
                    {listing.lot_width && parseFloat(String(listing.lot_width)) > 0 && (
                      <span style={{ fontSize:12, color:'#64748b' }}>
                        <span style={{ color:'#94a3b8' }}>Frontage </span>
                        <strong style={{ fontWeight:600, color:'#334155' }}>{parseFloat(String(listing.lot_width))}ft</strong>
                      </span>
                    )}
                    {lotDisplay && (
                      <>
                        {listing.lot_width && <span style={{ color:'#e2e8f0', fontSize:11 }}>·</span>}
                        <span style={{ fontSize:12, color:'#64748b' }}>
                          <span style={{ color:'#94a3b8' }}>Lot </span>
                          <strong style={{ fontWeight:600, color:'#334155' }}>{lotDisplay}</strong>
                        </span>
                      </>
                    )}
                    {garageDisplay && (
                      <>
                        {(lotDisplay || listing.lot_width) && <span style={{ color:'#e2e8f0', fontSize:11 }}>·</span>}
                        <span style={{ fontSize:12, color:'#64748b' }}>
                          <span style={{ color:'#94a3b8' }}>Garage </span>
                          <strong style={{ fontWeight:600, color:'#334155' }}>{garageDisplay}</strong>
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Stats row 3 — style/basement/tax */}
                <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:10, flexWrap:'wrap' }}>
                  {styleDisplay && <span style={{ fontSize:11, color:'#94a3b8' }}>{styleDisplay}</span>}
                  {basementDisplay && (
                    <>
                      {styleDisplay && <span style={{ color:'#e2e8f0', fontSize:11 }}>·</span>}
                      <span style={{ fontSize:11, color:'#94a3b8' }}>Bsmt: {basementDisplay}</span>
                    </>
                  )}
                  {type==='sale' && listing.tax_annual_amount && Number(listing.tax_annual_amount) > 0 && (
                    <>
                      {(styleDisplay||basementDisplay) && <span style={{ color:'#e2e8f0', fontSize:11 }}>·</span>}
                      <span style={{ fontSize:11, color:'#94a3b8' }}>${Math.round(Number(listing.tax_annual_amount)).toLocaleString()} tax</span>
                    </>
                  )}
                </div>

                {/* Action pills */}
                <div style={{ display:'flex', gap:7, borderTop:'1px solid #f1f5f9', paddingTop:11 }}>
                  {!isClosed && (
                    <ActionPill onClick={e=>{e.preventDefault();e.stopPropagation();if(!user)setShowRegister(true);else onEstimateClick?.(null)}}
                      color={status.color} rgb={status.rgb} variant="accent"
                      icon={<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
                      label={type==='sale'?'Sale Offer':'Lease Offer'}
                    />
                  )}
                  {!isClosed && (
                    <ActionPill onClick={e=>{e.preventDefault();e.stopPropagation();if(!user){setBookPend(true);setShowRegister(true)}else window.open(propertyUrl,'_blank')}}
                      variant="ghost"
                      icon={<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
                      label="Book a Visit"
                    />
                  )}
                  <ActionPill onClick={e=>{e.preventDefault();e.stopPropagation();if(!user){setHistPending(true);setShowRegister(true)}else setShowHistory(true)}}
                    variant="ghost"
                    icon={<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                    label="History"
                  />
                </div>
              </>
            )}
          </div>
        </article>
      </div>

      <RegisterModal
        isOpen={showRegister}
        onClose={() => { setShowRegister(false); setHistPending(false); setBookPend(false) }}
        onSuccess={() => {
          setShowRegister(false)
          if (historyPending) { setHistPending(false); setShowHistory(true) }
          if (bookVisitPending) { setBookPend(false); window.open(propertyUrl,'_blank') }
        }}
        registrationSource="home_listing_card"
        agentId={agentId||''}
      />
      <HomeAddressHistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        address={listing.unparsed_address||''}
        currentListingId={listing.id}
        agentId={agentId}
      />
    </>
  )
}

function ActionPill({ onClick, icon, label, variant, color, rgb }: {
  onClick: (e: React.MouseEvent) => void
  icon: React.ReactNode; label: string
  variant: 'accent'|'ghost'; color?: string; rgb?: string
}) {
  const [hov, setHov] = useState(false)
  const s: React.CSSProperties = variant==='accent'
    ? { flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'7px 8px', borderRadius:9, fontSize:11.5, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', letterSpacing:'0.01em', border:`1.5px solid rgba(${rgb},${hov?0.45:0.28})`, background:hov?`rgba(${rgb},0.1)`:`rgba(${rgb},0.06)`, color, transition:'all 0.15s' }
    : { flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'7px 8px', borderRadius:9, fontSize:11.5, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', letterSpacing:'0.01em', border:'1.5px solid #e9eef4', background:hov?'#f1f5f9':'#f8fafc', color:hov?'#334155':'#64748b', transition:'all 0.15s' }
  return <button onClick={onClick} style={s} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>{icon}{label}</button>
}