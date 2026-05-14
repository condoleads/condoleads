#!/usr/bin/env node
/**
 * patch-w-leads-workbench-w4f-vip-requests-tab.js
 *
 * W-LEADS-WORKBENCH W4f (2026-05-14) -- VIP Requests tab + in-page Approve/Deny.
 *
 * CREATES (2):
 *   app/api/admin-homes/leads/[id]/vip-approve/route.ts
 *   components/admin-homes/lead-workbench/VipRequestsTab.tsx
 *
 * MODIFIES (2):
 *   app/admin-homes/leads/[id]/page.tsx           (add vipRequests prefetch + prop)
 *   app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx  (import + Props + dispatch)
 *
 * DOES NOT TOUCH:
 *   app/api/walliam/charlie/vip-approve/route.ts  (untouched)
 *   app/api/walliam/estimator/vip-approve/route.ts  (untouched)
 *   docs/W-LEADS-WORKBENCH-TRACKER.md  (separate update step after smoke)
 *
 * Findings logged for future cleanup:
 *   F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F
 *   F-VIP-APPROVE-EMAILS-NOT-AUDITED
 *
 * Atomic: validation passes for all 4 files BEFORE any file is written.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const d = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  d.getFullYear() +
  pad(d.getMonth() + 1) +
  pad(d.getDate()) +
  '_' +
  pad(d.getHours()) +
  pad(d.getMinutes()) +
  pad(d.getSeconds())

const PATH_ROUTE = path.join(
  ROOT,
  'app',
  'api',
  'admin-homes',
  'leads',
  '[id]',
  'vip-approve',
  'route.ts',
)
const PATH_TAB = path.join(
  ROOT,
  'components',
  'admin-homes',
  'lead-workbench',
  'VipRequestsTab.tsx',
)
const PATH_PAGE = path.join(
  ROOT,
  'app',
  'admin-homes',
  'leads',
  '[id]',
  'page.tsx',
)
const PATH_CLIENT = path.join(
  ROOT,
  'app',
  'admin-homes',
  'leads',
  '[id]',
  'LeadWorkbenchClient.tsx',
)

// ============================================================================
// PRE-FLIGHT
// ============================================================================

if (fs.existsSync(PATH_ROUTE)) {
  throw new Error('NEW file already exists (refusing to overwrite): ' + PATH_ROUTE)
}
if (fs.existsSync(PATH_TAB)) {
  throw new Error('NEW file already exists (refusing to overwrite): ' + PATH_TAB)
}
if (!fs.existsSync(PATH_PAGE)) {
  throw new Error('EXISTING file missing: ' + PATH_PAGE)
}
if (!fs.existsSync(PATH_CLIENT)) {
  throw new Error('EXISTING file missing: ' + PATH_CLIENT)
}

function detectLE(filePath) {
  const buf = fs.readFileSync(filePath)
  let crlf = 0
  let lfOnly = 0
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      if (i > 0 && buf[i - 1] === 0x0d) crlf++
      else lfOnly++
    }
  }
  if (crlf > 0 && lfOnly === 0) return 'crlf'
  if (lfOnly > 0 && crlf === 0) return 'lf'
  throw new Error('mixed or no LE: ' + filePath)
}

const PAGE_LE = detectLE(PATH_PAGE)
const CLIENT_LE = detectLE(PATH_CLIENT)
console.log('LE detected -- page.tsx: ' + PAGE_LE + ', LeadWorkbenchClient.tsx: ' + CLIENT_LE)

// ============================================================================
// NEW FILE 1: app/api/admin-homes/leads/[id]/vip-approve/route.ts
// ============================================================================

const ROUTE_CONTENT = [
  "// app/api/admin-homes/leads/[id]/vip-approve/route.ts",
  "// W-LEADS-WORKBENCH W4f (2026-05-14)",
  "//",
  "// POST endpoint for admin-side approve/deny of a VIP request bound to a lead.",
  "// Mirrors the per-request_type behavior of the existing email-link approve",
  "// endpoints (app/api/walliam/charlie/vip-approve, app/api/walliam/estimator/vip-approve)",
  "// without touching them. Duplication logged as F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F.",
  "//",
  "// MULTITENANT CONTRACT (Rule Zero #1)",
  "//   - Tenant boundary is lead.tenant_id (NOT user.tenantId).",
  "//   - vip_requests fetched with WHERE id = vipRequestId AND tenant_id = lead.tenant_id",
  "//     AND lead_id = lead.id (triple gate -- no cross-tenant or cross-lead approval).",
  "//   - can('lead.write') enforces user's permission to act on this lead.",
  "//",
  "// REQUEST BODY",
  "//   { vipRequestId: string (uuid), action: 'approve' | 'deny' }",
  "//",
  "// BEHAVIOR ON approve",
  "//   1. UPDATE vip_requests SET status='approved', responded_at, messages_granted",
  "//   2. UPDATE chat_sessions (if session_id) -- VIP status, counters",
  "//   3. UPSERT user_credit_overrides:",
  "//        - estimator request_type: estimator_limit only (preserves other pools)",
  "//        - plan/chat request_type: all 3 pools (chat + plan + estimator)",
  "//   4. Send confirmation email to vipRequest.email (if present)",
  "//        - estimator: includes BCC chain via getLeadEmailRecipients",
  "//        - plan/chat: no BCC chain (matches charlie endpoint)",
  "//   5. Audit via logLeadAdminAction (action_type='vip_approved')",
  "//",
  "// BEHAVIOR ON deny",
  "//   1. UPDATE vip_requests SET status='denied', responded_at, messages_granted=0",
  "//   2. Audit via logLeadAdminAction (action_type='vip_denied')",
  "//   3. No email, no credit grant, no session update",
  "//",
  "// IDEMPOTENCY",
  "//   - status !== 'pending' returns 409 with current status",
  "//   - expires_at < now returns 410 (marks row 'expired' first)",
  "",
  "import { NextRequest, NextResponse } from 'next/server'",
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'",
  "import { createServiceClient } from '@/lib/admin-homes/service-client'",
  "import { can } from '@/lib/admin-homes/permissions'",
  "import {",
  "  getLeadEmailRecipients,",
  "  sendTenantEmail,",
  "  TenantEmailNotConfigured,",
  "  TenantEmailFailed,",
  "  AdminPlatformUnreachable,",
  "} from '@/lib/admin-homes/lead-email-recipients'",
  "import { getTenantContext, buildBaseUrl } from '@/lib/utils/tenant-brand'",
  "import { logLeadAdminAction } from '@/lib/admin-homes/log-lead-admin-action'",
  "",
  "export async function POST(request: NextRequest, { params }: { params: { id: string } }) {",
  "  try {",
  "    const user = await resolveAdminHomesUser()",
  "    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })",
  "",
  "    const supabase = createServiceClient()",
  "",
  "    // Fetch lead -- the lead's tenant_id is the trust boundary for this request.",
  "    const { data: lead } = await supabase",
  "      .from('leads')",
  "      .select('id, tenant_id, agent_id, user_id, contact_email')",
  "      .eq('id', params.id)",
  "      .maybeSingle()",
  "",
  "    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })",
  "",
  "    const decision = can(user.permissions, 'lead.write', {",
  "      kind: 'lead',",
  "      leadId: lead.id,",
  "      tenantId: lead.tenant_id,",
  "      agentId: lead.agent_id,",
  "    })",
  "    if (!decision.ok) {",
  "      return NextResponse.json({ error: decision.reason }, { status: decision.status })",
  "    }",
  "",
  "    let body: any",
  "    try {",
  "      body = await request.json()",
  "    } catch {",
  "      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })",
  "    }",
  "    const vipRequestId = typeof body?.vipRequestId === 'string' ? body.vipRequestId : ''",
  "    const action = typeof body?.action === 'string' ? body.action : ''",
  "    if (!vipRequestId) {",
  "      return NextResponse.json({ error: 'vipRequestId is required' }, { status: 400 })",
  "    }",
  "    if (action !== 'approve' && action !== 'deny') {",
  "      return NextResponse.json({ error: \"action must be 'approve' or 'deny'\" }, { status: 400 })",
  "    }",
  "",
  "    // Triple gate: id + tenant + lead binding. Prevents cross-tenant or cross-lead approval.",
  "    const { data: vipRequest } = await supabase",
  "      .from('vip_requests')",
  "      .select('*, chat_sessions(*), agents(full_name, email, notification_email, parent_id, ai_manual_approve_limit)')",
  "      .eq('id', vipRequestId)",
  "      .eq('tenant_id', lead.tenant_id)",
  "      .eq('lead_id', lead.id)",
  "      .maybeSingle()",
  "",
  "    if (!vipRequest) {",
  "      return NextResponse.json({ error: 'VIP request not found for this lead' }, { status: 404 })",
  "    }",
  "",
  "    if (vipRequest.status !== 'pending') {",
  "      return NextResponse.json(",
  "        { error: 'VIP request is not pending', currentStatus: vipRequest.status },",
  "        { status: 409 },",
  "      )",
  "    }",
  "",
  "    if (new Date(vipRequest.expires_at) < new Date()) {",
  "      await supabase",
  "        .from('vip_requests')",
  "        .update({ status: 'expired' })",
  "        .eq('id', vipRequest.id)",
  "      return NextResponse.json({ error: 'VIP request has expired' }, { status: 410 })",
  "    }",
  "",
  "    const isEstimator = vipRequest.request_type === 'estimator'",
  "    const tenantId = lead.tenant_id",
  "    const newStatus = action === 'approve' ? 'approved' : 'denied'",
  "",
  "    // Compute messages_granted for the vip_requests UPDATE.",
  "    // On deny: 0. On approve: per-type grant amount from tenant config.",
  "    let messagesGranted = 0",
  "    let tenantCfg: any = null",
  "    if (action === 'approve') {",
  "      if (isEstimator) {",
  "        const r = await supabase",
  "          .from('tenants')",
  "          .select('estimator_manual_approve_attempts, estimator_hard_cap')",
  "          .eq('id', tenantId)",
  "          .single()",
  "        tenantCfg = r.data",
  "        messagesGranted = tenantCfg?.estimator_manual_approve_attempts ?? 3",
  "      } else {",
  "        const agent = (vipRequest as any).agents",
  "        messagesGranted = agent?.ai_manual_approve_limit ?? 3",
  "        const r = await supabase",
  "          .from('tenants')",
  "          .select('plan_hard_cap, seller_plan_hard_cap, ai_hard_cap, estimator_hard_cap, ai_manual_approve_limit, plan_manual_approve_limit, estimator_manual_approve_attempts')",
  "          .eq('id', tenantId)",
  "          .single()",
  "        tenantCfg = r.data",
  "        if (tenantCfg?.plan_manual_approve_limit != null) {",
  "          messagesGranted = tenantCfg.plan_manual_approve_limit",
  "        }",
  "      }",
  "    }",
  "",
  "    // Status flip on vip_requests.",
  "    await supabase",
  "      .from('vip_requests')",
  "      .update({",
  "        status: newStatus,",
  "        responded_at: new Date().toISOString(),",
  "        messages_granted: messagesGranted,",
  "      })",
  "      .eq('id', vipRequest.id)",
  "",
  "    // On approve only: cascade side effects.",
  "    if (action === 'approve') {",
  "      const cs = (vipRequest as any).chat_sessions",
  "",
  "      // Session-level VIP upgrade (if a session exists).",
  "      if (vipRequest.session_id) {",
  "        await supabase",
  "          .from('chat_sessions')",
  "          .update({",
  "            status: 'vip',",
  "            vip_accepted_at: new Date().toISOString(),",
  "            vip_phone: vipRequest.phone,",
  "            vip_messages_granted: (cs?.vip_messages_granted || 0) + messagesGranted,",
  "            manual_approvals_count: (cs?.manual_approvals_count || 0) + 1,",
  "            last_approval_at: new Date().toISOString(),",
  "            updated_at: new Date().toISOString(),",
  "          })",
  "          .eq('id', vipRequest.session_id)",
  "      }",
  "",
  "      // user_credit_overrides UPSERT -- per-type pool grant.",
  "      const userId = lead.user_id",
  "      if (userId) {",
  "        if (isEstimator) {",
  "          // Estimator-only grant (matches estimator endpoint -- preserves other pools).",
  "          const { data: ex } = await supabase",
  "            .from('user_credit_overrides')",
  "            .select('estimator_limit')",
  "            .eq('user_id', userId)",
  "            .eq('tenant_id', tenantId)",
  "            .maybeSingle()",
  "          const currentLimit = ex?.estimator_limit ?? 0",
  "          const newLimit = Math.min(currentLimit + messagesGranted, tenantCfg?.estimator_hard_cap ?? 50)",
  "          await supabase",
  "            .from('user_credit_overrides')",
  "            .upsert(",
  "              {",
  "                user_id: userId,",
  "                tenant_id: tenantId,",
  "                granted_by_agent_id: vipRequest.agent_id || null,",
  "                granted_by_tier: 'manager',",
  "                note: 'Admin approve -- ' + messagesGranted + ' estimator credits granted',",
  "                estimator_limit: newLimit,",
  "                granted_at: new Date().toISOString(),",
  "              },",
  "              { onConflict: 'user_id,tenant_id' },",
  "            )",
  "        } else {",
  "          // Plan/chat: all 3 pools grant (matches charlie endpoint).",
  "          const chatUsed = cs?.message_count || 0",
  "          const planUsed = (cs?.buyer_plans_used || 0) + (cs?.seller_plans_used || 0)",
  "          const estimatorUsed = cs?.estimator_count || 0",
  "          const newChatLimit = Math.min(",
  "            chatUsed + (tenantCfg?.ai_manual_approve_limit ?? 3),",
  "            tenantCfg?.ai_hard_cap ?? 25,",
  "          )",
  "          const newPlanLimit = Math.min(",
  "            planUsed + (tenantCfg?.plan_manual_approve_limit ?? 3),",
  "            tenantCfg?.plan_hard_cap ?? 10,",
  "          )",
  "          const newEstimatorLimit = Math.min(",
  "            estimatorUsed + (tenantCfg?.estimator_manual_approve_attempts ?? 3),",
  "            tenantCfg?.estimator_hard_cap ?? 10,",
  "          )",
  "          await supabase",
  "            .from('user_credit_overrides')",
  "            .upsert(",
  "              {",
  "                user_id: userId,",
  "                tenant_id: tenantId,",
  "                granted_by_agent_id: vipRequest.agent_id || null,",
  "                granted_by_tier: 'manager',",
  "                note:",
  "                  'Admin approve -- chat:' +",
  "                  newChatLimit +",
  "                  ' plans:' +",
  "                  newPlanLimit +",
  "                  ' estimator:' +",
  "                  newEstimatorLimit,",
  "                ai_chat_limit: newChatLimit,",
  "                buyer_plan_limit: newPlanLimit,",
  "                estimator_limit: newEstimatorLimit,",
  "                granted_at: new Date().toISOString(),",
  "              },",
  "              { onConflict: 'user_id,tenant_id' },",
  "            )",
  "        }",
  "      }",
  "",
  "      // Confirmation email to the requester (if email present).",
  "      // estimator: includes BCC chain via helper.",
  "      // plan/chat: no BCC chain (matches charlie endpoint).",
  "      if (vipRequest.email) {",
  "        const brandCtx = await getTenantContext(supabase, tenantId)",
  "        const brandName = brandCtx?.brandName || ''",
  "        const domain = brandCtx?.domain || ''",
  "        const baseUrl = brandCtx?.domain ? buildBaseUrl(brandCtx.domain) : ''",
  "        const agent = (vipRequest as any).agents",
  "        const agentName = agent?.full_name || brandName",
  "        const subject = isEstimator",
  "          ? 'Your ' + brandName + ' Estimator Access is Approved'",
  "          : 'Your ' + brandName + ' Plan Access is Approved'",
  "        const html = buildApprovalEmailHtml({",
  "          isEstimator,",
  "          userName: vipRequest.full_name || '',",
  "          agentName,",
  "          messagesGranted,",
  "          brandName,",
  "          baseUrl,",
  "          pageUrl: vipRequest.page_url || null,",
  "        })",
  "",
  "        let bccList: string[] = []",
  "        let ccList: string[] = []",
  "        if (isEstimator) {",
  "          try {",
  "            const recipients = await getLeadEmailRecipients(",
  "              tenantId,",
  "              vipRequest.agent_id || null,",
  "              supabase,",
  "            )",
  "            bccList = recipients.bcc",
  "          } catch (err) {",
  "            if (err instanceof AdminPlatformUnreachable) {",
  "              console.error('[w4f vip-approve] admin platform unreachable:', err.message)",
  "              // Approve already recorded; surface as warning but don't fail the action.",
  "            } else {",
  "              console.error('[w4f vip-approve] unexpected recipients error:', err)",
  "            }",
  "          }",
  "          if (agent?.parent_id) {",
  "            const { data: mgr } = await supabase",
  "              .from('agents')",
  "              .select('email, notification_email')",
  "              .eq('id', agent.parent_id)",
  "              .single()",
  "            if (mgr) {",
  "              const mgrEmail = mgr.notification_email || mgr.email",
  "              if (mgrEmail) ccList = [mgrEmail]",
  "            }",
  "          }",
  "        }",
  "",
  "        try {",
  "          await sendTenantEmail({",
  "            tenantId,",
  "            to: vipRequest.email,",
  "            cc: ccList.length > 0 ? ccList : undefined,",
  "            bcc: bccList.length > 0 ? bccList : undefined,",
  "            subject,",
  "            html,",
  "          })",
  "        } catch (err) {",
  "          if (err instanceof TenantEmailNotConfigured) {",
  "            console.warn('[w4f vip-approve] tenant email not configured:', err.message)",
  "          } else if (err instanceof TenantEmailFailed) {",
  "            console.error('[w4f vip-approve] resend send failed:', err.message)",
  "          } else {",
  "            console.error('[w4f vip-approve] unexpected email error:', err)",
  "          }",
  "        }",
  "      }",
  "    }",
  "",
  "    // Audit. Best-effort (never-throw inside helper).",
  "    const actorRole =",
  "      user.role || (user.isPlatformAdmin ? 'platform_admin' : 'admin')",
  "    await logLeadAdminAction({",
  "      supabase,",
  "      tenantId: lead.tenant_id,",
  "      leadId: lead.id,",
  "      actorAgentId: user.agentId || null,",
  "      actorRole,",
  "      actionType: action === 'approve' ? 'vip_approved' : 'vip_denied',",
  "      targetField: 'status',",
  "      beforeValue: { status: 'pending' },",
  "      afterValue: {",
  "        status: newStatus,",
  "        vip_request_id: vipRequest.id,",
  "        request_type: vipRequest.request_type,",
  "        request_source: vipRequest.request_source,",
  "        messages_granted: messagesGranted,",
  "      },",
  "      notes: 'VIP request ' + action + 'd from admin workbench',",
  "    })",
  "",
  "    return NextResponse.json({",
  "      success: true,",
  "      vipRequestId: vipRequest.id,",
  "      status: newStatus,",
  "      messagesGranted,",
  "    })",
  "  } catch (error) {",
  "    console.error('[admin-homes/leads/[id]/vip-approve POST] error:', error)",
  "    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })",
  "  }",
  "}",
  "",
  "function buildApprovalEmailHtml(args: {",
  "  isEstimator: boolean",
  "  userName: string",
  "  agentName: string",
  "  messagesGranted: number",
  "  brandName: string",
  "  baseUrl: string",
  "  pageUrl: string | null",
  "}): string {",
  "  const accessLabel = args.isEstimator ? 'Estimator Access' : 'Plan Access'",
  "  const unit = args.isEstimator ? 'estimate' : 'plan'",
  "  const unitPlural = args.messagesGranted > 1 ? unit + 's' : unit",
  "  const userGreeting = args.userName || 'there'",
  "  const sourceLine =",
  "    args.isEstimator && args.pageUrl",
  "      ? '<p style=\"margin: 24px 0 0; text-align: center; color: #cbd5e1; font-size: 10px;\">Source: <a href=\"' +",
  "        args.pageUrl +",
  "        '\" style=\"color: #94a3b8; text-decoration: underline;\">' +",
  "        args.pageUrl +",
  "        '</a></p>'",
  "      : ''",
  "",
  "  return [",
  "    '<div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">',",
  "    '  <div style=\"background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;\">',",
  "    '    <div style=\"font-size: 48px; margin-bottom: 12px;\">\\u2728</div>',",
  "    '    <h1 style=\"color: white; margin: 0; font-size: 24px;\">' + accessLabel + ' Approved</h1>',",
  "    '    <p style=\"color: rgba(255,255,255,0.5); margin: 8px 0 0;\">' + args.brandName + ' AI Real Estate</p>',",
  "    '  </div>',",
  "    '  <div style=\"background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;\">',",
  "    '    <p style=\"color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;\">Hi ' + userGreeting + ',</p>',",
  "    '    <p style=\"color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;\"><strong>' + args.agentName + '</strong> has approved your request. You now have <strong>' + args.messagesGranted + ' additional ' + unitPlural + '</strong> available on ' + args.brandName + '.</p>',",
  "    '    <div style=\"text-align: center;\">',",
  "    '      <a href=\"' + args.baseUrl + '\" style=\"display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;\">Back to ' + args.brandName + '</a>',",
  "    '    </div>',",
  "    sourceLine,",
  "    '  </div>',",
  "    '</div>',",
  "  ].join('')",
  "}",
  "",
].join('\n')

// ============================================================================
// NEW FILE 2: components/admin-homes/lead-workbench/VipRequestsTab.tsx
// ============================================================================

const TAB_CONTENT = [
  "'use client'",
  "",
  "// components/admin-homes/lead-workbench/VipRequestsTab.tsx",
  "// W-LEADS-WORKBENCH W4f (2026-05-14)",
  "//",
  "// Lists vip_requests rows for the lead family. Per-card Approve/Deny buttons",
  "// for pending rows. Optimistic state update: action mutates local state",
  "// immediately, then POSTs to /api/admin-homes/leads/[id]/vip-approve. On",
  "// success: keep optimistic state. On error: revert + show error.",
  "//",
  "// FILTER UX",
  "//   Status chips: all / pending / approved / denied / expired. Counts per chip.",
  "//",
  "// CARD UX",
  "//   - Status badge + request type + source",
  "//   - Phone / name / email",
  "//   - Created / expires dates",
  "//   - Expandable detail (budget, timeline, buyer_type, requirements, page_url, building_name)",
  "//   - Footer: Approve / Deny buttons (pending only)",
  "",
  "import { useState, useMemo } from 'react'",
  "",
  "export interface VipRequestRow {",
  "  id: string",
  "  lead_id: string | null",
  "  tenant_id: string",
  "  agent_id: string | null",
  "  session_id: string | null",
  "  status: string",
  "  request_type: string",
  "  request_source: string | null",
  "  phone: string",
  "  full_name: string | null",
  "  email: string | null",
  "  budget_range: string | null",
  "  timeline: string | null",
  "  buyer_type: string | null",
  "  requirements: string | null",
  "  approval_token: string | null",
  "  page_url: string | null",
  "  building_name: string | null",
  "  messages_granted: number | null",
  "  created_at: string",
  "  responded_at: string | null",
  "  expires_at: string | null",
  "}",
  "",
  "interface Props {",
  "  vipRequests: VipRequestRow[]",
  "  leadFamily: any[]",
  "  anchorLeadId: string",
  "}",
  "",
  "type StatusFilter = 'all' | 'pending' | 'approved' | 'denied' | 'expired'",
  "",
  "const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {",
  "  pending:  { bg: '#fef3c7', fg: '#92400e', label: 'Pending' },",
  "  approved: { bg: '#dcfce7', fg: '#166534', label: 'Approved' },",
  "  denied:   { bg: '#fee2e2', fg: '#991b1b', label: 'Denied' },",
  "  expired:  { bg: '#e5e7eb', fg: '#374151', label: 'Expired' },",
  "}",
  "",
  "const TYPE_LABEL: Record<string, string> = {",
  "  plan:      'Plan',",
  "  chat:      'Chat',",
  "  estimator: 'Estimator',",
  "}",
  "",
  "const SOURCE_LABEL: Record<string, string> = {",
  "  chat:      'Chat',",
  "  estimator: 'Estimator',",
  "}",
  "",
  "function isEffectivelyExpired(row: VipRequestRow): boolean {",
  "  if (row.status !== 'pending') return false",
  "  if (!row.expires_at) return false",
  "  return new Date(row.expires_at).getTime() < Date.now()",
  "}",
  "",
  "export default function VipRequestsTab({ vipRequests, leadFamily, anchorLeadId }: Props) {",
  "  const [filter, setFilter] = useState<StatusFilter>('all')",
  "  const [expanded, setExpanded] = useState<Set<string>>(new Set())",
  "  // Optimistic state -- maps vip_request.id -> override status, on success.",
  "  const [overrides, setOverrides] = useState<Record<string, { status: string; messagesGranted: number | null }>>({})",
  "  const [actionError, setActionError] = useState<string | null>(null)",
  "  const [actionPending, setActionPending] = useState<string | null>(null)  // vip_request.id in flight",
  "",
  "  const rows = useMemo(() => {",
  "    return vipRequests.map((r) => {",
  "      const ov = overrides[r.id]",
  "      const status = ov ? ov.status : (isEffectivelyExpired(r) ? 'expired' : r.status)",
  "      const messagesGranted = ov ? ov.messagesGranted : r.messages_granted",
  "      return { ...r, status, messages_granted: messagesGranted }",
  "    })",
  "  }, [vipRequests, overrides])",
  "",
  "  const counts = useMemo(() => ({",
  "    all:      rows.length,",
  "    pending:  rows.filter((r) => r.status === 'pending').length,",
  "    approved: rows.filter((r) => r.status === 'approved').length,",
  "    denied:   rows.filter((r) => r.status === 'denied').length,",
  "    expired:  rows.filter((r) => r.status === 'expired').length,",
  "  }), [rows])",
  "",
  "  const filteredRows = useMemo(() => {",
  "    if (filter === 'all') return rows",
  "    return rows.filter((r) => r.status === filter)",
  "  }, [rows, filter])",
  "",
  "  function toggleExpand(id: string) {",
  "    setExpanded((prev) => {",
  "      const next = new Set(prev)",
  "      if (next.has(id)) next.delete(id)",
  "      else next.add(id)",
  "      return next",
  "    })",
  "  }",
  "",
  "  async function handleAction(row: VipRequestRow, action: 'approve' | 'deny') {",
  "    if (actionPending) return",
  "    setActionError(null)",
  "    setActionPending(row.id)",
  "    const newStatus = action === 'approve' ? 'approved' : 'denied'",
  "    // Optimistic update first.",
  "    setOverrides((prev) => ({",
  "      ...prev,",
  "      [row.id]: { status: newStatus, messagesGranted: action === 'approve' ? (row.messages_granted ?? null) : 0 },",
  "    }))",
  "    try {",
  "      // Use the lead_id from the row (handles family rows on other leads).",
  "      const leadIdForUrl = row.lead_id || anchorLeadId",
  "      const res = await fetch('/api/admin-homes/leads/' + leadIdForUrl + '/vip-approve', {",
  "        method: 'POST',",
  "        headers: { 'Content-Type': 'application/json' },",
  "        body: JSON.stringify({ vipRequestId: row.id, action }),",
  "      })",
  "      const data = await res.json().catch(() => ({} as any))",
  "      if (!res.ok) {",
  "        // Revert optimistic update.",
  "        setOverrides((prev) => {",
  "          const next = { ...prev }",
  "          delete next[row.id]",
  "          return next",
  "        })",
  "        let msg = (data && data.error) || 'Action failed'",
  "        if (data && data.currentStatus) msg += ' (current: ' + data.currentStatus + ')'",
  "        setActionError(msg)",
  "      } else {",
  "        // Server confirmed -- update optimistic state with server-returned messagesGranted.",
  "        setOverrides((prev) => ({",
  "          ...prev,",
  "          [row.id]: { status: data.status || newStatus, messagesGranted: data.messagesGranted ?? null },",
  "        }))",
  "      }",
  "    } catch (e: any) {",
  "      setOverrides((prev) => {",
  "        const next = { ...prev }",
  "        delete next[row.id]",
  "        return next",
  "      })",
  "      setActionError((e && e.message) || 'Network error')",
  "    } finally {",
  "      setActionPending(null)",
  "    }",
  "  }",
  "",
  "  return (",
  "    <div className=\"space-y-6\">",
  "      <div className=\"flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-gray-200\">",
  "        <div className=\"flex gap-1 flex-wrap\">",
  "          {(['all', 'pending', 'approved', 'denied', 'expired'] as StatusFilter[]).map((f) => (",
  "            <button",
  "              key={f}",
  "              type=\"button\"",
  "              onClick={() => setFilter(f)}",
  "              className={'px-3 py-1.5 text-xs rounded-full border transition-colors ' + (filter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}",
  "            >",
  "              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})",
  "            </button>",
  "          ))}",
  "        </div>",
  "      </div>",
  "",
  "      {actionError && (",
  "        <div className=\"p-3 bg-red-50 border border-red-200 rounded text-sm text-red-900\">",
  "          {actionError}",
  "        </div>",
  "      )}",
  "",
  "      {filteredRows.length === 0 ? (",
  "        <div className=\"text-center py-16 text-gray-400\">",
  "          <div className=\"text-sm font-medium\">",
  "            {vipRequests.length === 0",
  "              ? 'No VIP requests for this lead family yet'",
  "              : 'No VIP requests match this filter'}",
  "          </div>",
  "          <div className=\"text-xs mt-1\">",
  "            {vipRequests.length === 0",
  "              ? 'VIP requests submitted via Charlie or the estimator will appear here.'",
  "              : 'Try a different filter.'}",
  "          </div>",
  "        </div>",
  "      ) : (",
  "        <ul className=\"space-y-2 list-none p-0 m-0\">",
  "          {filteredRows.map((row) => (",
  "            <li key={row.id}>",
  "              <VipRequestCard",
  "                row={row}",
  "                leadFamily={leadFamily}",
  "                anchorLeadId={anchorLeadId}",
  "                expanded={expanded.has(row.id)}",
  "                onToggle={() => toggleExpand(row.id)}",
  "                onAction={(action) => handleAction(row, action)}",
  "                pending={actionPending === row.id}",
  "                disabled={actionPending !== null && actionPending !== row.id}",
  "              />",
  "            </li>",
  "          ))}",
  "        </ul>",
  "      )}",
  "    </div>",
  "  )",
  "}",
  "",
  "function VipRequestCard({",
  "  row, leadFamily, anchorLeadId, expanded, onToggle, onAction, pending, disabled,",
  "}: {",
  "  row: VipRequestRow",
  "  leadFamily: any[]",
  "  anchorLeadId: string",
  "  expanded: boolean",
  "  onToggle: () => void",
  "  onAction: (action: 'approve' | 'deny') => void",
  "  pending: boolean",
  "  disabled: boolean",
  "}) {",
  "  const badge = STATUS_BADGE[row.status] || { bg: '#e5e7eb', fg: '#374151', label: row.status }",
  "  const typeLabel = TYPE_LABEL[row.request_type] || row.request_type",
  "  const sourceLabel = row.request_source ? (SOURCE_LABEL[row.request_source] || row.request_source) : null",
  "  const createdStr = new Date(row.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })",
  "  const expiresStr = row.expires_at ? new Date(row.expires_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : null",
  "  const targetLead = leadFamily.find((l: any) => l.id === row.lead_id)",
  "  const isOtherLead = row.lead_id !== anchorLeadId && leadFamily.length > 1",
  "",
  "  return (",
  "    <div className=\"bg-white border border-slate-200 rounded-lg overflow-hidden\">",
  "      <button",
  "        type=\"button\"",
  "        onClick={onToggle}",
  "        className=\"w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50 transition-colors bg-transparent border-0 cursor-pointer\"",
  "      >",
  "        <div className=\"flex-shrink-0 w-8 h-8 rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center text-base\">",
  "          {'\\u2728'}",
  "        </div>",
  "        <div className=\"flex-1 min-w-0\">",
  "          <div className=\"flex items-center justify-between gap-2 flex-wrap\">",
  "            <div className=\"text-sm font-medium text-slate-900\">",
  "              {typeLabel}{sourceLabel ? ' \\u00b7 ' + sourceLabel : ''}",
  "            </div>",
  "            <div className=\"flex items-center gap-2\">",
  "              <span",
  "                className=\"text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap\"",
  "                style={{ backgroundColor: badge.bg, color: badge.fg }}",
  "              >",
  "                {badge.label}",
  "              </span>",
  "              <span className=\"text-xs text-slate-400 whitespace-nowrap\">{createdStr}</span>",
  "            </div>",
  "          </div>",
  "          <div className=\"text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3\">",
  "            <span className=\"font-mono\">{row.phone}</span>",
  "            {row.full_name && <span>{row.full_name}</span>}",
  "            {row.email && <span className=\"font-mono\">{row.email}</span>}",
  "            {expiresStr && row.status === 'pending' && (",
  "              <span className=\"text-slate-400\">expires {expiresStr}</span>",
  "            )}",
  "            {isOtherLead && targetLead && (",
  "              <span className=\"text-slate-400\">on lead: {targetLead.source || 'unknown'}</span>",
  "            )}",
  "          </div>",
  "        </div>",
  "        <span className=\"flex-shrink-0 text-slate-400 text-xs\">{expanded ? '\\u25BE' : '\\u25B8'}</span>",
  "      </button>",
  "      {expanded && (",
  "        <div className=\"border-t border-slate-100 px-3 py-3 bg-slate-50 space-y-3\">",
  "          <dl className=\"grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs\">",
  "            {row.budget_range && <DetailField label=\"Budget\" value={row.budget_range} />}",
  "            {row.timeline && <DetailField label=\"Timeline\" value={row.timeline} />}",
  "            {row.buyer_type && <DetailField label=\"Type\" value={row.buyer_type} />}",
  "            {row.building_name && <DetailField label=\"Building\" value={row.building_name} />}",
  "            {expiresStr && <DetailField label=\"Expires\" value={expiresStr} />}",
  "            {row.messages_granted != null && (",
  "              <DetailField label=\"Messages granted\" value={String(row.messages_granted)} />",
  "            )}",
  "          </dl>",
  "          {row.requirements && (",
  "            <div>",
  "              <div className=\"text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1\">Requirements</div>",
  "              <div className=\"text-xs text-slate-700 whitespace-pre-wrap bg-white border border-slate-200 rounded p-2\">",
  "                {row.requirements}",
  "              </div>",
  "            </div>",
  "          )}",
  "          {row.page_url && (",
  "            <div>",
  "              <div className=\"text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1\">Page URL</div>",
  "              <a href={row.page_url} target=\"_blank\" rel=\"noopener noreferrer\" className=\"text-xs text-blue-600 hover:underline break-all\">",
  "                {row.page_url}",
  "              </a>",
  "            </div>",
  "          )}",
  "          {row.status === 'pending' && (",
  "            <div className=\"flex items-center justify-end gap-2 pt-2 border-t border-slate-200\">",
  "              <button",
  "                type=\"button\"",
  "                onClick={(e) => { e.stopPropagation(); onAction('deny') }}",
  "                disabled={pending || disabled}",
  "                className=\"px-3 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed\"",
  "              >",
  "                {pending ? 'Working\\u2026' : 'Deny'}",
  "              </button>",
  "              <button",
  "                type=\"button\"",
  "                onClick={(e) => { e.stopPropagation(); onAction('approve') }}",
  "                disabled={pending || disabled}",
  "                className=\"px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed\"",
  "              >",
  "                {pending ? 'Working\\u2026' : 'Approve'}",
  "              </button>",
  "            </div>",
  "          )}",
  "        </div>",
  "      )}",
  "    </div>",
  "  )",
  "}",
  "",
  "function DetailField({ label, value }: { label: string; value: string }) {",
  "  return (",
  "    <div>",
  "      <dt className=\"text-slate-400\">{label}</dt>",
  "      <dd className=\"text-slate-700\">{value}</dd>",
  "    </div>",
  "  )",
  "}",
  "",
].join('\n')

// ============================================================================
// PATCH 1: app/admin-homes/leads/[id]/page.tsx
//   - Add vipRequests prefetch into the existing Promise.all
//   - Add vipRequests prop to LeadWorkbenchClient call
// ============================================================================

const PAGE_NL = PAGE_LE === 'crlf' ? '\r\n' : '\n'

let pageText = fs.readFileSync(PATH_PAGE, 'utf8')

// Anchor 1: extend the Promise.all destructure to include emailLogResult AND vipRequestsResult.
const PAGE_A1_OLD = "    const [activitiesResult, actionsResult, emailLogResult] = await Promise.all(["
const PAGE_A1_NEW = "    const [activitiesResult, actionsResult, emailLogResult, vipRequestsResult] = await Promise.all(["

// Anchor 2: extend the parallel-query block by adding a 4th promise. We anchor on
// the closing of the third Promise.resolve fallback that ends the emailLog branch.
// The exact text from disk (lines 178-189):
const PAGE_A2_OLD = [
  "      familyIds.length > 0",
  "        ? supabase",
  "            .from('lead_email_recipients_log')",
  "            .select('id, lead_id, tenant_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key, resend_message_id, status, sent_at, delivered_at, bounced_at, created_at')",
  "            .in('lead_id', familyIds)",
  "            .eq('tenant_id', tenantIdForActivity)",
  "            .order('created_at', { ascending: false })",
  "            .limit(500)",
  "        : Promise.resolve({ data: [] as any[] }),",
  "    ])",
].join(PAGE_NL)

const PAGE_A2_NEW = [
  "      familyIds.length > 0",
  "        ? supabase",
  "            .from('lead_email_recipients_log')",
  "            .select('id, lead_id, tenant_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key, resend_message_id, status, sent_at, delivered_at, bounced_at, created_at')",
  "            .in('lead_id', familyIds)",
  "            .eq('tenant_id', tenantIdForActivity)",
  "            .order('created_at', { ascending: false })",
  "            .limit(500)",
  "        : Promise.resolve({ data: [] as any[] }),",
  "      familyIds.length > 0",
  "        ? supabase",
  "            .from('vip_requests')",
  "            .select('id, lead_id, tenant_id, agent_id, session_id, status, request_type, request_source, phone, full_name, email, budget_range, timeline, buyer_type, requirements, approval_token, page_url, building_name, messages_granted, created_at, responded_at, expires_at')",
  "            .in('lead_id', familyIds)",
  "            .eq('tenant_id', tenantIdForActivity)",
  "            .order('created_at', { ascending: false })",
  "            .limit(500)",
  "        : Promise.resolve({ data: [] as any[] }),",
  "    ])",
].join(PAGE_NL)

// Anchor 3: write vipRequests outside the if-block (declare alongside activityFeed + emailLog).
// We append "let vipRequests" alongside the existing two let-declarations.
const PAGE_A3_OLD = [
  "  let activityFeed: any[] = []",
  "  let emailLog: any[] = []",
].join(PAGE_NL)

const PAGE_A3_NEW = [
  "  let activityFeed: any[] = []",
  "  let emailLog: any[] = []",
  "  let vipRequests: any[] = []",
].join(PAGE_NL)

// Anchor 4: assign vipRequests after emailLog inside the if-block.
const PAGE_A4_OLD = "    emailLog = (emailLogResult.data as any[]) || []"
const PAGE_A4_NEW = [
  "    emailLog = (emailLogResult.data as any[]) || []",
  "    vipRequests = (vipRequestsResult.data as any[]) || []",
].join(PAGE_NL)

// Anchor 5: pass vipRequests as a prop to LeadWorkbenchClient.
const PAGE_A5_OLD = [
  "      activityFeed={activityFeed}",
  "      emailLog={emailLog}",
  "    />",
].join(PAGE_NL)

const PAGE_A5_NEW = [
  "      activityFeed={activityFeed}",
  "      emailLog={emailLog}",
  "      vipRequests={vipRequests}",
  "    />",
].join(PAGE_NL)

const pageAnchors = [
  { name: 'PAGE_A1 destructure', old: PAGE_A1_OLD, new: PAGE_A1_NEW },
  { name: 'PAGE_A2 promise + close',    old: PAGE_A2_OLD, new: PAGE_A2_NEW },
  { name: 'PAGE_A3 declaration', old: PAGE_A3_OLD, new: PAGE_A3_NEW },
  { name: 'PAGE_A4 assignment',  old: PAGE_A4_OLD, new: PAGE_A4_NEW },
  { name: 'PAGE_A5 prop pass',   old: PAGE_A5_OLD, new: PAGE_A5_NEW },
]

for (const a of pageAnchors) {
  const count = pageText.split(a.old).length - 1
  if (count !== 1) {
    throw new Error('page.tsx anchor "' + a.name + '" found ' + count + ' times (expected 1)')
  }
}
for (const a of pageAnchors) {
  pageText = pageText.replace(a.old, a.new)
}

// ============================================================================
// PATCH 2: app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx
//   - Import VipRequestsTab
//   - Add vipRequests to Props
//   - Destructure vipRequests in component params
//   - Add tab === 'vip' dispatch branch (currently falls through to PlaceholderTab)
// ============================================================================

const CLIENT_NL = CLIENT_LE === 'crlf' ? '\r\n' : '\n'

let clientText = fs.readFileSync(PATH_CLIENT, 'utf8')

// Anchor 1: extend imports.
const CLIENT_A1_OLD = "import EmailsTab, { EmailLogRow } from '@/components/admin-homes/lead-workbench/EmailsTab'"
const CLIENT_A1_NEW = [
  "import EmailsTab, { EmailLogRow } from '@/components/admin-homes/lead-workbench/EmailsTab'",
  "import VipRequestsTab, { VipRequestRow } from '@/components/admin-homes/lead-workbench/VipRequestsTab'",
].join(CLIENT_NL)

// Anchor 2: extend Props.
const CLIENT_A2_OLD = [
  "  activityFeed: ActivityFeedItem[]",
  "  emailLog: EmailLogRow[]",
  "}",
].join(CLIENT_NL)

const CLIENT_A2_NEW = [
  "  activityFeed: ActivityFeedItem[]",
  "  emailLog: EmailLogRow[]",
  "  vipRequests: VipRequestRow[]",
  "}",
].join(CLIENT_NL)

// Anchor 3: extend component params destructuring.
const CLIENT_A3_OLD = "export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser, activityFeed, emailLog }: Props) {"
const CLIENT_A3_NEW = "export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser, activityFeed, emailLog, vipRequests }: Props) {"

// Anchor 4: add tab === 'vip' branch before the PlaceholderTab fallthrough.
const CLIENT_A4_OLD = [
  "        ) : tab === 'emails' ? (",
  "          <EmailsTab emailLog={emailLog} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />",
  "        ) : (",
  "          <PlaceholderTab name={activeTabMeta.label} phase={activeTabMeta.phase} />",
  "        )}",
].join(CLIENT_NL)

const CLIENT_A4_NEW = [
  "        ) : tab === 'emails' ? (",
  "          <EmailsTab emailLog={emailLog} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />",
  "        ) : tab === 'vip' ? (",
  "          <VipRequestsTab vipRequests={vipRequests} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />",
  "        ) : (",
  "          <PlaceholderTab name={activeTabMeta.label} phase={activeTabMeta.phase} />",
  "        )}",
].join(CLIENT_NL)

const clientAnchors = [
  { name: 'CLIENT_A1 import',       old: CLIENT_A1_OLD, new: CLIENT_A1_NEW },
  { name: 'CLIENT_A2 Props',        old: CLIENT_A2_OLD, new: CLIENT_A2_NEW },
  { name: 'CLIENT_A3 destructure',  old: CLIENT_A3_OLD, new: CLIENT_A3_NEW },
  { name: 'CLIENT_A4 dispatch',     old: CLIENT_A4_OLD, new: CLIENT_A4_NEW },
]

for (const a of clientAnchors) {
  const count = clientText.split(a.old).length - 1
  if (count !== 1) {
    throw new Error('LeadWorkbenchClient.tsx anchor "' + a.name + '" found ' + count + ' times (expected 1)')
  }
}
for (const a of clientAnchors) {
  clientText = clientText.replace(a.old, a.new)
}

// ============================================================================
// POST-PATCH VALIDATION (before any write)
// ============================================================================

// Ensure markers are present.
if (pageText.indexOf('vipRequestsResult') === -1) throw new Error('page.tsx missing vipRequestsResult marker after patch')
if (pageText.indexOf("from('vip_requests')") === -1) throw new Error('page.tsx missing vip_requests query after patch')
if (pageText.indexOf('vipRequests={vipRequests}') === -1) throw new Error('page.tsx missing vipRequests prop pass after patch')
if (clientText.indexOf('VipRequestsTab') === -1) throw new Error('LeadWorkbenchClient.tsx missing VipRequestsTab import after patch')
if (clientText.indexOf("tab === 'vip'") === -1) throw new Error('LeadWorkbenchClient.tsx missing vip dispatch after patch')

// LE preservation.
if (PAGE_LE === 'lf' && pageText.indexOf('\r\n') !== -1) throw new Error('CRLF introduced into LF page.tsx')
if (CLIENT_LE === 'lf' && clientText.indexOf('\r\n') !== -1) throw new Error('CRLF introduced into LF LeadWorkbenchClient.tsx')

// ============================================================================
// WRITES (backups for existing files only; new files written fresh)
// ============================================================================

fs.copyFileSync(PATH_PAGE, PATH_PAGE + '.backup_' + stamp)
fs.copyFileSync(PATH_CLIENT, PATH_CLIENT + '.backup_' + stamp)

fs.mkdirSync(path.dirname(PATH_ROUTE), { recursive: true })
fs.mkdirSync(path.dirname(PATH_TAB), { recursive: true })

fs.writeFileSync(PATH_ROUTE, ROUTE_CONTENT, 'utf8')
fs.writeFileSync(PATH_TAB, TAB_CONTENT, 'utf8')
fs.writeFileSync(PATH_PAGE, pageText, 'utf8')
fs.writeFileSync(PATH_CLIENT, clientText, 'utf8')

// Post-write LE re-verify.
const postPageLE = detectLE(PATH_PAGE)
const postClientLE = detectLE(PATH_CLIENT)
if (postPageLE !== PAGE_LE) {
  throw new Error('LE drift on page.tsx after write: was ' + PAGE_LE + ', now ' + postPageLE)
}
if (postClientLE !== CLIENT_LE) {
  throw new Error('LE drift on LeadWorkbenchClient.tsx after write: was ' + CLIENT_LE + ', now ' + postClientLE)
}

console.log('')
console.log('W4f patch applied successfully.')
console.log('')
console.log('  CREATED:')
console.log('    + ' + PATH_ROUTE)
console.log('    + ' + PATH_TAB)
console.log('  MODIFIED:')
console.log('    ~ ' + PATH_PAGE + '  (backup: page.tsx.backup_' + stamp + ')')
console.log('    ~ ' + PATH_CLIENT + '  (backup: LeadWorkbenchClient.tsx.backup_' + stamp + ')')
console.log('')
console.log('Next:')
console.log('  1. npx tsc --noEmit')
console.log('  2. npm run dev  (DEV_TENANT_DOMAIN=walliam.ca in .env.local)')
console.log('  3. Open http://localhost:3000/admin-homes/leads/<lead-id-with-vip-requests>')
console.log('  4. Click VIP Requests tab; verify rows render; click Approve on a pending row.')
console.log('  5. Verify lead_admin_actions has new vip_approved row + vip_requests.status flipped.')
console.log('  6. Commit + push.')
console.log('  7. Run tracker update (separate step).')