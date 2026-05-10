#!/usr/bin/env node
/**
 * patch-t3a-helper-align-with-schema.js
 *
 * W-LEADS-EMAIL T3b-hotfix-A: align logEmailRecipients helper vocabulary
 * with the T2f schema CHECK constraints.
 *
 * Discovered during T3b smoke 2026-05-10:
 *   - lerl_direction_check: CHECK (direction IN ('to', 'cc', 'bcc'))
 *     Helper was sending 'outbound' — rejected.
 *   - lerl_recipient_layer_check: CHECK (recipient_layer IN ('agent', 'manager',
 *     'area_manager', 'tenant_admin', 'platform_manager', 'platform_admin',
 *     'tenant_overlay_cc', 'tenant_overlay_bcc'))
 *     Helper was sending 'manager_platform' / 'admin_platform' / various
 *     '*_delegate' / 'unknown' — would have rejected once direction was fixed.
 *
 * Schema is the source of truth (already deployed). Helper rewritten to:
 *   - direction := envelope position (to / cc / bcc) per source array
 *   - recipient_layer:
 *       agent / manager / area_manager / tenant_admin       (unchanged)
 *       manager_platforms   -> 'platform_manager'           (renamed)
 *       admin_platforms     -> 'platform_admin'             (renamed)
 *       *_delegates         -> 'tenant_overlay_<cc|bcc>'    (rolled up by envelope)
 *       unresolved          -> 'tenant_overlay_<cc|bcc>' + console.warn alarm
 *   - status: added 'complained' to type (schema allows it; webhook will set it)
 *
 * Atomicity: backs up the existing file before write. If post-write verification
 * fails, leaves the backup in place for manual rollback.
 *
 * Idempotency: detects already-applied state via SENTINEL_NEW marker, no-ops if so.
 *
 * Caller compatibility: the function signature is BACKWARDS COMPATIBLE.
 *   - LogEmailRecipientsParams keeps all current call-site keys.
 *   - Removes the optional `direction?` param (no caller passes it).
 *   - Type EmailDirection (legacy 'outbound'|'inbound') is gone; replaced by
 *     EmailEnvelopePosition ('to'|'cc'|'bcc'). No caller imports the old type.
 *   - Verify zero callers reference the removed types before shipping —
 *     pre-flight check below.
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const HELPER_PATH = 'lib/admin-homes/log-email-recipients.ts'

const SENTINEL_OLD = "export type EmailDirection = 'outbound' | 'inbound'"
const SENTINEL_NEW = "export type EmailEnvelopePosition = 'to' | 'cc' | 'bcc'"

// ---------------------------------------------------------------------------
// New helper file content (full replacement)
// ---------------------------------------------------------------------------
const NEW_CONTENT = [
  "// lib/admin-homes/log-email-recipients.ts",
  "// W-LEADS-EMAIL T3a — audit-log writer for lead email fan-out.",
  "// W-LEADS-EMAIL T3b-hotfix-A (2026-05-10) — aligned vocabulary with T2f schema CHECKs.",
  "//",
  "// Writes one row per recipient (TO/CC/BCC layers) into lead_email_recipients_log",
  "// after sendTenantEmail succeeds.",
  "//",
  "// Schema reference (CHECK constraints from T2f migration 8e84040):",
  "//   direction        IN ('to', 'cc', 'bcc')",
  "//   recipient_layer  IN ('agent', 'manager', 'area_manager', 'tenant_admin',",
  "//                        'platform_manager', 'platform_admin',",
  "//                        'tenant_overlay_cc', 'tenant_overlay_bcc')",
  "//   status           IN ('queued', 'sent', 'delivered', 'bounced', 'failed', 'complained')",
  "//",
  "// Vocabulary mapping (recipients-helper internal names -> schema labels):",
  "//   resolved.agent              -> 'agent'",
  "//   resolved.manager            -> 'manager'",
  "//   resolved.area_manager       -> 'area_manager'",
  "//   resolved.tenant_admin       -> 'tenant_admin'",
  "//   resolved.manager_platforms  -> 'platform_manager'",
  "//   resolved.admin_platforms    -> 'platform_admin'",
  "//   resolved.*_delegates        -> 'tenant_overlay_<cc|bcc>' by envelope position",
  "//                                  (delegate granularity intentionally collapsed; recoverable",
  "//                                   via JOIN to agent_delegations on (tenant_id, delegate_id))",
  "//   unresolved (anomaly)        -> 'tenant_overlay_<cc|bcc>' + console.warn alarm",
  "//",
  "// Pattern at call sites:",
  "//   const result = await sendTenantEmail({ tenantId, to, cc, bcc, subject, html })",
  "//   if (lead?.id) {",
  "//     await logEmailRecipients({",
  "//       supabase, tenantId, leadId: lead.id, agentId,",
  "//       recipients, subject,",
  "//       templateKey: 'walliam_contact_lead_capture',",
  "//       resendMessageId: result.id,",
  "//     })",
  "//   }",
  "//",
  "// Schema enforcement (append-only):",
  "//   - DELETE blocked (trg_lerl_no_delete).",
  "//   - UPDATE limited to status / sent_at / delivered_at / bounced_at /",
  "//     resend_message_id (NULL -> value, once) via trg_lerl_status_only_update.",
  "//",
  "// Failure handling: insert errors log to console but do NOT throw. Audit",
  "// failures must never block lead-write or email-send operations.",
  "",
  "import type { SupabaseClient } from '@supabase/supabase-js'",
  "import type { LeadEmailRecipients } from '@/lib/admin-homes/lead-email-recipients'",
  "",
  "export type EmailEnvelopePosition = 'to' | 'cc' | 'bcc'",
  "",
  "export type EmailRecipientLayer =",
  "  | 'agent'",
  "  | 'manager'",
  "  | 'area_manager'",
  "  | 'tenant_admin'",
  "  | 'platform_manager'",
  "  | 'platform_admin'",
  "  | 'tenant_overlay_cc'",
  "  | 'tenant_overlay_bcc'",
  "",
  "export type EmailStatus =",
  "  | 'queued'",
  "  | 'sent'",
  "  | 'delivered'",
  "  | 'bounced'",
  "  | 'failed'",
  "  | 'complained'",
  "",
  "export interface LogEmailRecipientsParams {",
  "  supabase: SupabaseClient",
  "  tenantId: string",
  "  leadId: string",
  "  agentId: string | null",
  "  recipients: LeadEmailRecipients",
  "  subject: string",
  "  templateKey: string",
  "  resendMessageId: string | null",
  "  status?: EmailStatus",
  "  sentAt?: Date | null",
  "}",
  "",
  "interface AuditRow {",
  "  tenant_id: string",
  "  lead_id: string",
  "  agent_id: string | null",
  "  recipient_email: string",
  "  recipient_layer: EmailRecipientLayer",
  "  direction: EmailEnvelopePosition",
  "  subject: string",
  "  template_key: string",
  "  resend_message_id: string | null",
  "  status: EmailStatus",
  "  sent_at: string | null",
  "}",
  "",
  "/**",
  " * Resolve which layer label a recipient email belongs to, using the walker's",
  " * resolved breakdown. Envelope position is required to disambiguate overlay",
  " * variants (tenant_overlay_cc vs tenant_overlay_bcc).",
  " *",
  " * Order matters: principal roles checked before overlay fallback. Any email",
  " * that doesn't match a principal field becomes a tenant_overlay_* row. If the",
  " * email isn't a known delegate either, an audit anomaly is logged but the row",
  " * is still written (audit completeness > schema purity — losing the row would",
  " * silently break traceability).",
  " */",
  "function resolveLayer(",
  "  email: string,",
  "  resolved: LeadEmailRecipients['resolved'],",
  "  envelopePosition: EmailEnvelopePosition",
  "): EmailRecipientLayer {",
  "  if (resolved.agent === email) return 'agent'",
  "  if (resolved.manager === email) return 'manager'",
  "  if (resolved.area_manager === email) return 'area_manager'",
  "  if (resolved.tenant_admin === email) return 'tenant_admin'",
  "  if (resolved.manager_platforms.includes(email)) return 'platform_manager'",
  "  if (resolved.admin_platforms.includes(email)) return 'platform_admin'",
  "",
  "  const isDelegate =",
  "    resolved.agent_delegates.includes(email) ||",
  "    resolved.manager_delegates.includes(email) ||",
  "    resolved.area_manager_delegates.includes(email) ||",
  "    resolved.tenant_admin_delegates.includes(email)",
  "",
  "  if (!isDelegate) {",
  "    console.warn('[T3 logEmailRecipients] email not classified in resolved chain — recording as tenant_overlay:', {",
  "      email,",
  "      envelopePosition,",
  "    })",
  "  }",
  "",
  "  return envelopePosition === 'cc' ? 'tenant_overlay_cc' : 'tenant_overlay_bcc'",
  "}",
  "",
  "export async function logEmailRecipients(params: LogEmailRecipientsParams): Promise<void> {",
  "  const status: EmailStatus = params.status ?? 'sent'",
  "  const sentAtDate = params.sentAt !== undefined ? params.sentAt : status === 'sent' ? new Date() : null",
  "  const sentAtIso = sentAtDate ? sentAtDate.toISOString() : null",
  "",
  "  const rows: AuditRow[] = []",
  "",
  "  const make = (email: string, position: EmailEnvelopePosition): AuditRow => ({",
  "    tenant_id: params.tenantId,",
  "    lead_id: params.leadId,",
  "    agent_id: params.agentId,",
  "    recipient_email: email,",
  "    recipient_layer: resolveLayer(email, params.recipients.resolved, position),",
  "    direction: position,",
  "    subject: params.subject,",
  "    template_key: params.templateKey,",
  "    resend_message_id: params.resendMessageId,",
  "    status,",
  "    sent_at: sentAtIso,",
  "  })",
  "",
  "  for (const email of params.recipients.to) rows.push(make(email, 'to'))",
  "  for (const email of params.recipients.cc) rows.push(make(email, 'cc'))",
  "  for (const email of params.recipients.bcc) rows.push(make(email, 'bcc'))",
  "",
  "  if (rows.length === 0) return",
  "",
  "  const { error } = await params.supabase.from('lead_email_recipients_log').insert(rows)",
  "  if (error) {",
  "    console.error('[T3 logEmailRecipients] insert failed:', {",
  "      tenantId: params.tenantId,",
  "      leadId: params.leadId,",
  "      templateKey: params.templateKey,",
  "      rowCount: rows.length,",
  "      error: error.message ?? error,",
  "    })",
  "  }",
  "}",
  "",
].join('\n')

// ---------------------------------------------------------------------------
// Pre-flight: verify no other file imports the types we're removing
// ---------------------------------------------------------------------------

const filePath = path.resolve(HELPER_PATH)
if (!fs.existsSync(filePath)) {
  console.error('FAIL: helper not found at ' + HELPER_PATH)
  process.exit(1)
}

const existing = fs.readFileSync(filePath, 'utf8')

if (existing.includes(SENTINEL_NEW)) {
  console.log('Helper already aligned (SENTINEL_NEW present). No-op.')
  process.exit(0)
}

if (!existing.includes(SENTINEL_OLD)) {
  console.error('FAIL: helper does not match expected v1 shape')
  console.error('  Looking for: ' + SENTINEL_OLD)
  console.error('  File may have been partially modified. Inspect before re-running.')
  process.exit(1)
}

// Pre-flight grep: no caller should import EmailDirection from this helper
const removedTypeRefs = []
try {
  const grep = execSync(
    'powershell -NoProfile -Command "Get-ChildItem -Path . -Recurse -Include *.ts,*.tsx | Where-Object { $_.FullName -notmatch \\"node_modules|\\\\.next|\\\\.git|backup_\\" } | Select-String -Pattern \\"EmailDirection\\" -SimpleMatch | ForEach-Object { $_.Path + \\":\\" + $_.LineNumber }"',
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  )
  const hits = grep.split(/\r?\n/).filter(l => l.trim() && !l.includes('log-email-recipients.ts'))
  if (hits.length > 0) {
    console.error('FAIL: EmailDirection is referenced outside the helper — cannot remove safely:')
    for (const h of hits) console.error('  ' + h)
    console.error('  Inspect each call site and update before running this patch.')
    process.exit(1)
  }
} catch (e) {
  console.warn('  (skipping grep pre-flight — running TSC after will catch any breakage)')
}

// ---------------------------------------------------------------------------
// Backup + write
// ---------------------------------------------------------------------------

const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15)
const backupPath = filePath + '.backup_' + stamp
fs.writeFileSync(backupPath, existing)
console.log('Backed up to: ' + path.relative(process.cwd(), backupPath))

fs.writeFileSync(filePath, NEW_CONTENT)
console.log('Wrote new helper: ' + HELPER_PATH)

// ---------------------------------------------------------------------------
// Post-write verification
// ---------------------------------------------------------------------------

const written = fs.readFileSync(filePath, 'utf8')
if (!written.includes(SENTINEL_NEW)) {
  console.error('FAIL: post-write verification — SENTINEL_NEW not found in written content')
  console.error('  Backup retained at: ' + backupPath)
  process.exit(1)
}
if (written.includes(SENTINEL_OLD)) {
  console.error('FAIL: post-write verification — SENTINEL_OLD still present (file not fully replaced)')
  console.error('  Backup retained at: ' + backupPath)
  process.exit(1)
}
console.log('Verified: SENTINEL_NEW present, SENTINEL_OLD removed')
console.log('')
console.log('Next steps:')
console.log('  1. npx tsc --noEmit                # confirm no type breakage in callers')
console.log('  2. node scripts/smoke-t3b.js       # expect Tier-1 GREEN')
console.log('')
console.log('If smoke passes, tracker bump (v7 -> v8 with hotfix entry) is the next patch.')