// app/api/walliam/tenant-config/route.ts
// Returns tenant credit config for anonymous users (unregistered view)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('ai_free_messages, estimator_free_attempts, plan_free_attempts')
    .eq('id', tenantId)
    .single()

  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  return NextResponse.json({
    chatFree:  tenant.ai_free_messages ?? 1,
    estFree:   tenant.estimator_free_attempts ?? 2,
    planFree:  tenant.plan_free_attempts ?? 1,
  })
}