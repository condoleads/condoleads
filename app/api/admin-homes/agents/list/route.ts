// app/api/admin-homes/agents/list/route.ts
// Lightweight dropdown list — id, full_name, subdomain, can_create_children only
// Used by AddAgentModal and EditAgentModal for the "Reports To" selector
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('agents')
    .select('id, full_name, subdomain, can_create_children')
    .eq('site_type', 'comprehensive')
    .eq('is_active', true)
    .order('full_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agents: data || [] })
}