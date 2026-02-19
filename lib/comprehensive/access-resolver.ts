import { createClient } from '@supabase/supabase-js';
import type { GeoAssignment, ResolvedAccess } from './types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Resolves an agent's geographic access for System 2 (Comprehensive Homepage).
 * Returns null if agent has no System 2 assignments (should use System 1 instead).
 */
export async function resolveAgentAccess(agentId: string): Promise<ResolvedAccess | null> {
  // 1. Fetch all active assignments
  const { data: assignments, error } = await supabase
    .from('agent_property_access')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_active', true);

  if (error || !assignments || assignments.length === 0) {
    return null; // No System 2 access  use System 1
  }

  // 2. Check for "ALL" scope (entire MLS)
  const allScope = assignments.find(a => a.scope === 'all');
  if (allScope) {
    return {
      hasAccess: true,
      isAllMLS: true,
      assignments: assignments as GeoAssignment[],
      areaIds: [],        // Empty = no filter (all)
      municipalityIds: [],
      communityIds: [],
      buildings_access: allScope.buildings_access,
      condo_access: allScope.condo_access,
      homes_access: allScope.homes_access,
    };
  }

  // 3. Expand geography  collect all IDs
  const areaIds = new Set<string>();
  const municipalityIds = new Set<string>();
  const communityIds = new Set<string>();
  let buildings_access = false;
  let condo_access = false;
  let homes_access = false;

  for (const assignment of assignments) {
    // Merge category access (most permissive wins)
    if (assignment.buildings_access) buildings_access = true;
    if (assignment.condo_access) condo_access = true;
    if (assignment.homes_access) homes_access = true;

    switch (assignment.scope) {
      case 'area':
        if (assignment.area_id) {
          areaIds.add(assignment.area_id);
          // Expand: get all municipalities in this area
          const { data: munis } = await supabase
            .from('municipalities')
            .select('id')
            .eq('area_id', assignment.area_id);
          munis?.forEach(m => municipalityIds.add(m.id));
          // Expand: get all communities in those municipalities
          if (munis && munis.length > 0) {
            const { data: comms } = await supabase
              .from('communities')
              .select('id')
              .in('municipality_id', munis.map(m => m.id));
            comms?.forEach(c => communityIds.add(c.id));
          }
        }
        break;

      case 'municipality':
        if (assignment.municipality_id) {
          municipalityIds.add(assignment.municipality_id);
          if (assignment.area_id) areaIds.add(assignment.area_id);
          // Expand: get all communities in this municipality
          const { data: comms } = await supabase
            .from('communities')
            .select('id')
            .eq('municipality_id', assignment.municipality_id);
          comms?.forEach(c => communityIds.add(c.id));
        }
        break;

      case 'community':
        if (assignment.community_id) {
          communityIds.add(assignment.community_id);
          if (assignment.municipality_id) municipalityIds.add(assignment.municipality_id);
          if (assignment.area_id) areaIds.add(assignment.area_id);
        }
        break;
    }
  }

  return {
    hasAccess: true,
    isAllMLS: false,
    assignments: assignments as GeoAssignment[],
    areaIds: Array.from(areaIds),
    municipalityIds: Array.from(municipalityIds),
    communityIds: Array.from(communityIds),
    buildings_access,
    condo_access,
    homes_access,
  };
}

/**
 * Quick check: does this agent use System 2?
 * Lighter than full resolveAgentAccess  just checks existence.
 */
export async function hasComprehensiveAccess(agentId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('agent_property_access')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('is_active', true);

  return !error && (count ?? 0) > 0;
}
