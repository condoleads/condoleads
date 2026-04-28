// app/api/walliam/estimator/increment/route.ts
// Increments estimator_count on chat_sessions after a successful estimate
// System 1 (app/api/estimator/increment/route.ts) is NEVER touched

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
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const supabase = createServiceClient()

    // W-RECOVERY A1.5 auth gate — fetch session AND verify it belongs to a registered walliam user
    const { data: session, error: fetchError } = await supabase
      .from('chat_sessions')
      .select('estimator_count, user_id, source')
      .eq('id', sessionId)
      .single()

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    if (!session.user_id || session.source !== 'walliam') {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    // END W-RECOVERY A1.5 auth gate

    const newCount = (session.estimator_count || 0) + 1

    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({
        estimator_count: newCount,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, estimatorCount: newCount })

  } catch (error) {
    console.error('[walliam/estimator/increment] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}