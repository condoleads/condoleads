// app/api/walliam/charlie/vip-request/route.ts
// WALLiam VIP plan request — no questionnaire, user already registered
// Adapted from app/api/chat/vip-request/route.ts — System 1 never touched
//
// W-HIERARCHY H3.8 (2026-05-03):
//   - getLeadEmailRecipients enforces 6-layer chain (was: inline manager-CC + hardcoded ADMIN_EMAIL)
//   - tenant_admin_id captured into lead insert payload (F58)
//   - F47 hardcoded ADMIN_EMAIL constant removed
//   - F66 walker call shape standardized via helper
//   - F67 try/catch standard

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { walkHierarchy } from '@/lib/admin-homes/hierarchy'
import {
  getLeadEmailRecipients,
  AdminPlatformUnreachable,
} from '@/lib/admin-homes/lead-email-recipients'
import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'
// W-EMAIL-TENANT-URL (2026-06-03): single source of truth for tenant URL resolution.
import { buildBaseUrl } from '@/lib/utils/tenant-brand'
// F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL (Phase 1): propagate email-delivery outcome.
import { attemptTenantEmail } from '@/lib/email/sendTenantEmail'


function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, planType } = await request.json()
    // planType: 'buyer' | 'seller' | 'chat' | 'estimator'

    // T6d - channel discriminator for VIP auto-approve config + credit-override column
    // F-VIP-AUTO-APPROVE-USES-CHAT-LIMIT-FOR-PLAN-REQUESTS + F-VIP-AUTO-APPROVE-ONLY-WRITES-BUYER-PLAN-LIMIT
    const channel: 'chat' | 'buyer_plan' | 'seller_plan' | 'estimator' =
      planType === 'chat' ? 'chat' :
      planType === 'estimator' ? 'estimator' :
      planType === 'seller' ? 'seller_plan' :
      'buyer_plan'

    // W-RECOVERY A1.5 auth gate (part 1) — block requests without sessionId
    if (!sessionId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // D2c — tenant required for branded emails + source-key filtering
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant required (missing x-tenant-id header)' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    const { data: tenantConfig, error: tenantConfigError } = await supabase
      .from('tenants')
      .select('source_key, name, brand_name, domain, assistant_name, vip_auto_approve, plan_vip_auto_approve, estimator_vip_auto_approve, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap, plan_auto_approve_limit, plan_manual_approve_limit, plan_hard_cap, seller_plan_auto_approve_limit, seller_plan_hard_cap, estimator_auto_approve_attempts, estimator_manual_approve_attempts, estimator_hard_cap')
      .eq('id', tenantId)
      .single()

    if (tenantConfigError || !tenantConfig?.source_key) {
      console.error('[walliam/vip-request] tenant config fetch failed:', tenantConfigError)
      return NextResponse.json({ error: 'Invalid tenant' }, { status: 400 })
    }

    const sourceKey = tenantConfig.source_key
    const brandName = (tenantConfig.brand_name || tenantConfig.name || '').trim()
    const tenantDomain = (tenantConfig.domain || '').trim()

    if (!brandName || !tenantDomain) {
      console.error('[walliam/vip-request] tenant misconfigured: brand_name or domain missing for', tenantId)
      return NextResponse.json({ error: 'Tenant configuration incomplete' }, { status: 500 })
    }

    // Get session + agent
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select(`
        *,
        agents (
          id, full_name, email, notification_email, parent_id,
          vip_auto_approve, ai_auto_approve_limit, ai_manual_approve_limit
        )
      `)
      .eq('id', sessionId)
      .eq('source', sourceKey)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    // W-RECOVERY A1.5 auth gate (part 2) — verify session belongs to a registered user
    if (!session.user_id) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    // END W-RECOVERY A1.5 auth gate

    const agent = session.agents

    // D2c — tenant-boundary check: session must belong to the tenant in the header
    if (session.tenant_id && session.tenant_id !== tenantId) {
      console.error('[walliam/vip-request] tenant mismatch: session.tenant_id=' + session.tenant_id + ' header tenantId=' + tenantId)
      return NextResponse.json({ error: 'Tenant mismatch' }, { status: 403 })
    }

    // Check for existing pending request
    const { data: existingRequest } = await supabase
      .from('vip_requests')
      .select('id, status')
      .eq('session_id', sessionId)
      .eq('status', 'pending')
      .single()

    if (existingRequest) {
      return NextResponse.json({
        success: true,
        requestId: existingRequest.id,
        status: 'pending',
        message: 'Request already pending'
      })
    }

    // Get user contact info from user_profiles — already registered, no form needed
    let userName = `${brandName} User`
    let userEmail = ''
    let userPhone = ''

    if (session.user_id) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, phone')
        .eq('id', session.user_id)
        .single()

      if (profile) {
        if (profile.full_name) userName = profile.full_name
        if (profile.phone && profile.phone !== '00000000000') userPhone = profile.phone
      }

      const { data: authUser } = await supabase.auth.admin.getUserById(session.user_id)
      if (authUser?.user?.email) userEmail = authUser.user.email
    }

    // Walk hierarchy chain — full chain capture
    let chainManagerId: string | null = null
    let chainAreaManagerId: string | null = null
    let chainTenantAdminId: string | null = null

    if (agent?.id) {
      const chain = await walkHierarchy(agent.id, supabase)
      chainManagerId = chain.manager_id
      chainAreaManagerId = chain.area_manager_id
      chainTenantAdminId = chain.tenant_admin_id
    }

    // Use tenant config for credit decisions - channel-aware per T6d
    const vipToggle =
      channel === 'chat' ? tenantConfig.vip_auto_approve === true :
      channel === 'estimator' ? tenantConfig.estimator_vip_auto_approve === true :
      tenantConfig.plan_vip_auto_approve === true
    const autoApproveLimit =
      channel === 'chat' ? (tenantConfig.ai_auto_approve_limit ?? 0) :
      channel === 'estimator' ? (tenantConfig.estimator_auto_approve_attempts ?? 0) :
      channel === 'seller_plan' ? (tenantConfig.seller_plan_auto_approve_limit ?? 0) :
      (tenantConfig.plan_auto_approve_limit ?? 0)
    const isAutoApprove = vipToggle && autoApproveLimit > 0
    const autoApproveMessages = autoApproveLimit

    // Create VIP request
    const { data: vipRequest, error: insertError } = await supabase
      .from('vip_requests')
      .insert({
        session_id: sessionId,
        agent_id: agent?.id || null,
        tenant_id: tenantId,
        phone: userPhone || 'Not provided',
        full_name: userName,
        email: userEmail || null,
        request_source: `${sourceKey}_charlie`,
        request_type: planType === 'chat' ? 'chat' : planType === 'estimator' ? 'estimator' : 'plan',
        status: isAutoApprove ? 'approved' : 'pending',
        messages_granted: isAutoApprove ? autoApproveMessages : 0,
        responded_at: isAutoApprove ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (insertError || !vipRequest) {
      console.error('[walliam/vip-request] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
    }

    // W-EMAIL-TENANT-URL (2026-06-03): use buildBaseUrl -- tenant domain first,
    // env fallback only when no tenant in scope. Prevents the platform-domain
    // leak that sent WALLiam approval links to www.condoleads.ca.
    const baseUrl = buildBaseUrl(tenantDomain)
    const approveUrl = `${baseUrl}/api/walliam/charlie/vip-approve?token=${vipRequest.approval_token}&action=approve`
    const denyUrl = `${baseUrl}/api/walliam/charlie/vip-approve?token=${vipRequest.approval_token}&action=deny`

    // W3c: capture source URL from referer for both leads.source_url + email render
    const pageUrl = headers().get('referer') || null

    const emailHtml = buildAgentEmailHtml({
      userName,
      userEmail,
      userPhone,
      planType: planType || 'buyer',
      approveUrl,
      denyUrl,
      sourceUrl: pageUrl,
      agentName: agent?.full_name || 'Agent',
      brandName,
      tenantDomain,
    })

    // Save lead with full hierarchy chain (per Lead+Email contract)
    let lead: { id: string } | null = null
    if (userEmail) {
      const { data, error: leadError } = await supabase.from('leads').insert({
        agent_id: agent?.id || null,
        user_id: session.user_id || null,
        tenant_id: tenantId,
        manager_id: chainManagerId,
        area_manager_id: chainAreaManagerId,
        tenant_admin_id: chainTenantAdminId,
        contact_name: userName,
        contact_email: userEmail,
        contact_phone: userPhone || null,
        source: `${sourceKey}_charlie_vip_request`,
        source_url: pageUrl,
        lead_origin_route: 'charlie_vip_request',
        intent: planType || 'buyer',
        status: 'new',
        assignment_source: agent?.id ? 'geo' : 'admin',
      }).select('id').single()
      if (leadError) console.error('[walliam/vip-request] lead error:', leadError)
      lead = data
    }

    // Chain notification — single helper-driven send (replaces inline manager-CC + hardcoded admin BCC)
    let recipients
    try {
      recipients = await getLeadEmailRecipients(tenantId, agent?.id || null, supabase)
    } catch (err) {
      if (err instanceof AdminPlatformUnreachable) {
        console.error('[walliam/vip-request] admin platform unreachable:', err.message)
        recipients = null
      } else {
        throw err
      }
    }

    // F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL (Phase 1): capture chain outcome.
    let chainOutcome: { sent: boolean; reason: 'delivered' | 'not_configured' | 'send_failed' | 'no_recipients' } =
      { sent: false, reason: 'no_recipients' }
    if (recipients) {
      const subject = `VIP Plan Request: ${userName} (${planType === 'seller' ? 'Seller' : 'Buyer'} Plan)`
      const outcome = await attemptTenantEmail(
        {
          tenantId: tenantId,
          to: recipients.to,
          cc: recipients.cc.length > 0 ? recipients.cc : undefined,
          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
          subject,
          html: emailHtml,
        },
        '[walliam/vip-request] chain'
      )
      chainOutcome = { sent: outcome.sent, reason: outcome.reason }
      if (outcome.sent && outcome.messageId && lead?.id) {
        await logEmailRecipients({
          supabase,
          tenantId,
          leadId: lead.id,
          agentId: agent?.id || null,
          recipients,
          subject,
          templateKey: 'walliam_charlie_vip_request_lead',
          resendMessageId: outcome.messageId,
        })
      }
    }

    // W-FUNNEL Phase 2 Commit B: persist chain-email delivery status for the
    // dashboard "not yet alerted" indicator. Runs AFTER chainOutcome resolves
    // (above) -- never writes 'sent' on a path that hasn't actually sent.
    if (lead?.id) {
      await supabase
        .from('leads')
        .update({ lead_email_delivery_status: chainOutcome.sent ? 'sent' : 'failed' })
        .eq('id', lead.id)
    }

    // Auto-approve path
    if (isAutoApprove) {
      const currentGranted = session.vip_messages_granted || 0

      // T6d-3 error capture
      const { error: sessionUpdateError } = await supabase
        .from('chat_sessions')
        .update({
          status: 'vip',
          vip_accepted_at: new Date().toISOString(),
          vip_messages_granted: currentGranted + autoApproveMessages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
      if (sessionUpdateError) {
        console.error('[walliam/vip-request] chat_sessions update failed:', sessionUpdateError)
      }

      // Write to user_credit_overrides using tenant configured values
      if (session.user_id && tenantId) {
        const currentUsed = (session.buyer_plans_used || 0) + (session.seller_plans_used || 0)
        const channelHardCap =
          channel === 'chat' ? (tenantConfig.ai_hard_cap ?? 10) :
          channel === 'estimator' ? (tenantConfig.estimator_hard_cap ?? 10) :
          channel === 'seller_plan' ? (tenantConfig.seller_plan_hard_cap ?? 10) :
          (tenantConfig.plan_hard_cap ?? 10)
        const newLimit = Math.min(currentUsed + autoApproveMessages, channelHardCap)
        const overrideColumn: 'ai_chat_limit' | 'buyer_plan_limit' | 'seller_plan_limit' | 'estimator_limit' =
          channel === 'chat' ? 'ai_chat_limit' :
          channel === 'estimator' ? 'estimator_limit' :
          channel === 'seller_plan' ? 'seller_plan_limit' :
          'buyer_plan_limit'
        // T6d-3 error capture
        const { error: overrideError } = await supabase.from('user_credit_overrides').upsert({
          user_id: session.user_id,
          tenant_id: tenantId,
          granted_by_agent_id: agent?.id || null,
          granted_by_tier: 'auto',
          note: 'Auto-approved — ' + autoApproveMessages + ' credits',
          [overrideColumn]: newLimit,
          granted_at: new Date().toISOString(),
        }, { onConflict: 'user_id,tenant_id' })
        if (overrideError) {
          console.error('[walliam/vip-request] user_credit_overrides upsert failed:', overrideError)
        }
      }

      // F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL (Phase 1): capture user-approval outcome.
      let userOutcome: { sent: boolean; reason: 'delivered' | 'not_configured' | 'send_failed' | 'no_user_email' } =
        { sent: false, reason: 'no_user_email' }
      if (userEmail) {
        const outcome = await attemptTenantEmail(
          {
            tenantId: tenantId,
            to: userEmail,
            subject: `Your ${brandName} Plan Access is Approved`,
            html: buildUserApprovalEmailHtml({
              userName,
              agentName: agent?.full_name || brandName,
              plansGranted: autoApproveMessages,
              brandName,
              tenantDomain,
              sourceUrl: pageUrl,
            }),
          },
          '[walliam/vip-request] user approval'
        )
        userOutcome = { sent: outcome.sent, reason: outcome.reason }
      }

      return NextResponse.json({
        success: true,
        requestId: vipRequest.id,
        status: 'approved',
        messagesGranted: autoApproveMessages,
        message: 'VIP plan access automatically approved',
        userEmailSent: userOutcome.sent,
        userEmailReason: userOutcome.reason,
        chainEmailSent: chainOutcome.sent,
        chainEmailReason: chainOutcome.reason,
      })
    }

    // Pending (not auto-approved): no user email sent yet (agent will trigger via approve).
    return NextResponse.json({
      success: true,
      requestId: vipRequest.id,
      status: 'pending',
      message: 'Request submitted — your agent will review shortly',
      userEmailSent: false,
      userEmailReason: 'not_attempted' as const,
      chainEmailSent: chainOutcome.sent,
      chainEmailReason: chainOutcome.reason,
    })

  } catch (error) {
    console.error('[walliam/vip-request] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET: Poll request status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get('requestId')

    if (!requestId) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
    }

    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant required (missing x-tenant-id header)' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    const { data: vipRequest } = await supabase
      .from('vip_requests')
      .select('status, responded_at, messages_granted')
      .eq('id', requestId)
      .eq('tenant_id', tenantId)
      .single()

    if (!vipRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    return NextResponse.json({
      status: vipRequest.status,
      respondedAt: vipRequest.responded_at,
      messagesGranted: vipRequest.messages_granted || 0,
    })

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function buildAgentEmailHtml(data: {
  userName: string
  userEmail: string
  userPhone: string
  planType: string
  approveUrl: string
  denyUrl: string
  agentName: string
  brandName: string
  tenantDomain: string
  sourceUrl?: string | null
}): string {
  const planLabel = data.planType === 'seller' ? '💰 Seller Plan' : '🏠 Buyer Plan'

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 24px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 32px; margin-bottom: 8px;">✦</div>
        <h1 style="color: white; margin: 0; font-size: 22px;">New VIP Plan Request</h1>
        <p style="color: rgba(255,255,255,0.5); margin: 6px 0 0; font-size: 13px;">${data.brandName} · ${planLabel}</p>
      </div>

      <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0;">
        <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 16px;">Contact</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 80px;">Name</td>
            <td style="padding: 6px 0; color: #1e293b; font-weight: 600;">${data.userName}</td>
          </tr>
          ${data.userEmail ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Email</td>
            <td style="padding: 6px 0;"><a href="mailto:${data.userEmail}" style="color: #2563eb;">${data.userEmail}</a></td>
          </tr>` : ''}
          ${data.userPhone ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Phone</td>
            <td style="padding: 6px 0;"><a href="tel:${data.userPhone}" style="color: #2563eb;">${data.userPhone}</a></td>
          </tr>` : ''}
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Plan</td>
            <td style="padding: 6px 0; color: #1e293b;">${planLabel}</td>
          </tr>
        </table>
      </div>

      <div style="padding: 24px; text-align: center; background: white; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 20px; color: #64748b; font-size: 14px;">
          Approve to grant this user additional ${data.brandName} plan credits.
        </p>
        <a href="${data.approveUrl}" style="display: inline-block; padding: 12px 28px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-right: 12px; font-size: 14px;">
          ✅ Approve
        </a>
        <a href="${data.denyUrl}" style="display: inline-block; padding: 12px 28px; background: #ef4444; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          ❌ Deny
        </a>
        <p style="margin: 20px 0 0; font-size: 11px; color: #94a3b8;">
          Manage all requests at ${data.tenantDomain}/admin-homes/leads
        </p>
        ${data.sourceUrl ? `<p style="margin: 4px 0 0; font-size: 10px; color: #cbd5e1;">Source: <a href="${data.sourceUrl}" style="color: #94a3b8; text-decoration: underline;">${data.sourceUrl}</a></p>` : ''}
      </div>
    </div>
  `
}

function buildUserApprovalEmailHtml(data: {
  userName: string
  agentName: string
  plansGranted: number
  brandName: string
  tenantDomain: string
  sourceUrl?: string | null
}): string {
  const { userName, agentName, plansGranted, brandName, tenantDomain, sourceUrl } = data
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">✦</div>
        <h1 style="color: white; margin: 0; font-size: 24px;">Plan Access Approved</h1>
        <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0;">${brandName} AI Real Estate</p>
      </div>
      <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
          Hi ${userName},
        </p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
          <strong>${agentName}</strong> has approved your request for additional ${brandName} plan credits.
          You now have <strong>${plansGranted} additional plan${plansGranted > 1 ? 's' : ''}</strong> available.
        </p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          Head back to ${brandName} to generate your personalized real estate plan. Your agent may also reach out directly.
        </p>
        <div style="text-align: center;">
          <a href="${buildBaseUrl(tenantDomain)}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">
            ✦ Back to ${brandName}
          </a>
        </div>
        ${sourceUrl ? `<p style="margin: 24px 0 0; text-align: center; color: #cbd5e1; font-size: 10px;">Source: <a href="${sourceUrl}" style="color: #94a3b8; text-decoration: underline;">${sourceUrl}</a></p>` : ''}
      </div>
    </div>
  `
}