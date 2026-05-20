// scripts/test-c8b-2-multitenant-regression.js
// C8b-2 regression gate -- D13 (hero subset) retired.
// Static assertions on file contents to prevent regression.

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

console.log('\n=== C8b-2 regression gate ===\n')

// ---------- BrandWordmark.tsx ----------
assertMatch(
  'components/navigation/BrandWordmark.tsx',
  /size\?:\s*'sm'\s*\|\s*'md'\s*\|\s*'hero'/,
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

// ---------- V1 server wrapper ----------
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

// ---------- V2 server wrapper ----------
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

// ---------- V1 client ----------
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  "const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'",
  'V1-WALLIAM_TENANT_ID-constant'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  "import BrandWordmark from './navigation/BrandWordmark'",
  'V1-imports-BrandWordmark'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  'function HeroWordmark({ tenantId, brandName }',
  'V1-HeroWordmark-receives-props'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  'if (tenantId !== WALLIAM_TENANT_ID)',
  'V1-HeroWordmark-tenant-gate'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  '<BrandWordmark brand={brandName ?? \'Brand\'} size="hero" />',
  'V1-HeroWordmark-fallback-BrandWordmark-hero'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  'function WalliamHero({ tenantId, brandName, assistantName }',
  'V1-WalliamHero-receives-props'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  '<WalliamHero tenantId={tenantId} brandName={brandName} assistantName={assistantName} />',
  'V1-WalliamHero-callsite-passes-props'
)
assertContains(
  'components/HomePageComprehensiveClient.tsx',
  '<HeroWordmark tenantId={tenantId} brandName={brandName} />',
  'V1-HeroWordmark-callsite-passes-props'
)
assertMatch(
  'components/HomePageComprehensiveClient.tsx',
  /export default function HomePageComprehensiveClient\(\{\s*tenantId,\s*brandName,/,
  'V1-default-export-destructures-props'
)

// ---------- V2 client ----------
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  "const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'",
  'V2-WALLIAM_TENANT_ID-constant'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  "import BrandWordmark from './navigation/BrandWordmark'",
  'V2-imports-BrandWordmark'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  'function HeroWordmark({ tenantId, brandName }',
  'V2-HeroWordmark-receives-props'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  'if (tenantId !== WALLIAM_TENANT_ID)',
  'V2-HeroWordmark-tenant-gate'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  '<BrandWordmark brand={brandName ?? \'Brand\'} size="hero" />',
  'V2-HeroWordmark-fallback-BrandWordmark-hero'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  'function WalliamHero({ tenantId, brandName, topAreas, neighbourhoods, access, assistantName }',
  'V2-WalliamHero-receives-props'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  '<WalliamHero tenantId={tenantId} brandName={brandName} topAreas={topAreas} neighbourhoods={neighbourhoods} access={access} assistantName={assistantName} />',
  'V2-WalliamHero-callsite-passes-props'
)
assertContains(
  'components/HomePageComprehensiveClientV2.tsx',
  '<HeroWordmark tenantId={tenantId} brandName={brandName} />',
  'V2-HeroWordmark-callsite-passes-props'
)
assertMatch(
  'components/HomePageComprehensiveClientV2.tsx',
  /export default function HomePageComprehensiveClientV2\(\{\s*tenantId,\s*brandName,/,
  'V2-default-export-destructures-props'
)

// ---------- Negative assertions: no unguarded hero wordmark renders ----------
// The two original `<HeroWordmark />` callsites (no props) must be gone.
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