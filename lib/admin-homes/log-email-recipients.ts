// lib/admin-homes/log-email-recipients.ts
// W-LEADS-EMAIL T3a — audit-log writer for lead email fan-out.
// W-LEADS-EMAIL T3b-hotfix-A (2026-05-10) — aligned vocabulary with T2f schema CHECKs.
// W-LEADS-WORKBENCH W4e.2 (2026-05-14) — added 'lead_contact' layer label for
//   admin-composed customer-facing emails (POST send-email).
//
// Writes one row per recipient (TO/CC/BCC layers) into lead_email_recipients_log
// after sendTenantEmail succeeds.
//
// Schema reference (CHECK constraints — T2f migration 8e84040 + W4e.1 migration
// 20260514_w4e1_lerl_recipient_layer_lead_contact):
//   direction        IN ('to', 'cc', 'bcc')
//   recipient_layer  IN ('agent', 'manager', 'area_manager', 'tenant_admin',
//                        'platform_manager', 'platform_admin',
//                        'tenant_overlay_cc', 'tenant_overlay_bcc',
//                        'lead_contact')
//   status           IN ('queued', 'sent', 'delivered', 'bounced', 'failed', 'complained')
//
// Vocabulary mapping (recipients-helper internal names -> schema labels):
//   resolved.agent              -> 'agent'
//   resolved.manager            -> 'manager'
//   resolved.area_manager       -> 'area_manager'
//   resolved.tenant_admin       -> 'tenant_admin'
//   resolved.manager_platforms  -> 'platform_manager'
//   resolved.admin_platforms    -> 'platform_admin'
//   resolved.*_delegates        -> 'tenant_overlay_<cc|bcc>' by envelope position
//                                  (delegate granularity intentionally collapsed; recoverable
//                                   via JOIN to agent_delegations on (tenant_id, delegate_id))
//   unresolved (anomaly)        -> 'tenant_overlay_<cc|bcc>' + console.warn alarm
//   leadContactEmail (param)    -> 'lead_contact' (W4e.2 — external customer
//                                  recipient for admin-composed emails)
//
// Pattern at call sites:
//   const result = await sendTenantEmail({ tenantId, to, cc, bcc, subject, html })
//   if (lead?.id) {
//     await logEmailRecipients({
//       supabase, tenantId, leadId: lead.id, agentId,
//       recipients, subject,
//       templateKey: 'walliam_contact_lead_capture',
//       resendMessageId: result.id,
//     })
//   }
//
// Schema enforcement (append-only):
//   - DELETE blocked (trg_lerl_no_delete).
//   - UPDATE limited to status / sent_at / delivered_at / bounced_at /
//     resend_message_id (NULL -> value, once) via trg_lerl_status_only_update.
//
// Failure handling: insert errors log to console but do NOT throw. Audit
// failures must never block lead-write or email-send operations.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LeadEmailRecipients } from '@/lib/admin-homes/lead-email-recipients'

export type EmailEnvelopePosition = 'to' | 'cc' | 'bcc'

export type EmailRecipientLayer =
  | 'agent'
  | 'manager'
  | 'area_manager'
  | 'tenant_admin'
  | 'platform_manager'
  | 'platform_admin'
  | 'tenant_overlay_cc'
  | 'tenant_overlay_bcc'
  | 'lead_contact'

export type EmailStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'failed'
  | 'complained'

export interface LogEmailRecipientsParams {
  supabase: SupabaseClient
  tenantId: string
  leadId: string
  agentId: string | null
  recipients: LeadEmailRecipients
  subject: string
  templateKey: string
  resendMessageId: string | null
  status?: EmailStatus
  sentAt?: Date | null
  /** W4e.2 — when present and a recipient matches, that recipient is labeled
   *  'lead_contact' instead of falling through to tenant_overlay_*. Used by
   *  admin-composed customer-facing emails (POST send-email). */
  leadContactEmail?: string | null
}

interface AuditRow {
  tenant_id: string
  lead_id: string
  agent_id: string | null
  recipient_email: string
  recipient_layer: EmailRecipientLayer
  direction: EmailEnvelopePosition
  subject: string
  template_key: string
  resend_message_id: string | null
  status: EmailStatus
  sent_at: string | null
}

/**
 * Resolve which layer label a recipient email belongs to, using the walker's
 * resolved breakdown. Envelope position is required to disambiguate overlay
 * variants (tenant_overlay_cc vs tenant_overlay_bcc).
 *
 * Order matters: lead_contact > principal roles > delegate overlay > anomaly.
 * The leadContactEmail param (W4e.2) is checked first — when present and a
 * match, the row is labeled 'lead_contact'. Otherwise any email that does not
 * match a principal field becomes a tenant_overlay_* row. If the email is not
 * a known delegate either, an audit anomaly is logged but the row is still
 * written (audit completeness > schema purity — losing the row would silently
 * break traceability).
 */
function resolveLayer(
  email: string,
  resolved: LeadEmailRecipients['resolved'],
  envelopePosition: EmailEnvelopePosition,
  leadContactEmail: string | null | undefined
): EmailRecipientLayer {
  // W4e.2 — external customer recipient takes precedence over hierarchy checks.
  // For admin-composed customer-facing emails, the lead's contact_email is the
  // TO recipient and must be labeled 'lead_contact', not bucketed as overlay.
  if (leadContactEmail && leadContactEmail === email) return 'lead_contact'
  if (resolved.agent === email) return 'agent'
  if (resolved.manager === email) return 'manager'
  if (resolved.area_manager === email) return 'area_manager'
  if (resolved.tenant_admin === email) return 'tenant_admin'
  if (resolved.manager_platforms.includes(email)) return 'platform_manager'
  if (resolved.admin_platforms.includes(email)) return 'platform_admin'

  const isDelegate =
    resolved.agent_delegates.includes(email) ||
    resolved.manager_delegates.includes(email) ||
    resolved.area_manager_delegates.includes(email) ||
    resolved.tenant_admin_delegates.includes(email)

  if (!isDelegate) {
    console.warn('[T3 logEmailRecipients] email not classified in resolved chain — recording as tenant_overlay:', {
      email,
      envelopePosition,
    })
  }

  return envelopePosition === 'cc' ? 'tenant_overlay_cc' : 'tenant_overlay_bcc'
}

export async function logEmailRecipients(params: LogEmailRecipientsParams): Promise<void> {
  const status: EmailStatus = params.status ?? 'sent'
  const sentAtDate = params.sentAt !== undefined ? params.sentAt : status === 'sent' ? new Date() : null
  const sentAtIso = sentAtDate ? sentAtDate.toISOString() : null

  const rows: AuditRow[] = []

  const make = (email: string, position: EmailEnvelopePosition): AuditRow => ({
    tenant_id: params.tenantId,
    lead_id: params.leadId,
    agent_id: params.agentId,
    recipient_email: email,
    recipient_layer: resolveLayer(email, params.recipients.resolved, position, params.leadContactEmail),
    direction: position,
    subject: params.subject,
    template_key: params.templateKey,
    resend_message_id: params.resendMessageId,
    status,
    sent_at: sentAtIso,
  })

  for (const email of params.recipients.to) rows.push(make(email, 'to'))
  for (const email of params.recipients.cc) rows.push(make(email, 'cc'))
  for (const email of params.recipients.bcc) rows.push(make(email, 'bcc'))

  if (rows.length === 0) return

  const { error } = await params.supabase.from('lead_email_recipients_log').insert(rows)
  if (error) {
    console.error('[T3 logEmailRecipients] insert failed:', {
      tenantId: params.tenantId,
      leadId: params.leadId,
      templateKey: params.templateKey,
      rowCount: rows.length,
      error: error.message ?? error,
    })
  }
}
