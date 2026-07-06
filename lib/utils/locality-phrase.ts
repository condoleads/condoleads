// Shared "in {locality}" phrase builder for meta descriptions and SEO body copy.
//
// Extracted from BuildingPage.tsx (A-UNIT-3 EXT, 2026-07-05) so PropertySEO
// and BuildingPage share the same dedup logic instead of duplicating it.
// Same-class doubled-locality bug (e.g. "Collingwood in Collingwood",
// "Mississauga in Mississauga") is prevented at one source of truth.
//
// Rules:
//   1. Locality unknown/null/empty → return '' (never fabricate "in null" or
//      any hardcoded fallback).
//   2. Locality present AND already appears in the address/name string
//      (case-insensitive substring) → return '' (skip the phrase; the address
//      already conveys the locality).
//   3. Otherwise → return ` in ${locality}` with a leading space, ready to
//      append after the address.

export function buildLocalityPhrase(
  addressOrName: string | null | undefined,
  localityName: string | null | undefined,
): string {
  const trimmedLocality = (localityName || '').trim()
  if (trimmedLocality.length === 0) return ''
  if (!addressOrName) return ` in ${trimmedLocality}`
  const haystack = addressOrName.toLowerCase()
  const needle = trimmedLocality.toLowerCase()
  if (haystack.includes(needle)) return ''
  return ` in ${trimmedLocality}`
}
