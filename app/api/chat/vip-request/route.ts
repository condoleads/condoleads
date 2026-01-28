// app/api/chat/vip-request/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const ADMIN_EMAIL = 'condoleads.ca@gmail.com'

// Use service client to bypass RLS
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Calculate messages to grant based on agent config and request source
 * Used for auto-approve flow
 */
function calculateAutoApproveMessages(agent: any, requestSource: string): number {
  const DEFAULT_AI_AUTO = 10
  const DEFAULT_ESTIMATOR_AUTO = 10

  if (requestSource === 'chat') {
    return agent.ai_auto_approve_limit ?? DEFAULT_AI_AUTO
  }

  // Estimator request
  if (agent.ai_estimator_enabled) {
    // AI Estimator enabled → use shared AI pool
    return agent.ai_auto_approve_limit ?? DEFAULT_AI_AUTO
  }

  // Basic estimator mode
  return agent.estimator_auto_approve_attempts ?? DEFAULT_ESTIMATOR_AUTO
}

export async function POST(request: NextRequest) {
  try {
    const { 
      sessionId, 
      phone, 
      fullName, 
      email, 
      budgetRange, 
      timeline, 
      buyerType, 
      requirements,
      pageUrl,
      buildingName,
      requestSource = 'chat' // NEW: 'chat' or 'estimator'
    } = await request.json()

    if (!sessionId || !phone) {
      return NextResponse.json(
        { error: 'Session ID and phone are required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Get session and agent info - include config fields
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select(`
        *, 
        agents(
          id, full_name, email, notification_email, vip_auto_approve,
          ai_chat_enabled, ai_estimator_enabled,
          ai_auto_approve_limit, estimator_auto_approve_attempts
        )
      `)
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      console.error('Session not found:', sessionError)
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
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

    // Get user data from user_profiles and auth.users
    let userEmail = email
    let userName = fullName
    let userPhone = ''

    if (session.user_id) {
      // Get name and phone from user_profiles
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, phone')
        .eq('id', session.user_id)
        .single()
      if (profile) {
        if (!userName || userName === 'Chat User') userName = profile.full_name
        if (profile.phone && profile.phone !== '00000000000') userPhone = profile.phone
      }

      // Get email from auth.users
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(session.user_id)
      if (authUser && authUser.user && !authError) {
        if (!userEmail) userEmail = authUser.user.email
      }
    }

    // Check if agent has auto-approve enabled
    const isAutoApprove = agent.vip_auto_approve === true

    // Calculate messages for auto-approve
    const autoApproveMessages = isAutoApprove ? calculateAutoApproveMessages(agent, requestSource) : 0

    // Create VIP request - include request_source and messages_granted
    const { data: vipRequest, error: insertError } = await supabase
      .from('vip_requests')
      .insert({
        session_id: sessionId,
        agent_id: agent.id,
        phone,
        full_name: userName || 'Chat User',
        email: userEmail,
        budget_range: budgetRange,
        timeline,
        buyer_type: buyerType,
        requirements,
        page_url: pageUrl,
        building_name: buildingName,
        request_source: requestSource, // NEW: Track source
        status: isAutoApprove ? 'approved' : 'pending',
        messages_granted: autoApproveMessages, // NEW: Track granted messages
        responded_at: isAutoApprove ? new Date().toISOString() : null
      })
      .select()
      .single()

    if (insertError || !vipRequest) {
      console.error('Error creating VIP request:', insertError)
      return NextResponse.json(
        { error: 'Failed to create request' },
        { status: 500 }
      )
    }

    // Build approval URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://condoleads.ca'
    const approveUrl = `${baseUrl}/api/chat/vip-approve?token=${vipRequest.approval_token}&action=approve`
    const denyUrl = `${baseUrl}/api/chat/vip-approve?token=${vipRequest.approval_token}&action=deny`

    // Build email HTML
    const emailHtml = buildApprovalEmailHtml({
      fullName: userName || 'Chat User',
      phone,
      email: userEmail,
      buildingName,
      pageUrl,
      approveUrl,
      denyUrl,
      agentName: agent.full_name,
      requestSource // NEW: Include in email
    })

    // Send email to agent
    const agentEmail = agent.notification_email || agent.email

    try {
      await resend.emails.send({
        from: 'CondoLeads <notifications@condoleads.ca>',
        to: agentEmail,
        subject: `🔔 VIP Access Request - ${phone}${requestSource === 'estimator' ? ' (Estimator)' : ''}`,
        html: emailHtml
      })
      console.log('VIP request email sent to agent:', agentEmail)
    } catch (emailError) {
      console.error('Failed to send agent email:', emailError)
    }

    // Send copy to admin
    try {
      await resend.emails.send({
        from: 'CondoLeads <notifications@condoleads.ca>',
        to: ADMIN_EMAIL,
        subject: `🔔 VIP Request [${agent.full_name}] - ${phone}${requestSource === 'estimator' ? ' (Estimator)' : ''}`,
        html: emailHtml
      })
      console.log('VIP request email sent to admin:', ADMIN_EMAIL)
    } catch (emailError) {
      console.error('Failed to send admin email:', emailError)
    }

    // Create lead for VIP request (only if we have email)
    console.log('VIP Lead creation - userEmail:', userEmail, 'phone:', phone, 'userName:', userName)
    
    if (userEmail) {
      const { error: leadError } = await supabase
        .from('leads')
        .insert({
          agent_id: agent.id,
          user_id: session.user_id,
          contact_name: userName || 'Chat User',
          contact_email: userEmail,
          contact_phone: phone,
          source: requestSource === 'estimator' ? 'estimator_vip_request' : 'vip_chat_request',
          source_url: pageUrl,
          building_id: session.current_page_type === 'building' ? session.current_page_id : null,
          message: `VIP ${requestSource === 'estimator' ? 'Estimator' : 'Chat'} Request - ${buildingName || 'General Inquiry'}`,
          status: 'new',
          quality: 'hot'
        })
      if (leadError) {
        console.error('Failed to create lead for VIP request:', leadError)
      } else {
        console.log('Lead created for VIP request')
      }
    } else {
      console.error('VIP Lead skipped - no email available. session.user_id:', session.user_id)
    }

    console.log('VIP Request created:', {
      requestId: vipRequest.id,
      sessionId,
      phone,
      requestSource,
      agentEmail,
      adminEmail: ADMIN_EMAIL,
      autoApproved: isAutoApprove,
      messagesGranted: autoApproveMessages
    })

    // If auto-approve, update session and send user email
    if (isAutoApprove) {
      // Update session with VIP status
      const currentGranted = session.vip_messages_granted || 0
      const newLimit = currentGranted + autoApproveMessages

      await supabase
        .from('chat_sessions')
        .update({
          status: 'vip',
          vip_accepted_at: new Date().toISOString(),
          vip_phone: phone,
          vip_messages_granted: newLimit,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)

      // Send approval email to user
      if (userEmail) {
        try {
          await resend.emails.send({
            from: 'CondoLeads <notifications@condoleads.ca>',
            to: userEmail,
            subject: `✨ VIP Access Approved - ${agent.full_name}`,
            html: buildUserApprovalEmailHtml(userName, agent.full_name, buildingName, autoApproveMessages)
          })
          console.log('Auto-approval email sent to user:', userEmail)
        } catch (emailError) {
          console.error('Failed to send user approval email:', emailError)
        }
      }

      return NextResponse.json({
        success: true,
        requestId: vipRequest.id,
        status: 'approved',
        messagesGranted: autoApproveMessages,
        message: 'VIP access automatically approved'
      })
    }

    return NextResponse.json({
      success: true,
      requestId: vipRequest.id,
      status: 'pending',
      message: 'Request submitted successfully'
    })

  } catch (error) {
    console.error('VIP request error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET: Check request status (for polling)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get('requestId')

    if (!requestId) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: vipRequest, error } = await supabase
      .from('vip_requests')
      .select('status, responded_at, buyer_type, messages_granted')
      .eq('id', requestId)
      .single()

    if (error || !vipRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    // Check if questionnaire was filled (buyer_type is required field)
    const questionnaireCompleted = !!vipRequest.buyer_type

    return NextResponse.json({
      status: vipRequest.status,
      respondedAt: vipRequest.responded_at,
      questionnaireCompleted,
      messagesGranted: vipRequest.messages_granted || 0
    })

  } catch (error) {
    console.error('VIP status check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function buildApprovalEmailHtml(data: {
  fullName: string
  phone: string
  email?: string
  buildingName?: string
  pageUrl?: string
  approveUrl: string
  denyUrl: string
  agentName: string
  requestSource: string
}): string {
  const sourceLabel = data.requestSource === 'estimator' ? '📊 Estimator' : '💬 Chat'
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 20px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🔔 New VIP Access Request</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Source: ${sourceLabel}</p>
      </div>

      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb;">
        <h2 style="margin-top: 0; color: #1f2937; font-size: 18px;">📋 Contact Information</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 100px;">Phone:</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: 600;">
              <a href="tel:${data.phone}" style="color: #2563eb; text-decoration: none;">${data.phone}</a>
            </td>
          </tr>
          ${data.fullName && data.fullName !== 'Chat User' ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Name:</td>
            <td style="padding: 8px 0; color: #1f2937;">${data.fullName}</td>
          </tr>
          ` : ''}
          ${data.email ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Email:</td>
            <td style="padding: 8px 0; color: #1f2937;">
              <a href="mailto:${data.email}" style="color: #2563eb; text-decoration: none;">${data.email}</a>
            </td>
          </tr>
          ` : ''}
          ${data.buildingName ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Building:</td>
            <td style="padding: 8px 0; color: #1f2937;">${data.buildingName}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Source:</td>
            <td style="padding: 8px 0; color: #1f2937;">${sourceLabel}</td>
          </tr>
        </table>
      </div>

      <div style="padding: 24px; text-align: center; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 20px; color: #6b7280;">
          Approve to grant this visitor <strong>additional access</strong> based on your configured limits.
        </p>

        <div>
          <a href="${data.approveUrl}" style="display: inline-block; padding: 14px 32px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-right: 12px;">
            ✅ Approve VIP
          </a>
          <a href="${data.denyUrl}" style="display: inline-block; padding: 14px 32px; background: #ef4444; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
            ❌ Deny
          </a>
        </div>

        <p style="margin: 20px 0 0; font-size: 12px; color: #9ca3af;">
          This request expires in 24 hours. You can also manage requests in your dashboard.
        </p>
      </div>
    </div>
  `
}

function buildUserApprovalEmailHtml(userName: string | null, agentName: string, buildingName?: string, messagesGranted?: number): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">✨</div>
        <h1 style="color: white; margin: 0; font-size: 24px;">VIP Access Approved!</h1>
      </div>
      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          Hi ${userName || 'there'}!
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          Great news! <strong>${agentName}</strong> has approved your VIP access request${buildingName ? ` for <strong>${buildingName}</strong>` : ''}.
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          You now have <strong>${messagesGranted || 10} additional messages</strong> with the AI assistant. Head back to the chat to continue your conversation!
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          ${agentName} may also reach out to you directly to help with your condo search.
        </p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
          Best regards,<br/>
          The CondoLeads Team
        </p>
      </div>
    </div>
  `
}