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

  const insertPayload = {
    ...body,
    domain: body.domain.toLowerCase(),
    source_key: sourceKey,
  }

  const { data, error } = await supabase
    .from('tenants')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === '23505' && error.message.includes('source_key')) {
      return NextResponse.json(
        {
          error: "source_key collision: '" + sourceKey + "' is already in use by another tenant",
          code: error.code,
          derived_source_key: sourceKey,
        },
        { status: 409 }
      )
    }
    if (error.code === '23505' && error.message.includes('domain')) {
      return NextResponse.json(
        { error: "domain '" + insertPayload.domain + "' is already in use by another tenant", code: error.code },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  return NextResponse.json({ tenant: data })
}