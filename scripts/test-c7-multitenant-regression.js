// scripts/test-c7-multitenant-regression.js
// C7 regression gate -- D10, D11, D12 retired
const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()
let failures = 0

function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8') }
function assertNoMatch(rel, pattern, label) {
  const m = readFile(rel).match(pattern)
  if (m) { console.error('FAIL [' + label + '] ' + rel + ' -- forbidden: ' + m[0]); failures++ }
  else console.log('PASS [' + label + '] ' + rel + ' -- pattern absent')
}
function assertMatch(rel, pattern, label) {
  if (pattern.test(readFile(rel))) console.log('PASS [' + label + '] ' + rel + ' -- present')
  else { console.error('FAIL [' + label + '] ' + rel + ' -- missing'); failures++ }
}

console.log('=== C7 regression gate ===\n')

// D10 negative: no walliam.ca / WALLiam literals in root layout
assertNoMatch('app/layout.tsx', /walliam\.ca/i, 'D10-negative-no-walliam-ca')
assertNoMatch('app/layout.tsx', /"WALLiam[^"]*"/, 'D10-negative-no-walliam-string')
assertNoMatch('app/layout.tsx', /export const metadata: Metadata = \{/, 'D10-negative-no-static-metadata')

// D10 positive: generateMetadata function exists
assertMatch('app/layout.tsx', /export async function generateMetadata/, 'D10-positive-generate-metadata')
assertMatch('app/layout.tsx', /getTenantByHost/, 'D10-positive-uses-helper')

// D11 negative: no walliam.ca / KNOWN_TENANTS in comprehensive-site
assertNoMatch('app/comprehensive-site/page.tsx', /walliam\.ca/i, 'D11-negative-no-walliam-ca')
assertNoMatch('app/comprehensive-site/page.tsx', /KNOWN_TENANTS/, 'D11-negative-no-known-tenants-const')
assertNoMatch('app/comprehensive-site/page.tsx', /b16e1039-38ed-43d7-bbc5-dd02bb651bc9/, 'D11-negative-no-hardcoded-uuid')

// D11 positive: uses getTenantByHost
assertMatch('app/comprehensive-site/page.tsx', /getTenantByHost/, 'D11-positive-uses-helper')

// D12 negative: no walliam.ca text in OG route
assertNoMatch('app/og/route.tsx', /walliam\.ca/, 'D12-negative-no-walliam-ca')

// D12 positive: OG route reads host, builds tenant brand
assertMatch('app/og/route.tsx', /req\.headers\.get\(['"]host['"]\)/, 'D12-positive-reads-host')
assertMatch('app/og/route.tsx', /\{displayDomain\}/, 'D12-positive-renders-domain')
assertMatch('app/og/route.tsx', /\{brandName\}/, 'D12-positive-renders-brand')

// Helper: TenantContext extended with id + name
assertMatch('lib/utils/tenant-brand.ts', /export async function getTenantByHost/, 'Helper-positive-export')
assertMatch('lib/utils/tenant-brand.ts', /id:\s*string\s*\n\s*sourceKey/, 'Helper-positive-id-in-context')

console.log('\n=== ' + (failures === 0 ? 'ALL PASS' : failures + ' FAIL(S)') + ' ===')
process.exit(failures === 0 ? 0 : 1)