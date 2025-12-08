import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // Get all developments
    const { data: developments, error: developmentsError } = await supabase
      .from('developments')
      .select('*')
      .order('name', { ascending: true })

    if (developmentsError) {
      throw developmentsError
    }

    // Get all buildings with development_id
    const { data: buildings } = await supabase
      .from('buildings')
      .select('id, building_name, canonical_address, slug, development_id')
      .order('building_name')

    // Get all agents
    const { data: agents } = await supabase
      .from('agents')
      .select('id, full_name, email')
      .order('full_name')

    // Get development-agent assignments
    const { data: devAgentAssignments } = await supabase
      .from('development_agents')
      .select(`
        development_id,
        agent_id,
        agents (
          id,
          full_name,
          email
        )
      `)

    // Build lookup maps
    const buildingsMap = new Map<string, any[]>()
    const agentsMap = new Map<string, any[]>()

    ;(buildings || []).forEach((b: any) => {
      if (b.development_id) {
        if (!buildingsMap.has(b.development_id)) {
          buildingsMap.set(b.development_id, [])
        }
        buildingsMap.get(b.development_id)!.push(b)
      }
    })

    ;(devAgentAssignments || []).forEach((a: any) => {
      if (!agentsMap.has(a.development_id)) {
        agentsMap.set(a.development_id, [])
      }
      if (a.agents) {
        agentsMap.get(a.development_id)!.push(a.agents)
      }
    })

    // Combine data
    const developmentsWithDetails = (developments || []).map((dev: any) => ({
      ...dev,
      buildings: buildingsMap.get(dev.id) || [],
      assignedAgents: agentsMap.get(dev.id) || []
    }))

    // Get unassigned buildings (no development)
    const unassignedBuildings = (buildings || []).filter((b: any) => !b.development_id)

    return NextResponse.json({
      success: true,
      developments: developmentsWithDetails,
      unassignedBuildings,
      agents: agents || []
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    })
  } catch (error: any) {
    console.error('Failed to list developments:', error)
    return NextResponse.json(
      { error: 'Failed to list developments', details: error.message },
      { status: 500 }
    )
  }
}