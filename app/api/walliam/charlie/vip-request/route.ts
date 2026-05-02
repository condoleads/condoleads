// app/api/walliam/charlie/vip-request/route.ts
// WALLiam VIP plan request â€” no questionnaire, user already registered
// Adapted from app/api/chat/vip-request/route.ts â€” System 1 never touched

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTenantEmail, TenantEmailNotConfigured, TenantEmailFailed } from '@/lib/email/sendTenantEmail'
import { walkHierarchy } from '@/lib/admin-homes/hierarchy'


const ADMIN_EMAIL = 'condoleads.ca@gmail.com'

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
    // planType: 'buyer' | 'seller'

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
      .select('source_key, name, brand_name, domain, assistant_name, vip_auto_approve, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap, plan_auto_approve_limit, plan_manual_approve_limit, plan_hard_cap, estimator_manual_approve_attempts, estimator_hard_cap')
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
          id, full_name, email, notification_email,
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

    // Get user contact info from user_profiles â€” already registered, no form needed
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

    // Get manager email for CC
    let managerEmail: string | null = null
    if (agent?.parent_id) {
      const { data: manager } = await supabase
        .from('agents')
        .select('email, notification_email')
        .eq('id', agent.parent_id)
        .single()
      if (manager) managerEmail = manager.notification_email || manager.email
    }


    // Use tenant config for credit decisions
    const isAutoApprove = tenantConfig.vip_auto_approve === true && (tenantConfig.ai_auto_approve_limit ?? 0) > 0
    const autoApproveMessages = tenantConfig.ai_auto_approve_limit ?? 0

    // Create VIP request â€” no questionnaire fields required
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
        // WALLiam specific â€” no questionnaire fields (buyer_type, budget_range, timeline = null)
      })
      .select()
      .single()

    if (insertError || !vipRequest) {
      console.error('[walliam/vip-request] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${tenantDomain}`
    const approveUrl = `${baseUrl}/api/walliam/charlie/vip-approve?token=${vipRequest.approval_token}&action=approve`
    const denyUrl = `${baseUrl}/api/walliam/charlie/vip-approve?token=${vipRequest.approval_token}&action=deny`

    const emailHtml = buildAgentEmailHtml({
      userName,
      userEmail,
      userPhone,
      planType: planType || 'buyer',
      approveUrl,
      denyUrl,
      agentName: agent?.full_name || 'Agent',
      brandName,
      tenantDomain,
    })

    const agentEmail = agent?.notification_email || agent?.email

    // Email agent
    if (agentEmail) {
      try {
        await sendTenantEmail({
          tenantId: tenantId || '',
          to: agentEmail,
          cc: managerEmail ? [managerEmail] : undefined,
          bcc: [ADMIN_EMAIL],
          subject: `ðŸ”” VIP Plan Request â€” ${userName} (${planType === 'seller' ? 'Seller' : 'Buyer'} Plan)`,
          html: emailHtml,
        })
      } catch (err) {
        console.error('[walliam/vip-request] agent email error:', err)
      }
    }

    // Save lead â€” Phase 3.4: capture full hierarchy chain
    if (userEmail) {
      let leadManagerId: string | null = null
      let leadAreaManagerId: string | null = null
      if (agent?.id) {
        const chain = await walkHierarchy(agent.id, supabase)
        leadManagerId = chain.manager_id
        leadAreaManagerId = chain.area_manager_id
      }
      await supabase.from('leads').insert({
        agent_id: agent?.id || null,
        user_id: session.user_id || null,
        tenant_id: tenantId || null,
        manager_id: leadManagerId,
        area_manager_id: leadAreaManagerId,
        contact_name: userName,
        contact_email: userEmail,
        contact_phone: userPhone || null,
        source: `${sourceKey}_charlie_vip_request`,
        intent: planType || 'buyer',
        status: 'new',
        quality: 'hot',
        assignment_source: 'vip_request',
      })
    }

    // Auto-approve path
    if (isAutoApprove) {
      const currentGranted = session.vip_messages_granted || 0

      await supabase
        .from('chat_sessions')
        .update({
          status: 'vip',
          vip_accepted_at: new Date().toISOString(),
          vip_messages_granted: currentGranted + autoApproveMessages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)

      // Write to user_credit_overrides using tenant configured values
      if (session.user_id && tenantId) {
        const currentUsed = (session.buyer_plans_used || 0) + (session.seller_plans_used || 0)
        const newLimit = Math.min(currentUsed + autoApproveMessages, tenantConfig.plan_hard_cap ?? 10)
        await supabase.from('user_credit_overrides').upsert({
          user_id: session.user_id,
          tenant_id: tenantId,
          granted_by_agent_id: agent?.id || null,
          granted_by_tier: 'auto',
          note: 'Auto-approved â€” ' + autoApproveMessages + ' credits',
          buyer_plan_limit: newLimit,
          granted_at: new Date().toISOString(),
        }, { onConflict: 'user_id,tenant_id' })
      }

      if (userEmail) {
        try {
          await sendTenantEmail({
            tenantId: tenantId || '',
            to: userEmail,
            subject: `âœ¨ Your ${brandName} Plan Access is Approved`,
            html: buildUserApprovalEmailHtml(userName, agent?.full_name || brandName, autoApproveMessages, brandName, tenantDomain),
          })
        } catch (err) {
          console.error('[walliam/vip-request] user approval email error:', err)
        }
      }

      return NextResponse.json({
        success: true,
        requestId: vipRequest.id,
        status: 'approved',
        messagesGranted: autoApproveMessages,
        message: 'VIP plan access automatically approved',
      })
    }

    return NextResponse.json({
      success: true,
      requestId: vipRequest.id,
      status: 'pending',
      message: 'Request submitted â€” your agent will review shortly',
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
}): string {
  const planLabel = data.planType === 'seller' ? 'ðŸ’° Seller Plan' : 'ðŸ  Buyer Plan'

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 24px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 32px; margin-bottom: 8px;">âœ¦</div>
        <h1 style="color: white; margin: 0; font-size: 22px;">New VIP Plan Request</h1>
        <p style="color: rgba(255,255,255,0.5); margin: 6px 0 0; font-size: 13px;">${data.brandName} Â· ${planLabel}</p>
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
          âœ… Approve
        </a>
        <a href="${data.denyUrl}" style="display: inline-block; padding: 12px 28px; background: #ef4444; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          âŒ Deny
        </a>
        <p style="margin: 20px 0 0; font-size: 11px; color: #94a3b8;">
          Manage all requests at ${data.tenantDomain}/admin-homes/leads
        </p>
      </div>
    </div>
  `
}

function buildUserApprovalEmailHtml(userName: string, agentName: string, plansGranted: number, brandName: string, tenantDomain: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">âœ¦</div>
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
          <a href="${process.env.NEXT_PUBLIC_APP_URL || `https://${tenantDomain}`}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">
            âœ¦ Back to ${brandName}
          </a>
        </div>
      </div>
    </div>
  `
}