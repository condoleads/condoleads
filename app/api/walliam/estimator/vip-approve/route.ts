// app/api/walliam/estimator/vip-approve/route.ts
// W-LEADS-WORKBENCH W5c-4c (2026-05-15) -- migrated to shared helper.
// Original: Token-based approve/deny for WALLiam estimator VIP requests.
// Adapted from app/api/chat/vip-approve/route.ts -- System 1 never touched.
//
// W-HIERARCHY H3.8b (2026-05-03): inline ADMIN_EMAIL literal removed.
// BCC now resolved via getLeadEmailRecipients helper (Admin Platform layer 6,
// extensible to delegations via W-ROLES-DELEGATION). F54 retired.
//
// =========================================================================
// CONTRACT (post-W5c-4c migration)
// =========================================================================
//   - Token in URL (?token=...&action=approve|deny) auths the request.
//   - vipRequest fetched WHERE approval_token = $1 with chat_sessions + agents
//     joins (helper requires this shape).
//   - Brand context resolved via direct tenants SELECT (legacy pattern; NOT
//     getTenantContext, to preserve byte-equivalent legacy behavior).
//   - Idempotency + expiry checked in route; helper trusts caller's check.
//   - Side effects (status flip + chat_sessions upgrade + estimator_limit
//     UPSERT + email send with BCC chain) delegated to approveVipRequest.
//   - estimatorBccFailurePolicy='fail-closed' (matches legacy L141-145):
//     when AdminPlatformUnreachable fires in helper's BCC fetch, the approve
//     side effects ARE persisted (vip_requests + chat_sessions + credits)
//     but the email is suppressed; helper returns ok:false; route renders
//     HTML error with legacy wording.
//   - HTML response builder createHtmlResponse PRESERVED VERBATIM (same icons,
//     same titles, same template, same brand-name pattern).
//
// =========================================================================
// PRESERVED VERBATIM
// =========================================================================
//   - GET handler signature + token/action URL params
//   - createServiceClient inline (NOT switched to @/lib/admin-homes/service-client)
//   - vip_requests fetch (single-gate by approval_token; no triple gate)
//   - agents join shape (full_name, email, notification_email, parent_id,
//     ai_manual_approve_limit) -- helper consumes this exact shape
//   - Direct brand SELECT (brand_name || name fallback; not getTenantContext)
//   - Idempotency: status !== 'pending' -> HTML 'already_processed'
//   - Expiry: mark 'expired' + HTML 'expired'
//   - All HTML response statuses with verbatim messages
//   - fail-closed response wording: "System notification failed. Approval
//     recorded; please contact support."
//   - approve/deny HTML message format: "Estimator access granted to <user>"
//     and "Estimator VIP request from <user> has been denied"
//   - createHtmlResponse function (full HTML template + 5 status configs)
//
// =========================================================================
// W5c-4c MINOR SOURCE-TEXT DELTAS (runtime behavior unchanged)
// =========================================================================
//   - F-W5C-4C-UNICODE-AS-ESCAPES: Unicode characters (icons + em-dash) are
//     written as `\uXXXX` escapes rather than raw UTF-8 characters. Source
//     text differs from legacy; runtime strings byte-identical. Bulletproofs
//     against clipboard/encoding issues during paste.
//   - F-W5C-4C-EMPTY-TENANT-GUARD-ADDED: a defensive early-return added
//     when vipRequest.chat_sessions?.tenant_id is null. Pre-migration code
//     used `tenantId || ''` and would have silently failed in downstream
//     SELECT calls. New behavior: explicit error HTML with support message.
//     Practically unreachable (vip_requests always have a chat_sessions
//     link in practice) but defensively prevents downstream errors.
//
// =========================================================================
// HELPER PARAMS (per-route values)
// =========================================================================
//   - userId: vipRequest.chat_sessions?.user_id  (legacy session-bound source)
//   - creditGrantNotePrefix: 'Email approval \u2014'  (em-dash, legacy wording)
//   - estimatorBccFailurePolicy: 'fail-closed'  (preserves legacy abort posture)
//   - audit: undefined  (legacy estimator does not write lead_admin_actions;
//                        F-VIP-APPROVE-EMAILS-NOT-AUDITED preserved)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildBaseUrl } from '@/lib/utils/tenant-brand'
import {
  approveVipRequest,
  type VipRequestWithJoins,
} from '@/lib/admin-homes/approve-vip-request'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const action = searchParams.get('action')

    if (!token || !action) {
      return createHtmlResponse('error', 'Invalid request. Missing token or action.')
    }
    if (!['approve', 'deny'].includes(action)) {
      return createHtmlResponse('error', 'Invalid action.')
    }

    const supabase = createServiceClient()

    const { data: vipRequest, error: findError } = await supabase
      .from('vip_requests')
      .select(`
        *,
        chat_sessions (*),
        agents (
          full_name, email, notification_email, parent_id,
          ai_manual_approve_limit
        )
      `)
      .eq('approval_token', token)
      .single()

    if (findError || !vipRequest) {
      return createHtmlResponse('error', 'Request not found or link has expired.')
    }

    // T6f-B-3 -- multitenant brand-string + URL load (direct SELECT, preserves
    // legacy pattern; not switched to getTenantContext).
    const tenantId = vipRequest.chat_sessions?.tenant_id ?? null
    let brandName: string = ''
    let baseUrl: string = ''
    let domain: string = ''
    if (tenantId) {
      const { data: brandTenant } = await supabase
        .from('tenants')
        .select('brand_name, name, domain')
        .eq('id', tenantId)
        .single()
      brandName = (brandTenant?.brand_name || brandTenant?.name) ?? ''
      domain = brandTenant?.domain ?? ''
      baseUrl = buildBaseUrl(domain)
    }

    if (vipRequest.status !== 'pending') {
      return createHtmlResponse(
        'already_processed',
        `This request was already ${vipRequest.status}.`,
        brandName,
      )
    }

    if (new Date(vipRequest.expires_at) < new Date()) {
      await supabase
        .from('vip_requests')
        .update({ status: 'expired' })
        .eq('id', vipRequest.id)
      return createHtmlResponse('expired', 'This request has expired.', brandName)
    }

    // F-W5C-4C-EMPTY-TENANT-GUARD-ADDED: helper requires non-empty tenantId.
    // Practically unreachable (vip_requests always have a chat_sessions link
    // in practice) but legacy used `tenantId || ''` which would have failed
    // silently downstream. Explicit error is safer.
    if (!tenantId) {
      console.error(
        '[walliam/estimator/vip-approve] vipRequest has no chat_sessions.tenant_id',
      )
      return createHtmlResponse(
        'error',
        'System error: request is missing tenant context. Please contact support.',
        brandName,
      )
    }

    // action is narrowed to 'approve' | 'deny' by the early-return guard above.
    const typedAction = action as 'approve' | 'deny'

    const result = await approveVipRequest({
      supabase,
      tenantId,
      vipRequest: vipRequest as unknown as VipRequestWithJoins,
      action: typedAction,
      brand: { brandName, baseUrl, domain },
      userId: vipRequest.chat_sessions?.user_id ?? null,
      creditGrantNotePrefix: 'Email approval \u2014',
      estimatorBccFailurePolicy: 'fail-closed',
      // audit OMITTED: legacy estimator does not write lead_admin_actions.
      // F-VIP-APPROVE-EMAILS-NOT-AUDITED preserved across this migration.
    })

    if (!result.ok) {
      // fail-closed fired in helper's BCC fetch.
      // Approve side effects WERE persisted (vip_requests + chat_sessions +
      // credits) but the confirmation email was suppressed.
      // Wording preserved verbatim from legacy L144.
      return createHtmlResponse(
        'error',
        'System notification failed. Approval recorded; please contact support.',
        brandName,
      )
    }

    if (typedAction === 'approve') {
      return createHtmlResponse(
        'approved',
        `Estimator access granted to ${vipRequest.full_name || vipRequest.phone}. They now have ${result.messagesGranted} additional estimate${result.messagesGranted > 1 ? 's' : ''}.`,
        brandName,
      )
    } else {
      return createHtmlResponse(
        'denied',
        `Estimator VIP request from ${vipRequest.full_name || vipRequest.phone} has been denied.`,
        brandName,
      )
    }
  } catch (error) {
    console.error('[walliam/estimator/vip-approve] error:', error)
    return createHtmlResponse('error', 'An unexpected error occurred.')
  }
}

// =========================================================================
// createHtmlResponse PRESERVED VERBATIM from legacy lines 220-261.
// HTML format + icons + title format all unchanged to avoid email-link UX delta.
// Icons written as Unicode escapes per F-W5C-4C-UNICODE-AS-ESCAPES:
//   \u2705 = approved checkmark
//   \u274c = denied/error cross
//   \u23f0 = expired alarm clock
//   \u2139\ufe0f = already_processed info
//   \u2014 = em-dash (title separator)
// =========================================================================

function createHtmlResponse(
  status: string,
  message: string,
  brandName: string = '',
): NextResponse {
  const configs: Record<string, { bg: string; icon: string; title: string }> = {
    approved:          { bg: '#10b981', icon: '\u2705', title: 'Approved' },
    denied:            { bg: '#ef4444', icon: '\u274c', title: 'Denied' },
    error:             { bg: '#ef4444', icon: '\u274c', title: 'Error' },
    expired:           { bg: '#f59e0b', icon: '\u23f0', title: 'Expired' },
    already_processed: { bg: '#64748b', icon: '\u2139\ufe0f', title: 'Already Processed' },
  }
  const cfg = configs[status] || configs.error

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${brandName} Estimator \u2014 ${cfg.title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #1e293b; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; max-width: 400px; width: 100%; overflow: hidden; }
    .header { background: ${cfg.bg}; padding: 32px; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 12px; }
    .title { color: white; font-size: 22px; font-weight: 700; }
    .content { padding: 24px; text-align: center; }
    .message { color: rgba(255,255,255,0.7); font-size: 15px; line-height: 1.6; }
    .footer { padding: 0 24px 24px; text-align: center; }
    .btn { display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon">${cfg.icon}</div>
      <div class="title">${cfg.title}</div>
    </div>
    <div class="content"><p class="message">${message}</p></div>
    <div class="footer"><a href="/admin-homes/leads" class="btn">Go to Dashboard</a></div>
  </div>
</body>
</html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}