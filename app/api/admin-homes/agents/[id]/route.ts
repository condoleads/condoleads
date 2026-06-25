// app/api/admin-homes/agents/[id]/route.ts
// GET: fetch single agent, PUT: update agent fields, DELETE: remove agent + auth user
// System 2 only — site_type='comprehensive' guard inside requireAgentAccess
// Phase 3.4+: auth + tenant + role checks via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can, type DbRole } from '@/lib/admin-homes/permissions'
import { teardownAuthUser } from '@/lib/admin-homes/teardown-auth-user'

// GET /api/admin-homes/agents/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data: target } = await supabase
    .from('agents')
    .select('id, tenant_id, parent_id, site_type, role')
    .eq('id', params.id)
    .maybeSingle()
  if (!target || target.site_type !== 'comprehensive') {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  const decision = can(user.permissions, 'agent.read', {
    kind: 'agent',
    agentId: target.id,
    tenantId: target.tenant_id,
    parentId: target.parent_id,
    roleDb: (target.role || 'agent') as DbRole,
  })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })

  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', params.id)
    .eq('site_type', 'comprehensive')
    .single()
  if (error || !data) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  return NextResponse.json({ agent: data })
}

// PUT /api/admin-homes/agents/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  // W-AGENT-LIFECYCLE-INTEGRITY (2026-06-24): user_id + email added so the email-sync
  // branch below has the FK target and the prior value (for revert on auth failure).
  const { data: target } = await supabase
    .from('agents')
    .select('id, tenant_id, parent_id, site_type, role, user_id, email')
    .eq('id', params.id)
    .maybeSingle()
  if (!target || target.site_type !== 'comprehensive') {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  const decision = can(user.permissions, 'agent.write', {
    kind: 'agent',
    agentId: target.id,
    tenantId: target.tenant_id,
    parentId: target.parent_id,
    roleDb: (target.role || 'agent') as DbRole,
  })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })

  const body = await request.json()

  const {
    full_name, email, cell_phone, office_phone, whatsapp_number,
    title, brokerage_name, brokerage_address, license_number,
    subdomain, custom_domain, bio, profile_photo_url,
    notification_email, is_active,
    parent_id, can_create_children,
    branding,
    ai_free_messages, vip_auto_approve,
    ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap,
    // W-HOUSE-ACCOUNT UNIT 9: oversight opt-out flag (jsonb sub-key).
    // Gated below — only tenant_admin / admin / platform_admin can set it.
    notification_preferences,
  } = body

  // Cross-tenant parent_id guard: parent must belong to the same tenant as the target.
  if (parent_id) {
    const { data: parent } = await supabase
      .from('agents')
      .select('tenant_id')
      .eq('id', parent_id)
      .maybeSingle()
    if (!parent || parent.tenant_id !== target.tenant_id) {
      return NextResponse.json({ error: 'parent_id must belong to the same tenant' }, { status: 400 })
    }
  }

  // Build update payload — only include fields that were sent
  const update: Record<string, any> = {}
  if (full_name !== undefined) update.full_name = full_name
  if (email !== undefined) update.email = email
  if (cell_phone !== undefined) update.cell_phone = cell_phone
  if (office_phone !== undefined) update.office_phone = office_phone
  if (whatsapp_number !== undefined) update.whatsapp_number = whatsapp_number
  if (title !== undefined) update.title = title
  if (brokerage_name !== undefined) update.brokerage_name = brokerage_name
  if (brokerage_address !== undefined) update.brokerage_address = brokerage_address
  if (license_number !== undefined) update.license_number = license_number
  if (subdomain !== undefined) update.subdomain = subdomain
  if (custom_domain !== undefined) update.custom_domain = custom_domain || null
  if (bio !== undefined) update.bio = bio || null
  if (profile_photo_url !== undefined) update.profile_photo_url = profile_photo_url || null
  if (notification_email !== undefined) update.notification_email = notification_email
  if (is_active !== undefined) update.is_active = is_active
  if (parent_id !== undefined) update.parent_id = parent_id || null
  if (can_create_children !== undefined) update.can_create_children = can_create_children
  if (branding !== undefined) update.branding = branding
  if (ai_free_messages !== undefined) update.ai_free_messages = ai_free_messages
  if (vip_auto_approve !== undefined) update.vip_auto_approve = vip_auto_approve
  if (ai_auto_approve_limit !== undefined) update.ai_auto_approve_limit = ai_auto_approve_limit
  if (ai_manual_approve_limit !== undefined) update.ai_manual_approve_limit = ai_manual_approve_limit
  if (ai_hard_cap !== undefined) update.ai_hard_cap = ai_hard_cap

  // W-HOUSE-ACCOUNT UNIT 9 (2026-06-25): oversight opt-out write gate.
  // Only tenant_admin, admin, or platform_admin can set
  // notification_preferences.oversight_opt_out. Agents CANNOT change their
  // own opt-out (prevents accidental self-removal from copy chain).
  //
  // Other notification_preferences sub-keys (future) flow through with the
  // same gate for safety — narrow this if a per-key permission split is
  // ever needed.
  //
  // Merge strategy: read prior value and shallow-merge so callers can set a
  // single sub-key without wiping the rest of the prefs blob.
  if (notification_preferences !== undefined) {
    if (notification_preferences === null || typeof notification_preferences !== 'object' || Array.isArray(notification_preferences)) {
      return NextResponse.json({ error: 'notification_preferences must be an object' }, { status: 400 })
    }
    // AdminHomesRole is 'admin' | 'manager' | 'agent' (auth.ts normalises DB
     // 'tenant_admin' + 'admin' both to role='admin'). position carries the
     // finer 7-role surface — use it for the assistant forward-compat check.
    const canSetOptOut = user.isPlatformAdmin
      || user.role === 'admin'
      || user.position === 'tenant_admin'
      || user.position === 'assistant'
    if (!canSetOptOut) {
      return NextResponse.json(
        { error: 'Only tenant admins can change oversight preferences (notification_preferences). Ask your tenant admin to set this for you.' },
        { status: 403 }
      )
    }
    const { data: priorRow } = await supabase
      .from('agents')
      .select('notification_preferences')
      .eq('id', params.id)
      .maybeSingle()
    const prior = (priorRow?.notification_preferences || {}) as Record<string, any>
    update.notification_preferences = { ...prior, ...(notification_preferences as Record<string, any>) }
  }

  // W-TENANT-GOV-PHASE1 (2026-06-25): can't-orphan-house-account guard.
  // If this PUT would deactivate the agent (is_active=false) AND this agent
  // is the tenant's default_agent_id, REJECT before any write. Friendly
  // error directs the operator to Settings → General to pick a different
  // house account first. Without this, the resolver fallback would silently
  // point at an inactive agent.
  if (is_active === false) {
    const { data: houseTenant, error: houseErr } = await supabase
      .from('tenants')
      .select('id')
      .eq('default_agent_id', params.id)
      .maybeSingle()
    if (houseErr) {
      return NextResponse.json({ error: 'house-account pre-check failed: ' + houseErr.message }, { status: 500 })
    }
    if (houseTenant) {
      return NextResponse.json(
        { error: 'Cannot deactivate: this agent is the house account for its tenant. Set a different default agent in Settings → General first.' },
        { status: 400 }
      )
    }
  }

  // W-AGENT-LIFECYCLE-INTEGRITY (2026-06-24) BUG-1 FIX: if email is changing,
  // pre-flight BOTH agents.email and auth.users.email uniqueness BEFORE any
  // write. If pre-flight passes, write agents first, then sync auth via
  // auth.admin.updateUserById. If the auth sync fails, revert agents.email
  // to the prior value so we never leave a silent split state (which was
  // tonight's W-OVAIS bug — operator-dashboard edit changed agents.email
  // but not auth.users.email, producing inconsistent S1 identity).
  const emailIsChanging = email !== undefined && email !== target.email
  const priorEmail: string | null = target.email

  if (emailIsChanging) {
    // PRE-FLIGHT 1: agents.email — global UNIQUE (agents_email_key). Skip self.
    const { data: agentCollide, error: agentCollideErr } = await supabase
      .from('agents')
      .select('id')
      .eq('email', email)
      .neq('id', params.id)
      .maybeSingle()
    if (agentCollideErr) {
      return NextResponse.json({ error: 'pre-flight agents.email check failed: ' + agentCollideErr.message }, { status: 500 })
    }
    if (agentCollide) {
      return NextResponse.json({ error: 'Email already assigned to another agent' }, { status: 400 })
    }

    // PRE-FLIGHT 2: auth.users.email — no native email-filter on listUsers.
    // Paged scan; skip the row whose id matches target.user_id (same user keeping
    // their email isn't a collision — handles the post-W-OVAIS reconciliation
    // case where auth and agents had been in split state).
    let page = 1
    let authCollide = false
    while (true) {
      const { data: list, error: lErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (lErr) {
        return NextResponse.json({ error: 'pre-flight auth.users check failed: ' + lErr.message }, { status: 500 })
      }
      for (const u of list.users) {
        if ((u.email || '').toLowerCase() === (email as string).toLowerCase() && u.id !== target.user_id) {
          authCollide = true
          break
        }
      }
      if (authCollide || list.users.length < 1000) break
      page++
      if (page > 20) break
    }
    if (authCollide) {
      return NextResponse.json({ error: 'Email already in use by another account' }, { status: 400 })
    }
  }

  const { error } = await supabase
    .from('agents')
    .update(update)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // SYNC auth.users.email (only if changing AND we have a user_id to target).
  if (emailIsChanging && target.user_id) {
    const { error: authErr } = await supabase.auth.admin.updateUserById(target.user_id, {
      email,
      email_confirm: true,
    })
    if (authErr) {
      // agents already committed; auth out of sync. Revert agents.email to
      // the prior value so the row is consistent with auth again. If revert
      // also fails, surface BOTH errors — operator needs to know.
      const { error: revertErr } = await supabase
        .from('agents')
        .update({ email: priorEmail })
        .eq('id', params.id)
      const revertNote = revertErr
        ? ` AND revert FAILED: ${revertErr.message} — agents.email is ${email}, auth.users.email is ${priorEmail}, manual reconciliation needed`
        : ` — agents.email reverted to ${priorEmail}`
      return NextResponse.json(
        { error: `auth email sync failed: ${authErr.message}${revertNote}` },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/admin-homes/agents/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data: target } = await supabase
    .from('agents')
    .select('id, tenant_id, parent_id, site_type, role')
    .eq('id', params.id)
    .maybeSingle()
  if (!target || target.site_type !== 'comprehensive') {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  const decision = can(user.permissions, 'agent.adminMutate', {
    kind: 'agent',
    agentId: target.id,
    tenantId: target.tenant_id,
    parentId: target.parent_id,
    roleDb: (target.role || 'agent') as DbRole,
  })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })

  // W-TENANT-GOV-PHASE1 (2026-06-25): can't-orphan-house-account guard.
  // If this agent is the tenant's default_agent_id, REJECT before any
  // teardown work. (The tenants_default_agent_id_fkey RESTRICT would also
  // block the agents DELETE downstream, but the operator gets a cryptic
  // PG error instead of a friendly one — and our teardown would have
  // already done destructive work in the wrong order.)
  const { data: houseTenant, error: houseErr } = await supabase
    .from('tenants')
    .select('id')
    .eq('default_agent_id', params.id)
    .maybeSingle()
  if (houseErr) {
    return NextResponse.json({ error: 'house-account pre-check failed: ' + houseErr.message }, { status: 500 })
  }
  if (houseTenant) {
    return NextResponse.json(
      { error: 'Cannot delete: this agent is the house account for its tenant. Set a different default agent in Settings → General first.' },
      { status: 400 }
    )
  }

  // Fetch user_id for the teardown helper.
  const { data: agent } = await supabase
    .from('agents')
    .select('user_id')
    .eq('id', params.id)
    .single()

  // W-AGENT-LIFECYCLE-INTEGRITY (2026-06-24) BUG-3 FIX: same incomplete-cleanup
  // class as the create-rollback (BUG-2). Prior shape was user_profiles +
  // bare-await deleteUser with no error capture; deleteUser would silently
  // fail when public.leads (or other non-cascade FKs) pinned the auth user,
  // leaving an orphan. New shape: delete the agents row FIRST (clears the
  // agents.user_id FK so deleteUser can succeed), then call the shared
  // teardownAuthUser helper which handles leads + user_profiles + defensive
  // probes + error-captured deleteUser.
  //
  // ORDER NOTE: agents row MUST be deleted before teardownAuthUser, because
  // the helper's step-3 defensive probe checks agents.user_id and would
  // (correctly) refuse to proceed if a row still pointed at this auth user.
  const { error: agentDelErr } = await supabase
    .from('agents')
    .delete()
    .eq('id', params.id)
  if (agentDelErr) return NextResponse.json({ error: agentDelErr.message }, { status: 500 })

  if (agent?.user_id) {
    const td = await teardownAuthUser(supabase, agent.user_id)
    if (!td.ok) {
      return NextResponse.json(
        { error: `agent deletion auth teardown failed: ${td.error}` },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ success: true })
}