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
 * Building -> Community -> Municipality -> Area -> Generic -> Hardcoded
 * 
 * At each level: Manual Override > Calculated Value
 */
export async function resolveAdjustments(
  buildingId: string,
  type: 'sale' | 'lease'
): Promise<ResolvedAdjustments> {
  const supabase = createServiceClient()
  const defaults = type === 'sale' ? HARDCODED_DEFAULTS_SALE : HARDCODED_DEFAULTS_LEASE
  
  // Field names for manual and calculated
  const parkingManual = type === 'sale' ? 'parking_value_sale' : 'parking_value_lease'
  const parkingCalculated = type === 'sale' ? 'parking_sale_calculated' : 'parking_lease_calculated'
  const lockerManual = type === 'sale' ? 'locker_value_sale' : 'locker_value_lease'
  const lockerCalculated = type === 'sale' ? 'locker_sale_calculated' : 'locker_lease_calculated'

  try {
    // Get building with full hierarchy
    const { data: building, error: buildingError } = await supabase
      .from('buildings')
      .select(`
        id,
        building_name,
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

    // Fetch all relevant adjustments
    const { data: allAdjustments } = await supabase
      .from('adjustments')
      .select('*')

    // Filter relevant adjustments (exclude neighbourhood - not in TREB hierarchy)
    const relevantAdjustments = (allAdjustments || []).filter(adj => {
      if (adj.building_id === buildingId) return true
      if (communityId && adj.community_id === communityId && !adj.building_id) return true
      if (municipalityId && adj.municipality_id === municipalityId && !adj.community_id && !adj.building_id) return true
      if (areaId && adj.area_id === areaId && !adj.municipality_id && !adj.community_id && !adj.building_id) return true
      // Generic (all nulls except neighbourhood which we ignore)
      if (!adj.building_id && !adj.community_id && !adj.municipality_id && !adj.area_id) return true
      return false
    })

    // Organize by scope level
    const adjustmentsByLevel: Record<string, any> = {
      building: null,
      community: null,
      municipality: null,
      area: null,
      generic: null
    }

    relevantAdjustments.forEach(adj => {
      if (adj.building_id) adjustmentsByLevel.building = adj
      else if (adj.community_id) adjustmentsByLevel.community = adj
      else if (adj.municipality_id) adjustmentsByLevel.municipality = adj
      else if (adj.area_id) adjustmentsByLevel.area = adj
      else if (!adj.neighbourhood_id) adjustmentsByLevel.generic = adj // Exclude neighbourhood-only records
    })

    // Resolve with cascade: Manual > Calculated at each level
    const resolveField = (manualField: string, calculatedField: string): { value: number; source: string } => {
      const levels = ['building', 'community', 'municipality', 'area', 'generic']
      
      for (const level of levels) {
        const adj = adjustmentsByLevel[level]
        if (adj) {
          // Check manual first
          if (adj[manualField] !== null && adj[manualField] !== undefined) {
            return { 
              value: parseFloat(adj[manualField]), 
              source: `${level.charAt(0).toUpperCase() + level.slice(1)} (manual)` 
            }
          }
          // Then check calculated
          if (adj[calculatedField] !== null && adj[calculatedField] !== undefined) {
            return { 
              value: parseFloat(adj[calculatedField]), 
              source: `${level.charAt(0).toUpperCase() + level.slice(1)} (calculated)` 
            }
          }
        }
      }
      
      // Fallback to hardcoded
      const defaultVal = manualField.includes('parking') ? defaults.parkingPerSpace : defaults.locker
      return { value: defaultVal, source: 'Hardcoded' }
    }

    const parkingResolved = resolveField(parkingManual, parkingCalculated)
    const lockerResolved = resolveField(lockerManual, lockerCalculated)

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
