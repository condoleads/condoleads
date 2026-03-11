'use client'
import { useState } from 'react'
import { Building2 } from 'lucide-react'

const STYLES = `
@keyframes fadeSlideUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
@keyframes shimmer { 0% { background-position:-400px 0 } 100% { background-position:400px 0 } }
`

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
  index?: number
}

export default function GeoBuildingCard({ building, index = 0 }: GeoBuildingCardProps) {
  const photos = building.gallery_photos?.length > 0
    ? building.gallery_photos
    : building.cover_photo_url ? [building.cover_photo_url] : []

  const [idx, setIdx]           = useState(0)
  const [isHovered, setHovered] = useState(false)
  const totalActive             = building.forSale + building.forLease
  const href                    = '/' + building.slug

  // Ambient shadow — green tint if has active listings, neutral otherwise
  const hasActive    = totalActive > 0
  const shadowHover  = hasActive
    ? '0 16px 40px rgba(5,150,105,0.16), 0 4px 14px rgba(5,150,105,0.1), 0 1px 3px rgba(0,0,0,0.06)'
    : '0 16px 40px rgba(0,0,0,0.12), 0 4px 14px rgba(0,0,0,0.08)'

  const prev = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setIdx(i => i===0?photos.length-1:i-1) }
  const next = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setIdx(i => i===photos.length-1?0:i+1) }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div style={{ animation:'fadeSlideUp 0.45s ease both', animationDelay:`${index*55}ms` }}>
        <a
          href={href} target="_blank" rel="noopener noreferrer"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="block bg-white select-none"
          style={{
            borderRadius:16, overflow:'hidden', textDecoration:'none',
            boxShadow: isHovered ? shadowHover : 'none',
            transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
            transition:'box-shadow 0.3s ease, transform 0.25s ease',
          }}
        >
          {/* IMAGE */}
          <div style={{ padding:'8px 8px 0 8px' }}>
            <div style={{ position:'relative', width:'100%', overflow:'hidden', borderRadius:12, aspectRatio:'3/2', background:'#e9eef4' }}>

              {photos.length === 0 && (
                <>
                  <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,#e9eef4 25%,#f3f6f9 50%,#e9eef4 75%)', backgroundSize:'400px 100%', animation:'shimmer 1.4s ease-in-out infinite' }} />
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Building2 style={{ width:40, height:40, color:'#cbd5e1' }} />
                  </div>
                </>
              )}

              {photos.length > 0 && (
                <img
                  src={photos[idx]} alt={building.building_name}
                  style={{ width:'100%', height:'100%', objectFit:'cover', transform:isHovered?'scale(1.04)':'scale(1)', transition:'transform 0.6s ease' }}
                  loading="lazy"
                  onError={e => { (e.target as HTMLImageElement).style.display='none' }}
                />
              )}

              {/* Subtle vignette */}
              <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'linear-gradient(to bottom,rgba(0,0,0,0.06) 0%,transparent 35%,transparent 65%,rgba(0,0,0,0.18) 100%)' }} />

              {/* Listing count badges — top left, frosted */}
              {totalActive > 0 && (
                <div style={{ position:'absolute', top:10, left:10, zIndex:10, display:'flex', gap:6 }}>
                  {building.forSale > 0 && (
                    <span style={{ background:'rgba(5,150,105,0.85)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', color:'#fff', fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99, border:'1px solid rgba(255,255,255,0.2)' }}>
                      {building.forSale} For Sale
                    </span>
                  )}
                  {building.forLease > 0 && (
                    <span style={{ background:'rgba(124,58,237,0.85)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', color:'#fff', fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99, border:'1px solid rgba(255,255,255,0.2)' }}>
                      {building.forLease} For Lease
                    </span>
                  )}
                </div>
              )}

              {/* No active listings badge */}
              {totalActive === 0 && (
                <div style={{ position:'absolute', top:10, left:10, zIndex:10 }}>
                  <span style={{ background:'rgba(15,23,42,0.55)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', color:'rgba(255,255,255,0.7)', fontSize:10, fontWeight:600, padding:'4px 10px', borderRadius:99, border:'1px solid rgba(255,255,255,0.15)' }}>
                    No active listings
                  </span>
                </div>
              )}

              {/* Carousel arrows */}
              {photos.length > 1 && (
                <>
                  <button onClick={prev} aria-label="Previous" style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', zIndex:20, width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,0.96)', boxShadow:'0 2px 10px rgba(0,0,0,0.2)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:isHovered?1:0, transition:'opacity 0.2s ease', pointerEvents:isHovered?'auto':'none' }}>
                    <svg width="11" height="11" fill="none" stroke="#0f172a" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <button onClick={next} aria-label="Next" style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', zIndex:20, width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,0.96)', boxShadow:'0 2px 10px rgba(0,0,0,0.2)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:isHovered?1:0, transition:'opacity 0.2s ease', pointerEvents:isHovered?'auto':'none' }}>
                    <svg width="11" height="11" fill="none" stroke="#0f172a" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                  </button>
                </>
              )}

              {/* Dots */}
              {photos.length > 1 && (
                <div style={{ position:'absolute', bottom:9, left:0, right:0, display:'flex', justifyContent:'center', gap:5, zIndex:10, pointerEvents:'none' }}>
                  {photos.slice(0,7).map((_,i) => (
                    <span key={i} style={{ display:'block', width:i===idx?8:6, height:i===idx?8:6, borderRadius:'50%', background:i===idx?'#fff':'rgba(255,255,255,0.5)', boxShadow:'0 1px 4px rgba(0,0,0,0.5)', transition:'all 0.25s ease', flexShrink:0 }} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CONTENT */}
          <div style={{ padding:'13px 14px 14px' }}>
            {/* Building name */}
            <p style={{ fontSize:15, fontWeight:700, color: isHovered?'#059669':'#0f172a', margin:'0 0 3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', transition:'color 0.2s ease' }}>
              {building.building_name}
            </p>

            {/* Address */}
            <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 10px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {building.canonical_address}
            </p>

            {/* Meta row */}
            <div style={{ display:'flex', alignItems:'center', gap:5, paddingTop:10, borderTop:'1px solid #f1f5f9' }}>
              {building.total_units && (
                <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'#64748b' }}>
                  <Building2 style={{ width:13, height:13, color:'#94a3b8' }} />
                  <strong style={{ fontWeight:600, color:'#334155' }}>{building.total_units}</strong>
                  <span style={{ color:'#94a3b8' }}>units</span>
                </span>
              )}
              {building.total_units && building.year_built && (
                <span style={{ color:'#e2e8f0', fontSize:11 }}>·</span>
              )}
              {building.year_built && (
                <span style={{ fontSize:12, color:'#64748b' }}>
                  <span style={{ color:'#94a3b8' }}>Built </span>
                  <strong style={{ fontWeight:600, color:'#334155' }}>{building.year_built}</strong>
                </span>
              )}
              {/* Active count pill */}
              {totalActive > 0 && (
                <span style={{ marginLeft:'auto', fontSize:11, fontWeight:700, color:'#059669', background:'rgba(5,150,105,0.08)', border:'1px solid rgba(5,150,105,0.2)', padding:'2px 8px', borderRadius:99 }}>
                  {totalActive} active
                </span>
              )}
            </div>
          </div>
        </a>
      </div>
    </>
  )
}