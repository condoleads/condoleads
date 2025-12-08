import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Assign/Unassign agent to development
export async function POST(request: NextRequest) {
  try {
    const { developmentId, agentId, action } = await request.json()

    if (!developmentId || !agentId || !action) {
      return NextResponse.json({ error: 'developmentId, agentId, and action required' }, { status: 400 })
    }

    if (action === 'assign') {
      const { error } = await supabase
        .from('development_agents')
        .insert({ development_id: developmentId, agent_id: agentId })

      if (error) {
        console.error('Assign error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'assigned' })

    } else if (action === 'unassign') {
      const { error } = await supabase
        .from('development_agents')
        .delete()
        .eq('development_id', developmentId)
        .eq('agent_id', agentId)

      if (error) {
        console.error('Unassign error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'unassigned' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error: any) {
    console.error('Development agent assignment error:', error)
    return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 })
  }
}