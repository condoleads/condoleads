// app/api/chat/session/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { agentId, userId } = await request.json()
    const supabase = supabaseAdmin
    
    // Verify userId from request body (client already authenticated via ChatWidgetWrapper)
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - no userId provided' },
        { status: 401 }
      )
    }
    
    const user = { id: userId }

    // Check if agent has AI enabled
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('ai_chat_enabled, anthropic_api_key')
      .eq('id', agentId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    if (!agent.ai_chat_enabled || !agent.anthropic_api_key) {
      return NextResponse.json(
        { error: 'AI chat not enabled for this agent' },
        { status: 400 }
      )
    }

    // Try to find existing active session
    const { data: existing } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('agent_id', agentId)
      .eq('user_id', user.id)
      .in('status', ['active', 'vip'])
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .single()

    if (existing) {
      // Get existing messages
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', existing.id)
        .order('created_at', { ascending: true })
        .limit(50)

      return NextResponse.json({
        sessionId: existing.id,
        sessionToken: existing.session_token,
        status: existing.status,
        messageCount: existing.message_count,
        messages: messages || []
      })
    }

    // Create new session
    const sessionToken = crypto.randomUUID()
    const { data: newSession, error: createError } = await supabase
      .from('chat_sessions')
      .insert({
        agent_id: agentId,
        user_id: user.id,
        session_token: sessionToken,
        status: 'active',
        message_count: 0
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating session:', createError)
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      sessionId: newSession.id,
      sessionToken: newSession.session_token,
      status: 'active',
      messageCount: 0,
      messages: []
    })

  } catch (error) {
    console.error('Session API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}