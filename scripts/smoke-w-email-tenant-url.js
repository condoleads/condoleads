// scripts/smoke-w-email-tenant-url.js
// W-EMAIL-TENANT-URL multi-tenant smoke -- verifies buildBaseUrl precedence
// flip across:
//   - WALLiam context  -> https://walliam.ca
//   - aily context     -> https://aily.ca
//   - No tenant + env  -> NEXT_PUBLIC_APP_URL value (dev/preview fallback)
//   - No tenant, no env -> '' (last resort)
//
// Also Rule-Zero checks:
//   - WALLiam URL never contains 'aily' / 'condoleads'
//   - aily URL never contains 'walliam' / 'condoleads'

// Compile the TS module to JS so we can import + invoke without ts-node.
const path = require('path')
const { execSync } = require('child_process')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'lib/utils/tenant-brand.ts')
const OUTDIR = path.join(ROOT, 'tmp-smoke-build')
fs.mkdirSync(OUTDIR, { recursive: true })

execSync(`npx tsc --target es2020 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --outDir "${OUTDIR}" "${SRC}"`, { cwd: ROOT, stdio: 'inherit', shell: true })

const built = require(path.join(OUTDIR, 'tenant-brand.js'))
const { buildBaseUrl } = built

// === Tenants from DB (confirmed earlier this session) ===
const WALLIAM_DOMAIN = 'walliam.ca'
const AILY_DOMAIN = 'aily.ca'

let fail = 0
function check (label, actual, expected) {
  const ok = actual === expected
  if (!ok) fail++
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + label.padEnd(60) + ' got=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected))
}
function contains (label, str, sub, expected) {
  const has = str.includes(sub)
  const ok = has === expected
  if (!ok) fail++
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + label.padEnd(60) + ' "' + str + '" contains "' + sub + '"=' + has + ' expected=' + expected)
}

console.log('=== WALLiam context (tenant.domain = "walliam.ca") ===')
// Force env override TO the bug-state value: prove env loses to tenant.
process.env.NEXT_PUBLIC_APP_URL = 'https://www.condoleads.ca'
const wa1 = buildBaseUrl(WALLIAM_DOMAIN)
check('WALLiam baseUrl', wa1, 'https://walliam.ca')
contains('WALLiam URL contains walliam.ca', wa1, 'walliam.ca', true)
contains('WALLiam URL does NOT contain aily', wa1, 'aily', false)
contains('WALLiam URL does NOT contain condoleads', wa1, 'condoleads', false)

console.log('')
console.log('=== aily context (tenant.domain = "aily.ca") ===')
const ay1 = buildBaseUrl(AILY_DOMAIN)
check('aily baseUrl', ay1, 'https://aily.ca')
contains('aily URL contains aily.ca', ay1, 'aily.ca', true)
contains('aily URL does NOT contain walliam', ay1, 'walliam', false)
contains('aily URL does NOT contain condoleads', ay1, 'condoleads', false)

console.log('')
console.log('=== Cross-tenant non-leak ===')
contains('WALLiam URL != aily URL', wa1 !== ay1 ? 'distinct' : 'collision', 'distinct', true)

console.log('')
console.log('=== Dev/preview fallback path (no tenant resolvable) ===')
// env set, no tenant -> env wins
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
check('null domain + env=localhost', buildBaseUrl(null), 'http://localhost:3000')
check('undefined domain + env=localhost', buildBaseUrl(undefined), 'http://localhost:3000')
check('empty-string domain + env=localhost', buildBaseUrl(''), 'http://localhost:3000')

console.log('')
console.log('=== Last-resort fallback (no tenant, no env) ===')
delete process.env.NEXT_PUBLIC_APP_URL
check('null domain + no env', buildBaseUrl(null), '')
check('undefined domain + no env', buildBaseUrl(undefined), '')

console.log('')
console.log('=== Env override should NEVER beat a real tenant domain ===')
// Simulate the bug-state env value alongside a tenant -- tenant must win.
process.env.NEXT_PUBLIC_APP_URL = 'https://platform-bug-url.invalid'
check('WALLiam wins over bug-env', buildBaseUrl(WALLIAM_DOMAIN), 'https://walliam.ca')
check('aily wins over bug-env', buildBaseUrl(AILY_DOMAIN), 'https://aily.ca')

// Cleanup
fs.rmSync(OUTDIR, { recursive: true, force: true })

console.log('')
console.log('=== buildBaseUrl smoke: ' + (fail === 0 ? 'ALL PASS' : fail + ' FAIL') + ' ===')
process.exit(fail === 0 ? 0 : 1)
