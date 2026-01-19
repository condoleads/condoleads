// app/api/chat/vip-approve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    const supabase = createClient()

    // Find the VIP request by token
    const { data: vipRequest, error: findError } = await supabase
      .from('vip_requests')
      .select('*, chat_sessions(*)')
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

    // Update VIP request status
    const { error: updateError } = await supabase
      .from('vip_requests')
      .update({
        status: newStatus,
        responded_at: new Date().toISOString()
      })
      .eq('id', vipRequest.id)

    if (updateError) {
      console.error('Error updating VIP request:', updateError)
      return createHtmlResponse('error', 'Failed to process request. Please try again.')
    }

    if (action === 'approve') {
      // Grant VIP access to the session
      const currentCount = vipRequest.chat_sessions?.message_count || 0
      const newLimit = currentCount + 10

      await supabase
        .from('chat_sessions')
        .update({
          status: 'vip',
          vip_accepted_at: new Date().toISOString(),
          vip_phone: vipRequest.phone,
          vip_messages_granted: newLimit,
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
            notes: `VIP approved - ${vipRequest.buyer_type}, Budget: ${vipRequest.budget_range || 'N/A'}, Timeline: ${vipRequest.timeline || 'N/A'}`,
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
            notes: `VIP approved - ${vipRequest.buyer_type}, Budget: ${vipRequest.budget_range || 'N/A'}, Timeline: ${vipRequest.timeline || 'N/A'}`
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

      console.log('VIP Approved:', { requestId: vipRequest.id, sessionId: vipRequest.session_id, newLimit })
      return createHtmlResponse('approved', `VIP access granted to ${vipRequest.full_name}. They now have 10 additional messages.`)
    } else {
      console.log('VIP Denied:', { requestId: vipRequest.id, sessionId: vipRequest.session_id })
      return createHtmlResponse('denied', `VIP request from ${vipRequest.full_name} has been denied.`)
    }

  } catch (error) {
    console.error('VIP approve error:', error)
    return createHtmlResponse('error', 'An unexpected error occurred.')
  }
}

function createHtmlResponse(status: string, message: string): NextResponse {
  const colors = {
    approved: { bg: '#10b981', icon: '', title: 'Approved!' },
    denied: { bg: '#ef4444', icon: '', title: 'Denied' },
    error: { bg: '#ef4444', icon: '', title: 'Error' },
    expired: { bg: '#f59e0b', icon: '', title: 'Expired' },
    already_processed: { bg: '#6b7280', icon: 'ℹ', title: 'Already Processed' }
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
