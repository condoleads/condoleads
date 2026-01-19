// app/api/chat/vip-request/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

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

    const supabase = createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get session and agent info
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*, agents(id, full_name, email, notification_email)')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
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

    // Create VIP request
    const { data: vipRequest, error: insertError } = await supabase
      .from('vip_requests')
      .insert({
        session_id: sessionId,
        agent_id: agent.id,
        phone,
        full_name: fullName,
        email: email || user.email,
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

    // Format budget and timeline for display
    const budgetDisplay = budgetRange ? budgetRange.replace(/-/g, ' - ').replace('plus', '+') : 'Not specified'
    const timelineMap: Record<string, string> = {
      'immediate': 'Immediate (0-3 months)',
      'soon': 'Soon (3-6 months)',
      'planning': 'Planning (6-12 months)',
      'exploring': 'Just Exploring'
    }
    const timelineDisplay = timeline ? timelineMap[timeline] || 'Not specified' : 'Not specified'
    
    const buyerTypeMap: Record<string, string> = {
      'buyer': '🏠 Buyer',
      'renter': '🔑 Renter',
      'seller': '💰 Seller',
      'investor': '📈 Investor'
    }
    const buyerTypeDisplay = buyerType ? buyerTypeMap[buyerType] || buyerType : 'Not specified'

    // Send email to agent
    const agentEmail = agent.notification_email || agent.email
    
    try {
      await resend.emails.send({
        from: 'CondoLeads <notifications@condoleads.ca>',
        to: agentEmail,
        subject: ` VIP Request from ${fullName} - ${buyerTypeDisplay}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 20px; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;"> New VIP Access Request</h1>
            </div>
            
            <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb;">
              <h2 style="margin-top: 0; color: #1f2937;">Contact Information</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; width: 120px;">Name:</td>
                  <td style="padding: 8px 0; color: #1f2937; font-weight: 600;">${fullName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Phone:</td>
                  <td style="padding: 8px 0; color: #1f2937; font-weight: 600;">
                    <a href="tel:${phone}" style="color: #2563eb;">${phone}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Email:</td>
                  <td style="padding: 8px 0; color: #1f2937;">
                    <a href="mailto:${email || user.email}" style="color: #2563eb;">${email || user.email}</a>
                  </td>
                </tr>
              </table>

              <h2 style="margin-top: 24px; color: #1f2937;">Requirements</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; width: 120px;">Type:</td>
                  <td style="padding: 8px 0; color: #1f2937; font-weight: 600;">${buyerTypeDisplay}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Budget:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${budgetDisplay}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Timeline:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${timelineDisplay}</td>
                </tr>
                ${buildingName ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Building:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${buildingName}</td>
                </tr>
                ` : ''}
                ${requirements ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Notes:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${requirements}</td>
                </tr>
                ` : ''}
              </table>
            </div>

            <div style="padding: 24px; text-align: center; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 16px; color: #6b7280;">Approve to grant this user VIP access with 10 additional chat messages.</p>
              
              <div style="display: inline-block;">
                <a href="${approveUrl}" style="display: inline-block; padding: 14px 32px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-right: 12px;">
                   Approve VIP
                </a>
                <a href="${denyUrl}" style="display: inline-block; padding: 14px 32px; background: #ef4444; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                   Deny
                </a>
              </div>
              
              <p style="margin: 16px 0 0; font-size: 12px; color: #9ca3af;">
                This request expires in 24 hours. You can also manage requests in your dashboard.
              </p>
            </div>
          </div>
        `
      })
      console.log('VIP request email sent to:', agentEmail)
    } catch (emailError) {
      console.error('Failed to send VIP request email:', emailError)
      // Don't fail the request if email fails
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

    const supabase = createClient()

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
