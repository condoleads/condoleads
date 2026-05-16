// app/api/walliam/charlie/vip-approve/route.ts
// W-LEADS-WORKBENCH W5c-4d (2026-05-16) -- migrated to shared helper.
// Original: Token-based approve/deny for WALLiam Charlie (chat + plan)
// VIP requests. Adapted from app/api/chat/vip-approve/route.ts --
// System 1 never touched.
//
// =========================================================================
// CONTRACT (post-W5c-4d migration)
// =========================================================================
//   - Token in URL (?token=...&action=approve|deny) auths the request.
//   - vipRequest fetched WHERE approval_token = $1 with chat_sessions +
//     agents joins (helper requires this shape).
//   - Brand context resolved via getTenantContext helper (legacy pattern;
//     differs from W5c-4c estimator route which uses direct tenants SELECT
//     -- both shapes accepted by helper since brand is passed as a value
//     object, not fetched inside the helper).
//   - Idempotency + expiry checked in route; helper trusts caller's check.
//   - Side effects (status flip + chat_sessions upgrade + user_credit_overrides
//     UPSERT for all 3 pools when request_type is 'plan' | 'chat' + email
//     send to user via sendTenantEmail try/catch best-effort) delegated to
//     approveVipRequest.
//   - estimatorBccFailurePolicy='fail-open' is passed for type-completeness
//     but IRRELEVANT here: Charlie's request_type is 'plan' or 'chat'
//     (never 'estimator'), so the helper does NOT fetch a BCC chain and
//     the policy is not consulted (helper docstring L155 confirms).
//   - HTML response builder createHtmlResponse PRESERVED VERBATIM (HTML
//     entity icons, conditional brand-prefix title format, dashboard link).
//
// =========================================================================
// PRESERVED VERBATIM
// =========================================================================
//   - GET handler signature + token/action URL params
//   - createServiceClient inline (NOT switched to admin-homes/service-client)
//   - vip_requests fetch (single-gate by approval_token; no triple gate)
//   - agents join shape (full_name, email, notification_email,
//     ai_manual_approve_limit) -- helper consumes this exact shape
//   - getTenantContext brand load (NOT switched to direct tenants SELECT)
//   - Idempotency: status !== 'pending' -> HTML 'already_processed'
//   - Expiry: mark 'expired' + HTML 'expired'
//   - All HTML response statuses with verbatim messages
//   - Approve message: "Plan access granted to <user>. They now have <N>
//     additional plan/plans."
//   - Deny message: "VIP request from <user> has been denied." (note:
//     legacy wording starts "VIP request from", NOT "Charlie VIP
//     request from" -- preserved as-is)
//   - createHtmlResponse function (full HTML template + 5 status configs
//     using HTML entity icons + conditional brand-prefix title format)
//
// =========================================================================
// W5c-4d SOURCE-TEXT DELTAS (runtime behavior unchanged)
// =========================================================================
//   - F-W5C-4D-ASCII-COMMENTS: em-dashes in comments replaced with `--`
//     for pure-ASCII source (paste safety, matches W5c-4c convention).
//     Runtime output unaffected (comments are source-only).
//   - F-W5C-4D-EMPTY-TENANT-GUARD-ADDED: explicit error HTML early-return
//     when vipRequest.chat_sessions?.tenant_id is null. Practically
//     unreachable (vip_requests always have a chat_sessions link in
//     practice) but legacy used `tenantId || ''` which would have failed
//     silently downstream. Defensive guard mirrors W5c-4c.
//
// =========================================================================
// HELPER PARAMS (per-route values)
// =========================================================================
//   - userId: vipRequest.chat_sessions?.user_id   (legacy session-bound)
//   - creditGrantNotePrefix: 'Email approval \u2014'   (em-dash escape;
//                              matches legacy 'Email approval --' runtime)
//   - estimatorBccFailurePolicy: 'fail-open'   (IRRELEVANT for plan/chat
//                                                per helper L155; passed
//                                                for type-completeness)
//   - audit: undefined   (legacy Charlie does not write lead_admin_actions)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenantContext, buildBaseUrl } from '@/lib/utils/tenant-brand'
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

    // Find VIP request by token (helper requires this exact join shape)
    const { data: vipRequest, error: findError } = await supabase
      .from('vip_requests')
      .select(`
        *,
        chat_sessions (*),
        agents (
          full_name, email, notification_email,
          ai_manual_approve_limit
        )
      `)
      .eq('approval_token', token)
      .single()

    if (findError || !vipRequest) {
      return createHtmlResponse('error', 'Request not found or link has expired.')
    }

    // T6f-C-2 -- tenant brand context (loaded post-vipRequest non-null check;
    // brandName/domain/baseUrl available for all subsequent createHtmlResponse
    // + helper paths). Uses getTenantContext (NOT direct SELECT) per legacy.
    const tenantId = vipRequest.chat_sessions?.tenant_id || null
    let brandName = ''
    let domain = ''
    let baseUrl = ''
    if (tenantId) {
      const _t6fcCtx = await getTenantContext(supabase, tenantId)
      if (_t6fcCtx) {
        brandName = _t6fcCtx.brandName
        domain = _t6fcCtx.domain
        baseUrl = buildBaseUrl(_t6fcCtx.domain)
      }
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

    // F-W5C-4D-EMPTY-TENANT-GUARD-ADDED: helper requires non-empty tenantId.
    // Practically unreachable (vip_requests always have a chat_sessions
    // link in practice) but legacy used `tenantId || ''` which would have
    // failed silently downstream. Explicit error is safer.
    if (!tenantId) {
      console.error(
        '[walliam/charlie/vip-approve] vipRequest has no chat_sessions.tenant_id',
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
      estimatorBccFailurePolicy: 'fail-open',
      // audit OMITTED: legacy Charlie does not write lead_admin_actions.
    })

    if (!result.ok) {
      // estimatorBccFailurePolicy is irrelevant for Charlie (plan/chat) per
      // helper L155, so result.ok=false should not fire on this path in
      // practice. Defensive HTML mirrors W5c-4c wording for consistency.
      return createHtmlResponse(
        'error',
        'System notification failed. Approval recorded; please contact support.',
        brandName,
      )
    }

    if (typedAction === 'approve') {
      return createHtmlResponse(
        'approved',
        `Plan access granted to ${vipRequest.full_name || vipRequest.phone}. They now have ${result.messagesGranted} additional plan${result.messagesGranted > 1 ? 's' : ''}.`,
        brandName,
      )
    } else {
      return createHtmlResponse(
        'denied',
        `VIP request from ${vipRequest.full_name || vipRequest.phone} has been denied.`,
        brandName,
      )
    }
  } catch (error) {
    console.error('[walliam/charlie/vip-approve] error:', error)
    return createHtmlResponse('error', 'An unexpected error occurred.')
  }
}

// =========================================================================
// createHtmlResponse PRESERVED VERBATIM from legacy.
// HTML format + icons (HTML entities, already ASCII) + title format
// all unchanged to avoid email-link UX delta.
// Icons (HTML numeric entities, pure ASCII source, no escape needed):
//   &#10003; = check mark             (approved)
//   &#10007; = ballot X               (denied)
//   &#9888;  = warning sign           (error)
//   &#8987;  = hourglass              (expired)
//   &#8505;  = information source     (already_processed)
// =========================================================================

function createHtmlResponse(
  status: string,
  message: string,
  brandName: string = '',
): NextResponse {
  const configs: Record<string, { bg: string; icon: string; title: string }> = {
    approved:          { bg: '#10b981', icon: '&#10003;', title: 'Approved' },
    denied:            { bg: '#ef4444', icon: '&#10007;', title: 'Denied' },
    error:             { bg: '#ef4444', icon: '&#9888;', title: 'Error' },
    expired:           { bg: '#f59e0b', icon: '&#8987;', title: 'Expired' },
    already_processed: { bg: '#64748b', icon: '&#8505;', title: 'Already Processed' },
  }

  const cfg = configs[status] || configs.error

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${brandName ? brandName + ' - ' : ''}${cfg.title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #1e293b;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      max-width: 400px;
      width: 100%;
      overflow: hidden;
    }
    .header {
      background: ${cfg.bg};
      padding: 32px;
      text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 12px; }
    .title { color: white; font-size: 22px; font-weight: 700; }
    .content { padding: 24px; text-align: center; }
    .message { color: rgba(255,255,255,0.7); font-size: 15px; line-height: 1.6; }
    .footer { padding: 0 24px 24px; text-align: center; }
    .btn {
      display: inline-block;
      padding: 12px 28px;
      background: linear-gradient(135deg, #1d4ed8, #4f46e5);
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon">${cfg.icon}</div>
      <div class="title">${cfg.title}</div>
    </div>
    <div class="content">
      <p class="message">${message}</p>
    </div>
    <div class="footer">
      <a href="/admin-homes/leads" class="btn">Go to Dashboard</a>
    </div>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}