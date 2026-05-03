export const maxDuration = 60

// app/api/charlie/plan-email/route.ts
// Sends rich plan email to user + agent + manager + admin BCC
// Called client-side from useCharlie after generate_plan tool completes
//
// W-HIERARCHY H3.8 (2026-05-03):
//   - getLeadEmailRecipients enforces 6-layer chain (was: inline conditional with hardcoded ADMIN_EMAIL)
//   - tenant_admin_id captured into lead insert payload (F58)
//   - F47 hardcoded ADMIN_EMAIL constant removed
//   - F66 walker call shape standardized via helper
//   - F67 try/catch standard

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
    const { sessionId, userId, planType, plan, analytics, listings, geoContext, comparables, sellerEstimate, vipCreditUsed, vipCreditPlansUsed, vipCreditTotal, blocks } = await req.json()

    if (!sessionId || !userId || !planType) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // W-RECOVERY A1.5 auth gate — verify session belongs to userId before any email fires
    const _gateSupabase = createServiceClient()
    const { data: validSession } = await _gateSupabase
      .from('chat_sessions')
      .select('id, tenant_id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .eq('source', 'walliam')
      .maybeSingle()
    if (!validSession) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    // END W-RECOVERY A1.5 auth gate

    const supabase = createServiceClient()

    const { data: authData } = await supabase.auth.admin.getUserById(userId)
    const userEmail = authData?.user?.email
    if (!userEmail) return NextResponse.json({ error: 'User email not found' }, { status: 404 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', userId)
      .single()
    const userName = profile?.full_name || 'there'

    let agent: any = null
    let chainManagerId: string | null = null
    let chainAreaManagerId: string | null = null
    let chainTenantAdminId: string | null = null
    let tenantId: string | null = null

    if (sessionId) {
      const { data: session } = await supabase
        .from('chat_sessions')
        .select('agent_id, tenant_id')
        .eq('id', sessionId)
        .single()

      tenantId = session?.tenant_id || null

      if (session?.agent_id) {
        const { data: agentData } = await supabase
          .from('agents')
          .select('id, full_name, email, notification_email, cell_phone, profile_photo_url, brokerage_name, title, parent_id')
          .eq('id', session.agent_id)
          .single()

        if (agentData) {
          agent = agentData
          // Walker captures full chain (manager + area_manager + tenant_admin)
          const chain = await walkHierarchy(agentData.id, supabase)
          chainManagerId = chain.manager_id
          chainAreaManagerId = chain.area_manager_id
          chainTenantAdminId = chain.tenant_admin_id
        }
      }
    }

    const geoName = geoContext?.geoName || plan?.geoName || null

    // Save lead with full hierarchy chain stamped (per Lead+Email contract)
    await supabase.from('leads').insert({
      agent_id: agent?.id || null,
      user_id: userId,
      contact_name: userName,
      contact_email: userEmail,
      source: 'walliam_charlie',
      intent: planType,
      geo_name: geoName,
      budget_max: plan?.budgetMax || null,
      plan_data: { planType, plan, analytics, topListings: (listings || []).slice(0, 5) },
      manager_id: chainManagerId,
      area_manager_id: chainAreaManagerId,
      tenant_admin_id: chainTenantAdminId,
      assignment_source: agent ? 'geo' : 'admin',
      status: 'new',
      quality: 'hot',
      tenant_id: tenantId,
    })

    // Track activity
    await trackUserActivity(supabase, userEmail, agent?.id || null, 'contact_form', {
      source: 'walliam_charlie',
      planType,
      geoName: geoName || null,
      budgetMax: plan?.budgetMax || null,
    })

    const html = buildRichPlanEmail({ userName, userEmail, planType, plan, analytics, listings: listings || [], agent, geoName, comparables: comparables || [], sellerEstimate: sellerEstimate || null, vipCreditUsed: vipCreditUsed || false, vipCreditPlansUsed: vipCreditPlansUsed || 0, vipCreditTotal: vipCreditTotal || 1, blocks: blocks || [] })
    const subject = `\u2756 WALLiam ${planType === 'buyer' ? 'Buyer' : 'Seller'} Plan \u2014 ${geoName || 'GTA'} \u2014 ${userName}`

    // User-facing plan email — single recipient, not chain
    try {
      await sendTenantEmail({ tenantId: tenantId || '', to: userEmail, subject, html })
    } catch (err) {
      if (err instanceof TenantEmailNotConfigured) {
        console.warn('[plan-email] tenant email not configured (user):', err.message)
      } else if (err instanceof TenantEmailFailed) {
        console.error('[plan-email] resend send failed (user):', err.message)
      } else {
        console.error('[plan-email] unexpected user email error:', err)
      }
    }

    // Chain notification — single helper-driven send (replaces inline conditional ADMIN_EMAIL)
    let recipients
    try {
      recipients = await getLeadEmailRecipients(tenantId || '', agent?.id || null, supabase)
    } catch (err) {
      if (err instanceof AdminPlatformUnreachable) {
        console.error('[plan-email] admin platform unreachable:', err.message)
        recipients = null
      } else {
        throw err
      }
    }

    if (recipients) {
      try {
        await sendTenantEmail({
          tenantId: tenantId || '',
          to: recipients.to,
          cc: recipients.cc.length > 0 ? recipients.cc : undefined,
          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
          subject,
          html,
        })
      } catch (err) {
        if (err instanceof TenantEmailNotConfigured) {
          console.warn('[plan-email] tenant email not configured (chain):', err.message)
        } else if (err instanceof TenantEmailFailed) {
          console.error('[plan-email] resend send failed (chain):', err.message)
        } else {
          console.error('[plan-email] unexpected chain email error:', err)
        }
      }
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[charlie/plan-email] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const MONTHS_ARR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function buildRichPlanEmail(data: {
  userName: string
  userEmail: string
  planType: string
  plan: any
  analytics: any
  listings: any[]
  agent: any
  geoName: string | null
  comparables: any[]
  sellerEstimate: any | null
  vipCreditUsed: boolean
  vipCreditPlansUsed: number
  vipCreditTotal: number
  blocks: any[]
}): string {
  const { userName, planType, plan, analytics, listings, agent, geoName, comparables, sellerEstimate, vipCreditUsed, vipCreditPlansUsed, vipCreditTotal, blocks } = data
  const isBuyer = planType === 'buyer'
  const topListings = (listings || []).slice(0, 10)

  const stl = analytics?.sale_to_list_ratio ? Number(analytics.sale_to_list_ratio) : null
  const dom = analytics?.closed_avg_dom_90 ? Number(analytics.closed_avg_dom_90) : null
  const conditionLabel = !stl || !dom ? 'Insufficient Data'
    : stl >= 99 && dom <= 20 ? "Strong Seller's Market"
    : stl >= 97 && dom <= 40 ? "Seller's Market"
    : stl < 95 || dom > 70 ? "Buyer's Market"
    : 'Balanced Market'
  const conditionColor = !stl || !dom ? '#94a3b8'
    : stl >= 97 ? '#10b981'
    : stl < 95 || (dom && dom > 70) ? '#ef4444'
    : '#f59e0b'

  const blocksHtml = (blocks || []).length > 0 ? (() => {
    const parts: string[] = []
    for (const block of (blocks || [])) {
      if (block.type === 'analytics') {
        parts.push(`<div style="margin:16px 0;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Market Intelligence &middot; ${block.geoName}</div>
          <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size:13px;">
            <tr><td style="color:#64748b;width:160px;">Avg DOM</td><td style="font-weight:700;color:#0f172a;">${block.data?.closed_avg_dom_90 ? block.data.closed_avg_dom_90 + 'd' : '&mdash;'}</td></tr>
            <tr><td style="color:#64748b;">Sale/List</td><td style="font-weight:700;color:#0f172a;">${block.data?.sale_to_list_ratio ? block.data.sale_to_list_ratio + '%' : '&mdash;'}</td></tr>
            <tr><td style="color:#64748b;">Active</td><td style="font-weight:700;color:#0f172a;">${block.data?.active_count || '&mdash;'}</td></tr>
          </table>
        </div>`)
      }
      if (block.type === 'buildings') {
        parts.push(`<div style="margin:16px 0;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Buildings Found &middot; ${block.label} &middot; ${block.buildings.length}</div>
          ${(block.buildings || []).slice(0, 8).map((b: any) => `
            <a href="${b.url || BASE_URL}" style="display:block;text-decoration:none;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:6px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                ${b.photo ? `<td width="48"><img src="${b.photo}" width="48" height="48" style="border-radius:6px;object-fit:cover;"></td>` : ''}
                <td style="padding-left:10px;vertical-align:middle;">
                  <div style="font-size:13px;font-weight:700;color:#0f172a;">${b.buildingName}</div>
                  <div style="font-size:12px;color:#64748b;">${b.medianPrice ? '$' + Number(b.medianPrice).toLocaleString('en-CA') : ''}${b.medianPsf ? ' &middot; $' + b.medianPsf + '/sqft' : ''}</div>
                </td>
                <td style="text-align:right;vertical-align:middle;">
                  ${b.activeCount > 0 ? `<span style="background:#10b981;color:#fff;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:700;">${b.activeCount} active</span>` : ''}
                </td>
              </tr></table>
            </a>
          `).join('')}
        </div>`)
      }
      if (block.type === 'rankings' && block.data?.rankings?.length > 0) {
        const title = (block.data.ranking_type || block.rankType || '').split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        parts.push(`<div style="margin:16px 0;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">${title}</div>
          ${(block.data.rankings || []).slice(0, 5).map((r: any) => `
            <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;">
              <a href="${r.url || BASE_URL}" style="font-size:13px;font-weight:600;color:#1d4ed8;text-decoration:none;">#${r.rank} ${r.entity_name}</a>
              <span style="font-size:12px;color:#64748b;">${r.median_price ? '$' + Number(r.median_price).toLocaleString('en-CA') : ''}${r.gross_yield ? ' &middot; ' + r.gross_yield.toFixed(1) + '% yield' : ''}</span>
            </div>
          `).join('')}
        </div>`)
      }
      if (block.type === 'priceTrends' && block.data?.current_median_sale) {
        parts.push(`<div style="margin:16px 0;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Price Trends</div>
          <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size:13px;">
            <tr><td style="color:#64748b;width:160px;">Median Price</td><td style="font-weight:700;color:#1d4ed8;">$${Number(block.data.current_median_sale).toLocaleString('en-CA')}</td></tr>
            ${block.data.current_avg_psf ? `<tr><td style="color:#64748b;">Avg PSF</td><td style="font-weight:700;color:#0f172a;">$${Number(block.data.current_avg_psf).toLocaleString('en-CA')}/sqft</td></tr>` : ''}
            ${block.data.psf_trend_pct != null ? `<tr><td style="color:#64748b;">PSF Trend</td><td style="font-weight:700;color:${block.data.psf_trend_pct >= 0 ? '#10b981' : '#ef4444'};">${block.data.psf_trend_pct > 0 ? '+' : ''}${block.data.psf_trend_pct.toFixed(1)}%</td></tr>` : ''}
          </table>
        </div>`)
      }
    }
    return parts.length > 0 ? `<div style="margin:20px 0;"><div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">Your Research</div>${parts.join('')}</div>` : ''
  })() : ''

  const conditionHtml = `
    <div style="margin: 0 0 16px;">
      <span style="display: inline-flex; align-items: center; gap: 8px; background: ${conditionColor}18; border: 1px solid ${conditionColor}40; border-radius: 100px; padding: 5px 14px;">
        <span style="width: 7px; height: 7px; border-radius: 50%; background: ${conditionColor}; display: inline-block;"></span>
        <span style="font-size: 12px; font-weight: 700; color: ${conditionColor};">${conditionLabel}</span>
      </span>
    </div>
  `

  const marketHtml = analytics ? `
    <div style="margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">Market Intelligence &middot; ${geoName || ''}</div>
      <table width="100%" cellpadding="0" cellspacing="8" border="0" style="margin-bottom: 8px;">
        <tr>
          ${[
            { label: 'Avg Days on Market', value: analytics.closed_avg_dom_90 ? `${analytics.closed_avg_dom_90}d` : '&mdash;' },
            { label: 'Sale / List Ratio', value: analytics.sale_to_list_ratio ? `${analytics.sale_to_list_ratio}%` : '&mdash;' },
            { label: 'Active Listings', value: analytics.active_count ? `${Number(analytics.active_count).toLocaleString()}` : '&mdash;' },
          ].map(m => `
            <td width="33%" style="padding: 0 4px;">
              <div style="background: #f1f5f9; border-radius: 10px; padding: 12px; text-align: center;">
                <div style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">${m.label}</div>
                <div style="font-size: 18px; font-weight: 800; color: #0f172a;">${m.value}</div>
              </div>
            </td>
          `).join('')}
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="8" border="0">
        <tr>
          ${[
            { label: 'Sold (90d)', value: analytics.closed_sale_count_90 ? `${Number(analytics.closed_sale_count_90).toLocaleString()}` : '&mdash;' },
            { label: 'Absorption Rate', value: analytics.absorption_rate_pct ? `${analytics.absorption_rate_pct}%` : '&mdash;' },
            { label: 'Median PSF', value: analytics.median_psf ? `$${Number(analytics.median_psf).toLocaleString('en-CA', { maximumFractionDigits: 0 })}` : '&mdash;' },
          ].map(m => `
            <td width="33%" style="padding: 0 4px;">
              <div style="background: #f1f5f9; border-radius: 10px; padding: 12px; text-align: center;">
                <div style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">${m.label}</div>
                <div style="font-size: 18px; font-weight: 800; color: #0f172a;">${m.value}</div>
              </div>
            </td>
          `).join('')}
        </tr>
      </table>
    </div>
    ${analytics.subtype_breakdown && Object.keys(analytics.subtype_breakdown).length > 0 ? `
    <div style="margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Price by Home Type</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
        <tr style="background: #f8fafc;">
          <td style="padding: 8px 10px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Type</td>
          <td style="padding: 8px 10px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; text-align: center;">DOM</td>
          <td style="padding: 8px 10px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; text-align: center;">STL</td>
          <td style="padding: 8px 10px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; text-align: right;">Median</td>
        </tr>
        ${Object.entries(analytics.subtype_breakdown).map(([subtype, d]: [string, any]) => `
        <tr style="border-top: 1px solid #f1f5f9;">
          <td style="padding: 9px 10px; font-size: 13px; font-weight: 600; color: #0f172a;">${subtype}</td>
          <td style="padding: 9px 10px; font-size: 12px; color: #64748b; text-align: center;">${d.avg_dom ? `${Math.round(d.avg_dom)}d` : '&mdash;'}</td>
          <td style="padding: 9px 10px; font-size: 12px; color: #64748b; text-align: center;">${d.sale_to_list ? `${d.sale_to_list}%` : '&mdash;'}</td>
          <td style="padding: 9px 10px; font-size: 14px; font-weight: 800; color: #1d4ed8; text-align: right;">${d.median_price ? `$${Number(d.median_price).toLocaleString('en-CA')}` : '&mdash;'}</td>
        </tr>
        `).join('')}
      </table>
    </div>
    ` : ''}
  ` : ''

  const offerIntelHtml = analytics ? `
    <div style="margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Offer Intelligence</div>
      <table width="100%" cellpadding="0" cellspacing="4" border="0"><tr>
        <td width="33%" style="padding: 0 4px;"><div style="background: #f1f5f9; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Offer At</div>
          <div style="font-size: 18px; font-weight: 800; color: #1d4ed8;">${analytics.sale_to_list_ratio ? Number(analytics.sale_to_list_ratio).toFixed(1) + '%' : '&mdash;'}</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">of asking</div>
        </div></td>
        <td width="33%" style="padding: 0 4px;"><div style="background: #f1f5f9; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Avg Concession</div>
          <div style="font-size: 18px; font-weight: 800; color: #10b981;">${analytics.avg_concession_pct ? Number(analytics.avg_concession_pct).toFixed(1) + '%' : '&mdash;'}</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">below asking</div>
        </div></td>
        <td width="33%" style="padding: 0 4px;"><div style="background: #f1f5f9; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Decide In</div>
          <div style="font-size: 18px; font-weight: 800; color: #f59e0b;">${analytics.closed_avg_dom_90 ? Number(analytics.closed_avg_dom_90).toFixed(0) + 'd' : '&mdash;'}</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">avg DOM</div>
        </div></td>
      </tr></table>
    </div>
  ` : ''

  const seasonal = analytics?.insight_seasonal
  const bestMonths = (seasonal?.best_months || []) as number[]
  const worstMonths = (seasonal?.worst_months || []) as number[]
  const currentMonth = seasonal?.current_month as number | undefined
  const bestTimeHtml = seasonal ? `
    <div style="margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Best Time to Buy</div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px;">
        <div style="font-size: 13px; color: #1e293b; line-height: 1.7;">
          Best months: <strong style="color: #10b981;">${bestMonths.map((m: number) => MONTHS_ARR[m-1]).join(', ')}</strong> &nbsp;&middot;&nbsp;
          Avoid: <strong style="color: #ef4444;">${worstMonths.map((m: number) => MONTHS_ARR[m-1]).join(', ')}</strong>
          ${currentMonth ? `<br>Currently <strong>${MONTHS_ARR[currentMonth-1]}</strong> &mdash; ranked #${seasonal.current_month_rank} of 12 for buyer power.` : ''}
        </div>
      </div>
    </div>
  ` : ''

  const summaryHtml = plan?.summary ? `
    <div style="background: linear-gradient(135deg, #eff6ff, #f0fdf4); border: 1px solid #bfdbfe; border-radius: 10px; padding: 18px; margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">&#10022; Your ${isBuyer ? 'Buyer' : 'Seller'} Strategy</div>
      <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #1e293b;">${plan.summary}</p>
    </div>
  ` : ''

  const profileHtml = isBuyer ? `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Buyer Profile</div>
      <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size: 13px;">
        ${plan?.budgetMax ? `<tr><td style="color: #64748b; width: 130px;">Budget</td><td style="font-weight: 700; color: #0f172a;">$${Number(plan.budgetMin || 0).toLocaleString('en-CA')} &mdash; $${Number(plan.budgetMax).toLocaleString('en-CA')}</td></tr>` : ''}
        ${plan?.propertyType ? `<tr><td style="color: #64748b;">Property Type</td><td style="font-weight: 600; color: #0f172a;">${plan.propertyType}</td></tr>` : ''}
        ${plan?.bedrooms ? `<tr><td style="color: #64748b;">Bedrooms</td><td style="font-weight: 600; color: #0f172a;">${plan.bedrooms}+</td></tr>` : ''}
        ${plan?.timeline ? `<tr><td style="color: #64748b;">Timeline</td><td style="font-weight: 600; color: #0f172a;">${plan.timeline}</td></tr>` : ''}
      </table>
    </div>
  ` : `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Seller Profile</div>
      <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size: 13px;">
        ${plan?.propertyType ? `<tr><td style="color: #64748b; width: 130px;">Property Type</td><td style="font-weight: 600; color: #0f172a;">${plan.propertyType}</td></tr>` : ''}
        ${plan?.estimatedValueMin ? `<tr><td style="color: #64748b;">Est. Value</td><td style="font-weight: 700; color: #059669;">$${Number(plan.estimatedValueMin).toLocaleString('en-CA')} &mdash; $${Number(plan.estimatedValueMax).toLocaleString('en-CA')}</td></tr>` : ''}
        ${plan?.timeline ? `<tr><td style="color: #64748b;">Timeline</td><td style="font-weight: 600; color: #0f172a;">${plan.timeline}</td></tr>` : ''}
        ${plan?.goal ? `<tr><td style="color: #64748b;">Goal</td><td style="font-weight: 600; color: #0f172a;">${plan.goal}</td></tr>` : ''}
      </table>
    </div>
  `

  const planCardHtml = `
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; margin: 20px 0;">
      <div style="margin-bottom: 12px;">
        <div style="font-size: 16px; font-weight: 800; color: #fff;">${isBuyer ? '&#127968; Your Buyer Plan' : '&#128176; Your Seller Strategy'}</div>
        <div style="font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px;">${geoName || 'GTA'} &middot; ${new Date().toLocaleDateString('en-CA')}</div>
      </div>
      <div style="margin-bottom: 14px;">
        <span style="display: inline-flex; align-items: center; gap: 6px; background: ${conditionColor}18; border: 1px solid ${conditionColor}40; border-radius: 100px; padding: 4px 12px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: ${conditionColor}; display: inline-block;"></span>
          <span style="font-size: 11px; font-weight: 700; color: ${conditionColor};">${conditionLabel}</span>
        </span>
      </div>
      <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.2em; color: rgba(255,255,255,0.3); text-transform: uppercase; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.06);">Your Profile</div>
      ${isBuyer && plan?.budgetMax ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="font-size:12px;color:rgba(255,255,255,0.45);">Budget</span><span style="font-size:13px;font-weight:700;color:#3b82f6;">$${Number(plan.budgetMin||0).toLocaleString('en-CA')} &mdash; $${Number(plan.budgetMax).toLocaleString('en-CA')}</span></div>` : ''}
      ${plan?.propertyType ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="font-size:12px;color:rgba(255,255,255,0.45);">Property Type</span><span style="font-size:13px;font-weight:700;color:#fff;">${plan.propertyType}</span></div>` : ''}
      ${plan?.timeline ? `<div style="display:flex;justify-content:space-between;padding:5px 0;"><span style="font-size:12px;color:rgba(255,255,255,0.45);">Timeline</span><span style="font-size:13px;font-weight:700;color:#fff;">${plan.timeline}</span></div>` : ''}
      <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.2em; color: rgba(255,255,255,0.3); text-transform: uppercase; margin: 12px 0 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.06);">Market Snapshot</div>
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="font-size:12px;color:rgba(255,255,255,0.45);">Avg Days on Market</span><span style="font-size:13px;font-weight:700;color:#6366f1;">${analytics?.closed_avg_dom_90 ? analytics.closed_avg_dom_90 + 'd' : '&mdash;'}</span></div>
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="font-size:12px;color:rgba(255,255,255,0.45);">Sale-to-List Ratio</span><span style="font-size:13px;font-weight:700;color:#10b981;">${analytics?.sale_to_list_ratio ? analytics.sale_to_list_ratio + '%' : '&mdash;'}</span></div>
      <div style="display:flex;justify-content:space-between;padding:5px 0;"><span style="font-size:12px;color:rgba(255,255,255,0.45);">Active Listings</span><span style="font-size:13px;font-weight:700;color:#fff;">${analytics?.active_count || '&mdash;'}</span></div>
      ${topListings.length > 0 ? `
      <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.2em; color: rgba(255,255,255,0.3); text-transform: uppercase; margin: 12px 0 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.06);">Top Matches (${topListings.length})</div>
      ${topListings.map((l) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);"><div><div style="font-size:12px;font-weight:700;color:#fff;">$${Number(l.list_price||0).toLocaleString('en-CA')}</div><div style="font-size:11px;color:rgba(255,255,255,0.35);">${(l.unparsed_address||'').split(',')[0]}</div></div><div style="font-size:11px;color:rgba(255,255,255,0.3);">${l.bedrooms_total||''} bed &middot; ${l.bathrooms_total_integer||''} bath</div></div>`).join('')}
      ` : ''}
    </div>
  `

  const listingsHtml = topListings.length > 0 ? `
    <div style="margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">
        ${isBuyer ? 'Matched Listings' : 'Comparable Sales'} (${topListings.length})
      </div>
      ${topListings.map((l: any) => {
        const url = `${BASE_URL}${l._slug || '/' + (l.listing_key || '')}`
        const price = l.list_price || l.close_price || 0
        const address = l.unparsed_address || '&mdash;'
        const beds = l.bedrooms_total
        const baths = l.bathrooms_total_integer
        const subtype = l.property_subtype || ''
        const photo = (l.media && l.media[0]?.media_url) || ''
        return `
          <a href="${url}" style="display: block; text-decoration: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${photo ? `<td width="80" style="vertical-align: top;"><img src="${photo}" alt="" width="80" height="72" style="display: block; width: 80px; height: 72px;"></td>` : ''}
                <td style="padding: 10px 14px; vertical-align: middle;">
                  <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${address}</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 3px;">
                    ${[beds ? `${beds} bed` : '', baths ? `${baths} bath` : '', subtype].filter(Boolean).join(' &middot; ')}
                  </div>
                </td>
                <td style="padding: 10px 14px; text-align: right; white-space: nowrap; vertical-align: middle;">
                  <div style="font-size: 16px; font-weight: 800; color: #1d4ed8;">$${Number(price).toLocaleString('en-CA')}</div>
                  <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">View &rarr;</div>
                </td>
              </tr>
            </table>
          </a>
        `
      }).join('')}
    </div>
  ` : ''

  const sellerComps = sellerEstimate?.comparables || comparables || []
  const comparableSoldHtml = sellerComps.length > 0 ? `
    <div style="margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">Comparable Sold (${sellerComps.length})</div>
      ${sellerComps.map((c: any) => {
        const price = c.closePrice || c.close_price || c.listPrice || c.list_price || 0
        const photo = c.mediaUrl || (c.media && c.media[0]?.media_url) || ''
        const slug = c._slug || (c.listingKey ? '/' + c.listingKey.toLowerCase() : '')
        return `
          <a href="${BASE_URL}${slug}" style="display: block; text-decoration: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              ${photo ? `<td width="80" style="vertical-align: top;"><img src="${photo}" width="80" height="72" style="display:block;width:80px;height:72px;"><div style="background:${c.temperature === 'HOT' ? '#ef4444' : c.temperature === 'WARM' ? '#f59e0b' : '#3b82f6'};color:#fff;font-size:9px;font-weight:700;padding:2px 5px;margin-top:2px;text-align:center;">${c.temperature || 'SOLD'}</div></td>` : ''}
              <td style="padding: 10px 14px; vertical-align: middle;">
                <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${(c.unparsedAddress || c.unparsed_address || '').split(',')[0]}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 3px;">${[c.bedrooms_total ? c.bedrooms_total + ' bed' : '', c.bathrooms_total_integer ? c.bathrooms_total_integer + ' bath' : '', c.sqft ? c.sqft + ' sqft' : '', c.daysOnMarket ? c.daysOnMarket + 'd DOM' : ''].filter(Boolean).join(' &middot; ')}</div>
                ${c.matchQuality ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">${c.matchQuality}</div>` : ''}
              </td>
              <td style="padding: 10px 14px; text-align: right; vertical-align: middle;">
                <div style="font-size: 16px; font-weight: 800; color: #059669;">$${Number(price).toLocaleString('en-CA')}</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Sold &rarr;</div>
              </td>
            </tr></table>
          </a>
        `
      }).join('')}
    </div>
  ` : ''

  const competingHtml = sellerEstimate?.competingListings && sellerEstimate.competingListings.length > 0 ? `
    <div style="margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">Competing For Sale (${sellerEstimate.competingListings.length})</div>
      ${sellerEstimate.competingListings.slice(0, 10).map((c: any) => {
        const price = c.list_price || 0
        const addr = (c.unparsed_address || '').split(',')[0]
        const photo = c.mediaUrl || (c.media && c.media[0]?.media_url) || ''
        const slug = c._slug || (c.listing_key ? '/' + c.listing_key : '')
        return `
          <a href="${BASE_URL}${slug}" style="display: block; text-decoration: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              ${photo ? `<td width="80" style="vertical-align: top;"><img src="${photo}" width="80" height="72" style="display:block;width:80px;height:72px;"></td>` : ''}
              <td style="padding: 10px 14px; vertical-align: middle;">
                <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${addr}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 3px;">${[c.bedrooms_total ? c.bedrooms_total + ' bed' : '', c.bathrooms_total_integer ? c.bathrooms_total_integer + ' bath' : ''].filter(Boolean).join(' &middot; ')}</div>
              </td>
              <td style="padding: 10px 14px; text-align: right; vertical-align: middle;">
                <div style="font-size: 16px; font-weight: 800; color: #1d4ed8;">$${Number(price).toLocaleString('en-CA')}</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">For Sale &rarr;</div>
              </td>
            </tr></table>
          </a>
        `
      }).join('')}
    </div>
  ` : ''

  const vipHtml = vipCreditUsed ? `
    <div style="background: linear-gradient(135deg, #1e1b4b, #312e81); border: 1px solid rgba(99,102,241,0.3); border-radius: 10px; padding: 14px 18px; margin: 16px 0; display: flex; align-items: center; justify-content: space-between;">
      <div>
        <div style="font-size: 12px; font-weight: 700; color: #a5b4fc;">&#10022; VIP Access Credit Used</div>
        <div style="font-size: 11px; color: rgba(165,180,252,0.6); margin-top: 3px;">${vipCreditPlansUsed} of ${vipCreditTotal} plans used</div>
      </div>
      <div style="font-size: 11px; color: rgba(165,180,252,0.5);">Request more from your agent</div>
    </div>
  ` : ''

  const disclaimerHtml = `
    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px; margin: 16px 0;">
      <p style="margin: 0; font-size: 11px; color: #92400e; line-height: 1.6;">
        <strong style="color: #d97706;">&#9888; AI Disclaimer:</strong> This plan is generated by artificial intelligence using market data and algorithms. It is intended for informational purposes only and does not constitute professional real estate, legal, or financial advice. All information should be independently verified with a licensed real estate agent before making any decisions.
      </p>
    </div>
  `

  const agentHtml = agent ? `
    <div style="background: #0f172a; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
      <div style="font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px;">Your Agent</div>
      ${agent.profile_photo_url ? `<img src="${agent.profile_photo_url}" alt="${agent.full_name}" style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.15); margin-bottom: 8px;">` : ''}
      <div style="font-size: 15px; font-weight: 700; color: #fff;">${agent.full_name}</div>
      ${agent.title ? `<div style="font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 2px;">${agent.title}</div>` : ''}
      ${agent.brokerage_name ? `<div style="font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 2px;">${agent.brokerage_name}</div>` : ''}
      <div style="margin-top: 12px;">
        ${agent.email ? `<a href="mailto:${agent.email}" style="display: inline-block; margin: 4px; padding: 7px 16px; background: rgba(255,255,255,0.08); border-radius: 8px; color: #93c5fd; font-size: 12px; text-decoration: none;">${agent.email}</a>` : ''}
        ${agent.cell_phone ? `<a href="tel:${agent.cell_phone}" style="display: inline-block; margin: 4px; padding: 7px 16px; background: rgba(255,255,255,0.08); border-radius: 8px; color: #93c5fd; font-size: 12px; text-decoration: none;">${agent.cell_phone}</a>` : ''}
      </div>
    </div>
  ` : ''

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 28px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 26px; font-weight: 900; color: #fff; margin-bottom: 16px;">
          <span style="font-weight: 900;">WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.5);">iam</span>
        </div>
        <h1 style="color: #fff; font-size: 22px; font-weight: 800; margin: 0 0 8px;">
          ${isBuyer ? '&#127968; Buyer Plan' : '&#128176; Seller Strategy'} &mdash; ${geoName || 'GTA'}
        </h1>
        <p style="color: rgba(255,255,255,0.5); margin: 0; font-size: 14px;">
          Prepared for ${userName} &middot; ${new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>
      <div style="padding: 24px 28px; border: 1px solid #e2e8f0; border-top: none;">
        ${conditionHtml}
        ${marketHtml}
        ${offerIntelHtml}
        ${bestTimeHtml}
        ${summaryHtml}
        ${blocksHtml}
        ${planCardHtml}
        ${profileHtml}
        ${listingsHtml}
        ${comparableSoldHtml}
        ${competingHtml}
        ${vipHtml}
        ${disclaimerHtml}
        ${agentHtml}
        <div style="text-align: center; margin: 24px 0 8px;">
          <a href="${BASE_URL}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px;">
            &#10022; Open WALLiam
          </a>
        </div>
      </div>
      <div style="padding: 16px 28px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 11px;">WALLiam &middot; walliam.ca</p>
      </div>
    </div>
  `
}