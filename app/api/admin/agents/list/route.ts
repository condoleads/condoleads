import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser, isAdmin } from '@/lib/auth/helpers'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminStatus = await isAdmin(user.id)
  if (!adminStatus) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: agents, error } = await supabase
    .from('agents')
    .select('id, full_name, subdomain, custom_domain, can_create_children')
    .eq('is_active', true)
    .order('full_name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ agents })
}