// scripts/test-c8b-2-multitenant-regression.js
// C8b-2 regression gate — D13 (hero subset) retired + multi-tenant-correct
// data-driven hero gating locked.
//
// W-C12-BASELINE UNIT 39 (2026-06-28): rewritten from the original
// `WALLIAM_TENANT_ID === tenantId` id-based assertions (which became
// stale when MTB-DEF-1 refactored HomePageComprehensiveClient.tsx +
// V2 to a data-driven `wordmarkStyle !== 'hero'` gate). The new
// assertions guard the CURRENT pattern: assert the OLD hardcoded-tenant
// pattern is ABSENT (no `WALLIAM_TENANT_ID` constant, no id-based
// gate, no id-based callsites), and assert the NEW data-driven pattern
// is PRESENT (`wordmarkStyle` is the gate's input; the WALLiam UUID
// literal never appears in these client files).
//
// Static assertions only — no network, no DB. Run from project root:
//   node scripts/test-c8b-2-multitenant-regression.js
// Exit 0 on all-pass; exit 1 on any fail.
//
// IF SOMEONE reintroduces a hardcoded-tenant shortcut (e.g. someone
// pastes WALLIAM_TENANT_ID back into either client to gate a hero
// variant), THIS TEST FAILS — that's the regression guard.

const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()
let failures = 0
let passes = 0

function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8') }

function assertMatch(rel, pattern, label) {
  const content = readFile(rel)
  if (pattern.test(content)) {
    console.log('PASS [' + label + '] ' + rel)
    passes++
  } else {
    console.error('FAIL [' + label + '] ' + rel + ' -- pattern not found: ' + pattern)
    failures++
  }
}

function assertContains(rel, needle, label) {
  const content = readFile(rel)
  if (content.includes(needle)) {
    console.log('PASS [' + label + '] ' + rel)
    passes++
  } else {
    console.error('FAIL [' + label + '] ' + rel + ' -- needle not found:\n' + needle)
    failures++
  }
}

function assertNoMatch(rel, pattern, label) {
  const content = readFile(rel)
  const m = content.match(pattern)
  if (m) {
    console.error('FAIL [' + label + '] ' + rel + ' -- forbidden pattern found: ' + m[0])
    failures++
  } else {
    console.log('PASS [' + label + '] ' + rel + ' -- pattern absent')
    passes++
  }
}

function assertNotContains(rel, needle, label) {
  const content = readFile(rel)
  if (content.includes(needle)) {
    console.error('FAIL [' + label + '] ' + rel + ' -- forbidden needle present:\n' + needle)
    failures++
  } else {
    console.log('PASS [' + label + '] ' + rel + ' -- needle absent')
    passes++
  }
}

console.log('\n=== C8b-2 regression gate (rewritten UNIT 39 for data-driven multi-tenant pattern) ===\n')

// ---------- BrandWordmark.tsx ----------
// W-C12-BASELINE UNIT 39: relaxed the size-type regex so additional
// variants (e.g. 'lg', added after the original test) don't break the
// gate. The intent of this assertion is "the 'hero' variant is in the
// type union" — let the union grow without rewriting the test each time.
assertMatch(
  'components/navigation/BrandWordmark.tsx',
  /size\?:\s*'sm'[\s\S]*?'hero'/,
  'BrandWordmark-hero-size-in-type'
)
assertContains(
  'components/navigation/BrandWordmark.tsx',
  "const isHero = size === 'hero'",
  'BrandWordmark-hero-branch'
)
assertContains(
  'components/navigation/BrandWordmark.tsx',
  "'clamp(52px, 10vw, 96px)'",
  'BrandWordmark-hero-fontsize'
)

// ---------- V1 server wrapper (unchanged from original test) ----------
assertContains(
  'components/HomePageComprehensive.tsx',
  'tenantId={tenantContext?.id ?? null}',
  'V1-wrapper-passes-tenantId'
)
assertContains(
  'components/HomePageComprehensive.tsx',
  'brandName={tenantContext?.name ?? null}',
  'V1-wrapper-passes-brandName'
)

// ---------- V2 server wrapper (unchanged from original test) ----------
assertContains(
  'components/HomePageComprehensiveV2.tsx',
  'tenantId={tenantContext?.id ?? null}',
  'V2-wrapper-passes-tenantId'
)
assertContains(
  'components/HomePageComprehensiveV2.tsx',
  'brandName={tenantContext?.name ?? null}',
  'V2-wrapper-passes-brandName'
)

// ====================================================================
// V1 client — DATA-DRIVEN multi-tenant pattern (post-MTB-DEF-1)
// ====================================================================
//
// Assertions split into two halves:
//   (a) NEGATIVE — the old hardcoded-tenant shortcuts are ABSENT
//   (b) POSITIVE — the new data-driven `wordmarkStyle` gate is PRESENT
//
// If either set fires a FAIL, the hero render is back to the id-based
// shortcut that fails multi-tenant onboarding without a code edit.

// (a) NEGATIVE — hardcoded shortcuts must NOT exist
assertNotContains(
  'components/HomePageComprehensiveClient.tsx',
  "const WALLIAM_TENANT_ID =",
  'V1-no-WALLIAM_TENANT_ID-constant (multi-tenant: data-driven gate replaces hardcoded UUID)'
)
assertNotContains(
  'components/HomePageComprehensiveClient.tsx',
  'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
  'V1-no-WALLiam-UUID-literal'
)
assertNotContains(
  'components/HomePageComprehensiveClient.tsx',
  'tenantId !== WALLIAM_TENANT_ID',
  'V1-no-id-based-tenant-gate'
)
assertNoMatch(
  'components/HomePageComprehensiveClient.tsx',
  /<HeroWordmark\s+tenantId=\{/,
  'V1-no-id-based-HeroWordmark-callsite'
)
assertNoMatch(
  'components/HomePageComprehensiveClient.tsx',
  /<WalliamHero\s+tenantId=\{/,
  'V1-no-id-based-WalliamHero-callsite'
)
assertNoMatch(
  'components/HomePageComprehensiveClient.tsx',
  /function HeroWordmark\(\{\s*tenantId\b/,
  'V1-no-id-based-HeroWordmark-signature'
)
assertNoMatch(
  'components/HomePageComprehensiveClient.tsx',
  /function WalliamHero\(\{\s*tenantId\b/,
  'V1-no-id-based-WalliamHero-signature'
)

// (b) POSITIVE — data-driven gate present
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  "import BrandWordmark from './navigation/BrandWordmark'",
  'V1-imports-BrandWordmark'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  'function HeroWordmark({ wordmarkStyle, brandName }',
  'V1-HeroWordmark-data-driven-signature (receives wordmarkStyle, not tenantId)'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  "if (wordmarkStyle !== 'hero')",
  'V1-HeroWordmark-data-driven-gate (wordmarkStyle, not tenantId === UUID)'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  '<BrandWordmark brand={brandName ?? \'Brand\'} size="hero" />',
  'V1-HeroWordmark-fallback-BrandWordmark-hero'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  'function WalliamHero({ wordmarkStyle,',
  'V1-WalliamHero-data-driven-signature'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  '<WalliamHero wordmarkStyle={wordmarkStyle}',
  'V1-WalliamHero-callsite-data-driven'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  '<HeroWordmark wordmarkStyle={wordmarkStyle}',
  'V1-HeroWordmark-callsite-data-driven'
)
assertMatch(
  'components/HomePageComprehensiveClient.tsx',
  /export default function HomePageComprehensiveClient\(\{[\s\S]{0,500}wordmarkStyle/,
  'V1-default-export-destructures-wordmarkStyle'
)

// ====================================================================
// V2 client — DATA-DRIVEN multi-tenant pattern (post-MTB-DEF-1)
// ====================================================================

// (a) NEGATIVE
assertNotContains(
  'components/HomePageComprehensiveClientV2.tsx',
  "const WALLIAM_TENANT_ID =",
  'V2-no-WALLIAM_TENANT_ID-constant'
)
assertNotContains(
  'components/HomePageComprehensiveClientV2.tsx',
  'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
  'V2-no-WALLiam-UUID-literal'
)
assertNotContains(
  'components/HomePageComprehensiveClientV2.tsx',
  'tenantId !== WALLIAM_TENANT_ID',
  'V2-no-id-based-tenant-gate'
)
assertNoMatch(
  'components/HomePageComprehensiveClientV2.tsx',
  /<HeroWordmark\s+tenantId=\{/,
  'V2-no-id-based-HeroWordmark-callsite'
)
assertNoMatch(
  'components/HomePageComprehensiveClientV2.tsx',
  /<WalliamHero\s+tenantId=\{/,
  'V2-no-id-based-WalliamHero-callsite'
)
assertNoMatch(
  'components/HomePageComprehensiveClientV2.tsx',
  /function HeroWordmark\(\{\s*tenantId\b/,
  'V2-no-id-based-HeroWordmark-signature'
)
assertNoMatch(
  'components/HomePageComprehensiveClientV2.tsx',
  /function WalliamHero\(\{\s*tenantId\b/,
  'V2-no-id-based-WalliamHero-signature'
)

// (b) POSITIVE
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  "import BrandWordmark from './navigation/BrandWordmark'",
  'V2-imports-BrandWordmark'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  'function HeroWordmark({ wordmarkStyle, brandName }',
  'V2-HeroWordmark-data-driven-signature'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  "if (wordmarkStyle !== 'hero')",
  'V2-HeroWordmark-data-driven-gate'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  '<BrandWordmark brand={brandName ?? \'Brand\'} size="hero" />',
  'V2-HeroWordmark-fallback-BrandWordmark-hero'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  'function WalliamHero({ wordmarkStyle,',
  'V2-WalliamHero-data-driven-signature'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  '<WalliamHero wordmarkStyle={wordmarkStyle}',
  'V2-WalliamHero-callsite-data-driven'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  '<HeroWordmark wordmarkStyle={wordmarkStyle}',
  'V2-HeroWordmark-callsite-data-driven'
)
assertMatch(
  'components/HomePageComprehensiveClientV2.tsx',
  /export default function HomePageComprehensiveClientV2\(\{[\s\S]{0,500}wordmarkStyle/,
  'V2-default-export-destructures-wordmarkStyle'
)

// ====================================================================
// Negative assertions (carried from original test, still valid)
// ====================================================================
// The two original `<HeroWordmark />` no-prop callsites must stay gone —
// every HeroWordmark callsite must pass `wordmarkStyle={...}`.
assertNoMatch(
  'components/HomePageComprehensiveClient.tsx',
  /<HeroWordmark\s*\/>/,
  'V1-no-unguarded-HeroWordmark'
)
assertNoMatch(
  'components/HomePageComprehensiveClientV2.tsx',
  /<HeroWordmark\s*\/>/,
  'V2-no-unguarded-HeroWordmark'
)

console.log('\n=== ' + passes + ' PASS / ' + failures + ' FAIL ===')
process.exit(failures === 0 ? 0 : 1)
