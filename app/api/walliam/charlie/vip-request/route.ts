// app/api/walliam/charlie/vip-request/route.ts
// WALLiam VIP plan request — no questionnaire, user already registered
// Adapted from app/api/chat/vip-request/route.ts — System 1 never touched

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
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

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    const supabase = createServiceClient()

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
      .eq('source', 'walliam')
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const agent = session.agents

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
    let userName = 'WALLiam User'
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

    const isAutoApprove = agent?.vip_auto_approve === true
    const autoApproveMessages = agent?.ai_auto_approve_limit ?? 2

    // Create VIP request — no questionnaire fields required
    const { data: vipRequest, error: insertError } = await supabase
      .from('vip_requests')
      .insert({
        session_id: sessionId,
        agent_id: agent?.id || null,
        phone: userPhone || 'Not provided',
        full_name: userName,
        email: userEmail || null,
        request_source: 'walliam_charlie',
        status: isAutoApprove ? 'approved' : 'pending',
        messages_granted: isAutoApprove ? autoApproveMessages : 0,
        responded_at: isAutoApprove ? new Date().toISOString() : null,
        // WALLiam specific — no questionnaire fields (buyer_type, budget_range, timeline = null)
      })
      .select()
      .single()

    if (insertError || !vipRequest) {
      console.error('[walliam/vip-request] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'
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
    })

    const agentEmail = agent?.notification_email || agent?.email

    // Email agent
    if (agentEmail) {
      try {
        await resend.emails.send({
          from: 'WALLiam <notifications@condoleads.ca>',
          to: agentEmail,
          cc: managerEmail ? [managerEmail] : undefined,
          bcc: [ADMIN_EMAIL],
          subject: `🔔 VIP Plan Request — ${userName} (${planType === 'seller' ? 'Seller' : 'Buyer'} Plan)`,
          html: emailHtml,
        })
      } catch (err) {
        console.error('[walliam/vip-request] agent email error:', err)
      }
    }

    // Save lead
    if (userEmail) {
      await supabase.from('leads').insert({
        agent_id: agent?.id || null,
        user_id: session.user_id || null,
        contact_name: userName,
        contact_email: userEmail,
        contact_phone: userPhone || null,
        source: 'walliam_charlie_vip_request',
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

      if (userEmail) {
        try {
          await resend.emails.send({
            from: 'WALLiam <notifications@condoleads.ca>',
            to: userEmail,
            subject: '✨ Your WALLiam Plan Access is Approved',
            html: buildUserApprovalEmailHtml(userName, agent?.full_name || 'WALLiam', autoApproveMessages),
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
      message: 'Request submitted — your agent will review shortly',
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

    const supabase = createServiceClient()

    const { data: vipRequest } = await supabase
      .from('vip_requests')
      .select('status, responded_at, messages_granted')
      .eq('id', requestId)
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
}): string {
  const planLabel = data.planType === 'seller' ? '💰 Seller Plan' : '🏠 Buyer Plan'

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 24px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 32px; margin-bottom: 8px;">✦</div>
        <h1 style="color: white; margin: 0; font-size: 22px;">New VIP Plan Request</h1>
        <p style="color: rgba(255,255,255,0.5); margin: 6px 0 0; font-size: 13px;">WALLiam · ${planLabel}</p>
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
          Approve to grant this user additional WALLiam plan credits.
        </p>
        <a href="${data.approveUrl}" style="display: inline-block; padding: 12px 28px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-right: 12px; font-size: 14px;">
          ✅ Approve
        </a>
        <a href="${data.denyUrl}" style="display: inline-block; padding: 12px 28px; background: #ef4444; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          ❌ Deny
        </a>
        <p style="margin: 20px 0 0; font-size: 11px; color: #94a3b8;">
          Manage all requests at walliam.ca/admin-homes/leads
        </p>
      </div>
    </div>
  `
}

function buildUserApprovalEmailHtml(userName: string, agentName: string, plansGranted: number): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">✦</div>
        <h1 style="color: white; margin: 0; font-size: 24px;">Plan Access Approved</h1>
        <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0;">WALLiam AI Real Estate</p>
      </div>
      <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
          Hi ${userName},
        </p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
          <strong>${agentName}</strong> has approved your request for additional WALLiam plan credits.
          You now have <strong>${plansGranted} additional plan${plansGranted > 1 ? 's' : ''}</strong> available.
        </p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          Head back to WALLiam to generate your personalized real estate plan. Your agent may also reach out directly.
        </p>
        <div style="text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">
            ✦ Back to WALLiam
          </a>
        </div>
      </div>
    </div>
  `
}