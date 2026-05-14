// app/api/admin-homes/leads/[id]/vip-approve/route.ts
// W-LEADS-WORKBENCH W4f (2026-05-14)
//
// POST endpoint for admin-side approve/deny of a VIP request bound to a lead.
// Mirrors the per-request_type behavior of the existing email-link approve
// endpoints (app/api/walliam/charlie/vip-approve, app/api/walliam/estimator/vip-approve)
// without touching them. Duplication logged as F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F.
//
// MULTITENANT CONTRACT (Rule Zero #1)
//   - Tenant boundary is lead.tenant_id (NOT user.tenantId).
//   - vip_requests fetched with WHERE id = vipRequestId AND tenant_id = lead.tenant_id
//     AND lead_id = lead.id (triple gate -- no cross-tenant or cross-lead approval).
//   - can('lead.write') enforces user's permission to act on this lead.
//
// REQUEST BODY
//   { vipRequestId: string (uuid), action: 'approve' | 'deny' }
//
// BEHAVIOR ON approve
//   1. UPDATE vip_requests SET status='approved', responded_at, messages_granted
//   2. UPDATE chat_sessions (if session_id) -- VIP status, counters
//   3. UPSERT user_credit_overrides:
//        - estimator request_type: estimator_limit only (preserves other pools)
//        - plan/chat request_type: all 3 pools (chat + plan + estimator)
//   4. Send confirmation email to vipRequest.email (if present)
//        - estimator: includes BCC chain via getLeadEmailRecipients
//        - plan/chat: no BCC chain (matches charlie endpoint)
//   5. Audit via logLeadAdminAction (action_type='vip_approved')
//
// BEHAVIOR ON deny
//   1. UPDATE vip_requests SET status='denied', responded_at, messages_granted=0
//   2. Audit via logLeadAdminAction (action_type='vip_denied')
//   3. No email, no credit grant, no session update
//
// IDEMPOTENCY
//   - status !== 'pending' returns 409 with current status
//   - expires_at < now returns 410 (marks row 'expired' first)

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'
import {
  getLeadEmailRecipients,
  sendTenantEmail,
  TenantEmailNotConfigured,
  TenantEmailFailed,
  AdminPlatformUnreachable,
} from '@/lib/admin-homes/lead-email-recipients'
import { getTenantContext, buildBaseUrl } from '@/lib/utils/tenant-brand'
import { logLeadAdminAction } from '@/lib/admin-homes/log-lead-admin-action'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await resolveAdminHomesUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServiceClient()

    // Fetch lead -- the lead's tenant_id is the trust boundary for this request.
    const { data: lead } = await supabase
      .from('leads')
      .select('id, tenant_id, agent_id, user_id, contact_email')
      .eq('id', params.id)
      .maybeSingle()

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const decision = can(user.permissions, 'lead.write', {
      kind: 'lead',
      leadId: lead.id,
      tenantId: lead.tenant_id,
      agentId: lead.agent_id,
    })
    if (!decision.ok) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status })
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const vipRequestId = typeof body?.vipRequestId === 'string' ? body.vipRequestId : ''
    const action = typeof body?.action === 'string' ? body.action : ''
    if (!vipRequestId) {
      return NextResponse.json({ error: 'vipRequestId is required' }, { status: 400 })
    }
    if (action !== 'approve' && action !== 'deny') {
      return NextResponse.json({ error: "action must be 'approve' or 'deny'" }, { status: 400 })
    }

    // Triple gate: id + tenant + lead binding. Prevents cross-tenant or cross-lead approval.
    const { data: vipRequest } = await supabase
      .from('vip_requests')
      .select('*, chat_sessions(*), agents(full_name, email, notification_email, parent_id, ai_manual_approve_limit)')
      .eq('id', vipRequestId)
      .eq('tenant_id', lead.tenant_id)
      .eq('lead_id', lead.id)
      .maybeSingle()

    if (!vipRequest) {
      return NextResponse.json({ error: 'VIP request not found for this lead' }, { status: 404 })
    }

    if (vipRequest.status !== 'pending') {
      return NextResponse.json(
        { error: 'VIP request is not pending', currentStatus: vipRequest.status },
        { status: 409 },
      )
    }

    if (new Date(vipRequest.expires_at) < new Date()) {
      await supabase
        .from('vip_requests')
        .update({ status: 'expired' })
        .eq('id', vipRequest.id)
      return NextResponse.json({ error: 'VIP request has expired' }, { status: 410 })
    }

    const isEstimator = vipRequest.request_type === 'estimator'
    const tenantId = lead.tenant_id
    const newStatus = action === 'approve' ? 'approved' : 'denied'

    // Compute messages_granted for the vip_requests UPDATE.
    // On deny: 0. On approve: per-type grant amount from tenant config.
    let messagesGranted = 0
    let tenantCfg: any = null
    if (action === 'approve') {
      if (isEstimator) {
        const r = await supabase
          .from('tenants')
          .select('estimator_manual_approve_attempts, estimator_hard_cap')
          .eq('id', tenantId)
          .single()
        tenantCfg = r.data
        messagesGranted = tenantCfg?.estimator_manual_approve_attempts ?? 3
      } else {
        const agent = (vipRequest as any).agents
        messagesGranted = agent?.ai_manual_approve_limit ?? 3
        const r = await supabase
          .from('tenants')
          .select('plan_hard_cap, seller_plan_hard_cap, ai_hard_cap, estimator_hard_cap, ai_manual_approve_limit, plan_manual_approve_limit, estimator_manual_approve_attempts')
          .eq('id', tenantId)
          .single()
        tenantCfg = r.data
        if (tenantCfg?.plan_manual_approve_limit != null) {
          messagesGranted = tenantCfg.plan_manual_approve_limit
        }
      }
    }

    // Status flip on vip_requests.
    await supabase
      .from('vip_requests')
      .update({
        status: newStatus,
        responded_at: new Date().toISOString(),
        messages_granted: messagesGranted,
      })
      .eq('id', vipRequest.id)

    // On approve only: cascade side effects.
    if (action === 'approve') {
      const cs = (vipRequest as any).chat_sessions

      // Session-level VIP upgrade (if a session exists).
      if (vipRequest.session_id) {
        await supabase
          .from('chat_sessions')
          .update({
            status: 'vip',
            vip_accepted_at: new Date().toISOString(),
            vip_phone: vipRequest.phone,
            vip_messages_granted: (cs?.vip_messages_granted || 0) + messagesGranted,
            manual_approvals_count: (cs?.manual_approvals_count || 0) + 1,
            last_approval_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', vipRequest.session_id)
      }

      // user_credit_overrides UPSERT -- per-type pool grant.
      const userId = lead.user_id
      if (userId) {
        if (isEstimator) {
          // Estimator-only grant (matches estimator endpoint -- preserves other pools).
          const { data: ex } = await supabase
            .from('user_credit_overrides')
            .select('estimator_limit')
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .maybeSingle()
          const currentLimit = ex?.estimator_limit ?? 0
          const newLimit = Math.min(currentLimit + messagesGranted, tenantCfg?.estimator_hard_cap ?? 50)
          await supabase
            .from('user_credit_overrides')
            .upsert(
              {
                user_id: userId,
                tenant_id: tenantId,
                granted_by_agent_id: vipRequest.agent_id || null,
                granted_by_tier: 'manager',
                note: 'Admin approve -- ' + messagesGranted + ' estimator credits granted',
                estimator_limit: newLimit,
                granted_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,tenant_id' },
            )
        } else {
          // Plan/chat: all 3 pools grant (matches charlie endpoint).
          const chatUsed = cs?.message_count || 0
          const planUsed = (cs?.buyer_plans_used || 0) + (cs?.seller_plans_used || 0)
          const estimatorUsed = cs?.estimator_count || 0
          const newChatLimit = Math.min(
            chatUsed + (tenantCfg?.ai_manual_approve_limit ?? 3),
            tenantCfg?.ai_hard_cap ?? 25,
          )
          const newPlanLimit = Math.min(
            planUsed + (tenantCfg?.plan_manual_approve_limit ?? 3),
            tenantCfg?.plan_hard_cap ?? 10,
          )
          const newEstimatorLimit = Math.min(
            estimatorUsed + (tenantCfg?.estimator_manual_approve_attempts ?? 3),
            tenantCfg?.estimator_hard_cap ?? 10,
          )
          await supabase
            .from('user_credit_overrides')
            .upsert(
              {
                user_id: userId,
                tenant_id: tenantId,
                granted_by_agent_id: vipRequest.agent_id || null,
                granted_by_tier: 'manager',
                note:
                  'Admin approve -- chat:' +
                  newChatLimit +
                  ' plans:' +
                  newPlanLimit +
                  ' estimator:' +
                  newEstimatorLimit,
                ai_chat_limit: newChatLimit,
                buyer_plan_limit: newPlanLimit,
                estimator_limit: newEstimatorLimit,
                granted_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,tenant_id' },
            )
        }
      }

      // Confirmation email to the requester (if email present).
      // estimator: includes BCC chain via helper.
      // plan/chat: no BCC chain (matches charlie endpoint).
      if (vipRequest.email) {
        const brandCtx = await getTenantContext(supabase, tenantId)
        const brandName = brandCtx?.brandName || ''
        const domain = brandCtx?.domain || ''
        const baseUrl = brandCtx?.domain ? buildBaseUrl(brandCtx.domain) : ''
        const agent = (vipRequest as any).agents
        const agentName = agent?.full_name || brandName
        const subject = isEstimator
          ? 'Your ' + brandName + ' Estimator Access is Approved'
          : 'Your ' + brandName + ' Plan Access is Approved'
        const html = buildApprovalEmailHtml({
          isEstimator,
          userName: vipRequest.full_name || '',
          agentName,
          messagesGranted,
          brandName,
          baseUrl,
          pageUrl: vipRequest.page_url || null,
        })

        let bccList: string[] = []
        let ccList: string[] = []
        if (isEstimator) {
          try {
            const recipients = await getLeadEmailRecipients(
              tenantId,
              vipRequest.agent_id || null,
              supabase,
            )
            bccList = recipients.bcc
          } catch (err) {
            if (err instanceof AdminPlatformUnreachable) {
              console.error('[w4f vip-approve] admin platform unreachable:', err.message)
              // Approve already recorded; surface as warning but don't fail the action.
            } else {
              console.error('[w4f vip-approve] unexpected recipients error:', err)
            }
          }
          if (agent?.parent_id) {
            const { data: mgr } = await supabase
              .from('agents')
              .select('email, notification_email')
              .eq('id', agent.parent_id)
              .single()
            if (mgr) {
              const mgrEmail = mgr.notification_email || mgr.email
              if (mgrEmail) ccList = [mgrEmail]
            }
          }
        }

        try {
          await sendTenantEmail({
            tenantId,
            to: vipRequest.email,
            cc: ccList.length > 0 ? ccList : undefined,
            bcc: bccList.length > 0 ? bccList : undefined,
            subject,
            html,
          })
        } catch (err) {
          if (err instanceof TenantEmailNotConfigured) {
            console.warn('[w4f vip-approve] tenant email not configured:', err.message)
          } else if (err instanceof TenantEmailFailed) {
            console.error('[w4f vip-approve] resend send failed:', err.message)
          } else {
            console.error('[w4f vip-approve] unexpected email error:', err)
          }
        }
      }
    }

    // Audit. Best-effort (never-throw inside helper).
    const actorRole =
      user.role || (user.isPlatformAdmin ? 'platform_admin' : 'admin')
    await logLeadAdminAction({
      supabase,
      tenantId: lead.tenant_id,
      leadId: lead.id,
      actorAgentId: user.agentId || null,
      actorRole,
      actionType: action === 'approve' ? 'vip_approved' : 'vip_denied',
      targetField: 'status',
      beforeValue: { status: 'pending' },
      afterValue: {
        status: newStatus,
        vip_request_id: vipRequest.id,
        request_type: vipRequest.request_type,
        request_source: vipRequest.request_source,
        messages_granted: messagesGranted,
      },
      notes: 'VIP request ' + action + 'd from admin workbench',
    })

    return NextResponse.json({
      success: true,
      vipRequestId: vipRequest.id,
      status: newStatus,
      messagesGranted,
    })
  } catch (error) {
    console.error('[admin-homes/leads/[id]/vip-approve POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function buildApprovalEmailHtml(args: {
  isEstimator: boolean
  userName: string
  agentName: string
  messagesGranted: number
  brandName: string
  baseUrl: string
  pageUrl: string | null
}): string {
  const accessLabel = args.isEstimator ? 'Estimator Access' : 'Plan Access'
  const unit = args.isEstimator ? 'estimate' : 'plan'
  const unitPlural = args.messagesGranted > 1 ? unit + 's' : unit
  const userGreeting = args.userName || 'there'
  const sourceLine =
    args.isEstimator && args.pageUrl
      ? '<p style="margin: 24px 0 0; text-align: center; color: #cbd5e1; font-size: 10px;">Source: <a href="' +
        args.pageUrl +
        '" style="color: #94a3b8; text-decoration: underline;">' +
        args.pageUrl +
        '</a></p>'
      : ''

  return [
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">',
    '  <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">',
    '    <div style="font-size: 48px; margin-bottom: 12px;">\u2728</div>',
    '    <h1 style="color: white; margin: 0; font-size: 24px;">' + accessLabel + ' Approved</h1>',
    '    <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0;">' + args.brandName + ' AI Real Estate</p>',
    '  </div>',
    '  <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">',
    '    <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">Hi ' + userGreeting + ',</p>',
    '    <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;"><strong>' + args.agentName + '</strong> has approved your request. You now have <strong>' + args.messagesGranted + ' additional ' + unitPlural + '</strong> available on ' + args.brandName + '.</p>',
    '    <div style="text-align: center;">',
    '      <a href="' + args.baseUrl + '" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">Back to ' + args.brandName + '</a>',
    '    </div>',
    sourceLine,
    '  </div>',
    '</div>',
  ].join('')
}
