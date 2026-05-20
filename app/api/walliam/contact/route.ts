// app/api/walliam/contact/route.ts
// WALLiam contact form lead capture
// Used by: building pages, property pages, geo pages
// Resolves agent via resolve_agent_for_context
//
// W-HIERARCHY H3.8 (2026-05-03):
//   - getLeadEmailRecipients enforces 6-layer chain (was: inline manager-CC + hardcoded ADMIN_EMAIL)
//   - tenant_admin_id captured into lead insert payload (F58)
//   - F47 hardcoded ADMIN_EMAIL constant removed
//   - F66 walker call shape standardized via helper
//   - F67 try/catch standard (was already partially correct on this route — now uniform across both branches)

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { walkHierarchy } from '@/lib/admin-homes/hierarchy'
import {
  sendTenantEmail,
  TenantEmailNotConfigured,
  TenantEmailFailed,
  getLeadEmailRecipients,
  AdminPlatformUnreachable,
} from '@/lib/admin-homes/lead-email-recipients'
import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'
import { getTenantContext } from '@/lib/utils/tenant-brand'
import { getOrCreateAuthUserByEmail } from '@/lib/auth/get-or-create-by-email'


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
      community_id, municipality_id, area_id, neighbourhood_id,
      geo_name, tenant_id,
    } = await req.json()

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 })
    }

    if (!tenant_id) {
      return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // C2/D4 -- tenant brand context (strict-fail: no silent fallback)
    // Per multi-tenant rule zero: a missing tenant config is a server-side data
    // integrity issue, not a recoverable condition. Returning 500 here prevents
    // cross-tenant lead misattribution from a silent default source value.
    const _t6fcCtx = await getTenantContext(supabase, tenant_id)
    if (!_t6fcCtx) {
      console.error('[walliam/contact] tenant context unavailable for tenant_id:', tenant_id)
      return NextResponse.json({ error: 'Tenant configuration unavailable' }, { status: 500 })
    }
    const brandName = _t6fcCtx.brandName
    const sourceKey = _t6fcCtx.sourceKey

    // Resolve agent
    const { data: agentId } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: listing_id || null,
      p_building_id: building_id || null,
      p_neighbourhood_id: null,
      p_community_id: community_id || null,
      p_municipality_id: municipality_id || null,
      p_area_id: area_id || null,
      p_user_id: null,
      p_tenant_id: tenant_id,
    })

    // Get agent details + walk hierarchy
    let agent: any = null
    let chainManagerId: string | null = null
    let chainAreaManagerId: string | null = null
    let chainTenantAdminId: string | null = null

    if (agentId) {
      const { data: agentData } = await supabase
        .from('agents')
        .select('id, full_name, email, notification_email, parent_id')
        .eq('id', agentId)
        .single()

      if (agentData) {
        agent = agentData
        const chain = await walkHierarchy(agentData.id, supabase)
        chainManagerId = chain.manager_id
        chainAreaManagerId = chain.area_manager_id
        chainTenantAdminId = chain.tenant_admin_id
      }
    }

    // W3c: capture source URL from referer for both leads.source_url + email render
    const pageUrl = headers().get('referer') || null

    // G2: derive auth user_id for credit-management surfaces. The contact
    // form has no session context, so resolve user_id by email via get-or-
    // create against auth.users. If resolution fails for any reason, fall
    // through with user_id=null -- the lead is still saved (graceful
    // degradation, no regression on existing behavior).
    let userIdForLead: string | null = null
    try {
      const result = await getOrCreateAuthUserByEmail(supabase, email, {
        // C1/D5 -- build source from tenant source_key (was: hardcoded literal source value)
        source: `${sourceKey}_contact_form`,
        initial_contact_name: name,
        initial_tenant_id: tenant_id,
      })
      userIdForLead = result.userId
    } catch (err) {
      console.error('[walliam/contact] get-or-create auth user failed (continuing with user_id=null):', err)
    }

    // Save lead with full hierarchy chain (per Lead+Email contract)
    const { data: lead } = await supabase.from('leads').insert({
      agent_id: agent?.id || null,
      user_id: userIdForLead,
      manager_id: chainManagerId,
      area_manager_id: chainAreaManagerId,
      tenant_admin_id: chainTenantAdminId,
      tenant_id,
      contact_name: name,
      contact_email: email,
      contact_phone: phone || null,
      message: message || null,
      source: source || `${sourceKey}_contact`,
      source_url: pageUrl,
      lead_origin_route: 'contact_form',
      building_id: building_id || null,
      listing_id: listing_id || null,
      area_id: area_id || null,
      municipality_id: municipality_id || null,
      community_id: community_id || null,
      neighbourhood_id: neighbourhood_id || null,
      geo_name: geo_name || null,
      status: 'new',
      assignment_source: agent ? 'geo' : 'admin',
    }).select('id').single()

    // Build email HTML
    const html = buildContactEmail({ name, email, phone, message, source, sourceUrl: pageUrl, geo_name, building_id, listing_id, brandName })
    const subject = `\u2756 ${brandName} Inquiry \u2014 ${name} \u2014 ${geo_name || source || brandName}`

    // Chain notification — single helper-driven send (replaces inline manager-CC + hardcoded admin BCC)
    let recipients
    try {
      recipients = await getLeadEmailRecipients(tenant_id, agent?.id || null, supabase)
    } catch (err) {
      if (err instanceof AdminPlatformUnreachable) {
        console.error('[walliam/contact] admin platform unreachable:', err.message)
        recipients = null
      } else {
        throw err
      }
    }

    if (recipients) {
      try {
        const sendResult = await sendTenantEmail({
          tenantId: tenant_id,
          to: recipients.to,
          cc: recipients.cc.length > 0 ? recipients.cc : undefined,
          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
          subject,
          html,
        })
        if (lead?.id) {
          await logEmailRecipients({
            supabase,
            tenantId: tenant_id,
            leadId: lead.id,
            agentId: agent?.id || null,
            recipients,
            subject,
            templateKey: 'walliam_contact_lead_capture',
            resendMessageId: sendResult.id,
          })
        }
      } catch (err) {
        if (err instanceof TenantEmailNotConfigured) {
          console.warn('[walliam/contact] tenant email not configured:', err.message)
        } else if (err instanceof TenantEmailFailed) {
          console.error('[walliam/contact] resend send failed:', err.message)
        } else {
          console.error('[walliam/contact] unexpected email error:', err)
        }
      }
    }

    // Track activity
    await trackUserActivity(supabase, email, agent?.id || null, 'contact_form', {
      source: source || `${sourceKey}_contact`,
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

function buildContactEmail({ name, email, phone, message, source, sourceUrl, geo_name, building_id, listing_id, brandName }: any): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 22px; font-weight: 900; color: #fff; margin-bottom: 8px;">
          <span style="font-weight: 900;">${brandName}</span>
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
          ${sourceUrl ? `<tr><td style="color: #64748b; vertical-align: top;">Source URL</td><td style="color: #1d4ed8;"><a href="${sourceUrl}" style="color: #1d4ed8; text-decoration: none;">${sourceUrl}</a></td></tr>` : ''}
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