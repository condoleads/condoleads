// app/api/admin-homes/users/override/route.ts
// Phase 3.4+: auth + tenant + role gate via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAccess } from '@/lib/admin-homes/api-auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, tenantId, agentId, agentTier, note, aiChatLimit, buyerPlanLimit, sellerPlanLimit, estimatorLimit } = body
    if (!userId || !tenantId) {
      return NextResponse.json({ error: 'userId and tenantId required' }, { status: 400 })
    }

    const auth = await requireTenantAccess(tenantId, { allowedRoles: ['admin', 'manager'] })
    if ('error' in auth) return auth.error
    const { supabase } = auth

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('ai_hard_cap, plan_hard_cap, seller_plan_hard_cap, estimator_hard_cap')
      .eq('id', tenantId)
      .single()
    if (tenantError) return NextResponse.json({ error: 'Tenant fetch failed', detail: tenantError.message }, { status: 500 })
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const safeChat      = aiChatLimit     != null ? Math.min(aiChatLimit,     tenant.ai_hard_cap ?? 10)          : null
    const safeBuyer     = buyerPlanLimit  != null ? Math.min(buyerPlanLimit,  tenant.plan_hard_cap ?? 10)        : null
    const safeSeller    = sellerPlanLimit != null ? Math.min(sellerPlanLimit, tenant.seller_plan_hard_cap ?? 10) : null
    const safeEstimator = estimatorLimit  != null ? Math.min(estimatorLimit,  tenant.estimator_hard_cap ?? 10)   : null

    const { data: override, error: upsertError } = await supabase
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
      .maybeSingle()

    if (upsertError) {
      return NextResponse.json({ error: 'Upsert failed', detail: upsertError.message, code: upsertError.code }, { status: 500 })
    }
    return NextResponse.json({ override })
  } catch (e: any) {
    return NextResponse.json({ error: 'Unexpected error', detail: e?.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId, tenantId } = await request.json()
    if (!userId || !tenantId) {
      return NextResponse.json({ error: 'userId and tenantId required' }, { status: 400 })
    }

    const auth = await requireTenantAccess(tenantId, { allowedRoles: ['admin', 'manager'] })
    if ('error' in auth) return auth.error
    const { supabase } = auth

    const { error } = await supabase
      .from('user_credit_overrides')
      .delete()
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: 'Unexpected error', detail: e?.message }, { status: 500 })
  }
}