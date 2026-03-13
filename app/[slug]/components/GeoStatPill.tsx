interface GeoStatPillProps {
  value: string | number
  label: string
}
export default function GeoStatPill({ value, label }: GeoStatPillProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '16px',
      padding: '12px 16px',
      width: 'calc(33% - 8px)',
      boxSizing: 'border-box',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#93c5fd', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
        {label}
      </span>
    </div>
  )
}