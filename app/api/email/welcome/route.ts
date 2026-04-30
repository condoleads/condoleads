// app/api/email/welcome/route.ts
//
// Sends welcome email to new user on registration.
// Called from joinTenant after a fresh tenant_users row is created.
//
// Architectural role (W-TENANT-AUTH Phase 4a):
//   - Reads x-tenant-id from headers. REQUIRED. No fallback. Returns 400 if missing.
//   - Resolves brand/domain/agent from the tenant row, never from hardcoded constants.
//   - Dedup flag lives on tenant_users.welcome_email_sent (per-tenant). Same user can
//     legitimately receive a welcome email on tenant-1 AND tenant-2 — those are
//     separate relationships. Legacy user_profiles.welcome_email_sent is dual-written
//     for back-compat (D1 decision; cleanup tracked as W-PROFILE-CLEANUP).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTenantEmail } from '@/lib/email/sendTenantEmail'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get('x-tenant-id')
    if (!tenantId) {
      return NextResponse.json(
        { error: 'x-tenant-id header required' },
        { status: 400 }
      )
    }

    const { userId, email, fullName } = await req.json()
    if (!userId || !email) {
      return NextResponse.json({ error: 'userId and email required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Per-tenant dedup check — primary source of truth
    const { data: tenantUser } = await supabase
      .from('tenant_users')
      .select('welcome_email_sent, assigned_agent_id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (tenantUser?.welcome_email_sent) {
      return NextResponse.json({ success: true, skipped: true, reason: 'already_sent_for_tenant' })
    }

    // Pull profile for fullName fallback only — no per-tenant data read from here
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()

    const userName = fullName || profile?.full_name || 'there'

    // Resolve tenant config (brand, domain, credits, default_agent_id)
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select(`
        id, name, domain, brand_name, assistant_name,
        ai_free_messages, plan_free_attempts, estimator_free_attempts,
        default_agent_id, admin_email, brokerage_name
      `)
      .eq('id', tenantId)
      .single()

    if (tenantErr || !tenant) {
      console.error('[welcome] tenant not found:', tenantId, tenantErr)
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const brandName = tenant.brand_name || tenant.name || 'Your Real Estate Assistant'
    const tenantDomain = tenant.domain
    const baseUrl = `https://${tenantDomain}`
    const assistantName = tenant.assistant_name || 'Charlie'
    const adminEmail = tenant.admin_email
    const chatCredits = tenant.ai_free_messages ?? 5
    const planCredits = tenant.plan_free_attempts ?? 1
    const estimateCredits = tenant.estimator_free_attempts ?? 2

    // Resolve assigned agent (per-tenant) -> tenant default agent fallback
    let agent: any = null
    let managerEmail: string | null = null

    const agentId = tenantUser?.assigned_agent_id

    if (agentId) {
      const { data: agentData } = await supabase
        .from('agents')
        .select('id, full_name, email, notification_email, cell_phone, profile_photo_url, brokerage_name, title, parent_id, tenant_id')
        .eq('id', agentId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (agentData) {
        agent = agentData
        if (agentData.parent_id) {
          const { data: manager } = await supabase
            .from('agents')
            .select('email, notification_email')
            .eq('id', agentData.parent_id)
            .maybeSingle()
          if (manager) managerEmail = manager.notification_email || manager.email
        }
      }
    }

    if (!agent && tenant.default_agent_id) {
      const { data: agentData } = await supabase
        .from('agents')
        .select('id, full_name, email, notification_email, cell_phone, profile_photo_url, brokerage_name, title, parent_id, tenant_id')
        .eq('id', tenant.default_agent_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (agentData) agent = agentData
    }

    // Build user-facing welcome email
    const userHtml = buildWelcomeEmail({
      userName,
      email,
      agent,
      chatCredits,
      planCredits,
      estimateCredits,
      brandName,
      tenantDomain,
      baseUrl,
      assistantName,
    })

    const subject = `Welcome to ${brandName} \u2014 your AI real estate assistant is ready`

    await sendTenantEmail({ tenantId, to: email, subject, html: userHtml })
      .catch(err => console.error('[welcome] user email error:', err))

    // Notify agent (or admin fallback) of registration
    if (agent?.email) {
      const agentNotifyEmail = agent.notification_email || agent.email
      const bccList = adminEmail ? [adminEmail] : undefined
      await sendTenantEmail({
        tenantId,
        to: agentNotifyEmail,
        cc: managerEmail ? [managerEmail] : undefined,
        bcc: bccList,
        subject: `New registration \u2014 ${userName} on ${brandName}`,
        html: buildAgentRegistrationEmail({ userName, email, brandName, tenantDomain, baseUrl }),
      }).catch(err => console.error('[welcome] agent email error:', err))
    } else if (adminEmail) {
      await sendTenantEmail({
        tenantId,
        to: adminEmail,
        subject: `New registration \u2014 ${userName} on ${brandName}`,
        html: buildAgentRegistrationEmail({ userName, email, brandName, tenantDomain, baseUrl }),
      }).catch(err => console.error('[welcome] admin fallback error:', err))
    }

    // Mark welcome email sent — per-tenant primary, legacy global dual-write
    await supabase
      .from('tenant_users')
      .update({ welcome_email_sent: true, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)

    await supabase
      .from('user_profiles')
      .update({ welcome_email_sent: true })
      .eq('id', userId)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[email/welcome] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function buildWelcomeEmail(data: {
  userName: string
  email: string
  agent: any
  chatCredits: number
  planCredits: number
  estimateCredits: number
  brandName: string
  tenantDomain: string
  baseUrl: string
  assistantName: string
}): string {
  const { userName, agent, chatCredits, planCredits, estimateCredits, brandName, tenantDomain, baseUrl, assistantName } = data

  const agentHtml = agent ? `
    <div style="background:#0f172a;border-radius:12px;padding:20px;margin:24px 0;text-align:center;">
      <div style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Your Agent</div>
      ${agent.profile_photo_url ? `<img src="${agent.profile_photo_url}" alt="${agent.full_name}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.15);margin-bottom:8px;">` : ''}
      <div style="font-size:15px;font-weight:700;color:#fff;">${agent.full_name}</div>
      ${agent.title ? `<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:2px;">${agent.title}</div>` : ''}
      ${agent.brokerage_name ? `<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px;">${agent.brokerage_name}</div>` : ''}
      <div style="margin-top:12px;">
        ${agent.email ? `<a href="mailto:${agent.email}" style="display:inline-block;margin:4px;padding:7px 16px;background:rgba(255,255,255,0.08);border-radius:8px;color:#93c5fd;font-size:12px;text-decoration:none;">${agent.email}</a>` : ''}
        ${agent.cell_phone ? `<a href="tel:${agent.cell_phone}" style="display:inline-block;margin:4px;padding:7px 16px;background:rgba(255,255,255,0.08);border-radius:8px;color:#93c5fd;font-size:12px;text-decoration:none;">${agent.cell_phone}</a>` : ''}
      </div>
    </div>
  ` : ''

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;">
      <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px 28px;border-radius:12px 12px 0 0;">
        <div style="font-size:26px;font-weight:900;color:#fff;margin-bottom:16px;">${brandName}</div>
        <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0 0 8px;">Welcome, ${userName}!</h1>
        <p style="color:rgba(255,255,255,0.5);margin:0;font-size:14px;">Your AI real estate assistant is ready to use.</p>
      </div>
      <div style="padding:24px 28px;border:1px solid #e2e8f0;border-top:none;">

        <p style="font-size:14px;color:#1e293b;line-height:1.7;margin:0 0 20px;">
          You can browse listings, neighbourhoods and buildings freely \u2014 no credits needed.
          When you're ready to use AI features, here's what you have:
        </p>

        <table width="100%" cellpadding="0" cellspacing="8" border="0" style="margin-bottom:24px;">
          <tr>
            <td width="33%" style="padding:0 4px;">
              <div style="background:#f1f5f9;border-radius:10px;padding:16px;text-align:center;">
                <div style="font-size:28px;font-weight:900;color:#1d4ed8;">${chatCredits}</div>
                <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-top:4px;">AI Chats</div>
              </div>
            </td>
            <td width="33%" style="padding:0 4px;">
              <div style="background:#f1f5f9;border-radius:10px;padding:16px;text-align:center;">
                <div style="font-size:28px;font-weight:900;color:#059669;">${estimateCredits}</div>
                <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-top:4px;">AI Estimates</div>
              </div>
            </td>
            <td width="33%" style="padding:0 4px;">
              <div style="background:#f1f5f9;border-radius:10px;padding:16px;text-align:center;">
                <div style="font-size:28px;font-weight:900;color:#7c3aed;">${planCredits}</div>
                <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-top:4px;">AI Plan${planCredits !== 1 ? 's' : ''}</div>
              </div>
            </td>
          </tr>
        </table>

        <table width="100%" cellpadding="8" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr>
            <td style="background:#eff6ff;border-radius:10px;padding:16px;">
              <a href="${baseUrl}" style="display:block;text-decoration:none;">
                <div style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:4px;">Get My Buyer Plan</div>
                <div style="font-size:12px;color:#3b82f6;">Tell ${assistantName} your budget and area \u2014 get a full AI plan in minutes</div>
              </a>
            </td>
          </tr>
          <tr><td style="height:8px;"></td></tr>
          <tr>
            <td style="background:#f0fdf4;border-radius:10px;padding:16px;">
              <a href="${baseUrl}" style="display:block;text-decoration:none;">
                <div style="font-size:13px;font-weight:700;color:#059669;margin-bottom:4px;">Get My Home Value</div>
                <div style="font-size:12px;color:#10b981;">Get an AI estimate of your property's current market value</div>
              </a>
            </td>
          </tr>
          <tr><td style="height:8px;"></td></tr>
          <tr>
            <td style="background:#faf5ff;border-radius:10px;padding:16px;">
              <a href="${baseUrl}" style="display:block;text-decoration:none;">
                <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:4px;">Ask ${assistantName}</div>
                <div style="font-size:12px;color:#8b5cf6;">Market intelligence, neighbourhood data, investment rankings</div>
              </a>
            </td>
          </tr>
        </table>

        ${agentHtml}

        <div style="text-align:center;margin:24px 0 8px;">
          <a href="${baseUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#1d4ed8,#4f46e5);color:white;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">
            Open ${brandName}
          </a>
        </div>

      </div>
      <div style="padding:16px 28px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="margin:0;color:#94a3b8;font-size:11px;">${brandName} &middot; ${tenantDomain}</p>
      </div>
    </div>
  `
}

function buildAgentRegistrationEmail(data: {
  userName: string
  email: string
  brandName: string
  tenantDomain: string
  baseUrl: string
}): string {
  const { userName, email, brandName, tenantDomain, baseUrl } = data
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:24px;border-radius:12px 12px 0 0;">
        <div style="font-size:22px;font-weight:900;color:#fff;margin-bottom:4px;">${brandName}</div>
        <h1 style="color:#fff;margin:8px 0 0;font-size:18px;font-weight:700;">New Registration</h1>
        <p style="color:rgba(255,255,255,0.4);margin:4px 0 0;font-size:12px;">via ${brandName} \u00b7 ${new Date().toLocaleDateString('en-CA')}</p>
      </div>
      <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:6px 0;color:#64748b;width:80px;">Name</td><td style="padding:6px 0;font-weight:700;color:#0f172a;">${userName}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}" style="color:#2563eb;">${email}</a></td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Status</td><td style="padding:6px 0;color:#059669;font-weight:700;">New \u2014 no AI activity yet</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Domain</td><td style="padding:6px 0;color:#0f172a;">${tenantDomain}</td></tr>
        </table>
        <div style="text-align:center;margin-top:16px;">
          <a href="${baseUrl}/admin-homes/leads" style="display:inline-block;padding:10px 24px;background:#0f172a;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;">
            View in Dashboard
          </a>
        </div>
      </div>
    </div>
  `
}