// app/api/admin/buildings/list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get all buildings
    const { data: buildings, error: buildingsError } = await supabase
      .from('buildings')
      .select('*')
      .order('building_name', { ascending: true });

    if (buildingsError) {
      throw buildingsError;
    }

    // Get all agents
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, full_name, email')
      .order('full_name');

    if (agentsError) {
      throw agentsError;
    }

    // Get all building-agent assignments with agent details
    const { data: assignments, error: assignmentsError } = await supabase
      .from('building_agents')
      .select(`
        building_id,
        agent_id,
        agents (
          id,
          full_name,
          email
        )
      `);

    if (assignmentsError) {
      console.error('Assignments error:', assignmentsError);
    }

    // Build assignment lookup by building_id
    const assignmentMap = new Map<string, any[]>();
    (assignments || []).forEach((a: any) => {
      if (!assignmentMap.has(a.building_id)) {
        assignmentMap.set(a.building_id, []);
      }
      if (a.agents) {
        assignmentMap.get(a.building_id)!.push(a.agents);
      }
    });

    // Get listing counts and combine data
    const buildingsWithDetails = await Promise.all(
      buildings.map(async (building) => {
        const { count } = await supabase
          .from('mls_listings')
          .select('*', { count: 'exact', head: true })
          .eq('building_id', building.id);

        return {
          id: building.id,
          building_name: building.building_name,
          canonical_address: building.canonical_address,
          slug: building.slug,
          total_units: building.total_units,
          year_built: building.year_built,
          last_synced_at: building.last_synced_at,
          listingCount: count || 0,
          assignedAgents: assignmentMap.get(building.id) || []
        };
      })
    );

    return NextResponse.json({
      success: true,
      buildings: buildingsWithDetails,
      agents: agents || []
    });
  } catch (error: any) {
    console.error('Failed to list buildings:', error);
    return NextResponse.json(
      { error: 'Failed to list buildings', details: error.message },
      { status: 500 }
    );
  }
}