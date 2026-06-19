// app/api/walliam/estimator/increment/route.ts
// Increments estimator_count on chat_sessions after a successful estimate
// System 1 (app/api/estimator/increment/route.ts) is NEVER touched

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
// W-CREDIT-BLEED-PHASE1 (2026-06-19): first in-app caller of this helper.
// Reads the request's auth cookie via @supabase/ssr's createServerClient so
// supabase.auth.getUser() validates the JWT and returns the REAL caller
// identity — replacing the prior implicit trust of the body's sessionId.
import { createRouteHandlerClient } from '@/lib/supabase/server'

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

    // W-CREDIT-BLEED-PHASE1 (2026-06-19): caller identity verification.
    // Decode the auth cookie's JWT via createRouteHandlerClient → getUser().
    // FAIL CLOSED: any getUser() error OR missing authUser → 401, never
    // fall through. The session.user_id === authUser.id check happens AFTER
    // we fetch the session row below; the two together prevent user B from
    // incrementing user A's chat_sessions row by passing A's sessionId.
    const authedSupabase = createRouteHandlerClient(request)
    const { data: { user: authUser }, error: authErr } = await authedSupabase.auth.getUser()
    if (authErr || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // W-CREDIT-BLEED-PHASE1 (2026-06-19): the caller-identity match. Prevents
    // user B from bumping user A's estimator_count by passing A's sessionId.
    // Tenant scope check at L43-54 (below) is PRESERVED — multi-tenant
    // isolation is now BOTH tenant-scope AND user-identity gated.
    if (session.user_id !== authUser.id) {
      return NextResponse.json({ error: 'Forbidden — session does not belong to caller' }, { status: 403 })
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