// app/api/charlie/lead/route.ts
// WALLiam Charlie lead capture — form-submission enrichment writer
// Resolves agent via resolve_agent_for_context() — NOT getAgentFromHost
//
// W-HIERARCHY H3.4b (2026-05-03): comprehensive refactor.
//
//   ROLE CHANGE: This route was the lead CREATOR. Now it's the lead ENRICHER.
//   Plan-email creates the lead at plan-generation time. This route updates that
//   row with form-submitted follow-up details (name correction, phone, message).
//
//   - F53: walkHierarchy replaces direct parent_id query — full chain capture
//   - F57: INSERT → UPSERT keyed on (user_id, session_id, intent).
//          Defensive INSERT only if no matching plan-email row found.
//   - F60: server-authoritative auth email — uses auth.users.email regardless of
//          form-supplied email; form's email field is informational only.
//          Name + phone from form (those can legitimately differ from registration).
//   - F58 piece: tenant_admin_id captured into lead payload.
//   - F47: helper replaces hardcoded ADMIN_EMAIL constant.
//   - F67: standard try/catch (TenantEmailNotConfigured / TenantEmailFailed /
//          AdminPlatformUnreachable / unexpected).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { walkHierarchy } from '@/lib/admin-homes/hierarchy'
import {
  sendTenantEmail,
  TenantEmailNotConfigured,
  TenantEmailFailed,
  getLeadEmailRecipients,
  AdminPlatformUnreachable,
} from '@/lib/admin-homes/lead-email-recipients'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get('x-tenant-id') || ''
    const {
      // Contact info — name + phone come from form. email IGNORED (F60).
      name,
      phone,
      // Plan context (for chain notification email content)
      intent,         // 'buyer' | 'seller'
      buyerProfile,
      sellerProfile,
      listings,
      analytics,
      // Agent resolution context (for defensive insert path only)
      sessionId,
      userId,
      listing_id,
      building_id,
      community_id,
      municipality_id,
      area_id,
    } = body

    // W-RECOVERY A1.5 auth gate — block forged lead submissions
    if (!sessionId || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!name || !intent) {
      return NextResponse.json({ error: 'name and intent are required' }, { status: 400 })
    }

    const supabase = createServiceClient()

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

    // F60: auth email is identity. Pull from auth.users; ignore any form-supplied email.
    const { data: authData } = await supabase.auth.admin.getUserById(userId)
    const authEmail = authData?.user?.email
    if (!authEmail) {
      return NextResponse.json({ error: 'User email not found' }, { status: 404 })
    }

    // Step 1: Resolve agent (still needed for defensive insert path + chain recipients)
    const { data: resolvedAgentId } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: listing_id || null,
      p_building_id: building_id || null,
      p_neighbourhood_id: null,
      p_community_id: community_id || null,
      p_municipality_id: municipality_id || null,
      p_area_id: area_id || null,
      p_user_id: userId || null,
      p_tenant_id: tenantId || null,
    })

    const agentId = resolvedAgentId || null

    // Step 2: Get agent details + walk hierarchy chain
    let agent: any = null
    let chainManagerId: string | null = null
    let chainAreaManagerId: string | null = null
    let chainTenantAdminId: string | null = null

    if (agentId) {
      const { data: agentData } = await supabase
        .from('agents')
        .select('id, full_name, email, notification_email, cell_phone, profile_photo_url, brokerage_name, title, parent_id')
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

    // Build plan_data for storage on the lead row
    const profile = intent === 'buyer' ? buyerProfile : sellerProfile
    const planData = {
      intent,
      geoName: profile?.geoName || null,
      geoType: profile?.geoType || null,
      geoId: profile?.geoId || null,
      ...(intent === 'buyer' ? {
        budgetMin: buyerProfile?.budgetMin || null,
        budgetMax: buyerProfile?.budgetMax || null,
        propertyType: buyerProfile?.propertyType || null,
        bedrooms: buyerProfile?.bedrooms || null,
        timeline: buyerProfile?.timeline || null,
      } : {
        propertyType: sellerProfile?.propertyType || null,
        estimatedValueMin: sellerProfile?.estimatedValueMin || null,
        estimatedValueMax: sellerProfile?.estimatedValueMax || null,
        timeline: sellerProfile?.timeline || null,
        goal: sellerProfile?.goal || null,
      }),
      analytics: analytics || null,
      topListings: (listings || []).slice(0, 5).map((l: any) => ({
        listingKey: l.listing_key,
        address: l.unparsed_address,
        price: l.list_price,
        bedrooms: l.bedrooms_total,
        slug: l._slug || null,
      })),
      generatedAt: new Date().toISOString(),
    }

    // F57: UPSERT into existing plan-email lead row, not new INSERT.
    // Match on (user_id, source='walliam_charlie', intent). Most recent row wins
    // in the rare case multiple plan-email rows exist for same user+intent.
    let leadId: string | null = null

    const { data: existingLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId || '')
      .eq('source', 'walliam_charlie')
      .eq('intent', intent)
      .order('created_at', { ascending: false })
      .limit(1)

    const existingLead = existingLeads?.[0]

    if (existingLead) {
      // UPDATE: enrich the existing plan-email row with form-supplied detail
      leadId = existingLead.id
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          contact_name: name,           // form-supplied; can legitimately differ from auth name
          contact_email: authEmail,     // F60: auth-authoritative
          contact_phone: phone || null, // form-supplied
          plan_data: planData,
          manager_id: chainManagerId,
          area_manager_id: chainAreaManagerId,
          tenant_admin_id: chainTenantAdminId,
          assignment_source: agentId ? 'geo' : 'admin',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLead.id)

      if (updateError) {
        console.error('[charlie/lead] enrichment update error:', updateError)
        return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
      }
    } else {
      // Defensive INSERT: plan-email never created a row (shouldn't happen, but don't lose data)
      const { data: newLead, error: insertError } = await supabase
        .from('leads')
        .insert({
          agent_id: agentId,
          user_id: userId,
          contact_name: name,
          contact_email: authEmail,
          contact_phone: phone || null,
          source: 'walliam_charlie',
          intent,
          geo_name: profile?.geoName || null,
          budget_max: buyerProfile?.budgetMax || null,
          plan_data: planData,
          manager_id: chainManagerId,
          area_manager_id: chainAreaManagerId,
          tenant_admin_id: chainTenantAdminId,
          assignment_source: agentId ? 'geo' : 'admin',
          tenant_id: tenantId || null,
          status: 'new',
          quality: 'hot',
        })
        .select('id')
        .single()

      if (insertError || !newLead) {
        console.error('[charlie/lead] defensive insert error:', insertError)
        return NextResponse.json({ error: 'Failed to save lead' }, { status: 500 })
      }
      leadId = newLead.id
    }

    // Link lead to session
    if (sessionId && leadId) {
      await supabase
        .from('chat_sessions')
        .update({ lead_id: leadId, last_activity_at: new Date().toISOString() })
        .eq('id', sessionId)
    }

    // Step: Send rich plan email → USER (single recipient, not chain)
    try {
      await sendTenantEmail({
        tenantId,
        to: authEmail,
        subject: `Your WALLiam ${intent === 'buyer' ? 'Buyer' : 'Seller'} Plan — ${profile?.geoName || 'GTA'}`,
        html: buildUserPlanEmail({ name, intent, buyerProfile, sellerProfile, listings, analytics, agent }),
      })
    } catch (err) {
      if (err instanceof TenantEmailNotConfigured) {
        console.warn('[charlie/lead] tenant email not configured (user):', err.message)
      } else if (err instanceof TenantEmailFailed) {
        console.error('[charlie/lead] resend send failed (user):', err.message)
      } else {
        console.error('[charlie/lead] unexpected user email error:', err)
      }
    }

    // Step: Chain notification — single helper-driven send (replaces inline manager-CC + ADMIN_EMAIL)
    let recipients
    try {
      recipients = await getLeadEmailRecipients(tenantId, agentId, supabase)
    } catch (err) {
      if (err instanceof AdminPlatformUnreachable) {
        console.error('[charlie/lead] admin platform unreachable:', err.message)
        recipients = null
      } else {
        throw err
      }
    }

    if (recipients) {
      try {
        await sendTenantEmail({
          tenantId,
          to: recipients.to,
          cc: recipients.cc.length > 0 ? recipients.cc : undefined,
          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
          subject: `🏠 New ${intent === 'buyer' ? 'Buyer' : 'Seller'} Lead — ${name} — ${profile?.geoName || 'GTA'}`,
          html: buildAgentLeadEmail({ name, email: authEmail, phone, intent, buyerProfile, sellerProfile, listings, analytics }),
        })
      } catch (err) {
        if (err instanceof TenantEmailNotConfigured) {
          console.warn('[charlie/lead] tenant email not configured (chain):', err.message)
        } else if (err instanceof TenantEmailFailed) {
          console.error('[charlie/lead] resend send failed (chain):', err.message)
        } else {
          console.error('[charlie/lead] unexpected chain email error:', err)
        }
      }
    }

    return NextResponse.json({ success: true, leadId })

  } catch (error) {
    console.error('[charlie/lead] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Rich plan email → user ────────────────────────────────────────────────

function buildUserPlanEmail(data: {
  name: string
  intent: string
  buyerProfile?: any
  sellerProfile?: any
  listings?: any[]
  analytics?: any
  agent?: any
}): string {
  const { name, intent, buyerProfile, sellerProfile, listings, analytics, agent } = data
  const profile = intent === 'buyer' ? buyerProfile : sellerProfile
  const isBuyer = intent === 'buyer'
  const topListings = (listings || []).slice(0, 5)

  const marketCards = analytics ? `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0;">
      ${[
        { label: 'Median PSF', value: analytics.median_psf ? `$${Number(analytics.median_psf).toLocaleString('en-CA', { maximumFractionDigits: 0 })}` : '—' },
        { label: 'Avg Days on Market', value: analytics.closed_avg_dom_90 ? `${analytics.closed_avg_dom_90}d` : '—' },
        { label: 'Sale / List', value: analytics.sale_to_list_ratio ? `${analytics.sale_to_list_ratio}%` : '—' },
      ].map(m => `
        <div style="background: #f1f5f9; border-radius: 10px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px;">${m.label}</div>
          <div style="font-size: 20px; font-weight: 800; color: #0f172a;">${m.value}</div>
        </div>
      `).join('')}
    </div>
  ` : ''

  const listingCards = topListings.length > 0 ? `
    <div style="margin: 20px 0;">
      <h3 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.08em;">
        ${isBuyer ? 'Matched Listings' : 'Comparable Sales'}
      </h3>
      ${topListings.map((l: any) => `
        <a href="${BASE_URL}/${l._slug || l.listing_key}" style="display: block; text-decoration: none; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${l.unparsed_address || '—'}</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${l.bedrooms_total ? `${l.bedrooms_total} bed` : ''} ${l.bathrooms_total_integer ? `· ${l.bathrooms_total_integer} bath` : ''}</div>
            </div>
            <div style="font-size: 16px; font-weight: 800; color: #1d4ed8;">$${Number(l.list_price || l.close_price || 0).toLocaleString('en-CA')}</div>
          </div>
        </a>
      `).join('')}
    </div>
  ` : ''

  const profileSection = isBuyer ? `
    <div style="background: #f1f5f9; border-radius: 10px; padding: 16px; margin: 16px 0;">
      <h3 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.08em;">Your Buyer Profile</h3>
      ${buyerProfile?.budgetMax ? `<p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>Budget:</strong> $${Number(buyerProfile.budgetMin || 0).toLocaleString('en-CA')} – $${Number(buyerProfile.budgetMax).toLocaleString('en-CA')}</p>` : ''}
      ${buyerProfile?.propertyType ? `<p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>Property Type:</strong> ${buyerProfile.propertyType}</p>` : ''}
      ${buyerProfile?.bedrooms ? `<p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>Bedrooms:</strong> ${buyerProfile.bedrooms}+</p>` : ''}
      ${buyerProfile?.timeline ? `<p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>Timeline:</strong> ${buyerProfile.timeline}</p>` : ''}
    </div>
  ` : `
    <div style="background: #f1f5f9; border-radius: 10px; padding: 16px; margin: 16px 0;">
      <h3 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.08em;">Your Seller Profile</h3>
      ${sellerProfile?.propertyType ? `<p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>Property Type:</strong> ${sellerProfile.propertyType}</p>` : ''}
      ${sellerProfile?.estimatedValueMin ? `<p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>Estimated Value:</strong> $${Number(sellerProfile.estimatedValueMin).toLocaleString('en-CA')} – $${Number(sellerProfile.estimatedValueMax).toLocaleString('en-CA')}</p>` : ''}
      ${sellerProfile?.timeline ? `<p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>Timeline:</strong> ${sellerProfile.timeline}</p>` : ''}
      ${sellerProfile?.goal ? `<p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>Goal:</strong> ${sellerProfile.goal}</p>` : ''}
    </div>
  `

  const agentSection = agent ? `
    <div style="background: #0f172a; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
      <div style="font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px;">Your Agent</div>
      ${agent.profile_photo_url ? `<img src="${agent.profile_photo_url}" alt="${agent.full_name}" style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 3px solid rgba(255,255,255,0.15); margin-bottom: 10px;">` : ''}
      <div style="font-size: 16px; font-weight: 700; color: #fff;">${agent.full_name}</div>
      ${agent.title ? `<div style="font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 2px;">${agent.title}</div>` : ''}
      ${agent.brokerage_name ? `<div style="font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 2px;">${agent.brokerage_name}</div>` : ''}
      <div style="margin-top: 14px; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
        ${agent.email ? `<a href="mailto:${agent.email}" style="display: inline-block; padding: 8px 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: #93c5fd; font-size: 12px; text-decoration: none;">${agent.email}</a>` : ''}
        ${agent.cell_phone ? `<a href="tel:${agent.cell_phone}" style="display: inline-block; padding: 8px 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: #93c5fd; font-size: 12px; text-decoration: none;">${agent.cell_phone}</a>` : ''}
      </div>
    </div>
  ` : ''

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 28px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 28px; font-weight: 900; color: #fff; letter-spacing: -0.02em; margin-bottom: 4px;">
          <span style="font-weight: 900;">WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.6);">iam</span>
        </div>
        <div style="font-size: 13px; color: rgba(255,255,255,0.4); margin-bottom: 20px;">AI Real Estate</div>
        <h1 style="color: #fff; font-size: 22px; font-weight: 800; margin: 0 0 6px;">
          Your ${isBuyer ? 'Buyer' : 'Seller'} Plan is Ready
        </h1>
        <p style="color: rgba(255,255,255,0.5); margin: 0; font-size: 14px;">
          Hi ${name} — here's your personalized plan for ${profile?.geoName || 'the GTA'}.
        </p>
      </div>

      <div style="padding: 24px 28px; border: 1px solid #e2e8f0; border-top: none;">

        ${analytics ? `
        <h3 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.08em;">
          Market Intelligence · ${profile?.geoName || ''}
        </h3>
        ${marketCards}
        ` : ''}

        ${profileSection}

        ${listingCards}

        ${agentSection}

        <div style="text-align: center; margin: 24px 0 8px;">
          <a href="${BASE_URL}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px;">
            ✦ Continue on WALLiam
          </a>
        </div>
      </div>

      <div style="padding: 16px 28px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 11px;">
          Sent by WALLiam AI · walliam.ca
        </p>
      </div>
    </div>
  `
}

// ─── Lead brief email → agent / chain ─────────────────────────────────────

function buildAgentLeadEmail(data: {
  name: string
  email: string
  phone?: string
  intent: string
  buyerProfile?: any
  sellerProfile?: any
  listings?: any[]
  analytics?: any
}): string {
  const { name, email, phone, intent, buyerProfile, sellerProfile, listings } = data
  const profile = intent === 'buyer' ? buyerProfile : sellerProfile
  const isBuyer = intent === 'buyer'
  const topListings = (listings || []).slice(0, 3)

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 24px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 22px; font-weight: 900; color: #fff; margin-bottom: 4px;">
          <span>WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.5);">iam</span>
        </div>
        <h1 style="color: #fff; margin: 8px 0 0; font-size: 18px; font-weight: 700;">
          New ${isBuyer ? '🏠 Buyer' : '💰 Seller'} Lead
        </h1>
        <p style="color: rgba(255,255,255,0.4); margin: 4px 0 0; font-size: 12px;">via Charlie AI · ${new Date().toLocaleDateString('en-CA')}</p>
      </div>

      <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none;">
        <h2 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.08em;">Contact</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
          <tr><td style="padding: 5px 0; color: #64748b; width: 80px;">Name</td><td style="padding: 5px 0; font-weight: 700; color: #0f172a;">${name}</td></tr>
          <tr><td style="padding: 5px 0; color: #64748b;">Email</td><td style="padding: 5px 0;"><a href="mailto:${email}" style="color: #2563eb;">${email}</a></td></tr>
          ${phone ? `<tr><td style="padding: 5px 0; color: #64748b;">Phone</td><td style="padding: 5px 0;"><a href="tel:${phone}" style="color: #2563eb;">${phone}</a></td></tr>` : ''}
          <tr><td style="padding: 5px 0; color: #64748b;">Area</td><td style="padding: 5px 0; color: #0f172a;">${profile?.geoName || '—'}</td></tr>
          <tr><td style="padding: 5px 0; color: #64748b;">Intent</td><td style="padding: 5px 0; color: #0f172a;">${isBuyer ? 'Buyer' : 'Seller'}</td></tr>
        </table>

        <h2 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.08em;">Plan Summary</h2>
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 13px;">
          ${isBuyer ? `
            ${buyerProfile?.budgetMax ? `<p style="margin: 4px 0; color: #374151;"><strong>Budget:</strong> $${Number(buyerProfile.budgetMin || 0).toLocaleString('en-CA')} – $${Number(buyerProfile.budgetMax).toLocaleString('en-CA')}</p>` : ''}
            ${buyerProfile?.propertyType ? `<p style="margin: 4px 0; color: #374151;"><strong>Type:</strong> ${buyerProfile.propertyType}</p>` : ''}
            ${buyerProfile?.bedrooms ? `<p style="margin: 4px 0; color: #374151;"><strong>Bedrooms:</strong> ${buyerProfile.bedrooms}+</p>` : ''}
            ${buyerProfile?.timeline ? `<p style="margin: 4px 0; color: #374151;"><strong>Timeline:</strong> ${buyerProfile.timeline}</p>` : ''}
          ` : `
            ${sellerProfile?.propertyType ? `<p style="margin: 4px 0; color: #374151;"><strong>Type:</strong> ${sellerProfile.propertyType}</p>` : ''}
            ${sellerProfile?.estimatedValueMin ? `<p style="margin: 4px 0; color: #374151;"><strong>Est. Value:</strong> $${Number(sellerProfile.estimatedValueMin).toLocaleString('en-CA')} – $${Number(sellerProfile.estimatedValueMax).toLocaleString('en-CA')}</p>` : ''}
            ${sellerProfile?.timeline ? `<p style="margin: 4px 0; color: #374151;"><strong>Timeline:</strong> ${sellerProfile.timeline}</p>` : ''}
            ${sellerProfile?.goal ? `<p style="margin: 4px 0; color: #374151;"><strong>Goal:</strong> ${sellerProfile.goal}</p>` : ''}
          `}
        </div>

        ${topListings.length > 0 ? `
        <h2 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.08em;">Top Matched Listings</h2>
        ${topListings.map((l: any) => `
          <a href="${BASE_URL}/${l._slug || l.listing_key}" style="display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 8px; text-decoration: none;">
            <div>
              <div style="font-size: 13px; font-weight: 600; color: #0f172a;">${l.unparsed_address || '—'}</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${l.bedrooms_total ? `${l.bedrooms_total} bed` : ''}${l.bathrooms_total_integer ? ` · ${l.bathrooms_total_integer} bath` : ''}</div>
            </div>
            <div style="font-size: 15px; font-weight: 800; color: #1d4ed8;">$${Number(l.list_price || 0).toLocaleString('en-CA')}</div>
          </a>
        `).join('')}
        ` : ''}
      </div>

      <div style="padding: 16px 20px; background: white; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <a href="${BASE_URL}/admin-homes/leads" style="display: inline-block; padding: 10px 24px; background: #0f172a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px;">
          View in Dashboard
        </a>
        <p style="margin: 12px 0 0; color: #94a3b8; font-size: 11px;">WALLiam · walliam.ca</p>
      </div>
    </div>
  `
}