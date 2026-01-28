// app/api/estimator/increment/route.ts
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
    const { sessionId, useSharedPool } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Get current session
    const { data: session, error: fetchError } = await supabase
      .from('chat_sessions')
      .select('estimator_count, total_ai_usage')
      .eq('id', sessionId)
      .single()

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Increment the appropriate counter
    const updates: Record<string, number | string> = {
      estimator_count: (session.estimator_count || 0) + 1,
      last_activity_at: new Date().toISOString()
    }

    // If using shared pool, also increment total_ai_usage
    if (useSharedPool) {
      updates.total_ai_usage = (session.total_ai_usage || 0) + 1
    }

    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update(updates)
      .eq('id', sessionId)

    if (updateError) {
      console.error('Failed to increment usage:', updateError)
      return NextResponse.json({ error: 'Failed to update usage' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      estimatorCount: updates.estimator_count,
      totalAiUsage: updates.total_ai_usage || session.total_ai_usage || 0
    })

  } catch (error) {
    console.error('Estimator increment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}