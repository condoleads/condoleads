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
import { Client } from 'pg'
import { randomUUID } from 'crypto'

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
  // W-TENANT-GOV UNIT 16b: this insertPayload feeds the pg-direct INSERT
  // tenant call below (built generically from its keys/values).
  const { owner_full_name: _ofn, owner_password: _opw, ...tenantBodyOnly } = body
  const tenantInsertRecord: Record<string, any> = {
    ...tenantBodyOnly,
    domain: body.domain.toLowerCase(),
    source_key: sourceKey,
  }

  const ownerEmail: string = body.admin_email

  // ─── STEP 1 (pre-tx): create owner's Supabase auth user ───────────────────
  // auth.admin lives outside Postgres, so it can't be in the pg tx below.
  // We create the auth user FIRST. If the pg tx fails, we teardownAuthUser
  // to avoid leaving an orphan.
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  })
  if (authErr || !authData?.user) {
    return NextResponse.json(
      { error: 'owner auth user create failed: ' + (authErr?.message || 'unknown') },
      { status: 400 }
    )
  }
  const authUserId = authData.user.id

  // Pre-derive subdomain + tenant id so the pg tx can run with all inputs
  // ready.
  const ownerSubdomain = await deriveUniqueAgentSubdomain(supabase, ownerFullName)
  const newTenantId = randomUUID()

  // Build the full tenant insert column list for the pg tx (generic from
  // tenantInsertRecord keys; values pulled in the same order). Fixed columns
  // (id, default_agent_id, updated_at) added explicitly to make the param
  // mapping deterministic.
  const tenantRecord: Record<string, any> = {
    id: newTenantId,
    default_agent_id: authUserId,
    updated_at: new Date().toISOString(),
    ...tenantInsertRecord,
  }
  const tenantCols = Object.keys(tenantRecord)
  const tenantParams = tenantCols.map(k => tenantRecord[k])
  const tenantPlaceholders = tenantCols.map((_, i) => `$${i + 1}`).join(', ')
  const tenantInsertSql =
    `INSERT INTO public.tenants (${tenantCols.map(c => '"' + c + '"').join(', ')}) ` +
    `VALUES (${tenantPlaceholders}) RETURNING *`

  // Agent insert columns (fixed shape — same fields as the Unit 15 supabase
  // insert; expressed as positional params for pg-direct).
  const agentCols = ['id','user_id','full_name','email','notification_email','role','parent_id','tenant_id','is_active','site_type','subdomain','can_create_children','title']
  const agentParams = [authUserId, authUserId, ownerFullName, ownerEmail, ownerEmail, 'tenant_admin', null, newTenantId, true, 'comprehensive', ownerSubdomain, true, 'Owner']
  const agentInsertSql =
    `INSERT INTO public.agents (${agentCols.map(c => '"' + c + '"').join(', ')}) ` +
    `VALUES (${agentCols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`

  // ─── STEP 2 (pg-direct tx): atomic agent + tenant insert ─────────────────
  // W-TENANT-GOV UNIT 16b: the FK cycle (tenants.default_agent_id ↔
  // agents.tenant_id) is resolved by SET CONSTRAINTS ALL DEFERRED inside
  // this tx. Both FKs were made DEFERRABLE INITIALLY IMMEDIATE by the Gate
  // 1 migration (20260626_w_phase1b_fk_deferrable.sql). The validate_house_
  // account trigger (Phase 1 d39941f) is UNCHANGED — it fires on the tenant
  // INSERT and sees agent.tenant_id already correctly set to newTenantId
  // (because the agent insert went first with the correct value), so cond
  // (b) passes strictly.
  //
  // Order:
  //   1. SET CONSTRAINTS ALL DEFERRED
  //   2. INSERT agent (id=authUserId, tenant_id=newTenantId, role=tenant_admin,
  //      is_active=true, ...) — agents.tenant_id FK deferred
  //   3. INSERT tenant (id=newTenantId, default_agent_id=authUserId, ...) —
  //      tenants.default_agent_id FK validates against agent which exists in
  //      this tx; trigger fires + passes (agent.tenant_id == newTenantId)
  //   4. COMMIT — agents.tenant_id FK validates (tenant exists now), passes
  //
  // On ANY failure: ROLLBACK the tx + teardownAuthUser. Owner email is
  // released for re-use immediately.
  const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL
  if (!connStr) {
    await teardownAuthUser(supabase, authUserId).catch(() => undefined)
    return NextResponse.json({ error: 'DATABASE_URL not configured; cannot run tenant-create transaction' }, { status: 500 })
  }
  const pg = new Client({ connectionString: connStr })
  await pg.connect()
  let createdTenantRow: any = null
  let createdAgentRow: any = null
  try {
    await pg.query('BEGIN')
    await pg.query('SET CONSTRAINTS ALL DEFERRED')

    // Insert agent FIRST with correct tenant_id (FK deferred to COMMIT).
    const agentRes = await pg.query(agentInsertSql, agentParams)
    createdAgentRow = agentRes.rows[0]

    // Insert tenant SECOND. tenants.default_agent_id FK validates
    // immediately against the just-inserted agent (no defer needed for
    // this FK direction). validate_house_account trigger fires + checks
    // agent.tenant_id (==newTenantId) against NEW.id (==newTenantId) →
    // strict match, passes.
    const tenantRes = await pg.query(tenantInsertSql, tenantParams)
    createdTenantRow = tenantRes.rows[0]

    // COMMIT — agents.tenant_id deferred FK validates (tenant exists),
    // passes.
    await pg.query('COMMIT')
  } catch (txErr: any) {
    await pg.query('ROLLBACK').catch(() => undefined)
    await pg.end().catch(() => undefined)
    const td = await teardownAuthUser(supabase, authUserId)
    // Friendly mapping for the most likely failures (uniqueness collisions
    // on domain / source_key surface as 23505).
    if (txErr.code === '23505' && /source_key/.test(txErr.message || '')) {
      return NextResponse.json(
        { error: "source_key collision: '" + sourceKey + "' is already in use by another tenant", code: txErr.code, derived_source_key: sourceKey },
        { status: 409 }
      )
    }
    if (txErr.code === '23505' && /domain/.test(txErr.message || '')) {
      return NextResponse.json(
        { error: "domain '" + tenantRecord.domain + "' is already in use by another tenant", code: txErr.code },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'tenant-create transaction rolled back: ' + (txErr.message || 'unknown') + (td.ok ? '' : ' (auth teardown also failed: ' + td.error + ')'), code: txErr.code },
      { status: 500 }
    )
  } finally {
    await pg.end().catch(() => undefined)
  }

  return NextResponse.json({
    tenant: createdTenantRow,
    owner_agent: {
      id: createdAgentRow.id,
      full_name: createdAgentRow.full_name,
      email: createdAgentRow.email,
      role: createdAgentRow.role,
    },
  })
}