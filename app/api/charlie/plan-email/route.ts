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
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { walkHierarchy } from '@/lib/admin-homes/hierarchy'
import {
  getLeadEmailRecipients,
  AdminPlatformUnreachable,
} from '@/lib/admin-homes/lead-email-recipients'
import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'
// F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL (Phase 1): propagate email-delivery outcome.
import { attemptTenantEmail } from '@/lib/email/sendTenantEmail'
import { validateSession } from '@/lib/utils/validate-session'
import { buildBaseUrl } from '@/lib/utils/tenant-brand'
// C-CHARLIE-FOLLOWUP B(i) (2026-06-13): buildRichPlanEmail extracted into a
// shared lib module so the test-render probe endpoint can import the same
// builder without violating Next.js's rule that route files may only export
// HTTP handlers. Behavior identical — function body is verbatim.
import { buildRichPlanEmail } from '@/lib/email/charlie-plan-email-html'
// W-CHARLIE-BUYER-CHUNK2 (2026-06-15): server-side derivation of the
// buyer Tax-Matched band from the matched listings' own tax data. Pure
// function; safe in this route's serverless context. Output is persisted
// into plan_data.buyerTaxMatch + passed to buildRichPlanEmail so all
// three surfaces (in-chat, lead page, email) render the SAME shape.
import { deriveBuyerTaxMatch, type BuyerTaxMatch } from '@/lib/charlie/buyer-tax-match'

// T6f — BASE_URL relocated to handler scope (tenant-aware via buildBaseUrl(domain))


async function trackUserActivity(supabase: any, tenantId: string | null, contactEmail: string, agentId: string | null, activityType: string, activityData: any, pageUrl?: string) {
  try {
    const { error } = await supabase.from('user_activities').insert({
      tenant_id: tenantId,
      contact_email: contactEmail,
      agent_id: agentId || null,
      activity_type: activityType,
      activity_data: activityData || {},
      page_url: pageUrl || '',
    })
    if (error) {
      console.error('[trackUserActivity] insert error:', error)
    }
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
    const { sessionId, userId, planType, plan, analytics, listings, geoContext, comparables, sellerEstimate: rawSellerEstimate, vipCreditUsed, vipCreditPlansUsed, vipCreditTotal, blocks } = await req.json()

    if (!sessionId || !userId || !planType) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // W-CHARLIE-BUYER-CHUNK1 (2026-06-15): defense-in-depth gate. Buyer
    // plans must NEVER carry sellerEstimate — neither into plan_data nor
    // into the rendered email — regardless of what the client sent.
    // Client (useCharlie.ts:520) already gates by data.type, and
    // requestForm('buyer') wipes the state field, but a stale or
    // malicious client could still POST sellerEstimate with planType=
    // 'buyer'. Drop it here. Seller path is byte-identical to pre-fix
    // (planType === 'seller' returns rawSellerEstimate unchanged).
    // Real lead 6d479d84 confirmed the leak in the wild.
    const sellerEstimate = planType === 'seller' ? rawSellerEstimate : null

    // W-CHARLIE-BUYER-CHUNK2 (2026-06-15): derive the buyer Tax-Matched
    // band from matched listings' tax_annual_amount. Computed only for
    // buyer plans — seller path is unaffected. The derived value is
    // (a) persisted into plan_data.buyerTaxMatch so the admin lead page
    //     can read it without re-deriving, and
    // (b) passed to buildRichPlanEmail so the email renders the SAME
    //     shape from the SAME data the in-chat sees (convergence).
    // Honest sparsity is built into the derivation: <3 with-tax listings
    // returns isEmpty=true with a reason; renderers show empty-state.
    const buyerTaxMatch: BuyerTaxMatch | null = planType === 'buyer'
      ? deriveBuyerTaxMatch(listings)
      : null

    // C-CHARLIE-FOLLOWUP B(ii) (2026-06-13): stale-session detector. When a
    // seller plan arrives with sellerEstimate set but estimate.bestGeoTier
    // missing, the session almost certainly ran the S1 condo path (pre-
    // f0904e5) or pre-empted state via a stale browser tab. The email will
    // build without tier chips + tax-match — visible to the recipient as a
    // "feature missing" email. Surface it in logs so half-rendered sends
    // are detectable instead of silent. Pure observability; no behavior
    // change to the email build or send.
    if (sellerEstimate && sellerEstimate.estimate && !sellerEstimate.estimate.bestGeoTier) {
      console.warn('[plan-email] STALE-SESSION: sellerEstimate present but estimate.bestGeoTier missing — likely a pre-f0904e5 / stale-tab session. Email will render without tier chips. sessionId=' + sessionId + ' userId=' + userId)
    }

    // T6a — F-W-RECOVERY-A15: tenant-aware auth gate via validateSession helper
    const _gateSupabase = createServiceClient()
    const _sessionCheck = await validateSession({
      supabase: _gateSupabase,
      sessionId,
      userId,
      tenantId: req.headers.get('x-tenant-id') || '',
      selectColumns: 'id, tenant_id',
    })
    if (!_sessionCheck.ok) {
      return NextResponse.json({ error: _sessionCheck.error }, { status: _sessionCheck.status })
    }
    const validSession = _sessionCheck.session
    const sourceKey = _sessionCheck.sourceKey  // T6c — for source-field templating
    const brandName = _sessionCheck.brandName  // T6f — for brand-text templating
    const domain = _sessionCheck.domain        // T6f — for URL templating
    const BASE_URL = buildBaseUrl(domain)      // T6f — handler-local tenant-aware base URL
    // END T6a auth gate

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

    // W3c: capture source URL from referer for both leads.source_url + email render
    const pageUrl = headers().get('referer') || null

    // Save lead with full hierarchy chain stamped (per Lead+Email contract)
    const { data: lead, error: leadError } = await supabase.from('leads').insert({
      agent_id: agent?.id || null,
      user_id: userId,
      contact_name: userName,
      contact_email: userEmail,
      source: `${sourceKey}_charlie`,
      source_url: pageUrl,
      lead_origin_route: 'charlie',
      intent: planType,
      geo_name: geoName,
      budget_max: plan?.budgetMax || null,
      // C-ENHANCE-2-RENDER (2026-06-13): additive — persist a slim copy of
      // sellerEstimate alongside the existing fields so the dashboard's NEW
      // CharlieLeadEstimate can render the tier rail + tax-match for Charlie
      // seller-plan leads. Read-only payload (estimate.tiers/taxMatch/
      // bestGeoTier/comparables + competing + subject context). Absent for
      // buyer plans and any path without seller-estimate this session.
      plan_data: {
        planType, plan, analytics,
        topListings: (listings || []).slice(0, 5),
        sellerEstimate: sellerEstimate ? {
          estimate: sellerEstimate.estimate || null,
          comparables: sellerEstimate.comparables || [],
          competingListings: sellerEstimate.competingListings || [],
          buildingName: sellerEstimate.buildingName || null,
          subjectAddress: sellerEstimate.subjectAddress || null,
          geoLevel: sellerEstimate.geoLevel || null,
          intent: sellerEstimate.intent || 'sale',
          path: sellerEstimate.path || null,
        } : null,
        // W-CHARLIE-BUYER-CHUNK2 (2026-06-15): buyer-side comp-sold +
        // tax-match persistence. comparables holds Charlie's
        // get_comparables tool output (real recent SOLD listings in the
        // buyer's geo+band); buyerTaxMatch holds the derived tax-band.
        // Null on seller plans (seller uses sellerEstimate above).
        comparables: planType === 'buyer' ? (Array.isArray(comparables) ? comparables.slice(0, 6) : []) : null,
        buyerTaxMatch,
      },
      manager_id: chainManagerId,
      area_manager_id: chainAreaManagerId,
      tenant_admin_id: chainTenantAdminId,
      assignment_source: agent ? 'geo' : 'admin',
      status: 'new',
      tenant_id: tenantId,
    }).select('id').single()
    if (leadError) console.error('[plan-email] lead error:', leadError)

    // Track activity
    await trackUserActivity(supabase, tenantId, userEmail, agent?.id || null, 'plan_generated', {
      source: `${sourceKey}_charlie`,
      planType,
      geoName: geoName || null,
      budgetMax: plan?.budgetMax || null,
    })

    const html = buildRichPlanEmail({ userName, userEmail, planType, plan, analytics, listings: listings || [], agent, geoName, comparables: comparables || [], sellerEstimate: sellerEstimate || null, vipCreditUsed: vipCreditUsed || false, vipCreditPlansUsed: vipCreditPlansUsed || 0, vipCreditTotal: vipCreditTotal || 1, blocks: blocks || [], brandName, domain, baseUrl: BASE_URL, sourceUrl: pageUrl, buyerTaxMatch })
    const subject = `\u2756 ${brandName} ${planType === 'buyer' ? 'Buyer' : 'Seller'} Plan \u2014 ${geoName || 'GTA'} \u2014 ${userName}`

    // F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL (Phase 1): capture user-email outcome.
    const userOutcome = await attemptTenantEmail(
      { tenantId: tenantId || '', to: userEmail, subject, html },
      '[plan-email] user'
    )

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

    let chainOutcome: { sent: boolean; reason: 'delivered' | 'not_configured' | 'send_failed' | 'no_recipients' } =
      { sent: false, reason: 'no_recipients' }
    if (recipients) {
      const outcome = await attemptTenantEmail(
        {
          tenantId: tenantId || '',
          to: recipients.to,
          cc: recipients.cc.length > 0 ? recipients.cc : undefined,
          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
          subject,
          html,
        },
        '[plan-email] chain'
      )
      chainOutcome = { sent: outcome.sent, reason: outcome.reason }
      if (outcome.sent && outcome.messageId && lead?.id) {
        await logEmailRecipients({
          supabase,
          tenantId: tenantId || '',
          leadId: lead.id,
          agentId: agent?.id || null,
          recipients,
          subject,
          templateKey: 'charlie_plan_email_chain',
          resendMessageId: outcome.messageId,
        })
      }
    }

    // W-FUNNEL Phase 2 Commit B: persist chain-email delivery status for the
    // dashboard "not yet alerted" indicator. Runs AFTER chainOutcome resolves
    // (above) -- never writes 'sent' on a path that hasn't actually sent.
    if (lead?.id) {
      await supabase
        .from('leads')
        .update({ lead_email_delivery_status: chainOutcome.sent ? 'sent' : 'failed' })
        .eq('id', lead.id)
    }

    return NextResponse.json({
      success: true,
      userEmailSent: userOutcome.sent,
      userEmailReason: userOutcome.reason,
      chainEmailSent: chainOutcome.sent,
      chainEmailReason: chainOutcome.reason,
    })

  } catch (error) {
    console.error('[charlie/plan-email] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

