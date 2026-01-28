// app/api/chat/vip-approve/route.ts
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

/**
 * Calculate messages to grant based on agent config and request source
 * 
 * Logic:
 * - If request_source = 'chat' → use ai_manual_approve_limit
 * - If request_source = 'estimator' AND ai_estimator_enabled → use ai_manual_approve_limit (shared pool)
 * - If request_source = 'estimator' AND !ai_estimator_enabled → use estimator_manual_approve_attempts
 */
function calculateMessagesToGrant(agent: any, requestSource: string): number {
  const DEFAULT_AI_MANUAL = 10
  const DEFAULT_ESTIMATOR_MANUAL = 10

  if (requestSource === 'chat') {
    return agent.ai_manual_approve_limit ?? DEFAULT_AI_MANUAL
  }

  // Estimator request
  if (agent.ai_estimator_enabled) {
    // AI Estimator enabled → use shared AI pool
    return agent.ai_manual_approve_limit ?? DEFAULT_AI_MANUAL
  }

  // Basic estimator mode
  return agent.estimator_manual_approve_attempts ?? DEFAULT_ESTIMATOR_MANUAL
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const action = searchParams.get('action')

    if (!token || !action) {
      return createHtmlResponse('error', 'Invalid request. Missing token or action.')
    }

    if (!['approve', 'deny'].includes(action)) {
      return createHtmlResponse('error', 'Invalid action. Must be approve or deny.')
    }

    const supabase = createServiceClient()

    // Find the VIP request by token - include agent config fields
    const { data: vipRequest, error: findError } = await supabase
      .from('vip_requests')
      .select(`
        *, 
        chat_sessions(*), 
        agents(
          full_name, email, notification_email,
          ai_chat_enabled, ai_estimator_enabled,
          ai_manual_approve_limit, estimator_manual_approve_attempts
        )
      `)
      .eq('approval_token', token)
      .single()

    if (findError || !vipRequest) {
      return createHtmlResponse('error', 'Request not found or link has expired.')
    }

    // Check if already processed
    if (vipRequest.status !== 'pending') {
      return createHtmlResponse('already_processed', `This request was already ${vipRequest.status}.`)
    }

    // Check if expired
    if (new Date(vipRequest.expires_at) < new Date()) {
      await supabase
        .from('vip_requests')
        .update({ status: 'expired' })
        .eq('id', vipRequest.id)

      return createHtmlResponse('expired', 'This request has expired.')
    }

    const newStatus = action === 'approve' ? 'approved' : 'denied'
    const agent = vipRequest.agents
    const requestSource = vipRequest.request_source || 'chat'

    // Calculate messages to grant based on config
    const messagesToGrant = calculateMessagesToGrant(agent, requestSource)

    // Update VIP request status with messages_granted
    const { error: updateError } = await supabase
      .from('vip_requests')
      .update({
        status: newStatus,
        responded_at: new Date().toISOString(),
        messages_granted: action === 'approve' ? messagesToGrant : 0
      })
      .eq('id', vipRequest.id)

    if (updateError) {
      console.error('Error updating VIP request:', updateError)
      return createHtmlResponse('error', 'Failed to process request. Please try again.')
    }

    if (action === 'approve') {
      // Calculate new limit
      const currentGranted = vipRequest.chat_sessions?.vip_messages_granted || 0
      const currentApprovals = vipRequest.chat_sessions?.manual_approvals_count || 0
      const newLimit = currentGranted + messagesToGrant

      // Grant VIP access to the session
      await supabase
        .from('chat_sessions')
        .update({
          status: 'vip',
          vip_accepted_at: new Date().toISOString(),
          vip_phone: vipRequest.phone,
          vip_messages_granted: newLimit,
          manual_approvals_count: currentApprovals + 1,
          last_approval_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', vipRequest.session_id)

      // Create or update lead
      if (vipRequest.chat_sessions?.lead_id) {
        await supabase
          .from('leads')
          .update({
            contact_phone: vipRequest.phone,
            contact_name: vipRequest.full_name,
            quality: 'hot',
            notes: `VIP approved - ${vipRequest.buyer_type || 'N/A'}, Budget: ${vipRequest.budget_range || 'N/A'}, Timeline: ${vipRequest.timeline || 'N/A'}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', vipRequest.chat_sessions.lead_id)
      } else {
        // Create new lead
        const { data: newLead } = await supabase
          .from('leads')
          .insert({
            agent_id: vipRequest.agent_id,
            contact_name: vipRequest.full_name,
            contact_email: vipRequest.email,
            contact_phone: vipRequest.phone,
            source: 'ai_chatbot_vip',
            quality: 'hot',
            status: 'new',
            notes: `VIP approved - ${vipRequest.buyer_type || 'N/A'}, Budget: ${vipRequest.budget_range || 'N/A'}, Timeline: ${vipRequest.timeline || 'N/A'}`
          })
          .select()
          .single()

        if (newLead) {
          await supabase
            .from('chat_sessions')
            .update({ lead_id: newLead.id })
            .eq('id', vipRequest.session_id)
        }
      }

      // Send approval email to user
      if (vipRequest.email) {
        try {
          await resend.emails.send({
            from: 'CondoLeads <notifications@condoleads.ca>',
            to: vipRequest.email,
            subject: `✨ VIP Access Approved - ${agent.full_name}`,
            html: buildUserApprovalEmail(vipRequest.full_name, agent.full_name, vipRequest.building_name, messagesToGrant)
          })
          console.log('Approval email sent to user:', vipRequest.email)
        } catch (emailError) {
          console.error('Failed to send user approval email:', emailError)
        }
      }

      console.log('VIP Approved:', { 
        requestId: vipRequest.id, 
        sessionId: vipRequest.session_id, 
        messagesToGrant,
        newLimit,
        requestSource
      })
      return createHtmlResponse('approved', `VIP access granted to ${vipRequest.full_name || vipRequest.phone}. They now have ${messagesToGrant} additional messages.`)
    } else {
      // Denied - no email to user, just block
      console.log('VIP Denied:', { requestId: vipRequest.id, sessionId: vipRequest.session_id })
      return createHtmlResponse('denied', `VIP request from ${vipRequest.full_name || vipRequest.phone} has been denied.`)
    }

  } catch (error) {
    console.error('VIP approve error:', error)
    return createHtmlResponse('error', 'An unexpected error occurred.')
  }
}

function buildUserApprovalEmail(userName: string | null, agentName: string, buildingName: string | null, messagesGranted: number): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">✨</div>
        <h1 style="color: white; margin: 0; font-size: 24px;">VIP Access Approved!</h1>
      </div>

      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb;">
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          Hi ${userName || 'there'}!
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          Great news! <strong>${agentName}</strong> has approved your VIP access request${buildingName ? ` for <strong>${buildingName}</strong>` : ''}.
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          You now have <strong>${messagesGranted} additional messages</strong> with the AI assistant. Head back to the chat to continue your conversation!
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          ${agentName} may also reach out to you directly to help with your condo search.
        </p>
      </div>

      <div style="padding: 16px 24px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">
          Questions? Contact ${agentName} directly.
        </p>
      </div>
    </div>
  `
}

function createHtmlResponse(status: string, message: string): NextResponse {
  const colors = {
    approved: { bg: '#10b981', icon: '✅', title: 'Approved!' },
    denied: { bg: '#ef4444', icon: '❌', title: 'Denied' },
    error: { bg: '#ef4444', icon: '⚠️', title: 'Error' },
    expired: { bg: '#f59e0b', icon: '⏰', title: 'Expired' },
    already_processed: { bg: '#6b7280', icon: 'ℹ️', title: 'Already Processed' }
  }

  const config = colors[status as keyof typeof colors] || colors.error

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>VIP Request - ${config.title}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f3f4f6;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .card {
          background: white;
          border-radius: 16px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          max-width: 400px;
          width: 100%;
          overflow: hidden;
        }
        .header {
          background: ${config.bg};
          padding: 32px;
          text-align: center;
        }
        .icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        .title {
          color: white;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 24px;
          text-align: center;
        }
        .message {
          color: #374151;
          font-size: 16px;
          line-height: 1.5;
        }
        .footer {
          padding: 16px 24px 24px;
          text-align: center;
        }
        .btn {
          display: inline-block;
          padding: 12px 24px;
          background: #3b82f6;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 500;
        }
        .btn:hover { background: #2563eb; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="icon">${config.icon}</div>
          <div class="title">${config.title}</div>
        </div>
        <div class="content">
          <p class="message">${message}</p>
        </div>
        <div class="footer">
          <a href="/admin/leads" class="btn">Go to Dashboard</a>
        </div>
      </div>
    </body>
    </html>
  `

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}