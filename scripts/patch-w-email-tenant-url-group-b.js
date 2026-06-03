// scripts/patch-w-email-tenant-url-group-b.js
// W-EMAIL-TENANT-URL Group B sweep: route the 2 user-facing inline
// NEXT_PUBLIC_APP_URL accesses in app/api/walliam/charlie/vip-request/route.ts
// through buildBaseUrl(), so domain resolution has a single source of truth.
//
// Scope decision (from diagnosis):
//   - lines 201, 523 in walliam/charlie/vip-request: USER-FACING email links
//     (approve/deny URLs in agent notification + "Back to {brand}" CTA in
//     user approval email). Same root cause as Group A -- inverted precedence
//     in the inline pattern. Sweep through buildBaseUrl.
//
// Out of scope (charlie/route.ts lines 287, 484, 653, 756): all INTERNAL
// API fetches (Next.js server invoking its own /api/email/low-credits +
// /api/geo-listings endpoints for AI tool execution). The fetch URL never
// reaches an end user; any reachable URL works. NOT changed.

const fs = require('fs')
const path = require('path')

const TS = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const ROOT = path.resolve(__dirname, '..')

function read (relPath) { return fs.readFileSync(path.join(ROOT, relPath), 'utf8') }
function write (relPath, content) { fs.writeFileSync(path.join(ROOT, relPath), content, 'utf8') }

function replaceExact (content, oldStr, newStr, label) {
  let idx = content.indexOf(oldStr)
  if (idx !== -1) {
    if (content.indexOf(oldStr, idx + 1) !== -1) throw new Error('ANCHOR NOT UNIQUE (LF): ' + label)
    return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length)
  }
  const oldCRLF = oldStr.replace(/\r?\n/g, '\r\n')
  const newCRLF = newStr.replace(/\r?\n/g, '\r\n')
  idx = content.indexOf(oldCRLF)
  if (idx !== -1) {
    if (content.indexOf(oldCRLF, idx + 1) !== -1) throw new Error('ANCHOR NOT UNIQUE (CRLF): ' + label)
    return content.slice(0, idx) + newCRLF + content.slice(idx + oldCRLF.length)
  }
  throw new Error('ANCHOR NOT FOUND (LF + CRLF): ' + label)
}

function patchFile (relPath, edits) {
  console.log('\n[file]', relPath, '(backup already taken in shell pre-step)')
  let c = read(relPath)
  for (const [oldStr, newStr, label] of edits) {
    c = replaceExact(c, oldStr, newStr, label)
    console.log('  ok:', label)
  }
  write(relPath, c)
}

patchFile('app/api/walliam/charlie/vip-request/route.ts', [
  // 1. Add buildBaseUrl import. Anchor on the existing closing brace of the
  //    lead-email-recipients import group.
  [
    `} from '@/lib/admin-homes/lead-email-recipients'
import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'`,
    `} from '@/lib/admin-homes/lead-email-recipients'
import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'
// W-EMAIL-TENANT-URL (2026-06-03): single source of truth for tenant URL resolution.
import { buildBaseUrl } from '@/lib/utils/tenant-brand'`,
    'vip-request: import buildBaseUrl'
  ],

  // 2. Line 201 -- approve/deny URLs for agent notification email. Replace
  //    inverted-precedence inline pattern with buildBaseUrl(tenantDomain).
  [
    `    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || \`https://\${tenantDomain}\`
    const approveUrl = \`\${baseUrl}/api/walliam/charlie/vip-approve?token=\${vipRequest.approval_token}&action=approve\`
    const denyUrl = \`\${baseUrl}/api/walliam/charlie/vip-approve?token=\${vipRequest.approval_token}&action=deny\``,
    `    // W-EMAIL-TENANT-URL (2026-06-03): use buildBaseUrl -- tenant domain first,
    // env fallback only when no tenant in scope. Prevents the platform-domain
    // leak that sent WALLiam approval links to www.condoleads.ca.
    const baseUrl = buildBaseUrl(tenantDomain)
    const approveUrl = \`\${baseUrl}/api/walliam/charlie/vip-approve?token=\${vipRequest.approval_token}&action=approve\`
    const denyUrl = \`\${baseUrl}/api/walliam/charlie/vip-approve?token=\${vipRequest.approval_token}&action=deny\``,
    'vip-request: line 201 approve/deny baseUrl via buildBaseUrl'
  ],

  // 3. Line 523 -- "Back to {brand}" CTA inside buildUserApprovalEmailHtml.
  //    tenantDomain is in scope from the function's destructured data param.
  [
    `        <div style="text-align: center;">
          <a href="\${process.env.NEXT_PUBLIC_APP_URL || \`https://\${tenantDomain}\`}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">`,
    `        <div style="text-align: center;">
          <a href="\${buildBaseUrl(tenantDomain)}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">`,
    'vip-request: line 523 "Back to brand" CTA via buildBaseUrl'
  ],
])

console.log('\nW-EMAIL-TENANT-URL Group B sweep PATCH COMPLETE.')
console.log('Timestamp:', TS)
