// scripts/patch-t6f-c-2-vip-approve-wire.js
//
// W-LEADS-EMAIL T6f-C-2 — brand-strings + URL refactor for
// app/api/walliam/charlie/vip-approve/route.ts (Shape ~A but no validateSession;
// GET handler with token-based approve/deny; 8 createHtmlResponse call sites).
//
// 15 atomic anchor-validated patches. createHtmlResponse signature extended
// with `brandName: string = ''` defaulted param — pre-vipRequest call sites
// (L25/L29/L49) + catch-block site (L187) keep using default. Only 4
// post-vipRequest sites get explicit brandName arg.

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const F = 'app/api/walliam/charlie/vip-approve/route.ts'

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

// A1 — Import getTenantContext + buildBaseUrl
const A1_OLD = "import { sendTenantEmail, TenantEmailNotConfigured, TenantEmailFailed } from '@/lib/email/sendTenantEmail'\n"
const A1_NEW = "import { sendTenantEmail, TenantEmailNotConfigured, TenantEmailFailed } from '@/lib/email/sendTenantEmail'\nimport { getTenantContext, buildBaseUrl } from '@/lib/utils/tenant-brand'\n"

// A2 — Brand-load block insertion (after L49 vipRequest not-found check)
const A2_OLD = j(
  "      return createHtmlResponse('error', 'Request not found or link has expired.')",
  "    }",
  "",
  "    if (vipRequest.status !== 'pending') {"
)
const A2_NEW = j(
  "      return createHtmlResponse('error', 'Request not found or link has expired.')",
  "    }",
  "",
  "    // T6f-C-2 — tenant brand context (loaded post-vipRequest non-null check;",
  "    // brandName/domain/baseUrl available for all subsequent createHtmlResponse + email paths)",
  "    const brandTenantId = vipRequest.chat_sessions?.tenant_id || null",
  "    let brandName = ''",
  "    let domain = ''",
  "    let baseUrl = ''",
  "    if (brandTenantId) {",
  "      const _t6fcCtx = await getTenantContext(supabase, brandTenantId)",
  "      if (_t6fcCtx) {",
  "        brandName = _t6fcCtx.brandName",
  "        domain = _t6fcCtx.domain",
  "        baseUrl = buildBaseUrl(_t6fcCtx.domain)",
  "      }",
  "    }",
  "",
  "    if (vipRequest.status !== 'pending') {"
)

// A3 — L53 createHtmlResponse 'already_processed' (add brandName arg)
const A3_OLD = "      return createHtmlResponse('already_processed', `This request was already ${vipRequest.status}.`)"
const A3_NEW = "      return createHtmlResponse('already_processed', `This request was already ${vipRequest.status}.`, brandName)"

// A4 — L61 createHtmlResponse 'expired' (add brandName arg)
const A4_OLD = "      return createHtmlResponse('expired', 'This request has expired.')"
const A4_NEW = "      return createHtmlResponse('expired', 'This request has expired.', brandName)"

// A5 — L162 subject template
const A5_OLD = "            subject: 'Your WALLiam Plan Access is Approved',"
const A5_NEW = "            subject: `Your ${brandName} Plan Access is Approved`,"

// A6 — L163-L167 buildUserApprovalEmailHtml call (add 3 positional args + replace 'WALLiam' fallback)
const A6_OLD = j(
  "            html: buildUserApprovalEmailHtml(",
  "              vipRequest.full_name,",
  "              agent?.full_name || 'WALLiam',",
  "              plansToGrant",
  "            ),"
)
const A6_NEW = j(
  "            html: buildUserApprovalEmailHtml(",
  "              vipRequest.full_name,",
  "              agent?.full_name || brandName,",
  "              plansToGrant,",
  "              brandName,",
  "              domain,",
  "              baseUrl",
  "            ),"
)

// A7 — L174-L177 createHtmlResponse 'approved' (multi-line, add brandName)
const A7_OLD = j(
  "      return createHtmlResponse(",
  "        'approved',",
  "        `Plan access granted to ${vipRequest.full_name || vipRequest.phone}. They now have ${plansToGrant} additional plan${plansToGrant > 1 ? 's' : ''}.`",
  "      )"
)
const A7_NEW = j(
  "      return createHtmlResponse(",
  "        'approved',",
  "        `Plan access granted to ${vipRequest.full_name || vipRequest.phone}. They now have ${plansToGrant} additional plan${plansToGrant > 1 ? 's' : ''}.`,",
  "        brandName",
  "      )"
)

// A8 — L179-L182 createHtmlResponse 'denied' (multi-line, add brandName)
const A8_OLD = j(
  "      return createHtmlResponse(",
  "        'denied',",
  "        `VIP request from ${vipRequest.full_name || vipRequest.phone} has been denied.`",
  "      )"
)
const A8_NEW = j(
  "      return createHtmlResponse(",
  "        'denied',",
  "        `VIP request from ${vipRequest.full_name || vipRequest.phone} has been denied.`,",
  "        brandName",
  "      )"
)

// A9 — L191 buildUserApprovalEmailHtml signature (append 3 positional params)
const A9_OLD = "function buildUserApprovalEmailHtml(userName: string, agentName: string, plansGranted: number): string {"
const A9_NEW = "function buildUserApprovalEmailHtml(userName: string, agentName: string, plansGranted: number, brandName: string, domain: string, baseUrl: string): string {"

// A10 — L197 helper body brand line
const A10_OLD = '        <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0;">WALLiam AI Real Estate</p>'
const A10_NEW = '        <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0;">${brandName} AI Real Estate</p>'

// A11 — L205 helper body inline brand text
const A11_OLD = "          You now have <strong>${plansGranted} additional plan${plansGranted > 1 ? 's' : ''}</strong> available on WALLiam."
const A11_NEW = "          You now have <strong>${plansGranted} additional plan${plansGranted > 1 ? 's' : ''}</strong> available on ${brandName}."

// A12 — L211 helper body inline URL
const A12_OLD = "          <a href=\"${process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'}\" style=\"display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;\">"
const A12_NEW = "          <a href=\"${baseUrl}\" style=\"display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;\">"

// A13 — L212 helper body link text (✦ is literal Unicode in UTF-8 file)
const A13_OLD = "            ✦ Back to WALLiam"
const A13_NEW = "            ✦ Back to ${brandName}"

// A14 — L220 createHtmlResponse signature (add brandName defaulted param)
const A14_OLD = "function createHtmlResponse(status: string, message: string): NextResponse {"
const A14_NEW = "function createHtmlResponse(status: string, message: string, brandName: string = ''): NextResponse {"

// A15 — L234 title (conditional brand prefix)
const A15_OLD = "  <title>WALLiam - ${cfg.title}</title>"
const A15_NEW = "  <title>${brandName ? brandName + ' - ' : ''}${cfg.title}</title>"

const patches = [
  { name: 'A1 import getTenantContext + buildBaseUrl', old: A1_OLD, new: A1_NEW },
  { name: 'A2 brand-load block insertion', old: A2_OLD, new: A2_NEW },
  { name: 'A3 L53 createHtmlResponse already_processed', old: A3_OLD, new: A3_NEW },
  { name: 'A4 L61 createHtmlResponse expired', old: A4_OLD, new: A4_NEW },
  { name: 'A5 L162 subject template', old: A5_OLD, new: A5_NEW },
  { name: 'A6 L163-L167 buildUserApprovalEmailHtml call', old: A6_OLD, new: A6_NEW },
  { name: 'A7 L174-L177 createHtmlResponse approved', old: A7_OLD, new: A7_NEW },
  { name: 'A8 L179-L182 createHtmlResponse denied', old: A8_OLD, new: A8_NEW },
  { name: 'A9 L191 buildUserApprovalEmailHtml signature', old: A9_OLD, new: A9_NEW },
  { name: 'A10 L197 helper brand line', old: A10_OLD, new: A10_NEW },
  { name: 'A11 L205 helper inline brand text', old: A11_OLD, new: A11_NEW },
  { name: 'A12 L211 helper inline URL', old: A12_OLD, new: A12_NEW },
  { name: 'A13 L212 helper link text', old: A13_OLD, new: A13_NEW },
  { name: 'A14 L220 createHtmlResponse signature', old: A14_OLD, new: A14_NEW },
  { name: 'A15 L234 title conditional prefix', old: A15_OLD, new: A15_NEW },
]

const errors = []
if (!exists(path.resolve(ROOT, F))) errors.push('file not found: ' + F)

let fileState = null
if (errors.length === 0) {
  fileState = readFileLF(F)
  for (const p of patches) {
    const c = countOccurrences(fileState.content, p.old)
    if (c !== 1) errors.push(p.name + ': expected 1 anchor match, found ' + c)
  }
  const reRunMarkers = [
    { name: 'A1 re-run', needle: "import { getTenantContext, buildBaseUrl } from '@/lib/utils/tenant-brand'" },
    { name: 'A2 re-run', needle: '_t6fcCtx = await getTenantContext(supabase, brandTenantId)' },
    { name: 'A9 re-run', needle: 'plansGranted: number, brandName: string, domain: string, baseUrl: string' },
    { name: 'A14 re-run', needle: "message: string, brandName: string = ''" },
    { name: 'A15 re-run', needle: "${brandName ? brandName + ' - ' : ''}${cfg.title}" },
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

console.log('All 15 anchors validated. Line endings: ' + (fileState.usesCRLF ? 'CRLF' : 'LF'))

const ts = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) + '_' +
  pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds())

console.log('\nBackup suffix: .backup_' + stamp + '\n')

const absSrc = path.resolve(ROOT, F)
const absBackup = absSrc + '.backup_' + stamp
fs.copyFileSync(absSrc, absBackup)
console.log('  backup: ' + path.basename(absBackup))

let content = fileState.content
for (const p of patches) {
  content = content.replace(p.old, p.new)
  console.log('  applied: ' + p.name)
}

writeFilePreserveLE(F, content, fileState.usesCRLF)
console.log('  wrote: ' + F + ' (' + (fileState.usesCRLF ? 'CRLF' : 'LF') + ')')

console.log('')
console.log('T6f-C-2 wire applied: 15 atomic patches to ' + F + '.')