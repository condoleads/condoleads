// app/api/admin-homes/leads/[id]/reassign-agent/route.ts
// W-LEADS-WORKBENCH W6b (2026-05-18).
//
// POST endpoint to reassign a lead to a different agent within the same tenant.
//
// MULTITENANT CONTRACT (Rule Zero #1)
//   - Tenant boundary is lead.tenant_id (NOT user.tenantId).
//   - newAgent must be in the same tenant as lead (cross-tenant gate).
//   - Audit row written under lead.tenant_id.
//
// PERMISSION CONTRACT
//   - can('lead.write', {kind:'lead', leadId, tenantId, agentId}) gates baseline.
//   - Additional server-side role-scope validation (defense-in-depth, mirrors UI):
//       agent   -> 403 (reassign is hidden in UI; no agent destructive reassignment)
//       manager -> newAgentId must be in [user.agentId, ...user.managedAgentIds]
//                  (covers 5-value 'manager' and 'area_manager' via the 3-value
//                   AdminHomesRole rollup; area_manager managedAgentIds is
//                   depth-2 per auth.ts L86 -- F-AREA-MANAGER-SUBTREE-DEPTH-
//                   INCONSISTENCY honors existing system behavior, not fixed here)
//       admin   -> any active agent in tenant
//
// SIDE EFFECTS
//   1. Re-walk hierarchy for newAgent via walkHierarchy
//   2. UPDATE leads SET agent_id, manager_id, area_manager_id, tenant_admin_id
//      (updated_at is auto-set by the leads_updated_at BEFORE UPDATE trigger)
//   3. Audit via lead_admin_actions (action_type='agent_reassigned')
//
// IDEMPOTENCY
//   - newAgentId === lead.agent_id returns {success:true, noop:true} with no
//     DB writes (no UPDATE, no audit row).
//
// REQUEST BODY
//   { newAgentId: string (uuid) }
//
// RESPONSE
//   200 { success: true, agentId, hierarchyChain }
//   200 { success: true, noop: true } when newAgentId equals current
//   400 invalid body
//   401 unauthorized
//   403 permission denied / cross-tenant / role scope violation
//   404 lead not found / new agent not found
//   500 DB error

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'
import { walkHierarchy } from '@/lib/admin-homes/hierarchy'
import { logLeadAdminAction } from '@/lib/admin-homes/log-lead-admin-action'
import {
  sendTenantEmail,
  TenantEmailNotConfigured,
  TenantEmailFailed,
  type LeadEmailRecipients,
} from '@/lib/admin-homes/lead-email-recipients'
import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'
import { getTenantContext, buildBaseUrl } from '@/lib/utils/tenant-brand'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await resolveAdminHomesUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()

    // Fetch lead with hierarchy snapshot for audit before_value.
    const { data: lead } = await supabase
      .from('leads')
      .select('id, tenant_id, agent_id, manager_id, area_manager_id, tenant_admin_id, contact_email, contact_name, source, source_url, intent, geo_name')
      .eq('id', params.id)
      .maybeSingle()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
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

    // Parse + validate body
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const newAgentId = typeof body?.newAgentId === 'string' ? body.newAgentId.trim() : ''
    if (!newAgentId) {
      return NextResponse.json({ error: 'newAgentId is required' }, { status: 400 })
    }

    // Idempotency: no-op if already assigned to this agent
    if (newAgentId === lead.agent_id) {
      return NextResponse.json({ success: true, noop: true })
    }

    // Verify newAgent exists, is active, and is in the same tenant
    const { data: newAgent } = await supabase
      .from('agents')
      .select('id, full_name, tenant_id, role, is_active, email, notification_email')
      .eq('id', newAgentId)
      .maybeSingle()

    if (!newAgent) {
      return NextResponse.json({ error: 'New agent not found' }, { status: 404 })
    }
    if (newAgent.tenant_id !== lead.tenant_id) {
      return NextResponse.json(
        { error: 'Cross-tenant reassignment forbidden' },
        { status: 403 },
      )
    }
    if (newAgent.is_active !== true) {
      return NextResponse.json({ error: 'New agent is inactive' }, { status: 403 })
    }

    // Server-side role scope validation (defense-in-depth, mirrors UI gating)
    const userRole = user.role
    if (userRole === 'agent') {
      return NextResponse.json(
        { error: 'Agents cannot reassign leads' },
        { status: 403 },
      )
    }
    if (userRole === 'manager') {
      const allowed = new Set<string>()
      if (user.agentId) allowed.add(user.agentId)
      for (const id of user.managedAgentIds || []) allowed.add(id)
      if (!allowed.has(newAgentId)) {
        return NextResponse.json(
          { error: 'New agent is outside your management scope' },
          { status: 403 },
        )
      }
    }
    // userRole === 'admin' -> no further filter (covers tenant_admin, platform admins)

    // Re-walk hierarchy for the new agent
    const chain = await walkHierarchy(newAgentId, supabase)

    // Get old agent name for audit notes (best-effort)
    let oldAgentName: string | null = null
    if (lead.agent_id) {
      const { data: oldAgent } = await supabase
        .from('agents')
        .select('full_name')
        .eq('id', lead.agent_id)
        .maybeSingle()
      oldAgentName = (oldAgent as any)?.full_name || null
    }

    // UPDATE leads. Do NOT set updated_at -- trigger leads_updated_at handles it.
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        agent_id: newAgentId,
        manager_id: chain.manager_id,
        area_manager_id: chain.area_manager_id,
        tenant_admin_id: chain.tenant_admin_id,
      })
      .eq('id', lead.id)

    if (updateError) {
      console.error('[admin-homes reassign-agent] lead-update failed:', {
        leadId: lead.id,
        tenantId: lead.tenant_id,
        newAgentId,
        error: updateError,
      })
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Audit (never-throw)
    const actorRole = user.role || (user.isPlatformAdmin ? 'platform_admin' : 'admin')
    const oldLabel = oldAgentName || lead.agent_id || '(none)'
    const newLabel = newAgent.full_name || newAgentId
    await logLeadAdminAction({
      supabase,
      tenantId: lead.tenant_id,
      leadId: lead.id,
      actorAgentId: user.agentId || null,
      actorRole,
      actionType: 'agent_reassigned',
      targetField: 'agent_id',
      beforeValue: {
        agent_id: lead.agent_id,
        manager_id: lead.manager_id,
        area_manager_id: lead.area_manager_id,
        tenant_admin_id: lead.tenant_admin_id,
      },
      afterValue: {
        agent_id: newAgentId,
        manager_id: chain.manager_id,
        area_manager_id: chain.area_manager_id,
        tenant_admin_id: chain.tenant_admin_id,
      },
      notes: oldLabel + ' -> ' + newLabel,
    })

    // W6b-followup: notify the newly-assigned agent via email (never-throw).
    // Failure here does NOT roll back the reassign or change the response.
    const newAgentEmail = newAgent.notification_email || newAgent.email
    if (newAgentEmail) {
      try {
        const brandCtx = await getTenantContext(supabase, lead.tenant_id)
        const brandName = brandCtx?.brandName || ''
        const domain = brandCtx?.domain || ''
        const baseUrl = domain ? buildBaseUrl(domain) : ''
        const workbenchUrl = baseUrl ? (baseUrl + '/admin-homes/leads/' + lead.id) : '/admin-homes/leads/' + lead.id
        const contactLabel = lead.contact_name || lead.contact_email || lead.id
        const subjectPrefix = brandName ? ('[' + brandName + '] ') : ''
        const subject = subjectPrefix + 'New lead assigned: ' + contactLabel
        const html = buildReassignNotificationHtml({
          newAgentName: newAgent.full_name || 'there',
          contactName: lead.contact_name || null,
          contactEmail: lead.contact_email || null,
          source: lead.source || null,
          sourceUrl: lead.source_url || null,
          intent: lead.intent || null,
          geoName: lead.geo_name || null,
          workbenchUrl,
          brandName,
        })

        const sendResult = await sendTenantEmail({
          tenantId: lead.tenant_id,
          to: [newAgentEmail],
          subject,
          html,
        })

        const notificationEnvelope: LeadEmailRecipients = {
          to: [newAgentEmail],
          cc: [],
          bcc: [],
          resolved: {
            agent: newAgentEmail,
            manager: null,
            area_manager: null,
            tenant_admin: null,
            agent_delegates: [],
            manager_delegates: [],
            area_manager_delegates: [],
            tenant_admin_delegates: [],
            manager_platforms: [],
            admin_platforms: [],
          },
        }
        await Promise.all([
          logEmailRecipients({
            supabase,
            tenantId: lead.tenant_id,
            leadId: lead.id,
            agentId: newAgentId,
            recipients: notificationEnvelope,
            subject,
            templateKey: 'lead_reassigned_notification',
            resendMessageId: sendResult.id,
          }),
          logLeadAdminAction({
            supabase,
            tenantId: lead.tenant_id,
            leadId: lead.id,
            actorAgentId: user.agentId || null,
            actorRole,
            actionType: 'reassign_notification_sent',
            targetField: 'agent_id',
            afterValue: {
              new_agent_id: newAgentId,
              new_agent_email: newAgentEmail,
              message_id: sendResult.id,
              subject,
            },
            notes: 'Notification sent to ' + newLabel,
          }),
        ])
      } catch (e: any) {
        if (e instanceof TenantEmailNotConfigured) {
          console.warn('[reassign-agent] notification skipped -- tenant email not configured:', {
            tenantId: lead.tenant_id,
            leadId: lead.id,
            detail: e.message,
          })
        } else if (e instanceof TenantEmailFailed) {
          console.warn('[reassign-agent] notification send failed:', {
            tenantId: lead.tenant_id,
            leadId: lead.id,
            detail: e.message,
          })
        } else {
          console.error('[reassign-agent] unexpected notification error:', e)
        }
      }
    } else {
      console.warn('[reassign-agent] notification skipped -- new agent has no email:', { newAgentId })
    }

    return NextResponse.json({
      success: true,
      agentId: newAgentId,
      hierarchyChain: {
        manager_id: chain.manager_id,
        area_manager_id: chain.area_manager_id,
        tenant_admin_id: chain.tenant_admin_id,
      },
    })
  } catch (error) {
    console.error('[admin-homes/leads/[id]/reassign-agent POST] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function buildReassignNotificationHtml(args: {
  newAgentName: string
  contactName: string | null
  contactEmail: string | null
  source: string | null
  sourceUrl: string | null
  intent: string | null
  geoName: string | null
  workbenchUrl: string
  brandName: string
}): string {
  const firstName = (args.newAgentName.split(' ')[0] || args.newAgentName).trim()
  const contactLabel = args.contactName || args.contactEmail || '(no name)'
  const rows: string[] = []
  if (args.contactName) rows.push('<tr><td style="padding:6px 12px 6px 0;color:#6b7280;">Contact</td><td style="padding:6px 0;">' + escapeHtml(args.contactName) + '</td></tr>')
  if (args.contactEmail) rows.push('<tr><td style="padding:6px 12px 6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;">' + escapeHtml(args.contactEmail) + '</td></tr>')
  if (args.intent) rows.push('<tr><td style="padding:6px 12px 6px 0;color:#6b7280;">Intent</td><td style="padding:6px 0;">' + escapeHtml(args.intent) + '</td></tr>')
  if (args.geoName) rows.push('<tr><td style="padding:6px 12px 6px 0;color:#6b7280;">Area</td><td style="padding:6px 0;">' + escapeHtml(args.geoName) + '</td></tr>')
  if (args.source) rows.push('<tr><td style="padding:6px 12px 6px 0;color:#6b7280;">Source</td><td style="padding:6px 0;">' + escapeHtml(args.source) + '</td></tr>')
  if (args.sourceUrl) rows.push('<tr><td style="padding:6px 12px 6px 0;color:#6b7280;">URL</td><td style="padding:6px 0;word-break:break-all;"><a href="' + escapeHtml(args.sourceUrl) + '" style="color:#2563eb;">' + escapeHtml(args.sourceUrl) + '</a></td></tr>')
  const summaryTable = rows.length > 0
    ? '<table style="font-size:14px;margin:16px 0;">' + rows.join('') + '</table>'
    : ''
  const brandLine = args.brandName ? escapeHtml(args.brandName) : 'the platform'
  return [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8"><title>New lead assigned</title></head>',
    '<body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#1f2937;">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:32px;line-height:1.6;font-size:15px;">',
    '<p style="margin:0 0 12px 0;">Hi ' + escapeHtml(firstName) + ',</p>',
    '<p style="margin:0 0 12px 0;">A lead has been assigned to you on ' + brandLine + ': <strong>' + escapeHtml(contactLabel) + '</strong>.</p>',
    summaryTable,
    '<p style="margin:24px 0 0 0;">',
    '<a href="' + escapeHtml(args.workbenchUrl) + '" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500;">Open lead workbench</a>',
    '</p>',
    '<p style="margin:24px 0 0 0;color:#6b7280;font-size:13px;">This is an automated notification. You are receiving it because you were assigned this lead.</p>',
    '</div></body></html>',
  ].join('')
}
