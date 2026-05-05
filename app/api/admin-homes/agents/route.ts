// app/api/admin-homes/agents/route.ts
// System 2 only — WALLiam comprehensive agents
// GET: list agents for dropdown, POST: create new agent
// System 1 (app/api/admin/agents/) is NEVER touched
import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'

// GET /api/admin-homes/agents — list comprehensive agents, tenant-scoped
// Phase 3.4: Tenant Admin sees only their tenant's agents.
//             Platform Admin without a selected tenant sees all (legacy behavior).
//             Platform Admin with platform_tenant_override cookie (3.7) — handled by tenantId being populated.
export async function GET() {
  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  let query = supabase
    .from('agents')
    .select('id, full_name, email, cell_phone, subdomain, can_create_children, is_active, profile_photo_url, tenant_id, parent_id, notification_email, brokerage_name, title, total_leads')
    .eq('site_type', 'comprehensive')
    .order('full_name')

  // Tenant scoping: only Platform Admin without a selected tenant sees all rows.
  if (!(user.isPlatformAdmin && !user.tenantId)) {
    if (!user.tenantId) {
      return NextResponse.json({ agents: [] })
    }
    query = query.eq('tenant_id', user.tenantId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agents: data || [] })
}

// POST /api/admin-homes/agents — create new comprehensive agent.
// R3.4: gated via can() against ActorPermissionContext.
export async function POST(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const body = await request.json()

  // can() target needs the prospective tenant scope. We read tenant_id from
  // the body before doing the permission check; if absent, fall back to
  // the actor's home tenant (Tenant Admin creating in their own tenant).
  const targetTenantId: string | null = body?.tenant_id ?? user.tenantId
  if (!targetTenantId) {
    return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
  }

  // Use a synthetic agent target with role='agent' for the prospective new
  // agent. 'agent.adminMutate' requires Tenant Admin tier or higher; lower
  // tiers cannot create comprehensive agents.
  const decision = can(user.permissions, 'agent.adminMutate', {
    kind: 'agent',
    agentId: '00000000-0000-0000-0000-000000000000',
    tenantId: targetTenantId,
    parentId: body?.parent_id ?? null,
    roleDb: 'agent',
  })
  if (!decision.ok) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status })
  }

  const {
    full_name, email, password,
    cell_phone, office_phone, whatsapp_number,
    title, brokerage_name, brokerage_address, license_number,
    subdomain, custom_domain, bio, profile_photo_url,
    parent_id, can_create_children,
    branding,
    ai_free_messages, vip_auto_approve,
    ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap,
    notification_email,
  } = body

  if (!email || !password || !full_name) {
    return NextResponse.json({ error: 'full_name, email and password are required' }, { status: 400 })
  }

  // 1. Create Supabase auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const authUserId = authData.user.id

  // 2. Insert into agents table with site_type='comprehensive'
  const { data: agent, error: insertError } = await supabase
    .from('agents')
    .insert({
      id: authUserId,
      user_id: authUserId,
      full_name,
      email,
      cell_phone: cell_phone || null,
      office_phone: office_phone || null,
      whatsapp_number: whatsapp_number || null,
      title: title || 'Realtor',
      brokerage_name: brokerage_name || null,
      brokerage_address: brokerage_address || null,
      license_number: license_number || null,
      subdomain,
      custom_domain: custom_domain || null,
      bio: bio || null,
      profile_photo_url: profile_photo_url || null,
      notification_email: notification_email || email,
      parent_id: parent_id || null,
        tenant_id: body.tenant_id || null,
      can_create_children: can_create_children || false,
      branding: branding || {},
      site_type: 'comprehensive',
      is_active: true,
      ai_free_messages: ai_free_messages ?? 1,
      vip_auto_approve: vip_auto_approve ?? false,
      ai_auto_approve_limit: ai_auto_approve_limit ?? 2,
      ai_manual_approve_limit: ai_manual_approve_limit ?? 3,
      ai_hard_cap: ai_hard_cap ?? 10,
    })
    .select()
    .single()

  if (insertError) {
    // Rollback: delete auth user to avoid orphan
    await supabase.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, agent })
}