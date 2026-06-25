// app/api/admin-homes/agents/route.ts
// System 2 only — WALLiam comprehensive agents
// GET: list agents for dropdown, POST: create new agent
// System 1 (app/api/admin/agents/) is NEVER touched
import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'
import { deriveUniqueAgentSubdomain } from '@/lib/admin-homes/agent-subdomain'
import { teardownAuthUser } from '@/lib/admin-homes/teardown-auth-user'

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
    .select('id, full_name, email, cell_phone, subdomain, can_create_children, is_active, profile_photo_url, tenant_id, parent_id, notification_email, brokerage_name, title, total_leads, role')
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

  // D24 (P3.F5): tenant_id is REQUIRED in body. No actor-tenant fallback
  // because that mechanism caused cross-tenant data leaks (D26): a
  // platform_admin on Tenant B's page would create rows on their home tenant.
  const targetTenantId: string | null = body?.tenant_id ?? null
  if (!targetTenantId) {
    return NextResponse.json({ error: 'tenant_id required in body' }, { status: 400 })
  }

  // D26 (P3.F5): cross-tenant guard. Body tenant_id must match actor's
  // tenant scope OR actor must be platform_admin.
  if (targetTenantId !== user.tenantId && !user.isPlatformAdmin) {
    return NextResponse.json(
      { error: 'cross-tenant agent creation requires platform_admin' },
      { status: 403 }
    )
  }

  // D19 (P3.F5): role accepted from body, validated against agents_role_check
  // subset (admin tier omitted from user-facing picker for safety).
  // W-TENANT-ASSISTANT UNIT 11: 'assistant' added to the allow-list; the DB
  // CHECK was extended in 20260625_w_assistant_role.sql.
  const VALID_ROLES = ['agent', 'manager', 'area_manager', 'tenant_admin', 'assistant'] as const
  type AgentRoleDb = (typeof VALID_ROLES)[number]
  const requestedRole = (typeof body?.role === 'string' ? body.role : 'agent') as AgentRoleDb
  if (!VALID_ROLES.includes(requestedRole)) {
    return NextResponse.json(
      { error: 'invalid role; must be one of: ' + VALID_ROLES.join(', ') },
      { status: 400 }
    )
  }

  // D19: pass real role to can() decision (was hardcoded 'agent').
  const decision = can(user.permissions, 'agent.adminMutate', {
    kind: 'agent',
    agentId: '00000000-0000-0000-0000-000000000000',
    tenantId: targetTenantId,
    parentId: body?.parent_id ?? null,
    roleDb: requestedRole,
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

  // D28 (P3.F5): subdomain is system-derived from full_name, never trusted
  // from body. Even if client sends one, we overwrite with a uniqueness-
  // enforced server-side derivation.
  const derivedSubdomain = await deriveUniqueAgentSubdomain(supabase, full_name)

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
      subdomain: derivedSubdomain,
      custom_domain: custom_domain || null,
      bio: bio || null,
      profile_photo_url: profile_photo_url || null,
      notification_email: notification_email || email,
      parent_id: parent_id || null,
      tenant_id: targetTenantId,
      role: requestedRole,
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
    // F-AGENT-CREATION-ROLLBACK-INCOMPLETE (P3.F5) -> COMPLETED in
    // W-AGENT-LIFECYCLE-INTEGRITY (2026-06-24).
    //
    // Prior shape (incomplete): only user_profiles + bare-await deleteUser
    // with no error capture. When deleteUser silently failed against a
    // non-cascade FK (e.g. an interim public.leads row), the auth user
    // persisted as an orphan. The W-OVAIS cleanup surfaced exactly this
    // (orphan ce97a0bb + downstream lead 4e32a237 — both lingered for
    // weeks).
    //
    // New shape: shared teardown helper enumerates all NO-CASCADE FKs
    // (leads + user_profiles), defensively probes other public.* tables
    // for unexpected rows, then calls deleteUser. Every step's error is
    // captured and surfaced with a named message — silence is the bug.
    const td = await teardownAuthUser(supabase, authUserId)
    if (!td.ok) {
      return NextResponse.json(
        { error: `agent insert failed (${insertError.message}); ${td.error}` },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, agent })
}