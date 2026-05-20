// scripts/test-c8a-multitenant-regression.js
// C8a regression gate (revised for client-component architecture)
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
function assertFileAbsent(rel, label) {
  if (!fs.existsSync(path.join(ROOT, rel))) console.log('PASS [' + label + '] ' + rel + ' -- file absent')
  else { console.error('FAIL [' + label + '] ' + rel + ' -- file still exists'); failures++ }
}

console.log('=== C8a regression gate ===\n')

// WalliamCTA is a client component now
assertMatch('components/WalliamCTA.tsx', /^'use client'/, 'CTA-client-directive')
assertMatch('components/WalliamCTA.tsx', /assistantName/, 'CTA-has-assistant-name')
assertNoMatch('components/WalliamCTA.tsx', /next\/headers/, 'CTA-no-server-imports')
assertFileAbsent('components/WalliamCTAClient.tsx', 'CTA-Client-deleted')

// HomePages V1 + V2 text strings (unchanged from previous revision)
assertNoMatch('components/HomePageComprehensiveClient.tsx', /Ask WALLiam anything/, 'V1-no-ask-walliam-anything')
assertMatch('components/HomePageComprehensiveClient.tsx', /Ask \{assistantName\} anything/, 'V1-positive')
assertNoMatch('components/HomePageComprehensiveClient.tsx', /'WALLiam pulls live MLS/, 'V1-no-walliam-pulls')
assertNoMatch('components/HomePageComprehensiveClientV2.tsx', /Ask WALLiam anything/, 'V2-no-ask-walliam-anything')
assertNoMatch('components/HomePageComprehensiveClientV2.tsx', /Ask WALLiam \(AI\)/, 'V2-no-ask-walliam-ai-button')

// WalliamCTA internal text (now in WalliamCTA.tsx, not WalliamCTAClient)
assertNoMatch('components/WalliamCTA.tsx', /Ask WALLiam about/, 'CTA-no-ask-walliam-about')
assertNoMatch('components/WalliamCTA.tsx', /Ask WALLiam anything about GTA/, 'CTA-no-ask-walliam-anything')
assertMatch('components/WalliamCTA.tsx', /Ask \$\{assistantName\}/, 'CTA-positive-ask-assistant')

// 2 client components accept + thread assistantName
assertMatch('app/property/[id]/HomePropertyPageClient.tsx', /assistantName/, 'HomePropertyClient-has-assistant')
assertMatch('app/property/[id]/PropertyPageClient.tsx', /assistantName/, 'PropertyClient-has-assistant')

// 3 server parents pass assistantName + fetch tenant
const directServerCallers = [
  'app/property/[id]/HomePropertyPage.tsx',
  'app/property/[id]/page.tsx',
  'app/[slug]/PropertyPageContent.tsx',
  'app/comprehensive-site/toronto/[neighbourhood]/page.tsx',
  'app/[slug]/AreaPage.tsx',
  'app/[slug]/BuildingPage.tsx',
  'app/[slug]/CommunityPage.tsx',
  'app/[slug]/MunicipalityPage.tsx',
]
for (const f of directServerCallers) {
  assertMatch(f, /getTenantByHost/, f.split('/').pop() + '-uses-helper')
  assertMatch(f, /const assistantName = /, f.split('/').pop() + '-defines-assistantName')
}


// Added by fix-5: assert no duplicate headers imports
function assertHeadersImportCount(rel, label) {
  const content = readFile(rel)
  const count = content.split("import { headers } from 'next/headers'").length - 1
  if (count === 1) console.log('PASS [' + label + '] ' + rel + ' -- exactly 1 headers import')
  else { console.error('FAIL [' + label + '] ' + rel + ' -- ' + count + ' headers imports (expected 1)'); failures++ }
}

assertHeadersImportCount('app/[slug]/AreaPage.tsx', 'AreaPage-headers-count')
assertHeadersImportCount('app/[slug]/BuildingPage.tsx', 'BuildingPage-headers-count')
assertHeadersImportCount('app/[slug]/CommunityPage.tsx', 'CommunityPage-headers-count')
assertHeadersImportCount('app/[slug]/MunicipalityPage.tsx', 'MunicipalityPage-headers-count')
assertHeadersImportCount('app/comprehensive-site/toronto/[neighbourhood]/page.tsx', 'NeighbourhoodPage-headers-count')
assertHeadersImportCount('app/property/[id]/HomePropertyPage.tsx', 'HomePropertyPage-headers-count')
assertHeadersImportCount('app/property/[id]/page.tsx', 'PropertyPageRoot-headers-count')
console.log('\n=== ' + (failures === 0 ? 'ALL PASS' : failures + ' FAIL(S)') + ' ===')
process.exit(failures === 0 ? 0 : 1)