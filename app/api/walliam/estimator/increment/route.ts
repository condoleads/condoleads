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
    // C1/D1 -- auth gate validates chat session source against the tenant source_key
    // (was: hardcoded literal source comparison which blocked all non-WALLiam tenants)
    const { data: session, error: fetchError } = await supabase
      .from('chat_sessions')
      .select('estimator_count, user_id, source, tenant_id')
      .eq('id', sessionId)
      .single()

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    if (!session.user_id || !session.tenant_id) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // C1/D1 -- resolve tenant source_key and require session.source match
    const { data: tenantRow, error: tenantErr } = await supabase
      .from('tenants')
      .select('source_key')
      .eq('id', session.tenant_id)
      .single()
    if (tenantErr || !tenantRow || !tenantRow.source_key) {
      console.error('[walliam/estimator/increment] tenant source_key fetch failed:', tenantErr)
      return NextResponse.json({ error: 'Invalid tenant' }, { status: 400 })
    }
    if (session.source !== tenantRow.source_key) {
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