// app/api/walliam/contact/route.ts
// WALLiam contact form lead capture
// Used by: building pages, property pages, geo pages
// Resolves agent via resolve_agent_for_context
// Emails: agent TO, manager CC, admin BCC

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const ADMIN_EMAIL = 'condoleads.ca@gmail.com'
const FROM = 'WALLiam <notifications@condoleads.ca>'


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

export async function POST(req: NextRequest) {
  try {
    const {
      name, email, phone, message,
      source,
      building_id, listing_id,
      community_id, municipality_id, area_id,
      geo_name, tenant_id,
    } = await req.json()

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 })
    }

    if (!tenant_id) {
      return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Resolve agent
    const { data: agentId } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: listing_id || null,
      p_building_id: building_id || null,
      p_community_id: community_id || null,
      p_municipality_id: municipality_id || null,
      p_area_id: area_id || null,
      p_user_id: null,
      p_tenant_id: tenant_id,
    })

    // Get agent + manager details
    let agent: any = null
    let managerEmail: string | null = null
    let managerId: string | null = null

    if (agentId) {
      const { data: agentData } = await supabase
        .from('agents')
        .select('id, full_name, email, notification_email, parent_id')
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

    // Save lead
    const { data: lead } = await supabase.from('leads').insert({
      agent_id: agent?.id || null,
      manager_id: managerId,
      tenant_id,
      contact_name: name,
      contact_email: email,
      contact_phone: phone || null,
      message: message || null,
      source: source || 'walliam_contact',
      building_id: building_id || null,
      listing_id: listing_id || null,
      geo_name: geo_name || null,
      status: 'new',
      quality: 'hot',
      assignment_source: agent ? 'geo' : 'admin',
    }).select('id').single()

    // Build email HTML
    const html = buildContactEmail({ name, email, phone, message, source, geo_name, building_id, listing_id })
    const subject = `✦ WALLiam Inquiry — ${name} — ${geo_name || source || 'WALLiam'}`

    // Send to agent (or admin if no agent)
    if (agent?.email) {
      const agentNotifyEmail = agent.notification_email || agent.email
      await resend.emails.send({
        from: FROM,
        to: agentNotifyEmail,
        cc: managerEmail ? [managerEmail] : undefined,
        bcc: [ADMIN_EMAIL],
        subject,
        html,
      })
    } else {
      await resend.emails.send({ from: FROM, to: ADMIN_EMAIL, subject, html })
    }

    // Track activity
    await trackUserActivity(supabase, email, agent?.id || null, 'contact_form', {
      source: source || 'walliam_contact',
      geoName: geo_name || null,
      buildingId: building_id || null,
      listingId: listing_id || null,
      message: message || null,
    }, req.headers.get('referer') || '')

    return NextResponse.json({ success: true, leadId: lead?.id })
  } catch (error) {
    console.error('[walliam/contact] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function buildContactEmail({ name, email, phone, message, source, geo_name, building_id, listing_id }: any): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 22px; font-weight: 900; color: #fff; margin-bottom: 8px;">
          <span style="font-weight: 900;">WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.5);">iam</span>
        </div>
        <div style="font-size: 18px; font-weight: 700; color: #fff;">New Inquiry</div>
        ${geo_name ? `<div style="font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 4px;">${geo_name}</div>` : ''}
      </div>
      <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <table width="100%" cellpadding="8" cellspacing="0" border="0" style="font-size: 14px;">
          <tr><td style="color: #64748b; width: 120px;">Name</td><td style="font-weight: 700; color: #0f172a;">${name}</td></tr>
          <tr><td style="color: #64748b;">Email</td><td><a href="mailto:${email}" style="color: #1d4ed8;">${email}</a></td></tr>
          ${phone ? `<tr><td style="color: #64748b;">Phone</td><td><a href="tel:${phone}" style="color: #1d4ed8;">${phone}</a></td></tr>` : ''}
          ${source ? `<tr><td style="color: #64748b;">Source</td><td style="color: #64748b;">${source}</td></tr>` : ''}
          ${message ? `<tr><td style="color: #64748b; vertical-align: top;">Message</td><td style="color: #0f172a;">${message}</td></tr>` : ''}
        </table>
        <div style="margin-top: 20px; text-align: center;">
          <a href="mailto:${email}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px;">
            Reply to ${name}
          </a>
        </div>
      </div>
    </div>
  `
}