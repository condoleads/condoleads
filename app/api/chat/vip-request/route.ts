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
      buildingName 
    } = await request.json()

    if (!sessionId || !phone) {
      return NextResponse.json(
        { error: 'Session ID and phone are required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Get session and agent info
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*, agents(id, full_name, email, notification_email)')
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

    // Get user email from profiles if available
    let userEmail = email
    let userName = fullName
    if (session.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', session.user_id)
        .single()
      if (profile) {
        if (!userEmail) userEmail = profile.email
        if (!userName) userName = profile.full_name
      }
    }

    // Create VIP request
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
        building_name: buildingName
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
      agentName: agent.full_name
    })

    // Send email to agent
    const agentEmail = agent.notification_email || agent.email
    
    try {
      await resend.emails.send({
        from: 'CondoLeads <notifications@condoleads.ca>',
        to: agentEmail,
        subject: ` VIP Access Request - ${phone}`,
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
        subject: ` VIP Request [${agent.full_name}] - ${phone}`,
        html: emailHtml
      })
      console.log('VIP request email sent to admin:', ADMIN_EMAIL)
    } catch (emailError) {
      console.error('Failed to send admin email:', emailError)
    }

    console.log('VIP Request created:', { 
      requestId: vipRequest.id, 
      sessionId, 
      phone,
      agentEmail,
      adminEmail: ADMIN_EMAIL
    })

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
      .select('status, responded_at')
      .eq('id', requestId)
      .single()

    if (error || !vipRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    return NextResponse.json({
      status: vipRequest.status,
      respondedAt: vipRequest.responded_at
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
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 20px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;"> New VIP Access Request</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Someone wants to chat more with your AI assistant</p>
      </div>
      
      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb;">
        <h2 style="margin-top: 0; color: #1f2937; font-size: 18px;"> Contact Information</h2>
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
        </table>
      </div>

      <div style="padding: 24px; text-align: center; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 20px; color: #6b7280;">
          Approve to grant this visitor <strong>10 additional chat messages</strong> with your AI assistant.
        </p>
        
        <div>
          <a href="${data.approveUrl}" style="display: inline-block; padding: 14px 32px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-right: 12px;">
             Approve VIP
          </a>
          <a href="${data.denyUrl}" style="display: inline-block; padding: 14px 32px; background: #ef4444; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
             Deny
          </a>
        </div>
        
        <p style="margin: 20px 0 0; font-size: 12px; color: #9ca3af;">
          This request expires in 24 hours. You can also manage requests in your dashboard.
        </p>
      </div>
    </div>
  `
}
