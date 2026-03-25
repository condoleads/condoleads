// app/api/charlie/plan-email/route.ts
// Sends automatic plan notification email to user when plan is generated
// Called internally from /api/charlie/route.ts — not a user-facing endpoint

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
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
    const { email, planType, agentId, geoContext } = await req.json()

    if (!email || !planType) {
      return NextResponse.json({ error: 'email and planType required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Get agent info for email
    let agent: any = null
    if (agentId) {
      const { data } = await supabase
        .from('agents')
        .select('full_name, email, cell_phone, profile_photo_url, brokerage_name, title')
        .eq('id', agentId)
        .single()
      agent = data
    }

    const geoName = geoContext?.geoName || 'the GTA'
    const isBuyer = planType === 'buyer'

    await resend.emails.send({
      from: 'WALLiam <notifications@condoleads.ca>',
      to: email,
      subject: `Your WALLiam ${isBuyer ? 'Buyer' : 'Seller'} Plan — ${geoName}`,
      html: buildPlanNotificationEmail({ planType, geoName, agent }),
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[charlie/plan-email] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function buildPlanNotificationEmail(data: {
  planType: string
  geoName: string
  agent?: any
}): string {
  const { planType, geoName, agent } = data
  const isBuyer = planType === 'buyer'

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
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 28px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 26px; font-weight: 900; color: #fff; margin-bottom: 16px;">
          <span style="font-weight: 900;">WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.5);">iam</span>
        </div>
        <h1 style="color: #fff; font-size: 20px; font-weight: 800; margin: 0 0 6px;">
          ${isBuyer ? '🏠 Your Buyer Plan is Ready' : '💰 Your Seller Strategy is Ready'}
        </h1>
        <p style="color: rgba(255,255,255,0.5); margin: 0; font-size: 14px;">
          Your personalized plan for ${geoName} has been generated.
        </p>
      </div>

      <div style="padding: 24px 28px; border: 1px solid #e2e8f0; border-top: none;">
        <div style="background: #f8fafc; border-radius: 10px; padding: 16px; margin-bottom: 20px; font-size: 14px; color: #374151; line-height: 1.6;">
          ${isBuyer
            ? 'Your buyer plan includes matched listings, market intelligence, and the best time to buy in your area. Open WALLiam to book a viewing with your agent.'
            : 'Your seller strategy includes your estimated value range, market conditions, and the best time to list. Open WALLiam to book a consultation with your agent.'
          }
        </div>

        ${agentHtml}

        <div style="text-align: center; margin: 20px 0 8px;">
          <a href="${BASE_URL}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px;">
            ✦ Open WALLiam to Book
          </a>
        </div>
      </div>

      <div style="padding: 16px 28px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 11px;">WALLiam · walliam.ca</p>
      </div>
    </div>
  `
}