import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getCurrentUser, isAdmin } from '@/lib/auth/helpers'

export async function POST(request) {
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
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
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

  // Create auth user first
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  // Create agent record
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .insert({
      user_id: authUser.user.id,
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      subdomain: data.subdomain,
      brokerage_name: data.brokerage_name,
      brokerage_address: data.brokerage_address,
      title: data.title,
      license_number: data.license_number,
      bio: data.bio || null,
      profile_photo_url: data.profile_photo_url || null,
      notification_email: data.email,
      role: 'agent',
      is_active: true
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