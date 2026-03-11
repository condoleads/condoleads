interface GeoStatPillProps {
  value: string | number
  label: string
}

export default function GeoStatPill({ value, label }: GeoStatPillProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl px-6 py-4 min-w-[100px]"
      style={{
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <span className="text-2xl md:text-3xl font-bold text-white tabular-nums leading-none tracking-tight">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      <span className="text-xs font-medium text-blue-200 mt-1.5 uppercase tracking-widest">
        {label}
      </span>
    </div>
  )
}
