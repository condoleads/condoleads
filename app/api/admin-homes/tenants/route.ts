// app/api/admin-homes/tenants/route.ts
// GET single tenant, PUT update tenant
// Uses service role — no RLS issues
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/admin-homes/tenants?id=xxx
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  return NextResponse.json({ tenant: data })
}

// PUT /api/admin-homes/tenants?id=xxx
export async function PUT(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const supabase = createServiceClient()
  const body = await request.json()

  const { error } = await supabase
    .from('tenants')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// POST /api/admin-homes/tenants
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()

  if (!body.name || !body.domain || !body.admin_email) {
    return NextResponse.json(
      { error: 'name, domain, and admin_email are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('tenants')
    .insert({ ...body, domain: body.domain.toLowerCase() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tenant: data })
}
