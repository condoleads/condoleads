#!/usr/bin/env node
/**
 * patch-t6f-b-3-vip-approve-wire.js — T6f-B-3: brand-strings + URL refactor
 * for app/api/walliam/estimator/vip-approve/route.ts.
 *
 * 12 atomic anchors. Per-file LE + BOM preserved (CRLF + no-BOM).
 *
 * Architecture: 9 createHtmlResponse call sites split across pre-tenant (4 sites
 * that fire before vipRequest is loaded or tenant_id is derivable) and post-tenant
 * (5 sites with tenant context). createHtmlResponse sig extended with optional
 * brandName param defaulting to '' — pre-tenant call sites omit; post-tenant call
 * sites pass actual brandName.
 *
 * L65 `const tenantId = vipRequest.chat_sessions?.tenant_id` REMOVED — declared
 * once in new brand-load block at function scope, used by downstream L68/L101/L108/L124/L152.
 */

'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const F = 'app/api/walliam/estimator/vip-approve/route.ts'

function readFile(p) {
  const raw = fs.readFileSync(path.resolve(ROOT, p), 'utf8')
  const usesCRLF = /\r\n/.test(raw)
  const hasBOM = raw.charCodeAt(0) === 0xFEFF
  let content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
  if (hasBOM) content = content.slice(1)
  return { content, usesCRLF, hasBOM }
}
function writeFile(p, contentLF, usesCRLF, hasBOM) {
  let out = usesCRLF ? contentLF.replace(/\n/g, '\r\n') : contentLF
  if (hasBOM) out = '\uFEFF' + out
  fs.writeFileSync(path.resolve(ROOT, p), out, 'utf8')
}
function count(text, needle) { return text.split(needle).length - 1 }
function exists(p) { try { fs.accessSync(p); return true } catch { return false } }

// ============================================================================
// P1: import buildBaseUrl
// ============================================================================

const P1_OLD =
  "} from '@/lib/admin-homes/lead-email-recipients'\n" +
  '\n'

const P1_NEW =
  "} from '@/lib/admin-homes/lead-email-recipients'\n" +
  "import { buildBaseUrl } from '@/lib/utils/tenant-brand'\n" +
  '\n'

// ============================================================================
// P2: brand-load block + L57/L60 createHtmlResponse brandName arg + L65 tenantId removed
// ============================================================================

const P2_OLD =
  "    if (findError || !vipRequest) return createHtmlResponse('error', 'Request not found or link has expired.')\n" +
  "    if (vipRequest.status !== 'pending') return createHtmlResponse('already_processed', `This request was already ${vipRequest.status}.`)\n" +
  '    if (new Date(vipRequest.expires_at) < new Date()) {\n' +
  "      await supabase.from('vip_requests').update({ status: 'expired' }).eq('id', vipRequest.id)\n" +
  "      return createHtmlResponse('expired', 'This request has expired.')\n" +
  '    }\n' +
  '\n' +
  "    const newStatus = action === 'approve' ? 'approved' : 'denied'\n" +
  '    const agent = vipRequest.agents\n' +
  '    const tenantId = vipRequest.chat_sessions?.tenant_id'

const P2_NEW =
  "    if (findError || !vipRequest) return createHtmlResponse('error', 'Request not found or link has expired.')\n" +
  '\n' +
  '    // T6f-B-3 — multitenant brand-string + URL load (must precede subsequent createHtmlResponse + helper calls)\n' +
  '    const tenantId = vipRequest.chat_sessions?.tenant_id ?? null\n' +
  "    let brandName: string = ''\n" +
  "    let baseUrl: string = ''\n" +
  '    if (tenantId) {\n' +
  "      const { data: brandTenant } = await supabase.from('tenants').select('brand_name, name, domain').eq('id', tenantId).single()\n" +
  "      brandName = (brandTenant?.brand_name || brandTenant?.name) ?? ''\n" +
  "      baseUrl = buildBaseUrl(brandTenant?.domain ?? '')\n" +
  '    }\n' +
  '\n' +
  "    if (vipRequest.status !== 'pending') return createHtmlResponse('already_processed', `This request was already ${vipRequest.status}.`, brandName)\n" +
  '    if (new Date(vipRequest.expires_at) < new Date()) {\n' +
  "      await supabase.from('vip_requests').update({ status: 'expired' }).eq('id', vipRequest.id)\n" +
  "      return createHtmlResponse('expired', 'This request has expired.', brandName)\n" +
  '    }\n' +
  '\n' +
  "    const newStatus = action === 'approve' ? 'approved' : 'denied'\n" +
  '    const agent = vipRequest.agents'

// ============================================================================
// P3: L133 createHtmlResponse — add brandName arg
// ============================================================================

const P3_OLD =
  "            return createHtmlResponse('error', 'System notification failed. Approval recorded; please contact support.')"

const P3_NEW =
  "            return createHtmlResponse('error', 'System notification failed. Approval recorded; please contact support.', brandName)"

// ============================================================================
// P4: L156 subject brand-text (SQ literal -> backtick template)
// ============================================================================

const P4_OLD =
  "            subject: 'Your WALLiam Estimator Access is Approved',"

const P4_NEW =
  '            subject: `Your ${brandName} Estimator Access is Approved`,'

// ============================================================================
// P5: L157-L161 buildUserApprovalEmailHtml call site (+brandName/baseUrl args, L159 agent fallback)
// ============================================================================

const P5_OLD =
  '            html: buildUserApprovalEmailHtml(\n' +
  '              vipRequest.full_name,\n' +
  "              agent?.full_name || 'WALLiam',\n" +
  '              attemptsToGrant\n' +
  '            ),'

const P5_NEW =
  '            html: buildUserApprovalEmailHtml(\n' +
  '              vipRequest.full_name,\n' +
  '              agent?.full_name || brandName,\n' +
  '              attemptsToGrant,\n' +
  '              brandName,\n' +
  '              baseUrl\n' +
  '            ),'

// ============================================================================
// P6: L175 createHtmlResponse + brandName
// ============================================================================

const P6_OLD =
  "      return createHtmlResponse('approved', `Estimator access granted to ${vipRequest.full_name || vipRequest.phone}. They now have ${attemptsToGrant} additional estimate${attemptsToGrant > 1 ? 's' : ''}.`)"

const P6_NEW =
  "      return createHtmlResponse('approved', `Estimator access granted to ${vipRequest.full_name || vipRequest.phone}. They now have ${attemptsToGrant} additional estimate${attemptsToGrant > 1 ? 's' : ''}.`, brandName)"

// ============================================================================
// P7: L177 createHtmlResponse + brandName
// ============================================================================

const P7_OLD =
  "      return createHtmlResponse('denied', `Estimator VIP request from ${vipRequest.full_name || vipRequest.phone} has been denied.`)"

const P7_NEW =
  "      return createHtmlResponse('denied', `Estimator VIP request from ${vipRequest.full_name || vipRequest.phone} has been denied.`, brandName)"

// ============================================================================
// P8: L186 buildUserApprovalEmailHtml sig extension
// ============================================================================

const P8_OLD =
  'function buildUserApprovalEmailHtml(userName: string, agentName: string, attemptsGranted: number): string {'

const P8_NEW =
  'function buildUserApprovalEmailHtml(userName: string, agentName: string, attemptsGranted: number, brandName: string, baseUrl: string): string {'

// ============================================================================
// P9: L192 helper body wordmark
// ============================================================================

const P9_OLD =
  '        <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0;">WALLiam AI Real Estate</p>'

const P9_NEW =
  '        <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0;">${brandName} AI Real Estate</p>'

// ============================================================================
// P10: L198 helper body URL + brand link text (combined)
// ============================================================================

const P10_OLD =
  '          <a href="${process.env.NEXT_PUBLIC_APP_URL || \'https://walliam.ca\'}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">✦ Back to WALLiam</a>'

const P10_NEW =
  '          <a href="${baseUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">✦ Back to ${brandName}</a>'

// ============================================================================
// P11: L205 createHtmlResponse sig extension (optional brandName)
// ============================================================================

const P11_OLD =
  'function createHtmlResponse(status: string, message: string): NextResponse {'

const P11_NEW =
  "function createHtmlResponse(status: string, message: string, brandName: string = ''): NextResponse {"

// ============================================================================
// P12: L218 page title brand-text
// ============================================================================

const P12_OLD =
  '  <title>WALLiam Estimator — ${cfg.title}</title>'

const P12_NEW =
  '  <title>${brandName} Estimator — ${cfg.title}</title>'

// ============================================================================
// ATOMIC VALIDATION
// ============================================================================

const errors = []
if (!exists(F)) errors.push('file not found: ' + F)

let state = null
if (errors.length === 0) {
  state = readFile(F)

  const singles = [
    ['P1', P1_OLD], ['P2', P2_OLD], ['P3', P3_OLD], ['P4', P4_OLD], ['P5', P5_OLD],
    ['P6', P6_OLD], ['P7', P7_OLD], ['P8', P8_OLD], ['P9', P9_OLD], ['P10', P10_OLD],
    ['P11', P11_OLD], ['P12', P12_OLD],
  ]
  for (const [name, old] of singles) {
    const c = count(state.content, old)
    if (c !== 1) errors.push(name + ': expected 1 match, found ' + c)
  }

  if (state.content.includes('T6f-B-3 — multitenant brand-string')) {
    errors.push('T6f-B-3 marker already present (re-run after partial state?)')
  }

  if (state.hasBOM) {
    errors.push('expected no-BOM (per probe — vip-approve route is no-BOM); detected BOM. Aborting to avoid encoding drift.')
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 12 anchors validated. LE: ' + (state.usesCRLF ? 'CRLF' : 'LF') + ' | ' + (state.hasBOM ? 'BOM' : 'no-BOM'))

// ============================================================================
// BACKUP + APPLY + WRITE
// ============================================================================

const ts = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) +
  '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds())

console.log('Backup suffix: .backup_' + stamp)

const absSrc = path.resolve(ROOT, F)
const absBackup = absSrc + '.backup_' + stamp
fs.copyFileSync(absSrc, absBackup)
console.log('  backup: ' + path.basename(absBackup) + '  (' + F + ')')

let working = state.content
working = working.replace(P1_OLD, P1_NEW); console.log('  applied: P1 import buildBaseUrl')
working = working.replace(P2_OLD, P2_NEW); console.log('  applied: P2 brand-load + L57/L60 brandName + L65 tenantId redeclaration removed')
working = working.replace(P3_OLD, P3_NEW); console.log('  applied: P3 L133 createHtmlResponse + brandName')
working = working.replace(P4_OLD, P4_NEW); console.log('  applied: P4 L156 subject brand-text')
working = working.replace(P5_OLD, P5_NEW); console.log('  applied: P5 L157-L161 helper call (brandName/baseUrl args)')
working = working.replace(P6_OLD, P6_NEW); console.log('  applied: P6 L175 createHtmlResponse + brandName')
working = working.replace(P7_OLD, P7_NEW); console.log('  applied: P7 L177 createHtmlResponse + brandName')
working = working.replace(P8_OLD, P8_NEW); console.log('  applied: P8 buildUserApprovalEmailHtml sig extension')
working = working.replace(P9_OLD, P9_NEW); console.log('  applied: P9 helper body wordmark')
working = working.replace(P10_OLD, P10_NEW); console.log('  applied: P10 helper body URL + brand link text')
working = working.replace(P11_OLD, P11_NEW); console.log('  applied: P11 createHtmlResponse sig + optional brandName')
working = working.replace(P12_OLD, P12_NEW); console.log('  applied: P12 page title brand-text')

// Post-state assertions
const postWalliamLit = count(working, "'WALLiam'")
if (postWalliamLit !== 0) {
  console.error("POST-STATE FAIL: 'WALLiam' SQ-literal still present (" + postWalliamLit + " refs) - patch incomplete")
  process.exit(1)
}
const postEnvUrl = count(working, "process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'")
if (postEnvUrl !== 0) {
  console.error('POST-STATE FAIL: inline NEXT_PUBLIC_APP_URL fallback still present (' + postEnvUrl + ' refs) - patch incomplete')
  process.exit(1)
}

writeFile(F, working, state.usesCRLF, state.hasBOM)
const delta = working.length - state.content.length
console.log('  wrote: ' + F + ' (' + (state.usesCRLF ? 'CRLF' : 'LF') + ' + ' + (state.hasBOM ? 'BOM' : 'no-BOM') + ', delta ' + (delta >= 0 ? '+' : '') + delta + ' chars)')

console.log('')
console.log('T6f-B-3 wire patch applied: 12 atomic anchors.')