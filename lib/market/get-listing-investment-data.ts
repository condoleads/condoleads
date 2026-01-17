// lib/market/get-listing-investment-data.ts
// Fetches PSF data for investment analysis on property pages

import { createClient } from '@/lib/supabase/server'

interface InvestmentData {
  // Building PSF
  buildingSalePsf: number | null
  buildingLeasePsf: number | null
  buildingSaleCount: number
  buildingLeaseCount: number
  buildingSaleMin: number | null
  buildingSaleMax: number | null
  
  // Community PSF
  communitySalePsf: number | null
  communityLeasePsf: number | null
  communitySaleCount: number
  communityLeaseCount: number
  communityName: string | null
  
  // Municipality PSF
  municipalitySalePsf: number | null
  municipalityLeasePsf: number | null
  municipalitySaleCount: number
  municipalityLeaseCount: number
  municipalityName: string | null
  
  // Calculated for this listing
  listingPsf: number | null
  estimatedSqft: number | null
  estimatedMonthlyRent: number | null
  grossYield: number | null
  netYield: number | null
  yearsToRecover: number | null
  psfVsBuildingPct: number | null
  psfVsCommunityPct: number | null
  
  // Expense details for display
  monthlyMaintenance: number | null
  annualTax: number | null
  totalAnnualExpenses: number | null
}

// Parse living_area_range like "600-699" to midpoint
function parseSqftRange(range: string | null): number | null {
  if (!range) return null
  const match = range.match(/(\d+)-(\d+)/)
  if (match) {
    const low = parseInt(match[1])
    const high = parseInt(match[2])
    return Math.round((low + high) / 2)
  }
  const single = parseInt(range)
  return isNaN(single) ? null : single
}

export async function getListingInvestmentData(
  buildingId: string,
  listPrice: number | null,
  calculatedSqft: number | null,
  livingAreaRange: string | null,
  associationFee: number | string | null,
  taxAnnualAmount: number | string | null,
  transactionType: string
): Promise<InvestmentData> {
  
  const estimatedSqft = calculatedSqft || parseSqftRange(livingAreaRange)
  const supabase = createClient()
  
  // Parse fees (they come as strings from DB)
  const monthlyMaintenance = associationFee ? parseFloat(String(associationFee)) : null
  const annualTax = taxAnnualAmount ? parseFloat(String(taxAnnualAmount)) : null
  
  // 1. Fetch building PSF summary
  const { data: buildingPsf } = await supabase
    .from('building_psf_summary')
    .select('*')
    .eq('building_id', buildingId)
    .single()
  
  // 2. Get building's community_id
  const { data: building } = await supabase
    .from('buildings')
    .select('community_id')
    .eq('id', buildingId)
    .single()
  
  // 3. Get community and its municipality_id
  let communityPsf = null
  let communityName = null
  let municipalityId = null
  
  if (building?.community_id) {
    const { data: community } = await supabase
      .from('communities')
      .select('name, municipality_id')
      .eq('id', building.community_id)
      .single()
    
    communityName = community?.name || null
    municipalityId = community?.municipality_id || null
    
    // Get latest sale PSF for community
    const { data: commSale } = await supabase
      .from('psf_monthly_sale')
      .select('all_avg_psf, all_sample_size')
      .eq('community_id', building.community_id)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single()
    
    const { data: commLease } = await supabase
      .from('psf_monthly_lease')
      .select('all_avg_psf, all_sample_size')
      .eq('community_id', building.community_id)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single()
    
    communityPsf = {
      salePsf: commSale?.all_avg_psf ? parseFloat(commSale.all_avg_psf) : null,
      saleCount: commSale?.all_sample_size || 0,
      leasePsf: commLease?.all_avg_psf ? parseFloat(commLease.all_avg_psf) : null,
      leaseCount: commLease?.all_sample_size || 0
    }
  }
  
  // 4. Fetch municipality PSF
  let municipalityPsf = null
  let municipalityName = null
  
  if (municipalityId) {
    const { data: muni } = await supabase
      .from('municipalities')
      .select('name')
      .eq('id', municipalityId)
      .single()
    
    municipalityName = muni?.name || null
    
    const { data: muniSale } = await supabase
      .from('psf_monthly_sale')
      .select('all_avg_psf, all_sample_size')
      .eq('municipality_id', municipalityId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single()
    
    const { data: muniLease } = await supabase
      .from('psf_monthly_lease')
      .select('all_avg_psf, all_sample_size')
      .eq('municipality_id', municipalityId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .single()
    
    municipalityPsf = {
      salePsf: muniSale?.all_avg_psf ? parseFloat(muniSale.all_avg_psf) : null,
      saleCount: muniSale?.all_sample_size || 0,
      leasePsf: muniLease?.all_avg_psf ? parseFloat(muniLease.all_avg_psf) : null,
      leaseCount: muniLease?.all_sample_size || 0
    }
  }
  
  // 5. Calculate investment metrics
  const buildingSalePsf = buildingPsf?.sale_avg_psf ? parseFloat(buildingPsf.sale_avg_psf) : null
  const buildingLeasePsf = buildingPsf?.lease_avg_psf ? parseFloat(buildingPsf.lease_avg_psf) : null
  
  // Calculate listing's PSF
  const listingPsf = (listPrice && estimatedSqft) 
    ? Math.round(listPrice / estimatedSqft) 
    : null
  
  // Estimated monthly rent (building lease PSF × sqft)
  const estimatedMonthlyRent = (buildingLeasePsf && estimatedSqft)
    ? Math.round(buildingLeasePsf * estimatedSqft)
    : null
  
  // Calculate total annual expenses (maintenance × 12 + annual tax)
  const annualMaintenance = monthlyMaintenance ? monthlyMaintenance * 12 : 0
  const totalAnnualExpenses = annualMaintenance + (annualTax || 0)
  
  // Gross yield = (annual rent / purchase price) × 100
  const grossYield = (estimatedMonthlyRent && listPrice)
    ? parseFloat(((estimatedMonthlyRent * 12 / listPrice) * 100).toFixed(2))
    : null
  
  // Net yield = ((annual rent - total expenses) / purchase price) × 100
  const netYield = (estimatedMonthlyRent && listPrice)
    ? parseFloat((((estimatedMonthlyRent * 12 - totalAnnualExpenses) / listPrice) * 100).toFixed(2))
    : null
  
  // Years to recover = purchase price / annual rent
  const yearsToRecover = (estimatedMonthlyRent && listPrice)
    ? parseFloat((listPrice / (estimatedMonthlyRent * 12)).toFixed(1))
    : null
  
  // PSF comparison percentages
  const psfVsBuildingPct = (listingPsf && buildingSalePsf)
    ? parseFloat((((listingPsf - buildingSalePsf) / buildingSalePsf) * 100).toFixed(1))
    : null
  
  const psfVsCommunityPct = (listingPsf && communityPsf?.salePsf)
    ? parseFloat((((listingPsf - communityPsf.salePsf) / communityPsf.salePsf) * 100).toFixed(1))
    : null
  
  return {
    // Building
    buildingSalePsf,
    buildingLeasePsf,
    buildingSaleCount: buildingPsf?.sale_count || 0,
    buildingLeaseCount: buildingPsf?.lease_count || 0,
    buildingSaleMin: buildingPsf?.sale_min_psf ? parseFloat(buildingPsf.sale_min_psf) : null,
    buildingSaleMax: buildingPsf?.sale_max_psf ? parseFloat(buildingPsf.sale_max_psf) : null,
    
    // Community
    communitySalePsf: communityPsf?.salePsf || null,
    communityLeasePsf: communityPsf?.leasePsf || null,
    communitySaleCount: communityPsf?.saleCount || 0,
    communityLeaseCount: communityPsf?.leaseCount || 0,
    communityName,
    
    // Municipality
    municipalitySalePsf: municipalityPsf?.salePsf || null,
    municipalityLeasePsf: municipalityPsf?.leasePsf || null,
    municipalitySaleCount: municipalityPsf?.saleCount || 0,
    municipalityLeaseCount: municipalityPsf?.leaseCount || 0,
    municipalityName,
    
    // This listing
    listingPsf,
    estimatedSqft,
    estimatedMonthlyRent,
    grossYield,
    netYield,
    yearsToRecover,
    psfVsBuildingPct,
    psfVsCommunityPct,
    
    // Expense details
    monthlyMaintenance,
    annualTax,
    totalAnnualExpenses: totalAnnualExpenses > 0 ? totalAnnualExpenses : null
  }
}

export type { InvestmentData }

