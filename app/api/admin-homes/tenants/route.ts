// app/api/admin-homes/tenants/route.ts
// GET single tenant, PUT update tenant, POST create tenant
// Platform-admin only — uses service role inside helper, no RLS issues
// Phase 3.4+: auth + role checks via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin-homes/api-auth'

// GET /api/admin-homes/tenants?id=xxx
export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return auth.error

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data, error } = await auth.supabase
    .from('tenants')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  return NextResponse.json({ tenant: data })
}

// PUT /api/admin-homes/tenants?id=xxx
export async function PUT(request: NextRequest) {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return auth.error

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const body = await request.json()
  const { error } = await auth.supabase
    .from('tenants')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// POST /api/admin-homes/tenants
export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return auth.error

  const body = await request.json()
  if (!body.name || !body.domain || !body.admin_email) {
    return NextResponse.json(
      { error: 'name, domain, and admin_email are required' },
      { status: 400 }
    )
  }

  const { data, error } = await auth.supabase
    .from('tenants')
    .insert({ ...body, domain: body.domain.toLowerCase() })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tenant: data })
}