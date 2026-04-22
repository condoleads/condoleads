// Plain-text wordmark for non-WALLiam tenants
// Used when the tenant has no uploaded logo AND is not WALLiam itself
// WALLiam uses the animated WalliamWordmark in SiteHeaderClient.tsx

interface BrandWordmarkProps {
  brand: string
  size?: 'sm' | 'md'
}

export default function BrandWordmark({ brand, size = 'md' }: BrandWordmarkProps) {
  const fontSize = size === 'sm' ? 15 : 20
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        lineHeight: 1,
        fontSize,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {brand}
    </span>
  )
}