#!/usr/bin/env node
/**
 * patch-t6f-a-wire.js — W-LEADS-EMAIL T6f-A wire patch (atomic).
 *
 * Scope:
 *   - Modify  lib/utils/validate-session.ts (extend SELECT + return shape)
 *   - Create  lib/utils/tenant-brand.ts (new helper file)
 *   - Wire    app/api/charlie/lead/route.ts
 *   - Wire    app/api/charlie/plan-email/route.ts
 *   - Wire    app/api/charlie/appointment/route.ts
 *
 * 36 anchor patches total + 1 new file. Atomic validation gate. Per-file LE
 * preserved. Timestamped backups on every modified file. New file no backup.
 */

'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const j = (...lines) => lines.join('\n')

function readFileLF(p) {
  const raw = fs.readFileSync(path.resolve(ROOT, p), 'utf8')
  const usesCRLF = /\r\n/.test(raw)
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
  return { content, usesCRLF }
}
function writeFilePreserveLE(p, contentLF, usesCRLF) {
  const out = usesCRLF ? contentLF.replace(/\n/g, '\r\n') : contentLF
  fs.writeFileSync(path.resolve(ROOT, p), out, 'utf8')
}
function exists(p) { try { fs.accessSync(p); return true } catch { return false } }
function countOccurrences(text, needle) { return text.split(needle).length - 1 }

// ============================================================================
// FILE TARGETS
// ============================================================================

const F_HELPER   = 'lib/utils/validate-session.ts'
const F_NEW      = 'lib/utils/tenant-brand.ts'
const F_LEAD     = 'app/api/charlie/lead/route.ts'
const F_PLAN     = 'app/api/charlie/plan-email/route.ts'
const F_APPT     = 'app/api/charlie/appointment/route.ts'

const MODIFIED_FILES = [F_HELPER, F_LEAD, F_PLAN, F_APPT]

// ============================================================================
// NEW FILE — lib/utils/tenant-brand.ts (LF, written fresh)
// ============================================================================

const NEW_HELPER_CONTENT = [
  '/**',
  ' * Tenant brand-context helper (W-LEADS-EMAIL T6f).',
  ' *',
  ' * Used by routes that do not go through validateSession (Shape B routes —',
  ' * estimator/{vip-request, vip-approve, session, vip-questionnaire},',
  ' * walliam/charlie/vip-approve, walliam/contact). Provides a single',
  ' * multi-tenant-correct accessor for the tenant brand identity + canonical',
  ' * base URL for outbound links and email CTAs.',
  ' *',
  ' * For Shape A routes (charlie/{lead, plan-email, appointment}), the same',
  ' * fields (sourceKey, brandName, domain) are returned by validateSession',
  ' * directly; those routes do NOT call getTenantContext.',
  ' */',
  '',
  "import type { SupabaseClient } from '@supabase/supabase-js'",
  '',
  'export interface TenantContext {',
  '  sourceKey: string',
  '  brandName: string',
  '  domain: string',
  '}',
  '',
  'export async function getTenantContext(',
  '  supabase: SupabaseClient,',
  '  tenantId: string | null | undefined',
  '): Promise<TenantContext | null> {',
  '  if (!tenantId) return null',
  '',
  '  const { data: tenant, error } = await supabase',
  "    .from('tenants')",
  "    .select('source_key, brand_name, name, domain')",
  "    .eq('id', tenantId)",
  '    .maybeSingle()',
  '',
  '  if (error || !tenant?.source_key || !tenant?.domain) return null',
  '',
  '  const brandName = tenant.brand_name || tenant.name',
  '  if (!brandName) return null',
  '',
  '  return {',
  '    sourceKey: tenant.source_key,',
  '    brandName,',
  '    domain: tenant.domain,',
  '  }',
  '}',
  '',
  '/**',
  ' * Build the canonical base URL for outbound links. Respects the',
  ' * NEXT_PUBLIC_APP_URL env override (used in dev / staging) and falls back',
  ' * to https://<tenant.domain> for production tenant traffic.',
  ' */',
  'export function buildBaseUrl(domain: string | null | undefined): string {',
  '  const envOverride = process.env.NEXT_PUBLIC_APP_URL',
  '  if (envOverride) return envOverride',
  '  if (!domain) return \'\'',
  '  return `https://${domain}`',
  '}',
  '',
].join('\n')

// ============================================================================
// PATCH DEFINITIONS — validate-session.ts (3 patches)
// ============================================================================

const H1_OLD = "    .select('source_key')"
const H1_NEW = "    .select('source_key, brand_name, name, domain')"

const H2_OLD = "  | { ok: true; session: Record<string, any>; sourceKey: string }"
const H2_NEW = "  | { ok: true; session: Record<string, any>; sourceKey: string; brandName: string; domain: string }"

const H3_OLD = "  return { ok: true, session: session as Record<string, any>, sourceKey: tenant.source_key }"
const H3_NEW = "  return { ok: true, session: session as Record<string, any>, sourceKey: tenant.source_key, brandName: (tenant.brand_name || tenant.name) as string, domain: tenant.domain as string }"

// ============================================================================
// SHARED ANCHORS — Shape A post-T6c destructure + import
// ============================================================================

const SHAPE_A_IMPORT_OLD = "import { validateSession } from '@/lib/utils/validate-session'"
const SHAPE_A_IMPORT_NEW = j(
  "import { validateSession } from '@/lib/utils/validate-session'",
  "import { buildBaseUrl } from '@/lib/utils/tenant-brand'"
)

const SHAPE_A_BASEURL_OLD = "const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'"
const SHAPE_A_BASEURL_NEW = "// T6f — BASE_URL relocated to handler scope (tenant-aware via buildBaseUrl(domain))"

const SHAPE_A_DESTRUCTURE_OLD = j(
  "    const sourceKey = _sessionCheck.sourceKey  // T6c — for source-field templating",
  "    // END T6a auth gate"
)
const SHAPE_A_DESTRUCTURE_NEW = j(
  "    const sourceKey = _sessionCheck.sourceKey  // T6c — for source-field templating",
  "    const brandName = _sessionCheck.brandName  // T6f — for brand-text templating",
  "    const domain = _sessionCheck.domain        // T6f — for URL templating",
  "    const BASE_URL = buildBaseUrl(domain)      // T6f — handler-local tenant-aware base URL",
  "    // END T6a auth gate"
)

// ============================================================================
// PATCH DEFINITIONS — charlie/lead/route.ts (13 patches)
// ============================================================================

const L_SUBJECT_OLD = "        subject: `Your WALLiam ${intent === 'buyer' ? 'Buyer' : 'Seller'} Plan — ${profile?.geoName || 'GTA'}`,"
const L_SUBJECT_NEW = "        subject: `Your ${brandName} ${intent === 'buyer' ? 'Buyer' : 'Seller'} Plan — ${profile?.geoName || 'GTA'}`,"

const L_USERPLAN_SIG_OLD = j(
  "  agent?: any",
  "}): string {",
  "  const { name, intent, buyerProfile, sellerProfile, listings, analytics, agent } = data"
)
const L_USERPLAN_SIG_NEW = j(
  "  agent?: any",
  "  brandName: string",
  "  domain: string",
  "  baseUrl: string",
  "}): string {",
  "  const { name, intent, buyerProfile, sellerProfile, listings, analytics, agent, brandName, domain, baseUrl } = data"
)

const L_USERPLAN_CALL_OLD = "        html: buildUserPlanEmail({ name, intent, buyerProfile, sellerProfile, listings, analytics, agent }),"
const L_USERPLAN_CALL_NEW = "        html: buildUserPlanEmail({ name, intent, buyerProfile, sellerProfile, listings, analytics, agent, brandName, domain, baseUrl: BASE_URL }),"

const L_WORDMARK_404_OLD = '          <span style="font-weight: 900;">WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.6);">iam</span>'
const L_WORDMARK_404_NEW = '          <span style="font-weight: 900;">${brandName}</span>'

const L_CONTINUE_OLD = "            ✦ Continue on WALLiam"
const L_CONTINUE_NEW = "            ✦ Continue on ${brandName}"

const L_SENTBY_OLD = "          Sent by WALLiam AI · walliam.ca"
const L_SENTBY_NEW = "          Sent by ${brandName} AI · ${domain}"

const L_AGENT_SIG_OLD = j(
  "  analytics?: any",
  "}): string {",
  "  const { name, email, phone, intent, buyerProfile, sellerProfile, listings } = data"
)
const L_AGENT_SIG_NEW = j(
  "  analytics?: any",
  "  brandName: string",
  "  domain: string",
  "  baseUrl: string",
  "}): string {",
  "  const { name, email, phone, intent, buyerProfile, sellerProfile, listings, brandName, domain, baseUrl } = data"
)

const L_AGENT_CALL_OLD = "          html: buildAgentLeadEmail({ name, email: authEmail, phone, intent, buyerProfile, sellerProfile, listings, analytics }),"
const L_AGENT_CALL_NEW = "          html: buildAgentLeadEmail({ name, email: authEmail, phone, intent, buyerProfile, sellerProfile, listings, analytics, brandName, domain, baseUrl: BASE_URL }),"

const L_WORDMARK_467_OLD = '          <span>WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.5);">iam</span>'
const L_WORDMARK_467_NEW = '          <span>${brandName}</span>'

const L_DASHFOOTER_OLD = '        <p style="margin: 12px 0 0; color: #94a3b8; font-size: 11px;">WALLiam · walliam.ca</p>'
const L_DASHFOOTER_NEW = '        <p style="margin: 12px 0 0; color: #94a3b8; font-size: 11px;">${brandName} · ${domain}</p>'

// ============================================================================
// PATCH DEFINITIONS — charlie/plan-email/route.ts (9 patches)
// ============================================================================

const P_SUBJECT_OLD = "    const subject = `\\u2756 WALLiam ${planType === 'buyer' ? 'Buyer' : 'Seller'} Plan \\u2014 ${geoName || 'GTA'} \\u2014 ${userName}`"
const P_SUBJECT_NEW = "    const subject = `\\u2756 ${brandName} ${planType === 'buyer' ? 'Buyer' : 'Seller'} Plan \\u2014 ${geoName || 'GTA'} \\u2014 ${userName}`"

const P_RICH_SIG_OLD = j(
  "  blocks: any[]",
  "}): string {",
  "  const { userName, planType, plan, analytics, listings, agent, geoName, comparables, sellerEstimate, vipCreditUsed, vipCreditPlansUsed, vipCreditTotal, blocks } = data"
)
const P_RICH_SIG_NEW = j(
  "  blocks: any[]",
  "  brandName: string",
  "  domain: string",
  "  baseUrl: string",
  "}): string {",
  "  const { userName, planType, plan, analytics, listings, agent, geoName, comparables, sellerEstimate, vipCreditUsed, vipCreditPlansUsed, vipCreditTotal, blocks, brandName, domain, baseUrl } = data"
)

const P_RICH_CALL_OLD = "    const html = buildRichPlanEmail({ userName, userEmail, planType, plan, analytics, listings: listings || [], agent, geoName, comparables: comparables || [], sellerEstimate: sellerEstimate || null, vipCreditUsed: vipCreditUsed || false, vipCreditPlansUsed: vipCreditPlansUsed || 0, vipCreditTotal: vipCreditTotal || 1, blocks: blocks || [] })"
const P_RICH_CALL_NEW = "    const html = buildRichPlanEmail({ userName, userEmail, planType, plan, analytics, listings: listings || [], agent, geoName, comparables: comparables || [], sellerEstimate: sellerEstimate || null, vipCreditUsed: vipCreditUsed || false, vipCreditPlansUsed: vipCreditPlansUsed || 0, vipCreditTotal: vipCreditTotal || 1, blocks: blocks || [], brandName, domain, baseUrl: BASE_URL })"

const P_WORDMARK_OLD = '          <span style="font-weight: 900;">WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.5);">iam</span>'
const P_WORDMARK_NEW = '          <span style="font-weight: 900;">${brandName}</span>'

const P_OPEN_OLD = "            &#10022; Open WALLiam"
const P_OPEN_NEW = "            &#10022; Open ${brandName}"

const P_FOOTER_OLD = '        <p style="margin: 0; color: #94a3b8; font-size: 11px;">WALLiam &middot; walliam.ca</p>'
const P_FOOTER_NEW = '        <p style="margin: 0; color: #94a3b8; font-size: 11px;">${brandName} &middot; ${domain}</p>'

// ============================================================================
// PATCH DEFINITIONS — charlie/appointment/route.ts (11 patches)
// ============================================================================

const A_USERCONF_SIG_OLD = j(
  "  rescheduleUrl: string",
  "}): string {",
  "  const { name, intent, formattedDate, appointment_time, appointment_properties, agent, rescheduleUrl } = data"
)
const A_USERCONF_SIG_NEW = j(
  "  rescheduleUrl: string",
  "  brandName: string",
  "  domain: string",
  "  baseUrl: string",
  "}): string {",
  "  const { name, intent, formattedDate, appointment_time, appointment_properties, agent, rescheduleUrl, brandName, domain, baseUrl } = data"
)

const A_USERCONF_CALL_OLD = j(
  "        html: buildUserConfirmationEmail({",
  "          name, intent, formattedDate, appointment_time,",
  "          appointment_properties, agent, rescheduleUrl,",
  "        }),"
)
const A_USERCONF_CALL_NEW = j(
  "        html: buildUserConfirmationEmail({",
  "          name, intent, formattedDate, appointment_time,",
  "          appointment_properties, agent, rescheduleUrl,",
  "          brandName, domain, baseUrl: BASE_URL,",
  "        }),"
)

// L309 wordmark — disambiguated by preceding L308 div (font-size: 26px ... margin-bottom: 4px)
const A_WORDMARK_309_OLD = j(
  '        <div style="font-size: 26px; font-weight: 900; color: #fff; margin-bottom: 4px;">',
  '          <span>WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.5);">iam</span>',
  '        </div>'
)
const A_WORDMARK_309_NEW = j(
  '        <div style="font-size: 26px; font-weight: 900; color: #fff; margin-bottom: 4px;">',
  '          <span style="font-weight: 900;">${brandName}</span>',
  '        </div>'
)

// L335 footer — disambiguated by preceding L334 div (padding: 16px 28px; background: #f8fafc)
const A_FOOTER_335_OLD = j(
  '      <div style="padding: 16px 28px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">',
  '        <p style="margin: 0; color: #94a3b8; font-size: 11px;">WALLiam · walliam.ca</p>'
)
const A_FOOTER_335_NEW = j(
  '      <div style="padding: 16px 28px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">',
  '        <p style="margin: 0; color: #94a3b8; font-size: 11px;">${brandName} · ${domain}</p>'
)

const A_AGENTNOT_SIG_OLD = j(
  "  geo_name?: string",
  "}): string {",
  "  const { name, email, phone, intent, formattedDate, appointment_time, appointment_properties, geo_name } = data"
)
const A_AGENTNOT_SIG_NEW = j(
  "  geo_name?: string",
  "  brandName: string",
  "  domain: string",
  "  baseUrl: string",
  "}): string {",
  "  const { name, email, phone, intent, formattedDate, appointment_time, appointment_properties, geo_name, brandName, domain, baseUrl } = data"
)

const A_AGENTNOT_CALL_OLD = j(
  "          html: buildAgentNotificationEmail({",
  "            name, email, phone, intent, formattedDate, appointment_time,",
  "            appointment_properties, geo_name,",
  "          }),"
)
const A_AGENTNOT_CALL_NEW = j(
  "          html: buildAgentNotificationEmail({",
  "            name, email, phone, intent, formattedDate, appointment_time,",
  "            appointment_properties, geo_name,",
  "            brandName, domain, baseUrl: BASE_URL,",
  "          }),"
)

// L370 wordmark — disambiguated by preceding L369 div (font-size: 22px ... margin-bottom: 8px)
const A_WORDMARK_370_OLD = j(
  '        <div style="font-size: 22px; font-weight: 900; color: #fff; margin-bottom: 8px;">',
  '          <span>WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.5);">iam</span>',
  '        </div>'
)
const A_WORDMARK_370_NEW = j(
  '        <div style="font-size: 22px; font-weight: 900; color: #fff; margin-bottom: 8px;">',
  '          <span style="font-weight: 900;">${brandName}</span>',
  '        </div>'
)

// L403 footer — disambiguated by preceding L402 div (padding: 16px 20px; background: white)
const A_FOOTER_403_OLD = j(
  '      <div style="padding: 16px 20px; background: white; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">',
  '        <p style="margin: 0; color: #94a3b8; font-size: 11px;">WALLiam · walliam.ca</p>'
)
const A_FOOTER_403_NEW = j(
  '      <div style="padding: 16px 20px; background: white; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">',
  '        <p style="margin: 0; color: #94a3b8; font-size: 11px;">${brandName} · ${domain}</p>'
)

// ============================================================================
// PATCH LIST
// ============================================================================

const patches = [
  // validate-session.ts (3)
  { file: F_HELPER, name: 'H1 SELECT extension',      old: H1_OLD, new: H1_NEW },
  { file: F_HELPER, name: 'H2 return type extension', old: H2_OLD, new: H2_NEW },
  { file: F_HELPER, name: 'H3 return stmt extension', old: H3_OLD, new: H3_NEW },

  // charlie/lead (13)
  { file: F_LEAD, name: 'L1 import',           old: SHAPE_A_IMPORT_OLD,     new: SHAPE_A_IMPORT_NEW },
  { file: F_LEAD, name: 'L2 module BASE_URL',  old: SHAPE_A_BASEURL_OLD,    new: SHAPE_A_BASEURL_NEW },
  { file: F_LEAD, name: 'L3 destructure',      old: SHAPE_A_DESTRUCTURE_OLD,new: SHAPE_A_DESTRUCTURE_NEW },
  { file: F_LEAD, name: 'L4 subject',          old: L_SUBJECT_OLD,          new: L_SUBJECT_NEW },
  { file: F_LEAD, name: 'L5 userplan sig',     old: L_USERPLAN_SIG_OLD,     new: L_USERPLAN_SIG_NEW },
  { file: F_LEAD, name: 'L6 userplan call',    old: L_USERPLAN_CALL_OLD,    new: L_USERPLAN_CALL_NEW },
  { file: F_LEAD, name: 'L7 wordmark L404',    old: L_WORDMARK_404_OLD,     new: L_WORDMARK_404_NEW },
  { file: F_LEAD, name: 'L8 continue',         old: L_CONTINUE_OLD,         new: L_CONTINUE_NEW },
  { file: F_LEAD, name: 'L9 sentby',           old: L_SENTBY_OLD,           new: L_SENTBY_NEW },
  { file: F_LEAD, name: 'L10 agent sig',       old: L_AGENT_SIG_OLD,        new: L_AGENT_SIG_NEW },
  { file: F_LEAD, name: 'L11 agent call',      old: L_AGENT_CALL_OLD,       new: L_AGENT_CALL_NEW },
  { file: F_LEAD, name: 'L12 wordmark L467',   old: L_WORDMARK_467_OLD,     new: L_WORDMARK_467_NEW },
  { file: F_LEAD, name: 'L13 dashfooter',      old: L_DASHFOOTER_OLD,       new: L_DASHFOOTER_NEW },

  // charlie/plan-email (9)
  { file: F_PLAN, name: 'P1 import',           old: SHAPE_A_IMPORT_OLD,     new: SHAPE_A_IMPORT_NEW },
  { file: F_PLAN, name: 'P2 module BASE_URL',  old: SHAPE_A_BASEURL_OLD,    new: SHAPE_A_BASEURL_NEW },
  { file: F_PLAN, name: 'P3 destructure',      old: SHAPE_A_DESTRUCTURE_OLD,new: SHAPE_A_DESTRUCTURE_NEW },
  { file: F_PLAN, name: 'P4 rich sig',         old: P_RICH_SIG_OLD,         new: P_RICH_SIG_NEW },
  { file: F_PLAN, name: 'P5 rich call',        old: P_RICH_CALL_OLD,        new: P_RICH_CALL_NEW },
  { file: F_PLAN, name: 'P6 subject',          old: P_SUBJECT_OLD,          new: P_SUBJECT_NEW },
  { file: F_PLAN, name: 'P7 wordmark',         old: P_WORDMARK_OLD,         new: P_WORDMARK_NEW },
  { file: F_PLAN, name: 'P8 open',             old: P_OPEN_OLD,             new: P_OPEN_NEW },
  { file: F_PLAN, name: 'P9 footer',           old: P_FOOTER_OLD,           new: P_FOOTER_NEW },

  // charlie/appointment (11)
  { file: F_APPT, name: 'A1 import',           old: SHAPE_A_IMPORT_OLD,     new: SHAPE_A_IMPORT_NEW },
  { file: F_APPT, name: 'A2 module BASE_URL',  old: SHAPE_A_BASEURL_OLD,    new: SHAPE_A_BASEURL_NEW },
  { file: F_APPT, name: 'A3 destructure',      old: SHAPE_A_DESTRUCTURE_OLD,new: SHAPE_A_DESTRUCTURE_NEW },
  { file: F_APPT, name: 'A4 userconf sig',     old: A_USERCONF_SIG_OLD,     new: A_USERCONF_SIG_NEW },
  { file: F_APPT, name: 'A5 userconf call',    old: A_USERCONF_CALL_OLD,    new: A_USERCONF_CALL_NEW },
  { file: F_APPT, name: 'A6 wordmark L309',    old: A_WORDMARK_309_OLD,     new: A_WORDMARK_309_NEW },
  { file: F_APPT, name: 'A7 footer L335',      old: A_FOOTER_335_OLD,       new: A_FOOTER_335_NEW },
  { file: F_APPT, name: 'A8 agentnot sig',     old: A_AGENTNOT_SIG_OLD,     new: A_AGENTNOT_SIG_NEW },
  { file: F_APPT, name: 'A9 agentnot call',    old: A_AGENTNOT_CALL_OLD,    new: A_AGENTNOT_CALL_NEW },
  { file: F_APPT, name: 'A10 wordmark L370',   old: A_WORDMARK_370_OLD,     new: A_WORDMARK_370_NEW },
  { file: F_APPT, name: 'A11 footer L403',     old: A_FOOTER_403_OLD,       new: A_FOOTER_403_NEW },
]

// ============================================================================
// ATOMIC VALIDATION GATE
// ============================================================================

const errors = []

for (const f of MODIFIED_FILES) {
  if (!exists(path.resolve(ROOT, f))) errors.push('file not found: ' + f)
}
if (exists(path.resolve(ROOT, F_NEW))) {
  errors.push('NEW file already exists (delete to re-run): ' + F_NEW)
}

const fileState = new Map()
if (errors.length === 0) {
  for (const f of MODIFIED_FILES) fileState.set(f, readFileLF(f))

  for (const p of patches) {
    const content = fileState.get(p.file).content
    const c = countOccurrences(content, p.old)
    if (c !== 1) errors.push(p.name + ' (' + p.file + '): expected 1 match, found ' + c)
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All ' + patches.length + ' anchors validated + new-file path clean.')
console.log('Per-file line endings:')
for (const [p, { usesCRLF }] of fileState.entries()) {
  console.log('  ' + p + ': ' + (usesCRLF ? 'CRLF' : 'LF'))
}

// ============================================================================
// BACKUP + APPLY
// ============================================================================

const ts = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) +
  '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds())

console.log('\nBackup suffix: .backup_' + stamp + '\n')

// Apply text patches in memory (LF-normalized)
const fileNewContent = new Map()
for (const p of patches) {
  let content = fileNewContent.get(p.file) || fileState.get(p.file).content
  content = content.replace(p.old, p.new)
  fileNewContent.set(p.file, content)
  console.log('  applied: ' + p.name)
}

// Backups (raw original content)
for (const f of MODIFIED_FILES) {
  const absSrc = path.resolve(ROOT, f)
  const absBackup = absSrc + '.backup_' + stamp
  fs.copyFileSync(absSrc, absBackup)
  console.log('  backup:  ' + path.basename(absBackup))
}

// Write modified files (LE preserved per-file)
for (const f of MODIFIED_FILES) {
  const { usesCRLF } = fileState.get(f)
  writeFilePreserveLE(f, fileNewContent.get(f), usesCRLF)
  console.log('  wrote:   ' + f + ' (' + (usesCRLF ? 'CRLF' : 'LF') + ')')
}

// Write new helper (LF)
fs.mkdirSync(path.dirname(path.resolve(ROOT, F_NEW)), { recursive: true })
fs.writeFileSync(path.resolve(ROOT, F_NEW), NEW_HELPER_CONTENT, 'utf8')
console.log('  created: ' + F_NEW + ' (LF)')

console.log('\nT6f-A wire patch applied: ' + patches.length + ' anchor patches + 1 new file.')
console.log('\nNext steps:')
console.log('  1. npx tsc --noEmit  (must be silent)')
console.log('  2. node scripts/smoke-t3b.js  (must be 4/4 GREEN)')
console.log('  3. node scripts/smoke-t3c.js  (must be 5/5 GREEN)')
console.log('  4. If both smokes pass: git stage + commit + push, then tracker v14 -> v15.')