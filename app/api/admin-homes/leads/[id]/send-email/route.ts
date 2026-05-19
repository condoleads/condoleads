// app/api/admin-homes/leads/[id]/send-email/route.ts
// W-LEADS-WORKBENCH W4e.4 (2026-05-14)
//
// POST endpoint for admin/agent to compose and send a customer-facing email
// to the lead's contact_email. Internal hierarchy is BCC'd via the 6-layer
// fan-out from getLeadEmailRecipients (agent + manager + area_manager +
// tenant_admin + delegates + platform_manager + platform_admin).
//
// MULTITENANT CONTRACT (Rule Zero #1)
//   - Every query scoped by lead.tenant_id (NOT user.tenantId).
//   - can('lead.write') enforces cross-tenant gate via permissions.ts.
//   - sendTenantEmail uses the LEAD's tenant's Resend credentials.
//
// PERMISSION CONTRACT
//   can(user.permissions, 'lead.write', { kind: 'lead', ... }) - reuses the
//   existing lead.write action (same gate as PATCH). Sending a customer-
//   facing email is a write-class action on the lead.
//
// ENVELOPE REWRITE
//   getLeadEmailRecipients returns the standard agent-as-TO chain:
//     TO = [agent_email], CC = [manager_email], BCC = [everyone else]
//   This route rewrites that for customer-facing send:
//     TO  = [lead.contact_email]
//     CC  = []
//     BCC = all hierarchy emails (agent + manager + area_manager +
//           tenant_admin + their delegates + platform_manager + platform_admin)
//     Reply-To = agent_email (so customer replies route to the assigned agent)
//   The same `resolved` chain is passed to logEmailRecipients so each BCC
//   recipient is labeled with its correct hierarchy layer.
//
// AUDIT
//   - logEmailRecipients writes one row per envelope recipient into
//     lead_email_recipients_log with template_key = 'admin_composed'. The
//     TO recipient (lead.contact_email) is labeled 'lead_contact' via the
//     W4e.2 leadContactEmail param.
//   - logLeadAdminAction writes one row into lead_admin_actions with
//     action_type = 'email_sent' and afterValue containing the send summary.
//   - Both audits are best-effort (never-throw). On send failure (502),
//     no audit row is written.
//
// REQUEST BODY
//   { subject: string, body: string }
//   - subject: 1..998 chars (RFC 5322 line length cap)
//   - body:    1..100000 chars, plain text. CRLF/LF converted to <br>.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'
import {
  getLeadEmailRecipients,
  sendTenantEmail,
  TenantEmailNotConfigured,
  TenantEmailFailed,
  type LeadEmailRecipients,
} from '@/lib/admin-homes/lead-email-recipients'
import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'
import { logLeadAdminAction } from '@/lib/admin-homes/log-lead-admin-action'

const MAX_SUBJECT_LEN = 998
const MAX_BODY_LEN = 100_000

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await resolveAdminHomesUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServiceClient()

    const { data: lead } = await supabase
      .from('leads')
      .select('id, tenant_id, agent_id, status, contact_email, contact_name')
      .eq('id', params.id)
      .maybeSingle()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    if (!lead.contact_email) {
      return NextResponse.json({ error: 'Lead has no contact email' }, { status: 400 })
    }

    const decision = can(user.permissions, 'lead.write', {
      kind: 'lead',
      leadId: lead.id,
      tenantId: lead.tenant_id,
      agentId: lead.agent_id,
    })
    if (!decision.ok) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status })
    }

    // W6c-DNC: legal-compliance block. When a lead's status is do_not_contact,
    // outbound customer-facing email is denied at the server with 409. The
    // attempted send is audit-logged (action_type=email_blocked_dnc) so legal
    // can produce a trail of suppressed contact attempts under CASL / TCPA.
    // Audit write is best-effort (never-throw via logLeadAdminAction); the 409
    // response is the legal enforcement, the audit is the evidentiary trail.
    if (lead.status === 'do_not_contact') {
      const actorRoleForBlock = user.role || (user.isPlatformAdmin ? 'platform_admin' : 'admin')
      await logLeadAdminAction({
        supabase,
        tenantId: lead.tenant_id,
        leadId: lead.id,
        actorAgentId: user.agentId || null,
        actorRole: actorRoleForBlock,
        actionType: 'email_blocked_dnc',
        targetField: null,
        beforeValue: null,
        afterValue: {
          attempted_to: lead.contact_email,
          reason: 'lead status is do_not_contact',
        },
        notes: 'outbound email blocked by DNC status',
      })
      return NextResponse.json({
        error: 'Outbound email blocked: lead is marked do_not_contact',
        code: 'DNC_BLOCK',
      }, { status: 409 })
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
    const messageBody = typeof body?.body === 'string' ? body.body : ''
    if (!subject) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }
    if (subject.length > MAX_SUBJECT_LEN) {
      return NextResponse.json({ error: `Subject exceeds ${MAX_SUBJECT_LEN} chars` }, { status: 400 })
    }
    if (!messageBody.trim()) {
      return NextResponse.json({ error: 'Body is required' }, { status: 400 })
    }
    if (messageBody.length > MAX_BODY_LEN) {
      return NextResponse.json({ error: `Body exceeds ${MAX_BODY_LEN} chars` }, { status: 400 })
    }

    // Resolve the standard 6-layer recipient chain to harvest hierarchy emails.
    // The chain's default envelope (TO=agent, CC=manager, BCC=others) is
    // rewritten below for customer-facing send.
    const baseRecipients = await getLeadEmailRecipients(lead.tenant_id, lead.agent_id, supabase)

    const hierarchyBcc: string[] = []
    const r = baseRecipients.resolved
    if (r.agent) hierarchyBcc.push(r.agent)
    if (r.manager) hierarchyBcc.push(r.manager)
    if (r.area_manager) hierarchyBcc.push(r.area_manager)
    if (r.tenant_admin) hierarchyBcc.push(r.tenant_admin)
    hierarchyBcc.push(...r.agent_delegates)
    hierarchyBcc.push(...r.manager_delegates)
    hierarchyBcc.push(...r.area_manager_delegates)
    hierarchyBcc.push(...r.tenant_admin_delegates)
    hierarchyBcc.push(...r.manager_platforms)
    hierarchyBcc.push(...r.admin_platforms)
    const dedupedBcc = Array.from(new Set(hierarchyBcc.filter(Boolean)))
      .filter((e) => e !== lead.contact_email)

    // Reply-To routes customer replies back to the assigned agent.
    // Falls back to undefined when the lead has no agent (orphan leads); in
    // that case Resend uses send_from as the implicit reply address.
    const replyTo = r.agent || undefined

    const html = buildHtml({
      contactName: lead.contact_name || null,
      subject,
      body: messageBody,
    })

    const customerEnvelope: LeadEmailRecipients = {
      to: [lead.contact_email],
      cc: [],
      bcc: dedupedBcc,
      resolved: baseRecipients.resolved,
    }

    let sendResult: { id: string; from: string }
    try {
      sendResult = await sendTenantEmail({
        tenantId: lead.tenant_id,
        to: customerEnvelope.to,
        cc: customerEnvelope.cc.length > 0 ? customerEnvelope.cc : undefined,
        bcc: customerEnvelope.bcc.length > 0 ? customerEnvelope.bcc : undefined,
        replyTo,
        subject,
        html,
      })
    } catch (e: any) {
      if (e instanceof TenantEmailNotConfigured) {
        return NextResponse.json({
          error: 'Email not configured for this tenant',
          detail: e.message,
          missing: e.missing,
        }, { status: 502 })
      }
      if (e instanceof TenantEmailFailed) {
        return NextResponse.json({
          error: 'Email send failed',
          detail: e.message,
        }, { status: 502 })
      }
      throw e
    }

    const actorRole = user.role || (user.isPlatformAdmin ? 'platform_admin' : 'admin')
    const recipientsTotal =
      customerEnvelope.to.length + customerEnvelope.cc.length + customerEnvelope.bcc.length

    // Audit writes are best-effort (never-throw). Run in parallel.
    await Promise.all([
      logEmailRecipients({
        supabase,
        tenantId: lead.tenant_id,
        leadId: lead.id,
        agentId: lead.agent_id,
        recipients: customerEnvelope,
        subject,
        templateKey: 'admin_composed',
        resendMessageId: sendResult.id,
        leadContactEmail: lead.contact_email,
      }),
      logLeadAdminAction({
        supabase,
        tenantId: lead.tenant_id,
        leadId: lead.id,
        actorAgentId: user.agentId || null,
        actorRole,
        actionType: 'email_sent',
        afterValue: {
          to: lead.contact_email,
          subject,
          message_id: sendResult.id,
          recipients_total: recipientsTotal,
          bcc_count: customerEnvelope.bcc.length,
        },
        notes: subject,
      }),
    ])

    return NextResponse.json({
      success: true,
      message_id: sendResult.id,
      recipients_total: recipientsTotal,
    })
  } catch (error) {
    console.error('[admin-homes/leads/[id]/send-email POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildHtml(args: { contactName: string | null; subject: string; body: string }): string {
  const safeBody = escapeHtml(args.body).replace(/\r?\n/g, '<br>')
  const firstName = args.contactName ? args.contactName.trim().split(' ')[0] : ''
  const greeting = firstName ? `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(firstName)},</p>` : ''
  return [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8"><title>' + escapeHtml(args.subject) + '</title></head>',
    '<body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#1f2937;">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:32px;line-height:1.6;font-size:15px;">',
    greeting,
    '<div>' + safeBody + '</div>',
    '</div></body></html>',
  ].join('')
}