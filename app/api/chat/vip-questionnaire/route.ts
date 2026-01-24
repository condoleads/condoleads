// app/api/chat/vip-questionnaire/route.ts
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
    const { 
      requestId,
      fullName, 
      email, 
      budgetRange, 
      timeline, 
      buyerType, 
      requirements
    } = await request.json()

    if (!requestId) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Get the VIP request with session and agent info
    const { data: vipRequest, error: fetchError } = await supabase
      .from('vip_requests')
      .select('*, agents(id, full_name, email, notification_email), chat_sessions(user_id)')
      .eq('id', requestId)
      .single()

    if (fetchError || !vipRequest) {
      console.error('VIP request not found:', fetchError)
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    // Get user data from user_profiles and auth.users
    let userName = fullName || vipRequest.full_name
    let userEmail = email || vipRequest.email
    
    const userId = vipRequest.chat_sessions?.user_id
    if (userId) {
      // Get name from user_profiles
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', userId)
        .single()
      if (profile && profile.full_name) {
        if (!userName || userName === 'Chat User') userName = profile.full_name
      }
      
      // Get email from auth.users
      const { data: authUser } = await supabase.auth.admin.getUserById(userId)
      if (authUser && authUser.user && authUser.user.email) {
        if (!userEmail) userEmail = authUser.user.email
      }
    }

    // Update VIP request with questionnaire data and user info
    const { error: updateError } = await supabase
      .from('vip_requests')
      .update({
        full_name: userName,
        email: userEmail,
        budget_range: budgetRange,
        timeline: timeline,
        buyer_type: buyerType,
        requirements: requirements
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('Error updating VIP request:', updateError)
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }

    const agent = vipRequest.agents

    // Format display values
    const budgetDisplay = budgetRange ? budgetRange.replace(/-/g, ' - ').replace('plus', '+') : 'Not specified'
    const timelineMap: Record<string, string> = {
      'immediate': 'Immediate (0-3 months)',
      'soon': 'Soon (3-6 months)',
      'planning': 'Planning (6-12 months)',
      'exploring': 'Just Exploring'
    }
    const timelineDisplay = timeline ? timelineMap[timeline] || timeline : 'Not specified'
    
    const buyerTypeMap: Record<string, string> = {
      'buyer': ' Buyer',
      'renter': ' Renter',
      'seller': ' Seller',
      'investor': ' Investor'
    }
    const buyerTypeDisplay = buyerType ? buyerTypeMap[buyerType] || buyerType : 'Not specified'

    // Build questionnaire email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 20px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;"> VIP Questionnaire Submitted</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Additional details from your VIP request</p>
        </div>
        
        <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb;">
          <h2 style="margin-top: 0; color: #1f2937; font-size: 18px;"> Contact Information</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; width: 120px;">Name:</td>
              <td style="padding: 8px 0; color: #1f2937; font-weight: 600;">${userName || 'Not provided'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Phone:</td>
              <td style="padding: 8px 0; color: #1f2937; font-weight: 600;">
                <a href="tel:${vipRequest.phone}" style="color: #2563eb; text-decoration: none;">${vipRequest.phone}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Email:</td>
              <td style="padding: 8px 0; color: #1f2937;">
                <a href="mailto:${userEmail || ''}" style="color: #2563eb; text-decoration: none;">${userEmail || 'Not provided'}</a>
              </td>
            </tr>
          </table>

          <h2 style="margin-top: 24px; color: #1f2937; font-size: 18px;"> Requirements</h2>
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
            ${vipRequest.building_name ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Building:</td>
              <td style="padding: 8px 0; color: #1f2937;">${vipRequest.building_name}</td>
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

        <div style="padding: 16px 24px; background: #fef3c7; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
             <strong>Status:</strong> Pending your approval. Use the links in the previous email to approve or deny this VIP request.
          </p>
        </div>
      </div>
    `

    // Send email to agent
    const agentEmail = agent.notification_email || agent.email
    try {
      await resend.emails.send({
        from: 'CondoLeads <notifications@condoleads.ca>',
        to: agentEmail,
        subject: `📋 VIP Questionnaire - ${userName || vipRequest.phone}`,
        html: emailHtml
      })
      console.log('Questionnaire email sent to agent:', agentEmail)
    } catch (emailError) {
      console.error('Failed to send agent email:', emailError)
    }

    // Send copy to admin
    try {
      await resend.emails.send({
        from: 'CondoLeads <notifications@condoleads.ca>',
        to: ADMIN_EMAIL,
        subject: `📋 VIP Questionnaire [${agent.full_name}] - ${userName || vipRequest.phone}`,
        html: emailHtml
      })
      console.log('Questionnaire email sent to admin:', ADMIN_EMAIL)
    } catch (emailError) {
      console.error('Failed to send admin email:', emailError)
    }

    // Update lead with questionnaire details
    if (vipRequest.lead_id) {
      try {
        await supabase
          .from('leads')
          .update({
            contact_name: userName || undefined,
            property_details: {
              vip_questionnaire: {
                budget_range: budgetRange,
                timeline: timeline,
                buyer_type: buyerType,
                requirements: requirements,
                submitted_at: new Date().toISOString()
              }
            },
            message: `VIP Chat - ${buyerTypeDisplay} | Budget: ${budgetDisplay} | Timeline: ${timelineDisplay}${requirements ? ` | Notes: ${requirements}` : ''}`,
            tags: [buyerType, budgetRange, timeline].filter(Boolean),
            updated_at: new Date().toISOString()
          })
          .eq('id', vipRequest.lead_id)
        
        console.log('Lead updated with questionnaire:', { leadId: vipRequest.lead_id })
      } catch (leadError) {
        console.error('Error updating lead with questionnaire:', leadError)
      }
    }

    console.log('VIP Questionnaire updated:', { requestId, fullName, buyerType, budgetRange })

    return NextResponse.json({
      success: true,
      message: 'Questionnaire submitted successfully'
    })

  } catch (error) {
    console.error('VIP questionnaire error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
