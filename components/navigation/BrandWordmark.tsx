// Plain-text wordmark for non-WALLiam tenants
// Used when the tenant has no uploaded logo AND is not WALLiam itself
// WALLiam uses the animated WalliamWordmark in SiteHeaderClient.tsx

// C8b-2 -- 'hero' size added for homepage HeroWordmark fallback.
interface BrandWordmarkProps {
  brand: string
  size?: 'sm' | 'md' | 'hero'
}

export default function BrandWordmark({ brand, size = 'md' }: BrandWordmarkProps) {
  const isHero = size === 'hero'
  const fontSize = isHero ? 'clamp(52px, 10vw, 96px)' : (size === 'sm' ? 15 : 20)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        lineHeight: 1,
        fontSize,
        fontWeight: isHero ? 900 : 700,
        color: '#fff',
        letterSpacing: isHero ? '-0.03em' : '-0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {brand}
    </span>
  )
}