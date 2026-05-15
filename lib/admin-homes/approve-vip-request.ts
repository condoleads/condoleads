// lib/admin-homes/approve-vip-request.ts
// W-LEADS-WORKBENCH W5c-4a (2026-05-15)
//
// Shared helper for VIP request approve/deny side effects. Consolidates the
// duplicated business logic across the three vip-approve endpoints:
//   1. app/api/walliam/charlie/vip-approve      (legacy GET, token auth, no BCC, no audit)
//   2. app/api/walliam/estimator/vip-approve    (legacy GET, token auth, BCC fail-closed, no audit)
//   3. app/api/admin-homes/leads/[id]/vip-approve (W4f POST, admin auth, BCC fail-open, audit)
//
// Closes F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F.
//
// =========================================================================
// CALLER CONTRACT -- read before consuming
// =========================================================================
//   - Caller MUST have fetched vipRequest with these joins:
//        chat_sessions (*),
//        agents (full_name, email, notification_email, parent_id, ai_manual_approve_limit)
//   - Caller MUST have verified vipRequest.status === 'pending' BEFORE calling.
//   - Caller MUST have verified vipRequest.expires_at >= now BEFORE calling.
//   - Caller is responsible for authentication and authorization.
//   - Caller is responsible for resolving brand context (brandName + baseUrl + domain).
//   - Caller is responsible for formatting the HTTP response (HTML or JSON).
//   - Caller decides userId source (chat_sessions.user_id vs lead.user_id).
//
// =========================================================================
// WRITES PERFORMED
// =========================================================================
//   1. UPDATE vip_requests SET status, responded_at, messages_granted
//   2. (approve only) UPDATE chat_sessions SET status='vip', counters
//        (gated on session_id -- W4f safer pattern; legacy unconditional
//        .eq('id', null) was a silent no-op)
//   3. (approve only) UPSERT user_credit_overrides -- branched per request_type:
//        - 'estimator': estimator_limit only (preserves other pools)
//        - 'plan' / 'chat' / default: all 3 pools (chat + plan + estimator)
//   4. (approve only, if email present) sendTenantEmail with confirmation HTML
//        - estimator: includes BCC chain (getLeadEmailRecipients) + manager CC
//        - plan/chat: TO only (no BCC, no CC)
//   5. (if audit set) logLeadAdminAction -- vip_approved / vip_denied
//
// =========================================================================
// NEVER-THROW POLICY (matches each legacy route's existing posture)
// =========================================================================
//   - Email send errors (TenantEmailNotConfigured, TenantEmailFailed, unknown)
//     are caught and logged; helper returns ok:true.
//   - Audit errors are swallowed by logLeadAdminAction itself.
//   - AdminPlatformUnreachable in BCC fetch follows estimatorBccFailurePolicy:
//       'fail-open':   log warning, send email without BCC, return ok:true
//       'fail-closed': abort the email send AND return ok:false with reason
//
// =========================================================================
// MULTI-TENANT SAFETY
// =========================================================================
//   - Caller's tenantId is the trust boundary. All writes use this tenantId.
//   - vip_requests UPDATE keyed on .id only (caller already verified ownership
//     via approval_token match or admin-homes triple-gate fetch).
//   - chat_sessions UPDATE keyed on .id only.
//   - user_credit_overrides UPSERT scoped on (user_id, tenant_id) onConflict.
//
// =========================================================================
// PRESERVED FINDINGS (NOT addressed by this refactor)
// =========================================================================
//   - F-VIP-APPROVE-EMAILS-NOT-AUDITED -- none of the 3 routes write to
//     lead_email_recipients_log; helper preserves that gap.
//   - F-VIP-APPROVE-GRANTED-BY-TIER-HARDCODED-MANAGER -- 'manager' literal
//     preserved verbatim.
//   - F-VIP-APPROVE-GET-CSRF-RISK -- legacy GET endpoints are still GET; not
//     a W5c-4 concern.
//   - F-W5C-4-EMAIL-ICON-UNIFIED-ON-LEGACY-GLYPH -- helper unifies on U+2726
//     (legacy charlie + estimator glyph). Admin-homes' next emails change
//     icon from U+2728 (sparkles) to U+2726 (four-pointed star). Cosmetic.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendTenantEmail,
  TenantEmailNotConfigured,
  TenantEmailFailed,
} from '@/lib/email/sendTenantEmail'
import {
  getLeadEmailRecipients,
  AdminPlatformUnreachable,
} from '@/lib/admin-homes/lead-email-recipients'
import { logLeadAdminAction } from '@/lib/admin-homes/log-lead-admin-action'

// ============================================================================
// Types
// ============================================================================

/** Minimum shape the helper consumes from vip_requests + joins.
 *  Caller's SELECT must include at least these fields. */
export interface VipRequestWithJoins {
  id: string
  status: string
  expires_at: string
  request_type: string | null
  request_source?: string | null
  buyer_type: string | null
  email: string | null
  full_name: string | null
  phone: string | null
  page_url: string | null
  agent_id: string | null
  session_id: string | null
  chat_sessions: {
    tenant_id: string | null
    user_id: string | null
    vip_messages_granted: number | null
    manual_approvals_count: number | null
    message_count: number | null
    buyer_plans_used: number | null
    seller_plans_used: number | null
    estimator_count: number | null
  } | null
  agents: {
    full_name: string | null
    email: string | null
    notification_email: string | null
    parent_id: string | null
    ai_manual_approve_limit: number | null
  } | null
}

export interface ApproveVipRequestParams {
  supabase: SupabaseClient
  /** Tenant boundary for all writes. Caller-resolved. */
  tenantId: string
  /** Already-fetched vip_requests row with chat_sessions(*) and agents(...) joins. */
  vipRequest: VipRequestWithJoins
  action: 'approve' | 'deny'
  /** Pre-resolved brand context. Each caller route resolves this differently
   *  (getTenantContext vs direct tenants SELECT); helper consumes the
   *  already-resolved values. */
  brand: {
    brandName: string
    baseUrl: string
    /** Legacy charlie email template took `domain` but never referenced it.
     *  Kept in the interface for parity with the legacy positional signature
     *  during caller migration; helper itself does not reference it. */
    domain: string
  }
  /** User ID to credit. Caller decides source:
   *    legacy walliam routes -> vipRequest.chat_sessions?.user_id
   *    admin-homes route     -> lead.user_id
   *  When null, the user_credit_overrides UPSERT is skipped. */
  userId: string | null
  /** Prefix for user_credit_overrides.note. Preserves per-route audit wording:
   *    legacy walliam -> 'Email approval \u2014' (em-dash)
   *    admin-homes    -> 'Admin approve --' (ascii) */
  creditGrantNotePrefix: string
  /** BCC fetch recovery posture. Determines AdminPlatformUnreachable behavior
   *  when request_type === 'estimator' (the only branch that fetches BCC).
   *    'fail-open':   log + continue without BCC; return ok:true
   *    'fail-closed': abort send AND return ok:false; caller surfaces error
   *  Legacy estimator route is 'fail-closed' (preserves L141-145 behavior).
   *  Admin-homes route is 'fail-open' (preserves L286-292 behavior).
   *  Charlie route value is irrelevant (no estimator request_type expected). */
  estimatorBccFailurePolicy: 'fail-open' | 'fail-closed'
  /** Optional audit hook. When set, helper writes one lead_admin_actions row
   *  via logLeadAdminAction (never-throw). Admin-homes sets this; legacy
   *  walliam routes pass undefined. */
  audit?: {
    leadId: string
    actorAgentId: string | null
    actorRole: string
    notes: string
  }
}

export type ApproveVipRequestResult =
  | {
      ok: true
      status: 'approved' | 'denied'
      messagesGranted: number
    }
  | {
      ok: false
      reason: 'admin_platform_unreachable'
      error: string
      /** When fail-closed fires AFTER status flip, the status + grant are
       *  persisted but the email did NOT go out. Audit (if set) still fires. */
      partialSuccess: {
        status: 'approved'
        messagesGranted: number
      }
    }

interface TenantCfg {
  plan_hard_cap?: number | null
  seller_plan_hard_cap?: number | null
  ai_hard_cap?: number | null
  estimator_hard_cap?: number | null
  ai_manual_approve_limit?: number | null
  plan_manual_approve_limit?: number | null
  estimator_manual_approve_attempts?: number | null
}

// ============================================================================
// Public entry point
// ============================================================================

export async function approveVipRequest(
  params: ApproveVipRequestParams,
): Promise<ApproveVipRequestResult> {
  const {
    supabase,
    tenantId,
    vipRequest,
    action,
    brand,
    userId,
    creditGrantNotePrefix,
    estimatorBccFailurePolicy,
    audit,
  } = params

  const isEstimator = vipRequest.request_type === 'estimator'
  const newStatus: 'approved' | 'denied' = action === 'approve' ? 'approved' : 'denied'

  // ---------------------------------------------------------
  // 1. Compute messages_granted (approve only; 0 on deny).
  //    Preserves per-route + per-type grant logic verbatim.
  // ---------------------------------------------------------
  let messagesGranted = 0
  let tenantCfg: TenantCfg | null = null

  if (action === 'approve') {
    const { data } = await supabase
      .from('tenants')
      .select(
        'plan_hard_cap, seller_plan_hard_cap, ai_hard_cap, estimator_hard_cap, ai_manual_approve_limit, plan_manual_approve_limit, estimator_manual_approve_attempts',
      )
      .eq('id', tenantId)
      .single()
    tenantCfg = (data as TenantCfg | null) ?? null

    if (isEstimator) {
      // Estimator: tenant.estimator_manual_approve_attempts default 3,
      // no agent fallback (matches legacy estimator + admin-homes-estimator).
      messagesGranted = tenantCfg?.estimator_manual_approve_attempts ?? 3
    } else {
      // Plan/chat: agent.ai_manual_approve_limit default 3, override by
      // tenant.plan_manual_approve_limit if set
      // (matches legacy charlie L83+L91 + admin-homes-plan L140+L147).
      messagesGranted = vipRequest.agents?.ai_manual_approve_limit ?? 3
      if (tenantCfg?.plan_manual_approve_limit != null) {
        messagesGranted = tenantCfg.plan_manual_approve_limit
      }
    }
  }

  // ---------------------------------------------------------
  // 2. UPDATE vip_requests (always -- both approve and deny).
  // ---------------------------------------------------------
  await supabase
    .from('vip_requests')
    .update({
      status: newStatus,
      responded_at: new Date().toISOString(),
      messages_granted: messagesGranted,
    })
    .eq('id', vipRequest.id)

  // ---------------------------------------------------------
  // 3. Approve-only side effects.
  // ---------------------------------------------------------
  if (action === 'approve') {
    // 3a. chat_sessions upgrade -- gated on session_id (W4f safer pattern;
    //     legacy unconditional .eq('id', null) was a silent no-op).
    if (vipRequest.session_id) {
      const cs = vipRequest.chat_sessions
      await supabase
        .from('chat_sessions')
        .update({
          status: 'vip',
          vip_accepted_at: new Date().toISOString(),
          vip_phone: vipRequest.phone,
          vip_messages_granted: (cs?.vip_messages_granted ?? 0) + messagesGranted,
          manual_approvals_count: (cs?.manual_approvals_count ?? 0) + 1,
          last_approval_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', vipRequest.session_id)
    }

    // 3b. user_credit_overrides UPSERT -- per-type pool grant.
    if (userId) {
      if (isEstimator) {
        await upsertCreditsEstimator({
          supabase,
          userId,
          tenantId,
          messagesGranted,
          grantedByAgentId: vipRequest.agent_id ?? null,
          estimatorHardCap: tenantCfg?.estimator_hard_cap ?? 50,
          notePrefix: creditGrantNotePrefix,
        })
      } else {
        await upsertCreditsAllPools({
          supabase,
          userId,
          tenantId,
          chatSessions: vipRequest.chat_sessions,
          grantedByAgentId: vipRequest.agent_id ?? null,
          tenantCfg: tenantCfg ?? {},
          notePrefix: creditGrantNotePrefix,
        })
      }
    }

    // 3c. Confirmation email -- only if email present.
    if (vipRequest.email) {
      const emailResult = await sendConfirmationEmail({
        supabase,
        tenantId,
        vipRequest,
        brand,
        isEstimator,
        messagesGranted,
        estimatorBccFailurePolicy,
      })
      if (emailResult.ok === false) {
        // fail-closed branch fired in BCC fetch. Status flip + grant already
        // persisted. Audit (if set) still fires below since the approve DID
        // happen at the data layer; caller decides how to surface partial.
        if (audit) {
          await fireAudit({ supabase, action, newStatus, vipRequest, messagesGranted, audit, tenantId })
        }
        return {
          ok: false,
          reason: 'admin_platform_unreachable',
          error: emailResult.error,
          partialSuccess: { status: 'approved', messagesGranted },
        }
      }
    }
  }

  // ---------------------------------------------------------
  // 4. Audit (if set).
  // ---------------------------------------------------------
  if (audit) {
    await fireAudit({ supabase, action, newStatus, vipRequest, messagesGranted, audit, tenantId })
  }

  return { ok: true, status: newStatus, messagesGranted }
}

// ============================================================================
// Internal: user_credit_overrides upsert (estimator branch)
// ============================================================================

async function upsertCreditsEstimator(p: {
  supabase: SupabaseClient
  userId: string
  tenantId: string
  messagesGranted: number
  grantedByAgentId: string | null
  estimatorHardCap: number
  notePrefix: string
}): Promise<void> {
  // Read-modify-write: preserve other pool fields, only bump estimator_limit.
  const { data: existing } = await p.supabase
    .from('user_credit_overrides')
    .select('estimator_limit')
    .eq('user_id', p.userId)
    .eq('tenant_id', p.tenantId)
    .maybeSingle()
  const currentLimit = (existing as { estimator_limit?: number | null } | null)?.estimator_limit ?? 0
  const newLimit = Math.min(currentLimit + p.messagesGranted, p.estimatorHardCap)
  await p.supabase
    .from('user_credit_overrides')
    .upsert(
      {
        user_id: p.userId,
        tenant_id: p.tenantId,
        granted_by_agent_id: p.grantedByAgentId,
        granted_by_tier: 'manager', // PRESERVED -- F-VIP-APPROVE-GRANTED-BY-TIER-HARDCODED-MANAGER
        note: p.notePrefix + ' ' + p.messagesGranted + ' estimator credits granted',
        estimator_limit: newLimit,
        granted_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tenant_id' },
    )
}

// ============================================================================
// Internal: user_credit_overrides upsert (all-3-pools branch)
// ============================================================================

async function upsertCreditsAllPools(p: {
  supabase: SupabaseClient
  userId: string
  tenantId: string
  chatSessions: VipRequestWithJoins['chat_sessions']
  grantedByAgentId: string | null
  tenantCfg: TenantCfg
  notePrefix: string
}): Promise<void> {
  const cs = p.chatSessions
  const chatUsed = cs?.message_count ?? 0
  const planUsed = (cs?.buyer_plans_used ?? 0) + (cs?.seller_plans_used ?? 0)
  const estimatorUsed = cs?.estimator_count ?? 0
  const newChatLimit = Math.min(
    chatUsed + (p.tenantCfg.ai_manual_approve_limit ?? 3),
    p.tenantCfg.ai_hard_cap ?? 25,
  )
  const newPlanLimit = Math.min(
    planUsed + (p.tenantCfg.plan_manual_approve_limit ?? 3),
    p.tenantCfg.plan_hard_cap ?? 10,
  )
  const newEstimatorLimit = Math.min(
    estimatorUsed + (p.tenantCfg.estimator_manual_approve_attempts ?? 3),
    p.tenantCfg.estimator_hard_cap ?? 10,
  )
  await p.supabase
    .from('user_credit_overrides')
    .upsert(
      {
        user_id: p.userId,
        tenant_id: p.tenantId,
        granted_by_agent_id: p.grantedByAgentId,
        granted_by_tier: 'manager', // PRESERVED
        note:
          p.notePrefix +
          ' chat:' +
          newChatLimit +
          ' plans:' +
          newPlanLimit +
          ' estimator:' +
          newEstimatorLimit,
        ai_chat_limit: newChatLimit,
        buyer_plan_limit: newPlanLimit,
        estimator_limit: newEstimatorLimit,
        granted_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tenant_id' },
    )
}

// ============================================================================
// Internal: confirmation email send
//   estimator: BCC chain via getLeadEmailRecipients + manager CC via parent_id
//              + AdminPlatformUnreachable per estimatorBccFailurePolicy
//   plan/chat: TO only (no BCC, no CC)
// ============================================================================

async function sendConfirmationEmail(p: {
  supabase: SupabaseClient
  tenantId: string
  vipRequest: VipRequestWithJoins
  brand: { brandName: string; baseUrl: string; domain: string }
  isEstimator: boolean
  messagesGranted: number
  estimatorBccFailurePolicy: 'fail-open' | 'fail-closed'
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, tenantId, vipRequest, brand, isEstimator, messagesGranted, estimatorBccFailurePolicy } = p

  let bccList: string[] = []
  let ccList: string[] = []

  if (isEstimator) {
    try {
      const recipients = await getLeadEmailRecipients(
        tenantId,
        vipRequest.agent_id ?? null,
        supabase,
      )
      bccList = recipients.bcc
    } catch (err) {
      if (err instanceof AdminPlatformUnreachable) {
        if (estimatorBccFailurePolicy === 'fail-closed') {
          console.error('[approve-vip-request] admin platform unreachable (fail-closed):', err.message)
          return { ok: false, error: err.message }
        }
        // fail-open: log + continue without BCC.
        console.error('[approve-vip-request] admin platform unreachable (fail-open):', err.message)
      } else {
        console.error('[approve-vip-request] unexpected recipients error:', err)
      }
    }
    // Manager CC via agent.parent_id (preserved across estimator + admin-homes routes).
    const agent = vipRequest.agents
    if (agent?.parent_id) {
      const { data: mgr } = await supabase
        .from('agents')
        .select('email, notification_email')
        .eq('id', agent.parent_id)
        .single()
      if (mgr) {
        const mgrRow = mgr as { email: string | null; notification_email: string | null }
        const mgrEmail = mgrRow.notification_email || mgrRow.email
        if (mgrEmail) ccList = [mgrEmail]
      }
    }
  }

  const accessLabel = isEstimator ? 'Estimator Access' : 'Plan Access'
  const subject = 'Your ' + brand.brandName + ' ' + accessLabel + ' is Approved'
  const html = buildApprovalEmailHtml({
    isEstimator,
    userName: vipRequest.full_name ?? '',
    agentName: vipRequest.agents?.full_name ?? brand.brandName,
    messagesGranted,
    brandName: brand.brandName,
    baseUrl: brand.baseUrl,
    pageUrl: isEstimator ? vipRequest.page_url ?? null : null,
  })

  try {
    await sendTenantEmail({
      tenantId,
      to: vipRequest.email as string,
      cc: ccList.length > 0 ? ccList : undefined,
      bcc: bccList.length > 0 ? bccList : undefined,
      subject,
      html,
    })
  } catch (err) {
    if (err instanceof TenantEmailNotConfigured) {
      console.warn('[approve-vip-request] tenant email not configured:', err.message)
    } else if (err instanceof TenantEmailFailed) {
      console.error('[approve-vip-request] resend send failed:', err.message)
    } else {
      console.error('[approve-vip-request] unexpected email error:', err)
    }
  }

  return { ok: true }
}

// ============================================================================
// Internal: audit row write
// ============================================================================

async function fireAudit(p: {
  supabase: SupabaseClient
  action: 'approve' | 'deny'
  newStatus: 'approved' | 'denied'
  vipRequest: VipRequestWithJoins
  messagesGranted: number
  audit: NonNullable<ApproveVipRequestParams['audit']>
  tenantId: string
}): Promise<void> {
  await logLeadAdminAction({
    supabase: p.supabase,
    tenantId: p.tenantId,
    leadId: p.audit.leadId,
    actorAgentId: p.audit.actorAgentId,
    actorRole: p.audit.actorRole,
    actionType: p.action === 'approve' ? 'vip_approved' : 'vip_denied',
    targetField: 'status',
    beforeValue: { status: 'pending' },
    afterValue: {
      status: p.newStatus,
      vip_request_id: p.vipRequest.id,
      request_type: p.vipRequest.request_type,
      request_source: p.vipRequest.request_source ?? null,
      messages_granted: p.messagesGranted,
    },
    notes: p.audit.notes,
  })
}

// ============================================================================
// Email template -- branched per isEstimator, preserves verbatim legacy wording
// per branch:
//   - Plan branch: matches charlie/vip-approve L213-238 (heading "Plan Access
//     Approved", body "approved your request ... available on {brand}",
//     extra paragraph "Your agent may also reach out directly to help with
//     your real estate journey.", no Source line).
//   - Estimator branch: matches estimator/vip-approve L201-218 (heading
//     "Estimator Access Approved", body "approved your estimator access ...
//     available", no extra paragraph, conditional Source pageUrl line).
//
// Icon: U+2726 (BLACK FOUR POINTED STAR \u2726) -- the legacy production glyph
// (charlie + estimator). Admin-homes' next emails change icon from U+2728
// (SPARKLES) to U+2726. Cosmetic only -- logged as
// F-W5C-4-EMAIL-ICON-UNIFIED-ON-LEGACY-GLYPH.
//
// Strings constructed via array join to keep concatenation explicit and avoid
// backtick-template parsing concerns in tooling (W4b
// F-W4B-CHAT-ANCHOR-SANITIZATION lesson).
// ============================================================================

function buildApprovalEmailHtml(args: {
  isEstimator: boolean
  userName: string
  agentName: string
  messagesGranted: number
  brandName: string
  baseUrl: string
  pageUrl: string | null
}): string {
  const userGreeting = args.userName || 'there'
  const accessLabel = args.isEstimator ? 'Estimator Access' : 'Plan Access'
  const icon = '\u2726' // BLACK FOUR POINTED STAR (legacy glyph)

  const header = [
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">',
    '  <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">',
    '    <div style="font-size: 48px; margin-bottom: 12px;">' + icon + '</div>',
    '    <h1 style="color: white; margin: 0; font-size: 24px;">' + accessLabel + ' Approved</h1>',
    '    <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0;">' + args.brandName + ' AI Real Estate</p>',
    '  </div>',
    '  <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">',
    '    <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">Hi ' + userGreeting + ',</p>',
  ].join('\n')

  let bodyParas: string
  if (args.isEstimator) {
    const unitPlural = args.messagesGranted > 1 ? 'estimates' : 'estimate'
    bodyParas =
      '    <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;"><strong>' +
      args.agentName +
      '</strong> has approved your estimator access. You now have <strong>' +
      args.messagesGranted +
      ' additional ' +
      unitPlural +
      '</strong> available.</p>'
  } else {
    const unitPlural = args.messagesGranted > 1 ? 'plans' : 'plan'
    bodyParas = [
      '    <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;"><strong>' +
        args.agentName +
        '</strong> has approved your request. You now have <strong>' +
        args.messagesGranted +
        ' additional ' +
        unitPlural +
        '</strong> available on ' +
        args.brandName +
        '.</p>',
      '    <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">Your agent may also reach out directly to help with your real estate journey.</p>',
    ].join('\n')
  }

  const ctaButton = [
    '    <div style="text-align: center;">',
    '      <a href="' +
      args.baseUrl +
      '" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">' +
      icon +
      ' Back to ' +
      args.brandName +
      '</a>',
    '    </div>',
  ].join('\n')

  const sourceLine =
    args.isEstimator && args.pageUrl
      ? '\n    <p style="margin: 24px 0 0; text-align: center; color: #cbd5e1; font-size: 10px;">Source: <a href="' +
        args.pageUrl +
        '" style="color: #94a3b8; text-decoration: underline;">' +
        args.pageUrl +
        '</a></p>'
      : ''

  const footer = ['  </div>', '</div>'].join('\n')

  return header + '\n' + bodyParas + '\n' + ctaButton + sourceLine + '\n' + footer
}