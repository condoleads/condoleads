// W-AILY-AIGLOW-WORDMARK (2026-06-21) — generic prefix-glow wordmark.
//
// Renders any brand string with the first N chars emphasized (color +
// glow-pulse) and the rest plain. If the prefix contains an "i", that
// "i" gets the heart-as-dot trick (dotless "ı" + heart above), beating
// in counterpoint to the glow.
//
// CONTRACT (C12 / MTB-DEF-1):
//   - This component is rendered ONLY when tenants.wordmark_style === 'aiglow'.
//   - It is NEVER gated by isHeroTenant() — the existing 14+ WalliamCTA /
//     WalliamAgentCard / WalliamContactForm gates that key on 'hero' are
//     UNCHANGED. The C12 brand-leak invariant is preserved by
//     construction: 'aiglow' affects ONLY the wordmark rendering.
//   - The brand text comes from tenants.brand_name. No per-tenant
//     hardcoding. Tenant #N with wordmark_style='aiglow' and
//     brand_name='whatever' renders "wh" emphasized + "atever" plain.
//
// Accessibility:
//   - prefers-reduced-motion: animations halt; glow becomes a solid
//     color; heart stays static. Still legible, still on-brand.
//
// Self-contained CSS: scoped @keyframes (prefixed with `aiglow-*`).

interface AiGlowWordmarkProps {
  brand: string
  size?: 'sm' | 'md' | 'hero'
  prefixLength?: number   // default 2 — for Aily="aily" → "ai" + "ly"
  accentColor?: string    // default tenants.primary_color / #1d4ed8
}

// Stable, scoped CSS — defined once per page (component dedup by browser
// when multiple instances mount; keyframe names use `aiglow-` prefix to
// avoid colliding with `walliam-heartbeat` or any other component).
const AIGLOW_KEYFRAMES = `
  @keyframes aiglow-pulse {
    0%, 100% {
      text-shadow:
        0 0 6px rgba(29, 78, 216, 0.45),
        0 0 18px rgba(29, 78, 216, 0.25);
    }
    50% {
      text-shadow:
        0 0 14px rgba(29, 78, 216, 0.85),
        0 0 36px rgba(29, 78, 216, 0.45),
        0 0 60px rgba(29, 78, 216, 0.2);
    }
  }
  @keyframes aiglow-heartbeat {
    0%, 60%, 100% { transform: translateX(-50%) scale(1); }
    15%           { transform: translateX(-50%) scale(1.45); }
    30%           { transform: translateX(-50%) scale(1.1); }
    45%           { transform: translateX(-50%) scale(1.3); }
  }
  @media (prefers-reduced-motion: reduce) {
    .aiglow-prefix {
      animation: none !important;
      text-shadow: 0 0 8px rgba(29, 78, 216, 0.6) !important;
    }
    .aiglow-heart {
      animation: none !important;
      transform: translateX(-50%) scale(1) !important;
    }
  }
`

export default function AiGlowWordmark({
  brand,
  size = 'md',
  prefixLength = 2,
  accentColor = '#1d4ed8',
}: AiGlowWordmarkProps) {
  // Defensive: if brand is shorter than the requested prefix, just use the
  // whole brand as prefix (no "rest" span).
  const effPrefixLen = Math.min(Math.max(prefixLength, 0), brand.length)
  const prefixRaw = brand.slice(0, effPrefixLen)
  const rest = brand.slice(effPrefixLen)

  // Size table — matches WalliamWordmark / BrandWordmark scales so the
  // 'aiglow' value is a drop-in replacement for the existing wordmark
  // surfaces.
  const isHero = size === 'hero'
  const baseFontSize = isHero
    ? 'clamp(52px, 10vw, 96px)'
    : (size === 'sm' ? 15 : 20)
  const baseFontWeight = isHero ? 900 : 700
  const baseLetterSpacing = isHero ? '-0.03em' : '-0.01em'
  const heartFontSize = isHero
    ? 'clamp(10px, 1.6vw, 18px)'
    : (size === 'sm' ? 6 : 8)
  const heartTopOffset = isHero ? '6%' : '-15%'

  // Heart-as-dot: if the prefix contains exactly one "i" (case-insensitive),
  // replace it with the dotless "ı" + a heart above. If the prefix has no
  // "i" or multiple "i"s, render the prefix verbatim with the pulse (no
  // heart trick — keeps the component honest for arbitrary brand strings).
  const lowerPrefix = prefixRaw.toLowerCase()
  const iIndices: number[] = []
  for (let i = 0; i < lowerPrefix.length; i++) {
    if (lowerPrefix[i] === 'i') iIndices.push(i)
  }
  const useHeartTrick = iIndices.length === 1

  const prefixContent = useHeartTrick
    ? (() => {
        const iIdx = iIndices[0]
        const before = prefixRaw.slice(0, iIdx)
        const after = prefixRaw.slice(iIdx + 1)
        return (
          <>
            {before}
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <span
                className="aiglow-heart"
                style={{
                  position: 'absolute',
                  top: heartTopOffset,
                  left: '50%',
                  transform: 'translateX(-50%) scale(1)',
                  fontSize: heartFontSize,
                  color: accentColor,
                  animation: 'aiglow-heartbeat 1.05s ease-in-out infinite',
                  display: 'block',
                  lineHeight: 1,
                }}
              >
                ♥
              </span>
              <span style={{ display: 'inline-block', lineHeight: 1 }}>{'ı'}</span>
            </span>
            {after}
          </>
        )
      })()
    : prefixRaw

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <style>{AIGLOW_KEYFRAMES}</style>
      <span
        className="aiglow-prefix"
        style={{
          fontSize: baseFontSize,
          fontWeight: baseFontWeight,
          color: accentColor,
          letterSpacing: baseLetterSpacing,
          animation: 'aiglow-pulse 2.4s ease-in-out infinite',
        }}
      >
        {prefixContent}
      </span>
      {rest && (
        <span
          style={{
            fontSize: baseFontSize,
            fontWeight: baseFontWeight,
            color: '#fff',
            letterSpacing: baseLetterSpacing,
          }}
        >
          {rest}
        </span>
      )}
    </span>
  )
}
