// lib/market/get-building-analytics.ts
// Gets PSF and parking data at all geo levels for building page display

import { createClient } from '@/lib/supabase/server'
import { getAllEffectiveValues } from '@/lib/market-values/get-effective-value'

export interface PSFDataPoint {
  avg: number | null
  median: number | null
  sampleSize: number
  periodYear: number
  periodMonth: number
}

export interface GeoLevel {
  id: string
  name: string
  psf: PSFDataPoint | null
}

export interface BuildingMarketData {
  building: {
    id: string
    name: string
    psf: PSFDataPoint | null
  }
  community: GeoLevel | null
  municipality: GeoLevel | null
  area: GeoLevel | null
  parking: {
    sale: { value: number | null; level: string; source: string } | null
    lease: { value: number | null; level: string; source: string } | null
  }
  locker: {
    sale: { value: number | null; level: string; source: string } | null
    lease: { value: number | null; level: string; source: string } | null
  }
  hasData: boolean
}

export async function getBuildingMarketData(buildingId: string): Promise<BuildingMarketData> {
  const supabase = createClient()

  // Get building with geography chain
  const { data: building } = await supabase
    .from('buildings')
    .select('id, building_name, community_id')
    .eq('id', buildingId)
    .single()

  if (!building) {
    return {
      building: { id: buildingId, name: 'Unknown', psf: null },
      community: null,
      municipality: null,
      area: null,
      parking: { sale: null, lease: null },
      locker: { sale: null, lease: null },
      hasData: false
    }
  }

  // Get geography chain
  let communityId = building.community_id
  let communityName: string | null = null
  let municipalityId: string | null = null
  let municipalityName: string | null = null
  let areaId: string | null = null
  let areaName: string | null = null

  if (communityId) {
    const { data: community } = await supabase
      .from('communities')
      .select('id, name, municipality_id')
      .eq('id', communityId)
      .single()

    if (community) {
      communityName = community.name
      municipalityId = community.municipality_id

      if (municipalityId) {
        const { data: municipality } = await supabase
          .from('municipalities')
          .select('id, name, area_id')
          .eq('id', municipalityId)
          .single()

        if (municipality) {
          municipalityName = municipality.name
          areaId = municipality.area_id

          if (areaId) {
            const { data: area } = await supabase
              .from('treb_areas')
              .select('id, name')
              .eq('id', areaId)
              .single()

            if (area) {
              areaName = area.name
            }
          }
        }
      }
    }
  }

  // Get PSF data at all levels (latest period)
  const [buildingPsf, communityPsf, municipalityPsf, areaPsf] = await Promise.all([
    // Building level
    supabase
      .from('psf_monthly_sale')
      .select('all_avg_psf, all_median_psf, all_sample_size, period_year, period_month')
      .eq('building_id', buildingId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single(),
    
    // Community level
    communityId ? supabase
      .from('psf_monthly_sale')
      .select('all_avg_psf, all_median_psf, all_sample_size, period_year, period_month')
      .eq('community_id', communityId)
      .eq('geo_level', 'community')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single() : Promise.resolve({ data: null }),
    
    // Municipality level
    municipalityId ? supabase
      .from('psf_monthly_sale')
      .select('all_avg_psf, all_median_psf, all_sample_size, period_year, period_month')
      .eq('municipality_id', municipalityId)
      .eq('geo_level', 'municipality')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single() : Promise.resolve({ data: null }),
    
    // Area level
    areaId ? supabase
      .from('psf_monthly_sale')
      .select('all_avg_psf, all_median_psf, all_sample_size, period_year, period_month')
      .eq('area_id', areaId)
      .eq('geo_level', 'area')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single() : Promise.resolve({ data: null })
  ])

  // Get parking/locker values using existing function
  const effectiveValues = await getAllEffectiveValues(buildingId)

  // Build response
  const formatPsf = (data: any): PSFDataPoint | null => {
    if (!data) return null
    return {
      avg: data.all_avg_psf ? parseFloat(data.all_avg_psf) : null,
      median: data.all_median_psf ? parseFloat(data.all_median_psf) : null,
      sampleSize: data.all_sample_size || 0,
      periodYear: data.period_year,
      periodMonth: data.period_month
    }
  }

  const result: BuildingMarketData = {
    building: {
      id: building.id,
      name: building.building_name,
      psf: formatPsf(buildingPsf.data)
    },
    community: communityId ? {
      id: communityId,
      name: communityName || 'Unknown',
      psf: formatPsf(communityPsf.data)
    } : null,
    municipality: municipalityId ? {
      id: municipalityId,
      name: municipalityName || 'Unknown',
      psf: formatPsf(municipalityPsf.data)
    } : null,
    area: areaId ? {
      id: areaId,
      name: areaName || 'Unknown',
      psf: formatPsf(areaPsf.data)
    } : null,
    parking: {
      sale: effectiveValues.parkingSale.value ? {
        value: effectiveValues.parkingSale.value,
        level: effectiveValues.parkingSale.level,
        source: effectiveValues.parkingSale.source
      } : null,
      lease: effectiveValues.parkingLease.value ? {
        value: effectiveValues.parkingLease.value,
        level: effectiveValues.parkingLease.level,
        source: effectiveValues.parkingLease.source
      } : null
    },
    locker: {
      sale: effectiveValues.lockerSale.value ? {
        value: effectiveValues.lockerSale.value,
        level: effectiveValues.lockerSale.level,
        source: effectiveValues.lockerSale.source
      } : null,
      lease: effectiveValues.lockerLease.value ? {
        value: effectiveValues.lockerLease.value,
        level: effectiveValues.lockerLease.level,
        source: effectiveValues.lockerLease.source
      } : null
    },
    hasData: !!(buildingPsf.data || communityPsf.data || municipalityPsf.data || areaPsf.data)
  }

  return result
}

// Get PSF trend data (last 12 months) for charts
export async function getBuildingPSFTrend(buildingId: string, months: number = 12) {
  const supabase = createClient()

  // Get building's community
  const { data: building } = await supabase
    .from('buildings')
    .select('community_id')
    .eq('id', buildingId)
    .single()

  if (!building?.community_id) return { building: [], community: [], municipality: [] }

  // Get community's municipality
  const { data: community } = await supabase
    .from('communities')
    .select('municipality_id')
    .eq('id', building.community_id)
    .single()

  const [buildingTrend, communityTrend, municipalityTrend] = await Promise.all([
    // Building trend
    supabase
      .from('psf_monthly_sale')
      .select('period_year, period_month, all_avg_psf, all_sample_size')
      .eq('building_id', buildingId)
      .order('period_year', { ascending: true })
      .order('period_month', { ascending: true })
      .limit(months),
    
    // Community trend
    supabase
      .from('psf_monthly_sale')
      .select('period_year, period_month, all_avg_psf, all_sample_size')
      .eq('community_id', building.community_id)
      .eq('geo_level', 'community')
      .order('period_year', { ascending: true })
      .order('period_month', { ascending: true })
      .limit(months),
    
    // Municipality trend
    community?.municipality_id ? supabase
      .from('psf_monthly_sale')
      .select('period_year, period_month, all_avg_psf, all_sample_size')
      .eq('municipality_id', community.municipality_id)
      .eq('geo_level', 'municipality')
      .order('period_year', { ascending: true })
      .order('period_month', { ascending: true })
      .limit(months) : Promise.resolve({ data: [] })
  ])

  return {
    building: buildingTrend.data || [],
    community: communityTrend.data || [],
    municipality: municipalityTrend.data || []
  }
}