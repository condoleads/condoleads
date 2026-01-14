// lib/estimator/resolve-adjustments.ts
import { createClient as createServerClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface ResolvedAdjustments {
  parkingPerSpace: number
  locker: number
  sources: {
    parking: string
    locker: string
  }
}

// Default fallbacks (used if nothing in database)
const HARDCODED_DEFAULTS_SALE = {
  parkingPerSpace: 50000,
  locker: 10000
}

const HARDCODED_DEFAULTS_LEASE = {
  parkingPerSpace: 200,
  locker: 50
}

/**
 * Resolves adjustment values using hierarchy cascade:
 * Building (direct fields) -> Building (adjustments) -> Community -> Neighbourhood -> Municipality -> Area -> Generic -> Hardcoded
 */
export async function resolveAdjustments(
  buildingId: string,
  type: 'sale' | 'lease'
): Promise<ResolvedAdjustments> {
  const supabase = createServiceClient()
  const defaults = type === 'sale' ? HARDCODED_DEFAULTS_SALE : HARDCODED_DEFAULTS_LEASE
  const parkingField = type === 'sale' ? 'parking_value_sale' : 'parking_value_lease'
  const lockerField = type === 'sale' ? 'locker_value_sale' : 'locker_value_lease'

  try {
    // Get building with full hierarchy
    const { data: building, error: buildingError } = await supabase
      .from('buildings')
      .select(`
        id,
        building_name,
        parking_value_sale,
        parking_value_lease,
        locker_value_sale,
        locker_value_lease,
        community_id,
        communities (
          id,
          name,
          municipality_id,
          municipalities (
            id,
            name,
            code,
            area_id
          )
        )
      `)
      .eq('id', buildingId)
      .single()

    if (buildingError || !building) {
      console.log('[resolveAdjustments] Building not found, using hardcoded defaults')
      return {
        parkingPerSpace: defaults.parkingPerSpace,
        locker: defaults.locker,
        sources: { parking: 'Hardcoded', locker: 'Hardcoded' }
      }
    }

    const community = building.communities as any
    const municipality = community?.municipalities
    const areaId = municipality?.area_id
    const municipalityId = municipality?.id
    const communityId = community?.id

    // Get neighbourhood for this municipality
    let neighbourhoodId = null
    if (municipalityId) {
      const { data: neighbourhoodMapping } = await supabase
        .from('municipality_neighbourhoods')
        .select('neighbourhood_id')
        .eq('municipality_id', municipalityId)
        .single()
      neighbourhoodId = neighbourhoodMapping?.neighbourhood_id
    }

    // Fetch all adjustments from the table
    const { data: allAdjustments } = await supabase
      .from('adjustments')
      .select('*')

    // Filter relevant adjustments
    const relevantAdjustments = (allAdjustments || []).filter(adj => {
      if (adj.building_id === buildingId) return true
      if (communityId && adj.community_id === communityId) return true
      if (neighbourhoodId && adj.neighbourhood_id === neighbourhoodId) return true
      if (municipalityId && adj.municipality_id === municipalityId) return true
      if (areaId && adj.area_id === areaId) return true
      // Generic (all nulls)
      if (!adj.building_id && !adj.community_id && !adj.neighbourhood_id && !adj.municipality_id && !adj.area_id) return true
      return false
    })

    // Organize by scope level
    const adjustmentsByLevel: Record<string, any> = {
      building: null,
      community: null,
      neighbourhood: null,
      municipality: null,
      area: null,
      generic: null
    }

    relevantAdjustments.forEach(adj => {
      if (adj.building_id) adjustmentsByLevel.building = adj
      else if (adj.community_id) adjustmentsByLevel.community = adj
      else if (adj.neighbourhood_id) adjustmentsByLevel.neighbourhood = adj
      else if (adj.municipality_id) adjustmentsByLevel.municipality = adj
      else if (adj.area_id) adjustmentsByLevel.area = adj
      else adjustmentsByLevel.generic = adj
    })

    // Building's own fields override everything
    const buildingOverrides: Record<string, any> = {
      [parkingField]: building[parkingField as keyof typeof building],
      [lockerField]: building[lockerField as keyof typeof building]
    }

    // Resolve with cascade
    const resolveField = (field: string): { value: number; source: string } => {
      // First check building's own fields
      if (buildingOverrides[field] !== null && buildingOverrides[field] !== undefined) {
        return { value: buildingOverrides[field] as number, source: 'Building (direct)' }
      }
      // Then cascade through adjustment levels
      const levels = ['building', 'community', 'neighbourhood', 'municipality', 'area', 'generic']
      for (const level of levels) {
        const adj = adjustmentsByLevel[level]
        if (adj && adj[field] !== null && adj[field] !== undefined) {
          return { value: parseFloat(adj[field]), source: level.charAt(0).toUpperCase() + level.slice(1) }
        }
      }
      // Fallback to hardcoded
      const defaultVal = field.includes('parking') ? defaults.parkingPerSpace : defaults.locker
      return { value: defaultVal, source: 'Hardcoded' }
    }

    const parkingResolved = resolveField(parkingField)
    const lockerResolved = resolveField(lockerField)

    console.log(`[resolveAdjustments] ${type} - Parking: $${parkingResolved.value} (${parkingResolved.source}), Locker: $${lockerResolved.value} (${lockerResolved.source})`)

    return {
      parkingPerSpace: parkingResolved.value,
      locker: lockerResolved.value,
      sources: {
        parking: parkingResolved.source,
        locker: lockerResolved.source
      }
    }
  } catch (error) {
    console.error('[resolveAdjustments] Error:', error)
    return {
      parkingPerSpace: defaults.parkingPerSpace,
      locker: defaults.locker,
      sources: { parking: 'Hardcoded (error)', locker: 'Hardcoded (error)' }
    }
  }
}
