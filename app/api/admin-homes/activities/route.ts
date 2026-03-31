// app/api/admin-homes/activities/route.ts
// Fetch user activity timeline by email for WALLiam leads dashboard

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: activities, error } = await supabase
      .from('user_activities')
      .select('id, activity_type, activity_data, page_url, created_at')
      .eq('contact_email', email)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ activities: activities || [] })

  } catch (error) {
    console.error('[admin-homes/activities] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}