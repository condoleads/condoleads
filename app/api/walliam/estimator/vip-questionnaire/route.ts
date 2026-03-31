// app/api/walliam/estimator/vip-questionnaire/route.ts
// Adapted from app/api/chat/vip-questionnaire/route.ts — System 1 never touched
// Key differences:
//   - source = 'walliam_estimator_questionnaire' (visible in /admin-homes/leads)
//   - Manager CC via agent.parent_id
//   - FROM: notifications@condoleads.ca
//   - WALLiam dark theme email

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'WALLiam <notifications@condoleads.ca>'
const ADMIN_EMAIL = 'condoleads.ca@gmail.com'


// Track user activity in user_activities table
async function trackUserActivity(supabase: any, contactEmail: string, agentId: string | null, activityType: string, activityData: any, pageUrl?: string) {
  try {
    await supabase.from('user_activities').insert({
      contact_email: contactEmail,
      agent_id: agentId || null,
      activity_type: activityType,
      activity_data: activityData || {},
      page_url: pageUrl || '',
    })
  } catch (err) {
    console.error('[trackUserActivity] error:', err)
  }
}
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  try {
    const { requestId, fullName, email, budgetRange, timeline, buyerType, requirements } = await request.json()

    if (!requestId) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Get VIP request with session + agent (including parent_id for manager CC)
    const { data: vipRequest, error: fetchError } = await supabase
      .from('vip_requests')
      .select(`
        *,
        agents (id, full_name, email, notification_email, parent_id),
        chat_sessions (user_id, current_page_type, current_page_id)
      `)
      .eq('id', requestId)
      .single()

    if (fetchError || !vipRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    // Resolve user name + email (registered user — use profile/auth data)
    let userName = vipRequest.full_name
    let userEmail = vipRequest.email

    const userId = vipRequest.chat_sessions?.user_id
    if (userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', userId)
        .single()
      if (profile?.full_name) userName = profile.full_name

      const { data: authUser } = await supabase.auth.admin.getUserById(userId)
      if (authUser?.user?.email && !userEmail) userEmail = authUser.user.email
    }

    // Update VIP request with questionnaire data
    const { error: updateError } = await supabase
      .from('vip_requests')
      .update({ full_name: userName, email: userEmail, budget_range: budgetRange, timeline, buyer_type: buyerType, requirements })
      .eq('id', requestId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }

    const agent = vipRequest.agents

    // Lookup manager for CC
    let managerEmail: string | null = null
    let managerId: string | null = null
    if (agent?.parent_id) {
      const { data: manager } = await supabase
        .from('agents')
        .select('id, email, notification_email')
        .eq('id', agent.parent_id)
        .single()
      if (manager) {
        managerId = manager.id
        managerEmail = manager.notification_email || manager.email
      }
    }

    // Format display values
    const budgetDisplay = budgetRange ? budgetRange.replace(/-/g, ' - ').replace('plus', '+') : 'Not specified'
    const timelineMap: Record<string, string> = {
      immediate: 'Immediate (0-3 months)',
      soon: 'Soon (3-6 months)',
      planning: 'Planning (6-12 months)',
      exploring: 'Just Exploring',
    }
    const buyerTypeMap: Record<string, string> = {
      buyer: 'Buyer',
      renter: 'Renter',
      seller: 'Seller',
      investor: 'Investor',
    }
    const timelineDisplay = timeline ? (timelineMap[timeline] || timeline) : 'Not specified'
    const buyerTypeDisplay = buyerType ? (buyerTypeMap[buyerType] || buyerType) : 'Not specified'

    const emailHtml = buildQuestionnaireEmailHtml({
      userName: userName || 'WALLiam User',
      phone: vipRequest.phone,
      email: userEmail,
      buyerTypeDisplay,
      budgetDisplay,
      timelineDisplay,
      buildingName: vipRequest.building_name,
      requirements,
    })

    // Email agent + manager CC
    const agentEmail = agent?.notification_email || agent?.email
    const ccList: string[] = []
    if (managerEmail) ccList.push(managerEmail)

    if (agentEmail) {
      try {
        await resend.emails.send({
          from: FROM,
          to: agentEmail,
          cc: ccList.length > 0 ? ccList : undefined,
          subject: `📋 WALLiam Estimator Questionnaire — ${userName || vipRequest.phone}`,
          html: emailHtml,
        })
      } catch (err) {
        console.error('[walliam/estimator/vip-questionnaire] agent email error:', err)
      }
    }

    // Admin BCC
    try {
      await resend.emails.send({
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `📋 WALLiam Estimator Questionnaire [${agent?.full_name}] — ${userName || vipRequest.phone}`,
        html: emailHtml,
      })
    } catch (err) {
      console.error('[walliam/estimator/vip-questionnaire] admin email error:', err)
    }

    // Save lead
    if (userEmail) {
      const { error: leadError } = await supabase
        .from('leads')
        .insert({
          agent_id: agent?.id,
          user_id: userId,
          contact_name: userName || 'WALLiam User',
          contact_email: userEmail,
          contact_phone: vipRequest.phone,
          source: 'walliam_estimator_questionnaire',
          source_url: vipRequest.page_url,
          building_id: vipRequest.chat_sessions?.current_page_type === 'building'
            ? vipRequest.chat_sessions?.current_page_id
            : null,
          message: `WALLiam Estimator Questionnaire — ${buyerTypeDisplay} | Budget: ${budgetDisplay} | Timeline: ${timelineDisplay}${requirements ? ` | Notes: ${requirements}` : ''}`,
          status: 'new',
          quality: 'hot',
          manager_id: managerId,
        })
      if (leadError) console.error('[walliam/estimator/vip-questionnaire] lead error:', leadError)
    }

    // Track activity
    if (userEmail) {
      await trackUserActivity(supabase, userEmail, agent?.id || null, 'estimator_contact_submitted', {
        source: 'walliam_estimator_questionnaire',
        buyerType: buyerType || null,
        budgetRange: budgetRange || null,
        timeline: timeline || null,
        buildingName: vipRequest.building_name || null,
      }, vipRequest.page_url || '')
    }

    return NextResponse.json({ success: true, message: 'Questionnaire submitted successfully' })

  } catch (error) {
    console.error('[walliam/estimator/vip-questionnaire] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function buildQuestionnaireEmailHtml(data: {
  userName: string
  phone: string
  email?: string
  buyerTypeDisplay: string
  budgetDisplay: string
  timelineDisplay: string
  buildingName?: string
  requirements?: string
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">📋 WALLiam Estimator Questionnaire</h1>
        <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0; font-size: 13px;">Additional buyer details submitted</p>
      </div>
      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb;">
        <h2 style="margin-top: 0; color: #1f2937; font-size: 16px;">Contact</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 120px;">Name:</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: 600;">${data.userName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Phone:</td>
            <td style="padding: 8px 0;"><a href="tel:${data.phone}" style="color: #2563eb;">${data.phone}</a></td>
          </tr>
          ${data.email ? `<tr>
            <td style="padding: 8px 0; color: #6b7280;">Email:</td>
            <td style="padding: 8px 0;"><a href="mailto:${data.email}" style="color: #2563eb;">${data.email}</a></td>
          </tr>` : ''}
        </table>
        <h2 style="margin-top: 24px; color: #1f2937; font-size: 16px;">Requirements</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 120px;">Type:</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: 600;">${data.buyerTypeDisplay}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Budget:</td>
            <td style="padding: 8px 0; color: #1f2937;">${data.budgetDisplay}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Timeline:</td>
            <td style="padding: 8px 0; color: #1f2937;">${data.timelineDisplay}</td>
          </tr>
          ${data.buildingName ? `<tr>
            <td style="padding: 8px 0; color: #6b7280;">Building:</td>
            <td style="padding: 8px 0; color: #1f2937;">${data.buildingName}</td>
          </tr>` : ''}
          ${data.requirements ? `<tr>
            <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Notes:</td>
            <td style="padding: 8px 0; color: #1f2937;">${data.requirements}</td>
          </tr>` : ''}
        </table>
      </div>
      <div style="padding: 16px 24px; background: #1e293b; border-radius: 0 0 12px 12px;">
        <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 13px;">
          ✦ WALLiam — Use the approve/deny links from the original VIP email to manage access.
        </p>
      </div>
    </div>
  `
}