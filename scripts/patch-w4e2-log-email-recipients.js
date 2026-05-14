// scripts/patch-w4e2-log-email-recipients.js
// W-LEADS-WORKBENCH W4e.2 (2026-05-14)
// Extends lib/admin-homes/log-email-recipients.ts to support 'lead_contact' layer.
//
// Pattern: exact-string anchors via line-array .join('\n'). Timestamped backup
// before edit. Each patch MUST match exactly once or the script aborts and
// restores from backup.

const fs = require('node:fs')
const path = require('node:path')

const TARGET = path.join('lib', 'admin-homes', 'log-email-recipients.ts')

if (!fs.existsSync(TARGET)) {
  console.error('ABORT: ' + TARGET + ' not found.')
  process.exit(1)
}

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp = '' + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) +
              '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())
const backupPath = TARGET + '.backup_' + stamp

fs.copyFileSync(TARGET, backupPath)
console.log('BACKUP ' + backupPath + ' (' + fs.statSync(backupPath).size + ' bytes)')

let source = fs.readFileSync(TARGET, 'utf8')
const hasCRLF = source.includes('\r\n')
const eolMode = hasCRLF ? 'CRLF' : 'LF'
console.log('LINE_ENDINGS: ' + eolMode)
if (hasCRLF) {
  source = source.replace(/\r\n/g, '\n')
}

const J = (lines) => lines.join('\n')

const patches = [
  {
    name: 'p1_header_tracker_line',
    before: J([
      '// W-LEADS-EMAIL T3b-hotfix-A (2026-05-10) \u2014 aligned vocabulary with T2f schema CHECKs.',
      '//',
    ]),
    after: J([
      '// W-LEADS-EMAIL T3b-hotfix-A (2026-05-10) \u2014 aligned vocabulary with T2f schema CHECKs.',
      "// W-LEADS-WORKBENCH W4e.2 (2026-05-14) \u2014 added 'lead_contact' layer label for",
      '//   admin-composed customer-facing emails (POST send-email).',
      '//',
    ]),
  },
  {
    name: 'p2_schema_reference_block',
    before: J([
      '// Schema reference (CHECK constraints from T2f migration 8e84040):',
      "//   direction        IN ('to', 'cc', 'bcc')",
      "//   recipient_layer  IN ('agent', 'manager', 'area_manager', 'tenant_admin',",
      "//                        'platform_manager', 'platform_admin',",
      "//                        'tenant_overlay_cc', 'tenant_overlay_bcc')",
      "//   status           IN ('queued', 'sent', 'delivered', 'bounced', 'failed', 'complained')",
    ]),
    after: J([
      '// Schema reference (CHECK constraints \u2014 T2f migration 8e84040 + W4e.1 migration',
      '// 20260514_w4e1_lerl_recipient_layer_lead_contact):',
      "//   direction        IN ('to', 'cc', 'bcc')",
      "//   recipient_layer  IN ('agent', 'manager', 'area_manager', 'tenant_admin',",
      "//                        'platform_manager', 'platform_admin',",
      "//                        'tenant_overlay_cc', 'tenant_overlay_bcc',",
      "//                        'lead_contact')",
      "//   status           IN ('queued', 'sent', 'delivered', 'bounced', 'failed', 'complained')",
    ]),
  },
  {
    name: 'p3_vocabulary_mapping_block',
    before: J([
      "//   unresolved (anomaly)        -> 'tenant_overlay_<cc|bcc>' + console.warn alarm",
      '//',
    ]),
    after: J([
      "//   unresolved (anomaly)        -> 'tenant_overlay_<cc|bcc>' + console.warn alarm",
      "//   leadContactEmail (param)    -> 'lead_contact' (W4e.2 \u2014 external customer",
      '//                                  recipient for admin-composed emails)',
      '//',
    ]),
  },
  {
    name: 'p4_type_union_extension',
    before: J([
      'export type EmailRecipientLayer =',
      "  | 'agent'",
      "  | 'manager'",
      "  | 'area_manager'",
      "  | 'tenant_admin'",
      "  | 'platform_manager'",
      "  | 'platform_admin'",
      "  | 'tenant_overlay_cc'",
      "  | 'tenant_overlay_bcc'",
    ]),
    after: J([
      'export type EmailRecipientLayer =',
      "  | 'agent'",
      "  | 'manager'",
      "  | 'area_manager'",
      "  | 'tenant_admin'",
      "  | 'platform_manager'",
      "  | 'platform_admin'",
      "  | 'tenant_overlay_cc'",
      "  | 'tenant_overlay_bcc'",
      "  | 'lead_contact'",
    ]),
  },
  {
    name: 'p5_params_interface_extension',
    before: J([
      'export interface LogEmailRecipientsParams {',
      '  supabase: SupabaseClient',
      '  tenantId: string',
      '  leadId: string',
      '  agentId: string | null',
      '  recipients: LeadEmailRecipients',
      '  subject: string',
      '  templateKey: string',
      '  resendMessageId: string | null',
      '  status?: EmailStatus',
      '  sentAt?: Date | null',
      '}',
    ]),
    after: J([
      'export interface LogEmailRecipientsParams {',
      '  supabase: SupabaseClient',
      '  tenantId: string',
      '  leadId: string',
      '  agentId: string | null',
      '  recipients: LeadEmailRecipients',
      '  subject: string',
      '  templateKey: string',
      '  resendMessageId: string | null',
      '  status?: EmailStatus',
      '  sentAt?: Date | null',
      '  /** W4e.2 \u2014 when present and a recipient matches, that recipient is labeled',
      "   *  'lead_contact' instead of falling through to tenant_overlay_*. Used by",
      '   *  admin-composed customer-facing emails (POST send-email). */',
      '  leadContactEmail?: string | null',
      '}',
    ]),
  },
  {
    name: 'p6_resolveLayer_jsdoc',
    before: J([
      '/**',
      " * Resolve which layer label a recipient email belongs to, using the walker's",
      ' * resolved breakdown. Envelope position is required to disambiguate overlay',
      ' * variants (tenant_overlay_cc vs tenant_overlay_bcc).',
      ' *',
      ' * Order matters: principal roles checked before overlay fallback. Any email',
      " * that doesn't match a principal field becomes a tenant_overlay_* row. If the",
      " * email isn't a known delegate either, an audit anomaly is logged but the row",
      ' * is still written (audit completeness > schema purity \u2014 losing the row would',
      ' * silently break traceability).',
      ' */',
    ]),
    after: J([
      '/**',
      " * Resolve which layer label a recipient email belongs to, using the walker's",
      ' * resolved breakdown. Envelope position is required to disambiguate overlay',
      ' * variants (tenant_overlay_cc vs tenant_overlay_bcc).',
      ' *',
      ' * Order matters: lead_contact > principal roles > delegate overlay > anomaly.',
      ' * The leadContactEmail param (W4e.2) is checked first \u2014 when present and a',
      " * match, the row is labeled 'lead_contact'. Otherwise any email that does not",
      ' * match a principal field becomes a tenant_overlay_* row. If the email is not',
      ' * a known delegate either, an audit anomaly is logged but the row is still',
      ' * written (audit completeness > schema purity \u2014 losing the row would silently',
      ' * break traceability).',
      ' */',
    ]),
  },
  {
    name: 'p7_resolveLayer_signature_and_first_check',
    before: J([
      'function resolveLayer(',
      '  email: string,',
      "  resolved: LeadEmailRecipients['resolved'],",
      '  envelopePosition: EmailEnvelopePosition',
      '): EmailRecipientLayer {',
      "  if (resolved.agent === email) return 'agent'",
    ]),
    after: J([
      'function resolveLayer(',
      '  email: string,',
      "  resolved: LeadEmailRecipients['resolved'],",
      '  envelopePosition: EmailEnvelopePosition,',
      '  leadContactEmail: string | null | undefined',
      '): EmailRecipientLayer {',
      '  // W4e.2 \u2014 external customer recipient takes precedence over hierarchy checks.',
      "  // For admin-composed customer-facing emails, the lead's contact_email is the",
      "  // TO recipient and must be labeled 'lead_contact', not bucketed as overlay.",
      "  if (leadContactEmail && leadContactEmail === email) return 'lead_contact'",
      "  if (resolved.agent === email) return 'agent'",
    ]),
  },
  {
    name: 'p8_make_closure_pass_new_param',
    before: '    recipient_layer: resolveLayer(email, params.recipients.resolved, position),',
    after:  '    recipient_layer: resolveLayer(email, params.recipients.resolved, position, params.leadContactEmail),',
  },
]

for (const p of patches) {
  const count = source.split(p.before).length - 1
  if (count !== 1) {
    console.error('ABORT: patch "' + p.name + '" matched ' + count + ' times (expected 1).')
    console.error('  before-snippet (first 80 chars): ' + JSON.stringify(p.before.slice(0, 80)))
    fs.copyFileSync(backupPath, TARGET)
    console.error('RESTORED from backup; no changes written.')
    process.exit(1)
  }
  source = source.replace(p.before, p.after)
  console.log('APPLIED ' + p.name)
}

if (hasCRLF) {
  source = source.replace(/\n/g, '\r\n')
}

fs.writeFileSync(TARGET, source, 'utf8')
const finalSize = fs.statSync(TARGET).size
console.log('')
console.log('WROTE ' + TARGET + ' (' + finalSize + ' bytes)')
console.log('  was: 6314 bytes')
console.log('  delta: +' + (finalSize - 6314) + ' bytes')

console.log('')
console.log('=== Verification: lines mentioning lead_contact ===')
const finalContent = fs.readFileSync(TARGET, 'utf8')
const lines = finalContent.split(/\r?\n/)
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('lead_contact')) {
    console.log('L' + String(i+1).padStart(4) + ': ' + lines[i])
  }
}

console.log('')
console.log('Backup: ' + backupPath)