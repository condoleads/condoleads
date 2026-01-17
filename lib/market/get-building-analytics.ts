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

export interface GeoLevelData {
  id: string
  name: string
  salePsf: PSFDataPoint | null
  leasePsf: PSFDataPoint | null
}

export interface BuildingSummary {
  saleAvgPsf: number | null
  saleMedianPsf: number | null
  saleCount: number
  leaseAvgPsf: number | null
  leaseMedianPsf: number | null
  leaseCount: number
  earliestTransaction: string | null
  latestTransaction: string | null
}

export interface Transaction {
  id: string
  transaction_type: 'sale' | 'lease'
  close_date: string
  close_price: number
  sqft: number
  sqft_method: string
  psf: number
  has_parking: boolean
  parking_spaces: number
  living_area_range: string | null
}

export interface InvestmentMetrics {
  buildingGrossYield: number | null
  buildingNetYield: number | null
  buildingAvgMaintenance: number | null
  buildingAvgTax: number | null
  buildingAvgSqft: number | null
  communityGrossYield: number | null
  municipalityGrossYield: number | null
  yieldVsCommunity: number | null
  yieldVsMunicipality: number | null
}

export interface BuildingMarketData {
  building: {
    id: string
    name: string
    salePsf: PSFDataPoint | null
    leasePsf: PSFDataPoint | null
    summary: BuildingSummary | null
    transactions: Transaction[]
  }
  community: GeoLevelData | null
  municipality: GeoLevelData | null
  area: GeoLevelData | null
  parking: {
    sale: { value: number | null; level: string; source: string } | null
    lease: { value: number | null; level: string; source: string } | null
  }
  locker: {
    sale: { value: number | null; level: string; source: string } | null
    lease: { value: number | null; level: string; source: string } | null
  }
  investment: InvestmentMetrics | null
  hasData: boolean
}

// Legacy interface for backward compatibility
export interface LegacyMarketData {
  building: { id: string; name: string; psf: PSFDataPoint | null }
  community: { id: string; name: string; psf: PSFDataPoint | null } | null
  municipality: { id: string; name: string; psf: PSFDataPoint | null } | null
  area: { id: string; name: string; psf: PSFDataPoint | null } | null
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
      building: { id: buildingId, name: 'Unknown', salePsf: null, leasePsf: null, summary: null, transactions: [] },
      community: null,
      municipality: null,
      area: null,
      parking: { sale: null, lease: null },
      locker: { sale: null, lease: null },
      investment: null,
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

  // Fetch all data in parallel
  const [
    buildingSummary,
    buildingTransactions,
    communitySalePsf,
    communityLeasePsf,
    municipalitySalePsf,
    municipalityLeasePsf,
    areaSalePsf,
    areaLeasePsf,
    effectiveValues,
    buildingExpenses
  ] = await Promise.all([
    // Building summary from building_psf_summary
    supabase
      .from('building_psf_summary')
      .select('*')
      .eq('building_id', buildingId)
      .single(),

    // Building transactions from building_psf_transactions
    supabase
      .from('building_psf_transactions')
      .select('*')
      .eq('building_id', buildingId)
      .order('close_date', { ascending: false }),

    // Community sale PSF
    communityId ? supabase
      .from('psf_monthly_sale')
      .select('all_avg_psf, all_median_psf, all_sample_size, period_year, period_month')
      .eq('community_id', communityId)
      .eq('geo_level', 'community')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single() : Promise.resolve({ data: null }),

    // Community lease PSF
    communityId ? supabase
      .from('psf_monthly_lease')
      .select('all_avg_psf, all_median_psf, all_sample_size, period_year, period_month')
      .eq('community_id', communityId)
      .eq('geo_level', 'community')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single() : Promise.resolve({ data: null }),

    // Municipality sale PSF
    municipalityId ? supabase
      .from('psf_monthly_sale')
      .select('all_avg_psf, all_median_psf, all_sample_size, period_year, period_month')
      .eq('municipality_id', municipalityId)
      .eq('geo_level', 'municipality')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single() : Promise.resolve({ data: null }),

    // Municipality lease PSF
    municipalityId ? supabase
      .from('psf_monthly_lease')
      .select('all_avg_psf, all_median_psf, all_sample_size, period_year, period_month')
      .eq('municipality_id', municipalityId)
      .eq('geo_level', 'municipality')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single() : Promise.resolve({ data: null }),

    // Area sale PSF
    areaId ? supabase
      .from('psf_monthly_sale')
      .select('all_avg_psf, all_median_psf, all_sample_size, period_year, period_month')
      .eq('area_id', areaId)
      .eq('geo_level', 'area')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single() : Promise.resolve({ data: null }),

    // Area lease PSF
    areaId ? supabase
      .from('psf_monthly_lease')
      .select('all_avg_psf, all_median_psf, all_sample_size, period_year, period_month')
      .eq('area_id', areaId)
      .eq('geo_level', 'area')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single() : Promise.resolve({ data: null }),

    // Parking/locker values
    getAllEffectiveValues(buildingId),

    // Building average expenses (for investment yield calculation)
    supabase
      .from('mls_listings')
      .select('association_fee, tax_annual_amount, calculated_sqft, living_area_range')
      .eq('building_id', buildingId)
      .not('association_fee', 'is', null)
  ])

  // Format PSF data
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

  // Format building summary
  const formatSummary = (data: any): BuildingSummary | null => {
    if (!data) return null
    return {
      saleAvgPsf: data.sale_avg_psf ? parseFloat(data.sale_avg_psf) : null,
      saleMedianPsf: data.sale_median_psf ? parseFloat(data.sale_median_psf) : null,
      saleCount: data.sale_count || 0,
      leaseAvgPsf: data.lease_avg_psf ? parseFloat(data.lease_avg_psf) : null,
      leaseMedianPsf: data.lease_median_psf ? parseFloat(data.lease_median_psf) : null,
      leaseCount: data.lease_count || 0,
      earliestTransaction: data.earliest_transaction,
      latestTransaction: data.latest_transaction
    }
  }

  // Format transactions
  const formatTransactions = (data: any[]): Transaction[] => {
    if (!data) return []
    return data.map(t => ({
      id: t.id,
      transaction_type: t.transaction_type,
      close_date: t.close_date,
      close_price: t.close_price ? parseFloat(t.close_price) : 0,
      sqft: t.sqft || 0,
      sqft_method: t.sqft_method || 'unknown',
      psf: t.psf ? parseFloat(t.psf) : 0,
      has_parking: t.has_parking || false,
      parking_spaces: t.parking_spaces || 0,
      living_area_range: t.living_area_range
    }))
  }

  // Build summary-based PSF for building (since we don't have monthly building data in psf_monthly tables)
  const buildingSalePsf: PSFDataPoint | null = buildingSummary.data?.sale_avg_psf ? {
    avg: parseFloat(buildingSummary.data.sale_avg_psf),
    median: buildingSummary.data.sale_median_psf ? parseFloat(buildingSummary.data.sale_median_psf) : null,
    sampleSize: buildingSummary.data.sale_count || 0,
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1
  } : null

  const buildingLeasePsf: PSFDataPoint | null = buildingSummary.data?.lease_avg_psf ? {
    avg: parseFloat(buildingSummary.data.lease_avg_psf),
    median: buildingSummary.data.lease_median_psf ? parseFloat(buildingSummary.data.lease_median_psf) : null,
    sampleSize: buildingSummary.data.lease_count || 0,
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1
  } : null

  // Calculate investment metrics
  const calculateInvestmentMetrics = (): InvestmentMetrics | null => {
    const buildingSalePsfVal = buildingSummary.data?.sale_avg_psf ? parseFloat(buildingSummary.data.sale_avg_psf) : null
    const buildingLeasePsfVal = buildingSummary.data?.lease_avg_psf ? parseFloat(buildingSummary.data.lease_avg_psf) : null
    
    const expenseData = buildingExpenses.data || []
    let avgMaintenance: number | null = null
    let avgTax: number | null = null
    let avgSqft: number | null = null
    
    if (expenseData.length > 0) {
      const maintVals = expenseData.map(e => e.association_fee ? parseFloat(e.association_fee) : null).filter((v): v is number => v !== null)
      const taxVals = expenseData.map(e => e.tax_annual_amount ? parseFloat(e.tax_annual_amount) : null).filter((v): v is number => v !== null)
      const sqftVals = expenseData.map(e => {
        if (e.calculated_sqft) return parseFloat(e.calculated_sqft)
        if (e.living_area_range) {
          const m = e.living_area_range.match(/(\d+)-(\d+)/)
          if (m) return (parseInt(m[1]) + parseInt(m[2])) / 2
        }
        return null
      }).filter((v): v is number => v !== null)
      
      if (maintVals.length > 0) avgMaintenance = maintVals.reduce((a, b) => a + b, 0) / maintVals.length
      if (taxVals.length > 0) avgTax = taxVals.reduce((a, b) => a + b, 0) / taxVals.length
      if (sqftVals.length > 0) avgSqft = sqftVals.reduce((a, b) => a + b, 0) / sqftVals.length
    }
    
    let buildingGrossYield: number | null = null
    if (buildingSalePsfVal && buildingLeasePsfVal) {
      buildingGrossYield = (buildingLeasePsfVal * 12 / buildingSalePsfVal) * 100
    }
    
    let buildingNetYield: number | null = null
    if (buildingSalePsfVal && buildingLeasePsfVal && avgSqft) {
      const annualRent = buildingLeasePsfVal * avgSqft * 12
      const annualExp = (avgMaintenance || 0) * 12 + (avgTax || 0)
      const price = buildingSalePsfVal * avgSqft
      if (price > 0) buildingNetYield = ((annualRent - annualExp) / price) * 100
    }
    
    const commSalePsf = communitySalePsf.data?.all_avg_psf ? parseFloat(communitySalePsf.data.all_avg_psf) : null
    const commLeasePsf = communityLeasePsf.data?.all_avg_psf ? parseFloat(communityLeasePsf.data.all_avg_psf) : null
    let communityGrossYield: number | null = null
    if (commSalePsf && commLeasePsf) communityGrossYield = (commLeasePsf * 12 / commSalePsf) * 100
    
    const muniSalePsf = municipalitySalePsf.data?.all_avg_psf ? parseFloat(municipalitySalePsf.data.all_avg_psf) : null
    const muniLeasePsf = municipalityLeasePsf.data?.all_avg_psf ? parseFloat(municipalityLeasePsf.data.all_avg_psf) : null
    let municipalityGrossYield: number | null = null
    if (muniSalePsf && muniLeasePsf) municipalityGrossYield = (muniLeasePsf * 12 / muniSalePsf) * 100
    
    const yieldVsCommunity = buildingGrossYield && communityGrossYield ? buildingGrossYield - communityGrossYield : null
    const yieldVsMunicipality = buildingGrossYield && municipalityGrossYield ? buildingGrossYield - municipalityGrossYield : null
    
    if (!buildingGrossYield) return null
    
    return {
      buildingGrossYield: parseFloat(buildingGrossYield.toFixed(2)),
      buildingNetYield: buildingNetYield ? parseFloat(buildingNetYield.toFixed(2)) : null,
      buildingAvgMaintenance: avgMaintenance ? parseFloat(avgMaintenance.toFixed(0)) : null,
      buildingAvgTax: avgTax ? parseFloat(avgTax.toFixed(0)) : null,
      buildingAvgSqft: avgSqft ? parseFloat(avgSqft.toFixed(0)) : null,
      communityGrossYield: communityGrossYield ? parseFloat(communityGrossYield.toFixed(2)) : null,
      municipalityGrossYield: municipalityGrossYield ? parseFloat(municipalityGrossYield.toFixed(2)) : null,
      yieldVsCommunity: yieldVsCommunity ? parseFloat(yieldVsCommunity.toFixed(2)) : null,
      yieldVsMunicipality: yieldVsMunicipality ? parseFloat(yieldVsMunicipality.toFixed(2)) : null
    }
  }

  const investmentMetrics = calculateInvestmentMetrics()


  const result: BuildingMarketData = {
    building: {
      id: building.id,
      name: building.building_name,
      salePsf: buildingSalePsf,
      leasePsf: buildingLeasePsf,
      summary: formatSummary(buildingSummary.data),
      transactions: formatTransactions(buildingTransactions.data || [])
    },
    community: communityId ? {
      id: communityId,
      name: communityName || 'Unknown',
      salePsf: formatPsf(communitySalePsf.data),
      leasePsf: formatPsf(communityLeasePsf.data)
    } : null,
    municipality: municipalityId ? {
      id: municipalityId,
      name: municipalityName || 'Unknown',
      salePsf: formatPsf(municipalitySalePsf.data),
      leasePsf: formatPsf(municipalityLeasePsf.data)
    } : null,
    area: areaId ? {
      id: areaId,
      name: areaName || 'Unknown',
      salePsf: formatPsf(areaSalePsf.data),
      leasePsf: formatPsf(areaLeasePsf.data)
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
    investment: investmentMetrics,
    hasData: !!(buildingSummary.data || communitySalePsf.data || municipalitySalePsf.data || areaSalePsf.data)
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