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
  accentColor?: string    // default tenants.primary_color / #1d4ed8 — prefix text+glow color
  // W-AILY-AIGLOW-FIX (2026-06-21): heartColor is separate from
  // accentColor so the heart can be a contrasting hue while the prefix
  // text + glow stay on-brand. Default = #ec4899 (rich pink) — the
  // "AI=blue mind, heart=pink alive" split. Tenant-overridable via prop.
  heartColor?: string
}

// Stable, scoped CSS — defined once per page (component dedup by browser
// when multiple instances mount; keyframe names use `aiglow-` prefix to
// avoid colliding with `walliam-heartbeat` or any other component).
// W-AILY-AIGLOW-FIX (2026-06-21): stronger trough→peak delta so the
// breath is visibly perceptible on the near-black hero (#060b18).
// Prior values were deliberately subtle ("premium") but read as
// static against the dark background — operator confirmed
// matchMedia(prefers-reduced-motion: reduce) === false, ruling out
// the reduced-motion fallback as the cause. Tightened cycle 2.4s →
// 1.9s so the swell is catchable; added a 1.5% scale breath synced
// to the glow so "ai" also gently widens at the peak. Still smooth
// ease-in-out — not a strobe.
const AIGLOW_KEYFRAMES = `
  @keyframes aiglow-pulse {
    0%, 100% {
      text-shadow:
        0 0 4px rgba(29, 78, 216, 0.30),
        0 0 12px rgba(29, 78, 216, 0.18);
      transform: scale(1);
    }
    50% {
      text-shadow:
        0 0 18px rgba(29, 78, 216, 1.0),
        0 0 42px rgba(29, 78, 216, 0.6),
        0 0 80px rgba(29, 78, 216, 0.32);
      transform: scale(1.015);
    }
  }
  @keyframes aiglow-heartbeat {
    0%, 60%, 100% { transform: translateX(-50%) scale(1); }
    15%           { transform: translateX(-50%) scale(1.5); }
    30%           { transform: translateX(-50%) scale(1.05); }
    45%           { transform: translateX(-50%) scale(1.35); }
  }
  @media (prefers-reduced-motion: reduce) {
    .aiglow-prefix {
      animation: none !important;
      text-shadow:
        0 0 12px rgba(29, 78, 216, 0.85),
        0 0 28px rgba(29, 78, 216, 0.45) !important;
      transform: scale(1) !important;
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
  heartColor = '#ec4899',
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
                  // W-AILY-AIGLOW-FIX (2026-06-21): heart fill = heartColor
                  // (separate from accentColor) — Aily renders pink heart on
                  // blue "ai". Was: color: accentColor (blue-on-blue, indistinct).
                  color: heartColor,
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
          // W-AILY-AIGLOW-FIX (2026-06-21): 2.4s → 1.9s. The slower 2.4s
          // breath read as static on the dark hero; tightening the
          // cycle makes the swell catchable. display:inline-block lets
          // the scale(1.015) breath at keyframe 50% apply without
          // disturbing baseline flow on flex children.
          display: 'inline-block',
          animation: 'aiglow-pulse 1.9s ease-in-out infinite',
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
