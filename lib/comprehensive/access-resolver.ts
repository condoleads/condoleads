import { createClient } from '@/lib/supabase/server';
import type { GeoAssignment, ResolvedAccess } from './types';

/**
 * Resolves an agent's geographic access for System 2 (Comprehensive Homepage).
 * Returns null if agent has no System 2 assignments (should use System 1 instead).
 *
 * T4a-3b (2026-05-08): added 'neighbourhood' case to switch (was silently
 * dropped pre-fix). Minimal fix matches existing 'community' propagation
 * pattern (parent ids only); downstream listing filtering remains community-
 * grained. Tighter neighbourhood-grained filtering would extend ResolvedAccess
 * with neighbourhoodIds + downstream filter -- a future T4d.
 */
export async function resolveAgentAccess(agentId: string): Promise<ResolvedAccess> {
  const supabase = createClient();
  // 1. Fetch all active assignments
  const { data: assignments, error } = await supabase
    .from('agent_property_access')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_active', true);

  console.log('[resolveAgentAccess] Query result:', { count: assignments?.length, error: error?.message });
  if (error || !assignments || assignments.length === 0) {
    // W-HOMEPAGE-ERROR UNIT 44 (2026-06-28): decouple "agent has assignments"
    // from "homepage can render". Previously this returned null, causing
    // HomePageComprehensive*.tsx to render `<div>Access configuration error</div>`
    // to public visitors of any tenant whose default_agent_id had zero apa
    // rows (live symptom on aily.ca/ since the seed-admin -> Ovais promotion
    // didn't carry over apa rows). The customer surface is decoupled by
    // defaulting to the same shape a `scope='all'` row would produce
    // (isAllMLS: true, all categories on, empty geo). Misconfiguration stays
    // VISIBLE to operators via the structured warn below — not silenced.
    // No per-tenant branching: any tenant whose homepage agent has zero rows
    // gets the same graceful default + the same operator-facing warn.
    console.warn('[resolveAgentAccess] zero active apa rows; defaulting to all-MLS', {
      agent_id: agentId,
      error: error?.message ?? null,
    });
    return {
      hasAccess: true,
      isAllMLS: true,
      assignments: [],
      areaIds: [],
      municipalityIds: [],
      communityIds: [],
      buildings_access: true,
      condo_access: true,
      homes_access: true,
    };
  }

  // 2. Check for "ALL" scope (entire MLS)
  const allScope = assignments.find(a => a.scope === 'all');
  if (allScope) {
    return {
      hasAccess: true,
      isAllMLS: true,
      assignments: assignments as GeoAssignment[],
      areaIds: [],
      municipalityIds: [],
      communityIds: [],
      buildings_access: allScope.buildings_access,
      condo_access: allScope.condo_access,
      homes_access: allScope.homes_access,
    };
  }

  // 3. Expand geography - collect all IDs
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

      // T4a-3b: F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix.
      // Neighbourhood-scope rows used to fall through this switch silently.
      // Minimal fix: propagate to parent community/muni/area (matches the
      // existing 'community' case shape). Downstream filter is community-
      // grained today; tighter neighbourhood narrowing is a future T4d.
      case 'neighbourhood':
        if (assignment.neighbourhood_id) {
          if (assignment.community_id) communityIds.add(assignment.community_id);
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
 * Lighter than full resolveAgentAccess - just checks existence.
 */
export async function hasComprehensiveAccess(agentId: string): Promise<boolean> {
  const supabase = createClient();
  console.log('[System2] Checking comprehensive access for agent:', agentId);
  const { count, error } = await supabase
    .from('agent_property_access')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('is_active', true);

  console.log('[System2] Access check result:', { count, error: error?.message });
  return !error && (count ?? 0) > 0;
}
