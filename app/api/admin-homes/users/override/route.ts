// app/api/admin-homes/users/override/route.ts
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
  const {
    userId, tenantId, agentId, agentTier, note,
    aiChatLimit, buyerPlanLimit, sellerPlanLimit, estimatorLimit,
  } = await request.json()

  if (!userId || !tenantId) {
    return NextResponse.json({ error: 'userId and tenantId required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch tenant hard caps to enforce ceiling
  const { data: tenant } = await supabase
    .from('tenants')
    .select('ai_hard_cap, plan_hard_cap, seller_plan_hard_cap, estimator_hard_cap')
    .eq('id', tenantId)
    .single()

  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const safeChat      = aiChatLimit     != null ? Math.min(aiChatLimit,     tenant.ai_hard_cap ?? 10)          : null
  const safeBuyer     = buyerPlanLimit  != null ? Math.min(buyerPlanLimit,  tenant.plan_hard_cap ?? 10)        : null
  const safeSeller    = sellerPlanLimit != null ? Math.min(sellerPlanLimit, tenant.seller_plan_hard_cap ?? 10) : null
  const safeEstimator = estimatorLimit  != null ? Math.min(estimatorLimit,  tenant.estimator_hard_cap ?? 10)   : null

  const { data: override, error } = await supabase
    .from('user_credit_overrides')
    .upsert({
      user_id:             userId,
      tenant_id:           tenantId,
      granted_by_agent_id: agentId || null,
      granted_by_tier:     agentTier || null,
      note:                note || null,
      ai_chat_limit:       safeChat,
      buyer_plan_limit:    safeBuyer,
      seller_plan_limit:   safeSeller,
      estimator_limit:     safeEstimator,
      granted_at:          new Date().toISOString(),
    }, { onConflict: 'user_id,tenant_id' })
    .select()
    .single()

  if (error) {
    console.error('[override] upsert error:', error)
    return NextResponse.json({ error: 'Failed to save override' }, { status: 500 })
  }

  return NextResponse.json({ override })
}

export async function DELETE(request: NextRequest) {
  const { userId, tenantId } = await request.json()
  if (!userId || !tenantId) {
    return NextResponse.json({ error: 'userId and tenantId required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('user_credit_overrides')
    .delete()
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}