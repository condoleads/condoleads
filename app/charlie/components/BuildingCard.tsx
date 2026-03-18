// app/charlie/components/BuildingCard.tsx
'use client'

interface Props {
  building: {
    buildingName: string
    slug: string
    photo?: string
    medianPsf: number
    activeCount: number
    avgDom?: number | null
    saleToList?: number | null
  }
}

function domColor(dom: number): string {
  if (dom <= 21) return '#10b981'
  if (dom <= 45) return '#f59e0b'
  return '#ef4444'
}

export default function BuildingCard({ building: b }: Props) {
  return (
    <div
      onClick={() => window.open(`/${b.slug}`, '_blank')}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14, overflow: 'hidden',
        cursor: 'pointer', transition: 'border-color 0.15s',
        display: 'flex', gap: 0,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
    >
      {/* Photo */}
      <div style={{ width: 80, height: 80, flexShrink: 0, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' }}>
        {b.photo ? (
          <img src={b.photo} alt={b.buildingName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏢</div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {b.buildingName}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#3b82f6', marginBottom: 4 }}>
          ${b.medianPsf.toLocaleString('en-CA', { maximumFractionDigits: 0 })}/sqft
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          <span>{b.activeCount} active</span>
          {b.avgDom != null && (
            <span style={{ color: domColor(b.avgDom) }}>{Math.round(b.avgDom)}d DOM</span>
          )}
          {b.saleToList != null && (
            <span>{b.saleToList.toFixed(1)}% STL</span>
          )}
        </div>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18, flexShrink: 0, padding: '0 12px', display: 'flex', alignItems: 'center' }}>→</div>
    </div>
  )
}