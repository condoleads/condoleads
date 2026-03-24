// app/api/walliam/estimator/session/route.ts
// Initializes or retrieves a WALLiam estimator session
// Config comes from TENANT not agent — agent is for lead routing only
// System 1 (app/api/estimator/session/route.ts) is NEVER touched

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  try {
    const { userId, buildingId, listingId, communityId, municipalityId, areaId } = await request.json()
    const tenantId = request.headers.get('x-tenant-id') || null

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 })
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Step 1: Load tenant estimator config
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select(`
        estimator_nonai_enabled,
        estimator_free_attempts,
        estimator_auto_approve_attempts,
        estimator_manual_approve_attempts,
        estimator_hard_cap,
        estimator_vip_auto_approve,
        anthropic_api_key
      `)
      .eq('id', tenantId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    if (!tenant.estimator_nonai_enabled) {
      return NextResponse.json({ error: 'Estimator is not enabled for this tenant' }, { status: 403 })
    }

    // Step 2: Resolve agent via priority chain (for lead routing only)
    const { data: resolvedAgentId } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: listingId || null,
      p_building_id: buildingId || null,
      p_community_id: communityId || null,
      p_municipality_id: municipalityId || null,
      p_area_id: areaId || null,
      p_user_id: userId || null,
    })
    const agentId = resolvedAgentId || null

    // Get agent name for display only
    let agentName = 'WALLiam'
    if (agentId) {
      const { data: agent } = await supabase
        .from('agents')
        .select('full_name')
        .eq('id', agentId)
        .single()
      if (agent) agentName = agent.full_name
    }

    // Step 3: Find existing active session for this user + tenant
    let session = null
    const { data: existing } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('source', 'walliam')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .in('status', ['active', 'vip'])
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .single()

    session = existing || null

    // Step 4: Create new session if none exists
    if (!session) {
      const { data: newSession, error: createError } = await supabase
        .from('chat_sessions')
        .insert({
          agent_id: agentId,
          user_id: userId,
          tenant_id: tenantId,
          source: 'walliam',
          session_token: crypto.randomUUID(),
          status: 'active',
          message_count: 0,
          estimator_count: 0,
          total_ai_usage: 0,
          manual_approvals_count: 0,
          current_page_type: buildingId ? 'building' : listingId ? 'listing' : null,
          current_page_id: buildingId || listingId || null,
        })
        .select()
        .single()

      if (createError || !newSession) {
        console.error('[walliam/estimator/session] create error:', createError)
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
      }
      session = newSession
    }

    // Step 5: Check VIP request status for this session
    const { data: vipRequest } = await supabase
      .from('vip_requests')
      .select('id, status, buyer_type, messages_granted')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const questionnaireCompleted = !!(vipRequest?.buyer_type)
    const vipRequestStatus = vipRequest?.status || 'idle'
    const vipRequestId = vipRequest?.id || null

    // Step 6: Calculate usage and allowance from tenant config
    const freePlans = tenant.estimator_free_attempts ?? 1
    const isVip = session.status === 'vip'
    const manualApprovalsCount = session.manual_approvals_count || 0
    const estimatorCount = session.estimator_count || 0

    let totalAllowed = freePlans
    if (isVip) {
      totalAllowed += tenant.estimator_auto_approve_attempts ?? 2
      totalAllowed += (tenant.estimator_manual_approve_attempts ?? 3) * manualApprovalsCount
    }
    totalAllowed = Math.min(totalAllowed, tenant.estimator_hard_cap ?? 10)

    const remaining = Math.max(0, totalAllowed - estimatorCount)
    const allowed = remaining > 0

    // Determine action
    let action: 'allow' | 'show_questionnaire' | 'request_approval' | 'blocked' = 'allow'
    if (!allowed) {
      if (estimatorCount >= (tenant.estimator_hard_cap ?? 10)) {
        action = 'blocked'
      } else if (vipRequestStatus === 'approved' && !questionnaireCompleted) {
        action = 'show_questionnaire'
      } else {
        action = 'request_approval'
      }
    }

    return NextResponse.json({
      sessionId: session.id,
      agentId,
      agentName,
      status: session.status,
      allowed,
      action,
      currentUsage: estimatorCount,
      totalAllowed,
      remaining,
      questionnaireCompleted,
      vipRequestStatus,
      vipRequestId,
      vipAutoApprove: tenant.estimator_vip_auto_approve ?? false,
      estimatorEnabled: tenant.estimator_nonai_enabled,
    })

  } catch (error) {
    console.error('[walliam/estimator/session] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}