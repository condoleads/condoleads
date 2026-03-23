// app/api/admin-homes/agents/[id]/route.ts
// GET: fetch single agent, PUT: update agent fields
// System 2 only — site_type='comprehensive' guard on GET
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/admin-homes/agents/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
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
  const supabase = createServiceClient()
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
  } = body

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

  const { error } = await supabase
    .from('agents')
    .update(update)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}