export const maxDuration = 60

// app/api/walliam/charlie/session/route.ts
// Initializes or retrieves a WALLiam Charlie session for a user
// Resolves agent via resolve_agent_for_context() — NOT getAgentFromHost
// Tracks buyer_plans_used and seller_plans_used (not message_count)
// Adapted from app/api/chat/session/route.ts — System 1 never touched

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
    const {
      userId,          // nullable — anonymous users can still get a session
      listing_id,
      building_id,
      community_id,
      municipality_id,
      area_id,
    } = await request.json()

    console.log("[session] route hit, userId:", userId)
    const tenantId = request.headers.get('x-tenant-id') || null
    const supabase = createServiceClient()

    // Step 1: Resolve agent via priority chain
    console.log("[session] calling rpc")
    const { data: resolvedAgentId, error: resolveError } = await supabase
      .rpc('resolve_agent_for_context', {
        p_listing_id: listing_id || null,
        p_building_id: building_id || null,
        p_community_id: community_id || null,
        p_municipality_id: municipality_id || null,
        p_area_id: area_id || null,
        p_user_id: userId || null,
        p_tenant_id: tenantId || null,
      })

    if (resolveError) {
      console.error('[charlie/session] resolve_agent_for_context error:', resolveError)
    }

    console.log("[session] rpc result:", resolvedAgentId, resolveError)
    const agentId = resolvedAgentId || null

    // Step 2: Get config from tenant (primary) or agent (fallback)
    let agentConfig = {
      ai_free_messages: 1,
      ai_auto_approve_limit: 2,
      ai_manual_approve_limit: 3,
      ai_hard_cap: 10,
      vip_auto_approve: false,
      full_name: 'WALLiam',
    }

    if (tenantId) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select(`name, ai_free_messages, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap, vip_auto_approve, plan_free_attempts, plan_hard_cap, plan_mode, seller_plan_free_attempts, seller_plan_hard_cap, estimator_free_attempts, estimator_hard_cap`)
        .eq('id', tenantId)
        .single()
      if (tenant) {
        agentConfig = {
          ai_free_messages: tenant.ai_free_messages ?? 1,
          ai_auto_approve_limit: tenant.ai_auto_approve_limit ?? 2,
          ai_manual_approve_limit: tenant.ai_manual_approve_limit ?? 3,
          ai_hard_cap: tenant.ai_hard_cap ?? 10,
          vip_auto_approve: tenant.vip_auto_approve ?? false,
          full_name: tenant.name,
        }
      }
    } else if (agentId) {
      const { data: agent } = await supabase
        .from('agents')
        .select(`full_name, ai_free_messages, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap, vip_auto_approve`)
        .eq('id', agentId)
        .single()
      if (agent) {
        agentConfig = {
          ai_free_messages: agent.ai_free_messages ?? 1,
          ai_auto_approve_limit: agent.ai_auto_approve_limit ?? 2,
          ai_manual_approve_limit: agent.ai_manual_approve_limit ?? 3,
          ai_hard_cap: agent.ai_hard_cap ?? 10,
          vip_auto_approve: agent.vip_auto_approve ?? false,
          full_name: agent.full_name,
        }
      }
    }

    if (agentId) {
      const { data: agent } = await supabase
        .from('agents')
        .select(`
          full_name, ai_free_messages, ai_auto_approve_limit,
          ai_manual_approve_limit, ai_hard_cap, vip_auto_approve
        `)
        .eq('id', agentId)
        .single()

      if (agent) {
        agentConfig = {
          ai_free_messages: agent.ai_free_messages ?? 1,
          ai_auto_approve_limit: agent.ai_auto_approve_limit ?? 2,
          ai_manual_approve_limit: agent.ai_manual_approve_limit ?? 3,
          ai_hard_cap: agent.ai_hard_cap ?? 10,
          vip_auto_approve: agent.vip_auto_approve ?? false,
          full_name: agent.full_name,
        }
      }
    }

    // Step 3: Find existing active WALLiam session
    // Match on: agent_id + user_id (if logged in) OR session with same context (anonymous)
    let session = null

    if (userId) {
      const { data: existing } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('source', 'walliam')
        .eq('user_id', userId)
        .eq('agent_id', agentId)
        .in('status', ['active', 'vip'])
        .order('last_activity_at', { ascending: false })
        .limit(1)
        .single()

      session = existing || null
    }

    // Step 4: Create new session if none exists
    if (!session) {
      const { data: newSession, error: createError } = await supabase
        .from('chat_sessions')
        .insert({
          agent_id: agentId,
          user_id: userId || null,
          source: 'walliam',
          session_token: crypto.randomUUID(),
          tenant_id: tenantId,
          status: 'active',
          message_count: 0,
          buyer_plans_used: 0,
          seller_plans_used: 0,
          total_ai_usage: 0,
          manual_approvals_count: 0,
          current_page_type: building_id ? 'building' : listing_id ? 'listing' : null,
          current_page_id: building_id || listing_id || null,
        })
        .select()
        .single()

      if (createError || !newSession) {
        console.error('[charlie/session] create error:', createError)
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
      }

      session = newSession
    }

    // Step 5: Check VIP request status for this session
    const { data: vipRequest } = await supabase
      .from('vip_requests')
      .select('id, status, messages_granted')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const vipRequestStatus = vipRequest?.status || 'idle'
    const vipRequestId = vipRequest?.id || null

    // Step 6: Calculate plan allowance
    // WALLiam unit = plans (not messages)
    // ai_free_messages repurposed as free plans per type (buyer + seller independently)
    const freePlans = agentConfig.ai_free_messages         // e.g. 1
    const manualApprovalsCount = session.manual_approvals_count || 0
    const vipMessagesGranted = session.vip_messages_granted || 0

    // Total allowed = free + auto_approve (if vip) + (manual_approve × approvals)
    const isVip = session.status === 'vip'
    let totalAllowed = freePlans
    if (isVip) {
      totalAllowed += agentConfig.ai_auto_approve_limit
      totalAllowed += agentConfig.ai_manual_approve_limit * manualApprovalsCount
    }
    totalAllowed = Math.min(totalAllowed, agentConfig.ai_hard_cap)

    const buyerPlansUsed = session.buyer_plans_used || 0
    const sellerPlansUsed = session.seller_plans_used || 0

    const buyerAllowed = totalAllowed - buyerPlansUsed > 0
    const sellerAllowed = totalAllowed - sellerPlansUsed > 0

    return NextResponse.json({
      sessionId: session.id,
      resolvedAgentId: agentId,
      agentName: agentConfig.full_name,
      status: session.status,
      // Plan usage
      buyerPlansUsed,
      sellerPlansUsed,
      totalAllowed,
      buyerAllowed,
      sellerAllowed,
      freePlans,
      // VIP
      vipRequestStatus,
      vipRequestId,
      vipAutoApprove: agentConfig.vip_auto_approve,
      // Registration status
      isRegistered: !!userId,
      // Chat credits
      messageCount: session.message_count || 0,
      chatFreeMessages: agentConfig.ai_free_messages,
      chatHardCap: agentConfig.ai_hard_cap,
      // Estimator credits
      estimatorCount: session.estimator_count || 0,
      estimatorFreeAttempts: (agentConfig as any).estimator_free_attempts ?? 2,
      estimatorHardCap: (agentConfig as any).estimator_hard_cap ?? 10,
      // Plan mode
      planMode: (agentConfig as any).plan_mode || 'shared',
      sellerPlanFreeAttempts: (agentConfig as any).seller_plan_free_attempts ?? 1,
    })

  } catch (error) {
    console.error('[charlie/session] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}