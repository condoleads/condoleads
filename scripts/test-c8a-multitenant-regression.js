// scripts/test-c8a-multitenant-regression.js
// C8a regression gate -- D13 (text-string subset) retired
// NOTE: wordmark JSX explicitly NOT checked here; deferred to C8b.
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

console.log('=== C8a regression gate ===\n')

// HomePageComprehensiveClient -- "Ask WALLiam anything" string retired
assertNoMatch('components/HomePageComprehensiveClient.tsx', /Ask WALLiam anything/, 'V1-no-ask-walliam-anything')
assertMatch('components/HomePageComprehensiveClient.tsx', /Ask \{assistantName\} anything/, 'V1-positive-ask-assistant-anything')

// HomePageComprehensiveClient -- "WALLiam pulls" desc string retired
assertNoMatch('components/HomePageComprehensiveClient.tsx', /'WALLiam pulls live MLS/, 'V1-no-walliam-pulls')
assertMatch('components/HomePageComprehensiveClient.tsx', /\$\{assistantName\} pulls live MLS/, 'V1-positive-assistant-pulls')

// V2 mirrors
assertNoMatch('components/HomePageComprehensiveClientV2.tsx', /Ask WALLiam anything/, 'V2-no-ask-walliam-anything')
assertMatch('components/HomePageComprehensiveClientV2.tsx', /Ask \{assistantName\} anything/, 'V2-positive-ask-assistant-anything')
assertNoMatch('components/HomePageComprehensiveClientV2.tsx', /'WALLiam pulls live MLS/, 'V2-no-walliam-pulls')
assertMatch('components/HomePageComprehensiveClientV2.tsx', /\$\{assistantName\} pulls live MLS/, 'V2-positive-assistant-pulls')
assertNoMatch('components/HomePageComprehensiveClientV2.tsx', /Ask WALLiam \(AI\)/, 'V2-no-ask-walliam-ai-button')
assertMatch('components/HomePageComprehensiveClientV2.tsx', /Ask \{assistantName\} \(AI\)/, 'V2-positive-ask-assistant-ai-button')

// WalliamCTA client -- text strings retired
assertNoMatch('components/WalliamCTAClient.tsx', /Ask WALLiam about/, 'CTA-no-ask-walliam-about')
assertNoMatch('components/WalliamCTAClient.tsx', /Ask WALLiam anything about GTA/, 'CTA-no-ask-walliam-anything-gta')
assertNoMatch('components/WalliamCTAClient.tsx', /placeholder="Ask WALLiam\.\.\."/, 'CTA-no-placeholder-walliam')
assertMatch('components/WalliamCTAClient.tsx', /Ask \$\{assistantName\} about/, 'CTA-positive-ask-assistant-about')
assertMatch('components/WalliamCTAClient.tsx', /Ask \$\{assistantName\}\.\.\./, 'CTA-positive-placeholder-assistant')

// WalliamCTA server wrapper exists and uses getTenantByHost
assertMatch('components/WalliamCTA.tsx', /getTenantByHost/, 'CTA-wrapper-uses-helper')
assertMatch('components/WalliamCTA.tsx', /WalliamCTAClient/, 'CTA-wrapper-renders-client')

// Server wrappers fetch tenant + pass assistantName
assertMatch('components/HomePageComprehensive.tsx', /getTenantByHost/, 'V1-server-uses-helper')
assertMatch('components/HomePageComprehensive.tsx', /assistantName=\{assistantName\}/, 'V1-server-passes-prop')
assertMatch('components/HomePageComprehensiveV2.tsx', /getTenantByHost/, 'V2-server-uses-helper')
assertMatch('components/HomePageComprehensiveV2.tsx', /assistantName=\{assistantName\}/, 'V2-server-passes-prop')

console.log('\n=== ' + (failures === 0 ? 'ALL PASS' : failures + ' FAIL(S)') + ' ===')
process.exit(failures === 0 ? 0 : 1)