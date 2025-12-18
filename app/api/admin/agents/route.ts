import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getCurrentUser, isAdmin } from '@/lib/auth/helpers'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminStatus = await isAdmin(user.id)
  if (!adminStatus) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const data = await request.json()

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check if subdomain already exists
  const { data: existingAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('subdomain', data.subdomain)
    .single()

  if (existingAgent) {
    return NextResponse.json({ error: 'Subdomain already taken' }, { status: 400 })
  }

  // Check if email already exists
  const { data: existingEmail } = await supabase
    .from('agents')
    .select('id')
    .eq('email', data.email)
    .single()

  if (existingEmail) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
  }

  // Check if custom_domain already exists (if provided)
  if (data.custom_domain) {
    const { data: existingDomain } = await supabase
      .from('agents')
      .select('id')
      .eq('custom_domain', data.custom_domain)
      .single()

    if (existingDomain) {
      return NextResponse.json({ error: 'Custom domain already in use' }, { status: 400 })
    }
  }

  // Validate parent_id if provided
  if (data.parent_id) {
    const { data: parentAgent, error: parentError } = await supabase
      .from('agents')
      .select('id, can_create_children')
      .eq('id', data.parent_id)
      .single()

    if (parentError || !parentAgent) {
      return NextResponse.json({ error: 'Invalid parent agent' }, { status: 400 })
    }

    if (!parentAgent.can_create_children) {
      return NextResponse.json({ error: 'Selected parent cannot have team members' }, { status: 400 })
    }
  }

  // Create auth user first
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  // Create agent record with hierarchy fields
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .insert({
      user_id: authUser.user.id,
      full_name: data.full_name,
      email: data.email,
      cell_phone: data.cell_phone,
      office_phone: data.office_phone || null,
      whatsapp_number: data.whatsapp_number || null,
      subdomain: data.subdomain,
      custom_domain: data.custom_domain || null,
      brokerage_name: data.brokerage_name,
      brokerage_address: data.brokerage_address,
      title: data.title,
      license_number: data.license_number,
      bio: data.bio || null,
      profile_photo_url: data.profile_photo_url || null,
      notification_email: data.email,
      role: 'agent',
      is_active: true,
      // Hierarchy fields
      parent_id: data.parent_id || null,
      can_create_children: data.can_create_children || false,
      branding: data.branding || null
    })
    .select()
    .single()

  if (agentError) {
    // Rollback: delete auth user if agent creation fails
    await supabase.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: agentError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, agent })
}