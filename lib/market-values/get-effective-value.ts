// lib/market-values/get-effective-value.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ValueType = 'parking_lease' | 'locker_lease' | 'parking_sale' | 'locker_sale'

interface EffectiveValue {
  value: number | null
  source: 'manual' | 'calculated' | 'inherited'
  level: 'building' | 'community' | 'municipality' | 'area' | 'generic'
  levelName: string
  recordCount: number | null
}

// Get manual and calculated field names
function getFieldNames(type: ValueType) {
  const mapping = {
    parking_lease: { manual: 'parking_value_lease', calculated: 'parking_lease_calculated', count: 'parking_lease_count' },
    locker_lease: { manual: 'locker_value_lease', calculated: 'locker_lease_calculated', count: 'locker_lease_count' },
    parking_sale: { manual: 'parking_value_sale', calculated: 'parking_sale_calculated', count: 'parking_sale_count' },
    locker_sale: { manual: 'locker_value_sale', calculated: 'locker_sale_calculated', count: 'locker_sale_count' }
  }
  return mapping[type]
}

// Get effective value with fallback hierarchy: Building → Community → Municipality → Area → Generic
export async function getEffectiveValue(
  buildingId: string,
  type: ValueType
): Promise<EffectiveValue> {
  const fields = getFieldNames(type)
  
  // Get building's geographic info
  const { data: building } = await supabase
    .from('buildings')
    .select('id, building_name, community_id')
    .eq('id', buildingId)
    .single()

  if (!building) {
    return { value: null, source: 'inherited', level: 'generic', levelName: 'Not Found', recordCount: null }
  }

  // Get community and its parent hierarchy
  let communityId = building.community_id
  let municipalityId: string | null = null
  let areaId: string | null = null

  if (communityId) {
    const { data: community } = await supabase
      .from('communities')
      .select('id, name, municipality_id')
      .eq('id', communityId)
      .single()

    if (community) {
      municipalityId = community.municipality_id

      const { data: municipality } = await supabase
        .from('municipalities')
        .select('id, name, area_id')
        .eq('id', municipalityId)
        .single()

      if (municipality) {
        areaId = municipality.area_id
      }
    }
  }

  // Priority 1: Building level
  const { data: buildingAdj } = await supabase
    .from('adjustments')
    .select('*')
    .eq('building_id', buildingId)
    .single()

  if (buildingAdj) {
    if (buildingAdj[fields.manual] !== null) {
      return {
        value: buildingAdj[fields.manual],
        source: 'manual',
        level: 'building',
        levelName: building.building_name || 'Building',
        recordCount: null
      }
    }
    if (buildingAdj[fields.calculated] !== null) {
      return {
        value: buildingAdj[fields.calculated],
        source: 'calculated',
        level: 'building',
        levelName: building.building_name || 'Building',
        recordCount: buildingAdj[fields.count]
      }
    }
  }

  // Priority 2: Community level
  if (communityId) {
    const { data: communityAdj } = await supabase
      .from('adjustments')
      .select('*')
      .eq('community_id', communityId)
      .is('building_id', null)
      .single()

    if (communityAdj) {
      if (communityAdj[fields.manual] !== null) {
        return {
          value: communityAdj[fields.manual],
          source: 'manual',
          level: 'community',
          levelName: 'Community',
          recordCount: null
        }
      }
      if (communityAdj[fields.calculated] !== null) {
        return {
          value: communityAdj[fields.calculated],
          source: 'calculated',
          level: 'community',
          levelName: 'Community',
          recordCount: communityAdj[fields.count]
        }
      }
    }
  }

  // Priority 3: Municipality level
  if (municipalityId) {
    const { data: muniAdj } = await supabase
      .from('adjustments')
      .select('*')
      .eq('municipality_id', municipalityId)
      .is('community_id', null)
      .is('building_id', null)
      .single()

    if (muniAdj) {
      if (muniAdj[fields.manual] !== null) {
        return {
          value: muniAdj[fields.manual],
          source: 'manual',
          level: 'municipality',
          levelName: 'Municipality',
          recordCount: null
        }
      }
      if (muniAdj[fields.calculated] !== null) {
        return {
          value: muniAdj[fields.calculated],
          source: 'calculated',
          level: 'municipality',
          levelName: 'Municipality',
          recordCount: muniAdj[fields.count]
        }
      }
    }
  }

  // Priority 4: Area level
  if (areaId) {
    const { data: areaAdj } = await supabase
      .from('adjustments')
      .select('*')
      .eq('area_id', areaId)
      .is('municipality_id', null)
      .is('community_id', null)
      .is('building_id', null)
      .single()

    if (areaAdj) {
      if (areaAdj[fields.manual] !== null) {
        return {
          value: areaAdj[fields.manual],
          source: 'manual',
          level: 'area',
          levelName: 'Area',
          recordCount: null
        }
      }
      if (areaAdj[fields.calculated] !== null) {
        return {
          value: areaAdj[fields.calculated],
          source: 'calculated',
          level: 'area',
          levelName: 'Area',
          recordCount: areaAdj[fields.count]
        }
      }
    }
  }

  // Priority 5: Generic default
  const { data: genericAdj } = await supabase
    .from('adjustments')
    .select('*')
    .is('area_id', null)
    .is('municipality_id', null)
    .is('community_id', null)
    .is('building_id', null)
    .single()

  if (genericAdj) {
    if (genericAdj[fields.manual] !== null) {
      return {
        value: genericAdj[fields.manual],
        source: 'manual',
        level: 'generic',
        levelName: 'Default',
        recordCount: null
      }
    }
    if (genericAdj[fields.calculated] !== null) {
      return {
        value: genericAdj[fields.calculated],
        source: 'calculated',
        level: 'generic',
        levelName: 'Default',
        recordCount: genericAdj[fields.count]
      }
    }
  }

  // No value found
  return { value: null, source: 'inherited', level: 'generic', levelName: 'None', recordCount: null }
}

// Get all 4 values at once for a building
export async function getAllEffectiveValues(buildingId: string) {
  const [parkingLease, lockerLease, parkingSale, lockerSale] = await Promise.all([
    getEffectiveValue(buildingId, 'parking_lease'),
    getEffectiveValue(buildingId, 'locker_lease'),
    getEffectiveValue(buildingId, 'parking_sale'),
    getEffectiveValue(buildingId, 'locker_sale')
  ])

  return {
    parkingLease,
    lockerLease,
    parkingSale,
    lockerSale
  }
}
