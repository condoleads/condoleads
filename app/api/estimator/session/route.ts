// app/api/estimator/session/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkUsage, getEffectiveLimits } from '@/lib/ai/usage-calculator'
import { AIConfig, SessionUsage } from '@/lib/types/ai-config'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  try {
    const { agentId, userId, buildingId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 })
    }

    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Get agent config
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select(`
        id, full_name,
        ai_chat_enabled, ai_estimator_enabled, vip_auto_approve,
        ai_free_messages, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap,
        estimator_free_attempts, estimator_auto_approve_attempts, estimator_manual_approve_attempts, estimator_hard_cap,
        anthropic_api_key
      `)
      .eq('id', agentId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Check for existing session
    const { data: existingSession } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('agent_id', agentId)
      .eq('user_id', userId)
      .in('status', ['active', 'vip'])
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .single()

    let session = existingSession

    // Create new session if none exists
    if (!session) {
      const sessionToken = crypto.randomUUID()
      const { data: newSession, error: createError } = await supabase
          .from('chat_sessions')
          .insert({
            agent_id: agentId,
            user_id: userId,
            session_token: sessionToken,
            status: 'active',
            message_count: 0,
            estimator_count: 0,
            total_ai_usage: 0,
            manual_approvals_count: 0,
            current_page_type: buildingId ? 'building' : null,
            current_page_id: buildingId || null
          })
        .select()
        .single()

      if (createError || !newSession) {
        console.error('Failed to create session:', createError)
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
      }
      session = newSession
    }

    // Build config and session usage for checkUsage
    const config: Partial<AIConfig> = {
      ai_chat_enabled: agent.ai_chat_enabled,
      ai_estimator_enabled: agent.ai_estimator_enabled,
      vip_auto_approve: agent.vip_auto_approve,
      ai_free_messages: agent.ai_free_messages,
      ai_auto_approve_limit: agent.ai_auto_approve_limit,
      ai_manual_approve_limit: agent.ai_manual_approve_limit,
      ai_hard_cap: agent.ai_hard_cap,
      estimator_free_attempts: agent.estimator_free_attempts,
      estimator_auto_approve_attempts: agent.estimator_auto_approve_attempts,
      estimator_manual_approve_attempts: agent.estimator_manual_approve_attempts,
      estimator_hard_cap: agent.estimator_hard_cap,
    }

    // Check if questionnaire was completed (check vip_requests for this session)
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

    const sessionUsage: SessionUsage = {
      messageCount: session.message_count || 0,
      estimatorCount: session.estimator_count || 0,
      totalAiUsage: session.total_ai_usage || 0,
      manualApprovalsCount: session.manual_approvals_count || 0,
      questionnaireCompleted,
      vipMessagesGranted: session.vip_messages_granted || 0,
      status: session.status || 'active',
    }

    // Check usage
    const usageResult = checkUsage(config, sessionUsage, 'estimator')
    const limits = getEffectiveLimits(config, 'estimator')

    return NextResponse.json({
      sessionId: session.id,
      agentName: agent.full_name,
      status: session.status,
      allowed: usageResult.allowed,
      action: usageResult.action,
      reason: usageResult.reason,
      currentUsage: usageResult.currentUsage,
      totalAllowed: usageResult.totalAllowed,
      remaining: usageResult.remaining,
      questionnaireCompleted,
      vipRequestStatus,
      vipRequestId,
      vipAutoApprove: agent.vip_auto_approve,
      aiEstimatorEnabled: agent.ai_estimator_enabled,
      hasApiKey: !!agent.anthropic_api_key,
      limits: {
        free: limits.free,
        useSharedPool: limits.useSharedPool
      }
    })

  } catch (error) {
    console.error('Estimator session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}