// W-FEATURED-CONDOS UNIT 53 (2026-06-30) — pure SVG sparkline for a building's
// price_trend_monthly array from geo_analytics. Server-renderable (no client JS).
// Shape per UNIT 53 shape probe: [{month: 'YYYY-MM', value: number, count: number}].
// `value` is avg PSF for the month. Renders nothing when the series is too short
// to be informative — per UNIT 53 data-confidence gate, only ~1 in 3 top buildings
// has populated trend data and we'd rather omit than fake.

interface TrendPoint {
  month: string
  value: number
  count?: number
}

interface SparklineProps {
  points: TrendPoint[]
  width?: number
  height?: number
  stroke?: string
}

const MIN_POINTS = 4

export default function Sparkline({
  points,
  width = 90,
  height = 22,
  stroke = 'rgba(255,255,255,0.55)',
}: SparklineProps) {
  if (!Array.isArray(points) || points.length < MIN_POINTS) return null

  const values = points
    .map(p => (typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null))
    .filter((v): v is number => v != null)

  if (values.length < MIN_POINTS) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const n = values.length

  const path = values
    .map((v, i) => {
      const x = (i / (n - 1)) * width
      const y = height - ((v - min) / range) * height
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const lastTrendUp = values[n - 1] >= values[0]
  const accent = lastTrendUp ? 'rgba(110,231,183,0.85)' : 'rgba(248,113,113,0.75)'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={((n - 1) / (n - 1)) * width}
        cy={height - ((values[n - 1] - min) / range) * height}
        r={2}
        fill={accent}
      />
    </svg>
  )
}
