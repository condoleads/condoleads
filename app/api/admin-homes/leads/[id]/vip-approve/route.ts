// app/api/admin-homes/leads/[id]/vip-approve/route.ts
// W-LEADS-WORKBENCH W4f (2026-05-14) -- migrated to shared helper in W5c-4b (2026-05-15).
//
// POST endpoint for admin-side approve/deny of a VIP request bound to a lead.
//
// MULTITENANT CONTRACT (Rule Zero #1)
//   - Tenant boundary is lead.tenant_id (NOT user.tenantId).
//   - vip_requests fetched with WHERE id = vipRequestId AND tenant_id = lead.tenant_id
//     AND lead_id = lead.id (triple gate -- no cross-tenant or cross-lead approval).
//   - can('lead.write') enforces user's permission to act on this lead.
//
// REQUEST BODY
//   { vipRequestId: string (uuid), action: 'approve' | 'deny' }
//
// SIDE EFFECTS (delegated to lib/admin-homes/approve-vip-request)
//   - vip_requests status flip + responded_at + messages_granted
//   - chat_sessions VIP upgrade (gated on session_id; W4f safer pattern)
//   - user_credit_overrides UPSERT (estimator-only for request_type='estimator';
//     all 3 pools otherwise)
//   - Confirmation email (estimator: BCC chain + manager CC, fail-OPEN on
//     AdminPlatformUnreachable; plan/chat: TO only)
//   - Audit via lead_admin_actions (action_type='vip_approved' | 'vip_denied')
//
// IDEMPOTENCY
//   - status !== 'pending' returns 409 with current status
//   - expires_at < now returns 410 (marks row 'expired' first)
//
// W5c-4b PRESERVED BEHAVIOR (verbatim against pre-migration route)
//   - HTTP status codes for every error path (401/403/404/409/410/400/500).
//   - Triple-gate vip_requests SELECT shape, including agents join with
//     parent_id + ai_manual_approve_limit (needed by helper for manager CC
//     and plan/chat grant-amount fallback).
//   - actorRole resolution chain: user.role || (isPlatformAdmin ? 'platform_admin' : 'admin')
//   - Audit notes string: 'VIP request <action>d from admin workbench'.
//   - Helper passes estimatorBccFailurePolicy='fail-open' (preserves W4f's
//     log-and-continue posture for BCC fetch failures).
//   - Helper passes creditGrantNotePrefix='Admin approve --' (preserves W4f's
//     pre-migration audit-log wording for user_credit_overrides.note).
//   - Helper passes userId=lead.user_id (preserves W4f's lead-bound user
//     source, not chat_sessions.user_id which legacy walliam routes use).
//
// W5c-4b SMALL BEHAVIOR DELTA (documented, acceptable)
//   - Brand context (getTenantContext + buildBaseUrl) now resolved
//     unconditionally before the helper call. Pre-migration code resolved
//     brand only inside the `if (vipRequest.email)` block. New behavior:
//     one extra DB hit on denies and on approves where vipRequest.email is
//     null. No user-facing impact; helper signature requires brand as a
//     mandatory param.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'
import { getTenantContext, buildBaseUrl } from '@/lib/utils/tenant-brand'
import {
  approveVipRequest,
  type VipRequestWithJoins,
} from '@/lib/admin-homes/approve-vip-request'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await resolveAdminHomesUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()

    // Fetch lead -- the lead's tenant_id is the trust boundary.
    const { data: lead } = await supabase
      .from('leads')
      .select('id, tenant_id, agent_id, user_id, contact_email')
      .eq('id', params.id)
      .maybeSingle()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const decision = can(user.permissions, 'lead.write', {
      kind: 'lead',
      leadId: lead.id,
      tenantId: lead.tenant_id,
      agentId: lead.agent_id,
    })
    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.reason },
        { status: decision.status },
      )
    }

    // Parse and validate body.
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const vipRequestId =
      typeof body?.vipRequestId === 'string' ? body.vipRequestId : ''
    const action = typeof body?.action === 'string' ? body.action : ''
    if (!vipRequestId) {
      return NextResponse.json(
        { error: 'vipRequestId is required' },
        { status: 400 },
      )
    }
    if (action !== 'approve' && action !== 'deny') {
      return NextResponse.json(
        { error: "action must be 'approve' or 'deny'" },
        { status: 400 },
      )
    }

    // Triple gate: id + tenant + lead binding. Prevents cross-tenant or cross-lead approval.
    const { data: vipRequest } = await supabase
      .from('vip_requests')
      .select(
        '*, chat_sessions(*), agents(full_name, email, notification_email, parent_id, ai_manual_approve_limit)',
      )
      .eq('id', vipRequestId)
      .eq('tenant_id', lead.tenant_id)
      .eq('lead_id', lead.id)
      .maybeSingle()

    if (!vipRequest) {
      return NextResponse.json(
        { error: 'VIP request not found for this lead' },
        { status: 404 },
      )
    }

    if (vipRequest.status !== 'pending') {
      return NextResponse.json(
        {
          error: 'VIP request is not pending',
          currentStatus: vipRequest.status,
        },
        { status: 409 },
      )
    }

    if (new Date(vipRequest.expires_at) < new Date()) {
      await supabase
        .from('vip_requests')
        .update({ status: 'expired' })
        .eq('id', vipRequest.id)
      return NextResponse.json(
        { error: 'VIP request has expired' },
        { status: 410 },
      )
    }

    // Brand context -- resolved unconditionally before the helper call.
    // (Pre-migration code resolved brand only inside the email block;
    // helper signature requires brand as a mandatory param so we resolve
    // upfront. One extra DB call on denies + emailless approves.)
    const brandCtx = await getTenantContext(supabase, lead.tenant_id)
    const brand = {
      brandName: brandCtx?.brandName || '',
      domain: brandCtx?.domain || '',
      baseUrl: brandCtx?.domain ? buildBaseUrl(brandCtx.domain) : '',
    }

    const actorRole =
      user.role || (user.isPlatformAdmin ? 'platform_admin' : 'admin')

    const result = await approveVipRequest({
      supabase,
      tenantId: lead.tenant_id,
      vipRequest: vipRequest as unknown as VipRequestWithJoins,
      action,
      brand,
      userId: lead.user_id ?? null,
      creditGrantNotePrefix: 'Admin approve --',
      estimatorBccFailurePolicy: 'fail-open',
      audit: {
        leadId: lead.id,
        actorAgentId: user.agentId || null,
        actorRole,
        notes: 'VIP request ' + action + 'd from admin workbench',
      },
    })

    if (!result.ok) {
      // Defensive: admin-homes uses estimatorBccFailurePolicy='fail-open' so
      // the helper should never return ok:false. If this branch fires
      // (helper bug or future param change), the approve DID land at the
      // data layer (vip_requests + chat_sessions + credits persisted +
      // audit row written) but the confirmation email was suppressed.
      // Surface 500 with partialSuccess info so the UI can communicate.
      console.error(
        '[admin-homes vip-approve] unexpected ok:false from helper:',
        result,
      )
      return NextResponse.json(
        {
          error: 'Approval recorded but confirmation email could not be sent',
          partialSuccess: result.partialSuccess,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      vipRequestId: vipRequest.id,
      status: result.status,
      messagesGranted: result.messagesGranted,
    })
  } catch (error) {
    console.error('[admin-homes/leads/[id]/vip-approve POST] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}