// app/api/walliam/estimator/vip-request/route.ts
// WALLiam estimator VIP request — adapted from app/api/chat/vip-request/route.ts
// System 1 never touched.
// Key differences vs System 1:
//   - source = 'walliam_estimator_vip_request' (visible in /admin-homes/leads)
//   - manager CC via agent.parent_id
//   - manager_id set on lead insert
//   - Approve/Deny URL → /api/walliam/estimator/vip-approve
//   - FROM: notifications@condoleads.ca
//   - GET poll: questionnaireCompleted always true (no questionnaire in WALLiam)
//   - No questionnaire fields (user already registered)

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
    const {
      sessionId,
      phone,
      pageUrl,
      buildingName,
    } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Get session + agent (with parent_id for manager CC)
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select(`
        *,
        agents (
          id, full_name, email, notification_email, parent_id
        )
      `)
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const agent = session.agents

    // Load tenant estimator config (auto-approve lives on tenant, not agent)
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('estimator_vip_auto_approve, estimator_auto_approve_attempts, estimator_manual_approve_attempts')
      .eq('id', session.tenant_id)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
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

    // Get user data from user_profiles + auth.users
    let userEmail = ''
    let userName = ''
    let userPhone = ''

    if (session.user_id) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, phone')
        .eq('id', session.user_id)
        .single()
      if (profile) {
        userName = profile.full_name || ''
        if (profile.phone && profile.phone !== '00000000000') userPhone = profile.phone
      }

      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(session.user_id)
      if (authUser?.user && !authError) {
        userEmail = authUser.user.email || ''
      }
    }

    // Lookup manager for CC
    let managerEmail: string | null = null
    let managerId: string | null = null
    if (agent.parent_id) {
      const { data: manager } = await supabase
        .from('agents')
        .select('id, full_name, email, notification_email')
        .eq('id', agent.parent_id)
        .single()
      if (manager) {
        managerId = manager.id
        managerEmail = manager.notification_email || manager.email
      }
    }

    // Auto-approve logic — reads from TENANT config, not agent
    // If auto_approve_attempts = 0, fall through to manual regardless of flag
    const autoApproveMessages = tenant.estimator_auto_approve_attempts ?? 0
    const isAutoApprove = tenant.estimator_vip_auto_approve === true && autoApproveMessages > 0

    // Create VIP request
    const { data: vipRequest, error: insertError } = await supabase
      .from('vip_requests')
      .insert({
        session_id: sessionId,
        agent_id: agent.id,
        phone,
        full_name: userName || 'WALLiam User',
        email: userEmail || null,
        page_url: pageUrl,
        building_name: buildingName,
        request_source: 'walliam_estimator',
        request_type: 'estimator',
        status: isAutoApprove ? 'approved' : 'pending',
        messages_granted: autoApproveMessages,
        responded_at: isAutoApprove ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (insertError || !vipRequest) {
      console.error('[walliam/estimator/vip-request] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
    }

    // Build approval URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'
    const approveUrl = `${baseUrl}/api/walliam/estimator/vip-approve?token=${vipRequest.approval_token}&action=approve`
    const denyUrl = `${baseUrl}/api/walliam/estimator/vip-approve?token=${vipRequest.approval_token}&action=deny`

    const emailHtml = buildApprovalEmailHtml({
      fullName: userName || 'WALLiam User',
      phone,
      email: userEmail,
      buildingName,
      pageUrl,
      approveUrl,
      denyUrl,
      agentName: agent.full_name,
    })

    // Email agent
    const agentEmail = agent.notification_email || agent.email
    const ccList: string[] = []
    if (managerEmail) ccList.push(managerEmail)

    try {
      await resend.emails.send({
        from: FROM,
        to: agentEmail,
        cc: ccList.length > 0 ? ccList : undefined,
        subject: `🔔 WALLiam Estimator VIP Request — ${phone}`,
        html: emailHtml,
      })
    } catch (err) {
      console.error('[walliam/estimator/vip-request] agent email error:', err)
    }

    // BCC admin
    try {
      await resend.emails.send({
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `🔔 WALLiam Estimator VIP [${agent.full_name}] — ${phone}`,
        html: emailHtml,
      })
    } catch (err) {
      console.error('[walliam/estimator/vip-request] admin email error:', err)
    }

    // Save lead
    if (userEmail) {
      const { error: leadError } = await supabase
        .from('leads')
        .insert({
          agent_id: agent.id,
          user_id: session.user_id,
          contact_name: userName || 'WALLiam User',
          contact_email: userEmail,
          contact_phone: phone,
          source: 'walliam_estimator_vip_request',
          source_url: pageUrl,
          building_id: session.current_page_type === 'building' ? session.current_page_id : null,
          message: `WALLiam Estimator VIP Request${buildingName ? ` — ${buildingName}` : ''}`,
          status: 'new',
          quality: 'hot',
          manager_id: managerId,
        })
      if (leadError) console.error('[walliam/estimator/vip-request] lead error:', leadError)
    }

    // Track activity
    if (userEmail) {
      await trackUserActivity(supabase, userEmail, agent?.id || null, 'estimator_contact_submitted', {
        source: 'walliam_estimator_vip_request',
        buildingName: buildingName || null,
        phone: phone || null,
        autoApprove: isAutoApprove,
      }, pageUrl || '')
    }

    // Auto-approve: update session + write credit override + send user email
    if (isAutoApprove) {
      const currentGranted = session.vip_messages_granted || 0

      await supabase
        .from('chat_sessions')
        .update({
          status: 'vip',
          vip_accepted_at: new Date().toISOString(),
          vip_phone: phone,
          vip_messages_granted: currentGranted + autoApproveMessages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)

      // Write to user_credit_overrides so session route picks up new limit
      if (session.user_id && session.tenant_id) {
        const { data: existing } = await supabase
          .from('user_credit_overrides')
          .select('estimator_limit')
          .eq('user_id', session.user_id)
          .eq('tenant_id', session.tenant_id)
          .maybeSingle()

        const currentLimit = existing?.estimator_limit ?? 0
        const newLimit = currentLimit + autoApproveMessages

        await supabase
          .from('user_credit_overrides')
          .upsert({
            user_id: session.user_id,
            tenant_id: session.tenant_id,
            estimator_limit: newLimit,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,tenant_id' })
      }

      if (userEmail) {
        try {
          await resend.emails.send({
            from: FROM,
            to: userEmail,
            subject: '✦ WALLiam Estimator Access Approved',
            html: buildUserApprovalEmailHtml(userName, agent.full_name, autoApproveMessages),
          })
        } catch (err) {
          console.error('[walliam/estimator/vip-request] user approval email error:', err)
        }
      }

      return NextResponse.json({
        success: true,
        requestId: vipRequest.id,
        status: 'approved',
        messagesGranted: autoApproveMessages,
        message: 'VIP access automatically approved',
      })
    }

    return NextResponse.json({
      success: true,
      requestId: vipRequest.id,
      status: 'pending',
      message: 'Request submitted successfully',
    })

  } catch (error) {
    console.error('[walliam/estimator/vip-request] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET: Poll for approval status
// questionnaireCompleted always true — WALLiam has no questionnaire
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
      .select('status, responded_at, messages_granted, buyer_type')
      .eq('id', requestId)
      .single()

    if (error || !vipRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    // questionnaireCompleted = buyer_type filled (same logic as System 1)
    const questionnaireCompleted = !!vipRequest.buyer_type

    return NextResponse.json({
      status: vipRequest.status,
      respondedAt: vipRequest.responded_at,
      questionnaireCompleted,
      messagesGranted: vipRequest.messages_granted || 0,
    })

  } catch (error) {
    console.error('[walliam/estimator/vip-request] GET error:', error)
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
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">🔔 WALLiam Estimator VIP Request</h1>
        <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0; font-size: 13px;">📊 Estimator</p>
      </div>
      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb;">
        <h2 style="margin-top: 0; color: #1f2937; font-size: 16px;">Contact Information</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 100px;">Phone:</td>
            <td style="padding: 8px 0; font-weight: 600;">
              <a href="tel:${data.phone}" style="color: #2563eb;">${data.phone}</a>
            </td>
          </tr>
          ${data.fullName && data.fullName !== 'WALLiam User' ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Name:</td>
            <td style="padding: 8px 0; color: #1f2937;">${data.fullName}</td>
          </tr>` : ''}
          ${data.email ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Email:</td>
            <td style="padding: 8px 0;">
              <a href="mailto:${data.email}" style="color: #2563eb;">${data.email}</a>
            </td>
          </tr>` : ''}
          ${data.buildingName ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Building:</td>
            <td style="padding: 8px 0; color: #1f2937;">${data.buildingName}</td>
          </tr>` : ''}
        </table>
      </div>
      <div style="padding: 24px; text-align: center; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 20px; color: #6b7280; font-size: 14px;">
          Approve to grant this visitor additional estimator access.
        </p>
        <a href="${data.approveUrl}" style="display: inline-block; padding: 14px 32px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-right: 12px;">
          ✅ Approve
        </a>
        <a href="${data.denyUrl}" style="display: inline-block; padding: 14px 32px; background: #ef4444; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
          ❌ Deny
        </a>
        <p style="margin: 20px 0 0; font-size: 12px; color: #9ca3af;">Expires in 24 hours.</p>
      </div>
    </div>
  `
}

function buildUserApprovalEmailHtml(userName: string, agentName: string, attemptsGranted: number): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">✦</div>
        <h1 style="color: white; margin: 0; font-size: 24px;">Estimator Access Approved</h1>
        <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0;">WALLiam AI Real Estate</p>
      </div>
      <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">Hi ${userName || 'there'},</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          <strong>${agentName}</strong> has approved your estimator access. You now have
          <strong>${attemptsGranted} additional estimate${attemptsGranted !== 1 ? 's' : ''}</strong> available.
        </p>
        <div style="text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'}"
             style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">
            ✦ Back to WALLiam
          </a>
        </div>
      </div>
    </div>
  `
}