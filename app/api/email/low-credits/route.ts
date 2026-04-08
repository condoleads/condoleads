// app/api/email/low-credits/route.ts
// Sends warning email when user has 1 credit remaining
// Triggered from charlie/route.ts and estimator session route
// Deduped via low_credit_email_sent JSONB on user_profiles

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const ADMIN_EMAIL = 'condoleads.ca@gmail.com'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'
const FROM = 'WALLiam <notifications@condoleads.ca>'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const { userId, creditType, remaining, sessionId } = await req.json()
    // creditType: 'chat' | 'plan' | 'estimate'

    if (!userId || !creditType) {
      return NextResponse.json({ error: 'userId and creditType required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Check dedup — only send once per credit type
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('low_credit_email_sent, full_name, assigned_agent_id')
      .eq('id', userId)
      .single()

    const sent = profile?.low_credit_email_sent || {}
    if (sent[creditType] === true) {
      return NextResponse.json({ success: true, skipped: true })
    }

    // Get user email
    const { data: authData } = await supabase.auth.admin.getUserById(userId)
    const userEmail = authData?.user?.email
    if (!userEmail) return NextResponse.json({ error: 'User email not found' }, { status: 404 })

    const userName = profile?.full_name || 'there'

    // Resolve agent
    const tenantId = req.headers.get('x-tenant-id') || 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
    let agent: any = null

    if (profile?.assigned_agent_id) {
      const { data: agentData } = await supabase
        .from('agents')
        .select('id, full_name, email, notification_email, cell_phone, profile_photo_url, brokerage_name, title')
        .eq('id', profile.assigned_agent_id)
        .single()
      if (agentData) agent = agentData
    }

    if (!agent) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('default_agent_id, brand_name')
        .eq('id', tenantId)
        .single()
      if (tenant?.default_agent_id) {
        const { data: agentData } = await supabase
          .from('agents')
          .select('id, full_name, email, notification_email, cell_phone, profile_photo_url, brokerage_name, title')
          .eq('id', tenant.default_agent_id)
          .single()
        if (agentData) agent = agentData
      }
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('brand_name')
      .eq('id', tenantId)
      .single()
    const brandName = tenant?.brand_name || 'WALLiam'

    const creditLabels: Record<string, string> = {
      chat: 'AI Chat',
      plan: 'AI Plan',
      estimate: 'AI Estimate',
    }
    const creditEmojis: Record<string, string> = {
      chat: '💬',
      plan: '📋',
      estimate: '📊',
    }
    const creditLabel = creditLabels[creditType] || creditType
    const creditEmoji = creditEmojis[creditType] || '✦'

    const html = buildLowCreditEmail({ userName, creditLabel, creditEmoji, remaining, agent, brandName })
    const subject = `⚠️ You have 1 ${creditLabel} remaining — ${brandName}`

    await resend.emails.send({ from: FROM, to: userEmail, subject, html })
      .catch(err => console.error('[low-credits] email error:', err))

    // Mark as sent — update only the specific credit type key
    const updatedSent = { ...sent, [creditType]: true }
    await supabase
      .from('user_profiles')
      .update({ low_credit_email_sent: updatedSent })
      .eq('id', userId)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[email/low-credits] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function buildLowCreditEmail(data: {
  userName: string
  creditLabel: string
  creditEmoji: string
  remaining: number
  agent: any
  brandName: string
}): string {
  const { userName, creditLabel, creditEmoji, agent, brandName } = data

  const agentHtml = agent ? `
    <div style="background:#0f172a;border-radius:12px;padding:20px;margin:24px 0;text-align:center;">
      <div style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Request More from Your Agent</div>
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
        <div style="font-size:26px;font-weight:900;color:#fff;margin-bottom:16px;">
          <span style="font-weight:900;">WALL</span><span style="font-weight:300;color:rgba(255,255,255,0.5);">iam</span>
        </div>
        <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0 0 8px;">⚠️ 1 ${creditLabel} Remaining</h1>
        <p style="color:rgba(255,255,255,0.5);margin:0;font-size:14px;">Hi ${userName} — use it wisely.</p>
      </div>
      <div style="padding:24px 28px;border:1px solid #e2e8f0;border-top:none;">

        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:18px;margin-bottom:24px;text-align:center;">
          <div style="font-size:36px;margin-bottom:8px;">${creditEmoji}</div>
          <div style="font-size:32px;font-weight:900;color:#d97706;">1</div>
          <div style="font-size:14px;color:#92400e;font-weight:600;margin-top:4px;">${creditLabel} remaining</div>
        </div>

        <p style="font-size:14px;color:#1e293b;line-height:1.7;margin:0 0 16px;">
          You've almost used all your free ${creditLabel.toLowerCase()} credits. 
          To get more, request additional access from your agent — they'll review and approve within 24 hours.
        </p>

        <p style="font-size:14px;color:#1e293b;line-height:1.7;margin:0 0 24px;">
          In the meantime, you can still <a href="${BASE_URL}" style="color:#1d4ed8;font-weight:600;">browse listings, buildings and neighbourhoods</a> freely — no credits needed.
        </p>

        ${agentHtml}

        <div style="text-align:center;margin:24px 0 8px;">
          <a href="${BASE_URL}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#1d4ed8,#4f46e5);color:white;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">
            ✦ Open ${brandName}
          </a>
        </div>

      </div>
      <div style="padding:16px 28px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="margin:0;color:#94a3b8;font-size:11px;">${brandName} &middot; walliam.ca</p>
      </div>
    </div>
  `
}