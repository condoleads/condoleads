// scripts/patch-t6f-b-4-vip-request-wire.js
//
// W-LEADS-EMAIL T6f-B-4 — brand-strings & URL refactor for
// app/api/walliam/estimator/vip-request/route.ts.
//
// 17 atomic anchor-validated patches:
//   A1  import buildBaseUrl
//   A2  tenant SELECT extension (brand_name, name, domain)
//   A3  brandName + domain declarations after sourceKey
//   A4  L166 full_name fallback (vip_requests insert)
//   A5  L196 contact_name fallback (leads insert)
//   A6  L203 message brand string
//   A7  L215 baseUrl via buildBaseUrl(domain)
//   A8  L219-228 buildApprovalEmailHtml typed-object call + fullName fallback
//   A9  L245 chain-notification subject
//   A10 L331-332 auto-approve user subject + positional helper call (3 new args)
//   A11 L407-416 buildApprovalEmailHtml signature (+brandName: string)
//   A12 L420 helper body wordmark
//   A13 L432 helper body user-fallback comparison
//   A14 L467 buildUserApprovalEmailHtml positional signature (+brandName, domain, baseUrl)
//   A15 L473 helper body brand line
//   A16 L482 helper body URL
//   A17 L484 helper body link text
//
// Re-runnable: re-run guards detect already-patched state and abort cleanly.
// LF-normalized matching; preserves original line endings on write.

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const F = 'app/api/walliam/estimator/vip-request/route.ts'

function exists(p) { try { fs.statSync(p); return true } catch { return false } }

function readFileLF(p) {
  const abs = path.resolve(ROOT, p)
  const raw = fs.readFileSync(abs, 'utf8')
  const usesCRLF = raw.includes('\r\n')
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
  return { content, usesCRLF }
}

function writeFilePreserveLE(p, content, usesCRLF) {
  const abs = path.resolve(ROOT, p)
  const out = usesCRLF ? content.replace(/\n/g, '\r\n') : content
  fs.writeFileSync(abs, out, 'utf8')
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0
  let count = 0
  let i = 0
  while ((i = haystack.indexOf(needle, i)) !== -1) { count++; i += needle.length }
  return count
}

const j = (...lines) => lines.join('\n')

// ============================================================================
// Anchor matrix — 17 patches
// ============================================================================

// A1 — Import buildBaseUrl from tenant-brand helper (inserted after logEmailRecipients import)
const A1_OLD = "import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'\n"
const A1_NEW = "import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'\nimport { buildBaseUrl } from '@/lib/utils/tenant-brand'\n"

// A2 — Tenant SELECT extension
const A2_OLD = ".select('source_key, estimator_vip_auto_approve, estimator_auto_approve_attempts, estimator_manual_approve_attempts')"
const A2_NEW = ".select('source_key, brand_name, name, domain, estimator_vip_auto_approve, estimator_auto_approve_attempts, estimator_manual_approve_attempts')"

// A3 — brandName + domain declarations (appended after L101 sourceKey decl)
const A3_OLD = "    const sourceKey = tenant.source_key  // T6c — for source-field templating"
const A3_NEW = j(
  "    const sourceKey = tenant.source_key  // T6c — for source-field templating",
  "    const brandName = tenant.brand_name || tenant.name  // T6f-B-4 — tenant brand for user-facing strings",
  "    const domain = tenant.domain || ''  // T6f-B-4 — tenant domain for URL building"
)

// A4 — L166 full_name fallback (vip_requests insert) — 8-space indent
const A4_OLD = "        full_name: userName || 'WALLiam User',"
const A4_NEW = "        full_name: userName || `${brandName} User`,"

// A5 — L196 contact_name fallback (leads insert) — 10-space indent
const A5_OLD = "          contact_name: userName || 'WALLiam User',"
const A5_NEW = "          contact_name: userName || `${brandName} User`,"

// A6 — L203 message brand string (template literal)
const A6_OLD = "          message: `WALLiam Estimator VIP Request${buildingName ? ` — ${buildingName}` : ''}`,"
const A6_NEW = "          message: `${brandName} Estimator VIP Request${buildingName ? ` — ${buildingName}` : ''}`,"

// A7 — L215 baseUrl
const A7_OLD = "    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'"
const A7_NEW = "    const baseUrl = buildBaseUrl(domain)"

// A8 — L219-L228 buildApprovalEmailHtml typed-object call (fullName fallback + brandName field)
const A8_OLD = j(
  "    const emailHtml = buildApprovalEmailHtml({",
  "      fullName: userName || 'WALLiam User',",
  "      phone,",
  "      email: userEmail,",
  "      buildingName,",
  "      pageUrl,",
  "      approveUrl,",
  "      denyUrl,",
  "      agentName: agent?.full_name || 'Agent',",
  "    })"
)
const A8_NEW = j(
  "    const emailHtml = buildApprovalEmailHtml({",
  "      fullName: userName || `${brandName} User`,",
  "      phone,",
  "      email: userEmail,",
  "      buildingName,",
  "      pageUrl,",
  "      approveUrl,",
  "      denyUrl,",
  "      agentName: agent?.full_name || 'Agent',",
  "      brandName,",
  "    })"
)

// A9 — L245 chain-notification subject (template literal)
const A9_OLD = "        const subject = `WALLiam Estimator VIP Request: ${phone}`"
const A9_NEW = "        const subject = `${brandName} Estimator VIP Request: ${phone}`"

// A10 — L331-L332 auto-approve user-email subject + positional helper call
const A10_OLD = j(
  "            subject: 'WALLiam Estimator Access Approved',",
  "            html: buildUserApprovalEmailHtml(userName, agent?.full_name || 'WALLiam', autoApproveMessages),"
)
const A10_NEW = j(
  "            subject: `${brandName} Estimator Access Approved`,",
  "            html: buildUserApprovalEmailHtml(userName, agent?.full_name || brandName, autoApproveMessages, brandName, domain, baseUrl),"
)

// A11 — buildApprovalEmailHtml typed-object signature (+ brandName: string)
const A11_OLD = j(
  "function buildApprovalEmailHtml(data: {",
  "  fullName: string",
  "  phone: string",
  "  email?: string",
  "  buildingName?: string",
  "  pageUrl?: string",
  "  approveUrl: string",
  "  denyUrl: string",
  "  agentName: string",
  "}): string {"
)
const A11_NEW = j(
  "function buildApprovalEmailHtml(data: {",
  "  fullName: string",
  "  phone: string",
  "  email?: string",
  "  buildingName?: string",
  "  pageUrl?: string",
  "  approveUrl: string",
  "  denyUrl: string",
  "  agentName: string",
  "  brandName: string",
  "}): string {"
)

// A12 — L420 helper body wordmark
const A12_OLD = '        <h1 style="color: white; margin: 0; font-size: 22px;">🔔 WALLiam Estimator VIP Request</h1>'
const A12_NEW = '        <h1 style="color: white; margin: 0; font-size: 22px;">🔔 ${data.brandName} Estimator VIP Request</h1>'

// A13 — L432 helper body user-fallback comparison (ends with backtick — start of nested template literal)
const A13_OLD = "          ${data.fullName && data.fullName !== 'WALLiam User' ? `"
const A13_NEW = "          ${data.fullName && data.fullName !== `${data.brandName} User` ? `"

// A14 — L467 buildUserApprovalEmailHtml positional signature (+brandName, domain, baseUrl)
const A14_OLD = "function buildUserApprovalEmailHtml(userName: string, agentName: string, attemptsGranted: number): string {"
const A14_NEW = "function buildUserApprovalEmailHtml(userName: string, agentName: string, attemptsGranted: number, brandName: string, domain: string, baseUrl: string): string {"

// A15 — L473 helper body brand line
const A15_OLD = '        <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0;">WALLiam AI Real Estate</p>'
const A15_NEW = '        <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0;">${brandName} AI Real Estate</p>'

// A16 — L482 helper body URL (note: double-quote escaping inside the JS string)
const A16_OLD = "          <a href=\"${process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'}\""
const A16_NEW = "          <a href=\"${baseUrl}\""

// A17 — L484 helper body link text
const A17_OLD = "            ✦ Back to WALLiam"
const A17_NEW = "            ✦ Back to ${brandName}"

// ============================================================================
// Patch list
// ============================================================================

const patches = [
  { name: 'A1 import buildBaseUrl', old: A1_OLD, new: A1_NEW },
  { name: 'A2 tenant SELECT extension', old: A2_OLD, new: A2_NEW },
  { name: 'A3 brandName + domain declarations', old: A3_OLD, new: A3_NEW },
  { name: 'A4 L166 full_name fallback (vip_requests)', old: A4_OLD, new: A4_NEW },
  { name: 'A5 L196 contact_name fallback (leads)', old: A5_OLD, new: A5_NEW },
  { name: 'A6 L203 message brand string', old: A6_OLD, new: A6_NEW },
  { name: 'A7 L215 baseUrl via buildBaseUrl', old: A7_OLD, new: A7_NEW },
  { name: 'A8 L219-L228 buildApprovalEmailHtml call', old: A8_OLD, new: A8_NEW },
  { name: 'A9 L245 chain subject', old: A9_OLD, new: A9_NEW },
  { name: 'A10 L331-L332 user-approval subject + helper call', old: A10_OLD, new: A10_NEW },
  { name: 'A11 L407-L416 buildApprovalEmailHtml signature', old: A11_OLD, new: A11_NEW },
  { name: 'A12 L420 helper wordmark', old: A12_OLD, new: A12_NEW },
  { name: 'A13 L432 helper user-fallback comparison', old: A13_OLD, new: A13_NEW },
  { name: 'A14 L467 buildUserApprovalEmailHtml signature', old: A14_OLD, new: A14_NEW },
  { name: 'A15 L473 helper brand line', old: A15_OLD, new: A15_NEW },
  { name: 'A16 L482 helper URL', old: A16_OLD, new: A16_NEW },
  { name: 'A17 L484 helper link text', old: A17_OLD, new: A17_NEW },
]

// ============================================================================
// Validation
// ============================================================================

const errors = []

if (!exists(path.resolve(ROOT, F))) {
  errors.push('file not found: ' + F)
}

let fileState = null
if (errors.length === 0) {
  fileState = readFileLF(F)

  for (const p of patches) {
    const c = countOccurrences(fileState.content, p.old)
    if (c !== 1) errors.push(p.name + ': expected 1 anchor match, found ' + c)
  }

  // Re-run guards — abort if any NEW content already present
  const reRunMarkers = [
    { name: 'A1 re-run', needle: "import { buildBaseUrl } from '@/lib/utils/tenant-brand'" },
    { name: 'A3 re-run', needle: 'const brandName = tenant.brand_name || tenant.name' },
    { name: 'A7 re-run', needle: 'const baseUrl = buildBaseUrl(domain)' },
    { name: 'A11 re-run', needle: '  brandName: string\n}): string {' },
    { name: 'A14 re-run', needle: 'attemptsGranted: number, brandName: string, domain: string, baseUrl: string' },
  ]
  for (const m of reRunMarkers) {
    if (fileState.content.includes(m.needle)) {
      errors.push(m.name + ': new content already present (re-run after partial state?). Aborting.')
    }
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 17 anchors validated. Line endings: ' + (fileState.usesCRLF ? 'CRLF' : 'LF'))

// ============================================================================
// Backup + write
// ============================================================================

const ts = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  ts.getFullYear() +
  pad(ts.getMonth() + 1) +
  pad(ts.getDate()) +
  '_' +
  pad(ts.getHours()) +
  pad(ts.getMinutes()) +
  pad(ts.getSeconds())

console.log('\nBackup suffix: .backup_' + stamp + '\n')

const absSrc = path.resolve(ROOT, F)
const absBackup = absSrc + '.backup_' + stamp
fs.copyFileSync(absSrc, absBackup)
console.log('  backup: ' + path.basename(absBackup))

// Apply patches in memory (LF-normalized)
let content = fileState.content
for (const p of patches) {
  content = content.replace(p.old, p.new)
  console.log('  applied: ' + p.name)
}

// Write with original line endings preserved
writeFilePreserveLE(F, content, fileState.usesCRLF)
console.log('  wrote: ' + F + ' (' + (fileState.usesCRLF ? 'CRLF' : 'LF') + ')')

console.log('')
console.log('T6f-B-4 wire applied: 17 atomic patches to ' + F + '.')
console.log('')
console.log('Next steps:')
console.log('  1. npx tsc --noEmit')
console.log('  2. node scripts/smoke-t3b.js')
console.log('     node scripts/smoke-t3c.js')
console.log('     Expected: 9/9 GREEN.')
console.log('  3. git add app/api/walliam/estimator/vip-request/route.ts scripts/patch-t6f-b-4-vip-request-wire.js')
console.log('     git status --short')
console.log('  4. Commit + push, then tracker v16->v17 (closes T6f-B with B-3 + B-4 paired entry).')