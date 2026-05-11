#!/usr/bin/env node
/**
 * patch-t6f-b-1-vip-questionnaire-wire.js — T6f-B-1: brand-strings refactor
 * for app/api/walliam/estimator/vip-questionnaire/route.ts.
 *
 * 8 atomic anchors. Per-file LE + BOM preserved (this route: LF, no-BOM).
 *
 * Pattern: Shape B/C — route loads tenant directly at L139 (no validateSession);
 * SELECT extended to include brand_name + name; brandName declared at function
 * scope (line above sourceKey) with empty-string fallback; assigned inside the
 * existing if(tenantId) block.
 *
 * NO URL refactor in this route — probe confirmed 0 BASE_URL/baseUrl refs and
 * 0 inline NEXT_PUBLIC_APP_URL. T6f-B-1 is brand-strings-only.
 */

'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const F = 'app/api/walliam/estimator/vip-questionnaire/route.ts'

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
// P1: tenant SELECT extension + brandName declaration + assignment
// ============================================================================

const P1_OLD =
  '    let sourceKey: string | null = null\n' +
  '    if (tenantId) {\n' +
  '      const { data: t6cTenant } = await supabase\n' +
  "        .from('tenants')\n" +
  "        .select('source_key')\n" +
  "        .eq('id', tenantId)\n" +
  '        .maybeSingle()\n' +
  '      sourceKey = t6cTenant?.source_key ?? null\n' +
  '    }'

const P1_NEW =
  '    let sourceKey: string | null = null\n' +
  "    let brandName: string = ''  // T6f-B — multitenant brand-string (empty fallback for unhappy-path safety)\n" +
  '    if (tenantId) {\n' +
  '      const { data: t6cTenant } = await supabase\n' +
  "        .from('tenants')\n" +
  "        .select('source_key, brand_name, name')\n" +
  "        .eq('id', tenantId)\n" +
  '        .maybeSingle()\n' +
  '      sourceKey = t6cTenant?.source_key ?? null\n' +
  "      brandName = (t6cTenant?.brand_name || t6cTenant?.name) ?? ''\n" +
  '    }'

// ============================================================================
// P2: L148 enrichedMessage brand-text
// ============================================================================

const P2_OLD =
  '      const enrichedMessage = `WALLiam Estimator Questionnaire — ${buyerTypeDisplay} | Budget: ${budgetDisplay} | Timeline: ${timelineDisplay}${requirements ? ` | Notes: ${requirements}` : \'\'}`'

const P2_NEW =
  '      const enrichedMessage = `${brandName} Estimator Questionnaire — ${buyerTypeDisplay} | Budget: ${budgetDisplay} | Timeline: ${timelineDisplay}${requirements ? ` | Notes: ${requirements}` : \'\'}`'

// ============================================================================
// P3: contact_name fallback x2 (replaceAll with count=2 pre-state assertion)
// ============================================================================

const P3_OLD = "            contact_name: userName || 'WALLiam User',"
const P3_NEW = '            contact_name: userName || `${brandName} User`,'

// ============================================================================
// P4: call site at L207-L208 — adds brandName arg + fixes userName fallback
// ============================================================================

const P4_OLD =
  '    const emailHtml = buildQuestionnaireEmailHtml({\n' +
  "      userName: userName || 'WALLiam User',"

const P4_NEW =
  '    const emailHtml = buildQuestionnaireEmailHtml({\n' +
  '      brandName,\n' +
  '      userName: userName || `${brandName} User`,'

// ============================================================================
// P5: L247 subject brand-text
// ============================================================================

const P5_OLD =
  '        const subject = `📋 WALLiam Estimator Questionnaire — ${userName || vipRequest.phone}`'

const P5_NEW =
  '        const subject = `📋 ${brandName} Estimator Questionnaire — ${userName || vipRequest.phone}`'

// ============================================================================
// P6: helper typed-object signature extension
// ============================================================================

const P6_OLD =
  'function buildQuestionnaireEmailHtml(data: {\n' +
  '  userName: string\n' +
  '  phone: string\n' +
  '  email?: string\n' +
  '  buyerTypeDisplay: string\n' +
  '  budgetDisplay: string\n' +
  '  timelineDisplay: string\n' +
  '  buildingName?: string\n' +
  '  requirements?: string\n' +
  '}): string {'

const P6_NEW =
  'function buildQuestionnaireEmailHtml(data: {\n' +
  '  userName: string\n' +
  '  phone: string\n' +
  '  email?: string\n' +
  '  buyerTypeDisplay: string\n' +
  '  budgetDisplay: string\n' +
  '  timelineDisplay: string\n' +
  '  buildingName?: string\n' +
  '  requirements?: string\n' +
  '  brandName: string\n' +
  '}): string {'

// ============================================================================
// P7: helper body wordmark at L312
// ============================================================================

const P7_OLD =
  '        <h1 style="color: white; margin: 0; font-size: 22px;">📋 WALLiam Estimator Questionnaire</h1>'

const P7_NEW =
  '        <h1 style="color: white; margin: 0; font-size: 22px;">📋 ${data.brandName} Estimator Questionnaire</h1>'

// ============================================================================
// P8: helper body footer at L357
// ============================================================================

const P8_OLD =
  '          ✦ WALLiam — Use the approve/deny links from the original VIP email to manage access.'

const P8_NEW =
  '          ✦ ${data.brandName} — Use the approve/deny links from the original VIP email to manage access.'

// ============================================================================
// ATOMIC VALIDATION
// ============================================================================

const errors = []
if (!exists(F)) errors.push('file not found: ' + F)

let state = null
if (errors.length === 0) {
  state = readFile(F)

  // Single-match anchors
  const singles = [
    ['P1', P1_OLD], ['P2', P2_OLD], ['P4', P4_OLD], ['P5', P5_OLD],
    ['P6', P6_OLD], ['P7', P7_OLD], ['P8', P8_OLD],
  ]
  for (const [name, old] of singles) {
    const c = count(state.content, old)
    if (c !== 1) errors.push(name + ': expected 1 match, found ' + c)
  }

  // P3 must match exactly 2 (L169 + L190)
  const c3 = count(state.content, P3_OLD)
  if (c3 !== 2) errors.push('P3: expected 2 matches, found ' + c3)

  // Idempotence check
  if (state.content.includes('T6f-B — multitenant brand-string')) {
    errors.push('T6f-B marker already present (re-run after partial state?)')
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 8 anchors validated. LE: ' + (state.usesCRLF ? 'CRLF' : 'LF') + ' | ' + (state.hasBOM ? 'BOM' : 'no-BOM'))

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
working = working.replace(P1_OLD, P1_NEW); console.log('  applied: P1 SELECT extension + brandName init')
working = working.replace(P2_OLD, P2_NEW); console.log('  applied: P2 enrichedMessage brand-text')
working = working.split(P3_OLD).join(P3_NEW); console.log('  applied: P3 contact_name fallback x2 (replaceAll)')
working = working.replace(P4_OLD, P4_NEW); console.log('  applied: P4 helper call site + userName fallback')
working = working.replace(P5_OLD, P5_NEW); console.log('  applied: P5 subject brand-text')
working = working.replace(P6_OLD, P6_NEW); console.log('  applied: P6 helper signature extension')
working = working.replace(P7_OLD, P7_NEW); console.log('  applied: P7 helper body wordmark')
working = working.replace(P8_OLD, P8_NEW); console.log('  applied: P8 helper body footer brand')

// Post-state assertions
const postP3 = count(working, P3_OLD)
if (postP3 !== 0) {
  console.error('POST-STATE FAIL: P3 still has ' + postP3 + ' matches after replaceAll')
  process.exit(1)
}
const postWalliam = count(working, "'WALLiam User'")
if (postWalliam !== 0) {
  console.error('POST-STATE FAIL: \'WALLiam User\' literal still present (' + postWalliam + ' refs) — patch incomplete')
  process.exit(1)
}

writeFile(F, working, state.usesCRLF, state.hasBOM)
const delta = working.length - state.content.length
console.log('  wrote: ' + F + ' (' + (state.usesCRLF ? 'CRLF' : 'LF') + ', delta ' + (delta >= 0 ? '+' : '') + delta + ' chars)')

console.log('')
console.log('T6f-B-1 wire patch applied: 8 atomic anchors (7 single + 1 replaceAll).')