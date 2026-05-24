// components/admin-homes/cockpit/territory/cascade-types.ts
// W-COCKPIT P-B-2 Commit 2c: canonical types for the territory cascade.
//
// Imported by cascade-walker.ts AND TerritoryCascadeChart.tsx so there's a
// single source of truth for GeoCard shape and walker output types.
// Resolves F-DUPLICATED-GEOCARD-TYPE (walker had its own GeoCardLite).

export interface GeoCard {
  id: string
  agent_id: string
  scope: string
  area_id: string | null
  municipality_id: string | null
  community_id: string | null
  neighbourhood_id: string | null
  is_primary: boolean
  condo_access: boolean
  homes_access: boolean
  buildings_access: boolean
  buildings_mode: string
}

export type NodeState = 'ASSIGNED' | 'PHANTOM' | 'INHERITED'
export type SourceLevel = 'community' | 'municipality' | 'area' | 'tenant'
export type BadgeState = 'active' | 'inherited' | 'phantom'
