// app/api/charlie/appointment/route.ts
// WALLiam Charlie appointment booking
// Saves lead with appointment fields + sends confirmation emails
// System 1 is NEVER touched

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTenantEmail, TenantEmailNotConfigured, TenantEmailFailed } from '@/lib/email/sendTenantEmail'

const ADMIN_EMAIL = 'condoleads.ca@gmail.com'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'


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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name, email, phone,
      intent,
      appointment_date,
      appointment_time,
      appointment_properties,
      sessionId, userId,
      community_id, municipality_id, area_id,
      geo_name,
    } = body

    // W-RECOVERY A1.5 auth gate — block forged appointment submissions
    if (!sessionId || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!name || !email || !intent || !appointment_date || !appointment_time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (intent === 'buyer' && (!appointment_properties || appointment_properties.length === 0)) {
      return NextResponse.json({ error: 'Please select at least one property' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const tenantId = req.headers.get('x-tenant-id') || null

    // W-RECOVERY A1.5 auth gate — verify session belongs to userId
    const { data: validSession } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .eq('source', 'walliam')
      .maybeSingle()
    if (!validSession) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    // END W-RECOVERY A1.5 auth gate

    // Step 1: Resolve agent
    const { data: resolvedAgentId } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: null,
      p_building_id: null,
      p_community_id: community_id || null,
      p_municipality_id: municipality_id || null,
      p_area_id: area_id || null,
      p_user_id: userId || null,
        p_tenant_id: tenantId || null,
    })

    const agentId = resolvedAgentId || null

    // Step 2: Get agent + manager info
    let agent: any = null
    let managerId: string | null = null
    let managerEmail: string | null = null

    if (agentId) {
      const { data: agentData } = await supabase
        .from('agents')
        .select('id, full_name, email, notification_email, cell_phone, profile_photo_url, brokerage_name, title, parent_id')
        .eq('id', agentId)
        .single()

      if (agentData) {
        agent = agentData
        if (agentData.parent_id) {
          managerId = agentData.parent_id
          const { data: manager } = await supabase
            .from('agents')
            .select('email, notification_email')
            .eq('id', agentData.parent_id)
            .single()
          if (manager) managerEmail = manager.notification_email || manager.email
        }
      }
    }

    // Step 3: Save lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        agent_id: agentId,
        user_id: userId || null,
        contact_name: name,
        contact_email: email,
        contact_phone: phone || null,
        source: 'walliam_charlie',
        intent,
        geo_name: geo_name || null,
        manager_id: managerId,
        assignment_source: agentId ? 'geo' : 'admin',
        tenant_id: tenantId,
        status: 'new',
        quality: 'hot',
        appointment_date,
        appointment_time,
        appointment_properties: appointment_properties || null,
        appointment_status: 'pending',
      })
      .select('id, reschedule_token')
      .single()

    if (leadError || !lead) {
      console.error('[charlie/appointment] save error:', leadError)
      return NextResponse.json({ error: 'Failed to save appointment' }, { status: 500 })
    }

    // Link to session
    if (sessionId) {
      await supabase
        .from('chat_sessions')
        .update({ lead_id: lead.id, last_activity_at: new Date().toISOString() })
        .eq('id', sessionId)
    }

    const formattedDate = formatDate(appointment_date)
    const rescheduleUrl = `${BASE_URL}/reschedule?token=${lead.reschedule_token}`

    // Step 4: Confirmation email â†’ user
    try {
      await sendTenantEmail({
        tenantId: tenantId || '',
        to: email,
        subject: `Your ${intent === 'buyer' ? 'Viewing' : 'Consultation'} Request â€” ${formattedDate} at ${appointment_time}`,
        html: buildUserConfirmationEmail({
          name, intent, formattedDate, appointment_time,
          appointment_properties, agent, rescheduleUrl,
        }),
      })
    } catch (err) {
      console.error('[charlie/appointment] user email error:', err)
    }

    // Step 5: Notification email â†’ agent (+ manager CC + admin BCC)
    const agentNotifyEmail = agent?.notification_email || agent?.email
    const notifyTo = agentNotifyEmail || ADMIN_EMAIL

    try {
      await sendTenantEmail({
        tenantId: tenantId || '',
        to: notifyTo,
        cc: managerEmail ? [managerEmail] : undefined,
        bcc: agentNotifyEmail ? [ADMIN_EMAIL] : undefined,
        subject: `ðŸ“… New ${intent === 'buyer' ? 'Viewing' : 'Consultation'} Request â€” ${name} â€” ${formattedDate}`,
        html: buildAgentNotificationEmail({
          name, email, phone, intent, formattedDate, appointment_time,
          appointment_properties, geo_name,
        }),
      })
    } catch (err) {
      console.error('[charlie/appointment] agent email error:', err)
    }

    // Track activity
    await trackUserActivity(supabase, email, agentId, 'building_visit_request', {
      source: 'walliam_appointment',
      intent,
      geoName: geo_name || null,
      appointmentDate: appointment_date,
      appointmentTime: appointment_time,
    })

    return NextResponse.json({ success: true, leadId: lead.id })

  } catch (error) {
    console.error('[charlie/appointment] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// â”€â”€â”€ User confirmation email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildUserConfirmationEmail(data: {
  name: string
  intent: string
  formattedDate: string
  appointment_time: string
  appointment_properties?: any[]
  agent?: any
  rescheduleUrl: string
}): string {
  const { name, intent, formattedDate, appointment_time, appointment_properties, agent, rescheduleUrl } = data
  const isBuyer = intent === 'buyer'

  const propertiesHtml = isBuyer && appointment_properties?.length ? `
    <div style="margin: 20px 0;">
      <h3 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.08em;">Properties to View</h3>
      ${appointment_properties.map(p => `
        <a href="${BASE_URL}/${p.slug || p.listing_key}" style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; text-decoration: none;">
          <div style="font-size: 13px; font-weight: 600; color: #0f172a;">${p.address || 'â€”'}</div>
          <div style="font-size: 14px; font-weight: 800; color: #1d4ed8;">$${Number(p.price || 0).toLocaleString('en-CA')}</div>
        </a>
      `).join('')}
    </div>
  ` : ''

  const agentHtml = agent ? `
    <div style="background: #0f172a; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
      <div style="font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px;">Your Agent</div>
      ${agent.profile_photo_url ? `<img src="${agent.profile_photo_url}" alt="${agent.full_name}" style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover; margin-bottom: 8px;">` : ''}
      <div style="font-size: 15px; font-weight: 700; color: #fff;">${agent.full_name}</div>
      ${agent.brokerage_name ? `<div style="font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px;">${agent.brokerage_name}</div>` : ''}
      <div style="margin-top: 12px; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
        ${agent.email ? `<a href="mailto:${agent.email}" style="padding: 7px 16px; background: rgba(255,255,255,0.08); border-radius: 8px; color: #93c5fd; font-size: 12px; text-decoration: none;">${agent.email}</a>` : ''}
        ${agent.cell_phone ? `<a href="tel:${agent.cell_phone}" style="padding: 7px 16px; background: rgba(255,255,255,0.08); border-radius: 8px; color: #93c5fd; font-size: 12px; text-decoration: none;">${agent.cell_phone}</a>` : ''}
      </div>
    </div>
  ` : ''

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px 28px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 26px; font-weight: 900; color: #fff; margin-bottom: 4px;">
          <span>WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.5);">iam</span>
        </div>
        <h1 style="color: #fff; font-size: 20px; font-weight: 800; margin: 16px 0 6px;">
          ${isBuyer ? 'ðŸ  Viewing Request Sent' : 'ðŸ“‹ Consultation Request Sent'}
        </h1>
        <p style="color: rgba(255,255,255,0.5); margin: 0; font-size: 14px;">Hi ${name} â€” your request has been sent to your agent.</p>
      </div>

      <div style="padding: 24px 28px; border: 1px solid #e2e8f0; border-top: none;">
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px; margin-bottom: 20px; text-align: center;">
          <div style="font-size: 13px; font-weight: 700; color: #15803d; margin-bottom: 4px;">ðŸ“… ${formattedDate}</div>
          <div style="font-size: 18px; font-weight: 800; color: #0f172a;">${appointment_time}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Your agent will confirm shortly</div>
        </div>

        ${propertiesHtml}
        ${agentHtml}

        <div style="text-align: center; margin-top: 20px;">
          <a href="${rescheduleUrl}" style="display: inline-block; padding: 10px 24px; background: #f1f5f9; color: #374151; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 600;">
            ðŸ”„ Need to Reschedule?
          </a>
        </div>
      </div>

      <div style="padding: 16px 28px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 11px;">WALLiam Â· walliam.ca</p>
      </div>
    </div>
  `
}

// â”€â”€â”€ Agent notification email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildAgentNotificationEmail(data: {
  name: string
  email: string
  phone?: string
  intent: string
  formattedDate: string
  appointment_time: string
  appointment_properties?: any[]
  geo_name?: string
}): string {
  const { name, email, phone, intent, formattedDate, appointment_time, appointment_properties, geo_name } = data
  const isBuyer = intent === 'buyer'

  const propertiesHtml = isBuyer && appointment_properties?.length ? `
    <h2 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 0.08em;">Properties Requested</h2>
    ${appointment_properties.map(p => `
      <a href="${BASE_URL}/${p.slug || p.listing_key}" style="display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 8px; text-decoration: none;">
        <div style="font-size: 13px; font-weight: 600; color: #0f172a;">${p.address || 'â€”'}</div>
        <div style="font-size: 14px; font-weight: 800; color: #1d4ed8;">$${Number(p.price || 0).toLocaleString('en-CA')}</div>
      </a>
    `).join('')}
  ` : ''

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 24px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 22px; font-weight: 900; color: #fff; margin-bottom: 8px;">
          <span>WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.5);">iam</span>
        </div>
        <h1 style="color: #fff; margin: 0; font-size: 18px; font-weight: 700;">
          ðŸ“… New ${isBuyer ? 'Viewing' : 'Consultation'} Request
        </h1>
        <p style="color: rgba(255,255,255,0.4); margin: 4px 0 0; font-size: 12px;">via Charlie AI Â· ${new Date().toLocaleDateString('en-CA')}</p>
      </div>

      <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none;">
        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
          <div style="font-size: 20px; font-weight: 800; color: #0f172a;">${formattedDate}</div>
          <div style="font-size: 16px; font-weight: 700; color: #1d4ed8; margin-top: 2px;">${appointment_time}</div>
        </div>

        <h2 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.08em;">Contact</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
          <tr><td style="padding: 5px 0; color: #64748b; width: 80px;">Name</td><td style="padding: 5px 0; font-weight: 700; color: #0f172a;">${name}</td></tr>
          <tr><td style="padding: 5px 0; color: #64748b;">Email</td><td style="padding: 5px 0;"><a href="mailto:${email}" style="color: #2563eb;">${email}</a></td></tr>
          ${phone ? `<tr><td style="padding: 5px 0; color: #64748b;">Phone</td><td style="padding: 5px 0;"><a href="tel:${phone}" style="color: #2563eb;">${phone}</a></td></tr>` : ''}
          ${geo_name ? `<tr><td style="padding: 5px 0; color: #64748b;">Area</td><td style="padding: 5px 0; color: #0f172a;">${geo_name}</td></tr>` : ''}
          <tr><td style="padding: 5px 0; color: #64748b;">Intent</td><td style="padding: 5px 0; color: #0f172a;">${isBuyer ? 'Buyer â€” Property Viewing' : 'Seller â€” CMA Consultation'}</td></tr>
        </table>

        ${propertiesHtml}

        <div style="text-align: center; margin-top: 20px;">
          <a href="${BASE_URL}/admin-homes/leads" style="display: inline-block; padding: 10px 24px; background: #0f172a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px;">
            View in Dashboard â†’
          </a>
        </div>
      </div>

      <div style="padding: 16px 20px; background: white; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 11px;">WALLiam Â· walliam.ca</p>
      </div>
    </div>
  `
}