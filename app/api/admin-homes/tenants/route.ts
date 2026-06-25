// app/api/admin-homes/tenants/route.ts
// GET single tenant, PUT update tenant, POST create tenant
// Platform-admin only -- uses service role inside helper, no RLS issues.
//
// W-MULTITENANT-BENCH P3 finding #1 (2026-05-21): POST derives source_key
// from domain because the modal does not collect it. Without this, every
// tenant creation after WALLiam fails with 23502 NOT NULL violation.
// Migration 20260521_tenants_source_key_unique.sql adds UNIQUE constraint.
// Derivation logic lives in lib/admin-homes/tenant-source-key.ts.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'
import { deriveSourceKey, sanitizeSourceKey } from '@/lib/admin-homes/tenant-source-key'
import { deriveUniqueAgentSubdomain } from '@/lib/admin-homes/agent-subdomain'
import { teardownAuthUser } from '@/lib/admin-homes/teardown-auth-user'

export async function GET(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'platform.read', { kind: 'platform' })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data, error } = await supabase.from('tenants').select('*').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  return NextResponse.json({ tenant: data })
}

export async function PUT(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'platform.write', { kind: 'platform' })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const body = await request.json()

  if (typeof body.source_key === 'string') {
    const sanitized = sanitizeSourceKey(body.source_key)
    if (!sanitized) {
      return NextResponse.json({ error: 'source_key cannot be empty after sanitization' }, { status: 400 })
    }
    body.source_key = sanitized
  }

  const { error } = await supabase
    .from('tenants')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    if (error.code === '23505' && error.message.includes('source_key')) {
      return NextResponse.json(
        { error: 'source_key collision: another tenant already uses this identifier', code: error.code },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function POST(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'platform.write', { kind: 'platform' })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()

  const body = await request.json()
  if (!body.name || !body.domain || !body.admin_email) {
    return NextResponse.json(
      { error: 'name, domain, and admin_email are required' },
      { status: 400 }
    )
  }

  // W-TENANT-CREATE UNIT 15: owner seed prerequisites. The owner's name +
  // password come from the same modal; the owner's email re-uses
  // admin_email (the operator already entered who the admin is). Without
  // these we can't seed the first agent, so the tenant create can't
  // complete — required. Prerequisite for Phase 1b NOT NULL on
  // tenants.default_agent_id.
  const ownerFullName: string | undefined = body.owner_full_name
  const ownerPassword: string | undefined = body.owner_password
  if (!ownerFullName || typeof ownerFullName !== 'string' || !ownerFullName.trim()) {
    return NextResponse.json({ error: 'owner_full_name is required (the tenant owner, who becomes the first agent + house account)' }, { status: 400 })
  }
  if (!ownerPassword || typeof ownerPassword !== 'string' || ownerPassword.length < 8) {
    return NextResponse.json({ error: 'owner_password is required and must be at least 8 characters' }, { status: 400 })
  }

  let sourceKey: string
  if (typeof body.source_key === 'string' && body.source_key.length > 0) {
    sourceKey = sanitizeSourceKey(body.source_key)
  } else {
    sourceKey = deriveSourceKey(body.domain)
  }
  if (!sourceKey) {
    return NextResponse.json(
      { error: 'source_key could not be derived from domain; provide a valid domain or source_key' },
      { status: 400 }
    )
  }

  // W-TENANT-CREATE UNIT 15: strip owner_* from the tenants insert payload
  // — they're consumed by the agent-seed steps below, not stored on tenants.
  const { owner_full_name: _ofn, owner_password: _opw, ...tenantBodyOnly } = body
  const insertPayload = {
    ...tenantBodyOnly,
    domain: body.domain.toLowerCase(),
    source_key: sourceKey,
  }

  // ─── STEP 1: insert tenant ───────────────────────────────────────────────
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .insert(insertPayload)
    .select()
    .single()

  if (tenantErr) {
    if (tenantErr.code === '23505' && tenantErr.message.includes('source_key')) {
      return NextResponse.json(
        {
          error: "source_key collision: '" + sourceKey + "' is already in use by another tenant",
          code: tenantErr.code,
          derived_source_key: sourceKey,
        },
        { status: 409 }
      )
    }
    if (tenantErr.code === '23505' && tenantErr.message.includes('domain')) {
      return NextResponse.json(
        { error: "domain '" + insertPayload.domain + "' is already in use by another tenant", code: tenantErr.code },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: tenantErr.message, code: tenantErr.code }, { status: 500 })
  }

  // W-TENANT-CREATE UNIT 15: seed owner agent + house account. Atomicity
  // is best-effort across the DB/auth boundary (PG transactions can't span
  // auth.admin). The pattern: roll back each step on failure of any later
  // step so the tenant is never left house-account-less. Mirrors the
  // teardown pattern from /api/admin-homes/agents POST handler
  // (W-AGENT-LIFECYCLE-INTEGRITY).
  const ownerEmail: string = body.admin_email

  // ─── STEP 2: create the owner's Supabase auth user ────────────────────────
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  })
  if (authErr || !authData?.user) {
    // Rollback: delete the tenant we just created.
    await supabase.from('tenants').delete().eq('id', tenant.id)
    return NextResponse.json(
      { error: 'tenant rolled back; owner auth user create failed: ' + (authErr?.message || 'unknown') },
      { status: 400 }
    )
  }
  const authUserId = authData.user.id

  // ─── STEP 3: insert the owner agent row ──────────────────────────────────
  const ownerSubdomain = await deriveUniqueAgentSubdomain(supabase, ownerFullName)
  const { data: ownerAgent, error: agentErr } = await supabase
    .from('agents')
    .insert({
      id: authUserId,
      user_id: authUserId,
      full_name: ownerFullName,
      email: ownerEmail,
      notification_email: ownerEmail,
      role: 'tenant_admin',  // operator-locked: owner = root + house-account-eligible
      parent_id: null,        // operator-locked: owner is the root (parent_id NULL)
      tenant_id: tenant.id,
      is_active: true,
      site_type: 'comprehensive',
      subdomain: ownerSubdomain,
      can_create_children: true,
      title: 'Owner',
    })
    .select()
    .single()
  if (agentErr || !ownerAgent) {
    // Rollback: teardown auth user, then delete tenant.
    const td = await teardownAuthUser(supabase, authUserId)
    await supabase.from('tenants').delete().eq('id', tenant.id)
    return NextResponse.json(
      { error: 'tenant rolled back; owner agent insert failed: ' + (agentErr?.message || 'unknown') + (td.ok ? '' : ' (auth teardown also failed: ' + td.error + ')') },
      { status: 500 }
    )
  }

  // ─── STEP 4: set tenant.default_agent_id = owner agent id ────────────────
  // The validate_house_account trigger (Phase 1 d39941f) validates this
  // write automatically. Owner agent satisfies all 4 conditions: exists,
  // tenant_id matches, is_active=true, role='tenant_admin' (eligible).
  const { error: defaultErr } = await supabase
    .from('tenants')
    .update({ default_agent_id: ownerAgent.id, updated_at: new Date().toISOString() })
    .eq('id', tenant.id)
  if (defaultErr) {
    // Rollback all: delete agent, teardown auth user, delete tenant.
    await supabase.from('agents').delete().eq('id', ownerAgent.id)
    const td = await teardownAuthUser(supabase, authUserId)
    await supabase.from('tenants').delete().eq('id', tenant.id)
    return NextResponse.json(
      { error: 'tenant rolled back; default_agent_id set failed: ' + defaultErr.message + (td.ok ? '' : ' (auth teardown also failed: ' + td.error + ')') },
      { status: 500 }
    )
  }

  // Re-fetch the tenant with default_agent_id populated for the response.
  const { data: finalTenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenant.id)
    .single()

  return NextResponse.json({
    tenant: finalTenant || tenant,
    owner_agent: { id: ownerAgent.id, full_name: ownerAgent.full_name, email: ownerAgent.email, role: ownerAgent.role },
  })
}