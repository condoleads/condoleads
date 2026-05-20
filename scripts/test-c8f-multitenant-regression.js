// scripts/test-c8f-multitenant-regression.js
// C8f regression gate -- Option beta: getTenant localhost fallback.
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

console.log('\n=== C8f regression gate ===\n')

// ---------- getTenant.ts function shape ----------

// (1) Tenant interface still exported with all 21 fields (caller compatibility).
assertContains(
  'lib/tenant/getTenant.ts',
  'export interface Tenant {',
  'Tenant-interface-still-exported'
)
assertContains(
  'lib/tenant/getTenant.ts',
  'homepage_layout:',
  'Tenant-interface-preserves-homepage_layout'
)
assertContains(
  'lib/tenant/getTenant.ts',
  'brand_name: string | null',
  'Tenant-interface-preserves-brand_name'
)

// (2) Function signature unchanged.
assertContains(
  'lib/tenant/getTenant.ts',
  'export async function getTenant(): Promise<Tenant | null> {',
  'getTenant-signature-unchanged'
)

// (3) x-tenant-id header read still present (production path).
assertContains(
  'lib/tenant/getTenant.ts',
  "headerList.get('x-tenant-id')",
  'getTenant-reads-x-tenant-id-header'
)

// (4) tenantId now declared as `let` (was `const` before fix).
assertMatch(
  'lib/tenant/getTenant.ts',
  /let\s+tenantId\s*=\s*headerList\.get\('x-tenant-id'\)/,
  'tenantId-is-let-binding'
)

// (5) Dev fallback block present.
assertContains(
  'lib/tenant/getTenant.ts',
  '// C8f -- localhost/preview dev fallback',
  'C8f-comment-marker-present'
)
assertContains(
  'lib/tenant/getTenant.ts',
  "host.includes('localhost')",
  'C8f-localhost-host-check'
)
assertContains(
  'lib/tenant/getTenant.ts',
  "host.includes('vercel.app')",
  'C8f-vercel-preview-host-check'
)
assertContains(
  'lib/tenant/getTenant.ts',
  'process.env.DEV_TENANT_DOMAIN',
  'C8f-DEV_TENANT_DOMAIN-env-read'
)
assertContains(
  'lib/tenant/getTenant.ts',
  ".eq('domain', devDomain)",
  'C8f-tenant-lookup-by-domain'
)
assertContains(
  'lib/tenant/getTenant.ts',
  ".eq('is_active', true)",
  'C8f-active-tenant-filter'
)

// (6) Production full-record fetch path preserved.
assertContains(
  'lib/tenant/getTenant.ts',
  '.eq(\'id\', tenantId)\n    .single()',
  'production-fetch-by-id-preserved'
)
assertContains(
  'lib/tenant/getTenant.ts',
  'return data as Tenant',
  'production-return-shape-preserved'
)

// ---------- Negative assertions: no caller files modified ----------

const callerFiles = [
  'components/navigation/SiteHeader.tsx',
  'components/TenantFooter.tsx',
  'app/comprehensive-site/about/page.tsx',
  'app/comprehensive-site/contact/page.tsx',
  'app/comprehensive-site/privacy/page.tsx',
  'app/comprehensive-site/terms/page.tsx',
]

for (const cf of callerFiles) {
  assertContains(
    cf,
    'await getTenant()',
    'caller-unchanged-' + cf.replace(/[\/\\]/g, '-')
  )
}

console.log('\n=== ' + passes + ' PASS / ' + failures + ' FAIL ===')
process.exit(failures === 0 ? 0 : 1)