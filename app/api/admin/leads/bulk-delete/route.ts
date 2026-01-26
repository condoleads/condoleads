import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const { leadIds } = await request.json()
    
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No lead IDs provided' }, { status: 400 })
    }

    const supabase = createServiceClient()
    
    const { error } = await supabase
      .from('leads')
      .delete()
      .in('id', leadIds)

    if (error) {
      console.error('Error deleting leads:', error)
      return NextResponse.json({ error: 'Failed to delete leads' }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: leadIds.length })
  } catch (error) {
    console.error('Bulk delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
