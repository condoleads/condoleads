// lib/admin-homes/log-email-recipients.ts
// W-LEADS-EMAIL T3a — audit-log writer for lead email fan-out.
//
// Writes one row per recipient (TO/CC/BCC layers) into lead_email_recipients_log
// after sendTenantEmail succeeds. Layer disambiguation uses LeadEmailRecipients.resolved
// to map each email back to its origin layer (agent / manager / area_manager /
// tenant_admin / manager_platform / admin_platform / *_delegate).
//
// Pattern at call sites (replace plain sendTenantEmail with this AFTER successful send):
//   const result = await sendTenantEmail({ tenantId, to, cc, bcc, subject, html })
//   await logEmailRecipients({
//     supabase, tenantId, leadId, agentId,
//     recipients, subject,
//     templateKey: 'walliam_contact_lead_capture',
//     resendMessageId: result.id,
//   })
//
// Schema: append-only.
//   - DELETE blocked entirely (trg_lerl_no_delete).
//   - UPDATE limited to status / sent_at / delivered_at / bounced_at /
//     resend_message_id (NULL -> value, once) via trg_lerl_status_only_update.
//   - All other columns immutable.
//
// Default behaviour: status='sent', sent_at=now() — the call site only invokes
// this AFTER sendTenantEmail returns successfully, so the row is written in its
// final-success state. Resend webhook integration for delivered/bounced
// transitions is a deferred T3-followup.
//
// Failure handling: insert errors log to console but do NOT throw. Audit log
// failures must never block lead-write or email-send operations.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LeadEmailRecipients } from '@/lib/admin-homes/lead-email-recipients'

export type EmailRecipientLayer =
  | 'agent'
  | 'manager'
  | 'area_manager'
  | 'tenant_admin'
  | 'manager_platform'
  | 'admin_platform'
  | 'agent_delegate'
  | 'manager_delegate'
  | 'area_manager_delegate'
  | 'tenant_admin_delegate'
  | 'unknown'

export type EmailDirection = 'outbound' | 'inbound'

export type EmailStatus = 'queued' | 'sent' | 'failed' | 'delivered' | 'bounced'

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
  direction?: EmailDirection
}

interface AuditRow {
  tenant_id: string
  lead_id: string
  agent_id: string | null
  recipient_email: string
  recipient_layer: EmailRecipientLayer
  direction: EmailDirection
  subject: string
  template_key: string
  resend_message_id: string | null
  status: EmailStatus
  sent_at: string | null
}

/**
 * Resolve which layer a given email belongs to using the walker's resolved breakdown.
 * Order matters: principals checked before their delegates, narrower before broader.
 * Falls back to 'unknown' for emails that don't match any resolved field — this can
 * happen if the walker emitted an email that's not catalogued (would be a bug worth
 * investigating; logging unknown is better than crashing).
 */
function resolveLayer(email: string, resolved: LeadEmailRecipients['resolved']): EmailRecipientLayer {
  if (resolved.agent === email) return 'agent'
  if (resolved.manager === email) return 'manager'
  if (resolved.area_manager === email) return 'area_manager'
  if (resolved.tenant_admin === email) return 'tenant_admin'
  if (resolved.manager_platforms.includes(email)) return 'manager_platform'
  if (resolved.admin_platforms.includes(email)) return 'admin_platform'
  if (resolved.agent_delegates.includes(email)) return 'agent_delegate'
  if (resolved.manager_delegates.includes(email)) return 'manager_delegate'
  if (resolved.area_manager_delegates.includes(email)) return 'area_manager_delegate'
  if (resolved.tenant_admin_delegates.includes(email)) return 'tenant_admin_delegate'
  return 'unknown'
}

export async function logEmailRecipients(params: LogEmailRecipientsParams): Promise<void> {
  const status: EmailStatus = params.status ?? 'sent'
  const sentAtDate = params.sentAt !== undefined ? params.sentAt : status === 'sent' ? new Date() : null
  const direction: EmailDirection = params.direction ?? 'outbound'
  const sentAtIso = sentAtDate ? sentAtDate.toISOString() : null

  const rows: AuditRow[] = []

  const make = (email: string, layer: EmailRecipientLayer): AuditRow => ({
    tenant_id: params.tenantId,
    lead_id: params.leadId,
    agent_id: params.agentId,
    recipient_email: email,
    recipient_layer: layer,
    direction,
    subject: params.subject,
    template_key: params.templateKey,
    resend_message_id: params.resendMessageId,
    status,
    sent_at: sentAtIso,
  })

  for (const email of params.recipients.to) {
    rows.push(make(email, resolveLayer(email, params.recipients.resolved)))
  }
  for (const email of params.recipients.cc) {
    rows.push(make(email, resolveLayer(email, params.recipients.resolved)))
  }
  for (const email of params.recipients.bcc) {
    rows.push(make(email, resolveLayer(email, params.recipients.resolved)))
  }

  if (rows.length === 0) return

  const { error } = await params.supabase.from('lead_email_recipients_log').insert(rows)
  if (error) {
    // Audit failures must not block lead/email operations. Log for ops visibility.
    console.error('[T3 logEmailRecipients] insert failed:', {
      tenantId: params.tenantId,
      leadId: params.leadId,
      templateKey: params.templateKey,
      rowCount: rows.length,
      error: error.message ?? error,
    })
  }
}